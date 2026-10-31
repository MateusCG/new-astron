// Disparo das armas desenhadas como no AstroN original (public/js/disparo-regras.js e
// disparo-original.js): as de início e as revistas depois (Feixe Perfurante de Magma,
// Canhão de Faíscas, Rebatedor de Projéteis e a segunda leva Acron: feixes em círculo,
// metralhas, lâmina, canhão descarregador, ciclone, armadilha, míssil clone, as três
// novas e os três dispositivos). Quais efeitos do original cada arma usa em
// cada versão, se eles estão convertidos e na lista do carregamento, a forma deles (o
// clarão de um quadro dos feixes, o projétil deitado que avança da boca, as faíscas do
// impacto, o anel do fim, a esfera e o anel do Rebatedor com raio 100) e as contas de
// onde cada peça aparece.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DISPARO_ORIGINAL,
  GIRO_PASSO,
  IMPACTO_NO_CASCO,
  RAIO_AREA_ORIGINAL,
  ESCALA_DISPARO,
  efeitosDoDisparo,
  giroDoClarao,
  inicioDoTiro,
  pontoDoImpacto,
  acabouAntes,
  escalaDaArea,
  recuoDaCarga,
  atravessa,
  explodeNoFim,
  ESTADOS_NA_NAVE,
  ESCUDO_REC,
  quantumDoEscudo,
  direcaoDoQuantum,
  quadroDoOsso,
  ALFA_CAMUFLADA,
} from '../public/js/disparo-regras.js';
import { EFEITOS_ORIGINAIS, insumosDaPartida } from '../public/js/insumos.js';
import { INICIAIS_ORIGINAL, WEAPONS, golpeDaArma } from '../shared/armas.js';
import { FATOR_TAMANHO_NAVE } from '../shared/naves.js';
import { createBullet, stepBullet, forward } from '../shared/sim.js';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const efeito = (id) => JSON.parse(readFileSync(path.join(RAIZ, 'public/modelos/efeitos', `${id}.json`), 'utf8'));
const perto = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

// As revistas contra o original depois das de início.
const REVISTAS = ['o111003', 'o112028', 'o112014'];
// A segunda leva Acron, com o modo do clarão (coluna 53; null = coluna 51 '0').
const SEGUNDA_LEVA = {
  o111009: 'giro', // Feixe Circular
  o111005: 'giro', // Feixe Tempestade Circular
  o111017: 'preso', // Metralha Rotativa
  o111019: 'preso', // Bombardeiro Frontal
  o112003: 'preso', // Lâmina Giratória Reforçada
  o112010: 'preso', // Canhão Descarregador
  o116006: 'preso', // Ciclone
  o112034: 'preso', // Armadilha Supressora
  o112001: 'preso', // Míssil Clone Teleguiado
  o112006: null, // Onda de Energia
  o112002: null, // Nova de Energia
  o112024: null, // Nova Desarmadora
  o112007: null, // Reparador de Escudo
  o112019: null, // Conversor de Impacto
  o112033: null, // Disjuntor
  o112030: 'giro', // Onda de Sopro Acron
  o112008: null, // Tenda de Luz
};
// A terceira leva Acron.
const TERCEIRA_LEVA = {
  o112035: 'giro', // Rifle Relâmpago
  o112038: 'giro', // Feixe Relâmpago
  o112011: 'preso', // Canhão Amplificador
  o112027: 'preso', // Canhão Congelante
  o112025: 'preso', // Bombardeiro Elétrico
  o112020: 'preso', // Míssil Sugador de Energia
  o112009: 'preso', // Míssil Tempestade Paralisante
  o112004: 'preso', // Armadilha Circular
  o112036: 'preso', // Armadilha Elétrica
  o112013: null, // Nova Reveladora
  o112017: null, // Nova Freio
  o112018: null, // Nova de Reparo
  o112023: null, // Nova Antiparalisia
  o112037: null, // Nova de Carga Elétrica
  o112029: null, // Nova Doadora de Energia
  o112012: null, // Camuflagem
  o112021: null, // Teleporte
};
// A quarta leva Acron (as últimas).
const QUARTA_LEVA = {
  o116005: 'giro', // Feixe Tempestade Reforçado
  o111013: 'preso', // Metralha Larga
  o111015: 'preso', // Metralha Teleguiada
};

