// Combate entre jogadores (DESIGN-PARTIDA.md, "Combate"): renascimento que cresce
// com o nível e com a partida, assistência e sequência de abates
// (server/progressao.js + server/game.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World, ZONA_SEGURA } from '../server/game.js';
import {
  tempoRenascer,
  ouroEncerrar,
  recompensaAssistencia,
  RECOMPENSA,
  RENASCER_BASE_S,
  RENASCER_POR_NIVEL_S,
  RENASCER_PARTIDA_S,
  RENASCER_MAX_S,
  ASSISTENCIA_JANELA_S,
  ENCERRAR_OURO_POR_ABATE,
  ENCERRAR_OURO_MAX,
} from '../server/progressao.js';
import { createShip, IDX_ARMA } from '../shared/sim.js';
import { BASE } from '../shared/terrain.js';

const SEGUNDO = 30; // ticks
const X0 = BASE.x;
const Z0 = BASE.z - ZONA_SEGURA - 150; // mundo aberto ao norte da base 0

function rngFixo(semente = 1) {
  let s = semente;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/**
 * Mundo sem monstros nem mineradores com `n` jogadores (times alternados: 0, 1, 0,
 * 1...), cada um 200 m do outro no mundo aberto, sem proteção de nascimento e com
 * todas as armas (ship.armas indefinido).
 */
function arena(n, opcoes = {}) {
  const w = new World({ drones: 0, monstros: 0, elites: 0, rng: rngFixo(), ...opcoes });
  w.mineradores.passo = () => {};
  const js = [];
  for (let i = 0; i < n; i++) {
    const j = w.addPlayer('P' + i, 'bellico');
    colocar(j, i);
    js.push(j);
  }
  w.step(); // começa a partida
  return { w, js };
}

/**
 * Põe a nave nova do jogador na posição `i` da arena, sem proteção, com todas as
 * armas e a onda de choque já no Z (como se equipada na base: fora dela a troca
 * travaria o encaixe por TROCA_ARMA_S).
 */
function colocar(j, i) {
  j.ship = createShip('bellico', X0 + i * 200, Z0, 0);
  j.ship.time = j.time;
  j.ship.encaixes = [IDX_ARMA.choque, j.ship.encaixes[1]];
  j.protegidoAte = 0;
}

/** Espera o jogador renascer e o devolve à arena na posição `i`. */
function reviver(w, j, i) {
  for (let t = 0; t < 30 * SEGUNDO && !j.vivo; t++) w.step();
  assert.ok(j.vivo, 'renasceu');
  colocar(j, i);
}

/**
 * `a` encosta em `alvo` e solta uma onda de choque (só `alvo` no raio). Com
 * `mata`, o alvo está com 1 de HP e morre. Devolve os eventos do passo.
 */
function golpear(w, a, alvo, mata = false) {
  w.tirarEventos();
  Object.assign(a.ship, { x: alvo.ship.x, y: alvo.ship.y, z: alvo.ship.z + 10, vx: 0, vz: 0, cd1: 0, en: a.ship.maxEn });
  if (mata) alvo.ship.hp = 1;
  a.seq ??= 0;
  w.pushInput(a.id, { s: ++a.seq, f1: true, a: IDX_ARMA.choque });
  w.step();
  return w.tirarEventos();
}

const morteDe = (ev, id) => ev.find((e) => e.e === 'morte' && e.id === id);

test('renascimento: cresce com o nível e com a partida, com teto', () => {
  assert.equal(tempoRenascer(1, 0), RENASCER_BASE_S);
  assert.ok(Math.abs(tempoRenascer(5, 0) - (RENASCER_BASE_S + 4 * RENASCER_POR_NIVEL_S)) < 1e-9);
  assert.ok(Math.abs(tempoRenascer(1, 1) - (RENASCER_BASE_S + RENASCER_PARTIDA_S)) < 1e-9);
  assert.ok(Math.abs(tempoRenascer(1, 0.5) - (RENASCER_BASE_S + RENASCER_PARTIDA_S / 2)) < 1e-9);
  for (let n = 1; n < 20; n++) assert.ok(tempoRenascer(n + 1, 0.3) >= tempoRenascer(n, 0.3), `nível ${n}`);
  assert.equal(tempoRenascer(20, 1), RENASCER_MAX_S, 'teto');
  assert.ok(tempoRenascer(20, 0) <= RENASCER_MAX_S);
});

test('renascimento: no servidor, nível alto demora mais e o snapshot traz a contagem', () => {
  const { w, js } = arena(2);
  const [a, b] = js;
  let ev = golpear(w, a, b, true);
  assert.equal(morteDe(ev, b.id).renasce, RENASCER_BASE_S, 'nível 1, começo da partida');
  const snap = w.snapshotPara(b, [], []);
  assert.ok(Math.abs(snap.renasceEm - RENASCER_BASE_S) < 0.1, `renasceEm ${snap.renasceEm}`);
  const mortoEm = w.tick;
  reviver(w, b, 1);
  assert.ok(Math.abs(w.tick - mortoEm - RENASCER_BASE_S * SEGUNDO) <= 2, 'renasceu na hora certa');
  assert.equal(w.snapshotPara(b, [], []).renasceEm, 0, 'vivo: zero');

  b.nivel = 10;
  ev = golpear(w, a, b, true);
  const esperado = tempoRenascer(10, w.partida.fracaoDecorrida(w.tick));
  assert.ok(esperado > RENASCER_BASE_S + 5);
  assert.ok(Math.abs(b.respawnTick - w.tick - esperado * SEGUNDO) <= 1);
});

test('renascimento: perto do fim da partida demora mais', () => {
  const { w, js } = arena(2, { duracaoPartidaS: 20 });
  const [a, b] = js;
  for (let t = 0; t < 15 * SEGUNDO; t++) w.step();
  const ev = golpear(w, a, b, true);
  const s = (b.respawnTick - w.tick) / SEGUNDO;
  assert.ok(Math.abs(s - (RENASCER_BASE_S + RENASCER_PARTIDA_S * 0.75)) < 0.1, `${s} s`);
  assert.equal(morteDe(ev, b.id).renasce, Math.round(s));
});

test('assistência: paga quem do time do matador feriu na janela, e só ele', () => {
  // A e C (time 0) contra B e D (time 1).
  const { w, js } = arena(4);
  const [a, b, c, d] = js;
  const r = recompensaAssistencia();
  assert.equal(r.ouro, RECOMPENSA.jogador.ouro / 2);
  assert.equal(r.xp, RECOMPENSA.jogador.xp / 2);

  golpear(w, c, b); // C fere B
  golpear(w, d, b); // D é aliado de B: o choque não o fere, não conta
  const ouroC = c.ouro;
  const ouroD = d.ouro;
  const xpC = c.xp;
  const ev = golpear(w, a, b, true);
  const m = morteDe(ev, b.id);
  assert.deepEqual(m.assist, [c.id]);
  assert.equal(m.ouroAssist, r.ouro);
  assert.equal(c.ouro - ouroC, r.ouro, 'C ganhou a assistência');
  assert.equal(c.xp - xpC, r.xp);
  assert.equal(d.ouro, ouroD, 'aliado da vítima não ganha');
  assert.equal(m.ouro, RECOMPENSA.jogador.ouro, 'o matador leva o abate cheio');
  assert.equal(a.abates, 1);
  assert.equal(c.abates, 0, 'assistência não conta como abate');

  // Fora da janela: C feriu, mas faz mais de ASSISTENCIA_JANELA_S.
  reviver(w, b, 1);
  golpear(w, c, b);
  for (let t = 0; t < (ASSISTENCIA_JANELA_S + 1) * SEGUNDO; t++) w.step();
  const ouroC2 = c.ouro;
  const m2 = morteDe(golpear(w, a, b, true), b.id);
  assert.equal(m2.assist, undefined);
  assert.equal(c.ouro, ouroC2);
});

test('assistência: o registro de dano zera quando a vítima morre', () => {
  const { w, js } = arena(3);
  const [a, b, c] = js;
  golpear(w, c, b);
  golpear(w, a, b, true);
  reviver(w, b, 1);
  assert.equal(b.danoPor.size, 0);
  const ouroC = c.ouro;
  const m = morteDe(golpear(w, a, b, true), b.id);
  assert.equal(m.assist, undefined, 'o dano da vida anterior não conta');
  assert.equal(c.ouro, ouroC);
});

test('sequência: encerrar paga bônus proporcional e zera ao morrer', () => {
  assert.equal(ouroEncerrar(1), 0);
  assert.equal(ouroEncerrar(2), 2 * ENCERRAR_OURO_POR_ABATE);
  assert.equal(ouroEncerrar(100), ENCERRAR_OURO_MAX, 'teto');

  const { w, js } = arena(2);
  const [a, b] = js;
  let m = morteDe(golpear(w, a, b, true), b.id);
  assert.equal(m.seqPor, 1);
  assert.equal(m.encerrou, undefined, 'B não tinha sequência');
  reviver(w, b, 1);
  m = morteDe(golpear(w, a, b, true), b.id);
  assert.equal(a.sequencia, 2);
  assert.equal(m.seqPor, 2);
  reviver(w, b, 1);

  const ouroB = b.ouro;
  m = morteDe(golpear(w, b, a, true), a.id);
  assert.equal(m.seq, 2);
  assert.equal(m.encerrou, ouroEncerrar(2));
  assert.equal(m.ouro, RECOMPENSA.jogador.ouro + ouroEncerrar(2));
  assert.equal(b.ouro - ouroB, RECOMPENSA.jogador.ouro + ouroEncerrar(2));
  assert.equal(a.sequencia, 0, 'zerou ao morrer');
  assert.equal(b.sequencia, 1);
});

test('combate: sequência e registro de dano zeram na partida nova', () => {
  const { w, js } = arena(3, { duracaoPartidaS: 3, intervaloFimS: 1 });
  const [a, b, c] = js;
  golpear(w, a, b, true);
  reviver(w, b, 1);
  golpear(w, c, b); // C fere B: fica no registro
  assert.equal(a.sequencia, 1);
  assert.ok(b.danoPor.size > 0);
  const n = w.partida.numero;
  for (let t = 0; t < 10 * SEGUNDO && w.partida.numero === n; t++) w.step();
  assert.equal(w.partida.numero, n + 1);
  for (const j of js) {
    assert.equal(j.sequencia, 0, j.nome);
    assert.equal(j.danoPor.size, 0, j.nome);
  }
});
