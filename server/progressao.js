// XP, nível e ouro do jogador na partida (DESIGN-PARTIDA.md, "Progressão do
// jogador"). Tudo em memória: começa no nível 1 a cada entrada.
//
// Quem dá XP e ouro: destruir monstros (Arnosh, Vorax, Krakor, o guardião do
// objetivo C), mineradores e escoltas do outro time, torretas do outro time (quem dá
// o último tiro; o resto do time ganha um pouco de ouro, em server/torretas.js) e
// jogadores inimigos; tomar um objetivo A ou B dá XP_OBJETIVO a quem tomou (no C,
// o XP é o do abate do guardião). Os valores por tipo ficam em RECOMPENSA.
//
// Curva: para passar do nível n para o n + 1 são xpParaNivel(n) pontos (60 no
// primeiro, +20 a cada nível). Numa partida de 10 minutos, caçando sem parar, dá
// para chegar perto do 15: o nível 5 sai com uns 12 Vorax, o 10 com uns 1300 XP e o
// 15 com uns 2700. NIVEL_MAX fecha a conta; lá a barra fica cheia.
//
// XP, nível e ouro são da partida: zeram quando começa a seguinte (World,
// #passoPartida).
//
// Subir de nível dá um ganho pequeno e automático: +HP_POR_NIVEL (3%) do HP máximo
// da raça por nível acima do 1 (nível 10 = +27%). O HP sobe junto com o máximo
// (não cura o resto). Os níveis 5, 10 e 15 são os marcos da Evolução paga
// (shared/evolucao.js, server/servicos.js), que lê `j.nivel`; o HP máximo do
// jogador junta nível, evoluções e armadura em hpMaxDoJogador.
//
// Combate entre jogadores (DESIGN-PARTIDA.md, "Combate"): morrer custa mais tempo
// conforme o nível e a partida avançam (tempoRenascer), para a briga do fim da
// partida pesar mais que a do começo e o mais forte não voltar na hora. Quem ajudou
// num abate de jogador (feriu a vítima nos últimos ASSISTENCIA_JANELA_S) ganha
// ASSISTENCIA_FRACAO do ouro e do XP do abate, cada um a parte cheia (não divide:
// no 3 contra 3 são no máximo dois ajudantes, e dividir puniria quem joga junto).
// Cada piloto conta os abates de jogador seguidos sem morrer (`sequencia`); quem
// derruba alguém com sequência de SEQUENCIA_MIN ou mais ganha bônus de ouro por
// encerrá-la (ouroEncerrar). Sequência e o registro de dano zeram ao morrer e na
// partida nova (novoCombate).

import { RACES } from '../shared/sim.js';
import { efeitosNave } from '../shared/evolucao.js';
import { armadura } from '../shared/loja.js';
import { MINERADOR } from './mineradores.js';

export const NIVEL_MAX = 20;
export const HP_POR_NIVEL = 0.03; // fração do HP da raça por nível acima do 1
export const XP_OBJETIVO = 60; // a quem toma um objetivo A ou B
/** XP e ouro por abate, pelo tipo do que morreu. */
export const RECOMPENSA = {
  arnosh: { xp: 20, ouro: 25 },
  vorax: { xp: 30, ouro: 30 },
  krakor: { xp: 120, ouro: 90 },
  guardiao: { xp: 250, ouro: 150 },
  minerador: { xp: 40, ouro: MINERADOR.ouro },
  escolta: { xp: 50, ouro: 45 },
  torreta: { xp: 80, ouro: 70 },
  jogador: { xp: 100, ouro: 50 },
};

// Renascimento do jogador (monstros têm o tempo deles em server/game.js).
export const RENASCER_BASE_S = 3; // no nível 1, no começo da partida
export const RENASCER_POR_NIVEL_S = 0.6; // a mais por nível acima do 1
export const RENASCER_PARTIDA_S = 3; // a mais no fim do cronômetro (cresce linear)
export const RENASCER_MAX_S = 15; // teto
// Assistência em abate de jogador.
export const ASSISTENCIA_JANELA_S = 10; // feriu a vítima até este tempo antes da morte
export const ASSISTENCIA_FRACAO = 0.5; // do ouro e do XP de RECOMPENSA.jogador, para cada ajudante
// Sequência de abates de jogador sem morrer.
export const SEQUENCIA_MIN = 2; // a partir daqui encerrar a sequência dá bônus
export const ENCERRAR_OURO_POR_ABATE = 25; // ouro por abate da sequência da vítima
export const ENCERRAR_OURO_MAX = 150; // teto do bônus

