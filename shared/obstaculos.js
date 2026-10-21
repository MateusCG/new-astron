// Obstáculos sólidos do mapa (construções), compartilhados entre servidor e cliente.
//
// As rochas já são sólidas por heightAt() (shared/terrain.js); as construções ficam
// aqui: a planta de cada uma (posição, tamanho, giro e altura). A física usa para
// colidir nave e tiro, a visão e o desenho usam a MESMA lista. Assim o que se vê é o
// que bate. Decoração baixa e os pilares que descem das plataformas até a água ficam
// sem colisão de propósito: estão abaixo da altura de voo.
//
// Construções:
// - a mineradora de Hélio-3 no centro da lane (MINERADORA em shared/terrain.js):
//   retângulo arredondado mais largo que a lane e alto demais para passar por cima;
// - a torre de cada buff de suporte (BUFFS, `id` 'BS0'/'BS1'), que cai quando
//   destruída e volta depois;
// - as torres sentinela (TORRETAS), que caem e só voltam reconstruídas na Evolução.
// As bases não têm peça sólida: o anel e as plataformas de serviço são áreas de
// pouso (AREAS_POUSO, abaixo da altura de voo) e o portal warp flutua acima de
// PORTAL_WARP.base, alto o bastante para a nave passar por baixo. O Núcleo de He-3
// também não é sólido (flutua no poço; quem decide se colide é a regra dele).
//
// Formas: 'caixa' (retângulo girado em yaw; com `canto`, de cantos arredondados) e
// 'cilindro'. Cada uma tem `topo` (altura absoluta do alto), `grupo` ('mineradora',
// 'buff' ou 'torreta') e, nas torres, `time` e `id`.
//
// Construções que podem sumir têm `id`, e definirObstaculoAtivo(id, false) as tira da
// física (alturaSolida, colisão de nave e de tiro). O estado é do módulo, igual nos
// dois lados: o servidor muda quando a construção cai ou volta, e o cliente aplica o
// que vem no snapshot, para a predição bater com o servidor. A grade de navegação
// dos monstros, montada uma vez, pede alturaSolida(..., todos = true): considera tudo
// sempre de pé.

import {
  heightAt,
  noMapaAberto,
  daBase as daBaseTerreno,
  BASES,
  LANE,
  MINERADORA as PLANTA_MINERADORA,
  TORRETAS,
  BUFFS,
  ABERTO,
} from './terrain.js';

/**
 * Torreta (torre sentinela): torre baixa e grossa, mais alta que a altura de voo (o
 * canhão fica na altura das naves e o tiro de quem passa bate nela).
 */
export const TORRETA = { raio: 4.5, altura: 16 };
/** Torre do buff de suporte (o objetivo é destruí-la). */
export const TORRE_SUPORTE = { raio: 7, altura: 30 };
/**
 * Portal warp de cada base: flutua acima de `base` metros (a nave passa por baixo) e
 * não colide. `lx`/`lz` no referencial da base do time 0 (lane para +x): no fundo do
 * bolsão, virado para a lane. Só referência para o desenho.
 */
export const PORTAL_WARP = { lx: -95, lz: 0, base: 30 };

/** @deprecated Use daBase de shared/terrain.js (é a mesma função). */
export const daBase = daBaseTerreno;

function caixa(nome, extra, x, z, ang, largura, profundidade, altura, chao = heightAt(x, z)) {
  return { nome, ...extra, forma: 'caixa', x, z, chao, ang, meiaLarg: largura / 2, meiaProf: profundidade / 2, topo: chao + altura };
}

function cilindro(nome, extra, x, z, raio, altura) {
  const chao = heightAt(x, z);
  return { nome, ...extra, forma: 'cilindro', x, z, chao, raio, topo: chao + altura };
}

function montar() {
  const lista = [];
  const m = PLANTA_MINERADORA;
  const mineradora = caixa('mineradora', { grupo: 'mineradora' }, m.x, m.z, 0, m.meiaX * 2, m.meiaZ * 2, m.topo);
  mineradora.canto = m.canto;
  lista.push(mineradora);
  for (const b of BUFFS.filter((b) => b.tipo === 'suporte')) {
    lista.push(cilindro('torre-suporte', { grupo: 'buff', time: b.time, id: b.id }, b.x, b.z, TORRE_SUPORTE.raio, TORRE_SUPORTE.altura));
  }
  for (const t of TORRETAS) {
    lista.push(cilindro('torreta', { grupo: 'torreta', time: t.time, id: t.id }, t.x, t.z, TORRETA.raio, TORRETA.altura));
  }
  // Raio que envolve a forma: atalho para descartar rápido o que está longe.
  for (const o of lista) o.alcance = o.forma === 'caixa' ? Math.hypot(o.meiaLarg, o.meiaProf) : o.raio;
  return lista;
}

