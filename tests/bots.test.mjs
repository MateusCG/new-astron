// Jogadores do computador (server/bots.js): entrada e saída pelo pedido {t:'ia'},
// limite de 3 por time, vaga cedida a humano, nick "NOME (IA)" e se ele joga de
// verdade no mapa do Stage 6, sempre pelos mesmos comandos de um jogador: navega
// sem enroscar, faz o papel dele (lane, jungle, roamer), respeita as torres
// inimigas, vai aos chefes em grupo, recua com pouca vida, só vê o que o time vê, e
// uma partida inteira de computadores contra computadores roda sem erro.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../server/game.js';
import { NOMES, SUFIXO_IA, IA } from '../server/bots.js';
import { MAX_POR_TIME } from '../server/partida.js';
import { TORRETA } from '../server/torretas.js';
import { BASES, DOCAS, ACAMPAMENTOS, BUFFS, PLATAFORMAS_POUSO, NUCLEO, MEDUSA, ASTEROIDES, emAsteroides } from '../shared/terrain.js';
import { enxerga } from '../shared/visao.js';
import { definirObstaculoAtivo } from '../shared/obstaculos.js';
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

/** Mundo só de computadores: `n0` no time 0 e `n1` no time 1 (a partida começa com eles). */
function mundoDeBots(n0, n1, opcoes = {}) {
  const w = new World({ rng: rngFixo(), ...opcoes });
  const bots = [];
  for (let k = 0; k < Math.max(n0, n1); k++) {
    if (k < n0) bots.push(w.adicionarBot(0));
    if (k < n1) bots.push(w.adicionarBot(1));
  }
  return { w, bots };
}

/** Avança `s` segundos (só computadores), chamando `cada(eventos, tick)` a cada tick. */
function passar(w, s, cada = () => {}) {
  for (let i = 0; i < s * 30; i++) {
    w.step();
    if (cada(w.tirarEventos(), i) === false) return;
  }
}

/** A torre de pé do outro time cobre a nave (alcance e visão dela, a regra do computador)? */
function sobTorreInimiga(w, j) {
  const r = TORRETA.alcance + IA.torretaFolga;
  return w.torretas.lista.some((t) => t.viva && t.time !== j.time && enxerga(t.x, t.z, j.ship.x, j.ship.z, r));
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
  const { w, h } = mundoComHumano({ jungle: false });
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
  const { w, h } = mundoComHumano({ jungle: false });
  w.pedidoIa(h.id, { t: 'ia', acao: 'adicionar', lado: 'inimigo' });
  w.step();
  const snap = w.snapshotPara(h, w.entidades(), []);
  assert.equal(snap.jogadores.length, 2);
  const bot = snap.jogadores.find((j) => j.ia);
  assert.equal(bot.time, 1 - h.time);
  assert.match(bot.nome, NICK);
  assert.equal(snap.jogadores.find((j) => j.id === h.id).ia, undefined);
  // Na base dele o computador inimigo está fora da visão (névoa): perto do humano, aparece.
  const nave = w.players.get(bot.id).ship;
  Object.assign(nave, { x: h.ship.x + 100, z: h.ship.z });
  const ent = w.snapshotPara(h, w.entidades(), []).ents.find((e) => e.id === bot.id);
  assert.equal(ent.tipo, 'jogador', 'na tela é uma nave de jogador como outra qualquer');
});

test('computador: joga pelos comandos de jogador e caça os monstros da jungle', () => {
  // Os acampamentos aparecem logo (na partida de verdade, aos 0:45).
  const { w, h } = mundoComHumano({ temposJungle: { acampamento: { primeiroS: 1 } } });
  w.pedidoIa(h.id, { t: 'ia', acao: 'adicionar', lado: 'meu' });
  const bot = [...w.players.values()].find((j) => j.ia);
  const eventos = rodar(w, h, 60);
  assert.ok(bot.ack > 0, 'os comandos dele passam pela fila, como os da rede');
  const abates = eventos.filter((e) => e.e === 'morte' && e.por === bot.id && e.tipo === 'monstro');
  assert.ok(abates.length >= 2, `caçou ${abates.length} monstros em 60 s`);
  assert.ok(bot.ouro > 0 || bot.inv.length > 2, 'ganhou ouro');
  assert.ok(bot.nivel >= 2, `subiu de nível (está no ${bot.nivel})`);
});