test('disparo original: as seis armas de início e as revistas, com o modo de clarão e de fim do original', () => {
  const iniciais = Object.values(INICIAIS_ORIGINAL).flat().map((id) => 'o' + id);
  assert.deepEqual(Object.keys(DISPARO_ORIGINAL).sort(), [...iniciais, ...REVISTAS, ...Object.keys(SEGUNDA_LEVA), ...Object.keys(TERCEIRA_LEVA), ...Object.keys(QUARTA_LEVA)].sort());
  // Coluna 53 do inititemweapon.cfg: 14 (girado em volta do cano) nos feixes e no Vulcan
  // Bellico, 15 (preso, sem giro) no Vulcan Acron, na Metralha e no Canhão de Faíscas, 2
  // (parado onde a nave estava, pela área) no Rebatedor; coluna 94 = 7 só na Metralha
  // (a V8 do Feixe Perfurante de Magma também, mas com área 0: não aparece).
  assert.deepEqual(
    Object.fromEntries(Object.entries(DISPARO_ORIGINAL).map(([k, v]) => [k, v.clarao])),
    { o111001: 'giro', o111011: 'preso', o211001: 'giro', o211011: 'giro', o311001: 'giro', o311004: 'preso', o111003: 'giro', o112028: 'preso', o112014: 'area', ...SEGUNDA_LEVA, ...TERCEIRA_LEVA, ...QUARTA_LEVA },
  );
  // O clarão do catálogo bate com o modo: as de clarão null não têm efeito na coluna 51.
  for (const [k, v] of Object.entries(DISPARO_ORIGINAL)) assert.equal(!!golpeDaArma(k, 1).vis.d, v.clarao !== null, k);
  // Coluna 94 = 7 (o fim deitado pela área) na Metralha e nas de área da segunda leva.
  const comFim = ['o311004', 'o111009', 'o111005', 'o111017', 'o111019', 'o112010', 'o112035', 'o112038', 'o112011', 'o112027', 'o112025', 'o112009', 'o112036', 'o116005', 'o111013'];
  for (const [k, v] of Object.entries(DISPARO_ORIGINAL)) assert.equal(v.fim, comFim.includes(k) ? 'area' : undefined, k);
  for (const k of comFim) assert.ok(golpeDaArma(k, 1).vis.f && golpeDaArma(k, 1).area > 0, k);
  assert.equal(ESCALA_DISPARO, FATOR_TAMANHO_NAVE, 'na escala das naves');
  // Colunas 64 a 66: a carga do Canhão de Faíscas e a do Descarregador saem paradas e
  // aceleram até 0,5 m/ms; a Lâmina Reforçada sai a 0,5 e freia.
  assert.deepEqual(DISPARO_ORIGINAL.o112028.carga, { v0: 0, vmax: 0.5, acel: 0.0003 });
  assert.deepEqual(DISPARO_ORIGINAL.o112010.carga, { v0: 0, vmax: 0.5, acel: 0.0003 });
  assert.deepEqual(DISPARO_ORIGINAL.o112003.carga, { v0: 0.5, vmax: 0.5, acel: -0.0002 });
  // A Onda de Sopro Acron sai a 0,2 m/ms e acelera 0,0004 até 0,5.
  assert.deepEqual(DISPARO_ORIGINAL.o112030.carga, { v0: 0.2, vmax: 0.5, acel: 0.0004 });
  // Terceira leva: os canhões e o Bombardeiro Elétrico como o Descarregador; os mísseis
  // saem a −0,05 (caindo para trás) e aceleram 0,0002 até 0,4; a Armadilha Circular sai a
  // 0,2 e freia 0,0001.
  for (const k of ['o112011', 'o112027', 'o112025']) assert.deepEqual(DISPARO_ORIGINAL[k].carga, { v0: 0, vmax: 0.5, acel: 0.0003 }, k);
  for (const k of ['o112020', 'o112009']) assert.deepEqual(DISPARO_ORIGINAL[k].carga, { v0: -0.05, vmax: 0.4, acel: 0.0002 }, k);
  assert.deepEqual(DISPARO_ORIGINAL.o112004.carga, { v0: 0.2, vmax: 0.2, acel: -0.0001 });
  const comCarga = ['o112028', 'o112010', 'o112003', 'o112030', 'o112011', 'o112027', 'o112025', 'o112020', 'o112009', 'o112004'];
  for (const k of Object.keys(DISPARO_ORIGINAL)) if (!comCarga.includes(k)) assert.equal(DISPARO_ORIGINAL[k].carga, undefined, k);
  // O Teleporte toca o CUnitTeleportEffect (1163010) na saída e na chegada.
  assert.equal(DISPARO_ORIGINAL.o112021.teleporte, '1163010');
  // Coluna 53 do subprojétil 113001 vazia (modo 0): o clarão dos clones parado onde nascem.
  assert.equal(DISPARO_ORIGINAL.o112001.claraoSub, 'parado');
  assert.equal(golpeDaArma('o112001', 1, 1).vis.d, '1150005');
  assert.equal(golpeDaArma('o112001', 1, 2).vis.d, undefined);
});

