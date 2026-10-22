// Jungle do Stage 6 (server/jungle.js): quem nasce em cada acampamento (e a simetria
// entre os times), os tempos de aparecer e de voltar, o SN-4 do buff de ataque, a
// Ancient Medusa e a sonda errante, e o estado `obj` de BA0, BA1, SONDA e MEDUSA.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../server/game.js';
import { createShip, DT } from '../shared/sim.js';
import { ACAMPAMENTOS, BUFFS, MEDUSA, trajetoSonda } from '../shared/terrain.js';
import { pontoLivre } from '../shared/obstaculos.js';
import { TEMPOS_JUNGLE, COMPOSICAO, idNoTime0, BONUS_ATAQUE_S, BONUS_SONDA_S, BONUS_MEDUSA_S } from '../server/jungle.js';
import { ESPECIES } from '../server/especies.js';
import { RECOMPENSA, xpParaNivel } from '../server/progressao.js';

function rngFixo(semente = 1) {
  let s = semente;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

const JA = { primeiroS: 0 };
/** Mundo com a partida andando (um jogador de cada time) e os tempos da jungle trocados. */
function mundo(tempos = {}) {
  const w = new World({ preparacaoS: 0, rng: rngFixo(3), torretas: false, temposJungle: tempos, ouroPorSegundo: 0 }); // conta o ouro exato dos abates
  const a = w.addPlayer('A', 'bellico');
  const b = w.addPlayer('B', 'acron');
  for (const j of [a, b]) j.protegidoAte = 0;
  w.step();
  return { w, a, b };
}
/** XP ganho na partida (os níveis passados mais o XP dentro do nível). */
const xpTotal = (j) => Array.from({ length: j.nivel - 1 }, (_, i) => xpParaNivel(i + 1)).reduce((x, y) => x + y, 0) + j.xp;
const passos = (w, s) => {
  for (let i = 0; i < Math.round(s / DT); i++) w.step();
};
/** Golpe final de `j` no monstro `m` (pelo dano do World, com morte e recompensa). */
const matar = (w, m, j) => w.jungle.ctx.ferir(m, 1e9, j.id, null, {});

test('jungle: os tempos são os do contrato', () => {
  assert.deepEqual(TEMPOS_JUNGLE, {
    acampamento: { primeiroS: 45, voltaS: 90 },
    ataque: { primeiroS: 90, voltaS: 240 },
    sonda: { primeiroS: 180, voltaS: 120 },
    medusa: { primeiroS: 300, voltaS: 300 },
  });
  assert.equal(BONUS_ATAQUE_S, 90);
  assert.equal(BONUS_SONDA_S, 40);
  assert.equal(BONUS_MEDUSA_S, 120);
  const { w, a } = mundo();
  const obj = w.snapshotPara(a, [], []).obj;
  assert.deepEqual(obj.BA0, { time: null, estado: 'espera', volta: 90 });
  assert.deepEqual(obj.BA1, { time: null, estado: 'espera', volta: 90 });
  assert.deepEqual(obj.SONDA, { time: null, estado: 'espera', volta: 180 });
  assert.deepEqual(obj.MEDUSA, { time: null, estado: 'espera', volta: 300 });
  assert.equal(w.monstros.length, 0, 'nada no mapa no começo');
});

test('jungle: composição dos acampamentos pela decisão do Mateus, com o time 1 girado 180°', () => {
  assert.deepEqual(COMPOSICAO, {
    JB0N: ['armish', 'armish', 'armish', 'armish'],
    JB0S: ['chrometic', 'chrometic', 'chrometic', 'chrometic'],
    JC0N: ['great_xerxes', 'xerxes', 'xerxes'],
    JC0S: ['anti', 'bazit', 'bazit'],
  });
  const { w } = mundo({ acampamento: JA });
  w.step();
  for (const a of ACAMPAMENTOS) {
    const c = w.jungle.covil(a.id);
    assert.deepEqual(c.membros.map((m) => m.esp), COMPOSICAO[idNoTime0(a)], a.id);
    for (const m of c.membros) {
      assert.ok(Math.hypot(m.casa.x - a.x, m.casa.z - a.z) <= a.raio, `${a.id}: dentro do acampamento`);
      assert.ok(pontoLivre(m.casa.x, m.casa.z, 10), `${a.id}: chão livre`);
    }
  }
  // JB0N ↔ JB1S, JB0S ↔ JB1N, JC0N ↔ JC1S, JC0S ↔ JC1N: mesmas espécies, nos pontos girados.
  for (const [z0, z1] of [['JB0N', 'JB1S'], ['JB0S', 'JB1N'], ['JC0N', 'JC1S'], ['JC0S', 'JC1N']]) {
    const m0 = w.jungle.covil(z0).membros;
    const m1 = w.jungle.covil(z1).membros;
    assert.deepEqual(m0.map((m) => m.esp), m1.map((m) => m.esp), `${z0} e ${z1}`);
    m0.forEach((m, i) => {
      assert.ok(Math.abs(m.casa.x + m1[i].casa.x) < 1e-9 && Math.abs(m.casa.z + m1[i].casa.z) < 1e-9, 'girado 180°');
    });
  }
  // Mesma força por papel.
  for (const [x, y] of [['armish', 'chrometic'], ['xerxes', 'bazit'], ['great_xerxes', 'anti']]) {
    for (const k of ['hp', 'velocidade', 'raio', 'xp', 'ouro']) assert.equal(ESPECIES[x][k], ESPECIES[y][k], `${x} × ${y}: ${k}`);
  }
});

test('jungle: acampamento aparece aos 0:45 e só volta 1:30 depois de morrer INTEIRO', () => {
  const { w, a } = mundo({ acampamento: { primeiroS: 2, voltaS: 3 } });
  passos(w, 1.5);
  assert.equal(w.jungle.covil('JB0N').estado, 'espera');
  passos(w, 1);
  const c = w.jungle.covil('JB0N');
  assert.equal(c.estado, 'ativo');
  const [m1, m2, m3, m4] = c.membros;
  for (const m of [m1, m2, m3]) matar(w, m, a);
  passos(w, 5);
  assert.equal(c.estado, 'ativo', 'com um vivo, ninguém volta');
  assert.deepEqual(c.membros, [m1, m2, m3, m4], 'os mesmos');
  matar(w, m4, a);
  assert.equal(c.estado, 'recarga');
  passos(w, 2.5);
  assert.equal(c.estado, 'recarga');
  passos(w, 1);
  assert.equal(c.estado, 'ativo', 'voltou o acampamento inteiro');
  assert.ok(c.membros.every((m) => m.vivo && m.ship.hp === m.ship.maxHp));
  assert.ok(!w.monstros.includes(m1), 'os mortos saíram da lista');
  assert.equal(a.ouro, 4 * RECOMPENSA.armish.ouro);
});

test('jungle: SN-4 do buff de ataque dá o bônus de nave "ataque" a quem deu o golpe final', () => {
  const { w, a } = mundo({ ataque: { primeiroS: 1, voltaS: 4 } });
  passos(w, 1.1);
  const ev0 = w.tirarEventos();
  assert.ok(ev0.some((e) => e.e === 'objetivo' && e.id === 'BA0' && e.acao === 'apareceu'));
  for (const b of BUFFS.filter((x) => x.tipo === 'ataque')) {
    const [sn] = w.jungle.covil(b.id).membros;
    assert.equal(sn.esp, 'sn4');
    assert.deepEqual([sn.casa.x, sn.casa.z], [b.x, b.z]);
  }
  const sn = w.jungle.covil('BA1').membros[0];
  assert.equal(w.snapshotPara(a, [], []).obj.BA1.vida, 1);
  matar(w, sn, a);
  assert.ok(w.bonus.ativoNave(a.id, 'ataque', w.tick));
  assert.equal(Math.round(w.bonus.restanteNave(a.id, 'ataque', w.tick)), BONUS_ATAQUE_S);
  assert.equal(xpTotal(a), RECOMPENSA.sn4.xp);
  assert.equal(a.ouro, RECOMPENSA.sn4.ouro);
  const ev = w.tirarEventos();
  assert.ok(ev.some((e) => e.e === 'objetivo' && e.id === 'BA1' && e.acao === 'tomado' && e.time === a.time && e.quem === 'A'));
  assert.ok(ev.some((e) => e.e === 'bonusNave' && e.id === a.id && e.nome === 'ataque'));
  w.step(); // o obj do snapshot é guardado por tick
  assert.deepEqual(w.snapshotPara(a, [], []).obj.BA1, { estado: 'recarga', volta: 4, time: a.time });
  passos(w, 4.1);
  assert.equal(w.snapshotPara(a, [], []).obj.BA1.estado, 'ativo');
});

test('jungle: a Medusa paga ouro e XP a cada piloto do time de quem a matou e liga o bônus "medusa"', () => {
  const { w, a, b } = mundo({ medusa: { primeiroS: 1, voltaS: 5 } });
  const colega = w.addPlayer('C', 'shrewdo');
  assert.equal(colega.time, a.time);
  passos(w, 1.1);
  const c = w.jungle.covil('MEDUSA');
  const [med] = c.membros;
  assert.equal(med.esp, 'medusa');
  assert.deepEqual([med.casa.x, med.casa.z], [MEDUSA.x, MEDUSA.z]);
  // Não se teleporta: provocada de longe, continua no poço.
  w.jungle.provocar(med, a.id);
  a.ship = createShip('bellico', MEDUSA.x, MEDUSA.z - 150, 0);
  passos(w, 5);
  assert.ok(Math.hypot(med.ship.x - MEDUSA.x, med.ship.z - MEDUSA.z) < MEDUSA.raio, 'ficou no poço');
  matar(w, med, a);
  for (const j of [a, colega]) {
    assert.equal(j.ouro, ESPECIES.medusa.ouro, `${j.nome}: ouro`);
    assert.equal(xpTotal(j), ESPECIES.medusa.xp, `${j.nome}: XP (quem matou não ganha em dobro)`);
  }
  assert.equal(b.ouro, 0, 'o outro time nada');
  assert.ok(w.bonus.ativo(a.time, 'medusa', w.tick));
  assert.equal(w.bonus.ativo(b.time, 'medusa', w.tick), false);
  assert.equal(Math.round(w.bonus.restante(a.time, 'medusa', w.tick)), BONUS_MEDUSA_S);
  assert.deepEqual(w.snapshotPara(a, [], []).obj.MEDUSA, { estado: 'recarga', volta: 5, time: a.time });
});

test('jungle: a sonda não aparece com a Medusa ou o Núcleo vivos, anda pelo trajeto e alterna a ponta', () => {
  const { w, a } = mundo({ medusa: JA, sonda: { primeiroS: 0.5, voltaS: 1 } });
  passos(w, 1);
  assert.equal(w.jungle.covil('SONDA').estado, 'espera');
  assert.equal(w.snapshotPara(a, [], []).obj.SONDA.bloqueada, true);
  matar(w, w.jungle.covil('MEDUSA').membros[0], a);
  // Núcleo vivo (gancho da frente Objetivos) também segura.
  w.objetivos.nucleoVivo = () => true;
  passos(w, 0.5);
  assert.equal(w.jungle.covil('SONDA').estado, 'espera');
  w.objetivos.nucleoVivo = () => false;
  w.step();
  const c = w.jungle.covil('SONDA');
  assert.equal(c.estado, 'ativo');
  const [s1] = c.membros;
  const ida = trajetoSonda(0);
  assert.deepEqual([s1.ship.x, s1.ship.z], [ida[0].x, ida[0].z], 'nasce na ponta de cima');
  // Pausa na ponta, depois anda pelo trajeto até a outra ponta.
  passos(w, 3);
  assert.deepEqual([s1.ship.x, s1.ship.z], [ida[0].x, ida[0].z], 'parada na ponta');
  passos(w, 60);
  assert.ok(s1.pos > 0, 'andou');
  for (let i = 0; i < 30 * 5; i++) {
    w.step();
    assert.ok(Math.abs(s1.ship.x) <= 131 && Math.abs(s1.ship.z) <= 338, 'no trajeto');
  }
  matar(w, s1, a);
  assert.ok(w.bonus.ativoNave(a.id, 'sonda', w.tick));
  assert.equal(Math.round(w.bonus.restanteNave(a.id, 'sonda', w.tick)), BONUS_SONDA_S);
  assert.equal(xpTotal(a), ESPECIES.medusa.xp + RECOMPENSA.sonda.xp);
  assert.equal(a.ouro, ESPECIES.medusa.ouro + RECOMPENSA.sonda.ouro, 'a Medusa e a sonda');
  passos(w, 1.1);
  const [s2] = c.membros;
  const volta = trajetoSonda(1);
  assert.notEqual(s2, s1);
  assert.deepEqual([s2.ship.x, s2.ship.z], [volta[0].x, volta[0].z], 'a próxima nasce na outra ponta');
});

test('jungle: a sonda foge de quem a ataca, pelo trajeto, para longe dele', () => {
  const { w, a } = mundo({ sonda: JA });
  w.step();
  const [s] = w.jungle.covil('SONDA').membros;
  // Leva a sonda para o meio do trajeto (do lado de x = +130).
  s.pos = s.comprimento / 2;
  w.step();
  // O jogador chega por baixo (z +) e atira: ela tem que subir (z −).
  a.ship = createShip('bellico', s.ship.x, s.ship.z + 120, 0);
  w.jungle.provocar(s, a.id);
  const z0 = s.ship.z;
  passos(w, 2);
  assert.ok(s.ship.z < z0 - 40, `fugiu para cima (${z0.toFixed(0)} → ${s.ship.z.toFixed(0)})`);
  assert.ok(Math.hypot(s.ship.x - a.ship.x, s.ship.z - a.ship.z) > 120, 'mais longe dele');
  // Do outro lado: foge para baixo.
  s.pos = s.comprimento / 2;
  s.atacadoTick = -Infinity;
  w.step();
  a.ship = createShip('bellico', s.ship.x, s.ship.z - 120, 0);
  w.jungle.provocar(s, a.id);
  const z1 = s.ship.z;
  passos(w, 2);
  assert.ok(s.ship.z > z1 + 40, 'fugiu para baixo');
});

test('jungle: partida nova tira os monstros e recomeça o relógio; servidor vazio para tudo', () => {
  const w = new World({ preparacaoS: 0, rng: rngFixo(5), duracaoPartidaS: 3, intervaloFimS: 1, temposJungle: { acampamento: { primeiroS: 1 } } });
  const a = w.addPlayer('A', 'acron');
  passos(w, 1.2);
  assert.ok(w.monstros.length > 0);
  passos(w, 2.9); // fim da partida (3 s) e tela de resultado (1 s)
  assert.equal(w.partida.estado, 'andamento');
  assert.equal(w.partida.numero, 2);
  assert.equal(w.monstros.length, 0, 'partida nova começa sem monstro');
  assert.equal(w.jungle.covil('JB0N').estado, 'espera');
  passos(w, 1.1);
  assert.ok(w.monstros.length > 0, 'e eles voltam no tempo de sempre');
  w.removePlayer(a.id);
  w.step();
  assert.equal(w.monstros.length, 0);
  passos(w, 3);
  assert.equal(w.monstros.length, 0, 'sem ninguém, nada nasce');
});
