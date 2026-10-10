// Cenário do mapa M1: deserto de cânion com céu de fim de tarde, inspirado nos
// planetas de missão do AstroN (rocha marrom, céu laranja, canos e torres
// enferrujadas). O chão é o de shared/terrain.js (partida 3 contra 3, ver
// DESIGN-PARTIDA.md): as duas bases de time, o corredor dos mineradores com o
// depósito de minério no meio e as entregas nas pontas, os serviços (Evolução e
// Loja) em cada base, os objetivos A, B e C e as mesas de rocha do mundo aberto.
//
// Cor das bases é relativa a quem olha: a do seu time em turquesa, a do outro em
// vermelho (criarCena({ meuTime })). O resto das cores sai do guia visual.
//
// Tudo é gerado em código a partir de shared/terrain.js e shared/obstaculos.js; o
// cenário decorativo (canos, pedras, torres) usa um gerador pseudoaleatório com
// semente fixa, então todo jogador vê o mesmo mapa sem baixar nenhum modelo.

import * as THREE from 'three';
import {
  heightAt,
  paredeAt,
  noMapaAberto,
  fbm,
  MAP_HALF_X,
  MAP_HALF_Z,
  BASES,
  CORREDOR,
  MINERIO,
  ENTREGAS,
  SERVICOS,
  OBJETIVOS,
  ARENA_C,
  MESAS,
  AREAS_POUSO,
  TORRETAS,
} from '/shared/terrain.js';
import { OBSTACULOS, HANGAR, PORTAL, ANTENAS, alturaSolida, daBase } from '/shared/obstaculos.js';

const ALTURA_PLATAFORMA = 3;
const OBJETIVO_APAGADO = 0.2; // brilho do âmbar de um objetivo em recarga

export const CORES = {
  ceuTopo: new THREE.Color('#2a0f1c'),
  ceuMeio: new THREE.Color('#a8402a'),
  horizonte: new THREE.Color('#f59a45'),
  neblina: new THREE.Color('#c96a3a'),
  neon: new THREE.Color('#00efc0'), // base do seu time
  perigo: new THREE.Color('#ff3b2a'), // base do outro time
  objetivo: new THREE.Color('#ffb627'), // objetivos A, B e C (âmbar)
  minerio: new THREE.Color('#9fe8ff'), // cristais do depósito (azul-gelo)
  circuito: new THREE.Color('#4fb8ff'), // estrada e entregas dos mineradores
  evolucao: new THREE.Color('#a58bff'), // plataforma da Evolução (violeta)
  loja: new THREE.Color('#ff6fd8'), // plataforma da Loja (magenta)
};

const SOL_DIR = new THREE.Vector3(-0.55, 0.32, -0.77).normalize();

function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Textura de grão (tons de cinza) que dá detalhe de areia/rocha de perto. */
function texturaGrao() {
  const n = 256;
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(n, n);
  const rnd = mulberry32(5);
  for (let i = 0; i < n * n; i++) {
    const v = 200 + rnd() * 55;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(220, 220);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}


function criarTerreno() {
  // ~6 m por quadrado: a rocha (degrau + rampa de 16 m) ainda sai com quina viva.
  const segX = Math.round((2 * MAP_HALF_X) / 6);
  const segZ = Math.round((2 * MAP_HALF_Z) / 6);
  const geo = new THREE.PlaneGeometry(MAP_HALF_X * 2, MAP_HALF_Z * 2, segX, segZ);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const cores = new Float32Array(pos.count * 3);
  const areia = new THREE.Color('#9b6239');
  const areiaEscura = new THREE.Color('#6e3f24');
  const rochaA = new THREE.Color('#5a2f1e');
  const rochaB = new THREE.Color('#a8683e');
  const topo = new THREE.Color('#b9804f');
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = heightAt(x, z);
    pos.setY(i, h);
    const p = paredeAt(x, z);
    const ruido = fbm(x * 0.05, z * 0.05, 3, 2);
    if (p === 0) {
      c.copy(areiaEscura).lerp(areia, ruido);
    } else {
      // Estratos: faixas horizontais de rocha clara e escura, como paredes de cânion.
      const faixa = 0.5 + 0.5 * Math.sin(h * 0.45 + fbm(x * 0.01, z * 0.01, 4, 2) * 6);
      c.copy(rochaA).lerp(rochaB, faixa * 0.8 + ruido * 0.2);
      if (p > 0.97) c.lerp(topo, 0.6);
    }
    cores[i * 3] = c.r;
    cores[i * 3 + 1] = c.g;
    cores[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cores, 3));
  geo.computeVertexNormals();
  const grao = texturaGrao();
  grao.repeat.set((220 * MAP_HALF_X) / 1000, (220 * MAP_HALF_Z) / 1000);
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    map: grao,
    roughness: 0.95,
    metalness: 0,
    flatShading: true,
  });
  const malha = new THREE.Mesh(geo, mat);
  malha.receiveShadow = true;
  return malha;
}

