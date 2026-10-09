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
  ARMAS_PRINCIPAIS,
  LASER_DUPLO_VAO,
  LASER_DUPLO_DANO,
  LASER_DUPLO_CD,
  LASER_DUPLO_ENERGIA,
  LASER_TRIPLO_ANGULO,
  CRIO_LENTIDAO,
  CRIO_DURACAO,
} from '../shared/sim.js';
import { podePousar, AREAS_POUSO } from '../shared/terrain.js';

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
  assert.deepEqual(sanitizeInput({ th: 50, tu: -9, b: 1, f1: 'x', f2: 0, p: 1, a: 1 }), { th: 1, tu: -1, b: true, f1: true, f2: false, p: true, a: 1 });
  assert.deepEqual(sanitizeInput(null), { th: 0, tu: 0, b: false, f1: false, f2: false, p: false, a: 0 });
});

test('comando da rede: arma fora da lista vira laser simples', () => {
  for (const a of [5, 99, -1, 1.5, '1', '__proto__', 'length', null, undefined, {}, NaN, Infinity]) {
    assert.equal(sanitizeInput({ a }).a, 0, String(a));
  }
  for (let a = 0; a < 5; a++) assert.equal(sanitizeInput({ a }).a, a);
  assert.deepEqual(ARMAS_PRINCIPAIS, ['laser', 'laserDuplo', 'laserTriplo', 'dreno', 'crio']);
  // Mesmo sem passar pelo sanitize (IA dos drones), stepShip não aceita índice ruim.
  const s = createShip('acron', 0, 0, 0);
  assert.deepEqual(stepShip(s, { ...PARADO, f1: true, a: 7 }), [{ kind: 'laser', off: 0, ang: 0 }]);
  assert.equal(s.arma, 0);
});

test('armas: laser simples sai 1 projétil pelo nariz, o duplo sai 2 paralelos', () => {
  for (const yaw of [0, 0.7, -2.1]) {
    const s = createShip('shrewdo', 0, 0, yaw);
    const simples = stepShip(s, { ...PARADO, f1: true, a: 0 });
    assert.deepEqual(simples, [{ kind: 'laser', off: 0, ang: 0 }]);
    assert.equal(s.arma, 0);

    const d = createShip('shrewdo', 0, 0, yaw);
    const duplo = stepShip(d, { ...PARADO, f1: true, a: 1 });
    assert.equal(d.arma, 1);
    assert.equal(duplo.length, 2);
    const [e, r] = duplo.map((t, i) => createBullet(d, t.kind, i, 1, t.off));
    assert.equal(e.kind, 'laserDuplo');
    assert.equal(r.kind, 'laserDuplo');
    // Paralelos: mesma velocidade, separados só de lado (perpendicular ao rumo).
    assert.equal(e.vx, r.vx);
    assert.equal(e.vz, r.vz);
    const f = forward(d.yaw);
    const dx = r.x - e.x;
    const dz = r.z - e.z;
    assert.ok(Math.abs(Math.hypot(dx, dz) - 2 * LASER_DUPLO_VAO) < 1e-9, 'vão entre os canos');
    assert.ok(Math.abs(dx * f.x + dz * f.z) < 1e-9, 'lado a lado, nenhum na frente');
    // O do off positivo sai à direita da nave (direita = (-f.z, f.x)).
    assert.ok(dx * -f.z + dz * f.x > 0);
    // O meio dos dois é o ponto de saída do tiro simples.
    const c = createBullet(d, 'laser', 9, 1);
    assert.ok(Math.abs((e.x + r.x) / 2 - c.x) < 1e-9 && Math.abs((e.z + r.z) / 2 - c.z) < 1e-9);
  }
});

test('armas: laser triplo sai 3 projéteis em leque, com os ângulos certos', () => {
  for (const yaw of [0, 1.2, -2.6]) {
    const s = createShip('shrewdo', 0, 0, yaw);
    const disparos = stepShip(s, { ...PARADO, f1: true, a: 2 });
    assert.equal(disparos.length, 3);
    const tiros = disparos.map((t, i) => createBullet(s, t.kind, i, 1, t.off, t.ang));
    const rumo = (b) => Math.atan2(-(b.vx - s.vx * 0.5), -(b.vz - s.vz * 0.5));
    const difs = tiros.map((b) => {
      let d = rumo(b) - s.yaw;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      return d;
    });
    const esperado = [LASER_TRIPLO_ANGULO, 0, -LASER_TRIPLO_ANGULO];
    difs.forEach((d, i) => assert.ok(Math.abs(d - esperado[i]) < 1e-9, `yaw ${yaw}: ${d} vs ${esperado[i]}`));
    for (const b of tiros) {
      assert.equal(b.kind, 'laserTriplo');
      assert.ok(Math.abs(Math.hypot(b.vx - s.vx * 0.5, b.vz - s.vz * 0.5) - WEAPONS.laserTriplo.vel) < 1e-9, 'mesma velocidade');
      assert.equal(b.x, tiros[1].x, 'saem todos do nariz');
      assert.equal(b.z, tiros[1].z);
    }
  }
});

