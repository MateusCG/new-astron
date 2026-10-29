// Espécies de monstro da jungle do Stage 6 (só no servidor; server/jungle.js dá vida
// a elas). Os números vêm da pesquisa da frente Monstros (PESQUISA-MONSTROS.md, seção
// 6), que leu o AstroN original (initnpc.cfg, initunit.cfg, as armas "(NPC)" do
// inititemweapon.cfg) e pôs na escala do jogo pelo PAPEL de cada monstro no mapa:
//
// - acampamento perto da base (4 pequenos): SN-3 (o de cima) e SN-Zero VI (o de
//   baixo), os dois do Stage M5 do original, com as ARMAS do original (ver abaixo);
// - acampamento perto do centro (1 grande + 2 pequenos): Grande Xerxes + 2 Xerxes (o
//   de cima: chama de perto, "vem chegando") e Anti + 2 Bazit (o de baixo: tudo de
//   longe), mesma força por papel;
// - buff de ataque: SN-4 (chefe do Stage 5, mísseis teleguiados);
// - chefe épico do poço de baixo: Ancient Medusa (não se teleporta: fica no poço
//   atirando);
// - sonda errante: A-Fly IV (fraca, sem ataque, foge).
//
// A chave (sn3, xerxes...) é a `esp` que vai no protocolo (entidade tipo
// 'monstro'); o cliente escolhe o modelo por ela (public/modelos/monstros/<esp>.glb).
//
// Armas do original (pedido do Mateus, out/2026: "exatamente iguais ao old-astron";
// primeiro o SN-3 e o SN-Zero VI, depois o padrão de ataque do SN-4, do Grande Xerxes,
// do Xerxes, do Bazit e do Anti, e por fim o da Medusa): cada um é o NPC do original
// (initnpc.cfg) com a unidade dele (initunit.cfg) e as armas "(NPC)" dele
// (inititemweapon.cfg, cols 13+ do initnpc), que entram no catálogo como as do jogador (WEAPONS 'n511080'...,
// shared/armas.js): forma do golpe, canos, leque, rajada, teleguiado, área, nova,
// campo, armadilha, efeito no alvo (o Magma do lança-chamas, a quebra de resistências
// do campo elétrico, a descarga de energia do míssil do SN-3), visual e som saem do
// original, convertidos pelos mesmos fatores das armas do jogador. Um ataque por vez,
// escolhido pelo peso do original (cols 22–25), no ritmo da arma mais rápida
// (`entreAtaquesS`), com a recarga e o ritmo × FATOR_RECARGA_ORIGINAL (atacam na
// metade da velocidade das armas, a regra que o Mateus pediu para o SN-3). Escala do
// resto:
// - velocidade: m/ms do original × 1000 × FATOR_VEL_MONSTRO (a regra de todo monstro);
// - SN-3 e SN-Zero VI: raio de acerto e modelo do original × FATOR_AREA (0,25, o mesmo
//   das áreas das armas: o corpo e o tiro ficam na proporção do original entre si e
//   com o SN-4); HP e XP do original vezes um fator só para os dois (FATOR_HP_M5,
//   FATOR_XP_M5), escolhido para o acampamento da base ficar no papel dele no ritmo da
//   partida (os pequenos de antes tinham 160 de HP); a relação entre os dois é a do
//   original (o SN-3 aguenta o dobro, o SN-Zero VI bate mais forte). O original não
//   dá ouro no abate (só drop): o ouro é a XP × OURO_POR_XP_M5, a relação dos
//   pequenos de antes;
// - os do Stage 6 e o SN-4 continuam com o HP, o tamanho, a XP e o ouro do papel
//   deles no mapa (PESQUISA-MONSTROS.md, seção 6); só o ataque vem do original;
// - dano: o de cada arma do original × FATOR_DANO_MONSTRO, o mesmo para todo monstro
//   (a relação de força entre eles é a do original), por espécie em
//   FATOR_DANO_ESPECIE para ajustar um só; os efeitos no alvo ficam na escala das
//   armas do jogador (o Magma do lança-chamas tira 100 de HP em 5 s do Xerxes e 150 do
//   Grande Xerxes, como o Magma das armas de jogador);
// - alcance: o voo do projétil da arma convertida, até ALCANCE_MAX_ORIGINAL (o
//   canhão explosivo do Xerxes voa 612 m, mais que a visão de 550).
// Ataques: cada um tem uma `forma`, que server/jungle.js transforma num golpe no
// formato dos golpes das armas (server/golpes.js resolve voo, curva, área, campo e
// efeitos no alvo, sem duplicar nada):
// - 'projetil': tiro reto mirado (adiantado) no alvo; `tiros` lado a lado (vão `vao`
//   m) ou em leque (`leque` rad entre eles); `area` > 0 explode no impacto e no fim da
//   vida; `minimo` = só atira de mais longe que isto (o Xerxes usa a chama de perto);
// - 'guiado': míssil teleguiado travado no alvo, `giro` rad/s de curva (dá para
//   escapar virando forte);
// - 'cone': chama de perto, dano direto em quem está no cone (meia-abertura
//   `abertura` rad, ou a até `area` m do eixo) a cada `intervaloS`;
// - 'nova': onda em volta do monstro até `alcance` m (só com alguém dentro);
// - 'campo': área no chão embaixo do alvo, fere a cada `intervaloCampoS` por `vidaS`;
// - 'arma': a arma de NPC do original `kind` ('n511080'...), com o golpe dela inteiro
//   (todos; a armadilha do SN-Zero VI e o campo do SN-4 caem embaixo do alvo, a nova
//   abre em volta do monstro, as armadilhas da Medusa saem dela em volta e viram minas).
// `kind` é o tiro de NPC do catálogo ('laser' ou 'plasma'), para quem já desenha
// esses; `atq` é o nome do ataque no protocolo (o cliente desenha cada um do seu
// jeito: ver o comentário do topo de server/index.js). `efeito` vai no alvo (lento,
// desgoverno, sem tiro), com os mesmos efeitos das armas. `peso` é a chance de
// escolher o ataque entre os prontos, do original (cols 22–25 do initnpc).

