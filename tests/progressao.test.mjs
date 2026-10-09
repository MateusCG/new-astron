import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../server/game.js';
import { xpParaNivel, ganharXp, hpMaxDoNivel, RECOMPENSA, NIVEL_MAX, HP_POR_NIVEL } from '../server/progressao.js';
import { ZONA_SEGURA } from '../server/game.js';
import { createShip, RACES } from '../shared/sim.js';
import { BASE } from '../shared/terrain.js';

function rngFixo(semente = 1) {
  let s = semente;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

// Ponto do mundo aberto perto da base do time 0, fora da zona segura e longe dos
// outros monstros.
const FORA = { x: BASE.x + 250, z: BASE.z - ZONA_SEGURA - 120 };

/** O jogador gira para o alvo e atira laser até ele morrer (ou acabar o tempo). */
function abater(w, j, alvo, segundos = 15) {
  let seq = j.ack;
  for (let t = 0; t < 30 * segundos && alvo.vivo; t++) {
    const yawAlvo = Math.atan2(-(alvo.ship.x - j.ship.x), -(alvo.ship.z - j.ship.z));
    let d = yawAlvo - j.ship.yaw;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    w.pushInput(j.id, { s: ++seq, f1: true, tu: Math.max(-1, Math.min(1, d * 3)) });
    w.step();
  }
}

test('progressão: curva de XP sobe a cada nível e fecha no máximo', () => {
  assert.equal(xpParaNivel(1), 60);
  for (let n = 1; n < NIVEL_MAX - 1; n++) assert.ok(xpParaNivel(n + 1) > xpParaNivel(n), `nível ${n}`);
  assert.equal(xpParaNivel(NIVEL_MAX), 0, 'no máximo não há próximo');
  // Marcos da Evolução alcançáveis numa partida de 10 minutos.
  let total = 0;
  for (let n = 1; n < 15; n++) total += xpParaNivel(n);
  assert.ok(total < 3000, `nível 15 com ${total} XP`);
});

test('progressão: ganhar XP sobe de nível, avisa e dá +3% de HP máximo por nível', () => {
  const j = { id: 7, nivel: 1, xp: 0, ship: createShip('bellico', 0, 0, 0) };
  const ev = [];
  j.ship.hp = 200; // ferido: subir de nível não cura o resto
  assert.equal(ganharXp(j, 50, ev), 0);
  assert.equal(j.nivel, 1);
  assert.equal(ganharXp(j, xpParaNivel(1) - 50 + xpParaNivel(2) + 5, ev), 2, 'sobe dois de uma vez');
  assert.equal(j.nivel, 3);
  assert.equal(j.xp, 5, 'sobra fica no nível novo');
  assert.deepEqual(ev, [{ e: 'nivel', id: 7, nivel: 2 }, { e: 'nivel', id: 7, nivel: 3 }]);
  const max = Math.round(RACES.bellico.hp * (1 + 2 * HP_POR_NIVEL));
  assert.equal(j.ship.maxHp, max);
  assert.equal(j.ship.hp, 200 + (max - RACES.bellico.hp), 'HP sobe junto com o máximo');
  ganharXp(j, 1e6, ev);
  assert.equal(j.nivel, NIVEL_MAX);
  assert.equal(j.xp, 0);
  assert.equal(j.ship.maxHp, hpMaxDoNivel('bellico', NIVEL_MAX));
});

test('progressão: abater um Vorax dá XP e ouro, e o snapshot leva nível e XP', () => {
  const w = new World({ drones: 0, monstros: 1, rng: rngFixo(11) });
  const j = w.addPlayer('Caçador', 'acron');
  j.ship = createShip('acron', FORA.x, FORA.z, 0);
  j.protegidoAte = Infinity;
  const m = w.monstros[0];
  m.ship = createShip('mechan', FORA.x, FORA.z - 40, 0);
  abater(w, j, m);
  assert.equal(m.vivo, false);
  assert.equal(j.xp, RECOMPENSA.vorax.xp);
  assert.equal(j.ouro, RECOMPENSA.vorax.ouro);
  const snap = w.snapshotPara(j, w.entidades(), w.tirarEventos());
  assert.equal(snap.nivel, 1);
  assert.equal(snap.xp, RECOMPENSA.vorax.xp);
  assert.equal(snap.xpProx, xpParaNivel(1));
  assert.equal(snap.ents.find((e) => e.id === j.id).nivel, 1);
});

test('progressão: abates sobem o nível e a nave renasce com o HP do nível', () => {
  const w = new World({ drones: 0, monstros: 0 });
  const a = w.addPlayer('A', 'acron');
  const b = w.addPlayer('B', 'shrewdo');
  a.ship = createShip('acron', FORA.x, FORA.z, 0);
  b.ship = createShip('shrewdo', FORA.x, FORA.z - 30, 0);
  a.protegidoAte = b.protegidoAte = 0;
  abater(w, a, b, 30);
  assert.equal(b.vivo, false);
  assert.equal(a.nivel, 2, `${RECOMPENSA.jogador.xp} XP do abate passam do nível 1`);
  assert.equal(a.ship.maxHp, hpMaxDoNivel('acron', 2));
  assert.ok(w.tirarEventos().some((e) => e.e === 'nivel' && e.id === a.id && e.nivel === 2));
  // Morre e renasce: continua no nível 2, com o HP máximo dele.
  a.ship.hp = 0;
  a.vivo = false;
  a.respawnTick = w.tick + 1;
  w.step();
  w.step();
  assert.equal(a.vivo, true);
  assert.equal(a.ship.maxHp, hpMaxDoNivel('acron', 2));
  assert.equal(a.ship.hp, a.ship.maxHp);
});

test('progressão: ouro, XP e nível zeram quando começa a partida seguinte', () => {
  const w = new World({ drones: 0, monstros: 0, duracaoPartidaS: 1, intervaloFimS: 1 });
  const j = w.addPlayer('Veterano', 'bellico');
  w.step();
  ganharXp(j, xpParaNivel(1) + xpParaNivel(2) + 10, w.eventos);
  j.ouro = 300;
  assert.equal(j.nivel, 3);
  for (let i = 0; i < 30 * 1.5; i++) w.step();
  assert.equal(w.partida.estado, 'fim');
  assert.equal(j.nivel, 3, 'na tela de fim ainda vale');
  for (let i = 0; i < 30 * 5 && w.partida.estado !== 'andamento'; i++) w.step();
  assert.equal(w.partida.estado, 'andamento');
  assert.equal(w.partida.numero, 2);
  assert.equal(j.nivel, 1);
  assert.equal(j.xp, 0);
  assert.equal(j.ouro, 0);
  assert.equal(j.ship.maxHp, hpMaxDoNivel('bellico', 1), 'renasce com o HP do nível 1');
});
