// Torretas do corredor no cliente: o modelo 3D, o estado que vem do servidor
// (snapshot `torretas`) e o rótulo de cada uma. Quem decide tudo (alvo, vida,
// queda, reconstrução, nível) é o servidor (server/torretas.js); aqui só se mostra.
//
// - A posição e o tamanho saem da planta única (TORRETAS em shared/terrain.js e a
//   construção 'torreta' de shared/obstaculos.js), a mesma da física.
// - Caída (viva false), sai da física com definirObstaculoAtivo (o mesmo que o
//   servidor faz), para a predição da nave passar por onde ela estava sem tranco; no
//   cenário o corpo tomba e afunda, e ficam o pé baixo e destroços (até 2,5 m, a
//   nave passa por cima). Reconstruída, o corpo sobe do chão.
// - Cor do time relativa a quem olha (IDENTIDADE-VISUAL.md): neon turquesa nas do
//   seu time, vermelho nas do outro, como as bases. Metal cinza, facetado.
// - A cabeça gira para o alvo (`alvo` do snapshot, posição tirada das entidades) e
//   vira na hora para o rumo do tiro (evento 'tiro' com fonte 'torreta').
// - Rótulo: o mesmo das naves (hud.rotulosNaves), "Torreta NV n" com a barra de
//   vida, só nas de pé.

import * as THREE from 'three';
import { TORRETAS } from '/shared/terrain.js';
import { OBSTACULOS, definirObstaculoAtivo } from '/shared/obstaculos.js';
import { HOVER } from '/shared/sim.js';

const COR_TIME = { meu: new THREE.Color('#00efc0'), outro: new THREE.Color('#ff3b2a') };
const QUEDA_S = 0.9; // s do tombo até sobrarem os destroços
const SUBIDA_S = 1.2; // s da torreta reconstruída subindo do chão
const GIRO_CABECA = 4; // rad/s: quanto a cabeça gira por segundo atrás do alvo
const ALTURA_PE = 2.4; // m do toco que fica de pé (abaixo da altura de voo)
const ALTURA_ROTULO = 14; // m acima do chão (o HUD soma mais 6)

function matMetal(cor, extra = {}) {
  return new THREE.MeshStandardMaterial({ color: cor, metalness: 0.3, roughness: 0.65, flatShading: true, ...extra });
}

function matNeon(cor) {
  return new THREE.MeshStandardMaterial({ color: cor, emissive: cor, emissiveIntensity: 1, flatShading: true });
}

/** Yaw (convenção de shared/sim.js) de quem olha de (x, z) para (ax, az). */
const yawPara = (x, z, ax, az) => Math.atan2(-(ax - x), -(az - z));

/**
 * Modelo de uma torreta na origem (pé no chão, y = 0), canos para -z.
 * userData: corpo (o que tomba), cabeca (gira em y), destrocos, neon (materiais).
 */
