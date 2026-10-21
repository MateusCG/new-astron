// Nuvens de gás e poeira da jungle (os campos de ASTEROIDES de shared/terrain.js).
//
// A regra de jogo é a mesma dos antigos campos de asteroides: passável, e quem está
// dentro só é visto de dentro do mesmo campo ou de perto (shared/visao.js). Ficar
// escondido faz mais sentido dentro de uma nuvem do que entre pedras, então o
// retângulo de cada campo vira uma nuvem baixa de gás de He-3 e poeira do lago,
// sentada na água e mais alta que o voo, grossa o bastante para "esconder" uma nave.
//
// Como (barato, para rodar a 30 quadros):
// - Tufos: quadrados virados para a câmera (octógonos, menos pixel vazio que um
//   quadrado), instanciados, um InstancedBufferGeometry por campo (8 desenhos). Cada
//   tufo tem centro, tamanho, deriva, giro, tom e densidade, sorteados com semente
//   fixa (todo jogador vê igual). Três camadas: a base larga e achatada sentada na
//   água, o meio na altura do voo e o topo só no miolo; na beirada os tufos são
//   menores, mais baixos e mais ralos, para a borda ser suave.
// - A textura é gerada aqui (4 tufos de ruído numa grade 2 × 2, um canal só), sem
//   arquivo para baixar.
// - Movimento todo no shader (deriva lenta, a textura girando devagar): a CPU só
//   reordena os tufos de trás para a frente quando a câmera anda (transparência
//   misturada exige essa ordem; entre os campos o Three.js já ordena pela distância).
// - Luz falsa e barata: tufo do lado do sol e do alto mais claro (sorteado com a
//   planta), a metade de cima de cada tufo um pouco mais clara, o miolo denso um
//   pouco mais escuro, e um brilho quente quando se olha contra o sol.
// - De dentro, a câmera de perseguição não fica cega: o tufo some quando a câmera
//   chega perto do centro dele; com a nave dentro de um campo, somem antes ainda e
//   a nuvem toda fica mais rala (DENTRO_ALFA). Tufo apagado vai para fora da tela
//   no vértice (não gasta pixel).
// - Névoa de guerra: a nuvem lê a grade da névoa (nevoa.js entrega a textura por
//   `scene.userData.usarNevoa`) no centro de cada tufo. Campo que o time não vê fica
//   mais grosso, mais escuro e mais frio; visto (alguém do time dentro ou perto),
//   volta ao tom do lago. A nuvem não escreve profundidade e diminui o alfa do alvo
//   da cena (o resto da cena deixa o alfa em 1): o passo da névoa lê esse alfa como
//   "quanto da cor é nuvem" e não escurece de novo o que a nuvem já escureceu.
// - Ordem: depois da água (a água é transparente e, desenhada depois, pintaria por
//   cima da nuvem) e antes dos tiros e efeitos (renderOrder 0): um tiro voando na
//   frente da nuvem fica inteiro. O preço é que um brilho atrás da nuvem também
//   aparece (como luz atravessando a neblina); quem está escondido dentro de uma
//   nuvem nem chega ao cliente, então isso não entrega ninguém.

import * as THREE from 'three';
import { ASTEROIDES, MAP_HALF_X, MAP_HALF_Z, emAsteroides } from '/shared/terrain.js';

/** Cores da nuvem (paleta do lago de He-3, IDENTIDADE-VISUAL.md). */
export const CORES_NUVEM = {
  luz: '#e8d6ba', // poeira iluminada pelo sol da tarde (areia clara, puxando para o horizonte)
  sombra: '#61788a', // gás na sombra (azul-acinzentado frio, da poeira da névoa)
  he3: '#9fe8ff', // gás de He-3 subindo do lago (azul-gelo), só em alguns tufos baixos
  oculta: '#2c3d47', // para onde puxa o campo que o time não vê (frio, nunca preto)
};

/** Distância (m) entre tufos na grade de cada campo (com sorteio dentro da célula). */
const PASSO = 38;
/**
 * Camadas da nuvem: altura do centro (m; água em −16, voo em 10), variação, tamanho
 * (m, sorteado), achatamento (largura × altura do tufo), densidade e até onde vai
 * (fração do miolo à beirada: 1 = o campo inteiro).
 */
