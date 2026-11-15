// Monta o glb mid-poly de uma nave: os NÓS do glb do original, como estão (os
// encaixes da propulsão, das armas e dos jatos, com as matrizes deles, sem passar
// pelo Blender, que as decompõe), com as MALHAS novas de tools/nave_pbr_malha.py no
// lugar das antigas (pelo nome do nó: as Shrewdo têm de 2 a 4 peças). Os materiais
// saem sem imagem, um por IMAGEM do original, com o nome `pbr_nave` (imagem 0) ou
// `pbr_nave_<k>` (imagem k): as texturas são os .webp ao lado do glb
// (`<nave>[_<k>]_<mapa>.webp`, de tools/nave_pbr_texturas.py), que o cliente liga
// pelo nome do material (public/js/nave-pbr-regras.js).
//
// Uso: node tools/nave_pbr_montar.mjs <original.glb> <malha.glb> <saida.glb>
import fs from 'node:fs';

/** O quanto a caixa da malha nova pode diferir da do original (o DESVIO_MAX de nave_pbr_malha.py). */
const FOLGA_CAIXA = 0.25;

function lerGlb(caminho) {
  const b = fs.readFileSync(caminho);
  const tam = b.readUInt32LE(12);
  const json = JSON.parse(b.subarray(20, 20 + tam).toString());
  const inicio = 20 + tam + 8;
  return { json, bin: b.subarray(inicio, inicio + b.readUInt32LE(20 + tam)) };
}

const [original, malha, saida] = process.argv.slice(2);
const a = lerGlb(original);
const n = lerGlb(malha);

// Só as vistas que as malhas novas usam, copiadas para um buffer novo.
const pedacos = [];
let fim = 0;
const vistas = [];
const acessores = [];
const copiar = (i) => {
  const ac = { ...n.json.accessors[i] };
  const v = n.json.bufferViews[ac.bufferView];
  const dados = n.bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength);
  const sobra = (4 - (dados.length % 4)) % 4;
  vistas.push({ buffer: 0, byteOffset: fim, byteLength: dados.length, ...(v.target ? { target: v.target } : {}), ...(v.byteStride ? { byteStride: v.byteStride } : {}) });
  pedacos.push(dados, Buffer.alloc(sobra));
  fim += dados.length + sobra;
  ac.bufferView = vistas.length - 1;
  acessores.push(ac);
  return acessores.length - 1;
};

// Um material por imagem do original (duas peças com a mesma textura dividem o material).
const imagemDoMaterial = (i) => a.json.textures[a.json.materials[i].pbrMetallicRoughness.baseColorTexture.index].source;
const imagens = [...new Set(a.json.materials.map((_, i) => imagemDoMaterial(i)))].sort((x, y) => x - y);
const materiais = imagens.map((k) => ({ name: k ? `pbr_nave_${k}` : 'pbr_nave', doubleSided: true, pbrMetallicRoughness: { metallicFactor: 1, roughnessFactor: 1 } }));

const caixaDe = (json, prims) => {
  const ps = prims.map((p) => json.accessors[p.attributes.POSITION]);
  return [0, 1, 2].map((k) => [Math.min(...ps.map((p) => p.min[k])), Math.max(...ps.map((p) => p.max[k]))]);
};
const novaPorNo = new Map(n.json.nodes.filter((no) => no.mesh != null).map((no) => [no.name, n.json.meshes[no.mesh]]));
let tris = 0;
const malhas = a.json.meshes.map((m, i) => {
  const no = a.json.nodes.find((x) => x.mesh === i);
  const nova = novaPorNo.get(no?.name);
  if (!nova) throw new Error(`a malha nova não tem a peça ${no?.name}`);
  if (m.primitives.length !== 1 || nova.primitives.length !== 1) throw new Error(`peça ${no.name}: esperava uma primitiva só`);
  const p = nova.primitives[0];
  // A peça não pode ter saído do lugar: a caixa é a do original, menos o que o chanfro come de uma quina.
  const [ca, cn] = [caixaDe(a.json, m.primitives), caixaDe(n.json, [p])];
  ca.forEach(([min, max], k) => {
    if (Math.abs(min - cn[k][0]) > FOLGA_CAIXA || Math.abs(max - cn[k][1]) > FOLGA_CAIXA) throw new Error(`peça ${no.name}: a caixa mudou no eixo ${k}: ${[min, max]} -> ${cn[k]}`);
  });
  tris += n.json.accessors[p.indices].count / 3;
  return {
    name: m.name,
    primitives: [{
      attributes: Object.fromEntries(['POSITION', 'NORMAL', 'TEXCOORD_0'].map((k) => [k, copiar(p.attributes[k])])),
      indices: copiar(p.indices),
      material: imagens.indexOf(imagemDoMaterial(m.primitives[0].material)),
    }],
  };
});

const json = {
  asset: { version: '2.0', generator: 'new-astron tools/nave_pbr_montar.mjs' },
  scene: 0,
  scenes: a.json.scenes,
  nodes: a.json.nodes,
  meshes: malhas,
  materials: materiais,
  accessors: acessores,
  bufferViews: vistas,
  buffers: [{ byteLength: fim }],
};
let texto = Buffer.from(JSON.stringify(json));
texto = Buffer.concat([texto, Buffer.alloc((4 - (texto.length % 4)) % 4, 0x20)]);
const bin = Buffer.concat(pedacos);
const cab = Buffer.alloc(12);
cab.writeUInt32LE(0x46546c67, 0);
cab.writeUInt32LE(2, 4);
cab.writeUInt32LE(12 + 8 + texto.length + 8 + bin.length, 8);
const c1 = Buffer.alloc(8);
c1.writeUInt32LE(texto.length, 0);
c1.writeUInt32LE(0x4e4f534a, 4);
const c2 = Buffer.alloc(8);
c2.writeUInt32LE(bin.length, 0);
c2.writeUInt32LE(0x004e4942, 4);
fs.writeFileSync(saida, Buffer.concat([cab, c1, texto, c2, bin]));
// As imagens e a semente (o número da unidade, do nome do material "14_Ulysses_mat0") para o lote.
console.log(`${saida}: ${tris} triângulos, ${(fs.statSync(saida).size / 1024).toFixed(0)} KB, imagens ${imagens.join(',')}`);
