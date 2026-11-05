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

test('filas: procurando, cada um já vê o seu grupo chegando, o time às claras e a nave mudando na hora', () => {
  const { filas, cliente, ultima } = montar();
  const a = cliente('Mateus');
  const b = cliente('Tereza');
  entrar(filas, a, 'publica', { race: 'bellico' });
  entrar(filas, b, 'publica');
  for (const [eu, outro] of [[a, b], [b, a]]) {
    const m = ultima(eu);
    assert.equal(m.estado, 'procurando');
    assert.equal(m.n, 2);
    const meu = m.times[m.voce.time];
    assert.deepEqual(meu.map((x) => x.nome).sort(), ['Mateus', 'Tereza'], 'os dois no mesmo time');
    assert.ok(meu.find((x) => x.nome === eu.nome).voce);
    assert.ok(meu.find((x) => x.nome === outro.nome).race, 'a nave do companheiro aparece');
  }
  filas.escolher(b, { race: 'shrewdo', classe: 'functional' });
  const visto = ultima(a).times[0].find((x) => x.nome === 'Tereza');
  assert.deepEqual([visto.race, visto.classe], ['shrewdo', 'functional']);
});

test('filas: no 3 contra 3 quem chega vai para o time com menos gente e a sala mantém os times', () => {
  let lugar = false;
  const { filas, cliente, ultima } = montar({ podeAbrirSala: () => lugar });
  const cs = 'ABCDEFG'.split('').map(cliente);
  for (const c of cs.slice(0, 4)) entrar(filas, c, 'online');
  const a = ultima(cs[0]);
  assert.deepEqual(a.times[a.voce.time].map((x) => x.nome), ['A', 'C']);
  assert.deepEqual(a.times[1 - a.voce.time].map((x) => x.nome), ['B', 'D']);
  assert.ok(a.times[1 - a.voce.time].every((x) => x.race === undefined), 'o outro time às cegas');
  const b = ultima(cs[1]);
  assert.deepEqual(b.times[b.voce.time].map((x) => x.nome), ['B', 'D']);
  for (const c of cs.slice(4)) entrar(filas, c, 'online');
  const g = ultima(cs[6]);
  assert.equal(g.n, 1, 'o sétimo já é do grupo da sala seguinte');
  assert.deepEqual(g.times.flat().map((x) => x.nome), ['G']);
  lugar = true;
  filas.passo();
  const sala = ultima(cs[0]);
  assert.equal(sala.estado, 'sala');
  assert.deepEqual(sala.times[sala.voce.time].map((x) => x.nome), ['A', 'C', 'E'], 'os mesmos times da fila');
});

test('filas: no 3 contra 3 o piloto troca de time na fila clicando numa vaga livre do outro', () => {
  let lugar = false;
  const { filas, cliente, ultima } = montar({ podeAbrirSala: () => lugar });
  const [a, b, c, d, e, f] = 'ABCDEF'.split('').map(cliente);
  entrar(filas, a, 'online');
  assert.equal(ultima(a).voce.time, 0, 'o primeiro vai para o verde');
  assert.equal(filas.trocarTime(a), null);
  assert.equal(ultima(a).voce.time, 1, 'trocou para o vermelho');
  entrar(filas, b, 'online');
  assert.equal(ultima(b).voce.time, 0, 'quem chega vai para o que tem menos gente');
  assert.deepEqual(ultima(a).times[1].map((x) => x.nome), ['A']);
  assert.deepEqual(ultima(a).times[0].map((x) => [x.nome, x.race]), [['B', undefined]], 'o outro time às cegas');
  // B vai para o vermelho também: os dois juntos, com a nave um do outro.
  filas.trocarTime(b);
  assert.deepEqual(ultima(a).times[1].map((x) => [x.nome, !!x.race]), [['A', true], ['B', true]]);
  assert.equal(ultima(a).times[0].length, 0);
  for (const x of [c, d, e]) entrar(filas, x, 'online');
  assert.deepEqual(ultima(a).times.map((t) => t.map((x) => x.nome)), [['C', 'D', 'E'], ['A', 'B']]);
  assert.equal(filas.trocarTime(c), null, 'o vermelho ainda tem vaga');
  // Vermelho cheio (A, B, C): ninguém do verde entra nele.
  assert.deepEqual(ultima(c).times[1].map((x) => x.nome).sort(), ['A', 'B', 'C']);
  assert.equal(filas.trocarTime(d), 'cheio');
  // O sexto completa 3 contra 3 e a sala fecha com os times escolhidos.
  lugar = true;
  entrar(filas, f, 'online');
  const s = ultima(a);
  assert.equal(s.estado, 'sala');
  assert.deepEqual(s.times[1].map((x) => x.nome).sort(), ['A', 'B', 'C']);
  assert.deepEqual(s.times[0].map((x) => x.nome).sort(), ['D', 'E', 'F']);
  assert.equal(filas.trocarTime(a), 'fora', 'na sala não troca mais');
  // Desfeita a sala (alguém sai), os outros voltam à fila no time em que estavam.
  filas.sair(f);
  assert.equal(ultima(a).estado, 'procurando');
  assert.equal(ultima(a).voce.time, 1);
  assert.equal(ultima(d).voce.time, 0);
  // Na pública não há troca.
  const p = cliente('P');
  entrar(filas, p, 'publica');
  assert.equal(filas.trocarTime(p), 'invalido');
});

