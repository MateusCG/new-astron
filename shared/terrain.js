// Mapa da partida (o lago do Stage 6 no formato do desenho 2D do Mateus),
// compartilhado entre servidor e cliente.
//
// O servidor usa heightAt() para decidir colisão de nave e de tiro com as rochas;
// o cliente usa a mesmíssima função para a predição local e para o desenho. Por isso
// tudo aqui é determinístico (formas analíticas e ruído de hash inteiro, sem
// Math.random) e o arquivo não importa nada de Three.js: qualquer diferença faria o
// cliente "atravessar" rochas que o servidor considera sólidas.
//
// O desenho (mapa-2d.png, 1 px = 2,25 m; x para a direita, z para BAIXO, então -z é
// "em cima") é um MOBA de três rotas resumidas numa: a lane horizontal no meio, com
// a mineradora de Hélio-3 no centro dividindo-a em duas metades, as bases nas pontas
// (time 0 = Base A à esquerda, x < 0; time 1 = Base B à direita) e a jungle em cima
// e embaixo, com acampamentos, buffs, plataformas de pouso, campos de asteroides
// (passáveis, escondem quem está dentro) e os dois poços dos objetivos épicos (o
// Núcleo de He-3 em cima, a Ancient Medusa embaixo), cercados por paredes em L.
//
// Três tipos de terreno: rocha (bloqueio total de passagem, tiro e visão), campo de
// asteroides (ASTEROIDES: passável, só esconde) e campo aberto (o resto). A rocha é a
// planta única ROCHAS: a borda (tudo fora da região aberta), as rochas dos quadrantes
// e as paredes em L. A física (heightAt/paredeAt, e alturaSolida em
// shared/obstaculos.js), a visão (shared/visao.js) e o desenho usam a mesma lista.
//
// Altura: o chão de voo da região aberta é PLANO, heightAt = 0 (a nave voa a HOVER =
// 10 m). Lá embaixo fica o lago (NIVEL_AGUA, só visual), para tudo parecer flutuar
// sobre a água como no Stage 6. A rocha sobe com um degrau vertical (DEGRAU da altura
// do topo) e chega ao topo em RAMPA metros: degrau não se sobe de jeito nenhum, nem
// de lado, então a nave contorna. O topo varia devagar (ruído simétrico), entre o
// topoMin e o topo de cada rocha.
//
// Tudo é simétrico por rotação de 180° em torno do centro, (x, z) → (-x, -z): só o
// lado do time 0 é escrito, e o do time 1 sai girado (girar()).

export const MAP_HALF_X = 1500;
export const MAP_HALF_Z = 1120;
/** @deprecated Metade do lado MAIOR do mapa; use MAP_HALF_X e MAP_HALF_Z. */
export const MAP_HALF = MAP_HALF_X;

/**
 * Superfície do lago (só visual): abaixo do chão de voo (0), para tudo flutuar. Os
 * modelos do mapa (public/modelos/mapa/) foram feitos para −16: as cintas da linha
 * d'água da mineradora, dos pilares e das rochas encaixam nela.
 */
export const NIVEL_AGUA = -16;
/** Fundo do lago (só visual), visto pela água. */
export const FUNDO_LAGO = -60;

/**
 * Região aberta: a união da jungle (retângulo |x| ≤ 1080, |z| ≤ 1060) com a faixa da
 * lane e das bocas das bases (|x| ≤ 1440, |z| ≤ 180). Os cantos (os de cada retângulo
 * e os encontros dos dois) são arredondados com raio `canto`, para a nave deslizar na
 * parede em vez de enroscar. O resto é a rocha da borda.
 */
export const ABERTO = { jungle: { meiaX: 1080, meiaZ: 1060 }, lane: { meiaX: 1440, meiaZ: 180 }, canto: 40 };

/** Bases dos dois times: a do time 0 (Base A) à esquerda, a do time 1 à direita. `raio` é a zona segura. */
export const BASES = [
  { time: 0, x: -1280, z: 0, raio: 170 },
  { time: 1, x: 1280, z: 0, raio: 170 },
];
/** Base do time 0 (compatibilidade). */
export const BASE = BASES[0];

/**
 * Bolsão de cada base no fim da lane: 1125 ≤ |x| ≤ 1440, |z| ≤ 180 (é o fim do
 * retângulo da lane em ABERTO). A base vê o bolsão inteiro (shared/visao.js).
 */
