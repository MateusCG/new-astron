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
  // Mapa novo (Stage 6): golpe final na Ancient Medusa (server/jungle.js). Esqueleto
  // mínimo da frente Jungle: o efeito (+15% de dano e de velocidade das naves do
  // time) é da frente Objetivos, dona deste arquivo.
  medusa: { dano: 1.15, vel: 1.15 },
};

/**
 * Bônus de NAVE (individuais, de quem deu o golpe final): 'ataque' (SN-4 do buff de
 * ataque), 'suporte' (torre do buff de suporte), 'sonda' (sonda errante). Esqueleto
 * mínimo da frente Jungle (só guarda o tempo); os efeitos são da frente Objetivos.
 */
export const BONUS_NAVE = {
  ataque: { dano: 1.2 },
  suporte: { hpFrac: 0.02, en: 4 },
  sonda: { vel: 1.25 },
};

export class Bonus {
  /** @param {{ evento?: (ev: object) => void }} [ctx] evento: recebe o {e:'bonusNave', id, nome, s} de cada ativarNave. */
  constructor({ evento } = {}) {
    this.evento = evento;
    // ate[time][nome] = tick em que o bônus deixa de valer.
    this.ate = [{}, {}];
    // nave: id do jogador → { nome: tick em que deixa de valer }.
    this.nave = new Map();
  }

  /** Liga o bônus de nave `nome` para o jogador `id` por `segundos` (renova, não soma). */
  ativarNave(id, nome, segundos, tick) {
    if (!BONUS_NAVE[nome]) throw new Error(`bônus de nave desconhecido: ${nome}`);
    const fins = this.nave.get(id) ?? {};
    fins[nome] = Math.max(fins[nome] ?? 0, tick + Math.round(segundos / DT));
    this.nave.set(id, fins);
    this.evento?.({ e: 'bonusNave', id, nome, s: segundos });
  }

  /** O bônus de nave vale para o jogador `id` no `tick`? */
  ativoNave(id, nome, tick) {
    return (this.nave.get(id)?.[nome] ?? 0) > tick;
  }

  /** Segundos que ainda faltam do bônus de nave (0 se não está ativo). */
  restanteNave(id, nome, tick) {
    return Math.max(0, ((this.nave.get(id)?.[nome] ?? 0) - tick) * DT);
  }

  /** Bônus de nave ativos do jogador, em segundos inteiros: `{ ataque: 42 }`. */
  paraNave(id, tick) {
    const r = {};
    for (const [nome, fim] of Object.entries(this.nave.get(id) ?? {})) if (fim > tick) r[nome] = Math.ceil(Math.max(0, (fim - tick) * DT) - 1e-9);
    return r;
  }

  /** Tira todos os bônus de nave do jogador (morte ou saída). */
  limparNave(id) {
    this.nave.delete(id);
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
    this.nave.clear();
  }
}
