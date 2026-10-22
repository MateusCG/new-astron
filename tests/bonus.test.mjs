// Bônus por tempo (server/bonus.js) e como o World os aplica (server/game.js): os
// de nave ('ataque', 'suporte', 'sonda'), o de time ('medusa'), o dano, a
// velocidade e a energia no `me` (a predição lê), o HP do suporte, a suspensão da
// sonda em combate e a morte limpando os de nave.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../server/game.js';
import { Bonus, BONUS, BONUS_NAVE, SONDA_COMBATE_S } from '../server/bonus.js';
import { DT, HOVER, createShip, createBullet, stepShip } from '../shared/sim.js';
import { CAMPO } from './lugares.mjs';

const SEGUNDO = Math.round(1 / DT);

function mundo() {
  const w = new World({ preparacaoS: 0, jungle: false, torretas: false });
  const a = w.addPlayer('A', 'bellico'); // time 0
  const b = w.addPlayer('B', 'acron'); // time 1
  const c = w.addPlayer('C', 'shrewdo'); // time 0
  w.mineradores.passo = () => {};
  w.escoltas.passo = () => {};
  w.step();
  for (const j of [a, b, c]) j.protegidoAte = 0;
  return { w, a, b, c };
}

/** Põe a nave do jogador parada, voando, em (x, z). */
function colocar(j, x, z, yaw = 0) {
  Object.assign(j.ship, { x, z, y: HOVER, vx: 0, vz: 0, yaw, pousado: false });
}

const laser = (dono) => ({ kind: 'laser', owner: dono.id, mult: 1 });

test('bônus: de time e de nave, com renovar, snapshot, evento e limpar', () => {
  const eventos = [];
  const b = new Bonus({ evento: (ev) => eventos.push(ev) });
  b.ativar(1, 'medusa', 120, 100);
  assert.equal(b.ativo(1, 'medusa', 100), true);
  assert.equal(b.ativo(0, 'medusa', 100), false, 'só o time que tomou');
  assert.equal(b.restante(1, 'medusa', 100 + 60 * SEGUNDO), 60);
  b.ativar(1, 'medusa', 10, 100); // mais curto não encurta
  assert.deepEqual(b.paraSnapshot(100), { 0: {}, 1: { medusa: 120 } });
  assert.equal(b.ativo(1, 'medusa', 100 + 120 * SEGUNDO), false, 'acaba no tempo');
  for (const velho of ['mineracao', 'velocidade', 'durabilidade', 'furia']) assert.throws(() => b.ativar(0, velho, 10, 0), /bônus desconhecido/);

  b.ativarNave(7, 'ataque', 90, 0);
  b.ativarNave(7, 'sonda', 40, 0);
  assert.deepEqual(eventos, [
    { e: 'bonusNave', id: 7, nome: 'ataque', s: 90 },
    { e: 'bonusNave', id: 7, nome: 'sonda', s: 40 },
  ]);
  assert.equal(b.ativoNave(7, 'ataque', 89 * SEGUNDO), true);
  assert.equal(b.ativoNave(8, 'ataque', 0), false, 'só a nave de quem tomou');
  assert.equal(b.restanteNave(7, 'sonda', 10 * SEGUNDO), 30);
  assert.deepEqual(b.paraNave(7, 39 * SEGUNDO), { ataque: 51, sonda: 1 });
  assert.deepEqual(b.paraNave(7, 40 * SEGUNDO), { ataque: 50 }, 'só os ativos');
  assert.throws(() => b.ativarNave(7, 'medusa', 10, 0), /desconhecido/);
  b.limparNave(7);
  assert.deepEqual(b.paraNave(7, 0), {});
  b.ativarNave(7, 'suporte', 90, 0);
  b.limpar();
  assert.deepEqual(b.paraNave(7, 0), {});
  assert.deepEqual(b.paraSnapshot(0), { 0: {}, 1: {} });
  assert.deepEqual(BONUS_NAVE.ataque, { dano: 1.2, s: 90 });
  assert.deepEqual(BONUS_NAVE.suporte, { hpFrac: 0.02, en: 4, s: 90 });
  assert.deepEqual(BONUS_NAVE.sonda, { vel: 1.25, s: 40 });
  assert.deepEqual(BONUS.medusa, { dano: 1.15, vel: 1.15, s: 120 });
});

