// Catálogo das armas do original (shared/armas.js), validação de raça, classe e
// posse, e o que o stepShip faz com elas (encaixes, rajada, segurar a tecla,
// teleporte, efeitos que mexem no movimento) — inclusive que a predição do cliente
// bate com o servidor. As famílias de golpe no servidor estão em golpes.test.mjs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World, ZONA_SEGURA } from '../server/game.js';
import {
  ARMAS,
  IDX_ARMA,
  WEAPONS,
  DT,
  INPUT_VAZIO,
  createShip,
  stepShip,
  sanitizeInput,
  possuiArma,
  armaDoEncaixe,
  encaixePadrao,
  ENCAIXE_PADRAO,
  teleportar,
} from '../shared/sim.js';
import {
  ARMAS_ORIGINAL,
} from '../shared/armas-original.js';
import {
  armasDisponiveis,
  armasIniciais,
  versaoArma,
  golpeDaArma,
  resumoVersao,
  tirosDoGolpe,
  golpePrevisivel,
  textoEfeito,
  NIVEL_ARMA_MAX,
  RAIO_TIRO_MIN,
  FATOR_DANO,
  FATOR_ENERGIA_ARMA,
  FATOR_RECARGA_ARMA,
  FATOR_VEL,
  FATOR_AREA,
  FATOR_OURO,
  CATEGORIAS,
} from '../shared/armas.js';
import { NAVES, RACAS_JOGAVEIS, ORDEM_CLASSES, naveDe } from '../shared/naves.js';
import { BASE } from '../shared/terrain.js';
import { pontoLivre } from '../shared/obstaculos.js';
import { NIVEL_POR_VERSAO } from '../shared/versoes.js';

const PARADO = { ...INPUT_VAZIO };
const idx = (id) => IDX_ARMA['o' + id];

// ---------- Catálogo ----------

test('catálogo: as 140 armas das lojas e os dois tiros de NPC, com índices estáveis', () => {
  assert.equal(ARMAS_ORIGINAL.length, 140);
  assert.equal(ARMAS.length, 142);
  // Os tiros de NPC são os primeiros; as do original seguem a ordem das lojas.
  assert.deepEqual(ARMAS.slice(0, 2), ['laser', 'plasma']);
  assert.equal(ENCAIXE_PADRAO.join(), '0,1');
  assert.equal(idx('111001'), 2, 'Feixe Rifle Triplo (a primeira da loja Acron)');
  assert.equal(idx('211001'), 50, 'Feixe Bellico');
  assert.equal(idx('311001'), 93, 'Feixe Duplo');
  assert.equal(ARMAS[141], 'o312036', 'a última da loja Shrewdo');
  for (const [i, k] of ARMAS.entries()) assert.equal(WEAPONS[k].idx, i);
});

test('catálogo: armas por raça e classe (as do original)', () => {
  const esperado = {
    acron: { assault: 18, mobile: 22, functional: 28, total: 48 },
    bellico: { assault: 18, mobile: 22, functional: 27, total: 43 },
    shrewdo: { assault: 21, mobile: 23, functional: 26, total: 49 },
  };
  for (const race of RACAS_JOGAVEIS) {
    for (const c of ORDEM_CLASSES) {
      const lista = armasDisponiveis(race, c);
      assert.equal(lista.length, esperado[race][c], `${race} ${c}`);
      for (const i of lista) {
        const w = WEAPONS[ARMAS[i]];
        assert.equal(w.raca, race);
        assert.ok(w.classes.includes(c));
        assert.ok(!w.npc);
      }
    }
    assert.equal(ARMAS.filter((k) => WEAPONS[k].raca === race).length, esperado[race].total);
  }
  // Raça sem naves (drones, monstros) só tem os tiros de NPC.
  assert.deepEqual(armasDisponiveis('mechan'), [IDX_ARMA.laser, IDX_ARMA.plasma]);
});

