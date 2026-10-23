// Catálogo dos equipamentos da nave: os 12 escudos, 16 armaduras e 34 potenciadores
// (enhancers) das lojas do Astro-N original (dados em shared/equipamentos-original.js,
// gerado por tools/gerar_equipamentos.mjs), convertidos para a escala do jogo novo.
//
// Na nave vão 1 escudo, 1 armadura e 2 potenciadores (podem ser iguais: duas
// instâncias do mesmo, compradas à parte; o inventário está em shared/loja.js), além
// das duas armas. Cada item tem as versões V1 a V8 do original, que são o NÍVEL do
// item (1 a 8), como nas armas: comprar dá a V1; evoluir a instância paga a taxa de
// tuning do original (sem chance de falhar), sem pedir nível do piloto
// (shared/versoes.js). Alguns itens são de uma classe só
// (as colunas de classe do original): podeUsar.
//
// O que cada categoria faz (o efeito de tudo junto, com os pontos do piloto, é
// statusDoPiloto em shared/status.js):
// - Escudo: uma reserva própria (maxEscudo) que recupera sozinha (regenEscudo por s)
//   e apanha o dano antes do HP; mais um pouco de resistência a um tipo de dano.
// - Armadura: HP máximo a mais e resistência aos três tipos de dano (a "geral" igual
//   nos três, a Op./Ph./El. forte em um).
// - Potenciador: até três efeitos do original (HP, escudo, energia, regenerações,
//   poder, recarga, resistência, penetração, golpe crítico, velocidade, aceleração).
//
// Como o original vira jogo novo (os mesmos fatores das naves e das armas):
// - HP, escudo e as regenerações de escudo e de HP × FATOR_ESCALA_HP (0,2); o que é
//   "por ms" no original × 1000 = por s.
// - Energia máxima × FATOR_ENERGIA (0,3); regeneração de energia por ms × 1000 ×
//   FATOR_ENERGIA ÷ FATOR_RECARGA, a mesma conta da regeneração das naves (as recargas
//   das armas são × 0,5, então quem regenera acompanha o que as armas gastam).
// - Resistência em pontos (escudo e armadura) × RESIST_POR_PONTO (0,005: 38 pontos =
//   19%); a dos potenciadores já é %. A penetração (pontos) também × RESIST_POR_PONTO:
//   é quanto da resistência do alvo ela ignora.
// - Poder, recarga, golpe crítico, velocidade e aceleração: o % do original, igual
//   (vira fração: 20% = 0,2).
// - Ouro da compra × FATOR_OURO (0,06) e da evolução × FATOR_OURO_EVOLUIR (0,006, no
//   mínimo PRECO_EVOLUIR_MIN), arredondado de 10 em 10, como as armas.
//
// Mesmo arquivo nos dois lados e determinístico: o servidor valida e aplica, o
// cliente lê para desenhar a Loja, o Inventário e o STATUS.

import { EQUIPAMENTOS_ORIGINAL } from './equipamentos-original.js';
import { FATOR_ESCALA_HP, FATOR_ENERGIA, FATOR_RECARGA, MS_POR_S, ORDEM_CLASSES } from './naves.js';
import { FATOR_OURO, FATOR_OURO_EVOLUIR, PRECO_EVOLUIR_MIN, RESIST_POR_PONTO, RESIST_MAX, TIPOS_DANO } from './armas.js';
import { NIVEL_ITEM_MAX } from './versoes.js';

export { NIVEL_ITEM_MAX, RESIST_POR_PONTO, RESIST_MAX };

export const FATOR_HP_EQUIP = FATOR_ESCALA_HP; // 0,2: HP a mais, escudo máximo
export const FATOR_REGEN_HP_EQUIP = MS_POR_S * FATOR_ESCALA_HP; // por ms do original → HP (ou escudo) por s
export const FATOR_ENERGIA_EQUIP = FATOR_ENERGIA; // 0,3: energia máxima a mais
export const FATOR_REGEN_EN_EQUIP = (MS_POR_S * FATOR_ENERGIA) / FATOR_RECARGA; // por ms do original → energia por s
export const FATOR_PCT = 0.01; // % do original → fração
export const ARREDONDA_OURO = 10; // preços de 10 em 10

