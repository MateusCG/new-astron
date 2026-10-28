// Destruição como no AstroN original: qual unidade do original cada coisa do jogo é
// na hora de morrer, e os números da queda, dos destroços e da fumaça. Puro (sem
// Three.js nem DOM): o desenho mora em destruicao-3d.js e a lista do carregamento
// (insumos.js) e os testes leem daqui.
//
// O que o original faz (libgame_arm64.so, decompilado no Ghidra; pesquisa em
// ~/Documentos/new-astron-progresso/ANIMACOES-ORIGINAL.md, "Explosão de destruição"):
// CBasePilot::Dead serve para toda unidade (nave de jogador, NPC, torre). Ela toca o
// som de morte da unidade (initunit.cfg col. 14: "snzeroD1", "medusaD1"...; "0" =
// nenhum) e olha a col. 24:
// - 0: explode ali mesmo (CUnitExplosion): o efeito da col. 25 (EXP001 a EXP007) no
//   lugar da unidade, 10 unidades do original acima, com a matriz dela; o som H_EXPLO;
//   uma luz que cresce e apaga com o efeito (alcance sen(π·t/n) × 200); e 10
//   destroços (CUnitWreck).
// - 1: a unidade CAI (CUnitFalling): o próprio modelo, girando nos três eixos
//   ((rand%6 − 3) / col. 23 rad por quadro), com velocidade (rand%6 − 3, rand%6 − 3,
//   2) que perde 1% por quadro e ganha −0,3 de gravidade, soltando fumaça
//   (CUnitWarningSmoke, metade dos quadros) e fagulha (CUnitWarningFlare, um quadro
//   em quatro) atrás; quando bate no chão (CScene::IsValidMove) ou passam 100 quadros,
//   explode como acima (CUnitFalling::Explosion).
// Os destroços são as peças ex_particl01 a 04 (uma ao acaso), com uma textura ao acaso
// da própria unidade, lançados com (rand%((5−k)·2) − 5, idem, rand%((6−k)·2)) (k = a
// peça, 0 a 3: no original as maiores saem mais devagar e sempre para −x e −y do
// mundo, e fica assim), girando (rand%6 − 3)/6 rad por quadro em cada eixo, com a
// mesma gravidade, por 100 quadros; o que bate no chão solta 3 faíscas (CUnitSpark,
// o efeito EXP_Particle, 20 quadros, a mesma gravidade).
// Tudo isso anda um passo por quadro do efeito: 24 por segundo (QUADROS_POR_S).
//
// Escala: o original não escala a explosão pelo tamanho da unidade; ele escolhe o
// efeito pela unidade (EXP005/006/007 nas grandes) e desenha na matriz dela, no metro
// do original. Aqui cada unidade é desenhada numa escala sobre o original (as naves ×
// 0,5, os monstros a de cada glb), então a explosão, a queda, a fumaça e os destroços
// vão na MESMA escala do modelo dela: a proporção entre a nave e a explosão fica a do
// original, e a nave que cresce ao evoluir explode maior junto.

import { FATOR_TAMANHO_NAVE } from '../../shared/naves.js';

/** Quadros por segundo dos efeitos e da física da queda (CEffectSprite::NextFrame). */
export const QUADROS_POR_S = 24;