test('catálogo: armas iniciais de cada raça (um feixe no Z, uma metralhadora no X), em todas as classes', () => {
  const iniciais = { acron: ['111001', '111011'], bellico: ['211001', '211011'], shrewdo: ['311001', '311004'] };
  for (const race of RACAS_JOGAVEIS) {
    const [z, x] = armasIniciais(race);
    assert.deepEqual([z, x], iniciais[race].map(idx), race);
    assert.equal(WEAPONS[ARMAS[z]].categoria, 'beam');
    assert.equal(WEAPONS[ARMAS[x]].categoria, 'gun');
    for (const c of ORDEM_CLASSES) {
      assert.ok(armasDisponiveis(race, c).includes(z) && armasDisponiveis(race, c).includes(x), `${race} ${c}`);
      const s = createShip(race, 0, 0, 0, c);
      assert.deepEqual(s.encaixes, [z, x], 'a nave nasce com elas nos encaixes');
    }
  }
  assert.deepEqual(armasIniciais('mechan'), [IDX_ARMA.laser, IDX_ARMA.plasma]);
});

test('catálogo: oito versões por arma (V1 a V8), nos níveis de piloto de todo item, com preço em ouro e categoria', () => {
  assert.equal(NIVEL_ARMA_MAX, 8);
  for (const k of ARMAS) {
    const w = WEAPONS[k];
    if (w.npc) continue;
    assert.equal(w.versoes.length, NIVEL_ARMA_MAX, k);
    assert.deepEqual(w.versoes.map((v) => v.nivelPiloto), [1, 4, 7, 10, 13, 16, 19, 22], k);
    assert.deepEqual(w.versoes.map((v) => v.nivelPiloto), [...NIVEL_POR_VERSAO], k);
    assert.ok(w.preco >= 60 && w.preco % 10 === 0, `${k}: preço ${w.preco}`);
    for (const v of w.versoes) {
      assert.ok(v.preco > 0 && v.preco % 10 === 0, `${k} V${v.nivel}: ${v.preco}`);
      assert.ok(v.cd >= 0 && v.energia >= 0);
      assert.ok(['projetil', 'nova', 'mina', 'campo', 'efeito'].includes(v.golpe.forma));
    }
    assert.ok(CATEGORIAS[w.categoria], k);
    assert.ok(w.modelo?.length === 2, `${k}: modelo da arma nos dois lados`);
    assert.ok(w.som, `${k}: som de disparo`);
    assert.ok(w.nome && w.nomeEn);
  }
});

test('escala: a conversão do original (dano ÷ 5, energia × 0,3, recarga × 0,5, velocidade × 0,5, área × 0,25)', () => {
  assert.equal(FATOR_DANO, 0.2);
  assert.equal(FATOR_ENERGIA_ARMA, 0.3);
  assert.equal(FATOR_RECARGA_ARMA, 0.5);
  assert.equal(FATOR_VEL, 0.5);
  assert.equal(FATOR_AREA, 0.25);
  assert.equal(FATOR_OURO, 0.06);
  // Feixe Duplo V1 no original: 2 × 35 de dano, recarga 1000 ms, 8 de energia, 0,6 m/ms, vão de 10 m, 900 ms de vida.
  const v = versaoArma(idx('311001'), 1);
  assert.equal(v.golpe.dano, 7);
  assert.equal(v.cd, 0.5);
  assert.ok(Math.abs(v.energia - 2.4) < 1e-9);
  assert.equal(v.golpe.vel, 300);
  assert.equal(v.golpe.vida, 0.9);
  assert.deepEqual(v.golpe.tiros, [{ off: -1.25, ang: 0 }, { off: 1.25, ang: 0 }]);
  assert.equal(v.golpe.raio, RAIO_TIRO_MIN, 'tiro fino do original acerta com o raio mínimo');
  assert.equal(WEAPONS.o311001.preco, 60, '1000 de ouro no original × 0,06');
  // Feixe Triplo (leque de 5°) e Vulcan Bellico (rajada de 3 a cada 50 ms).
  const triplo = versaoArma(idx('311008'), 1).golpe.tiros.map((t) => +t.ang.toFixed(4));
  assert.deepEqual(triplo, [0.0873, 0, -0.0873]);
  const vulcan = versaoArma(idx('211011'), 1).golpe;
  assert.equal(vulcan.rajada, 3);
  assert.equal(vulcan.rajadaS, 0.05);
  // Míssil que acelera voa à velocidade média (mesmo alcance, mesmo tempo).
  const missil = versaoArma(idx('312010'), 1).golpe;
  assert.ok(missil.vel > 100 && missil.vel < 200, `${missil.vel}`);
  assert.ok(missil.guia && missil.mira, 'teleguiado com mira');
});

