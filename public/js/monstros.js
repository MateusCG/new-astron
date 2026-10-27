// Monstros da jungle no cliente: os modelos do AstroN original (public/modelos/monstros/,
// exceção do guia visual por decisão do Mateus; LISTA.md e PESQUISA-MONSTROS.md da
// frente Monstros). Quem decide tudo (vida, alvo, ataques) é o servidor
// (server/jungle.js); o snapshot traz cada um como entidade { tipo: 'monstro', esp }
// e aqui só se desenha.
//
// - Os glb já vêm na escala do jogo, com a origem no centro da caixa e a frente em −z
//   (a das naves no jogo): é só pôr no lugar e aplicar o yaw. Material dentro do
//   guia (facetado, sem metal), com a textura do original e o recorte (MASK) das asas
//   e tentáculos.
// - O SN-3 e o SN-Zero VI (os pequenos dos acampamentos da base, do Stage M5) trazem
//   no glb a animação do original ("STAND": as asas do SN-3 batendo, a cauda do
//   SN-Zero VI ondulando e o cone de luz dele pulsando, quadro a quadro do .3dx, 24
//   por segundo; tools/monstros_do_original.py): ela toca em laço (AnimationMixer, um
//   por monstro, cada um numa fase) e eles não ganham o balanço inventado. O cone de
//   luz (material `extras.aditivo` no glb) é desenhado aditivo, como os efeitos do
//   original.
// - A Medusa é a do original com o esqueleto: a pele (112 ossos, até 4 por vértice) e
//   os movimentos do .eff dela (tools/monstros_do_original.py): parada, toca o laço
//   STAND (os tentáculos e os braços com garras ondulando) e, quando aparece no poço,
//   SOBE DA ÁGUA como no original (STAND02 → 03 → 04: ela nasce ~85 m abaixo, o alfa
//   abre no STAND02, e emenda no STAND; surgirMonstro). O original usava esses
//   movimentos no teletransporte, que aqui não existe (decisão do Mateus). Fica com o
//   centro a MEDUSA_CENTRO m (a física põe todo monstro na altura de voo; ela é
//   desenhada mais alta, com os tentáculos chegando na água), sem o balanço inventado.
// - As outras espécies sobem e descem devagar e balançam de leve (os modelos são a pose
//   parada, sem ossos); a sonda zumbe mais rápido.
// - O SN-4 (chefe do buff de ataque) é desenhado ESCALA_MONSTRO.sn4 = 2× o glb (60 m
//   de comprimento), casando com o raio de acerto dobrado do servidor
//   (server/especies.js); o centro sobe para CENTRO_MONSTRO.sn4, para a quilha não
//   entrar na água (NIVEL_AGUA) com o casco dobrado.
// - Em volta da Medusa nascem, crescem e somem as manchas de sangue e as bolhas do
//   original (BOSS_BLOOD e BOSS_BUBBLE do effectevent.txt), só decoração.
// - O perigo continua no vermelho da interface: rótulo, barra e ponto do minimapa
//   (PONTO_MONSTRO, maior quanto mais perigoso) ficam no hud.js.

import * as THREE from 'three';
import { HOVER } from '/shared/sim.js';
import { clone as clonarComOssos } from 'three/addons/utils/SkeletonUtils.js';
import { PASTA_MODELOS_MONSTRO, ESPECIES_MONSTRO } from './insumos.js';

/** Tamanho do ponto de cada espécie no minimapa (px): quanto mais perigoso, maior. */
export const PONTO_MONSTRO = { sonda: 3, sn3: 3.5, snzero: 3.5, xerxes: 4, bazit: 4, great_xerxes: 5.5, anti: 5.5, sn4: 7.5, medusa: 8 };
/** Tamanho da explosão da morte de cada espécie (efeitos.explosao). */
export const EXPLOSAO_MONSTRO = { sonda: 2, sn3: 3, snzero: 4, xerxes: 3, bazit: 3, great_xerxes: 5, anti: 5, sn4: 12, medusa: 10 };
/**
 * Quanto o rótulo (nome e barra) de cada espécie sobe além do de uma nave: os
 * grandes têm o alto bem acima do centro (a Medusa, desenhada mais alta, mais ainda).
 */