/** Caixa fina deitada no chão (faixas de luz, bordas de placa). */
function faixa(g, mat, x, y, z, larg, prof, ang = 0, alt = 0.15) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(larg, alt, prof), mat);
  m.position.set(x, y, z);
  m.rotation.y = ang;
  g.add(m);
  return m;
}

/**
 * Plaquinha com texto deitada no chão (nome do serviço). Textura feita em canvas,
 * sem imagem baixada.
 */
function rotuloChao(texto, cor, largura) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 96;
  const ctx = c.getContext('2d');
  ctx.font = 'bold 64px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(texto, 256, 52);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, color: cor, transparent: true, depthWrite: false });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(largura, (largura * 96) / 512), mat);
  m.rotation.x = -Math.PI / 2;
  return m;
}

/**
 * Base de um time: plataforma de pouso com anel, hangares, portal na boca do
 * corredor e antenas, tudo da planta em shared/obstaculos.js (a mesma que a física
 * usa). `cor` é o neon da base para quem olha: turquesa se é a do seu time,
 * vermelho se é a do outro.
 */
function criarBase(b, cor) {
  const g = new THREE.Group();
  const y = heightAt(b.x, b.z);
  const metal = matMetal('#5d6866');
  const escuro = matMetal('#3a4442');
  const neon = matNeon(cor);
  const giro = b.time === 0 ? 0 : Math.PI;

  // O topo da plataforma fica exatamente no piso da área de pouso (shared/terrain.js),
  // que é onde a física apoia a nave pousada.
  const area = AREAS_POUSO.find((a) => a.base === b.time);
  const plataforma = new THREE.Mesh(new THREE.CylinderGeometry(70, 76, ALTURA_PLATAFORMA, 24), metal);
  plataforma.position.set(b.x, y + area.piso - ALTURA_PLATAFORMA / 2, b.z);
  plataforma.receiveShadow = true;
  g.add(plataforma);
  for (const r of [area.raio, 14]) {
    const anel = new THREE.Mesh(new THREE.TorusGeometry(r, r > 20 ? 0.6 : 0.5, 6, 48), neon);
    anel.rotation.x = Math.PI / 2;
    anel.position.set(b.x, y + area.piso + 0.2, b.z);
    g.add(anel);
  }

  for (const o of OBSTACULOS.filter((o) => o.nome === 'hangar' && o.time === b.time)) {
    const hangar = new THREE.Group();
    const corpo = new THREE.Mesh(new THREE.BoxGeometry(HANGAR.largura - 4, HANGAR.altura - 2, HANGAR.profundidade - 4), escuro);
    corpo.position.y = (HANGAR.altura - 2) / 2;
    corpo.castShadow = corpo.receiveShadow = true;
    const teto = new THREE.Mesh(new THREE.BoxGeometry(HANGAR.largura, 2, HANGAR.profundidade), metal);
    teto.position.y = HANGAR.altura - 1;
    teto.castShadow = true;
    const fx = new THREE.Mesh(new THREE.BoxGeometry(HANGAR.largura - 3.8, 0.7, HANGAR.profundidade - 3.8), neon);
    fx.position.y = 10;
    const porta = new THREE.Mesh(new THREE.PlaneGeometry(12, 8), matNeon(cor.clone().multiplyScalar(0.55)));
    porta.position.set(0, 4.5, (HANGAR.profundidade - 4) / 2 + 0.05);
    hangar.add(corpo, teto, fx, porta);
    hangar.position.set(o.x, o.chao, o.z);
    hangar.rotation.y = o.ang;
    g.add(hangar);
  }

  // Portal na boca do corredor.
  const portal = new THREE.Group();
  const altColuna = PORTAL.altura - 3;
  for (const lado of [-1, 1]) {
    const coluna = new THREE.Mesh(new THREE.BoxGeometry(PORTAL.colunaLarg, altColuna, PORTAL.colunaProf), escuro);
    coluna.position.set(lado * PORTAL.vao, altColuna / 2, 0);
    coluna.castShadow = true;
    const luz = new THREE.Mesh(new THREE.BoxGeometry(PORTAL.colunaLarg + 0.2, 18, 0.6), neon);
    luz.position.set(lado * PORTAL.vao, 12, PORTAL.colunaProf / 2 + 0.2);
    portal.add(coluna, luz);
  }
  const viga = new THREE.Mesh(new THREE.BoxGeometry(PORTAL.vao * 2 + 6, 4, 7), escuro);
  viga.position.y = PORTAL.altura - 2;
  viga.castShadow = true;
  const vigaNeon = new THREE.Mesh(new THREE.BoxGeometry(PORTAL.vao * 2, 0.7, 7.2), neon);
  vigaNeon.position.y = 25;
  portal.add(viga, vigaNeon);
  const boca = daBase(b, 0, -PORTAL.dz);
  portal.position.set(boca.x, OBSTACULOS.find((o) => o.nome === 'coluna-portal' && o.time === b.time).chao, boca.z);
  portal.rotation.y = giro;
  g.add(portal);

  // Torres de antena com luz piscando (a luz é animada em atualizar()).
  const luzes = [];
  for (const o of OBSTACULOS.filter((o) => o.nome === 'antena' && o.time === b.time)) {
    const torre = new THREE.Mesh(new THREE.CylinderGeometry(ANTENAS.raio / 2, ANTENAS.raio, ANTENAS.altura, 6), metal);
    torre.position.set(o.x, o.chao + ANTENAS.altura / 2, o.z);
    torre.castShadow = true;
    const luz = new THREE.Mesh(new THREE.SphereGeometry(1.2, 8, 6), matNeon(new THREE.Color('#ff3b2a')));
    luz.position.set(o.x, o.topo + 1, o.z);
    luzes.push(luz);
    g.add(torre, luz);
  }

  // Serviços: Evolução (esquerda) e Loja (direita), plataformas de pouso com ícone.
  for (const s of SERVICOS.filter((s) => s.time === b.time)) g.add(criarServico(s));

  g.userData.luzes = luzes;
  return g;
}

