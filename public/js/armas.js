// Menu de armas: escolhe a arma principal (Z) entre as opções de ARMAS_PRINCIPAIS
// (laser simples, duplo, triplo, dreno e criogênico). Abre e fecha com Q, ou com o
// botão ARMA no celular e o indicador de arma do painel; escolhe com clique/toque
// ou com as teclas 1 a 5, e escolher fecha o menu.
//
// O menu só guarda a escolha do piloto: ela vai no campo `a` de cada comando e
// quem troca a arma de verdade é stepShip (no servidor e na predição, no mesmo
// passo). Como é multijogador, o jogo não pausa com o menu aberto; só os tiros
// ficam travados enquanto ele está na tela. Os números das cartas saem de WEAPONS,
// então balancear em shared/sim.js já atualiza o menu.
//
// O estado "aberto" vem do próprio elemento #menu-armas (atributo hidden), para quem
// mais precisar fechar o menu (o ESC, por exemplo) só esconder o elemento.

import { WEAPONS, ARMAS_PRINCIPAIS } from '/shared/sim.js';

const TECLA_MENU = 'KeyQ';
const TECLAS_OPCAO = ARMAS_PRINCIPAIS.map((_, i) => [`Digit${i + 1}`, `Numpad${i + 1}`]);

const numero = (v, casas = 0) => v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });

/** Quantos projéteis a arma solta por disparo. */
export function projeteis(w) {
  return (w.canos?.length ?? 1) * (w.leque?.length ?? 1);
}

/** Frase curta do que a arma faz, montada das constantes de shared/sim.js. */
export function descreverArma(kind) {
  const w = WEAPONS[kind];
  if (w.efeito?.tipo === 'dreno') return `Drena ${w.efeito.dps} HP/s por ${w.efeito.duracao} s`;
  if (w.efeito?.tipo === 'lento') return `Alvo ${Math.round((1 - w.efeito.mult) * 100)}% mais lento por ${w.efeito.duracao} s`;
  if (w.leque) return `${w.leque.length} tiros em leque (±${Math.round((Math.max(...w.leque) * 180) / Math.PI)}°)`;
  if (w.canos) return `${w.canos.length} tiros paralelos, faixa larga`;
  return 'Tiro único, maior dano por segundo';
}

/**
 * Ícone da arma em SVG: um traço por projétil (paralelos ou em leque), gota para o
 * dreno e floco para o criogênico. A cor vem do CSS pela classe do efeito.
 */
export function iconeArma(kind) {
  const w = WEAPONS[kind];
  const linha = (x1, y1, x2, y2) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" />`;
  let desenho;
  if (w.efeito?.tipo === 'dreno') {
    desenho = '<path d="M12 3 C9 8 6 11 6 15 a6 6 0 0 0 12 0 C18 11 15 8 12 3 Z" />';
  } else if (w.efeito?.tipo === 'lento') {
    desenho = [0, 60, 120]
      .map((g) => {
        const r = (g * Math.PI) / 180;
        const dx = +(Math.sin(r) * 8).toFixed(2);
        const dy = +(Math.cos(r) * 8).toFixed(2);
        return linha(12 - dx, 12 - dy, 12 + dx, 12 + dy);
      })
      .join('');
  } else if (w.leque) {
    desenho = w.leque.map((a) => linha(12, 21, +(12 - Math.sin(a * 6) * 16).toFixed(2), +(21 - Math.cos(a * 6) * 17).toFixed(2))).join('');
  } else {
    const n = w.canos?.length ?? 1;
    desenho = Array.from({ length: n }, (_, i) => {
      const x = n === 1 ? 12 : 7 + (i * 10) / (n - 1);
      return linha(x, 4, x, 20);
    }).join('');
  }
  return `<svg class="icone-arma ${w.efeito?.tipo ?? 'laser'}" viewBox="0 0 24 24" aria-hidden="true">${desenho}</svg>`;
}

/** Chama fn no clique (mouse) e no toque, sem esperar o clique atrasado do celular. */
function aoTocar(el, fn) {
  el.addEventListener('click', (e) => {
    fn();
    e.currentTarget.blur(); // Espaço também atira: não pode "clicar" no botão de novo
  });
  el.addEventListener('touchstart', (e) => {
    e.preventDefault();
    fn();
  });
}

export class MenuArmas {
  /**
   * @param {{ aoTrocar?: (indice: number, kind: string) => void }} [opcoes]
   */
  constructor({ aoTrocar } = {}) {
    this.el = document.querySelector('#menu-armas');
    this.lista = this.el.querySelector('.opcoes');
    this.aoTrocar = aoTrocar;
    this.arma = 0;
    this.botoes = ARMAS_PRINCIPAIS.map((kind, i) => {
      const w = WEAPONS[kind];
      const n = projeteis(w);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'opcao-arma';
      b.dataset.arma = String(i);
      b.innerHTML = `<kbd>${i + 1}</kbd>${iconeArma(kind)}<strong>${w.nome}</strong>
        <dl>
          <dt>Dano</dt><dd>${n > 1 ? `${w.dano} × ${n}` : w.dano}</dd>
          <dt>Energia</dt><dd>${w.energia}</dd>
          <dt>Recarga</dt><dd>${numero(w.cd, 2)} s</dd>
        </dl>
        <small class="efeito">${descreverArma(kind)}</small>
        <span class="em-uso">EM USO</span>`;
      aoTocar(b, () => this.escolher(i));
      this.lista.append(b);
      return b;
    });
    this.#marcar();

    addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.repeat) return;
      if (e.code === TECLA_MENU) this.alternar();
      else if (this.aberto) {
        const i = TECLAS_OPCAO.findIndex((codigos) => codigos.includes(e.code));
        if (i >= 0 && i < ARMAS_PRINCIPAIS.length) this.escolher(i);
      }
    });
    for (const sel of ['#btn-arma', '#arma-atual']) {
      const el = document.querySelector(sel);
      if (el) aoTocar(el, () => this.alternar());
    }
  }

  /** O menu está na tela? (enquanto estiver, o Z e o X não disparam) */
  get aberto() {
    return !this.el.hidden;
  }

  alternar() {
    this.el.hidden = this.aberto;
  }

  /** Escolhe a arma principal pelo índice e fecha o menu. */
  escolher(i) {
    const mudou = i !== this.arma;
    this.arma = i;
    this.#marcar();
    this.el.hidden = true;
    if (mudou) this.aoTrocar?.(i, ARMAS_PRINCIPAIS[i]);
  }

  #marcar() {
    this.botoes.forEach((b, i) => b.classList.toggle('sel', i === this.arma));
  }
}
