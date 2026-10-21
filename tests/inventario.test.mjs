// Inventário e pontos do piloto no servidor (server/servicos.js): o pedido
// {t:'pontos'} e o inventário por instância (j.inv): comprar vai para o
// compartimento sem equipar, {t:'equipar'} em qualquer lugar, {t:'vender'} e
// {t:'evoluirItem'} na própria base, o limite do compartimento, as versões por
// instância e o que zera na partida nova.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { World } from '../server/game.js';
import { iniciar } from '../server/index.js';
import { hpMaxDoNivel } from '../server/progressao.js';
import { naveDe } from '../shared/naves.js';
import { BASES, SERVICOS, PLATAFORMAS_POUSO } from '../shared/terrain.js';
import { EQUIPAMENTOS, versaoEquip, precoEvoluirEquip } from '../shared/equipamentos.js';
import { COMPARTIMENTO_MAX, ARMA_COPIAS_MAX, precoArma, armasAVenda } from '../shared/loja.js';
import { PONTO_MAX, efeitoDosPontos, somaEquipamento } from '../shared/status.js';
import { ARMAS, IDX_ARMA, armasIniciais } from '../shared/sim.js';

const SEGUNDO = 30;
const ESCUDO = 'e330010'; // Escudo Neutron Op. (todas as classes)
const ESCUDO_2 = 'e330011'; // Escudo Neutron Ph.
const ESCUDO_MAXIMO = 'e330001'; // Escudo Máximo Op. (só Assault)
const ARMADURA = 'e320012'; // Armadura de Alcânio (geral, todas as classes)
const REFORCO = 'e340025'; // Reforço Op.
const DURABILIDADE = 'e340001'; // Potenciador de Durabilidade
const ENERGIA = 'e340004'; // Potenciador de Energia

function mundo(opcoes = {}) {
  const w = new World({ jungle: false, torretas: false, ...opcoes });
  w.mineradores.passo = () => {};
  return w;
}

/** Pousada e parada no ponto. */
function pousarEm(j, x, z) {
  Object.assign(j.ship, { x, z, vx: 0, vz: 0, pousado: true });
}
/** Pousada e parada na plataforma `servico` do time (padrão: o do piloto). */
function pousar(j, servico, time = j.time) {
  const sv = SERVICOS.find((s) => s.servico === servico && s.time === time);
  pousarEm(j, sv.x, sv.z);
}

const comprar = (w, j, item) => w.pedido(j.id, { t: 'comprar', item });
const equipar = (w, j, slot, inst) => w.pedido(j.id, { t: 'equipar', slot, inst });
const vender = (w, j, inst) => w.pedido(j.id, { t: 'vender', inst });
const evoluir = (w, j, inst) => w.pedido(j.id, { t: 'evoluirItem', inst });
/** Compra e devolve o id da instância nova (falha o teste se a compra falhar). */
function novo(w, j, chave) {
  assert.equal(comprar(w, j, chave).ok, true, chave);
  return j.inv.at(-1).id;
}
const inst = (j, id) => j.inv.find((x) => x.id === id);
/** A primeira arma à venda da raça e classe que não é de fábrica. */
const compravel = (race, classe) => armasAVenda(race, classe).find((a) => !armasIniciais(race).includes(a));
/** Quantos itens há no compartimento, pelo `me` (o que o cliente vê). */
function noCompartimento(w, j) {
  const me = w.snapshotPara(j, [], []).me;
  const naNave = new Set([me.equipado.escudo, me.equipado.armadura, ...me.equipado.pot]);
  return me.inv.filter((x) => (x.tipo === 'arma' ? !me.encInst.includes(x.id) : !naNave.has(x.id))).length;
}
const pontos = (w, j, atributo, qtd) => w.pedido(j.id, { t: 'pontos', atributo, qtd });

