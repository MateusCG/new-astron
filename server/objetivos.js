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
// volta = s até voltar) ou 'tomado' (o Núcleo depois da última aparição).
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
// Núcleo de He-3 (NUCLEO, poço de cima): uma ENTIDADE (tipo 'nucleo', parada,
// flutuando, não sólida) que aparece aos 8:00 e, se tiver sido tomado, de novo aos
// 15:00 (TEMPOS.nucleo.aparicoesS; só essas vezes). NUCLEO_CFG.hp de vida, só
// jogador (de qualquer time) fere (soJogador: World#ferir ignora o resto); tiros,
// áreas e mísseis pegam nele como num monstro. Fora de briga por NUCLEO_CFG.regenEsperaS,
// recupera NUCLEO_CFG.regenFrac do HP por s (não dá para tirar aos poucos). A cada
// NUCLEO_CFG.pulsoS solta um PULSO em área (NUCLEO_CFG.raioPulso) que fere as naves
// de jogador perto, de qualquer time, mais forte conforme perde vida (forca de 1 a
// 1 + NUCLEO_CFG.pulsoExtra; evento 'pulso'). Golpe final: o time de quem matou
// ganha a ONDA DO NÚCLEO (Mineradores.ondaDoNucleo: 3 mineradores de carga 50) e
// NUCLEO_CFG.xp / NUCLEO_CFG.ouro para cada piloto do time.
//
// Partida nova (ou servidor vazio): tudo volta à 'espera', torres de pé.

import { PLATAFORMAS_POUSO, BUFFS, NUCLEO, areaPouso } from '../shared/terrain.js';
import { DT, HOVER, VEL_TOQUE, SHIP_RADIUS, AREA_ALTURA } from '../shared/sim.js';
import { TORRE_SUPORTE, OBSTACULOS, definirObstaculoAtivo } from '../shared/obstaculos.js';
import { ganharXp } from './progressao.js';
import { BONUS_NAVE } from './bonus.js';

/** Tempos da partida (s, relógio decorrido). Os testes trocam pelo World({ objetivos }). */
export const TEMPOS = {
  suporte: { primeiroS: 90, voltaS: 240 },
  plataforma: { primeiroS: 120, recargaS: 150, pousoS: 6 },
  nucleo: { aparicoesS: [480, 900] },
};
/** Torre do buff de suporte: vida e recompensa de quem dá o último tiro (como o SN-4 do buff de ataque). */
export const SUPORTE = { hp: 900, xp: 150, ouro: 100 };
/** Ouro da plataforma de pouso para cada piloto do time e o a mais de quem estava pousado. */
export const OURO_PLATAFORMA = 50;
export const OURO_PLATAFORMA_POUSOU = 12;
/**
 * Núcleo de He-3: vida, altura do centro (a do tiro das naves, HOVER, + um pouco:
 * o acerto de tiro aceita 7 m de diferença), raio de acerto, regeneração fora de
 * briga, pulso (intervalo, raio, dano com a vida cheia e quanto mais forte fica sem
 * vida) e a recompensa de cada piloto do time de quem matou.
 */
export const NUCLEO_CFG = {
  hp: 6000,
  y: HOVER + 4,
  raio: 14,
  regenEsperaS: 10,
  regenFrac: 0.02,
  pulsoS: 4,
  raioPulso: 80,
  danoPulso: 30,
  pulsoExtra: 1.5,
  xp: 250,
  ouro: 150,
};

const ticks = (s) => Math.round(s / DT);
const restaS = (ate, tick) => Math.max(0, Math.ceil((ate - tick) * DT - 1e-9));