export const BOLSAO = { xMin: 1125, xMax: 1440, meiaZ: 180 };

/**
 * Largura da lane (em z): acompanha o vão do arco da entrega na boca da base
 * (entrega.glb, ~143 m de ponta a ponta, com os dois pilares nas pontas). Olhando da
 * base para a lane, a lane é o que passa por dentro do arco. Decisão do Mateus
 * (out/2026; antes eram 180 m). O bolsão das bases (ABERTO.lane, BOLSAO) continua
 * com |z| ≤ 180.
 */
export const LARGURA_LANE = 140;

/**
 * Lane: faixa |z| ≤ 70 entre as bocas das bases. Sem pista nem regra própria: é por
 * onde os mineradores voam; as torres sentinela ficam dos lados, fora dela.
 * `largura` é em z.
 */
export const LANE = {
  z: 0,
  meiaLargura: LARGURA_LANE / 2,
  largura: LARGURA_LANE,
  xInicio: -BOLSAO.xMin,
  xFim: BOLSAO.xMin,
};
/** @deprecated O corredor vertical do mapa antigo virou a LANE horizontal; use LANE. */
export const CORREDOR = LANE;

/**
 * Mineradora de Hélio-3 no centro da lane: retângulo arredondado (meia-largura em x,
 * meia-profundidade em z, raio do canto), mais largo que a lane e mais alto que
 * qualquer tiro ou olhar. Bloqueia passagem, tiro e visão. A construção sólida está
 * em shared/obstaculos.js (com esta mesma planta).
 */
export const MINERADORA = { x: 0, z: 0, meiaX: 70, meiaZ: 115, canto: 24, topo: 95 };
/**
 * Hangar de cada time na mineradora: o vão aberto na face voltada para a própria base
 * (porta sempre aberta, de x = ±70 para dentro), com um campo de força na cor do time.
 * Só o minerador do time atravessa (a nave dele leva `hangar` = time, só no servidor:
 * alturaSolida não conta a mineradora dentro deste retângulo para ele); naves, tiros e
 * escoltas batem no campo como na parede. `xMin`/`xMax` em x, `meiaZ` em volta de z = 0;
 * o desenho (paredes a ±34 m, fundo a ±12 m, teto a 20 m) fica um pouco além.
 */
export const HANGARES = [
  { time: 0, xMin: -78, xMax: -16, meiaZ: 30 },
  { time: 1, xMin: 16, xMax: 78, meiaZ: 30 },
];
/** Docas da mineradora: o meio da bacia de He-3, dentro do hangar do time (as três BAIAS ficam em volta). */
export const DOCAS = [
  { time: 0, x: -38, z: 0 },
  { time: 1, x: 38, z: 0 },
];
/**
 * Ponto de espera na frente da porta de cada hangar, do lado de fora: onde a escolta
 * para enquanto o minerador minera lá dentro (e o fim da ronda dela). As rotas passam
 * por ele antes de entrar.
 */
export const ESPERAS = [
  { time: 0, x: -100, z: 0 },
  { time: 1, x: 100, z: 0 },
];

/** O ponto (x, z) está no hangar do `time` (onde só o minerador dele passa)? */
export function noHangar(time, x, z) {
  const h = HANGARES[time];
  return !!h && x >= h.xMin && x <= h.xMax && Math.abs(z - MINERADORA.z) <= h.meiaZ;
}
/** @deprecated O depósito de minério virou a MINERADORA (as docas são o ponto de carga). */
export const MINERIO = { x: MINERADORA.x, z: MINERADORA.z, raio: MINERADORA.meiaZ };

/**
 * Pontos de entrega do minério, na boca de cada base, virados para a lane.
 * `largura` é a extensão em x (ao longo da lane) e `profundidade` a extensão em z.
 */
export const ENTREGAS = [
  { time: 0, x: -1110, z: 0, largura: 30, profundidade: 120 },
  { time: 1, x: 1110, z: 0, largura: 30, profundidade: 120 },
];

/**
 * Leva um ponto do referencial da base do time 0 (centro na origem, lane para +x)
 * para o mundo, na base `b`. A base do time 1 é a do time 0 girada 180°.
 */
export function daBase(b, lx, lz) {
  const s = b.time === 0 ? 1 : -1;
  return { x: b.x + s * lx, z: b.z + s * lz };
}

