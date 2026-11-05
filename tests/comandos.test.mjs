// Comandos da partida (public/js/comandos.js): a janela que as Opções abrem por cima
// delas (ou J) com o mapa guardado do teclado, do mouse e do controle, só para ver.
// A lista sai de `linhasDosComandos` (atalhos-regras.js); o painel roda no Node com
// elementos de mentira.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACOES, GRUPOS_ACOES, TECLADO_PADRAO, CONTROLE_PADRAO, mapaPadrao, atribuir, limpar, linhasDosComandos } from '../public/js/atalhos-regras.js';

globalThis.document ??= { activeElement: null };

const { PainelComandos, htmlDosComandos } = await import('../public/js/comandos.js');

const padrao = () => ({ teclado: mapaPadrao('teclado'), controle: mapaPadrao('controle') });
const acaoEm = (grupos, id) => grupos.flatMap((g) => g.acoes).find((a) => a.id === id);

test('comandos: a ação J, no grupo Janelas, sem botão de fábrica no controle (abre pelas Opções)', () => {
  assert.deepEqual(TECLADO_PADRAO.comandos, ['KeyJ']);
  assert.equal(CONTROLE_PADRAO.comandos, undefined);
  assert.equal(ACOES.find((a) => a.id === 'comandos')?.grupo, 'Janelas');
});

test('comandos: o mapa de fábrica, com os grupos na ordem e as teclas e os botões pelo nome da tela', () => {
  const grupos = linhasDosComandos(padrao());
  assert.deepEqual(
    grupos.map((g) => g.nome),
    GRUPOS_ACOES.map((g) => g.nome),
  );
  const frente = acaoEm(grupos, 'frente');
  assert.deepEqual(frente.teclado.map((t) => t.texto), ['W', '↑']);
  assert.deepEqual(frente.controle.map((b) => b.texto), ['LS↑']);
  assert.equal(frente.controle[0].titulo, 'Analógico esq. ↑');
  assert.equal(frente.segurar, true);
  assert.deepEqual(acaoEm(grupos, 'armaZ').controle.map((b) => b.texto), ['R2']);
  // A tecla fixa (o Esc e a navegação dos menus) aparece marcada como fixa.
  const voltar = acaoEm(grupos, 'uiVoltar');
  assert.deepEqual(voltar.teclado, [{ texto: 'Esc', titulo: 'Tecla Esc (fixa)', fixa: true }]);
  assert.deepEqual(voltar.controle.map((b) => b.texto), ['○']);
  // Os pontos não têm botão no controle: só a tecla.
  assert.deepEqual(acaoEm(grupos, 'pontoHp').controle, []);
});

test('comandos: só o que está guardado; o mouse vem marcado e a ação sem nada some', () => {
  let { teclado, controle } = padrao();
  teclado = atribuir('teclado', teclado, 'armaZ', 0, 'Mouse0').mapa;
  teclado = limpar(limpar(teclado, 'som', 0), 'som', 0);
  controle = atribuir('controle', controle, 'som', 0, 'b16').mapa; // tira o PS das Opções
  const grupos = linhasDosComandos({ teclado, controle });
  const z = acaoEm(grupos, 'armaZ');
  assert.deepEqual(z.teclado[0], { texto: 'Clique esq.', titulo: 'Mouse: Clique esq.', mouse: true });
  assert.equal(z.teclado[1].texto, 'Espaço');
  assert.deepEqual(acaoEm(grupos, 'som').teclado, [], 'o M saiu');
  assert.deepEqual(acaoEm(grupos, 'som').controle.map((b) => b.texto), ['PS']);
  assert.equal(acaoEm(grupos, 'opcoes').controle.length, 0, 'o PS saiu das Opções');
  // Sem nada nos dois aparelhos, a ação não aparece; o grupo sem nenhuma também não.
  const vazios = { teclado: Object.fromEntries(ACOES.map((a) => [a.id, []])), controle: {} };
  vazios.teclado.status = ['KeyC'];
  const so = linhasDosComandos(vazios);
  assert.deepEqual(
    so.map((g) => g.nome),
    ['Janelas', 'Sistema', 'Menus'],
    'só os grupos com tecla fixa e o do STATUS',
  );
  assert.deepEqual(so[0].acoes.map((a) => a.id), ['status']);
  assert.deepEqual(linhasDosComandos(null).map((g) => g.nome), ['Sistema', 'Menus'], 'sem mapa, só as fixas');
});

