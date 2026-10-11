// Objetivos A, B e C da partida (DESIGN-PARTIDA.md, "Objetivos"), só no servidor.
// São seis no mapa (OBJETIVOS em shared/terrain.js), três de cada lado. Tomar um
// objetivo liga, por OBJ_BONUS_S, um bônus para os mineradores do TIME de quem tomou
// (server/bonus.js), e o objetivo entra em recarga por OBJ_RECARGA_S.
//
// Regras exatas:
// - A (pouso): ficar pousado (nave no chão, parada) na marcação por OBJ_A_POUSO_S.
//   Conta o tempo do time que está pousado lá. Se ninguém está pousado, o progresso
//   zera (sair antes perde tudo). Com naves dos dois times pousadas ao mesmo tempo,
//   o progresso trava (contestado). Se o outro time fica sozinho lá, o progresso
//   recomeça do zero para ele. Completo: bônus 'mineracao' para o time e
//   XP_OBJETIVO para cada nave do time pousada lá.
// - B (torre): a torre tem TORRE_B_HP de vida e só tiro de jogador a machuca (tiro
//   de monstro bate nela e some). Quem dá o último tiro toma: bônus 'velocidade'
//   para o time dele e XP_OBJETIVO para ele. A torre cai (deixa de ser sólida:
//   definirObstaculoAtivo em shared/obstaculos.js, e o cliente faz o mesmo pelo
//   snapshot) e volta inteira no fim da recarga; se houver nave em cima do lugar,
//   espera ela sair, para ninguém ficar preso dentro da torre.
// - C (guardião): o guardião (server/elites.js) fica na arena. Quem o mata toma:
//   bônus 'durabilidade' para os mineradores do time dele e 'furia' (mais dano)
//   para as naves dos jogadores do time, pelo mesmo OBJ_BONUS_S. O C é o objetivo
//   mais caro (1500 de HP, leque de plasma), então paga também quem foi brigar
//   lá. O XP é o do abate, RECOMPENSA.guardiao.
//   Ele renasce, com HP cheio, no fim da recarga.
//
// Times: o jogador tem `j.time` (0 ou 1) quando a partida de times existir; até lá
// vale `j.time ?? 0`.

import { OBJETIVOS } from '../shared/terrain.js';
import { DT, VEL_TOQUE, SHIP_RADIUS } from '../shared/sim.js';
import { TORRE_B, OBSTACULOS, definirObstaculoAtivo } from '../shared/obstaculos.js';
import { ganharXp, XP_OBJETIVO } from './progressao.js';
import { novaElite, renascerElite } from './elites.js';

export const OBJ_A_POUSO_S = 10; // s pousado no A para tomar
export const OBJ_RECARGA_S = 90; // s até o objetivo voltar depois de tomado
export const OBJ_BONUS_S = 60; // s de bônus para o time que tomou
export const TORRE_B_HP = 800;
/** Bônus que cada tipo de objetivo dá (nomes do contrato de server/bonus.js). */
export const BONUS_DO_TIPO = { A: 'mineracao', B: 'velocidade', C: 'durabilidade' };
/** Bônus extra para as naves dos jogadores do time, por tipo (só o C tem). */
export const BONUS_NAVES_DO_TIPO = { C: 'furia' };

const A_TICKS = Math.round(OBJ_A_POUSO_S / DT);
const RECARGA_TICKS = Math.round(OBJ_RECARGA_S / DT);

const timeDe = (j) => j?.time ?? 0;

