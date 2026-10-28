// Destruição de nave, monstro, torre e Núcleo como no AstroN original: a unidade cai
// girando e soltando fumaça e fagulhas, e explode (o efeito EXP do original, a luz,
// o som e os destroços com a textura dela), ou explode ali mesmo, conforme a unidade
// do original (destruicao.js tem a regra, os números e de onde saíram).
//
// Tudo é desenhado com os efeitos do original tocados por efeitos-original.js (a
// explosão, a fumaça, a fagulha, a faísca e as peças dos destroços), que baixam e
// compilam na tela de carregamento (EFEITOS_DESTRUICAO em insumos.js): nada carrega
// nem compila no meio da partida. A unidade que cai é uma cópia do modelo que estava
// na tela, com os MESMOS materiais e geometrias (o programa de shader já existe); a
// Medusa, com pele, clona o esqueleto na pose em que estava.
//
// A física da queda, dos destroços, da fumaça e das faíscas anda um passo por quadro
// do original (24 por segundo), com os números do original em unidades do original
// por quadro, vezes a escala da unidade (m por unidade do original). Bater no chão é
// tocar a água (NIVEL_AGUA), a rocha ou uma construção (alturaSolida) ou o deque de
// uma área de pouso: é o CScene::IsValidMove do original.

import * as THREE from 'three';
import { clone as clonarComOssos } from 'three/addons/utils/SkeletonUtils.js';
import { NIVEL_AGUA, areaPouso } from '/shared/terrain.js';
import { alturaSolida } from '/shared/obstaculos.js';
import { criarEfeitoOriginal, tocarEfeitoOriginal, soltarEfeitoOriginal, efeitoOriginalPronto } from './efeitos-original.js';
import {
  QUADROS_POR_S,
  QUEDA,
  FUMACA,
  FAGULHA,
  DESTROCO,
  FAISCA,
  LUZ_EXPLOSAO,
  EFEITO_FAGULHA,
  EFEITOS_FUMACA,
  EFEITO_FAISCA,
  MALHAS_DESTROCO,
  SOM_EXPLOSAO,
} from './destruicao.js';

const PASSO = 1 / QUADROS_POR_S;
/** Cor dos destroços: o original os acende com a luz da cena (difusa 1, ambiente 0,4); aqui o material é sem luz, então um tom médio. */
const COR_DESTROCO = 0.62;
/** Limite de peças soltas ao mesmo tempo (fumaça, fagulha, faísca): a mais velha sai. */
const SOLTAS_MAX = 160;
/**
 * Brilho da luz da explosão no pico. O original acende com a difusa cheia (como um
 * segundo sol) e apaga com a distância até o alcance (atenuação 1/(1 + 8·d²/R²)):
 * aqui, sem queda pela distância (decay 0), só a janela do alcance, e o pico do sol da
 * cena (cena.js, 1,9).
 */
const LUZ_INTENSIDADE = 1.9;

const rnd = (n) => Math.floor(Math.random() * n); // o rand() % n do original
const Y180 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
const vTmp = new THREE.Vector3();

/** Altura do chão (água, rocha, construção ou deque) no ponto: a unidade e o destroço explodem ou quicam ali. */
function chao(x, z) {
  let h = alturaSolida(x, z);
  if (h <= 0) h = NIVEL_AGUA;
  const a = areaPouso(x, z);
  if (a) h = Math.max(h, a.piso);
  return h;
}

/** O objeto e todos os pais até `raiz` estão visíveis? */
function visivel(o, raiz) {
  for (let p = o; p && p !== raiz.parent; p = p.parent) if (!p.visible) return false;
  return true;
}

/** Material de luz (aditivo ou transparente): a chama do motor, a aura, o cone de luz. Não cai junto. */
function deLuz(m) {
  return !m || m.blending === THREE.AdditiveBlending || m.userData?.aditivo;
}

/**
 * Cópia do modelo na tela (`raiz`: a nave, o monstro, o minerador) para cair, sem as
 * chamas, as auras e os rótulos: só as malhas sólidas visíveis do casco, com os mesmos
 * materiais, na pose de agora (relativa à raiz). Com pele (a Medusa), o casco inteiro
 * com o esqueleto. Devolve o grupo e as texturas do casco (para os destroços).
 */
