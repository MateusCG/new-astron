import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World, ZONA_SEGURA } from '../server/game.js';
import { MapaNavegacao } from '../server/navegacao.js';
import { Bonus } from '../server/bonus.js';
import { OBJ_A_POUSO_S, OBJ_RECARGA_S, OBJ_BONUS_S, TORRE_B_HP } from '../server/objetivos.js';
import { RECOMPENSA, XP_OBJETIVO, xpParaNivel } from '../server/progressao.js';
import { createShip, stepShip, INPUT_VAZIO, DT } from '../shared/sim.js';
import { OBJETIVOS, ARENA_C, heightAt } from '../shared/terrain.js';
import { alturaSolida, obstaculoAtivo, definirObstaculoAtivo, TORRE_B } from '../shared/obstaculos.js';

const TICK = 1 / DT;
const A1 = OBJETIVOS.find((o) => o.id === 'A1');
const B1 = OBJETIVOS.find((o) => o.id === 'B1');
const C1 = OBJETIVOS.find((o) => o.id === 'C1');

const mundo = () => new World({ drones: 0, monstros: 0, elites: 0 });
const estado = (w, id) => w.objetivos.estado().find((o) => o.id === id);
/** XP total que o jogador já ganhou (níveis passados + o que tem no nível). */
const xpTotal = (j) => {
  let t = j.xp;
  for (let n = 1; n < j.nivel; n++) t += xpParaNivel(n);
  return t;
};
const passos = (w, n) => {
  for (let i = 0; i < n; i++) w.step();
};

/** Jogador do `time` já pousado (parado no chão) na marcação do A1. */
function pousadoNoA(w, nome, time, dx = 0) {
  const j = w.addPlayer(nome, 'bellico');
  j.time = time;
  j.ship = createShip('bellico', A1.x + dx, A1.z, 0);
  j.ship.pousado = true;
  return j;
}

/** Decola (L) o jogador: um comando com p apertado. */
function decolar(w, j) {
  w.pushInput(j.id, { s: j.ack + 1, p: true });
  w.step();
}

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

test('objetivo A: 10 s pousado toma, dá mineração ao time e entra em recarga', () => {
  const w = mundo();
  const j = pousadoNoA(w, 'Pouso', 1);
  passos(w, OBJ_A_POUSO_S * TICK - 1);
  const quase = estado(w, 'A1');
  assert.equal(quase.estado, 'tomando');
  assert.equal(quase.quem, 1);
  assert.ok(quase.prog > 0.99 && quase.prog < 1);
  assert.equal(w.bonus.ativo(1, 'mineracao', w.tick), false, 'ainda não');
  w.step();
  const ev = w.tirarEventos().find((e) => e.e === 'objetivo');
  assert.deepEqual(ev, { e: 'objetivo', id: 'A1', tipo: 'A', time: 1, bonus: 'mineracao', segundos: OBJ_BONUS_S, quem: 'Pouso' });
  assert.equal(w.bonus.ativo(1, 'mineracao', w.tick), true, 'bônus para o time de quem pousou');
  assert.equal(w.bonus.ativo(0, 'mineracao', w.tick), false);
  assert.equal(w.bonus.restante(1, 'mineracao', w.tick), OBJ_BONUS_S);
  assert.equal(xpTotal(j), XP_OBJETIVO);
  const r = estado(w, 'A1');
  assert.equal(r.estado, 'recarga');
  assert.equal(r.time, 1);
  assert.equal(r.resta, OBJ_RECARGA_S);
  // Em recarga, ficar pousado não conta nada.
  passos(w, 30 * TICK);
  assert.equal(estado(w, 'A1').estado, 'recarga');
  assert.equal(estado(w, 'A1').resta, OBJ_RECARGA_S - 30);
  passos(w, (OBJ_RECARGA_S - 30) * TICK);
  assert.notEqual(estado(w, 'A1').estado, 'recarga', 'voltou depois da recarga');
  // O snapshot leva os objetivos e os bônus.
  const snap = w.snapshotPara(j, w.entidades(), []);
  assert.equal(snap.obj.length, 6);
  assert.ok(snap.bonus[1].mineracao > 0 || w.tick > OBJ_BONUS_S * TICK);
});

test('objetivo A: decolar antes dos 10 s perde o progresso', () => {
  const w = mundo();
  const j = pousadoNoA(w, 'Apressado', 0);
  passos(w, 5 * TICK);
  assert.ok(estado(w, 'A1').prog > 0.45);
  decolar(w, j);
  assert.equal(j.ship.pousado, false);
  assert.equal(estado(w, 'A1').prog, 0);
  assert.equal(estado(w, 'A1').estado, 'livre');
  passos(w, 10 * TICK);
  assert.equal(w.bonus.ativo(0, 'mineracao', w.tick), false);
});