/** Plataforma de serviço (Evolução ou Loja): placa retangular, borda, ícone e nome. */
function criarServico(s) {
  const g = new THREE.Group();
  const a = AREAS_POUSO.find((p) => p.servico === s.servico && p.time === s.time);
  const cor = CORES[s.servico];
  const neon = matNeon(cor);
  const y = heightAt(s.x, s.z);
  const larg = a.raio * 2 + 14;
  const prof = a.raio * 2 + 4;
  const alt = a.piso + 0.6;
  const placa = new THREE.Mesh(new THREE.BoxGeometry(larg, alt, prof), matMetal('#3d4644', { roughness: 0.8 }));
  placa.position.set(0, a.piso - alt / 2, 0);
  placa.receiveShadow = true;
  g.add(placa);
  const topo = a.piso + 0.08;
  faixa(g, neon, 0, topo, -prof / 2 + 0.5, larg - 1, 0.6);
  faixa(g, neon, 0, topo, prof / 2 - 0.5, larg - 1, 0.6);
  faixa(g, neon, -larg / 2 + 0.5, topo, 0, 0.6, prof - 1);
  faixa(g, neon, larg / 2 - 0.5, topo, 0, 0.6, prof - 1);
  if (s.servico === 'evolucao') {
    // Duas setas para cima ("melhorar").
    for (const dz of [-4, 3]) {
      faixa(g, neon, -3.2, topo, dz, 9, 1, Math.PI / 4);
      faixa(g, neon, 3.2, topo, dz, 9, 1, -Math.PI / 4);
    }
  } else {
    // Moeda: anel com uma barra no meio ("comprar").
    const anel = new THREE.Mesh(new THREE.TorusGeometry(6.5, 0.6, 4, 24), neon);
    anel.rotation.x = Math.PI / 2;
    anel.position.y = topo;
    g.add(anel);
    faixa(g, neon, 0, topo, 0, 1.2, 8);
  }
  const nome = rotuloChao(s.servico === 'evolucao' ? 'EVOLUÇÃO' : 'LOJA', cor, 26);
  nome.position.set(0, topo + 0.05, prof / 2 - 5);
  g.add(nome);
  g.position.set(s.x, y, s.z);
  // O nome se lê de dentro da base, de quem olha para o corredor (como a câmera ao nascer).
  g.rotation.y = s.time === 0 ? 0 : Math.PI;
  return g;
}

/**
 * Corredor dos mineradores: estrada escura com bordas de luz azul tracejadas e
 * linha central clara, mais as placas de entrega azuis coladas em cada base.
 */