test('bônus: ataque dá +20% de dano só a quem tomou; medusa +15% ao time inteiro; somam multiplicando', () => {
  const { w, a, b, c } = mundo();
  const base = w.danoDoTiro(laser(a));
  w.bonus.ativarNave(a.id, 'ataque', 90, w.tick);
  assert.ok(Math.abs(w.danoDoTiro(laser(a)) - base * 1.2) < 1e-9);
  assert.equal(w.danoDoTiro(laser(c)), base, 'o colega não');
  w.bonus.ativar(0, 'medusa', 120, w.tick);
  assert.ok(Math.abs(w.danoDoTiro(laser(a)) - base * 1.2 * 1.15) < 1e-9);
  assert.ok(Math.abs(w.danoDoTiro(laser(c)) - base * 1.15) < 1e-9, 'medusa vale para o time');
  assert.equal(w.danoDoTiro(laser(b)), base, 'o outro time não');
  assert.equal(w.snapshotPara(c, [], []).bonus[0].medusa, 120);
  for (let i = 0; i < 121 * SEGUNDO; i++) w.step();
  assert.equal(w.danoDoTiro(laser(a)), base, 'acabou tudo');
});

test('bônus: a sonda põe +25% no velMult do me (a predição acelera junto) e fica suspensa em combate', () => {
  const { w, a } = mundo();
  colocar(a, CAMPO.x, CAMPO.z);
  const velBase = a.ship.velMult;
  w.bonus.ativarNave(a.id, 'sonda', 40, w.tick);
  w.step();
  const me = w.snapshotPara(a, [], []).me;
  assert.ok(Math.abs(me.velMult - velBase * 1.25) < 1e-9, `velMult ${me.velMult}`);
  assert.equal(me.bonusNave.sonda, 40);
  assert.equal(me.bonusSuspenso, undefined);
  assert.deepEqual(w.entidades().find((e) => e.id === a.id).bn, ['sonda']);
  // A predição (stepShip com o me) chega na velocidade com o bônus.
  const pred = createShip(me.race, CAMPO.x, CAMPO.z, 0, me.classe, me.tier);
  Object.assign(pred, { velocidade: me.velocidade, velMult: me.velMult, armasInst: me.armasInst });
  for (let i = 0; i < 6 * SEGUNDO; i++) stepShip(pred, { th: 1, tu: 0, b: false, f1: false, f2: false, p: false, a: -1, a2: -1 });
  assert.ok(Math.hypot(pred.vx, pred.vz) > me.velocidade * velBase * 1.2, 'mais rápida que sem o bônus');

  // Levou dano: suspensa por SONDA_COMBATE_S.
  a.levouDanoTick = w.tick;
  w.step();
  let snap = w.snapshotPara(a, [], []).me;
  assert.ok(Math.abs(snap.velMult - velBase) < 1e-9, 'suspensa');
  assert.deepEqual(snap.bonusSuspenso, ['sonda']);
  for (let i = 0; i < SONDA_COMBATE_S * SEGUNDO; i++) w.step();
  assert.ok(Math.abs(a.ship.velMult - velBase * 1.25) < 1e-9, 'volta depois de 3 s sem briga');
  // Causar dano também suspende.
  a.causouDanoTick = w.tick;
  w.step();
  assert.ok(Math.abs(a.ship.velMult - velBase) < 1e-9);
});

