// Confirmação de saída da partida (public/js/sair-partida.js): o ESC na partida abre a
// caixa e só o Confirmar (botão ou Enter) sai; Cancelar, clique fora e fechar não saem.
// Roda no Node com uma janela e elementos de mentira (EventTarget).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const janela = new EventTarget();
globalThis.addEventListener = janela.addEventListener.bind(janela);
globalThis.removeEventListener = janela.removeEventListener.bind(janela);
globalThis.document ??= { activeElement: null };

const { ConfirmarSaida } = await import('../public/js/sair-partida.js');

class Elemento extends EventTarget {
  constructor(filhos = {}) {
    super();
    this.hidden = true;
    this.filhos = filhos;
  }
  querySelector(sel) {
    return this.filhos[sel] ?? null;
  }
  contains(el) {
    return el === this || Object.values(this.filhos).includes(el);
  }
}

function montar() {
  const botoes = { '.confirmar': new Elemento(), '.cancelar': new Elemento() };
  const el = new Elemento(botoes);
  let saiu = 0;
  const sons = [];
  const caixa = new ConfirmarSaida({ el, aoConfirmar: () => saiu++, som: (n) => sons.push(n) });
  return { el, botoes, caixa, sons, saiu: () => saiu };
}

function tecla(code, { repeat = false } = {}) {
  const e = new Event('keydown', { cancelable: true });
  e.code = code;
  e.repeat = repeat;
  janela.dispatchEvent(e);
  return e;
}

test('sair da partida: começa fechada e abrir mostra a caixa com o som do painel', () => {
  const { el, caixa, sons } = montar();
  assert.equal(caixa.aberto, false);
  caixa.abrir();
  assert.equal(caixa.aberto, true);
  assert.equal(el.hidden, false);
  assert.deepEqual(sons, ['painel']);
  caixa.abrir();
  assert.deepEqual(sons, ['painel'], 'abrir de novo não repete o som');
  caixa.fechar();
});

test('sair da partida: Confirmar fecha a caixa e sai, uma vez', () => {
  const { botoes, caixa, saiu } = montar();
  caixa.abrir();
  botoes['.confirmar'].dispatchEvent(new Event('click'));
  assert.equal(saiu(), 1);
  assert.equal(caixa.aberto, false, 'o menu não abre com a caixa por cima');
  botoes['.confirmar'].dispatchEvent(new Event('click'));
  assert.equal(saiu(), 1, 'fechada, o Confirmar não sai de novo');
});

test('sair da partida: Cancelar e clique fora fecham sem sair', () => {
  const { el, botoes, caixa, saiu } = montar();
  caixa.abrir();
  botoes['.cancelar'].dispatchEvent(new Event('click'));
  assert.equal(caixa.aberto, false);
  caixa.abrir();
  const fora = new Event('pointerdown');
  el.dispatchEvent(fora); // o alvo é o fundo escurecido
  assert.equal(caixa.aberto, false);
  assert.equal(saiu(), 0);
});

test('sair da partida: Enter confirma só com a caixa aberta e não chega no atalho da Loja', () => {
  const { caixa, saiu } = montar();
  let loja = 0;
  const ouvinteLoja = (e) => e.code === 'Enter' && loja++;
  addEventListener('keydown', ouvinteLoja);
  tecla('Enter');
  assert.equal(saiu(), 0, 'fechada, Enter é o de sempre');
  assert.equal(loja, 1);
  caixa.abrir();
  const e = tecla('Enter');
  assert.equal(saiu(), 1);
  assert.equal(e.defaultPrevented, true);
  assert.equal(loja, 1, 'o Enter da caixa não reabre a Loja');
  caixa.abrir();
  tecla('NumpadEnter', { repeat: true });
  assert.equal(saiu(), 1, 'Enter segurado de antes não confirma');
  assert.equal(caixa.aberto, true);
  caixa.fechar();
  removeEventListener('keydown', ouvinteLoja);
});

test('sair da partida: a caixa está no index.html com os dois botões e o controle navega nela', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const caixa = html.match(/<div id="sair-partida" hidden>[\s\S]*?<\/section>\s*<\/div>/)?.[0];
  assert.ok(caixa, '#sair-partida começa escondida');
  assert.match(caixa, /class="cancelar"[^>]*>Cancelar/);
  assert.match(caixa, /class="confirmar" data-joy-principal>Confirmar/);
  const joystick = readFileSync(new URL('../public/js/joystick.js', import.meta.url), 'utf8');
  assert.match(joystick, /\['#sair-partida'\]/, 'é uma janela de mexer do controle');
  const main = readFileSync(new URL('../public/js/main.js', import.meta.url), 'utf8');
  assert.match(main, /confirmarSaida\.abrir\(\)/, 'o ESC da partida pergunta antes de sair');
});
