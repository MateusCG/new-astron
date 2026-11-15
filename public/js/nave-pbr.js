// As naves de jogador mid-poly PBR (nave-pbr-regras.js): o que precisa do Three.js.
// O material do casco (cor, relevo, rugosidade, metal, oclusão e emissivo, no
// layout de UV do original), as texturas dele e o AMBIENTE que o metal reflete.
//
// A cena do jogo não tem mapa de ambiente (IDENTIDADE-VISUAL.md: o metal do mapa
// brilha só com o sol), e sem ele o metal de verdade fica preto. Só o casco PBR
// recebe um: o céu do lago (as cores e o sol de cena.js) e a água escura embaixo,
// desenhados numa textura equirretangular pequena, que o three.js converte em PMREM
// em cada renderer (o do jogo e o da vitrine do menu dividem o mesmo material).

import * as THREE from 'three';
import { MAPAS_PBR } from './nave-pbr-regras.js';

// As cores do céu e a direção do sol de cena.js (CORES, SOL_DIR), e a água vista de cima.
const CEU = { topo: '#1c2840', meio: '#7c6862', horizonte: '#d1ae8c', halo: '#ffc890', sol: '#fff0d8', agua: '#12303a', fundo: '#0a1a20' };
const SOL_DIR = new THREE.Vector3(-0.55, 0.42, -0.72).normalize();
/** Quanto do ambiente entra no casco (1 = o céu como ele é). */
export const AMBIENTE_NAVE = 1.15;
/** Força das luzes e do vidro da cabine (o emissivo da textura). */
export const EMISSIVO_NAVE = 1.7;
/** Filtro anisotrópico das texturas do casco (a nave é vista de lado, rasante). */
const ANISOTROPIA = 8;

const degrau = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

let ambiente = null;

/** O céu do lago como mapa de ambiente (equirretangular, linear, com o sol mais forte que o branco). */
export function ambienteDaNave() {
  if (ambiente) return ambiente;
  const [w, h] = [128, 64];
  const cor = Object.fromEntries(Object.entries(CEU).map(([k, v]) => [k, new THREE.Color(v)]));
  const dados = new Uint16Array(w * h * 4);
  const dir = new THREE.Vector3();
  const c = new THREE.Color();
  for (let j = 0; j < h; j++) {
    const lat = ((j + 0.5) / h - 0.5) * Math.PI; // linha 0 = para baixo
    for (let i = 0; i < w; i++) {
      const lon = ((i + 0.5) / w - 0.5) * 2 * Math.PI;
      dir.set(Math.cos(lon) * Math.cos(lat), Math.sin(lat), Math.sin(lon) * Math.cos(lat));
      if (dir.y >= 0) {
        // O mesmo degradê do céu de cena.js, com o halo e um sol largo (o disco de
        // verdade é pequeno demais para a textura; o brilho do sol vem da luz direta).
        c.copy(cor.horizonte).lerp(cor.meio, degrau(0.02, 0.22, dir.y)).lerp(cor.topo, degrau(0.22, 0.8, dir.y));
        const s = Math.max(0, dir.dot(SOL_DIR));
        const [halo, sol] = [s ** 14 * 0.35, s ** 90 * 2.5];
        c.setRGB(c.r + cor.halo.r * halo + cor.sol.r * sol, c.g + cor.halo.g * halo + cor.sol.g * sol, c.b + cor.halo.b * halo + cor.sol.b * sol);
      } else {
        // Embaixo: a água do lago, mais clara perto do horizonte (reflete o céu).
        c.copy(cor.horizonte).multiplyScalar(0.55).lerp(cor.agua, degrau(0, 0.12, -dir.y)).lerp(cor.fundo, degrau(0.12, 0.9, -dir.y));
      }
      const k = (j * w + i) * 4;
      dados[k] = THREE.DataUtils.toHalfFloat(c.r);
      dados[k + 1] = THREE.DataUtils.toHalfFloat(c.g);
      dados[k + 2] = THREE.DataUtils.toHalfFloat(c.b);
      dados[k + 3] = THREE.DataUtils.toHalfFloat(1);
    }
  }
  ambiente = new THREE.DataTexture(dados, w, h, THREE.RGBAFormat, THREE.HalfFloatType);
  ambiente.mapping = THREE.EquirectangularReflectionMapping;
  ambiente.colorSpace = THREE.LinearSRGBColorSpace;
  ambiente.magFilter = ambiente.minFilter = THREE.LinearFilter;
  ambiente.wrapS = THREE.RepeatWrapping;
  ambiente.needsUpdate = true;
  return ambiente;
}

let carregadorTex = null;

/** Baixa os quatro mapas de uma nave PBR (`arquivos` de arquivosPbr): `{ cor, mr, normal, emissivo }`. */
export async function carregarTexturasPbr(arquivos) {
  carregadorTex ??= new THREE.TextureLoader();
  const tex = await Promise.all(MAPAS_PBR.map((m) => carregadorTex.loadAsync(arquivos[m])));
  const mapas = Object.fromEntries(MAPAS_PBR.map((m, i) => [m, tex[i]]));
  for (const [nome, t] of Object.entries(mapas)) {
    t.flipY = false; // UV do glTF
    t.wrapS = t.wrapT = THREE.RepeatWrapping; // como a textura do original
    t.colorSpace = nome === 'cor' || nome === 'emissivo' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = ANISOTROPIA;
  }
  return mapas;
}

/**
 * Material do casco PBR: liso (as normais ponderadas da malha), com os fatores em 1
 * (quem manda são os mapas) e o ambiente do lago. `mr` é o
 * occlusionRoughnessMetallic do glTF (vermelho, verde e azul), então serve de três.
 */
export function materialCascoPbr(mapas) {
  return new THREE.MeshStandardMaterial({
    map: mapas.cor,
    normalMap: mapas.normal,
    roughnessMap: mapas.mr,
    metalnessMap: mapas.mr,
    aoMap: mapas.mr,
    emissiveMap: mapas.emissivo,
    emissive: '#ffffff',
    emissiveIntensity: EMISSIVO_NAVE,
    roughness: 1,
    metalness: 1,
    envMap: ambienteDaNave(),
    envMapIntensity: AMBIENTE_NAVE,
    side: THREE.DoubleSide,
  });
}
