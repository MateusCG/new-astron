import { test } from 'node:test';
import assert from 'node:assert/strict';
import { heightAt, paredeAt, BASE, MAP_HALF } from '../shared/terrain.js';
import {
  DT,
  HOVER,
  RACES,
  VEL_FATOR,
  WEAPONS,
  createShip,
  stepShip,
  createBullet,
  stepBullet,
  bulletHits,
  sanitizeInput,
  forward,
  ALTURA_POUSADO,
} from '../shared/sim.js';
import { podePousar, topoPouso, AREAS_POUSO } from '../shared/terrain.js';

const FRENTE = { th: 1, tu: 0, b: false, f1: false, f2: false };

test('terreno é determinístico e a base é plana', () => {
  assert.equal(heightAt(123.4, -567.8), heightAt(123.4, -567.8));
  assert.ok(heightAt(BASE.x, BASE.z) < 4, 'base no fundo');
  assert.ok(paredeAt(BASE.x + 50, BASE.z + 50) === 0, 'bacia aberta em volta da base');
  assert.ok(heightAt(MAP_HALF - 5, 0) > 100, 'muralha na borda');
});

test('da base dá para chegar longe pelos cânions (rede ligada)', () => {
  // Busca em largura num grid de 8 m, com a mesma regra de inclinação da nave.
  const passo = 8;
  const n = Math.floor((2 * MAP_HALF) / passo);
  const h = (i, j) => heightAt(-MAP_HALF + i * passo, -MAP_HALF + j * passo);
  const visto = new Uint8Array(n * n);
  const ini = (n / 2) * n + n / 2;
  const fila = [ini];
  visto[ini] = 1;
  let alcancados = 0;
  while (fila.length) {
    const k = fila.pop();
    alcancados++;
    const i = Math.floor(k / n);
    const j = k % n;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di;
      const b = j + dj;
      if (a < 0 || b < 0 || a >= n || b >= n) continue;
      const kk = a * n + b;
      if (visto[kk]) continue;
      if ((h(a, b) - h(i, j)) / passo > 0.75) continue;
      visto[kk] = 1;
      fila.push(kk);
    }
  }
  assert.ok(alcancados / (n * n) > 0.25, `só ${((100 * alcancados) / (n * n)).toFixed(1)}% alcançável`);
});

test('nave acelera até a velocidade da raça e flutua acima do chão', () => {
  for (const race of Object.keys(RACES)) {
    const s = createShip(race, BASE.x, BASE.z, 0);
    for (let i = 0; i < 90; i++) stepShip(s, FRENTE);
    const v = Math.hypot(s.vx, s.vz);
    const max = RACES[race].velocidade * VEL_FATOR;
    assert.ok(v > max * 0.9 && v <= max + 1e-6, `${race}: ${v} vs ${max}`);
    assert.ok(Math.abs(s.y - (heightAt(s.x, s.z) + HOVER)) < 3, `${race} na altura de voo`);
  }
});

test('boost gasta energia e trava ao zerar até soltar o botão', () => {
  const s = createShip('bellico', BASE.x, BASE.z, 0);
  let zerou = false;
  for (let i = 0; i < 30 * 5; i++) {
    stepShip(s, { ...FRENTE, b: true });
    zerou ||= s.en === 0;
  }
  assert.ok(zerou, 'energia chegou a zero');
  assert.equal(s.boost, false, 'segue travado com o botão apertado');
  stepShip(s, FRENTE); // soltou
  stepShip(s, { ...FRENTE, b: true });
  assert.equal(s.boost, true, 'apertou de novo com energia: volta');
});

test('nave não atravessa parede de cânion', () => {
  // Procura um ponto de chão com parede à frente e voa reto contra ela.
  let s = null;
  for (let x = -900; x < 900 && !s; x += 7) {
    for (let z = -900; z < 900 && !s; z += 7) {
      if (paredeAt(x, z) === 0 && paredeAt(x, z - 60) === 1) s = createShip('shrewdo', x, z, 0);
    }
  }
  assert.ok(s, 'achou cenário de teste');
  for (let i = 0; i < 30 * 8; i++) stepShip(s, FRENTE);
  assert.ok(heightAt(s.x, s.z) < 40, `subiu na parede: chão ${heightAt(s.x, s.z)}`);
});

test('arma respeita recarga e energia', () => {
  const s = createShip('acron', 0, 0, 0);
  let tiros = 0;
  for (let i = 0; i < 30; i++) tiros += stepShip(s, { th: 0, tu: 0, b: false, f1: true, f2: false }).length;
  const esperado = Math.floor(1 / WEAPONS.laser.cd) + 1;
  assert.ok(tiros >= esperado - 1 && tiros <= esperado, `${tiros} tiros em 1 s`);
});

test('tiro rápido acerta nave no caminho mesmo pulando por cima dela', () => {
  const atirador = createShip('acron', 0, 0, 0);
  const f = forward(0);
  const alvo = createShip('mechan', f.x * 30, f.z * 30, 0);
  const b = createBullet(atirador, 'laser', 1, 1);
  let acertou = false;
  for (let i = 0; i < 10 && !acertou; i++) {
    stepBullet(b, DT);
    acertou = bulletHits(b, alvo);
  }
  assert.ok(acertou);
});

