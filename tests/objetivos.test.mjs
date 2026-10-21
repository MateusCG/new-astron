// Objetivos do mapa do Stage 6 (server/objetivos.js): a torre do buff de suporte, as
// plataformas de pouso que dão ouro ao time e o Núcleo de He-3 (com o pulso e a
// onda do Núcleo), o estado `obj` do snapshot e a partida nova. Os tempos de
// aparição vêm encurtados pelo World({ objetivos }).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../server/game.js';
import { TEMPOS, SUPORTE, OURO_PLATAFORMA, OURO_PLATAFORMA_POUSOU, NUCLEO_CFG } from '../server/objetivos.js';
import { MINERADOR_NUCLEO } from '../server/mineradores.js';
import { DT, HOVER, WEAPONS, createShip, createBullet, stepShip, INPUT_VAZIO } from '../shared/sim.js';
import { OBJETIVOS, BUFFS, PLATAFORMAS_POUSO, NUCLEO, areaPouso } from '../shared/terrain.js';
import { obstaculoAtivo, alturaSolida } from '../shared/obstaculos.js';
import { xpParaNivel } from '../server/progressao.js';

const SEGUNDO = Math.round(1 / DT);
const RAPIDO = {
  suporte: { primeiroS: 2, voltaS: 4 },
  plataforma: { primeiroS: 2, recargaS: 3, pousoS: 2 },
  nucleo: { aparicoesS: [2, 8] },
};

/** Mundo sem monstros e sem mineradores andando, com A e C no time 0 e B no 1. */
function mundo(opcoes = {}) {
  const w = new World({ jungle: false, torretas: false, objetivos: RAPIDO, ouroPorSegundo: 0, ...opcoes }); // conta o ouro exato dos objetivos
  const a = w.addPlayer('A', 'bellico');
  const b = w.addPlayer('B', 'acron');
  const c = w.addPlayer('C', 'shrewdo');
  w.mineradores.passo = () => {};
  w.escoltas.passo = () => {};
  w.step();
  for (const j of [a, b, c]) j.protegidoAte = 0;
  return { w, a, b, c };
}

function passos(w, s) {
  for (let i = 0; i < Math.round(s * SEGUNDO); i++) w.step();
}

/** Põe a nave parada, voando, em (x, z). */
function colocar(j, x, z, yaw = 0) {
  Object.assign(j.ship, { x, z, y: HOVER, vx: 0, vz: 0, yaw, pousado: false });
}

/** Põe a nave pousada e parada no centro da plataforma `id` (já assentada na altura). */
function pousar(j, id) {
  const p = PLATAFORMAS_POUSO.find((x) => x.id === id);
  Object.assign(j.ship, { x: p.x, z: p.z, vx: 0, vz: 0, pousado: true });
  for (let i = 0; i < SEGUNDO; i++) stepShip(j.ship, INPUT_VAZIO);
}

/** Tiro de plasma de `dono` (ou de monstro, sem dono) saindo de (x, z) no rumo `yaw`. */
function tiro(w, dono, x, z, yaw) {
  const bala = createBullet(createShip('bellico', x, z, yaw), 'plasma', w.nextId++, dono?.id ?? 99999);
  Object.assign(bala, { time: dono?.time, drone: !dono, mult: 1 });
  w.bullets.push(bala);
  for (let i = 0; i < 2 * SEGUNDO && w.bullets.includes(bala); i++) w.step();
  return bala;
}

const obj = (w, j, id) => w.snapshotPara(j, [], []).obj[id];

