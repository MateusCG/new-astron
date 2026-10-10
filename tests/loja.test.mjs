// Loja da base (shared/loja.js + server/servicos.js): só compra pousado e parado na
// Loja da própria base e com ouro; armas compradas nos dois encaixes; posse no
// jogador (sobrevive ao renascimento, zera na partida nova); armadura; itens com
// recarga e limite; pedido malformado não quebra nada.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { World, ZONA_SEGURA } from '../server/game.js';
import { iniciar } from '../server/index.js';
import { hpMaxDoNivel } from '../server/progressao.js';
import { createShip, IDX_ARMA, ARMAS_INICIAIS, WEAPONS, RACES, DT } from '../shared/sim.js';
import { BASE, SERVICOS, CORREDOR } from '../shared/terrain.js';
import { ARMADURAS, ITENS, PRECO_ARMA, ARMAS_A_VENDA, REPARO_CURA, ITEM_CARGA_MAX } from '../shared/loja.js';

const SEGUNDO = 30;
const { laser, plasma, missil, emp } = IDX_ARMA;

/** Põe a nave de `j` pousada e parada no centro da plataforma `servico` do time `time`. */
function pousar(j, servico, time = j.time) {
  const sv = SERVICOS.find((s) => s.servico === servico && s.time === time);
  Object.assign(j.ship, { x: sv.x, z: sv.z, vx: 0, vz: 0, pousado: true });
}

function mundo() {
  const w = new World({ drones: 0, monstros: 0, elites: 0 });
  w.mineradores.passo = () => {};
  return w;
}

const comprar = (w, j, item) => w.pedido(j.id, { t: 'comprar', item });
const usar = (w, j, item) => w.pedido(j.id, { t: 'usar', item });

test('loja: catálogo com as 8 armas que não são de fábrica, mais caras as mais fortes', () => {
  assert.equal(ARMAS_A_VENDA.length, 8);
  for (const i of ARMAS_INICIAIS) assert.ok(!ARMAS_A_VENDA.includes(i), 'arma de fábrica não se vende');
  assert.ok(PRECO_ARMA.missil > PRECO_ARMA.laserDuplo);
  assert.ok(PRECO_ARMA.emp > PRECO_ARMA.crio);
  assert.ok(ARMADURAS[0].preco < ARMADURAS[1].preco && ARMADURAS[1].preco < ARMADURAS[2].preco);
  assert.ok(ARMADURAS[2].velMult < 1, 'a pesada custa velocidade');
});

test('loja: só compra pousado e parado na Loja da própria base, e com ouro', () => {
  const w = mundo();
  const j = w.addPlayer('A', 'bellico');
  j.ouro = 1000;
  assert.deepEqual(comprar(w, j, 'missil'), { t: 'resultado', acao: 'comprar', item: 'missil', ok: false, codigo: 'nao_pousado' }, 'voando na base');

  pousar(j, 'evolucao');
  assert.equal(comprar(w, j, 'missil').codigo, 'nao_pousado', 'na Evolução não se compra');
  pousar(j, 'loja', 1 - j.time);
  assert.equal(comprar(w, j, 'missil').codigo, 'nao_pousado', 'Loja do outro time');
  pousar(j, 'loja');
  j.ship.vx = 10;
  assert.equal(comprar(w, j, 'missil').codigo, 'nao_pousado', 'ainda freando');
  j.ship.vx = 0;
  j.ship.pousado = false;
  assert.equal(comprar(w, j, 'missil').codigo, 'nao_pousado', 'pairando sobre a plataforma');
  pousar(j, 'loja');

  j.ouro = PRECO_ARMA.missil - 1;
  assert.equal(comprar(w, j, 'missil').codigo, 'ouro_insuficiente');
  assert.ok(!j.armas.includes(missil));
  j.ouro = PRECO_ARMA.missil + 5;
  assert.equal(comprar(w, j, 'missil').ok, true);
  assert.equal(j.ouro, 5, 'cobrou o preço');
  assert.ok(j.armas.includes(missil) && j.ship.armas.includes(missil));
  j.ouro = 1000;
  assert.equal(comprar(w, j, 'missil').codigo, 'ja_possui');
  assert.equal(j.ouro, 1000, 'recusa não cobra');

  j.vivo = false;
  assert.equal(comprar(w, j, 'emp').codigo, 'nao_pousado', 'morto não compra');
});

