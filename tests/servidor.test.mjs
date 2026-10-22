import { test } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { iniciar } from '../server/index.js';
import { World, ZONA_SEGURA } from '../server/game.js';
import { createShip, createBullet, WEAPONS, DT, SHIP_RADIUS, ARMAS, IDX_ARMA, armasIniciais, versaoArma, pousadaNaBase } from '../shared/sim.js';
import { BASE, BASES, LANE, SERVICOS, heightAt, noMapaAberto } from '../shared/terrain.js';
import { alturaSolida, pontoLivre } from '../shared/obstaculos.js';
import { CAMPO } from './lugares.mjs';

function conectar(porta) {
  const ws = new WebSocket(`ws://localhost:${porta}/ws`);
  const msgs = [];
  const esperando = [];
  ws.on('message', (d) => {
    const m = JSON.parse(d);
    msgs.push(m);
    for (const e of [...esperando]) {
      if (e.filtro(m)) {
        esperando.splice(esperando.indexOf(e), 1);
        e.ok(m);
      }
    }
  });
  const esperar = (filtro, ms = 3000) =>
    new Promise((ok, falha) => {
      const achou = msgs.find(filtro);
      if (achou) return ok(achou);
      esperando.push({ filtro, ok });
      setTimeout(() => falha(new Error('tempo esgotado')), ms);
    });
  return { ws, msgs, esperar, aberto: new Promise((ok) => ws.on('open', ok)) };
}

test('servidor: entra, anda com comandos e recebe ack', async () => {
  const srv = await iniciar({ porta: 0, world: new World({ preparacaoS: 0, jungle: false, torretas: false }) });
  try {
    const c = conectar(srv.porta);
    await c.aberto;
    c.ws.send(JSON.stringify({ t: 'entrar', nome: '<b>Mateus</b>', race: 'bellico' }));
    const boas = await c.esperar((m) => m.t === 'bemvindo');
    const j = srv.world.players.get(boas.id);
    assert.equal(j.nome, 'bMateusb', 'nome sem HTML');
    assert.equal(j.ship.race, 'bellico');
    const x0 = j.ship.x;
    for (let s = 1; s <= 30; s++) c.ws.send(JSON.stringify({ t: 'in', s, th: 1, tu: 0 }));
    const snap = await c.esperar((m) => m.t === 'snap' && m.ack === 30);
    assert.ok(snap.me.x > x0 + 5, 'andou para frente (+x, rumo à lane)');
    assert.ok(snap.ents.some((e) => e.id === boas.id));
    c.ws.close();
  } finally {
    await srv.fechar();
  }
});

// O ESC do cliente sai da partida só fechando o WebSocket: o servidor tem que tirar
// a nave do mundo, avisar quem ficou e aceitar a mesma pessoa de volta com outra raça.
test('servidor: fechar a conexão (ESC) tira a nave e dá para entrar de novo com outra raça', async () => {
  const srv = await iniciar({ porta: 0, world: new World({ preparacaoS: 0, jungle: false, torretas: false }) });
  const jogadores = async () => (await (await fetch(`http://localhost:${srv.porta}/healthz`)).json()).jogadores;
  try {
    const outro = conectar(srv.porta);
    await outro.aberto;
    outro.ws.send(JSON.stringify({ t: 'entrar', nome: 'Fica', race: 'acron', classe: 'mobile' }));
    await outro.esperar((m) => m.t === 'bemvindo');

    for (const race of ['bellico', 'acron', 'shrewdo']) {
      const c = conectar(srv.porta);
      await c.aberto;
      c.ws.send(JSON.stringify({ t: 'entrar', nome: 'Volta', race }));
      const boas = await c.esperar((m) => m.t === 'bemvindo');
      assert.equal(srv.world.players.get(boas.id).ship.race, race);
      assert.equal(await jogadores(), 2);
      c.ws.close();
      await outro.esperar((m) => m.t === 'snap' && m.ev.some((e) => e.e === 'saiu' && e.id === boas.id));
      assert.equal(srv.world.players.has(boas.id), false, 'a nave saiu do mundo');
      assert.equal(await jogadores(), 1);
    }
    outro.ws.close();
  } finally {
    await srv.fechar();
  }
});

test('servidor: no máximo 4 comandos por tick (sem acelerar o tempo)', () => {
  const w = new World({ preparacaoS: 0, jungle: false, torretas: false });
  const j = w.addPlayer('a', 'shrewdo');
  for (let s = 1; s <= 20; s++) w.pushInput(j.id, { s, th: 1 });
  w.step();
  assert.equal(j.ack, 4);
  w.pushInput(j.id, { s: 2, th: 1 }); // repetido/antigo: ignorado
  w.step();
  assert.equal(j.ack, 8);
});

