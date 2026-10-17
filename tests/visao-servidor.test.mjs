// Visão do time no servidor (server/visao.js): o snapshot de cada jogador só leva o
// que algum aliado enxerga (naves 550 m, mineradores e escoltas 300 m, torres
// sentinela 560 m, a base), com rocha, mineradora e asteroides da shared/visao.js.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../server/game.js';
import { createShip } from '../shared/sim.js';
import { VISAO_RAIO, VISAO_TORRETA, VISAO_MINERADOR, enxerga, olho, algumOlhoVe } from '../shared/visao.js';
import { ASTEROIDES, TORRETAS, BASES } from '../shared/terrain.js';

function rngFixo(semente = 1) {
  let s = semente;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/**
 * Mundo sem monstros, com `n` jogadores (times alternados 0, 1, 0...), sem
 * mineradores, escoltas nem torretas de pé (para só as naves e a base verem, salvo
 * onde o teste liga).
 */
function mundo(n = 2, opcoes = {}) {
  const w = new World({ drones: 0, monstros: 0, elites: 0, rng: rngFixo(), torretas: false, ...opcoes });
  w.mineradores.passo = () => {};
  w.escoltas.passo = () => {};
  const js = [];
  for (let i = 0; i < n; i++) js.push(w.addPlayer('P' + i, 'bellico'));
  w.step();
  for (const t of w.torretas.lista) t.viva = false;
  return { w, js };
}

/** Põe a nave do jogador em (x, z), parada e sem proteção. */
function colocar(j, x, z) {
  j.ship = createShip(j.ship.race, x, z, 0);
  j.ship.time = j.time;
  j.protegidoAte = 0;
}

/** Passa um tick (a visão é contada por tick) e devolve os ids das entidades no snapshot de `j`. */
function vistos(w, j, ev = []) {
  w.step();
  return new Set(w.snapshotPara(j, w.entidades(), ev).ents.map((e) => e.id));
}

test('visão: helper dos olhos dá a mesma resposta de enxerga', () => {
  const rng = rngFixo(7);
  for (let i = 0; i < 4000; i++) {
    const ox = rng() * 2600 - 1300;
    const oz = rng() * 2000 - 1000;
    const ax = ox + (rng() * 2 - 1) * 700;
    const az = oz + (rng() * 2 - 1) * 700;
    const r = [VISAO_RAIO, VISAO_TORRETA, VISAO_MINERADOR][i % 3];
    assert.equal(algumOlhoVe([olho(ox, oz, r)], ax, az), enxerga(ox, oz, ax, az, r), `(${ox}, ${oz}) → (${ax}, ${az})`);
  }
});

test('visão: aliado sempre vem, de qualquer lugar do mapa', () => {
  const { w, js } = mundo(3);
  const [a, , c] = js;
  assert.equal(a.time, c.time);
  colocar(a, -1280, 0);
  colocar(c, 900, -700); // longe, do outro lado da mineradora
  assert.ok(vistos(w, a).has(c.id));
  assert.ok(vistos(w, c).has(a.id));
  assert.ok(vistos(w, a).has(a.id), 'a própria nave também');
});

test('visão: inimigo a 500 m vem, a 600 m não', () => {
  const { w, js } = mundo(2);
  const [a, b] = js;
  colocar(a, -900, 0);
  colocar(b, -400, 0);
  assert.ok(vistos(w, a).has(b.id), '500 m: dentro do raio');
  colocar(b, -300, 0);
  assert.ok(!vistos(w, a).has(b.id), '600 m: fora do raio');
  assert.ok(!vistos(w, b).has(a.id), 'e ele também não te vê');
});

test('visão: inimigo atrás da mineradora não vem', () => {
  const { w, js } = mundo(2);
  const [a, b] = js;
  colocar(a, -200, 0);
  colocar(b, 200, 0);
  assert.ok(!vistos(w, a).has(b.id), 'a 400 m, mas a mineradora tampa');
  assert.ok(!vistos(w, b).has(a.id));
  colocar(a, 0, -250); // contornou por cima
  assert.ok(enxerga(0, -250, 200, 0));
  assert.ok(vistos(w, a).has(b.id), 'contornando a mineradora, vê');
});

test('visão: inimigo dentro do campo de asteroides só é visto de dentro ou de perto', () => {
  const campo = ASTEROIDES.find((x) => x.id === 'AC0N');
  const { w, js } = mundo(2);
  const [a, b] = js;
  colocar(b, campo.x, campo.z);
  colocar(a, campo.x, campo.z + 300); // fora do campo, a 300 m
  assert.ok(!vistos(w, a).has(b.id), 'de fora, escondido');
  assert.ok(vistos(w, b).has(a.id), 'quem está dentro vê quem está fora');
  colocar(a, campo.x, campo.z + 60); // dentro do mesmo campo
  assert.ok(vistos(w, a).has(b.id), 'de dentro do mesmo campo, vê');
  const borda = campo.z + campo.profundidade / 2;
  colocar(b, campo.x, borda - 5);
  colocar(a, campo.x, borda + 40); // fora, a 45 m dele
  assert.ok(vistos(w, a).has(b.id), 'encostado (até 60 m), vê');
});

test('visão: torre sentinela de pé dá visão ao time; caída, não', () => {
  const t = TORRETAS.find((x) => x.time === 0);
  const { w, js } = mundo(2);
  const [a, b] = js;
  colocar(a, BASES[0].x, BASES[0].z);
  colocar(b, t.x, t.z + 220 * Math.sign(t.z || 1));
  assert.ok(Math.hypot(b.ship.x - a.ship.x, b.ship.z - a.ship.z) > VISAO_RAIO);
  assert.ok(!vistos(w, a).has(b.id), 'sem a torre, longe demais');
  const viva = w.torretas.lista.find((x) => x.id === t.id);
  w.step();
  viva.viva = true;
  assert.ok(new Set(w.snapshotPara(a, w.entidades(), []).ents.map((e) => e.id)).has(b.id), 'a torre vê');
});

test('visão: minerador do time enxerga em volta (raio menor)', () => {
  const { w, js } = mundo(2);
  const [a, b] = js;
  colocar(a, -1280, 0);
  colocar(b, -500, -300);
  assert.ok(!vistos(w, a).has(b.id));
  w.step();
  w.mineradores.lista.push({ id: 9001, tipo: 'minerador', time: 0, vivo: true, nome: 'Minerador', ship: createShip('bellico', -500, -50, 0) });
  const ids = new Set(w.snapshotPara(a, w.entidades(), []).ents.map((e) => e.id));
  assert.ok(ids.has(b.id), 'o minerador a 250 m vê');
  assert.ok(ids.has(9001), 'e ele mesmo, do time, vem');
});

test('visão: monstro fora da visão não vem; perto, vem', () => {
  const { w, js } = mundo(2, { drones: 1 });
  const [a] = js;
  const d = w.drones[0];
  colocar(a, -900, 0);
  d.ship = createShip('mechan', 800, 600, 0);
  assert.ok(!vistos(w, a).has(d.id));
  d.ship = createShip('mechan', -900, -300, 0);
  assert.ok(vistos(w, a).has(d.id));
});

test('visão: unidade que some e volta aparece no lugar novo', () => {
  const { w, js } = mundo(2);
  const [a, b] = js;
  colocar(a, -900, 0);
  colocar(b, -500, 0);
  assert.ok(vistos(w, a).has(b.id));
  colocar(b, 300, 0);
  assert.ok(!vistos(w, a).has(b.id), 'sumiu');
  colocar(b, -450, 100);
  w.step();
  const e = w.snapshotPara(a, w.entidades(), []).ents.find((x) => x.id === b.id);
  assert.ok(e, 'voltou');
  assert.equal(Math.round(e.x), -450);
  assert.equal(Math.round(e.z), 100);
});

test('visão: tiro longe não chega; o autor recebe o próprio; o que entra na visão chega com o fim', () => {
  const { w, js } = mundo(2);
  const [a, b] = js;
  colocar(a, -900, 0);
  colocar(b, 600, -700);
  w.step();
  const longe = { e: 'tiro', id: 8001, dono: b.id, kind: 'laser', x: 600, y: 10, z: -700, vx: 0, vy: 0, vz: -300, vida: 1 };
  const entrando = { e: 'tiro', id: 8002, dono: b.id, kind: 'laser', x: 0, y: 10, z: -400, vx: -400, vy: 0, vz: 300, vida: 2 };
  const ev = [longe, entrando];
  const deA = w.snapshotPara(a, [], ev).ev.map((e) => e.id);
  assert.deepEqual(deA, [8002], 'só o tiro que entra na visão de A');
  assert.deepEqual(w.snapshotPara(b, [], ev).ev.map((e) => e.id), [8001, 8002], 'o autor recebe os dele');
  // O fim do tiro anunciado chega a A mesmo longe; o do outro, não.
  w.step();
  const fins = [
    { e: 'fim', bala: 8001, x: 600, y: 10, z: -1000 },
    { e: 'fim', bala: 8002, x: 2000, y: 10, z: 2000 },
  ];
  assert.deepEqual(w.snapshotPara(a, [], fins).ev.map((e) => e.bala), [8002]);
});

test('visão: acerto e morte fora da visão; o alvo sempre recebe o dele', () => {
  const { w, js } = mundo(4);
  const [a, b, c, d] = js; // a e c no time 0, b e d no time 1
  colocar(a, -900, 0);
  colocar(c, -1280, 0);
  colocar(b, 600, -700);
  colocar(d, 650, -700);
  w.step();
  const acerto = { e: 'acerto', kind: 'laser', alvo: d.id, dano: 5, x: 650, y: 10, z: -700 };
  const emA = { e: 'acerto', kind: 'laser', alvo: a.id, dano: 5, x: -900, y: 10, z: 0 };
  const morte = { e: 'morte', id: d.id, por: b.id, tipo: 'jogador', time: 1, x: 650, y: 10, z: -700 };
  const ev = [acerto, emA, morte];
  const deA = w.snapshotPara(a, [], ev).ev;
  assert.ok(!deA.includes(acerto), 'acerto longe não chega');
  assert.ok(deA.includes(emA), 'o alvo recebe o golpe nele');
  const m = deA.find((e) => e.e === 'morte');
  assert.ok(m, 'o abate de jogador chega (placar público)');
  assert.equal(m.x, undefined, 'mas sem o lugar');
  assert.ok(w.snapshotPara(d, [], ev).ev.includes(acerto), 'o alvo inimigo recebe o dele');
  // Morte de monstro longe: não chega.
  const monstro = { e: 'morte', id: 7777, por: b.id, tipo: 'arnosh', x: 650, y: 10, z: -700 };
  assert.ok(!w.snapshotPara(a, [], [monstro]).ev.length);
  // Evento público (sem lugar) vai para todos.
  assert.equal(w.snapshotPara(a, [], [{ e: 'nivel', id: b.id, nivel: 3 }]).ev.length, 1);
});

test('visão: minas inimigas só pela posição; as do time sempre', () => {
  const { w, js } = mundo(2);
  const [a, b] = js;
  colocar(a, -900, 0);
  colocar(b, 600, -700);
  w.step();
  w.minas.push({ id: 6001, dono: b.id, time: 1, kind: 'laser', nivel: 1, x: 600, y: 0, z: -700, armaTick: 0 });
  w.minas.push({ id: 6002, dono: b.id, time: 1, kind: 'laser', nivel: 1, x: -800, y: 0, z: 0, armaTick: 0 });
  w.minas.push({ id: 6003, dono: a.id, time: 0, kind: 'laser', nivel: 1, x: 900, y: 0, z: 700, armaTick: 0 });
  w.step();
  assert.deepEqual(w.snapshotPara(a, [], []).minas.map((m) => m.id).sort(), [6002, 6003]);
});

test('visão: o modo de teste também usa a névoa', () => {
  const w = new World({ teste: true, drones: 1, monstros: 0, elites: 0, rng: rngFixo() });
  const j = w.addPlayer('Teste', 'acron');
  w.step();
  const d = w.drones[0];
  d.ship = createShip('mechan', 900, 700, 0);
  w.step();
  assert.ok(!w.snapshotPara(j, w.entidades(), []).ents.some((e) => e.id === d.id));
});

test('visão: custo do filtro com 6 jogadores e os monstros do mapa', () => {
  const w = new World({ rng: rngFixo(3) });
  const js = [];
  for (let i = 0; i < 6; i++) js.push(w.addPlayer('P' + i, 'shrewdo'));
  for (let i = 0; i < 30; i++) w.step();
  const ticks = 300;
  let ms = 0;
  for (let i = 0; i < ticks; i++) {
    w.step();
    const ents = w.entidades();
    const ev = w.tirarEventos();
    const t0 = performance.now();
    for (const j of js) w.snapshotPara(j, ents, ev);
    ms += performance.now() - t0;
  }
  const porSnap = ms / ticks;
  // Snapshot inteiro (me, status, filtro) dos 6 jogadores: folga grande, só para pegar regressão feia.
  assert.ok(porSnap < 5, `${porSnap.toFixed(3)} ms por rodada de snapshots`);
});
