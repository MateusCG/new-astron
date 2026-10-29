// Núcleo de He-3, as duas passivas do Tormentor na tela: a linha do tempo e a geometria dos
// efeitos (public/js/nucleo-regras.js), as malhas de luz do Blender
// (public/modelos/mapa/nucleo-efeitos.glb, desenhadas por nucleo-efeitos.js) e o som do
// reflexo (public/sons/nucleo_reflexo.wav, de tools/sons_nucleo.py).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ESCUDO,
  LENTES,
  ALIMENTACAO,
  IMPACTO_S,
  REFLEXO_S,
  REFLEXO_CHEGA_S,
  quadroImpacto,
  quadroReflexo,
  seguirBarreira,
  direcaoNaCasca,
  pontoDaCasca,
} from '../public/js/nucleo-regras.js';
import { MODELOS_MAPA, SONS_GERAIS } from '../public/js/insumos.js';
import { SONS_NUCLEO } from '../public/js/sons.js';
import { CATEGORIA_DO_SOM } from '../public/js/nivel-sons.js';
import { NUCLEO_CFG } from '../server/objetivos.js';
import { RAIO_TIRO_MIN } from '../shared/armas.js';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const distCentro = (p) => Math.hypot(p.x, p.y - ESCUDO.centroY, p.z);

test('núcleo: a cúpula do escudo nasce do prato emissor, cobre o cristal e os anéis, e o tiro para nela', () => {
  // A borda encosta no prato (r 26,8, topo em y = 0).
  assert.ok(Math.abs(Math.sqrt(ESCUDO.raio ** 2 - ESCUDO.centroY ** 2) - 26.8) < 0.1);
  // O cristal (7 a 31 m) e o anel de fora (r 20,8 em volta de y = 18) ficam dentro.
  assert.ok(distCentro({ x: 0, y: 31, z: 0 }) < ESCUDO.raio && distCentro({ x: 20.8, y: 18, z: 0 }) < ESCUDO.raio);
  // O acerto de tiro do servidor (raio do Núcleo + o menor raio de tiro) é a cúpula na altura do voo.
  const naAltura = Math.sqrt(ESCUDO.raio ** 2 - (NUCLEO_CFG.y - ESCUDO.centroY) ** 2);
  assert.ok(Math.abs(NUCLEO_CFG.raio + RAIO_TIRO_MIN - naAltura) < 1.5, `acerto a ${NUCLEO_CFG.raio + RAIO_TIRO_MIN} m, cúpula a ${naAltura.toFixed(1)}`);
});

test('núcleo: as quatro lentes dos obeliscos alimentam a cúpula por fora, de cima', () => {
  assert.equal(LENTES.length, 4);
  for (const [i, { de, ate }] of ALIMENTACAO.entries()) {
    assert.ok(distCentro(de) > ESCUDO.raio + 10, `lente ${i} fora da cúpula`);
    assert.ok(ate, `o feixe ${i} bate na cúpula`);
    assert.ok(Math.abs(distCentro(ate) - ESCUDO.raio) < 1e-6);
    assert.ok(ate.y > ESCUDO.centroY + 10 && ate.y < de.y, `bate na parte de cima (${ate.y.toFixed(1)} m)`);
  }
});

test('núcleo: a direção do impacto sai do lado do tiro, e o tiro no eixo escolhe um lado', () => {
  const d = direcaoNaCasca({ x: 100, y: ESCUDO.centroY, z: 0 });
  assert.deepEqual([d.x, d.y, d.z].map((v) => +v.toFixed(6)), [1, 0, 0]);
  const p = pontoDaCasca(d);
  assert.deepEqual([p.x, p.y, p.z], [ESCUDO.raio, ESCUDO.centroY, 0]);
  const eixo = direcaoNaCasca({ x: 0, y: 40, z: 0 }, 0.25);
  assert.ok(Math.abs(eixo.y) < 1e-9 && Math.abs(Math.hypot(eixo.x, eixo.z) - 1) < 1e-9);
});

