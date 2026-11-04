// Regras do menu principal (a tela inicial), sem DOM: as abas do header, os modos de
// jogo, para onde o ESC volta, o que fica guardado no navegador e as escalas das
// barras de status das naves. O desenho fica em menu.js; aqui só o que dá para testar
// (tests/menu.test.mjs).
//
// Fluxo: menu (header com as abas) → JOGAR → escolha do modo → SELEÇÃO (raça, classe
// e times) → Decolar → tela de carregamento → partida. ESC volta um passo; o ESC de
// dentro da partida cai na aba Jogar.
//
// "Online" é jogar em tempo real com pilotos em outro lugar (um amigo que entra na
// sua sala). Isso vem depois (servidor hospedado, salas e fila), então "Jogar New
// Astron" e "Partida Pública com Bots" ficam bloqueados. Cada modo diz se está
// disponível e o que manda no {t:'entrar'}: ligar um modo novo é mexer só aqui.
//
// O import de shared/ é relativo ('../../shared/...'): no navegador cai no mesmo
// /shared/naves.js dos outros módulos, e no Node (o teste) acha o arquivo.

import { NAVES, RACAS_JOGAVEIS, ORDEM_CLASSES, TIER_MAX, classeValida, racaJogavel } from '../../shared/naves.js';

/** Abas do header, na ordem. Bloqueada: visível, apagada, sem clique, selo EM BREVE. */
export const ABAS = Object.freeze([
  { id: 'jogar', nome: 'Jogar' },
  { id: 'naves', nome: 'Naves' },
  { id: 'config', nome: 'Configurações' },
  { id: 'ranking', nome: 'Ranking', bloqueada: true, dica: 'Chega com o jogo online' },
  { id: 'perfil', nome: 'Perfil', bloqueada: true, dica: 'Chega com o jogo online' },
]);

/**
 * Modos de jogo da aba Jogar, na ordem da tela. `entrar` é o que o modo acrescenta ao
 * pedido de entrada (o servidor de hoje só conhece `teste`); `estado` é a linha em
 * mono embaixo do título; `selo` é o selo da tela de Seleção. Fila sem número: "—"
 * (nunca um número inventado).
 */
export const MODOS = Object.freeze([
  {
    id: 'online',
    titulo: 'Jogar New Astron',
    estado: '— na fila',
    texto: 'Partida padrão 3 contra 3 contra outros pilotos online.',
    disponivel: false,
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
    disponivel: false,
  },
  {
    id: 'privada',
    titulo: 'Partida Privada com Bots',
    estado: '3 contra 3 · 20 min',
    texto: 'Uma partida normal contra os computadores. Jogar em grupo chega com o online.',
    disponivel: true,
    selo: 'Partida Privada com Bots',
    entrar: { teste: false },
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
});

export const modoPorId = (id) => MODOS.find((m) => m.id === id) ?? null;
export const abaPorId = (id) => ABAS.find((a) => a.id === id) ?? null;

/** O modo pode ser escolhido agora? */
export function modoDisponivel(id) {
  return !!modoPorId(id)?.disponivel;
}

/**
 * O que o modo manda no {t:'entrar'} além do nome, da raça, da classe e dos times.
 * Modo bloqueado ou desconhecido: null (não decola).
 */
export function pedidoDoModo(id) {
  const m = modoPorId(id);
  return m?.disponivel ? { teste: false, ...m.entrar } : null;
}

/**
 * Para onde o ESC volta a partir da tela `tela` ('selecao' ou o id de uma aba):
 * Seleção → Jogar; Naves e Configurações → Jogar; Jogar fica (null: nada a fazer).
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

/** A nave da aba Jogar: o destaque do Hangar ou, sem ele, a primeira da Seleção. */
export function naveDaVitrine(destaque, raca, classe) {
  return destaque ?? { raca, classe, tier: 0 };
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

/**
 * Atalhos de teclado, agrupados, para a aba Configurações → Teclado (só mostra; os
 * de verdade estão em controles.js e main.js).
 */
export const GRUPOS_TECLAS = Object.freeze([
  {
    nome: 'Voo',
    teclas: [
      [['W', 'S'], 'Acelera e dá ré'],
      [['A', 'D'], 'Gira a nave'],
      [['Shift'], 'Boost'],
      [['L'], 'Pousa e decola (abre Loja e Evolução)'],
      [['B'], 'Volta à base (6 s quase parado)'],
    ],
  },
  {
    nome: 'Armas',
    teclas: [
      [['Z', 'X'], 'Atiram (uma arma em cada)'],
      [['Q'], 'Troca o Z pela arma guardada no Q'],
      [['E'], 'Troca o X pela arma guardada no E'],
    ],
  },
  {
    nome: 'Itens',
    teclas: [
      [['R'], 'Kit de reparo'],
      [['F'], 'Célula de energia'],
    ],
  },
  {
    nome: 'Câmera',
    teclas: [
      [['V'], 'Troca a câmera'],
      [['T', 'G'], 'Altura da câmera (ou a roda do mouse)'],
    ],
  },
  {
    nome: 'Janelas',
    teclas: [
      [['C'], 'Status e pontos'],
      [['I'], 'Inventário'],
      [['TAB'], 'Tabela da partida (segure)'],
      [['H'], 'Resumo da última morte'],
      [['Enter'], 'Reabre a Loja ou a Evolução, pousado'],
    ],
  },
  {
    nome: 'Sistema',
    teclas: [
      [['M'], 'Liga e desliga o som'],
      [['Esc'], 'Fecha a janela ou sai da partida'],
    ],
  },
]);
