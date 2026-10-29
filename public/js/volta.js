// Volta à base (recall): o desenho do efeito (a linha do tempo está em volta-regras.js).
// As malhas de luz são do Blender (`volta-base.glb` do mapa: o portal, os fios, o feixe e
// o anel, de tamanho 1, com UV) e a cor e o movimento são do shader, como na subida de
// nível e na água. A casca é a própria nave desenhada de novo por cima (as malhas do casco
// e das armas, sem a propulsão), num shader de luz que estica, afina e se desfaz: é ela que
// faz a nave "virar luz" e ser sugada pelo portal, e se condensar de volta na chegada.
// Tudo aditivo na cor do time (relativa a quem olha), com o miolo branco, sem gravar
// profundidade e sem neblina; nada ilumina a cena.
//
// Desempenho: cada volta tem o seu grupo com material próprio (os uniformes mudam por
// quadro), que sai de uma reserva e volta para ela ao acabar, nunca liberado: os materiais
// são cópias dos cinco de base, então o Three.js compila um programa por peça uma vez só
// (na tela de carregamento, que toca uma volta para aquecer). As cascas são malhas novas
// sobre as geometrias que a nave já tem (nada vai para a placa de vídeo de novo).

import * as THREE from 'three';
import { instanciaMapa, modeloMapaPronto } from './mapa-modelos.js';
import { PORTAL_ALTURA, PORTAL_ALTURA_MIN, RAIO_ALTURA } from './volta-regras.js';

export const MODELO_VOLTA = 'volta-base';

const TAU = Math.PI * 2;

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

// O portal: o vórtice do meio (espiral girando, miolo branco) só até onde a íris abriu, o
// aro de dentro, as 8 lâminas (as acesas claras, a que está acendendo enchendo), o aro de
// fora com um brilho correndo e as marcas de mira. O que é o quê vem do raio (v).
const PORTAL = /* glsl */ `
  uniform vec3 uCor;
  uniform float uAlfa, uAbre, uAcesas, uVortice, uFase, uTempo;
  varying vec2 vUv;
  void main() {
    float u = vUv.x;
    float v = vUv.y;
    float a;
    float quente;
    if (v < 0.615) {
      float borda = uAbre * 0.6;
      float dentro = 1.0 - smoothstep(borda - 0.08, borda, v);
      float espiral = pow(0.5 + 0.5 * sin(u * 18.85 + v * 16.0 - uFase * 6.2832), 3.0);
      float miolo = exp(-v * v * 45.0);
      a = uVortice * dentro * (0.1 + 0.45 * espiral * smoothstep(0.0, 0.45, v) + 0.8 * miolo);
      quente = miolo + 0.15 * espiral;
    } else if (v < 0.69) {
      a = 0.7;
      quente = 0.3;
    } else if (v < 0.95) {
      float acesa = clamp(uAcesas - floor(u * 8.0), 0.0, 1.0);
      float meio = 1.0 - abs((v - 0.82) / 0.11);
      a = 0.1 + 0.55 * acesa * (0.55 + 0.45 * meio);
      quente = 0.2 * acesa;
    } else if (v < 1.015) {
      float corre = pow(fract(u * 2.0 - uTempo * 0.8), 8.0);
      a = 0.5 + 0.4 * corre;
      quente = 0.1 + 0.5 * corre;
    } else {
      a = 0.4;
      quente = 0.0;
    }
    vec3 cor = mix(uCor, vec3(1.0), clamp(quente, 0.0, 1.0) * 0.55);
    gl_FragColor = vec4(cor, clamp(a * uAlfa, 0.0, 1.0));
    ${FIM}
  }
`;

// Os fios: pulsos de luz subindo da nave até o portal, macios nas pontas e nas beiradas.
const FIOS = /* glsl */ `
  uniform vec3 uCor;
  uniform float uAlfa, uFase;
  varying vec2 vUv;
  void main() {
    float u = vUv.x;
    float pulsos = pow(0.5 + 0.5 * sin((u * 4.0 - uFase) * 6.2832), 6.0);
    float pontas = smoothstep(0.0, 0.12, u) * (1.0 - smoothstep(0.8, 1.0, u));
    float beira = pow(1.0 - abs(vUv.y * 2.0 - 1.0), 1.5);
    vec3 cor = mix(uCor, vec3(1.0), 0.45 * pulsos);
    gl_FragColor = vec4(cor, clamp(uAlfa * pontas * beira * (0.25 + 0.9 * pulsos), 0.0, 1.0));
    ${FIM}
  }
`;

