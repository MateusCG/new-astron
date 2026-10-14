// Catálogo das armas do jogo: as 140 armas das lojas do Astro-N original (Acron,
// Bellico e Shrewdo; dados em shared/armas-original.js, gerado por
// tools/gerar_armas.mjs) convertidas para a escala do jogo novo, e os tiros próprios
// dos NPCs (torretas, escolta, drones Arnosh, Krakor e guardião), que ficam fora do
// catálogo do jogador.
//
// Mesmo arquivo no servidor e no cliente, e determinístico (sem sorte, sem relógio):
// o stepShip lê daqui a recarga, a energia, a rajada e o padrão dos canos de cada
// versão, e a predição tem de bater com o servidor.
//
// Como o original vira jogo novo (fatores nomeados, os mesmos das naves em
// shared/naves.js):
// - HP e dano ÷ 5 (FATOR_DANO); energia por disparo × 0,3 (FATOR_ENERGIA_ARMA, o
//   mesmo da energia das naves); recarga e intervalo da rajada × 0,5
//   (FATOR_RECARGA_ARMA; a regeneração de energia das naves já conta com isso).
// - Velocidade m/ms × 1000 × 0,5 = m/s (FATOR_VEL); alcance da mira, do teleporte e
//   das minas que atiram × 0,5 (FATOR_ALCANCE): a vida do projétil fica igual, então
//   o tempo de voo, que é o que quem joga sente, também.
// - Raios de colisão e de área, vão entre os canos e raio da nova × 0,25
//   (FATOR_AREA): as naves do original têm ~40 m de envergadura, as do jogo ~9 m.
// - Durações de efeito iguais (FATOR_EFEITO); preço em ouro × 0,06 (FATOR_OURO).
// - Quem acelera ou freia (mísseis, ondas, lâminas) voa a uma velocidade constante:
//   a média do original (alcance ÷ vida), com o mesmo alcance e o mesmo tempo.
// - O projétil acerta com no mínimo RAIO_TIRO_MIN de raio: no original o tiro de
//   1 m acertava naves de ~40 m; aqui a nave tem 4,5 m de raio e sem essa folga quase
//   nada acertaria (o laser de antes já usava 5).
//
// Versões: cada arma tem as versões V1 a V5 do original, que são os NÍVEIS 1 a 5 da
// arma (versaoArma). Evoluir na Loja pede o nível do piloto da versão (1, 5, 10, 15,
// 20) e o preço da taxa de tuning do original (sem chance de falhar). A versão muda
// tudo: dano, recarga, energia, número de projéteis, efeito.
//
// O golpe (o que a arma cria) tem uma FORMA, e cada forma o servidor implementa uma
// vez (server/golpes.js): 'projetil' (canos, leque, rajada, atravessar, área no
// impacto, explodir no fim, dividir em subprojéteis, teleguiado, mira travada, onda
// que cresce), 'nova' (esfera que cresce parada), 'mina' (parada no chão: explode ou
// atira com inimigo perto), 'campo' (área parada que fere quem fica dentro) e
// 'efeito' (sem projétil: dispositivo na própria nave, inclusive os de segurar a
// tecla e o teleporte). Os efeitos (EFEITOS) dizem em quem pegam: inimigo
// (debuff), aliado (suporte), a própria nave (reforço) ou especial (rebater tiros,
// desarmar minas).

import { ARMAS_ORIGINAL, EFEITOS_VISUAIS } from './armas-original.js';
import { FATOR_ESCALA_HP, FATOR_ENERGIA, FATOR_RECARGA, FATOR_VELOCIDADE } from './naves.js';

export { EFEITOS_VISUAIS };

export const FATOR_DANO = FATOR_ESCALA_HP; // 0,2: dano, cura e HP dos efeitos
export const FATOR_ENERGIA_ARMA = FATOR_ENERGIA; // 0,3: energia por disparo (e por s nas de segurar)
export const FATOR_RECARGA_ARMA = FATOR_RECARGA; // 0,5: recarga e intervalo da rajada
export const FATOR_VEL = FATOR_VELOCIDADE; // 0,5: m/ms × 1000 × FATOR_VEL = m/s
export const FATOR_ALCANCE = 0.5; // mira, teleporte, ativação da mina que atira
export const FATOR_AREA = 0.25; // raios, vão entre canos, nova
export const FATOR_EFEITO = 1; // durações de efeito
export const FATOR_OURO = 0.06; // preço de compra e de evolução
export const MS = 1000;

export const RAIO_TIRO_MIN = 4; // m: raio de acerto mínimo de projétil
export const NIVEL_ARMA_MAX = 5; // V1..V5
export const PRECO_MIN = 60; // ouro: a arma mais barata

