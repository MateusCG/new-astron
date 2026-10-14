import { test } from 'node:test';
import assert from 'node:assert/strict';
import { heightAt, paredeAt, BASE, MAP_HALF_X } from '../shared/terrain.js';
import {
  DT,
  HOVER,
  NAVE_SEM_CLASSE,
  velocidadeBase,
  WEAPONS,
  createShip,
  stepShip,
  createBullet,
  stepBullet,
  bulletHits,
  sanitizeInput,
  forward,
  ALTURA_POUSADO,
  ARMAS,
  IDX_ARMA,
  armasIniciais,
  armasDisponiveis,
  versaoArma,
} from '../shared/sim.js';
import { podePousar, topoPouso, AREAS_POUSO } from '../shared/terrain.js';
import { NAVES, ORDEM_CLASSES } from '../shared/naves.js';

const FRENTE = { th: 1, tu: 0, b: false, f1: false, f2: false };
const PARADO = { th: 0, tu: 0, b: false, f1: false, f2: false, p: false };

test('terreno é determinístico e a base é plana', () => {
  assert.equal(heightAt(123.4, -567.8), heightAt(123.4, -567.8));
  assert.ok(heightAt(BASE.x, BASE.z) < 4, 'base no fundo');
  assert.ok(paredeAt(BASE.x + 50, BASE.z + 50) === 0, 'bacia aberta em volta da base');
  assert.ok(heightAt(MAP_HALF_X - 5, 0) > 100, 'muralha na borda');
});

// Conectividade do mapa, rochas e muralha: tests/mapa.test.mjs.

