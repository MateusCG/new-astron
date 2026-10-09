import { test } from 'node:test';
import assert from 'node:assert/strict';
import { heightAt, BASE } from '../shared/terrain.js';
import { OBSTACULOS, PORTAL, alturaSolida } from '../shared/obstaculos.js';
import { DT, createShip, stepShip, createBullet, stepBullet, SHIP_RADIUS } from '../shared/sim.js';

const FRENTE = { th: 1, tu: 0, b: false, f1: false, f2: false, p: false };

/** Yaw que aponta de (x, z) para (ax, az) (convenção do sim: yaw 0 olha para -z). */
const mirar = (x, z, ax, az) => Math.atan2(-(ax - x), -(az - z));

test('obstáculos: hangares, colunas do portal e antenas estão na planta', () => {
  const nomes = OBSTACULOS.map((o) => o.nome);
  assert.equal(nomes.filter((n) => n === 'hangar').length, 5);
  assert.equal(nomes.filter((n) => n === 'coluna-portal').length, 2);
  assert.equal(nomes.filter((n) => n === 'antena').length, 2);
  for (const o of OBSTACULOS) assert.ok(alturaSolida(o.x, o.z) > heightAt(o.x, o.z) + 10, `${o.nome} é alto e sólido`);
});

test('obstáculos: a nave não atravessa nenhuma construção da base', () => {
  for (const o of OBSTACULOS) {
    // Parte da plataforma e acelera reto na direção da construção por 6 s (inclusive boost).
    const s = createShip('shrewdo', BASE.x, BASE.z, 0);
    s.yaw = mirar(s.x, s.z, o.x, o.z);
    for (let i = 0; i < 30 * 6; i++) {
      stepShip(s, { ...FRENTE, b: true });
      assert.equal(alturaSolida(s.x, s.z), heightAt(s.x, s.z), `${o.nome}: entrou na construção no passo ${i}`);
    }
    assert.ok(Math.hypot(s.x - o.x, s.z - o.z) > o.alcance * 0.5, `${o.nome}: parou do lado de fora`);
  }
});

test('obstáculos: o vão do portal continua livre para sair da base', () => {
  const s = createShip('bellico', BASE.x, BASE.z - 40, 0);
  for (let i = 0; i < 30 * 5; i++) stepShip(s, FRENTE);
  assert.ok(s.z < PORTAL.z - 30, `passou pelo portal (z ${s.z.toFixed(0)})`);
});

test('obstáculos: tiro some ao bater numa construção', () => {
  const hangar = OBSTACULOS.find((o) => o.nome === 'hangar');
  const s = createShip('acron', BASE.x, BASE.z, 0);
  s.yaw = mirar(s.x, s.z, hangar.x, hangar.z);
  const b = createBullet(s, 'laser', 1, 1);
  let vivo = true;
  let passos = 0;
  while (vivo && passos < 200) {
    vivo = stepBullet(b, DT);
    passos++;
  }
  const dist = Math.hypot(b.x - hangar.x, b.z - hangar.z);
  assert.ok(dist < hangar.alcance + 15, `parou no hangar (a ${dist.toFixed(1)} m do centro)`);
});

test('obstáculos: ninguém nasce dentro de uma construção', () => {
  // Jogadores nascem até 60 m do centro da base (server/game.js).
  for (let a = 0; a < 360; a += 10) {
    for (const r of [0, 30, 60]) {
      const x = BASE.x + Math.cos((a * Math.PI) / 180) * r;
      const z = BASE.z + Math.sin((a * Math.PI) / 180) * r;
      assert.equal(alturaSolida(x, z, SHIP_RADIUS), heightAt(x, z), `ponto (${x.toFixed(0)}, ${z.toFixed(0)})`);
    }
  }
});