// Projétil e área.
export const MISSIL_CONE = 0.6; // rad: teleguiado sem mira persegue quem está neste cone à frente dele
export const MIRA_CONE = 0.7; // rad: "alvo à frente" vale até este desvio do nariz
export const MIRA_RAIO_PADRAO = 250; // m: mira sem raio no original usa o alcance do projétil, até isto
export const NOVA_CRESCE_INSTANTE = 0; // nova sem velocidade de crescer acontece na hora
// Minas: armam depois de MINA_ARMA_S; o gatilho é o raio de ativação do original ×
// FATOR_AREA mais MINA_GATILHO_BASE (a nave aqui é pequena, o gatilho do original
// contava com naves de ~40 m). A que atira usa o raio de ativação × FATOR_ALCANCE.
export const MINA_ARMA_S = 0.5;
export const MINA_GATILHO_BASE = 8; // m
export const MINA_MAX = 8; // minas e campos ativos por piloto (soltar mais tira o mais velho)
export const MINA_ATRAS = 9; // m atrás da nave, onde nasce o que é solto parado
export const CAMPO_INTERVALO_S = 0.5; // s entre um dano e outro do campo (quando o original não diz)

// Efeitos (conversões que o original não tem igual; ver EFEITOS).
export const VULNERAVEL_ZERA = 0.25; // "zera a resistência": +25% de dano daquele tipo
export const RESIST_POR_PONTO = 0.005; // resistência em pontos (40) → fração do dano (20%)
export const RESIST_MAX = 0.75; // nenhuma resistência segura mais que isso
export const ESCUDO_EQUIV_HP = 0.15; // "escudo" do original = esta fração do HP máximo
export const REGEN_ESCUDO_FRAC = 0.01; // "+100% de recuperação do escudo" = 1% do HP máximo por s
export const ENERGIA_POR_HP_FATOR = 1.8; // Amplificador de Energia: valor × isto = energia por s
export const CONVERTE_ENERGIA_POR_HP = 0.5; // Conversor de Impacto: energia gasta por HP convertido

/** Nome de cada categoria (a forma da arma no original), na ordem do menu e da Loja. */
export const CATEGORIAS = {
  beam: 'Feixe',
  gun: 'Metralhadora',
  canhao: 'Canhão',
  missil: 'Míssil',
  raio: 'Raio',
  onda: 'Onda',
  lamina: 'Lâmina',
  lancador: 'Lançador',
  mina: 'Mina',
  nova: 'Nova',
  suporte: 'Suporte',
  dispositivo: 'Dispositivo',
  npc: 'NPC',
};
export const ORDEM_CATEGORIAS = Object.keys(CATEGORIAS);

/** Papel da arma no original: ataque, bloqueio (debuff), reforço (autobuff) e suporte. */
export const PAPEIS = { ataque: 'Ataque', bloqueio: 'Bloqueio', reforco: 'Reforço', suporte: 'Suporte' };
export const TIPOS_DANO = { laser: 'Laser', fisico: 'Físico', eletrico: 'Elétrico' };

/**
 * Armas iniciais de cada raça (as duas mais baratas que todas as classes usam: um
 * feixe no Z e uma metralhadora no X). Toda nave da raça tem e nunca perde.
 */
export const INICIAIS_ORIGINAL = {
  acron: ['111001', '111011'], // Feixe Rifle Triplo, Vulcan Acron
  bellico: ['211001', '211011'], // Feixe Bellico, Vulcan Bellico
  shrewdo: ['311001', '311004'], // Feixe Duplo, Metralha Shrewdo
};

// ---------- Efeitos ----------

/**
 * Cada mecânica do original (código do inititemweapon.cfg) vira um efeito do jogo:
 * { tipo, alvo, ... }. alvo: 'inimigo' (debuff em quem o golpe pega), 'aliado'
 * (suporte), 'proprio' (dispositivo na própria nave) ou 'especial' (age em tiros e
 * minas). Números já na escala do jogo (dur em s). Quem aplica é o servidor
 * (server/golpes.js); o que mexe em movimento, tiro ou energia vai para a nave e o
 * stepShip lê (a predição bate).
 */
