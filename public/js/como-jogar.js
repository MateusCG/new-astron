// A aba "Como Jogar" do menu (#tela-aprender): a trilha do piloto, como a aba Learn do
// Dota 2. À esquerda os capítulos com o progresso (✓ no que já foi lido, guardado no
// navegador); à direita o capítulo aberto, com o "em resumo", o corpo e, embaixo,
// Anterior/Próximo e o "Praticar agora", que abre o modo certo na Seleção. O conteúdo e
// as regras estão em como-jogar-regras.js; aqui só o desenho e os eventos.
//
// As teclas do texto são as do mapa em uso (kbdAcao): quem trocou o Z pelo clique vê o
// clique. O mapa do capítulo do mapa é o mesmo da Seleção (mapa-selecao.js), com as
// dicas ao passar o mouse, montado uma vez e levado para o capítulo quando ele abre.

import { RACES } from '/shared/sim.js';
import { kbdAcao, pintarRotulos, aoMudarAtalhos } from './atalhos.js';
import { MapaSelecao } from './mapa-selecao.js';
import { modoPorId } from './menu-regras.js';
import { CAPITULOS, CHAVE_LIDOS, capituloPorId, lerLidos, textoLidos, progresso, capituloInicial, vizinho, formatar } from './como-jogar-regras.js';

/** Desenhos dos ícones dos cartões (traço, viewBox 24). */
const ICONES = {
  minerio: '<path d="M12 3l7 5-2.5 10h-9L5 8z"/><path d="M5 8h14M12 3l-2.5 15M12 3l2.5 15"/>',
  escudo: '<path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"/>',
  alvo: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/><path d="M12 1v5M12 18v5M1 12h5M18 12h5"/>',
  estrela: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.9z"/>',
  base: '<path d="M4 20V10l8-6 8 6v10"/><path d="M9 20v-6h6v6"/>',
  mineradora: '<rect x="6" y="4" width="12" height="16" rx="2"/><path d="M6 12h12M10 4v16"/>',
  torre: '<path d="M8 21l1.5-12h5L16 21"/><path d="M7 9h10M12 9V3M9 5l3-2 3 2"/>',
  monstro: '<path d="M5 14c0-4 3-8 7-8s7 4 7 8v5l-2.5-2-2 2-2.5-2-2.5 2-2-2L5 19z"/><circle cx="9.5" cy="12" r="1"/><circle cx="14.5" cy="12" r="1"/>',
  nuvem: '<path d="M7 18a4 4 0 0 1-.5-8A5.5 5.5 0 0 1 17 9a4.5 4.5 0 0 1 .5 9z"/>',
  poco: '<path d="M4 6v12h6M20 6v12h-6"/><circle cx="12" cy="11" r="3"/>',
  evolucao: '<path d="M12 20V5M6 11l6-6 6 6M6 17l6-6 6 6"/>',
  nucleo: '<circle cx="12" cy="12" r="3.5"/><ellipse cx="12" cy="12" rx="9" ry="4"/><ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(120 12 12)"/>',
  raio: '<path d="M13 2L5 14h6l-1 8 8-12h-6z"/>',
  time: '<circle cx="8" cy="9" r="3"/><circle cx="16" cy="9" r="3"/><path d="M2 20c.8-3.5 3-5.5 6-5.5s5.2 2 6 5.5M12.5 15.5c1-.7 2.2-1 3.5-1 3 0 5.2 2 6 5.5"/>',
  ouro: '<circle cx="12" cy="12" r="8"/><path d="M12 7v10M9.5 9.5c0-1.2 1.1-2 2.5-2s2.5.8 2.5 2-1.1 1.8-2.5 2.2-2.5 1-2.5 2.3 1.1 2 2.5 2 2.5-.8 2.5-2"/>',
  nave: '<path d="M12 3l3 9 6 4-6 1-3 4-3-4-6-1 6-4z"/>',
  loja: '<path d="M4 8h16l-1.5 12h-13z"/><path d="M8.5 8a3.5 3.5 0 0 1 7 0"/>',
  inventario: '<rect x="3.5" y="3.5" width="7" height="7" rx="1"/><rect x="13.5" y="3.5" width="7" height="7" rx="1"/><rect x="3.5" y="13.5" width="7" height="7" rx="1"/><rect x="13.5" y="13.5" width="7" height="7" rx="1"/>',
  sonda: '<circle cx="12" cy="12" r="4"/><path d="M12 2v6M12 16v6M2 12h6M16 12h6"/>',
  medusa: '<path d="M4 12a8 7 0 0 1 16 0z"/><path d="M6 12c0 4-1.5 6-1.5 8M10 12c0 4-1 6 0 8M14 12c0 4 1 6 0 8M18 12c0 4 1.5 6 1.5 8"/>',
  perigo: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/>',
};

