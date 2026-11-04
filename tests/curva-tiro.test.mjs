// A curva do original no tiro (shared/sim.js, porCurva e stepBullet): o projétil que
// acelera ou freia anda a mesma curva no servidor e no cliente. Antes o servidor voava a
// velocidade média e o desenho ficava até 100 m atrás: o Míssil Carga Elétrica sumia
// perto da nave e o impacto já aparecia no alvo. Aqui: o acerto só sai quando o míssil
// chega de verdade, o evento 'tiro' e o snapshot dos teleguiados levam o rumo da curva,
// e o tiro que o cliente monta com eles anda junto com o do servidor.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../server/game.js';
import { IDX_ARMA, INPUT_VAZIO, createShip, porCurva, stepBullet, createBullet } from '../shared/sim.js';
import { golpeDaArma } from '../shared/armas.js';
import { CAMPO } from './lugares.mjs';

const SEGUNDO = 30;

/** Mundo sem monstros, torres nem mineradores; `lista` = [raça, classe, dx, dz] a partir do CAMPO (times alternam). */
function arena(...lista) {
  const w = new World({ preparacaoS: 0, jungle: false, critico: false, torretas: false });
  w.mineradores.passo = () => {};
  const js = lista.map(([race, classe, dx, dz], i) => {
    const j = w.addPlayer('P' + i, race, classe);
    j.ship = createShip(race, CAMPO.x + dx, CAMPO.z + dz, 0, classe);
    j.protegidoAte = 0;
    return j;
  });
  return { w, js };
}

/** `j` aperta o Z com a arma `kind` por um passo; devolve os eventos do passo. */
function disparar(w, j, kind) {
  const a = IDX_ARMA[kind];
  j.ship.encaixes = [a, j.ship.encaixes[1]];
  w.tirarEventos();
  w.pushInput(j.id, { s: 1, ...INPUT_VAZIO, f1: true, a });
  w.step();
  return w.tirarEventos();
}

/** O tiro do cliente montado com o evento 'tiro' (como main.js + efeitos.js ligarCurva). */
function doEvento(e) {
  const b = { id: e.id, kind: e.kind, nv: e.nv, p: e.p ?? 0, x: e.x, y: e.y, z: e.z, vx: e.vx, vy: e.vy, vz: e.vz, vida: e.vida };
  porCurva(b, golpeDaArma(e.kind, e.nv, e.p ?? 0).curva, { dx: e.dx, dz: e.dz, esp: e.esp });
  return b;
}

test('curva: o Míssil Carga Elétrica sai parado e só acerta o alvo a 90 m quando chega (não na média)', () => {
  const { w, js } = arena(['shrewdo', 'mobile', 0, 0], ['bellico', 'assault', 0, -90]);
  const [a, b] = js;
  const ev = disparar(w, a, 'o312037');
  const tiros = ev.filter((e) => e.e === 'tiro' && e.kind === 'o312037');
  assert.equal(tiros.length, 2, 'dois paralelos na V1');
  // O evento leva o rumo da curva e a velocidade própria (sai parado: 0).
  for (const t of tiros) {
    assert.ok(Math.abs(t.dx) < 1e-3 && Math.abs(t.dz + 1) < 1e-3, 'rumo do nariz (yaw 0 olha para -z)');
    assert.equal(t.esp, 0);
  }
  let tick = null;
  for (let i = 1; i <= 3 * SEGUNDO && tick === null; i++) {
    w.step();
    if (w.tirarEventos().some((e) => e.e === 'acerto' && e.alvo === b.id)) tick = i;
  }
  assert.ok(tick !== null, 'acertou');
  // 100 m/s² (0,0002 m/ms² × 0,5): ~84 m em ~1,3 s; na média (120 m/s) seria ~0,7 s.
  const s = tick / SEGUNDO;
  assert.ok(s > 1.05 && s < 1.6, `${s} s`);
});