function converterEfeito(e, versao) {
  const dur = ((e.ms ?? 0) / MS) * FATOR_EFEITO;
  const v = e.v ?? 0;
  const raio = e.raio ? e.raio * FATOR_AREA : 0;
  const hpPorS = (versao?.hpPorS ?? 0) * FATOR_DANO;
  switch (e.t) {
    case 'drenoHp':
      return { tipo: 'dreno', alvo: 'inimigo', dps: dur ? (v * FATOR_DANO) / dur : 0, dur, raio };
    case 'superaquece':
      return { tipo: 'dreno', alvo: 'inimigo', dps: v * FATOR_DANO, dur, raio };
    case 'drenoEscudoEnergia':
      return { tipo: 'drenoDuplo', alvo: 'inimigo', dps: dur ? (v * FATOR_DANO) / dur : 0, enPs: dur ? (v * FATOR_ENERGIA_ARMA) / dur : 0, dur, raio };
    case 'drenoEnergiaTempo':
      return { tipo: 'drenoEn', alvo: 'inimigo', enPs: dur ? (v * FATOR_ENERGIA_ARMA) / dur : 0, dur, raio };
    case 'lento':
      return { tipo: 'lento', alvo: 'inimigo', mult: Math.max(0, 1 - v / 100), dur, raio };
    case 'paralisaMovimento':
      return { tipo: 'lento', alvo: 'inimigo', mult: 0, dur, raio };
    case 'travaAceleracao':
      return { tipo: 'trava', alvo: 'inimigo', dur, raio };
    case 'paralisaTudo':
      return { tipo: 'paralisa', alvo: 'inimigo', dur, raio };
    case 'paralisaAtaque':
      return { tipo: 'semTiro', alvo: 'inimigo', dur, raio };
    case 'descarregaEnergia':
      return { tipo: 'descarga', alvo: 'inimigo', frac: Math.min(1, v / 100), raio };
    case 'roubaEnergia':
      return { tipo: 'roubaEn', alvo: 'inimigo', qtd: v * FATOR_ENERGIA_ARMA, frac: (e.v2 ?? 100) / 100, raio };
    case 'cortaRegenEnergia':
      return { tipo: 'semRegen', alvo: 'inimigo', dur, raio };
    case 'encareceEnergia':
      return { tipo: 'enCara', alvo: 'inimigo', mult: 1 + v / 100, dur, raio };
    case 'cadenciaInimigo':
      return { tipo: 'cadencia', alvo: 'inimigo', mult: 1 + v / 100, dur, raio };
    case 'enfraquece':
      return { tipo: 'fraco', alvo: 'inimigo', mult: Math.max(0, 1 - v / 100), dur, raio };
    case 'quebraResistencias':
      return { tipo: 'vulneravel', alvo: 'inimigo', k: v / 100, tipoDano: null, dur, raio };
    case 'zeraResistFisica':
      return { tipo: 'vulneravel', alvo: 'inimigo', k: VULNERAVEL_ZERA, tipoDano: 'fisico', dur, raio };
    case 'zeraResistLaser':
      return { tipo: 'vulneravel', alvo: 'inimigo', k: VULNERAVEL_ZERA, tipoDano: 'laser', dur, raio };
    case 'descarregaEscudoParcial':
      return { tipo: 'quebraEscudo', alvo: 'inimigo', frac: ((e.v2 ?? 0) / 100) * ESCUDO_EQUIV_HP, raio };
    case 'cegaRadar':
      return { tipo: 'cego', alvo: 'inimigo', dur, raio };
    case 'atrapalhaControle':
      return { tipo: 'desgoverno', alvo: 'inimigo', dur, raio };
    case 'devolveDano':
      return { tipo: 'recuo', alvo: 'inimigo', frac: v / 100, dur, raio };
    case 'revelaInvisivel':
      return { tipo: 'revela', alvo: 'inimigo', dur, raio };
    // Na própria nave (dispositivos).
    case 'invisivel':
      return { tipo: 'invisivel', alvo: 'proprio', dur };
    case 'invisivelSegurando':
      return { tipo: 'invisivel', alvo: 'proprio', segurar: true };
    case 'aceleraSegurando':
      return { tipo: 'acelera', alvo: 'proprio', segurar: true, mult: 1 + v / 100 };
    case 'aceleraPorHp':
      return { tipo: 'acelera', alvo: 'proprio', segurar: true, mult: 1 + v / 100, hpPorS };
    case 'energiaPorHp':
      return { tipo: 'energiaPorHp', alvo: 'proprio', segurar: true, enPs: v * ENERGIA_POR_HP_FATOR, hpPorS };
    case 'bloqueiaDanoDireto':
      return { tipo: 'invulneravel', alvo: 'proprio', dur };
    case 'protecaoAbsorve':
      return { tipo: 'escudo', alvo: 'proprio', frac: v / 100, dur };
    case 'resistFisica':
      return { tipo: 'resiste', alvo: 'proprio', tipoDano: 'fisico', frac: Math.min(RESIST_MAX, v * RESIST_POR_PONTO), dur };
    case 'resistEletrica':
      return { tipo: 'resiste', alvo: 'proprio', tipoDano: 'eletrico', frac: Math.min(RESIST_MAX, v * RESIST_POR_PONTO), dur };
    case 'resistLaser':
      return { tipo: 'resiste', alvo: 'proprio', tipoDano: 'laser', frac: Math.min(RESIST_MAX, v / 100), dur };
    case 'converteDano':
      return { tipo: 'converte', alvo: 'proprio', frac: v, dur };
    case 'regenEscudoPorEnergia':
      return { tipo: 'regen', alvo: 'proprio', segurar: true, fracPorS: (REGEN_ESCUDO_FRAC * v) / 100 };
    case 'regenEscudoPorHp':
      return { tipo: 'regen', alvo: 'proprio', segurar: true, fracPorS: (REGEN_ESCUDO_FRAC * v) / 100, hpPorS };
    case 'regenEscudoSegurando':
      return { tipo: 'regen', alvo: 'proprio', segurar: true, parado: true, fracPorS: (REGEN_ESCUDO_FRAC * v) / 100 };
    case 'regenEscudoTempo':
      return { tipo: 'regen', alvo: 'proprio', fracPorS: (REGEN_ESCUDO_FRAC * v) / 100, dur };
    case 'teleporte':
      return { tipo: 'teleporte', alvo: 'proprio', dist: (e.raio ?? 0) * FATOR_ALCANCE };
    case 'zeraPropriaEnergia':
      return { tipo: 'zeraPropria', alvo: 'proprio' };
    // Suporte (aliados).
    case 'curaHp':
      return { tipo: 'cura', alvo: 'aliado', hp: v * FATOR_DANO, raio };
    case 'curaAliadosTempo':
      return { tipo: 'curaTempo', alvo: 'aliado', hps: dur ? (v * FATOR_DANO) / dur : 0, dur, raio };
    case 'recarregaEscudoArea':
      return { tipo: 'curaFrac', alvo: 'aliado', frac: v / 100, raio, semProprio: true };
    case 'doaEnergiaArea':
      return { tipo: 'doaEnergia', alvo: 'aliado', frac: v / 100, raio, semProprio: true };
    case 'removeParalisia':
      return { tipo: 'limpa', alvo: 'aliado', raio };
    // Especiais (tiros e minas).
    case 'removeArmadilhas':
      return { tipo: 'desarma', alvo: 'especial', frac: Math.min(1, v / 100), raio };
    case 'rebateProjeteis':
      return { tipo: 'rebate', alvo: 'especial', raio };
    default:
      throw new Error(`efeito do original sem conversão: ${e.t}`);
  }
}

