// Evolução de armas por instância ({t:'evoluirItem', inst}, shared/loja.js +
// server/servicos.js): cada arma do inventário sobe da versão V1 à V8 do original (o
// nível da arma, 1 a 8), pagando a taxa de tuning do original em ouro, em qualquer
// nível do piloto, pousado e parado na própria base. A versão vai na nave por
// instância (s.armasInst; no encaixe, s.nivEnc) e muda tudo o que a arma faz; a
// instância fica no piloto (volta no renascimento, zera na partida seguinte).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World, ZONA_SEGURA } from '../server/game.js';
import { createShip, stepShip, IDX_ARMA, ARMAS, WEAPONS, INPUT_VAZIO, armasIniciais, versaoArma } from '../shared/sim.js';
import { BASE, SERVICOS } from '../shared/terrain.js';
import { ARMA_NIVEL_MAX, precoEvoluirArma, itemDaLoja } from '../shared/loja.js';

const SEGUNDO = 30;
const PARADO = { ...INPUT_VAZIO };

function mundo(opcoes = {}) {
  const w = new World({ drones: 0, monstros: 0, elites: 0, ...opcoes });
  w.mineradores.passo = () => {};
  return w;
}

function pousar(j, servico = 'loja', time = j.time) {
  const sv = SERVICOS.find((s) => s.servico === servico && s.time === time);
  Object.assign(j.ship, { x: sv.x, z: sv.z, vx: 0, vz: 0, pousado: true });
}

/** Id da instância da arma `kind` no inventário de `j` (undefined se não tem). */
const instDe = (j, kind) => j.inv.find((x) => x.chave === kind)?.id;
const evoluir = (w, j, inst) => w.pedido(j.id, { t: 'evoluirItem', inst });
/** Nível da instância `inst` como a nave a lê (s.armasInst: [id, índice, nível]). */
const nivelNaNave = (s, inst) => s.armasInst.find((x) => x[0] === inst)?.[2];

test('evoluir arma: preço da taxa de tuning do original e máximo na V8', () => {
  assert.equal(ARMA_NIVEL_MAX, 8);
  for (const kind of ARMAS) {
    if (WEAPONS[kind].npc) continue;
    for (let n = 1; n < ARMA_NIVEL_MAX; n++) {
      const p = precoEvoluirArma(kind, n);
      assert.ok(p > 0 && p % 10 === 0, `${kind} nível ${n}: ${p}`);
    }
    assert.equal(precoEvoluirArma(kind, ARMA_NIVEL_MAX), null, 'no máximo não há próximo');
  }
  // Feixe Duplo: taxas de 1300, 1900, 2800, 4200 no original × 0,06.
  assert.deepEqual([1, 2, 3, 4].map((n) => precoEvoluirArma('o311001', n)), [80, 110, 170, 250]);
  // Míssil Paralisante: as caras ficam caras de evoluir, como no original.
  assert.deepEqual([1, 2, 3, 4].map((n) => precoEvoluirArma('o312010', n)), [390, 570, 840, 1260]);
  assert.equal(precoEvoluirArma('laser', 1), null, 'tiro de NPC não evolui');
  assert.equal(precoEvoluirArma('o311001', 0), null);
  assert.equal(precoEvoluirArma('nada', 1), null);
  // A Loja não evolui mais nada: a evolução é por instância.
  assert.equal(itemDaLoja('evoluir:o311001'), null);
  assert.equal(itemDaLoja('evoluir:'), null);
});

