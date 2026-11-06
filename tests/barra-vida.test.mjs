// Divisórias da barra de vida em cima das naves de jogador, da Medusa e do Núcleo
// (public/js/barra-vida-regras.js), como no LoL: a cada mil nas naves, a cada dez mil
// nos chefes.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { marcasDaVida, MARCA_HP, MARCA_CHEFE_HP } from '../public/js/barra-vida-regras.js';

test('barra de vida: nas naves, uma divisória a cada mil, em % da largura', () => {
  assert.equal(MARCA_HP, 1000);
  assert.deepEqual(marcasDaVida(4000), { passo: 25 }, '4 blocos');
  assert.deepEqual(marcasDaVida(2500), { passo: 40 }, 'o último bloco é o que sobra');
  assert.equal(marcasDaVida(1000), null, 'até mil, sem divisória');
  assert.equal(marcasDaVida(850), null);
  for (const ruim of [0, -5, NaN, undefined, null, 'x']) assert.equal(marcasDaVida(ruim), null, String(ruim));
});

test('barra de vida: nos chefes, uma divisória a cada dez mil', () => {
  assert.equal(MARCA_CHEFE_HP, 10000);
  assert.ok(Math.abs(marcasDaVida(60000, MARCA_CHEFE_HP).passo - 100 / 6) < 1e-3, 'Medusa: 6 blocos');
  assert.ok(Math.abs(marcasDaVida(30000, MARCA_CHEFE_HP).passo - 100 / 3) < 1e-3, 'Núcleo: 3 blocos');
  assert.equal(marcasDaVida(10000, MARCA_CHEFE_HP), null);
});

test('barra de vida: o hud põe as divisórias nas naves de jogador e nos chefes', () => {
  const hud = readFileSync(new URL('../public/js/hud.js', import.meta.url), 'utf8');
  assert.match(hud, /marcasDaVida\(maxHp, chefe \? MARCA_CHEFE_HP : MARCA_HP\)/);
  assert.match(hud, /\(piloto \|\| chefe\)/);
  const main = readFileSync(new URL('../public/js/main.js', import.meta.url), 'utf8');
  assert.match(main, /chefe: e\.tipo === 'nucleo' \|\| e\.esp === 'medusa'/);
  assert.match(main, /ROTULO_NUCLEO = ESCUDO\.centroY \+ ESCUDO\.raio/, 'o rótulo do Núcleo acima da cúpula');
  assert.match(main, /e\.tipo === 'nucleo'\) pos = .*ROTULO_NUCLEO/);
  const css = readFileSync(new URL('../public/css/jogo.css', import.meta.url), 'utf8');
  for (const sel of ['.rotulo.vida-piloto .barra', '.rotulo.chefe .barra', '.rotulo .barra.marcas::after', '.rotulo.chefe .barra.marcas::after']) assert.ok(css.includes(sel), sel);
});
