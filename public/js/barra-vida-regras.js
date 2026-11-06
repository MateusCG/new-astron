// Divisórias da barra de vida em cima das naves de jogador, da Medusa e do Núcleo de
// He-3, como no League of Legends (pedido do Mateus, 06/nov/2026): um tracinho a cada
// MARCA_HP de vida máxima nas naves, para ler de longe quantos mil de vida cada um
// tem. Nos chefes (Medusa com 60 mil, Núcleo com ~30 mil) mil daria dezenas de
// tracinhos colados, então a divisória deles é a cada MARCA_CHEFE_HP.
//
// Puro (sem DOM), testado em tests/barra-vida.test.mjs; hud.js põe o resultado na
// variável --passo da barra (o desenho é um gradiente em jogo.css).

/** Vida entre duas divisórias nas naves de jogador. */
export const MARCA_HP = 1000;
/** Vida entre duas divisórias nos chefes (a Medusa e o Núcleo). */
export const MARCA_CHEFE_HP = 10000;

/**
 * As divisórias de uma barra de vida máxima `maxHp` com uma a cada `passoHp`:
 * { passo } em % da largura da barra, ou null sem divisória nenhuma (até `passoHp` de
 * vida, ou vida inválida).
 */
export function marcasDaVida(maxHp, passoHp = MARCA_HP) {
  const max = Number(maxHp);
  if (!Number.isFinite(max) || !(passoHp > 0) || max <= passoHp) return null;
  return { passo: +((passoHp / max) * 100).toFixed(4) };
}