import { ARMAS_NPC_ORIGINAL } from '../shared/armas-original.js';
import { FATOR_AREA, WEAPONS, versaoArma } from '../shared/armas.js';
import { FATOR_ESCALA_HP } from '../shared/naves.js';

/** Velocidade do original (m/ms) × 1000 × isto = m/s (metade do fator das naves: todo monstro mais lento que qualquer nave). */
export const FATOR_VEL_MONSTRO = 0.25;
/** SN-3 e SN-Zero VI: HP do original × isto (SN-3 2500 → 1000, SN-Zero VI 1200 → 480). */
export const FATOR_HP_M5 = 0.4;
/**
 * Dano das armas do original × isto, em todo monstro: 1/10 do original na escala das
 * naves (o HP e o dano do jogador são os do original, FATOR_ESCALA_HP = 1). Pedido do
 * Mateus (out/2026: "o dano da jungle está bem baixo"): antes cada espécie tinha o
 * seu, 10 a 200 vezes abaixo do original, escolhido pelo dano por segundo dos
 * monstros de antes. Igual ao original o acampamento de 4 SN-3 derrubaria a
 * primeira nave em menos de 1 s. Disco Voador 366 → 36,6 por disco; Canhão SN 6 166 →
 * 16,6 por bala; míssil cruzador do SN-4 333 → 33,3.
 */
export const FATOR_DANO_MONSTRO = FATOR_ESCALA_HP / 10;
/** SN-3 e SN-Zero VI: dano das armas do original × isto. */
export const FATOR_DANO_M5 = FATOR_DANO_MONSTRO;
/** Monstros com arma do original: recarga de cada arma e ritmo entre ataques × isto (2 = atacam na metade da velocidade). */
export const FATOR_RECARGA_ORIGINAL = 2;
/** @deprecated o nome antigo (era só do SN-3 e do SN-Zero VI): use FATOR_RECARGA_ORIGINAL. */
export const FATOR_RECARGA_M5 = FATOR_RECARGA_ORIGINAL;
/**
 * Medusa: recarga e ritmo entre ataques × isto, no lugar de FATOR_RECARGA_ORIGINAL (pedido
 * do Mateus: no ritmo do original ela atacava sem parar). 6 = um ataque a cada 1,5 s (o
 * ritmo dela antes das armas do original); pedra a cada 2,4 s, disparo de controle a
 * cada 1,5 s, armadilhas a cada 15 s. O dano de cada golpe não muda.
 */
export const FATOR_RECARGA_MEDUSA = 6;
/**
 * Recarga e ritmo entre ataques × isto, por espécie, no lugar de FATOR_RECARGA_ORIGINAL
 * (quem não está aqui fica nele; a Medusa usa FATOR_RECARGA_MEDUSA). O Xerxes, o
 * Grande Xerxes, o Bazit e o Anti atacam na metade do ritmo dos outros (pedido do
 * Mateus: atacavam tão seguido que a nave dos primeiros níveis não conseguia farmar a
 * jungle no começo). O dano de cada golpe não muda.
 */