test('computador: com nível e ouro, pousa na Evolução e compra a próxima nave', () => {
  const { w, h } = mundoComHumano({ jungle: false });
  w.pedidoIa(h.id, { t: 'ia', acao: 'adicionar', lado: 'meu' });
  const bot = [...w.players.values()].find((j) => j.ia);
  bot.nivel = 5;
  bot.ouro = 2000;
  const eventos = rodar(w, h, 40);
  assert.ok(eventos.some((e) => e.e === 'nave' && e.id === bot.id), 'comprou a nave');
  assert.equal(bot.tier, 1);
  assert.ok(bot.inv.some((x) => x.fabrica && x.nivel > 1), 'evoluiu as armas de fábrica (evoluirItem)');
  assert.ok(bot.ship.nivEnc.some((n) => n > 1), 'e a versão foi para a nave');
  const escudo = bot.inv.find((x) => x.id === bot.equipado.escudo);
  assert.equal(escudo?.tipo, 'equip', 'comprou um escudo e o pôs na nave (equipar)');
  assert.ok(bot.ship.maxEscudo > 0, 'a nave tem escudo');
  assert.ok(bot.ouro < 2000);
});

test('computador: com nível e sem torre cobrindo a doca deles, a lane vai lá e derruba os mineradores do outro time', () => {
  const { w, h } = mundoComHumano({ jungle: false, torretas: false });
  w.pedidoIa(h.id, { t: 'ia', acao: 'adicionar', lado: 'meu' });
  const bot = [...w.players.values()].find((j) => j.ia);
  bot.nivel = 8;
  const eventos = rodar(w, h, 90);
  const mineradores = eventos.filter((e) => e.e === 'morte' && e.por === bot.id && (e.tipo === 'minerador' || e.tipo === 'escolta'));
  assert.ok(mineradores.length >= 1, `derrubou ${mineradores.length} minerador(es)/escolta(s) do outro time`);
  assert.ok(mineradores.every((e) => e.time !== bot.time), 'só do outro time');
});

test('computador: com a vida baixa, volta para a base e conserta', () => {
  const { w, h } = mundoComHumano({ jungle: false });
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
  const { w, h } = mundoComHumano({ jungle: false });
  w.pedidoIa(h.id, { t: 'ia', acao: 'adicionar', lado: 'meu' });
  const bot = [...w.players.values()].find((j) => j.ia);
  bot.nivel = 4; // sem nave nova para comprar: o ouro vai para a Loja
  bot.ouro = 4000;
  rodar(w, h, 40);
  const p = bot.pontos;
  assert.equal(p.energia + p.fisico + p.eletrico + p.laser, 40, 'gastou os 10 por nível');
  assert.equal(p.energia, 12, '30% na Energia');
  assert.ok(p.laser + p.fisico === 28, 'o resto no poder das armas dele');
  const naNave = [bot.equipado.escudo, bot.equipado.armadura, ...bot.equipado.pot];
  assert.ok(naNave.every((id) => bot.inv.some((x) => x.id === id && x.tipo === 'equip')), 'escudo, armadura e dois potenciadores do inventário na nave');
  assert.ok(bot.inv.filter((x) => x.tipo === 'equip').every((x) => naNave.includes(x.id)), 'nada comprado ficou parado no compartimento');
  assert.ok(bot.ship.maxEscudo > 0);
});

test('computador: entra no nível 1 com a primeira nave e só compra a próxima com o nível dela (o ouro, o servidor cobra: naves.test.mjs)', () => {
  const { w, h } = mundoComHumano({ jungle: false });
  for (const lado of ['meu', 'meu', 'inimigo', 'inimigo']) w.pedidoIa(h.id, { t: 'ia', acao: 'adicionar', lado });
  const bots = [...w.players.values()].filter((j) => j.ia);
  assert.equal(bots.length, 4);
  for (const b of bots) {
    assert.equal(b.nivel, 1, b.nome);
    assert.equal(b.tier, 0, b.nome);
    assert.equal(b.ship.tier, 0, `${b.nome}: a nave em uso é a primeira da linha`);
    const ent = w.entidades().find((e) => e.id === b.id);
    assert.equal(ent?.tier, 0, `${b.nome}: o snapshot desenha a primeira nave`);
  }
  // Com ouro de sobra mas sem o nível 5, não compra.
  const [b] = bots;
  b.ouro = 5000;
  b.nivel = 4;
  const eventos = rodar(w, h, 40);
  assert.ok(!eventos.some((e) => e.e === 'nave' && e.id === b.id), 'sem o nível, não compra');
  assert.equal(b.tier, 0);
});

// ---------- Mapa do Stage 6: navegação, papéis, torres, chefes, visão ----------

