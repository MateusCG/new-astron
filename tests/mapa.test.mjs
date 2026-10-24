// Mapa da partida (o lago do Stage 6 no formato do desenho 2D do Mateus): a lane
// horizontal com a mineradora no meio, as bases nas pontas, a jungle em cima e
// embaixo com rochas, asteroides, acampamentos, buffs, plataformas de pouso e os
// dois poços (Núcleo e Medusa). Estes testes seguram o contrato de shared/terrain.js
// que as outras frentes (jungle, objetivos, visão, cliente) usam.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  heightAt,
  paredeAt,
  noMapaAberto,
  rochaEm,
  areaPouso,
  podePousar,
  topoPouso,
  emAsteroides,
  trajetoSonda,
  BASE,
  BASES,
  BOLSAO,
  LANE,
  CORREDOR,
  MINERADORA,
  DOCAS,
  ESPERAS,
  HANGARES,
  noHangar,
  CAMPOS_BASE,
  CAMPO_BASE_DIST,
  BACIA,
  BACIAS,
  VAGAS_BACIA,
  ESPERAS_BACIA,
  cruzaCampoBase,
  dentroDoCampo,
  encostaNoCampo,
  SERVICOS,
  OBJETIVOS,
  ROTAS,
  TORRETAS,
  ROCHAS,
  ASTEROIDES,
  ACAMPAMENTOS,
  BUFFS,
  PLATAFORMAS_POUSO,
  SONDA_TRAJETO,
  NUCLEO,
  MEDUSA,
  NIVEL_AGUA,
  ABERTO,
  AREAS_POUSO,
  MAP_HALF_X,
  MAP_HALF_Z,
  LARGURA_LANE,
} from '../shared/terrain.js';
import { alturaSolida, pontoLivre, OBSTACULOS, POCOS, TORRE_SUPORTE } from '../shared/obstaculos.js';
import { createShip, stepShip, MAX_SLOPE, SHIP_RADIUS, ALTURA_POUSADO, HOVER } from '../shared/sim.js';
import { FAIXA_MINERADOR, pontoRota } from '../server/mineradores.js';

const PARADO = { th: 0, tu: 0, b: false, f1: false, f2: false, p: false };
const mirar = (x, z, ax, az) => Math.atan2(-(ax - x), -(az - z));
function angulo(d) {
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}
const circulo = (cx, cz, r, passo = 30) =>
  Array.from({ length: 360 / passo }, (_, k) => [cx + Math.cos((k * passo * Math.PI) / 180) * r, cz + Math.sin((k * passo * Math.PI) / 180) * r]);

/** Piloto simples: segue os pontos em ordem. Retorna quantos alcançou. */
function voar(s, pontos, { segundos = 90, chegou = 25 } = {}) {
  let i = 0;
  for (let t = 0; t < 30 * segundos && i < pontos.length; t++) {
    const p = pontos[i];
    if (Math.hypot(p.x - s.x, p.z - s.z) < (i === pontos.length - 1 ? chegou : 25)) {
      i++;
      continue;
    }
    const diff = angulo(mirar(s.x, s.z, p.x, p.z) - s.yaw);
    stepShip(s, { ...PARADO, th: Math.abs(diff) > 0.6 ? 0.3 : 1, tu: Math.max(-1, Math.min(1, diff * 3)) });
    assert.ok(heightAt(s.x, s.z) < 12, `subiu na rocha em (${s.x.toFixed(0)}, ${s.z.toFixed(0)})`);
    assert.equal(alturaSolida(s.x, s.z), heightAt(s.x, s.z), `entrou em construção em (${s.x.toFixed(0)}, ${s.z.toFixed(0)})`);
  }
  return i;
}

/** Grade de 10 m com a regra de rampa da nave; `bloquear(x, z)` fecha células à força. */
function alcance(origem, bloquear = () => false) {
  const passo = 10;
  const nx = Math.floor((2 * MAP_HALF_X) / passo) + 1;
  const nz = Math.floor((2 * MAP_HALF_Z) / passo) + 1;
  const pX = (i) => -MAP_HALF_X + i * passo;
  const pZ = (j) => -MAP_HALF_Z + j * passo;
  const h = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) h[j * nx + i] = bloquear(pX(i), pZ(j)) ? 1e6 : alturaSolida(pX(i), pZ(j), SHIP_RADIUS);
  }
  const visto = new Uint8Array(nx * nz);
  const ini = Math.round((origem.z + MAP_HALF_Z) / passo) * nx + Math.round((origem.x + MAP_HALF_X) / passo);
  const fila = [ini];
  visto[ini] = 1;
  let maisAlto = 0;
  while (fila.length) {
    const k = fila.pop();
    const i = k % nx;
    const j = (k - i) / nx;
    maisAlto = Math.max(maisAlto, heightAt(pX(i), pZ(j)));
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di;
      const b = j + dj;
      if (a < 0 || b < 0 || a >= nx || b >= nz) continue;
      const kk = b * nx + a;
      if (visto[kk] || (h[kk] - h[k]) / passo > MAX_SLOPE) continue;
      visto[kk] = 1;
      fila.push(kk);
    }
  }
  const alcancado = (x, z) => visto[Math.round((z + MAP_HALF_Z) / passo) * nx + Math.round((x + MAP_HALF_X) / passo)] === 1;
  return { alcancado, maisAlto, visto, nx, nz, pX, pZ };
}

