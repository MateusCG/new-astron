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
import { NIVEL_AGUA, ABERTO } from '../shared/terrain.js';

const PASTA = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'modelos', 'mapa');

/** Teto de triângulos por tipo de peça (o primeiro que casa com o nome vale). */
const TETOS = [
  [/^(minerador|escolta)$/, 3000], // naves do servidor: até 26 na tela
  [/^(plataforma|torre|bacia|campo)/, 15000],
  [/^(rocha|borda|parede|pedra|fundo)/, 20000],
  [/^(coral|alga|cristais|ruina)/, 2000],
  [/./, 50000],
];

/** Materiais que um glb PBR pode trazer (o cliente acha cada um pelo nome). */
const MATERIAIS_PBR = /^(pbr_[a-z0-9_]+|neon_(time|servico|objetivo|luz|he3|doca_[01])|campo_doca_[01]|campo_base|portal_time|he3_escuro)$/;

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

const PBR = [
  'plataforma-base', 'plataforma-servico', 'plataforma-pouso', 'mineradora', 'torre-suporte', 'torre-suporte-caida', 'torreta',
  'minerador', 'escolta', 'base-warp', 'rocha-quadrante', 'rocha-quadrante-b', 'parede-l', 'parede-l-espelhada',
  'borda-quadrante', 'borda-quadrante-espelhada', 'borda-horizonte', 'pedra-lago-1', 'pedra-lago-2', 'nucleo', 'ruina-submersa',
  'bacia', 'campo-base', 'agua',
];

test('modelos do mapa: as plataformas, a mineradora, as torres, as naves do servidor, o portal, as rochas, o Núcleo, a ruína, a bacia, o campo da base e a água estão no padrão PBR', () => {
  for (const nome of PBR) assert.ok(ehPbr(lerGlb(nome)), nome);
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
  for (const m of ['neon_doca_0', 'neon_doca_1', 'neon_he3', 'campo_doca_0', 'campo_doca_1']) assert.ok(mats.has(m), m);
  const nos = new Set(j.nodes.map((n) => n.name));
  for (const n of ['mineradora', 'mineradora_casco', 'mineradora_conves', 'mineradora_he3', 'mineradora_fundo', 'mineradora_campo']) assert.ok(nos.has(n), n);
});

test('modelos do mapa: as torres trazem os nós que o cliente mexe, com o pivô no lugar', () => {
  const no = (j, nome) => j.nodes.find((n) => n.name === nome);
  const sup = lerGlb('torre-suporte');
  assert.deepEqual(no(sup, 'suporte_nucleo')?.translation?.map(Math.round), [0, 80, 0], 'a cabeça da antena gira no eixo, em cima do mastro');
  assert.ok(sup.materials.some((m) => m.name === 'neon_objetivo'));
  assert.ok(lerGlb('torre-suporte-caida').materials.some((m) => m.name === 'neon_objetivo'));
  const t = lerGlb('torreta');
  const corpo = no(t, 'torreta_corpo');
  const cabeca = no(t, 'torreta_cabeca');
  assert.ok(corpo && no(t, 'torreta_destrocos') && no(t, 'torreta_base'));
  assert.ok(corpo.children?.map((i) => t.nodes[i]).includes(cabeca), 'a cabeça tomba junto com o corpo');
  assert.deepEqual(cabeca.translation?.map(Math.round), [0, 9, 0], 'a cabeça gira no eixo, logo abaixo da altura de voo');
  assert.ok(t.materials.some((m) => m.name === 'neon_time'));
});

test('modelos do mapa: o minerador e a escolta trazem o neon do time e os nós que o cliente mexe', () => {
  const no = (j, nome) => j.nodes.find((n) => n.name === nome);
  const m = lerGlb('minerador');
  assert.ok(no(m, 'minerador_carga'), 'o minério que aparece com o contêiner cheio');
  assert.ok(m.materials.some((x) => x.name === 'neon_time'));
  const e = lerGlb('escolta');
  const torre = no(e, 'escolta_torre');
  assert.deepEqual(torre?.translation?.map((v) => Math.round(v * 10) / 10), [0, 0.6, 0.6], 'a torre gira no eixo dela');
  assert.ok(e.materials.some((x) => x.name === 'neon_time'));
});

