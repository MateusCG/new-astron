// Escolta armada dos mineradores (DESIGN-PARTIDA.md, "Mineradores"), só no servidor.
//
// Cada time tem ESCOLTA.maxAtivos escolta(s): uma mini-nave armada que sai da base
// como os mineradores (de ESCOLTA.intervaloS em intervalos, contado a partir de
// quando abriu a vaga; a primeira sai ESCOLTA.primeiraS depois do começo da
// partida, logo atrás do primeiro minerador) e anda com eles pelo corredor, sem
// minerar:
// - Com minerador do time no mapa, acompanha o mais exposto (o mais longe da própria
//   base), do lado de fora do corredor (ESCOLTA.lado m para fora da faixa dele) e um
//   pouco atrás; quando ele para no depósito, ela para do lado.
// - Sem minerador, faz a ronda da rota dos mineradores (ROTAS[time], faixa de cada
//   sentido, como eles), da base até a coroa do minério e de volta.
// - Atira como uma torre giratória (não precisa virar a nave): no inimigo mais perto
//   dentro de ESCOLTA.alcance, com linha de tiro livre. Mira jogadores, mineradores e
//   escoltas do outro time (os mesmos alvos da torreta: alvosDoTime em
//   server/torretas.js); monstros e torretas não, pelos mesmos motivos da torreta,
//   e porque derrubar as defesas do outro time é trabalho dos pilotos. Dano fraco e
//   alcance curto: ela atrapalha quem vem caçar o minerador, não o protege sozinha.
// - A física é a de qualquer nave (stepShip): bate em construção, o criogênico a
//   deixa lenta e o pulso EMP a deixa parada e sem tiro enquanto durar, como os
//   mineradores. Na própria base é protegida (World.#protegido); fora dela, o outro
//   time a destrói e ganha RECOMPENSA.escolta (server/progressao.js) pelo #ferir do
//   World. Destruída, a próxima sai da base depois do intervalo.
//
// Para quem vem depois (névoa de guerra): `lista` tem cada escolta viva com `ship`
// (x, z) e `time`, e ela vai nas entidades do snapshot com `tipo: 'escolta'`.

import { createShip, stepShip, createBullet, forward, RACES, VEL_FATOR, DT, WEAPONS } from '../shared/sim.js';
import { BASES, CORREDOR, ROTAS } from '../shared/terrain.js';
import { pontoRota, anguloEntre, yawPara } from './mineradores.js';
import { linhaDeTiro, alvosDoTime } from './torretas.js';

/** Números de balanceamento da escolta. */
export const ESCOLTA = {
  nome: 'Escolta',
  raca: 'shrewdo', // só para a física (stepShip), como o minerador
  maxAtivos: 1, // por time, ao mesmo tempo
  intervaloS: 30, // entre uma saída e outra (depois de destruída)
  primeiraS: 3, // s depois do começo da partida (logo atrás do primeiro minerador)
  hp: 220, // o minerador tem 120
  velocidade: 45, // m/s: mais que o minerador (30), para alcançá-lo e trocar de lado
  alcance: 110, // m (no plano) até onde ela mira
  dano: 6, // por tiro
  cadenciaS: 0.6,
  kind: 'laser', // forma do projétil (a cor vem do time no cliente)
  lado: 14, // m para fora do corredor, ao lado do minerador
  atras: 6, // m atrás do minerador
};
const CADENCIA_TICKS = Math.round(ESCOLTA.cadenciaS / DT);
const VIDA_TIRO = (ESCOLTA.alcance * 1.4) / WEAPONS[ESCOLTA.kind].vel; // s
const SEGUIR = 0.6; // 1/s: quanto da distância até o lugar dela vira velocidade
const CHEGOU = 12; // m: perto assim de um ponto da rota, segue para o próximo
const PARADO = { th: 0, tu: 0, b: false, f1: false, f2: false, p: false, a: 0 };

