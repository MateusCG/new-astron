// Jungle do Stage 6 (só no servidor): os monstros dos acampamentos, o buff de ataque
// (SN-4), a Ancient Medusa e a sonda errante (CONTRATO-MAPA-STAGE6.md; números das
// espécies em server/especies.js). Substitui os Arnosh, Vorax, Krakor e o guardião
// do mapa antigo.
//
// Quem nasce onde (o time 1 é o time 0 girado 180°, com as MESMAS espécies no
// acampamento correspondente: JB0N ↔ JB1S, JC0S ↔ JC1N...):
// - acampamento da base de cima (JB0N) 4 Armish, da base de baixo (JB0S) 4 Chrometic;
// - acampamento do centro de cima (JC0N) 1 Grande Xerxes + 2 Xerxes, do centro de
//   baixo (JC0S) 1 Anti + 2 Bazit;
// - buffs de ataque (BA0, BA1): um SN-4 cada;
// - poço de baixo (MEDUSA): a Ancient Medusa;
// - coluna central (SONDA): a sonda errante.
//
// Tempos (TEMPOS_JUNGLE, contados do começo da partida; a recarga conta da morte):
// acampamento aos 0:00, no mesmo tick em que a preparação acaba (pedido do Mateus),
// e de novo 1:30 depois de o acampamento INTEIRO morrer (um
// monstro sozinho não volta); SN-4 aos 1:30, volta 4:00 depois; sonda aos 3:00, volta
// 2:00 depois; Medusa aos 5:00, volta 5:00 depois. Partida nova recomeça o relógio.
//
// Ondas (DEGRAUS_JUNGLE): a quantidade de monstros dos acampamentos cresce com a
// partida, pelo tempo RESTANTE do relógio que o jogador vê: até 15:00 restantes a
// composição normal (×1); de 15:00 restantes ×2; de 10:00 ×3; de 5:00 até o fim ×4
// (não passa disso). Multiplica cada espécie da COMPOSICAO (4 Armish → 8 → 12 → 16;
// 1 Grande Xerxes + 2 Xerxes → 2 + 4...), nos 8 acampamentos dos dois territórios;
// o SN-4, a Medusa e a sonda não multiplicam. Quando o degrau sobe:
// - acampamento vivo recebe NA HORA os que faltam para a quantidade nova (reforço;
//   se o grupo está com raiva de alguém, o reforço chega com a mesma raiva);
// - acampamento em recarga volta já com a quantidade nova, e o que ainda não
//   apareceu nasce com a quantidade do momento;
// - o renascimento continua só quando o acampamento INTEIRO (reforço incluído) morre.
// O ouro de cada monstro de acampamento sobe junto (pedido do Mateus): ×1,5 com
// 15:00 restantes, ×2 com 10:00 e ×2,5 com 5:00 (o `ouro` de cada degrau), pelo
// degrau da hora do abate (não do nascimento). Mais devagar que a quantidade, para o
// acampamento inteiro não render 16 vezes mais no fim: limpar um acampamento ×4 paga
// 10 vezes o do começo. A XP não muda.
// Sem relógio (modo de teste, `semTempo`) conta o tempo da jungle desde o começo
// (comecar), como se a partida tivesse DURACAO_PARTIDA_S: no modo de teste os
// degraus vêm aos 5, 10 e 15 minutos de mundo. Partida nova volta a ×1.
// Lugares (lugaresAcampamento): os da composição normal são os fixos de LUGARES; os
// a mais vão em anéis em volta do centro do acampamento, o primeiro lugar livre
// (sem encostar nos outros, ESPACO_LUGAR além dos raios, e sem rocha nem
// construção), no referencial do time 0 e girados 180° para o time 1, sempre iguais.
//
// Comportamento (o mesmo para todos, salvo a sonda):
// - PASSIVOS: patrulham devagar em volta do ponto deles e só atacam quem os atacou.
//   Atacar um monstro provoca o grupo inteiro (o acampamento), e a raiva dura RAIVA_S
//   depois do último golpe (esquece também quando o jogador morre ou o monstro morre).
// - Provocado e sem alcance (longe demais, ou com rocha no meio), o monstro SE
//   APROXIMA de quem o atacou até ter alcance com linha livre (MD §10); com rocha no
//   meio, contorna pela grade de server/navegacao.js. Com alcance, para e atira.
// - Não passa do TERRITÓRIO (raio em volta do ponto dele: 250 m nos comuns, 175 m
//   nos chefes): passou, desiste de todo mundo e volta para o ponto regenerando rápido
//   (REGEN_VOLTA_FRAC), como o "leash" dos MOBAs. Alvo que se afasta demais do
//   território (território + alcance + DESISTE_FOLGA) também é esquecido.
// - Ninguém ataca quem está numa zona segura (nem anda atrás).
// - Fora de combate (sem raiva e sem dano há REGEN_ESPERA_S) regenera; a Medusa
//   regenera um pouco sempre (regenHpS).
// A sonda não ataca: anda pelo trajeto da coluna central (trajetoSonda), pausa nas
// pontas e, atacada, FOGE pelo trajeto para longe de quem a atacou. Não aparece
// enquanto a Medusa ou o Núcleo de He-3 estiverem vivos (o Núcleo é da frente
// Objetivos: world.objetivos.nucleoVivo(), se existir); se já estava viva quando
// um deles apareceu, continua.
//
// Golpe final (quem matou: o jogador do último dano; XP e ouro do abate saem de
// RECOMPENSA em server/progressao.js, pelo World): SN-4 → bônus de nave 'ataque'
// (+20% de dano, BONUS_ATAQUE_S); sonda → bônus de nave 'sonda' (velocidade,
// BONUS_SONDA_S); Medusa → cada piloto do time de quem matou ganha o ouro e o XP da
// Medusa e o time ganha o bônus 'medusa' (BONUS_MEDUSA_S). Os efeitos dos bônus são
// aplicados por server/bonus.js e pelo World.
//
// Os ataques são golpes no formato das armas (server/golpes.js golpeDeMonstro),
// salvo a chama, que é dano direto num cone (evento 'chama' para o desenho).

