// Partidas em núcleos separados (server/mundos.js, server/mundo-worker.js): o
// servidor com workers de verdade (cada partida numa worker thread) jogando o
// Sandbox, a Partida Privada e uma sala da fila pública, e a conta de folga que
// decide se cabe mais uma partida.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { iniciar } from '../server/index.js';
import { World } from '../server/game.js';
import { temFolga, CARGA_MINIMA, FOLGA_CPU, MB_POR_MUNDO, nucleosDisponiveis, memoriaDisponivelMb } from '../server/mundos.js';

test('mundos: a folga conta as cargas medidas (ou a mínima), um núcleo para as conexões e a memória', () => {
  const base = { nucleos: 8, memoriaMb: 8192, usadaMb: 500 };
  const cabem = Math.floor((7 * FOLGA_CPU) / CARGA_MINIMA); // partidas novas (sem medir) que cabem em 7 núcleos
  assert.equal(temFolga({ ...base, cargas: Array(cabem - 1).fill(0) }), true);
  assert.equal(temFolga({ ...base, cargas: Array(cabem).fill(0) }), false, 'a próxima já não cabe');
  // Partidas medidas mais pesadas ocupam mais.
  assert.equal(temFolga({ ...base, cargas: Array(10).fill(0.5) }), false);
  assert.equal(temFolga({ ...base, cargas: Array(10).fill(0.05) }), true);
  // Com um núcleo só, as partidas dividem ele.
  assert.equal(temFolga({ ...base, nucleos: 1, cargas: Array(3).fill(0.1) }), true);
  assert.equal(temFolga({ ...base, nucleos: 1, cargas: Array(4).fill(0.1) }), false);
  // Sem memória para mais uma, não abre.
  assert.equal(temFolga({ ...base, cargas: [], usadaMb: 8192 * 0.75 - MB_POR_MUNDO + 1 }), false);
  assert.ok(nucleosDisponiveis() >= 1);
  assert.ok(memoriaDisponivelMb() > 0);
});

function conectar(porta) {
  const ws = new WebSocket(`ws://localhost:${porta}/ws`);
  const msgs = [];
  ws.on('message', (d) => msgs.push(JSON.parse(d)));
  return {
    ws,
    msgs,
    aberto: new Promise((ok) => ws.on('open', ok)),
    enviar: (m) => ws.send(JSON.stringify(m)),
    async esperar(f, ms = 15000) {
      for (let t = 0; t < ms; t += 20) {
        const m = msgs.find(f);
        if (m) return m;
        await new Promise((ok) => setTimeout(ok, 20));
      }
      throw new Error('tempo esgotado');
    },
  };
}
const dormir = (ms) => new Promise((ok) => setTimeout(ok, ms));

