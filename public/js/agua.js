// Água do lago de Hélio-3 (receita da PROPOSTA-VISUAL.md da frente Cenário, seção 3).
//
// O lago fica em NIVEL_AGUA, abaixo do chão de voo (0): tudo parece flutuar sobre a
// água, como no Stage 6. É um plano só, em grade de ~10 m, desenhado num
// ShaderMaterial próprio:
// - ondas: três senos direcionais somados no vertex shader (~0,6 m no total), e a
//   normal sai das derivadas no fragment (facetada, como o resto do jogo): a grade
//   grossa vira facetas que piscam devagar com o sol;
// - cor por profundidade: um MAPA DE DISTÂNCIA (DataTexture de 10 m por texel, feito
//   uma vez aqui) diz quantos metros cada ponto está da rocha, da mineradora ou de uma
//   pedra que fura a água. Toda rocha abre em talude embaixo d'água, então perto dela
//   a água é rasa (clara, mais transparente) e no meio do lago funda (escura);
// - Fresnel para a cor da neblina no rasante, brilho do sol nas facetas, espuma
//   serrilhada encostada no que fura a água (com um anel que se abre devagar) e o
//   brilho azul-gelo do He-3 por baixo (mineradora, Núcleo, veios de cristal);
// - a neblina do three (fog_pars/fog_fragment), para a água sumir no horizonte igual
//   às rochas. A névoa de guerra (nevoa.js) é um passo de tela inteira por cima: a
//   água entra nela sem mudar nada aqui (ela projeta o fundo visto pela água no plano
//   de NIVEL_AGUA).
//
// Cáusticas: o fundo do lago e a rocha molhada (da água para baixo) ganham as linhas
// de luz da água andando devagar (comCaustica, por onBeforeCompile no material do
// glb), apagando com a profundidade.
//
// O relógio das ondas e das cáusticas é um uniforme só (TEMPO_AGUA), que a cena
// avança a cada quadro.

import * as THREE from 'three';
import {
  ROCHAS,
  ABERTO,
  MINERADORA,
  NIVEL_AGUA,
  sdRetanguloArredondado,
  distSegmento,
} from '/shared/terrain.js';
import { OBSTACULOS } from '/shared/obstaculos.js';

/** Lado da célula do mapa de distância (m). */
const CELULA_DIST = 10;
/** Tamanho do plano da água (m): cobre a região aberta com folga (a borda tampa o resto). */
const AGUA_LARGURA = 3200;
const AGUA_PROFUNDIDADE = 2400;
/** Quadrados da grade da água por lado (~10 m cada). */
const AGUA_SEG_X = 320;
const AGUA_SEG_Z = 240;
/** Distância máxima guardada no mapa (m): passou disso, é "lago fundo". */
const DIST_MAX = 255;

export const CORES_AGUA = {
  rasa: new THREE.Color('#4fb3a6'),
  funda: new THREE.Color('#0e3f4a'),
  espuma: new THREE.Color('#e9f3ea'),
  brilho: new THREE.Color('#ffe2b8'),
  he3: new THREE.Color('#9fe8ff'),
  caustica: new THREE.Color('#bff3e6'),
};

/** Relógio das ondas e cáusticas (s), compartilhado por todos os materiais da água. */
export const TEMPO_AGUA = { value: 0 };

// ---------- Mapa de distância ----------

/** Distância com sinal até a borda da região aberta (positiva na rocha), como sdBorda de shared/terrain.js. */
function sdBorda(x, z) {
  const k = ABERTO.canto;
  const a = sdRetanguloArredondado(x, z, 0, 0, ABERTO.jungle.meiaX, ABERTO.jungle.meiaZ, k);
  const b = sdRetanguloArredondado(x, z, 0, 0, ABERTO.lane.meiaX, ABERTO.lane.meiaZ, k);
  return Math.max(k, Math.min(a, b)) - Math.hypot(Math.max(k - a, 0), Math.max(k - b, 0));
}

/**
 * Metros do ponto (x, z) até o sólido mais perto que fura a água: rochas (ROCHAS),
 * a mineradora, as torres e os pontos extra (`extras`: pedras do lago e pilares,
 * { x, z, raio }). 0 dentro.
 */
export function distanciaAoSolido(x, z, extras = []) {
  let d = -sdBorda(x, z);
  for (const r of ROCHAS) {
    if (r.forma === 'capsula') d = Math.min(d, distSegmento(x, z, r.ax, r.az, r.bx, r.bz) - r.raio);
    else if (r.forma === 'retangulo') d = Math.min(d, sdRetanguloArredondado(x, z, r.x, r.z, r.meiaX, r.meiaZ, r.canto));
  }
  const m = MINERADORA;
  d = Math.min(d, sdRetanguloArredondado(x, z, m.x, m.z, m.meiaX, m.meiaZ, m.canto));
  for (const o of OBSTACULOS) if (o.forma === 'cilindro') d = Math.min(d, Math.hypot(x - o.x, z - o.z) - o.raio);
  for (const p of extras) d = Math.min(d, Math.hypot(x - p.x, z - p.z) - p.raio);
  return Math.max(0, d);
}

