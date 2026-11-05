// Abas de pôr pontos no topo do painel inferior (public/js/upar-regras.js), como as
// setas de subir habilidade do LoL: aparecem com ponto livre, uma por atributo, e o
// clique (ou 1 a 5) pede 10 pontos.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { OPCOES_UPAR, UPAR_QTD, estadoUpar, mostraUpar, pedidoUpar } from '../public/js/upar-regras.js';
import { ORDEM_ATRIBUTOS, PONTO_MAX, pontosVazios } from '../shared/status.js';
import { ACAO, ACOES, TECLADO_PADRAO } from '../public/js/atalhos-regras.js';

const me = (pontos, livres) => ({ pontos: { ...pontosVazios(), ...pontos }, pontosLivres: livres });

test('as cinco abas na ordem do STATUS, com as teclas 1 a 5', () => {
  assert.deepEqual(OPCOES_UPAR.map((o) => o.atributo), ORDEM_ATRIBUTOS);
  assert.deepEqual(OPCOES_UPAR.map((o) => o.sigla), ['HP', 'EN', 'Ph.', 'El.', 'Op.']);
  OPCOES_UPAR.forEach((o, i) => {
    assert.ok(ACAO[o.acao], o.acao);
    assert.equal(ACAO[o.acao].ctx, 'voo');
    assert.equal(TECLADO_PADRAO[o.acao][0], `Digit${i + 1}`);
  });
  // Toda ação do grupo Pontos é de uma aba (ninguém fica sem ouvir).
  assert.deepEqual(ACOES.filter((a) => a.grupo === 'Pontos').map((a) => a.id), OPCOES_UPAR.map((o) => o.acao));
});

test('aparecem só com ponto livre: subiu de nível, sobem; gastou tudo, somem', () => {
  assert.equal(mostraUpar(estadoUpar(null)), false);
  assert.equal(mostraUpar(estadoUpar(me({}, 0), 3)), false);
  const e = estadoUpar(me({}, 10), 1);
  assert.equal(mostraUpar(e), true);
  assert.equal(e.livres, 10);
  assert.ok(e.abas.every((a) => a.qtd === UPAR_QTD && !a.cheio));
  // Sem pontosLivres no me: a conta do nível (10 por nível).
  assert.equal(estadoUpar({ pontos: { durabilidade: 10 } }, 3).livres, 20);
});

test('o clique pede 10 pontos; menos livres ou perto do máximo, a aba mostra o que cabe', () => {
  const e = estadoUpar(me({ fisico: PONTO_MAX, laser: PONTO_MAX - 3 }, 7), 25);
  assert.deepEqual(pedidoUpar(e, 'durabilidade'), { t: 'pontos', atributo: 'durabilidade', qtd: UPAR_QTD });
  assert.equal(e.abas.find((a) => a.atributo === 'energia').qtd, 7);
  assert.equal(e.abas.find((a) => a.atributo === 'laser').qtd, 3);
  // No máximo: apagada, sem pedido.
  const fis = e.abas.find((a) => a.atributo === 'fisico');
  assert.equal(fis.cheio, true);
  assert.equal(pedidoUpar(e, 'fisico'), null);
  assert.equal(pedidoUpar(e, 'velocidade'), null);
  // Todos no máximo: nada para pôr, as abas somem mesmo com ponto sobrando.
  const tudo = Object.fromEntries(ORDEM_ATRIBUTOS.map((a) => [a, PONTO_MAX]));
  assert.equal(mostraUpar(estadoUpar(me(tudo, 10), 25)), false);
});

test('o painel inferior tem o lugar das abas', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const painel = html.slice(html.indexOf('<footer id="painel">'), html.indexOf('</footer>', html.indexOf('<footer id="painel">')));
  assert.ok(painel.includes('<div id="upar" hidden'));
});
