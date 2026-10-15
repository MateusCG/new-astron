// Vitrine das naves: a prévia 3D girando na tela de entrada (a primeira nave da raça
// e classe escolhidas) e as miniaturas dos cartões da Evolução.
//
// Um renderer pequeno só para isso (o do jogo é criado ao entrar e ocupa a tela
// inteira), com a mesma luz quente de fim de tarde da cena (cena.js) sobre um fundo
// transparente. Só carrega o modelo que vai mostrar (modeloDaNave, com o cache de
// nave.js): a entrada baixa uma nave, não as 45. As miniaturas das 5 naves da linha
// já saem na tela de carregamento (carregamento.js), para o cartão da Evolução e o
// inventário abrirem sem desenhar nada na hora (cada miniatura é feita uma vez por
// página). Sem WebGL a vitrine fica vazia e a miniatura devolve null (o cartão
// mostra um ícone), sem quebrar a tela.

import * as THREE from 'three';
import { criarNave, definirNave, modeloDaNave } from './nave.js';

const MINIATURA = { largura: 192, altura: 112 };

let palco = null; // { renderer, cena, camera } (null: ainda não criado; false: sem WebGL)
let previa = null; // { container, nave, chave, quadro }
const miniaturas = new Map(); // 'race/classe/tier' -> Promise<string | null>

function montarPalco() {
  if (palco !== null) return palco;
  try {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.setClearColor(0x000000, 0);
    const cena = new THREE.Scene();
    cena.add(new THREE.HemisphereLight('#ffb27a', '#3b1c10', 1.4));
    const sol = new THREE.DirectionalLight('#ffd3a1', 2.6);
    sol.position.set(-6, 10, -4);
    cena.add(sol);
    const contra = new THREE.DirectionalLight('#9fe8ff', 0.6); // recorte frio atrás, para a silhueta
    contra.position.set(5, 3, 8);
    cena.add(contra);
    const camera = new THREE.PerspectiveCamera(30, 1, 0.5, 200);
    palco = { renderer, cena, camera };
    renderer.domElement.className = 'vitrine';
  } catch (err) {
    console.warn('Vitrine sem WebGL:', err);
    palco = false;
  }
  return palco;
}

/** Câmera de três quartos, de cima e da frente, enquadrando uma nave de ~14 m. */
function enquadrar(camera, largura, altura, dist = 24) {
  camera.aspect = largura / altura;
  camera.updateProjectionMatrix();
  camera.position.set(dist * 0.62, dist * 0.42, -dist * 0.66);
  camera.lookAt(0, -0.6, 0);
}

/**
 * Mostra a nave (raça, classe, tier) girando dentro de `container`. Chamar de novo
 * troca a nave sem recriar nada.
 */
export function mostrarPrevia(container, race, classe, tier = 0) {
  const p = montarPalco();
  if (!p) return;
  if (p.renderer.domElement.parentElement !== container) container.append(p.renderer.domElement);
  if (!previa) {
    const nave = criarNave(race, { aliado: true, classe, tier });
    p.cena.add(nave);
    previa = { container, nave, quadro: 0, t0: performance.now() };
  }
  previa.container = container;
  definirNave(previa.nave, race, classe, tier);
  modeloDaNave(race, classe, tier).catch(() => {}); // garante o download (o erro já aparece no console de nave.js)
  if (!previa.quadro) previa.quadro = requestAnimationFrame(girar);
}

function girar(agora) {
  const p = palco;
  if (!previa || !p) return;
  const { container, nave } = previa;
  const w = container.clientWidth;
  const h = container.clientHeight;
  // Fora da tela (entrou no jogo): para de desenhar.
  if (!w || !h) {
    previa.quadro = 0;
    return;
  }
  const canvas = p.renderer.domElement;
  if (canvas.width !== Math.round(w * p.renderer.getPixelRatio()) || canvas.height !== Math.round(h * p.renderer.getPixelRatio())) {
    p.renderer.setSize(w, h);
  }
  enquadrar(p.camera, w, h);
  nave.visible = true;
  nave.rotation.y = ((agora - previa.t0) / 1000) * 0.6;
  nave.userData.corpo.rotation.z = Math.sin(agora / 900) * 0.12;
  for (const [i, m] of nave.userData.motores.entries()) m.scale.setScalar(2.4 + Math.sin(agora / 25 + i * 2) * 0.35);
  p.renderer.render(p.cena, p.camera);
  previa.quadro = requestAnimationFrame(girar);
}

/** Para a prévia (ao entrar no jogo). */
export function pararPrevia() {
  if (previa?.quadro) cancelAnimationFrame(previa.quadro);
  if (previa) previa.quadro = 0;
}

/**
 * Miniatura (data URL de PNG) da nave, parada em três quartos, para o cartão da
 * Evolução. Carrega só aquele modelo; null se não der (sem WebGL, sem rede).
 */
export function miniatura(race, classe, tier) {
  const chave = `${race}/${classe}/${tier}`;
  if (!miniaturas.has(chave)) {
    const feita = (async () => {
      const p = montarPalco();
      if (!p) return null;
      await modeloDaNave(race, classe, tier);
      const nave = criarNave(race, { aliado: true, classe, tier });
      nave.rotation.y = -0.5;
      const outra = previa?.nave;
      if (outra) outra.visible = false; // a prévia da entrada divide a mesma cena
      p.cena.add(nave);
      p.renderer.setSize(MINIATURA.largura, MINIATURA.altura, false);
      enquadrar(p.camera, MINIATURA.largura, MINIATURA.altura, 25);
      p.renderer.render(p.cena, p.camera);
      const url = p.renderer.domElement.toDataURL('image/png');
      p.cena.remove(nave);
      if (outra) outra.visible = true;
      return url;
    })().catch((err) => {
      console.warn('Miniatura da nave falhou:', chave, err);
      miniaturas.delete(chave);
      return null;
    });
    miniaturas.set(chave, feita);
  }
  return miniaturas.get(chave);
}
