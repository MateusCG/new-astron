// Regras do menu principal (a tela inicial), sem DOM: as abas do header, os modos de
// jogo, para onde o ESC volta, o que fica guardado no navegador e as escalas das
// barras de status das naves. O desenho fica em menu.js; aqui só o que dá para testar
// (tests/menu.test.mjs).
//
// "Como Jogar" (aprender) é a trilha do piloto iniciante, como a aba Learn do Dota 2
// (como-jogar.js, conteúdo em como-jogar-regras.js).
//
// Fluxo: menu (header com as abas) → JOGAR → escolha do modo → SELEÇÃO (raça, classe
// e times) → Decolar → tela de carregamento → partida. ESC volta um passo; o ESC de
// dentro da partida cai na aba Jogar.
//
// "Online" é jogar em tempo real com pilotos em outro lugar. "Jogar New Astron" (3
// contra 3 de gente) e "Partida Pública com Bots" (3 de gente contra 3 computadores)
// são modos de FILA (`fila`): a Seleção entra na fila do servidor (server/filas.js,
// fila.js no cliente), o Decolar vira "Aguardando…" e a partida começa sozinha quando
// a sala junta todos os pilotos e todos apertam Pronto. Os outros modos decolam
// direto. Cada modo diz se está disponível e o que manda no {t:'entrar'}: ligar um
// modo novo é mexer só aqui.
//
// O import de shared/ é relativo ('../../shared/...'): no navegador cai no mesmo
// /shared/naves.js dos outros módulos, e no Node (o teste) acha o arquivo.

import { NAVES, RACAS_JOGAVEIS, ORDEM_CLASSES, TIER_MAX, classeValida, racaJogavel } from '../../shared/naves.js';

/** Abas do header, na ordem. Bloqueada: visível, apagada, sem clique, selo EM BREVE. */
export const ABAS = Object.freeze([
  { id: 'jogar', nome: 'Jogar' },
  { id: 'aprender', nome: 'Como Jogar' },
  { id: 'naves', nome: 'Naves' },
  { id: 'config', nome: 'Configurações' },
  { id: 'ranking', nome: 'Ranking', bloqueada: true, dica: 'Chega com as contas de piloto' },
  { id: 'perfil', nome: 'Perfil', bloqueada: true, dica: 'Chega com as contas de piloto' },
]);

/**
 * Modos de jogo da aba Jogar, na ordem da tela. `entrar` é o que o modo acrescenta ao
 * pedido de entrada (`teste`: mundo de teste; `privada`: uma partida só sua); `fila`
 * é o modo da fila online (server/filas.js); `estado` é a linha em mono embaixo do
 * título (nos de fila, a contagem real que chega do servidor substitui: fila-regras.js,
 * textoContagemModo; sem conexão, "—", nunca um número inventado); `selo` é o selo da
 * tela de Seleção.
 */
export const MODOS = Object.freeze([
  {
    id: 'online',
    titulo: 'Jogar New Astron',
    estado: '— na fila',
    texto: 'Partida padrão 3 contra 3 contra outros pilotos online.',
    disponivel: true,
    selo: 'Jogar New Astron',
    fila: 'online',
  },
  {
    id: 'sandbox',
    titulo: 'Modo Sandbox',
    estado: 'Mundo só seu',
    texto: 'Teste naves, armas e builds à vontade: sem relógio, com ouro e XP na mão.',
    disponivel: true,
    selo: 'Modo Sandbox',
    entrar: { teste: true },
  },
  {
    id: 'publica',
    titulo: 'Partida Pública com Bots',
    estado: '— na fila',
    texto: 'Entre na fila com outros pilotos e enfrentem os computadores juntos.',
    disponivel: true,
    selo: 'Partida Pública com Bots',
    fila: 'publica',
  },
  {
    id: 'privada',
    titulo: 'Partida Privada com Bots',
    estado: '3 contra 3 · 20 min',
    texto: 'Uma partida só sua contra os computadores, sem ninguém de fora.',
    disponivel: true,
    selo: 'Partida Privada com Bots',
    entrar: { teste: false, privada: true },
  },
]);

