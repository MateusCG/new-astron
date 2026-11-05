// As partidas do servidor (cada uma um World) atrás de uma interface só, para o
// server/index.js não saber onde elas rodam:
//
//   - MundoLocal: o World na mesma linha de execução do processo (o mundo principal,
//     os testes, e o próprio worker por dentro).
//   - MundoEmWorker: o World numa worker thread só dele (server/mundo-worker.js), com
//     o próprio laço de 30 Hz. É o que o servidor de verdade usa para o Sandbox, a
//     Partida Privada e as salas das filas online (pedido do Mateus: o Railway dá 8
//     vCPU e um processo Node usa um só). Assim uma partida pesada não atrasa o passo
//     nem o ping das outras, e o processo principal fica só com as conexões, as filas
//     e o pong.
//
// Os dois falam igual: entrar (promessa com {id, time} ou {codigo}), comando (o
// {t:'in'}), pedido (Loja, Evolução, teleporte, teste: a resposta volta pelas
// mensagens), sair, vagaParaBot e fechar; o que sai para os jogadores (snapshots e
// respostas, já em texto) chega por aoMensagens([[id do jogador, texto], ...]).
//
// Folga (temFolga): em vez de um número fixo de salas, o servidor só abre partida
// nova se a soma das cargas (a fração de um núcleo que cada partida ocupa, medida no
// laço dela; CARGA_MINIMA enquanto ainda não mediu, porque a partida pesa mais no
// fim) cabe em FOLGA_CPU dos núcleos que sobram depois do processo principal, e se
// a memória tem espaço para mais uma (MB_POR_MUNDO) abaixo de FOLGA_MEMORIA.
// Núcleos e memória vêm do contêiner (cgroup: o que o Railway reserva), ou de
// NUCLEOS e MEMORIA_MB no ambiente.

import { Worker } from 'node:worker_threads';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import { TICK_HZ } from './game.js';

export const FOLGA_CPU = 0.7; // até 70% dos núcleos das partidas ocupados
export const CARGA_MINIMA = 0.15; // fração de núcleo de uma partida que ainda não mediu (a do fim de partida no vCPU do Railway, com folga)
export const FOLGA_MEMORIA = 0.75;
export const MB_POR_MUNDO = 80; // memória de uma partida em worker, com folga (medida: ~37 MB por partida com 6 naves)
const JANELA_CARGA_MS = 1000;

const PEDIDOS_SERVICO = new Set(['comprar', 'evoluir', 'melhorar', 'reconstruir', 'usar', 'pontos', 'equipar', 'vender', 'evoluirItem']); // server/servicos.js

/** A resposta do World a um pedido do jogador (Loja, Evolução, teleporte, teste). */
export function responderPedido(world, id, msg) {
  if (PEDIDOS_SERVICO.has(msg?.t)) return world.pedido(id, msg);
  if (msg?.t === 'teleportar') return world.pedidoTeleporte(id, msg);
  if (msg?.t === 'teste') return world.pedidoTeste(id, msg);
  return null;
}

/** Tipos de mensagem do jogador que viram pedido ao mundo. */
export const PEDIDOS_MUNDO = new Set([...PEDIDOS_SERVICO, 'teleportar', 'teste']);

/**
 * Laço de passo fixo com acumulador (setInterval atrasa às vezes, e o mundo não
 * pode andar mais devagar por isso). `passo()` roda TICK_HZ vezes por segundo.
 * Devolve a função que para.
 */
export function iniciarLaco(passo) {
  const passoMs = 1000 / TICK_HZ;
  let ultimo = performance.now();
  let acumulado = 0;
  const id = setInterval(() => {
    const agora = performance.now();
    acumulado = Math.min(acumulado + agora - ultimo, passoMs * 10);
    ultimo = agora;
    while (acumulado >= passoMs) {
      acumulado -= passoMs;
      passo();
    }
  }, passoMs / 2);
  return () => clearInterval(id);
}

/** O World nesta linha de execução. */
export class MundoLocal {
  /** @param {import('./game.js').World} world @param {{ modo?: string|null, sala?: number|null }} [op] */
  constructor(world, { modo = null, sala = null } = {}) {
    this.world = world;
    this.modo = modo;
    this.sala = sala;
    this.teste = !!world.teste;
    this.humanos = new Set(); // ids dos jogadores de gente (os que recebem snapshot)
    this.aoMensagens = () => {};
    this.carga = 0;
    this.ocupadoMs = 0;
    this.janela = performance.now();
  }

  /** {nome, race, classe, pedido} → {id, time} ou {codigo: 'partida_cheia'}. */
  entrar({ nome, race, classe, pedido }) {
    const j = this.world.addPlayer(nome, race, classe, pedido ?? {});
    if (!j) return Promise.resolve({ codigo: 'partida_cheia' });
    this.humanos.add(j.id);
    return Promise.resolve({ id: j.id, time: j.time });
  }

  comando(id, msg) {
    this.world.pushInput(id, msg);
  }

  pedido(id, msg) {
    const r = responderPedido(this.world, id, msg);
    if (r) this.aoMensagens([[id, JSON.stringify(r)]]);
  }

  /**
   * O jogador saiu. `substituir`: numa partida online que não acabou, um computador
   * fica com a vaga, para o time não jogar com um a menos (sem gente, ninguém).
   */
  sair(id, { substituir = false } = {}) {
    const j = this.world.players.get(id);
    this.humanos.delete(id);
    if (!j) return;
    this.world.removePlayer(id);
    if (substituir && this.humanos.size > 0 && this.world.partida.estado !== 'fim') this.world.adicionarBot(j.time);
  }

