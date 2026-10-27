// Comportamento dos monstros da jungle (server/jungle.js), com monstros avulsos
// (criarMonstro) num mundo sem os lugares de nascimento: passivos, raiva, aproximar
// sem alcance (MD §10), território (volta e regenera), contornar rocha e os ataques.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World, ZONA_SEGURA } from '../server/game.js';
import { createShip } from '../shared/sim.js';
import { BASES, BUFFS, heightAt } from '../shared/terrain.js';
import { bloqueiaVisao } from '../shared/visao.js';
import { readFileSync } from 'node:fs';
import { ESPECIES, alcanceMaximo, FATOR_HP_M5, FATOR_DANO_M5, FATOR_XP_M5, FATOR_RECARGA_ORIGINAL, FATOR_RECARGA_MEDUSA, FATOR_VEL_MONSTRO, FATOR_DANO_ESPECIE, FATOR_DANO_MONSTRO, ALCANCE_MAX_ORIGINAL } from '../server/especies.js';
import { ARMAS_NPC_ORIGINAL } from '../shared/armas-original.js';
import { RAIVA_S, corpoLivre, golpeDoAtaque } from '../server/jungle.js';
import { MINA_MAX_MONSTRO } from '../server/golpes.js';
import { WEAPONS, ARMAS, FATOR_AREA, MINA_MAX, armasDisponiveis, visualDoOriginal } from '../shared/armas.js';
import { RACAS_JOGAVEIS, ORDEM_CLASSES, FATOR_ESCALA_HP } from '../shared/naves.js';
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
  const a = w.jungle.criarMonstro('sn3', CAMPO.x, CAMPO.z - 200);
  const b = w.jungle.criarMonstro('great_xerxes', CAMPO.x + 60, CAMPO.z - 200);
  const ents = w.entidades().filter((e) => e.tipo === 'monstro');
  assert.deepEqual(ents.map((e) => [e.esp, e.drone, e.maxHp]).sort(), [
    ['great_xerxes', true, ESPECIES.great_xerxes.hp],
    ['sn3', true, ESPECIES.sn3.hp],
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
  const a = w.jungle.criarMonstro('sn3', CAMPO.x, CAMPO.z - 150, { covil });
  const b = w.jungle.criarMonstro('sn3', CAMPO.x + 30, CAMPO.z - 150, { covil });
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
  // O Grande Xerxes só tem o lança-chamas (~230 m); o jogador atirou de 400 m.
  j.ship.maxHp = j.ship.hp = 1e6;
  const m = w.jungle.criarMonstro('great_xerxes', CAMPO.x, CAMPO.z - 400, { territorio: 600 });
  w.jungle.provocar(m, j.id);
  const ev = rodar(w, 12);
  assert.ok(dist(m.ship, j.ship) <= alcanceMaximo('great_xerxes'), `chegou perto (${dist(m.ship, j.ship).toFixed(0)} m)`);
  assert.ok(ev.some((e) => e.e === 'tiro' && e.dono === m.id && e.atq === 'lanca_chamas_g' && e.kind === 'n511155'), 'soltou as bolas de fogo');
  assert.ok(j.ship.hp < j.ship.maxHp, 'a chama queimou');
  assert.ok(ev.some((e) => e.e === 'acerto' && e.alvo === j.id && e.atq === 'lanca_chamas_g'));
});

test('monstros: com alcance, fica onde está e atira (não encosta)', () => {
  const { w, j } = mundo();
  const m = w.jungle.criarMonstro('bazit', CAMPO.x, CAMPO.z - 120); // feixe de ~156 m
  const ini = { x: m.ship.x, z: m.ship.z };
  w.jungle.provocar(m, j.id);
  const ev = rodar(w, 5);
  assert.ok(dist(m.ship, ini) < 20, 'não andou atrás');
  const tiros = ev.filter((e) => e.e === 'tiro' && e.dono === m.id);
  assert.ok(tiros.length >= 6, `atirou (${tiros.length} feixes)`);
  assert.ok(tiros.every((t) => t.atq === 'feixe_optico_bazit' && t.kind === 'n511140'));
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
  // Rocha do quadrante Q0N (-697,5, -652,5): jogador de um lado, Anti (mísseis e canhão teleguiado, ~430 m) do outro.
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
  assert.ok(ev.some((e) => e.e === 'tiro' && e.dono === m.id && (e.atq === 'missil_longo' || e.atq === 'canhao_teleguiado')), 'e atirou');
});