test('núcleo: a barreira mostrada segue a do servidor, as células que mudaram marcam a solda e a quebra, e os feixes acendem enchendo', () => {
  let b = { vis: 0, solda: 0, quebra: 0, alimenta: 0 };
  const passo = (alvo, enchendo, n) => {
    for (let i = 0; i < n; i++) {
      b = seguirBarreira(b, alvo, enchendo, 1 / 30);
      assert.ok(b.solda <= b.vis + 1e-12 && b.vis <= b.quebra + 1e-12, 'solda ≤ vis ≤ quebra');
    }
  };
  // Apareceu: a cúpula se forma em 0,7 s, as células que voltaram soldando na frente.
  passo(1, false, 6);
  assert.ok(b.vis > b.solda + 0.1 && b.vis < 0.35, `soldando (${b.vis.toFixed(2)})`);
  passo(1, false, 18);
  assert.ok(b.vis > 0.95, `formada em 0,8 s (${b.vis.toFixed(2)})`);
  passo(1, false, 60);
  assert.ok(b.vis - b.solda < 0.02 && b.quebra - b.vis < 0.02, 'parada, nada muda');
  // Levou dano: a quebra fica para cima (as que caíram), sem solda.
  passo(0.6, true, 6);
  assert.ok(b.quebra > b.vis + 0.1 && b.vis - b.solda < 1e-9, 'quebrando');
  // Voltou a encher logo depois: a solda aparece na hora, a quebra some.
  for (let v = 0.6; v < 0.8; v += 0.012) passo(v, true, 1);
  assert.ok(b.vis - b.solda > 0.05 && b.quebra - b.vis < 1e-9, 'soldando logo depois de quebrar');
  passo(0.8, true, 30);
  assert.ok(b.alimenta > 0.95, 'feixes acesos enchendo');
  passo(1, false, 45);
  assert.ok(b.alimenta < 0.05, 'cheia, os feixes apagam');
});

test('núcleo: a onda do tiro abre e some depressa', () => {
  const a = quadroImpacto(0);
  const b = quadroImpacto(IMPACTO_S * 0.5);
  assert.ok(a.miolo > 0.99 && b.miolo < 0.05, 'o clarão da célula é só no começo');
  assert.ok(b.raio > a.raio && b.alfa < a.alfa);
  assert.equal(quadroImpacto(IMPACTO_S), null);
  assert.ok(IMPACTO_S <= 0.6, 'curta: o fogo de metralhadora não enche a cúpula');
});

test('núcleo: o reflexo sai da cúpula, chega na nave em REFLEXO_CHEGA_S, a cauda entra atrás e tudo some', () => {
  const q0 = quadroReflexo(0);
  assert.ok(q0.raio.cabeca === 0 && q0.clarao.alfa === 0, 'no começo, só a célula de saída');
  assert.ok(quadroReflexo(0.03).saida > 0.8, 'a célula de saída acende em âmbar');
  assert.ok(quadroReflexo(0.1).tranco < 0, 'a cúpula dá o tranco para dentro');
  assert.ok(Math.abs(quadroReflexo(0.3).tranco) < 0.004, 'e volta');
  assert.ok(quadroReflexo(REFLEXO_CHEGA_S - 0.03).raio.cabeca < 1);
  assert.equal(quadroReflexo(REFLEXO_CHEGA_S).raio.cabeca, 1, 'chegou');
  assert.ok(quadroReflexo(REFLEXO_CHEGA_S + 0.05).clarao.alfa > 0.5, 'clarão na nave');
  const q = quadroReflexo(0.35);
  assert.ok(q.raio.cauda > 0.3 && q.raio.cauda <= q.raio.cabeca, 'a cauda corre atrás da cabeça, para dentro da nave');
  for (let t = 0; t < REFLEXO_S; t += 1 / 60) {
    const r = quadroReflexo(t);
    for (const v of [r.saida, r.raio.alfa, r.clarao.alfa]) assert.ok(v >= 0 && v <= 1.0001, `t ${t}: ${v}`);
  }
  assert.ok(quadroReflexo(REFLEXO_S - 0.01).raio.alfa < 0.05);
  assert.equal(quadroReflexo(REFLEXO_S), null);
  assert.ok(REFLEXO_S <= 0.5, 'curto: o reflexo volta a cada segundo numa briga');
});

function lerGlb(nome) {
  const b = readFileSync(path.join(RAIZ, 'public/modelos/mapa', `${nome}.glb`));
  const len = b.readUInt32LE(12);
  return JSON.parse(b.subarray(20, 20 + len).toString('utf8'));
}

