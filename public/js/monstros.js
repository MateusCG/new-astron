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
// - Cada espécie sobe e desce devagar e balança de leve (os modelos são a pose parada,
//   sem ossos); a sonda zumbe mais rápido; a Medusa "respira" (a cúpula estica) e
//   fica com o centro a MEDUSA_CENTRO m (a física põe todo monstro na altura de voo;
//   ela é desenhada mais alta, com os tentáculos chegando na água).
// - Em volta da Medusa nascem, crescem e somem as manchas de sangue e as bolhas do
//   original (BOSS_BLOOD e BOSS_BUBBLE do effectevent.txt), só decoração.
// - O perigo continua no vermelho da interface: rótulo, barra e ponto do minimapa
//   (PONTO_MONSTRO, maior quanto mais perigoso) ficam no hud.js.

import * as THREE from 'three';
import { HOVER } from '/shared/sim.js';
import { PASTA_MODELOS_MONSTRO, ESPECIES_MONSTRO } from './insumos.js';

/** Tamanho do ponto de cada espécie no minimapa (px): quanto mais perigoso, maior. */
export const PONTO_MONSTRO = { sonda: 3, armish: 3.5, chrometic: 3.5, xerxes: 4, bazit: 4, great_xerxes: 5.5, anti: 5.5, sn4: 6.5, medusa: 8 };
/** Tamanho da explosão da morte de cada espécie (efeitos.explosao). */
export const EXPLOSAO_MONSTRO = { sonda: 2, armish: 2.5, chrometic: 2.5, xerxes: 3, bazit: 3, great_xerxes: 5, anti: 5, sn4: 7, medusa: 10 };
/** Altura do centro da Medusa acima do chão de voo (m). */
export const MEDUSA_CENTRO = 18;
/** Balanço de cada espécie: subida e descida (m), frequência (rad/s) e balanço lateral (rad). */
const BALANCO = {
  sonda: { sobe: 0.6, freq: 6, rola: 0.15 },
  armish: { sobe: 0.5, freq: 2.2, rola: 0.08 },
  chrometic: { sobe: 0.5, freq: 2.0, rola: 0.1 },
  xerxes: { sobe: 0.8, freq: 2.6, rola: 0.12 },
  great_xerxes: { sobe: 1.2, freq: 1.8, rola: 0.08 },
  bazit: { sobe: 0.8, freq: 2.4, rola: 0.14 },
  anti: { sobe: 0.6, freq: 1.4, rola: 0.05 },
  sn4: { sobe: 1.0, freq: 0.9, rola: 0.04 },
  medusa: { sobe: 1.5, freq: 0.7, rola: 0.03 },
};
/** Efeitos em volta da Medusa: até quantos ao mesmo tempo, a cada quanto nasce um, e o raio (m). */
const MEDUSA_FX = { max: 12, intervaloS: 0.35, raioSangue: 17, raioBolha: 15 };

let carregador = null;
const pedidos = new Map(); // nome -> Promise
const prontos = new Map(); // nome -> THREE.Object3D preparado

/** Material do monstro no guia: facetado, sem metal, a textura do original e o recorte. */
function prepararMaterial(m) {
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
        o.castShadow = true;
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
  if (modelo) casco = modelo.clone(true);
  else {
    matLugar ??= new THREE.MeshStandardMaterial({ color: '#ff4a2a', emissive: '#ff4a2a', emissiveIntensity: 0.9, flatShading: true });
    casco = new THREE.Mesh(GEO_LUGAR, matLugar);
    casco.scale.set(3, 2, 4);
  }
  corpo.add(casco);
  raiz.userData.casco = casco;
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
  if (esp === 'medusa') corpo.position.y = MEDUSA_CENTRO - HOVER;
  const pronto = prontos.get(esp);
  montar(raiz, pronto ?? null);
  if (!pronto && ESPECIES_MONSTRO.includes(esp)) {
    carregarMonstro(esp)
      .then((m) => montar(raiz, m))
      .catch((err) => console.error('Falha ao carregar o monstro', esp, err));
  }
  return raiz;
}

/** Uma mancha de sangue ou bolha nova em volta da Medusa (cresce e some). */
function nascerFxMedusa(raiz) {
  const sangue = Math.random() < 0.5;
  const modelo = prontos.get(sangue ? 'medusa-sangue' : 'medusa-bolha');
  if (!modelo) return;
  const m = modelo.clone(true);
  // Material próprio para esmaecer sem mexer nos outros.
  m.traverse((o) => {
    if (!o.isMesh) return;
    o.material = o.material.clone();
    o.material.transparent = true;
    o.material.depthWrite = false;
    o.castShadow = false;
  });
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

/** Anima o monstro (chamar a cada quadro): balanço da espécie e, na Medusa, a respiração e os efeitos. */
export function animarMonstro(raiz, t, dt, fase = 0) {
  const ud = raiz.userData;
  const b = BALANCO[ud.esp] ?? BALANCO.armish;
  const base = ud.esp === 'medusa' ? MEDUSA_CENTRO - HOVER : 0;
  ud.corpo.position.y = base + Math.sin(t * b.freq + fase) * b.sobe;
  ud.corpo.rotation.z = Math.sin(t * b.freq * 0.5 + fase * 1.7) * b.rola;
  if (ud.esp !== 'medusa' || !ud.casco) return;
  // A cúpula estica e encolhe devagar, como água-viva nadando.
  const k = Math.sin(t * 1.1 + fase);
  ud.casco.scale.set(1 - 0.03 * k, 1 + 0.05 * k, 1 - 0.03 * k);
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
      f.m.traverse((o) => o.isMesh && o.material.dispose());
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
