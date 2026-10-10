// Armas que o servidor resolve além do projétil reto (só no servidor): a curva do
// míssil teleguiado, as minas e a onda de choque. Os números ficam em shared/sim.js
// (WEAPONS e as constantes MISSIL_*, MINA_*, CHOQUE_*), junto com as outras armas,
// porque o menu do cliente também os mostra.
//
// Aqui só a geometria e o estado, em funções puras: quem fere, empurra, dá XP e
// respeita zona segura e fogo amigo é o World (server/game.js), pelo mesmo #ferir
// de qualquer tiro. Quem é inimigo de quem também é decidido lá (#podeAcertar).
//
// - Míssil: a cada passo, escolhe o inimigo mais perto que esteja à frente do
//   míssil (cone de ±guiado.cone rad em volta do rumo dele) e até guiado.alcance m,
//   e gira o rumo no máximo guiado.giro rad/s na direção dele, sem mudar a
//   velocidade no plano. A altura acompanha a do alvo, para não passar por cima.
//   Fora do cone, segue reto: dá para escapar virando forte.
// - Mina: nasce parada no chão atrás da nave; arma em armaS s e vence em vidaS s.
// - Área (mina e choque): conta a distância no plano, com até AREA_ALTURA m de
//   diferença de altura, e soma o raio do alvo (monstro grande pega de mais longe).

import { WEAPONS, DT, HOVER, AREA_ALTURA, SHIP_RADIUS, forward } from '../shared/sim.js';
import { heightAt } from '../shared/terrain.js';

const VEL_SUBIDA_MISSIL = 30; // m/s máximos de subida/descida acompanhando o alvo

function anguloEntre(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

/**
 * Alvo do míssil `b` entre os `candidatos` (entidades com `ship`, já filtradas pelo
 * fogo amigo): o mais perto dentro do cone e do alcance, ou null.
 */
export function alvoDoMissil(b, candidatos) {
  const g = WEAPONS[b.kind].guiado;
  const rumo = Math.atan2(b.vx, b.vz);
  let melhor = null;
  let dist = g.alcance;
  for (const c of candidatos) {
    const dx = c.ship.x - b.x;
    const dz = c.ship.z - b.z;
    const d = Math.hypot(dx, dz);
    if (d >= dist || d < 1e-6) continue;
    if (Math.abs(anguloEntre(rumo, Math.atan2(dx, dz))) > g.cone) continue;
    dist = d;
    melhor = c;
  }
  return melhor;
}

/**
 * Um passo de curva do míssil na direção do alvo (entidade com `ship`, ou null para
 * seguir reto). Mantém a velocidade no plano; gira no máximo guiado.giro × dt.
 */
export function guiarMissil(b, alvo, dt = DT) {
  if (!alvo) {
    b.vy = 0;
    return;
  }
  const g = WEAPONS[b.kind].guiado;
  const vel = Math.hypot(b.vx, b.vz);
  const rumo = Math.atan2(b.vx, b.vz);
  const quer = Math.atan2(alvo.ship.x - b.x, alvo.ship.z - b.z);
  const giro = Math.max(-g.giro * dt, Math.min(g.giro * dt, anguloEntre(rumo, quer)));
  const novo = rumo + giro;
  b.vx = Math.sin(novo) * vel;
  b.vz = Math.cos(novo) * vel;
  b.vy = Math.max(-VEL_SUBIDA_MISSIL, Math.min(VEL_SUBIDA_MISSIL, (alvo.ship.y - b.y) * 3));
}

/** Mina nova solta pela entidade `ent` (com `ship`), parada no chão atrás da nave. */
export function novaMina(id, ent, tick) {
  const w = WEAPONS.mina;
  const s = ent.ship;
  const f = forward(s.yaw);
  const x = s.x - f.x * w.atras;
  const z = s.z - f.z * w.atras;
  return {
    id,
    dono: ent.id,
    time: ent.time,
    drone: !!ent.drone,
    x,
    z,
    y: Math.max(heightAt(x, z), s.y - HOVER), // no chão (ou na plataforma) embaixo da nave
    armaTick: tick + Math.round(w.armaS / DT),
    fimTick: tick + Math.round(w.vidaS / DT),
  };
}

/**
 * A nave de `ent` está a `raio` m do ponto (x, y, z)? No plano, com folga de
 * AREA_ALTURA na altura e somando o raio da nave (os elites são maiores).
 */
export function naArea(ent, x, y, z, raio) {
  const s = ent.ship;
  if (Math.abs(s.y - y) > AREA_ALTURA + (s.raio ?? SHIP_RADIUS)) return false;
  return Math.hypot(s.x - x, s.z - z) <= raio + (s.raio ?? SHIP_RADIUS);
}