function criarCorredor() {
  const g = new THREE.Group();
  const comp = BASES[0].z - BASES[1].z - BASES[0].raio; // de dentro de uma base à outra
  const estrada = new THREE.Mesh(
    new THREE.PlaneGeometry(CORREDOR.largura, comp),
    new THREE.MeshStandardMaterial({ color: '#4a3326', roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 }),
  );
  estrada.rotation.x = -Math.PI / 2;
  estrada.position.set(CORREDOR.x, 0.04, (BASES[0].z + BASES[1].z) / 2);
  estrada.receiveShadow = true;
  g.add(estrada);

  // Tracejado com InstancedMesh: centenas de traços num desenho só.
  const tracos = [];
  for (let z = -comp / 2 + 6; z < comp / 2 - 6; z += 24) {
    if (Math.abs(z - MINERIO.z) < MINERIO.raio + 4) continue; // o depósito interrompe a estrada
    for (const x of [-CORREDOR.largura / 2 + 2, CORREDOR.largura / 2 - 2]) tracos.push([CORREDOR.x + x, z, 'borda']);
    tracos.push([CORREDOR.x, z, 'meio']);
  }
  for (const tipo of ['borda', 'meio']) {
    const lista = tracos.filter((t) => t[2] === tipo);
    const mat = tipo === 'borda' ? matNeon(CORES.circuito) : matNeon(new THREE.Color('#cfe9ff'));
    mat.emissiveIntensity = tipo === 'borda' ? 0.8 : 0.5;
    // A estrada já é puxada para a frente (polygonOffset) para não brigar com o chão;
    // o traço precisa ser puxado mais ainda, senão some debaixo dela de longe.
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = -6;
    mat.polygonOffsetUnits = -6;
    const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(tipo === 'borda' ? 1.4 : 0.8, 0.12, 12), mat, lista.length);
    const m = new THREE.Matrix4();
    lista.forEach(([x, z], i) => inst.setMatrixAt(i, m.makeTranslation(x, heightAt(x, z) + 0.1, z)));
    g.add(inst);
  }

  const azul = matNeon(CORES.circuito);
  for (const e of ENTREGAS) {
    const y = heightAt(e.x, e.z);
    const placa = new THREE.Mesh(new THREE.BoxGeometry(e.largura, 0.5, e.profundidade), matMetal('#36424a', { roughness: 0.8 }));
    placa.position.set(e.x, y + 0.1, e.z);
    placa.receiveShadow = true;
    g.add(placa);
    const t = y + 0.4;
    faixa(g, azul, e.x, t, e.z - e.profundidade / 2 + 0.5, e.largura - 1, 0.7);
    faixa(g, azul, e.x, t, e.z + e.profundidade / 2 - 0.5, e.largura - 1, 0.7);
    faixa(g, azul, e.x - e.largura / 2 + 0.5, t, e.z, 0.7, e.profundidade - 1);
    faixa(g, azul, e.x + e.largura / 2 - 0.5, t, e.z, 0.7, e.profundidade - 1);
    // Setas apontando para dentro da base: é para lá que o minério vai.
    const s = Math.sign(BASES[e.time].z - e.z);
    for (const dx of [-36, 0, 36]) {
      faixa(g, azul, e.x + dx - 3, t, e.z, 9, 1, (s * Math.PI) / 4);
      faixa(g, azul, e.x + dx + 3, t, e.z, 9, 1, (-s * Math.PI) / 4);
    }
  }
  return g;
}

/**
 * Depósito de minério: chão de rocha azulada e cristais azul-gelo, os grandes por
 * cima dos cilindros sólidos da planta, e lascas baixas espalhadas na coroa onde os
 * mineradores vão carregar.
 */
function criarMinerio() {
  const g = new THREE.Group();
  const rnd = mulberry32(99);
  const cristal = new THREE.MeshStandardMaterial({
    color: CORES.minerio,
    emissive: CORES.minerio,
    emissiveIntensity: 0.55,
    roughness: 0.35,
    metalness: 0.1,
    flatShading: true,
  });
  const brilhos = [];
  const chao = new THREE.Mesh(
    new THREE.CircleGeometry(MINERIO.raio, 40),
    new THREE.MeshStandardMaterial({ color: '#3f4a55', roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -3 }),
  );
  chao.rotation.x = -Math.PI / 2;
  chao.position.set(MINERIO.x, heightAt(MINERIO.x, MINERIO.z) + 0.06, MINERIO.z);
  chao.receiveShadow = true;
  g.add(chao);
  for (const o of OBSTACULOS.filter((o) => o.nome === 'cristal')) {
    const alt = o.topo - o.chao;
    const n = 3 + Math.floor(rnd() * 3);
    for (let k = 0; k < n; k++) {
      // Octaedro esticado: ponta fina para cima, inclinado para fora do centro.
      const a = rnd() * Math.PI * 2;
      const r = k === 0 ? 0 : o.raio * (0.3 + rnd() * 0.4);
      const h = k === 0 ? alt : alt * (0.45 + rnd() * 0.35);
      const pedra = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), cristal);
      pedra.scale.set(o.raio * (k === 0 ? 0.6 : 0.35), h / 2, o.raio * (k === 0 ? 0.6 : 0.35));
      pedra.position.set(o.x + Math.cos(a) * r, o.chao + h / 2 - 0.5, o.z + Math.sin(a) * r);
      pedra.rotation.set(Math.sin(a) * 0.25, rnd() * Math.PI, Math.cos(a) * 0.25);
      pedra.castShadow = true;
      g.add(pedra);
    }
  }
  for (let k = 0; k < 40; k++) {
    const a = rnd() * Math.PI * 2;
    const r = 28 + rnd() * (MINERIO.raio - 32);
    const x = MINERIO.x + Math.cos(a) * r;
    const z = MINERIO.z + Math.sin(a) * r;
    const h = 0.8 + rnd() * 1.4; // lasca baixa: a nave passa por cima
    const lasca = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), cristal);
    lasca.scale.set(0.5 + rnd() * 0.4, h / 2, 0.5 + rnd() * 0.4);
    lasca.position.set(x, heightAt(x, z) + h / 2 - 0.2, z);
    lasca.rotation.set(rnd() * 0.6 - 0.3, rnd() * 3, rnd() * 0.6 - 0.3);
    g.add(lasca);
  }
  brilhos.push(cristal);
  g.userData.brilhos = brilhos;
  return g;
}

