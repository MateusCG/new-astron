// Jogadores do computador (pedido do Mateus): naves de jogador controladas pelo
// servidor, que entram num time como qualquer piloto (contam no limite de
// MAX_POR_TIME) e jogam como uma pessoa jogaria.
//
// O computador é um jogador de verdade no World: mesma nave da raça e da classe,
// mesma física (o comando dele passa pelo mesmo sanitizeInput e stepShip, um por
// tick), mesmo dano, XP, ouro, Loja e Evolução. A única diferença é quem aperta as
// teclas: em vez de chegar pela rede, o comando sai daqui (`passo`, chamado pelo
// World antes de aplicar os comandos). Nada é trapaça: ele não atravessa rocha, não
// vê camuflado de longe, não compra fora da plataforma (pousa nela e faz o mesmo
// pedido do cliente, em Servicos.pedido) e não atira na base do outro time.
//
// O nick é sempre "NOME (IA)", com um nome próprio brasileiro em maiúsculas (NOMES),
// sem repetir dentro do mundo. O jogador humano não consegue fingir (o limpaNome do
// World tira os parênteses).
//
// Como ele joga (o "cérebro" fica em j.ia; pensa a cada IA.pensarTicks e dirige a
// nave a cada tick):
// - Começo de partida: caça os monstros da jungle (Arnosh e Vorax; Krakor só com
//   nível e vida sobrando) para ganhar XP e ouro. Quem o atacou vem primeiro.
// - Com nível (IA.nivelCorredor, ± o jeito de cada um) ou com a partida andando
//   (IA.corredorS), vai atrapalhar a mineração do outro time: espera perto do
//   minério, do lado de lá, e derruba os mineradores e a escolta inimigos que
//   aparecem, longe das torretas deles (só encara torreta forte e com vida cheia).
//   Sem minerador à vista, caça monstro ali perto.
// - Jogador inimigo à vista (ou atacando os mineradores do time dele): briga se
//   está com vida, senão foge para a base.
// - Vida baixa: usa o kit de reparo (se tiver), e volta para a base (recall se
//   estiver longe e sossegado; voando, se não), pousa no anel e conserta.
// - Ouro sobrando: pousa na Evolução para a próxima nave da linha e na Loja para
//   as versões das duas armas de fábrica, o equipamento (um escudo, uma armadura
//   geral e dois potenciadores: o Reforço do tipo de dano das armas dele e o de
//   Durabilidade), as versões dele e kits. Pelos mesmos pedidos do cliente: comprar
//   põe a instância no compartimento, e logo depois ele a põe na nave ({t:'equipar'},
//   no encaixe vazio da categoria); a versão sobe por instância ({t:'evoluirItem'}).
//   Guarda ouro para a nave quando já tem o nível dela.
// - Pontos do piloto: a cada nível, distribui os livres (o mesmo pedido {t:'pontos'}
//   do cliente) entre o poder do tipo de dano das armas dele e a Energia
//   (IA.fracaoEnergia dos pontos).
// - Para não parecer máquina: demora um pouco para reagir a um alvo novo
//   (IA.reacaoS), erra a mira um pouco (menos com o nível) e cada um tem a sua
//   agressividade (sorteada ao entrar).
//
// Navegação: grade de server/navegacao.js sem bloqueio nas bases (o computador
// entra e sai da própria base, diferente dos monstros). Com linha livre vai reto;
// senão segue o campo de caminhos até o destino (campos de destinos fixos ficam em
// cache; o de alvo que anda é refeito quando ele se move). Preso numa quina, dá ré.

import { DT, sanitizeInput, versaoArma, velocidadeBase, ARMAS, WEAPONS } from '../shared/sim.js';
import { BASES, MINERADORA, LANE, AREAS_POUSO, TORRETAS } from '../shared/terrain.js';
import { naveDe } from '../shared/naves.js';
import { ITENS, precoEvoluirInst, naNave } from '../shared/loja.js';
import { EQUIPAMENTOS, equipamentosAVenda } from '../shared/equipamentos.js';
import { pontosLivres, PONTO_MAX, ORDEM_ATRIBUTOS } from '../shared/status.js';
import { NIVEL_MAX } from './progressao.js';
import { MapaNavegacao } from './navegacao.js';
import { TORRETA } from './torretas.js';
import { GUARDIAO } from './elites.js';
import { INVISIVEL_VISTO_M } from './golpes.js';
import { naPlataforma } from './servicos.js';
import { RECALL_VEL_MAX } from '../shared/recall.js';

const TICK_HZ = Math.round(1 / DT);

