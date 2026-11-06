// A tela "Abra numa tela maior" (tela-grande-regras.js, inicio.js): quem é celular,
// os `?tela=` para conferir e o site começando por inicio.js, que só carrega o jogo
// fora do celular.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ehCelular, LADO_MIN_TELA } from '../public/js/tela-grande-regras.js';

const ler = (f) => readFileSync(new URL(`../public/${f}`, import.meta.url), 'utf8');

const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36',
  tabletAndroid: 'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  ipad: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  linux: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
};

test('tela grande: celular pelo navegador ou por ser só de toque com tela pequena', () => {
  assert.equal(ehCelular({ ua: UA.iphone, pontoFino: false, larguraTela: 390, alturaTela: 844 }), true);
  assert.equal(ehCelular({ ua: UA.android, pontoFino: false, larguraTela: 412, alturaTela: 915 }), true);
  // Celular no "modo computador" (o navegador se diz Linux), em pé ou deitado.
  assert.equal(ehCelular({ ua: UA.linux, pontoFino: false, larguraTela: 412, alturaTela: 915 }), true);
  assert.equal(ehCelular({ ua: UA.linux, pontoFino: false, larguraTela: 915, alturaTela: 412 }), true);
});

test('tela grande: tablet, computador e notebook com toque entram no jogo', () => {
  assert.equal(ehCelular({ ua: UA.ipad, pontoFino: false, larguraTela: 820, alturaTela: 1180 }), false, 'iPad');
  assert.equal(ehCelular({ ua: UA.tabletAndroid, pontoFino: false, larguraTela: 800, alturaTela: 1280 }), false, 'tablet Android');
  assert.equal(ehCelular({ ua: UA.linux, pontoFino: true, larguraTela: 1920, alturaTela: 1080 }), false, 'computador');
  // Janela estreita no computador (tem mouse) não é celular.
  assert.equal(ehCelular({ ua: UA.linux, pontoFino: true, larguraTela: 500, alturaTela: 400 }), false);
  assert.equal(ehCelular({ ua: UA.linux, pontoFino: false, larguraTela: LADO_MIN_TELA, alturaTela: 1000 }), false, 'no limite já entra');
  assert.equal(ehCelular({}), false, 'sem informação, entra');
});

test('tela grande: ?tela=celular mostra no computador e ?tela=grande deixa entrar no celular', () => {
  assert.equal(ehCelular({ ua: UA.linux, pontoFino: true, larguraTela: 1920, alturaTela: 1080, busca: '?tela=celular' }), true);
  assert.equal(ehCelular({ ua: UA.iphone, pontoFino: false, larguraTela: 390, alturaTela: 844, busca: '?servidor=x&tela=grande' }), false);
});

test('tela grande: o site começa por inicio.js, que só carrega o jogo fora do celular', () => {
  const html = ler('index.html');
  assert.match(html, /<script type="module" src="\/js\/inicio\.js"><\/script>/);
  assert.doesNotMatch(html, /src="\/js\/main\.js"/, 'o main.js não carrega direto (o celular baixaria o jogo)');
  for (const sel of ['id="tela-grande" hidden', 'class="arte-tela-grande"', 'class="link-tela-grande"', 'class="copiar-tela-grande"', 'class="enviar-tela-grande" hidden']) {
    assert.ok(html.includes(sel), sel);
  }
  const inicio = ler('js/inicio.js');
  assert.match(inicio, /if \(celular\) mostrarTelaGrande\(\);\s*else await import\('\.\/main\.js'\);/);
  // Nada pesado antes da decisão: só as regras puras e o idioma (o HTML traduzido antes
  // de qualquer tela aparecer).
  const imports = [...inicio.matchAll(/^import .* from '(.+)';$/gm)].map((m) => m[1]);
  assert.deepEqual(imports.sort(), ['../../shared/idioma.js', './abertura-regras.js', './idioma-dom.js', './tela-grande-regras.js']);
});
