// Divisórias da barra de vida em cima das naves de jogador, da Medusa e do Núcleo
// (public/js/barra-vida-regras.js), como no LoL: uma a cada mil de vida.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { marcasDaVida, MARCA_HP, MARCA_GROSSA_HP } from '../public/js/barra-vida-regras.js';

test('barra de vida: uma divisória a cada mil, em % da largura', () => {
  assert.equal(MARCA_HP, 1000);
  assert.deepEqual(marcasDaVida(4000), { passo: 25, grossa: null }, '4 blocos');
  assert.deepEqual(marcasDaVida(2500), { passo: 40, grossa: null }, 'o último bloco é o que sobra');
  assert.equal(marcasDaVida(1000), null, 'até mil, sem divisória');
  assert.equal(marcasDaVida(850), null);
  for (const ruim of [0, -5, NaN, undefined, null, 'x']) assert.equal(marcasDaVida(ruim), null, String(ruim));
});

test('barra de vida: nos chefes, uma divisória grossa a cada dez mil', () => {
  assert.equal(MARCA_GROSSA_HP, 10000);
  assert.equal(marcasDaVida(10000).grossa, null);
  const medusa = marcasDaVida(60000);
  assert.ok(Math.abs(medusa.passo - 100 / 60) < 1e-3);
  assert.ok(Math.abs(medusa.grossa - 100 / 6) < 1e-3);
});

test('barra de vida: o hud põe as divisórias nas naves de jogador e nos chefes', () => {
  const hud = readFileSync(new URL('../public/js/hud.js', import.meta.url), 'utf8');
  assert.match(hud, /marcasDaVida\(maxHp\)/);
  assert.match(hud, /\(piloto \|\| torre \|\| chefe\)/);
  assert.match(hud, /piloto \|\| torre \? ' vida-piloto'/, 'a torreta com a barra das naves');
  const torretas = readFileSync(new URL('../public/js/torretas.js', import.meta.url), 'utf8');
  assert.match(torretas, /torre: true/);
  const main = readFileSync(new URL('../public/js/main.js', import.meta.url), 'utf8');
  // Chefes: a Medusa, o Núcleo, o SN-4, a torre de suporte e a sonda errante.
  assert.match(main, /const chefe = e\.tipo === 'nucleo' \|\| e\.tipo === 'suporte' \|\| CHEFES_JUNGLE\.has\(e\.esp\);/);
  assert.match(main, /const CHEFES_JUNGLE = new Set\(\['medusa', 'sn4', 'sonda'\]\);/);
  const css = readFileSync(new URL('../public/css/jogo.css', import.meta.url), 'utf8');
  for (const sel of ['.rotulo.vida-piloto .barra', '.rotulo.chefe .barra', '.rotulo .barra.marcas::after', '.rotulo .barra.marcas-grossas::before']) assert.ok(css.includes(sel), sel);
});

test('barra de vida: com o chefe na tela, a faixa do objetivo some e o texto dela vira o nome dele', () => {
  const main = readFileSync(new URL('../public/js/main.js', import.meta.url), 'utf8');
  assert.match(main, /chefesComBarra\.add\(idObjetivo\)/);
  assert.match(main, /objetivos\.barraNoChefe\(chefesComBarra\)/);
  assert.match(main, /objetivos\.textoDoChefe\(idObjetivo\)\) \|\| e\.nome/, 'o nome do chefe é o texto da faixa');
  const obj = readFileSync(new URL('../public/js/objetivos.js', import.meta.url), 'utf8');
  assert.match(obj, /if \(this\.comBarraPropria\?\.has\(o\.id\)\) \{\s*el\.hidden = true;/, 'a faixa some com o chefe na tela');
  // A do Núcleo acima da cúpula.
  assert.match(main, /ROTULO_NUCLEO = ESCUDO\.centroY \+ ESCUDO\.raio/);
});

test('rótulos: a Medusa e o Núcleo só com o nome (e o nível do Núcleo), sem o bônus', () => {
  const obj = readFileSync(new URL('../public/js/objetivos.js', import.meta.url), 'utf8');
  assert.ok(!obj.includes('bônus do time'));
  assert.ok(!obj.includes('onda de mineradores'));
});
