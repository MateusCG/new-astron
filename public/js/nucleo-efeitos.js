// Núcleo de He-3: o desenho das duas passivas do Tormentor (a linha do tempo e a geometria
// estão em nucleo-regras.js). As malhas são do Blender (`nucleo-efeitos.glb` do mapa: a
// cúpula de colmeia em tamanho real, o anel onde ela nasce do prato, o raio de três fitas
// cruzadas e o quadrado do clarão) e a cor, o desenho e o movimento são do shader, como na
// volta à base e na subida de nível:
//
// - cúpula: cada célula sabe a sua ordem (UV0.u) e a direção do seu centro (UV1). Existe
//   enquanto a ordem está abaixo da barreira mostrada; as que acabaram de voltar soldam
//   (borda clara) e as que acabaram de cair viram brasa âmbar. O resto é quase
//   transparente: costura, borda contra o céu, um fluxo fraco no painel (mais cheio em
//   combate, para os buracos lerem) e, com a barreira baixa, células falhando. Enchendo,
//   ondas lentas correm pelas células a partir de onde os feixes das lentes batem, e a
//   borda do que ainda falta refazer fica acesa. Os tiros abrem ondas pelas células (até IMPACTOS de uma vez) e o reflexo
//   acende em âmbar a célula de onde cada raio sai (até RAIOS);
// - feixes das lentes: âmbar na lente, azul-gelo na cúpula, pulsos de energia correndo
//   para ela, só enquanto a barreira enche;
// - raio do reflexo: miolo branco e borda âmbar, pacotes correndo, um tremor fino que
//   assenta; a cabeça vai da cúpula à nave e a cauda vai atrás, e a ponta segue a nave
//   desenhada;
// - clarão: virado para a câmera no vértice, miolo e quatro riscos curtos.
//
// Tudo aditivo, sem gravar profundidade e sem neblina; nada ilumina a cena. Um conjunto só
// (o Núcleo é um), montado na cena junto do modelo (cena.js), com IMPACTOS ondas e RAIOS
// raios e clarões prontos: nada é criado no meio da partida, e a tela de carregamento, que
// desenha a cena inteira, já compila os quatro programas.

import * as THREE from 'three';
import { instanciaMapa, modeloMapaPronto } from './mapa-modelos.js';
import {
  ESCUDO,
  ALIMENTACAO,
  IMPACTO_INTERVALO_S,
  seguirBarreira,
  quadroImpacto,
  quadroReflexo,
  direcaoNaCasca,
  pontoDaCasca,
} from './nucleo-regras.js';

export const MODELO_NUCLEO_EFEITOS = 'nucleo-efeitos';
/** Ondas de tiro ao mesmo tempo na cúpula e raios do reflexo ao mesmo tempo (um por nave). */
export const IMPACTOS = 6;
export const RAIOS = 6;

/**
 * Azul-gelo do He-3 (o escudo; o repouso num azul mais fundo, que o aditivo não desbota em
 * vidro branco, e o claro só no que acende) e o âmbar dos objetivos (o reflexo).
 */
const COR_ESCUDO = new THREE.Color('#9fe8ff');
const COR_ESCUDO_FUNDO = new THREE.Color('#3aa8f0');
const COR_REFLEXO = new THREE.Color('#ffb627');
/** Largura (m) cheia do raio do reflexo e dos feixes das lentes, e o tremor do raio. */
const LARGURA_RAIO = 2.2;
const LARGURA_FEIXE = 0.8;
const TREMOR_RAIO = 0.22;
/** Tamanho (m, meia largura) do clarão na nave. */
const TAMANHO_CLARAO = 5;

