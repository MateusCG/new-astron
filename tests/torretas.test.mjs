// Torretas do corredor (server/torretas.js, TORRETAS em shared/terrain.js):
// posição no mapa, tiro só em inimigo, dano só de jogador inimigo, queda (física e
// recompensa) e partida nova.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../server/game.js';
import { TORRETA, linhaDeTiro } from '../server/torretas.js';
import { RECOMPENSA, xpParaNivel } from '../server/progressao.js';
import { createShip, createBullet, WEAPONS, HOVER, SHIP_RADIUS } from '../shared/sim.js';
import { TORRETAS, TORRETA_LADO, BASES, CORREDOR, MINERIO, ROTAS, heightAt } from '../shared/terrain.js';
import { OBSTACULOS, TORRETA as PLANTA, alturaSolida, obstaculoAtivo } from '../shared/obstaculos.js';
import { FAIXA_MINERADOR } from '../server/mineradores.js';

const SEGUNDO = 30;

/** Mundo sem monstros, com um jogador em cada time, partida já começada. */
function mundo(opcoes = {}) {
  const w = new World({ drones: 0, monstros: 0, elites: 0, ...opcoes });
  const a = w.addPlayer('A', 'bellico'); // time 0
  const b = w.addPlayer('B', 'bellico'); // time 1
  a.protegidoAte = b.protegidoAte = 0;
  // Mineradores fora do caminho: o teste é da torreta.
  w.mineradores.passo = () => {};
  w.step();
  return { w, a, b };
}

/** Põe a nave do jogador parada em (x, z), voando, olhando para `yaw`. */
function colocar(j, x, z, yaw = 0) {
  const armas = j.ship.armas;
  j.ship = Object.assign(createShip('bellico', x, z, yaw), { time: j.time, armas });
}

const torreta = (w, id) => w.torretas.torreta(id);
const tirosDeTorreta = (ev) => ev.filter((e) => e.e === 'tiro' && e.fonte === 'torreta');

test('torretas: quatro por time, duas de cada lado, fora da estrada, na metade do time e simétricas', () => {
  assert.equal(TORRETAS.length, 8);
  for (const time of [0, 1]) {
    const minhas = TORRETAS.filter((t) => t.time === time);
    assert.equal(minhas.length, 4);
    assert.equal(minhas.filter((t) => t.x < CORREDOR.x).length, 2, 'duas de cada lado');
    const b = BASES[time];
    for (const t of minhas) {
      assert.ok(Math.abs(t.x - CORREDOR.x) > CORREDOR.largura / 2 + PLANTA.raio, `${t.id} fora da estrada`);
      assert.ok(Math.abs(t.x - CORREDOR.x) - PLANTA.raio - SHIP_RADIUS > FAIXA_MINERADOR + 10, `${t.id} longe da faixa dos mineradores`);
      // Entre a base (fora da zona dela) e o minério, do lado do time.
      assert.ok(Math.sign(t.z - MINERIO.z) === Math.sign(b.z - MINERIO.z), `${t.id} na metade do time`);
      assert.ok(Math.abs(t.z - MINERIO.z) > MINERIO.raio + 100 && Math.abs(t.z - b.z) > b.raio, `${t.id} entre a base e o minério`);
      const g = TORRETAS.find((o) => o.time !== time && o.x === -t.x && o.z === -t.z);
      assert.ok(g, `${t.id} tem gêmea girada 180°`);
      assert.equal(g.id.slice(3), t.id.slice(3), 'mesmo número');
    }
  }
  assert.equal(TORRETA_LADO, CORREDOR.largura / 2 + 12);
});

test('torretas: são sólidas (planta única) e não bloqueiam a rota dos mineradores', () => {
  const plantas = OBSTACULOS.filter((o) => o.grupo === 'torreta');
  assert.equal(plantas.length, 8);
  for (const o of plantas) {
    assert.ok(alturaSolida(o.x, o.z) > heightAt(o.x, o.z) + HOVER + 3, `${o.id} mais alta que a altura de voo`);
    assert.ok(obstaculoAtivo(o.id));
  }
  for (const [time, rota] of ROTAS.entries()) {
    for (let i = 0; i + 1 < rota.length; i++) {
      for (let k = 0; k <= 10; k++) {
        for (const lado of [-1, 1]) {
          const x = rota[i].x + lado * FAIXA_MINERADOR + (rota[i + 1].x - rota[i].x) * (k / 10);
          const z = rota[i].z + (rota[i + 1].z - rota[i].z) * (k / 10);
          const livre = OBSTACULOS.filter((o) => o.grupo === 'torreta').every((o) => Math.hypot(o.x - x, o.z - z) > o.raio + SHIP_RADIUS + 10);
          assert.ok(livre, `rota do time ${time} passa longe das torretas em (${x}, ${z.toFixed(0)})`);
        }
      }
    }
  }
});

