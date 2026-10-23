// Mineradores (DESIGN-PARTIDA.md): mini-naves de carga controladas pelo servidor.
// São elas que fazem os pontos da partida; os jogadores só protegem os seus e caçam
// os do outro time.
//
// Ciclo de cada minerador, sempre em linha reta pela lane (ROTAS[time] em
// shared/terrain.js, sem estrada):
//   'ida'          sai do centro da base (passando por cima da bacia e pelo campo de
//                  força da própria base, que deixa passar) e segue a rota até a porta
//                  do hangar do time na mineradora (ESPERAS) e, por ela, até a doca lá
//                  dentro (DOCAS; a mineradora é sólida, mas a nave do minerador leva
//                  `hangar` = time e atravessa o campo de força da porta: HANGARES);
//   'minerando'    para ali MINERADOR.mineracaoS segundos, virando para voltar, e
//                  enche o contêiner com a carga (10, mais a melhoria da Evolução);
//                  sai pela mesma porta;
//   'volta'        refaz a rota de trás para frente até a boca da base, passa o campo
//                  de força e vai à BACIA do time (BACIAS), logo à frente do anel de
//                  pouso: pega uma das três vagas de descarga (VAGAS_BACIA), freia e
//                  para em cima dela;
//   'descarregando' fica ali MINERADOR.descargaS segundos despejando o minério na
//                  bacia (`descarga: 1` no snapshot: o cliente anima o minério
//                  caindo), virando para a saída; no fim a carga soma no placar
//                  (evento 'entrega' no lugar dele) e ele volta para a 'ida' pela faixa
//                  da ida. O do Núcleo some depois de despejar.
// Cada sentido anda na sua faixa (mão direita, FAIXA_MINERADOR do eixo), para quem
// vai não atravessar quem volta. Os dois times usam metades diferentes da lane (cada
// um atraca na doca do seu lado), então não se cruzam.
//
// Saem da base em fila, um a cada MINERADOR.saidaS, até MINERADOR.maxAtivos por time
// (MINERADORES_POR_TIME = 10 de shared/evolucao.js, mais a melhoria "quantidade").
// O espaço da saída (MINERADOR.saidaS, 9 s) é o ciclo dividido pelos 10: eles ficam
// espalhados pela lane e cada um chega à doca depois de o da frente sair dela. O
// destruído não volta: o substituto sai da base MINERADOR.intervaloS depois de abrir
// a vaga.
//
// Fila (FILA_ESPACO): nenhum minerador encosta no da frente do mesmo time que vai no
// mesmo sentido (mesma faixa, mesma direção). Na bacia do hangar mineram três ao
// mesmo tempo (BAIAS): quem chega na porta pega uma baia livre e, com as três
// ocupadas, espera ali, parado, até uma vagar (quem sai a libera depois de se afastar
// BAIA_LIVRE); os de trás fazem fila atrás dele. Lá dentro, um sentido por vez: não
// entra ninguém com alguém saindo, e quem terminou só sai com ninguém entrando nem
// saindo. A bacia da base funciona igual: três despejam ao mesmo tempo (uma vaga
// cada), quem chega com as três ocupadas espera parado em ESPERAS_BACIA (na faixa da
// volta, por dentro do campo) com a fila atrás, e também um sentido por vez (ninguém
// vai para uma vaga com alguém saindo da bacia; quem terminou só sai com ninguém
// entrando nem saindo). As vagas são pegas do fundo para fora (ORDEM_VAGAS), para
// quem chega não passar raspando em quem despeja. Os do Núcleo, mais lentos, não
// seguram a fila dos normais pela lane (cada tipo faz fila com o seu), mas as baias,
// as vagas e a espera da bacia são as mesmas para todos.
//
// Tempos (medidos em tests/mineradores.test.mjs, sem melhoria, 30 m/s): da base à
// doca (dentro do hangar) são ~1240 m, uns 43 s; minerando 5 s (mais ~2 s virando e
// esperando a vez de sair); da doca à vaga da bacia ~1130 m, uns 39 s com a freada;
// despejando 3 s. A primeira entrega sai ~90 s depois da saída e cada volta seguinte
// (bacia → doca → bacia) leva ~87 s (era ~75 s com o arco da entrega na boca da base:
// a bacia fica ~55 m mais para dentro e o minerador para para despejar). Por isso a
// saída é de 9 s (o ciclo dividido pelos 10, arredondado para cima: o primeiro volta
// à bacia depois de o décimo sair). Numa partida de 20 minutos cada minerador que
// sobrevive faz umas 13 viagens: com os 10, ~130 entregas por time, ~1300 de minério,
// e ~1500 no placar com o dobro da fase final. A onda do Núcleo (150) pesa pouco.
//
// Onda do Núcleo (server/objetivos.js chama ondaDoNucleo quando um time toma o
// Núcleo de He-3): saem da base, NA HORA, MINERADOR_NUCLEO.quantos mineradores
// especiais (`nucleo: 1` no snapshot), em fila, maiores (raio de acerto maior), mais
// lentos e com mais HP, que vão à própria doca, carregam MINERADOR_NUCLEO.carga cada
// (5× o normal), voltam, despejam na bacia e SOMEM (não voltam para a doca). Contam
// além do limite normal (maxAtivos) e não mexem no intervalo de saída dos outros. Com
// 21 m/s levam ~60 s até a doca, 8 s carregando e entregam de ~135 s a ~160 s depois
// de sair (5 s despejando cada um): mais de dois minutos de alvo enorme para o outro
// time.
//
// A física é a mesma das naves (stepShip), com o acelerador limitado para dar a
// velocidade do minerador: assim eles batem nas construções (alturaSolida) e
// deslizam nelas como qualquer nave, e o tiro criogênico também os deixa lentos.
// O pulso EMP os deixa parados (sem motor, e sem minerar nem despejar) enquanto durar.
//
// Atributos num lugar só: atributos(time, tick) junta as constantes de MINERADOR e
// as melhorias do time (this.melhorias, compradas na Evolução). Quem quiser mexer em
// minerador mexe ali. (Os bônus de mineração, velocidade e durabilidade dos
// objetivos A/B/C do mapa antigo saíram: a jungle nova mexe nos mineradores pela
// onda do Núcleo.)
//
// A escolta armada que anda com eles (server/escoltas.js) usa a mesma rota e as
// mesmas faixas (pontoRota), mas é outro módulo: não minera, não entra no placar e
// não lê as melhorias dos mineradores. Com o minerador dela na bacia (naBacia), ela
// espera de lado, fora do caminho.

