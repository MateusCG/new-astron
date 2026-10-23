// Mineradores (DESIGN-PARTIDA.md): mini-naves de carga controladas pelo servidor.
// São elas que fazem os pontos da partida; os jogadores só protegem os seus e caçam
// os do outro time.
//
// Ciclo de cada minerador, sempre em linha reta pela lane (ROTAS[time] em
// shared/terrain.js, sem estrada):
//   'ida'        sai do centro da base e segue a rota até a porta do hangar do
//                time na mineradora (ESPERAS) e, por ela, até a doca lá dentro
//                (DOCAS; a mineradora é sólida, mas a nave do minerador leva
//                `hangar` = time e atravessa o campo de força da porta: HANGARES);
//   'minerando'  para ali MINERADOR.mineracaoS segundos, virando para voltar, e
//                enche o contêiner com a carga (10, mais a melhoria da Evolução);
//                sai pela mesma porta;
//   'volta'      refaz a rota de trás para frente e, ao passar pela ENTREGAS[time]
//                do próprio time, soma a carga no placar e volta para a 'ida'.
// Cada sentido anda na sua faixa (mão direita, FAIXA_MINERADOR do eixo), para quem
// vai não atravessar quem volta. Os dois times usam metades diferentes da lane (cada
// um atraca na doca do seu lado), então não se cruzam.
//
// Saem da base em fila, um a cada MINERADOR.saidaS, até MINERADOR.maxAtivos por time
// (MINERADORES_POR_TIME = 10 de shared/evolucao.js, mais a melhoria "quantidade").
// O espaço da saída (7,5 s, ~225 m a 30 m/s) é o ciclo (~75 s) dividido pelos 10:
// eles ficam espalhados pela lane e cada um chega à doca depois de o da frente sair
// dela (minerando 5 s). O destruído não volta: o substituto sai da base
// MINERADOR.intervaloS depois de abrir a vaga.
//
// Fila (FILA_ESPACO): nenhum minerador encosta no da frente do mesmo time que vai no
// mesmo sentido (mesma faixa, mesma direção). Na bacia do hangar mineram três ao
// mesmo tempo (BAIAS): quem chega na porta pega uma baia livre e, com as três
// ocupadas, espera ali, parado, até uma vagar (quem sai a libera depois de se afastar
// BAIA_LIVRE); os de trás fazem fila atrás dele. Lá dentro, um sentido por vez: não
// entra ninguém com alguém saindo, e quem terminou só sai com ninguém entrando nem
// saindo. Os do Núcleo, mais lentos,
// não seguram a fila dos normais pela lane (cada tipo faz fila com o seu), mas as
// baias são as mesmas para todos. Na entrega não há fila: a carga conta ao passar
// pela faixa, sem parar.
//
// Tempos (medidos em tests/mineradores.test.mjs, sem melhoria, 30 m/s): da base à
// doca (dentro do hangar) são ~1240 m, uns 41 s; minerando 5 s; da doca à entrega ~1070 m, uns 36 s. A
// primeira entrega sai ~79 s depois da saída e cada volta seguinte (entrega → doca →
// entrega) leva ~75 s. Numa partida de 20 minutos cada minerador que sobrevive faz
// umas 15 viagens: com os 10, ~150 entregas por time, ~1500 de minério, e ~1760 no
// placar com o dobro da fase final (com três eram ~530). A onda do Núcleo (150) pesa
// bem menos no placar do que pesava.
//
// Onda do Núcleo (server/objetivos.js chama ondaDoNucleo quando um time toma o
// Núcleo de He-3): saem da base, NA HORA, MINERADOR_NUCLEO.quantos mineradores
// especiais (`nucleo: 1` no snapshot), em fila, maiores (raio de acerto maior), mais
// lentos e com mais HP, que vão à própria doca, carregam MINERADOR_NUCLEO.carga cada
// (5× o normal), voltam, entregam e SOMEM (não voltam para a doca). Contam além do
// limite normal (maxAtivos) e não mexem no intervalo de saída dos outros. Com 21
// m/s levam ~57 s até a doca, 8 s carregando e entregam ~115 s depois de sair: quase
// dois minutos de alvo enorme para o outro time.
//
// A física é a mesma das naves (stepShip), com o acelerador limitado para dar a
// velocidade do minerador: assim eles batem nas construções (alturaSolida) e
// deslizam nelas como qualquer nave, e o tiro criogênico também os deixa lentos.
// O pulso EMP os deixa parados (sem motor, e sem minerar) enquanto durar.
//
// Atributos num lugar só: atributos(time, tick) junta as constantes de MINERADOR e
// as melhorias do time (this.melhorias, compradas na Evolução). Quem quiser mexer em
// minerador mexe ali. (Os bônus de mineração, velocidade e durabilidade dos
// objetivos A/B/C do mapa antigo saíram: a jungle nova mexe nos mineradores pela
// onda do Núcleo.)
//
// A escolta armada que anda com eles (server/escoltas.js) usa a mesma rota e as
// mesmas faixas (pontoRota), mas é outro módulo: não minera, não entra no placar e
// não lê as melhorias dos mineradores.