const svgIcone = (nome) => `<svg class="icone-aprender" viewBox="0 0 24 24" aria-hidden="true">${ICONES[nome] ?? ICONES.estrela}</svg>`;

/** Cor de um cartão: token do CSS ou a cor da raça. */
function corDoCartao(cor) {
  if (RACES[cor]) return '#' + RACES[cor].cor.toString(16).padStart(6, '0');
  return `var(--${cor ?? 'neon'})`;
}

const ler = (k) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const gravar = (k, v) => {
  try {
    localStorage.setItem(k, v);
  } catch {}
};
const fmt = (t) => formatar(t, kbdAcao);

export class ComoJogar {
  /**
   * @param {HTMLElement} el o #tela-aprender
   * @param {{ aoPraticar: (modo: string) => void, aoSom: (tipo: 'clique'|'abrir') => void,
   *   aoProgresso: (p: ReturnType<typeof progresso>) => void }} op
   */
  constructor(el, { aoPraticar, aoSom, aoProgresso }) {
    this.el = el;
    this.aoPraticar = aoPraticar;
    this.aoSom = aoSom;
    this.aoProgresso = aoProgresso;
    this.lidos = lerLidos(ler(CHAVE_LIDOS));
    this.atual = capituloInicial(this.lidos);
    this.lista = el.querySelector('.trilha-capitulos');
    this.painel = el.querySelector('.capitulo');

    // O mapa do capítulo do mapa: montado uma vez (a caixinha da dica fica na tela).
    this.mapaEl = document.createElement('section');
    this.mapaEl.className = 'mapa-partida mapa-aprender';
    this.mapaEl.setAttribute('aria-label', 'Mapa da partida');
    this.mapaEl.innerHTML = '<div class="quadro-mapa"></div>';
    el.append(this.mapaEl);
    this.mapa = new MapaSelecao(this.mapaEl);
    this.mapaEl.remove();

    this.#montarLista();
    this.lista.addEventListener('click', (e) => {
      const b = e.target.closest('[data-cap]');
      if (b) this.abrir(b.dataset.cap, { som: true });
    });
    this.lista.addEventListener('keydown', (e) => {
      const passo = { ArrowDown: 1, ArrowUp: -1 }[e.key];
      if (!passo) return;
      e.preventDefault();
      const id = vizinho(e.target.closest('[data-cap]')?.dataset.cap ?? this.atual, passo);
      if (id) {
        this.abrir(id, { som: true });
        this.lista.querySelector(`[data-cap="${id}"]`)?.focus();
      }
    });
    this.painel.addEventListener('click', (e) => {
      const nav = e.target.closest('[data-ir]');
      if (nav) {
        this.abrir(nav.dataset.ir, { som: true });
        this.painel.querySelector('.navegar-capitulo [data-ir]')?.focus({ preventScroll: true });
        return;
      }
      const pr = e.target.closest('[data-praticar]');
      if (pr) this.aoPraticar(pr.dataset.praticar);
    });
    // ←/→ fora da lista e dos campos: capítulo anterior e próximo.
    el.addEventListener('keydown', (e) => {
      const passo = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
      if (!passo || e.target.closest('input, .trilha-capitulos')) return;
      const id = vizinho(this.atual, passo);
      if (!id) return;
      e.preventDefault();
      this.abrir(id, { som: true });
    });
    // As teclas do texto seguem o mapa trocado na aba Configurações.
    aoMudarAtalhos(() => {
      if (!el.hidden) this.#desenhar();
    });
  }

  /** O progresso da trilha (para o selo da aba). */
  get progresso() {
    return progresso(this.lidos);
  }

  /** A aba abriu: mostra o capítulo atual (e o marca como lido). */
  mostrar() {
    this.abrir(this.atual);
  }

  /** Abre um capítulo e o marca como lido. */
  abrir(id, { som = false } = {}) {
    if (!capituloPorId(id)) return;
    if (som && id !== this.atual) this.aoSom('clique');
    this.atual = id;
    if (!this.lidos.has(id)) {
      this.lidos.add(id);
      gravar(CHAVE_LIDOS, textoLidos(this.lidos));
    }
    this.#desenhar();
    this.painel.scrollTop = 0;
    // Na coluna estreita o capítulo fica embaixo da lista: o clique leva até ele.
    if (som && matchMedia('(max-width: 760px)').matches) this.painel.scrollIntoView({ block: 'start' });
    this.aoProgresso?.(this.progresso);
  }

  /** O botão da lista do capítulo aberto (o foco da aba). */
  get focoInicial() {
    return this.lista.querySelector(`[data-cap="${this.atual}"]`);
  }