test('objetivo A: um de cada time pousado trava o progresso (contestado)', () => {
  const w = mundo();
  const a = pousadoNoA(w, 'Time0', 0, -8);
  passos(w, 3 * TICK);
  const b = pousadoNoA(w, 'Time1', 1, 8);
  passos(w, 5 * TICK);
  const r = estado(w, 'A1');
  assert.equal(r.estado, 'contestado');
  assert.equal(r.quem, 0);
  assert.ok(Math.abs(r.prog - 0.3) < 0.01, `travou em 3 s (${r.prog})`);
  // O do time 1 decola: o time 0 continua de onde parou e toma em mais 7 s.
  decolar(w, b);
  passos(w, 7 * TICK - 2);
  assert.equal(w.bonus.ativo(0, 'mineracao', w.tick), false);
  passos(w, 2);
  assert.equal(w.bonus.ativo(0, 'mineracao', w.tick), true);
  assert.equal(w.bonus.ativo(1, 'mineracao', w.tick), false);
  assert.equal(estado(w, 'A1').time, 0);
  assert.ok(a.vivo);
});

test('objetivo A: se o outro time fica sozinho, o progresso recomeça para ele', () => {
  const w = mundo();
  const a = pousadoNoA(w, 'Time0', 0, -8);
  passos(w, 4 * TICK);
  pousadoNoA(w, 'Time1', 1, 8);
  w.step();
  decolar(w, a);
  w.step();
  const r = estado(w, 'A1');
  assert.equal(r.quem, 1);
  assert.ok(r.prog < 0.05);
});

/** Atirador do `time` a 60 m ao sul da torre B1, de frente para ela (yaw 0 = -z). */
function atiradorNaTorre(w, time) {
  const j = w.addPlayer('Demolidor', 'bellico');
  j.time = time;
  j.ship = createShip('bellico', B1.x, B1.z + 60, 0);
  j.protegidoAte = Infinity;
  return j;
}

function atirar(w, j, segundos) {
  for (let t = 0; t < segundos * TICK; t++) {
    w.pushInput(j.id, { s: j.ack + 1, f1: true });
    w.step();
  }
}

test('objetivo B: tiro tira vida da torre; destruída some da física, dá velocidade e volta', () => {
  const w = mundo();
  const j = atiradorNaTorre(w, 1);
  const alto = alturaSolida(B1.x, B1.z);
  assert.ok(alto > heightAt(B1.x, B1.z) + 20, 'torre sólida');
  atirar(w, j, 1);
  const vida = estado(w, 'B1').vida;
  assert.ok(vida < 1 && vida > 0.8, `perdeu vida (${vida})`);
  assert.ok(w.tirarEventos().some((e) => e.e === 'acerto' && e.torre === 'B1' && e.dano > 0));
  // Acaba com ela (só o fim, para o teste ser rápido).
  w.objetivos.lista.find((o) => o.id === 'B1').hp = 20;
  atirar(w, j, 1);
  const r = estado(w, 'B1');
  assert.equal(r.estado, 'recarga');
  assert.equal(r.time, 1);
  assert.equal(obstaculoAtivo('B1'), false);
  assert.equal(alturaSolida(B1.x, B1.z), heightAt(B1.x, B1.z), 'não é mais sólida');
  assert.equal(w.bonus.ativo(1, 'velocidade', w.tick), true);
  assert.equal(w.bonus.ativo(0, 'velocidade', w.tick), false);
  assert.equal(xpTotal(j), XP_OBJETIVO);
  // Tiro passa por onde ela estava (não acerta nem some).
  const antes = w.tirarEventos().length;
  atirar(w, j, 0.5);
  assert.ok(!w.tirarEventos().slice(antes).some((e) => e.torre === 'B1'));
  // A nave passa por onde ela estava.
  const nave = createShip('bellico', B1.x, B1.z + 40, 0);
  for (let t = 0; t < 3 * TICK; t++) stepShip(nave, { ...INPUT_VAZIO, th: 1 });
  assert.ok(nave.z < B1.z - 20, `atravessou (z ${nave.z.toFixed(0)})`);
  // Volta inteira depois da recarga.
  passos(w, OBJ_RECARGA_S * TICK);
  assert.equal(obstaculoAtivo('B1'), true);
  assert.equal(alturaSolida(B1.x, B1.z), alto);
  assert.equal(estado(w, 'B1').vida, 1);
  assert.equal(estado(w, 'B1').estado, 'livre');
  assert.equal(w.objetivos.lista.find((o) => o.id === 'B1').hp, TORRE_B_HP);
});

