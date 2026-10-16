import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World, ZONA_SEGURA } from '../server/game.js';
import { createShip } from '../shared/sim.js';
import { BASES } from '../shared/terrain.js';
import { MapaNavegacao } from '../server/navegacao.js';
import { CAMPO } from './lugares.mjs';

// rng com semente: os testes não dependem da sorte do Math.random.
function rngFixo(semente = 1) {
  let s = semente;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

// Distância até a base mais perto (as duas têm zona segura).
const distBase = (s) => Math.min(...BASES.map((b) => Math.hypot(s.x - b.x, s.z - b.z)));
const CORREDOR = CAMPO; // jungle do time 0, fora da base

// Os monstros da jungle são passivos: só caçam quem os atacou. Nos testes que medem a
// caça, o monstro já começa com raiva do jogador.
const provocar = (monstro, jogador) => (monstro.raiva = new Map([[jogador.id, Infinity]]));

test('monstros: o snapshot diz o tipo de cada entidade', () => {
  const w = new World({ drones: 1, monstros: 2, elites: 1, rng: rngFixo() });
  w.addPlayer('A', 'acron');
  const tipos = w.entidades().map((e) => [e.tipo, e.drone]);
  assert.deepEqual(tipos.sort(), [
    ['arnosh', true],
    ['jogador', false],
    ['krakor', true],
    ['vorax', true],
    ['vorax', true],
  ]);
});

test('monstros: Vorax solto longe contorna as rochas até o jogador fora da base', () => {
  const w = new World({ drones: 0, monstros: 1, elites: 0, rng: rngFixo(3) });
  const j = w.addPlayer('Alvo', 'bellico');
  j.ship = createShip('bellico', CORREDOR.x, CORREDOR.z, 0);
  j.protegidoAte = Infinity; // só medimos a chegada
  const m = w.monstros[0];
  // Em cima, a 1,1 km, atrás da rocha do quadrante: em linha reta bateria nela.
  const ini = { x: -450, z: -1000 };
  assert.equal(new MapaNavegacao({ raioBloqueio: ZONA_SEGURA }).linhaLivre(ini.x, ini.z, j.ship.x, j.ship.z), false, 'tem rocha no meio');
  m.ship = createShip('mechan', ini.x, ini.z, 0);
  provocar(m, j);
  let chegou = -1;
  for (let t = 0; t < 30 * 60; t++) {
    w.step();
    assert.ok(distBase(m.ship) >= ZONA_SEGURA, 'nunca entra na zona segura');
    if (Math.hypot(m.ship.x - j.ship.x, m.ship.z - j.ship.z) < 20) {
      chegou = t / 30;
      break;
    }
  }
  assert.ok(chegou > 0, `chegou perto do jogador (em ${chegou}s)`);
});

test('monstros: sem ser atacados, patrulham a jungle e ignoram quem passa perto', () => {
  const w = new World({ drones: 2, monstros: 6, elites: 1, rng: rngFixo(5) });
  const j = w.addPlayer('Passante', 'shrewdo');
  j.ship = createShip('shrewdo', CORREDOR.x, CORREDOR.z, 0);
  j.protegidoAte = 0;
  // Um de cada tipo colado na nave: nenhum ataca.
  w.monstros[0].ship = createShip('mechan', CORREDOR.x, CORREDOR.z - 20, 0);
  w.drones[0].ship = createShip('mechan', CORREDOR.x + 60, CORREDOR.z, 0);
  const k = w.elites.find((e) => e.tipo === 'krakor');
  k.ship = createShip('bellico', CORREDOR.x - 80, CORREDOR.z, 0);
  k.covil = { x: CORREDOR.x - 80, z: CORREDOR.z };
  const hp = j.ship.hp;
  for (let t = 0; t < 30 * 20; t++) {
    w.step();
    for (const m of w.monstros) assert.ok(distBase(m.ship) >= ZONA_SEGURA, 'monstro dentro da zona segura');
  }
  assert.equal(j.ship.hp, hp, 'ninguém atacou');
  assert.ok(!w.tirarEventos().some((e) => e.e === 'garra' || (e.e === 'tiro' && e.dono !== j.id)), 'nem golpe nem tiro');
});

test('monstros: atacado, o monstro fica com raiva de quem atirou e esquece depois', () => {
  const w = new World({ drones: 0, monstros: 1, elites: 0, rng: rngFixo(7) });
  const j = w.addPlayer('Atirador', 'acron');
  j.ship = createShip('acron', CORREDOR.x, CORREDOR.z, 0); // olha para -z
  j.protegidoAte = Infinity;
  const m = w.monstros[0];
  m.ship = createShip('mechan', CORREDOR.x, CORREDOR.z - 60, 0);
  m.ship.hp = m.ship.maxHp = 1e6; // não morre na conta
  let seq = 0;
  for (let t = 0; t < 30 * 2 && !m.raiva?.has(j.id); t++) {
    w.pushInput(j.id, { s: ++seq, th: 0, tu: 0, f1: true });
    w.step();
  }
  assert.ok(m.raiva?.get(j.id) > w.tick, 'anotou a raiva de quem atirou');
  // Passado o tempo da raiva, volta a ser passivo.
  m.raiva.set(j.id, w.tick + 3);
  for (let t = 0; t < 10; t++) w.step();
  assert.ok(!m.raiva.has(j.id), 'esqueceu');
  assert.equal(m.alvo, 0);
});

test('monstros: provocado, a garra machuca o jogador fora da base', () => {
  const w = new World({ drones: 0, monstros: 1, elites: 0, rng: rngFixo(7) });
  const j = w.addPlayer('Presa', 'bellico');
  j.ship = createShip('bellico', CORREDOR.x, CORREDOR.z, 0);
  j.protegidoAte = 0;
  w.monstros[0].ship = createShip('mechan', CORREDOR.x, CORREDOR.z - 30, 0);
  provocar(w.monstros[0], j);
  const hp = j.ship.hp;
  for (let t = 0; t < 30 * 5; t++) w.step();
  assert.ok(j.ship.hp < hp, 'levou dano');
  const garras = w.tirarEventos().filter((e) => e.e === 'garra');
  assert.ok(garras.length >= 2 && garras.every((e) => e.alvo === j.id && e.dano > 0));
});

test('monstros: abate dá ouro e o Vorax renasce longe dos jogadores', () => {
  const w = new World({ drones: 0, monstros: 1, elites: 0, rng: rngFixo(11) });
  const j = w.addPlayer('Caçador', 'acron');
  j.ship = createShip('acron', CORREDOR.x, CORREDOR.z, 0);
  j.protegidoAte = Infinity; // a garra não atrapalha a conta
  const m = w.monstros[0];
  m.ship = createShip('mechan', CORREDOR.x, CORREDOR.z - 40, 0);
  let seq = 0;
  for (let t = 0; t < 30 * 10 && m.vivo; t++) {
    // O jogador mira sempre no monstro (gira para ele) e atira com as duas armas de fábrica.
    const yawAlvo = Math.atan2(-(m.ship.x - j.ship.x), -(m.ship.z - j.ship.z));
    let d = yawAlvo - j.ship.yaw;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    w.pushInput(j.id, { s: ++seq, f1: true, f2: true, tu: Math.max(-1, Math.min(1, d * 3)) });
    w.step();
  }
  assert.equal(m.vivo, false, 'morreu');
  assert.equal(j.abates, 1);
  assert.equal(j.ouro, 30);
  const morte = w.tirarEventos().find((e) => e.e === 'morte' && e.id === m.id);
  assert.equal(morte.por, j.id);
  for (let t = 0; t < 30 * 7 && !m.vivo; t++) w.step();
  assert.equal(m.vivo, true, 'renasceu');
  assert.equal(m.ship.hp, m.ship.maxHp);
  assert.ok(Math.hypot(m.ship.x - j.ship.x, m.ship.z - j.ship.z) >= 450, 'renasceu longe do jogador');
});