test('servidor: tiro tira vida, abate dá ouro e o morto renasce na base', () => {
  const w = new World({ preparacaoS: 0, jungle: false, torretas: false });
  const a = w.addPlayer('A', 'acron');
  const b = w.addPlayer('B', 'shrewdo');
  // Leva os dois para longe da zona segura, um na frente do outro.
  a.ship = createShip('acron', CAMPO.x, CAMPO.z, 0);
  b.ship = createShip('shrewdo', CAMPO.x, CAMPO.z - 30, 0);
  a.protegidoAte = b.protegidoAte = 0;
  let seq = 0;
  for (let i = 0; i < 30 * 20 && b.vivo; i++) {
    w.pushInput(a.id, { s: ++seq, f1: true });
    w.step();
  }
  assert.equal(b.vivo, false);
  assert.equal(a.abates, 1);
  assert.ok(a.ouro > 0);
  for (let i = 0; i < 30 * 4; i++) w.step();
  assert.equal(b.vivo, true);
  const casa = BASES[b.time];
  assert.equal(b.time, 1, 'B entrou no time com menos gente');
  assert.ok(Math.hypot(b.ship.x - casa.x, b.ship.z - casa.z) < 80, 'renasceu na base do time dele');
});

test('servidor: ninguém leva dano na zona segura da base', () => {
  const w = new World({ preparacaoS: 0, jungle: false, torretas: false });
  const a = w.addPlayer('A', 'acron');
  a.protegidoAte = 0;
  const hp = a.ship.hp;
  const atirador = createShip('mechan', a.ship.x, a.ship.z + 20, 0);
  w.bullets.push({ ...createBullet(atirador, 'plasma', 999, -1), drone: true });
  for (let i = 0; i < 10; i++) w.step();
  assert.equal(a.ship.hp, hp);
});

test('servidor: nave pousada conserta mais rápido que voando', () => {
  const regenEm = (pousar) => {
    const w = new World({ preparacaoS: 0, jungle: false, torretas: false });
    const j = w.addPlayer('A', 'bellico');
    j.ship.hp = 100;
    let seq = 0;
    if (pousar) w.pushInput(j.id, { s: ++seq, p: true });
    for (let i = 0; i < 30 * 8; i++) {
      w.pushInput(j.id, { s: ++seq });
      w.step();
    }
    return j.ship.hp - 100;
  };
  const voando = regenEm(false);
  const pousada = regenEm(true);
  assert.ok(pousada > voando * 2, `pousada ${pousada} vs voando ${voando}`);
});

test('servidor: pousada e parada na própria base, vida e energia enchem em poucos segundos', () => {
  const w = new World({ preparacaoS: 0, jungle: false, torretas: false });
  const j = w.addPlayer('A', 'acron', 'assault');
  let seq = 0;
  w.pushInput(j.id, { s: ++seq, p: true });
  // Espera tocar o chão parada, depois esvazia vida e energia.
  for (let i = 0; i < 30 * 2; i++) {
    w.pushInput(j.id, { s: ++seq });
    w.step();
  }
  assert.ok(pousadaNaBase(j.ship), 'pousada na base');
  j.ship.hp = 1;
  j.ship.en = 0;
  for (let i = 0; i < 30 * 3.5; i++) {
    w.pushInput(j.id, { s: ++seq });
    w.step();
  }
  assert.equal(j.ship.hp, j.ship.maxHp, 'vida cheia');
  assert.equal(j.ship.en, j.ship.maxEn, 'energia cheia');
  // Voando não vale.
  assert.equal(pousadaNaBase({ ...j.ship, pousado: false }), false);
});

test('servidor: não serve arquivo fora das pastas públicas', async () => {
  const srv = await iniciar({ porta: 0, world: new World({ preparacaoS: 0, jungle: false, torretas: false }) });
  try {
    for (const rota of ['/%2e%2e/package.json', '/shared/%2e%2e/package.json', '/vendor/%2e%2e/%2e%2e/%2e%2e/package.json']) {
      const r = await fetch(`http://localhost:${srv.porta}${rota}`);
      assert.equal(r.status, 404, rota);
    }
    const r = await fetch(`http://localhost:${srv.porta}/`);
    assert.equal(r.status, 200);
    assert.match(await r.text(), /NEW <span>ASTRON<\/span>/);
  } finally {
    await srv.fechar();
  }
});

