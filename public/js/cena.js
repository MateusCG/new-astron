// Cenário do mapa da partida (o lago do Stage 6), DESENHO PROVISÓRIO.
//
// O mapa trocou (shared/terrain.js: lane com a mineradora de Hélio-3 no meio, bases
// nas pontas, jungle com rochas, asteroides e os poços do Núcleo e da Medusa) e os
// modelos de verdade (Blender, public/modelos/mapa/) entram na fase seguinte, pela
// frente Cliente. Até lá esta cena desenha tudo em primitivas, a partir das mesmas
// plantas que a física usa (shared/terrain.js e shared/obstaculos.js), para o jogo
// rodar e dar para conferir o mapa:
// - o terreno é a malha de heightAt nas rochas (cinza) e o fundo do lago no campo
//   aberto, com um plano de água transparente em NIVEL_AGUA (abaixo do chão de voo:
//   tudo parece flutuar sobre o lago);
// - bases com o anel, os serviços e o portal warp flutuando, entregas, mineradora,
//   torres de suporte, plataformas de pouso, campos de asteroides e as arenas do
//   Núcleo e da Medusa (anéis âmbar na água).
//
// Cor das bases é relativa a quem olha: a do seu time em turquesa, a do outro em
// vermelho (criarCena({ meuTime })). Céu e luz continuam os do guia visual até a
// paleta nova do planeta (PROPOSTA-VISUAL.md da frente Cenário).

import * as THREE from 'three';
import {
  heightAt,
  paredeAt,
  fbm,
  MAP_HALF_X,
  MAP_HALF_Z,
  NIVEL_AGUA,
  FUNDO_LAGO,
  ABERTO,
  BASES,
  ENTREGAS,
  DOCAS,
  SERVICOS,
  AREAS_POUSO,
  MINERADORA,
  ASTEROIDES,
  PLATAFORMAS_POUSO,
  NUCLEO,
  MEDUSA,
  daBase,
} from '/shared/terrain.js';
import { OBSTACULOS, TORRE_SUPORTE, PORTAL_WARP } from '/shared/obstaculos.js';

const ALTURA_PLATAFORMA = 3;

export const CORES = {
  ceuTopo: new THREE.Color('#2a0f1c'),
  ceuMeio: new THREE.Color('#a8402a'),
  horizonte: new THREE.Color('#f59a45'),
  neblina: new THREE.Color('#c96a3a'),
  neon: new THREE.Color('#00efc0'), // base do seu time
  perigo: new THREE.Color('#ff3b2a'), // base do outro time
  objetivo: new THREE.Color('#ffb627'), // objetivos (âmbar)
  minerio: new THREE.Color('#9fe8ff'), // Hélio-3 (azul-gelo)
  circuito: new THREE.Color('#4fb8ff'), // entregas e docas dos mineradores
  evolucao: new THREE.Color('#a58bff'), // plataforma da Evolução (violeta)
  loja: new THREE.Color('#ff6fd8'), // plataforma da Loja (magenta)
  agua: new THREE.Color('#1d6f80'), // lago (provisório)
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
  // O nome se lê de dentro da base, de quem olha para a lane (como a câmera ao nascer).
  g.rotation.y = s.time === 0 ? -Math.PI / 2 : Math.PI / 2;
  return g;
}

/**
 * Terreno: a malha de heightAt nas rochas e o fundo do lago (FUNDO_LAGO) no campo
 * aberto. A ~6 m por quadrado o degrau da rocha ainda sai com quina viva.
 */
