// Terreno do mapa M1 (cânion do deserto), compartilhado entre servidor e cliente.
//
// O servidor usa heightAt() para decidir colisão de nave e de tiro com as rochas;
// o cliente usa a mesmíssima função para montar a malha 3D e para a predição local.
// Por isso o ruído é determinístico (hash inteiro, sem Math.random) e o arquivo não
// importa nada de Three.js: qualquer diferença aqui faria o cliente "atravessar"
// rochas que o servidor considera sólidas.
//
// O mapa segue o desenho da partida (DESIGN-PARTIDA.md): um retângulo aberto de
// deserto, cercado por uma muralha só na borda, para dois times de três. No eixo
// x = 0, de norte a sul: a base do time 1, a entrega dele, o corredor dos
// mineradores com o depósito de minério no meio, a entrega do time 0 e a base do
// time 0. O resto é mundo aberto (monstros, XP e ouro) com os objetivos A, B e C
// de cada lado.
//
// Tudo é simétrico por rotação de 180° em torno do centro (x, z) → (-x, -z): o que
// um time tem do seu lado, o outro tem do lado dele, inclusive o relevo. As mesas de
// rocha são sorteadas (com semente) numa metade e espelhadas na outra, e o ruído do
// chão é a média do ruído no ponto e no ponto espelhado.
//
// As mesas são "paredes de cânion" soltas: subida mais íngreme que MAX_SLOPE, então
// a nave contorna em vez de subir. Nenhuma mesa nasce perto das bases, do corredor
// (que fica aberto para o resto do mapa), dos objetivos nem do caminho reto do
// corredor até cada objetivo.

export const MAP_HALF_X = 1500;
export const MAP_HALF_Z = 1000;
/** @deprecated Metade do lado MAIOR do mapa; use MAP_HALF_X e MAP_HALF_Z. */
export const MAP_HALF = MAP_HALF_X;
export const WALL_HEIGHT = 70;
/** Largura da muralha da borda: daqui para dentro da borda já não é chão. */
export const MURALHA = 80;

/** Bases dos dois times. A do time 0 fica embaixo (+z), a do time 1 em cima (-z). */
export const BASES = [
  { time: 0, x: 0, z: 700, raio: 200 },
  { time: 1, x: 0, z: -700, raio: 200 },
];
/** Base do time 0, onde por enquanto todo jogador nasce (compatibilidade). */
export const BASE = BASES[0];
/** Corredor dos mineradores: estrada reta em x = 0, da borda de uma base à outra. */
export const CORREDOR = { x: 0, largura: 100, zInicio: BASES[1].z + BASES[1].raio, zFim: BASES[0].z - BASES[0].raio };
/** Depósito de minério no meio do corredor (cristais sólidos no miolo). */
export const MINERIO = { x: 0, z: 0, raio: 60 };
/** Pontos de entrega do minério, colados na boca de cada base. */
export const ENTREGAS = [
  { time: 0, x: 0, z: 500, largura: 120, profundidade: 30 },
  { time: 1, x: 0, z: -500, largura: 120, profundidade: 30 },
];
/**
 * Serviços de cada base: plataformas de pouso na linha do centro da base. Pousado
 * na da esquerda (x < 0) abre a Evolução; na da direita, a Loja.
 */
export const SERVICOS = BASES.flatMap((b) => [
  { servico: 'evolucao', time: b.time, x: b.x - 150, z: b.z, raio: 20 },
  { servico: 'loja', time: b.time, x: b.x + 150, z: b.z, raio: 20 },
]);
/**
 * Objetivos: A = pousar na marcação; B = torre (sólida, em shared/obstaculos.js);
 * C = arena do guardião. Os do índice 2 são os do 1 girados 180°.
 */