/** Texto curto de um efeito para o menu e a Loja (números do jogo). */
export function textoEfeito(ef) {
  const s = (x) => `${(+x.toFixed(1)).toLocaleString('pt-BR')}`;
  const p = (x) => `${Math.round(x * 100)}%`;
  const d = ef.dur ? ` por ${s(ef.dur)} s` : '';
  switch (ef.tipo) {
    case 'dreno':
      return `Dreno: ${s(ef.dps)} HP/s${d}`;
    case 'drenoDuplo':
      return `Dreno: ${s(ef.dps)} HP/s e ${s(ef.enPs)} energia/s${d}`;
    case 'drenoEn':
      return `Tira ${s(ef.enPs)} de energia/s${d}`;
    case 'lento':
      return ef.mult === 0 ? `Paralisa o movimento${d}` : `Lento: −${p(1 - ef.mult)} de velocidade${d}`;
    case 'trava':
      return `Trava aceleração e freio${d}`;
    case 'paralisa':
      return `Paralisa movimento e tiro${d}`;
    case 'semTiro':
      return `Paralisa o tiro${d}`;
    case 'descarga':
      return `Descarrega ${p(ef.frac)} da energia`;
    case 'roubaEn':
      return `Rouba ${s(ef.qtd)} de energia`;
    case 'semRegen':
      return `Corta a regeneração de energia${d}`;
    case 'enCara':
      return `Tiro do alvo gasta +${p(ef.mult - 1)} de energia${d}`;
    case 'cadencia':
      return `Recarga do alvo +${p(ef.mult - 1)}${d}`;
    case 'fraco':
      return `Dano do alvo −${p(1 - ef.mult)}${d}`;
    case 'vulneravel':
      return `Alvo leva +${p(ef.k)} de dano${ef.tipoDano ? ` ${TIPOS_DANO[ef.tipoDano].toLowerCase()}` : ''}${d}`;
    case 'quebraEscudo':
      return `Tira ${p(ef.frac)} do HP máximo na hora`;
    case 'cego':
      return `Desliga o radar do alvo${d}`;
    case 'desgoverno':
      return `Inverte o controle do alvo${d}`;
    case 'recuo':
      return `Alvo leva de volta ${p(ef.frac)} do dano que causar${d}`;
    case 'revela':
      return `Revela invisíveis${d}`;
    case 'invisivel':
      return ef.segurar ? 'Invisível enquanto segura' : `Invisível${d}`;
    case 'acelera':
      return `Velocidade +${p(ef.mult - 1)} enquanto segura${ef.hpPorS ? `, gasta ${s(ef.hpPorS)} HP/s` : ''}`;
    case 'energiaPorHp':
      return `+${s(ef.enPs)} energia/s, gasta ${s(ef.hpPorS)} HP/s, enquanto segura`;
    case 'invulneravel':
      return `Invulnerável${d}`;
    case 'escudo':
      return `Escudo de ${p(ef.frac)} do HP máximo${d}`;
    case 'resiste':
      return `Resiste ${p(ef.frac)} do dano ${TIPOS_DANO[ef.tipoDano].toLowerCase()}${d}`;
    case 'converte':
      return `${p(ef.frac)} do dano recebido vira cura${d}`;
    case 'regen':
      return `Conserta ${p(ef.fracPorS)} do HP/s${ef.segurar ? ' enquanto segura' : d}${ef.parado ? ' (parada)' : ''}`;
    case 'teleporte':
      return `Teleporte de até ${Math.round(ef.dist)} m à frente`;
    case 'zeraPropria':
      return 'Gasta toda a energia';
    case 'cura':
      return `Cura ${s(ef.hp)} HP dos aliados`;
    case 'curaTempo':
      return `Cura ${s(ef.hps * ef.dur)} HP do aliado em ${s(ef.dur)} s`;
    case 'curaFrac':
      return `Cura ${p(ef.frac)} do HP dos aliados`;
    case 'doaEnergia':
      return `Dá ${p(ef.frac)} da energia aos aliados`;
    case 'limpa':
      return 'Tira paralisia e lentidão dos aliados';
    case 'desarma':
      return `Destrói ${p(ef.frac)} das minas inimigas por perto`;
    case 'rebate':
      return 'Rebate os tiros inimigos por perto';
    default:
      return ef.tipo;
  }
}