test('objetivos: os A/B/C antigos saíram e o obj traz BS0, BS1, P0, P1 e NUCLEO à espera', () => {
  assert.deepEqual(OBJETIVOS, []);
  assert.deepEqual(TEMPOS, { suporte: { primeiroS: 90, voltaS: 240 }, plataforma: { primeiroS: 120, recargaS: 150, pousoS: 6 }, nucleo: { aparicoesS: [480, 900] } });
  const w = new World({ jungle: false });
  const a = w.addPlayer('A', 'bellico');
  w.step();
  const o = w.snapshotPara(a, [], []).obj;
  assert.deepEqual(Object.keys(o).sort(), ['BS0', 'BS1', 'NUCLEO', 'P0', 'P1']);
  assert.deepEqual(o.BS0, { time: null, estado: 'espera', volta: 90, vida: 1 });
  assert.deepEqual(o.P1, { time: null, estado: 'espera', volta: 120 });
  assert.deepEqual(o.NUCLEO, { time: null, aparicao: 0, estado: 'espera', volta: 480 });
  assert.equal(w.entidades().filter((e) => e.tipo === 'guardiao').length, 0, 'sem guardião');
  assert.equal(w.entidades().filter((e) => e.tipo === 'nucleo').length, 0, 'o Núcleo ainda não está no mapa');
});

test('objetivos: torre de suporte só aceita dano de jogador depois de acender, e o último tiro dá o bônus', () => {
  const { w, a, b } = mundo();
  const t = BUFFS.find((x) => x.id === 'BS0'); // (-855, 909), do lado do time 0
  const torre = w.objetivos.suportes.find((x) => x.id === 'BS0');
  assert.ok(obstaculoAtivo('BS0'), 'de pé desde o começo');
  // Antes de acender: bate e some, sem dano.
  colocar(a, t.x - 80, t.z - 60);
  colocar(b, t.x + 80, t.z - 60);
  w.tirarEventos();
  const antes = tiro(w, b, t.x - 40, t.z, -Math.PI / 2);
  assert.equal(w.bullets.includes(antes), false, 'acabou na torre');
  assert.equal(torre.hp, SUPORTE.hp);
  assert.ok(w.tirarEventos().some((e) => e.e === 'acerto' && e.torre === 'BS0' && e.dano === 0));
  passos(w, 2);
  assert.equal(obj(w, a, 'BS0').estado, 'ativo');
  // Monstro não fere; jogador de qualquer time (aqui o do outro lado) fere.
  tiro(w, null, t.x - 40, t.z, -Math.PI / 2);
  assert.equal(torre.hp, SUPORTE.hp, 'monstro não fere');
  tiro(w, b, t.x - 40, t.z, -Math.PI / 2);
  assert.equal(torre.hp, SUPORTE.hp - WEAPONS.plasma.dano, 'jogador do outro time rouba');
  assert.ok(Math.abs(obj(w, a, 'BS0').vida - torre.hp / SUPORTE.hp) < 1e-3);
  // Último tiro: cai, sai da física, dá 'suporte' e a recompensa.
  torre.hp = 5;
  const ouro = b.ouro;
  w.tirarEventos();
  tiro(w, b, t.x - 40, t.z, -Math.PI / 2);
  assert.equal(obstaculoAtivo('BS0'), false);
  assert.equal(alturaSolida(t.x, t.z), 0, 'o lugar ficou livre');
  assert.equal(b.ouro - ouro, SUPORTE.ouro);
  assert.equal(b.nivel, 3, `XP ${SUPORTE.xp} passa do nível 1 (${xpParaNivel(1)}) e do 2 (${xpParaNivel(2)})`);
  assert.ok(w.bonus.ativoNave(b.id, 'suporte', w.tick));
  assert.equal(w.bonus.ativoNave(a.id, 'suporte', w.tick), false);
  const ev = w.tirarEventos();
  assert.ok(ev.some((e) => e.e === 'objetivo' && e.id === 'BS0' && e.acao === 'tomado' && e.time === 1 && e.quem === 'B'));
  assert.ok(ev.some((e) => e.e === 'bonusNave' && e.id === b.id && e.nome === 'suporte' && e.s === 90));
  assert.deepEqual(obj(w, a, 'BS0'), { time: 1, estado: 'recarga', volta: 4, vida: 0 });
  // Volta 4 s depois, mas espera o lugar vagar.
  colocar(a, t.x, t.z);
  passos(w, 4.5);
  assert.equal(obstaculoAtivo('BS0'), false, 'nave no lugar: espera');
  colocar(a, t.x - 80, t.z - 60);
  w.step();
  assert.ok(obstaculoAtivo('BS0'));
  assert.equal(torre.hp, SUPORTE.hp, 'inteira');
  assert.equal(obj(w, a, 'BS0').estado, 'ativo');
  assert.ok(w.tirarEventos().some((e) => e.e === 'objetivo' && e.id === 'BS0' && e.acao === 'apareceu'));
});

