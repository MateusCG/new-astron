import { test } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { iniciar } from '../server/index.js';
import { World } from '../server/game.js';
import { NIVEL_MAX, xpParaNivel } from '../server/progressao.js';

// Modo de teste: um mundo só do piloto, com a partida sem relógio e os pedidos de
// ouro e XP para testar a progressão da nave (pedido do Mateus).

const mundoTeste = () => new World({ teste: true, drones: 0, monstros: 0, elites: 0, torretas: false });

test('teste: a partida do mundo de teste não acaba nem entra na fase final', () => {
  const w = mundoTeste();
  w.addPlayer('A', 'acron', 'assault');
  for (let i = 0; i < 30 * 5; i++) w.step();
  // Avança o relógio para muito depois dos 10 minutos.
  w.tick += 30 * 60 * 60;
  w.step();
  const p = w.partida.paraSnapshot(w.tick);
  assert.equal(p.estado, 'andamento');
  assert.equal(p.fase, 'normal');
  assert.equal(p.semTempo, true);
  assert.equal(p.restante, 0);
  assert.equal(w.partida.fracaoDecorrida(w.tick), 0, 'renascer não cresce com o tempo');
});

test('teste: ouro, XP, nível e nível máximo pelos pedidos do modo de teste', () => {
  const w = mundoTeste();
  const j = w.addPlayer('A', 'bellico', 'mobile');
  const hp1 = j.ship.maxHp;
  assert.equal(w.pedidoTeste(j.id, { acao: 'ouro' }).ok, true);
  assert.equal(j.ouro, 1000);
  assert.equal(w.pedidoTeste(j.id, { acao: 'xp' }).ok, true);
  assert.equal(j.nivel, 2, `100 XP passam do nível 1 (${xpParaNivel(1)})`);
  assert.equal(w.pedidoTeste(j.id, { acao: 'nivel' }).ok, true);
  assert.equal(j.nivel, 3);
  assert.ok(j.ship.maxHp > hp1, 'o HP do nível acompanha');
  assert.equal(w.pedidoTeste(j.id, { acao: 'nivelMax' }).ok, true);
  assert.equal(j.nivel, NIVEL_MAX);
  assert.deepEqual(w.pedidoTeste(j.id, { acao: 'nivel' }), { t: 'resultado', acao: 'teste', item: 'nivel', ok: false, codigo: 'limite' });
  assert.equal(w.pedidoTeste(j.id, { acao: 'bobagem' }).codigo, 'invalido');
  assert.ok(w.tirarEventos().some((e) => e.e === 'nivel' && e.nivel === NIVEL_MAX), 'avisa a subida');
});

test('teste: na partida de verdade os pedidos de teste são recusados', () => {
  const w = new World({ drones: 0, monstros: 0, elites: 0, torretas: false });
  const j = w.addPlayer('A', 'shrewdo');
  assert.equal(w.pedidoTeste(j.id, { acao: 'ouro' }).codigo, 'invalido');
  assert.equal(j.ouro, 0);
});

test('teste: entrar em modo de teste cria um mundo só seu, separado da partida', async () => {
  const srv = await iniciar({ porta: 0, world: new World({ drones: 0, monstros: 0, elites: 0, torretas: false }) });
  const abrir = () =>
    new Promise((ok) => {
      const ws = new WebSocket(`ws://localhost:${srv.porta}/ws`);
      const msgs = [];
      ws.on('message', (d) => msgs.push(JSON.parse(d)));
      ws.on('open', () => ok({ ws, msgs }));
    });
  const esperar = async (msgs, filtro) => {
    for (let i = 0; i < 100; i++) {
      const m = msgs.find(filtro);
      if (m) return m;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error('tempo esgotado');
  };
  try {
    const a = await abrir();
    a.ws.send(JSON.stringify({ t: 'entrar', nome: 'Testador', race: 'acron', classe: 'functional', teste: true }));
    const boas = await esperar(a.msgs, (m) => m.t === 'bemvindo');
    assert.equal(boas.teste, true);
    assert.equal(srv.world.players.size, 0, 'a partida de verdade não ganhou ninguém');
    a.ws.send(JSON.stringify({ t: 'teste', acao: 'ouro' }));
    const r = await esperar(a.msgs, (m) => m.t === 'resultado' && m.acao === 'teste');
    assert.equal(r.ok, true);
    const snap = await esperar(a.msgs, (m) => m.t === 'snap' && m.ouro >= 1000);
    assert.equal(snap.partida.semTempo, true);

    // Quem entra normal cai na partida de verdade e não pode pedir ouro.
    const b = await abrir();
    b.ws.send(JSON.stringify({ t: 'entrar', nome: 'Normal', race: 'bellico' }));
    const boasB = await esperar(b.msgs, (m) => m.t === 'bemvindo');
    assert.equal(boasB.teste, false);
    assert.equal(srv.world.players.size, 1);
    b.ws.send(JSON.stringify({ t: 'teste', acao: 'ouro' }));
    const rb = await esperar(b.msgs, (m) => m.t === 'resultado' && m.acao === 'teste');
    assert.equal(rb.codigo, 'invalido');
    a.ws.close();
    b.ws.close();
  } finally {
    await srv.fechar();
  }
});
