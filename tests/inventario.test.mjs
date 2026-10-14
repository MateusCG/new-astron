// Inventário e pontos do piloto no servidor (server/servicos.js): os pedidos
// {t:'pontos'} e {t:'equipar'}, a compra e a evolução dos escudos, armaduras e
// potenciadores do original na Loja (comprar com o encaixe vazio já equipa), as
// regras de onde se equipa e o que zera na partida nova.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { World } from '../server/game.js';
import { iniciar } from '../server/index.js';
import { hpMaxDoNivel } from '../server/progressao.js';
import { naveDe } from '../shared/naves.js';
import { BASES, SERVICOS, OBJETIVOS } from '../shared/terrain.js';
import { EQUIPAMENTOS, versaoEquip, precoEvoluirEquip, NIVEL_POR_VERSAO } from '../shared/equipamentos.js';
import { PONTO_MAX, efeitoDosPontos } from '../shared/status.js';

const SEGUNDO = 30;
const ESCUDO = 'e330010'; // Escudo Neutron Op. (todas as classes)
const ESCUDO_2 = 'e330011'; // Escudo Neutron Ph.
const ESCUDO_MAXIMO = 'e330001'; // Escudo Máximo Op. (só Assault)
const ARMADURA = 'e320012'; // Armadura de Alcânio (geral, todas as classes)
const REFORCO = 'e340025'; // Reforço Op.
const DURABILIDADE = 'e340001'; // Potenciador de Durabilidade
const ENERGIA = 'e340004'; // Potenciador de Energia

function mundo(opcoes = {}) {
  const w = new World({ drones: 0, monstros: 0, elites: 0, torretas: false, ...opcoes });
  w.mineradores.passo = () => {};
  return w;
}

/** Pousada e parada no ponto. */
function pousarEm(j, x, z) {
  Object.assign(j.ship, { x, z, vx: 0, vz: 0, pousado: true });
}
/** Pousada e parada na plataforma `servico` do time (padrão: o do piloto). */
function pousar(j, servico, time = j.time) {
  const sv = SERVICOS.find((s) => s.servico === servico && s.time === time);
  pousarEm(j, sv.x, sv.z);
}

const comprar = (w, j, item) => w.pedido(j.id, { t: 'comprar', item });
const equipar = (w, j, slot, item) => w.pedido(j.id, { t: 'equipar', slot, item });
const pontos = (w, j, atributo, qtd) => w.pedido(j.id, { t: 'pontos', atributo, qtd });

test('pontos: 10 por nível, máximo 99 em cada, põe o que couber e vale em qualquer lugar', () => {
  const w = mundo();
  const j = w.addPlayer('A', 'shrewdo', 'functional');
  assert.deepEqual(w.snapshotPara(j, [], []).me.pontos, { energia: 0, fisico: 0, eletrico: 0, laser: 0 });
  assert.equal(w.snapshotPara(j, [], []).me.pontosLivres, 10, 'no nível 1 já há 10');

  assert.deepEqual(pontos(w, j, 'eletrico'), { t: 'resultado', acao: 'pontos', item: 'eletrico', ok: true }, 'qtd padrão 1');
  assert.equal(j.pontos.eletrico, 1);
  assert.equal(pontos(w, j, 'laser', 50).ok, true, 'pede 50, põe os 9 que sobram');
  assert.equal(j.pontos.laser, 9);
  assert.deepEqual(pontos(w, j, 'fisico'), { t: 'resultado', acao: 'pontos', item: 'fisico', ok: false, codigo: 'sem_pontos' });

  for (const [atributo, qtd] of [['forca', 1], ['energia', 0], ['energia', 100], ['energia', 1.5], ['energia', '3'], [null, 1], ['__proto__', 1]]) {
    assert.equal(pontos(w, j, atributo, qtd).codigo, 'invalido', `${atributo} ${qtd}`);
  }

  // Nível 25: 250 pontos; 99 no máximo por atributo.
  j.nivel = 25;
  assert.equal(w.snapshotPara(j, [], []).me.pontosLivres, 240);
  assert.equal(pontos(w, j, 'energia', 99).ok, true);
  assert.equal(pontos(w, j, 'energia').codigo, 'maximo');
  assert.equal(pontos(w, j, 'laser', 99).ok, true);
  assert.equal(j.pontos.laser, PONTO_MAX, 'só completa até 99');

  // Morto e voando também distribui.
  j.vivo = false;
  assert.equal(pontos(w, j, 'fisico', 5).ok, true);
  assert.equal(j.pontos.fisico, 5);
});