/** Modo escolhido quando nada foi guardado (ou o guardado não vale mais). */
export const MODO_PADRAO = 'privada';
/** Aba aberta na primeira visita e ao voltar da partida. */
export const ABA_PADRAO = 'jogar';

/** Chaves do navegador (as dos times ficam em escolha-times.js, as de som em sons.js). */
export const CHAVES = Object.freeze({
  aba: 'astron.aba',
  modo: 'astron.modo',
  raca: 'astron.raca',
  classe: 'astron.classe',
  nome: 'astron.nome',
  destaque: 'astron.destaque',
  vitrine: 'astron.vitrine',
});

export const modoPorId = (id) => MODOS.find((m) => m.id === id) ?? null;
export const abaPorId = (id) => ABAS.find((a) => a.id === id) ?? null;

/** O modo pode ser escolhido agora? */
export function modoDisponivel(id) {
  return !!modoPorId(id)?.disponivel;
}

/**
 * O que o modo manda no {t:'entrar'} além do nome, da raça, da classe e dos times.
 * Modo bloqueado ou desconhecido: null (não decola). Modo de fila: { fila: modo } (a
 * Seleção entra na fila; quem decola é a sala, com o token).
 */
export function pedidoDoModo(id) {
  const m = modoPorId(id);
  if (!m?.disponivel) return null;
  return m.fila ? { fila: m.fila } : { teste: false, ...m.entrar };
}

/** O modo da fila online do modo do menu (null: o modo decola direto). */
export function filaDoModo(id) {
  const m = modoPorId(id);
  return m?.disponivel && m.fila ? m.fila : null;
}

/**
 * Para onde o ESC volta a partir da tela `tela` ('selecao' ou o id de uma aba):
 * Seleção → Jogar; Como Jogar, Naves e Configurações → Jogar; Jogar fica (null: nada a fazer).
 */
export function telaAnterior(tela) {
  if (tela === 'selecao') return 'jogar';
  if (tela === 'jogar' || !abaPorId(tela)) return null;
  return 'jogar';
}

/**
 * Nave em destaque na aba Jogar, escolhida no Hangar ("Mostrar na tela Jogar"):
 * qualquer nave jogável, de qualquer tier, guardada como 'raça/classe/tier'. Sem
 * destaque (null), a aba Jogar mostra a primeira nave da raça e da classe da Seleção.
 */
export function lerDestaque(texto) {
  const [raca, classe, t] = String(texto ?? '').split('/');
  const tier = /^\d+$/.test(t ?? '') ? Number(t) : -1;
  if (!racaJogavel(raca) || !classeValida(classe) || tier < 0 || tier > TIER_MAX) return null;
  return { raca, classe, tier };
}

/** O texto guardado no navegador para o destaque (null: sem destaque). */
export function textoDestaque(d) {
  return d ? `${d.raca}/${d.classe}/${d.tier}` : null;
}

/** As duas naves são a mesma (raça, classe e tier)? */
export function mesmaNave(a, b) {
  return !!a && !!b && a.raca === b.raca && a.classe === b.classe && a.tier === b.tier;
}

/**
 * As naves que a aba Jogar sorteia quando o piloto não pôs nenhuma em destaque no
 * Hangar (pedido do Mateus, 06/nov/2026): a última de cada linha (tier 4), Garuda,
 * Sephiros, Ulysses, Cheetahar, Phoenix, Chimera, Cyclone Wing, Alchemium Wing e
 * Hellion Wing. Uma por abertura do site (ou recarga), nunca a mesma da vez anterior.
 */
export const NAVES_VITRINE = Object.freeze(
  RACAS_JOGAVEIS.flatMap((raca) => ORDEM_CLASSES.map((classe) => Object.freeze({ raca, classe, tier: TIER_MAX }))),
);

/**
 * Sorteia a nave da aba Jogar entre `NAVES_VITRINE` com `rng()` (0..1), sem repetir a
 * `anterior` (o texto 'raça/classe/tier' guardado no navegador, CHAVES.vitrine).
 */
