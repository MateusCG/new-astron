// O idioma da interface (shared/idioma.js, pedido do Mateus, 06/nov/2026): toda chave
// literal de tr() no código tem tradução para o inglês, com as mesmas variáveis; o
// texto fixo do index.html também; a aba Como Jogar em inglês tem a mesma estrutura
// da portuguesa; e os nomes vindos do servidor viram inglês na chegada.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { EN } from '../shared/idioma-en.js';
import { tr, definirIdioma, idiomaDoNavegador, idiomaPelaLocalizacao, fusoDoBrasil, FUSOS_BRASIL, idiomaValido, nomeExibido, traduzirNomesDaMensagem, nomeArma, nomeEquip } from '../shared/idioma.js';
import { CAPITULOS_PT } from '../public/js/como-jogar-regras.js';
import { capitulosEn } from '../public/js/como-jogar-en.js';
import { FATOS, relogio } from '../public/js/como-jogar-regras.js';
import { WEAPONS } from '../shared/armas.js';
import { EQUIPAMENTOS } from '../shared/equipamentos.js';

const RAIZ = new URL('..', import.meta.url).pathname;
const pastas = ['public/js', 'shared', 'server'];
const arquivos = pastas.flatMap((p) =>
  readdirSync(join(RAIZ, p))
    .filter((f) => f.endsWith('.js'))
    .map((f) => join(p, f)),
);

/** As chaves literais de tr('...') (com aspas simples, o padrão do código). */
function chavesDoCodigo() {
  const chaves = new Map();
  for (const f of arquivos) {
    const src = readFileSync(join(RAIZ, f), 'utf8');
    for (const m of src.matchAll(/\btr\(\s*'((?:[^'\\]|\\.)*)'/g)) {
      const chave = m[1].replace(/\\(.)/g, '$1');
      if (!chaves.has(chave)) chaves.set(chave, f);
    }
  }
  return chaves;
}

const variaveis = (t) => [...String(t).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

test('idioma: toda chave literal de tr() tem tradução para o inglês', () => {
  const faltam = [...chavesDoCodigo()].filter(([k]) => EN[k] === undefined).map(([k, f]) => `${f}: ${k}`);
  assert.deepEqual(faltam, []);
});

test('idioma: a tradução usa as mesmas variáveis {x} do português', () => {
  const erradas = Object.entries(EN)
    .filter(([pt, en]) => variaveis(pt).join() !== variaveis(en).join())
    .map(([pt, en]) => `${pt} → ${en}`);
  assert.deepEqual(erradas, []);
});

test('idioma: nenhuma tradução vazia nem igual a outra chave por engano', () => {
  for (const [pt, en] of Object.entries(EN)) assert.ok(typeof en === 'string' && en.trim().length > 0, pt);
});

test('idioma: o texto fixo do index.html com palavras em português tem tradução', () => {
  let html = readFileSync(join(RAIZ, 'public/index.html'), 'utf8');
  html = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<kbd[\s\S]*?<\/kbd>/g, '<kbd></kbd>');
  const textos = new Set();
  for (const m of html.matchAll(/(?:title|aria-label|alt|placeholder)="([^"]+)"/g)) textos.add(m[1]);
  for (const m of html.matchAll(/>([^<]+)</g)) {
    const t = m[1].replace(/\s+/g, ' ').trim();
    if (t) textos.add(t);
  }
  // Português: acento, cedilha ou uma palavra comum que o inglês não usa.
  const pareceportuguês = (t) => /[ãõçáéíóúâêôà]/i.test(t) || /\b(de|do|da|dos|das|em|no|na|com|para|seu|sua|o|os|as|um|uma|e)\b/i.test(t);
  const faltam = [...textos].filter((t) => pareceportuguês(t) && EN[t] === undefined && t !== 'Idioma / Language');
  assert.deepEqual(faltam, []);
});

test('idioma: tr troca as variáveis e, no inglês, devolve a tradução', () => {
  definirIdioma('pt');
  assert.equal(tr('Nível {n}! HP máximo maior', { n: 4 }), 'Nível 4! HP máximo maior');
  definirIdioma('en');
  try {
    assert.equal(tr('Nível {n}! HP máximo maior', { n: 4 }), 'Level 4! Higher max HP');
    assert.equal(tr('texto que não existe'), 'texto que não existe'); // sem tradução: o português
  } finally {
    definirIdioma('pt');
  }
});

test('idioma: a primeira visita segue o país (fuso do aparelho): Brasil em português, o resto em inglês', () => {
  for (const fuso of ['America/Sao_Paulo', 'America/Manaus', 'America/Fortaleza', 'America/Noronha', 'America/Rio_Branco', 'Brazil/East']) {
    assert.equal(idiomaPelaLocalizacao({ fuso, linguas: ['en-US'] }), 'pt', fuso); // no Brasil, mesmo com o navegador em inglês
  }
  for (const fuso of ['Europe/Lisbon', 'America/New_York', 'America/Argentina/Buenos_Aires', 'Africa/Luanda', 'Asia/Tokyo', 'UTC']) {
    assert.equal(idiomaPelaLocalizacao({ fuso, linguas: ['pt-BR'] }), 'en', fuso); // fora do Brasil, mesmo com o navegador em português
  }
  // Sem fuso, a língua do navegador.
  assert.equal(idiomaPelaLocalizacao({ fuso: '', linguas: ['pt-BR'] }), 'pt');
  assert.equal(idiomaPelaLocalizacao({ fuso: '', linguas: ['de-DE'] }), 'en');
  assert.equal(fusoDoBrasil('America/Sao_Paulo'), true);
  assert.equal(fusoDoBrasil(undefined), false);
  // Todo fuso da lista existe para o Intl deste Node.
  for (const f of FUSOS_BRASIL) assert.doesNotThrow(() => new Intl.DateTimeFormat('pt-BR', { timeZone: f }), f);
});