export const OBJETIVOS = [
  { id: 'A1', tipo: 'A', x: -540, z: -140, raio: 25 },
  { id: 'B1', tipo: 'B', x: -520, z: 300, raio: 25 },
  { id: 'C1', tipo: 'C', x: -1050, z: 420, raio: 25 },
  { id: 'A2', tipo: 'A', x: 540, z: 140, raio: 25 },
  { id: 'B2', tipo: 'B', x: 520, z: -300, raio: 25 },
  { id: 'C2', tipo: 'C', x: 1050, z: -420, raio: 25 },
];
/**
 * Torretas de defesa do corredor: 4 por time, 2 de cada lado da estrada, na metade
 * do mapa do próprio time, entre a base e o minério. Ficam TORRETA_LADO m do eixo
 * (fora da estrada de 100 m e longe das faixas dos mineradores, a 15 m do eixo) e
 * TORRETA_DIST m do centro da base, rumo ao minério: a de perto da base cobre a
 * entrega e a saída do portal (fora da zona segura, que vai até 230 m), a de perto
 * do minério cobre o meio da metade do time sem alcançar a coroa do outro lado.
 * As z escolhidas fogem dos caminhos retos do corredor até os objetivos (z ±140,
 * ±300 e ±420), para a torreta não ficar no meio de quem vai para lá.
 *
 * `nome` é do ponto de vista de quem é do time, olhando da base para o minério
 * (esquerda/direita de quem sai pelo portal). As do time 1 são as do time 0
 * giradas 180°, com o mesmo número: T0-1 ↔ T1-1. A construção sólida fica em
 * shared/obstaculos.js; vida, tiro e reconstrução em server/torretas.js.
 */
export const TORRETA_LADO = CORREDOR.largura / 2 + 12;
export const TORRETA_DIST = [340, 480];
export const TORRETAS = BASES.flatMap((b) => {
  const s = b.time === 0 ? 1 : -1; // o time 1 é o time 0 girado 180°
  return TORRETA_DIST.flatMap((d, i) =>
    [-1, 1].map((lado, k) => ({
      id: `T${b.time}-${i * 2 + k + 1}`,
      time: b.time,
      nome: `${i === 0 ? 'Perto da base' : 'Perto do minério'}, à ${lado < 0 ? 'esquerda' : 'direita'}`,
      x: b.x + s * lado * TORRETA_LADO,
      z: b.z - s * d,
    })),
  );
});
/** Raio da arena dos objetivos C (o círculo marcado em volta do guardião). */
export const ARENA_C = 60;
/**
 * Caminho dos mineradores de cada time: do centro da base até a beira do depósito
 * de minério, pelo meio do corredor. A volta é a mesma lista de trás para frente.
 */
export const ROTAS = BASES.map((b) => {
  const fim = MINERIO.z + Math.sign(b.z - MINERIO.z) * (MINERIO.raio - 10);
  const n = Math.ceil(Math.abs(b.z - fim) / 100);
  return Array.from({ length: n + 1 }, (_, i) => ({ x: b.x, z: b.z + ((fim - b.z) * i) / n }));
});

const RAMPA = 16; // metros do pé ao alto da rocha (bem mais íngreme que MAX_SLOPE)
// A rocha começa com um degrau vertical (esta fração da altura): rampa contínua,
// por mais íngreme, a nave sobe "de lado", andando quase paralela à parede e
// ganhando um pouco de altura a cada passo. Degrau não se sobe de jeito nenhum.
const DEGRAU = 0.3;
const BORDA_RUIDO = 16; // até quanto o ruído engorda a mesa, em metros

/**
 * Áreas de pouso: a nave só pousa dentro de uma delas. O anel de conserto de cada
 * base (`base`: time), as plataformas de serviço (`servico` e `time`) e as
 * marcações dos objetivos A (`objetivo`: id, e `tipo`).
 *
 * `piso` é a altura do topo da plataforma acima do terreno no centro da área. O
 * chão em volta das áreas é plano (heightAt aplaina), então a altura vale para a
 * área inteira. A física pousa a nave em cima dele e o cenário desenha a plataforma
 * com esse mesmo número.
 */