test('objetivos: plataforma de pouso dá ouro ao time inteiro depois do pouso parado, e +12 a quem pousou', () => {
  const { w, a, b, c } = mundo();
  pousar(a, 'P1'); // a do território do outro time: qualquer um pousa
  assert.equal(areaPouso(a.ship.x, a.ship.z).plataforma, 'P1');
  assert.equal(a.ship.pousado, true);
  passos(w, 1);
  assert.equal(obj(w, a, 'P1').estado, 'espera', 'antes dos 2 s não conta');
  passos(w, 1.1);
  assert.equal(obj(w, a, 'P1').estado, 'ativo');
  assert.equal(obj(w, a, 'P1').quem, 0);
  const ouro = { a: a.ouro, b: b.ouro, c: c.ouro };
  w.tirarEventos();
  passos(w, 2);
  assert.equal(a.ouro - ouro.a, OURO_PLATAFORMA + OURO_PLATAFORMA_POUSOU);
  assert.equal(c.ouro - ouro.c, OURO_PLATAFORMA, 'o colega longe ganha também');
  assert.equal(b.ouro, ouro.b, 'o outro time nada');
  assert.deepEqual([OURO_PLATAFORMA, OURO_PLATAFORMA_POUSOU], [50, 12]);
  const ev = w.tirarEventos().find((e) => e.e === 'objetivo' && e.id === 'P1');
  assert.deepEqual([ev.acao, ev.time, ev.quem], ['coletou', 0, 'A']);
  assert.deepEqual(obj(w, a, 'P1'), { time: 0, estado: 'recarga', volta: 3 });
  passos(w, 3.1);
  assert.equal(obj(w, a, 'P1').estado, 'ativo', 'volta depois da recarga');
});

test('objetivos: decolar ou levar dano na plataforma cancela e zera; pousada não atira e é alvo', () => {
  const { w, a, b } = mundo();
  passos(w, 2.1);
  pousar(a, 'P0');
  passos(w, 1);
  assert.ok(obj(w, a, 'P0').prog >= 0.9);
  // Pousada, a nave não atira (o stepShip corta, na predição também).
  assert.deepEqual(stepShip({ ...a.ship }, { ...INPUT_VAZIO, f1: true, f2: true }), []);
  // Decolou: cancela.
  w.tirarEventos();
  a.ship.pousado = false;
  w.step();
  assert.equal(obj(w, a, 'P0').prog, 0);
  assert.ok(w.tirarEventos().some((e) => e.e === 'objetivo' && e.id === 'P0' && e.acao === 'cancelou' && e.motivo === 'saiu'));
  // Pousa de novo e leva um tiro de quem voa (a nave pousada está ao alcance do tiro reto).
  pousar(a, 'P0');
  passos(w, 1);
  const p = PLATAFORMAS_POUSO.find((x) => x.id === 'P0');
  colocar(b, p.x, p.z + 60);
  const hp = a.ship.hp;
  w.tirarEventos();
  tiro(w, b, p.x, p.z + 40, 0);
  assert.ok(a.ship.hp < hp, 'o tiro de quem voa pega a nave pousada');
  w.step(); // a plataforma vê o dano no tick seguinte
  assert.ok(w.tirarEventos().some((e) => e.e === 'objetivo' && e.id === 'P0' && e.acao === 'cancelou' && e.motivo === 'dano'));
  assert.ok(obj(w, a, 'P0').prog < 0.5, 'recomeçou');
});