test('loja: arma comprada vai nos dois encaixes; não comprada cai na padrão', () => {
  const w = mundo();
  const j = w.addPlayer('A', 'bellico');
  assert.deepEqual(j.armas, ARMAS_INICIAIS, 'começa só com as de fábrica');
  assert.deepEqual(j.ship.armas, ARMAS_INICIAIS);
  let seq = 0;
  const comando = (a, a2) => {
    w.pushInput(j.id, { s: ++seq, a, a2 });
    w.step();
    return [...j.ship.encaixes];
  };
  assert.deepEqual(comando(missil, emp), [laser, plasma], 'sem comprar, cai na padrão de cada encaixe');
  pousar(j, 'loja');
  j.ouro = 1000;
  assert.equal(comprar(w, j, 'missil').ok, true);
  assert.deepEqual(comando(missil, missil), [missil, missil], 'a comprada vai no Z e no X');
  assert.deepEqual(comando(emp, missil), [laser, missil], 'a não comprada continua travada');
});

test('loja: a posse sobrevive ao renascimento e zera na partida seguinte', () => {
  const w = new World({ drones: 0, monstros: 0, elites: 0, duracaoPartidaS: 2, intervaloFimS: 1 });
  const j = w.addPlayer('A', 'bellico');
  w.step();
  pousar(j, 'loja');
  j.ouro = 2000;
  for (const item of ['missil', 'armaduraPesada', 'reparo', 'energia']) assert.equal(comprar(w, j, item).ok, true, item);

  // Morre e renasce: nave nova, mesma posse.
  j.ship.hp = 0;
  j.vivo = false;
  j.respawnTick = w.tick + 1;
  w.step();
  assert.ok(j.vivo);
  assert.ok(j.ship.armas.includes(missil), 'a arma comprada volta na nave nova');
  assert.equal(j.ship.maxHp, hpMaxDoNivel('bellico', 1) + ARMADURAS[2].hp, 'a armadura volta');
  assert.equal(j.ship.velMult, ARMADURAS[2].velMult);
  assert.equal(j.itens.reparo, 1);

  // Partida seguinte: tudo volta ao começo.
  for (let i = 0; i < SEGUNDO * 10 && w.partida.numero < 2; i++) w.step();
  assert.equal(w.partida.numero, 2);
  assert.deepEqual(j.armas, ARMAS_INICIAIS);
  assert.deepEqual(j.ship.armas, ARMAS_INICIAIS);
  assert.equal(j.armadura, -1);
  assert.deepEqual(j.itens, { reparo: 0, energia: 0 });
  assert.equal(j.ship.maxHp, hpMaxDoNivel('bellico', 1));
  assert.equal(j.ship.velMult, 1);
  const me = w.snapshotPara(j, [], []).me;
  assert.deepEqual(me.armas, ARMAS_INICIAIS);
  assert.equal(me.armadura, -1);
});

/** A atira laser em B, 20 m à frente, fora da zona segura. Devolve o dano em B. */
function danoDeUmLaser(armaduraDeB) {
  const w = mundo();
  const a = w.addPlayer('A', 'acron');
  const b = w.addPlayer('B', 'bellico');
  b.ouro = 1000;
  pousar(b, 'loja');
  for (const item of armaduraDeB) assert.equal(comprar(w, b, item).ok, true, item);
  const z = BASE.z - ZONA_SEGURA - 120;
  Object.assign(a.ship, createShip('acron', BASE.x, z, 0), { time: a.time, armas: a.ship.armas });
  Object.assign(b.ship, { x: BASE.x, z: z - 20, y: a.ship.y, vx: 0, vz: 0, pousado: false });
  a.protegidoAte = b.protegidoAte = 0;
  const hp = b.ship.hp;
  w.pushInput(a.id, { s: 1, f1: true });
  for (let i = 0; i < 5; i++) w.step();
  return hp - b.ship.hp;
}

