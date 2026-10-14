// Versões dos itens: toda arma, escudo, armadura e potenciador do Astro-N original
// vai da V1 à V8, que no jogo novo é o NÍVEL do item (1 a 8). Evoluir na Loja paga a
// taxa de tuning do original (sem chance de falhar) e pede o nível do piloto da
// versão, o MESMO para todo tipo de item: um degrau a cada 3 níveis do piloto, para a
// V8 caber antes do nível máximo (25) numa partida boa.
//
// Arquivo à parte (e sem import) porque shared/armas.js e shared/equipamentos.js usam
// os dois, e equipamentos.js já importa de armas.js: aqui não há ciclo.

/** Último nível (versão) de qualquer item: V8. */
export const NIVEL_ITEM_MAX = 8;

/** Nível do piloto exigido por versão: índice 0 = V1 ... índice 7 = V8. */
export const NIVEL_POR_VERSAO = Object.freeze([1, 4, 7, 10, 13, 16, 19, 22]);

/**
 * Nível do piloto que a versão `v` (1 a 8) de qualquer item pede. Acima da V8 vale o
 * da V8; o que não é versão (0, negativo, não inteiro) vale 1.
 */
export function nivelPilotoDaVersaoItem(v) {
  if (!Number.isInteger(v) || v < 1) return 1;
  return NIVEL_POR_VERSAO[Math.min(v, NIVEL_ITEM_MAX) - 1];
}