const CAMADAS = [
  { y: -4, varY: 4, tam: [84, 104], forma: [1.45, 0.7], alfa: 0.68, ate: 1 }, // base sentada na água
  { y: 16, varY: 8, tam: [60, 80], forma: [1.15, 0.95], alfa: 0.56, ate: 1 }, // na altura do voo
  { y: 36, varY: 10, tam: [50, 70], forma: [1, 1], alfa: 0.5, ate: 0.8 }, // topo, só no miolo
];
/** Na beirada: tufo menor (fração) e mais baixo (m). */
const BEIRA_MENOR = 0.25;
const BEIRA_DESCE = 6;
/** Fração dos tufos baixos com o tom de He-3, e quanto puxam para ele. */
const HE3_FRACAO = 0.14;
const HE3_FORCA = 0.3;
/** Deriva (m) e giro da textura (rad/s), sorteados até estes valores. */
const DERIVA_MAX = 5;
const GIRO_MAX = 0.035;
/**
 * Perto da câmera o tufo some: começa a sumir a PERTO_FRACAO do raio dele mais
 * PERTO_M (com a câmera dentro de um campo, mais PERTO_DENTRO_M) e some de vez
 * PERTO_FAIXA metros antes disso.
 */
const PERTO_FRACAO = 0.25;
const PERTO_M = 0;
const PERTO_DENTRO_M = 12;
const PERTO_FAIXA = 30;
/** Campo que o time não vê: densidade a mais e quanto puxa para a cor oculta. */
const OCULTA_ALFA = 1.15;
const OCULTA_COR = 0.35;
/** Com a câmera dentro de um campo, a nuvem toda fica mais rala (fração da densidade). */
const DENTRO_ALFA = 0.72;
/** Câmera mudou de lugar (m) para reordenar os tufos. */
const REORDENAR_M = 1.5;
const SEMENTE = 4242;
/** renderOrder das nuvens: depois da água (−2, agua.js) e antes dos efeitos (0). */
const ORDEM_NUVEM = -1;
/** Lado (px) de cada tufo na textura 2 × 2. */
const LADO_TUFO = 256;

function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const suave = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Ruído de valor 2D com semente (0..1), para a textura dos tufos. */
function ruido(x, y, s) {
  const h = (i, k) => {
    let n = Math.imul(i, 374761393) + Math.imul(k, 668265263) + Math.imul(s, 2147483647);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const a = h(xi, yi) + (h(xi + 1, yi) - h(xi, yi)) * u;
  const b = h(xi, yi + 1) + (h(xi + 1, yi + 1) - h(xi, yi + 1)) * u;
  return a + (b - a) * v;
}

function fbm(x, y, s, oitavas = 4) {
  let soma = 0;
  let amp = 0.5;
  let norma = 0;
  for (let o = 0; o < oitavas; o++) {
    soma += ruido(x, y, s + o * 31) * amp;
    norma += amp;
    amp *= 0.5;
    x *= 2.03;
    y *= 2.03;
  }
  return soma / norma;
}

/**
 * Textura dos tufos: 4 variantes numa grade 2 × 2, um canal (densidade). Contorno
 * irregular (o raio da borda muda com o ângulo), miolo com ruído e nada encostando
 * na beira da célula (a textura gira dentro do octógono).
 */
function texturaTufos() {
  const N = LADO_TUFO;
  const W = N * 2;
  const dados = new Uint8Array(W * W);
  for (let v = 0; v < 4; v++) {
    const ox = (v % 2) * N;
    const oy = Math.floor(v / 2) * N;
    const s = 17 + v * 101;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const x = ((i + 0.5) / N) * 2 - 1;
        const y = ((j + 0.5) / N) * 2 - 1;
        const r = Math.hypot(x, y);
        const ang = Math.atan2(y, x);
        const borda = 0.6 + 0.3 * fbm(Math.cos(ang) * 1.6 + 7, Math.sin(ang) * 1.6 + 3, s, 3);
        const forma = 1 - suave(borda * 0.3, borda, r);
        const detalhe = fbm(x * 2.6 + s, y * 2.6 - s, s + 5, 4);
        let d = forma * (0.55 + 0.9 * detalhe);
        d *= 1 - suave(0.84, 0.97, r);
        dados[(oy + j) * W + ox + i] = Math.round(Math.min(1, Math.max(0, d)) * 255);
      }
    }
  }
  const tex = new THREE.DataTexture(dados, W, W, THREE.RedFormat, THREE.UnsignedByteType);
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