test('pontos: 10 por nível, máximo 99 em cada, põe o que couber e vale em qualquer lugar', () => {
  const w = mundo();
  const j = w.addPlayer('A', 'shrewdo', 'functional');
  assert.deepEqual(w.snapshotPara(j, [], []).me.pontos, { durabilidade: 0, energia: 0, fisico: 0, eletrico: 0, laser: 0 });
  assert.equal(w.snapshotPara(j, [], []).me.pontosLivres, 10, 'no nível 1 já há 10');

  assert.deepEqual(pontos(w, j, 'eletrico'), { t: 'resultado', acao: 'pontos', item: 'eletrico', ok: true }, 'qtd padrão 1');
  assert.equal(j.pontos.eletrico, 1);
  assert.equal(pontos(w, j, 'laser', 50).ok, true, 'pede 50, põe os 9 que sobram');
  assert.equal(j.pontos.laser, 9);
  assert.deepEqual(pontos(w, j, 'fisico'), { t: 'resultado', acao: 'pontos', item: 'fisico', ok: false, codigo: 'sem_pontos' });

  for (const [atributo, qtd] of [['forca', 1], ['energia', 0], ['energia', 100], ['energia', 1.5], ['energia', '3'], [null, 1], ['__proto__', 1]]) {
    assert.equal(pontos(w, j, atributo, qtd).codigo, 'invalido', `${atributo} ${qtd}`);
  }

  // Nível 25: 250 pontos; 99 no máximo por atributo.
  j.nivel = 25;
  assert.equal(w.snapshotPara(j, [], []).me.pontosLivres, 240);
  assert.equal(pontos(w, j, 'energia', 99).ok, true);
  assert.equal(pontos(w, j, 'energia').codigo, 'maximo');
  assert.equal(pontos(w, j, 'laser', 99).ok, true);
  assert.equal(j.pontos.laser, PONTO_MAX, 'só completa até 99');

  // Morto e voando também distribui.
  j.vivo = false;
  assert.equal(pontos(w, j, 'fisico', 5).ok, true);
  assert.equal(j.pontos.fisico, 5);
});

test('pontos: Energia sobe a energia máxima e a regeneração; o poder vai para o status', () => {
  const w = mundo();
  const j = w.addPlayer('A', 'shrewdo', 'functional');
  const nave = naveDe('shrewdo', 'functional', 0);
  j.nivel = 5;
  const en0 = j.ship.maxEn;
  const regen0 = j.ship.regenEn;
  assert.equal(pontos(w, j, 'energia', 20).ok, true);
  assert.equal(pontos(w, j, 'eletrico', 30).ok, true);
  const ef = efeitoDosPontos('shrewdo', 'functional', j.pontos, nave.energia);
  assert.equal(j.ship.maxEn, Math.round(en0 + ef.energia));
  assert.ok(Math.abs(j.ship.regenEn - (regen0 + ef.regenEn)) < 1e-9);
  assert.equal(j.ship.en, j.ship.maxEn, 'a energia sobe junto com o máximo (estava cheia)');
  j.ship.en = 10;
  j.nivel = 6;
  const max = j.ship.maxEn;
  assert.equal(pontos(w, j, 'energia', 2).ok, true);
  assert.ok(Math.abs(j.ship.en - (10 + j.ship.maxEn - max)) < 1e-9, 'só soma a diferença, não enche');
  const me = w.snapshotPara(j, [], []).me;
  assert.ok(Math.abs(me.status.poder.eletrico - 0.78) < 1e-9, 'Shrewdo Functional: 2,6% por ponto');
  assert.equal(me.status.poder.laser, 0);
  assert.equal(me.pontosLivres, 8, '60 do nível 6 menos 52');
});

