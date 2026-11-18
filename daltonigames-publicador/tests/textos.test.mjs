import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lerArgumentos, lista, retangulo, segundos } from '../lib/argumentos.js';
import { metadadosYoutube, legendaTiktok, tagsYoutube, LIMITES } from '../lib/textos.js';

test('argumentos: posicionais, --chave valor, --chave=valor e bandeira', () => {
  const { pos, op } = lerArgumentos(['enviar', 'a.mp4', '--titulo', 'Oi mundo', '--tags=a,b', '--confirmar', '--ia']);
  assert.deepEqual(pos, ['enviar', 'a.mp4']);
  assert.equal(op.titulo, 'Oi mundo');
  assert.equal(op.tags, 'a,b');
  assert.equal(op.confirmar, true);
  assert.equal(op.ia, true);
  assert.deepEqual(lista(' a, b ,,c'), ['a', 'b', 'c']);
});

test('tempo e retângulo', () => {
  assert.equal(segundos('1:20', 'x'), 80);
  assert.equal(segundos('01:01:20', 'x'), 3680);
  assert.equal(segundos('12.5', 'x'), 12.5);
  assert.throws(() => segundos('1:aa', 'x'));
  assert.deepEqual(retangulo('1500,40,380,300', 'camera'), { x: 1500, y: 40, l: 380, a: 300 });
  assert.throws(() => retangulo('1,2,3', 'camera'));
  assert.throws(() => retangulo('1,2,0,4', 'camera'));
});

test('YouTube: corpo do videos.insert com Jogos, pt-BR e o aviso de IA', () => {
  const { corpo } = metadadosYoutube({ titulo: 'Hades II <daltônico>', descricao: 'linha 1\nlinha 2', tags: ['#hades', 'daltonismo'], privacidade: 'publico', ia: true });
  assert.equal(corpo.snippet.title, 'Hades II daltônico');
  assert.equal(corpo.snippet.categoryId, '20');
  assert.deepEqual(corpo.snippet.tags, ['hades', 'daltonismo']);
  assert.equal(corpo.status.privacyStatus, 'public');
  assert.equal(corpo.status.containsSyntheticMedia, true);
  assert.equal(corpo.status.selfDeclaredMadeForKids, false);
});

test('YouTube: título vazio ou longo demais e privacidade errada falham', () => {
  assert.throws(() => metadadosYoutube({ titulo: '' }));
  assert.throws(() => metadadosYoutube({ titulo: 'x'.repeat(101) }));
  assert.throws(() => metadadosYoutube({ titulo: 'ok', privacidade: 'todos' }));
});

test('YouTube: agendar vira privado com publishAt', () => {
  const { corpo } = metadadosYoutube({ titulo: 'ok', privacidade: 'publico', agendar: '2026-11-20T18:00:00-03:00' });
  assert.equal(corpo.status.privacyStatus, 'private');
  assert.equal(corpo.status.publishAt, '2026-11-20T21:00:00.000Z');
  assert.throws(() => metadadosYoutube({ titulo: 'ok', agendar: 'amanhã' }));
});

test('YouTube: tags param nos 500 caracteres e descrição nos 5000 bytes', () => {
  const muitas = Array.from({ length: 60 }, (_, i) => `tag numero ${i}`);
  const t = tagsYoutube(muitas);
  const custo = t.tags.reduce((s, x, i) => s + x.length + (x.includes(' ') ? 2 : 0) + (i ? 1 : 0), 0);
  assert.ok(custo <= LIMITES.youtubeTags);
  assert.ok(t.fora.length > 0);
  const { corpo } = metadadosYoutube({ titulo: 'ok', descricao: 'é'.repeat(4000) });
  assert.ok(Buffer.byteLength(corpo.snippet.description) <= 5000);
  assert.ok(!corpo.snippet.description.includes('�'));
});

test('TikTok: legenda junta título, descrição e hashtags, até 2200', () => {
  assert.equal(legendaTiktok({ titulo: 'Oi', descricao: 'Desc', tags: ['hades 2', '#daltonismo'] }), 'Oi\n\nDesc\n\n#hades2 #daltonismo');
  assert.equal(legendaTiktok({ titulo: 'x', legenda: 'só isto' }), 'só isto');
  assert.equal(legendaTiktok({ titulo: 'x'.repeat(3000) }).length, LIMITES.tiktokLegenda);
});
