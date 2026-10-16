// Naves por raça e classe (shared/naves.js): o catálogo das 45 naves do original
// convertido para a escala do jogo, a entrada com raça e classe (Mechan bloqueada),
// a nave inicial, a compra da próxima nave da linha na Evolução e os status da nave
// valendo no servidor e no stepShip (a predição usa os mesmos números).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { World } from '../server/game.js';
import { iniciar } from '../server/index.js';
import { hpMaxDoNivel } from '../server/progressao.js';
import { createShip, stepShip, velocidadeBase, DT } from '../shared/sim.js';
import { SERVICOS, PLATAFORMAS_POUSO } from '../shared/terrain.js';
import {
  NAVES,
  CLASSES,
  ORDEM_CLASSES,
  RACAS_JOGAVEIS,
  RACAS_BLOQUEADAS,
  NIVEL_POR_TIER,
  PRECO_POR_TIER,
  TIER_MAX,
  naveDe,
  linhaDe,
  classeValida,
  classeOuPadrao,
  motivoRacaRecusada,
} from '../shared/naves.js';
import { CAMPO } from './lugares.mjs';

const PUBLICO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const SEGUNDO = 30;

function mundo(opcoes = {}) {
  const w = new World({ drones: 0, monstros: 0, elites: 0, torretas: false, ...opcoes });
  w.mineradores.passo = () => {};
  return w;
}

function pousar(j, servico, time = j.time) {
  const sv = SERVICOS.find((s) => s.servico === servico && s.time === time);
  Object.assign(j.ship, { x: sv.x, z: sv.z, vx: 0, vz: 0, pousado: true });
}

const evoluir = (w, j, opcao = 'nave') => w.pedido(j.id, { t: 'evoluir', opcao });

test('naves: 45 naves, cinco por raça e classe, níveis 1/5/10/15/20 e modelo no disco', () => {
  assert.deepEqual(RACAS_JOGAVEIS, ['acron', 'bellico', 'shrewdo']);
  assert.deepEqual(RACAS_BLOQUEADAS, ['mechan']);
  assert.deepEqual(ORDEM_CLASSES, Object.keys(CLASSES));
  const ids = new Set();
  let total = 0;
  for (const race of RACAS_JOGAVEIS) {
    assert.deepEqual(Object.keys(NAVES[race]).sort(), [...ORDEM_CLASSES].sort());
    for (const classe of ORDEM_CLASSES) {
      const linha = linhaDe(race, classe);
      assert.equal(linha.length, TIER_MAX + 1, `${race} ${classe}`);
      linha.forEach((n, tier) => {
        total++;
        ids.add(n.id);
        assert.equal(n.tier, tier);
        assert.equal(n.race, race);
        assert.equal(n.classe, classe);
        assert.equal(n.nivel, NIVEL_POR_TIER[tier]);
        assert.equal(n.preco, PRECO_POR_TIER[tier]);
        assert.equal(naveDe(race, classe, tier), n);
        for (const k of ['hp', 'energia', 'regenEnergia', 'velocidade', 'regenHpPousada']) assert.ok(n[k] > 0, `${n.nome}.${k}`);
        assert.equal(n.regenHpVoo > 0, race === 'bellico', 'só as Bellico regeneram voando');
        assert.equal(n.armadura, undefined, 'não existe armadura por nave');
        assert.ok(fs.existsSync(path.join(PUBLICO, n.modelo)), `modelo de ${n.nome}: ${n.modelo}`);
      });
    }
  }
  assert.equal(total, 45);
  assert.equal(ids.size, 45, 'ids únicos');
  assert.deepEqual(NIVEL_POR_TIER, [1, 5, 10, 15, 20]);
  for (let t = 1; t <= TIER_MAX; t++) assert.ok(PRECO_POR_TIER[t] > PRECO_POR_TIER[t - 1], 'cada nave custa mais que a anterior');
  assert.equal(PRECO_POR_TIER[0], 0, 'a primeira é de fábrica');
});