test('pontos: Energia sobe a energia máxima e a regeneração; o poder vai para o status', () => {
  const w = mundo();
  const j = w.addPlayer('A', 'shrewdo', 'functional');
  const nave = naveDe('shrewdo', 'functional', 0);
  j.nivel = 5;
  const en0 = j.ship.maxEn;
  const regen0 = j.ship.regenEn;
  assert.equal(pontos(w, j, 'energia', 20).ok, true);
  assert.equal(pontos(w, j, 'eletrico', 30).ok, true);
  const ef = efeitoDosPontos('shrewdo', 'functional', j.pontos, nave.energia);
  assert.equal(j.ship.maxEn, Math.round(en0 + ef.energia));
  assert.ok(Math.abs(j.ship.regenEn - (regen0 + ef.regenEn)) < 1e-9);
  assert.equal(j.ship.en, j.ship.maxEn, 'a energia sobe junto com o máximo (estava cheia)');
  j.ship.en = 10;
  j.nivel = 6;
  const max = j.ship.maxEn;
  assert.equal(pontos(w, j, 'energia', 2).ok, true);
  assert.ok(Math.abs(j.ship.en - (10 + j.ship.maxEn - max)) < 1e-9, 'só soma a diferença, não enche');
  const me = w.snapshotPara(j, [], []).me;
  assert.ok(Math.abs(me.status.poder.eletrico - 0.78) < 1e-9, 'Shrewdo Functional: 2,6% por ponto');
  assert.equal(me.status.poder.laser, 0);
  assert.equal(me.pontosLivres, 8, '60 do nível 6 menos 52');
});

test('equipamento: comprar com o encaixe vazio já equipa; de outra classe é inválido', () => {
  const w = mundo();
  const j = w.addPlayer('A', 'bellico', 'mobile');
  pousar(j, 'loja');
  j.ouro = 5000;
  assert.equal(comprar(w, j, ESCUDO_MAXIMO).codigo, 'invalido', 'escudo só da Assault');
  assert.equal(j.ouro, 5000);

  assert.equal(comprar(w, j, ESCUDO).ok, true);
  assert.equal(j.ouro, 5000 - EQUIPAMENTOS[ESCUDO].preco);
  assert.deepEqual(j.equip, { [ESCUDO]: 1 });
  assert.equal(j.equipado.escudo, ESCUDO, 'foi para a nave');
  assert.equal(j.ship.maxEscudo, versaoEquip(ESCUDO, 1).maxEscudo);
  assert.equal(j.ship.escudo, 0, 'escudo novo começa vazio e recupera com o tempo');
  assert.equal(comprar(w, j, ESCUDO).codigo, 'ja_possui');

  assert.equal(comprar(w, j, ESCUDO_2).ok, true);
  assert.equal(j.equipado.escudo, ESCUDO, 'com o encaixe ocupado, só guarda');

  const hp0 = j.ship.maxHp;
  assert.equal(comprar(w, j, ARMADURA).ok, true);
  assert.equal(j.equipado.armadura, ARMADURA);
  assert.equal(j.ship.maxHp, Math.round(hp0 + versaoEquip(ARMADURA, 1).hp), 'a armadura sobe o HP máximo');

  for (const k of [REFORCO, DURABILIDADE, ENERGIA]) assert.equal(comprar(w, j, k).ok, true, k);
  assert.deepEqual(j.equipado.pot, [REFORCO, DURABILIDADE], 'potenciador vai no primeiro encaixe vazio; o terceiro fica guardado');
  assert.equal(Object.keys(j.equip).length, 6);
});

