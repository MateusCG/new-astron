// Loja da base (DESIGN-PARTIDA.md): o que se compra com o ouro da partida, pousado
// e parado na plataforma da Loja da própria base. Só dados e contas puras: quem
// valida e cobra é o servidor (server/servicos.js); o cliente lê daqui os preços e
// os efeitos para desenhar o painel. Tudo é da partida: na seguinte, cada piloto
// volta a ter só as armas de fábrica da raça, sem equipamento e sem itens.
//
// Prateleiras, cada item com um id único (é o `item` da mensagem {t:'comprar', item}):
// - Armas: as do Astro-N original (shared/armas.js) da RAÇA e da CLASSE do piloto
//   (armasDisponiveis), menos as duas de fábrica. O id é a chave da arma
//   ('o312010'); o preço é o do original × FATOR_OURO (a V1). Comprada, a arma vai
//   para a posse do piloto e pode ir em qualquer um dos dois encaixes (Q e E). Arma
//   de outra raça ou classe é 'invalido'.
// - Equipamentos: os escudos, armaduras e potenciadores do original
//   (shared/equipamentos.js) que a CLASSE do piloto usa (equipamentosAVenda; de
//   outra classe, 'invalido'). O id é a chave do item ('e330010'); comprar dá a V1 e,
//   se o encaixe da categoria estiver vazio (potenciador: o primeiro dos dois vazio),
//   já equipa. Escudo e armadura, um de cada: o mesmo de novo é 'ja_possui'. O
//   POTENCIADOR pode ter COPIAS_MAX_POTENCIADOR (2) cópias, para ir o mesmo nos dois
//   encaixes (como no original, que tinha dois itens iguais no inventário): a segunda
//   cópia sai na versão em que a primeira está e custa o que a primeira custou até
//   ali (precoCopiaEquip); daí em diante as duas evoluem juntas e a evolução custa
//   por cópia (precoEvoluirComCopias). Com as duas, comprar de novo é 'ja_possui'.
//   Trocar o que está na nave é o pedido {t:'equipar'} (pousado em qualquer área de
//   pouso da própria base).
// - Itens: consumíveis com tecla própria, carga máxima e recarga entre um uso e
//   outro. R = Kit de reparo (cura uma fração do HP máximo na hora), F = Célula de
//   energia (enche a energia). Usar vale em qualquer lugar (só comprar exige a Loja).
// - Evoluir: cada arma possuída (as de fábrica inclusive) e cada equipamento possuído
//   sobe da V1 à V8 do original (o NÍVEL do item, 1 a 8), pagando a taxa de tuning do
//   original × FATOR_OURO (sem chance de falhar), em qualquer nível do piloto (pedido
//   do Mateus: o limite é o ouro). A versão da arma muda tudo (dano, recarga, energia, projéteis,
//   efeito) e vai na nave (s.niveis), que o stepShip lê: a predição acompanha. O id do
//   pedido é 'evoluir:<chave>' (ex.: {t:'comprar', item:'evoluir:o311001'} ou
//   'evoluir:e330010').

import {
  ARMAS,
  WEAPONS,
  NIVEL_ARMA_MAX,
  armasDisponiveis,
  armasIniciais,
  precoEvoluirArma,
} from './armas.js';
import { EQUIPAMENTOS, ORDEM_EQUIP, equipamentosAVenda, equipamento, versaoEquip, precoEquip, precoEvoluirEquip } from './equipamentos.js';

export { precoEvoluirArma, equipamentosAVenda, precoEquip, precoEvoluirEquip };

/** Cópias que o piloto pode ter de um equipamento: 2 do potenciador (os dois encaixes), 1 do resto. */
export const COPIAS_MAX_POTENCIADOR = 2;
export function copiasMax(chave) {
  return equipamento(chave)?.categoria === 'potenciador' ? COPIAS_MAX_POTENCIADOR : 1;
}

/**
 * Preço de mais uma cópia de um equipamento que o piloto já tem na versão `nivel`:
 * o que a primeira custou até ali (compra + evoluções), para a segunda não sair mais
 * barata que evoluir. null se a chave não existe.
 */
export function precoCopiaEquip(chave, nivel) {
  return versaoEquip(chave, nivel)?.custoTotal ?? null;
}

