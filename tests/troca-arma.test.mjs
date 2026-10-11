// Recarga de troca de arma (shared/sim.js, stepShip): fora da própria base, trocar a
// arma de um encaixe trava aquele encaixe (tiro e nova troca) por TROCA_ARMA_S;
// dentro da base a troca é livre. Roda no stepShip, então a predição do cliente e o
// servidor dão o mesmo resultado. Também o tipo de dano e a função de cada arma.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../server/game.js';
import { createShip, stepShip, IDX_ARMA, ARMAS, WEAPONS, TROCA_ARMA_S, DT, TIPOS_DANO, FUNCOES_ARMA, trocaLivre } from '../shared/sim.js';
import { BASES } from '../shared/terrain.js';

const PARADO = { th: 0, tu: 0, b: false, f1: false, f2: false, p: false };
const { laser, plasma, crio, emp } = IDX_ARMA;
const PASSOS_TROCA = Math.round(TROCA_ARMA_S / DT);

/** Nave do time `time` parada `fora` m além da borda da base dele (no corredor). */
function naveFora(time = 0, fora = 60) {
  const b = BASES[time];
  const dz = b.z > 0 ? -(b.raio + fora) : b.raio + fora;
  const s = createShip('acron', b.x, b.z + dz, 0);
  s.time = time;
  s.en = s.maxEn = 1000; // energia de sobra: o teste é da recarga, não da energia
  return s;
}

test('troca: fora da base, trocar trava o encaixe (tiro e nova troca) por TROCA_ARMA_S', () => {
  const s = naveFora();
  assert.equal(trocaLivre(s), false);
  // Troca o Z de laser para criogênico e já tenta atirar com os dois.
  const d = stepShip(s, { ...PARADO, f1: true, f2: true, a: crio, a2: plasma });
  assert.deepEqual(s.encaixes, [crio, plasma], 'a troca vale na hora');
  assert.deepEqual(d.map((x) => x.kind), ['plasma'], 'o Z, recém-trocado, não atira; o X sim');
  assert.ok(Math.abs(s.troca1 - (TROCA_ARMA_S - DT)) < 1e-9, `troca1 ${s.troca1}`);
  assert.equal(s.troca2, 0, 'o X não trocou: não trava');

  // Enquanto conta: pedir outra arma no Z é ignorado, e o Z não atira.
  let tiros = 0;
  for (let i = 1; i < PASSOS_TROCA - 1; i++) {
    tiros += stepShip(s, { ...PARADO, f1: true, a: emp, a2: plasma }).filter((x) => x.kind !== 'plasma').length;
    assert.equal(s.encaixes[0], crio, 'continua com a arma que tem');
  }
  assert.equal(tiros, 0, 'sem tiro no Z durante a recarga de troca');
  stepShip(s, { ...PARADO, a: crio, a2: plasma });
  stepShip(s, { ...PARADO, a: crio, a2: plasma });
  assert.equal(s.troca1, 0, 'acabou a recarga');
  assert.deepEqual(stepShip(s, { ...PARADO, f1: true, a: crio, a2: plasma }).map((x) => x.kind), ['crio'], 'o Z atira de novo');

  // O X trocando agora trava só o X.
  stepShip(s, { ...PARADO, a: crio, a2: laser });
  assert.ok(s.troca2 > 0 && s.troca1 === 0);
});

