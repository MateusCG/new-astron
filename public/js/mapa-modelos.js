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
// - os do padrão mid-poly PBR (`pbr_*`, IDENTIDADE-VISUAL.md) vêm com normais e UV
//   (glb com Draco) e são lisos: `pbr_<conjunto>[_variação]` ganha as três texturas do
//   conjunto (TEXTURAS_PBR_MAPA: cor, metal/rugosidade e relevo), uma cópia por página
//   para o mapa inteiro, e a cor de cada variação vem do fator do glb. Metal até 0,5
//   (não há mapa de ambiente); sem conjunto (`pbr_tinta`, `pbr_vidro`), só a cor. A rocha
//   PBR é um material só, `pbr_rocha` (o conjunto `rocha`, que repete), com o tom de cada
//   estrato na cor do vértice, e ganha as cáusticas (que só aparecem da água para baixo);
// - os pintados por quem olha (`neon_time`, `portal_time`, `neon_doca_0/1`,
//   `neon_servico`, `neon_objetivo`) a cena troca em cada cópia com `pintar`: cor do
//   time relativa a quem olha, cor do serviço, e o âmbar dos objetivos, um material
//   por objetivo para apagar só o dele.

import * as THREE from 'three';
import { insumosDoMapa, TEXTURAS_PBR_MAPA, PASTA_TEXTURAS_MAPA } from './insumos.js';
import { comCaustica } from './agua.js';

let carregador = null;
const pedidos = new Map(); // nome -> Promise da cena preparada
const prontos = new Map(); // nome -> THREE.Object3D preparado (modelo original)
const materiais = new Map(); // nome do material -> material compartilhado
const conjuntos = new Map(); // conjunto PBR -> Promise das texturas { cor, mr, normal }
const conjuntosProntos = new Map(); // conjunto PBR -> texturas já baixadas

/** Decodificador Draco (os glb do padrão PBR vêm comprimidos), do próprio three. */
const PASTA_DRACO = '/vendor/addons/libs/draco/gltf/';

const URL_DO = new Map(insumosDoMapa().mapa.map((m) => [m.nome, m.url]));

/** Conjunto de texturas de um material `pbr_<conjunto>[_variação]`, ou null. */
export function conjuntoPbr(nome) {
  const m = /^pbr_([a-z0-9]+)/.exec(nome ?? '');
  return m && TEXTURAS_PBR_MAPA[m[1]] ? m[1] : null;
}

/** Baixa as texturas de um conjunto PBR (uma vez por página). */
function texturasDoConjunto(conjunto) {
  if (!conjuntos.has(conjunto)) {
    const carregador = new THREE.TextureLoader();
    const arquivos = TEXTURAS_PBR_MAPA[conjunto];
    const p = Promise.all(
      Object.entries(arquivos).map(async ([tipo, arquivo]) => {
        const t = await carregador.loadAsync(`${PASTA_TEXTURAS_MAPA}${arquivo}`);
        // UV do glTF (origem em cima), como as texturas que o GLTFLoader carrega.
        t.flipY = false;
        // A rocha repete (UV ao longo da parede, além de 0..1); o atlas do painel fica dentro de 0..1.
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.colorSpace = tipo === 'cor' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        t.anisotropy = 4;
        t.name = arquivo;
        return [tipo, t];
      }),
    ).then((pares) => {
      const t = Object.fromEntries(pares);
      conjuntosProntos.set(conjunto, t);
      return t;
    });
    p.catch(() => conjuntos.delete(conjunto));
    conjuntos.set(conjunto, p);
  }
  return conjuntos.get(conjunto);
}

/** Ajusta um material do glb às regras do guia (cópia, uma vez por nome). */
function materialCompartilhado(m) {
  const nome = m.name || 'sem_nome';
  let mat = materiais.get(nome);
  if (mat) return mat;
  mat = m.clone();
  const pbr = nome.startsWith('pbr_');
  mat.flatShading = !pbr;
  if ('metalness' in mat && pbr) {
    mat.metalness = Math.min(mat.metalness ?? 0, 0.5);
    const tex = conjuntosProntos.get(conjuntoPbr(nome));
    if (tex) {
      mat.map = tex.cor;
      mat.metalnessMap = tex.mr;
      mat.roughnessMap = tex.mr;
      mat.normalMap = tex.normal;
      // Sem tangentes no glb (o three usa derivadas) e textura com flipY false: o
      // verde do relevo inverte, como o GLTFLoader faz com as dele.
      mat.normalScale = new THREE.Vector2(1, -1);
    } else {
      mat.roughness = Math.max(mat.roughness ?? 1, 0.4);
    }
  } else if ('metalness' in mat) {
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
  if (nome === 'rocha_molhada' || nome === 'pbr_rocha' || nome === 'fundo_lago') comCaustica(mat, nome === 'fundo_lago' ? 0.12 : 0.1);
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
      if (!carregador) {
        const [{ GLTFLoader }, { DRACOLoader }] = await Promise.all([
          import('three/addons/loaders/GLTFLoader.js'),
          import('three/addons/loaders/DRACOLoader.js'),
        ]);
        carregador = new GLTFLoader().setDRACOLoader(new DRACOLoader().setDecoderPath(PASTA_DRACO));
      }
      const gltf = await carregador.loadAsync(URL_DO.get(nome) ?? `/modelos/mapa/${nome}.glb`);
      const raiz = gltf.scene;
      // As texturas dos materiais PBR chegam antes de preparar os materiais.
      const pedidosTex = new Set();
      raiz.traverse((o) => {
        if (o.isMesh) for (const m of [o.material].flat()) if (conjuntoPbr(m.name)) pedidosTex.add(conjuntoPbr(m.name));
      });
      await Promise.all([...pedidosTex].map(texturasDoConjunto));
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