/** Números do original (unidades do original por quadro; CUnitFalling, CUnitWreck, CUnitWarningSmoke/Flare, CUnitSpark). */
export const QUEDA = Object.freeze({
  quadros: 100, // CUnitFalling: cai até bater ou até 100 quadros
  arrasto: 0.99, // a velocidade perde 1% por quadro
  gravidade: -0.3, // por quadro, no eixo de cima
  subida: 2, // velocidade inicial para cima
  lado: 6, // rand % 6 − 3 nos dois eixos do chão
  alturaExplosao: 10, // a explosão nasce 10 acima do centro da unidade
  chanceFumaca: 0.5, // um quadro em dois solta fumaça
  chanceFagulha: 0.25, // um em quatro solta fagulha
});
export const FUMACA = Object.freeze({ quadros: 20, cresce: 0.2, giroMin: -0.1, giroMax: -0.055, herda: 0.2, raraUmEm: 5 });
export const FAGULHA = Object.freeze({ quadros: 20, divisor: 40, herda: 0.8 });
export const DESTROCO = Object.freeze({ quantos: 10, quadros: 100, giro: 6, faiscas: 3 });
export const FAISCA = Object.freeze({ quadros: 20 });
/** Luz da explosão (CUnitExplosion): cor do D3DLIGHT9 do original e o alcance máximo (unidades do original). */
export const LUZ_EXPLOSAO = Object.freeze({ cor: [0.8, 1, 0], alcance: 200 });

/** Os efeitos do original que a destruição toca (todos baixam na tela de carregamento). */
export const EFEITOS_EXPLOSAO = Object.freeze(['exp001', 'exp002', 'exp003', 'exp004', 'exp005', 'exp006', 'exp007']);
/** Fagulha da queda, as duas fumaças (a rara primeiro) e a faísca do destroço. */
export const EFEITO_FAGULHA = 'state001_01';
export const EFEITOS_FUMACA = Object.freeze(['state001_03', 'state001_02']);
export const EFEITO_FAISCA = 'exp_particle';
/** As peças dos destroços (malhas soltas, "ex_particl%02d" com 1 a 4). */
export const MALHAS_DESTROCO = Object.freeze(['ex_particl01', 'ex_particl02', 'ex_particl03', 'ex_particl04']);
export const EFEITOS_DESTRUICAO = Object.freeze([...EFEITOS_EXPLOSAO, EFEITO_FAGULHA, ...EFEITOS_FUMACA, EFEITO_FAISCA, ...MALHAS_DESTROCO]);
/** Som da explosão (o mesmo para todas no original). */
export const SOM_EXPLOSAO = 'h_explo';

/** Gira devagar (col. 23) nas naves de jogador: 20 a 25 no original, pela nave. */
const GIRO_NAVE = 22;

/**
 * A unidade do original de cada coisa do jogo: `unidade` (id no initunit.cfg), `efeito`
 * (col. 25), `cai` (col. 24), `som` (col. 14, minúsculo; null = nenhum), `giro` (col.
 * 23), `tam` (col. 17, unidades do original: a fumaça sai a metade disso atrás) e
 * `escala` (m do jogo por unidade do original: a do modelo dela aqui).
 * - Naves de jogador: a explosão da raça (todas as naves dela usam a mesma), na escala
 *   das naves (FATOR_TAMANHO_NAVE); `tam` sai do corpo da nave (destruicaoDe).
 * - Monstros: a unidade de cada um (server/especies.js), na escala do glb
 *   (public/modelos/monstros/LISTA.md; o SN-4 é desenhado 2×).
 * - Minerador e escolta (modelos nossos; o servidor os move como Shrewdo): o veículo
 *   de mineração e o batedor Shrewdo, na escala do nosso modelo sobre o original
 *   (minerador 6,1 m × o veículo de 32,6 m; escolta 8,2 m × o batedor de 20,4 m).
 * - Torre sentinela: a "Automated Missile Turret" (NU2001), que não cai: o corpo da
 *   nossa tem 18 m de largura, o da original 31 (0,58).
 * - Torre do buff de suporte: a "communication facility" (CC0001, a torre de antena
 *   do original), não cai; nossa torre (r 14) sobre o raio dela (55).
 * - Núcleo de He-3: a "High Energy Cell" (e_shell), não cai; o cristal (r 14, 28 m)
 *   sobre a célula do original (55 m).
 */