test('servidor: serve o modelo da nave e o GLTFLoader que o lê', async () => {
  const srv = await iniciar({ porta: 0, world: new World({ preparacaoS: 0, jungle: false, torretas: false }) });
  try {
    const modelo = await fetch(`http://localhost:${srv.porta}/modelos/naves/acron/assault/ulysses.glb`);
    assert.equal(modelo.status, 200);
    assert.equal(modelo.headers.get('content-type'), 'model/gltf-binary');
    // Cabeçalho do glTF binário: "glTF" e versão 2.
    const bytes = new DataView(await modelo.arrayBuffer());
    assert.equal(bytes.getUint32(0, true), 0x46546c67);
    assert.equal(bytes.getUint32(4, true), 2);
    // O loader importa '../utils/BufferGeometryUtils.js': a pasta de addons tem que vir inteira.
    for (const rota of ['/vendor/addons/loaders/GLTFLoader.js', '/vendor/addons/utils/BufferGeometryUtils.js']) {
      const r = await fetch(`http://localhost:${srv.porta}${rota}`);
      assert.equal(r.status, 200, rota);
    }
    const fora = await fetch(`http://localhost:${srv.porta}/vendor/addons/%2e%2e/%2e%2e/%2e%2e/package.json`);
    assert.equal(fora.status, 404);
  } finally {
    await srv.fechar();
  }
});

test('servidor: aplica a arma escolhida no comando (e limpa valor inválido)', () => {
  const w = new World({ preparacaoS: 0, jungle: false, torretas: false });
  const j = w.addPlayer('A', 'acron');
  const [z, x] = armasIniciais('acron');
  const circular = IDX_ARMA.o111009; // Feixe Circular, Acron Assault
  // Sem comprar na Loja, o Feixe Circular não está na posse: fica no de fábrica.
  w.pushInput(j.id, { s: 1, f1: true, a: circular });
  w.step();
  assert.equal(j.ship.encaixes[0], z);
  // Comprado na Loja (vira uma instância do inventário), o comando o escolhe pelo id
  // da instância: sai o circular (oito feixes).
  const sv = SERVICOS.find((x) => x.servico === 'loja' && x.time === j.time);
  Object.assign(j.ship, { x: sv.x, z: sv.z, vx: 0, vz: 0, pousado: true });
  j.ouro = 10000;
  assert.equal(w.pedido(j.id, { t: 'comprar', item: ARMAS[circular] }).ok, true);
  const inst = j.inv.at(-1).id;
  j.ship.pousado = false; // decola (pousada não atira)
  for (let s = 2; s < 32; s++) {
    w.pushInput(j.id, { s });
    w.step();
  }
  w.bullets.length = 0;
  w.tirarEventos();
  w.pushInput(j.id, { s: 32, f1: true, a: inst });
  w.step();
  assert.equal(j.ship.encaixes[0], circular);
  assert.deepEqual(w.bullets.map((b) => b.kind), Array(8).fill('o111009'));
  const tiros = w.tirarEventos().filter((e) => e.e === 'tiro');
  assert.equal(tiros.length, 8, 'os tiros vão para os outros clientes');

  const k = w.addPlayer('B', 'acron');
  k.ship = createShip('acron', j.ship.x + 40, j.ship.z, 0);
  w.bullets.length = 0;
  w.mineradores.limpar();
  w.pushInput(k.id, { s: 1, f1: true, a: 9999, a2: -3 });
  w.step();
  assert.equal(k.ship.encaixes[0], z);
  assert.ok(w.bullets.length && w.bullets.every((b) => b.kind === ARMAS[z]));
  assert.equal(k.ship.encaixes[1], x, 'X inválido cai na de fábrica');
});

test('servidor: cada projétil do Feixe Duplo tira o dano dele', () => {
  const w = new World({ preparacaoS: 0, jungle: false, torretas: false });
  const a = w.addPlayer('A', 'shrewdo');
  const b = w.addPlayer('B', 'acron');
  a.ship = createShip('shrewdo', CAMPO.x, CAMPO.z, 0);
  b.ship = createShip('acron', CAMPO.x, CAMPO.z - 30, 0);
  a.protegidoAte = b.protegidoAte = 0;
  const hp = b.ship.hp;
  w.pushInput(a.id, { s: 1, f1: true });
  for (let i = 0; i < 10; i++) w.step();
  assert.equal(hp - b.ship.hp, 2 * versaoArma(IDX_ARMA.o311001, 1).golpe.dano, 'os dois acertaram');
});