test('armas: dreno e criogênico saem 1 projétil com o efeito no tipo', () => {
  const s = createShip('acron', 0, 0, 0);
  assert.deepEqual(stepShip(s, { ...PARADO, f1: true, a: 3 }), [{ kind: 'dreno', off: 0, ang: 0 }]);
  const c = createShip('acron', 0, 0, 0);
  assert.deepEqual(stepShip(c, { ...PARADO, f1: true, a: 4 }), [{ kind: 'crio', off: 0, ang: 0 }]);
  assert.equal(WEAPONS.dreno.efeito.tipo, 'dreno');
  assert.equal(WEAPONS.crio.efeito.tipo, 'lento');
});

test('criogênico: nave lenta voa a uma fração da velocidade máxima e depois volta', () => {
  const max = RACES.shrewdo.velocidade * VEL_FATOR;
  const s = createShip('shrewdo', BASE.x, BASE.z, 0);
  s.lento = CRIO_DURACAO;
  let maior = 0;
  for (let i = 0; i < Math.floor(CRIO_DURACAO / DT) - 1; i++) {
    stepShip(s, FRENTE);
    maior = Math.max(maior, Math.hypot(s.vx, s.vz));
  }
  assert.ok(maior <= max * CRIO_LENTIDAO + 1e-6, `lenta: ${maior} > ${max * CRIO_LENTIDAO}`);
  assert.ok(maior > max * CRIO_LENTIDAO * 0.9, 'chegou perto do limite lento');
  assert.ok(s.lento > 0 && s.lento < CRIO_DURACAO, `lento conta para baixo: ${s.lento}`);
  for (let i = 0; i < 30 * 4; i++) stepShip(s, FRENTE);
  assert.equal(s.lento, 0);
  assert.ok(Math.hypot(s.vx, s.vz) > max * 0.9, 'voltou à velocidade normal');
});

test('armas: o laser duplo gasta e recarrega conforme as constantes', () => {
  const s = createShip('acron', 0, 0, 0);
  const en = s.en;
  stepShip(s, { ...PARADO, f1: true, a: 1 });
  const regen = 9 * DT;
  assert.ok(Math.abs(s.en - Math.min(s.maxEn, en + regen) + LASER_DUPLO_ENERGIA) < 1e-9, `energia ${s.en}`);
  assert.equal(WEAPONS.laserDuplo.dano, LASER_DUPLO_DANO);
  assert.equal(WEAPONS.laserDuplo.energia, LASER_DUPLO_ENERGIA);
  assert.equal(WEAPONS.laserDuplo.cd, LASER_DUPLO_CD);
  let disparos = 1;
  for (let i = 0; i < 29; i++) disparos += stepShip(s, { ...PARADO, f1: true, a: 1 }).length > 0;
  const esperado = Math.floor(1 / LASER_DUPLO_CD) + 1;
  assert.ok(disparos >= esperado - 1 && disparos <= esperado, `${disparos} disparos em 1 s`);
});

test('armas: nenhuma é estritamente melhor que as outras', () => {
  const n = (w) => (w.canos?.length ?? 1) * (w.leque?.length ?? 1);
  // Dano por segundo num alvo só, com todos os projéteis acertando e o dreno inteiro.
  const dps = (w) => (w.dano * n(w)) / w.cd + (w.efeito?.tipo === 'dreno' ? w.efeito.dps : 0);
  const gasto = (w) => w.energia / w.cd;
  const simples = WEAPONS.laser;
  for (const kind of ARMAS_PRINCIPAIS.slice(1)) {
    const w = WEAPONS[kind];
    assert.ok(dps(w) < dps(simples), `${kind}: tira menos por segundo que o simples`);
    assert.ok(w.dano < simples.dano, `${kind}: cada projétil tira menos`);
    assert.ok(n(w) > 1 || w.efeito, `${kind}: em troca, mais projéteis ou um efeito`);
  }
  // As de vários projéteis gastam mais energia por segundo que o simples.
  assert.ok(gasto(WEAPONS.laserDuplo) > gasto(simples));
  assert.ok(gasto(WEAPONS.laserTriplo) > gasto(simples));
});

test('armas: só dá para usar arma que a nave possui (hoje todas)', () => {
  const s = createShip('acron', 0, 0, 0);
  assert.deepEqual(s.armas, [0, 1, 2, 3, 4], 'nasce com todas liberadas');
  s.armas = [0, 2];
  assert.equal(stepShip(s, { ...PARADO, f1: true, a: 3 })[0].kind, 'laser', 'sem o dreno, sai laser simples');
  assert.equal(s.arma, 0);
  for (let i = 0; i < 10; i++) stepShip(s, PARADO);
  assert.equal(stepShip(s, { ...PARADO, f1: true, a: 2 }).length, 3, 'o triplo, que possui, funciona');
  assert.equal(s.arma, 2);
});

test('armas: trocar de arma não zera a recarga do tiro', () => {
  const s = createShip('acron', 0, 0, 0);
  assert.equal(stepShip(s, { ...PARADO, f1: true, a: 0 }).length, 1);
  assert.deepEqual(stepShip(s, { ...PARADO, f1: true, a: 1 }), [], 'ainda recarregando');
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
  assert.ok(Math.abs(s.y - (heightAt(s.x, s.z) + ALTURA_POUSADO)) < 0.01, 'encostou no chão');
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
