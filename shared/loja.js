// Loja da base (DESIGN-PARTIDA.md): o que se compra com o ouro da partida, pousado
// e parado na plataforma da Loja da própria base. Só dados e contas puras: quem
// valida e cobra é o servidor (server/servicos.js); o cliente lê daqui os preços e
// os efeitos para desenhar o painel. Tudo é da partida: na seguinte, cada piloto
// volta a ter só as armas de fábrica da raça, sem armadura e sem itens.
//
// Três prateleiras, cada item com um id único (é o `item` da mensagem
// {t:'comprar', item}):
// - Armas: as do Astro-N original (shared/armas.js) da RAÇA e da CLASSE do piloto
//   (armasDisponiveis), menos as duas de fábrica. O id é a chave da arma
//   ('o312010'); o preço é o do original × FATOR_OURO (a V1). Comprada, a arma vai
//   para a posse do piloto e pode ir em qualquer um dos dois encaixes (Q e E). Arma
//   de outra raça ou classe é 'invalido'.
// - Armaduras: três níveis. Reduzem o dano recebido (tiro, garra, dreno, área) e
//   dão HP máximo a mais; a pesada custa um pouco de velocidade. Uma equipada por
//   vez: comprar uma melhor substitui a anterior (paga o preço cheio); uma igual ou
//   pior que a equipada é recusada.
// - Itens: consumíveis com tecla própria, carga máxima e recarga entre um uso e
//   outro. R = Kit de reparo (cura uma fração do HP máximo na hora), F = Célula de
//   energia (enche a energia). Usar vale em qualquer lugar (só comprar exige a Loja).
// - Evoluir arma: cada arma possuída (as de fábrica inclusive) sobe da versão V1 à
//   V5 do original (o NÍVEL da arma, 1 a ARMA_NIVEL_MAX), pagando a taxa de tuning
//   do original × FATOR_OURO (precoEvoluirArma, sem chance de falhar) e com o nível
//   do piloto que a versão pede (1, 5, 10, 15, 20: nivelPilotoDaVersao). A versão
//   muda tudo (dano, recarga, energia, projéteis, efeito) e vai na nave (s.niveis),
//   que o stepShip lê: a predição acompanha. O id do pedido é 'evoluir:<arma>'
//   (ex.: {t:'comprar', item:'evoluir:o311001'}).

import {
  ARMAS,
  WEAPONS,
  NIVEL_ARMA_MAX,
  armasDisponiveis,
  armasIniciais,
  precoEvoluirArma,
  nivelPilotoDaVersao,
} from './armas.js';

export { precoEvoluirArma, nivelPilotoDaVersao };

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
export const ARMADURA_LEVE_REDUCAO = 0.1; // fração do dano que a armadura segura
export const ARMADURA_LEVE_HP = 0; // HP máximo a mais
export const ARMADURA_MEDIA_REDUCAO = 0.15;
export const ARMADURA_MEDIA_HP = 30;
export const ARMADURA_PESADA_REDUCAO = 0.25;
export const ARMADURA_PESADA_HP = 60;
export const ARMADURA_PESADA_VEL = 0.92; // multiplicador da velocidade máxima

/** Armaduras, da mais leve para a mais pesada (o índice é o nível: 0, 1, 2). */
export const ARMADURAS = [
  { id: 'armaduraLeve', nome: 'Armadura leve', preco: 150, reducao: ARMADURA_LEVE_REDUCAO, hp: ARMADURA_LEVE_HP, velMult: 1 },
  { id: 'armaduraMedia', nome: 'Armadura média', preco: 300, reducao: ARMADURA_MEDIA_REDUCAO, hp: ARMADURA_MEDIA_HP, velMult: 1 },
  {
    id: 'armaduraPesada',
    nome: 'Armadura pesada',
    preco: 480,
    reducao: ARMADURA_PESADA_REDUCAO,
    hp: ARMADURA_PESADA_HP,
    velMult: ARMADURA_PESADA_VEL,
  },
];

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

/** Prefixo do id de evolução de arma na Loja ('evoluir:o311001'). */
export const PREFIXO_EVOLUIR = 'evoluir:';

/**
 * Níveis das armas de um piloto no começo da partida: nenhuma entrada (todas no 1).
 * É um objeto índice → nível (só as evoluídas), copiado para a nave (s.niveis).
 */
export function niveisArmasIniciais() {
  return {};
}

/**
 * Catálogo da Loja por id: { tipo: 'arma' | 'armadura' | 'item' | 'evoluirArma', ... }.
 * Arma traz `arma` (índice em ARMAS) e `preco`; armadura traz `nivel` (índice em
 * ARMADURAS) e `preco`; evoluirArma traz `arma` e não tem preço fixo (depende do
 * nível atual: precoEvoluirArma). Tem as armas de todas as raças e classes: quem
 * confere se o piloto pode comprar é o servidor (armasDisponiveis).
 */
const ARMAS_DE_JOGADOR = ARMAS.map((_, i) => i).filter((i) => !WEAPONS[ARMAS[i]].npc);
export const CATALOGO_LOJA = Object.freeze({
  ...Object.fromEntries(ARMAS_DE_JOGADOR.map((i) => [ARMAS[i], { tipo: 'arma', arma: i, preco: WEAPONS[ARMAS[i]].preco }])),
  ...Object.fromEntries(ARMADURAS.map((a, nivel) => [a.id, { tipo: 'armadura', nivel, preco: a.preco }])),
  ...Object.fromEntries(ORDEM_ITENS.map((id) => [id, { tipo: 'item', item: id, preco: ITENS[id].preco }])),
  ...Object.fromEntries(ARMAS_DE_JOGADOR.map((i) => [PREFIXO_EVOLUIR + ARMAS[i], { tipo: 'evoluirArma', arma: i }])),
});

/** O item da Loja com este id, ou null (id que não é string ou não existe). */
export function itemDaLoja(id) {
  return typeof id === 'string' && Object.hasOwn(CATALOGO_LOJA, id) ? CATALOGO_LOJA[id] : null;
}

/** A armadura do nível (0 a 2), ou null sem armadura (-1 ou qualquer outra coisa). */
export function armadura(nivel) {
  return Number.isInteger(nivel) ? (ARMADURAS[nivel] ?? null) : null;
}