/**
 * Objetivos (âmbar, a cor de "tome isto"): A é uma marcação de pouso com losango;
 * B é a torre (sólida, da planta) num pedestal, com faixas e farol âmbar; C é a
 * arena do guardião, um círculo marcado com triângulo no meio e pilares baixos em
 * volta.
 *
 * O estado de cada um vem do servidor (snapshot `obj`) e muda o desenho por
 * definirObjetivo (devolvida por criarCena): em recarga o anel âmbar para de
 * pulsar e fica apagado; a torre B caída some e deixa destroços baixos (abaixo da
 * altura de voo, sem colisão) em volta do pedestal.
 */
function criarObjetivos() {
  const g = new THREE.Group();
  const ambar = matNeon(CORES.objetivo);
  const placaMat = matMetal('#4d4a3c', { roughness: 0.8 });
  const escuro = matMetal('#3a3630', { roughness: 0.75 });
  const pulsam = [];
  const porObjetivo = new Map();
  const anelChao = (x, y, z, r, mat = ambar, lados = 48) => {
    const anel = new THREE.Mesh(new THREE.TorusGeometry(r, 0.5, 4, lados), mat);
    anel.rotation.x = Math.PI / 2;
    anel.position.set(x, y, z);
    g.add(anel);
    return anel;
  };
  for (const o of OBJETIVOS) {
    const y = heightAt(o.x, o.z);
    const estado = { pulsam: [], apagado: false, torre: null, destrocos: null };
    porObjetivo.set(o.id, estado);
    const antes = pulsam.length;
    if (o.tipo === 'A') {
      const a = AREAS_POUSO.find((p) => p.objetivo === o.id);
      const alt = a.piso + 0.6;
      const placa = new THREE.Mesh(new THREE.CylinderGeometry(a.raio + 1, a.raio + 2, alt, 24), placaMat);
      placa.position.set(o.x, y + a.piso - alt / 2, o.z);
      placa.receiveShadow = true;
      g.add(placa);
      const t = y + a.piso + 0.15;
      pulsam.push(anelChao(o.x, t, o.z, a.raio, matNeon(CORES.objetivo)));
      // Losango (toro de 4 lados) com um ponto no meio.
      anelChao(o.x, t, o.z, a.raio * 0.45, ambar, 4);
      const ponto = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 0.3, 4), ambar);
      ponto.position.set(o.x, t, o.z);
      g.add(ponto);
    } else if (o.tipo === 'B') {
      const torre = OBSTACULOS.find((t) => t.objetivo === o.id);
      const alt = torre.topo - torre.chao;
      const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(o.raio * 0.5, o.raio * 0.6, 2, 6), placaMat);
      pedestal.position.set(o.x, y + 1, o.z);
      pedestal.receiveShadow = true;
      const corpo = new THREE.Mesh(new THREE.CylinderGeometry(torre.raio * 0.55, torre.raio, alt - 4, 6), escuro);
      corpo.position.set(o.x, y + 2 + (alt - 4) / 2 - 2, o.z);
      corpo.castShadow = true;
      // A torre (o que cai) num grupo só; o pedestal fica.
      const deTorre = new THREE.Group();
      deTorre.add(corpo);
      g.add(pedestal, deTorre);
      for (const k of [0.3, 0.6]) {
        const fx = new THREE.Mesh(new THREE.CylinderGeometry(torre.raio * (1 - 0.45 * k) + 0.2, torre.raio * (1 - 0.45 * k) + 0.2, 0.8, 6), ambar);
        fx.position.set(o.x, y + alt * k, o.z);
        deTorre.add(fx);
      }
      const farol = new THREE.Mesh(new THREE.OctahedronGeometry(2.2, 0), matNeon(CORES.objetivo));
      farol.position.set(o.x, y + alt + 1, o.z);
      pulsam.push(farol);
      deTorre.add(farol);
      anelChao(o.x, y + 0.15, o.z, o.raio);
      // Destroços da torre caída: lascas escuras deitadas em volta do pedestal,
      // até 1,5 m de altura (a nave passa por cima).
      const destrocos = new THREE.Group();
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2 + 0.4;
        const r = o.raio * 0.6 + (k % 3) * 2.5;
        const lasca = new THREE.Mesh(new THREE.BoxGeometry(1.6 + (k % 2), 1.2, 3 + (k % 3)), escuro);
        lasca.position.set(o.x + Math.cos(a) * r, heightAt(o.x + Math.cos(a) * r, o.z + Math.sin(a) * r) + 0.5, o.z + Math.sin(a) * r);
        lasca.rotation.set(0.3 * (k % 2), a, 0.25);
        lasca.castShadow = true;
        destrocos.add(lasca);
      }
      destrocos.visible = false;
      g.add(destrocos);
      estado.torre = deTorre;
      estado.destrocos = destrocos;
    } else {
      // Arena do guardião: anel largo, anel interno e triângulo no meio.
      const piso = new THREE.Mesh(new THREE.CircleGeometry(o.raio, 32), new THREE.MeshStandardMaterial({ color: '#3a2a20', roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 }));
      piso.rotation.x = -Math.PI / 2;
      piso.position.set(o.x, y + 0.05, o.z);
      piso.receiveShadow = true;
      g.add(piso);
      pulsam.push(anelChao(o.x, y + 0.15, o.z, ARENA_C, matNeon(CORES.objetivo), 64));
      anelChao(o.x, y + 0.15, o.z, o.raio);
      anelChao(o.x, y + 0.15, o.z, o.raio * 0.5, ambar, 3);
      for (let k = 0; k < 8; k++) {
        // Pilares baixos (2 m, a nave passa por cima) marcando a arena.
        const ang = (k / 8) * Math.PI * 2;
        const px = o.x + Math.cos(ang) * (ARENA_C + 3);
        const pz = o.z + Math.sin(ang) * (ARENA_C + 3);
        const pilar = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.8, 1.4), escuro);
        pilar.position.set(px, heightAt(px, pz) + 0.9, pz);
        pilar.castShadow = true;
        const luz = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.35, 1.5), ambar);
        luz.position.set(px, heightAt(px, pz) + 1.9, pz);
        g.add(pilar, luz);
      }
    }
    estado.pulsam = pulsam.slice(antes);
  }
  g.userData.pulsam = pulsam;
  g.userData.porObjetivo = porObjetivo;
  return g;
}

