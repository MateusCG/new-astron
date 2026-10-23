// Água do lago de Hélio-3, no padrão mid-poly PBR (IDENTIDADE-VISUAL.md, "Água").
//
// O lago fica em NIVEL_AGUA, abaixo do chão de voo (0): tudo parece flutuar sobre a
// água, como no Stage 6. A MALHA vem do Blender (agua.glb, agua_pbr.py): só existe onde
// há água (a planta do mapa corta o que fica embaixo da rocha), 18 m no lago aberto e
// 9 m na faixa perto da rocha, ~47 mil triângulos, lisa e plana. Quem dá a forma e o
// movimento é este ShaderMaterial:
// - ondas grandes: quatro ondas de Gerstner no vertex shader (72 a 160 m, ~1,3 m de
//   altura somadas; a crista fica aguda e o vale largo, e a malha anda um pouco de lado
//   com a onda), com a velocidade da onda de verdade (dispersão de água funda, × 0,75),
//   mais baixas perto da rocha (água rasa) sem parar: a linha d'água sobe e desce na
//   pedra. A normal sai analítica da soma, lisa;
// - ondulações: o relevo do conjunto `agua` (agua_normal.webp, espectro de ondas que
//   repete, texturas_agua.py) lido em três camadas de tamanhos, giros e direções
//   diferentes, cada uma andando no seu sentido, somadas como inclinação; a camada
//   miúda some de longe e as outras amaciam (o mipmap não vira chiado);
// - cor de água de cratera (CORES_AGUA): azul-tinta fria no fundo, azul-aço perto da
//   rocha, lodo ocre no pé dela e os veios de He-3 dissolvido correndo para a
//   mineradora (o astro sendo minerado). A profundidade sai de um MAPA DE DISTÂNCIA
//   (DataTexture de 10 m por texel, feito uma vez aqui): quantos metros cada ponto está
//   da rocha, da mineradora ou de uma pedra que fura a água. Toda rocha abre em talude
//   embaixo d'água, então perto dela a água é rasa (clara, mais transparente) e no meio
//   do lago funda (escura);
// - luz: o céu refletido pela direção do reflexo (as mesmas três cores do céu da cena e o
//   halo do sol) com Fresnel de Schlick, brilho do sol em faíscas finas nas ondulações
//   (e um brilho largo fraco), a luz do sol atravessando a crista das ondas de frente
//   para ele (verde-azulado claro) e o brilho azul-gelo do He-3 por baixo (mineradora,
//   Núcleo, veios de cristal);
// - espuma em renda (agua_espuma.webp, Voronoi periódico): grudada no que fura a água,
//   em faixas que andam para a pedra (as ondinhas chegando) e rala na crista das ondas
//   grandes do lago aberto, que anda junto com elas. A renda corta num limiar que sobe
//   com a quantidade, então a espuma cresce e some pela renda;
// - buracos: dentro do tanque da bacia de minério de cada base a água não existe (o
//   tanque desce bem abaixo dela e o minério acumulado aparece lá no fundo);
// - a neblina do three (fog_pars/fog_fragment), para a água sumir no horizonte igual
//   às rochas. A névoa de guerra (nevoa.js) é um passo de tela inteira por cima: a
//   água entra nela sem mudar nada aqui (ela projeta o fundo visto pela água no plano
//   de NIVEL_AGUA).
//
// Cáusticas: o fundo do lago e a rocha molhada (da água para baixo) ganham as linhas
// de luz da água andando devagar (comCaustica, por onBeforeCompile no material do
// glb), apagando com a profundidade; a luz deles também cai com a profundidade e
// puxa para o verde-azulado (o fundo é uma cor só: quem dá a profundidade é isto).
//
// O relógio das ondas, da espuma e das cáusticas é um uniforme só (TEMPO_AGUA), que a
// cena avança a cada quadro.

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
/** Retângulo coberto pelo mapa de distância (m): a região aberta com folga (a borda tampa o resto). */
const AGUA_LARGURA = 3200;
const AGUA_PROFUNDIDADE = 2400;
/** Distância máxima guardada no mapa (m): passou disso, é "lago fundo". */
const DIST_MAX = 255;

/** Relógio das ondas, da espuma e das cáusticas (s), compartilhado por todos os materiais da água. */
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

/**
 * Ondas de Gerstner da malha: direção (x, z, normalizada aqui), comprimento (m) e
 * altura (m). O menor comprimento tem 4 células da malha aberta (18 m): menor que isso
 * a grade não desenha. `ONDA_INGREME` é a soma da agudeza (0 = senos; 1 = a crista vira
 * bico), `ONDA_VEL` multiplica a velocidade da dispersão de água funda (√(g/k)).
 */
