// O mapa 2D da partida na Seleção (public/js/mapa-selecao-regras.js): a sua base, a
// caixinha de cada peça do mapa e o lugar no index.html.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  TIMES_MAPA,
  OBJETIVOS_MAPA,
  ESTRUTURAS_MAPA,
  timeDoPiloto,
  dicaDoItem,
  acampamentoDoTime0,
} from '../public/js/mapa-selecao-regras.js';
import { BUFFS, PLATAFORMAS_POUSO, TORRETAS, ACAMPAMENTOS } from '../shared/terrain.js';

test('a sua base: o time 0 fora do 3 contra 3; nele, o time da fila', () => {
  assert.equal(timeDoPiloto(null, null), 0);
  assert.equal(timeDoPiloto('publica', { fase: 'procurando', voce: { time: 1 } }), 0);
  assert.equal(timeDoPiloto('online', { fase: 'procurando', voce: { time: 1 } }), 1);
  assert.equal(timeDoPiloto('online', { fase: 'sala', voce: { time: 0 } }), 0);
  assert.equal(timeDoPiloto('online', { fase: 'comecar', time: 1 }), 1);
  assert.equal(timeDoPiloto('online', { fase: 'fora' }), 0);
});

test('verde é o time 0 (à esquerda) e vermelho o time 1, como as faixas da fila', () => {
  assert.equal(TIMES_MAPA[0].nome, 'Time verde');
  assert.equal(TIMES_MAPA[1].nome, 'Time vermelho');
  const [b0, b1] = [0, 1].map((t) => ESTRUTURAS_MAPA.bases.find((b) => b.time === t));
  assert.ok(b0.x < 0 && b1.x > 0);
});

test('o mapa leva todos os objetivos do contrato', () => {
  const ids = OBJETIVOS_MAPA.map((o) => o.id).sort();
  const esperados = [...BUFFS.map((b) => b.id), ...PLATAFORMAS_POUSO.map((p) => p.id), 'SONDA', 'MEDUSA', 'NUCLEO'].sort();
  assert.deepEqual(ids, esperados);
});

test('toda peça do mapa tem a caixinha com nome e texto', () => {
  const chaves = [
    'base:0',
    'base:1',
    'campo:0',
    'campo:1',
    'bacia:0',
    'bacia:1',
    ...ESTRUTURAS_MAPA.servicos.map((s) => `servico:${s.servico}:${s.time}`),
    ...TORRETAS.map((t) => `torreta:${t.id}`),
    ...ACAMPAMENTOS.map((a) => `acampamento:${a.id}`),
    ...OBJETIVOS_MAPA.map((o) => `objetivo:${o.id}`),
    'mineradora',
    'lane',
    'sonda',
    'nuvem',
  ];
  for (const c of chaves) {
    const d = dicaDoItem(c, 0);
    assert.ok(d, c);
    assert.ok(d.titulo.length > 2 && d.texto.length > 10, c);
  }
  assert.equal(dicaDoItem('nada', 0), null);
  assert.equal(dicaDoItem('torreta:T9-9', 0), null);
});

test('a caixinha diz de quem é: a sua base e a do inimigo trocam com o time', () => {
  assert.match(dicaDoItem('base:0', 0).titulo, /^Sua base · Time verde/);
  assert.match(dicaDoItem('base:1', 0).titulo, /^Base inimiga · Time vermelho/);
  assert.match(dicaDoItem('base:1', 1).titulo, /^Sua base · Time vermelho/);
  assert.match(dicaDoItem('torreta:T0-1', 0).titulo, /do seu time/);
  assert.match(dicaDoItem('torreta:T0-1', 1).titulo, /do inimigo/);
  assert.equal(dicaDoItem('base:0', 0).cor, TIMES_MAPA[0].cor);
});

test('o acampamento do time 1 é o do time 0 girado 180°: mesmos monstros', () => {
  for (const a of ACAMPAMENTOS.filter((x) => x.time === 1)) {
    const id0 = acampamentoDoTime0(a.id);
    const par = ACAMPAMENTOS.find((x) => x.id === id0);
    assert.ok(par, a.id);
    assert.equal(par.x, -a.x);
    assert.equal(par.z, -a.z);
    assert.equal(dicaDoItem(`acampamento:${a.id}`).texto, dicaDoItem(`acampamento:${id0}`).texto);
  }
});

test('o index.html tem o lugar do mapa na Seleção, sem legenda', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const selecao = html.slice(html.indexOf('id="tela-selecao"'), html.indexOf('class="selecao-centro"'));
  assert.match(selecao, /class="mapa-partida"/);
  assert.match(selecao, /class="quadro-mapa"/);
  assert.doesNotMatch(selecao, /legenda-mapa/);
});
