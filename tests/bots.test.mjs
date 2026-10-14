// Jogadores do computador (server/bots.js): entrada e saída pelo pedido {t:'ia'},
// limite de 3 por time, vaga cedida a humano, nick "NOME (IA)" e se ele joga de
// verdade (caça monstro, compra na Evolução, derruba minerador inimigo, volta para
// consertar), sempre pelos mesmos comandos de um jogador.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../server/game.js';
import { NOMES, SUFIXO_IA } from '../server/bots.js';
import { MAX_POR_TIME } from '../server/partida.js';
import { BASES } from '../shared/terrain.js';
import { INPUT_VAZIO } from '../shared/sim.js';

/** Sorteio repetível, para a partida simulada dar sempre o mesmo resultado. */
function rngFixo(semente = 7) {
  let x = semente >>> 0;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 4294967296;
  };
}

/** Humano parado na base (o computador só existe com alguém na partida). */
function mundoComHumano(opcoes = {}) {
  const w = new World({ rng: rngFixo(), ...opcoes });
  const h = w.addPlayer('Humano', 'acron', 'assault');
  return { w, h };
}

/** Avança `s` segundos com o humano parado. Devolve os eventos. */
function rodar(w, h, s) {
  const eventos = [];
  for (let i = 0; i < s * 30; i++) {
    if (w.players.has(h.id)) h.fila.push({ seq: h.ack + h.fila.length + 1, inp: { ...INPUT_VAZIO } });
    w.step();
    eventos.push(...w.tirarEventos());
  }
  return eventos;
}

const NICK = new RegExp(`^(${NOMES.join('|')}) \\(IA\\)$`);

test('computador: entra no time pedido com nick "NOME (IA)", sem repetir nome', () => {
  const { w, h } = mundoComHumano();
  assert.equal(w.pedidoIa(h.id, { t: 'ia', acao: 'adicionar', lado: 'meu' }).ok, true);
  assert.equal(w.pedidoIa(h.id, { t: 'ia', acao: 'adicionar', lado: 'inimigo' }).ok, true);
  assert.equal(w.pedidoIa(h.id, { t: 'ia', acao: 'adicionar', lado: 'inimigo' }).ok, true);
  const bots = [...w.players.values()].filter((j) => j.ia);
  assert.equal(bots.length, 3);
  assert.deepEqual(bots.map((b) => b.time).sort(), [h.time, 1 - h.time, 1 - h.time].sort());
  for (const b of bots) {
    assert.match(b.nome, NICK);
    assert.ok(b.nome.endsWith(SUFIXO_IA));
  }
  assert.equal(new Set(bots.map((b) => b.nome)).size, 3, 'nomes diferentes');
  // O humano não consegue se passar por computador: o parêntese sai do nick.
  assert.equal(w.addPlayer('JOAO (IA)', 'acron', 'assault').nome, 'JOAO IA');
});

test('computador: no máximo 3 por time (contando os humanos), e só computador se tira', () => {
  const { w, h } = mundoComHumano();
  for (let k = 0; k < MAX_POR_TIME - 1; k++) assert.equal(w.pedidoIa(h.id, { t: 'ia', acao: 'adicionar', lado: 'meu' }).ok, true);
  assert.deepEqual(w.pedidoIa(h.id, { t: 'ia', acao: 'adicionar', lado: 'meu' }), { t: 'resultado', acao: 'ia', item: 'adicionar', ok: false, codigo: 'cheio' });
  for (let k = 0; k < MAX_POR_TIME; k++) assert.equal(w.pedidoIa(h.id, { t: 'ia', acao: 'adicionar', lado: 'inimigo' }).ok, true);
  assert.equal(w.pedidoIa(h.id, { t: 'ia', acao: 'adicionar', lado: 'inimigo' }).codigo, 'cheio');
  assert.equal(w.players.size, 2 * MAX_POR_TIME);
  assert.equal(w.pedidoIa(h.id, { t: 'ia', acao: 'adicionar', lado: 'outro' }).codigo, 'invalido');
  // Tirar: só computador.
  assert.equal(w.pedidoIa(h.id, { t: 'ia', acao: 'remover', id: h.id }).codigo, 'invalido');
  const bot = [...w.players.values()].find((j) => j.ia);
  assert.equal(w.pedidoIa(h.id, { t: 'ia', acao: 'remover', id: bot.id }).ok, true);
  assert.equal(w.players.has(bot.id), false);
  assert.equal(w.pedidoIa(999, { t: 'ia', acao: 'adicionar', lado: 'meu' }).codigo, 'invalido', 'quem não está na partida não pede');
});

