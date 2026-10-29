// Volta à base (recall): a linha do tempo do efeito na linguagem do recall dos MOBAs
// (volta-regras.js) e as malhas de luz do Blender (public/modelos/mapa/volta-base.glb,
// desenhadas por volta.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  quadroCanal,
  quadroPartida,
  quadroChegada,
  VOLTA_PARTIDA_S,
  VOLTA_CHEGADA_S,
  CASCO_ESCONDIDO_S,
  CARGA_FINAL,
  CIRCULO_RAIO,
  SEM_CORTE,
} from '../public/js/volta-regras.js';
import { MODELOS_MAPA } from '../public/js/insumos.js';
import { SONS_INTERFACE } from '../public/js/sons.js';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Todas as alfas de um quadro. */
const alfas = (q) => [q.circulo.alfa, q.particulas.alfa, q.fitas.alfa, q.coluna.alfa, q.casca.alfa, q.clarao.alfa, q.feixe?.alfa ?? 0, q.anel?.alfa ?? 0];
const quadros = (fn, fim) => {
  const lista = [];
  for (let t = 0; t < fim; t += 1 / 30) lista.push([t, fn(t)]);
  return lista;
};
const noIntervalo = (q, rotulo) => {
  for (const a of alfas(q)) assert.ok(a >= 0 && a <= 1.0001, `${rotulo}: alfa ${a}`);
};

test('volta: o círculo se desenha em volta ao nascer, o arco de progresso enche e a carga cresce até a antecipação final', () => {
  assert.ok(quadroCanal(0, 0.1).circulo.desenha < 0.6, 'desenhando');
  assert.equal(quadroCanal(0.1, 0.6).circulo.desenha, 1, 'desenhado em 0,5 s');
  // Carimba: passa do tamanho e volta.
  const raios = quadros((t) => quadroCanal(t / 6, t), 0.6).map(([, q]) => q.circulo.raio);
  assert.ok(Math.max(...raios) > CIRCULO_RAIO * 1.03 && raios.at(-1) < CIRCULO_RAIO * 1.01);
  assert.equal(quadroCanal(0.4, 2.4).circulo.prog, 0.4);
  // Tudo cresce com a carga: mais partículas, mais rápidas, a coluna e a nave mais acesas.
  const cedo = quadroCanal(0.2, 1.2);
  const tarde = quadroCanal(0.8, 4.8);
  assert.ok(tarde.particulas.densidade > cedo.particulas.densidade && tarde.particulas.veloc > cedo.particulas.veloc);
  assert.ok(tarde.coluna.alfa > cedo.coluna.alfa * 2 && tarde.casca.alfa > cedo.casca.alfa * 2);
  assert.ok(tarde.circulo.giros[2] > cedo.circulo.giros[2] && tarde.circulo.giros[1] < 0, 'as camadas giram em sentidos contrários');
  // Antecipação: na carga final tudo aperta e acelera.
  const final = quadroCanal(1, 6);
  const antes = quadroCanal(CARGA_FINAL, 5.1);
  assert.ok(final.coluna.raio < antes.coluna.raio && final.particulas.veloc > antes.particulas.veloc && final.circulo.giros[2] > antes.circulo.giros[2] * 1.5);
  assert.equal(final.casca.corte, SEM_CORTE, 'canalizando, a nave inteira');
  // Cancelou: tudo murcha.
  const murcho = quadroCanal(0.6, 3.6, 0);
  assert.ok(alfas(murcho).every((a) => a === 0), 'apagado');
  for (let k = 0; k <= 1; k += 0.05) noIntervalo(quadroCanal(k, k * 6), `k ${k}`);
});

