// Objetivos do mapa no cliente: aplica o estado que vem do servidor (snapshot `obj`,
// um objeto { [id]: estado }) na física e no cenário, e desenha o rótulo de cada um.
// Quem decide tudo (vida, progresso, recarga, quem tomou) é o servidor
// (server/objetivos.js: BS0, BS1, P0, P1, NUCLEO; server/jungle.js: BA0, BA1, SONDA,
// MEDUSA); aqui só se mostra.
//
// - Torre de suporte (BS0/BS1): em 'recarga' está caída e sai da física com
//   definirObstaculoAtivo (o mesmo que o servidor faz), para a predição da nave
//   passar por onde ela estava sem tranco. O cenário (cena.definirObjetivo) troca o
//   modelo de pé pelo caído, apaga o âmbar em 'espera' e acende em 'ativo'.
// - Plataforma de ouro (P0/P1): o feixe acende com alguém pousado (`quem`), a barra
//   enche até POUSO_PLATAFORMA_S, contestado pisca.
// - Núcleo de He-3, Medusa, SN-4 (buff de ataque) e sonda: a vida no rótulo; quando
//   não estão no mapa, quanto falta para aparecer ou voltar e quem tomou por último.
// - Rótulo (DOM, como os nomes das naves): ícone âmbar do objetivo e o estado numa
//   linha, com barra quando há vida ou progresso. Cor do time relativa a quem olha:
//   seu time em turquesa, o outro em vermelho. O da sonda acompanha a sonda viva.

import * as THREE from 'three';
import { BUFFS, PLATAFORMAS_POUSO, NUCLEO, MEDUSA, heightAt } from '/shared/terrain.js';
import { definirObstaculoAtivo, TORRE_SUPORTE } from '/shared/obstaculos.js';

/** Segundos pousado na plataforma para o time ganhar o ouro (server/objetivos.js). */
export const POUSO_PLATAFORMA_S = 6;
const DIST_ROTULO = 1000; // m: mais longe que isso o rótulo some
const DIST_ESMAECE = 750;

/** Rótulo da torre de suporte: acima da antena do alto do modelo (que vai até ~92 m, passando da planta). */
const ALT_ROTULO_SUPORTE = TORRE_SUPORTE.altura + 36;

/**
 * Os objetivos, onde ficam e a que altura vai o rótulo (m acima do chão de voo).
 * `tipo` escolhe o ícone e os textos.
 */
export const LUGARES_OBJETIVO = [
  ...BUFFS.map((b) => ({ id: b.id, tipo: b.tipo, x: b.x, z: b.z, alt: b.tipo === 'ataque' ? 44 : ALT_ROTULO_SUPORTE })),
  ...PLATAFORMAS_POUSO.map((p) => ({ id: p.id, tipo: 'plataforma', x: p.x, z: p.z, alt: 16 })),
  // A sonda anda em volta da mineradora (pela coluna central); parada, o rótulo fica em cima dela.
  { id: 'SONDA', tipo: 'sonda', x: 0, z: 0, alt: 112 },
  { id: 'MEDUSA', tipo: 'medusa', x: MEDUSA.x, z: MEDUSA.z, alt: 64 },
  { id: 'NUCLEO', tipo: 'nucleo', x: NUCLEO.x, z: NUCLEO.z, alt: 44 },
];

/** Nome curto de cada tipo de objetivo (rótulo, notícias e HUD). */
export const NOME_OBJETIVO = {
  ataque: 'SN-4',
  suporte: 'Torre de suporte',
  plataforma: 'Plataforma de ouro',
  sonda: 'Sonda errante',
  medusa: 'Medusa Anciã',
  nucleo: 'Núcleo de He-3',
};

/** O que fazer com o objetivo aceso (sem ninguém tomando). */
const FAZER = {
  ataque: 'SN-4 · bônus de ataque',
  suporte: 'Destrua a torre · bônus de suporte',
  plataforma: 'Pouse 6 s: ouro para o time',
  sonda: 'Sonda errante · bônus de velocidade',
  medusa: 'Medusa Anciã · bônus do time',
  nucleo: 'Núcleo de He-3 · onda de mineradores',
};

