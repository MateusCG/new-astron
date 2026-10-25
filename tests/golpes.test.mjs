// Famílias de golpe no servidor (server/golpes.js): pelo menos uma arma do
// catálogo do original em cada uma — projétil (canos, área no impacto,
// atravessar, explodir no fim, dividir, teleguiado com mira, onda que cresce),
// nova, mina, mina que atira, campo, efeitos no alvo, dispositivos na própria nave
// (com tempo e de segurar a tecla), suporte em área e os especiais — e que toda
// arma do catálogo dispara sem erro.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../server/game.js';
import { ARMAS, IDX_ARMA, WEAPONS, INPUT_VAZIO, createShip } from '../shared/sim.js';
import { versaoArma, golpeDaArma } from '../shared/armas.js';
import { INVISIVEL_VISTO_M } from '../server/golpes.js';
import { CAMPO } from './lugares.mjs';

const SEGUNDO = 30;
const idx = (id) => IDX_ARMA['o' + id];

function rngFixo(semente = 1) {
  let s = semente;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/**
 * Mundo sem monstros nem mineradores, com os jogadores no CAMPO (jungle do time 0,
 * fora da zona segura). Cada item é [raça, classe, dx, dz] a partir de A; os
 * times alternam (A 0, B 1, C 0, D 1). Yaw 0 olha para -z. A nave sem `time` na
 * física troca de arma livre (como se tivesse equipado na base).
 */
function arena(...lista) {
  const w = new World({ preparacaoS: 0, jungle: false, torretas: false, rng: rngFixo() });
  w.mineradores.passo = () => {};
  const x0 = CAMPO.x;
  const z0 = CAMPO.z;
  const js = lista.map(([race, classe, dx, dz], i) => {
    const j = w.addPlayer('P' + i, race, classe);
    j.ship = createShip(race, x0 + dx, z0 + dz, 0, classe);
    j.protegidoAte = 0;
    return j;
  });
  return { w, js };
}

/** Comando de `j` por `n` passos (só ele manda). */
function apertar(w, j, inp, n = 1) {
  j.seq ??= 0;
  for (let i = 0; i < n; i++) {
    w.pushInput(j.id, { s: ++j.seq, ...INPUT_VAZIO, ...inp });
    w.step();
  }
}

/** Põe a arma `id` no Z de `j` (já possuída) e dispara uma vez. */
function disparar(w, j, id, extra = {}) {
  const a = idx(id);
  j.ship.encaixes = [a, j.ship.encaixes[1]];
  apertar(w, j, { f1: true, a, ...extra });
  return a;
}

const passos = (w, n) => {
  for (let i = 0; i < n; i++) w.step();
};

test('toda arma do catálogo dispara no servidor sem erro e faz alguma coisa', () => {
  for (const k of ARMAS) {
    const wpn = WEAPONS[k];
    if (wpn.npc) continue;
    const { w, js } = arena([wpn.raca, wpn.classes[0], 0, 0], ['bellico', 'assault', 0, -40], ['shrewdo', 'assault', 15, 5]);
    const [a] = js;
    a.ship.hp = a.ship.maxHp * 0.5;
    w.tirarEventos();
    const ev = [];
    for (let i = 0; i < SEGUNDO; i++) {
      apertar(w, a, { f1: true, a: wpn.idx });
      ev.push(...w.tirarEventos());
    }
    passos(w, 2 * SEGUNDO);
    ev.push(...w.tirarEventos());
    const algo = ev.some((e) => ['tiro', 'nova', 'efeito', 'acerto', 'explosao'].includes(e.e)) || w.minas.length || a.ship.seg1 === wpn.idx || a.st;
    assert.ok(algo, `${k} ${wpn.nome}: nada aconteceu`);
  }
});

test('projétil: canos paralelos acertam juntos e o tiro leva o dano da versão', () => {
  const { w, js } = arena(['acron', 'assault', 0, 0], ['bellico', 'assault', 0, -60]);
  const [a, b] = js;
  const hp = b.ship.hp;
  disparar(w, a, '111001');
  assert.equal(w.bullets.length, 3);
  passos(w, SEGUNDO);
  assert.ok(Math.abs(hp - b.ship.hp - 3 * versaoArma(idx('111001'), 1).golpe.dano) < 1e-6 + b.ship.regenHpVoo, 'os três canos acertaram');
  // Nível 5 da arma (a versão V5) bate mais, com os números da V5.
  const { w: w2, js: js2 } = arena(['acron', 'assault', 0, 0], ['bellico', 'assault', 0, -60]);
  js2[0].ship.niveis = { [idx('111001')]: 5 };
  const hp2 = js2[1].ship.hp;
  disparar(w2, js2[0], '111001');
  passos(w2, SEGUNDO);
  assert.ok(hp2 - js2[1].ship.hp > 3 * versaoArma(idx('111001'), 5).golpe.dano - 3);
});

test('projétil: área no impacto pega todos no raio, e não o aliado', () => {
  // Metralha Shrewdo: área de 17,5 m.
  const { w, js } = arena(['shrewdo', 'assault', 0, 0], ['acron', 'assault', 0, -60], ['acron', 'assault', 12, -62], ['acron', 'assault', -10, -64]);
  const [a, b, c, d] = js;
  const [hb, hc, hd] = [b, c, d].map((j) => j.ship.hp);
  disparar(w, a, '311004');
  passos(w, SEGUNDO);
  const dano = versaoArma(idx('311004'), 1).golpe.dano;
  assert.ok(hb - b.ship.hp >= dano - 1 && hd - d.ship.hp >= dano - 1, 'os dois inimigos');
  assert.equal(c.ship.hp, hc, 'o aliado não');
});

test('projétil: atravessar acerta os dois inimigos em fila com o mesmo tiro', () => {
  const { w, js } = arena(['shrewdo', 'assault', 0, 0], ['bellico', 'assault', 0, -40], ['acron', 'assault', 50, 0], ['acron', 'assault', 0, -90]);
  const [a, b, , d] = js;
  const [hb, hd] = [b.ship.hp, d.ship.hp];
  disparar(w, a, '311002'); // Feixe Perfurante em Fila
  passos(w, SEGUNDO);
  assert.ok(hb > b.ship.hp && hd > d.ship.hp, 'pegou os dois');
});

test('projétil: explode no fim da vida, mesmo sem acertar ninguém', () => {
  const { w, js } = arena(['bellico', 'mobile', 0, 0]);
  const [a] = js;
  w.tirarEventos();
  disparar(w, a, '212029'); // Míssil de Cruzeiro: área de 12,5 m e explode no fim
  passos(w, 3 * SEGUNDO);
  const ex = w.tirarEventos().filter((e) => e.e === 'explosao');
  assert.equal(ex.length, 1);
  assert.equal(ex[0].raio, versaoArma(idx('212029'), 1).golpe.area);
});

test('projétil: divide em subprojéteis no fim da vida (no rumo do pai) e eles acertam', () => {
  const { w, js } = arena(['bellico', 'functional', 0, 0], ['acron', 'assault', 0, -150]);
  const [a, b] = js;
  const hp = b.ship.hp;
  w.tirarEventos();
  disparar(w, a, '211007'); // Feixe Clone em Fila: 3 canos que viram 2 cada
  assert.equal(w.bullets.length, 3);
  passos(w, Math.ceil(0.3 * SEGUNDO) + 1);
  const filhos = w.bullets.filter((x) => x.prof === 1);
  assert.equal(filhos.length, 6, 'cada um virou dois');
  assert.ok(filhos.every((f) => f.vz < 0 && Math.abs(f.vx) < 1e-6), 'seguem para a frente');
  passos(w, SEGUNDO);
  assert.ok(b.ship.hp < hp);
  assert.ok(w.tirarEventos().some((e) => e.e === 'tiro' && e.p === 1), 'o cliente desenha os filhos pelo evento');
  // Ciclone: a carga abre numa nova.
  const { w: w2, js: j2 } = arena(['acron', 'assault', 0, 0]);
  w2.tirarEventos();
  disparar(w2, j2[0], '116006');
  passos(w2, SEGUNDO);
  assert.ok(w2.tirarEventos().some((e) => e.e === 'nova' && e.p === 1));
});

test('projétil: teleguiado com mira trava no alvo e faz a curva até ele', () => {
  // Inimigo à frente e de lado: o Míssil Paralisante (mira "alvo à frente") trava e curva.
  const { w, js } = arena(['shrewdo', 'functional', 0, 0], ['bellico', 'assault', -25, -150]);
  const [a, b] = js;
  const hp = b.ship.hp;
  disparar(w, a, '312010');
  const m = w.bullets[0];
  assert.equal(m.alvo, b.id, 'travou no inimigo');
  for (let i = 0; i < 4 * SEGUNDO && b.ship.hp === hp; i++) w.step();
  assert.ok(b.ship.hp < hp, 'acertou');
  assert.ok(b.ship.semTiro > 0 && b.ship.lento > 0 && b.ship.lentoMult === 0, 'paralisa ataque e movimento');
  // Em voo, o snapshot leva o teleguiado para o cliente corrigir a curva.
  const { w: w2, js: j2 } = arena(['shrewdo', 'functional', 0, 0], ['bellico', 'assault', -60, -300]);
  disparar(w2, j2[0], '312010');
  assert.equal(w2.snapshotPara(j2[0], [], []).guiados.length, 1);
});

test('projétil: a onda cresce o raio de acerto em voo', () => {
  const { w, js } = arena(['acron', 'assault', 0, 0]);
  disparar(w, js[0], '112030'); // Onda de Sopro Acron
  const b = w.bullets[0];
  const r0 = b.raio;
  passos(w, 10);
  assert.ok(b.raio > r0);
  assert.ok(b.raio <= golpeDaArma(idx('112030'), 1).cresce.raio + 1e-9);
});

test('nova: cresce em volta da nave e pega cada inimigo uma vez, até o raio dela', () => {
  // Nova de Energia: raio de 70 m.
  const { w, js } = arena(['acron', 'functional', 0, 0], ['bellico', 'assault', 0, -40], ['shrewdo', 'assault', 10, 10], ['shrewdo', 'assault', 0, -150]);
  const [a, b, c, d] = js;
  const [hb, hc, hd] = [b, c, d].map((j) => j.ship.hp);
  w.tirarEventos();
  disparar(w, a, '112002');
  passos(w, 2 * SEGUNDO);
  const dano = golpeDaArma(idx('112002'), 1).dano;
  assert.ok(Math.abs(hb - b.ship.hp - dano) < 1 + 2 * b.ship.regenHpVoo * 2, `uma vez: ${hb - b.ship.hp}`);
  assert.equal(c.ship.hp, hc, 'aliado não');
  assert.equal(d.ship.hp, hd, 'longe demais');
  const ev = w.tirarEventos();
  assert.ok(ev.some((e) => e.e === 'nova' && e.raio === 70));
});

test('mina: fica atrás da nave, arma e explode em área com inimigo no gatilho (aliado não)', () => {
  const { w, js } = arena(['acron', 'mobile', 0, 0], ['bellico', 'assault', 300, 0], ['acron', 'assault', -300, 0]);
  const [a, b, c] = js;
  disparar(w, a, '112036'); // Armadilha Elétrica
  assert.equal(w.minas.length, 1);
  const m = w.minas[0];
  assert.ok(m.z > a.ship.z + 5, 'atrás da nave');
  passos(w, SEGUNDO);
  c.ship.x = m.x;
  c.ship.z = m.z;
  passos(w, 5);
  assert.equal(w.minas.length, 1, 'aliado não dispara');
  const hp = b.ship.hp;
  b.ship.x = m.x + 6;
  b.ship.z = m.z;
  w.step();
  assert.equal(w.minas.length, 0, 'explodiu');
  assert.ok(Math.abs(hp - b.ship.hp - golpeDaArma(idx('112036'), 1).dano) < 1);
  const snap = w.snapshotPara(a, [], []);
  assert.deepEqual(snap.minas, []);
});

test('mina: a carga lançada vira minas (Armadilha Circular) e há um limite por piloto', () => {
  const { w, js } = arena(['acron', 'mobile', 0, 0]);
  const [a] = js;
  disparar(w, a, '112004');
  passos(w, SEGUNDO);
  assert.equal(w.minas.length, 4, 'as quatro cargas viraram minas');
  const snap = w.snapshotPara(a, [], []).minas[0];
  assert.equal(snap.kind, 'o112004');
  assert.equal(snap.p, 1);
  for (let i = 0; i < 3; i++) {
    passos(w, 3 * SEGUNDO);
    disparar(w, a, '112004');
  }
  passos(w, SEGUNDO);
  assert.ok(w.minas.length <= 8);
});

test('mina que atira: com inimigo perto, dispara o subprojétil travado nele e some', () => {
  const { w, js } = arena(['shrewdo', 'mobile', 0, 0], ['bellico', 'assault', 400, 0]);
  const [a, b] = js;
  disparar(w, a, '312020'); // Armadilha de Raios
  passos(w, 2 * SEGUNDO);
  const n = w.minas.length;
  assert.equal(n, 3);
  const m = w.minas[0];
  const hp = b.ship.hp;
  b.ship.x = m.x + 12;
  b.ship.z = m.z;
  w.tirarEventos();
  w.step();
  assert.ok(w.minas.length < n, 'a mina atirou e sumiu');
  assert.ok(w.bullets.some((x) => x.alvo === b.id), 'tiro travado em B');
  passos(w, SEGUNDO);
  assert.ok(b.ship.hp < hp);
});

test('campo: fere a cada intervalo quem fica dentro e corta a regeneração de energia', () => {
  const { w, js } = arena(['shrewdo', 'mobile', 0, 0], ['bellico', 'assault', 300, 0]);
  const [a, b] = js;
  disparar(w, a, '312031'); // Campo Magnético
  const campo = w.minas[0];
  assert.ok(campo.campo);
  passos(w, SEGUNDO);
  b.ship.x = campo.x;
  b.ship.z = campo.z;
  const hp = b.ship.hp;
  passos(w, 2 * SEGUNDO);
  assert.ok(b.ship.hp < hp);
  assert.ok(b.ship.semRegen > 0, 'sem regenerar energia');
});

test('efeitos no alvo: dreno, lento, desgoverno, anticadência, redutor de energia, vulnerável e fraco', () => {
  const casos = [
    ['311007', 'shrewdo', 'mobile', (b) => b.drenoTicks > 0, 'dreno de HP'],
    ['312009', 'shrewdo', 'mobile', (b) => b.ship.lento > 0 && b.ship.lentoMult < 1, 'lento'],
    ['312024', 'shrewdo', 'mobile', (b) => b.ship.desgov > 0, 'desgoverno'],
    ['212022', 'bellico', 'mobile', (b) => b.ship.cadencia > 0 && b.ship.cadMult > 1, 'anticadência'],
    ['212023', 'bellico', 'mobile', (b) => b.ship.drenoEn > 0, 'redutor de energia'],
    ['212025', 'bellico', 'mobile', (b) => b.ship.enCara > 0, 'consumidor'],
    ['312012', 'shrewdo', 'assault', (b) => b.st?.vulneravel, 'quebra-resistência'],
    ['312013', 'shrewdo', 'mobile', (b) => b.st?.fraco, 'enfraquecedor'],
    ['112026', 'acron', 'mobile', (b) => b.st?.recuo, 'recuo'],
    ['312022', 'shrewdo', 'assault', (b) => b.st?.cego, 'antirradar'],
    ['312003', 'shrewdo', 'functional', (b) => b.ship.semTiro > 0, 'paralisa o ataque'],
  ];
  for (const [id, race, classe, pegou, nome] of casos) {
    const { w, js } = arena([race, classe, 0, 0], ['bellico', 'assault', 0, -80]);
    const [a, b] = js;
    disparar(w, a, id);
    let ok = false;
    for (let i = 0; i < 4 * SEGUNDO && !ok; i++) {
      w.step();
      ok = !!pegou(b);
    }
    assert.ok(ok, `${nome} (${id})`);
  }
});

test('efeitos no alvo: quebra-escudo descarrega o escudo do equipamento; sem escudo, tira do HP', () => {
  for (const comEscudo of [true, false]) {
    const { w, js } = arena(['bellico', 'mobile', 0, 0], ['shrewdo', 'assault', 0, -80]);
    const [a, b] = js;
    if (comEscudo) Object.assign(b.ship, { maxEscudo: 1000, escudo: 1000 });
    const hp = b.ship.hp;
    disparar(w, a, '212010'); // Míssil Quebra-Escudo: 30% do escudo
    for (let i = 0; i < 4 * SEGUNDO && b.ship.hp === hp && b.ship.escudo === (comEscudo ? 1000 : 0); i++) w.step();
    if (comEscudo) {
      assert.ok(b.ship.escudo <= 700 + 1e-9, `descarregou 30% (${b.ship.escudo})`);
      assert.equal(b.ship.hp, hp, 'o HP não mexe');
    } else assert.ok(b.ship.hp < hp - b.ship.maxHp * 0.04, `sem escudo, a fração do HP (${hp} → ${b.ship.hp} de ${b.ship.maxHp})`);
  }
});

test('efeitos no alvo: vulnerável aumenta e fraco diminui o dano; cego vai no snapshot da vítima', () => {
  const { w, js } = arena(['shrewdo', 'assault', 0, 0], ['bellico', 'assault', 0, -80]);
  const [a, b] = js;
  const base = 10;
  const dano = (alvo, autor) => {
    const hp = alvo.ship.hp;
    alvo.ship.hp = 1000;
    w.golpes.modificarDano(alvo, base, autor.id);
    const d = w.golpes.modificarDano(alvo, base, autor.id, { tipoDano: 'laser' });
    alvo.ship.hp = hp;
    return d;
  };
  assert.equal(dano(b, a), base);
  b.st = { vulneravel: { fim: w.tick + 100, k: 0.25, tipoDano: null } };
  assert.equal(dano(b, a), 12.5);
  a.st = { fraco: { fim: w.tick + 100, mult: 0.8 } };
  assert.equal(dano(b, a), 10);
  b.st.cego = { fim: w.tick + 60 };
  assert.ok(w.snapshotPara(b, [], []).st.cego > 0);
});

test('dispositivo: invulnerável, escudo, resistência e conserto por tempo', () => {
  const { w, js } = arena(['bellico', 'assault', 0, 0], ['acron', 'assault', 0, -80]);
  const [a] = js;
  disparar(w, a, '212019'); // Invulnerabilidade
  assert.ok(a.st.invulneravel);
  assert.equal(w.golpes.modificarDano(a, 50, js[1].id), 0, 'dano direto não passa');
  assert.equal(w.golpes.modificarDano(a, 5, js[1].id, { direto: false }), 5, 'dreno passa');
  // Escudo (Campo de Plasma): absorve primeiro.
  const { w: w2, js: j2 } = arena(['shrewdo', 'mobile', 0, 0]);
  disparar(w2, j2[0], '312040');
  const escudo = j2[0].st.escudo.hp;
  assert.ok(escudo > 0);
  assert.equal(w2.golpes.modificarDano(j2[0], escudo / 2, -1), 0);
  assert.ok(Math.abs(w2.golpes.modificarDano(j2[0], escudo, -1) - escudo / 2) < 1e-9);
  // Tenda de Luz: resiste a laser, não a físico.
  const { w: w3, js: j3 } = arena(['acron', 'assault', 0, 0]);
  disparar(w3, j3[0], '112008');
  assert.ok(w3.golpes.modificarDano(j3[0], 10, -1, { tipoDano: 'laser' }) < 10);
  assert.equal(w3.golpes.modificarDano(j3[0], 10, -1, { tipoDano: 'fisico' }), 10);
  // Reforço de Escudo: conserta por tempo.
  const { w: w4, js: j4 } = arena(['shrewdo', 'assault', 0, 0]);
  j4[0].ship.hp = 50;
  disparar(w4, j4[0], '312006');
  passos(w4, SEGUNDO);
  assert.ok(j4[0].ship.hp > 50);
});

test('dispositivo: camuflagem some do snapshot do outro time (salvo de perto) e revela ao atirar ou levar o canhão revelador', () => {
  const { w, js } = arena(['shrewdo', 'assault', 0, 0], ['bellico', 'assault', 0, -200], ['acron', 'assault', 30, 0]);
  const [a, b, c] = js;
  disparar(w, a, '312014'); // Camuflagem
  passos(w, SEGUNDO);
  const vistos = (quem) => w.snapshotPara(quem, w.entidades(), []).ents.map((e) => e.id);
  assert.ok(!vistos(b).includes(a.id), 'o inimigo não vê');
  assert.ok(vistos(c).includes(a.id), 'o aliado vê');
  assert.ok(w.entidades().find((e) => e.id === a.id).fx.includes('inv'));
  b.ship.z = a.ship.z - INVISIVEL_VISTO_M + 5;
  b.ship.x = a.ship.x;
  assert.ok(vistos(b).includes(a.id), 'de perto aparece');
  b.ship.z = a.ship.z - 200;
  // Atirar mostra por um instante.
  apertar(w, a, { f2: true, a2: a.ship.encaixes[1] });
  assert.ok(vistos(b).includes(a.id), 'atirou, apareceu');
  passos(w, SEGUNDO);
  assert.ok(!vistos(b).includes(a.id));
  // Revelado não fica invisível.
  a.st.revelado = { fim: w.tick + 60 };
  assert.ok(vistos(b).includes(a.id));
});

test('segurar: Reparador de Escudo conserta enquanto segura; Arrancada e Amplificador gastam HP', () => {
  const { w, js } = arena(['acron', 'assault', 0, 0]);
  const [a] = js;
  a.ship.hp = 50;
  const rep = idx('112007');
  a.ship.encaixes = [rep, a.ship.encaixes[1]];
  apertar(w, a, { f1: true, a: rep }, SEGUNDO);
  assert.ok(a.ship.hp > 55, `consertou: ${a.ship.hp}`);
  assert.ok(w.entidades().find((e) => e.id === a.id).fx.includes('regen'));
  const { w: w2, js: j2 } = arena(['bellico', 'assault', 0, 0]);
  const amp = idx('212018');
  const b = j2[0];
  b.ship.encaixes = [amp, b.ship.encaixes[1]];
  b.ship.en = 5;
  const hp = b.ship.hp;
  apertar(w2, b, { f1: true, a: amp }, SEGUNDO);
  assert.ok(b.ship.hp < hp, 'gastou HP');
  assert.ok(b.ship.en > 5 + b.ship.regenEn * 0.9, 'ganhou energia além da regeneração');
});

test('suporte: Nova de Reparo cura os aliados no raio; Druida cura o aliado que acerta', () => {
  const { w, js } = arena(['acron', 'functional', 0, 0], ['bellico', 'assault', 0, -30], ['acron', 'assault', 20, 0]);
  const [a, b, c] = js;
  c.ship.hp = 40;
  b.ship.hp = 40;
  disparar(w, a, '112018');
  passos(w, 2 * SEGUNDO);
  assert.ok(c.ship.hp > 40, 'aliado curado');
  assert.ok(b.ship.hp <= 40 + b.ship.regenHpVoo * 3, 'inimigo não');
  // Druida Reparador (Bellico): projétil que só pega aliado.
  const { w: w2, js: j2 } = arena(['bellico', 'functional', 0, 0], ['acron', 'assault', 0, -60], ['bellico', 'assault', 0, -90]);
  const [d, e, f] = j2;
  f.ship.hp = 40;
  const he = e.ship.hp;
  disparar(w2, d, '212017');
  passos(w2, 2 * SEGUNDO);
  assert.ok(f.ship.hp > 40, 'aliado atrás do inimigo curado');
  assert.ok(e.ship.hp >= he - 1e-9, 'atravessou o inimigo sem ferir');
});

test('suporte: Nova Antiparalisia limpa; Doadora dá energia e zera a própria; Desarmadora destrói minas inimigas', () => {
  const { w, js } = arena(['acron', 'mobile', 0, 0], ['bellico', 'assault', 400, 0], ['acron', 'assault', 15, 0]);
  const [a, b, c] = js;
  Object.assign(c.ship, { lento: 3, lentoMult: 0, semTiro: 3, desgov: 3 });
  disparar(w, a, '112023');
  passos(w, SEGUNDO);
  assert.equal(c.ship.lento, 0);
  assert.equal(c.ship.semTiro, 0);
  // Doadora.
  const { w: w2, js: j2 } = arena(['acron', 'functional', 0, 0], ['bellico', 'assault', 400, 0], ['acron', 'assault', 15, 0]);
  j2[2].ship.en = 0;
  disparar(w2, j2[0], '112029');
  assert.equal(j2[0].ship.en, 0, 'gastou toda a energia');
  passos(w2, SEGUNDO);
  assert.ok(j2[2].ship.en > 5);
  // Desarmadora: B (inimigo) solta uma mina, A desarma.
  const { w: w3, js: j3 } = arena(['acron', 'assault', 0, 0], ['bellico', 'mobile', 0, -20]);
  disparar(w3, j3[1], '212004');
  assert.equal(w3.minas.length, 1);
  disparar(w3, j3[0], '112024');
  passos(w3, 2 * SEGUNDO);
  assert.equal(w3.minas.length, 0);
  assert.ok(b);
});

test('especial: o Rebatedor devolve os tiros inimigos no raio', () => {
  const { w, js } = arena(['acron', 'functional', 0, 0], ['bellico', 'assault', 0, -80]);
  const [a, b] = js;
  b.ship.yaw = Math.PI; // de frente para A
  apertar(w, b, { f1: true });
  const tiro = w.bullets.find((x) => x.owner === b.id);
  passos(w, 2);
  disparar(w, a, '112014');
  passos(w, 3);
  assert.equal(tiro.owner, a.id, 'agora é de A');
  assert.ok(tiro.vz < 0, 'voltando para B');
});

test('teleporte: o servidor salta junto com a predição e avisa o efeito', () => {
  const { w, js } = arena(['acron', 'mobile', 0, 0]);
  const [a] = js;
  const z0 = a.ship.z;
  w.tirarEventos();
  disparar(w, a, '112021');
  assert.ok(z0 - a.ship.z > 100);
  assert.ok(w.tirarEventos().some((e) => e.e === 'efeito' && e.kind === 'o112021'));
});

test('npc: o tiro de NPC e de torreta segue com os números de antes', () => {
  const w = new World({ preparacaoS: 0, jungle: false, rng: rngFixo(3) });
  const m = w.jungle.criarMonstro('sn3', 0, -600);
  assert.deepEqual(m.ship.encaixes, [IDX_ARMA.laser, IDX_ARMA.plasma], 'monstro sem raça jogável fica com os tiros de NPC');
  assert.equal(m.danoMult, 1, 'o dano do monstro já vem no ataque da espécie');
  assert.equal(WEAPONS.laser.raio, 5);
  assert.equal(w.danoDoTiro({ kind: 'laser', mult: 0.5, drone: true }), 6);
});
