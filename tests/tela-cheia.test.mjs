// Tela cheia ao decolar (public/js/tela-cheia.js): o Decolar pede a tela cheia no
// próprio clique; sem o gesto (a sala da fila começa sozinha), o pedido fica armado e
// sai na primeira tecla ou clique; com a tela cheia, o ESC fica preso para o jogo.
// Roda no Node com documento, janela e navegador de mentira.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TelaCheia } from '../public/js/tela-cheia.js';

/** Monta o navegador de mentira; `gesto` diz se o navegador vê um gesto agora. */
function montar({ gesto = true, cheia = false, suporta = true } = {}) {
  const doc = new EventTarget();
  const janela = new EventTarget();
  const nav = { userActivation: { isActive: gesto }, travado: null };
  const pedidos = [];
  doc.fullscreenEnabled = suporta;
  doc.fullscreenElement = cheia ? {} : null;
  doc.documentElement = {
    requestFullscreen(op) {
      pedidos.push(op);
      if (!nav.userActivation.isActive) return Promise.reject(new TypeError('sem gesto'));
      doc.fullscreenElement = doc.documentElement;
      return Promise.resolve();
    },
  };
  nav.keyboard = {
    lock: async (teclas) => (nav.travado = teclas),
    unlock: () => (nav.travado = null),
  };
  janela.innerWidth = 1280;
  janela.innerHeight = 650;
  janela.screen = { width: 1920, height: 1080 };
  const tc = new TelaCheia({ doc, janela, nav });
  return { doc, janela, nav, pedidos, tc };
}

const esperar = () => new Promise((r) => setTimeout(r, 0));

function tecla(janela, code, extra = {}) {
  const e = new Event('keydown');
  Object.assign(e, { code, repeat: false, ...extra });
  janela.dispatchEvent(e);
}

test('no clique do Decolar: tela cheia sem a barra do navegador e o ESC preso para o jogo', async () => {
  const { doc, nav, pedidos, tc } = montar();
  tc.pedir();
  await esperar();
  assert.deepEqual(pedidos, [{ navigationUI: 'hide' }]);
  assert.ok(doc.fullscreenElement);
  assert.deepEqual(nav.travado, ['Escape']);
  assert.equal(tc.armado, false);
});

test('já em tela cheia (pela API ou pelo F11 do navegador), não pede de novo', () => {
  const api = montar({ cheia: true });
  api.tc.pedir();
  assert.equal(api.pedidos.length, 0);

  const f11 = montar();
  f11.janela.innerWidth = 1920;
  f11.janela.innerHeight = 1080;
  f11.tc.pedir();
  assert.equal(f11.pedidos.length, 0);
});

test('sem gesto (a sala da fila começou sozinha): espera a primeira tecla de voo ou clique', async () => {
  const { doc, janela, nav, pedidos, tc } = montar({ gesto: false });
  tc.pedir();
  await esperar();
  assert.equal(pedidos.length, 0, 'nem tenta: o navegador recusaria');
  assert.equal(tc.armado, true);

  // ESC e F11 não são gesto para o navegador: não gastam a tentativa.
  tecla(janela, 'Escape');
  tecla(janela, 'F11');
  assert.equal(tc.armado, true);

  nav.userActivation.isActive = true;
  tecla(janela, 'KeyW');
  await esperar();
  assert.equal(pedidos.length, 1);
  assert.ok(doc.fullscreenElement);
  assert.equal(tc.armado, false);
});

test('o clique na tela também serve de gesto', async () => {
  const { doc, janela, nav, tc } = montar({ gesto: false });
  tc.pedir();
  nav.userActivation.isActive = true;
  janela.dispatchEvent(new Event('pointerdown'));
  await esperar();
  assert.ok(doc.fullscreenElement);
});

test('recusado mesmo com o gesto: desiste, sem pedir a cada tecla', async () => {
  const { janela, nav, pedidos, tc } = montar();
  delete nav.userActivation; // navegador que não conta o gesto (o pedido é que diz)
  tc.doc.documentElement.requestFullscreen = (op) => (pedidos.push(op), Promise.reject(new Error('negado')));
  tc.pedir();
  await esperar();
  assert.equal(tc.armado, true, 'primeira recusa: espera o próximo gesto');
  tecla(janela, 'KeyW');
  await esperar();
  assert.equal(pedidos.length, 2);
  assert.equal(tc.armado, false);
  tecla(janela, 'KeyW');
  await esperar();
  assert.equal(pedidos.length, 2, 'não insiste');
});

test('saiu da partida antes do gesto: o pedido armado some', () => {
  const { janela, nav, pedidos, tc } = montar({ gesto: false });
  tc.pedir();
  tc.desarmar();
  nav.userActivation.isActive = true;
  tecla(janela, 'KeyW');
  assert.equal(pedidos.length, 0);
});

test('saiu da tela cheia (segurou o ESC): o ESC volta para o navegador', async () => {
  const { doc, nav, tc } = montar();
  tc.pedir();
  await esperar();
  doc.fullscreenElement = null;
  doc.dispatchEvent(new Event('fullscreenchange'));
  assert.equal(nav.travado, null);
});

test('navegador sem tela cheia (iPhone): não faz nada', () => {
  const { pedidos, tc } = montar({ suporta: false });
  tc.pedir();
  assert.equal(pedidos.length, 0);
  assert.equal(tc.armado, false);
});

test('main.js pede a tela cheia no Decolar e desarma ao sair da partida', () => {
  const main = readFileSync(new URL('../public/js/main.js', import.meta.url), 'utf8');
  const decolar = main.slice(main.indexOf('aoDecolar: async'), main.indexOf('await iniciar('));
  assert.match(decolar, /telaCheia\.pedir\(\)/, 'antes do primeiro await: ainda no gesto do clique');
  const sair = main.slice(main.indexOf('function voltarParaEntrada'));
  assert.match(sair.slice(0, sair.indexOf('menu.abrir')), /telaCheia\.desarmar\(\)/);
});
