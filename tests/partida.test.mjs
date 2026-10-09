// Partida 3 contra 3: times, nascimento na base do time, sem fogo amigo, pouso e
// zona segura só na própria base, cronômetro e fim de partida (server/partida.js e
// os ganchos em server/game.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { iniciar } from '../server/index.js';
import { World, ZONA_SEGURA } from '../server/game.js';
import { MAX_POR_TIME } from '../server/partida.js';
import { createShip, createBullet, pousoPermitido, WEAPONS } from '../shared/sim.js';
import { BASES, SERVICOS, OBJETIVOS } from '../shared/terrain.js';

const SEGUNDO = 30; // ticks

/** Mensagens de um WebSocket, com espera por filtro. */
function conectar(porta) {
  const ws = new WebSocket(`ws://localhost:${porta}/ws`);
  const msgs = [];
  const fechou = new Promise((ok) => ws.on('close', ok));
  ws.on('message', (d) => msgs.push(JSON.parse(d)));
  const esperar = async (filtro, ms = 3000) => {
    const ate = Date.now() + ms;
    while (Date.now() < ate) {
      const m = msgs.find(filtro);
      if (m) return m;
      await new Promise((ok) => setTimeout(ok, 10));
    }
    throw new Error('tempo esgotado');
  };
  return { ws, esperar, fechou, aberto: new Promise((ok) => ws.on('open', ok)) };
}

/** Põe o jogador numa posição, sem proteção de nascimento. */
function colocar(j, x, z, yaw = 0) {
  j.ship = createShip(j.ship.race, x, z, yaw);
  j.ship.time = j.time;
  j.protegidoAte = 0;
}

test('partida: entra no time com menos gente, até 3 em cada', () => {
  const w = new World({ drones: 0, monstros: 0 });
  const times = [];
  for (let i = 0; i < 2 * MAX_POR_TIME; i++) times.push(w.addPlayer(`P${i}`, 'acron').time);
  assert.deepEqual(times, [0, 1, 0, 1, 0, 1]);
  assert.equal(w.addPlayer('Sétimo', 'acron'), null, 'os dois times cheios');
  assert.equal(w.players.size, 6);
  // Sai um do time 1: a vaga é dele.
  const saiu = [...w.players.values()].find((j) => j.time === 1);
  w.removePlayer(saiu.id);
  assert.equal(w.addPlayer('Volta', 'acron').time, 1);
});

test('partida: bemvindo traz o time e a partida cheia recusa com código estável', async () => {
  const world = new World({ drones: 0, monstros: 0 });
  const srv = await iniciar({ porta: 0, world });
  try {
    const a = conectar(srv.porta);
    await a.aberto;
    a.ws.send(JSON.stringify({ t: 'entrar', nome: 'A', race: 'acron' }));
    assert.equal((await a.esperar((m) => m.t === 'bemvindo')).time, 0);
    const b = conectar(srv.porta);
    await b.aberto;
    b.ws.send(JSON.stringify({ t: 'entrar', nome: 'B', race: 'acron' }));
    assert.equal((await b.esperar((m) => m.t === 'bemvindo')).time, 1);
    const snap = await b.esperar((m) => m.t === 'snap');
    assert.equal(snap.time, 1);
    assert.equal(snap.me.time, 1, 'a predição sabe o time (pouso)');
    assert.equal(snap.partida.estado, 'andamento');
    assert.deepEqual(snap.partida.placar, [0, 0]);
    assert.ok(snap.ents.filter((e) => e.tipo === 'jogador').every((e) => e.time === 0 || e.time === 1), 'ents de jogador trazem o time');

    for (let i = 0; i < 4; i++) world.addPlayer(`Extra${i}`, 'acron');
    const c = conectar(srv.porta);
    await c.aberto;
    c.ws.send(JSON.stringify({ t: 'entrar', nome: 'C', race: 'acron' }));
    const erro = await c.esperar((m) => m.t === 'erro');
    assert.equal(erro.codigo, 'partida_cheia');
    await c.fechou;
    assert.equal(world.players.size, 6);
    a.ws.close();
    b.ws.close();
  } finally {
    await srv.fechar();
  }
});