export class Objetivos {
  /**
   * @param {import('./game.js').World} world
   * @param {{ ferir: Function, tempos?: object }} ctx ferir = World#ferir (o pulso do
   *   Núcleo passa por escudo, resistência e morte como qualquer golpe); tempos =
   *   troca partes de TEMPOS (testes).
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
    this.nucleo = {
      id: this.world.nextId++,
      tipo: 'nucleo',
      nome: 'Núcleo de He-3',
      drone: true, // neutro: não é de time nenhum (tiro de monstro não o acerta)
      soJogador: true, // só jogador fere (World#ferir)
      vivo: false,
      ship: { x: NUCLEO.x, y: NUCLEO_CFG.y, z: NUCLEO.z, yaw: 0, roll: 0, vx: 0, vz: 0, hp: 0, maxHp: NUCLEO_CFG.hp, raio: NUCLEO_CFG.raio, boost: false, pousado: false },
      respawnTick: 0,
      ultimoDano: 0,
      aparicao: 0, // quantas vezes já apareceu
      time: undefined,
      timeTomou: null,
      pulsoTick: 0,
    };
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
    const r = raio + SHIP_RADIUS + 1;
    return w.vivosAgora().some((e) => e !== this.nucleo && Math.hypot(e.ship.x - o.x, e.ship.z - o.z) < r + (e.ship.raio ?? 0));
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

  /** Tick da próxima aparição do Núcleo (null se já apareceu todas as vezes). */
  #proximaAparicao() {
    const n = this.nucleo;
    const lista = this.tempos.nucleo.aparicoesS;
    // Depois de tomado, só volta numa aparição que ainda não passou.
    for (let i = n.aparicao; i < lista.length; i++) {
      const t = this.#naPartida(lista[i]);
      if (n.aparicao === 0 || t > n.mortoTick) return { i, t };
    }
    return null;
  }

  #passoNucleo() {
    const w = this.world;
    const n = this.nucleo;
    const s = n.ship;
    if (!n.vivo) {
      const prox = this.#proximaAparicao();
      if (!prox || w.tick < prox.t) return;
      n.aparicao = prox.i + 1;
      n.vivo = true;
      s.hp = s.maxHp = NUCLEO_CFG.hp;
      n.pulsoTick = w.tick + ticks(NUCLEO_CFG.pulsoS);
      n.ultimoDano = w.tick;
      n.st = {};
      w.eventos.push({ e: 'objetivo', id: 'NUCLEO', acao: 'apareceu', time: null, quem: null, x: s.x, z: s.z });
      return;
    }
    // Uma aparição nova enquanto ele ainda está vivo não faz nada (aparecer de novo
    // só se tiver sido tomado).
    if (w.tick - n.ultimoDano > ticks(NUCLEO_CFG.regenEsperaS)) s.hp = Math.min(s.maxHp, s.hp + s.maxHp * NUCLEO_CFG.regenFrac * DT);
    if (w.tick >= n.pulsoTick) {
      n.pulsoTick = w.tick + ticks(NUCLEO_CFG.pulsoS);
      this.#pulso();
    }
  }

  /** Força do pulso agora: 1 com a vida cheia, até 1 + pulsoExtra sem vida. */
  forcaPulso() {
    const s = this.nucleo.ship;
    return 1 + NUCLEO_CFG.pulsoExtra * (1 - Math.max(0, s.hp) / s.maxHp);
  }

  #pulso() {
    const w = this.world;
    const n = this.nucleo;
    const s = n.ship;
    const forca = +this.forcaPulso().toFixed(2);
    const raio = NUCLEO_CFG.raioPulso;
    w.eventos.push({ e: 'pulso', id: n.id, x: s.x, y: s.y, z: s.z, raio, forca });
    const dano = NUCLEO_CFG.danoPulso * forca;
    for (const j of [...w.players.values()]) {
      if (!j.vivo) continue;
      const d = Math.hypot(j.ship.x - s.x, j.ship.z - s.z);
      if (d > raio + SHIP_RADIUS || Math.abs(j.ship.y - s.y) > AREA_ALTURA + NUCLEO_CFG.raio) continue;
      this.ferir(j, dano, n.id, { e: 'acerto', kind: 'pulso', x: +j.ship.x.toFixed(2), y: +j.ship.y.toFixed(2), z: +j.ship.z.toFixed(2) }, { tipoDano: 'eletrico', direto: false });
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
    n.vivo = false;
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
   * quem = time pousando, contestado, volta, time) e NUCLEO (estado, vida, volta,
   * time, aparicao). volta = s até aparecer/voltar (só em 'espera' e 'recarga').
   */
  estado() {
    const w = this.world;
    const tick = w.tick;
    const andamento = this.#andamento;
    const r = {};
    for (const t of this.suportes) {
      const e = { time: t.time };
      if (t.caida) Object.assign(e, { estado: 'recarga', volta: restaS(t.voltaTick, tick), vida: 0 });
      else if (!andamento || !this.#suporteAceso(t)) Object.assign(e, { estado: 'espera', volta: andamento ? restaS(this.#naPartida(this.tempos.suporte.primeiroS), tick) : 0, vida: 1 });
      else Object.assign(e, { estado: 'ativo', vida: +(t.hp / SUPORTE.hp).toFixed(3) });
      r[t.id] = e;
    }
    for (const p of this.plataformas) {
      const e = { time: p.time };
      if (p.ativa) {
        Object.assign(e, { estado: 'ativo', prog: +(p.prog * DT).toFixed(1), quem: p.quem });
        if (p.contestado) e.contestado = true;
      } else {
        const volta = p.voltaTick || (andamento ? this.#naPartida(this.tempos.plataforma.primeiroS) : tick);
        Object.assign(e, { estado: p.voltaTick ? 'recarga' : 'espera', volta: restaS(volta, tick) });
      }
      r[p.id] = e;
    }
    const n = this.nucleo;
    const e = { time: n.timeTomou, aparicao: n.aparicao };
    if (n.vivo) Object.assign(e, { estado: 'ativo', vida: +(Math.max(0, n.ship.hp) / n.ship.maxHp).toFixed(3) });
    else {
      const prox = andamento ? this.#proximaAparicao() : { t: tick };
      if (!prox) e.estado = 'tomado';
      else Object.assign(e, { estado: n.aparicao === 0 ? 'espera' : 'recarga', volta: restaS(prox.t, tick) });
    }
    r.NUCLEO = e;
    return r;
  }
}
