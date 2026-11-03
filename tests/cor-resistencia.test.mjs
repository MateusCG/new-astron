// Cor do nick pela resistência (public/js/cor-resistencia.js), como no original:
// branco sem resistência, verde Ph., vermelho Op., azul El., e a mescla na proporção.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { corResistencia, CORES_RESIST, RES_COR_CHEIA, resistDoMe } from '../public/js/cor-resistencia.js';

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const hex = (c) => '#' + c.map((x) => x.toString(16).padStart(2, '0')).join('');

test('cor da resistência: sem nenhuma é branco; um tipo forte é a cor dele', () => {
  assert.equal(corResistencia(null), '#ffffff');
  assert.equal(corResistencia([0, 0, 0]), '#ffffff');
  assert.equal(corResistencia([RES_COR_CHEIA, 0, 0]), hex(CORES_RESIST[0]), 'Ph. verde');
  assert.equal(corResistencia([0, 0.9, 0]), hex(CORES_RESIST[1]), 'Op. vermelho');
  assert.equal(corResistencia([0, 0, 0.6]), hex(CORES_RESIST[2]), 'El. azul');
});

test('cor da resistência: pouca resistência fica perto do branco, e a mistura segue a proporção', () => {
  const fraca = rgb(corResistencia([0, 0, 0.1]));
  const forte = rgb(corResistencia([0, 0, 0.5]));
  assert.ok(fraca[0] > forte[0] && fraca[1] > forte[1], 'menos resistência, mais branco');
  // 50% El. e 30% Op.: mais azul que vermelho, mas com vermelho.
  const [r, , b] = rgb(corResistencia([0, 0.3, 0.5]));
  const [rEl, , bEl] = rgb(corResistencia([0, 0, 0.8]));
  assert.ok(r > rEl && b < bEl + 1, `puxa para o vermelho (${r} > ${rEl})`);
  // As três iguais: a média das três cores.
  const media = [0, 1, 2].map((c) => Math.round((CORES_RESIST[0][c] + CORES_RESIST[1][c] + CORES_RESIST[2][c]) / 3));
  assert.deepEqual(rgb(corResistencia([0.3, 0.3, 0.3])), media);
});

test('resistência de agora (a coluna Resist. do STATUS e do INVENTÁRIO): o `res` do me, com a Tenda e a quebra, e não só o equipamento', () => {
  // O print do Mateus: Ph. 37%, El. 7%, Op. 15% do equipamento; com a Tenda V8 (+250%)
  // a Op. vai a 52,5%: a janela tem que mostrar 52,5, não 15.
  const status = { resist: { fisico: 0.37, laser: 0.15, eletrico: 0.07 } };
  assert.deepEqual(resistDoMe({ status, res: [0.37, 0.525, 0.07] }), { fisico: 0.37, laser: 0.525, eletrico: 0.07 });
  // Disjuntor ligado (+40 pontos de El.) e a Op. zerada pelo Canhão Amplificador.
  assert.deepEqual(resistDoMe({ status, res: [0.37, 0, 0.47] }), { fisico: 0.37, laser: 0, eletrico: 0.47 });
  // res null = nenhuma (tudo quebrado ou nada equipado), mesmo com o status do equipamento.
  assert.deepEqual(resistDoMe({ status, res: null }), { fisico: 0, laser: 0, eletrico: 0 });
  // Sem o campo (estado antigo), cai no do equipamento; sem nada, zero.
  assert.deepEqual(resistDoMe({ status }), status.resist);
  assert.deepEqual(resistDoMe(null), { fisico: 0, laser: 0, eletrico: 0 });
});