function criarTerreno() {
  const segX = Math.round((2 * MAP_HALF_X) / 6);
  const segZ = Math.round((2 * MAP_HALF_Z) / 6);
  const geo = new THREE.PlaneGeometry(MAP_HALF_X * 2, MAP_HALF_Z * 2, segX, segZ);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const cores = new Float32Array(pos.count * 3);
  const fundoA = new THREE.Color('#2b3a3a');
  const fundoB = new THREE.Color('#3f4f48');
  const rochaA = new THREE.Color('#4a4f52');
  const rochaB = new THREE.Color('#7b8084');
  const topo = new THREE.Color('#9a9c98');
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const p = paredeAt(x, z);
    const ruido = fbm(x * 0.05, z * 0.05, 3, 2);
    if (p === 0) {
      pos.setY(i, FUNDO_LAGO + ruido * 6);
      c.copy(fundoA).lerp(fundoB, ruido);
    } else {
      const h = heightAt(x, z);
      pos.setY(i, h);
      // Estratos: faixas horizontais de rocha clara e escura.
      const faixaRocha = 0.5 + 0.5 * Math.sin(h * 0.35 + fbm(x * 0.01, z * 0.01, 4, 2) * 6);
      c.copy(rochaA).lerp(rochaB, faixaRocha * 0.7 + ruido * 0.3);
      if (p > 0.97) c.lerp(topo, 0.5);
    }
    cores[i * 3] = c.r;
    cores[i * 3 + 1] = c.g;
    cores[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cores, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, flatShading: true });
  const malha = new THREE.Mesh(geo, mat);
  malha.receiveShadow = true;
  return malha;
}

/** Plano de água do lago em NIVEL_AGUA, transparente (o fundo aparece por baixo). */
function criarAgua() {
  const geo = new THREE.PlaneGeometry(ABERTO.lane.meiaX * 2 + 40, ABERTO.jungle.meiaZ * 2 + 40);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({
    color: CORES.agua,
    roughness: 0.25,
    metalness: 0.1,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
  });
  const agua = new THREE.Mesh(geo, mat);
  agua.position.y = NIVEL_AGUA;
  agua.receiveShadow = true;
  return agua;
}

/** Pilar fino do topo de uma plataforma flutuante até o fundo do lago (decoração, sem colisão). */
function pilar(g, mat, x, z, topo, raio = 1.6) {
  const alt = topo - FUNDO_LAGO;
  const m = new THREE.Mesh(new THREE.CylinderGeometry(raio, raio * 1.3, alt, 6), mat);
  m.position.set(x, FUNDO_LAGO + alt / 2, z);
  m.castShadow = true;
  g.add(m);
}

/** Anel deitado (marcação de área). */
function anel(g, mat, x, y, z, r, esp = 0.6, lados = 48) {
  const m = new THREE.Mesh(new THREE.TorusGeometry(r, esp, 6, lados), mat);
  m.rotation.x = Math.PI / 2;
  m.position.set(x, y, z);
  g.add(m);
  return m;
}

/**
 * Base de um time: plataforma flutuante com o anel de pouso, os serviços e o portal
 * warp alto (acima de PORTAL_WARP.base: a nave passa por baixo). `cor` é o neon da
 * base para quem olha: turquesa se é a do seu time, vermelho se é a do outro.
 */
function criarBase(b, cor) {
  const g = new THREE.Group();
  const metal = matMetal('#5d6866');
  const escuro = matMetal('#3a4442');
  const neon = matNeon(cor);

  // O topo da plataforma fica exatamente no piso da área de pouso (shared/terrain.js),
  // que é onde a física apoia a nave pousada.
  const area = AREAS_POUSO.find((a) => a.base === b.time);
  const y = heightAt(b.x, b.z);
  const plataforma = new THREE.Mesh(new THREE.CylinderGeometry(70, 76, ALTURA_PLATAFORMA, 24), metal);
  plataforma.position.set(b.x, y + area.piso - ALTURA_PLATAFORMA / 2, b.z);
  plataforma.receiveShadow = true;
  g.add(plataforma);
  for (const r of [area.raio, 14]) anel(g, neon, b.x, y + area.piso + 0.2, b.z, r, r > 20 ? 0.6 : 0.5);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    pilar(g, escuro, b.x + Math.cos(a) * 55, b.z + Math.sin(a) * 55, y + area.piso - ALTURA_PLATAFORMA, 3);
  }

  // Portal warp: anel vertical alto, virado para a lane, flutuando no fundo do bolsão.
  const p = daBase(b, PORTAL_WARP.lx, PORTAL_WARP.lz);
  const raioPortal = 38;
  const portal = new THREE.Group();
  const aro = new THREE.Mesh(new THREE.TorusGeometry(raioPortal, 3.2, 8, 40), escuro);
  const aroNeon = new THREE.Mesh(new THREE.TorusGeometry(raioPortal - 3.4, 0.7, 6, 40), neon);
  aro.castShadow = true;
  portal.add(aro, aroNeon);
  portal.position.set(p.x, PORTAL_WARP.base + raioPortal + 4, p.z);
  portal.rotation.y = Math.PI / 2; // o plano do anel de frente para a lane (eixo x)
  g.add(portal);

  // Serviços: Evolução (esquerda) e Loja (direita), plataformas de pouso com ícone.
  for (const s of SERVICOS.filter((s) => s.time === b.time)) {
    g.add(criarServico(s));
    pilar(g, escuro, s.x, s.z, heightAt(s.x, s.z), 2.4);
  }
  g.userData.luzes = [aroNeon];
  return g;
}