test('partida: cada um nasce e renasce na base do próprio time, voltado para o corredor', () => {
  const w = new World({ drones: 0, monstros: 0 });
  for (let i = 0; i < 6; i++) w.addPlayer(`P${i}`, 'bellico');
  for (const j of w.players.values()) {
    const b = BASES[j.time];
    assert.ok(Math.hypot(j.ship.x - b.x, j.ship.z - b.z) <= 60, `nasceu na base ${j.time}`);
    // yaw 0 olha para -z: o time 0 (embaixo) olha para o norte, o time 1 para o sul.
    assert.equal(j.ship.yaw, j.time === 0 ? 0 : Math.PI);
    assert.equal(j.ship.time, j.time);
  }
  const j = [...w.players.values()].find((p) => p.time === 1);
  colocar(j, 0, 300); // no corredor, fora das duas zonas seguras
  j.ship.hp = 1;
  w.bullets.push({ ...createBullet(createShip('mechan', 0, 320, 0), 'laser', 999, -1), drone: true });
  for (let i = 0; i < 5 * SEGUNDO; i++) w.step();
  assert.equal(j.mortes, 1, 'foi destruído');
  assert.equal(j.vivo, true, 'renasceu');
  assert.ok(Math.hypot(j.ship.x - BASES[1].x, j.ship.z - BASES[1].z) <= 60, 'na base do time 1');
});

test('partida: sem fogo amigo, o tiro atravessa o aliado e acerta o inimigo atrás', () => {
  const w = new World({ drones: 0, monstros: 0 });
  const a = w.addPlayer('A', 'acron'); // time 0
  const inimigo = w.addPlayer('B', 'bellico'); // time 1
  const aliado = w.addPlayer('C', 'shrewdo'); // time 0
  assert.equal(aliado.time, a.time);
  colocar(a, 600, 0);
  colocar(aliado, 600, -20);
  colocar(inimigo, 600, -45);
  const hpAliado = aliado.ship.hp;
  const hpInimigo = inimigo.ship.hp;
  w.pushInput(a.id, { s: 1, f1: true });
  for (let i = 0; i < 10; i++) w.step();
  assert.equal(aliado.ship.hp, hpAliado, 'aliado intacto');
  assert.equal(hpInimigo - inimigo.ship.hp, WEAPONS.laser.dano, 'o inimigo atrás levou o tiro');
});

test('partida: pouso no anel e nos serviços só na base do próprio time; objetivo A aceita todos', () => {
  for (const b of BASES) {
    for (const time of [0, 1]) {
      const s = createShip('acron', b.x, b.z);
      s.time = time;
      assert.equal(pousoPermitido(s), time === b.time, `time ${time} no anel da base ${b.time}`);
    }
  }
  for (const sv of SERVICOS) {
    const s = createShip('acron', sv.x, sv.z);
    s.time = 1 - sv.time;
    assert.equal(pousoPermitido(s), false, `${sv.servico} do outro time`);
    s.time = sv.time;
    assert.equal(pousoPermitido(s), true, `${sv.servico} do próprio time`);
  }
  const a = OBJETIVOS.find((o) => o.tipo === 'A');
  for (const time of [0, 1]) {
    const s = createShip('acron', a.x, a.z);
    s.time = time;
    assert.equal(pousoPermitido(s), true, 'objetivo A é de quem chegar');
  }

  // No servidor: o time 1 aperta L no anel da base do time 0 e não pousa.
  const w = new World({ drones: 0, monstros: 0 });
  w.addPlayer('A', 'acron');
  const j = w.addPlayer('B', 'acron');
  colocar(j, BASES[0].x, BASES[0].z);
  w.pushInput(j.id, { s: 1, p: true });
  w.step();
  assert.equal(j.ship.pousado, false, 'não pousa na base do outro time');
  colocar(j, BASES[1].x, BASES[1].z);
  w.pushInput(j.id, { s: 2 });
  w.pushInput(j.id, { s: 3, p: true });
  w.step();
  assert.equal(j.ship.pousado, true, 'pousa na própria base');
});