test('objetivos: os dois times pousados contestam (trava); sozinho, o outro recomeça do zero', () => {
  const { w, a, b } = mundo();
  passos(w, 2.1);
  pousar(a, 'P0');
  passos(w, 1);
  const p = PLATAFORMAS_POUSO.find((x) => x.id === 'P0');
  pousar(b, 'P0');
  Object.assign(b.ship, { x: p.x + 10 });
  const prog = obj(w, a, 'P0').prog;
  passos(w, 3);
  const o = obj(w, a, 'P0');
  assert.equal(o.contestado, true);
  assert.equal(o.prog, prog, 'travou');
  assert.equal(o.estado, 'ativo');
  a.ship.pousado = false;
  colocar(a, p.x - 200, p.z);
  w.step();
  assert.equal(obj(w, a, 'P0').quem, 1);
  assert.ok(obj(w, a, 'P0').prog < 0.1, 'recomeçou para o outro time');
});

test('objetivos: o Núcleo aparece como entidade, só jogador fere, e pulsa mais forte com menos vida', () => {
  const { w, a, b } = mundo();
  passos(w, 2.1);
  const n = w.objetivos.nucleo;
  assert.equal(n.vivo, true);
  const ent = w.entidades().find((e) => e.tipo === 'nucleo');
  assert.ok(ent, 'vai nas entidades');
  assert.deepEqual([ent.x, ent.z, ent.hp, ent.maxHp], [NUCLEO.x, NUCLEO.z, NUCLEO_CFG.hp, NUCLEO_CFG.hp]);
  assert.equal(obj(w, a, 'NUCLEO').estado, 'ativo');
  // Monstro não fere, jogador fere.
  colocar(a, NUCLEO.x, NUCLEO.z + 200);
  colocar(b, NUCLEO.x, NUCLEO.z + 210);
  tiro(w, null, NUCLEO.x, NUCLEO.z + 40, 0);
  assert.equal(n.ship.hp, NUCLEO_CFG.hp);
  tiro(w, a, NUCLEO.x, NUCLEO.z + 40, 0);
  assert.equal(n.ship.hp, NUCLEO_CFG.hp - WEAPONS.plasma.dano);
  // Pulso: pega as naves de jogador perto, dos dois times; com menos vida, mais forte.
  colocar(a, NUCLEO.x + 30, NUCLEO.z);
  colocar(b, NUCLEO.x - 30, NUCLEO.z);
  const pulsos = [];
  const hpA = a.ship.hp;
  const hpB = b.ship.hp;
  for (let i = 0; i < (NUCLEO_CFG.pulsoS + 0.2) * SEGUNDO; i++) {
    w.step();
    for (const e of w.tirarEventos()) if (e.e === 'pulso') pulsos.push(e);
  }
  assert.equal(pulsos.length, 1);
  assert.deepEqual([pulsos[0].raio, pulsos[0].x, pulsos[0].z], [NUCLEO_CFG.raioPulso, NUCLEO.x, NUCLEO.z]);
  assert.ok(a.ship.hp < hpA && b.ship.hp < hpB, 'os dois times levam');
  n.ship.hp = n.ship.maxHp * 0.2;
  assert.ok(w.objetivos.forcaPulso() > pulsos[0].forca + 1, 'mais forte com menos vida');
  // Fora do raio, nada.
  colocar(a, NUCLEO.x, NUCLEO.z + 200);
  const hp = a.ship.hp;
  passos(w, NUCLEO_CFG.pulsoS + 0.2);
  assert.ok(a.ship.hp >= hp);
});