test('escala: as armas iniciais matam uma nave do tier 0 em 1 a 3,5 s de fogo acertando', () => {
  const tempos = [];
  for (const race of RACAS_JOGAVEIS) {
    const dps = armasIniciais(race).reduce((s, i) => s + resumoVersao(versaoArma(i, 1)).dps, 0);
    for (const alvoRaca of RACAS_JOGAVEIS) {
      for (const c of ORDEM_CLASSES) {
        const n = naveDe(alvoRaca, c, 0);
        const t = n.hp / (dps - n.regenHpVoo);
        tempos.push(t);
        assert.ok(t >= 1 && t <= 3.5, `${race} contra ${n.nome}: ${t.toFixed(2)} s`);
      }
    }
  }
  const media = tempos.reduce((a, b) => a + b) / tempos.length;
  assert.ok(media >= 1.5 && media <= 3, `média ${media.toFixed(2)} s`);
});

test('escala: a energia das naves aguenta as iniciais atirando sem parar por alguns segundos', () => {
  for (const race of RACAS_JOGAVEIS) {
    const gasto = armasIniciais(race).reduce((s, i) => {
      const v = versaoArma(i, 1);
      return s + v.energia / v.cd;
    }, 0);
    for (const c of ORDEM_CLASSES) {
      const n = naveDe(race, c, 0);
      const liquido = gasto - n.regenEnergia;
      if (liquido <= 0) continue; // aguenta para sempre
      const t = n.energia / liquido;
      assert.ok(t >= 2.5, `${n.nome}: a energia acaba em ${t.toFixed(1)} s`);
    }
  }
});

test('catálogo: o resumo de cada versão (menu e Loja) tem dano, recarga, energia e o texto dos efeitos', () => {
  for (const k of ARMAS) {
    const w = WEAPONS[k];
    if (w.npc) continue;
    for (const v of w.versoes) {
      const r = resumoVersao(v);
      assert.ok(Number.isFinite(r.dano) && Number.isFinite(r.cd) && Number.isFinite(r.energia), k);
      for (const t of r.efeitos) assert.equal(typeof t, 'string');
    }
    // Arma de ataque tem dano; dispositivo e suporte podem não ter.
    if (w.papel === 'ataque' && w.categoria !== 'dispositivo') assert.ok(resumoVersao(w.versoes[0]).dano > 0, k);
  }
  assert.match(textoEfeito({ tipo: 'lento', mult: 0.8, dur: 2.4 }), /20%/);
  assert.match(resumoVersao(versaoArma(idx('312009'), 1)).efeitos[0], /Lento/);
});

// ---------- Validação ----------

test('validação: sanitizeInput mantém só índices do catálogo (-1 = arma de fábrica do encaixe)', () => {
  assert.equal(sanitizeInput({ a: 5, a2: 141 }).a, 5);
  assert.equal(sanitizeInput({ a: 5, a2: 141 }).a2, 141);
  for (const a of [-1, 142, 1.5, '3', null, undefined, NaN, {}]) {
    assert.equal(sanitizeInput({ a, a2: a }).a, -1, String(a));
    assert.equal(sanitizeInput({ a, a2: a }).a2, -1, String(a));
  }
});

test('validação: arma de outra raça, de outra classe, de NPC ou não possuída cai na de fábrica do encaixe', () => {
  const s = createShip('shrewdo', 0, 0, 0, 'assault');
  const [z, x] = encaixePadrao(s);
  assert.deepEqual([z, x], armasIniciais('shrewdo'));
  assert.equal(armaDoEncaixe(s, idx('111003'), 0), z, 'Acron: outra raça');
  assert.equal(armaDoEncaixe(s, idx('312010'), 1), x, 'Míssil Paralisante é Functional, não Assault');
  assert.equal(armaDoEncaixe(s, IDX_ARMA.plasma, 1), x, 'tiro de NPC');
  assert.equal(armaDoEncaixe(s, idx('312001'), 0), idx('312001'), 'Canhão Tempestade em Leque é Assault: vale');
  s.armas = []; // sem nada comprado
  assert.equal(armaDoEncaixe(s, idx('312001'), 0), z, 'não possuída');
  assert.ok(possuiArma(s, z) && possuiArma(s, x), 'as de fábrica nunca se perdem');
  // No stepShip, o pedido inválido não dispara outra coisa.
  const d = stepShip(s, { ...PARADO, f1: true, a: idx('111003') });
  assert.ok(d.length && d.every((t) => t.kind === ARMAS[z]));
});