test('filas: nunca 4 num time; quem sobra ou troca para um time cheio vai para a sala seguinte, sem empurrar ninguém', () => {
  let lugar = false;
  const { filas, cliente, ultima } = montar({ podeAbrirSala: () => lugar });
  const cs = 'ABCDEFGH'.split('').map(cliente);
  const [A, B, C, D, E, F, G, H] = cs;
  // A, C, E no verde e B, D, F no vermelho (o servidor está sem lugar: a sala espera).
  for (const c of [A, B, C, D, E, F]) entrar(filas, c, 'online');
  // G chega com 3 e 3: vai para o verde, mas como 4º dele é da sala seguinte.
  entrar(filas, G, 'online');
  assert.equal(ultima(G).voce.time, 0);
  assert.deepEqual(ultima(G).times.map((t) => t.map((x) => x.nome)), [['G'], []], 'G está sozinho na sala seguinte');
  assert.deepEqual(ultima(A).times.map((t) => t.map((x) => x.nome)), [['A', 'C', 'E'], ['B', 'D', 'F']]);
  // Da sala da frente ninguém troca para um time cheio.
  assert.equal(filas.trocarTime(B), 'cheio');
  // G troca para o vermelho: vai para o fim dele, ainda na sala seguinte; F não sai da sala dele.
  assert.equal(filas.trocarTime(G), null);
  assert.deepEqual(ultima(F).times[1].map((x) => x.nome), ['B', 'D', 'F']);
  assert.deepEqual(ultima(G).times.map((t) => t.map((x) => x.nome)), [[], ['G']]);
  // H chega: o verde tem menos gente, vai para a sala seguinte junto de G, do outro lado.
  entrar(filas, H, 'online');
  assert.deepEqual(ultima(H).times.map((t) => t.map((x) => x.nome)), [['H'], ['G']]);
  // Abriu lugar: a sala da frente fecha com os 3 e 3 dela; G e H continuam na fila.
  lugar = true;
  filas.passo();
  assert.equal(ultima(A).estado, 'sala');
  assert.deepEqual(ultima(A).times.map((t) => t.length), [3, 3]);
  assert.equal(ultima(G).estado, 'procurando');
  // Agora G e H são a sala da frente: H troca para o vermelho (tem vaga), G e H juntos.
  assert.equal(filas.trocarTime(H), null);
  assert.deepEqual(ultima(G).times.map((t) => t.map((x) => x.nome)), [[], ['G', 'H']]);
});

