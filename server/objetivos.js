// Objetivos do mapa do Stage 6 que não são monstros (DESIGN-PARTIDA.md), só no
// servidor: a torre do buff de suporte (BS0/BS1), as plataformas de pouso que dão
// ouro ao time (P0/P1) e o Núcleo de He-3 (NUCLEO). O buff de ataque, a sonda
// errante e a Ancient Medusa são monstros (server/jungle.js); o estado `obj` do
// snapshot junta os dois módulos.
//
// Tempos do relógio da partida (decorrido, Partida.decorrido): cada objetivo
// "aparece" num tempo fixo e volta um tempo depois de tomado (TEMPOS; os testes os
// encurtam pelo World({ objetivos })). Estado de cada um no snapshot:
// 'espera' (ainda não apareceu; volta = s até aparecer), 'ativo', 'recarga' (tomado,
// volta = s até voltar) ou 'tomado' (o Núcleo destruído que não volta antes do fim).
//
// Torre do buff de suporte (uma em cada metade do mapa, BUFFS de shared/terrain.js;
// a construção sólida é a de shared/obstaculos.js): fica de pé desde o começo, mas
// só "acende" e aceita dano aos TEMPOS.suporte.primeiroS (1:30); antes, o tiro bate e
// some (dano 0), como numa parede. Tem SUPORTE.hp de vida e só tiro de JOGADOR a
// machuca, de qualquer time (roubar o buff do outro lado vale). O último tiro dá
// 'suporte' (server/bonus.js) a quem atirou, e SUPORTE.xp / SUPORTE.ouro. A torre cai
// (sai da física nos dois lados: definirObstaculoAtivo, e o cliente faz o mesmo pelo
// `obj`) e volta inteira TEMPOS.suporte.voltaS (4:00) depois, esperando o lugar
// vagar para ninguém ficar preso dentro dela.
//
// Plataforma de pouso (PLATAFORMAS_POUSO; área de pouso sem dono, qualquer time pousa
// em qualquer uma): ativa aos TEMPOS.plataforma.primeiroS (2:00). Conta o tempo do
// time que está pousado e parado nela; com TEMPOS.plataforma.pousoS (6 s) o time
// coleta: OURO_PLATAFORMA para cada piloto do time (vivo ou não) e
// OURO_PLATAFORMA_POUSOU a mais para quem estava pousado lá. Número: a pesquisa dos
// monstros (PESQUISA-MONSTROS.md) dá 72 de ouro a um acampamento da base inteiro, e
// o contrato pede ~70% disso por piloto (50), +25% para quem arriscou o pouso (12).
// Ninguém do time pousado (saiu ou decolou) ou um dos pousados LEVOU DANO: cancela e
// zera (evento 'cancelou'; o dano recomeça a contagem de quem continua lá). Os dois
// times pousados ao mesmo tempo: contestado, trava (nem anda nem zera). Se só o
// outro time fica, recomeça do zero para ele. Pousada, a nave não atira (o stepShip
// já corta todo tiro com s.pousado, na predição também). Coletada, a plataforma
// apaga por TEMPOS.plataforma.recargaS (2:30).
//
// Núcleo de He-3 (NUCLEO, poço de cima): o evento épico principal, com as regras do
// TORMENTOR do Dota 2 (pedido do Mateus, 29/out/2026). Uma ENTIDADE (tipo 'nucleo',
// parada, flutuando, não sólida) que NÃO ATACA e tem só duas passivas:
// - Escudo que se regenera rápido (o Unyielding Shield): a vida dele é uma barreira que
//   regenera o tempo todo, até apanhando (o Tormentor tem 1 de vida atrás dela; aqui a
//   barreira é a vida). Com dano baixo ele recupera mais do que perde: bater aos poucos
//   não funciona, precisa de dano concentrado.
// - Reflexo de dano (o Reflect): devolve uma fração do dano que leva às naves de jogador
//   em volta (NUCLEO_CFG.raioReflexo, de qualquer time), DIVIDIDA por igual entre elas;
//   quem bateu leva sempre, de qualquer distância (como no Dota desde o 7.33c). Sozinho,
//   você leva o reflexo inteiro; com o time, cada um leva um pedaço. É dano penetrante
//   (nenhuma resistência segura, como o dano puro), no escudo da nave e depois no HP, e
//   quem morre dele não dá abate a ninguém. O servidor junta o dano de
//   NUCLEO_CFG.reflexoS em NUCLEO_CFG.reflexoS (e o que falta no golpe final) e devolve
//   de uma vez: evento 'reflexo' (o cliente desenha os raios) e um 'acerto' kind
//   'reflexo' por nave.
// Só jogador (de qualquer time) fere (soJogador: World#ferir ignora o resto); tiros,
// áreas e mísseis pegam nele como num monstro, no raio do escudo (NUCLEO_CFG.raio).
// Aparece aos TEMPOS.nucleo.primeiroS (8:00) e, destruído, renasce
// TEMPOS.nucleo.renasceS (5:00, os 10:00 do Dota na partida de 20) depois, MAIS FORTE: a
// cada morte, a barreira, a regeneração e o reflexo sobem como os do Tormentor
// (forcaNucleo). Se a volta cair depois do fim da partida, fica 'tomado'. Golpe final: o
// time de quem matou ganha a ONDA DO NÚCLEO (Mineradores.ondaDoNucleo: 3 mineradores de
// carga 50) e NUCLEO_CFG.xp / NUCLEO_CFG.ouro para cada piloto do time.
//
// Partida nova (ou servidor vazio): tudo volta à 'espera', torres de pé.

