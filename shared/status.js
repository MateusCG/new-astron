// Pontos do piloto e a soma de tudo o que mexe nos números da nave (a janela STATUS).
//
// Pontos: a cada nível o piloto ganha PONTOS_POR_NIVEL para distribuir entre quatro
// atributos (ATRIBUTOS), no máximo PONTO_MAX em cada. Como na janela CHARACTER do
// original: Energia (energia máxima e regeneração), Ph. (poder físico), El. (poder
// elétrico) e Op. (poder operacional, que é o laser do jogo novo). Não há devolver;
// zeram na partida nova junto com o nível.
//
// Quanto cada ponto vale depende da raça e da classe: é a tabela pilotparameter.txt
// do original (PILOT_PARAMETER, embutida abaixo), com a escala do jogo novo:
// - Poder: o % do original, igual (Shrewdo Functional, El. 2,6% por ponto: 30 pontos
//   = +78%). É linear: o redutor do original acima do nível do piloto não existe aqui.
// - Energia: por ponto, a energia fixa da raça e classe (HE) mais HE_PCT (3%) da
//   energia BASE da nave, tudo × FATOR_ENERGIA (a energia base que entra já é a do
//   jogo, então só a parte fixa é convertida). No original, Shrewdo Functional com
//   energia base 450 e 50 pontos ganha 50 × (14 + 0,03 × 450) = 1375; aqui, 1375 × 0,3.
// - Regeneração de energia: 0,0001 por ms por ponto no original (+0,1/s), com a conta
//   da regeneração das naves (× 1000 × FATOR_ENERGIA ÷ FATOR_RECARGA).
// As linhas de HP da tabela (Skill HP, HpRegen, HP Percent) não entram: o jogo novo não
// tem atributo de durabilidade (o HP sobe com o nível e com a armadura).
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
// - resist: fração do dano daquele tipo que a nave segura, já com o teto RESIST_MAX
//   (pontos de escudo e armadura × RESIST_POR_PONTO mais o % dos potenciadores);
// - penetra: fração de resistência do alvo que o tiro daquele tipo ignora;
// - critico: chance (0 a 1) de o golpe sair com dano dobrado (sorteio só no servidor);
// - velMult e acelMult: multiplicadores (1 = sem mudança).
// Os dois potenciadores somam; o mesmo item duas vezes conta uma.
//
// Determinístico, sem sorte e sem relógio: servidor e cliente chegam ao mesmo número.

import { FATOR_ENERGIA, FATOR_RECARGA, MS_POR_S } from './naves.js';
import { RESIST_MAX, equipamento, nivelEquipValido, podeUsar, ORDEM_TIPOS_DANO } from './equipamentos.js';

export const PONTOS_POR_NIVEL = 10; // pontos ganhos a cada nível (no nível 1 já há 10)
export const PONTO_MAX = 99; // máximo em cada atributo
export const FATOR_PODER_PONTO = 0.01; // % do original por ponto → fração
export const FATOR_ENERGIA_PONTO = FATOR_ENERGIA; // energia fixa por ponto do original → jogo
export const FATOR_REGEN_EN_PONTO = (MS_POR_S * FATOR_ENERGIA) / FATOR_RECARGA; // por ms do original → por s do jogo
export const RECARGA_MAX = 0.5; // a recarga nunca fica mais que 2× mais rápida
export const CRITICO_MAX = 1;

/** Os quatro atributos, na ordem da janela: nome curto (o da interface) e por extenso. */
export const ATRIBUTOS = Object.freeze({
  energia: { id: 'energia', nome: 'Energia', descricao: 'Energia máxima e regeneração de energia' },
  fisico: { id: 'fisico', nome: 'Ph.', descricao: 'Poder físico: dano das armas físicas' },
  eletrico: { id: 'eletrico', nome: 'El.', descricao: 'Poder elétrico: dano das armas elétricas' },
  laser: { id: 'laser', nome: 'Op.', descricao: 'Poder operacional: dano das armas de laser' },
});
export const ORDEM_ATRIBUTOS = Object.keys(ATRIBUTOS);

/**
 * pilotparameter.txt do original, só as linhas que os atributos usam. Chave "RC": R =
 * raça (1 Acron, 2 Bellico, 3 Shrewdo), C = classe (2 Assault, 3 Mobile, 4
 * Functional). he = energia fixa por ponto (!3.Skill HE); fisico/laser/eletrico = %
 * de poder por ponto (!4 Phy, !5 Opt, !6 Elec); regenEnMs = regeneração de energia
 * por ms por ponto (!8); hePct = fração da energia base por ponto (!10 HE Percent).
 */