test('pontos: Durabilidade sobe o HP máximo e a regeneração de HP em voo e pousada', () => {
  const w = mundo();
  const j = w.addPlayer('A', 'acron', 'assault');
  const nave = naveDe('acron', 'assault', 0);
  const hp0 = j.ship.maxHp; // nível 1: os 10 pontos dele
  const voo0 = j.ship.regenHpVoo;
  const pousada0 = j.ship.regenHpPousada;
  j.ship.hp = 50;
  assert.equal(pontos(w, j, 'durabilidade', 10).ok, true);
  const ef = efeitoDosPontos('acron', 'assault', j.pontos, nave.energia, nave.hp);
  assert.ok(ef.hp > 0 && ef.regenHp > 0);
  assert.equal(j.ship.maxHp, Math.round(hp0 + ef.hp));
  assert.ok(Math.abs(j.ship.regenHpVoo - (voo0 + ef.regenHp)) < 1e-9);
  assert.ok(Math.abs(j.ship.regenHpPousada - (pousada0 + ef.regenHp)) < 1e-9);
  assert.ok(Math.abs(j.ship.hp - (50 + j.ship.maxHp - hp0)) < 1e-9, 'só soma a diferença, não enche');
  const me = w.snapshotPara(j, [], []).me;
  assert.equal(me.pontos.durabilidade, 10);
  assert.equal(me.maxHp, j.ship.maxHp);
  assert.equal(me.pontosLivres, 0);
});

test('inventário: comprar vai para o compartimento, sem equipar; arma até duas cópias, equipamento repete', () => {
  const w = mundo();
  const j = w.addPlayer('A', 'bellico', 'mobile');
  // Começa com as duas de fábrica, nos encaixes: compartimento vazio.
  assert.deepEqual(
    j.inv.map((x) => [x.tipo, x.chave, x.nivel, x.pago, x.fabrica]),
    armasIniciais('bellico').map((a) => ['arma', ARMAS[a], 1, 0, true]),
  );
  assert.equal(noCompartimento(w, j), 0);
  pousar(j, 'loja');
  j.ouro = 5000;
  assert.equal(comprar(w, j, ESCUDO_MAXIMO).codigo, 'invalido', 'escudo só da Assault');
  assert.equal(j.ouro, 5000);

  const e1 = novo(w, j, ESCUDO);
  assert.equal(j.ouro, 5000 - EQUIPAMENTOS[ESCUDO].preco);
  assert.deepEqual(inst(j, e1), { id: e1, tipo: 'equip', chave: ESCUDO, nivel: 1, pago: EQUIPAMENTOS[ESCUDO].preco });
  assert.equal(j.equipado.escudo, null, 'não equipa sozinho');
  assert.equal(j.ship.maxEscudo, 0);
  const e2 = novo(w, j, ESCUDO);
  assert.ok(e2 > e1, 'o mesmo escudo de novo é outra instância, com id maior');
  const arma = compravel('bellico', 'mobile');
  const a1 = novo(w, j, ARMAS[arma]);
  assert.equal(inst(j, a1).pago, precoArma(arma));
  assert.ok(j.ship.armas.includes(arma), 'a arma comprada já pode ir num encaixe');
  const a2 = novo(w, j, ARMAS[arma]);
  assert.ok(a2 > a1, 'a segunda cópia é outra instância');
  assert.equal(comprar(w, j, ARMAS[arma]).codigo, 'ja_possui', `arma, até ${ARMA_COPIAS_MAX} cópias`);
  const fz = ARMAS[armasIniciais('bellico')[0]];
  assert.equal(comprar(w, j, fz).ok, true, 'a de fábrica conta como a primeira: compra a segunda');
  assert.equal(comprar(w, j, fz).codigo, 'ja_possui', 'e a terceira não');
  assert.deepEqual(j.ship.armas, [...new Set(j.ship.armas)], 's.armas não repete as cópias');
  assert.equal(noCompartimento(w, j), 5, 'dois escudos, duas cópias da comprada e a cópia da de fábrica');
  const me = w.snapshotPara(j, [], []).me;
  assert.equal(me.compMax, COMPARTIMENTO_MAX);
  assert.deepEqual(me.inv, j.inv);
  assert.notEqual(me.inv[0], j.inv[0], 'cópia, não a própria posse');
  assert.equal(me.copias, undefined);
});

