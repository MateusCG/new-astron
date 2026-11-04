// Filas online (server/filas.js e server/index.js): a fila em tempo real, a sala com o
// contador de seleção, o Pronto que trava a nave, a sala que se desfaz (tempo zerado
// ou alguém saindo) e a entrada no mundo com o token da vaga.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { Filas, MODOS_FILA, SELECAO_S, nomeDaFila } from '../server/filas.js';
import { iniciar } from '../server/index.js';
import { World } from '../server/game.js';
import { MAX_POR_TIME } from '../server/partida.js';

/** Filas com relógio na mão e as mensagens de cada cliente guardadas. */
function montar(op = {}) {
  let agora = 0;
  const caixas = new Map();
  const salas = [];
  let k = 0;
  const filas = new Filas({
    enviar: (c, msg) => caixas.get(c).push(msg),
    aoComecar: (sala) => salas.push(sala),
    agora: () => agora,
    rng: () => ((k = (k * 9301 + 49297) % 233280) / 233280),
    ...op,
  });
  const cliente = (nome) => {
    const c = { nome };
    caixas.set(c, []);
    return c;
  };
  const ultima = (c, t = 'fila') => caixas.get(c).filter((m) => m.t === t).at(-1);
  return { filas, cliente, ultima, salas, caixas, andar: (ms) => (agora += ms) };
}

const entrar = (f, c, modo, extra = {}) => f.entrar(c, { modo, nome: c.nome, race: 'acron', classe: 'assault', ...extra });

test('filas: os pilotos chegando aparecem na hora para quem está na fila', () => {
  const { filas, cliente, ultima } = montar();
  const a = cliente('A');
  const b = cliente('B');
  entrar(filas, a, 'online');
  assert.deepEqual([ultima(a).estado, ultima(a).n, ultima(a).precisa], ['procurando', 1, 6]);
  entrar(filas, b, 'online');
  assert.equal(ultima(a).n, 2, 'quem já estava vê o segundo chegar');
  assert.equal(ultima(b).n, 2);
  filas.sair(b);
  assert.equal(ultima(a).n, 1);
  assert.equal(ultima(b).estado, 'fora');
  assert.equal(entrar(filas, cliente('C'), 'sandbox'), 'invalido', 'só os modos de fila');
});

test('filas: o menu observa a contagem das filas em tempo real', () => {
  const { filas, cliente, ultima } = montar();
  const menu = cliente('menu');
  filas.observar(menu);
  assert.deepEqual(ultima(menu, 'filas').online, { fila: 0, escolhendo: 0, jogando: 0, precisa: 6 });
  entrar(filas, cliente('A'), 'publica');
  assert.equal(ultima(menu, 'filas').publica.fila, 1);
  entrar(filas, cliente('B'), 'publica');
  entrar(filas, cliente('C'), 'publica');
  assert.deepEqual([ultima(menu, 'filas').publica.fila, ultima(menu, 'filas').publica.escolhendo], [0, 3], 'os três foram para a sala');
});

test('filas: 6 na fila do 3 contra 3 viram uma sala, 3 em cada time, com o contador', () => {
  const { filas, cliente, ultima } = montar();
  const cs = 'ABCDEFG'.split('').map(cliente);
  for (const c of cs) entrar(filas, c, 'online');
  const salas = cs.slice(0, 6).map((c) => ultima(c));
  for (const s of salas) {
    assert.equal(s.estado, 'sala');
    assert.equal(s.restante, SELECAO_S);
    assert.deepEqual([s.prontos, s.total, s.bots], [0, 6, 0]);
    assert.deepEqual(s.times.map((t) => t.length), [3, 3]);
  }
  assert.equal(ultima(cs[6]).estado, 'procurando', 'o sétimo continua na fila');
  assert.equal(ultima(cs[6]).n, 1);
  // O próprio time às claras, o outro às cegas.
  const s = salas[0];
  const meu = s.times[s.voce.time];
  const outro = s.times[1 - s.voce.time];
  assert.ok(meu.every((m) => m.race && m.classe));
  assert.ok(outro.every((m) => m.race === undefined && m.classe === undefined));
  assert.equal(meu.filter((m) => m.voce).length, 1);
});