/** Ponto onde decoração pode ficar: chão aberto, longe de construção e de tudo que é do jogo. */
function livreParaDecorar(x, z) {
  if (!noMapaAberto(x, z) || alturaSolida(x, z, 8) !== heightAt(x, z)) return false;
  if (Math.abs(x - CORREDOR.x) < CORREDOR.largura / 2 + 12) return false;
  if (BASES.some((b) => Math.hypot(x - b.x, z - b.z) < b.raio + 10)) return false;
  return !OBJETIVOS.some((o) => Math.hypot(x - o.x, z - o.z) < ARENA_C + 12);
}

/**
 * Canos ao longo do corredor, pedras no chão (mais perto das rochas) e torres de
 * treliça no alto das mesas. Tudo só decoração, sem colisão: o que fica no chão
 * tem até 2,5 m e a nave passa por cima.
 */
function criarDecoracao() {
  const g = new THREE.Group();
  const rnd = mulberry32(1234);
  const ferrugem = matMetal('#6d3420', { metalness: 0.5, roughness: 0.8 });
  const ferrugemClara = matMetal('#8a4a2a', { metalness: 0.4, roughness: 0.85 });
  const pedra = new THREE.MeshStandardMaterial({ color: '#5e3a26', roughness: 1, flatShading: true });

  // Canos deitados dos dois lados do corredor, fora da estrada.
  for (let z = CORREDOR.zInicio + 40; z < CORREDOR.zFim - 40; z += 50 + rnd() * 60) {
    const lado = rnd() < 0.5 ? -1 : 1;
    const x = CORREDOR.x + lado * (CORREDOR.largura / 2 + 14 + rnd() * 10);
    const comp = 18 + rnd() * 26;
    if (Math.abs(z - MINERIO.z) < MINERIO.raio + comp) continue;
    // Nada de cano atravessando o pé de uma torreta (ela é de server/torretas.js).
    if (TORRETAS.some((t) => Math.sign(t.x - CORREDOR.x) === lado && Math.abs(t.z - z) < comp / 2 + 12)) continue;
    const h = Math.max(heightAt(x, z - comp / 2), heightAt(x, z), heightAt(x, z + comp / 2));
    const cano = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, comp, 8), ferrugem);
    cano.rotation.x = Math.PI / 2;
    cano.position.set(x, h + 1.2, z);
    cano.castShadow = cano.receiveShadow = true;
    g.add(cano);
    for (const k of [-0.4, 0.4]) {
      const az = z + comp * k;
      const apoio = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2, 0.8), ferrugemClara);
      apoio.position.set(x, heightAt(x, az) + 0.6, az);
      g.add(apoio);
    }
  }

  // Pedras: metade em volta das mesas, metade solta no deserto.
  let pedras = 0;
  for (let t = 0; t < 30000 && pedras < 360; t++) {
    let x;
    let z;
    if (t % 2 === 0 && MESAS.length) {
      const m = MESAS[Math.floor(rnd() * MESAS.length)];
      const a = rnd() * Math.PI * 2;
      const r = Math.hypot(m.bx - m.ax, m.bz - m.az) / 2 + m.r + 10 + rnd() * 40;
      x = m.cx + Math.cos(a) * r;
      z = m.cz + Math.sin(a) * r;
    } else {
      x = (rnd() * 2 - 1) * (MAP_HALF_X - 100);
      z = (rnd() * 2 - 1) * (MAP_HALF_Z - 100);
    }
    if (!livreParaDecorar(x, z)) continue;
    const r = 0.8 + rnd() * 1.4; // baixa: a nave (5 m) passa por cima
    const rocha = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), pedra);
    rocha.position.set(x, heightAt(x, z) + r * 0.3, z);
    rocha.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
    rocha.scale.y = 0.6 + rnd() * 0.4;
    rocha.castShadow = rocha.receiveShadow = true;
    g.add(rocha);
    pedras++;
  }

  // Torre de treliça no alto de cada mesa (silhueta contra o céu).
  for (const m of MESAS) {
    const x = m.cx + (rnd() - 0.5) * m.r * 0.6;
    const z = m.cz + (rnd() - 0.5) * m.r * 0.6;
    if (paredeAt(x, z) < 0.97 || rnd() < 0.3) continue;
    const alt = 18 + rnd() * 22;
    const torre = new THREE.Group();
    for (const [ox, oz] of [
      [-2, -2],
      [2, -2],
      [-2, 2],
      [2, 2],
    ]) {
      const perna = new THREE.Mesh(new THREE.BoxGeometry(0.6, alt, 0.6), ferrugem);
      perna.position.set(ox, alt / 2, oz);
      torre.add(perna);
    }
    for (let k = 1; k < 5; k++) {
      const anel = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.4, 4.8), ferrugemClara);
      anel.position.y = (alt * k) / 5;
      torre.add(anel);
    }
    torre.position.set(x, heightAt(x, z) - 0.5, z);
    torre.rotation.y = rnd() * Math.PI;
    torre.traverse((o) => (o.castShadow = true));
    g.add(torre);
  }
  return g;
}

