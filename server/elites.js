// Monstros elite (só no servidor): o Krakor do mundo aberto e o guardião da arena
// de cada objetivo C. São mais fortes, maiores e mais raros que o Arnosh e o Vorax,
// e dão bem mais XP e ouro (RECOMPENSA em server/progressao.js).
//
// Os dois usam a mesma IA, territorial: cada elite tem um covil e não sai de perto
// dele (`territorio`, raio em metros). Sem ninguém por perto, patrulha devagar
// entre pontos sorteados do território. Quando um jogador entra na visão (fora da
// zona segura), vira para ele, vai atrás até a borda do território e cospe plasma
// (tiro inimigo, vermelho no cliente) mirando onde o jogador vai estar. Não
// perseguem para fora do território: dá para fugir e voltar.
//
// - Krakor: besta grande e lenta (mais lenta que qualquer nave), com casco
//   grosso. N_KRAKOR deles no mapa, cada um num covil longe das bases e do
//   corredor; ao morrer renasce depois de KRAKOR.renascerS, num covil novo longe
//   dos jogadores.
// - Guardião: um por objetivo C, preso na arena (território menor que ARENA_C).
//   Muito HP, atira um leque de três. Derrotá-lo toma o objetivo C
//   (server/objetivos.js), e ele só volta depois da recarga do objetivo.
//
// Onde não entram: nas bases (zona segura e uma folga) nem na faixa do corredor
// dos mineradores. O covil do Krakor já nasce longe dos dois, o ponto de patrulha
// nunca cai neles e, se um elite estiver dentro, volta para o covil. Quem está no
// corredor ainda pode levar tiro de um Krakor na beira dele (a faixa é dos
// mineradores, não um esconderijo).

import { RACES, VEL_FATOR, createShip, DT } from '../shared/sim.js';
import { BASES, CORREDOR, ARENA_C, noMapaAberto } from '../shared/terrain.js';

/** Elite do mundo aberto. */
export const KRAKOR = {
  nome: 'Krakor',
  raca: 'bellico', // só para a física (stepShip)
  hp: 450,
  raio: 8, // m, para o tiro acertar o bicho grande (bulletHits)
  velocidade: 24, // m/s
  visao: 230,
  alcanceTiro: 210,
  intervaloS: 1.8,
  danoMult: 0.6, // sobre o dano do plasma (42): ~25 por cuspe
  territorio: 260,
  renascerS: 30,
  folgaBase: 300, // m além do raio da base onde o covil não nasce
  folgaCorredor: 180, // m além da beira do corredor onde o covil não nasce
};
/** Guardião da arena dos objetivos C. */
export const GUARDIAO = {
  nome: 'Guardião',
  raca: 'bellico',
  hp: 1500,
  raio: 10,
  velocidade: 16,
  visao: 420,
  alcanceTiro: 380,
  intervaloS: 1.6,
  danoMult: 0.5, // ~21 por projétil
  leque: [0.12, 0, -0.12], // rad: três projéteis por disparo
  territorio: ARENA_C - 15,
};
export const N_KRAKOR = 4;
const ELITE_PERTO = 70; // m: mais perto que isso do alvo, para de avançar e só atira
const ELITE_MIRA_MAX = 0.7; // rad: só atira com o alvo nesse cone à frente
const ELITE_PATRULHA_TROCA_TICKS = 8 / DT;
const ELITE_PRESO_TICKS = 1.5 / DT;
const ELITE_RE_TICKS = 0.8 / DT;
const FOLGA_PROIBIDA_BASE = 80; // m além da zona segura
const FOLGA_PROIBIDA_CORREDOR = 30; // m além da beira do corredor
const VEL_PLASMA = 190; // m/s, para mirar adiantado (WEAPONS.plasma.vel)

