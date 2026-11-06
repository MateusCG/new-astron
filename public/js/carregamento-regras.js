// Regras da tela de carregamento da partida (carregamento.js), puras e testadas no
// Node (tests/carregamento-tela.test.mjs): a arte de fundo, o mapa da partida, os
// grupos da barra com o peso de cada um, a conta da porcentagem e o texto do que está
// carregando.
//
// A tela segue a tela de abertura (abertura-regras.js): a arte em tela cheia (aqui, o
// mapa em que se vai jogar), o nome do jogo no alto à esquerda, a barra embaixo com
// os grupos e as dicas no canto. Sem botão: quando tudo termina, a partida começa
// sozinha (main.js). Falha de rede num arquivo conta como feito (o jogo tenta de novo
// sob demanda): a tela nunca prende o piloto.

import { tr } from '../../shared/idioma.js';

/** A arte de fundo: o lago de Hélio-3 visto do alto (LISTA.md da pasta diz de onde veio). */
export const ARTE_CARREGAMENTO = '/imagens/carregamento.jpg';

/** O mapa da partida (um só por enquanto), como o nome do mapa na tela de carregamento dos MOBAs. */
export const MAPA_DA_PARTIDA = Object.freeze({
  nome: tr('Lago de Hélio-3'),
  linha: tr('3 contra 3 · 20 minutos · vence quem tiver mais minério'),
});

/**
 * Grupos da barra, na ordem em que carregam. `nome` é o do chip, `curto` o da linha
 * de cima ("Carregando · Naves 12/48") e `peso` a parte da barra, mais ou menos pelo
 * tamanho (naves ~7 MB, armas ~3,7 MB, sons ~4,2 MB e a decodificação, efeitos
 * ~1,4 MB, monstros ~1,2 MB, mapa ~0,9 MB) e pelo tempo da placa de vídeo.
 */
export const GRUPOS_CARREGAMENTO = Object.freeze([
  { id: 'mapa', nome: tr('Cenário'), curto: tr('Cenário'), titulo: tr('O lago de Hélio-3: rochas, mineradora, bases e água'), peso: 5 },
  { id: 'monstros', nome: tr('Monstros'), curto: tr('Monstros'), titulo: tr('Os monstros da jungle'), peso: 6 },
  { id: 'naves', nome: tr('Naves'), curto: tr('Naves'), titulo: tr('As naves de todas as raças e classes, com a propulsão'), peso: 28 },
  { id: 'armas', nome: tr('Armas'), curto: tr('Armas'), titulo: tr('Os modelos das armas na asa, de todas'), peso: 15 },
  { id: 'efeitos', nome: tr('Efeitos'), curto: tr('Efeitos'), titulo: tr('Os efeitos das armas, de V1 a V8'), peso: 7 },
  { id: 'sons', nome: tr('Sons'), curto: tr('Sons'), titulo: tr('Os sons das armas, da interface e do locutor'), peso: 20 },
  { id: 'miniaturas', nome: tr('Miniaturas'), curto: tr('Miniaturas'), titulo: tr('As miniaturas da linha de naves na Evolução'), peso: 3 },
  { id: 'icones', nome: tr('Ícones'), curto: tr('Ícones'), titulo: tr('Os ícones da Loja e do inventário'), peso: 1 },
  { id: 'servidor', nome: tr('Servidor'), curto: tr('Conectando ao servidor'), titulo: tr('A conexão com a partida'), peso: 3 },
  { id: 'gpu', nome: tr('Placa de vídeo'), curto: tr('Preparando a placa de vídeo'), titulo: tr('Shaders, texturas e modelos na placa de vídeo'), peso: 13 },
]);

/** Grupo pronto: todos os itens feitos (com ou sem falha). */
export function grupoCarregado(e) {
  return !!e && e.total > 0 && e.feitos >= e.total;
}

/**
 * Fração da barra (0 a 1) pelos grupos ativos: { id: { feitos, total, ativa? } }.
 * Grupo sem total ainda conta zero; grupo com `ativa: false` fica fora da conta.
 */
export function fracaoCarregamento(estado) {
  let soma = 0;
  let feito = 0;
  for (const g of GRUPOS_CARREGAMENTO) {
    const e = estado[g.id];
    if (e?.ativa === false) continue;
    soma += g.peso;
    if (e?.total > 0) feito += g.peso * Math.min(1, e.feitos / e.total);
  }
  return soma ? feito / soma : 0;
}

/** Porcentagem inteira; 100 só com tudo pronto (o arredondamento não diz "100%" com a placa ainda trabalhando). */
export function pctCarregamento(estado) {
  const f = fracaoCarregamento(estado);
  return f >= 1 ? 100 : Math.min(99, Math.floor(f * 100));
}

/** A linha embaixo da barra: o primeiro grupo que falta, ou "decolando". */
export function textoCarregamento(estado) {
  const g = GRUPOS_CARREGAMENTO.find((x) => estado[x.id]?.ativa !== false && !grupoCarregado(estado[x.id]));
  if (!g) return tr('Pronto · decolando');
  const e = estado[g.id];
  if (g.id === 'servidor' || g.id === 'gpu') return `${g.curto}…`;
  return e?.total ? tr('Carregando · {g} {feitos}/{total}', { g: g.curto, feitos: e.feitos, total: e.total }) : tr('Carregando · {g}…', { g: g.curto });
}