function criarCeu() {
  const geo = new THREE.SphereGeometry(2400, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      topo: { value: CORES.ceuTopo },
      meio: { value: CORES.ceuMeio },
      horizonte: { value: CORES.horizonte },
      solDir: { value: SOL_DIR },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 topo, meio, horizonte, solDir;
      varying vec3 vDir;
      void main() {
        float h = clamp(vDir.y, -0.2, 1.0);
        vec3 c = mix(horizonte, meio, smoothstep(0.0, 0.18, h));
        c = mix(c, topo, smoothstep(0.18, 0.7, h));
        float s = max(dot(vDir, solDir), 0.0);
        c += vec3(1.0, 0.75, 0.4) * pow(s, 400.0) * 3.0;  // disco do sol
        c += vec3(1.0, 0.55, 0.25) * pow(s, 12.0) * 0.45;  // brilho em volta
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  return new THREE.Mesh(geo, mat);
}

// Metal com metalness baixo de propósito: sem mapa de ambiente, metal "de verdade"
// fica preto (não há o que refletir) ou estoura no reflexo do sol.
function matMetal(cor, extra = {}) {
  return new THREE.MeshStandardMaterial({ color: cor, metalness: 0.3, roughness: 0.65, flatShading: true, ...extra });
}

// Intensidade perto de 1: acima disso o tone mapping (ACES) puxa o neon para o
// branco e o turquesa some.
function matNeon(cor = CORES.neon) {
  return new THREE.MeshStandardMaterial({ color: cor, emissive: cor, emissiveIntensity: 0.9 });
}


/** Poeira flutuando em volta da câmera: dá noção de velocidade. */
function criarPoeira() {
  const n = 600;
  const pos = new Float32Array(n * 3);
  const rnd = mulberry32(77);
  for (let i = 0; i < n * 3; i++) pos[i] = (rnd() * 2 - 1) * 80;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color: '#ffc98f', size: 0.35, transparent: true, opacity: 0.55, depthWrite: false });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}