function copiarCasco(raiz) {
  raiz.updateWorldMatrix(true, true);
  const casco = raiz.userData.casco ?? raiz;
  const inv = new THREE.Matrix4().copy(raiz.matrixWorld).invert();
  const g = new THREE.Group();
  const texturas = new Set();
  let pele = false;
  casco.traverse((o) => {
    if (o.isSkinnedMesh) pele = true;
    if (o.isMesh && !deLuz(o.material) && o.material.map) texturas.add(o.material.map);
  });
  if (pele) {
    const c = clonarComOssos(casco);
    new THREE.Matrix4().multiplyMatrices(inv, casco.matrixWorld).decompose(c.position, c.quaternion, c.scale);
    g.add(c);
  } else {
    casco.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh || !visivel(o, raiz) || deLuz(o.material)) return;
      const m = new THREE.Mesh(o.geometry, o.material);
      m.matrixAutoUpdate = false;
      m.matrix.multiplyMatrices(inv, o.matrixWorld);
      m.castShadow = o.castShadow;
      g.add(m);
    });
  }
  return { grupo: g, texturas: [...texturas] };
}

/** Texturas do casco de `raiz` (sem copiar): os destroços de quem não cai. */
function texturasDe(raiz) {
  const t = new Set();
  raiz?.traverse((o) => {
    if (o.isMesh && !deLuz(o.material) && o.material.map) t.add(o.material.map);
  });
  return [...t];
}

export class Destruicoes {
  /**
   * `scene`, `camera` (as peças de frente para ela) e `som(nome, x, z)` (toca no
   * mundo; o volume e a distância são de quem chama).
   */
  constructor({ scene, camera, som = null }) {
    this.scene = scene;
    this.camera = camera;
    this.som = som;
    this.acc = 0;
    this.quedas = []; // { grupo, vel, giro, quadros, d, texturas }
    this.explosoes = []; // { inst, luz?, n, d }
    this.destrocos = []; // { inst, vel, giro, quadros, d }
    this.soltas = []; // fumaça, fagulha e faísca: { inst, vel, quadros, max, tipo, giroVel, gravidade, d }
    // A luz da explosão do original (CDynamicLight): uma só, sempre na cena (com
    // intensidade 0 parada), para os shaders da cena não recompilarem quando acende.
    this.luz = new THREE.PointLight(new THREE.Color(...LUZ_EXPLOSAO.cor), 0, 1, 0);
    this.luzDe = null;
    scene.add(this.luz);
  }

  /**
   * Destrói a unidade `d` (destruicaoDe) em (x, y, z). `obj` é o modelo dela na tela
   * (a nave, o monstro...): a cópia que cai e as texturas dos destroços; sem ele, a
   * explosão sai sozinha. `quat` é o rumo (o do `obj` quando não vem).
   */
  destruir({ x, y, z, d, obj = null, quat = null }) {
    if (!d) return;
    if (d.som) this.som?.(d.som, x, z);
    const q = quat ?? obj?.getWorldQuaternion(new THREE.Quaternion()) ?? new THREE.Quaternion();
    if (d.cai && obj) {
      const { grupo, texturas } = copiarCasco(obj);
      if (grupo.children.length) {
        grupo.position.set(x, y, z);
        grupo.quaternion.copy(q);
        this.scene.add(grupo);
        const e = d.escala;
        this.quedas.push({
          grupo,
          d,
          texturas,
          quadros: QUEDA.quadros,
          vel: new THREE.Vector3((rnd(QUEDA.lado) - QUEDA.lado / 2) * e, QUEDA.subida * e, (rnd(QUEDA.lado) - QUEDA.lado / 2) * e),
          // Giro em volta dos eixos da própria unidade (frente, lado e cima do original).
          giro: [0, 1, 2].map(() => (rnd(6) - 3) / (d.giro || 1)),
        });
        return;
      }
    }
    this.#explodir(x, y, z, q, d, obj ? texturasDe(obj.userData.casco ?? obj) : []);
  }