export class Escoltas {
  /** @param {import('./game.js').World} world */
  constructor(world) {
    this.world = world;
    this.lista = [];
    this.proximaSaida = BASES.map(() => 0);
  }

  /** Partida nova: nenhuma escolta no mapa; a primeira sai depois de ESCOLTA.primeiraS. */
  comecar(tick) {
    this.lista = [];
    this.proximaSaida = BASES.map(() => tick + Math.round(ESCOLTA.primeiraS / DT));
  }

  /** Tira todas do mapa (servidor vazio). */
  limpar() {
    this.lista = [];
  }

  #nova(time) {
    const p = pontoRota(time, 0, true);
    const q = pontoRota(time, 1, true);
    const ship = createShip(ESCOLTA.raca, p.x, p.z, yawPara(p.x, p.z, q.x, q.z));
    ship.time = time;
    ship.hp = ship.maxHp = ESCOLTA.hp;
    return {
      id: this.world.nextId++,
      tipo: 'escolta',
      nome: ESCOLTA.nome,
      time,
      ship,
      vivo: true,
      respawnTick: 0,
      ultimoDano: 0,
      drenoTicks: 0,
      modo: 'ronda', // 'escolta' (com minerador) ou 'ronda' (pela rota)
      estado: 'ida', // na ronda: 'ida' (rumo ao minério) ou 'volta'
      ponto: 1,
      prontaEm: 0,
    };
  }

  /** Um passo: tira as destruídas, solta as novas, move e atira. */
  passo(tick) {
    this.lista = this.lista.filter((e) => e.vivo);
    for (const b of BASES) {
      const ativas = this.lista.reduce((n, e) => n + (e.time === b.time), 0);
      if (ativas >= ESCOLTA.maxAtivos) {
        // Sem vaga: o intervalo só começa a contar quando abrir uma.
        this.proximaSaida[b.time] = Math.max(this.proximaSaida[b.time], tick + Math.round(ESCOLTA.intervaloS / DT));
      } else if (tick >= this.proximaSaida[b.time]) {
        this.lista.push(this.#nova(b.time));
        this.proximaSaida[b.time] = tick + Math.round(ESCOLTA.intervaloS / DT);
      }
    }
    for (const e of this.lista) {
      this.#mover(e);
      this.#atirar(e, tick);
    }
  }

  /** Minerador do time mais longe da base (o mais exposto), ou null. */
  #protegido(time) {
    const b = BASES[time];
    let melhor = null;
    let dist = -1;
    for (const m of this.world.mineradores.lista) {
      if (!m.vivo || m.time !== time) continue;
      const d = Math.hypot(m.ship.x - b.x, m.ship.z - b.z);
      if (d > dist) {
        dist = d;
        melhor = m;
      }
    }
    return melhor;
  }

  #mover(e) {
    const s = e.ship;
    if (s.emp > 0) {
      stepShip(s, PARADO); // pulso EMP: motor desligado, para aos poucos
      return;
    }
    const vMax = RACES[s.race].velocidade * VEL_FATOR * (s.velMult ?? 1);
    const m = this.#protegido(e.time);
    let vx;
    let vz;
    let olhar = null; // yaw para parar olhando (lado do minerador parado)
    if (m) {
      e.modo = 'escolta';
      // Lugar dela: do lado de fora da faixa do minerador, um pouco atrás.
      const ms = m.ship;
      const f = forward(ms.yaw);
      const lado = Math.sign(ms.x - CORREDOR.x) || 1;
      const px = ms.x + lado * ESCOLTA.lado - f.x * ESCOLTA.atras;
      const pz = ms.z - f.z * ESCOLTA.atras;
      vx = ms.vx + (px - s.x) * SEGUIR;
      vz = ms.vz + (pz - s.z) * SEGUIR;
      olhar = ms.yaw;
    } else {
      if (e.modo !== 'ronda') this.#retomarRota(e);
      e.modo = 'ronda';
      const alvo = this.#pontoDaRonda(e);
      const d = Math.hypot(alvo.x - s.x, alvo.z - s.z) || 1;
      vx = ((alvo.x - s.x) / d) * ESCOLTA.velocidade;
      vz = ((alvo.z - s.z) / d) * ESCOLTA.velocidade;
    }
    const vel = Math.min(ESCOLTA.velocidade, Math.hypot(vx, vz));
    if (vel < 3) {
      // No lugar: freia virando para o mesmo lado do minerador.
      const diff = olhar == null ? 0 : anguloEntre(s.yaw, olhar);
      stepShip(s, { ...PARADO, tu: Math.max(-1, Math.min(1, diff * 2.5)) });
      return;
    }
    const diff = anguloEntre(s.yaw, Math.atan2(-vx, -vz));
    const th = (vel / vMax) * Math.max(0.15, 1 - Math.abs(diff) / 1.6); // curva fechada: freia
    stepShip(s, { ...PARADO, th, tu: Math.max(-1, Math.min(1, diff * 2.5)) });
  }

  /** Volta para a ronda: próximo ponto da rota rumo ao minério, a partir de onde está. */
  #retomarRota(e) {
    const rota = ROTAS[e.time];
    const fim = rota[rota.length - 1];
    const falta = Math.hypot(fim.x - e.ship.x, fim.z - e.ship.z);
    e.estado = 'ida';
    e.ponto = rota.findIndex((p) => Math.hypot(fim.x - p.x, fim.z - p.z) < falta - 5);
    if (e.ponto < 0) e.ponto = rota.length - 1;
  }

  /** Ponto da ronda onde ela está indo; troca de sentido nas pontas da rota. */
  #pontoDaRonda(e) {
    const ultimo = ROTAS[e.time].length - 1;
    let alvo = pontoRota(e.time, e.ponto, e.estado === 'ida');
    if (Math.hypot(alvo.x - e.ship.x, alvo.z - e.ship.z) < CHEGOU) {
      if (e.estado === 'ida' && e.ponto >= ultimo) {
        e.estado = 'volta';
        e.ponto = ultimo - 1;
      } else if (e.estado === 'volta' && e.ponto <= 0) {
        e.estado = 'ida';
        e.ponto = 1;
      } else e.ponto += e.estado === 'ida' ? 1 : -1;
      alvo = pontoRota(e.time, e.ponto, e.estado === 'ida');
    }
    return alvo;
  }

  /** Tiro no inimigo mais perto ao alcance, com linha livre (sob EMP, nada). */
  #atirar(e, tick) {
    const s = e.ship;
    if (s.emp > 0 || tick < e.prontaEm) return;
    let alvo = null;
    let dist = ESCOLTA.alcance;
    for (const a of alvosDoTime(this.world, e.time)) {
      const d = Math.hypot(a.ship.x - s.x, a.ship.z - s.z);
      if (d >= dist || !linhaDeTiro(s.x, s.y, s.z, a.ship.x, a.ship.y, a.ship.z)) continue;
      dist = d;
      alvo = a;
    }
    if (!alvo) return;
    e.prontaEm = tick + CADENCIA_TICKS;
    // Mira adiantada pela velocidade do alvo; o tiro sai do nariz desviado do rumo.
    const w = WEAPONS[ESCOLTA.kind];
    const t = dist / w.vel;
    const ax = alvo.ship.x + alvo.ship.vx * t;
    const az = alvo.ship.z + alvo.ship.vz * t;
    const ang = anguloEntre(s.yaw, yawPara(s.x, s.z, ax, az));
    const b = createBullet(s, ESCOLTA.kind, this.world.nextId++, e.id, 0, ang);
    b.drone = false;
    b.time = e.time; // sem fogo amigo
    b.mult = ESCOLTA.dano / w.dano;
    b.vida = VIDA_TIRO;
    this.world.adicionarTiro(b, { fonte: 'escolta', time: e.time });
  }
}