  #montarLista() {
    this.lista.innerHTML = CAPITULOS.map(
      (c, i) => `<li><button type="button" data-cap="${c.id}"><span class="numero-cap" aria-hidden="true"><b>${i + 1}</b></span><span class="texto-cap"><strong>${c.titulo}</strong><small>${c.curto}</small></span></button></li>`,
    ).join('');
  }

  #desenhar() {
    // A lista: o aberto, os lidos e a barra.
    for (const b of this.lista.querySelectorAll('[data-cap]')) {
      const sel = b.dataset.cap === this.atual;
      b.classList.toggle('sel', sel);
      b.classList.toggle('lido', this.lidos.has(b.dataset.cap));
      b.setAttribute('aria-current', sel ? 'step' : 'false');
      b.tabIndex = sel ? 0 : -1;
    }
    const p = this.progresso;
    const prog = this.el.querySelector('.progresso-trilha');
    prog.querySelector('.conta').textContent = p.completo ? 'Trilha completa' : `${p.lidos} de ${p.total} capítulos`;
    prog.querySelector('.barra b').style.width = `${Math.round(p.fracao * 100)}%`;
    prog.classList.toggle('completo', p.completo);

    // O capítulo.
    const i = CAPITULOS.findIndex((c) => c.id === this.atual);
    const c = CAPITULOS[i];
    const ant = vizinho(c.id, -1);
    const prox = vizinho(c.id, 1);
    const modo = modoPorId(c.praticar?.modo);
    this.painel.innerHTML = `
      <header class="cabeca-capitulo">
        <p class="sobre-capitulo">Capítulo ${i + 1} de ${CAPITULOS.length} · ${c.min} min de leitura</p>
        <h2 id="titulo-capitulo">${c.titulo}</h2>
      </header>
      <section class="resumo-capitulo" aria-label="Em resumo"><b class="selo-resumo">Em resumo</b><p>${fmt(c.resumo)}</p></section>
      ${c.blocos.map((b) => this.#bloco(b)).join('')}
      <footer class="pe-capitulo">
        ${
          modo
            ? `<div class="praticar"><span><b>Praticar agora</b><small>${fmt(c.praticar.texto)}</small></span><button type="button" data-praticar="${modo.id}">${modo.titulo} ›</button></div>`
            : ''
        }
        <nav class="navegar-capitulo" aria-label="Capítulos">
          ${ant ? `<button type="button" class="anterior" data-ir="${ant}">‹ ${capituloPorId(ant).titulo}</button>` : '<span></span>'}
          ${prox ? `<button type="button" class="proximo" data-ir="${prox}">Próximo: ${capituloPorId(prox).titulo} ›</button>` : ''}
        </nav>
      </footer>`;
    const lugar = this.painel.querySelector('.lugar-mapa');
    if (lugar) {
      lugar.replaceWith(this.mapaEl);
      this.mapa.mostrar(0);
    } else this.mapa.esconderDica();
    pintarRotulos(this.painel);
  }

  #bloco(b) {
    const titulo = b.titulo ? `<h3>${b.titulo}</h3>` : '';
    switch (b.tipo) {
      case 'p':
        return `<section class="bloco-p">${titulo}<p>${fmt(b.texto)}</p></section>`;
      case 'dica':
        return `<aside class="dica-piloto"><b>Dica de piloto</b><p>${fmt(b.texto)}</p></aside>`;
      case 'mapa':
        return `<div class="lugar-mapa"></div>`;
      case 'cartoes':
        return `<section class="bloco-cartoes">${titulo}<div class="cartoes-aprender">${b.itens
          .map(
            (it) =>
              `<article class="cartao-aprender" style="--cor-cartao:${corDoCartao(it.cor)}">${svgIcone(it.icone)}<h4>${fmt(it.titulo)}</h4><p>${fmt(it.texto)}</p></article>`,
          )
          .join('')}</div></section>`;
      case 'teclas':
        return `<section class="bloco-teclas">${titulo}<dl class="teclas-aprender">${b.itens
          .map((it) => `<div><dt>${it.acoes.map((a) => kbdAcao(a)).join('')}</dt><dd>${fmt(it.texto)}</dd></div>`)
          .join('')}</dl></section>`;
      case 'passos':
        return `<section class="bloco-passos">${titulo}<ol class="passos-aprender">${b.itens.map((t) => `<li>${fmt(t)}</li>`).join('')}</ol></section>`;
      case 'tempo':
        return `<section class="bloco-tempo">${titulo}<ol class="tempo-aprender">${b.itens
          .map((it) => `<li><time>${it.t}</time><p>${fmt(it.texto)}</p></li>`)
          .join('')}</ol></section>`;
      case 'glossario':
        return `<section class="bloco-glossario">${titulo}<dl class="glossario-aprender">${b.itens
          .map((it) => `<div><dt>${fmt(it.termo)}</dt><dd>${fmt(it.texto)}</dd></div>`)
          .join('')}</dl></section>`;
      default:
        return '';
    }
  }
}