test('núcleo: as malhas de luz vêm do Blender, baixam na tela de carregamento e ficam no teto de efeito', () => {
  assert.ok(MODELOS_MAPA.includes('nucleo-efeitos'));
  const j = lerGlb('nucleo-efeitos');
  assert.deepEqual(j.nodes.map((n) => n.name).sort(), ['escudo_base', 'escudo_casca', 'escudo_clarao', 'escudo_raio']);
  assert.ok(j.extensionsRequired?.includes('KHR_draco_mesh_compression'), 'Draco');
  assert.equal(j.images?.length ?? 0, 0, 'sem textura: o desenho é do shader');
  assert.deepEqual(j.materials.map((m) => m.name), ['luz_nucleo']);
  let tris = 0;
  for (const m of j.meshes) {
    for (const p of m.primitives) {
      assert.ok(p.attributes.NORMAL != null && p.attributes.TEXCOORD_0 != null, `${m.name}: normal e UV`);
      tris += j.accessors[p.indices].count / 3;
    }
  }
  assert.ok(tris > 5000 && tris <= 12000, `${tris} triângulos (a cúpula de colmeia, mid-poly)`);
  // A cúpula leva a direção do centro de cada célula na segunda UV (a onda acende a célula inteira).
  const casca = j.meshes.find((m) => m.name === 'escudo_casca').primitives[0];
  assert.ok(casca.attributes.TEXCOORD_1 != null, 'UV1 da célula');
  const pos = j.accessors[casca.attributes.POSITION];
  assert.ok(pos.max[1] > ESCUDO.centroY + ESCUDO.raio - 1.5 && pos.min[1] < 0, 'do prato até o alto da esfera');
  assert.ok(Math.abs(pos.max[0] - ESCUDO.raio) < 0.5, 'no raio do escudo');
});

/** Amostras (-1 a 1) e a taxa de um WAV PCM 16 bits mono de public/sons/. */
function lerWav(nome) {
  const b = readFileSync(path.join(RAIZ, 'public/sons', `${nome}.wav`));
  assert.equal(b.toString('ascii', 0, 4), 'RIFF', nome);
  const canais = b.readUInt16LE(22);
  const taxa = b.readUInt32LE(24);
  const bits = b.readUInt16LE(34);
  let i = 12;
  while (b.toString('ascii', i, i + 4) !== 'data') i += 8 + b.readUInt32LE(i + 4);
  const n = b.readUInt32LE(i + 4) / 2;
  const a = new Float32Array(n);
  for (let k = 0; k < n; k++) a[k] = b.readInt16LE(i + 8 + k * 2) / 32768;
  return { a, taxa, canais, bits };
}
const rms = ({ a, taxa }, t0, t1) => {
  let soma = 0;
  const i0 = Math.floor(t0 * taxa);
  const i1 = Math.min(a.length, Math.floor(t1 * taxa));
  for (let i = i0; i < i1; i++) soma += a[i] * a[i];
  return Math.sqrt(soma / Math.max(1, i1 - i0));
};
/** Energia das variações rápidas (o estalo): a diferença entre amostras vizinhas. */
const estalo = ({ a, taxa }, t0, t1) => {
  let soma = 0;
  const i0 = Math.floor(t0 * taxa) + 1;
  const i1 = Math.min(a.length, Math.floor(t1 * taxa));
  for (let i = i0; i < i1; i++) soma += (a[i] - a[i - 1]) ** 2;
  return Math.sqrt(soma / Math.max(1, i1 - i0));
};

test('núcleo: o som do reflexo é nosso, baixa na tela de carregamento e acompanha a animação', () => {
  const nome = SONS_NUCLEO.reflexo;
  assert.ok(SONS_GERAIS.includes(nome), 'na tela de carregamento');
  assert.equal(CATEGORIA_DO_SOM[nome], 'impacto', 'nivelado como impacto');
  const w = lerWav(nome);
  assert.deepEqual([w.canais, w.bits, w.taxa], [1, 16, 44100]);
  let pico = 0;
  for (const x of w.a) pico = Math.max(pico, Math.abs(x));
  assert.ok(pico > 0.5 && pico < 0.95, `pico ${pico} (sem estourar)`);
  assert.ok(w.a.length / w.taxa <= 1.0, 'curto: toca a cada devolução');
  // Dois golpes: a cúpula soltando o raio (0 s) e o estalo da chegada (REFLEXO_CHEGA_S).
  assert.ok(rms(w, 0, 0.04) > rms(w, 0.5, 0.6) * 5, 'o tranco no começo');
  assert.ok(estalo(w, REFLEXO_CHEGA_S, REFLEXO_CHEGA_S + 0.02) > 2 * estalo(w, REFLEXO_CHEGA_S - 0.05, REFLEXO_CHEGA_S - 0.01), 'o estalo da chegada');
  // A cauda some (sem crepitar até o fim).
  assert.ok(rms(w, 0.7, 0.9) < rms(w, 0, 0.2) / 20, 'cauda que some');
});