export const FATOR_RECARGA_ESPECIE = {
  xerxes: FATOR_RECARGA_ORIGINAL * 2,
  great_xerxes: FATOR_RECARGA_ORIGINAL * 2,
  bazit: FATOR_RECARGA_ORIGINAL * 2,
  anti: FATOR_RECARGA_ORIGINAL * 2,
};
/**
 * Dano das armas do original × isto, por espécie (o SN-3 e o SN-Zero VI usam
 * FATOR_DANO_M5): troque um para ajustar só aquela espécie. A Medusa bate como no
 * original, na escala das naves (FATOR_ESCALA_HP, pedido do Mateus: chefe de time
 * inteiro; pedra 1333), no ritmo dela (FATOR_RECARGA_MEDUSA). O Magma do lança-chamas não passa por aqui (é o efeito da arma na escala
 * das do jogador: 100 e 150 de HP em 5 s).
 */
export const FATOR_DANO_ESPECIE = {
  xerxes: FATOR_DANO_MONSTRO,
  great_xerxes: FATOR_DANO_MONSTRO,
  bazit: FATOR_DANO_MONSTRO,
  anti: FATOR_DANO_MONSTRO,
  sn4: FATOR_DANO_MONSTRO,
  medusa: FATOR_ESCALA_HP,
};
/** Alcance máximo de um ataque com arma do original (m): o do Disco Voador do SN-3, perto da visão do time (550). */
export const ALCANCE_MAX_ORIGINAL = 480;
/** SN-4: a armadilha de campo elétrico cai embaixo do alvo a até isto (m), como o campo de antes. */
export const ALCANCE_CAMPO_SN4 = 200;
/** SN-3 e SN-Zero VI: XP do abate do original (col 30 do initnpc) × isto (75 → 23, 60 → 18). */
export const FATOR_XP_M5 = 0.3;
/** SN-3 e SN-Zero VI: ouro do abate por ponto de XP (o original não dá ouro; 0,9 era a relação dos pequenos de antes, 18 por 20). */
export const OURO_POR_XP_M5 = 0.9;
/**
 * A armadilha do SN-Zero VI ("Sn6Trap", 510373) é instalada no mapa pelo servidor do
 * original (código 2 da col 18: InstallMapItem), sem regra no cliente. Aqui ela cai
 * embaixo do alvo, quando ele está a até isto (m).
 */
export const ALCANCE_ARMADILHA = 150;
/** Território (m) que o monstro não passa: col 7 do initnpc (1000 nos comuns, 700 nos chefes) × 0,25. */
export const TERRITORIO_COMUM = 250;
export const TERRITORIO_CHEFE = 175;

/**
 * Ataque com a arma "(NPC)" `id` do original: dano do original × `fatorDano`; recarga
 * da arma convertida × FATOR_RECARGA_ORIGINAL; tipo de dano e alcance da arma
 * convertida (o voo do projétil, até ALCANCE_MAX_ORIGINAL; o raio da nova); `peso` do
 * initnpc. `forma: 'arma'`: o golpe é o da arma (server/jungle.js golpeDoAtaque).
 */
function ataqueDoOriginal(atq, id, peso, extra = {}, fatorDano = FATOR_DANO_M5, fatorRecarga = FATOR_RECARGA_ORIGINAL) {
  const kind = `n${id}`;
  const v = versaoArma(kind, 1);
  const original = ARMAS_NPC_ORIGINAL.find((a) => a.id === id).versoes[0].golpe;
  const g = v.golpe;
  const alcance = g.forma === 'projetil' ? Math.min(ALCANCE_MAX_ORIGINAL, Math.round(g.alcance)) : g.forma === 'nova' ? g.nova.raio : 0;
  return {
    atq,
    forma: 'arma',
    kind,
    peso,
    tipoDano: WEAPONS[kind].tipoDano,
    dano: +(original.dano * fatorDano).toFixed(3),
    intervaloS: v.cd * fatorRecarga,
    alcance,
    ...extra,
  };
}

/** O ritmo entre ataques de quem usa as armas `ids` do original: a recarga da mais rápida × `fator`. */
function ritmoDoOriginal(ids, fator = FATOR_RECARGA_ORIGINAL) {
  return Math.min(...ids.map((id) => WEAPONS[`n${id}`].versoes[0].cd)) * fator;
}