test('nave acelera até a velocidade da nave (raça, classe e tier) e flutua acima do chão', () => {
  const casos = [['mechan', undefined, 0, NAVE_SEM_CLASSE.velocidade]];
  for (const race of Object.keys(NAVES)) {
    for (const classe of ORDEM_CLASSES) for (const n of NAVES[race][classe]) casos.push([race, classe, n.tier, n.velocidade]);
  }
  for (const [race, classe, tier, mps] of casos) {
    const s = createShip(race, BASE.x, BASE.z, 0, classe, tier);
    for (let i = 0; i < 90; i++) stepShip(s, FRENTE);
    const v = Math.hypot(s.vx, s.vz);
    const max = mps;
    assert.equal(velocidadeBase(s), max);
    assert.ok(v > max * 0.9 && v <= max + 1e-6, `${race} ${classe} ${tier}: ${v} vs ${max}`);
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

test('arma respeita recarga e energia', () => {
  const s = createShip('acron', 0, 0, 0);
  const v = versaoArma(s.encaixes[0], 1);
  let disparos = 0;
  for (let i = 0; i < 30; i++) disparos += stepShip(s, { th: 0, tu: 0, b: false, f1: true, f2: false }).length > 0;
  const esperado = Math.floor(1 / v.cd) + 1;
  assert.ok(disparos >= esperado - 1 && disparos <= esperado, `${disparos} disparos em 1 s`);
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
  assert.deepEqual(sanitizeInput({ th: 50, tu: -9, b: 1, f1: 'x', f2: 0, p: 1, a: 1, a2: 7 }), {
    th: 1,
    tu: -1,
    b: true,
    f1: true,
    f2: false,
    p: true,
    r: false,
    a: 1,
    a2: 7,
  });
  assert.deepEqual(sanitizeInput(null), { th: 0, tu: 0, b: false, f1: false, f2: false, p: false, r: false, a: -1, a2: -1 });
});

test('comando da rede: arma fora da lista vira a de fábrica do encaixe', () => {
  for (const a of [ARMAS.length, 999, -1, 1.5, '1', '__proto__', 'length', null, undefined, {}, NaN, Infinity]) {
    assert.equal(sanitizeInput({ a, a2: a }).a, -1, String(a));
    assert.equal(sanitizeInput({ a, a2: a }).a2, -1, String(a));
  }
  for (let a = 0; a < ARMAS.length; a++) {
    assert.equal(sanitizeInput({ a }).a, a);
    assert.equal(sanitizeInput({ a2: a }).a2, a);
  }
  // Mesmo sem passar pelo sanitize (IA dos drones), stepShip não aceita índice ruim.
  const s = createShip('acron', 0, 0, 0);
  const [z] = armasIniciais('acron');
  assert.ok(stepShip(s, { ...PARADO, f1: true, a: 7000 }).every((d) => d.kind === ARMAS[z]));
  assert.deepEqual(s.encaixes, armasIniciais('acron'));
});

test('armas: canos paralelos saem lado a lado (Feixe Duplo) e o leque com os ângulos certos (Feixe Triplo)', () => {
  const duplo = IDX_ARMA.o311001;
  const triplo = IDX_ARMA.o311008;
  for (const yaw of [0, 0.7, -2.1]) {
    const d = createShip('shrewdo', 0, 0, yaw);
    const disparos = stepShip(d, { ...PARADO, f1: true, a: duplo });
    assert.equal(disparos.length, 2);
    const [e, r] = disparos.map((t, i) => createBullet(d, t.kind, i, 1, t.off, t.ang, t.nivel));
    assert.equal(e.vx, r.vx);
    assert.equal(e.vz, r.vz);
    const f = forward(d.yaw);
    const dx = r.x - e.x;
    const dz = r.z - e.z;
    assert.ok(Math.abs(Math.hypot(dx, dz) - 2.5) < 1e-9, 'vão entre os canos (10 m do original × 0,25)');
    assert.ok(Math.abs(dx * f.x + dz * f.z) < 1e-9, 'lado a lado, nenhum na frente');
    assert.ok(dx * -f.z + dz * f.x > 0, 'o do off positivo sai à direita');

    const s = createShip('shrewdo', 0, 0, yaw);
    for (let i = 0; i < 30; i++) stepShip(s, PARADO);
    const leque = stepShip(s, { ...PARADO, f1: true, a: triplo });
    assert.equal(leque.length, 3);
    const tiros = leque.map((t, i) => createBullet(s, t.kind, i, 1, t.off, t.ang, t.nivel));
    const rumo = (b) => Math.atan2(-(b.vx - s.vx * 0.5), -(b.vz - s.vz * 0.5));
    const esperado = [5, 0, -5].map((g) => (g * Math.PI) / 180);
    tiros.forEach((b, i) => {
      let dif = rumo(b) - s.yaw;
      while (dif > Math.PI) dif -= 2 * Math.PI;
      while (dif < -Math.PI) dif += 2 * Math.PI;
      assert.ok(Math.abs(dif - esperado[i]) < 1e-9, `yaw ${yaw}: ${dif} vs ${esperado[i]}`);
      assert.ok(Math.abs(Math.hypot(b.vx - s.vx * 0.5, b.vz - s.vz * 0.5) - WEAPONS.o311008.vel) < 1e-9, 'mesma velocidade');
    });
  }
});

test('lento: nave lenta voa a uma fração da velocidade máxima e depois volta', () => {
  const s = createShip('shrewdo', BASE.x, BASE.z, 0);
  const max = velocidadeBase(s);
  const DUR = 2;
  const MULT = 0.6;
  s.lento = DUR;
  s.lentoMult = MULT;
  let maior = 0;
  for (let i = 0; i < Math.floor(DUR / DT) - 1; i++) {
    stepShip(s, FRENTE);
    maior = Math.max(maior, Math.hypot(s.vx, s.vz));
  }
  assert.ok(maior <= max * MULT + 1e-6, `lenta: ${maior} > ${max * MULT}`);
  assert.ok(maior > max * MULT * 0.9, 'chegou perto do limite lento');
  assert.ok(s.lento > 0 && s.lento < DUR, `lento conta para baixo: ${s.lento}`);
  for (let i = 0; i < 30 * 4; i++) stepShip(s, FRENTE);
  assert.equal(s.lento, 0);
  assert.ok(Math.hypot(s.vx, s.vz) > max * 0.9, 'voltou à velocidade normal');
});

test('armas: o Feixe Duplo gasta e recarrega conforme a versão', () => {
  const s = createShip('shrewdo', 0, 0, 0);
  const v = versaoArma(IDX_ARMA.o311001, 1);
  const en = s.en;
  stepShip(s, { ...PARADO, f1: true });
  assert.ok(Math.abs(s.en - (Math.min(s.maxEn, en + s.regenEn * DT) - v.energia)) < 1e-9, `energia ${s.en}`);
  assert.equal(s.cd1, v.cd);
  // Nível 3 da arma (V3): outro dano e outra energia, lidos da nave.
  const t = createShip('shrewdo', 0, 0, 0);
  t.niveis = { [IDX_ARMA.o311001]: 3 };
  const en3 = t.en;
  const d3 = stepShip(t, { ...PARADO, f1: true });
  assert.equal(d3[0].nivel, 3);
  assert.ok(Math.abs(t.en - (Math.min(t.maxEn, en3 + t.regenEn * DT) - versaoArma(IDX_ARMA.o311001, 3).energia)) < 1e-9);
});

test('armas: só dá para usar arma que a nave possui (e da raça e classe dela)', () => {
  const s = createShip('acron', 0, 0, 0);
  assert.deepEqual(s.armas, armasDisponiveis('acron', 'assault'), 'nave sem dono nasce com todas da raça e classe');
  const [z, x] = armasIniciais('acron');
  const circular = IDX_ARMA.o111009; // Feixe Circular (Acron Assault)
  const teleguiada = IDX_ARMA.o111015; // Metralha Teleguiada (Acron, todas as classes)
  s.armas = [circular];
  assert.equal(stepShip(s, { ...PARADO, f1: true, a: teleguiada })[0].kind, ARMAS[z], 'sem comprar, o Z fica na de fábrica');
  for (let i = 0; i < 30; i++) stepShip(s, PARADO);
  assert.equal(stepShip(s, { ...PARADO, f1: true, a: circular }).length, 8, 'o Feixe Circular, que possui, sai em 8');
  assert.equal(s.encaixes[0], circular);
  for (let i = 0; i < 40; i++) stepShip(s, PARADO);
  const d = stepShip(s, { ...PARADO, f2: true, a: circular, a2: teleguiada });
  assert.ok(d.every((t) => t.kind === ARMAS[x]), 'o X cai na metralhadora de fábrica');
  assert.deepEqual(s.encaixes, [circular, x]);
});

test('armas: trocar de arma não zera a recarga do encaixe', () => {
  const s = createShip('acron', 0, 0, 0);
  assert.ok(stepShip(s, { ...PARADO, f1: true }).length > 0);
  assert.deepEqual(stepShip(s, { ...PARADO, f1: true, a: IDX_ARMA.o111009 }), [], 'ainda recarregando');
});

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
