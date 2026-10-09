// Obstáculos sólidos do mapa (construções), compartilhados entre servidor e cliente.
//
// O terreno já é sólido por heightAt(); as construções não eram, e a nave
// atravessava os hangares. Aqui fica a planta de cada construção (posição, tamanho,
// giro e altura): a física usa para colidir nave e tiro, e o cenário
// (public/js/cena.js) usa a MESMA lista para desenhar. Assim o que se vê é o que
// bate. Decoração baixa (canos, pedras, placas no chão) continua sem colisão de
// propósito: fica abaixo da altura de voo e a nave passa por cima.
//
// As duas bases são iguais, uma girada 180° em relação à outra (como o mapa todo):
// a planta é escrita no referencial da base do time 0, com o corredor para o norte
// (-z), e girada para a base do time 1. Cada base tem hangares no fundo, antenas e o
// portal na boca do corredor; o vão do portal e a linha do centro (por onde passam
// os mineradores e ficam as plataformas de serviço) ficam livres.
//
// Fora das bases: os cristais do depósito de minério (o miolo é sólido; a coroa em
// volta fica livre para os mineradores carregarem) e as torres dos objetivos B.
//
// Formas: 'caixa' (retângulo girado em yaw, como os hangares) e 'cilindro'. Cada
// uma tem `topo` (altura absoluta do alto), `grupo` ('base', 'minerio' ou
// 'objetivo') e, nas bases, `time`.
//
// Construção que pode sumir: a torre de cada objetivo B é destruída na partida e
// volta depois da recarga (server/objetivos.js). Ela tem `id` (o do objetivo, 'B1'
// ou 'B2') e definirObstaculoAtivo(id, false) a tira da física (alturaSolida,
// colisão de nave e de tiro). O estado é do módulo, igual nos dois lados: o
// servidor muda quando a torre cai ou volta, e o cliente aplica o que vem no
// snapshot (`obj`), para a predição bater com o servidor. A grade de navegação dos
// monstros, montada uma vez, pede alturaSolida(..., todos = true): considera a
// torre sempre de pé (com ela caída, o monstro só contorna uns 12 m a mais).

import { heightAt, noMapaAberto, BASES, CORREDOR, MINERIO, OBJETIVOS, ARENA_C, MAP_HALF_X, MAP_HALF_Z, MURALHA } from './terrain.js';

/** Hangares em volta da plataforma, no fundo da base (longe do corredor). */
export const HANGAR = { raio: 150, largura: 30, profundidade: 22, altura: 16, quantidade: 5 };
/**
 * Portal na boca do corredor: duas colunas, viga por cima (a nave passa embaixo).
 * `dz` é a distância do centro da base, para o lado do corredor.
 */
export const PORTAL = { dz: 160, vao: 56, colunaLarg: 5, colunaProf: 6, altura: 29 };
/** Torres de antena dos dois lados da base (referencial da base do time 0). */
export const ANTENAS = { pontos: [[-75, 45], [75, 45]], raio: 1.6, altura: 40 };
/** Cristais do depósito de minério: um grande no centro e uma coroa de menores. */
export const CRISTAIS = { centro: { raio: 8, altura: 20 }, coroa: { quantidade: 6, dist: 19, raio: 4.5, altura: 11 } };
/** Torre dos objetivos B (destruí-la vai ser o objetivo). */
export const TORRE_B = { raio: 6, altura: 32 };

/**
 * Leva um ponto do referencial da base do time 0 (centro na origem, corredor para
 * -z) para o mundo, na base `b`. A base do time 1 é a do time 0 girada 180°.
 */
export function daBase(b, lx, lz) {
  const s = b.time === 0 ? 1 : -1;
  return { x: b.x + s * lx, z: b.z + s * lz };
}

function caixa(nome, extra, x, z, ang, largura, profundidade, altura, chao = heightAt(x, z)) {
  return { nome, ...extra, forma: 'caixa', x, z, chao, ang, meiaLarg: largura / 2, meiaProf: profundidade / 2, topo: chao + altura };
}

function cilindro(nome, extra, x, z, raio, altura) {
  const chao = heightAt(x, z);
  return { nome, ...extra, forma: 'cilindro', x, z, chao, raio, topo: chao + altura };
}

