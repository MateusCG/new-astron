// Evolução da base (DESIGN-PARTIDA.md): melhorias pagas com o ouro da partida,
// pousado e parado na plataforma da Evolução da própria base. Só dados e contas
// puras; quem valida e cobra é o servidor (server/servicos.js), e o cliente lê
// daqui para desenhar o painel. Tudo é da partida: zera na seguinte.
//
// Duas frentes:
// - Nave (do piloto): marcos nos níveis 5, 10 e 15 (MARCOS_NAVE). Em cada marco,
//   com o nível E o ouro do marco, o piloto escolhe UMA de três opções
//   (OPCOES_NAVE): mais durabilidade (HP máximo), mais energia máxima ou mais
//   velocidade. Os marcos vão em ordem (o 10 só depois do 5) e a mesma opção pode
//   ser escolhida em mais de um marco: os ganhos somam (dois cascos = +50% de HP).
//   O efeito fica no estado da nave (maxHp, maxEn e s.velMult, que o stepShip lê
//   e o `me` leva para a predição) e volta no renascimento junto com o nível.
// - Mineradores do time: compras que valem para o TIME INTEIRO (MELHORIAS_MINERADOR):
//   mais mineradores ao mesmo tempo, durabilidade, defesa e velocidade. Cada uma
//   tem níveis com preço crescente e um limite. Qualquer piloto do time pode pagar
//   o próximo nível; o servidor põe o efeito em world.mineradores.melhorias[time].
// - Torretas do time (as quatro do corredor, server/torretas.js): o nível vale para
//   as quatro de uma vez (MELHORIA_TORRETAS: mais HP e mais dano por nível, do 1
//   ao TORRETA_NIVEL_MAX) e cada torreta destruída pode ser reconstruída
//   (PRECO_RECONSTRUIR, preço fixo; volta inteira, com o nível atual do time).
//   Como nos mineradores, qualquer piloto do time paga e vale para o time.

/** Marcos da Evolução da nave: nível do piloto exigido e preço em ouro. */
export const MARCOS_NAVE = [
  { nivel: 5, preco: 150 },
  { nivel: 10, preco: 300 },
  { nivel: 15, preco: 450 },
];

export const EVO_HP = 0.25; // +25% do HP máximo por escolha
export const EVO_ENERGIA = 0.25; // +25% da energia máxima por escolha
export const EVO_VELOCIDADE = 0.1; // +10% da velocidade máxima por escolha

/** As três opções de cada marco (id é o `opcao` de {t:'evoluir', opcao}). */
export const OPCOES_NAVE = {
  casco: { id: 'casco', nome: 'Casco reforçado', efeito: `+${EVO_HP * 100}% de durabilidade (HP máx.)` },
  reator: { id: 'reator', nome: 'Reator ampliado', efeito: `+${EVO_ENERGIA * 100}% de energia máx.` },
  motor: { id: 'motor', nome: 'Motor afinado', efeito: `+${EVO_VELOCIDADE * 100}% de velocidade` },
};
export const ORDEM_OPCOES_NAVE = ['casco', 'reator', 'motor'];

/** A opção de nave com este id, ou null. */
export function opcaoNave(id) {
  return typeof id === 'string' && Object.hasOwn(OPCOES_NAVE, id) ? OPCOES_NAVE[id] : null;
}

/** Próximo marco a pagar, dado quantas evoluções o piloto já fez (null: acabou). */
export function proximoMarco(feitas) {
  return MARCOS_NAVE[feitas] ?? null;
}

/**
 * Multiplicadores da nave pelas evoluções escolhidas (lista de ids de opção):
 * { hp, en, vel }. Ids desconhecidos não contam.
 */
export function efeitosNave(evolucoes = []) {
  const n = (id) => evolucoes.filter((e) => e === id).length;
  return { hp: 1 + EVO_HP * n('casco'), en: 1 + EVO_ENERGIA * n('reator'), vel: 1 + EVO_VELOCIDADE * n('motor') };
}

