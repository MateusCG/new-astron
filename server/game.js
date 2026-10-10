// Mundo do jogo no servidor: um mapa, as naves dos jogadores, os inimigos (PvE:
// drones Arnosh e monstros Vorax) e os tiros. Roda em passo fixo de 30 Hz (DT de shared/sim.js) e manda o
// estado para os clientes a 15 Hz.
//
// Regra de ouro herdada do Sideral: o servidor decide tudo o que importa (posição,
// acerto, dano, morte, ouro, XP). O cliente só manda comandos numerados (seq); o servidor
// aplica cada comando uma vez, em ordem, e devolve no snapshot o último seq aplicado
// (ack) junto com o estado da nave, para o cliente reconciliar a predição.
//
// Limites contra trapaça: no máximo MAX_INPUTS_TICK comandos por tick (não dá para
// "acelerar o tempo" mandando comando demais) e fila de no máximo MAX_FILA.
//
// Efeitos de arma (WEAPONS[].efeito) também são só do servidor: o dreno fica na
// entidade (drenoTicks, drenoDono) e tira vida a cada tick, respeitando a zona
// segura e a proteção de nascimento; a lentidão do criogênico vai para ship.lento,
// que o stepShip usa e o snapshot leva no `me` (para a predição bater). As
// entidades do snapshot trazem `dreno` e `lento` para todos desenharem o efeito.
//
// Partida 3 contra 3 (DESIGN-PARTIDA.md): times, cronômetro e placar ficam em
// server/partida.js; os mineradores em server/mineradores.js; os bônus por tempo
// dos mineradores em server/bonus.js. Aqui ficam só os ganchos: o jogador entra no
// time com menos gente e nasce na base dele; tiro de aliado atravessa aliado (sem
// fogo amigo, nem nos mineradores); a zona segura só protege o time dono da base
// (na base do outro time você leva dano normalmente). Drones e Vorax continuam sem
// entrar em base nenhuma: as duas são território dos jogadores.
//
// XP, nível e ouro por abate ficam em server/progressao.js (na morte, em #ferir); os
// objetivos A, B e C em server/objetivos.js (no step, no tiro que bate na torre e
// na morte do guardião), que ligam os bônus em this.bonus; os monstros elite
// (Krakor e o guardião) em server/elites.js.

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
import { BASE, BASES, CORREDOR } from '../shared/terrain.js';
import { pontoAberto } from '../shared/obstaculos.js';
import { MapaNavegacao } from './navegacao.js';
import { Partida, N_TIMES } from './partida.js';
import { Mineradores } from './mineradores.js';
import { Bonus } from './bonus.js';
import { Objetivos } from './objetivos.js';
import { novaProgressao, recompensar, aplicarNivel, xpParaNivel } from './progressao.js';
import { KRAKOR, N_KRAKOR, novaElite, renascerElite, iaElite } from './elites.js';

export const TICK_HZ = 30;
const SNAP_CADA = 2; // ticks entre snapshots (15 Hz)
const MAX_INPUTS_TICK = 4;
const MAX_FILA = 30;
const RESPAWN_TICKS = 3 * TICK_HZ;
const REGEN_ESPERA_TICKS = 5 * TICK_HZ;
const VOO_REGEN_HP = 0.03; // fração do HP máximo por segundo, voando
const POUSO_REGEN_HP = 0.08; // fração do HP máximo por segundo, pousada
const POUSO_REGEN_ESPERA_TICKS = 1 * TICK_HZ;
// Monstros do mundo aberto (3000 × 2000 m): Arnosh espalhados patrulhando, Vorax
// caçando (N_MONSTROS) e os Krakor, elites raros (N_KRAKOR em server/elites.js).
// XP e ouro de cada tipo ficam em RECOMPENSA (server/progressao.js).
const N_DRONES = 14;
const DRONE = { nome: 'Arnosh', hp: 90, visao: 200, alcance: 210, danoMult: 0.5 };
// Arnosh patrulhando não entra na faixa do corredor (é dos mineradores): dá meia
// volta a esta distância do meio dele. Caçando um jogador, entra.
const DRONE_LIMITE_CORREDOR = CORREDOR.largura / 2 + 40;
// Zona segura: em volta da base do PRÓPRIO time ninguém leva dano. Drones não
// perseguem quem está em base nenhuma (nem entram nelas).
export const ZONA_SEGURA = BASE.raio + 30;
// Drone que chega a esta distância de uma base (patrulhando ou caçando) dá meia
// volta para o mundo aberto: as bases são território dos jogadores.
const DRONE_LIMITE_BASE = ZONA_SEGURA + 60;
const PROTECAO_TICKS = 3 * TICK_HZ; // invulnerável logo depois de nascer