test('mapa: contrato (tamanho, bases, lane, mineradora, docas, serviços)', () => {
  assert.equal(MAP_HALF_X, 1500);
  assert.equal(MAP_HALF_Z, 1120);
  assert.deepEqual(BASES, [
    { time: 0, x: -1280, z: 0, raio: 170 },
    { time: 1, x: 1280, z: 0, raio: 170 },
  ]);
  assert.equal(BASE, BASES[0]);
  assert.deepEqual(ABERTO, { jungle: { meiaX: 1080, meiaZ: 1060 }, lane: { meiaX: 1440, meiaZ: 180 }, canto: 40 });
  // A lane tem 140 m (o vão do antigo arco da entrega).
  assert.equal(LANE.largura, LARGURA_LANE);
  assert.equal(LANE.largura, 140);
  assert.equal(LANE.meiaLargura, 70);
  assert.equal(CORREDOR, LANE, 'apelido antigo');
  assert.deepEqual([LANE.xInicio, LANE.xFim], [-BOLSAO.xMin, BOLSAO.xMin]);
  assert.deepEqual([MINERADORA.x, MINERADORA.z, MINERADORA.meiaX, MINERADORA.meiaZ], [0, 0, 70, 115]);
  assert.ok(MINERADORA.topo >= 90);
  assert.ok(MINERADORA.meiaZ > LANE.meiaLargura, 'a mineradora é mais larga que a lane');
  // A doca fica dentro do hangar do time (porta aberta na face voltada para a base);
  // na frente da porta, do lado de fora, a espera (onde a escolta para).
  assert.deepEqual(DOCAS, [
    { time: 0, x: -38, z: 0 },
    { time: 1, x: 38, z: 0 },
  ]);
  assert.deepEqual(ESPERAS, [
    { time: 0, x: -100, z: 0 },
    { time: 1, x: 100, z: 0 },
  ]);
  for (const h of HANGARES) {
    const d = DOCAS[h.time];
    assert.ok(noHangar(h.time, d.x, d.z) && !noHangar(1 - h.time, d.x, d.z), 'a doca no hangar do próprio time');
    assert.ok(Math.abs(d.x) < MINERADORA.meiaX, 'dentro da mineradora');
    const face = Math.sign(BASES[h.time].x) * MINERADORA.meiaX;
    assert.ok(h.xMin < face && h.xMax > face, 'o hangar abre na face voltada para a base');
    assert.ok(Math.abs(h.xMin) > 0 && Math.sign(h.xMin) === Math.sign(h.xMax), 'um hangar de cada lado, sem se tocar');
  }
  assert.ok(NIVEL_AGUA < 0, 'a água fica abaixo do chão de voo');
  assert.deepEqual(OBJETIVOS, [], 'os objetivos A/B/C saíram');
  // Serviços no bolsão da própria base, Evolução à esquerda de quem olha para a lane.
  for (const s of SERVICOS) {
    const b = BASES[s.time];
    assert.ok(Math.abs(s.x) >= BOLSAO.xMin && Math.abs(s.x) <= BOLSAO.xMax, `${s.servico} ${s.time} no bolsão`);
    const esquerda = b.time === 0 ? s.z < 0 : s.z > 0;
    assert.equal(esquerda, s.servico === 'evolucao');
  }
  assert.deepEqual(NUCLEO, { x: 0, z: -877, raio: 120 });
  assert.deepEqual(MEDUSA, { x: 0, z: 877, raio: 120 });
});

