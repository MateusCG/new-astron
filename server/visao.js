// Visão do time (névoa de guerra estilo MOBA), o filtro do servidor.
//
// O servidor só manda a um jogador o que ALGUM aliado enxerga (CONTRATO-MAPA-STAGE6,
// "Visão / fog"). Os olhos de cada time são as naves de jogador vivas (VISAO_RAIO,
// 550 m: a arma de maior alcance do jogo vai a 548 m), os mineradores e as escoltas
// (VISAO_MINERADOR, 300 m), as torres sentinela de pé (VISAO_TORRETA, 560 m) e a base
// (VISAO_BASE, o bolsão). A regra de cada linha de visão (raio, rocha e mineradora no
// meio, campo de asteroides) é a de shared/visao.js, a mesma com que o cliente
// desenha a névoa (public/js/nevoa.js).
//
// O que passa pelo filtro (snapshotPara em server/game.js chama os métodos daqui):
// - entidades: as do próprio time sempre vão; as do outro time e as neutras
//   (monstros, chefes, sonda, núcleo: tudo sem o time de quem recebe) só se algum
//   olho do time as vê. A camuflagem continua por cima (game.js, #ocultosPara);
// - minas e teleguiados: do próprio time sempre; dos outros, pela posição;
// - eventos com posição: os que envolvem o jogador (autor ou alvo: dono, por, alvo,
//   a nave do efeito) ou alguém do time dele sempre vão; os outros, pela posição.
//   O 'tiro' vai também se o caminho reto dele (amostrado ao longo da vida) passa
//   pela visão do time: um tiro que sai da névoa e entra na sua visão aparece (como
//   num MOBA). Todo tiro anunciado a um time fica anotado, e o 'fim' e o 'acerto'
//   dele chegam a esse time (o cliente apaga o desenho), onde quer que caiam; o
//   'fim' no campo de força de uma base (`campo`) vai também a quem vê o ponto;
//   - 'morte' de jogador fora da visão vai SEM a posição (o placar de abates é
//     público; o cliente não desenha a explosão); de monstro, minerador e escolta, não
//     vai;
//   - 'recall' de outro time: só o 'chegou', sem a ponta (de onde saiu ou aonde
//     chegou) que o time não vê;
//   - eventos privados (PRIVADOS, campo `para`: o 'ganho' do abate de monstro) só
//     para o próprio jogador, nunca para o time;
//   - eventos de jogo sem lugar (entrou, saiu, partida, nivel, nave, melhoria,
//     objetivo, entrega, torreta...) e os que não têm x/z vão para todos.
// - construções, torretas, `obj`, placar e a lista de jogadores não passam por aqui:
//   são públicos.
//
// Custo: os olhos e a visibilidade das entidades são contados uma vez por time e por
// tick (cache), não por jogador; o teste caro (bloqueiaVisao, ~0,3 µs) só roda para
// quem está dentro do raio de algum olho. O que é de cada jogador (autor/alvo) é só
// uma olhada nos ids do evento.

import { BASES } from '../shared/terrain.js';
import { VISAO_RAIO, VISAO_TORRETA, VISAO_MINERADOR, olho, olhosDaBase, algumOlhoVe } from '../shared/visao.js';

/** Amostras do caminho reto de um tiro para ver se ele entra na visão do time. */
const AMOSTRAS_TIRO = 6;
/** De quantos em quantos ticks os tiros anunciados que já saíram do mundo são esquecidos. */
const LIMPAR_ANUNCIADOS_TICKS = 150;

/** Eventos de jogo sem lugar no mapa (ou com lugar público): vão para todos, sem filtro. */
const PUBLICOS = new Set([
  'entrou',
  'saiu',
  'preparacao',
  'partida',
  'fimPartida',
  'faseFinal',
  'nivel',
  'nave',
  'melhoria',
  'objetivo',
  'bonusNave',
  'entrega', // placar público; a descarga é na bacia, dentro da base
  'torreta', // construção: queda e reconstrução são públicas
  'renasceu',
]);

/** Eventos de um jogador só (campo `para`): vão a ele e a mais ninguém ('ganho': ouro e XP do monstro que ele abateu). */
const PRIVADOS = new Set(['ganho']);

/** Campos de um evento que nomeiam uma entidade envolvida (autor ou alvo), por tipo de evento. */
const ENVOLVIDOS = {
  tiro: ['dono', 'alvo'], // alvo: a trava do míssil da torre sentinela
  acerto: ['alvo', 'por'], // por: quem deu o golpe crítico
  explosao: ['dono'],
  nova: ['dono'],
  efeito: ['id'],
  cura: ['id', 'por'],
  morte: ['id', 'por'],
  garra: ['id', 'alvo'],
  recall: ['id'],
  pulso: [],
  desarmou: [],
  fim: [],
};

