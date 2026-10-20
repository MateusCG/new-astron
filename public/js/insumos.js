// O que cada nave usa dos arquivos do original (modelos, texturas e sons), para a tela
// de carregamento (carregamento.js) baixar tudo ANTES da partida e nada carregar no
// meio dela (trocar de arma, evoluir a arma, comprar a nave seguinte).
//
// Puro: sem Three.js, sem DOM e sem rede, só os catálogos de shared/. Por isso os
// imports são relativos ('../../shared/...'): no navegador eles caem no mesmo
// /shared/armas.js que os outros módulos importam (o mesmo módulo, não uma cópia), e
// no Node os testes conseguem conferir que todo arquivo da lista existe.
//
// As regras de quais texturas um efeito usa moram aqui (efeitos-armas.js importa
// daqui): se o desenho de um efeito passar a usar outra textura, a lista do
// carregamento acompanha sozinha.

import { WEAPONS, ARMAS, armasDisponiveis, visualEfeito } from '../../shared/armas.js';
import { linhaDe } from '../../shared/naves.js';
import { SONS_INTERFACE } from './sons.js';

/** Pasta das texturas dos efeitos de arma do original. */
export const PASTA_TEXTURAS_EFEITO = '/texturas/efeitos/';
/** Pasta dos modelos das armas penduradas na asa. */
export const PASTA_MODELOS_ARMA = '/modelos/armas/';

// Texturas que no original são do casco 3D (opacas), não luz: não servem de efeito aditivo.
export const TEXTURAS_CASCO = new Set(['1321011_01', '1321021_01', 'gun', 'missile', '1351005_01', '1131056']);
// Sequências de quadros do original (o primeiro quadro é o que a lista do efeito cita).
export const SEQUENCIAS = {
  charge_vox00: Array.from({ length: 15 }, (_, i) => `charge_vox${String(i).padStart(2, '0')}`),
  '2403002_0050': Array.from({ length: 21 }, (_, i) => `2403002_00${50 + i}`),
  '2432001_0050': Array.from({ length: 21 }, (_, i) => `2432001_00${50 + i}`),
  '1352004_0050': Array.from({ length: 10 }, (_, i) => `1352004_00${50 + i}`),
  '1333002_00': ['1333002_00', ...Array.from({ length: 11 }, (_, i) => `1333002_${String(i + 1).padStart(2, '0')}`)],
  '1401007_01': Array.from({ length: 16 }, (_, i) => `1401007_${String(i + 1).padStart(2, '0')}`),
  '2163011_0100': Array.from({ length: 21 }, (_, i) => `2163011_0${100 + i}`),
};
// Efeitos de um golpe que o desenho usa com textura: clarão (d), projétil (p),
// impacto (i), fim/área (f) e armadilha (a). O rastro (r) só empresta a cor.
const EFEITOS_COM_TEXTURA = ['d', 'p', 'i', 'f', 'a'];

/** Sons que não são de arma: interface, explosões de nave e de monstro, cura. */
export const SONS_GERAIS = Object.freeze([...new Set([...Object.values(SONS_INTERFACE), 'h_explo', 'n2_explo', 'cure'])]);

/** A primeira textura de luz (aditiva) do efeito visual `id`, ou null. */
export function texturaDoEfeito(id) {
  const v = visualEfeito(id);
  return v?.texturas.find((t) => t && !TEXTURAS_CASCO.has(t)) ?? null;
}

/** Nomes dos quadros de uma textura: ela mesma, ou a sequência do original que começa nela. */
export function quadrosDe(nome) {
  return SEQUENCIAS[nome] ?? [nome];
}

/** Todos os golpes da arma (chave): todas as versões, o disparo e os filhos (subprojétil, o que a mina dispara). */
export function golpesDaArma(kind) {
  const w = WEAPONS[kind];
  if (!w) return [];
  const golpes = [];
  for (const v of w.versoes) {
    for (let g = v.golpe; g; g = g.divide ?? g.dispara ?? null) golpes.push(g);
  }
  return golpes;
}

/** Texturas (nomes, sem extensão) que a arma pode desenhar em qualquer versão. */
export function texturasDaArma(kind) {
  const nomes = new Set();
  for (const g of golpesDaArma(kind)) {
    for (const k of EFEITOS_COM_TEXTURA) {
      const tex = texturaDoEfeito(g.vis?.[k]);
      if (tex) for (const q of quadrosDe(tex)) nomes.add(q);
    }
  }
  return [...nomes];
}

