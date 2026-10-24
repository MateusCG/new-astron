// Torres sentinela da lane (DESIGN-PARTIDA.md, "Torretas"), só no servidor.
//
// Quatro por time, duas de cada lado da lane, fora dela, na metade do mapa do
// próprio time (TORRETAS em shared/terrain.js; a construção sólida é a mesma planta
// da física e do desenho, em shared/obstaculos.js). Elas guardam o caminho dos
// mineradores: o time que vem caçar os mineradores do outro passa debaixo de fogo.
// Pedido do Mateus (mapa do Stage 6): mais robustas, o MAIOR alcance do jogo e tiro
// TELEGUIADO.
//
// Regras:
// - Alcance TORRETA.alcance (560 m, mais que a Lâmina Giratória, a arma de maior
//   alcance, 548 m). Enxerga só o que a visão do time enxergaria dela (enxerga de
//   shared/visao.js: rocha e mineradora cortam a linha, quem está dentro de um campo
//   de asteroides só é visto de perto) e não vê camuflado.
// - Alvo: jogadores, mineradores e escoltas do outro time. Prioridade: o inimigo
//   que AGREDIU um aliado (jogador, minerador, escolta ou a própria torre) dentro do
//   alcance dela nos últimos TORRETA.agressaoS; sem ninguém assim, o mais perto.
//   Monstros não: a torre é da guerra entre os times, e se ela limpasse os monstros
//   que vêm atrás de quem foge, bastaria voar até a torre para se livrar de qualquer
//   caçada.
// - Tiro: um míssil teleguiado (o mesmo sistema dos mísseis das armas, server/golpes.js
//   e server/armas.js: o golpe do tiro leva `guia` e a trava `alvo`) que sai
//   apontado para o alvo e curva até ele (TORRETA.giro rad/s); sobe e desce com ele.
//   Rocha e construção no caminho o derrubam (stepBullet), e ele acerta o que estiver
//   no caminho, como qualquer tiro. Vai na lista `guiados` do snapshot.
// - Dano progressivo (pedido do Mateus, como nas torres do Dota 2 e do League of
//   Legends): cada tiro seguido no MESMO alvo bate mais forte, +TORRETA.rampa do dano
//   do nível por tiro, até TORRETA.rampaMax tiros a mais (o 1º tiro é o dano base, o
//   2º ×1,4, o 3º ×1,8 ... do 6º em diante ×3). Trocar de alvo ou ficar sem ninguém
//   na mira zera a série: ficar debaixo da torre custa cada vez mais caro, e quem sai
//   e volta recomeça do começo. A série conta o tiro disparado (o dano vai no míssil).
// - Só jogador do outro time machuca a torreta: tiro (qualquer projétil), mina e
//   onda de choque. Tiro de aliado, de monstro, de minerador ou de escolta bate
//   nela e some (é sólida). A escolta não mira torreta (ver server/escoltas.js):
//   destruir as defesas é trabalho dos pilotos. Efeitos de arma (dreno, lentidão,
//   EMP) não pegam em estrutura, e o míssil não a persegue (só curva atrás de nave).
// - Destruída: sai da física nos dois lados (definirObstaculoAtivo, como a torre
//   do buff de suporte), quem deu o último tiro ganha o XP de RECOMPENSA.torreta e o ouro
//   do nível das torretas do time dono, e o resto do time dele um pouco menos cada
//   (ouroTorreta em server/progressao.js: 200/100, 300/150, 400/200); evento 'torreta'. NÃO renasce
//   sozinha: só se o time dono a reconstruir na Evolução (server/servicos.js), e aí
//   ela volta inteira com o nível atual do time. Se houver nave no lugar, a obra
//   espera ela sair, para ninguém ficar preso dentro da torreta.
// - Nível do time (1 a TORRETA_NIVEL_MAX, comprado na Evolução): vale para as
//   quatro, +HP e +dano por nível (efeitosTorretas em shared/evolucao.js). Subir de
//   nível aumenta a vida na mesma proporção do máximo (não cura nem fere).
// - Partida nova (ou servidor vazio): todas de pé, inteiras, nível 1. Só atiram com
//   a partida em andamento (na tela de fim ficam quietas, como os mineradores).
//
// Névoa de guerra (frente Visão): cada torreta de pé é um olho do time com raio
// VISAO_TORRETA (= TORRETA.alcance); `lista` tem cada uma com x, z, y (o canhão),
// time e viva; estado() é o que vai no snapshot.

