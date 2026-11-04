// Locutor (public/js/locutor-regras.js + server/game.js): o servidor marca no evento
// 'morte' o First Blood (`primeiro`) e o multi-abate (`multi`), e o cliente escolhe o
// anúncio, a ordem e a cor. As vozes ficam em public/sons/locutor/, cada uma com o degrau
// dela na escada de volume (nivel-sons.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { World } from '../server/game.js';
import { MULTI_JANELA_S } from '../server/progressao.js';
import { createShip, IDX_ARMA } from '../shared/sim.js';
import { CAMPO } from './lugares.mjs';
import {
  ANUNCIOS,
  SONS_LOCUTOR,
  anunciosDaMorte,
  duracaoDaFaixa,
  somDoAnuncio,
  FAIXA_MIN_S,
  FAIXA_DEPOIS_VOZ_S,
} from '../public/js/locutor-regras.js';
import { ALVO_CATEGORIA, alvoDoSom } from '../public/js/nivel-sons.js';

const SEGUNDO = 30; // ticks
const PUBLICO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

function rngFixo(semente = 1) {
  let s = semente;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** Mundo sem monstros nem mineradores com `n` jogadores (times 0, 1, 0, 1...), na jungle do time 0. */
function arena(n, opcoes = {}) {
  const w = new World({ preparacaoS: 0, jungle: false, torretas: false, rng: rngFixo(), ...opcoes });
  w.mineradores.passo = () => {};
  const js = [];
  for (let i = 0; i < n; i++) {
    const j = w.addPlayer('P' + i, 'bellico');
    colocar(j, i);
    js.push(j);
  }
  w.step();
  return { w, js };
}

function colocar(j, i) {
  // Quatro numa fileira de 200 m em x e os outros 300 m para +z (mais para +x é a mineradora).
  j.ship = createShip('bellico', CAMPO.x + (i % 4) * 200, CAMPO.z + Math.floor(i / 4) * 300, 0);
  j.ship.time = j.time;
  j.ship.encaixes = [IDX_ARMA.choque, j.ship.encaixes[1]];
  j.protegidoAte = 0;
}

/** `a` encosta em `alvo` (com 1 de HP) e o derruba com a onda de choque; devolve o evento 'morte'. */
function abater(w, a, alvo) {
  w.tirarEventos();
  Object.assign(a.ship, { x: alvo.ship.x, y: alvo.ship.y, z: alvo.ship.z + 10, vx: 0, vz: 0, cd1: 0, en: a.ship.maxEn });
  alvo.ship.hp = 1;
  a.seq ??= 0;
  w.pushInput(a.id, { s: ++a.seq, f1: true, a: IDX_ARMA.choque });
  w.step();
  const m = w.tirarEventos().find((e) => e.e === 'morte' && e.id === alvo.id);
  assert.ok(m, `${alvo.nome} morreu`);
  return m;
}

function reviver(w, j, i) {
  for (let t = 0; t < 60 * SEGUNDO && !j.vivo; t++) w.step();
  assert.ok(j.vivo, 'renasceu');
  colocar(j, i);
}

test('locutor: First Blood só no primeiro abate de jogador da partida', () => {
  const { w, js } = arena(4);
  const [a, b, c, d] = js;
  assert.equal(abater(w, a, b).primeiro, 1);
  assert.equal(abater(w, c, d).primeiro, undefined, 'o segundo abate da partida não é');
});

test('locutor: First Blood conta na preparação e volta na partida nova', () => {
  const { w, js } = arena(2, { preparacaoS: 30, duracaoPartidaS: 3, intervaloFimS: 1 });
  const [a, b] = js;
  assert.ok(w.partida.emPreparacao, 'em preparação');
  assert.equal(abater(w, a, b).primeiro, 1, 'na preparação');
  const n = w.partida.numero;
  for (let t = 0; t < 120 * SEGUNDO && w.partida.numero === n; t++) w.step();
  assert.equal(w.partida.numero, n + 1, 'partida nova');
  reviver(w, b, 1);
  reviver(w, a, 0);
  assert.equal(abater(w, b, a).primeiro, 1, 'a partida nova tem o seu First Blood');
});

test('locutor: multi-abate soma até MULTI_JANELA_S entre um abate e o seguinte', () => {
  const { w, js } = arena(6);
  const [a, b, , d, , f] = js; // A no time 0; B, D e F no time 1
  assert.equal(abater(w, a, b).multi, undefined, 'um abate não é multi');
  assert.equal(abater(w, a, d).multi, 2, 'Double Kill');
  assert.equal(abater(w, a, f).multi, 3, 'Triple Kill');

  // Fora da janela, recomeça.
  reviver(w, b, 1);
  reviver(w, d, 3);
  for (let t = 0; t < MULTI_JANELA_S * SEGUNDO + 1; t++) w.step();
  assert.equal(abater(w, a, b).multi, undefined, 'passou da janela: conta do 1');
  assert.equal(abater(w, a, d).multi, 2);
});

test('locutor: os anúncios de cada abate, na ordem do Dota', () => {
  const nome = (id) => ({ 1: 'Ana', 2: 'Beto', 3: 'Caio' })[id];
  const quem = { meuId: 1, meuTime: 0, nome };
  const chaves = (e) => anunciosDaMorte({ e: 'morte', tipo: 'jogador', ...e }, quem).map((a) => a.chave);

  assert.deepEqual(chaves({ id: 2, por: 3, time: 1, seqPor: 1 }), [], 'abate comum não anuncia');
  assert.deepEqual(chaves({ id: 2, por: 1, time: 1, seqPor: 1, primeiro: 1 }), ['firstBlood']);
  assert.deepEqual(chaves({ id: 2, por: 1, time: 1, seqPor: 2, multi: 2 }), ['doubleKill']);
  assert.deepEqual(chaves({ id: 2, por: 1, time: 1, seqPor: 3, multi: 3 }), ['tripleKill']);
  assert.deepEqual(chaves({ id: 2, por: 1, time: 1, seqPor: 3, multi: 5 }), ['tripleKill'], '3 ou mais é Triple');
  assert.deepEqual(chaves({ id: 2, por: 1, time: 1, seqPor: 3 }), [], 'a sequência de 3 não anuncia');
  assert.deepEqual(chaves({ id: 2, por: 1, time: 1, seqPor: 4 }), ['dominating']);
  assert.deepEqual(chaves({ id: 2, por: 1, time: 1, seqPor: 5 }), ['unstoppable']);
  assert.deepEqual(chaves({ id: 2, por: 1, time: 1, seqPor: 6 }), ['godlike']);
  assert.deepEqual(chaves({ id: 2, por: 1, time: 1, seqPor: 11 }), ['godlike'], '6 ou mais é Godlike, a cada abate');
  assert.deepEqual(chaves({ id: 2, por: 1, time: 1, seqPor: 4, multi: 2, primeiro: 1 }), ['firstBlood', 'doubleKill', 'dominating']);

  // Monstro, campo de força e morte sem matador não anunciam.
  assert.deepEqual(chaves({ id: 2, por: null, time: 1, motivo: 'campo', primeiro: 1 }), []);
  assert.deepEqual(anunciosDaMorte({ e: 'morte', tipo: 'monstro', id: 9, por: 1, seqPor: 6 }, quem), []);
});

test('locutor: a cor diz de quem foi o feito e a linha de baixo diz quem', () => {
  const nome = (id) => ({ 1: 'Ana', 2: 'Beto', 3: 'Caio', 4: 'Duda' })[id];
  const quem = { meuId: 1, meuTime: 0, nome };
  const um = (e) => anunciosDaMorte({ e: 'morte', tipo: 'jogador', primeiro: 1, ...e }, quem)[0];

  const meu = um({ id: 2, por: 1, time: 1 });
  assert.equal(meu.cor, 'voce');
  assert.equal(meu.texto, 'First Blood');
  assert.equal(meu.sub, 'Você abateu Beto');
  assert.equal(meu.som, 'locutor/first_blood.mp3');
  assert.equal(um({ id: 2, por: 4, time: 1 }).cor, 'aliado', 'Duda (time 0) abateu Beto');
  const contra = um({ id: 1, por: 3, time: 0 });
  assert.equal(contra.cor, 'inimigo');
  assert.equal(contra.sub, 'Caio abateu você');
});

test('locutor: a faixa fica o tempo da voz, com mínimo', () => {
  assert.equal(duracaoDaFaixa(0), FAIXA_MIN_S, 'sem voz');
  assert.equal(duracaoDaFaixa(0.5), FAIXA_MIN_S);
  assert.equal(duracaoDaFaixa(3), 3 + FAIXA_DEPOIS_VOZ_S);
});

test('locutor: toda voz existe e sobe na escada de volume com a intensidade', () => {
  assert.deepEqual(Object.keys(ANUNCIOS).sort(), ['dominating', 'doubleKill', 'firstBlood', 'godlike', 'tripleKill', 'unstoppable']);
  for (const som of SONS_LOCUTOR) {
    assert.ok(existsSync(path.join(PUBLICO, 'sons', som)), `${som} existe`);
    assert.ok(Number.isFinite(alvoDoSom(som)), `${som} tem alvo`);
  }
  const alvo = (chave) => alvoDoSom(somDoAnuncio(chave));
  assert.ok(alvo('firstBlood') < alvo('doubleKill'));
  assert.equal(alvo('doubleKill'), alvo('dominating'));
  assert.ok(alvo('doubleKill') < alvo('tripleKill'));
  assert.equal(alvo('tripleKill'), alvo('unstoppable'));
  assert.ok(alvo('tripleKill') < alvo('godlike'));
  assert.equal(alvoDoSom('locutor/voz_nova.mp3'), ALVO_CATEGORIA.locutor, 'voz sem degrau fica no alvo do locutor');
});
