// Volta à base (recall): o desenho do efeito (a linha do tempo está em volta-regras.js), na
// linguagem do recall dos MOBAs. As malhas são do Blender (`volta-base.glb` do mapa: o
// disco do círculo, as fitas do funil, o tubo da coluna e do feixe e a onda, de tamanho 1,
// com UV) e o desenho e o movimento são do shader, como na subida de nível e na água:
//
// - círculo de runas: uma textura gerada aqui uma vez, uma camada por canal (R o aro de
//   fora com as marcas, G a faixa de runas, B o miolo geométrico), cada camada girando no
//   seu sentido; o círculo se desenha em volta ao nascer e o arco de progresso enche na
//   borda;
// - partículas: um Points com PARTICULAS sementes, todo o movimento no shader (o funil
//   subindo, a explosão da partida, a convergência da chegada), nada atualizado na CPU;
// - coluna de luz: o tubo com energia correndo para cima (ruído periódico em volta) e a
//   borda mais clara que o meio, como um volume;
// - casca: a própria nave desenhada de novo por cima (as malhas do casco e das armas, sem a
//   propulsão), acesa na borda, com energia correndo e a dissolução por ruído com a borda
//   incandescente (`uCorte`): é ela que se desfaz na partida e se materializa na chegada.
//
// Tudo aditivo na cor do time (relativa a quem olha) com o miolo branco, sem gravar
// profundidade e sem neblina; nada ilumina a cena.
//
// Desempenho: cada volta tem o seu grupo com material próprio (os uniformes mudam por
// quadro), que sai de uma reserva e volta para ela ao acabar, nunca liberado: os materiais
// são cópias dos de base, então o Three.js compila um programa por peça uma vez só (na tela
// de carregamento, que toca uma volta para aquecer). As cascas são malhas novas sobre as
// geometrias que a nave já tem (nada vai para a placa de vídeo de novo).

import * as THREE from 'three';
import { instanciaMapa, modeloMapaPronto } from './mapa-modelos.js';
import { FEIXE_ALTURA } from './volta-regras.js';

export const MODELO_VOLTA = 'volta-base';
export const PARTICULAS = 360;

const TAU = Math.PI * 2;
const MODOS = { funil: 0, explosao: 1, implosao: 2 };

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

// Ruído de valor 3D e a soma de três oitavas (a energia da coluna e da casca).
const RUIDO = /* glsl */ `
  float hash3(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float ruido(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash3(i), hash3(i + vec3(1, 0, 0)), f.x), mix(hash3(i + vec3(0, 1, 0)), hash3(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(hash3(i + vec3(0, 0, 1)), hash3(i + vec3(1, 0, 1)), f.x), mix(hash3(i + vec3(0, 1, 1)), hash3(i + vec3(1, 1, 1)), f.x), f.y),
      f.z);
  }
  float fbm(vec3 p) {
    return 0.55 * ruido(p) + 0.3 * ruido(p * 2.03) + 0.15 * ruido(p * 4.01);
  }
`;

