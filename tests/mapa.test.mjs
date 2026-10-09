// Mapa M1 da partida 3 contra 3 (DESIGN-PARTIDA.md): retângulo aberto com muralha
// na borda, duas bases de time ligadas pelo corredor dos mineradores, minério no
// meio, entregas, serviços (Evolução e Loja), objetivos A, B e C dos dois lados e
// mesas de rocha espalhadas. Estes testes seguram o contrato que as próximas
// tarefas (times, mineradores, objetivos, loja) vão usar.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  heightAt,
  paredeAt,
  noMapaAberto,
  areaPouso,
  podePousar,
  topoPouso,
  BASE,
  BASES,
  CORREDOR,
  MINERIO,
  ENTREGAS,
  SERVICOS,
  OBJETIVOS,
  ARENA_C,
  ROTAS,
  MESAS,
  AREAS_POUSO,
  MAP_HALF_X,
  MAP_HALF_Z,
  MURALHA,
  WALL_HEIGHT,
} from '../shared/terrain.js';
import { alturaSolida, OBSTACULOS } from '../shared/obstaculos.js';
import { createShip, stepShip, MAX_SLOPE, SHIP_RADIUS, ALTURA_POUSADO } from '../shared/sim.js';

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
  }
  return i;
}

test('mapa: contrato (bases, corredor, minério, entregas, serviços, objetivos)', () => {
  assert.equal(MAP_HALF_X, 1500);
  assert.equal(MAP_HALF_Z, 1000);
  assert.deepEqual(BASES, [
    { time: 0, x: 0, z: 700, raio: 200 },
    { time: 1, x: 0, z: -700, raio: 200 },
  ]);
  assert.equal(BASE, BASES[0]);
  assert.deepEqual(CORREDOR, { x: 0, largura: 100, zInicio: -500, zFim: 500 });
  assert.deepEqual(MINERIO, { x: 0, z: 0, raio: 60 });
  assert.deepEqual(
    ENTREGAS.map((e) => [e.time, e.x, e.z, e.largura, e.profundidade]),
    [
      [0, 0, 500, 120, 30],
      [1, 0, -500, 120, 30],
    ],
  );
  assert.deepEqual(
    SERVICOS.map((s) => [s.servico, s.time, s.x, s.z]),
    [
      ['evolucao', 0, -150, 700],
      ['loja', 0, 150, 700],
      ['evolucao', 1, -150, -700],
      ['loja', 1, 150, -700],
    ],
  );
  assert.deepEqual(
    OBJETIVOS.map((o) => [o.id, o.tipo, o.x, o.z]),
    [
      ['A1', 'A', -540, -140],
      ['B1', 'B', -520, 300],
      ['C1', 'C', -1050, 420],
      ['A2', 'A', 540, 140],
      ['B2', 'B', 520, -300],
      ['C2', 'C', 1050, -420],
    ],
  );
  for (const o of OBJETIVOS) {
    assert.ok(o.raio >= 20 && o.raio <= 30);
    // Justo com os dois times: todo objetivo tem um gêmeo girado 180°.
    assert.ok(OBJETIVOS.some((g) => g !== o && g.tipo === o.tipo && g.x === -o.x && g.z === -o.z), `gêmeo de ${o.id}`);
  }
  for (const [t, r] of ROTAS.entries()) {
    assert.deepEqual(r[0], { x: BASES[t].x, z: BASES[t].z });
    assert.ok(Math.abs(Math.hypot(r.at(-1).x - MINERIO.x, r.at(-1).z - MINERIO.z) - (MINERIO.raio - 10)) < 1e-9, 'termina na beira do minério');
    for (let i = 1; i < r.length; i++) assert.ok(Math.hypot(r[i].x - r[i - 1].x, r[i].z - r[i - 1].z) <= 100);
  }
});

test('mapa: áreas de pouso são o anel de cada base, os serviços e os objetivos A', () => {
  assert.deepEqual(
    AREAS_POUSO.map((a) => a.base ?? a.servico ?? a.objetivo),
    [0, 1, 'evolucao', 'loja', 'evolucao', 'loja', 'A1', 'A2'],
  );
  for (const b of BASES) assert.equal(areaPouso(b.x, b.z).base, b.time);
  for (const s of SERVICOS) {
    const a = areaPouso(s.x, s.z);
    assert.equal(a.servico, s.servico);
    assert.equal(a.time, s.time);
    assert.equal(podePousar(s.x, s.z + s.raio + 3), false, 'fora da plataforma não pousa');
  }
  for (const o of OBJETIVOS) {
    assert.equal(areaPouso(o.x, o.z)?.objetivo, o.tipo === 'A' ? o.id : undefined, o.id);
  }
});

