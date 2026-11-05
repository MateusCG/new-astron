// O mapa 2D da partida na Seleção (pedido do Mateus, 05/nov/2026): no espaço vazio
// embaixo da grade de raças e classes, o Lago de Hélio-3 visto de cima com tudo o que
// importa para o plano de jogo: a base de cada time (TIME VERDE à esquerda, o time 0,
// e TIME VERMELHO à direita, o time 1, as mesmas cores fixas das faixas da fila do 3
// contra 3), o campo de força e a bacia de minério de cada uma, a Loja e a Evolução,
// as torres sentinela, a lane, a mineradora de He-3 com os hangares, os objetivos
// (SN-4, torre de comunicação, plataformas de ouro, sonda errante, Medusa e Núcleo),
// os acampamentos da jungle e as nuvens de gás. Sem legenda (pedido do Mateus): passar
// o mouse em cima de qualquer coisa abre uma caixinha com o que ela é (dicaDoItem).
//
// Este arquivo é puro (só lê o contrato do mapa em shared/terrain.js) e testado em
// tests/mapa-selecao.test.mjs; o desenho fica em mapa-selecao.js.
//
// Qual é a sua base: fora do 3 contra 3 online o piloto entra sempre no time 0 (o
// primeiro humano de um mundo novo cai no time com menos gente, e a fila pública põe
// os humanos no 0); no 3 contra 3 é o time em que ele está na fila (`voce.time`, e o
// `time` da vaga no 'comecar').

import {
  MAP_HALF_X,
  MAP_HALF_Z,
  BASES,
  CAMPOS_BASE,
  BACIAS,
  SERVICOS,
  TORRETAS,
  LANE,
  MINERADORA,
  HANGARES,
  BUFFS,
  PLATAFORMAS_POUSO,
  NUCLEO,
  MEDUSA,
  ACAMPAMENTOS,
  ASTEROIDES,
  trajetoSonda,
} from '../../shared/terrain.js';

/** Metros do mundo que o mapa cobre (o retângulo inteiro, como o minimapa). */
export const MUNDO_MAPA = Object.freeze({ x0: -MAP_HALF_X, z0: -MAP_HALF_Z, largura: 2 * MAP_HALF_X, altura: 2 * MAP_HALF_Z });

/** Cor e nome fixos de cada time no menu (as faixas da fila do 3 contra 3). */
export const TIMES_MAPA = Object.freeze([
  Object.freeze({ time: 0, nome: 'Time verde', cor: '#3ee07c' }),
  Object.freeze({ time: 1, nome: 'Time vermelho', cor: '#ff4a2a' }),
]);

/** Nome de cada objetivo no mapa (o mesmo do rótulo da partida, NOME_OBJETIVO). */
export const NOME_OBJETIVO_MAPA = Object.freeze({
  ataque: 'SN-4 · bônus de ataque',
  suporte: 'Torre de comunicação · bônus de suporte',
  plataforma: 'Plataforma de ouro',
  sonda: 'Sonda errante · bônus de velocidade',
  medusa: 'Medusa Anciã · bônus do time',
  nucleo: 'Núcleo de He-3 · onda de mineradores',
});

/**
 * Os objetivos do mapa, um por lugar: os buffs (SN-4 e torre de comunicação de cada
 * lado), as plataformas de ouro, a sonda (no começo do trajeto de cima), a Medusa e o
 * Núcleo. `time` só nos que ficam no território de um time.
 */
export const OBJETIVOS_MAPA = Object.freeze([
  ...BUFFS.map((b) => ({ id: b.id, tipo: b.tipo, x: b.x, z: b.z, time: b.time })),
  ...PLATAFORMAS_POUSO.map((p) => ({ id: p.id, tipo: 'plataforma', x: p.x, z: p.z, time: p.time })),
  { id: 'SONDA', tipo: 'sonda', x: trajetoSonda(0)[0].x, z: trajetoSonda(0)[0].z, time: null },
  { id: 'MEDUSA', tipo: 'medusa', x: MEDUSA.x, z: MEDUSA.z, time: null },
  { id: 'NUCLEO', tipo: 'nucleo', x: NUCLEO.x, z: NUCLEO.z, time: null },
]);

/** O laço da sonda errante em volta da mineradora (ida de cima e ida de baixo). */
export const TRAJETO_SONDA_MAPA = Object.freeze([...trajetoSonda(0), ...trajetoSonda(1)]);

/** Tudo o que é fixo do mapa, já separado por camada (as estruturas do contrato). */
export const ESTRUTURAS_MAPA = Object.freeze({
  bases: BASES,
  campos: CAMPOS_BASE,
  bacias: BACIAS,
  servicos: SERVICOS,
  torretas: TORRETAS,
  lane: LANE,
  mineradora: MINERADORA,
  hangares: HANGARES,
  acampamentos: ACAMPAMENTOS,
  nuvens: ASTEROIDES,
});

/**
 * O time do piloto na Seleção: o da fila no 3 contra 3 (a vaga do 'comecar' ou o
 * `voce.time` procurando e na sala); fora dele, o time 0.
 * @param {string|null} fila o modo de fila da Seleção ('online', 'publica') ou null
 * @param {object} [estado] o estado da fila (fila-regras.js)
 * @returns {0|1}
 */
export function timeDoPiloto(fila, estado) {
  if (fila !== 'online' || !estado) return 0;
  const t = estado.fase === 'comecar' ? estado.time : estado.voce?.time;
  return t === 1 ? 1 : 0;
}

