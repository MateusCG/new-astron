// Destruição como no original (public/js/destruicao.js): a unidade do original de cada
// coisa do jogo, os efeitos e sons dela convertidos e na lista do carregamento.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DESTRUICAO,
  EFEITOS_DESTRUICAO,
  EFEITOS_EXPLOSAO,
  MALHAS_DESTROCO,
  SONS_DESTRUICAO,
  destruicaoDe,
} from '../public/js/destruicao.js';
import { EFEITOS_ORIGINAIS, insumosDaPartida } from '../public/js/insumos.js';
import { ESPECIES } from '../server/especies.js';
import { RACAS_JOGAVEIS, FATOR_TAMANHO_NAVE } from '../shared/naves.js';

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const efeito = (id) => JSON.parse(readFileSync(path.join(PUBLIC, 'modelos/efeitos', `${id}.json`), 'utf8'));

test('destruição: toda nave, monstro, minerador, escolta, torre e o Núcleo têm a unidade do original', () => {
  for (const race of RACAS_JOGAVEIS) {
    const d = destruicaoDe({ tipo: 'jogador', race });
    assert.ok(d.cai, `${race}: as naves caem no original`);
    assert.equal(d.escala, FATOR_TAMANHO_NAVE);
  }
  assert.equal(destruicaoDe({ tipo: 'jogador', race: 'acron' }).efeito, 'exp003');
  assert.equal(destruicaoDe({ tipo: 'jogador', race: 'bellico' }).efeito, 'exp002');
  assert.equal(destruicaoDe({ tipo: 'jogador', race: 'shrewdo' }).efeito, 'exp001');
  for (const esp of Object.keys(ESPECIES)) assert.ok(destruicaoDe({ tipo: 'monstro', esp }), esp);
  for (const tipo of ['minerador', 'escolta', 'torreta', 'torreSuporte', 'nucleo']) assert.ok(destruicaoDe({ tipo }), tipo);
  // Quem não cai no original (col. 24 = 0): torres, Núcleo, Anti e a sonda.
  for (const k of ['torreta', 'torreSuporte', 'nucleo', 'anti', 'sonda']) assert.equal(DESTRUICAO[k].cai, false, k);
  // O minerador do Núcleo é 1,7× maior: a explosão também.
  assert.ok(destruicaoDe({ tipo: 'minerador', nucleo: true }).escala > DESTRUICAO.minerador.escala);
  // A nave que cresce ao evoluir solta a fumaça mais atrás (o corpo dela).
  assert.equal(destruicaoDe({ tipo: 'jogador', race: 'acron', corpo: 10 }).tam, 10 / FATOR_TAMANHO_NAVE);
  for (const [k, d] of Object.entries(DESTRUICAO)) {
    assert.ok(EFEITOS_EXPLOSAO.includes(d.efeito), k);
    assert.ok(d.escala > 0 && d.escala <= 1, k);
    if (d.cai) assert.ok(d.giro > 0, `${k}: quem cai gira`);
  }
});

test('destruição: as explosões, a fumaça, a faísca e os destroços convertidos, na lista do carregamento', () => {
  for (const id of EFEITOS_DESTRUICAO) {
    assert.ok(EFEITOS_ORIGINAIS.includes(id), id);
    const e = efeito(id);
    assert.equal(e.id, id);
  }
  assert.deepEqual(insumosDaPartida('acron', 'assault').efeitosOriginais.filter((id) => EFEITOS_DESTRUICAO.includes(id)), [...EFEITOS_DESTRUICAO]);
  // A bola de fogo troca de textura a cada quadro (a paleta do original).
  for (const id of EFEITOS_EXPLOSAO) {
    const e = efeito(id);
    assert.ok(e.mpal.length >= 20, `${id}: ${e.mpal.length} quadros de textura`);
    assert.ok(e.quadros >= 30, id);
  }
  // Os destroços são malhas paradas de um quadro, sólidas.
  for (const id of MALHAS_DESTROCO) {
    const e = efeito(id);
    assert.ok(e.malha);
    assert.equal(e.quadros, 1);
    assert.deepEqual(e.opacas, ['ex_particle']);
  }
});

test('destruição: os sons de morte e o da explosão existem e baixam na entrada', () => {
  const sons = insumosDaPartida('bellico', 'mobile').sons;
  assert.ok(SONS_DESTRUICAO.includes('h_explo'));
  for (const s of ['snzerod1', 'sekisd1', 'vajytd1', 'medusad1', 'aflyd1']) assert.ok(SONS_DESTRUICAO.includes(s), s);
  for (const s of SONS_DESTRUICAO) {
    assert.ok(existsSync(path.join(PUBLIC, 'sons', `${s}.wav`)), s);
    assert.ok(sons.includes(s), s);
  }
});