test('mapa: o terreno é simétrico por rotação de 180° (justo com os dois times)', () => {
  for (let x = -1400; x <= 1400; x += 37) {
    for (let z = -900; z <= 900; z += 41) {
      assert.ok(Math.abs(heightAt(x, z) - heightAt(-x, -z)) < 0.5, `(${x}, ${z})`);
    }
  }
  assert.ok(MESAS.length >= 20, `${MESAS.length} mesas`);
});

test('mapa: bases, corredor, minério, entregas, serviços e objetivos ficam em chão plano e aberto', () => {
  const pontos = [];
  for (const b of BASES) for (const r of [0, 100, b.raio - 1]) pontos.push(...circulo(b.x, b.z, r));
  for (let z = BASES[1].z; z <= BASES[0].z; z += 10) {
    for (let x = -CORREDOR.largura / 2; x <= CORREDOR.largura / 2; x += 10) pontos.push([CORREDOR.x + x, z]);
  }
  for (const r of [0, MINERIO.raio]) pontos.push(...circulo(MINERIO.x, MINERIO.z, r));
  for (const e of ENTREGAS) {
    for (const dx of [-1, 0, 1]) for (const dz of [-1, 1]) pontos.push([e.x + (dx * e.largura) / 2, e.z + (dz * e.profundidade) / 2]);
  }
  for (const s of SERVICOS) pontos.push(...circulo(s.x, s.z, s.raio));
  for (const o of OBJETIVOS) pontos.push(...circulo(o.x, o.z, o.tipo === 'C' ? ARENA_C : o.raio));
  for (const [x, z] of pontos) {
    assert.ok(noMapaAberto(x, z), `(${x.toFixed(0)}, ${z.toFixed(0)}) deveria ser chão`);
    assert.ok(heightAt(x, z) < 0.01, `(${x.toFixed(0)}, ${z.toFixed(0)}) plano`);
  }
});

test('mapa: noMapaAberto bate com o terreno, e a borda é muralha', () => {
  for (let x = -MAP_HALF_X; x <= MAP_HALF_X; x += 23) {
    for (let z = -MAP_HALF_Z; z <= MAP_HALF_Z; z += 23) {
      assert.equal(noMapaAberto(x, z), paredeAt(x, z) === 0);
      if (noMapaAberto(x, z)) assert.ok(heightAt(x, z) < 12, `chão baixo em (${x}, ${z})`);
    }
  }
  for (const [x, z] of [[MAP_HALF_X - 5, 0], [-MAP_HALF_X + 5, 300], [0, MAP_HALF_Z - 5], [700, -MAP_HALF_Z + 5]]) {
    assert.equal(noMapaAberto(x, z), false);
    assert.ok(heightAt(x, z) > 100, `muralha em (${x}, ${z})`);
  }
  for (const m of MESAS) assert.ok(heightAt((m.ax + m.bx) / 2, (m.az + m.bz) / 2) > WALL_HEIGHT * 0.6, 'mesa alta');
});

test('mapa: as rochas são íngremes demais para subir (regra de MAX_SLOPE)', () => {
  // Em todo ponto de chão colado na rocha, subindo pela direção mais íngreme, os
  // próximos 12 m já passam (com folga) da inclinação máxima da nave.
  const dirs = Array.from({ length: 16 }, (_, k) => [Math.cos((k * Math.PI) / 8), Math.sin((k * Math.PI) / 8)]);
  let bordas = 0;
  for (const m of MESAS) {
    const ext = Math.hypot(m.bx - m.ax, m.bz - m.az) / 2 + m.r + 30;
    for (let x = m.cx - ext; x <= m.cx + ext; x += 4) {
      for (let z = m.cz - ext; z <= m.cz + ext; z += 4) {
        if (!noMapaAberto(x, z) || dirs.every(([dx, dz]) => noMapaAberto(x + dx * 6, z + dz * 6))) continue;
        bordas++;
        const h0 = heightAt(x, z);
        const subida = Math.max(...dirs.map(([dx, dz]) => heightAt(x + dx * 12, z + dz * 12) - h0));
        assert.ok(subida / 12 > MAX_SLOPE * 1.5, `rampa suave em (${x.toFixed(0)}, ${z.toFixed(0)}): ${(subida / 12).toFixed(2)}`);
      }
    }
  }
  assert.ok(bordas > 1000, 'achou as bordas');
});