/** Tufos de um campo: listas de números por tufo (centro relativo ao campo). */
function tufosDoCampo(a, solDir) {
  const rnd = mulberry32(SEMENTE + [...a.id].reduce((h, c) => h * 31 + c.charCodeAt(0), 0));
  const nx = Math.max(2, Math.round(a.largura / PASSO));
  const nz = Math.max(2, Math.round(a.profundidade / PASSO));
  const sol = new THREE.Vector2(solDir.x, solDir.z).normalize();
  const tufos = [];
  const yMin = CAMADAS[0].y - CAMADAS[0].varY;
  const yMax = CAMADAS.at(-1).y + CAMADAS.at(-1).varY;
  for (let k = 0; k < nz; k++) {
    for (let i = 0; i < nx; i++) {
      for (const [ic, c] of CAMADAS.entries()) {
        const u = (i + 0.5 + (rnd() - 0.5) * 0.9) / nx - 0.5;
        const v = (k + 0.5 + (rnd() - 0.5) * 0.9) / nz - 0.5;
        const beira = Math.min(1, Math.max(Math.abs(u), Math.abs(v)) * 2); // 0 no miolo, 1 na beirada
        if (beira > c.ate) continue;
        const tam = (c.tam[0] + (c.tam[1] - c.tam[0]) * rnd()) * (1 - BEIRA_MENOR * beira);
        const y = c.y + (rnd() - 0.5) * c.varY - BEIRA_DESCE * beira;
        // Lado do sol do campo e o alto mais claros; um pouco de acaso para não fazer degrau.
        const lado = (u * sol.x + v * sol.y) * 2;
        const luz = Math.min(1, Math.max(0, 0.32 + 0.42 * ((y - yMin) / (yMax - yMin)) + 0.2 * lado + (rnd() - 0.5) * 0.18));
        const he3 = ic === 0 && rnd() < HE3_FRACAO ? 0.6 + rnd() * 0.4 : 0;
        tufos.push({
          x: u * a.largura,
          y,
          z: v * a.profundidade,
          largura: tam * c.forma[0],
          altura: tam * c.forma[1],
          fase: rnd() * Math.PI * 2,
          deriva: 1.5 + rnd() * (DERIVA_MAX - 1.5),
          ang: rnd() * Math.PI * 2,
          giro: (rnd() * 2 - 1) * GIRO_MAX,
          variante: Math.floor(rnd() * 4),
          luz,
          alfa: c.alfa * (1 - 0.45 * beira * beira) * (0.85 + rnd() * 0.3),
          he3,
        });
      }
    }
  }
  return tufos;
}