/** Preço de evoluir `copias` cópias juntas da versão `nivel` para a próxima (null na V8). */
export function precoEvoluirComCopias(chave, nivel, copias = 1) {
  const p = precoEvoluirEquip(chave, nivel);
  return p === null ? null : p * Math.max(1, copias);
}

export const ARMA_NIVEL_MAX = NIVEL_ARMA_MAX;

/** Preço (ouro) de compra da arma (chave ou índice). */
export function precoArma(arma) {
  const w = typeof arma === 'number' ? WEAPONS[ARMAS[arma]] : WEAPONS[arma];
  return w && !w.npc ? w.preco : null;
}

/** Armas à venda para a raça e a classe (índices): as dela menos as de fábrica. */
export function armasAVenda(race, classe) {
  const fabrica = armasIniciais(race);
  return armasDisponiveis(race, classe).filter((i) => !fabrica.includes(i));
}

export const REPARO_CURA = 0.4; // fração do HP máximo
export const REPARO_RECARGA_S = 10;
export const ENERGIA_RECARGA_S = 8;
export const ITEM_CARGA_MAX = 3; // de cada item, no compartimento da nave

/** Itens consumíveis: tecla de uso, preço, recarga entre usos e carga máxima. */
export const ITENS = {
  reparo: { id: 'reparo', nome: 'Kit de reparo', tecla: 'R', preco: 60, recargaS: REPARO_RECARGA_S, max: ITEM_CARGA_MAX, cura: REPARO_CURA },
  energia: { id: 'energia', nome: 'Célula de energia', tecla: 'F', preco: 40, recargaS: ENERGIA_RECARGA_S, max: ITEM_CARGA_MAX },
};
/** Ordem dos itens no painel e na Loja. */
export const ORDEM_ITENS = ['reparo', 'energia'];

/** Prefixo do id de evolução na Loja ('evoluir:o311001' arma, 'evoluir:e330010' equipamento). */
export const PREFIXO_EVOLUIR = 'evoluir:';

/**
 * Níveis das armas de um piloto no começo da partida: nenhuma entrada (todas no 1).
 * É um objeto índice → nível (só as evoluídas), copiado para a nave (s.niveis).
 */
export function niveisArmasIniciais() {
  return {};
}

/**
 * Catálogo da Loja por id: { tipo: 'arma' | 'equip' | 'item' | 'evoluirArma' |
 * 'evoluirEquip', ... }. Arma traz `arma` (índice em ARMAS) e `preco`; equip traz
 * `chave`, `categoria` ('escudo' | 'armadura' | 'potenciador') e `preco` (a V1);
 * evoluirArma traz `arma` e evoluirEquip traz `chave`, sem preço fixo (depende do
 * nível atual: precoEvoluirArma, precoEvoluirEquip). Tem as armas de todas as raças
 * e classes e os equipamentos de todas as classes: quem confere se o piloto pode
 * comprar é o servidor (armasDisponiveis, podeUsar).
 */
const ARMAS_DE_JOGADOR = ARMAS.map((_, i) => i).filter((i) => !WEAPONS[ARMAS[i]].npc);
export const CATALOGO_LOJA = Object.freeze({
  ...Object.fromEntries(ARMAS_DE_JOGADOR.map((i) => [ARMAS[i], { tipo: 'arma', arma: i, preco: WEAPONS[ARMAS[i]].preco }])),
  ...Object.fromEntries(ORDEM_EQUIP.map((k) => [k, { tipo: 'equip', chave: k, categoria: EQUIPAMENTOS[k].categoria, preco: EQUIPAMENTOS[k].preco }])),
  ...Object.fromEntries(ORDEM_ITENS.map((id) => [id, { tipo: 'item', item: id, preco: ITENS[id].preco }])),
  ...Object.fromEntries(ARMAS_DE_JOGADOR.map((i) => [PREFIXO_EVOLUIR + ARMAS[i], { tipo: 'evoluirArma', arma: i }])),
  ...Object.fromEntries(ORDEM_EQUIP.map((k) => [PREFIXO_EVOLUIR + k, { tipo: 'evoluirEquip', chave: k }])),
});

/** O item da Loja com este id, ou null (id que não é string ou não existe). */
export function itemDaLoja(id) {
  return typeof id === 'string' && Object.hasOwn(CATALOGO_LOJA, id) ? CATALOGO_LOJA[id] : null;
}
