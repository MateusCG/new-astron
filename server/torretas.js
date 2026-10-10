// Torretas de defesa do corredor (DESIGN-PARTIDA.md, "Torretas"), só no servidor.
//
// Quatro por time, duas de cada lado da estrada, na metade do mapa do próprio time
// (TORRETAS em shared/terrain.js; a construção sólida é a mesma planta da física e
// do desenho, em shared/obstaculos.js). Elas guardam o caminho dos mineradores: o
// time que atravessa o meio do mapa para caçar os mineradores do outro passa
// debaixo de fogo.
//
// Regras:
// - Atira no inimigo MAIS PERTO dentro de TORRETA.alcance, com linha de tiro livre
//   (rocha e construção no meio tampam): jogadores, mineradores e escoltas do outro
//   time. Monstros não: a torreta é da guerra entre os times; os Arnosh patrulhando
//   nem entram no corredor, e se ela limpasse os Vorax que vêm atrás de quem foge,
//   bastaria voar até a torreta para se livrar de qualquer caçada. O tiro voa reto
//   (mirando adiantado pela velocidade do alvo) e acerta o que estiver no caminho,
//   como qualquer tiro.
// - Só jogador do outro time machuca a torreta: tiro (qualquer projétil), mina e
//   onda de choque. Tiro de aliado, de monstro, de minerador ou de escolta bate
//   nela e some (é sólida). A escolta não mira torreta (ver server/escoltas.js):
//   destruir as defesas é trabalho dos pilotos. Efeitos de arma (dreno, lentidão,
//   EMP) não pegam em estrutura, e o míssil não a persegue (só curva atrás de nave).
// - Destruída: sai da física nos dois lados (definirObstaculoAtivo, como a torre
//   B), quem deu o último tiro ganha RECOMPENSA.torreta (server/progressao.js) e o
//   resto do time dele TORRETA.ouroTime de ouro cada; evento 'torreta'. NÃO renasce
//   sozinha: só se o time dono a reconstruir na Evolução (server/servicos.js), e aí
//   ela volta inteira com o nível atual do time. Se houver nave no lugar, a obra
//   espera ela sair, para ninguém ficar preso dentro da torreta.
// - Nível do time (1 a TORRETA_NIVEL_MAX, comprado na Evolução): vale para as
//   quatro, +HP e +dano por nível (efeitosTorretas em shared/evolucao.js). Subir de
//   nível aumenta a vida na mesma proporção do máximo (não cura nem fere).
// - Partida nova (ou servidor vazio): todas de pé, inteiras, nível 1. Só atiram com
//   a partida em andamento (na tela de fim ficam quietas, como os mineradores).
//
// Para quem vem depois (névoa de guerra): `lista` tem cada torreta com x, z, y (o
// canhão), time e viva; estado() é o que vai no snapshot.

import { TORRETAS, BASES } from '../shared/terrain.js';
import { TORRETA as PLANTA, OBSTACULOS, definirObstaculoAtivo, alturaSolida } from '../shared/obstaculos.js';
import { DT, HOVER, SHIP_RADIUS, WEAPONS, AREA_ALTURA } from '../shared/sim.js';
import { efeitosTorretas, TORRETA_NIVEL_MAX } from '../shared/evolucao.js';
import { recompensar } from './progressao.js';

/** Números de balanceamento da torreta no nível 1 (o nível multiplica HP e dano). */
export const TORRETA = {
  hp: 700,
  alcance: 160, // m (no plano) até onde ela mira
  dano: 10, // por tiro (o laser simples do jogador tira 12)
  cadenciaS: 0.75, // s entre tiros
  velTiro: 300, // m/s
  kind: 'laser', // forma e raio do projétil (shared/sim.js); a cor vem do time no cliente
  ouroTime: 25, // para cada outro piloto do time de quem a destruiu
};
const CADENCIA_TICKS = Math.round(TORRETA.cadenciaS / DT);
const VIDA_TIRO = (TORRETA.alcance * 1.25) / TORRETA.velTiro; // s: um pouco além do alcance
const PASSO_VISAO = 4; // m entre as amostras da linha de tiro