/** Mundo com dois jogadores fora da zona segura: A atira em B, 20 m à frente (B Acron, sem regenerar voando). */
function duelo() {
  const w = new World({ preparacaoS: 0, jungle: false, torretas: false });
  const a = w.addPlayer('A', 'shrewdo');
  const b = w.addPlayer('B', 'acron');
  a.ship = createShip('shrewdo', CAMPO.x, CAMPO.z, 0);
  b.ship = createShip('acron', CAMPO.x, CAMPO.z - 20, 0);
  a.protegidoAte = b.protegidoAte = 0;
  /** Põe um projétil da arma `kind` saindo de A, como se A tivesse atirado. */
  const tiro = (kind) => w.bullets.push(createBullet(a.ship, kind, 1000 + w.tick, a.id));
  return { w, a, b, tiro };
}

// Feixe de Magma (Shrewdo): pouco dano no impacto e dreno de HP por 5 s.
const MAGMA = 'o311007';
const golpeMagma = versaoArma(MAGMA, 1).golpe;
const DRENO = golpeMagma.efeitos[0];

test('servidor: dreno tira vida aos poucos e para no fim da duração', () => {
  const { w, b, tiro } = duelo();
  const hp0 = b.ship.hp;
  tiro(MAGMA);
  w.step(); // acerta já no primeiro passo
  assert.equal(b.drenoTicks, Math.round(30 * DRENO.dur), 'ficou drenando');
  assert.equal(w.entidades().find((e) => e.id === b.id).dreno, true, 'todos veem o dreno');
  assert.ok(Math.abs(b.ship.hp - (hp0 - golpeMagma.dano)) < 1e-9, 'no impacto, só o dano do impacto');
  w.step();
  assert.ok(Math.abs(b.ship.hp - (hp0 - golpeMagma.dano - DRENO.dps * DT)) < 1e-9, `um tick de dreno: ${b.ship.hp}`);
  for (let i = 0; i < 30 * DRENO.dur + 30; i++) w.step();
  const total = golpeMagma.dano + DRENO.dps * DRENO.dur;
  assert.ok(Math.abs(hp0 - b.ship.hp - total) < 1e-6, `perdeu ${hp0 - b.ship.hp}, esperado ${total}`);
  assert.equal(b.drenoTicks, 0);
  assert.equal(w.entidades().find((e) => e.id === b.id).dreno, false);
});

test('servidor: acertar o dreno de novo renova a duração, sem empilhar', () => {
  const { w, b, tiro } = duelo();
  tiro(MAGMA);
  w.step();
  for (let i = 0; i < 60; i++) w.step(); // 2 s drenando
  tiro(MAGMA);
  w.step();
  assert.equal(b.drenoTicks, Math.round(30 * DRENO.dur), 'voltou para a duração cheia');
  const hp = b.ship.hp;
  for (let i = 0; i < 30; i++) w.step();
  assert.ok(Math.abs(hp - b.ship.hp - DRENO.dps) < 1e-6, `1 s com dois acertos tira ${hp - b.ship.hp}, não o dobro`);
});

test('servidor: dreno não age na zona segura (nem na proteção de nascimento)', () => {
  const w = new World({ preparacaoS: 0, jungle: false, torretas: false });
  const j = w.addPlayer('A', 'acron');
  j.protegidoAte = 0;
  j.drenoTicks = 30 * 4;
  j.drenoDono = -1;
  j.drenoDps = 5;
  const hp = j.ship.hp;
  for (let i = 0; i < 30 * 2; i++) w.step();
  assert.equal(j.ship.hp, hp, 'na base não perde vida');
  assert.ok(j.drenoTicks < 30 * 4, 'mas o tempo do dreno corre');

  const { w: w2, b, tiro } = duelo();
  b.protegidoAte = w2.tick + 1000; // acabou de nascer
  const hp2 = b.ship.hp;
  tiro(MAGMA);
  for (let i = 0; i < 60; i++) w2.step();
  assert.equal(b.ship.hp, hp2);
});

test('servidor: se o dreno matar, o abate e o ouro vão para quem atirou', () => {
  const { w, a, b, tiro } = duelo();
  tiro(MAGMA);
  w.step();
  b.ship.hp = 0.5; // morre pelo dreno, não pelo impacto
  for (let i = 0; i < 30 && b.vivo; i++) w.step();
  assert.equal(b.vivo, false);
  assert.equal(a.abates, 1);
  assert.ok(a.ouro > 0);
  assert.equal(b.mortes, 1);
  const morte = w.tirarEventos().find((e) => e.e === 'morte');
  assert.equal(morte.por, a.id);
  assert.equal(b.drenoTicks, 0, 'morto não segue drenando');
});

