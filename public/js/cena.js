// Cenário do mapa M1: cânion do deserto com céu de fim de tarde, inspirado nos
// planetas de missão do AstroN (rocha marrom, céu laranja, canos e torres
// enferrujadas) e, no centro, o posto avançado com o neon verde das bases Shrewdo.
//
// Tudo é gerado em código a partir de shared/terrain.js; o cenário decorativo
// (canos, pedras, torres) usa um gerador pseudoaleatório com semente fixa, então
// todo jogador vê o mesmo mapa sem baixar nenhum modelo.

import * as THREE from 'three';
import { heightAt, paredeAt, fbm, MAP_HALF, BASE, WALL_HEIGHT, AREAS_POUSO } from '/shared/terrain.js';
import { OBSTACULOS, HANGAR, PORTAL, ANTENAS } from '/shared/obstaculos.js';

const ALTURA_PLATAFORMA = 3;

export const CORES = {
  ceuTopo: new THREE.Color('#2a0f1c'),
  ceuMeio: new THREE.Color('#a8402a'),
  horizonte: new THREE.Color('#f59a45'),
  neblina: new THREE.Color('#c96a3a'),
  neon: new THREE.Color('#00efc0'),
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
  const seg = 400;
  const geo = new THREE.PlaneGeometry(MAP_HALF * 2, MAP_HALF * 2, seg, seg);
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
    if (p < 0.15) {
      c.copy(areiaEscura).lerp(areia, ruido);
    } else {
      // Estratos: faixas horizontais de rocha clara e escura, como paredes de cânion.
      const faixa = 0.5 + 0.5 * Math.sin(h * 0.45 + fbm(x * 0.01, z * 0.01, 4, 2) * 6);
      c.copy(rochaA).lerp(rochaB, faixa * 0.8 + ruido * 0.2);
      if (h > WALL_HEIGHT * 0.95) c.lerp(topo, 0.6);
    }
    cores[i * 3] = c.r;
    cores[i * 3 + 1] = c.g;
    cores[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cores, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    map: texturaGrao(),
    roughness: 0.95,
    metalness: 0,
    flatShading: true,
  });
  const malha = new THREE.Mesh(geo, mat);
  malha.receiveShadow = true;
  return malha;
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

/** Posto avançado: plataforma circular, anel de neon, hangares e o portal de saída. */
function criarBase() {
  const g = new THREE.Group();
  const y = heightAt(BASE.x, BASE.z);
  const metal = matMetal('#5d6866');
  const escuro = matMetal('#3a4442');
  const neon = matNeon();

  // O topo da plataforma fica exatamente no piso da área de pouso (shared/terrain.js),
  // que é onde a física apoia a nave pousada.
  const piso = AREAS_POUSO[0].piso;
  const plataforma = new THREE.Mesh(new THREE.CylinderGeometry(70, 76, ALTURA_PLATAFORMA, 24), metal);
  plataforma.position.set(BASE.x, y + piso - ALTURA_PLATAFORMA / 2, BASE.z);
  plataforma.receiveShadow = true;
  g.add(plataforma);

  // O anel de neon marca a área de pouso: é o único lugar onde a nave pousa.
  for (const a of AREAS_POUSO) {
    const anel = new THREE.Mesh(new THREE.TorusGeometry(a.raio, 0.6, 6, 48), neon);
    anel.rotation.x = Math.PI / 2;
    anel.position.set(a.x, heightAt(a.x, a.z) + a.piso + 0.2, a.z);
    g.add(anel);
  }

  const centro = new THREE.Mesh(new THREE.TorusGeometry(14, 0.5, 6, 32), neon);
  centro.rotation.x = Math.PI / 2;
  centro.position.set(BASE.x, y + piso + 0.2, BASE.z);
  g.add(centro);

  // Hangares, colunas do portal e antenas saem da planta em shared/obstaculos.js:
  // a mesma lista que a física usa para colidir. Mexeu no tamanho? Mexa lá.
  for (const o of OBSTACULOS.filter((o) => o.nome === 'hangar')) {
    const hangar = new THREE.Group();
    const corpo = new THREE.Mesh(new THREE.BoxGeometry(HANGAR.largura - 4, HANGAR.altura - 2, HANGAR.profundidade - 4), escuro);
    corpo.position.y = (HANGAR.altura - 2) / 2;
    corpo.castShadow = corpo.receiveShadow = true;
    const teto = new THREE.Mesh(new THREE.BoxGeometry(HANGAR.largura, 2, HANGAR.profundidade), metal);
    teto.position.y = HANGAR.altura - 1;
    teto.castShadow = true;
    const faixa = new THREE.Mesh(new THREE.BoxGeometry(26.2, 0.7, 18.2), neon);
    faixa.position.y = 10;
    const porta = new THREE.Mesh(new THREE.PlaneGeometry(12, 8), matNeon(new THREE.Color('#0a8f74')));
    porta.position.set(0, 4.5, 9.05);
    hangar.add(corpo, teto, faixa, porta);
    hangar.position.set(o.x, o.chao, o.z);
    hangar.rotation.y = o.ang;
    g.add(hangar);
  }

  // Portal de saída (Warp Gate) no começo do corredor norte.
  const portal = new THREE.Group();
  const pz = PORTAL.z;
  const py = heightAt(BASE.x, pz);
  const altColuna = PORTAL.altura - 3;
  for (const lado of [-1, 1]) {
    const coluna = new THREE.Mesh(new THREE.BoxGeometry(PORTAL.colunaLarg, altColuna, PORTAL.colunaProf), escuro);
    coluna.position.set(lado * PORTAL.vao, altColuna / 2, 0);
    coluna.castShadow = true;
    const luz = new THREE.Mesh(new THREE.BoxGeometry(PORTAL.colunaLarg + 0.2, 18, 0.6), matNeon(new THREE.Color('#ff4a2a')));
    luz.position.set(lado * PORTAL.vao, 12, PORTAL.colunaProf / 2 + 0.2);
    portal.add(coluna, luz);
  }
  const viga = new THREE.Mesh(new THREE.BoxGeometry(PORTAL.vao * 2 + 6, 4, 7), escuro);
  viga.position.y = PORTAL.altura - 2;
  viga.castShadow = true;
  const vigaNeon = new THREE.Mesh(new THREE.BoxGeometry(40, 0.7, 7.2), neon);
  vigaNeon.position.y = 25;
  portal.add(viga, vigaNeon);
  portal.position.set(BASE.x, py, pz);
  g.add(portal);

  // Torres de antena com luz piscando (a luz é animada em atualizar()).
  const luzes = [];
  for (const o of OBSTACULOS.filter((o) => o.nome === 'antena')) {
    const torre = new THREE.Mesh(new THREE.CylinderGeometry(ANTENAS.raio / 2, ANTENAS.raio, ANTENAS.altura, 6), metal);
    torre.position.set(o.x, o.chao + ANTENAS.altura / 2, o.z);
    torre.castShadow = true;
    const luz = new THREE.Mesh(new THREE.SphereGeometry(1.2, 8, 6), matNeon(new THREE.Color('#ff3b2a')));
    luz.position.set(o.x, o.topo + 1, o.z);
    luzes.push(luz);
    g.add(torre, luz);
  }
  g.userData.luzes = luzes;
  return g;
}

