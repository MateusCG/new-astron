// Arrastar e soltar no INVENTÁRIO (public/js/inventario-regras.js): cada encaixe só
// aceita o que é dele (arma no Z, no X e nas casas Q/E; escudo no Escudo; armadura na
// Armadura; potenciador no 1 ou no 2) e soltar no compartimento tira da nave.
import test from 'node:test';
import assert from 'node:assert/strict';
import { jogadaDoArrasto } from '../public/js/inventario-regras.js';
import { EQUIPAMENTOS, SLOTS_EQUIP } from '../shared/equipamentos.js';

const ESCUDO = 'e330010';
const ARMADURA = 'e320012';
const POT = 'e340001';

const arma = (id, de = { comp: true }) => ({ inst: { id, tipo: 'arma', chave: 'o311001' }, ...de });
const equip = (id, chave, de = { comp: true }) => ({ inst: { id, tipo: 'equip', chave }, categoria: EQUIPAMENTOS[chave].categoria, ...de });

test('os itens de teste são de cada categoria', () => {
  assert.equal(EQUIPAMENTOS[ESCUDO].categoria, 'escudo');
  assert.equal(EQUIPAMENTOS[ARMADURA].categoria, 'armadura');
  assert.equal(EQUIPAMENTOS[POT].categoria, 'potenciador');
});

test('escudo só entra no encaixe de escudo, armadura no de armadura, potenciador no 1 e no 2', () => {
  const casos = [
    [equip(5, ESCUDO), ['escudo']],
    [equip(6, ARMADURA), ['armadura']],
    [equip(7, POT), ['pot1', 'pot2']],
  ];
  for (const [origem, aceita] of casos) {
    for (const slot of [...SLOTS_EQUIP, 'z', 'x']) {
      const j = jogadaDoArrasto(origem, { slot });
      if (aceita.includes(slot)) assert.deepEqual(j, { acao: 'equipar', slot, inst: origem.inst.id }, `${origem.inst.chave} em ${slot}`);
      else assert.equal(j, null, `${origem.inst.chave} não entra em ${slot}`);
    }
    assert.equal(jogadaDoArrasto(origem, { casa: 0 }), null, 'equipamento não vai na troca rápida');
  }
});

test('arma entra no Z e no X (e troca de lado) e nas casas da troca rápida, nunca nos de equipamento', () => {
  assert.deepEqual(jogadaDoArrasto(arma(3), { slot: 'z' }), { acao: 'arma', enc: 0, inst: 3 });
  assert.deepEqual(jogadaDoArrasto(arma(3), { slot: 'x' }), { acao: 'arma', enc: 1, inst: 3 });
  for (const slot of SLOTS_EQUIP) assert.equal(jogadaDoArrasto(arma(3), { slot }), null);
  assert.deepEqual(jogadaDoArrasto(arma(3), { casa: 1 }), { acao: 'guardar', casa: 1, inst: 3 });
  // Do Z para o X: as duas trocam (ArmasNave.equipar faz a troca).
  assert.deepEqual(jogadaDoArrasto(arma(1, { slot: 'z' }), { slot: 'x' }), { acao: 'arma', enc: 1, inst: 1 });
  // Da casa para o encaixe: a que sai fica guardada nela.
  assert.deepEqual(jogadaDoArrasto(arma(4, { casa: 0 }), { slot: 'x' }), { acao: 'arma', enc: 1, inst: 4 });
  // De uma casa para a outra.
  assert.deepEqual(jogadaDoArrasto(arma(4, { casa: 0 }), { casa: 1 }), { acao: 'guardar', casa: 1, inst: 4 });
});

test('a arma do Z/X não sai da nave sozinha: na casa, só troca com a guardada', () => {
  assert.equal(jogadaDoArrasto(arma(1, { slot: 'z' }), { casa: 0, ocupante: null }), null);
  assert.deepEqual(jogadaDoArrasto(arma(1, { slot: 'z' }), { casa: 1, ocupante: 9 }), { acao: 'arma', enc: 0, inst: 9 });
  assert.equal(jogadaDoArrasto(arma(1, { slot: 'x' }), { comp: true }), null);
});

test('soltar no compartimento tira o equipamento da nave e esvazia a casa', () => {
  assert.deepEqual(jogadaDoArrasto(equip(5, ESCUDO, { slot: 'escudo' }), { comp: true }), { acao: 'equipar', slot: 'escudo', inst: null });
  assert.deepEqual(jogadaDoArrasto(equip(7, POT, { slot: 'pot2' }), { comp: true }), { acao: 'equipar', slot: 'pot2', inst: null });
  assert.deepEqual(jogadaDoArrasto(arma(4, { casa: 1 }), { comp: true }), { acao: 'guardar', casa: 1, inst: null });
  assert.equal(jogadaDoArrasto(equip(5, ESCUDO), { comp: true }), null, 'do compartimento para ele mesmo: nada');
});

test('potenciador passa do 1 para o 2; soltar no mesmo lugar não faz nada', () => {
  assert.deepEqual(jogadaDoArrasto(equip(7, POT, { slot: 'pot1' }), { slot: 'pot2' }), { acao: 'equipar', slot: 'pot2', inst: 7 });
  assert.equal(jogadaDoArrasto(equip(7, POT, { slot: 'pot1' }), { slot: 'pot1' }), null);
  assert.equal(jogadaDoArrasto(arma(1, { slot: 'z' }), { slot: 'z' }), null);
  assert.equal(jogadaDoArrasto(arma(4, { casa: 0 }), { casa: 0 }), null);
  assert.equal(jogadaDoArrasto(null, { slot: 'z' }), null);
  assert.equal(jogadaDoArrasto(arma(1), null), null);
});
