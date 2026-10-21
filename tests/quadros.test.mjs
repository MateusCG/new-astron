import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarLimitador, FPS_ALVO } from '../public/js/quadros.js';

/** Quantos quadros o limitador desenha em `s` segundos num monitor de `hz`, com tremido de ±`tremido` ms. */
function desenhados(hz, s = 5, tremido = 0) {
  const lim = criarLimitador();
  let n = 0;
  let semente = 7;
  const total = Math.round(hz * s);
  for (let i = 0; i < total; i++) {
    semente = (semente * 16807) % 2147483647;
    const ruido = ((semente / 2147483647) * 2 - 1) * tremido;
    if (lim.deveDesenhar(1000 + (i * 1000) / hz + ruido)) n++;
  }
  return n / s;
}

test('quadros: o jogo desenha a 30 fps em monitores de 60 a 240 Hz', () => {
  assert.equal(FPS_ALVO, 30);
  for (const hz of [60, 75, 120, 144, 165, 240]) {
    for (const tremido of [0, 1.5]) {
      const fps = desenhados(hz, 5, tremido);
      assert.ok(Math.abs(fps - 30) <= 0.6, `${hz} Hz (tremido ${tremido} ms): ${fps} fps`);
    }
  }
});

test('quadros: monitor de 30 Hz ou menos desenha todo quadro; aba parada recomeça sem rajada', () => {
  assert.ok(Math.abs(desenhados(30) - 30) <= 0.4);
  assert.ok(Math.abs(desenhados(24) - 24) <= 0.4);
  const lim = criarLimitador();
  assert.ok(lim.deveDesenhar(0));
  assert.ok(lim.deveDesenhar(5000), 'voltou depois de 5 s: desenha');
  assert.ok(!lim.deveDesenhar(5016.7), 'e não tenta recuperar os quadros perdidos');
  assert.ok(lim.deveDesenhar(5033.4));
});