/** Números do comportamento do computador. */
export const IA = {
  pensarTicks: 5, // decide o que fazer 6 vezes por segundo
  reacaoS: [0.25, 0.6], // demora para começar a atirar num alvo novo
  erroMira: 0.045, // rad de erro de mira no nível 1 (cai pela metade no NIVEL_MAX)
  visaoJogador: 320, // m: jogador inimigo mais perto que isso vira briga
  defenderRaio: 260, // m: inimigo perto assim de um minerador do time também
  defenderMax: 750, // m: ...se o computador estiver a até isto
  vidaFugir: 0.3, // fração do HP: abaixo, larga tudo e volta para a base
  vidaBrigar: 0.45, // fração do HP para encarar um jogador
  vidaConsertar: 0.45, // sem briga por perto, abaixo disto vai consertar
  vidaPronto: 0.95, // pousado na base, decola com isto
  usarReparo: 0.4, // usa o kit de reparo abaixo disto
  energiaCelula: 0.15, // usa a célula de energia brigando abaixo disto
  nivelCorredor: 4, // a partir daqui vai atrapalhar os mineradores do outro time
  corredorS: 150, // ...ou com a partida andando há isto
  krakorNivel: 7, // caça Krakor a partir daqui (com vida cheia)
  cacaMax: 1400, // m: monstro mais longe que isso não vale a viagem
  cacaPerto: 450, // m: no corredor sem minerador, caça monstro até aqui
  espreitaX: 85, // m do eixo da lane onde espera os mineradores
  espreitaZ: 60, // m além da face da mineradora, do lado do outro time
  alvoMineradorMax: 650, // m da espreita: minerador mais longe não vale
  torretaFolga: 5, // m além do alcance da torreta inimiga (a coroa do minério fica a ~176 m dela)
  torretaNivel: 12,
  guardiaoFolga: 40, // m além da visão do guardião do objetivo C (ele atira em quem entra)
  revidaDist: 140, // m: minerador ou escolta perto assim se derruba mesmo junto da torreta deles // só encara torreta com este nível e vida cheia
  recallDist: 550, // m da base: mais longe que isso, volta de recall
  calmoS: 2.5, // s sem levar dano para tentar o recall
  presoS: 1.5, // parado querendo andar: dá ré
  reS: 0.7,
  campoS: 1.5, // s até refazer o caminho até um alvo que anda
  linhaTicks: 6, // de quanto em quanto tempo refaz o teste de linha livre (é o que mais custa)
  campoMover: 50, // m: alvo andou isso, refaz o caminho
  pousoPerto: 140, // m da área de pouso: daqui vem freando
  pousoFreio: 0.7, // velocidade querida (m/s) por metro que falta
  pousoVel: 9, // m/s: abaixo disto, dentro da área, aperta o L
  compraMin: 110, // ouro de compras para valer a viagem à base
  kitsDesejados: 2,
  fracaoEnergia: 0.3, // dos pontos do piloto, esta fração vai na Energia; o resto no poder das armas
  potenciadorVida: 'e340001', // Potenciador de Durabilidade: o segundo potenciador de todo computador
};

/** Nomes próprios brasileiros para o nick ("JOAO (IA)"). */
export const NOMES = [
  'JOAO', 'LAIS', 'MARIO', 'ANA', 'PEDRO', 'LUCAS', 'GABRIEL', 'RAFAEL', 'JULIA', 'BEATRIZ',
  'CAMILA', 'FERNANDA', 'BRUNO', 'THIAGO', 'CARLOS', 'PAULO', 'MARCOS', 'RENATA', 'LETICIA', 'LARISSA',
  'VINICIUS', 'GUSTAVO', 'FELIPE', 'DIEGO', 'RODRIGO', 'ALINE', 'BIANCA', 'CAIO', 'DANIEL', 'EDUARDO',
  'FABIO', 'HELENA', 'IGOR', 'ISABELA', 'JORGE', 'KAUA', 'LUANA', 'MARIANA', 'NATALIA', 'OTAVIO',
  'PRISCILA', 'RAQUEL', 'SAMUEL', 'TATIANA', 'VITOR', 'YASMIN', 'CLARA', 'LUIZA', 'HEITOR', 'ENZO',
  'ARTHUR', 'DAVI', 'SOFIA', 'ALICE', 'MANUELA', 'VALENTINA', 'GIOVANNA', 'RICARDO', 'SERGIO', 'ANTONIO',
  'FRANCISCO', 'RAIMUNDO', 'TERESA', 'JOANA', 'CRISTIANE', 'LEANDRO', 'MURILO', 'PATRICIA', 'SIMONE', 'WESLEY',
];
export const SUFIXO_IA = ' (IA)';

/** Nick de computador com um nome que ainda não está no mundo. */
export function nomeDeBot(rng, usados) {
  const livres = NOMES.filter((n) => !usados.has(n + SUFIXO_IA));
  const lista = livres.length ? livres : NOMES;
  return lista[Math.floor(rng() * lista.length) % lista.length] + SUFIXO_IA;
}

// A grade dos computadores não bloqueia as bases (os monstros usam outra, com a
// zona segura bloqueada). Depende só do terreno: uma por processo, na primeira vez
// que aparece um computador, e os campos de destinos fixos ficam em cache.
let grade = null;
const camposFixos = new Map();
function nav() {
  grade ??= new MapaNavegacao();
  return grade;
}
function campoFixo(x, z) {
  const chave = `${Math.round(x)},${Math.round(z)}`;
  let c = camposFixos.get(chave);
  if (!c) {
    c = nav().campo([{ x, z }]);
    camposFixos.set(chave, c);
  }
  return c;
}