test('disparo original: os efeitos de todas as versões estão convertidos e vão na tela de carregamento', () => {
  const ids = efeitosDoDisparo();
  const partida = insumosDaPartida('shrewdo', 'mobile').efeitosOriginais;
  for (const id of ids) {
    assert.ok(EFEITOS_ORIGINAIS.includes(id), `efeito ${id} na lista`);
    assert.ok(partida.includes(id), `efeito ${id} no carregamento`);
    assert.equal(efeito(id).id, id);
  }
  // O projétil muda com a versão (V1–V3, V4–V6, V7–V8, como o .3dx maior do original);
  // o clarão e o impacto são os mesmos em todas.
  const projeteis = (kind) => WEAPONS[kind].versoes.map((v) => v.golpe.vis.p);
  assert.deepEqual(projeteis('o111001'), ['1312003', '1312003', '1312003', '1312004', '1312004', '1312004', '1312005', '1312005']);
  assert.deepEqual(projeteis('o311001'), projeteis('o111001'), 'o Feixe Duplo usa o feixe do Rifle Triplo');
  assert.deepEqual(projeteis('o211001'), ['1312073', '1312073', '1312073', '1312074', '1312074', '1312074', '1312075', '1312075']);
  assert.deepEqual(projeteis('o111011'), projeteis('o211011'), 'os dois Vulcans, o mesmo projétil');
  assert.deepEqual(projeteis('o311004'), ['1321003', '1321003', '1321003', '1321004', '1321004', '1321004', '1321005', '1321005']);
  // O impacto da Lâmina Reforçada e do Míssil Clone cresce com a versão (1401107 → 1401307).
  for (const kind of Object.keys(DISPARO_ORIGINAL)) {
    const vis = WEAPONS[kind].versoes.map((v) => v.golpe.vis);
    assert.equal(new Set(vis.map((v) => v.d)).size, 1, `${kind}: um clarão`);
    if (!['o112003', 'o112001'].includes(kind)) assert.equal(new Set(vis.map((v) => v.i)).size, 1, `${kind}: um impacto`);
  }
  assert.deepEqual([1, 4, 7].map((nv) => golpeDaArma('o112003', nv).vis.i), ['1401107', '1401207', '1401307']);
  assert.deepEqual([1, 4, 8].map((nv) => golpeDaArma('o112001', nv, 2).vis.i), ['1401007', '1401107', '1401307']);
  // Segunda leva: os projéteis de cada degrau, a armadilha, as esferas e os estados na nave.
  assert.deepEqual(projeteis('o111009'), projeteis('o211001'), 'o Feixe Circular usa os anéis do Feixe Bellico');
  assert.deepEqual(projeteis('o111005'), ['1312053', '1312053', '1312053', '1312054', '1312054', '1312054', '1312055', '1312055']);
  assert.deepEqual(projeteis('o111017'), ['1321023', '1321023', '1321023', '1321024', '1321024', '1321024', '1321025', '1321025']);
  assert.deepEqual(projeteis('o111019'), ['1321241', '1321241', '1321241', '1321341', '1321341', '1321341', '1321441', '1321441']);
  assert.deepEqual(projeteis('o112003'), ['1361031', '1361031', '1361031', '1361032', '1361032', '1361032', '1361033', '1361033']);
  assert.deepEqual(golpeDaArma('o116006', 1, 1).vis, { tipo: 'esfera_que_cresce', p: '2132018', i: '1421001' });
  assert.equal(golpeDaArma('o112034', 1, 1).vis.a, '2253006');
  for (const [k, id] of [['o112006', '1332034'], ['o112002', '2132017'], ['o112024', '1353021']]) {
    assert.deepEqual(projeteis(k), Array(8).fill(id), k);
    assert.equal(golpeDaArma(k, 1).vis.tipo, 'esfera_que_cresce', k);
  }
  // A Onda de Sopro Acron: a onda 1162023 em todas as versões, o raio de acerto crescendo (o desenho não).
  assert.deepEqual(projeteis('o112030'), Array(8).fill('1162023'));
  assert.equal(golpeDaArma('o112030', 1).cresce.raio, 25, 'raio 100 do original × 0,25');
  for (const id of ['2253006', '2132018', '1162023', '1131456', '1401207', ...Object.values(ESTADOS_NA_NAVE), ESCUDO_REC.acron.quantum, ESCUDO_REC.shrewdo.esfera]) {
    assert.ok(ids.includes(id), id);
  }
  assert.equal(golpeDaArma('o111001', 1).vis.d, '2112001');
  assert.equal(golpeDaArma('o311004', 1).vis.d, '1121001');
  assert.equal(golpeDaArma('o311004', 8).vis.f, '1421002');
  // As revistas: o Feixe Perfurante de Magma com o clarão e o impacto dos feixes e o
  // feixe vermelho de cada degrau; o Canhão de Faíscas com a carga de cada degrau e a
  // esfera que cresce (e o impacto das faíscas) no subprojétil; o Rebatedor, o anel.
  assert.deepEqual(projeteis('o111003'), ['1312063', '1312063', '1312063', '1312064', '1312064', '1312064', '1312065', '1312065']);
  assert.equal(golpeDaArma('o111003', 1).vis.d, '2112001');
  assert.equal(golpeDaArma('o111003', 1).vis.i, '1412001');
  assert.deepEqual(projeteis('o112028'), ['1335003', '1335003', '1335003', '1335004', '1335004', '1335004', '1335005', '1335005']);
  assert.equal(golpeDaArma('o112028', 1).vis.d, '1133002');
  assert.deepEqual(golpeDaArma('o112028', 8, 1).vis, { tipo: 'esfera_que_cresce', p: '2142018', i: '1421001' });
  assert.deepEqual(golpeDaArma('o112014', 8).vis, { d: '1162020', p: '1162020' });
  for (const id of ['2142018', '1421001', '1162020']) assert.ok(ids.includes(id), id);
  // O 1412002 entra pelos feixes em círculo; no Magma (o fim da V8 tem área 0 no
  // original) ele não aparece: a arma não tem `fim`.
  assert.ok(ids.includes('1412002'));
  assert.equal(DISPARO_ORIGINAL.o111003.fim, undefined, 'o fim da V8 do Magma (área 0) não aparece no original');
});

