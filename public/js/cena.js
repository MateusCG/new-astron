// Cenário do mapa da partida: o lago de Hélio-3 (Stage 6 no formato do desenho 2D).
//
// A planta é uma só (shared/terrain.js e shared/obstaculos.js: rochas, mineradora,
// bases, objetivos), e o desenho são os modelos da frente Cenário
// (public/modelos/mapa/, ver LISTA.md: medidas, pivôs e onde pôr cada peça),
// montados aqui nos lugares da planta. Cada peça sólida casa com a planta (a
// silhueta fica entre a planta e a planta + 4 m), então o que se vê é o que bate. A
// física continua de heightAt/alturaSolida; a malha de heightAt (o terreno
// provisório da fase 1) só volta como reserva se um modelo de rocha não carregar.
//
// O que entra:
// - borda (quatro quartos), horizonte, fundo do lago, rochas dos quadrantes e
//   paredes em L dos poços, em rocha de estratos;
// - a água (a malha do agua.glb com o shader de agua.js) em NIVEL_AGUA, abaixo do chão de voo: tudo
//   flutua sobre o lago;
// - a mineradora de He-3 no centro, com as docas na cor do time dono (relativa a quem
//   olha), a porta de cada hangar sempre aberta com o campo de força do time (só o
//   minerador dele passa; borda acesa e faixas finas, quase transparente) e o He-3
//   "respirando" (mais forte com minerador minerando);
// - as bases: portal warp flutuante (ilha boiando devagar, membrana em redemoinho e
//   um feixe fino da ponta da broca até a água), anel de pouso, plataformas da
//   Evolução e da Loja com o ícone e o nome no chão, a bacia de minério logo à
//   frente do anel (o minério que o time entregou acumula lá dentro e sobe com o
//   placar; o despejo de cada minerador cai em cristais) e o campo de força na boca
//   do bolsão, de rocha a rocha (na cor do time dono, aceso perto da sua nave e
//   com um anel onde o tiro bate);
// - os objetivos: torres de suporte (de pé, apagadas em 'espera', caídas em
//   'recarga'), plataformas de pouso de ouro (feixe de luz com alguém pousado), o
//   Núcleo de He-3 (anéis e lascas girando, mais rápido com menos vida);
// - as nuvens de gás e poeira da jungle (nuvens.js, nos retângulos de ASTEROIDES:
//   tufos virados para a câmera, sorteados com semente fixa, todo jogador vê igual)
//   e a decoração do lago (pedras que furam a água, ruínas, corais, algas e
//   cristais no fundo), simétrica pela rotação de 180°.
//
// Cor de time é relativa a quem olha (criarCena({ meuTime })): o seu time em
// turquesa, o outro em vermelho. Paleta do planeta da PROPOSTA-VISUAL.md (céu de
// fim de tarde ardósia para areia, sol mais alto que no M1, luz hemisférica com o
// chão verde-azulado da água).
//
// A névoa de guerra (nevoa.js) desenha a cena num passo de tela inteira e ajusta a
// neblina (scene.fog, que tem de continuar um THREE.Fog) ao raio de visão.

import * as THREE from 'three';
import {
  heightAt,
  paredeAt,
  fbm,
  noMapaAberto,
  MAP_HALF_X,
  MAP_HALF_Z,
  NIVEL_AGUA,
  FUNDO_LAGO,
  BASES,
  CAMPOS_BASE,
  BACIAS,
  BACIA,
  SERVICOS,
  AREAS_POUSO,
  ACAMPAMENTOS,
  BUFFS,
  PLATAFORMAS_POUSO,
  NUCLEO,
  LANE,
  daBase,
} from '/shared/terrain.js';
import { PORTAL_WARP, OBSTACULOS, ESCALA_TORRE_SUPORTE } from '/shared/obstaculos.js';
import { criarAgua, TEMPO_AGUA } from './agua.js';
import { criarNuvens } from './nuvens.js';
import { instanciaMapa, partesDoModelo, pintar, neon, materialDoMapa, modeloMapaPronto, texturasPbr } from './mapa-modelos.js';

export const CORES = {
  ceuTopo: new THREE.Color('#22304a'),
  ceuMeio: new THREE.Color('#9a8574'),
  horizonte: new THREE.Color('#ebcba2'),
  neblina: new THREE.Color('#d8b993'),
  sol: new THREE.Color('#fff0d8'),
  halo: new THREE.Color('#ffc890'),
  neon: new THREE.Color('#00efc0'), // seu time
  perigo: new THREE.Color('#ff3b2a'), // o outro time
  objetivo: new THREE.Color('#ffb627'), // objetivos (âmbar)
  minerio: new THREE.Color('#9fe8ff'), // Hélio-3 (azul-gelo)
  evolucao: new THREE.Color('#a58bff'), // plataforma da Evolução (violeta)
  loja: new THREE.Color('#ff6fd8'), // plataforma da Loja (magenta)
  poeira: new THREE.Color('#e9f3ea'), // gotículas do lago
};

/** Direção do sol (vem de −x/−z, elevação ~25°): bate com o disco desenhado no céu. */
export const SOL_DIR = new THREE.Vector3(-0.55, 0.42, -0.72).normalize();
const SOL_COR = '#ffd9b0';
const SOL_INTENSIDADE = 2.4;
const HEMI_CEU = '#f0c9a0';
const HEMI_CHAO = '#3a6e69'; // a luz que volta da água (mais clara que a da proposta: o fundo da ilha do portal ficava preto)
const HEMI_INTENSIDADE = 1.0;
/** Raio da esfera do céu (acompanha a câmera; a câmera vai até 5000 m). */
const CEU_RAIO = 4200;

/** Neon do He-3: "respira" entre estes valores (e sobe com minerador minerando). */
const HE3_MIN = 0.6;
const HE3_MAX = 1.1;
/** Âmbar de objetivo aceso e apagado (espera/recarga). */
const OBJ_ACESO = 1.0;
const OBJ_APAGADO = 0.15;
/** Ilha do portal warp: quanto boia (m) e em quantos segundos. */
const PORTAL_BOIA_M = 1.5;
const PORTAL_BOIA_S = 9;
/**
 * Feixe da plataforma de ouro com alguém pousado (m): começa acima da nave pousada
 * (`base`), para quem está pousado continuar vendo a própria nave, e sobe alto para
 * quem está longe ver.
 */