import { createShip, stepShip, velocidadeBase, DT } from '../shared/sim.js';
import { BASES, ROTAS, BAIAS, BACIA, BACIAS, VAGAS_BACIA, ESPERAS_BACIA, daBase, noHangar } from '../shared/terrain.js';
import { MINERADORES_POR_TIME } from '../shared/evolucao.js';

/** Números de balanceamento do minerador (sem melhoria). */
export const MINERADOR = {
  nome: 'Minerador',
  raca: 'shrewdo', // só para a física (stepShip): a raça mais rápida, para sobrar acelerador
  maxAtivos: MINERADORES_POR_TIME, // por time, ao mesmo tempo (10; a Evolução soma)
  saidaS: 9, // entre uma saída e a seguinte enquanto há vaga (ciclo ~87 s / 10, para cima)
  intervaloS: 20, // da vaga aberta (minerador destruído) até sair o substituto
  hp: 120,
  velocidade: 30, // m/s (a nave de jogador mais lenta faz ~50)
  carga: 10, // minério por viagem
  mineracaoS: 5, // parado no depósito, carregando
  descargaS: 3, // parado em cima da vaga da bacia da base, despejando
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
export const MINERADOR_NUCLEO = { quantos: 3, hpMult: 4, velMult: 0.7, carga: 50, mineracaoS: 8, descargaS: 5, raio: 7, espaco: 25 };
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
/** m da vaga da bacia: quem sai dela só a libera para o próximo depois de se afastar isto. */
const VAGA_LIVRE = 8;
/** m do centro da bacia: quem saiu de uma vaga conta como "saindo da bacia" até se afastar isto. */
const BACIA_LIVRE = 32;
/** Ordem em que as vagas livres da bacia são pegas (0 lado da volta, 1 fundo, 2 lado da ida). */
const ORDEM_VAGAS = [1, 2, 0];
// Na bacia, também um sentido por vez: ninguém vai para uma vaga com alguém saindo
// dela, e quem terminou de despejar só sai com ninguém entrando nem saindo.
const entrandoBacia = (o) => o.estado === 'volta' && o.vaga != null;
const saindoBacia = (o) => o.saiBacia === true;
const CHEGOU_VAGA = 2; // m: na vaga da bacia, para em cima dela
const FREIO_VAGA = 0.8; // m/s de velocidade querida por metro que falta até a vaga (chega parando)
/**
 * Boca da bacia de cada base: o ponto do aro no eixo da lane, voltado para ela. Quem
 * vai para uma vaga e quem sai dela passa por aqui (entre as vagas dos lados, longe
 * das duas), para não raspar em quem está despejando ao lado.
 */
const BOCAS_BACIA = BASES.map((b) => daBase(b, BACIA.dist + BACIA.raio, 0));
const CHEGOU_BOCA = 8; // m: perto assim da boca, segue para a vaga (ou para a lane)
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
      descargaTicks: Math.round((n?.descargaS ?? MINERADOR.descargaS) / DT),
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
      vaga: null, // vaga da bacia da base (VAGAS_BACIA) onde despeja, da espera até se afastar dela
      naBacia: false, // voltando, já passou da lane: vai para a bacia (ou espera vaga)
      saiBacia: false, // despejou e ainda está saindo da bacia
      boca: false, // já passou pela boca da bacia neste trecho (chegando ou saindo)
      carga: 0,
      mineraAte: 0,
      descargaAte: 0,
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

  /** Vaga livre da bacia da base do time (na ORDEM_VAGAS), ou null com as três ocupadas. */
  #vagaLivre(time) {
    const ocupadas = new Set(this.lista.filter((o) => o.vivo && o.time === time && o.vaga != null).map((o) => o.vaga));
    return ORDEM_VAGAS.find((k) => !ocupadas.has(k)) ?? null;
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
   * mesmo estado (quem espera baia na porta segura os de trás); chegando na bacia da
   * base, de qualquer tipo (a espera é uma só).
   */
  #folgaDaFila(m) {
    const s = m.ship;
    const fx = -Math.sin(s.yaw);
    const fz = -Math.cos(s.yaw);
    let folga = 1;
    for (const o of this.lista) {
      if (o === m || !o.vivo || o.time !== m.time) continue;
      if (o.estado !== m.estado || (!!o.nucleo !== !!m.nucleo && !(m.naBacia && o.naBacia))) continue;
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

  /** Índice do primeiro ponto da rota de ida que fica adiante de (x, z), rumo à doca. */
  #pontoAdiante(time, x, z) {
    const rota = ROTAS[time];
    const fim = rota[rota.length - 1];
    const falta = Math.hypot(fim.x - x, fim.z - z);
    const k = rota.findIndex((p) => Math.hypot(fim.x - p.x, fim.z - p.z) < falta - 5);
    return k < 0 ? rota.length - 1 : k;
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
      // Pulso EMP: motor desligado (para aos poucos) e a mineração e a descarga não andam.
      stepShip(s, { th: 0, tu: 0, b: false, f1: false, f2: false, p: false, a: 0 });
      if (m.estado === 'minerando') m.mineraAte++;
      if (m.estado === 'descarregando') m.descargaAte++;
      return;
    }
    const rota = ROTAS[m.time];
    const ultimo = rota.length - 1;
    const thMax = Math.min(1, a.velocidade / velocidadeBase(s));
    const bacia = BACIAS[m.time];
    let alvo = null;
    let th = thMax;

    if (m.estado === 'ida') {
      // Saindo da bacia: libera a vaga ao se afastar dela, e a bacia mais adiante.
      const v = m.vaga != null ? VAGAS_BACIA[m.time][m.vaga] : null;
      if (v && Math.hypot(v.x - s.x, v.z - s.z) > VAGA_LIVRE) m.vaga = null;
      if (m.saiBacia && Math.hypot(bacia.x - s.x, bacia.z - s.z) > BACIA_LIVRE) m.saiBacia = false;
      const boca = BOCAS_BACIA[m.time];
      if (m.saiBacia && !m.boca && Math.hypot(boca.x - s.x, boca.z - s.z) < CHEGOU_BOCA) m.boca = true;
      // Na porta, pega uma baia livre da bacia; com as três ocupadas (ou alguém saindo
      // do hangar: um sentido por vez lá dentro), espera ali parado.
      if (m.ponto === ultimo && m.baia == null && !this.#alguem(m.time, saindo)) m.baia = this.#baiaLivre(m.time);
      const naPorta = m.ponto === ultimo && m.baia == null;
      if (naPorta) {
        alvo = pontoRota(m.time, ultimo, true); // olhando para dentro
        th = 0;
      } else if (m.saiBacia && !m.boca) {
        alvo = boca; // saindo da bacia: primeiro a boca, entre as outras vagas
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
    if (m.estado === 'descarregando') {
      // Parado em cima da vaga, despejando, virando para a saída (a boca da bacia).
      const saida = BOCAS_BACIA[m.time];
      const diff = anguloEntre(s.yaw, yawPara(s.x, s.z, saida.x, saida.z));
      stepShip(s, { th: 0, tu: Math.max(-1, Math.min(1, diff * 2.5)), b: false, f1: false, f2: false, p: false, a: 0 });
      if (tick < m.descargaAte) return;
      // Despejou: a carga conta no placar (o placar decide quanto vale: dobra na fase
      // final; o evento leva isso), no lugar dele, em cima da bacia.
      if (m.carga > 0) {
        const valor = this.entregar(m.time, m.carga) ?? m.carga;
        this.evento({ e: 'entrega', id: m.id, time: m.time, carga: valor, x: s.x, y: s.y, z: s.z, ...(m.nucleo ? { nucleo: 1 } : {}) });
        m.carga = 0;
        if (m.nucleo) {
          m.sumiu = true; // o do Núcleo entrega uma vez só e some
          return;
        }
      }
      // Sai pela faixa da ida, mas só com ninguém entrando nem saindo da bacia.
      if (this.#alguem(m.time, (o) => o !== m && (entrandoBacia(o) || saindoBacia(o)))) return;
      m.estado = 'ida';
      m.saiBacia = true;
      m.boca = false;
      m.ponto = this.#pontoAdiante(m.time, s.x, s.z);
      return;
    }
    if (m.estado === 'volta') {
      const b = m.baia != null ? BAIAS[m.time][m.baia] : null;
      if (b && Math.hypot(b.x - s.x, b.z - s.z) > BAIA_LIVRE) m.baia = null;
      // Passou da lane (o próximo ponto da rota já fica atrás da espera da bacia):
      // vai para a bacia.
      const espera = ESPERAS_BACIA[m.time];
      const base = BASES[m.time];
      if (!m.naBacia && Math.hypot(rota[m.ponto].x - base.x, rota[m.ponto].z - base.z) < Math.hypot(espera.x - base.x, espera.z - base.z)) m.naBacia = true;
      if (m.naBacia) {
        // Pega uma vaga livre (com ninguém saindo da bacia: um sentido por vez, e na
        // ordem da fila: quem está mais perto da boca primeiro, senão o de trás pegaria
        // a vaga e ficaria preso atrás do da frente); sem vaga, freia e para na espera,
        // com a fila atrás.
        const boca = BOCAS_BACIA[m.time];
        const dBoca = (o) => Math.hypot(boca.x - o.ship.x, boca.z - o.ship.z);
        if (m.vaga == null && !this.#alguem(m.time, (o) => saindoBacia(o) || (o !== m && o.naBacia && o.vaga == null && dBoca(o) < dBoca(m)))) {
          m.vaga = this.#vagaLivre(m.time);
          m.boca = false;
        }
        // Com vaga, passa pela boca da bacia e vai até ela.
        if (m.vaga != null && !m.boca && Math.hypot(boca.x - s.x, boca.z - s.z) < CHEGOU_BOCA) m.boca = true;
        alvo = m.vaga == null ? espera : m.boca ? VAGAS_BACIA[m.time][m.vaga] : boca;
        const vaga = m.vaga != null ? VAGAS_BACIA[m.time][m.vaga] : null;
        const d = vaga ? Math.hypot(vaga.x - s.x, vaga.z - s.z) : Math.hypot(alvo.x - s.x, alvo.z - s.z);
        if (m.vaga == null) th = thMax * Math.max(0, Math.min(1, (d - 2) / FREIA_DIST));
        else th = Math.min(thMax, (Math.max(0, d - 0.5) * FREIO_VAGA) / velocidadeBase(s)); // chega parando em cima da vaga
        if (m.vaga != null && d < CHEGOU_VAGA) {
          m.estado = 'descarregando';
          m.naBacia = false;
          m.descargaAte = tick + a.descargaTicks;
          return;
        }
      } else {
        alvo = pontoRota(m.time, m.ponto, false);
        if (Math.hypot(alvo.x - s.x, alvo.z - s.z) < CHEGOU && m.ponto > 0) m.ponto--;
      }
    }

    const diff = anguloEntre(s.yaw, yawPara(s.x, s.z, alvo.x, alvo.z));
    th *= Math.max(0.15, 1 - Math.abs(diff) / 1.6); // curva fechada: freia para virar
    th *= this.#folgaDaFila(m); // fila: freia atrás do da frente e para a FILA_ESPACO dele
    stepShip(s, { th, tu: Math.max(-1, Math.min(1, diff * 2.5)), b: false, f1: false, f2: false, p: false, a: 0 });
  }
}
