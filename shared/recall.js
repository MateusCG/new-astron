// Recall ("voltar à base"): a Loja e a Evolução só abrem na base, a ~700 m do
// minério; o recall põe a compra no ritmo da partida, como num MOBA. O piloto
// aperta B, canaliza por RECALL_S quase parado e, se nada interromper, a nave
// aparece na base do próprio time (onde renasce), com a vida, a energia, o nível e
// o equipamento que tinha.
//
// Quem decide é só o servidor (server/game.js): o pedido vai no comando `in` (campo
// r, um pulso de um passo, como o L do pouso), então começa e cancela na ordem dos
// comandos, no mesmo passo em que o tiro ou o boost aconteceriam. A canalização cai
// se a nave levar dano, apertar um gatilho, der boost, passar de RECALL_VEL_MAX,
// morrer ou se B for apertado de novo. Pousada pode (parada é o caso ideal); dentro
// da zona segura da própria base não começa (já está lá).
//
// Este arquivo fica em shared/ porque o cliente usa os mesmos números (a barra do
// HUD corre com RECALL_S entre um snapshot e outro). Sem relógio nem aleatoriedade.

export const RECALL_S = 6; // s de canalização
// m/s no plano: "quase parado". Soltando o acelerador a nave cai de ~65 m/s para
// isso em ~1 s, então dá para frear e apertar B logo em seguida; girar no lugar não
// conta (só a velocidade).
export const RECALL_VEL_MAX = 8;

/**
 * Motivo para a canalização não seguir depois de aplicar o comando `inp` na nave `s`
 * (ou para nem começar): 'tiro', 'boost' ou 'velocidade'; null se pode seguir.
 * Gatilho apertado conta como tiro mesmo sem sair bala (recarga, EMP, pousado): a
 * regra é "mãos fora do gatilho", simples de entender.
 */
export function motivoRecall(inp, s) {
  if (inp.f1 || inp.f2) return 'tiro';
  if (inp.b) return 'boost';
  if (Math.hypot(s.vx, s.vz) > RECALL_VEL_MAX) return 'velocidade';
  return null;
}