/** Ícones de traço (SVG 24×24) de cada tipo, para o rótulo, o HUD e o placar. */
export const ICONE_OBJETIVO = {
  // Espada: dano.
  ataque: '<path d="M5 19 L16 8"/><path d="M14 4 H20 V10"/><path d="M4 15 L9 20"/>',
  // Cruz de conserto dentro do escudo: vida e energia.
  suporte: '<path d="M12 3 L19 6 V12 C19 16 16 19 12 21 C8 19 5 16 5 12 V6 Z"/><path d="M12 9 V15 M9 12 H15"/>',
  // Moeda com setas de pouso.
  plataforma: '<circle cx="12" cy="13" r="6"/><path d="M12 10 V16"/><path d="M8 3 L12 6 L16 3"/>',
  // Asas e setas: velocidade.
  sonda: '<path d="M4 12 H11"/><path d="M8 8 L12 12 L8 16"/><path d="M13 8 L17 12 L13 16"/><path d="M18 8 L22 12 L18 16"/>',
  // Cúpula com tentáculos.
  medusa: '<path d="M5 12 C5 7 8 4 12 4 C16 4 19 7 19 12 Z"/><path d="M7 12 C7 16 6 18 5 20 M10 12 C10 16 10 18 9 21 M14 12 C14 16 14 18 15 21 M17 12 C17 16 18 18 19 20"/>',
  // Cristal (bipirâmide) com anel.
  nucleo: '<path d="M12 2 L17 12 L12 22 L7 12 Z"/><ellipse cx="12" cy="12" rx="10" ry="3.5"/>',
};