test('evoluir arma: cobra, exige pousado na própria base e a instância, vale em qualquer nível do piloto e para no máximo', () => {
  const w = mundo();
  const j = w.addPlayer('A', 'shrewdo');
  const [z] = armasIniciais('shrewdo');
  const kz = ARMAS[z];
  const iz = instDe(j, kz);
  assert.ok(Number.isInteger(iz), 'as de fábrica já são instâncias do inventário');
  j.ouro = 100000;
  assert.deepEqual(evoluir(w, j, iz), { t: 'resultado', acao: 'evoluirItem', item: iz, ok: false, codigo: 'nao_pousado' }, 'voando');
  pousar(j, 'loja', 1 - j.time);
  assert.equal(evoluir(w, j, iz).codigo, 'nao_pousado', 'na base do outro time');
  pousar(j, 'evolucao');
  assert.equal(evoluir(w, j, 999).codigo, 'sem_item', 'instância que não tem');
  for (const lixo of ['1', 1.5, null, undefined, {}]) assert.equal(evoluir(w, j, lixo).codigo, 'invalido', String(lixo));
  assert.equal(j.nivel, 1);
  const ouro = j.ouro;
  assert.equal(evoluir(w, j, iz).ok, true, 'qualquer área de pouso da própria base serve');
  assert.equal(j.ouro, ouro - precoEvoluirArma(kz, 1));
  assert.equal(j.inv.find((x) => x.id === iz).nivel, 2);
  assert.equal(j.inv.find((x) => x.id === iz).pago, precoEvoluirArma(kz, 1), 'a de fábrica sai de graça; a evolução soma no pago');
  assert.equal(j.ship.nivEnc[0], 2, 'a nave em uso já tem a versão nova no Z');
  // Até a V8 ainda no nível 1: a versão não pede nível do piloto.
  pousar(j, 'loja');
  for (let n = 3; n <= ARMA_NIVEL_MAX; n++) assert.equal(evoluir(w, j, iz).ok, true, `nível ${n}`);
  assert.equal(evoluir(w, j, iz).codigo, 'limite');
  assert.equal(j.ship.nivEnc[0], ARMA_NIVEL_MAX);
  j.ouro = 0;
  const outra = instDe(j, ARMAS[armasIniciais('shrewdo')[1]]);
  assert.equal(evoluir(w, j, outra).codigo, 'ouro_insuficiente');
  // Arma comprada também evolui (no compartimento).
  j.ouro = 10000;
  assert.equal(w.pedido(j.id, { t: 'comprar', item: 'o312001' }).ok, true);
  assert.equal(evoluir(w, j, instDe(j, 'o312001')).ok, true);
  const comprada = instDe(j, 'o312001');
  assert.equal(nivelNaNave(j.ship, comprada), 2);
  assert.equal(nivelNaNave(w.snapshotPara(j, [], []).me, comprada), 2, 'o `me` leva a versão da instância');
  assert.equal(IDX_ARMA.o312001, j.ship.armasInst.find((x) => x[0] === comprada)[1]);
});

test('evoluir arma: a versão nova muda o tiro (dano, energia e projéteis) no servidor e na predição', () => {
  const w = mundo({ torretas: false });
  const a = w.addPlayer('A', 'shrewdo');
  const b = w.addPlayer('B', 'acron');
  const [z] = armasIniciais('shrewdo');
  const z0 = BASE.z - ZONA_SEGURA - 120;
  a.ship = createShip('shrewdo', BASE.x, z0, 0);
  b.ship = createShip('acron', BASE.x, z0 - 25, 0);
  a.protegidoAte = b.protegidoAte = 0;
  a.inv = a.inv.map((x) => (x.chave === ARMAS[z] ? { ...x, nivel: 5 } : x));
  a.ship.niveis = { [z]: 5 };
  const v5 = versaoArma(z, 5);
  const hp = b.ship.hp;
  w.pushInput(a.id, { s: 1, ...PARADO, f1: true });
  for (let i = 0; i < 10; i++) w.step();
  const tiros = v5.golpe.tiros.length;
  assert.ok(Math.abs(hp - b.ship.hp - tiros * v5.golpe.dano) < 1e-6, `V5: ${hp - b.ship.hp}`);
  assert.ok(v5.golpe.dano > versaoArma(z, 1).golpe.dano);
  // A predição lê a versão do `me` (s.niveis): mesmos disparos e mesma energia.
  const me = structuredClone(w.snapshotPara(a, [], []).me);
  for (let i = 0; i < SEGUNDO; i++) stepShip(me, PARADO);
  const en = me.en;
  const d = stepShip(me, { ...PARADO, f1: true });
  assert.equal(d.length, tiros);
  assert.ok(d.every((t) => t.nivel === 5));
  assert.ok(en - me.en > v5.energia - 1); // gastou a energia da V5 (menos a regeneração do passo)
  // Armadilha Teleguiada: a V2 solta quatro cargas em vez de três.
  assert.equal(versaoArma('o312008', 1).golpe.tiros.length, 3);
  assert.equal(versaoArma('o312008', 2).golpe.tiros.length, 4);
});

test('evoluir arma: o nível volta no renascimento e zera na partida seguinte', () => {
  const w = mundo({ duracaoPartidaS: 2, intervaloFimS: 1 });
  const j = w.addPlayer('A', 'bellico');
  const [z] = armasIniciais('bellico');
  w.step();
  pousar(j);
  j.ouro = 10000;
  j.nivel = 5;
  assert.equal(evoluir(w, j, instDe(j, ARMAS[z])).ok, true);
  j.ship.hp = 0;
  j.vivo = false;
  j.respawnTick = w.tick + 1;
  w.step();
  assert.ok(j.vivo);
  assert.equal(j.ship.nivEnc[0], 2, 'a nave nova vem com a versão');
  assert.equal(w.snapshotPara(j, [], []).me.nivEnc[0], 2, 'o `me` leva a versão para a predição e o menu');
  for (let i = 0; i < SEGUNDO * 10 && w.partida.numero < 2; i++) w.step();
  assert.equal(w.partida.numero, 2);
  assert.equal(j.inv.find((x) => x.chave === ARMAS[z]).nivel, 1, 'a de fábrica volta à V1');
  assert.deepEqual(j.ship.nivEnc, [1, 1]);
  assert.ok(j.ship.armasInst.every((x) => x[2] === 1));
});