/** Canos, pedras e torres enferrujadas espalhados pelo mapa (só decoração). */
function criarDecoracao() {
  const g = new THREE.Group();
  const rnd = mulberry32(1234);
  const ferrugem = matMetal('#6d3420', { metalness: 0.5, roughness: 0.8 });
  const ferrugemClara = matMetal('#8a4a2a', { metalness: 0.4, roughness: 0.85 });
  const pedra = new THREE.MeshStandardMaterial({ color: '#5e3a26', roughness: 1, flatShading: true });

  let canos = 0;
  let pedras = 0;
  let torres = 0;
  for (let t = 0; t < 6000 && (canos < 70 || pedras < 140 || torres < 30); t++) {
    const x = (rnd() * 2 - 1) * (MAP_HALF - 100);
    const z = (rnd() * 2 - 1) * (MAP_HALF - 100);
    if (Math.hypot(x - BASE.x, z - BASE.z) < 200) continue;
    const p = paredeAt(x, z);
    const h = heightAt(x, z);
    if (p < 0.03 && canos < 70 && rnd() < 0.3) {
      // Cano deitado no fundo do cânion: baixo o bastante para a nave passar por cima.
      const comp = 20 + rnd() * 40;
      const cano = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, comp, 8), ferrugem);
      cano.rotation.z = Math.PI / 2;
      cano.rotation.y = rnd() * Math.PI;
      cano.position.set(x, h + 1.2, z);
      cano.castShadow = cano.receiveShadow = true;
      g.add(cano);
      for (const k of [-0.4, 0.4]) {
        const apoio = new THREE.Mesh(new THREE.BoxGeometry(0.8, 2, 2.6), ferrugemClara);
        const ax = x + Math.cos(cano.rotation.y) * comp * k;
        const az = z - Math.sin(cano.rotation.y) * comp * k;
        apoio.position.set(ax, heightAt(ax, az) + 0.6, az);
        apoio.rotation.y = cano.rotation.y;
        g.add(apoio);
      }
      canos++;
    } else if (p < 0.2 && pedras < 140) {
      const r = 0.8 + rnd() * 1.4; // baixa: a nave (5 m) passa por cima
      const rocha = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), pedra);
      rocha.position.set(x, h + r * 0.3, z);
      rocha.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
      rocha.scale.y = 0.6 + rnd() * 0.4;
      rocha.castShadow = rocha.receiveShadow = true;
      g.add(rocha);
      pedras++;
    } else if (p > 0.97 && torres < 30) {
      // Torre de treliça no alto do planalto: silhueta contra o céu, fora do caminho.
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
      torre.position.set(x, h - 0.5, z);
      torre.rotation.y = rnd() * Math.PI;
      torre.traverse((o) => (o.castShadow = true));
      g.add(torre);
      torres++;
    }
  }
  return g;
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
 * ponto (nave do jogador) que a sombra e a poeira acompanham.
 */
export function criarCena() {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(CORES.neblina, 120, 900);
  scene.background = CORES.horizonte.clone();

  scene.add(criarCeu());
  scene.add(criarTerreno());
  const base = criarBase();
  scene.add(base);
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
    for (const l of base.userData.luzes) l.material.emissiveIntensity = pisca;
  }

  return { scene, atualizar };
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