// ---------- Golpes ----------

const rad = (graus) => (graus * Math.PI) / 180;

/**
 * Padrão dos projéteis de um disparo: [{ off, ang }] (off = deslocamento lateral em
 * m, + = direita; ang = desvio do rumo em rad, + = esquerda, como o yaw). Leque
 * (graus entre projéteis a partir do ângulo inicial) ou canos paralelos (vão entre
 * eles), como no original.
 */
function padraoTiros(o) {
  const n = Math.max(1, o.n ?? 1);
  const a0 = o.a0 ?? 0;
  if (n > 1 && (o.leque ?? 0) >= 1) return Array.from({ length: n }, (_, i) => ({ off: 0, ang: -rad(a0 + i * o.leque) }));
  const vao = (o.vao ?? 0) * FATOR_AREA;
  return Array.from({ length: n }, (_, i) => ({ off: n > 1 ? +(i * vao - ((n - 1) * vao) / 2).toFixed(3) : 0, ang: a0 ? -rad(a0) : 0 }));
}

/** Golpe do original (shared/armas-original.js) na escala do jogo. prof = profundidade (0 = o disparo). */
function converterGolpe(o, versao, prof = 0) {
  const g = {
    forma: o.forma,
    prof,
    dano: (o.dano ?? 0) * FATOR_DANO,
    efeitos: (o.efeitos ?? []).map((e) => converterEfeito(e, versao)),
    area: (o.area ?? 0) * FATOR_AREA,
    vis: o.vis ?? {},
  };
  if (o.som) g.som = o.som;
  if (o.somImpacto) g.somImpacto = o.somImpacto;
  if (o.forma === 'efeito') {
    return g;
  }
  Object.assign(g, {
    raio: Math.max(RAIO_TIRO_MIN, (o.raio ?? 0) * FATOR_AREA),
    vida: (o.vidaMs ?? 0) / MS,
    atravessa: !!o.atravessa,
    inimigo: !!o.inimigo,
    aliado: !!o.aliado,
    fim: !!o.fim,
  });
  if (o.forma === 'nova') {
    // Nova: esfera que cresce até o raio máximo (ou a área, na nova sem esfera).
    const raio = o.nova ? o.nova.raio * FATOR_AREA : g.area;
    g.nova = { raio, vel: o.nova ? o.nova.cresce * MS * FATOR_AREA : NOVA_CRESCE_INSTANTE };
    g.area = raio;
    return g;
  }
  if (o.forma === 'mina' || o.forma === 'campo') {
    const m = o.mina ?? {};
    g.vida = (o.vidaMs ?? 0) / MS;
    g.armaS = MINA_ARMA_S;
    if (o.forma === 'campo') {
      g.area = (o.raio ?? 0) * FATOR_AREA;
      g.intervalo = o.intervaloMs ? o.intervaloMs / MS : CAMPO_INTERVALO_S;
    } else {
      g.gatilho = MINA_GATILHO_BASE + (m.gatilho ?? 0) * FATOR_AREA;
      // Explode com área (a do original, ou o próprio gatilho quando não tem).
      if (!g.area) g.area = Math.max(g.gatilho, (o.raio ?? 0) * FATOR_AREA);
      if (o.dispara) {
        // Mina que atira: com inimigo a este raio, dispara o subprojétil em cada um e some.
        g.atira = MINA_GATILHO_BASE + (m.ativaParam || m.raioDisparo || 0) * FATOR_ALCANCE;
        g.dispara = converterGolpe(o.dispara, versao, prof + 1);
      }
    }
    return g;
  }
  // Projétil.
  const vel = (o.velMedia || o.vel || 0) * MS * FATOR_VEL;
  Object.assign(g, {
    vel,
    tiros: padraoTiros(o),
    rajada: o.rajada > 1 ? o.rajada : 1,
    rajadaS: o.rajada > 1 ? ((o.rajadaMs ?? 0) / MS) * FATOR_RECARGA_ARMA : 0,
    varre: o.varre ? { passo: rad(o.varre.passo) * (o.varre.modo === 'gira_anti_horario' ? 1 : -1), abre: o.varre.modo === 'abre_o_vao' } : null,
    alcance: vel * g.vida,
  });
  if (o.cresce) {
    // Onda: o raio de acerto cresce em voo até o da esfera do original.
    g.cresce = { raio: o.cresce.raio * FATOR_AREA, vel: o.cresce.cresce * MS * FATOR_AREA };
    g.area = 0; // a própria onda é a área
  }
  if (o.guia) g.guia = { comeca: (o.guia.comecaMs ?? 0) / MS, giro: rad(o.guia.giro), cone: MISSIL_CONE, alcance: Math.max(g.alcance, 60) };
  if (o.mira) g.mira = { modo: o.mira.modo, raio: o.mira.raio ? o.mira.raio * FATOR_ALCANCE : Math.min(MIRA_RAIO_PADRAO, Math.max(g.alcance, 60)) };
  if (o.divide) {
    g.divide = converterGolpe(o.divide, versao, prof + 1);
    g.divideNoChao = !!o.divideNoChao;
  }
  return g;
}

