// Evolução de armas na Loja (shared/loja.js + server/servicos.js + server/game.js):
// cada arma possuída sobe até ARMA_NIVEL_MAX pagando ouro crescente; o dano sobe
// em todas e o efeito das de controle também; o nível fica no piloto (volta no
// renascimento, zera na partida seguinte).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World, ZONA_SEGURA } from '../server/game.js';
import { createShip, stepShip, IDX_ARMA, ARMAS, WEAPONS, CRIO_LENTIDAO } from '../shared/sim.js';
import { BASE, SERVICOS } from '../shared/terrain.js';
import {
  ARMA_NIVEL_MAX,
  PRECO_ARMA,
  precoEvoluirArma,
  danoMultNivel,
  efeitoDaArma,
  itemDaLoja,
  DANO_POR_NIVEL,
} from '../shared/loja.js';

const SEGUNDO = 30;
const PARADO = { th: 0, tu: 0, b: false, f1: false, f2: false, p: false };
const { laser, plasma, crio, emp, dreno, choque } = IDX_ARMA;

function mundo(opcoes = {}) {
  const w = new World({ drones: 0, monstros: 0, elites: 0, ...opcoes });
  w.mineradores.passo = () => {};
  return w;
}

function pousar(j, servico = 'loja', time = j.time) {
  const sv = SERVICOS.find((s) => s.servico === servico && s.time === time);
  Object.assign(j.ship, { x: sv.x, z: sv.z, vx: 0, vz: 0, pousado: true });
}

const evoluir = (w, j, kind) => w.pedido(j.id, { t: 'comprar', item: 'evoluir:' + kind });

test('evoluir arma: preço cresce por nível, até o máximo; duas armas custam o dobro', () => {
  for (const kind of ARMAS) {
    let antes = 0;
    for (let n = 1; n < ARMA_NIVEL_MAX; n++) {
      const p = precoEvoluirArma(kind, n);
      assert.ok(p > antes, `${kind} nível ${n}: ${p}`);
      antes = p;
    }
    assert.equal(precoEvoluirArma(kind, ARMA_NIVEL_MAX), null, 'no máximo não há próximo');
  }
  assert.ok(precoEvoluirArma('missil', 1) > precoEvoluirArma('laserDuplo', 1), 'arma mais cara evolui mais caro');
  assert.equal(precoEvoluirArma('laser', 0), null);
  assert.equal(precoEvoluirArma('nada', 1), null);
  assert.deepEqual(itemDaLoja('evoluir:crio'), { tipo: 'evoluirArma', arma: crio });
  assert.equal(itemDaLoja('evoluir:'), null);
});

