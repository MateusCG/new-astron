// Ícones dos itens do original (public/texturas/itens, tools/icones_do_original.py;
// public/js/icones-itens.js): toda arma, todo equipamento e todo consumível que a
// Loja vende tem o ícone do original, o arquivo existe, a tela de carregamento baixa
// todos os da raça e da classe, e o número da versão sai da V2 à V8.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { iconesDaNave, insumosDaPartida, iconeVersao, ICONE_CONSUMIVEL } from '../public/js/insumos.js';
import { htmlIcone } from '../public/js/icones-itens.js';
import { RACAS_JOGAVEIS, ORDEM_CLASSES } from '../shared/naves.js';
import { WEAPONS, ARMAS, armasDisponiveis } from '../shared/armas.js';
import { EQUIPAMENTOS, ORDEM_EQUIP, equipamentosAVenda } from '../shared/equipamentos.js';
import { ORDEM_ITENS } from '../shared/loja.js';

const PASTA = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'texturas', 'itens');
const existe = (nome) => existsSync(path.join(PASTA, `${nome}.png`));

test('ícones: toda arma de jogador, todo equipamento e todo consumível tem o ícone do original', () => {
  for (const kind of ARMAS) {
    const w = WEAPONS[kind];
    if (w.npc) continue;
    assert.match(w.icone ?? '', /^[abs]w\d{3}$/, kind);
    assert.ok(existe(w.icone), `${kind}: ${w.icone}`);
  }
  for (const k of ORDEM_EQUIP) {
    assert.match(EQUIPAMENTOS[k].icone ?? '', /^x[sad]\d{3}$/, k);
    assert.ok(existe(EQUIPAMENTOS[k].icone), `${k}: ${EQUIPAMENTOS[k].icone}`);
  }
  for (const id of ORDEM_ITENS) assert.ok(existe(ICONE_CONSUMIVEL[id]), id);
  for (let v = 2; v <= 8; v++) assert.ok(existe(iconeVersao(v)), `V${v}`);
});

test('ícones: os do original, pelo modelo da arma e pela coluna do cfg do equipamento', () => {
  // Shrewdo: as três primeiras armas da loja (sw001, sw002, sw004 no INVENTÁRIO do original).
  assert.equal(WEAPONS.o311001.icone, 'sw001');
  assert.equal(WEAPONS.o311002.icone, 'sw002');
  assert.equal(WEAPONS.o311003.icone, 'sw004');
  assert.equal(WEAPONS.o111001.icone, 'aw001');
  // Escudo: família × tipo (xs0F2 Ph. verde, xs0F3 El. azul, xs0F4 Op. rosa).
  const porNome = (nome) => Object.values(EQUIPAMENTOS).find((e) => e.nome.trim() === nome);
  assert.equal(porNome('Op. Neutron Shield').icone, 'xs034');
  assert.equal(porNome('Ph. Maximum Shield').icone, 'xs002');
  // Consumíveis: o Hpbattery e o Energybattery do original.
  assert.equal(ICONE_CONSUMIVEL.reparo, 'sp011');
  assert.equal(ICONE_CONSUMIVEL.energia, 'sp012');
});

test('ícones: a tela de carregamento baixa os da raça e da classe, sem repetir, e todo arquivo da pasta é usado', () => {
  const usados = new Set();
  for (const race of RACAS_JOGAVEIS) {
    for (const classe of ORDEM_CLASSES) {
      const lista = iconesDaNave(race, classe);
      assert.equal(new Set(lista).size, lista.length, `${race} ${classe}: repetido`);
      for (const idx of armasDisponiveis(race, classe)) {
        const w = WEAPONS[ARMAS[idx]];
        if (!w.npc) assert.ok(lista.includes(w.icone), `${race} ${classe}: ${w.icone}`);
      }
      for (const k of equipamentosAVenda(classe)) assert.ok(lista.includes(EQUIPAMENTOS[k].icone), `${race} ${classe}: ${k}`);
      for (const id of ORDEM_ITENS) assert.ok(lista.includes(ICONE_CONSUMIVEL[id]));
      for (let v = 2; v <= 8; v++) assert.ok(lista.includes(iconeVersao(v)));
      for (const n of lista) assert.ok(existe(n), n);
      assert.deepEqual(insumosDaPartida(race, classe).icones, lista);
      for (const n of lista) usados.add(n);
    }
  }
  const naPasta = readdirSync(PASTA).filter((f) => f.endsWith('.png')).map((f) => f.slice(0, -4));
  for (const n of naPasta) assert.ok(usados.has(n), `${n}.png sobrando`);
});

test('ícones: o número da versão só da V2 à V8, e o encaixe vazio sem imagem', () => {
  assert.equal(iconeVersao(1), null);
  assert.equal(iconeVersao(9), null);
  assert.equal(iconeVersao(5), 'item_lv5');
  assert.doesNotMatch(htmlIcone('aw001', 1), /item_lv/);
  assert.match(htmlIcone('aw001', 3, 'icone-arma'), /\/texturas\/itens\/aw001\.png.*\/texturas\/itens\/item_lv3\.png/s);
  assert.match(htmlIcone('aw001', 3, 'icone-arma'), /class="icone-item icone-arma"/);
  assert.match(htmlIcone(null, 1, 'icone-equip'), /icone-item vazio icone-equip/);
  assert.doesNotMatch(htmlIcone(null), /<img/);
});

// O original estica a textura de 64 × 64 no botão do item, de 76 × 39 (gameinterface.txt);
// a peça foi desenhada espremida para isso, e em quadrado fica estreita. O CSS dá a
// proporção uma vez (.icone-item) e cada painel só diz a altura (--alt): nenhum
// seletor de ícone pode voltar a fixar largura e altura, senão a figura deforma.
test('ícones: a figura tem a proporção 76 × 39 do botão do original em todo painel', () => {
  const css = readFileSync(path.join(PASTA, '..', '..', 'css', 'jogo.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const regras = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map(([, sel, corpo]) => ({ sel: sel.trim(), corpo }));
  const base = regras.find((r) => r.sel === '.icone-item');
  assert.match(base.corpo, /width: calc\(var\(--alt\) \* 76 \/ 39\)/);
  assert.match(base.corpo, /height: var\(--alt\)/);
  const doIcone = regras.filter((r) => /\.icone-(item|arma|equip|consumivel)\b/.test(r.sel) && !/img/.test(r.sel) && r.sel !== '.icone-item');
  assert.ok(doIcone.length >= 8, `${doIcone.length} regras de tamanho de ícone`);
  for (const r of doIcone) assert.doesNotMatch(r.corpo, /(^|[^-])(width|height):/, r.sel);
});