test('mapa: tudo é simétrico por rotação de 180° (justo com os dois times)', () => {
  for (let x = -MAP_HALF_X; x <= MAP_HALF_X; x += 13) {
    for (let z = -MAP_HALF_Z; z <= MAP_HALF_Z; z += 11) {
      assert.equal(heightAt(x, z), heightAt(-x, -z), `(${x}, ${z})`);
    }
  }
  const gemeo = (lista, nome) => {
    for (const o of lista) {
      const g = lista.find((p) => p !== o && Math.abs(p.x + o.x) < 1e-9 && Math.abs(p.z + o.z) < 1e-9);
      assert.ok(g, `${nome} ${o.id ?? o.servico ?? o.time} tem gêmeo`);
      if (o.time !== undefined) assert.equal(g.time, 1 - o.time, `${nome} ${o.id}: território girado`);
      for (const k of ['tipo', 'raio', 'largura', 'profundidade', 'servico']) assert.equal(g[k], o[k], `${nome} ${o.id}: ${k}`);
    }
  };
  gemeo(BASES, 'base');
  gemeo(DOCAS, 'doca');
  gemeo(CAMPOS_BASE, 'campo de força');
  gemeo(BACIAS, 'bacia');
  gemeo(ESPERAS_BACIA, 'espera da bacia');
  for (const t of [0, 1]) {
    // As vagas do time 1 são as do time 0 giradas, na mesma ordem (volta, fundo, ida).
    VAGAS_BACIA[0].forEach((v, k) => assert.ok(Math.abs(VAGAS_BACIA[1][k].x + v.x) < 1e-9 && Math.abs(VAGAS_BACIA[1][k].z + v.z) < 1e-9, `vaga ${k}`));
    assert.equal(CAMPOS_BASE[t].meiaZ, CAMPOS_BASE[1 - t].meiaZ);
  }
  gemeo(SERVICOS, 'serviço');
  gemeo(TORRETAS, 'torreta');
  gemeo(ASTEROIDES, 'asteroide');
  gemeo(ACAMPAMENTOS, 'acampamento');
  gemeo(BUFFS, 'buff');
  gemeo(PLATAFORMAS_POUSO, 'plataforma');
  gemeo(
    ROCHAS.filter((r) => r.forma === 'retangulo'),
    'parede',
  );
  // O trajeto da sonda que nasce embaixo é o de cima girado.
  assert.deepEqual(
    trajetoSonda(1),
    SONDA_TRAJETO.map((p) => ({ x: -p.x, z: -p.z })),
  );
});

test('mapa: as listas da jungle seguem o desenho', () => {
  assert.deepEqual(
    BUFFS.map((b) => [b.id, b.tipo, b.time, b.x, b.z]),
    [
      ['BA0', 'ataque', 0, -855, -909],
      ['BS0', 'suporte', 0, -855, 909],
      ['BA1', 'ataque', 1, 855, 909],
      ['BS1', 'suporte', 1, 855, -909],
    ],
  );
  assert.deepEqual(
    PLATAFORMAS_POUSO.map((p) => [p.id, p.time, p.x, p.z, p.raio]),
    [
      ['P0', 0, -495, -445.5, 28],
      ['P1', 1, 495, 445.5, 28],
    ],
  );
  assert.equal(ACAMPAMENTOS.length, 8);
  for (const t of [0, 1]) {
    const meus = ACAMPAMENTOS.filter((a) => a.time === t);
    assert.equal(meus.filter((a) => a.tipo === 'base').length, 2);
    assert.equal(meus.filter((a) => a.tipo === 'centro').length, 2);
    // Território: metade do time (time 0 à esquerda).
    for (const a of meus) assert.equal(Math.sign(a.x), t === 0 ? -1 : 1, a.id);
  }
  assert.equal(ASTEROIDES.length, 8);
  assert.equal(ROCHAS.filter((r) => r.forma === 'capsula').length, 4, 'rochas dos quadrantes');
  assert.equal(ROCHAS.filter((r) => r.forma === 'retangulo').length, 8, 'duas barras por L, quatro L');
  assert.equal(new Set(ROCHAS.map((r) => r.id)).size, ROCHAS.length, 'ids únicos');
  for (const r of ROCHAS) {
    assert.ok(r.topoMin >= 70 && r.topo >= r.topoMin, `${r.id}: topo`);
    if (r.forma === 'retangulo') assert.ok(r.topoMin >= 80, `${r.id}: parede em L com topo ≥ 80`);
  }
  // Sonda: vai de uma ponta à outra pela coluna central, longe da mineradora.
  assert.deepEqual(SONDA_TRAJETO[0], { x: 0, z: -337.5 });
  assert.deepEqual(SONDA_TRAJETO.at(-1), { x: 0, z: 337.5 });
  for (const p of SONDA_TRAJETO) assert.ok(pontoLivre(p.x, p.z, 20), `sonda em (${p.x}, ${p.z})`);
  for (let i = 1; i < SONDA_TRAJETO.length; i++) {
    const a = SONDA_TRAJETO[i - 1];
    const b = SONDA_TRAJETO[i];
    for (let t = 0; t <= 1; t += 0.05) {
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;
      assert.equal(alturaSolida(x, z, SHIP_RADIUS + 20), 0, `trajeto da sonda livre em (${x.toFixed(0)}, ${z.toFixed(0)})`);
    }
  }
});