test('loja: armadura reduz o dano, dá HP e a pesada custa velocidade; comprar melhor substitui', () => {
  assert.equal(danoDeUmLaser([]), WEAPONS.laser.dano);
  assert.ok(Math.abs(danoDeUmLaser(['armaduraLeve']) - WEAPONS.laser.dano * (1 - ARMADURAS[0].reducao)) < 1e-9);
  assert.ok(Math.abs(danoDeUmLaser(['armaduraPesada']) - WEAPONS.laser.dano * (1 - ARMADURAS[2].reducao)) < 1e-9);

  const w = mundo();
  const j = w.addPlayer('A', 'shrewdo');
  pousar(j, 'loja');
  j.ouro = 2000;
  const hp0 = j.ship.maxHp;
  assert.equal(comprar(w, j, 'armaduraMedia').ok, true);
  assert.equal(j.ship.maxHp, hp0 + ARMADURAS[1].hp);
  assert.equal(j.ship.hp, hp0 + ARMADURAS[1].hp, 'a vida sobe junto com o máximo');
  assert.equal(comprar(w, j, 'armaduraLeve').codigo, 'ja_possui', 'pior que a equipada');
  assert.equal(comprar(w, j, 'armaduraMedia').codigo, 'ja_possui');
  assert.equal(comprar(w, j, 'armaduraPesada').ok, true, 'melhor substitui');
  assert.equal(j.armadura, 2);
  assert.equal(j.ship.maxHp, hp0 + ARMADURAS[2].hp, 'só a armadura equipada conta');
  assert.equal(j.ship.velMult, ARMADURAS[2].velMult);
  assert.equal(j.ouro, 2000 - ARMADURAS[1].preco - ARMADURAS[2].preco);

  // A velocidade máxima cai de verdade no stepShip (e na predição, que usa o mesmo me).
  const k = w.addPlayer('B', 'shrewdo');
  // Lado a lado no corredor, rumo ao minério (sem nada no caminho por 3 s).
  for (const [n, x] of [[j, CORREDOR.x - 20], [k, CORREDOR.x + 20]]) Object.assign(n.ship, { x, z: 420, vx: 0, vz: 0, yaw: 0, pousado: false });
  for (let s = 1; s <= 3 * SEGUNDO; s++) {
    w.pushInput(j.id, { s, th: 1 });
    w.pushInput(k.id, { s, th: 1 });
    w.step();
  }
  const vj = Math.hypot(j.ship.vx, j.ship.vz);
  const vk = Math.hypot(k.ship.vx, k.ship.vz);
  assert.ok(Math.abs(vj / vk - ARMADURAS[2].velMult) < 0.01, `${vj} / ${vk}`);
});

test('loja: kit de reparo cura e célula de energia enche, com recarga e limite', () => {
  const w = mundo();
  const j = w.addPlayer('A', 'bellico');
  pousar(j, 'loja');
  j.ouro = 1000;
  for (let i = 0; i < ITEM_CARGA_MAX; i++) assert.equal(comprar(w, j, 'reparo').ok, true);
  assert.equal(comprar(w, j, 'reparo').codigo, 'limite', `no máximo ${ITEM_CARGA_MAX} no compartimento`);
  assert.equal(j.ouro, 1000 - ITEM_CARGA_MAX * ITENS.reparo.preco);
  assert.equal(comprar(w, j, 'energia').ok, true);

  // Usar vale em qualquer lugar, até voando.
  j.ship.pousado = false;
  j.ship.x += 300;
  assert.equal(usar(w, j, 'reparo').codigo, 'cheio', 'vida cheia não gasta o kit');
  j.ship.hp = 50;
  assert.equal(usar(w, j, 'reparo').ok, true);
  assert.ok(Math.abs(j.ship.hp - (50 + j.ship.maxHp * REPARO_CURA)) < 1e-9);
  assert.equal(j.itens.reparo, ITEM_CARGA_MAX - 1);
  j.ship.hp = 50;
  assert.equal(usar(w, j, 'reparo').codigo, 'recarga');
  assert.equal(w.snapshotPara(j, [], []).me.cdItens.reparo, ITENS.reparo.recargaS);
  for (let i = 0; i < ITENS.reparo.recargaS / DT; i++) w.step();
  assert.equal(usar(w, j, 'reparo').ok, true, 'depois da recarga');
  for (let i = 0; i < ITENS.reparo.recargaS / DT; i++) w.step();
  j.ship.hp = 50;
  assert.equal(usar(w, j, 'reparo').ok, true);
  for (let i = 0; i < ITENS.reparo.recargaS / DT; i++) w.step();
  j.ship.hp = 50;
  assert.equal(usar(w, j, 'reparo').codigo, 'sem_item', 'acabou a carga');

  j.ship.en = 0;
  j.ship.boostTravado = true;
  assert.equal(usar(w, j, 'energia').ok, true);
  assert.equal(j.ship.en, j.ship.maxEn);
  assert.equal(j.ship.boostTravado, false);
  assert.equal(usar(w, j, 'energia').codigo, 'sem_item');
  assert.ok(w.eventos.some((e) => e.e === 'item' && e.item === 'energia' && e.id === j.id));

  j.vivo = false;
  assert.equal(usar(w, j, 'energia').codigo, 'invalido', 'morto não usa item');
});