export const MIN_EXTRA_POR_NIVEL = 1; // minerador a mais ao mesmo tempo
export const MIN_HP_POR_NIVEL = 0.25; // +25% de HP do minerador
export const MIN_DEFESA_POR_NIVEL = 0.15; // fração do dano que o minerador deixa de levar
export const MIN_VEL_POR_NIVEL = 0.1; // +10% de velocidade do minerador

/**
 * Melhorias dos mineradores do time: preço de cada nível (a lista dá o limite) e o
 * ganho por nível. id é o `melhoria` de {t:'melhorar', melhoria}.
 */
export const MELHORIAS_MINERADOR = {
  quantidade: { id: 'quantidade', nome: 'Mais mineradores', precos: [200, 350], efeito: `+${MIN_EXTRA_POR_NIVEL} minerador ao mesmo tempo` },
  durabilidade: { id: 'durabilidade', nome: 'Casco de carga', precos: [120, 200, 300], efeito: `+${MIN_HP_POR_NIVEL * 100}% de HP` },
  defesa: { id: 'defesa', nome: 'Blindagem de carga', precos: [120, 200, 300], efeito: `-${MIN_DEFESA_POR_NIVEL * 100}% de dano recebido` },
  velocidade: { id: 'velocidade', nome: 'Motor de carga', precos: [120, 200, 300], efeito: `+${MIN_VEL_POR_NIVEL * 100}% de velocidade` },
};
export const ORDEM_MELHORIAS = ['quantidade', 'durabilidade', 'defesa', 'velocidade'];

/** A melhoria de minerador com este id, ou null. */
export function melhoriaMinerador(id) {
  return typeof id === 'string' && Object.hasOwn(MELHORIAS_MINERADOR, id) ? MELHORIAS_MINERADOR[id] : null;
}

/** Níveis de melhoria de um time no começo da partida (todos 0). */
export function niveisIniciais() {
  return Object.fromEntries(ORDEM_MELHORIAS.map((id) => [id, 0]));
}

/**
 * O que os níveis compram, no formato que Mineradores.atributos() lê de
 * melhorias[time]: maxAtivos (a mais), hpMult, velocidadeMult e defesa (fração).
 */
export function efeitosMineradores(niveis) {
  const n = (id) => niveis?.[id] ?? 0;
  return {
    maxAtivos: MIN_EXTRA_POR_NIVEL * n('quantidade'),
    hpMult: 1 + MIN_HP_POR_NIVEL * n('durabilidade'),
    defesa: MIN_DEFESA_POR_NIVEL * n('defesa'),
    velocidadeMult: 1 + MIN_VEL_POR_NIVEL * n('velocidade'),
  };
}

export const TORRETA_HP_POR_NIVEL = 0.35; // +35% do HP da torreta por nível acima do 1
export const TORRETA_DANO_POR_NIVEL = 0.25; // +25% do dano do tiro por nível acima do 1

/**
 * Nível das torretas do time: precos[n - 1] leva do nível n ao n + 1 (a lista dá o
 * limite). id é o `melhoria` de {t:'melhorar', melhoria:'torretas'}.
 */
export const MELHORIA_TORRETAS = {
  id: 'torretas',
  nome: 'Torretas do corredor',
  precos: [250, 400],
  efeito: `+${TORRETA_HP_POR_NIVEL * 100}% de HP e +${TORRETA_DANO_POR_NIVEL * 100}% de dano`,
};
export const TORRETA_NIVEL_MAX = MELHORIA_TORRETAS.precos.length + 1;
/** Preço para reconstruir UMA torreta destruída ({t:'reconstruir', torreta}). */
export const PRECO_RECONSTRUIR = 200;

/** Preço do próximo nível das torretas a partir do nível `nivel` (null: no máximo). */
export function precoNivelTorretas(nivel) {
  return MELHORIA_TORRETAS.precos[nivel - 1] ?? null;
}

/** Multiplicadores das torretas no nível (1 a TORRETA_NIVEL_MAX): { hp, dano }. */
export function efeitosTorretas(nivel = 1) {
  const n = Math.max(0, Math.min(TORRETA_NIVEL_MAX, nivel) - 1);
  return { hp: 1 + TORRETA_HP_POR_NIVEL * n, dano: 1 + TORRETA_DANO_POR_NIVEL * n };
}