test('computador: sai da base e chega à lane, à doca, aos acampamentos, aos buffs, aos poços e aos asteroides sem enroscar', () => {
  const { w, bots } = mundoDeBots(1, 1, { jungle: false, torretas: false });
  passar(w, 0.2); // a partida começa (cérebro novo)
  // Destinos no referencial do time 0; o do time 1 é o mesmo girado 180°.
  const lugares = [
    { nome: 'lane', x: -600, z: 40 },
    { nome: 'doca', x: DOCAS[0].x - 30, z: 0 },
    { nome: 'doca do outro lado', x: -DOCAS[0].x + 30, z: 0 }, // contorna a mineradora
    ...ACAMPAMENTOS.filter((a) => a.time === 0).map((a) => ({ nome: a.id, x: a.x, z: a.z })),
    ...BUFFS.filter((b) => b.time === 0).map((b) => ({ nome: b.id, x: b.x + 40, z: b.z })), // a torre de suporte é sólida
    ...PLATAFORMAS_POUSO.filter((p) => p.time === 0).map((p) => ({ nome: p.id, x: p.x, z: p.z })),
    { nome: 'poço do Núcleo', x: NUCLEO.x, z: NUCLEO.z },
    { nome: 'poço da Medusa', x: MEDUSA.x, z: MEDUSA.z },
    ...ASTEROIDES.filter((a) => a.id.startsWith('AC')).map((a) => ({ nome: a.id, x: a.x, z: a.z })),
  ];
  for (const lugar of lugares) {
    const alvos = bots.map((j) => (j.time === 0 ? { x: lugar.x, z: lugar.z } : { x: -lugar.x, z: -lugar.z }));
    for (const j of bots) {
      const b = BASES[j.time];
      Object.assign(j.ship, { x: b.x, z: b.z, vx: 0, vz: 0 });
      j.ia.ordem = alvos[bots.indexOf(j)];
      j.ia.rota = null;
    }
    let s = 0;
    const chegou = () => bots.every((j, k) => Math.hypot(j.ship.x - alvos[k].x, j.ship.z - alvos[k].z) < 30);
    passar(w, 75, () => {
      s++;
      return !chegou();
    });
    for (const [k, j] of bots.entries()) {
      const d = Math.hypot(j.ship.x - alvos[k].x, j.ship.z - alvos[k].z);
      assert.ok(d < 30, `time ${j.time} chegou em ${lugar.nome} (ficou a ${d.toFixed(0)} m, em ${j.ship.x.toFixed(0)}, ${j.ship.z.toFixed(0)})`);
    }
  }
  for (const j of bots) assert.equal(j.ia.enroscos, 0, `${j.nome} não enroscou em quina nenhuma`);
});

test('computador: o da jungle limpa os acampamentos do território, os da base primeiro', () => {
  const { w, bots } = mundoDeBots(2, 0, { temposJungle: { acampamento: { primeiroS: 1 }, ataque: { primeiroS: 9999 }, sonda: { primeiroS: 9999 }, medusa: { primeiroS: 9999 } }, torretas: false });
  const jungle = bots[1];
  const limpos = [];
  let abates = 0;
  passar(w, 120, (ev) => {
    for (const e of ev) if (e.e === 'morte' && e.por === jungle.id && e.tipo === 'monstro') abates++;
    for (const c of w.jungle.covis) if (c.tipo === 'acampamento' && c.estado === 'recarga' && !limpos.includes(c.id)) limpos.push(c.id);
  });
  assert.equal(jungle.ia.papel, 'jungle');
  assert.ok(abates >= 4, `o da jungle matou ${abates} monstros`);
  assert.ok(limpos.length >= 2, `acampamentos limpos: ${limpos.join(', ')}`);
  const tipo = (id) => ACAMPAMENTOS.find((a) => a.id === id);
  assert.ok(limpos.every((id) => tipo(id).time === 0), 'só os do território do time');
  assert.equal(tipo(limpos[0]).tipo, 'base', `o primeiro limpo (${limpos[0]}) é o perto da base`);
});