test('disparo original: a forma dos efeitos é a do original', () => {
  // O clarão dos feixes dura um quadro; o dos Vulcans, 11, a alfa caindo de 1 a 0,2 e
  // esticando para a frente (o x do original).
  assert.equal(efeito('2112001').quadros, 1);
  const vulcan = efeito('1121001');
  assert.equal(vulcan.quadros, 11);
  assert.deepEqual(vulcan.blocos.map((l) => l[0][6]), [1, 1, 1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2]);
  // O feixe é um plano deitado (z = 0, sem virar para a câmera) que avança da boca (x de 0
  // a 21 m do original), maior a cada degrau de versão.
  const comprimento = (id) => {
    const e = efeito(id);
    const p = e.pecas[0];
    assert.ok(e.blocos.every((l) => !(l[0][2] & 8)), `${id}: deitado, não vira para a câmera`);
    for (let i = 2; i < p.pos.length; i += 3) assert.ok(Math.abs(p.pos[i]) < 1e-6, `${id}: plano`);
    const xs = p.pos.filter((_, i) => i % 3 === 0);
    assert.ok(Math.min(...xs) > -0.1, `${id}: começa na boca`);
    return Math.max(...xs);
  };
  const [v1, v4, v7] = ['1312003', '1312004', '1312005'].map(comprimento);
  assert.ok(v1 > 21 && v1 < v4 && v4 < v7, `${v1} < ${v4} < ${v7}`);
  // O Feixe Bellico: três anéis girando em volta do tiro (21 quadros, repete).
  const bellico = efeito('1312073');
  assert.equal(bellico.pecas.length, 3);
  assert.equal(bellico.quadros, 21);
  // A bala dos Vulcans e a da Metralha são sólidas (textura sem alfa), com a luz aditiva.
  assert.ok(efeito('1321013').opacas.includes('1321011_01'));
  assert.ok(efeito('1321003').opacas.includes('gun'));
  // As faíscas do impacto das metralhadoras voam para a frente do efeito (+x do original).
  const faisca = efeito('1421001').pecas[1].q;
  assert.ok(faisca.at(-1)[12] - faisca[0][12] > 10, 'andam no x');
  // O anel do fim da Metralha tem raio ~100 no maior quadro: o modo 7 escala por área / 100.
  const fim = efeito('1421002');
  const raios = fim.pecas.map((p) => Math.max(...p.pos.filter((_, i) => i % 3 === 1).map(Math.abs)));
  assert.ok(raios.every((r) => r > 0.95 * RAIO_AREA_ORIGINAL && r < 1.1 * RAIO_AREA_ORIGINAL), raios.join());
});