/**
 * Serviços de cada base: plataformas de pouso no fundo do bolsão, dos dois lados do
 * anel. Olhando da base para a lane, a da esquerda (-z na base do time 0) é a
 * Evolução e a da direita, a Loja.
 */
export const SERVICO_LOCAL = { evolucao: { lx: -40, lz: -125 }, loja: { lx: -40, lz: 125 } };
export const SERVICOS = BASES.flatMap((b) =>
  ['evolucao', 'loja'].map((servico) => ({ servico, time: b.time, ...daBase(b, SERVICO_LOCAL[servico].lx, SERVICO_LOCAL[servico].lz), raio: 20 })),
);

/** @deprecated Os objetivos A/B/C do mapa antigo saíram; os novos estão em BUFFS, PLATAFORMAS_POUSO, MEDUSA e NUCLEO. */
export const OBJETIVOS = [];

/** Gira 180° em volta do centro do mapa. */
function girar(x, z) {
  return { x: -x, z: -z };
}
/** Troca o time do id ('0' ↔ '1') e o lado ('N' ↔ 'S') de um id do time 0. */
function idGirado(id) {
  return id.replace(/[01NS]/g, (c) => ({ 0: '1', 1: '0', N: 'S', S: 'N' })[c]);
}
/** A lista do time 0 e a mesma girada 180° (time 1). */
function comGirados(lista, girarItem) {
  return [...lista, ...lista.map(girarItem)];
}
const girarPonto = (o) => ({ ...o, id: idGirado(o.id), time: 1 - o.time, ...girar(o.x, o.z) });

/**
 * Distância do eixo da lane às torres, em meias-larguras da lane: 1,9 é a proporção
 * do desenho (171 m com a lane de 180 m). Com a lane de 140 m, a torre fica a
 * 133 m do eixo; mesmo com o raio da torre sólida (TORRETA em shared/obstaculos.js,
 * 9 m), sobram mais de 50 m de água entre ela e a beira da lane.
 */
export const TORRETA_LADO_POR_LANE = 1.9;

/**
 * Torres sentinela: 4 por time, fora da lane (na faixa entre a lane e a jungle),
 * duas de cada lado dela. `nome` é do ponto de vista de quem é do time, olhando da
 * base para a mineradora (à esquerda = -z na metade do time 0). As do time 1 são as
 * do time 0 giradas 180°, com o mesmo número: T0-1 ↔ T1-1. A construção sólida fica
 * em shared/obstaculos.js; vida, tiro e reconstrução em server/torretas.js.
 */
export const TORRETA_LADO = LANE.meiaLargura * TORRETA_LADO_POR_LANE; // m do eixo da lane
export const TORRETA_DIST = [492.5, 852.5]; // m do centro da base, rumo à mineradora
export const TORRETAS = BASES.flatMap((b) =>
  TORRETA_DIST.flatMap((d, i) =>
    [-1, 1].map((lado, k) => ({
      id: `T${b.time}-${i * 2 + k + 1}`,
      time: b.time,
      nome: `${i === 0 ? 'Perto da base' : 'Perto da mineradora'}, à ${lado < 0 ? 'esquerda' : 'direita'}`,
      ...daBase(b, d, lado * TORRETA_LADO),
    })),
  ),
);

/**
 * Caminho dos mineradores de cada time: em LINHA RETA pela lane (z = 0), do centro da
 * base, passando pela entrega, até a espera na frente da porta (ESPERAS, com um ponto
 * a cada 100 m no máximo) e dali, pela porta, até a doca dentro do hangar (o último
 * ponto). A volta é a mesma lista de trás para frente. A escolta faz a ronda só até a
 * espera (o penúltimo ponto).
 */
export const ROTAS = BASES.map((b) => {
  const espera = ESPERAS[b.time];
  const fim = DOCAS[b.time];
  const n = Math.ceil(Math.abs(espera.x - b.x) / 100);
  const pontos = Array.from({ length: n + 1 }, (_, i) => ({ x: b.x + ((espera.x - b.x) * i) / n, z: b.z + ((espera.z - b.z) * i) / n }));
  pontos.push({ x: fim.x, z: fim.z });
  return pontos;
});

