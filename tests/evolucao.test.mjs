// Evolução da base (shared/evolucao.js + server/servicos.js): as melhorias dos
// mineradores que valem para o time inteiro, com limite e defesa, e tudo zerando na
// partida seguinte. A compra da próxima nave da linha está em tests/naves.test.mjs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../server/game.js';
import { MINERADOR } from '../server/mineradores.js';
import { createShip, WEAPONS } from '../shared/sim.js';
import { SERVICOS } from '../shared/terrain.js';
import { naveDe } from '../shared/naves.js';
import { MELHORIAS_MINERADOR, MIN_DEFESA_POR_NIVEL, MIN_HP_POR_NIVEL } from '../shared/evolucao.js';

const SEGUNDO = 30;

function pousar(j, servico, time = j.time) {
  const sv = SERVICOS.find((s) => s.servico === servico && s.time === time);
  Object.assign(j.ship, { x: sv.x, z: sv.z, vx: 0, vz: 0, pousado: true });
}

function mundo(opcoes = {}) {
  return new World({ drones: 0, monstros: 0, elites: 0, ...opcoes });
}

const evoluir = (w, j, opcao) => w.pedido(j.id, { t: 'evoluir', opcao });
const melhorar = (w, j, melhoria) => w.pedido(j.id, { t: 'melhorar', melhoria });

test('evolução: zera na partida seguinte (nave e mineradores dos dois times)', () => {
  const w = mundo({ duracaoPartidaS: 2, intervaloFimS: 1 });
  const a = w.addPlayer('A', 'bellico');
  const b = w.addPlayer('B', 'bellico');
  w.step();
  for (const j of [a, b]) {
    pousar(j, 'evolucao');
    j.nivel = 5;
    j.ouro = 1000;
  }
  assert.equal(evoluir(w, a, 'nave').ok, true);
  assert.equal(a.tier, 1);
  assert.equal(melhorar(w, a, 'velocidade').ok, true);
  assert.equal(melhorar(w, b, 'quantidade').ok, true);
  for (let i = 0; i < SEGUNDO * 10 && w.partida.numero < 2; i++) w.step();
  assert.equal(w.partida.numero, 2);
  assert.equal(a.tier, 0, 'volta à primeira nave da linha');
  assert.equal(a.ship.tier, 0);
  assert.equal(a.ship.maxHp, naveDe('bellico', 'assault', 0).hp);
  for (const t of [0, 1]) {
    assert.deepEqual(w.servicos.niveis[t], { quantidade: 0, durabilidade: 0, defesa: 0, velocidade: 0 });
    const at = w.mineradores.atributos(t, w.tick);
    assert.equal(at.maxAtivos, MINERADOR.maxAtivos);
    assert.equal(at.velocidade, MINERADOR.velocidade);
  }
});

test('evolução: melhoria de mineradores vale para o time todo, avisa e para no limite', () => {
  const w = mundo();
  const a = w.addPlayer('A', 'bellico'); // time 0
  const b = w.addPlayer('B', 'bellico'); // time 1
  const c = w.addPlayer('C', 'bellico'); // time 0
  assert.equal(a.time, c.time);
  assert.notEqual(a.time, b.time);
  for (const j of [a, b, c]) {
    pousar(j, 'evolucao');
    j.ouro = 5000;
  }
  const precos = MELHORIAS_MINERADOR.durabilidade.precos;
  assert.equal(melhorar(w, a, 'durabilidade').ok, true);
  assert.equal(a.ouro, 5000 - precos[0], 'quem paga é quem compra');
  const ev = w.eventos.find((e) => e.e === 'melhoria');
  assert.deepEqual(ev, { e: 'melhoria', id: a.id, nome: 'A', time: a.time, melhoria: 'durabilidade', nivel: 1 });
  assert.equal(w.mineradores.atributos(a.time, w.tick).hp, MINERADOR.hp * (1 + MIN_HP_POR_NIVEL));
  assert.equal(w.mineradores.atributos(b.time, w.tick).hp, MINERADOR.hp, 'o outro time não ganha nada');

  // O colega de time paga o nível seguinte, com preço maior.
  assert.equal(melhorar(w, c, 'durabilidade').ok, true);
  assert.equal(c.ouro, 5000 - precos[1]);
  assert.equal(w.servicos.niveis[a.time].durabilidade, 2);
  assert.equal(melhorar(w, a, 'durabilidade').ok, true);
  assert.equal(melhorar(w, c, 'durabilidade').codigo, 'limite');
  assert.equal(c.ouro, 5000 - precos[1], 'limite não cobra');
  assert.equal(w.snapshotPara(c, [], []).melhorias.durabilidade, precos.length);
  assert.equal(w.snapshotPara(b, [], []).melhorias.durabilidade, 0);

  // Mais mineradores: sai mais um do que o normal.
  b.ouro = 0;
  assert.equal(melhorar(w, b, 'quantidade').codigo, 'ouro_insuficiente');
  assert.equal(melhorar(w, a, 'quantidade').ok, true);
  for (let i = 0; i < SEGUNDO * MINERADOR.intervaloS * (MINERADOR.maxAtivos + 1) + 10; i++) w.step();
  const doTime = (t) => w.mineradores.lista.filter((m) => m.vivo && m.time === t).length;
  assert.equal(doTime(a.time), MINERADOR.maxAtivos + 1);
  assert.equal(doTime(b.time), MINERADOR.maxAtivos);
});

test('evolução: a defesa reduz o dano que o minerador leva', () => {
  const dano = (niveisDefesa) => {
    const w = mundo();
    const dono = w.addPlayer('Dono', 'bellico'); // time 0
    const atirador = w.addPlayer('Atirador', 'acron'); // time 1
    pousar(dono, 'evolucao');
    dono.ouro = 5000;
    for (let i = 0; i < niveisDefesa; i++) assert.equal(melhorar(w, dono, 'defesa').ok, true);
    w.step(); // começa a partida e sai o primeiro minerador de cada time
    const m = w.mineradores.lista.find((x) => x.time === dono.time);
    // Minerador parado no corredor, fora da base; o atirador 20 m atrás dele.
    Object.assign(m.ship, { x: 0, z: 300, vx: 0, vz: 0, emp: 100 });
    Object.assign(atirador.ship, createShip('acron', 0, 280, Math.PI), { time: atirador.time, armas: atirador.ship.armas });
    atirador.protegidoAte = 0;
    const hp = m.ship.hp;
    w.pushInput(atirador.id, { s: 1, f1: true });
    for (let i = 0; i < 5; i++) w.step();
    return hp - m.ship.hp;
  };
  assert.equal(dano(0), WEAPONS.laser.dano);
  assert.ok(Math.abs(dano(1) - WEAPONS.laser.dano * (1 - MIN_DEFESA_POR_NIVEL)) < 1e-9);
  assert.ok(Math.abs(dano(3) - WEAPONS.laser.dano * (1 - 3 * MIN_DEFESA_POR_NIVEL)) < 1e-9);
});
