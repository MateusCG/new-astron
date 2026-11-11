// Qualidade gráfica das Configurações (public/js/qualidade-regras.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  QUALIDADES,
  QUALIDADE_PADRAO,
  CHAVE_QUALIDADE,
  ajustesDaQualidade,
  sanearQualidade,
  lerQualidade,
  guardarQualidade,
} from '../public/js/qualidade-regras.js';
import { EN } from '../shared/idioma-en.js';

function armazem(inicial = {}) {
  const dados = { ...inicial };
  return { getItem: (k) => dados[k] ?? null, setItem: (k, v) => (dados[k] = String(v)), dados };
}

test('três níveis, Alta por padrão (o visual de antes)', () => {
  assert.deepEqual(QUALIDADES.map((q) => q.id), ['baixa', 'media', 'alta']);
  assert.equal(QUALIDADE_PADRAO, 'alta');
  const alta = ajustesDaQualidade('alta', 3);
  assert.deepEqual(alta, { pixelRatio: 2, antialias: true, sombra: { mapa: 2048, suave: true } });
});

test('cada nível pesa menos que o de cima', () => {
  for (const dpr of [1, 1.5, 2]) {
    const [b, m, a] = ['baixa', 'media', 'alta'].map((id) => ajustesDaQualidade(id, dpr));
    assert.ok(b.pixelRatio < m.pixelRatio || (b.pixelRatio < 1 && m.pixelRatio === 1));
    assert.ok(m.pixelRatio <= a.pixelRatio);
    assert.equal(b.sombra, null);
    assert.equal(b.antialias, false);
    assert.ok(m.sombra.mapa < a.sombra.mapa);
  }
  assert.equal(ajustesDaQualidade('baixa', 2).pixelRatio, 0.75);
  assert.equal(ajustesDaQualidade('media', 2).pixelRatio, 1);
});

test('o guardado é saneado e o armazém que falha não quebra', () => {
  assert.equal(sanearQualidade('ultra'), 'alta');
  assert.equal(lerQualidade(armazem()), 'alta');
  assert.equal(lerQualidade(armazem({ [CHAVE_QUALIDADE]: 'baixa' })), 'baixa');
  assert.equal(lerQualidade({ getItem() { throw new Error('bloqueado'); } }), 'alta');
  const a = armazem();
  assert.equal(guardarQualidade('media', a), true);
  assert.equal(a.dados[CHAVE_QUALIDADE], 'media');
  assert.equal(guardarQualidade('ultra', a), false);
  assert.equal(a.dados[CHAVE_QUALIDADE], 'media');
});

test('a seção Gráficos está nas Configurações e os textos têm inglês', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(html, /data-secao="graficos"[^>]*>Gráficos</);
  assert.match(html, /class="opcoes-qualidade"/);
  for (const q of QUALIDADES) {
    assert.ok(EN[q.nome], q.nome);
    assert.ok(EN[q.descricao], q.descricao);
  }
});
