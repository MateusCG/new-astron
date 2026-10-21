// Construções sólidas (shared/obstaculos.js): a mineradora, as torres dos buffs de
// suporte e as torres sentinela, na mesma planta da física, da visão e do desenho.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { heightAt, noMapaAberto, BASE, BASES, LANE, MINERADORA, BUFFS, daBase as daBaseTerreno } from '../shared/terrain.js';
import { OBSTACULOS, TORRE_SUPORTE, ESCALA_TORRE_SUPORTE, TORRETA, PORTAL_WARP, POCOS, alturaSolida, daBase, pontoAberto, pontoLivre, definirObstaculoAtivo, obstaculoAtivo } from '../shared/obstaculos.js';
import { DT, createShip, stepShip, createBullet, stepBullet, SHIP_RADIUS, HOVER } from '../shared/sim.js';

const FRENTE = { th: 1, tu: 0, b: false, f1: false, f2: false, p: false };

/** Yaw que aponta de (x, z) para (ax, az) (convenção do sim: yaw 0 olha para -z). */
const mirar = (x, z, ax, az) => Math.atan2(-(ax - x), -(az - z));

/** De onde partir para voar contra a construção: da lane (mineradora) ou a 120 m, do lado da lane. */
function partida(o) {
  if (o.grupo === 'mineradora') return { x: -300, z: 0 };
  return { x: o.x, z: o.z - Math.sign(o.z) * 120 };
}

test('obstáculos: a mineradora, as torres de suporte e as torretas estão na planta', () => {
  const conta = (n) => OBSTACULOS.filter((o) => o.nome === n).length;
  assert.equal(conta('mineradora'), 1);
  assert.equal(conta('torre-suporte'), 2);
  assert.equal(conta('torreta'), 8);
  assert.equal(OBSTACULOS.length, 11, 'nada além disso (as bases não têm peça sólida)');
  for (const o of OBSTACULOS) {
    assert.ok(alturaSolida(o.x, o.z) > heightAt(o.x, o.z) + HOVER + 3, `${o.nome} é mais alto que o voo e sólido`);
    assert.ok(noMapaAberto(o.x, o.z), `${o.nome} fica no chão aberto`);
  }
  const m = OBSTACULOS.find((o) => o.nome === 'mineradora');
  assert.deepEqual([m.x, m.z, m.meiaLarg, m.meiaProf, m.canto, m.topo], [MINERADORA.x, MINERADORA.z, MINERADORA.meiaX, MINERADORA.meiaZ, MINERADORA.canto, MINERADORA.topo]);
  for (const b of BUFFS.filter((b) => b.tipo === 'suporte')) {
    const t = OBSTACULOS.find((o) => o.id === b.id);
    assert.ok(t, `torre ${b.id}`);
    assert.deepEqual([t.x, t.z, t.raio, t.topo - t.chao], [b.x, b.z, TORRE_SUPORTE.raio, TORRE_SUPORTE.altura]);
  }
  // O dobro do primeiro desenho (raio 7, 30 m), e o modelo esticado por igual.
  assert.equal(TORRE_SUPORTE.raio, 14);
  assert.equal(TORRE_SUPORTE.altura, 60);
  assert.equal(ESCALA_TORRE_SUPORTE, 2);
  assert.equal(TORRE_SUPORTE.altura / 30, ESCALA_TORRE_SUPORTE, 'mesma escala na altura e na largura');
  assert.ok(PORTAL_WARP.base >= 30, 'o portal flutua acima da altura de voo');
  assert.equal(daBase, daBaseTerreno);
});

test('obstáculos: as torres (sentinela e de suporte) ficam inteiras no campo aberto, sem encostar em rocha', () => {
  for (const o of OBSTACULOS.filter((o) => o.forma === 'cilindro')) {
    for (let a = 0; a < 360; a += 15) {
      const x = o.x + Math.cos((a * Math.PI) / 180) * (o.raio + 5);
      const z = o.z + Math.sin((a * Math.PI) / 180) * (o.raio + 5);
      assert.ok(noMapaAberto(x, z) && heightAt(x, z) === 0, `${o.id} encosta em rocha em (${x.toFixed(0)}, ${z.toFixed(0)})`);
    }
  }
  assert.equal(TORRETA.raio, 9, 'o dobro da primeira (4,5 m)');
});

test('obstáculos: simétricos por rotação de 180°', () => {
  for (const o of OBSTACULOS) {
    const g = OBSTACULOS.find((p) => p.nome === o.nome && Math.abs(p.x + o.x) < 1e-6 && Math.abs(p.z + o.z) < 1e-6);
    assert.ok(g, `${o.nome} (${o.x}, ${o.z}) tem gêmeo`);
    assert.ok(Math.abs(g.topo - g.chao - (o.topo - o.chao)) < 1e-9);
    if (o.time !== undefined) assert.equal(g.time, 1 - o.time);
  }
  assert.deepEqual(daBase(BASES[1], 10, -20), { x: BASES[1].x - 10, z: BASES[1].z + 20 });
});