export const AREAS_POUSO = [
  ...BASES.map((b) => ({ x: b.x, z: b.z, raio: 64, piso: 1.7, base: b.time })),
  ...SERVICOS.map((s) => ({ x: s.x, z: s.z, raio: s.raio, piso: 1.2, servico: s.servico, time: s.time })),
  ...OBJETIVOS.filter((o) => o.tipo === 'A').map((o) => ({ x: o.x, z: o.z, raio: o.raio, piso: 0.5, objetivo: o.id, tipo: o.tipo })),
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

/** Distância de (px, pz) ao segmento a-b. */
function distSegmento(px, pz, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz;
  const t = l2 > 0 ? Math.min(1, Math.max(0, ((px - ax) * dx + (pz - az) * dz) / l2)) : 0;
  return Math.hypot(px - ax - dx * t, pz - az - dz * t);
}

// ---------- Mesas de rocha ----------

/**
 * Áreas onde não pode haver rocha, cada uma com a folga que exige: círculos
 * (bases, objetivos, serviços) e segmentos (o corredor inteiro, com uma faixa aberta
 * dos dois lados, e o caminho reto do corredor até cada objetivo). Já é simétrica,
 * então mesa e espelho passam ou caem juntos.
 */
const PROTEGIDO = [
  ...BASES.map((b) => ({ ax: b.x, az: b.z, bx: b.x, bz: b.z, folga: b.raio + 40 })),
  { ax: CORREDOR.x, az: BASES[1].z, bx: CORREDOR.x, bz: BASES[0].z, folga: CORREDOR.largura / 2 + 90 },
  ...OBJETIVOS.map((o) => ({ ax: o.x, az: o.z, bx: o.x, bz: o.z, folga: (o.tipo === 'C' ? ARENA_C : o.raio) + 50 })),
  ...OBJETIVOS.map((o) => ({ ax: CORREDOR.x, az: o.z, bx: o.x, bz: o.z, folga: 45 })),
];

/** Menor distância entre o segmento de uma mesa e uma área protegida, menos a folga dela. */
function folgaMesa(m) {
  let menor = Infinity;
  for (const p of PROTEGIDO) {
    // Distância entre dois segmentos: amostra o da mesa (curto) contra o protegido.
    for (let t = 0; t <= 1; t += 0.125) {
      const x = m.ax + (m.bx - m.ax) * t;
      const z = m.az + (m.bz - m.az) * t;
      menor = Math.min(menor, distSegmento(x, z, p.ax, p.az, p.bx, p.bz) - p.folga);
    }
  }
  return menor;
}

/**
 * Sorteia as mesas (com semente) numa grade com tremor na metade sul (z > 0) e
 * espelha cada uma na metade norte. Cada mesa é uma cápsula: segmento a-b com raio
 * r. Fica fora quem chegar perto de área protegida ou da muralha.
 */
function montarMesas() {
  const celula = 190;
  const lista = [];
  const nx = Math.floor((2 * MAP_HALF_X) / celula);
  const nz = Math.floor(MAP_HALF_Z / celula);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      if (hash(i, j, 501) > 0.85) continue; // um ou outro buraco na grade
      const cx = -MAP_HALF_X + (i + 0.2 + hash(i, j, 502) * 0.6) * celula;
      const cz = (j + 0.2 + hash(i, j, 503) * 0.6) * celula;
      const r = 30 + hash(i, j, 504) * 45;
      const meio = hash(i, j, 505) * 90;
      const ang = hash(i, j, 506) * Math.PI;
      const m = {
        ax: cx - Math.cos(ang) * meio,
        az: cz - Math.sin(ang) * meio,
        bx: cx + Math.cos(ang) * meio,
        bz: cz + Math.sin(ang) * meio,
        r,
      };
      const alcance = meio + r + BORDA_RUIDO + RAMPA;
      if (Math.abs(cx) + alcance > MAP_HALF_X - MURALHA || cz + alcance > MAP_HALF_Z - MURALHA) continue;
      if (folgaMesa(m) < r + BORDA_RUIDO + RAMPA + 15) continue;
      lista.push(m, { ax: -m.ax, az: -m.az, bx: -m.bx, bz: -m.bz, r });
    }
  }
  for (const m of lista) {
    m.cx = (m.ax + m.bx) / 2;
    m.cz = (m.az + m.bz) / 2;
    m.alcance = Math.hypot(m.bx - m.ax, m.bz - m.az) / 2 + m.r + BORDA_RUIDO + RAMPA * 2;
  }
  return lista;
}

/** Mesas de rocha do mapa (cápsulas). O cliente usa para a decoração e o minimapa. */
export const MESAS = montarMesas();

/**
 * Quanto se está "para dentro" da rocha: positivo dentro da mesa (com a borda
 * irregular de ruído), negativo fora. Longe de qualquer mesa devolve -Infinity sem
 * calcular ruído, que é o caso da maior parte do mapa.
 */