test('bônus: causar e levar dano de verdade marcam o combate (o #ferir anota)', () => {
  const { w, a, b } = mundo();
  colocar(a, CAMPO.x, CAMPO.z, 0);
  colocar(b, CAMPO.x, CAMPO.z - 40, 0);
  const bala = createBullet(a.ship, 'plasma', w.nextId++, a.id);
  Object.assign(bala, { time: a.time, mult: 1 });
  w.bullets.push(bala);
  for (let i = 0; i < SEGUNDO && w.bullets.includes(bala); i++) w.step();
  assert.ok(b.ship.hp < b.ship.maxHp, 'acertou');
  assert.equal(b.levouDanoTick, a.causouDanoTick);
  assert.deepEqual([a.agrediu.time, a.agrediu.tick], [b.time, a.causouDanoTick], 'agressão anotada para as torres');
});

test('bônus: medusa dá +15% de velocidade ao time inteiro, junto com a sonda', () => {
  const { w, a, b, c } = mundo();
  const base = { a: a.ship.velMult, b: b.ship.velMult, c: c.ship.velMult };
  w.bonus.ativar(0, 'medusa', 120, w.tick);
  w.bonus.ativarNave(a.id, 'sonda', 40, w.tick);
  w.step();
  assert.ok(Math.abs(a.ship.velMult - base.a * 1.25 * 1.15) < 1e-9);
  assert.ok(Math.abs(c.ship.velMult - base.c * 1.15) < 1e-9);
  assert.equal(b.ship.velMult, base.b, 'o outro time não');
});

test('bônus: suporte soma +4 de energia por s no regenEn do me e +2% do HP máximo por s', () => {
  const { w, a } = mundo();
  colocar(a, CAMPO.x, CAMPO.z);
  const regen = a.ship.regenEn;
  const hpVoo = a.ship.regenHpVoo;
  w.bonus.ativarNave(a.id, 'suporte', 90, w.tick);
  w.step();
  assert.equal(w.snapshotPara(a, [], []).me.regenEn, regen + 4);
  a.ship.hp = a.ship.maxHp / 2;
  const antes = a.ship.hp;
  for (let i = 0; i < 2 * SEGUNDO; i++) w.step();
  const esperado = 2 * (a.ship.maxHp * 0.02 + hpVoo);
  assert.ok(Math.abs(a.ship.hp - antes - esperado) < 0.5, `curou ${a.ship.hp - antes}, esperado ${esperado}`);
  // Mexer no equipamento (aplicarStatus) não perde o bônus: o tick seguinte o repõe.
  assert.equal(w.pedido(a.id, { t: 'pontos', atributo: 'energia', qtd: 1 }).ok, true);
  w.step();
  assert.ok(a.ship.regenEn >= regen + 4);
});

test('bônus: morrer limpa os de nave (o de time fica); sair também', () => {
  const { w, a, b } = mundo();
  colocar(a, CAMPO.x, CAMPO.z);
  w.bonus.ativarNave(a.id, 'ataque', 90, w.tick);
  w.bonus.ativarNave(a.id, 'suporte', 90, w.tick);
  w.bonus.ativar(0, 'medusa', 120, w.tick);
  a.ship.hp = 1;
  const bala = createBullet(createShip('acron', CAMPO.x, CAMPO.z + 40, 0), 'plasma', w.nextId++, b.id);
  Object.assign(bala, { time: b.time, mult: 1 });
  w.bullets.push(bala);
  for (let i = 0; i < SEGUNDO && a.vivo; i++) w.step();
  assert.equal(a.vivo, false);
  assert.deepEqual(w.bonus.paraNave(a.id, w.tick), {});
  assert.equal(w.bonus.ativo(0, 'medusa', w.tick), true, 'o de time continua');
  w.bonus.ativarNave(b.id, 'sonda', 40, w.tick);
  w.removePlayer(b.id);
  assert.deepEqual(w.bonus.paraNave(b.id, w.tick), {});
});
