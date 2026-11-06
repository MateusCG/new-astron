// Conexão das filas online (server/filas.js) enquanto o menu está aberto: um
// WebSocket no mesmo /ws do jogo, que observa a contagem das filas (aba Jogar, em
// tempo real) e leva a entrada na fila, a escolha da nave, o Pronto e a saída da
// Seleção. Não vira jogo: quando a sala começa, o menu decola com o token por outra
// conexão (rede.js) e esta desliga.
//
// Caiu a conexão: tenta de novo sozinha (de RECONEXAO_MIN_MS dobrando até
// RECONEXAO_MAX_MS) e, se o piloto ainda está na Seleção de um modo de fila, entra na
// fila outra vez (no fim dela: a vaga de antes ficou no servidor que caiu ou foi
// liberada). As regras do estado e do botão ficam em fila-regras.js.
//
// Batimento: a cada BATIMENTO_MS manda um {t:'ping'} (o servidor responde 'pong').
// Na fila e na sala a conexão pode ficar muito tempo sem mensagem, e o proxy da
// hospedagem (Railway) derruba WebSocket parado; cair no meio da sala a desfaz
// para todos.

import { urlDoServidor } from './rede.js';
import { estadoFilaVazio, aplicarMsgFila } from './fila-regras.js';

const RECONEXAO_MIN_MS = 1000;
const RECONEXAO_MAX_MS = 10000;
const BATIMENTO_MS = 20000;

export class ConexaoFila {
  /**
   * @param {{ aoContagem?: (c: object|null) => void, aoEstado?: (e: object) => void,
   *   url?: string, WebSocketImpl?: typeof WebSocket, agora?: () => number }} [op]
   * `aoContagem` recebe {online, publica} do servidor (null sem conexão); `aoEstado`,
   * o estado da fila (fila-regras.js) a cada mudança.
   */
  constructor({ aoContagem = () => {}, aoEstado = () => {}, url, WebSocketImpl, agora = () => performance.now() } = {}) {
    this.aoContagem = aoContagem;
    this.aoEstado = aoEstado;
    this.url = url ?? urlDoServidor();
    this.WS = WebSocketImpl ?? globalThis.WebSocket;
    this.agora = agora;
    this.estado = estadoFilaVazio();
    this.contagem = null;
    this.quer = null; // { modo, escolha }: o piloto quer estar na fila (Seleção aberta num modo de fila)
    this.ligada = false;
    this.esperaMs = RECONEXAO_MIN_MS;
    this.ws = null;
  }

  /** Abre a conexão (o menu apareceu). */
  ligar() {
    if (this.ligada) return;
    this.ligada = true;
    this.#abrir();
  }

  /** Fecha a conexão sem tentar de novo (o menu foi para a partida). */
  desligar() {
    this.ligada = false;
    this.quer = null;
    clearTimeout(this.relogio);
    clearInterval(this.batimento);
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
    this.#mudar(estadoFilaVazio());
  }

  /** Entra na fila do `modo` ('online' | 'publica') com a escolha {nome, race, classe}. */
  entrar(modo, escolha) {
    this.quer = { modo, escolha: { ...escolha } };
    if (this.#aberta()) {
      this.#enviar({ t: 'entrarFila', modo, ...escolha });
      if (this.estado.fase === 'fora') this.#mudar({ fase: 'conectando', modo, aviso: null });
    } else {
      this.#mudar({ fase: 'conectando', modo, aviso: null });
      this.ligar();
    }
  }

  /** A nave (ou o nome) mudou na Seleção: os do time veem na hora. */
  escolher(escolha) {
    if (this.quer) this.quer.escolha = { ...escolha };
    if ((this.estado.fase === 'procurando' || this.estado.fase === 'sala') && !this.estado.voce?.pronto) this.#enviar({ t: 'escolha', ...escolha });
  }

  /** Trava a nave (com a escolha final junto): na sala, ou procurando com o grupo pronto para começar mais cedo. */
  pronto(escolha) {
    if (!(this.estado.fase === 'sala' || (this.estado.fase === 'procurando' && this.estado.cedo))) return;
    this.#enviar({ t: 'pronto', ...escolha });
  }

  /** Desfaz o Pronto (a nave destrava para trocar). */
  cancelarPronto() {
    if ((this.estado.fase === 'sala' || this.estado.fase === 'procurando') && this.estado.voce?.pronto) this.#enviar({ t: 'cancelarPronto' });
  }

  /** No 3 contra 3, procurando: passa para o outro time (o servidor confere a vaga). */
  trocarTime() {
    if (this.estado.fase === 'procurando' && !this.estado.voce?.pronto) this.#enviar({ t: 'trocarTime' });
  }

  /** Sai da fila (e da sala, que se desfaz). */
  sair() {
    this.quer = null;
    if (this.estado.fase !== 'fora') this.#enviar({ t: 'sairFila' });
    this.#mudar(estadoFilaVazio());
  }

  // ---------- Por dentro ----------

  #aberta() {
    return this.ws && this.ws.readyState === 1;
  }

  #abrir() {
    let ws;
    try {
      ws = new this.WS(this.url);
    } catch {
      this.#caiu();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.esperaMs = RECONEXAO_MIN_MS;
      clearInterval(this.batimento);
      this.batimento = setInterval(() => this.#enviar({ t: 'ping', c: 0 }), BATIMENTO_MS);
      this.#enviar({ t: 'filas' });
      if (this.quer) this.#enviar({ t: 'entrarFila', modo: this.quer.modo, ...this.quer.escolha });
    };
    ws.onmessage = (e) => {
      let m;
      try {
        m = JSON.parse(e.data);
      } catch {
        return;
      }
      if (m.t === 'filas') {
        this.contagem = m;
        this.aoContagem(m);
      } else if (m.t === 'fila') {
        const novo = aplicarMsgFila(this.estado, m, this.agora());
        // Saiu por conta do servidor (o tempo da seleção acabou) ou a partida começou:
        // não volta sozinho para a fila.
        if (novo.fase === 'fora' || novo.fase === 'comecar') this.quer = null;
        this.#mudar(novo);
      } else if (m.t === 'resultado' && m.ok === false && m.acao === 'entrarFila') {
        this.quer = null;
        this.#mudar({ fase: 'fora', modo: this.estado.modo, aviso: m.codigo });
      }
    };
    ws.onerror = () => {};
    ws.onclose = () => this.#caiu();
  }

  #caiu() {
    clearInterval(this.batimento);
    this.ws = null;
    this.contagem = null;
    this.aoContagem(null);
    if (this.estado.fase !== 'fora' || this.quer) this.#mudar({ fase: this.quer ? 'conectando' : 'fora', modo: this.quer?.modo ?? null, aviso: 'sem_conexao' });
    if (!this.ligada) return;
    clearTimeout(this.relogio);
    this.relogio = setTimeout(() => this.ligada && this.#abrir(), this.esperaMs);
    this.esperaMs = Math.min(RECONEXAO_MAX_MS, this.esperaMs * 2);
  }

  #enviar(m) {
    if (this.#aberta()) this.ws.send(JSON.stringify(m));
  }

  #mudar(estado) {
    this.estado = estado;
    this.aoEstado(estado);
  }
}
