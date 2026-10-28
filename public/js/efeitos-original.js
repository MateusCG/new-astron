// Efeitos visuais do AstroN original tocados como no original: o .eff + .3dx + .MPL
// convertidos por tools/efeitos3d_do_original.py em public/modelos/efeitos/<id>.json.
//
// O original (CEffectSprite::DrawFrame) desenha cada peça do efeito com a matriz do
// quadro do .3dx que o .eff manda, a textura da paleta .MPL daquele quadro (a chama do
// Xerxes troca de textura a cada quadro), a cor e a alfa do bloco (o efeito aparece e
// some), escondida ou não, e virada para a câmera quando o bloco pede. Anda 24
// quadros por segundo e acaba no último (ou volta ao começo, nos que repetem: o
// projétil em voo, os ícones de estado em cima da nave, o fogo do Magma). Peça com
// textura de alfa é luz, como no CAlphaManage do original: mistura aditiva pesada
// pela alfa, sem escrever profundidade, dos dois lados; a de textura sem alfa (o casco
// do míssil, o símbolo dos ícones de estado; `opacas` no json) é sólida.
//
// Eixos: o original é Z para cima e a frente +x, com vetor-linha (p' = p·M). Aqui a
// frente vai para +z do grupo (quem chama faz o lookAt no rumo, como nos outros
// tiros), o cima para +y e o y do original para +x: game = C·orig, com C a permutação
// cíclica (x, y, z) → (y, z, x), que é uma rotação (não espelha). Peça virada para a
// câmera: o original troca as linhas da rotação da câmera, então o x da peça vai para
// o cima da tela e o y para a direita (as faíscas do Magma andam no x e sobem).
//
// Desempenho: a geometria de cada peça é montada uma vez por efeito; cada instância
// tem material próprio (a alfa e a textura mudam por quadro) que sai de uma reserva
// por efeito e volta para ela ao acabar, nunca liberado no meio da partida (o
// Three.js apagaria o programa de shader). Tudo baixa na tela de carregamento
// (carregarEfeitoOriginal); no meio da partida, efeito que não chegou não aparece.

import * as THREE from 'three';
import { PASTA_EFEITOS_ORIGINAIS } from './insumos.js';
import { carregarTexturaEfeito, texturaEfeito } from './efeitos-armas.js';

export const QUADROS_POR_S = 24;
// Flags do bloco do .eff (byte 136).
const F_PALETA = 1;
const F_MATERIAL = 4;
const F_CAMERA = 8;
const F_ESCONDIDO = 16;

// game = C · orig (rotação: x→z, y→x, z→y).
const C = new THREE.Matrix4().set(0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1);

const dados = new Map(); // id -> efeito pronto (geometrias, matrizes, blocos)
const carregando = new Map(); // id -> Promise

