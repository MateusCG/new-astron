// Contas da tabela da partida (TAB, public/js/tabela.js, e a tela de resultado,
// public/js/resultado.js), puras e testadas (tests/tabela.test.mjs): as linhas de cada
// time na ordem da tabela, o KDA e o destaque da partida.

import { tr, localeNum } from '../../shared/idioma.js';

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

/** A razão do KDA, como no LoL: (abates + assistências) / mortes (0 morte conta como 1). */
export function razaoKda(p) {
  return ((p.abatesJog ?? 0) + (p.assist ?? 0)) / Math.max(1, p.mortesPartida ?? 0);
}

/**
 * O destaque da partida (o MVP da tela de resultado), dos dois times: o melhor KDA
 * (razaoKda); no empate, mais abates de jogador, mais assistências, menos mortes,
 * mais farm e, por fim, quem entrou primeiro (o menor id). Numa partida sem nenhum
 * abate, assistência nem farm de ninguém, não há destaque (null). Devolve o id.
 */
export function melhorDaPartida(jogadores) {
  const chave = (j) => [razaoKda(j), j.abatesJog ?? 0, j.assist ?? 0, -(j.mortesPartida ?? 0), j.farm ?? 0];
  let melhor = null;
  let melhorChave = null;
  for (const j of jogadores ?? []) {
    const k = chave(j);
    if (!k[0] && !k[4]) continue; // nada feito na partida
    let cmp = 0;
    for (let i = 0; i < k.length && melhorChave && !cmp; i++) cmp = Math.sign(k[i] - melhorChave[i]);
    if (!melhor || cmp > 0 || (cmp === 0 && j.id < melhor.id)) {
      melhor = j;
      melhorChave = k;
    }
  }
  return melhor ? melhor.id : null;
}

/** A razão do KDA para mostrar ("3,5"; "Perfeito" sem morte e com abate ou assistência). */
export function textoRazaoKda(p) {
  const r = razaoKda(p);
  if (!(p.mortesPartida > 0) && r > 0) return tr('Perfeito');
  return r.toLocaleString(localeNum(), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}
