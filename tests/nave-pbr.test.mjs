// Protótipo da nave mid-poly PBR (public/js/nave-pbr-regras.js): quais naves têm a
// versão nova, os arquivos dela, a escolha "antes ou depois" e o contrato do glb (a
// mesma forma, o mesmo layout de UV e os mesmos encaixes do original).
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NAVES_PBR, MAPAS_PBR, CHAVE_NAVE_PBR, temPbr, arquivosPbr, lerNavePbr, guardarNavePbr } from '../public/js/nave-pbr-regras.js';
import { NAVES, RACAS_JOGAVEIS, ORDEM_CLASSES } from '../shared/naves.js';
import { World } from '../server/game.js';

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
/** Teto de triângulos de uma nave de jogador mid-poly (IDENTIDADE-VISUAL.md). */
const TETO_TRIANGULOS = 8000;

function lerGlb(url) {
  const b = readFileSync(path.join(PUBLIC, url));
  const tam = b.readUInt32LE(12);
  return JSON.parse(b.subarray(20, 20 + tam).toString());
}

const caixa = (json) => {
  const ps = json.meshes.flatMap((m) => m.primitives).map((p) => json.accessors[p.attributes.POSITION]);
  return [0, 1, 2].map((k) => [Math.min(...ps.map((p) => p.min[k])), Math.max(...ps.map((p) => p.max[k]))]);
};

test('nave PBR: só naves do catálogo, com o glb e os quatro mapas na pasta', () => {
  const catalogo = new Set(RACAS_JOGAVEIS.flatMap((r) => ORDEM_CLASSES.flatMap((c) => NAVES[r][c].map((n) => n.modelo))));
  assert.deepEqual([...NAVES_PBR], ['modelos/naves/shrewdo/functional/cyclone-wing.glb', 'modelos/naves/acron/assault/ulysses.glb']);
  for (const modelo of NAVES_PBR) {
    assert.ok(catalogo.has(modelo), modelo);
    assert.ok(temPbr(modelo));
    const arq = arquivosPbr(modelo);
    assert.match(arq.glb, /^\/modelos\/naves-pbr\/.+\.glb$/);
    for (const url of [arq.glb, ...MAPAS_PBR.map((m) => arq[m])]) assert.ok(existsSync(path.join(PUBLIC, url)), url);
  }
  assert.equal(temPbr('modelos/naves/acron/assault/warrior.glb'), false);
  assert.equal(arquivosPbr('modelos/naves/acron/assault/warrior.glb'), null);
});

test('nave PBR: a mesma forma, a mesma UV e os mesmos encaixes do original, com mais triângulos', () => {
  for (const modelo of NAVES_PBR) {
    const [antes, depois] = [lerGlb('/' + modelo), lerGlb(arquivosPbr(modelo).glb)];
    // Os nós (propulsão, armas, jatos) saem como entraram.
    assert.equal(JSON.stringify(depois.nodes), JSON.stringify(antes.nodes)); // (o texto: -0 e 0 são o mesmo número)
    // A caixa é a do original, menos o que o chanfro come de uma quina.
    caixa(antes).forEach(([min, max], k) => {
      assert.ok(Math.abs(min - caixa(depois)[k][0]) <= 0.25 && Math.abs(max - caixa(depois)[k][1]) <= 0.25, `eixo ${k}`);
    });
    const prims = depois.meshes.flatMap((m) => m.primitives);
    const tris = prims.reduce((s, p) => s + depois.accessors[p.indices].count / 3, 0);
    const trisAntes = antes.meshes.flatMap((m) => m.primitives).reduce((s, p) => s + antes.accessors[p.indices ?? p.attributes.POSITION].count / 3, 0);
    assert.ok(tris > trisAntes * 3 && tris <= TETO_TRIANGULOS, `${tris} triângulos`);
    for (const p of prims) {
      assert.ok(p.attributes.NORMAL !== undefined && p.attributes.TEXCOORD_0 !== undefined);
    }
    // Sem imagem dentro: os mapas são os .webp ao lado.
    assert.equal(depois.images, undefined);
    assert.equal(depois.materials[0].name, 'pbr_nave');
  }
});

test('nave PBR: a escolha fica no navegador, e sem nada guardado vale o depois', () => {
  const guardado = new Map();
  const storage = { getItem: (k) => guardado.get(k) ?? null, setItem: (k, v) => guardado.set(k, v) };
  assert.equal(lerNavePbr(storage), true);
  guardarNavePbr(storage, false);
  assert.equal(guardado.get(CHAVE_NAVE_PBR), '0');
  assert.equal(lerNavePbr(storage), false);
  guardarNavePbr(storage, true);
  assert.equal(lerNavePbr(storage), true);
  // Navegador que recusa o armazenamento: segue com o padrão, sem erro.
  const recusa = { getItem: () => { throw new Error('bloqueado'); }, setItem: () => { throw new Error('bloqueado'); } };
  assert.equal(lerNavePbr(recusa), true);
  guardarNavePbr(recusa, false);
  assert.equal(lerNavePbr(undefined), true);
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
