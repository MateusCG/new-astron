// Disparo das armas desenhadas como no AstroN original (public/js/disparo-regras.js e
// disparo-original.js): as de início e as revistas depois (Feixe Perfurante de Magma,
// Canhão de Faíscas, Rebatedor de Projéteis). Quais efeitos do original cada arma usa em
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

test('disparo original: as seis armas de início e as revistas, com o modo de clarão e de fim do original', () => {
  const iniciais = Object.values(INICIAIS_ORIGINAL).flat().map((id) => 'o' + id);
  assert.deepEqual(Object.keys(DISPARO_ORIGINAL).sort(), [...iniciais, ...REVISTAS].sort());
  // Coluna 53 do inititemweapon.cfg: 14 (girado em volta do cano) nos feixes e no Vulcan
  // Bellico, 15 (preso, sem giro) no Vulcan Acron, na Metralha e no Canhão de Faíscas, 2
  // (parado onde a nave estava, pela área) no Rebatedor; coluna 94 = 7 só na Metralha
  // (a V8 do Feixe Perfurante de Magma também, mas com área 0: não aparece).
  assert.deepEqual(
    Object.fromEntries(Object.entries(DISPARO_ORIGINAL).map(([k, v]) => [k, v.clarao])),
    { o111001: 'giro', o111011: 'preso', o211001: 'giro', o211011: 'giro', o311001: 'giro', o311004: 'preso', o111003: 'giro', o112028: 'preso', o112014: 'area' },
  );
  for (const [k, v] of Object.entries(DISPARO_ORIGINAL)) assert.equal(v.fim, k === 'o311004' ? 'area' : undefined, k);
  assert.equal(ESCALA_DISPARO, FATOR_TAMANHO_NAVE, 'na escala das naves');
  // Colunas 64 a 66: a carga do Canhão de Faíscas sai parada e acelera até 0,5 m/ms.
  assert.deepEqual(DISPARO_ORIGINAL.o112028.carga, { v0: 0, vmax: 0.5, acel: 0.0003 });
  for (const k of Object.keys(DISPARO_ORIGINAL)) if (k !== 'o112028') assert.equal(DISPARO_ORIGINAL[k].carga, undefined, k);
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
  for (const kind of Object.keys(DISPARO_ORIGINAL)) {
    const vis = WEAPONS[kind].versoes.map((v) => v.golpe.vis);
    assert.equal(new Set(vis.map((v) => v.d)).size, 1, `${kind}: um clarão`);
    assert.equal(new Set(vis.map((v) => v.i)).size, 1, `${kind}: um impacto`);
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
  assert.ok(!ids.includes('1412002'), 'o fim da V8 do Magma (área 0) não aparece no original');
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
