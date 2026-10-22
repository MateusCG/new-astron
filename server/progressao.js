// XP, nível e ouro do jogador na partida (DESIGN-PARTIDA.md, "Progressão do
// jogador"). Tudo em memória: começa no nível 1 a cada entrada.
//
// Quem dá XP e ouro: destruir monstros da jungle (cada espécie de
// server/especies.js tem o seu XP e ouro; a Medusa paga cada piloto do time de quem
// a matou, em server/jungle.js), mineradores e escoltas do outro time, torretas do
// outro time (quem dá o último tiro; o resto do time ganha um pouco de ouro, em
// server/torretas.js) e jogadores inimigos. Os valores por tipo ficam em RECOMPENSA
// (o monstro entra pela espécie: chaveRecompensa).
//
// Curva: para passar do nível n para o n + 1 são xpParaNivel(n) pontos (60 no
// primeiro, +20 a cada nível). Numa partida de 20 minutos, um jungler dedicado tira
// uns 3000 a 3500 XP da jungle (PESQUISA-MONSTROS.md, "Ritmo"), perto do nível 15 a
// 18 com os abates. NIVEL_MAX (25, como pediu o Mateus) fecha a conta; lá a barra
// fica cheia.
//
// Ouro passivo (como no Dota 2 e no League of Legends): com a partida em andamento,
// cada jogador (gente e computador, vivo ou morto) ganha OURO_POR_SEGUNDO a cada
// segundo inteiro de partida (World.#ouroPassivo, contado pelo tick desde o começo,
// sem fração). Na espera e na tela de fim, nada; no modo de teste conta também. Numa
// partida de 20 minutos são 1200 de ouro por piloto só disso.
//
// XP, nível, pontos e ouro são da partida: zeram quando começa a seguinte (World,
// #passoPartida).
//
// Subir de nível dá um ganho pequeno e automático: +HP_POR_NIVEL (3%) do HP máximo
// da NAVE por nível acima do 1 (nível 10 = +27%). O HP sobe junto com o máximo
// (não cura o resto). Cada nível também dá PONTOS_POR_NIVEL pontos para o piloto
// distribuir (shared/status.js; o pedido {t:'pontos'} em server/servicos.js). A cada
// 5 níveis (5, 10, 15, 20) a Evolução paga libera a próxima nave da linha
// (shared/naves.js, server/servicos.js), que lê `j.nivel`.
//
// Status do piloto (statusDoJogador): os pontos e as instâncias de escudo, armadura e
// dos dois potenciadores que estão na nave (cada uma na sua versão) somados por
// statusDoPiloto (shared/status.js). O HP
// máximo do jogador junta a nave (raça, classe e tier), o nível e o hpExtra do
// status (armadura e potenciadores) em hpMaxDoJogador.
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
// partida nova (novoCombate), que também zera os abates de jogador (abatesJog).

import { NAVE_SEM_CLASSE } from '../shared/sim.js';
import { naveDe, CLASSE_PADRAO } from '../shared/naves.js';
import { pontosVazios, statusDoPiloto } from '../shared/status.js';
import { equipadosDoInv } from '../shared/loja.js';
import { MINERADOR } from './mineradores.js';
import { ESPECIES } from './especies.js';