export function criarTorreta({ aliado = true, raio = 4.5, altura = 16 } = {}) {
  const cor = aliado ? COR_TIME.meu : COR_TIME.outro;
  const metal = matMetal('#5d6866');
  const escuro = matMetal('#3a4442');
  const neon = matNeon(cor);
  const g = new THREE.Group();

  // Pé: toco sextavado que fica mesmo com a torreta caída.
  const pe = new THREE.Mesh(new THREE.CylinderGeometry(raio * 0.92, raio, ALTURA_PE, 6), escuro);
  pe.position.y = ALTURA_PE / 2;
  g.add(pe);

  const corpo = new THREE.Group();
  const torre = new THREE.Mesh(new THREE.CylinderGeometry(raio * 0.72, raio * 0.86, HOVER - 1 - ALTURA_PE, 6), metal);
  torre.position.y = ALTURA_PE + (HOVER - 1 - ALTURA_PE) / 2;
  const faixa = new THREE.Mesh(new THREE.CylinderGeometry(raio * 0.76, raio * 0.76, 0.6, 6), neon);
  faixa.position.y = HOVER - 2;
  corpo.add(torre, faixa);

  // Cabeça giratória na altura das naves: carcaça, dois canos e o sensor no alto.
  const cabeca = new THREE.Group();
  cabeca.position.y = HOVER - 1;
  const carcaca = new THREE.Mesh(new THREE.CylinderGeometry(raio * 0.58, raio * 0.66, 3.2, 8), escuro);
  carcaca.position.y = 1.6;
  const tampa = new THREE.Mesh(new THREE.CylinderGeometry(raio * 0.3, raio * 0.58, 1.2, 8), metal);
  tampa.position.y = 3.8;
  cabeca.add(carcaca, tampa);
  for (const lado of [-1, 1]) {
    const cano = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.4, 5.2, 6), metal);
    cano.rotation.x = Math.PI / 2;
    cano.position.set(lado * 0.95, 1, -raio * 0.55 - 2.2);
    const boca = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.5, 6), neon);
    boca.rotation.x = Math.PI / 2;
    boca.position.set(lado * 0.95, 1, -raio * 0.55 - 4.7);
    cabeca.add(cano, boca);
  }
  const mastro = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.25, altura - HOVER - 4.6, 5), escuro);
  mastro.position.y = 4.4 + (altura - HOVER - 4.6) / 2;
  const sensor = new THREE.Mesh(new THREE.OctahedronGeometry(0.9, 0), neon);
  sensor.position.y = altura - HOVER + 0.2;
  cabeca.add(mastro, sensor);
  corpo.add(cabeca);
  g.add(corpo);

  // Destroços: lascas escuras deitadas em volta do pé (só com ela caída).
  const destrocos = new THREE.Group();
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + 0.5;
    const r = raio + 1.2 + (k % 3) * 1.6;
    const lasca = new THREE.Mesh(new THREE.BoxGeometry(1.4 + (k % 2), 1 + (k % 3) * 0.3, 2.6 + (k % 3)), k % 2 ? escuro : metal);
    lasca.position.set(Math.cos(a) * r, 0.5, Math.sin(a) * r);
    lasca.rotation.set(0.3 * (k % 2), a, 0.25);
    destrocos.add(lasca);
  }
  // O cano solto no chão, para a silhueta caída dizer "torreta".
  const canoSolto = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.4, 5.2, 6), metal);
  canoSolto.rotation.set(Math.PI / 2, 0, 0.6);
  canoSolto.position.set(raio + 2.5, 0.4, -1);
  destrocos.add(canoSolto);
  destrocos.visible = false;
  g.add(destrocos);

  g.traverse((o) => {
    if (o.isMesh) o.castShadow = o.receiveShadow = true;
  });
  g.userData = { corpo, cabeca, destrocos, sensor };
  return g;
}

export class TorretasNaTela {
  /**
   * @param {{ scene: THREE.Scene, meuTime?: number }} opcoes
   */
  constructor({ scene, meuTime = 0 }) {
    this.scene = scene;
    this.meuTime = meuTime;
    this.estado = new Map(); // id -> último estado do servidor
    this.lista = new Map(); // id -> { t, obj, chao, topo, viva, anim, yaw, yawAlvo }
    const planta = new Map(OBSTACULOS.filter((o) => o.grupo === 'torreta').map((o) => [o.id, o]));
    for (const t of TORRETAS) {
      const o = planta.get(t.id);
      const obj = criarTorreta({ aliado: t.time === meuTime, raio: o.raio, altura: o.topo - o.chao });
      obj.position.set(t.x, o.chao, t.z);
      // Em repouso, olha para o lado do minério (para onde vem quem ataca).
      const yaw = t.z > 0 ? 0 : Math.PI;
      obj.userData.cabeca.rotation.y = yaw;
      scene.add(obj);
      this.lista.set(t.id, {
        t,
        obj,
        chao: o.chao,
        viva: true,
        anim: null, // { tipo: 'queda' | 'subida', t }
        yaw,
        yawRepouso: yaw,
        alvo: 0,
        pos: new THREE.Vector3(t.x, o.chao + ALTURA_ROTULO, t.z),
      });
    }
  }

