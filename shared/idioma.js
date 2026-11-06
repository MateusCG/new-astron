// Idioma da interface (pedido do Mateus, 06/nov/2026: o jogo aberto para quem não
// fala português). O código continua em português: o texto em português é a própria
// chave, como no gettext, e `tr` devolve a tradução do idioma escolhido
// (shared/idioma-en.js). Sem tradução, devolve o português e, no navegador, avisa
// uma vez no console (tests/idioma.test.mjs cobra toda chave literal do código).
//
// O idioma é um só para a página inteira: no navegador sai de `astron.idioma` no
// localStorage ou, na primeira vez, da língua do navegador (português → 'pt', o resto
// → 'en'); trocar guarda e recarrega a página (`trocarIdioma`), então as constantes
// montadas na carga dos módulos já nascem no idioma certo. No Node (servidor e
// testes) é sempre 'pt'. Não mexe em nada da simulação: `shared/` continua
// determinístico.
//
// Variáveis no texto vão entre chaves: tr('Nível {n}', { n: 5 }).

import { EN } from './idioma-en.js';

/** Os idiomas da interface, na ordem do seletor. */
export const IDIOMAS = [
  { id: 'pt', nome: 'Português' },
  { id: 'en', nome: 'English' },
];

/** Onde o navegador guarda o idioma escolhido. */
export const CHAVE_IDIOMA = 'astron.idioma';

/** O idioma da primeira visita, pela língua do navegador: só português fica em português. */
export function idiomaDoNavegador(linguas = []) {
  const primeira = String(linguas[0] ?? '').toLowerCase();
  return primeira.startsWith('pt') ? 'pt' : 'en';
}

/** Saneia um idioma guardado (null se não é um dos conhecidos). */
export function idiomaValido(id) {
  return IDIOMAS.some((i) => i.id === id) ? id : null;
}

function idiomaInicial() {
  if (typeof document === 'undefined' || typeof navigator === 'undefined') return 'pt';
  let guardado = null;
  try {
    guardado = idiomaValido(localStorage.getItem(CHAVE_IDIOMA));
  } catch {
    // Navegador sem armazenamento: vale a língua do navegador.
  }
  return guardado ?? idiomaDoNavegador(navigator.languages?.length ? navigator.languages : [navigator.language]);
}

let atual = idiomaInicial();
const avisadas = new Set();

/** O idioma em uso ('pt' ou 'en'). */
export function idioma() {
  return atual;
}

/** Em inglês? */
export function emIngles() {
  return atual === 'en';
}

/** Troca o idioma desta página (testes; no navegador, use `trocarIdioma`). */
export function definirIdioma(id) {
  atual = idiomaValido(id) ?? 'pt';
}

/** Guarda o idioma e recarrega a página com ele (só no navegador). */
export function trocarIdioma(id) {
  const novo = idiomaValido(id);
  if (!novo || novo === atual) return;
  try {
    localStorage.setItem(CHAVE_IDIOMA, novo);
  } catch {
    // Sem armazenamento: troca só nesta página.
  }
  location.reload();
}

function preencher(texto, vars) {
  if (!vars) return texto;
  return texto.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

/**
 * O texto `pt` no idioma em uso, com as variáveis `{nome}` trocadas por `vars`.
 * @param {string} pt o texto em português (a chave)
 * @param {Record<string, unknown>} [vars]
 */
export function tr(pt, vars) {
  if (atual === 'pt' || pt == null || pt === '') return preencher(pt, vars);
  const en = EN[pt];
  if (en === undefined) {
    if (typeof document !== 'undefined' && !avisadas.has(pt)) {
      avisadas.add(pt);
      console.warn(`[idioma] sem tradução: ${JSON.stringify(pt)}`);
    }
    return preencher(pt, vars);
  }
  return preencher(en, vars);
}

/** Tem tradução para o idioma em uso? (o português sempre tem) */
export function temTraducao(pt) {
  return atual === 'pt' || EN[pt] !== undefined;
}

/**
 * O nome da arma no idioma em uso. No inglês, o nome do original (`nomeEn`), a não ser
 * que o dicionário tenha um nome arrumado para o nome em português (os erros de
 * digitação do original e as armas "(NPC)", que lá vêm com o código interno).
 */
export function nomeArma(w) {
  if (!w) return '';
  if (atual !== 'en') return w.nome;
  return EN[w.nome] ?? w.nomeEn ?? w.nome;
}

/** O nome do equipamento no idioma em uso (o `nome` é o do original, em inglês; `nomePt` o nosso). */
export function nomeEquip(e) {
  if (!e) return '';
  if (atual !== 'en') return e.nomePt ?? e.nome;
  return (e.nomePt && EN[e.nomePt]) ?? e.nome;
}

/** A localidade dos números (toLocaleString) no idioma em uso: 1.000 no português, 1,000 no inglês. */
export function localeNum() {
  return atual === 'en' ? 'en-US' : 'pt-BR';
}

/**
 * O nome de uma entidade vindo do servidor no idioma em uso: os nomes fixos dos
 * monstros e das peças do servidor ("Minerador", "Medusa Anciã") pelo dicionário, e o
 * " (IA)" dos computadores vira " (AI)". O nick de gente fica como está.
 */
export function nomeExibido(nome) {
  if (atual === 'pt' || typeof nome !== 'string') return nome;
  if (EN[nome] !== undefined) return EN[nome];
  if (nome.endsWith(' (IA)')) return `${nome.slice(0, -5)} (AI)`;
  return nome;
}

/**
 * Os nomes de uma mensagem do servidor no idioma em uso (rede.js chama em toda
 * mensagem): o das entidades e dos jogadores do snapshot e os dos eventos (`nome`,
 * `quem`, o `por` e as `fontes` do resumo da morte). Mexe na própria mensagem.
 */
export function traduzirNomesDaMensagem(m) {
  if (atual === 'pt' || !m) return m;
  const um = (o) => {
    if (o && typeof o.nome === 'string') o.nome = nomeExibido(o.nome);
  };
  for (const e of m.ents ?? []) um(e);
  for (const j of m.jogadores ?? []) um(j);
  for (const e of m.ev ?? []) {
    um(e);
    if (typeof e.quem === 'string') e.quem = nomeExibido(e.quem);
    if (e.por && typeof e.por === 'object') um(e.por);
    for (const f of e.fontes ?? []) um(f);
  }
  return m;
}