test('computador: não entra no alcance da torre inimiga sozinho; caídas as torres perto da mineradora, derruba os mineradores na doca deles', () => {
  const { w, bots } = mundoDeBots(1, 0, { jungle: false });
  const [lane] = bots;
  lane.nivel = 8;
  try {
    let sob = 0;
    let levou = 0;
    passar(w, 120, (ev) => {
      if (sobTorreInimiga(w, lane)) sob++;
      for (const e of ev) if (e.e === 'acerto' && e.alvo === lane.id && e.dano > 0) levou++;
    });
    assert.equal(lane.ia.papel, 'lane');
    assert.equal(sob, 0, 'nunca ficou no alcance de uma torre de pé do outro time');
    assert.equal(levou, 0, 'nem levou tiro');
    // Caem as duas torres do outro time perto da mineradora: a doca deles fica livre.
    for (const t of w.torretas.lista) {
      if (t.time === 0 || Math.abs(t.x) > 500) continue;
      Object.assign(t, { viva: false, hp: 0 });
      definirObstaculoAtivo(t.id, false);
    }
    let mineradores = 0;
    passar(w, 120, (ev) => {
      for (const e of ev) if (e.e === 'morte' && e.por === lane.id && e.tipo === 'minerador') mineradores++;
    });
    assert.ok(mineradores >= 1, `derrubou ${mineradores} minerador(es) na doca deles`);
  } finally {
    w.torretas.reiniciar();
  }
});

test('computador: no alcance da torre inimiga e com pouca vida, sai dele primeiro e só então volta para a base', () => {
  const { w, bots } = mundoDeBots(1, 0, { jungle: false });
  const [j] = bots;
  passar(w, 1);
  // Encostado na torre T1-1 do outro time, quase sem vida.
  const t = w.torretas.lista.find((x) => x.time === 1 && Math.abs(x.x) < 500);
  Object.assign(j.ship, { x: t.x - 120, z: t.z, vx: 0, vz: 0 });
  j.ship.hp = j.ship.maxHp * 0.25;
  assert.ok(sobTorreInimiga(w, j));
  let saiu = false;
  passar(w, 15, () => {
    if (!sobTorreInimiga(w, j)) saiu = true;
    return !saiu && j.vivo;
  });
  assert.ok(saiu, 'saiu do alcance da torre');
  assert.ok(j.vivo, 'vivo');
});

test('computador: o time vai junto à Medusa (reúne e só ataca com o grupo); sozinho, não vai', () => {
  const tempos = { acampamento: { primeiroS: 9999 }, ataque: { primeiroS: 9999 }, sonda: { primeiroS: 9999 }, medusa: { primeiroS: 1 } };
  const { w, bots } = mundoDeBots(3, 0, { temposJungle: tempos, torretas: false });
  for (const j of bots) j.nivel = IA.medusaNivel + 1;
  let primeiro = null; // quantos computadores perto da Medusa no primeiro tiro nela
  passar(w, 120, (ev) => {
    const medusa = w.monstros.find((m) => m.esp === 'medusa');
    for (const e of ev) {
      if (primeiro !== null || e.e !== 'acerto' || e.alvo !== medusa?.id) continue;
      primeiro = bots.filter((j) => j.vivo && Math.hypot(j.ship.x - MEDUSA.x, j.ship.z - MEDUSA.z) < 500).length;
    }
    return primeiro === null;
  });
  assert.ok(primeiro !== null, 'foram e atacaram a Medusa');
  assert.ok(primeiro >= IA.epicoMin, `no primeiro tiro havia ${primeiro} computadores do time perto dela`);

  // Um computador só no time: não encara a Medusa.
  const solo = mundoDeBots(1, 0, { temposJungle: tempos, torretas: false });
  solo.bots[0].nivel = IA.medusaNivel + 5;
  let tiros = 0;
  let perto = 0;
  passar(solo.w, 60, (ev) => {
    const medusa = solo.w.monstros.find((m) => m.esp === 'medusa');
    for (const e of ev) if (e.e === 'acerto' && e.alvo === medusa?.id) tiros++;
    const s = solo.bots[0].ship;
    if (Math.hypot(s.x - MEDUSA.x, s.z - MEDUSA.z) < 300) perto++;
  });
  assert.equal(tiros, 0, 'sozinho, não atira nela');
  assert.equal(perto, 0, 'nem chega ao alcance dela');
});

