// Recall (shared/recall.js + server/game.js): B canaliza RECALL_S e leva a mesma nave
// para a base do próprio time; dano, gatilho, boost, velocidade, B de novo e morte
// cancelam; não começa morto nem dentro da própria base.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World, ZONA_SEGURA } from '../server/game.js';
import { sanitizeInput } from '../shared/sim.js';
import { BASES } from '../shared/terrain.js';
import { RECALL_S, RECALL_VEL_MAX } from '../shared/recall.js';

const SEGUNDO = 30;

function mundo() {
  const w = new World({ drones: 0, monstros: 0, elites: 0 });
  w.mineradores.passo = () => {};
  return w;
}

/** Leva a nave de `j` para o corredor, longe das duas bases, parada. */
function noCorredor(j, z = 150) {
  Object.assign(j.ship, { x: 0, z, vx: 0, vz: 0, yaw: 0, pousado: false });
  j.protegidoAte = 0;
}

/** Manda um comando (com o próximo seq) e roda um passo do mundo. */
function comando(w, j, inp = {}) {
  w.pushInput(j.id, { s: (j.seqTeste = (j.seqTeste ?? 0) + 1), ...inp });
  w.step();
}

/** Aperta B (pulso de um passo, como o cliente manda) e solta. */
function apertarB(w, j) {
  comando(w, j, { r: true });
  comando(w, j, {});
}

const eventosRecall = (w) => w.tirarEventos().filter((e) => e.e === 'recall');
const distBase = (j) => Math.hypot(j.ship.x - BASES[j.time].x, j.ship.z - BASES[j.time].z);

test('recall: o comando leva o campo r e a rede não injeta outra coisa', () => {
  assert.equal(sanitizeInput({ r: 1 }).r, true);
  assert.equal(sanitizeInput({}).r, false);
  assert.equal(sanitizeInput({ r: 'sim' }).r, true);
});

test('recall: completa e leva para a base do time certo mantendo vida, energia e nível', () => {
  const w = mundo();
  w.addPlayer('A', 'bellico'); // time 0
  const j = w.addPlayer('B', 'acron'); // time 1: base de cima
  assert.equal(j.time, 1);
  noCorredor(j, -150);
  j.ship.hp = 77;
  j.ultimoDano = w.tick + 100 * SEGUNDO; // sem regeneração no meio: a conta fica exata
  j.ship.en = 20;
  j.nivel = 4;
  w.tirarEventos();

  apertarB(w, j);
  assert.ok(j.recall, 'começou a canalizar');
  assert.deepEqual(eventosRecall(w).map((e) => e.estado), ['inicio']);
  const ent = w.entidades().find((e) => e.id === j.id);
  assert.ok(ent.recall >= 0 && ent.recall < 0.1, 'progresso na entidade, para todos verem');

  for (let i = 0; i < RECALL_S * SEGUNDO - 5; i++) w.step();
  assert.ok(j.recall, 'ainda canalizando um pouco antes do fim');
  assert.ok(distBase(j) > ZONA_SEGURA);
  const quase = w.entidades().find((e) => e.id === j.id).recall;
  assert.ok(quase > 0.9 && quase <= 1);

  for (let i = 0; i < 5; i++) w.step();
  assert.equal(j.recall, null);
  assert.ok(distBase(j) < 80, `chegou na base do time 1 (a ${distBase(j).toFixed(0)} m)`);
  assert.equal(j.ship.yaw, Math.PI, 'voltada para o corredor, como quem renasce no time 1');
  assert.equal(j.ship.hp, 77, 'a vida fica como estava');
  assert.ok(j.ship.en >= 20, 'a energia não zera');
  assert.equal(j.nivel, 4);
  assert.equal(j.vivo, true);
  const chegou = eventosRecall(w).find((e) => e.estado === 'chegou');
  assert.ok(chegou && chegou.id === j.id);
  assert.equal(w.entidades().find((e) => e.id === j.id).recall, undefined, 'sem campo fora da canalização');
});

test('recall: pousado pode; os comandos seguintes partem da base', () => {
  const w = mundo();
  const j = w.addPlayer('A', 'shrewdo');
  noCorredor(j);
  j.ship.pousado = true;
  apertarB(w, j);
  assert.ok(j.recall, 'pousado pode');
  for (let i = 0; i < RECALL_S * SEGUNDO; i++) w.step();
  assert.ok(distBase(j) < 80);
  assert.equal(j.ship.pousado, false, 'chega voando, como no renascimento');
  const ack = j.ack;
  comando(w, j, { th: 1 });
  assert.equal(j.ack, ack + 1, 'a fila de comandos continua normal depois do salto');
});

