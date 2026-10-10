// Partida do 3 contra 3 (DESIGN-PARTIDA.md): dois times de até três jogadores,
// cronômetro de 10 minutos e placar de minério. Vence quem tiver mais minério
// entregue pelos mineradores quando o tempo acaba (empate é possível).
//
// Ciclo: 'esperando' (servidor vazio) → 'andamento' → 'fim' (tela de resultado por
// INTERVALO_FIM_S) → 'andamento' de novo, com placar zerado. O cronômetro só
// começa quando entra o primeiro jogador: com o servidor vazio não há partida
// rodando à toa, e quem chega não cai numa partida já pela metade sem ninguém. Se
// todo mundo sair, a partida volta a 'esperando' (o próximo começa do zero).
//
// O tempo é contado em ticks do mundo (passo fixo), como todo o resto do servidor.
// Este módulo só guarda o estado e decide as viradas; quem reage a elas (tirar os
// mineradores, renascer os jogadores) é o World em server/game.js.
//
// Fase final: nos últimos FASE_FINAL_S da partida (a partir dos 7:00 de 10:00) o
// minério entregue vale MULT_FASE_FINAL vezes (em cima da carga que já vem com o
// bônus de mineração). É a virada: um time atrás no placar ainda pode buscar se
// proteger os mineradores no fim, e quem está na frente não pode relaxar. Só
// existe em partida mais longa que ela (as partidas curtinhas dos testes seriam
// "final" do começo ao fim). Partida nova volta à fase normal.

import { DT } from '../shared/sim.js';

export const DURACAO_PARTIDA_S = 600; // 10 minutos
export const INTERVALO_FIM_S = 15; // tela de fim antes da próxima partida
export const MAX_POR_TIME = 3;
export const N_TIMES = 2;
export const FASE_FINAL_S = 180; // últimos 3 minutos: minério vale mais
export const MULT_FASE_FINAL = 2; // minério entregue na fase final vale o dobro

export class Partida {
  /** @param {{ duracaoS?: number, intervaloFimS?: number, faseFinalS?: number }} [opcoes] */
  constructor({ duracaoS = DURACAO_PARTIDA_S, intervaloFimS = INTERVALO_FIM_S, faseFinalS = FASE_FINAL_S } = {}) {
    this.duracaoTicks = Math.round(duracaoS / DT);
    this.intervaloTicks = Math.round(intervaloFimS / DT);
    // Sem fase final se ela ocuparia a partida inteira (0 = desligada).
    const faseTicks = Math.round(faseFinalS / DT);
    this.faseFinalTicks = faseTicks < this.duracaoTicks ? faseTicks : 0;
    this.faseFinalAnunciada = false;
    this.numero = 0;
    this.estado = 'esperando';
    this.placar = [0, 0];
    this.vencedor = null; // time vencedor, -1 = empate, null = ainda jogando
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

  /** Começa uma partida nova agora (placar zerado). */
  comecar(tick) {
    this.numero++;
    this.estado = 'andamento';
    this.placar = [0, 0];
    this.vencedor = null;
    this.fimTick = tick + this.duracaoTicks;
    this.novaTick = 0;
    this.faseFinalAnunciada = false;
  }

  get emAndamento() {
    return this.estado === 'andamento';
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
   * Avança o relógio da partida. Devolve o que virou neste tick: 'comecou' (entrou o
   * primeiro jogador ou acabou a tela de fim), 'faseFinal' (entrou nos últimos
   * FASE_FINAL_S), 'fim' (tempo esgotado), 'vazia' (todo mundo saiu) ou null.
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

  /** Segundos que faltam na partida (0 fora do andamento). */
  restante(tick) {
    return this.emAndamento ? Math.max(0, (this.fimTick - tick) * DT) : 0;
  }

  /**
   * Estado para o snapshot: `{ n, estado, fase, restante, placar, vencedor, novaEm }`
   * (fase 'normal' ou 'final'; tempos em segundos inteiros, arredondados para cima).
   */
  paraSnapshot(tick) {
    return {
      n: this.numero,
      estado: this.estado,
      fase: this.fase(tick),
      restante: Math.ceil(this.restante(tick) - 1e-9),
      placar: [...this.placar],
      vencedor: this.vencedor,
      novaEm: this.estado === 'fim' ? Math.max(0, Math.ceil((this.novaTick - tick) * DT - 1e-9)) : 0,
    };
  }
}