// Monstros Vorax: caçadores que vêm atrás de quem sai da base, de qualquer canto do
// mapa, contornando as mesas de rocha (server/navegacao.js). Atacam com as garras, de
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
  renascerS: 6,
  distRenascer: 450, // m mínimos de qualquer jogador vivo ao renascer
};
const VORAX_INTERVALO_TICKS = Math.round(VORAX.intervaloS * TICK_HZ);
const VORAX_RENASCER_TICKS = VORAX.renascerS * TICK_HZ;
const VORAX_RECALCULO_TICKS = 15; // de quanto em quanto tempo o mapa de caça é refeito
const VORAX_PERTO = 60; // m: daqui para dentro, com linha livre, vai direto no jogador
const VORAX_AFASTAR = 16; // m: dois monstros mais perto que isso se empurram
const VORAX_ESPACO = 9; // m: não encosta mais que isso numa nave (não fica dentro dela)
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

/** A base mais perto do ponto. */
function baseMaisPerto(s) {
  let melhor = BASES[0];
  for (const b of BASES) if (Math.hypot(s.x - b.x, s.z - b.z) < Math.hypot(s.x - melhor.x, s.z - melhor.z)) melhor = b;
  return melhor;
}

export class World {
  /**
   * @param {{ rng?: () => number, drones?: number, monstros?: number, elites?: number,
   *   duracaoPartidaS?: number, intervaloFimS?: number }} [opcoes]
   * drones = Arnosh, monstros = Vorax, elites = Krakor (os guardiões dos objetivos C
   * sempre existem).
   */
  constructor({ rng = Math.random, drones = N_DRONES, monstros = N_MONSTROS, elites = N_KRAKOR, duracaoPartidaS, intervaloFimS } = {}) {
    this.rng = rng;
    this.tick = 0;
    this.nextId = 1;
    this.players = new Map();
    this.drones = [];
    this.monstros = [];
    this.elites = []; // Krakor e guardiões
    this.bullets = [];
    this.eventos = [];
    // Mapa de caça dos Vorax: campo de caminhos até os jogadores caçáveis.
    this.caca = { campo: null, alvos: [], ate: 0 };
    this.partida = new Partida({ duracaoS: duracaoPartidaS, intervaloFimS });
    this.bonus = new Bonus();
    this.mineradores = new Mineradores({
      bonus: this.bonus,
      novoId: () => this.#id(),
      entregar: (time, carga) => this.partida.somar(time, carga),
      evento: (ev) => this.eventos.push(ev),
    });
    for (let i = 0; i < drones; i++) this.drones.push(this.#novoDrone());
    for (let i = 0; i < monstros; i++) this.monstros.push(this.#novoVorax());
    for (let i = 0; i < elites; i++) {
      const p = this.#pontoKrakor();
      this.elites.push(novaElite('krakor', this.#id(), p.x, p.z, this.rng() * Math.PI * 2));
    }
    this.objetivos = new Objetivos(this);
    // O que a IA dos elites lê do mundo.
    const players = this.players;
    this.ctxElite = {
      tick: 0,
      rng: this.rng,
      get jogadores() {
        return players.values();
      },
      naZonaSegura: (s) => this.#naZonaSegura(s),
      zonaSegura: ZONA_SEGURA,
    };
  }

  #id() {
    return this.nextId++;
  }

  /** Ponto sorteado no centro da base do time, e o yaw de quem olha para o corredor. */
  #pontoNaBase(time) {
    const b = BASES[time];
    const a = this.rng() * Math.PI * 2;
    const r = this.rng() * 60;
    // yaw 0 olha para -z: a base de baixo (+z) olha para o norte, a de cima para o sul.
    const yaw = b.z > CORREDOR.zInicio ? 0 : Math.PI;
    return { x: b.x + Math.cos(a) * r, z: b.z + Math.sin(a) * r, yaw };
  }

  /** Nave nova do jogador na base do time dele, voltada para o corredor. */
  #naveNaBase(race, time) {
    const p = this.#pontoNaBase(time);
    const ship = createShip(race, p.x, p.z, p.yaw);
    ship.time = time; // vai no `me`: a predição precisa para o pouso (pousoPermitido)
    return ship;
  }

  #novoDrone() {
    const p = pontoAberto(this.rng);
    const ship = createShip('mechan', p.x, p.z, this.rng() * Math.PI * 2);
    ship.hp = ship.maxHp = DRONE.hp;
    return { id: this.#id(), tipo: 'arnosh', drone: true, nome: DRONE.nome, ship, vivo: true, respawnTick: 0, giro: 0, ultimoDano: 0 };
  }

  /**
   * Ponto do mundo aberto para um Vorax nascer: na parte do mapa ligada à saída da
   * base (sem ilha cercada de rocha), e longe de todo jogador vivo, para ninguém ver
   * monstro brotar do lado.
   */
  #pontoVorax(opcoes) {
    const rede = nav().rede(BASE.x, BASE.z - LIMITE_VORAX - 50);
    let reserva = null;
    for (let t = 0; t < 300; t++) {
      const p = pontoAberto(this.rng, opcoes);
      const c = nav().indice(p.x, p.z);
      if (c < 0 || !rede[c]) continue;
      reserva = p;
      let longe = true;
      for (const j of this.players.values()) {
        if (j.vivo && Math.hypot(j.ship.x - p.x, j.ship.z - p.z) < VORAX.distRenascer) longe = false;
      }
      if (longe) return p;
    }
    return reserva ?? pontoAberto(this.rng, opcoes);
  }