test('inventário: compartimento cheio recusa comprar e tirar da nave (cheio)', () => {
  const w = mundo();
  const j = w.addPlayer('A', 'acron', 'functional');
  pousar(j, 'loja');
  j.ouro = 100000;
  const pot = novo(w, j, REFORCO);
  assert.equal(equipar(w, j, 'pot1', pot).ok, true);
  for (let i = 0; i < COMPARTIMENTO_MAX; i++) novo(w, j, DURABILIDADE);
  assert.equal(noCompartimento(w, j), COMPARTIMENTO_MAX);
  const ouro = j.ouro;
  assert.deepEqual(comprar(w, j, ENERGIA), { t: 'resultado', acao: 'comprar', item: ENERGIA, ok: false, codigo: 'cheio' });
  assert.equal(j.ouro, ouro, 'recusa não cobra');
  assert.equal(comprar(w, j, 'reparo').ok, true, 'consumível não ocupa o compartimento');
  assert.deepEqual(equipar(w, j, 'pot1', null), { t: 'resultado', acao: 'equipar', item: 'pot1', ok: false, codigo: 'cheio' });
  assert.equal(j.equipado.pot[0], pot);
  // Trocar por outro do compartimento vale (um sai, outro entra).
  const outro = j.inv.at(-1).id;
  assert.equal(equipar(w, j, 'pot1', outro).ok, true);
  assert.equal(j.equipado.pot[0], outro);
  // Pôr no encaixe vazio abre lugar; aí tirar vale.
  assert.equal(equipar(w, j, 'pot2', pot).ok, true);
  assert.equal(equipar(w, j, 'pot2', null).ok, true);
  assert.equal(noCompartimento(w, j), COMPARTIMENTO_MAX);
});

test('inventário: equipar vale em qualquer lugar, vivo; categoria, classe e instância', () => {
  const w = mundo();
  const j = w.addPlayer('A', 'acron', 'functional');
  pousar(j, 'loja');
  j.ouro = 5000;
  const esc = novo(w, j, ESCUDO);
  const esc2 = novo(w, j, ESCUDO_2);
  const arm = novo(w, j, ARMADURA);
  const r = novo(w, j, REFORCO);
  const d = novo(w, j, DURABILIDADE);
  // Longe da base, voando (até na plataforma de pouso, na base do outro time...).
  const a = PLATAFORMAS_POUSO[0];
  Object.assign(j.ship, { x: a.x + 40, z: a.z, vx: 30, pousado: false });
  assert.deepEqual(equipar(w, j, 'escudo', esc), { t: 'resultado', acao: 'equipar', item: 'escudo', ok: true });
  assert.equal(j.ship.maxEscudo, versaoEquip(ESCUDO, 1).maxEscudo);
  assert.equal(j.ship.escudo, 0, 'escudo posto começa vazio e recupera com o tempo');
  pousarEm(j, BASES[1 - j.time].x, BASES[1 - j.time].z);
  const hp0 = j.ship.maxHp;
  assert.equal(equipar(w, j, 'armadura', arm).ok, true);
  assert.equal(j.ship.maxHp, Math.round(hp0 + versaoEquip(ARMADURA, 1).hp), 'a armadura sobe o HP máximo');
  assert.equal(equipar(w, j, 'pot1', r).ok, true);
  assert.equal(equipar(w, j, 'pot2', d).ok, true);
  assert.deepEqual(j.equipado, { escudo: esc, armadura: arm, pot: [r, d] });
  assert.deepEqual(w.snapshotPara(j, [], []).me.equipado, { escudo: esc, armadura: arm, pot: [r, d] });

  // O que está no outro encaixe de potenciador troca de lugar.
  assert.equal(equipar(w, j, 'pot1', d).ok, true);
  assert.deepEqual(j.equipado.pot, [d, r]);
  assert.equal(equipar(w, j, 'pot1', d).ok, true, 'no mesmo encaixe não muda nada');

  // Recusas.
  assert.equal(equipar(w, j, 'pot1', esc2).codigo, 'invalido', 'escudo no encaixe de potenciador');
  assert.equal(equipar(w, j, 'armadura', esc2).codigo, 'invalido');
  assert.equal(equipar(w, j, 'escudo', arm).codigo, 'invalido', 'a armadura está na nave e não é escudo');
  assert.equal(equipar(w, j, 'escudo', j.inv[0].id).codigo, 'invalido', 'arma não vai em encaixe de equipamento');
  assert.equal(equipar(w, j, 'escudo', 999).codigo, 'sem_item');
  for (const [slot, id] of [['pot3', r], [null, r], ['escudo', 'e330010'], ['escudo', 1.5], ['escudo', undefined], ['__proto__', null]]) {
    assert.equal(equipar(w, j, slot, id).codigo, 'invalido', `${slot} ${id}`);
  }
  j.vivo = false;
  assert.equal(equipar(w, j, 'escudo', esc2).codigo, 'invalido', 'morto não equipa');
  j.vivo = true;
  assert.deepEqual(j.equipado, { escudo: esc, armadura: arm, pot: [d, r] }, 'nada mudou com os recusados');
  // De outra classe (não dá para comprar, mas a posse é conferida ao equipar).
  j.inv.push({ id: 900, tipo: 'equip', chave: ESCUDO_MAXIMO, nivel: 1, pago: 0 });
  assert.equal(equipar(w, j, 'escudo', 900).codigo, 'invalido', 'Escudo Máximo é só da Assault');
});