test('mapa: a região aberta é a jungle mais a faixa da lane; o resto é rocha', () => {
  // Bem dentro da jungle e da lane, longe das rochas internas: aberto.
  for (const [x, z] of [[-1000, -1000], [1000, 1000], [-1400, 150], [1400, -150], [0, -1040], [-1060, 0], [-1100, -170]]) {
    assert.equal(noMapaAberto(x, z), true, `(${x}, ${z}) aberto`);
    assert.equal(heightAt(x, z), 0, `(${x}, ${z}) plano`);
  }
  // Fora: a borda.
  for (const [x, z] of [[-1100, -300], [1200, 400], [-1460, 0], [0, -1080], [1499, 1119], [-1300, 200]]) {
    assert.equal(noMapaAberto(x, z), false, `(${x}, ${z}) rocha`);
    assert.equal(rochaEm(x, z), 'borda');
    assert.ok(heightAt(x, z) > 25, `(${x}, ${z}) alto`);
  }
  // A borda alta segura a nave: no alto, bem acima das rochas internas.
  assert.ok(heightAt(MAP_HALF_X - 5, 0) > 95, 'borda alta');
  for (let x = -MAP_HALF_X; x <= MAP_HALF_X; x += 23) {
    for (let z = -MAP_HALF_Z; z <= MAP_HALF_Z; z += 23) {
      assert.equal(noMapaAberto(x, z), paredeAt(x, z) === 0);
      assert.equal(noMapaAberto(x, z), rochaEm(x, z) === null);
      if (noMapaAberto(x, z)) assert.equal(heightAt(x, z), 0, `chão plano em (${x}, ${z})`);
      const dentro = (Math.abs(x) <= ABERTO.jungle.meiaX && Math.abs(z) <= ABERTO.jungle.meiaZ) || (Math.abs(x) <= ABERTO.lane.meiaX && Math.abs(z) <= ABERTO.lane.meiaZ);
      // Nos encontros da jungle com a lane a quina da rocha é arredondada (abre um pouco).
      const quina = Math.abs(x) - ABERTO.jungle.meiaX < ABERTO.canto && Math.abs(z) - ABERTO.lane.meiaZ < ABERTO.canto;
      if (!dentro && !quina) assert.equal(noMapaAberto(x, z), false, `fora da região aberta em (${x}, ${z})`);
    }
  }
});

test('mapa: rochas internas são sólidas e altas; a mineradora é sólida', () => {
  for (const r of ROCHAS.filter((r) => r.forma !== 'borda')) {
    const [x, z] = r.forma === 'capsula' ? [(r.ax + r.bx) / 2, (r.az + r.bz) / 2] : [r.x, r.z];
    assert.equal(rochaEm(x, z), r.id);
    assert.ok(heightAt(x, z) >= 67, `${r.id} alta (${heightAt(x, z).toFixed(0)})`);
    assert.ok(paredeAt(x, z) === 1);
  }
  // A mineradora não é rocha (é construção) mas é sólida e alta demais para passar.
  assert.equal(noMapaAberto(0, 0), true);
  assert.ok(alturaSolida(0, 0) >= 90);
  for (const [x, z] of [[-69, 0], [69, 80], [0, -114]]) assert.ok(alturaSolida(x, z) >= 90, `(${x}, ${z}) da mineradora`);
  for (const [x, z] of [[-75, 0], [0, 120]]) assert.equal(alturaSolida(x, z), 0, `(${x}, ${z}) fora`);
});

test('mapa: as rochas são íngremes demais para subir (regra de MAX_SLOPE)', () => {
  // Em todo ponto de chão colado na rocha, subindo pela direção mais íngreme, os
  // próximos 12 m já passam (com folga) da inclinação máxima da nave.
  const dirs = Array.from({ length: 16 }, (_, k) => [Math.cos((k * Math.PI) / 8), Math.sin((k * Math.PI) / 8)]);
  let bordas = 0;
  for (let x = -1460; x <= 1460; x += 6) {
    for (let z = -1080; z <= 1080; z += 6) {
      if (!noMapaAberto(x, z) || dirs.every(([dx, dz]) => noMapaAberto(x + dx * 6, z + dz * 6))) continue;
      bordas++;
      const subida = Math.max(...dirs.map(([dx, dz]) => heightAt(x + dx * 12, z + dz * 12)));
      assert.ok(subida / 12 > MAX_SLOPE * 1.5, `rampa suave em (${x}, ${z}): ${(subida / 12).toFixed(2)}`);
    }
  }
  assert.ok(bordas > 2000, `achou as bordas (${bordas})`);
});

test('mapa: da base se chega a todo o chão aberto, sem escalar rocha', () => {
  const { alcancado, maisAlto, visto, nx, nz, pX, pZ } = alcance(BASE);
  // O pé da rocha é um degrau: nem a primeira célula dele se sobe.
  assert.ok(maisAlto < 1, `subiu até ${maisAlto.toFixed(1)} m`);
  for (const b of BASES) assert.ok(alcancado(b.x + 30, b.z), `base ${b.time}`);
  for (const s of SERVICOS) assert.ok(alcancado(s.x, s.z), `${s.servico} ${s.time}`);
  for (const d of ESPERAS) assert.ok(alcancado(d.x, d.z), `porta do hangar ${d.time}`);
  for (const a of [...ACAMPAMENTOS, ...PLATAFORMAS_POUSO, ...ASTEROIDES]) assert.ok(alcancado(a.x, a.z), a.id);
  for (const b of BUFFS) assert.ok(alcancado(b.x + (b.tipo === 'suporte' ? 20 : 0), b.z), b.id);
  assert.ok(alcancado(NUCLEO.x, NUCLEO.z), 'Núcleo');
  assert.ok(alcancado(MEDUSA.x, MEDUSA.z), 'Medusa');
  // Sem bolsões de chão isolados por rocha (chão onde o corpo da nave cabe: a rocha
  // engorda SHIP_RADIUS, como na física).
  let aberto = 0;
  let chegou = 0;
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      if (heightAt(pX(i), pZ(j), SHIP_RADIUS) > 0) continue;
      aberto++;
      if (visto[j * nx + i]) chegou++;
    }
  }
  assert.ok(chegou / aberto > 0.99, `${((100 * chegou) / aberto).toFixed(1)}% do chão aberto alcançável`);
});