/**
 * Baias de mineração de cada hangar: três lugares em volta do meio da bacia de He-3
 * (DOCAS), para três mineradores do time minerarem ao mesmo tempo: uma do lado da faixa
 * da ida, uma no fundo e uma do lado da volta (12 m ou mais entre elas e do caminho de
 * quem entra e sai). O minerador pega uma baia livre ao chegar na porta; com as três
 * ocupadas, espera na porta.
 */
export const BAIAS = DOCAS.map((d) => {
  const dentro = -Math.sign(BASES[d.time].x); // da porta para o fundo do hangar
  return [
    { x: d.x, z: d.z + 12 * dentro },
    { x: d.x + 7 * dentro, z: d.z },
    { x: d.x, z: d.z - 12 * dentro },
  ];
});

// ---------- Jungle ----------

/** Campos de asteroides: retângulos passáveis que escondem quem está dentro (largura em x, profundidade em z). */
export const ASTEROIDES = comGirados(
  [
    { id: 'AB0N', time: 0, x: -607.5, z: -898, largura: 153, profundidade: 248 }, // junto ao buff de ataque
    { id: 'AB0S', time: 0, x: -607.5, z: 898, largura: 153, profundidade: 248 }, // junto ao buff de suporte
    { id: 'AC0N', time: 0, x: -180, z: -405, largura: 180, profundidade: 315 }, // centrais
    { id: 'AC0S', time: 0, x: -180, z: 405, largura: 180, profundidade: 315 },
  ],
  girarPonto,
);

/** Id do campo de asteroides que contém o ponto, ou null. */
export function emAsteroides(x, z) {
  for (const a of ASTEROIDES) {
    if (Math.abs(x - a.x) <= a.largura / 2 && Math.abs(z - a.z) <= a.profundidade / 2) return a.id;
  }
  return null;
}

/**
 * Acampamentos de monstros comuns. `tipo` 'base' (perto da base: 4 pequenos) ou
 * 'centro' (perto do centro: 1 grande e 2 pequenos); `time` é o território.
 */
export const ACAMPAMENTOS = comGirados(
  [
    { id: 'JB0N', time: 0, tipo: 'base', x: -945, z: -337.5, raio: 50 },
    { id: 'JB0S', time: 0, tipo: 'base', x: -945, z: 337.5, raio: 50 },
    { id: 'JC0N', time: 0, tipo: 'centro', x: -472.5, z: -922.5, raio: 55 },
    { id: 'JC0S', time: 0, tipo: 'centro', x: -472.5, z: 922.5, raio: 55 },
  ],
  girarPonto,
);

/**
 * Buffs: o de ataque é um monstro forte, o de suporte uma torre (sólida, em
 * shared/obstaculos.js). Pela simetria, o de ataque do time 0 fica em cima (perto do
 * Núcleo) e o do time 1 embaixo (perto da Medusa).
 */
export const BUFFS = [
  { id: 'BA0', tipo: 'ataque', time: 0, x: -855, z: -909 },
  { id: 'BS0', tipo: 'suporte', time: 0, x: -855, z: 909 },
  { id: 'BA1', tipo: 'ataque', time: 1, x: 855, z: 909 },
  { id: 'BS1', tipo: 'suporte', time: 1, x: 855, z: -909 },
];

/** Plataformas de pouso que dão ouro ao time (qualquer time pousa em qualquer uma). */
export const PLATAFORMAS_POUSO = [
  { id: 'P0', time: 0, x: -495, z: -445.5, raio: 28 },
  { id: 'P1', time: 1, x: 495, z: 445.5, raio: 28 },
];

/** Núcleo de He-3 (poço de cima) e Ancient Medusa (poço de baixo); `raio` é o da arena. */
export const NUCLEO = { x: 0, z: -877, raio: 120 };
export const MEDUSA = { x: 0, z: 877, raio: 120 };

/**
 * Trajeto da sonda errante pela coluna central (ida), da ponta de cima (perto do
 * Núcleo) à de baixo (perto da Medusa), contornando a mineradora por x = +130. A
 * volta é a lista ao contrário. Para ficar justo com os dois times, a sonda que nasce
 * na ponta de baixo usa este trajeto girado 180° (contorna por x = -130): ver
 * trajetoSonda().
 */
export const SONDA_TRAJETO = [
  { x: 0, z: -337.5 },
  { x: 130, z: -190 },
  { x: 130, z: 190 },
  { x: 0, z: 337.5 },
];