const ONDAS = [
  { dir: [0.94, 0.34], comp: 160, alt: 0.55 },
  { dir: [0.97, -0.26], comp: 105, alt: 0.38 },
  { dir: [0.57, 0.82], comp: 74, alt: 0.24 },
  { dir: [0.5, -0.87], comp: 88, alt: 0.2 },
];
const ONDA_INGREME = 0.55;
const ONDA_VEL = 0.75;
/** Perto da rocha a onda baixa até isso da altura (água rasa), em ONDA_RASA_M metros. */
const ONDA_RASA = 0.45;
const ONDA_RASA_M = 60;

/**
 * Camadas do relevo das ondulações (agua_normal.webp): tamanho do ladrilho (m), giro
 * (rad), velocidade (m/s, no sentido do giro), peso da inclinação e a distância (m) em
 * que a camada some (0: não some, só amacia). Tamanhos e giros desencontrados para a
 * repetição não aparecer.
 */
const CAMADAS_RELEVO = [
  { tam: 46, giro: 0.35, vel: [0.9, 0.3], peso: 0.3, some: 0 },
  { tam: 15.5, giro: -1.1, vel: [1.1, -0.5], peso: 0.2, some: 0 },
  { tam: 5.3, giro: 2.2, vel: [0.7, 0.6], peso: 0.12, some: 230 },
];

/** Espuma: tamanho (m) da renda fina e da grossa e a velocidade (m/s) com que andam. */
const ESPUMA_FINA_M = 11;
const ESPUMA_GROSSA_M = 34;
/** Ondinhas chegando na pedra: comprimento (m) e velocidade (m/s) das faixas de espuma. */
const CHEGANDO_COMP = 12.5;
const CHEGANDO_VEL = 2.8;

/**
 * Veios de He-3 dissolvido: fiapos de luz azul-gelo por baixo da superfície (pedaços
 * da renda grossa da espuma, VEIO_M metros por ladrilho), correndo para a mineradora a VEIO_VEL
 * m/s (mapa de fluxo em duas fases de VEIO_CICLO_M metros, para o desenho não esticar),
 * mais fortes perto dela; pulsam com o He-3 do mapa.
 */
const VEIO_M = 70;
const VEIO_VEL = 1.4;
const VEIO_CICLO_M = 26;
const VEIO_FORCA = 0.04;
const VEIO_PERTO = 0.1; // a mais, chegando na mineradora (cai em VEIO_PERTO_M)
const VEIO_PERTO_M = 520;

// Água de cratera num astro minerado (não é mar de praia): funda e fria no meio, azul-
// -tinta; azul-aço glacial perto da rocha, onde ela é rasa e carregada de mineral; lodo
// ocre no pé da rocha, onde a pedra em estratos se desfaz na água; espuma de mineral
// levemente empoeirada. O turquesa fica só para o seu time (#00efc0) e o azul-gelo do
// He-3 só para o que é minério (os veios e o brilho embaixo da mineradora e do Núcleo).
export const CORES_AGUA = {
  rasa: new THREE.Color('#41737d'),
  funda: new THREE.Color('#0a2230'),
  lodo: new THREE.Color('#6f6448'),
  crista: new THREE.Color('#86c4cf'), // a luz do sol atravessando a crista
  espuma: new THREE.Color('#e2dccb'),
  brilho: new THREE.Color('#ffe2b8'),
  he3: new THREE.Color('#9fe8ff'),
  caustica: new THREE.Color('#c2e6ee'),
};

const num = (v) => (Number.isInteger(v) ? v.toFixed(1) : String(v));

