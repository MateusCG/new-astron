// Tela cheia ao decolar (pedido do Mateus, 06/nov/2026): a partida abre como o F11,
// sem abas nem barra de endereço. O site não pode apertar o F11, mas a Fullscreen API
// dá o mesmo resultado, e o navegador só a aceita logo depois de um gesto do jogador
// (clique ou tecla). O Decolar é esse gesto: o pedido sai no mesmo clique. Nas filas
// a partida começa sozinha quando todos dão Pronto, sem gesto: aí o pedido fica armado
// e sai na primeira tecla ou clique do jogador (o primeiro W já põe a tela cheia).
//
// O ESC: em tela cheia, o navegador sairia dela no primeiro ESC e a página nem veria a
// tecla (a caixa "Sair da partida?" não abriria). No Chrome e no Edge, o Keyboard Lock
// prende o ESC para o jogo: o toque curto vai para a página e segurar o ESC sai da tela
// cheia (o próprio navegador avisa). No Firefox e no Safari não há Keyboard Lock: o
// primeiro ESC sai da tela cheia e o segundo abre a caixa.
//
// Já em tela cheia (pela API ou pelo F11 do navegador), nada muda. De volta ao menu, a
// tela cheia continua, como num jogo instalado; o jogador sai dela quando quiser.

/** Teclas que não contam como gesto para o navegador (ESC sai da tela cheia; F11 é dele). */
const TECLAS_SEM_GESTO = new Set(['Escape', 'F11', 'MetaLeft', 'MetaRight']);
const CAPTURA = { capture: true };

export class TelaCheia {
  /**
   * @param {{ doc?: Document, janela?: Window, nav?: Navigator }} [op]
   *   (os padrões são os do navegador; os testes passam de mentira)
   */
  constructor({ doc = globalThis.document, janela = globalThis, nav = globalThis.navigator } = {}) {
    this.doc = doc;
    this.janela = janela;
    this.nav = nav;
    this.armado = false;
    this.aoGesto = (e) => {
      if (e.type === 'keydown' && (TECLAS_SEM_GESTO.has(e.code) || e.repeat)) return;
      this.desarmar();
      this.#pedirAgora(false); // uma tentativa só: recusado de novo, desiste
    };
    // Saiu da tela cheia (segurou o ESC, F11): solta o ESC de volta para o navegador.
    this.doc?.addEventListener?.('fullscreenchange', () => {
      if (!this.doc.fullscreenElement) this.nav?.keyboard?.unlock?.();
    });
  }

  /** O navegador está em tela cheia: pela API ou pelo F11 (a janela do tamanho da tela). */
  get ativa() {
    if (this.doc?.fullscreenElement) return true;
    if (this.janela?.matchMedia?.('(display-mode: fullscreen)')?.matches) return true;
    const tela = this.janela?.screen;
    return !!tela && this.janela.innerWidth >= tela.width && this.janela.innerHeight >= tela.height;
  }

  /** O navegador sabe pôr a página em tela cheia (o iPhone, por exemplo, não). */
  get suportada() {
    return typeof this.doc?.documentElement?.requestFullscreen === 'function' && this.doc.fullscreenEnabled !== false;
  }

  /**
   * Põe em tela cheia. Chame no clique do Decolar (o gesto do jogador); sem gesto, o
   * navegador recusa e o pedido fica armado para a próxima tecla ou clique.
   */
  pedir() {
    if (!this.suportada || this.ativa) return;
    this.#pedirAgora(true);
  }

  /** Esquece o pedido armado (a partida acabou antes do gesto). */
  desarmar() {
    if (!this.armado) return;
    this.armado = false;
    this.janela.removeEventListener('keydown', this.aoGesto, CAPTURA);
    this.janela.removeEventListener('pointerdown', this.aoGesto, CAPTURA);
  }

  #armar() {
    if (this.armado) return;
    this.armado = true;
    this.janela.addEventListener('keydown', this.aoGesto, CAPTURA);
    this.janela.addEventListener('pointerdown', this.aoGesto, CAPTURA);
  }

  /** @param {boolean} podeArmar recusado, fica esperando o próximo gesto */
  #pedirAgora(podeArmar) {
    if (this.ativa) return;
    const recusado = () => podeArmar && this.#armar();
    // Sem o gesto, o navegador recusa (o Chrome diz antes, pelo userActivation).
    if (this.nav?.userActivation && !this.nav.userActivation.isActive) return recusado();
    let p;
    try {
      p = this.doc.documentElement.requestFullscreen({ navigationUI: 'hide' });
    } catch {
      return recusado();
    }
    Promise.resolve(p).then(() => this.nav?.keyboard?.lock?.(['Escape'])?.catch?.(() => {}), recusado);
  }
}
