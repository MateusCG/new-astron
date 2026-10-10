// Efeitos visuais: tiros, faíscas de acerto e explosões. Só aparência; quem decide
// se o tiro acertou é o servidor (eventos 'acerto' e 'morte' do snapshot).
//
// Armas novas (cores no IDENTIDADE-VISUAL.md): o míssil teleguiado é um corpo
// metálico com chama branco-quente e rastro de fumaça cinza, e vira conforme a
// curva que o servidor manda (corrigirGuiados); a mina é um disco no chão com uma
// luz que pulsa (turquesa a do seu time, vermelha a do outro; devagar enquanto não
// arma, rápido armada); a onda de choque e a explosão da mina são anéis que abrem
// no plano, na cor do time de quem usou; o pulso EMP é uma bola branco-elétrica, e
// quem está sob EMP solta faíscas na mesma cor.

import * as THREE from 'three';
import { stepBullet } from '/shared/sim.js';
import { brilho } from './nave.js';

// Cores dos efeitos de arma (ver IDENTIDADE-VISUAL.md): o dreno é violeta e o
// criogênico azul-gelo, para não se confundirem com o laser ciano, o plasma verde
// nem com o vermelho de inimigo.
const COR_DRENO = new THREE.Color('#d070ff');
const COR_GELO = new THREE.Color('#a8e8ff');
const COR_EMP = new THREE.Color('#c8d2ff');
// Fúria (bônus do objetivo C): âmbar dos objetivos, de onde o bônus vem. Um anel
// fino deitado em volta da nave, pulsando devagar, sem partículas: brilho difuso
// some no deserto alaranjado, e o anel lê bem na câmera de perseguição sem
// competir com tiro, explosão nem com as auras de arma (que são nuvens).
const COR_FURIA = new THREE.Color('#ffb627');
const FURIA_RAIO = 7.5; // m
const FURIA_OPACIDADE = 0.9;
const COR_BRANCO = new THREE.Color('#ffffff'); // estalo mais forte das faíscas do EMP
const COR_CHAMA = new THREE.Color('#fff0c8'); // chama do míssil
const COR_FUMACA = new THREE.Color('#8f8a83'); // rastro do míssil (sem brilho)
const COR_METAL = new THREE.Color('#c9d2d0'); // casco do míssil, o mesmo das naves
// Cor de time relativa a quem olha (mina e anéis): seu time turquesa, o outro vermelho.
export const COR_TIME = { meu: new THREE.Color('#00efc0'), outro: new THREE.Color('#ff3b2a') };
const COR_TIRO = {
  laser: new THREE.Color('#5ff7ff'),
  laserDuplo: new THREE.Color('#5ff7ff'),
  laserTriplo: new THREE.Color('#5ff7ff'),
  dreno: COR_DRENO,
  crio: COR_GELO,
  plasma: new THREE.Color('#7dff6a'),
  missil: COR_CHAMA,
  emp: COR_EMP,
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
  missil: { barra: 0, brilho: 4.5, corpo: true },
  emp: { barra: 0, brilho: 4.6 },
};
// Rastro do míssil: uma baforada de fumaça a cada FUMACA_PASSO m andados (por
// distância, não por quadro: com quadro lento ou correção do servidor o rastro
// continua inteiro), no máximo FUMACA_MAX por quadro; cada uma cresce e some.
const FUMACA_PASSO = 4;
const FUMACA_MAX = 30;
const FUMACA_DUR = 1.2;
// Anel de área (onda de choque e explosão de mina): abre do centro até o raio.
const ANEL_AREA_S = 0.45;
// Faíscas de quem está sob EMP: estalos curtos e rápidos em volta da nave.
const FAISCA_EMP_S = 0.05;
// Mina: piscar da luz (vezes por segundo) desarmada e armada; tamanho em m.
const MINA_PISCA = { desarmada: 1.2, armada: 4 };
const MINA_RAIO_CORPO = 1.6;
// Aura de quem está sob efeito: brilho em volta da nave + partículas. O dreno
// "puxa" a vida para fora (partículas violeta subindo); o gelo cai em cristais.
const AURA_PARTICULA_S = 0.07; // intervalo entre partículas por nave afetada
// Subiu de nível: dois anéis de luz verde-lima (a cor do XP no HUD) abrindo em
// volta da nave e subindo, presos a ela (vão junto enquanto ela voa).
const COR_NIVEL = new THREE.Color('#b6f05a');
const ANEL_NIVEL_S = 1.2;
const ANEL_NIVEL_RAIO = 14; // m no fim da animação

function spriteAditivo(cor, tamanho) {
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: brilho(), color: cor, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }),
  );
  s.scale.setScalar(tamanho);
  return s;
}