/** Entregas (placas azuis na boca de cada base) e docas (marcas azuis na face da mineradora). */
function criarCircuito() {
  const g = new THREE.Group();
  const azul = matNeon(CORES.circuito);
  const placaMat = matMetal('#36424a', { roughness: 0.8 });
  for (const e of ENTREGAS) {
    const placa = new THREE.Mesh(new THREE.BoxGeometry(e.largura, 0.8, e.profundidade), placaMat);
    placa.position.set(e.x, 0.4, e.z);
    placa.receiveShadow = true;
    g.add(placa);
    faixa(g, azul, e.x - e.largura / 2 + 0.5, 0.85, e.z, 0.6, e.profundidade - 1);
    faixa(g, azul, e.x + e.largura / 2 - 0.5, 0.85, e.z, 0.6, e.profundidade - 1);
    pilar(g, placaMat, e.x, e.z, 0, 2);
  }
  for (const d of DOCAS) {
    const s = Math.sign(d.x);
    const doca = new THREE.Mesh(new THREE.BoxGeometry(14, 1, 40), placaMat);
    doca.position.set(s * (MINERADORA.meiaX + 7), 4, d.z);
    g.add(doca);
    faixa(g, azul, s * (MINERADORA.meiaX + 13.5), 4.6, d.z, 0.6, 38);
  }
  return g;
}

/** Mineradora de Hélio-3: bloco do fundo do lago até o topo, com faixas de He-3. */
function criarMineradora() {
  const g = new THREE.Group();
  const m = MINERADORA;
  const alt = m.topo - FUNDO_LAGO;
  const forma = new THREE.Shape();
  const ix = m.meiaX - m.canto;
  const iz = m.meiaZ - m.canto;
  forma.absarc(ix, iz, m.canto, 0, Math.PI / 2);
  forma.absarc(-ix, iz, m.canto, Math.PI / 2, Math.PI);
  forma.absarc(-ix, -iz, m.canto, Math.PI, Math.PI * 1.5);
  forma.absarc(ix, -iz, m.canto, Math.PI * 1.5, Math.PI * 2);
  const geo = new THREE.ExtrudeGeometry(forma, { depth: alt, bevelEnabled: false, curveSegments: 4 });
  geo.rotateX(-Math.PI / 2); // a extrusão (z) vira altura (y); o y da forma vira -z
  const corpo = new THREE.Mesh(geo, matMetal('#55605f'));
  corpo.position.set(m.x, FUNDO_LAGO, m.z);
  corpo.castShadow = corpo.receiveShadow = true;
  g.add(corpo);
  const he3 = matNeon(CORES.minerio);
  for (const yy of [8, 40, m.topo - 6]) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(m.meiaX * 2 + 1, 1.2, m.meiaZ * 2 - m.canto * 2), he3);
    f.position.set(m.x, yy, m.z);
    g.add(f);
  }
  g.userData.brilhos = [he3];
  return g;
}

/**
 * Objetivos da jungle (provisório: as regras chegam na fase seguinte): torres dos
 * buffs de suporte (a planta sólida de shared/obstaculos.js), plataformas de pouso
 * de dinheiro e as arenas do Núcleo e da Medusa, em âmbar.
 */
