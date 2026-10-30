// Pontos do piloto e a soma de tudo o que mexe nos números da nave (a janela STATUS).
//
// Pontos: a cada nível o piloto ganha PONTOS_POR_NIVEL para distribuir entre cinco
// atributos (ATRIBUTOS), no máximo PONTO_MAX em cada. Como na janela CHARACTER do
// original: Durabilidade (HP máximo e regeneração de HP), Energia (energia máxima e
// regeneração), Ph. (poder físico), El. (poder elétrico) e Op. (poder operacional,
// que é o laser do jogo novo). Não há devolver;
// zeram na partida nova junto com o nível.
//
// Quanto cada ponto vale depende da raça e da classe: é a tabela pilotparameter.txt
// do original (PILOT_PARAMETER, embutida abaixo), com a escala do jogo novo:
// - Poder: o % do original, igual (Shrewdo Functional, El. 2,6% por ponto: 30 pontos
//   = +78%). É linear: o redutor do original acima do nível do piloto não existe aqui.
// - Energia: por ponto, a energia fixa da raça e classe (HE) mais HE_PCT (3%) da
//   energia BASE da nave, tudo × FATOR_ENERGIA (a energia base que entra já é a do
//   jogo, então só a parte fixa é convertida). No original, Shrewdo Functional com
//   energia base 450 e 50 pontos ganha 50 × (14 + 0,03 × 450) = 1375; aqui, o mesmo.
// - Regeneração de energia: 0,0001 por ms por ponto no original (+0,1/s), com a conta
//   da regeneração das naves (× 1000 × FATOR_ENERGIA ÷ FATOR_RECARGA).
// - Durabilidade: a mesma conta da Energia com as linhas de HP da tabela: por ponto,
//   o HP fixo da raça e classe (Skill HP) × FATOR_ESCALA_HP mais HP_PCT (3%) do HP
//   BASE da nave no jogo (o da linha, sem o nível e sem a armadura). No original o
//   detalhe da linha diz "Durability 100 enhanced" com 1 ponto e 200 com 2: linear.
// - Regeneração de HP: 0,0001 por ms por ponto no original ("Recovery +0,1"), com a
//   conta da regeneração de HP das naves (× 1000 × FATOR_ESCALA_HP). Soma no conserto
//   em voo e no pousado (regenHpExtra, como o dos potenciadores).
//
// statusDoPiloto junta os pontos com o escudo, a armadura e os dois potenciadores
// equipados (shared/equipamentos.js) num objeto só, o contrato que o servidor usa
// para montar a nave e aplicar o dano e que a janela STATUS mostra:
// { hpExtra, maxEscudo, regenEscudo, enExtra, regenEnExtra, regenHpExtra,
//   poder: {fisico, laser, eletrico}, recarga: {...}, resist: {...}, penetra: {...},
//   critico, velMult, acelMult }
// - poder: fração a mais de dano daquele tipo (0,78 = +78%): o dano sai × (1 + poder);
// - recarga: fração mais rápida (0,15 = 15%): a recarga da arma daquele tipo fica ×
//   (1 − recarga) (multRecarga), até RECARGA_MAX;
// - resist: fração do dano daquele tipo que a nave segura, já com o teto RESIST_MAX: os
//   pontos de escudo e armadura × RESIST_POR_PONTO_EQUIP × (1 + o % dos potenciadores),
//   como no original (CPilotManage::Process); resistBase é a mesma conta sem o teto, de
//   onde o servidor parte para somar as armas de dispositivo (World#resistEfetiva), e
//   resistPct o % dos potenciadores;
// - penetra: fração de resistência do alvo que o tiro daquele tipo ignora;
// - poderPontos: a parte do poder que vem só dos pontos do piloto (sem os potenciadores):
//   no original é o "skill" (GetSkillAddElectric) que escala os dispositivos elétricos e
//   a chance dos debuffs elétricos (shared/armas.js, fatorDispositivo);
// - critico: chance (0 a 1) de o golpe sair com dano dobrado (sorteio só no servidor);
// - velMult e acelMult: multiplicadores (1 = sem mudança).
// O que está na nave chega como uma LISTA de itens, [[chave, nível], ...] (no
// servidor, equipadosDoInv de shared/loja.js tira do inventário por instância): cada
// instância tem a sua versão, então o mesmo potenciador nos dois encaixes entra duas
// vezes, cada um no seu nível, e os dois somam.
//
// Determinístico, sem sorte e sem relógio: servidor e cliente chegam ao mesmo número.

import { FATOR_ENERGIA, FATOR_ESCALA_HP, FATOR_RECARGA, MS_POR_S } from './naves.js';
import { RESIST_MAX, equipamento, nivelEquipValido, podeUsar, ORDEM_TIPOS_DANO } from './equipamentos.js';