test('volta: na partida, clarão, a nave se desfaz de baixo para cima, as partículas explodem e o feixe vai ao céu', () => {
  assert.equal(quadroPartida(VOLTA_PARTIDA_S), null);
  assert.equal(quadroPartida(-0.1), null);
  assert.ok(quadroPartida(0.03).clarao.alfa > 0.7, 'clarão na hora');
  assert.equal(quadroPartida(0.1).particulas.modo, 'explosao');
  // A dissolução: o corte sobe de baixo da nave até passar do alto.
  assert.ok(quadroPartida(0.05).casca.corte < -1 && quadroPartida(0.42).casca.corte > 1.2);
  assert.ok(quadroPartida(0.25).feixe.cabeca > 0.99 && !quadroPartida(0.25).feixe.doCeu, 'a luz sobe da nave ao céu');
  assert.ok(quadroPartida(0.32).circulo.alfa < 0.05 && quadroPartida(0.32).coluna.raio < quadroPartida(0).coluna.raio * 0.3, 'o círculo e a coluna fecham para dentro');
  const lista = quadros(quadroPartida, VOLTA_PARTIDA_S);
  for (const [t, q] of lista) noIntervalo(q, `t ${t}`);
  assert.ok(alfas(lista.at(-1)[1]).every((a) => a < 0.15), 'apaga no fim');
});

test('volta: na chegada, o feixe cai do céu, as partículas convergem e a nave se materializa de cima para baixo', () => {
  assert.equal(quadroChegada(VOLTA_CHEGADA_S), null);
  assert.deepEqual(quadroChegada(-0.05), { espera: true }, 'a nave dos outros ainda não chegou no desenho');
  assert.ok(quadroChegada(0.02).feixe.cabeca > 0.5 && quadroChegada(0.13).feixe.cabeca < 0.01 && quadroChegada(0.1).feixe.doCeu, 'cai do céu até a nave');
  assert.equal(quadroChegada(0.2).particulas.modo, 'implosao');
  // Materializa de cima para baixo: o corte desce do alto da nave até passar de baixo.
  assert.ok(quadroChegada(0.11).casca.corte > 1 && quadroChegada(0.5).casca.corte < -1.2);
  assert.equal(quadroChegada(CASCO_ESCONDIDO_S - 0.01).cascoVisivel, false);
  assert.equal(quadroChegada(CASCO_ESCONDIDO_S).cascoVisivel, true);
  // O círculo carimba (passa do tamanho e volta) e some.
  const raios = quadros(quadroChegada, VOLTA_CHEGADA_S).map(([, q]) => q.circulo.raio);
  assert.ok(Math.max(...raios) > CIRCULO_RAIO * 1.03);
  for (const [t, q] of quadros(quadroChegada, VOLTA_CHEGADA_S)) noIntervalo(q, `t ${t}`);
  assert.ok(quadroChegada(1.09).casca.alfa < 0.05 && quadroChegada(1.09).circulo.alfa === 0, 'a luz sai do casco no fim');
});

function lerGlb(nome) {
  const b = readFileSync(path.join(RAIZ, 'public/modelos/mapa', `${nome}.glb`));
  return JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString('utf8'));
}

test('volta: as malhas de luz são nossas, do Blender, e baixam na tela de carregamento com os sons', () => {
  assert.ok(MODELOS_MAPA.includes('volta-base'));
  assert.equal(SONS_INTERFACE.volta, 'up2');
  assert.equal(SONS_INTERFACE.voltaCanal, 'u_up');
  const j = lerGlb('volta-base');
  assert.deepEqual(j.nodes.map((n) => n.name).sort(), ['volta_anel', 'volta_disco', 'volta_feixe', 'volta_fitas']);
  assert.ok(j.extensionsRequired?.includes('KHR_draco_mesh_compression'), 'Draco');
  assert.equal(j.images?.length ?? 0, 0, 'a textura do círculo é gerada no cliente');
  let tris = 0;
  for (const m of j.meshes) {
    for (const p of m.primitives) {
      assert.ok(p.attributes.NORMAL != null && p.attributes.TEXCOORD_0 != null, `${m.name}: normal e UV`);
      tris += j.accessors[p.indices].count / 3;
    }
  }
  assert.ok(tris > 500 && tris <= 2500, `${tris} triângulos (mid-poly de efeito, como a decoração)`);
  assert.deepEqual(j.materials.map((m) => m.name), ['luz_volta']);
});
