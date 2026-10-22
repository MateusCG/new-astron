// Armas em duas cópias (pedido do Mateus, como os potenciadores): o piloto pode ter
// até ARMA_COPIAS_MAX instâncias da mesma arma (a de fábrica conta), cada uma com a
// sua versão, e a mesma arma no Z e no X são duas cópias. O comando escolhe a
// INSTÂNCIA de cada encaixe pelo id (a, a2); a nave resolve arma e versão por encaixe
// (s.encInst, s.encaixes, s.nivEnc) a partir de s.armasInst, que vai no `me`: a
// predição do cliente decide igual ao servidor.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../server/game.js';
import { stepShip, sanitizeInput, INPUT_VAZIO, ARMAS, IDX_ARMA, armasIniciais, versaoArma, TROCA_ARMA_S, DT } from '../shared/sim.js';
import { BASES, SERVICOS } from '../shared/terrain.js';
import { ARMA_COPIAS_MAX, precoArma, precoEvoluirArma } from '../shared/loja.js';

const LAMINA = 'o112003'; // Lâmina Giratória Reforçada: Acron Assault, um projétil reto
const ESCUDO = 'e330010'; // Escudo Neutron Op. (todas as classes)

function mundo() {
  const w = new World({ preparacaoS: 0, jungle: false, torretas: false });
  w.mineradores.passo = () => {};
  return w;
}

function pousar(j, servico = 'loja') {
  const sv = SERVICOS.find((s) => s.servico === servico && s.time === j.time);
  Object.assign(j.ship, { x: sv.x, z: sv.z, vx: 0, vz: 0, pousado: true });
}

const comprar = (w, j, item) => w.pedido(j.id, { t: 'comprar', item });
const copias = (j, chave) => j.inv.filter((x) => x.chave === chave);
/** Piloto Acron Assault pousado na Loja, com ouro, e as duas cópias da Lâmina (ids). */
function comDuasCopias() {
  const w = mundo();
  const j = w.addPlayer('A', 'acron', 'assault');
  pousar(j);
  j.ouro = 100000;
  assert.equal(comprar(w, j, LAMINA).ok, true);
  assert.equal(comprar(w, j, LAMINA).ok, true);
  const [c1, c2] = copias(j, LAMINA).map((x) => x.id);
  return { w, j, c1, c2 };
}
/** Um comando de `j` e um passo do mundo. */
function comando(w, j, inp) {
  j.seq = (j.seq ?? 0) + 1;
  w.pushInput(j.id, { s: j.seq, ...INPUT_VAZIO, ...inp });
  w.step();
}

test('armas duplas: compra a segunda cópia (outra instância, cada uma no compartimento)', () => {
  const w = mundo();
  const j = w.addPlayer('A', 'acron', 'assault');
  pousar(j);
  j.ouro = 10000;
  assert.equal(ARMA_COPIAS_MAX, 2);
  assert.equal(comprar(w, j, LAMINA).ok, true);
  const ouro = j.ouro;
  assert.equal(comprar(w, j, LAMINA).ok, true, 'a segunda');
  assert.equal(j.ouro, ouro - precoArma(LAMINA), 'a segunda custa o mesmo que a primeira');
  const [a, b] = copias(j, LAMINA);
  assert.ok(a && b && a.id !== b.id, 'duas instâncias');
  assert.deepEqual([a.nivel, b.nivel], [1, 1]);
  const me = w.snapshotPara(j, [], []).me;
  assert.deepEqual(me.armasInst.filter((x) => x[1] === IDX_ARMA[LAMINA]).map((x) => x[0]), [a.id, b.id], 'as duas vão no `me`');
  assert.deepEqual(me.armas.filter((x) => x === IDX_ARMA[LAMINA]), [IDX_ARMA[LAMINA]], 'me.armas (posse por arma) não repete');
});

