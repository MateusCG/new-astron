import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../server/game.js';
import { xpParaNivel, ganharXp, hpMaxDoNivel, RECOMPENSA, NIVEL_MAX, HP_POR_NIVEL, XP_OBJETIVO, OURO_POR_SEGUNDO } from '../server/progressao.js';
import { ESPECIES } from '../server/especies.js';
import { ZONA_SEGURA } from '../server/game.js';
import { createShip } from '../shared/sim.js';
import { naveDe } from '../shared/naves.js';
import { BASE } from '../shared/terrain.js';

function rngFixo(semente = 1) {
  let s = semente;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

// Ponto do mundo aberto perto da base do time 0, fora da zona segura.
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
  assert.equal(NIVEL_MAX, 25, 'nível máximo do piloto (pedido do Mateus)');
  assert.equal(xpParaNivel(1), 60);
  assert.equal(xpParaNivel(24), 60 + 20 * 23);
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
  const max = Math.round(naveDe('bellico', 'assault', 0).hp * (1 + 2 * HP_POR_NIVEL));
  assert.equal(j.ship.maxHp, max);
  assert.equal(j.ship.hp, 200 + (max - naveDe('bellico', 'assault', 0).hp), 'HP sobe junto com o máximo');
  ganharXp(j, 1e6, ev);
  assert.equal(j.nivel, NIVEL_MAX);
  assert.equal(j.xp, 0);
  assert.equal(j.ship.maxHp, hpMaxDoNivel(naveDe('bellico', 'assault', 0).hp, NIVEL_MAX));
});

test('progressão: abater um Armish dá XP e ouro, e o snapshot leva nível e XP', () => {
  const w = new World({ jungle: false, rng: rngFixo(11), ouroPorSegundo: 0 }); // só o ouro do abate
  const j = w.addPlayer('Caçador', 'acron');
  j.ship = createShip('acron', FORA.x, FORA.z, 0);
  j.protegidoAte = Infinity;
  const m = w.jungle.criarMonstro('armish', FORA.x, FORA.z - 40);
  abater(w, j, m);
  assert.equal(m.vivo, false);
  assert.equal(j.xp, RECOMPENSA.armish.xp);
  assert.equal(j.ouro, RECOMPENSA.armish.ouro);
  const snap = w.snapshotPara(j, w.entidades(), w.tirarEventos());
  assert.equal(snap.nivel, 1);
  assert.equal(snap.xp, RECOMPENSA.armish.xp);
  assert.equal(snap.xpProx, xpParaNivel(1));
  assert.equal(snap.ents.find((e) => e.id === j.id).nivel, 1);
});

test('progressão: abates sobem o nível e a nave renasce com o HP do nível', () => {
  const w = new World({ jungle: false, torretas: false });
  const a = w.addPlayer('A', 'acron');
  const b = w.addPlayer('B', 'shrewdo');
  a.ship = createShip('acron', FORA.x, FORA.z, 0);
  b.ship = createShip('shrewdo', FORA.x, FORA.z - 30, 0);
  a.protegidoAte = b.protegidoAte = 0;
  abater(w, a, b, 30);
  assert.equal(b.vivo, false);
  assert.equal(a.nivel, 2, `${RECOMPENSA.jogador.xp} XP do abate passam do nível 1`);
  assert.equal(a.ship.maxHp, hpMaxDoNivel(naveDe('acron', 'assault', 0).hp, 2));
  assert.ok(w.tirarEventos().some((e) => e.e === 'nivel' && e.id === a.id && e.nivel === 2));
  // Morre e renasce: continua no nível 2, com o HP máximo dele.
  a.ship.hp = 0;
  a.vivo = false;
  a.respawnTick = w.tick + 1;
  w.step();
  w.step();
  assert.equal(a.vivo, true);
  assert.equal(a.ship.maxHp, hpMaxDoNivel(naveDe('acron', 'assault', 0).hp, 2));
  assert.equal(a.ship.hp, a.ship.maxHp);
});

test('progressão: ouro, XP e nível zeram quando começa a partida seguinte', () => {
  const w = new World({ jungle: false, duracaoPartidaS: 1, intervaloFimS: 1 });
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
  assert.equal(j.ship.maxHp, hpMaxDoNivel(naveDe('bellico', 'assault', 0).hp, 1), 'renasce com o HP do nível 1');
});