function profundidadeRocha(x, z) {
  let d = Infinity;
  for (const m of MESAS) {
    if (Math.abs(x - m.cx) > m.alcance || Math.abs(z - m.cz) > m.alcance) continue;
    d = Math.min(d, distSegmento(x, z, m.ax, m.az, m.bx, m.bz) - m.r);
  }
  if (d > BORDA_RUIDO) return -Infinity;
  const irregular = Math.min(BORDA_RUIDO, fbmSim(x, z, 0.01, 31, 3) * 12 + fbmSim(x, z, 0.05, 37, 2) * 2.5);
  return irregular - d;
}

/** Quanto o ponto é muralha da borda (0 no chão, 1 no alto). */
function muralhaAt(x, z) {
  const b = Math.max(Math.abs(x) - MAP_HALF_X, Math.abs(z) - MAP_HALF_Z) + MURALHA;
  return b <= 0 ? 0 : DEGRAU + (1 - DEGRAU) * smoothstep(0, MURALHA * 0.75, b);
}

/**
 * Quanto um ponto é rocha (0 = chão navegável, 1 = alto da mesa ou da muralha).
 * Exportado para o cliente pintar o terreno e posicionar cenário.
 */
export function paredeAt(x, z) {
  const mur = muralhaAt(x, z);
  const e = profundidadeRocha(x, z);
  if (e <= 0) return mur;
  if (e >= RAMPA * 1.5) return 1;
  // A profundidade não é uma distância exata: onde o ruído da borda varia ela cresce
  // mais devagar que 1 m por metro, e a rampa ficaria comprida. Dividir pelo
  // gradiente devolve a distância real até a borda, e a rocha sai igualmente
  // íngreme em todo lugar.
  // Diferença central (e não para frente), para o ponto e o espelhado darem o mesmo.
  const g = Math.hypot(profundidadeRocha(x + 0.5, z) - profundidadeRocha(x - 0.5, z), profundidadeRocha(x, z + 0.5) - profundidadeRocha(x, z - 0.5));
  const g2 = Number.isFinite(g) ? Math.max(g, 0.4) : 1;
  return Math.max(mur, DEGRAU + (1 - DEGRAU) * smoothstep(0, RAMPA, e / g2));
}

/**
 * O ponto é chão navegável (fora das mesas e da muralha)? Bate com o terreno: é
 * exatamente onde paredeAt() vale 0.
 */
export function noMapaAberto(x, z) {
  return paredeAt(x, z) === 0;
}

/**
 * Quanto o chão é aplainado no ponto (0 = plano, 1 = ondulação cheia): bases,
 * corredor e áreas de pouso são planos, para plataformas e estrada assentarem.
 */
function ondulacaoAt(x, z) {
  // Corredor com folga dos lados: a entrega (120 m) e o minério (raio 60) são mais
  // largos que a estrada.
  let k = smoothstep(CORREDOR.largura / 2 + 15, CORREDOR.largura / 2 + 50, Math.abs(x - CORREDOR.x));
  for (const b of BASES) k = Math.min(k, smoothstep(b.raio, b.raio + 40, Math.hypot(x - b.x, z - b.z)));
  for (const a of AREAS_POUSO) k = Math.min(k, smoothstep(a.raio + 4, a.raio + 30, Math.hypot(x - a.x, z - a.z)));
  for (const o of OBJETIVOS) k = Math.min(k, smoothstep(ARENA_C, ARENA_C + 30, Math.hypot(x - o.x, z - o.z)));
  return k;
}

/** Altura do chão em metros no ponto (x, z) do mundo. */
export function heightAt(x, z) {
  const p = paredeAt(x, z);
  const detalhe = fbmSim(x, z, 0.02, 91, 3);
  let h = 0;
  if (p < 1) {
    // Chão: ondulação fina e dunas largas, baixas (nada que a nave não acompanhe).
    const k = ondulacaoAt(x, z);
    if (k > 0) h += (1 - p) * k * (detalhe * 2.5 + fbmSim(x, z, 0.004, 17, 2) * 7);
  }
  if (p > 0) {
    // Mesa: o alto varia devagar de uma mesa para outra.
    const topo = WALL_HEIGHT * (0.75 + 0.55 * fbmSim(x, z, 0.003, 61, 2)) + detalhe * 14;
    h += p * topo;
  }
  // Borda do mapa: a muralha sobe mais que as mesas, para ninguém cair do mundo.
  h += muralhaAt(x, z) * 90;
  return h;
}
