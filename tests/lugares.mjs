// Lugares do mapa para os testes (não é teste: não casa com *.test.mjs).
//
// CAMPO: ponto da jungle do time 0, fora da zona segura, com campo aberto e livre
// (sem rocha nem construção) por centenas de metros para -z e para +z: é onde os
// testes de combate põem as naves, atirando com yaw 0 (para -z).
export const CAMPO = { x: -950, z: 0 };

/** Yaw de quem sai da base do time `t` olhando para a lane (yaw 0 olha para -z). */
export const rumoLane = (t = 0) => (t === 0 ? -Math.PI / 2 : Math.PI / 2);