test('inventário: trocar de escudo zera o escudo atual; tirar e pôr o mesmo também não enche', () => {
  const w = mundo();
  const j = w.addPlayer('A', 'shrewdo', 'mobile');
  pousar(j, 'loja');
  j.ouro = 5000;
  const e1 = novo(w, j, ESCUDO);
  const e2 = novo(w, j, ESCUDO_2);
  assert.equal(equipar(w, j, 'escudo', e1).ok, true);
  j.ship.escudo = 50;
  assert.equal(equipar(w, j, 'escudo', e1).ok, true, 'o mesmo: nada muda');
  assert.equal(j.ship.escudo, 50);
  assert.equal(equipar(w, j, 'escudo', e2).ok, true);
  assert.equal(j.ship.escudo, 0, 'trocou: zera');
  j.ship.escudo = 30;
  assert.equal(equipar(w, j, 'escudo', null).ok, true);
  assert.equal(j.ship.maxEscudo, 0);
  assert.equal(equipar(w, j, 'escudo', e2).ok, true);
  assert.equal(j.ship.escudo, 0);
  // Evoluir o escudo da nave sobe o máximo sem encher.
  j.ship.escudo = 30;
  assert.equal(evoluir(w, j, e2).ok, true);
  assert.equal(j.ship.maxEscudo, versaoEquip(ESCUDO_2, 2).maxEscudo);
  assert.equal(j.ship.escudo, 30);
});

test('inventário: dois potenciadores iguais, cada um na sua versão, somam certo', () => {
  const w = mundo();
  const j = w.addPlayer('A', 'acron', 'functional');
  pousar(j, 'loja');
  j.ouro = 100000;
  const p1 = novo(w, j, REFORCO);
  const p2 = novo(w, j, REFORCO);
  for (let v = 2; v <= 5; v++) assert.equal(evoluir(w, j, p1).ok, true);
  assert.equal(equipar(w, j, 'pot1', p1).ok, true);
  assert.equal(equipar(w, j, 'pot2', p2).ok, true);
  assert.deepEqual([inst(j, p1).nivel, inst(j, p2).nivel], [5, 1]);
  const esperado = somaEquipamento([[REFORCO, 5], [REFORCO, 1]], 'functional');
  const so = (v) => versaoEquip(REFORCO, v).efeitos.find((e) => e.tipo === 'poder').valor;
  assert.ok(Math.abs(j.status.poder.laser - (so(5) + so(1))) < 1e-6, `${j.status.poder.laser}`);
  assert.deepEqual(j.status.recarga, esperado.recarga);
  assert.deepEqual(j.status.resist, esperado.resist);
  assert.deepEqual(w.snapshotPara(j, [], []).me.status.poder, esperado.poder);
});