test('monstros: não atacam quem está na zona segura nem acertam outro monstro', () => {
  const b = BASES[0];
  const { w, j } = mundo(b.x, b.z);
  const m = w.jungle.criarMonstro('sn3', b.x + ZONA_SEGURA + 60, b.z, { territorio: 1000 });
  const outro = w.jungle.criarMonstro('sn3', b.x + ZONA_SEGURA + 30, b.z + 40);
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
  assert.ok(atqs.has('canhao_pedra') && atqs.has('disparo_controle'), `pedras e controle (${[...atqs]})`);
  assert.ok([...porTick.values()].every((s) => s.size === 1), 'um ataque por vez');
  assert.ok(j.ship.desgov > 0 || j.ship.hp < j.ship.maxHp, 'acertou');

  // O SN-4 também é um ataque por vez, pelo peso do original (40/40/40).
  const outro = mundo();
  const sn = outro.w.jungle.criarMonstro('sn4', CAMPO.x, CAMPO.z - 50);
  outro.j.ship.maxHp = outro.j.ship.hp = 1e6;
  outro.w.jungle.provocar(sn, outro.j.id);
  const ev = [];
  let guiados = false;
  let campo = false;
  const porTickSn = new Map();
  for (let i = 0; i < 30 * 20; i++) {
    outro.w.step();
    for (const e of outro.w.tirarEventos()) {
      ev.push(e);
      if ((e.e === 'tiro' || e.e === 'nova') && e.dono === sn.id) {
        if (!porTickSn.has(outro.w.tick)) porTickSn.set(outro.w.tick, new Set());
        porTickSn.get(outro.w.tick).add(e.atq);
      }
    }
    guiados ||= outro.w.snapshotPara(outro.j, [], []).guiados.some((g) => g.atq === 'missil_cruzador' && g.kind === 'n550120');
    campo ||= outro.w.minas.some((m) => m.dono === sn.id && m.campo && m.g.atq === 'campo_eletrico');
  }
  assert.ok(guiados, 'mísseis no guiados');
  assert.ok(ev.some((e) => e.e === 'nova' && e.dono === sn.id && e.atq === 'onda_feixe' && e.kind === 'n550130'), 'onda em volta');
  const misseis = ev.filter((e) => e.e === 'tiro' && e.dono === sn.id && e.atq === 'missil_cruzador');
  assert.ok(misseis.length >= 10, 'mísseis');
  assert.ok(campo, 'campo elétrico no chão');
  assert.ok([...porTickSn.values()].every((s) => s.size === 1), 'um ataque por vez');
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

// ---------- SN-3 e SN-Zero VI (Stage M5 do original) ----------

/** Põe o monstro só com o ataque `atq` (os outros nunca ficam prontos). */
function soAtaque(m, atq) {
  m.cfg.ataques.forEach((a, i) => {
    if (a.atq !== atq) m.prox[i] = Infinity;
  });
}

/** Roda até `s` segundos juntando [tick, evento] dos eventos do monstro `m` (e os debuffs). */
function eventosDe(w, m, s) {
  const out = [];
  for (let i = 0; i < Math.round(s * 30); i++) {
    w.step();
    for (const e of w.tirarEventos()) if ((e.dono ?? e.id) === m.id || e.atq || e.e === 'debuff') out.push([w.tick, e]);
  }
  return out;
}

test('SN-3 e SN-Zero VI: números do original (unidade, NPC e armas) na escala do jogo', () => {
  const { sn3, snzero } = ESPECIES;
  // initunit.cfg 502020 "Sn-Three" e 500405 "Sn-Zero Unit6": HP, m/ms e raio (col 17); XP do initnpc.cfg.
  assert.equal(sn3.hp, Math.round(2500 * FATOR_HP_M5));
  assert.equal(snzero.hp, Math.round(1200 * FATOR_HP_M5));
  assert.equal(sn3.velocidade, 0.15 * 1000 * FATOR_VEL_MONSTRO);
  assert.equal(snzero.velocidade, 0.17 * 1000 * FATOR_VEL_MONSTRO);
  assert.equal(sn3.raio, 49 * FATOR_AREA);
  assert.equal(snzero.raio, 47 * FATOR_AREA);
  assert.equal(sn3.xp, Math.round(75 * FATOR_XP_M5));
  assert.equal(snzero.xp, Math.round(60 * FATOR_XP_M5));
  // As armas do initnpc.cfg (cols 13 e 14) com os pesos (cols 22 e 23).
  assert.deepEqual(sn3.ataques.map((a) => [a.kind, a.peso, a.tipoDano]), [['n511080', 70, 'fisico'], ['n511090', 30, 'eletrico']]);
  assert.deepEqual(snzero.ataques.map((a) => [a.kind, a.peso, a.tipoDano]), [['n510372', 70, 'laser'], ['n510373', 30, 'laser']]);
  assert.equal(sn3.ataques[0].dano, +(366 * FATOR_DANO_M5).toFixed(3), 'Disco Voador: 366 por disco no original');
  assert.equal(snzero.ataques[0].dano, +(166 * FATOR_DANO_M5).toFixed(3), 'Canhão SN 6: 166 por bala no original');
  // Um ataque por vez, no ritmo da arma mais rápida, na metade da velocidade da arma.
  assert.equal(FATOR_RECARGA_ORIGINAL, 2);
  assert.equal(sn3.entreAtaquesS, WEAPONS.n511080.versoes[0].cd * FATOR_RECARGA_ORIGINAL);
  assert.equal(snzero.entreAtaquesS, WEAPONS.n510372.versoes[0].cd * FATOR_RECARGA_ORIGINAL);
  for (const a of [...sn3.ataques, ...snzero.ataques]) assert.equal(a.intervaloS, WEAPONS[a.kind].versoes[0].cd * FATOR_RECARGA_ORIGINAL, a.atq);
});

test('monstros: o dano é 1/10 do original na escala das naves, e a Medusa bate como no original', () => {
  assert.equal(FATOR_DANO_MONSTRO, FATOR_ESCALA_HP / 10);
  assert.equal(FATOR_DANO_M5, FATOR_DANO_MONSTRO);
  for (const esp of ['xerxes', 'great_xerxes', 'bazit', 'anti', 'sn4']) assert.equal(FATOR_DANO_ESPECIE[esp], FATOR_DANO_MONSTRO, esp);
  assert.equal(FATOR_DANO_ESPECIE.medusa, FATOR_ESCALA_HP);
  assert.equal(ESPECIES.sn3.ataques[0].dano, 7.32, 'Disco Voador: 366 no original');
  assert.equal(ESPECIES.medusa.ataques[2].dano, 266.6, 'Canhão de Pedra: 1333 no original');
});

test('monstros: as armas de NPC do original ficam no fim do catálogo, fora das do jogador', () => {
  const npc = ARMAS_NPC_ORIGINAL.map((a) => `n${a.id}`);
  assert.deepEqual(npc, ['n510372', 'n510373', 'n511080', 'n511090', 'n550120', 'n550130', 'n550140', 'n511150', 'n511160', 'n511155', 'n511140', 'n511170', 'n511180', 'n550150', 'n550160', 'n550170']);
  assert.deepEqual(ARMAS.slice(-npc.length), npc);
  for (const k of npc) {
    assert.ok(WEAPONS[k].npc && WEAPONS[k].original && visualDoOriginal(k), k);
    for (const r of RACAS_JOGAVEIS) for (const c of ORDEM_CLASSES) assert.ok(!armasDisponiveis(r, c).includes(WEAPONS[k].idx), `${k} não é do ${r} ${c}`);
  }
  const canhao = WEAPONS.n510372.versoes[0].golpe;
  assert.equal(canhao.rajada, 2, 'Canhão SN 6: 2 disparos');
  assert.equal(canhao.rajadaS, 0.15, '300 ms do original × 0,5');
  assert.deepEqual(canhao.tiros.map((t) => t.off), [-2.5, 2.5], '2 balas, 20 m de vão × 0,25');
  assert.equal(canhao.area, 20, 'área 80 × 0,25');
  assert.ok(canhao.fim, 'explode no fim do voo');
  const disco = WEAPONS.n511080.versoes[0].golpe;
  assert.equal(disco.tiros.length, 3);
  assert.deepEqual(disco.tiros.map((t) => +((-t.ang * 180) / Math.PI).toFixed(3)), [0, 20, 40], 'leque de 20° a partir de 0°, como no cfg');
  assert.ok(disco.atravessa, 'o disco atravessa');
  const missil = WEAPONS.n511090.versoes[0].golpe;
  assert.ok(missil.guia && Math.abs(missil.guia.giro - 1) < 0.01, 'teleguiado, ~57°/s');
  assert.deepEqual(missil.efeitos, [{ tipo: 'descarga', alvo: 'inimigo', frac: 1, dur: 2, raio: 0 }], 'descarrega 100% da energia (o ícone fica 2 s)');
  const armadilha = WEAPONS.n510373.versoes[0].golpe;
  assert.equal(armadilha.forma, 'mina');
  assert.equal(armadilha.vida, 20);
  // O golpe do monstro é o da arma, com o dano e o nome do ataque da espécie.
  const g = golpeDoAtaque(ESPECIES.snzero.ataques[0]);
  assert.equal(g.dano, ESPECIES.snzero.ataques[0].dano);
  assert.equal(g.atq, 'canhao_sn6');
  assert.equal(g.vis, canhao.vis, 'o visual do original');
});

test('SN-Zero VI: o Canhão SN 6 dá 2 disparos de 2 balas, o segundo 0,15 s depois, e fere em área', () => {
  const { w, j } = mundo();
  j.ship.maxHp = j.ship.hp = 1e6;
  const m = w.jungle.criarMonstro('snzero', CAMPO.x, CAMPO.z - 150);
  soAtaque(m, 'canhao_sn6');
  w.jungle.provocar(m, j.id);
  const ev = eventosDe(w, m, 3);
  const tiros = ev.filter(([, e]) => e.e === 'tiro' && e.dono === m.id);
  assert.ok(tiros.every(([, e]) => e.kind === 'n510372' && e.atq === 'canhao_sn6'));
  const ticks = [...new Set(tiros.map(([t]) => t))];
  assert.ok(ticks.length >= 4, `vários disparos (${ticks.length})`);
  for (const t of ticks) assert.equal(tiros.filter(([x]) => x === t).length, 2, '2 balas por disparo');
  assert.equal(ticks[1] - ticks[0], Math.round(0.15 * 30), 'o segundo disparo da rajada');
  assert.ok(ticks[2] - ticks[0] >= Math.round(ESPECIES.snzero.entreAtaquesS * 30), 'a rajada seguinte espera a recarga');
  assert.ok(ev.some(([, e]) => e.e === 'acerto' && e.alvo === j.id && e.atq === 'canhao_sn6' && e.kind === 'n510372'), 'acertou');
  assert.ok(ev.some(([, e]) => e.e === 'explosao' && e.atq === 'canhao_sn6' && e.raio === 20), 'explosão de área');
  assert.ok(j.ship.hp < j.ship.maxHp);
});

test('SN-Zero VI: a Armadilha SN6 cai embaixo do alvo e explode quando ele fica nela', () => {
  const { w, j } = mundo();
  j.ship.maxHp = j.ship.hp = 1e6;
  const m = w.jungle.criarMonstro('snzero', CAMPO.x, CAMPO.z - 120);
  soAtaque(m, 'armadilha_sn6');
  w.jungle.provocar(m, j.id);
  let mina = null;
  const ev = [];
  for (let i = 0; i < 60 && !ev.some((e) => e.e === 'acerto' && e.atq === 'armadilha_sn6'); i++) {
    w.step();
    ev.push(...w.tirarEventos());
    mina ??= w.minas.find((x) => x.dono === m.id);
  }
  assert.ok(mina, 'instalou a armadilha');
  assert.equal(mina.kind, 'n510373');
  assert.ok(Math.hypot(mina.x - j.ship.x, mina.z - j.ship.z) < 1, 'embaixo do alvo');
  assert.ok(ev.some((e) => e.e === 'acerto' && e.alvo === j.id && e.atq === 'armadilha_sn6'), 'explodiu no alvo parado');
  assert.ok(j.ship.hp < j.ship.maxHp);
});

test('SN-3: o Disco Voador sai em leque de 3 e o míssil teleguiado descarrega a energia do alvo', () => {
  const { w, j } = mundo();
  j.ship.maxHp = j.ship.hp = 1e6;
  const m = w.jungle.criarMonstro('sn3', CAMPO.x, CAMPO.z - 150);
  soAtaque(m, 'disco_voador');
  w.jungle.provocar(m, j.id);
  const ev = eventosDe(w, m, 2.5);
  const discos = ev.filter(([, e]) => e.e === 'tiro' && e.dono === m.id);
  assert.ok(discos.length >= 3 && discos.every(([, e]) => e.kind === 'n511080' && e.atq === 'disco_voador'));
  const t0 = discos.filter(([t]) => t === discos[0][0]).map(([, e]) => Math.atan2(-e.vx, -e.vz));
  assert.equal(t0.length, 3, '3 discos por disparo');
  const abre = Math.abs(Math.atan2(Math.sin(t0[2] - t0[0]), Math.cos(t0[2] - t0[0])));
  assert.ok(Math.abs(abre - (40 * Math.PI) / 180) < 0.01, `leque de 40° (${((abre * 180) / Math.PI).toFixed(1)}°)`);
  assert.ok(ev.some(([, e]) => e.e === 'acerto' && e.alvo === j.id && e.atq === 'disco_voador'));

  const outro = mundo();
  outro.j.ship.maxHp = outro.j.ship.hp = 1e6;
  const sn = outro.w.jungle.criarMonstro('sn3', CAMPO.x, CAMPO.z - 150);
  soAtaque(sn, 'missil_descarga');
  outro.w.jungle.provocar(sn, outro.j.id);
  outro.w.step();
  assert.ok(outro.w.snapshotPara(outro.j, [], []).guiados.some((g) => g.kind === 'n511090' && g.atq === 'missil_descarga'), 'mísseis no guiados');
  let descarregou = false;
  for (let i = 0; i < 90 && !descarregou; i++) {
    outro.j.ship.en = outro.j.ship.maxEn;
    outro.w.step();
    descarregou = outro.w.tirarEventos().some((e) => e.e === 'acerto' && e.alvo === outro.j.id && e.atq === 'missil_descarga');
  }
  assert.ok(descarregou, 'o míssil chegou');
  assert.ok(outro.j.ship.en < outro.j.ship.maxEn * 0.1, `energia descarregada (${outro.j.ship.en.toFixed(1)})`);
});

test('Stage 6, SN-4 e Medusa: as armas e os pesos do initnpc.cfg, um ataque por vez no ritmo da arma mais rápida', () => {
  // cols 13–16 (armas) e 22–25 (pesos) do initnpc.cfg: 705050 Xerxes, 705055 Great
  // Xerxes, 705040 Bazit (a mesma arma nos dois encaixes), 705060 Anti, 702600 SN-4,
  // 702700 Ancient Medusa.
  const esperado = {
    xerxes: [['n511150', 30], ['n511160', 70]],
    great_xerxes: [['n511155', 100]],
    bazit: [['n511140', 100]],
    anti: [['n511170', 50], ['n511180', 50]],
    sn4: [['n550120', 40], ['n550130', 40], ['n550140', 40]],
    medusa: [['n550150', 40], ['n550160', 40], ['n550170', 70]],
  };
  for (const [esp, armas] of Object.entries(esperado)) {
    const e = ESPECIES[esp];
    assert.deepEqual(e.ataques.map((a) => [a.kind, a.peso]), armas, esp);
    const cds = e.ataques.map((a) => WEAPONS[a.kind].versoes[0].cd);
    const fator = esp === 'medusa' ? FATOR_RECARGA_MEDUSA : FATOR_RECARGA_ORIGINAL;
    assert.equal(e.entreAtaquesS, Math.min(...cds) * fator, `${esp}: ritmo`);
    for (const a of e.ataques) assert.equal(a.intervaloS, WEAPONS[a.kind].versoes[0].cd * fator, `${esp} ${a.atq}: recarga`);
    for (const a of e.ataques) {
      assert.equal(a.forma, 'arma');
      assert.equal(a.tipoDano, WEAPONS[a.kind].tipoDano);
      const original = ARMAS_NPC_ORIGINAL.find((x) => `n${x.id}` === a.kind).versoes[0].golpe.dano;
      assert.equal(a.dano, +(original * FATOR_DANO_ESPECIE[esp]).toFixed(3), `${esp} ${a.atq}: dano do original × fator da espécie`);
      assert.ok(a.alcance > 0 && a.alcance <= ALCANCE_MAX_ORIGINAL, `${esp} ${a.atq}: alcance ${a.alcance}`);
    }
  }
  // A nova do SN-4 vale até o raio dela; o campo cai embaixo do alvo.
  assert.equal(ESPECIES.sn4.ataques[1].alcance, WEAPONS.n550130.versoes[0].golpe.nova.raio);
});

test('Xerxes: o lança-chamas solta uma rajada de 8 bolas de fogo e deixa o Magma (HP caindo por 5 s)', () => {
  const { w, j } = mundo();
  j.ship.maxHp = j.ship.hp = 1e6;
  const m = w.jungle.criarMonstro('xerxes', CAMPO.x, CAMPO.z - 100);
  soAtaque(m, 'lanca_chamas');
  w.jungle.provocar(m, j.id);
  const ev = eventosDe(w, m, 1.5);
  const fogo = ev.filter(([, e]) => e.e === 'tiro' && e.dono === m.id);
  assert.ok(fogo.every(([, e]) => e.kind === 'n511150' && e.atq === 'lanca_chamas'));
  const t0 = fogo[0][0];
  const rajada = fogo.filter(([t]) => t - t0 < 25);
  assert.equal(rajada.length, 8, '8 bolas de fogo por disparo');
  assert.ok(ev.some(([, e]) => e.e === 'acerto' && e.alvo === j.id && e.atq === 'lanca_chamas'), 'pegou');
  assert.ok(j.drenoTicks > 0 && j.drenoMagma, 'Magma no alvo');
  assert.equal(j.drenoDps, WEAPONS.n511150.versoes[0].golpe.efeitos[0].dps, 'Magma na escala das armas do jogador (100 em 5 s × 0,2)');
  // Só o alvo recebe a mensagem do Magma, com o valor e a duração.
  const deb = ev.map(([, e]) => e).find((e) => e.e === 'debuff' && e.para === j.id);
  assert.ok(deb, 'evento debuff');
  assert.equal(deb.ef, 'magma');
  assert.equal(deb.v, 20);
  assert.equal(deb.dur, 5);
  // Fora da chama, a vida continua caindo enquanto o Magma dura.
  m.ship.hp = 0;
  m.vivo = false;
  const antes = j.ship.hp;
  rodar(w, 2);
  assert.ok(j.ship.hp < antes, 'queimando');
  const fx = w.snapshotPara(j, w.entidades(), []).ents.find((e) => e.id === j.id)?.fx ?? [];
  assert.ok(fx.includes('magma'), `fx magma (${fx})`);
});

test('SN-4: o campo elétrico zera as resistências de quem fica nele (Resistance diminish)', () => {
  const { w, j } = mundo();
  j.ship.maxHp = j.ship.hp = 1e6;
  const m = w.jungle.criarMonstro('sn4', CAMPO.x, CAMPO.z - 150);
  soAtaque(m, 'campo_eletrico');
  w.jungle.provocar(m, j.id);
  const ev = eventosDe(w, m, 2);
  assert.ok(w.minas.some((x) => x.dono === m.id && x.campo && x.kind === 'n550140'), 'campo no chão');
  assert.ok(w.golpes.st(j, 'vulneravel'), 'resistências quebradas');
  const deb = ev.map(([, e]) => e).find((e) => e.e === 'debuff' && e.para === j.id);
  assert.equal(deb?.ef, 'resist');
  const fx = w.snapshotPara(j, w.entidades(), []).ents.find((e) => e.id === j.id)?.fx ?? [];
  assert.ok(fx.includes('resist'), `fx resist (${fx})`);
});

test('SN-3 e SN-Zero VI: o glb traz a animação STAND do original (24 quadros por segundo) e o cone de luz aditivo', () => {
  const glb = (nome) => {
    const b = readFileSync(new URL(`../public/modelos/monstros/${nome}.glb`, import.meta.url));
    return JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString());
  };
  for (const [nome, quadros] of [['sn3', 31], ['snzero', 21]]) {
    const g = glb(nome);
    const [anim] = g.animations;
    assert.equal(anim.name, 'STAND', nome);
    const tempo = g.accessors[anim.samplers[0].input];
    assert.equal(tempo.count, quadros, `${nome}: ${quadros} quadros`);
    assert.ok(Math.abs(tempo.max[0] - (quadros - 1) / 24) < 1e-6, `${nome}: 24 por segundo`);
    assert.ok(g.materials.every((m) => m.doubleSided && m.pbrMetallicRoughness.metallicFactor === 0));
  }
  const luz = glb('snzero').materials.find((m) => m.name === 'nu0040_light');
  assert.ok(luz?.extras?.aditivo && luz.alphaMode === 'BLEND', 'o cone de luz do SN-Zero VI');
});

test('Medusa: a armadilha paralisante solta 8 cargas em volta que viram minas; com a nave perto, a mina atira e impede o tiro', () => {
  const { w, j } = mundo(0, 877 - 120);
  j.ship.maxHp = j.ship.hp = 1e6;
  const m = w.jungle.criarMonstro('medusa', 0, 877);
  soAtaque(m, 'armadilha_paralisante');
  w.jungle.provocar(m, j.id);
  const ev = eventosDe(w, m, 3);
  const cargas = ev.filter(([, e]) => e.e === 'tiro' && e.dono === m.id && e.atq === 'armadilha_paralisante' && e.p === 0);
  const t0 = cargas[0][0];
  const salva = cargas.filter(([t]) => t === t0).map(([, e]) => Math.atan2(-e.vx, -e.vz));
  assert.equal(salva.length, 8, '8 cargas por salva');
  const passo = Math.PI / 4;
  const angs = salva.map((a) => ((a - salva[0]) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI)).sort((a, b) => a - b);
  angs.forEach((a, i) => assert.ok(Math.abs(a - i * passo) < 0.01, `a cada 45° (${((a * 180) / Math.PI).toFixed(1)}°)`));
  const minas = w.minas.filter((x) => x.dono === m.id);
  assert.ok(minas.length >= 7, `viraram minas (${minas.length})`);
  assert.ok(minas.every((x) => x.kind === 'n550150' && (x.fimTick - w.tick) / 30 > 25), 'minas de 30 s');
  assert.ok(j.ship.semTiro > 0, 'a mina perto atirou e impediu o tiro');
  const deb = ev.map(([, e]) => e).find((e) => e.e === 'debuff' && e.para === j.id);
  assert.equal(deb?.ef, 'semTiro');
  assert.equal(deb.dur, 2.5);
  const fx = w.snapshotPara(j, w.entidades(), []).ents.find((e) => e.id === j.id)?.fx ?? [];
  assert.ok(fx.includes('semTiro') && !fx.includes('para'), `só o tiro impedido: a espada, não o LD (${fx})`);
});

test('Medusa: monstro guarda as minas do original (três salvas), o piloto continua no teto dele', () => {
  // A nave longe das minas (a 120 m da Medusa, fora dos 48 m em que a mina atira).
  const { w, j } = mundo(0, 877 - 120);
  j.ship.maxHp = j.ship.hp = 1e6;
  const m = w.jungle.criarMonstro('medusa', 0, 877);
  soAtaque(m, 'armadilha_paralisante');
  w.jungle.provocar(m, j.id);
  for (let i = 0; i < 3; i++) {
    m.livreAte = 0;
    m.prox[0] = 0;
    rodar(w, 1.2);
  }
  assert.ok(w.minas.filter((x) => x.dono === m.id).length > MINA_MAX, 'mais que as 8 de um piloto');
  assert.ok(w.minas.filter((x) => x.dono === m.id).length <= MINA_MAX_MONSTRO);
});

test('Medusa: o disparo de controle sai em leque de 10 com área e desgoverna; a pedra sai em rajada de 2', () => {
  const { w, j } = mundo(0, 877 - 150);
  j.ship.maxHp = j.ship.hp = 1e6;
  const m = w.jungle.criarMonstro('medusa', 0, 877);
  soAtaque(m, 'disparo_controle');
  w.jungle.provocar(m, j.id);
  const ev = eventosDe(w, m, 2);
  const tiros = ev.filter(([, e]) => e.e === 'tiro' && e.atq === 'disparo_controle');
  assert.equal(tiros.filter(([t]) => t === tiros[0][0]).length, 10, '10 tiros por disparo');
  assert.ok(ev.some(([, e]) => e.e === 'explosao' && e.atq === 'disparo_controle'), 'com área');
  assert.ok(j.ship.desgov > 0, 'desgovernou');
  assert.equal(ev.map(([, e]) => e).find((e) => e.e === 'debuff')?.ef, 'desgoverno');

  const outro = mundo(0, 877 - 150);
  outro.j.ship.maxHp = outro.j.ship.hp = 1e6;
  const med = outro.w.jungle.criarMonstro('medusa', 0, 877);
  soAtaque(med, 'canhao_pedra');
  outro.w.jungle.provocar(med, outro.j.id);
  const ev2 = eventosDe(outro.w, med, 2.5);
  const pedras = ev2.filter(([, e]) => e.e === 'tiro' && e.atq === 'canhao_pedra');
  assert.ok(pedras.length >= 2 && pedras[1][0] - pedras[0][0] <= 1, '2 pedras em seguida');
  assert.ok(outro.j.ship.hp < outro.j.ship.maxHp, 'a pedra acertou');
});

test('Medusa: o glb traz a pele do original (112 ossos) e os movimentos do .eff: o laço STAND e a subida da água', () => {
  const b = readFileSync(new URL('../public/modelos/monstros/medusa.glb', import.meta.url));
  const g = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString());
  assert.equal(g.skins.length, 1);
  assert.equal(g.skins[0].joints.length, 112, '112 ossos');
  assert.equal(g.accessors[g.skins[0].inverseBindMatrices].count, 112);
  const comPele = g.nodes.filter((n) => n.skin === 0);
  assert.equal(comPele.length, 2, 'a cúpula e os tentáculos');
  for (const n of comPele) {
    const at = g.meshes[n.mesh].primitives[0].attributes;
    assert.ok(at.JOINTS_0 !== undefined && at.WEIGHTS_0 !== undefined);
  }
  const nomes = g.animations.map((a) => a.name);
  for (const n of ['STAND', 'STAND02', 'STAND03', 'STAND04']) assert.ok(nomes.includes(n), n);
  const dur = (n) => g.accessors[g.animations.find((a) => a.name === n).samplers.find((s) => g.accessors[s.input].count > 1).input].max[0];
  assert.ok(Math.abs(dur('STAND') - 56 / 24) < 1e-6, 'o laço: quadros 146–202 do .eff, 24 por segundo');
  for (const n of ['STAND02', 'STAND03', 'STAND04']) assert.ok(Math.abs(dur(n) - 23 / 24) < 1e-6, `${n}: 24 quadros`);
});

test('Medusa: ataca no máximo um golpe a cada 1,5 s (mais devagar que as armas do original)', () => {
  const { w, j } = mundo(0, 877 - 150);
  j.ship.maxHp = j.ship.hp = 1e7;
  const m = w.jungle.criarMonstro('medusa', 0, 877);
  w.jungle.provocar(m, j.id);
  const disparos = [];
  for (let i = 0; i < 30 * 30; i++) {
    w.step();
    for (const e of w.tirarEventos()) {
      // O primeiro disparo de cada golpe (a rajada da pedra e o tiro da mina não contam).
      if (e.e === 'tiro' && e.dono === m.id && !e.p && !disparos.some((d) => d.tick === w.tick || (d.atq === e.atq && w.tick - d.tick <= 2))) disparos.push({ tick: w.tick, atq: e.atq });
    }
  }
  assert.ok(disparos.length >= 10 && disparos.length <= 21, `golpes em 30 s (${disparos.length})`);
  for (let i = 1; i < disparos.length; i++) assert.ok(disparos[i].tick - disparos[i - 1].tick >= 45, 'pelo menos 1,5 s entre um golpe e outro');
  assert.equal(FATOR_RECARGA_MEDUSA, 6);
});