  /** A explosão do original (CUnitExplosion e os 10 CUnitWreck) no lugar da unidade. */
  #explodir(x, y, z, q, d, texturas) {
    this.som?.(SOM_EXPLOSAO, x, z);
    const inst = criarEfeitoOriginal(d.efeito, { escala: d.escala });
    if (inst) {
      inst.obj.position.set(x, y + QUEDA.alturaExplosao * d.escala, z);
      // A frente do efeito é +z do grupo; a das unidades aqui, −z.
      inst.obj.quaternion.copy(q).multiply(Y180);
      this.scene.add(inst.obj);
      tocarEfeitoOriginal(inst, 0, this.camera);
      this.explosoes.push({ inst, d });
      this.luzDe = { inst, d };
    }
    for (let i = 0; i < DESTROCO.quantos; i++) {
      const k = rnd(MALHAS_DESTROCO.length);
      const p = criarEfeitoOriginal(MALHAS_DESTROCO[k], { escala: d.escala });
      if (!p) continue;
      const mat = p.malhas[0].material;
      const tex = texturas.length ? texturas[rnd(texturas.length)] : null;
      if (tex) mat.map = tex;
      mat.color.setScalar(COR_DESTROCO);
      p.obj.position.set(x, y, z);
      p.obj.quaternion.copy(q);
      this.scene.add(p.obj);
      const e = d.escala;
      // (rand%((5−k)·2) − 5, idem, rand%((6−k)·2)) do original, com y para cima aqui.
      const vx = rnd((5 - k) * 2) - 5;
      const vy = rnd((5 - k) * 2) - 5;
      const vz = rnd((6 - k) * 2);
      this.destrocos.push({
        inst: p,
        d,
        quadros: DESTROCO.quadros,
        vel: new THREE.Vector3(vy * e, vz * e, vx * e),
        giro: [0, 1, 2].map(() => (rnd(6) - 3) / DESTROCO.giro),
      });
    }
  }

  /** Peça solta (fumaça, fagulha, faísca) do efeito `id` em `pos`, com velocidade `vel` (m por quadro). */
  #soltar(id, pos, vel, d, extra) {
    if (!efeitoOriginalPronto(id)) return;
    const inst = criarEfeitoOriginal(id, { escala: d.escala, loop: true });
    inst.obj.position.copy(pos);
    this.scene.add(inst.obj);
    this.soltas.push({ inst, vel, d, idade: 0, ...extra });
    if (this.soltas.length > SOLTAS_MAX) this.#tirar(this.soltas.shift().inst);
  }

  #tirar(inst) {
    soltarEfeitoOriginal(inst);
  }

  /** Um quadro do original (1/24 s) de tudo o que se move. */
  #passo() {
    const g = QUEDA.gravidade;
    // Unidades caindo.
    this.quedas = this.quedas.filter((u) => {
      const e = u.d.escala;
      u.quadros--;
      u.vel.x *= QUEDA.arrasto;
      u.vel.z *= QUEDA.arrasto;
      u.vel.y = u.vel.y * QUEDA.arrasto + g * e;
      const p = u.grupo.position;
      const bate = u.quadros <= 0 || p.y + u.vel.y <= chao(p.x + u.vel.x, p.z + u.vel.z);
      if (bate) {
        this.scene.remove(u.grupo);
        this.#explodir(p.x, p.y, p.z, u.grupo.quaternion, u.d, u.texturas);
        return false;
      }
      p.add(u.vel);
      // Rotação local nos três eixos do original (x frente, y lado, z cima), que aqui
      // são o −z, o x e o y da unidade.
      u.grupo.rotateZ(u.giro[0]);
      u.grupo.rotateX(u.giro[1]);
      u.grupo.rotateY(u.giro[2]);
      // A fumaça e a fagulha saem da cauda: metade do tamanho da unidade atrás do centro.
      const cauda = vTmp.set(0, 0, 1).applyQuaternion(u.grupo.quaternion).multiplyScalar(u.d.tam * 0.5 * e).add(p);
      if (Math.random() < QUEDA.chanceFumaca) {
        const id = rnd(FUMACA.raraUmEm) === 0 ? EFEITOS_FUMACA[0] : EFEITOS_FUMACA[1];
        const v = new THREE.Vector3((10 - rnd(20)) / 10, rnd(10) / 10, (10 - rnd(20)) / 10).multiplyScalar(e).addScaledVector(u.vel, FUMACA.herda);
        this.#soltar(id, cauda, v, u.d, { tipo: 'fumaca', max: FUMACA.quadros, giroVel: (rnd(10) - 20) / 200, gravidade: 0 });
      }
      if (Math.random() < QUEDA.chanceFagulha) {
        const dv = FAGULHA.divisor;
        const v = new THREE.Vector3((10 - rnd(20)) / dv, rnd(5) / dv, (10 - rnd(20)) / dv).multiplyScalar(e).addScaledVector(u.vel, FAGULHA.herda);
        this.#soltar(EFEITO_FAGULHA, cauda, v, u.d, { tipo: 'fagulha', max: FAGULHA.quadros, gravidade: 0 });
      }
      return true;
    });
    // Destroços: voam, giram e caem; o que bate no chão solta faíscas e some.
    this.destrocos = this.destrocos.filter((w) => {
      const e = w.d.escala;
      w.quadros--;
      w.vel.x *= QUEDA.arrasto;
      w.vel.z *= QUEDA.arrasto;
      w.vel.y = w.vel.y * QUEDA.arrasto + g * e;
      const p = w.inst.obj.position;
      const nx = p.x + w.vel.x;
      const ny = p.y + w.vel.y;
      const nz = p.z + w.vel.z;
      const h = chao(nx, nz);
      if (w.quadros <= 0 || ny <= h) {
        if (w.quadros > 0) {
          for (let i = 0; i < DESTROCO.faiscas; i++) {
            // (rand%4 − 2, rand%4 − 2, rand%4) mais a normal do chão (para cima).
            const v = new THREE.Vector3(rnd(4) - 2, rnd(4) + 1, rnd(4) - 2).multiplyScalar(e);
            this.#soltar(EFEITO_FAISCA, vTmp.set(p.x, Math.max(p.y, h), p.z), v, w.d, { tipo: 'faisca', max: FAISCA.quadros, gravidade: g * e });
          }
        }
        this.#tirar(w.inst);
        return false;
      }
      p.set(nx, ny, nz);
      w.inst.obj.rotateX(w.giro[0]);
      w.inst.obj.rotateY(w.giro[1]);
      w.inst.obj.rotateZ(w.giro[2]);
      return true;
    });
    // Fumaça (cresce, gira e apaga), fagulha e faísca.
    this.soltas = this.soltas.filter((s) => {
      s.idade++;
      if (s.idade >= s.max) {
        this.#tirar(s.inst);
        return false;
      }
      if (s.gravidade) {
        s.vel.x *= QUEDA.arrasto;
        s.vel.z *= QUEDA.arrasto;
        s.vel.y = s.vel.y * QUEDA.arrasto + s.gravidade;
      }
      s.inst.obj.position.add(s.vel);
      if (s.tipo === 'fumaca') {
        s.inst.giro += s.giroVel;
        s.inst.obj.scale.setScalar(s.d.escala * (1 + FUMACA.cresce * s.idade));
      }
      return true;
    });
  }

  /** Avança `dt` s: a física em passos de 1/24 s, as explosões e as peças no quadro. */
  atualizar(dt) {
    this.acc = Math.min(this.acc + dt, 0.5);
    while (this.acc >= PASSO) {
      this.acc -= PASSO;
      this.#passo();
    }
    this.explosoes = this.explosoes.filter((x) => {
      if (tocarEfeitoOriginal(x.inst, dt, this.camera)) return true;
      if (this.luzDe?.inst === x.inst) this.luzDe = null;
      soltarEfeitoOriginal(x.inst);
      return false;
    });
    for (const s of this.soltas) {
      tocarEfeitoOriginal(s.inst, 0, this.camera);
      // Fumaça e fagulha apagam pela idade (o original põe 1 − idade/vida na alfa).
      const a = 1 - s.idade / s.max;
      if (s.tipo !== 'faisca') for (const m of s.inst.malhas) if (m.material.transparent) m.material.opacity = a;
    }
    // A luz: alcance sen(π·t/n) × 200 do original (na escala da unidade), acesa só
    // pela última explosão.
    const l = this.luzDe;
    if (l) {
      const k = Math.min(1, l.inst.t / (l.inst.d.quadros / QUADROS_POR_S));
      const s = Math.sin(Math.PI * k);
      this.luz.position.copy(l.inst.obj.position);
      this.luz.distance = Math.max(1, LUZ_EXPLOSAO.alcance * l.d.escala * s);
      this.luz.intensity = LUZ_INTENSIDADE * s;
    } else this.luz.intensity = 0;
  }
}