test('loja: pedidos malformados são recusados sem quebrar nada', () => {
  const w = mundo();
  const j = w.addPlayer('A', 'bellico');
  pousar(j, 'loja');
  j.ouro = 5000;
  const lixo = [
    undefined,
    null,
    42,
    '',
    '__proto__',
    'constructor',
    'toString',
    'hasOwnProperty',
    'x'.repeat(5000),
    ['missil'],
    { toString: () => 'missil' },
    'laser', // de fábrica: não está à venda
    'plasma',
  ];
  for (const item of lixo) {
    for (const t of ['comprar', 'usar']) assert.equal(w.pedido(j.id, { t, item }).codigo, 'invalido', `${t} ${String(item).slice(0, 20)}`);
    assert.equal(w.pedido(j.id, { t: 'evoluir', opcao: item }).codigo, 'invalido');
    assert.equal(w.pedido(j.id, { t: 'melhorar', melhoria: item }).codigo, 'invalido');
  }
  assert.equal(w.pedido(j.id, null).codigo, 'invalido');
  assert.equal(w.pedido(j.id, { t: 'roubar', item: 'missil' }).codigo, 'invalido');
  assert.equal(w.pedido(9999, { t: 'comprar', item: 'missil' }).codigo, 'invalido', 'jogador que não existe');
  assert.equal(j.ouro, 5000, 'nada foi cobrado');
  assert.deepEqual(j.armas, ARMAS_INICIAIS);
  const r = w.pedido(j.id, { t: 'comprar', item: 'x'.repeat(5000) });
  assert.ok(r.item.length <= 32, 'a resposta não ecoa texto gigante');
});

test('loja: pelo WebSocket, o pedido volta como resultado e lixo não derruba a conexão', async () => {
  const world = new World({ drones: 0, monstros: 0, elites: 0 });
  const srv = await iniciar({ porta: 0, world });
  try {
    const ws = new WebSocket(`ws://localhost:${srv.porta}/ws`);
    const msgs = [];
    ws.on('message', (d) => msgs.push(JSON.parse(d)));
    await new Promise((ok) => ws.on('open', ok));
    const esperar = async (filtro) => {
      for (let i = 0; i < 100; i++) {
        const m = msgs.find(filtro);
        if (m) return m;
        await new Promise((ok) => setTimeout(ok, 20));
      }
      throw new Error('tempo esgotado');
    };
    ws.send(JSON.stringify({ t: 'comprar', item: 'missil' })); // antes de entrar: ignorado
    ws.send(JSON.stringify({ t: 'entrar', nome: 'Loja', race: 'acron' }));
    const boas = await esperar((m) => m.t === 'bemvindo');
    for (const m of ['{"t":"comprar","item":{"a":1}}', '{"t":"usar"}', 'nao é json', '{"t":"evoluir","opcao":[1,2]}']) ws.send(m);
    ws.send(JSON.stringify({ t: 'comprar', item: 'missil' }));
    const r = await esperar((m) => m.t === 'resultado' && m.item === 'missil');
    assert.deepEqual(r, { t: 'resultado', acao: 'comprar', item: 'missil', ok: false, codigo: 'nao_pousado' });

    const j = world.players.get(boas.id);
    pousar(j, 'loja');
    j.ouro = 500;
    ws.send(JSON.stringify({ t: 'comprar', item: 'emp' }));
    assert.equal((await esperar((m) => m.t === 'resultado' && m.item === 'emp')).ok, true);
    const snap = await esperar((m) => m.t === 'snap' && m.me.armas.includes(emp));
    assert.equal(snap.ouro, 500 - PRECO_ARMA.emp);
    assert.deepEqual(snap.me.itens, { reparo: 0, energia: 0 });
    assert.equal(snap.me.armadura, -1);
    assert.deepEqual(snap.me.evolucoes, []);
    assert.deepEqual(snap.melhorias, { quantidade: 0, durabilidade: 0, defesa: 0, velocidade: 0 });
    ws.close();
  } finally {
    await srv.fechar();
  }
});

test('loja: energia máxima da raça sem evolução', () => {
  const w = mundo();
  const j = w.addPlayer('A', 'acron');
  assert.equal(j.ship.maxEn, RACES.acron.energia);
});