test('equipamento: equipar só pousado e parado numa área de pouso da própria base', () => {
  const w = mundo();
  const j = w.addPlayer('A', 'acron', 'assault');
  pousar(j, 'loja');
  j.ouro = 5000;
  for (const k of [ESCUDO, ESCUDO_2, REFORCO, DURABILIDADE]) assert.equal(comprar(w, j, k).ok, true);

  // Voando na base, pousado na Loja do outro time, no anel do outro time, no objetivo A.
  j.ship.pousado = false;
  assert.deepEqual(equipar(w, j, 'escudo', ESCUDO_2), { t: 'resultado', acao: 'equipar', item: 'escudo', ok: false, codigo: 'nao_pousado' });
  pousar(j, 'loja', 1 - j.time);
  assert.equal(equipar(w, j, 'escudo', ESCUDO_2).codigo, 'nao_pousado');
  pousarEm(j, BASES[1 - j.time].x, BASES[1 - j.time].z);
  assert.equal(equipar(w, j, 'escudo', ESCUDO_2).codigo, 'nao_pousado');
  const a = OBJETIVOS.find((o) => o.tipo === 'A');
  pousarEm(j, a.x, a.z);
  assert.equal(equipar(w, j, 'escudo', ESCUDO_2).codigo, 'nao_pousado', 'objetivo A não é base');
  pousarEm(j, BASES[j.time].x, BASES[j.time].z);
  j.ship.vx = 10;
  assert.equal(equipar(w, j, 'escudo', ESCUDO_2).codigo, 'nao_pousado', 'ainda freando');
  j.ship.vx = 0;
  j.vivo = false;
  assert.equal(equipar(w, j, 'escudo', ESCUDO_2).codigo, 'nao_pousado', 'morto');
  j.vivo = true;

  // No anel da própria base vale; na Evolução também.
  assert.equal(equipar(w, j, 'escudo', ESCUDO_2).ok, true);
  assert.equal(j.equipado.escudo, ESCUDO_2);
  pousar(j, 'evolucao');
  assert.equal(equipar(w, j, 'escudo', null).ok, true, 'null tira');
  assert.equal(j.equipado.escudo, null);
  assert.equal(j.ship.maxEscudo, 0);
  assert.equal(w.snapshotPara(j, [], []).me.equipado.escudo, null);
});

test('equipamento: potenciador repetido, categoria errada, outra classe e item que não tem', () => {
  const w = mundo();
  const j = w.addPlayer('A', 'acron', 'functional');
  pousar(j, 'loja');
  j.ouro = 5000;
  for (const k of [REFORCO, DURABILIDADE, ESCUDO]) assert.equal(comprar(w, j, k).ok, true);
  assert.deepEqual(j.equipado.pot, [REFORCO, DURABILIDADE]);

  assert.deepEqual(equipar(w, j, 'pot2', REFORCO), { t: 'resultado', acao: 'equipar', item: 'pot2', ok: false, codigo: 'ja_possui' });
  assert.equal(equipar(w, j, 'pot1', REFORCO).ok, true, 'no mesmo encaixe não muda nada');
  assert.equal(equipar(w, j, 'pot1', null).ok, true);
  assert.deepEqual(j.equipado.pot, [null, DURABILIDADE]);
  assert.equal(equipar(w, j, 'pot1', DURABILIDADE).codigo, 'ja_possui', 'o mesmo nos dois não');
  assert.equal(equipar(w, j, 'pot2', REFORCO).ok, true, 'troca o do encaixe');
  assert.deepEqual(j.equipado.pot, [null, REFORCO]);

  assert.equal(equipar(w, j, 'pot1', ESCUDO).codigo, 'invalido', 'escudo no encaixe de potenciador');
  assert.equal(equipar(w, j, 'armadura', ESCUDO).codigo, 'invalido');
  assert.equal(equipar(w, j, 'escudo', 'e330001').codigo, 'invalido', 'Escudo Máximo é só da Assault');
  assert.equal(equipar(w, j, 'escudo', ESCUDO_2).codigo, 'sem_item', 'não comprou');
  for (const [slot, item] of [['pot3', REFORCO], [null, REFORCO], ['escudo', 'e999999'], ['escudo', 42], ['escudo', undefined], ['__proto__', null]]) {
    assert.equal(equipar(w, j, slot, item).codigo, 'invalido', `${slot} ${item}`);
  }
  assert.deepEqual(j.equipado, { escudo: ESCUDO, armadura: null, pot: [null, REFORCO] }, 'nada mudou com os recusados');
});