const FEIXE_PLATAFORMA = { raio: 3.2, altura: 80, base: 7 };
const SEMENTE_DECORACAO = 6161;
/** Gotículas em volta da câmera: tamanho e opacidade, e como ficam dentro de uma nuvem de gás. */
const POEIRA_TAMANHO = 0.3;
const POEIRA_OPACIDADE = 0.35;
const POEIRA_DENTRO = { tamanho: 0.55, opacidade: 0.6, cor: new THREE.Color('#d9c8ad') };
/** Núcleo: velocidade dos anéis (rad/s) parado, vivo e a mais com a vida acabando. */
const NUCLEO_GIRO_PARADO = 0.08;
const NUCLEO_GIRO_VIVO = 0.5;
const NUCLEO_GIRO_FERIDO = 2.2;
/** Campo de força da base: quantos anéis de impacto de tiro ao mesmo tempo. */
const CAMPO_IMPACTOS = 8;
/** Campo de força da base: quanto a colmeia acende com a sua nave perto (no do outro time é o aviso). */
const CAMPO_PERTO_OUTRO = 0.4;
const CAMPO_PERTO_MEU = 0.03;
/**
 * Bacia de minério: o minério acumulado sobe com o placar do time, 1 − e^(−placar /
 * BACIA_ESCALA) (uma partida rende ~1500: a bacia chega a ~90%), e para a
 * BACIA_TOPO_CHEIA m abaixo do aro; anda até o nível novo em uns segundos.
 */
const BACIA_ESCALA = 650;
const BACIA_TOPO_CHEIA = 5;
const BACIA_SUBIDA = 0.8;
/** Brilho de He-3 de dentro da bacia (fração da cor do minério no emissivo): nas paredes e no minério acumulado. */
const BACIA_BRILHO = { parede: 0.09, minerio: 0.14 };
/** Topo médio do minério acima do pivô do nó `bacia_minerio` (o disco vai de 3,7 a 5,5 m; os cristais passam disso). */
const MINERIO_TOPO = 4.6;
/** Despejo na bacia: pedras no ar ao mesmo tempo (as duas bases), por segundo por minerador, e a gravidade (m/s²). */
const CRISTAIS_DESPEJO = 400;
const DESPEJO_POR_S = 22;
const DESPEJO_GRAVIDADE = 22;

function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Põe a cópia de um modelo do mapa no lugar (x, y, z) com giro em y. null se o modelo não está pronto. */
function por(grupo, nome, x, y, z, giro = 0, opcoes) {
  const m = instanciaMapa(nome, opcoes);
  if (!m) return null;
  m.position.set(x, y, z);
  m.rotation.y = giro;
  grupo.add(m);
  return m;
}

/** Nó de um modelo pelo nome (os do Núcleo, da torre e do portal). */
function no(obj, nome) {
  return obj?.getObjectByName(nome) ?? null;
}

// ---------- Céu, poeira ----------

function criarCeu() {
  const geo = new THREE.SphereGeometry(CEU_RAIO, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      topo: { value: CORES.ceuTopo },
      meio: { value: CORES.ceuMeio },
      horizonte: { value: CORES.horizonte },
      corSol: { value: CORES.sol },
      corHalo: { value: CORES.halo },
      solDir: { value: SOL_DIR },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 topo, meio, horizonte, corSol, corHalo, solDir;
      varying vec3 vDir;
      void main() {
        float h = clamp(vDir.y, -0.2, 1.0);
        vec3 c = mix(horizonte, meio, smoothstep(0.02, 0.22, h));
        c = mix(c, topo, smoothstep(0.22, 0.8, h));
        float s = max(dot(vDir, solDir), 0.0);
        c = mix(c, corSol * 1.6, smoothstep(0.9993, 0.9996, s)); // disco do sol
        c += corHalo * pow(s, 14.0) * 0.35;                       // halo em volta
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const ceu = new THREE.Mesh(geo, mat);
  ceu.renderOrder = -10; // primeiro: tudo o mais desenha por cima
  ceu.frustumCulled = false;
  return ceu;
}

/** Gotículas flutuando em volta da câmera (lago úmido): dão noção de velocidade. */
function criarPoeira() {
  const n = 600;
  const pos = new Float32Array(n * 3);
  const rnd = mulberry32(77);
  for (let i = 0; i < n * 3; i++) pos[i] = (rnd() * 2 - 1) * 80;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color: CORES.poeira, size: POEIRA_TAMANHO, transparent: true, opacity: POEIRA_OPACIDADE, depthWrite: false });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}

// ---------- Reserva: terreno de heightAt ----------

/**
 * Terreno provisório (a malha de heightAt nas rochas e o fundo do lago no campo
 * aberto). Só entra se algum modelo de rocha não carregou, para o mapa não ficar
 * com buraco onde a física tem parede.
 */
function criarTerrenoReserva() {
  const segX = Math.round((2 * MAP_HALF_X) / 8);
  const segZ = Math.round((2 * MAP_HALF_Z) / 8);
  const geo = new THREE.PlaneGeometry(MAP_HALF_X * 2, MAP_HALF_Z * 2, segX, segZ);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const cores = new Float32Array(pos.count * 3);
  const fundo = new THREE.Color('#4a4b40');
  const rochaA = new THREE.Color('#4f3d2e');
  const rochaB = new THREE.Color('#b59a74');
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    if (paredeAt(x, z) === 0) {
      pos.setY(i, FUNDO_LAGO);
      c.copy(fundo);
    } else {
      const h = heightAt(x, z);
      pos.setY(i, h);
      c.copy(rochaA).lerp(rochaB, 0.5 + 0.5 * Math.sin(h * 0.35 + fbm(x * 0.01, z * 0.01, 4, 2) * 6));
    }
    cores.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cores, 3));
  const malha = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }));
  malha.receiveShadow = true;
  return malha;
}

// ---------- Rochas, borda, fundo ----------