/**
 * Raio no chão da peça `i` do efeito no quadro `q`: a meia-largura do quadrado (a
 * textura é redonda dentro dele) × a escala da matriz do quadro (o quadrado gira).
 */
function raioNoQuadro(e, q, i = 0) {
  const p = e.pecas[i];
  const m = p.q[e.blocos[q][i][0]] ?? p.m;
  const meia = Math.max(...p.pos.filter((_, k) => k % 3 === 0).map(Math.abs));
  return meia * Math.hypot(m[0], m[1], m[2]);
}

test('disparo original: a forma dos efeitos das revistas é a do original', () => {
  // O feixe do Magma: dois planos deitados (texturas do feixe vermelho), 16 quadros, maior a cada degrau.
  for (const id of ['1312063', '1312064', '1312065']) {
    const e = efeito(id);
    assert.equal(e.quadros, 16, id);
    assert.ok(e.pecas.every((p) => p.tex === '1312051'), id);
    assert.ok(e.blocos.every((l) => l.every((b) => !(b[2] & 8))), `${id}: deitado`);
  }
  // O clarão do canhão: a bola que cresce 5,5× e some em 21 quadros.
  const clarao = efeito('1133002');
  assert.equal(clarao.quadros, 21);
  assert.ok(clarao.blocos.at(-1)[0][6] === 0, 'some no fim');
  // A carga: virada para a câmera, trocando as 15 texturas charge_vox da paleta.
  const carga = efeito('1335003');
  assert.ok(carga.blocos.every((l) => (l[0][2] & 9) === 9), 'paleta e câmera');
  assert.equal(carga.mpal.length, 15);
  // A esfera que cresce e o anel do Rebatedor: deitados, chegam a raio 100 (a escala do original é raio / 100).
  const esfera = efeito('2142018');
  assert.equal(esfera.quadros, 35);
  assert.ok(perto(raioNoQuadro(esfera, 34), RAIO_AREA_ORIGINAL, 1.5), `${raioNoQuadro(esfera, 34)}`);
  assert.ok(raioNoQuadro(esfera, 0) < 0.2 * RAIO_AREA_ORIGINAL, 'começa pequena');
  const anel = efeito('1162020');
  assert.equal(anel.quadros, 12);
  assert.ok(perto(raioNoQuadro(anel, 11), RAIO_AREA_ORIGINAL, 1.5), `${raioNoQuadro(anel, 11)}`);
  for (const e of [esfera, anel]) assert.ok(e.blocos.every((l) => !(l[0][2] & 8)), `${e.id}: deitado`);
});

test('disparo original: o feixe do Magma atravessa; a carga e o Rebatedor não', () => {
  for (let nv = 1; nv <= 8; nv++) assert.equal(atravessa(golpeDaArma('o111003', nv)), true, `V${nv}`);
  assert.equal(atravessa(golpeDaArma('o112028', 1)), false);
  assert.equal(atravessa(golpeDaArma('o112028', 1, 1)), false, 'a nova não é projétil');
  assert.equal(atravessa(golpeDaArma('o112014', 1)), false);
  assert.equal(atravessa(golpeDaArma('o111001', 1)), false);
  assert.equal(atravessa(null), false);
  // A V8 tem o fim 1412002 no modo 7 com área 0 no original (escala 0): o servidor não explode.
  const v8 = golpeDaArma('o111003', 8);
  assert.equal(v8.area, 0);
  assert.equal(v8.fim, false);
});

