// Rastro dos mísseis do original (tipo de gráfico 6 na coluna 59 do inititemweapon.cfg:
// o Míssil Sugador de Energia, o Míssil Tempestade Paralisante), como o
// CUnitMissileTail do original: o .3dx da coluna 58 (2343101) é uma fita com pele
// presa a ossos Bone01..BoneN. A cada quadro do original (24 por segundo,
// CUnitBeam::MoveBullet → CUnitMissileTail::Proceed) a matriz do nó `Tail` do míssil
// entra num histórico de 16 (o primeiro quadro enche todos com ela); no desenho o
// Bone01 vai para a de agora, o último osso para a mais velha e os do meio para
// quadroDoOsso (disparo-regras.js), e a fita estica pelo caminho que o míssil andou.
//
// O json (tools/efeitos3d_do_original.py --rastro) traz cada vértice já no espaço dos
// ossos que o puxam, com o peso: aqui é só somar peso × (matriz do osso) × ponto, na
// CPU (54 vértices). As matrizes do histórico já estão no espaço do jogo (a do grupo do
// efeito do míssil × a troca de eixos × a do nó), então os pontos, em unidades do
// original, saem direto no mundo. Textura com alfa: luz, aditiva (o CAlphaManage).
//
// Desempenho: geometria e material de cada rastro saem de uma reserva e voltam para
// ela; nada é liberado no meio da partida.

import * as THREE from 'three';
import { texturaEfeito } from './efeitos-armas.js';
import { quadroDoOsso } from './disparo-regras.js';

/** Quadros do original por segundo (o histórico anda neste passo). */
const PASSO_S = 1 / 24;

const rastros = new Map(); // id -> dados prontos

/** Guarda o rastro `id` do json já baixado (efeitos-original.js chama ao carregar). */
export function prepararRastro(j) {
  const n = j.inf.length;
  const inf = j.inf.map((linha) => linha.map(([k, w, x, y, z]) => ({ k, w, p: new THREE.Vector3(x, y, z) })));
  rastros.set(j.id, { id: j.id, tex: j.tex, opaca: !!j.opaca, ossos: j.ossos, historico: j.historico, uv: new Float32Array(j.uv), idx: j.idx, n, inf, reserva: [] });
}

/** O rastro `id` está pronto? */
export function rastroPronto(id) {
  return rastros.has(id);
}

/**
 * Um rastro novo do modelo `id` (null se não carregou). Quem chama põe `obj` na cena e
 * chama `seguirRastro` a cada quadro com a matriz do nó `Tail` do míssil.
 */
export function criarRastro(id) {
  const d = rastros.get(id);
  if (!d) return null;
  let r = d.reserva.pop();
  if (!r) {
    const geo = new THREE.BufferGeometry();
    const pos = new THREE.BufferAttribute(new Float32Array(d.n * 3), 3);
    pos.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', pos);
    geo.setAttribute('uv', new THREE.BufferAttribute(d.uv, 2));
    geo.setIndex(d.idx);
    const mat = new THREE.MeshBasicMaterial({
      map: texturaEfeito(d.tex),
      blending: d.opaca ? THREE.NormalBlending : THREE.AdditiveBlending,
      transparent: !d.opaca,
      depthWrite: d.opaca,
      side: THREE.DoubleSide,
    });
    const obj = new THREE.Mesh(geo, mat);
    obj.frustumCulled = false;
    obj.matrixAutoUpdate = false;
    r = { d, obj, hist: Array.from({ length: d.historico }, () => new THREE.Matrix4()) };
  }
  r.cheio = false;
  r.acc = 0;
  r.obj.visible = false;
  return r;
}

/**
 * Anda o rastro `r` `dt` s com o nó `Tail` do míssil em `matriz` (no mundo) e refaz a
 * fita. O primeiro passo enche o histórico todo (CUnitMissileTail::Proceed com o
 * contador em 0): a fita nasce encolhida no míssil.
 */
export function seguirRastro(r, matriz, dt) {
  const h = r.hist;
  if (!r.cheio) {
    for (const m of h) m.copy(matriz);
    r.cheio = true;
  } else {
    r.acc += dt;
    while (r.acc >= PASSO_S) {
      r.acc -= PASSO_S;
      const velha = h.pop();
      h.unshift(velha.copy(matriz));
    }
    // O de agora acompanha o míssil entre um quadro do original e outro.
    h[0].copy(matriz);
  }
  const { d } = r;
  const pos = r.obj.geometry.attributes.position;
  const v = vTmp;
  for (let i = 0; i < d.n; i++) {
    let x = 0;
    let y = 0;
    let z = 0;
    for (const { k, w, p } of d.inf[i]) {
      v.copy(p).applyMatrix4(h[quadroDoOsso(k, d.ossos, d.historico)]);
      x += v.x * w;
      y += v.y * w;
      z += v.z * w;
    }
    pos.setXYZ(i, x, y, z);
  }
  pos.needsUpdate = true;
  r.obj.visible = true;
}

/** Devolve o rastro à reserva (tira da cena). */
export function soltarRastro(r) {
  if (!r) return;
  r.obj.removeFromParent();
  r.d.reserva.push(r);
}

const vTmp = new THREE.Vector3();