test('mundos: com workers, o Sandbox e a Privada rodam cada um no seu núcleo e somem quando o piloto sai', async () => {
  const srv = await iniciar({ porta: 0, workers: true, world: new World({ preparacaoS: 0, jungle: false, torretas: false }) });
  try {
    const a = conectar(srv.porta);
    const b = conectar(srv.porta);
    await Promise.all([a.aberto, b.aberto]);
    a.enviar({ t: 'entrar', nome: 'Testador', race: 'acron', teste: true });
    b.enviar({ t: 'entrar', nome: 'Sozinho', race: 'bellico', privada: true, iaInimigo: 3 });
    const [ba, bb] = await Promise.all([a.esperar((m) => m.t === 'bemvindo'), b.esperar((m) => m.t === 'bemvindo')]);
    assert.deepEqual([ba.modo, ba.teste, bb.modo, bb.teste], ['teste', true, 'privada', false]);
    assert.equal(srv.world.players.size, 0, 'ninguém na partida principal');
    assert.equal([...srv.mundos.keys()].filter((m) => m.worker).length, 2, 'duas partidas, cada uma num worker');

    // Os snapshots chegam do worker, e os pedidos voltam respondidos.
    const snap = await a.esperar((m) => m.t === 'snap' && m.me);
    assert.equal(snap.partida.semTempo, true);
    a.enviar({ t: 'teste', acao: 'ouro' });
    assert.equal((await a.esperar((m) => m.t === 'resultado' && m.acao === 'teste')).ok, true);
    await a.esperar((m) => m.t === 'snap' && m.ouro >= 1000);
    b.enviar({ t: 'teste', acao: 'ouro' });
    assert.equal((await b.esperar((m) => m.t === 'resultado' && m.acao === 'teste')).codigo, 'invalido', 'só o Sandbox dá ouro');
    const sb = await b.esperar((m) => m.t === 'snap' && m.jogadores?.filter((j) => j.ia).length === 3);
    assert.equal(sb.jogadores.length, 4, 'a Privada com os 3 computadores pedidos');
    // O comando de voo chega ao worker: a nave anda.
    const x0 = sb.me.x;
    for (let s = 1; s <= 60; s++) b.enviar({ t: 'in', s, th: 1, tu: 0, b: false, f1: false, f2: false, p: false, r: false, a: -1, a2: -1 });
    await b.esperar((m) => m.t === 'snap' && m.ack >= 60 && Math.abs(m.me.x - x0) > 5);
    // O pong sai da linha das conexões.
    b.enviar({ t: 'ping', c: 42 });
    assert.deepEqual(await b.esperar((m) => m.t === 'pong'), { t: 'pong', c: 42 });

    const saude = await (await fetch(`http://localhost:${srv.porta}/healthz`)).json();
    assert.equal(saude.partidas, 2);
    assert.equal(saude.jogadores, 2);
    assert.ok(saude.nucleos >= 1);

    a.ws.close();
    b.ws.close();
    for (let i = 0; i < 100 && srv.mundos.size > 1; i++) await dormir(20);
    assert.equal(srv.mundos.size, 1, 'saíram, as duas partidas (e os workers) acabaram');
  } finally {
    await srv.fechar();
  }
});

test('mundos: com workers, a sala da Pública vira uma partida num núcleo, com os 3 juntos contra 3 computadores', async () => {
  const srv = await iniciar({ porta: 0, workers: true, world: new World({ preparacaoS: 0, jungle: false, torretas: false }) });
  try {
    const menus = ['Ana', 'Bia', 'Cau'].map(() => conectar(srv.porta));
    await Promise.all(menus.map((m) => m.aberto));
    menus.forEach((m, i) => m.enviar({ t: 'entrarFila', modo: 'publica', nome: ['Ana', 'Bia', 'Cau'][i], race: 'shrewdo', classe: 'mobile' }));
    await Promise.all(menus.map((m) => m.esperar((x) => x.t === 'fila' && x.estado === 'sala')));
    menus.forEach((m) => m.enviar({ t: 'pronto' }));
    const comecos = await Promise.all(menus.map((m) => m.esperar((x) => x.t === 'fila' && x.estado === 'comecar')));
    for (const m of menus) m.ws.close();
    const jogos = comecos.map(() => conectar(srv.porta));
    await Promise.all(jogos.map((j) => j.aberto));
    jogos.forEach((j, i) => j.enviar({ t: 'entrar', sala: comecos[i].sala, token: comecos[i].token }));
    const boas = await Promise.all(jogos.map((j) => j.esperar((x) => x.t === 'bemvindo' || x.t === 'erro')));
    for (const b of boas) assert.deepEqual([b.t, b.modo, b.time], ['bemvindo', 'publica', comecos[0].time]);
    const snap = await jogos[0].esperar((m) => m.t === 'snap' && m.jogadores?.length === 6);
    assert.deepEqual(snap.jogadores.filter((j) => !j.ia).map((j) => j.nome).sort(), ['Ana', 'Bia', 'Cau']);
    assert.ok(snap.jogadores.filter((j) => j.ia).every((j) => j.time !== comecos[0].time));
    // Um sai no meio: um computador fica com a vaga.
    jogos[0].ws.close();
    await jogos[1].esperar((m) => m.t === 'snap' && m.jogadores.filter((j) => j.time === comecos[0].time).length === 3 && m.jogadores.filter((j) => j.ia).length === 4);
    jogos[1].ws.close();
    jogos[2].ws.close();
    for (let i = 0; i < 100 && srv.mundos.size > 1; i++) await dormir(20);
    assert.equal(srv.mundos.size, 1);
  } finally {
    await srv.fechar();
  }
});