test('computador: humano que chega com a partida cheia fica com a vaga de um computador', () => {
  const { w, h } = mundoComHumano();
  for (let k = 0; k < MAX_POR_TIME - 1; k++) w.pedidoIa(h.id, { t: 'ia', acao: 'adicionar', lado: 'meu' });
  for (let k = 0; k < MAX_POR_TIME; k++) w.pedidoIa(h.id, { t: 'ia', acao: 'adicionar', lado: 'inimigo' });
  const novo = w.addPlayer('Amigo', 'bellico', 'mobile');
  assert.ok(novo, 'entrou');
  // O time com menos humanos (o do outro lado, que só tinha computadores) cede a vaga.
  assert.equal(novo.time, 1 - h.time);
  assert.equal(w.players.size, 2 * MAX_POR_TIME);
  assert.equal([...w.players.values()].filter((j) => j.time === novo.time && j.ia).length, MAX_POR_TIME - 1);
  // Só humanos: aí a partida está cheia de verdade.
  const w2 = new World({ rng: rngFixo() });
  for (let k = 0; k < 2 * MAX_POR_TIME; k++) assert.ok(w2.addPlayer(`P${k}`, 'acron', 'assault'));
  assert.equal(w2.addPlayer('Sobra', 'acron', 'assault'), null);
});

test('computador: sai junto com o último humano, e a partida volta a esperar', () => {
  const { w, h } = mundoComHumano({ drones: 0, monstros: 0, elites: 0 });
  w.pedidoIa(h.id, { t: 'ia', acao: 'adicionar', lado: 'meu' });
  w.pedidoIa(h.id, { t: 'ia', acao: 'adicionar', lado: 'inimigo' });
  rodar(w, h, 1);
  assert.equal(w.partida.estado, 'andamento');
  const outro = w.addPlayer('Outro', 'acron', 'assault');
  w.removePlayer(h.id);
  assert.equal([...w.players.values()].filter((j) => j.ia).length, 2, 'ainda tem humano: ficam');
  w.removePlayer(outro.id);
  assert.equal(w.players.size, 0);
  w.step();
  assert.equal(w.partida.estado, 'esperando');
});

test('computador: o snapshot lista os jogadores dos dois times, com os computadores marcados', () => {
  const { w, h } = mundoComHumano({ drones: 0, monstros: 0, elites: 0 });
  w.pedidoIa(h.id, { t: 'ia', acao: 'adicionar', lado: 'inimigo' });
  w.step();
  const snap = w.snapshotPara(h, w.entidades(), []);
  assert.equal(snap.jogadores.length, 2);
  const bot = snap.jogadores.find((j) => j.ia);
  assert.equal(bot.time, 1 - h.time);
  assert.match(bot.nome, NICK);
  assert.equal(snap.jogadores.find((j) => j.id === h.id).ia, undefined);
  const ent = snap.ents.find((e) => e.id === bot.id);
  assert.equal(ent.tipo, 'jogador', 'na tela é uma nave de jogador como outra qualquer');
});

test('computador: joga pelos comandos de jogador e caça os monstros da jungle', () => {
  const { w, h } = mundoComHumano();
  w.pedidoIa(h.id, { t: 'ia', acao: 'adicionar', lado: 'meu' });
  const bot = [...w.players.values()].find((j) => j.ia);
  const eventos = rodar(w, h, 60);
  assert.ok(bot.ack > 0, 'os comandos dele passam pela fila, como os da rede');
  const abates = eventos.filter((e) => e.e === 'morte' && e.por === bot.id && ['arnosh', 'vorax', 'krakor'].includes(e.tipo));
  assert.ok(abates.length >= 2, `caçou ${abates.length} monstros em 60 s`);
  assert.ok(bot.ouro > 0 || Object.keys(bot.equip).length > 0, 'ganhou ouro');
  assert.ok(bot.nivel >= 2, `subiu de nível (está no ${bot.nivel})`);
});

