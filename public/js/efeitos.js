// Efeitos visuais: tiros, faíscas de acerto e explosões. Só aparência; quem decide
// se o tiro acertou é o servidor (eventos 'acerto' e 'morte' do snapshot).

import * as THREE from 'three';
import { stepBullet } from '/shared/sim.js';
import { brilho } from './nave.js';

// Cores dos efeitos de arma (ver IDENTIDADE-VISUAL.md): o dreno é violeta e o
// criogênico azul-gelo, para não se confundirem com o laser ciano, o plasma verde
// nem com o vermelho de inimigo.
const COR_DRENO = new THREE.Color('#d070ff');
const COR_GELO = new THREE.Color('#a8e8ff');
const COR_TIRO = {
  laser: new THREE.Color('#5ff7ff'),
  laserDuplo: new THREE.Color('#5ff7ff'),
  laserTriplo: new THREE.Color('#5ff7ff'),
  dreno: COR_DRENO,
  crio: COR_GELO,
  plasma: new THREE.Color('#7dff6a'),
  inimigo: new THREE.Color('#ff4a2a'),
};
// Forma de cada tiro: barra (comprimento em m, 0 = sem barra) + brilho. Os lasers
// de vários projéteis usam barras menores, já que saem juntas; o dreno é uma bola
// de brilho e o criogênico um estilhaço curto e grosso.
const FORMA_TIRO = {
  laser: { barra: 7, grossura: 0.35, brilho: 3 },
  laserDuplo: { barra: 6, grossura: 0.28, brilho: 2.4 },
  laserTriplo: { barra: 5, grossura: 0.25, brilho: 2.2 },
  dreno: { barra: 0, brilho: 4.2 },
  crio: { barra: 3, grossura: 0.5, brilho: 3.4 },
  plasma: { barra: 0, brilho: 6 },
};
// Aura de quem está sob efeito: brilho em volta da nave + partículas. O dreno
// "puxa" a vida para fora (partículas violeta subindo); o gelo cai em cristais.
const AURA_PARTICULA_S = 0.07; // intervalo entre partículas por nave afetada

function spriteAditivo(cor, tamanho) {
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: brilho(), color: cor, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }),
  );
  s.scale.setScalar(tamanho);
  return s;
}

export class Efeitos {
  /** Libera da GPU as geometrias guardadas fora da cena (saída da partida). */
  liberar() {
    for (const geo of this.geoBarra.values()) geo.dispose();
    this.geoBarra.clear();
  }

  constructor(scene) {
    this.scene = scene;
    this.tiros = new Map();
    this.particulas = [];
    this.geoBarra = new Map();
    this.auras = [];
    this.v = new THREE.Vector3();
  }

  /**
   * Mostra na nave (grupo do Three.js) os efeitos ativos vindos do servidor:
   * dreno (aura violeta pulsando + partículas subindo) e lento (aura azul-gelo +
   * cristais caindo). Chamar a cada quadro para cada nave visível.
   */
  estadoNave(obj, { dreno = false, lento = false }, dt, tempo) {
    let a = obj.userData.auras;
    if (!a) {
      if (!dreno && !lento) return;
      a = obj.userData.auras = { dreno: spriteAditivo(COR_DRENO, 11), gelo: spriteAditivo(COR_GELO, 13), acc: 0 };
      obj.add(a.dreno, a.gelo);
    }
    a.dreno.visible = dreno;
    a.gelo.visible = lento;
    if (dreno) a.dreno.material.opacity = 0.45 + 0.3 * Math.sin(tempo * 9);
    if (lento) a.gelo.material.opacity = 0.5 + 0.1 * Math.sin(tempo * 3);
    if (!dreno && !lento) {
      a.acc = 0;
      return;
    }
    a.acc += dt;
    obj.getWorldPosition(this.v);
    while (a.acc >= AURA_PARTICULA_S) {
      a.acc -= AURA_PARTICULA_S;
      if (dreno) this.#particula(COR_DRENO, 2, 7, 0.8);
      if (lento) this.#particula(COR_GELO, 1.6, -4, 0.9);
    }
  }

  #particula(cor, tamanho, subida, dur) {
    const s = spriteAditivo(cor, tamanho);
    s.position.set(this.v.x + (Math.random() * 2 - 1) * 4.5, this.v.y + (Math.random() * 2 - 1) * 1.5, this.v.z + (Math.random() * 2 - 1) * 4.5);
    this.scene.add(s);
    this.auras.push({ s, subida, vida: 0, dur, tamanho });
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

    this.auras = this.auras.filter((p) => {
      p.vida += dt;
      const k = p.vida / p.dur;
      if (k >= 1) {
        this.scene.remove(p.s);
        p.s.material.dispose();
        return false;
      }
      p.s.position.y += p.subida * dt;
      p.s.material.opacity = 1 - k;
      p.s.scale.setScalar(p.tamanho * (1 - k * 0.5));
      return true;
    });

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