import { DT, HOVER, SHIP_RADIUS, createShip, stepShip, velocidadeBase } from '../shared/sim.js';
import { ACAMPAMENTOS, BUFFS, MEDUSA, BASES, heightAt, trajetoSonda, cruzaCampoBase } from '../shared/terrain.js';
import { bloqueiaVisao } from '../shared/visao.js';
import { MISSIL_CONE } from '../shared/armas.js';
import { alturaSolida, pontoLivre } from '../shared/obstaculos.js';
import { MapaNavegacao } from './navegacao.js';
import { ESPECIES, TERRITORIO_COMUM, alcanceMaximo } from './especies.js';
import { ganharXp } from './progressao.js';
import { DURACAO_PARTIDA_S } from './partida.js';
import { BONUS, BONUS_NAVE } from './bonus.js';

const TICK_HZ = Math.round(1 / DT);
const ticks = (s) => Math.round(s * TICK_HZ);

/** Quando cada coisa aparece (primeiroS, do começo da partida) e volta (voltaS, da morte). */
export const TEMPOS_JUNGLE = {
  acampamento: { primeiroS: 0, voltaS: 90 }, // nascem quando a preparação acaba (pedido do Mateus)
  ataque: { primeiroS: 90, voltaS: 240 },
  sonda: { primeiroS: 180, voltaS: 120 },
  medusa: { primeiroS: 300, voltaS: 300 },
};
/**
 * Ondas da jungle: de `restanteS` segundos restantes de partida para baixo, os
 * acampamentos têm `mult` vezes a composição (em ordem crescente de mult) e cada
 * monstro deles paga `ouro` vezes o ouro da espécie.
 */
export const DEGRAUS_JUNGLE = [
  { restanteS: 900, mult: 2, ouro: 1.5 }, // 15:00 restantes (5 min de partida)
  { restanteS: 600, mult: 3, ouro: 2 }, // 10:00
  { restanteS: 300, mult: 4, ouro: 2.5 }, // 5:00 até o fim
];
/** m além da soma dos raios entre dois lugares do acampamento (maior que AFASTAR: não nascem se empurrando). */
export const ESPACO_LUGAR = 8;
/** Lugares a mais: anéis de PASSO_ANEL m em volta do centro, pontos a cada PASSO_ARCO m no anel, até ANEL_MAX m. */
const PASSO_ANEL = 6;
const PASSO_ARCO = 4;
const ANEL_MAX = 140;
/** m de chão livre além do raio do monstro em volta do lugar. */
const FOLGA_ROCHA_LUGAR = 3;
/** s de raiva depois do último golpe recebido. */
export const RAIVA_S = 20;
/** Atacar um monstro provoca o acampamento inteiro (sugestão da pesquisa). */
export const PROVOCA_GRUPO = true;
/** Duração dos bônus do golpe final (s): as de server/bonus.js (90, 40 e 120). */
export const BONUS_ATAQUE_S = BONUS_NAVE.ataque.s;
export const BONUS_SONDA_S = BONUS_NAVE.sonda.s;
export const BONUS_MEDUSA_S = BONUS.medusa.s;

/**
 * Espécies de cada acampamento, no referencial do time 0 (o do time 1 é o girado:
 * JB1S tem as do JB0N, JB1N as do JB0S, e assim por diante).
 */
export const COMPOSICAO = {
  JB0N: ['armish', 'armish', 'armish', 'armish'],
  JB0S: ['chrometic', 'chrometic', 'chrometic', 'chrometic'],
  JC0N: ['great_xerxes', 'xerxes', 'xerxes'],
  JC0S: ['anti', 'bazit', 'bazit'],
};
/** Onde cada um fica no acampamento (m do centro, referencial do time 0), na ordem da composição. */
const LUGARES = {
  base: [[-20, -20], [20, -20], [-20, 20], [20, 20]],
  centro: [[0, 0], [-32, 10], [32, 10]],
};

const RAIVA_TICKS = ticks(RAIVA_S);
const DESISTE_FOLGA = 100; // m além de território + alcance: alvo mais longe é esquecido
const PERTO_CASA = 12; // m: voltando, chegou
const ALCANCE_FOLGA = 0.85; // aproxima até esta fração do alcance (atirar sem ficar na beira)
const ENCOSTO = 8; // m além dos raios: não chega mais perto que isso de quem caça
const AFASTAR = 6; // m além dos raios: dois monstros mais perto que isso se empurram
const PATRULHA_RAIO = 15; // m em volta do ponto do monstro
const PATRULHA_VEL = 0.35; // fração da velocidade patrulhando
const PATRULHA_TROCA_TICKS = ticks(6);
const CAMINHO_TICKS = 15; // de quanto em quanto tempo refaz o caminho em volta da rocha
const PRESO_TICKS = ticks(1.5); // parado querendo andar: dá ré
const RE_TICKS = ticks(0.6);
const REGEN_ESPERA_TICKS = ticks(5); // sem dano há isto: regenera
const REGEN_FRAC = 0.03; // do HP máximo por s, fora de combate
const REGEN_FRAC_CHEFE = 0.02;
const REGEN_VOLTA_FRAC = 0.25; // do HP máximo por s, voltando para o ponto (passou do território)
const RAIO_TIRO = 5; // m: raio de acerto do projétil de monstro (sem raioTiro na espécie)
const VIDA_TIRO_FOLGA = 1.15; // o projétil voa um pouco além do alcance
const MISSIL_COMECA_S = 0.15; // s de voo reto antes de o míssil começar a curvar
const CAMPO_ARMA_S = 0.5; // s até o campo começar a ferir
const VEL_ONDA_PADRAO = 120; // m/s da onda em volta (nova)
const SONDA_PAUSA_TICKS = ticks(4); // pausa nas pontas do trajeto
const SONDA_FUGA_TICKS = ticks(6); // foge por isto depois do último golpe
const SONDA_PASSEIO = 0.5; // fração da velocidade passeando (fugindo, vai no máximo)
// Corpo grande (raio maior que o da nave, SHIP_RADIUS): o stepShip só engorda as
// paredes pelo raio da nave, então um chefe largo (o SN-4 tem 26 m) entraria com
// metade do casco na rocha. Depois do passo, o monstro grande que saiu de um lugar
// com o corpo livre e foi para um onde ele bate na rocha volta para onde estava
// (parado; a ré de quando fica preso resolve a quina).
const CORPO_PONTOS = 12; // pontos na borda do corpo conferidos contra a rocha
const CORPO_ROCHA = 0.5; // m: chão acima disto na borda = rocha
const SONDA_OLHAR = 30; // m adiante e atrás no trajeto para decidir o lado da fuga