test('filas: na pública os 3 humanos ficam no mesmo time e o outro é dos computadores', () => {
  const { filas, cliente, ultima } = montar();
  const cs = ['A', 'B', 'C'].map(cliente);
  for (const c of cs) entrar(filas, c, 'publica');
  const s = ultima(cs[0]);
  assert.equal(s.estado, 'sala');
  assert.equal(s.bots, 1);
  assert.equal(s.times[s.voce.time].length, 3);
  assert.equal(s.times[1 - s.voce.time].length, 0);
});

test('filas: a escolha aparece para o time, o Pronto trava e todos prontos começam a partida', () => {
  const { filas, cliente, ultima, salas } = montar();
  const cs = ['A', 'B', 'C'].map(cliente);
  for (const c of cs) entrar(filas, c, 'publica');
  filas.escolher(cs[0], { race: 'bellico', classe: 'mobile' });
  const visto = ultima(cs[1]).times[ultima(cs[1]).voce.time].find((m) => m.nome === 'A');
  assert.deepEqual([visto.race, visto.classe], ['bellico', 'mobile'], 'o companheiro vê na hora');
  filas.escolher(cs[0], { race: 'mechan', classe: 'tanque' });
  assert.equal(ultima(cs[0]).voce.race, 'bellico', 'raça bloqueada e classe inválida não valem');
  filas.pronto(cs[0]);
  assert.equal(ultima(cs[1]).prontos, 1);
  assert.equal(filas.escolher(cs[0], { race: 'shrewdo' }), 'travada');
  filas.pronto(cs[1], { race: 'shrewdo', classe: 'functional' });
  assert.equal(salas.length, 0);
  filas.pronto(cs[2]);
  assert.equal(salas.length, 1, 'todos prontos: começou');
  const [sala] = salas;
  assert.equal(sala.modo, 'publica');
  const tokens = new Set(sala.membros.map((m) => m.token));
  assert.equal(tokens.size, 3, 'um token por vaga');
  const a = sala.membros.find((m) => m.nome === 'A');
  assert.deepEqual([a.race, a.classe], ['bellico', 'mobile']);
  const b = sala.membros.find((m) => m.nome === 'B');
  assert.deepEqual([b.race, b.classe], ['shrewdo', 'functional'], 'a escolha final vai junto do Pronto');
  for (const c of cs) {
    const m = ultima(c);
    assert.equal(m.estado, 'comecar');
    assert.ok(tokens.has(m.token));
  }
  assert.equal(filas.contagem().publica.escolhendo, 0);
});

test('filas: contador zerado sem todos prontos desfaz a sala; os prontos voltam ao começo da fila', () => {
  const { filas, cliente, ultima, salas, andar } = montar();
  const cs = ['A', 'B', 'C'].map(cliente);
  for (const c of cs) entrar(filas, c, 'publica');
  andar(1000);
  const d = cliente('D');
  entrar(filas, d, 'publica'); // chega durante a seleção: fica na fila
  filas.pronto(cs[0]);
  filas.pronto(cs[2]);
  andar(SELECAO_S * 1000 - 1001);
  filas.passo();
  assert.equal(ultima(cs[1]).estado, 'sala', 'ainda não zerou');
  andar(1);
  filas.passo();
  assert.equal(salas.length, 0);
  assert.deepEqual(ultima(cs[1]), { t: 'fila', estado: 'fora', aviso: 'sem_pronto' }, 'quem não apertou sai da fila');
  // A, C e D formam a sala nova na hora (A e C na frente de D).
  for (const c of [cs[0], cs[2], d]) assert.equal(ultima(c).estado, 'sala');
  assert.ok(ultima(cs[0]).restante === SELECAO_S, 'contador novo');
  assert.equal(ultima(cs[0]).prontos, 0, 'o Pronto não passa para a sala nova');
});

