import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World, ZONA_SEGURA } from '../server/game.js';
import { createShip } from '../shared/sim.js';
import { BASE } from '../shared/terrain.js';

// rng com semente: os testes não dependem da sorte do Math.random.
function rngFixo(semente = 1) {
  let s = semente;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

const distBase = (s) => Math.hypot(s.x - BASE.x, s.z - BASE.z);
const CORREDOR = { x: BASE.x, z: BASE.z - ZONA_SEGURA - 250 }; // corredor norte, fora da base

test('monstros: o snapshot diz o tipo de cada entidade', () => {
  const w = new World({ drones: 1, monstros: 2, rng: rngFixo() });
  w.addPlayer('A', 'acron');
  const tipos = w.entidades().map((e) => [e.tipo, e.drone]);
  assert.deepEqual(tipos.sort(), [
    ['arnosh', true],
    ['jogador', false],
    ['vorax', true],
    ['vorax', true],
  ]);
});

test('monstros: Vorax solto longe acha o caminho pelos cânions até o jogador fora da base', () => {
  const w = new World({ drones: 0, monstros: 1, rng: rngFixo(3) });
  const j = w.addPlayer('Alvo', 'bellico');
  j.ship = createShip('bellico', CORREDOR.x, CORREDOR.z, 0);
  j.protegidoAte = Infinity; // só medimos a chegada
  const m = w.monstros[0];
  // No canto oeste do mapa, a quase 1 km em linha reta: em linha reta ele bateria
  // na parede (e não pode cortar pela zona segura).
  m.ship = createShip('mechan', -797, 314, 0);
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

test('monstros: com todo mundo na base, rondam a borda da zona segura sem entrar', () => {
  const w = new World({ drones: 0, monstros: 6, rng: rngFixo(5) });
  const j = w.addPlayer('Seguro', 'shrewdo');
  j.protegidoAte = 0;
  const hp = j.ship.hp;
  let perto = 0;
  for (let t = 0; t < 30 * 60; t++) {
    w.step();
    for (const m of w.monstros) assert.ok(distBase(m.ship) >= ZONA_SEGURA, 'monstro dentro da zona segura');
  }
  for (const m of w.monstros) if (distBase(m.ship) < ZONA_SEGURA + 120) perto++;
  assert.ok(perto >= 4, `${perto} de 6 rondando a borda`);
  assert.equal(j.ship.hp, hp, 'ninguém se machuca na base');
  assert.ok(!w.tirarEventos().some((e) => e.e === 'garra'), 'nem tenta golpear');
});

test('monstros: garra machuca o jogador fora da base', () => {
  const w = new World({ drones: 0, monstros: 1, rng: rngFixo(7) });
  const j = w.addPlayer('Presa', 'bellico');
  j.ship = createShip('bellico', CORREDOR.x, CORREDOR.z, 0);
  j.protegidoAte = 0;
  w.monstros[0].ship = createShip('mechan', CORREDOR.x, CORREDOR.z - 30, 0);
  const hp = j.ship.hp;
  for (let t = 0; t < 30 * 5; t++) w.step();
  assert.ok(j.ship.hp < hp, 'levou dano');
  const garras = w.tirarEventos().filter((e) => e.e === 'garra');
  assert.ok(garras.length >= 2 && garras.every((e) => e.alvo === j.id && e.dano > 0));
});

test('monstros: abate dá ouro e o Vorax renasce longe dos jogadores', () => {
  const w = new World({ drones: 0, monstros: 1, rng: rngFixo(11) });
  const j = w.addPlayer('Caçador', 'acron');
  j.ship = createShip('acron', CORREDOR.x, CORREDOR.z, 0);
  j.protegidoAte = Infinity; // a garra não atrapalha a conta
  const m = w.monstros[0];
  m.ship = createShip('mechan', CORREDOR.x, CORREDOR.z - 40, 0);
  let seq = 0;
  for (let t = 0; t < 30 * 10 && m.vivo; t++) {
    // O jogador mira sempre no monstro (gira para ele) e atira laser.
    const yawAlvo = Math.atan2(-(m.ship.x - j.ship.x), -(m.ship.z - j.ship.z));
    let d = yawAlvo - j.ship.yaw;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    w.pushInput(j.id, { s: ++seq, f1: true, tu: Math.max(-1, Math.min(1, d * 3)) });
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
