// Conexão WebSocket com o servidor. O endereço sai da própria página (mesmo host),
// ou de ?servidor=ws://... para testar contra outro servidor.
//
// entrar() sempre termina: resolve no 'bemvindo' ou falha com um código
// (sem_conexao, conexao_fechada, tempo_esgotado). Antes, uma conexão que fechava
// sem erro deixava o botão em "Conectando…" para sempre.

const TEMPO_ENTRADA_MS = 10000;

export class Rede {
  constructor() {
    const param = new URLSearchParams(location.search).get('servidor');
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.url = param || `${proto}//${location.host}/ws`;
    this.aoReceber = () => {};
    this.aoFechar = () => {};
    this.ping = 0;
  }

  /** Conecta e entra no jogo. Resolve quando chega o 'bemvindo'. */
  entrar(nome, race) {
    return new Promise((ok, falha) => {
      let decidido = false; // a promessa só resolve ou falha uma vez
      const desistir = (codigo) => {
        if (decidido) return;
        decidido = true;
        clearTimeout(relogio);
        this.fechar();
        falha(new Error(codigo));
      };
      const relogio = setTimeout(() => desistir('tempo_esgotado'), TEMPO_ENTRADA_MS);
      try {
        this.ws = new WebSocket(this.url);
      } catch {
        desistir('sem_conexao');
        return;
      }
      this.ws.onopen = () => this.enviar({ t: 'entrar', nome, race });
      this.ws.onerror = () => desistir('sem_conexao');
      this.ws.onclose = () => (decidido ? this.aoFechar() : desistir('conexao_fechada'));
      this.ws.onmessage = (e) => {
        const m = JSON.parse(e.data);
        if (m.t === 'bemvindo') {
          decidido = true;
          clearTimeout(relogio);
          ok(m);
          this.#medirPing();
        } else if (m.t === 'pong') {
          this.ping = Math.round(performance.now() - m.c);
        } else {
          this.aoReceber(m);
        }
      };
    });
  }

  /**
   * Fecha a conexão (sem avisar aoFechar: quem fecha sabe por quê). Também desliga
   * o ping e as mensagens que ainda estejam a caminho: depois de sair para a tela
   * inicial, um snapshot atrasado não pode cair num jogo já desmontado.
   */
  fechar() {
    clearInterval(this.relogioPing);
    this.aoReceber = () => {};
    this.aoFechar = () => {};
    if (!this.ws) return;
    this.ws.onclose = null;
    this.ws.onmessage = null;
    this.ws.onerror = null;
    this.ws.close();
  }

  #medirPing() {
    this.relogioPing = setInterval(() => this.enviar({ t: 'ping', c: performance.now() }), 2000);
  }

  enviar(m) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }
}