import { TORRETAS, BASES, cruzaCampoBase } from '../shared/terrain.js';
import { TORRETA as PLANTA, OBSTACULOS, definirObstaculoAtivo, alturaSolida } from '../shared/obstaculos.js';
import { DT, HOVER, SHIP_RADIUS, AREA_ALTURA } from '../shared/sim.js';
import { golpeDaArma } from '../shared/armas.js';
import { enxerga, VISAO_TORRETA } from '../shared/visao.js';
import { efeitosTorretas, TORRETA_NIVEL_MAX } from '../shared/evolucao.js';
import { recompensar, ouroTorreta } from './progressao.js';

/** Números de balanceamento da torreta no nível 1 (o nível multiplica HP e dano). */
export const TORRETA = {
  hp: 1400,
  alcance: VISAO_TORRETA, // m (no plano) até onde ela mira e enxerga: 560
  dano: 16, // por míssil (13 de dano por s, como a torre antiga de 10 a cada 0,75 s)
  cadenciaS: 1.2, // s entre tiros
  velTiro: 180, // m/s: dá para ver o míssil curvar
  giro: 3, // rad/s que o míssil vira atrás do alvo
  raioTiro: 3, // m de raio de acerto do míssil
  agressaoS: 3, // s: quem feriu um aliado da torre há menos que isso vira o alvo preferido
  rampa: 0.4, // dano a mais (fração do dano do nível) a cada tiro seguido no mesmo alvo
  rampaMax: 5, // tiros a mais que ainda sobem o dano: do 6º tiro seguido em diante, ×3
  kind: 'laser', // forma do projétil para o golpe (shared/armas.js); a cor vem do time no cliente
};
const CADENCIA_TICKS = Math.round(TORRETA.cadenciaS / DT);
const AGRESSAO_TICKS = Math.round(TORRETA.agressaoS / DT);
const VIDA_TIRO = (TORRETA.alcance * 1.4) / TORRETA.velTiro; // s: dá para curvar e ir além do alcance
const PASSO_VISAO = 4; // m entre as amostras da linha de tiro

/**
 * A linha de (x1, y1, z1) a (x2, y2, z2) passa livre de rocha e construção? Amostra
 * a cada PASSO_VISAO m, começando `inicio` m depois da origem (a torreta começa fora
 * do próprio cilindro). O campo de força de uma base no meio também fecha a linha
 * (o tiro para nele). Serve à escolta também.
 */
export function linhaDeTiro(x1, y1, z1, x2, y2, z2, inicio = 0) {
  if (cruzaCampoBase(x1, z1, x2, z2)) return false;
  const d = Math.hypot(x2 - x1, z2 - z1);
  for (let t = inicio; t < d; t += PASSO_VISAO) {
    const k = t / d;
    if (alturaSolida(x1 + (x2 - x1) * k, z1 + (z2 - z1) * k) > y1 + (y2 - y1) * k - 0.5) return false;
  }
  return true;
}

/**
 * Inimigos de `time` que uma defesa (torreta ou escolta) pode mirar: jogadores,
 * mineradores e escoltas vivos do outro time. Monstro não entra.
 */
export function alvosDoTime(world, time) {
  const lista = [];
  for (const j of world.players.values()) if (j.vivo && j.time !== time) lista.push(j);
  for (const m of world.mineradores.lista) if (m.vivo && m.time !== time) lista.push(m);
  for (const e of world.escoltas?.lista ?? []) if (e.vivo && e.time !== time) lista.push(e);
  return lista;
}

/**
 * Projétil de (x, y, z) mirando adiantado no alvo (pela velocidade dele), na
 * velocidade `vel`. Devolve só a velocidade { vx, vy, vz } e a distância.
 */
export function mirar(x, y, z, alvo, vel) {
  const s = alvo.ship;
  const d0 = Math.hypot(s.x - x, s.z - z);
  const t = d0 / vel;
  const ax = s.x + s.vx * t;
  const az = s.z + s.vz * t;
  const d = Math.hypot(ax - x, az - z) || 1;
  return { vx: ((ax - x) / d) * vel, vy: ((s.y - y) / d) * vel, vz: ((az - z) / d) * vel, dist: d0 };
}