test('mapa: cada poço tem três entradas (lado A, lado B e a coluna central)', () => {
  // Entradas do poço de cima: o vão entre o alto de cada barra vertical e a borda, e o
  // vão entre as barras horizontais. As do poço de baixo são as mesmas espelhadas em z.
  const entradas = (sz) => [
    { nome: 'lado A', dentro: (x, z) => x > -350 && x < -298 && sz * z > 877 && sz * z < 1070 },
    { nome: 'lado B', dentro: (x, z) => x < 350 && x > 298 && sz * z > 877 && sz * z < 1070 },
    { nome: 'central', dentro: (x, z) => Math.abs(x) < 99 && sz * z > 620 && sz * z < 676 },
  ];
  for (const [poco, sz] of [[NUCLEO, -1], [MEDUSA, 1]]) {
    const es = entradas(sz);
    for (const e of es) {
      const vao = [];
      for (let x = -360; x <= 360; x += 5) for (let z = 600; z <= 1060; z += 5) if (e.dentro(x, sz * z)) vao.push([x, sz * z]);
      assert.ok(vao.some(([x, z]) => noMapaAberto(x, z)), `${e.nome}: o vão é aberto`);
    }
    // Fechando as três, o poço fica isolado; abrindo uma só, dá para entrar.
    assert.equal(alcance(BASE, (x, z) => es.some((e) => e.dentro(x, z))).alcancado(poco.x, poco.z), false, 'sem entradas, isolado');
    for (const e of es) {
      const outras = es.filter((o) => o !== e);
      assert.equal(alcance(BASE, (x, z) => outras.some((o) => o.dentro(x, z))).alcancado(poco.x, poco.z), true, `entra pelo ${e.nome}`);
    }
    // POCOS (o miolo cercado pelas paredes em L) contém a arena.
    assert.ok(Math.abs(poco.x) + 50 < POCOS.meiaX && Math.abs(poco.z) - poco.raio > POCOS.zMin);
  }
});

test('mapa: acampamentos, buffs, plataformas e asteroides ficam em campo aberto e sem colisão', () => {
  for (const a of ACAMPAMENTOS) {
    for (const r of [0, a.raio / 2, a.raio]) for (const [x, z] of circulo(a.x, a.z, r)) assert.ok(pontoLivre(x, z, 8), `${a.id} em (${x.toFixed(0)}, ${z.toFixed(0)})`);
  }
  for (const b of BUFFS) {
    // A torre do buff de suporte é sólida de propósito; em volta dela, campo livre.
    const r0 = b.tipo === 'suporte' ? TORRE_SUPORTE.raio + 10 : 0;
    for (const r of [r0, 40]) for (const [x, z] of circulo(b.x, b.z, Math.max(r, 1))) assert.ok(pontoLivre(x, z, 8), `${b.id} em (${x.toFixed(0)}, ${z.toFixed(0)})`);
  }
  for (const p of PLATAFORMAS_POUSO) {
    for (const r of [0, p.raio / 2, p.raio + 10]) for (const [x, z] of circulo(p.x, p.z, r)) assert.ok(pontoLivre(x, z, 6), `${p.id} em (${x.toFixed(0)}, ${z.toFixed(0)})`);
  }
  for (const a of ASTEROIDES) {
    for (const dx of [-0.5, 0, 0.5]) {
      for (const dz of [-0.5, 0, 0.5]) {
        const x = a.x + dx * a.largura;
        const z = a.z + dz * a.profundidade;
        assert.ok(noMapaAberto(x, z) && alturaSolida(x, z) === 0, `${a.id} em (${x}, ${z}) é passável`);
        assert.equal(emAsteroides(x, z), a.id);
      }
    }
  }
  assert.equal(emAsteroides(0, 0), null);
  assert.equal(emAsteroides(-180, -405), 'AC0N');
});

