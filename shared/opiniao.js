// Opinião dos jogadores (pedido do Mateus, 09/nov/2026): um lugar fácil de achar para
// quem joga deixar um resumo curto do que achou, uma sugestão ou um problema, com uma
// nota de 1 a 5 opcional. Segue o que os jogos online em acesso antecipado fazem: um
// botão fixo de "Opinião" no topo do menu (sempre à vista, em toda aba) e, no fim da
// partida, a pergunta curta "Como foi a partida?" com as estrelas na tela de
// resultado, que não interrompe nada: quem quiser clica, quem não quiser segue.
//
// Este arquivo é o contrato, igual nos dois lados: os limites, as categorias e o
// saneamento do que chega (`validarOpiniao`). O cliente usa os mesmos números no
// formulário (o contador de caracteres); o servidor nunca confia no cliente e passa
// tudo por aqui antes de gravar no banco (server/opinioes.js).

/** Caracteres do texto: o mínimo para dizer alguma coisa e o máximo de um resumo curto. */
export const OPINIAO_MIN = 5;
export const OPINIAO_MAX = 500;

/** A nota é opcional, de 1 a 5 estrelas. */
export const NOTA_MIN = 1;
export const NOTA_MAX = 5;

/** O que o jogador está mandando (o chip do formulário). A primeira é a de fábrica. */
export const CATEGORIAS_OPINIAO = ['opiniao', 'sugestao', 'problema'];

/** De onde o formulário abriu: o botão do menu ou as estrelas da tela de resultado. */
export const ORIGENS_OPINIAO = ['menu', 'resultado'];

const RESULTADOS = ['vitoria', 'derrota', 'empate'];
const IDIOMAS = ['pt', 'en'];
const RACAS = ['acron', 'bellico', 'shrewdo', 'mechan'];
const CLASSES = ['assault', 'mobile', 'functional'];
const MODOS = ['online', 'publica', 'privada', 'teste', 'partida'];

/** Tamanho máximo do corpo do pedido HTTP (bytes): o texto cheio em UTF-8 cabe com folga. */
export const OPINIAO_CORPO_MAX = 4096;

// Tira os caracteres de controle (menos a quebra de linha), troca \r\n por \n e corta as
// quebras em excesso: o texto vai para um banco que o Mateus lê, não para um terminal.
function limparTexto(t) {
  return String(t)
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f​-‏‪-‮⁦-⁩]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const umDe = (lista, v) => (typeof v === 'string' && lista.includes(v) ? v : null);

/**
 * Quantos caracteres o texto conta (o que o jogador vê: um emoji conta um, não dois).
 * @param {string} t
 */
export function tamanhoTexto(t) {
  return [...limparTexto(t ?? '')].length;
}

/**
 * Saneia e valida o que chegou do formulário. Devolve `{ ok: true, opiniao }` com só os
 * campos conhecidos (o que não vale vira null) ou `{ ok: false, codigo }`:
 * 'texto_curto', 'texto_longo', 'nota_invalida', 'invalido' (não é um objeto).
 * O contexto (nave, modo, resultado da partida, idioma) é só para o Mateus entender a
 * opinião: o que vier errado nele some, não recusa a opinião.
 * @param {unknown} corpo
 */
export function validarOpiniao(corpo) {
  if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) return { ok: false, codigo: 'invalido' };
  if (typeof corpo.texto !== 'string') return { ok: false, codigo: 'texto_curto' };
  const texto = limparTexto(corpo.texto);
  const n = [...texto].length;
  if (n < OPINIAO_MIN) return { ok: false, codigo: 'texto_curto' };
  if (n > OPINIAO_MAX) return { ok: false, codigo: 'texto_longo' };
  let nota = null;
  if (corpo.nota !== undefined && corpo.nota !== null) {
    if (!Number.isInteger(corpo.nota) || corpo.nota < NOTA_MIN || corpo.nota > NOTA_MAX) return { ok: false, codigo: 'nota_invalida' };
    nota = corpo.nota;
  }
  const nome = typeof corpo.nome === 'string' ? limparTexto(corpo.nome).replace(/\n/g, ' ').slice(0, 16) || null : null;
  return {
    ok: true,
    opiniao: {
      texto,
      nota,
      categoria: umDe(CATEGORIAS_OPINIAO, corpo.categoria) ?? CATEGORIAS_OPINIAO[0],
      origem: umDe(ORIGENS_OPINIAO, corpo.origem) ?? 'menu',
      idioma: umDe(IDIOMAS, corpo.idioma),
      nome,
      raca: umDe(RACAS, corpo.raca),
      classe: umDe(CLASSES, corpo.classe),
      modo: umDe(MODOS, corpo.modo),
      resultado: umDe(RESULTADOS, corpo.resultado),
    },
  };
}