test('mapa: da base se chega a todo o chão aberto, sem escalar rocha nem muralha', () => {
  // Busca em largura num grid de 10 m a partir da base do time 0, subindo só o que a
  // nave sobe (construções contam como parede).
  const passo = 10;
  const nx = Math.floor((2 * MAP_HALF_X) / passo) + 1;
  const nz = Math.floor((2 * MAP_HALF_Z) / passo) + 1;
  const pX = (i) => -MAP_HALF_X + i * passo;
  const pZ = (j) => -MAP_HALF_Z + j * passo;
  const h = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) h[j * nx + i] = alturaSolida(pX(i), pZ(j), SHIP_RADIUS);
  const visto = new Uint8Array(nx * nz);
  const ini = Math.round((BASE.z + MAP_HALF_Z) / passo) * nx + Math.round((BASE.x + MAP_HALF_X) / passo);
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
  // O pé da rampa (alguns metros) ainda dá para subir; o alto da rocha, não.
  assert.ok(maisAlto < WALL_HEIGHT * 0.3, `subiu até ${maisAlto.toFixed(1)} m`);
  const alcancado = (x, z) => visto[Math.round((z + MAP_HALF_Z) / passo) * nx + Math.round((x + MAP_HALF_X) / passo)] === 1;
  for (const b of BASES) assert.ok(alcancado(b.x + 30, b.z), `base ${b.time}`);
  for (const o of OBJETIVOS) assert.ok(alcancado(o.x + (o.tipo === 'B' ? 20 : 0), o.z), o.id);
  for (const s of SERVICOS) assert.ok(alcancado(s.x, s.z), `${s.servico} ${s.time}`);
  assert.ok(alcancado(MINERIO.x + 40, MINERIO.z), 'minério');
  // Sem bolsões grandes de chão isolados por rocha.
  let aberto = 0;
  let chegou = 0;
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      if (!noMapaAberto(pX(i), pZ(j))) continue;
      aberto++;
      if (visto[j * nx + i]) chegou++;
    }
  }
  assert.ok(chegou / aberto > 0.97, `${((100 * chegou) / aberto).toFixed(1)}% do chão aberto alcançável`);
});

test('mapa: voando pelo corredor, de uma base se chega à outra (contornando os cristais)', () => {
  const s = createShip('bellico', BASES[0].x, BASES[0].z, 0);
  const pontos = [
    { x: 0, z: 100 },
    { x: 40, z: 0 },
    { x: 0, z: -100 },
    { x: BASES[1].x, z: BASES[1].z },
  ];
  assert.equal(voar(s, pontos), pontos.length, `parou em (${s.x.toFixed(0)}, ${s.z.toFixed(0)})`);
  for (const p of pontos) assert.ok(Math.abs(p.x - CORREDOR.x) < CORREDOR.largura / 2, 'tudo dentro do corredor');
});

test('mapa: as ROTAS dos mineradores e a coroa do minério ficam livres de construção', () => {
  for (const r of ROTAS) {
    for (let i = 1; i < r.length; i++) {
      for (let t = 0; t <= 1; t += 0.05) {
        const x = r[i - 1].x + (r[i].x - r[i - 1].x) * t;
        const z = r[i - 1].z + (r[i].z - r[i - 1].z) * t;
        assert.equal(alturaSolida(x, z, SHIP_RADIUS + 4), heightAt(x, z), `(${x}, ${z})`);
      }
    }
  }
  for (const r of [30, 45, MINERIO.raio - 2]) {
    for (const [x, z] of circulo(MINERIO.x, MINERIO.z, r, 10)) assert.equal(alturaSolida(x, z, 1), heightAt(x, z), `coroa (${x.toFixed(0)}, ${z.toFixed(0)})`);
  }
  assert.ok(alturaSolida(MINERIO.x, MINERIO.z) > 10, 'cristal sólido no miolo');
});

