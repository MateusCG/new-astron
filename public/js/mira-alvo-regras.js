// A mira travada na tela (pedido do Mateus, 06/nov/2026, pelos vídeos do original com
// o Míssil Paralisante): com uma arma de alvo num encaixe, os três triângulos verdes
// fecham no alvo que o tiro daquele encaixe vai travar agora. Puro (sem Three.js),
// testado em tests/mira-alvo.test.mjs; quem desenha é public/js/mira-alvo.js.
//
// A escolha é a de shared/mira.js, a mesma do servidor no disparo (a esfera de raio R
// à frente do nariz, o mais perto da linha do nariz), entre o que o cliente tem: as
// entidades do snapshot (o servidor só manda o que o time enxerga: sem nada à vista,
// sem mira) e as torres sentinela de pé do outro time (públicas). Como no original
// (CTargetCursor), um efeito por encaixe: o `target01` no Z (verde vivo, com o ponto
// piscando no meio) e o `target02` no X (verde escuro, com o anel); a mesma arma de
// alvo nos dois encaixes mostra os dois, seis triângulos no mesmo alvo.

import { golpeDaArma } from '../../shared/armas.js';
import { alvoDaMira } from '../../shared/mira.js';
import { cruzaCampoBase, TORRETAS } from '../../shared/terrain.js';
import { OBSTACULOS, TORRETA } from '../../shared/obstaculos.js';
import { HOVER, SHIP_RADIUS } from '../../shared/sim.js';

/** O efeito do original da mira de cada encaixe (CTargetCursor::Load: TARGET01, TARGET02). */
export const EFEITO_MIRA = Object.freeze(['target01', 'target02']);

/** Raio (unidades do original) dos triângulos já fechados no alvo (quadro 10 do target01/02). */
export const RAIO_MIRA_FECHADA = 29.5;

/** O lugar de cada torre sentinela como alvo: o canhão, na altura do voo (server/torretas.js). */
const LUGAR_TORRETA = new Map(
  TORRETAS.map((t) => {
    const o = OBSTACULOS.find((p) => p.grupo === 'torreta' && p.id === t.id);
    return [t.id, { id: t.id, time: t.time, x: t.x, z: t.z, y: (o?.chao ?? 0) + HOVER, raio: TORRETA.raio, torreta: true }];
  }),
);

/** O golpe da arma `kind` (índice) na versão `nivel`, se ela tem mira (o tipo de alvo do original); senão null. */
export function golpeComMira(kind, nivel = 1) {
  if (kind === undefined || kind === null || kind < 0) return null;
  const g = golpeDaArma(kind, nivel ?? 1, 0);
  return g?.mira ? g : null;
}

/**
 * Quem a mira do golpe `g` pode mostrar, visto por `eu` ({id, time, x, z}): no que fere,
 * os vivos que não são do time (monstro é de ninguém) e as torres sentinela de pé do
 * outro time; no de suporte, os pilotos aliados. Nunca do outro lado do campo de força
 * de uma base. Cada um com x, y, z, raio e id.
 */
export function candidatosDaMira(g, eu, ents = [], torretas = []) {
  const lista = [];
  for (const e of ents) {
    if (!e.vivo || e.id === eu.id) continue;
    const doTime = !e.drone && e.time === eu.time;
    if (g.inimigo ? doTime : !(g.aliado && doTime && e.tipo === 'jogador')) continue;
    if (cruzaCampoBase(eu.x, eu.z, e.x, e.z)) continue;
    lista.push({ id: e.id, x: e.x, y: e.y, z: e.z, raio: e.r ?? SHIP_RADIUS });
  }
  if (g.inimigo) {
    for (const t of torretas) {
      const l = LUGAR_TORRETA.get(t.id);
      if (!l || !t.viva || l.time === eu.time || cruzaCampoBase(eu.x, eu.z, l.x, l.z)) continue;
      lista.push(l);
    }
  }
  return lista;
}

/**
 * O alvo da mira de cada encaixe [Z, X]: o candidato (com id, x, y, z, raio e
 * `torreta` nas torres) ou null (arma sem mira, ou ninguém na esfera). `eu` = {id, time,
 * x, y, z, yaw} (a nave prevista), `encaixes` e `nivEnc` como no `stepShip`, `ents` as
 * entidades desenhadas, `torretas` o estado delas no snapshot ({id, viva}).
 */
export function alvosDaMira({ eu, encaixes = [], nivEnc = [], ents = [], torretas = [] }) {
  return [0, 1].map((enc) => {
    const g = golpeComMira(encaixes[enc], nivEnc[enc]);
    if (!g || !eu) return null;
    return alvoDaMira(g.mira, candidatosDaMira(g, eu, ents, torretas), eu.x, eu.z, eu.yaw, { y: eu.y });
  });
}

/**
 * Escala do efeito da mira (m por unidade do original) no alvo de raio `raio` (m): a do
 * original (`escalaOriginal`, a das naves) e, só no alvo maior que os triângulos
 * fechados (o Núcleo, a Medusa, o SN-4), o bastante para eles ficarem por fora dele.
 */
export function escalaDaMira(raio, escalaOriginal) {
  const fechada = RAIO_MIRA_FECHADA * escalaOriginal;
  const folga = 4; // m entre o casco e os triângulos no alvo grande
  return raio + folga > fechada ? ((raio + folga) / RAIO_MIRA_FECHADA) : escalaOriginal;
}

/**
 * De quanto em quanto tempo (s) a mira refaz a escolha: o CTarget::Run do original
 * refaz a cada 12 quadros (12 / 24 s). Entre uma e outra o alvo fica (só a posição
 * anda), e a animação de fechar não recomeça a cada quadro quando dois alvos estão
 * quase na mesma linha do nariz.
 */
export const MIRA_REFAZER_S = 12 / 24;

/**
 * O ritmo da mira: guarda a última escolha e só a refaz no tempo do original, ou na
 * hora se a arma de algum encaixe mudou (`chave`) ou se um alvo escolhido sumiu
 * (`existe(alvo)` falso: morreu, caiu ou saiu da visão).
 */
export class RitmoDaMira {
  constructor() {
    this.atuais = [null, null];
    this.proxima = -Infinity;
    this.chave = null;
  }

  /** Os alvos [Z, X] em `agora` (s); `calcular()` faz a escolha (alvosDaMira). */
  alvos(agora, chave, existe, calcular) {
    if (agora >= this.proxima || chave !== this.chave || this.atuais.some((a) => a && !existe(a))) {
      this.atuais = calcular();
      this.proxima = agora + MIRA_REFAZER_S;
      this.chave = chave;
    }
    return this.atuais;
  }

  /** Esquece a escolha (morreu, saiu da partida). */
  limpar() {
    this.atuais = [null, null];
    this.proxima = -Infinity;
    this.chave = null;
  }
}