test('objetivo B: a torre não volta em cima de uma nave', () => {
  const w = mundo();
  const j = atiradorNaTorre(w, 0);
  w.objetivos.lista.find((o) => o.id === 'B1').hp = 10;
  atirar(w, j, 1);
  assert.equal(obstaculoAtivo('B1'), false);
  j.ship = createShip('bellico', B1.x, B1.z, 0); // parada onde a torre fica
  passos(w, OBJ_RECARGA_S * TICK + 30);
  assert.equal(obstaculoAtivo('B1'), false, 'espera a nave sair');
  j.ship = createShip('bellico', B1.x, B1.z + 60, 0);
  w.step();
  assert.equal(obstaculoAtivo('B1'), true);
});

test('objetivo B: tiro de monstro bate na torre mas não tira vida', () => {
  const w = mundo();
  const k = w.elites.find((e) => e.tipo === 'guardiao');
  const b = { id: 999, owner: k.id, kind: 'plasma', drone: true, x: B1.x, y: heightAt(B1.x, B1.z) + 10, z: B1.z + 3, px: B1.x, pz: B1.z + 20 };
  assert.equal(w.objetivos.tiroNaTorre(b), true);
  assert.equal(estado(w, 'B1').vida, 1);
  assert.ok(TORRE_B.raio > 0);
});

test('objetivo C: o guardião fica na arena e, derrotado, dá durabilidade e renasce', () => {
  const w = mundo();
  const g = w.elites.find((e) => e.tipo === 'guardiao' && e.objetivo === 'C1');
  assert.ok(g, 'um guardião em cada C');
  const j = w.addPlayer('Herói', 'bellico');
  j.time = 1;
  j.ship = createShip('bellico', C1.x + 150, C1.z, Math.PI / 2);
  j.protegidoAte = Infinity; // o guardião atira de volta
  // Com o jogador por perto, o guardião vai para cima dele mas não sai da arena.
  for (let t = 0; t < 20 * TICK; t++) {
    w.step();
    assert.ok(Math.hypot(g.ship.x - C1.x, g.ship.z - C1.z) <= ARENA_C, 'não sai da arena');
  }
  assert.ok(w.tirarEventos().some((e) => e.e === 'tiro' && e.dono === g.id), 'o guardião atira');
  g.ship.hp = 20;
  let seq = j.ack;
  for (let t = 0; t < 10 * TICK && g.vivo; t++) {
    const yawAlvo = Math.atan2(-(g.ship.x - j.ship.x), -(g.ship.z - j.ship.z));
    let d = yawAlvo - j.ship.yaw;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    w.pushInput(j.id, { s: ++seq, f1: true, tu: Math.max(-1, Math.min(1, d * 3)) });
    w.step();
  }
  assert.equal(g.vivo, false, 'derrotado');
  assert.equal(w.bonus.ativo(1, 'durabilidade', w.tick), true);
  assert.equal(w.bonus.ativo(0, 'durabilidade', w.tick), false);
  assert.ok(w.tirarEventos().some((e) => e.e === 'objetivo' && e.id === 'C1' && e.time === 1 && e.bonus === 'durabilidade'));
  assert.equal(j.ouro, RECOMPENSA.guardiao.ouro);
  const r = estado(w, 'C1');
  assert.equal(r.estado, 'recarga');
  assert.equal(r.vida, 0);
  passos(w, OBJ_RECARGA_S * TICK - 2 * TICK);
  assert.equal(g.vivo, false, 'só volta no fim da recarga');
  passos(w, 2 * TICK);
  assert.equal(g.vivo, true);
  assert.equal(g.ship.hp, g.ship.maxHp);
  assert.ok(Math.hypot(g.ship.x - C1.x, g.ship.z - C1.z) < 1, 'renasce no meio da arena');
  assert.equal(estado(w, 'C1').estado, 'livre');
});

test('objetivo B: a grade dos monstros conta a torre de pé mesmo montada com ela caída', () => {
  const dePe = new MapaNavegacao({ raioBloqueio: ZONA_SEGURA });
  definirObstaculoAtivo('B1', false);
  definirObstaculoAtivo('B2', false);
  try {
    const caida = new MapaNavegacao({ raioBloqueio: ZONA_SEGURA });
    assert.deepEqual(caida.passa, dePe.passa);
  } finally {
    definirObstaculoAtivo('B1', true);
    definirObstaculoAtivo('B2', true);
  }
});