export function sortearVitrine(rng, anterior) {
  const ultima = lerDestaque(anterior);
  const opcoes = NAVES_VITRINE.filter((n) => !mesmaNave(n, ultima));
  const i = Math.min(opcoes.length - 1, Math.max(0, Math.floor(Number(rng()) * opcoes.length) || 0));
  return { ...opcoes[i] };
}

/**
 * A nave da aba Jogar: o destaque do Hangar, que o piloto escolheu e fica sempre, ou,
 * sem ele, a sorteada nesta abertura (sortearVitrine).
 */
export function naveDaVitrine(destaque, sorteada) {
  return destaque ?? sorteada;
}

/**
 * O estado do menu a partir do que estava guardado (`ler(chave)` → string ou null),
 * saneado: aba que existe e não está bloqueada, modo disponível, raça jogável, classe
 * válida, nome de até 16 letras e a nave em destaque (lerDestaque). A Seleção nunca abre sozinha: quem recarrega a
 * página cai na aba guardada.
 */
export function estadoGuardado(ler) {
  const aba = abaPorId(ler(CHAVES.aba));
  const raca = ler(CHAVES.raca);
  const classe = ler(CHAVES.classe);
  return {
    aba: aba && !aba.bloqueada ? aba.id : ABA_PADRAO,
    modo: modoDisponivel(ler(CHAVES.modo)) ? ler(CHAVES.modo) : MODO_PADRAO,
    raca: racaJogavel(raca) ? raca : RACAS_JOGAVEIS[0],
    classe: classeValida(classe) ? classe : ORDEM_CLASSES[0],
    nome: String(ler(CHAVES.nome) ?? '').slice(0, 16),
    destaque: lerDestaque(ler(CHAVES.destaque)),
  };
}

/**
 * Próximo modo disponível na direção `passo` (+1 desce, −1 sobe), pulando os
 * bloqueados e parando nas pontas (as setas da lista de modos).
 */
export function proximoModo(id, passo) {
  const disp = MODOS.filter((m) => m.disponivel);
  const i = disp.findIndex((m) => m.id === id);
  if (i < 0) return disp[0]?.id ?? null;
  return disp[Math.max(0, Math.min(disp.length - 1, i + passo))].id;
}

/**
 * Próxima casa da grade da Seleção (linhas = raças jogáveis, colunas = classes) pela
 * seta: dx move a classe, dy a raça, parando nas bordas.
 */
export function moverNaGrade(raca, classe, dx, dy) {
  const r = Math.max(0, RACAS_JOGAVEIS.indexOf(raca));
  const c = Math.max(0, ORDEM_CLASSES.indexOf(classe));
  return {
    raca: RACAS_JOGAVEIS[Math.max(0, Math.min(RACAS_JOGAVEIS.length - 1, r + dy))],
    classe: ORDEM_CLASSES[Math.max(0, Math.min(ORDEM_CLASSES.length - 1, c + dx))],
  };
}

/** Status das barras das naves, na ordem da ficha. */
export const STATUS_BARRAS = Object.freeze(['hp', 'energia', 'velocidade', 'regenHpVoo']);

/**
 * Maior valor de cada status entre as naves dadas (as barras saem em fração dele).
 * Na Seleção: as primeiras naves de todas as raças e classes, para comparar as
 * escolhas entre si. No catálogo: as 45 naves, para a barra da Kamasutra e a da
 * Warrior estarem na mesma régua.
 */
export function escalaStatus(naves) {
  const max = Object.fromEntries(STATUS_BARRAS.map((k) => [k, 0]));
  for (const n of naves) for (const k of STATUS_BARRAS) max[k] = Math.max(max[k], n[k] ?? 0);
  return max;
}

/** Todas as naves jogáveis (raças liberadas), da primeira à quinta de cada linha. */
export function navesJogaveis() {
  return RACAS_JOGAVEIS.flatMap((r) => ORDEM_CLASSES.flatMap((c) => NAVES[r][c]));
}

/** As primeiras naves de cada raça jogável e classe (as da Seleção). */
export function primeirasNaves() {
  return RACAS_JOGAVEIS.flatMap((r) => ORDEM_CLASSES.map((c) => NAVES[r][c][0]));
}
