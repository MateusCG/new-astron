// As naves de jogador mid-poly PBR (public/js/nave-pbr-regras.js): os arquivos de
// cada material e o contrato dos 45 glb (a mesma forma, o mesmo layout de UV e os
// mesmos encaixes do original, que fica em tools/dados/naves-original/).
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAPAS_PBR, sufixoDoMaterial, arquivosDoMaterial } from '../public/js/nave-pbr-regras.js';
import { naveAquecida } from '../public/js/carregamento-regras.js';
import { NAVES, RACAS_JOGAVEIS, ORDEM_CLASSES } from '../shared/naves.js';
import { World } from '../server/game.js';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(RAIZ, 'public');
const ORIGINAL = path.join(RAIZ, 'tools/dados/naves-original');
/** Teto de triângulos de uma nave de jogador mid-poly (IDENTIDADE-VISUAL.md). */
const TETO_TRIANGULOS = 8000;
/** O quanto a caixa pode diferir da do original (o chanfro come a quina: DESVIO_MAX de nave_pbr_malha.py). */
const FOLGA_CAIXA = 0.25;
const MODELOS = RACAS_JOGAVEIS.flatMap((r) => ORDEM_CLASSES.flatMap((c) => NAVES[r][c].map((n) => n.modelo)));

function lerGlb(arquivo) {
  const b = readFileSync(arquivo);
  const tam = b.readUInt32LE(12);
  const json = JSON.parse(b.subarray(20, 20 + tam).toString());
  const inicio = 20 + tam + 8;
  return { json, bin: b.subarray(inicio) };
}

const caixa = (json) => {
  const ps = json.meshes.flatMap((m) => m.primitives).map((p) => json.accessors[p.attributes.POSITION]);
  return [0, 1, 2].map((k) => [Math.min(...ps.map((p) => p.min[k])), Math.max(...ps.map((p) => p.max[k]))]);
};
const triangulos = (json) => json.meshes.flatMap((m) => m.primitives).reduce((s, p) => s + json.accessors[p.indices ?? p.attributes.POSITION].count / 3, 0);

/** Largura de um .webp (VP8, VP8L ou VP8X). */
function ladoWebp(arquivo) {
  const b = readFileSync(arquivo);
  const tipo = b.toString('latin1', 12, 16);
  if (tipo === 'VP8 ') return b.readUInt16LE(26) & 0x3fff;
  if (tipo === 'VP8L') return (b.readUInt32LE(21) & 0x3fff) + 1;
  return b.readUIntLE(24, 3) + 1;
}

test('nave PBR: o material do glb diz os arquivos dos mapas', () => {
  assert.equal(sufixoDoMaterial('pbr_nave'), '');
  assert.equal(sufixoDoMaterial('pbr_nave_2'), '_2');
  for (const nome of ['14_Ulysses_mat0', 'pbr_painel', 'pbr_nave_x', undefined]) assert.equal(sufixoDoMaterial(nome), null);
  assert.deepEqual(arquivosDoMaterial('/modelos/naves/acron/assault/ulysses.glb', 'pbr_nave'), {
    cor: '/modelos/naves/acron/assault/ulysses_cor.webp',
    mr: '/modelos/naves/acron/assault/ulysses_mr.webp',
    normal: '/modelos/naves/acron/assault/ulysses_normal.webp',
    emissivo: '/modelos/naves/acron/assault/ulysses_emissivo.webp',
  });
  assert.equal(arquivosDoMaterial('/modelos/naves/shrewdo/functional/techron-wing.glb', 'pbr_nave_1').cor, '/modelos/naves/shrewdo/functional/techron-wing_1_cor.webp');
  assert.equal(arquivosDoMaterial('/x.glb', 'outro'), null);
});