export const PONTOS_POR_NIVEL = 10; // pontos ganhos a cada nível (no nível 1 já há 10)
export const PONTO_MAX = 99; // máximo em cada atributo
export const FATOR_PODER_PONTO = 0.01; // % do original por ponto → fração
export const FATOR_ENERGIA_PONTO = FATOR_ENERGIA; // energia fixa por ponto do original → jogo
export const FATOR_REGEN_EN_PONTO = (MS_POR_S * FATOR_ENERGIA) / FATOR_RECARGA; // por ms do original → por s do jogo
export const FATOR_HP_PONTO = FATOR_ESCALA_HP; // HP fixo por ponto do original → jogo
export const FATOR_REGEN_HP_PONTO = MS_POR_S * FATOR_ESCALA_HP; // HP por ms do original → HP por s do jogo
export const RECARGA_MAX = 0.5; // a recarga nunca fica mais que 2× mais rápida
export const CRITICO_MAX = 1;

/** Os cinco atributos, na ordem da janela: nome curto (o da interface) e por extenso. */
export const ATRIBUTOS = Object.freeze({
  durabilidade: { id: 'durabilidade', nome: 'HP', descricao: 'Durabilidade: HP máximo e regeneração de HP' },
  energia: { id: 'energia', nome: 'Energia', descricao: 'Energia máxima e regeneração de energia' },
  fisico: { id: 'fisico', nome: 'Ph.', descricao: 'Poder físico: dano das armas físicas' },
  eletrico: { id: 'eletrico', nome: 'El.', descricao: 'Poder elétrico: dano das armas elétricas' },
  laser: { id: 'laser', nome: 'Op.', descricao: 'Poder operacional: dano das armas de laser' },
});
export const ORDEM_ATRIBUTOS = Object.keys(ATRIBUTOS);

/**
 * pilotparameter.txt do original, só as linhas que os atributos usam. Chave "RC": R =
 * raça (1 Acron, 2 Bellico, 3 Shrewdo), C = classe (2 Assault, 3 Mobile, 4
 * Functional). hp = HP fixo por ponto (!2.Skill HP); he = energia fixa por ponto
 * (!3.Skill HE); fisico/laser/eletrico = % de poder por ponto (!4 Phy, !5 Opt, !6
 * Elec); regenHpMs = regeneração de HP por ms por ponto (!7); regenEnMs = regeneração
 * de energia por ms por ponto (!8); hpPct = fração do HP base por ponto (!9 HP
 * Percent); hePct = fração da energia base por ponto (!10 HE Percent).
 */
export const PILOT_PARAMETER = Object.freeze({
  12: { hp: 32, he: 11, fisico: 2.6, laser: 3.0, eletrico: 2.2, regenHpMs: 0.0001, regenEnMs: 0.0001, hpPct: 0.03, hePct: 0.03 },
  13: { hp: 20, he: 12, fisico: 2.0, laser: 2.4, eletrico: 2.8, regenHpMs: 0.0001, regenEnMs: 0.0001, hpPct: 0.03, hePct: 0.03 },
  14: { hp: 24, he: 15, fisico: 2.0, laser: 2.6, eletrico: 2.4, regenHpMs: 0.0001, regenEnMs: 0.0001, hpPct: 0.03, hePct: 0.03 },
  22: { hp: 40, he: 10, fisico: 3.0, laser: 2.6, eletrico: 2.0, regenHpMs: 0.0001, regenEnMs: 0.0001, hpPct: 0.03, hePct: 0.03 },
  23: { hp: 25, he: 10, fisico: 2.6, laser: 2.4, eletrico: 2.4, regenHpMs: 0.0001, regenEnMs: 0.0001, hpPct: 0.03, hePct: 0.03 },
  24: { hp: 30, he: 14, fisico: 2.6, laser: 2.2, eletrico: 2.4, regenHpMs: 0.0001, regenEnMs: 0.0001, hpPct: 0.03, hePct: 0.03 },
  32: { hp: 32, he: 10, fisico: 2.9, laser: 2.9, eletrico: 2.2, regenHpMs: 0.0001, regenEnMs: 0.0001, hpPct: 0.03, hePct: 0.03 },
  33: { hp: 20, he: 10, fisico: 2.2, laser: 2.2, eletrico: 2.4, regenHpMs: 0.0001, regenEnMs: 0.0001, hpPct: 0.03, hePct: 0.03 },
  34: { hp: 24, he: 14, fisico: 2.4, laser: 2.4, eletrico: 2.6, regenHpMs: 0.0001, regenEnMs: 0.0001, hpPct: 0.03, hePct: 0.03 },
});
const CODIGO_RACA = { acron: 1, bellico: 2, shrewdo: 3 };
const CODIGO_CLASSE = { assault: 2, mobile: 3, functional: 4 };
/** Raça ou classe sem tabela (Mechan, monstros): ponto não vale nada. */
const SEM_PARAMETRO = Object.freeze({ hp: 0, he: 0, fisico: 0, laser: 0, eletrico: 0, regenHpMs: 0, regenEnMs: 0, hpPct: 0, hePct: 0 });