test('validação: no servidor, o encaixe só aceita arma da raça e classe que o piloto possui', () => {
  const w = new World({ drones: 0, monstros: 0, elites: 0, torretas: false });
  const j = w.addPlayer('A', 'bellico', 'mobile');
  // Na própria base (troca livre).
  const outraClasse = idx('212002'); // Canhão de Magma em Leque: Bellico Assault
  const daClasse = idx('212029'); // Míssil de Cruzeiro: Bellico Mobile
  w.pushInput(j.id, { s: 1, a: outraClasse, a2: daClasse });
  w.step();
  assert.deepEqual(j.ship.encaixes, armasIniciais('bellico'), 'sem comprar, nada muda');
  j.armas = [daClasse, outraClasse];
  j.ship.armas = [daClasse, outraClasse];
  w.pushInput(j.id, { s: 2, a: outraClasse, a2: daClasse });
  w.step();
  assert.deepEqual(j.ship.encaixes, [armasIniciais('bellico')[0], daClasse], 'a da outra classe continua recusada');
});

// ---------- stepShip ----------

test('stepShip: canos, leque e as duas armas, cada encaixe com a sua recarga e a energia uma só', () => {
  const s = createShip('acron', 0, 0, 0);
  const en = s.en;
  const d = stepShip(s, { ...PARADO, f1: true, f2: true });
  const z = versaoArma(s.encaixes[0], 1);
  const x = versaoArma(s.encaixes[1], 1);
  assert.equal(d.filter((t) => t.enc === 0).length, 3, 'Feixe Rifle Triplo: três canos');
  assert.equal(d.filter((t) => t.enc === 1).length, 2, 'Vulcan Acron: dois canos');
  assert.deepEqual(d.filter((t) => t.enc === 0).map((t) => t.off), [-3.25, 0, 3.25]);
  assert.ok(Math.abs(s.en - (Math.min(s.maxEn, en + s.regenEn * DT) - z.energia - x.energia)) < 1e-9);
  assert.equal(s.cd1, z.cd);
  assert.equal(s.cd2, x.cd);
});

test('stepShip: rajada sai no tempo dela, gasta a energia uma vez e cada tiro gira pela varredura', () => {
  const s = createShip('bellico', 0, 0, 0);
  const a = idx('211011'); // Vulcan Bellico: rajada de 3 a cada 0,05 s
  s.encaixes = [s.encaixes[0], a];
  const g = versaoArma(a, 1).golpe;
  const tiros = [];
  const en0 = s.en;
  for (let i = 0; i < 6; i++) tiros.push(...stepShip(s, { ...PARADO, f2: i === 0, a2: a }).map((t) => ({ ...t, passo: i })));
  assert.equal(tiros.length, 3, 'três tiros, mesmo soltando a tecla');
  assert.deepEqual(tiros.map((t) => t.k), [0, 1, 2]);
  assert.ok(tiros[1].passo >= 1 && tiros[2].passo > tiros[1].passo);
  assert.ok(s.en > en0 - versaoArma(a, 1).energia - 1e-9, 'gastou só uma vez');
  // Varredura (Onda de Choque: o padrão gira 20° a cada tiro da rajada).
  const onda = golpeDaArma(idx('214003'), 1);
  const angs = [0, 1, 2].map((k) => tirosDoGolpe(onda, k)[0].ang);
  assert.ok(angs[0] > angs[1] && angs[1] > angs[2], 'gira da esquerda para a direita');
  assert.ok(Math.abs(angs[1]) < 1e-9);
  assert.equal(g.rajada, 3);
});

test('stepShip: trocar a arma, pousar ou levar paralisia corta a rajada', () => {
  const s = createShip('bellico', 0, 0, 0);
  const a = idx('211011');
  s.encaixes = [s.encaixes[0], a];
  stepShip(s, { ...PARADO, f2: true, a2: a });
  assert.equal(s.raj2, 2);
  s.semTiro = 1;
  assert.deepEqual(stepShip(s, { ...PARADO, a2: a }), []);
  assert.equal(s.raj2, 0);
});