test('mapa: áreas de pouso (anel, serviços e plataformas de dinheiro) planas e no chão aberto', () => {
  assert.deepEqual(
    AREAS_POUSO.map((a) => a.base ?? a.servico ?? a.plataforma),
    [0, 1, 'evolucao', 'loja', 'evolucao', 'loja', 'P0', 'P1'],
  );
  for (const b of BASES) assert.equal(areaPouso(b.x, b.z).base, b.time);
  for (const p of PLATAFORMAS_POUSO) {
    const a = areaPouso(p.x, p.z);
    assert.equal(a.plataforma, p.id);
    assert.equal(a.territorio, p.time);
    assert.equal(a.base ?? a.time, undefined, 'sem dono: qualquer time pousa');
  }
  for (const a of AREAS_POUSO) {
    for (const r of [0, a.raio]) {
      for (const [x, z] of circulo(a.x, a.z, r)) {
        assert.ok(noMapaAberto(x, z), `área (${a.x}, ${a.z}) aberta`);
        assert.equal(heightAt(x, z), 0, 'plana');
        assert.equal(alturaSolida(x, z, SHIP_RADIUS), 0, 'sem construção');
      }
    }
    assert.equal(podePousar(a.x, a.z + a.raio + 3), false, 'fora da plataforma não pousa');
  }
});

test('mapa: pouso nas plataformas de serviço e de dinheiro, e não do lado delas', () => {
  for (const a of AREAS_POUSO.filter((a) => a.servico || a.plataforma)) {
    const s = createShip('shrewdo', a.x, a.z + 5, 0);
    stepShip(s, { ...PARADO, p: true });
    for (let i = 0; i < 30 * 3; i++) stepShip(s, PARADO);
    assert.equal(s.pousado, true, `${a.servico ?? a.plataforma}`);
    assert.ok(Math.abs(s.y - (topoPouso(a.x, a.z) + ALTURA_POUSADO)) < 0.01, 'em cima da plataforma');
    const fora = createShip('shrewdo', a.x, a.z + a.raio + 10, 0);
    stepShip(fora, { ...PARADO, p: true });
    for (let i = 0; i < 30 * 2; i++) stepShip(fora, PARADO);
    assert.equal(fora.pousado, false, 'ao lado da plataforma não pousa');
  }
});

test('mapa: as ROTAS dos mineradores são retas, da base pela porta até a doca no hangar, e livres', () => {
  for (const [t, r] of ROTAS.entries()) {
    assert.deepEqual(r[0], { x: BASES[t].x, z: BASES[t].z });
    assert.deepEqual(r.at(-2), { x: ESPERAS[t].x, z: ESPERAS[t].z }, 'passa pela espera na frente da porta');
    assert.deepEqual(r.at(-1), { x: DOCAS[t].x, z: DOCAS[t].z });
    for (const p of r) assert.equal(p.z, LANE.z, 'em linha reta pela lane');
    for (let i = 1; i < r.length; i++) {
      assert.ok(Math.hypot(r[i].x - r[i - 1].x, r[i].z - r[i - 1].z) <= 100);
      assert.ok(Math.sign(r[i].x - r[i - 1].x) === -Math.sign(BASES[t].x), 'sempre rumo à mineradora');
      // As duas faixas (ida e volta) livres de rocha e construção, com folga; pela
      // porta do hangar, livres só para o minerador do time (com a folga da nave).
      const ultimo = i === r.length - 1;
      for (const lado of [-1, 1]) {
        for (let k = 0; k <= 1; k += 0.05) {
          const x = r[i - 1].x + (r[i].x - r[i - 1].x) * k;
          const z = r[i - 1].z + lado * FAIXA_MINERADOR;
          const h = ultimo ? alturaSolida(x, z, SHIP_RADIUS, false, t) : alturaSolida(x, z, SHIP_RADIUS + 4);
          assert.equal(h, 0, `(${x}, ${z})`);
        }
      }
    }
    // A rota sai de dentro do campo de força da base (o minerador do time o atravessa).
    assert.ok(dentroDoCampo(t, r[0].x) && !dentroDoCampo(t, r.at(-1).x), 'atravessa o campo da própria base');
    // A doca fica no hangar, na metade da mineradora voltada para a base: livre para o
    // minerador do time, sólida para as outras naves e para o minerador do outro time.
    const d = DOCAS[t];
    assert.equal(alturaSolida(d.x, d.z, SHIP_RADIUS, false, t), 0, 'doca livre para o minerador do time');
    assert.ok(alturaSolida(d.x, d.z, SHIP_RADIUS) > 0, 'sólida para as naves');
    assert.ok(alturaSolida(d.x, d.z, SHIP_RADIUS, false, 1 - t) > 0, 'sólida para o minerador do outro time');
    assert.ok(Math.sign(d.x) === Math.sign(BASES[t].x));
  }
});

test('mapa: voando pela lane, da base se chega à porta do hangar, e o campo de força não deixa a nave entrar', () => {
  for (const b of BASES) {
    const s = createShip('bellico', b.x, b.z, b.time === 0 ? -Math.PI / 2 : Math.PI / 2);
    const d = ESPERAS[b.time];
    assert.equal(voar(s, [{ x: d.x, z: d.z }], { chegou: 10 }), 1, `parou em (${s.x.toFixed(0)}, ${s.z.toFixed(0)})`);
    // Segue reto contra a porta do hangar: para no campo de força, não entra.
    for (let i = 0; i < 30 * 4; i++) stepShip(s, { ...PARADO, th: 1, b: true });
    assert.ok(Math.abs(s.x) > MINERADORA.meiaX && Math.sign(s.x) === Math.sign(b.x), `não atravessou (x ${s.x.toFixed(1)})`);
    assert.ok(s.y < HOVER + 1, 'nem passou por cima');
  }
});