test('evoluir arma: cobra o preço, exige pousado na Loja, possuir a arma, ouro, e para no máximo', () => {
  const w = mundo();
  const j = w.addPlayer('A', 'bellico');
  j.ouro = 10000;
  assert.equal(evoluir(w, j, 'laser').codigo, 'nao_pousado', 'voando');
  pousar(j, 'evolucao');
  assert.equal(evoluir(w, j, 'laser').codigo, 'nao_pousado', 'na Evolução não');
  pousar(j);
  assert.equal(evoluir(w, j, 'crio').codigo, 'sem_item', 'sem possuir o criogênico');
  assert.equal(evoluir(w, j, 'xyz').codigo, 'invalido');
  assert.equal(j.ouro, 10000, 'recusa não cobra');

  // Do 1 ao máximo, pagando o preço de cada nível.
  let pago = 0;
  for (let n = 1; n < ARMA_NIVEL_MAX; n++) {
    const preco = precoEvoluirArma('laser', n);
    const antes = j.ouro;
    assert.deepEqual(evoluir(w, j, 'laser'), { t: 'resultado', acao: 'comprar', item: 'evoluir:laser', ok: true });
    assert.equal(antes - j.ouro, preco, `nível ${n} → ${n + 1}`);
    pago += preco;
    assert.equal(j.niveisArmas[laser], n + 1);
  }
  assert.equal(evoluir(w, j, 'laser').codigo, 'limite');
  assert.equal(j.niveisArmas[laser], ARMA_NIVEL_MAX);

  // A segunda arma custa o mesmo tanto de novo: o foco numa só chega mais longe.
  j.ouro = pago - 1;
  for (let n = 1; n < ARMA_NIVEL_MAX; n++) evoluir(w, j, 'plasma');
  assert.ok(j.niveisArmas[plasma] < ARMA_NIVEL_MAX, 'com um ouro a menos não chega ao máximo');
  j.ouro = 0;
  assert.equal(evoluir(w, j, 'plasma').codigo, 'ouro_insuficiente');

  // Arma comprada também evolui; o `me` leva os níveis.
  j.ouro = PRECO_ARMA.crio + precoEvoluirArma('crio', 1);
  assert.equal(w.pedido(j.id, { t: 'comprar', item: 'crio' }).ok, true);
  assert.equal(evoluir(w, j, 'crio').ok, true);
  assert.equal(j.ouro, 0);
  const me = w.snapshotPara(j, [], []).me;
  assert.equal(me.niveisArmas.length, ARMAS.length);
  assert.equal(me.niveisArmas[crio], 2);
  assert.equal(me.niveisArmas[laser], ARMA_NIVEL_MAX);
});

/**
 * A (time 0) e B (time 1), B 20 m à frente de A, fora da zona segura. É ao lado das
 * torretas do time 0, então elas ficam sem atirar (senão também ferem B).
 */
function duelo() {
  const w = mundo({ torretas: false });
  const a = w.addPlayer('A', 'acron');
  const b = w.addPlayer('B', 'bellico');
  const z = BASE.z - ZONA_SEGURA - 120;
  a.ship = createShip('acron', BASE.x, z, 0);
  a.ship.armas = [...ARMAS.keys()];
  b.ship = createShip('bellico', BASE.x, z - 20, 0);
  b.ship.y = a.ship.y;
  a.protegidoAte = b.protegidoAte = 0;
  let seq = 0;
  /** A atira com a arma `i` no Z e o mundo anda até o tiro chegar. */
  const atirar = (i) => {
    w.pushInput(a.id, { s: ++seq, ...PARADO, f1: true, a: i });
    for (let k = 0; k < 6; k++) w.step();
  };
  return { w, a, b, atirar };
}

test('evoluir arma: o dano sobe com o nível (tiro e área)', () => {
  for (const nivel of [1, 3, ARMA_NIVEL_MAX]) {
    const { a, b, atirar } = duelo();
    a.niveisArmas[laser] = nivel;
    const hp = b.ship.hp;
    atirar(laser);
    assert.equal(hp - b.ship.hp, Math.round(WEAPONS.laser.dano * (1 + DANO_POR_NIVEL * (nivel - 1))), `laser nível ${nivel}`);
  }
  assert.equal(danoMultNivel(1), 1);
  assert.ok(danoMultNivel(ARMA_NIVEL_MAX) > danoMultNivel(2));
  assert.equal(danoMultNivel(99), danoMultNivel(ARMA_NIVEL_MAX), 'nível acima do máximo não vale mais');

  // Onda de choque: dano em área e empurrão maiores.
  const fraco = duelo();
  const forte = duelo();
  forte.a.niveisArmas[choque] = ARMA_NIVEL_MAX;
  const hp = fraco.b.ship.hp;
  fraco.atirar(choque);
  forte.atirar(choque);
  assert.ok(hp - forte.b.ship.hp > hp - fraco.b.ship.hp, 'choque fere mais');
  assert.ok(Math.abs(forte.b.ship.vz) > Math.abs(fraco.b.ship.vz), 'e empurra mais');
});