// O círculo: as três camadas da textura giradas cada uma no seu sentido, o desenho abrindo
// em volta (`uDesenha`, a fração da volta já desenhada, a partir do alto), o arco de
// progresso na borda e um brilho macio no meio.
const CIRCULO = /* glsl */ `
  uniform sampler2D uMapa;
  uniform vec3 uCor;
  uniform float uAlfa, uDesenha, uProg, uPulso;
  uniform vec3 uGiros;
  varying vec2 vUv;
  vec2 gira(vec2 p, float a) {
    float c = cos(a), s = sin(a);
    return vec2(c * p.x - s * p.y, s * p.x + c * p.y) * 0.5 + 0.5;
  }
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    if (r > 1.0) discard;
    float volta = fract(atan(p.x, p.y) / 6.2832 + 1.0); // 0 no alto, no sentido do relógio
    // Viés no mipmap: deitado e visto de longe, as runas não viram borrão.
    float R = texture2D(uMapa, gira(p, uGiros.x), -0.75).r;
    float G = texture2D(uMapa, gira(p, uGiros.y), -0.75).g;
    float B = texture2D(uMapa, gira(p, uGiros.z), -0.75).b;
    float desenhado = 1.0 - smoothstep(uDesenha - 0.02, uDesenha, volta);
    float ponta = exp(-abs(volta - uDesenha) * 60.0) * step(uDesenha, 0.999) * smoothstep(0.55, 0.95, r);
    float arco = smoothstep(0.925, 0.94, r) * (1.0 - smoothstep(0.995, 1.0, r)) * (1.0 - smoothstep(uProg - 0.004, uProg, volta));
    float miolo = exp(-r * r * 5.0);
    float linhas = 0.7 * R + 0.6 * G + 0.55 * B;
    float a = desenhado * (linhas * (1.15 + 0.5 * uPulso) + 0.18 * miolo + 0.06) + 1.0 * arco + 1.5 * ponta;
    vec3 cor = mix(uCor, vec3(1.0), clamp(0.25 * linhas * linhas + 0.5 * arco + ponta + 0.3 * uPulso * linhas, 0.0, 1.0));
    gl_FragColor = vec4(cor, clamp(a * uAlfa, 0.0, 1.0));
    ${FIM}
  }
`;

// As fitas do funil: uma cabeça de luz correndo cada fita para cima com o rastro apagando
// atrás, fio claro no meio da largura e o alto sumindo.
const FITAS = /* glsl */ `
  uniform vec3 uCor;
  uniform float uAlfa, uFase;
  varying vec2 vUv;
  void main() {
    float fita = floor(vUv.x);
    float u = vUv.x - fita;
    float cabeca = fract(uFase + fita * 0.37) * 1.5;
    float atras = cabeca - u;
    float rastro = atras < 0.0 ? 0.0 : exp(-atras * 3.5);
    float beira = pow(1.0 - abs(vUv.y * 2.0 - 1.0), 1.8);
    float alto = 1.0 - smoothstep(0.75, 1.0, u);
    float pe = smoothstep(0.0, 0.08, u);
    vec3 cor = mix(uCor, vec3(1.0), 0.6 * rastro * rastro);
    gl_FragColor = vec4(cor, clamp(uAlfa * beira * alto * pe * (0.1 + 0.9 * rastro), 0.0, 1.0));
    ${FIM}
  }
`;

// A coluna de luz: energia em faixas subindo (ruído periódico em volta, sem costura), mais
// clara no meio e sumindo na silhueta (um volume, não uma placa), o pé macio e o alto
// sumindo.
const COLUNA = /* glsl */ `
  uniform vec3 uCor;
  uniform float uAlfa, uTempo, uBranco;
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vV;
  ${RUIDO}
  void main() {
    float v = vUv.y;
    float ang = vUv.x * 6.2832;
    float olha = abs(dot(normalize(vN), normalize(vV)));
    float volume = smoothstep(0.05, 0.75, olha);
    float n = fbm(vec3(cos(ang) * 1.6, sin(ang) * 1.6, v * 3.0 - uTempo * 1.6));
    float faixas = smoothstep(0.45, 0.8, n);
    float pe = smoothstep(0.0, 0.1, v);
    float alto = pow(1.0 - v, 1.6);
    float a = uAlfa * pe * alto * volume * (0.14 + 0.6 * faixas);
    vec3 cor = mix(uCor, vec3(1.0), clamp(0.35 * faixas + uBranco, 0.0, 1.0));
    gl_FragColor = vec4(cor, clamp(a, 0.0, 1.0));
    ${FIM}
  }
`;