test('torretas: linha de tiro bate em construção e passa livre no aberto', () => {
  const t = TORRETAS[0];
  const y = heightAt(t.x, t.z) + HOVER;
  assert.equal(linhaDeTiro(t.x - 60, y, t.z, t.x + 60, y, t.z), false, 'a própria torreta no meio tampa');
  assert.equal(linhaDeTiro(t.x, y, t.z, t.x + 80, y, t.z, PLANTA.raio + 1.5), true, 'saindo da borda dela, livre');
});

test('torretas: atiram no inimigo no alcance e não no aliado', () => {
  const { w, a, b } = mundo();
  const t = torreta(w, 'T0-4'); // (62, 220)
  // Só o aliado perto: nenhuma torreta do time 0 atira.
  colocar(a, t.x - 40, t.z + 10);
  colocar(b, 0, -900);
  w.tirarEventos();
  for (let i = 0; i < 3 * SEGUNDO; i++) w.step();
  assert.equal(tirosDeTorreta(w.tirarEventos()).length, 0, 'aliado não leva tiro');
  assert.equal(a.ship.hp, a.ship.maxHp);

  // O inimigo chega a 40 m: leva tiro, e a torreta mira nele.
  colocar(b, t.x - 40, t.z - 10);
  const hp = b.ship.hp;
  let tiros = [];
  let mirou = false;
  for (let i = 0; i < 3 * SEGUNDO; i++) {
    w.step();
    tiros = tiros.concat(tirosDeTorreta(w.tirarEventos()));
    mirou ||= t.alvo === b.id;
  }
  assert.ok(tiros.length >= 3, `${tiros.length} tiros`);
  assert.ok(tiros.every((e) => e.time === 0 && typeof e.dono === 'string'), 'tiro das torretas do time 0');
  assert.ok(mirou, 'mira no inimigo');
  assert.ok(b.ship.hp < hp, 'o inimigo perdeu vida');
  assert.equal(a.ship.hp, a.ship.maxHp, 'o aliado no meio não');
  const snap = w.snapshotPara(a, [], []).torretas.find((x) => x.id === 'T0-4');
  assert.equal(snap.viva, true);

  // Fora do alcance, nada.
  colocar(b, t.x + TORRETA.alcance + 120, t.z); // para fora do corredor, longe das quatro
  for (let i = 0; i < SEGUNDO; i++) w.step();
  w.tirarEventos();
  for (let i = 0; i < 2 * SEGUNDO; i++) w.step();
  assert.equal(tirosDeTorreta(w.tirarEventos()).filter((e) => e.time === 0).length, 0, 'longe demais');
});

test('torretas: só tiro de jogador inimigo tira vida (aliado e monstro batem e somem)', () => {
  const { w, a, b } = mundo({ torretas: false });
  const t = torreta(w, 'T0-2'); // (62, 360)
  const tiroContra = (dono, drone = false) => {
    const s = createShip('bellico', t.x - 40, t.z, -Math.PI / 2); // olhando para +x
    const bala = createBullet(s, 'plasma', w.nextId++, dono?.id ?? 9999);
    Object.assign(bala, { drone, time: dono?.time, mult: 1 });
    w.bullets.push(bala);
    for (let i = 0; i < SEGUNDO && w.bullets.includes(bala); i++) w.step();
    return w.bullets.includes(bala);
  };
  const cheia = t.hp;
  assert.equal(tiroContra(a), false, 'o tiro do aliado acabou na torreta');
  assert.equal(t.hp, cheia, 'aliado não fere');
  assert.equal(tiroContra(null, true), false);
  assert.equal(t.hp, cheia, 'monstro não fere');
  tiroContra(b);
  assert.equal(t.hp, cheia - WEAPONS.plasma.dano, 'inimigo fere com o dano do tiro');
  const ev = w.tirarEventos().filter((e) => e.e === 'acerto' && e.torreta === 'T0-2');
  assert.deepEqual(
    ev.map((e) => e.dano),
    [0, 0, WEAPONS.plasma.dano],
  );
});