export class Objetivos {
  /**
   * Monta o estado dos seis objetivos, levanta as torres B (o estado das
   * construções é do módulo, compartilhado por todo World do processo) e põe os
   * guardiões dos C em `world.elites`.
   */
  constructor(world) {
    this.world = world;
    this.lista = OBJETIVOS.map((o) => ({
      id: o.id,
      tipo: o.tipo,
      x: o.x,
      z: o.z,
      raio: o.raio,
      recargaAte: 0, // tick em que a recarga acaba (0 = disponível)
      time: null, // time que tomou por último
      prog: 0, // A: ticks pousados
      quem: null, // A: time que está tomando
      contestado: false,
      hp: TORRE_B_HP, // B
      guardiao: null, // C
    }));
    for (const o of this.lista) {
      if (o.tipo === 'B') definirObstaculoAtivo(o.id, true);
      if (o.tipo === 'C') {
        o.guardiao = novaElite('guardiao', world.nextId++, o.x, o.z, 0, { objetivo: o.id, renascerTicks: RECARGA_TICKS });
        world.elites.push(o.guardiao);
      }
    }
    this.torres = new Map(OBSTACULOS.filter((t) => t.id).map((t) => [t.id, t]));
  }

  #emRecarga(o) {
    return this.world.tick < o.recargaAte || (o.tipo === 'B' && o.hp <= 0);
  }

  /** Toma o objetivo para o `time`: liga o bônus, põe em recarga e avisa todo mundo. */
  #tomar(o, time, quem) {
    const w = this.world;
    o.time = time;
    o.recargaAte = w.tick + RECARGA_TICKS;
    o.prog = 0;
    o.quem = null;
    o.contestado = false;
    w.bonus.ativar(time, BONUS_DO_TIPO[o.tipo], OBJ_BONUS_S, w.tick);
    const naves = BONUS_NAVES_DO_TIPO[o.tipo] ?? null;
    if (naves) w.bonus.ativar(time, naves, OBJ_BONUS_S, w.tick);
    w.eventos.push({ e: 'objetivo', id: o.id, tipo: o.tipo, time, bonus: BONUS_DO_TIPO[o.tipo], ...(naves && { bonusNaves: naves }), segundos: OBJ_BONUS_S, quem: quem?.nome ?? null });
  }

  /** Avança um tick: pouso nos A, volta das torres B. */
  step() {
    const w = this.world;
    for (const o of this.lista) {
      if (o.tipo === 'A') this.#passoA(o);
      else if (o.tipo === 'B' && o.hp <= 0 && w.tick >= o.recargaAte && !this.#naveEmCima(o)) {
        o.hp = TORRE_B_HP;
        definirObstaculoAtivo(o.id, true);
      }
    }
  }

  #passoA(o) {
    const w = this.world;
    if (this.#emRecarga(o)) return;
    const pousados = [];
    for (const j of w.players.values()) {
      const s = j.ship;
      if (j.vivo && s.pousado && Math.hypot(s.vx, s.vz) < VEL_TOQUE && Math.hypot(s.x - o.x, s.z - o.z) <= o.raio) pousados.push(j);
    }
    const times = new Set(pousados.map(timeDe));
    o.contestado = times.size > 1;
    if (times.size === 0) {
      o.prog = 0;
      o.quem = null;
      return;
    }
    if (o.contestado) return; // trava: nem anda nem zera
    const [time] = times;
    if (o.quem !== time) {
      o.quem = time;
      o.prog = 0;
    }
    if (++o.prog < A_TICKS) return;
    this.#tomar(o, time, pousados[0]);
    for (const j of pousados) ganharXp(j, XP_OBJETIVO, w.eventos);
  }

  /** Alguma nave (jogador ou monstro) no lugar da torre? */
  #naveEmCima(o) {
    const w = this.world;
    const r = TORRE_B.raio + SHIP_RADIUS + 1;
    const todos = [...w.players.values(), ...w.drones, ...w.monstros, ...w.elites];
    return todos.some((e) => e.vivo && Math.hypot(e.ship.x - o.x, e.ship.z - o.z) < r + (e.ship.raio ?? 0));
  }

  /**
   * O tiro `b` (já avançado neste tick por stepBullet) bateu numa torre B de pé?
   * Teste de segmento contra o cilindro, para tiro rápido não atravessar. Tiro de
   * jogador tira vida da torre; o último derruba e toma o objetivo. Devolve true se
   * o tiro acabou na torre (quem chama tira o tiro do mundo).
   */
  tiroNaTorre(b) {
    for (const o of this.lista) {
      if (o.tipo !== 'B' || o.hp <= 0) continue;
      const t = this.torres.get(o.id);
      if (b.y > t.topo) continue;
      const ax = b.px ?? b.x;
      const az = b.pz ?? b.z;
      const sx = b.x - ax;
      const sz = b.z - az;
      const l2 = sx * sx + sz * sz;
      const k = l2 > 0 ? Math.min(1, Math.max(0, ((o.x - ax) * sx + (o.z - az) * sz) / l2)) : 0;
      if (Math.hypot(ax + sx * k - o.x, az + sz * k - o.z) > t.raio + 0.5) continue;
      const w = this.world;
      const atirador = b.drone ? null : w.players.get(b.owner);
      const dano = atirador ? Math.round(w.danoDoTiro(b)) : 0;
      w.eventos.push({ e: 'acerto', bala: b.id, x: ax + sx * k, y: b.y, z: az + sz * k, alvo: 0, torre: o.id, dano });
      if (!dano) return true;
      o.hp = Math.max(0, o.hp - dano);
      if (o.hp === 0) {
        definirObstaculoAtivo(o.id, false);
        this.#tomar(o, timeDe(atirador), atirador);
        ganharXp(atirador, XP_OBJETIVO, w.eventos);
      }
      return true;
    }
    return false;
  }

  /** Gancho da morte (World.#ferir): o guardião morto toma o C para o time de quem matou. */
  aoMorrer(alvo, matador) {
    if (alvo.tipo !== 'guardiao') return;
    const o = this.lista.find((x) => x.id === alvo.objetivo);
    if (!o) return;
    if (matador) this.#tomar(o, timeDe(matador), matador);
    o.recargaAte = alvo.respawnTick;
  }

  /** Renasce o guardião no meio da arena (chamado pelo World quando o tempo chega). */
  renascerGuardiao(g) {
    const o = this.lista.find((x) => x.id === g.objetivo);
    renascerElite(g, o.x, o.z, 0);
  }

  /**
   * Estado de cada objetivo para o snapshot (`obj`): id, tipo, estado ('livre',
   * 'tomando', 'contestado' ou 'recarga'), prog (0 a 1, pouso do A), quem (time que
   * está tomando o A), falta (s pousado que faltam no A), vida (0 a 1, torre B ou
   * guardião C), time (quem tomou por último, ou null) e resta (s de recarga).
   */
  estado() {
    const t = this.world.tick;
    return this.lista.map((o) => {
      const recarga = this.#emRecarga(o);
      const estado = recarga ? 'recarga' : o.contestado ? 'contestado' : o.prog > 0 ? 'tomando' : 'livre';
      const r = { id: o.id, tipo: o.tipo, estado, time: o.time, resta: recarga ? Math.ceil(Math.max(0, o.recargaAte - t) * DT) : 0 };
      if (o.tipo === 'A') {
        r.prog = +(o.prog / A_TICKS).toFixed(3);
        r.quem = o.quem;
        r.falta = +((A_TICKS - o.prog) * DT).toFixed(1); // s pousado que faltam
      } else if (o.tipo === 'B') {
        r.vida = +(o.hp / TORRE_B_HP).toFixed(3);
      } else {
        const g = o.guardiao;
        r.vida = g.vivo ? +(Math.max(0, g.ship.hp) / g.ship.maxHp).toFixed(3) : 0;
      }
      return r;
    });
  }

  /**
   * Volta tudo ao começo (nova partida): objetivos disponíveis, torres de pé,
   * guardiões vivos no meio da arena. Os bônus ficam em world.bonus (limpar()).
   */
  reiniciar() {
    for (const o of this.lista) {
      o.recargaAte = 0;
      o.time = null;
      o.prog = 0;
      o.quem = null;
      o.contestado = false;
      if (o.tipo === 'B') {
        o.hp = TORRE_B_HP;
        definirObstaculoAtivo(o.id, true);
      }
      if (o.tipo === 'C') {
        const g = o.guardiao;
        this.renascerGuardiao(g);
        g.vivo = true;
        g.respawnTick = 0;
        g.drenoTicks = 0;
      }
    }
  }
}
