import { test } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { iniciar } from '../server/index.js';
import { World, ZONA_SEGURA } from '../server/game.js';
import { createShip, createBullet, WEAPONS, DRENO_DPS, DRENO_DURACAO, CRIO_DURACAO, DT, SHIP_RADIUS } from '../shared/sim.js';
import { BASE, BASES, CORREDOR, heightAt, noMapaAberto } from '../shared/terrain.js';
import { alturaSolida, pontoLivre } from '../shared/obstaculos.js';

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
  const srv = await iniciar({ porta: 0, world: new World({ drones: 0, monstros: 0 }) });
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

// O ESC do cliente sai da partida só fechando o WebSocket: o servidor tem que tirar
// a nave do mundo, avisar quem ficou e aceitar a mesma pessoa de volta com outra raça.
test('servidor: fechar a conexão (ESC) tira a nave e dá para entrar de novo com outra raça', async () => {
  const srv = await iniciar({ porta: 0, world: new World({ drones: 0 }) });
  const jogadores = async () => (await (await fetch(`http://localhost:${srv.porta}/healthz`)).json()).jogadores;
  try {
    const outro = conectar(srv.porta);
    await outro.aberto;
    outro.ws.send(JSON.stringify({ t: 'entrar', nome: 'Fica', race: 'mechan' }));
    await outro.esperar((m) => m.t === 'bemvindo');

    for (const race of ['bellico', 'acron', 'shrewdo']) {
      const c = conectar(srv.porta);
      await c.aberto;
      c.ws.send(JSON.stringify({ t: 'entrar', nome: 'Volta', race }));
      const boas = await c.esperar((m) => m.t === 'bemvindo');
      assert.equal(srv.world.players.get(boas.id).ship.race, race);
      assert.equal(await jogadores(), 2);
      c.ws.close();
      await outro.esperar((m) => m.t === 'snap' && m.ev.some((e) => e.e === 'saiu' && e.id === boas.id));
      assert.equal(srv.world.players.has(boas.id), false, 'a nave saiu do mundo');
      assert.equal(await jogadores(), 1);
    }
    outro.ws.close();
  } finally {
    await srv.fechar();
  }
});

test('servidor: no máximo 4 comandos por tick (sem acelerar o tempo)', () => {
  const w = new World({ drones: 0, monstros: 0 });
  const j = w.addPlayer('a', 'shrewdo');
  for (let s = 1; s <= 20; s++) w.pushInput(j.id, { s, th: 1 });
  w.step();
  assert.equal(j.ack, 4);
  w.pushInput(j.id, { s: 2, th: 1 }); // repetido/antigo: ignorado
  w.step();
  assert.equal(j.ack, 8);
});

