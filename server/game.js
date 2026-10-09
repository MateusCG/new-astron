// Mundo do jogo no servidor: um mapa, as naves dos jogadores, os inimigos (PvE:
// drones Arnosh e monstros Vorax) e os tiros. Roda em passo fixo de 30 Hz (DT de shared/sim.js) e manda o
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
  VEL_FATOR,
  RACES,
} from '../shared/sim.js';
import { paredeAt, BASE, MAP_HALF } from '../shared/terrain.js';
import { MapaNavegacao } from './navegacao.js';

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

// Monstros Vorax: caçadores que vêm atrás de quem sai da base, de qualquer canto do
// mapa, pelo caminho dos cânions (server/navegacao.js). Atacam com as garras, de
// perto, e não atiram. Mais lentos que qualquer nave de jogador (a mais lenta faz
// ~50 m/s sem boost), para dar para fugir ou virar e brigar. Não entram na zona
// segura: quem está na base fica a salvo e eles rondam a borda esperando. Quando
// morrem, renascem longe de todo mundo e voltam a caçar, para sempre ter monstro
// vindo.
const N_MONSTROS = 6;
const VORAX = {
  nome: 'Vorax',
  raca: 'mechan', // só para a física (stepShip); o tipo é que diz o que ele é
  hp: 70,
  velocidade: 42, // m/s
  dano: 10, // por golpe de garra
  alcance: 14, // m entre os centros para a garra pegar
  intervaloS: 1.2, // s entre golpes do mesmo monstro
  ouro: 30,
  renascerS: 6,
  distRenascer: 450, // m mínimos de qualquer jogador vivo ao renascer
};
const VORAX_INTERVALO_TICKS = Math.round(VORAX.intervaloS * TICK_HZ);
const VORAX_RENASCER_TICKS = VORAX.renascerS * TICK_HZ;
const VORAX_RECALCULO_TICKS = 15; // de quanto em quanto tempo o mapa de caça é refeito
const VORAX_PERTO = 60; // m: daqui para dentro, com linha livre, vai direto no jogador
const VORAX_AFASTAR = 16; // m: dois monstros mais perto que isso se empurram
const VORAX_MARGEM_ZONA = 5; // m além da zona segura que o monstro não cruza
const VORAX_RONDA_TROCA_TICKS = 4 * TICK_HZ; // ronda na borda troca de sentido
const VORAX_PRESO_TICKS = 1.5 * TICK_HZ; // parado esse tempo querendo andar: dá ré
const VORAX_RE_TICKS = 0.6 * TICK_HZ;
const LIMITE_VORAX = ZONA_SEGURA + VORAX_MARGEM_ZONA;