export class Torretas {
  /** Levanta as oito torretas (o estado das construções é do módulo, de todo World). */
  constructor(world) {
    this.world = world;
    this.nivel = BASES.map(() => 1);
    const planta = new Map(OBSTACULOS.filter((o) => o.grupo === 'torreta').map((o) => [o.id, o]));
    this.lista = TORRETAS.map((t) => {
      const o = planta.get(t.id);
      return {
        id: t.id,
        time: t.time,
        nome: t.nome,
        x: t.x,
        z: t.z,
        chao: o.chao,
        topo: o.topo,
        y: o.chao + HOVER, // altura do canhão: a mesma das naves voando
        hp: 0,
        viva: true,
        obra: false, // reconstrução paga, esperando o lugar ficar livre
        obraPor: null,
        prontaEm: 0, // tick do próximo tiro
        alvo: 0, // id do alvo na mira (0 = nenhum)
        serie: 0, // tiros seguidos já disparados no alvo atual (dano progressivo)
        serieAlvo: 0, // id de quem recebe a série
      };
    });
    this.reiniciar();
  }

  /** HP máximo das torretas do time no nível atual. */
  hpMax(time) {
    return Math.round(TORRETA.hp * efeitosTorretas(this.nivel[time]).hp);
  }

  /**
   * Dano de um tiro das torretas do time no nível atual; `serie` = tiros seguidos
   * já disparados no mesmo alvo (cada um soma TORRETA.rampa, até TORRETA.rampaMax).
   */
  dano(time, serie = 0) {
    const rampa = 1 + TORRETA.rampa * Math.min(Math.max(0, serie), TORRETA.rampaMax);
    return TORRETA.dano * efeitosTorretas(this.nivel[time]).dano * rampa;
  }

  /** A torreta de id, ou undefined. */
  torreta(id) {
    return this.lista.find((t) => t.id === id);
  }

  /** Partida nova ou servidor vazio: todas de pé, inteiras, nível 1. */
  reiniciar() {
    this.nivel = BASES.map(() => 1);
    for (const t of this.lista) {
      t.viva = true;
      t.obra = false;
      t.obraPor = null;
      t.hp = this.hpMax(t.time);
      t.prontaEm = 0;
      t.alvo = 0;
      t.serie = 0;
      t.serieAlvo = 0;
      definirObstaculoAtivo(t.id, true);
    }
  }

  /**
   * Um tick: levanta as obras cujo lugar ficou livre e, se `atirar` (partida em
   * andamento), cada torreta de pé e pronta atira no inimigo mais perto.
   */
  passo(atirar = true) {
    const w = this.world;
    for (const t of this.lista) {
      if (!t.viva) {
        if (t.obra && !this.#naveEmCima(t)) this.#levantar(t);
        continue;
      }
      if (!atirar) {
        t.alvo = 0;
        t.serieAlvo = 0;
        continue;
      }
      if (w.tick < t.prontaEm) continue;
      const alvo = this.#escolherAlvo(t);
      t.alvo = alvo?.id ?? 0;
      if (!alvo) {
        t.serieAlvo = 0; // ninguém na mira: a próxima série começa do dano base
        continue;
      }
      t.prontaEm = w.tick + CADENCIA_TICKS;
      if (alvo.id === t.serieAlvo) t.serie++;
      else Object.assign(t, { serie: 0, serieAlvo: alvo.id });
      this.#atirar(t, alvo);
    }
  }

  /** O inimigo `a` agrediu um aliado da torreta `t` dentro do alcance dela há pouco? */
  #agressor(t, a) {
    const g = a.agrediu;
    return !!g && g.time === t.time && this.world.tick - g.tick < AGRESSAO_TICKS && Math.hypot(g.x - t.x, g.z - t.z) <= TORRETA.alcance;
  }

