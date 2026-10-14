// Versões dos itens: toda arma, escudo, armadura e potenciador do Astro-N original
// vai da V1 à V8, que no jogo novo é o NÍVEL do item (1 a 8). Evoluir uma instância
// paga a taxa de tuning do original (sem chance de falhar) e NÃO pede nível do
// piloto (pedido do Mateus: qualquer piloto pode ter qualquer versão; o limite é o
// ouro).
//
// Arquivo à parte (e sem import) porque shared/armas.js e shared/equipamentos.js usam
// os dois, e equipamentos.js já importa de armas.js: aqui não há ciclo.

/** Último nível (versão) de qualquer item: V8. */
export const NIVEL_ITEM_MAX = 8;
