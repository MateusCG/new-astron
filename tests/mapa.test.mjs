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
  ENTREGAS,
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
} from '../shared/terrain.js';
import { alturaSolida, pontoLivre, OBSTACULOS, POCOS } from '../shared/obstaculos.js';
import { createShip, stepShip, MAX_SLOPE, SHIP_RADIUS, ALTURA_POUSADO, HOVER } from '../shared/sim.js';
import { FAIXA_MINERADOR } from '../server/mineradores.js';

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

test('mapa: contrato (tamanho, bases, lane, mineradora, docas, entregas, serviços)', () => {
  assert.equal(MAP_HALF_X, 1500);
  assert.equal(MAP_HALF_Z, 1120);
  assert.deepEqual(BASES, [
    { time: 0, x: -1280, z: 0, raio: 170 },
    { time: 1, x: 1280, z: 0, raio: 170 },
  ]);
  assert.equal(BASE, BASES[0]);
  assert.deepEqual(ABERTO, { jungle: { meiaX: 1080, meiaZ: 1060 }, lane: { meiaX: 1440, meiaZ: 180 }, canto: 40 });
  assert.equal(LANE.meiaLargura, 90);
  assert.equal(LANE.largura, 180);
  assert.equal(CORREDOR, LANE, 'apelido antigo');
  assert.deepEqual([LANE.xInicio, LANE.xFim], [-BOLSAO.xMin, BOLSAO.xMin]);
  assert.deepEqual([MINERADORA.x, MINERADORA.z, MINERADORA.meiaX, MINERADORA.meiaZ], [0, 0, 70, 115]);
  assert.ok(MINERADORA.topo >= 90);
  assert.ok(MINERADORA.meiaZ > LANE.meiaLargura, 'a mineradora é mais larga que a lane');
  assert.deepEqual(DOCAS, [
    { time: 0, x: -84, z: 0 },
    { time: 1, x: 84, z: 0 },
  ]);
  assert.deepEqual(ENTREGAS.map((e) => [e.time, e.x, e.z]), [[0, -1110, 0], [1, 1110, 0]]);
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
  gemeo(ENTREGAS, 'entrega');
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
  for (const d of DOCAS) assert.ok(alcancado(d.x, d.z), `doca ${d.time}`);
  for (const a of [...ACAMPAMENTOS, ...PLATAFORMAS_POUSO, ...ASTEROIDES]) assert.ok(alcancado(a.x, a.z), a.id);
  for (const b of BUFFS) assert.ok(alcancado(b.x + (b.tipo === 'suporte' ? 20 : 0), b.z), b.id);
  assert.ok(alcancado(NUCLEO.x, NUCLEO.z), 'Núcleo');
  assert.ok(alcancado(MEDUSA.x, MEDUSA.z), 'Medusa');
  // Sem bolsões de chão isolados por rocha.
  let aberto = 0;
  let chegou = 0;
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      if (!noMapaAberto(pX(i), pZ(j))) continue;
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
    const r0 = b.tipo === 'suporte' ? 20 : 0;
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

test('mapa: as ROTAS dos mineradores são retas, da base à própria doca, e livres', () => {
  for (const [t, r] of ROTAS.entries()) {
    assert.deepEqual(r[0], { x: BASES[t].x, z: BASES[t].z });
    assert.deepEqual(r.at(-1), { x: DOCAS[t].x, z: DOCAS[t].z });
    for (const p of r) assert.equal(p.z, LANE.z, 'em linha reta pela lane');
    for (let i = 1; i < r.length; i++) {
      assert.ok(Math.hypot(r[i].x - r[i - 1].x, r[i].z - r[i - 1].z) <= 100);
      assert.ok(Math.sign(r[i].x - r[i - 1].x) === -Math.sign(BASES[t].x), 'sempre rumo à mineradora');
      // As duas faixas (ida e volta) livres de rocha e construção, com folga.
      for (const lado of [-1, 1]) {
        for (let k = 0; k <= 1; k += 0.05) {
          const x = r[i - 1].x + (r[i].x - r[i - 1].x) * k;
          const z = r[i - 1].z + lado * FAIXA_MINERADOR;
          assert.equal(alturaSolida(x, z, SHIP_RADIUS + 4), 0, `(${x}, ${z})`);
        }
      }
    }
    // A entrega fica no caminho.
    const e = ENTREGAS[t];
    assert.ok(Math.min(...r.map((p) => p.x)) <= e.x && Math.max(...r.map((p) => p.x)) >= e.x);
    // A doca fica colada na face da mineradora voltada para a base, e livre.
    const d = DOCAS[t];
    assert.equal(alturaSolida(d.x, d.z, SHIP_RADIUS), 0, 'doca livre');
    assert.ok(Math.abs(d.x) - MINERADORA.meiaX < 20 && Math.sign(d.x) === Math.sign(BASES[t].x));
  }
});

test('mapa: voando pela lane, da base se chega à doca, e a mineradora não deixa passar', () => {
  for (const b of BASES) {
    const s = createShip('bellico', b.x, b.z, b.time === 0 ? -Math.PI / 2 : Math.PI / 2);
    const d = DOCAS[b.time];
    assert.equal(voar(s, [{ x: d.x, z: d.z }], { chegou: 10 }), 1, `parou em (${s.x.toFixed(0)}, ${s.z.toFixed(0)})`);
    // Segue reto contra a mineradora: para na face dela, não atravessa.
    for (let i = 0; i < 30 * 4; i++) stepShip(s, { ...PARADO, th: 1, b: true });
    assert.ok(Math.abs(s.x) > MINERADORA.meiaX && Math.sign(s.x) === Math.sign(b.x), `não atravessou (x ${s.x.toFixed(1)})`);
    assert.ok(s.y < HOVER + 1, 'nem passou por cima');
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
    for (const e of ENTREGAS) {
      const dentro = Math.abs(o.x - e.x) < e.largura / 2 + o.alcance && Math.abs(o.z - e.z) < e.profundidade / 2 + o.alcance;
      assert.ok(!dentro, `${o.nome} em cima da entrega`);
    }
    for (const b of BASES) assert.ok(Math.hypot(o.x - b.x, o.z - b.z) > b.raio + o.alcance, `${o.nome} fora da base ${b.time}`);
  }
});