test('monstros: cada espécie tem o XP e o ouro dela, e quem é mais forte paga mais', () => {
  for (const [esp, e] of Object.entries(ESPECIES)) {
    if (e.doTime) assert.equal(RECOMPENSA[esp], undefined, `${esp} paga o time inteiro (server/jungle.js)`);
    else assert.deepEqual(RECOMPENSA[esp], { xp: e.xp, ouro: e.ouro }, esp);
  }
  for (const k of ['arnosh', 'vorax', 'krakor', 'guardiao']) assert.equal(RECOMPENSA[k], undefined, `${k} saiu`);
  // Mesma força por papel: os pares pagam igual.
  assert.deepEqual(RECOMPENSA.armish, RECOMPENSA.chrometic);
  assert.deepEqual(RECOMPENSA.xerxes, RECOMPENSA.bazit);
  assert.deepEqual(RECOMPENSA.great_xerxes, RECOMPENSA.anti);
  assert.ok(RECOMPENSA.armish.xp < RECOMPENSA.xerxes.xp && RECOMPENSA.xerxes.xp < RECOMPENSA.great_xerxes.xp);
  assert.ok(RECOMPENSA.great_xerxes.xp < RECOMPENSA.sn4.xp && RECOMPENSA.sn4.xp < ESPECIES.medusa.xp);
  assert.ok(ESPECIES.armish.hp < ESPECIES.great_xerxes.hp && ESPECIES.great_xerxes.hp < ESPECIES.sn4.hp && ESPECIES.sn4.hp < ESPECIES.medusa.hp);
  assert.ok(XP_OBJETIVO > 0);
});

test('monstros: o evento de morte de um monstro traz a espécie e o ouro de quem matou', () => {
  const w = new World({ jungle: false, rng: rngFixo(5) });
  const j = w.addPlayer('Caçador', 'bellico');
  j.ship = createShip('bellico', FORA.x, FORA.z, 0);
  j.protegidoAte = Infinity;
  const m = w.jungle.criarMonstro('xerxes', FORA.x, FORA.z - 60);
  const eventos = [];
  let seq = j.ack;
  for (let t = 0; t < 30 * 20 && m.vivo; t++) {
    const yaw = Math.atan2(-(m.ship.x - j.ship.x), -(m.ship.z - j.ship.z));
    let d = yaw - j.ship.yaw;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    w.pushInput(j.id, { s: ++seq, f1: true, tu: Math.max(-1, Math.min(1, d * 3)) });
    w.step();
    eventos.push(...w.tirarEventos());
  }
  assert.equal(m.vivo, false);
  const morte = eventos.find((e) => e.e === 'morte' && e.id === m.id);
  assert.equal(morte.tipo, 'monstro');
  assert.equal(morte.esp, 'xerxes');
  assert.equal(morte.ouro, RECOMPENSA.xerxes.ouro);
});

/** Mundo sem nada que dê ouro além do passivo (sem jungle, mineradores, escoltas, torretas nem cérebro de computador). */
function mundoParado(opcoes = {}) {
  const w = new World({ jungle: false, torretas: false, ...opcoes });
  w.mineradores.passo = () => {};
  w.escoltas.passo = () => {};
  w.bots.passo = () => {};
  return w;
}

test('ouro passivo: +OURO_POR_SEGUNDO a cada segundo inteiro de partida, para gente, computador e morto', () => {
  assert.equal(OURO_POR_SEGUNDO, 1);
  const w = mundoParado();
  const a = w.addPlayer('A', 'acron');
  const bot = w.adicionarBot(1);
  assert.ok(bot.ia, 'é um computador');
  w.step(); // a partida começa neste tick
  assert.equal(w.partida.estado, 'andamento');
  const [oa, ob] = [a.ouro, bot.ouro];
  a.vivo = false; // morto também ganha
  a.respawnTick = Infinity;
  for (let i = 0; i < 29; i++) w.step();
  assert.equal(a.ouro, oa, 'antes de fechar o segundo, nada');
  w.step();
  assert.equal(a.ouro, oa + OURO_POR_SEGUNDO);
  assert.equal(bot.ouro, ob + OURO_POR_SEGUNDO);
  for (let i = 0; i < 10 * 30; i++) w.step();
  assert.equal(a.ouro, oa + 11 * OURO_POR_SEGUNDO, 'conta inteira, sem fração perdida no passo de 1/30 s');
  assert.equal(bot.ouro, ob + 11 * OURO_POR_SEGUNDO);
  assert.ok(Number.isInteger(a.ouro));
});

test('ouro passivo: só com a partida em andamento (nada na tela de fim) e a partida inteira paga cada segundo', () => {
  const w = mundoParado({ duracaoPartidaS: 3, intervaloFimS: 4 });
  const a = w.addPlayer('A', 'acron');
  for (let i = 0; i < 3 * 30 + 1; i++) w.step();
  assert.equal(w.partida.estado, 'fim');
  assert.equal(a.ouro, 3 * OURO_POR_SEGUNDO, 'os 3 segundos da partida, o último inclusive');
  for (let i = 0; i < 3 * 30; i++) w.step();
  assert.equal(w.partida.estado, 'fim');
  assert.equal(a.ouro, 3 * OURO_POR_SEGUNDO, 'na tela de fim não conta');
  for (let i = 0; i < 2 * 30; i++) w.step();
  assert.equal(w.partida.estado, 'andamento', 'começou outra');
  assert.ok(a.ouro < 3 * OURO_POR_SEGUNDO, 'a partida nova zerou o ouro e recomeçou a contar');
});

