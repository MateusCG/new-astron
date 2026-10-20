// Geometria das armas que o servidor resolve além do projétil reto (só no servidor,
// funções puras): a curva do teleguiado, a escolha do alvo da mira, o projétil que
// nasce de outro (subprojétil), a mina e a área. Os números vêm do golpe da versão
// da arma (shared/armas.js); quem fere, empurra, dá XP e respeita zona segura e
// fogo amigo é o World (server/game.js) pelo server/golpes.js.
//
// - Teleguiado: a cada passo, depois de `guia.comeca` s de voo, gira o rumo no
//   máximo `guia.giro` rad/s na direção do alvo, sem mudar a velocidade no plano. O
//   alvo é o travado pela mira no disparo (se ainda vivo) ou, sem trava, o inimigo
//   mais perto num cone de ±guia.cone rad à frente do míssil até guia.alcance m.
//   A altura acompanha a do alvo, para não passar por cima. Fora do cone, segue
//   reto: dá para escapar virando forte.
// - Mira: no disparo, o alvo pelo modo do original: 'alvo_a_frente' (o de menor
//   desvio do nariz num cone de MIRA_CONE), 'mais_perto_no_raio' e
//   'aleatorio_no_raio' (sem sorte: o índice sai do tick e do id do tiro).
// - Área: distância no plano, com até AREA_ALTURA m de diferença de altura, e
//   somando o raio do alvo (monstro grande pega de mais longe).

import { DT, HOVER, AREA_ALTURA, SHIP_RADIUS, forward } from '../shared/sim.js';
import { MIRA_CONE } from '../shared/armas.js';
import { heightAt } from '../shared/terrain.js';

const VEL_SUBIDA_MISSIL = 30; // m/s máximos de subida/descida acompanhando o alvo

export function anguloEntre(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

/** Yaw (convenção do jogo: 0 olha para -z) de quem vai de (x, z) para (ax, az). */
export function yawPara(x, z, ax, az) {
  return Math.atan2(-(ax - x), -(az - z));
}

/**
 * Alvo do teleguiado `b` sem trava, entre os `candidatos` (entidades com `ship`, já
 * filtradas pelo fogo amigo): o mais perto dentro do cone e do alcance, ou null.
 */
export function alvoDoMissil(b, candidatos, guia) {
  const rumo = Math.atan2(b.vx, b.vz);
  let melhor = null;
  let dist = guia.alcance;
  for (const c of candidatos) {
    const dx = c.ship.x - b.x;
    const dz = c.ship.z - b.z;
    const d = Math.hypot(dx, dz);
    if (d >= dist || d < 1e-6) continue;
    if (Math.abs(anguloEntre(rumo, Math.atan2(dx, dz))) > guia.cone) continue;
    dist = d;
    melhor = c;
  }
  return melhor;
}

/**
 * Um passo de curva do teleguiado na direção do alvo (entidade com `ship`, ou null
 * para seguir reto). Mantém a velocidade no plano; gira no máximo guia.giro × dt.
 */
export function guiarMissil(b, alvo, guia, dt = DT) {
  if (!alvo) {
    b.vy = 0;
    return;
  }
  const vel = Math.hypot(b.vx, b.vz);
  const rumo = Math.atan2(b.vx, b.vz);
  const quer = Math.atan2(alvo.ship.x - b.x, alvo.ship.z - b.z);
  const giro = Math.max(-guia.giro * dt, Math.min(guia.giro * dt, anguloEntre(rumo, quer)));
  const novo = rumo + giro;
  b.vx = Math.sin(novo) * vel;
  b.vz = Math.cos(novo) * vel;
  b.vy = Math.max(-VEL_SUBIDA_MISSIL, Math.min(VEL_SUBIDA_MISSIL, (alvo.ship.y - b.y) * 3));
}

/**
 * Alvo da mira de quem atira de (x, z) olhando para `yaw`: pelo modo do original,
 * entre os `candidatos` a até `mira.raio` m. Sem ninguém, null. `semente` (tick +
 * id) decide o "aleatório" sem sorte.
 */
export function escolherAlvo(mira, candidatos, x, z, yaw, semente = 0) {
  const perto = candidatos
    .map((c) => ({ c, d: Math.hypot(c.ship.x - x, c.ship.z - z), desvio: Math.abs(anguloEntre(yaw, yawPara(x, z, c.ship.x, c.ship.z))) }))
    .filter((o) => o.d <= mira.raio && o.d > 1e-6);
  if (!perto.length) return null;
  if (mira.modo === 'alvo_a_frente') {
    const frente = perto.filter((o) => o.desvio <= MIRA_CONE);
    if (!frente.length) return null;
    return frente.reduce((a, o) => (o.desvio < a.desvio ? o : a)).c;
  }
  if (mira.modo === 'aleatorio_no_raio') {
    perto.sort((a, b) => a.c.id - b.c.id);
    return perto[Math.abs(semente) % perto.length].c;
  }
  return perto.reduce((a, o) => (o.d < a.d ? o : a)).c;
}

/**
 * Subprojétil do golpe `g` nascendo em (x, y, z) com rumo `yaw` (o do pai, mais o
 * desvio `ang`), deslocado `off` m para o lado. Não herda a velocidade de ninguém.
 */
export function tiroFilho(g, id, x, y, z, yaw, off = 0, ang = 0) {
  const f = forward(yaw);
  const d = ang ? forward(yaw + ang) : f;
  const vel = g.vel ?? 0;
  const px = x - f.z * off;
  const pz = z + f.x * off;
  return { id, x: px, y, z: pz, px, pz, vx: d.x * vel, vy: 0, vz: d.z * vel, vida: g.vida, raio: g.raio, dano: g.dano, prof: g.prof };
}

/** Altura de uma mina ou campo parado no ponto: no chão (ou na plataforma) embaixo de y. */
export function alturaNoChao(x, z, y) {
  return Math.max(heightAt(x, z), y - HOVER);
}

/**
 * A nave de `ent` está a `raio` m do ponto (x, y, z)? No plano, com folga de
 * AREA_ALTURA na altura e somando o raio da nave (monstro grande pega de mais longe).
 */
export function naArea(ent, x, y, z, raio) {
  const s = ent.ship;
  if (Math.abs(s.y - y) > AREA_ALTURA + (s.raio ?? SHIP_RADIUS)) return false;
  return Math.hypot(s.x - x, s.z - z) <= raio + (s.raio ?? SHIP_RADIUS);
}
