// Volta à base (recall): a linha do tempo do portal de dobra (volta-regras.js) e as malhas
// de luz do Blender (public/modelos/mapa/volta-base.glb, desenhadas por volta.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  quadroCanal,
  quadroPartida,
  quadroChegada,
  LAMINAS,
  PORTAL_RAIO,
  VOLTA_PARTIDA_S,
  VOLTA_CHEGADA_S,
  CASCO_ESCONDIDO_S,
} from '../public/js/volta-regras.js';
import { MODELOS_MAPA } from '../public/js/insumos.js';
import { SONS_INTERFACE } from '../public/js/sons.js';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Todas as alfas de um quadro. */
const alfas = (q) => [q.portal.alfa, q.fios.alfa, q.casca.alfa, q.clarao.alfa, q.feixe?.alfa ?? 0, q.anel?.alfa ?? 0];
const quadros = (fn, fim) => {
  const lista = [];
  for (let t = 0; t < fim; t += 1 / 30) lista.push([t, fn(t)]);
  return lista;
};

test('volta: canalizando, a íris abre logo e as 8 lâminas acendem com o progresso; cancelar fecha tudo', () => {
  assert.ok(quadroCanal(0.12).portal.abre > 0.99, 'aberta em 0,7 s');
  assert.ok(quadroCanal(0.03).portal.abre < 0.7, 'abre, não aparece inteira');
  assert.equal(quadroCanal(0).portal.acesas, 0);
  assert.equal(quadroCanal(0.5).portal.acesas, LAMINAS / 2);
  assert.equal(quadroCanal(1).portal.acesas, LAMINAS);
  // Tudo cresce com o progresso: a casca acende, o vórtice e a íris giram mais rápido.
  for (const chave of ['vortice', 'giro', 'giroVortice', 'alfa']) assert.ok(quadroCanal(0.9).portal[chave] > quadroCanal(0.2).portal[chave], chave);
  assert.ok(quadroCanal(0.9).casca.alfa > quadroCanal(0.2).casca.alfa * 2);
  assert.ok(quadroCanal(0.9).fios.corre > quadroCanal(0.2).fios.corre);
  // Cancelou: apaga em 0 fecha tudo.
  const fechado = quadroCanal(0.6, 0);
  assert.ok(alfas(fechado).every((a) => a === 0), 'apagado');
  assert.equal(fechado.portal.abre, 0);
  for (let k = 0; k <= 1; k += 0.05) for (const a of alfas(quadroCanal(k))) assert.ok(a >= 0 && a <= 1, `k ${k}: alfa ${a}`);
});

test('volta: na partida a nave afina, estica e é sugada pelo portal, que fecha num clarão', () => {
  assert.equal(quadroPartida(VOLTA_PARTIDA_S), null);
  assert.equal(quadroPartida(-0.1), null);
  // O portal começa do tamanho em que o canal acabou (não pula).
  assert.ok(Math.abs(quadroPartida(0).portal.raio - quadroCanal(1).portal.raio) < 0.01);
  const sugando = quadroPartida(0.35);
  assert.ok(sugando.casca.aperta < 0.2 && sugando.casca.estica > 1.5 && sugando.casca.branco > 0.9, 'afina, estica e fica branca');
  assert.ok(quadroPartida(0.5).casca.sobe > 0.95, 'chega ao portal');
  assert.ok(quadroPartida(0.62).portal.raio < 0.1 * PORTAL_RAIO, 'o portal fechou');
  assert.ok(quadroPartida(0.5).clarao.alfa > 0.6, 'clarão quando fecha');
  assert.ok(quadroPartida(0.7).feixe.cabeca > 0.95 && quadroPartida(0.7).feixe.sobe, 'a linha de luz sobe do portal');
  const lista = quadros(quadroPartida, VOLTA_PARTIDA_S);
  for (const [t, q] of lista) for (const a of alfas(q)) assert.ok(a >= 0 && a <= 1, `t ${t}: alfa ${a}`);
  const [, ultimo] = lista.at(-1);
  assert.ok(alfas(ultimo).every((a) => a < 0.12), 'apaga no fim');
});

test('volta: na chegada o raio desce, a luz se condensa na nave (passa do tamanho e volta) e se desfaz de cima para baixo', () => {
  assert.equal(quadroChegada(VOLTA_CHEGADA_S), null);
  assert.deepEqual(quadroChegada(-0.05), { espera: true }, 'a nave dos outros ainda não chegou no desenho');
  assert.ok(quadroChegada(0.02).feixe.cabeca > 0.5 && quadroChegada(0.15).feixe.cabeca < 0.01, 'desce do céu até a nave');
  assert.equal(quadroChegada(0.1).feixe.sobe, false);
  // Esticada no começo, condensa passando um pouco da largura e volta.
  assert.ok(quadroChegada(0.085).casca.estica > 4 && quadroChegada(0.085).casca.aperta < 0.15);
  const apertos = quadros(quadroChegada, VOLTA_CHEGADA_S).map(([, q]) => q.casca.aperta);
  assert.ok(Math.max(...apertos) > 1.05, 'passa do tamanho');
  assert.ok(Math.abs(quadroChegada(0.6).casca.aperta - 1) < 0.01 && Math.abs(quadroChegada(0.6).casca.estica - 1) < 0.01, 'e volta');
  // O casco de verdade só aparece com a luz já na forma dele; a casca se desfaz de cima para baixo.
  assert.equal(quadroChegada(CASCO_ESCONDIDO_S - 0.01).cascoVisivel, false);
  assert.equal(quadroChegada(CASCO_ESCONDIDO_S).cascoVisivel, true);
  assert.ok(quadroChegada(0.45).casca.revela > quadroChegada(0.9).casca.revela);
  for (const [t, q] of quadros(quadroChegada, VOLTA_CHEGADA_S)) for (const a of alfas(q)) assert.ok(a >= 0 && a <= 1, `t ${t}: alfa ${a}`);
  // A onda abre na altura da nave, nunca no chão (anel no chão é só pouso).
  assert.equal(quadroChegada(0.5).anel.noPortal, false);
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
  assert.deepEqual(j.nodes.map((n) => n.name).sort(), ['volta_anel', 'volta_feixe', 'volta_fios', 'volta_portal']);
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
  assert.deepEqual(j.materials.map((m) => m.name), ['luz_volta']);
});
