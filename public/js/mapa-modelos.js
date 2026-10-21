// Modelos do mapa (public/modelos/mapa/, feitos no Blender pela frente Cenário; lista,
// medidas, pivôs e materiais em public/modelos/mapa/LISTA.md).
//
// Cada arquivo é baixado e preparado uma vez por página (cache por nome, que sobrevive
// a sair e entrar de novo); a tela de carregamento baixa todos antes da partida e a
// cena (cena.js) só monta cópias (`instanciaMapa`), que dividem a geometria.
//
// Materiais: o cliente acha cada um pelo NOME e:
// - os de cor fixa (rocha, metal, fundo, coral, alga, neon_he3, he3_escuro) viram um
//   material só por nome para o mapa inteiro (menos programas de shader, e o He-3 do
//   mapa inteiro "respira" mexendo num material só). Dentro das regras do guia:
//   facetado (os glb vêm sem normais de propósito; o GLTFLoader liga o flatShading),
//   metal até 0,35, rugosidade de 0,55 para cima, neon com cor = emissivo e
//   intensidade perto de 1. A rocha molhada e o fundo do lago ganham as cáusticas da
//   água (agua.js);
// - os pintados por quem olha (`neon_time`, `portal_time`, `neon_doca_0/1`,
//   `neon_servico`, `neon_objetivo`) a cena troca em cada cópia com `pintar`: cor do
//   time relativa a quem olha, cor do serviço, e o âmbar dos objetivos, um material
//   por objetivo para apagar só o dele.

import * as THREE from 'three';
import { insumosDoMapa } from './insumos.js';
import { comCaustica } from './agua.js';

let carregador = null;
const pedidos = new Map(); // nome -> Promise da cena preparada
const prontos = new Map(); // nome -> THREE.Object3D preparado (modelo original)
const materiais = new Map(); // nome do material -> material compartilhado

const URL_DO = new Map(insumosDoMapa().mapa.map((m) => [m.nome, m.url]));

/** Ajusta um material do glb às regras do guia (cópia, uma vez por nome). */
function materialCompartilhado(m) {
  const nome = m.name || 'sem_nome';
  let mat = materiais.get(nome);
  if (mat) return mat;
  mat = m.clone();
  mat.flatShading = true;
  if ('metalness' in mat) {
    mat.metalness = Math.min(mat.metalness ?? 0, 0.35);
    mat.roughness = Math.max(mat.roughness ?? 1, 0.55);
  }
  if (/^(rocha|fundo|coral|alga)/.test(nome)) {
    mat.metalness = 0;
    mat.roughness = 0.95;
  }
  if (/^neon_|^portal_/.test(nome)) {
    mat.emissive?.copy(mat.color);
    mat.emissiveIntensity = 0.9;
    mat.roughness = 0.6;
    mat.metalness = 0;
  }
  if (nome === 'rocha_molhada' || nome === 'fundo_lago') comCaustica(mat, nome === 'fundo_lago' ? 0.12 : 0.1);
  mat.name = nome;
  materiais.set(nome, mat);
  return mat;
}

/** Material compartilhado pelo nome (ex. 'neon_he3'), depois que algum modelo o trouxe. */
export function materialDoMapa(nome) {
  return materiais.get(nome) ?? null;
}

/** Baixa e prepara um modelo do mapa (uma vez por arquivo). Falha de rede rejeita e sai do cache. */
export function carregarModeloMapa(nome) {
  if (!pedidos.has(nome)) {
    const p = (async () => {
      carregador ??= new (await import('three/addons/loaders/GLTFLoader.js')).GLTFLoader();
      const gltf = await carregador.loadAsync(URL_DO.get(nome) ?? `/modelos/mapa/${nome}.glb`);
      const raiz = gltf.scene;
      raiz.traverse((o) => {
        if (!o.isMesh) return;
        o.material = Array.isArray(o.material) ? o.material.map(materialCompartilhado) : materialCompartilhado(o.material);
        o.castShadow = true;
        o.receiveShadow = true;
      });
      raiz.updateMatrixWorld(true);
      prontos.set(nome, raiz);
      return raiz;
    })();
    p.catch(() => pedidos.delete(nome));
    pedidos.set(nome, p);
  }
  return pedidos.get(nome);
}

/** O modelo já está pronto (no cache)? */
export function modeloMapaPronto(nome) {
  return prontos.has(nome);
}

/**
 * Cópia do modelo pronto (a geometria e os materiais são os mesmos do cache), ou null
 * se ele ainda não chegou. `sombra` false tira a sombra projetada (peças enormes ou
 * embaixo d'água).
 */
export function instanciaMapa(nome, { sombra = true } = {}) {
  const m = prontos.get(nome);
  if (!m) return null;
  const c = m.clone(true);
  if (!sombra) c.traverse((o) => o.isMesh && (o.castShadow = false));
  return c;
}

/** Geometria e material de cada malha do modelo (para InstancedMesh: decoração). */
export function partesDoModelo(nome) {
  const m = prontos.get(nome);
  if (!m) return [];
  const partes = [];
  m.traverse((o) => {
    if (!o.isMesh) return;
    const geo = o.geometry.clone().applyMatrix4(o.matrixWorld);
    partes.push({ geometria: geo, material: o.material });
  });
  return partes;
}

/**
 * Troca, na cópia `obj`, todo material de nome `nome` por `material` (o mesmo
 * material em todas as malhas dela). Devolve quantas malhas mudaram.
 */
export function pintar(obj, nome, material) {
  let n = 0;
  obj.traverse((o) => {
    if (!o.isMesh) return;
    if (Array.isArray(o.material)) {
      o.material = o.material.map((m) => (m.name === nome ? (n++, material) : m));
    } else if (o.material?.name === nome) {
      o.material = material;
      n++;
    }
  });
  return n;
}

/** Material neon (cor = emissivo) para pintar: `intensidade` perto de 1 (guia visual). */
export function neon(cor, intensidade = 0.9) {
  const c = new THREE.Color(cor);
  return new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: intensidade, roughness: 0.6, metalness: 0, flatShading: true });
}
