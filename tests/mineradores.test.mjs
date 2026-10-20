// Mineradores (server/mineradores.js): ciclo base → doca → entrega em linha reta,
// tempos, onda do Núcleo, destruição pelo outro time.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../server/game.js';
import { MINERADOR, MINERADOR_NUCLEO } from '../server/mineradores.js';
import { createShip, createBullet, WEAPONS } from '../shared/sim.js';
import { BASES, ENTREGAS, DOCAS, ROTAS, heightAt } from '../shared/terrain.js';
import { alturaSolida } from '../shared/obstaculos.js';

const SEGUNDO = 30; // ticks

// rng com semente: os testes não dependem da sorte do Math.random.
function rngFixo(semente = 1) {
  let s = semente;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** Mundo com um jogador em cada time (a partida começa no primeiro passo). */
function mundo() {
  const w = new World({ jungle: false, rng: rngFixo() });
  const a = w.addPlayer('A', 'acron');
  const b = w.addPlayer('B', 'bellico');
  w.step();
  return { w, a, b };
}

/** Roda até a primeira entrega do time; devolve { segundos, evento } ou null. */
function primeiraEntrega(w, time, maxS = 120) {
  for (let i = 0; i < maxS * SEGUNDO; i++) {
    w.step();
    const ev = w.tirarEventos().find((e) => e.e === 'entrega' && e.time === time);
    if (ev) return { segundos: i / SEGUNDO, evento: ev };
  }
  return null;
}

test('mineradores: fazem o ciclo base → doca → entrega e somam 10 no placar, sem atravessar construção', () => {
  const { w } = mundo();
  let viuCarregado = false;
  let viuMinerando = false;
  const entregas = [];
  for (let i = 0; i < 100 * SEGUNDO && entregas.length < 2; i++) {
    w.step();
    for (const m of w.mineradores.lista) {
      // O centro do minerador nunca fica dentro de construção (mineradora, torretas...).
      assert.ok(alturaSolida(m.ship.x, m.ship.z) <= heightAt(m.ship.x, m.ship.z) + 1e-9, `dentro de construção em (${m.ship.x}, ${m.ship.z})`);
      if (m.estado === 'minerando') {
        viuMinerando = true;
        const d = DOCAS[m.time];
        assert.ok(Math.hypot(m.ship.x - d.x, m.ship.z - d.z) < 30, 'minera na doca do próprio time');
      }
    }
    for (const e of w.entidades()) if (e.tipo === 'minerador' && e.carga === MINERADOR.carga) viuCarregado = true;
    for (const e of w.tirarEventos()) if (e.e === 'entrega') entregas.push(e);
  }
  assert.ok(viuMinerando, 'parou para minerar');
  assert.ok(viuCarregado, 'o snapshot mostra o contêiner cheio');
  assert.deepEqual(entregas.map((e) => [e.time, e.carga]).sort(), [[0, 10], [1, 10]]);
  assert.deepEqual(w.partida.placar, [10, 10]);
  for (const e of entregas) {
    const ent = ENTREGAS[e.time];
    assert.ok(Math.abs(e.z - ent.z) <= ent.profundidade / 2 && Math.abs(e.x - ent.x) <= ent.largura / 2, 'entregou na entrega do próprio time');
  }
  const ent = w.entidades().find((e) => e.tipo === 'minerador');
  assert.equal(typeof ent.time, 'number');
  assert.equal(typeof ent.carga, 'number');
  assert.equal(typeof ent.minerando, 'boolean');
});

test('mineradores: saem em intervalos, no máximo MINERADOR.maxAtivos por time', () => {
  const { w } = mundo();
  const conta = (t) => w.mineradores.lista.filter((m) => m.time === t).length;
  assert.equal(conta(0), 1, 'o primeiro sai no começo da partida');
  for (let i = 0; i < (MINERADOR.intervaloS - 1) * SEGUNDO; i++) w.step();
  assert.equal(conta(0), 1);
  for (let i = 0; i < 2 * SEGUNDO; i++) w.step();
  assert.equal(conta(0), 2, 'o segundo sai depois do intervalo');
  let maximo = 0;
  for (let i = 0; i < 6 * MINERADOR.intervaloS * SEGUNDO; i++) {
    w.step();
    maximo = Math.max(maximo, conta(0), conta(1));
  }
  assert.equal(maximo, MINERADOR.maxAtivos);
});

test('mineradores: linha reta da entrega à doca, nos tempos documentados (ida ~40 s, primeira entrega ~79 s, ciclo ~75 s)', () => {
  const { w } = mundo();
  const m = w.mineradores.lista.find((x) => x.time === 0);
  let minerouEm = null;
  let entregas = [];
  let maxDesvio = 0;
  for (let i = 0; i < 260 * SEGUNDO && entregas.length < 2; i++) {
    w.step();
    if (m.vivo) maxDesvio = Math.max(maxDesvio, Math.abs(m.ship.z));
    if (minerouEm === null && m.estado === 'minerando') minerouEm = w.tick;
    for (const e of w.tirarEventos()) if (e.e === 'entrega' && e.id === m.id) entregas.push(w.tick);
  }
  assert.ok(maxDesvio < 25, `voa reto pela lane (desvio ${maxDesvio.toFixed(1)} m)`);
  const ida = minerouEm / SEGUNDO;
  const primeira = entregas[0] / SEGUNDO;
  const ciclo = (entregas[1] - entregas[0]) / SEGUNDO;
  assert.ok(ida > 36 && ida < 46, `ida ${ida.toFixed(1)} s`);
  assert.ok(primeira > 74 && primeira < 88, `primeira entrega ${primeira.toFixed(1)} s`);
  assert.ok(ciclo > 68 && ciclo < 84, `ciclo ${ciclo.toFixed(1)} s`);
});

test('mineradores: a onda do Núcleo sai na hora, além do limite, carrega 50, entrega e some', () => {
  const { w } = mundo();
  w.escoltas.passo = () => {};
  const conta = (t) => w.mineradores.lista.filter((m) => m.time === t && !m.nucleo).length;
  const onda = w.mineradores.ondaDoNucleo(1, w.tick);
  assert.equal(onda.length, MINERADOR_NUCLEO.quantos);
  assert.ok(w.tirarEventos().some((e) => e.e === 'ondaNucleo' && e.time === 1 && e.ids.length === 3));
  for (const m of onda) {
    assert.equal(m.nucleo, true);
    assert.equal(m.ship.maxHp, MINERADOR.hp * MINERADOR_NUCLEO.hpMult);
    assert.equal(m.ship.raio, MINERADOR_NUCLEO.raio, 'alvo maior');
  }
  const ent = w.entidades().find((e) => e.id === onda[0].id);
  assert.equal(ent.nucleo, 1, 'o snapshot marca o minerador do Núcleo');
  // Os normais continuam saindo até o limite deles.
  let maxNormais = 0;
  const entregas = [];
  for (let i = 0; i < 200 * SEGUNDO && entregas.length < 3; i++) {
    w.step();
    maxNormais = Math.max(maxNormais, conta(1));
    for (const e of w.tirarEventos()) if (e.e === 'entrega' && e.nucleo) entregas.push(e);
  }
  assert.equal(entregas.length, 3, 'os três entregaram');
  assert.ok(entregas.every((e) => e.carga === MINERADOR_NUCLEO.carga && e.time === 1));
  assert.equal(maxNormais, MINERADOR.maxAtivos, 'contam além do limite normal');
  assert.equal(w.mineradores.lista.filter((m) => m.nucleo).length, 0, 'somem depois de entregar');
  assert.ok(w.partida.placar[1] >= 3 * MINERADOR_NUCLEO.carga);
});

test('mineradores: o do Núcleo é mais lento que o normal', () => {
  const { w } = mundo();
  const [n] = w.mineradores.ondaDoNucleo(0, w.tick);
  const normal = w.mineradores.lista.find((m) => m.time === 0 && !m.nucleo);
  for (let i = 0; i < 10 * SEGUNDO; i++) w.step();
  const andouN = Math.abs(n.ship.x - ROTAS[0][0].x);
  const andou = Math.abs(normal.ship.x - ROTAS[0][0].x);
  assert.ok(andouN < andou * 0.85, `Núcleo ${andouN.toFixed(0)} m, normal ${andou.toFixed(0)} m`);
});

test('mineradores: destruir o do outro time dá ouro e a carga se perde; aliado e drone não ferem', () => {
  const { w, a, b } = mundo();
  // Um minerador do time 0 voltando carregado, no corredor (fora da zona segura).
  const m = w.mineradores.lista.find((x) => x.time === 0);
  m.ship = createShip(MINERADOR.raca, 15, 300, Math.PI);
  m.ship.time = 0;
  m.ship.hp = m.ship.maxHp = MINERADOR.hp;
  m.estado = 'volta';
  m.carga = MINERADOR.carga;
  m.ponto = 3;
  const atirarDe = (dono, kind = 'plasma') => {
    const s = createShip('acron', m.ship.x, m.ship.z - 20, Math.PI); // atrás dele, olhando para ele (+z)
    const bala = createBullet(s, kind, 5000 + w.tick, dono?.id ?? -1);
    bala.time = dono?.time;
    bala.drone = !dono;
    w.bullets.push(bala);
  };
  atirarDe(a); // aliado
  atirarDe(null); // drone
  w.step();
  assert.equal(m.ship.hp, MINERADOR.hp, 'aliado e drone não ferem minerador');

  const ouro = b.ouro;
  m.ship.hp = WEAPONS.plasma.dano; // um plasma derruba
  atirarDe(b);
  w.step();
  assert.equal(m.vivo, false);
  assert.equal(m.carga, 0, 'o minério se perdeu');
  assert.equal(b.ouro - ouro, MINERADOR.ouro);
  assert.equal(b.abates, 1);
  const morte = w.tirarEventos().find((e) => e.e === 'morte' && e.id === m.id);
  assert.deepEqual([morte.tipo, morte.time, morte.por], ['minerador', 0, b.id]);
  w.step();
  assert.equal(w.mineradores.lista.includes(m), false, 'sai do mapa');
  for (let i = 0; i < 30 * SEGUNDO; i++) w.step();
  assert.equal(w.partida.placar[0], 0, 'a carga destruída não chegou ao placar');
});

test('mineradores: na própria base são protegidos como os jogadores', () => {
  const { w, a, b } = mundo();
  a.ship = createShip('acron', BASES[0].x - 150, BASES[0].z); // fora da linha do tiro
  const m = w.mineradores.lista.find((x) => x.time === 0);
  assert.ok(Math.hypot(m.ship.x - BASES[0].x, m.ship.z - BASES[0].z) < 50, 'acabou de sair da base');
  const s = createShip('acron', m.ship.x, m.ship.z - 20, Math.PI);
  const bala = createBullet(s, 'plasma', 7000, b.id);
  bala.time = b.time;
  w.bullets.push(bala);
  w.tirarEventos();
  w.step();
  assert.ok(w.tirarEventos().some((e) => e.e === 'acerto' && e.alvo === m.id && e.dano === 0), 'acertou, sem dano');
  assert.equal(m.ship.hp, MINERADOR.hp);
});
