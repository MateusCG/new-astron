// Janela de volume (#volume): duas barras, música e efeitos, de 0 a 100%. Abre pelo
// botão de som da tela inicial (#botao-som) e pelo do HUD (#som-hud), fecha no ✕,
// no ESC ou clicando fora. O jogo não pausa (é multijogador): a janela fica por cima
// de tudo, sem tiro enquanto aberta, como o menu de armas.
//
// Os volumes moram no Sons (sons.js), que guarda no navegador. A barra muda o som na
// hora, enquanto arrasta; ao soltar, toca o clique da interface no volume novo dos
// efeitos, para o jogador ouvir onde deixou. Mexer numa barra com o jogo mudo (M)
// liga o som: quem sobe o volume quer ouvir. A música ainda não existe no jogo, mas
// a barra já vale: a trilha vai tocar por `sons.saidaMusica`, no volume escolhido.

import { SONS_INTERFACE } from './sons.js';

const CANAIS = { musica: 'volumeMusica', efeitos: 'volumeEfeitos' };

export class PainelVolume {
  /**
   * @param {{ sons: import('./sons.js').Sons, aoMudarSom?: () => void }} opcoes
   *   `aoMudarSom` é chamado quando o mudo muda por aqui (para os textos de estado).
   */
  constructor({ sons, aoMudarSom = () => {} }) {
    this.sons = sons;
    this.aoMudarSom = aoMudarSom;
    this.el = document.querySelector('#volume');
    this.barras = {};
    for (const [canal, prop] of Object.entries(CANAIS)) {
      const caixa = this.el.querySelector(`[data-canal='${canal}']`);
      const barra = caixa.querySelector('input');
      const pct = caixa.querySelector('.pct');
      this.barras[canal] = { barra, pct, prop };
      barra.addEventListener('input', () => {
        this.sons[prop] = Number(barra.value) / 100;
        if (this.sons.mudo && Number(barra.value) > 0) {
          this.sons.mudo = false;
          this.aoMudarSom();
        }
        this.#mostrar(canal);
      });
      if (canal === 'efeitos') barra.addEventListener('change', () => this.sons.tocarInterface(SONS_INTERFACE.clique));
    }
    this.el.querySelector('.fechar').addEventListener('click', () => this.fechar());
    this.el.querySelector('.alternar-mudo').addEventListener('click', (e) => {
      this.sons.mudo = !this.sons.mudo;
      this.aoMudarSom();
      e.currentTarget.blur(); // o foco no botão não pode prender as teclas do jogo
    });
    // Clique no fundo escurecido (fora da janela) fecha.
    this.el.addEventListener('pointerdown', (e) => {
      if (e.target === this.el) this.fechar();
    });
  }

  /** A janela está na tela? (enquanto estiver, o Z e o X não disparam) */
  get aberto() {
    return !this.el.hidden;
  }

  abrir() {
    this.sons.desbloquear(); // abrir já é um gesto: o som do teste toca na hora
    for (const canal of Object.keys(CANAIS)) this.#mostrar(canal, true);
    this.el.hidden = false;
    this.aoMudarSom();
  }

  fechar() {
    if (this.el.contains(document.activeElement)) document.activeElement.blur();
    this.el.hidden = true;
  }

  alternar() {
    if (this.aberto) this.fechar();
    else this.abrir();
  }

  /** Atualiza o número e o preenchimento da barra (e o valor dela, com `doSom`). */
  #mostrar(canal, doSom = false) {
    const { barra, pct, prop } = this.barras[canal];
    if (doSom) barra.value = String(Math.round(this.sons[prop] * 100));
    pct.textContent = `${barra.value}%`;
    barra.style.setProperty('--pct', `${barra.value}%`);
  }
}
