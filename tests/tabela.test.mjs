// Tabela da partida (TAB, como a do League of Legends; public/js/tabela.js): o
// servidor conta, por piloto, o farm (monstros, mineradores e escoltas), as
// assistências e as mortes da partida, e por time (server/partida.js, `estat`) as
// torres sentinela destruídas, as Medusas e os Núcleos tomados e os abates de
// jogador inimigo; a lista pública `jogadores` leva a nave e os seis itens na nave.
// Tudo zera na partida nova.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../server/game.js';
import { estatisticasVazias } from '../server/partida.js';
import { DT, createShip } from '../shared/sim.js';
import { armasIniciais, ARMAS } from '../shared/armas.js';
import { CAMPO } from './lugares.mjs';
import { linhasDaTabela, kda, razaoKda, melhorDaPartida, textoRazaoKda } from '../public/js/tabela-regras.js';

function rngFixo(semente = 1) {
  let s = semente;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** A e C no time 0, B no 1; partida já andando, sem nada se mexendo sozinho. */
function mundo(opcoes = {}) {
  const w = new World({
    preparacaoS: 0,
    rng: rngFixo(3),
    ouroPorSegundo: 0,
    objetivos: { nucleo: { primeiroS: 1, renasceS: 600 } },
    temposJungle: { medusa: { primeiroS: 1, voltaS: 600 } },
    ...opcoes,
  });
  const a = w.addPlayer('A', 'bellico');
  const b = w.addPlayer('B', 'acron');
  const c = w.addPlayer('C', 'shrewdo');
  w.mineradores.passo = () => {};
  w.escoltas.passo = () => {};
  w.torretas.passo = () => {};
  w.step();
  for (const j of [a, b, c]) j.protegidoAte = 0;
  return { w, a, b, c };
}

const passos = (w, s) => {
  for (let i = 0; i < Math.round(s / DT); i++) w.step();
};
const ferir = (w, alvo, autor, dano = 1e9) => w.jungle.ctx.ferir(alvo, dano, autor.id, null, {});
const colocar = (j, x, z) => {
  j.ship = createShip(j.ship.race, x, z, 0, j.classe);
  j.ship.time = j.time;
  j.protegidoAte = 0;
};
const naLista = (w, quem, de) => w.snapshotPara(quem, w.entidades(), []).jogadores.find((p) => p.id === de.id);
const estat = (w, quem) => w.snapshotPara(quem, w.entidades(), []).partida.estat;

test('tabela: farm conta monstro, minerador e escolta; abate de jogador não é farm', () => {
  const { w, a, b } = mundo();
  colocar(a, CAMPO.x, CAMPO.z);
  colocar(b, CAMPO.x + 100, CAMPO.z);
  const m = w.jungle.criarMonstro('sn3', CAMPO.x, CAMPO.z - 80);
  ferir(w, m, a);
  assert.equal(a.farm, 1);
  ferir(w, b, a);
  assert.equal(a.farm, 1, 'nave inimiga não é farm');
  assert.equal(naLista(w, a, a).farm, 1, 'vai na lista do snapshot');
});

test('tabela: assistência e mortes da partida no KDA, e o abate no placar do time', () => {
  const { w, a, b, c } = mundo();
  colocar(a, CAMPO.x, CAMPO.z);
  colocar(c, CAMPO.x - 50, CAMPO.z);
  colocar(b, CAMPO.x + 100, CAMPO.z);
  ferir(w, b, c, 5); // C fere: entra na assistência
  ferir(w, b, a); // A dá o golpe final
  const pa = naLista(w, b, a);
  const pc = naLista(w, b, c);
  const pb = naLista(w, b, b);
  assert.deepEqual([pa.abatesJog, pa.mortesPartida, pa.assist], [1, 0, 0]);
  assert.deepEqual([pc.abatesJog, pc.mortesPartida, pc.assist], [0, 0, 1]);
  assert.deepEqual([pb.abatesJog, pb.mortesPartida, pb.assist], [0, 1, 0]);
  const e = estat(w, b);
  assert.equal(e[a.time].abates, 1);
  assert.equal(e[b.time].abates, 0);
});

test('tabela: torre sentinela, Medusa e Núcleo de He-3 contam para o time de quem destruiu', () => {
  const { w, a, b } = mundo();
  // Torre do time de B destruída por A (dano de área no pé dela).
  const t = w.torretas.lista.find((x) => x.time === b.time && x.viva);
  w.torretas.area({ id: a.id }, t.x, t.y, t.z, 5, 1e9, ARMAS[armasIniciais('bellico')[0]]);
  assert.equal(t.viva, false);
  assert.equal(estat(w, b)[a.time].torres, 1);
  assert.equal(estat(w, b)[b.time].torres, 0);

  passos(w, 1.2); // aparecem a Medusa e o Núcleo
  const [med] = w.jungle.covil('MEDUSA').membros;
  ferir(w, med, b);
  assert.equal(med.vivo, false);
  assert.equal(estat(w, a)[b.time].medusa, 1);

  const n = w.objetivos.nucleo;
  assert.equal(n.vivo, true);
  ferir(w, n, a);
  assert.equal(n.vivo, false);
  const e = estat(w, a);
  assert.equal(e[a.time].nucleo, 1);
  assert.equal(e[b.time].nucleo, 0);
});

test('tabela: a lista pública leva a nave e os seis itens na nave', () => {
  const { w, a, b } = mundo();
  const p = naLista(w, b, a); // B (outro time) também vê, como no TAB do LoL
  assert.equal(p.race, 'bellico');
  assert.equal(p.classe, a.classe);
  assert.equal(p.tier, 0);
  assert.equal(p.itens.length, 6);
  const fabrica = armasIniciais('bellico').map((i) => ARMAS[i]);
  assert.deepEqual(p.itens.slice(0, 2).map((x) => x[0]).sort(), [...fabrica].sort(), 'as duas armas de fábrica no Z e no X');
  assert.ok(p.itens.slice(0, 2).every((x) => x[1] === 1));
  assert.deepEqual(p.itens.slice(2), [null, null, null, null], 'sem escudo, armadura nem potenciadores');
  // Equipamento na nave aparece no lugar dele.
  a.inv.push({ id: 900, tipo: 'equip', chave: 'e330010', nivel: 3, pago: 0 });
  a.equipado.escudo = 900;
  w.step(); // a lista é calculada uma vez por tick
  const q = naLista(w, b, a);
  assert.deepEqual(q.itens[2], ['e330010', 3]);
});

test('tabela: tudo zera na partida nova', () => {
  const { w, a, b } = mundo({ duracaoPartidaS: 5, intervaloFimS: 1 });
  colocar(a, CAMPO.x, CAMPO.z);
  colocar(b, CAMPO.x + 100, CAMPO.z);
  ferir(w, w.jungle.criarMonstro('sn3', CAMPO.x, CAMPO.z - 80), a);
  ferir(w, b, a);
  assert.equal(estat(w, a)[a.time].abates, 1);
  const n = w.partida.numero;
  while (w.partida.numero === n) w.step();
  assert.deepEqual(estat(w, a), [estatisticasVazias(), estatisticasVazias()]);
  const pa = naLista(w, a, a);
  const pb = naLista(w, a, b);
  assert.deepEqual([pa.farm, pa.abatesJog, pa.assist, pb.mortesPartida], [0, 0, 0, 0]);
});

test('tabela (cliente): linhas por time, você primeiro, e o KDA como no LoL', () => {
  const jogadores = [
    { id: 5, nome: 'X (IA)', time: 1, nivel: 3, ia: true, abatesJog: 2, mortesPartida: 1, assist: 4, farm: 12, vivo: true },
    { id: 2, nome: 'Eu', time: 0, nivel: 4, abatesJog: 1, mortesPartida: 0, assist: 0, farm: 30, vivo: true },
    { id: 3, nome: 'Bot (IA)', time: 0, nivel: 2, ia: true, abatesJog: 0, mortesPartida: 2, assist: 1, farm: 8, vivo: false },
    { id: 1, nome: 'Outro', time: 0, nivel: 5, abatesJog: 3, mortesPartida: 1, assist: 2, farm: 40, vivo: true },
  ];
  const { meu, inimigo } = linhasDaTabela(jogadores, { meuId: 2, meuTime: 0 });
  assert.deepEqual(meu.map((p) => p.id), [2, 1, 3], 'você, depois gente, depois computador');
  assert.deepEqual(inimigo.map((p) => p.id), [5]);
  assert.equal(meu[2].nome, 'Bot', 'sem o "(IA)": vai o selo');
  assert.equal(meu[2].ia, true);
  assert.equal(kda(jogadores[0]), '2/1/4');
  assert.equal(kda({}), '0/0/0');
  assert.equal(meu[0].itens.length, 6, 'sem itens na lista: seis vazios');
});

test('destaque da partida: o melhor KDA dos dois times, desempatado por abates', () => {
  const p = (id, abatesJog, mortesPartida, assist, farm = 0) => ({ id, abatesJog, mortesPartida, assist, farm });
  assert.equal(razaoKda(p(1, 6, 2, 1)), 3.5);
  assert.equal(razaoKda(p(1, 2, 0, 1)), 3, 'sem morte divide por 1');
  // 8/3/2 (3,33) ganha de 1/0/0 (1).
  assert.equal(melhorDaPartida([p(1, 1, 0, 0), p(2, 8, 3, 2)]), 2);
  // Empate na razão (2): ganha quem abateu mais.
  assert.equal(melhorDaPartida([p(1, 2, 0, 0), p(2, 8, 4, 0)]), 2);
  // Mesma razão e mesmos abates: mais assistências, depois menos mortes.
  assert.equal(melhorDaPartida([p(1, 4, 2, 0), p(2, 4, 2, 0, 50), p(3, 2, 1, 0)]), 2, 'o farm desempata o resto');
  // Ninguém abateu: o de mais farm.
  assert.equal(melhorDaPartida([p(1, 0, 3, 0, 12), p(2, 0, 0, 0, 30)]), 2);
  // Nada feito por ninguém: sem destaque.
  assert.equal(melhorDaPartida([p(1, 0, 2, 0), p(2, 0, 0, 0)]), null);
  assert.equal(melhorDaPartida([]), null);
  // Tudo igual: quem entrou primeiro.
  assert.equal(melhorDaPartida([p(5, 2, 1, 0), p(3, 2, 1, 0)]), 3);
});

test('razão do KDA na tela: uma casa decimal, "Perfeito" sem morte', () => {
  assert.equal(textoRazaoKda({ abatesJog: 6, mortesPartida: 2, assist: 1 }), '3,5');
  assert.equal(textoRazaoKda({ abatesJog: 3, mortesPartida: 0, assist: 0 }), 'Perfeito');
  assert.equal(textoRazaoKda({ abatesJog: 0, mortesPartida: 0, assist: 0 }), '0,0');
});
