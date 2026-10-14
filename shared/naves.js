// Naves de jogador por raça e classe (contrato entre servidor e cliente).
//
// Como no Astro-N original, cada raça jogável tem três classes de nave, cada uma
// com uma especialidade: Assault (mais HP e blindagem), Mobile (mais velocidade) e
// Functional (mais energia). Cada classe é uma LINHA de cinco naves (tier 0 a 4): o
// piloto começa a partida na primeira nave da linha da raça e classe que escolheu e
// compra a seguinte na Evolução da base (server/servicos.js), com o nível exigido
// (NIVEL_POR_TIER: a cada 5 níveis) e o ouro (PRECO_POR_TIER). Mechan aparece na tela
// de entrada, mas ainda sem naves (RACAS_BLOQUEADAS).
//
// Os números saem do initunit.cfg do jogo original (colunas no fim de cada linha:
// classe, HP, armadura, regenHP, energia, regenEnergia, velocidade, aceleração,
// nível exigido e preço), guardados crus em ORIGINAL e convertidos para a escala do
// jogo novo pelas constantes abaixo. Os números do original ficam como estão, mesmo
// quando uma nave de tier mais alto perde num status para a anterior (a Ulysses tem
// menos HP que a Kamasutra, mas mais energia e velocidade): é a personalidade de
// cada nave. Aceleração, nível e preço do original não entram (a física do jogo novo
// tem uma resposta só, e nível e preço seguem a economia da partida de 10 minutos).
//
// Conversão (constantes nomeadas para balancear sem mexer nos dados):
// - HP: o do original vezes FATOR_ESCALA_HP (HP/5, a mesma escala do dano das armas).
// - Regeneração de vida: o original está em HP por milissegundo (MS_POR_S converte);
//   vira HP por segundo na mesma escala do HP. Quem regenera é o servidor (#regen em
//   server/game.js), voando e sem levar dano há um tempo; pousada a nave conserta
//   mais rápido, pela regra do servidor.
// - Armadura (só as naves Bellico têm): fração do dano que a nave deixa de levar,
//   FATOR_ARMADURA vezes o número do original (a Elephantera, a mais blindada, segura
//   10%). Soma com a armadura da Loja (as duas reduções se multiplicam).
// - Energia, regeneração de energia e velocidade: razão com a nave de referência
//   (REF_ORIGINAL, a Warrior, primeira Acron Assault) e o número que ela tem no jogo
//   novo (REF_JOGO), para o jogo continuar na faixa de antes (energia 40 a 80,
//   regen 9/s, ~55 m/s). A velocidade fica em "pontos" (100 = Warrior), como era em
//   RACES: m/s = pontos × VEL_FATOR (shared/sim.js).
//
// Tudo aqui é dado puro e determinístico (servidor e cliente leem o mesmo arquivo).

/** Classes de nave, com a especialidade do original. */
export const CLASSES = {
  assault: { id: 'assault', nome: 'Assault', especialidade: 'Mais HP e blindagem' },
  mobile: { id: 'mobile', nome: 'Mobile', especialidade: 'Mais velocidade' },
  functional: { id: 'functional', nome: 'Functional', especialidade: 'Mais energia' },
};
export const ORDEM_CLASSES = ['assault', 'mobile', 'functional'];
/** Classe de quem pede uma que não existe. */
export const CLASSE_PADRAO = 'assault';

export const RACAS_JOGAVEIS = ['acron', 'bellico', 'shrewdo'];
/** Raças que aparecem na entrada, apagadas com "EM BREVE" (sem naves ainda). */
export const RACAS_BLOQUEADAS = ['mechan'];

/** Último tier de cada linha (cinco naves: 0 a 4). */
export const TIER_MAX = 4;
/** Nível do piloto exigido para comprar a nave de cada tier (a cada 5 níveis). */
export const NIVEL_POR_TIER = [1, 5, 10, 15, 20];
/**
 * Preço em ouro da nave de cada tier (a primeira é a de fábrica). Numa partida boa
 * (nível 10 a 15, uns 1500 a 2000 de ouro, ver RECOMPENSA em server/progressao.js)
 * dá para comprar duas ou três naves e ainda armar a nave na Loja.
 */
export const PRECO_POR_TIER = [0, 200, 400, 650, 900];