// A grade de navegação depende só do terreno: uma por processo, na primeira vez que
// um monstro precisa contornar uma rocha. A zona segura das bases e o bolsão atrás
// do campo de força de cada uma ficam bloqueados.
let navegacao = null;
function nav() {
  navegacao ??= new MapaNavegacao({ raioBloqueio: BASES[0].raio + 5, bloquearBolsoes: true });
  return navegacao;
}

function anguloEntre(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const yawPara = (x, z, ax, az) => Math.atan2(-(ax - x), -(az - z));
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

/** O corpo de raio `r` centrado em (x, z) cabe sem encostar em rocha nem construção? */
export function corpoLivre(x, z, r) {
  if (alturaSolida(x, z, r) > heightAt(x, z) + CORPO_ROCHA) return false;
  for (let i = 0; i < CORPO_PONTOS; i++) {
    const a = (i / CORPO_PONTOS) * Math.PI * 2;
    if (heightAt(x + Math.cos(a) * r, z + Math.sin(a) * r) > CORPO_ROCHA) return false;
  }
  return true;
}

/** Id do acampamento no referencial do time 0 (o do time 1 girado: 0 ↔ 1, N ↔ S). */
export function idNoTime0(a) {
  return a.time === 0 ? a.id : a.id.replace(/[01NS]/g, (c) => ({ 0: '1', 1: '0', N: 'S', S: 'N' })[c]);
}

/** Projéteis de um disparo: [{off, ang}] lado a lado (vão) ou em leque, centrados. */
function padraoTiros(a) {
  const n = Math.max(1, a.tiros ?? 1);
  return Array.from({ length: n }, (_, i) => {
    const k = i - (n - 1) / 2;
    return a.leque ? { off: 0, ang: k * a.leque } : { off: k * (a.vao ?? 0), ang: 0 };
  });
}

const GOLPES = new Map();
/** O golpe (formato de server/golpes.js) de um ataque da espécie, montado uma vez. */
export function golpeDoAtaque(a) {
  if (GOLPES.has(a)) return GOLPES.get(a);
  const base = { prof: 0, dano: a.dano, efeitos: a.efeito ? [a.efeito] : [], area: a.area ?? 0, tipoDano: a.tipoDano, atq: a.atq, vis: {}, inimigo: true, aliado: false, atravessa: false };
  let g;
  if (a.forma === 'projetil' || a.forma === 'guiado') {
    g = {
      ...base,
      forma: 'projetil',
      raio: a.raioTiro ?? RAIO_TIRO,
      vel: a.vel,
      vida: (a.alcance / a.vel) * VIDA_TIRO_FOLGA,
      tiros: padraoTiros(a),
      rajada: 1,
      rajadaS: 0,
      varre: null,
      alcance: a.alcance,
      fim: (a.area ?? 0) > 0,
    };
    if (a.forma === 'guiado') g.guia = { comeca: MISSIL_COMECA_S, giro: a.giro, cone: MISSIL_CONE, alcance: a.alcance };
  } else if (a.forma === 'nova') {
    g = { ...base, forma: 'nova', area: a.alcance, raio: 0, vida: 0, nova: { raio: a.alcance, vel: a.velOnda ?? VEL_ONDA_PADRAO } };
  } else if (a.forma === 'campo') {
    g = { ...base, forma: 'campo', area: a.raioCampo, raio: 0, vida: a.vidaS, armaS: CAMPO_ARMA_S, intervalo: a.intervaloCampoS };
  } else g = null; // cone: dano direto (Jungle#chama)
  GOLPES.set(a, g);
  return g;
}

/** Junta os tempos padrão com os pedidos (testes encurtam). */
function mesclarTempos(pedidos = {}) {
  const t = {};
  for (const [k, v] of Object.entries(TEMPOS_JUNGLE)) t[k] = { ...v, ...(pedidos[k] ?? {}) };
  return t;
}

/** Multiplicador dos acampamentos com `restanteS` segundos de partida pela frente (pelos `degraus`). */
export function multJungle(restanteS, degraus = DEGRAUS_JUNGLE) {
  let mult = 1;
  for (const d of degraus) if (restanteS <= d.restanteS + 1e-9) mult = Math.max(mult, d.mult);
  return mult;
}

/** Multiplicador do ouro de cada monstro de acampamento com `restanteS` segundos de partida pela frente. */
export function ouroJungle(restanteS, degraus = DEGRAUS_JUNGLE) {
  let ouro = 1;
  for (const d of degraus) if (restanteS <= d.restanteS + 1e-9) ouro = Math.max(ouro, d.ouro ?? 1);
  return ouro;
}

/** As espécies do acampamento (id no referencial do time 0) com a composição multiplicada por `mult`. */
export function especiesAcampamento(id0, mult = 1) {
  const base = COMPOSICAO[id0];
  return Array.from({ length: base.length * mult }, (_, i) => base[i % base.length]);
}

// Lugares de cada acampamento do time 0, em m do centro, na ordem das espécies de
// especiesAcampamento: crescem sob demanda (o lugar i nunca muda, então o reforço
// cai sempre nos mesmos pontos e a lista de ×2 é o começo da de ×4).
const LUGARES_CACHE = new Map();

/**
 * Os `n` primeiros lugares (absolutos) do acampamento `a` (de ACAMPAMENTOS). Os da
 * composição normal são os fixos (LUGARES); os outros, o primeiro ponto livre em
 * anéis em volta do centro: longe dos outros (raios + ESPACO_LUGAR), com o corpo
 * livre de rocha e construção. Calculado no acampamento do time 0 e girado 180°
 * para o do time 1 (o mapa é simétrico assim).
 */
export function lugaresAcampamento(a, n) {
  const id0 = idNoTime0(a);
  const a0 = ACAMPAMENTOS.find((x) => x.id === id0);
  const base = COMPOSICAO[id0];
  let offs = LUGARES_CACHE.get(id0);
  if (!offs) {
    offs = LUGARES[a0.tipo].slice(0, base.length).map(([x, z], i) => ({ x, z, r: ESPECIES[base[i]].raio }));
    LUGARES_CACHE.set(id0, offs);
  }
  while (offs.length < n) {
    const r = ESPECIES[base[offs.length % base.length]].raio;
    offs.push(lugarLivre(a0, offs, r) ?? { x: 0, z: 0, r });
  }
  const s = a.time === 0 ? 1 : -1;
  return offs.slice(0, n).map((o) => ({ x: a.x + s * o.x, z: a.z + s * o.z }));
}

/** O primeiro ponto dos anéis em volta do acampamento `a0` (time 0) onde cabe um monstro de raio `r`. */
function lugarLivre(a0, ocupados, r) {
  for (let R = 0; R <= ANEL_MAX; R += PASSO_ANEL) {
    const n = R === 0 ? 1 : Math.ceil((2 * Math.PI * R) / PASSO_ARCO);
    for (let k = 0; k < n; k++) {
      const ang = (k / n) * Math.PI * 2;
      const x = +(Math.cos(ang) * R).toFixed(2);
      const z = +(Math.sin(ang) * R).toFixed(2);
      if (ocupados.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + r + ESPACO_LUGAR)) continue;
      const ax = a0.x + x;
      const az = a0.z + z;
      if (!pontoLivre(ax, az, r + FOLGA_ROCHA_LUGAR) || !corpoLivre(ax, az, r + FOLGA_ROCHA_LUGAR)) continue;
      return { x, z, r };
    }
  }
  return null;
}