test('inventário: vender dá metade do pago, só do compartimento, na própria base, e nunca a de fábrica', () => {
  const w = mundo();
  const j = w.addPlayer('A', 'bellico', 'assault');
  pousar(j, 'loja');
  j.ouro = 100000;
  const e = novo(w, j, ARMADURA);
  assert.equal(evoluir(w, j, e).ok, true);
  const pago = EQUIPAMENTOS[ARMADURA].preco + precoEvoluirEquip(ARMADURA, 1);
  assert.equal(inst(j, e).pago, pago);
  const arma = compravel('bellico', 'assault');
  const a = novo(w, j, ARMAS[arma]);
  const fabrica = j.inv.find((x) => x.fabrica);

  // Fora da base (voando ou pousado em outro lugar): não.
  j.ship.pousado = false;
  assert.deepEqual(vender(w, j, e), { t: 'resultado', acao: 'vender', item: e, ok: false, codigo: 'nao_pousado' });
  pousar(j, 'loja', 1 - j.time);
  assert.equal(vender(w, j, e).codigo, 'nao_pousado', 'Loja do outro time');
  const obj = PLATAFORMAS_POUSO[0];
  pousarEm(j, obj.x, obj.z);
  assert.equal(vender(w, j, e).codigo, 'nao_pousado', 'plataforma de pouso não é base');
  // No anel da própria base vale (qualquer área de pouso dela).
  pousarEm(j, BASES[j.time].x, BASES[j.time].z);
  assert.equal(vender(w, j, fabrica.id).codigo, 'invalido', 'arma de fábrica não se vende');
  assert.equal(vender(w, j, 999).codigo, 'sem_item');
  assert.equal(equipar(w, j, 'armadura', e).ok, true);
  assert.equal(vender(w, j, e).codigo, 'equipado', 'na nave não');
  assert.equal(equipar(w, j, 'armadura', null).ok, true);
  const ouro = j.ouro;
  assert.equal(vender(w, j, e).ok, true);
  assert.equal(j.ouro, ouro + Math.floor(pago / 2));
  assert.equal(inst(j, e), undefined, 'saiu do inventário');
  assert.equal(vender(w, j, e).codigo, 'sem_item', 'não vende duas vezes');

  // Arma num encaixe Z/X está na nave; no compartimento, vende e sai de s.armas.
  w.pushInput(j.id, { s: 1, a });
  w.step();
  assert.equal(j.ship.encaixes[0], arma);
  assert.deepEqual(j.ship.encInst[0], a, 'o comando escolhe a instância');
  assert.equal(vender(w, j, a).codigo, 'equipado');
  w.pushInput(j.id, { s: 2, a: fabrica.id });
  w.step();
  assert.equal(vender(w, j, a).ok, true);
  assert.ok(!j.ship.armas.includes(arma));
  assert.equal(comprar(w, j, ARMAS[arma]).codigo, 'nao_pousado', 'no anel não compra, só na Loja');
  pousar(j, 'loja');
  assert.equal(comprar(w, j, ARMAS[arma]).ok, true, 'vendida, pode comprar de novo');
});

test('inventário: evoluirItem sobe só aquela instância, soma no pago e para na V8', () => {
  const w = mundo();
  const j = w.addPlayer('A', 'bellico', 'assault');
  pousar(j, 'loja');
  j.ouro = 100000;
  const e1 = novo(w, j, ARMADURA);
  const e2 = novo(w, j, ARMADURA);
  assert.equal(equipar(w, j, 'armadura', e1).ok, true);
  assert.equal(j.nivel, 1);
  let pago = EQUIPAMENTOS[ARMADURA].preco;
  for (let v = 2; v <= 8; v++) {
    const ouro = j.ouro;
    const hpAntes = j.ship.maxHp;
    assert.deepEqual(evoluir(w, j, e1), { t: 'resultado', acao: 'evoluirItem', item: e1, ok: true }, `V${v}`);
    assert.equal(ouro - j.ouro, precoEvoluirEquip(ARMADURA, v - 1));
    pago += precoEvoluirEquip(ARMADURA, v - 1);
    assert.equal(inst(j, e1).nivel, v);
    assert.equal(inst(j, e1).pago, pago);
    assert.ok(j.ship.maxHp > hpAntes, 'a da nave: cada versão dá mais HP na hora');
  }
  assert.equal(evoluir(w, j, e1).codigo, 'limite', 'V8 é a última');
  assert.deepEqual([inst(j, e2).nivel, inst(j, e2).pago], [1, EQUIPAMENTOS[ARMADURA].preco], 'a outra instância não mudou');
  // No compartimento também evolui (sem mexer na nave).
  const hp = j.ship.maxHp;
  assert.equal(evoluir(w, j, e2).ok, true);
  assert.equal(inst(j, e2).nivel, 2);
  assert.equal(j.ship.maxHp, hp);
  j.ouro = 0;
  assert.equal(evoluir(w, j, e2).codigo, 'ouro_insuficiente');
  j.ouro = 10000;
  j.ship.pousado = false;
  assert.equal(evoluir(w, j, e2).codigo, 'nao_pousado');
});

