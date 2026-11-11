// Qualidade gráfica (Configurações → Gráficos): três níveis fixos, como o "Baixo /
// Médio / Alto" dos jogos de PC, para quem tem placa integrada antiga conseguir
// jogar. O que mais pesa na placa neste jogo é o número de pixels (a água, as nuvens
// e a névoa de guerra são shaders de tela cheia) e a sombra do sol; então cada nível
// mexe só nisso:
//
// - Resolução (`pixelRatio`): Alta usa a densidade da tela até 2× (o de sempre);
//   Média trava em 1× (num notebook com tela de 1,5× já corta mais da metade dos
//   pixels); Baixa desenha a 75% de 1× e o navegador estica.
// - Antialiasing: ligado na Média e na Alta. Só se escolhe ao criar o renderer.
// - Sombra do sol: Alta 2048 px suave (PCFSoft), Média 1024 px (PCF), Baixa sem.
//
// Os 30 fps não mudam: a simulação anda a 30 Hz (DT) e desenhar mais não mostra
// nada novo. A escolha fica no navegador e vale a partir da próxima partida.
// Puro e testado (tests/qualidade.test.mjs).

export const CHAVE_QUALIDADE = 'astron.qualidade';

/** Os níveis, na ordem da tela. `nome` e `descricao` passam por tr() na tela. */
export const QUALIDADES = Object.freeze([
  Object.freeze({
    id: 'baixa',
    nome: 'Baixa',
    descricao: 'Para placa de vídeo integrada antiga: resolução reduzida, sem sombras e sem suavização de bordas.',
  }),
  Object.freeze({
    id: 'media',
    nome: 'Média',
    descricao: 'Resolução normal da tela, sombras simples e bordas suavizadas.',
  }),
  Object.freeze({
    id: 'alta',
    nome: 'Alta',
    descricao: 'Resolução da tela de alta densidade, sombras suaves e bordas suavizadas.',
  }),
]);

export const QUALIDADE_PADRAO = 'alta';

/** O id é de um nível conhecido? */
export const qualidadeValida = (id) => QUALIDADES.some((q) => q.id === id);

/** Saneia o guardado no navegador: desconhecido ou ausente vira o padrão. */
export function sanearQualidade(id) {
  return qualidadeValida(id) ? id : QUALIDADE_PADRAO;
}

/**
 * O que o renderer e a cena usam em cada nível, para uma tela de densidade `dpr`
 * (o devicePixelRatio). `sombra` é null sem sombra.
 * @returns {{ pixelRatio: number, antialias: boolean, sombra: null | { mapa: number, suave: boolean } }}
 */
export function ajustesDaQualidade(id, dpr = 1) {
  const d = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  switch (sanearQualidade(id)) {
    case 'baixa':
      return { pixelRatio: Math.min(d, 1) * 0.75, antialias: false, sombra: null };
    case 'media':
      return { pixelRatio: Math.min(d, 1), antialias: true, sombra: { mapa: 1024, suave: false } };
    default:
      return { pixelRatio: Math.min(d, 2), antialias: true, sombra: { mapa: 2048, suave: true } };
  }
}

/** Lê o nível guardado (localStorage pode faltar ou lançar: vira o padrão). */
export function lerQualidade(armazem = globalThis.localStorage) {
  try {
    return sanearQualidade(armazem?.getItem(CHAVE_QUALIDADE));
  } catch {
    return QUALIDADE_PADRAO;
  }
}

/** Guarda o nível (ignora o que não é nível e o armazém que falha). */
export function guardarQualidade(id, armazem = globalThis.localStorage) {
  if (!qualidadeValida(id)) return false;
  try {
    armazem?.setItem(CHAVE_QUALIDADE, id);
    return true;
  } catch {
    return false;
  }
}