export const PILOT_PARAMETER = Object.freeze({
  12: { he: 11, fisico: 2.6, laser: 3.0, eletrico: 2.2, regenEnMs: 0.0001, hePct: 0.03 },
  13: { he: 12, fisico: 2.0, laser: 2.4, eletrico: 2.8, regenEnMs: 0.0001, hePct: 0.03 },
  14: { he: 15, fisico: 2.0, laser: 2.6, eletrico: 2.4, regenEnMs: 0.0001, hePct: 0.03 },
  22: { he: 10, fisico: 3.0, laser: 2.6, eletrico: 2.0, regenEnMs: 0.0001, hePct: 0.03 },
  23: { he: 10, fisico: 2.6, laser: 2.4, eletrico: 2.4, regenEnMs: 0.0001, hePct: 0.03 },
  24: { he: 14, fisico: 2.6, laser: 2.2, eletrico: 2.4, regenEnMs: 0.0001, hePct: 0.03 },
  32: { he: 10, fisico: 2.9, laser: 2.9, eletrico: 2.2, regenEnMs: 0.0001, hePct: 0.03 },
  33: { he: 10, fisico: 2.2, laser: 2.2, eletrico: 2.4, regenEnMs: 0.0001, hePct: 0.03 },
  34: { he: 14, fisico: 2.4, laser: 2.4, eletrico: 2.6, regenEnMs: 0.0001, hePct: 0.03 },
});
const CODIGO_RACA = { acron: 1, bellico: 2, shrewdo: 3 };
const CODIGO_CLASSE = { assault: 2, mobile: 3, functional: 4 };
/** Raça ou classe sem tabela (Mechan, monstros): ponto não vale nada. */
const SEM_PARAMETRO = Object.freeze({ he: 0, fisico: 0, laser: 0, eletrico: 0, regenEnMs: 0, hePct: 0 });

const r4 = (x) => Math.round(x * 1e4) / 1e4;
const tres = (v = 0) => ({ fisico: v, laser: v, eletrico: v });

/** Pontos zerados (começo da partida). */
export function pontosVazios() {
  return { energia: 0, fisico: 0, eletrico: 0, laser: 0 };
}

/** Pontos válidos: os quatro atributos, inteiros de 0 a PONTO_MAX (lixo vira 0). */
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
 * original: { he, hePct, regenEnMs, fisico, laser, eletrico } (poder em %).
 */
export function porPonto(race, classe) {
  return PILOT_PARAMETER[`${CODIGO_RACA[race]}${CODIGO_CLASSE[classe]}`] ?? SEM_PARAMETRO;
}

/**
 * O que os pontos dão, na escala do jogo: { energia (máxima a mais), regenEn (por s a
 * mais), poder: { fisico, laser, eletrico } (fração a mais) }. energiaBase = energia
 * máxima da nave no jogo (naveDe(...).energia), para a parte em % (HE Percent).
 */
export function efeitoDosPontos(race, classe, pontos, energiaBase = 0) {
  const t = porPonto(race, classe);
  const p = normalizarPontos(pontos);
  return {
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
    penetra: tres(),
    critico: 0,
    velMult: 1,
    acelMult: 1,
  };
}

/** Os itens equipados que valem (existem, são da classe), sem repetir: [[chave, nível]]. */
function itensEquipados(equipado, niveis, classe) {
  const chaves = [equipado?.escudo, equipado?.armadura, ...(Array.isArray(equipado?.pot) ? equipado.pot : [])];
  const vistos = new Set();
  const out = [];
  for (const k of chaves) {
    if (!equipamento(k) || vistos.has(k) || (classe !== undefined && !podeUsar(k, classe))) continue;
    vistos.add(k);
    out.push([k, nivelEquipValido(niveis?.[k] ?? 1)]);
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
    st.resist[t] = r4(Math.min(RESIST_MAX, st.resist[t]));
    st.penetra[t] = r4(st.penetra[t]);
  }
  st.critico = r4(Math.min(CRITICO_MAX, st.critico));
  return st;
}

/**
 * Soma do escudo, da armadura e dos potenciadores equipados, no formato de
 * statusDoPiloto (sem os pontos). equipado = { escudo, armadura, pot: [a, b] } (chaves
 * ou null); niveis = { chave: nível } (a posse; quem não está fica na V1); com a
 * classe, item de outra classe não conta.
 */
export function somaEquipamento(equipado, niveis, classe) {
  const st = statusVazio();
  for (const [k, nv] of itensEquipados(equipado, niveis, classe)) for (const ef of equipamento(k).versoes[nv - 1].efeitos) somarEfeito(st, ef);
  return fechar(st);
}

/**
 * O status do piloto: pontos + escudo + armadura + potenciadores, num objeto só (ver
 * o topo do arquivo). energiaBase = energia máxima da nave no jogo (para o % da
 * Energia). Tudo opcional: sem nada, statusVazio().
 */
export function statusDoPiloto({ race, classe, pontos, equipado, niveis, energiaBase = 0 } = {}) {
  const st = statusVazio();
  for (const [k, nv] of itensEquipados(equipado, niveis, classe)) for (const ef of equipamento(k).versoes[nv - 1].efeitos) somarEfeito(st, ef);
  const p = efeitoDosPontos(race, classe, pontos, energiaBase);
  st.enExtra += p.energia;
  st.regenEnExtra += p.regenEn;
  for (const t of ORDEM_TIPOS_DANO) st.poder[t] += p.poder[t];
  return fechar(st);
}

/** Multiplicador da recarga da arma para a fração `recarga` do status (0,15 → 0,85). */
export function multRecarga(recarga) {
  return 1 - Math.min(RECARGA_MAX, Math.max(0, recarga || 0));
}
