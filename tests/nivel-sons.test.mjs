// Nível dos sons (public/js/nivel-sons.js): todo arquivo de public/sons/ tem categoria, a
// medida bate com a do BS.1770 e, com o ganho, cada som fica no volume da categoria.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ALVO_CATEGORIA,
  ALVO_POR_SOM,
  CATEGORIA_DO_SOM,
  NIVEL_GANHO_MAX,
  alvoDoSom,
  ganhoDeNivel,
  loudnessMaxima,
} from '../public/js/nivel-sons.js';

const SONS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public/sons');
const ARQUIVOS = readdirSync(SONS)
  .filter((f) => f.endsWith('.wav'))
  .map((f) => f.slice(0, -4));

/** WAV PCM de 16 bits → { canais: Float32Array[], fs }. */
function lerWav(nome) {
  const b = readFileSync(path.join(SONS, nome + '.wav'));
  let i = 12;
  let fmt = null;
  while (i + 8 <= b.length) {
    const id = b.toString('ascii', i, i + 4);
    const tam = b.readUInt32LE(i + 4);
    if (id === 'fmt ') fmt = { ch: b.readUInt16LE(i + 10), fs: b.readUInt32LE(i + 12), bits: b.readUInt16LE(i + 22) };
    if (id === 'data') {
      assert.equal(fmt?.bits, 16, nome);
      const n = Math.floor(tam / 2 / fmt.ch);
      const canais = Array.from({ length: fmt.ch }, () => new Float32Array(n));
      for (let k = 0; k < n; k++) for (let c = 0; c < fmt.ch; c++) canais[c][k] = b.readInt16LE(i + 8 + (k * fmt.ch + c) * 2) / 32768;
      return { canais, fs: fmt.fs };
    }
    i += 8 + tam + (tam % 2);
  }
  throw new Error(`${nome}: WAV sem dados`);
}

test('nivel-sons: todo som de public/sons/ tem categoria, e toda categoria tem alvo', () => {
  for (const nome of ARQUIVOS) assert.ok(Object.hasOwn(CATEGORIA_DO_SOM, nome), `${nome} sem categoria`);
  for (const nome of Object.keys(CATEGORIA_DO_SOM)) assert.ok(ARQUIVOS.includes(nome), `${nome} não existe`);
  for (const cat of Object.values(CATEGORIA_DO_SOM)) assert.ok(cat === null || cat in ALVO_CATEGORIA, cat);
  for (const nome of Object.keys(ALVO_POR_SOM)) assert.ok(ARQUIVOS.includes(nome), nome);
});

test('nivel-sons: a medida bate com a loudness momentânea do BS.1770', () => {
  // Medidos à parte, em Python, pelo mesmo método (curva K, janela de 400 ms, passo de 100 ms).
  const medidos = { shot_ray: -15.4, shot_ray3_5: -7.9, shot_ct: -8.0, g_impact: -18.7, click: -32.9, h_explo: -10.7 };
  for (const [nome, lufs] of Object.entries(medidos)) {
    const { canais, fs } = lerWav(nome);
    assert.ok(Math.abs(loudnessMaxima(canais, fs) - lufs) < 0.2, `${nome}: ${loudnessMaxima(canais, fs)}`);
  }
  assert.equal(loudnessMaxima([new Float32Array(1000)], 22050), -Infinity, 'silêncio');
  assert.equal(loudnessMaxima([], 22050), -Infinity);
});

test('nivel-sons: com o ganho, cada som fica no alvo dele', () => {
  for (const nome of ARQUIVOS) {
    const { canais, fs } = lerWav(nome);
    const lufs = loudnessMaxima(canais, fs);
    const g = ganhoDeNivel(nome, lufs);
    const alvo = alvoDoSom(nome);
    if (alvo === null) {
      assert.equal(g, 1, `${nome} toca como o arquivo`);
      continue;
    }
    assert.ok(g < NIVEL_GANHO_MAX, `${nome} precisaria de mais que o teto`);
    assert.ok(Math.abs(lufs + 20 * Math.log10(g) - alvo) < 0.01, nome);
  }
  // O tiro de fábrica e o da mesma linha que era 7,5 dB mais alto agora batem.
  const nivel = (n) => {
    const { canais, fs } = lerWav(n);
    const l = loudnessMaxima(canais, fs);
    return l + 20 * Math.log10(ganhoDeNivel(n, l));
  };
  assert.ok(Math.abs(nivel('shot_ray') - nivel('shot_ray3_5')) < 0.01);
  assert.ok(nivel('h_explo') > nivel('shot_ray'), 'a nave destruída acima do tiro');
  assert.ok(nivel('shot_ray') > nivel('g_impact'), 'o tiro acima do impacto');
});

test('nivel-sons: o de subir de nível fica 70% abaixo do arquivo do original (pedido de 29/out/2026)', () => {
  const { canais, fs } = lerWav('level_up');
  const g = ganhoDeNivel('level_up', loudnessMaxima(canais, fs));
  assert.ok(Math.abs(g - 0.3) < 0.02, String(g));
});

test('nivel-sons: som sem alvo ou silêncio fica com o volume do arquivo', () => {
  assert.equal(ganhoDeNivel('nao_existe', -30), 1);
  assert.equal(ganhoDeNivel('constructor', -30), 1);
  assert.equal(ganhoDeNivel('shot_ray', -Infinity), 1);
  assert.equal(ganhoDeNivel('volta_canal', -10), 1);
  assert.equal(ganhoDeNivel('click', -80), NIVEL_GANHO_MAX, 'o ganho tem teto');
});
