// Mundo do jogo no servidor: um mapa, as naves dos jogadores, os drones inimigos
// (PvE) e os tiros. Roda em passo fixo de 30 Hz (DT de shared/sim.js) e manda o
// estado para os clientes a 15 Hz.
//
// Regra de ouro herdada do Sideral: o servidor decide tudo o que importa (posição,
// acerto, dano, morte, ouro). O cliente só manda comandos numerados (seq); o servidor
// aplica cada comando uma vez, em ordem, e devolve no snapshot o último seq aplicado
// (ack) junto com o estado da nave, para o cliente reconciliar a predição.
//
// Limites contra trapaça: no máximo MAX_INPUTS_TICK comandos por tick (não dá para
// "acelerar o tempo" mandando comando demais) e fila de no máximo MAX_FILA.

import {
  DT,
  WEAPONS,
  createShip,
  sanitizeInput,
  stepShip,
  createBullet,
  stepBullet,
  bulletHits,
  VEL_TOQUE,
} from '../shared/sim.js';
import { paredeAt, BASE, MAP_HALF } from '../shared/terrain.js';

export const TICK_HZ = 30;
const SNAP_CADA = 2; // ticks entre snapshots (15 Hz)
const MAX_INPUTS_TICK = 4;
const MAX_FILA = 30;
const RESPAWN_TICKS = 3 * TICK_HZ;
const REGEN_ESPERA_TICKS = 5 * TICK_HZ;
const VOO_REGEN_HP = 0.03; // fração do HP máximo por segundo, voando
const POUSO_REGEN_HP = 0.08; // fração do HP máximo por segundo, pousada
const POUSO_REGEN_ESPERA_TICKS = 1 * TICK_HZ;
const N_DRONES = 10;
const DRONE = { nome: 'Arnosh', hp: 90, visao: 200, alcance: 210, danoMult: 0.5, ouro: 25 };
const OURO_ABATE_JOGADOR = 50;
// Zona segura: ninguém leva dano perto da base, e drones não perseguem quem está lá.
export const ZONA_SEGURA = BASE.raio + 60;
const PROTECAO_TICKS = 3 * TICK_HZ; // invulnerável logo depois de nascer

function limpaNome(n) {
  const s = String(n ?? '')
    .replace(/[^\p{L}\p{N} _-]/gu, '')
    .trim()
    .slice(0, 16);
  return s || 'Piloto';
}