  /**
   * Aplica o estado do snapshot. Devolve as torretas que acabaram de cair, como
   * { id, x, y, z } (o meio delas, para quem chama desenhar a explosão).
   */
  atualizar(torretas = []) {
    const cairam = [];
    for (const r of torretas) {
      const it = this.lista.get(r.id);
      if (!it) continue;
      this.estado.set(r.id, r);
      definirObstaculoAtivo(r.id, r.viva);
      it.alvo = r.alvo ?? 0;
      if (it.viva && !r.viva) {
        it.anim = { tipo: 'queda', t: 0 };
        cairam.push({ id: r.id, x: it.t.x, y: it.chao + HOVER, z: it.t.z });
      } else if (!it.viva && r.viva) {
        it.anim = { tipo: 'subida', t: 0 };
        it.obj.userData.corpo.visible = true;
        it.obj.userData.destrocos.visible = false;
      }
      it.viva = r.viva;
    }
    return cairam;
  }

  /** Tiro de uma torreta (evento): a cabeça vira na hora para o rumo dele. */
  disparou(id, vx, vz) {
    const it = this.lista.get(id);
    if (it) it.yaw = it.yawAlvo = Math.atan2(-vx, -vz);
  }

  /**
   * A cada quadro: animações de queda e subida e a cabeça girando atrás do alvo.
   * `posicao(id)` dá a posição desenhada de uma entidade (ou null).
   */
  quadro(dt, tempo, posicao) {
    for (const [id, it] of this.lista) {
      const { corpo, cabeca, destrocos, sensor } = it.obj.userData;
      if (it.anim) {
        it.anim.t += dt;
        if (it.anim.tipo === 'queda') {
          const k = Math.min(1, it.anim.t / QUEDA_S);
          corpo.rotation.x = k * k * 1.4;
          corpo.position.y = -k * k * 7;
          if (k >= 1) {
            corpo.visible = false;
            destrocos.visible = true;
            it.anim = null;
          }
        } else {
          const k = Math.min(1, it.anim.t / SUBIDA_S);
          corpo.rotation.x = 0;
          corpo.position.y = -(1 - k) * (1 - k) * 12;
          if (k >= 1) it.anim = null;
        }
      } else if (!it.viva) {
        corpo.visible = false;
        destrocos.visible = true;
      }
      if (!it.viva) continue;
      // Mira: o alvo do servidor; sem alvo, varre devagar em volta do repouso.
      const p = it.alvo ? posicao(it.alvo) : null;
      const quer = p ? yawPara(it.t.x, it.t.z, p.x, p.z) : it.yawRepouso + Math.sin(tempo * 0.4 + it.t.x) * 0.6;
      let d = quer - it.yaw;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      it.yaw += Math.max(-GIRO_CABECA * dt, Math.min(GIRO_CABECA * dt, d));
      cabeca.rotation.y = it.yaw;
      // Sensor: aceso firme mirando alguém, pulsando devagar em repouso.
      sensor.material.emissiveIntensity = p ? 1.2 : 0.7 + 0.3 * Math.sin(tempo * 2 + id.length);
    }
  }

  /** Rótulos das torretas de pé, no formato de hud.rotulosNaves. */
  rotulos() {
    const lista = [];
    for (const [id, it] of this.lista) {
      const r = this.estado.get(id);
      if (!it.viva || !r) continue;
      lista.push({ id, nome: 'Torreta', aliado: it.t.time === this.meuTime, hp: r.vida, maxHp: r.max, pos: it.pos, nivel: r.nivel });
    }
    return lista;
  }

  /** Estado do servidor na ordem de TORRETAS (para o minimapa e o painel). */
  estados() {
    return TORRETAS.map((t) => this.estado.get(t.id)).filter(Boolean);
  }

  /**
   * Saída da partida: põe as torretas de pé na física. Os modelos ficam na cena,
   * que liberarCena (cena.js) solta da GPU junto com o resto.
   */
  limpar() {
    for (const t of TORRETAS) definirObstaculoAtivo(t.id, true);
    this.lista.clear();
  }
}

