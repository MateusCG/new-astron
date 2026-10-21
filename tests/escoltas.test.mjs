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
import { BASES, LANE, MINERADORA, DOCAS, heightAt } from '../shared/terrain.js';
import { alturaSolida } from '../shared/obstaculos.js';

const SEGUNDO = 30;

function rngFixo(semente = 1) {
  let s = semente;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** Mundo com um jogador em cada time; a partida começa no primeiro passo. */
function mundo() {
  const w = new World({ jungle: false, torretas: false, rng: rngFixo() });
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

test('escolta: sai da base depois do começo e anda pela lane junto com os mineradores', () => {
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
  let maisPerto = -Infinity;
  let pertoDoMinerador = 0;
  for (let i = 0; i < 50 * SEGUNDO; i++) {
    w.step();
    const s = e0.ship;
    assert.ok(Math.abs(s.z - LANE.z) < LANE.meiaLargura, `na lane (z ${s.z.toFixed(1)})`);
    assert.ok(s.x < MINERADORA.x, 'na metade do time 0');
    assert.equal(alturaSolida(s.x, s.z), heightAt(s.x, s.z), 'não entra em construção');
    maisPerto = Math.max(maisPerto, s.x);
    const m = w.mineradores.lista.find((x) => x.vivo && x.time === 0);
    if (m && Math.hypot(m.ship.x - s.x, m.ship.z - s.z) < 30) pertoDoMinerador++;
  }
  assert.ok(maisPerto > DOCAS[0].x - 120, `chegou perto da doca (x ${maisPerto.toFixed(0)})`);
  assert.ok(pertoDoMinerador > 25 * SEGUNDO, `andou colada no minerador (${(pertoDoMinerador / SEGUNDO).toFixed(0)} s)`);
  assert.equal(w.escoltas.lista.filter((e) => e.time === 0).length, ESCOLTA.maxAtivos, 'três por time');
});

test('escolta: as três saem em fila e se espalham pelo comboio dos 10 mineradores, sem empilhar', () => {
  const { w } = mundo();
  esperarEscolta(w);
  assert.equal(w.escoltas.lista.filter((e) => e.time === 0).length, 1, 'a primeira sai sozinha');
  for (let i = 0; i < ESCOLTA.saidaS * SEGUNDO; i++) w.step();
  assert.equal(w.escoltas.lista.filter((e) => e.time === 0).length, 2, 'a segunda sai ESCOLTA.saidaS depois');
  let menor = Infinity;
  let espalhadas = 0;
  for (let i = 0; i < 90 * SEGUNDO; i++) {
    w.step();
    if (i < 30 * SEGUNDO) continue; // as três saíram da base e alcançaram o lugar
    for (const t of [0, 1]) {
      const es = w.escoltas.lista.filter((e) => e.vivo && e.time === t);
      assert.equal(es.length, ESCOLTA.maxAtivos);
      let maior = 0;
      for (let a = 0; a < es.length; a++) {
        for (let b = a + 1; b < es.length; b++) {
          const d = Math.hypot(es[a].ship.x - es[b].ship.x, es[a].ship.z - es[b].ship.z);
          menor = Math.min(menor, d);
          maior = Math.max(maior, d);
        }
      }
      if (maior > 300) espalhadas++;
    }
  }
  assert.ok(menor > 15, `duas escoltas do mesmo time a ${menor.toFixed(1)} m`);
  assert.ok(espalhadas > 60 * SEGUNDO, 'frente e fim do comboio longe uma da outra');
});

test('escolta: sem minerador, faz a ronda da rota (vai à doca e volta)', () => {
  const { w } = mundo();
  w.mineradores.passo = () => {};
  w.mineradores.limpar();
  esperarEscolta(w);
  const e = escoltaDo(w, 1);
  let menorDist = Infinity;
  let voltou = false;
  const doca = DOCAS[1];
  for (let i = 0; i < 75 * SEGUNDO; i++) {
    w.step();
    menorDist = Math.min(menorDist, Math.hypot(e.ship.x - doca.x, e.ship.z - doca.z));
    if (menorDist < 40 && Math.abs(e.ship.x - BASES[1].x) < 150) voltou = true;
  }
  assert.ok(menorDist < 40, `foi até a doca (${menorDist.toFixed(0)} m)`);
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
  esperarEscolta(w, (ESCOLTA.maxAtivos - 1) * ESCOLTA.saidaS + 6); // as três saíram e a primeira já saiu da base (lá dentro é protegida)
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
  const vivas = () => w.escoltas.lista.filter((x) => x.vivo && x.time === 1).length;
  for (let i = 0; i < (ESCOLTA.intervaloS - 1) * SEGUNDO; i++) w.step();
  assert.equal(vivas(), ESCOLTA.maxAtivos - 1, 'ainda no intervalo');
  for (let i = 0; i < 2 * SEGUNDO; i++) w.step();
  assert.equal(vivas(), ESCOLTA.maxAtivos, 'a reposição saiu');
});