/** DataTexture (R, em metros até DIST_MAX) com a distância de cada célula ao sólido mais perto. */
function mapaDeDistancia(extras) {
  const nx = Math.round(AGUA_LARGURA / CELULA_DIST);
  const nz = Math.round(AGUA_PROFUNDIDADE / CELULA_DIST);
  const dados = new Uint8Array(nx * nz);
  for (let k = 0; k < nz; k++) {
    const z = -AGUA_PROFUNDIDADE / 2 + (k + 0.5) * CELULA_DIST;
    for (let i = 0; i < nx; i++) {
      const x = -AGUA_LARGURA / 2 + (i + 0.5) * CELULA_DIST;
      dados[k * nx + i] = Math.min(DIST_MAX, Math.round(distanciaAoSolido(x, z, extras)));
    }
  }
  const tex = new THREE.DataTexture(dados, nx, nz, THREE.RedFormat, THREE.UnsignedByteType);
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

// ---------- Superfície ----------

const VERTICE = /* glsl */ `
  uniform float uTempo;
  varying vec3 vPos;
  #include <fog_pars_vertex>
  float onda(vec2 p, vec2 dir, float comp, float amp, float vel) {
    float k = 6.2831853 / comp;
    return amp * sin(dot(normalize(dir), p) * k - uTempo * vel * k);
  }
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    w.y += onda(w.xz, vec2(0.8, 0.6), 38.0, 0.30, 1.6)
         + onda(w.xz, vec2(-0.4, 0.9), 21.0, 0.18, 1.2)
         + onda(w.xz, vec2(0.95, -0.3), 11.0, 0.10, 0.9);
    vPos = w.xyz;
    vec4 mvPosition = viewMatrix * w;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;

const FRAGMENTO = /* glsl */ `
  uniform float uTempo;
  uniform sampler2D uDist;
  uniform vec4 uMapa;
  uniform vec3 uRasa, uFunda, uEspuma, uBrilho, uCeu, uHe3, uCaustica, uSolDir;
  uniform vec4 uHe3Pontos[8];
  uniform float uHe3Pulso;
  varying vec3 vPos;
  #include <fog_pars_fragment>
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float ruido(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + 1.0), f.x), f.y);
  }
  float caustica(vec2 p, float t) {
    vec2 a = p / 14.0 + vec2(t * 0.043, t * 0.02);
    vec2 b = p / 23.0 - vec2(t * 0.017, -t * 0.03);
    a += 0.6 * vec2(sin(a.y * 1.7 + t * 0.5), cos(a.x * 1.9 - t * 0.4));
    b += 0.6 * vec2(sin(b.y * 1.3 - t * 0.3), cos(b.x * 1.5 + t * 0.35));
    float c1 = abs(sin(a.x * 3.1) * sin(a.y * 3.1));
    float c2 = abs(sin(b.x * 3.1) * sin(b.y * 3.1));
    return pow(1.0 - min(c1, c2), 10.0);
  }
  void main() {
    vec3 N = normalize(cross(dFdx(vPos), dFdy(vPos)));
    if (N.y < 0.0) N = -N;
    vec3 V = normalize(cameraPosition - vPos);
    float d = texture2D(uDist, (vPos.xz - uMapa.xy) / uMapa.zw).r * 255.0;
    float raso = exp(-d / 35.0);
    vec3 cor = mix(uFunda, uRasa, 0.25 + 0.75 * raso);
    float alpha = mix(0.8, 0.52, raso);
    for (int i = 0; i < 8; i++) {
      vec4 h = uHe3Pontos[i];
      float q = length(vPos.xz - h.xy) / max(h.z, 1.0);
      cor += uHe3 * h.w * uHe3Pulso * exp(-q * q);
    }
    cor += uCaustica * caustica(vPos.xz, uTempo) * 0.04;
    // Luz do sol na face (difusa fraca: a água é escura e a cor vem da profundidade).
    cor *= 0.8 + 0.35 * max(dot(N, uSolDir), 0.0);
    float fr = pow(1.0 - max(dot(N, V), 0.0), 4.0);
    cor = mix(cor, uCeu, fr * 0.6);
    float spec = pow(max(dot(reflect(-uSolDir, N), V), 0.0), 90.0);
    cor += uBrilho * spec * 1.4;
    alpha = max(alpha, fr * 0.9);
    float esp = step(ruido(vPos.xz * 0.3 + uTempo * 0.5), 1.0 - d / 6.0);
    esp += 0.35 * step(0.92, sin(d * 1.2 - uTempo * 1.5)) * step(d, 14.0) * step(0.5, d);
    esp = clamp(esp, 0.0, 1.0);
    cor = mix(cor, uEspuma, esp * 0.8);
    alpha = max(alpha, esp * 0.85);
    gl_FragColor = vec4(cor, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }`;

/**
 * O plano da água. `ceu` é a cor da neblina (Fresnel), `solDir` a direção do sol,
 * `pontosHe3` até 8 pontos { x, z, raio, forca } do brilho azul-gelo por baixo e
 * `extras` os sólidos pequenos que furam a água ({ x, z, raio }: pedras do lago).
 * userData.material.uniforms.uHe3Pulso pulsa junto com o neon do He-3.
 */
export function criarAgua({ ceu, solDir, pontosHe3 = [], extras = [] }) {
  const geo = new THREE.PlaneGeometry(AGUA_LARGURA, AGUA_PROFUNDIDADE, AGUA_SEG_X, AGUA_SEG_Z);
  geo.rotateX(-Math.PI / 2);
  const pontos = Array.from({ length: 8 }, (_, i) => {
    const p = pontosHe3[i];
    return p ? new THREE.Vector4(p.x, p.z, p.raio, p.forca) : new THREE.Vector4(0, 0, 1, 0);
  });
  const material = new THREE.ShaderMaterial({
    vertexShader: VERTICE,
    fragmentShader: FRAGMENTO,
    transparent: true,
    depthWrite: false,
    fog: true,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uDist: { value: null },
        uMapa: { value: new THREE.Vector4(-AGUA_LARGURA / 2, -AGUA_PROFUNDIDADE / 2, AGUA_LARGURA, AGUA_PROFUNDIDADE) },
        uRasa: { value: CORES_AGUA.rasa },
        uFunda: { value: CORES_AGUA.funda },
        uEspuma: { value: CORES_AGUA.espuma },
        uBrilho: { value: CORES_AGUA.brilho },
        uCeu: { value: ceu },
        uHe3: { value: CORES_AGUA.he3 },
        uCaustica: { value: CORES_AGUA.caustica },
        uSolDir: { value: solDir },
        uHe3Pontos: { value: pontos },
        uHe3Pulso: { value: 1 },
      },
    ]),
  });
  // O relógio é o mesmo objeto para todas as águas e cáusticas (merge copia os uniformes).
  material.uniforms.uTempo = TEMPO_AGUA;
  material.uniforms.uDist.value = mapaDeDistancia(extras);
  const agua = new THREE.Mesh(geo, material);
  agua.position.y = NIVEL_AGUA;
  agua.renderOrder = 1; // depois dos opacos (fundo, rochas)
  agua.frustumCulled = false;
  agua.userData.material = material;
  return agua;
}

// ---------- Cáusticas ----------

/**
 * Põe as cáusticas da água num MeshStandardMaterial (fundo do lago, rocha molhada):
 * linhas claras andando devagar na posição do mundo, somadas no emissivo, só abaixo
 * da água e apagando com a profundidade. Devolve o próprio material.
 */
export function comCaustica(material, forca = 0.25) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTempo = TEMPO_AGUA;
    shader.uniforms.uCausticaCor = { value: CORES_AGUA.caustica };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vMundoAgua;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvMundoAgua = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTempo;
        uniform vec3 uCausticaCor;
        varying vec3 vMundoAgua;
        float causticaAgua(vec2 p, float t) {
          vec2 a = p / 14.0 + vec2(t * 0.043, t * 0.02);
          vec2 b = p / 23.0 - vec2(t * 0.017, -t * 0.03);
          a += 0.6 * vec2(sin(a.y * 1.7 + t * 0.5), cos(a.x * 1.9 - t * 0.4));
          b += 0.6 * vec2(sin(b.y * 1.3 - t * 0.3), cos(b.x * 1.5 + t * 0.35));
          float c1 = abs(sin(a.x * 3.1) * sin(a.y * 3.1));
          float c2 = abs(sin(b.x * 3.1) * sin(b.y * 3.1));
          return pow(1.0 - min(c1, c2), 10.0);
        }`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float fundoAgua = smoothstep(-70.0, -20.0, vMundoAgua.y) * step(vMundoAgua.y, ${NIVEL_AGUA.toFixed(1)});
        totalEmissiveRadiance += uCausticaCor * causticaAgua(vMundoAgua.xz, uTempo) * ${forca.toFixed(3)} * fundoAgua;`,
      );
  };
  material.customProgramCacheKey = () => `caustica${forca}`;
  return material;
}