test('mapa: o minerador atravessa o campo de força do hangar do time dele, e só o dele', () => {
  for (const b of BASES) {
    const t = b.time;
    const sg = Math.sign(b.x);
    for (const [hangar, entra] of [[t, true], [1 - t, false]]) {
      const s = createShip('shrewdo', ESPERAS[t].x, FAIXA_MINERADOR, sg > 0 ? Math.PI / 2 : -Math.PI / 2);
      s.hangar = hangar;
      for (let i = 0; i < 30 * 5; i++) stepShip(s, { ...PARADO, th: 0.6 });
      const dentro = Math.abs(s.x) < MINERADORA.meiaX;
      assert.equal(dentro, entra, `hangar ${hangar} na porta do time ${t}: x ${s.x.toFixed(1)}`);
      if (entra) assert.ok(noHangar(t, s.x, s.z), 'ficou dentro do hangar');
    }
  }
});

test('mapa: voando contra a borda e contra cada rocha, a nave não sobe', () => {
  const casos = [
    [-900, -950, 0], // norte
    [900, 950, Math.PI], // sul
    [-1300, 0, Math.PI / 2], // fundo da base do time 0 (oeste)
    [1300, 0, -Math.PI / 2], // fundo da base do time 1 (leste)
    [-1200, 100, 0], // parede do bolsão
  ];
  // E contra cada rocha interna, saindo do chão aberto mais perto do meio dela.
  for (const r of ROCHAS.filter((r) => r.forma !== 'borda')) {
    const [cx, cz] = r.forma === 'capsula' ? [(r.ax + r.bx) / 2, (r.az + r.bz) / 2] : [r.x, r.z];
    const ext = r.forma === 'capsula' ? r.raio : Math.min(r.meiaX, r.meiaZ);
    let achou = false;
    for (const [x, z] of circulo(cx, cz, ext + 70, 15)) {
      if (!pontoLivre(x, z, 25)) continue;
      casos.push([x, z, mirar(x, z, cx, cz)]);
      achou = true;
      break;
    }
    assert.ok(achou, `ponto de partida para ${r.id}`);
  }
  for (const [x, z, yaw] of casos) {
    const s = createShip('shrewdo', x, z, yaw);
    for (let i = 0; i < 30 * 8; i++) stepShip(s, { ...PARADO, th: 1, b: true });
    assert.ok(heightAt(s.x, s.z) < 1, `subiu saindo de (${x.toFixed(0)}, ${z.toFixed(0)}): chão ${heightAt(s.x, s.z).toFixed(1)}`);
  }
});

test('mapa: nada sólido em cima do que precisa ficar livre', () => {
  for (const o of OBSTACULOS) {
    for (const s of SERVICOS) assert.ok(Math.hypot(o.x - s.x, o.z - s.z) > s.raio + o.alcance + 10, `${o.nome} longe de ${s.servico}`);
    for (const p of PLATAFORMAS_POUSO) assert.ok(Math.hypot(o.x - p.x, o.z - p.z) > p.raio + o.alcance + 10, `${o.nome} longe de ${p.id}`);
    for (const b of BACIAS) assert.ok(Math.hypot(o.x - b.x, o.z - b.z) > b.raio + o.alcance + 10, `${o.nome} longe da bacia ${b.time}`);
    for (const c of CAMPOS_BASE) assert.ok(Math.abs(o.x - c.x) > o.alcance + 10, `${o.nome} longe do campo de força ${c.time}`);
    for (const b of BASES) assert.ok(Math.hypot(o.x - b.x, o.z - b.z) > b.raio + o.alcance, `${o.nome} fora da base ${b.time}`);
  }
});

