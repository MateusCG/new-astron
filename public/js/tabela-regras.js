// Contas da tabela da partida (TAB, public/js/tabela.js), puras e testadas
// (tests/tabela.test.mjs): as linhas de cada time na ordem da tabela e o KDA.

/** Abates de jogador inimigo / mortes na partida / assistências, como no LoL ("2/7/5"). */
export function kda(p) {
  return `${p.abatesJog ?? 0}/${p.mortesPartida ?? 0}/${p.assist ?? 0}`;
}

/**
 * As linhas da tabela a partir da lista pública `jogadores` do snapshot: `meu` (o
 * time de quem olha, à esquerda) e `inimigo`, cada um com você primeiro, depois as
 * pessoas e depois os computadores (a mesma ordem da barra do time). O nick do
 * computador perde o " (IA)" (a tabela põe o selo) e `itens` sempre tem seis casas.
 */
export function linhasDaTabela(jogadores, { meuId, meuTime }) {
  const ordem = (a, b) => (b.id === meuId) - (a.id === meuId) || !!a.ia - !!b.ia || a.id - b.id;
  const linha = (j) => ({
    ...j,
    nome: j.ia ? String(j.nome).replace(/ \(IA\)$/, '') : String(j.nome),
    ia: !!j.ia,
    voce: j.id === meuId,
    itens: Array.from({ length: 6 }, (_, k) => (Array.isArray(j.itens) ? (j.itens[k] ?? null) : null)),
  });
  const doTime = (t) => (jogadores ?? []).filter((j) => j.time === t).sort(ordem).map(linha);
  return { meu: doTime(meuTime), inimigo: doTime(1 - meuTime) };
}