function anguloEntre(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

/** Ponto onde elite não entra: bases (com folga) e a faixa do corredor. */
export function proibidoParaElite(x, z, zonaSegura) {
  if (Math.abs(x - CORREDOR.x) < CORREDOR.largura / 2 + FOLGA_PROIBIDA_CORREDOR) return true;
  return BASES.some((b) => Math.hypot(x - b.x, z - b.z) < zonaSegura + FOLGA_PROIBIDA_BASE);
}

/** Nave nova do elite no ponto, com o HP e o raio do tipo. */
function naveElite(cfg, x, z, yaw) {
  const ship = createShip(cfg.raca, x, z, yaw);
  ship.hp = ship.maxHp = cfg.hp;
  ship.raio = cfg.raio;
  return ship;
}

/**
 * Elite novo ('krakor' ou 'guardiao') com covil em (x, z). `extra` completa a
 * entidade (o guardião leva o id do objetivo e o tempo de renascer dele).
 */
export function novaElite(tipo, id, x, z, yaw = 0, extra = {}) {
  const cfg = tipo === 'guardiao' ? GUARDIAO : KRAKOR;
  return {
    id,
    tipo,
    drone: true, // inimigo: o cliente pinta de vermelho e tiro de inimigo não o acerta
    elite: true,
    nome: cfg.nome,
    cfg,
    ship: naveElite(cfg, x, z, yaw),
    vivo: true,
    respawnTick: 0,
    renascerTicks: Math.round((cfg.renascerS ?? 30) / DT),
    ultimoDano: 0,
    ultimoTiro: -Infinity,
    danoMult: cfg.danoMult,
    covil: { x, z },
    patrulha: null,
    trocaPatrulha: 0,
    preso: 0,
    re: 0,
    giro: 1,
    ...extra,
  };
}

/** Renasce o elite com covil em (x, z), HP cheio. */
export function renascerElite(e, x, z, yaw = 0) {
  e.ship = naveElite(e.cfg, x, z, yaw);
  e.covil = { x, z };
  e.patrulha = null;
  e.preso = e.re = 0;
}

/** Sorteia um ponto de patrulha no território, em chão aberto e fora do proibido. */
function pontoPatrulha(e, rng, zonaSegura) {
  for (let t = 0; t < 12; t++) {
    const a = rng() * Math.PI * 2;
    const r = Math.sqrt(rng()) * e.cfg.territorio;
    const x = e.covil.x + Math.cos(a) * r;
    const z = e.covil.z + Math.sin(a) * r;
    if (noMapaAberto(x, z) && !proibidoParaElite(x, z, zonaSegura)) return { x, z };
  }
  return { ...e.covil };
}

/**
 * Um passo da IA do elite. Devolve { inp, disparos }: o comando para stepShip e os
 * projéteis do cuspe ([{ kind, off, ang }], como stepShip devolve), que quem chama
 * cria com createBullet.
 * @param {object} e elite (novaElite)
 * @param {{ tick: number, rng: () => number, jogadores: Iterable<object>, naZonaSegura: (s: object) => boolean, zonaSegura: number }} ctx
 */
export function iaElite(e, ctx) {
  const { tick, rng, jogadores, naZonaSegura, zonaSegura } = ctx;
  const s = e.ship;
  const cfg = e.cfg;
  const thMax = Math.min(1, cfg.velocidade / (RACES[s.race].velocidade * VEL_FATOR));
  const disparos = [];
  const parado = { th: 0, tu: 0, b: false, f1: false, f2: false };
  if (e.re > 0) {
    // Preso numa quina: dá ré virando, e depois tenta de novo.
    e.re--;
    return { inp: { ...parado, th: -0.6, tu: e.giro }, disparos };
  }

  // Alvo: o jogador mais perto na visão, fora da zona segura e não longe demais do
  // covil (o elite não larga o território por ninguém).
  let alvo = null;
  let dist = cfg.visao;
  for (const j of jogadores) {
    if (!j.vivo || naZonaSegura(j.ship)) continue;
    const d = Math.hypot(j.ship.x - s.x, j.ship.z - s.z);
    if (d < dist && Math.hypot(j.ship.x - e.covil.x, j.ship.z - e.covil.z) < cfg.territorio + cfg.visao) {
      dist = d;
      alvo = j;
    }
  }

  let destino = null;
  if (proibidoParaElite(s.x, s.z, zonaSegura) || Math.hypot(s.x - e.covil.x, s.z - e.covil.z) > cfg.territorio + 40) {
    destino = e.covil; // fora de onde pode estar: volta para casa
  } else if (alvo) {
    const a = alvo.ship;
    const dentro = Math.hypot(a.x - e.covil.x, a.z - e.covil.z) < cfg.territorio;
    if (dist > ELITE_PERTO && dentro && !proibidoParaElite(a.x, a.z, zonaSegura)) destino = a;
  } else {
    if (!e.patrulha || tick >= e.trocaPatrulha || Math.hypot(s.x - e.patrulha.x, s.z - e.patrulha.z) < 15) {
      e.patrulha = pontoPatrulha(e, rng, zonaSegura);
      e.trocaPatrulha = tick + ELITE_PATRULHA_TROCA_TICKS;
    }
    destino = e.patrulha;
  }

  const olhar = destino ?? alvo?.ship;
  let th = 0;
  let tu = 0;
  if (olhar) {
    const diff = anguloEntre(s.yaw, Math.atan2(-(olhar.x - s.x), -(olhar.z - s.z)));
    tu = Math.max(-1, Math.min(1, diff * 2.5));
    // Patrulha anda a meia força; curva fechada freia para virar.
    if (destino) th = thMax * (alvo ? 1 : 0.5) * Math.max(0.15, 1 - Math.abs(diff) / 1.6);
  }

  if (th >= thMax * 0.3 && Math.hypot(s.vx, s.vz) < 3) e.preso++;
  else e.preso = 0;
  if (e.preso > ELITE_PRESO_TICKS) {
    e.preso = 0;
    e.re = ELITE_RE_TICKS;
    e.giro = rng() < 0.5 ? 1 : -1;
    e.patrulha = null;
  }

  // Cuspe: mira onde o alvo vai estar quando o plasma chegar.
  if (alvo && dist <= cfg.alcanceTiro && tick - e.ultimoTiro >= cfg.intervaloS / DT) {
    const t = dist / VEL_PLASMA;
    const mx = alvo.ship.x + alvo.ship.vx * t;
    const mz = alvo.ship.z + alvo.ship.vz * t;
    const ang = anguloEntre(s.yaw, Math.atan2(-(mx - s.x), -(mz - s.z)));
    if (Math.abs(ang) < ELITE_MIRA_MAX) {
      e.ultimoTiro = tick;
      for (const l of cfg.leque ?? [0]) disparos.push({ kind: 'plasma', off: 0, ang: ang + l });
    }
  }
  return { inp: { ...parado, th, tu }, disparos };
}