export const OBSTACULOS = montar();

/**
 * Liga (ativo = true) ou desliga uma construção que pode sumir (a torre de suporte
 * ou a torreta de `id`). Desligada, ela não é mais sólida para nave nem tiro.
 */
export function definirObstaculoAtivo(id, ativo) {
  for (const o of OBSTACULOS) if (o.id === id) o.desligado = !ativo;
}

/** A construção `id` está de pé (sólida)? */
export function obstaculoAtivo(id) {
  return OBSTACULOS.some((o) => o.id === id && !o.desligado);
}

function dentro(o, x, z, folga) {
  const dx = x - o.x;
  const dz = z - o.z;
  if (Math.abs(dx) > o.alcance + folga || Math.abs(dz) > o.alcance + folga) return false;
  if (o.forma === 'cilindro') return Math.hypot(dx, dz) <= o.raio + folga;
  // Leva o ponto para o referencial da caixa (inverso do giro em y do Three.js).
  const c = Math.cos(o.ang);
  const s = Math.sin(o.ang);
  const lx = Math.abs(dx * c - dz * s);
  const lz = Math.abs(dx * s + dz * c);
  if (!o.canto) return lx <= o.meiaLarg + folga && lz <= o.meiaProf + folga;
  // Cantos arredondados: distância com sinal ao retângulo arredondado.
  const qx = lx - (o.meiaLarg - o.canto);
  const qz = lz - (o.meiaProf - o.canto);
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - o.canto <= folga;
}

/**
 * Altura do que é sólido no ponto: o terreno ou o alto de uma construção, o que
 * for maior. `folga` engorda as construções (raio da nave), para a asa não entrar
 * na parede quando o centro da nave ainda está fora. Construção desligada
 * (definirObstaculoAtivo) não conta, a não ser com `todos` = true.
 */
export function alturaSolida(x, z, folga = 0, todos = false) {
  let h = heightAt(x, z);
  for (const o of OBSTACULOS) {
    if (o.topo > h && (todos || !o.desligado) && dentro(o, x, z, folga)) h = o.topo;
  }
  return h;
}

/** Chão aberto em volta do ponto (folga das rochas) e sem construção por perto. */
export function pontoLivre(x, z, folga = 12) {
  for (const [dx, dz] of [[0, 0], [folga, 0], [-folga, 0], [0, folga], [0, -folga]]) {
    if (!noMapaAberto(x + dx, z + dz)) return false;
  }
  return alturaSolida(x, z, folga) === heightAt(x, z);
}

/** Região dos poços (Núcleo e Medusa): dentro das paredes em L, |x| < 344 e |z| > 628. */
export const POCOS = { meiaX: 344, zMin: 628 };

/**
 * Ponto sorteado (com o `rng` de quem chama) na jungle: chão livre, fora das bases
 * (com `folgaBase` além do raio), fora da faixa da lane (com `folgaLane` além da
 * beira) e fora dos poços dos objetivos épicos. É onde nascem os monstros do mundo
 * aberto. `folgaCorredor` é o nome antigo de `folgaLane`.
 */
export function pontoAberto(rng, { folgaBase = 150, folgaLane, folgaCorredor = 60 } = {}) {
  const folga = folgaLane ?? folgaCorredor;
  const mx = ABERTO.jungle.meiaX - 40;
  const mz = ABERTO.jungle.meiaZ - 40;
  for (let t = 0; t < 1000; t++) {
    const x = (rng() * 2 - 1) * mx;
    const z = (rng() * 2 - 1) * mz;
    if (Math.abs(z - LANE.z) < LANE.meiaLargura + folga) continue;
    if (BASES.some((b) => Math.hypot(x - b.x, z - b.z) < b.raio + folgaBase)) continue;
    if (Math.abs(x) < POCOS.meiaX && Math.abs(z) > POCOS.zMin) continue;
    if (pontoLivre(x, z)) return { x, z };
  }
  return { x: -mx / 2, z: mz / 2 };
}
