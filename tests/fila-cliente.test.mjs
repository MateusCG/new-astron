// Fila online no cliente (public/js/fila-regras.js e public/js/fila.js): o estado a
// partir das mensagens do servidor, o botão "Aguardando…"/"Pronto", a linha com o
// contador da sala, as vagas da Seleção e a conexão que entra de novo na fila quando
// cai.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  estadoFilaVazio,
  aplicarMsgFila,
  botaoDaFila,
  linhaDaFila,
  formatarTempo,
  textoAviso,
  textoContagemModo,
  vagasDaFila,
  titulosDosLados,
} from '../public/js/fila-regras.js';
import { SELECAO_S } from '../server/filas.js';

globalThis.location ??= { search: '', protocol: 'http:', host: 'localhost:5090' };
const { ConexaoFila } = await import('../public/js/fila.js');

const sala = (extra = {}) => ({
  t: 'fila',
  estado: 'sala',
  modo: 'online',
  id: 7,
  restante: 60,
  prontos: 1,
  total: 6,
  bots: 0,
  voce: { time: 1, pronto: 0, race: 'acron', classe: 'assault' },
  times: [
    [{ nome: 'X', pronto: 1 }, { nome: 'Y', pronto: 0 }, { nome: 'Z', pronto: 0 }],
    [{ nome: 'B', pronto: 0, race: 'bellico', classe: 'mobile' }, { nome: 'Eu', pronto: 0, race: 'acron', classe: 'assault', voce: 1 }],
  ],
  ...extra,
});

test('fila no cliente: procurando, o botão fica "Aguardando…" apagado com a espera correndo', () => {
  const e = aplicarMsgFila(estadoFilaVazio(), { t: 'fila', estado: 'procurando', modo: 'online', n: 4, precisa: 6, espera: 12 }, 100000);
  assert.deepEqual(botaoDaFila(e), { texto: 'Aguardando…', habilitado: false, acao: null });
  const l = linhaDaFila(e, 103000, 60);
  assert.equal(l.texto, 'Procurando partida · 4 de 6 pilotos');
  assert.equal(l.contador, '0:15');
  assert.equal(l.fracao, null);
});

test('fila no cliente: na sala o botão vira Pronto, com o contador e a barra; depois do Pronto, Aguardando…', () => {
  const e = aplicarMsgFila(estadoFilaVazio(), sala(), 0);
  assert.equal(e.nova, true);
  assert.deepEqual(botaoDaFila(e), { texto: 'Pronto', habilitado: true, acao: 'pronto' });
  const l = linhaDaFila(e, 15500, 60);
  assert.equal(l.contador, '0:45');
  assert.ok(Math.abs(l.fracao - 44.5 / 60) < 1e-9);
  assert.equal(l.urgente, false);
  assert.equal(linhaDaFila(e, 51000, 60).urgente, true, 'os últimos 10 s');
  assert.equal(linhaDaFila(e, 70000, 60).contador, '0:00');
  const pronto = aplicarMsgFila(e, sala({ prontos: 2, voce: { time: 1, pronto: 1 } }), 1000);
  assert.equal(pronto.nova, false, 'a mesma sala');
  assert.deepEqual(botaoDaFila(pronto), { texto: 'Aguardando…', habilitado: false, acao: null });
  assert.match(linhaDaFila(pronto, 1000, 60).texto, /Nave travada · 2 de 6 prontos/);
});

test('fila no cliente: começar decola; fora da fila o botão procura de novo, com o aviso', () => {
  const c = aplicarMsgFila(estadoFilaVazio(), { t: 'fila', estado: 'comecar', modo: 'publica', sala: 3, token: 'abc', time: 0, nome: 'Eu', race: 'acron', classe: 'mobile' }, 0);
  assert.deepEqual([c.fase, c.token, c.race], ['comecar', 'abc', 'acron']);
  assert.equal(botaoDaFila(c).texto, 'Decolando…');
  const f = aplicarMsgFila(c, { t: 'fila', estado: 'fora', aviso: 'sem_pronto' }, 0);
  assert.deepEqual(botaoDaFila(f), { texto: 'Procurar partida', habilitado: true, acao: 'entrar' });
  assert.match(textoAviso(f.aviso), /saiu da fila/);
  assert.match(textoAviso('sala_tempo'), /começo da fila/);
  assert.equal(textoAviso(null), null);
});

test('fila no cliente: o tempo em m:ss e a contagem dos modos na aba Jogar', () => {
  assert.equal(formatarTempo(0), '0:00');
  assert.equal(formatarTempo(65.4), '1:05');
  assert.equal(formatarTempo(0.2, true), '0:01');
  assert.equal(textoContagemModo(null), null, 'sem conexão: o "—" do menu');
  assert.equal(textoContagemModo({ fila: 0, escolhendo: 0, jogando: 0 }), '0 na fila');
  assert.equal(textoContagemModo({ fila: 2, escolhendo: 6, jogando: 3 }), '2 na fila · 6 escolhendo · 3 jogando');
  assert.equal(SELECAO_S, 60, 'o menu desenha a barra com o mesmo contador do servidor');
});

