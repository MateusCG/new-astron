// O locutor na tela (#locutor): a faixa grande do First Blood, Double Kill, Godlike etc.
// um pouco acima do centro, e a voz dizendo a frase no canal do locutor (Sons.tocarLocutor,
// com a barra própria de volume). O que anunciar sai de locutor-regras.js; aqui fica a
// fila: um anúncio por vez, a faixa fica o tempo da voz (no mínimo FAIXA_MIN_S) e o
// seguinte entra logo depois, como o Dota faz com o multi-abate e a sequência no mesmo
// abate. Anúncio que esperou demais na fila (FILA_VALIDADE_S) sai sem tocar: a voz
// atrasada de uma briga que já acabou engana mais do que ajuda.
//
// Sem a voz (arquivo que ainda não chegou), a faixa aparece do mesmo jeito.

import { duracaoDaFaixa, FILA_VALIDADE_S } from './locutor-regras.js';

/** Intervalo (ms) entre a faixa que sai e a seguinte. */
const ENTRE_MS = 220;
/** Quanto (ms) a faixa leva para sumir (a animação `locutor-sai` do CSS). */
const SAIDA_MS = 320;

export class Locutor {
  /**
   * @param {{ sons: import('./sons.js').Sons, el?: HTMLElement }} opcoes
   */
  constructor({ sons, el = document.querySelector('#locutor') }) {
    this.sons = sons;
    this.el = el;
    this.titulo = el.querySelector('.titulo');
    this.sub = el.querySelector('.sub');
    this.fila = [];
    this.timer = 0;
    this.ocupado = false;
  }

  /** Põe na fila os anúncios de um evento (anunciosDaMorte). */
  anunciar(lista) {
    if (!lista?.length) return;
    const agora = performance.now();
    for (const a of lista) this.fila.push({ ...a, t: agora });
    if (!this.ocupado) this.#proximo();
  }

  /** Apaga a fila e a faixa (partida nova, volta ao menu). */
  limpar() {
    clearTimeout(this.timer);
    this.fila.length = 0;
    this.ocupado = false;
    this.el.hidden = true;
    this.el.classList.remove('saindo');
  }

  #proximo() {
    const agora = performance.now();
    let a = this.fila.shift();
    while (a && agora - a.t > FILA_VALIDADE_S * 1000) a = this.fila.shift();
    if (!a) {
      this.ocupado = false;
      return;
    }
    this.ocupado = true;
    this.titulo.textContent = a.texto;
    this.sub.textContent = a.sub ?? '';
    this.el.dataset.cor = a.cor;
    this.el.classList.remove('saindo');
    // Reinicia a animação de entrada mesmo com a faixa já na tela.
    this.el.hidden = true;
    void this.el.offsetWidth;
    this.el.hidden = false;
    const tocou = this.sons.tocarLocutor(a.som);
    const s = duracaoDaFaixa(tocou ? this.sons.duracao(a.som) : 0);
    this.timer = setTimeout(() => {
      this.el.classList.add('saindo');
      this.timer = setTimeout(() => {
        this.el.hidden = true;
        this.el.classList.remove('saindo');
        this.timer = setTimeout(() => this.#proximo(), ENTRE_MS);
      }, SAIDA_MS);
    }, s * 1000 - SAIDA_MS);
  }
}