export const ROTULO_MONSTRO = { sonda: 0, sn3: 1, snzero: 4, xerxes: 1, bazit: 2, great_xerxes: 5, anti: 1, sn4: 34, medusa: 32 };
/** Altura do centro da Medusa acima do chão de voo (m). */
export const MEDUSA_CENTRO = 18;
/** Escala do glb por espécie (1 nas que não estão aqui): o SN-4 é o dobro do original. */
export const ESCALA_MONSTRO = { sn4: 2 };
/** Altura do centro acima do chão de voo (m) das espécies desenhadas fora da altura de voo (HOVER). */
export const CENTRO_MONSTRO = { medusa: MEDUSA_CENTRO, sn4: 16 };
/** Balanço de cada espécie: subida e descida (m), frequência (rad/s) e balanço lateral (rad). */
const BALANCO = {
  sonda: { sobe: 0.6, freq: 6, rola: 0.15 },
  sn3: { sobe: 0, freq: 0, rola: 0 }, // a animação do original já mexe tudo
  snzero: { sobe: 0, freq: 0, rola: 0 },
  xerxes: { sobe: 0.8, freq: 2.6, rola: 0.12 },
  great_xerxes: { sobe: 1.2, freq: 1.8, rola: 0.08 },
  bazit: { sobe: 0.8, freq: 2.4, rola: 0.14 },
  anti: { sobe: 0.6, freq: 1.4, rola: 0.05 },
  sn4: { sobe: 2.0, freq: 0.7, rola: 0.03 }, // o dobro do tamanho: balança mais alto e mais devagar
  medusa: { sobe: 0, freq: 0, rola: 0 }, // o laço do original já mexe tudo
};
/**
 * Subida da água (os movimentos do original, na ordem) e quanto do começo dela o alfa
 * leva para abrir (o STAND02 inteiro: 24 quadros, de 0 a 1 de 0,05 em 0,05).
 */
const SUBIDA = ['STAND02', 'STAND03', 'STAND04'];
const SUBIDA_ALFA_S = 1;
/** Efeitos em volta da Medusa: até quantos ao mesmo tempo, a cada quanto nasce um, e o raio (m). */
const MEDUSA_FX = { max: 12, intervaloS: 0.35, raioSangue: 17, raioBolha: 15 };

let carregador = null;
const pedidos = new Map(); // nome -> Promise
const prontos = new Map(); // nome -> THREE.Object3D preparado

/**
 * Material do monstro no guia: facetado, sem metal, a textura do original e o recorte.
 * Peça de luz do original (`extras.aditivo` no glb: o cone de luz do SN-Zero VI): luz
 * aditiva sem sombra, como os efeitos do original (fundo preto = transparente).
 */
