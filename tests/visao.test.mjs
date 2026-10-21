// Visão do time (shared/visao.js): rocha e mineradora cortam a linha, campo de
// asteroides esconde quem está dentro, e a conta analítica bate com a planta da
// física (heightAt e a mineradora sólida).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VISAO_RAIO, VISAO_TORRETA, VISAO_BASE, VISAO_ASTEROIDE_PERTO, bloqueiaVisao, enxerga, baseEnxerga } from '../shared/visao.js';
import { noMapaAberto, sdRetanguloArredondado, ASTEROIDES, BASES, MINERADORA, ABERTO, ROCHAS, LANE } from '../shared/terrain.js';

/** Bloqueio por amostragem fina (1 m), da mesma planta: rocha (heightAt) ou mineradora. */
function bloqueiaAmostrado(x1, z1, x2, z2) {
  const d = Math.hypot(x2 - x1, z2 - z1);
  const n = Math.max(1, Math.ceil(d));
  const m = MINERADORA;
  for (let i = 0; i <= n; i++) {
    const x = x1 + ((x2 - x1) * i) / n;
    const z = z1 + ((z2 - z1) * i) / n;
    if (!noMapaAberto(x, z)) return true;
    if (sdRetanguloArredondado(x, z, m.x, m.z, m.meiaX, m.meiaZ, m.canto) < 0) return true;
  }
  return false;
}

/** Perto (até `folga` m) de alguma beira de rocha ou da mineradora: a amostragem pode errar ali. */
function rasante(x1, z1, x2, z2, folga = 3) {
  const d = Math.hypot(x2 - x1, z2 - z1);
  const n = Math.max(1, Math.ceil(d));
  for (let i = 0; i <= n; i++) {
    const x = x1 + ((x2 - x1) * i) / n;
    const z = z1 + ((z2 - z1) * i) / n;
    for (const [dx, dz] of [[folga, 0], [-folga, 0], [0, folga], [0, -folga]]) {
      if (noMapaAberto(x, z) !== noMapaAberto(x + dx, z + dz)) return true;
    }
  }
  return false;
}

/** Perto de um encontro da jungle com a lane (a quina arredondada que a visão trata como viva). */
function pertoDoEncontro(x1, z1, x2, z2) {
  const j = ABERTO.jungle.meiaX;
  const l = ABERTO.lane.meiaZ;
  const k = ABERTO.canto + 5;
  const d = Math.hypot(x2 - x1, z2 - z1);
  const n = Math.max(1, Math.ceil(d / 2));
  for (let i = 0; i <= n; i++) {
    const x = x1 + ((x2 - x1) * i) / n;
    const z = z1 + ((z2 - z1) * i) / n;
    if (Math.abs(Math.abs(x) - j) < k && Math.abs(Math.abs(z) - l) < k) return true;
  }
  return false;
}

test('visão: constantes do contrato', () => {
  assert.equal(VISAO_RAIO, 550);
  assert.equal(VISAO_TORRETA, 560);
  assert.equal(VISAO_ASTEROIDE_PERTO, 60);
  // A base vê o bolsão inteiro: todos os cantos dele ficam dentro do raio.
  for (const b of BASES) {
    const s = Math.sign(b.x);
    for (const [x, z] of [[1125, 180], [1125, -180], [1440, 180], [1440, -180]]) {
      assert.ok(Math.hypot(s * x - b.x, z - b.z) <= VISAO_BASE, `canto (${s * x}, ${z}) da base ${b.time}`);
    }
  }
});

test('visão: a mineradora divide a lane (ninguém vê o outro lado através dela)', () => {
  assert.equal(bloqueiaVisao(-200, 0, 200, 0), true);
  assert.equal(bloqueiaVisao(-200, 60, 200, -60), true);
  assert.equal(enxerga(-150, 0, 150, 0), false);
  // Por fora da mineradora (|z| > meiaZ) a linha passa.
  assert.equal(bloqueiaVisao(-200, 140, 200, 140), false);
  // Do mesmo lado, a lane é aberta.
  assert.equal(enxerga(-600, 0, -150, 40), true);
  assert.equal(enxerga(-600, 0, -150, 40, 300), false, 'fora do raio');
});

test('visão: rochas do quadrante, paredes em L e a borda cortam a linha', () => {
  // Rocha do quadrante Q0N (-697,5, -652,5): de baixo para cima, através dela.
  assert.equal(bloqueiaVisao(-697.5, -500, -697.5, -800), true);
  assert.equal(bloqueiaVisao(-950, -500, -950, -800), false, 'do lado da rocha, livre');
  // Parede em L do poço de cima: de fora do poço, pela barra vertical, até o Núcleo.
  assert.equal(bloqueiaVisao(-450, -750, -150, -750), true);
  // Pela entrada central (x de -99 a 99), livre.
  assert.equal(bloqueiaVisao(0, -500, 0, -880), false);
  // A borda: da lane para a jungle do outro lado do canto do bolsão.
  assert.equal(bloqueiaVisao(-1300, 100, -1000, 400), true);
  assert.equal(bloqueiaVisao(-1300, 100, -1000, 100), false, 'pelo bolsão até a lane');
  // De dentro da jungle até a lane, sem passar pela rocha.
  assert.equal(bloqueiaVisao(-900, 500, -900, 0), false);
});