test('disparo original: a carga do Canhão de Faíscas sai devagar e chega junto com o tiro do jogo', () => {
  const g = golpeDaArma('o112028', 1);
  const carga = DISPARO_ORIGINAL.o112028.carga;
  assert.equal(recuoDaCarga(0, g, carga), 0, 'sai da boca');
  assert.ok(recuoDaCarga(g.vida, g, carga) < 1e-9, 'chega ao fim junto');
  // No meio do caminho ela está atrás (acelerando); o recuo é o que falta à curva do original.
  const meio = recuoDaCarga(0.5, g, carga);
  const andouOriginal = (0.0003 * 500 ** 2) / 2; // m do original em 0,5 s, ainda acelerando
  const total = 0.5 * 1900 - 0.5 ** 2 / (2 * 0.0003); // vmax × T − vmax² / 2a
  assert.ok(perto(meio, g.vel * 0.5 - g.vel * g.vida * (andouOriginal / total), 1e-9), `${meio}`);
  assert.ok(meio > 40, 'bem atrás no começo');
  // Nunca à frente do tiro do jogo, e o recuo some no fim.
  let antes = Infinity;
  for (let t = 0; t <= g.vida + 0.2; t += 0.05) {
    const r = recuoDaCarga(t, g, carga);
    assert.ok(r >= 0, `t ${t}`);
    if (t > 1.2) {
      assert.ok(r <= antes + 1e-9, `t ${t}: só diminui no fim`);
      antes = r;
    }
  }
});

test('disparo original: a Lâmina Reforçada sai na frente do tiro do jogo e chega junto (freia)', () => {
  const g = golpeDaArma('o112003', 1);
  const carga = DISPARO_ORIGINAL.o112003.carga;
  // O alcance do original (0,5 × 1500 − 0,0001 × 1500² = 525) é o do jogo × 2.
  assert.ok(perto(g.alcance * 2, 525, 1e-6), `${g.alcance}`);
  assert.equal(recuoDaCarga(0, g, carga), 0, 'sai da boca');
  assert.ok(Math.abs(recuoDaCarga(g.vida, g, carga)) < 1e-9, 'chega ao fim junto');
  for (let t = 0.05; t < g.vida; t += 0.05) assert.ok(recuoDaCarga(t, g, carga) < 0, `t ${t}: na frente (mais rápida no começo)`);
});

test('disparo original: o que explode no fim da vida (coluna 74, 6º dígito 2) deixa o impacto ali', () => {
  // Bombardeiro Frontal, Lâmina Reforçada, Canhão Descarregador, Ciclone e a carga da
  // Armadilha Supressora explodem no fim; os feixes, a Metralha Rotativa e o Míssil Clone não.
  for (const k of ['o111019', 'o112003', 'o112010', 'o116006', 'o112034']) assert.equal(explodeNoFim(golpeDaArma(k, 1)), true, k);
  for (const k of ['o111009', 'o111005', 'o111017', 'o112001', 'o111001']) assert.equal(explodeNoFim(golpeDaArma(k, 1)), false, k);
  assert.equal(explodeNoFim(golpeDaArma('o112001', 1, 1)), false, 'o clone que se divide some sem nada');
  assert.equal(explodeNoFim(null), false);
});

test('disparo original: o reparo do escudo solta quanta que se afastam 20 m em 25 quadros', () => {
  assert.deepEqual(ESCUDO_REC.acron, { quantum: '1163005_01', esfera: '1163005_02' });
  assert.deepEqual(ESCUDO_REC.bellico, { quantum: '1163004_01', esfera: '1163004_02' });
  assert.deepEqual(ESCUDO_REC.shrewdo, { quantum: '1163003_01', esfera: '1163003_02' });
  assert.equal(quantumDoEscudo(0), 0);
  assert.ok(perto(quantumDoEscudo(12.5), 10));
  assert.ok(perto(quantumDoEscudo(25), 20, 1e-9), 'chega na borda');
  assert.equal(quantumDoEscudo(25.5), null, 'virou a esfera');
  const d = direcaoDoQuantum(0.99, 0, 0.5);
  assert.ok(perto(Math.hypot(d.x, d.y, d.z), 1));
  assert.ok(d.x > 0 && d.y < 0 && d.z === 0, 'rand % 20 − 10 em cada eixo');
  assert.deepEqual(direcaoDoQuantum(0.5, 0.5, 0.5), { x: 1, y: 0, z: 0 }, 'sorteio nulo não divide por zero');
  // Os estados na nave: o conversor (24), a resistência elétrica (23), a óptica (21) e a física (22).
  assert.deepEqual(ESTADOS_NA_NAVE, { converte: '1163023', resEl: '2163033', resOp: '2163012', resFis: '2163013' });
});

test('disparo original: o clarão gira em passos de 36° no modo 14 e fica preso no 15', () => {
  assert.equal(giroDoClarao('preso', 0.73), 0);
  assert.equal(giroDoClarao('giro', 0), 0);
  assert.ok(perto(giroDoClarao('giro', 0.35), 3 * GIRO_PASSO));
  assert.ok(perto(giroDoClarao('giro', 0.999999), 9 * GIRO_PASSO));
  assert.ok(perto(GIRO_PASSO, Math.PI / 5, 1e-7));
});