export const FATOR_ESCALA_HP = 0.2; // HP e dano do original divididos por 5
export const MS_POR_S = 1000; // regenerações do original são por milissegundo
export const FATOR_ARMADURA = 3; // armadura do original → fração do dano segurada
/** Nave de referência (Warrior) no original e no jogo novo. */
export const REF_ORIGINAL = { energia: 90, regenEnergia: 0.0156, velocidade: 0.1111 };
export const REF_JOGO = { energia: 60, regenEnergia: 9, velocidade: 100 };

/**
 * Colunas do initunit.cfg, em ordem de tier dentro de cada linha (número do modelo:
 * 02/05/08/11/14 Assault, 03/06/09/12/15 Mobile, 04/07/10/13/16 Functional):
 * [id, nome, HP, armadura, regenHP, energia, regenEnergia, velocidade].
 */
const ORIGINAL = {
  acron: {
    assault: [
      ['warrior', 'Warrior', 850, 0, 0.02, 90, 0.0156, 0.1111],
      ['paladin', 'Paladin', 1445, 0, 0.03, 120, 0.0192, 0.1122],
      ['tristan', 'Tristan', 2456, 0, 0.04, 150, 0.0228, 0.1133],
      ['kamasutra', 'Kamasutra', 4175, 0, 0.05, 180, 0.0264, 0.1144],
      ['ulysses', 'Ulysses', 3340, 0, 0.05, 441, 0.0277, 0.1201],
    ],
    mobile: [
      ['ranger', 'Ranger', 700, 0, 0.012, 120, 0.0144, 0.121],
      ['tracker', 'Tracker', 980, 0, 0.014, 180, 0.0168, 0.132],
      ['windwalker', 'Windwalker', 1372, 0, 0.016, 240, 0.0192, 0.143],
      ['eurus', 'Eurus', 1920, 0, 0.018, 300, 0.0216, 0.154],
      ['sephiros', 'Sephiros', 2016, 0, 0.018, 315, 0.0227, 0.143],
    ],
    functional: [
      ['esper', 'Esper', 750, 0, 0.013, 180, 0.024, 0.1122],
      ['mirage', 'Mirage', 1125, 0, 0.016, 300, 0.036, 0.1144],
      ['mystique', 'Mystique', 1687, 0, 0.019, 420, 0.048, 0.1166],
      ['mobius', 'Mobius', 2530, 0, 0.022, 540, 0.06, 0.1188],
      ['garuda', 'Garuda', 2657, 0, 0.022, 432, 0.048, 0.1247],
    ],
  },
  bellico: {
    assault: [
      ['lioner', 'Lioner', 1020, 0.0133, 0.04, 75, 0.013, 0.1111],
      ['tigera', 'Tigera', 1734, 0.02, 0.06, 100, 0.016, 0.1122],
      ['liger', 'Liger', 2947, 0.0267, 0.08, 125, 0.019, 0.1133],
      ['elephantera', 'Elephantera', 5010, 0.0333, 0.1, 150, 0.022, 0.1144],
      ['cheetahar', 'Cheetahar', 4008, 0.0333, 0.1, 368, 0.0231, 0.1201],
    ],
    mobile: [
      ['condor', 'Condor', 840, 0.008, 0.024, 100, 0.012, 0.121],
      ['falcon', 'Falcon', 1176, 0.0093, 0.028, 150, 0.014, 0.132],
      ['eagle', 'Eagle', 1646, 0.0107, 0.032, 200, 0.016, 0.143],
      ['phantom', 'Phantom', 2304, 0.012, 0.036, 250, 0.018, 0.154],
      ['phoenix', 'Phoenix', 2419, 0.012, 0.036, 263, 0.0189, 0.143],
    ],
    functional: [
      ['turtle', 'Turtle', 900, 0.0087, 0.026, 150, 0.02, 0.1122],
      ['snaker', 'Snaker', 1350, 0.0107, 0.032, 250, 0.03, 0.1144],
      ['dragoner', 'Dragoner', 2024, 0.0127, 0.038, 350, 0.04, 0.1166],
      ['sphinx', 'Sphinx', 3036, 0.0147, 0.044, 450, 0.05, 0.1188],
      ['chimera', 'Chimera', 3187, 0.0147, 0.044, 360, 0.04, 0.1247],
    ],
  },
  shrewdo: {
    assault: [
      ['assault-wing', 'Assault Wing', 850, 0, 0.02, 75, 0.013, 0.1162],
      ['power-wing', 'Power Wing', 1445, 0, 0.03, 100, 0.016, 0.1173],
      ['plate-wing', 'Plate Wing', 2456, 0, 0.04, 125, 0.019, 0.1185],
      ['uranium-wing', 'Uranium Wing', 4175, 0, 0.05, 150, 0.022, 0.1196],
      ['hellion-wing', 'Hellion Wing', 3340, 0, 0.05, 368, 0.0231, 0.1256],
    ],
    mobile: [
      ['speed-wing', 'Speed Wing', 700, 0, 0.012, 100, 0.012, 0.1265],
      ['rapier-wing', 'Rapier Wing', 980, 0, 0.014, 150, 0.014, 0.138],
      ['thunder-wing', 'Thunder Wing', 1372, 0, 0.016, 200, 0.016, 0.1495],
      ['lightning-wing', 'Lightning Wing', 1920, 0, 0.018, 250, 0.018, 0.161],
      ['alchemium-wing', 'Alchemium Wing', 2016, 0, 0.018, 263, 0.0189, 0.1495],
    ],
    functional: [
      ['chaos-wing', 'Chaos Wing', 750, 0, 0.013, 150, 0.02, 0.1173],
      ['techron-wing', 'Techron Wing', 1125, 0, 0.016, 250, 0.03, 0.1196],
      ['magic-wing', 'Magic Wing', 1687, 0, 0.019, 350, 0.04, 0.1219],
      ['energy-wing', 'Energy Wing', 2530, 0, 0.022, 450, 0.05, 0.1242],
      ['cyclone-wing', 'Cyclone Wing', 2657, 0, 0.022, 360, 0.04, 0.1304],
    ],
  },
};

