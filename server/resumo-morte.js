// Resumo da última morte do piloto, como o "death recap" do Dota 2 (pedido do Mateus,
// 03/nov/2026): quem deu o golpe final, quem feriu a nave nos segundos antes da morte e
// quanto entrou de cada tipo de dano (Ph., Op., El.).
//
// Todo dano que um jogador leva (em World#ferir, já com o crítico, a resistência, os
// estados das armas e o escudo: o que de fato entrou, escudo + HP) fica anotado na nave
// (`danoRecente`) com o tick, a fonte e o tipo do golpe; o que passa de RESUMO_MORTE_S
// sai. Na morte, resumoDaMorte soma a janela por fonte e por tipo e o World manda o
// evento privado 'resumoMorte' só para quem morreu (server/visao.js, PRIVADOS); a
// anotação zera para a próxima vida. A fonte é guardada com o nome no momento do golpe,
// então o resumo sai certo mesmo se quem bateu já morreu ou saiu da partida.
//
// Golpe sem tipo de dano (a quebra de escudo sem escudo equipado, o dano devolvido do
// Canhão de Recuo) entra em `outro`.

import { DT } from '../shared/sim.js';

/** Segundos antes da morte que o resumo soma (o dano mais velho sai da conta). */
export const RESUMO_MORTE_S = 15;
const JANELA_TICKS = Math.round(RESUMO_MORTE_S / DT);

/** Os tipos de dano do resumo; `outro` é o golpe sem tipo. */
export const TIPOS_RESUMO = ['fisico', 'laser', 'eletrico', 'outro'];

/**
 * A fonte de um golpe para o resumo: a entidade que bateu (jogador, monstro, escolta,
 * torre sentinela, Núcleo...), com o que o cliente precisa para escrever o nome e a
 * cor. `ent` sem nada vira a fonte desconhecida.
 */
export function fonteDoGolpe(ent) {
  if (!ent) return { id: null, nome: 'Desconhecido', tipo: 'desconhecido' };
  const f = { id: ent.id, nome: ent.nome ?? '?', tipo: ent.tipo ?? 'torreta' };
  if (ent.esp) f.esp = ent.esp;
  if (ent.time !== undefined) f.time = ent.time;
  if (ent.tipo === 'jogador') {
    f.nivel = ent.nivel;
    if (ent.ia) f.ia = 1;
  }
  return f;
}

/** Tira da anotação o que passou da janela. */
function podar(lista, tick) {
  let i = 0;
  while (i < lista.length && tick - lista[i].t > JANELA_TICKS) i++;
  if (i) lista.splice(0, i);
}

/**
 * Anota `valor` de dano que `alvo` (jogador) levou de `fonte` (fonteDoGolpe) agora. O
 * mesmo tick, a mesma fonte e o mesmo tipo somam na mesma linha (o dreno fere a cada
 * tick, a rajada pega várias vezes).
 */
export function anotarDano(alvo, tick, fonte, tipoDano, valor) {
  if (!(valor > 0)) return;
  const lista = (alvo.danoRecente ??= []);
  const tipo = TIPOS_RESUMO.includes(tipoDano) ? tipoDano : 'outro';
  const ult = lista[lista.length - 1];
  if (ult && ult.t === tick && ult.f.id === fonte.id && ult.tipo === tipo) {
    ult.v += valor;
    return;
  }
  podar(lista, tick);
  lista.push({ t: tick, f: fonte, tipo, v: valor });
}

const vazio = () => ({ fisico: 0, laser: 0, eletrico: 0, outro: 0 });
const inteiro = (o) => {
  for (const k of TIPOS_RESUMO) o[k] = Math.round(o[k]);
  return o;
};

/**
 * O resumo da morte de `alvo` agora: `por` (a fonte do golpe final, ou null), as
 * `fontes` que feriram na janela (a que mais tirou primeiro, cada uma com o total e o
 * dano por tipo), o dano por `tipos` e o `total`, tudo em inteiros. Zera a anotação.
 */
export function resumoDaMorte(alvo, tick, por) {
  const lista = alvo.danoRecente ?? [];
  podar(lista, tick);
  const fontes = new Map();
  const tipos = vazio();
  for (const d of lista) {
    const chave = d.f.id ?? d.f.nome;
    let f = fontes.get(chave);
    if (!f) fontes.set(chave, (f = { ...d.f, total: 0, ...vazio() }));
    f[d.tipo] += d.v;
    f.total += d.v;
    tipos[d.tipo] += d.v;
  }
  alvo.danoRecente = [];
  const lista2 = [...fontes.values()].map((f) => ({ ...inteiro(f), total: Math.round(f.total) })).filter((f) => f.total > 0);
  lista2.sort((a, b) => b.total - a.total);
  inteiro(tipos);
  return {
    janela: RESUMO_MORTE_S,
    por: por ?? null,
    fontes: lista2,
    tipos,
    total: TIPOS_RESUMO.reduce((s, k) => s + tipos[k], 0),
  };
}