const r4 = (x) => Math.round(x * 1e4) / 1e4;
const tres = (v = 0) => ({ fisico: v, laser: v, eletrico: v });

/** Pontos zerados (começo da partida). */
export function pontosVazios() {
  return { durabilidade: 0, energia: 0, fisico: 0, eletrico: 0, laser: 0 };
}

/** Pontos válidos: os cinco atributos, inteiros de 0 a PONTO_MAX (lixo vira 0). */
export function normalizarPontos(pontos) {
  const out = pontosVazios();
  for (const a of ORDEM_ATRIBUTOS) {
    const v = pontos?.[a];
    out[a] = Number.isInteger(v) && v > 0 ? Math.min(v, PONTO_MAX) : 0;
  }
  return out;
}

/** Pontos que o piloto do nível já ganhou (PONTOS_POR_NIVEL × nível; nível inválido = 0). */
export function pontosTotais(nivel) {
  return Number.isInteger(nivel) && nivel > 0 ? PONTOS_POR_NIVEL * nivel : 0;
}

/** Pontos ainda sem atributo (nunca negativo). */
export function pontosLivres(nivel, pontos) {
  const p = normalizarPontos(pontos);
  const gastos = ORDEM_ATRIBUTOS.reduce((s, a) => s + p[a], 0);
  return Math.max(0, pontosTotais(nivel) - gastos);
}

/**
 * Põe até `qtd` pontos no atributo (o pedido {t:'pontos'}): põe o que couber nos
 * pontos livres e no máximo do atributo. Devolve { ok: true, pontos (novos), qtd
 * (posta) } ou { ok: false, codigo }: 'invalido' (atributo ou qtd), 'sem_pontos'
 * (nenhum livre) ou 'maximo' (atributo já em PONTO_MAX). Não muda o objeto recebido.
 */
export function distribuirPontos(nivel, pontos, atributo, qtd = 1) {
  if (!Object.hasOwn(ATRIBUTOS, atributo) || !Number.isInteger(qtd) || qtd < 1 || qtd > PONTO_MAX) return { ok: false, codigo: 'invalido' };
  const p = normalizarPontos(pontos);
  const livres = pontosLivres(nivel, p);
  if (livres < 1) return { ok: false, codigo: 'sem_pontos' };
  if (p[atributo] >= PONTO_MAX) return { ok: false, codigo: 'maximo' };
  const n = Math.min(qtd, livres, PONTO_MAX - p[atributo]);
  p[atributo] += n;
  return { ok: true, pontos: p, qtd: n };
}

/**
 * Quanto vale UM ponto de cada atributo para a raça e a classe, nas unidades do
 * original: { hp, hpPct, regenHpMs, he, hePct, regenEnMs, fisico, laser, eletrico }
 * (poder em %).
 */
export function porPonto(race, classe) {
  return PILOT_PARAMETER[`${CODIGO_RACA[race]}${CODIGO_CLASSE[classe]}`] ?? SEM_PARAMETRO;
}

/**
 * O que os pontos dão, na escala do jogo: { hp (máximo a mais), regenHp (HP por s a
 * mais), energia (máxima a mais), regenEn (por s a mais), poder: { fisico, laser,
 * eletrico } (fração a mais) }. energiaBase e hpBase = energia máxima e HP da nave no
 * jogo (naveDe(...).energia e .hp), para as partes em % (HE Percent e HP Percent).
 */
export function efeitoDosPontos(race, classe, pontos, energiaBase = 0, hpBase = 0) {
  const t = porPonto(race, classe);
  const p = normalizarPontos(pontos);
  return {
    hp: r4(p.durabilidade * (t.hp * FATOR_HP_PONTO + t.hpPct * (hpBase || 0))),
    regenHp: r4(p.durabilidade * t.regenHpMs * FATOR_REGEN_HP_PONTO),
    energia: r4(p.energia * (t.he * FATOR_ENERGIA_PONTO + t.hePct * (energiaBase || 0))),
    regenEn: r4(p.energia * t.regenEnMs * FATOR_REGEN_EN_PONTO),
    poder: { fisico: r4(p.fisico * t.fisico * FATOR_PODER_PONTO), laser: r4(p.laser * t.laser * FATOR_PODER_PONTO), eletrico: r4(p.eletrico * t.eletrico * FATOR_PODER_PONTO) },
  };
}