test('mapa: campo de força de cada base, de rocha a rocha na boca do bolsão', () => {
  assert.equal(CAMPO_BASE_DIST, 155);
  assert.deepEqual(
    CAMPOS_BASE.map((c) => [c.time, c.x, c.z, c.meiaZ]),
    [
      [0, -1125, 0, 180],
      [1, 1125, 0, 180],
    ],
  );
  for (const c of CAMPOS_BASE) {
    const b = BASES[c.time];
    assert.equal(Math.abs(c.x), BOLSAO.xMin, 'na boca do bolsão');
    // De uma parede à outra: aberto até |z| = meiaZ, rocha logo além (a nave não passa por fora).
    for (let z = -c.meiaZ + SHIP_RADIUS; z <= c.meiaZ - SHIP_RADIUS; z += 5) assert.ok(noMapaAberto(c.x, z), `aberto em (${c.x}, ${z})`);
    for (const z of [-c.meiaZ - 2, c.meiaZ + 2]) assert.ok(!noMapaAberto(c.x, z), `rocha em (${c.x}, ${z})`);
    // A física não vira parede: o campo não é sólido.
    assert.equal(alturaSolida(c.x, 0, SHIP_RADIUS), 0);
    // Lado de dentro: o da base.
    assert.ok(dentroDoCampo(c.time, b.x) && !dentroDoCampo(c.time, 0));
    assert.ok(!dentroDoCampo(c.time, c.x - c.dentro * 3) && dentroDoCampo(c.time, c.x - c.dentro * 3, 5), 'a folga alarga para fora');
    // Segmentos: cruza de fora para dentro e de dentro para fora; ao lado (na rocha), não.
    const fora = c.x - c.dentro * 50;
    const dentro = c.x + c.dentro * 50;
    for (const [x0, x1] of [[fora, dentro], [dentro, fora]]) {
      const k = cruzaCampoBase(x0, 10, x1, 30);
      assert.equal(k?.time, c.time);
      assert.ok(Math.abs(k.t - 0.5) < 1e-9 && Math.abs(k.x - c.x) < 1e-9 && Math.abs(k.z - 20) < 1e-9);
    }
    assert.equal(cruzaCampoBase(fora, c.meiaZ + 20, dentro, c.meiaZ + 20), null, 'ao lado do campo (na rocha) não conta');
    assert.equal(cruzaCampoBase(fora, 0, fora + c.dentro * 20, 0), null, 'do mesmo lado não conta');
    assert.equal(cruzaCampoBase(-500, 0, 500, 0), null, 'longe das bases');
    assert.ok(encostaNoCampo(c.time, c.x - c.dentro * SHIP_RADIUS, 0, SHIP_RADIUS));
    assert.ok(!encostaNoCampo(c.time, c.x - c.dentro * (SHIP_RADIUS + 0.1), 0, SHIP_RADIUS));
    assert.ok(!encostaNoCampo(1 - c.time, c.x, 0, SHIP_RADIUS), 'o do outro time fica na outra ponta');
  }
});

test('mapa: bacia de minério de cada base, entre o anel de pouso e o campo de força', () => {
  assert.deepEqual(BACIA, { dist: 115, raio: 24, raioInterno: 19, borda: 2.5, fundo: -40 });
  assert.ok(BACIA.borda < HOVER - SHIP_RADIUS, 'o aro fica abaixo do voo: a nave passa por cima');
  assert.ok(BACIA.fundo < NIVEL_AGUA, 'o fundo fica abaixo da água');
  for (const bc of BACIAS) {
    const t = bc.time;
    const b = BASES[t];
    const anel = AREAS_POUSO.find((a) => a.base === t);
    const campo = CAMPOS_BASE[t];
    const d = Math.hypot(bc.x - b.x, bc.z - b.z);
    assert.equal(d, BACIA.dist);
    assert.ok(d - bc.raio > anel.raio, 'à frente do anel de pouso, sem encostar nele');
    assert.ok(dentroDoCampo(t, bc.x) && Math.abs(bc.x - campo.x) > bc.raio, 'do lado de dentro do campo de força, sem encostar nele');
    assert.ok(d + bc.raio < b.raio, 'dentro da zona segura');
    for (const s of SERVICOS) assert.ok(Math.hypot(s.x - bc.x, s.z - bc.z) > s.raio + bc.raio, `longe da plataforma ${s.servico}`);
    assert.ok(!areaPouso(bc.x, bc.z), 'não é área de pouso');
    assert.equal(alturaSolida(bc.x, bc.z, SHIP_RADIUS), 0, 'não é sólida');
    // Três vagas, dentro do raio interno, afastadas umas das outras.
    assert.equal(VAGAS_BACIA[t].length, 3);
    for (const v of VAGAS_BACIA[t]) assert.ok(Math.hypot(v.x - bc.x, v.z - bc.z) <= bc.raioInterno, 'vaga dentro da bacia');
    for (let i = 0; i < 3; i++) {
      for (let k = i + 1; k < 3; k++) {
        const [p, q] = [VAGAS_BACIA[t][i], VAGAS_BACIA[t][k]];
        assert.ok(Math.hypot(p.x - q.x, p.z - q.z) > 2 * SHIP_RADIUS + 3, `vagas ${i} e ${k} sem encostar`);
      }
    }
    // A espera fica dentro do campo, na faixa da volta, fora da bacia.
    const e = ESPERAS_BACIA[t];
    assert.ok(dentroDoCampo(t, e.x) && !encostaNoCampo(t, e.x, e.z, SHIP_RADIUS), 'espera do lado de dentro, sem encostar no campo');
    assert.ok(Math.hypot(e.x - bc.x, e.z - bc.z) > bc.raio, 'espera fora do aro');
    assert.ok(Math.abs(e.z - pontoRota(t, 1, false).z) < 1e-9, 'na faixa da volta');
  }
});