/** "1:05" a partir de segundos. */
export function relogio(s) {
  const t = Math.max(0, Math.ceil(s ?? 0));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

export class ObjetivosNaTela {
  /**
   * @param {{ definirObjetivo: Function, meuTime?: number, container: HTMLElement }} opcoes
   * definirObjetivo vem de criarCena; container recebe os rótulos.
   */
  constructor({ definirObjetivo, meuTime = 0, container }) {
    this.definirObjetivo = definirObjetivo;
    this.meuTime = meuTime;
    this.container = container;
    this.estado = new Map(); // id -> último estado do servidor
    this.v = new THREE.Vector3();
    this.rotulos = new Map();
    for (const o of LUGARES_OBJETIVO) {
      const el = document.createElement('div');
      el.className = 'rot-obj';
      el.innerHTML = `<b class="letra"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONE_OBJETIVO[o.tipo]}</svg></b><span class="txt"></span><span class="barra"><i></i></span>`;
      el.hidden = true;
      container.append(el);
      const pos = new THREE.Vector3(o.x, heightAt(o.x, o.z) + o.alt, o.z);
      this.rotulos.set(o.id, { el, o, pos, fixo: pos.clone(), html: '' });
    }
  }

  /**
   * Aplica o estado do snapshot (`obj` = { id: estado }). Devolve as torres de
   * suporte que acabaram de cair, como { id, x, y, z } (o meio da torre, para quem
   * chama desenhar a explosão).
   */
  atualizar(obj = {}) {
    const cairam = [];
    for (const [id, r] of Object.entries(obj ?? {})) {
      const antes = this.estado.get(id);
      this.estado.set(id, r);
      if (id === 'BS0' || id === 'BS1') {
        const caida = r.estado === 'recarga';
        definirObstaculoAtivo(id, !caida);
        if (caida && antes && antes.estado !== 'recarga') {
          const o = this.rotulos.get(id).o;
          cairam.push({ id, x: o.x, y: heightAt(o.x, o.z) + TORRE_SUPORTE.altura / 2, z: o.z });
        }
      }
      this.definirObjetivo(id, r);
    }
    return cairam;
  }

  /**
   * Põe o rótulo do objetivo `id` sobre um ponto que anda (a sonda viva), ou de
   * volta no lugar fixo com `pos` null.
   */
  seguir(id, pos) {
    const rot = this.rotulos.get(id);
    if (!rot) return;
    if (pos) rot.pos.set(pos.x, pos.y + 18, pos.z);
    else rot.pos.copy(rot.fixo);
  }

  /** "seu time" / "inimigo" e a classe de cor de um time. */
  #time(t) {
    return t === this.meuTime ? ['seu time', 'meu'] : ['inimigo', 'deles'];
  }

  /** Texto, classe e barra (0 a 1, ou null) do rótulo de um objetivo. */
  descrever(r, tipo) {
    if (!r) return { txt: '', classe: '', barra: null };
    const nome = NOME_OBJETIVO[tipo];
    const quem = r.time == null ? '' : ` · ${this.#time(r.time)[0]}`;
    const corQuem = r.time == null ? '' : this.#time(r.time)[1];
    if (r.estado === 'recarga') return { txt: `Volta em ${relogio(r.volta)}${quem}`, classe: `recarga ${corQuem}`, barra: null };
    if (r.estado === 'tomado') return { txt: `${nome} · tomado${quem}`, classe: `recarga ${corQuem}`, barra: null };
    if (r.estado === 'espera') {
      if (r.bloqueada) return { txt: `${nome} · espera a Medusa e o Núcleo`, classe: 'recarga', barra: null };
      return { txt: r.volta != null ? `${nome} · em ${relogio(r.volta)}` : `${nome} · em breve`, classe: 'recarga', barra: null };
    }
    if (tipo === 'plataforma') {
      if (r.contestado) return { txt: 'Contestado · os dois times pousados', classe: 'contestado', barra: (r.prog ?? 0) / POUSO_PLATAFORMA_S };
      if (r.quem != null) {
        const [t, classe] = this.#time(r.quem);
        const falta = Math.max(0, POUSO_PLATAFORMA_S - (r.prog ?? 0));
        return { txt: `${t[0].toUpperCase() + t.slice(1)} pousado · ${falta.toFixed(0)} s`, classe, barra: (r.prog ?? 0) / POUSO_PLATAFORMA_S };
      }
      return { txt: FAZER.plataforma, classe: '', barra: null };
    }
    return { txt: FAZER[tipo], classe: '', barra: r.vida ?? null };
  }

  /** Posiciona os rótulos sobre os objetivos (chamar a cada quadro). */
  desenhar(camera, largura, altura) {
    for (const rot of this.rotulos.values()) {
      const { el, pos, o } = rot;
      const dist = camera.position.distanceTo(pos);
      this.v.copy(pos).project(camera);
      const fora = this.v.z > 1 || Math.abs(this.v.x) > 0.95 || Math.abs(this.v.y) > 1 || dist > DIST_ROTULO;
      el.hidden = fora;
      if (fora) continue;
      const d = this.descrever(this.estado.get(o.id), o.tipo);
      const chave = `${d.txt}|${d.classe}|${d.barra}`;
      if (rot.html !== chave) {
        rot.html = chave;
        el.className = `rot-obj ${d.classe}`;
        el.querySelector('.txt').textContent = d.txt;
        const barra = el.querySelector('.barra');
        barra.hidden = d.barra == null;
        if (d.barra != null) barra.firstChild.style.width = `${Math.max(0, Math.min(1, d.barra)) * 100}%`;
      }
      el.hidden = !d.txt;
      el.style.transform = `translate(${((this.v.x + 1) / 2) * largura}px, ${((1 - this.v.y) / 2) * altura}px) translate(-50%, -100%)`;
      el.style.opacity = dist > DIST_ESMAECE ? String(1 - (dist - DIST_ESMAECE) / (DIST_ROTULO - DIST_ESMAECE)) : '1';
    }
  }

  /** Tira os rótulos da página e põe as torres de pé (saída da partida). */
  limpar() {
    for (const { el } of this.rotulos.values()) el.remove();
    this.rotulos.clear();
    for (const b of BUFFS) if (b.tipo === 'suporte') definirObstaculoAtivo(b.id, true);
  }
}