const ANEL_BASE = BASES.map((b) => AREAS_POUSO.find((a) => a.base === b.time));
const PLATAFORMA = Object.fromEntries(
  ['evolucao', 'loja'].map((sv) => [sv, BASES.map((b) => AREAS_POUSO.find((a) => a.servico === sv && a.time === b.time))]),
);

function anguloEntre(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const yawPara = (s, x, z) => Math.atan2(-(x - s.x), -(z - s.z));
const PARADO = { th: 0, tu: 0, b: false, f1: false, f2: false, p: false, r: false, a: -1, a2: -1 };

/** Alcance (m) e velocidade do projétil da arma do encaixe, na versão que a nave tem. */
function armaDoEncaixe(s, enc) {
  const a = s.encaixes?.[enc];
  const v = versaoArma(a, s.nivEnc?.[enc] ?? 1);
  const g = v?.golpe;
  if (!g || g.forma !== 'projetil' || !(g.vel > 0)) return null;
  return { alcance: g.vel * g.vida, vel: g.vel, energia: v.energia };
}

export class Bots {
  /**
   * @param {import('./game.js').World} world
   * @param {{ zonaSegura: number }} opcoes raio da zona segura das bases (do World)
   */
  constructor(world, { zonaSegura }) {
    this.world = world;
    this.zonaSegura = zonaSegura;
  }

  /** Cérebro novo (entrada, partida nova): jeito sorteado e nada em andamento. */
  novoCerebro() {
    const rng = this.world.rng;
    return {
      partida: this.world.partida.numero,
      fase: Math.floor(rng() * IA.pensarTicks), // cada um pensa num tick diferente
      agressivo: rng(), // 0 = cauteloso, 1 = afoito
      modo: 'parado',
      alvo: null, // entidade em que está atirando
      destino: null, // { x, z, area?, servico? }
      reagirEm: 0,
      erro: 0,
      preso: 0,
      re: 0,
      ronda: rng() < 0.5 ? 1 : -1, // lado para onde vira dando ré
      lado: rng() < 0.5 ? 1 : -1, // de que lado do corredor espera os mineradores
      campo: null, // caminho até alvo que anda: { campo, x, z, ate }
      pulsoP: false,
      pulsoR: false,
      recallEm: 0,
      foge: 0, // ticks se afastando de monstro de garra
    };
  }

  /** Todos os computadores do mundo. */
  *lista() {
    for (const j of this.world.players.values()) if (j.ia) yield j;
  }

  /** Um comando por computador vivo, na fila dele (o World aplica como o de qualquer jogador). */
  passo() {
    const w = this.world;
    for (const j of this.lista()) {
      if (!j.vivo) continue;
      if (j.ia.partida !== w.partida.numero) j.ia = this.novoCerebro(); // partida nova: começa do zero
      if ((w.tick + j.ia.fase) % IA.pensarTicks === 0) this.#pensar(j);
      const cmd = this.#agir(j);
      j.fila.push({ seq: j.ack + j.fila.length + 1, inp: sanitizeInput(cmd) });
    }
  }

  // ---------- Decisão ----------

  #pensar(j) {
    const w = this.world;
    const ia = j.ia;
    const s = j.ship;
    const vida = s.hp / s.maxHp;
    if (!w.partida.emAndamento) return this.#mudar(j, 'parado');
    this.#usarItens(j, vida);
    this.#distribuirPontos(j);

    if (j.recall) return this.#mudar(j, 'recall'); // canalizando: mãos fora do gatilho
    if (s.pousado) return this.#pousado(j, vida);

    const fugir = IA.vidaFugir - 0.06 * (ia.agressivo - 0.5);
    if (vida < fugir) return this.#voltarParaBase(j);

    const inimigo = this.#jogadorInimigo(j);
    if (inimigo) {
      const delaVida = inimigo.ship.hp / inimigo.ship.maxHp;
      if (vida >= IA.vidaBrigar || vida > delaVida + 0.15) return this.#atacar(j, inimigo);
      return this.#voltarParaBase(j);
    }
    // Monstro que me atacou vem primeiro: ele não vai largar.
    const raivoso = this.#monstroComRaiva(j);
    if (raivoso) return this.#atacar(j, raivoso);

    if (vida < IA.vidaConsertar) return this.#voltarParaBase(j);
    if (this.#valeComprar(j)) return this.#irComprar(j);

    if (this.#horaDoCorredor(j)) {
      const alvo = this.#mineradorInimigo(j);
      if (alvo) return this.#atacar(j, alvo);
      const espreita = this.#espreita(j);
      const perto = this.#monstroParaCacar(j, espreita, IA.cacaPerto);
      if (perto) return this.#atacar(j, perto);
      return this.#irPara(j, espreita);
    }
    const monstro = this.#monstroParaCacar(j, s, IA.cacaMax);
    if (monstro) return this.#atacar(j, monstro);
    return this.#irPara(j, this.#espreita(j));
  }

  #mudar(j, modo, extra = {}) {
    const ia = j.ia;
    if (ia.modo !== modo) ia.campo = null;
    ia.modo = modo;
    if (extra.alvo !== undefined && extra.alvo !== ia.alvo) {
      // Alvo novo: um instante para "ver" e mirar, como gente.
      const [a, b] = IA.reacaoS;
      ia.reagirEm = this.world.tick + Math.round((a + this.world.rng() * (b - a)) * TICK_HZ);
      ia.campo = null;
    }
    ia.alvo = extra.alvo ?? (modo === 'atacar' ? ia.alvo : null);
    ia.destino = extra.destino ?? null;
  }

  #atacar(j, alvo) {
    const ia = j.ia;
    // Erro de mira sorteado a cada decisão: menos com o nível.
    const erro = IA.erroMira * (1 - (0.5 * (j.nivel - 1)) / (NIVEL_MAX - 1));
    ia.erro = (this.world.rng() * 2 - 1) * erro;
    this.#mudar(j, 'atacar', { alvo });
  }

  #irPara(j, destino) {
    this.#mudar(j, 'ir', { destino });
  }

  /** Volta para a base: recall se está longe e sossegado, senão voando até o anel. */
  #voltarParaBase(j) {
    const w = this.world;
    const anel = ANEL_BASE[j.time];
    const longe = dist(j.ship, anel) > IA.recallDist;
    const calmo = w.tick - j.ultimoDano > IA.calmoS * TICK_HZ && !this.#jogadorInimigo(j, IA.visaoJogador * 0.8);
    if (longe && calmo) return this.#mudar(j, 'recall');
    // Pousado em qualquer ponto da base a nave conserta: com compra a fazer, já pousa na plataforma.
    const compra = this.#desejos(j)[0];
    const area = compra ? PLATAFORMA[compra.servico][j.time] : anel;
    this.#mudar(j, 'pousar', { destino: { x: area.x, z: area.z, area } });
  }

  /** Pousado: na base conserta e compra; pronto, decola. */
  #pousado(j, vida) {
    const ia = j.ia;
    const s = j.ship;
    const parado = Math.hypot(s.vx, s.vz) < 6;
    if (parado) {
      for (const sv of ['evolucao', 'loja']) if (naPlataforma(j, sv)) this.#comprar(j, sv);
    }
    // Ainda falta comprar na outra plataforma: decola e vai.
    const falta = this.#desejos(j).find((d) => !naPlataforma(j, d.servico));
    const naBase = dist(s, BASES[j.time]) < BASES[j.time].raio;
    if (naBase && vida < IA.vidaPronto && !falta) {
      ia.modo = 'pousado';
      return;
    }
    if (!parado) return; // ainda freando
    ia.modo = 'pousado';
    ia.pulsoP = true; // decola
  }

  // ---------- O que olhar ----------

  /** Ele vê `o`? (camuflado do outro time só de perto) */
  #ve(j, o) {
    return !this.world.golpes.invisivel(o) || dist(j.ship, o.ship) <= INVISIVEL_VISTO_M;
  }

  /** Está na zona segura da base do próprio time (onde não leva dano)? */
  #naPropriaBase(ent) {
    const b = BASES[ent.time];
    return !!b && dist(ent.ship, b) < this.zonaSegura;
  }

  /** O ponto está ao alcance de uma torreta de pé do time que não é `time`? */
  #perigoTorreta(p, time) {
    for (const t of TORRETAS) {
      if (t.time === time || !this.world.torretas.torreta(t.id)?.viva) continue;
      if (dist(p, t) < TORRETA.alcance + IA.torretaFolga) return true;
    }
    return false;
  }

  /** O ponto está ao alcance de um guardião de objetivo C vivo? (ele atira em quem chega) */
  #perigoGuardiao(p) {
    for (const e of this.world.elites) {
      if (e.tipo === 'guardiao' && e.vivo && dist(p, e.ship) < GUARDIAO.visao + IA.guardiaoFolga) return true;
    }
    return false;
  }

  /** Pode encarar torreta inimiga agora? (forte e com a vida cheia) */
  #encaraTorreta(j) {
    return j.nivel >= IA.torretaNivel && j.ship.hp / j.ship.maxHp > 0.8;
  }

  /** Jogador inimigo a brigar: à vista e perto, ou atacando os mineradores do time. */
  #jogadorInimigo(j, visao = IA.visaoJogador) {
    const w = this.world;
    const meusMineradores = w.mineradores.lista.filter((m) => m.vivo && m.time === j.time);
    let melhor = null;
    let melhorD = Infinity;
    for (const o of w.players.values()) {
      if (o.time === j.time || !o.vivo || !this.#ve(j, o) || this.#naPropriaBase(o)) continue;
      if (this.#perigoTorreta(o.ship, j.time) && !this.#encaraTorreta(j)) continue;
      const d = dist(j.ship, o.ship);
      const ameaca = d < IA.defenderMax && meusMineradores.some((m) => dist(m.ship, o.ship) < IA.defenderRaio);
      if ((d < visao || ameaca) && d < melhorD) {
        melhor = o;
        melhorD = d;
      }
    }
    return melhor;
  }

  /** Monstro da jungle com raiva dele (vai atrás dele de qualquer jeito). */
  #monstroComRaiva(j) {
    const w = this.world;
    let melhor = null;
    let melhorD = Infinity;
    for (const m of [...w.drones, ...w.monstros, ...w.elites]) {
      if (!m.vivo || !(m.raiva?.get(j.id) > w.tick)) continue;
      const d = dist(j.ship, m.ship);
      if (d < melhorD) {
        melhor = m;
        melhorD = d;
      }
    }
    return melhorD < 500 ? melhor : null;
  }

  /** Monstro bom de caçar perto de `de` (até `max` m dele). */
  #monstroParaCacar(j, de, max) {
    const w = this.world;
    const vida = j.ship.hp / j.ship.maxHp;
    let melhor = null;
    let melhorNota = Infinity;
    const candidatos = [...w.drones, ...w.monstros, ...w.elites.filter((e) => e.tipo === 'krakor')];
    for (const m of candidatos) {
      if (!m.vivo) continue;
      if (m.tipo === 'krakor' && (j.nivel < IA.krakorNivel || vida < 0.75)) continue;
      const d = dist(de, m.ship);
      if (d > max) continue;
      if (this.#perigoTorreta(m.ship, j.time) || this.#perigoGuardiao(m.ship)) continue;
      // Perto de quem caça vale mais; o Vorax (garra) um pouco menos; o Krakor paga mais.
      const nota = dist(j.ship, m.ship) * (m.tipo === 'vorax' ? 1.2 : m.tipo === 'krakor' ? 0.7 : 1);
      if (nota < melhorNota) {
        melhor = m;
        melhorNota = nota;
      }
    }
    return melhor;
  }

  /** Já é hora de atrapalhar a mineração do outro time? */
  #horaDoCorredor(j) {
    const nivel = IA.nivelCorredor + Math.round((0.5 - j.ia.agressivo) * 2);
    const partida = this.world.partida;
    const decorrido = partida.semTempo ? 0 : partida.fracaoDecorrida(this.world.tick) * partida.duracaoTicks * DT;
    return j.nivel >= nivel || decorrido >= IA.corredorS;
  }

  /** Onde esperar os mineradores do outro time: perto da doca deles, fora das torretas. */
  #espreita(j) {
    const outro = BASES[1 - j.time];
    const sinal = Math.sign(outro.x - MINERADORA.x) || 1;
    return { x: MINERADORA.x + sinal * (MINERADORA.meiaX + IA.espreitaZ), z: LANE.z + IA.espreitaX * j.ia.lado };
  }

  /** Minerador ou escolta do outro time que dá para derrubar sem entrar nas torretas. */
  #mineradorInimigo(j) {
    const w = this.world;
    const espreita = this.#espreita(j);
    const torreta = this.#encaraTorreta(j);
    let melhor = null;
    let melhorNota = Infinity;
    for (const m of [...w.mineradores.lista, ...w.escoltas.lista]) {
      if (!m.vivo || m.time === j.time || this.#naPropriaBase(m)) continue;
      if (dist(espreita, m.ship) > IA.alvoMineradorMax) continue;
      // Perto da torreta deles só se ele mesmo está fora do alcance dela e o alvo
      // está ao alcance dele (a escolta atirando de longe, por exemplo).
      const revida = dist(j.ship, m.ship) < IA.revidaDist && !this.#perigoTorreta(j.ship, j.time);
      if (!torreta && !revida && this.#perigoTorreta(m.ship, j.time)) continue;
      // Minerador carregado vale mais (o minério se perde); a escolta só se estiver perto.
      const nota = dist(j.ship, m.ship) * (m.tipo === 'escolta' ? 1.4 : m.carga > 0 ? 0.7 : 1);
      if (nota < melhorNota) {
        melhor = m;
        melhorNota = nota;
      }
    }
    return melhor;
  }

  // ---------- Loja e Evolução ----------

  /**
   * O que comprar agora, na ordem: a próxima nave (se já tem o nível; guarda ouro
   * para ela), as versões das armas de fábrica, o equipamento (compra e versões) e
   * kits de reparo. Cada desejo: { servico, pedido, preco }.
   */
  #desejos(j) {
    const out = [];
    let ouro = j.ouro;
    const race = j.ship.race;
    const proxima = naveDe(race, j.classe, j.tier + 1);
    if (proxima && j.nivel >= proxima.nivel) {
      if (ouro < proxima.preco) return out; // guardando para a nave
      out.push({ servico: 'evolucao', pedido: { t: 'evoluir', opcao: 'nave' }, preco: proxima.preco });
      ouro -= proxima.preco;
    }
    // Versões das armas de fábrica (por instância, pousado na base: a Loja serve).
    for (const x of j.inv) {
      if (!x.fabrica) continue;
      const preco = precoEvoluirInst(x);
      if (preco === null || ouro < preco) continue;
      out.push({ servico: 'loja', pedido: { t: 'evoluirItem', inst: x.id }, preco });
      ouro -= preco;
    }
    // Equipamento: compra o que falta (vai para o compartimento; #equiparDesejado
    // põe na nave) e depois evolui a instância que tem.
    for (const chave of this.#equipDesejado(j)) {
      const x = j.inv.find((y) => y.chave === chave);
      const preco = x ? precoEvoluirInst(x) : EQUIPAMENTOS[chave].preco;
      if (preco === null || ouro < preco) continue;
      out.push({ servico: 'loja', pedido: x ? { t: 'evoluirItem', inst: x.id } : { t: 'comprar', item: chave }, preco });
      ouro -= preco;
    }
    for (let k = j.itens.reparo; k < IA.kitsDesejados && ouro >= ITENS.reparo.preco; k++) {
      out.push({ servico: 'loja', pedido: { t: 'comprar', item: 'reparo' }, preco: ITENS.reparo.preco });
      ouro -= ITENS.reparo.preco;
    }
    return out;
  }

  /** Tipo de dano que mais aparece nas armas dos encaixes do computador. */
  #tipoDasArmas(j) {
    const conta = {};
    for (const a of j.ship.encaixes ?? []) {
      const t = WEAPONS[ARMAS[a]]?.tipoDano;
      if (t) conta[t] = (conta[t] ?? 0) + 1;
    }
    return Object.keys(conta).sort((a, b) => conta[b] - conta[a])[0] ?? 'laser';
  }

  /**
   * O equipamento que o computador quer, na ordem de compra: o escudo de mais
   * escudo, a armadura geral (sem tipo) de mais HP, o Reforço do tipo das armas dele
   * e o Potenciador de Durabilidade. Só da classe dele.
   */
  #equipDesejado(j) {
    const melhor = (lista, valor) => lista.reduce((m, k) => (m === null || valor(k) > valor(m) ? k : m), null);
    const escudo = melhor(equipamentosAVenda(j.classe, 'escudo'), (k) => EQUIPAMENTOS[k].versoes[0].maxEscudo);
    const geral = equipamentosAVenda(j.classe, 'armadura').filter((k) => EQUIPAMENTOS[k].tipoDano === null);
    const armadura = melhor(geral, (k) => EQUIPAMENTOS[k].versoes[0].hp);
    const tipo = this.#tipoDasArmas(j);
    const reforco = equipamentosAVenda(j.classe, 'potenciador').find(
      (k) => EQUIPAMENTOS[k].tipoDano === tipo && EQUIPAMENTOS[k].versoes[0].efeitos.some((e) => e.tipo === 'poder') && EQUIPAMENTOS[k].versoes[0].efeitos.length > 1,
    );
    return [escudo, armadura, reforco, IA.potenciadorVida].filter((k) => k && EQUIPAMENTOS[k]);
  }

  /**
   * Pontos livres do piloto: Energia até IA.fracaoEnergia do total, o resto no
   * poder do tipo de dano das armas dele; atributo no máximo (99), o que sobrar vai
   * nos outros. Pelo mesmo pedido do cliente ({t:'pontos'}).
   */
  #distribuirPontos(j) {
    const livres = pontosLivres(j.nivel, j.pontos);
    if (!livres) return;
    const p = j.pontos;
    const total = p.energia + p.fisico + p.eletrico + p.laser + livres;
    const energia = Math.min(livres, Math.max(0, Math.round(IA.fracaoEnergia * total) - p.energia));
    const poder = this.#tipoDasArmas(j);
    const pedidos = [
      ['energia', energia],
      [poder, livres - energia],
      ...['energia', poder, ...ORDEM_ATRIBUTOS].map((a) => [a, PONTO_MAX]), // sobra (atributo cheio)
    ];
    for (const [atributo, qtd] of pedidos) {
      if (qtd < 1) continue;
      const r = this.world.servicos.pedido(j, { t: 'pontos', atributo, qtd: Math.min(qtd, PONTO_MAX) });
      if (!r.ok && r.codigo === 'sem_pontos') return;
    }
  }

  /** Vale a viagem até a base para comprar? */
  #valeComprar(j) {
    const d = this.#desejos(j);
    return d.some((x) => x.pedido.opcao === 'nave') || d.reduce((n, x) => n + x.preco, 0) >= IA.compraMin;
  }

  #irComprar(j) {
    const d = this.#desejos(j)[0];
    const area = PLATAFORMA[d.servico][j.time];
    this.#mudar(j, 'pousar', { destino: { x: area.x, z: area.z, area } });
  }

  /** Pousado e parado na plataforma: faz os pedidos dela (os mesmos do cliente). */
  #comprar(j, servico) {
    for (const d of this.#desejos(j)) {
      if (d.servico !== servico) continue;
      this.world.servicos.pedido(j, d.pedido);
    }
    this.#equiparDesejado(j);
  }

  /**
   * Põe na nave o equipamento desejado que está no compartimento, cada um no
   * encaixe vazio da categoria (potenciador: o primeiro vazio), pelo pedido do
   * cliente ({t:'equipar'}).
   */
  #equiparDesejado(j) {
    for (const chave of this.#equipDesejado(j)) {
      const x = j.inv.find((y) => y.chave === chave);
      if (!x || naNave(x, j.equipado, j.ship.encInst)) continue;
      const cat = EQUIPAMENTOS[chave].categoria;
      const eq = j.equipado;
      const slot = cat === 'potenciador' ? ['pot1', 'pot2'][eq.pot.indexOf(null)] : eq[cat] === null ? cat : undefined;
      if (slot) this.world.servicos.pedido(j, { t: 'equipar', slot, inst: x.id });
    }
  }

  /** Kit de reparo com a vida baixa; célula de energia brigando sem energia. */
  #usarItens(j, vida) {
    const s = j.ship;
    if (vida < IA.usarReparo && j.itens.reparo > 0) this.world.servicos.pedido(j, { t: 'usar', item: 'reparo' });
    if (j.ia.modo === 'atacar' && s.en / s.maxEn < IA.energiaCelula && j.itens.energia > 0) {
      this.world.servicos.pedido(j, { t: 'usar', item: 'energia' });
    }
  }

  // ---------- Pilotagem (a cada tick) ----------

  #agir(j) {
    const ia = j.ia;
    let cmd;
    if (ia.modo === 'atacar' && this.#alvoValido(j, ia.alvo)) cmd = this.#lutar(j, ia.alvo);
    else if (ia.modo === 'ir' && ia.destino) cmd = this.#navegar(j, ia.destino, false);
    else if (ia.modo === 'pousar' && ia.destino) cmd = this.#pousar(j, ia.destino);
    else if (ia.modo === 'recall') cmd = this.#recall(j);
    else cmd = { ...PARADO };
    // Pulsos (pouso e recall valem na borda do botão): um tick apertado, depois solto.
    cmd.p = ia.pulsoP;
    cmd.r = ia.pulsoR;
    ia.pulsoP = ia.pulsoR = false;
    return cmd;
  }

  #alvoValido(j, alvo) {
    if (!alvo?.vivo) return false;
    if (alvo.tipo === 'jogador') return this.world.players.has(alvo.id) && !this.#naPropriaBase(alvo) && this.#ve(j, alvo);
    if (alvo.time !== undefined) return !this.#naPropriaBase(alvo);
    return true;
  }

  /**
   * Linha livre da nave até (x, z), refeita a cada IA.linhaTicks (ou se o ponto
   * mudou muito): é o teste mais caro da pilotagem.
   */
  #livre(j, x, z) {
    const ia = j.ia;
    const tick = this.world.tick;
    const c = ia.linha;
    if (c && tick < c.ate && Math.hypot(c.x - x, c.z - z) < 25) return c.livre;
    const livre = nav().linhaLivre(j.ship.x, j.ship.z, x, z);
    ia.linha = { x, z, livre, ate: tick + IA.linhaTicks };
    return livre;
  }

  /** Mira adiantada, distância de briga e gatilho. */
  #lutar(j, alvo) {
    const w = this.world;
    const ia = j.ia;
    const s = j.ship;
    const t = alvo.ship;
    const d = dist(s, t);
    const z = armaDoEncaixe(s, 0);
    const x = armaDoEncaixe(s, 1);
    const alcance = Math.min(z?.alcance ?? 250, x?.alcance ?? 250);
    const garra = alvo.tipo === 'vorax';
    // Sem linha livre, contorna a rocha pelo caminho até ele.
    if (d > 60 && !this.#livre(j, t.x, t.z)) return this.#navegar(j, t, true);

    // Monstro de garra encostando: vira e se afasta um pouco, depois volta a atirar.
    if (garra && d < 45) ia.foge = Math.round(1.2 * TICK_HZ);
    if (ia.foge > 0) {
      ia.foge--;
      const diff = anguloEntre(s.yaw, yawPara(s, s.x * 2 - t.x, s.z * 2 - t.z));
      return { ...PARADO, th: 1, tu: clamp(diff * 3, -1, 1) };
    }

    const vel = z?.vel ?? 250;
    const voo = d / vel;
    const mx = t.x + (t.vx ?? 0) * voo;
    const mz = t.z + (t.vz ?? 0) * voo;
    const diff = anguloEntre(s.yaw, yawPara(s, mx, mz) + ia.erro);
    const ideal = garra ? 110 : alcance * 0.6;
    let th;
    if (d > ideal + 40) th = 1;
    else if (d < ideal - 60) th = Math.abs(diff) < 0.6 ? -0.6 : 0.2;
    else th = 0.25;
    th *= Math.max(0.3, 1 - Math.abs(diff) / 2);
    const boost = d > 450 && Math.abs(diff) < 0.25 && s.en / s.maxEn > 0.6;
    const pronto = w.tick >= ia.reagirEm && !w.estaProtegido(alvo);
    const tol = Math.max(0.05, Math.atan2((t.raio ?? 4.5) + 3, d));
    const mira = Math.abs(diff) < tol;
    return {
      ...PARADO,
      th,
      tu: clamp(diff * 3, -1, 1),
      b: boost,
      f1: pronto && mira && !!z && d < z.alcance * 0.95,
      f2: pronto && mira && !!x && d < x.alcance * 0.95,
      ...this.#desempacar(j, th),
    };
  }

  /**
   * Vai até `destino` ({x, z}): reto com linha livre, senão pelo campo de caminhos
   * (`movel` = o destino anda, refaz o caminho de tempos em tempos). Com
   * `chegada`, freia chegando.
   */
  #navegar(j, destino, movel, chegada = 0) {
    const ia = j.ia;
    const s = j.ship;
    const d = dist(s, destino);
    let px = destino.x;
    let pz = destino.z;
    if (d > 30 && !this.#livre(j, destino.x, destino.z)) {
      const campo = movel ? this.#campoMovel(j, destino) : campoFixo(destino.x, destino.z);
      const passo = nav().proximoPonto(campo, s.x, s.z);
      if (passo && !passo.chegou) {
        px = passo.x;
        pz = passo.z;
      }
    }
    const diff = anguloEntre(s.yaw, yawPara(s, px, pz));
    let th = Math.max(0.25, 1 - Math.abs(diff) / 1.6);
    if (chegada > 0) th = Math.min(th, clamp(d / chegada, 0.1, 1));
    const boost = !chegada && d > 450 && Math.abs(diff) < 0.2 && s.en / s.maxEn > 0.7;
    return { ...PARADO, th, tu: clamp(diff * 2.5, -1, 1), b: boost, ...this.#desempacar(j, th) };
  }

  /** Caminho até um alvo que anda: refeito quando ele se mexe ou de tempos em tempos. */
  #campoMovel(j, alvo) {
    const ia = j.ia;
    const tick = this.world.tick;
    const c = ia.campo;
    if (!c || tick >= c.ate || Math.hypot(c.x - alvo.x, c.z - alvo.z) > IA.campoMover) {
      ia.campo = { campo: nav().campo([{ x: alvo.x, z: alvo.z }], [j.ship]), x: alvo.x, z: alvo.z, ate: tick + Math.round(IA.campoS * TICK_HZ) };
    }
    return ia.campo.campo;
  }

  /** Preso numa quina (acelerando sem andar): dá ré virando por um instante. */
  #desempacar(j, th) {
    const ia = j.ia;
    const s = j.ship;
    if (ia.re > 0) {
      ia.re--;
      return { th: -0.7, tu: ia.ronda, b: false, f1: false, f2: false };
    }
    if (th > 0.5 && Math.hypot(s.vx, s.vz) < 4) ia.preso++;
    else ia.preso = 0;
    if (ia.preso > IA.presoS * TICK_HZ) {
      ia.preso = 0;
      ia.re = Math.round(IA.reS * TICK_HZ);
      ia.ronda = -ia.ronda;
    }
    return {};
  }

  /**
   * Chega na área de pouso com a velocidade caindo com a distância (sem ficar
   * rodando em volta da plataforma), e aperta o L já devagar e dentro dela.
   */
  #pousar(j, destino) {
    const s = j.ship;
    const area = destino.area;
    const d = dist(s, area);
    if (d > IA.pousoPerto) return this.#navegar(j, area, false);
    const vel = Math.hypot(s.vx, s.vz);
    if (d < area.raio * 0.7 && vel < IA.pousoVel) {
      if (!s.pousado) j.ia.pulsoP = true;
      return { ...PARADO };
    }
    const diff = anguloEntre(s.yaw, yawPara(s, area.x, area.z));
    const querida = clamp((d - 2) * IA.pousoFreio, 0, velocidadeBase(s));
    const th = (querida / velocidadeBase(s)) * Math.max(0.15, 1 - Math.abs(diff) / 1.2);
    return { ...PARADO, th, tu: clamp(diff * 3, -1, 1), ...this.#desempacar(j, th) };
  }

  /** Recall: para a nave, aperta o B e fica quieto até chegar. */
  #recall(j) {
    const ia = j.ia;
    const s = j.ship;
    const tick = this.world.tick;
    // Chegou: na base, vai pousar para consertar.
    if (!j.recall && dist(s, BASES[j.time]) < BASES[j.time].raio) {
      this.#voltarParaBase(j);
      return { ...PARADO };
    }
    if (!j.recall && Math.hypot(s.vx, s.vz) < RECALL_VEL_MAX * 0.6 && tick - ia.recallEm > TICK_HZ) {
      ia.pulsoR = true;
      ia.recallEm = tick;
    }
    return { ...PARADO };
  }
}
