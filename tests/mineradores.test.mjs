// Mineradores (server/mineradores.js) e o contrato de bônus (server/bonus.js):
// ciclo base → minério → entrega, efeito dos bônus, destruição pelo outro time.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../server/game.js';
import { MINERADOR } from '../server/mineradores.js';
import { Bonus, BONUS } from '../server/bonus.js';
import { createShip, createBullet, WEAPONS } from '../shared/sim.js';
import { BASES, ENTREGAS, MINERIO, heightAt } from '../shared/terrain.js';
import { alturaSolida } from '../shared/obstaculos.js';

const SEGUNDO = 30; // ticks

// rng com semente: os testes não dependem da sorte do Math.random.
function rngFixo(semente = 1) {
  let s = semente;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** Mundo com um jogador em cada time (a partida começa no primeiro passo). */
function mundo() {
  const w = new World({ drones: 0, monstros: 0, rng: rngFixo() });
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

test('bônus: ativar, ativo, restante, renovar e snapshot', () => {
  const b = new Bonus();
  assert.equal(b.ativo(0, 'mineracao', 0), false);
  b.ativar(0, 'mineracao', 60, 100);
  assert.equal(b.ativo(0, 'mineracao', 100), true);
  assert.equal(b.ativo(1, 'mineracao', 100), false, 'só no time que ganhou');
  assert.ok(Math.abs(b.restante(0, 'mineracao', 100) - 60) < 1e-9);
  assert.ok(Math.abs(b.restante(0, 'mineracao', 100 + 30 * SEGUNDO) - 30) < 1e-9);
  assert.equal(b.ativo(0, 'mineracao', 100 + 60 * SEGUNDO), false, 'acabou');
  b.ativar(0, 'mineracao', 10, 0); // mais curto que o que já vale: não encurta
  assert.ok(Math.abs(b.restante(0, 'mineracao', 100) - 60) < 1e-9);
  b.ativar(1, 'velocidade', 5, 100);
  assert.deepEqual(b.paraSnapshot(100 + 10), { 0: { mineracao: 60 }, 1: { velocidade: 5 } });
  assert.throws(() => b.ativar(0, 'voar', 10, 0), /bônus desconhecido/);
  b.limpar();
  assert.deepEqual(b.paraSnapshot(0), { 0: {}, 1: {} });
});

test('mineradores: fazem o ciclo base → minério → entrega e somam 10 no placar, sem atravessar construção', () => {
  const { w } = mundo();
  let viuCarregado = false;
  let viuMinerando = false;
  const entregas = [];
  for (let i = 0; i < 70 * SEGUNDO && entregas.length < 2; i++) {
    w.step();
    for (const m of w.mineradores.lista) {
      // O centro do minerador nunca fica dentro de construção (cristais, portal...).
      assert.ok(alturaSolida(m.ship.x, m.ship.z) <= heightAt(m.ship.x, m.ship.z) + 1e-9, `dentro de construção em (${m.ship.x}, ${m.ship.z})`);
      if (m.estado === 'minerando') {
        viuMinerando = true;
        assert.ok(Math.hypot(m.ship.x - MINERIO.x, m.ship.z - MINERIO.z) < MINERIO.raio + 20, 'minera na coroa do depósito');
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

test('mineradores: bônus de mineração faz a viagem entregar 11', () => {
  const { w } = mundo();
  w.bonus.ativar(0, 'mineracao', 120, w.tick);
  const r = primeiraEntrega(w, 0);
  assert.equal(r.evento.carga, MINERADOR.carga + BONUS.mineracao.cargaExtra);
  assert.equal(w.partida.placar[0], 11);
  assert.equal(w.snapshotPara([...w.players.values()][0], [], []).bonus[0].mineracao > 0, true, 'o snapshot mostra o bônus');
});

test('mineradores: bônus de velocidade encurta o ciclo', () => {
  const normal = primeiraEntrega(mundo().w, 0).segundos;
  const { w } = mundo();
  w.bonus.ativar(0, 'velocidade', 120, w.tick);
  const rapido = primeiraEntrega(w, 0).segundos;
  assert.ok(rapido < normal * 0.85, `com bônus ${rapido}s, sem ${normal}s`);
});

test('mineradores: bônus de durabilidade aumenta o HP enquanto vale', () => {
  const { w } = mundo();
  const m = w.mineradores.lista.find((x) => x.time === 1);
  assert.equal(m.ship.maxHp, MINERADOR.hp);
  m.ship.hp = MINERADOR.hp / 2;
  w.bonus.ativar(1, 'durabilidade', 2, w.tick);
  w.step();
  assert.equal(m.ship.maxHp, MINERADOR.hp * BONUS.durabilidade.mult);
  assert.equal(m.ship.hp, (MINERADOR.hp * BONUS.durabilidade.mult) / 2, 'a vida acompanha na proporção');
  assert.equal(w.entidades().find((e) => e.id === m.id).maxHp, MINERADOR.hp * BONUS.durabilidade.mult);
  for (let i = 0; i < 3 * SEGUNDO; i++) w.step();
  assert.equal(m.ship.maxHp, MINERADOR.hp, 'acabou o bônus');
  assert.equal(w.mineradores.lista.find((x) => x.time === 0).ship.maxHp, MINERADOR.hp, 'o outro time não ganhou nada');
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