function criarObjetivos() {
  const g = new THREE.Group();
  const ambar = matNeon(CORES.objetivo);
  const escuro = matMetal('#3a3630', { roughness: 0.75 });
  for (const o of OBSTACULOS.filter((o) => o.nome === 'torre-suporte')) {
    const alt = o.topo - FUNDO_LAGO;
    const torre = new THREE.Mesh(new THREE.CylinderGeometry(TORRE_SUPORTE.raio * 0.8, TORRE_SUPORTE.raio, alt, 6), escuro);
    torre.position.set(o.x, FUNDO_LAGO + alt / 2, o.z);
    torre.castShadow = true;
    g.add(torre);
    for (const yy of [6, 18, o.topo - 2]) anel(g, ambar, o.x, yy, o.z, TORRE_SUPORTE.raio + 0.3, 0.5, 12);
  }
  for (const p of PLATAFORMAS_POUSO) {
    const a = AREAS_POUSO.find((x) => x.plataforma === p.id);
    const placa = new THREE.Mesh(new THREE.CylinderGeometry(p.raio + 3, p.raio + 5, 2, 8), matMetal('#4d4a3c', { roughness: 0.8 }));
    placa.position.set(p.x, a.piso - 1, p.z);
    placa.receiveShadow = true;
    g.add(placa);
    anel(g, ambar, p.x, a.piso + 0.15, p.z, p.raio, 0.6, 32);
    pilar(g, escuro, p.x, p.z, a.piso - 2, 3);
  }
  for (const o of [NUCLEO, MEDUSA]) anel(g, ambar, o.x, NIVEL_AGUA + 0.3, o.z, o.raio, 1.2, 64);
  return g;
}

/** Campos de asteroides: pedaços de rocha flutuando (só decoração, passáveis). */
function criarAsteroides() {
  const g = new THREE.Group();
  const rnd = mulberry32(4242);
  const mat = new THREE.MeshStandardMaterial({ color: '#6b6560', roughness: 0.95, flatShading: true });
  const geo = new THREE.IcosahedronGeometry(1, 0);
  const pedras = [];
  for (const a of ASTEROIDES) {
    const n = Math.round((a.largura * a.profundidade) / 900);
    for (let k = 0; k < n; k++) {
      pedras.push({
        x: a.x + (rnd() - 0.5) * a.largura,
        z: a.z + (rnd() - 0.5) * a.profundidade,
        y: 2 + rnd() * 28,
        r: 1.5 + rnd() * 4,
        giro: rnd() * Math.PI,
      });
    }
  }
  const inst = new THREE.InstancedMesh(geo, mat, pedras.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  pedras.forEach((p, i) => {
    q.setFromEuler(e.set(p.giro, p.giro * 1.7, 0));
    m.compose(new THREE.Vector3(p.x, p.y, p.z), q, new THREE.Vector3(p.r, p.r * 0.8, p.r));
    inst.setMatrixAt(i, m);
  });
  inst.castShadow = true;
  g.add(inst);
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
 * Monta a cena inteira. Retorna { scene, atualizar(dt, foco), definirObjetivo }, onde
 * foco é o ponto (nave do jogador) que a sombra e a poeira acompanham. `meuTime`
 * decide a cor das bases (a sua em turquesa, a do outro time em vermelho).
 */
export function criarCena({ meuTime = 0 } = {}) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(CORES.neblina, 120, 900);
  scene.background = CORES.horizonte.clone();

  scene.add(criarCeu());
  scene.add(criarTerreno());
  scene.add(criarAgua());
  const bases = BASES.map((b) => criarBase(b, b.time === meuTime ? CORES.neon : CORES.perigo));
  scene.add(...bases);
  scene.add(criarCircuito());
  const mineradora = criarMineradora();
  scene.add(mineradora);
  scene.add(criarObjetivos());
  scene.add(criarAsteroides());
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
    // O neon do portal pulsa devagar; o He-3 da mineradora "respira".
    const pulso = 0.8 + 0.3 * Math.sin(tempo * 2);
    for (const b of bases) for (const l of b.userData.luzes) l.material.emissiveIntensity = pulso;
    const brilho = 0.7 + 0.25 * Math.sin(tempo * 1.3);
    for (const m of mineradora.userData.brilhos) m.emissiveIntensity = brilho;
  }

  /** Estado de objetivo vindo do servidor: sem objetivo no desenho provisório (o mapa novo ainda não tem os da fase seguinte). */
  function definirObjetivo() {}

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