test('naves: conversão do original (HP/5, energia ×0,3, regen ×0,6, velocidade ×0,5 em m/s)', () => {
  const warrior = naveDe('acron', 'assault', 0);
  assert.equal(warrior.nome, 'Warrior');
  assert.equal(warrior.hp, 170); // 850 / 5
  assert.equal(warrior.energia, 27); // 90 × 0,3
  assert.equal(warrior.regenEnergia, 9.4); // 0,0156/ms × 1000 × 0,3 / 0,5
  assert.equal(warrior.velocidade, 55.6); // 0,1111 m/ms = 111 m/s, × 0,5
  assert.equal(warrior.regenHpPousada, 4); // 0,02 HP/ms = 20 HP/s, /5
  assert.equal(warrior.regenHpVoo, 0);
  assert.equal(naveDe('acron', 'functional', 0).energia, 54);
  assert.equal(naveDe('acron', 'assault', 4).energia, 132);
  assert.equal(naveDe('acron', 'functional', 0).nome, 'Esper');
  assert.equal(naveDe('acron', 'assault', 4).nome, 'Ulysses');
  assert.equal(naveDe('shrewdo', 'mobile', 0).id, 'speed-wing');
  assert.equal(naveDe('bellico', 'assault', 0).regenHpVoo, 2.7); // 0,0133/ms = 13,3 HP/s, /5
  assert.equal(naveDe('bellico', 'assault', 3).regenHpVoo, 6.7, 'a Elephantera regenera mais');
  // Números do original mantidos: a Ulysses tem menos HP que a Kamasutra, mas mais energia e velocidade.
  const [k, u] = [naveDe('acron', 'assault', 3), naveDe('acron', 'assault', 4)];
  assert.ok(u.hp < k.hp && u.energia > k.energia && u.velocidade > k.velocidade);
});

test('naves: a especialidade de cada classe (Assault HP, Mobile velocidade, Functional energia)', () => {
  // No tier 4 as Assault do original têm mais energia que as Functional (Ulysses 441 x
  // Garuda 432): a regra da energia vale até o tier 3.
  for (const race of RACAS_JOGAVEIS) {
    for (let tier = 0; tier <= TIER_MAX; tier++) {
      const [a, m, f] = ORDEM_CLASSES.map((c) => naveDe(race, c, tier));
      assert.ok(a.hp > m.hp && a.hp > f.hp, `${race} ${tier}: Assault com mais HP`);
      assert.ok(m.velocidade > a.velocidade && m.velocidade > f.velocidade, `${race} ${tier}: Mobile mais rápida`);
      if (tier < TIER_MAX) assert.ok(f.energia > a.energia && f.energia > m.energia, `${race} ${tier}: Functional com mais energia`);
    }
  }
});

test('naves: classe e raça válidas', () => {
  assert.equal(classeValida('mobile'), true);
  assert.equal(classeValida('lixo'), false);
  assert.equal(classeValida(undefined), false);
  assert.equal(classeValida('toString'), false);
  assert.equal(classeOuPadrao('functional'), 'functional');
  assert.equal(classeOuPadrao({}), 'assault');
  assert.equal(motivoRacaRecusada('acron'), null);
  assert.equal(motivoRacaRecusada('mechan'), 'raca_bloqueada');
  assert.equal(motivoRacaRecusada('xyz'), 'raca_invalida');
  assert.equal(motivoRacaRecusada(undefined), 'raca_invalida');
});

