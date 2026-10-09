// Obstáculos sólidos do mapa (construções da base), compartilhados entre servidor e
// cliente.
//
// O terreno já é sólido por heightAt(); as construções não eram, e a nave
// atravessava os hangares. Aqui fica a planta de cada construção (posição, tamanho,
// giro e altura): a física usa para colidir nave e tiro, e o cenário
// (public/js/cena.js) usa a MESMA lista para desenhar. Assim o que se vê é o que
// bate. Decoração baixa (canos, pedras) continua sem colisão de propósito: fica
// abaixo da altura de voo e a nave passa por cima.
//
// Formas: 'caixa' (retângulo girado em yaw, como os hangares) e 'cilindro'.
// Cada uma tem `topo`, a altura absoluta do alto da construção.

import { heightAt, BASE } from './terrain.js';

/** Hangares em volta da plataforma, na metade sul (o norte fica livre para o corredor). */
export const HANGAR = { raio: 92, largura: 30, profundidade: 22, altura: 16, quantidade: 5 };
/** Portal de saída no começo do corredor norte: duas colunas, viga por cima. */
export const PORTAL = { z: BASE.z - 130, vao: 20, colunaLarg: 5, colunaProf: 6, altura: 29 };
/** Torres de antena dos dois lados da base. */
export const ANTENAS = { pontos: [[-58, 40], [58, 40]], raio: 1.6, altura: 40 };

function montar() {
  const lista = [];
  for (let i = 0; i < HANGAR.quantidade; i++) {
    const a = Math.PI * 0.15 + (i / (HANGAR.quantidade - 1)) * Math.PI * 0.7;
    const x = BASE.x + Math.cos(a) * HANGAR.raio;
    const z = BASE.z + Math.sin(a) * HANGAR.raio;
    const chao = heightAt(x, z);
    lista.push({
      nome: 'hangar',
      forma: 'caixa',
      x,
      z,
      chao,
      // Mesmo giro que Object3D.lookAt(base) daria: a frente (+z local) olha a plataforma.
      ang: Math.atan2(BASE.x - x, BASE.z - z),
      meiaLarg: HANGAR.largura / 2,
      meiaProf: HANGAR.profundidade / 2,
      topo: chao + HANGAR.altura,
    });
  }
  const chaoPortal = heightAt(BASE.x, PORTAL.z);
  for (const lado of [-1, 1]) {
    lista.push({
      nome: 'coluna-portal',
      forma: 'caixa',
      x: BASE.x + lado * PORTAL.vao,
      z: PORTAL.z,
      chao: chaoPortal,
      ang: 0,
      meiaLarg: PORTAL.colunaLarg / 2,
      meiaProf: PORTAL.colunaProf / 2,
      topo: chaoPortal + PORTAL.altura,
    });
  }
  for (const [dx, dz] of ANTENAS.pontos) {
    const x = BASE.x + dx;
    const z = BASE.z + dz;
    const chao = heightAt(x, z);
    lista.push({ nome: 'antena', forma: 'cilindro', x, z, chao, raio: ANTENAS.raio, topo: chao + ANTENAS.altura });
  }
  // Raio que envolve a forma: atalho para descartar rápido o que está longe.
  for (const o of lista) o.alcance = o.forma === 'caixa' ? Math.hypot(o.meiaLarg, o.meiaProf) : o.raio;
  return lista;
}

export const OBSTACULOS = montar();

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
 * na parede quando o centro da nave ainda está fora.
 */
export function alturaSolida(x, z, folga = 0) {
  let h = heightAt(x, z);
  for (const o of OBSTACULOS) {
    if (o.topo > h && dentro(o, x, z, folga)) h = o.topo;
  }
  return h;
}