/** Rochas dos quadrantes, paredes em L e borda (LISTA.md: posição, variante e giro de cada uma). */
const PECAS_ROCHA = [
  ['rocha-quadrante', -697.5, -652.5, 0],
  ['rocha-quadrante-b', -697.5, 652.5, 0],
  ['rocha-quadrante', 697.5, 652.5, Math.PI],
  ['rocha-quadrante-b', 697.5, -652.5, Math.PI],
  ['parede-l', -324, -648, 0],
  ['parede-l', 324, 648, Math.PI],
  ['parede-l-espelhada', -324, 648, 0],
  ['parede-l-espelhada', 324, -648, Math.PI],
  ['borda-quadrante', 0, 0, 0],
  ['borda-quadrante', 0, 0, Math.PI],
  ['borda-quadrante-espelhada', 0, 0, 0],
  ['borda-quadrante-espelhada', 0, 0, Math.PI],
];

function montarRochas(g) {
  let faltou = false;
  for (const [nome, x, z, giro] of PECAS_ROCHA) if (!por(g, nome, x, 0, z, giro)) faltou = true;
  // O horizonte e o fundo do lago: enormes, não projetam sombra (o mapa de sombra
  // só cobre a volta da nave), só recebem.
  por(g, 'borda-horizonte', 0, 0, 0, 0, { sombra: false });
  // O fundo não recebe sombra: o mapa de sombra só cobre a volta da nave, e a borda
  // dele aparecia no fundo visto pela água (claro fora, escuro dentro).
  const fundo = por(g, 'fundo-lago', 0, 0, 0, 0, { sombra: false });
  if (fundo) fundo.traverse((o) => o.isMesh && (o.receiveShadow = false));
  else faltou = true;
  if (faltou) {
    console.warn('Cenário: faltou modelo de rocha; o terreno provisório de heightAt entra de reserva');
    g.add(criarTerrenoReserva());
  }
}

/** Todos os modelos de rocha estão no cache? (senão a cena usa a reserva de heightAt) */
export function rochasProntas() {
  return PECAS_ROCHA.every(([nome]) => modeloMapaPronto(nome));
}

// ---------- Mineradora ----------

/**
 * Mineradora: docas e campos de força na cor do time dono, relativa a quem olha. O
 * campo cobre a porta de cada hangar, que fica aberta: quase nada no meio (somar cor
 * em cima do hangar escuro tinge tudo), a borda acesa e faixas finas descendo devagar.
 */
function montarMineradora(g, meuTime) {
  const m = por(g, 'mineradora', 0, 0, 0, 0);
  if (!m) return null;
  for (const time of [0, 1]) {
    const cor = time === meuTime ? CORES.neon : CORES.perigo;
    pintar(m, `neon_doca_${time}`, neon(cor));
    pintar(m, `campo_doca_${time}`, campoDeForca(cor, time));
  }
  return m;
}