// O feixe: a linha de luz entre o céu e a nave (ou o portal). Só existe de um lado da
// cabeça (abaixo dela quando sobe, acima quando desce); miolo claro, pacotes de luz
// correndo no sentido dele e a cabeça mais clara.
const FEIXE = /* glsl */ `
  uniform vec3 uCor;
  uniform float uAlfa, uCabeca, uSobe, uTempo, uAltura;
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    float v = vUv.y;
    float olha = abs(dot(normalize(vN), normalize(vV)));
    float miolo = olha * olha;
    float existe = uSobe > 0.5 ? 1.0 - smoothstep(uCabeca - 0.01, uCabeca, v) : smoothstep(uCabeca, uCabeca + 0.01, v);
    float cabeca = exp(-abs(v - uCabeca) * uAltura / 5.0);
    float pacotes = 0.7 + 0.3 * sin(v * uAltura * 0.12 + (uSobe > 0.5 ? -1.0 : 1.0) * uTempo * 32.0);
    float ceu = pow(1.0 - v, 0.7);
    vec3 cor = mix(uCor, vec3(1.0), clamp(miolo * miolo * 0.35 + cabeca * 0.6, 0.0, 1.0));
    gl_FragColor = vec4(cor, clamp(uAlfa * existe * miolo * (0.55 * ceu * pacotes + cabeca * 1.2), 0.0, 1.0));
    ${FIM}
  }
`;

// A onda: coroa tracejada (32 traços), mais clara perto da borda de fora.
const ANEL = /* glsl */ `
  uniform vec3 uCor;
  uniform float uAlfa;
  varying vec2 vUv;
  void main() {
    float v = vUv.y;
    float borda = smoothstep(0.45, 0.88, v) * (1.0 - smoothstep(0.9, 1.0, v));
    float traco = step(0.4, fract(vUv.x * 48.0));
    vec3 cor = mix(uCor, vec3(1.0), 0.25 * borda * traco);
    gl_FragColor = vec4(cor, clamp(uAlfa * borda * (0.25 + 0.75 * traco), 0.0, 1.0));
    ${FIM}
  }
`;

// A casca: a nave em luz. Estica e afina em volta do eixo dela (o pé um pouco abaixo do
// centro, para esticar para cima), a borda mais clara que o miolo (a normal vem da própria
// face esticada, como o casco facetado), linhas de varredura subindo e, na chegada, a
// linha que desce desfazendo a casca e mostrando o casco (`uRevela`, em corpos).
const CASCA_VERTICE = /* glsl */ `
  uniform vec3 uCentro;
  uniform float uCorpo, uEstica, uAperta, uSobe;
  varying vec3 vW;
  varying float vH;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vec3 d = w.xyz - uCentro;
    vH = d.y / uCorpo;
    float pe = -0.3 * uCorpo;
    w.xz = uCentro.xz + d.xz * uAperta;
    w.y = uCentro.y + pe + (d.y - pe) * uEstica + uSobe;
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const CASCA = /* glsl */ `
  uniform vec3 uCor;
  uniform float uAlfa, uBranco, uRevela, uVarre;
  varying vec3 vW;
  varying float vH;
  void main() {
    vec3 n = normalize(cross(dFdx(vW), dFdy(vW)));
    float borda = 1.0 - abs(dot(n, normalize(cameraPosition - vW)));
    float fres = borda * borda;
    float linhas = pow(0.5 + 0.5 * sin((vH * 5.0 - uVarre) * 6.2832), 10.0);
    float resta = 1.0 - smoothstep(uRevela - 0.08, uRevela + 0.08, vH);
    float fio = exp(-abs(vH - uRevela) * 14.0);
    float a = uAlfa * (resta * (0.16 + 0.8 * fres + 0.45 * linhas + 0.85 * uBranco) + 1.2 * fio);
    vec3 cor = mix(uCor, vec3(1.0), clamp(0.2 * fres + 0.8 * uBranco + 0.6 * fio, 0.0, 1.0));
    gl_FragColor = vec4(cor, clamp(a, 0.0, 1.0));
    ${FIM}
  }