/**
 * Monta a cena inteira. Retorna { scene, atualizar(dt, foco) }, onde foco é o
 * ponto (nave do jogador) que a sombra e a poeira acompanham. `meuTime` decide a
 * cor das bases (a sua em turquesa, a do outro time em vermelho).
 */
export function criarCena({ meuTime = 0 } = {}) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(CORES.neblina, 120, 900);
  scene.background = CORES.horizonte.clone();

  scene.add(criarCeu());
  scene.add(criarTerreno());
  const bases = BASES.map((b) => criarBase(b, b.time === meuTime ? CORES.neon : CORES.perigo));
  scene.add(...bases);
  scene.add(criarCorredor());
  const minerio = criarMinerio();
  scene.add(minerio);
  const objetivos = criarObjetivos();
  scene.add(objetivos);
  scene.add(criarDecoracao());
  const poeira = criarPoeira();
  scene.add(poeira);

  scene.add(new THREE.HemisphereLight('#ffb27a', '#3b1c10', 1.1));
  const sol = new THREE.DirectionalLight('#ffd3a1', 2.6);
  sol.castShadow = true;
  sol.shadow.mapSize.set(2048, 2048);
  const sc = sol.shadow.camera;
  sc.left = sc.bottom = -110;
  sc.right = sc.top = 110;
  sc.near = 10;
  sc.far = 700;
  sol.shadow.bias = -0.0008;
  sol.shadow.normalBias = 0.6;
  scene.add(sol, sol.target);

  let tempo = 0;
  function atualizar(dt, foco) {
    tempo += dt;
    sol.position.copy(foco).addScaledVector(SOL_DIR, 350);
    sol.target.position.copy(foco);
    // A poeira "dá a volta" num cubo de 160 m em torno do foco.
    const p = poeira.geometry.attributes.position;
    poeira.position.set(0, 0, 0);
    for (let i = 0; i < p.count; i++) {
      for (let k = 0; k < 3; k++) {
        const f = k === 0 ? foco.x : k === 1 ? foco.y : foco.z;
        let v = p.array[i * 3 + k];
        if (v - f > 80) v -= 160;
        else if (v - f < -80) v += 160;
        p.array[i * 3 + k] = v;
      }
    }
    p.needsUpdate = true;
    const pisca = Math.sin(tempo * 4) > 0.3 ? 1.2 : 0.1;
    for (const b of bases) for (const l of b.userData.luzes) l.material.emissiveIntensity = pisca;
    // Os objetivos pulsam (chamam atenção); em recarga ficam apagados. Os
    // cristais "respiram" devagar.
    const pulso = 0.8 + 0.35 * Math.sin(tempo * 3);
    for (const est of objetivos.userData.porObjetivo.values()) {
      for (const a of est.pulsam) a.material.emissiveIntensity = est.apagado ? OBJETIVO_APAGADO : pulso;
    }
    const brilho = 0.5 + 0.2 * Math.sin(tempo * 1.3);
    for (const m of minerio.userData.brilhos) m.emissiveIntensity = brilho;
  }

  /**
   * Muda o desenho do objetivo `id` conforme o estado do servidor: `apagado` (em
   * recarga) e, nos B, `torreDePe`.
   */
  function definirObjetivo(id, { apagado = false, torreDePe = true } = {}) {
    const est = objetivos.userData.porObjetivo.get(id);
    if (!est) return;
    est.apagado = apagado;
    if (est.torre) {
      est.torre.visible = torreDePe;
      est.destrocos.visible = !torreDePe;
    }
  }

  return { scene, atualizar, definirObjetivo };
}

/**
 * Libera da GPU tudo o que a cena usa (geometrias, materiais, texturas e o mapa de
 * sombra do sol). Chamado ao sair da partida: cada entrada monta uma cena nova, e
 * sem isto a memória de vídeo cresceria a cada sair/entrar. Texturas compartilhadas
 * (o brilho de nave.js) podem ser liberadas sem medo: o Three.js as envia de novo
 * na próxima vez que forem desenhadas.
 */
export function liberarCena(scene) {
  scene.traverse((o) => {
    o.geometry?.dispose();
    const materiais = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of materiais) {
      for (const v of Object.values(m)) if (v?.isTexture) v.dispose();
      m.dispose();
    }
    o.shadow?.dispose();
  });
  scene.clear();
}