test('mapa: do corredor dá para voar até cada objetivo, e pousar nos A', () => {
  for (const o of OBJETIVOS) {
    const s = createShip('acron', CORREDOR.x, o.z + (o.z > 0 ? 60 : -60), 0);
    const perto = o.tipo === 'B' ? 25 : 6; // B tem a torre no meio
    assert.equal(voar(s, [{ x: CORREDOR.x + Math.sign(o.x) * 60, z: o.z }, { x: o.x, z: o.z }], { chegou: perto }), 2, `${o.id}: chegou`);
    if (o.tipo !== 'A') continue;
    stepShip(s, { ...PARADO, p: true });
    for (let i = 0; i < 30 * 4; i++) stepShip(s, PARADO);
    assert.equal(s.pousado, true, `${o.id}: pousou`);
    assert.equal(areaPouso(s.x, s.z)?.objetivo, o.id);
    assert.ok(Math.abs(s.y - (topoPouso(o.x, o.z) + ALTURA_POUSADO)) < 0.01, 'em cima da placa');
  }
});

test('mapa: pouso nas plataformas de serviço, e não do lado delas', () => {
  for (const sv of SERVICOS) {
    const s = createShip('shrewdo', sv.x, sv.z + 5, 0);
    stepShip(s, { ...PARADO, p: true });
    for (let i = 0; i < 30 * 3; i++) stepShip(s, PARADO);
    assert.equal(s.pousado, true, `${sv.servico} ${sv.time}`);
    assert.ok(Math.abs(s.y - (topoPouso(sv.x, sv.z) + ALTURA_POUSADO)) < 0.01, 'em cima da plataforma');
    const fora = createShip('shrewdo', sv.x, sv.z + sv.raio + 10, 0);
    stepShip(fora, { ...PARADO, p: true });
    for (let i = 0; i < 30 * 2; i++) stepShip(fora, PARADO);
    assert.equal(fora.pousado, false, 'ao lado da plataforma não pousa');
  }
  for (const o of OBJETIVOS.filter((o) => o.tipo !== 'A')) {
    const s = createShip('mechan', o.x + o.raio + 10, o.z, 0);
    stepShip(s, { ...PARADO, p: true });
    for (let i = 0; i < 30 * 2; i++) stepShip(s, PARADO);
    assert.equal(s.pousado, false, `${o.id} não é de pouso`);
  }
});

test('mapa: voando contra a muralha e contra uma mesa, a nave não sobe', () => {
  const casos = [
    [0, -MAP_HALF_Z + MURALHA + 150, 0], // norte
    [0, MAP_HALF_Z - MURALHA - 150, Math.PI], // sul
    [MAP_HALF_X - MURALHA - 150, 0, -Math.PI / 2], // leste
    [-MAP_HALF_X + MURALHA + 150, 0, Math.PI / 2], // oeste
  ];
  // E contra cada mesa, saindo do chão aberto mais perto do meio dela.
  for (const m of MESAS.slice(0, 10)) {
    for (const [x, z] of circulo(m.cx, m.cz, Math.hypot(m.bx - m.ax, m.bz - m.az) / 2 + m.r + 70, 45)) {
      if (!noMapaAberto(x, z) || alturaSolida(x, z, 20) !== heightAt(x, z)) continue;
      casos.push([x, z, mirar(x, z, m.cx, m.cz)]);
      break;
    }
  }
  assert.ok(casos.length > 8);
  for (const [x, z, yaw] of casos) {
    const s = createShip('shrewdo', x, z, yaw);
    for (let i = 0; i < 30 * 8; i++) stepShip(s, { ...PARADO, th: 1, b: true });
    assert.ok(heightAt(s.x, s.z) < 15, `subiu saindo de (${x.toFixed(0)}, ${z.toFixed(0)}): chão ${heightAt(s.x, s.z).toFixed(1)}`);
  }
});

test('mapa: nada sólido em cima do que precisa ficar livre', () => {
  for (const o of OBSTACULOS) {
    for (const s of SERVICOS) assert.ok(Math.hypot(o.x - s.x, o.z - s.z) > s.raio + o.alcance + 10, `${o.nome} longe de ${s.servico}`);
    for (const e of ENTREGAS) {
      const dentro = Math.abs(o.x - e.x) < e.largura / 2 + o.alcance && Math.abs(o.z - e.z) < e.profundidade / 2 + o.alcance;
      assert.ok(!dentro, `${o.nome} em cima da entrega`);
    }
  }
});