test('inventário: volta a cada renascimento (escudo cheio) e tudo zera na partida nova', () => {
  const w = mundo({ duracaoPartidaS: 2, intervaloFimS: 1 });
  const j = w.addPlayer('A', 'acron', 'assault');
  w.step();
  pousar(j, 'loja');
  j.ouro = 5000;
  const ids = [ESCUDO, ARMADURA, REFORCO].map((k) => novo(w, j, k));
  for (const [slot, id] of [['escudo', ids[0]], ['armadura', ids[1]], ['pot1', ids[2]]]) assert.equal(equipar(w, j, slot, id).ok, true);
  assert.equal(evoluir(w, j, ids[0]).ok, true);
  const armaFabrica = j.inv.find((x) => x.fabrica).id;
  assert.equal(evoluir(w, j, armaFabrica).ok, true);
  const proxId = j.invProx;
  j.nivel = 3;
  assert.equal(pontos(w, j, 'laser', 30).ok, true);
  const hpMax = j.ship.maxHp;

  // Morre e renasce: a mesma build, escudo cheio.
  j.ship.hp = 0;
  j.vivo = false;
  j.respawnTick = w.tick + 1;
  w.step();
  assert.ok(j.vivo);
  assert.equal(j.ship.maxHp, hpMax);
  assert.ok(j.ship.maxEscudo > 0);
  assert.equal(j.ship.escudo, j.ship.maxEscudo, 'renasce com o escudo cheio');
  assert.equal(j.status.poder.laser > 0.2, true, 'pontos e Reforço no poder');

  assert.equal(inst(j, ids[0]).nivel, 2, 'as versões também');
  assert.deepEqual(j.equipado, { escudo: ids[0], armadura: ids[1], pot: [ids[2], null] });

  // Partida seguinte: só as duas de fábrica na V1, nada de equipamento, pontos nem status.
  for (let i = 0; i < SEGUNDO * 10 && w.partida.numero < 2; i++) w.step();
  assert.equal(w.partida.numero, 2);
  assert.deepEqual(
    j.inv.map((x) => [x.tipo, x.chave, x.nivel, x.pago, x.fabrica]),
    armasIniciais('acron').map((a) => ['arma', ARMAS[a], 1, 0, true]),
  );
  assert.ok(j.inv.every((x) => x.id >= proxId), 'os ids não se repetem no mesmo piloto');
  assert.deepEqual(j.ship.nivEnc, [1, 1]);
  assert.deepEqual(j.ship.encInst, j.inv.map((x) => x.id), 'as de fábrica novas nos encaixes');
  assert.deepEqual(j.equipado, { escudo: null, armadura: null, pot: [null, null] });
  assert.deepEqual(j.pontos, { durabilidade: 0, energia: 0, fisico: 0, eletrico: 0, laser: 0 });
  assert.equal(j.ship.maxEscudo, 0);
  assert.equal(j.ship.escudo, 0);
  assert.equal(j.ship.maxHp, hpMaxDoNivel(naveDe('acron', 'assault', 0).hp, 1));
  const me = w.snapshotPara(j, [], []).me;
  assert.equal(me.pontosLivres, 10);
  assert.equal(me.status.poder.laser, 0);
  assert.deepEqual(me.recargaMult, { fisico: 1, laser: 1, eletrico: 1 });
});

