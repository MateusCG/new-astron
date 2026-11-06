// Histórico da partida (pedido do Mateus, 06/nov/2026): as notícias que passam embaixo
// do placar (hud.noticia: abates, objetivos, minério, compras) somem em 6 s; a ação
// `historico` (N de fábrica, configurável em Configurações → Controles) abre e fecha a
// lista dos últimos HISTORICO_MAX registros no mesmo lugar, do mais novo para o mais
// velho, com há quanto tempo cada um aconteceu. Puro e testado
// (tests/historico.test.mjs); o desenho fica em hud.js.

import { tr } from '../../shared/idioma.js';

/** Quantos registros o histórico guarda e mostra. */
export const HISTORICO_MAX = 10;

/** A lista com o registro `item` ({texto, tipo, t}) na frente, até HISTORICO_MAX. */
export function registrar(lista, item) {
  return [item, ...lista].slice(0, HISTORICO_MAX);
}

/** Há quanto tempo, de `t` a `agora` (ms): "agora", "há 12 s", "há 3 min". */
export function textoIdade(t, agora) {
  const s = Math.max(0, Math.floor((agora - t) / 1000));
  if (s < 2) return tr('agora');
  if (s < 60) return tr('há {n} s', { n: s });
  return tr('há {n} min', { n: Math.floor(s / 60) });
}
