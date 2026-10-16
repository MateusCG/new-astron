// Visão do time (névoa de guerra estilo MOBA), compartilhada entre servidor e cliente.
//
// O servidor usa para filtrar o snapshot (só vai ao cliente o que algum aliado
// enxerga) e o cliente usa a mesma conta para desenhar a névoa. Tudo é 2D (planta
// vista de cima): o que bloqueia a visão (rochas e mineradora) é mais alto que o voo,
// então a altura não importa.
//
// Regras:
// - cada olho vê até um raio (VISAO_RAIO para nave, VISAO_TORRETA para torre
//   sentinela; a base vê o próprio bolsão, VISAO_BASE do centro);
// - rocha (ROCHAS de shared/terrain.js: a borda, as rochas dos quadrantes e as paredes
//   em L) e a mineradora cortam a linha de visão;
// - campo de asteroides esconde: quem está dentro de um campo só é visto por quem
//   está dentro do MESMO campo, ou por quem está a até VISAO_ASTEROIDE_PERTO dele
//   (encostado não fica invisível). Tiro atravessa asteroide; só a visão muda.
//
// Precisa ser rápida (o servidor testa muitos pares por tick): é teste de segmento
// contra as formas analíticas da planta (cápsula, retângulo arredondado e a região
// aberta), sem amostrar a linha. Determinística, sem relógio e sem Math.random.
//
// Aproximação conhecida: na borda, os encontros da jungle com a lane (onde a quina da
// rocha é arredondada na física, raio ABERTO.canto) contam como quina viva. Uma linha
// que passe raspando nessa quina é dada como bloqueada; a diferença é de poucos metros
// numa área de ~350 m².

import { ROCHAS, MINERADORA, BASES, emAsteroides } from './terrain.js';

/** Raio de visão de uma nave (a arma de maior alcance, a Lâmina Giratória, vai a 548 m). */
export const VISAO_RAIO = 550;
/** Raio de visão da torre sentinela (o mesmo do alcance dela). */
export const VISAO_TORRETA = 560;
/** Raio de visão da base, do centro: cobre o bolsão inteiro (o canto mais longe fica a ~241 m). */
export const VISAO_BASE = 250;
/** Quem está a até esta distância de um alvo escondido num campo de asteroides o vê. */
export const VISAO_ASTEROIDE_PERTO = 60;

const EPS = 1e-9;

// ---------- Geometria de segmento ----------

/** Distância do ponto (px, pz) ao segmento a-b. */
function distPontoSegmento(px, pz, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz;
  const t = l2 > 0 ? Math.min(1, Math.max(0, ((px - ax) * dx + (pz - az) * dz) / l2)) : 0;
  return Math.hypot(px - ax - dx * t, pz - az - dz * t);
}