test('visão: a conta analítica bate com a planta amostrada (fora dos rasantes)', () => {
  let a = 12345;
  const rng = () => (a = (a * 16807) % 2147483647) / 2147483647;
  let conferidos = 0;
  let bloqueados = 0;
  for (let i = 0; i < 4000; i++) {
    const x1 = (rng() * 2 - 1) * 1460;
    const z1 = (rng() * 2 - 1) * 1080;
    const ang = rng() * Math.PI * 2;
    const d = rng() * 700;
    const x2 = x1 + Math.cos(ang) * d;
    const z2 = z1 + Math.sin(ang) * d;
    if (!noMapaAberto(x1, z1) || !noMapaAberto(x2, z2)) continue;
    if (rasante(x1, z1, x2, z2) || pertoDoEncontro(x1, z1, x2, z2)) continue;
    const esperado = bloqueiaAmostrado(x1, z1, x2, z2);
    assert.equal(bloqueiaVisao(x1, z1, x2, z2), esperado, `(${x1.toFixed(0)}, ${z1.toFixed(0)}) → (${x2.toFixed(0)}, ${z2.toFixed(0)})`);
    conferidos++;
    if (esperado) bloqueados++;
  }
  assert.ok(conferidos > 1500, `${conferidos} linhas conferidas`);
  assert.ok(bloqueados > 40 && bloqueados < conferidos - 40, `${bloqueados} bloqueadas: mistura das duas`);
});

test('visão: simétrica por rotação de 180° e nos dois sentidos da linha', () => {
  let a = 99;
  const rng = () => (a = (a * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 2000; i++) {
    const x1 = (rng() * 2 - 1) * 1450;
    const z1 = (rng() * 2 - 1) * 1070;
    const x2 = (rng() * 2 - 1) * 1450;
    const z2 = (rng() * 2 - 1) * 1070;
    const v = bloqueiaVisao(x1, z1, x2, z2);
    assert.equal(bloqueiaVisao(x2, z2, x1, z1), v, 'sentido');
    assert.equal(bloqueiaVisao(-x1, -z1, -x2, -z2), v, 'rotação');
  }
});

test('visão: campo de asteroides esconde quem está dentro', () => {
  const c = ASTEROIDES.find((x) => x.id === 'AC0N');
  const dentro = { x: c.x, z: c.z };
  // De fora, a 150 m, com linha livre: não vê.
  const fora = { x: c.x - c.largura / 2 - 100, z: c.z };
  assert.equal(bloqueiaVisao(fora.x, fora.z, dentro.x, dentro.z), false);
  assert.equal(enxerga(fora.x, fora.z, dentro.x, dentro.z), false);
  // Quem está dentro vê quem está fora (o campo só esconde quem está nele).
  assert.equal(enxerga(dentro.x, dentro.z, fora.x, fora.z), true);
  // Do mesmo campo, vê.
  assert.equal(enxerga(c.x, c.z - 100, dentro.x, dentro.z), true);
  // Encostado (até 60 m), vê mesmo de fora.
  const borda = { x: c.x - c.largura / 2 + 5, z: c.z };
  assert.equal(enxerga(borda.x - 50, borda.z, borda.x, borda.z), true);
  assert.equal(enxerga(borda.x - 70, borda.z, borda.x, borda.z), false);
  // Outro campo não vale: de dentro de AC1N não se vê quem está em AC0N.
  const outro = ASTEROIDES.find((x) => x.id === 'AC1N');
  assert.equal(enxerga(outro.x, outro.z, dentro.x, dentro.z, 1000), false);
});

test('visão: a base enxerga o próprio bolsão, mas não a lane longe', () => {
  for (const b of BASES) {
    const s = Math.sign(b.x);
    assert.equal(baseEnxerga(b.time, s * 1410, 165), true);
    assert.equal(baseEnxerga(b.time, s * 1140, -165), true);
    assert.equal(baseEnxerga(b.time, s * 900, LANE.z), false);
    assert.equal(baseEnxerga(1 - b.time, s * 1300, 0), false, 'a base do outro time não vê');
  }
});

test('visão: é rápida (segmento contra as formas, sem amostrar)', () => {
  let a = 7;
  const rng = () => (a = (a * 16807) % 2147483647) / 2147483647;
  const n = 200000;
  const pts = Array.from({ length: n }, () => [(rng() * 2 - 1) * 1400, (rng() * 2 - 1) * 1000, (rng() * 2 - 1) * 400, (rng() * 2 - 1) * 400]);
  const t0 = performance.now();
  let k = 0;
  for (const [x, z, dx, dz] of pts) if (enxerga(x, z, x + dx, z + dz)) k++;
  const ms = performance.now() - t0;
  assert.ok(k > 0);
  assert.ok(ms < 2000, `${n} testes em ${ms.toFixed(0)} ms`);
  assert.ok(ROCHAS.length >= 13);
});
