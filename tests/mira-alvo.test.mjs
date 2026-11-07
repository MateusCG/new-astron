// A mira travada das armas de alvo (pedido do Mateus, 06/nov/2026, pelos vídeos do
// original com o Míssil Paralisante): a regra do original (shared/mira.js: a esfera de
// raio R à frente do nariz, o mais perto da linha do nariz), o tiro da nave travando
// por ela no servidor (também nas torres sentinela do outro time), a mira da tela
// (public/js/mira-alvo-regras.js) escolhendo o mesmo alvo sobre o snapshot, e os
// efeitos do original (target01 no Z, target02 no X) na lista da partida.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { World } from '../server/game.js';
import { IDX_ARMA, INPUT_VAZIO, createShip } from '../shared/sim.js';
import { golpeDaArma } from '../shared/armas.js';
import { alvoDaMira, esferaDaMira } from '../shared/mira.js';
import { alvosDaMira, golpeComMira, candidatosDaMira, escalaDaMira, EFEITO_MIRA, RAIO_MIRA_FECHADA, RitmoDaMira, MIRA_REFAZER_S } from '../public/js/mira-alvo-regras.js';
import { EFEITOS_ORIGINAIS } from '../public/js/insumos.js';
import { CAMPO } from './lugares.mjs';

const idx = (id) => IDX_ARMA['o' + id];
const PARALISANTE = '312010'; // Míssil Paralisante (Lock-Down Missile): mira "alvo à frente", raio 183,5 m