test('inventário: pelo WebSocket, pontos, equipar, vender e evoluirItem voltam como resultado e o me traz a build', async () => {
  const world = mundo();
  const srv = await iniciar({ porta: 0, world });
  try {
    const ws = new WebSocket(`ws://localhost:${srv.porta}/ws`);
    const msgs = [];
    ws.on('message', (d) => msgs.push(JSON.parse(d)));
    await new Promise((ok) => ws.on('open', ok));
    const esperar = async (filtro) => {
      for (let i = 0; i < 100; i++) {
        const m = msgs.find(filtro);
        if (m) return m;
        await new Promise((ok) => setTimeout(ok, 20));
      }
      throw new Error('tempo esgotado');
    };
    ws.send(JSON.stringify({ t: 'entrar', nome: 'Inv', race: 'shrewdo', classe: 'functional' }));
    const boas = await esperar((m) => m.t === 'bemvindo');
    ws.send(JSON.stringify({ t: 'pontos', atributo: 'laser', qtd: 4 }));
    assert.deepEqual(await esperar((m) => m.t === 'resultado' && m.acao === 'pontos'), { t: 'resultado', acao: 'pontos', item: 'laser', ok: true });
    ws.send(JSON.stringify({ t: 'equipar', slot: 'escudo', inst: 99 }));
    assert.deepEqual(await esperar((m) => m.t === 'resultado' && m.acao === 'equipar'), {
      t: 'resultado',
      acao: 'equipar',
      item: 'escudo',
      ok: false,
      codigo: 'sem_item',
    });
    const j = world.players.get(boas.id);
    pousar(j, 'loja');
    j.ouro = 1000;
    ws.send(JSON.stringify({ t: 'comprar', item: ESCUDO }));
    await esperar((m) => m.t === 'resultado' && m.item === ESCUDO);
    const id = j.inv.at(-1).id;
    ws.send(JSON.stringify({ t: 'evoluirItem', inst: id }));
    assert.deepEqual(await esperar((m) => m.t === 'resultado' && m.acao === 'evoluirItem'), { t: 'resultado', acao: 'evoluirItem', item: id, ok: true });
    ws.send(JSON.stringify({ t: 'vender', inst: j.inv[0].id }));
    assert.deepEqual(await esperar((m) => m.t === 'resultado' && m.acao === 'vender'), {
      t: 'resultado',
      acao: 'vender',
      item: j.inv[0].id,
      ok: false,
      codigo: 'invalido',
    });
    ws.send(JSON.stringify({ t: 'equipar', slot: 'escudo', inst: id }));
    const snap = await esperar((m) => m.t === 'snap' && m.me.equipado?.escudo === id);
    const me = snap.me;
    assert.deepEqual(me.pontos, { durabilidade: 0, energia: 0, fisico: 0, eletrico: 0, laser: 4 });
    assert.equal(me.pontosLivres, 6);
    assert.equal(me.compMax, COMPARTIMENTO_MAX);
    assert.deepEqual(me.inv.at(-1), { id, tipo: 'equip', chave: ESCUDO, nivel: 2, pago: EQUIPAMENTOS[ESCUDO].preco + precoEvoluirEquip(ESCUDO, 1) });
    assert.equal(me.equip, undefined);
    assert.equal(me.maxEscudo, versaoEquip(ESCUDO, 2).maxEscudo);
    assert.equal(me.regenEscudo, versaoEquip(ESCUDO, 2).regenEscudo);
    assert.ok(me.escudo >= 0 && me.escudo <= me.maxEscudo);
    assert.deepEqual(Object.keys(me.recargaMult).sort(), ['eletrico', 'fisico', 'laser']);
    assert.ok(me.status.resist.laser > 0, 'o escudo Op. dá resistência ao laser');
    const ent = snap.ents.find((e) => e.id === j.id);
    assert.ok(ent.esc >= 0 && ent.esc <= 1, 'a entidade traz a fração do escudo');
    ws.close();
  } finally {
    await srv.fechar();
  }
});
