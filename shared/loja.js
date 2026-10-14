// Loja da base (DESIGN-PARTIDA.md): o que se compra com o ouro da partida, pousado
// e parado na plataforma da Loja da própria base. Só dados e contas puras: quem
// valida e cobra é o servidor (server/servicos.js); o cliente lê daqui os preços e
// os efeitos para desenhar o painel. Tudo é da partida: na seguinte, cada piloto
// volta a ter só as armas de fábrica da raça, sem equipamento e sem itens.
//
// O que se compra vira um OBJETO do piloto (uma instância no inventário, j.inv), como
// no INVENTORY do original: { id, tipo: 'arma' | 'equip', chave, nivel, pago,
// fabrica? }. A instância nasce na V1 no COMPARTIMENTO (o que o piloto tem e não está
// na nave), sem equipar sozinha; o compartimento leva no máximo COMPARTIMENTO_MAX.
// Cada instância tem a sua versão (nivel, V1 a V8) e guarda o ouro gasto nela
// (pago: compra + evoluções), que é a base da venda (FRACAO_VENDA). Quem cria,
// equipa, vende e evolui é o servidor (server/servicos.js); as contas puras ficam
// aqui para o painel mostrar o mesmo número.
//
// Prateleiras, cada item com um id único (é o `item` da mensagem {t:'comprar', item}):
// - Armas: as do Astro-N original (shared/armas.js) da RAÇA e da CLASSE do piloto
//   (armasDisponiveis), menos as duas de fábrica. O id é a chave da arma
//   ('o312010'); o preço é o do original × FATOR_OURO (a V1). Arma, no máximo UMA de
//   cada (os encaixes Z e X do comando escolhem a arma pelo índice): a mesma de novo é
//   'ja_possui'. As duas de fábrica da raça já vêm no inventário (fabrica: true,
//   pago 0) e não se vendem. Arma de outra raça ou classe é 'invalido'.
// - Equipamentos: os escudos, armaduras e potenciadores do original
//   (shared/equipamentos.js) que a CLASSE do piloto usa (equipamentosAVenda; de
//   outra classe, 'invalido'). O id é a chave do item ('e330010'). Equipamento pode
//   repetir: cada compra é uma instância nova (o mesmo potenciador nos dois encaixes
//   são duas instâncias, cada uma na sua versão).
// - Itens: consumíveis com tecla própria, carga máxima e recarga entre um uso e
//   outro. R = Kit de reparo (cura uma fração do HP máximo na hora), F = Célula de
//   energia (enche a energia). Usar vale em qualquer lugar (só comprar exige a Loja).
//   Não ocupam o compartimento (têm carga própria).
// - Evoluir não é da Loja: é o pedido {t:'evoluirItem', inst} sobre UMA instância
//   (no compartimento ou na nave), que sobe para a próxima versão do original pagando
//   a taxa de tuning × FATOR_OURO (precoEvoluirInst; sem chance de falhar e sem nível
//   do piloto), até a V8. A versão da arma muda tudo (dano, recarga, energia,
//   projéteis, efeito) e vai na nave (s.niveis, niveisDoInv), que o stepShip lê: a
//   predição acompanha.

import {
  ARMAS,
  IDX_ARMA,
  WEAPONS,
  NIVEL_ARMA_MAX,
  armasDisponiveis,
  armasIniciais,
  precoEvoluirArma,
} from './armas.js';
import { EQUIPAMENTOS, ORDEM_EQUIP, CATEGORIA_DO_SLOT, equipamentosAVenda, precoEquip, precoEvoluirEquip } from './equipamentos.js';

export { precoEvoluirArma, equipamentosAVenda, precoEquip, precoEvoluirEquip };

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

/**
 * Catálogo da Loja por id: { tipo: 'arma' | 'equip' | 'item', ... }. Arma traz
 * `arma` (índice em ARMAS) e `preco`; equip traz `chave`, `categoria` ('escudo' |
 * 'armadura' | 'potenciador') e `preco` (a V1). Tem as armas de todas as raças
 * e classes e os equipamentos de todas as classes: quem confere se o piloto pode
 * comprar é o servidor (armasDisponiveis, podeUsar).
 */
const ARMAS_DE_JOGADOR = ARMAS.map((_, i) => i).filter((i) => !WEAPONS[ARMAS[i]].npc);
export const CATALOGO_LOJA = Object.freeze({
  ...Object.fromEntries(ARMAS_DE_JOGADOR.map((i) => [ARMAS[i], { tipo: 'arma', arma: i, preco: WEAPONS[ARMAS[i]].preco }])),
  ...Object.fromEntries(ORDEM_EQUIP.map((k) => [k, { tipo: 'equip', chave: k, categoria: EQUIPAMENTOS[k].categoria, preco: EQUIPAMENTOS[k].preco }])),
  ...Object.fromEntries(ORDEM_ITENS.map((id) => [id, { tipo: 'item', item: id, preco: ITENS[id].preco }])),
});

