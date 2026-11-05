// Confirmação de saída da partida (#sair-partida): ESC na partida, sem nenhuma janela
// aberta, não sai mais direto para o menu; abre esta caixa no meio da tela com
// Confirmar e Cancelar. Confirmar (o botão ou Enter) sai e o menu abre na aba Jogar;
// Cancelar (o botão, ESC de novo ou clique fora) fecha e a partida segue.
//
// O jogo não pausa (é multijogador): a nave continua voando por baixo, mas sem tiro
// enquanto a caixa está aberta, como a janela de volume. Na tela de resultado o ESC
// continua saindo direto (a partida já acabou), e quem decide isso é main.js.
//
// No controle (joystick.js) a caixa é uma janela de mexer: ✕ clica o botão focado (o
// Confirmar, `data-joy-principal`, de início) e ○ ou Start é o ESC, que cancela.

export class ConfirmarSaida {
  /**
   * @param {{ el: HTMLElement, aoConfirmar: () => void, som?: (nome: string) => void }} opcoes
   */
  constructor({ el, aoConfirmar, som = () => {} }) {
    this.el = el;
    this.aoConfirmar = aoConfirmar;
    this.som = som;
    this.el.querySelector('.confirmar').addEventListener('click', () => this.confirmar());
    this.el.querySelector('.cancelar').addEventListener('click', () => this.fechar());
    // Clique no fundo escurecido (fora da caixa) cancela.
    this.el.addEventListener('pointerdown', (e) => {
      if (e.target === this.el) this.fechar();
    });
    // Enter confirma. Na fase de captura e engolido: o Enter também reabre o painel da
    // Loja (atalho 'loja') e não pode fazer as duas coisas.
    addEventListener(
      'keydown',
      (e) => {
        if (!this.aberto || (e.code !== 'Enter' && e.code !== 'NumpadEnter')) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        if (!e.repeat) this.confirmar();
      },
      { capture: true },
    );
  }

  /** A caixa está na tela? (enquanto estiver, o Z e o X não disparam) */
  get aberto() {
    return !this.el.hidden;
  }

  abrir() {
    if (this.aberto) return;
    this.el.hidden = false;
    this.som('painel');
  }

  /** Cancela: fecha a caixa e a partida segue. */
  fechar() {
    if (!this.aberto) return;
    this.el.hidden = true;
    // O foco num botão da caixa prenderia o Espaço e o Enter do jogo.
    if (this.el.contains(document.activeElement)) document.activeElement.blur();
  }

  /** Sai da partida (fecha a caixa antes, para o menu não abrir com ela por cima). */
  confirmar() {
    if (!this.aberto) return;
    this.fechar();
    this.aoConfirmar();
  }
}
