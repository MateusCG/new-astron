// Comportamento dos monstros da jungle (server/jungle.js), com monstros avulsos
// (criarMonstro) num mundo sem os lugares de nascimento: passivos, raiva, aproximar
// sem alcance (MD §10), território (volta e regenera), contornar rocha e os ataques.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World, ZONA_SEGURA } from '../server/game.js';
import { createShip } from '../shared/sim.js';
import { BASES, BUFFS, heightAt } from '../shared/terrain.js';
import { bloqueiaVisao } from '../shared/visao.js';
import { ESPECIES, alcanceMaximo } from '../server/especies.js';
import { RAIVA_S, corpoLivre } from '../server/jungle.js';
import { CAMPO } from './lugares.mjs';

function rngFixo(semente = 1) {
  let s = semente;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** Mundo sem os lugares de nascimento, com um jogador parado em (x, z). */
function mundo(x = CAMPO.x, z = CAMPO.z, race = 'bellico') {
  const w = new World({ preparacaoS: 0, jungle: false, torretas: false, rng: rngFixo(7) });
  const j = w.addPlayer('Alvo', race);
  j.ship = createShip(race, x, z, 0);
  j.protegidoAte = 0;
  w.step();
  return { w, j };
}

/** Avança `s` segundos com o jogador parado (sem comando), juntando os eventos. */
function rodar(w, s, cada) {
  const ev = [];
  for (let i = 0; i < Math.round(s * 30); i++) {
    w.step();
    ev.push(...w.tirarEventos());
    cada?.(i);
  }
  return ev;
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

test('monstros: o snapshot traz tipo monstro com a espécie (e só os vivos)', () => {
  const { w } = mundo();
  const a = w.jungle.criarMonstro('armish', CAMPO.x, CAMPO.z - 200);
  const b = w.jungle.criarMonstro('great_xerxes', CAMPO.x + 60, CAMPO.z - 200);
  const ents = w.entidades().filter((e) => e.tipo === 'monstro');
  assert.deepEqual(ents.map((e) => [e.esp, e.drone, e.maxHp]).sort(), [
    ['armish', true, ESPECIES.armish.hp],
    ['great_xerxes', true, ESPECIES.great_xerxes.hp],
  ]);
  assert.ok(!w.entidades().some((e) => ['arnosh', 'vorax', 'krakor', 'guardiao', 'drone'].includes(e.tipo)), 'os monstros antigos saíram');
  b.vivo = false;
  assert.deepEqual(w.entidades().filter((e) => e.tipo === 'monstro').map((e) => e.id), [a.id], 'morto não vem');
});

test('monstros: passivos, patrulham perto do ponto e ignoram quem passa perto', () => {
  const { w, j } = mundo();
  const m = w.jungle.criarMonstro('xerxes', CAMPO.x, CAMPO.z - 40);
  const ev = rodar(w, 20);
  assert.equal(j.ship.hp, j.ship.maxHp, 'ninguém atacou');
  assert.ok(!ev.some((e) => (e.e === 'tiro' || e.e === 'chama') && (e.dono ?? e.id) === m.id), 'sem ataque');
  assert.ok(dist(m.ship, m.casa) < 40, `ficou perto do ponto (${dist(m.ship, m.casa).toFixed(0)} m)`);
});

test('monstros: atacado, o grupo fica com raiva de quem atirou e esquece depois de RAIVA_S', () => {
  const { w, j } = mundo();
  const covil = { membros: [] }; // grupo de teste (o acampamento)
  const a = w.jungle.criarMonstro('armish', CAMPO.x, CAMPO.z - 150, { covil });
  const b = w.jungle.criarMonstro('armish', CAMPO.x + 30, CAMPO.z - 150, { covil });
  covil.membros.push(a, b);
  // Tiros de verdade do jogador no primeiro.
  j.ship.yaw = Math.atan2(-(a.ship.x - j.ship.x), -(a.ship.z - j.ship.z));
  let seq = j.ack;
  for (let i = 0; i < 60 && a.raiva.size === 0; i++) {
    w.pushInput(j.id, { s: ++seq, f1: true });
    w.step();
  }
  assert.ok(w.jungle.provocado(a, j), 'quem levou o tiro');
  assert.ok(w.jungle.provocado(b, j), 'e o resto do acampamento');
  // O jogador vai para a base (fora do alcance de tudo), o tempo passa e eles esquecem.
  j.ship = createShip('bellico', BASES[0].x, BASES[0].z, 0);
  rodar(w, RAIVA_S + 1);
  assert.equal(w.jungle.provocado(a, j), false);
  assert.equal(w.jungle.provocado(b, j), false);
});

test('monstros: provocado e sem alcance, se aproxima de quem atacou até ter alcance e ataca (MD §10)', () => {
  const { w, j } = mundo();
  // O Grande Xerxes só tem a chama (110 m); o jogador atirou de 220 m.
  const m = w.jungle.criarMonstro('great_xerxes', CAMPO.x, CAMPO.z - 220);
  w.jungle.provocar(m, j.id);
  const ev = rodar(w, 10);
  assert.ok(dist(m.ship, j.ship) <= alcanceMaximo('great_xerxes'), `chegou perto (${dist(m.ship, j.ship).toFixed(0)} m)`);
  assert.ok(ev.some((e) => e.e === 'chama' && e.id === m.id), 'soltou a chama');
  assert.ok(j.ship.hp < j.ship.maxHp, 'a chama queimou');
  assert.ok(ev.some((e) => e.e === 'acerto' && e.alvo === j.id && e.atq === 'chama'));
});

test('monstros: com alcance, fica onde está e atira (não encosta)', () => {
  const { w, j } = mundo();
  const m = w.jungle.criarMonstro('bazit', CAMPO.x, CAMPO.z - 120); // feixe de 200 m
  const ini = { x: m.ship.x, z: m.ship.z };
  w.jungle.provocar(m, j.id);
  const ev = rodar(w, 5);
  assert.ok(dist(m.ship, ini) < 20, 'não andou atrás');
  const tiros = ev.filter((e) => e.e === 'tiro' && e.dono === m.id);
  assert.ok(tiros.length >= 6, `atirou (${tiros.length} feixes)`);
  assert.ok(tiros.every((t) => t.atq === 'feixe_optico' && t.kind === 'laser'));
  assert.ok(j.ship.hp < j.ship.maxHp);
});

test('monstros: não passam do território; passou, desistem, voltam ao ponto e regeneram', () => {
  const { w, j } = mundo();
  const m = w.jungle.criarMonstro('xerxes', CAMPO.x, CAMPO.z - 150, { territorio: 100 });
  w.jungle.provocar(m, j.id);
  // Puxado para fora do território, meio morto.
  m.ship.x = m.casa.x + 160;
  m.ship.hp = m.ship.maxHp / 2;
  rodar(w, 0.1);
  assert.equal(m.voltando, true);
  assert.equal(m.raiva.size, 0, 'esqueceu de todo mundo');
  rodar(w, 10);
  assert.equal(m.voltando, false);
  assert.ok(dist(m.ship, m.casa) < 40, 'voltou ao ponto');
  assert.equal(m.ship.hp, m.ship.maxHp, 'regenerou');
  // Quem foi para longe do território (além do alcance) também é esquecido.
  w.jungle.provocar(m, j.id);
  j.ship = createShip('bellico', m.casa.x + 100 + alcanceMaximo('xerxes') + 150, m.casa.z, 0);
  rodar(w, 0.2);
  assert.equal(w.jungle.provocado(m, j), false);
});

test('monstros: com rocha no meio, contorna até ter linha de tiro', () => {
  // Rocha do quadrante Q0N (-697,5, -652,5): jogador de um lado, Anti (mísseis, 240 m) do outro.
  const { w, j } = mundo(-697.5, -652.5 - 140);
  j.ship.maxHp = j.ship.hp = 1e6;
  const m = w.jungle.criarMonstro('anti', -697.5, -652.5 + 140, { territorio: 600 });
  assert.ok(bloqueiaVisao(m.ship.x, m.ship.z, j.ship.x, j.ship.z), 'começa sem linha');
  w.jungle.provocar(m, j.id);
  let livre = false;
  const ev = rodar(w, 25, () => {
    if (!bloqueiaVisao(m.ship.x, m.ship.z, j.ship.x, j.ship.z)) livre = true;
  });
  assert.ok(livre, 'achou a linha contornando');
  assert.ok(ev.some((e) => e.e === 'tiro' && e.dono === m.id && e.atq === 'missil'), 'e atirou os mísseis');
});

test('monstros: não atacam quem está na zona segura nem acertam outro monstro', () => {
  const b = BASES[0];
  const { w, j } = mundo(b.x, b.z);
  const m = w.jungle.criarMonstro('armish', b.x + ZONA_SEGURA + 60, b.z, { territorio: 1000 });
  const outro = w.jungle.criarMonstro('armish', b.x + ZONA_SEGURA + 30, b.z + 40);
  m.raiva.set(j.id, Infinity);
  const ev = rodar(w, 5);
  assert.ok(!ev.some((e) => e.e === 'tiro' && e.dono === m.id), 'sem tiro em quem está na base');
  assert.equal(outro.ship.hp, outro.ship.maxHp);
});

test('monstros: a Medusa alterna os ataques um de cada vez; o SN-4 solta mísseis, onda e campo', () => {
  const { w, j } = mundo(0, 877 - 120);
  j.ship.maxHp = j.ship.hp = 1e6; // só medimos os ataques
  const med = w.jungle.criarMonstro('medusa', 0, 877);
  w.jungle.provocar(med, j.id);
  const porTick = new Map();
  for (let i = 0; i < 30 * 25; i++) {
    w.step();
    for (const e of w.tirarEventos()) {
      if (e.e !== 'tiro' || e.dono !== med.id) continue;
      if (!porTick.has(w.tick)) porTick.set(w.tick, new Set());
      porTick.get(w.tick).add(e.atq);
    }
  }
  const atqs = new Set([...porTick.values()].flatMap((s) => [...s]));
  assert.ok(atqs.has('pedra_gigante') && atqs.has('controle'), `pedras e controle (${[...atqs]})`);
  assert.ok([...porTick.values()].every((s) => s.size === 1), 'um ataque por vez');
  assert.ok(j.ship.desgov > 0 || j.ship.hp < j.ship.maxHp, 'acertou');

  const outro = mundo();
  const sn = outro.w.jungle.criarMonstro('sn4', CAMPO.x, CAMPO.z - 50);
  outro.j.ship.maxHp = outro.j.ship.hp = 1e6;
  outro.w.jungle.provocar(sn, outro.j.id);
  outro.w.step(); // os mísseis saem no primeiro passo: estão em voo no snapshot
  assert.ok(outro.w.snapshotPara(outro.j, [], []).guiados.some((g) => g.atq === 'missil_cruzador'), 'mísseis no guiados');
  const ev = [...outro.w.tirarEventos(), ...rodar(outro.w, 2)];
  assert.ok(ev.some((e) => e.e === 'nova' && e.dono === sn.id && e.atq === 'onda_feixe'), 'onda em volta');
  assert.ok(ev.some((e) => e.e === 'tiro' && e.dono === sn.id && e.atq === 'missil_cruzador'), 'mísseis');
  assert.ok(outro.w.minas.some((m) => m.dono === sn.id && m.campo && m.g.atq === 'campo_eletrico'), 'campo elétrico no chão');
  const snap = outro.w.snapshotPara(outro.j, outro.w.entidades(), []);
  assert.ok(snap.minas.some((m) => m.atq === 'campo_eletrico'));
});

test('monstros: o SN-4 tem o dobro do tamanho, cabe no buff de ataque e não entra na rocha', () => {
  // O raio de acerto dobrou junto com o modelo (13 → 26 m; o glb tem 30 m e é desenhado 2×).
  assert.equal(ESPECIES.sn4.raio, 26);
  assert.equal(ESPECIES.sn4.tamanho, 60);
  for (const b of BUFFS.filter((x) => x.tipo === 'ataque')) assert.ok(corpoLivre(b.x, b.z, ESPECIES.sn4.raio), `o SN-4 cabe no ${b.id}`);

  // Um lugar no território do BA0 com o corpo livre mas a menos de 40 m da rocha, e o
  // rumo da rocha mais perto.
  const ba = BUFFS.find((x) => x.id === 'BA0');
  const r = ESPECIES.sn4.raio;
  let lugar = null;
  for (let dx = -170; dx <= 170 && !lugar; dx += 5) {
    for (let dz = -170; dz <= 170 && !lugar; dz += 5) {
      const x = ba.x + dx;
      const z = ba.z + dz;
      if (Math.hypot(dx, dz) <= 170 && corpoLivre(x, z, r) && !corpoLivre(x, z, r + 12)) lugar = { x, z };
    }
  }
  assert.ok(lugar, 'achou um lugar perto da rocha');
  let rumo = 0;
  for (let a = 0; a < 64; a++) {
    const ang = (a / 64) * Math.PI * 2;
    if (heightAt(lugar.x + Math.cos(ang) * (r + 12), lugar.z + Math.sin(ang) * (r + 12)) > 0.5) rumo = ang;
  }
  // A "casa" dele do outro lado da rocha: ele vai reto para lá e esbarra.
  const { w } = mundo();
  const sn = w.jungle.criarMonstro('sn4', lugar.x, lugar.z, { territorio: 1000 });
  sn.casa = { x: lugar.x + Math.cos(rumo) * 200, z: lugar.z + Math.sin(rumo) * 200 };
  let andou = 0;
  rodar(w, 8, () => {
    assert.ok(corpoLivre(sn.ship.x, sn.ship.z, r), `casco na rocha em (${sn.ship.x.toFixed(0)}, ${sn.ship.z.toFixed(0)})`);
    andou = Math.max(andou, Math.hypot(sn.ship.x - lugar.x, sn.ship.z - lugar.z));
  });
  assert.ok(andou > 1, 'chegou a andar (a regra freia, não congela)');
});
