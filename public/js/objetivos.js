// Objetivos A, B e C no cliente: aplica o estado que vem do servidor (snapshot
// `obj`) na física e no cenário, e desenha o rótulo de cada objetivo sobre a
// marcação. Quem decide tudo (progresso, vida da torre, recarga, quem tomou) é o
// servidor (server/objetivos.js); aqui só se mostra.
//
// - Torre B: caída, sai da física com definirObstaculoAtivo (o mesmo que o
//   servidor faz), para a predição da nave passar por onde ela estava sem tranco;
//   no cenário some e deixa destroços.
// - Em recarga, o âmbar da marcação apaga (definirObjetivo da cena).
// - Rótulo (DOM, como os nomes das naves): letra em âmbar e o estado: o que fazer
//   (livre), progresso com barra (tomando), "Contestado", vida da torre ou do
//   guardião, ou o tempo da recarga e quem tomou. Cor do time relativa a quem olha:
//   seu time em turquesa, o outro em vermelho.

import * as THREE from 'three';
import { OBJETIVOS, heightAt } from '/shared/terrain.js';
import { definirObstaculoAtivo } from '/shared/obstaculos.js';

const ALTURA_ROTULO = { A: 16, B: 42, C: 34 }; // m acima do chão
const DIST_ROTULO = 900; // m: mais longe que isso o rótulo some
const DIST_ESMAECE = 650;
const FAZER = { A: 'Pouse para tomar', B: 'Destrua a torre', C: 'Derrote o guardião' };

/** "1:05" a partir de segundos. */
export function relogio(s) {
  const t = Math.max(0, Math.ceil(s));
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
    for (const o of OBJETIVOS) {
      const el = document.createElement('div');
      el.className = 'rot-obj';
      el.innerHTML = `<b class="letra">${o.tipo}</b><span class="txt"></span><span class="barra"><i></i></span>`;
      el.hidden = true;
      container.append(el);
      this.rotulos.set(o.id, { el, o, pos: new THREE.Vector3(o.x, heightAt(o.x, o.z) + ALTURA_ROTULO[o.tipo], o.z), html: '' });
    }
  }

  /**
   * Aplica o estado do snapshot. Devolve as torres B que acabaram de cair, como
   * { id, x, y, z } (o meio da torre, para quem chama desenhar a explosão).
   */
  atualizar(obj = []) {
    const cairam = [];
    for (const r of obj) {
      const antes = this.estado.get(r.id);
      this.estado.set(r.id, r);
      const recarga = r.estado === 'recarga';
      if (r.tipo === 'B') {
        definirObstaculoAtivo(r.id, !recarga);
        if (recarga && antes && antes.estado !== 'recarga') {
          const o = this.rotulos.get(r.id).o;
          cairam.push({ id: r.id, x: o.x, y: heightAt(o.x, o.z) + 16, z: o.z });
        }
      }
      this.definirObjetivo(r.id, { apagado: recarga, torreDePe: !recarga });
    }
    return cairam;
  }

  /** "seu time" / "inimigo" e a classe de cor de um time. */
  #time(t) {
    return t === this.meuTime ? ['seu time', 'meu'] : ['inimigo', 'deles'];
  }

  /** Texto, classe e barra (0 a 1, ou null) do rótulo de um objetivo. */
  descrever(r) {
    if (!r) return { txt: '', classe: '', barra: null };
    if (r.estado === 'recarga') {
      const quem = r.time == null ? '' : ` · ${this.#time(r.time)[0]}`;
      return { txt: `Volta em ${relogio(r.resta)}${quem}`, classe: 'recarga ' + (r.time == null ? '' : this.#time(r.time)[1]), barra: null };
    }
    if (r.estado === 'contestado') return { txt: 'Contestado', classe: 'contestado', barra: r.prog };
    if (r.estado === 'tomando') {
      const [nome, classe] = this.#time(r.quem);
      return { txt: `${nome[0].toUpperCase() + nome.slice(1)} · ${r.falta.toFixed(0)} s`, classe, barra: r.prog };
    }
    return { txt: FAZER[r.tipo], classe: '', barra: r.tipo === 'A' ? null : r.vida };
  }

  /** Posiciona os rótulos sobre as marcações (chamar a cada quadro). */
  desenhar(camera, largura, altura) {
    for (const [id, rot] of this.rotulos) {
      const { el, pos } = rot;
      const dist = camera.position.distanceTo(pos);
      this.v.copy(pos).project(camera);
      const fora = this.v.z > 1 || Math.abs(this.v.x) > 0.95 || Math.abs(this.v.y) > 1 || dist > DIST_ROTULO;
      el.hidden = fora;
      if (fora) continue;
      const d = this.descrever(this.estado.get(id));
      const chave = `${d.txt}|${d.classe}|${d.barra}`;
      if (rot.html !== chave) {
        rot.html = chave;
        el.className = `rot-obj ${d.classe}`;
        el.querySelector('.txt').textContent = d.txt;
        const barra = el.querySelector('.barra');
        barra.hidden = d.barra == null;
        if (d.barra != null) barra.firstChild.style.width = `${Math.max(0, Math.min(1, d.barra)) * 100}%`;
      }
      el.style.transform = `translate(${((this.v.x + 1) / 2) * largura}px, ${((1 - this.v.y) / 2) * altura}px) translate(-50%, -100%)`;
      el.style.opacity = dist > DIST_ESMAECE ? String(1 - (dist - DIST_ESMAECE) / (DIST_ROTULO - DIST_ESMAECE)) : '1';
    }
  }

  /** Tira os rótulos da página e põe as torres de pé (saída da partida). */
  limpar() {
    for (const { el } of this.rotulos.values()) el.remove();
    this.rotulos.clear();
    for (const o of OBJETIVOS) if (o.tipo === 'B') definirObstaculoAtivo(o.id, true);
  }
}