test('armas duplas: a terceira cópia é recusada (ja_possui), sem cobrar; a de fábrica conta como a primeira', () => {
  const { w, j } = comDuasCopias();
  const ouro = j.ouro;
  assert.deepEqual(comprar(w, j, LAMINA), { t: 'resultado', acao: 'comprar', item: LAMINA, ok: false, codigo: 'ja_possui' });
  assert.equal(j.ouro, ouro, 'recusa não cobra');
  assert.equal(copias(j, LAMINA).length, ARMA_COPIAS_MAX);
  const fabrica = ARMAS[armasIniciais('acron')[0]];
  assert.equal(comprar(w, j, fabrica).ok, true, 'segunda cópia da de fábrica');
  assert.equal(comprar(w, j, fabrica).codigo, 'ja_possui', 'terceira da de fábrica');
  assert.equal(copias(j, fabrica).filter((x) => x.fabrica).length, 1, 'a comprada não é de fábrica');
});

test('armas duplas: Z e X com a mesma arma em versões diferentes atiram cada um com a sua, na predição e no servidor', () => {
  const { w, j, c1, c2 } = comDuasCopias();
  // A cópia 2 vai à V3; a 1 fica na V1.
  assert.equal(w.pedido(j.id, { t: 'evoluirItem', inst: c2 }).ok, true);
  assert.equal(w.pedido(j.id, { t: 'evoluirItem', inst: c2 }).ok, true);
  j.ship.pousado = false;
  j.ship.en = j.ship.maxEn;
  comando(w, j, { a: c1, a2: c2 }); // na base: troca livre
  assert.deepEqual(j.ship.encInst, [c1, c2]);
  assert.deepEqual(j.ship.encaixes, [IDX_ARMA[LAMINA], IDX_ARMA[LAMINA]]);
  assert.deepEqual(j.ship.nivEnc, [1, 3]);

  // A predição parte do `me` e roda os mesmos comandos.
  const pred = structuredClone(w.snapshotPara(j, [], []).me);
  const comandos = [];
  for (let i = 0; i < 60; i++) comandos.push({ ...INPUT_VAZIO, th: i < 30 ? 0.4 : 0, tu: i % 20 < 5 ? 0.3 : 0, f1: i % 4 === 0, f2: i % 5 === 0, a: c1, a2: c2 });
  const tirosPred = [];
  const tirosSrv = [];
  for (const c of comandos) {
    tirosPred.push(...stepShip(pred, sanitizeInput(c)).map((d) => [d.enc, d.nivel]));
    w.tirarEventos();
    comando(w, j, c);
    tirosSrv.push(...w.tirarEventos().filter((e) => e.e === 'tiro' && e.dono === j.id).map((e) => [e.enc, e.nv]));
    for (const k of ['x', 'z', 'yaw', 'en', 'cd1', 'cd2']) assert.ok(Math.abs(pred[k] - j.ship[k]) < 1e-9, `${k}: ${pred[k]} × ${j.ship[k]}`);
    assert.deepEqual(pred.nivEnc, j.ship.nivEnc);
  }
  assert.ok(tirosSrv.some(([enc]) => enc === 0) && tirosSrv.some(([enc]) => enc === 1), 'os dois encaixes atiraram');
  for (const [enc, nv] of tirosSrv) assert.equal(nv, enc === 0 ? 1 : 3, `encaixe ${enc} na versão dele`);
  assert.deepEqual(tirosPred, tirosSrv, 'mesmos disparos, encaixe e versão, nos dois lados');
  // A recarga de cada encaixe é a da versão dele.
  assert.ok(versaoArma(LAMINA, 3).golpe.dano > versaoArma(LAMINA, 1).golpe.dano);
});

