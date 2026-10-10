// Ciclo de vida do cliente fora do navegador: sair da partida (ESC) e entrar de
// novo não pode deixar listener, ping ou mensagem da partida anterior vivos. Os
// módulos de controles e rede não dependem do Three.js, então rodam no Node com
// uma janela mínima de mentira (EventTarget no lugar de window).

import { test } from 'node:test';
import assert from 'node:assert/strict';

const janela = new EventTarget();
globalThis.addEventListener = janela.addEventListener.bind(janela);
globalThis.removeEventListener = janela.removeEventListener.bind(janela);
globalThis.window ??= globalThis;
globalThis.matchMedia = () => ({ matches: false });
globalThis.HTMLInputElement ??= class {};
globalThis.location = { protocol: 'http:', host: 'localhost:5090', search: '' };

const { Controles } = await import('../public/js/controles.js');
const { Rede } = await import('../public/js/rede.js');

function tecla(tipo, code) {
  const e = new Event(tipo);
  e.code = code;
  e.repeat = false;
  janela.dispatchEvent(e);
}

const raiz = { classList: { add() {}, remove() {} } };

test('cliente: controles destruídos não escutam mais o teclado', () => {
  const c = new Controles(raiz);
  tecla('keydown', 'KeyW');
  assert.equal(c.ler().th, 1);
  c.destruir();
  assert.equal(c.ler().th, 0, 'soltou o que estava apertado');
  tecla('keydown', 'KeyW');
  assert.equal(c.ler().th, 0, 'keydown depois de destruir é ignorado');
});

test('cliente: entrar de novo não duplica os controles', () => {
  const velho = new Controles(raiz);
  velho.destruir();
  const novo = new Controles(raiz);
  tecla('keydown', 'KeyL');
  assert.equal(velho.pulsoPouso, false, 'o controle antigo não recebe a tecla');
  assert.equal(novo.ler().p, true);
  novo.destruir();
});

test('cliente: B (recall) vai como pulso de um passo no campo r', () => {
  const c = new Controles(raiz);
  tecla('keydown', 'KeyB');
  assert.equal(c.ler().r, true, 'o passo seguinte leva o pedido');
  assert.equal(c.ler().r, false, 'segurar B não repete: o servidor liga na borda');
  tecla('keyup', 'KeyB');
  tecla('keydown', 'KeyB');
  tecla('keyup', 'KeyB');
  assert.equal(c.ler().r, true, 'um toque rápido entre dois passos não se perde');
  c.destruir();
});

test('cliente: fechar a rede para o ping e não entrega mais mensagens', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
  const enviadas = [];
  class FalsoWebSocket {
    static OPEN = 1;
    constructor() {
      this.readyState = 1;
      FalsoWebSocket.ultimo = this;
    }
    send(m) {
      enviadas.push(JSON.parse(m));
    }
    close() {
      this.readyState = 3;
      this.fechado = true;
    }
  }
  globalThis.WebSocket = FalsoWebSocket;

  const rede = new Rede();
  const entrou = rede.entrar('Piloto', 'acron');
  const ws = FalsoWebSocket.ultimo;
  ws.onopen();
  assert.deepEqual(enviadas[0], { t: 'entrar', nome: 'Piloto', race: 'acron' });
  ws.onmessage({ data: JSON.stringify({ t: 'bemvindo', id: 1 }) });
  await entrou;

  t.mock.timers.tick(2000);
  assert.equal(enviadas.filter((m) => m.t === 'ping').length, 1, 'pinga enquanto joga');

  const recebidas = [];
  rede.aoReceber = (m) => recebidas.push(m);
  let avisouFechar = false;
  rede.aoFechar = () => (avisouFechar = true);
  rede.fechar();
  assert.ok(ws.fechado);
  assert.equal(ws.onmessage, null, 'snapshot atrasado não chega ao jogo desmontado');
  assert.equal(ws.onclose, null);
  ws.readyState = 1; // mesmo que o socket ainda aceitasse envio, o ping parou
  t.mock.timers.tick(10000);
  assert.equal(enviadas.filter((m) => m.t === 'ping').length, 1, 'o ping parou');
  assert.equal(recebidas.length, 0);
  assert.equal(avisouFechar, false, 'quem fecha não recebe "conexão perdida"');
});

test('cliente: partida cheia recusa a entrada com o código do servidor', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
  class FalsoWebSocket {
    static OPEN = 1;
    constructor() {
      this.readyState = 1;
      FalsoWebSocket.ultimo = this;
    }
    send() {}
    close() {
      this.readyState = 3;
      this.fechado = true;
    }
  }
  globalThis.WebSocket = FalsoWebSocket;
  const rede = new Rede();
  const entrou = rede.entrar('Piloto', 'acron');
  const ws = FalsoWebSocket.ultimo;
  ws.onopen();
  ws.onmessage({ data: JSON.stringify({ t: 'erro', codigo: 'partida_cheia' }) });
  await assert.rejects(entrou, { message: 'partida_cheia' });
  assert.ok(ws.fechado, 'fecha a conexão');
});
