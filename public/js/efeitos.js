// Efeitos visuais: tiros, faíscas de acerto e explosões. Só aparência; quem decide
// se o tiro acertou é o servidor (eventos 'acerto' e 'morte' do snapshot).

import * as THREE from 'three';
import { stepBullet } from '/shared/sim.js';
import { brilho } from './nave.js';

const COR_TIRO = {
  laser: new THREE.Color('#5ff7ff'),
  laserDuplo: new THREE.Color('#5ff7ff'),
  plasma: new THREE.Color('#7dff6a'),
  inimigo: new THREE.Color('#ff4a2a'),
};
// Forma de cada tiro: barra (comprimento em m, 0 = sem barra) + brilho. O laser
// duplo é a mesma barra ciano do laser, um pouco menor, já que saem duas juntas.
const FORMA_TIRO = {
  laser: { barra: 7, grossura: 0.35, brilho: 3 },
  laserDuplo: { barra: 6, grossura: 0.28, brilho: 2.4 },
  plasma: { barra: 0, brilho: 6 },
};

export class Efeitos {
  constructor(scene) {
    this.scene = scene;
    this.tiros = new Map();
    this.particulas = [];
    this.geoBarra = new Map();
  }

  #barra(forma) {
    const chave = `${forma.grossura}x${forma.barra}`;
    if (!this.geoBarra.has(chave)) this.geoBarra.set(chave, new THREE.BoxGeometry(forma.grossura, forma.grossura, forma.barra));
    return this.geoBarra.get(chave);
  }

  /** Cria um tiro visual. inimigo = tiro de drone (vermelho). */
  tiro(b, inimigo = false) {
    const cor = inimigo ? COR_TIRO.inimigo : COR_TIRO[b.kind] ?? COR_TIRO.laser;
    const forma = FORMA_TIRO[b.kind] ?? FORMA_TIRO.laser;
    const g = new THREE.Group();
    if (forma.barra) {
      const nucleo = new THREE.Mesh(this.#barra(forma), new THREE.MeshBasicMaterial({ color: cor.clone().lerp(new THREE.Color('#fff'), 0.5) }));
      g.add(nucleo);
    }
    const s = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: brilho(), color: cor, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }),
    );
    s.scale.setScalar(forma.brilho);
    g.add(s);
    g.position.set(b.x, b.y, b.z);
    g.lookAt(b.x + b.vx, b.y + b.vy, b.z + b.vz);
    this.scene.add(g);
    this.tiros.set(b.id, { b, g });
  }

  removerTiro(id) {
    const t = this.tiros.get(id);
    if (!t) return null;
    this.scene.remove(t.g);
    this.tiros.delete(id);
    return t.b;
  }

  /** Clarão rápido + fagulhas. tamanho 1 = faísca de acerto, ~4 = explosão de nave. */
  explosao(x, y, z, tamanho = 1, cor = '#ffb050') {
    const flash = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: brilho(), color: new THREE.Color(cor), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }),
    );
    flash.position.set(x, y, z);
    this.scene.add(flash);
    const n = Math.round(14 * tamanho);
    const pos = new Float32Array(n * 3);
    const vel = [];
    for (let i = 0; i < n; i++) {
      pos.set([x, y, z], i * 3);
      const v = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 1.6 - 0.3, Math.random() * 2 - 1)
        .normalize()
        .multiplyScalar((8 + Math.random() * 18) * Math.sqrt(tamanho));
      vel.push(v);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ color: '#ffd28a', size: 0.5 + tamanho * 0.25, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }),
    );
    this.scene.add(pts);
    this.particulas.push({ flash, pts, vel, vida: 0, dur: 0.35 + tamanho * 0.25, tamanho });
  }

  /**
   * Avança tiros e partículas. aoAvancar(b) pode devolver true para o tiro sumir
   * (usado no tiro do próprio jogador, que some ao encostar num alvo na tela).
   */
  atualizar(dt, aoAvancar) {
    for (const [id, t] of this.tiros) {
      let vivo = true;
      // Tiros andam no mesmo passo fixo da simulação, para bater com o servidor.
      t.acc = (t.acc ?? 0) + dt;
      while (vivo && t.acc >= 1 / 30) {
        t.acc -= 1 / 30;
        vivo = stepBullet(t.b);
        if (vivo && aoAvancar?.(t.b)) {
          vivo = false;
          this.explosao(t.b.x, t.b.y, t.b.z, 0.6, '#9ff');
        }
      }
      if (!vivo) {
        if (t.b.vida > 0) this.explosao(t.b.x, t.b.y, t.b.z, 0.4, '#ffcf90');
        this.removerTiro(id);
        continue;
      }
      t.g.position.set(t.b.x, t.b.y, t.b.z);
    }

    this.particulas = this.particulas.filter((p) => {
      p.vida += dt;
      const k = p.vida / p.dur;
      if (k >= 1) {
        this.scene.remove(p.flash, p.pts);
        p.pts.geometry.dispose();
        return false;
      }
      p.flash.scale.setScalar(p.tamanho * 6 * (0.4 + k * 1.6));
      p.flash.material.opacity = 1 - k;
      const arr = p.pts.geometry.attributes.position.array;
      for (let i = 0; i < p.vel.length; i++) {
        p.vel[i].y -= 18 * dt;
        arr[i * 3] += p.vel[i].x * dt;
        arr[i * 3 + 1] += p.vel[i].y * dt;
        arr[i * 3 + 2] += p.vel[i].z * dt;
      }
      p.pts.geometry.attributes.position.needsUpdate = true;
      p.pts.material.opacity = 1 - k;
      return true;
    });
  }
}
