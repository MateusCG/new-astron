// Torretas do corredor no cliente: o modelo 3D, o estado que vem do servidor
// (snapshot `torretas`) e o rótulo de cada uma. Quem decide tudo (alvo, vida,
// queda, reconstrução, nível) é o servidor (server/torretas.js); aqui só se mostra.
//
// - A posição e o tamanho saem da planta única (TORRETAS em shared/terrain.js e a
//   construção 'torreta' de shared/obstaculos.js), a mesma da física.
// - O modelo é o torreta.glb do mapa (mid-poly PBR, feito para TORRETA: r 9 × 16 m;
//   public/modelos/mapa/LISTA.md), baixado na tela de carregamento. Nós: a base
//   (pilar até o fundo do lago e o pé de 2,4 m, sempre de pé), `torreta_corpo` (o que
//   tomba), `torreta_cabeca` (gira em y, canos para −z na altura de voo) e
//   `torreta_destrocos` (no pé e na água, só com ela caída).
// - Caída (viva false), sai da física com definirObstaculoAtivo (o mesmo que o
//   servidor faz), para a predição da nave passar por onde ela estava sem tranco; no
//   cenário o corpo tomba e afunda, e ficam o pé baixo e os destroços. Reconstruída,
//   o corpo sobe do chão.
// - Cor do time relativa a quem olha (IDENTIDADE-VISUAL.md): o `neon_time` de cada
//   cópia é pintado de turquesa nas do seu time e de vermelho nas do outro, como as
//   bases; esse material é da torreta, então o sensor pulsa mexendo nele, e caída
//   ela quase apaga.
// - A cabeça gira para o alvo (`alvo` do snapshot, posição tirada das entidades) e
//   vira na hora para o rumo do tiro (evento 'tiro' com fonte 'torreta').
// - Rótulo: o mesmo das naves (hud.rotulosNaves), "Torreta NV n" com a barra de
//   vida, só nas de pé.

import * as THREE from 'three';
import { TORRETAS } from '/shared/terrain.js';
import { OBSTACULOS, definirObstaculoAtivo } from '/shared/obstaculos.js';
import { HOVER } from '/shared/sim.js';
import { instanciaMapa, pintar, neon } from './mapa-modelos.js';

const COR_TIME = { meu: new THREE.Color('#00efc0'), outro: new THREE.Color('#ff3b2a') };
const QUEDA_S = 0.9; // s do tombo até sobrarem os destroços
const SUBIDA_S = 1.2; // s da torreta reconstruída subindo do chão
const GIRO_CABECA = 4; // rad/s: quanto a cabeça gira por segundo atrás do alvo
const ALTURA_ROTULO = 14; // m acima do chão (o HUD soma mais 6)
const NEON_CAIDA = 0.08; // luz do time quase apagada na torreta caída

/** Yaw (convenção de shared/sim.js) de quem olha de (x, z) para (ax, az). */
const yawPara = (x, z, ax, az) => Math.atan2(-(ax - x), -(az - z));

/**
 * Cópia do modelo de torreta na origem (pé no chão de voo, y = 0), canos para −z, ou
 * null se o modelo ainda não chegou.
 * userData: corpo (o que tomba), cabeca (gira em y), destrocos, neon (o material do time).
 */
export function criarTorreta({ aliado = true } = {}) {
  const g = instanciaMapa('torreta');
  if (!g) return null;
  const cor = neon(aliado ? COR_TIME.meu : COR_TIME.outro, 1);
  pintar(g, 'neon_time', cor);
  const destrocos = g.getObjectByName('torreta_destrocos');
  destrocos.visible = false;
  g.userData = { corpo: g.getObjectByName('torreta_corpo'), cabeca: g.getObjectByName('torreta_cabeca'), destrocos, neon: cor };
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
      const obj = criarTorreta({ aliado: t.time === meuTime });
      if (!obj) continue;
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
      const { corpo, cabeca, destrocos, neon } = it.obj.userData;
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
      if (!it.viva) {
        neon.emissiveIntensity = NEON_CAIDA;
        continue;
      }
      // Mira: o alvo do servidor; sem alvo, varre devagar em volta do repouso.
      const p = it.alvo ? posicao(it.alvo) : null;
      const quer = p ? yawPara(it.t.x, it.t.z, p.x, p.z) : it.yawRepouso + Math.sin(tempo * 0.4 + it.t.x) * 0.6;
      let d = quer - it.yaw;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      it.yaw += Math.max(-GIRO_CABECA * dt, Math.min(GIRO_CABECA * dt, d));
      cabeca.rotation.y = it.yaw;
      // Sensor (e o neon da torreta): aceso firme mirando alguém, pulsando devagar em repouso.
      neon.emissiveIntensity = p ? 1.2 : 0.7 + 0.3 * Math.sin(tempo * 2 + id.length);
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