test('modelos do mapa: o portal warp traz a membrana do redemoinho, o neon do time e os nós do contrato', () => {
  const j = lerGlb('base-warp');
  const nos = new Set(j.nodes.map((n) => n.name));
  for (const n of ['base-warp', 'portal', 'portal_membrana', 'ilha', 'pendurados']) assert.ok(nos.has(n), n);
  const mats = new Set(j.materials.map((m) => m.name));
  assert.ok(mats.has('portal_time') && mats.has('neon_time'));
  // Tudo acima de PORTAL_WARP.base (30 m): a nave passa por baixo.
  const minY = Math.min(...j.meshes.flatMap((m) => m.primitives.map((p) => j.accessors[p.attributes.POSITION].min[1])));
  assert.ok(minY > 30, `peça mais baixa a ${minY} m`);
});

test('modelos do mapa: as rochas e a borda são um material só, a rocha PBR, com o tom dos estratos na cor do vértice', () => {
  // Um material por estrato abria frestas: o Draco quantiza cada material numa grade própria.
  for (const nome of ['rocha-quadrante', 'rocha-quadrante-b', 'parede-l', 'parede-l-espelhada', 'borda-quadrante', 'borda-quadrante-espelhada', 'borda-horizonte', 'pedra-lago-1', 'pedra-lago-2']) {
    const j = lerGlb(nome);
    assert.deepEqual(j.materials.map((m) => m.name), ['pbr_rocha'], nome);
    for (const m of j.meshes) for (const p of m.primitives) assert.ok(p.attributes.COLOR_0 != null, `${nome}: sem a cor do vértice`);
  }
});

test('modelos do mapa: o Núcleo traz os nós que a cena gira, com o pivô no centro do cristal, e o âmbar e o He-3 que ela acende', () => {
  const j = lerGlb('nucleo');
  const no = (nome) => j.nodes.find((n) => n.name === nome);
  for (const n of ['nucleo_cristal', 'nucleo_lascas', 'nucleo_anel_1', 'nucleo_anel_2', 'nucleo_anel_3']) {
    assert.deepEqual(no(n)?.translation?.map(Math.round), [0, 18, 0], `${n} gira no centro do cristal`);
  }
  for (const n of ['nucleo_base', 'nucleo_estabilizadores']) assert.ok(no(n) && !no(n).translation, `${n} na origem`);
  const mats = new Set(j.materials.map((m) => m.name));
  assert.ok(mats.has('neon_objetivo') && mats.has('neon_he3'));
});

test('modelos do mapa: a ruína submersa é pedra PBR com a cor do vértice e os cristais de He-3, toda embaixo d\'água', () => {
  const j = lerGlb('ruina-submersa');
  const pedra = j.meshes.find((m) => m.primitives.some((p) => j.materials[p.material].name === 'pbr_rocha'));
  assert.ok(pedra?.primitives.every((p) => p.attributes.COLOR_0 != null));
  assert.ok(j.materials.some((m) => m.name === 'neon_he3'));
  const maxY = Math.max(...j.meshes.flatMap((m) => m.primitives.map((p) => j.accessors[p.attributes.POSITION].max[1])));
  assert.ok(maxY < -20, `topo a ${maxY} m`);
});

/**
 * Caixa de cada primitiva no referencial da peça: a caixa do accessor (min/max da POSITION) mais
 * a translação dos nós acima dela (estas peças não giram nem escalam nó nenhum).
 */
function caixasNoMundo(j) {
  const pai = new Map();
  j.nodes.forEach((n, i) => (n.children ?? []).forEach((c) => pai.set(c, i)));
  const out = [];
  j.nodes.forEach((n, i) => {
    if (n.mesh == null) return;
    const t = [0, 0, 0];
    for (let k = i; k != null; k = pai.get(k)) {
      const nk = j.nodes[k];
      assert.ok(!nk.rotation && !nk.scale, `${nk.name}: nó girado ou escalado`);
      (nk.translation ?? [0, 0, 0]).forEach((v, e) => (t[e] += v));
    }
    for (const p of j.meshes[n.mesh].primitives) {
      const a = j.accessors[p.attributes.POSITION];
      out.push({ no: n.name, material: j.materials[p.material]?.name, min: a.min.map((v, e) => v + t[e]), max: a.max.map((v, e) => v + t[e]) });
    }
  });
  return out;
}

