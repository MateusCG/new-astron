import { test } from 'node:test';
import assert from 'node:assert/strict';
import { heightAt, noMapaAberto, BASE, BASES, CORREDOR, MINERIO, OBJETIVOS } from '../shared/terrain.js';
import { OBSTACULOS, PORTAL, alturaSolida, daBase, pontoAberto, pontoLivre } from '../shared/obstaculos.js';
import { DT, createShip, stepShip, createBullet, stepBullet, SHIP_RADIUS } from '../shared/sim.js';

const FRENTE = { th: 1, tu: 0, b: false, f1: false, f2: false, p: false };

/** Yaw que aponta de (x, z) para (ax, az) (convenção do sim: yaw 0 olha para -z). */
const mirar = (x, z, ax, az) => Math.atan2(-(ax - x), -(az - z));

/** De onde partir para voar contra a construção: do centro da base dela ou do corredor. */
function partida(o) {
  if (o.grupo === 'base') return BASES[o.time];
  if (o.grupo === 'minerio') return { x: CORREDOR.x + 45, z: MINERIO.z + 120 };
  return { x: o.x + Math.sign(CORREDOR.x - o.x) * 150, z: o.z };
}

test('obstáculos: as construções das bases, do minério e dos objetivos B estão na planta', () => {
  const conta = (n) => OBSTACULOS.filter((o) => o.nome === n).length;
  assert.equal(conta('hangar'), 10);
  assert.equal(conta('coluna-portal'), 4);
  assert.equal(conta('antena'), 4);
  assert.equal(conta('cristal'), 7);
  assert.equal(conta('torre-objetivo'), OBJETIVOS.filter((o) => o.tipo === 'B').length);
  for (const o of OBSTACULOS) {
    assert.ok(alturaSolida(o.x, o.z) > heightAt(o.x, o.z) + 8, `${o.nome} é alto e sólido`);
    assert.ok(noMapaAberto(o.x, o.z), `${o.nome} fica no chão aberto`);
    if (o.grupo === 'base') {
      const b = BASES[o.time];
      assert.ok(Math.hypot(o.x - b.x, o.z - b.z) + o.alcance < b.raio, `${o.nome} dentro da base ${o.time}`);
    }
  }
});

test('obstáculos: as duas bases são a mesma planta girada 180°', () => {
  const doTime = (t) => OBSTACULOS.filter((o) => o.time === t);
  const a = doTime(0);
  const b = doTime(1);
  assert.equal(a.length, b.length);
  for (const o of a) {
    const g = b.find((p) => p.nome === o.nome && Math.abs(p.x + o.x) < 1e-6 && Math.abs(p.z + o.z) < 1e-6);
    assert.ok(g, `${o.nome} (${o.x.toFixed(0)}, ${o.z.toFixed(0)}) tem gêmeo`);
    assert.ok(Math.abs(g.topo - g.chao - (o.topo - o.chao)) < 1e-9);
  }
  assert.deepEqual(daBase(BASES[1], 10, -20), { x: -10, z: BASES[1].z + 20 });
});

test('obstáculos: a nave não atravessa nenhuma construção', () => {
  for (const o of OBSTACULOS) {
    // Parte de perto e acelera reto na direção da construção por 6 s (inclusive boost).
    const p = partida(o);
    const s = createShip('shrewdo', p.x, p.z, 0);
    s.yaw = mirar(s.x, s.z, o.x, o.z);
    for (let i = 0; i < 30 * 6; i++) {
      stepShip(s, { ...FRENTE, b: true });
      assert.equal(alturaSolida(s.x, s.z), heightAt(s.x, s.z), `${o.nome}: entrou na construção no passo ${i}`);
    }
    assert.ok(Math.hypot(s.x - o.x, s.z - o.z) > o.alcance * 0.5, `${o.nome}: parou do lado de fora`);
  }
});

test('obstáculos: o vão do portal das duas bases continua livre', () => {
  const s = createShip('bellico', BASES[0].x, BASES[0].z - 60, 0);
  for (let i = 0; i < 30 * 5; i++) stepShip(s, FRENTE);
  assert.ok(s.z < BASES[0].z - PORTAL.dz - 30, `saiu pelo portal do time 0 (z ${s.z.toFixed(0)})`);
  const v = createShip('bellico', BASES[1].x, BASES[1].z + 60, Math.PI);
  for (let i = 0; i < 30 * 5; i++) stepShip(v, FRENTE);
  assert.ok(v.z > BASES[1].z + PORTAL.dz + 30, `saiu pelo portal do time 1 (z ${v.z.toFixed(0)})`);
});

test('obstáculos: tiro some ao bater numa construção (hangar e torre de objetivo)', () => {
  for (const alvo of [OBSTACULOS.find((o) => o.nome === 'hangar'), OBSTACULOS.find((o) => o.nome === 'torre-objetivo')]) {
    const p = partida(alvo);
    const s = createShip('acron', p.x, p.z, 0);
    s.yaw = mirar(s.x, s.z, alvo.x, alvo.z);
    const b = createBullet(s, 'laser', 1, 1);
    for (let i = 0; i < 200 && stepBullet(b, DT); i++);
    const dist = Math.hypot(b.x - alvo.x, b.z - alvo.z);
    assert.ok(dist < alvo.alcance + 15, `parou no ${alvo.nome} (a ${dist.toFixed(1)} m do centro)`);
  }
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

test('obstáculos: pontoAberto sorteia chão livre no mundo aberto, fora das bases e do corredor', () => {
  let a = 7;
  const rng = () => (a = (a * 16807) % 2147483647) / 2147483647;
  const lados = new Set();
  for (let i = 0; i < 200; i++) {
    const p = pontoAberto(rng);
    assert.ok(pontoLivre(p.x, p.z), `(${p.x.toFixed(0)}, ${p.z.toFixed(0)}) livre`);
    assert.ok(Math.abs(p.x - CORREDOR.x) > CORREDOR.largura / 2 + 50, 'fora do corredor');
    for (const b of BASES) assert.ok(Math.hypot(p.x - b.x, p.z - b.z) > b.raio + 100, 'fora da base');
    lados.add(`${Math.sign(p.x)}${Math.sign(p.z)}`);
  }
  assert.equal(lados.size, 4, 'espalha pelos quatro quadrantes');
});