test('ouro passivo: o modo de teste também conta', () => {
  const w = mundoParado({ teste: true });
  const a = w.addPlayer('A', 'acron');
  for (let i = 0; i < 5 * 30 + 1; i++) w.step();
  assert.equal(a.ouro, 5 * OURO_POR_SEGUNDO);
});

/** O jogador mira e atira no monstro até ele morrer; devolve os eventos do caminho. */
function abaterColetando(w, j, m, segundos = 15) {
  const eventos = [];
  let seq = j.ack;
  for (let t = 0; t < 30 * segundos && m.vivo; t++) {
    const yaw = Math.atan2(-(m.ship.x - j.ship.x), -(m.ship.z - j.ship.z));
    let d = yaw - j.ship.yaw;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    w.pushInput(j.id, { s: ++seq, f1: true, tu: Math.max(-1, Math.min(1, d * 3)) });
    w.step();
    eventos.push(...w.tirarEventos());
  }
  return eventos;
}

test('monstros: o ouro e o XP do abate vão só para quem matou, no lugar da morte (evento ganho)', () => {
  const w = new World({ jungle: false, torretas: false, rng: rngFixo(11) });
  const j = w.addPlayer('Caçador', 'acron');
  const outro = w.addPlayer('Outro', 'shrewdo');
  const aliado = w.addPlayer('Aliado', 'bellico');
  assert.equal(aliado.time, j.time, 'o terceiro cai no time do primeiro');
  assert.notEqual(outro.time, j.time);
  j.ship = createShip('acron', FORA.x, FORA.z, 0);
  j.protegidoAte = Infinity;
  for (const o of [aliado, outro]) {
    o.ship = createShip(o.ship.race, FORA.x + 20, FORA.z + 10, 0); // perto: veem a morte
    o.protegidoAte = Infinity;
  }
  const m = w.jungle.criarMonstro('armish', FORA.x, FORA.z - 40);
  const eventos = abaterColetando(w, j, m);
  assert.equal(m.vivo, false);
  const morte = eventos.find((e) => e.e === 'morte' && e.id === m.id);
  const ganhos = w.snapshotPara(j, [], eventos).ev.filter((e) => e.e === 'ganho');
  assert.equal(ganhos.length, 1);
  assert.equal(ganhos[0].para, j.id);
  assert.equal(ganhos[0].id, m.id);
  assert.equal(ganhos[0].esp, 'armish');
  assert.equal(ganhos[0].ouro, RECOMPENSA.armish.ouro);
  assert.equal(ganhos[0].xp, RECOMPENSA.armish.xp);
  assert.ok(Math.hypot(ganhos[0].x - morte.x, ganhos[0].z - morte.z) < 0.01, 'no lugar da morte');
  for (const o of [aliado, outro]) {
    const ev = w.snapshotPara(o, [], eventos).ev;
    assert.ok(ev.some((e) => e.e === 'morte' && e.id === m.id), `${o.nome} vê a morte`);
    assert.ok(!ev.some((e) => e.e === 'ganho'), `${o.nome} não recebe o ganho de outro`);
  }
});

test('monstros: no nível máximo o ganho traz só o ouro (XP 0)', () => {
  const w = new World({ jungle: false, torretas: false, rng: rngFixo(11) });
  const j = w.addPlayer('Veterano', 'acron');
  j.ship = createShip('acron', FORA.x, FORA.z, 0);
  j.protegidoAte = Infinity;
  ganharXp(j, 1e6, w.eventos);
  const m = w.jungle.criarMonstro('armish', FORA.x, FORA.z - 40);
  const ganho = w.snapshotPara(j, [], abaterColetando(w, j, m)).ev.find((e) => e.e === 'ganho');
  assert.equal(ganho.ouro, RECOMPENSA.armish.ouro);
  assert.equal(ganho.xp, 0);
});

test('monstros: golpe crítico vai a quem bateu com `por` e o ganho do golpe final leva crit', () => {
  const w = new World({ jungle: false, torretas: false, rng: () => 0 });
  const j = w.addPlayer('Caçador', 'acron');
  j.ship = createShip('acron', FORA.x, FORA.z, 0);
  j.protegidoAte = Infinity;
  j.status = { ...j.status, critico: 1 }; // todo golpe direto é crítico
  const m = w.jungle.criarMonstro('armish', FORA.x, FORA.z - 40);
  const ev = w.snapshotPara(j, [], abaterColetando(w, j, m)).ev;
  assert.equal(m.vivo, false);
  const crits = ev.filter((e) => e.e === 'acerto' && e.alvo === m.id && e.crit);
  assert.ok(crits.length > 0, 'acertos críticos no monstro');
  assert.ok(crits.every((e) => e.por === j.id));
  assert.equal(ev.find((e) => e.e === 'ganho').crit, true);
});
