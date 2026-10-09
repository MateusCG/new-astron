import { test } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { iniciar } from '../server/index.js';
import { World, ZONA_SEGURA } from '../server/game.js';
import { createShip, createBullet, WEAPONS } from '../shared/sim.js';
import { BASE } from '../shared/terrain.js';

function conectar(porta) {
  const ws = new WebSocket(`ws://localhost:${porta}/ws`);
  const msgs = [];
  const esperando = [];
  ws.on('message', (d) => {
    const m = JSON.parse(d);
    msgs.push(m);
    for (const e of [...esperando]) {
      if (e.filtro(m)) {
        esperando.splice(esperando.indexOf(e), 1);
        e.ok(m);
      }
    }
  });
  const esperar = (filtro, ms = 3000) =>
    new Promise((ok, falha) => {
      const achou = msgs.find(filtro);
      if (achou) return ok(achou);
      esperando.push({ filtro, ok });
      setTimeout(() => falha(new Error('tempo esgotado')), ms);
    });
  return { ws, msgs, esperar, aberto: new Promise((ok) => ws.on('open', ok)) };
}

test('servidor: entra, anda com comandos e recebe ack', async () => {
  const srv = await iniciar({ porta: 0, world: new World({ drones: 0 }) });
  try {
    const c = conectar(srv.porta);
    await c.aberto;
    c.ws.send(JSON.stringify({ t: 'entrar', nome: '<b>Mateus</b>', race: 'bellico' }));
    const boas = await c.esperar((m) => m.t === 'bemvindo');
    const j = srv.world.players.get(boas.id);
    assert.equal(j.nome, 'bMateusb', 'nome sem HTML');
    assert.equal(j.ship.race, 'bellico');
    const z0 = j.ship.z;
    for (let s = 1; s <= 30; s++) c.ws.send(JSON.stringify({ t: 'in', s, th: 1, tu: 0 }));
    const snap = await c.esperar((m) => m.t === 'snap' && m.ack === 30);
    assert.ok(snap.me.z < z0 - 5, 'andou para frente (−z)');
    assert.ok(snap.ents.some((e) => e.id === boas.id));
    c.ws.close();
  } finally {
    await srv.fechar();
  }
});

test('servidor: no máximo 4 comandos por tick (sem acelerar o tempo)', () => {
  const w = new World({ drones: 0 });
  const j = w.addPlayer('a', 'shrewdo');
  for (let s = 1; s <= 20; s++) w.pushInput(j.id, { s, th: 1 });
  w.step();
  assert.equal(j.ack, 4);
  w.pushInput(j.id, { s: 2, th: 1 }); // repetido/antigo: ignorado
  w.step();
  assert.equal(j.ack, 8);
});

test('servidor: tiro tira vida, abate dá ouro e o morto renasce na base', () => {
  const w = new World({ drones: 0 });
  const a = w.addPlayer('A', 'acron');
  const b = w.addPlayer('B', 'shrewdo');
  // Leva os dois para longe da zona segura, um na frente do outro.
  a.ship = createShip('acron', BASE.x, BASE.z - ZONA_SEGURA - 100, 0);
  b.ship = createShip('shrewdo', BASE.x, BASE.z - ZONA_SEGURA - 130, 0);
  a.protegidoAte = b.protegidoAte = 0;
  let seq = 0;
  for (let i = 0; i < 30 * 20 && b.vivo; i++) {
    w.pushInput(a.id, { s: ++seq, f1: true });
    w.step();
  }
  assert.equal(b.vivo, false);
  assert.equal(a.abates, 1);
  assert.ok(a.ouro > 0);
  for (let i = 0; i < 30 * 4; i++) w.step();
  assert.equal(b.vivo, true);
  assert.ok(Math.hypot(b.ship.x - BASE.x, b.ship.z - BASE.z) < 80, 'renasceu na base');
});

test('servidor: ninguém leva dano na zona segura da base', () => {
  const w = new World({ drones: 0 });
  const a = w.addPlayer('A', 'acron');
  a.protegidoAte = 0;
  const hp = a.ship.hp;
  const atirador = createShip('mechan', a.ship.x, a.ship.z + 20, 0);
  w.bullets.push({ ...createBullet(atirador, 'plasma', 999, -1), drone: true });
  for (let i = 0; i < 10; i++) w.step();
  assert.equal(a.ship.hp, hp);
});

test('servidor: nave pousada conserta mais rápido que voando', () => {
  const regenEm = (pousar) => {
    const w = new World({ drones: 0 });
    const j = w.addPlayer('A', 'bellico');
    j.ship.hp = 100;
    let seq = 0;
    if (pousar) w.pushInput(j.id, { s: ++seq, p: true });
    for (let i = 0; i < 30 * 8; i++) {
      w.pushInput(j.id, { s: ++seq });
      w.step();
    }
    return j.ship.hp - 100;
  };
  const voando = regenEm(false);
  const pousada = regenEm(true);
  assert.ok(pousada > voando * 2, `pousada ${pousada} vs voando ${voando}`);
});

test('servidor: não serve arquivo fora das pastas públicas', async () => {
  const srv = await iniciar({ porta: 0, world: new World({ drones: 0 }) });
  try {
    for (const rota of ['/%2e%2e/package.json', '/shared/%2e%2e/package.json', '/vendor/%2e%2e/%2e%2e/%2e%2e/package.json']) {
      const r = await fetch(`http://localhost:${srv.porta}${rota}`);
      assert.equal(r.status, 404, rota);
    }
    const r = await fetch(`http://localhost:${srv.porta}/`);
    assert.equal(r.status, 200);
    assert.match(await r.text(), /NEW <span>ASTRO<\/span>-N/);
  } finally {
    await srv.fechar();
  }
});

test('servidor: aplica a arma escolhida no comando (e limpa valor inválido)', () => {
  const w = new World({ drones: 0 });
  const j = w.addPlayer('A', 'acron');
  w.pushInput(j.id, { s: 1, f1: true, a: 1 });
  w.step();
  assert.equal(j.ship.arma, 1);
  assert.deepEqual(w.bullets.map((b) => b.kind), ['laserDuplo', 'laserDuplo']);
  const tiros = w.tirarEventos().filter((e) => e.e === 'tiro');
  assert.equal(tiros.length, 2, 'os dois tiros vão para os outros clientes');

  const k = w.addPlayer('B', 'acron');
  w.bullets.length = 0;
  w.pushInput(k.id, { s: 1, f1: true, a: 99 });
  w.step();
  assert.equal(k.ship.arma, 0);
  assert.deepEqual(w.bullets.map((b) => b.kind), ['laser']);
});

test('servidor: cada projétil do laser duplo tira o dano dele', () => {
  const w = new World({ drones: 0 });
  const a = w.addPlayer('A', 'acron');
  const b = w.addPlayer('B', 'bellico');
  a.ship = createShip('acron', BASE.x, BASE.z - ZONA_SEGURA - 100, 0);
  b.ship = createShip('bellico', BASE.x, BASE.z - ZONA_SEGURA - 130, 0);
  a.protegidoAte = b.protegidoAte = 0;
  const hp = b.ship.hp;
  w.pushInput(a.id, { s: 1, f1: true, a: 1 });
  for (let i = 0; i < 10; i++) w.step();
  assert.equal(hp - b.ship.hp, 2 * WEAPONS.laserDuplo.dano, 'os dois acertaram');
});