/** Números de um NPC do original (unidade do initunit.cfg e XP do initnpc.cfg) na escala do jogo. */
function doOriginal({ hp, velMs, raio, xp }) {
  const x = Math.round(xp * FATOR_XP_M5);
  return {
    hp: Math.round(hp * FATOR_HP_M5),
    velocidade: velMs * 1000 * FATOR_VEL_MONSTRO,
    raio: raio * FATOR_AREA,
    xp: x,
    ouro: Math.round(x * OURO_POR_XP_M5),
  };
}

export const ESPECIES = {
  // SN-3 (Stage M5): npc 705010, unidade 502020 "Sn-Three" (HP 2500, 0,15 m/ms, raio 49,
  // modelo NU0230: 92 m, ×0,25 = 23 m), XP 75. Armas: Disco Voador (511080, 70%) e
  // Míssil Descarregador de Energia (511090, 30%). O míssil azul, que tira toda a
  // energia da nave, só 1 em cada 4 SN-3 leva (pedido do Mateus): o primeiro de cada
  // quatro do acampamento, na ordem dos lugares (`ataquesDeUmEm`); os outros só têm o disco.
  sn3: {
    nome: 'SN-3',
    ...doOriginal({ hp: 2500, velMs: 0.15, raio: 49, xp: 75 }),
    tamanho: 23,
    entreAtaquesS: ritmoDoOriginal(['511080', '511090']),
    ataques: [ataqueDoOriginal('disco_voador', '511080', 70), ataqueDoOriginal('missil_descarga', '511090', 30)],
    ataquesDeUmEm: { missil_descarga: 4 },
  },
  // SN-Zero VI (Stage M5): npc 700405, unidade 500405 "Sn-Zero Unit6" (HP 1200, 0,17
  // m/ms, raio 47, modelo NU0045: corpo de 73 m, ×0,25 = 18 m, mais o cone de luz), XP
  // 60. Armas: Canhão SN 6 (510372, 70%) e Armadilha SN6 (510373, 30%).
  snzero: {
    nome: 'SN-Zero VI',
    ...doOriginal({ hp: 1200, velMs: 0.17, raio: 47, xp: 60 }),
    tamanho: 18,
    entreAtaquesS: ritmoDoOriginal(['510372', '510373']),
    ataques: [ataqueDoOriginal('canhao_sn6', '510372', 70), ataqueDoOriginal('armadilha_sn6', '510373', 30, { alcance: ALCANCE_ARMADILHA })],
  },
  // Xerxes (npc 705050): Lança-chamas (511150, 30%: rajada de 8 bolas de fogo que
  // atravessam, Magma de 100 em 5 s no alvo) e Canhão Explosivo de Longo Alcance
  // (511160, 70%: rajada de 2 balas com área).
  xerxes: {
    nome: 'Xerxes', hp: 1200, velocidade: 37, raio: 6, tamanho: 13, xp: 35, ouro: 28,
    entreAtaquesS: ritmoDoOriginal(['511150', '511160'], FATOR_RECARGA_ESPECIE.xerxes),
    ataques: [
      ataqueDoOriginal('lanca_chamas', '511150', 30, {}, FATOR_DANO_ESPECIE.xerxes, FATOR_RECARGA_ESPECIE.xerxes),
      ataqueDoOriginal('canhao_explosivo', '511160', 70, {}, FATOR_DANO_ESPECIE.xerxes, FATOR_RECARGA_ESPECIE.xerxes),
    ],
  },
  // Grande Xerxes (npc 705055): só o Lança-chamas grande (511155, 100%: Magma de 150).
  great_xerxes: {
    nome: 'Grande Xerxes', hp: 4500, velocidade: 30, raio: 11, tamanho: 26, xp: 90, ouro: 70,
    entreAtaquesS: ritmoDoOriginal(['511155'], FATOR_RECARGA_ESPECIE.great_xerxes),
    ataques: [ataqueDoOriginal('lanca_chamas_g', '511155', 100, {}, FATOR_DANO_ESPECIE.great_xerxes, FATOR_RECARGA_ESPECIE.great_xerxes)],
  },
  // Bazit (npc 705040): o Lançador de Feixe Óptico (511140) nos dois encaixes (50/50):
  // três feixes em leque de 5° que atravessam.
  bazit: {
    nome: 'Bazit', hp: 1200, velocidade: 37, raio: 6, tamanho: 13, xp: 35, ouro: 28,
    entreAtaquesS: ritmoDoOriginal(['511140'], FATOR_RECARGA_ESPECIE.bazit),
    ataques: [ataqueDoOriginal('feixe_optico_bazit', '511140', 100, {}, FATOR_DANO_ESPECIE.bazit, FATOR_RECARGA_ESPECIE.bazit)],
  },
  // Anti (npc 705060): Míssil de Longo Alcance (511170, 50%: quatro mísseis retos lado a
  // lado) e Canhão Teleguiado (511180, 50%: duas balas que viram atrás do mais perto e
  // explodem com área).
  anti: {
    nome: 'Anti', hp: 4500, velocidade: 30, raio: 11, tamanho: 26, xp: 90, ouro: 70,
    entreAtaquesS: ritmoDoOriginal(['511170', '511180'], FATOR_RECARGA_ESPECIE.anti),
    ataques: [
      ataqueDoOriginal('missil_longo', '511170', 50, {}, FATOR_DANO_ESPECIE.anti, FATOR_RECARGA_ESPECIE.anti),
      ataqueDoOriginal('canhao_teleguiado', '511180', 50, {}, FATOR_DANO_ESPECIE.anti, FATOR_RECARGA_ESPECIE.anti),
    ],
  },
  // SN-4 (chefe do Stage M5, npc 702600): Míssil Cruzador (550120: dez mísseis em volta,
  // a cada 36°, que viram atrás do alvo), Onda de Feixe Óptico (550130: nova que abre
  // em volta dele) e Campo Elétrico (550140: campo de 20 s que fere e zera as
  // resistências), 40/40/40.
  sn4: {
    nome: 'SN-4', hp: 10000, velocidade: 15, raio: 26, tamanho: 60, xp: 150, ouro: 100, territorio: TERRITORIO_CHEFE, chefe: true,
    entreAtaquesS: ritmoDoOriginal(['550120', '550130', '550140']),
    ataques: [
      ataqueDoOriginal('missil_cruzador', '550120', 40, {}, FATOR_DANO_ESPECIE.sn4),
      ataqueDoOriginal('onda_feixe', '550130', 40, {}, FATOR_DANO_ESPECIE.sn4),
      ataqueDoOriginal('campo_eletrico', '550140', 40, { alcance: ALCANCE_CAMPO_SN4 }, FATOR_DANO_ESPECIE.sn4),
    ],
  },
  // Ancient Medusa (chefe do Stage M6, npc 702700): Armadilha Paralisante (550150, 40:
  // 8 cargas em volta, a cada 45°, que freiam e viram minas de 30 s; com inimigo perto,
  // a mina solta um teleguiado que impede o tiro por 2,5 s), Disparo de Controle
  // (550160, 40: 10 tiros em leque de 36° com área, desgoverno de 3 s) e Canhão de
  // Pedra (550170, 70: 2 pedras que atravessam). Não se teleporta (decisão do Mateus):
  // fica no poço atirando, mais devagar que as armas do original (FATOR_RECARGA_MEDUSA).
  medusa: {
    nome: 'Medusa Anciã', hp: 60000, regenHpS: 50, velocidade: 12, raio: 20, tamanho: 48, alturaCentro: 18,
    xp: 220, ouro: 150, doTime: true, // XP e ouro para CADA piloto do time de quem deu o golpe final
    territorio: TERRITORIO_CHEFE, chefe: true,
    entreAtaquesS: ritmoDoOriginal(['550150', '550160', '550170'], FATOR_RECARGA_MEDUSA),
    ataques: [
      ataqueDoOriginal('armadilha_paralisante', '550150', 40, {}, FATOR_DANO_ESPECIE.medusa, FATOR_RECARGA_MEDUSA),
      ataqueDoOriginal('disparo_controle', '550160', 40, {}, FATOR_DANO_ESPECIE.medusa, FATOR_RECARGA_MEDUSA),
      ataqueDoOriginal('canhao_pedra', '550170', 70, {}, FATOR_DANO_ESPECIE.medusa, FATOR_RECARGA_MEDUSA),
    ],
  },
  sonda: {
    nome: 'Sonda Errante', hp: 1500, velocidade: 30, raio: 4, tamanho: 8, xp: 40, ouro: 35, foge: true,
    ataques: [],
  },
};

/** Maior alcance entre os ataques da espécie (0 sem ataque). */
export function alcanceMaximo(esp) {
  return Math.max(0, ...(ESPECIES[esp]?.ataques ?? []).map((a) => a.alcance));
}
