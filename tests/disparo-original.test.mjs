// Disparo das armas de início como no AstroN original (public/js/disparo-regras.js e
// disparo-original.js): quais efeitos do original cada arma usa em cada versão, se eles
// estão convertidos e na lista do carregamento, a forma deles (o clarão de um quadro dos
// feixes, o projétil deitado que avança da boca, as faíscas do impacto, o anel do fim
// com raio 100) e as contas de onde cada peça aparece.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DISPARO_ORIGINAL,
  GIRO_PASSO,
  IMPACTO_NO_CASCO,
  RAIO_FIM_ORIGINAL,
  ESCALA_DISPARO,
  efeitosDoDisparo,
  giroDoClarao,
  inicioDoTiro,
  pontoDoImpacto,
  acabouAntes,
  escalaDoFim,
} from '../public/js/disparo-regras.js';
import { EFEITOS_ORIGINAIS, insumosDaPartida } from '../public/js/insumos.js';
import { INICIAIS_ORIGINAL, WEAPONS, golpeDaArma } from '../shared/armas.js';
import { FATOR_TAMANHO_NAVE } from '../shared/naves.js';
import { createBullet, stepBullet, forward } from '../shared/sim.js';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const efeito = (id) => JSON.parse(readFileSync(path.join(RAIZ, 'public/modelos/efeitos', `${id}.json`), 'utf8'));
const perto = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

test('disparo original: as seis armas de início, com o modo de clarão e de fim do original', () => {
  const iniciais = Object.values(INICIAIS_ORIGINAL).flat().map((id) => 'o' + id);
  assert.deepEqual(Object.keys(DISPARO_ORIGINAL).sort(), iniciais.sort());
  // Coluna 53 do inititemweapon.cfg: 14 (girado em volta do cano) nos feixes e no Vulcan
  // Bellico, 15 (preso, sem giro) no Vulcan Acron e na Metralha; coluna 94 = 7 só na Metralha.
  assert.deepEqual(
    Object.fromEntries(Object.entries(DISPARO_ORIGINAL).map(([k, v]) => [k, v.clarao])),
    { o111001: 'giro', o111011: 'preso', o211001: 'giro', o211011: 'giro', o311001: 'giro', o311004: 'preso' },
  );
  for (const [k, v] of Object.entries(DISPARO_ORIGINAL)) assert.equal(v.fim, k === 'o311004' ? 'area' : undefined, k);
  assert.equal(ESCALA_DISPARO, FATOR_TAMANHO_NAVE, 'na escala das naves');
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
  assert.ok(raios.every((r) => r > 0.95 * RAIO_FIM_ORIGINAL && r < 1.1 * RAIO_FIM_ORIGINAL), raios.join());
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

test('disparo original: o fim da Metralha estica até a área de cada versão', () => {
  assert.ok(perto(escalaDoFim(17.5), 0.175));
  const areas = WEAPONS.o311004.versoes.map((v) => v.golpe.area);
  assert.deepEqual(areas, [17.5, 18.75, 20, 21.25, 22.5, 23.75, 25, 26.25], 'a área do original (70 a 105) × 0,25');
  for (const a of areas) assert.ok(perto(escalaDoFim(a) * RAIO_FIM_ORIGINAL, a), 'o anel chega à borda da área');
});