  /**
   * Alvo da torreta: entre os inimigos que ela enxerga no alcance, o mais perto dos
   * que agrediram um aliado há pouco; sem nenhum, o mais perto.
   */
  #escolherAlvo(t) {
    const w = this.world;
    let melhor = null;
    let melhorAgressor = false;
    let dist = Infinity;
    for (const a of alvosDoTime(w, t.time)) {
      const s = a.ship;
      if (!enxerga(t.x, t.z, s.x, s.z, TORRETA.alcance) || cruzaCampoBase(t.x, t.z, s.x, s.z)) continue;
      if (a.tipo === 'jogador' && w.golpes?.invisivel(a)) continue;
      const agressor = this.#agressor(t, a);
      const d = Math.hypot(s.x - t.x, s.z - t.z);
      if (melhorAgressor && !agressor) continue;
      if (agressor === melhorAgressor && d >= dist) continue;
      melhor = a;
      melhorAgressor = agressor;
      dist = d;
    }
    return melhor;
  }

  /** O golpe do míssil das torretas do `time` (o tiro do NPC com a curva e o dano do nível e da série). */
  #golpe(time, serie) {
    const base = golpeDaArma(TORRETA.kind, 1, 0);
    return {
      ...base,
      dano: this.dano(time, serie),
      vel: TORRETA.velTiro,
      vida: VIDA_TIRO,
      raio: TORRETA.raioTiro,
      alcance: TORRETA.alcance,
      guia: { comeca: 0, giro: TORRETA.giro, cone: Math.PI, alcance: TORRETA.alcance },
    };
  }

  #atirar(t, alvo) {
    const w = this.world;
    const s = alvo.ship;
    const d = Math.hypot(s.x - t.x, s.z - t.z) || 1;
    const vx = ((s.x - t.x) / d) * TORRETA.velTiro;
    const vz = ((s.z - t.z) / d) * TORRETA.velTiro;
    // Sai da borda do cilindro, senão o tiro nasceria dentro da própria torreta.
    const k = (PLANTA.raio + 1.5) / TORRETA.velTiro;
    const x = t.x + vx * k;
    const z = t.z + vz * k;
    const g = this.#golpe(t.time, t.serie);
    const b = {
      id: w.nextId++,
      owner: t.id,
      kind: TORRETA.kind,
      nivel: 1,
      prof: 0,
      g,
      alvo: alvo.id, // a trava: o míssil curva atrás dele (server/golpes.js)
      nasceu: w.tick,
      x,
      y: t.y,
      z,
      px: x,
      pz: z,
      vx,
      vy: 0,
      vz,
      vida: VIDA_TIRO,
      raio: g.raio,
      dano: g.dano,
      drone: false,
      time: t.time, // sem fogo amigo: atravessa quem é do mesmo time
      mult: 1,
    };
    w.adicionarTiro(b, { fonte: 'torreta', time: t.time, guiado: true, alvo: alvo.id, vida: +VIDA_TIRO.toFixed(2) });
  }

  /** O jogador dono do tiro `b`, se for do outro time da torreta (só ele machuca). */
  #inimigo(b, t) {
    if (b.drone) return null;
    const j = this.world.players.get(b.owner);
    return j && j.time !== t.time ? j : null;
  }

  /**
   * O tiro `b` (já avançado neste tick) bateu numa torreta de pé? Segmento contra o
   * cilindro, para tiro rápido não atravessar. Qualquer tiro acaba nela (é sólida);
   * só o de jogador inimigo tira vida. Devolve true se o tiro acabou aqui.
   */
  tiroNaTorreta(b) {
    const w = this.world;
    for (const t of this.lista) {
      if (!t.viva || b.y > t.topo) continue;
      const ax = b.px ?? b.x;
      const az = b.pz ?? b.z;
      const sx = b.x - ax;
      const sz = b.z - az;
      const l2 = sx * sx + sz * sz;
      const k = l2 > 0 ? Math.min(1, Math.max(0, ((t.x - ax) * sx + (t.z - az) * sz) / l2)) : 0;
      if (Math.hypot(ax + sx * k - t.x, az + sz * k - t.z) > PLANTA.raio + 0.5) continue;
      const atirador = this.#inimigo(b, t);
      const dano = atirador ? Math.round(w.danoDoTiro(b)) : 0;
      w.eventos.push({ e: 'acerto', bala: b.id, x: ax + sx * k, y: b.y, z: az + sz * k, alvo: 0, torreta: t.id, dano });
      if (dano) this.#ferir(t, dano, atirador);
      return true;
    }
    return false;
  }

  /**
   * Dano em área (mina, onda de choque) de `fonte` ({id}) centrado em (x, y, z):
   * fere as torretas do outro time ao alcance, se a fonte for um jogador. Devolve
   * quantas pegou.
   */
  area(fonte, x, y, z, raio, dano, arma) {
    const w = this.world;
    const j = w.players.get(fonte.id);
    if (!j) return 0;
    let n = 0;
    for (const t of this.lista) {
      if (!t.viva || t.time === j.time) continue;
      if (Math.hypot(t.x - x, t.z - z) > raio + PLANTA.raio) continue;
      if (y < t.chao - AREA_ALTURA || y > t.topo + AREA_ALTURA) continue;
      n++;
      w.eventos.push({ e: 'acerto', arma, alvo: 0, torreta: t.id, dano, x: t.x, y: t.y, z: t.z });
      this.#ferir(t, dano, j);
    }
    return n;
  }

  #ferir(t, dano, atirador) {
    const w0 = this.world;
    // Bater na torre conta como causar dano e como agredir um aliado dela.
    atirador.causouDanoTick = w0.tick;
    atirador.agrediu = { tick: w0.tick, time: t.time, x: t.x, z: t.z };
    t.hp -= dano;
    if (t.hp > 0) return;
    const w = this.world;
    t.hp = 0;
    t.viva = false;
    t.alvo = 0;
    t.serieAlvo = 0;
    definirObstaculoAtivo(t.id, false);
    const { ouro, ouroTime } = ouroTorreta(this.nivel[t.time]);
    recompensar(atirador, 'torreta', w.eventos, 1, { ouro });
    for (const j of w.players.values()) {
      if (j !== atirador && j.time === atirador.time) j.ouro += ouroTime;
    }
    w.eventos.push({ e: 'torreta', id: t.id, time: t.time, estado: 'destruida', por: atirador.id, nome: atirador.nome, x: t.x, y: t.y, z: t.z });
  }

  /** Alguma nave (de qualquer tipo) no lugar da torreta? */
  #naveEmCima(t) {
    const w = this.world;
    const r = PLANTA.raio + 1;
    const todos = [...w.players.values(), ...w.monstros, ...w.mineradores.lista, ...(w.escoltas?.lista ?? [])];
    return todos.some((e) => e.vivo && Math.hypot(e.ship.x - t.x, e.ship.z - t.z) < r + (e.ship.raio ?? SHIP_RADIUS));
  }

  #levantar(t) {
    t.obra = false;
    t.viva = true;
    t.hp = this.hpMax(t.time);
    t.prontaEm = this.world.tick + CADENCIA_TICKS;
    definirObstaculoAtivo(t.id, true);
    const quem = t.obraPor;
    t.obraPor = null;
    this.world.eventos.push({ e: 'torreta', id: t.id, time: t.time, estado: 'reconstruida', por: quem?.id ?? 0, nome: quem?.nome ?? null, x: t.x, y: t.y, z: t.z });
  }

  /**
   * Reconstrução já paga (server/servicos.js valida e cobra): a torreta `id` volta
   * agora, ou assim que o lugar ficar livre. `quem` é o piloto que pagou.
   */
  reconstruir(id, quem) {
    const t = this.torreta(id);
    if (!t || t.viva || t.obra) return false;
    t.obra = true;
    t.obraPor = quem;
    if (!this.#naveEmCima(t)) this.#levantar(t);
    return true;
  }

  /**
   * Sobe um nível as torretas do `time` (já pago). As de pé ganham vida na mesma
   * proporção do máximo. Devolve o nível novo, ou null se já estava no máximo.
   */
  subirNivel(time) {
    if (this.nivel[time] >= TORRETA_NIVEL_MAX) return null;
    const antes = this.hpMax(time);
    this.nivel[time]++;
    const depois = this.hpMax(time);
    for (const t of this.lista) if (t.time === time && t.viva) t.hp *= depois / antes;
    return this.nivel[time];
  }

  /**
   * Estado para o snapshot (`torretas`, igual para todos): id, time, vida, max,
   * nivel e viva (de pé e sólida); `alvo` (id na mira) só quando mira alguém e
   * `obra` só quando a reconstrução espera o lugar ficar livre.
   */
  estado() {
    return this.lista.map((t) => {
      const r = { id: t.id, time: t.time, vida: Math.ceil(t.hp), max: this.hpMax(t.time), nivel: this.nivel[t.time], viva: t.viva };
      if (t.alvo) r.alvo = t.alvo;
      if (t.obra) r.obra = true;
      return r;
    });
  }
}
