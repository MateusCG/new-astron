// Cor do nick de uma nave de jogador pela resistência dela, como no original: dá para
// ler de longe em que o piloto investiu. Sem resistência, branco; Ph. puxa para o
// verde, Op. para o vermelho e El. para o azul (as cores dos tipos de dano do HUD,
// --dano-fisico, --dano-laser e --dano-eletrico em jogo.css); resistências mistas
// misturam as cores na proporção de cada uma (50% El. e 30% Op. dá um azul puxado
// para o vermelho; as três iguais, a mescla das três). Quanto mais resistência no
// total, mais forte a cor: a partir de RES_COR_CHEIA somada ela fica inteira.
// O time não está aqui: fica na barra de vida, na borda e no "NV" da etiqueta.
//
// Pura (sem DOM nem Three.js), testada em tests/cor-resistencia.test.mjs.

/** Cor de cada tipo, na ordem do `res` do snapshot: [Ph., Op., El.]. */
export const CORES_RESIST = [
  [0x6e, 0xe0, 0x7a], // Ph. (físico)
  [0xff, 0x6b, 0x8b], // Op. (laser)
  [0x8f, 0xa0, 0xff], // El. (elétrico)
];
export const COR_SEM_RESIST = [0xff, 0xff, 0xff];
/** Resistência somada (fração) a partir da qual o nick fica com a cor inteira. */
export const RES_COR_CHEIA = 0.5;

/**
 * Cor do nick para as resistências `res` ([Ph., Op., El.], frações; ausente = nenhuma).
 * @returns {string} '#rrggbb'
 */
export function corResistencia(res) {
  const r = (res ?? []).map((x) => Math.max(0, +x || 0));
  const soma = r.reduce((a, b) => a + b, 0);
  let cor = COR_SEM_RESIST;
  if (soma > 0) {
    const forca = Math.min(1, soma / RES_COR_CHEIA);
    cor = COR_SEM_RESIST.map((branco, c) => {
      const mistura = r.reduce((a, x, t) => a + (x / soma) * (CORES_RESIST[t]?.[c] ?? branco), 0);
      return branco + (mistura - branco) * forca;
    });
  }
  return '#' + cor.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('');
}