function montar() {
  const lista = [];
  for (const b of BASES) {
    const extra = { grupo: 'base', time: b.time };
    const giro = b.time === 0 ? 0 : Math.PI;
    for (let i = 0; i < HANGAR.quantidade; i++) {
      const a = Math.PI * 0.2 + (i / (HANGAR.quantidade - 1)) * Math.PI * 0.6;
      const { x, z } = daBase(b, Math.cos(a) * HANGAR.raio, Math.sin(a) * HANGAR.raio);
      // Mesmo giro que Object3D.lookAt(base) daria: a frente (+z local) olha a plataforma.
      lista.push(caixa('hangar', extra, x, z, Math.atan2(b.x - x, b.z - z), HANGAR.largura, HANGAR.profundidade, HANGAR.altura));
    }
    const boca = daBase(b, 0, -PORTAL.dz);
    const chaoPortal = heightAt(boca.x, boca.z);
    for (const lado of [-1, 1]) {
      const p = daBase(b, lado * PORTAL.vao, -PORTAL.dz);
      lista.push(caixa('coluna-portal', extra, p.x, p.z, giro, PORTAL.colunaLarg, PORTAL.colunaProf, PORTAL.altura, chaoPortal));
    }
    for (const [lx, lz] of ANTENAS.pontos) {
      const p = daBase(b, lx, lz);
      lista.push(cilindro('antena', extra, p.x, p.z, ANTENAS.raio, ANTENAS.altura));
    }
  }
  const min = { grupo: 'minerio' };
  lista.push(cilindro('cristal', min, MINERIO.x, MINERIO.z, CRISTAIS.centro.raio, CRISTAIS.centro.altura));
  const coroa = CRISTAIS.coroa;
  for (let i = 0; i < coroa.quantidade; i++) {
    // Começa no eixo x, para nenhum cristal ficar no eixo do corredor (x = 0).
    const a = (i / coroa.quantidade) * Math.PI * 2;
    const alt = coroa.altura * (0.8 + 0.4 * ((i * 7) % 5) / 4);
    lista.push(cilindro('cristal', min, MINERIO.x + Math.cos(a) * coroa.dist, MINERIO.z + Math.sin(a) * coroa.dist, coroa.raio, alt));
  }
  for (const o of OBJETIVOS.filter((o) => o.tipo === 'B')) {
    lista.push(cilindro('torre-objetivo', { grupo: 'objetivo', objetivo: o.id, id: o.id }, o.x, o.z, TORRE_B.raio, TORRE_B.altura));
  }
  // Raio que envolve a forma: atalho para descartar rápido o que está longe.
  for (const o of lista) o.alcance = o.forma === 'caixa' ? Math.hypot(o.meiaLarg, o.meiaProf) : o.raio;
  return lista;
}

export const OBSTACULOS = montar();

/**
 * Liga (ativo = true) ou desliga uma construção que pode sumir (a torre do objetivo
 * B de `id`). Desligada, ela não é mais sólida para nave nem tiro.
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
  const lx = dx * c - dz * s;
  const lz = dx * s + dz * c;
  return Math.abs(lx) <= o.meiaLarg + folga && Math.abs(lz) <= o.meiaProf + folga;
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

/**
 * Ponto sorteado (com o `rng` de quem chama) no mundo aberto: chão livre, fora das
 * bases (com `folgaBase` além do raio), fora da faixa do corredor e longe dos
 * objetivos. É onde nascem os monstros do mundo aberto.
 */
export function pontoAberto(rng, { folgaBase = 150, folgaCorredor = 60 } = {}) {
  const mx = MAP_HALF_X - MURALHA - 40;
  const mz = MAP_HALF_Z - MURALHA - 40;
  for (let t = 0; t < 1000; t++) {
    const x = (rng() * 2 - 1) * mx;
    const z = (rng() * 2 - 1) * mz;
    if (Math.abs(x - CORREDOR.x) < CORREDOR.largura / 2 + folgaCorredor) continue;
    if (BASES.some((b) => Math.hypot(x - b.x, z - b.z) < b.raio + folgaBase)) continue;
    if (OBJETIVOS.some((o) => Math.hypot(x - o.x, z - o.z) < ARENA_C + 20)) continue;
    if (pontoLivre(x, z)) return { x, z };
  }
  return { x: -mx / 2, z: 0 };
}