test('fila no cliente: as vagas da Seleção, procurando e na sala', () => {
  // O grupo da fila já aparece: o companheiro com a nave, ainda sem Pronto.
  const grupo = aplicarMsgFila(null, { t: 'fila', estado: 'procurando', modo: 'publica', n: 2, precisa: 3, espera: 0, voce: { time: 0 }, times: [[{ nome: 'Mateus', pronto: 0, race: 'bellico', classe: 'assault' }, { nome: 'Tereza', pronto: 0, race: 'acron', classe: 'assault', voce: 1 }], []] }, 0);
  const vg = vagasDaFila(grupo, 'publica');
  assert.deepEqual(vg.meu.map((x) => [x.tipo, x.nome]), [['voce', 'Tereza'], ['piloto', 'Mateus'], ['procurando', undefined]]);
  assert.deepEqual(vg.inimigo.map((x) => x.tipo), ['ia', 'ia', 'ia']);
  const comAviso = aplicarMsgFila(null, { t: 'fila', estado: 'procurando', modo: 'publica', n: 1, precisa: 3, aviso: 'sala_saiu' }, 0);
  assert.equal(aplicarMsgFila(comAviso, { t: 'fila', estado: 'procurando', modo: 'publica', n: 2, precisa: 3 }, 0).aviso, 'sala_saiu', 'o aviso fica enquanto procura');
  const procurando = vagasDaFila({ fase: 'procurando' }, 'publica');
  assert.deepEqual(procurando.meu.map((v) => v.tipo), ['voce', 'procurando', 'procurando']);
  assert.deepEqual(procurando.inimigo.map((v) => v.tipo), ['ia', 'ia', 'ia']);
  // 3 contra 3: a esquerda é o time verde e a direita o vermelho, com você no seu.
  const v = vagasDaFila(aplicarMsgFila(null, sala(), 0), 'online');
  assert.deepEqual(v.inimigo.map((x) => x.tipo), ['piloto', 'voce', 'procurando'], 'você no vermelho, na ordem de chegada');
  assert.deepEqual([v.inimigo[0].nome, v.inimigo[0].race], ['B', 'bellico']);
  assert.deepEqual(v.meu.map((x) => x.tipo), ['oculto', 'oculto', 'oculto']);
  assert.equal(v.meu[0].pronto, true);
  assert.equal(v.meu[0].race, undefined, 'o outro time às cegas');
  // Procurando no 3 contra 3: a vaga livre do outro time troca de time; a do seu, procura.
  const fila = aplicarMsgFila(null, { t: 'fila', estado: 'procurando', modo: 'online', n: 2, precisa: 6, voce: { time: 0 }, times: [[{ nome: 'Eu', pronto: 0, race: 'acron', classe: 'assault', voce: 1 }], [{ nome: 'B', pronto: 0 }]] }, 0);
  const vf = vagasDaFila(fila, 'online');
  assert.deepEqual(vf.meu.map((x) => x.tipo), ['voce', 'procurando', 'procurando']);
  assert.deepEqual(vf.inimigo.map((x) => x.tipo), ['oculto', 'trocar', 'trocar']);
  assert.deepEqual(titulosDosLados('online'), { meu: 'Time verde', inimigo: 'Time vermelho' });
  assert.deepEqual(titulosDosLados('publica'), { meu: 'Seu time', inimigo: 'Inimigo' });
});

test('fila no cliente: no 3 contra 3, com um em cada time o Pronto acende procurando e trava o time', () => {
  const msg = (extra = {}) => ({ t: 'fila', estado: 'procurando', modo: 'online', n: 2, precisa: 6, espera: 0, voce: { time: 0, pronto: 0 }, times: [[{ nome: 'Eu', pronto: 0, race: 'acron', classe: 'assault', voce: 1 }], [{ nome: 'B', pronto: 0 }]], ...extra });
  const sem = aplicarMsgFila(null, msg(), 0);
  assert.deepEqual(botaoDaFila(sem), { texto: 'Aguardando…', habilitado: false, acao: null }, 'sem o cedo do servidor, espera');
  const cedo = aplicarMsgFila(null, msg({ cedo: 1 }), 0);
  assert.deepEqual(botaoDaFila(cedo), { texto: 'Pronto', habilitado: true, acao: 'pronto' });
  assert.match(linhaDaFila(cedo, 0, 60).texto, /2 de 6 pilotos · aperte Pronto para começar já · 0 de 2 prontos/);
  const pronto = aplicarMsgFila(cedo, msg({ cedo: 1, voce: { time: 0, pronto: 1 }, times: [[{ nome: 'Eu', pronto: 1, voce: 1 }], [{ nome: 'B', pronto: 0 }]] }), 0);
  assert.deepEqual(botaoDaFila(pronto), { texto: 'Aguardando…', habilitado: false, acao: null });
  assert.match(linhaDaFila(pronto, 0, 60).texto, /Nave travada · 1 de 2 prontos/);
  assert.deepEqual(vagasDaFila(pronto, 'online').inimigo.map((x) => x.tipo), ['oculto', 'procurando', 'procurando'], 'pronto, não troca mais de time');
});