test('filas: sem gente para fechar outra sala, os prontos voltam à fila com o aviso e a espera de antes', () => {
  const { filas, cliente, ultima, andar } = montar();
  const cs = 'ABCDEF'.split('').map(cliente);
  for (const c of cs) entrar(filas, c, 'online');
  andar(5000);
  filas.pronto(cs[0]);
  andar(SELECAO_S * 1000);
  filas.passo();
  const m = ultima(cs[0]);
  assert.equal(m.estado, 'procurando');
  assert.equal(m.aviso, 'sala_tempo');
  assert.equal(m.n, 1);
  assert.equal(m.espera, 5 + SELECAO_S, 'a espera conta de quando entrou');
});

test('filas: alguém sai da sala e os outros voltam ao começo da fila, na frente de quem chegou depois', () => {
  const { filas, cliente, ultima } = montar();
  const cs = ['A', 'B', 'C'].map(cliente);
  for (const c of cs) entrar(filas, c, 'publica');
  const d = cliente('D');
  entrar(filas, d, 'publica');
  filas.sair(cs[1]);
  assert.equal(ultima(cs[1]).estado, 'fora');
  // A, C (de volta, na frente) e D: sala nova.
  for (const c of [cs[0], cs[2], d]) assert.equal(ultima(c).estado, 'sala');
  // Fechar a conexão é o mesmo que sair.
  filas.esquecer(d);
  assert.equal(ultima(cs[0]).estado, 'procurando');
  assert.equal(ultima(cs[0]).aviso, 'sala_saiu');
  assert.equal(ultima(cs[0]).n, 2);
});

test('filas: sem lugar para outro mundo a fila espera, e forma a sala quando abre', () => {
  let lugar = false;
  const { filas, cliente, ultima } = montar({ podeAbrirSala: () => lugar });
  const cs = ['A', 'B', 'C'].map(cliente);
  for (const c of cs) entrar(filas, c, 'publica');
  assert.equal(ultima(cs[0]).estado, 'procurando');
  lugar = true;
  filas.passo();
  assert.equal(ultima(cs[0]).estado, 'sala');
});

test('filas: entrar de novo não muda de lugar e o nome é saneado', () => {
  const { filas, cliente, ultima } = montar();
  const a = cliente('A');
  entrar(filas, a, 'online', { nome: '<b>Zé</b>' });
  entrar(filas, a, 'online');
  assert.equal(ultima(a).n, 1);
  assert.equal(nomeDaFila('<b>Zé</b>'), 'bZéb');
  assert.equal(nomeDaFila(''), 'Piloto');
  assert.equal(MODOS_FILA.online.humanos, 2 * MAX_POR_TIME);
  assert.equal(MODOS_FILA.publica.humanos, MAX_POR_TIME);
});

// ---------- Servidor de verdade (WebSocket) ----------

function conectar(porta) {
  const ws = new WebSocket(`ws://localhost:${porta}/ws`);
  const msgs = [];
  const esperas = [];
  ws.on('message', (d) => {
    const m = JSON.parse(d);
    msgs.push(m);
    for (const e of [...esperas]) if (e.f(m)) {
      esperas.splice(esperas.indexOf(e), 1);
      e.ok(m);
    }
  });
  const aberto = new Promise((ok) => ws.on('open', ok));
  return {
    ws,
    msgs,
    aberto,
    enviar: (m) => ws.send(JSON.stringify(m)),
    esperar: (f) =>
      new Promise((ok, falha) => {
        const ja = msgs.find(f);
        if (ja) return ok(ja);
        esperas.push({ f, ok });
        setTimeout(() => falha(new Error('tempo')), 3000);
      }),
  };
}

