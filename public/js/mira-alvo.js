// A mira travada na tela, desenhada como no original (CTargetCursor::OnPaint): o efeito
// do encaixe (`target01` no Z, `target02` no X, public/modelos/efeitos/) tocado no lugar
// do alvo, virado para a câmera, por cima de tudo (o original desliga o z-buffer e a
// neblina para ele). Os três triângulos chegam de longe e fecham no alvo em 10 quadros
// e ficam ali, com o ponto (ou o anel) piscando no meio; trocar de alvo recomeça o
// efeito (CEffectSprite::Reset), então a mira "voa" até o novo. Quem escolhe o alvo é
// mira-alvo-regras.js, a mesma regra do servidor.

import * as THREE from 'three';
import {
  criarEfeitoOriginal,
  tocarEfeitoOriginal,
  soltarEfeitoOriginal,
  efeitoOriginalPronto,
} from './efeitos-original.js';
import { EFEITO_MIRA, escalaDaMira } from './mira-alvo-regras.js';

const ORDEM_MIRA = 20; // desenhada depois dos outros transparentes (água −2, nuvem −1, efeitos 0)

export class MiraAlvo {
  /**
   * @param {{ scene: import('three').Scene, camera: import('three').Camera, escala: number }} o
   *   `escala`: metros por unidade do original (a das naves).
   */
  constructor({ scene, camera, escala }) {
    this.scene = scene;
    this.camera = camera;
    this.escala = escala;
    this.encaixes = [null, null]; // por encaixe: { inst, id } tocando agora
  }

  /**
   * Um quadro: `alvos` = [Z, X], cada um null (sem mira) ou { id, raio, pos } com a
   * posição desenhada do alvo (Vector3 ou {x, y, z}).
   */
  atualizar(dt, alvos) {
    for (let enc = 0; enc < 2; enc++) {
      const alvo = alvos?.[enc] ?? null;
      let atual = this.encaixes[enc];
      if (!alvo || !efeitoOriginalPronto(EFEITO_MIRA[enc])) {
        if (atual) this.#soltar(enc);
        continue;
      }
      if (!atual) {
        const inst = criarEfeitoOriginal(EFEITO_MIRA[enc], { loop: true });
        if (!inst) continue;
        porCima(inst);
        this.scene.add(inst.obj);
        atual = this.encaixes[enc] = { inst, id: null };
      }
      if (atual.id !== alvo.id) {
        atual.id = alvo.id;
        atual.inst.t = 0; // alvo novo: os triângulos voltam a fechar de longe
      }
      atual.inst.obj.scale.setScalar(escalaDaMira(alvo.raio ?? 0, this.escala));
      atual.inst.obj.position.set(alvo.pos.x, alvo.pos.y, alvo.pos.z);
      tocarEfeitoOriginal(atual.inst, dt, this.camera);
    }
  }

  /** Some com as duas (morreu, saiu da partida). */
  limpar() {
    this.#soltar(0);
    this.#soltar(1);
  }

  #soltar(enc) {
    const atual = this.encaixes[enc];
    if (!atual) return;
    soltarEfeitoOriginal(atual.inst);
    this.encaixes[enc] = null;
  }
}

/**
 * Como o original desenha a mira: sem esconder atrás de nada (aparece por cima da rocha
 * e do casco) e sem neblina. A peça sólida (os triângulos) vai junto dos transparentes
 * para ser desenhada por último. Ela ESCREVE a profundidade (a do alvo, que o time
 * vê): a névoa de guerra (nevoa.js) acha o ponto do mundo de cada pixel pela
 * profundidade, e sem isso os triângulos herdariam a do que está atrás deles (a água
 * fora da visão) e sairiam cinza. Os materiais são da instância (a reserva do efeito,
 * que só a mira usa), então mexer neles uma vez basta.
 */
function porCima(inst) {
  if (inst.obj.userData.porCima) return;
  inst.obj.userData.porCima = true;
  for (const m of inst.malhas) {
    // Teste sempre passando em vez de desligado: com o teste desligado o WebGL também
    // não grava a profundidade.
    m.material.depthTest = true;
    m.material.depthFunc = THREE.AlwaysDepth;
    m.material.depthWrite = true;
    m.material.fog = false;
    m.material.transparent = true;
    m.material.needsUpdate = true;
    m.renderOrder = ORDEM_MIRA;
  }
}
