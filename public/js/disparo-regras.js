// Regras do disparo das armas desenhadas como no AstroN original (puro: sem Three.js,
// sem DOM; quem desenha é disparo-original.js): as duas de fábrica de cada raça
// (INICIAIS_ORIGINAL em shared/armas.js) e as revistas depois, uma a uma, contra o
// original (o Feixe Perfurante de Magma, o Canhão de Faíscas e o Rebatedor de
// Projéteis). A pesquisa, com a evidência de cada número, está em
// ~/Documentos/new-astron-progresso/ANIMACOES-ORIGINAL.md, seções "Disparo das armas de
// início" e "Magma, Faíscas e Rebatedor".
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
// - Feixe que atravessa (coluna 74, 5º dígito '2': o Feixe Perfurante de Magma): o
//   ProcessDamage cria o impacto em cada alvo que ele pega, uma vez por alvo (a lista
//   de atingidos do CUnitBeam), e o feixe segue; só o chão o apaga.
// - Modo 2 do clarão (o Rebatedor de Projéteis): CUnitFire parado onde a nave estava
//   no disparo (a posição da unidade, sem o giro dela: de pé, no rumo do mundo), na
//   escala área / 100 (o anel do 1162020 tem raio 100), uma vez. O projétil dele tem
//   vida 0 e some no primeiro quadro: não aparece.
// - Projétil que acelera (colunas 64 a 66: o Canhão de Faíscas sai parado e acelera
//   0,0003 m/ms² até 0,5 m/ms): CUnitBeam::MoveBullet soma a aceleração a cada quadro.
//   O jogo voa a velocidade média (o mesmo alcance no mesmo tempo, shared/armas.js);
//   o desenho anda pela curva do original na mesma linha (recuoDaCarga).
// - Esfera que cresce (tipo de gráfico 17, coluna 59: o subprojétil do Canhão de
//   Faíscas): o .eff na escala raio máximo da nova / 100 (coluna 55; o 2142018 chega a
//   raio 100 no último quadro), deitado onde o tiro acabou; sem repetir (OnStateEnd não
//   reinicia o tipo 17), o último quadro fica até a vida da nova acabar. O impacto
//   (coluna 89) sai no casco de cada alvo pego, do lado do centro.
//
// Escala: o original desenha tudo no metro dele, o mesmo das naves; aqui as naves são o
// original × FATOR_TAMANHO_NAVE (0,5), e o clarão, o projétil e o impacto vão na mesma
// escala, para ficar do tamanho que eram perto da nave. O tiro anda o original × 0,5
// (FATOR_VEL), então a velocidade na tela, perto da nave, também é a do original. Os
// efeitos que o original estica pela área vão pela área do jogo (raio / 100), para o
// desenho chegar aonde a área pega. O fim da V8 do Feixe Perfurante de Magma (1412002,
// modo 7) tem área 0 no original: escala 0, não aparece, e aqui também não sai.

import { WEAPONS } from '../../shared/armas.js';
import { FATOR_TAMANHO_NAVE } from '../../shared/naves.js';
import { forward } from '../../shared/sim.js';

/**
 * As armas desenhadas como no original e o modo de cada efeito (iguais nas versões V1
 * a V8 no inititemweapon.cfg): `clarao` 'giro' (modo 14), 'preso' (15) ou 'area' (2,
 * parado onde a nave estava, na escala da área); `fim` 'area' (modo 7) na Metralha
 * Shrewdo; `carga`: o projétil que acelera, com a velocidade inicial, a máxima (m/ms) e
 * a aceleração (m/ms²) do original (colunas 64, 65 e 66).
 */
export const DISPARO_ORIGINAL = Object.freeze({
  o111001: Object.freeze({ clarao: 'giro' }), // Feixe Rifle Triplo (Acron)
  o111011: Object.freeze({ clarao: 'preso' }), // Vulcan Acron
  o211001: Object.freeze({ clarao: 'giro' }), // Feixe Bellico
  o211011: Object.freeze({ clarao: 'giro' }), // Vulcan Bellico
  o311001: Object.freeze({ clarao: 'giro' }), // Feixe Duplo (Shrewdo)
  o311004: Object.freeze({ clarao: 'preso', fim: 'area' }), // Metralha Shrewdo
  o111003: Object.freeze({ clarao: 'giro' }), // Feixe Perfurante de Magma (Acron Functional)
  o112028: Object.freeze({ clarao: 'preso', carga: Object.freeze({ v0: 0, vmax: 0.5, acel: 0.0003 }) }), // Canhão de Faíscas
  o112014: Object.freeze({ clarao: 'area' }), // Rebatedor de Projéteis
});