import { PLATAFORMAS_POUSO, BUFFS, NUCLEO, areaPouso } from '../shared/terrain.js';
import { DT, HOVER, VEL_TOQUE, SHIP_RADIUS } from '../shared/sim.js';
import { TORRE_SUPORTE, OBSTACULOS, definirObstaculoAtivo } from '../shared/obstaculos.js';
import { ganharXp } from './progressao.js';
import { BONUS_NAVE } from './bonus.js';

/** Tempos da partida (s, relógio decorrido). Os testes trocam pelo World({ objetivos }). */
export const TEMPOS = {
  suporte: { primeiroS: 90, voltaS: 240 },
  plataforma: { primeiroS: 120, recargaS: 150, pousoS: 6 },
  nucleo: { primeiroS: 480, renasceS: 300 },
};
/** Torre do buff de suporte: vida e recompensa de quem dá o último tiro (como o SN-4 do buff de ataque). */
export const SUPORTE = { hp: 4500, xp: 150, ouro: 100 };
/** Ouro da plataforma de pouso para cada piloto do time e o a mais de quem estava pousado. */
export const OURO_PLATAFORMA = 200;
export const OURO_PLATAFORMA_POUSOU = 50;
/**
 * O Tormentor do Dota 2 no patch 7.33 (a versão de referência): barreira de 2500 que
 * regenera 100/s; reflete 70% do dano que leva, dividido entre os heróis em volta;
 * renasce 10:00 depois de morto e, a cada morte, a barreira +200, a regeneração +100/s e
 * o reflexo +20 pontos.
 */