test('disparo original: os projéteis paralelos saem espalhados em volta da boca, na altura do tiro', () => {
  const nave = { x: 120, y: 10, z: -40, yaw: 0.7, vx: 0, vz: 0 };
  const g = golpeDaArma('o111001', 1);
  const boca = { x: 118.5, y: 9.2, z: -44 };
  const f = forward(nave.yaw);
  const inicios = g.tiros.map(({ off, ang }) => {
    const b = createBullet(nave, 'o111001', 't', 1, off, ang, 1, g);
    const p = inicioDoTiro(b, boca, nave);
    assert.equal(p.y, b.y, 'na altura de voo, como o original (z = 0 da matriz de tiro)');
    // Do mesmo lado e na mesma distância da boca que o tiro tem da linha da nave.
    assert.ok(perto((p.x - boca.x) * -f.z + (p.z - boca.z) * f.x, off, 1e-9));
    assert.ok(perto((p.x - boca.x) * f.x + (p.z - boca.z) * f.z, 0, 1e-9));
    return p;
  });
  assert.equal(inicios.length, 3);
  assert.ok(perto(Math.hypot(inicios[2].x - inicios[0].x, inicios[2].z - inicios[0].z), 2 * 3.25, 1e-9), 'o vão entre os canos');
});

test('disparo original: o impacto sai no casco do alvo, a 0,85 do raio, do lado de onde o tiro veio', () => {
  const centro = { x: 10, y: 12, z: 5 };
  const p = pontoDoImpacto(centro, 7.5, { x: 10, y: 10, z: 50 });
  assert.ok(perto(p.x, 10) && perto(p.z, 5 + 7.5 * IMPACTO_NO_CASCO) && p.y === 12);
  const q = pontoDoImpacto(centro, 10, { x: 13, z: 9 });
  assert.ok(perto(Math.hypot(q.x - 10, q.z - 5), 8.5));
  assert.deepEqual(pontoDoImpacto(centro, 7.5, null), centro, 'sem de onde: o centro');
  assert.deepEqual(pontoDoImpacto(centro, 0, { x: 0, z: 0 }), centro, 'sem raio (torre): o ponto do evento');
});

test('disparo original: o fim do servidor só vira impacto quando o tiro bateu antes da vida acabar', () => {
  const b = { x: 0, y: 10, z: 0, vx: 300, vy: 0, vz: 0, vida: 1 };
  assert.equal(acabouAntes(b, 40, 0), true, 'bateu 40 m à frente com quase 1 s de vida');
  assert.equal(acabouAntes(b, -5, 0), true, 'bateu atrás de onde o desenho está (torre que o cliente não conhece)');
  assert.equal(acabouAntes({ ...b, vida: 0.06 }, 18, 0), false, 'só acabou a vida (o cliente vem um pouco atrás)');
  // Um tiro que acaba a vida no cliente chega ao mesmo ponto que o do servidor.
  const t = createBullet({ x: -900, y: 10, z: 0, yaw: -Math.PI / 2, vx: 0, vz: 0 }, 'o311001', 'x', 1, 0, 0, 1);
  const c = { ...t };
  while (stepBullet(c));
  assert.ok(c.vida <= 0, 'no lago aberto o tiro só acaba pela vida');
  assert.equal(acabouAntes({ ...t, vida: 0.05 }, c.x, c.z), false);
});

test('disparo original: o fim da Metralha, a esfera do Canhão e o anel do Rebatedor esticam até a área de cada versão', () => {
  assert.ok(perto(escalaDaArea(17.5), 0.175));
  const areas = WEAPONS.o311004.versoes.map((v) => v.golpe.area);
  assert.deepEqual(areas, [17.5, 18.75, 20, 21.25, 22.5, 23.75, 25, 26.25], 'a área do original (70 a 105) × 0,25');
  for (const a of areas) assert.ok(perto(escalaDaArea(a) * RAIO_AREA_ORIGINAL, a), 'o anel chega à borda da área');
  // A esfera: o raio da nova (300 a 500 do original × 0,25); o Rebatedor: a área (180 a 280 × 0,25).
  assert.deepEqual(WEAPONS.o112028.versoes.map((v) => v.golpe.divide.nova.raio), [75, 82.5, 90, 97.5, 105, 112.5, 117.5, 125]);
  assert.deepEqual(WEAPONS.o112014.versoes.map((v) => v.golpe.area), [45, 47.5, 50, 52.5, 55, 60, 65, 70]);
});

