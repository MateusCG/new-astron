// Bônus por tempo de cada time (DESIGN-PARTIDA.md, "Objetivos").
//
// Quem ATIVA um bônus é quem cuida dos objetivos (tomar o A dá 'mineracao', destruir
// a torre do B dá 'velocidade', o C dá 'durabilidade' e 'furia'); quem LÊ são os
// mineradores (server/mineradores.js, em atributos()) e, no caso da 'furia', o dano
// das naves dos jogadores (World.multDanoDe em server/game.js). Este arquivo é só o
// contrato entre eles: guarda, por time e por nome, até que tick o bônus vale.
//
// O tempo é contado em ticks do mundo (passo fixo DT), não em relógio: o servidor
// pode atrasar um pouco e o bônus dura exatamente o mesmo número de passos de jogo.
// Ativar de novo um bônus que ainda vale renova a duração (fica com o fim mais
// longe), sem somar efeito: dois "+1 de minério" ao mesmo tempo continuam +1.

import { DT } from '../shared/sim.js';

/**
 * Bônus conhecidos e o efeito de cada um no time:
 * - mineracao: cada viagem dos mineradores carrega `cargaExtra` a mais (objetivo A);
 * - velocidade: velocidade dos mineradores multiplicada por `mult` (objetivo B);
 * - durabilidade: HP máximo dos mineradores multiplicado por `mult` (objetivo C);
 * - furia: dano causado pelas naves dos jogadores multiplicado por `mult` (objetivo
 *   C também: matar o guardião fortalece quem foi lá brigar). Dano é só do
 *   servidor, então a predição do cliente não muda.
 */
export const BONUS = {
  mineracao: { cargaExtra: 1 },
  velocidade: { mult: 1.4 },
  durabilidade: { mult: 1.5 },
  furia: { mult: 1.2 },
};

export class Bonus {
  constructor() {
    // ate[time][nome] = tick em que o bônus deixa de valer.
    this.ate = [{}, {}];
  }

  #conferir(time, nome) {
    if (!BONUS[nome]) throw new Error(`bônus desconhecido: ${nome}`);
    if (!this.ate[time]) throw new Error(`time inválido: ${time}`);
  }

  /** Liga o bônus `nome` para o `time` por `segundos`, a partir do `tick` atual. */
  ativar(time, nome, segundos, tick) {
    this.#conferir(time, nome);
    const fim = tick + Math.round(segundos / DT);
    this.ate[time][nome] = Math.max(this.ate[time][nome] ?? 0, fim);
  }

  /** O bônus vale no `tick`? */
  ativo(time, nome, tick) {
    return (this.ate[time]?.[nome] ?? 0) > tick;
  }

  /** Segundos que ainda faltam (0 se não está ativo). */
  restante(time, nome, tick) {
    return Math.max(0, ((this.ate[time]?.[nome] ?? 0) - tick) * DT);
  }

  /**
   * Bônus ativos de cada time, em segundos inteiros que faltam (arredondado para
   * cima, para o HUD não mostrar 0 com o bônus ainda valendo). Vai no snapshot:
   * `{ 0: { mineracao: 42 }, 1: {} }`.
   */
  paraSnapshot(tick) {
    const r = {};
    for (const [time, fins] of this.ate.entries()) {
      r[time] = {};
      for (const nome of Object.keys(fins)) {
        if (this.ativo(time, nome, tick)) r[time][nome] = Math.ceil(this.restante(time, nome, tick) - 1e-9);
      }
    }
    return r;
  }

  /** Desliga tudo (nova partida). */
  limpar() {
    this.ate = [{}, {}];
  }
}