test('comandos: o HTML não tem nada de trocar (só ver) e escapa o texto', () => {
  const html = htmlDosComandos(padrao());
  assert.ok(!/<button|<input|casa-atalho/.test(html), 'nada clicável de trocar');
  assert.match(html, /<li data-acao="frente">.*<kbd class="tecla"[^>]*>W<\/kbd>/);
  assert.match(html, /data-entrada="b7"[^>]*>R2<\/kbd>/);
  assert.match(html, /class="grupo-comandos" tabindex="0"/, 'o controle desce pelos cartões');
  assert.match(htmlDosComandos({ teclado: { armaZ: ['Mouse2'] }, controle: {} }), /class="tecla mouse"[^>]*><svg/);
  assert.match(htmlDosComandos({ teclado: { re: ['KeyS'] }, controle: {} }), /<span class="col-controle"><span class="sem"/);
  assert.ok(htmlDosComandos(padrao()).includes('&gt;') === false);
});

class Elemento extends EventTarget {
  constructor(filhos = {}) {
    super();
    this.hidden = true;
    this.filhos = filhos;
    this.innerHTML = '';
    this.textContent = '';
    this.scrollTop = 0;
  }
  querySelector(sel) {
    return this.filhos[sel] ?? null;
  }
  contains(el) {
    return el === this || Object.values(this.filhos).includes(el);
  }
}

function montar(pads = []) {
  const filhos = { '.fechar': new Elemento(), '.lista-comandos': new Elemento(), '.controle-ligado': new Elemento() };
  const el = new Elemento(filhos);
  let mapas = padrao();
  const tocados = [];
  const painel = new PainelComandos({ el, mapas: () => mapas, controles: () => pads, som: (n) => tocados.push(n) });
  return { el, filhos, painel, tocados, trocar: (m) => (mapas = m) };
}

test('comandos: abre com o mapa de agora, fecha no ✕, no alternar e clicando fora', () => {
  const { el, filhos, painel, tocados, trocar } = montar([{ id: 'Sony PLAYSTATION(R)3 Controller (STANDARD GAMEPAD Vendor: 054c Product: 0268)' }]);
  assert.equal(painel.aberto, false);
  painel.alternar();
  assert.equal(painel.aberto, true);
  assert.deepEqual(tocados, ['painel']);
  assert.match(filhos['.lista-comandos'].innerHTML, />W<\/kbd>/);
  assert.equal(filhos['.controle-ligado'].textContent, 'Controle ligado: Sony PLAYSTATION(R)3 Controller');
  painel.alternar();
  assert.equal(painel.aberto, false);
  // O mapa trocado no menu aparece na próxima abertura.
  const p = padrao();
  trocar({ ...p, teclado: atribuir('teclado', p.teclado, 'frente', 0, 'KeyP').mapa });
  painel.abrir();
  assert.match(filhos['.lista-comandos'].innerHTML, /<li data-acao="frente">.*?>P<\/kbd>/);
  filhos['.fechar'].dispatchEvent(new Event('click'));
  assert.equal(painel.aberto, false);
  painel.abrir();
  filhos['.lista-comandos'].dispatchEvent(new Event('pointerdown'));
  assert.equal(painel.aberto, true, 'clicar dentro não fecha');
  el.dispatchEvent(new Event('pointerdown'));
  assert.equal(painel.aberto, false);
});

test('comandos: sem controle ligado, a linha diz', () => {
  const { filhos, painel } = montar();
  painel.abrir();
  assert.equal(filhos['.controle-ligado'].textContent, 'Nenhum controle ligado');
});

test('comandos: o index.html, o ESC, o tiro e o controle', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const caixa = html.match(/<div id="comandos" hidden>[\s\S]*?<\/section>\s*<\/div>/)?.[0];
  assert.ok(caixa, '#comandos começa escondida');
  for (const c of ['fechar', 'lista-comandos', 'controle-ligado', 'leg-teclado', 'leg-controle', 'so-ver']) assert.ok(caixa.includes(`class="${c}"`), c);
  const opcoes = html.match(/<div id="opcoes" hidden>[\s\S]*?<\/section>\s*<\/div>/)?.[0];
  assert.match(opcoes, /class="ver-comandos"[\s\S]*data-acao-rotulo="comandos"/);
  assert.ok(!/opcoes-janelas[^]*?ver-comandos[^]*?<\/div>\s*<h3>Som/.test(opcoes), 'fora das janelas: não fecha as Opções');
  const main = readFileSync(new URL('../public/js/main.js', import.meta.url), 'utf8');
  assert.match(main, /aoApertar\('comandos'/);
  assert.match(main, /comandos\.aberto \|\| opcoes\.aberto/, 'sem tiro com a janela aberta');
  // O ESC fecha os Comandos antes das Opções de baixo.
  const esc = main.slice(main.indexOf('function apertouEsc'));
  assert.ok(esc.indexOf('comandos.fechar()') < esc.indexOf('opcoes.fechar()'));
  const joystick = readFileSync(new URL('../public/js/joystick.js', import.meta.url), 'utf8');
  assert.match(joystick, /\['#sair-partida'\], \['#comandos'\], \['#opcoes'\]/, 'o controle navega nos Comandos antes das Opções');
});