import { createShip, stepShip, velocidadeBase, DT } from '../shared/sim.js';
import { BASES, ROTAS, ENTREGAS, BAIAS, noHangar } from '../shared/terrain.js';
import { MINERADORES_POR_TIME } from '../shared/evolucao.js';

/** Números de balanceamento do minerador (sem melhoria). */
export const MINERADOR = {
  nome: 'Minerador',
  raca: 'shrewdo', // só para a física (stepShip): a raça mais rápida, para sobrar acelerador
  maxAtivos: MINERADORES_POR_TIME, // por time, ao mesmo tempo (10; a Evolução soma)
  saidaS: 7.5, // entre uma saída e a seguinte enquanto há vaga (ciclo ~75 s / 10)
  intervaloS: 20, // da vaga aberta (minerador destruído) até sair o substituto
  hp: 120,
  velocidade: 30, // m/s (a nave de jogador mais lenta faz ~50)
  carga: 10, // minério por viagem
  mineracaoS: 5, // parado no depósito, carregando
  ouro: 40, // para quem destrói um minerador inimigo
  defesaMax: 0.6, // teto da defesa comprada na Evolução (nunca fica imune)
};
/** Distância do eixo da lane de cada faixa (ida de um lado, volta do outro). */
export const FAIXA_MINERADOR = 15;
/**
 * Minerador do Núcleo (onda do Núcleo de He-3): multiplicadores em cima dos
 * atributos do time, carga, tempo minerando, raio de acerto (o normal é o da nave,
 * SHIP_RADIUS = 4,5 m), quantos saem e o espaço entre eles na fila da saída.
 */
export const MINERADOR_NUCLEO = { quantos: 3, hpMult: 4, velMult: 0.7, carga: 50, mineracaoS: 8, raio: 7, espaco: 25 };
/** Fila: m que um minerador guarda do da frente na mesma faixa (e de quem está na doca). */
export const FILA_ESPACO = 35;
/** m da baia: quem sai dela só a libera para o próximo depois de se afastar isto. */
const BAIA_LIVRE = 8;
/** Ordem em que as baias livres são pegas (0 lado da ida, 1 fundo, 2 lado da volta). */
const ORDEM_BAIAS = [1, 0, 2];
// No hangar o tráfego anda num sentido por vez (quem sai da baia do lado da ida cruzaria
// quem entra para as do fundo): ninguém entra com alguém saindo, e quem terminou de
// minerar só sai com ninguém entrando nem saindo.
const entrando = (o) => o.estado === 'ida' && o.baia != null;
const saindo = (o) => o.estado === 'volta' && noHangar(o.time, o.ship.x, o.ship.z);
const FILA_LARGURA = 10; // m de lado: mais que isto, está na outra faixa (não é o da frente)
const FILA_RUMO = 0.5; // cosseno: só conta quem vai no mesmo sentido (até ~60° de diferença)
const CHEGOU = 12; // m: perto assim de um ponto da rota, segue para o próximo
const CHEGOU_DOCA = 4; // m: na doca (dentro do hangar) para em cima da bacia de He-3
const FREIA_DIST = 40; // m antes da doca: começa a frear para parar nela