export const NIVEL_MAX = 25;
export const HP_POR_NIVEL = 0.03; // fração do HP da nave por nível acima do 1
/** Ouro que cada jogador ganha por segundo de partida em andamento (ouro passivo). */
export const OURO_POR_SEGUNDO = 1;
export const XP_OBJETIVO = 60; // a quem toma um objetivo A ou B
/** XP e ouro por abate, pelo tipo do que morreu. */
export const RECOMPENSA = {
  // Monstros da jungle, pela espécie (a Medusa, `doTime`, fica de fora: paga o time inteiro).
  ...Object.fromEntries(
    Object.entries(ESPECIES)
      .filter(([, e]) => !e.doTime)
      .map(([esp, e]) => [esp, { xp: e.xp, ouro: e.ouro }]),
  ),
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
 * tick do último dano que levou dele (para a assistência), que zeram ao morrer e na
 * partida nova; e abatesJog, os abates de JOGADOR inimigo da partida (o `abates`
 * conta tudo, monstros e mineradores inclusive), que só zera na partida nova: é o
 * número do card do piloto na barra do time (public/js/companheiros.js).
 */
export function novoCombate() {
  return { sequencia: 0, danoPor: new Map(), abatesJog: 0 };
}

/** Campos de progressão de um jogador que acabou de entrar (ou da partida nova): nível, XP e pontos. */
export function novaProgressao() {
  return { nivel: 1, xp: 0, pontos: pontosVazios() };
}

/** XP para passar do nível n para o n + 1 (0 no nível máximo). */
export function xpParaNivel(n) {
  return n >= NIVEL_MAX ? 0 : 60 + 20 * (n - 1);
}

/**
 * A nave do catálogo (shared/naves.js) que o piloto voa: a raça da nave, a classe
 * escolhida na entrada (j.classe) e o tier comprado na Evolução (j.tier, da partida).
 */
export function naveDoJogador(j) {
  return naveDe(j.ship.race, j.classe ?? CLASSE_PADRAO, j.tier ?? 0);
}

/** HP máximo de uma nave de `hpBase` no nível. */
export function hpMaxDoNivel(hpBase, nivel) {
  return Math.round(hpBase * (1 + HP_POR_NIVEL * (nivel - 1)));
}

/**
 * O status do piloto (statusDoPiloto em shared/status.js): os pontos distribuídos
 * (j.pontos) e as instâncias de escudo, armadura e potenciadores que estão na nave
 * (j.equipado, ids em j.inv), cada uma na sua versão, com a energia base da nave em
 * uso.
 */
export function statusDoJogador(j) {
  return statusDoPiloto({
    race: j.ship.race,
    classe: j.classe ?? CLASSE_PADRAO,
    pontos: j.pontos,
    equipados: equipadosDoInv(j.inv, j.equipado),
    energiaBase: naveDoJogador(j)?.energia ?? NAVE_SEM_CLASSE.energia,
    hpBase: naveDoJogador(j)?.hp ?? NAVE_SEM_CLASSE.hp,
  });
}

/** HP máximo da nave do jogador: o da nave no nível, mais o HP a mais do status (Durabilidade, armadura e potenciadores). */
export function hpMaxDoJogador(j, status = statusDoJogador(j)) {
  const hp = hpMaxDoNivel(naveDoJogador(j)?.hp ?? NAVE_SEM_CLASSE.hp, j.nivel);
  return Math.round(hp + status.hpExtra);
}

/**
 * Dá `xp` ao jogador, subindo de nível quantas vezes der. Cada subida vira um
 * evento {e:'nivel', id, nivel} em `eventos`. Devolve quantos níveis subiu.
 */
export function ganharXp(j, xp, eventos) {
  let subiu = 0;
  // XP que conta no nível (no máximo não conta): somado em xpGanho, de onde o World
  // tira quanto o piloto ganhou num abate (o evento 'ganho', server/game.js).
  if (j.nivel < NIVEL_MAX) j.xpGanho = (j.xpGanho ?? 0) + xp;
  j.xp += xp;
  while (j.nivel < NIVEL_MAX && j.xp >= xpParaNivel(j.nivel)) {
    j.xp -= xpParaNivel(j.nivel);
    j.nivel++;
    subiu++;
    const s = j.ship;
    const novo = hpMaxDoJogador(j, j.status ?? statusDoJogador(j)); // com a nave e o equipamento
    if (s.hp > 0) s.hp += novo - s.maxHp;
    s.maxHp = novo;
    eventos?.push({ e: 'nivel', id: j.id, nivel: j.nivel });
  }
  if (j.nivel >= NIVEL_MAX) j.xp = 0;
  return subiu;
}

/** Chave de RECOMPENSA do que morreu: a espécie, no monstro; o tipo, no resto. */
export function chaveRecompensa(alvo) {
  return alvo.tipo === 'monstro' ? alvo.esp : alvo.tipo;
}

/**
 * Dá ao jogador o XP e o ouro do abate de algo do tipo `tipo`; `multOuro` multiplica
 * só o ouro (o dos acampamentos cresce com as ondas da jungle), arredondado.
 */
export function recompensar(j, tipo, eventos, multOuro = 1) {
  const r = RECOMPENSA[tipo];
  if (!r) return 0;
  j.ouro += Math.round(r.ouro * multOuro);
  return ganharXp(j, r.xp, eventos);
}