test('naves: o piloto começa na primeira nave da linha, com os status dela', () => {
  const w = mundo();
  for (const race of RACAS_JOGAVEIS) {
    for (const classe of ORDEM_CLASSES) {
      const j = w.addPlayer('P', race, classe);
      const n = naveDe(race, classe, 0);
      assert.equal(j.classe, classe);
      assert.equal(j.tier, 0);
      assert.equal(j.ship.classe, classe);
      assert.equal(j.ship.tier, 0);
      assert.equal(j.ship.maxHp, n.hp);
      assert.equal(j.ship.hp, n.hp);
      assert.equal(j.ship.maxEn, n.energia);
      assert.equal(j.ship.velocidade, n.velocidade);
      assert.equal(j.ship.regenEn, n.regenEnergia);
      const ent = w.entidades().find((e) => e.id === j.id);
      assert.equal(ent.classe, classe);
      assert.equal(ent.tier, 0);
      w.removePlayer(j.id);
    }
  }
  const sem = w.addPlayer('Sem classe', 'shrewdo', 'lixo');
  assert.equal(sem.classe, 'assault', 'classe inválida vira Assault');
});

test('naves: pelo WebSocket, entra com a classe; Mechan e raça inventada são recusadas', async () => {
  const srv = await iniciar({ porta: 0, world: mundo() });
  const conectar = async () => {
    const ws = new WebSocket(`ws://localhost:${srv.porta}/ws`);
    const msgs = [];
    let fechou = false;
    ws.on('message', (d) => msgs.push(JSON.parse(d)));
    ws.on('close', () => (fechou = true));
    await new Promise((ok) => ws.on('open', ok));
    const esperar = async (filtro) => {
      for (let i = 0; i < 100; i++) {
        const m = msgs.find(filtro);
        if (m) return m;
        await new Promise((ok) => setTimeout(ok, 20));
      }
      throw new Error('tempo esgotado');
    };
    return { ws, esperar, fechou: () => fechou };
  };
  try {
    const c = await conectar();
    c.ws.send(JSON.stringify({ t: 'entrar', nome: 'Esper', race: 'acron', classe: 'functional' }));
    const boas = await c.esperar((m) => m.t === 'bemvindo');
    const snap = await c.esperar((m) => m.t === 'snap');
    assert.equal(snap.me.classe, 'functional');
    assert.equal(snap.me.tier, 0);
    assert.equal(snap.me.maxEn, naveDe('acron', 'functional', 0).energia);
    assert.equal(snap.ents.find((e) => e.id === boas.id).classe, 'functional');
    c.ws.close();

    for (const [race, codigo] of [
      ['mechan', 'raca_bloqueada'],
      ['xyz', 'raca_invalida'],
    ]) {
      const r = await conectar();
      r.ws.send(JSON.stringify({ t: 'entrar', nome: 'Recusado', race, classe: 'assault' }));
      assert.deepEqual(await r.esperar((m) => m.t === 'erro'), { t: 'erro', codigo });
      for (let i = 0; i < 50 && !r.fechou(); i++) await new Promise((ok) => setTimeout(ok, 20));
      assert.ok(r.fechou(), 'o servidor fecha a conexão');
    }
    assert.equal([...srv.world.players.values()].some((j) => j.nome === 'Recusado'), false, 'ninguém entrou');
  } finally {
    await srv.fechar();
  }
});