test('servidor: Canhão Freio deixa o alvo lento, e o snapshot leva isso', () => {
  const { w, b, tiro } = duelo();
  const freio = versaoArma('o312009', 1).golpe.efeitos[0];
  tiro('o312009');
  for (let i = 0; i < 10 && !(b.ship.lento > 0); i++) w.step(); // o canhão é lento: 2 passos
  assert.equal(b.ship.lento, freio.dur);
  assert.equal(b.ship.lentoMult, freio.mult);
  assert.equal(w.entidades().find((e) => e.id === b.id).lento, true);
  assert.equal(w.snapshotPara(b, [], []).me.lento, freio.dur, 'me leva o lento para a predição');
  // O lento corre nos passos da própria nave (comandos), como na predição.
  for (let s = 1; s <= 30 * freio.dur + 5; s++) {
    w.pushInput(b.id, { s, th: 1 });
    w.step();
  }
  assert.equal(b.ship.lento, 0);
  assert.equal(w.entidades().find((e) => e.id === b.id).lento, false);
});

test('servidor: monstros nascem nos acampamentos, buffs e poço, em chão livre e fora das bases e da lane', () => {
  const ja = { primeiroS: 0 };
  const w = new World({ preparacaoS: 0, temposJungle: { acampamento: ja, ataque: ja, medusa: ja, sonda: ja } });
  w.addPlayer('A', 'acron');
  w.step();
  w.step();
  const monstros = w.monstros.filter((m) => m.vivo);
  assert.equal(monstros.length, 8 * 3.5 + 2 + 1, '28 dos acampamentos, 2 SN-4 e a Medusa (a sonda espera a Medusa morrer)');
  let oeste = 0;
  for (const m of monstros) {
    const { x, z } = m.ship;
    assert.ok(noMapaAberto(x, z), `${m.esp} fora do chão (${x.toFixed(0)}, ${z.toFixed(0)})`);
    assert.ok(pontoLivre(x, z), `${m.esp} com folga das rochas`);
    assert.equal(alturaSolida(x, z, SHIP_RADIUS), heightAt(x, z), 'fora de construção');
    for (const b of BASES) assert.ok(Math.hypot(x - b.x, z - b.z) > ZONA_SEGURA + 100, 'longe das bases');
    assert.ok(Math.abs(z - LANE.z) > LANE.meiaLargura, 'fora da lane');
    if (m.esp !== 'medusa' && x < 0) oeste++;
  }
  assert.equal(oeste, 14 + 1, 'metade de cada lado (14 dos acampamentos e um SN-4; a Medusa fica no meio)');
});

// Cada base protege o próprio time (a do outro time não: ver partida.test.mjs).
test('servidor: a zona segura cobre as duas bases, cada uma para o seu time', () => {
  assert.ok(ZONA_SEGURA >= BASE.raio);
  for (const b of BASES) {
    const w = new World({ preparacaoS: 0, jungle: false, torretas: false });
    const primeiro = w.addPlayer('A', 'acron');
    const j = b.time === 0 ? primeiro : w.addPlayer('B', 'acron');
    assert.equal(j.time, b.time);
    j.ship = createShip('acron', b.x + 50, b.z, 0);
    j.protegidoAte = 0;
    const hp = j.ship.hp;
    const atirador = createShip('mechan', j.ship.x, j.ship.z + 20, 0);
    w.bullets.push({ ...createBullet(atirador, 'plasma', 999, -1), drone: true });
    for (let i = 0; i < 10; i++) w.step();
    assert.equal(j.ship.hp, hp, `base ${b.time}`);
  }
});

test('servidor: monstro provocado não entra na zona segura atrás de quem fugiu para a base', () => {
  for (const b of BASES) {
    const w = new World({ preparacaoS: 0, jungle: false });
    const j = b.time === 0 ? w.addPlayer('A', 'acron') : (w.addPlayer('X', 'acron'), w.addPlayer('B', 'acron'));
    j.ship = createShip('acron', b.x, b.z, 0);
    // Monstro rápido com território grande, logo na beira da zona segura, com raiva de quem está dentro.
    const m = w.jungle.criarMonstro('xerxes', b.x + Math.sign(-b.x) * (ZONA_SEGURA + 40), b.z, { territorio: 2000 });
    m.raiva.set(j.id, Infinity);
    let maisPerto = Infinity;
    for (let i = 0; i < 30 * 10; i++) {
      w.step();
      maisPerto = Math.min(maisPerto, Math.hypot(m.ship.x - b.x, m.ship.z - b.z));
    }
    assert.ok(maisPerto > ZONA_SEGURA, `entrou na base ${b.time} (chegou a ${maisPerto.toFixed(0)} m)`);
    assert.equal(j.ship.hp, j.ship.maxHp, 'ninguém leva dano na própria base');
  }
});
