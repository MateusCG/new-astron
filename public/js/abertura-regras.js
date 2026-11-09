// Regras da tela de abertura (abertura.js), puras e testadas no Node
// (tests/abertura.test.mjs): os grupos da barra com o peso de cada um, a conta da
// porcentagem, o texto do que está carregando e as dicas que passam no canto.
//
// A tela de abertura é a primeira coisa do site: o nome do jogo sobre a arte das
// naves, a barra e o botão JOGAR, que só acende com tudo o que o menu mostra já no
// navegador (insumosDoMenu em insumos.js). Falha de rede num arquivo conta como feito
// (o menu tenta de novo quando precisar): a abertura nunca prende o piloto.

import { tr } from '../../shared/idioma.js';

/** A arte de fundo (a imagem estática das naves; LISTA.md da pasta diz de onde veio). */
export const ARTE_ABERTURA = '/imagens/abertura.jpg';

/**
 * Grupos da barra, na ordem em que carregam. `peso` é a parte da barra de cada um,
 * mais ou menos pelo tempo: as 45 naves são o grosso do download (~7 MB), as
 * miniaturas são um desenho cada na vitrine, a placa de vídeo compila os shaders das
 * naves e da propulsão, e os sons e os ícones são pequenos.
 */
export const GRUPOS_ABERTURA = Object.freeze([
  { id: 'naves', nome: tr('Naves'), curto: tr('Naves'), peso: 55 },
  { id: 'hangar', nome: 'Hangar', curto: tr('Miniaturas do hangar'), peso: 25 },
  { id: 'audio', nome: tr('Áudio'), curto: tr('Sons'), peso: 12 },
  { id: 'interface', nome: 'Interface', curto: tr('Ícones e placa de vídeo'), peso: 8 },
]);

/** Fração da barra (0 a 1) pelos grupos: { id: { feitos, total } }. Grupo sem total ainda conta zero. */
export function fracaoAbertura(estado) {
  let soma = 0;
  let feito = 0;
  for (const g of GRUPOS_ABERTURA) {
    soma += g.peso;
    const e = estado[g.id];
    if (e?.total > 0) feito += g.peso * Math.min(1, e.feitos / e.total);
  }
  return soma ? feito / soma : 0;
}

/** Porcentagem inteira da barra; 100 só com tudo pronto (o arredondamento não acende o JOGAR antes). */
export function pctAbertura(estado) {
  const f = fracaoAbertura(estado);
  return f >= 1 ? 100 : Math.min(99, Math.floor(f * 100));
}

/** Grupo pronto: todos os itens feitos (com ou sem falha). */
export function grupoPronto(e) {
  return !!e && e.total > 0 && e.feitos >= e.total;
}

/** Tudo pronto: o JOGAR acende. */
export function aberturaPronta(estado) {
  return GRUPOS_ABERTURA.every((g) => grupoPronto(estado[g.id]));
}

/** Linha de cima da barra: o primeiro grupo que falta, ou "pronto". */
export function textoAbertura(estado) {
  const g = GRUPOS_ABERTURA.find((x) => !grupoPronto(estado[x.id]));
  if (!g) return tr('Hangar pronto');
  const e = estado[g.id];
  return e?.total ? tr('Carregando · {g} {feitos}/{total}', { g: g.curto, feitos: e.feitos, total: e.total }) : tr('Carregando · {g}…', { g: g.curto });
}

/**
 * Dicas do canto, uma por vez (trocam a cada DICA_S). Curtas, uma regra do jogo cada,
 * com a tecla entre <kbd>: o que o piloto mais precisa saber antes da primeira partida.
 */
export const DICAS_ABERTURA = Object.freeze([
  tr('Vence quem tiver mais minério de He-3 na bacia da base no fim dos 20 minutos.'),
  tr('Pouse com <kbd>L</kbd> na plataforma da Loja ou da Evolução da sua base para abrir o painel.'),
  tr('Segure <kbd>TAB</kbd> para ver a tabela da partida sem parar de voar.'),
  tr('<kbd>Q</kbd> e <kbd>E</kbd> trocam a arma do <kbd>Z</kbd> e do <kbd>X</kbd> pela guardada no inventário.'),
  tr('Nave inimiga que encosta no campo de força da sua base é destruída na hora.'),
  tr('O Núcleo de He-3 não ataca, mas devolve parte do dano: chame o time antes de bater.'),
  tr('Abata os mineradores do outro time antes que eles despejem a carga.'),
  tr('A cada nível você ganha 10 pontos: abra o STATUS com <kbd>C</kbd> e ponha em HP, energia ou no poder das armas.'),
  tr('Nuvens de gás escondem quem está dentro: boas para emboscar e para fugir.'),
  tr('Morreu? Aperte <kbd>H</kbd> para ver quem te derrubou e com que tipo de dano.'),
]);

/** Segundos de cada dica no canto. */
export const DICA_S = 7;

/** A dica depois da `i` (dá a volta na lista). */
export function proximaDica(i) {
  return (i + 1) % DICAS_ABERTURA.length;
}

/** Onde a abertura pede a versão do build (server/versao.js). */
export const ROTA_VERSAO = '/api/versao';

/**
 * O texto da versão no canto da abertura: "Versão 0.1.0 · build 85825d3", só o número
 * sem commit, só o build sem número, e '' sem nenhum (o canto fica vazio).
 * @param {{ versao?: string|null, commit?: string|null }|null} v a resposta de ROTA_VERSAO
 */
export function textoVersao(v) {
  const partes = [];
  if (typeof v?.versao === 'string' && v.versao) partes.push(tr('Versão {versao}', { versao: v.versao }));
  if (typeof v?.commit === 'string' && v.commit) partes.push(`build ${v.commit}`);
  return partes.join(' · ');
}