test('comando da rede é limitado', () => {
  assert.deepEqual(sanitizeInput({ th: 50, tu: -9, b: 1, f1: 'x', f2: 0, p: 1 }), { th: 1, tu: -1, b: true, f1: true, f2: false, p: true });
  assert.deepEqual(sanitizeInput(null), { th: 0, tu: 0, b: false, f1: false, f2: false, p: false });
});

const PARADO = { th: 0, tu: 0, b: false, f1: false, f2: false, p: false };

test('pouso: L pousa (freia e encosta no chão, não atira) e só L decola', () => {
  const s = createShip('shrewdo', BASE.x, BASE.z + 55, 0);
  for (let i = 0; i < 25; i++) stepShip(s, FRENTE);
  assert.ok(Math.hypot(s.vx, s.vz) > 20, 'estava voando');
  assert.ok(podePousar(s.x, s.z), 'ainda dentro do círculo');

  // Aperta L segurando W: pousa e fica no chão mesmo com W apertado.
  stepShip(s, { ...FRENTE, p: true });
  for (let i = 0; i < 30 * 4; i++) stepShip(s, FRENTE);
  assert.equal(s.pousado, true);
  assert.ok(Math.hypot(s.vx, s.vz) < 1, 'parou');
  const topo = topoPouso(s.x, s.z);
  assert.ok(topo > heightAt(s.x, s.z), 'a base tem plataforma acima do terreno');
  assert.ok(Math.abs(s.y - (topo + ALTURA_POUSADO)) < 0.01, 'pousou em cima da plataforma, não dentro dela');
  assert.deepEqual(stepShip(s, { ...PARADO, f1: true, f2: true }), [], 'pousada não atira');

  // Soltar e apertar W de novo não decola.
  stepShip(s, PARADO);
  for (let i = 0; i < 30; i++) stepShip(s, FRENTE);
  assert.equal(s.pousado, true, 'W não decola');

  // L de novo: decola e volta à altura de voo.
  stepShip(s, { ...PARADO, p: true });
  for (let i = 0; i < 30 * 2; i++) stepShip(s, PARADO);
  assert.equal(s.pousado, false);
  assert.ok(Math.abs(s.y - (heightAt(s.x, s.z) + HOVER)) < 1, 'voltou para a altura de voo');
});

test('pouso: segurar L não fica pousando e decolando', () => {
  const s = createShip('acron', BASE.x, BASE.z, 0);
  for (let i = 0; i < 30; i++) stepShip(s, { ...PARADO, p: true });
  assert.equal(s.pousado, true);
  stepShip(s, PARADO);
  stepShip(s, { ...PARADO, p: true });
  assert.equal(s.pousado, false, 'apertar L de novo decola');
});

test('pouso: fora da área de pouso o L não faz nada', () => {
  const a = AREAS_POUSO[0];
  const s = createShip('mechan', a.x, a.z - a.raio - 150, 0);
  stepShip(s, { ...PARADO, p: true });
  for (let i = 0; i < 30 * 3; i++) stepShip(s, PARADO);
  assert.equal(s.pousado, false);
  assert.ok(s.y > heightAt(s.x, s.z) + HOVER - 1, 'continua na altura de voo');
});

test('pouso: escorregar para fora do círculo enquanto freia cancela o pouso', () => {
  const a = AREAS_POUSO[0];
  const s = createShip('shrewdo', a.x, a.z - a.raio + 8, 0);
  for (let i = 0; i < 40; i++) stepShip(s, FRENTE); // já saiu voando do círculo
  s.x = a.x;
  s.z = a.z - a.raio + 1; // na beirada, indo para fora rápido
  stepShip(s, { ...FRENTE, p: true });
  for (let i = 0; i < 30; i++) stepShip(s, PARADO);
  assert.equal(s.pousado, false);
});

test('curva: a nave inclina para dentro (A abaixa a asa esquerda, D a direita)', () => {
  // roll positivo = rotation.z positivo no Three.js = asa esquerda para baixo, vista de trás.
  const esq = createShip('shrewdo', BASE.x, BASE.z, 0);
  const dir = createShip('shrewdo', BASE.x, BASE.z, 0);
  for (let i = 0; i < 20; i++) {
    stepShip(esq, { ...PARADO, th: 1, tu: 1 });
    stepShip(dir, { ...PARADO, th: 1, tu: -1 });
  }
  assert.ok(esq.roll > 0.3, `A: roll ${esq.roll}`);
  assert.ok(dir.roll < -0.3, `D: roll ${dir.roll}`);
});

test('pouso: em qualquer ponto do círculo a nave fica na mesma altura (topo plano)', () => {
  const a = AREAS_POUSO[0];
  const alturas = [];
  for (const [dx, dz] of [[0, 0], [40, 0], [-30, 35], [0, -55], [50, 30]]) {
    const s = createShip('acron', a.x + dx, a.z + dz, 0);
    stepShip(s, { ...PARADO, p: true });
    for (let i = 0; i < 30 * 3; i++) stepShip(s, PARADO);
    assert.equal(s.pousado, true);
    alturas.push(s.y);
  }
  assert.ok(Math.max(...alturas) - Math.min(...alturas) < 0.01, `alturas: ${alturas.map((y) => y.toFixed(2))}`);
});