/** Anel da fúria: toro fino deitado em volta da nave, aditivo. */
function anelFuria() {
  const anel = new THREE.Mesh(
    new THREE.TorusGeometry(FURIA_RAIO, 0.18, 4, 64, Math.PI * 2),
    new THREE.MeshBasicMaterial({ color: COR_FURIA, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }),
  );
  anel.rotation.x = Math.PI / 2;
  return anel;
}

export class Efeitos {
  /** Libera da GPU as geometrias guardadas fora da cena (saída da partida). */
  liberar() {
    for (const geo of this.geoBarra.values()) geo.dispose();
    this.geoBarra.clear();
    this.atualizarMinas([]);
    for (const r of [this.geoMina, this.geoEspinho, this.geoLuzMina, this.matMina, this.geoMissil, this.geoNarizMissil, this.matMissil, this.geoAnel]) {
      r.dispose();
    }
  }

  constructor(scene) {
    this.scene = scene;
    this.tiros = new Map();
    this.particulas = [];
    this.geoBarra = new Map();
    this.auras = [];
    this.aneis = [];
    this.aneisArea = [];
    this.fumacas = [];
    this.minas = new Map(); // id -> { g, luz, brilho, armada, fase }
    this.tempo = 0;
    this.v = new THREE.Vector3();
    // Peças da mina e do míssil, criadas uma vez e liberadas em liberar().
    this.geoMina = new THREE.CylinderGeometry(MINA_RAIO_CORPO, MINA_RAIO_CORPO * 1.15, 0.6, 8);
    this.geoEspinho = new THREE.ConeGeometry(0.25, 0.9, 4);
    this.geoLuzMina = new THREE.OctahedronGeometry(0.55);
    this.matMina = new THREE.MeshStandardMaterial({ color: '#3a4442', metalness: 0.5, roughness: 0.6, flatShading: true });
    this.geoMissil = new THREE.CylinderGeometry(0.28, 0.4, 2.4, 6);
    this.geoNarizMissil = new THREE.ConeGeometry(0.28, 0.8, 6);
    this.matMissil = new THREE.MeshBasicMaterial({ color: COR_METAL });
    this.geoAnel = new THREE.RingGeometry(0.86, 1, 48);
  }

  /** Anel de luz de "subiu de nível" em volta da nave (grupo do Three.js). */
  anelNivel(obj) {
    for (const atraso of [0, 0.25]) {
      const anel = new THREE.Mesh(
        new THREE.TorusGeometry(1, 0.035, 4, 48),
        new THREE.MeshBasicMaterial({ color: COR_NIVEL, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }),
      );
      anel.rotation.x = Math.PI / 2;
      anel.visible = false;
      obj.add(anel);
      this.aneis.push({ obj, anel, vida: -atraso });
    }
    const clarao = spriteAditivo(COR_NIVEL, 8);
    obj.add(clarao);
    this.aneis.push({ obj, anel: clarao, vida: 0, clarao: true });
  }

  /**
   * Mostra na nave (grupo do Three.js) os efeitos ativos vindos do servidor:
   * dreno (aura violeta pulsando + partículas subindo) e lento (aura azul-gelo +
   * cristais caindo), e a fúria do time (anel âmbar, objetivo C). Chamar a
   * cada quadro para cada nave visível.
   */
  estadoNave(obj, { dreno = false, lento = false, emp = false, furia = false }, dt, tempo) {
    let a = obj.userData.auras;
    if (!a) {
      if (!dreno && !lento && !emp && !furia) return;
      a = obj.userData.auras = {
        dreno: spriteAditivo(COR_DRENO, 11),
        gelo: spriteAditivo(COR_GELO, 13),
        emp: spriteAditivo(COR_EMP, 14),
        furia: anelFuria(),
        acc: 0,
        accEmp: 0,
      };
      obj.add(a.dreno, a.gelo, a.emp, a.furia);
    }
    a.dreno.visible = dreno;
    a.gelo.visible = lento;
    a.emp.visible = emp;
    a.furia.visible = furia;
    if (furia) a.furia.material.opacity = FURIA_OPACIDADE * (0.7 + 0.3 * Math.sin(tempo * 2.5));
    if (dreno) a.dreno.material.opacity = 0.45 + 0.3 * Math.sin(tempo * 9);
    if (lento) a.gelo.material.opacity = 0.5 + 0.1 * Math.sin(tempo * 3);
    // EMP: a aura falha como um curto-circuito (pisca irregular).
    if (emp) a.emp.material.opacity = Math.sin(tempo * 37) * Math.sin(tempo * 23) > 0.1 ? 0.55 : 0.12;
    if (!dreno && !lento && !emp) {
      a.acc = a.accEmp = 0;
      return;
    }
    obj.getWorldPosition(this.v);
    if (dreno || lento) {
      a.acc += dt;
      while (a.acc >= AURA_PARTICULA_S) {
        a.acc -= AURA_PARTICULA_S;
        if (dreno) this.#particula(COR_DRENO, 2, 7, 0.8);
        if (lento) this.#particula(COR_GELO, 1.6, -4, 0.9);
      }
    }
    if (emp) {
      a.accEmp += dt;
      while (a.accEmp >= FAISCA_EMP_S) {
        a.accEmp -= FAISCA_EMP_S;
        this.#particula(Math.random() < 0.5 ? COR_EMP : COR_BRANCO, 1.8 + Math.random() * 2, (Math.random() * 2 - 1) * 6, 0.14, 6);
      }
    }
  }