const VERTICE = /* glsl */ `
  uniform float uTempo;
  uniform sampler2D tNevoa;
  uniform vec2 uMeioMapa;
  uniform vec3 uSolDir;
  uniform vec3 uLuz;
  uniform vec3 uSombra;
  uniform vec3 uHe3;
  uniform vec3 uOculta;
  uniform float uPerto;
  uniform float uRala;
  attribute vec3 aCentro;
  attribute vec2 aTam;
  attribute vec4 aMov;   // fase, deriva (m), ângulo da textura, giro (rad/s)
  attribute vec4 aDados; // variante (0..3), luz (0..1), densidade, He-3 (0..1)
  varying vec2 vUv;
  varying vec2 vTela;
  varying vec3 vCor;
  varying float vAlfa;
  #include <fog_pars_vertex>

  void main() {
    float t = uTempo;
    float f = aMov.x;
    vec3 c = aCentro + vec3(sin(t * 0.05 + f), 0.3 * sin(t * 0.09 + f * 1.7), cos(t * 0.043 + f * 1.3)) * aMov.y;
    vec4 mv = modelViewMatrix * vec4(c, 1.0);
    mv.xy += position.xy * aTam;
    vec3 mundo = (modelMatrix * vec4(c, 1.0)).xyz;

    // Perto da câmera o tufo some (de dentro da nuvem a câmera não fica cega).
    float r = 0.5 * max(aTam.x, aTam.y);
    float d = length(mv.xyz);
    float inicio = r * ${PERTO_FRACAO.toFixed(3)} + uPerto;
    float perto = smoothstep(inicio, inicio + ${PERTO_FAIXA.toFixed(1)}, d);

    // Visto pelo time? (R da grade da névoa, no centro do tufo)
    float visto = texture2D(tNevoa, (mundo.xz + uMeioMapa) / (2.0 * uMeioMapa)).r;

    vec3 cor = mix(uSombra, uLuz, aDados.y);
    vec3 olhar = normalize(mundo - cameraPosition);
    cor += uLuz * pow(max(dot(olhar, uSolDir), 0.0), 6.0) * 0.3; // contra o sol, a borda acende
    cor = mix(cor, uHe3, aDados.w * ${HE3_FORCA.toFixed(3)});
    float lum = dot(cor, vec3(0.2126, 0.7152, 0.0722));
    vec3 oculta = mix(vec3(lum), cor, 0.4) * 0.55 + uOculta * 0.35;
    vCor = mix(mix(cor, oculta, ${OCULTA_COR.toFixed(3)}), cor, visto);
    vAlfa = aDados.z * perto * uRala * mix(${OCULTA_ALFA.toFixed(3)}, 1.0, visto);

    // A textura gira dentro do octógono (o raio cabe na célula da grade 2 × 2).
    float a = aMov.z + t * aMov.w;
    vec2 p = position.xy;
    p = vec2(cos(a) * p.x - sin(a) * p.y, sin(a) * p.x + cos(a) * p.y) * 0.98;
    vUv = (p + 0.5 + vec2(mod(aDados.x, 2.0), floor(aDados.x / 2.0))) * 0.5;
    vTela = position.xy + 0.5;

    gl_Position = vAlfa < 0.004 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * mv; // apagado: fora da tela
    #ifdef USE_FOG
      vFogDepth = -mv.z;
    #endif
  }`;

const FRAGMENTO = /* glsl */ `
  uniform sampler2D tTufos;
  varying vec2 vUv;
  varying vec2 vTela;
  varying vec3 vCor;
  varying float vAlfa;
  #include <fog_pars_fragment>

  void main() {
    float dens = texture2D(tTufos, vUv).r;
    float alfa = dens * vAlfa;
    if (alfa < 0.004) discard;
    // Em cima mais claro, miolo denso mais escuro: volume sem luz de verdade.
    vec3 cor = vCor * mix(0.72, 1.14, vTela.y) * mix(1.08, 0.8, dens);
    gl_FragColor = vec4(cor, min(alfa, 0.92));
    #include <fog_fragment>
  }`;

/**
 * Monta as nuvens dos campos (um Mesh por campo, no `grupo`). Devolve
 * { grupo, atualizar(foco), usarNevoa(textura) }: `atualizar` diz se a câmera
 * (o foco) está dentro de um campo (os tufos de perto somem antes) e
 * `usarNevoa` recebe a textura da grade da névoa de guerra (nevoa.js).
 */