test('armas duplas: id que a nave não tem (ou de equipamento, ou o mesmo nos dois) cai na de fábrica', () => {
  const w = mundo();
  const j = w.addPlayer('A', 'acron', 'assault');
  const [fz, fx] = j.inv.map((x) => x.id);
  const [z, x] = armasIniciais('acron');
  pousar(j);
  j.ouro = 10000;
  assert.equal(comprar(w, j, ESCUDO).ok, true);
  const escudo = j.inv.at(-1).id;
  j.ship.pousado = false;
  comando(w, j, { a: 9999, a2: escudo });
  assert.deepEqual(j.ship.encInst, [fz, fx], 'id que não tem e id de escudo: as de fábrica');
  assert.deepEqual(j.ship.encaixes, [z, x]);
  comando(w, j, { a: fx, a2: fx });
  assert.deepEqual(j.ship.encInst, [fx, fz], 'a mesma instância nos dois: o X fica com a de fábrica que sobrou');
  comando(w, j, { a: 4242, a2: -1 });
  assert.deepEqual(j.ship.encInst, [fx, fz], 'id ruim não tira a arma do outro encaixe (fica com a de fábrica que tem)');
  comando(w, j, { a: fz, a2: fx });
  assert.deepEqual(j.ship.encInst, [fz, fx]);
  // Fora da base: id ruim no Z não troca nada (nem conta recarga de troca); um id
  // válido troca e conta, como sempre.
  const b = BASES[j.time];
  Object.assign(j.ship, { x: b.x, z: b.z + (b.z > 0 ? -1 : 1) * (b.raio + 80) });
  comando(w, j, { a: 4242, a2: fx });
  assert.deepEqual(j.ship.encInst, [fz, fx]);
  assert.equal(j.ship.troca1, 0, 'sem troca, sem recarga de troca');
  comando(w, j, { a: fx, a2: fz });
  assert.deepEqual(j.ship.encInst, [fx, fz], 'troca os dois de lugar');
  assert.ok(Math.abs(j.ship.troca1 - (TROCA_ARMA_S - DT)) < 1e-9 && Math.abs(j.ship.troca2 - (TROCA_ARMA_S - DT)) < 1e-9, 'fora da base: recarga de troca nos dois');
  comando(w, j, { a: fz, a2: fx });
  assert.deepEqual(j.ship.encInst, [fx, fz], 'com a troca contando, os dois ficam com o que têm');
});

test('armas duplas: vender a cópia que está num encaixe é recusado; a do compartimento vende', () => {
  const { w, j, c1, c2 } = comDuasCopias();
  j.ship.pousado = false;
  comando(w, j, { a: c1 });
  assert.equal(j.ship.encInst[0], c1);
  pousar(j);
  assert.deepEqual(w.pedido(j.id, { t: 'vender', inst: c1 }), { t: 'resultado', acao: 'vender', item: c1, ok: false, codigo: 'equipado' });
  const ouro = j.ouro;
  assert.equal(w.pedido(j.id, { t: 'vender', inst: c2 }).ok, true, 'a outra cópia, no compartimento, vende');
  assert.equal(j.ouro, ouro + Math.floor(precoArma(LAMINA) / 2));
  assert.deepEqual(copias(j, LAMINA).map((x) => x.id), [c1]);
  assert.equal(j.ship.encInst[0], c1, 'a do encaixe continua lá');
});

test('armas duplas: evoluir uma cópia não mexe na outra (nem no inventário, nem na nave)', () => {
  const { w, j, c1, c2 } = comDuasCopias();
  j.ship.pousado = false;
  comando(w, j, { a: c1, a2: c2 });
  pousar(j);
  const ouro = j.ouro;
  assert.equal(w.pedido(j.id, { t: 'evoluirItem', inst: c1 }).ok, true, 'evolui a do Z, na nave');
  assert.equal(j.ouro, ouro - precoEvoluirArma(LAMINA, 1));
  const [a, b] = copias(j, LAMINA);
  assert.deepEqual([a.nivel, b.nivel], [2, 1]);
  assert.deepEqual([a.pago, b.pago], [precoArma(LAMINA) + precoEvoluirArma(LAMINA, 1), precoArma(LAMINA)]);
  assert.deepEqual(j.ship.nivEnc, [2, 1], 'a versão nova vale na hora no Z; o X segue na V1');
  const me = w.snapshotPara(j, [], []).me;
  assert.deepEqual(me.armasInst.filter((x) => x[1] === IDX_ARMA[LAMINA]).map((x) => x[2]), [2, 1]);
  // Renascer mantém as cópias nos encaixes, cada uma na sua versão.
  j.ship.hp = 0;
  j.vivo = false;
  j.respawnTick = w.tick + 1;
  w.step();
  assert.ok(j.vivo);
  assert.deepEqual(j.ship.encInst, [c1, c2]);
  assert.deepEqual(j.ship.nivEnc, [2, 1]);
});
