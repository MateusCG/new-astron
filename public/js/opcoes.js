// Opções da partida (#opcoes): a engrenagem do HUD (#opcoes-hud) ou a tecla O abrem
// uma janela no meio da tela com o que antes ficava solto na fileira do HUD, embaixo
// do minimapa (pedido do Mateus, 05/nov/2026): os botões das janelas (Status,
// Inventário, Tabela e Última morte, com as teclas de cada uma), as barras de volume
// e o mudo (outro PainelVolume, sobre `.opcoes-som`), o ping, o "Ver comandos" e o
// Sair da partida. O "Ver comandos" abre a janela de Comandos (comandos.js) por cima
// desta, que continua aberta embaixo.
//
// Os botões das janelas guardam os ids de antes (#status-hud, #inventario-hud,
// #tabela-hud, #morte-hud): cada janela continua ouvindo o próprio botão, e aqui só
// fechamos a caixa no mesmo clique, para a janela pedida aparecer sem nada por cima.
// O ping (#ping) é o mesmo que hud.js escreve a cada quadro.
//
// O jogo não pausa (é multijogador): a nave segue voando por baixo, sem tiro enquanto
// a caixa está aberta, como a janela de volume. Fecha no ✕, no O de novo, no ESC
// (main.js) ou clicando fora. No controle é uma janela de mexer (joystick.js).

import { PainelVolume } from './volume.js';

export class PainelOpcoes {
  /**
   * @param {{ el: HTMLElement, sons: import('./sons.js').Sons, aoMudarSom?: () => void,
   *   aoSair: () => void, aoComandos?: () => void, som?: (nome: string) => void }} opcoes
   *   `aoSair` é o Sair da partida (abre a confirmação); `aoComandos`, o Ver comandos.
   */
  constructor({ el, sons, aoMudarSom = () => {}, aoSair, aoComandos = () => {}, som = () => {} }) {
    this.el = el;
    this.sons = sons;
    this.som = som;
    this.volume = new PainelVolume({ sons, aoMudarSom, el: el.querySelector('.opcoes-som'), fundo: false });
    el.querySelector('.fechar').addEventListener('click', () => this.fechar());
    el.querySelector('.sair-partida').addEventListener('click', () => {
      this.fechar();
      aoSair();
    });
    // As Opções ficam abertas embaixo dos Comandos (o ESC fecha um e depois o outro).
    el.querySelector('.ver-comandos')?.addEventListener('click', () => aoComandos());
    for (const b of el.querySelectorAll('.opcoes-janelas button')) b.addEventListener('click', () => this.fechar());
    // Clique no fundo escurecido (fora da caixa) fecha.
    el.addEventListener('pointerdown', (e) => {
      if (e.target === el) this.fechar();
    });
  }

  /** A caixa está na tela? (enquanto estiver, o Z e o X não disparam) */
  get aberto() {
    return !this.el.hidden;
  }

  abrir() {
    if (this.aberto) return;
    this.sons.desbloquear();
    this.volume.atualizar();
    this.el.hidden = false;
    this.som('painel');
  }

  fechar() {
    if (!this.aberto) return;
    this.el.hidden = true;
    // O foco num botão da caixa prenderia o Espaço e o Enter do jogo.
    if (this.el.contains(document.activeElement)) document.activeElement.blur();
  }

  alternar() {
    if (this.aberto) this.fechar();
    else this.abrir();
  }
}
