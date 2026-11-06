// Divisórias da barra de vida em cima das naves de jogador, da Medusa e do Núcleo de
// He-3, como no League of Legends (pedido do Mateus, 06/nov/2026): um tracinho a cada
// MARCA_HP de vida máxima, para ler de longe quantos mil de vida cada um tem. Nas
// barras grandes (Medusa com 60 mil, Núcleo com ~30 mil) os tracinhos ficam juntos,
// então a cada MARCA_GROSSA_HP vai um mais grosso, para dar para contar.
//
// Puro (sem DOM), testado em tests/barra-vida.test.mjs; hud.js põe o resultado nas
// variáveis --passo e --grossa da barra (o desenho é um gradiente em jogo.css).

/** Vida entre duas divisórias. */
export const MARCA_HP = 1000;
/** Vida entre duas divisórias grossas (só aparecem com a vida máxima acima disto). */
export const MARCA_GROSSA_HP = 10000;

/**
 * As divisórias de uma barra de vida máxima `maxHp`: { passo, grossa } em % da largura
 * da barra (grossa null abaixo de MARCA_GROSSA_HP), ou null sem divisória nenhuma
 * (até MARCA_HP de vida, ou vida inválida).
 */
export function marcasDaVida(maxHp) {
  const max = Number(maxHp);
  if (!Number.isFinite(max) || max <= MARCA_HP) return null;
  const pct = (v) => +((v / max) * 100).toFixed(4);
  return { passo: pct(MARCA_HP), grossa: max > MARCA_GROSSA_HP ? pct(MARCA_GROSSA_HP) : null };
}