/** WebSocket de mentira: guarda o que se manda e deixa o teste falar pelo servidor. */
class WsFalso {
  static todos = [];
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.enviadas = [];
    WsFalso.todos.push(this);
  }
  abrir() {
    this.readyState = 1;
    this.onopen?.();
  }
  send(t) {
    this.enviadas.push(JSON.parse(t));
  }
  receber(m) {
    this.onmessage?.({ data: JSON.stringify(m) });
  }
  close() {
    this.readyState = 3;
  }
  cair() {
    this.readyState = 3;
    this.onclose?.();
  }
}

test('fila no cliente: a conexão observa a contagem, entra na fila e entra de novo quando cai', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  WsFalso.todos = [];
  const estados = [];
  const contagens = [];
  const fila = new ConexaoFila({ url: 'ws://x/ws', WebSocketImpl: WsFalso, aoEstado: (e) => estados.push(e), aoContagem: (c) => contagens.push(c), agora: () => 0 });
  fila.ligar();
  const ws = WsFalso.todos[0];
  ws.abrir();
  assert.deepEqual(ws.enviadas[0], { t: 'filas' });
  ws.receber({ t: 'filas', online: { fila: 1 }, publica: { fila: 0 } });
  assert.equal(contagens.at(-1).online.fila, 1);
  // O batimento mantém a conexão viva no proxy da hospedagem.
  t.mock.timers.tick(20000);
  assert.deepEqual(ws.enviadas.at(-1), { t: 'ping', c: 0 });
  ws.enviadas.pop();

  fila.entrar('online', { nome: 'Eu', race: 'acron', classe: 'assault' });
  assert.deepEqual(ws.enviadas.at(-1), { t: 'entrarFila', modo: 'online', nome: 'Eu', race: 'acron', classe: 'assault' });
  ws.receber({ t: 'fila', estado: 'procurando', modo: 'online', n: 2, precisa: 6, espera: 0 });
  assert.equal(fila.estado.fase, 'procurando');
  fila.escolher({ nome: 'Eu', race: 'shrewdo', classe: 'mobile' });
  assert.deepEqual(ws.enviadas.at(-1), { t: 'escolha', nome: 'Eu', race: 'shrewdo', classe: 'mobile' });
  fila.trocarTime();
  assert.deepEqual(ws.enviadas.at(-1), { t: 'trocarTime' });

  // Caiu: fica "conectando", com o aviso, e na volta entra de novo com a escolha de agora.
  ws.cair();
  assert.equal(contagens.at(-1), null);
  assert.deepEqual([fila.estado.fase, fila.estado.aviso], ['conectando', 'sem_conexao']);
  t.mock.timers.tick(1000);
  const ws2 = WsFalso.todos[1];
  assert.ok(ws2, 'tentou de novo');
  ws2.abrir();
  assert.deepEqual(ws2.enviadas, [{ t: 'filas' }, { t: 'entrarFila', modo: 'online', nome: 'Eu', race: 'shrewdo', classe: 'mobile' }]);

  // Sala, Pronto, começar: depois de começar não entra de novo sozinho.
  ws2.receber(sala());
  fila.pronto({ nome: 'Eu', race: 'shrewdo', classe: 'mobile' });
  assert.equal(ws2.enviadas.at(-1).t, 'pronto');
  ws2.receber({ t: 'fila', estado: 'comecar', modo: 'online', sala: 7, token: 'tk', time: 1 });
  assert.equal(estados.at(-1).fase, 'comecar');
  assert.equal(fila.quer, null);

  // Sair manda sairFila; desligar fecha sem tentar de novo.
  fila.entrar('publica', { nome: 'Eu', race: 'acron', classe: 'assault' });
  fila.sair();
  assert.deepEqual(ws2.enviadas.at(-1), { t: 'sairFila' });
  assert.equal(fila.estado.fase, 'fora');
  fila.desligar();
  const antes = ws2.enviadas.length;
  t.mock.timers.tick(20000);
  assert.equal(WsFalso.todos.length, 2);
  assert.equal(ws2.enviadas.length, antes, 'desligada, o batimento para');
});
