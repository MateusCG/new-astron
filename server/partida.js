// Partida do 3 contra 3 (DESIGN-PARTIDA.md): dois times de até três jogadores,
// cronômetro de 20 minutos e placar de minério. Vence quem tiver mais minério
// entregue pelos mineradores quando o tempo acaba (empate é possível).
//
// Ciclo: 'esperando' (servidor vazio) → 'preparacao' → 'andamento' → 'fim' (tela de
// resultado por INTERVALO_FIM_S) → 'preparacao' de novo, com placar zerado. O
// cronômetro só começa quando entra o primeiro jogador: com o servidor vazio não há
// partida rodando à toa, e quem chega não cai numa partida já pela metade sem
// ninguém. Se todo mundo sair, a partida volta a 'esperando' (o próximo começa do
// zero).
//
// Preparação (pedido do Mateus): toda partida abre com PREPARACAO_S (3 minutos) de
// contagem regressiva antes dos 20 minutos. É para explorar o mapa, comprar e se
// posicionar: nenhum minerador sai, a jungle não nasce, os objetivos esperam, as
// torretas ficam quietas e o ouro passivo não corre. Os 20 minutos (e o relógio dos
// objetivos, decorrido) só começam quando ela acaba: inicioTick já aponta para esse
// tick. Sem relógio (modo de teste) não há preparação.
//
// O tempo é contado em ticks do mundo (passo fixo), como todo o resto do servidor.
// Este módulo só guarda o estado e decide as viradas; quem reage a elas (tirar os
// mineradores, renascer os jogadores) é o World em server/game.js.
//
// Fase final: nos últimos FASE_FINAL_S da partida (a partir dos 17:00 de 20:00) o
// minério entregue vale MULT_FASE_FINAL vezes (em cima da carga que já vem com o
// bônus de mineração). É a virada: um time atrás no placar ainda pode buscar se
// proteger os mineradores no fim, e quem está na frente não pode relaxar. Só
// existe em partida mais longa que ela (as partidas curtinhas dos testes seriam
// "final" do começo ao fim). Partida nova volta à fase normal.
//
// Modo de teste (duracaoS = Infinity, mundo de teste em server/index.js): a partida
// nunca acaba nem entra na fase final; o snapshot avisa com semTempo.
//
// Relógio da partida (decorrido): os objetivos do mapa aparecem em tempos fixos da
// partida (buff de suporte aos 1:30, plataformas aos 2:00, Núcleo aos 8:00 e 5:00
// depois de cada morte; server/objetivos.js), contados de quando ela começou. decorrido() vale
// também no modo de teste (a partida não acaba, mas o relógio anda).

import { DT } from '../shared/sim.js';

export const DURACAO_PARTIDA_S = 1200; // 20 minutos
export const INTERVALO_FIM_S = 15; // tela de fim antes da próxima partida
export const MAX_POR_TIME = 3;
export const N_TIMES = 2;
export const FASE_FINAL_S = 180; // últimos 3 minutos: minério vale mais
export const MULT_FASE_FINAL = 2; // minério entregue na fase final vale o dobro
export const PREPARACAO_S = 180; // contagem antes dos 20 minutos: explorar e se preparar

// Computadores escolhidos na tela inicial (entrada {t:'entrar', iaMeu, iaInimigo}):
// no seu time cabem até 2 (você ocupa uma das 3 vagas), no outro até 3.
export const IA_MEU_MAX = MAX_POR_TIME - 1;
export const IA_INIMIGO_MAX = MAX_POR_TIME;

/**
 * Sanea o pedido de computadores da entrada (vem da rede): inteiro de 0 ao máximo
 * de cada lado; o que não é número (texto, null, NaN, ausente) vira 0.
 * @returns {{ iaMeu: number, iaInimigo: number }}
 */
export function computadoresDaEntrada(msg) {
  const limpa = (v, max) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(max, Math.floor(v))) : 0);
  return { iaMeu: limpa(msg?.iaMeu, IA_MEU_MAX), iaInimigo: limpa(msg?.iaInimigo, IA_INIMIGO_MAX) };
}

export class Partida {
  /** @param {{ duracaoS?: number, intervaloFimS?: number, faseFinalS?: number, preparacaoS?: number }} [opcoes] */
  constructor({ duracaoS = DURACAO_PARTIDA_S, intervaloFimS = INTERVALO_FIM_S, faseFinalS = FASE_FINAL_S, preparacaoS = PREPARACAO_S } = {}) {
    this.duracaoTicks = Math.round(duracaoS / DT);
    // Sem relógio, sem preparação (o modo de teste começa na hora).
    this.preparacaoTicks = Number.isFinite(this.duracaoTicks) ? Math.max(0, Math.round(preparacaoS / DT)) : 0;
    this.intervaloTicks = Math.round(intervaloFimS / DT);
    // Sem fase final se ela ocuparia a partida inteira (0 = desligada).
    const faseTicks = Math.round(faseFinalS / DT);
    this.faseFinalTicks = faseTicks < this.duracaoTicks ? faseTicks : 0;
    this.faseFinalAnunciada = false;
    this.numero = 0;
    this.estado = 'esperando';
    this.placar = [0, 0];
    this.vencedor = null; // time vencedor, -1 = empate, null = ainda jogando
    this.inicioTick = 0; // tick em que a partida começou (na preparação, em que vai começar)
    this.fimTick = 0; // tick em que o cronômetro zera
    this.novaTick = 0; // tick em que começa a próxima partida (no estado 'fim')
  }