export const DESTRUICAO = Object.freeze({
  acron: { unidade: 300002, efeito: 'exp003', cai: true, som: null, giro: GIRO_NAVE, tam: 15, escala: FATOR_TAMANHO_NAVE },
  bellico: { unidade: 200002, efeito: 'exp002', cai: true, som: null, giro: GIRO_NAVE, tam: 14, escala: FATOR_TAMANHO_NAVE },
  shrewdo: { unidade: 100002, efeito: 'exp001', cai: true, som: null, giro: GIRO_NAVE, tam: 10, escala: FATOR_TAMANHO_NAVE },
  minerador: { unidade: 110001, efeito: 'exp001', cai: true, som: null, giro: 20, tam: 15, escala: 6.1 / 32.6 },
  escolta: { unidade: 951050, efeito: 'exp001', cai: true, som: null, giro: 20, tam: 11, escala: 8.2 / 20.4 },
  torreta: { unidade: 600001, efeito: 'exp004', cai: false, som: null, giro: 0, tam: 21, escala: 18 / 31 },
  torreSuporte: { unidade: 800000, efeito: 'exp006', cai: false, som: null, giro: 0, tam: 55, escala: 14 / 55 },
  nucleo: { unidade: 951201, efeito: 'exp007', cai: false, som: null, giro: 0, tam: 20, escala: 28 / 55 },
  sn3: { unidade: 502020, efeito: 'exp004', cai: true, som: 'snzerod1', giro: 20, tam: 30, escala: 0.25 },
  snzero: { unidade: 500405, efeito: 'exp007', cai: true, som: 'snzerod1', giro: 15, tam: 28, escala: 0.25 },
  xerxes: { unidade: 502060, efeito: 'exp004', cai: true, som: 'sekisd1', giro: 25, tam: 25, escala: 0.135 },
  great_xerxes: { unidade: 502065, efeito: 'exp007', cai: true, som: 'sekisd1', giro: 30, tam: 45, escala: 0.135 },
  bazit: { unidade: 502050, efeito: 'exp004', cai: true, som: 'vajytd1', giro: 25, tam: 25, escala: 0.171 },
  anti: { unidade: 502070, efeito: 'exp004', cai: false, som: null, giro: 25, tam: 25, escala: 0.383 },
  sn4: { unidade: 510600, efeito: 'exp006', cai: true, som: 'snzerod1', giro: 35, tam: 80, escala: 0.118 * 2 },
  medusa: { unidade: 510700, efeito: 'exp006', cai: true, som: 'medusad1', giro: 35, tam: 65, escala: 0.242 },
  sonda: { unidade: 500303, efeito: 'exp004', cai: false, som: 'aflyd1', giro: 15, tam: 20, escala: 0.171 },
});

/** Os sons de morte que a destruição toca (baixam na tela de carregamento). */
export const SONS_DESTRUICAO = Object.freeze([SOM_EXPLOSAO, ...new Set(Object.values(DESTRUICAO).map((d) => d.som).filter(Boolean))]);

/**
 * A destruição de uma entidade do snapshot (ou da torre): `tipo` ('jogador',
 * 'minerador', 'escolta', 'monstro', 'nucleo', 'torreta', 'torreSuporte'), `esp` (do
 * monstro), `race` (do jogador), `nucleo` (o minerador grande da onda do Núcleo, 1,7×) e
 * `corpo` (m, o corpo da nave: o tamanho cresce com o tier). null se não há.
 */
export function destruicaoDe({ tipo, esp, race, nucleo = false, corpo = null } = {}) {
  if (tipo === 'monstro') return DESTRUICAO[esp] ?? null;
  if (tipo === 'jogador') {
    const d = DESTRUICAO[race] ?? DESTRUICAO.acron;
    return corpo ? { ...d, tam: corpo / d.escala } : d;
  }
  if (tipo === 'minerador' && nucleo) return { ...DESTRUICAO.minerador, escala: DESTRUICAO.minerador.escala * 1.7 };
  return DESTRUICAO[tipo] ?? null;
}