export const TORMENTOR = { barreira: 2500, regen: 100, reflexo: 0.7, barreiraPorMorte: 200, regenPorMorte: 100, reflexoPorMorte: 0.2 };
/**
 * Da escala do Dota para a nossa, medida nos computadores (que evoluem as armas como um
 * piloto que sabe jogar). Aqui a briga é rajada de energia: aos 8:00 cada nave tira de
 * 4 a 14 mil por segundo por 2 a 5 s (a energia cheia, armas de fábrica em V5 a V8) e
 * depois só 500 a 1000 por segundo (o que a energia regenera), com 3 a 5 mil de vida.
 * Nas regras do Tormentor isso pede:
 * - regeneração × 8 (800/s): empata com o que uma nave sustenta; sozinho, depois da
 *   rajada, ele recupera mais do que você tira;
 * - barreira × 12 (30 mil): o tamanho da rajada de duas ou três naves juntas, o dano
 *   concentrado (uma nave sozinha esvazia a energia antes);
 * - reflexo × 0,2 (14%): a nave aqui morre em segundos, não em 30 como um herói; com os
 *   70% do Dota o próprio time morreria do reflexo. Com 14%, quem tenta sozinho leva de
 *   volta mais do que a vida que tem (a rajada e a meia minuto batendo), e em três cada um
 *   perde uns 25 a 45% da vida até derrubar.
 */
export const FATOR_NUCLEO_BARREIRA = 12;
export const FATOR_NUCLEO_REGEN = 8;
export const FATOR_NUCLEO_REFLEXO = 0.2;

/**
 * A força do Núcleo depois de `mortes` mortes na partida: barreira (a vida), regeneração
 * (por s) e a fração do dano que ele reflete.
 */
export function forcaNucleo(mortes = 0) {
  const T = TORMENTOR;
  return {
    barreira: (T.barreira + T.barreiraPorMorte * mortes) * FATOR_NUCLEO_BARREIRA,
    regen: (T.regen + T.regenPorMorte * mortes) * FATOR_NUCLEO_REGEN,
    reflexo: +((T.reflexo + T.reflexoPorMorte * mortes) * FATOR_NUCLEO_REFLEXO).toFixed(4),
  };
}

/**
 * Núcleo de He-3: altura do centro (a do tiro das naves, HOVER, + um pouco: o acerto de
 * tiro aceita 7 m de diferença), raio de acerto (o escudo: a casca de 29 m do cliente, no
 * prato emissor, menos o raio do tiro), o raio do reflexo (o poço inteiro, como os 1200
 * do Dota cobrem o fosso do Tormentor), de quanto em quanto tempo ele devolve o dano, e
 * a recompensa de cada piloto do time de quem matou.
 */
export const NUCLEO_CFG = {
  y: HOVER + 4,
  raio: 24,
  raioReflexo: 350,
  reflexoS: 1,
  xp: 250,
  ouro: 150,
};

const ticks = (s) => Math.round(s / DT);
const restaS = (ate, tick) => Math.max(0, Math.ceil((ate - tick) * DT - 1e-9));

export class Objetivos {
  /**
   * @param {import('./game.js').World} world
   * @param {{ ferir: Function, tempos?: object }} ctx ferir = World#ferir (o reflexo do
   *   Núcleo passa pelo escudo e pela morte como qualquer golpe); tempos = troca partes
   *   de TEMPOS (testes).
   */
  constructor(world, { ferir, tempos } = {}) {
    this.world = world;
    this.ferir = ferir;
    this.tempos = {
      suporte: { ...TEMPOS.suporte, ...tempos?.suporte },
      plataforma: { ...TEMPOS.plataforma, ...tempos?.plataforma },
      nucleo: { ...TEMPOS.nucleo, ...tempos?.nucleo },
    };
    this.planta = new Map(OBSTACULOS.filter((o) => o.id).map((o) => [o.id, o]));
    this.reiniciar();
  }