/**
 * Trajeto de ida da sonda que nasce na `ponta` 0 (em cima, -z) ou 1 (embaixo, +z).
 * O de baixo é o de cima girado 180°.
 */
export function trajetoSonda(ponta = 0) {
  return ponta === 0 ? SONDA_TRAJETO.map((p) => ({ ...p })) : SONDA_TRAJETO.map((p) => girar(p.x, p.z));
}

// ---------- Rochas ----------

const RAMPA = 16; // metros do pé ao alto da rocha (bem mais íngreme que MAX_SLOPE)
// A rocha começa com um degrau vertical (esta fração da altura do topo): rampa
// contínua, por mais íngreme, a nave sobe "de lado", andando quase paralela à parede
// e ganhando um pouco de altura a cada passo. Degrau não se sobe de jeito nenhum.
const DEGRAU = 0.3;
const DETALHE_TOPO = 3; // ± metros de relevo fino no alto da rocha

/** Paredes em L dos poços: espessura e topo (iguais nas duas barras de cada L). */
export const PAREDE_L = { espessura: 40, canto: 10, topoMin: 84, topo: 100 };
/** Rochas dos quadrantes: cápsula de 360 × 135 m. */
export const ROCHA_QUADRANTE = { comprimento: 360, largura: 135, topoMin: 74, topo: 106 };

function rochaQuadrante(id, x, z) {
  const r = ROCHA_QUADRANTE.largura / 2;
  const meio = ROCHA_QUADRANTE.comprimento / 2 - r;
  return { id, time: 0, forma: 'capsula', ax: x - meio, az: z, bx: x + meio, bz: z, raio: r, topoMin: ROCHA_QUADRANTE.topoMin, topo: ROCHA_QUADRANTE.topo };
}

/** Barra de parede em L entre (x0, z0) e (x1, z1) (as bordas externas, no eixo de uma delas). */
function barraL(id, x0, z0, x1, z1) {
  const e = PAREDE_L.espessura / 2;
  const meiaX = x0 === x1 ? e : Math.abs(x1 - x0) / 2;
  const meiaZ = z0 === z1 ? e : Math.abs(z1 - z0) / 2;
  return { id, time: 0, forma: 'retangulo', x: (x0 + x1) / 2, z: (z0 + z1) / 2, meiaX, meiaZ, canto: PAREDE_L.canto, topoMin: PAREDE_L.topoMin, topo: PAREDE_L.topo };
}

function girarRocha(r) {
  const g = { ...r, id: idGirado(r.id), time: 1 - r.time };
  if (r.forma === 'capsula') Object.assign(g, { ax: -r.ax, az: -r.az, bx: -r.bx, bz: -r.bz });
  else Object.assign(g, girar(r.x, r.z));
  return g;
}

/** Caixa alinhada aos eixos que envolve a forma (para descartar rápido). */
function caixaDe(r) {
  if (r.forma === 'capsula') {
    return { x0: Math.min(r.ax, r.bx) - r.raio, x1: Math.max(r.ax, r.bx) + r.raio, z0: Math.min(r.az, r.bz) - r.raio, z1: Math.max(r.az, r.bz) + r.raio };
  }
  if (r.forma === 'retangulo') return { x0: r.x - r.meiaX, x1: r.x + r.meiaX, z0: r.z - r.meiaZ, z1: r.z + r.meiaZ };
  return null; // a borda é tudo fora da região aberta
}

/**
 * Planta única das rochas (bloqueio total de passagem, tiro e visão). Formas:
 * - 'borda': tudo fora da região aberta (`jungle`, `lane` e `canto`, como ABERTO);
 * - 'capsula': segmento (ax, az)-(bx, bz) engordado por `raio` (rochas dos quadrantes);
 * - 'retangulo': centro (x, z), `meiaX`, `meiaZ`, cantos arredondados com raio `canto`
 *   (as barras das paredes em L; cada L são duas barras, `<id>v` e `<id>h`).
 * Cada uma tem `id`, `time` (território; a borda não tem), `topoMin` e `topo` (o
 * alto varia devagar entre os dois) e `caixa` ({ x0, x1, z0, z1 }, null na borda).
 * Os ids do time 1 são os do time 0 girados: 0 ↔ 1 e N ↔ S (LN0v ↔ LS1v).
 */
