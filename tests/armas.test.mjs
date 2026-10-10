// Duas armas na nave (encaixes Z e X) e as armas novas: míssil teleguiado, mina,
// onda de choque e pulso EMP (shared/sim.js e server/armas.js + server/game.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World, ZONA_SEGURA } from '../server/game.js';
import { MINERADOR } from '../server/mineradores.js';
import {
  ARMAS,
  IDX_ARMA,
  WEAPONS,
  DT,
  createShip,
  createBullet,
  stepShip,
  MISSIL_DANO,
  MINA_DANO,
  MINA_MAX,
  MINA_ARMA_S,
  MINA_VIDA_S,
  CHOQUE_DANO,
  CHOQUE_AREA,
  CHOQUE_EMPURRAO,
  EMP_DURACAO,
} from '../shared/sim.js';
import { BASE } from '../shared/terrain.js';

const SEGUNDO = 30; // ticks
const PARADO = { th: 0, tu: 0, b: false, f1: false, f2: false, p: false };
const { laser, plasma, missil, mina, choque, emp } = IDX_ARMA;

// rng com semente: os testes não dependem da sorte do Math.random.
function rngFixo(semente = 1) {
  let s = semente;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/**
 * Mundo sem monstros nem mineradores, com jogadores fora da zona segura, no
 * corredor ao norte da base 0, em fila para o norte (yaw 0 olha para -z).
 * Cada `pos` é [dx, dz] a partir do ponto de A; os times alternam (A 0, B 1, C 0, D 1).
 */
function arena(...pos) {
  const w = new World({ drones: 0, monstros: 0, elites: 0, rng: rngFixo() });
  w.mineradores.passo = () => {}; // sem mineradores no caminho dos tiros
  const x0 = BASE.x;
  const z0 = BASE.z - ZONA_SEGURA - 120;
  const js = [[0, 0], ...pos].map(([dx, dz], i) => {
    const j = w.addPlayer('P' + i, 'bellico');
    // Nave sem `time` na física: troca de arma livre, como se tivesse equipado na
    // base antes de sair (a recarga de troca tem testes próprios). O time do
    // jogador (j.time, fogo amigo) continua valendo.
    j.ship = createShip('bellico', x0 + dx, z0 + dz, 0);
    j.protegidoAte = 0;
    return j;
  });
  return { w, js };
}

/** Manda um comando por passo para `j` (só ele), `n` passos. */
function apertar(w, j, inp, n = 1) {
  j.seq ??= 0;
  for (let i = 0; i < n; i++) {
    w.pushInput(j.id, { s: ++j.seq, ...inp });
    w.step();
  }
}

test('encaixes: a mesma arma nos dois dispara pelos dois, cada um com a sua recarga', () => {
  const s = createShip('acron', 0, 0, 0);
  const en = s.en;
  const dois = stepShip(s, { ...PARADO, f1: true, f2: true, a: laser, a2: laser });
  assert.deepEqual(dois.map((d) => d.kind), ['laser', 'laser'], 'Z e X saem no mesmo passo');
  assert.ok(Math.abs(s.en - (Math.min(s.maxEn, en + 9 * DT) - 2 * WEAPONS.laser.energia)) < 1e-9, 'a energia é uma só: gastou os dois');
  assert.ok(s.cd1 > 0 && s.cd2 > 0);

  // Recargas independentes: o Z dispara, e o X, solto agora, dispara logo depois.
  const t = createShip('acron', 0, 0, 0);
  stepShip(t, { ...PARADO, f1: true, a: plasma, a2: plasma });
  assert.ok(t.cd1 > 0);
  assert.equal(t.cd2, 0, 'o X não esperou pelo Z');
  assert.deepEqual(stepShip(t, { ...PARADO, f2: true, a: plasma, a2: plasma }).map((d) => d.kind), ['plasma']);
  assert.deepEqual(stepShip(t, { ...PARADO, f1: true, f2: true, a: plasma, a2: plasma }), [], 'os dois recarregando');
});

test('encaixes: com pouca energia, só o que couber sai (Z primeiro)', () => {
  const s = createShip('acron', 0, 0, 0);
  s.en = WEAPONS.laser.energia + 1 - 9 * DT; // depois da regeneração do passo: 3
  const d = stepShip(s, { ...PARADO, f1: true, f2: true, a: laser, a2: laser });
  assert.equal(d.length, 1, 'a energia só deu para um');
  assert.ok(s.cd1 > 0 && s.cd2 === 0, 'foi o Z');
});

test('encaixes: no servidor, a2 escolhe a arma do X e arma não possuída cai no plasma', () => {
  const { w, js } = arena([0, -200]);
  const [a] = js;
  apertar(w, a, { f2: true, a: laser, a2: emp });
  assert.deepEqual(a.ship.encaixes, [laser, emp]);
  assert.deepEqual(w.bullets.map((b) => b.kind), ['emp']);
  a.ship.armas = [laser]; // a Loja vai decidir isto: sem o EMP comprado
  w.bullets.length = 0;
  apertar(w, a, PARADO, 2 * SEGUNDO);
  apertar(w, a, { f2: true, a: laser, a2: emp });
  assert.deepEqual(a.ship.encaixes, [laser, plasma]);
  assert.deepEqual(w.bullets.map((b) => b.kind), ['plasma']);
});

test('míssil: curva para o inimigo dentro do cone e acerta', () => {
  // B 100 m à frente e 25 m de lado (~14°): reto, o míssil passaria longe.
  const { w, js } = arena([-25, -100]);
  const [a, b] = js;
  const hp = b.ship.hp;
  apertar(w, a, { f1: true, a: missil });
  const m = w.bullets.find((x) => x.kind === 'missil');
  assert.ok(m.vx < 0, 'já começou a virar para B (-x)');
  for (let i = 0; i < 2 * SEGUNDO && b.ship.hp === hp; i++) w.step();
  assert.equal(hp - b.ship.hp, MISSIL_DANO, 'acertou');

  // O mesmo tiro sem ninguém no cone segue reto.
  const reto = createBullet(createShip('bellico', 0, 0, 0), 'missil', 1, 1);
  assert.equal(reto.vx, 0);
});

test('míssil: fora do cone (de lado) e aliado não puxam a curva', () => {
  // B inimigo 100 m ao lado (90°), C aliado 100 m à frente e 20 m de lado.
  const { w, js } = arena([-100, 0], [-20, -100]);
  const [a, b, c] = js;
  assert.equal(c.time, a.time);
  const hpB = b.ship.hp;
  const hpC = c.ship.hp;
  apertar(w, a, { f1: true, a: missil });
  const m = w.bullets.find((x) => x.kind === 'missil');
  for (let i = 0; i < 20; i++) {
    w.step();
    assert.ok(Math.abs(m.vx) < 1e-9, `seguiu reto (vx ${m.vx})`);
  }
  for (let i = 0; i < 2 * SEGUNDO; i++) w.step();
  assert.equal(b.ship.hp, hpB);
  assert.equal(c.ship.hp, hpC);
});

test('míssil: o snapshot leva os mísseis em voo para o cliente corrigir a curva', () => {
  const { w, js } = arena([-25, -150]);
  const [a] = js;
  apertar(w, a, { f1: true, a: missil });
  w.step();
  const snap = w.snapshotPara(a, w.entidades(), []);
  assert.equal(snap.guiados.length, 1);
  const g = snap.guiados[0];
  assert.deepEqual(Object.keys(g).sort(), ['id', 'vx', 'vy', 'vz', 'x', 'y', 'z']);
  assert.ok(g.vx < 0, 'já virando para B (à esquerda, -x)');
});

test('mina: fica atrás da nave, arma depois de 1 s e explode só com inimigo perto', () => {
  // C aliado e B inimigo começam longe (40 m ao lado).
  const { w, js } = arena([200, 0], [-200, 0]);
  const [a, b, c] = js;
  apertar(w, a, { f2: true, a2: mina });
  assert.equal(w.minas.length, 1);
  const m = w.minas[0];
  assert.ok(Math.abs(m.z - (a.ship.z + WEAPONS.mina.atras)) < 1, 'atrás da nave (+z)');
  assert.ok(m.y < a.ship.y - 5, 'no chão');
  // Inimigo em cima da mina antes de armar: nada.
  b.ship.x = m.x;
  b.ship.z = m.z;
  const hpB = b.ship.hp;
  w.step();
  assert.equal(w.minas.length, 1, 'ainda não armou');
  assert.equal(b.ship.hp, hpB);
  b.ship.x += 300; // sai antes de armar
  for (let i = 0; i < MINA_ARMA_S * SEGUNDO + 2; i++) w.step();
  assert.equal(w.snapshotPara(a, [], []).minas[0].armada, true);
  // Aliado passa por cima: não explode.
  c.ship.x = m.x;
  c.ship.z = m.z;
  const hpC = c.ship.hp;
  for (let i = 0; i < 10; i++) w.step();
  assert.equal(w.minas.length, 1, 'aliado não dispara a mina');
  assert.equal(c.ship.hp, hpC);
  // Inimigo chega: explode e fere (o aliado em cima continua sem dano).
  b.ship.x = m.x + 8;
  b.ship.z = m.z;
  w.tirarEventos();
  w.step();
  assert.equal(w.minas.length, 0);
  assert.equal(hpB - b.ship.hp, MINA_DANO);
  assert.equal(c.ship.hp, hpC);
  const ev = w.tirarEventos();
  assert.ok(ev.some((e) => e.e === 'explosao' && e.arma === 'mina' && e.time === a.time));
  assert.ok(ev.some((e) => e.e === 'acerto' && e.arma === 'mina' && e.alvo === b.id && e.dano === MINA_DANO));
});

test('mina: no máximo MINA_MAX por piloto (a mais velha some) e vence sozinha', () => {
  const { w, js } = arena([300, 0]);
  const [a] = js;
  const ids = [];
  for (let i = 0; i < MINA_MAX + 1; i++) {
    apertar(w, a, { f2: true, a2: mina, th: 1 });
    ids.push(w.minas.at(-1).id);
    apertar(w, a, { th: 1, a2: mina }, Math.ceil(WEAPONS.mina.cd * SEGUNDO));
  }
  assert.equal(w.minas.length, MINA_MAX);
  assert.deepEqual(
    w.minas.map((m) => m.id),
    ids.slice(1),
    'a primeira sumiu',
  );
  for (let i = 0; i < MINA_VIDA_S * SEGUNDO; i++) w.step();
  assert.equal(w.minas.length, 0, 'venceram');
});

test('onda de choque: fere e empurra para fora só os inimigos no raio', () => {
  // B inimigo 20 m à frente, C aliado 15 m ao lado, D inimigo longe (60 m).
  const { w, js } = arena([0, -20], [15, 0], [0, 60]);
  const [a, b, c, d] = js;
  const hp = js.map((j) => j.ship.hp);
  apertar(w, a, { f1: true, a: choque });
  assert.equal(hp[1] - b.ship.hp, CHOQUE_DANO, 'B levou');
  assert.equal(c.ship.hp, hp[2], 'aliado não');
  assert.equal(d.ship.hp, hp[3], 'fora do raio não');
  assert.ok(Math.abs(Math.hypot(d.ship.x - a.ship.x, d.ship.z - a.ship.z)) > CHOQUE_AREA);
  // B foi jogado para longe de A (para -z), com a força do empurrão.
  assert.ok(b.ship.vz < -CHOQUE_EMPURRAO * 0.9, `vz ${b.ship.vz}`);
  assert.equal(c.ship.vx, 0, 'aliado não foi empurrado');
  assert.equal(d.ship.vz, 0);
  assert.ok(w.tirarEventos().some((e) => e.e === 'choque' && e.id === a.id && e.raio === CHOQUE_AREA));
});

test('EMP: no stepShip, sem tiro e sem boost pelo tempo do efeito', () => {
  const s = createShip('acron', 0, 0, 0);
  s.emp = EMP_DURACAO;
  const tudo = { th: 1, tu: 0, b: true, f1: true, f2: true, p: false, a: laser, a2: plasma };
  for (let i = 0; i < Math.floor(EMP_DURACAO / DT) - 1; i++) {
    assert.deepEqual(stepShip(s, tudo), []);
    assert.equal(s.boost, false);
  }
  stepShip(s, PARADO);
  stepShip(s, PARADO);
  assert.equal(s.emp, 0);
  assert.equal(stepShip(s, tudo).length, 2, 'voltou a atirar');
  assert.equal(s.boost, true);
});

test('EMP: no servidor zera a energia do inimigo, todos veem, e aliado não leva', () => {
  const { w, js } = arena([0, -40], [0, -20]);
  const [a, b, c] = js;
  // C (aliado) no caminho: o pulso atravessa e acerta B.
  apertar(w, a, { f1: true, a: emp });
  for (let i = 0; i < 10 && !(b.ship.emp > 0); i++) w.step();
  assert.equal(b.ship.en, 0);
  assert.ok(b.ship.emp > EMP_DURACAO - 0.5);
  assert.equal(c.ship.emp, 0, 'aliado não');
  assert.equal(w.entidades().find((e) => e.id === b.id).emp, true);
  // B tenta atirar e dar boost: nada.
  w.bullets.length = 0;
  apertar(w, b, { th: 1, b: true, f1: true, f2: true, a: laser, a2: plasma }, 10);
  assert.equal(w.bullets.length, 0);
  assert.equal(b.ship.boost, false);
  apertar(w, b, PARADO, EMP_DURACAO * SEGUNDO);
  apertar(w, b, { f1: true, a: laser });
  assert.equal(w.bullets.filter((x) => x.owner === b.id).length, 1, 'acabou o EMP: atira de novo');
});

test('EMP: minerador fica parado e monstro fica sem garra', () => {
  const w = new World({ drones: 0, monstros: 1, elites: 0, rng: rngFixo() });
  const a = w.addPlayer('A', 'acron');
  w.step();
  for (let i = 0; i < 3 * SEGUNDO; i++) w.step();
  const m = w.mineradores.lista.find((x) => x.time === 0);
  const antes = { x: m.ship.x, z: m.ship.z };
  m.ship.emp = EMP_DURACAO;
  m.ship.vx = m.ship.vz = 0;
  for (let i = 0; i < 2 * SEGUNDO; i++) w.step();
  assert.ok(Math.hypot(m.ship.x - antes.x, m.ship.z - antes.z) < 1, 'parado');
  for (let i = 0; i < 2 * SEGUNDO; i++) w.step();
  assert.ok(Math.hypot(m.ship.x - antes.x, m.ship.z - antes.z) > 10, 'depois do EMP volta a andar');
  assert.equal(m.ship.hp, MINERADOR.hp);

  // Vorax colado no jogador, mas sob EMP: não golpeia.
  const v = w.monstros[0];
  a.ship = createShip('acron', BASE.x, BASE.z - ZONA_SEGURA - 150, 0);
  a.protegidoAte = 0;
  v.ship = createShip('mechan', a.ship.x + 10, a.ship.z, 0);
  v.ship.emp = 1;
  const hp = a.ship.hp;
  for (let i = 0; i < 20; i++) w.step();
  assert.equal(a.ship.hp, hp, 'sem garra');
  for (let i = 0; i < SEGUNDO * 2; i++) w.step();
  assert.ok(a.ship.hp < hp, 'acabou o EMP: golpeia');
});

test('nenhuma arma fere aliado', () => {
  for (const kind of ARMAS) {
    // C aliado colado em A (na frente e em volta) e B inimigo longe.
    const { w, js } = arena([400, 0], [0, -12]);
    const [a, , c] = js;
    const hp = c.ship.hp;
    const i = ARMAS.indexOf(kind);
    apertar(w, a, { f1: true, a: i });
    apertar(w, a, PARADO, 3 * SEGUNDO);
    c.ship.x = a.ship.x; // passa por cima de uma mina, se houver
    c.ship.z = a.ship.z + WEAPONS.mina.atras;
    apertar(w, a, PARADO, 2 * SEGUNDO);
    assert.equal(c.ship.hp, hp, kind);
    assert.equal(c.ship.emp, 0, kind);
  }
});
