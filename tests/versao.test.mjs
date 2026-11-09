// A versão do build no canto da tela de abertura: server/versao.js monta {versao, commit}
// (o package.json e o commit do Railway ou do git), GET /api/versao entrega e
// textoVersao (abertura-regras.js) escreve a linha; o index.html tem o lugar dela.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { versaoDoBuild, COMMIT_CURTO } from '../server/versao.js';
import { iniciar } from '../server/index.js';
import { World } from '../server/game.js';
import { textoVersao, ROTA_VERSAO } from '../public/js/abertura-regras.js';
import { definirIdioma } from '../shared/idioma.js';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHA = '85825d3f0c1e2a4b5d6e7f8091a2b3c4d5e6f708';

test('versão: o commit do Railway vale antes do git, curto e minúsculo', () => {
  const v = versaoDoBuild({ versao: '0.2.0', env: { RAILWAY_GIT_COMMIT_SHA: SHA.toUpperCase() }, git: () => 'abcdef1234567' });
  assert.deepEqual(v, { versao: '0.2.0', commit: SHA.slice(0, COMMIT_CURTO) });
});

test('versão: sem Railway, o git da pasta; sem nenhum, só o número', () => {
  assert.deepEqual(versaoDoBuild({ versao: '0.2.0', env: {}, git: () => SHA }), { versao: '0.2.0', commit: '85825d3' });
  assert.deepEqual(versaoDoBuild({ versao: '0.2.0', env: {}, git: () => null }), { versao: '0.2.0', commit: null });
  assert.deepEqual(versaoDoBuild({ versao: '0.2.0', env: { RAILWAY_GIT_COMMIT_SHA: 'não é commit' }, git: () => null }), { versao: '0.2.0', commit: null });
  assert.deepEqual(versaoDoBuild({ versao: null, env: {}, git: () => null }), { versao: null, commit: null });
});

test('versão: sem fontes de fora, o número é o do package.json', () => {
  const pacote = JSON.parse(readFileSync(path.join(RAIZ, 'package.json'), 'utf8'));
  assert.equal(versaoDoBuild({ env: {}, git: () => null }).versao, pacote.version);
});

test('versão: o texto do canto nos dois idiomas, e vazio sem nada', () => {
  definirIdioma('pt');
  assert.equal(textoVersao({ versao: '0.1.0', commit: '85825d3' }), 'Versão 0.1.0 · build 85825d3');
  assert.equal(textoVersao({ versao: '0.1.0', commit: null }), 'Versão 0.1.0');
  assert.equal(textoVersao({ versao: null, commit: '85825d3' }), 'build 85825d3');
  assert.equal(textoVersao(null), '');
  definirIdioma('en');
  assert.equal(textoVersao({ versao: '0.1.0', commit: '85825d3' }), 'Version 0.1.0 · build 85825d3');
  definirIdioma('pt');
});

test('versão: GET /api/versao entrega o que o servidor montou, sem cache', async (t) => {
  const srv = await iniciar({ porta: 0, world: new World({ jungle: false, torretas: false }) });
  t.after(() => srv.fechar());
  const r = await fetch(`http://localhost:${srv.porta}${ROTA_VERSAO}`);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('cache-control'), 'no-cache');
  assert.deepEqual(await r.json(), versaoDoBuild());
});

test('versão: a abertura tem o lugar da linha', () => {
  const html = readFileSync(path.join(RAIZ, 'public', 'index.html'), 'utf8');
  const abertura = html.slice(html.indexOf('<section id="abertura"'), html.indexOf('</section>', html.indexOf('<section id="abertura"')));
  assert.match(abertura, /class="versao-abertura"/);
});