// O feixe: a linha de luz entre a nave e o céu. Só existe de um lado da cabeça (abaixo
// dela quando sobe da nave, acima quando cai do céu); miolo claro, pacotes de luz correndo
// no sentido dele e a cabeça mais clara.
const FEIXE = /* glsl */ `
  uniform vec3 uCor;
  uniform float uAlfa, uCabeca, uDoCeu, uTempo, uAltura;
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    float v = vUv.y;
    float olha = abs(dot(normalize(vN), normalize(vV)));
    float miolo = olha * olha;
    float existe = uDoCeu > 0.5 ? smoothstep(uCabeca, uCabeca + 0.01, v) : 1.0 - smoothstep(uCabeca - 0.01, uCabeca, v);
    float cabeca = exp(-abs(v - uCabeca) * uAltura / 5.0);
    float pacotes = 0.7 + 0.3 * sin(v * uAltura * 0.12 + (uDoCeu > 0.5 ? 1.0 : -1.0) * uTempo * 32.0);
    float ceu = pow(1.0 - v, 0.7);
    vec3 cor = mix(uCor, vec3(1.0), clamp(miolo * miolo * 0.4 + cabeca * 0.6, 0.0, 1.0));
    gl_FragColor = vec4(cor, clamp(uAlfa * existe * miolo * (0.6 * ceu * pacotes + cabeca * 1.2), 0.0, 1.0));
    ${FIM}
  }
`;

// A onda: anel macio com a borda de fora clara.
const ANEL = /* glsl */ `
  uniform vec3 uCor;
  uniform float uAlfa;
  varying vec2 vUv;
  void main() {
    float v = vUv.y;
    float faixa = pow(smoothstep(0.0, 0.9, v), 2.0) * (1.0 - smoothstep(0.9, 1.0, v));
    vec3 cor = mix(uCor, vec3(1.0), 0.4 * faixa * faixa);
    gl_FragColor = vec4(cor, clamp(uAlfa * faixa, 0.0, 1.0));
    ${FIM}
  }
`;

// As partículas: cada uma com quatro números ao acaso; a posição é toda do shader, pelo
// modo (o funil, a explosão, a convergência), em m a partir do pé do efeito. O tamanho
// é em m (vira px pela distância), com teto, para a sua nave não encher a tela.
const PARTICULA_VERTICE = /* glsl */ `
  attribute vec4 aSemente;
  uniform float uTempo, uModo, uK, uDensidade, uRaio, uAltura, uTamanho, uEscalaTela, uAlfa;
  varying float vAlfa;
  varying float vQuente;
  void main() {
    vec4 s = aSemente;
    float sorteio = fract(s.x * 7.13 + s.w * 3.71);
    vec3 p;
    float alfa;
    float tam = uTamanho * (0.45 + 0.9 * s.x);
    float ang = s.w * 6.2832;
    if (uModo < 0.5) {
      // Funil: sobe girando e fecha para o meio; mais partículas com a carga.
      float vida = fract(uTempo * (0.3 + 0.25 * s.x) + s.y);
      float r = uRaio * mix(1.0, 0.12, pow(vida, 0.75)) * (0.5 + 0.5 * s.z);
      float a = ang + vida * 4.0 + uTempo * (0.5 + 0.7 * s.x);
      p = vec3(cos(a) * r, vida * uAltura * (0.6 + 0.5 * s.z), sin(a) * r);
      alfa = sin(3.1416 * vida) * step(sorteio, uDensidade);
      tam *= 1.0 - 0.55 * vida;
      vQuente = 1.0 - vida;
    } else if (uModo < 1.5) {
      // Explosão: saem do corpo da nave para fora e sobretudo para cima.
      float k = clamp((uK - s.z * 0.15) / 0.85, 0.0, 1.0);
      vec3 de = vec3(cos(ang) * uRaio * 0.35 * s.z, uRaio * 0.25 * (0.5 + s.y), sin(ang) * uRaio * 0.35 * s.z);
      vec3 rumo = vec3(cos(ang) * (0.3 + 0.9 * s.x), 0.6 + 2.2 * s.y, sin(ang) * (0.3 + 0.9 * s.x));
      p = de + rumo * uAltura * 0.45 * k;
      alfa = k > 0.0 ? pow(1.0 - k, 1.3) : 0.0;
      tam *= 1.2 - 0.7 * k;
      vQuente = 1.0 - k;
    } else {
      // Convergência: vêm de longe (sobretudo do alto) girando e entram na nave.
      float k = clamp((uK - s.x * 0.3) / 0.7, 0.0, 1.0);
      float a = ang + (1.0 - k) * 2.5;
      float r = uRaio * (1.0 + 1.4 * s.z) * (1.0 - k) + uRaio * 0.1 * s.z;
      float y = mix(uAltura * (0.2 + 0.9 * s.y), uRaio * 0.3, k);
      p = vec3(cos(a) * r, y, sin(a) * r);
      alfa = smoothstep(0.0, 0.15, k) * (1.0 - smoothstep(0.8, 1.0, k));
      vQuente = k;
    }
    vAlfa = alfa * uAlfa;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = min(tam * uEscalaTela / max(1.0, -mv.z), 48.0);
    gl_Position = projectionMatrix * mv;
  }
`;
const PARTICULA = /* glsl */ `
  uniform vec3 uCor;
  varying float vAlfa;
  varying float vQuente;
  void main() {
    vec2 c = gl_PointCoord * 2.0 - 1.0;
    float d = dot(c, c);
    if (d > 1.0 || vAlfa <= 0.0) discard;
    float halo = exp(-d * 3.5);
    float miolo = exp(-d * 18.0);
    vec3 cor = mix(uCor, vec3(1.0), clamp(miolo * 0.85 + 0.25 * vQuente, 0.0, 1.0));
    gl_FragColor = vec4(cor, clamp(vAlfa * (0.55 * halo + 0.7 * miolo), 0.0, 1.0));
    ${FIM}
  }
`;

