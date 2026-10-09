// Terreno do mapa M1 (cânion do deserto), compartilhado entre servidor e cliente.
//
// O servidor usa heightAt() para decidir colisão de nave e de tiro com as paredes;
// o cliente usa a mesmíssima função para montar a malha 3D e para a predição local.
// Por isso o ruído é determinístico (hash inteiro, sem Math.random) e o arquivo não
// importa nada de Three.js: qualquer diferença aqui faria o cliente "atravessar"
// paredes que o servidor considera sólidas.
//
// Os cânions saem das curvas de nível de dois campos de ruído: perto do valor médio
// de qualquer um deles o chão desce; longe, sobe um planalto. Uma curva de nível
// sozinha forma laços fechados; duas se cruzam e viram uma rede de corredores
// ligados, que é o que dá a cara de labirinto dos mapas de missão do AstroN.

export const MAP_HALF = 1000;
export const WALL_HEIGHT = 70;
export const BASE = { x: 0, z: 0, raio: 140 };
const CORREDOR_FIM = -600;

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

export function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * Quanto um ponto é "parede" (0 = fundo do cânion, 1 = planalto). Exportado para o
 * cliente pintar o terreno e posicionar cenário só nos corredores.
 */
export function paredeAt(x, z) {
  const n1 = Math.abs(fbm(x * 0.0021, z * 0.0021, 7) - 0.5);
  const n2 = Math.abs(fbm(x * 0.0019 + 40, z * 0.0019 - 13, 23) - 0.5);
  const a = Math.min(n1, n2);
  let p = smoothstep(0.05, 0.075, a);
  // A base de partida é uma bacia aberta, e dela sai um corredor reto para o norte
  // até cruzar a rede de cânions: assim quem nasce nunca fica preso num buraco.
  const dBase = Math.hypot(x - BASE.x, z - BASE.z);
  p *= smoothstep(BASE.raio, BASE.raio + 90, dBase);
  if (z < BASE.z && z > CORREDOR_FIM) p *= smoothstep(22, 60, Math.abs(x - BASE.x));
  return p;
}

/** Altura do chão em metros no ponto (x, z) do mundo. */
export function heightAt(x, z) {
  const p = paredeAt(x, z);
  const detalhe = fbm(x * 0.02, z * 0.02, 91, 3);
  let h = p * (WALL_HEIGHT + detalhe * 18) + (1 - p) * detalhe * 2.5;
  // Borda do mapa: sobe uma muralha para ninguém cair do mundo.
  const borda = Math.max(Math.abs(x), Math.abs(z));
  h += smoothstep(MAP_HALF - 80, MAP_HALF, borda) * 140;
  return h;
}
