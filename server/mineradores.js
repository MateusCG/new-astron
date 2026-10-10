// Mineradores (DESIGN-PARTIDA.md): mini-naves de carga controladas pelo servidor.
// São elas que fazem os pontos da partida; os jogadores só protegem os seus e caçam
// os do outro time.
//
// Ciclo de cada minerador, sempre pelo corredor (ROTAS[time] em shared/terrain.js):
//   'ida'        sai do centro da base e segue a rota até a coroa do depósito de
//                minério (o miolo, com os cristais grandes, é sólido);
//   'minerando'  para ali MINERADOR.mineracaoS segundos, virando para voltar, e
//                enche o contêiner com a carga (10, +1 com o bônus de mineração);
//   'volta'      refaz a rota de trás para frente e, ao passar pela ENTREGAS[time]
//                do próprio time, soma a carga no placar e volta para a 'ida'.
// Cada sentido anda na sua faixa (mão direita, FAIXA_MINERADOR do eixo), para quem
// vai não atravessar quem volta. Os dois times usam metades diferentes do corredor
// (cada um minera na coroa do seu lado), então não se cruzam.
//
// Saem da base de MINERADOR.intervaloS em intervalos, até MINERADOR.maxAtivos por
// time. O destruído não volta: o próximo sai da base depois do intervalo, contado
// a partir de quando abriu a vaga.
//
// A física é a mesma das naves (stepShip), com o acelerador limitado para dar a
// velocidade do minerador: assim eles batem nas construções (alturaSolida) e
// deslizam nelas como qualquer nave, e o tiro criogênico também os deixa lentos.
// O pulso EMP os deixa parados (sem motor, e sem minerar) enquanto durar.
//
// Atributos num lugar só: atributos(time, tick) junta as constantes de MINERADOR,
// as melhorias do time (this.melhorias, compradas na Evolução) e os bônus
// por tempo dos objetivos (server/bonus.js). Quem quiser mexer em minerador mexe ali.

import { createShip, stepShip, RACES, VEL_FATOR, DT } from '../shared/sim.js';
import { BASES, ROTAS, ENTREGAS } from '../shared/terrain.js';
import { BONUS } from './bonus.js';

/** Números de balanceamento do minerador (sem melhoria nem bônus). */
export const MINERADOR = {
  nome: 'Minerador',
  raca: 'shrewdo', // só para a física (stepShip): a raça mais rápida, para sobrar acelerador
  maxAtivos: 3, // por time, ao mesmo tempo
  intervaloS: 20, // entre uma saída e outra da base
  hp: 120,
  velocidade: 30, // m/s (a nave de jogador mais lenta faz ~50)
  carga: 10, // minério por viagem
  mineracaoS: 5, // parado no depósito, carregando
  ouro: 40, // para quem destrói um minerador inimigo
  defesaMax: 0.6, // teto da defesa comprada na Evolução (nunca fica imune)
};
/** Distância do eixo do corredor de cada faixa (ida de um lado, volta do outro). */
export const FAIXA_MINERADOR = 15;
const CHEGOU = 12; // m: perto assim de um ponto da rota, segue para o próximo
const FREIA_DIST = 40; // m antes do depósito: começa a frear para parar nele

