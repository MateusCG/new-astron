// Escolta armada dos mineradores (server/escoltas.js): sai da base depois do
// começo, anda pela rota do corredor com os mineradores, atira em inimigo perto,
// para sob EMP e paga a recompensa quando destruída; a próxima sai depois do
// intervalo.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../server/game.js';
import { ESCOLTA } from '../server/escoltas.js';
import { RECOMPENSA } from '../server/progressao.js';
import { createShip } from '../shared/sim.js';
import { BASES, CORREDOR, MINERIO, heightAt } from '../shared/terrain.js';
import { alturaSolida } from '../shared/obstaculos.js';

const SEGUNDO = 30;

function rngFixo(semente = 1) {
  let s = semente;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** Mundo com um jogador em cada time; a partida começa no primeiro passo. */
function mundo() {
  const w = new World({ drones: 0, monstros: 0, elites: 0, torretas: false, rng: rngFixo() });
  const a = w.addPlayer('A', 'bellico'); // time 0
  const b = w.addPlayer('B', 'bellico'); // time 1
  w.step();
  return { w, a, b };
}

const escoltaDo = (w, time) => w.escoltas.lista.find((e) => e.vivo && e.time === time);

function colocar(j, x, z, yaw = 0) {
  const armas = j.ship.armas;
  j.ship = Object.assign(createShip('bellico', x, z, yaw), { time: j.time, armas });
  j.protegidoAte = 0;
}

/** Roda até a primeira escolta sair e mais `depoisS` segundos. */
function esperarEscolta(w, depoisS = 0) {
  for (let i = 0; i < (ESCOLTA.primeiraS + depoisS) * SEGUNDO + 2; i++) w.step();
}

test('escolta: sai da base depois do começo e anda pelo corredor junto com os mineradores', () => {
  const { w } = mundo();
  assert.equal(w.escoltas.lista.length, 0, 'ainda não saiu');
  esperarEscolta(w);
  for (const time of [0, 1]) {
    const e = escoltaDo(w, time);
    assert.ok(e, `a escolta do time ${time} saiu`);
    const b = BASES[time];
    assert.ok(Math.hypot(e.ship.x - b.x, e.ship.z - b.z) < 40, 'sai do centro da base');
    const ent = w.entidades().find((x) => x.id === e.id);
    assert.equal(ent.tipo, 'escolta');
    assert.equal(ent.time, time);
  }
  const e0 = escoltaDo(w, 0);
  let maisPerto = Infinity;
  let pertoDoMinerador = 0;
  for (let i = 0; i < 40 * SEGUNDO; i++) {
    w.step();
    const s = e0.ship;
    assert.ok(Math.abs(s.x - CORREDOR.x) < CORREDOR.largura / 2, `no corredor (x ${s.x.toFixed(1)})`);
    assert.ok(s.z > MINERIO.z, 'na metade do time 0');
    assert.equal(alturaSolida(s.x, s.z), heightAt(s.x, s.z), 'não entra em construção');
    maisPerto = Math.min(maisPerto, s.z);
    const m = w.mineradores.lista.find((x) => x.vivo && x.time === 0);
    if (m && Math.hypot(m.ship.x - s.x, m.ship.z - s.z) < 30) pertoDoMinerador++;
  }
  assert.ok(maisPerto < MINERIO.z + 120, `chegou perto do minério (z ${maisPerto.toFixed(0)})`);
  assert.ok(pertoDoMinerador > 20 * SEGUNDO, `andou colada no minerador (${(pertoDoMinerador / SEGUNDO).toFixed(0)} s)`);
  assert.equal(w.escoltas.lista.filter((e) => e.time === 0).length, ESCOLTA.maxAtivos, 'uma por time');
});

test('escolta: sem minerador, faz a ronda da rota (vai ao minério e volta)', () => {
  const { w } = mundo();
  w.mineradores.passo = () => {};
  w.mineradores.limpar();
  esperarEscolta(w);
  const e = escoltaDo(w, 1);
  let menorDist = Infinity;
  let voltou = false;
  for (let i = 0; i < 60 * SEGUNDO; i++) {
    w.step();
    menorDist = Math.min(menorDist, Math.abs(e.ship.z - MINERIO.z));
    if (menorDist < 80 && Math.abs(e.ship.z - BASES[1].z) < 150) voltou = true;
  }
  assert.ok(menorDist < 80, `foi até o minério (${menorDist.toFixed(0)} m)`);
  assert.ok(voltou, 'e voltou para perto da base');
});

test('escolta: atira no inimigo perto, não no aliado, e sob EMP para', () => {
  const { w, a, b } = mundo();
  w.mineradores.passo = () => {};
  w.mineradores.limpar();
  esperarEscolta(w, 6); // e sai da base
  const e = escoltaDo(w, 0);
  const tirosDela = () => w.tirarEventos().filter((ev) => ev.e === 'tiro' && ev.dono === e.id);
  // Aliado perto: nada.
  colocar(a, e.ship.x + 40, e.ship.z);
  colocar(b, 0, -900);
  w.tirarEventos();
  for (let i = 0; i < 2 * SEGUNDO; i++) w.step();
  assert.equal(tirosDela().length, 0, 'aliado não leva tiro');
  // Inimigo perto: tiro com a cor do time e dano fraco.
  colocar(a, 0, 900);
  colocar(b, e.ship.x + 45, e.ship.z);
  const hp = b.ship.hp;
  let tiros = [];
  for (let i = 0; i < 2 * SEGUNDO; i++) {
    w.step();
    tiros = tiros.concat(tirosDela());
  }
  assert.ok(tiros.length >= 2, `${tiros.length} tiros`);
  assert.ok(tiros.every((t) => t.fonte === 'escolta' && t.time === 0));
  assert.ok(b.ship.hp < hp, 'o inimigo perdeu vida');
  assert.ok(hp - b.ship.hp <= tiros.length * ESCOLTA.dano + 1e-9, 'dano fraco');
  // Sob EMP: sem tiro.
  e.ship.emp = 5;
  colocar(b, e.ship.x + 45, e.ship.z);
  w.tirarEventos();
  for (let i = 0; i < 2 * SEGUNDO; i++) w.step();
  assert.equal(tirosDela().length, 0, 'EMP: sem tiro');
});

test('escolta: destruída paga quem destruiu e a próxima sai depois do intervalo', () => {
  const { w, a, b } = mundo();
  w.mineradores.passo = () => {};
  w.mineradores.limpar();
  esperarEscolta(w, 6); // e sai da base (lá dentro é protegida)
  const e = escoltaDo(w, 1);
  e.ship.emp = 30; // parada, para o tiro de A pegar
  e.ship.hp = 10;
  colocar(a, e.ship.x, e.ship.z - 40, Math.PI); // atrás dela, olhando para +z
  colocar(b, 0, 900);
  const ouro = a.ouro;
  let seq = 0;
  for (let i = 0; i < 2 * SEGUNDO && e.vivo; i++) {
    w.pushInput(a.id, { s: ++seq, f1: true });
    w.step();
  }
  assert.equal(e.vivo, false);
  assert.equal(a.ouro - ouro, RECOMPENSA.escolta.ouro);
  assert.ok(w.tirarEventos().some((ev) => ev.e === 'morte' && ev.tipo === 'escolta' && ev.time === 1 && ev.por === a.id));
  for (let i = 0; i < (ESCOLTA.intervaloS - 1) * SEGUNDO; i++) w.step();
  assert.equal(escoltaDo(w, 1), undefined, 'ainda no intervalo');
  for (let i = 0; i < 2 * SEGUNDO; i++) w.step();
  assert.ok(escoltaDo(w, 1), 'a próxima saiu');
});