/** O item da Loja com este id, ou null (id que não é string ou não existe). */
export function itemDaLoja(id) {
  return typeof id === 'string' && Object.hasOwn(CATALOGO_LOJA, id) ? CATALOGO_LOJA[id] : null;
}

// ---------- Inventário (instâncias) ----------

export const COMPARTIMENTO_MAX = 12; // itens fora da nave (armas e equipamentos)
export const FRACAO_VENDA = 0.5; // da venda: esta fração do que se pagou na instância

/** Encaixes de equipamento vazios (o que vai em j.equipado: ids de instância ou null). */
export function equipadoVazio() {
  return { escudo: null, armadura: null, pot: [null, null] };
}

/**
 * Inventário do começo da partida: as duas armas de fábrica da raça, na V1, de
 * graça (fabrica: true), com ids a partir de `proxId`. Devolve { inv, proxId } (o
 * próximo id livre).
 */
export function invInicial(race, proxId = 1) {
  const inv = armasIniciais(race).map((a) => ({ id: proxId++, tipo: 'arma', chave: ARMAS[a], nivel: 1, pago: 0, fabrica: true }));
  return { inv, proxId };
}

/** A instância de id `id` no inventário, ou null (id que não é inteiro inclusive). */
export function instDoInv(inv, id) {
  return Number.isInteger(id) ? (inv?.find((x) => x.id === id) ?? null) : null;
}

/** Índice em ARMAS da arma da instância (null se não é arma). */
export function armaDaInst(inst) {
  return inst?.tipo === 'arma' ? (IDX_ARMA[inst.chave] ?? null) : null;
}

/** As armas que o piloto possui (índices em ARMAS, em ordem): vira s.armas na nave. */
export function armasDoInv(inv) {
  return (inv ?? [])
    .map(armaDaInst)
    .filter((a) => a !== null)
    .sort((a, b) => a - b);
}

/** Versão de cada arma possuída acima da V1 ({índice: nível}): vira s.niveis, que o stepShip lê. */
export function niveisDoInv(inv) {
  const out = {};
  for (const x of inv ?? []) {
    const a = armaDaInst(x);
    if (a !== null && x.nivel > 1) out[a] = x.nivel;
  }
  return out;
}

/** Ids das instâncias de equipamento nos quatro encaixes (sem os vazios). */
function idsEquipados(equipado) {
  return [equipado?.escudo, equipado?.armadura, ...(Array.isArray(equipado?.pot) ? equipado.pot : [])].filter((id) => id !== null && id !== undefined);
}

/**
 * O que está na nave como [[chave, nível], ...] (escudo, armadura, pot1, pot2, só os
 * ocupados): a entrada de statusDoPiloto/somaEquipamento (shared/status.js).
 */
export function equipadosDoInv(inv, equipado) {
  const out = [];
  for (const id of idsEquipados(equipado)) {
    const x = instDoInv(inv, id);
    if (x?.tipo === 'equip') out.push([x.chave, x.nivel]);
  }
  return out;
}

/**
 * A instância está na nave? Equipamento: num dos quatro encaixes (equipado). Arma:
 * num dos encaixes Z/X da nave (encaixes = s.encaixes, índices em ARMAS).
 */
export function naNave(inst, equipado, encaixes) {
  if (!inst) return false;
  if (inst.tipo === 'arma') return (encaixes ?? []).includes(armaDaInst(inst));
  return idsEquipados(equipado).includes(inst.id);
}

/** As instâncias do compartimento (tudo o que o piloto tem e não está na nave). */
export function noCompartimento(inv, equipado, encaixes) {
  return (inv ?? []).filter((x) => !naNave(x, equipado, encaixes));
}

/** O slot de equipamento ('escudo' | 'armadura' | 'pot1' | 'pot2') que leva a categoria? */
export function slotAceita(slot, categoria) {
  return Object.hasOwn(CATEGORIA_DO_SLOT, slot ?? '') && CATEGORIA_DO_SLOT[slot] === categoria;
}

/** Ouro que a venda da instância dá (FRACAO_VENDA do que se pagou nela); null na arma de fábrica. */
export function precoVenda(inst) {
  if (!inst || inst.fabrica) return null;
  return Math.floor((inst.pago ?? 0) * FRACAO_VENDA);
}

/** Preço para levar a instância à próxima versão (a taxa de tuning dela); null na V8 ou inválida. */
export function precoEvoluirInst(inst) {
  if (inst?.tipo === 'arma') return precoEvoluirArma(inst.chave, inst.nivel);
  if (inst?.tipo === 'equip') return precoEvoluirEquip(inst.chave, inst.nivel);
  return null;
}
