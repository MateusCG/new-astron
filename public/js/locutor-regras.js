// Anúncios do locutor (puro, sem DOM nem Web Audio: testado no Node). Pedido do Mateus
// (04/nov/2026): como o Double Kill, o First Blood e o Godlike do Dota 2 e do LoL, uma
// faixa grande no meio da tela, um pouco acima do centro, e a voz dizendo a frase, em
// inglês. Todos ouvem todos os anúncios, como no Dota; a cor diz de quem foi (você em
// ouro, seu time em turquesa, o outro em vermelho).
//
// Quem decide é o servidor: o evento 'morte' de abate de jogador traz `primeiro` (First
// Blood: o primeiro abate da partida, a preparação inclusive), `multi` (abates com até
// MULTI_JANELA_S entre um e outro) e `seqPor` (a sequência do matador sem morrer). Aqui só
// se escolhe o texto, a voz e a ordem.
//
// Por enquanto são seis (o Mateus escolheu, 04/nov/2026, com as vozes que gerou no
// ElevenLabs): First Blood; Double Kill e Triple Kill (3 ou mais abates na janela); e a
// sequência sem morrer, 4 Dominating, 5 Unstoppable e 6 ou mais Godlike (a cada abate).
// Num abate que dá vários, sai um depois do outro, na ordem do Dota: First Blood, o
// multi-abate e a sequência. Anúncio novo entra em ANUNCIOS, com a voz em
// public/sons/locutor/ e o nível dela em nivel-sons.js (ALVO_POR_SOM).

import { tr } from '../../shared/idioma.js';

/** Cada anúncio: o texto da faixa (em inglês, como a voz) e o arquivo da voz. */
export const ANUNCIOS = Object.freeze({
  firstBlood: { texto: 'First Blood', som: 'first_blood' },
  doubleKill: { texto: 'Double Kill', som: 'double_kill' },
  tripleKill: { texto: 'Triple Kill', som: 'triple_kill' },
  dominating: { texto: 'Dominating', som: 'dominating' },
  unstoppable: { texto: 'Unstoppable', som: 'unstoppable' },
  godlike: { texto: 'Godlike', som: 'godlike' },
});

/** Multi-abate → anúncio (3 ou mais é Triple Kill). */
export const MULTI = Object.freeze([
  [3, 'tripleKill'],
  [2, 'doubleKill'],
]);

/** Sequência sem morrer → anúncio (6 ou mais é Godlike, a cada abate). */
export const SEQUENCIA = Object.freeze([
  [6, 'godlike'],
  [5, 'unstoppable'],
  [4, 'dominating'],
]);

/**
 * As vozes ficam em public/sons/locutor/, em MP3 (o que o ElevenLabs entrega; o
 * navegador decodifica igual ao WAV). O nome que o Sons recebe já leva a extensão.
 */
export const PASTA_LOCUTOR = 'locutor/';
export const EXTENSAO_LOCUTOR = '.mp3';

/** O nome do som da voz de um anúncio, para o Sons (ex. 'locutor/double_kill.mp3'). */
export function somDoAnuncio(chave) {
  return PASTA_LOCUTOR + ANUNCIOS[chave].som + EXTENSAO_LOCUTOR;
}

/** As vozes de todos os anúncios (a tela de carregamento baixa todas). */
export const SONS_LOCUTOR = Object.freeze(Object.keys(ANUNCIOS).map(somDoAnuncio));

/** Quanto a faixa fica na tela no mínimo (s), e o que sobra depois da voz acabar. */
export const FAIXA_MIN_S = 2;
export const FAIXA_DEPOIS_VOZ_S = 0.5;
/** Anúncio que esperou na fila mais que isto (s) já não vale: sai sem tocar. */
export const FILA_VALIDADE_S = 8;

const primeiroDe = (tabela, n) => tabela.find(([min]) => n >= min)?.[1] ?? null;

/**
 * Os anúncios de um evento 'morte', na ordem em que tocam: [{chave, texto, som, sub,
 * cor}]. `sub` é a linha de baixo, em português, e `cor` é de quem foi o feito
 * ('voce', 'aliado' ou 'inimigo', relativa a quem olha). Vazio se a morte não anuncia
 * nada (monstro, campo de força, abate sem nada de especial).
 * @param {object} e o evento 'morte' do servidor
 * @param {{ meuId: number, meuTime: number, nome: (id: number) => string }} quem olha
 */
export function anunciosDaMorte(e, { meuId, meuTime, nome }) {
  if (!e || e.e !== 'morte' || e.tipo !== 'jogador' || e.por === null || e.por === undefined) return [];
  // Sem fogo amigo: quem abate um jogador é do outro time.
  const timeMatador = e.time === undefined ? null : 1 - e.time;
  const cor = e.por === meuId ? 'voce' : timeMatador === meuTime ? 'aliado' : 'inimigo';
  const matador = e.por === meuId ? tr('Você') : nome(e.por);
  const vitima = e.id === meuId ? tr('você') : nome(e.id);
  const abateu = tr('{matador} abateu {quem}', { matador, quem: vitima });
  const lista = [];
  const por = (chave, sub) => lista.push({ chave, ...ANUNCIOS[chave], som: somDoAnuncio(chave), sub, cor });

  if (e.primeiro) por('firstBlood', abateu);
  const multi = primeiroDe(MULTI, e.multi ?? 0);
  if (multi) por(multi, tr('{matador} · {n} abates seguidos', { matador, n: e.multi }));
  const seq = primeiroDe(SEQUENCIA, e.seqPor ?? 0);
  if (seq) por(seq, tr('{matador} · {n} abates sem morrer', { matador, n: e.seqPor }));
  return lista;
}

/** Quanto tempo (s) a faixa fica na tela, pela duração da voz (0 sem voz). */
export function duracaoDaFaixa(vozS = 0) {
  return Math.max(FAIXA_MIN_S, (vozS > 0 ? vozS : 0) + FAIXA_DEPOIS_VOZ_S);
}