const umaCasa = (v) => Math.round(v * 10) / 10;

/** Converte uma linha do original para a nave do jogo novo. */
function converter(race, classe, tier, [id, nome, hp, armadura, regenHp, energia, regenEnergia, velocidade]) {
  return {
    id,
    nome,
    race,
    classe,
    modelo: `modelos/naves/${race}/${classe}/${id}.glb`, // caminho dentro de public/
    tier,
    nivel: NIVEL_POR_TIER[tier],
    preco: PRECO_POR_TIER[tier],
    hp: Math.round(hp * FATOR_ESCALA_HP),
    energia: Math.round((energia * REF_JOGO.energia) / REF_ORIGINAL.energia),
    regenEnergia: umaCasa((regenEnergia * REF_JOGO.regenEnergia) / REF_ORIGINAL.regenEnergia), // por segundo
    velocidade: Math.round((velocidade * REF_JOGO.velocidade) / REF_ORIGINAL.velocidade), // pontos (× VEL_FATOR = m/s)
    armadura: Math.round(armadura * FATOR_ARMADURA * 1000) / 1000, // fração do dano segurada
    regenHp: umaCasa(regenHp * MS_POR_S * FATOR_ESCALA_HP), // HP por segundo
  };
}

/** NAVES[race][classe] = as cinco naves da linha, em ordem de tier. */
export const NAVES = Object.fromEntries(
  Object.entries(ORIGINAL).map(([race, classes]) => [
    race,
    Object.fromEntries(Object.entries(classes).map(([classe, linhas]) => [classe, linhas.map((l, tier) => converter(race, classe, tier, l))])),
  ]),
);

/** A classe existe? */
export function classeValida(c) {
  return typeof c === 'string' && Object.hasOwn(CLASSES, c);
}

/** A classe pedida, ou CLASSE_PADRAO se não existir. */
export function classeOuPadrao(c) {
  return classeValida(c) ? c : CLASSE_PADRAO;
}

/** A raça tem naves e pode entrar na partida? */
export function racaJogavel(r) {
  return RACAS_JOGAVEIS.includes(r);
}

/**
 * Por que a raça não pode entrar (código de erro da entrada), ou null se pode:
 * 'raca_bloqueada' (Mechan, ainda sem naves) ou 'raca_invalida'.
 */
export function motivoRacaRecusada(r) {
  if (racaJogavel(r)) return null;
  return RACAS_BLOQUEADAS.includes(r) ? 'raca_bloqueada' : 'raca_invalida';
}

/** A nave da raça, classe e tier (0 a TIER_MAX), ou null. */
export function naveDe(race, classe, tier = 0) {
  return NAVES[race]?.[classe]?.[tier] ?? null;
}

/** As cinco naves da linha da raça e classe ([] se não houver). */
export function linhaDe(race, classe) {
  return NAVES[race]?.[classe] ?? [];
}