/** Nome de cada categoria, na ordem da Loja e do Inventário. */
export const CATEGORIAS_EQUIP = { escudo: 'Escudo', armadura: 'Armadura', potenciador: 'Potenciador' };
export const ORDEM_CATEGORIAS_EQUIP = Object.keys(CATEGORIAS_EQUIP);

/**
 * Encaixes de equipamento da nave e a categoria de cada um (o `slot` do pedido
 * {t:'equipar'}). Os dois potenciadores não podem ser o mesmo item.
 */
export const CATEGORIA_DO_SLOT = Object.freeze({ escudo: 'escudo', armadura: 'armadura', pot1: 'potenciador', pot2: 'potenciador' });
export const SLOTS_EQUIP = Object.keys(CATEGORIA_DO_SLOT);

/** Os três tipos de dano na ordem do original (Ph, Op, El) e a sigla da interface. */
export const ORDEM_TIPOS_DANO = ['fisico', 'laser', 'eletrico'];
export const SIGLA_TIPO = { fisico: 'Ph.', laser: 'Op.', eletrico: 'El.' };

/** Tipo de dano da coluna 11 do original (0 Ph, 1 Op, 2 El, 3 nenhum). */
const TIPO_DO_CODIGO = ['fisico', 'laser', 'eletrico', null];

/**
 * Efeitos do potenciador pelo código do original: tipo do efeito do jogo, tipo de dano
 * (quando é por tipo) e a conversão do valor. Os tipos de efeito são os mesmos dos
 * escudos e armaduras (efeitosDoEquip):
 * 'hp', 'escudo', 'regenEscudo', 'energia', 'regenEn', 'regenHp' (números do jogo) e
 * 'poder', 'recarga', 'resist', 'penetra', 'critico', 'velocidade', 'aceleracao'
 * (frações).
 */
const EFEITO_DO_CODIGO = {
  1: { tipo: 'hp', fator: FATOR_HP_EQUIP },
  2: { tipo: 'escudo', fator: FATOR_HP_EQUIP },
  3: { tipo: 'regenEscudo', fator: FATOR_REGEN_HP_EQUIP },
  4: { tipo: 'energia', fator: FATOR_ENERGIA_EQUIP },
  5: { tipo: 'regenEn', fator: FATOR_REGEN_EN_EQUIP },
  6: { tipo: 'poder', tipoDano: 'fisico', fator: FATOR_PCT },
  7: { tipo: 'poder', tipoDano: 'laser', fator: FATOR_PCT },
  8: { tipo: 'poder', tipoDano: 'eletrico', fator: FATOR_PCT },
  9: { tipo: 'recarga', tipoDano: 'fisico', fator: FATOR_PCT },
  10: { tipo: 'recarga', tipoDano: 'laser', fator: FATOR_PCT },
  11: { tipo: 'recarga', tipoDano: 'eletrico', fator: FATOR_PCT },
  15: { tipo: 'velocidade', fator: FATOR_PCT },
  16: { tipo: 'aceleracao', fator: FATOR_PCT },
  24: { tipo: 'regenHp', fator: FATOR_REGEN_HP_EQUIP },
  36: { tipo: 'resist', tipoDano: 'fisico', fator: FATOR_PCT },
  37: { tipo: 'resist', tipoDano: 'laser', fator: FATOR_PCT },
  38: { tipo: 'resist', tipoDano: 'eletrico', fator: FATOR_PCT },
  39: { tipo: 'critico', fator: FATOR_PCT },
  40: { tipo: 'penetra', tipoDano: 'fisico', fator: RESIST_POR_PONTO },
  41: { tipo: 'penetra', tipoDano: 'laser', fator: RESIST_POR_PONTO },
  42: { tipo: 'penetra', tipoDano: 'eletrico', fator: RESIST_POR_PONTO },
};

const r4 = (x) => Math.round(x * 1e4) / 1e4;
const ouro = (x) => Math.round((x * FATOR_OURO) / ARREDONDA_OURO) * ARREDONDA_OURO;
const ouroEvoluir = (x) => Math.max(PRECO_EVOLUIR_MIN, Math.round((x * FATOR_OURO_EVOLUIR) / ARREDONDA_OURO) * ARREDONDA_OURO);