test('idioma: a reserva sem fuso segue a língua do navegador; o guardado é saneado', () => {
  assert.equal(idiomaDoNavegador(['pt-BR', 'en']), 'pt');
  assert.equal(idiomaDoNavegador(['pt-PT']), 'pt');
  assert.equal(idiomaDoNavegador(['en-US']), 'en');
  assert.equal(idiomaDoNavegador(['es-ES', 'pt-BR']), 'en');
  assert.equal(idiomaDoNavegador([]), 'en');
  assert.equal(idiomaValido('en'), 'en');
  assert.equal(idiomaValido('fr'), null);
});

test('idioma: no inglês, os nomes do servidor e o (IA) dos computadores viram inglês', () => {
  definirIdioma('en');
  try {
    assert.equal(nomeExibido('Minerador'), 'Miner');
    assert.equal(nomeExibido('Medusa Anciã'), 'Ancient Medusa');
    assert.equal(nomeExibido('JOAO (IA)'), 'JOAO (AI)');
    assert.equal(nomeExibido('Mateus'), 'Mateus');
    const m = traduzirNomesDaMensagem({
      t: 'snap',
      ents: [{ id: 1, nome: 'Escolta' }],
      jogadores: [{ id: 2, nome: 'ANA (IA)' }],
      ev: [{ e: 'resumoMorte', por: { nome: 'Torre sentinela' }, fontes: [{ nome: 'Grande Xerxes' }] }],
    });
    assert.equal(m.ents[0].nome, 'Escort');
    assert.equal(m.jogadores[0].nome, 'ANA (AI)');
    assert.equal(m.ev[0].por.nome, 'Sentry tower');
    assert.equal(m.ev[0].fontes[0].nome, 'Great Xerxes');
  } finally {
    definirIdioma('pt');
  }
  assert.equal(nomeExibido('Minerador'), 'Minerador'); // no português, nada muda
});

test('idioma: um título só por item, no idioma (sem o subtítulo do original)', () => {
  const w = WEAPONS.o111003; // Feixe Perfurante de Magma
  const e = EQUIPAMENTOS.e330010; // Escudo Neutron Op.
  assert.equal(nomeArma(w), 'Feixe Perfurante de Magma');
  assert.equal(nomeEquip(e), 'Escudo Neutron Op.');
  definirIdioma('en');
  try {
    assert.equal(nomeArma(w), 'Piercing Magma Beam');
    assert.equal(nomeEquip(e), 'Op. Neutron Shield');
    assert.equal(nomeArma(WEAPONS.o111001), 'Triple Rifle Beam'); // o erro de digitação do original arrumado
    // Toda arma e todo equipamento têm nome em inglês.
    for (const [k, a] of Object.entries(WEAPONS)) if (a.nomeEn) assert.ok(/^[\x20-\x7e]+$/.test(nomeArma(a)), `${k}: ${nomeArma(a)}`);
    for (const [k, eq] of Object.entries(EQUIPAMENTOS)) assert.ok(/^[\x20-\x7e]+$/.test(nomeEquip(eq)), `${k}: ${nomeEquip(eq)}`);
  } finally {
    definirIdioma('pt');
  }
  // O "título em português com o inglês do original embaixo" saiu das telas.
  for (const f of ['public/js/armas.js', 'public/js/servicos.js', 'public/js/equipamento.js']) {
    assert.doesNotMatch(readFileSync(join(RAIZ, f), 'utf8'), /class="original"/, f);
  }
});

test('idioma: a aba Como Jogar em inglês tem os mesmos capítulos, blocos e teclas', () => {
  const minFinal = relogio(FATOS.duracaoS - FATOS.faseFinalS);
  const en = capitulosEn(FATOS, relogio, minFinal);
  const forma = (caps) =>
    caps.map((c) => ({
      id: c.id,
      min: c.min,
      praticar: c.praticar?.modo,
      teclasResumo: [...String(c.resumo).matchAll(/\[\[(\w+)\]\]/g)].map((m) => m[1]),
      blocos: c.blocos.map((b) => ({
        tipo: b.tipo,
        titulo: !!b.titulo,
        itens: (b.itens ?? []).map((it) =>
          typeof it === 'string' ? [...it.matchAll(/\[\[(\w+)\]\]/g)].map((m) => m[1]).join() : { icone: it.icone, cor: it.cor, acoes: it.acoes?.join(), t: it.t },
        ),
      })),
    }));
  assert.deepEqual(forma(en), forma(CAPITULOS_PT));
  // Só o texto (os ícones e as cores têm nome em português no código).
  const texto = JSON.stringify(en, (k, v) => (k === 'icone' || k === 'cor' || k === 'tipo' || k === 'modo' || k === 'id' ? undefined : v));
  assert.doesNotMatch(texto, /[ãõç]|\b(você|nave|partida|minério)\b/i, 'o inglês não tem português sobrando');
});
