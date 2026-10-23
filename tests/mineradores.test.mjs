// Mineradores (server/mineradores.js): ciclo base → doca → bacia da base em linha
// reta, a descarga na bacia (três vagas, fila na espera), tempos, onda do Núcleo,
// destruição pelo outro time.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../server/game.js';
import { MINERADOR, MINERADOR_NUCLEO, FILA_ESPACO } from '../server/mineradores.js';
import { MINERADORES_POR_TIME } from '../shared/evolucao.js';
import { createShip, createBullet, WEAPONS } from '../shared/sim.js';
import { BASES, DOCAS, ROTAS, MINERADORA, BAIAS, ESPERAS, BACIAS, VAGAS_BACIA, ESPERAS_BACIA, heightAt } from '../shared/terrain.js';
import { alturaSolida } from '../shared/obstaculos.js';

const SEGUNDO = 30; // ticks

// rng com semente: os testes não dependem da sorte do Math.random.
function rngFixo(semente = 1) {
  let s = semente;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** Mundo com um jogador em cada time (a partida começa no primeiro passo). */
function mundo() {
  const w = new World({ preparacaoS: 0, jungle: false, rng: rngFixo() });
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

test('mineradores: fazem o ciclo base → doca → bacia e somam 10 no placar, sem atravessar construção', () => {
  const { w } = mundo();
  let viuCarregado = false;
  let viuMinerando = false;
  const entregas = [];
  for (let i = 0; i < 100 * SEGUNDO && entregas.length < 2; i++) {
    w.step();
    for (const m of w.mineradores.lista) {
      // O centro do minerador nunca fica dentro de construção (mineradora, torretas...);
      // o hangar do próprio time, onde ele minera, é livre para ele.
      assert.ok(alturaSolida(m.ship.x, m.ship.z, 0, false, m.time) <= heightAt(m.ship.x, m.ship.z) + 1e-9, `dentro de construção em (${m.ship.x}, ${m.ship.z})`);
      if (m.estado === 'minerando') {
        viuMinerando = true;
        const d = DOCAS[m.time];
        assert.ok(Math.hypot(m.ship.x - d.x, m.ship.z - d.z) < 30, 'minera na doca do próprio time');
        assert.ok(Math.hypot(m.ship.x - d.x, m.ship.z - d.z) < 20, `minera dentro da bacia de He-3 (${m.ship.x.toFixed(1)}, ${m.ship.z.toFixed(1)})`);
        assert.ok(Math.abs(m.ship.x) < MINERADORA.meiaX, 'minera dentro do hangar');
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
    // Despejou em cima de uma vaga da bacia do próprio time.
    const perto = Math.min(...VAGAS_BACIA[e.time].map((v) => Math.hypot(e.x - v.x, e.z - v.z)));
    assert.ok(perto < 6, `entregou em cima de uma vaga da bacia (${e.x.toFixed(1)}, ${e.z.toFixed(1)})`);
    const b = BACIAS[e.time];
    assert.ok(Math.hypot(e.x - b.x, e.z - b.z) < b.raioInterno, 'dentro da bacia do próprio time');
  }
  const ent = w.entidades().find((e) => e.tipo === 'minerador');
  assert.equal(typeof ent.time, 'number');
  assert.equal(typeof ent.carga, 'number');
  assert.equal(typeof ent.minerando, 'boolean');
});

test('mineradores: saem em fila (um a cada MINERADOR.saidaS) até os 10 do time', () => {
  const { w } = mundo();
  const conta = (t) => w.mineradores.lista.filter((m) => m.time === t).length;
  assert.equal(MINERADOR.maxAtivos, MINERADORES_POR_TIME);
  assert.equal(MINERADORES_POR_TIME, 10);
  assert.equal(conta(0), 1, 'o primeiro sai no começo da partida');
  for (let i = 0; i < (MINERADOR.saidaS - 1) * SEGUNDO; i++) w.step();
  assert.equal(conta(0), 1);
  for (let i = 0; i < 2 * SEGUNDO; i++) w.step();
  assert.equal(conta(0), 2, 'o segundo sai depois do espaço da saída');
  let maximo = 0;
  for (let i = 0; i < (MINERADOR.saidaS * MINERADORES_POR_TIME + 30) * SEGUNDO; i++) {
    w.step();
    maximo = Math.max(maximo, conta(0), conta(1));
  }
  assert.equal(maximo, MINERADOR.maxAtivos);
  assert.equal(conta(0), 10);
  assert.equal(conta(1), 10);
});

test('mineradores: os 10 não se empilham; na bacia mineram três de uma vez e o quarto espera na porta', () => {
  const { w } = mundo();
  w.escoltas.passo = () => {};
  // Segura cada minerador do time 0 na baia por mais 20 s: as três enchem e o de trás
  // tem de esperar na porta até uma vagar.
  const segurados = new Set();
  let maxJuntos = 0;
  let esperou = 0;
  let menorMesmoSentido = Infinity;
  let menor = Infinity;
  const entregas = [0, 0];
  for (let i = 0; i < 240 * SEGUNDO; i++) {
    w.step();
    for (const t of [0, 1]) {
      const ms = w.mineradores.lista.filter((m) => m.vivo && m.time === t);
      const minerando = ms.filter((m) => m.estado === 'minerando');
      assert.ok(minerando.length <= BAIAS[t].length, `${minerando.length} minerando no hangar do time ${t}`);
      const baias = minerando.map((m) => m.baia);
      assert.equal(new Set(baias).size, baias.length, 'cada um na sua baia');
      for (const m of minerando) {
        const b = BAIAS[t][m.baia];
        assert.ok(Math.hypot(m.ship.x - b.x, m.ship.z - b.z) < 8, `minera em cima da baia (${m.ship.x.toFixed(1)}, ${m.ship.z.toFixed(1)})`);
      }
      if (t === 0) {
        maxJuntos = Math.max(maxJuntos, minerando.length);
        for (const m of minerando) {
          if (segurados.has(m.id)) continue;
          m.mineraAte += 20 * SEGUNDO;
          segurados.add(m.id);
        }
        const porta = ESPERAS[0];
        if (ms.some((m) => m.estado === 'ida' && m.baia == null && Math.hypot(m.ship.x - porta.x, m.ship.z - porta.z) < 40 && Math.hypot(m.ship.vx, m.ship.vz) < 2)) esperou++;
      }
      for (let a = 0; a < ms.length; a++) {
        for (let b = a + 1; b < ms.length; b++) {
          const p = ms[a];
          const q = ms[b];
          const d = Math.hypot(p.ship.x - q.ship.x, p.ship.z - q.ship.z);
          menor = Math.min(menor, d);
          // Na lane, em fila; no hangar, indo cada um para a sua baia, só não encostam (menor).
          // (Na bacia da base, despejando cada um na sua vaga, vale o teste da bacia.)
          if (p.estado === q.estado && p.estado !== 'minerando' && p.estado !== 'descarregando' && (p.baia == null || q.baia == null) && (p.vaga == null || q.vaga == null)) menorMesmoSentido = Math.min(menorMesmoSentido, d);
        }
      }
    }
    for (const e of w.tirarEventos()) if (e.e === 'entrega') entregas[e.time]++;
  }
  assert.equal(maxJuntos, 3, 'três minerando juntos na bacia');
  assert.ok(esperou > 3 * SEGUNDO, `o de trás esperou parado na porta (${(esperou / SEGUNDO).toFixed(1)} s)`);
  assert.ok(menor > 8, `dois do mesmo time a ${menor.toFixed(1)} m`);
  assert.ok(menorMesmoSentido > 20, `dois do mesmo time no mesmo sentido a ${menorMesmoSentido.toFixed(1)} m`);
  // Sem segurar ninguém, o time 1 entrega em ritmo: ~7 por minuto com os 10 na lane
  // (a primeira volta só chega à bacia com 1:30).
  assert.ok(entregas[1] >= 15, `entregas do time 1 em 4 min: ${entregas[1]}`);
  assert.ok(entregas[0] > 0 && entregas[0] <= entregas[1], 'o time 0, com as baias presas, entregou menos');
});

test('mineradores: destruído, o substituto sai MINERADOR.intervaloS depois', () => {
  const { w } = mundo();
  for (let i = 0; i < (MINERADOR.saidaS * MINERADORES_POR_TIME + 5) * SEGUNDO; i++) w.step();
  const conta = () => w.mineradores.lista.filter((m) => m.vivo && m.time === 0).length;
  assert.equal(conta(), 10);
  w.mineradores.lista.find((m) => m.time === 0).vivo = false;
  w.step();
  assert.equal(conta(), 9);
  for (let i = 0; i < (MINERADOR.intervaloS - 1) * SEGUNDO; i++) w.step();
  assert.equal(conta(), 9, 'ainda no intervalo');
  for (let i = 0; i < 2 * SEGUNDO; i++) w.step();
  assert.equal(conta(), 10, 'o substituto saiu');
});

test('mineradores: linha reta da bacia à doca, nos tempos documentados (ida ~43 s, primeira entrega ~90 s, ciclo ~87 s)', () => {
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
  assert.ok(ida > 38 && ida < 48, `ida ${ida.toFixed(1)} s`);
  assert.ok(primeira > 84 && primeira < 96, `primeira entrega ${primeira.toFixed(1)} s`);
  assert.ok(ciclo > 80 && ciclo < 92, `ciclo ${ciclo.toFixed(1)} s`);
  // A saída espalha os 10 pelo ciclo: o primeiro só volta à bacia depois de o décimo sair.
  assert.ok(MINERADOR.saidaS * (MINERADORES_POR_TIME - 1) < primeira, 'os 10 saem antes da primeira volta');
  assert.ok(Math.abs(MINERADOR.saidaS * MINERADORES_POR_TIME - ciclo) < 10, 'a saída é o ciclo dividido pelos 10');
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
  for (let i = 0; i < 220 * SEGUNDO && entregas.length < 3; i++) {
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

test('mineradores: despejam na bacia da base, três de cada vez, com a fila esperando de pé', () => {
  const { w } = mundo();
  w.escoltas.passo = () => {};
  // Segura cada minerador do time 0 na vaga por mais 25 s: as três enchem e quem chega
  // tem de esperar na espera da bacia até uma vagar.
  const segurados = new Set();
  let maxJuntos = 0;
  let esperou = 0;
  let viuDescarga = false;
  let menor = Infinity;
  const entregas = [];
  for (let i = 0; i < 300 * SEGUNDO; i++) {
    w.step();
    for (const t of [0, 1]) {
      const ms = w.mineradores.lista.filter((m) => m.vivo && m.time === t);
      const despejando = ms.filter((m) => m.estado === 'descarregando');
      assert.ok(despejando.length <= VAGAS_BACIA[t].length, `${despejando.length} despejando na bacia do time ${t}`);
      const vagas = ms.filter((m) => m.vaga != null).map((m) => m.vaga);
      assert.equal(new Set(vagas).size, vagas.length, 'cada um na sua vaga');
      for (const m of despejando) {
        const v = VAGAS_BACIA[t][m.vaga];
        assert.ok(Math.hypot(m.ship.x - v.x, m.ship.z - v.z) < 6, `despeja em cima da vaga (${m.ship.x.toFixed(1)}, ${m.ship.z.toFixed(1)})`);
      }
      // Na bacia, dois do mesmo time não encostam (quem chega, quem despeja e quem sai).
      const naBacia = ms.filter((m) => Math.hypot(m.ship.x - BACIAS[t].x, m.ship.z - BACIAS[t].z) < 45);
      for (let a = 0; a < naBacia.length; a++) {
        for (let b = a + 1; b < naBacia.length; b++) menor = Math.min(menor, Math.hypot(naBacia[a].ship.x - naBacia[b].ship.x, naBacia[a].ship.z - naBacia[b].ship.z));
      }
      if (t === 0) {
        maxJuntos = Math.max(maxJuntos, despejando.length);
        for (const m of despejando) {
          if (segurados.has(m.id)) continue;
          m.descargaAte += 25 * SEGUNDO;
          segurados.add(m.id);
        }
        const e = ESPERAS_BACIA[0];
        if (ms.some((m) => m.naBacia && m.vaga == null && Math.hypot(m.ship.x - e.x, m.ship.z - e.z) < 12 && Math.hypot(m.ship.vx, m.ship.vz) < 2)) esperou++;
      }
    }
    const ents = w.entidades();
    for (const m of w.mineradores.lista) {
      const ent = ents.find((e) => e.id === m.id);
      assert.equal(!!ent.descarga, m.estado === 'descarregando' && m.carga > 0, 'descarga no snapshot só enquanto despeja');
      if (ent.descarga) {
        viuDescarga = true;
        assert.equal(ent.descarga, 1);
      }
    }
    for (const e of w.tirarEventos()) if (e.e === 'entrega') entregas.push(e);
  }
  assert.ok(viuDescarga, 'o snapshot mostrou a descarga');
  assert.equal(maxJuntos, 3, 'três despejando juntos na bacia');
  assert.ok(esperou > 3 * SEGUNDO, `quem chegou esperou parado na espera da bacia (${(esperou / SEGUNDO).toFixed(1)} s)`);
  // As vagas dos lados ficam a 10 m do eixo: quem passa pelo meio para o fundo (ou sai
  // dele) tem ~1 m de folga para cada lado com as naves de 4,5 m de raio.
  assert.ok(menor > 8, `dois do mesmo time a ${menor.toFixed(1)} m na bacia`);
  const doTime = (t) => entregas.filter((e) => e.time === t);
  assert.ok(doTime(1).length >= 18, `entregas do time 1 em 5 min: ${doTime(1).length}`);
  assert.ok(doTime(0).length > 0 && doTime(0).length < doTime(1).length, 'o time 0, com as vagas presas, entregou menos');
  assert.deepEqual(w.partida.placar, [doTime(0).length * MINERADOR.carga, doTime(1).length * MINERADOR.carga], 'o placar soma cada descarga');
});

test('mineradores: o EMP segura a descarga; a carga só conta no fim dela', () => {
  const { w } = mundo();
  w.escoltas.passo = () => {};
  let m = null;
  for (let i = 0; i < 120 * SEGUNDO && !m; i++) {
    w.step();
    m = w.mineradores.lista.find((x) => x.estado === 'descarregando' && x.time === 0) ?? null;
  }
  assert.ok(m, 'chegou à bacia');
  const placar = w.partida.placar[0];
  m.ship.emp = 10; // parado e sem despejar enquanto dura
  for (let i = 0; i < 5 * SEGUNDO; i++) w.step();
  assert.equal(m.estado, 'descarregando');
  assert.equal(w.partida.placar[0], placar, 'nada entrou ainda');
  m.ship.emp = 0;
  for (let i = 0; i < (MINERADOR.descargaS + 1) * SEGUNDO; i++) w.step();
  assert.equal(w.partida.placar[0], placar + MINERADOR.carga);
  assert.equal(m.carga, 0);
});
