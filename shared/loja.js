// Loja da base (DESIGN-PARTIDA.md): o que se compra com o ouro da partida, pousado
// e parado na plataforma da Loja da própria base. Só dados e contas puras: quem
// valida e cobra é o servidor (server/servicos.js); o cliente lê daqui os preços e
// os efeitos para desenhar o painel. Tudo é da partida: na seguinte, cada piloto
// volta a ter só as armas de fábrica, sem armadura e sem itens.
//
// Três prateleiras, cada item com um id único (é o `item` da mensagem
// {t:'comprar', item}):
// - Armas: as 8 do catálogo (ARMAS em shared/sim.js) que não são de fábrica. Mais
//   caras as mais fortes ou raras (o míssil, que acerta sozinho, é a mais cara).
//   Comprada, a arma vai para a posse do piloto e pode ir em qualquer um dos dois
//   encaixes (Q e E).
// - Armaduras: três níveis. Reduzem o dano recebido (tiro, garra, dreno, área) e
//   dão HP máximo a mais; a pesada custa um pouco de velocidade. Uma equipada por
//   vez: comprar uma melhor substitui a anterior (paga o preço cheio); uma igual ou
//   pior que a equipada é recusada.
// - Itens: consumíveis com tecla própria, carga máxima e recarga entre um uso e
//   outro. R = Kit de reparo (cura uma fração do HP máximo na hora), F = Célula de
//   energia (enche a energia). Usar vale em qualquer lugar (só comprar exige a Loja).

import { ARMAS, ARMAS_INICIAIS } from './sim.js';

/** Preço (ouro) de cada arma que não é de fábrica. */
export const PRECO_ARMA = {
  laserDuplo: 120,
  laserTriplo: 150,
  crio: 180,
  dreno: 200,
  mina: 240,
  choque: 260,
  emp: 300,
  missil: 340,
};

/** Armas à venda, na ordem do catálogo (índices de ARMAS). */
export const ARMAS_A_VENDA = ARMAS.map((_, i) => i).filter((i) => !ARMAS_INICIAIS.includes(i));

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

/**
 * Catálogo da Loja por id: { tipo: 'arma' | 'armadura' | 'item', preco, ... }.
 * Arma traz `arma` (índice em ARMAS); armadura traz `nivel` (índice em ARMADURAS).
 */
export const CATALOGO_LOJA = Object.freeze({
  ...Object.fromEntries(ARMAS_A_VENDA.map((i) => [ARMAS[i], { tipo: 'arma', arma: i, preco: PRECO_ARMA[ARMAS[i]] }])),
  ...Object.fromEntries(ARMADURAS.map((a, nivel) => [a.id, { tipo: 'armadura', nivel, preco: a.preco }])),
  ...Object.fromEntries(ORDEM_ITENS.map((id) => [id, { tipo: 'item', item: id, preco: ITENS[id].preco }])),
});

/** O item da Loja com este id, ou null (id que não é string ou não existe). */
export function itemDaLoja(id) {
  return typeof id === 'string' && Object.hasOwn(CATALOGO_LOJA, id) ? CATALOGO_LOJA[id] : null;
}

/** A armadura do nível (0 a 2), ou null sem armadura (-1 ou qualquer outra coisa). */
export function armadura(nivel) {
  return Number.isInteger(nivel) ? (ARMADURAS[nivel] ?? null) : null;
}
