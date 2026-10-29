// Bônus por tempo (DESIGN-PARTIDA.md; mapa do Stage 6), só no servidor.
//
// Dois tipos, com o mesmo relógio:
// - de NAVE (individual): quem dá o golpe final num objetivo da jungle ganha o bônus
//   só para si. 'ataque' (monstro do buff de ataque, server/jungle.js), 'suporte'
//   (torre do buff de suporte, server/objetivos.js) e 'sonda' (sonda errante,
//   server/jungle.js). Morrer limpa os bônus de nave (como buff de MOBA): quem
//   renasce volta sem nada. Sair da partida também.
// - de TIME: valem para todas as naves dos jogadores do time. 'medusa' (Ancient
//   Medusa, server/jungle.js).
//
// Quem ATIVA são os módulos dos objetivos (ativar/ativarNave); quem APLICA o efeito
// é o World (server/game.js), lendo daqui com multDano/multVelocidade/regenNave:
// - dano causado: multDanoDe (só o servidor calcula dano; a predição não muda);
// - velocidade: o World põe na nave (s.velMult) a velocidade do status × o bônus a
//   cada tick, antes dos comandos; s.velMult vai no `me` e o stepShip da predição lê
//   o mesmo número, então a predição acompanha;
// - regeneração do suporte: a energia entra em s.regenEn (vai no `me`, o stepShip lê)
//   e o HP é do servidor (World#regen).
// A 'sonda' fica SUSPENSA nos SONDA_COMBATE_S depois de a nave causar ou levar dano:
// serve para se deslocar (contornar a mineradora, chegar antes aos objetivos), não
// para perseguir nem fugir no meio da briga. O tempo dela continua correndo.
//
// O tempo é contado em ticks do mundo (passo fixo DT), não em relógio: o servidor
// pode atrasar um pouco e o bônus dura exatamente o mesmo número de passos de jogo.
// Ativar de novo um bônus que ainda vale renova a duração (fica com o fim mais
// longe), sem somar efeito.

import { DT } from '../shared/sim.js';

/**
 * Bônus de nave (individuais): efeito e duração padrão (`s`).
 * - ataque: dano causado × `dano` (+20%);
 * - suporte: +`hpFrac` do HP máximo por s e +`en` de energia por s;
 * - sonda: velocidade máxima × `vel` (+25%), suspensa em combate.
 */
export const BONUS_NAVE = {
  ataque: { dano: 1.2, s: 90 },
  suporte: { hpFrac: 0.02, en: 13, s: 90 },
  sonda: { vel: 1.25, s: 40 },
};
/** Bônus de time: medusa = dano × `dano` e velocidade × `vel` das naves do time. */
export const BONUS = {
  medusa: { dano: 1.15, vel: 1.15, s: 120 },
};
/** s depois de causar ou levar dano em que a 'sonda' fica suspensa. */
export const SONDA_COMBATE_S = 3;
const SONDA_COMBATE_TICKS = Math.round(SONDA_COMBATE_S / DT);

/** Segundos inteiros que faltam, para cima (o HUD não mostra 0 com o bônus valendo). */
const segundos = (fim, tick) => Math.ceil(Math.max(0, (fim - tick) * DT) - 1e-9);

export class Bonus {
  /**
   * @param {{ evento?: (ev: object) => void }} [ctx] evento: recebe o
   *   {e:'bonusNave', id, nome, s} de cada ativarNave (o World põe na lista de eventos).
   */
  constructor({ evento } = {}) {
    this.evento = evento;
    // ate[time][nome] = tick em que o bônus de time deixa de valer.
    this.ate = [{}, {}];
    // nave: id do jogador → { nome: tick em que deixa de valer }.
    this.nave = new Map();
  }

  #conferir(time, nome) {
    if (!BONUS[nome]) throw new Error(`bônus desconhecido: ${nome}`);
    if (!this.ate[time]) throw new Error(`time inválido: ${time}`);
  }

  // ---------- Time ----------

  /** Liga o bônus de time `nome` para o `time` por `segundos`, a partir do `tick` atual. */
  ativar(time, nome, segundos, tick) {
    this.#conferir(time, nome);
    const fim = tick + Math.round(segundos / DT);
    this.ate[time][nome] = Math.max(this.ate[time][nome] ?? 0, fim);
  }

  /** O bônus de time vale no `tick`? */
  ativo(time, nome, tick) {
    return (this.ate[time]?.[nome] ?? 0) > tick;
  }

  /** Segundos que ainda faltam (0 se não está ativo). */
  restante(time, nome, tick) {
    return Math.max(0, ((this.ate[time]?.[nome] ?? 0) - tick) * DT);
  }

  /**
   * Bônus de time ativos, em segundos inteiros que faltam. Vai no snapshot:
   * `{ 0: { medusa: 42 }, 1: {} }`.
   */
  paraSnapshot(tick) {
    const r = {};
    for (const [time, fins] of this.ate.entries()) {
      r[time] = {};
      for (const [nome, fim] of Object.entries(fins)) if (fim > tick) r[time][nome] = segundos(fim, tick);
    }
    return r;
  }

  // ---------- Nave ----------

  /** Liga o bônus de nave `nome` para o jogador `id` por `segundos` (evento 'bonusNave'). */
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

  /** Bônus de nave ativos do jogador, em segundos inteiros: `{ ataque: 42 }` (vai no `me`). */
  paraNave(id, tick) {
    const r = {};
    for (const [nome, fim] of Object.entries(this.nave.get(id) ?? {})) if (fim > tick) r[nome] = segundos(fim, tick);
    return r;
  }

  /** Tira todos os bônus de nave do jogador (morte ou saída). */
  limparNave(id) {
    this.nave.delete(id);
  }

  // ---------- Efeitos (o World aplica) ----------

  /** A 'sonda' está suspensa para o jogador `j` (causou ou levou dano há pouco)? */
  emCombate(j, tick) {
    const ultimo = Math.max(j.levouDanoTick ?? -Infinity, j.causouDanoTick ?? -Infinity);
    return tick - ultimo < SONDA_COMBATE_TICKS;
  }

  /** Multiplicador do dano causado pelo jogador `j` (ataque e medusa). */
  multDano(j, tick) {
    let m = 1;
    if (this.ativoNave(j.id, 'ataque', tick)) m *= BONUS_NAVE.ataque.dano;
    if (this.ativo(j.time, 'medusa', tick)) m *= BONUS.medusa.dano;
    return m;
  }

  /** Multiplicador da velocidade máxima da nave do jogador `j` (sonda fora de combate e medusa). */
  multVelocidade(j, tick) {
    let m = 1;
    if (this.ativoNave(j.id, 'sonda', tick) && !this.emCombate(j, tick)) m *= BONUS_NAVE.sonda.vel;
    if (this.ativo(j.time, 'medusa', tick)) m *= BONUS.medusa.vel;
    return m;
  }

  /** Regeneração extra do suporte: { hpFrac (do HP máximo por s), en (por s) }, zeros sem ele. */
  regenNave(j, tick) {
    if (!this.ativoNave(j.id, 'suporte', tick)) return { hpFrac: 0, en: 0 };
    return { hpFrac: BONUS_NAVE.suporte.hpFrac, en: BONUS_NAVE.suporte.en };
  }

  /** Desliga tudo, de time e de nave (nova partida). */
  limpar() {
    this.ate = [{}, {}];
    this.nave.clear();
  }
}