test('naves: evoluir compra a próxima nave da linha (plataforma, nível, ouro, ordem e máximo)', () => {
  const w = mundo();
  const j = w.addPlayer('A', 'acron', 'mobile');
  j.ouro = 10000;
  assert.equal(evoluir(w, j, 'casco').codigo, 'invalido', 'os marcos antigos não existem mais');
  assert.equal(evoluir(w, j).codigo, 'nao_pousado', 'voando');
  pousar(j, 'loja');
  assert.equal(evoluir(w, j).codigo, 'nao_pousado', 'na Loja não se evolui');
  pousar(j, 'evolucao', 1 - j.time);
  assert.equal(evoluir(w, j).codigo, 'nao_pousado', 'Evolução do outro time');
  pousar(j, 'evolucao');
  assert.equal(evoluir(w, j).codigo, 'nivel_insuficiente', 'nível 1');
  j.nivel = 5;
  j.ouro = PRECO_POR_TIER[1] - 1;
  assert.equal(evoluir(w, j).codigo, 'ouro_insuficiente');
  assert.equal(j.tier, 0);
  j.ouro = PRECO_POR_TIER[1];
  w.tirarEventos();
  assert.equal(evoluir(w, j).ok, true);
  assert.equal(j.ouro, 0);
  assert.equal(j.tier, 1);
  const tracker = naveDe('acron', 'mobile', 1);
  assert.equal(j.ship.tier, 1);
  assert.equal(j.ship.velocidade, tracker.velocidade);
  assert.equal(j.ship.maxHp, hpMaxDoNivel(tracker.hp, 5));
  assert.equal(j.ship.maxEn, tracker.energia);
  assert.deepEqual(
    w.tirarEventos().find((e) => e.e === 'nave'),
    { e: 'nave', id: j.id, nome: 'A', time: j.time, tier: 1, nave: 'Tracker' },
  );
  assert.equal(w.entidades().find((e) => e.id === j.id).tier, 1, 'os outros veem a nave nova');
  assert.equal(w.snapshotPara(j, [], []).me.tier, 1);

  // Ordem: a próxima pede o nível dela (10), não dá para pular.
  j.ouro = 10000;
  assert.equal(evoluir(w, j).codigo, 'nivel_insuficiente');
  j.nivel = 20;
  for (let tier = 2; tier <= TIER_MAX; tier++) {
    const ouro = j.ouro;
    assert.equal(evoluir(w, j).ok, true, `tier ${tier}`);
    assert.equal(j.tier, tier, 'uma nave por vez');
    assert.equal(j.ouro, ouro - PRECO_POR_TIER[tier]);
  }
  assert.equal(j.ship.velocidade, naveDe('acron', 'mobile', TIER_MAX).velocidade);
  const ouro = j.ouro;
  assert.equal(evoluir(w, j).codigo, 'limite', 'a Sephiros é a última');
  assert.equal(j.ouro, ouro, 'limite não cobra');
});

test('naves: trocar de nave mantém a vida perdida e a nave nova volta no renascimento', () => {
  const w = mundo();
  const j = w.addPlayer('A', 'acron', 'assault');
  pousar(j, 'evolucao');
  j.nivel = 5;
  j.ouro = 1000;
  j.ship.hp -= 50; // ferido
  assert.equal(evoluir(w, j).ok, true);
  const paladin = naveDe('acron', 'assault', 1);
  assert.equal(j.ship.maxHp, hpMaxDoNivel(paladin.hp, 5));
  assert.equal(j.ship.hp, j.ship.maxHp - 50, 'o máximo sobe, os 50 perdidos continuam perdidos');

  j.ship.hp = 0;
  j.vivo = false;
  j.respawnTick = w.tick + 1;
  w.step();
  assert.ok(j.vivo);
  assert.equal(j.ship.tier, 1, 'renasce na nave comprada');
  assert.equal(j.ship.maxHp, hpMaxDoNivel(paladin.hp, 5));
  assert.equal(j.ship.hp, j.ship.maxHp);
});

test('naves: a velocidade da nave nova vale no stepShip (servidor e predição)', () => {
  const ranger = createShip('acron', 0, 420, 0, 'mobile', 0);
  const eurus = createShip('acron', 40, 420, 0, 'mobile', 3);
  // O `me` leva a nave inteira: a predição reconstrói a mesma nave a partir dele.
  const predicao = structuredClone(eurus);
  for (let i = 0; i < 3 * SEGUNDO; i++) {
    for (const s of [ranger, eurus, predicao]) stepShip(s, { th: 1, tu: 0 });
  }
  const v = (s) => Math.hypot(s.vx, s.vz);
  assert.ok(Math.abs(v(ranger) - naveDe('acron', 'mobile', 0).velocidade) < 1);
  assert.ok(Math.abs(v(eurus) - naveDe('acron', 'mobile', 3).velocidade) < 1);
  assert.equal(velocidadeBase(eurus), naveDe('acron', 'mobile', 3).velocidade);
  assert.deepEqual(predicao, eurus, 'a predição bate com o servidor');
});

