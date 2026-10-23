// Campo de força das bases (CAMPOS_BASE em shared/terrain.js): nenhum tiro atravessa
// o plano, de nenhum lado (shared/sim.js, stepBullet, com o evento 'fim' trazendo o
// `campo`), a área dos golpes não passa de um lado para o outro e a mira não escolhe
// alvo do outro lado (server/armas.js, server/golpes.js), a nave do outro time que
// encosta nele é destruída na hora sem crédito para ninguém (server/game.js), as do
// time dono, os mineradores e as escoltas passam, e monstro nenhum entra.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../server/game.js';
import { createBullet, stepBullet, createShip, INPUT_VAZIO, DT, IDX_ARMA, CAMPO_RECUO } from '../shared/sim.js';
import { versaoArma } from '../shared/armas.js';
import { CAMPOS_BASE, BASES, dentroDoCampo, heightAt } from '../shared/terrain.js';

const SEGUNDO = 30;
const C = CAMPOS_BASE[0]; // o campo da base do time 0: x = -1125, lado de dentro em x < -1125
const PARA_DENTRO = Math.PI / 2; // yaw que olha para -x (para dentro da base do time 0)
const PARA_FORA = -Math.PI / 2;
/** Canto do bolsão da base do time 0, dentro do campo e fora da zona segura (onde se leva dano). */
const CANTO = { x: C.x - 15, z: 150 };
const FORA = { x: C.x + 85, z: 150 }; // do lado de fora, na frente do canto

