// Regras do disparo das armas de início como no AstroN original (puro: sem Three.js,
// sem DOM; quem desenha é disparo-original.js). As armas de início são as duas de
// fábrica de cada raça (INICIAIS_ORIGINAL em shared/armas.js); a pesquisa, com a
// evidência de cada número, está em ~/Documentos/new-astron-progresso/ANIMACOES-ORIGINAL.md,
// seção "Disparo das armas de início".
//
// Como o original desenha um tiro (libgame decompilado):
// - Clarão na boca: CUnitBeam::InitData cria, para CADA projétil, o efeito da coluna 51
//   do inititemweapon.cfg com CUnitBeam::CreateEffect no modo da coluna 53. Os modos das
//   armas de início são o 14 (CUnitFire preso na boca da arma, girado ao acaso em volta do
//   cano: (rand() % 10) × 0,6283 rad) e o 15 (preso na boca, sem giro). Preso: a cada
//   quadro, CUnitFire::CalculateMovement põe o efeito em CBasePilot::GetWeaponMatrix, o nó
//   `fire` da arma pendurada no `l_item` (arma do encaixe par, o Z) ou no `r_item` (ímpar,
//   o X), no rumo da nave SEM a inclinação da curva (a matriz +0xdc da CUnit). Toca o .eff
//   uma vez e some (CUnitFire::OnStateEnd).
// - Projétil: nasce na boca (CBasePilot::GetWeaponFireMatrix: o mesmo `fire`, na altura
//   de voo), com os projéteis paralelos espalhados de lado em volta dela
//   (CPilotManage::Attack: i × vão − (n − 1) × vão / 2), e desenha o efeito da coluna 57
//   (CUnitBeam::LoadGraphic, tipo 0 = modelo) repetindo (CUnitBeam::OnStateEnd reinicia).
// - Acabou a vida no ar: some, sem efeito nem som (CUnitBeam::OnDeleteMe(false)).
// - Bateu no chão (MoveBullet devolve 0): o efeito de impacto (coluna 89) na matriz do
//   próprio tiro, e o som de impacto (coluna 11).
// - Acertou: CUnitBeam::ProcessDamage cria o impacto em cada alvo, no casco: o centro do
//   alvo mais o rumo (do alvo para o tiro, no plano) × 0,85 × o raio dele, com a matriz
//   (o giro) do ALVO; depois OnDeleteMe(true) toca o som de impacto e cria o efeito de
//   fim (coluna 92) no modo da coluna 94: o 7 (só a Metralha Shrewdo) põe o efeito
//   deitado no ponto, na escala raio da área / 100 (o anel do 1421002 tem raio 100).
//
// Escala: o original desenha tudo no metro dele, o mesmo das naves; aqui as naves são o
// original × FATOR_TAMANHO_NAVE (0,5), e o clarão, o projétil e o impacto vão na mesma
// escala, para ficar do tamanho que eram perto da nave. O tiro anda o original × 0,5
// (FATOR_VEL), então a velocidade na tela, perto da nave, também é a do original.

import { WEAPONS } from '../../shared/armas.js';
import { FATOR_TAMANHO_NAVE } from '../../shared/naves.js';
import { forward } from '../../shared/sim.js';

/**
 * As armas de início desenhadas como no original e o modo de cada efeito (iguais nas
 * versões V1 a V8 no inititemweapon.cfg): `clarao` 'giro' (modo 14) ou 'preso' (15);
 * `fim` 'area' (modo 7) na Metralha Shrewdo, a única com efeito de fim.
 */
export const DISPARO_ORIGINAL = Object.freeze({
  o111001: Object.freeze({ clarao: 'giro' }), // Feixe Rifle Triplo (Acron)
  o111011: Object.freeze({ clarao: 'preso' }), // Vulcan Acron
  o211001: Object.freeze({ clarao: 'giro' }), // Feixe Bellico
  o211011: Object.freeze({ clarao: 'giro' }), // Vulcan Bellico
  o311001: Object.freeze({ clarao: 'giro' }), // Feixe Duplo (Shrewdo)
  o311004: Object.freeze({ clarao: 'preso', fim: 'area' }), // Metralha Shrewdo
});

