// Ondas da jungle (server/jungle.js, DEGRAUS_JUNGLE): os acampamentos crescem com a
// partida (×1 até 15:00 restantes, ×2, ×3 e ×4 a partir de 5:00), com reforço na hora
// no acampamento vivo, renascimento e primeira aparição com a quantidade do momento;
// o SN-4, a Medusa e a sonda não multiplicam; partida nova volta a ×1; modo de teste
// pelo tempo de mundo; lugares sem sobreposição, sem rocha e girados 180° no time 1;
// o ouro de cada monstro de acampamento sobe com o degrau (×1,5, ×2 e ×2,5).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../server/game.js';
import { DT } from '../shared/sim.js';
import { ACAMPAMENTOS } from '../shared/terrain.js';
import { pontoLivre } from '../shared/obstaculos.js';
import {
  COMPOSICAO, DEGRAUS_JUNGLE, ESPACO_LUGAR, corpoLivre, especiesAcampamento, idNoTime0, lugaresAcampamento, multJungle, ouroJungle,
} from '../server/jungle.js';
import { ESPECIES } from '../server/especies.js';

function rngFixo(semente = 1) {
  let s = semente;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
const passos = (w, s) => {
  for (let i = 0; i < Math.round(s / DT); i++) w.step();
};
const matar = (w, m, j) => w.jungle.ctx.ferir(m, 1e9, j.id, null, {});
/** Degraus encurtados para uma partida de 20 s: ×2 aos 15 s restantes, ×3 aos 10, ×4 aos 5. */
const DEGRAUS_CURTOS = [{ restanteS: 15, mult: 2, ouro: 1.5 }, { restanteS: 10, mult: 3, ouro: 2 }, { restanteS: 5, mult: 4, ouro: 2.5 }];

function mundo({ duracaoPartidaS = 20, tempos = {}, ...resto } = {}) {
  const w = new World({ preparacaoS: 0, rng: rngFixo(3), torretas: false, ouroPorSegundo: 0, duracaoPartidaS, temposJungle: { degraus: DEGRAUS_CURTOS, ...tempos }, ...resto });
  const a = w.addPlayer('A', 'bellico');
  const b = w.addPlayer('B', 'acron');
  for (const j of [a, b]) j.protegidoAte = 0;
  return { w, a, b };
}
/** Quantos monstros (vivos ou não) cada acampamento tem, por id. */
const contagem = (w) => Object.fromEntries(ACAMPAMENTOS.map((a) => [a.id, w.jungle.covil(a.id).membros.length]));
const esperado = (mult) => Object.fromEntries(ACAMPAMENTOS.map((a) => [a.id, COMPOSICAO[idNoTime0(a)].length * mult]));

test('ondas: os degraus do pedido, pelo tempo restante', () => {
  assert.deepEqual(DEGRAUS_JUNGLE, [{ restanteS: 900, mult: 2, ouro: 1.5 }, { restanteS: 600, mult: 3, ouro: 2 }, { restanteS: 300, mult: 4, ouro: 2.5 }]);
  for (const [r, m, o] of [[1200, 1, 1], [960, 1, 1], [900.5, 1, 1], [900, 2, 1.5], [601, 2, 1.5], [600, 3, 2], [301, 3, 2], [300, 4, 2.5], [60, 4, 2.5], [0, 4, 2.5]]) {
    assert.equal(multJungle(r), m, `${r} s restantes`);
    assert.equal(ouroJungle(r), o, `ouro com ${r} s restantes`);
  }
  assert.deepEqual(especiesAcampamento('JB0N', 4), Array(16).fill('sn3'));
  const centro = especiesAcampamento('JC0N', 2);
  assert.equal(centro.filter((e) => e === 'great_xerxes').length, 2);
  assert.equal(centro.filter((e) => e === 'xerxes').length, 4);
});

test('ondas: ×1, ×2, ×3 e ×4 nos 8 acampamentos, com reforço na hora; SN-4, Medusa e sonda não multiplicam', () => {
  const todosJa = { acampamento: { primeiroS: 0, voltaS: 60 }, ataque: { primeiroS: 0 }, medusa: { primeiroS: 0 } };
  const { w, a } = mundo({ tempos: todosJa });
  w.step();
  assert.equal(w.jungle.mult, 1);
  assert.deepEqual(contagem(w), esperado(1));
  const antes = [...w.jungle.covil('JB0N').membros];
  // Grupo provocado: o reforço chega com a mesma raiva.
  w.jungle.provocar(antes[0], a.id);
  passos(w, 5.05);
  assert.equal(w.jungle.mult, 2);
  assert.deepEqual(contagem(w), esperado(2));
  const c = w.jungle.covil('JB0N');
  assert.deepEqual(c.membros.slice(0, 4), antes, 'os de antes continuam');
  assert.ok(c.membros.slice(4).every((m) => m.vivo && m.ship.hp === m.ship.maxHp));
  assert.ok(c.membros.slice(4).every((m) => m.raiva.has(a.id)), 'reforço com a raiva do grupo');
  passos(w, 5);
  assert.equal(w.jungle.mult, 3);
  assert.deepEqual(contagem(w), esperado(3));
  passos(w, 5);
  assert.equal(w.jungle.mult, 4);
  assert.deepEqual(contagem(w), esperado(4));
  passos(w, 4.5); // quase no fim: continua ×4
  assert.ok(w.partida.restante(w.tick) < 1);
  assert.equal(w.jungle.mult, 4);
  assert.deepEqual(contagem(w), esperado(4));
  for (const id of ['BA0', 'BA1', 'MEDUSA']) assert.equal(w.jungle.covil(id).membros.length, 1, id);
  assert.deepEqual(w.jungle.covil('SONDA').especies, ['sonda']);
  assert.equal(w.monstros.filter((m) => m.esp === 'sn4').length, 2);
  assert.equal(w.monstros.filter((m) => m.esp === 'medusa').length, 1);
});

test('ondas: acampamento em recarga volta com a quantidade nova; o que ainda não apareceu usa a do momento', () => {
  const { w, a } = mundo({ tempos: { acampamento: { primeiroS: 0, voltaS: 4 } } });
  w.step();
  const c = w.jungle.covil('JC0S');
  assert.equal(c.membros.length, 3);
  passos(w, 3);
  for (const m of c.membros) matar(w, m, a); // morre inteiro com ×1 (3 de 3)
  assert.equal(c.estado, 'recarga');
  passos(w, 2.1); // sobe para ×2 em recarga: ninguém nasce antes da hora
  assert.equal(w.jungle.mult, 2);
  assert.equal(c.estado, 'recarga');
  passos(w, 2);
  assert.equal(c.estado, 'ativo');
  assert.equal(c.membros.length, 6, 'voltou com ×2');
  assert.deepEqual(c.membros.map((m) => m.esp).sort(), ['anti', 'anti', 'bazit', 'bazit', 'bazit', 'bazit']);
  // Renasce só quando o grupo INTEIRO (reforço incluído) morre.
  passos(w, 4.1); // ×3: reforço
  assert.equal(c.membros.length, 9);
  for (const m of c.membros.slice(0, 8)) matar(w, m, a);
  assert.equal(c.estado, 'ativo', 'com um vivo, ninguém volta');
  matar(w, c.membros[8], a);
  assert.equal(c.estado, 'recarga');

  // Primeira aparição depois de o degrau subir: já nasce com o multiplicador.
  const t2 = mundo({ tempos: { acampamento: { primeiroS: 6 } } });
  passos(t2.w, 5.5);
  assert.equal(t2.w.jungle.covil('JB0N').estado, 'espera');
  passos(t2.w, 1);
  assert.deepEqual(contagem(t2.w), esperado(2));
});

test('ondas: partida nova volta a ×1', () => {
  const { w } = mundo({ duracaoPartidaS: 4, intervaloFimS: 1, tempos: { acampamento: { primeiroS: 0 }, degraus: [{ restanteS: 3, mult: 2 }] } });
  passos(w, 1.5);
  assert.equal(w.jungle.mult, 2);
  assert.deepEqual(contagem(w), esperado(2));
  passos(w, 3.6); // fim (4 s) e tela de resultado (1 s)
  assert.equal(w.partida.numero, 2);
  assert.equal(w.jungle.mult, 1);
  w.step();
  assert.deepEqual(contagem(w), esperado(1));
});

test('ondas: no modo de teste (sem relógio) conta o tempo de mundo da jungle', () => {
  const w = new World({ preparacaoS: 0, rng: rngFixo(2), teste: true, torretas: false, temposJungle: { acampamento: { primeiroS: 0 } } });
  w.addPlayer('T', 'acron');
  w.step();
  assert.ok(w.partida.semTempo);
  assert.equal(w.jungle.mult, 1);
  assert.ok(Math.abs(w.jungle.restanteS() - (1200 - (w.tick - w.jungle.inicioTick) * DT)) < 1e-9);
  w.jungle.inicioTick -= Math.round(300 / DT); // 5 min de mundo
  w.step();
  assert.equal(w.jungle.mult, 2);
  assert.deepEqual(contagem(w), esperado(2));
  w.jungle.inicioTick -= Math.round(900 / DT); // bem depois dos 20 min: fica ×4
  w.step();
  assert.equal(w.jungle.mult, 4);
});

test('ondas: lugares sem sobreposição, sem rocha, os de ×1 iguais aos fixos e girados 180° no time 1', () => {
  for (const a of ACAMPAMENTOS) {
    const esp = especiesAcampamento(idNoTime0(a), 4);
    const l = lugaresAcampamento(a, esp.length);
    assert.equal(l.length, esp.length);
    assert.deepEqual(lugaresAcampamento(a, esp.length / 4), l.slice(0, esp.length / 4), `${a.id}: ×1 é o começo do ×4`);
    for (let i = 0; i < l.length; i++) {
      const r = ESPECIES[esp[i]].raio;
      assert.ok(corpoLivre(l[i].x, l[i].z, r) && pontoLivre(l[i].x, l[i].z, r), `${a.id} #${i}: chão livre`);
      assert.ok(Math.hypot(l[i].x - a.x, l[i].z - a.z) < 140, `${a.id} #${i}: perto do acampamento`);
      for (let k = 0; k < i; k++) {
        const d = Math.hypot(l[i].x - l[k].x, l[i].z - l[k].z);
        assert.ok(d >= r + ESPECIES[esp[k]].raio + ESPACO_LUGAR - 1e-6, `${a.id}: #${i} e #${k} a ${d.toFixed(1)} m`);
      }
    }
  }
  for (const [z0, z1] of [['JB0N', 'JB1S'], ['JB0S', 'JB1N'], ['JC0N', 'JC1S'], ['JC0S', 'JC1N']]) {
    const l0 = lugaresAcampamento(ACAMPAMENTOS.find((a) => a.id === z0), 16);
    const l1 = lugaresAcampamento(ACAMPAMENTOS.find((a) => a.id === z1), 16);
    l0.forEach((p, i) => assert.ok(Math.abs(p.x + l1[i].x) < 1e-9 && Math.abs(p.z + l1[i].z) < 1e-9, `${z0} × ${z1} #${i}`));
  }
});

test('ondas: jungle cheia (×4) e provocada continua leve no passo do mundo', (t) => {
  const { w, a, b } = mundo({
    duracaoPartidaS: 60,
    tempos: { acampamento: { primeiroS: 0 }, ataque: { primeiroS: 0 }, medusa: { primeiroS: 0 }, degraus: [{ restanteS: 1e9, mult: 4 }] },
  });
  w.step();
  const camp = w.monstros.filter((m) => m.covil?.tipo === 'acampamento');
  assert.equal(camp.length, 2 * (16 + 16 + 12 + 12));
  // Metade dos acampamentos provocada (andam, contornam rocha e atiram).
  for (const ac of ACAMPAMENTOS.filter((x, i) => i % 2 === 0)) w.jungle.provocar(w.jungle.covil(ac.id).membros[0], (ac.time === 0 ? a : b).id);
  passos(w, 1); // aquece (grade de navegação)
  const n = 150;
  const t0 = performance.now();
  for (let i = 0; i < n; i++) {
    w.step();
    for (const j of [a, b]) w.snapshotPara(j, [], []);
  }
  const ms = (performance.now() - t0) / n;
  t.diagnostic(`${w.monstros.length} monstros: ${ms.toFixed(2)} ms por passo (com 2 snapshots)`);
  assert.ok(ms < 15, `${ms.toFixed(2)} ms por passo`);
});

test('ondas: o ouro de cada monstro de acampamento sobe com o degrau; SN-4 e XP não mudam', () => {
  const todosJa = { acampamento: { primeiroS: 0, voltaS: 60 }, ataque: { primeiroS: 0 } };
  const { w, a } = mundo({ tempos: todosJa });
  w.step();
  /** Ouro e XP que o A ganha matando um vivo da espécie `esp` agora. */
  const abate = (esp) => {
    const m = w.monstros.find((x) => x.vivo && x.esp === esp);
    const ouro = a.ouro;
    const xp = a.xpGanho ?? 0;
    matar(w, m, a);
    w.step();
    return { ouro: a.ouro - ouro, xp: (a.xpGanho ?? 0) - xp };
  };
  const base = ESPECIES.sn3.ouro;
  const ganhos = [];
  for (const espera of [0, 5.05, 5, 5]) {
    passos(w, espera);
    ganhos.push(abate('sn3'));
  }
  assert.deepEqual(ganhos.map((g) => g.ouro), [base, base * 1.5, base * 2, base * 2.5].map(Math.round));
  assert.ok(ganhos.every((g) => g.xp === ESPECIES.sn3.xp || g.xp === 0), 'a XP não multiplica');
  assert.equal(abate('sn4').ouro, ESPECIES.sn4.ouro, 'o SN-4 paga o ouro de sempre');
  // O evento 'ganho' (o ouro que sobe da morte) leva o valor multiplicado.
  const m = w.monstros.find((x) => x.vivo && x.esp === 'snzero');
  w.tirarEventos();
  matar(w, m, a);
  const ganho = w.tirarEventos().find((e) => e.e === 'ganho' && e.id === m.id);
  assert.equal(ganho.ouro, Math.round(ESPECIES.snzero.ouro * 2.5));
});

test('SN-3: só 1 em cada 4 leva o míssil azul que tira a energia, em todo degrau e no reforço', () => {
  const todosJa = { acampamento: { primeiroS: 0, voltaS: 60 }, ataque: { primeiroS: 0 }, medusa: { primeiroS: 0 } };
  const { w } = mundo({ tempos: todosJa });
  const descarga = ESPECIES.sn3.ataques.findIndex((a) => a.atq === 'missil_descarga');
  assert.ok(descarga >= 0);
  const comMissil = () => w.monstros.filter((m) => m.esp === 'sn3' && !m.semAtaque[descarga]);
  const sn3 = () => w.monstros.filter((m) => m.esp === 'sn3');
  w.step();
  for (const mult of [1, 2, 3, 4]) {
    assert.equal(w.jungle.mult, mult);
    assert.equal(sn3().length, 8 * mult, `×${mult}: SN-3 nos 2 acampamentos (um por território)`);
    assert.equal(comMissil().length, sn3().length / 4, `×${mult}: 1 em cada 4 com o míssil`);
    // Em cada acampamento, o primeiro de cada quatro (o reforço segue a conta).
    for (const a of ACAMPAMENTOS.filter((c) => COMPOSICAO[idNoTime0(c)][0] === 'sn3')) {
      const membros = w.jungle.covil(a.id).membros;
      assert.deepEqual(membros.map((m) => !m.semAtaque[descarga]), membros.map((_, i) => i % 4 === 0), a.id);
    }
    if (mult < 4) passos(w, 5.05);
  }
  // O disco continua com todos; o de fora da conta nunca escolhe o míssil.
  assert.ok(sn3().every((m) => !m.semAtaque[ESPECIES.sn3.ataques.findIndex((a) => a.atq === 'disco_voador')]));
});

test('SN-3 sem o míssil azul só atira o disco; outras espécies não mudam', () => {
  const w = new World({ preparacaoS: 0, jungle: true, torretas: false, ouroPorSegundo: 0, rng: rngFixo(7) });
  const j = w.addPlayer('Alvo', 'acron');
  j.protegidoAte = 0;
  const p = pontoLivre(rngFixo(11));
  const sem = w.jungle.criarMonstro('sn3', p.x, p.z, { ordem: 1 });
  const com = w.jungle.criarMonstro('sn3', p.x, p.z, { ordem: 4 });
  assert.deepEqual(sem.semAtaque, [false, true]);
  assert.deepEqual(com.semAtaque, [false, false]);
  for (const esp of ['snzero', 'xerxes', 'anti']) assert.ok(w.jungle.criarMonstro(esp, p.x, p.z, { ordem: 3 }).semAtaque.every((x) => !x), esp);
});