/** Diferença de ângulo de a para b, em (-π, π]. */
export function anguloEntre(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

/**
 * Ponto `i` da rota do time, na faixa do sentido (ida ou volta). A escolta usa também.
 * O último (a doca, no meio da bacia de He-3 do hangar) fica no eixo, sem faixa: o
 * minerador entra pela faixa da ida, minera no centro e sai pela da volta.
 */
export function pontoRota(time, i, ida) {
  const rota = ROTAS[time];
  const fim = rota[rota.length - 1];
  const ini = rota[0];
  if (i === rota.length - 1) return { x: fim.x, z: fim.z };
  // Direção da ida (base → doca) e a direita de quem anda nela.
  const len = Math.hypot(fim.x - ini.x, fim.z - ini.z) || 1;
  const fx = (fim.x - ini.x) / len;
  const fz = (fim.z - ini.z) / len;
  const lado = ida ? 1 : -1;
  return { x: rota[i].x - fz * FAIXA_MINERADOR * lado, z: rota[i].z + fx * FAIXA_MINERADOR * lado };
}

/** Yaw (convenção de shared/sim.js) de quem olha de (x, z) para (ax, az). */
export function yawPara(x, z, ax, az) {
  return Math.atan2(-(ax - x), -(az - z));
}

export class Mineradores {
  /**
   * @param {{ novoId: () => number,
   *   entregar: (time: number, carga: number) => number | void, evento: (ev: object) => void }} ctx
   */
  constructor({ novoId, entregar, evento }) {
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
   * Atributos dos mineradores do `time`: constantes + melhorias do time. Único lugar
   * que decide HP, velocidade, carga e quantos saem. `nucleo` = os do Núcleo
   * (MINERADOR_NUCLEO em cima dos do time). `tick` fica no contrato para efeitos por
   * tempo.
   */
  atributos(time, tick, nucleo = false) {
    const m = this.melhorias[time] ?? {};
    const n = nucleo ? MINERADOR_NUCLEO : null;
    return {
      maxAtivos: MINERADOR.maxAtivos + (m.maxAtivos ?? 0),
      saidaTicks: Math.round(MINERADOR.saidaS / DT),
      intervaloTicks: Math.round(MINERADOR.intervaloS / DT),
      hp: MINERADOR.hp * (m.hpMult ?? 1) * (n?.hpMult ?? 1),
      velocidade: MINERADOR.velocidade * (m.velocidadeMult ?? 1) * (n?.velMult ?? 1),
      carga: n ? n.carga : MINERADOR.carga + (m.cargaExtra ?? 0),
      mineracaoTicks: Math.round((n?.mineracaoS ?? MINERADOR.mineracaoS) / DT),
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

  /**
   * Minerador novo do `time` com os atributos `a`, no começo da rota; `atras` = m
   * para trás dela (a fila da onda do Núcleo), `nucleo` = do Núcleo.
   */
  #novo(time, a, atras = 0, nucleo = false) {
    const p = pontoRota(time, 0, true);
    const q = pontoRota(time, 1, true);
    const len = Math.hypot(q.x - p.x, q.z - p.z) || 1;
    const x = p.x - ((q.x - p.x) / len) * atras;
    const z = p.z - ((q.z - p.z) / len) * atras;
    const ship = createShip(MINERADOR.raca, x, z, yawPara(x, z, q.x, q.z));
    ship.time = time;
    ship.hangar = time; // passa pelo campo de força da porta do hangar do time (alturaSolida)
    ship.hp = ship.maxHp = a.hp;
    if (nucleo) ship.raio = MINERADOR_NUCLEO.raio; // alvo maior (bulletHits e áreas leem s.raio)
    return {
      ...(nucleo ? { nucleo: true } : {}),
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
      baia: null, // baia da bacia (BAIAS) onde vai minerar, da porta até se afastar dela
      carga: 0,
      mineraAte: 0,
    };
  }

  /**
   * Onda do Núcleo: MINERADOR_NUCLEO.quantos mineradores do Núcleo do `time` saem da
   * base agora, em fila. Devolve os novos.
   */
  ondaDoNucleo(time, tick) {
    const a = this.atributos(time, tick, true);
    const novos = [];
    for (let i = 0; i < MINERADOR_NUCLEO.quantos; i++) novos.push(this.#novo(time, a, i * MINERADOR_NUCLEO.espaco, true));
    this.lista.push(...novos);
    this.evento({ e: 'ondaNucleo', time, ids: novos.map((m) => m.id) });
    return novos;
  }

  /** Um passo: tira os destruídos, solta os novos, move todos e tira os do Núcleo que já entregaram. */
  passo(tick) {
    this.lista = this.lista.filter((m) => m.vivo);
    for (const b of BASES) {
      const a = this.atributos(b.time, tick);
      // Os do Núcleo contam além do limite.
      const ativos = this.lista.reduce((n, m) => n + (m.time === b.time && !m.nucleo), 0);
      if (ativos >= a.maxAtivos) {
        // Sem vaga: o intervalo só começa a contar quando abrir uma.
        this.proximaSaida[b.time] = Math.max(this.proximaSaida[b.time], tick + a.intervaloTicks);
      } else if (tick >= this.proximaSaida[b.time]) {
        // Com vaga sobrando, o próximo sai logo atrás (saidaS); se esta saída
        // encheu o time, a linha de cima empurra para o intervalo da reposição.
        this.lista.push(this.#novo(b.time, a));
        this.proximaSaida[b.time] = tick + a.saidaTicks;
      }
    }
    for (const m of this.lista) this.#mover(m, this.atributos(m.time, tick, !!m.nucleo), tick);
    if (this.lista.some((m) => m.sumiu)) this.lista = this.lista.filter((m) => !m.sumiu);
  }

  /** Algum minerador vivo do time satisfaz `cond`? */
  #alguem(time, cond) {
    return this.lista.some((o) => o.vivo && o.time === time && cond(o));
  }

  /** Baia livre da bacia do time (na ORDEM_BAIAS), ou null com as três ocupadas. */
  #baiaLivre(time) {
    const ocupadas = new Set(this.lista.filter((o) => o.vivo && o.time === time && o.baia != null).map((o) => o.baia));
    return ORDEM_BAIAS.find((k) => !ocupadas.has(k)) ?? null;
  }

  /**
   * Fila: fração do acelerador que sobra para `m` pelo minerador do mesmo time à
   * frente dele (mesmo sentido, mesma faixa, mesmo rumo): 1 longe, cai a 0 a
   * FILA_ESPACO. O da frente conta se é do mesmo tipo (normal ou do Núcleo) e no
   * mesmo estado (quem espera baia na porta segura os de trás).
   */
  #folgaDaFila(m) {
    const s = m.ship;
    const fx = -Math.sin(s.yaw);
    const fz = -Math.cos(s.yaw);
    let folga = 1;
    for (const o of this.lista) {
      if (o === m || !o.vivo || o.time !== m.time) continue;
      if (o.estado !== m.estado || !!o.nucleo !== !!m.nucleo) continue;
      const dx = o.ship.x - s.x;
      const dz = o.ship.z - s.z;
      const frente = dx * fx + dz * fz;
      if (frente <= 0 || frente > FILA_ESPACO * 2) continue;
      if (Math.abs(dx * fz - dz * fx) > FILA_LARGURA) continue;
      if (-Math.sin(o.ship.yaw) * fx + -Math.cos(o.ship.yaw) * fz < FILA_RUMO) continue; // só o que vai no mesmo rumo
      folga = Math.min(folga, Math.max(0, (frente - FILA_ESPACO) / FILA_ESPACO));
    }
    return folga;
  }

  #mover(m, a, tick) {
    const s = m.ship;
    // Durabilidade (melhoria) mudou o HP máximo: a vida acompanha na
    // mesma proporção, para a melhoria não "curar" nem "ferir" de graça.
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
    const thMax = Math.min(1, a.velocidade / velocidadeBase(s));
    let alvo = null;
    let th = thMax;

    if (m.estado === 'ida') {
      // Na porta, pega uma baia livre da bacia; com as três ocupadas (ou alguém saindo
      // do hangar: um sentido por vez lá dentro), espera ali parado.
      if (m.ponto === ultimo && m.baia == null && !this.#alguem(m.time, saindo)) m.baia = this.#baiaLivre(m.time);
      const naPorta = m.ponto === ultimo && m.baia == null;
      if (naPorta) {
        alvo = pontoRota(m.time, ultimo, true); // olhando para dentro
        th = 0;
      } else {
        alvo = m.ponto === ultimo ? BAIAS[m.time][m.baia] : pontoRota(m.time, m.ponto, true);
        const d = Math.hypot(alvo.x - s.x, alvo.z - s.z);
        if (m.ponto === ultimo && d < FREIA_DIST) th = thMax * Math.max(0.2, d / FREIA_DIST);
        if (d < (m.ponto === ultimo ? CHEGOU_DOCA : CHEGOU)) {
          if (m.ponto < ultimo) m.ponto++;
          else {
            m.estado = 'minerando';
            m.mineraAte = tick + a.mineracaoTicks;
          }
        }
      }
    }
    if (m.estado === 'minerando') {
      // Parado na doca, virando para a saída (a faixa da volta, na porta): sai pelo
      // outro lado, sem passar raspando no próximo da fila, que espera na faixa da ida.
      const volta = pontoRota(m.time, ultimo - 1, false);
      const diff = anguloEntre(s.yaw, yawPara(s.x, s.z, volta.x, volta.z));
      stepShip(s, { th: 0, tu: Math.max(-1, Math.min(1, diff * 2.5)), b: false, f1: false, f2: false, p: false, a: 0 });
      // Terminou, mas só sai com ninguém entrando no hangar (um sentido por vez lá dentro)
      // e um de cada vez (dois saindo juntos chegariam lado a lado na porta).
      if (tick >= m.mineraAte && !this.#alguem(m.time, (o) => entrando(o) || saindo(o))) {
        m.carga = a.carga;
        m.estado = 'volta';
        m.ponto = ultimo - 1; // da baia direto para a porta, pela faixa da volta
      }
      return;
    }
    if (m.estado === 'volta') {
      const b = m.baia != null ? BAIAS[m.time][m.baia] : null;
      if (b && Math.hypot(b.x - s.x, b.z - s.z) > BAIA_LIVRE) m.baia = null;
      alvo = pontoRota(m.time, m.ponto, false);
      if (Math.hypot(alvo.x - s.x, alvo.z - s.z) < CHEGOU && m.ponto > 0) m.ponto--;
    }

    const diff = anguloEntre(s.yaw, yawPara(s.x, s.z, alvo.x, alvo.z));
    th *= Math.max(0.15, 1 - Math.abs(diff) / 1.6); // curva fechada: freia para virar
    th *= this.#folgaDaFila(m); // fila: freia atrás do da frente e para a FILA_ESPACO dele
    stepShip(s, { th, tu: Math.max(-1, Math.min(1, diff * 2.5)), b: false, f1: false, f2: false, p: false, a: 0 });

    const e = ENTREGAS[m.time];
    if (m.estado === 'volta' && Math.abs(s.x - e.x) <= e.largura / 2 && Math.abs(s.z - e.z) <= e.profundidade / 2) {
      // O placar decide quanto a carga vale (dobra na fase final); o evento leva isso.
      const valor = this.entregar(m.time, m.carga) ?? m.carga;
      this.evento({ e: 'entrega', id: m.id, time: m.time, carga: valor, x: s.x, y: s.y, z: s.z, ...(m.nucleo ? { nucleo: 1 } : {}) });
      m.carga = 0;
      if (m.nucleo) {
        m.sumiu = true; // o do Núcleo entrega uma vez só e some
        return;
      }
      m.estado = 'ida';
      // Segue para o primeiro ponto da rota que fica adiante, rumo à doca.
      const fim = rota[ultimo];
      const falta = Math.hypot(fim.x - s.x, fim.z - s.z);
      m.ponto = rota.findIndex((p) => Math.hypot(fim.x - p.x, fim.z - p.z) < falta - 5);
      if (m.ponto < 0) m.ponto = ultimo;
    }
  }
}