test('nave PBR: as 45 naves com a forma, a UV e os encaixes do original, mais triângulos e os mapas na pasta', () => {
  assert.equal(MODELOS.length, 45);
  for (const modelo of MODELOS) {
    const antes = lerGlb(path.join(ORIGINAL, modelo.replace(/^modelos\/naves\//, ''))).json;
    const depois = lerGlb(path.join(PUBLIC, modelo)).json;
    // Os nós (propulsão, armas, jatos) saem como entraram (o texto: -0 e 0 são o mesmo número).
    assert.equal(JSON.stringify(depois.nodes), JSON.stringify(antes.nodes), modelo);
    // A caixa é a do original, menos o que o chanfro come de uma quina.
    caixa(antes).forEach(([min, max], k) => {
      assert.ok(Math.abs(min - caixa(depois)[k][0]) <= FOLGA_CAIXA && Math.abs(max - caixa(depois)[k][1]) <= FOLGA_CAIXA, `${modelo} eixo ${k}`);
    });
    const tris = triangulos(depois);
    assert.ok(tris > triangulos(antes) * 2.5 && tris <= TETO_TRIANGULOS, `${modelo}: ${tris} triângulos`);
    assert.equal(depois.meshes.length, antes.meshes.length, modelo);
    for (const p of depois.meshes.flatMap((m) => m.primitives)) assert.ok(p.attributes.NORMAL !== undefined && p.attributes.TEXCOORD_0 !== undefined, modelo);
    // Sem imagem dentro: um material por imagem do original, com os quatro mapas ao lado.
    assert.equal(depois.images, undefined, modelo);
    assert.equal(depois.materials.length, antes.images.length, modelo);
    depois.materials.forEach((mat) => {
      const arq = arquivosDoMaterial('/' + modelo, mat.name);
      assert.ok(arq, `${modelo}: material ${mat.name}`);
      for (const m of MAPAS_PBR) assert.ok(existsSync(path.join(PUBLIC, arq[m])), arq[m]);
      // A cor e o relevo com 4× o lado do original; a rugosidade e o emissivo, a metade.
      const k = Number(/_(\d+)$/.exec(mat.name)?.[1] ?? 0);
      const vista = antes.bufferViews[antes.images[k].bufferView];
      const original = lerGlb(path.join(ORIGINAL, modelo.replace(/^modelos\/naves\//, ''))).bin.readUInt32BE((vista.byteOffset ?? 0) + 16);
      assert.deepEqual(MAPAS_PBR.map((m) => ladoWebp(path.join(PUBLIC, arq[m]))), [original * 4, original * 2, original * 4, original * 2], `${modelo} ${mat.name}`);
    });
  }
});

test('nave PBR: a tela de carregamento só manda à placa de vídeo a linha do piloto e a primeira de cada linha', () => {
  const todas = RACAS_JOGAVEIS.flatMap((race) => ORDEM_CLASSES.flatMap((classe) => NAVES[race][classe].map((n) => ({ race, classe, tier: n.tier }))));
  const aquecidas = todas.filter((n) => naveAquecida(n, 'acron', 'assault'));
  assert.equal(aquecidas.length, 5 + 8);
  assert.ok(aquecidas.some((n) => n.race === 'acron' && n.classe === 'assault' && n.tier === 4));
  assert.ok(aquecidas.some((n) => n.race === 'shrewdo' && n.classe === 'mobile' && n.tier === 0));
  assert.ok(!aquecidas.some((n) => n.race === 'shrewdo' && n.tier > 0));
});

test('modo de teste: "nave" dá a última nave da linha na hora, e só no mundo de teste', () => {
  const w = new World({ teste: true, jungle: false, torretas: false });
  const { id } = w.addPlayer('Piloto', 'shrewdo', 'functional');
  const j = w.players.get(id);
  assert.equal(j.tier, 0);
  const hp = j.ship.maxHp;
  assert.equal(w.pedidoTeste(id, { acao: 'nave' }).ok, true);
  assert.equal(j.tier, 4);
  assert.ok(j.ship.maxHp > hp);
  assert.ok(w.eventos.some((e) => e.e === 'nave' && e.id === id && e.nave === 'Cyclone Wing'));
  assert.deepEqual(w.pedidoTeste(id, { acao: 'nave' }), { t: 'resultado', acao: 'teste', item: 'nave', ok: false, codigo: 'limite' });
  const real = new World({ jungle: false, torretas: false });
  const outro = real.addPlayer('Piloto', 'shrewdo', 'functional');
  assert.equal(real.pedidoTeste(outro.id, { acao: 'nave' }).codigo, 'invalido');
  assert.equal(real.players.get(outro.id).tier, 0);
});