test('torretas: destruída sai da física, paga quem derrubou e um pouco ao time dele', () => {
  const { w, a, b } = mundo({ torretas: false });
  const c = w.addPlayer('C', 'bellico'); // time 0, colega de A
  assert.equal(c.time, a.time);
  const t = torreta(w, 'T1-3'); // (62, -220): do time 1, A derruba
  t.hp = 30;
  colocar(a, t.x, t.z + 60, 0); // olhando para -z, na direção dela
  colocar(c, 0, 900);
  colocar(b, 0, -900);
  const antes = { ouroA: a.ouro, ouroC: c.ouro, ouroB: b.ouro, xp: a.xp };
  let seq = 0;
  for (let i = 0; i < 3 * SEGUNDO && t.viva; i++) {
    w.pushInput(a.id, { s: ++seq, f1: true });
    w.step();
  }
  assert.equal(t.viva, false);
  assert.equal(obstaculoAtivo('T1-3'), false);
  assert.equal(alturaSolida(t.x, t.z), heightAt(t.x, t.z), 'o lugar ficou livre para nave e tiro');
  assert.equal(a.ouro - antes.ouroA, RECOMPENSA.torreta.ouro);
  assert.equal(a.nivel, 2, 'o XP da torreta passa do nível 1');
  assert.equal(a.xp, antes.xp + RECOMPENSA.torreta.xp - xpParaNivel(1));
  assert.equal(c.ouro - antes.ouroC, TORRETA.ouroTime, 'o colega ganha um pouco');
  assert.equal(b.ouro, antes.ouroB, 'o dono da torreta nada');
  const ev = w.tirarEventos().find((e) => e.e === 'torreta');
  assert.equal(ev.estado, 'destruida');
  assert.equal(ev.id, 'T1-3');
  assert.equal(ev.time, 1);
  assert.equal(ev.por, a.id);
  assert.equal(w.snapshotPara(b, [], []).torretas.find((x) => x.id === 'T1-3').viva, false);

  // Não renasce sozinha.
  for (let i = 0; i < 60 * SEGUNDO; i++) w.step();
  assert.equal(t.viva, false);
});

test('torretas: dano em área (onda de choque) do inimigo também fere, o do aliado não', () => {
  const { w, a, b } = mundo({ torretas: false });
  const t = torreta(w, 'T0-1'); // (-62, 360)
  colocar(b, t.x + 15, t.z, 0);
  b.ship.armas = [0, 5, 8]; // com a onda de choque
  const cheia = t.hp;
  w.pushInput(b.id, { s: 1, f1: true, a: 8 });
  w.step();
  assert.equal(cheia - t.hp, WEAPONS.choque.dano);
  // A do aliado não.
  colocar(a, t.x + 15, t.z, 0);
  a.ship.armas = [0, 5, 8];
  w.pushInput(a.id, { s: 1, f1: true, a: 8 });
  w.step();
  assert.equal(cheia - t.hp, WEAPONS.choque.dano);
});

test('torretas: a partida nova põe todas de pé, inteiras e no nível 1', () => {
  const w = new World({ drones: 0, monstros: 0, elites: 0, duracaoPartidaS: 2, intervaloFimS: 1 });
  const a = w.addPlayer('A', 'bellico');
  w.addPlayer('B', 'bellico');
  w.step();
  const t = torreta(w, 'T1-1');
  t.hp = 1;
  w.bullets.push(Object.assign(createBullet(createShip('bellico', t.x, t.z + 40, 0), 'laser', w.nextId++, a.id), { time: 0, mult: 1 }));
  for (let i = 0; i < SEGUNDO && t.viva; i++) w.step();
  assert.equal(t.viva, false);
  assert.equal(w.torretas.subirNivel(0), 2);
  torreta(w, 'T0-1').hp = 10;
  for (let i = 0; i < SEGUNDO * 10 && w.partida.numero < 2; i++) w.step();
  assert.equal(w.partida.numero, 2);
  for (const x of w.torretas.lista) {
    assert.equal(x.viva, true, x.id);
    assert.equal(x.hp, TORRETA.hp, x.id);
    assert.ok(obstaculoAtivo(x.id));
  }
  assert.deepEqual(w.torretas.nivel, [1, 1]);
});