const FIM = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
`;

const CASCA_VERTICE = /* glsl */ `
  attribute vec2 uv1;
  uniform float uTranco;
  varying vec2 vDado;
  varying vec3 vCel;
  varying vec3 vDir;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    // UV0: a ordem da célula e a borda (o glTF guarda o v invertido em relação ao Blender).
    vDado = vec2(uv.x, 1.0 - uv.y);
    // UV1: a direção do centro da célula (ângulo em volta e altura, do Blender).
    float az = uv1.x * 6.2831853;
    float alto = (1.0 - uv1.y) * 2.0 - 1.0;
    float h = sqrt(max(0.0, 1.0 - alto * alto));
    vCel = vec3(cos(az) * h, alto, -sin(az) * h);
    vec3 c = vec3(0.0, ${ESCUDO.centroY.toFixed(1)}, 0.0);
    vDir = normalize(position - c);
    vec3 p = c + (position - c) * (1.0 + uTranco);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vV = -mv.xyz;
    vN = normalMatrix * normal;
    gl_Position = projectionMatrix * mv;
  }
`;

const CASCA_FRAGMENTO = /* glsl */ `
  uniform vec3 uCor, uFundo, uQuente;
  uniform float uTempo, uVis, uSolda, uQuebra, uCombate, uAlfa, uForte;
  uniform vec4 uImp[${IMPACTOS}];
  uniform vec2 uImpK[${IMPACTOS}];
  uniform vec4 uSai[${RAIOS}];
  uniform vec3 uAlim[${ALIMENTACAO.length}];
  varying vec2 vDado;
  varying vec3 vCel;
  varying vec3 vDir;
  varying vec3 vN;
  varying vec3 vV;
  float acaso(float x) { return fract(sin(x) * 43758.5453); }
  void main() {
    float ordem = vDado.x;
    float borda = vDado.y;
    float existe = clamp((uVis - ordem) / 0.02, 0.0, 1.0);
    // Só a frente de cada faixa acende (a célula mais nova): lê como uma frente correndo.
    float ks = clamp((ordem - uSolda) / max(uVis - uSolda, 1e-4), 0.0, 1.0);
    float kq = clamp((uQuebra - ordem) / max(uQuebra - uVis, 1e-4), 0.0, 1.0);
    float solda = existe * step(uSolda, ordem) * ks * ks * ks * clamp((uVis - uSolda) * 30.0, 0.0, 1.0);
    float quebra = step(uVis, ordem) * step(ordem, uQuebra) * kq * kq * clamp((uQuebra - uVis) * 30.0, 0.0, 1.0);
    float costura = smoothstep(0.8, 0.97, borda);
    float olha = abs(dot(normalize(vN), normalize(vV)));
    float contorno = pow(1.0 - olha, 4.0);
    float fluxo = 0.5 + 0.5 * sin(dot(vDir, vec3(11.0, 19.0, 15.0)) + uTempo * 1.6 + ordem * 37.0);
    // Barreira baixa: células falhando (sorteio por célula, trocado 12 vezes por s).
    float fraca = 1.0 - smoothstep(0.12, 0.38, uVis);
    float falha = fraca * step(0.55, acaso(ordem * 911.0 + floor(uTempo * 12.0)));
    float a = existe * (0.01 + 0.012 * fluxo + 0.012 * uCombate + 0.06 * costura * uForte + 0.13 * contorno) * (1.0 - 0.7 * falha);
    // Ondas dos tiros: acendem a célula inteira (a direção do centro dela).
    float imp = 0.0;
    for (int i = 0; i < ${IMPACTOS}; i++) {
      if (uImpK[i].x <= 0.0 && uImpK[i].y <= 0.0) continue;
      float ang = acos(clamp(dot(vCel, uImp[i].xyz), -1.0, 1.0));
      float d = (ang - uImp[i].w) / 0.085;
      imp += exp(-d * d) * uImpK[i].x * (0.45 + 0.55 * costura) + exp(-ang / 0.09) * uImpK[i].y;
    }
    // A célula de onde sai cada raio do reflexo.
    float sai = 0.0;
    for (int i = 0; i < ${RAIOS}; i++) {
      if (uSai[i].w <= 0.0) continue;
      float ang = acos(clamp(dot(vCel, uSai[i].xyz), -1.0, 1.0));
      sai += exp(-pow(ang / 0.14, 2.0)) * uSai[i].w;
    }
    // Enchendo: ondas correndo a partir de onde os feixes batem e a borda do que falta refazer.
    float onda = 0.0;
    if (uCombate > 0.01) {
      float perto = 9.0;
      for (int i = 0; i < ${ALIMENTACAO.length}; i++) perto = min(perto, acos(clamp(dot(vCel, uAlim[i]), -1.0, 1.0)));
      float frente = fract(uTempo * 0.55) * 2.8;
      float d = (perto - frente) / 0.16;
      onda = exp(-d * d) * (1.0 - perto / 2.8) * uCombate;
    }
    float refazer = existe * exp(-max(uVis - ordem, 0.0) / 0.04) * uCombate * step(uVis, 0.995);
    a += existe * imp * 0.5 + solda * (0.1 + 0.45 * costura) + quebra * (0.06 + 0.35 * costura) + sai * (0.3 + 0.5 * costura);
    a += existe * onda * (0.06 + 0.32 * costura) + refazer * (0.07 + 0.4 * costura);
    float aceso = clamp(imp * 1.5 + solda * 2.0 + onda * 2.0 + refazer * 2.0 + contorno * 0.6, 0.0, 1.0);
    vec3 cor = mix(mix(uFundo, uCor, aceso), vec3(1.0), clamp(imp * 0.35 + solda * 0.3, 0.0, 0.6));
    cor = mix(cor, uQuente, clamp(sai + quebra, 0.0, 1.0));
    // O lado de dentro (a parte de trás da cúpula) bem mais fraco: de fora, só a frente lê.
    a *= uAlfa * (gl_FrontFacing ? 1.0 : 0.3);
    gl_FragColor = vec4(cor, clamp(a, 0.0, 1.0));
    ${FIM}
  }