const temPosicao = (e) => typeof e.x === 'number' && typeof e.z === 'number';

export class Visao {
  /** @param {import('./game.js').World} world */
  constructor(world) {
    this.world = world;
    this.tick = -1;
    this.olhosPorTime = BASES.map(() => []);
    this.timeDe = new Map(); // id de jogador, minerador e escolta → time
    this.cacheEnts = BASES.map(() => ({ de: null, lista: null }));
    this.cacheEventos = BASES.map(() => ({ de: null, lista: null }));
    // Tiros (e teleguiados) já mostrados a cada time: o fim deles vai a esse time.
    this.anunciados = BASES.map(() => new Set());
    this.donoDaBala = new Map(); // id do tiro → id de quem atirou (do evento 'tiro')
    this.limparEm = 0;
  }

  /** Monta os olhos de cada time no tick atual (uma vez por tick). */
  #preparar() {
    const w = this.world;
    if (this.tick === w.tick) return;
    this.tick = w.tick;
    this.olhosPorTime = BASES.map((_, t) => olhosDaBase(t));
    this.timeDe.clear();
    for (const j of w.players.values()) {
      this.timeDe.set(j.id, j.time);
      if (j.vivo) this.olhosPorTime[j.time]?.push(olho(j.ship.x, j.ship.z, VISAO_RAIO));
    }
    for (const m of [...w.mineradores.lista, ...(w.escoltas?.lista ?? [])]) {
      this.timeDe.set(m.id, m.time);
      if (m.vivo) this.olhosPorTime[m.time]?.push(olho(m.ship.x, m.ship.z, VISAO_MINERADOR));
    }
    for (const t of w.torretas?.lista ?? []) {
      this.timeDe.set(t.id, t.time);
      if (t.viva) this.olhosPorTime[t.time]?.push(olho(t.x, t.z, VISAO_TORRETA));
    }
    for (const c of this.cacheEnts) c.de = null;
    for (const c of this.cacheEventos) c.de = null;
    if (w.tick >= this.limparEm) this.#esquecerTiros();
  }

  /** Esquece os tiros anunciados que já não estão no mundo (o 'fim' deles se perdeu ou já foi). */
  #esquecerTiros() {
    this.limparEm = this.world.tick + LIMPAR_ANUNCIADOS_TICKS;
    const vivos = new Set(this.world.bullets.map((b) => b.id));
    for (const s of this.anunciados) for (const id of s) if (!vivos.has(id)) s.delete(id);
    for (const id of this.donoDaBala.keys()) if (!vivos.has(id)) this.donoDaBala.delete(id);
  }

  /** Os olhos do `time` agora (para testes e para quem quiser desenhar). */
  olhos(time) {
    this.#preparar();
    return this.olhosPorTime[time] ?? [];
  }

  /** O `time` enxerga o ponto (x, z) agora? */
  vePonto(time, x, z) {
    this.#preparar();
    return algumOlhoVe(this.olhosPorTime[time] ?? [], x, z);
  }

  /** A entidade (do snapshot ou do mundo) é do `time`? Monstro nunca é. */
  #doTime(e, time) {
    return !e.drone && e.time === time;
  }

  /**
   * As entidades do snapshot que o time de `j` vê: as do time sempre; as outras se
   * algum olho do time as enxerga. Cache por time e por lista (a lista é a mesma
   * para todos os jogadores no tick).
   */
  entidades(j, ents) {
    this.#preparar();
    const c = this.cacheEnts[j.time];
    if (!c) return ents;
    if (c.de !== ents) {
      const olhos = this.olhosPorTime[j.time];
      c.de = ents;
      c.lista = ents.filter((e) => this.#doTime(e, j.time) || algumOlhoVe(olhos, e.x, e.z));
    }
    return c.lista;
  }

  /** Minas e campos: do time de `j` sempre; dos outros, pela posição. */
  minas(j, minas) {
    if (!minas?.length) return minas;
    this.#preparar();
    const olhos = this.olhosPorTime[j.time] ?? [];
    return minas.filter((m) => m.time === j.time || algumOlhoVe(olhos, m.x, m.z));
  }

  /**
   * Teleguiados em voo: do time de `j` (ou dele) sempre; dos outros, pela posição.
   * O que passa fica anunciado ao time (o 'fim' dele chega).
   */
  guiados(j, guiados) {
    if (!guiados?.length) return guiados;
    this.#preparar();
    const olhos = this.olhosPorTime[j.time] ?? [];
    const anunciados = this.anunciados[j.time];
    const balas = new Map(this.world.bullets.map((b) => [b.id, b]));
    return guiados.filter((g) => {
      const b = balas.get(g.id);
      const doTime = b && (b.owner === j.id || (b.time !== undefined && b.time === j.time) || this.timeDe.get(b.owner) === j.time);
      if (!doTime && !algumOlhoVe(olhos, g.x, g.z)) return false;
      anunciados?.add(g.id);
      return true;
    });
  }

  /**
   * Os eventos do lote que `j` recebe: os do time dele (filtrados uma vez por time e
   * por lote, ver o topo do arquivo) e, por cima, os que envolvem o próprio `j`.
   */
  eventos(j, eventos) {
    if (!eventos?.length) return eventos;
    this.#preparar();
    const c = this.cacheEventos[j.time];
    if (!c) return eventos.filter((e) => !PRIVADOS.has(e.e) || e.para === j.id);
    if (c.de !== eventos) {
      c.de = eventos;
      c.lista = eventos.map((e) => this.#eventoParaTime(e, j.time));
    }
    const saida = [];
    for (let i = 0; i < eventos.length; i++) {
      const e = eventos[i];
      if (PRIVADOS.has(e.e)) {
        if (e.para === j.id) saida.push(e);
      } else if (this.#envolve(e, j.id)) saida.push(e);
      else if (c.lista[i]) saida.push(c.lista[i]);
    }
    return saida;
  }

  /** O evento nomeia o jogador `id` como autor ou alvo? */
  #envolve(e, id) {
    const campos = ENVOLVIDOS[e.e];
    if (campos) for (const k of campos) if (e[k] === id) return true;
    const bala = e.bala !== undefined ? this.donoDaBala.get(e.bala) : undefined;
    return bala === id;
  }

  /** O evento envolve alguém do `time` (ou foi feito por ele: campo `time`)? */
  #doTimeEv(e, time) {
    // `time` no evento: de quem atirou (tiro, explosão, nova), da nave do efeito ou de quem morreu.
    if (e.time === time) return true;
    const campos = ENVOLVIDOS[e.e] ?? [];
    for (const k of campos) if (e[k] !== undefined && this.timeDe.get(e[k]) === time) return true;
    if (e.bala !== undefined) {
      const dono = this.donoDaBala.get(e.bala);
      if (dono !== undefined && this.timeDe.get(dono) === time) return true;
    }
    return false;
  }

  /** O que o `time` recebe deste evento: ele mesmo, uma cópia sem a parte escondida, ou null. */
  #eventoParaTime(e, time) {
    if (PUBLICOS.has(e.e)) return e;
    if (PRIVADOS.has(e.e)) return null; // só o dono, em eventos()
    const olhos = this.olhosPorTime[time] ?? [];
    const anunciados = this.anunciados[time];
    if (e.e === 'tiro') {
      this.donoDaBala.set(e.id, e.dono);
      if (this.#doTimeEv(e, time) || this.#tiroEntraNaVisao(e, olhos)) {
        anunciados?.add(e.id);
        return e;
      }
      return null;
    }
    if (e.e === 'fim') {
      const visto = anunciados?.has(e.bala);
      anunciados?.delete(e.bala);
      // O tiro que bateu no campo de força de uma base pisca o campo para quem vê o ponto.
      const noCampo = e.campo !== undefined && algumOlhoVe(olhos, e.x, e.z);
      return visto || noCampo || this.#doTimeEv(e, time) ? e : null;
    }
    if (e.e === 'recall') return this.#recallParaTime(e, time, olhos);
    if (this.#doTimeEv(e, time)) return e;
    if (e.e === 'acerto' && e.bala !== undefined && anunciados?.has(e.bala)) return e;
    if (!temPosicao(e)) return e;
    if (algumOlhoVe(olhos, e.x, e.z)) return e;
    if (e.e === 'morte' && e.tipo === 'jogador') {
      // Placar de abates é público, o lugar não.
      const { x, y, z, ...semLugar } = e;
      return semLugar;
    }
    return null;
  }

  /** O caminho reto do tiro (da origem até o fim da vida) passa pela visão do time? */
  #tiroEntraNaVisao(e, olhos) {
    const vida = typeof e.vida === 'number' ? e.vida : 2.5;
    for (let k = 0; k <= AMOSTRAS_TIRO; k++) {
      const t = (vida * k) / AMOSTRAS_TIRO;
      if (algumOlhoVe(olhos, e.x + (e.vx ?? 0) * t, e.z + (e.vz ?? 0) * t)) return true;
    }
    return false;
  }

  /** Volta à base de outro time: só a chegada, sem a ponta que o time não vê. */
  #recallParaTime(e, time, olhos) {
    if (this.timeDe.get(e.id) === time) return e;
    if (e.estado !== 'chegou') return null;
    const veDe = !!e.de && algumOlhoVe(olhos, e.de.x, e.de.z);
    const veChegada = temPosicao(e) && algumOlhoVe(olhos, e.x, e.z);
    if (!veDe && !veChegada) return null;
    const { de, x, y, z, ...resto } = e;
    return { ...resto, ...(veDe ? { de } : {}), ...(veChegada ? { x, y, z } : {}) };
  }
}