  /** A vaga reservada de quem não chegou fica com um computador (se há gente jogando). */
  vagaParaBot(time) {
    if (this.humanos.size > 0) this.world.adicionarBot(time);
  }

  /** Um passo do mundo e, no tick de snapshot, o de cada jogador de gente. */
  passo() {
    const t0 = performance.now();
    const w = this.world;
    w.step();
    if (w.ehTickDeSnapshot()) {
      const ents = w.entidades();
      const ev = w.tirarEventos();
      const lista = [];
      for (const id of this.humanos) {
        const j = w.players.get(id);
        if (j) lista.push([id, JSON.stringify(w.snapshotPara(j, ents, ev))]);
      }
      if (lista.length) this.aoMensagens(lista);
    }
    const t1 = performance.now();
    this.ocupadoMs += t1 - t0;
    if (t1 - this.janela >= JANELA_CARGA_MS) {
      this.carga = this.ocupadoMs / (t1 - this.janela);
      this.ocupadoMs = 0;
      this.janela = t1;
    }
  }

  fechar() {}
}

/** O World numa worker thread (server/mundo-worker.js), com o laço dele. */
export class MundoEmWorker {
  /**
   * @param {{ modo: string, sala?: number|null, teste?: boolean }} op
   * `aoFalhar(erro)`: o worker caiu (o servidor fecha as conexões dele).
   */
  constructor({ modo, sala = null, teste = false }) {
    this.modo = modo;
    this.sala = sala;
    this.teste = teste;
    this.aoMensagens = () => {};
    this.aoFalhar = () => {};
    this.carga = 0;
    this.memoriaMb = 0;
    this.pendentes = new Map();
    this.req = 0;
    this.vivo = true;
    this.worker = new Worker(new URL('./mundo-worker.js', import.meta.url), { workerData: { modo, teste } });
    this.worker.on('message', (m) => {
      if (m.t === 'msgs') this.aoMensagens(m.lista);
      else if (m.t === 'entrou' || m.t === 'recusado') {
        const ok = this.pendentes.get(m.req);
        this.pendentes.delete(m.req);
        ok?.(m.t === 'entrou' ? { id: m.id, time: m.time } : { codigo: m.codigo });
      } else if (m.t === 'carga') {
        this.carga = m.v;
        this.memoriaMb = m.mb;
      }
    });
    const caiu = (erro) => {
      if (!this.vivo) return;
      this.vivo = false;
      for (const ok of this.pendentes.values()) ok({ codigo: 'erro_servidor' });
      this.pendentes.clear();
      this.aoFalhar(erro);
    };
    this.worker.on('error', (e) => {
      console.error(`Partida ${modo} caiu:`, e);
      caiu(e);
    });
    this.worker.on('exit', (codigo) => caiu(new Error(`worker saiu (${codigo})`)));
  }

  #enviar(m) {
    if (this.vivo) this.worker.postMessage(m);
  }

  entrar({ nome, race, classe, pedido }) {
    if (!this.vivo) return Promise.resolve({ codigo: 'erro_servidor' });
    return new Promise((ok) => {
      const req = ++this.req;
      this.pendentes.set(req, ok);
      this.#enviar({ t: 'entrar', req, nome, race, classe, pedido: pedido ?? {} });
    });
  }

  comando(id, msg) {
    this.#enviar({ t: 'in', id, msg });
  }

  pedido(id, msg) {
    this.#enviar({ t: 'pedido', id, msg });
  }

  sair(id, { substituir = false } = {}) {
    this.#enviar({ t: 'sair', id, substituir });
  }

  vagaParaBot(time) {
    this.#enviar({ t: 'bot', time });
  }

  passo() {} // o worker anda sozinho

  fechar() {
    this.vivo = false;
    this.worker.removeAllListeners('exit');
    this.worker.terminate();
  }
}

/** Núcleos do contêiner: NUCLEOS, ou a cota do cgroup (cpu.max), ou os da máquina. */
export function nucleosDisponiveis() {
  const env = Number(process.env.NUCLEOS);
  if (env > 0) return env;
  try {
    const [cota, periodo] = readFileSync('/sys/fs/cgroup/cpu.max', 'utf8').trim().split(/\s+/);
    if (cota !== 'max' && Number(cota) > 0 && Number(periodo) > 0) return Number(cota) / Number(periodo);
  } catch {}
  return os.availableParallelism?.() ?? os.cpus().length;
}

/** Memória do contêiner em MB: MEMORIA_MB, ou o limite do cgroup (memory.max), ou a da máquina. */
export function memoriaDisponivelMb() {
  const env = Number(process.env.MEMORIA_MB);
  if (env > 0) return env;
  try {
    const v = readFileSync('/sys/fs/cgroup/memory.max', 'utf8').trim();
    if (v !== 'max' && Number(v) > 0) return Number(v) / 2 ** 20;
  } catch {}
  return os.totalmem() / 2 ** 20;
}

/**
 * Cabe mais uma partida? `cargas` = a carga de cada partida rodando (fração de um
 * núcleo; as que ainda não mediram contam CARGA_MINIMA), `nucleos` e `memoriaMb` do
 * contêiner, `usadaMb` a memória do processo agora. O processo principal fica com um
 * núcleo (as conexões e as filas); com um núcleo só, as partidas dividem ele.
 */
export function temFolga({ cargas, nucleos, memoriaMb, usadaMb }) {
  const soma = cargas.reduce((s, c) => s + Math.max(c, CARGA_MINIMA), 0) + CARGA_MINIMA;
  const cpu = Math.max(1, nucleos - 1) * FOLGA_CPU;
  return soma <= cpu && usadaMb + MB_POR_MUNDO <= memoriaMb * FOLGA_MEMORIA;
}