test('stepShip: segurar a tecla (Acelerador) acelera e gasta energia por segundo enquanto segura', () => {
  const a = idx('312016'); // Acelerador, Shrewdo Mobile
  const base = createShip('shrewdo', 0, 0, 0, 'mobile');
  const com = createShip('shrewdo', 0, 0, 0, 'mobile');
  com.encaixes = [a, com.encaixes[1]];
  com.en = com.maxEn;
  const v = versaoArma(a, 1);
  const en0 = com.en;
  for (let i = 0; i < 60; i++) {
    stepShip(base, { ...PARADO, th: 1 });
    stepShip(com, { ...PARADO, th: 1, f1: true, a });
  }
  const vb = Math.hypot(base.vx, base.vz);
  const vc = Math.hypot(com.vx, com.vz);
  const mult = v.golpe.efeitos[0].mult;
  assert.ok(vc > vb * 1.1, `mais rápido: ${vc.toFixed(1)} contra ${vb.toFixed(1)}`);
  assert.ok(vc <= vb * mult + 0.5);
  assert.equal(com.seg1, a, 'ligado no Z');
  assert.ok(com.en < en0, 'gastou energia');
  stepShip(com, { ...PARADO, th: 1, a });
  assert.equal(com.seg1, -1, 'soltou, desligou');
});

test('stepShip: teleporte salta para a frente, recuando até achar chão livre', () => {
  const a = idx('112021'); // Teleporte, Acron Mobile
  const x0 = BASE.x;
  const z0 = BASE.z - ZONA_SEGURA - 100;
  const s = createShip('acron', x0, z0, 0, 'mobile');
  s.encaixes = [a, s.encaixes[1]];
  const d = stepShip(s, { ...PARADO, f1: true, a });
  assert.equal(d.length, 1, 'o servidor recebe o disparo (efeito, som)');
  const dist = versaoArma(a, 1).golpe.efeitos[0].dist;
  assert.equal(dist, 175);
  assert.ok(z0 - s.z > 100 && z0 - s.z <= dist + 3, `saltou ${z0 - s.z} m`);
  assert.ok(pontoLivre(s.x, s.z, 5), 'em chão livre');
  // Contra a muralha não atravessa: fica onde dá.
  const t = createShip('acron', 0, -930, 0, 'mobile');
  const z = t.z;
  teleportar(t, 175);
  assert.ok(t.z >= -1000 && (t.z === z || pontoLivre(t.x, t.z, 5)));
});

test('stepShip: efeitos no alvo que mexem no movimento e no tiro (lento, paralisia, trava, desgoverno, recarga, energia)', () => {
  const novo = () => {
    const s = createShip('shrewdo', 0, 0, 0);
    for (let i = 0; i < 60; i++) stepShip(s, { ...PARADO, th: 1 });
    return s;
  };
  // Paralisia do movimento (lento com mult 0): freia até parar.
  const p = novo();
  p.lento = 2;
  p.lentoMult = 0;
  for (let i = 0; i < 45; i++) stepShip(p, { ...PARADO, th: 1 });
  assert.ok(Math.hypot(p.vx, p.vz) < 2, 'quase parada');
  // Trava: segue na velocidade que tinha, sem acelerar nem frear.
  const t = novo();
  const v0 = Math.hypot(t.vx, t.vz);
  t.trava = 1;
  for (let i = 0; i < 15; i++) stepShip(t, { ...PARADO, th: -1 });
  assert.ok(Math.abs(Math.hypot(t.vx, t.vz) - v0) < 1, 'não freou');
  // Desgoverno: a curva vai para o outro lado.
  const dg = createShip('shrewdo', 0, 0, 0);
  dg.desgov = 1;
  stepShip(dg, { ...PARADO, tu: 1 });
  assert.ok(dg.yaw < 0, 'virou para o outro lado');
  // Paralisia do tiro: sem disparo.
  const st = createShip('shrewdo', 0, 0, 0);
  st.semTiro = 1;
  assert.deepEqual(stepShip(st, { ...PARADO, f1: true }), []);
  // Anticadência e Consumidor: recarga e energia do tiro maiores.
  const c = createShip('shrewdo', 0, 0, 0);
  c.cadencia = 2;
  c.cadMult = 1.64;
  c.enCara = 2;
  c.enCaraMult = 1.3;
  const en = c.en;
  stepShip(c, { ...PARADO, f1: true });
  const v = versaoArma(c.encaixes[0], 1);
  assert.ok(Math.abs(c.cd1 - v.cd * 1.64) < 1e-9);
  assert.ok(Math.abs(c.en - (Math.min(c.maxEn, en + c.regenEn * DT) - v.energia * 1.3)) < 1e-9);
  // Sem regeneração e dreno de energia.
  const e = createShip('shrewdo', 0, 0, 0);
  e.en = 10;
  e.semRegen = 1;
  e.drenoEn = 1;
  e.drenoEnPs = 6;
  stepShip(e, PARADO);
  assert.ok(Math.abs(e.en - (10 - 6 * DT)) < 1e-9);
});

