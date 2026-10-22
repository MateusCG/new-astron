// Contrato dos modelos do mapa (public/modelos/mapa/): o teto de triângulos de cada tipo
// de peça (IDENTIDADE-VISUAL.md, padrão mid-poly PBR) e o que um glb PBR precisa trazer
// para o cliente (normais, UV, Draco e só materiais que mapa-modelos.js conhece).
// Lê só o JSON do glb: com Draco, os accessors continuam dizendo quantos índices há.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODELOS_MAPA } from '../public/js/insumos.js';

const PASTA = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'modelos', 'mapa');

/** Teto de triângulos por tipo de peça (o primeiro que casa com o nome vale). */
const TETOS = [
  [/^(plataforma|torre)/, 15000],
  [/^(rocha|borda|parede|pedra|fundo)/, 20000],
  [/^(coral|alga|cristais|ruina)/, 2000],
  [/./, 50000],
];

/** Materiais que um glb PBR pode trazer (o cliente acha cada um pelo nome). */
const MATERIAIS_PBR = /^(pbr_[a-z0-9_]+|neon_(time|servico|objetivo|luz|he3|doca_[01])|portal_time|he3_escuro)$/;

function lerGlb(nome) {
  const b = readFileSync(path.join(PASTA, `${nome}.glb`));
  const len = b.readUInt32LE(12);
  return JSON.parse(b.subarray(20, 20 + len).toString('utf8'));
}

function triangulos(j) {
  let t = 0;
  for (const m of j.meshes ?? []) {
    for (const p of m.primitives) {
      const n = p.indices != null ? j.accessors[p.indices].count : j.accessors[p.attributes.POSITION].count;
      t += n / 3;
    }
  }
  return t;
}

const ehPbr = (j) => (j.materials ?? []).some((m) => m.name?.startsWith('pbr_'));

test('modelos do mapa: nenhuma peça passa do teto de triângulos do tipo dela', () => {
  for (const nome of MODELOS_MAPA) {
    const teto = TETOS.find(([re]) => re.test(nome))[1];
    const t = triangulos(lerGlb(nome));
    assert.ok(t > 0 && t <= teto, `${nome}: ${t} triângulos (teto ${teto})`);
  }
});

test('modelos do mapa: as plataformas e a mineradora estão no padrão PBR', () => {
  for (const nome of ['plataforma-base', 'plataforma-servico', 'plataforma-pouso', 'mineradora']) assert.ok(ehPbr(lerGlb(nome)), nome);
});

test('modelos do mapa: glb PBR traz normais, UV e Draco, e só materiais conhecidos', () => {
  for (const nome of MODELOS_MAPA) {
    const j = lerGlb(nome);
    if (!ehPbr(j)) continue;
    assert.ok(j.extensionsRequired?.includes('KHR_draco_mesh_compression'), `${nome}: sem Draco`);
    assert.equal(j.images?.length ?? 0, 0, `${nome}: a textura é do cliente, não do glb`);
    for (const m of j.meshes) {
      for (const p of m.primitives) {
        assert.ok(p.attributes.NORMAL != null, `${nome}/${m.name}: sem normal`);
        assert.ok(p.attributes.TEXCOORD_0 != null, `${nome}/${m.name}: sem UV`);
      }
    }
    for (const mat of j.materials) assert.match(mat.name, MATERIAIS_PBR, `${nome}: material ${mat.name}`);
  }
});

test('modelos do mapa: os anéis e o emissor que a cena pinta continuam nas plataformas', () => {
  const mats = (nome) => new Set(lerGlb(nome).materials.map((m) => m.name));
  assert.ok(mats('plataforma-base').has('neon_time'));
  assert.ok(mats('plataforma-servico').has('neon_servico'));
  assert.ok(mats('plataforma-pouso').has('neon_objetivo'));
  assert.ok(lerGlb('plataforma-pouso').nodes.some((n) => n.name === 'emissor'));
});

test('modelos do mapa: a mineradora mantém as docas de cada time, o He-3 e os nós do contrato', () => {
  const j = lerGlb('mineradora');
  const mats = new Set(j.materials.map((m) => m.name));
  for (const m of ['neon_doca_0', 'neon_doca_1', 'neon_he3']) assert.ok(mats.has(m), m);
  const nos = new Set(j.nodes.map((n) => n.name));
  for (const n of ['mineradora', 'mineradora_casco', 'mineradora_conves', 'mineradora_he3', 'mineradora_fundo']) assert.ok(nos.has(n), n);
});