test('equipamento: trocar de escudo zera o escudo atual; tirar e pôr o mesmo também não enche', () => {
  const w = mundo();
  const j = w.addPlayer('A', 'shrewdo', 'mobile');
  pousar(j, 'loja');
  j.ouro = 5000;
  for (const k of [ESCUDO, ESCUDO_2]) assert.equal(comprar(w, j, k).ok, true);
  j.ship.escudo = 50;
  assert.equal(equipar(w, j, 'escudo', ESCUDO).ok, true, 'o mesmo: nada muda');
  assert.equal(j.ship.escudo, 50);
  assert.equal(equipar(w, j, 'escudo', ESCUDO_2).ok, true);
  assert.equal(j.ship.escudo, 0, 'trocou: zera');
  j.ship.escudo = 30;
  assert.equal(equipar(w, j, 'escudo', null).ok, true);
  assert.equal(equipar(w, j, 'escudo', ESCUDO_2).ok, true);
  assert.equal(j.ship.escudo, 0);
  // Evoluir o escudo sobe o máximo sem encher.
  j.nivel = NIVEL_POR_VERSAO[1];
  j.ship.escudo = 30;
  assert.equal(comprar(w, j, 'evoluir:' + ESCUDO_2).ok, true);
  assert.equal(j.ship.maxEscudo, versaoEquip(ESCUDO_2, 2).maxEscudo);
  assert.equal(j.ship.escudo, 30);
});

test('equipamento: evoluir na Loja até a V8, com o nível do piloto e o ouro de cada versão', () => {
  const w = mundo();
  const j = w.addPlayer('A', 'bellico', 'assault');
  pousar(j, 'loja');
  j.ouro = 100000;
  const evoluir = (k) => comprar(w, j, 'evoluir:' + k);
  assert.deepEqual(evoluir(ARMADURA), { t: 'resultado', acao: 'comprar', item: 'evoluir:' + ARMADURA, ok: false, codigo: 'sem_item' });
  assert.equal(comprar(w, j, ARMADURA).ok, true);
  assert.equal(evoluir(ARMADURA).codigo, 'nivel_insuficiente', `a V2 pede o nível ${NIVEL_POR_VERSAO[1]}`);
  for (let v = 2; v <= 8; v++) {
    j.nivel = NIVEL_POR_VERSAO[v - 1];
    const ouro = j.ouro;
    const hpAntes = j.ship.maxHp;
    assert.equal(evoluir(ARMADURA).ok, true, `V${v}`);
    assert.equal(j.equip[ARMADURA], v);
    assert.equal(ouro - j.ouro, precoEvoluirEquip(ARMADURA, v - 1));
    assert.ok(j.ship.maxHp > hpAntes, 'cada versão dá mais HP');
  }
  assert.equal(evoluir(ARMADURA).codigo, 'limite', 'V8 é a última');
  j.ship.pousado = false;
  assert.equal(evoluir(ARMADURA).codigo, 'nao_pousado');
});