/** Os lugares de nascimento do mapa (acampamentos, buffs de ataque, Medusa, sonda). */
function montarCovis() {
  const covis = [];
  for (const a of ACAMPAMENTOS) {
    // especies e lugares crescem com o degrau da partida (Jungle#ajustarOnda).
    const especies = especiesAcampamento(idNoTime0(a));
    covis.push({ id: a.id, tipo: 'acampamento', time: a.time, x: a.x, z: a.z, raio: a.raio, especies, lugares: lugaresAcampamento(a, especies.length), acampamento: a, mult: 1 });
  }
  for (const b of BUFFS) {
    if (b.tipo !== 'ataque') continue;
    covis.push({ id: b.id, tipo: 'ataque', time: b.time, x: b.x, z: b.z, raio: 20, especies: ['sn4'], lugares: [{ x: b.x, z: b.z }] });
  }
  covis.push({ id: 'MEDUSA', tipo: 'medusa', x: MEDUSA.x, z: MEDUSA.z, raio: MEDUSA.raio, especies: ['medusa'], lugares: [{ x: MEDUSA.x, z: MEDUSA.z }] });
  covis.push({ id: 'SONDA', tipo: 'sonda', x: 0, z: 0, raio: 0, especies: ['sonda'], lugares: [] });
  for (const c of covis) Object.assign(c, { membros: [], estado: 'espera', proxTick: Infinity, ponta: 0, time: c.time, ultimoTime: null });
  return covis;
}

/** Ponto do trajeto da sonda a `s` m do começo. */
function pontoNoTrajeto(m, s) {
  const t = m.trajeto;
  for (let i = 1; i < t.length; i++) {
    if (s <= m.cum[i] || i === t.length - 1) {
      const seg = m.cum[i] - m.cum[i - 1] || 1;
      const k = clamp((s - m.cum[i - 1]) / seg, 0, 1);
      return { x: t[i - 1].x + (t[i].x - t[i - 1].x) * k, z: t[i - 1].z + (t[i].z - t[i - 1].z) * k };
    }
  }
  return { ...t[0] };
}

export class Jungle {
  /**
   * @param {import('./game.js').World} world
   * @param {{ ferir: Function, podeAcertar: Function, naZonaSegura: Function,
   *   ativo?: boolean, tempos?: object }} ctx os privados do World que a jungle usa
   *   (ferir passa por zona segura, status, escudo, morte e recompensa). ativo =
   *   false: mundo sem monstros (testes). tempos: troca TEMPOS_JUNGLE (testes); com
   *   `tempos.degraus`, troca DEGRAUS_JUNGLE (o `temposJungle` do World leva junto).
   */
  constructor(world, { ferir, podeAcertar, naZonaSegura, ativo = true, tempos } = {}) {
    this.world = world;
    this.ctx = { ferir, podeAcertar, naZonaSegura };
    const { degraus = DEGRAUS_JUNGLE, ...resto } = tempos ?? {};
    this.tempos = mesclarTempos(resto);
    this.degraus = degraus;
    this.covis = ativo ? montarCovis() : [];
    /** Monstros que existem agora (vivos e os mortos até o lugar deles renascer). */
    this.lista = [];
    /** Tick em que o relógio da jungle começou (comecar) e o multiplicador dos acampamentos agora. */
    this.inicioTick = 0;
    this.mult = 1;
  }

  get tick() {
    return this.world.tick;
  }

  /** Monstros vivos. */
  vivos() {
    return this.lista.filter((m) => m.vivo);
  }

  /** O lugar de nascimento pelo id ('JB0N', 'BA0', 'MEDUSA', 'SONDA'). */
  covil(id) {
    return this.covis.find((c) => c.id === id) ?? null;
  }

  // ---------- Relógio ----------

  /** Partida nova: somem os monstros dos lugares e o relógio de cada lugar recomeça de `tick` (os avulsos ficam). */
  comecar(tick = this.tick) {
    this.lista = this.lista.filter((m) => !m.covil);
    this.inicioTick = tick;
    this.mult = this.multAgora(tick); // partida nova: ×1
    this.#definirMult(this.mult);
    for (const c of this.covis) {
      Object.assign(c, { membros: [], estado: 'espera', ponta: 0, ultimoTime: null });
      c.proxTick = tick + ticks(this.tempos[c.tipo].primeiroS);
    }
  }

  /** Servidor vazio: nenhum monstro dos lugares e nada para nascer até a próxima partida. */
  limpar() {
    this.lista = this.lista.filter((m) => !m.covil);
    this.mult = 1;
    this.#definirMult(1);
    for (const c of this.covis) Object.assign(c, { membros: [], estado: 'espera', proxTick: Infinity, ponta: 0, ultimoTime: null });
  }