function anguloEntre(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

export class World {
  constructor({ rng = Math.random, drones = N_DRONES } = {}) {
    this.rng = rng;
    this.tick = 0;
    this.nextId = 1;
    this.players = new Map();
    this.drones = [];
    this.bullets = [];
    this.eventos = [];
    for (let i = 0; i < drones; i++) this.drones.push(this.#novoDrone());
  }

  #id() {
    return this.nextId++;
  }

  /** Ponto aleatório no fundo de algum cânion, longe da base. */
  #pontoNoCanion() {
    for (let t = 0; t < 500; t++) {
      const x = (this.rng() * 2 - 1) * (MAP_HALF - 120);
      const z = (this.rng() * 2 - 1) * (MAP_HALF - 120);
      if (Math.hypot(x - BASE.x, z - BASE.z) < 350) continue;
      if (paredeAt(x, z) < 0.02) return { x, z };
    }
    return { x: 0, z: -400 };
  }

  #pontoNaBase() {
    const a = this.rng() * Math.PI * 2;
    const r = this.rng() * 60;
    return { x: BASE.x + Math.cos(a) * r, z: BASE.z + Math.sin(a) * r };
  }

  #novoDrone() {
    const p = this.#pontoNoCanion();
    const ship = createShip('mechan', p.x, p.z, this.rng() * Math.PI * 2);
    ship.hp = ship.maxHp = DRONE.hp;
    return { id: this.#id(), drone: true, nome: DRONE.nome, ship, vivo: true, respawnTick: 0, giro: 0, ultimoDano: 0 };
  }

  /** Entra um jogador. Retorna o objeto do jogador (o servidor guarda o socket nele). */
  addPlayer(nome, race) {
    const p = this.#pontoNaBase();
    const id = this.#id();
    const jogador = {
      id,
      nome: limpaNome(nome),
      ship: createShip(race, p.x, p.z, 0),
      fila: [],
      ack: 0,
      vivo: true,
      respawnTick: 0,
      ultimoDano: 0,
      protegidoAte: this.tick + PROTECAO_TICKS,
      ouro: 0,
      abates: 0,
      mortes: 0,
    };
    this.players.set(id, jogador);
    this.eventos.push({ e: 'entrou', id, nome: jogador.nome });
    return jogador;
  }

  removePlayer(id) {
    const j = this.players.get(id);
    if (!j) return;
    this.players.delete(id);
    this.eventos.push({ e: 'saiu', id, nome: j.nome });
  }

  /** Enfileira um comando do cliente. Comando fora de ordem ou repetido é ignorado. */
  pushInput(id, msg) {
    const j = this.players.get(id);
    if (!j) return;
    const seq = Number(msg?.s);
    if (!Number.isInteger(seq) || seq <= j.ack) return;
    const ultimo = j.fila.length ? j.fila[j.fila.length - 1].seq : j.ack;
    if (seq <= ultimo) return;
    if (j.fila.length >= MAX_FILA) j.fila.shift();
    j.fila.push({ seq, inp: sanitizeInput(msg) });
  }

  #atira(ent, disparos) {
    for (const kind of disparos) {
      const b = createBullet(ent.ship, kind, this.#id(), ent.id);
      b.drone = !!ent.drone;
      this.bullets.push(b);
      this.eventos.push({ e: 'tiro', id: b.id, dono: ent.id, kind, x: b.x, y: b.y, z: b.z, vx: b.vx, vy: b.vy, vz: b.vz });
    }
  }

  #iaDrone(d) {
    const s = d.ship;
    let alvo = null;
    let melhor = DRONE.visao;
    for (const j of this.players.values()) {
      if (!j.vivo || this.#naZonaSegura(j.ship)) continue;
      const dist = Math.hypot(j.ship.x - s.x, j.ship.z - s.z);
      if (dist < melhor) {
        melhor = dist;
        alvo = j;
      }
    }
    if (alvo) {
      const yawAlvo = Math.atan2(-(alvo.ship.x - s.x), -(alvo.ship.z - s.z));
      const diff = anguloEntre(s.yaw, yawAlvo);
      return {
        th: melhor > 70 ? 0.75 : 0.1,
        tu: Math.max(-1, Math.min(1, diff * 2.5)),
        b: false,
        f1: Math.abs(diff) < 0.18 && melhor < DRONE.alcance,
        f2: false,
      };
    }
    // Patrulha: anda devagar, mudando de rumo aos poucos; se parou, vira.
    if (this.tick % 45 === d.id % 45) d.giro = (this.rng() * 2 - 1) * 0.6;
    const vel = Math.hypot(s.vx, s.vz);
    return { th: 0.45, tu: vel < 4 ? 1 : d.giro, b: false, f1: false, f2: false };
  }

  #naZonaSegura(s) {
    return Math.hypot(s.x - BASE.x, s.z - BASE.z) < ZONA_SEGURA;
  }

  #protegido(ent) {
    return !ent.drone && (this.tick < ent.protegidoAte || this.#naZonaSegura(ent.ship));
  }

  #dano(alvo, bala) {
    if (this.#protegido(alvo)) {
      this.eventos.push({ e: 'acerto', bala: bala.id, alvo: alvo.id, dano: 0, x: bala.x, y: bala.y, z: bala.z });
      return;
    }
    const w = WEAPONS[bala.kind];
    const dano = Math.round(w.dano * (bala.drone ? DRONE.danoMult : 1));
    alvo.ship.hp -= dano;
    alvo.ultimoDano = this.tick;
    this.eventos.push({ e: 'acerto', bala: bala.id, alvo: alvo.id, dano, x: bala.x, y: bala.y, z: bala.z });
    if (alvo.ship.hp > 0) return;
    alvo.ship.hp = 0;
    alvo.vivo = false;
    alvo.respawnTick = this.tick + RESPAWN_TICKS;
    if (!alvo.drone) alvo.mortes++;
    const matador = this.players.get(bala.owner);
    if (matador && matador.id !== alvo.id) {
      matador.abates++;
      matador.ouro += alvo.drone ? DRONE.ouro : OURO_ABATE_JOGADOR;
    }
    this.eventos.push({ e: 'morte', id: alvo.id, por: bala.owner, x: alvo.ship.x, y: alvo.ship.y, z: alvo.ship.z });
  }

  #regen(ent) {
    const s = ent.ship;
    if (s.hp >= s.maxHp) return;
    const semDano = this.tick - ent.ultimoDano;
    // Pousada (parada no chão), a nave conserta rápido, como o "Landed: recovers"
    // das naves do AstroN; mas levar tiro interrompe por um instante.
    const noChao = s.pousado && Math.hypot(s.vx, s.vz) < VEL_TOQUE;
    if (noChao && semDano > POUSO_REGEN_ESPERA_TICKS) {
      s.hp = Math.min(s.maxHp, s.hp + s.maxHp * POUSO_REGEN_HP * DT);
    } else if (semDano > REGEN_ESPERA_TICKS) {
      s.hp = Math.min(s.maxHp, s.hp + s.maxHp * VOO_REGEN_HP * DT);
    }
  }

  #respawn(ent) {
    if (ent.drone) {
      const novo = this.#novoDrone();
      ent.ship = novo.ship;
    } else {
      const p = this.#pontoNaBase();
      ent.ship = createShip(ent.ship.race, p.x, p.z, 0);
      ent.fila.length = 0;
      ent.protegidoAte = this.tick + PROTECAO_TICKS;
    }
    ent.vivo = true;
    this.eventos.push({ e: 'renasceu', id: ent.id });
  }

  /** Avança o mundo um passo. */
  step() {
    this.tick++;

    for (const j of this.players.values()) {
      if (!j.vivo) {
        // Morto: descarta comandos mas confirma o seq, para a predição não acumular.
        if (j.fila.length) j.ack = j.fila[j.fila.length - 1].seq;
        j.fila.length = 0;
        if (this.tick >= j.respawnTick) this.#respawn(j);
        continue;
      }
      const n = Math.min(MAX_INPUTS_TICK, j.fila.length);
      for (let k = 0; k < n; k++) {
        const { seq, inp } = j.fila.shift();
        this.#atira(j, stepShip(j.ship, inp));
        j.ack = seq;
      }
      this.#regen(j);
    }

    for (const d of this.drones) {
      if (!d.vivo) {
        if (this.tick >= d.respawnTick) this.#respawn(d);
        continue;
      }
      this.#atira(d, stepShip(d.ship, this.#iaDrone(d)));
      this.#regen(d);
    }

    const vivos = [...this.players.values(), ...this.drones].filter((e) => e.vivo);
    this.bullets = this.bullets.filter((b) => {
      if (!stepBullet(b)) {
        this.eventos.push({ e: 'fim', bala: b.id, x: b.x, y: b.y, z: b.z });
        return false;
      }
      for (const alvo of vivos) {
        if (alvo.id === b.owner || !alvo.vivo) continue;
        if (b.drone && alvo.drone) continue; // drone não acerta drone
        if (bulletHits(b, alvo.ship)) {
          this.#dano(alvo, b);
          return false;
        }
      }
      return true;
    });
  }

  /** O snapshot sai neste tick? */
  ehTickDeSnapshot() {
    return this.tick % SNAP_CADA === 0;
  }

  /** Entidades visíveis para todos (mesma lista para cada jogador). */
  entidades() {
    const lista = [];
    const add = (e) =>
      lista.push({
        id: e.id,
        nome: e.nome,
        drone: !!e.drone,
        vivo: e.vivo,
        race: e.ship.race,
        x: +e.ship.x.toFixed(2),
        y: +e.ship.y.toFixed(2),
        z: +e.ship.z.toFixed(2),
        yaw: +e.ship.yaw.toFixed(3),
        roll: +e.ship.roll.toFixed(3),
        hp: Math.ceil(e.ship.hp),
        maxHp: e.ship.maxHp,
        boost: e.ship.boost,
        pousado: e.ship.pousado,
      });
    for (const j of this.players.values()) add(j);
    for (const d of this.drones) add(d);
    return lista;
  }

  /** Snapshot para um jogador: estado completo da própria nave + o resto do mundo. */
  snapshotPara(j, ents, eventos) {
    return {
      t: 'snap',
      tick: this.tick,
      ack: j.ack,
      vivo: j.vivo,
      me: j.ship,
      ouro: j.ouro,
      abates: j.abates,
      mortes: j.mortes,
      ents,
      ev: eventos,
    };
  }

  /** Esvazia a lista de eventos acumulados desde o último snapshot. */
  tirarEventos() {
    const ev = this.eventos;
    this.eventos = [];
    return ev;
  }
}

