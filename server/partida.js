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

import { DT } from '../shared/sim.js';

export const DURACAO_PARTIDA_S = 600; // 10 minutos
export const INTERVALO_FIM_S = 15; // tela de fim antes da próxima partida
export const MAX_POR_TIME = 3;
export const N_TIMES = 2;

export class Partida {
  /** @param {{ duracaoS?: number, intervaloFimS?: number }} [opcoes] */
  constructor({ duracaoS = DURACAO_PARTIDA_S, intervaloFimS = INTERVALO_FIM_S } = {}) {
    this.duracaoTicks = Math.round(duracaoS / DT);
    this.intervaloTicks = Math.round(intervaloFimS / DT);
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
  }

  get emAndamento() {
    return this.estado === 'andamento';
  }

  /** Soma minério entregue ao placar do time (só com a partida em andamento). */
  somar(time, carga) {
    if (this.emAndamento) this.placar[time] += carga;
  }

  /**
   * Avança o relógio da partida. Devolve o que virou neste tick: 'comecou' (entrou o
   * primeiro jogador ou acabou a tela de fim), 'fim' (tempo esgotado), 'vazia' (todo
   * mundo saiu) ou null.
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
    return null;
  }

  /**
   * Quanto da partida já passou, de 0 (começo) a 1 (fim do cronômetro); 0 fora
   * do andamento. O renascimento dos jogadores cresce com isto (server/progressao.js).
   */
  fracaoDecorrida(tick) {
    if (!this.emAndamento) return 0;
    return Math.min(1, Math.max(0, 1 - (this.fimTick - tick) / this.duracaoTicks));
  }

  /** Segundos que faltam na partida (0 fora do andamento). */
  restante(tick) {
    return this.emAndamento ? Math.max(0, (this.fimTick - tick) * DT) : 0;
  }

  /**
   * Estado para o snapshot: `{ n, estado, restante, placar, vencedor, novaEm }`
   * (tempos em segundos inteiros, arredondados para cima).
   */
  paraSnapshot(tick) {
    return {
      n: this.numero,
      estado: this.estado,
      restante: Math.ceil(this.restante(tick) - 1e-9),
      placar: [...this.placar],
      vencedor: this.vencedor,
      novaEm: this.estado === 'fim' ? Math.max(0, Math.ceil((this.novaTick - tick) * DT - 1e-9)) : 0,
    };
  }
}