test('troca: dentro da própria base é livre; na base do outro time, não', () => {
  const b = BASES[0];
  const s = createShip('acron', b.x, b.z - b.raio + 20, 0);
  s.time = 0;
  assert.equal(trocaLivre(s), true);
  const d = stepShip(s, { ...PARADO, f1: true, a: crio, a2: plasma });
  assert.deepEqual(d.map((x) => x.kind), ['crio'], 'troca e atira no mesmo passo');
  assert.equal(s.troca1, 0);
  stepShip(s, { ...PARADO, a: emp, a2: laser });
  assert.deepEqual(s.encaixes, [emp, laser], 'troca de novo à vontade');

  // Recarga de troca que vinha de fora zera ao entrar na base.
  const t = naveFora();
  stepShip(t, { ...PARADO, a: crio, a2: plasma });
  assert.ok(t.troca1 > 0);
  Object.assign(t, { x: b.x, z: b.z });
  stepShip(t, { ...PARADO, a: crio, a2: plasma });
  assert.equal(t.troca1, 0);

  // Na base do OUTRO time a troca trava.
  const o = BASES[1];
  const u = createShip('acron', o.x, o.z, 0);
  u.time = 0;
  assert.equal(trocaLivre(u), false);
  stepShip(u, { ...PARADO, a: crio, a2: plasma });
  assert.ok(u.troca1 > 0);
});

test('troca: nave nova começa sem recarga de troca, e o `me` leva troca1/troca2', () => {
  const w = new World({ drones: 0, monstros: 0, elites: 0 });
  w.mineradores.passo = () => {};
  const j = w.addPlayer('A', 'acron');
  const me = w.snapshotPara(j, [], []).me;
  assert.equal(me.troca1, 0);
  assert.equal(me.troca2, 0);
});

test('troca: a predição (stepShip no cliente) bate com o servidor', () => {
  const w = new World({ drones: 0, monstros: 0, elites: 0 });
  w.mineradores.passo = () => {};
  const j = w.addPlayer('A', 'acron');
  j.ship = naveFora(j.time);
  j.ship.armas = [...j.ship.armas, crio, emp];
  j.protegidoAte = 0;
  const pred = structuredClone(j.ship);
  // Troca, tenta trocar de novo, atira, voa, troca o X, volta.
  const comandos = [];
  for (let i = 0; i < 150; i++) {
    const a = i < 20 ? crio : i < 40 ? emp : i < 120 ? crio : laser;
    const a2 = i < 60 ? plasma : emp;
    comandos.push({ ...PARADO, th: i % 50 < 25 ? 0.6 : 0, tu: i % 30 < 10 ? 0.5 : 0, f1: i % 7 === 0, f2: i % 11 === 0, a, a2 });
  }
  let seq = 0;
  const disparosPred = [];
  for (const c of comandos) {
    w.pushInput(j.id, { s: ++seq, ...c });
    w.step();
    disparosPred.push(stepShip(pred, c).length);
    for (const k of ['x', 'z', 'yaw', 'en', 'cd1', 'cd2', 'troca1', 'troca2']) {
      assert.ok(Math.abs(pred[k] - j.ship[k]) < 1e-9, `passo ${seq}: ${k} ${pred[k]} × ${j.ship[k]}`);
    }
    assert.deepEqual(pred.encaixes, j.ship.encaixes, `passo ${seq}: encaixes`);
  }
  assert.ok(disparosPred.some((n) => n > 0), 'houve tiro no meio');
});

test('armas: cada uma tem tipo de dano e função', () => {
  for (const kind of ARMAS) {
    const w = WEAPONS[kind];
    assert.ok(Object.hasOwn(TIPOS_DANO, w.tipoDano), `${kind}: tipoDano ${w.tipoDano}`);
    assert.ok(Object.hasOwn(FUNCOES_ARMA, w.funcao), `${kind}: funcao ${w.funcao}`);
  }
  // As de debuff são de controle.
  for (const kind of ['dreno', 'crio', 'emp']) assert.equal(WEAPONS[kind].funcao, 'controle', kind);
  for (const kind of ['laser', 'plasma', 'missil']) assert.equal(WEAPONS[kind].funcao, 'dano', kind);
  // Os três tipos aparecem no catálogo.
  assert.deepEqual(new Set(ARMAS.map((k) => WEAPONS[k].tipoDano)), new Set(Object.keys(TIPOS_DANO)));
});