  /** Covil de um Krakor: como o ponto do Vorax, mas bem longe das bases e do corredor. */
  #pontoKrakor() {
    return this.#pontoVorax({ folgaBase: KRAKOR.folgaBase, folgaCorredor: KRAKOR.folgaCorredor });
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

  /**
   * Entra um jogador, no time com menos gente. Retorna o objeto do jogador (o
   * servidor guarda o socket nele), ou null se os dois times estão cheios
   * (o servidor responde 'partida_cheia').
   */
  addPlayer(nome, race) {
    const tamanhos = Array.from({ length: N_TIMES }, () => 0);
    for (const j of this.players.values()) tamanhos[j.time]++;
    const time = this.partida.escolherTime(tamanhos);
    if (time === null) return null;
    const id = this.#id();
    const jogador = {
      id,
      tipo: 'jogador',
      nome: limpaNome(nome),
      time,
      ship: this.#naveNaBase(race, time),
      fila: [],
      ack: 0,
      vivo: true,
      respawnTick: 0,
      ultimoDano: 0,
      protegidoAte: this.tick + PROTECAO_TICKS,
      ouro: 0,
      abates: 0,
      mortes: 0,
      ...novaProgressao(), // nivel, xp
    };
    this.players.set(id, jogador);
    this.eventos.push({ e: 'entrou', id, nome: jogador.nome, time });
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
    for (const { kind, off, ang } of disparos) {
      const b = createBullet(ent.ship, kind, this.#id(), ent.id, off, ang);
      b.drone = !!ent.drone;
      b.time = ent.time; // sem fogo amigo: o tiro atravessa quem é do mesmo time
      b.mult = ent.danoMult ?? (ent.drone ? DRONE.danoMult : 1);
      this.bullets.push(b);
      this.eventos.push({ e: 'tiro', id: b.id, dono: ent.id, kind, x: b.x, y: b.y, z: b.z, vx: b.vx, vy: b.vy, vz: b.vz });
    }
  }

  #iaDrone(d) {
    const s = d.ship;
    const b = baseMaisPerto(s);
    if (Math.hypot(s.x - b.x, s.z - b.z) < DRONE_LIMITE_BASE) {
      // Perto de uma base: dá as costas para ela e volta para o mundo aberto.
      const diff = anguloEntre(s.yaw, Math.atan2(-(s.x - b.x), -(s.z - b.z)));
      return { th: Math.abs(diff) > 1 ? 0.2 : 0.6, tu: Math.max(-1, Math.min(1, diff * 2.5)), b: false, f1: false, f2: false };
    }
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
    if (!alvo && Math.abs(s.x - CORREDOR.x) < DRONE_LIMITE_CORREDOR) {
      // Patrulhando na faixa do corredor: vira para o lado de onde veio.
      const lado = Math.sign(s.x - CORREDOR.x) || 1;
      const diff = anguloEntre(s.yaw, Math.atan2(-lado, 0));
      return { th: Math.abs(diff) > 1 ? 0.2 : 0.6, tu: Math.max(-1, Math.min(1, diff * 2.5)), b: false, f1: false, f2: false };
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
   * Refaz de tempos em tempos o mapa de caça: o caminho, contornando as rochas, de cada
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
      const b = baseMaisPerto(s);
      const rx = s.x - b.x;
      const rz = s.z - b.z;
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
    const b = baseMaisPerto(s);
    const rx = s.x - b.x;
    const rz = s.z - b.z;
    const r = Math.hypot(rx, rz);
    if (r >= LIMITE_VORAX) return;
    const ux = r > 1e-6 ? rx / r : 0;
    const uz = r > 1e-6 ? rz / r : Math.sign(-b.z) || -1; // de dentro, sai pelo corredor
    s.x = b.x + ux * LIMITE_VORAX;
    s.z = b.z + uz * LIMITE_VORAX;
    const vr = s.vx * ux + s.vz * uz;
    if (vr < 0) {
      s.vx -= vr * ux;
      s.vz -= vr * uz;
    }
  }

  /** O monstro não entra dentro da nave do jogador: fica a VORAX_ESPACO do centro. */
  #naoEncostar(s) {
    for (const j of this.players.values()) {
      if (!j.vivo) continue;
      const rx = s.x - j.ship.x;
      const rz = s.z - j.ship.z;
      const r = Math.hypot(rx, rz);
      if (r >= VORAX_ESPACO || r < 1e-6) continue;
      s.x = j.ship.x + (rx / r) * VORAX_ESPACO;
      s.z = j.ship.z + (rz / r) * VORAX_ESPACO;
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
    return BASES.some((b) => Math.hypot(s.x - b.x, s.z - b.z) < ZONA_SEGURA);
  }

  /** Na zona segura da base do próprio time (a do outro time não protege). */
  #naPropriaBase(ent) {
    const b = BASES[ent.time];
    return !!b && Math.hypot(ent.ship.x - b.x, ent.ship.z - b.z) < ZONA_SEGURA;
  }

