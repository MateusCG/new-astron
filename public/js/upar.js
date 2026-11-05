// As abas de pôr pontos no topo do painel inferior (#upar), como as setas de subir
// habilidade do LoL: aparecem com ponto livre (subiu de nível) e somem quando acabam.
// Clique ou as teclas das ações pontoHp..pontoOp (1 a 5 de fábrica) pedem UPAR_QTD
// pontos no atributo; o servidor valida e o snapshot traz o resto. As regras estão em
// upar-regras.js.

import { aoApertar, kbdAcao, pintarRotulos } from './atalhos.js';
import { OPCOES_UPAR, UPAR_QTD, estadoUpar, mostraUpar, pedidoUpar } from './upar-regras.js';

/** Duas setas para cima, como a do LoL. */
const SETAS = '<svg viewBox="0 0 24 16" aria-hidden="true"><path d="M4 9.5L12 3l8 6.5" /><path d="M4 15L12 8.5l8 6.5" /></svg>';
/** Quanto a aba fica acesa depois de pôr os pontos (ms). */
const BRILHO_MS = 450;

export class UparPontos {
  /** @param {{ enviar: (m: object) => void, signal: AbortSignal }} opcoes */
  constructor({ enviar, signal }) {
    this.enviar = enviar;
    this.el = document.querySelector('#upar');
    this.estado = estadoUpar(null);
    this.vivo = true;
    this.el.innerHTML =
      `<span class="livres" title="Pontos livres: cada aba põe ${UPAR_QTD}"><b>0</b>pts</span>` +
      OPCOES_UPAR.map(
        (o) =>
          `<button type="button" class="aba-upar ${o.cor}" data-atributo="${o.atributo}" title="+${UPAR_QTD} em ${o.nome}">` +
          `<span class="setas">${SETAS}</span><b class="sigla">${o.sigla}</b>${kbdAcao(o.acao)}</button>`,
      ).join('');
    this.qtdLivres = this.el.querySelector('.livres b');
    this.abas = new Map([...this.el.querySelectorAll('.aba-upar')].map((b) => [b.dataset.atributo, b]));
    this.el.hidden = true;
    pintarRotulos(this.el);

    this.el.addEventListener(
      'click',
      (e) => {
        const b = e.target.closest('.aba-upar');
        if (!b) return;
        this.#pedir(b.dataset.atributo);
        b.blur(); // o foco no botão não pode prender as teclas do jogo
      },
      { signal },
    );
    for (const o of OPCOES_UPAR) aoApertar(o.acao, () => this.#pedir(o.atributo), { signal });
  }

  /** Estado do snapshot: { me, nivel, vivo }. */
  atualizar({ me, nivel, vivo = true }) {
    this.estado = estadoUpar(me, nivel);
    this.vivo = vivo;
    const mostra = mostraUpar(this.estado);
    if (this.el.hidden === mostra) this.el.hidden = !mostra;
    if (!mostra) return;
    const t = String(this.estado.livres);
    if (this.qtdLivres.textContent !== t) this.qtdLivres.textContent = t;
    for (const a of this.estado.abas) this.abas.get(a.atributo)?.classList.toggle('cheio', a.qtd === 0);
  }

  /** Resposta do servidor ao {t:'pontos'}: a aba pisca quando entrou. */
  resultado(m) {
    const b = this.abas.get(m.item);
    if (!m.ok || !b) return;
    b.classList.remove('upou');
    void b.offsetWidth; // reinicia a animação
    b.classList.add('upou');
    clearTimeout(b._brilho);
    b._brilho = setTimeout(() => b.classList.remove('upou'), BRILHO_MS);
  }

  #pedir(atributo) {
    if (this.el.hidden) return;
    const pedido = pedidoUpar(this.estado, atributo);
    if (pedido) this.enviar(pedido);
  }
}