`;

const PECAS = {
  portal: { no: 'volta_portal', frag: PORTAL, uniformes: { uAbre: 0, uAcesas: 0, uVortice: 0, uFase: 0, uTempo: 0 } },
  fios: { no: 'volta_fios', frag: FIOS, uniformes: { uFase: 0 } },
  feixe: { no: 'volta_feixe', frag: FEIXE, uniformes: { uCabeca: 0, uSobe: 0, uTempo: 0, uAltura: 1 } },
  anel: { no: 'volta_anel', frag: ANEL, uniformes: {} },
};
const UNIFORMES_CASCA = { uCentro: new THREE.Vector3(), uCorpo: 1, uEstica: 1, uAperta: 1, uSobe: 0, uBranco: 0, uRevela: 99, uVarre: 0 };

let geometrias = null; // nó do glb -> geometria
const bases = new Map(); // peça -> material de base (as voltas usam cópias)
const reserva = [];

function geometriasProntas() {
  if (geometrias) return true;
  if (!modeloMapaPronto(MODELO_VOLTA)) return false;
  geometrias = {};
  instanciaMapa(MODELO_VOLTA).traverse((o) => {
    if (o.isMesh) geometrias[o.name] = o.geometry;
  });
  return true;
}

function uniformes(extra) {
  return Object.fromEntries(Object.entries({ uCor: new THREE.Color(), uAlfa: 0, ...extra }).map(([k, v]) => [k, { value: v?.clone ? v.clone() : v }]));
}

function material(peca) {
  let base = bases.get(peca);
  if (!base) {
    const casca = peca === 'casca';
    base = new THREE.ShaderMaterial({
      vertexShader: casca ? CASCA_VERTICE : VERTICE,
      fragmentShader: casca ? CASCA : PECAS[peca].frag,
      uniforms: uniformes(casca ? UNIFORMES_CASCA : PECAS[peca].uniformes),
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      // A casca fica por cima do casco de verdade (mesma malha): puxada para a câmera.
      ...(casca ? { side: THREE.FrontSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 } : { side: THREE.DoubleSide }),
    });
    bases.set(peca, base);
  }
  return base.clone(); // o clone copia os uniformes (cores e vetores novos)
}

/** Uma volta pronta para tocar (grupo com as peças e o material da casca), ou null se o modelo não chegou. */
export function criarVolta() {
  if (!geometriasProntas()) return null;
  let v = reserva.pop();
  if (!v) {
    const obj = new THREE.Group();
    const malhas = {};
    for (const [peca, { no }] of Object.entries(PECAS)) {
      const m = new THREE.Mesh(geometrias[no], material(peca));
      m.frustumCulled = false; // o feixe passa do alto da tela
      obj.add(m);
      malhas[peca] = m;
    }
    v = { obj, malhas, casca: material('casca'), fantasmas: [], fontes: [], fases: { giro: 0, vortice: 0, fios: 0, varre: 0 }, tempo: 0 };
  }
  for (const k of Object.keys(v.fases)) v.fases[k] = 0;
  v.tempo = 0;
  v.obj.visible = true;
  return v;
}

/** Devolve a volta à reserva (tira da cena e solta as cascas). */
export function soltarVolta(v) {
  if (!v) return;
  montarCasca(v, null);
  v.obj.removeFromParent();
  reserva.push(v);
}

/** Material de luz (propulsão, brilho): fica fora da casca. */
function ehLuz(m) {
  return (Array.isArray(m) ? m : [m]).some((x) => !x || x.transparent || x.blending === THREE.AdditiveBlending);
}

/**
 * A casca da volta `v` sobre as malhas visíveis de `casco` (o grupo do casco da nave: o
 * modelo e as armas, sem a propulsão); null tira. As cascas seguem as malhas de origem a
 * cada quadro (seguirCasca), ou ficam na pose de agora (a partida, que fica onde a nave
 * sumiu).
 */
export function montarCasca(v, casco) {
  for (const f of v.fantasmas) f.removeFromParent();
  v.fantasmas = [];
  v.fontes = [];
  v.cascoDe = casco;
  if (!casco) return;
  casco.updateWorldMatrix(true, true);
  casco.traverse((o) => {
    if (!o.isMesh || ehLuz(o.material)) return;
    for (let p = o; p && p !== casco; p = p.parent) if (!p.visible) return;
    const f = new THREE.Mesh(o.geometry, v.casca);
    f.matrixAutoUpdate = false;
    f.frustumCulled = false; // esticada, sai da caixa da malha
    f.matrix.copy(o.matrixWorld);
    f.matrixWorldNeedsUpdate = true;
    v.obj.add(f);
    v.fantasmas.push(f);
    v.fontes.push(o);
  });
}

/** As cascas vão para onde as malhas de origem estão agora. */
export function seguirCasca(v) {
  v.fontes.forEach((o, i) => {
    o.updateWorldMatrix(true, false);
    v.fantasmas[i].matrix.copy(o.matrixWorld);
    v.fantasmas[i].matrixWorldNeedsUpdate = true;
  });
}

/** Altura do portal acima do centro da nave (m). */
export function alturaPortal(corpo) {
  return Math.max(PORTAL_ALTURA * corpo, PORTAL_ALTURA_MIN);
}

/**
 * Desenha o quadro `q` (de quadroCanal, quadroPartida ou quadroChegada) na volta `v`,
 * em volta do centro da nave (`x`, `y`, `z`, m): `cor` do time, `corpo` da nave (m), `dt`
 * (s, para os giros e os pulsos) e `brilho` (a sua nave, com a câmera logo atrás,
 * acende menos).
 */
export function desenharVolta(v, q, { cor, corpo, x, y, z, dt, brilho = 1 }) {
  const { portal, fios, feixe, anel } = v.malhas;
  const f = v.fases;
  v.tempo += dt;
  f.giro += q.portal.giro * dt;
  f.vortice += q.portal.giroVortice * dt;
  f.fios += q.fios.corre * dt;
  f.varre += q.casca.varre * dt;
  for (const m of [portal, fios, feixe, anel]) m.material.uniforms.uCor.value.copy(cor);
  const alto = alturaPortal(corpo);

  portal.visible = q.portal.alfa > 0 && q.portal.raio > 0.01;
  portal.position.set(x, y + alto, z);
  portal.scale.setScalar(Math.max(0.001, q.portal.raio * corpo));
  portal.rotation.y = f.giro * TAU;
  const up = portal.material.uniforms;
  up.uAlfa.value = q.portal.alfa * brilho;
  up.uAbre.value = q.portal.abre;
  up.uAcesas.value = q.portal.acesas;
  up.uVortice.value = q.portal.vortice;
  up.uFase.value = f.vortice;
  up.uTempo.value = v.tempo;

  // Os fios saem em volta da nave (um pouco abaixo do centro) e se juntam no portal.
  fios.visible = q.fios.alfa > 0.005;
  const baixo = 0.35 * corpo;
  const rf = 1.15 * corpo * q.fios.aperta;
  fios.position.set(x, y - baixo, z);
  fios.scale.set(rf, alto + baixo, rf);
  fios.rotation.y = -f.giro * TAU * 0.25;
  fios.material.uniforms.uAlfa.value = q.fios.alfa * 0.9 * brilho;
  fios.material.uniforms.uFase.value = f.fios;

  feixe.visible = !!q.feixe && q.feixe.alfa > 0;
  if (feixe.visible) {
    const pe = q.feixe.doPortal ? alto : 0;
    const altura = RAIO_ALTURA;
    const r = Math.max(0.05, q.feixe.raio * corpo);
    feixe.position.set(x, y + pe, z);
    feixe.scale.set(r, altura, r);
    const uf = feixe.material.uniforms;
    uf.uAlfa.value = q.feixe.alfa * brilho;
    uf.uCabeca.value = q.feixe.cabeca;
    uf.uSobe.value = q.feixe.sobe ? 1 : 0;
    uf.uTempo.value = v.tempo;
    uf.uAltura.value = altura;
  }

  anel.visible = !!q.anel && q.anel.alfa > 0;
  if (anel.visible) {
    anel.position.set(x, y + (q.anel.noPortal ? alto : 0), z);
    anel.scale.setScalar(q.anel.raio * corpo);
    anel.material.uniforms.uAlfa.value = q.anel.alfa * brilho;
  }

  const uc = v.casca.uniforms;
  uc.uCor.value.copy(cor);
  uc.uCentro.value.set(x, y, z);
  uc.uCorpo.value = corpo;
  uc.uAlfa.value = q.casca.alfa * (0.6 + 0.4 * brilho);
  uc.uBranco.value = q.casca.branco;
  uc.uEstica.value = q.casca.estica;
  uc.uAperta.value = q.casca.aperta;
  uc.uSobe.value = q.casca.sobe * alto;
  uc.uRevela.value = q.casca.revela;
  uc.uVarre.value = f.varre;
  for (const m of v.fantasmas) m.visible = q.casca.alfa > 0;
}