  /**
   * Time para quem entra: o que tiver menos gente (empate vai para o time 0). Null
   * se os dois já têm MAX_POR_TIME (partida cheia). `tamanhos` = jogadores por time.
   */
  escolherTime(tamanhos) {
    let melhor = null;
    for (let t = 0; t < N_TIMES; t++) {
      if ((tamanhos[t] ?? 0) >= MAX_POR_TIME) continue;
      if (melhor === null || (tamanhos[t] ?? 0) < (tamanhos[melhor] ?? 0)) melhor = t;
    }
    return melhor;
  }

  /**
   * Abre uma partida nova agora (placar zerado): a preparação, ou o andamento direto
   * se ela for 0. Os 20 minutos contam de quando a preparação acaba.
   */
  comecar(tick) {
    this.numero++;
    this.estado = this.preparacaoTicks > 0 ? 'preparacao' : 'andamento';
    this.placar = [0, 0];
    this.vencedor = null;
    this.inicioTick = tick + this.preparacaoTicks;
    this.fimTick = this.inicioTick + this.duracaoTicks;
    this.novaTick = 0;
    this.faseFinalAnunciada = false;
  }

  get emAndamento() {
    return this.estado === 'andamento';
  }

  /** Na contagem antes dos 20 minutos (só as naves andam). */
  get emPreparacao() {
    return this.estado === 'preparacao';
  }

  /** Segundos que faltam para a preparação acabar (0 fora dela). */
  inicioEm(tick) {
    return this.emPreparacao ? Math.max(0, (this.inicioTick - tick) * DT) : 0;
  }

  /** Fase da partida no `tick`: 'final' nos últimos FASE_FINAL_S do andamento, senão 'normal'. */
  fase(tick) {
    return this.emAndamento && this.faseFinalTicks > 0 && this.fimTick - tick <= this.faseFinalTicks ? 'final' : 'normal';
  }

  /** Quanto vale cada unidade de minério entregue no `tick` (×2 na fase final). */
  multMinerio(tick) {
    return this.fase(tick) === 'final' ? MULT_FASE_FINAL : 1;
  }

  /**
   * Soma minério entregue ao placar do time (só com a partida em andamento), com o
   * multiplicador da fase. Devolve quanto entrou no placar (0 fora do andamento).
   */
  somar(time, carga, tick) {
    if (!this.emAndamento) return 0;
    const valor = carga * (tick === undefined ? 1 : this.multMinerio(tick));
    this.placar[time] += valor;
    return valor;
  }

  /**
   * Avança o relógio da partida. Devolve o que virou neste tick: 'preparacao' (entrou
   * o primeiro jogador ou acabou a tela de fim: partida nova na contagem), 'comecou'
   * (acabou a preparação, ou partida nova sem preparação), 'faseFinal' (entrou nos
   * últimos FASE_FINAL_S), 'fim' (tempo esgotado), 'vazia' (todo mundo saiu) ou null.
   */
  passo(tick, jogadores) {
    if (jogadores === 0) {
      if (this.estado === 'esperando') return null;
      this.estado = 'esperando';
      this.placar = [0, 0];
      this.vencedor = null;
      return 'vazia';
    }
    if (this.estado === 'esperando' || (this.estado === 'fim' && tick >= this.novaTick)) {
      this.comecar(tick);
      return this.emPreparacao ? 'preparacao' : 'comecou';
    }
    if (this.emPreparacao) {
      if (tick < this.inicioTick) return null;
      this.estado = 'andamento';
      return 'comecou';
    }
    if (this.estado === 'andamento' && tick >= this.fimTick) {
      this.estado = 'fim';
      const [a, b] = this.placar;
      this.vencedor = a > b ? 0 : b > a ? 1 : -1;
      this.novaTick = tick + this.intervaloTicks;
      return 'fim';
    }
    if (!this.faseFinalAnunciada && this.fase(tick) === 'final') {
      this.faseFinalAnunciada = true;
      return 'faseFinal';
    }
    return null;
  }

  /**
   * Quanto da partida já passou, de 0 (começo) a 1 (fim do cronômetro); 0 fora
   * do andamento. O renascimento dos jogadores cresce com isto (server/progressao.js).
   */
  fracaoDecorrida(tick) {
    if (!this.emAndamento || this.semTempo) return 0;
    return Math.min(1, Math.max(0, 1 - (this.fimTick - tick) / this.duracaoTicks));
  }

  /**
   * Segundos de partida já decorridos no `tick` (o relógio dos objetivos); 0 fora do
   * andamento. Anda também no modo de teste.
   */
  decorrido(tick) {
    return this.emAndamento ? Math.max(0, (tick - this.inicioTick) * DT) : 0;
  }

  /** Partida sem relógio (modo de teste): nunca acaba. */
  get semTempo() {
    return !Number.isFinite(this.duracaoTicks);
  }

  /** Segundos que faltam na partida (0 fora do andamento; a duração inteira na preparação). */
  restante(tick) {
    if (this.emPreparacao) return this.duracaoTicks * DT;
    return this.emAndamento ? Math.max(0, (this.fimTick - tick) * DT) : 0;
  }

  /**
   * Estado para o snapshot: `{ n, estado, fase, restante, inicioEm, semTempo, placar, vencedor, novaEm }`
   * (fase 'normal' ou 'final'; inicioEm = s até acabar a preparação; tempos em
   * segundos inteiros, arredondados para cima).
   */
  paraSnapshot(tick) {
    return {
      n: this.numero,
      estado: this.estado,
      fase: this.fase(tick),
      restante: this.semTempo ? 0 : Math.ceil(this.restante(tick) - 1e-9),
      inicioEm: Math.max(0, Math.ceil(this.inicioEm(tick) - 1e-9)),
      semTempo: this.semTempo,
      placar: [...this.placar],
      vencedor: this.vencedor,
      novaEm: this.estado === 'fim' ? Math.max(0, Math.ceil((this.novaTick - tick) * DT - 1e-9)) : 0,
    };
  }
}