/** Status zerado (sem pontos e sem equipamento). */
export function statusVazio() {
  return {
    hpExtra: 0,
    maxEscudo: 0,
    regenEscudo: 0,
    enExtra: 0,
    regenEnExtra: 0,
    regenHpExtra: 0,
    poder: tres(),
    recarga: tres(),
    resist: tres(),
    poderPontos: tres(),
    resistPct: tres(),
    resistBase: tres(),
    penetra: tres(),
    critico: 0,
    velMult: 1,
    acelMult: 1,
  };
}

/**
 * Os itens da lista que valem (existem e, com a classe, são dela): [[chave, nível]]
 * com o nível já válido (1 a 8). Entrada fora do formato é ignorada.
 */
function itensValidos(equipados, classe) {
  const out = [];
  for (const par of Array.isArray(equipados) ? equipados : []) {
    const k = Array.isArray(par) ? par[0] : null;
    if (!equipamento(k) || (classe !== undefined && !podeUsar(k, classe))) continue;
    out.push([k, nivelEquipValido(par[1])]);
  }
  return out;
}

/** Soma um efeito de equipamento (shared/equipamentos.js) no status (sem os tetos). */
function somarEfeito(st, ef) {
  switch (ef.tipo) {
    case 'hp':
      st.hpExtra += ef.valor;
      break;
    case 'escudo':
      st.maxEscudo += ef.valor;
      break;
    case 'regenEscudo':
      st.regenEscudo += ef.valor;
      break;
    case 'energia':
      st.enExtra += ef.valor;
      break;
    case 'regenEn':
      st.regenEnExtra += ef.valor;
      break;
    case 'regenHp':
      st.regenHpExtra += ef.valor;
      break;
    case 'poder':
    case 'recarga':
    case 'resist':
    case 'resistPct':
    case 'penetra':
      st[ef.tipo][ef.tipoDano] += ef.valor;
      break;
    case 'critico':
      st.critico += ef.valor;
      break;
    case 'velocidade':
      st.velMult += ef.valor;
      break;
    case 'aceleracao':
      st.acelMult += ef.valor;
      break;
  }
}

/** Arredonda e aplica os tetos (resistência, recarga, crítico). */
function fechar(st) {
  for (const k of ['hpExtra', 'maxEscudo', 'regenEscudo', 'enExtra', 'regenEnExtra', 'regenHpExtra', 'velMult', 'acelMult']) st[k] = r4(st[k]);
  for (const t of ORDEM_TIPOS_DANO) {
    st.poder[t] = r4(st.poder[t]);
    st.recarga[t] = r4(Math.min(RECARGA_MAX, st.recarga[t]));
    st.resistPct[t] = r4(st.resistPct[t]);
    st.resistBase[t] = r4(st.resist[t] * (1 + st.resistPct[t]));
    st.resist[t] = r4(Math.min(RESIST_MAX, st.resistBase[t]));
    st.penetra[t] = r4(st.penetra[t]);
  }
  st.critico = r4(Math.min(CRITICO_MAX, st.critico));
  return st;
}

/**
 * Soma do escudo, da armadura e dos potenciadores que estão na nave, no formato de
 * statusDoPiloto (sem os pontos). equipados = [[chave, nível], ...] (um par por
 * instância na nave; o mesmo item duas vezes conta duas vezes, cada um no seu
 * nível); com a classe, item de outra classe não conta.
 */
export function somaEquipamento(equipados, classe) {
  const st = statusVazio();
  for (const [k, nv] of itensValidos(equipados, classe)) for (const ef of equipamento(k).versoes[nv - 1].efeitos) somarEfeito(st, ef);
  return fechar(st);
}

/**
 * O status do piloto: pontos + escudo + armadura + potenciadores, num objeto só (ver
 * o topo do arquivo). equipados = [[chave, nível], ...] o que está na nave (ver
 * somaEquipamento); energiaBase e hpBase = energia máxima e HP da nave no jogo (para
 * o % da Energia e da Durabilidade). Tudo opcional: sem nada, statusVazio().
 */
export function statusDoPiloto({ race, classe, pontos, equipados, energiaBase = 0, hpBase = 0 } = {}) {
  const st = statusVazio();
  for (const [k, nv] of itensValidos(equipados, classe)) for (const ef of equipamento(k).versoes[nv - 1].efeitos) somarEfeito(st, ef);
  const p = efeitoDosPontos(race, classe, pontos, energiaBase, hpBase);
  st.hpExtra += p.hp;
  st.regenHpExtra += p.regenHp;
  st.enExtra += p.energia;
  st.regenEnExtra += p.regenEn;
  for (const t of ORDEM_TIPOS_DANO) {
    st.poder[t] += p.poder[t];
    st.poderPontos[t] = r4(p.poder[t]);
  }
  return fechar(st);
}

/** Multiplicador da recarga da arma para a fração `recarga` do status (0,15 → 0,85). */
export function multRecarga(recarga) {
  return 1 - Math.min(RECARGA_MAX, Math.max(0, recarga || 0));
}