test('objetivos: matar o Núcleo dá a onda do Núcleo e a recompensa ao time; volta aos 15:00 e depois fica tomado', () => {
  const { w, a, b, c } = mundo();
  passos(w, 2.1);
  const n = w.objetivos.nucleo;
  colocar(a, NUCLEO.x, NUCLEO.z + 200);
  colocar(b, NUCLEO.x, NUCLEO.z + 220);
  n.ship.hp = 5;
  const ouro = { a: a.ouro, b: b.ouro, c: c.ouro };
  w.tirarEventos();
  tiro(w, a, NUCLEO.x, NUCLEO.z + 40, 0);
  assert.equal(n.vivo, false);
  assert.equal(c.ouro - ouro.c, NUCLEO_CFG.ouro, 'o time inteiro ganha');
  assert.equal(a.ouro - ouro.a, NUCLEO_CFG.ouro);
  assert.equal(b.ouro, ouro.b);
  const onda = w.mineradores.lista.filter((m) => m.nucleo);
  assert.equal(onda.length, MINERADOR_NUCLEO.quantos);
  assert.ok(onda.every((m) => m.time === 0));
  const ev = w.tirarEventos();
  assert.ok(ev.some((e) => e.e === 'objetivo' && e.id === 'NUCLEO' && e.acao === 'tomado' && e.time === 0 && e.quem === 'A'));
  assert.ok(ev.some((e) => e.e === 'ondaNucleo' && e.time === 0));
  assert.equal(w.entidades().some((e) => e.tipo === 'nucleo'), false);
  const o = obj(w, a, 'NUCLEO');
  assert.deepEqual([o.estado, o.time, o.aparicao], ['recarga', 0, 1]);
  assert.ok(o.volta > 5 && o.volta <= 6, `volta ${o.volta}`);
  passos(w, 6);
  assert.equal(n.vivo, true, 'segunda aparição');
  assert.equal(n.ship.hp, NUCLEO_CFG.hp);
  n.ship.hp = 5;
  tiro(w, b, NUCLEO.x, NUCLEO.z + 40, 0);
  assert.equal(n.vivo, false);
  assert.deepEqual(obj(w, a, 'NUCLEO'), { time: 1, aparicao: 2, estado: 'tomado' });
  passos(w, 10);
  assert.equal(n.vivo, false, 'só duas vezes');
});

test('objetivos: o Núcleo vivo na hora da segunda aparição não muda; tomado depois dela, acabou', () => {
  const { w, a } = mundo();
  passos(w, 2.1);
  const n = w.objetivos.nucleo;
  n.ship.hp = 3000;
  n.ultimoDano = w.tick + 100 * SEGUNDO; // sem regenerar
  passos(w, 7);
  assert.equal(n.ship.hp, 3000, 'continua o mesmo');
  assert.equal(n.aparicao, 1);
  colocar(a, NUCLEO.x, NUCLEO.z + 200);
  n.ship.hp = 5;
  tiro(w, a, NUCLEO.x, NUCLEO.z + 40, 0);
  assert.equal(obj(w, a, 'NUCLEO').estado, 'tomado');
});

test('objetivos: fora de briga o Núcleo recupera vida', () => {
  const { w } = mundo();
  passos(w, 2.1);
  const n = w.objetivos.nucleo;
  n.ship.hp = 1000;
  n.ultimoDano = w.tick;
  passos(w, NUCLEO_CFG.regenEsperaS - 1);
  assert.equal(n.ship.hp, 1000);
  passos(w, 3);
  assert.ok(n.ship.hp > 1000);
});

test('objetivos: a partida nova volta tudo à espera, com as torres de pé', () => {
  const w = new World({ jungle: false, torretas: false, objetivos: RAPIDO, duracaoPartidaS: 5, intervaloFimS: 1 });
  const a = w.addPlayer('A', 'bellico');
  passos(w, 2.2);
  w.objetivos.suportes[0].hp = 1;
  const t = BUFFS.find((x) => x.id === w.objetivos.suportes[0].id);
  tiro(w, a, t.x - 40, t.z, -Math.PI / 2);
  assert.equal(obstaculoAtivo(t.id), false);
  assert.equal(w.objetivos.nucleo.vivo, true);
  for (let i = 0; i < 6 * SEGUNDO && w.partida.numero < 2; i++) w.step();
  assert.equal(w.partida.numero, 2);
  assert.ok(obstaculoAtivo(t.id));
  assert.equal(w.objetivos.nucleo.vivo, false);
  const o = w.snapshotPara(a, [], []).obj;
  assert.equal(o[t.id].estado, 'espera');
  assert.equal(o.NUCLEO.estado, 'espera');
  assert.equal(o.P0.estado, 'espera');
});
