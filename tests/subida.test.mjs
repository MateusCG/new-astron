// Subir de nível e evoluir a nave: a linha do tempo do efeito nosso (subida-regras.js) e
// as malhas de luz do Blender (public/modelos/mapa/subida-nivel.glb, desenhadas por subida.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { quadroSubida, SUBIDA_S, SUBIDA_FORTE_S, FEIXE_ALTURA } from '../public/js/subida-regras.js';
import { MODELOS_MAPA, EFEITOS_ORIGINAIS } from '../public/js/insumos.js';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const quadros = (forte) => {
  const fim = forte ? SUBIDA_FORTE_S : SUBIDA_S;
  const lista = [];
  for (let t = 0; t < fim; t += 1 / 30) lista.push([t, quadroSubida(t, forte)]);
  return lista;
};

test('subida: curta, a luz chega ao alto em menos de 0,35 s e tudo apaga no fim', () => {
  assert.ok(SUBIDA_S <= 1.5 && SUBIDA_FORTE_S <= 1.8, 'curta: não polui a tela');
  assert.equal(quadroSubida(SUBIDA_S), null);
  assert.equal(quadroSubida(-0.1), null);
  assert.ok(quadroSubida(SUBIDA_S, true), 'a evolução dura mais');
  assert.ok(quadroSubida(0.35).feixe.cabeca > 0.99, 'a cabeça do feixe no alto');
  assert.ok(quadroSubida(0.12).feixe.cabeca < 0.7, 'sobe, não aparece inteiro');
  assert.equal(quadroSubida(0).feixe.altura, FEIXE_ALTURA);
  for (const forte of [false, true]) {
    const lista = quadros(forte);
    for (const [t, q] of lista) {
      for (const a of [q.clarao.alfa, q.selo.alfa, q.feixe.alfa, q.helice.alfa, ...q.ondas.map((o) => o.alfa)]) {
        assert.ok(a >= 0 && a <= 1, `t ${t}: alfa ${a}`);
      }
    }
    const [, ultimo] = lista.at(-1);
    assert.ok(ultimo.selo.alfa < 0.15 && ultimo.feixe.alfa < 0.15 && ultimo.helice.alfa === 0 && ultimo.clarao.alfa === 0, 'apaga no fim');
    // O feixe afina enquanto apaga.
    assert.ok(lista.at(-1)[1].feixe.raio < lista[10][1].feixe.raio / 3);
  }
});

test('subida: o selo carimba (passa do tamanho e volta), a evolução tem duas ondas e é maior', () => {
  const raios = quadros(false).map(([, q]) => q.selo.raio);
  const maior = Math.max(...raios);
  assert.ok(raios[0] < 0.7 && maior > 1.08 && quadroSubida(0.4).selo.raio < maior, `${raios[0]} → ${maior}`);
  assert.equal(quadroSubida(0.3).ondas.length, 1);
  assert.equal(quadroSubida(0.3, true).ondas.length, 2);
  assert.ok(quadroSubida(0.2, true).feixe.raio > quadroSubida(0.2).feixe.raio);
  // A hélice roda e o rastro sai pelo alto (a cabeça passa do fim da fita).
  assert.ok(quadroSubida(0.9).helice.cabeca > 1.5);
});

function lerGlb(nome) {
  const b = readFileSync(path.join(RAIZ, 'public/modelos/mapa', `${nome}.glb`));
  return JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString('utf8'));
}

test('subida: as malhas de luz são nossas, do Blender, e baixam na tela de carregamento', () => {
  assert.ok(MODELOS_MAPA.includes('subida-nivel'));
  for (const id of ['lvup001', 'lvup002', 'lvup003']) assert.ok(!EFEITOS_ORIGINAIS.includes(id), `${id}: o efeito do original saiu`);
  const j = lerGlb('subida-nivel');
  assert.deepEqual(j.nodes.map((n) => n.name).sort(), ['subida_feixe', 'subida_helice', 'subida_onda', 'subida_selo']);
  assert.ok(j.extensionsRequired?.includes('KHR_draco_mesh_compression'), 'Draco');
  assert.equal(j.images?.length ?? 0, 0);
  let tris = 0;
  for (const m of j.meshes) {
    for (const p of m.primitives) {
      assert.ok(p.attributes.NORMAL != null && p.attributes.TEXCOORD_0 != null, `${m.name}: normal e UV`);
      tris += j.accessors[p.indices].count / 3;
    }
  }
  assert.ok(tris > 500 && tris <= 2500, `${tris} triângulos (mid-poly de efeito, como a decoração)`);
  assert.deepEqual(j.materials.map((m) => m.name), ['luz_subida']);
});
