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
//   (armasDisponiveis), as de fábrica inclusive. O id é a chave da arma
//   ('o312010'); o preço é o do original × FATOR_OURO (a V1). Cada arma vai até
//   ARMA_COPIAS_MAX cópias (pedido do Mateus, como os potenciadores): cada cópia é
//   uma instância com a sua versão, e a mesma arma no Z e no X são duas cópias (os
//   encaixes do comando escolhem a INSTÂNCIA pelo id); passou disso, 'ja_possui'.
//   As duas de fábrica da raça já vêm no inventário (fabrica: true, pago 0), contam
//   como a primeira cópia e não se vendem (a segunda, comprada, sim). Arma de outra
//   raça ou classe é 'invalido'.
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
//   projéteis, efeito) e vai na nave por instância (s.armasInst, armasInstDoInv),
//   que o stepShip lê: a predição acompanha, e evoluir uma cópia não mexe na outra.

import {
  ARMAS,
  IDX_ARMA,
  WEAPONS,
  NIVEL_ARMA_MAX,
  armasDisponiveis,
  armasIniciais,
  precoEvoluirArma,
} from './armas.js';
import { EQUIPAMENTOS, ORDEM_EQUIP, CATEGORIA_DO_SLOT, ORDEM_TIPOS_DANO, equipamentosAVenda, precoEquip, precoEvoluirEquip } from './equipamentos.js';

export { precoEvoluirArma, equipamentosAVenda, precoEquip, precoEvoluirEquip };

export const ARMA_NIVEL_MAX = NIVEL_ARMA_MAX;

/** Preço (ouro) de compra da arma (chave ou índice). */
export function precoArma(arma) {
  const w = typeof arma === 'number' ? WEAPONS[ARMAS[arma]] : WEAPONS[arma];
  return w && !w.npc ? w.preco : null;
}

/**
 * Armas à venda para a raça e a classe (índices): todas as dela, as de fábrica
 * inclusive (o piloto já tem uma cópia; a Loja vende a segunda, para ir nos dois
 * encaixes).
 */
export function armasAVenda(race, classe) {
  return armasDisponiveis(race, classe);
}

/** Até quantas cópias (instâncias) da mesma arma o piloto pode ter (a de fábrica conta). */
export const ARMA_COPIAS_MAX = 2;

