// Conexão WebSocket com o servidor. O endereço sai da própria página (mesmo host),
// ou de ?servidor=ws://... para testar contra outro servidor.

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
      this.ws = new WebSocket(this.url);
      this.ws.onopen = () => this.enviar({ t: 'entrar', nome, race });
      this.ws.onerror = () => falha(new Error('sem_conexao'));
      this.ws.onclose = () => this.aoFechar();
      this.ws.onmessage = (e) => {
        const m = JSON.parse(e.data);
        if (m.t === 'bemvindo') {
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

  #medirPing() {
    setInterval(() => this.enviar({ t: 'ping', c: performance.now() }), 2000);
  }

  enviar(m) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }
}