function prepararMaterial(m) {
  if (m.userData?.aditivo) {
    const luz = new THREE.MeshBasicMaterial({
      map: m.map ?? null,
      color: m.color ?? 0xffffff,
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    luz.name = m.name;
    luz.userData.aditivo = true;
    return luz;
  }
  const mat = new THREE.MeshStandardMaterial({
    map: m.map ?? null,
    color: m.color ?? 0xffffff,
    metalness: 0,
    roughness: 0.6,
    flatShading: true,
    side: THREE.DoubleSide,
    alphaTest: m.alphaTest || (m.transparent ? 0.5 : 0),
  });
  if (m.alphaTest) mat.alphaTest = m.alphaTest;
  mat.name = m.name;
  return mat;
}

/** Baixa e prepara o modelo de uma espécie ou efeito (uma vez por página). */
export function carregarMonstro(nome) {
  if (!pedidos.has(nome)) {
    const p = (async () => {
      carregador ??= new (await import('three/addons/loaders/GLTFLoader.js')).GLTFLoader();
      const gltf = await carregador.loadAsync(`${PASTA_MODELOS_MONSTRO}${nome}.glb`);
      const raiz = gltf.scene;
      raiz.traverse((o) => {
        if (!o.isMesh) return;
        o.material = Array.isArray(o.material) ? o.material.map(prepararMaterial) : prepararMaterial(o.material);
        o.castShadow = ![o.material].flat().some((mat) => mat.userData.aditivo);
      });
      raiz.userData.clipes = gltf.animations ?? []; // a animação do original (SN-3, SN-Zero VI, Medusa)
      raiz.userData.comOssos = false;
      raiz.traverse((o) => {
        if (o.isSkinnedMesh) raiz.userData.comOssos = true;
      });
      prontos.set(nome, raiz);
      return raiz;
    })();
    p.catch(() => pedidos.delete(nome));
    pedidos.set(nome, p);
  }
  return pedidos.get(nome);
}

/** Texturas dos monstros prontos (a tela de carregamento as envia à placa antes da partida). */
export function texturasDosMonstros() {
  const lista = new Set();
  for (const m of prontos.values()) m.traverse((o) => o.isMesh && o.material.map && lista.add(o.material.map));
  return [...lista];
}

const GEO_LUGAR = new THREE.OctahedronGeometry(1, 0);
let matLugar = null;

/** Monta o modelo dentro do corpo (ou o losango vermelho enquanto ele não chega). */
function montar(raiz, modelo) {
  const { corpo } = raiz.userData;
  if (raiz.userData.casco) corpo.remove(raiz.userData.casco);
  let casco;
  // Malha com pele (a Medusa) precisa clonar o esqueleto junto; e o material é só dela
  // (o alfa abre na subida da água).
  if (modelo?.userData.comOssos) {
    casco = clonarComOssos(modelo);
    casco.traverse((o) => {
      if (o.isMesh) o.material = o.material.clone();
    });
  } else if (modelo) casco = modelo.clone(true);
  else {
    matLugar ??= new THREE.MeshStandardMaterial({ color: '#ff4a2a', emissive: '#ff4a2a', emissiveIntensity: 0.9, flatShading: true });
    casco = new THREE.Mesh(GEO_LUGAR, matLugar);
    casco.scale.set(3, 2, 4);
  }
  casco.scale.multiplyScalar(ESCALA_MONSTRO[raiz.userData.esp] ?? 1);
  corpo.add(casco);
  raiz.userData.casco = casco;
  // Animação do original em laço (STAND), começando num quadro qualquer (o acampamento
  // não bate as asas junto).
  const clipes = modelo?.userData.clipes ?? [];
  const clipe = clipes.find((c) => c.name === 'STAND') ?? clipes[0];
  raiz.userData.mixer = null;
  raiz.userData.clipes = clipes;
  if (clipe) {
    const mixer = new THREE.AnimationMixer(casco);
    const acao = mixer.clipAction(clipe);
    acao.play();
    acao.time = Math.random() * clipe.duration;
    raiz.userData.mixer = mixer;
    raiz.userData.parado = acao;
  }
  if (raiz.userData.subirAoMontar) surgirMonstro(raiz);
}

/**
 * O monstro sobe da água como no original (a Medusa: STAND02, 03 e 04 em seguida, o
 * alfa abrindo no STAND02, e o laço STAND no fim). Sem os movimentos (ou com o modelo
 * ainda chegando), sobe quando o modelo montar.
 */
export function surgirMonstro(raiz) {
  const ud = raiz.userData;
  const clipes = SUBIDA.map((n) => ud.clipes?.find((c) => c.name === n));
  if (!ud.mixer || clipes.some((c) => !c)) {
    ud.subirAoMontar = !ud.casco || ud.casco.isMesh; // ainda o losango: espera o modelo
    return;
  }
  ud.subirAoMontar = false;
  const mixer = ud.mixer;
  mixer.stopAllAction();
  const acoes = clipes.map((c) => {
    const a = mixer.clipAction(c);
    a.setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = true;
    return a;
  });
  let i = 0;
  acoes[0].reset().play();
  const proxima = (ev) => {
    if (ev.action !== acoes[i]) return;
    acoes[i].stop();
    i++;
    if (i < acoes.length) acoes[i].reset().play();
    else {
      mixer.removeEventListener('finished', proxima);
      ud.parado?.reset().play();
    }
  };
  mixer.addEventListener('finished', proxima);
  ud.subida = { t: 0 };
  alfaDoCasco(ud.casco, 0);
}

/** Alfa do casco (subida da água): `k` 0 some, 1 normal (sólido de novo). */
function alfaDoCasco(casco, k) {
  casco?.traverse((o) => {
    if (!o.isMesh || o.material.userData.aditivo) return;
    o.material.transparent = k < 1;
    o.material.depthWrite = k >= 1;
    o.material.opacity = k;
  });
}

/**
 * Monstro da espécie `esp` (chave do protocolo). userData: corpo (o que balança),
 * esp, e na Medusa a lista dos efeitos em volta. Se o modelo ainda não chegou (não
 * deveria: a tela de carregamento baixa todos), um losango vermelho segura o lugar.
 */
export function criarMonstro(esp) {
  const raiz = new THREE.Group();
  const corpo = new THREE.Group();
  raiz.add(corpo);
  raiz.userData = { corpo, esp, casco: null, fxMedusa: [], accFx: 0 };
  if (CENTRO_MONSTRO[esp]) corpo.position.y = CENTRO_MONSTRO[esp] - HOVER;
  const pronto = prontos.get(esp);
  montar(raiz, pronto ?? null);
  if (!pronto && ESPECIES_MONSTRO.includes(esp)) {
    carregarMonstro(esp)
      .then((m) => montar(raiz, m))
      .catch((err) => console.error('Falha ao carregar o monstro', esp, err));
  }
  return raiz;
}

// Sangue e bolhas da Medusa: cada um tem material próprio (esmaece sozinho) e
// transparente (outro shader, nas duas faces), então saem de uma reserva e voltam
// para ela ao sumir, em vez de clonar e liberar a cada 0,35 s; a tela de
// carregamento monta um de cada (prepararFxMedusa) para o shader já estar pronto.
const reservaFxMedusa = { 'medusa-sangue': [], 'medusa-bolha': [] };

/** Um efeito da Medusa da reserva (ou clonado do modelo), com material próprio transparente. */
function pegarFxMedusa(nome) {
  const guardado = reservaFxMedusa[nome].pop();
  if (guardado) return guardado;
  const modelo = prontos.get(nome);
  if (!modelo) return null;
  const m = modelo.clone(true);
  m.traverse((o) => {
    if (!o.isMesh) return;
    o.material = o.material.clone();
    o.material.transparent = true;
    o.material.depthWrite = false;
    o.castShadow = false;
  });
  m.userData.fxMedusa = nome;
  return m;
}

/** Uma mancha de sangue ou bolha nova em volta da Medusa (cresce e some); `sangue` escolhe, senão sorteia. */
function nascerFxMedusa(raiz, sangue = Math.random() < 0.5) {
  const m = pegarFxMedusa(sangue ? 'medusa-sangue' : 'medusa-bolha');
  if (!m) return;
  m.traverse((o) => o.isMesh && (o.material.opacity = 1));
  const raio = (sangue ? MEDUSA_FX.raioSangue : MEDUSA_FX.raioBolha) * Math.sqrt(Math.random());
  const ang = Math.random() * Math.PI * 2;
  m.position.set(Math.cos(ang) * raio, (Math.random() - 0.4) * 22, Math.sin(ang) * raio);
  m.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI * 2, 0);
  raiz.userData.corpo.add(m);
  raiz.userData.fxMedusa.push({
    m,
    vida: 0,
    dur: sangue ? 1.5 + Math.random() * 0.5 : 3.5,
    cresce: sangue ? 3 + Math.random() * 4 : 2 + Math.random() * 2,
    sobe: sangue ? 0 : 3,
    escala: sangue ? 6 : 3,
  });
}

/** Põe um sangue e uma bolha na Medusa (aquecimento da placa de vídeo, carregamento.js). */
export function prepararFxMedusa(raiz) {
  nascerFxMedusa(raiz, true);
  nascerFxMedusa(raiz, false);
}

/** Anima o monstro (chamar a cada quadro): a animação do original, o balanço da espécie, a subida da água e, na Medusa, os efeitos em volta. */
export function animarMonstro(raiz, t, dt, fase = 0) {
  const ud = raiz.userData;
  ud.mixer?.update(dt);
  const b = BALANCO[ud.esp] ?? BALANCO.xerxes;
  const base = CENTRO_MONSTRO[ud.esp] ? CENTRO_MONSTRO[ud.esp] - HOVER : 0;
  ud.corpo.position.y = base + Math.sin(t * b.freq + fase) * b.sobe;
  ud.corpo.rotation.z = Math.sin(t * b.freq * 0.5 + fase * 1.7) * b.rola;
  if (ud.subida) {
    ud.subida.t += dt;
    const k = Math.min(1, ud.subida.t / SUBIDA_ALFA_S);
    alfaDoCasco(ud.casco, k);
    if (k >= 1) ud.subida = null;
  }
  if (ud.esp !== 'medusa' || !ud.casco) return;
  ud.accFx += dt;
  while (ud.accFx >= MEDUSA_FX.intervaloS) {
    ud.accFx -= MEDUSA_FX.intervaloS;
    if (ud.fxMedusa.length < MEDUSA_FX.max) nascerFxMedusa(raiz);
  }
  ud.fxMedusa = ud.fxMedusa.filter((f) => {
    f.vida += dt;
    const k2 = f.vida / f.dur;
    if (k2 >= 1) {
      f.m.parent?.remove(f.m);
      reservaFxMedusa[f.m.userData.fxMedusa]?.push(f.m);
      return false;
    }
    f.m.scale.setScalar(f.escala * (1 + f.cresce * k2));
    f.m.position.y += f.sobe * dt;
    f.m.traverse((o) => o.isMesh && (o.material.opacity = 1 - k2 * k2));
    return true;
  });
}

/**
 * Marcador da entidade do Núcleo de He-3: o desenho é o modelo do cenário (cena.js),
 * então a entidade só segura o lugar (o rótulo com a barra de vida vai em cima dela).
 */
export function criarMarcadorNucleo() {
  const raiz = new THREE.Group();
  const corpo = new THREE.Group();
  raiz.add(corpo);
  raiz.userData = { corpo };
  return raiz;
}