/** Baixa o efeito `id` (json e texturas) uma vez; devolve a promessa dele pronto. */
export function carregarEfeitoOriginal(id) {
  if (!carregando.has(id)) {
    const p = fetch(`${PASTA_EFEITOS_ORIGINAIS}${id}.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`efeito ${id}`);
        return r.json();
      })
      .then(async (j) => {
        const texturas = new Set([...j.pecas.map((p) => p.tex).filter(Boolean), ...j.mpal]);
        await Promise.all([...texturas].map(carregarTexturaEfeito));
        dados.set(id, preparar(j));
      });
    p.catch(() => {});
    carregando.set(id, p);
  }
  return carregando.get(id);
}

/** O efeito `id` já está pronto para tocar? */
export function efeitoOriginalPronto(id) {
  return dados.has(id);
}

/** Matriz do original (16, vetor-linha) como Matrix4 do Three (coluna): M^T. */
function matrizDe(m) {
  return new THREE.Matrix4().fromArray(m);
}

function preparar(j) {
  const pecas = j.pecas.map((p) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(p.pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(p.uv, 2));
    geo.setIndex(p.idx);
    geo.computeBoundingSphere();
    return {
      geo,
      tex: p.tex,
      base: matrizDe(p.m),
      quadros: p.q.map(matrizDe),
    };
  });
  // Raio no chão (x, y do original) do efeito no primeiro quadro e no maior, em
  // unidades do original: para quem estica o efeito até um tamanho (o campo até a
  // área no começo, a nova até o raio dela no fim).
  const v = new THREE.Vector3();
  const raioDo = (linha) => {
    let r = 0;
    linha.forEach((b, i) => {
      const p = pecas[i];
      if (!p || b[2] & F_ESCONDIDO) return;
      const m = p.quadros[b[0]] ?? p.base;
      const pos = p.geo.attributes.position;
      for (let k = 0; k < pos.count; k++) {
        v.fromBufferAttribute(pos, k).applyMatrix4(m);
        r = Math.max(r, Math.hypot(v.x, v.y));
      }
    });
    return r;
  };
  const raio = raioDo(j.blocos[0] ?? []);
  const raioMax = Math.max(raio, ...j.blocos.map(raioDo));
  // Partícula: as texturas das variantes (o original sorteia uma por partícula).
  const particula = j.particula ? { texs: j.pecas.map((p) => p.tex).filter(Boolean), raio } : null;
  return { id: j.id, quadros: j.quadros, pecas, mpal: j.mpal, opacas: new Set(j.opacas ?? []), blocos: j.blocos, raio, raioMax, particula, reserva: [] };
}

const mCam = new THREE.Matrix4();
const mGiro = new THREE.Matrix4();
const vPos = new THREE.Vector3();
const vEsc = new THREE.Vector3();
const qTmp = new THREE.Quaternion();
const eixos = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];

/**
 * Uma instância tocando o efeito `id`. `obj` é o grupo que quem chama põe no lugar
 * (posição, rumo, escala em m por unidade do original). `loop` repete; sem loop,
 * `tocar` devolve false no fim. null se o efeito não está pronto.
 */
export function criarEfeitoOriginal(id, { escala = 1, loop = false } = {}) {
  const d = dados.get(id);
  if (!d) return null;
  let inst = d.reserva.pop();
  if (!inst) {
    const obj = new THREE.Group();
    const malhas = d.pecas.map((p) => {
      const opaca = d.opacas.has(p.tex);
      const mat = new THREE.MeshBasicMaterial({
        map: p.tex ? texturaEfeito(p.tex) : null,
        blending: opaca ? THREE.NormalBlending : THREE.AdditiveBlending,
        transparent: !opaca,
        depthWrite: opaca,
        side: THREE.DoubleSide,
      });
      const m = new THREE.Mesh(p.geo, mat);
      m.matrixAutoUpdate = false;
      m.frustumCulled = false;
      obj.add(m);
      return m;
    });
    inst = { d, obj, malhas };
  }
  inst.t = 0;
  inst.loop = loop;
  inst.giro = 0; // rad, só nas peças viradas para a câmera (a fumaça da queda)
  inst.obj.scale.setScalar(escala);
  inst.obj.position.set(0, 0, 0);
  inst.obj.quaternion.identity();
  inst.obj.visible = true;
  aplicarQuadro(inst, 0, null);
  return inst;
}

/** Devolve a instância à reserva do efeito (quem chama já a tirou da cena). */
export function soltarEfeitoOriginal(inst) {
  if (!inst) return;
  inst.obj.removeFromParent();
  inst.d.reserva.push(inst);
}

/**
 * O projétil `id` é um sistema de partículas no original ("particle_dummy": o feixe do
 * Bazit, o canhão teleguiado do Anti, a pedra e o disparo de controle da Medusa)?
 * Devolve { texs, raio } (as texturas das variantes e o raio da partícula em unidades
 * do original) para quem desenha o rastro, ou null.
 */
export function particulaOriginal(id) {
  return dados.get(id)?.particula ?? null;
}

/** Duração do efeito (s) sem repetir. */
export function duracaoEfeitoOriginal(id) {
  const d = dados.get(id);
  return d ? d.quadros / QUADROS_POR_S : 0;
}

/** Raio do efeito no primeiro quadro (ou no maior, `maior`), em unidades do original (0 se não está pronto). */
export function raioEfeitoOriginal(id, maior = false) {
  const d = dados.get(id);
  return d ? (maior ? d.raioMax : d.raio) : 0;
}

/**
 * Avança `dt` s e desenha o quadro da vez; `camera` vira as peças que olham para ela.
 * Devolve false quando acabou (sem loop).
 */
export function tocarEfeitoOriginal(inst, dt, camera) {
  inst.t += dt;
  let q = Math.floor(inst.t * QUADROS_POR_S);
  if (q >= inst.d.quadros) {
    if (!inst.loop) return false;
    q %= inst.d.quadros;
  }
  aplicarQuadro(inst, q, camera);
  return true;
}

function aplicarQuadro(inst, q, camera) {
  const { d, malhas, obj } = inst;
  const linha = d.blocos[q] ?? d.blocos[0];
  let precisaMundo = false;
  for (let i = 0; i < malhas.length; i++) {
    const malha = malhas[i];
    const b = linha[i];
    const p = d.pecas[i];
    if (!b) {
      malha.visible = false;
      continue;
    }
    const [fr, mat, fl, r, g, bl, a] = b;
    malha.visible = !(fl & F_ESCONDIDO);
    if (!malha.visible) continue;
    const m = p.quadros[fr] ?? p.base;
    const mt = malha.material;
    const tex = fl & F_PALETA && d.mpal[mat] ? d.mpal[mat] : p.tex;
    const mapa = tex ? texturaEfeito(tex) : null;
    if (mt.map !== mapa) {
      mt.map = mapa;
      mt.needsUpdate = true;
    }
    if (fl & F_MATERIAL) {
      mt.color.setRGB(r, g, bl);
      // Peça sólida não some pela alfa (o original só usa a alfa na de luz).
      mt.opacity = mt.transparent ? a : 1;
    } else {
      mt.color.setRGB(1, 1, 1);
      mt.opacity = 1;
    }
    if (fl & F_CAMERA && camera) {
      // Rotação da câmera (x da peça = cima da tela, y = direita, z = para onde ela
      // olha), na posição e na escala do grupo; a matriz do quadro por dentro.
      if (!precisaMundo) {
        obj.updateWorldMatrix(true, false);
        obj.matrixWorld.decompose(vPos, qTmp, vEsc);
        precisaMundo = true;
      }
      camera.matrixWorld.extractBasis(eixos[1], eixos[0], eixos[2]); // direita, cima, para trás
      eixos[2].negate();
      mCam.makeBasis(eixos[0], eixos[1], eixos[2]).scale(vEsc).setPosition(vPos);
      // A fumaça da unidade caindo gira na tela (CUnitWarningSmoke: rotação em z da câmera).
      if (inst.giro) mCam.multiply(mGiro.makeRotationZ(inst.giro));
      malha.matrixWorldAutoUpdate = false;
      malha.matrixWorld.multiplyMatrices(mCam, m);
      malha.matrix.identity();
    } else {
      malha.matrixWorldAutoUpdate = true;
      malha.matrix.multiplyMatrices(C, m);
    }
    malha.matrixWorldNeedsUpdate = true;
  }
}