test('servidor: tiro tira vida, abate dá ouro e o morto renasce na base', () => {
  const w = new World({ drones: 0, monstros: 0 });
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
  const w = new World({ drones: 0, monstros: 0 });
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
    const w = new World({ drones: 0, monstros: 0 });
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
  const srv = await iniciar({ porta: 0, world: new World({ drones: 0, monstros: 0 }) });
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

/** Mundo com dois jogadores fora da zona segura: A atira em B, 20 m à frente. */
function duelo() {
  const w = new World({ drones: 0 });
  const a = w.addPlayer('A', 'acron');
  const b = w.addPlayer('B', 'bellico');
  a.ship = createShip('acron', BASE.x, BASE.z - ZONA_SEGURA - 100, 0);
  b.ship = createShip('bellico', BASE.x, BASE.z - ZONA_SEGURA - 120, 0);
  a.protegidoAte = b.protegidoAte = 0;
  /** Põe um projétil da arma `kind` saindo de A, como se A tivesse atirado. */
  const tiro = (kind) => w.bullets.push(createBullet(a.ship, kind, 1000 + w.tick, a.id));
  return { w, a, b, tiro };
}

test('servidor: dreno tira vida aos poucos e para no fim da duração', () => {
  const { w, b, tiro } = duelo();
  const hp0 = b.ship.hp;
  tiro('dreno');
  w.step(); // acerta já no primeiro passo
  assert.equal(b.drenoTicks, 30 * DRENO_DURACAO, 'ficou drenando');
  assert.equal(w.entidades().find((e) => e.id === b.id).dreno, true, 'todos veem o dreno');
  assert.equal(b.ship.hp, hp0 - WEAPONS.dreno.dano, 'no impacto, só o dano do impacto');
  w.step();
  assert.ok(Math.abs(b.ship.hp - (hp0 - WEAPONS.dreno.dano - DRENO_DPS * DT)) < 1e-9, `um tick de dreno: ${b.ship.hp}`);
  for (let i = 0; i < 30 * DRENO_DURACAO + 30; i++) w.step();
  const total = WEAPONS.dreno.dano + DRENO_DPS * DRENO_DURACAO;
  assert.ok(Math.abs(hp0 - b.ship.hp - total) < 1e-6, `perdeu ${hp0 - b.ship.hp}, esperado ${total}`);
  assert.equal(b.drenoTicks, 0);
  assert.equal(w.entidades().find((e) => e.id === b.id).dreno, false);
});

test('servidor: acertar o dreno de novo renova a duração, sem empilhar', () => {
  const { w, b, tiro } = duelo();
  tiro('dreno');
  w.step();
  for (let i = 0; i < 60; i++) w.step(); // 2 s drenando
  tiro('dreno');
  w.step();
  assert.equal(b.drenoTicks, 30 * DRENO_DURACAO, 'voltou para a duração cheia');
  const hp = b.ship.hp;
  for (let i = 0; i < 30; i++) w.step();
  assert.ok(Math.abs(hp - b.ship.hp - DRENO_DPS) < 1e-6, `1 s com dois acertos tira ${hp - b.ship.hp}, não o dobro`);
});

test('servidor: dreno não age na zona segura (nem na proteção de nascimento)', () => {
  const w = new World({ drones: 0 });
  const j = w.addPlayer('A', 'acron');
  j.protegidoAte = 0;
  j.drenoTicks = 30 * DRENO_DURACAO;
  j.drenoDono = -1;
  const hp = j.ship.hp;
  for (let i = 0; i < 30 * 2; i++) w.step();
  assert.equal(j.ship.hp, hp, 'na base não perde vida');
  assert.ok(j.drenoTicks < 30 * DRENO_DURACAO, 'mas o tempo do dreno corre');

  const { w: w2, b, tiro } = duelo();
  b.protegidoAte = w2.tick + 1000; // acabou de nascer
  const hp2 = b.ship.hp;
  tiro('dreno');
  for (let i = 0; i < 60; i++) w2.step();
  assert.equal(b.ship.hp, hp2);
});

test('servidor: se o dreno matar, o abate e o ouro vão para quem atirou', () => {
  const { w, a, b, tiro } = duelo();
  tiro('dreno');
  w.step();
  b.ship.hp = 3; // morre pelo dreno, não pelo impacto
  for (let i = 0; i < 30 && b.vivo; i++) w.step();
  assert.equal(b.vivo, false);
  assert.equal(a.abates, 1);
  assert.ok(a.ouro > 0);
  assert.equal(b.mortes, 1);
  const morte = w.tirarEventos().find((e) => e.e === 'morte');
  assert.equal(morte.por, a.id);
  assert.equal(b.drenoTicks, 0, 'morto não segue drenando');
});

test('servidor: criogênico deixa o alvo lento, e o snapshot leva isso', () => {
  const { w, b, tiro } = duelo();
  tiro('crio');
  w.step();
  assert.equal(b.ship.lento, CRIO_DURACAO);
  assert.equal(w.entidades().find((e) => e.id === b.id).lento, true);
  assert.equal(w.snapshotPara(b, [], []).me.lento, CRIO_DURACAO, 'me leva o lento para a predição');
  // O lento corre nos passos da própria nave (comandos), como na predição.
  for (let s = 1; s <= 30 * CRIO_DURACAO + 5; s++) {
    w.pushInput(b.id, { s, th: 1 });
    w.step();
  }
  assert.equal(b.ship.lento, 0);
  assert.equal(w.entidades().find((e) => e.id === b.id).lento, false);
});

test('servidor: drones nascem no mundo aberto, fora das bases e do corredor', () => {
  // Gerador com semente fixa: o teste não depende da sorte.
  let a = 42;
  const rng = () => {
    a = (a * 1664525 + 1013904223) >>> 0;
    return a / 4294967296;
  };
  const w = new World({ rng, drones: 60, monstros: 0 });
  let oeste = 0;
  for (const d of w.drones) {
    const { x, z } = d.ship;
    assert.ok(noMapaAberto(x, z), `drone fora do chão (${x.toFixed(0)}, ${z.toFixed(0)})`);
    assert.ok(pontoLivre(x, z), 'com folga das rochas');
    assert.equal(alturaSolida(x, z, SHIP_RADIUS), heightAt(x, z), 'fora de construção');
    for (const b of BASES) assert.ok(Math.hypot(x - b.x, z - b.z) > ZONA_SEGURA + 100, 'longe das bases');
    assert.ok(Math.abs(x - CORREDOR.x) > CORREDOR.largura / 2, 'fora do corredor');
    if (x < 0) oeste++;
  }
  assert.ok(oeste > 15 && oeste < 45, `${oeste} a oeste, o resto a leste`);
});

test('servidor: a zona segura cobre as duas bases', () => {
  assert.ok(ZONA_SEGURA >= BASE.raio);
  for (const b of BASES) {
    const w = new World({ drones: 0, monstros: 0 });
    const j = w.addPlayer('A', 'acron');
    j.ship = createShip('acron', b.x + 50, b.z, 0);
    j.protegidoAte = 0;
    const hp = j.ship.hp;
    const atirador = createShip('mechan', j.ship.x, j.ship.z + 20, 0);
    w.bullets.push({ ...createBullet(atirador, 'plasma', 999, -1), drone: true });
    for (let i = 0; i < 10; i++) w.step();
    assert.equal(j.ship.hp, hp, `base ${b.time}`);
  }
});

test('servidor: drone que chega perto de uma base dá meia volta', () => {
  for (const b of BASES) {
    const w = new World({ drones: 1, monstros: 0 });
    const d = w.drones[0];
    // Na entrada da zona segura, de lado, apontando para dentro da base.
    const ini = { x: b.x + ZONA_SEGURA + 20, z: b.z };
    d.ship = createShip('mechan', ini.x, ini.z, Math.PI / 2);
    d.ship.hp = d.ship.maxHp = 90;
    let maisPerto = Infinity;
    for (let i = 0; i < 30 * 15; i++) {
      w.step();
      maisPerto = Math.min(maisPerto, Math.hypot(d.ship.x - b.x, d.ship.z - b.z));
    }
    assert.ok(maisPerto > b.raio, `entrou na base ${b.time} (chegou a ${maisPerto.toFixed(0)} m)`);
    assert.ok(Math.hypot(d.ship.x - b.x, d.ship.z - b.z) > ZONA_SEGURA + 40, 'voltou para o mundo aberto');
  }
});