test('computador: com nível e ouro, pousa na Evolução e compra a próxima nave', () => {
  const { w, h } = mundoComHumano({ drones: 0, monstros: 0, elites: 0 });
  w.pedidoIa(h.id, { t: 'ia', acao: 'adicionar', lado: 'meu' });
  const bot = [...w.players.values()].find((j) => j.ia);
  bot.nivel = 5;
  bot.ouro = 2000;
  const eventos = rodar(w, h, 40);
  assert.ok(eventos.some((e) => e.e === 'nave' && e.id === bot.id), 'comprou a nave');
  assert.equal(bot.tier, 1);
  assert.ok(bot.niveisArmas && Object.keys(bot.niveisArmas).length >= 1, 'evoluiu as armas na Loja');
  assert.ok(bot.equipado.escudo && bot.equip[bot.equipado.escudo] >= 1, 'comprou um escudo, e já está na nave');
  assert.ok(bot.ship.maxEscudo > 0, 'a nave tem escudo');
  assert.ok(bot.ouro < 2000);
});

test('computador: com nível, vai ao minério e derruba os mineradores do outro time', () => {
  const { w, h } = mundoComHumano({ drones: 0, monstros: 0, elites: 0, torretas: false });
  w.pedidoIa(h.id, { t: 'ia', acao: 'adicionar', lado: 'meu' });
  const bot = [...w.players.values()].find((j) => j.ia);
  bot.nivel = 8;
  const eventos = rodar(w, h, 90);
  const mineradores = eventos.filter((e) => e.e === 'morte' && e.por === bot.id && (e.tipo === 'minerador' || e.tipo === 'escolta'));
  assert.ok(mineradores.length >= 1, `derrubou ${mineradores.length} minerador(es)/escolta(s) do outro time`);
  assert.ok(mineradores.every((e) => e.time !== bot.time), 'só do outro time');
});

test('computador: com a vida baixa, volta para a base e conserta', () => {
  const { w, h } = mundoComHumano({ drones: 0, monstros: 0, elites: 0 });
  w.pedidoIa(h.id, { t: 'ia', acao: 'adicionar', lado: 'meu' });
  const bot = [...w.players.values()].find((j) => j.ia);
  rodar(w, h, 1);
  // Longe da base e quase sem vida.
  const base = BASES[bot.time];
  Object.assign(bot.ship, { x: 300, z: 0, vx: 0, vz: 0 });
  bot.ship.hp = bot.ship.maxHp * 0.15;
  // Volta (de recall: está longe e ninguém o ataca), pousa e conserta; depois sai de novo.
  let consertou = false;
  for (let t = 0; t < 30 && !consertou; t++) {
    rodar(w, h, 1);
    const naBase = Math.hypot(bot.ship.x - base.x, bot.ship.z - base.z) < base.raio;
    consertou = bot.vivo && naBase && bot.ship.hp / bot.ship.maxHp > 0.9;
  }
  assert.ok(consertou, 'chegou na base e consertou');
});

test('computador: distribui os pontos ao subir de nível e monta escudo, armadura e potenciadores', () => {
  const { w, h } = mundoComHumano({ drones: 0, monstros: 0, elites: 0 });
  w.pedidoIa(h.id, { t: 'ia', acao: 'adicionar', lado: 'meu' });
  const bot = [...w.players.values()].find((j) => j.ia);
  bot.nivel = 4; // sem nave nova para comprar: o ouro vai para a Loja
  bot.ouro = 4000;
  rodar(w, h, 40);
  const p = bot.pontos;
  assert.equal(p.energia + p.fisico + p.eletrico + p.laser, 40, 'gastou os 10 por nível');
  assert.equal(p.energia, 12, '30% na Energia');
  assert.ok(p.laser + p.fisico === 28, 'o resto no poder das armas dele');
  assert.ok(bot.equipado.escudo && bot.equipado.armadura, 'escudo e armadura na nave');
  assert.ok(bot.equipado.pot.every((k) => k), 'dois potenciadores na nave');
  assert.ok(bot.ship.maxEscudo > 0);
});
