// Tela de abertura (public/js/abertura.js, regras em abertura-regras.js): a lista do
// que o menu mostra (insumosDoMenu em insumos.js) tem as 45 naves e todo arquivo dela
// existe; a barra só chega a 100% (e o JOGAR só acende) com tudo feito; e o
// index.html tem tudo o que abertura.js procura, com o menu escondido até o JOGAR.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { insumosDoMenu } from '../public/js/insumos.js';
import {
  ARTE_ABERTURA,
  GRUPOS_ABERTURA,
  DICAS_ABERTURA,
  fracaoAbertura,
  pctAbertura,
  aberturaPronta,
  textoAbertura,
  proximaDica,
} from '../public/js/abertura-regras.js';
import { RACAS_JOGAVEIS, ORDEM_CLASSES, linhaDe } from '../shared/naves.js';
import { WEAPONS, ARMAS, armasIniciais } from '../shared/armas.js';
import { SONS_INTERFACE } from '../public/js/sons.js';
import { SONS_LOCUTOR } from '../public/js/locutor-regras.js';

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const existe = (rel) => existsSync(path.join(PUBLIC, rel));
const ler = (rel) => readFileSync(path.join(PUBLIC, rel), 'utf8');

test('abertura: a lista do menu tem as 45 naves, a primeira de cada linha antes, e os arquivos existem', () => {
  const { naves, propulsao } = insumosDoMenu();
  assert.equal(naves.length, 45);
  assert.equal(new Set(naves.map((n) => n.url)).size, 45);
  for (const race of RACAS_JOGAVEIS) {
    for (const classe of ORDEM_CLASSES) {
      for (const n of linhaDe(race, classe)) {
        assert.ok(
          naves.some((x) => x.race === race && x.classe === classe && x.tier === n.tier && x.url === '/' + n.modelo),
          `${race} ${classe} ${n.tier}`,
        );
      }
    }
  }
  // A grade da Seleção e a nave da aba Jogar são as primeiras de cada linha: chegam antes.
  const linhas = RACAS_JOGAVEIS.length * ORDEM_CLASSES.length;
  assert.ok(naves.slice(0, linhas).every((n) => n.tier === 0));
  for (const n of naves) assert.ok(existe(n.url.slice(1)), n.url);
  assert.deepEqual(propulsao, [...RACAS_JOGAVEIS]);
});

test('abertura: os ícones das armas de fábrica e os sons do menu estão na lista e existem', () => {
  const { icones, sons } = insumosDoMenu();
  for (const race of RACAS_JOGAVEIS) {
    for (const idx of armasIniciais(race)) assert.ok(icones.includes(WEAPONS[ARMAS[idx]].icone), `${race}: ${WEAPONS[ARMAS[idx]].nome}`);
  }
  for (const nome of icones) assert.ok(existe(`texturas/itens/${nome}.png`), nome);
  for (const s of Object.values(SONS_INTERFACE)) assert.ok(sons.includes(s), s);
  for (const s of SONS_LOCUTOR) assert.ok(sons.includes(s), s); // a barra do locutor toca o Godlike
  for (const s of sons) assert.ok(existe(/\.[a-z0-9]+$/i.test(s) ? `sons/${s}` : `sons/${s}.wav`), s);
});

test('abertura: a barra só chega a 100% e o JOGAR só acende com todos os grupos feitos', () => {
  const vazio = Object.fromEntries(GRUPOS_ABERTURA.map((g) => [g.id, { feitos: 0, total: 0 }]));
  assert.equal(fracaoAbertura(vazio), 0);
  assert.equal(pctAbertura(vazio), 0);
  assert.equal(aberturaPronta(vazio), false);
  assert.match(textoAbertura(vazio), /^Carregando · Naves…$/);

  // Quase tudo: a porcentagem arredondada não pode virar 100 antes da hora.
  const quase = Object.fromEntries(GRUPOS_ABERTURA.map((g) => [g.id, { feitos: 1000, total: 1000 }]));
  quase.naves = { feitos: 999, total: 1000 };
  assert.equal(pctAbertura(quase), 99);
  assert.equal(aberturaPronta(quase), false);
  assert.equal(textoAbertura(quase), 'Carregando · Naves 999/1000');

  // Só as naves prontas: a parte delas na barra (o peso), e o texto passa ao próximo grupo.
  const soNaves = { ...vazio, naves: { feitos: 48, total: 48 } };
  const peso = GRUPOS_ABERTURA.find((g) => g.id === 'naves').peso / GRUPOS_ABERTURA.reduce((s, g) => s + g.peso, 0);
  assert.ok(Math.abs(fracaoAbertura(soNaves) - peso) < 1e-9);
  assert.match(textoAbertura(soNaves), /Miniaturas/);

  const tudo = Object.fromEntries(GRUPOS_ABERTURA.map((g) => [g.id, { feitos: 3, total: 3 }]));
  assert.equal(pctAbertura(tudo), 100);
  assert.equal(aberturaPronta(tudo), true);
  assert.equal(textoAbertura(tudo), 'Hangar pronto');
});

test('abertura: as dicas dão a volta e cada <kbd> fecha', () => {
  assert.ok(DICAS_ABERTURA.length >= 5);
  assert.equal(proximaDica(DICAS_ABERTURA.length - 1), 0);
  assert.equal(proximaDica(0), 1);
  for (const d of DICAS_ABERTURA) assert.equal((d.match(/<kbd>/g) ?? []).length, (d.match(/<\/kbd>/g) ?? []).length, d);
});

test('abertura: o index.html tem tudo o que abertura.js procura, a arte existe e o menu começa escondido', () => {
  const html = ler('index.html');
  const js = ler('js/abertura.js');
  const seletores = [...js.matchAll(/(?:this\.q|querySelector)\('([^'$]+)'\)/g)].map((m) => m[1]);
  assert.ok(seletores.length >= 6);
  for (const sel of seletores) {
    for (const [, tipo, nome] of sel.matchAll(/([#.])([\w-]+)/g)) {
      const achou = tipo === '#' ? html.includes(`id="${nome}"`) : new RegExp(`class="[^"]*\\b${nome}\\b`).test(html) || js.includes(`class="${nome}`);
      assert.ok(achou, `${sel}: falta ${tipo}${nome}`);
    }
  }
  assert.match(html, /<section id="abertura"/);
  assert.match(html, /<section id="entrada"[^>]*\bhidden\b/, 'o menu só aparece depois do JOGAR');
  assert.match(html, /class="jogar-abertura"[^>]*\bdisabled\b/, 'o JOGAR começa apagado');
  assert.ok(existe(ARTE_ABERTURA.slice(1)), ARTE_ABERTURA);
  // O menu é montado pelo JOGAR da abertura, não no carregamento da página.
  const main = ler('js/main.js');
  assert.match(main, /new TelaAbertura\(/);
  assert.doesNotMatch(main, /^montarMenu\(\);$/m);
});
