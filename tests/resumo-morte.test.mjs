// Resumo da última morte, como o do Dota 2 (server/resumo-morte.js + server/game.js e o
// painel em public/js/ultima-morte.js): quem deu o golpe final, quem feriu nos últimos
// RESUMO_MORTE_S e quanto de cada tipo de dano, num evento privado de quem morreu.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../server/game.js';
import { anotarDano, resumoDaMorte, fonteDoGolpe, RESUMO_MORTE_S } from '../server/resumo-morte.js';
import { linhasDoResumo } from '../public/js/ultima-morte.js';
import { createShip, IDX_ARMA, WEAPONS, ARMAS } from '../shared/sim.js';
import { CAMPOS_BASE } from '../shared/terrain.js';
import { CAMPO } from './lugares.mjs';

const SEGUNDO = 30; // ticks

function rngFixo(semente = 1) {
  let s = semente;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** Mundo sem monstros, mineradores nem torretas, com `n` pilotos Bellico (times 0, 1, 0, 1...) a 200 m um do outro. */
function arena(n) {
  const w = new World({ preparacaoS: 0, jungle: false, torretas: false, ouroPorSegundo: 0, critico: false, rng: rngFixo() });
  w.mineradores.passo = () => {};
  w.escoltas.passo = () => {};
  const js = [];
  for (let i = 0; i < n; i++) {
    const j = w.addPlayer('P' + i, 'bellico');
    colocar(j, i);
    js.push(j);
  }
  w.step();
  return { w, js };
}

function colocar(j, i) {
  j.ship = createShip('bellico', CAMPO.x + i * 200, CAMPO.z, 0);
  j.ship.time = j.time;
  j.ship.encaixes = [IDX_ARMA.choque, j.ship.encaixes[1]];
  j.protegidoAte = 0;
}

/** `a` encosta em `alvo` e solta a onda de choque; com `mata`, o alvo está com 1 de HP. Devolve os eventos. */
function golpear(w, a, alvo, mata = false) {
  w.tirarEventos();
  Object.assign(a.ship, { x: alvo.ship.x, y: alvo.ship.y, z: alvo.ship.z + 10, vx: 0, vz: 0, cd1: 0, en: a.ship.maxEn });
  if (mata) alvo.ship.hp = 1;
  a.seq ??= 0;
  w.pushInput(a.id, { s: ++a.seq, f1: true, a: IDX_ARMA.choque });
  w.step();
  const ev = w.tirarEventos();
  // Volta para longe: o próximo golpe é de quem o teste mandar.
  colocar(a, 3 + a.id);
  return ev;
}

/** O dano que os acertos em `id` levaram, por tipo da arma que acertou. */
function danoPorTipo(eventos, id) {
  const r = { fisico: 0, laser: 0, eletrico: 0, outro: 0 };
  for (const e of eventos) if (e.e === 'acerto' && e.alvo === id) r[WEAPONS[ARMAS[e.kind] ?? e.kind]?.tipoDano ?? 'outro'] += e.dano;
  return r;
}

test('resumo: soma por fonte e por tipo, a maior fonte primeiro, e o que passou da janela sai', () => {
  const alvo = {};
  const a = { id: 1, nome: 'A', tipo: 'jogador' };
  const m = { id: 9, nome: 'Xerxes', tipo: 'monstro' };
  anotarDano(alvo, 0, a, 'laser', 500); // velho demais na hora da morte
  const t = RESUMO_MORTE_S * SEGUNDO + 10;
  anotarDano(alvo, t, a, 'laser', 300);
  anotarDano(alvo, t, a, 'laser', 200); // mesmo tick, fonte e tipo: mesma linha
  anotarDano(alvo, t + 1, a, 'fisico', 100);
  anotarDano(alvo, t + 2, m, 'eletrico', 700);
  anotarDano(alvo, t + 3, m, undefined, 50); // sem tipo
  anotarDano(alvo, t + 3, m, 'eletrico', 0); // nada entrou: não anota
  const r = resumoDaMorte(alvo, t + 5, a);
  assert.equal(r.janela, RESUMO_MORTE_S);
  assert.equal(r.por, a);
  assert.deepEqual(r.tipos, { fisico: 100, laser: 500, eletrico: 700, outro: 50 });
  assert.equal(r.total, 1350);
  assert.deepEqual(
    r.fontes.map((f) => [f.nome, f.total, f.fisico, f.laser, f.eletrico, f.outro]),
    [
      ['Xerxes', 750, 0, 0, 700, 50],
      ['A', 600, 100, 500, 0, 0],
    ],
  );
  assert.deepEqual(alvo.danoRecente, [], 'a anotação zera na morte');
});

test('resumo: a fonte leva o nome, o tipo, o time e o nível de quem bateu', () => {
  assert.deepEqual(fonteDoGolpe({ id: 3, nome: 'ZED (IA)', tipo: 'jogador', time: 1, nivel: 7, ia: {} }), { id: 3, nome: 'ZED (IA)', tipo: 'jogador', time: 1, nivel: 7, ia: 1 });
  assert.deepEqual(fonteDoGolpe({ id: 4, nome: 'SN-4', tipo: 'monstro', esp: 'sn4' }), { id: 4, nome: 'SN-4', tipo: 'monstro', esp: 'sn4' });
  assert.equal(fonteDoGolpe(undefined).tipo, 'desconhecido');
});

test('servidor: quem morre recebe só ele o resumo, com o golpe final, quem feriu e o dano de cada tipo', () => {
  // A e C (time 0) contra B (time 1).
  const { w, js } = arena(3);
  const [a, b, c] = js;
  const ev1 = golpear(w, c, b);
  const ev2 = golpear(w, a, b, true);
  assert.equal(b.vivo, false);
  const r = ev2.find((e) => e.e === 'resumoMorte');
  assert.ok(r, 'saiu o resumo');
  assert.equal(r.para, b.id);
  assert.equal(r.por.id, a.id);
  assert.equal(r.por.nome, 'P0');
  assert.equal(r.por.tipo, 'jogador');
  assert.equal(r.por.time, 0);
  assert.deepEqual(r.fontes.map((f) => f.id).sort(), [a.id, c.id].sort(), 'os dois que feriram');
  const esperado = danoPorTipo([...ev1, ...ev2], b.id);
  const total = Object.values(esperado).reduce((s, v) => s + v, 0);
  assert.ok(total > 0);
  for (const [tipo, v] of Object.entries(esperado)) assert.ok(Math.abs(r.tipos[tipo] - v) <= 1, `${tipo}: ${r.tipos[tipo]} ≈ ${v}`);
  assert.ok(Math.abs(r.total - total) <= 2, `total ${r.total} ≈ ${total}`);
  // Privado: o snapshot do matador não leva, o de quem morreu leva.
  assert.equal(w.snapshotPara(a, [], ev2).ev.some((e) => e.e === 'resumoMorte'), false);
  assert.equal(w.snapshotPara(b, [], ev2).ev.some((e) => e.e === 'resumoMorte'), true);
  assert.deepEqual(b.danoRecente, [], 'zera para a próxima vida');
});

test('servidor: o dano de mais de RESUMO_MORTE_S antes da morte não entra', () => {
  const { w, js } = arena(3);
  const [a, b, c] = js;
  golpear(w, c, b);
  for (let t = 0; t < (RESUMO_MORTE_S + 1) * SEGUNDO; t++) w.step();
  const r = golpear(w, a, b, true).find((e) => e.e === 'resumoMorte');
  assert.deepEqual(r.fontes.map((f) => f.id), [a.id], 'só quem feriu na janela');
});

test('servidor: a morte no campo de força da base sai com o campo no golpe final', () => {
  const { w, js } = arena(2);
  const b = js[1];
  const C = CAMPOS_BASE[0];
  Object.assign(b.ship, { x: C.x + 2, z: 20, vx: 0, vz: 0 });
  w.step();
  const r = w.tirarEventos().find((e) => e.e === 'resumoMorte');
  assert.ok(r, 'saiu o resumo');
  assert.equal(r.por.tipo, 'campo');
  assert.equal(r.por.time, 0);
});

test('painel: golpe final, fontes com a barrinha por tipo e os tipos do maior para o menor', () => {
  const resumo = {
    janela: 15,
    por: { id: 5, nome: 'KAI', tipo: 'jogador', time: 1, nivel: 8 },
    fontes: [
      { id: 5, nome: 'KAI', tipo: 'jogador', time: 1, nivel: 8, total: 1000, fisico: 0, laser: 1000, eletrico: 0, outro: 0 },
      { id: 9, nome: 'Xerxes', tipo: 'monstro', esp: 'xerxes', total: 500, fisico: 400, laser: 0, eletrico: 100, outro: 0 },
      { id: 2, nome: 'P0', tipo: 'jogador', time: 0, nivel: 3, total: 10, fisico: 0, laser: 0, eletrico: 0, outro: 10 },
    ],
    tipos: { fisico: 400, laser: 1000, eletrico: 100, outro: 10 },
    total: 1510,
  };
  const l = linhasDoResumo(resumo, 0, 2);
  assert.deepEqual(l.por, { nome: 'KAI', selo: 'NV 8', classe: 'inimigo' });
  assert.deepEqual(
    l.fontes.map((f) => [f.nome, f.selo, f.classe, f.total]),
    [
      ['KAI', 'NV 8', 'inimigo', 1000],
      ['Xerxes', 'Monstro', 'inimigo', 500],
      ['Você', 'NV 3', 'aliado', 10],
    ],
  );
  assert.deepEqual(l.fontes[1].partes, [
    { tipo: 'fisico', frac: 0.4 },
    { tipo: 'eletrico', frac: 0.1 },
  ]);
  assert.deepEqual(
    l.tipos.map((t) => `${t.sigla}: ${t.v}`),
    ['Op.: 1000', 'Ph.: 400', 'El.: 100', 'Outros: 10'],
  );
  // Sem dano sem tipo, "Outros" não aparece; os três tipos sempre.
  const sem = linhasDoResumo({ ...resumo, tipos: { fisico: 0, laser: 0, eletrico: 0, outro: 0 }, fontes: [], por: { id: null, nome: 'Campo de força da base', tipo: 'campo', time: 1 } }, 0, 2);
  assert.deepEqual(sem.tipos.map((t) => t.sigla).sort(), ['El.', 'Op.', 'Ph.']);
  assert.deepEqual(sem.por, { nome: 'Campo de força da base', selo: 'Base', classe: 'inimigo' });
});
