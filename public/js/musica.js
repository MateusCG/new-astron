// Música da partida (pedido do Mateus, 07/nov/2026): a trilha começa quando a tela de
// carregamento termina e o piloto já controla a nave (`comecar` da partida em main.js),
// repete sem parar e some com uma rampa curta ao sair da partida.
//
// Por que um <audio> e não um AudioBuffer como os efeitos: a trilha tem 24 min; decodificada
// inteira seriam ~550 MB de memória (48 kHz, estéreo, float) e uns segundos de CPU travando
// a tela de carregamento. O elemento toca em fluxo, buscando aos poucos, e entra no grafo
// da Web Audio por um MediaElementAudioSourceNode, então passa pelo canal da música
// (`sons.saidaMusica`: a barra "Música" do volume) e pelo mestre (o M deixa mudo).
//
// O arquivo veio masterizado alto (loudness integrada de −11,9 LUFS, medida no Chromium
// pelo BS.1770 com o gate): no ganho do arquivo ficaria por cima dos tiros (−16 de máxima
// momentânea). GANHO_MUSICA o leva a ALVO_MUSICA, uns 6 dB abaixo dos efeitos antes da
// barra; com a barra no padrão (60%) fica perto de −26, música de fundo.
//
// A busca começa já na tela de carregamento (`preparar`), sem segurar a barra dela: quando a
// partida começa, o começo da faixa já está no navegador.

/** A trilha da partida, em public/sons/. */
export const MUSICA_PARTIDA = 'musica/partida.mp3';
/** Loudness integrada do arquivo (LUFS, BS.1770 com gate), medida uma vez. */
export const LUFS_MUSICA_PARTIDA = -11.9;
/** Onde a música fica antes da barra de volume (LUFS integrada). */
export const ALVO_MUSICA = -22;
/** Ganho fixo do arquivo até o alvo. */
export const GANHO_MUSICA = 10 ** ((ALVO_MUSICA - LUFS_MUSICA_PARTIDA) / 20);
/** Rampa de entrada ao começar a partida e de saída ao sair dela (constante de tempo, s). */
export const ENTRADA_MUSICA_S = 0.8;
export const SAIDA_MUSICA_S = 0.25;
/** Depois de quanto tempo da saída o elemento pausa (a rampa já chegou perto de zero). */
const PAUSA_APOS_SAIDA_MS = 1500;

export class MusicaPartida {
  /**
   * @param {{ sons: import('./sons.js').Sons, pasta?: string, arquivo?: string,
   *   criarAudio?: () => HTMLAudioElement }} opcoes `criarAudio` existe para os testes.
   */
  constructor({ sons, pasta = '/sons/', arquivo = MUSICA_PARTIDA, criarAudio = null }) {
    this.sons = sons;
    this.url = pasta + arquivo;
    this._criarAudio = criarAudio ?? (() => (typeof Audio === 'function' ? new Audio() : null));
    this.audio = null;
    this.fonte = null; // MediaElementAudioSourceNode (um por elemento, para sempre)
    this.ganho = null; // a rampa de entrada e saída, já com GANHO_MUSICA
    this.tocando = false;
    this._pausa = null;
  }

  /** Começa a buscar a faixa (sem tocar). Pode ser chamado de novo: só a primeira vez busca. */
  preparar() {
    if (this.audio) return;
    const audio = this._criarAudio();
    if (!audio) return;
    audio.loop = true;
    audio.preload = 'auto';
    audio.src = this.url;
    audio.load?.();
    this.audio = audio;
  }

  /** Liga o elemento no canal da música; false sem Web Audio (a trilha fica quieta). */
  _ligar() {
    if (this.fonte) return true;
    const saida = this.sons.saidaMusica;
    const ctx = this.sons.ctx;
    if (!saida || !ctx?.createMediaElementSource) return false;
    try {
      this.fonte = ctx.createMediaElementSource(this.audio);
    } catch {
      return false;
    }
    this.ganho = ctx.createGain();
    this.ganho.gain.value = 0;
    this.fonte.connect(this.ganho);
    this.ganho.connect(saida);
    return true;
  }

  /** Começa a trilha do começo, subindo em ENTRADA_MUSICA_S. */
  tocar() {
    this.preparar();
    if (!this.audio) return;
    this.sons.desbloquear();
    if (!this._ligar()) return;
    clearTimeout(this._pausa);
    this._pausa = null;
    const g = this.ganho.gain;
    const agora = this.sons.ctx.currentTime;
    g.cancelScheduledValues?.(agora);
    g.setValueAtTime?.(0, agora);
    g.setTargetAtTime(GANHO_MUSICA, agora, ENTRADA_MUSICA_S);
    try {
      this.audio.currentTime = 0;
    } catch {
      // Sem nada buscado ainda: começa do zero de qualquer jeito.
    }
    this.tocando = true;
    // Bloqueio de autoplay ou arquivo que não veio: o jogo segue sem música.
    this.audio.play()?.catch?.(() => {});
  }

  /** Some em SAIDA_MUSICA_S e pausa (sair da partida). */
  parar() {
    if (!this.tocando) return;
    this.tocando = false;
    if (this.ganho) {
      const g = this.ganho.gain;
      const agora = this.sons.ctx.currentTime;
      g.cancelScheduledValues?.(agora);
      g.setValueAtTime?.(g.value, agora);
      g.setTargetAtTime(0, agora, SAIDA_MUSICA_S);
    }
    clearTimeout(this._pausa);
    this._pausa = setTimeout(() => {
      this._pausa = null;
      if (!this.tocando) this.audio?.pause();
    }, PAUSA_APOS_SAIDA_MS);
  }
}