export const ROCHAS = [
  { id: 'borda', forma: 'borda', ...ABERTO, topoMin: 100, topo: 140 },
  ...comGirados(
    [
      rochaQuadrante('Q0N', -697.5, -652.5),
      rochaQuadrante('Q0S', -697.5, 652.5),
      // Poço de cima (Núcleo), lado do time 0: barra vertical e barra horizontal.
      barraL('LN0v', -324, -877, -324, -625),
      barraL('LN0h', -351, -648, -99, -648),
      // Poço de baixo (Medusa), lado do time 0: o de cima espelhado em z.
      barraL('LS0v', -324, 625, -324, 877),
      barraL('LS0h', -351, 648, -99, 648),
    ],
    girarRocha,
  ),
].map((r) => ({ ...r, caixa: caixaDe(r) }));
const BORDA = ROCHAS[0];
const INTERIORES = ROCHAS.slice(1);

// ---------- Ruído ----------

function hash(ix, iz, seed) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ Math.imul(seed, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function suave(t) {
  return t * t * (3 - 2 * t);
}

function valueNoise(x, z, seed) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = suave(x - ix);
  const fz = suave(z - iz);
  const a = hash(ix, iz, seed);
  const b = hash(ix + 1, iz, seed);
  const c = hash(ix, iz + 1, seed);
  const d = hash(ix + 1, iz + 1, seed);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}

/** Soma de oitavas de value noise, em [0, 1] aproximadamente, centrada em 0.5. */
export function fbm(x, z, seed, oitavas = 4) {
  let soma = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < oitavas; i++) {
    soma += valueNoise(x * freq, z * freq, seed + i * 101) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return soma / norm;
}

/** fbm simétrico pela rotação de 180°: mesmo valor em (x, z) e (-x, -z). */
function fbmSim(x, z, escala, seed, oitavas) {
  return (fbm(x * escala, z * escala, seed, oitavas) + fbm(-x * escala, -z * escala, seed, oitavas)) / 2;
}

export function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// ---------- Distâncias com sinal (negativo dentro da forma) ----------

/** Distância de (px, pz) ao segmento a-b. */
export function distSegmento(px, pz, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz;
  const t = l2 > 0 ? Math.min(1, Math.max(0, ((px - ax) * dx + (pz - az) * dz) / l2)) : 0;
  return Math.hypot(px - ax - dx * t, pz - az - dz * t);
}

/** Distância com sinal de (px, pz) a um retângulo de cantos arredondados centrado em (cx, cz). */
export function sdRetanguloArredondado(px, pz, cx, cz, meiaX, meiaZ, canto) {
  const qx = Math.abs(px - cx) - (meiaX - canto);
  const qz = Math.abs(pz - cz) - (meiaZ - canto);
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - canto;
}

/**
 * Distância com sinal até a borda da região aberta (positiva na rocha da borda).
 * A união dos dois retângulos usa um mínimo suave circular: nos encontros da jungle
 * com a lane, a quina da rocha sai arredondada com raio `canto`.
 */
function sdBorda(x, z) {
  const k = BORDA.canto;
  const a = sdRetanguloArredondado(x, z, 0, 0, BORDA.jungle.meiaX, BORDA.jungle.meiaZ, k);
  const b = sdRetanguloArredondado(x, z, 0, 0, BORDA.lane.meiaX, BORDA.lane.meiaZ, k);
  return Math.max(k, Math.min(a, b)) - Math.hypot(Math.max(k - a, 0), Math.max(k - b, 0));
}

/** Quanto o ponto está para dentro da rocha `r` (positivo dentro, negativo fora). */
function profundidadeEm(r, x, z) {
  if (r.forma === 'borda') return sdBorda(x, z);
  if (r.forma === 'capsula') return r.raio - distSegmento(x, z, r.ax, r.az, r.bx, r.bz);
  return -sdRetanguloArredondado(x, z, r.x, r.z, r.meiaX, r.meiaZ, r.canto);
}

/**
 * A rocha mais funda no ponto: { r, d } (d > 0 dentro), ou null fora de toda rocha.
 * A caixa de cada rocha descarta rápido a maior parte do mapa.
 */