`;

const PLANO_VERTICE = /* glsl */ `
  uniform float uTremor, uComp, uTempo;
  varying vec2 vUv;
  void main() {
    vUv = vec2(uv.x, 1.0 - uv.y);
    vec3 p = position;
    // Tremor fino para os lados (some nas pontas), só no raio do reflexo.
    float env = sin(3.14159 * vUv.y);
    p.x += uTremor * env * sin(vUv.y * uComp * 0.31 - uTempo * 41.0);
    p.z += uTremor * env * cos(vUv.y * uComp * 0.23 + uTempo * 37.0);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

// O raio do reflexo: miolo branco, borda âmbar, a cabeça mais clara e pacotes correndo.
const RAIO_FRAGMENTO = /* glsl */ `
  uniform vec3 uCor;
  uniform float uAlfa, uCabeca, uCauda, uComp, uTempo;
  varying vec2 vUv;
  void main() {
    float v = vUv.y;
    float existe = smoothstep(uCauda, uCauda + 0.01, v) * (1.0 - smoothstep(uCabeca - 0.004, uCabeca, v));
    float meio = 1.0 - abs(vUv.x * 2.0 - 1.0);
    float miolo = pow(meio, 7.0);
    float halo = pow(meio, 1.8);
    float cabeca = exp(-max(uCabeca - v, 0.0) * uComp / 5.0);
    float pacotes = 0.7 + 0.3 * sin(v * uComp * 0.45 - uTempo * 70.0);
    vec3 cor = mix(uCor, vec3(1.0), clamp(miolo * 0.55 + cabeca * 0.2, 0.0, 1.0));
    float a = uAlfa * existe * (halo * 0.42 * pacotes + miolo * 0.5 + cabeca * halo * 0.45);
    gl_FragColor = vec4(cor, clamp(a, 0.0, 1.0));
    ${FIM}
  }
`;

// O feixe de uma lente até a cúpula: âmbar na lente, azul-gelo na cúpula, pulsos indo para ela.
const FEIXE_FRAGMENTO = /* glsl */ `
  uniform vec3 uCor, uQuente;
  uniform float uAlfa, uComp, uTempo;
  varying vec2 vUv;
  void main() {
    float v = vUv.y;
    float meio = 1.0 - abs(vUv.x * 2.0 - 1.0);
    float pulso = pow(0.5 + 0.5 * sin(v * uComp * 0.35 - uTempo * 9.0), 4.0);
    float pontas = smoothstep(0.0, 0.06, v) * (1.0 - smoothstep(0.94, 1.0, v));
    vec3 cor = mix(mix(uQuente, uCor, smoothstep(0.1, 0.7, v)), vec3(1.0), pow(meio, 8.0) * 0.35);
    float a = uAlfa * pontas * pow(meio, 2.2) * (0.22 + 0.5 * pulso);
    gl_FragColor = vec4(cor, clamp(a, 0.0, 1.0));
    ${FIM}
  }
`;

// O anel onde a cúpula nasce do prato.
const BASE_FRAGMENTO = /* glsl */ `
  uniform vec3 uCor;
  uniform float uAlfa, uTempo;
  varying vec2 vUv;
  void main() {
    float faixa = 1.0 - abs(vUv.y * 2.0 - 1.0);
    float corre = 0.75 + 0.25 * sin(vUv.x * 6.2831853 * 12.0 - uTempo * 2.0);
    gl_FragColor = vec4(mix(uCor, vec3(1.0), 0.2 * faixa), uAlfa * pow(faixa, 1.5) * corre * 0.45);
    ${FIM}
  }
`;

// O clarão onde o raio bate: virado para a câmera no vértice, miolo e quatro riscos.
const CLARAO_VERTICE = /* glsl */ `
  uniform float uTam, uGiro;
  varying vec2 vQ;
  void main() {
    vQ = uv * 2.0 - 1.0;
    float c = cos(uGiro);
    float s = sin(uGiro);
    vec2 q = vec2(c * vQ.x - s * vQ.y, s * vQ.x + c * vQ.y);
    vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    mv.xy += q * uTam;
    gl_Position = projectionMatrix * mv;
  }
`;

const CLARAO_FRAGMENTO = /* glsl */ `
  uniform vec3 uCor;
  uniform float uAlfa;
  varying vec2 vQ;
  void main() {
    float r = length(vQ);
    float miolo = exp(-r * r * 22.0);
    float halo = exp(-r * 4.5) * 0.35;
    float riscos = (exp(-abs(vQ.y) * 40.0) * (1.0 - abs(vQ.x)) + exp(-abs(vQ.x) * 40.0) * (1.0 - abs(vQ.y))) * 0.5;
    vec3 cor = mix(uCor, vec3(1.0), clamp(miolo * 1.2 + riscos * 0.4, 0.0, 1.0));
    gl_FragColor = vec4(cor, uAlfa * clamp(miolo + halo + riscos, 0.0, 1.0));
    ${FIM}
  }
`;

function material(vertice, fragmento, uniformes, lados = THREE.DoubleSide) {
  return new THREE.ShaderMaterial({
    vertexShader: vertice,
    fragmentShader: fragmento,
    uniforms: Object.fromEntries(Object.entries(uniformes).map(([k, v]) => [k, { value: v }])),
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    side: lados,
  });
}

const Y = new THREE.Vector3(0, 1, 0);

/** Põe a malha de fita (comprimento 1 em y) de `a` até `b` (locais), com `largura` (m). */
function esticar(m, a, b, largura) {
  const d = new THREE.Vector3(b.x - a.x, b.y - a.y, b.z - a.z);
  const comp = d.length();
  m.position.set(a.x, a.y, a.z);
  m.quaternion.setFromUnitVectors(Y, d.divideScalar(comp || 1));
  m.scale.set(largura, comp || 1e-3, largura);
  return comp;
}

/**
 * Monta os efeitos do Núcleo (null se o modelo ainda não chegou). `grupo` vai dentro do
 * modelo do Núcleo (coordenadas locais dele). `centro` é o lugar do Núcleo no mundo (x, z),
 * para os pontos do mundo virarem locais.
 */
export function criarEfeitosNucleo(centro) {
  if (!modeloMapaPronto(MODELO_NUCLEO_EFEITOS)) return null;
  const modelo = instanciaMapa(MODELO_NUCLEO_EFEITOS, { sombra: false });
  const geo = {};
  modelo.traverse((o) => {
    if (o.isMesh) geo[o.name] = o.geometry;
  });
  const grupo = new THREE.Group();
  grupo.name = 'nucleo_efeitos';
  const malha = (g, m) => {
    const x = new THREE.Mesh(g, m);
    x.frustumCulled = false;
    grupo.add(x);
    return x;
  };

  const imp = Array.from({ length: IMPACTOS }, () => new THREE.Vector4(0, 1, 0, 0));
  const impK = Array.from({ length: IMPACTOS }, () => new THREE.Vector2(0, 0));
  const sai = Array.from({ length: RAIOS }, () => new THREE.Vector4(0, 1, 0, 0));
  // Onde cada feixe das lentes bate (a direção a partir do centro da cúpula).
  const alim = ALIMENTACAO.map(({ ate }) => new THREE.Vector3(ate.x, ate.y - ESCUDO.centroY, ate.z).normalize());
  const casca = malha(
    geo.escudo_casca,
    material(CASCA_VERTICE, CASCA_FRAGMENTO, { uCor: COR_ESCUDO, uFundo: COR_ESCUDO_FUNDO, uQuente: COR_REFLEXO, uTempo: 0, uVis: 0, uSolda: 0, uQuebra: 0, uCombate: 0, uAlfa: 0, uForte: 1, uTranco: 0, uImp: imp, uImpK: impK, uSai: sai, uAlim: alim }),
  );
  const uc = casca.material.uniforms;
  const base = malha(geo.escudo_base, material(PLANO_VERTICE, BASE_FRAGMENTO, { uCor: COR_ESCUDO, uAlfa: 0, uTempo: 0, uComp: 1, uTremor: 0 }));
  base.position.y = 0.35;
  const feixes = ALIMENTACAO.map(({ de, ate }) => {
    const m = malha(geo.escudo_raio, material(PLANO_VERTICE, FEIXE_FRAGMENTO, { uCor: COR_ESCUDO, uQuente: COR_REFLEXO, uAlfa: 0, uComp: 1, uTempo: 0, uTremor: 0 }));
    m.material.uniforms.uComp.value = esticar(m, de, ate, LARGURA_FEIXE);
    return m;
  });
  const raios = Array.from({ length: RAIOS }, () => {
    const m = malha(geo.escudo_raio, material(PLANO_VERTICE, RAIO_FRAGMENTO, { uCor: COR_REFLEXO, uAlfa: 0, uCabeca: 0, uCauda: 0, uComp: 1, uTempo: 0, uTremor: 0 }));
    const c = malha(geo.escudo_clarao, material(CLARAO_VERTICE, CLARAO_FRAGMENTO, { uCor: COR_REFLEXO, uAlfa: 0, uTam: TAMANHO_CLARAO, uGiro: 0 }));
    return { m, c, t: Infinity, dir: new THREE.Vector3(), de: new THREE.Vector3(), ate: new THREE.Vector3(), seguir: null };
  });
  const ondas = Array.from({ length: IMPACTOS }, () => ({ t: Infinity }));

  let estado = { vis: 0, solda: 0, quebra: 0, alimenta: 0 };
  let alvo = 0; // a barreira do servidor (0 fora do mapa)
  let enchendo = false;
  let tempo = 0;
  let ultimaOnda = -Infinity;
  let proxOnda = 0;
  let proxRaio = 0;
  const local = new THREE.Vector3();

  /** Ponto do mundo (x, y, z) no espaço do Núcleo. */
  const paraLocal = (p) => local.set(p.x - centro.x, p.y, p.z - centro.z);

  return {
    grupo,
    /** O estado do servidor (obj.NUCLEO): a cúpula existe só com ele 'ativo'. */
    definir(r) {
      const ativo = r?.estado === 'ativo';
      alvo = ativo ? Math.max(0, Math.min(1, r.vida ?? 1)) : 0;
      enchendo = ativo && alvo < 0.999;
      uc.uForte.value = 1 + 0.2 * Math.max(0, (r?.nivel ?? 1) - 1);
    },
    /**
     * Um tiro bateu no escudo. `de` é de onde ele veio (mundo: o projétil desenhado, ou
     * null), `sorteio` (0 a 1) escolhe o lado quando não se sabe.
     */
    acerto(de, sorteio = 0) {
      if (alvo <= 0 || tempo - ultimaOnda < IMPACTO_INTERVALO_S) return null;
      ultimaOnda = tempo;
      const d = direcaoNaCasca(de ? paraLocal(de) : { x: 0, y: ESCUDO.centroY, z: 0 }, sorteio);
      const i = proxOnda++ % IMPACTOS;
      imp[i].set(d.x, d.y, d.z, 0);
      ondas[i].t = 0;
      const p = pontoDaCasca(d);
      return { x: p.x + centro.x, y: p.y, z: p.z + centro.z };
    },
    /**
     * O reflexo: um raio da cúpula até cada nave de `alvos` ([{ x, y, z, seguir }], mundo;
     * `seguir()` devolve a posição desenhada da nave agora, ou null).
     */
    reflexo(alvos) {
      for (const a of alvos.slice(0, RAIOS)) {
        const r = raios[proxRaio++ % RAIOS];
        r.ate.copy(paraLocal(a));
        r.seguir = a.seguir ?? null;
        const d = direcaoNaCasca({ x: r.ate.x, y: Math.max(r.ate.y, ESCUDO.centroY - 6), z: r.ate.z });
        r.dir.set(d.x, d.y, d.z);
        const p = pontoDaCasca(d);
        r.de.set(p.x, p.y, p.z);
        r.t = 0;
        r.c.material.uniforms.uGiro.value = Math.random() * Math.PI;
      }
    },
    /** Um quadro: `dt` e `t` (s). */
    atualizar(dt, t) {
      tempo = t;
      estado = seguirBarreira(estado, alvo, enchendo, dt);
      const ativo = alvo > 0 || estado.quebra > 0.002;
      let algum = ativo;
      uc.uTempo.value = t;
      uc.uVis.value = estado.vis;
      uc.uSolda.value = estado.solda;
      uc.uQuebra.value = estado.quebra;
      uc.uCombate.value = alvo > 0 ? estado.alimenta : 0;
      uc.uAlfa.value = ativo ? 1 : 0;
      base.material.uniforms.uAlfa.value = Math.min(1, estado.vis * 1.5);
      base.material.uniforms.uTempo.value = t;
      for (const f of feixes) {
        f.material.uniforms.uAlfa.value = estado.alimenta * (alvo > 0 ? 1 : 0);
        f.material.uniforms.uTempo.value = t;
        f.visible = f.material.uniforms.uAlfa.value > 0.01;
      }
      ondas.forEach((o, i) => {
        o.t += dt;
        const q = quadroImpacto(o.t);
        impK[i].set(q ? q.alfa : 0, q ? q.miolo : 0);
        imp[i].w = q ? q.raio : 0;
      });
      let tranco = 0;
      raios.forEach((r, i) => {
        r.t += dt;
        const q = quadroReflexo(r.t);
        r.m.visible = !!q && q.raio.alfa > 0;
        r.c.visible = false;
        sai[i].set(r.dir.x, r.dir.y, r.dir.z, q ? q.saida : 0);
        if (!q) return;
        algum = true;
        tranco = Math.min(tranco, q.tranco);
        const p = r.seguir?.();
        if (p) r.ate.copy(paraLocal(p));
        const u = r.m.material.uniforms;
        const comp = esticar(r.m, r.de, r.ate, LARGURA_RAIO * q.raio.largura);
        u.uComp.value = comp;
        u.uCabeca.value = q.raio.cabeca;
        u.uCauda.value = q.raio.cauda;
        u.uAlfa.value = q.raio.alfa;
        u.uTempo.value = t;
        u.uTremor.value = (TREMOR_RAIO * q.raio.tremor) / (LARGURA_RAIO * q.raio.largura);
        r.c.position.copy(r.ate);
        const uc2 = r.c.material.uniforms;
        uc2.uAlfa.value = q.clarao.alfa;
        uc2.uTam.value = TAMANHO_CLARAO * q.clarao.tamanho;
        r.c.visible = q.clarao.alfa > 0;
      });
      uc.uTranco.value = tranco;
      grupo.visible = algum;
    },
  };
}