function rngFixo(semente = 1) {
  let s = semente;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** Mundo sem monstros, com as naves em (x0 + dx, z0 + dz) olhando para -z; times alternam (A 0, B 1...). */
function arena(lista, { x0 = CAMPO.x, z0 = CAMPO.z } = {}) {
  const w = new World({ preparacaoS: 0, jungle: false, critico: false, torretas: false, rng: rngFixo() });
  w.mineradores.passo = () => {};
  const js = lista.map(([race, classe, dx, dz], i) => {
    const j = w.addPlayer('P' + i, race, classe);
    j.ship = createShip(race, x0 + dx, z0 + dz, 0, classe);
    j.protegidoAte = 0;
    return j;
  });
  return { w, js };
}

/** Põe a arma `id` no Z (e no X, se `nosDois`) de `j` e dispara o Z uma vez. */
function disparar(w, j, id, nosDois = false) {
  const a = idx(id);
  j.ship.encaixes = [a, nosDois ? a : j.ship.encaixes[1]];
  j.seq ??= 0;
  w.pushInput(j.id, { s: ++j.seq, ...INPUT_VAZIO, f1: true, a, ...(nosDois ? { a2: a } : {}) });
  w.step();
}

/** A mira da tela de `j` sobre o snapshot dele (o que o cliente tem). */
function miraDaTela(w, j) {
  const snap = w.snapshotPara(j, w.entidades(), []);
  const s = j.ship;
  const eu = { id: j.id, time: j.time, x: s.x, y: s.y, z: s.z, yaw: s.yaw };
  return alvosDaMira({ eu, encaixes: s.encaixes, nivEnc: s.nivEnc, ents: snap.ents, torretas: snap.torretas });
}

test('mira: a esfera do original fica R metros à frente do nariz e alcança 2R', () => {
  const e = esferaDaMira(100, 0, 0, 0); // yaw 0 olha para -z
  assert.deepEqual({ cx: Math.round(e.cx), cz: Math.round(e.cz), raio: e.raio }, { cx: 0, cz: -100, raio: 100 });
  const mira = { modo: 'alvo_a_frente', raio: 100 };
  const em = (x, z, raio = 0) => alvoDaMira(mira, [{ id: 1, x, z, raio }], 0, 0, 0);
  assert.ok(em(0, -195), 'à frente, perto do alcance (2R)');
  assert.equal(em(0, -205), null, 'além de 2R');
  assert.ok(em(0, -205, 6), 'o alvo grande encosta de mais longe');
  assert.equal(em(0, 30), null, 'atrás não');
  assert.equal(em(120, -10), null, 'do lado, rente à nave, não');
});

test('mira: entre os da esfera vale o mais perto da linha do nariz, não o mais perto da nave', () => {
  const mira = { modo: 'mais_perto_no_raio', raio: 150 };
  const longeNoNariz = { id: 1, x: 2, z: -280 };
  const pertoDeLado = { id: 2, x: -60, z: -90 };
  assert.equal(alvoDaMira(mira, [pertoDeLado, longeNoNariz], 0, 0, 0), longeNoNariz);
  // Virando a nave para o outro, a mira troca.
  const yaw = Math.atan2(60, 90); // olhando para (-60, -90)
  assert.equal(alvoDaMira(mira, [pertoDeLado, longeNoNariz], 0, 0, yaw), pertoDeLado);
  // No aleatório com semente, um dos que estão na esfera (o mesmo para a mesma semente).
  const al = { modo: 'aleatorio_no_raio', raio: 150 };
  const a = alvoDaMira(al, [pertoDeLado, longeNoNariz], 0, 0, 0, { semente: 7 });
  assert.equal(alvoDaMira(al, [pertoDeLado, longeNoNariz], 0, 0, 0, { semente: 7 }), a);
  assert.equal(alvoDaMira(mira, [], 0, 0, 0), null, 'ninguém: sem mira');
});

test('mira: só as armas com tipo de alvo do original mostram a mira (o Míssil Paralisante sim, o feixe de fábrica não)', () => {
  assert.ok(golpeComMira(idx(PARALISANTE), 1));
  assert.ok(golpeComMira(idx(PARALISANTE), 8));
  assert.equal(golpeComMira(idx('311001'), 1), null); // Metralha Shrewdo, de fábrica
  assert.equal(golpeComMira(-1, 1), null);
  // A esfera dele alcança o "Shooting range" do cartão (2R = o alcance da arma).
  const g = golpeDaArma(idx(PARALISANTE), 1);
  assert.ok(Math.abs(2 * g.mira.raio - g.alcance) < 1, `${2 * g.mira.raio} × ${g.alcance}`);
});

test('mira no servidor: o tiro da nave trava no alvo da esfera, até o alcance da arma (além do raio da mira)', () => {
  // A 300 m à frente: fora do raio da mira (183,5) mas dentro do alcance (367).
  const { w, js } = arena([['shrewdo', 'functional', 0, 0], ['bellico', 'assault', -25, -300]]);
  const [a, b] = js;
  disparar(w, a, PARALISANTE);
  assert.equal(w.bullets[0]?.alvo, b.id, 'travou no inimigo a 300 m');
  // Atrás, ninguém: o míssil sai sem trava.
  const { w: w2, js: j2 } = arena([['shrewdo', 'functional', 0, 0], ['bellico', 'assault', 0, 120]]);
  disparar(w2, j2[0], PARALISANTE);
  assert.equal(w2.bullets[0]?.alvo, undefined);
});

test('mira no servidor: trava no mais perto da linha do nariz, e a mira da tela mostra o mesmo', () => {
  const { w, js } = arena([
    ['shrewdo', 'functional', 0, 0],
    ['bellico', 'assault', -70, -100], // perto, mas de lado
    ['acron', 'assault', 0, 0], // aliado (time 0): a mira não mostra
    ['bellico', 'assault', 3, -320], // longe, no nariz
  ]);
  const [a, , c, d] = js;
  c.ship = createShip('acron', CAMPO.x + 1, CAMPO.z - 150, 0, 'assault'); // aliado na frente
  a.ship.encaixes = [idx(PARALISANTE), idx(PARALISANTE)];
  const tela = miraDaTela(w, a);
  assert.equal(tela[0]?.id, d.id, 'Z: o do nariz');
  assert.equal(tela[1]?.id, d.id, 'X com a mesma arma: o mesmo alvo (seis triângulos)');
  disparar(w, a, PARALISANTE, true);
  assert.equal(w.bullets[0]?.alvo, d.id, 'o tiro vai em quem a mira mostra');
});

test('mira: trava na torre sentinela de pé do outro time (e não na do próprio)', () => {
  // T1-3 (time 1) em (427,5; 133): a nave do time 0 a 250 m dela, olhando para ela.
  const { w, js } = arena([['shrewdo', 'functional', 0, 0]], { x0: 427.5, z0: 133 + 250 });
  const [a] = js;
  assert.equal(a.time, 0);
  a.ship.encaixes = [idx(PARALISANTE), a.ship.encaixes[1]];
  assert.equal(miraDaTela(w, a)[0]?.id, 'T1-3', 'a mira da tela na torre');
  disparar(w, a, PARALISANTE);
  const m = w.bullets[0];
  assert.equal(m?.alvo, 'T1-3', 'o míssil travou na torre');
  // O míssil travado curva até a torre e bate nela (o dano é do jogador inimigo).
  const t = w.torretas.torreta('T1-3');
  const hp = t.hp;
  for (let i = 0; i < 4 * 30 && t.hp === hp; i++) w.step();
  assert.ok(t.hp < hp, 'acertou a torre');
  // Torre caída não é alvo.
  t.viva = false;
  assert.equal(miraDaTela(w, a)[0], null);
  // A torre do próprio time não aparece.
  const cands = candidatosDaMira(golpeComMira(idx(PARALISANTE)), { id: 0, time: 1, x: 427.5, z: 383 }, [], [{ id: 'T1-3', viva: true }]);
  assert.equal(cands.length, 0);
});

test('mira: a arma de suporte (Druida Reparador) mira os pilotos aliados, não o inimigo', () => {
  const g = golpeComMira(idx('312025'));
  assert.ok(g && g.aliado);
  const eu = { id: 1, time: 0, x: 0, y: 10, z: 0, yaw: 0 };
  const ents = [
    { id: 2, vivo: true, tipo: 'jogador', time: 1, x: 0, y: 10, z: -100 },
    { id: 3, vivo: true, tipo: 'jogador', time: 0, x: 10, y: 10, z: -200 },
    { id: 4, vivo: true, tipo: 'minerador', time: 0, x: 0, y: 10, z: -50 },
  ];
  const [z] = alvosDaMira({ eu, encaixes: [idx('312025'), -1], nivEnc: [1, 1], ents });
  assert.equal(z?.id, 3);
});

test('mira: a tela não mostra morto, nem alvo do outro lado do campo de força de uma base', () => {
  const g = golpeComMira(idx(PARALISANTE));
  const eu = { id: 1, time: 1, x: -1080, z: 0 }; // na frente do campo da base do time 0 (x −1125)
  const ents = [
    { id: 2, vivo: true, tipo: 'jogador', time: 0, x: -1160, y: 10, z: 0 }, // atrás do campo
    { id: 3, vivo: false, tipo: 'jogador', time: 0, x: -1000, y: 10, z: 0 },
  ];
  assert.equal(candidatosDaMira(g, eu, ents).length, 0);
});

test('mira: o snapshot traz o raio de acerto de cada entidade (a mira da tela conta com ele)', () => {
  const w = new World({ preparacaoS: 0, jungle: false, torretas: false });
  const b = w.addPlayer('B', 'bellico', 'assault'); // a nave da partida (prepararNave) tem o raio do original
  assert.ok(b.ship.raio > 0);
  const e = w.entidades().find((x) => x.id === b.id); // o que vai no `ents` do snapshot
  assert.equal(e.r, +b.ship.raio.toFixed(1));
});

test('mira: os efeitos do original (target01 no Z, target02 no X) baixam na partida', () => {
  assert.deepEqual([...EFEITO_MIRA], ['target01', 'target02']);
  for (const id of EFEITO_MIRA) {
    assert.ok(EFEITOS_ORIGINAIS.includes(id), id);
    const url = new URL(`../public/modelos/efeitos/${id}.json`, import.meta.url);
    assert.ok(existsSync(url), id);
    const j = JSON.parse(readFileSync(url, 'utf8'));
    assert.equal(j.quadros, 12);
    assert.equal(j.volta, 10, 'fecha em 10 quadros e fica piscando');
    for (const p of j.pecas) assert.ok(existsSync(new URL(`../public/texturas/efeitos/${p.tex}.png`, import.meta.url)), p.tex);
  }
  // Escala do original (0,5 m por unidade): 14,75 m fechada; no alvo grande, por fora dele.
  assert.equal(escalaDaMira(5, 0.5), 0.5);
  assert.ok(escalaDaMira(26, 0.5) * RAIO_MIRA_FECHADA > 26);
});

test('mira: a tela refaz a escolha a cada 12 quadros do original, ou na hora se a arma muda ou o alvo some', () => {
  const r = new RitmoDaMira();
  let vez = 0;
  const calcular = () => [{ id: ++vez }, null];
  const sempre = () => true;
  assert.equal(r.alvos(0, 'a', sempre, calcular)[0].id, 1);
  assert.equal(r.alvos(MIRA_REFAZER_S * 0.9, 'a', sempre, calcular)[0].id, 1, 'segura o alvo entre uma escolha e outra');
  assert.equal(r.alvos(MIRA_REFAZER_S, 'a', sempre, calcular)[0].id, 2, 'refaz no tempo do original');
  assert.equal(r.alvos(MIRA_REFAZER_S + 0.01, 'b', sempre, calcular)[0].id, 3, 'trocou a arma: na hora');
  assert.equal(r.alvos(MIRA_REFAZER_S + 0.02, 'b', () => false, calcular)[0].id, 4, 'o alvo sumiu: na hora');
  r.limpar();
  assert.deepEqual(r.atuais, [null, null]);
  assert.ok(Math.abs(MIRA_REFAZER_S - 0.5) < 1e-9);
});