/** Campo de força da porta do hangar (troca o campo_doca_N do glb; UV de 0 a 1 na porta). */
function campoDeForca(cor, fase) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: { uTempo: TEMPO_AGUA, uCor: { value: new THREE.Color(cor) }, uFase: { value: fase * 1.7 } },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform float uTempo, uFase;
      uniform vec3 uCor;
      varying vec2 vUv;
      void main() {
        float lado = smoothstep(0.06, 0.0, min(vUv.x, 1.0 - vUv.x));
        float topo = smoothstep(0.1, 0.0, min(vUv.y, 1.0 - vUv.y));
        float faixas = smoothstep(0.94, 1.0, 0.5 + 0.5 * sin((vUv.y * 9.0 + uTempo * 0.6 + uFase) * 6.2832));
        float pulso = 0.85 + 0.15 * sin(uTempo * 2.6 + uFase);
        float k = (0.012 + 0.3 * max(lado, topo) + 0.045 * faixas) * pulso;
        gl_FragColor = vec4(uCor * k, 1.0);
      }`,
  });
}

// ---------- Bases ----------

/** Plaquinha com texto deitada no chão (nome do serviço). Textura feita em canvas. */
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

/** Caixa fina deitada (traço do ícone do serviço no deque). */
function traco(g, mat, x, y, z, larg, prof, ang = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(larg, 0.12, prof), mat);
  m.position.set(x, y, z);
  m.rotation.y = ang;
  g.add(m);
}

/** Membrana do portal: redemoinho aditivo na cor do time (troca o portal_time do glb). */
function membranaPortal(cor, centro, raio) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: { uTempo: TEMPO_AGUA, uCor: { value: new THREE.Color(cor) }, uCentro: { value: centro }, uRaio: { value: raio } },
    vertexShader: `
      varying vec3 vLocal;
      void main() {
        vLocal = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform float uTempo, uRaio;
      uniform vec3 uCor, uCentro;
      varying vec3 vLocal;
      void main() {
        vec2 p = (vLocal.zy - uCentro.zy) / uRaio;
        float r = length(p);
        float a = atan(p.y, p.x);
        float espiral = 0.5 + 0.5 * sin(a * 3.0 + r * 9.0 - uTempo * 2.2);
        float aneis = 0.5 + 0.5 * sin(r * 18.0 - uTempo * 3.0);
        float k = mix(0.25, 0.75, espiral) * (0.7 + 0.3 * aneis);
        k *= smoothstep(1.02, 0.85, r);
        k += 0.35 * smoothstep(0.35, 0.0, r);
        gl_FragColor = vec4(uCor * k * 0.85, 1.0);
      }`,
  });
}

/** Feixe aditivo vertical (cilindro aberto que some no alto), da altura `altura`. */
function criarFeixe(cor, raio, altura, opacidade = 0.4) {
  const geo = new THREE.CylinderGeometry(raio, raio, 1, 16, 1, true);
  geo.translate(0, 0.5, 0);
  const pos = geo.attributes.position;
  const cores = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) cores.fill(1 - pos.getY(i), i * 3, i * 3 + 3);
  geo.setAttribute('color', new THREE.BufferAttribute(cores, 3));
  const mat = new THREE.MeshBasicMaterial({
    color: cor,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    transparent: true,
    opacity: opacidade,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(geo, mat);
  m.scale.y = altura;
  return m;
}

function montarBase(g, b, meuTime) {
  const cor = b.time === meuTime ? CORES.neon : CORES.perigo;
  const neonTime = neon(cor);
  const giro = b.time === 0 ? 0 : Math.PI;
  const anim = { portal: null, feixe: null, neon: neonTime, base: b, campo: null, minerio: null };

  // Portal warp flutuante (a peça mais baixa a 31 m: a nave passa por baixo).
  const p = daBase(b, PORTAL_WARP.lx, PORTAL_WARP.lz);
  const portal = por(g, 'base-warp', p.x, 0, p.z, giro);
  if (portal) {
    pintar(portal, 'neon_time', neonTime);
    const membrana = no(portal, 'portal_membrana');
    if (membrana) {
      membrana.geometry.computeBoundingBox();
      const caixa = membrana.geometry.boundingBox;
      const tam = caixa.getSize(new THREE.Vector3());
      membrana.material = membranaPortal(cor, caixa.getCenter(new THREE.Vector3()), Math.max(tam.y, tam.z) / 2);
      membrana.castShadow = false;
      membrana.renderOrder = 2;
    }
    // Feixe fino da ponta da broca até a água, na cor do time.
    const feixe = criarFeixe(cor, 0.8, 31 - NIVEL_AGUA, 0.3);
    feixe.position.set(0, NIVEL_AGUA, 0);
    portal.add(feixe);
    anim.portal = portal;
    anim.feixe = feixe;
  }

  // Anel de pouso (topo do deque = piso da área de pouso, onde a física apoia a nave).
  const area = AREAS_POUSO.find((a) => a.base === b.time);
  const anel = por(g, 'plataforma-base', b.x, heightAt(b.x, b.z) + area.piso, b.z, giro);
  if (anel) pintar(anel, 'neon_time', neonTime);

  // Evolução e Loja: deque com o anel na cor do serviço, o ícone e o nome no chão.
  for (const s of SERVICOS.filter((s) => s.time === b.time)) {
    const a = AREAS_POUSO.find((x) => x.servico === s.servico && x.time === s.time);
    const y = heightAt(s.x, s.z) + a.piso;
    const plat = por(g, 'plataforma-servico', s.x, y, s.z, giro);
    const corServico = CORES[s.servico];
    const mat = neon(corServico);
    if (plat) pintar(plat, 'neon_servico', mat);
    const marca = new THREE.Group();
    marca.position.set(s.x, y + 0.06, s.z);
    // O nome se lê de dentro da base, de quem olha para a lane (como a câmera ao nascer).
    marca.rotation.y = s.time === 0 ? -Math.PI / 2 : Math.PI / 2;
    if (s.servico === 'evolucao') {
      for (const dz of [-3, 2.5]) {
        traco(marca, mat, -2.4, 0, dz, 7, 0.8, Math.PI / 4);
        traco(marca, mat, 2.4, 0, dz, 7, 0.8, -Math.PI / 4);
      }
    } else {
      const moeda = new THREE.Mesh(new THREE.TorusGeometry(5, 0.45, 4, 24), mat);
      moeda.rotation.x = Math.PI / 2;
      marca.add(moeda);
      traco(marca, mat, 0, 0, 0, 0.9, 6.5);
    }
    const nome = rotuloChao(s.servico === 'evolucao' ? 'EVOLUÇÃO' : 'LOJA', corServico, 17);
    nome.position.set(0, 0.04, 12.5);
    marca.add(nome);
    g.add(marca);
  }

  // Campo de força na boca do bolsão, de rocha a rocha: a membrana vira o shader do
  // campo na cor do time dono (relativa a quem olha), os emissores levam o neon do time.
  const cb = CAMPOS_BASE[b.time];
  const campo = por(g, 'campo-base', cb.x, 0, cb.z, giro);
  if (campo) {
    pintar(campo, 'neon_time', neonTime);
    anim.campo = campoDaBase(cor, b.time, b.time === meuTime ? CAMPO_PERTO_MEU : CAMPO_PERTO_OUTRO);
    pintar(campo, 'campo_base', anim.campo);
    campo.traverse((o) => {
      if (o.isMesh && o.material === anim.campo) {
        o.castShadow = o.receiveShadow = false;
        o.renderOrder = 1;
      }
    });
  }

  // Bacia de minério à frente do anel: o nó do minério acumulado sobe com o placar.
  const bc = BACIAS[b.time];
  const bacia = por(g, 'bacia', bc.x, 0, bc.z, giro);
  if (bacia) {
    pintar(bacia, 'neon_time', neonTime);
    // O tanque é fundo e o aro faz sombra: sem isto as paredes e o minério lá
    // embaixo ficam pretos. Um brilho fraco de He-3 vindo de dentro, só nesta peça
    // (cópia do material: os de chapa são do mapa inteiro; o emissivo é uniforme,
    // então o programa do shader é o mesmo e nada recompila).
    for (const [nome, k] of [['bacia_estrutura', BACIA_BRILHO.parede], ['bacia_minerio', BACIA_BRILHO.minerio]]) {
      no(bacia, nome)?.traverse((o) => {
        if (!o.isMesh || !o.material?.name?.startsWith('pbr_')) return;
        o.material = o.material.clone();
        o.material.emissive.copy(CORES.minerio).multiplyScalar(k);
      });
    }
    const minerio = no(bacia, 'bacia_minerio');
    if (minerio) anim.minerio = { no: minerio, y0: minerio.position.y, nivel: 0, alvo: 0 };
  }
  return anim;
}

/**
 * Altura do topo do minério acumulado na bacia (y do mundo) para o `nivel` de 0 a 1:
 * do fundo (BACIA.fundo, vazia) até BACIA_TOPO_CHEIA abaixo do aro (cheia).
 */
function topoMinerio(m, nivel) {
  const vazia = m.y0 + MINERIO_TOPO;
  return vazia + nivel * (BACIA.borda - BACIA_TOPO_CHEIA - vazia);
}

/**
 * Campo de força da base (troca o campo_base do campo-base.glb; UV de 0 a 1, u ao
 * longo do vão e v de baixo para cima). Como o do hangar: quase transparente no meio,
 * borda acesa e faixas finas subindo, mas o vão tem 360 m, então o desenho é em
 * metros do mundo: uma colmeia fina que acende perto da nave de quem olha (uFoco,
 * com a força `perto`: forte no campo do outro time, o aviso de "não encoste", e
 * fraca no seu, que você atravessa) e anéis que se abrem onde um tiro bateu
 * (uImpactos: x, y, z do impacto e a hora dele no relógio da água).
 */
function campoDaBase(cor, fase, perto) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTempo: TEMPO_AGUA,
      uCor: { value: new THREE.Color(cor) },
      uFase: { value: fase * 1.7 },
      uPerto: { value: perto },
      uFoco: { value: new THREE.Vector3(0, -1000, 0) },
      uImpactos: { value: Array.from({ length: CAMPO_IMPACTOS }, () => new THREE.Vector4(0, -1000, 0, -100)) },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vMundo;
      void main() {
        vUv = uv;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vMundo = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: `
      uniform float uTempo, uFase, uPerto;
      uniform vec3 uCor, uFoco;
      uniform vec4 uImpactos[${CAMPO_IMPACTOS}];
      varying vec2 vUv;
      varying vec3 vMundo;
      // Distância à borda da célula de uma colmeia de lado 1 (0 na borda).
      float hexBorda(vec2 p) {
        const vec2 s = vec2(1.0, 1.7320508);
        vec4 c = floor(vec4(p, p - vec2(0.5, 1.0)) / s.xyxy) + 0.5;
        vec4 h = vec4(p - c.xy * s, p - (c.zw + 0.5) * s);
        vec2 q = abs(dot(h.xy, h.xy) < dot(h.zw, h.zw) ? h.xy : h.zw);
        return 0.5 - max(dot(q, s * 0.5), q.x);
      }
      void main() {
        float lado = smoothstep(0.012, 0.0, min(vUv.x, 1.0 - vUv.x));
        float topo = smoothstep(0.14, 0.0, 1.0 - vUv.y);
        float pe = smoothstep(0.08, 0.0, vUv.y);
        float faixas = smoothstep(0.95, 1.0, 0.5 + 0.5 * sin((vMundo.y / 9.0 - uTempo * 0.35 + uFase) * 6.2832));
        float pulso = 0.85 + 0.15 * sin(uTempo * 2.6 + uFase);
        vec2 plano = vec2(vMundo.x + vMundo.z, vMundo.y);
        float colmeia = smoothstep(0.05, 0.0, hexBorda(plano / 6.0));
        float perto = exp(-pow(distance(vMundo, uFoco) / 45.0, 2.0));
        float anel = 0.0;
        for (int i = 0; i < ${CAMPO_IMPACTOS}; i++) {
          vec4 im = uImpactos[i];
          float idade = uTempo - im.w;
          if (idade < 0.0 || idade > 1.2) continue;
          float d = distance(vMundo, im.xyz);
          float raio = 2.0 + idade * 22.0;
          anel += (smoothstep(3.0, 0.0, abs(d - raio)) + 1.5 * smoothstep(raio, 0.0, d) * colmeia) * (1.0 - idade / 1.2);
        }
        float k = (0.01 + 0.35 * lado + 0.16 * topo + 0.12 * pe + 0.04 * faixas + colmeia * (0.025 + uPerto * perto)) * pulso + 0.5 * anel;
        gl_FragColor = vec4(uCor * k, 1.0);
      }`,
  });
}

/**
 * Despejo dos mineradores na bacia: cristais de He-3 caindo do contêiner até o
 * minério acumulado lá no fundo, numa InstancedMesh só (um pool de CRISTAIS_DESPEJO
 * pedras). Só visual: o sorteio é Math.random.
 */
function criarDespejo() {
  const geo = new THREE.OctahedronGeometry(0.55, 0);
  geo.scale(0.8, 1.4, 0.8);
  const mat = new THREE.MeshStandardMaterial({ color: CORES.minerio, emissive: CORES.minerio, emissiveIntensity: 0.9, roughness: 0.5, flatShading: true });
  const malha = new THREE.InstancedMesh(geo, mat, CRISTAIS_DESPEJO);
  malha.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  malha.frustumCulled = false;
  malha.castShadow = false;
  malha.count = 0;
  const pedras = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const eixo = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const esc = new THREE.Vector3();
  return {
    malha,
    /** Solta uma pedra de (x, y, z) que para ao chegar em `chao` (y do mundo). */
    soltar(x, y, z, chao) {
      if (pedras.length >= CRISTAIS_DESPEJO) return;
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 1.6;
      pedras.push({
        x: x + Math.cos(a) * r, y, z: z + Math.sin(a) * r,
        vx: Math.cos(a) * r * 0.8, vy: -2 - Math.random() * 3, vz: Math.sin(a) * r * 0.8,
        chao, giro: Math.random() * 6, eixo: [Math.random() - 0.5, Math.random(), Math.random() - 0.5], tam: 0.6 + Math.random() * 0.9,
      });
    },
    atualizar(dt) {
      let n = 0;
      for (let i = 0; i < pedras.length; i++) {
        const p = pedras[i];
        p.vy -= DESPEJO_GRAVIDADE * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        p.giro += dt * 4;
        if (p.y <= p.chao) continue; // chegou no minério: some nele
        pedras[n++] = p;
        q.setFromAxisAngle(eixo.set(...p.eixo).normalize(), p.giro);
        malha.setMatrixAt(n - 1, m.compose(pos.set(p.x, p.y, p.z), q, esc.setScalar(p.tam)));
      }
      pedras.length = n;
      malha.count = n;
      malha.instanceMatrix.needsUpdate = true;
    },
  };
}

// ---------- Objetivos ----------

/**
 * Torres de suporte (BS0/BS1): de pé e caída, uma de cada vez. Os modelos (mid-poly
 * PBR) já vêm no tamanho de TORRE_SUPORTE (ESCALA_TORRE_SUPORTE = 1, pivô no chão de
 * voo); o toco da caída fica abaixo da altura de voo.
 */
function montarTorres(g) {
  const torres = new Map();
  for (const b of BUFFS.filter((b) => b.tipo === 'suporte')) {
    const ambar = neon(CORES.objetivo, OBJ_APAGADO);
    const giro = b.time === 0 ? 0 : Math.PI;
    const dePe = por(g, 'torre-suporte', b.x, heightAt(b.x, b.z), b.z, giro);
    const caida = por(g, 'torre-suporte-caida', b.x, heightAt(b.x, b.z), b.z, giro);
    for (const m of [dePe, caida]) {
      if (!m) continue;
      m.scale.setScalar(ESCALA_TORRE_SUPORTE);
      pintar(m, 'neon_objetivo', ambar);
    }
    if (caida) caida.visible = false;
    torres.set(b.id, { dePe, caida, ambar, nucleo: no(dePe, 'suporte_nucleo'), estado: 'espera' });
  }
  return torres;
}

/** Plataformas de pouso de ouro (P0/P1): deque âmbar e o feixe com alguém pousado. */
function montarPlataformas(g) {
  const plats = new Map();
  for (const p of PLATAFORMAS_POUSO) {
    const a = AREAS_POUSO.find((x) => x.plataforma === p.id);
    const y = heightAt(p.x, p.z) + a.piso;
    const ambar = neon(CORES.objetivo, OBJ_APAGADO);
    const m = por(g, 'plataforma-pouso', p.x, y, p.z, p.time === 0 ? 0 : Math.PI);
    if (m) pintar(m, 'neon_objetivo', ambar);
    const feixe = criarFeixe(CORES.objetivo, FEIXE_PLATAFORMA.raio, FEIXE_PLATAFORMA.altura, 0.3);
    feixe.position.set(p.x, y + FEIXE_PLATAFORMA.base, p.z);
    feixe.visible = false;
    g.add(feixe);
    plats.set(p.id, { m, ambar, feixe, estado: 'espera', quem: null, contestado: false });
  }
  return plats;
}

/** Núcleo de He-3 (poço de cima): os nós que giram e os materiais que acendem. */
function montarNucleo(g) {
  const m = por(g, 'nucleo', NUCLEO.x, 0, NUCLEO.z, 0);
  if (!m) return null;
  const ambar = neon(CORES.objetivo, OBJ_APAGADO);
  const he3 = neon(CORES.minerio, 0.35);
  pintar(m, 'neon_objetivo', ambar);
  pintar(m, 'neon_he3', he3);
  return {
    m,
    ambar,
    he3,
    cristal: no(m, 'nucleo_cristal'),
    lascas: no(m, 'nucleo_lascas'),
    aneis: [1, 2, 3].map((i) => no(m, `nucleo_anel_${i}`)),
    estado: 'espera',
    vida: 1,
    giro: NUCLEO_GIRO_PARADO,
  };
}

// ---------- Decoração ----------

/** O ponto serve para decoração? Campo aberto com folga, longe de base, lane, acampamento e objetivo. */
function lugarLivre(x, z, { folga = 30, foraDaLane = true } = {}) {
  for (const [dx, dz] of [[0, 0], [folga, 0], [-folga, 0], [0, folga], [0, -folga]]) if (!noMapaAberto(x + dx, z + dz)) return false;
  if (Math.abs(x) > 1060) return false; // bocas e bolsões das bases
  if (foraDaLane && Math.abs(z - LANE.z) < LANE.meiaLargura + 40) return false;
  if (ACAMPAMENTOS.some((a) => Math.hypot(x - a.x, z - a.z) < a.raio + 25)) return false;
  if ([...BUFFS, ...PLATAFORMAS_POUSO].some((b) => Math.hypot(x - b.x, z - b.z) < 60)) return false;
  if (OBSTACULOS.some((o) => Math.hypot(x - o.x, z - o.z) < (o.alcance ?? 10) + 25)) return false;
  return true;
}

/**
 * Decoração do lago, simétrica pela rotação de 180° (cada ponto sai com o par girado):
 * pedras que furam a água (até 2,5 m acima do chão de voo: a nave passa por cima),
 * pedras submersas, as ruínas, e corais, algas e cristais de He-3 no fundo.
 * Devolve os sólidos que furam a água (espuma) e os cristais (brilho na água).
 */
function montarDecoracao(g) {
  const rnd = mulberry32(SEMENTE_DECORACAO);
  const furam = [];
  const cristais = [];
  const pares = (n, opcoes, fazer) => {
    let feitos = 0;
    for (let t = 0; t < n * 60 && feitos < n; t++) {
      const x = (rnd() * 2 - 1) * 1060;
      const z = (rnd() * 2 - 1) * 1040;
      if (!lugarLivre(x, z, opcoes) || !lugarLivre(-x, -z, opcoes)) continue;
      const giro = rnd() * Math.PI * 2;
      const escala = 0.75 + rnd() * 0.5;
      fazer(x, z, giro, escala);
      fazer(-x, -z, giro + Math.PI, escala);
      feitos++;
    }
  };
  pares(7, { folga: 40 }, (x, z, giro, k) => {
    const m = por(g, 'pedra-lago-1', x, 0, z, giro);
    if (!m) return;
    m.scale.set(k, 1, k);
    furam.push({ x, z, raio: 15 * k });
  });
  pares(5, { folga: 30, foraDaLane: false }, (x, z, giro, k) => por(g, 'pedra-lago-2', x, 0, z, giro, { sombra: false })?.scale.set(k, 1, k));
  por(g, 'ruina-submersa', -420, 0, 640, 0, { sombra: false });
  por(g, 'ruina-submersa', 420, 0, -640, Math.PI, { sombra: false });
  // Corais, algas e cristais: instanciados (muitos, pequenos, embaixo d'água).
  const lugares = { coral: [], alga: [], 'cristais-he3': [] };
  pares(12, { folga: 15, foraDaLane: false }, (x, z, giro, k) => lugares.coral.push({ x, z, giro, k }));
  pares(12, { folga: 15, foraDaLane: false }, (x, z, giro, k) => lugares.alga.push({ x, z, giro, k }));
  pares(9, { folga: 15, foraDaLane: false }, (x, z, giro, k) => {
    lugares['cristais-he3'].push({ x, z, giro, k });
    cristais.push({ x, z });
  });
  const fundo = FUNDO_LAGO - 3;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const eixoY = new THREE.Vector3(0, 1, 0);
  for (const [nome, lista] of Object.entries(lugares)) {
    if (!lista.length) continue;
    for (const { geometria, material } of partesDoModelo(nome)) {
      const inst = new THREE.InstancedMesh(geometria, material, lista.length);
      lista.forEach((l, i) => {
        q.setFromAxisAngle(eixoY, l.giro);
        inst.setMatrixAt(i, m.compose(new THREE.Vector3(l.x, fundo, l.z), q, new THREE.Vector3(l.k, l.k, l.k)));
      });
      inst.receiveShadow = true;
      g.add(inst);
    }
  }
  return { furam, cristais };
}

// ---------- Cena ----------

/**
 * Monta a cena inteira. Retorna { scene, atualizar(dt, foco), definirObjetivo(id,
 * estado), definirMineracao(n), definirBacias(placar, descargas), atingirCampo(time,
 * x, y, z) }: foco é o ponto (nave do jogador) que a sombra, o céu, as gotículas e o
 * aviso do campo de força acompanham; definirObjetivo recebe o estado de cada
 * objetivo do snapshot (obj[id]) e acende, apaga, derruba ou gira a peça dele;
 * definirMineracao diz quantos mineradores estão minerando (o He-3 da mineradora
 * brilha mais); definirBacias recebe o placar ({0: n, 1: n}: a altura do minério em
 * cada bacia) e os mineradores despejando agora ([{x, y, z, time}]: o minério cai
 * deles); atingirCampo abre um anel no campo de força da base `time` onde o tiro bateu.
 * `meuTime` decide as cores relativas (o seu time turquesa, o outro vermelho).
 * Os modelos já têm de estar no cache (tela de carregamento).
 */
export function criarCena({ meuTime = 0 } = {}) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(CORES.neblina, 280, 1500); // a névoa de guerra ajusta ao raio de visão
  scene.background = CORES.horizonte.clone();

  const ceu = criarCeu();
  scene.add(ceu);
  const mapa = new THREE.Group();
  scene.add(mapa);
  montarRochas(mapa);
  montarMineradora(mapa, meuTime);
  const bases = BASES.map((b) => montarBase(mapa, b, meuTime));
  const torres = montarTorres(mapa);
  const plataformas = montarPlataformas(mapa);
  const nucleo = montarNucleo(mapa);
  const deco = montarDecoracao(mapa);
  const despejo = criarDespejo();
  mapa.add(despejo.malha);

  // A água por cima de tudo o que é do fundo: brilho de He-3 sobre a mineradora, o
  // Núcleo e os veios de cristal; espuma nas pedras que furam a água.
  const agua = criarAgua({
    geometria: partesDoModelo('agua')[0]?.geometria ?? null,
    texturas: texturasPbr('agua'),
    ceu: { topo: CORES.ceuTopo, meio: CORES.ceuMeio, horizonte: CORES.horizonte, halo: CORES.halo },
    solDir: SOL_DIR,
    pontosHe3: [
      { x: 0, z: 0, raio: 260, forca: 0.22 },
      { x: NUCLEO.x, z: NUCLEO.z, raio: 110, forca: 0.25 },
      ...deco.cristais.slice(0, 6).map((c) => ({ x: c.x, z: c.z, raio: 35, forca: 0.14 })),
    ],
    // O tanque da bacia fura a água (espuma em volta) e por dentro ela não existe.
    extras: [...deco.furam, ...BACIAS.map((b) => ({ x: b.x, z: b.z, raio: b.raio }))],
    buracos: BACIAS.map((b) => ({ x: b.x, z: b.z, raio: b.raioInterno })),
  });
  scene.add(agua);
  const poeira = criarPoeira();
  scene.add(poeira);
  // Nuvens de gás e poeira nos campos que escondem; a névoa de guerra (nevoa.js)
  // entrega a grade dela por scene.userData.usarNevoa.
  const nuvens = criarNuvens({ solDir: SOL_DIR, tempo: TEMPO_AGUA });
  scene.add(nuvens.grupo);
  scene.userData.usarNevoa = nuvens.usarNevoa;

  scene.add(new THREE.HemisphereLight(HEMI_CEU, HEMI_CHAO, HEMI_INTENSIDADE));
  const sol = new THREE.DirectionalLight(SOL_COR, SOL_INTENSIDADE);
  sol.castShadow = true;
  sol.shadow.mapSize.set(2048, 2048);
  const sc = sol.shadow.camera;
  sc.left = sc.bottom = -120;
  sc.right = sc.top = 120;
  sc.near = 10;
  sc.far = 900;
  sol.shadow.bias = -0.0008;
  sol.shadow.normalBias = 0.6;
  scene.add(sol, sol.target);

  let tempo = 0;
  let minerando = 0;
  let he3Atual = HE3_MIN;
  let descargas = [];
  let impacto = 0; // próximo anel de impacto a reusar, por campo

  function atualizar(dt, foco) {
    tempo += dt;
    TEMPO_AGUA.value = tempo;
    ceu.position.copy(foco);
    sol.position.copy(foco).addScaledVector(SOL_DIR, 500);
    sol.target.position.copy(foco);
    // As gotículas "dão a volta" num cubo de 160 m em torno do foco.
    const p = poeira.geometry.attributes.position;
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

    // He-3 "respira"; com minerador minerando, a mineradora acende mais.
    const alvoHe3 = minerando > 0 ? HE3_MAX : HE3_MIN + 0.2;
    he3Atual += (alvoHe3 - he3Atual) * (1 - Math.exp(-2 * dt));
    const respira = he3Atual * (0.82 + 0.18 * Math.sin(tempo * 1.3));
    const he3 = materialDoMapa('neon_he3');
    if (he3) he3.emissiveIntensity = respira;
    agua.userData.material.uniforms.uHe3Pulso.value = 0.6 + 0.4 * (respira / HE3_MAX);

    // Bases: a ilha do portal boia devagar e o feixe da broca pulsa.
    for (const b of bases) {
      if (b.portal) b.portal.position.y = Math.sin((tempo / PORTAL_BOIA_S) * Math.PI * 2 + b.base.time * 2) * PORTAL_BOIA_M;
      if (b.feixe) b.feixe.material.opacity = 0.22 + 0.1 * Math.sin(tempo * 1.7);
      b.neon.emissiveIntensity = 0.85 + 0.15 * Math.sin(tempo * 2 + b.base.time);
      if (b.campo) b.campo.uniforms.uFoco.value.copy(foco);
      // O minério acumulado anda até o nível do placar.
      const m = b.minerio;
      if (m) {
        m.nivel += (m.alvo - m.nivel) * (1 - Math.exp(-BACIA_SUBIDA * dt));
        m.no.position.y = topoMinerio(m, m.nivel) - MINERIO_TOPO;
      }
    }
    // Despejo: cada minerador despejando solta cristais do contêiner até o minério.
    for (const d of descargas) {
      const m = bases[d.time]?.minerio;
      const chao = m ? topoMinerio(m, m.nivel) : BACIA.fundo;
      let n = DESPEJO_POR_S * dt;
      while (n > 0) {
        if (n >= 1 || Math.random() < n) despejo.soltar(d.x, d.y - 1.2, d.z, chao);
        n--;
      }
    }
    despejo.atualizar(dt);

    // Torres de suporte: a antena do alto gira e o âmbar pulsa enquanto a torre está acesa.
    for (const t of torres.values()) {
      if (t.estado !== 'ativo') continue;
      t.ambar.emissiveIntensity = 0.8 + 0.2 * Math.sin(tempo * 3);
      if (t.nucleo) t.nucleo.rotation.y += dt * 1.2;
    }

    // Plataformas: feixe com alguém pousado (contestado pisca); acesa e livre, o âmbar pulsa.
    for (const pl of plataformas.values()) {
      if (pl.feixe.visible) pl.feixe.material.opacity = pl.contestado ? (Math.sin(tempo * 14) > 0 ? 0.4 : 0.1) : 0.24 + 0.08 * Math.sin(tempo * 5);
      else if (pl.estado === 'ativo') pl.ambar.emissiveIntensity = 0.75 + 0.25 * Math.sin(tempo * 2.4);
    }

    // Núcleo: anéis cada um num eixo, lascas em órbita, cristal girando devagar.
    if (nucleo) {
      const ativo = nucleo.estado === 'ativo';
      const alvo = ativo ? NUCLEO_GIRO_VIVO + (1 - nucleo.vida) * NUCLEO_GIRO_FERIDO : NUCLEO_GIRO_PARADO;
      nucleo.giro += (alvo - nucleo.giro) * (1 - Math.exp(-1.5 * dt));
      const w = nucleo.giro * dt;
      const [a1, a2, a3] = nucleo.aneis;
      a1?.rotateY(w);
      a2?.rotateX(w * 0.8);
      a3?.rotateZ(w * 1.2);
      if (nucleo.lascas) nucleo.lascas.rotation.y += w * 0.7;
      if (nucleo.cristal) {
        nucleo.cristal.rotation.y += w * 0.4;
        nucleo.cristal.position.y = 18 + (ativo ? Math.sin(tempo * 1.1) * 0.6 : 0);
      }
      nucleo.he3.emissiveIntensity = ativo ? 0.85 + 0.25 * Math.sin(tempo * (2 + (1 - nucleo.vida) * 4)) : 0.3;
      nucleo.ambar.emissiveIntensity = ativo ? 0.9 : OBJ_APAGADO;
    }

    // Dentro de uma nuvem as gotículas viram poeira do gás: mais densas e maiores.
    const dentro = nuvens.atualizar(dt, foco);
    poeira.material.opacity = POEIRA_OPACIDADE + (POEIRA_DENTRO.opacidade - POEIRA_OPACIDADE) * dentro;
    poeira.material.size = POEIRA_TAMANHO + (POEIRA_DENTRO.tamanho - POEIRA_TAMANHO) * dentro;
    poeira.material.color.copy(CORES.poeira).lerp(POEIRA_DENTRO.cor, dentro);
  }

  /**
   * Estado de um objetivo (obj[id] do snapshot) no cenário: torre de suporte
   * apagada em 'espera', acesa em 'ativo' e caída em 'recarga'; plataforma acesa em
   * 'ativo', com o feixe na cor do time que está pousado (`quem`; âmbar piscando se
   * contestado); Núcleo girando e brilhando em 'ativo', parado e apagado fora dele.
   * Os outros (BA, SONDA, MEDUSA) são monstros: o cenário não muda.
   */
  function definirObjetivo(id, r) {
    if (!r) return;
    const t = torres.get(id);
    if (t) {
      t.estado = r.estado;
      const caida = r.estado === 'recarga';
      if (t.dePe) t.dePe.visible = !caida;
      if (t.caida) t.caida.visible = caida;
      t.ambar.emissiveIntensity = r.estado === 'ativo' ? OBJ_ACESO : OBJ_APAGADO;
      return;
    }
    const p = plataformas.get(id);
    if (p) {
      p.estado = r.estado;
      p.quem = r.quem ?? null;
      p.contestado = !!r.contestado;
      p.feixe.visible = r.estado === 'ativo' && r.quem != null;
      if (p.feixe.visible) p.feixe.material.color.copy(p.contestado ? CORES.objetivo : r.quem === meuTime ? CORES.neon : CORES.perigo);
      p.ambar.emissiveIntensity = r.estado === 'ativo' ? OBJ_ACESO : OBJ_APAGADO;
      return;
    }
    if (id === 'NUCLEO' && nucleo) {
      nucleo.estado = r.estado;
      nucleo.vida = r.estado === 'ativo' ? (r.vida ?? 1) : 1;
    }
  }

  /** Quantos mineradores estão minerando agora (o He-3 da mineradora acende mais). */
  function definirMineracao(n) {
    minerando = n;
  }

  /** Placar de cada time (altura do minério na bacia) e os mineradores despejando agora. */
  function definirBacias(placar, lista = []) {
    for (const b of bases) if (b.minerio) b.minerio.alvo = 1 - Math.exp(-Math.max(0, placar?.[b.base.time] ?? 0) / BACIA_ESCALA);
    descargas = lista;
  }

  /** Tiro bateu no campo de força da base do `time` em (x, y, z): um anel se abre ali. */
  function atingirCampo(time, x, y, z) {
    const campo = bases[time]?.campo;
    if (!campo) return;
    campo.uniforms.uImpactos.value[impacto].set(x, y, z, tempo);
    impacto = (impacto + 1) % CAMPO_IMPACTOS;
  }

  return { scene, atualizar, definirObjetivo, definirMineracao, definirBacias, atingirCampo };
}

/**
 * Libera da GPU tudo o que a cena usa (geometrias, materiais, texturas e o mapa de
 * sombra do sol). Chamado ao sair da partida: cada entrada monta uma cena nova, e
 * sem isto a memória de vídeo cresceria a cada sair/entrar. Geometrias, materiais e
 * texturas compartilhados (os modelos do mapa em cache, o brilho de nave.js) podem
 * ser liberados sem medo: o Three.js os envia de novo na próxima vez que forem
 * desenhados.
 */
export function liberarCena(scene) {
  scene.traverse((o) => {
    o.geometry?.dispose();
    const materiais = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of materiais) {
      for (const v of Object.values(m)) if (v?.isTexture) v.dispose();
      if (m.uniforms) for (const u of Object.values(m.uniforms)) if (u?.value?.isTexture) u.value.dispose();
      m.dispose();
    }
    o.shadow?.dispose();
  });
  scene.clear();
}