/**
 * Segundos até o jogador renascer: RENASCER_BASE_S + RENASCER_POR_NIVEL_S por
 * nível acima do 1 + até RENASCER_PARTIDA_S conforme `fracaoPartida` (0 a 1),
 * com teto RENASCER_MAX_S.
 */
export function tempoRenascer(nivel, fracaoPartida = 0) {
  const f = Math.min(1, Math.max(0, fracaoPartida));
  const t = RENASCER_BASE_S + RENASCER_POR_NIVEL_S * (Math.max(1, nivel) - 1) + RENASCER_PARTIDA_S * f;
  return Math.min(RENASCER_MAX_S, t);
}

/** Bônus de ouro por encerrar uma sequência de `seq` abates (0 abaixo de SEQUENCIA_MIN). */
export function ouroEncerrar(seq) {
  return seq >= SEQUENCIA_MIN ? Math.min(ENCERRAR_OURO_MAX, ENCERRAR_OURO_POR_ABATE * seq) : 0;
}

/** Ouro e XP de uma assistência em abate de jogador. */
export function recompensaAssistencia() {
  const r = RECOMPENSA.jogador;
  return { ouro: Math.round(r.ouro * ASSISTENCIA_FRACAO), xp: Math.round(r.xp * ASSISTENCIA_FRACAO) };
}

/**
 * Estado de combate de um jogador: sequência de abates e, por atacante (id), o
 * tick do último dano que levou dele (para a assistência). Zera ao morrer e na
 * partida nova.
 */
export function novoCombate() {
  return { sequencia: 0, danoPor: new Map() };
}

/** Campos de progressão de um jogador que acabou de entrar. */
export function novaProgressao() {
  return { nivel: 1, xp: 0 };
}

/** XP para passar do nível n para o n + 1 (0 no nível máximo). */
export function xpParaNivel(n) {
  return n >= NIVEL_MAX ? 0 : 60 + 20 * (n - 1);
}

/** HP máximo da nave da raça no nível. */
export function hpMaxDoNivel(race, nivel) {
  const base = RACES[race]?.hp ?? RACES.shrewdo.hp;
  return Math.round(base * (1 + HP_POR_NIVEL * (nivel - 1)));
}

/**
 * HP máximo da nave do jogador: o do nível, vezes as evoluções de casco
 * (shared/evolucao.js), mais o HP da armadura (shared/loja.js).
 */
export function hpMaxDoJogador(j) {
  const hp = Math.round(hpMaxDoNivel(j.ship.race, j.nivel) * efeitosNave(j.evolucoes).hp);
  return hp + (armadura(j.armadura)?.hp ?? 0);
}

/** Põe na nave (recém-criada) o HP máximo do nível, cheia. */
export function aplicarNivel(ship, nivel) {
  ship.maxHp = hpMaxDoNivel(ship.race, nivel);
  ship.hp = ship.maxHp;
}

/**
 * Dá `xp` ao jogador, subindo de nível quantas vezes der. Cada subida vira um
 * evento {e:'nivel', id, nivel} em `eventos`. Devolve quantos níveis subiu.
 */
export function ganharXp(j, xp, eventos) {
  let subiu = 0;
  j.xp += xp;
  while (j.nivel < NIVEL_MAX && j.xp >= xpParaNivel(j.nivel)) {
    j.xp -= xpParaNivel(j.nivel);
    j.nivel++;
    subiu++;
    const s = j.ship;
    const novo = hpMaxDoJogador(j); // com evoluções e armadura
    if (s.hp > 0) s.hp += novo - s.maxHp;
    s.maxHp = novo;
    eventos?.push({ e: 'nivel', id: j.id, nivel: j.nivel });
  }
  if (j.nivel >= NIVEL_MAX) j.xp = 0;
  return subiu;
}

/** Dá ao jogador o XP e o ouro do abate de algo do tipo `tipo`. */
export function recompensar(j, tipo, eventos) {
  const r = RECOMPENSA[tipo];
  if (!r) return 0;
  j.ouro += r.ouro;
  return ganharXp(j, r.xp, eventos);
}