/** Resistência em pontos [Ph, Op, El] → efeitos 'resist' (só os que não são zero). */
function efeitosResist(pontos) {
  return ORDEM_TIPOS_DANO.map((tipoDano, i) => ({ tipo: 'resist', tipoDano, valor: r4(pontos[i] * RESIST_POR_PONTO), pontos: pontos[i] })).filter(
    (e) => e.pontos > 0,
  );
}

/** Efeitos normalizados de uma versão do original: [{ tipo, tipoDano?, valor }]. */
function efeitosDaVersao(categoria, v) {
  if (categoria === 'escudo') {
    return [
      { tipo: 'escudo', valor: r4(v.escudo * FATOR_HP_EQUIP) },
      { tipo: 'regenEscudo', valor: r4(v.regenMs * FATOR_REGEN_HP_EQUIP) },
      ...efeitosResist(v.resist),
    ];
  }
  if (categoria === 'armadura') return [{ tipo: 'hp', valor: r4(v.hp * FATOR_HP_EQUIP) }, ...efeitosResist(v.resist)];
  return v.efeitos.map(([codigo, valor]) => {
    const d = EFEITO_DO_CODIGO[codigo];
    if (!d) throw new Error(`efeito de potenciador sem conversão: código ${codigo}`);
    const e = { tipo: d.tipo, valor: r4(valor * d.fator) };
    if (d.tipoDano) e.tipoDano = d.tipoDano;
    return e;
  });
}

/**
 * Tipo de dano do item: o da coluna do original no escudo e na armadura (null na
 * armadura geral); no potenciador, o tipo comum a todos os efeitos por tipo (null nos
 * "Total", nos sem tipo e no de golpe crítico, que o original marca El. sem motivo).
 */
function tipoDanoDoItem(o, versoes) {
  if (o.categoria !== 'potenciador') return TIPO_DO_CODIGO[o.tipo] ?? null;
  const tipos = new Set(versoes[0].efeitos.map((e) => e.tipoDano ?? null));
  return tipos.size === 1 ? [...tipos][0] : null;
}

function converterItem(o) {
  let custo = 0;
  const versoes = o.versoes.map((v, i) => {
    // Ouro para chegar a esta versão: a V1 é a compra; as seguintes, a taxa de tuning da anterior.
    const preco = i === 0 ? ouro(v.preco) : ouroEvoluir(o.versoes[i - 1].taxa);
    custo += preco;
    const versao = {
      v: v.v,
      id: v.id,
      preco,
      custoTotal: custo,
      taxaTuning: v.taxa ? ouroEvoluir(v.taxa) : 0, // ouro para a próxima (0 na V8)
      efeitos: efeitosDaVersao(o.categoria, v),
    };
    // Atalhos por categoria (os mesmos números dos efeitos).
    if (o.categoria === 'escudo') Object.assign(versao, { maxEscudo: versao.efeitos[0].valor, regenEscudo: versao.efeitos[1].valor });
    if (o.categoria === 'armadura') versao.hp = versao.efeitos[0].valor;
    return versao;
  });
  const classes = o.classes[0] ? [...ORDEM_CLASSES] : ORDEM_CLASSES.filter((_, i) => o.classes[i + 1]);
  return {
    chave: 'e' + o.id,
    id: o.id,
    categoria: o.categoria,
    nome: o.nome,
    nomePt: o.nomePt,
    tipoDano: tipoDanoDoItem(o, versoes),
    classes,
    preco: versoes[0].preco,
    versoes,
  };
}

/**
 * Todos os equipamentos por chave ('e330010' = id da V1 no original), na ordem do
 * catálogo: escudos, armaduras e potenciadores. Cada um:
 * { chave, id, categoria: 'escudo'|'armadura'|'potenciador', nome (original), nomePt,
 *   tipoDano: 'fisico'|'laser'|'eletrico'|null, classes: ['assault', ...], preco (V1),
 *   versoes: [8 × { v, id, preco, custoTotal, taxaTuning,
 *   efeitos: [{ tipo, tipoDano?, valor }], maxEscudo?, regenEscudo?, hp? }] }.
 */
