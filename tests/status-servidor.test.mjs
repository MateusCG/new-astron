// Status do piloto no servidor (server/game.js #ferir e multDanoDe, server/servicos.js
// aplicarStatus, shared/sim.js stepShip): o escudo do equipamento segura o dano antes
// do HP e recupera depois de um tempo sem dano; o poder (pontos e potenciadores)
// aumenta o dano do tipo da arma; a resistência do alvo, menos a penetração de quem
// bate, reduz; o golpe crítico dobra; a recarga do tipo fica mais curta e a predição
// do cliente (o mesmo stepShip lendo o `me`) bate com o servidor.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World, ZONA_SEGURA, ESCUDO_ESPERA_S, CRITICO_MULT } from '../server/game.js';
import { createShip, stepShip, sanitizeInput, armasIniciais, versaoArma, WEAPONS, ARMAS } from '../shared/sim.js';
import { BASE, SERVICOS } from '../shared/terrain.js';
import { versaoEquip, EQUIPAMENTOS, RESIST_MAX } from '../shared/equipamentos.js';
import { porPonto, multRecarga } from '../shared/status.js';

const SEGUNDO = 30;
const FEIXE = armasIniciais('acron')[0]; // Feixe Rifle Triplo: três canos, laser
const DANO = 3 * versaoArma(FEIXE, 1).golpe.dano;
const TIPO = WEAPONS[ARMAS[FEIXE]].tipoDano;
const ESCUDO = 'e330010'; // Escudo Neutron Op.
const ARMADURA_OP = 'e320013'; // Armadura de Alcânio Op.
const PENETRA_OP = 'e340029'; // Potenciador de Penetração Op.
const RECARGA_OP = 'e340010'; // Potenciador de Recarga Op.
const PODER_OP = 'e340007'; // Potenciador de Poder Op.
const FATAL = 'e340027'; // Potenciador de Golpe Fatal
const ACELERACAO = 'e340016'; // Potenciador de Aceleração