test('terceira leva: o rastro dos mísseis estica pelo caminho, como o CUnitMissileTail do original', () => {
  // Os dois mísseis são do tipo 6 (com rastro) e o rastro é o 2343101, com pele.
  for (const k of ['o112020', 'o112009']) {
    const vis = golpeDaArma(k, 1).vis;
    assert.deepEqual([vis.tipo, vis.r], ['missil_com_rastro', '2343101'], k);
  }
  // Histórico de 16 quadros, 4 ossos: Bone01 no de agora, Bone02 no 4, Bone03 no 8 e o último no mais velho.
  assert.deepEqual([0, 1, 2, 3].map((k) => quadroDoOsso(k, 4, 16)), [0, 4, 8, 15]);
  const r = efeito('2343101');
  assert.deepEqual([r.rastro, r.ossos, r.historico, r.tex], [true, 4, 16, '1343007_01']);
  // Ponto de cada vértice com o osso k na matriz de "andou d para trás a cada quadro"
  // (só translação no x do original: o míssil voando reto para +x).
  const fita = (d) =>
    r.inf.map((linha) => linha.reduce((x, [k, w, ux]) => x + w * (ux - d * quadroDoOsso(k, r.ossos, r.historico)), 0));
  // Parado (o primeiro quadro enche o histórico com a mesma matriz): a fita encolhe no
  // corpo do míssil (0 a ~13 m do original à frente do nó Tail; o míssil vai de 0 a 12,3).
  const parado = fita(0);
  assert.ok(Math.min(...parado) > -1 && Math.max(...parado) < 14);
  // Voando 16,7 m do original por quadro (0,4 m/ms a 24 por segundo): a ponta (meio
  // peso no Bone03 e no Bone04) fica entre onde ele estava 8 e 15 quadros atrás.
  const voando = fita(16.7);
  assert.ok(Math.min(...voando) < -180 && Math.max(...voando) < 14, 'estica para trás');
});

test('terceira leva: camuflagem translúcida como no original e o teleporte com o efeito na saída e na chegada', () => {
  assert.equal(ALFA_CAMUFLADA, 0.3);
  assert.ok(efeitosDoDisparo().includes('1163010'));
  const tele = efeito('1163010');
  assert.equal(tele.quadros, 27);
});

test('quarta leva: os feixes e a metralha teleguiados e a Metralha Larga como no original', () => {
  const projeteis = (kind) => WEAPONS[kind].versoes.map((v) => v.golpe.vis.p);
  const degraus = (a, b, c) => [a, a, a, b, b, b, c, c];
  // Feixe Tempestade Reforçado: o feixe 1312033/34/35 de cada degrau, teleguiado aos 100 ms
  // (coluna 69 = 1, 70 = 100), o impacto dos feixes e o fim 1412002 deitado pela área
  // (coluna 94 = 7; não explode no fim da vida: coluna 74 = 111211).
  assert.deepEqual(projeteis('o116005'), degraus('1312033', '1312034', '1312035'));
  const tempestade = golpeDaArma('o116005', 1);
  assert.deepEqual([tempestade.vis.d, tempestade.vis.i, tempestade.vis.f], ['2112001', '1412001', '1412002']);
  assert.ok(perto(tempestade.guia.comeca, 0.1) && tempestade.area > 0 && !explodeNoFim(tempestade));
  // Metralha Larga: a bala dos Vulcans, o clarão 1121001 preso e o fim da Metralha pela área.
  assert.deepEqual(projeteis('o111013'), degraus('1321013', '1321014', '1321015'));
  assert.deepEqual(Object.values(golpeDaArma('o111013', 1).vis), ['1121001', '1321013', '1421001', '1421002']);
  // Metralha Teleguiada: 3 a 5 balas 1321033/34/35 em leque, teleguiadas desde 1 ms, sem área nem fim.
  assert.deepEqual(projeteis('o111015'), degraus('1321033', '1321034', '1321035'));
  const setor = golpeDaArma('o111015', 1);
  assert.deepEqual([setor.tiros.length, golpeDaArma('o111015', 8).tiros.length, setor.vis.f, setor.area], [3, 5, undefined, 0]);
  assert.ok(perto(setor.guia.comeca, 0.001));
  // A bala teleguiada tem três peças: a bala sólida e os brilhos da Metralha Shrewdo.
  assert.equal(efeito('1321033').pecas.length, 3);
});
