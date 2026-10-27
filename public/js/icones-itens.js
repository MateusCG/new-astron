// Ícones dos itens como no original: a figura de 64 × 64 de texture/item (a peça
// sobre preto, com a moldura já na cor do tipo de dano) e, da V2 à V8, o número da
// versão no canto de baixo à direita (item_lv2..8). Arquivos em public/texturas/itens
// (tools/icones_do_original.py); qual item usa qual está em shared/ (`icone` da arma
// e do equipamento) e em insumos.js (consumíveis e números). A tela de carregamento
// baixa todos antes da partida (iconesDaNave), então a Loja e o INVENTÁRIO abrem sem
// esperar imagem.
//
// O tamanho é de quem usa: o HTML sai com a classe do lugar (icone-arma,
// icone-equip, icone-consumivel) e o CSS de cada painel diz quantos pixels.

import { PASTA_ICONES_ITENS, iconeVersao } from './insumos.js';

/** URL do ícone pelo nome do original ('aw001', 'xs034', 'sp011', 'item_lv3'). */
export function urlIcone(nome) {
  return `${PASTA_ICONES_ITENS}${nome}.png`;
}

/**
 * HTML do ícone `nome` com o número da versão `nivel` (nenhum na V1) e a classe do
 * lugar. Sem nome: a moldura vazia (encaixe sem item).
 */
export function htmlIcone(nome, nivel = 1, classe = '') {
  if (!nome) return `<span class="icone-item vazio ${classe}" aria-hidden="true"></span>`;
  const v = iconeVersao(nivel);
  return `<span class="icone-item ${classe}" aria-hidden="true"><img src="${urlIcone(nome)}" alt="" draggable="false">${
    v ? `<img class="versao" src="${urlIcone(v)}" alt="" draggable="false">` : ''
  }</span>`;
}

/** Baixa e decodifica um ícone (tela de carregamento); false se falhar. */
export function carregarIcone(nome) {
  const img = new Image();
  img.src = urlIcone(nome);
  return img.decode().then(
    () => true,
    () => false,
  );
}