  #protegido(ent) {
    return !ent.drone && (this.tick < ent.protegidoAte || this.#naPropriaBase(ent));
  }

  /** O tiro `b` pode acertar `alvo`? Não acerta o dono, aliado nem (se de drone) drone ou minerador. */
  #podeAcertar(b, alvo) {
    if (alvo.id === b.owner || !alvo.vivo) return false;
    if (b.time !== undefined && b.time === alvo.time) return false; // sem fogo amigo
    if (b.drone && (alvo.drone || alvo.tipo === 'minerador')) return false;
    return true;
  }

  /** Dano de um tiro no impacto (arma × multiplicador de quem atirou). */
  danoDoTiro(bala) {
    return WEAPONS[bala.kind].dano * (bala.mult ?? 1);
  }

  #dano(alvo, bala) {
    const w = WEAPONS[bala.kind];
    const dano = Math.round(this.danoDoTiro(bala));
    // Efeitos de arma só pegam em quem pode levar dano. Acertar de novo renova a
    // duração; não soma nem empilha.
    if (!this.#protegido(alvo)) {
      if (w.efeito?.tipo === 'dreno') {
        alvo.drenoTicks = Math.round(w.efeito.duracao * TICK_HZ);
        alvo.drenoDono = bala.owner;
      } else if (w.efeito?.tipo === 'lento') {
        alvo.ship.lento = Math.max(alvo.ship.lento || 0, w.efeito.duracao);
      }
    }
    this.#ferir(alvo, dano, bala.owner, { e: 'acerto', bala: bala.id, x: bala.x, y: bala.y, z: bala.z });
  }

  /**
   * Tira `dano` de vida do alvo (tiro, garra ou dreno) e trata a morte, dando o
   * abate, o ouro e o XP a `autor` (RECOMPENSA pelo tipo do alvo). `ev` é o evento
   * do golpe, completado aqui com alvo e dano (0 se o alvo estava protegido); o
   * dreno, que fere a cada tick, não manda.
   */
  #ferir(alvo, dano, autor, ev) {
    if (this.#protegido(alvo)) {
      if (ev) this.eventos.push({ ...ev, alvo: alvo.id, dano: 0 });
      return;
    }
    alvo.ship.hp -= dano;
    alvo.ultimoDano = this.tick;
    if (ev) this.eventos.push({ ...ev, alvo: alvo.id, dano });
    if (alvo.ship.hp > 0) return;
    alvo.ship.hp = 0;
    alvo.vivo = false;
    alvo.drenoTicks = 0;
    alvo.respawnTick = this.tick + (alvo.renascerTicks ?? (alvo.tipo === 'vorax' ? VORAX_RENASCER_TICKS : RESPAWN_TICKS));
    if (alvo.tipo === 'jogador') alvo.mortes++;
    if (alvo.tipo === 'minerador') alvo.carga = 0; // o minério que carregava se perde
    let matador = this.players.get(autor);
    if (matador?.id === alvo.id) matador = undefined;
    const morte = { e: 'morte', id: alvo.id, por: autor, tipo: alvo.tipo, x: alvo.ship.x, y: alvo.ship.y, z: alvo.ship.z };
    if (alvo.time !== undefined) morte.time = alvo.time;
    this.eventos.push(morte);
    if (matador) {
      // Ouro e XP pelo tipo do que morreu (RECOMPENSA: monstro, minerador, jogador).
      matador.abates++;
      recompensar(matador, alvo.tipo, this.eventos);
    }
    this.objetivos.aoMorrer(alvo, matador);
  }

  /** Dreno: um tick de dano por tempo. Na zona segura/proteção o tempo corre sem dano. */
  #drenar(ent) {
    if (!(ent.drenoTicks > 0)) return;
    ent.drenoTicks--;
    this.#ferir(ent, WEAPONS.dreno.efeito.dps * DT, ent.drenoDono);
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
    } else if (ent.tipo === 'guardiao') {
      this.objetivos.renascerGuardiao(ent);
    } else if (ent.elite) {
      const p = this.#pontoKrakor();
      renascerElite(ent, p.x, p.z, this.rng() * Math.PI * 2);
    } else if (ent.drone) {
      const novo = this.#novoDrone();
      ent.ship = novo.ship;
    } else {
      ent.ship = this.#naveNaBase(ent.ship.race, ent.time);
      aplicarNivel(ent.ship, ent.nivel);
      ent.fila.length = 0;
      ent.protegidoAte = this.tick + PROTECAO_TICKS;
    }
    ent.vivo = true;
    ent.drenoTicks = 0;
    this.eventos.push({ e: 'renasceu', id: ent.id });
  }

  /**
   * Relógio da partida: começa com o primeiro jogador; no fim de uma, espera a tela
   * de resultado e começa outra do zero (placar, bônus e mineradores zerados, todo
   * mundo renasce na base do time).
   */
  #passoPartida() {
    const vinhaDoFim = this.partida.estado === 'fim';
    const virou = this.partida.passo(this.tick, this.players.size);
    if (virou === 'comecou') {
      this.bonus.limpar();
      if (vinhaDoFim) this.objetivos.reiniciar();
      this.mineradores.comecar(this.tick);
      // Depois da tela de fim, todo mundo volta para a base do time. (Na primeira
      // partida, quem entrou acabou de nascer lá.)
      if (vinhaDoFim) {
        for (const j of this.players.values()) {
          if (j.fila.length) j.ack = j.fila[j.fila.length - 1].seq; // descarta sem travar a predição
          // Ouro, XP e nível são da partida (como num MOBA): zeram na seguinte.
          Object.assign(j, novaProgressao(), { ouro: 0 });
          this.#respawn(j);
        }
      }
      this.eventos.push({ e: 'partida', n: this.partida.numero });
    } else if (virou === 'fim') {
      const { vencedor, placar } = this.partida;
      this.eventos.push({ e: 'fimPartida', vencedor, placar: [...placar] });
    } else if (virou === 'vazia') {
      this.bonus.limpar();
      this.objetivos.reiniciar();
      this.mineradores.limpar();
    }
  }

  /** Avança o mundo um passo. */
  step() {
    this.tick++;
    this.#passoPartida();

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
      this.#drenar(j);
      if (j.vivo) this.#regen(j);
    }

    for (const d of this.drones) {
      if (!d.vivo) {
        if (this.tick >= d.respawnTick) this.#respawn(d);
        continue;
      }
      this.#atira(d, stepShip(d.ship, this.#iaDrone(d)));
      this.#drenar(d);
      if (d.vivo) this.#regen(d);
    }

    if (this.monstros.length) this.#atualizarCaca();
    for (const m of this.monstros) {
      if (!m.vivo) {
        if (this.tick >= m.respawnTick) this.#respawn(m);
        continue;
      }
      stepShip(m.ship, this.#iaVorax(m)); // não atira: o ataque é a garra
      this.#naoEncostar(m.ship);
      this.#foraDaZona(m.ship);
      this.#garra(m);
      this.#drenar(m);
      this.#regen(m);
    }

    // Mineradores andam só com a partida em andamento (na tela de fim ficam parados).
    if (this.partida.emAndamento) this.mineradores.passo(this.tick);
    for (const m of this.mineradores.lista) if (m.vivo) this.#drenar(m);

    this.ctxElite.tick = this.tick;
    for (const e of this.elites) {
      if (!e.vivo) {
        if (this.tick >= e.respawnTick) this.#respawn(e);
        continue;
      }
      const { inp, disparos } = iaElite(e, this.ctxElite);
      this.#atira(e, [...stepShip(e.ship, inp), ...disparos]);
      this.#drenar(e);
      if (e.vivo) this.#regen(e);
    }

    this.objetivos.step();

    const vivos = [...this.players.values(), ...this.drones, ...this.monstros, ...this.elites, ...this.mineradores.lista].filter(
      (e) => e.vivo,
    );
    this.bullets = this.bullets.filter((b) => {
      const segue = stepBullet(b);
      if (this.objetivos.tiroNaTorre(b)) return false; // bateu na torre de um objetivo B
      if (!segue) {
        this.eventos.push({ e: 'fim', bala: b.id, x: b.x, y: b.y, z: b.z });
        return false;
      }
      for (const alvo of vivos) {
        if (!this.#podeAcertar(b, alvo)) continue;
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
   * que desenhar ('jogador', 'arnosh', 'vorax', 'krakor', 'guardiao' ou
   * 'minerador'); `drone` continua true para todo inimigo do PvE. Jogadores e
   * mineradores trazem `time`; os mineradores também `carga` (minério no contêiner)
   * e `minerando`. Jogador traz `nivel`.
   */
  entidades() {
    const lista = [];
    const add = (e) => {
      const ent = {
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
        dreno: e.drenoTicks > 0,
        lento: e.ship.lento > 0,
      };
      if (e.time !== undefined) ent.time = e.time;
      if (e.nivel !== undefined) ent.nivel = e.nivel;
      if (e.tipo === 'minerador') {
        ent.carga = e.carga;
        ent.minerando = e.estado === 'minerando';
      }
      lista.push(ent);
    };
    for (const j of this.players.values()) add(j);
    for (const d of this.drones) add(d);
    for (const m of this.monstros) add(m);
    for (const m of this.mineradores.lista) add(m);
    for (const e of this.elites) add(e);
    return lista;
  }

  /**
   * Snapshot para um jogador: estado completo da própria nave + o resto do mundo.
   * Também o nível e o XP dele (xp dentro do nível, xpProx para o próximo; 0 no
   * máximo) e o estado dos objetivos (`obj`, igual para todos: cache por tick).
   */
  snapshotPara(j, ents, eventos) {
    if (this.cacheObj?.tick !== this.tick) {
      this.cacheObj = { tick: this.tick, obj: this.objetivos.estado() };
    }
    return {
      t: 'snap',
      tick: this.tick,
      ack: j.ack,
      vivo: j.vivo,
      time: j.time,
      me: j.ship,
      ouro: j.ouro,
      abates: j.abates,
      mortes: j.mortes,
      partida: this.partida.paraSnapshot(this.tick),
      bonus: this.bonus.paraSnapshot(this.tick),
      nivel: j.nivel,
      xp: j.xp,
      xpProx: xpParaNivel(j.nivel),
      obj: this.cacheObj.obj,
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