test('computador: só vê o inimigo que o time vê (escondido no campo de asteroides, não; fora dele, sim)', () => {
  const w = new World({ rng: rngFixo(), jungle: false, torretas: false });
  const bot = w.adicionarBot(0);
  const h = w.addPlayer('Humano', 'acron', 'assault');
  assert.equal(h.time, 1);
  let seq = 0;
  const parado = (x, z) => {
    Object.assign(h.ship, { x, z, vx: 0, vz: 0 });
    h.protegidoAte = 0;
  };
  const andar = (s, cada) => {
    for (let i = 0; i < s * 30; i++) {
      h.fila.push({ seq: ++seq, inp: { ...INPUT_VAZIO } });
      w.step();
      cada?.(w.tirarEventos());
    }
  };
  andar(3);
  // Dentro do campo de asteroides central do time 0, a ~230 m do posto da lane (mais
  // perto que IA.visaoJogador): de fora do campo ninguém o vê.
  const esconderijo = { x: -120, z: -275 };
  assert.ok(emAsteroides(esconderijo.x, esconderijo.z));
  let mirou = false;
  let feriu = false;
  const olhar = (ev) => {
    if (bot.ia.alvo === h) mirou = true;
    for (const e of ev) if (e.e === 'acerto' && e.alvo === h.id && e.dano > 0) feriu = true;
  };
  // A lane escolta o primeiro minerador até a doca (uns 40 s) e fica no posto, perto.
  let maisPerto = Infinity;
  for (let k = 0; k < 50; k++) {
    parado(esconderijo.x, esconderijo.z);
    andar(1, olhar);
    const d = Math.hypot(bot.ship.x - esconderijo.x, bot.ship.z - esconderijo.z);
    maisPerto = Math.min(maisPerto, d);
    assert.ok(d > 60, `o computador ficou longe do campo (a ${d.toFixed(0)} m)`);
  }
  assert.ok(maisPerto < IA.visaoJogador, `chegou perto (${maisPerto.toFixed(0)} m): à vista, seria briga`);
  assert.equal(mirou, false, 'não mirou em quem o time não vê');
  assert.equal(feriu, false, 'nem atirou');
  // Fora do campo, à vista: vira briga.
  for (let k = 0; k < 6 && !mirou; k++) {
    parado(-60, -190);
    andar(1, olhar);
  }
  assert.ok(mirou, 'à vista, ele briga');
});

test('computador: partida acelerada de 3 contra 3 computadores termina sem erro, com abates, minério dos dois times e objetivos tomados', (t) => {
  const { w, bots } = mundoDeBots(3, 3, {
    duracaoPartidaS: 420,
    intervaloFimS: 3,
    faseFinalS: 60,
    temposJungle: {
      acampamento: { primeiroS: 15, voltaS: 45 },
      ataque: { primeiroS: 60, voltaS: 120 },
      sonda: { primeiroS: 90, voltaS: 60 },
      medusa: { primeiroS: 180, voltaS: 150 },
    },
    objetivos: { suporte: { primeiroS: 45, voltaS: 120 }, plataforma: { primeiroS: 60, recargaS: 75 }, nucleo: { aparicoesS: [210, 330] } },
  });
  assert.deepEqual(bots.map((j) => j.time).sort(), [0, 0, 0, 1, 1, 1]);
  const papeis = new Set();
  const objetivos = [];
  let abatesJogador = 0;
  let mineradores = 0;
  let fim = null;
  let custo = 0;
  const passo = w.bots.passo.bind(w.bots);
  w.bots.passo = () => {
    const a = performance.now();
    passo();
    custo += performance.now() - a;
  };
  let ticks = 0;
  passar(w, 430, (ev) => {
    ticks++;
    for (const j of bots) if (j.ia.papel) papeis.add(`${j.time}:${j.ia.papel}`);
    for (const e of ev) {
      if (e.e === 'morte' && e.tipo === 'jogador' && w.players.get(e.por)) abatesJogador++;
      if (e.e === 'morte' && e.tipo === 'minerador' && w.players.get(e.por)) mineradores++;
      if (e.e === 'objetivo' && (e.acao === 'tomado' || e.acao === 'coletou')) objetivos.push(e.id);
      if (e.e === 'fimPartida') fim = e;
    }
    return !fim;
  });
  const porPasso = custo / ticks;
  t.diagnostic(`placar ${fim?.placar}, ${abatesJogador} abates de jogador, ${mineradores} mineradores derrubados, objetivos ${objetivos.join(' ')}; IA ${porPasso.toFixed(3)} ms por passo`);
  assert.ok(fim, 'a partida terminou');
  assert.equal(papeis.size, 6, `os três papéis nos dois times: ${[...papeis].join(', ')}`);
  assert.ok(fim.placar[0] > 0 && fim.placar[1] > 0, `os dois times entregaram minério (${fim.placar})`);
  assert.ok(abatesJogador + mineradores >= 3, 'houve briga');
  assert.ok(objetivos.length >= 4, `objetivos tomados: ${objetivos.join(', ')}`);
  assert.ok(new Set(objetivos).size >= 3, 'de tipos diferentes');
  assert.ok(bots.every((j) => j.nivel >= 3), 'todos subiram de nível');
  assert.ok(porPasso < 2, `a IA dos seis custa ${porPasso.toFixed(3)} ms por passo`);
});