function rngFixo(semente = 1) {
  let s = semente;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** Mundo sem monstros, mineradores, escoltas nem torretas, com um jogador em cada time (A no 0, B no 1). */
function mundo() {
  const w = new World({ preparacaoS: 0, jungle: false, torretas: false, ouroPorSegundo: 0, rng: rngFixo() });
  w.mineradores.passo = () => {};
  w.escoltas.passo = () => {};
  const a = w.addPlayer('A', 'acron', 'functional');
  const b = w.addPlayer('B', 'shrewdo', 'functional');
  w.step();
  return { w, a, b };
}

/** Põe a nave de `j` em (x, z) olhando para `yaw`, parada e sem proteção de nascimento. */
function colocar(j, x, z, yaw = 0) {
  j.ship = Object.assign(createShip(j.ship.race, x, z, yaw, j.classe), { time: j.time });
  j.protegidoAte = 0;
}

/** `n` passos com o comando `inp` para `j` (os outros parados). Devolve os eventos. */
function apertar(w, j, inp, n = 1) {
  const ev = [];
  j.seq ??= 1000;
  for (let i = 0; i < n; i++) {
    w.pushInput(j.id, { s: ++j.seq, ...INPUT_VAZIO, ...inp });
    w.step();
    ev.push(...w.tirarEventos());
  }
  return ev;
}

/** Avança `n` passos sem comando. Devolve os eventos. */
function passar(w, n) {
  const ev = [];
  for (let i = 0; i < n; i++) {
    w.step();
    ev.push(...w.tirarEventos());
  }
  return ev;
}

/** Voa o tiro até ele acabar; devolve quantos passos voou. */
function voarTiro(b) {
  let n = 0;
  while (stepBullet(b) && n < 600) n++;
  return n;
}

// ---------- Tiro (shared/sim.js) ----------

test('campo: o tiro reto para no plano, de fora para dentro e de dentro para fora', () => {
  for (const [x, yaw] of [
    [C.x + 120, PARA_DENTRO],
    [C.x - 60, PARA_FORA],
  ]) {
    const s = createShip('acron', x, 0, yaw);
    const b = createBullet(s, 'plasma', 1, 1);
    voarTiro(b);
    assert.equal(b.campo, 0, 'bateu no campo do time 0');
    const lado = Math.sign(x - C.x);
    const antes = (b.x - C.x) * lado; // m do plano, do lado de onde veio
    assert.ok(antes >= -1e-9 && antes <= CAMPO_RECUO + 1e-9, `parou no plano, do lado de onde veio (${b.x.toFixed(2)})`);
  }
});

test('campo: o tiro que nasce no nariz já do outro lado também para (conta da nave)', () => {
  const s = createShip('acron', C.x + 3, 0, PARA_DENTRO); // nariz 6 m à frente: 3 m dentro
  const b = createBullet(s, 'plasma', 1, 1);
  assert.ok(dentroDoCampo(0, b.x), 'nasceu do outro lado');
  assert.equal(stepBullet(b), false, 'acaba no primeiro passo');
  assert.equal(b.campo, 0);
  assert.ok(b.x > C.x, 'volta para o lado de quem atirou');
});

test('campo: tiro ao lado do campo (na rocha) e tiro longe dele não mudam', () => {
  // Rente à borda, além de |z| = 180: é rocha, o tiro morre nela e não conta como campo.
  const s = createShip('acron', C.x + 60, 200, PARA_DENTRO);
  const b = createBullet(s, 'plasma', 1, 1);
  voarTiro(b);
  assert.equal(b.campo, undefined, 'a rocha parou o tiro, não o campo');
  assert.ok(heightAt(b.x, b.z) > 0, 'acabou na rocha');
  // Longe das bases, o passo é o de sempre.
  const t = createBullet(createShip('acron', 0, 500, 0.3), 'plasma', 2, 1);
  const p = { x: t.x, z: t.z };
  for (let i = 1; i <= 20; i++) {
    assert.equal(stepBullet(t), true);
    assert.ok(Math.abs(t.x - (p.x + t.vx * DT * i)) < 1e-9 && Math.abs(t.z - (p.z + t.vz * DT * i)) < 1e-9);
  }
  assert.equal(t.campo, undefined);
});

// ---------- Tiro, área e mira no servidor ----------

test('campo: no servidor, tiro de fora não fere quem está dentro (nem o contrário) e o fim sai com o campo', () => {
  const { w, a, b } = mundo();
  colocar(a, CANTO.x, CANTO.z, PARA_FORA);
  colocar(b, FORA.x, FORA.z, PARA_DENTRO);
  const [ha, hb] = [a.ship.hp, b.ship.hp];
  for (const [quem, alvo] of [
    [b, a],
    [a, b],
  ]) {
    // Tiro reto de NPC direto do lado de fora (ou de dentro), apontado no outro.
    const bala = createBullet(quem.ship, 'plasma', 90000 + quem.id, quem.id);
    bala.time = quem.time;
    w.bullets.push(bala);
    const ev = passar(w, SEGUNDO);
    const fim = ev.find((e) => e.e === 'fim' && e.bala === bala.id);
    assert.ok(fim, 'o tiro acabou');
    assert.equal(fim.campo, 0, 'no campo do time 0');
    assert.ok(Math.abs(fim.x - C.x) <= CAMPO_RECUO + 1e-6, `no plano (${fim.x})`);
    assert.ok(!ev.some((e) => e.e === 'acerto' && e.alvo === alvo.id), 'não acertou');
  }
  assert.equal(a.ship.hp, ha);
  assert.equal(b.ship.hp, hb);
});

test('campo: a nova de fora não pega quem está dentro; a mira teleguiada não trava do outro lado', () => {
  const { w, a, b } = mundo();
  // Nova de Energia (Acron Functional, 70 m): B do lado de fora, colado no campo, A a 30 m dele, do lado de dentro.
  const nova = IDX_ARMA.o112002;
  assert.ok(versaoArma(nova, 1).golpe.nova.raio >= 70);
  const c = w.addPlayer('C', 'acron', 'functional'); // do time 0, do lado de fora: a nova pega
  colocar(b, C.x + 10, CANTO.z, PARA_DENTRO);
  b.ship.race = 'acron';
  colocar(a, C.x - 20, CANTO.z, PARA_FORA);
  colocar(c, C.x + 40, CANTO.z, 0);
  const [ha, hc] = [a.ship.hp, c.ship.hp];
  w.golpes.disparar(b, [{ kind: 'o112002', enc: 0, nivel: 1, k: 0, off: 0, ang: 0 }]);
  passar(w, 2 * SEGUNDO);
  assert.equal(a.ship.hp, ha, 'quem está dentro não levou');
  assert.ok(c.ship.hp < hc, 'quem está do mesmo lado levou');
  // Míssil Paralisante (mira "alvo à frente"): com o único inimigo do outro lado, não trava.
  colocar(a, C.x - 55, CANTO.z + 10, PARA_FORA);
  colocar(b, C.x + 90, CANTO.z, PARA_DENTRO);
  colocar(c, C.x + 300, -150, 0);
  const antes = a.ship.hp;
  w.bullets = [];
  w.golpes.disparar(b, [{ kind: 'o312010', enc: 0, nivel: 1, k: 0, off: 0, ang: 0 }]);
  const m = w.bullets.at(-1);
  assert.ok(m, 'o míssil saiu');
  assert.equal(m.alvo, undefined, 'não travou em quem está atrás do campo');
  passar(w, 3 * SEGUNDO);
  assert.equal(a.ship.hp, antes, 'e não acertou');
});

// ---------- Naves ----------

test('campo: nave do outro time que voa contra ele morre na hora, sem crédito para ninguém', () => {
  const { w, a, b } = mundo();
  colocar(a, BASES[0].x, 0, PARA_FORA);
  colocar(b, C.x + 60, 20, PARA_DENTRO);
  b.protegidoAte = w.tick + 10 * SEGUNDO; // nem a proteção de nascimento segura
  const [ouroA, ouroB] = [a.ouro, b.ouro];
  let morte = null;
  for (let i = 0; i < 6 * SEGUNDO && !morte; i++) {
    morte = apertar(w, b, { th: 1 }).find((e) => e.e === 'morte' && e.id === b.id) ?? null;
    // Até morrer, a nave nunca passou do plano.
    if (!morte) assert.ok(!dentroDoCampo(0, b.ship.x), `entrou (${b.ship.x.toFixed(1)})`);
  }
  assert.ok(morte, 'morreu');
  assert.equal(morte.motivo, 'campo');
  assert.equal(morte.campo, 0);
  assert.equal(morte.por, null);
  assert.equal(morte.tipo, 'jogador');
  assert.equal(morte.time, 1);
  assert.ok(morte.renasce > 0, 'renasce como em qualquer morte');
  assert.ok(Math.abs(morte.x - C.x) < 10, `no campo (${morte.x.toFixed(1)})`);
  assert.equal(b.vivo, false);
  assert.equal(b.mortes, 1);
  assert.deepEqual([a.ouro, b.ouro, a.abates, a.abatesJog], [ouroA, ouroB, 0, 0], 'ninguém ganhou nada');
  // Renasce normal, na base do time dele.
  passar(w, (morte.renasce + 1) * SEGUNDO);
  assert.equal(b.vivo, true);
  assert.ok(Math.hypot(b.ship.x - BASES[1].x, b.ship.z - BASES[1].z) < BASES[1].raio);
});

test('campo: encostar de lado (sem cruzar) também destrói; o teleporte por cima dele também', () => {
  const { w, b } = mundo();
  // Rente ao plano, a 4 m dele (menos que o raio da nave): no primeiro passo, morre.
  colocar(b, C.x + 4, 60, 0);
  let ev = passar(w, 1);
  assert.ok(ev.some((e) => e.e === 'morte' && e.id === b.id && e.motivo === 'campo'));
  // Teleporte (Acron Mobile): salta para a frente, por cima do campo, e morre.
  passar(w, 30 * SEGUNDO);
  assert.ok(b.vivo);
  const tele = IDX_ARMA.o112021;
  const dist = versaoArma(tele, 1).golpe.efeitos.find((e) => e.tipo === 'teleporte').dist;
  b.ship = Object.assign(createShip('acron', C.x + dist / 2, 0, PARA_DENTRO, 'mobile'), { time: 1 });
  b.ship.encaixes = [tele, b.ship.encaixes[1]];
  ev = apertar(w, b, { f1: true, a: tele }, 2);
  const morte = ev.find((e) => e.e === 'morte' && e.id === b.id);
  assert.ok(morte?.motivo === 'campo', 'o salto atravessou o campo');
  assert.ok(dentroDoCampo(0, morte.x), 'morreu onde caiu, do outro lado');
});

test('campo: nave do time dono atravessa nos dois sentidos', () => {
  const { w, a } = mundo();
  colocar(a, C.x + 80, 0, PARA_DENTRO);
  apertar(w, a, { th: 1 }, 5 * SEGUNDO);
  assert.ok(a.vivo && dentroDoCampo(0, a.ship.x), `entrou (${a.ship.x.toFixed(1)})`);
  colocar(a, C.x - 40, 0, PARA_FORA);
  apertar(w, a, { th: 1 }, 4 * SEGUNDO);
  assert.ok(a.vivo && !dentroDoCampo(0, a.ship.x), `saiu (${a.ship.x.toFixed(1)})`);
});

test('campo: mineradores e escoltas do time saem da base atravessando o campo', () => {
  const w = new World({ preparacaoS: 0, jungle: false, rng: rngFixo() });
  w.addPlayer('A', 'acron');
  w.addPlayer('B', 'bellico');
  const cruzou = new Map();
  let morte = null;
  for (let i = 0; i < 40 * SEGUNDO; i++) {
    w.step();
    morte ??= w.tirarEventos().find((e) => e.e === 'morte') ?? null;
    for (const m of [...w.mineradores.lista, ...w.escoltas.lista]) {
      if (!dentroDoCampo(m.time, m.ship.x)) cruzou.set(m.id, m.tipo);
    }
  }
  assert.equal(morte, null, 'ninguém morreu');
  const tipos = [...cruzou.values()];
  assert.ok(tipos.filter((t) => t === 'minerador').length >= 6, 'os mineradores dos dois times saíram');
  assert.ok(tipos.filter((t) => t === 'escolta').length >= 4, 'as escoltas dos dois times saíram');
});

test('campo: monstro não entra no bolsão nem caça quem está lá dentro', () => {
  const { w, a } = mundo();
  colocar(a, CANTO.x, CANTO.z, PARA_FORA);
  const m = w.jungle.criarMonstro('armish', C.x + 90, CANTO.z, { territorio: 600 });
  w.jungle.provocar(m, a.id);
  const hp = a.ship.hp;
  for (let i = 0; i < 15 * SEGUNDO; i++) {
    w.step();
    assert.ok(!dentroDoCampo(0, m.ship.x), `o monstro entrou (${m.ship.x.toFixed(1)})`);
  }
  assert.equal(a.ship.hp, hp, 'não feriu quem está no bolsão');
});