const VERTICE = /* glsl */ `
  uniform float uTempo;
  uniform sampler2D uDist;
  uniform vec4 uMapa;
  uniform vec4 uOndas[${ONDAS.length}];
  varying vec3 vPos;
  varying vec3 vNormalOnda;
  varying float vCrista;
  #include <fog_pars_vertex>
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vec2 p = w.xz;
    float d = texture2D(uDist, (p - uMapa.xy) / uMapa.zw).r * 255.0;
    float raso = mix(${num(ONDA_RASA)}, 1.0, smoothstep(0.0, ${num(ONDA_RASA_M)}, d));
    vec3 desl = vec3(0.0);
    vec3 n = vec3(0.0, 1.0, 0.0);
    float altMax = 0.0;
    for (int i = 0; i < ${ONDAS.length}; i++) {
      vec4 o = uOndas[i];
      float k = 6.2831853 / o.z;
      float a = o.w * raso;
      float q = ${num(ONDA_INGREME)} / (k * o.w * ${num(ONDAS.length)});
      float f = k * dot(o.xy, p) - sqrt(9.8 * k) * ${num(ONDA_VEL)} * uTempo;
      float sn = sin(f), cs = cos(f);
      desl += vec3(q * a * o.x * cs, a * sn, q * a * o.y * cs);
      n -= vec3(o.x * k * a * cs, q * k * a * sn, o.y * k * a * cs);
      altMax += o.w;
    }
    w.xyz += desl;
    vPos = w.xyz;
    vNormalOnda = n;
    vCrista = desl.y / altMax;
    vec4 mvPosition = viewMatrix * w;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;

const camadaGlsl = (c) => {
  const [vx, vz] = c.vel;
  const peso = c.some ? `${num(c.peso)} * (1.0 - smoothstep(${num(c.some * 0.25)}, ${num(c.some)}, dist))` : `${num(c.peso)} * amacia`;
  return `g += ${peso} * camada(vPos.xz, ${num(c.tam)}, ${num(c.giro)}, vec2(${num(vx)}, ${num(vz)}));`;
};

const FRAGMENTO = /* glsl */ `
  uniform float uTempo;
  uniform sampler2D uDist, uRelevo, uEspuma;
  uniform vec4 uMapa;
  uniform vec3 uRasa, uFunda, uLodo, uCrista, uEspumaCor, uBrilho, uHe3, uSolDir;
  uniform vec3 uCeuTopo, uCeuMeio, uHorizonte, uHalo;
  uniform vec4 uHe3Pontos[8];
  uniform float uHe3Pulso;
  uniform vec3 uBuracos[2];
  varying vec3 vPos;
  varying vec3 vNormalOnda;
  varying float vCrista;
  #include <fog_pars_fragment>
  vec2 girar(vec2 p, float a) {
    float c = cos(a), s = sin(a);
    return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
  }
  // Inclinação (dh/dx, dh/dz) de uma camada do relevo: lê girada e andando e volta a
  // inclinação para o mundo. flipY falso: o verde (+v da imagem) aponta para −q.y.
  vec2 camada(vec2 p, float tam, float giro, vec2 vel) {
    vec2 q = (girar(p, giro) - vel * uTempo) / tam;
    vec3 n = texture2D(uRelevo, q).xyz * 2.0 - 1.0;
    return girar(vec2(-n.x, n.y) / max(n.z, 0.25), -giro);
  }
  // O céu da cena (cena.js, criarCeu) na direção r, com o halo do sol.
  vec3 ceu(vec3 r) {
    float h = max(r.y, 0.0);
    vec3 c = mix(uHorizonte, uCeuMeio, smoothstep(0.02, 0.22, h));
    c = mix(c, uCeuTopo, smoothstep(0.22, 0.8, h));
    return c + uHalo * pow(max(dot(r, uSolDir), 0.0), 14.0) * 0.35;
  }
  void main() {
    for (int i = 0; i < 2; i++) if (length(vPos.xz - uBuracos[i].xy) < uBuracos[i].z) discard;
    vec3 olhar = cameraPosition - vPos;
    float dist = length(olhar);
    vec3 V = olhar / dist;
    // Normal: a da onda grande mais as ondulações (somadas como inclinação).
    vec3 no = normalize(vNormalOnda);
    float amacia = 1.0 - 0.55 * smoothstep(70.0, 700.0, dist);
    vec2 g = -no.xz / max(no.y, 0.2);
    ${CAMADAS_RELEVO.map(camadaGlsl).join('\n    ')}
    vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
    float nv = max(dot(N, V), 0.0);

    float d = texture2D(uDist, (vPos.xz - uMapa.xy) / uMapa.zw).r * 255.0;
    float raso = exp(-d / 35.0);
    // Corpo da água: cor da profundidade com a luz do sol e da crista.
    vec3 eg = texture2D(uEspuma, vPos.xz / ${num(ESPUMA_GROSSA_M)} - vec2(0.006, -0.009) * uTempo).rgb;
    vec3 corpo = mix(uFunda, uRasa, 0.12 + 0.78 * raso);
    // Lodo da rocha no pé dela, em nuvens (a renda grossa borra a borda).
    corpo = mix(corpo, uLodo, (1.0 - smoothstep(4.0, 22.0, d + eg.b * 10.0)) * 0.55);
    corpo *= 0.78 + 0.3 * max(dot(N, uSolDir), 0.0);
    float crista = smoothstep(-0.1, 0.9, vCrista);
    float contraLuz = pow(max(dot(-V, uSolDir) * 0.5 + 0.5, 0.0), 3.0);
    corpo += uCrista * crista * (0.05 + 0.25 * contraLuz);
    for (int i = 0; i < 8; i++) {
      vec4 h = uHe3Pontos[i];
      float qh = length(vPos.xz - h.xy) / max(h.z, 1.0);
      corpo += uHe3 * h.w * uHe3Pulso * exp(-qh * qh);
    }
    // Veios de He-3 correndo para a mineradora (fluxo em duas fases que se cruzam).
    float raio = length(vPos.xz);
    vec2 rumo = -vPos.xz / max(raio, 1.0);
    float fase = uTempo * ${num(VEIO_VEL / VEIO_CICLO_M)};
    float f0 = fract(fase), f1 = fract(fase + 0.5);
    vec2 pv = vPos.xz / ${num(VEIO_M)};
    float leva = ${num(VEIO_CICLO_M / VEIO_M)};
    vec3 v0 = texture2D(uEspuma, pv - rumo * f0 * leva).rgb;
    vec3 v1 = texture2D(uEspuma, pv - rumo * f1 * leva + 0.37).rgb;
    vec3 vv = mix(v1, v0, 1.0 - abs(2.0 * f0 - 1.0));
    // Só pedaços da renda acendem (a altura do relevo, B, de máscara): fiapos, não rede.
    float veio = smoothstep(0.7, 0.95, vv.g) * smoothstep(0.5, 0.8, vv.b);
    corpo += uHe3 * veio * uHe3Pulso * (${num(VEIO_FORCA)} + ${num(VEIO_PERTO)} * exp(-raio / ${num(VEIO_PERTO_M)})) * (1.0 - raso);
    // Reflexo do céu (Fresnel de Schlick, F0 da água 0,02).
    float fr = 0.02 + 0.98 * pow(1.0 - nv, 5.0);
    vec3 cor = mix(corpo, ceu(reflect(-V, N)), min(fr, 0.6));
    // Sol: faíscas finas nas ondulações e um brilho largo fraco (mais forte que isso vira
    // placa branca com o sol baixo).
    vec3 H = normalize(uSolDir + V);
    float nh = max(dot(N, H), 0.0);
    float longe = smoothstep(80.0, 900.0, dist);
    cor += uBrilho * (pow(nh, mix(1500.0, 380.0, longe)) * mix(1.6, 0.7, longe) + pow(nh, 90.0) * 0.08);
    float alpha = max(mix(0.84, 0.5, raso), min(fr * 1.2, 0.9));

    // Espuma: renda que cresce com a quantidade.
    vec2 pf = girar(vPos.xz, 0.4) / ${num(ESPUMA_FINA_M)} + vec2(0.021, 0.013) * uTempo;
    float renda = mix(texture2D(uEspuma, pf).r, eg.g, 0.35);
    float beira = 1.0 - smoothstep(3.0, 15.0, d);
    float chegando = smoothstep(0.55, 1.0, sin(d * ${num(6.2831853 / CHEGANDO_COMP)} + uTempo * ${num((6.2831853 / CHEGANDO_COMP) * CHEGANDO_VEL)} + eg.b * 3.0))
      * (1.0 - smoothstep(4.0, 26.0, d)) * step(0.5, d);
    float quant = clamp(beira * 0.95 + chegando * 0.55, 0.0, 1.0);
    quant = max(quant, smoothstep(0.6, 0.98, vCrista) * 0.5 * eg.g);
    float esp = smoothstep(1.0 - quant, 1.0 - quant + 0.18, renda);
    cor = mix(cor, uEspumaCor * (0.82 + 0.22 * max(dot(N, uSolDir), 0.0)), esp * 0.9);
    alpha = max(alpha, esp * 0.92);

    gl_FragColor = vec4(cor, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }`;

/** Textura de 1 × 1 para quando o conjunto `agua` não chegou (relevo plano, sem espuma). */
function texturaLisa(r, g, b) {
  const t = new THREE.DataTexture(new Uint8Array([r, g, b, 255]), 1, 1);
  t.needsUpdate = true;
  return t;
}

/** Plano de reserva (sem o agua.glb): o retângulo do mapa na grade do lago aberto. */
function planoReserva() {
  const geo = new THREE.PlaneGeometry(AGUA_LARGURA, AGUA_PROFUNDIDADE, Math.round(AGUA_LARGURA / 18), Math.round(AGUA_PROFUNDIDADE / 18));
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, NIVEL_AGUA, 0);
  return geo;
}

/**
 * A superfície da água. `geometria` é a malha do agua.glb (já em NIVEL_AGUA; sem ela,
 * um plano de reserva) e `texturas` o conjunto `agua` ({ normal, espuma }). `ceu` traz
 * as cores do céu refletido ({ topo, meio, horizonte, halo }), `solDir` a direção do
 * sol, `pontosHe3` até 8 pontos { x, z, raio, forca } do brilho azul-gelo por baixo,
 * `extras` os sólidos pequenos que furam a água ({ x, z, raio }: pedras do lago e o
 * tanque das bacias) e `buracos` até 2 círculos { x, z, raio } onde a água não é
 * desenhada (por dentro das bacias de minério).
 * userData.material.uniforms.uHe3Pulso pulsa junto com o neon do He-3.
 */
export function criarAgua({ geometria = null, texturas = null, ceu, solDir, pontosHe3 = [], extras = [], buracos = [] }) {
  const pontos = Array.from({ length: 8 }, (_, i) => {
    const p = pontosHe3[i];
    return p ? new THREE.Vector4(p.x, p.z, p.raio, p.forca) : new THREE.Vector4(0, 0, 1, 0);
  });
  const ondas = ONDAS.map((o) => {
    const l = Math.hypot(o.dir[0], o.dir[1]);
    return new THREE.Vector4(o.dir[0] / l, o.dir[1] / l, o.comp, o.alt);
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
        uRelevo: { value: null },
        uEspuma: { value: null },
        uMapa: { value: new THREE.Vector4(-AGUA_LARGURA / 2, -AGUA_PROFUNDIDADE / 2, AGUA_LARGURA, AGUA_PROFUNDIDADE) },
        uOndas: { value: ondas },
        uRasa: { value: CORES_AGUA.rasa },
        uFunda: { value: CORES_AGUA.funda },
        uLodo: { value: CORES_AGUA.lodo },
        uCrista: { value: CORES_AGUA.crista },
        uEspumaCor: { value: CORES_AGUA.espuma },
        uBrilho: { value: CORES_AGUA.brilho },
        uHe3: { value: CORES_AGUA.he3 },
        uSolDir: { value: solDir },
        uCeuTopo: { value: ceu.topo },
        uCeuMeio: { value: ceu.meio },
        uHorizonte: { value: ceu.horizonte },
        uHalo: { value: ceu.halo },
        uHe3Pontos: { value: pontos },
        uHe3Pulso: { value: 1 },
        uBuracos: { value: [0, 1].map((i) => (buracos[i] ? new THREE.Vector3(buracos[i].x, buracos[i].z, buracos[i].raio) : new THREE.Vector3(0, 0, 0))) },
      },
    ]),
  });
  // O relógio é o mesmo objeto para todas as águas e cáusticas (merge copia os uniformes);
  // as texturas também não podem passar pelo merge (ele clona).
  material.uniforms.uTempo = TEMPO_AGUA;
  material.uniforms.uDist.value = mapaDeDistancia(extras);
  material.uniforms.uRelevo.value = texturas?.normal ?? texturaLisa(128, 128, 255);
  material.uniforms.uEspuma.value = texturas?.espuma ?? texturaLisa(0, 0, 128);
  const agua = new THREE.Mesh(geometria ?? planoReserva(), material);
  // Primeira dos transparentes (os opacos, fundo e rochas, já vêm antes): depois dela
  // as nuvens de gás (nuvens.js, −1) e os tiros e efeitos (0). Nenhum deles escreve
  // profundidade, então o que vem depois pinta por cima: com a água depois, um tiro
  // ou brilho sobre o lago saía apagado pelo alfa dela.
  agua.renderOrder = -2;
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
      )
      // Embaixo d'água a luz cai com a profundidade e puxa para o verde-azulado da água.
      .replace(
        '#include <opaque_fragment>',
        `float claroAgua = smoothstep(-66.0, ${NIVEL_AGUA.toFixed(1)}, vMundoAgua.y);
        if (vMundoAgua.y < ${NIVEL_AGUA.toFixed(1)}) outgoingLight = mix(outgoingLight * vec3(0.42, 0.6, 0.62), outgoingLight, claroAgua * 0.6);
        #include <opaque_fragment>`,
      );
  };
  material.customProgramCacheKey = () => `caustica${forca}`;
  return material;
}