// A casca: a nave em luz. A borda mais clara que o meio (a normal vem da própria face,
// como o casco facetado), energia correndo para cima no casco e a dissolução: o que está
// abaixo do corte (a altura em corpos somada ao ruído) some, e a beira do corte arde.
const CASCA_VERTICE = /* glsl */ `
  varying vec3 vW;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const CASCA = /* glsl */ `
  uniform vec3 uCor, uCentro;
  uniform float uAlfa, uBranco, uCorte, uCorpo, uTempo;
  varying vec3 vW;
  ${RUIDO}
  void main() {
    vec3 l = (vW - uCentro) / uCorpo;
    float n = fbm(l * 2.2 + vec3(0.0, -uTempo * 0.6, 0.0));
    float valor = l.y + (n - 0.5) * 1.1;
    if (valor < uCorte) discard;
    float arde = (1.0 - smoothstep(0.0, 0.14, valor - uCorte)) * step(-50.0, uCorte);
    vec3 nf = normalize(cross(dFdx(vW), dFdy(vW)));
    float borda = 1.0 - abs(dot(nf, normalize(cameraPosition - vW)));
    float fres = borda * borda;
    float fluxo = smoothstep(0.55, 0.85, fbm(l * 3.5 + vec3(0.0, -uTempo * 2.2, 0.0)));
    float a = uAlfa * (0.12 + 0.8 * fres + 0.45 * fluxo + 0.85 * uBranco + 1.6 * arde);
    vec3 cor = mix(uCor, vec3(1.0), clamp(0.25 * fres + 0.3 * fluxo + 0.7 * uBranco + arde, 0.0, 1.0));
    gl_FragColor = vec4(cor, clamp(a, 0.0, 1.0));
    ${FIM}
  }