/** m por unidade do original dos efeitos do disparo (a escala das naves). */
export const ESCALA_DISPARO = FATOR_TAMANHO_NAVE;
/** Passos do giro do clarão no modo 14: rand() % 10, cada um de 0,6283 rad (36°). */
export const GIRO_PASSOS = 10;
export const GIRO_PASSO = 0.6283185482025146;
/** Fração do raio do alvo onde o impacto aparece (ProcessDamage: raio × 0,85). */
export const IMPACTO_NO_CASCO = 0.85;
/**
 * Raio (unidades do original) dos efeitos que o original estica pela área: o fim no
 * modo 7, o clarão no modo 2 e a esfera que cresce (tipo 17); a escala é o raio / 100.
 */
export const RAIO_AREA_ORIGINAL = 100;
/** O servidor disse que o tiro acabou antes de a vida dele acabar por mais que isto (s): bateu em algo. */
export const FOLGA_FIM_S = 0.1;
/** Campos do golpe (`vis` do catálogo) que o disparo usa: clarão, projétil, impacto e fim. */
export const CAMPOS_DISPARO = Object.freeze(['d', 'p', 'i', 'f']);

/** Como o original desenha a arma `kind` ({ clarao, fim?, carga? }), ou null se ela não é desenhada como lá. */
export function disparoOriginal(kind) {
  return DISPARO_ORIGINAL[kind] ?? null;
}

/**
 * Os efeitos do original (ids) que o disparo dessas armas usa, em todas as versões (com o
 * do subprojétil). O de fim só nas de `fim` (o da V8 do Feixe Perfurante de Magma tem
 * área 0 no original e não aparece).
 */
export function efeitosDoDisparo() {
  const ids = new Set();
  for (const [kind, como] of Object.entries(DISPARO_ORIGINAL)) {
    for (const v of WEAPONS[kind].versoes) {
      for (const g of [v.golpe, v.golpe.divide]) {
        for (const c of CAMPOS_DISPARO) if (g?.vis?.[c] && (c !== 'f' || como.fim)) ids.add(g.vis[c]);
      }
    }
  }
  return [...ids];
}

/** O golpe `g` é um projétil que atravessa quem acerta (o desenho segue depois do impacto)? */
export function atravessa(g) {
  return !!g && g.forma === 'projetil' && !!g.atravessa;
}

/** Giro (rad) do clarão em volta do cano: no modo 'giro', um dos 10 passos de 36° (`r` sorteado em [0, 1)); nos outros, 0. */
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

/** Escala (m por unidade do original) do efeito que o original estica pela área (modos 7 e 2, tipo 17) numa área de `raio` m. */
export function escalaDaArea(raio) {
  return raio / RAIO_AREA_ORIGINAL;
}

/** Distância (m do original) que o projétil de `carga` andou em `ms` ms: acelera de v0 até vmax e segue. */
function andouNoOriginal(ms, { v0, vmax, acel }) {
  const ate = acel > 0 ? Math.max(0, (vmax - v0) / acel) : 0;
  if (ms <= ate) return v0 * ms + (acel * ms * ms) / 2;
  return v0 * ate + (acel * ate * ate) / 2 + vmax * (ms - ate);
}

/**
 * Quanto (m) o desenho do projétil que acelera fica atrás do tiro do jogo, que voa a
 * velocidade média do golpe `g` (vel em m/s, vida em s): a fração do caminho que o
 * original já andou na `idade` (s) do tiro, sobre o caminho inteiro. Começa e termina
 * em 0 (sai da boca e chega junto ao fim da vida).
 */
export function recuoDaCarga(idade, g, carga) {
  const vida = g.vida;
  if (!(vida > 0) || !(g.vel > 0)) return 0;
  const t = Math.min(Math.max(idade, 0), vida);
  const caminho = g.vel * vida;
  const fracao = andouNoOriginal(t * 1000, carga) / andouNoOriginal(vida * 1000, carga);
  return Math.max(0, g.vel * t - caminho * fracao);
}
