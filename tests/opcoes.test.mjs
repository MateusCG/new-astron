// Opções da partida (public/js/opcoes.js): a engrenagem do HUD ou O abrem a caixa com
// as janelas (Status, Inventário, Tabela, Morte), o volume, o ping e o Sair da partida;
// a fileira de botões embaixo do minimapa saiu. Roda no Node com elementos de mentira.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TECLADO_PADRAO, CONTROLE_PADRAO } from '../public/js/atalhos-regras.js';

globalThis.document ??= { activeElement: null };

const { PainelOpcoes } = await import('../public/js/opcoes.js');

class Elemento extends EventTarget {
  constructor(filhos = {}, todos = {}) {
    super();
    this.hidden = true;
    this.filhos = filhos;
    this.todos = todos;
    this.value = '50';
    this.textContent = '';
    this.style = { setProperty() {} };
  }
  querySelector(sel) {
    return this.filhos[sel] ?? null;
  }
  querySelectorAll(sel) {
    return this.todos[sel] ?? [];
  }
  contains(el) {
    return el === this || Object.values(this.filhos).includes(el);
  }
}

function montar() {
  const canal = () => new Elemento({ input: new Elemento(), '.pct': new Elemento() });
  const som = new Elemento({
    "[data-canal='musica']": canal(),
    "[data-canal='efeitos']": canal(),
    "[data-canal='locutor']": canal(),
    '.alternar-mudo': new Elemento(),
  });
  const janelas = [new Elemento(), new Elemento(), new Elemento(), new Elemento()];
  const botoes = { '.fechar': new Elemento(), '.sair-partida': new Elemento(), '.ver-comandos': new Elemento(), '.opcoes-som': som };
  const el = new Elemento(botoes, { '.opcoes-janelas button': janelas });
  const sons = { volumeMusica: 0.6, volumeEfeitos: 0.8, volumeLocutor: 0.8, mudo: false, desbloquear() {}, tocarInterface() {} };
  const tocados = [];
  let saiu = 0;
  let comandos = 0;
  const painel = new PainelOpcoes({ el, sons, aoSair: () => saiu++, aoComandos: () => comandos++, som: (n) => tocados.push(n) });
  return { el, som, botoes, janelas, painel, tocados, saiu: () => saiu, comandos: () => comandos };
}

test('opções: começa fechada, abre com o som do painel e mostra os volumes de agora', () => {
  const { painel, som, tocados } = montar();
  assert.equal(painel.aberto, false);
  painel.alternar();
  assert.equal(painel.aberto, true);
  assert.deepEqual(tocados, ['painel']);
  assert.equal(som.querySelector("[data-canal='efeitos']").querySelector('input').value, '80');
  painel.alternar();
  assert.equal(painel.aberto, false, 'O de novo fecha');
});

test('opções: o botão de uma janela fecha a caixa (a janela abre sem nada por cima)', () => {
  const { painel, janelas } = montar();
  for (const b of janelas) {
    painel.abrir();
    b.dispatchEvent(new Event('click'));
    assert.equal(painel.aberto, false);
  }
});

test('opções: ✕ e clique fora fecham; Sair da partida fecha e pede a confirmação', () => {
  const { el, botoes, som, painel, saiu } = montar();
  painel.abrir();
  botoes['.fechar'].dispatchEvent(new Event('click'));
  assert.equal(painel.aberto, false);
  painel.abrir();
  som.dispatchEvent(new Event('pointerdown'));
  assert.equal(painel.aberto, true, 'clicar na sobra das barras não fecha nem esconde nada');
  assert.equal(som.hidden, true, 'as barras não ganham hidden próprio');
  el.dispatchEvent(new Event('pointerdown')); // o alvo é o fundo escurecido
  assert.equal(painel.aberto, false);
  painel.abrir();
  botoes['.sair-partida'].dispatchEvent(new Event('click'));
  assert.equal(painel.aberto, false);
  assert.equal(saiu(), 1);
});

test('opções: Ver comandos abre os Comandos por cima e as Opções continuam abertas', () => {
  const { botoes, painel, comandos } = montar();
  painel.abrir();
  botoes['.ver-comandos'].dispatchEvent(new Event('click'));
  assert.equal(comandos(), 1);
  assert.equal(painel.aberto, true);
});

test('opções: no index.html a engrenagem é o único botão do HUD e a caixa tem tudo o que saiu dele', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const hud = html.match(/<div id="atalhos-hud">[\s\S]*?<\/div>/)?.[0];
  assert.ok(hud);
  assert.equal((hud.match(/<button/g) ?? []).length, 1, 'só a engrenagem');
  assert.match(hud, /id="opcoes-hud"[\s\S]*data-acao-rotulo="opcoes"/);
  const caixa = html.match(/<div id="opcoes" hidden>[\s\S]*?<\/section>\s*<\/div>/)?.[0];
  assert.ok(caixa, '#opcoes começa escondida');
  for (const id of ['status-hud', 'inventario-hud', 'tabela-hud', 'morte-hud', 'ping']) {
    assert.equal(html.split(`id="${id}"`).length, 2, `${id} existe uma vez`);
    assert.ok(caixa.includes(`id="${id}"`), `${id} está nas Opções`);
  }
  assert.ok(!html.includes('id="som-hud"'), 'o botão de som do HUD saiu: o volume está nas Opções');
  for (const c of ['musica', 'efeitos', 'locutor']) assert.ok(caixa.includes(`data-canal="${c}"`), c);
  assert.match(caixa, /class="alternar-mudo/);
  assert.match(caixa, /class="sair-partida"/);
});

test('opções: O no teclado, PS no controle, e o controle navega na caixa', () => {
  assert.deepEqual(TECLADO_PADRAO.opcoes, ['KeyO']);
  assert.deepEqual(CONTROLE_PADRAO.opcoes, ['b16']);
  const joystick = readFileSync(new URL('../public/js/joystick.js', import.meta.url), 'utf8');
  assert.match(joystick, /\['#opcoes'\]/);
  const main = readFileSync(new URL('../public/js/main.js', import.meta.url), 'utf8');
  assert.match(main, /opcoes\.aberto \|\| resultado\.aberto/, 'sem tiro com a caixa aberta');
});