/**
 * A linha de (x1, y1, z1) a (x2, y2, z2) passa livre de rocha e construção? Amostra
 * a cada PASSO_VISAO m, começando `inicio` m depois da origem (a torreta começa fora
 * do próprio cilindro). Serve à escolta também.
 */
export function linhaDeTiro(x1, y1, z1, x2, y2, z2, inicio = 0) {
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
      };
    });
    this.reiniciar();
  }

  /** HP máximo das torretas do time no nível atual. */
  hpMax(time) {
    return Math.round(TORRETA.hp * efeitosTorretas(this.nivel[time]).hp);
  }

  /** Dano de um tiro das torretas do time no nível atual. */
  dano(time) {
    return TORRETA.dano * efeitosTorretas(this.nivel[time]).dano;
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
        continue;
      }
      if (w.tick < t.prontaEm) continue;
      const alvo = this.#maisPerto(t);
      t.alvo = alvo?.id ?? 0;
      if (!alvo) continue;
      t.prontaEm = w.tick + CADENCIA_TICKS;
      this.#atirar(t, alvo);
    }
  }

  #maisPerto(t) {
    let melhor = null;
    let dist = TORRETA.alcance;
    for (const a of alvosDoTime(this.world, t.time)) {
      const s = a.ship;
      const d = Math.hypot(s.x - t.x, s.z - t.z);
      if (d >= dist) continue;
      if (!linhaDeTiro(t.x, t.y, t.z, s.x, s.y, s.z, PLANTA.raio + 1.5)) continue;
      dist = d;
      melhor = a;
    }
    return melhor;
  }

  #atirar(t, alvo) {
    const w = this.world;
    const { vx, vy, vz } = mirar(t.x, t.y, t.z, alvo, TORRETA.velTiro);
    // Sai da borda do cilindro, senão o tiro nasceria dentro da própria torreta.
    const k = (PLANTA.raio + 1.5) / TORRETA.velTiro;
    const x = t.x + vx * k;
    const z = t.z + vz * k;
    const b = {
      id: w.nextId++,
      owner: t.id,
      kind: TORRETA.kind,
      x,
      y: t.y,
      z,
      px: x,
      pz: z,
      vx,
      vy,
      vz,
      vida: VIDA_TIRO,
      drone: false,
      time: t.time, // sem fogo amigo: atravessa quem é do mesmo time
      mult: this.dano(t.time) / WEAPONS[TORRETA.kind].dano,
    };
    w.adicionarTiro(b, { fonte: 'torreta', time: t.time });
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
    t.hp -= dano;
    if (t.hp > 0) return;
    const w = this.world;
    t.hp = 0;
    t.viva = false;
    t.alvo = 0;
    definirObstaculoAtivo(t.id, false);
    recompensar(atirador, 'torreta', w.eventos);
    for (const j of w.players.values()) {
      if (j !== atirador && j.time === atirador.time) j.ouro += TORRETA.ouroTime;
    }
    w.eventos.push({ e: 'torreta', id: t.id, time: t.time, estado: 'destruida', por: atirador.id, nome: atirador.nome, x: t.x, y: t.y, z: t.z });
  }

  /** Alguma nave (de qualquer tipo) no lugar da torreta? */
  #naveEmCima(t) {
    const w = this.world;
    const r = PLANTA.raio + SHIP_RADIUS + 1;
    const todos = [...w.players.values(), ...w.drones, ...w.monstros, ...w.elites, ...w.mineradores.lista, ...(w.escoltas?.lista ?? [])];
    return todos.some((e) => e.vivo && Math.hypot(e.ship.x - t.x, e.ship.z - t.z) < r + (e.ship.raio ?? 0));
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