/** Espécies de cada acampamento (id no referencial do time 0, server/jungle.js COMPOSICAO). */
const MONSTROS_ACAMPAMENTO = {
  JB0N: '4 SN-3',
  JB0S: '4 SN-Zero VI',
  JC0N: '1 Grande Xerxes e 2 Xerxes',
  JC0S: '1 Anti e 2 Bazit',
};

/** O id do acampamento no referencial do time 0 (o do time 1 é o mesmo girado 180°: N e S trocam). */
export function acampamentoDoTime0(id) {
  if (id[2] === '0') return id;
  return `${id.slice(0, 2)}0${id[3] === 'N' ? 'S' : 'N'}`;
}

/** O que cada objetivo é e o que dá (a caixinha do mouse em cima). */
const TEXTO_OBJETIVO = {
  ataque: 'Chefe do buff de ataque. Quem dá o golpe final ganha +20% de dano por um tempo.',
  suporte: 'Destrua a torre para o bônus de suporte: +2% de HP e +4 de energia por segundo.',
  plataforma: 'Fique 6 s pousado nela para render ouro para o time.',
  sonda: 'Anda em volta da mineradora. Abatida, dá +25% de velocidade (some em combate).',
  medusa: 'Sobe da água no poço de baixo. Abatida, dá +15% de dano e de velocidade ao time todo.',
  nucleo: 'Aparece aos 8:00. Não ataca: tem escudo que se regenera e devolve 14% do dano. Tomado, solta 3 mineradores com 50 de minério cada.',
};

/**
 * A caixinha que abre com o mouse em cima de uma coisa do mapa: `chave` é o
 * `data-item` do SVG (`base:0`, `campo:1`, `bacia:0`, `servico:loja:0`, `torreta:T0-1`,
 * `mineradora`, `lane`, `sonda`, `acampamento:JB0N`, `nuvem`, `objetivo:BA0`).
 * `cor` é a cor do time (ou do tipo) para o título. null se a chave não existe.
 * @param {string} chave
 * @param {0|1} meuTime
 * @returns {{ titulo: string, texto: string, cor?: string } | null}
 */
export function dicaDoItem(chave, meuTime = 0) {
  const [tipo, a, b] = String(chave ?? '').split(':');
  const time = (t) => TIMES_MAPA[Number(t)];
  const doTime = (t) => (Number(t) === meuTime ? 'do seu time' : 'do inimigo');
  switch (tipo) {
    case 'base': {
      const t = time(a);
      if (!t) return null;
      return Number(a) === meuTime
        ? { titulo: `Sua base · ${t.nome}`, texto: 'Onde você nasce e renasce. Pousado no anel, a nave enche vida e energia; a Loja e a Evolução ficam aqui.', cor: t.cor }
        : { titulo: `Base inimiga · ${t.nome}`, texto: 'O campo de força da entrada destrói qualquer nave sua que encostar nele.', cor: t.cor };
    }
    case 'campo':
      if (!time(a)) return null;
      return { titulo: `Campo de força ${doTime(a)}`, texto: 'Só o time dono e os mineradores passam. Nave do outro time que encosta é destruída, e nenhum tiro atravessa.', cor: time(a).cor };
    case 'bacia':
      if (!time(a)) return null;
      return { titulo: `Bacia de minério ${doTime(a)}`, texto: 'Os mineradores despejam aqui o He-3 do time. No fim dos 20 minutos, vence quem tiver mais minério.', cor: time(a).cor };
    case 'servico':
      if (!time(b)) return null;
      return a === 'loja'
        ? { titulo: `Loja ${doTime(b)}`, texto: 'Pouse e pare nela: armas, escudos, armaduras, potenciadores e itens.', cor: '#ff6fd8' }
        : { titulo: `Evolução ${doTime(b)}`, texto: 'Pouse e pare nela: a próxima nave da linha e as melhorias dos mineradores e das torres.', cor: '#a58bff' };
    case 'torreta': {
      const t = TORRETAS.find((x) => x.id === a);
      if (!t) return null;
      return { titulo: `Torre sentinela ${doTime(t.time)}`, texto: '7000 de HP e alcance de 560 m. O míssil atravessa qualquer resistência e fica mais forte a cada tiro seguido no mesmo alvo.', cor: time(t.time).cor };
    }
    case 'mineradora':
      return { titulo: 'Mineradora de He-3', texto: 'Sólida: bloqueia passagem, tiro e visão. Cada time tem um hangar com a sua doca, onde só os mineradores dele entram.', cor: '#9fe8ff' };
    case 'lane':
      return { titulo: 'Lane', texto: 'A rota dos mineradores, da base até o hangar do time na mineradora. Proteja os seus e cace os do inimigo.', cor: '#cfe9e4' };
    case 'sonda':
      return { titulo: 'Trajeto da sonda errante', texto: TEXTO_OBJETIVO.sonda, cor: '#ffb627' };
    case 'acampamento': {
      const id0 = acampamentoDoTime0(a ?? '');
      const quem = MONSTROS_ACAMPAMENTO[id0];
      if (!quem) return null;
      return { titulo: 'Acampamento de monstros', texto: `${quem}. Passivos até alguém atacar um deles; dão ouro e XP e ficam mais numerosos ao longo da partida.`, cor: '#ff4a2a' };
    }
    case 'nuvem':
      return { titulo: 'Nuvem de gás', texto: 'Dá para atravessar e esconde quem está dentro: boa para emboscar e para fugir.', cor: '#e8d6ba' };
    case 'objetivo': {
      const o = OBJETIVOS_MAPA.find((x) => x.id === a);
      if (!o) return null;
      return { titulo: NOME_OBJETIVO_MAPA[o.tipo].split(' · ')[0], texto: TEXTO_OBJETIVO[o.tipo], cor: '#ffb627' };
    }
    default:
      return null;
  }
}