/**
 * Projéteis de um disparo da rajada (k = 0 o primeiro): o padrão do golpe girado
 * pela varredura (o original gira o padrão a cada tiro da rajada, ou abre o vão).
 */
export function tirosDoGolpe(g, k = 0) {
  if (!k || !g.varre) return g.tiros;
  const n = g.tiros.length;
  if (g.varre.abre) return g.tiros.map((t, i) => ({ off: t.off, ang: t.ang - k * Math.abs(g.varre.passo) * (i - (n - 1) / 2) }));
  return g.tiros.map((t) => ({ off: t.off, ang: t.ang + k * g.varre.passo }));
}

/** O golpe pode ser previsto pelo cliente (projétil reto, sem curva, sem divisão)? */
export function golpePrevisivel(g) {
  return g.forma === 'projetil' && g.vel > 0 && !g.guia && !g.mira && !g.divide && !g.cresce;
}

// ---------- Catálogo ----------

/** Funções no menu e na Loja: dano (ataque) ou controle (o resto). */
function funcaoDe(papel) {
  return papel === 'ataque' ? 'dano' : 'controle';
}

function converterArma(a) {
  let custo = 0;
  const versoes = a.versoes.map((v, i) => {
    const anterior = a.versoes[i - 1];
    const golpe = converterGolpe(v.golpe, v);
    const segurar = !!v.segurar;
    const versao = {
      nivel: i + 1,
      id: v.id,
      nivelPiloto: v.nivel, // nível do piloto exigido (1, 5, 10, 15, 20)
      // Ouro para chegar a esta versão: a V1 é a compra; as seguintes, a taxa de tuning da anterior.
      preco: i === 0 ? Math.max(PRECO_MIN, Math.round((v.preco * FATOR_OURO) / 10) * 10) : Math.round((anterior.taxa * FATOR_OURO) / 10) * 10,
      cd: ((v.recargaMs ?? 0) / MS) * FATOR_RECARGA_ARMA,
      energia: (v.energia ?? 0) * FATOR_ENERGIA_ARMA, // por disparo; por segundo nas de segurar
      segurar,
      hpPorS: (v.hpPorS ?? 0) * FATOR_DANO,
      golpe,
      som: v.som ?? a.som,
      zeraEnergia: golpe.efeitos.some((e) => e.tipo === 'zeraPropria'),
    };
    custo += versao.preco;
    versao.custoTotal = custo;
    return versao;
  });
  const v1 = versoes[0];
  return {
    chave: 'o' + a.id,
    id: a.id,
    nome: a.nome,
    nomeEn: a.nomeEn,
    raca: a.raca,
    classes: a.classes,
    categoria: a.categoria,
    papel: a.papel,
    funcao: funcaoDe(a.papel),
    tipoDano: a.tipoDano,
    icone: a.icone,
    modelo: a.modelo, // [esquerda, direita] em public/modelos/armas
    som: a.som,
    somImpacto: a.somImpacto ?? null,
    versoes,
    preco: v1.preco,
    // Atalhos da V1 (o menu e quem não olha a versão).
    dano: v1.golpe.dano,
    cd: v1.cd,
    energia: v1.energia,
    vel: v1.golpe.vel,
    vida: v1.golpe.vida,
    raio: v1.golpe.raio,
  };
}