test('evoluir arma: nas de controle o efeito cresce (lento, EMP, dreno)', () => {
  // Criogênico: mais tempo e mais lento. O lento vai na nave (lentoMult), e o
  // stepShip do alvo (servidor e predição dele) usa essa força.
  const n1 = duelo();
  n1.atirar(crio);
  const n5 = duelo();
  n5.a.niveisArmas[crio] = ARMA_NIVEL_MAX;
  n5.atirar(crio);
  assert.equal(n1.b.ship.lentoMult, CRIO_LENTIDAO);
  assert.ok(n5.b.ship.lentoMult < CRIO_LENTIDAO);
  assert.equal(n5.b.ship.lentoMult, efeitoDaArma('crio', ARMA_NIVEL_MAX).mult);
  assert.ok(n5.b.ship.lento > n1.b.ship.lento + 0.5, `lento ${n5.b.ship.lento} × ${n1.b.ship.lento}`);
  const vel = (s) => {
    const t = structuredClone(s);
    t.vx = t.vz = 0;
    for (let i = 0; i < 20; i++) stepShip(t, { ...PARADO, th: 1 });
    return Math.hypot(t.vx, t.vz);
  };
  assert.ok(vel(n5.b.ship) < vel(n1.b.ship), 'o mais forte deixa mais lento');
  // Um lento fraco por cima de um forte não o enfraquece.
  n5.a.niveisArmas[crio] = 1;
  n5.w.step();
  n5.atirar(crio);
  assert.equal(n5.b.ship.lentoMult, efeitoDaArma('crio', ARMA_NIVEL_MAX).mult);

  // EMP: mais tempo sem tiro e sem boost.
  const e1 = duelo();
  e1.atirar(emp);
  const e5 = duelo();
  e5.a.niveisArmas[emp] = ARMA_NIVEL_MAX;
  e5.atirar(emp);
  assert.ok(e5.b.ship.emp > e1.b.ship.emp + 0.5);

  // Dreno: mais dano por segundo e por mais tempo.
  const d1 = duelo();
  d1.atirar(dreno);
  const d5 = duelo();
  d5.a.niveisArmas[dreno] = ARMA_NIVEL_MAX;
  d5.atirar(dreno);
  assert.ok(d5.b.drenoDps > d1.b.drenoDps && d5.b.drenoTicks > d1.b.drenoTicks);
  const hp1 = d1.b.ship.hp;
  const hp5 = d5.b.ship.hp;
  for (let i = 0; i < 2 * SEGUNDO; i++) {
    d1.w.step();
    d5.w.step();
  }
  assert.ok(hp5 - d5.b.ship.hp > hp1 - d1.b.ship.hp, 'drena mais rápido');
  assert.ok(Math.abs(hp1 - d1.b.ship.hp - WEAPONS.dreno.efeito.dps * 2) < 1, 'nível 1: o dreno de sempre');
});

test('evoluir arma: o nível volta no renascimento e zera na partida seguinte', () => {
  const w = mundo({ duracaoPartidaS: 2, intervaloFimS: 1 });
  const j = w.addPlayer('A', 'bellico');
  w.step();
  pousar(j);
  j.ouro = 5000;
  assert.equal(evoluir(w, j, 'laser').ok, true);
  assert.equal(evoluir(w, j, 'laser').ok, true);

  j.ship.hp = 0;
  j.vivo = false;
  j.respawnTick = w.tick + 1;
  w.step();
  assert.ok(j.vivo);
  assert.equal(j.niveisArmas[laser], 3, 'o nível é do piloto: volta com a nave nova');
  assert.equal(w.snapshotPara(j, [], []).me.niveisArmas[laser], 3);

  for (let i = 0; i < SEGUNDO * 10 && w.partida.numero < 2; i++) w.step();
  assert.equal(w.partida.numero, 2);
  assert.deepEqual(j.niveisArmas, ARMAS.map(() => 1), 'partida nova: todas no 1');
});