  /** Tick do relógio da partida em que se passaram `s` segundos. */
  #naPartida(s) {
    return this.world.partida.inicioTick + ticks(s);
  }

  get #andamento() {
    return this.world.partida.emAndamento;
  }

  /** Tudo à espera, torres de pé (partida nova ou servidor vazio). */
  reiniciar() {
    this.suportes = BUFFS.filter((b) => b.tipo === 'suporte').map((b) => ({ id: b.id, x: b.x, z: b.z, hp: SUPORTE.hp, caida: false, voltaTick: 0, time: null }));
    for (const t of this.suportes) definirObstaculoAtivo(t.id, true);
    this.plataformas = PLATAFORMAS_POUSO.map((p) => ({ id: p.id, x: p.x, z: p.z, ativa: false, voltaTick: 0, prog: 0, quem: null, contestado: false, vistoAte: 0, time: null }));
    const f = forcaNucleo(0);
    this.nucleo = {
      id: this.world.nextId++,
      tipo: 'nucleo',
      nome: 'Núcleo de He-3',
      drone: true, // neutro: não é de time nenhum (tiro de monstro não o acerta)
      soJogador: true, // só jogador fere (World#ferir)
      vivo: false,
      ship: { x: NUCLEO.x, y: NUCLEO_CFG.y, z: NUCLEO.z, yaw: 0, roll: 0, vx: 0, vz: 0, hp: 0, maxHp: f.barreira, raio: NUCLEO_CFG.raio, boost: false, pousado: false },
      respawnTick: 0,
      ultimoDano: 0,
      aparicao: 0, // quantas vezes já apareceu
      mortes: 0, // quantas vezes foi destruído (cada uma o deixa mais forte: forcaNucleo)
      mortoTick: 0,
      regen: f.regen, // barreira por s
      reflexo: f.reflexo, // fração do dano que volta
      refletir: 0, // dano a devolver no próximo reflexo
      atacantes: new Set(), // ids de quem bateu desde o último reflexo
      reflexoTick: 0,
      time: undefined,
      timeTomou: null,
    };
  }

  /** O Núcleo de He-3 está vivo? (a sonda errante da jungle não aparece enquanto ele vive: server/jungle.js) */
  nucleoVivo() {
    return this.nucleo.vivo;
  }

  /** Entidades dos objetivos que vão para o mundo (alvos de tiro e snapshot): o Núcleo, se vivo. */
  entidades() {
    return this.nucleo.vivo ? [this.nucleo] : [];
  }

  /** Avança um tick (só com a partida em andamento). */
  step() {
    if (!this.#andamento) return;
    for (const t of this.suportes) this.#passoSuporte(t);
    for (const p of this.plataformas) this.#passoPlataforma(p);
    this.#passoNucleo();
  }

  // ---------- Torre do buff de suporte ----------

  #suporteAceso(t) {
    return !t.caida && this.world.tick >= this.#naPartida(this.tempos.suporte.primeiroS);
  }

  #passoSuporte(t) {
    if (!t.caida || this.world.tick < t.voltaTick || this.#naveEmCima(t, TORRE_SUPORTE.raio)) return;
    t.caida = false;
    t.hp = SUPORTE.hp;
    definirObstaculoAtivo(t.id, true);
    this.world.eventos.push({ e: 'objetivo', id: t.id, acao: 'apareceu', time: null, quem: null });
  }

  /** Alguma nave no lugar de (o.x, o.z), raio `raio`? */
  #naveEmCima(o, raio) {
    const w = this.world;
    const r = raio + 1;
    return w.vivosAgora().some((e) => e !== this.nucleo && Math.hypot(e.ship.x - o.x, e.ship.z - o.z) < r + (e.ship.raio ?? SHIP_RADIUS));
  }

  /**
   * O tiro `b` (já avançado neste tick por stepBullet) bateu numa torre de suporte de
   * pé? Segmento contra o cilindro, para tiro rápido não atravessar. Tiro de jogador
   * com a torre acesa tira vida; o último derruba. Devolve true se o tiro acabou na
   * torre (quem chama tira o tiro do mundo).
   */
  tiroNaTorre(b) {
    const w = this.world;
    for (const t of this.suportes) {
      if (t.caida) continue;
      const o = this.planta.get(t.id);
      if (b.y > o.topo) continue;
      const ax = b.px ?? b.x;
      const az = b.pz ?? b.z;
      const sx = b.x - ax;
      const sz = b.z - az;
      const l2 = sx * sx + sz * sz;
      const k = l2 > 0 ? Math.min(1, Math.max(0, ((t.x - ax) * sx + (t.z - az) * sz) / l2)) : 0;
      if (Math.hypot(ax + sx * k - t.x, az + sz * k - t.z) > o.raio + 0.5) continue;
      const atirador = b.drone ? null : w.players.get(b.owner);
      const dano = atirador && this.#suporteAceso(t) && this.#andamento ? Math.round(w.danoDoTiro(b)) : 0;
      w.eventos.push({ e: 'acerto', bala: b.id, x: ax + sx * k, y: b.y, z: az + sz * k, alvo: 0, torre: t.id, dano });
      if (!dano) return true;
      atirador.causouDanoTick = w.tick;
      t.hp = Math.max(0, t.hp - dano);
      if (t.hp === 0) this.#derrubar(t, atirador);
      return true;
    }
    return false;
  }

  #derrubar(t, j) {
    const w = this.world;
    t.caida = true;
    t.time = j.time;
    t.voltaTick = w.tick + ticks(this.tempos.suporte.voltaS);
    definirObstaculoAtivo(t.id, false);
    w.bonus.ativarNave(j.id, 'suporte', BONUS_NAVE.suporte.s, w.tick);
    j.ouro += SUPORTE.ouro;
    ganharXp(j, SUPORTE.xp, w.eventos);
    w.eventos.push({ e: 'objetivo', id: t.id, acao: 'tomado', time: j.time, quem: j.nome, por: j.id, x: t.x, z: t.z });
  }

  // ---------- Plataformas de pouso ----------

  #passoPlataforma(p) {
    const w = this.world;
    const T = this.tempos.plataforma;
    if (!p.ativa) {
      const aparece = p.voltaTick || this.#naPartida(T.primeiroS);
      if (w.tick < aparece) return;
      Object.assign(p, { ativa: true, prog: 0, quem: null, contestado: false, vistoAte: w.tick });
      w.eventos.push({ e: 'objetivo', id: p.id, acao: 'apareceu', time: null, quem: null });
    }
    const pousados = [];
    for (const j of w.players.values()) {
      const s = j.ship;
      if (!j.vivo || !s.pousado || Math.hypot(s.vx, s.vz) >= VEL_TOQUE) continue;
      if (areaPouso(s.x, s.z)?.plataforma === p.id) pousados.push(j);
    }
    const desde = p.vistoAte;
    p.vistoAte = w.tick;
    const times = new Set(pousados.map((j) => j.time));
    p.contestado = times.size > 1;
    if (p.contestado) return; // trava: nem anda nem zera
    if (times.size === 0) {
      if (p.prog > 0) this.#cancelar(p, 'saiu');
      p.quem = null;
      return;
    }
    const [time] = times;
    if (p.quem !== time) {
      p.quem = time;
      p.prog = 0;
    }
    // Levar dano desde o último tick olhado (o golpe daquele tick vem depois deste
    // passo, em World.step) cancela e recomeça.
    if (pousados.some((j) => (j.levouDanoTick ?? -1) >= desde)) {
      if (p.prog > 0) this.#cancelar(p, 'dano');
      p.prog = 0;
      return;
    }
    if (++p.prog < ticks(T.pousoS)) return;
    this.#coletar(p, time, pousados);
  }

  #cancelar(p, motivo) {
    this.world.eventos.push({ e: 'objetivo', id: p.id, acao: 'cancelou', time: p.quem, quem: null, motivo });
    p.prog = 0;
  }

  #coletar(p, time, pousados) {
    const w = this.world;
    for (const j of w.players.values()) if (j.time === time) j.ouro += OURO_PLATAFORMA;
    for (const j of pousados) j.ouro += OURO_PLATAFORMA_POUSOU;
    Object.assign(p, { ativa: false, prog: 0, quem: null, contestado: false, time, voltaTick: w.tick + ticks(this.tempos.plataforma.recargaS) });
    w.eventos.push({ e: 'objetivo', id: p.id, acao: 'coletou', time, quem: pousados[0].nome, ouro: OURO_PLATAFORMA, ouroPouso: OURO_PLATAFORMA_POUSOU, x: p.x, z: p.z });
  }

  // ---------- Núcleo de He-3 ----------

  /**
   * Tick em que o Núcleo aparece de novo: a primeira aparição na hora marcada e, depois
   * de destruído, TEMPOS.nucleo.renasceS depois da morte. null se cair depois do fim da
   * partida (não volta mais).
   */
  #proximaAparicao() {
    const n = this.nucleo;
    const T = this.tempos.nucleo;
    const t = n.aparicao === 0 ? this.#naPartida(T.primeiroS) : n.mortoTick + ticks(T.renasceS);
    return t < this.world.partida.fimTick ? t : null;
  }

  #passoNucleo() {
    const w = this.world;
    const n = this.nucleo;
    const s = n.ship;
    if (!n.vivo) {
      const t = this.#proximaAparicao();
      if (t == null || w.tick < t) return;
      const f = forcaNucleo(n.mortes);
      n.aparicao++;
      n.vivo = true;
      s.hp = s.maxHp = f.barreira;
      n.regen = f.regen;
      n.reflexo = f.reflexo;
      n.refletir = 0;
      n.atacantes = new Set();
      n.reflexoTick = w.tick + ticks(NUCLEO_CFG.reflexoS);
      n.ultimoDano = w.tick;
      n.st = {};
      w.eventos.push({ e: 'objetivo', id: 'NUCLEO', acao: 'apareceu', time: null, quem: null, nivel: n.mortes + 1, x: s.x, z: s.z });
      return;
    }
    // O escudo regenera o tempo todo, até apanhando.
    s.hp = Math.min(s.maxHp, s.hp + n.regen * DT);
    if (w.tick >= n.reflexoTick) {
      n.reflexoTick = w.tick + ticks(NUCLEO_CFG.reflexoS);
      this.#refletir();
    }
  }

  /**
   * Gancho do World#ferir: o Núcleo levou `dano` (já com tudo o que o reduz) de `quem`
   * (jogador). A fração do reflexo fica guardada para o próximo reflexo, e quem bateu
   * entra na divisão dele de qualquer distância.
   */
  aoFerir(alvo, dano, quem) {
    const n = this.nucleo;
    if (alvo !== n || !(dano > 0)) return;
    n.refletir += dano * n.reflexo;
    if (quem) n.atacantes.add(quem.id);
  }

  /**
   * Devolve o dano guardado: dividido por igual entre as naves de jogador vivas no raio
   * do reflexo e as que bateram desde o último (de qualquer distância).
   */
  #refletir() {
    const w = this.world;
    const n = this.nucleo;
    const s = n.ship;
    const total = n.refletir;
    const atacantes = n.atacantes;
    n.refletir = 0;
    n.atacantes = new Set();
    if (!(total > 0)) return;
    const alvos = [...w.players.values()].filter((j) => j.vivo && (atacantes.has(j.id) || Math.hypot(j.ship.x - s.x, j.ship.z - s.z) <= NUCLEO_CFG.raioReflexo));
    if (!alvos.length) return;
    const parte = total / alvos.length;
    const r2 = (v) => +v.toFixed(2);
    w.eventos.push({
      e: 'reflexo',
      id: n.id,
      x: r2(s.x),
      y: r2(s.y),
      z: r2(s.z),
      dano: +parte.toFixed(1),
      alvos: alvos.map((j) => ({ id: j.id, x: r2(j.ship.x), y: r2(j.ship.y), z: r2(j.ship.z) })),
    });
    for (const j of alvos) {
      this.ferir(j, parte, n.id, { e: 'acerto', kind: 'reflexo', x: r2(j.ship.x), y: r2(j.ship.y), z: r2(j.ship.z) }, { tipoDano: 'eletrico', penetrante: true });
    }
  }

  /**
   * Gancho da morte (World#ferir): o Núcleo morto dá a onda do Núcleo e a recompensa
   * ao time de quem deu o golpe final (sem jogador, ninguém ganha).
   */
  aoMorrer(alvo, matador) {
    if (alvo !== this.nucleo) return;
    const w = this.world;
    const n = this.nucleo;
    // O golpe final também volta: o que faltava devolver sai agora.
    this.#refletir();
    n.vivo = false;
    n.mortes++;
    n.mortoTick = w.tick;
    n.respawnTick = Infinity; // quem decide a volta é #proximaAparicao
    if (!matador) return;
    n.timeTomou = matador.time;
    w.mineradores.ondaDoNucleo(matador.time, w.tick);
    for (const j of w.players.values()) {
      if (j.time !== matador.time) continue;
      j.ouro += NUCLEO_CFG.ouro;
      ganharXp(j, NUCLEO_CFG.xp, w.eventos);
    }
    w.eventos.push({ e: 'objetivo', id: 'NUCLEO', acao: 'tomado', time: matador.time, quem: matador.nome, por: matador.id, x: n.ship.x, z: n.ship.z });
  }

  // ---------- Snapshot ----------

  /**
   * Estado de cada objetivo para o `obj` do snapshot, por id: BS0/BS1 (torre de
   * suporte: estado, vida, volta, time), P0/P1 (plataforma: estado, prog = s pousado,
   * quem = time pousando, contestado, volta, time) e NUCLEO (estado, vida = a barreira,
   * volta, time, aparicao, nivel). volta = s até aparecer/voltar (só em 'espera' e
   * 'recarga').
   */
  estado() {
    const w = this.world;
    const tick = w.tick;
    const andamento = this.#andamento;
    // Na preparação o relógio dos objetivos já tem hora marcada (inicioTick): a
    // contagem até aparecer inclui o que falta dela.
    const relogio = andamento || w.partida.emPreparacao;
    const r = {};
    for (const t of this.suportes) {
      const e = { time: t.time };
      if (t.caida) Object.assign(e, { estado: 'recarga', volta: restaS(t.voltaTick, tick), vida: 0 });
      else if (!andamento || !this.#suporteAceso(t)) Object.assign(e, { estado: 'espera', volta: relogio ? restaS(this.#naPartida(this.tempos.suporte.primeiroS), tick) : 0, vida: 1 });
      else Object.assign(e, { estado: 'ativo', vida: +(t.hp / SUPORTE.hp).toFixed(3) });
      r[t.id] = e;
    }
    for (const p of this.plataformas) {
      const e = { time: p.time };
      if (p.ativa) {
        Object.assign(e, { estado: 'ativo', prog: +(p.prog * DT).toFixed(1), quem: p.quem });
        if (p.contestado) e.contestado = true;
      } else {
        const volta = p.voltaTick || (relogio ? this.#naPartida(this.tempos.plataforma.primeiroS) : tick);
        Object.assign(e, { estado: p.voltaTick ? 'recarga' : 'espera', volta: restaS(volta, tick) });
      }
      r[p.id] = e;
    }
    const n = this.nucleo;
    // nivel: a força dele, 1 na primeira aparição e +1 a cada morte (fora do mapa, a da
    // próxima volta).
    const e = { time: n.timeTomou, aparicao: n.aparicao, nivel: n.mortes + 1 };
    if (n.vivo) Object.assign(e, { estado: 'ativo', vida: +(Math.max(0, n.ship.hp) / n.ship.maxHp).toFixed(3) });
    else {
      const t = relogio ? this.#proximaAparicao() : tick;
      if (t == null) e.estado = 'tomado';
      else Object.assign(e, { estado: n.aparicao === 0 ? 'espera' : 'recarga', volta: restaS(t, tick) });
    }
    r.NUCLEO = e;
    return r;
  }
}