/**
 * Tiros dos NPCs (fora do catálogo do jogador): o laser das torretas, da escolta e
 * dos drones Arnosh, e o plasma do cuspe do Krakor e do guardião. Mesmos números de
 * antes do catálogo do original, para eles se comportarem igual.
 */
export const NPC_LASER = { dano: 12, vel: 340, cd: 0.16, energia: 2, vida: 1.3, raio: 5 };
export const NPC_PLASMA = { dano: 42, vel: 190, cd: 0.9, energia: 14, vida: 2.2, raio: 6.5 };

function armaNpc(chave, nome, n, tipoDano) {
  const golpe = {
    forma: 'projetil',
    prof: 0,
    dano: n.dano,
    efeitos: [],
    area: 0,
    raio: n.raio,
    vida: n.vida,
    vel: n.vel,
    inimigo: true,
    tiros: [{ off: 0, ang: 0 }],
    rajada: 1,
    rajadaS: 0,
    alcance: n.vel * n.vida,
    vis: {},
  };
  const versao = { nivel: 1, nivelPiloto: 1, preco: 0, custoTotal: 0, cd: n.cd, energia: n.energia, segurar: false, hpPorS: 0, golpe, som: null };
  return {
    chave,
    nome,
    npc: true,
    raca: null,
    classes: [],
    categoria: 'npc',
    papel: 'ataque',
    funcao: 'dano',
    tipoDano,
    modelo: null,
    som: null,
    versoes: [versao],
    preco: 0,
    ...n,
  };
}

/** Todas as armas por chave: NPCs ('laser', 'plasma') e as do original ('o111001'...). */
export const WEAPONS = {
  laser: armaNpc('laser', 'Laser', NPC_LASER, 'laser'),
  plasma: armaNpc('plasma', 'Plasma', NPC_PLASMA, 'eletrico'),
  ...Object.fromEntries(ARMAS_ORIGINAL.map((a) => [`o${a.id}`, converterArma(a)])),
};

/**
 * Índice de cada arma (os campos `a` e `a2` do comando são índices aqui). Os tiros
 * dos NPCs são os primeiros; as do original seguem a ordem das lojas. Arma nova
 * entra no fim, para não mudar o índice das outras.
 */
export const ARMAS = Object.keys(WEAPONS);
export const IDX_ARMA = Object.fromEntries(ARMAS.map((k, i) => [k, i]));
for (const [k, w] of Object.entries(WEAPONS)) w.idx = IDX_ARMA[k];

/** Índices dos tiros dos NPCs (padrão de nave sem raça jogável: drones e monstros). */
export const ARMAS_NPC = [IDX_ARMA.laser, IDX_ARMA.plasma];

/** Índice da arma do original pelo id ('311001'), ou undefined. */
export function idxOriginal(id) {
  return IDX_ARMA['o' + id];
}

/** Armas iniciais (índices) da raça, [Z, X]; nave sem raça jogável fica com os tiros de NPC. */
export function armasIniciais(race) {
  const ids = INICIAIS_ORIGINAL[race];
  return ids ? ids.map(idxOriginal) : [...ARMAS_NPC];
}