test('partida: a zona segura só protege o time dono da base', () => {
  const w = new World({ drones: 0, monstros: 0 });
  const dono = w.addPlayer('Dono', 'acron'); // time 0
  const invasor = w.addPlayer('Invasor', 'acron'); // time 1
  const b = BASES[0];
  colocar(dono, b.x + 40, b.z);
  colocar(invasor, b.x - 40, b.z);
  assert.ok(ZONA_SEGURA > 40);
  const hpDono = dono.ship.hp;
  const hpInvasor = invasor.ship.hp;
  // Um plasma de drone em cada um (o drone não escolhe time).
  for (const alvo of [dono, invasor]) {
    w.bullets.push({ ...createBullet(createShip('mechan', alvo.ship.x, alvo.ship.z + 20, 0), 'plasma', 900 + alvo.id, -1), drone: true });
  }
  for (let i = 0; i < 10; i++) w.step();
  assert.equal(dono.ship.hp, hpDono, 'na própria base: seguro');
  assert.ok(invasor.ship.hp < hpInvasor, 'na base do outro time: leva dano');
});

test('partida: no fim vence quem minerou mais, todos veem e outra partida começa do zero', () => {
  const w = new World({ drones: 0, monstros: 0, duracaoPartidaS: 3, intervaloFimS: 2 });
  assert.equal(w.partida.estado, 'esperando', 'servidor vazio não gasta partida');
  const a = w.addPlayer('A', 'acron');
  const b = w.addPlayer('B', 'acron');
  w.step();
  assert.equal(w.partida.estado, 'andamento');
  assert.equal(w.partida.numero, 1);
  assert.equal(w.snapshotPara(a, [], []).partida.restante, 3);
  assert.ok(w.mineradores.lista.length > 0, 'mineradores saíram');
  w.partida.somar(1, 20);
  w.partida.somar(0, 10);
  colocar(a, 600, 0); // longe da base, para ver o renascimento
  w.tirarEventos();
  for (let i = 0; i < 3 * SEGUNDO; i++) w.step();
  assert.equal(w.partida.estado, 'fim');
  assert.equal(w.partida.vencedor, 1);
  const fim = w.tirarEventos().find((e) => e.e === 'fimPartida');
  assert.deepEqual(fim, { e: 'fimPartida', vencedor: 1, placar: [10, 20] });
  const snap = w.snapshotPara(b, [], []).partida;
  assert.equal(snap.estado, 'fim');
  assert.equal(snap.vencedor, 1);
  assert.equal(snap.novaEm, 2);
  // Na tela de fim, o placar não muda mais e os mineradores param.
  w.partida.somar(0, 50);
  assert.deepEqual(w.partida.placar, [10, 20]);
  const pos = w.mineradores.lista.map((m) => [m.ship.x, m.ship.z]);
  w.step();
  assert.deepEqual(w.mineradores.lista.map((m) => [m.ship.x, m.ship.z]), pos);

  for (let i = 0; i < 2 * SEGUNDO; i++) w.step();
  assert.equal(w.partida.estado, 'andamento');
  assert.equal(w.partida.numero, 2);
  assert.deepEqual(w.partida.placar, [0, 0]);
  assert.ok(w.mineradores.lista.every((m) => Math.hypot(m.ship.x - BASES[m.time].x, m.ship.z - BASES[m.time].z) < 30), 'só os novos, saindo da base');
  assert.ok(Math.hypot(a.ship.x - BASES[0].x, a.ship.z - BASES[0].z) <= 60, 'A voltou para a base');
  assert.ok(w.tirarEventos().some((e) => e.e === 'partida' && e.n === 2));
});

test('partida: empate e servidor vazio', () => {
  const w = new World({ drones: 0, monstros: 0, duracaoPartidaS: 1, intervaloFimS: 1 });
  const a = w.addPlayer('A', 'acron');
  for (let i = 0; i < SEGUNDO + 1; i++) w.step();
  assert.equal(w.partida.estado, 'fim');
  assert.equal(w.partida.vencedor, -1, 'zero a zero empata');
  w.removePlayer(a.id);
  w.step();
  assert.equal(w.partida.estado, 'esperando');
  assert.equal(w.mineradores.lista.length, 0);
  w.addPlayer('B', 'acron');
  w.step();
  assert.equal(w.partida.estado, 'andamento');
});