const perto = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg ?? ''} ${a} ≠ ${b}`);
const valor = (chave, tipo) => versaoEquip(chave, 1).efeitos.find((e) => e.tipo === tipo).valor;

function mundo() {
  const w = new World({ preparacaoS: 0, jungle: false, torretas: false });
  w.mineradores.passo = () => {};
  return w;
}

/**
 * Compra (pousado na Loja da própria base) os equipamentos da lista e põe cada um na
 * nave (a compra vai para o compartimento): no encaixe da categoria, o potenciador no
 * primeiro vazio.
 */
function equipar(w, j, itens) {
  const sv = SERVICOS.find((s) => s.servico === 'loja' && s.time === j.time);
  Object.assign(j.ship, { x: sv.x, z: sv.z, vx: 0, vz: 0, pousado: true });
  j.ouro += 10000;
  for (const k of itens) {
    assert.equal(w.pedido(j.id, { t: 'comprar', item: k }).ok, true, k);
    const inst = j.inv.at(-1).id;
    const cat = EQUIPAMENTOS[k].categoria;
    const slot = cat === 'potenciador' ? ['pot1', 'pot2'][j.equipado.pot.indexOf(null)] : cat;
    assert.equal(w.pedido(j.id, { t: 'equipar', slot, inst }).ok, true, `equipar ${k}`);
  }
}

/**
 * A (Acron Assault) atira um feixe em B (Shrewdo Assault), 20 m à frente, fora da
 * zona segura. `prep(w, a, b)` monta a build antes. Devolve o mundo, os dois, o HP
 * que B perdeu e os eventos de acerto em B.
 */
function tiro(prep = () => {}) {
  const w = mundo();
  const a = w.addPlayer('A', 'acron', 'assault');
  const b = w.addPlayer('B', 'shrewdo', 'assault');
  prep(w, a, b);
  const z = BASE.z - ZONA_SEGURA - 120;
  const s = a.ship;
  Object.assign(s, { x: BASE.x, z, y: createShip('acron', BASE.x, z, 0).y, yaw: 0, vx: 0, vz: 0, pousado: false });
  Object.assign(b.ship, { x: BASE.x, z: z - 20, y: s.y, vx: 0, vz: 0, pousado: false });
  a.protegidoAte = b.protegidoAte = 0;
  w.tirarEventos();
  const hp = b.ship.hp;
  w.pushInput(a.id, { s: a.ack + 1, f1: true });
  const eventos = [];
  for (let i = 0; i < 5; i++) {
    w.step();
    eventos.push(...w.tirarEventos());
  }
  return { w, a, b, perdeu: hp - b.ship.hp, acertos: eventos.filter((e) => e.e === 'acerto' && e.alvo === b.id) };
}

test('status: sem nada, o feixe tira o dano dele', () => {
  assert.equal(TIPO, 'laser');
  perto(tiro().perdeu, DANO);
});

test('status: o poder do tipo da arma (pontos e potenciador) aumenta o dano; o de outro tipo não', () => {
  const pct = porPonto('acron', 'assault').laser / 100;
  const { perdeu } = tiro((w, a) => {
    assert.equal(w.pedido(a.id, { t: 'pontos', atributo: 'laser', qtd: 10 }).ok, true);
  });
  perto(perdeu, DANO * (1 + 10 * pct), 'pontos Op.');
  const pot = tiro((w, a) => equipar(w, a, [PODER_OP])).perdeu;
  perto(pot, DANO * (1 + valor(PODER_OP, 'poder')), 'potenciador');
  const outro = tiro((w, a) => {
    assert.equal(w.pedido(a.id, { t: 'pontos', atributo: 'fisico', qtd: 10 }).ok, true);
  }).perdeu;
  perto(outro, DANO, 'Ph. não mexe no laser');
});

test('status: resistência do alvo ao tipo reduz o dano, e a penetração de quem bate tira parte dela', () => {
  const resist = versaoEquip(ARMADURA_OP, 1).efeitos.find((e) => e.tipo === 'resist' && e.tipoDano === 'laser').valor;
  const { perdeu, b } = tiro((w, a, b) => equipar(w, b, [ARMADURA_OP]));
  perto(b.status.resist.laser, resist);
  perto(perdeu, DANO * (1 - resist), 'armadura Op.');
  const pen = valor(PENETRA_OP, 'penetra');
  const comPen = tiro((w, a, b) => {
    equipar(w, b, [ARMADURA_OP]);
    equipar(w, a, [PENETRA_OP]);
  }).perdeu;
  perto(comPen, DANO * (1 - Math.max(0, resist - pen)), 'penetração');
});

test('status: os debuffs de quebra tiram da resistência, como no original (zerar a do tipo ou tirar pontos de todas)', () => {
  const resist = versaoEquip(ARMADURA_OP, 1).efeitos.find((e) => e.tipo === 'resist' && e.tipoDano === 'laser').valor;
  const fim = 10 * SEGUNDO;
  // Canhão Amplificador: zera a resistência Op. (o laser) enquanto dura.
  const zerada = tiro((w, a, b) => {
    equipar(w, b, [ARMADURA_OP]);
    b.st = { vulneravel_laser: { fim, menos: 1 } };
  }).perdeu;
  perto(zerada, DANO, 'resistência Op. zerada');
  // Zerar a de outro tipo não mexe no laser.
  const outroTipo = tiro((w, a, b) => {
    equipar(w, b, [ARMADURA_OP]);
    b.st = { vulneravel_fisico: { fim, menos: 1 } };
  }).perdeu;
  perto(outroTipo, DANO * (1 - resist), 'Ph. zerada, Op. inteira');
  // Quebra-Resistência V1: tira 13 pontos de todas.
  const quebrada = tiro((w, a, b) => {
    equipar(w, b, [ARMADURA_OP]);
    b.st = { vulneravel: { fim, menos: 0.13 } };
  }).perdeu;
  perto(quebrada, DANO * (1 - Math.max(0, resist - 0.13)), 'menos 13 pontos');
});

test('status: o snapshot leva as resistências do piloto (a cor do nick), já sem o que a quebra tira', () => {
  const resist = versaoEquip(ARMADURA_OP, 1).efeitos.filter((e) => e.tipo === 'resist');
  const { w, b } = tiro((w, a, b) => equipar(w, b, [ARMADURA_OP]));
  const esperado = ['fisico', 'laser', 'eletrico'].map((t) => +(resist.find((e) => e.tipoDano === t)?.valor ?? 0).toFixed(2));
  assert.deepEqual(w.resistVisivel(b), esperado);
  assert.deepEqual(w.entidades().find((e) => e.id === b.id).res, esperado, 'na entidade');
  assert.deepEqual(w.snapshotPara(b, [], []).me.res, esperado, 'no me também');
  b.st = { vulneravel_laser: { fim: w.tick + 100, menos: 1 } };
  assert.equal(w.resistVisivel(b)[1], 0, 'Op. zerada: o nick mostra');
  const { b: semNada, w: w2 } = tiro();
  assert.equal(w2.resistVisivel(semNada), null, 'sem resistência não vem');
  assert.equal(w2.entidades().find((e) => e.id === semNada.id).res, undefined);
});

test('status: a resistência chega até 95% (RESIST_MAX), nunca imune', () => {
  assert.equal(RESIST_MAX, 0.95);
  const { perdeu, b } = tiro((w, a, b) => {
    b.status = { ...b.status, resist: { ...b.status.resist, laser: RESIST_MAX } };
  });
  perto(perdeu, DANO * (1 - 0.95));
  assert.ok(b.ship.hp < b.ship.maxHp);
});

test('status: golpe crítico dobra o dano (o sorteio é do servidor)', () => {
  const sempre = tiro((w, a) => {
    equipar(w, a, [FATAL]);
    w.rng = () => 0; // tudo abaixo da chance
  });
  perto(sempre.perdeu, DANO * CRITICO_MULT);
  assert.ok(sempre.acertos.length > 0 && sempre.acertos.every((e) => e.crit === true), 'o evento avisa');
  const nunca = tiro((w, a) => {
    equipar(w, a, [FATAL]);
    w.rng = () => 0.999;
  });
  perto(nunca.perdeu, DANO);
  assert.ok(nunca.acertos.every((e) => e.crit === undefined));
});

test('escudo: segura o dano antes do HP, só recupera depois de um tempo sem dano e enche ao renascer', () => {
  const resist = valor(ESCUDO, 'resist');
  const total = DANO * (1 - resist);
  // Escudo cheio: o HP não mexe.
  const cheio = tiro((w, a, b) => {
    equipar(w, b, [ESCUDO]);
    b.ship.escudo = b.ship.maxEscudo;
  });
  const b = cheio.b;
  perto(cheio.perdeu, 0, 'o escudo segurou tudo');
  perto(b.ship.escudo, b.ship.maxEscudo - total);
  const ev = cheio.acertos.reduce((s, e) => s + e.escudo, 0);
  perto(ev, total, 'o evento conta a parte do escudo');
  perto(cheio.acertos.reduce((s, e) => s + e.dano, 0), total, 'e o dano todo');

  // Escudo quase vazio: o resto vai para o HP.
  const pouco = tiro((w, a, b) => {
    equipar(w, b, [ESCUDO]);
    b.ship.escudo = 5;
  });
  perto(pouco.b.ship.escudo, 0);
  perto(pouco.perdeu, total - 5);

  // Recupera regenEscudo por s, mas só depois de ESCUDO_ESPERA_S sem dano.
  const w = pouco.w;
  const s = pouco.b.ship;
  for (let i = 0; i < (ESCUDO_ESPERA_S - 0.5) * SEGUNDO; i++) w.step();
  assert.equal(s.escudo, 0, 'levou dano há pouco: não recupera');
  for (let i = 0; i < 2 * SEGUNDO; i++) w.step();
  assert.ok(s.escudo > 0 && s.escudo <= 2 * s.regenEscudo, `recuperando (${s.escudo})`);
  const ent = w.entidades().find((e) => e.id === pouco.b.id);
  perto(ent.esc, +(s.escudo / s.maxEscudo).toFixed(2), 'a entidade traz a fração');

  // Morre e renasce com o escudo cheio.
  const j = pouco.b;
  j.ship.hp = 0;
  j.vivo = false;
  j.respawnTick = w.tick + 1;
  w.step();
  assert.ok(j.vivo);
  assert.equal(j.ship.escudo, j.ship.maxEscudo);
});

test('escudo: pousada e parada na própria base, enche rápido', () => {
  const w = mundo();
  const j = w.addPlayer('A', 'bellico', 'assault');
  equipar(w, j, [ESCUDO]);
  Object.assign(j.ship, { x: BASE.x, z: BASE.z, vx: 0, vz: 0, pousado: true, escudo: 0 });
  j.ultimoDano = w.tick; // acabou de levar dano: a regeneração normal espera, a da base não
  for (let i = 0; i < 4 * SEGUNDO; i++) w.step();
  assert.equal(j.ship.escudo, j.ship.maxEscudo);
});

test('recarga: o potenciador do tipo encurta a recarga da arma, e a predição bate com o servidor', () => {
  const w = mundo();
  const a = w.addPlayer('A', 'acron', 'assault');
  equipar(w, a, [RECARGA_OP]);
  const mult = multRecarga(valor(RECARGA_OP, 'recarga'));
  Object.assign(a.ship, { pousado: false, x: BASE.x, z: BASE.z - ZONA_SEGURA - 120, vx: 0, vz: 0 });
  const me = structuredClone(w.snapshotPara(a, [], []).me);
  assert.deepEqual(me.recargaMult, { fisico: 1, laser: mult, eletrico: 1 });
  const cmd = { s: a.ack + 1, f1: true, f2: true };
  w.pushInput(a.id, cmd);
  w.step();
  stepShip(me, sanitizeInput(cmd));
  perto(a.ship.cd1, versaoArma(FEIXE, 1).cd * mult, 'laser mais rápido');
  const vulcan = armasIniciais('acron')[1];
  perto(a.ship.cd2, versaoArma(vulcan, 1).cd, 'a Vulcan (físico) não muda');
  perto(me.cd1, a.ship.cd1, 'predição do Z');
  perto(me.cd2, a.ship.cd2, 'predição do X');
});

test('aceleração: o potenciador faz a nave chegar mais rápido na velocidade', () => {
  const w = mundo();
  const j = w.addPlayer('A', 'shrewdo', 'mobile');
  const k = w.addPlayer('B', 'shrewdo', 'mobile');
  equipar(w, j, [ACELERACAO]);
  perto(j.ship.acelMult, 1 + valor(ACELERACAO, 'aceleracao'));
  for (const [n, x] of [[j, -20], [k, 20]]) Object.assign(n.ship, { x, z: 420, vx: 0, vz: 0, yaw: 0, pousado: false });
  for (let s = 1; s <= SEGUNDO / 2; s++) {
    w.pushInput(j.id, { s: j.ack + 1, th: 1 });
    w.pushInput(k.id, { s: k.ack + 1, th: 1 });
    w.step();
  }
  assert.ok(Math.hypot(j.ship.vx, j.ship.vz) > Math.hypot(k.ship.vx, k.ship.vz) * 1.05);
});