test('naves: a regeneração de energia vem da nave', () => {
  const warrior = createShip('acron', 0, 420, 0, 'assault', 0);
  const esper = createShip('acron', 40, 420, 0, 'functional', 0);
  for (const s of [warrior, esper]) s.en = 0;
  for (let i = 0; i < SEGUNDO; i++) for (const s of [warrior, esper]) stepShip(s, { th: 0, tu: 0 });
  assert.ok(Math.abs(warrior.en - naveDe('acron', 'assault', 0).regenEnergia) < 1e-6, String(warrior.en));
  assert.ok(Math.abs(esper.en - naveDe('acron', 'functional', 0).regenEnergia) < 1e-6, String(esper.en));
});

test('naves: Bellico regenera voando, mesmo levando dano; as outras não', () => {
  const w = mundo();
  const b = w.addPlayer('B', 'bellico', 'assault');
  const a = w.addPlayer('A', 'acron', 'assault');
  for (const [j, dx] of [[b, 0], [a, 60]]) {
    Object.assign(j.ship, { x: CAMPO.x + dx, z: CAMPO.z });
    j.ship.hp = 100;
    j.ultimoDano = w.tick; // acabou de levar dano
  }
  for (let i = 0; i < SEGUNDO; i++) w.step();
  const esperado = 100 + naveDe('bellico', 'assault', 0).regenHpVoo * SEGUNDO * DT;
  assert.ok(Math.abs(b.ship.hp - esperado) < 1e-6, `${b.ship.hp} vs ${esperado}`);
  assert.equal(a.ship.hp, 100, 'a Acron não regenera voando');
});

test('naves: pousada e parada fora da base, a nave conserta o regenHpPousada dela', () => {
  const w = mundo();
  const j = w.addPlayer('A', 'acron', 'mobile');
  // Numa plataforma de pouso da jungle (fora da base: sem a cura rápida da base).
  const a = PLATAFORMAS_POUSO[0];
  Object.assign(j.ship, { x: a.x, z: a.z, vx: 0, vz: 0, pousado: true });
  j.protegidoAte = Infinity;
  j.ship.hp = 50;
  j.ultimoDano = -1e6;
  for (let i = 0; i < SEGUNDO; i++) w.step();
  const esperado = 50 + naveDe('acron', 'mobile', 0).regenHpPousada * SEGUNDO * DT;
  assert.ok(Math.abs(j.ship.hp - esperado) < 1e-6, `${j.ship.hp} vs ${esperado}`);
});

test('naves: a nave comprada zera na partida seguinte (raça e classe ficam)', () => {
  const w = mundo({ duracaoPartidaS: 2, intervaloFimS: 1 });
  const j = w.addPlayer('A', 'shrewdo', 'functional');
  w.step();
  pousar(j, 'evolucao');
  j.nivel = 10;
  j.ouro = 5000;
  assert.equal(evoluir(w, j).ok, true);
  assert.equal(evoluir(w, j).ok, true);
  assert.equal(j.ship.tier, 2);
  for (let i = 0; i < SEGUNDO * 10 && w.partida.numero < 2; i++) w.step();
  assert.equal(w.partida.numero, 2);
  assert.equal(j.tier, 0);
  assert.equal(j.ship.tier, 0);
  assert.equal(j.classe, 'functional', 'a classe é da entrada, não da partida');
  assert.equal(j.ship.race, 'shrewdo');
  const chaos = naveDe('shrewdo', 'functional', 0);
  assert.equal(j.ship.maxHp, chaos.hp);
  assert.equal(j.ship.maxEn, chaos.energia);
  assert.equal(j.ship.velocidade, chaos.velocidade);
});
