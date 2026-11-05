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

/** Evento de mouse com o alvo de mentira: na tela do jogo (#jogo) ou num painel. */
function mouse(tipo, button, noJogo = true) {
  const e = new Event(tipo, { cancelable: true });
  e.button = button;
  Object.defineProperty(e, 'target', { value: { closest: (sel) => (noJogo && sel === '#jogo' ? {} : null) } });
  janela.dispatchEvent(e);
  return e;
}

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

test('cliente: a tecla trocada na aba Configurações vale na hora, e a antiga não', async () => {
  const { atribuirAtalho, restaurarPadrao } = await import('../public/js/atalhos.js');
  const c = new Controles(raiz);
  atribuirAtalho('teclado', 'armaZ', 0, 'KeyU');
  tecla('keydown', 'KeyU');
  assert.equal(c.ler().f1, true, 'U atira com o Z');
  tecla('keyup', 'KeyU');
  tecla('keydown', 'KeyZ');
  assert.equal(c.ler().f1, false, 'o Z saiu da casa');
  tecla('keyup', 'KeyZ');
  // L no recall: sai do pouso, e o pulso vai no campo r.
  atribuirAtalho('teclado', 'recall', 0, 'KeyL');
  tecla('keydown', 'KeyL');
  const inp = c.ler();
  assert.equal(inp.r, true);
  assert.equal(inp.p, false);
  tecla('keyup', 'KeyL');
  restaurarPadrao('teclado');
  tecla('keydown', 'KeyZ');
  assert.equal(c.ler().f1, true, 'de fábrica de novo');
  tecla('keyup', 'KeyZ');
  c.destruir();
});

test('cliente: o Z no clique esquerdo e o X no direito atiram com o clique na tela do jogo', async () => {
  const { atribuirAtalho, restaurarPadrao } = await import('../public/js/atalhos.js');
  const c = new Controles(raiz);
  atribuirAtalho('teclado', 'armaZ', 0, 'Mouse0');
  atribuirAtalho('teclado', 'armaX', 0, 'Mouse2');
  mouse('mousedown', 0);
  assert.equal(c.ler().f1, true, 'segurando o esquerdo atira com o Z');
  mouse('mousedown', 2);
  assert.equal(c.ler().f2, true, 'segurando o direito atira com o X');
  assert.equal(mouse('contextmenu', 2).defaultPrevented, true, 'sem o menu do navegador em cima do jogo');
  mouse('mouseup', 0);
  mouse('mouseup', 2);
  const solto = c.ler();
  assert.deepEqual([solto.f1, solto.f2], [false, false], 'soltou, parou');
  // Clique num painel (Loja, INVENTÁRIO, botão do HUD) é da interface, não tiro.
  mouse('mousedown', 0, false);
  assert.equal(c.ler().f1, false);
  mouse('mouseup', 0, false);
  restaurarPadrao('teclado');
  mouse('mousedown', 0);
  assert.equal(c.ler().f1, false, 'de fábrica o clique não atira');
  mouse('mouseup', 0);
  c.destruir();
});

test('cliente: na aba Configurações, o clique na casa que espera vira o atalho e é engolido', async () => {
  const { capturar, mapasAtuais, restaurarPadrao } = await import('../public/js/atalhos.js');
  let fim = null;
  capturar('teclado', 'armaX', 0, (r) => (fim = r));
  let chegou = 0;
  const contar = () => chegou++;
  addEventListener('mousedown', contar);
  addEventListener('click', contar);
  addEventListener('contextmenu', contar);
  mouse('mousedown', 2, false);
  mouse('contextmenu', 2, false);
  mouse('mouseup', 2, false);
  mouse('click', 2, false);
  assert.equal(fim?.entrada, 'Mouse2');
  assert.deepEqual(mapasAtuais().teclado.armaX, ['Mouse2', 'KeyK']);
  assert.equal(chegou, 0, 'nem a casa nem o botão direito (que apaga) recebem o clique');
  removeEventListener('mousedown', contar);
  removeEventListener('click', contar);
  removeEventListener('contextmenu', contar);
  restaurarPadrao('teclado');
});