function orient(ax, az, bx, bz, cx, cz) {
  return (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
}

/** Os segmentos p1-p2 e q1-q2 se cruzam (ou se tocam)? */
function segmentosCruzam(p1x, p1z, p2x, p2z, q1x, q1z, q2x, q2z) {
  const d1 = orient(q1x, q1z, q2x, q2z, p1x, p1z);
  const d2 = orient(q1x, q1z, q2x, q2z, p2x, p2z);
  const d3 = orient(p1x, p1z, p2x, p2z, q1x, q1z);
  const d4 = orient(p1x, p1z, p2x, p2z, q2x, q2z);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** Distância entre os segmentos p1-p2 e q1-q2 (0 se cruzam). */
function distSegmentos(p1x, p1z, p2x, p2z, q1x, q1z, q2x, q2z) {
  if (segmentosCruzam(p1x, p1z, p2x, p2z, q1x, q1z, q2x, q2z)) return 0;
  return Math.min(
    distPontoSegmento(p1x, p1z, q1x, q1z, q2x, q2z),
    distPontoSegmento(p2x, p2z, q1x, q1z, q2x, q2z),
    distPontoSegmento(q1x, q1z, p1x, p1z, p2x, p2z),
    distPontoSegmento(q2x, q2z, p1x, p1z, p2x, p2z),
  );
}

/**
 * Pedaço [t0, t1] do segmento (x1, z1) + t·(dx, dz), t ∈ [0, 1], dentro do retângulo
 * alinhado [x0, x1r] × [z0, z1r] (Liang–Barsky), ou null se não entra.
 */
function clipRetangulo(x1, z1, dx, dz, rx0, rx1, rz0, rz1) {
  let t0 = 0;
  let t1 = 1;
  const p = [-dx, dx, -dz, dz];
  const q = [x1 - rx0, rx1 - x1, z1 - rz0, rz1 - z1];
  for (let i = 0; i < 4; i++) {
    if (Math.abs(p[i]) < EPS) {
      if (q[i] < 0) return null;
      continue;
    }
    const r = q[i] / p[i];
    if (p[i] < 0) {
      if (r > t1) return null;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return null;
      if (r < t1) t1 = r;
    }
  }
  return [t0, t1];
}

/** Pedaço [t0, t1] do segmento dentro do círculo (cx, cz, r), ou null. */
function clipCirculo(x1, z1, dx, dz, cx, cz, r) {
  const fx = x1 - cx;
  const fz = z1 - cz;
  const a = dx * dx + dz * dz;
  const b = 2 * (fx * dx + fz * dz);
  const c = fx * fx + fz * fz - r * r;
  if (a < EPS) return c <= 0 ? [0, 1] : null;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const s = Math.sqrt(disc);
  const t0 = Math.max(0, (-b - s) / (2 * a));
  const t1 = Math.min(1, (-b + s) / (2 * a));
  return t0 <= t1 ? [t0, t1] : null;
}

/**
 * Distância do segmento ao retângulo arredondado (centro, meias medidas e canto)
 * menos o canto: ≤ 0 se o segmento toca a forma.
 */
function sdSegmentoRetangulo(x1, z1, x2, z2, cx, cz, meiaX, meiaZ, canto) {
  const ix = meiaX - canto;
  const iz = meiaZ - canto;
  const rx0 = cx - ix;
  const rx1 = cx + ix;
  const rz0 = cz - iz;
  const rz1 = cz + iz;
  if (clipRetangulo(x1, z1, x2 - x1, z2 - z1, rx0, rx1, rz0, rz1)) return -canto;
  const fora = (px, pz) => Math.hypot(Math.max(rx0 - px, 0, px - rx1), Math.max(rz0 - pz, 0, pz - rz1));
  return (
    Math.min(
      fora(x1, z1),
      fora(x2, z2),
      distPontoSegmento(rx0, rz0, x1, z1, x2, z2),
      distPontoSegmento(rx1, rz0, x1, z1, x2, z2),
      distPontoSegmento(rx0, rz1, x1, z1, x2, z2),
      distPontoSegmento(rx1, rz1, x1, z1, x2, z2),
    ) - canto
  );
}

/**
 * Pedaço [t0, t1] do segmento dentro do retângulo arredondado centrado na origem (a
 * forma é convexa, então é um intervalo só): a união da cruz (dois retângulos) com os
 * quatro círculos dos cantos.
 */
function clipRetanguloArredondado(x1, z1, dx, dz, meiaX, meiaZ, canto) {
  const ix = meiaX - canto;
  const iz = meiaZ - canto;
  const pedacos = [
    clipRetangulo(x1, z1, dx, dz, -meiaX, meiaX, -iz, iz),
    clipRetangulo(x1, z1, dx, dz, -ix, ix, -meiaZ, meiaZ),
    clipCirculo(x1, z1, dx, dz, ix, iz, canto),
    clipCirculo(x1, z1, dx, dz, -ix, iz, canto),
    clipCirculo(x1, z1, dx, dz, ix, -iz, canto),
    clipCirculo(x1, z1, dx, dz, -ix, -iz, canto),
  ];
  let t0 = Infinity;
  let t1 = -Infinity;
  for (const p of pedacos) {
    if (!p) continue;
    if (p[0] < t0) t0 = p[0];
    if (p[1] > t1) t1 = p[1];
  }
  return t0 <= t1 ? [t0, t1] : null;
}

/** O segmento sai da região aberta (a jungle ∪ a faixa da lane)? */
function cortaBorda(b, x1, z1, x2, z2) {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const j = clipRetanguloArredondado(x1, z1, dx, dz, b.jungle.meiaX, b.jungle.meiaZ, b.canto);
  const l = clipRetanguloArredondado(x1, z1, dx, dz, b.lane.meiaX, b.lane.meiaZ, b.canto);
  const cobre = (p) => p && p[0] <= EPS && p[1] >= 1 - EPS;
  if (cobre(j) || cobre(l)) return false;
  if (!j || !l) return true;
  // Os dois pedaços juntos cobrem [0, 1] se encostam um no outro e vão de ponta a ponta.
  const [a, b2] = j[0] <= l[0] ? [j, l] : [l, j];
  return !(a[0] <= EPS && b2[0] <= a[1] + EPS && Math.max(a[1], b2[1]) >= 1 - EPS);
}

/** O segmento toca a rocha interna `r` (cápsula ou retângulo arredondado)? */
function cortaRocha(r, x1, z1, x2, z2) {
  if (r.forma === 'capsula') return distSegmentos(x1, z1, x2, z2, r.ax, r.az, r.bx, r.bz) < r.raio;
  return sdSegmentoRetangulo(x1, z1, x2, z2, r.x, r.z, r.meiaX, r.meiaZ, r.canto) < 0;
}

const BORDA = ROCHAS.find((r) => r.forma === 'borda');
const INTERIORES = ROCHAS.filter((r) => r.forma !== 'borda');
const M = MINERADORA;
const CAIXA_MINERADORA = { x0: M.x - M.meiaX, x1: M.x + M.meiaX, z0: M.z - M.meiaZ, z1: M.z + M.meiaZ };

/**
 * Uma rocha (ROCHAS) ou a mineradora corta a linha de (x1, z1) a (x2, z2)? 2D, sem
 * altura: tudo o que bloqueia é mais alto que o voo.
 */
export function bloqueiaVisao(x1, z1, x2, z2) {
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const minZ = Math.min(z1, z2);
  const maxZ = Math.max(z1, z2);
  const c = CAIXA_MINERADORA;
  if (!(maxX < c.x0 || minX > c.x1 || maxZ < c.z0 || minZ > c.z1)) {
    if (sdSegmentoRetangulo(x1, z1, x2, z2, M.x, M.z, M.meiaX, M.meiaZ, M.canto) < 0) return true;
  }
  for (const r of INTERIORES) {
    const k = r.caixa;
    if (maxX < k.x0 || minX > k.x1 || maxZ < k.z0 || minZ > k.z1) continue;
    if (cortaRocha(r, x1, z1, x2, z2)) return true;
  }
  return cortaBorda(BORDA, x1, z1, x2, z2);
}

/**
 * O olho em (ox, oz) enxerga o alvo em (ax, az), com raio de visão `raio`? Dentro do
 * raio, com a linha livre de rocha e mineradora, e com a regra dos asteroides: alvo
 * dentro de um campo só é visto de dentro do mesmo campo ou de até
 * VISAO_ASTEROIDE_PERTO dele.
 */
export function enxerga(ox, oz, ax, az, raio = VISAO_RAIO) {
  const dx = ax - ox;
  const dz = az - oz;
  const d2 = dx * dx + dz * dz;
  if (d2 > raio * raio) return false;
  const campo = emAsteroides(ax, az);
  if (campo && emAsteroides(ox, oz) !== campo && d2 > VISAO_ASTEROIDE_PERTO * VISAO_ASTEROIDE_PERTO) return false;
  return !bloqueiaVisao(ox, oz, ax, az);
}

/**
 * A base do `time` enxerga o ponto? Ela vê o próprio bolsão (até VISAO_BASE do
 * centro, sem rocha no meio). Asteroide não esconde de base (não há campo perto).
 */
export function baseEnxerga(time, x, z) {
  const b = BASES[time];
  return !!b && enxerga(b.x, b.z, x, z, VISAO_BASE);
}

// ---------- Olhos do time (frente Visão, fase 2) ----------
//
// O time enxerga pela soma dos olhos dele: as naves de jogador vivas (VISAO_RAIO),
// os mineradores e as escoltas (VISAO_MINERADOR: menor, para o minerador avisar que
// tem gente chegando sem virar um radar que cobre a lane inteira), as torres
// sentinela de pé (VISAO_TORRETA) e a base (VISAO_BASE). O servidor monta os olhos
// pelo mundo (server/visao.js) e o cliente pelo snapshot (public/js/nevoa.js), e os
// dois perguntam a algumOlhoVe, então o que a névoa mostra é o que o servidor manda.

/** Raio de visão de minerador e escolta do time (m). */
export const VISAO_MINERADOR = 300;

const PERTO2 = VISAO_ASTEROIDE_PERTO * VISAO_ASTEROIDE_PERTO;

/**
 * Um olho de visão em (x, z) com `raio`: guarda o raio² e o campo de asteroides em
 * que ele está (contado uma vez, não a cada alvo).
 */
export function olho(x, z, raio) {
  return { x, z, raio, r2: raio * raio, campo: emAsteroides(x, z) };
}

/** Os olhos fixos da base do `time` (hoje um só, no centro). */
export function olhosDaBase(time) {
  const b = BASES[time];
  return b ? [olho(b.x, b.z, VISAO_BASE)] : [];
}

/**
 * Algum olho da lista enxerga o ponto (x, z)? A mesma regra de `enxerga` (raio,
 * asteroide, rocha e mineradora), com o teste barato (distância) antes do caro.
 */
export function algumOlhoVe(olhos, x, z) {
  const campo = emAsteroides(x, z);
  for (const o of olhos) {
    const dx = x - o.x;
    const dz = z - o.z;
    const d2 = dx * dx + dz * dz;
    if (d2 > o.r2) continue;
    if (campo && o.campo !== campo && d2 > PERTO2) continue;
    if (!bloqueiaVisao(o.x, o.z, x, z)) return true;
  }
  return false;
}