test('modelos do mapa: a bacia fica abaixo do voo, com o minério separado e o pivô dele no fundo', () => {
  const j = lerGlb('bacia');
  const no = (nome) => j.nodes.find((n) => n.name === nome);
  for (const n of ['bacia', 'bacia_estrutura', 'bacia_luzes', 'bacia_minerio']) assert.ok(no(n), n);
  // O cliente sobe o minério em y: o pivô é a base da pilha, posta no fundo de dentro (−40).
  assert.deepEqual(no('bacia_minerio').translation?.map(Math.round), [0, -40, 0]);
  const caixas = caixasNoMundo(j);
  const topo = Math.max(...caixas.map((c) => c.max[1]));
  assert.ok(topo <= 3.5, `topo a ${topo} m (a nave passa por cima a 10 m)`);
  // a pilha cabe no raio de dentro (19 m) com folga para subir sem raspar
  for (const c of caixas.filter((c) => c.no === 'bacia_minerio')) {
    assert.ok(Math.max(-c.min[0], c.max[0], -c.min[2], c.max[2]) <= 18.65, `minério (${c.material}) passa do raio`);
  }
  const mats = new Set(j.materials.map((m) => m.name));
  for (const m of ['neon_time', 'neon_he3', 'pbr_minerio']) assert.ok(mats.has(m), m);
});

test('modelos do mapa: o campo da base traz a membrana e os emissores, sem nada no vão na altura das naves', () => {
  const j = lerGlb('campo-base');
  const no = (nome) => j.nodes.find((n) => n.name === nome);
  assert.ok(no('campo_emissores'), 'campo_emissores');
  const membrana = no('campo_membrana');
  assert.ok(membrana?.mesh != null, 'campo_membrana');
  const prims = j.meshes[membrana.mesh].primitives;
  assert.deepEqual(prims.map((p) => j.materials[p.material].name), ['campo_base']);
  assert.ok(prims[0].attributes.TEXCOORD_0 != null);
  assert.ok(j.materials.some((m) => m.name === 'neon_time'));
  // Fora a membrana, cada pedaço fica abaixo de 2 m, acima de 30 m ou encostado na rocha (|z| ≥ 176):
  // o vão fica livre para as naves do time passarem.
  for (const c of caixasNoMundo(j)) {
    if (c.no === 'campo_membrana') continue;
    const encostado = c.min[2] >= 176 || c.max[2] <= -176;
    assert.ok(c.max[1] <= 2 || c.min[1] >= 30 || encostado, `${c.no} (${c.material}) entra no vão: y ${c.min[1]}…${c.max[1]}, z ${c.min[2]}…${c.max[2]}`);
  }
});

test('modelos do mapa: a água é um plano em NIVEL_AGUA que cobre o lago inteiro, num material só', () => {
  // O shader (agua.js) dá as ondas em volta de NIVEL_AGUA; a malha só corta o que fica embaixo da rocha.
  const j = lerGlb('agua');
  assert.deepEqual(j.materials.map((m) => m.name), ['pbr_agua']);
  const pos = j.meshes.flatMap((m) => m.primitives.map((p) => j.accessors[p.attributes.POSITION]));
  const min = (i) => Math.min(...pos.map((a) => a.min[i]));
  const max = (i) => Math.max(...pos.map((a) => a.max[i]));
  assert.ok(Math.abs(min(1) - NIVEL_AGUA) < 0.05 && Math.abs(max(1) - NIVEL_AGUA) < 0.05, `y ${min(1)}…${max(1)}`);
  assert.ok(min(0) <= -ABERTO.lane.meiaX && max(0) >= ABERTO.lane.meiaX, `x ${min(0)}…${max(0)}`);
  assert.ok(min(2) <= -ABERTO.jungle.meiaZ && max(2) >= ABERTO.jungle.meiaZ, `z ${min(2)}…${max(2)}`);
});