const DISPONIVEIS = new Map();
/**
 * Armas (índices) que a raça e a classe podem usar e comprar, na ordem do
 * catálogo. Raça sem armas (mechan, monstros) só tem os tiros de NPC.
 */
export function armasDisponiveis(race, classe) {
  const chave = `${race}:${classe}`;
  if (!DISPONIVEIS.has(chave)) {
    const lista = INICIAIS_ORIGINAL[race]
      ? ARMAS.map((_, i) => i).filter((i) => {
          const w = WEAPONS[ARMAS[i]];
          return !w.npc && w.raca === race && (classe === undefined || w.classes.includes(classe));
        })
      : [...ARMAS_NPC];
    DISPONIVEIS.set(chave, lista);
  }
  return DISPONIVEIS.get(chave);
}

/** A raça e a classe podem usar a arma de índice a? */
export function armaDisponivel(race, classe, a) {
  return armasDisponiveis(race, classe).includes(a);
}

/** Nível válido de arma (1 a NIVEL_ARMA_MAX); qualquer outra coisa vira 1. */
export function nivelArmaValido(n) {
  return Number.isInteger(n) && n >= 1 ? Math.min(n, NIVEL_ARMA_MAX) : 1;
}

/** A versão da arma (chave ou índice) no nível (1 a 5): números na escala do jogo. */
export function versaoArma(arma, nivel = 1) {
  const w = typeof arma === 'number' ? WEAPONS[ARMAS[arma]] : WEAPONS[arma];
  if (!w) return null;
  return w.versoes[Math.min(nivelArmaValido(nivel), w.versoes.length) - 1];
}

/**
 * O golpe de profundidade `prof` da versão (0 = o disparo; 1 = o subprojétil ou o
 * que a mina dispara; e assim por diante). Cada golpe tem no máximo um filho.
 */
export function golpeDaArma(arma, nivel = 1, prof = 0) {
  let g = versaoArma(arma, nivel)?.golpe ?? null;
  for (let i = 0; i < prof && g; i++) g = g.divide ?? g.dispara ?? null;
  return g;
}

/** Preço (ouro) para levar a arma do nível `nivel` ao seguinte; null no máximo. */
export function precoEvoluirArma(arma, nivel) {
  const w = typeof arma === 'number' ? WEAPONS[ARMAS[arma]] : WEAPONS[arma];
  if (!w || w.npc || !Number.isInteger(nivel) || nivel < 1 || nivel >= w.versoes.length) return null;
  return w.versoes[nivel].preco;
}

/** Nível do piloto exigido para a arma no nível `nivel` (1, 5, 10, 15, 20). */
export function nivelPilotoDaVersao(arma, nivel) {
  return versaoArma(arma, nivel)?.nivelPiloto ?? 1;
}

/**
 * Resumo de uma versão para o menu e a Loja: dano por disparo (todos os projéteis e
 * a rajada), por segundo, recarga, energia e o texto dos efeitos (inclusive dos
 * subprojéteis).
 */
export function resumoVersao(v) {
  const g = v.golpe;
  const efeitos = [];
  const coletar = (x) => {
    if (!x) return;
    for (const e of x.efeitos ?? []) if (e.tipo !== 'zeraPropria' || v.zeraEnergia) efeitos.push(textoEfeito(e));
    coletar(x.divide);
    coletar(x.dispara);
  };
  coletar(g);
  // Dano do disparo: o golpe que machuca (o próprio ou o subprojétil) × projéteis × rajada.
  let x = g;
  let mult = 1;
  while (x && !(x.dano > 0)) {
    mult *= x.tiros?.length ?? 1;
    x = x.divide ?? x.dispara;
  }
  let dano = 0;
  if (x) {
    mult *= (x.tiros?.length ?? 1) * (x === g ? (g.rajada ?? 1) : 1);
    dano = x.dano * mult;
  }
  return {
    dano: +dano.toFixed(1),
    danoProjetil: +(x?.dano ?? 0).toFixed(1),
    dps: v.cd > 0 ? +(dano / v.cd).toFixed(1) : 0,
    cd: +v.cd.toFixed(2),
    energia: +v.energia.toFixed(1),
    segurar: v.segurar,
    alcance: g.forma === 'projetil' ? Math.round(g.alcance) : Math.round(g.area || 0),
    area: Math.round(g.area || x?.area || 0),
    efeitos,
  };
}

/** Efeitos visuais de um golpe: { d, p, r, i, f, a } -> { texturas, cor } (ou null). */
export function visualEfeito(id) {
  const e = id ? EFEITOS_VISUAIS[id] : null;
  return e ? { texturas: e.tex.map((t) => t[0]), cores: e.tex.map((t) => t[1]), modelos: e.modelos } : null;
}
