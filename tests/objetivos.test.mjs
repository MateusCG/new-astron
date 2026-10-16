// Objetivos e bônus por tempo. No mapa novo (Stage 6) os objetivos A, B e C saíram
// (OBJETIVOS está vazio na transição) e as regras novas (buffs, plataformas de pouso,
// Núcleo, Medusa) chegam na fase seguinte. Aqui fica o que continua valendo: o
// contrato dos bônus por tempo (server/bonus.js) e o módulo de objetivos rodando vazio.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../server/game.js';
import { Bonus, BONUS } from '../server/bonus.js';
import { DT } from '../shared/sim.js';
import { OBJETIVOS } from '../shared/terrain.js';

const TICK = 1 / DT;
const mundo = () => new World({ drones: 0, monstros: 0, elites: 0 });

test('bônus: ativar, ativo e restante por time (contrato com os mineradores)', () => {
  const b = new Bonus();
  b.ativar(1, 'velocidade', 60, 100);
  assert.equal(b.ativo(1, 'velocidade', 100), true);
  assert.equal(b.ativo(0, 'velocidade', 100), false, 'só o time que tomou');
  assert.equal(b.ativo(1, 'mineracao', 100), false);
  assert.equal(b.restante(1, 'velocidade', 100 + 30 * TICK), 30);
  assert.equal(b.ativo(1, 'velocidade', 100 + 60 * TICK), false, 'acaba no tempo');
  assert.equal(b.restante(1, 'velocidade', 100 + 61 * TICK), 0);
});

test('objetivos: no mapa novo o módulo roda sem objetivo nenhum (transição)', () => {
  assert.deepEqual(OBJETIVOS, []);
  const w = mundo();
  w.addPlayer('A', 'bellico');
  assert.deepEqual(w.objetivos.estado(), []);
  assert.equal(w.elites.filter((e) => e.tipo === 'guardiao').length, 0, 'sem guardião');
  for (let i = 0; i < 2 * TICK; i++) w.step();
  w.objetivos.reiniciar();
  assert.deepEqual(w.snapshotPara([...w.players.values()][0], [], []).obj, []);
});

test('bônus de naves do time: +dano para todas as naves do time só enquanto dura', () => {
  const w = mundo();
  const j = w.addPlayer('Herói', 'bellico');
  const aliado = w.addPlayer('Aliado', 'acron');
  const inimigo = w.addPlayer('Inimigo', 'acron');
  j.time = aliado.time = 1;
  inimigo.time = 0;
  const laser = (dono) => ({ kind: 'laser', owner: dono.id, mult: 1 });
  const base = w.danoDoTiro(laser(aliado));
  assert.equal(w.multDanoDe(aliado.id), 1, 'sem bônus antes');
  w.bonus.ativar(1, 'furia', 60, w.tick);
  assert.ok(w.snapshotPara(aliado, [], []).bonus[1].furia > 0, 'o snapshot mostra o bônus');
  assert.ok(Math.abs(w.danoDoTiro(laser(aliado)) - base * BONUS.furia.mult) < 1e-9);
  assert.ok(Math.abs(w.danoDoTiro(laser(j)) - base * BONUS.furia.mult) < 1e-9);
  assert.equal(w.danoDoTiro(laser(inimigo)), base, 'o outro time não');
  for (let i = 0; i < 60 * TICK; i++) w.step();
  assert.equal(w.bonus.ativo(1, 'furia', w.tick), false, 'acabou');
  assert.equal(w.danoDoTiro(laser(aliado)), base, 'dano volta ao normal');
});