/** Sons (nomes, sem extensão) que a arma pode tocar em qualquer versão: disparo e impacto. */
export function sonsDaArma(kind) {
  const w = WEAPONS[kind];
  if (!w) return [];
  const nomes = new Set([w.som, w.somImpacto, ...w.versoes.map((v) => v.som)]);
  for (const g of golpesDaArma(kind)) nomes.add(g.som).add(g.somImpacto);
  nomes.delete(undefined);
  nomes.delete(null);
  return [...nomes];
}

/** Modelos (nomes de arquivo sem extensão) das peças da arma na asa, esquerda e direita. */
export function modelosDaArma(kind) {
  return [...new Set((WEAPONS[kind]?.modelo ?? []).filter(Boolean))];
}

/**
 * Tudo o que a nave da raça e da classe pode precisar na partida:
 * - `naves`: as 5 da linha (as que a Evolução compra), { tier, nome, url };
 * - `armas`: todas as que a raça e a classe usam, { idx, kind, nome, modelos };
 * - `texturas`: as dos efeitos dessas armas, em todas as versões;
 * - `sons`: os dessas armas e os gerais (interface, explosões).
 */
export function insumosDaNave(race, classe) {
  const naves = linhaDe(race, classe).map((n) => ({ tier: n.tier, nome: n.nome, url: '/' + n.modelo }));
  const armas = armasDisponiveis(race, classe)
    .map((idx) => ({ idx, kind: ARMAS[idx] }))
    .filter(({ kind }) => !WEAPONS[kind].npc)
    .map(({ idx, kind }) => ({ idx, kind, nome: WEAPONS[kind].nome, modelos: modelosDaArma(kind) }));
  const texturas = new Set();
  const sons = new Set(SONS_GERAIS);
  for (const { kind } of armas) {
    for (const t of texturasDaArma(kind)) texturas.add(t);
    for (const s of sonsDaArma(kind)) sons.add(s);
  }
  return { naves, armas, texturas: [...texturas], sons: [...sons] };
}

// ---------- Mapa e monstros ----------
//
// Os modelos do cenário (public/modelos/mapa/, feitos no Blender pela frente Cenário)
// e os dos monstros da jungle (public/modelos/monstros/, do AstroN original) são os
// mesmos para todo piloto: entram inteiros na tela de carregamento, antes da cena ser
// montada (cena.js e monstros.js só montam o que já está no cache).

/** Pasta dos modelos do mapa (lago de Hélio-3). */
export const PASTA_MODELOS_MAPA = '/modelos/mapa/';
/** Pasta dos modelos dos monstros. */
export const PASTA_MODELOS_MONSTRO = '/modelos/monstros/';

/** Os modelos do mapa, sem extensão (ver public/modelos/mapa/LISTA.md). */
export const MODELOS_MAPA = Object.freeze([
  'borda-quadrante',
  'borda-quadrante-espelhada',
  'borda-horizonte',
  'fundo-lago',
  'rocha-quadrante',
  'rocha-quadrante-b',
  'parede-l',
  'parede-l-espelhada',
  'mineradora',
  'base-warp',
  'plataforma-base',
  'plataforma-servico',
  'plataforma-pouso',
  'entrega',
  'nucleo',
  'torre-suporte',
  'torre-suporte-caida',
  'asteroide-1',
  'asteroide-2',
  'asteroide-3',
  'asteroide-4',
  'coral',
  'alga',
  'cristais-he3',
  'pedra-lago-1',
  'pedra-lago-2',
  'ruina-submersa',
]);

/** Espécies de monstro (a `esp` do protocolo = o nome do glb). */
export const ESPECIES_MONSTRO = Object.freeze(['armish', 'chrometic', 'xerxes', 'great_xerxes', 'bazit', 'anti', 'sn4', 'medusa', 'sonda']);
/** Os modelos dos monstros e os efeitos da Medusa (sangue e bolhas, decoração). */
export const MODELOS_MONSTRO = Object.freeze([...ESPECIES_MONSTRO, 'medusa-sangue', 'medusa-bolha']);

/** URLs do que o mapa e os monstros usam: { mapa: [{ nome, url }], monstros: [{ nome, url }] }. */
export function insumosDoMapa() {
  return {
    mapa: MODELOS_MAPA.map((nome) => ({ nome, url: `${PASTA_MODELOS_MAPA}${nome}.glb` })),
    monstros: MODELOS_MONSTRO.map((nome) => ({ nome, url: `${PASTA_MODELOS_MONSTRO}${nome}.glb` })),
  };
}
