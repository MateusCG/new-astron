// Subir de nível e evoluir a nave: o desenho do efeito (a linha do tempo está em
// subida-regras.js). As malhas são do Blender (`subida-nivel.glb` do mapa: o feixe, a onda,
// o selo e a hélice, de tamanho 1, com UV) e a cor e o movimento são do shader, como na
// água. Tudo é luz aditiva na cor da raça de quem subiu (RACES, a dos motores) com o miolo
// branco, sem gravar profundidade e sem neblina; nada ilumina a cena.
//
// Desempenho: cada subida tem o seu grupo com material próprio (os uniformes mudam por
// quadro), que sai de uma reserva e volta para ela ao acabar, nunca liberado: os
// materiais são cópias dos quatro de base, então o Three.js compila um programa por peça
// uma vez só (na tela de carregamento, que toca uma subida para aquecer).

import * as THREE from 'three';
import { instanciaMapa, modeloMapaPronto } from './mapa-modelos.js';

export const MODELO_SUBIDA = 'subida-nivel';

const VERTICE = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    // O glTF guarda o v invertido em relação ao Blender: aqui ele volta a contar do pé.
    vUv = vec2(uv.x, 1.0 - uv.y);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vV = -mv.xyz;
    vN = normalMatrix * normal;
    gl_Position = projectionMatrix * mv;
  }
`;

const FIM = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
`;

// O feixe: miolo claro e borda macia (o quanto a face olha para a câmera), riscos subindo,
// a cabeça mais clara e o alto sumindo no céu. Só existe abaixo da cabeça.
const FEIXE = /* glsl */ `
  uniform vec3 uCor;
  uniform float uAlfa, uCabeca, uTempo, uAltura;
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    float v = vUv.y;
    float olha = abs(dot(normalize(vN), normalize(vV)));
    float miolo = olha * olha;
    float existe = 1.0 - smoothstep(uCabeca - 0.015, uCabeca, v);
    float cabeca = exp(-max(uCabeca - v, 0.0) * uAltura / 7.0) * (1.0 - 0.6 * v);
    float riscos = 0.7 + 0.3 * sin(v * uAltura * 0.22 - uTempo * 28.0 + vUv.x * 18.85);
    float alto = pow(1.0 - v, 0.8);
    vec3 cor = mix(uCor, vec3(1.0), clamp(miolo * 0.45 + cabeca * 0.5, 0.0, 1.0));
    float a = uAlfa * existe * miolo * (alto * riscos + cabeca * 1.4);
    gl_FragColor = vec4(cor, clamp(a, 0.0, 1.0));
    ${FIM}
  }
`;

// A onda: faixa clara perto da borda de fora, macia por dentro.
const ONDA = /* glsl */ `
  uniform vec3 uCor;
  uniform float uAlfa;
  varying vec2 vUv;
  void main() {
    float v = vUv.y;
    float faixa = smoothstep(0.35, 0.85, v) * (1.0 - smoothstep(0.88, 1.0, v));
    vec3 cor = mix(uCor, vec3(1.0), 0.25 * faixa);
    gl_FragColor = vec4(cor, uAlfa * faixa);
    ${FIM}
  }
`;

// O selo: cor da raça com uma varredura de luz correndo em volta (o ângulo é o u).
const SELO = /* glsl */ `
  uniform vec3 uCor;
  uniform float uAlfa, uVarre;
  varying vec2 vUv;
  void main() {
    float varre = pow(fract(vUv.x - uVarre), 5.0);
    vec3 cor = mix(uCor, vec3(1.0), 0.1 + 0.6 * varre);
    gl_FragColor = vec4(cor, uAlfa * (0.55 + 0.45 * varre));
    ${FIM}
  }
`;

// A hélice: a cabeça corre a fita (u) com o rastro apagando atrás; macia nas beiradas (v).
const HELICE = /* glsl */ `
  uniform vec3 uCor;
  uniform float uAlfa, uCabeca;
  varying vec2 vUv;
  void main() {
    float atras = uCabeca - vUv.x;
    float rastro = atras < 0.0 ? 0.0 : 1.0 - smoothstep(0.0, 0.45, atras);
    float beira = pow(1.0 - abs(vUv.y * 2.0 - 1.0), 1.6); // fio claro no meio da fita
    vec3 cor = mix(uCor, vec3(1.0), rastro * rastro * 0.3);
    gl_FragColor = vec4(cor, 0.7 * uAlfa * rastro * beira);
    ${FIM}
  }
`;

