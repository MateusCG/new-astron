// Menu de armas: escolhe a arma principal (Z) entre as opções de ARMAS_PRINCIPAIS
// (laser simples ou duplo). Abre e fecha com Q, ou com o botão ARMA no celular e o
// indicador de arma do painel; escolhe com clique/toque ou com as teclas 1 e 2, e
// escolher fecha o menu.
//
// O menu só guarda a escolha do piloto: ela vai no campo `a` de cada comando e
// quem troca a arma de verdade é stepShip (no servidor e na predição, no mesmo
// passo). Como é multijogador, o jogo não pausa com o menu aberto; só os tiros
// ficam travados enquanto ele está na tela.
//
// O estado "aberto" vem do próprio elemento #menu-armas (atributo hidden), para quem
// mais precisar fechar o menu (o ESC, por exemplo) só esconder o elemento.

import { WEAPONS, ARMAS_PRINCIPAIS } from '/shared/sim.js';

const TECLA_MENU = 'KeyQ';
const TECLAS_OPCAO = [
  ['Digit1', 'Numpad1'],
  ['Digit2', 'Numpad2'],
];

const numero = (v, casas = 0) => v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });

/** Ícone da arma: um traço por projétil, como o tiro saindo para cima. */
export function iconeArma(kind) {
  const canos = WEAPONS[kind].canos ?? [0];
  const largura = 24;
  const tracos = canos
    .map((_, i) => {
      const x = canos.length === 1 ? largura / 2 : 7 + (i * 10) / (canos.length - 1);
      return `<line x1="${x}" y1="4" x2="${x}" y2="20" />`;
    })
    .join('');
  return `<svg class="icone-arma" viewBox="0 0 ${largura} 24" aria-hidden="true">${tracos}</svg>`;
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
      const n = w.canos?.length ?? 1;
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
