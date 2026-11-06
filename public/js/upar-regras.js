// Botões de pôr pontos no painel inferior, como as setas de subir habilidade do LoL
// (pedido do Mateus, 05/nov/2026): com ponto livre, cinco abas saem do topo do painel,
// em cima das barras de HP, EN e NV, uma por atributo (HP, EN, Ph., El., Op., na
// ordem da janela STATUS), e o clique ou as teclas 1 a 5 põem UPAR_QTD pontos de uma
// vez. O pedido é o mesmo da janela ({t:'pontos', atributo, qtd}): o servidor põe o
// que couber e o snapshot traz os pontos novos. Puro e testado (tests/upar.test.mjs).

import { ORDEM_ATRIBUTOS, PONTO_MAX, normalizarPontos, pontosLivres } from '../../shared/status.js';
import { tr } from '../../shared/idioma.js';

/** Quantos pontos cada aba põe por clique (ou tecla). */
export const UPAR_QTD = 10;

/**
 * As cinco abas, na ordem das teclas 1 a 5: o atributo, a sigla na aba, a ação do
 * mapa de atalhos (atalhos-regras.js) e a classe da cor (a dos tipos de dano nos três
 * últimos, como no STATUS).
 */
export const OPCOES_UPAR = Object.freeze([
  { atributo: 'durabilidade', sigla: 'Hp.', acao: 'pontoHp', cor: 'hp', nome: tr('Durabilidade (HP máximo e regeneração de HP)') },
  { atributo: 'energia', sigla: 'En.', acao: 'pontoEn', cor: 'en', nome: tr('Energia (máxima e regeneração)') },
  { atributo: 'fisico', sigla: 'Ph.', acao: 'pontoFis', cor: 'fisico', nome: tr('Físico (dano das armas físicas)') },
  { atributo: 'eletrico', sigla: 'El.', acao: 'pontoEl', cor: 'eletrico', nome: tr('Elétrico (dano das armas elétricas)') },
  { atributo: 'laser', sigla: 'Op.', acao: 'pontoOp', cor: 'laser', nome: tr('Operacional (dano das armas de laser)') },
]);

/**
 * O que as abas mostram agora, do `me` do snapshot e do nível: { livres, abas: [{
 * atributo, sigla, acao, cor, nome, pontos, qtd, cheio }] }. `qtd` é quanto o clique
 * põe (até UPAR_QTD, os livres e o que falta para PONTO_MAX); `cheio` = atributo no
 * máximo (a aba apaga). Sem ponto livre (ou sem `me`), livres = 0: as abas somem.
 */
export function estadoUpar(me, nivel) {
  const pontos = normalizarPontos(me?.pontos);
  const livres = !me ? 0 : Number.isInteger(me.pontosLivres) ? Math.max(0, me.pontosLivres) : pontosLivres(nivel ?? 1, pontos);
  const abas = OPCOES_UPAR.map((o) => {
    const p = pontos[o.atributo];
    const cheio = p >= PONTO_MAX;
    return { ...o, pontos: p, cheio, qtd: cheio ? 0 : Math.min(UPAR_QTD, livres, PONTO_MAX - p) };
  });
  return { livres, abas };
}

/** As abas aparecem? (há ponto livre e algum atributo ainda cabe). */
export function mostraUpar(estado) {
  return estado.livres > 0 && estado.abas.some((a) => a.qtd > 0);
}

/** O pedido de uma aba (null se ela não põe nada). */
export function pedidoUpar(estado, atributo) {
  if (!ORDEM_ATRIBUTOS.includes(atributo)) return null;
  const aba = estado.abas.find((a) => a.atributo === atributo);
  return aba && aba.qtd > 0 ? { t: 'pontos', atributo, qtd: UPAR_QTD } : null;
}