/** Quantas cópias da arma de chave `chave` há no inventário. */
export function copiasDaArma(inv, chave) {
  return (inv ?? []).filter((x) => x.tipo === 'arma' && x.chave === chave).length;
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

// ---------- Filtro por tipo de dano (abas da Loja) ----------
//
// As abas Armas, Escudos, Armaduras e Potenciadores separam o que vendem pelo tipo
// de dano, como os potenciadores já faziam: Todos, Ph., Op., El. e Gerais (o item
// sem tipo: armadura geral, potenciador "Total"). Grupo sem item não aparece (toda
// arma e todo escudo tem tipo, então lá não há "Gerais").

/** Grupos do filtro, na ordem dos botões. */
export const GRUPOS_TIPO_LOJA = Object.freeze(['todos', ...ORDEM_TIPOS_DANO, 'geral']);

/** Tipo de dano de um item da Loja pelo id ('o311001', 'e330010'): 'fisico', 'laser', 'eletrico' ou 'geral'. */
export function tipoDoItemLoja(id) {
  const it = itemDaLoja(id);
  const t = it?.tipo === 'arma' ? WEAPONS[id].tipoDano : it?.tipo === 'equip' ? EQUIPAMENTOS[id].tipoDano : null;
  return ORDEM_TIPOS_DANO.includes(t) ? t : 'geral';
}

/**
 * Os grupos do filtro para os ids à venda numa aba: [{ id, itens }] na ordem de
 * GRUPOS_TIPO_LOJA, com 'todos' (a lista inteira) sempre e os outros só quando têm item.
 */
export function gruposPorTipo(ids) {
  return GRUPOS_TIPO_LOJA.map((g) => ({ id: g, itens: g === 'todos' ? [...ids] : ids.filter((k) => tipoDoItemLoja(k) === g) })).filter(
    (g) => g.id === 'todos' || g.itens.length,
  );
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

/** As armas que o piloto possui (índices em ARMAS, em ordem, sem repetir as cópias): vira s.armas na nave. */
export function armasDoInv(inv) {
  return [...new Set((inv ?? []).map(armaDaInst).filter((a) => a !== null))].sort((a, b) => a - b);
}

/**
 * As armas do inventário por instância, como a nave as lê (s.armasInst, que vai no
 * `me` e o stepShip da predição usa): [[id, índice em ARMAS, nível], ...], em ordem
 * de id (a de fábrica, mais velha, vem antes da cópia comprada).
 */
export function armasInstDoInv(inv) {
  return (inv ?? [])
    .map((x) => [x.id, armaDaInst(x), x.nivel])
    .filter((x) => x[1] !== null)
    .sort((a, b) => a[0] - b[0]);
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
 * num dos encaixes Z/X da nave (encInst = s.encInst, ids das instâncias do Z e do X).
 */
export function naNave(inst, equipado, encInst) {
  if (!inst) return false;
  if (inst.tipo === 'arma') return (encInst ?? []).includes(inst.id);
  return idsEquipados(equipado).includes(inst.id);
}

/** As instâncias do compartimento (tudo o que o piloto tem e não está na nave; encInst como em naNave). */
export function noCompartimento(inv, equipado, encInst) {
  return (inv ?? []).filter((x) => !naNave(x, equipado, encInst));
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

// ---------- Troca rápida (Q e E) ----------
//
// Como no original: as duas primeiras casas do compartimento guardam uma arma cada,
// a do Q para o Z e a do E para o X. Apertar Q troca a arma do Z pela guardada no Q
// (a que sai do Z fica no Q), e o E faz o mesmo com o X. As casas são do cliente,
// como os encaixes Z/X (ids das instâncias que vão no comando, a/a2): o servidor só
// vê a troca nos encaixes e aplica as mesmas regras (posse e TROCA_ARMA_S, no
// stepShip). A arma guardada continua no compartimento (conta nos COMPARTIMENTO_MAX).

/** Tecla de cada casa de troca rápida: a casa k troca com o encaixe k (0 = Z, 1 = X). */
export const TROCA_RAPIDA = Object.freeze(['Q', 'E']);

/**
 * As casas de troca rápida que valem: só arma do piloto (`armasInst`, como s.armasInst)
 * fora dos encaixes (`encInst`) e sem repetir; o resto vira null.
 */
export function limparTrocaRapida(casas, armasInst, encInst) {
  const tem = new Set((armasInst ?? []).map((x) => x[0]));
  const usadas = new Set(encInst ?? []);
  return [0, 1].map((k) => {
    const id = casas?.[k] ?? null;
    if (!tem.has(id) || usadas.has(id)) return null;
    usadas.add(id);
    return id;
  });
}

/**
 * Guarda a instância `id` (ou null, para esvaziar) na casa `k`. Se ela estava na
 * outra casa, as duas trocam de lugar. Devolve as casas novas.
 */
export function guardarNaTrocaRapida(casas, k, id) {
  const novas = [casas?.[0] ?? null, casas?.[1] ?? null];
  if (id !== null && novas[1 - k] === id) novas[1 - k] = novas[k];
  novas[k] = id;
  return novas;
}

/**
 * Encaixes e casas depois de pôr a instância `id` no encaixe `enc`. Se ela estava no
 * outro encaixe, os dois trocam de lugar; se estava numa casa de troca rápida, a arma
 * que sai do encaixe fica nessa casa (é o que o Q e o E fazem). Devolve
 * { encInst, casas }.
 */
export function equiparArmaRapida(encInst, casas, enc, id) {
  const e = [...encInst];
  const c = [casas?.[0] ?? null, casas?.[1] ?? null];
  const antiga = e[enc];
  if (e[1 - enc] === id) e[1 - enc] = antiga;
  const k = c.indexOf(id);
  if (k >= 0) c[k] = antiga;
  e[enc] = id;
  return { encInst: e, casas: c };
}