export function criarNuvens({ solDir, tempo }) {
  const branco = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  branco.needsUpdate = true;
  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      tNevoa: { value: null },
      tTufos: { value: null },
      uMeioMapa: { value: new THREE.Vector2(MAP_HALF_X, MAP_HALF_Z) },
      uSolDir: { value: solDir.clone() },
      uLuz: { value: new THREE.Color(CORES_NUVEM.luz) },
      uSombra: { value: new THREE.Color(CORES_NUVEM.sombra) },
      uHe3: { value: new THREE.Color(CORES_NUVEM.he3) },
      uOculta: { value: new THREE.Color(CORES_NUVEM.oculta) },
      uPerto: { value: PERTO_M },
      uRala: { value: 1 },
    },
  ]);
  // Texturas e o relógio fora do merge (o merge clonaria): o tempo é o da água.
  uniforms.tNevoa.value = branco;
  uniforms.tTufos.value = texturaTufos();
  uniforms.uTempo = tempo;
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERTICE,
    fragmentShader: FRAGMENTO,
    transparent: true,
    depthWrite: false,
    fog: true,
    // Cor misturada por cima; o alfa do alvo cai pela transmitância (1 − a): o passo
    // da névoa lê "quanto é nuvem" nele.
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.SrcAlphaFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.ZeroFactor,
    blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  });

  const base = new THREE.CircleGeometry(0.5, 8);
  const grupo = new THREE.Group();
  grupo.name = 'nuvens';
  const camLocal = new THREE.Vector3();
  for (const a of ASTEROIDES) {
    const tufos = tufosDoCampo(a, solDir);
    const n = tufos.length;
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.getAttribute('position'));
    geo.setAttribute('uv', base.getAttribute('uv'));
    const attr = (nome, tam) => {
      const at = new THREE.InstancedBufferAttribute(new Float32Array(n * tam), tam);
      at.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute(nome, at);
      return at;
    };
    const centro = attr('aCentro', 3);
    const tam = attr('aTam', 2);
    const mov = attr('aMov', 4);
    const dados = attr('aDados', 4);
    geo.instanceCount = n;
    const raio = Math.hypot(a.largura, a.profundidade) / 2 + 60;
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 10, 0), raio);
    geo.boundingBox = new THREE.Box3(new THREE.Vector3(-raio, -40, -raio), new THREE.Vector3(raio, 70, raio));

    const malha = new THREE.Mesh(geo, material);
    malha.name = `nuvem-${a.id}`;
    malha.position.set(a.x, 0, a.z);
    malha.renderOrder = ORDEM_NUVEM;
    grupo.add(malha);

    // De trás para a frente, a partir da câmera (no espaço do campo).
    const ordem = tufos.map((_, i) => i);
    const dist = new Float32Array(n);
    let ultima = null;
    const preencher = () => {
      ordem.forEach((iT, i) => {
        const t = tufos[iT];
        centro.setXYZ(i, t.x, t.y, t.z);
        tam.setXY(i, t.largura, t.altura);
        mov.setXYZW(i, t.fase, t.deriva, t.ang, t.giro);
        dados.setXYZW(i, t.variante, t.luz, t.alfa, t.he3);
      });
      for (const at of [centro, tam, mov, dados]) at.needsUpdate = true;
    };
    preencher();
    malha.onBeforeRender = (_r, _s, camera) => {
      camLocal.setFromMatrixPosition(camera.matrixWorld).sub(malha.position);
      if (ultima && ultima.distanceToSquared(camLocal) < REORDENAR_M * REORDENAR_M) return;
      (ultima ??= new THREE.Vector3()).copy(camLocal);
      for (let i = 0; i < n; i++) {
        const t = tufos[i];
        dist[i] = (t.x - camLocal.x) ** 2 + (t.y - camLocal.y) ** 2 + (t.z - camLocal.z) ** 2;
      }
      ordem.sort((p, q) => dist[q] - dist[p]);
      preencher(); // sobe no próximo quadro (o Three.js já enviou os atributos deste)
    };
  }

  let dentro = 0;
  return {
    grupo,
    /** Um quadro: com o foco (a nave) dentro de um campo, os tufos de perto somem antes e a nuvem fica mais rala. */
    atualizar(dt, foco) {
      const alvo = foco && emAsteroides(foco.x, foco.z) ? 1 : 0;
      dentro += (alvo - dentro) * (1 - Math.exp(-3 * dt));
      uniforms.uPerto.value = PERTO_M + (PERTO_DENTRO_M - PERTO_M) * dentro;
      uniforms.uRala.value = 1 + (DENTRO_ALFA - 1) * dentro;
      return dentro;
    },
    /** A textura da grade da névoa de guerra (R = visto). */
    usarNevoa(textura) {
      uniforms.tNevoa.value = textura ?? branco;
    },
  };
}