test('predição: o stepShip do cliente (a partir do `me`) bate com o do servidor nas armas que mexem na nave', () => {
  const w = new World({ drones: 0, monstros: 0, elites: 0, torretas: false });
  const j = w.addPlayer('P', 'shrewdo', 'mobile');
  j.ship = createShip('shrewdo', BASE.x, BASE.z - ZONA_SEGURA - 100, 0, 'mobile');
  j.protegidoAte = 0;
  const acel = idx('312016');
  const rajada = idx('311006'); // Metralha Giratória: rajada de 3 com varredura
  j.ship.encaixes = [acel, rajada];
  // Efeitos que o servidor pôs (vão no `me`).
  Object.assign(j.ship, { desgov: 0.5, cadencia: 1, cadMult: 1.5, lento: 0.7, lentoMult: 0.6 });
  const me = structuredClone(w.snapshotPara(j, [], []).me);
  const cliente = structuredClone(me);
  const comandos = [];
  for (let i = 0; i < 40; i++) comandos.push({ s: i + 1, th: 1, tu: i < 20 ? 0.5 : -0.3, f1: i % 3 !== 0, f2: i % 7 === 0, a: acel, a2: rajada, b: i > 30 });
  const tirosCliente = [];
  for (const c of comandos) tirosCliente.push(...stepShip(cliente, sanitizeInput(c)));
  for (const c of comandos) {
    w.pushInput(j.id, c); // um por passo, como o cliente manda
    w.step();
  }
  for (const k of ['x', 'y', 'z', 'yaw', 'vx', 'vz', 'en', 'cd1', 'cd2', 'raj2', 'seg1', 'lento', 'desgov']) {
    assert.ok(Math.abs((cliente[k] ?? 0) - (j.ship[k] ?? 0)) < 1e-6, `${k}: cliente ${cliente[k]} servidor ${j.ship[k]}`);
  }
  assert.ok(tirosCliente.length > 0);
});

test('predição: os golpes que o cliente desenha sozinho são só os projéteis retos', () => {
  assert.ok(golpePrevisivel(golpeDaArma(idx('311001'), 1)), 'feixe');
  assert.ok(!golpePrevisivel(golpeDaArma(idx('312010'), 1)), 'míssil teleguiado vem do servidor');
  assert.ok(!golpePrevisivel(golpeDaArma(idx('211007'), 1)), 'feixe que se divide vem do servidor');
  assert.ok(!golpePrevisivel(golpeDaArma(idx('112002'), 1)), 'nova');
});

test('npc: drone e monstro atiram os tiros de NPC (fora do catálogo do jogador)', () => {
  const s = createShip('mechan', 0, 0, 0);
  assert.deepEqual(s.encaixes, [IDX_ARMA.laser, IDX_ARMA.plasma]);
  const d = stepShip(s, { ...PARADO, f1: true });
  assert.deepEqual(d.map((t) => t.kind), ['laser']);
  assert.equal(WEAPONS.laser.dano, 12);
  assert.equal(WEAPONS.plasma.dano, 42);
  for (const race of RACAS_JOGAVEIS) for (const c of ORDEM_CLASSES) assert.ok(!armasDisponiveis(race, c).includes(IDX_ARMA.laser));
  assert.ok(NAVES.acron);
});