  #particula(cor, tamanho, subida, dur, espalha = 4.5) {
    const s = spriteAditivo(cor, tamanho);
    s.position.set(
      this.v.x + (Math.random() * 2 - 1) * espalha,
      this.v.y + (Math.random() * 2 - 1) * 1.5,
      this.v.z + (Math.random() * 2 - 1) * espalha,
    );
    this.scene.add(s);
    this.auras.push({ s, subida, vida: 0, dur, tamanho });
  }

  /**
   * Anel que abre no plano a partir de (x, y, z) até `raio` m, na cor dada: onda de
   * choque e explosão de mina. Dois anéis (o segundo um pouco atrás) e um clarão.
   */
  anelArea(x, y, z, raio, cor) {
    for (const atraso of [0, 0.08]) {
      const anel = new THREE.Mesh(
        this.geoAnel,
        new THREE.MeshBasicMaterial({ color: cor, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide }),
      );
      anel.rotation.x = -Math.PI / 2;
      anel.position.set(x, y, z);
      anel.visible = false;
      this.scene.add(anel);
      this.aneisArea.push({ anel, raio, vida: -atraso });
    }
    const clarao = spriteAditivo(cor, raio * 0.6);
    clarao.position.set(x, y, z);
    this.scene.add(clarao);
    this.aneisArea.push({ anel: clarao, raio, vida: 0, clarao: true });
  }

  /**
   * Minas do snapshot ([{ id, time, x, y, z, armada }]): cria as novas, tira as que
   * sumiram (explodiram, venceram ou passaram do limite). Cor relativa a meuTime.
   */
  atualizarMinas(lista, meuTime) {
    const vistas = new Set();
    for (const m of lista ?? []) {
      vistas.add(m.id);
      let v = this.minas.get(m.id);
      if (!v) {
        const cor = m.time === meuTime ? COR_TIME.meu : COR_TIME.outro;
        const g = new THREE.Group();
        const corpo = new THREE.Mesh(this.geoMina, this.matMina);
        corpo.position.y = 0.3;
        corpo.castShadow = true;
        g.add(corpo);
        for (let i = 0; i < 4; i++) {
          const esp = new THREE.Mesh(this.geoEspinho, this.matMina);
          const ang = (i * Math.PI) / 2 + Math.PI / 4;
          esp.position.set(Math.cos(ang) * MINA_RAIO_CORPO, 0.35, Math.sin(ang) * MINA_RAIO_CORPO);
          esp.rotation.set(Math.sin(ang) * 1.2, 0, -Math.cos(ang) * 1.2);
          g.add(esp);
        }
        const luz = new THREE.Mesh(this.geoLuzMina, new THREE.MeshStandardMaterial({ color: cor, emissive: cor, emissiveIntensity: 1, flatShading: true }));
        luz.position.y = 0.85;
        g.add(luz);
        const brilhoMina = spriteAditivo(cor, 5);
        brilhoMina.position.y = 1;
        g.add(brilhoMina);
        this.scene.add(g);
        v = { g, luz, brilho: brilhoMina, fase: Math.random() * Math.PI * 2 };
        this.minas.set(m.id, v);
      }
      v.g.position.set(m.x, m.y, m.z);
      v.armada = !!m.armada;
    }
    for (const [id, v] of this.minas) {
      if (vistas.has(id)) continue;
      this.scene.remove(v.g);
      v.luz.material.dispose();
      v.brilho.material.dispose();
      this.minas.delete(id);
    }
  }

  /**
   * Corrige os mísseis teleguiados com o estado do servidor (lista `guiados` do
   * snapshot): o cliente não prevê a curva, então posição e rumo vêm de lá. Míssil
   * que ainda não estava na tela (entrou agora, ou o evento se perdeu) é criado.
   */
  corrigirGuiados(lista) {
    for (const g of lista ?? []) {
      const t = this.tiros.get(g.id);
      if (!t) {
        this.tiro({ id: g.id, kind: 'missil', x: g.x, y: g.y, z: g.z, vx: g.vx, vy: g.vy, vz: g.vz, vida: 3 });
        continue;
      }
      Object.assign(t.b, { x: g.x, y: g.y, z: g.z, vx: g.vx, vy: g.vy, vz: g.vz });
      t.acc = 0;
    }
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
    if (forma.corpo) {
      // Míssil: casco metálico (o nariz para a frente, +z do grupo depois do lookAt).
      const casco = new THREE.Mesh(this.geoMissil, this.matMissil);
      casco.rotation.x = Math.PI / 2;
      const nariz = new THREE.Mesh(this.geoNarizMissil, this.matMissil);
      nariz.rotation.x = Math.PI / 2;
      nariz.position.z = 1.6;
      g.add(casco, nariz);
    }
    const s = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: brilho(), color: cor, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }),
    );
    s.scale.setScalar(forma.brilho);
    if (forma.corpo) s.position.z = -1.5; // a chama fica atrás do casco
    g.add(s);
    g.position.set(b.x, b.y, b.z);
    g.lookAt(b.x + b.vx, b.y + b.vy, b.z + b.vz);
    this.scene.add(g);
    this.tiros.set(b.id, { b, g, guiado: !!forma.corpo, rastro: { x: b.x, y: b.y, z: b.z } });
  }

  /** Uma baforada de fumaça (sem brilho: rastro do míssil) no ponto dado. */
  #fumaca(x, y, z) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: brilho(), color: COR_FUMACA, depthWrite: false, transparent: true, opacity: 0.7 }));
    s.position.set(x, y, z);
    s.scale.setScalar(2);
    this.scene.add(s);
    this.fumacas.push({ s, vida: 0 });
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
      if (t.guiado) {
        // O míssil vira com a curva e deixa fumaça para trás.
        t.g.lookAt(t.b.x + t.b.vx, t.b.y + t.b.vy, t.b.z + t.b.vz);
        const r = t.rastro;
        const dist = Math.hypot(t.b.x - r.x, t.b.y - r.y, t.b.z - r.z);
        const n = Math.min(FUMACA_MAX, Math.floor(dist / FUMACA_PASSO));
        for (let i = 1; i <= n; i++) {
          const k = (i * FUMACA_PASSO) / dist;
          this.#fumaca(r.x + (t.b.x - r.x) * k, r.y + (t.b.y - r.y) * k, r.z + (t.b.z - r.z) * k);
        }
        if (n) Object.assign(r, { x: t.b.x, y: t.b.y, z: t.b.z });
      }
    }

    this.tempo += dt;
    for (const m of this.minas.values()) {
      // Pulsa devagar enquanto não arma e rápido armada.
      const f = m.armada ? MINA_PISCA.armada : MINA_PISCA.desarmada;
      const k = 0.5 + 0.5 * Math.sin(this.tempo * f * Math.PI * 2 + m.fase);
      m.luz.material.emissiveIntensity = m.armada ? 0.2 + k : 0.15 + 0.5 * k;
      m.brilho.material.opacity = m.armada ? 0.25 + 0.75 * k : 0.12 + 0.3 * k;
    }

    this.aneisArea = this.aneisArea.filter((a) => {
      a.vida += dt;
      const k = a.vida / ANEL_AREA_S;
      if (k >= 1) {
        this.scene.remove(a.anel);
        a.anel.material.dispose();
        return false;
      }
      if (k < 0) return true;
      a.anel.visible = true;
      const sai = 1 - (1 - k) * (1 - k);
      if (a.clarao) {
        a.anel.material.opacity = (1 - k) * 0.6;
      } else {
        a.anel.scale.setScalar(Math.max(0.5, a.raio * sai));
        a.anel.material.opacity = (1 - k) * 0.9;
      }
      return true;
    });

    this.fumacas = this.fumacas.filter((p) => {
      p.vida += dt;
      const k = p.vida / FUMACA_DUR;
      if (k >= 1) {
        this.scene.remove(p.s);
        p.s.material.dispose();
        return false;
      }
      p.s.position.y += 1.5 * dt;
      p.s.scale.setScalar(2 + 5 * k);
      p.s.material.opacity = 0.7 * (1 - k);
      return true;
    });

    this.aneis = this.aneis.filter((a) => {
      a.vida += dt;
      const k = a.vida / ANEL_NIVEL_S;
      if (k >= 1) {
        a.obj.remove(a.anel);
        a.anel.geometry?.dispose();
        a.anel.material.dispose();
        return false;
      }
      if (k < 0) return true;
      a.anel.visible = true;
      const sai = 1 - (1 - k) * (1 - k); // abre rápido e freia
      if (a.clarao) {
        a.anel.scale.setScalar(8 + 6 * sai);
        a.anel.material.opacity = (1 - k) * 0.45;
      } else {
        a.anel.scale.setScalar(3 + (ANEL_NIVEL_RAIO - 3) * sai);
        a.anel.position.y = -2 + 7 * k;
        a.anel.material.opacity = (1 - k) * 0.8;
      }
      return true;
    });

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
