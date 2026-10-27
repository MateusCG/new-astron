// Troca rápida (Q e E), como no original: as duas primeiras casas do compartimento
// guardam uma arma cada; Q troca a arma do Z pela guardada no Q (a que sai do Z fica
// guardada), E o mesmo com o X. As contas puras ficam em shared/loja.js (o cliente,
// public/js/armas.js, só as chama); o servidor vê só os encaixes do comando.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TROCA_RAPIDA, limparTrocaRapida, guardarNaTrocaRapida, equiparArmaRapida } from '../shared/loja.js';

// Instâncias de arma como s.armasInst: [id, índice, nível].
const INSTS = [
  [1, 10, 1],
  [2, 11, 1],
  [3, 12, 2],
  [4, 13, 1],
];

test('troca rápida: Q é a casa do Z e E a do X', () => {
  assert.deepEqual(TROCA_RAPIDA, ['Q', 'E']);
});

test('troca rápida: Q troca o Z pela guardada, e a que sai fica guardada (apertar de novo desfaz)', () => {
  let estado = { encInst: [1, 2], casas: [3, 4] };
  estado = equiparArmaRapida(estado.encInst, estado.casas, 0, estado.casas[0]);
  assert.deepEqual(estado, { encInst: [3, 2], casas: [1, 4] });
  estado = equiparArmaRapida(estado.encInst, estado.casas, 0, estado.casas[0]);
  assert.deepEqual(estado, { encInst: [1, 2], casas: [3, 4] });
  // E faz o mesmo com o X, sem mexer no Z.
  estado = equiparArmaRapida(estado.encInst, estado.casas, 1, estado.casas[1]);
  assert.deepEqual(estado, { encInst: [1, 4], casas: [3, 2] });
});

test('troca rápida: equipar a arma de uma casa no outro encaixe deixa a que sai nessa casa', () => {
  // A do Q vai para o X (pelo INVENTÁRIO): a do X fica no Q.
  assert.deepEqual(equiparArmaRapida([1, 2], [3, null], 1, 3), { encInst: [1, 3], casas: [2, null] });
  // Arma solta do compartimento: as casas não mudam.
  assert.deepEqual(equiparArmaRapida([1, 2], [3, null], 0, 4), { encInst: [4, 2], casas: [3, null] });
  // A do outro encaixe: Z e X trocam de lugar.
  assert.deepEqual(equiparArmaRapida([1, 2], [3, null], 0, 2), { encInst: [2, 1], casas: [3, null] });
});

test('troca rápida: guardar na casa ocupada substitui; guardar a da outra casa troca as duas', () => {
  assert.deepEqual(guardarNaTrocaRapida([null, null], 0, 3), [3, null]);
  assert.deepEqual(guardarNaTrocaRapida([3, null], 0, 4), [4, null]);
  assert.deepEqual(guardarNaTrocaRapida([3, 4], 0, 4), [4, 3]);
  assert.deepEqual(guardarNaTrocaRapida([3, 4], 1, null), [3, null]);
});

test('troca rápida: casa com arma vendida, equipada ou repetida esvazia', () => {
  assert.deepEqual(limparTrocaRapida([3, 4], INSTS, [1, 2]), [3, 4]);
  assert.deepEqual(limparTrocaRapida([9, 4], INSTS, [1, 2]), [null, 4], 'vendida');
  assert.deepEqual(limparTrocaRapida([3, 4], INSTS, [3, 2]), [null, 4], 'foi para o Z');
  assert.deepEqual(limparTrocaRapida([3, 3], INSTS, [1, 2]), [3, null], 'a mesma nas duas');
  assert.deepEqual(limparTrocaRapida([3, 4], [], [-1, -1]), [null, null], 'partida nova');
});