function anguloEntre(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

/** Ponto `i` da rota do time, na faixa do sentido (ida ou volta). */
function pontoRota(time, i, ida) {
  const rota = ROTAS[time];
  const fim = rota[rota.length - 1];
  const ini = rota[0];
  // Direção da ida (base → minério) e a direita de quem anda nela.
  const len = Math.hypot(fim.x - ini.x, fim.z - ini.z) || 1;
  const fx = (fim.x - ini.x) / len;
  const fz = (fim.z - ini.z) / len;
  const lado = ida ? 1 : -1;
  return { x: rota[i].x - fz * FAIXA_MINERADOR * lado, z: rota[i].z + fx * FAIXA_MINERADOR * lado };
}

/** Yaw (convenção de shared/sim.js) de quem olha de (x, z) para (ax, az). */
function yawPara(x, z, ax, az) {
  return Math.atan2(-(ax - x), -(az - z));
}

export class Mineradores {
  /**
   * @param {{ bonus: import('./bonus.js').Bonus, novoId: () => number,
   *   entregar: (time: number, carga: number) => void, evento: (ev: object) => void }} ctx
   */
  constructor({ bonus, novoId, entregar, evento }) {
    this.bonus = bonus;
    this.novoId = novoId;
    this.entregar = entregar;
    this.evento = evento;
    this.lista = [];
    this.proximaSaida = BASES.map(() => 0);
    // Melhorias de cada time na partida, compradas na Evolução (server/servicos.js
    // preenche e zera). Campos lidos em atributos(): hpMult, velocidadeMult,
    // maxAtivos (a mais), defesa (fração do dano) e cargaExtra.
    this.melhorias = BASES.map(() => ({}));
  }

  /**
   * Atributos dos mineradores do `time` no `tick`: constantes + melhorias do time +
   * bônus ativos. Único lugar que decide HP, velocidade, carga e quantos saem.
   */
  atributos(time, tick) {
    const m = this.melhorias[time] ?? {};
    const b = (nome) => this.bonus.ativo(time, nome, tick);
    return {
      maxAtivos: MINERADOR.maxAtivos + (m.maxAtivos ?? 0),
      intervaloTicks: Math.round(MINERADOR.intervaloS / DT),
      hp: MINERADOR.hp * (m.hpMult ?? 1) * (b('durabilidade') ? BONUS.durabilidade.mult : 1),
      velocidade: MINERADOR.velocidade * (m.velocidadeMult ?? 1) * (b('velocidade') ? BONUS.velocidade.mult : 1),
      carga: MINERADOR.carga + (m.cargaExtra ?? 0) + (b('mineracao') ? BONUS.mineracao.cargaExtra : 0),
      mineracaoTicks: Math.round(MINERADOR.mineracaoS / DT),
      // Fração do dano que o minerador deixa de levar (melhoria de defesa; o World
      // aplica em #ferir).
      defesa: Math.min(MINERADOR.defesaMax, m.defesa ?? 0),
    };
  }

  /** Partida nova: nenhum minerador no mapa e o primeiro de cada time sai já. */
  comecar(tick) {
    this.lista = [];
    this.proximaSaida = BASES.map(() => tick);
  }

  /** Tira todos do mapa (partida acabou ou ficou vazia). */
  limpar() {
    this.lista = [];
  }

  #novo(time, a) {
    const p = pontoRota(time, 0, true);
    const q = pontoRota(time, 1, true);
    const ship = createShip(MINERADOR.raca, p.x, p.z, yawPara(p.x, p.z, q.x, q.z));
    ship.time = time;
    ship.hp = ship.maxHp = a.hp;
    return {
      id: this.novoId(),
      tipo: 'minerador',
      nome: MINERADOR.nome,
      time,
      ship,
      vivo: true,
      respawnTick: 0,
      ultimoDano: 0,
      drenoTicks: 0,
      estado: 'ida',
      ponto: 1, // índice do próximo ponto da rota
      carga: 0,
      mineraAte: 0,
    };
  }

  /** Um passo: tira os destruídos, solta os novos e move todos. */
  passo(tick) {
    this.lista = this.lista.filter((m) => m.vivo);
    for (const b of BASES) {
      const a = this.atributos(b.time, tick);
      const ativos = this.lista.reduce((n, m) => n + (m.time === b.time), 0);
      if (ativos >= a.maxAtivos) {
        // Sem vaga: o intervalo só começa a contar quando abrir uma.
        this.proximaSaida[b.time] = Math.max(this.proximaSaida[b.time], tick + a.intervaloTicks);
      } else if (tick >= this.proximaSaida[b.time]) {
        this.lista.push(this.#novo(b.time, a));
        this.proximaSaida[b.time] = tick + a.intervaloTicks;
      }
    }
    for (const m of this.lista) this.#mover(m, this.atributos(m.time, tick), tick);
  }

  #mover(m, a, tick) {
    const s = m.ship;
    // Durabilidade (melhoria ou bônus) mudou o HP máximo: a vida acompanha na
    // mesma proporção, para o bônus não "curar" nem "ferir" de graça.
    if (s.maxHp !== a.hp) {
      s.hp = (s.hp / s.maxHp) * a.hp;
      s.maxHp = a.hp;
    }
    if (s.emp > 0) {
      // Pulso EMP: motor desligado (para aos poucos) e a mineração não anda.
      stepShip(s, { th: 0, tu: 0, b: false, f1: false, f2: false, p: false, a: 0 });
      if (m.estado === 'minerando') m.mineraAte++;
      return;
    }
    const rota = ROTAS[m.time];
    const ultimo = rota.length - 1;
    const thMax = Math.min(1, a.velocidade / (RACES[s.race].velocidade * VEL_FATOR));
    let alvo = null;
    let th = thMax;

    if (m.estado === 'ida') {
      alvo = pontoRota(m.time, m.ponto, true);
      const d = Math.hypot(alvo.x - s.x, alvo.z - s.z);
      if (m.ponto === ultimo && d < FREIA_DIST) th = thMax * Math.max(0.2, d / FREIA_DIST);
      if (d < CHEGOU) {
        if (m.ponto < ultimo) m.ponto++;
        else {
          m.estado = 'minerando';
          m.mineraAte = tick + a.mineracaoTicks;
        }
      }
    }
    if (m.estado === 'minerando') {
      // Parado no depósito, virando para a volta.
      const volta = pontoRota(m.time, ultimo - 1, false);
      const diff = anguloEntre(s.yaw, yawPara(s.x, s.z, volta.x, volta.z));
      stepShip(s, { th: 0, tu: Math.max(-1, Math.min(1, diff * 2.5)), b: false, f1: false, f2: false, p: false, a: 0 });
      if (tick >= m.mineraAte) {
        m.carga = a.carga;
        m.estado = 'volta';
        m.ponto = ultimo - 1;
      }
      return;
    }
    if (m.estado === 'volta') {
      alvo = pontoRota(m.time, m.ponto, false);
      if (Math.hypot(alvo.x - s.x, alvo.z - s.z) < CHEGOU && m.ponto > 0) m.ponto--;
    }

    const diff = anguloEntre(s.yaw, yawPara(s.x, s.z, alvo.x, alvo.z));
    th *= Math.max(0.15, 1 - Math.abs(diff) / 1.6); // curva fechada: freia para virar
    stepShip(s, { th, tu: Math.max(-1, Math.min(1, diff * 2.5)), b: false, f1: false, f2: false, p: false, a: 0 });

    const e = ENTREGAS[m.time];
    if (m.estado === 'volta' && Math.abs(s.x - e.x) <= e.largura / 2 && Math.abs(s.z - e.z) <= e.profundidade / 2) {
      this.entregar(m.time, m.carga);
      this.evento({ e: 'entrega', id: m.id, time: m.time, carga: m.carga, x: s.x, y: s.y, z: s.z });
      m.carga = 0;
      m.estado = 'ida';
      // Segue para o primeiro ponto da rota que fica adiante, rumo ao minério.
      const fim = rota[ultimo];
      const falta = Math.hypot(fim.x - s.x, fim.z - s.z);
      m.ponto = rota.findIndex((p) => Math.hypot(fim.x - p.x, fim.z - p.z) < falta - 5);
      if (m.ponto < 0) m.ponto = ultimo;
    }
  }
}
