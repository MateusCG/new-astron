// Janela de volume (#volume): três barras, música, efeitos e locutor, de 0 a 100%. Abre pelo
// botão de som do header do menu (#botao-som), fecha no ✕,
// no ESC ou clicando fora. As mesmas barras aparecem fixas na aba Configurações do
// menu (#config-som): outro PainelVolume sobre outro elemento, sem ✕ nem fundo, que
// lê e grava o mesmo Sons (`atualizar` mostra os valores de agora ao abrir a aba); na
// partida, as barras ficam na janela de Opções (opcoes.js, `.opcoes-som`). O jogo não pausa (é multijogador): a janela fica por cima
// de tudo, sem tiro enquanto aberta, como o painel da Loja.
//
// Os volumes moram no Sons (sons.js), que guarda no navegador. A barra muda o som na
// hora, enquanto arrasta; ao soltar, toca o clique da interface no volume novo dos
// efeitos, para o jogador ouvir onde deixou (a do locutor toca uma frase dele, se já
// carregou). Mexer numa barra com o jogo mudo (M)
// liga o som: quem sobe o volume quer ouvir. A trilha da partida (musica.js)
// toca por `sons.saidaMusica`, no volume da barra da música.

import { SONS_INTERFACE } from './sons.js';
import { somDoAnuncio } from './locutor-regras.js';

const CANAIS = { musica: 'volumeMusica', efeitos: 'volumeEfeitos', locutor: 'volumeLocutor' };
/** A frase que a barra do locutor toca ao soltar, para ouvir o volume. */
const AMOSTRA_LOCUTOR = somDoAnuncio('godlike');

export class PainelVolume {
  /**
   * @param {{ sons: import('./sons.js').Sons, aoMudarSom?: () => void }} opcoes
   *   `aoMudarSom` é chamado quando o mudo muda por aqui (para os textos de estado).
   *   `fundo`: o `el` é o fundo escurecido da janela (clicar nele fecha). As barras
   *   dentro de outra tela (Configurações, Opções da partida) vão com `false`: o
   *   clique na sobra da caixa não pode esconder as barras.
   */
  constructor({ sons, aoMudarSom = () => {}, el = document.querySelector('#volume'), fundo = true }) {
    this.sons = sons;
    this.aoMudarSom = aoMudarSom;
    this.el = el;
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
      if (canal === 'locutor') {
        barra.addEventListener('change', () => {
          this.sons.carregar(AMOSTRA_LOCUTOR).then(() => this.sons.tocarLocutor(AMOSTRA_LOCUTOR));
        });
      }
    }
    this.el.querySelector('.fechar')?.addEventListener('click', () => this.fechar());
    this.el.querySelector('.alternar-mudo').addEventListener('click', (e) => {
      this.sons.mudo = !this.sons.mudo;
      this.aoMudarSom();
      e.currentTarget.blur(); // o foco no botão não pode prender as teclas do jogo
    });
    // Clique no fundo escurecido (fora da janela) fecha.
    if (fundo) {
      this.el.addEventListener('pointerdown', (e) => {
        if (e.target === this.el) this.fechar();
      });
    }
  }

  /** A janela está na tela? (enquanto estiver, o Z e o X não disparam) */
  get aberto() {
    return !this.el.hidden;
  }

  abrir() {
    this.sons.desbloquear(); // abrir já é um gesto: o som do teste toca na hora
    this.atualizar();
    this.el.hidden = false;
    this.aoMudarSom();
  }

  /** Mostra nas barras os volumes de agora (mudados pela outra janela ou pelo M). */
  atualizar() {
    for (const canal of Object.keys(CANAIS)) this.#mostrar(canal, true);
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