test('recall: cancela com dano', () => {
  const w = mundo();
  const j = w.addPlayer('A', 'bellico'); // time 0
  const inimigo = w.addPlayer('B', 'bellico'); // time 1
  noCorredor(j, 150);
  // O inimigo atrás, olhando para ele (yaw 0 olha para -z).
  Object.assign(inimigo.ship, { x: 0, z: 200, vx: 0, vz: 0, yaw: 0 });
  apertarB(w, j);
  assert.ok(j.recall);
  w.tirarEventos();
  for (let i = 0; i < 10 && j.recall; i++) comando(w, inimigo, { f1: true });
  assert.ok(j.ship.hp < j.ship.maxHp, 'levou o tiro');
  assert.equal(j.recall, null, 'o dano cancelou');
  const ev = eventosRecall(w).find((e) => e.id === j.id);
  assert.deepEqual([ev.estado, ev.motivo], ['cancelado', 'dano']);
  for (let i = 0; i < RECALL_S * SEGUNDO; i++) w.step();
  assert.ok(distBase(j) > ZONA_SEGURA, 'não foi para a base');
});

test('recall: cancela com tiro, com boost, com velocidade e apertando B de novo', () => {
  for (const [inp, motivo] of [
    [{ f1: true }, 'tiro'],
    [{ f2: true }, 'tiro'],
    [{ b: true }, 'boost'],
    [{ r: true }, 'cancelou'],
  ]) {
    const w = mundo();
    const j = w.addPlayer('A', 'mechan');
    noCorredor(j);
    apertarB(w, j);
    assert.ok(j.recall);
    w.tirarEventos();
    comando(w, j, inp);
    assert.equal(j.recall, null, `cancelou com ${JSON.stringify(inp)}`);
    assert.equal(eventosRecall(w)[0]?.motivo, motivo);
  }

  // Velocidade: acelerar passa do limite em poucos passos.
  const w = mundo();
  const j = w.addPlayer('A', 'shrewdo');
  noCorredor(j);
  apertarB(w, j);
  comando(w, j, { tu: 1 }); // girar no lugar não cancela
  assert.ok(j.recall, 'girar parado não cancela');
  w.tirarEventos();
  let passos = 0;
  while (j.recall && passos < 30) {
    comando(w, j, { th: 1 });
    passos++;
  }
  assert.equal(j.recall, null);
  assert.ok(Math.hypot(j.ship.vx, j.ship.vz) > RECALL_VEL_MAX);
  assert.equal(eventosRecall(w)[0].motivo, 'velocidade');
});

test('recall: não começa morto, rápido demais nem dentro da própria base', () => {
  const w = mundo();
  const j = w.addPlayer('A', 'bellico');

  // Na base (acabou de nascer): recusa.
  w.tirarEventos();
  apertarB(w, j);
  assert.equal(j.recall, null);
  assert.equal(eventosRecall(w)[0].motivo, 'na_base');

  // Voando rápido: recusa.
  noCorredor(j);
  j.ship.vz = -40;
  w.tirarEventos();
  comando(w, j, { r: true, th: 1 });
  comando(w, j, {});
  assert.equal(j.recall, null);
  assert.equal(eventosRecall(w)[0].motivo, 'velocidade');

  // Morto: o comando é descartado, nada começa.
  noCorredor(j);
  j.vivo = false;
  j.respawnTick = w.tick + 1000;
  apertarB(w, j);
  assert.equal(j.recall, null);
});

test('recall: morrer cancela e quem renasce não chega canalizando', () => {
  const w = mundo();
  const j = w.addPlayer('A', 'shrewdo');
  const inimigo = w.addPlayer('B', 'bellico');
  noCorredor(j, 150);
  j.ship.hp = 1;
  Object.assign(inimigo.ship, { x: 0, z: 200, vx: 0, vz: 0, yaw: 0 });
  apertarB(w, j);
  assert.ok(j.recall);
  for (let i = 0; i < 10 && j.vivo; i++) comando(w, inimigo, { f1: true });
  assert.equal(j.vivo, false);
  assert.equal(j.recall, null);
});