`;

const PECAS = {
  circulo: { no: 'volta_disco', frag: CIRCULO, uniformes: { uMapa: null, uDesenha: 0, uProg: 0, uPulso: 0, uGiros: new THREE.Vector3() } },
  fitas: { no: 'volta_fitas', frag: FITAS, uniformes: { uFase: 0 } },
  coluna: { no: 'volta_feixe', frag: COLUNA, uniformes: { uTempo: 0, uBranco: 0 } },
  feixe: { no: 'volta_feixe', frag: FEIXE, uniformes: { uCabeca: 0, uDoCeu: 0, uTempo: 0, uAltura: 1 } },
  anel: { no: 'volta_anel', frag: ANEL, uniformes: {} },
};
const UNIFORMES_PARTICULAS = { uTempo: 0, uModo: 0, uK: 0, uDensidade: 0, uRaio: 1, uAltura: 1, uTamanho: 1, uEscalaTela: 500 };
const UNIFORMES_CASCA = { uCentro: new THREE.Vector3(), uCorpo: 1, uBranco: 0, uCorte: -99, uTempo: 0 };

let geometrias = null; // nó do glb -> geometria
let geoParticulas = null;
let mapaCirculo = null;
const bases = new Map(); // peça -> material de base (as voltas usam cópias)
const reserva = [];
const tamTela = new THREE.Vector2();

function geometriasProntas() {
  if (geometrias) return true;
  if (!modeloMapaPronto(MODELO_VOLTA)) return false;
  geometrias = {};
  instanciaMapa(MODELO_VOLTA).traverse((o) => {
    if (o.isMesh) geometrias[o.name] = o.geometry;
  });
  // As sementes das partículas, as mesmas para todas as voltas (sorteio fixo).
  let x = 0x9e3779b9;
  const acaso = () => (x = (Math.imul(x ^ (x >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0) / 4294967296;
  const sementes = new Float32Array(PARTICULAS * 4).map(() => acaso());
  geoParticulas = new THREE.BufferGeometry();
  geoParticulas.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PARTICULAS * 3), 3));
  geoParticulas.setAttribute('aSemente', new THREE.BufferAttribute(sementes, 4));
  return true;
}

/**
 * A textura do círculo de runas (1024 px), desenhada uma vez: o aro de fora com as marcas
 * no vermelho, a faixa de runas no verde e o miolo geométrico no azul, cada uma com um halo
 * (o shader gira as três camadas separadas). As runas são sorteadas com semente fixa.
 */
function texturaCirculo() {
  if (mapaCirculo) return mapaCirculo;
  const T = 1024;
  const c = T / 2;
  const U = T * 0.49; // raio 1
  const camada = (desenhar) => {
    const cv = document.createElement('canvas');
    cv.width = cv.height = T;
    const g = cv.getContext('2d');
    g.translate(c, c);
    g.strokeStyle = g.fillStyle = '#fff';
    g.lineCap = 'round';
    g.lineJoin = 'round';
    // Duas passadas: o halo (sombra borrada) e o traço limpo por cima.
    for (const halo of [true, false]) {
      g.save();
      g.shadowColor = halo ? 'rgba(255,255,255,0.9)' : 'transparent';
      g.shadowBlur = halo ? 14 : 0;
      g.globalAlpha = halo ? 0.55 : 1;
      desenhar(g);
      g.restore();
    }
    return g.getImageData(0, 0, T, T).data;
  };
  const aro = (g, r, w, a0 = 0, a1 = TAU) => {
    g.lineWidth = w * U;
    g.beginPath();
    g.arc(0, 0, r * U, a0, a1);
    g.stroke();
  };
  const raio = (g, a, r0, r1, w) => {
    g.lineWidth = w * U;
    g.beginPath();
    g.moveTo(Math.cos(a) * r0 * U, Math.sin(a) * r0 * U);
    g.lineTo(Math.cos(a) * r1 * U, Math.sin(a) * r1 * U);
    g.stroke();
  };
  const poligono = (g, n, r, giro, w) => {
    g.lineWidth = w * U;
    g.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = giro + (TAU * i) / n;
      g[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r * U, Math.sin(a) * r * U);
    }
    g.stroke();
  };
  let x = 7;
  const acaso = () => (x = (x * 16807) % 2147483647) / 2147483647;

  const fora = camada((g) => {
    aro(g, 0.985, 0.014);
    aro(g, 0.945, 0.005);
    for (let i = 0; i < 96; i++) {
      const longo = i % 8 === 0;
      raio(g, (TAU * i) / 96, longo ? 0.865 : 0.89, 0.93, longo ? 0.009 : 0.004);
    }
    for (let i = 0; i < 12; i++) aro(g, 0.84, 0.01, (TAU * i) / 12 + 0.06, (TAU * (i + 1)) / 12 - 0.06);
    for (let i = 0; i < 4; i++) {
      const a = (TAU * i) / 4 + Math.PI / 4;
      g.beginPath();
      g.moveTo(Math.cos(a) * 0.975 * U, Math.sin(a) * 0.975 * U);
      g.lineTo(Math.cos(a + 0.05) * U, Math.sin(a + 0.05) * U);
      g.lineTo(Math.cos(a - 0.05) * U, Math.sin(a - 0.05) * U);
      g.closePath();
      g.fill();
    }
  });
  const runas = camada((g) => {
    aro(g, 0.79, 0.007);
    aro(g, 0.62, 0.007);
    const n = 18;
    x = 7; // as duas passadas sorteiam as mesmas runas
    for (let i = 0; i < n; i++) {
      const a = (TAU * i) / n;
      g.save();
      g.rotate(a);
      g.translate(0.705 * U, 0);
      g.rotate(Math.PI / 2);
      // Runa: 3 a 5 traços entre os pontos de uma grade 3 × 3, às vezes com um anel.
      const passo = 0.035 * U;
      const ponto = () => [Math.floor(acaso() * 3) - 1, Math.floor(acaso() * 3) - 1];
      g.lineWidth = 0.011 * U;
      g.beginPath();
      let [px, py] = ponto();
      g.moveTo(px * passo, py * passo);
      for (let k = 0, tracos = 3 + Math.floor(acaso() * 3); k < tracos; k++) {
        let [qx, qy] = ponto();
        if (qx === px && qy === py) qx = -qx || 1;
        g.lineTo(qx * passo, qy * passo);
        [px, py] = [qx, qy];
      }
      g.stroke();
      if (acaso() < 0.4) {
        g.lineWidth = 0.006 * U;
        g.beginPath();
        g.arc(0, 0, passo * 0.45, 0, TAU);
        g.stroke();
      }
      g.restore();
      g.beginPath();
      g.arc(Math.cos(a + Math.PI / n) * 0.705 * U, Math.sin(a + Math.PI / n) * 0.705 * U, 0.009 * U, 0, TAU);
      g.fill();
    }
  });
  const miolo = camada((g) => {
    aro(g, 0.5, 0.009);
    aro(g, 0.47, 0.003);
    poligono(g, 4, 0.47, 0, 0.007);
    poligono(g, 4, 0.47, Math.PI / 4, 0.007);
    poligono(g, 3, 0.33, -Math.PI / 2, 0.005);
    poligono(g, 3, 0.33, Math.PI / 2, 0.005);
    aro(g, 0.2, 0.011);
    aro(g, 0.12, 0.004);
    for (let i = 0; i < 8; i++) {
      const a = (TAU * i) / 8;
      raio(g, a, 0.21, 0.33, 0.006);
      g.lineWidth = 0.005 * U;
      g.beginPath();
      g.arc(Math.cos(a) * 0.37 * U, Math.sin(a) * 0.37 * U, 0.025 * U, 0, TAU);
      g.stroke();
    }
  });
  const dados = new Uint8Array(T * T * 4);
  for (let i = 0; i < T * T; i++) {
    dados[i * 4] = fora[i * 4 + 3];
    dados[i * 4 + 1] = runas[i * 4 + 3];
    dados[i * 4 + 2] = miolo[i * 4 + 3];
    dados[i * 4 + 3] = 255;
  }
  mapaCirculo = new THREE.DataTexture(dados, T, T, THREE.RGBAFormat);
  mapaCirculo.generateMipmaps = true;
  mapaCirculo.minFilter = THREE.LinearMipmapLinearFilter;
  mapaCirculo.magFilter = THREE.LinearFilter;
  mapaCirculo.anisotropy = 8; // deitado, visto de lado
  mapaCirculo.needsUpdate = true;
  return mapaCirculo;
}

function uniformes(extra) {
  return Object.fromEntries(Object.entries({ uCor: new THREE.Color(), uAlfa: 0, ...extra }).map(([k, v]) => [k, { value: v?.clone ? v.clone() : v }]));
}

function material(peca) {
  let base = bases.get(peca);
  if (!base) {
    const aditivo = { blending: THREE.AdditiveBlending, transparent: true, depthWrite: false };
    if (peca === 'casca') {
      // Fica por cima do casco de verdade (mesma malha): puxada para a câmera.
      base = new THREE.ShaderMaterial({ vertexShader: CASCA_VERTICE, fragmentShader: CASCA, uniforms: uniformes(UNIFORMES_CASCA), ...aditivo, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 });
    } else if (peca === 'particulas') {
      base = new THREE.ShaderMaterial({ vertexShader: PARTICULA_VERTICE, fragmentShader: PARTICULA, uniforms: uniformes(UNIFORMES_PARTICULAS), ...aditivo });
    } else {
      const { frag, uniformes: u } = PECAS[peca];
      base = new THREE.ShaderMaterial({ vertexShader: VERTICE, fragmentShader: frag, uniforms: uniformes(u), ...aditivo, side: THREE.DoubleSide });
      if (peca === 'circulo') base.uniforms.uMapa.value = texturaCirculo();
    }
    bases.set(peca, base);
  }
  return base.clone(); // o clone copia os uniformes (cores e vetores novos; a textura é a mesma)
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
    const particulas = new THREE.Points(geoParticulas, material('particulas'));
    particulas.frustumCulled = false;
    // O tamanho das partículas em px depende da altura da tela e do campo de visão.
    particulas.onBeforeRender = (renderer, _cena, camera) => {
      renderer.getDrawingBufferSize(tamTela);
      particulas.material.uniforms.uEscalaTela.value = (tamTela.y * camera.projectionMatrix.elements[5]) / 2;
    };
    obj.add(particulas);
    malhas.particulas = particulas;
    v = { obj, malhas, casca: material('casca'), fantasmas: [], fontes: [], fases: { giros: [0, 0, 0], fitas: 0, particulas: 0 }, tempo: 0 };
  }
  v.fases.giros = [0, 0, 0];
  v.fases.fitas = v.fases.particulas = 0;
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
  if (!casco) return;
  casco.updateWorldMatrix(true, true);
  casco.traverse((o) => {
    if (!o.isMesh || ehLuz(o.material)) return;
    for (let p = o; p && p !== casco; p = p.parent) if (!p.visible) return;
    const f = new THREE.Mesh(o.geometry, v.casca);
    f.matrixAutoUpdate = false;
    f.frustumCulled = false;
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

/**
 * Desenha o quadro `q` (de quadroCanal, quadroPartida ou quadroChegada) na volta `v`: a
 * nave com o centro em `x`, `y`, `z` e o pé (`pe`, y logo abaixo da barriga, onde fica o
 * círculo), `cor` do time, `corpo` da nave (m), `dt` (s, para os giros e os pulsos) e
 * `brilho` (a sua nave, com a câmera logo atrás, acende menos).
 */
export function desenharVolta(v, q, { cor, corpo, x, y, z, pe, dt, brilho = 1 }) {
  const { circulo, fitas, coluna, feixe, anel, particulas } = v.malhas;
  const f = v.fases;
  v.tempo += dt;
  q.circulo.giros.forEach((w, i) => (f.giros[i] += w * dt));
  f.fitas += q.fitas.corre * dt;
  f.particulas += q.particulas.veloc * dt;
  for (const m of Object.values(v.malhas)) m.material.uniforms.uCor.value.copy(cor);

  circulo.visible = q.circulo.alfa > 0.003;
  circulo.position.set(x, pe, z);
  circulo.scale.setScalar(q.circulo.raio * corpo);
  const uc = circulo.material.uniforms;
  uc.uAlfa.value = q.circulo.alfa * brilho;
  uc.uDesenha.value = q.circulo.desenha;
  uc.uProg.value = q.circulo.prog;
  uc.uPulso.value = q.circulo.pulso;
  uc.uGiros.value.set(...f.giros);

  const up = particulas.material.uniforms;
  particulas.visible = q.particulas.alfa > 0.003;
  particulas.position.set(x, pe, z);
  up.uAlfa.value = q.particulas.alfa;
  up.uTempo.value = f.particulas;
  up.uModo.value = MODOS[q.particulas.modo];
  up.uK.value = q.particulas.k;
  up.uDensidade.value = q.particulas.densidade;
  up.uRaio.value = q.particulas.raio * corpo;
  up.uAltura.value = q.particulas.altura * corpo;
  up.uTamanho.value = corpo * 0.16 * (0.7 + 0.3 * brilho);

  fitas.visible = q.fitas.alfa > 0.003;
  const rf = 1.2 * corpo * q.fitas.aperta;
  fitas.position.set(x, pe, z);
  fitas.scale.set(rf, q.coluna.altura * corpo, rf);
  fitas.rotation.y = -f.fitas * 0.8;
  fitas.material.uniforms.uAlfa.value = q.fitas.alfa * 0.9 * brilho;
  fitas.material.uniforms.uFase.value = f.fitas;

  coluna.visible = q.coluna.alfa > 0.003;
  const rc = q.coluna.raio * corpo;
  coluna.position.set(x, pe - 0.2 * corpo, z);
  coluna.scale.set(rc, q.coluna.altura * corpo, rc);
  const ucl = coluna.material.uniforms;
  ucl.uAlfa.value = q.coluna.alfa * brilho;
  ucl.uTempo.value = v.tempo;
  ucl.uBranco.value = q.coluna.branco;

  feixe.visible = !!q.feixe && q.feixe.alfa > 0;
  if (feixe.visible) {
    const r = Math.max(0.05, q.feixe.raio * corpo);
    feixe.position.set(x, q.feixe.doCeu ? pe : y, z);
    feixe.scale.set(r, FEIXE_ALTURA, r);
    const uf = feixe.material.uniforms;
    uf.uAlfa.value = q.feixe.alfa * brilho;
    uf.uCabeca.value = q.feixe.cabeca;
    uf.uDoCeu.value = q.feixe.doCeu ? 1 : 0;
    uf.uTempo.value = v.tempo;
    uf.uAltura.value = FEIXE_ALTURA;
  }

  anel.visible = !!q.anel && q.anel.alfa > 0;
  if (anel.visible) {
    anel.position.set(x, y, z);
    anel.scale.setScalar(q.anel.raio * corpo);
    anel.material.uniforms.uAlfa.value = q.anel.alfa * brilho;
  }

  const ucs = v.casca.uniforms;
  ucs.uCor.value.copy(cor);
  ucs.uCentro.value.set(x, y, z);
  ucs.uCorpo.value = corpo;
  ucs.uAlfa.value = q.casca.alfa * (0.6 + 0.4 * brilho);
  ucs.uBranco.value = q.casca.branco;
  ucs.uCorte.value = q.casca.corte;
  ucs.uTempo.value = v.tempo;
  for (const m of v.fantasmas) m.visible = q.casca.alfa > 0;
}
