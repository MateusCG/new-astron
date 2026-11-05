// Tela de carregamento da partida (public/js/carregamento.js, regras em
// carregamento-regras.js): no estilo da abertura, com o mapa da partida de fundo, a
// barra com um chip por grupo, as dicas da abertura e nenhum botão (termina e a
// partida começa sozinha). A barra só diz 100% com tudo feito, e o index.html tem
// tudo o que carregamento.js procura.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ARTE_CARREGAMENTO,
  MAPA_DA_PARTIDA,
  GRUPOS_CARREGAMENTO,
  grupoCarregado,
  fracaoCarregamento,
  pctCarregamento,
  textoCarregamento,
} from '../public/js/carregamento-regras.js';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const ler = (rel) => readFileSync(path.join(RAIZ, rel), 'utf8');

/** Estado com todos os grupos em `feitos` de `total`. */
const estadoCom = (feitos, total = 10) => Object.fromEntries(GRUPOS_CARREGAMENTO.map((g) => [g.id, { feitos, total }]));

test('carregamento: a arte de fundo é o mapa, existe e não pesa demais', () => {
  const arq = path.join(RAIZ, ARTE_CARREGAMENTO.slice(1));
  assert.ok(existsSync(arq), ARTE_CARREGAMENTO);
  assert.ok(statSync(arq).size < 900 * 1024, 'até ~600 KB (LISTA.md)');
  assert.match(ler('imagens/LISTA.md'), /carregamento\.jpg/, 'a LISTA.md diz de onde veio');
  assert.equal(MAPA_DA_PARTIDA.nome, 'Lago de Hélio-3');
});

test('carregamento: grupos com id único e peso, e a barra só chega a 100% com tudo feito', () => {
  const ids = GRUPOS_CARREGAMENTO.map((g) => g.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const g of GRUPOS_CARREGAMENTO) assert.ok(g.peso > 0 && g.nome && g.curto && g.titulo, g.id);
  assert.ok(ids.includes('servidor') && ids.includes('gpu'));
  assert.equal(pctCarregamento({}), 0);
  assert.equal(pctCarregamento(estadoCom(0)), 0);
  assert.equal(pctCarregamento(estadoCom(10)), 100);
  // Falta um item só da placa de vídeo: 99, nunca 100.
  const quase = estadoCom(1000, 1000);
  quase.gpu = { feitos: 999, total: 1000 };
  assert.equal(pctCarregamento(quase), 99);
  assert.ok(fracaoCarregamento(estadoCom(5)) > 0.49 && fracaoCarregamento(estadoCom(5)) < 0.51);
  // Grupo desligado fica fora da conta.
  const sem = estadoCom(10);
  sem.miniaturas = { feitos: 0, total: 5, ativa: false };
  assert.equal(pctCarregamento(sem), 100);
  assert.equal(grupoCarregado({ feitos: 0, total: 0 }), false);
});

test('carregamento: a linha embaixo da barra diz o primeiro grupo que falta', () => {
  assert.equal(textoCarregamento({}), 'Carregando · Cenário…');
  const e = estadoCom(10);
  e.naves = { feitos: 12, total: 48 };
  assert.equal(textoCarregamento(e), 'Carregando · Naves 12/48');
  const placa = estadoCom(10);
  placa.gpu = { feitos: 1, total: 4 };
  assert.equal(textoCarregamento(placa), 'Preparando a placa de vídeo…');
  assert.equal(textoCarregamento(estadoCom(10)), 'Pronto · decolando');
});

test('carregamento: o index.html tem a tela no estilo da abertura, sem botão, e o carregamento.js acha tudo', () => {
  const html = ler('index.html');
  const js = ler('js/carregamento.js');
  const tela = html.slice(html.indexOf('<section id="carregamento"'), html.indexOf('</section>', html.indexOf('<section id="carregamento"')));
  assert.match(tela, /<section id="carregamento"[^>]*\bhidden\b/, 'começa escondida');
  assert.doesNotMatch(tela, /<button/, 'sem botão: termina e a partida começa sozinha');
  for (const [, nome] of js.matchAll(/this\.q\('\.([\w-]+)/g)) {
    assert.match(tela, new RegExp(`class="[^"]*\\b${nome}\\b`), `falta .${nome}`);
  }
  // As dicas são as da abertura, trocando sozinhas.
  assert.match(js, /DICAS_ABERTURA/);
  assert.match(js, /ARTE_CARREGAMENTO/);
});
