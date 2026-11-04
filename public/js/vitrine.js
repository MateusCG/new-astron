// Vitrine das naves: a prévia 3D girando no menu (a nave escolhida atrás dos modos da
// aba Jogar, no centro da Seleção e no visor do catálogo de Naves: um canvas só, que
// muda de lugar com a tela) e as miniaturas dos cartões do menu e da Evolução.
// No catálogo dá para girar a nave arrastando (girarPrevia e segurarPrevia).
//
// Um renderer pequeno só para isso (o do jogo é criado ao entrar e ocupa a tela
// inteira), com a mesma luz quente de fim de tarde da cena (cena.js) sobre um fundo
// transparente. Os modelos vêm do cache de nave.js (modeloDaNave): a tela de abertura
// (abertura.js) baixa as 45 naves, desenha todas as miniaturas e aquece a placa de
// vídeo da vitrine (aquecerVitrine) antes do menu abrir, então nenhuma aba do menu,
// nem o cartão da Evolução e o inventário na partida, desenha nada na hora (cada
// miniatura é feita uma vez por página). Sem WebGL a vitrine fica vazia e a miniatura devolve null (o cartão
// mostra um ícone), sem quebrar a tela.

import * as THREE from 'three';
import { atualizarMotor, criarNave, definirNave, modeloDaNave, naveDesenhada, LUZ_NAVE } from './nave.js';
import { criarLimitador } from './quadros.js';

const MINIATURA = { largura: 192, altura: 112 };

let palco = null; // { renderer, cena, camera } (null: ainda não criado; false: sem WebGL)
let previa = null; // { container, nave, quadro, ang, antes, segura }
/** Giro sozinho da prévia (rad/s); parado enquanto o piloto arrasta. */
const GIRO_POR_S = 0.6;
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
    // A vitrine só tem naves, e o material delas já multiplica a luz por LUZ_NAVE
    // (nave.js): as luzes daqui dividem por ela, para a miniatura sair como antes.
    cena.add(new THREE.HemisphereLight('#ffb27a', '#3b1c10', 1.4 / LUZ_NAVE));
    const sol = new THREE.DirectionalLight('#ffd3a1', 2.6 / LUZ_NAVE);
    sol.position.set(-6, 10, -4);
    cena.add(sol);
    const contra = new THREE.DirectionalLight('#9fe8ff', 0.6 / LUZ_NAVE); // recorte frio atrás, para a silhueta
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

/** Corpo da primeira nave da linha (m, shared/naves.js): a câmera se afasta das maiores na proporção. */
const RAIO_BASE = 7.5;

/**
 * Câmera de três quartos, de cima e da frente, enquadrando a primeira nave da linha
 * a `dist` m; a nave de corpo maior (as naves crescem com o tier) é vista de mais longe.
 */
function enquadrar(camera, largura, altura, dist = 24, corpo = RAIO_BASE) {
  dist *= Math.max(1, corpo / RAIO_BASE);
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
    previa = { container, nave, quadro: 0, ang: 0, segura: false };
  }
  previa.container = container;
  definirNave(previa.nave, race, classe, tier);
  // Garante o download (o erro já aparece no console de nave.js); se falhar, o aviso diz.
  const chave = previa.nave.userData.nave;
  modeloDaNave(race, classe, tier).catch(() => {
    if (previa?.nave.userData.nave === chave) previa.erro = chave;
  });
  if (!previa.quadro) previa.quadro = requestAnimationFrame(girar);
}

/**
 * Aviso da prévia (`.carregando-nave` dentro do container): "Carregando a nave"
 * enquanto o modelo baixa, ou a falha, se o download deu erro; some com a nave pronta.
 */
function avisoCarregando(container, carregando, falhou) {
  const aviso = container.querySelector('.carregando-nave');
  if (!aviso) return;
  aviso.hidden = !carregando;
  if (aviso.classList.contains('falhou') === falhou) return;
  aviso.classList.toggle('falhou', falhou);
  aviso.querySelector('.texto').textContent = falhou ? 'Falha ao carregar a nave' : 'Carregando a nave';
}

// A prévia gira a 30 fps, como o jogo (public/js/quadros.js).
const limitador = criarLimitador();

function girar(agora) {
  const p = palco;
  if (!previa || !p) return;
  if (!limitador.deveDesenhar(agora)) {
    previa.quadro = requestAnimationFrame(girar);
    return;
  }
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
  // O palco pode pedir a câmera mais longe (data-distancia, em m): o fundo da aba Jogar
  // afasta para a nave grande não encostar na borda nem na legenda.
  enquadrar(p.camera, w, h, Number(container.dataset.distancia) || 24, nave.userData.tamanho);
  // Enquanto o modelo da nave escolhida não chega, o losango (ou a nave da classe
  // anterior) fica escondido e o aviso aparece.
  const carregando = !naveDesenhada(nave);
  avisoCarregando(container, carregando, previa.erro === nave.userData.nave);
  nave.visible = !carregando;
  const dt = Math.min(0.1, (agora - (previa.antes ?? agora)) / 1000);
  if (!previa.segura) previa.ang += dt * GIRO_POR_S;
  nave.rotation.y = previa.ang;
  nave.userData.corpo.rotation.z = Math.sin(agora / 900) * 0.12;
  atualizarMotor(nave, { vitrine: true }, agora / 1000, dt);
  previa.antes = agora;
  p.renderer.render(p.cena, p.camera);
  previa.quadro = requestAnimationFrame(girar);
}

/** Gira a prévia `rad` radianos (arrastar o mouse no visor do catálogo). */
export function girarPrevia(rad) {
  if (previa) previa.ang += rad;
}

/** Enquanto `sim`, a prévia não gira sozinha (o piloto está arrastando). */
export function segurarPrevia(sim) {
  if (previa) previa.segura = !!sim;
}

/** Para a prévia (ao entrar no jogo). */
export function pararPrevia() {
  if (previa?.quadro) cancelAnimationFrame(previa.quadro);
  if (previa) previa.quadro = 0;
}

/**
 * Prepara a placa de vídeo da vitrine antes do menu abrir (tela de abertura): monta as
 * naves de `lista` ({ race, classe, tier }) com o motor aceso, tudo visível, compila os
 * shaders e desenha um quadro pequeno, para a primeira nave girando não travar
 * compilando a propulsão. As naves saem de cena sem liberar nada (os materiais e as
 * geometrias são os do cache de nave.js, que a prévia usa). False sem WebGL.
 */
export function aquecerVitrine(lista) {
  const p = montarPalco();
  if (!p) return false;
  const grupo = new THREE.Group();
  lista.forEach(({ race, classe, tier }, i) => {
    const nave = criarNave(race, { aliado: true, classe, tier });
    nave.position.x = (i - (lista.length - 1) / 2) * 16;
    atualizarMotor(nave, { vitrine: true }, 0, 1 / 30);
    grupo.add(nave);
  });
  grupo.traverse((o) => {
    o.visible = true;
    o.frustumCulled = false;
  });
  const outra = previa?.nave;
  if (outra) outra.visible = false;
  p.cena.add(grupo);
  p.renderer.setSize(MINIATURA.largura, MINIATURA.altura, false);
  enquadrar(p.camera, MINIATURA.largura, MINIATURA.altura, 60);
  p.renderer.compile(p.cena, p.camera);
  p.renderer.render(p.cena, p.camera);
  p.cena.remove(grupo);
  if (outra) outra.visible = true;
  return true;
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
      enquadrar(p.camera, MINIATURA.largura, MINIATURA.altura, 25, nave.userData.tamanho);
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