  /**
   * Segundos que faltam na partida para as ondas: o do relógio da partida; sem
   * relógio (modo de teste) ou fora do andamento, DURACAO_PARTIDA_S menos o tempo
   * da jungle desde o começo.
   */
  restanteS(tick = this.tick) {
    const p = this.world.partida;
    if (p?.emAndamento && !p.semTempo) return p.restante(tick);
    return DURACAO_PARTIDA_S - Math.max(0, (tick - this.inicioTick) * DT);
  }

  /** Multiplicador dos acampamentos no `tick` (DEGRAUS_JUNGLE). */
  multAgora(tick = this.tick) {
    return multJungle(this.restanteS(tick), this.degraus);
  }

  /**
   * Quanto o ouro do abate do monstro `m` vale agora: o `ouro` do degrau, nos de
   * acampamento; 1 no SN-4, na Medusa, na sonda e nos avulsos.
   */
  multOuro(m, tick = this.tick) {
    return m?.covil?.tipo === 'acampamento' ? ouroJungle(this.restanteS(tick), this.degraus) : 1;
  }

  /** Troca a composição dos acampamentos para `mult` (não cria nem tira monstro). */
  #definirMult(mult) {
    for (const c of this.covis) {
      if (c.tipo !== 'acampamento' || c.mult === mult) continue;
      c.mult = mult;
      c.especies = especiesAcampamento(idNoTime0(c.acampamento), mult);
      c.lugares = lugaresAcampamento(c.acampamento, c.especies.length);
    }
  }

  /**
   * O degrau subiu: composição nova, e cada acampamento vivo recebe na hora os que
   * faltam (com a raiva que o grupo tiver). Os que esperam nascem já com ela.
   */
  #ajustarOnda(mult) {
    this.mult = mult;
    this.#definirMult(mult);
    for (const c of this.covis) {
      if (c.tipo !== 'acampamento' || c.estado !== 'ativo') continue;
      const vivo = c.membros.find((m) => m.vivo);
      for (let i = c.membros.length; i < c.especies.length; i++) {
        const novo = this.#criarNoLugar(c, i);
        if (vivo) for (const [id, ate] of vivo.raiva) novo.raiva.set(id, ate);
        c.membros.push(novo);
      }
    }
  }

  /** A Medusa está viva? */
  medusaViva() {
    return this.covil('MEDUSA')?.estado === 'ativo';
  }

  /** A sonda pode aparecer agora? (não com a Medusa ou o Núcleo de He-3 vivos) */
  sondaLiberada() {
    return !this.medusaViva() && !(this.world.objetivos?.nucleoVivo?.() ?? false);
  }

  // ---------- Nascimento ----------

  /**
   * Monstro novo da espécie `esp` com ponto (casa) em (x, z). `covil` = o lugar dele
   * (null num monstro avulso, que não renasce: testes e modo de teste). `territorio`
   * troca o da espécie.
   */
  criarMonstro(esp, x, z, { covil = null, yaw = 0, territorio } = {}) {
    const cfg = ESPECIES[esp];
    if (!cfg) throw new Error(`espécie desconhecida: ${esp}`);
    const ship = createShip('mechan', x, z, yaw); // 'mechan' só para a física (stepShip)
    ship.hp = ship.maxHp = cfg.hp;
    ship.raio = cfg.raio;
    const m = {
      id: this.world.nextId++,
      tipo: 'monstro',
      esp,
      nome: cfg.nome,
      drone: true, // inimigo do PvE: o cliente pinta de vermelho e tiro de monstro não acerta monstro
      danoMult: 1, // o dano já vem no ataque
      cfg,
      covil,
      casa: { x, z },
      territorio: territorio ?? cfg.territorio ?? TERRITORIO_COMUM,
      alcance: alcanceMaximo(esp),
      ship,
      vivo: true,
      respawnTick: Infinity, // quem renasce é o lugar (covil), não o monstro
      ultimoDano: 0,
      raiva: new Map(),
      prox: cfg.ataques.map(() => 0), // tick em que cada ataque fica pronto
      livreAte: 0, // Medusa: entre um ataque e outro
      voltando: false,
      patrulha: null,
      trocaPatrulha: 0,
      caminho: null,
      preso: 0,
      re: 0,
      giro: 1,
      atacadoPor: null,
      atacadoTick: -Infinity,
    };
    if (cfg.foge) this.#prepararSonda(m, covil?.ponta ?? 0);
    this.lista.push(m);
    return m;
  }

  #nascer(c) {
    this.lista = this.lista.filter((m) => !c.membros.includes(m)); // os mortos da vez passada saem
    c.membros = c.especies.map((_, i) => this.#criarNoLugar(c, i));
    c.estado = 'ativo';
    c.proxTick = Infinity;
    if (c.tipo !== 'acampamento') {
      const p = c.membros[0].ship;
      this.world.eventos.push({ e: 'objetivo', id: c.id, acao: 'apareceu', x: +p.x.toFixed(1), z: +p.z.toFixed(1) });
    }
    if (c.tipo === 'sonda') c.ponta = 1 - c.ponta; // a próxima nasce na outra ponta
  }

  /** O monstro `i` do lugar `c` (espécie e ponto da vez), olhando para o centro do mapa. */
  #criarNoLugar(c, i) {
    const p = c.lugares[i] ?? { x: c.x, z: c.z };
    return this.criarMonstro(c.especies[i], p.x, p.z, { covil: c, yaw: yawPara(p.x, p.z, 0, 0) });
  }

  // ---------- Passo ----------

  /** Um passo: nascimentos pelo relógio e a IA de cada monstro vivo. */
  passo() {
    const t = this.tick;
    if (this.covis.length) {
      const mult = this.multAgora(t);
      if (mult !== this.mult) this.#ajustarOnda(mult);
    }
    for (const c of this.covis) {
      if (c.estado === 'ativo' || t < c.proxTick) continue;
      if (c.tipo === 'sonda' && !this.sondaLiberada()) continue; // espera a Medusa e o Núcleo
      this.#nascer(c);
    }
    for (const m of this.lista) {
      if (!m.vivo) continue;
      if (m.cfg.foge) this.#sonda(m);
      else this.#agir(m);
      this.#regen(m);
    }
  }

  // ---------- Raiva ----------

  /**
   * Gancho do dano (World.#ferir): o jogador `autorId` atacou o monstro `m`. Ele (e o
   * acampamento dele) fica com raiva do jogador por RAIVA_S.
   */
  provocar(m, autorId) {
    const j = this.world.players.get(autorId);
    if (!j || m.tipo !== 'monstro') return;
    m.atacadoPor = j.id;
    m.atacadoTick = this.tick;
    const ate = this.tick + RAIVA_TICKS;
    const grupo = PROVOCA_GRUPO && m.covil ? m.covil.membros : [m];
    for (const o of grupo) if (o.vivo && !o.voltando) o.raiva.set(j.id, ate);
  }

  /** O monstro está com raiva do jogador `j` agora? (esquece quem morreu ou passou do tempo) */
  provocado(m, j) {
    const ate = m.raiva.get(j.id);
    if (ate === undefined) return false;
    if (ate > this.tick && j.vivo && this.world.players.has(j.id)) return true;
    m.raiva.delete(j.id);
    return false;
  }

  /**
   * Quem o monstro caça: o mais perto entre os que o provocaram, fora da zona segura
   * e não longe demais do território (quem foge para longe é esquecido).
   */
  #alvo(m) {
    const w = this.world;
    let melhor = null;
    let dMelhor = Infinity;
    for (const id of [...m.raiva.keys()]) {
      const j = w.players.get(id);
      if (!j || !this.provocado(m, j)) {
        m.raiva.delete(id);
        continue;
      }
      if (dist(j.ship, m.casa) > m.territorio + m.alcance + DESISTE_FOLGA) {
        m.raiva.delete(id);
        continue;
      }
      if (this.ctx.naZonaSegura(j.ship)) continue;
      const d = dist(j.ship, m.ship);
      if (d < dMelhor) {
        dMelhor = d;
        melhor = j;
      }
    }
    return melhor;
  }

  // ---------- IA dos monstros que atacam ----------

  #agir(m) {
    const s = m.ship;
    if (!m.voltando && dist(s, m.casa) > m.territorio) m.voltando = true;
    let alvo = null;
    if (m.voltando) {
      m.raiva.clear(); // passou do território: desiste de todo mundo
      if (dist(s, m.casa) < PERTO_CASA) m.voltando = false;
    } else alvo = this.#alvo(m);

    let destino = null;
    let fracVel = 1;
    if (m.voltando) destino = m.casa;
    else if (alvo) destino = this.#aproximar(m, alvo);
    else {
      destino = this.#patrulha(m);
      fracVel = PATRULHA_VEL;
    }
    const antes = { x: s.x, z: s.z };
    stepShip(s, this.#dirigir(m, destino, alvo, fracVel));
    // Monstro grande não entra na rocha; e nenhum atravessa o campo de força de uma
    // base (a grade já não leva para lá; isto segura quem vai reto atrás do alvo).
    const naRocha = s.raio > SHIP_RADIUS && !corpoLivre(s.x, s.z, s.raio) && corpoLivre(antes.x, antes.z, s.raio);
    if ((s.x !== antes.x || s.z !== antes.z) && (naRocha || cruzaCampoBase(antes.x, antes.z, s.x, s.z))) {
      s.x = antes.x;
      s.z = antes.z;
      s.vx = s.vz = 0;
    }
    if (alvo) this.#atacar(m, alvo);
  }

  /**
   * Para onde ir atrás do alvo: null se já tem alcance com linha livre (fica e
   * atira); reto até ele se a linha está livre; senão o próximo ponto do caminho
   * em volta da rocha.
   */
  #aproximar(m, alvo) {
    const s = m.ship;
    const a = alvo.ship;
    const d = dist(s, a);
    const livre = !bloqueiaVisao(s.x, s.z, a.x, a.z);
    if (livre && d <= m.alcance * ALCANCE_FOLGA) return null;
    if (livre) return a;
    if (!m.caminho || this.tick >= m.caminho.ate) {
      const campo = nav().campo([a], [s]);
      m.caminho = { campo, ate: this.tick + CAMINHO_TICKS };
    }
    return nav().proximoPonto(m.caminho.campo, s.x, s.z) ?? a;
  }

  /** Patrulha curta em volta do ponto do monstro (os chefes ficam quase parados). */
  #patrulha(m) {
    const s = m.ship;
    const raio = m.cfg.chefe ? PATRULHA_RAIO / 2 : PATRULHA_RAIO;
    if (dist(s, m.casa) > raio * 2) return m.casa;
    if (!m.patrulha || this.tick >= m.trocaPatrulha || dist(s, m.patrulha) < 4) {
      const ang = this.world.rng() * Math.PI * 2;
      const r = this.world.rng() * raio;
      m.patrulha = { x: m.casa.x + Math.cos(ang) * r, z: m.casa.z + Math.sin(ang) * r };
      m.trocaPatrulha = this.tick + PATRULHA_TROCA_TICKS;
    }
    return m.patrulha;
  }

  /** O comando do stepShip para ir até `destino` (ou só virar para o alvo), afastando-se dos outros monstros. */
  #dirigir(m, destino, alvo, fracVel) {
    const s = m.ship;
    const parado = { th: 0, tu: 0, b: false, f1: false, f2: false };
    const thMax = Math.min(1, m.cfg.velocidade / velocidadeBase(s));
    if (m.re > 0) {
      // Preso numa quina: dá ré virando, e depois tenta de novo.
      m.re--;
      return { ...parado, th: -0.6, tu: m.giro };
    }
    let vx = 0;
    let vz = 0;
    let th = 0;
    if (destino) {
      const d = dist(s, destino);
      // Não encosta em quem caça (fica a uma distância de tiro, nunca dentro da nave).
      const perto = alvo && destino === alvo.ship ? m.ship.raio + (alvo.ship.raio ?? SHIP_RADIUS) + ENCOSTO : 3;
      if (d > perto) {
        vx = (destino.x - s.x) / d;
        vz = (destino.z - s.z) / d;
        th = thMax * fracVel;
      }
    }
    // Monstros perto um do outro se empurram (o grupo cerca em vez de virar um bolo).
    for (const o of this.lista) {
      if (o === m || !o.vivo) continue;
      const ox = s.x - o.ship.x;
      const oz = s.z - o.ship.z;
      const d = Math.hypot(ox, oz);
      const lim = s.raio + o.ship.raio + AFASTAR;
      if (d > 0.01 && d < lim) {
        const k = ((lim - d) / lim) * 1.5;
        vx += (ox / d) * k;
        vz += (oz / d) * k;
        th = Math.max(th, thMax * 0.5);
      }
    }
    let rumo;
    if (Math.hypot(vx, vz) > 1e-6) rumo = Math.atan2(-vx, -vz);
    else if (alvo) rumo = yawPara(s.x, s.z, alvo.ship.x, alvo.ship.z); // parado: vira para o alvo
    else return parado;
    const diff = anguloEntre(s.yaw, rumo);
    th *= Math.max(0.15, 1 - Math.abs(diff) / 1.6); // curva fechada: freia para virar
    if (th >= thMax * 0.3 && Math.hypot(s.vx, s.vz) < 3) m.preso++;
    else m.preso = 0;
    if (m.preso > PRESO_TICKS) {
      m.preso = 0;
      m.re = RE_TICKS;
      m.giro = this.world.rng() < 0.5 ? 1 : -1;
      m.patrulha = null;
    }
    return { ...parado, th, tu: clamp(diff * 2.5, -1, 1) };
  }

  /** Ataca o alvo com o que estiver pronto e couber (alcance, linha livre). */
  #atacar(m, alvo) {
    const s = m.ship;
    if (s.emp > 0 || s.semTiro > 0) return; // EMP e "sem tiro" das armas param o ataque também
    const t = this.tick;
    const d = dist(s, alvo.ship);
    if (bloqueiaVisao(s.x, s.z, alvo.ship.x, alvo.ship.z)) return;
    const raioAlvo = alvo.ship.raio ?? SHIP_RADIUS;
    const prontos = m.cfg.ataques
      .map((a, i) => ({ a, i }))
      .filter(({ a, i }) => t >= m.prox[i] && d <= a.alcance + raioAlvo && !(a.minimo !== undefined && d < a.minimo));
    if (!prontos.length) return;
    if (m.cfg.entreAtaquesS !== undefined) {
      // Medusa: um ataque de cada vez, escolhido pelo peso do original entre os prontos.
      if (t < m.livreAte) return;
      const total = prontos.reduce((soma, p) => soma + (p.a.peso ?? 1), 0);
      let sorte = this.world.rng() * total;
      let escolhido = prontos[prontos.length - 1];
      for (const p of prontos) {
        sorte -= p.a.peso ?? 1;
        if (sorte < 0) {
          escolhido = p;
          break;
        }
      }
      this.#disparar(m, escolhido.a, alvo);
      m.prox[escolhido.i] = t + ticks(escolhido.a.intervaloS);
      m.livreAte = t + ticks(m.cfg.entreAtaquesS);
      return;
    }
    for (const { a, i } of prontos) {
      this.#disparar(m, a, alvo);
      m.prox[i] = t + ticks(a.intervaloS);
    }
  }

  #disparar(m, a, alvo) {
    if (a.forma === 'cone') return this.#chama(m, a, alvo);
    const s = m.ship;
    const t = alvo.ship;
    let yaw = yawPara(s.x, s.z, t.x, t.z);
    if (a.forma === 'projetil') {
      // Mira onde o alvo vai estar quando o tiro chegar.
      const voo = dist(s, t) / a.vel;
      yaw = yawPara(s.x, s.z, t.x + (t.vx ?? 0) * voo, t.z + (t.vz ?? 0) * voo);
    }
    const ponto = a.forma === 'campo' ? { x: t.x, z: t.z } : { x: s.x, z: s.z };
    this.world.golpes.golpeDeMonstro(m, a.kind, golpeDoAtaque(a), { yaw, alvo, ...ponto });
  }

  /**
   * Chama em cone: dano direto em cada inimigo (jogador) no cone à frente, rumo ao
   * alvo: até o alcance e a meia-abertura (ou a `area` m do eixo, na chama larga),
   * sem rocha no meio. Evento 'chama' para o desenho.
   */
  #chama(m, a, alvo) {
    const w = this.world;
    const s = m.ship;
    const yaw = yawPara(s.x, s.z, alvo.ship.x, alvo.ship.z);
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    w.eventos.push({ e: 'chama', id: m.id, esp: m.esp, x: +s.x.toFixed(2), y: +s.y.toFixed(2), z: +s.z.toFixed(2), yaw: +yaw.toFixed(3), alcance: a.alcance, abertura: a.abertura, area: a.area ?? 0 });
    const como = { owner: m.id, time: m.time, drone: true };
    for (const c of w.vivosAgora()) {
      if (!this.ctx.podeAcertar(como, c)) continue;
      const dx = c.ship.x - s.x;
      const dz = c.ship.z - s.z;
      const raio = c.ship.raio ?? SHIP_RADIUS;
      const ao = dx * fx + dz * fz; // ao longo do eixo
      if (ao < 0 || ao > a.alcance + raio) continue;
      const lado = Math.abs(dx * fz - dz * fx);
      if (lado > Math.max(a.area ?? 0, ao * Math.tan(a.abertura)) + raio) continue;
      if (bloqueiaVisao(s.x, s.z, c.ship.x, c.ship.z) || cruzaCampoBase(s.x, s.z, c.ship.x, c.ship.z)) continue;
      const ev = { e: 'acerto', kind: 'plasma', atq: a.atq, x: +c.ship.x.toFixed(2), y: +c.ship.y.toFixed(2), z: +c.ship.z.toFixed(2) };
      this.ctx.ferir(c, a.dano, m.id, ev, { tipoDano: a.tipoDano });
    }
  }

  /** Regeneração: fora de combate, voltando para o ponto (rápida) e a da Medusa (sempre). */
  #regen(m) {
    const s = m.ship;
    if (s.hp >= s.maxHp) return;
    let porS = m.cfg.regenHpS ?? 0;
    if (m.voltando) porS += s.maxHp * REGEN_VOLTA_FRAC;
    else if (this.tick - m.ultimoDano > REGEN_ESPERA_TICKS && m.raiva.size === 0) porS += s.maxHp * (m.cfg.chefe ? REGEN_FRAC_CHEFE : REGEN_FRAC);
    if (porS > 0) s.hp = Math.min(s.maxHp, s.hp + porS * DT);
  }

  // ---------- Sonda ----------

  #prepararSonda(m, ponta) {
    m.trajeto = trajetoSonda(ponta);
    m.cum = [0];
    for (let i = 1; i < m.trajeto.length; i++) m.cum.push(m.cum[i - 1] + dist(m.trajeto[i], m.trajeto[i - 1]));
    m.comprimento = m.cum[m.cum.length - 1];
    m.pos = 0; // m andados no trajeto
    m.sentido = 1;
    m.pausaAte = this.tick + SONDA_PAUSA_TICKS; // nasce parada na ponta
    const p = m.trajeto[0];
    Object.assign(m.ship, { x: p.x, z: p.z, y: heightAt(p.x, p.z) + HOVER });
    m.casa = { x: p.x, z: p.z };
  }

  /**
   * Sonda: anda pelo trajeto (vai e volta, pausa nas pontas); atacada há menos de
   * SONDA_FUGA_TICKS, foge na velocidade máxima para o lado do trajeto que a leva
   * para longe de quem a atacou (encurralada na ponta, fica). Anda por conta própria
   * (sem stepShip), então conta aqui o lento e o EMP das armas.
   */
  #sonda(m) {
    const w = this.world;
    const s = m.ship;
    const t = this.tick;
    for (const k of ['lento', 'emp', 'semTiro', 'desgov', 'trava']) if (s[k] > 0) s[k] = Math.max(0, s[k] - DT);
    let vel = m.cfg.velocidade * (s.lento > 0 ? (s.lentoMult ?? 1) : 1);
    if (s.emp > 0) vel = 0;
    const atacante = t - m.atacadoTick < SONDA_FUGA_TICKS ? w.players.get(m.atacadoPor) : null;
    let dir = 0;
    if (atacante?.vivo) {
      const frente = pontoNoTrajeto(m, m.pos + SONDA_OLHAR);
      const tras = pontoNoTrajeto(m, m.pos - SONDA_OLHAR);
      dir = dist(frente, atacante.ship) >= dist(tras, atacante.ship) ? 1 : -1;
      m.sentido = dir;
      m.pausaAte = 0;
    } else {
      vel *= SONDA_PASSEIO;
      if (t >= m.pausaAte) {
        if ((m.pos <= 0 && m.sentido < 0) || (m.pos >= m.comprimento && m.sentido > 0)) {
          // Chegou numa ponta: pausa e volta.
          m.sentido = -m.sentido;
          m.pausaAte = t + SONDA_PAUSA_TICKS;
        } else dir = m.sentido;
      }
    }
    m.pos = clamp(m.pos + dir * vel * DT, 0, m.comprimento);
    const p = pontoNoTrajeto(m, m.pos);
    s.vx = (p.x - s.x) / DT;
    s.vz = (p.z - s.z) / DT;
    if (Math.hypot(s.vx, s.vz) > 0.5) s.yaw = Math.atan2(-s.vx, -s.vz);
    s.x = p.x;
    s.z = p.z;
    s.y = heightAt(p.x, p.z) + HOVER;
  }

  // ---------- Morte ----------

  /**
   * Gancho da morte (World.#ferir, depois do XP e do ouro do abate): o lugar entra
   * em recarga quando o último morre, e o golpe final do SN-4, da sonda e da Medusa
   * liga o bônus de quem matou (a Medusa também paga cada piloto do time).
   */
  aoMorrer(m, matador) {
    if (m.tipo !== 'monstro') return;
    m.raiva.clear();
    const c = m.covil;
    if (!c) return;
    const w = this.world;
    const t = this.tick;
    if (c.membros.every((o) => !o.vivo)) {
      c.estado = 'recarga';
      c.proxTick = t + ticks(this.tempos[c.tipo].voltaS);
    }
    if (c.tipo === 'acampamento' || !matador) return;
    c.ultimoTime = matador.time;
    if (c.tipo === 'ataque') w.bonus.ativarNave(matador.id, 'ataque', BONUS_ATAQUE_S, t);
    else if (c.tipo === 'sonda') w.bonus.ativarNave(matador.id, 'sonda', BONUS_SONDA_S, t);
    else if (c.tipo === 'medusa') {
      for (const j of w.players.values()) {
        if (j.time !== matador.time) continue;
        j.ouro += m.cfg.ouro;
        ganharXp(j, m.cfg.xp, w.eventos);
      }
      w.bonus.ativar(matador.time, 'medusa', BONUS_MEDUSA_S, t);
    }
    w.eventos.push({ e: 'objetivo', id: c.id, acao: 'tomado', time: matador.time, quem: matador.nome, por: matador.id });
  }

  // ---------- Snapshot ----------

  /**
   * Estado dos objetivos da jungle para o `obj` do snapshot: { BA0, BA1, SONDA,
   * MEDUSA }, cada um { estado: 'espera' | 'ativo' | 'recarga', volta?: s até
   * aparecer, vida?: fração (vivo), time: time de quem deu o último golpe final (ou null),
   * bloqueada?: true (sonda esperando a Medusa ou o Núcleo morrerem) }.
   */
  estado() {
    const r = {};
    const t = this.tick;
    for (const c of this.covis) {
      if (c.tipo === 'acampamento') continue;
      const o = { time: c.ultimoTime, estado: c.estado };
      if (c.estado === 'ativo') {
        const m = c.membros[0];
        o.vida = +(Math.max(0, m.ship.hp) / m.ship.maxHp).toFixed(3);
      } else if (Number.isFinite(c.proxTick)) o.volta = Math.max(0, Math.ceil((c.proxTick - t) * DT - 1e-9));
      if (c.tipo === 'sonda' && c.estado !== 'ativo' && !this.sondaLiberada()) o.bloqueada = true;
      r[c.id] = o;
    }
    return r;
  }
}
