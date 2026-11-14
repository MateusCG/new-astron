// Monta o glb mid-poly de uma nave: os NÓS do glb do original, como estão (os
// encaixes da propulsão, das armas e dos jatos, com as matrizes deles, sem passar
// pelo Blender, que as decompõe), com a MALHA nova de tools/nave_pbr_malha.py no
// lugar da antiga. O material sai sem imagem, com o nome `pbr_nave`: as texturas
// são os quatro .webp ao lado do glb (tools/nave_pbr_texturas.py), que o cliente
// liga pelo nome do arquivo (public/js/nave-pbr-regras.js).
//
// Uso: node tools/nave_pbr_montar.mjs <original.glb> <malha.glb> <saida.glb>
import fs from 'node:fs';

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
if (n.json.meshes.length !== 1 || a.json.meshes.length !== 1) throw new Error('protótipo: uma malha só por nave');

// Só as vistas que a malha nova usa, copiadas para um buffer novo.
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
const primitivas = n.json.meshes[0].primitives.map((p) => ({
  attributes: Object.fromEntries(['POSITION', 'NORMAL', 'TEXCOORD_0'].map((k) => [k, copiar(p.attributes[k])])),
  indices: copiar(p.indices),
  material: 0,
}));

// A malha nova não pode ter saído do lugar: a caixa é a do original, menos o que o
// chanfro come de uma quina (até 0,15 no metro do original).
const caixa = (json) => {
  const ps = json.meshes[0].primitives.map((p) => json.accessors[p.attributes.POSITION]);
  return [0, 1, 2].map((k) => [Math.min(...ps.map((p) => p.min[k])), Math.max(...ps.map((p) => p.max[k]))]);
};
const [ca, cn] = [caixa(a.json), caixa({ meshes: [{ primitives: primitivas }], accessors: acessores })];
ca.forEach(([min, max], k) => {
  if (Math.abs(min - cn[k][0]) > 0.15 || Math.abs(max - cn[k][1]) > 0.15) throw new Error(`a caixa da malha mudou no eixo ${k}: ${[min, max]} -> ${cn[k]}`);
});

const json = {
  asset: { version: '2.0', generator: 'new-astron tools/nave_pbr_montar.mjs' },
  scene: 0,
  scenes: a.json.scenes,
  nodes: a.json.nodes,
  meshes: [{ name: a.json.meshes[0].name, primitives: primitivas }],
  materials: [{ name: 'pbr_nave', doubleSided: true, pbrMetallicRoughness: { metallicFactor: 1, roughnessFactor: 1 } }],
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
const tris = primitivas.reduce((s, p) => s + acessores[p.indices].count / 3, 0);
console.log(`${saida}: ${tris} triângulos, ${(fs.statSync(saida).size / 1024).toFixed(0)} KB`);