test('filas: pela rede, 3 pilotos na pública entram juntos num mundo novo contra 3 computadores', async () => {
  const principal = new World({ preparacaoS: 0, jungle: false, torretas: false });
  const srv = await iniciar({ porta: 0, world: principal });
  try {
    const menus = ['Ana', 'Bia', 'Cau'].map(() => conectar(srv.porta));
    await Promise.all(menus.map((m) => m.aberto));
    menus[0].enviar({ t: 'filas' });
    await menus[0].esperar((m) => m.t === 'filas');
    ['Ana', 'Bia', 'Cau'].forEach((nome, i) => menus[i].enviar({ t: 'entrarFila', modo: 'publica', nome, race: 'shrewdo', classe: 'mobile' }));
    await Promise.all(menus.map((m) => m.esperar((x) => x.t === 'fila' && x.estado === 'sala')));
    // Entrar no jogo pela conexão do menu não vale.
    menus.forEach((m) => m.enviar({ t: 'pronto' }));
    const comecos = await Promise.all(menus.map((m) => m.esperar((x) => x.t === 'fila' && x.estado === 'comecar')));
    for (const m of menus) m.ws.close();

    const jogos = comecos.map(() => conectar(srv.porta));
    await Promise.all(jogos.map((j) => j.aberto));
    jogos.forEach((j, i) => j.enviar({ t: 'entrar', sala: comecos[i].sala, token: comecos[i].token }));
    const boas = await Promise.all(jogos.map((j) => j.esperar((x) => x.t === 'bemvindo' || x.t === 'erro')));
    for (const b of boas) {
      assert.equal(b.t, 'bemvindo');
      assert.equal(b.modo, 'publica');
      assert.equal(b.time, comecos[0].time, 'os três no mesmo time');
    }
    const mundo = [...srv.mundos.keys()].find((w) => w.modo === 'publica');
    assert.ok(mundo && mundo !== principal, 'um mundo novo, fora do principal');
    const js = [...mundo.players.values()];
    assert.equal(js.filter((j) => !j.ia).length, 3);
    assert.equal(js.filter((j) => j.ia && j.time !== comecos[0].time).length, 3, '3 computadores no outro time');
    assert.deepEqual(js.filter((j) => !j.ia).map((j) => j.nome).sort(), ['Ana', 'Bia', 'Cau']);
    assert.equal(principal.players.size, 0);

    // O token vale uma vez só.
    const outro = conectar(srv.porta);
    await outro.aberto;
    outro.enviar({ t: 'entrar', sala: comecos[0].sala, token: comecos[0].token });
    assert.deepEqual(await outro.esperar((x) => x.t === 'erro'), { t: 'erro', codigo: 'sala_invalida' });

    // Um sai no meio: um computador fica com a vaga; saem todos: o mundo some.
    jogos[0].ws.close();
    await new Promise((ok) => setTimeout(ok, 100));
    assert.equal([...mundo.players.values()].filter((j) => j.time === comecos[0].time).length, 3);
    jogos[1].ws.close();
    jogos[2].ws.close();
    await new Promise((ok) => setTimeout(ok, 100));
    assert.ok(!srv.mundos.has(mundo));
  } finally {
    await srv.fechar();
  }
});

test('filas: a Partida Privada com Bots é um mundo só do piloto', async () => {
  const principal = new World({ preparacaoS: 0, jungle: false, torretas: false });
  const srv = await iniciar({ porta: 0, world: principal });
  try {
    const a = conectar(srv.porta);
    const b = conectar(srv.porta);
    await Promise.all([a.aberto, b.aberto]);
    a.enviar({ t: 'entrar', nome: 'A', race: 'acron', privada: true, iaInimigo: 3 });
    b.enviar({ t: 'entrar', nome: 'B', race: 'acron', privada: true });
    const [ba, bb] = await Promise.all([a.esperar((x) => x.t === 'bemvindo'), b.esperar((x) => x.t === 'bemvindo')]);
    assert.equal(ba.modo, 'privada');
    assert.equal(bb.modo, 'privada');
    const privadas = [...srv.mundos.keys()].filter((w) => w.modo === 'privada');
    assert.equal(privadas.length, 2, 'cada um no seu');
    assert.equal(principal.players.size, 0);
    a.ws.close();
    await new Promise((ok) => setTimeout(ok, 100));
    assert.equal([...srv.mundos.keys()].filter((w) => w.modo === 'privada').length, 1, 'saiu, o mundo some');
    b.ws.close();
  } finally {
    await srv.fechar();
  }
});