function rochaNoPonto(x, z) {
  let melhor = null;
  let fundo = 0;
  const db = sdBorda(x, z);
  if (db > 0) {
    melhor = BORDA;
    fundo = db;
  }
  for (const r of INTERIORES) {
    const c = r.caixa;
    if (x < c.x0 || x > c.x1 || z < c.z0 || z > c.z1) continue;
    const d = profundidadeEm(r, x, z);
    if (d > fundo) {
      melhor = r;
      fundo = d;
    }
  }
  return melhor ? { r: melhor, d: fundo } : null;
}

/** Id da rocha que contém o ponto (x, z), ou null no campo aberto. */
export function rochaEm(x, z) {
  return rochaNoPonto(x, z)?.r.id ?? null;
}

/** Fração da altura do topo no ponto, a `d` metros para dentro da rocha. */
function fracaoParede(d) {
  return d <= 0 ? 0 : DEGRAU + (1 - DEGRAU) * smoothstep(0, RAMPA, d);
}

/** Altura do alto da rocha `r` no ponto: varia devagar entre topoMin e topo, com relevo fino. */
function alturaTopo(r, x, z) {
  const t = smoothstep(0.3, 0.7, fbmSim(x, z, 0.006, 61, 2));
  return r.topoMin + (r.topo - r.topoMin) * t + (fbmSim(x, z, 0.04, 91, 2) - 0.5) * 2 * DETALHE_TOPO;
}

/**
 * Quanto um ponto é rocha (0 = campo aberto, 1 = alto da rocha). O degrau faz o
 * primeiro valor dentro da rocha já ser DEGRAU. Exportado para o cliente pintar o
 * terreno e o minimapa.
 */
export function paredeAt(x, z) {
  const h = rochaNoPonto(x, z);
  return h ? fracaoParede(h.d) : 0;
}

/** O ponto é campo aberto (fora de toda rocha)? Exatamente onde paredeAt() vale 0. */
export function noMapaAberto(x, z) {
  return rochaNoPonto(x, z) === null;
}

/** Altura do chão de voo em metros no ponto (x, z): 0 no campo aberto, o alto da rocha nela. */
export function heightAt(x, z) {
  const h = rochaNoPonto(x, z);
  if (!h) return 0;
  return fracaoParede(h.d) * alturaTopo(h.r, x, z);
}

// ---------- Pouso ----------

/**
 * Áreas de pouso: a nave só pousa dentro de uma delas. O anel de conserto de cada
 * base (`base`: time), as plataformas de serviço (`servico` e `time`) e as plataformas
 * de pouso de dinheiro (`plataforma`: id, `territorio`: time; sem dono, então qualquer
 * time pousa: pousoPermitido em shared/sim.js só restringe `base` e `time`).
 *
 * `piso` é a altura do topo da plataforma acima do chão de voo. O chão aberto é
 * plano, então a altura vale para a área inteira. A física pousa a nave em cima dele
 * e o cenário desenha a plataforma com esse mesmo número. As plataformas são
 * estruturas flutuantes sobre o lago; os pilares até a água são decoração.
 */
export const AREAS_POUSO = [
  ...BASES.map((b) => ({ x: b.x, z: b.z, raio: 64, piso: 1.7, base: b.time })),
  ...SERVICOS.map((s) => ({ x: s.x, z: s.z, raio: s.raio, piso: 1.2, servico: s.servico, time: s.time })),
  // Piso 2: a nave pousada fica a HOVER - piso - ALTURA_POUSADO = 6,6 m abaixo de
  // quem voa, dentro dos 7 m do acerto de tiro (bulletHits): pousada na plataforma
  // de dinheiro ela é alvo (com piso 1 o tiro reto passava por cima).
  ...PLATAFORMAS_POUSO.map((p) => ({ x: p.x, z: p.z, raio: p.raio, piso: 2, plataforma: p.id, territorio: p.time })),
];

/** Área de pouso que contém o ponto (x, z), ou undefined. */
export function areaPouso(x, z) {
  return AREAS_POUSO.find((a) => Math.hypot(x - a.x, z - a.z) <= a.raio);
}

/** O ponto (x, z) fica dentro de alguma área de pouso? */
export function podePousar(x, z) {
  return !!areaPouso(x, z);
}

/** Altura absoluta do topo da plataforma no ponto, ou null fora das áreas de pouso. */
export function topoPouso(x, z) {
  const a = areaPouso(x, z);
  return a ? heightAt(a.x, a.z) + a.piso : null;
}