// A grade de navegação depende só do terreno: monta uma vez por processo, na
// primeira vez que aparece um monstro.
let navegacao = null;
function nav() {
  navegacao ??= new MapaNavegacao({ raioBloqueio: LIMITE_VORAX });
  return navegacao;
}

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
  constructor({ rng = Math.random, drones = N_DRONES, monstros = N_MONSTROS } = {}) {
    this.rng = rng;
    this.tick = 0;
    this.nextId = 1;
    this.players = new Map();
    this.drones = [];
    this.monstros = [];
    this.bullets = [];
    this.eventos = [];
    // Mapa de caça dos Vorax: campo de caminhos até os jogadores caçáveis.
    this.caca = { campo: null, alvos: [], ate: 0 };
    for (let i = 0; i < drones; i++) this.drones.push(this.#novoDrone());
    for (let i = 0; i < monstros; i++) this.monstros.push(this.#novoVorax());
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
    return { id: this.#id(), tipo: 'arnosh', drone: true, nome: DRONE.nome, ship, vivo: true, respawnTick: 0, giro: 0, ultimoDano: 0 };
  }

  /**
   * Ponto de cânion para um Vorax nascer: na rede de corredores ligada à saída da
   * base (o corredor norte), por onde os jogadores andam, e longe de todo jogador
   * vivo, para ninguém ver monstro brotar do lado.
   */
  #pontoVorax() {
    const rede = nav().rede(BASE.x, BASE.z - LIMITE_VORAX - 50);
    let reserva = null;
    for (let t = 0; t < 300; t++) {
      const p = this.#pontoNoCanion();
      const c = nav().indice(p.x, p.z);
      if (c < 0 || !rede[c]) continue;
      reserva = p;
      let longe = true;
      for (const j of this.players.values()) {
        if (j.vivo && Math.hypot(j.ship.x - p.x, j.ship.z - p.z) < VORAX.distRenascer) longe = false;
      }
      if (longe) return p;
    }
    return reserva ?? this.#pontoNoCanion();
  }

  #naveVorax() {
    const p = this.#pontoVorax();
    const ship = createShip(VORAX.raca, p.x, p.z, this.rng() * Math.PI * 2);
    ship.hp = ship.maxHp = VORAX.hp;
    return ship;
  }

  #novoVorax() {
    return {
      id: this.#id(),
      tipo: 'vorax',
      drone: true, // inimigo: o cliente pinta de vermelho e o tiro de drone não o acerta
      nome: VORAX.nome,
      ship: this.#naveVorax(),
      vivo: true,
      respawnTick: 0,
      ultimoDano: 0,
      ultimoGolpe: -VORAX_INTERVALO_TICKS,
      alvo: 0,
      ronda: this.rng() < 0.5 ? 1 : -1,
      preso: 0,
      re: 0,
    };
  }

  /** Entra um jogador. Retorna o objeto do jogador (o servidor guarda o socket nele). */
  addPlayer(nome, race) {
    const p = this.#pontoNaBase();
    const id = this.#id();
    const jogador = {
      id,
      tipo: 'jogador',
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

  /**
   * Refaz de tempos em tempos o mapa de caça: o caminho, pelos cânions, de cada
   * ponto do mapa até o jogador caçável mais próximo (vivo e fora da zona segura).
   * Sem ninguém caçável, o mapa leva até a borda da zona segura.
   */
  #atualizarCaca() {
    if (this.caca.campo && this.tick < this.caca.ate) return;
    this.caca.ate = this.tick + VORAX_RECALCULO_TICKS;
    const alvos = [...this.players.values()].filter((j) => j.vivo && !this.#naZonaSegura(j.ship));
    if (!alvos.length) {
      this.caca.campo = nav().campoBase();
      this.caca.alvos = [];
      return;
    }
    const paradas = this.monstros.filter((m) => m.vivo).map((m) => m.ship);
    this.caca.campo = nav().campo(
      alvos.map((j) => j.ship),
      paradas,
    );
    this.caca.alvos = alvos;
  }

  #iaVorax(m) {
    const s = m.ship;
    const thMax = Math.min(1, VORAX.velocidade / (RACES[s.race].velocidade * VEL_FATOR));
    if (m.re > 0) {
      // Preso numa quina: dá ré virando, e depois tenta de novo.
      m.re--;
      return { th: -0.6, tu: m.ronda, b: false, f1: false, f2: false };
    }
    const passo = this.caca.campo ? nav().proximoPonto(this.caca.campo, s.x, s.z) : null;
    let alvo = passo && passo.origem >= 0 ? this.caca.alvos[passo.origem] : null;
    if (alvo && (!alvo.vivo || !this.players.has(alvo.id) || this.#naZonaSegura(alvo.ship))) alvo = null;
    m.alvo = alvo?.id ?? 0;

    let dx = 0;
    let dz = 0;
    let th = thMax;
    if (alvo) {
      const ax = alvo.ship.x - s.x;
      const az = alvo.ship.z - s.z;
      const d = Math.hypot(ax, az);
      if (d < VORAX_PERTO && nav().linhaLivre(s.x, s.z, alvo.ship.x, alvo.ship.z)) {
        // Já vê o jogador: vai direto e, encostado, freia para ficar grudado nele.
        dx = ax;
        dz = az;
        if (d < VORAX.alcance * 0.7) th = 0;
        else if (d < VORAX.alcance * 1.5) th = thMax * 0.5;
      } else if (passo) {
        dx = passo.x - s.x;
        dz = passo.z - s.z;
      }
    } else if (passo && passo.dist > 3) {
      // Ninguém caçável: vai para a borda da zona segura.
      dx = passo.x - s.x;
      dz = passo.z - s.z;
    } else if (passo) {
      // Na borda da zona segura: ronda em volta da base, trocando de sentido às vezes.
      if (this.tick % VORAX_RONDA_TROCA_TICKS === m.id % VORAX_RONDA_TROCA_TICKS) m.ronda = this.rng() < 0.5 ? 1 : -1;
      const rx = s.x - BASE.x;
      const rz = s.z - BASE.z;
      const r = Math.hypot(rx, rz) || 1;
      dx = (-rz / r) * m.ronda + (rx / r) * 0.3;
      dz = (rx / r) * m.ronda + (rz / r) * 0.3;
      th = thMax * 0.45;
    } else {
      // Sem caminho daqui (canto isolado): patrulha devagar como o Arnosh.
      if (this.tick % 45 === m.id % 45) m.ronda = this.rng() < 0.5 ? 1 : -1;
      return { th: thMax * 0.5, tu: Math.hypot(s.vx, s.vz) < 4 ? 1 : m.ronda * 0.3, b: false, f1: false, f2: false };
    }

    // Monstros perto um do outro se empurram, para cercar o jogador em vez de
    // virarem um bolo só.
    const len = Math.hypot(dx, dz) || 1;
    let vx = dx / len;
    let vz = dz / len;
    for (const o of this.monstros) {
      if (o === m || !o.vivo) continue;
      const ox = s.x - o.ship.x;
      const oz = s.z - o.ship.z;
      const d = Math.hypot(ox, oz);
      if (d > 0.01 && d < VORAX_AFASTAR) {
        const k = ((VORAX_AFASTAR - d) / VORAX_AFASTAR) * 1.5;
        vx += (ox / d) * k;
        vz += (oz / d) * k;
      }
    }
    const diff = anguloEntre(s.yaw, Math.atan2(-vx, -vz));
    th *= Math.max(0.15, 1 - Math.abs(diff) / 1.6); // curva fechada: freia para virar

    if (th >= thMax * 0.5 && Math.hypot(s.vx, s.vz) < 4) m.preso++;
    else m.preso = 0;
    if (m.preso > VORAX_PRESO_TICKS) {
      m.preso = 0;
      m.re = VORAX_RE_TICKS;
      m.ronda = -m.ronda;
    }
    return { th, tu: Math.max(-1, Math.min(1, diff * 2.5)), b: false, f1: false, f2: false };
  }

  /** Monstro não cruza a zona segura: se a física o pôs dentro, volta para a borda. */
  #foraDaZona(s) {
    const rx = s.x - BASE.x;
    const rz = s.z - BASE.z;
    const r = Math.hypot(rx, rz);
    if (r >= LIMITE_VORAX) return;
    const ux = r > 1e-6 ? rx / r : 0;
    const uz = r > 1e-6 ? rz / r : -1;
    s.x = BASE.x + ux * LIMITE_VORAX;
    s.z = BASE.z + uz * LIMITE_VORAX;
    const vr = s.vx * ux + s.vz * uz;
    if (vr < 0) {
      s.vx -= vr * ux;
      s.vz -= vr * uz;
    }
  }

  /** Golpe de garra no jogador mais perto ao alcance (nunca na zona segura). */
  #garra(m) {
    if (this.tick - m.ultimoGolpe < VORAX_INTERVALO_TICKS) return;
    let alvo = null;
    let melhor = VORAX.alcance;
    for (const j of this.players.values()) {
      if (!j.vivo || this.#naZonaSegura(j.ship) || Math.abs(j.ship.y - m.ship.y) > 8) continue;
      const d = Math.hypot(j.ship.x - m.ship.x, j.ship.z - m.ship.z);
      if (d < melhor) {
        melhor = d;
        alvo = j;
      }
    }
    if (!alvo) return;
    m.ultimoGolpe = this.tick;
    const s = alvo.ship;
    this.#ferir(alvo, VORAX.dano, m.id, { e: 'garra', id: m.id, x: s.x, y: s.y, z: s.z });
  }

  #naZonaSegura(s) {
    return Math.hypot(s.x - BASE.x, s.z - BASE.z) < ZONA_SEGURA;
  }

  #protegido(ent) {
    return !ent.drone && (this.tick < ent.protegidoAte || this.#naZonaSegura(ent.ship));
  }

  #dano(alvo, bala) {
    const dano = Math.round(WEAPONS[bala.kind].dano * (bala.drone ? DRONE.danoMult : 1));
    this.#ferir(alvo, dano, bala.owner, { e: 'acerto', bala: bala.id, x: bala.x, y: bala.y, z: bala.z });
  }

  /**
   * Tira `dano` de vida do alvo (tiro ou garra) e trata a morte. `ev` é o evento do
   * golpe, completado aqui com alvo e dano (0 se o alvo estava protegido).
   */
  #ferir(alvo, dano, autor, ev) {
    if (this.#protegido(alvo)) {
      this.eventos.push({ ...ev, alvo: alvo.id, dano: 0 });
      return;
    }
    alvo.ship.hp -= dano;
    alvo.ultimoDano = this.tick;
    this.eventos.push({ ...ev, alvo: alvo.id, dano });
    if (alvo.ship.hp > 0) return;
    alvo.ship.hp = 0;
    alvo.vivo = false;
    alvo.respawnTick = this.tick + (alvo.tipo === 'vorax' ? VORAX_RENASCER_TICKS : RESPAWN_TICKS);
    if (!alvo.drone) alvo.mortes++;
    const matador = this.players.get(autor);
    if (matador && matador.id !== alvo.id) {
      matador.abates++;
      matador.ouro += alvo.tipo === 'vorax' ? VORAX.ouro : alvo.drone ? DRONE.ouro : OURO_ABATE_JOGADOR;
    }
    this.eventos.push({ e: 'morte', id: alvo.id, por: autor, x: alvo.ship.x, y: alvo.ship.y, z: alvo.ship.z });
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
    if (ent.tipo === 'vorax') {
      ent.ship = this.#naveVorax();
      ent.preso = ent.re = 0;
    } else if (ent.drone) {
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

    if (this.monstros.length) this.#atualizarCaca();
    for (const m of this.monstros) {
      if (!m.vivo) {
        if (this.tick >= m.respawnTick) this.#respawn(m);
        continue;
      }
      stepShip(m.ship, this.#iaVorax(m)); // não atira: o ataque é a garra
      this.#foraDaZona(m.ship);
      this.#garra(m);
      this.#regen(m);
    }

    const vivos = [...this.players.values(), ...this.drones, ...this.monstros].filter((e) => e.vivo);
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

  /**
   * Entidades visíveis para todos (mesma lista para cada jogador). `tipo` diz o
   * que desenhar ('jogador', 'arnosh' ou 'vorax'); `drone` continua true para todo
   * inimigo.
   */
  entidades() {
    const lista = [];
    const add = (e) =>
      lista.push({
        id: e.id,
        nome: e.nome,
        tipo: e.tipo,
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
    for (const m of this.monstros) add(m);
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

