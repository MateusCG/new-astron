// Onde está o companheiro (pedido do Mateus, 06/nov/2026): o clique num card da barra
// do time (companheiros.js) faz piscar no minimapa um círculo em volta da nave daquele
// piloto, que acompanha a nave enquanto dura. São PING_PULSOS anéis seguidos, cada um
// abrindo de PING_RAIO_MIN a PING_RAIO_MAX px e apagando, em PING_S segundos ao todo;
// um anel fixo marca o lugar do começo ao fim. Puro e testado (tests/ping-mapa.test.mjs);
// o desenho fica em hud.js (Hud#localizar e o minimapa).

/** Quanto tempo o círculo pisca (s). */
export const PING_S = 3;
/** Quantos anéis abrem nesse tempo. */
export const PING_PULSOS = 3;
/** Raio do anel no começo e no fim do pulso (px do minimapa). */
export const PING_RAIO_MIN = 4;
export const PING_RAIO_MAX = 14;

/**
 * Os anéis do ping `t` segundos depois do clique: [{raio, alfa}] (o fixo e o do pulso
 * de agora), ou [] depois de PING_S.
 */
export function aneisDoPing(t) {
  if (!(t >= 0) || t >= PING_S) return [];
  const dur = PING_S / PING_PULSOS;
  const k = (t % dur) / dur; // 0 a 1 dentro do pulso
  const fim = Math.min(1, (PING_S - t) / 0.4); // o anel fixo apaga no último 0,4 s
  return [
    { raio: PING_RAIO_MIN + 2, alfa: 0.9 * fim },
    { raio: PING_RAIO_MIN + (PING_RAIO_MAX - PING_RAIO_MIN) * k, alfa: 1 - k },
  ];
}