test('filas: com entradas, trocas e saídas ao acaso, nenhuma sala nem grupo passa de 3 num time', () => {
  let lugar = true;
  const { filas, cliente, caixas } = montar({ podeAbrirSala: () => lugar });
  let k = 7;
  const sorte = () => ((k = (k * 1103515245 + 12345) % 2147483648) / 2147483648);
  const clientes = [];
  for (let passo = 0; passo < 3000; passo++) {
    lugar = sorte() < 0.3;
    const r = sorte();
    if (r < 0.35 || clientes.length === 0) {
      const c = cliente(`P${passo}`);
      clientes.push(c);
      entrar(filas, c, 'online');
    } else if (r < 0.75) filas.trocarTime(clientes[Math.floor(sorte() * clientes.length)]);
    else if (r < 0.9) {
      const c = clientes.splice(Math.floor(sorte() * clientes.length), 1)[0];
      filas.esquecer(c);
    } else filas.pronto(clientes[Math.floor(sorte() * clientes.length)]);
    for (const [c, msgs] of caixas) {
      const m = msgs.at(-1);
      if (m?.t !== 'fila' || !m.times) continue;
      assert.ok(m.times.every((t) => t.length <= 3), `passo ${passo}: ${c.nome} vê ${m.times.map((t) => t.length)}`);
    }
    for (const sala of filas.salas.values()) {
      assert.deepEqual([0, 1].map((t) => sala.membros.filter((x) => x.time === t).length), [3, 3], `passo ${passo}: sala com times de 3`);
    }
  }
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

test('filas: no 3 contra 3, um em cada time já pode apertar Pronto e, todos prontos, a partida começa só com os dois', () => {
  const { filas, cliente, ultima, salas } = montar();
  const a = cliente('Mateus');
  const b = cliente('Colega');
  entrar(filas, a, 'online');
  assert.equal(ultima(a).cedo, undefined, 'sozinho no grupo, ainda não');
  assert.equal(filas.pronto(a), 'cedo');
  entrar(filas, b, 'online');
  assert.deepEqual([ultima(a).cedo, ultima(b).cedo], [1, 1], 'um no verde e um no vermelho: dá para começar');
  assert.equal(filas.pronto(a, { race: 'bellico', classe: 'mobile' }), null);
  assert.deepEqual([ultima(a).voce.pronto, ultima(b).times[0][0].pronto], [1, 1], 'o Pronto aparece para o outro');
  assert.equal(filas.escolher(a, { race: 'shrewdo' }), 'travada', 'o Pronto trava a nave');
  assert.equal(filas.trocarTime(a), 'travada', 'e o time');
  assert.equal(salas.length, 0);
  filas.pronto(b);
  assert.equal(salas.length, 1, 'os dois prontos: começou');
  const [sala] = salas;
  assert.equal(sala.modo, 'online');
  assert.deepEqual(sala.membros.map((m) => [m.nome, m.time]), [['Mateus', 0], ['Colega', 1]]);
  assert.deepEqual([sala.membros[0].race, sala.membros[0].classe], ['bellico', 'mobile'], 'a escolha final vai junto do Pronto');
  for (const c of [a, b]) assert.equal(ultima(c).estado, 'comecar');
  assert.deepEqual(filas.contagem().online, { fila: 0, escolhendo: 0, jogando: 0, precisa: 6 });
  // Quem procura depois cai num grupo novo.
  const c = cliente('Terceiro');
  entrar(filas, c, 'online');
  assert.deepEqual([ultima(c).n, ultima(c).cedo], [1, undefined]);
});

test('filas: quem chega no grupo antes de começar também precisa do Pronto; quem sai deixa os prontos começarem', () => {
  const { filas, cliente, ultima, salas } = montar();
  const [a, b, c] = ['A', 'B', 'C'].map(cliente);
  entrar(filas, a, 'online');
  entrar(filas, b, 'online');
  filas.pronto(a);
  entrar(filas, c, 'online'); // verde, com A
  filas.pronto(b);
  assert.equal(salas.length, 0, 'C ainda não apertou');
  assert.match(String(ultima(c).times[0].map((m) => m.pronto)), /1,0/);
  filas.sair(c);
  assert.equal(salas.length, 1, 'C saiu: A e B prontos, começa');
  assert.deepEqual(salas[0].membros.map((m) => m.nome), ['A', 'B']);
});

test('filas: 2 contra 1 também começa, e completar 3 contra 3 vira a sala com quem já estava pronto', () => {
  const { filas, cliente, salas } = montar();
  const cs = 'ABC'.split('').map(cliente);
  for (const c of cs) entrar(filas, c, 'online'); // A e C verdes, B vermelho
  for (const c of cs) filas.pronto(c);
  assert.equal(salas.length, 1);
  assert.deepEqual(salas[0].membros.map((m) => [m.nome, m.time]), [['A', 0], ['C', 0], ['B', 1]]);

  // Cinco na fila, dois prontos, e o sexto chega antes do resto apertar.
  const { filas: f, cliente: cl, ultima: u, salas: s } = montar();
  const gs = 'GHIJKL'.split('').map(cl);
  for (const c of gs.slice(0, 5)) entrar(f, c, 'online');
  f.pronto(gs[0]);
  f.pronto(gs[1]);
  entrar(f, gs[5], 'online');
  const m = u(gs[0]);
  assert.equal(m.estado, 'sala', 'o sexto fechou a sala de sempre, com o contador');
  assert.equal(m.restante, SELECAO_S);
  assert.equal(m.prontos, 2, 'quem já estava pronto continua pronto');
  assert.equal(s.length, 0);
});

test('filas: na pública, com 2 pilotos no grupo o Pronto já vale e os dois começam juntos', () => {
  const { filas, cliente, ultima, salas } = montar();
  const [a, b, c] = ['A', 'B', 'C'].map(cliente);
  entrar(filas, a, 'publica');
  assert.equal(ultima(a).cedo, undefined, 'sozinho, ainda não');
  assert.equal(filas.pronto(a), 'cedo');
  entrar(filas, b, 'publica');
  assert.deepEqual([ultima(a).cedo, ultima(b).cedo], [1, 1], 'dois no grupo: dá para começar');
  assert.equal(filas.pronto(a, { race: 'bellico' }), null);
  assert.equal(filas.escolher(a, { race: 'shrewdo' }), 'travada');
  assert.equal(salas.length, 0, 'B ainda não apertou');
  filas.pronto(b);
  assert.equal(salas.length, 1, 'os dois prontos: começou');
  const [sala] = salas;
  assert.equal(sala.modo, 'publica');
  assert.deepEqual(sala.membros.map((m) => m.nome), ['A', 'B']);
  assert.equal(sala.membros[0].race, 'bellico');
  assert.equal(sala.membros[0].time, sala.membros[1].time, 'os dois no mesmo time');
  for (const x of [a, b]) assert.equal(ultima(x).estado, 'comecar');
  // Quem procura depois cai num grupo novo.
  entrar(filas, c, 'publica');
  assert.deepEqual([ultima(c).n, ultima(c).cedo], [1, undefined]);
});

test('filas: na pública, o terceiro que chega antes do Pronto de todos fecha a sala de sempre', () => {
  const { filas, cliente, ultima, salas } = montar();
  const [a, b, c] = ['A', 'B', 'C'].map(cliente);
  entrar(filas, a, 'publica');
  entrar(filas, b, 'publica');
  filas.pronto(a);
  entrar(filas, c, 'publica');
  assert.equal(ultima(a).estado, 'sala');
  assert.equal(ultima(a).prontos, 1, 'quem já estava pronto continua pronto');
  assert.equal(salas.length, 0);
});

test('filas: sem lugar para outro mundo os prontos esperam, e começam quando abre', () => {
  let lugar = false;
  const { filas, cliente, salas } = montar({ podeAbrirSala: () => lugar });
  const [a, b] = ['A', 'B'].map(cliente);
  entrar(filas, a, 'online');
  entrar(filas, b, 'online');
  filas.pronto(a);
  filas.pronto(b);
  assert.equal(salas.length, 0);
  lugar = true;
  filas.passo();
  assert.equal(salas.length, 1);
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
    const js = [...mundo.world.players.values()];
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
    assert.equal([...mundo.world.players.values()].filter((j) => j.time === comecos[0].time).length, 3);
    jogos[1].ws.close();
    jogos[2].ws.close();
    await new Promise((ok) => setTimeout(ok, 100));
    assert.ok(!srv.mundos.has(mundo));
  } finally {
    await srv.fechar();
  }
});

test('filas: pela rede, 2 pilotos prontos na pública jogam juntos, com um computador no time e 3 no outro', async () => {
  const principal = new World({ preparacaoS: 0, jungle: false, torretas: false });
  const srv = await iniciar({ porta: 0, world: principal });
  try {
    const menus = ['Ana', 'Bia'].map(() => conectar(srv.porta));
    await Promise.all(menus.map((m) => m.aberto));
    ['Ana', 'Bia'].forEach((nome, i) => menus[i].enviar({ t: 'entrarFila', modo: 'publica', nome, race: 'acron', classe: 'assault' }));
    await Promise.all(menus.map((m) => m.esperar((x) => x.t === 'fila' && x.estado === 'procurando' && x.cedo)));
    menus.forEach((m) => m.enviar({ t: 'pronto' }));
    const comecos = await Promise.all(menus.map((m) => m.esperar((x) => x.t === 'fila' && x.estado === 'comecar')));
    for (const m of menus) m.ws.close();

    const jogos = comecos.map(() => conectar(srv.porta));
    await Promise.all(jogos.map((j) => j.aberto));
    jogos.forEach((j, i) => j.enviar({ t: 'entrar', sala: comecos[i].sala, token: comecos[i].token }));
    const boas = await Promise.all(jogos.map((j) => j.esperar((x) => x.t === 'bemvindo' || x.t === 'erro')));
    for (const b of boas) assert.equal(b.t, 'bemvindo');
    const time = comecos[0].time;
    assert.equal(comecos[1].time, time);
    const mundo = [...srv.mundos.keys()].find((w) => w.modo === 'publica');
    const js = [...mundo.world.players.values()];
    assert.deepEqual(js.filter((j) => !j.ia).map((j) => j.nome).sort(), ['Ana', 'Bia']);
    assert.equal(js.filter((j) => j.ia && j.time === time).length, 1, 'um computador completa o time dos dois');
    assert.equal(js.filter((j) => j.ia && j.time !== time).length, 3, '3 computadores no outro time');
    for (const j of jogos) j.ws.close();
  } finally {
    await srv.fechar();
  }
});

test('filas: pela rede, dois colegas no Jogar New Astron jogam 1 contra 1, sem computadores', async () => {
  const principal = new World({ preparacaoS: 0, jungle: false, torretas: false });
  const srv = await iniciar({ porta: 0, world: principal });
  try {
    const menus = [conectar(srv.porta), conectar(srv.porta)];
    await Promise.all(menus.map((m) => m.aberto));
    ['Mateus', 'Colega'].forEach((nome, i) => menus[i].enviar({ t: 'entrarFila', modo: 'online', nome, race: 'acron', classe: 'assault' }));
    await Promise.all(menus.map((m) => m.esperar((x) => x.t === 'fila' && x.cedo === 1)));
    menus.forEach((m) => m.enviar({ t: 'pronto' }));
    const comecos = await Promise.all(menus.map((m) => m.esperar((x) => x.t === 'fila' && x.estado === 'comecar')));
    for (const m of menus) m.ws.close();
    assert.deepEqual(comecos.map((c) => c.time).sort(), [0, 1]);

    const jogos = comecos.map(() => conectar(srv.porta));
    await Promise.all(jogos.map((j) => j.aberto));
    jogos.forEach((j, i) => j.enviar({ t: 'entrar', sala: comecos[i].sala, token: comecos[i].token }));
    const boas = await Promise.all(jogos.map((j) => j.esperar((x) => x.t === 'bemvindo' || x.t === 'erro')));
    assert.deepEqual(boas.map((b) => [b.t, b.modo]), [['bemvindo', 'online'], ['bemvindo', 'online']]);
    const mundo = [...srv.mundos.keys()].find((w) => w.modo === 'online');
    const js = [...mundo.world.players.values()];
    assert.deepEqual(js.map((j) => [j.nome, j.time, !!j.ia]).sort(), [['Colega', 1, false], ['Mateus', 0, false]], 'só os dois, um em cada time');
    for (const j of jogos) j.ws.close();
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