const PECAS = {
  feixe: { no: 'subida_feixe', frag: FEIXE, uniformes: { uCabeca: 0, uTempo: 0, uAltura: 1 } },
  onda: { no: 'subida_onda', frag: ONDA, uniformes: {} },
  onda2: { no: 'subida_onda', frag: ONDA, uniformes: {} },
  selo: { no: 'subida_selo', frag: SELO, uniformes: { uVarre: 0 } },
  helice: { no: 'subida_helice', frag: HELICE, uniformes: { uCabeca: 0 } },
};

let geometrias = null; // nó do glb -> geometria
const bases = new Map(); // peça -> material de base (as subidas usam cópias)
const reserva = [];

function geometriasProntas() {
  if (geometrias) return true;
  if (!modeloMapaPronto(MODELO_SUBIDA)) return false;
  const modelo = instanciaMapa(MODELO_SUBIDA);
  geometrias = {};
  modelo.traverse((o) => {
    if (o.isMesh) geometrias[o.name] = o.geometry;
  });
  return true;
}

function material(peca) {
  let base = bases.get(peca);
  if (!base) {
    const { frag, uniformes } = PECAS[peca];
    base = new THREE.ShaderMaterial({
      vertexShader: VERTICE,
      fragmentShader: frag,
      uniforms: Object.fromEntries(Object.entries({ uCor: new THREE.Color(), uAlfa: 0, ...uniformes }).map(([k, v]) => [k, { value: v }])),
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    bases.set(peca, base);
  }
  const m = base.clone();
  m.uniforms.uCor.value = new THREE.Color();
  return m;
}

/** Uma subida pronta para tocar (grupo com as peças), ou null se o modelo não chegou. */
export function criarSubida() {
  if (!geometriasProntas()) return null;
  let s = reserva.pop();
  if (!s) {
    const obj = new THREE.Group();
    const malhas = {};
    for (const [peca, { no }] of Object.entries(PECAS)) {
      const m = new THREE.Mesh(geometrias[no], material(peca));
      m.frustumCulled = false; // o feixe passa do alto e o grupo anda com a nave
      obj.add(m);
      malhas[peca] = m;
    }
    s = { obj, malhas };
  }
  s.obj.visible = true;
  return s;
}

/** Devolve a subida à reserva (tira da cena). */
export function soltarSubida(s) {
  if (!s) return;
  s.obj.removeFromParent();
  reserva.push(s);
}

/**
 * Desenha o quadro `q` (de quadroSubida) na subida `s` (o grupo já no x e z da nave, y 0):
 * `cor` da raça, `corpo` da nave (m), `pe` e `alto` (y do mundo do pé do selo e do alto
 * da nave) e `t` (s, para os riscos do feixe).
 */
export function desenharSubida(s, q, { cor, corpo, pe, alto, t }) {
  const { feixe, onda, onda2, selo, helice } = s.malhas;
  for (const m of Object.values(s.malhas)) m.material.uniforms.uCor.value.copy(cor);

  selo.position.y = pe + q.selo.sobe * corpo;
  selo.scale.setScalar(q.selo.raio * corpo);
  selo.rotation.y = q.selo.giro;
  selo.material.uniforms.uAlfa.value = q.selo.alfa * 0.85;
  selo.material.uniforms.uVarre.value = q.selo.varre;

  [onda, onda2].forEach((m, i) => {
    const o = q.ondas[i];
    m.visible = !!o && o.alfa > 0;
    if (!m.visible) return;
    m.position.y = pe + 0.05;
    m.scale.setScalar(o.raio * corpo);
    m.material.uniforms.uAlfa.value = o.alfa;
  });

  feixe.visible = q.feixe.alfa > 0;
  feixe.position.y = pe;
  feixe.scale.set(q.feixe.raio * corpo, q.feixe.altura, q.feixe.raio * corpo);
  const uf = feixe.material.uniforms;
  uf.uAlfa.value = q.feixe.alfa;
  uf.uCabeca.value = q.feixe.cabeca;
  uf.uTempo.value = t;
  uf.uAltura.value = q.feixe.altura;

  helice.visible = q.helice.alfa > 0;
  helice.position.y = pe;
  helice.scale.set(q.helice.raio * corpo, Math.max(alto - pe, corpo * 0.5) + corpo * 0.7, q.helice.raio * corpo);
  helice.rotation.y = q.helice.giro;
  helice.material.uniforms.uAlfa.value = q.helice.alfa;
  helice.material.uniforms.uCabeca.value = q.helice.cabeca;
}
