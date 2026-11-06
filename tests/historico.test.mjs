// Histórico da partida (public/js/historico-regras.js e hud.js): a ação N mostra os
// últimos 10 registros das notícias embaixo do placar.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HISTORICO_MAX, registrar, textoIdade } from '../public/js/historico-regras.js';
import { ACOES, TECLADO_PADRAO, CONTROLE_PADRAO } from '../public/js/atalhos-regras.js';

test('histórico: guarda os 10 últimos, o mais novo na frente', () => {
  let lista = [];
  for (let i = 1; i <= 13; i++) lista = registrar(lista, { texto: `r${i}`, tipo: '', t: i });
  assert.equal(HISTORICO_MAX, 10);
  assert.equal(lista.length, 10);
  assert.equal(lista[0].texto, 'r13');
  assert.equal(lista.at(-1).texto, 'r4');
});

test('histórico: a idade de cada registro', () => {
  assert.equal(textoIdade(0, 500), 'agora');
  assert.equal(textoIdade(0, 12_400), 'há 12 s');
  assert.equal(textoIdade(0, 185_000), 'há 3 min');
});

test('histórico: a ação N, no grupo Janelas, configurável e sem botão de fábrica no controle', () => {
  const acao = ACOES.find((a) => a.id === 'historico');
  assert.equal(acao?.grupo, 'Janelas');
  assert.equal(acao?.ctx, 'voo');
  assert.deepEqual(TECLADO_PADRAO.historico, ['KeyN']);
  assert.equal(CONTROLE_PADRAO.historico, undefined);
});

test('histórico: o hud guarda toda notícia e a partida abre e fecha pela ação', () => {
  const hud = readFileSync(new URL('../public/js/hud.js', import.meta.url), 'utf8');
  assert.match(hud, /this\.historico = registrar\(/);
  assert.match(hud, /alternarHistorico\(abrir = !this\.historicoAberto\)/);
  const main = readFileSync(new URL('../public/js/main.js', import.meta.url), 'utf8');
  assert.match(main, /aoApertar\('historico', \(\) => hud\.alternarHistorico\(\)/);
  assert.match(main, /hud\.limparHistorico\(\)/);
  const css = readFileSync(new URL('../public/css/jogo.css', import.meta.url), 'utf8');
  assert.ok(css.includes('#feed.historico'));
});