/** m por unidade do original dos efeitos do disparo (a escala das naves). */
export const ESCALA_DISPARO = FATOR_TAMANHO_NAVE;
/** Passos do giro do clarão no modo 14: rand() % 10, cada um de 0,6283 rad (36°). */
export const GIRO_PASSOS = 10;
export const GIRO_PASSO = 0.6283185482025146;
/** Fração do raio do alvo onde o impacto aparece (ProcessDamage: raio × 0,85). */
export const IMPACTO_NO_CASCO = 0.85;
/** Raio (unidades do original) do efeito de fim no modo 7: a escala é a área / 100. */
export const RAIO_FIM_ORIGINAL = 100;
/** O servidor disse que o tiro acabou antes de a vida dele acabar por mais que isto (s): bateu em algo. */
export const FOLGA_FIM_S = 0.1;
/** Campos do golpe (`vis` do catálogo) que o disparo usa: clarão, projétil, impacto e fim. */
export const CAMPOS_DISPARO = Object.freeze(['d', 'p', 'i', 'f']);

/** Como o original desenha a arma `kind` ({ clarao, fim? }), ou null se não é arma de início. */
export function disparoOriginal(kind) {
  return DISPARO_ORIGINAL[kind] ?? null;
}

/** Os efeitos do original (ids) que o disparo das armas de início usa, em todas as versões. */
export function efeitosDoDisparo() {
  const ids = new Set();
  for (const kind of Object.keys(DISPARO_ORIGINAL)) {
    for (const v of WEAPONS[kind].versoes) for (const c of CAMPOS_DISPARO) if (v.golpe.vis?.[c]) ids.add(v.golpe.vis[c]);
  }
  return [...ids];
}

/** Giro (rad) do clarão em volta do cano: no modo 'giro', um dos 10 passos de 36° (`r` sorteado em [0, 1)); no 'preso', 0. */
export function giroDoClarao(modo, r) {
  return modo === 'giro' ? Math.min(GIRO_PASSOS - 1, Math.floor(r * GIRO_PASSOS)) * GIRO_PASSO : 0;
}

/**
 * Onde o desenho do tiro `b` nasce: a boca da arma mais o deslocamento de lado do
 * projétil (o mesmo que ele tem em relação à nave, de rumo `nave.yaw`, no ponto
 * `nave.x`, `nave.z`), na altura do tiro. Assim os projéteis paralelos saem espalhados
 * em volta da boca, como no original, e não todos do mesmo ponto.
 */
export function inicioDoTiro(b, boca, nave) {
  const f = forward(nave.yaw);
  const lado = (b.x - nave.x) * -f.z + (b.z - nave.z) * f.x;
  return { x: boca.x - f.z * lado, y: b.y, z: boca.z + f.x * lado };
}

/**
 * Ponto do impacto no casco do alvo: o centro mais o rumo do centro para `de` (onde o
 * tiro estava), no plano, × raio × 0,85, na altura do centro. Sem `de` (ou em cima do
 * centro), o próprio centro.
 */
export function pontoDoImpacto(centro, raio, de) {
  const dx = de ? de.x - centro.x : 0;
  const dz = de ? de.z - centro.z : 0;
  const d = Math.hypot(dx, dz);
  if (!(d > 1e-6) || !(raio > 0)) return { x: centro.x, y: centro.y, z: centro.z };
  const k = (raio * IMPACTO_NO_CASCO) / d;
  return { x: centro.x + dx * k, y: centro.y, z: centro.z + dz * k };
}

/**
 * O tiro `b` (o estado no cliente) acabou antes da hora no ponto (x, z) que o servidor
 * mandou (bateu no chão, numa construção, no campo de força)? Falso quando ele só
 * chegou ao fim da vida (o cliente anda um pouco atrás do servidor).
 */
export function acabouAntes(b, x, z) {
  const v = Math.hypot(b.vx, b.vz);
  if (!(v > 0)) return false;
  const frente = ((x - b.x) * b.vx + (z - b.z) * b.vz) / v;
  return frente < (b.vida - FOLGA_FIM_S) * v;
}

/** Escala (m por unidade do original) do efeito de fim do modo 7 numa área de `raio` m. */
export function escalaDoFim(raio) {
  return raio / RAIO_FIM_ORIGINAL;
}