export const EQUIPAMENTOS = Object.freeze(Object.fromEntries(EQUIPAMENTOS_ORIGINAL.map((o) => [`e${o.id}`, converterItem(o)])));
/** As chaves na ordem do catálogo. */
export const ORDEM_EQUIP = Object.keys(EQUIPAMENTOS);

/** O equipamento desta chave, ou null (chave que não é string ou não existe). */
export function equipamento(chave) {
  return typeof chave === 'string' && Object.hasOwn(EQUIPAMENTOS, chave) ? EQUIPAMENTOS[chave] : null;
}

/** A classe pode usar o item? (Item que não existe: não.) */
export function podeUsar(chave, classe) {
  return !!equipamento(chave)?.classes.includes(classe);
}

/**
 * Equipamentos à venda para a classe (chaves, na ordem do catálogo), de uma categoria
 * ou de todas. Não depende da raça: o original vende os mesmos nas três lojas.
 */
export function equipamentosAVenda(classe, categoria) {
  return ORDEM_EQUIP.filter((k) => EQUIPAMENTOS[k].classes.includes(classe) && (categoria === undefined || EQUIPAMENTOS[k].categoria === categoria));
}

/** Nível válido de item (1 a NIVEL_ITEM_MAX); acima vira o máximo, o resto vira 1. */
export function nivelEquipValido(n) {
  return Number.isInteger(n) && n >= 1 ? Math.min(n, NIVEL_ITEM_MAX) : 1;
}

/** A versão do item no nível (1 a 8), na escala do jogo, ou null se o item não existe. */
export function versaoEquip(chave, nivel = 1) {
  const e = equipamento(chave);
  return e ? e.versoes[nivelEquipValido(nivel) - 1] : null;
}

/** Preço (ouro) de compra do item (a V1), ou null. */
export function precoEquip(chave) {
  return equipamento(chave)?.preco ?? null;
}

/** Preço (ouro) para levar o item do nível `nivel` ao seguinte; null no máximo (V8) ou inválido. */
export function precoEvoluirEquip(chave, nivel) {
  const e = equipamento(chave);
  if (!e || !Number.isInteger(nivel) || nivel < 1 || nivel >= e.versoes.length) return null;
  return e.versoes[nivel].preco;
}

/** Efeitos do item no nível: [{ tipo, tipoDano?, valor }] na escala do jogo ([] se não existe). */
export function efeitosDoEquip(chave, nivel = 1) {
  return versaoEquip(chave, nivel)?.efeitos ?? [];
}

/** Texto curto de um efeito de equipamento para a Loja, o Inventário e o STATUS. */
export function textoEfeitoEquip(ef) {
  const s = (x) => (+x.toFixed(1)).toLocaleString('pt-BR');
  const p = (x) => `${(+(x * 100).toFixed(1)).toLocaleString('pt-BR')}%`;
  const t = ef.tipoDano ? ` ${SIGLA_TIPO[ef.tipoDano]}` : '';
  switch (ef.tipo) {
    case 'hp':
      return `Durabilidade +${s(ef.valor)}`;
    case 'escudo':
      return `Escudo +${s(ef.valor)}`;
    case 'regenEscudo':
      return `Escudo +${s(ef.valor)}/s`;
    case 'energia':
      return `Energia +${s(ef.valor)}`;
    case 'regenEn':
      return `Energia +${s(ef.valor)}/s`;
    case 'regenHp':
      return `Conserto +${s(ef.valor)} HP/s`;
    case 'poder':
      return `Poder${t} +${p(ef.valor)}`;
    case 'recarga':
      return `Recarga${t} ${p(ef.valor)} mais rápida`;
    case 'resist':
      return `Resistência${t} +${p(ef.valor)}`;
    case 'penetra':
      return `Penetração${t}: ignora ${p(ef.valor)} da resistência`;
    case 'critico':
      return `Golpe crítico: ${p(ef.valor)} de chance de dano dobrado`;
    case 'velocidade':
      return `Velocidade +${p(ef.valor)}`;
    case 'aceleracao':
      return `Aceleração +${p(ef.valor)}`;
    default:
      return ef.tipo;
  }
}

/** Nome do tipo de dano por extenso ('Laser'...), para quem precisar além da sigla. */
export function nomeTipoDano(tipoDano) {
  return TIPOS_DANO[tipoDano] ?? null;
}
