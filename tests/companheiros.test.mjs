// Barra do time e teleporte até o companheiro Functional (server/game.js:
// pedidoTeleporte, abatesJog; server/progressao.js: novoCombate): o servidor valida o
// salto e põe a nave num ponto livre junto do aliado; os abates de jogador inimigo
// têm contador próprio; a vida dos aliados vem das entidades do time e a de inimigo
// não vaza pela lista pública `jogadores`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World, TELEPORTE_ALIADO_DIST } from '../server/game.js';
import { createShip, HOVER, TELEPORTE_FOLGA, custoTeleporte } from '../shared/sim.js';
import { heightAt } from '../shared/terrain.js';
import { pontoLivre } from '../shared/obstaculos.js';
import { CAMPO } from './lugares.mjs';

function rngFixo(semente = 1) {
  let s = semente;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/**
 * Mundo sem monstros, mineradores nem torretas atirando, com os jogadores pedidos
 * ([nome, classe] na ordem de entrada: os times alternam 0, 1, 0...), e a partida
 * já começada.
 */
function mundo(pilotos, opcoes = {}) {
  const w = new World({ jungle: false, torretas: false, rng: rngFixo(), ouroPorSegundo: 0, ...opcoes });
  w.mineradores.passo = () => {};
  w.escoltas.passo = () => {};
  const js = pilotos.map(([nome, classe]) => w.addPlayer(nome, 'bellico', classe));
  w.step();
  return { w, js };
}

/** Põe a nave do jogador em (x, z), parada, voando e sem proteção (mesma classe). */
function colocar(j, x, z, yaw = 0) {
  j.ship = createShip(j.ship.race, x, z, yaw, j.classe);
  j.ship.time = j.time;
  j.protegidoAte = 0;
}

/** Energia de sobra para o salto (a Assault de fábrica, com 23, não paga os 31 do nível 1). */
function abastecer(j, en = 500) {
  j.ship.maxEn = j.ship.en = en;
}

const matar = (w, alvo, autor) => w.jungle.ctx.ferir(alvo, 1e9, autor?.id ?? 0, null, {});
const teleportar = (w, j, alvo) => w.pedidoTeleporte(j.id, { t: 'teleportar', alvo });

test('teleporte: vai na hora para junto do aliado Functional, parado, decolado e na altura de voo', () => {
  // A (time 0) pede; B (time 1); C (time 0) é o Functional.
  const { w, js } = mundo([['A', 'assault'], ['B', 'assault'], ['C', 'functional']]);
  const [a, , c] = js;
  assert.equal(a.time, c.time);
  colocar(c, CAMPO.x, CAMPO.z, 0.7);
  colocar(a, CAMPO.x + 400, CAMPO.z + 300);
  abastecer(a);
  Object.assign(a.ship, { vx: 30, vz: -12, pousado: true, boost: true });
  const hp = (a.ship.hp = a.ship.maxHp - 40);
  w.tirarEventos();

  const r = teleportar(w, a, c.id);
  assert.deepEqual(r, { t: 'resultado', acao: 'teleportar', item: c.id, ok: true });
  const d = Math.hypot(a.ship.x - c.ship.x, a.ship.z - c.ship.z);
  assert.ok(Math.abs(d - TELEPORTE_ALIADO_DIST[0]) < 1e-6, `a ${d.toFixed(1)} m do companheiro`);
  assert.ok(pontoLivre(a.ship.x, a.ship.z, TELEPORTE_FOLGA), 'num ponto livre');
  assert.equal(a.ship.y, heightAt(a.ship.x, a.ship.z) + HOVER);
  assert.equal(a.ship.vx, 0);
  assert.equal(a.ship.vz, 0);
  assert.equal(a.ship.pousado, false);
  assert.equal(a.ship.boost, false);
  assert.equal(a.ship.yaw, c.ship.yaw, 'olha para onde o companheiro olha');
  assert.equal(a.ship.hp, hp, 'a mesma nave: a vida fica');
  assert.ok(Math.abs(a.ship.en - (500 - custoTeleporte(1, 1))) < 1e-9, 'pagou o salto em energia');
  // Começa por trás dele: o ponto fica no lado oposto ao nariz do companheiro.
  const nariz = { x: -Math.sin(c.ship.yaw), z: -Math.cos(c.ship.yaw) };
  assert.ok((a.ship.x - c.ship.x) * nariz.x + (a.ship.z - c.ship.z) * nariz.z < 0, 'atrás do companheiro');

  const ev = w.tirarEventos().find((e) => e.e === 'teleporte');
  assert.ok(ev, 'evento teleporte');
  assert.equal(ev.id, a.id);
  assert.equal(ev.alvo, c.id);
  assert.equal(ev.time, a.time);
  assert.equal(ev.x, +a.ship.x.toFixed(2));

  // O passo seguinte não arrasta a nave de volta (o comando segue do lugar novo).
  const antes = { x: a.ship.x, z: a.ship.z };
  w.pushInput(a.id, { s: 1, th: 0, tu: 0 });
  w.step();
  assert.ok(Math.hypot(a.ship.x - antes.x, a.ship.z - antes.z) < 1, 'ficou onde chegou');
});

test('teleporte: recusa alvo de outro time, alvo não Functional, alvo morto, a si mesmo e quem pede morto', () => {
  const { w, js } = mundo([['A', 'functional'], ['B', 'functional'], ['C', 'assault'], ['D', 'assault'], ['E', 'functional']]);
  const [a, b, c, , e] = js;
  for (const [j, i] of [[a, 0], [b, 1], [c, 2], [e, 3]]) colocar(j, CAMPO.x + i * 60, CAMPO.z);
  const pos = () => ({ x: a.ship.x, z: a.ship.z });
  const antes = pos();

  assert.equal(teleportar(w, a, b.id).codigo, 'invalido', 'B é do outro time');
  assert.equal(teleportar(w, a, a.id).codigo, 'invalido', 'a si mesmo');
  assert.equal(teleportar(w, a, 9999).codigo, 'invalido', 'alvo que não existe');
  assert.equal(teleportar(w, a, String(e.id)).codigo, 'invalido', 'alvo que não é inteiro');
  assert.equal(teleportar(w, a, c.id).codigo, 'nao_functional', 'C é Assault');
  matar(w, e, b);
  assert.equal(e.vivo, false);
  assert.equal(teleportar(w, a, e.id).codigo, 'alvo_morto');
  assert.deepEqual(pos(), antes, 'nada mudou');
  assert.ok(!w.tirarEventos().some((x) => x.e === 'teleporte'));

  // Quem pede morto: E (Functional, time 0) volta, A morre.
  w.players.get(e.id).vivo = true;
  matar(w, a, b);
  assert.equal(teleportar(w, a, e.id).codigo, 'morto');
  // Todo pedido recusado volta com ok false e o alvo no item.
  const r = teleportar(w, c, b.id);
  assert.equal(r.ok, false);
  assert.equal(r.acao, 'teleportar');
  assert.equal(r.item, b.id);
});

test('teleporte: só com a partida em andamento (ou no modo de teste) e cancela o recall', () => {
  const w = new World({ jungle: false, torretas: false, rng: rngFixo() });
  w.mineradores.passo = () => {};
  const a = w.addPlayer('A', 'bellico', 'assault');
  w.addPlayer('B', 'bellico', 'assault');
  const c = w.addPlayer('C', 'bellico', 'functional');
  assert.equal(w.partida.estado, 'esperando');
  assert.equal(w.pedidoTeleporte(a.id, { alvo: c.id }).codigo, 'sem_partida');
  w.step();
  colocar(c, CAMPO.x, CAMPO.z);
  colocar(a, CAMPO.x, CAMPO.z + 300);
  abastecer(a);
  a.recall = { inicio: w.tick, fim: w.tick + 1000 };
  w.tirarEventos();
  assert.equal(w.pedidoTeleporte(a.id, { alvo: c.id }).ok, true);
  assert.equal(a.recall, null);
  const rec = w.tirarEventos().find((x) => x.e === 'recall');
  assert.equal(rec?.estado, 'cancelado');
  assert.equal(rec?.motivo, 'teleporte');

  // Modo de teste: mundo só seu, com os computadores do pedido.
  const t = new World({ teste: true, jungle: false, torretas: false, rng: rngFixo() });
  const eu = t.addPlayer('Eu', 'acron', 'assault', { iaMeu: 2 });
  t.step();
  const aliado = [...t.players.values()].find((j) => j !== eu && j.time === eu.time);
  aliado.classe = aliado.ship.classe = 'functional';
  colocar(aliado, CAMPO.x, CAMPO.z);
  aliado.ia = null; // parado: o teste não depende da IA
  abastecer(eu);
  assert.equal(t.pedidoTeleporte(eu.id, { alvo: aliado.id }).ok, true);
});

test('teleporte: aliado encostado na rocha ou sem lugar em volta, a nave nunca cai dentro do sólido', () => {
  const { w, js } = mundo([['A', 'assault'], ['B', 'assault'], ['C', 'functional']]);
  const [a, , c] = js;
  // Varre o mapa atrás de pontos livres colados em algo sólido (o primeiro rumo bloqueado).
  let testados = 0;
  for (let x = -1400; x <= 1400 && testados < 25; x += 37) {
    for (let z = -1050; z <= 1050 && testados < 25; z += 41) {
      if (!pontoLivre(x, z, TELEPORTE_FOLGA) || pontoLivre(x + 16, z, TELEPORTE_FOLGA)) continue;
      colocar(c, x, z, Math.PI / 2); // olhando para -x: o primeiro rumo (atrás, +x) está bloqueado
      colocar(a, CAMPO.x, CAMPO.z + 300);
      abastecer(a);
      assert.equal(teleportar(w, a, c.id).ok, true);
      const igual = a.ship.x === c.ship.x && a.ship.z === c.ship.z;
      assert.ok(igual || pontoLivre(a.ship.x, a.ship.z, TELEPORTE_FOLGA), `junto de (${x}, ${z})`);
      testados++;
    }
  }
  assert.ok(testados > 5, `testou ${testados} lugares apertados`);
});

test('abates de jogador: só o jogador inimigo conta, e zera na partida nova', () => {
  const { w, js } = mundo([['A', 'assault'], ['B', 'assault']], { duracaoPartidaS: 5, intervaloFimS: 1 });
  const [a, b] = js;
  colocar(a, CAMPO.x, CAMPO.z);
  colocar(b, CAMPO.x + 100, CAMPO.z);
  assert.equal(a.abatesJog, 0);

  const m = w.jungle.criarMonstro('armish', CAMPO.x, CAMPO.z - 80);
  matar(w, m, a);
  assert.equal(m.vivo, false);
  assert.equal(a.abates, 1, 'o abate geral conta o monstro');
  assert.equal(a.abatesJog, 0, 'monstro não é jogador');

  matar(w, b, a);
  assert.equal(b.vivo, false);
  assert.equal(a.abates, 2);
  assert.equal(a.abatesJog, 1, 'jogador inimigo conta');
  assert.equal(b.abatesJog, 0);

  const lista = w.snapshotPara(a, w.entidades(), []).jogadores;
  assert.equal(lista.find((p) => p.id === a.id).abatesJog, 1, 'vai na lista do snapshot');
  assert.equal(lista.find((p) => p.id === b.id).abatesJog, 0);

  // Partida nova (tempo da partida + tela de fim): o contador zera.
  for (let i = 0; i < 30 * 8; i++) w.step();
  assert.equal(w.partida.estado, 'andamento');
  assert.ok(w.partida.numero >= 2);
  assert.equal(a.abatesJog, 0);
});

test('vida na barra do time: a do aliado vem nas entidades, a do inimigo escondido não vaza', () => {
  const { w, js } = mundo([['A', 'assault'], ['B', 'assault'], ['C', 'functional']]);
  const [a, b, c] = js;
  for (const t of w.torretas.lista) t.viva = false; // só as naves e a base veem
  colocar(a, CAMPO.x, CAMPO.z);
  colocar(c, -200, -900); // longe de A: só o time o vê pelas entidades
  colocar(b, 950, -500); // longe de todos do time 0
  c.ship.hp = 123;
  b.ship.hp = 77;
  w.step();
  const snap = w.snapshotPara(a, w.entidades(), []);
  const ents = new Map(snap.ents.map((e) => [e.id, e]));
  assert.equal(ents.get(c.id)?.hp, Math.ceil(c.ship.hp), 'aliado vem com a vida, longe ou perto');
  assert.ok(Math.abs(ents.get(c.id).hp - 123) <= 2);
  assert.equal(ents.get(c.id)?.classe, 'functional');
  assert.ok(ents.get(c.id)?.maxHp > 0);
  assert.equal(ents.has(b.id), false, 'inimigo fora da visão não vem');
  for (const p of snap.jogadores) {
    for (const campo of ['hp', 'maxHp', 'x', 'z', 'classe', 'tier', 'race']) assert.equal(p[campo], undefined, `${campo} fora da lista pública`);
  }
  const hpB = Math.ceil(b.ship.hp); // a Bellico regenera voando: o valor de agora
  assert.ok(!new RegExp(`"hp":${hpB}[,}]`).test(JSON.stringify(snap)), 'a vida do inimigo escondido não está em lugar nenhum do snapshot');

  // Aliado morto continua vindo (para o card esmaecido).
  matar(w, c, b);
  w.step();
  const morto = w.snapshotPara(a, w.entidades(), []).ents.find((e) => e.id === c.id);
  assert.equal(morto?.vivo, false);
});

test('teleporte: o evento vai ao time de quem saltou; o outro time só recebe se enxerga a chegada', () => {
  const { w, js } = mundo([['A', 'assault'], ['B', 'assault'], ['C', 'functional']]);
  const [a, b, c] = js;
  for (const t of w.torretas.lista) t.viva = false;
  colocar(c, CAMPO.x, CAMPO.z);
  colocar(a, CAMPO.x, CAMPO.z + 300);
  colocar(b, 950, -500);
  abastecer(a);
  w.step();
  w.tirarEventos();
  assert.equal(teleportar(w, a, c.id).ok, true);
  const ev = w.tirarEventos();
  const doTime = w.snapshotPara(c, w.entidades(), ev).ev;
  assert.ok(doTime.some((e) => e.e === 'teleporte' && e.id === a.id), 'aliado recebe');
  const inimigo = w.snapshotPara(b, w.entidades(), ev).ev;
  assert.ok(!inimigo.some((e) => e.e === 'teleporte'), 'inimigo longe não recebe');
});

test('teleporte: custa energia como no original, mais caro com o nível e com a diferença de nível', () => {
  // 0,3 × (100 × (1 + nível/30) + 10 × |diferença|): a energia do original na escala do jogo.
  assert.ok(Math.abs(custoTeleporte(1, 1) - 0.3 * (100 * (1 + 1 / 30))) < 1e-9);
  assert.ok(Math.abs(custoTeleporte(15, 15) - 45) < 1e-9, 'nível 15, mesmo nível: 0,3 × 150');
  assert.ok(Math.abs(custoTeleporte(15, 5) - 75) < 1e-9, '10 níveis de diferença: +30');
  assert.ok(Math.abs(custoTeleporte(5, 15) - custoTeleporte(5, -5)) < 1e-9, 'para cima ou para baixo, mesma conta');
  assert.ok(custoTeleporte(25, 25) > custoTeleporte(1, 1), 'quem tem nível alto paga mais');
});

test('teleporte: sem energia bastante recusa com o custo, sem mexer na nave; com ela, desconta o custo', () => {
  const { w, js } = mundo([['A', 'functional'], ['B', 'assault'], ['C', 'functional']]);
  const [a, , c] = js;
  colocar(c, CAMPO.x, CAMPO.z);
  colocar(a, CAMPO.x + 300, CAMPO.z);
  a.nivel = 12;
  c.nivel = 3;
  const custo = custoTeleporte(12, 3);
  abastecer(a, 200);
  a.ship.en = custo - 0.5;
  const antes = { x: a.ship.x, z: a.ship.z, en: a.ship.en };
  w.tirarEventos();

  const r = teleportar(w, a, c.id);
  assert.deepEqual(r, { t: 'resultado', acao: 'teleportar', item: c.id, ok: false, codigo: 'sem_energia', custo: Math.ceil(custo) });
  assert.deepEqual({ x: a.ship.x, z: a.ship.z, en: a.ship.en }, antes, 'a nave não saiu nem gastou');
  assert.ok(!w.tirarEventos().some((e) => e.e === 'teleporte'));

  a.ship.en = custo; // exatamente o custo: paga (o original compara custo <= energia)
  assert.equal(teleportar(w, a, c.id).ok, true);
  assert.ok(Math.abs(a.ship.en) < 1e-9, 'gastou tudo');
  assert.ok(Math.hypot(a.ship.x - c.ship.x, a.ship.z - c.ship.z) < 30, 'chegou junto dele');
});
