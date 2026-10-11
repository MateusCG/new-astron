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
// - Evoluir arma: cada arma possuída (as de fábrica inclusive) sobe do nível 1 até
//   ARMA_NIVEL_MAX, pagando ouro crescente por nível (precoEvoluirArma). O preço é
//   por arma, então evoluir duas armas custa o dobro: quem foca numa chega ao
//   máximo, quem divide fica com duas medianas mas de tipos diferentes (laser,
//   físico, elétrico; dano e controle) para segurar mais gente nos objetivos. Cada
//   nível dá +DANO_POR_NIVEL do dano base e, nas armas de controle, o efeito cresce
//   junto (efeitoDaArma: duração do lento, do EMP e do dreno, força do lento, dano
//   por segundo do dreno, empurrão do choque). Recarga e energia NÃO mudam com o
//   nível: elas entram na predição (stepShip), e o nível fica só no servidor. O
//   id do pedido é 'evoluir:<arma>' (ex.: {t:'comprar', item:'evoluir:crio'}).

import { ARMAS, ARMAS_INICIAIS, WEAPONS } from './sim.js';

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

// Evolução de armas. Para subir o máximo para 10, basta ARMA_NIVEL_MAX (os preços
// e os efeitos crescem pela fórmula; talvez queira baixar DANO_POR_NIVEL junto).
export const ARMA_NIVEL_MAX = 5;
/** Preço para sair do nível n: fração do preço de referência da arma × n. */
export const EVOLUIR_ARMA_FRACAO = 0.4;
/** Preço de referência das armas de fábrica (laser simples e plasma não se vendem). */
export const PRECO_REFERENCIA_FABRICA = 150;
export const DANO_POR_NIVEL = 0.1; // +10% do dano base por nível acima do 1 (todas)
export const EFEITO_POR_NIVEL = 0.125; // +12,5% de duração, dano/s do dreno e empurrão por nível (controle)
export const LENTIDAO_POR_NIVEL = 0.05; // o lento deixa 5 pontos a menos da velocidade por nível
export const LENTIDAO_MIN = 0.25; // fração mínima da velocidade sob lento, em qualquer nível

/** Prefixo do id de evolução de arma na Loja ('evoluir:laser', 'evoluir:crio'...). */
export const PREFIXO_EVOLUIR = 'evoluir:';

/**
 * Preço (ouro) para levar a arma `kind` do nível `nivel` ao seguinte, ou null se
 * ela já está no máximo (ou o nível é inválido). Arredondado para dezena.
 */
export function precoEvoluirArma(kind, nivel) {
  if (!WEAPONS[kind] || !Number.isInteger(nivel) || nivel < 1 || nivel >= ARMA_NIVEL_MAX) return null;
  const ref = PRECO_ARMA[kind] ?? PRECO_REFERENCIA_FABRICA;
  return Math.round((ref * EVOLUIR_ARMA_FRACAO * nivel) / 10) * 10;
}

/** Nível válido (1 a ARMA_NIVEL_MAX); qualquer outra coisa vira 1. */
function nivelValido(nivel) {
  return Number.isInteger(nivel) && nivel >= 1 ? Math.min(nivel, ARMA_NIVEL_MAX) : 1;
}

/** Multiplicador do dano base da arma no nível (1 no nível 1). */
export function danoMultNivel(nivel) {
  return 1 + DANO_POR_NIVEL * (nivelValido(nivel) - 1);
}

/** Multiplicador do efeito das armas de controle no nível (1 no nível 1). */
export function efeitoMultNivel(nivel) {
  return 1 + EFEITO_POR_NIVEL * (nivelValido(nivel) - 1);
}

/**
 * O efeito da arma `kind` no nível: o `efeito` de WEAPONS com os números do nível
 * (dreno: dps e duração; lento: mult e duração; emp: duração), e na onda de
 * choque { tipo: 'empurrao', empurrao }. null para arma sem efeito.
 */
export function efeitoDaArma(kind, nivel) {
  const w = WEAPONS[kind];
  const k = efeitoMultNivel(nivel);
  if (w?.tipo === 'choque') return { tipo: 'empurrao', empurrao: w.empurrao * k };
  const e = w?.efeito;
  if (!e) return null;
  if (e.tipo === 'dreno') return { ...e, dps: e.dps * k, duracao: e.duracao * k };
  if (e.tipo === 'lento') {
    const mult = Math.max(LENTIDAO_MIN, e.mult - LENTIDAO_POR_NIVEL * (nivelValido(nivel) - 1));
    return { ...e, mult, duracao: e.duracao * k };
  }
  return { ...e, duracao: e.duracao * k };
}

/** Níveis das armas de um piloto no começo da partida: todas no 1 (índice em ARMAS). */
export function niveisArmasIniciais() {
  return ARMAS.map(() => 1);
}

/**
 * Catálogo da Loja por id: { tipo: 'arma' | 'armadura' | 'item' | 'evoluirArma', ... }.
 * Arma traz `arma` (índice em ARMAS) e `preco`; armadura traz `nivel` (índice em
 * ARMADURAS) e `preco`; evoluirArma traz `arma` e não tem preço fixo (depende do
 * nível atual: precoEvoluirArma).
 */
export const CATALOGO_LOJA = Object.freeze({
  ...Object.fromEntries(ARMAS_A_VENDA.map((i) => [ARMAS[i], { tipo: 'arma', arma: i, preco: PRECO_ARMA[ARMAS[i]] }])),
  ...Object.fromEntries(ARMADURAS.map((a, nivel) => [a.id, { tipo: 'armadura', nivel, preco: a.preco }])),
  ...Object.fromEntries(ORDEM_ITENS.map((id) => [id, { tipo: 'item', item: id, preco: ITENS[id].preco }])),
  ...Object.fromEntries(ARMAS.map((kind, i) => [PREFIXO_EVOLUIR + kind, { tipo: 'evoluirArma', arma: i }])),
});

/** O item da Loja com este id, ou null (id que não é string ou não existe). */
export function itemDaLoja(id) {
  return typeof id === 'string' && Object.hasOwn(CATALOGO_LOJA, id) ? CATALOGO_LOJA[id] : null;
}

/** A armadura do nível (0 a 2), ou null sem armadura (-1 ou qualquer outra coisa). */
export function armadura(nivel) {
  return Number.isInteger(nivel) ? (ARMADURAS[nivel] ?? null) : null;
}