test('curva: o tiro do cliente, montado com o evento e com o snapshot dos teleguiados, anda junto com o do servidor', () => {
  const { w, js } = arena(['shrewdo', 'mobile', 0, 0], ['bellico', 'assault', 25, -150]);
  const [a, b] = js;
  const ev = disparar(w, a, 'o312037');
  const tiros = ev.filter((e) => e.e === 'tiro' && e.kind === 'o312037');
  const cliente = tiros.map(doEvento);
  // O evento leva o tiro como nasceu e o servidor já o andou no mesmo passo: o cliente
  // anda esse passo para comparar no mesmo instante (na tela ele só chega depois, pela rede).
  for (const c of cliente) stepBullet(c);
  // Antes do teleguiado ligar (350 ms) o cliente anda sozinho e bate com o servidor.
  for (let i = 0; i < 9; i++) {
    w.step();
    for (const c of cliente) {
      stepBullet(c);
      const s = w.bullets.find((x) => x.id === c.id);
      assert.ok(Math.hypot(s.x - c.x, s.z - c.z) < 0.05, `passo ${i}: ${s.x},${s.z} × ${c.x},${c.z}`);
    }
  }
  // Depois ele curva (só o servidor sabe): o snapshot dos teleguiados traz o rumo e a velocidade.
  for (let i = 0; i < 12; i++) w.step();
  const snap = w.snapshotPara(a, w.entidades(), w.tirarEventos());
  const guiados = snap.guiados.filter((g) => g.kind === 'o312037');
  assert.equal(guiados.length, 2);
  // O cliente retoma dali (ligarCurva com refazer) e, num passo, anda o mesmo que o
  // servidor (que ainda curva um pouco: até guia.giro × 1/30 s).
  const clientes = guiados.map((g) => {
    assert.ok(Math.hypot(g.dx, g.dz) > 0.999 && g.esp > 0, 'rumo unitário e já acelerando');
    assert.ok(g.dx > 0.05, 'virou para o alvo (à direita)');
    const c = { id: g.id, kind: g.kind, nv: g.nv, p: g.p, x: g.x, y: g.y, z: g.z, vx: g.vx, vy: g.vy, vz: g.vz, vida: 1 };
    return porCurva(c, golpeDaArma(g.kind, g.nv, g.p).curva, { dx: g.dx, dz: g.dz, esp: g.esp });
  });
  w.step();
  for (const c of clientes) {
    stepBullet(c);
    const s = w.bullets.find((x) => x.id === c.id);
    assert.ok(Math.hypot(s.x - c.x, s.z - c.z) < 0.1, `${s.x},${s.z} × ${c.x},${c.z}`);
  }
  assert.ok(b.vivo);
});

test('curva: a herança da nave fica no tiro; sem curva, o tiro voa constante como antes', () => {
  // A nave andando: a carga sai parada no rumo dela, mais a metade da velocidade da nave.
  const s = { x: 0, y: 10, z: 0, yaw: 0, vx: 0, vz: -40 };
  const g = golpeDaArma('o112028', 1);
  const b = createBullet(s, 'o112028', 1, 1, 0, 0, 1, g);
  assert.deepEqual([b.esp, b.dx, b.hz], [0, -0, -20]);
  stepBullet(b);
  assert.ok(Math.abs(b.vz - (-20 - g.curva.acel / 30)) < 1e-9, 'acelera no rumo, por cima da herança');
  // A Metralha Shrewdo (constante) não leva curva.
  const m = createBullet(s, 'o311004', 2, 1, 0, 0, 1, golpeDaArma('o311004', 1));
  assert.equal(m.acel, undefined);
  const vz = m.vz;
  stepBullet(m);
  assert.equal(m.vz, vz);
});

test('curva: o Rebatedor vira o tiro de curva para fora, sem a herança da nave, e o evento leva o rumo novo', () => {
  // B (Shrewdo Mobile, andando) solta o Canhão Quebra-Escudo Rápido (a carga que acelera, sem mira) em A; A rebate.
  const { w, js } = arena(['acron', 'functional', 0, 0], ['shrewdo', 'mobile', 0, -45]);
  const [a, b] = js;
  b.ship.yaw = Math.PI; // de frente para A (+z)
  b.ship.vz = 30;
  disparar(w, b, 'o312004');
  const tiro = w.bullets.find((x) => x.owner === b.id);
  assert.ok(tiro && tiro.acel !== undefined && tiro.hz > 0, 'com curva e herança da nave');
  for (let i = 0; i < 40 && tiro.z < a.ship.z - 20; i++) w.step();
  w.tirarEventos();
  const a0 = IDX_ARMA.o112014;
  a.ship.encaixes = [a0, a.ship.encaixes[1]];
  w.pushInput(a.id, { s: 1, ...INPUT_VAZIO, f1: true, a: a0 });
  w.step();
  const ev = w.tirarEventos().find((e) => e.e === 'rebatido' && e.bala === tiro.id);
  assert.ok(ev, 'rebatido');
  assert.equal(tiro.owner, a.id);
  assert.deepEqual([tiro.hx, tiro.hz], [0, 0], 'sem a herança');
  assert.ok(tiro.dz < -0.9, 'para fora de A (de volta para o norte)');
  // O rumo do evento é o do tiro; a velocidade própria, a de antes do passo (o tiro ainda anda no passo do rebate).
  assert.ok(Math.abs(ev.dx - tiro.dx) < 1e-3 && Math.abs(ev.dz - tiro.dz) < 1e-3);
  assert.ok(Math.abs(tiro.esp - ev.esp - tiro.acel / SEGUNDO) < 0.01, `${ev.esp} → ${tiro.esp}`);
  const esp = tiro.esp;
  w.step();
  assert.ok(tiro.esp > esp, 'segue acelerando');
});