test('obstáculos: a torre de suporte sai da física quando cai e volta depois', () => {
  const t = OBSTACULOS.find((o) => o.id === 'BS0');
  assert.ok(obstaculoAtivo('BS0'));
  assert.ok(alturaSolida(t.x, t.z) >= 30);
  definirObstaculoAtivo('BS0', false);
  try {
    assert.equal(obstaculoAtivo('BS0'), false);
    assert.equal(alturaSolida(t.x, t.z), heightAt(t.x, t.z), 'caída, não é mais sólida');
    assert.ok(alturaSolida(t.x, t.z, 0, true) >= 30, 'a grade dos monstros conta de pé');
    assert.ok(obstaculoAtivo('BS1'), 'a outra continua');
  } finally {
    definirObstaculoAtivo('BS0', true);
  }
  assert.ok(alturaSolida(t.x, t.z) >= 30);
});

test('obstáculos: a nave não atravessa nenhuma construção', () => {
  for (const o of OBSTACULOS) {
    // Parte de perto e acelera reto na direção da construção por 6 s (inclusive boost).
    const p = partida(o);
    assert.ok(pontoLivre(p.x, p.z), `${o.nome}: partida livre`);
    const s = createShip('shrewdo', p.x, p.z, 0);
    s.yaw = mirar(s.x, s.z, o.x, o.z);
    for (let i = 0; i < 30 * 6; i++) {
      stepShip(s, { ...FRENTE, b: true });
      assert.equal(alturaSolida(s.x, s.z), heightAt(s.x, s.z), `${o.nome}: entrou na construção no passo ${i}`);
    }
    assert.ok(Math.hypot(s.x - o.x, s.z - o.z) > Math.min(o.alcance * 0.5, o.raio ?? Infinity), `${o.nome}: parou do lado de fora`);
  }
});

test('obstáculos: tiro some ao bater na mineradora e na torre de suporte', () => {
  for (const alvo of [OBSTACULOS.find((o) => o.nome === 'mineradora'), OBSTACULOS.find((o) => o.nome === 'torre-suporte')]) {
    const p = partida(alvo);
    const s = createShip('acron', p.x, p.z, 0);
    s.yaw = mirar(s.x, s.z, alvo.x, alvo.z);
    const b = createBullet(s, 'laser', 1, 1);
    for (let i = 0; i < 200 && stepBullet(b, DT); i++);
    const dist = Math.hypot(b.x - alvo.x, b.z - alvo.z);
    assert.ok(dist < alvo.alcance + 15, `parou no ${alvo.nome} (a ${dist.toFixed(1)} m do centro)`);
  }
});

test('obstáculos: ninguém nasce dentro de construção, e a base é livre', () => {
  // Jogadores nascem até 60 m do centro da base (server/game.js); a base inteira é livre.
  for (const b of BASES) {
    for (let a = 0; a < 360; a += 10) {
      for (const r of [0, 30, 60, 120, b.raio - 10]) {
        const x = b.x + Math.cos((a * Math.PI) / 180) * r;
        const z = b.z + Math.sin((a * Math.PI) / 180) * r;
        if (!noMapaAberto(x, z)) continue; // o bolsão é mais estreito que a zona segura
        assert.equal(alturaSolida(x, z, SHIP_RADIUS), heightAt(x, z), `ponto (${x.toFixed(0)}, ${z.toFixed(0)})`);
      }
    }
  }
  assert.ok(pontoLivre(BASE.x, BASE.z, 60));
});

test('obstáculos: pontoAberto sorteia chão livre na jungle, fora das bases, da lane e dos poços', () => {
  let a = 7;
  const rng = () => (a = (a * 16807) % 2147483647) / 2147483647;
  const lados = new Set();
  for (let i = 0; i < 300; i++) {
    const p = pontoAberto(rng);
    assert.ok(pontoLivre(p.x, p.z), `(${p.x.toFixed(0)}, ${p.z.toFixed(0)}) livre`);
    assert.ok(Math.abs(p.z - LANE.z) > LANE.meiaLargura + 50, 'fora da lane');
    for (const b of BASES) assert.ok(Math.hypot(p.x - b.x, p.z - b.z) > b.raio + 100, 'fora da base');
    assert.ok(!(Math.abs(p.x) < POCOS.meiaX && Math.abs(p.z) > POCOS.zMin), 'fora dos poços');
    lados.add(`${Math.sign(p.x)}${Math.sign(p.z)}`);
  }
  assert.equal(lados.size, 4, 'espalha pelos quatro quadrantes');
  // O nome antigo da folga continua valendo.
  const p = pontoAberto(rng, { folgaCorredor: 300 });
  assert.ok(Math.abs(p.z) > LANE.meiaLargura + 300);
});