test('equipamento: volta a cada renascimento (escudo cheio) e tudo zera na partida nova', () => {
  const w = mundo({ duracaoPartidaS: 2, intervaloFimS: 1 });
  const j = w.addPlayer('A', 'acron', 'assault');
  w.step();
  pousar(j, 'loja');
  j.ouro = 5000;
  for (const k of [ESCUDO, ARMADURA, REFORCO]) assert.equal(comprar(w, j, k).ok, true);
  j.nivel = 3;
  assert.equal(pontos(w, j, 'laser', 30).ok, true);
  const hpMax = j.ship.maxHp;

  // Morre e renasce: a mesma build, escudo cheio.
  j.ship.hp = 0;
  j.vivo = false;
  j.respawnTick = w.tick + 1;
  w.step();
  assert.ok(j.vivo);
  assert.equal(j.ship.maxHp, hpMax);
  assert.ok(j.ship.maxEscudo > 0);
  assert.equal(j.ship.escudo, j.ship.maxEscudo, 'renasce com o escudo cheio');
  assert.equal(j.status.poder.laser > 0.2, true, 'pontos e Reforço no poder');

  // Partida seguinte: nada de equipamento, pontos nem status.
  for (let i = 0; i < SEGUNDO * 10 && w.partida.numero < 2; i++) w.step();
  assert.equal(w.partida.numero, 2);
  assert.deepEqual(j.equip, {});
  assert.deepEqual(j.equipado, { escudo: null, armadura: null, pot: [null, null] });
  assert.deepEqual(j.pontos, { energia: 0, fisico: 0, eletrico: 0, laser: 0 });
  assert.equal(j.ship.maxEscudo, 0);
  assert.equal(j.ship.escudo, 0);
  assert.equal(j.ship.maxHp, hpMaxDoNivel(naveDe('acron', 'assault', 0).hp, 1));
  const me = w.snapshotPara(j, [], []).me;
  assert.equal(me.pontosLivres, 10);
  assert.equal(me.status.poder.laser, 0);
  assert.deepEqual(me.recargaMult, { fisico: 1, laser: 1, eletrico: 1 });
});

test('inventário: pelo WebSocket, pontos e equipar voltam como resultado e o me traz a build', async () => {
  const world = mundo();
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
    ws.send(JSON.stringify({ t: 'entrar', nome: 'Inv', race: 'shrewdo', classe: 'functional' }));
    const boas = await esperar((m) => m.t === 'bemvindo');
    ws.send(JSON.stringify({ t: 'pontos', atributo: 'laser', qtd: 4 }));
    assert.deepEqual(await esperar((m) => m.t === 'resultado' && m.acao === 'pontos'), { t: 'resultado', acao: 'pontos', item: 'laser', ok: true });
    ws.send(JSON.stringify({ t: 'equipar', slot: 'escudo', item: ESCUDO }));
    assert.deepEqual(await esperar((m) => m.t === 'resultado' && m.acao === 'equipar'), {
      t: 'resultado',
      acao: 'equipar',
      item: 'escudo',
      ok: false,
      codigo: 'nao_pousado',
    });
    const j = world.players.get(boas.id);
    pousar(j, 'loja');
    j.ouro = 1000;
    ws.send(JSON.stringify({ t: 'comprar', item: ESCUDO }));
    await esperar((m) => m.t === 'resultado' && m.item === ESCUDO);
    const snap = await esperar((m) => m.t === 'snap' && m.me.equipado?.escudo === ESCUDO);
    const me = snap.me;
    assert.deepEqual(me.pontos, { energia: 0, fisico: 0, eletrico: 0, laser: 4 });
    assert.equal(me.pontosLivres, 6);
    assert.deepEqual(me.equip, { [ESCUDO]: 1 });
    assert.equal(me.maxEscudo, versaoEquip(ESCUDO, 1).maxEscudo);
    assert.equal(me.regenEscudo, versaoEquip(ESCUDO, 1).regenEscudo);
    assert.ok(me.escudo >= 0 && me.escudo <= me.maxEscudo);
    assert.deepEqual(Object.keys(me.recargaMult).sort(), ['eletrico', 'fisico', 'laser']);
    assert.ok(me.status.resist.laser > 0, 'o escudo Op. dá resistência ao laser');
    const ent = snap.ents.find((e) => e.id === j.id);
    assert.ok(ent.esc >= 0 && ent.esc <= 1, 'a entidade traz a fração do escudo');
    ws.close();
  } finally {
    await srv.fechar();
  }
});
