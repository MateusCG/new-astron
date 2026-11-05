// Atalhos do teclado e do controle (joystick), puros e testados (tests/atalhos.test.mjs).
//
// Cada ação do jogo (acelerar, atirar com o Z, abrir o STATUS...) tem até
// ATALHOS_POR_ACAO teclas e até ATALHOS_POR_ACAO entradas do controle. O piloto troca
// tudo na aba Configurações do menu (Controles · Teclado e Controles · Controle), e o
// mapa fica no navegador (CHAVE_ATALHOS). atalhos.js aplica o mapa (teclado,
// eventos das ações e rótulos na tela) e joystick.js lê o controle pela Gamepad API.
//
// Teclas são o `KeyboardEvent.code` (a posição da tecla: o W continua no mesmo lugar
// num teclado AZERTY). Entradas do controle são texto curto: 'b7' é o botão 7 e
// 'a1-' o eixo 1 para o lado negativo (o analógico esquerdo para cima). Os números
// são os do mapeamento padrão da Gamepad API ("standard"), que é o de um DualShock 3
// ou 4 e do controle do Xbox; os padrões abaixo usam os 17 botões e os 4 eixos dele,
// e um controle sem o mapeamento padrão se configura apertando os botões na tela.
//
// Contexto de cada ação: 'voo' vale com a nave na tela, 'menu' só com um menu ou
// janela aberta (o controle navega nela) e 'sempre' nos dois. Uma tecla ou entrada só
// pode estar em uma ação do mesmo contexto (atribuir tira da outra), mas o mesmo
// botão pode ser o Turbo no voo e o Confirmar no menu.

/** Quantas teclas (e quantas entradas do controle) cada ação aceita. */
export const ATALHOS_POR_ACAO = 2;
/** Onde o mapa fica no navegador. */
export const CHAVE_ATALHOS = 'astron.atalhos';
/** Zona morta dos analógicos (abaixo disso, parado). */
export const ZONA_MORTA = 0.22;
/** A partir de quanto um botão analógico (L2, R2) ou um eixo conta como apertado. */
export const LIMIAR_APERTO = 0.5;

/**
 * As ações, na ordem da tela de Configurações. `fixaTeclado` é o rótulo de uma
 * tecla que não se troca (o Esc do menu, as setas e o Enter dos menus, que o
 * navegador já faz); a ação fica sem tecla no mapa.
 */
export const ACOES = Object.freeze([
  { id: 'frente', grupo: 'Voo', nome: 'Acelera', ctx: 'voo', segurar: true },
  { id: 're', grupo: 'Voo', nome: 'Ré', ctx: 'voo', segurar: true },
  { id: 'esq', grupo: 'Voo', nome: 'Gira para a esquerda', ctx: 'voo', segurar: true },
  { id: 'dir', grupo: 'Voo', nome: 'Gira para a direita', ctx: 'voo', segurar: true },
  { id: 'boost', grupo: 'Voo', nome: 'Turbo (segure)', ctx: 'voo', segurar: true },
  { id: 'pouso', grupo: 'Voo', nome: 'Pousa e decola', ctx: 'voo' },
  { id: 'recall', grupo: 'Voo', nome: 'Volta à base', ctx: 'voo' },
  { id: 'armaZ', grupo: 'Armas', nome: 'Atira com a arma do Z', ctx: 'voo', segurar: true },
  { id: 'armaX', grupo: 'Armas', nome: 'Atira com a arma do X', ctx: 'voo', segurar: true },
  { id: 'trocaZ', grupo: 'Armas', nome: 'Troca a arma do Z (casa Q)', ctx: 'voo' },
  { id: 'trocaX', grupo: 'Armas', nome: 'Troca a arma do X (casa E)', ctx: 'voo' },
  { id: 'reparo', grupo: 'Itens', nome: 'Kit de reparo', ctx: 'voo' },
  { id: 'energia', grupo: 'Itens', nome: 'Célula de energia', ctx: 'voo' },
  { id: 'camTroca', grupo: 'Câmera', nome: 'Troca a câmera', ctx: 'voo' },
  { id: 'camCima', grupo: 'Câmera', nome: 'Câmera mais de cima', ctx: 'voo', segurar: true },
  { id: 'camBaixo', grupo: 'Câmera', nome: 'Câmera mais de baixo', ctx: 'voo', segurar: true },
  { id: 'status', grupo: 'Janelas', nome: 'Status e pontos', ctx: 'voo' },
  { id: 'inventario', grupo: 'Janelas', nome: 'Inventário', ctx: 'voo' },
  { id: 'tabela', grupo: 'Janelas', nome: 'Tabela da partida (segure)', ctx: 'voo', segurar: true },
  { id: 'morte', grupo: 'Janelas', nome: 'Resumo da última morte', ctx: 'voo' },
  { id: 'opcoes', grupo: 'Janelas', nome: 'Opções (janelas, volume e ping)', ctx: 'voo' },
  { id: 'loja', grupo: 'Janelas', nome: 'Reabre a Loja ou a Evolução, pousado', ctx: 'voo' },
  { id: 'pontoHp', grupo: 'Pontos', nome: '+10 pontos em HP (Durabilidade)', ctx: 'voo' },
  { id: 'pontoEn', grupo: 'Pontos', nome: '+10 pontos em EN (Energia)', ctx: 'voo' },
  { id: 'pontoFis', grupo: 'Pontos', nome: '+10 pontos em Ph. (Físico)', ctx: 'voo' },
  { id: 'pontoEl', grupo: 'Pontos', nome: '+10 pontos em El. (Elétrico)', ctx: 'voo' },
  { id: 'pontoOp', grupo: 'Pontos', nome: '+10 pontos em Op. (Operacional)', ctx: 'voo' },
  { id: 'som', grupo: 'Sistema', nome: 'Liga e desliga o som', ctx: 'sempre' },
  { id: 'menu', grupo: 'Sistema', nome: 'Fecha a janela ou sai da partida', ctx: 'sempre', fixaTeclado: 'Esc' },
  { id: 'uiCima', grupo: 'Menus', nome: 'Navega para cima', ctx: 'menu', fixaTeclado: '↑', segurar: true },
  { id: 'uiBaixo', grupo: 'Menus', nome: 'Navega para baixo', ctx: 'menu', fixaTeclado: '↓', segurar: true },
  { id: 'uiEsq', grupo: 'Menus', nome: 'Navega para a esquerda', ctx: 'menu', fixaTeclado: '←', segurar: true },
  { id: 'uiDir', grupo: 'Menus', nome: 'Navega para a direita', ctx: 'menu', fixaTeclado: '→', segurar: true },
  { id: 'uiConfirmar', grupo: 'Menus', nome: 'Confirma (clica)', ctx: 'menu', fixaTeclado: 'Enter' },
  { id: 'uiVoltar', grupo: 'Menus', nome: 'Volta (fecha a janela)', ctx: 'menu', fixaTeclado: 'Esc' },
]);

/** A ação pelo id (ou undefined). */
export const ACAO = Object.freeze(Object.fromEntries(ACOES.map((a) => [a.id, a])));

/** As ações agrupadas, na ordem: [{ nome, acoes }]. */
export const GRUPOS_ACOES = Object.freeze(
  ACOES.reduce((gs, a) => {
    const g = gs.at(-1);
    if (g?.nome === a.grupo) g.acoes.push(a);
    else gs.push({ nome: a.grupo, acoes: [a] });
    return gs;
  }, []),
);

/** Teclado de fábrica (o mesmo de antes da tela de configurar). */
export const TECLADO_PADRAO = Object.freeze({
  frente: ['KeyW', 'ArrowUp'],
  re: ['KeyS', 'ArrowDown'],
  esq: ['KeyA', 'ArrowLeft'],
  dir: ['KeyD', 'ArrowRight'],
  boost: ['ShiftLeft', 'ShiftRight'],
  pouso: ['KeyL'],
  recall: ['KeyB'],
  armaZ: ['KeyZ', 'Space'],
  armaX: ['KeyX', 'KeyK'],
  trocaZ: ['KeyQ'],
  trocaX: ['KeyE'],
  reparo: ['KeyR'],
  energia: ['KeyF'],
  camTroca: ['KeyV'],
  camCima: ['KeyT', 'PageUp'],
  camBaixo: ['KeyG', 'PageDown'],
  status: ['KeyC'],
  inventario: ['KeyI'],
  tabela: ['Tab'],
  morte: ['KeyH'],
  opcoes: ['KeyO'],
  loja: ['Enter', 'NumpadEnter'],
  pontoHp: ['Digit1', 'Numpad1'],
  pontoEn: ['Digit2', 'Numpad2'],
  pontoFis: ['Digit3', 'Numpad3'],
  pontoEl: ['Digit4', 'Numpad4'],
  pontoOp: ['Digit5', 'Numpad5'],
  som: ['KeyM'],
});

/**
 * Controle de fábrica, no mapeamento padrão (DualShock 3: ✕ 0, ○ 1, □ 2, △ 3, L1 4,
 * R1 5, L2 6, R2 7, Select 8, Start 9, L3 10, R3 11, direcional 12–15, PS 16; eixos:
 * analógico esquerdo 0 e 1, direito 2 e 3). O lado direito é o Z (R2 atira, R1 troca)
 * e o esquerdo o X (L2 e L1), como as teclas Z e X no teclado. Os pontos (pontoHp a
 * pontoOp) ficam sem botão: os 17 já têm ação no voo (as Opções no PS), e no controle os pontos se põem
 * pela janela STATUS (direcional para cima); quem quiser atribui na aba Configurações.
 */
export const CONTROLE_PADRAO = Object.freeze({
  frente: ['a1-'],
  re: ['a1+'],
  esq: ['a0-'],
  dir: ['a0+'],
  boost: ['b0'],
  pouso: ['b1'],
  recall: ['b10'],
  armaZ: ['b7'],
  armaX: ['b6'],
  trocaZ: ['b5'],
  trocaX: ['b4'],
  reparo: ['b2'],
  energia: ['b3'],
  camTroca: ['b11'],
  camCima: ['a3-'],
  camBaixo: ['a3+'],
  status: ['b12'],
  inventario: ['b13'],
  tabela: ['b8'],
  morte: ['b14'],
  opcoes: ['b16'],
  loja: ['b15'],
  menu: ['b9'],
  uiCima: ['b12', 'a1-'],
  uiBaixo: ['b13', 'a1+'],
  uiEsq: ['b14', 'a0-'],
  uiDir: ['b15', 'a0+'],
  uiConfirmar: ['b0'],
  uiVoltar: ['b1'],
});

const RE_TECLA = /^[A-Z][A-Za-z0-9]{1,30}$/;
const RE_ENTRADA = /^(?:b\d{1,2}|a\d{1,2}[+-])$/;

/** É um `code` de tecla aceitável no mapa? */
export const teclaValida = (c) => typeof c === 'string' && RE_TECLA.test(c);
/** É uma entrada do controle aceitável ('b7', 'a1-')? */
export const entradaValida = (c) => typeof c === 'string' && RE_ENTRADA.test(c);

/** Teclas que nunca entram no mapa: o Esc é o menu e as do sistema. */
export const TECLAS_RESERVADAS = Object.freeze(['Escape', 'MetaLeft', 'MetaRight', 'ContextMenu', 'F5', 'F11', 'F12']);

/** Os dois contextos conflitam (uma tecla não pode servir aos dois ao mesmo tempo)? */
export function contextosConflitam(a, b) {
  return a === b || a === 'sempre' || b === 'sempre';
}

/**
 * Mapa de fábrica de um dispositivo ('teclado' | 'controle'): { acao: [entradas] }
 * para todas as ações (cópias, para mexer à vontade).
 */
export function mapaPadrao(disp) {
  const base = disp === 'teclado' ? TECLADO_PADRAO : CONTROLE_PADRAO;
  return Object.fromEntries(ACOES.map((a) => [a.id, disp === 'teclado' && a.fixaTeclado ? [] : [...(base[a.id] ?? [])]]));
}

/**
 * Limpa um mapa vindo do navegador: ação desconhecida sai, a que falta volta ao
 * padrão, entrada inválida sai, no máximo ATALHOS_POR_ACAO por ação, e a entrada
 * repetida em contextos que conflitam fica só na primeira ação (na ordem de ACOES).
 */
export function sanearMapa(disp, cru) {
  const padrao = mapaPadrao(disp);
  if (!cru || typeof cru !== 'object' || Array.isArray(cru)) return padrao;
  const valida = disp === 'teclado' ? (c) => teclaValida(c) && !TECLAS_RESERVADAS.includes(c) : entradaValida;
  const mapa = {};
  const usadas = []; // [entrada, ctx]
  for (const a of ACOES) {
    if (disp === 'teclado' && a.fixaTeclado) {
      mapa[a.id] = [];
      continue;
    }
    const lista = Object.hasOwn(cru, a.id) && Array.isArray(cru[a.id]) ? cru[a.id] : padrao[a.id];
    const fica = [];
    for (const c of lista) {
      if (fica.length >= ATALHOS_POR_ACAO || !valida(c) || fica.includes(c)) continue;
      if (usadas.some(([u, ctx]) => u === c && contextosConflitam(ctx, a.ctx))) continue;
      fica.push(c);
      usadas.push([c, a.ctx]);
    }
    mapa[a.id] = fica;
  }
  return mapa;
}

/** Lê os dois mapas do texto guardado (JSON); qualquer defeito volta ao padrão. */
export function lerAtalhos(texto) {
  let cru = null;
  try {
    cru = texto ? JSON.parse(texto) : null;
  } catch {
    cru = null;
  }
  return { teclado: sanearMapa('teclado', cru?.teclado), controle: sanearMapa('controle', cru?.controle) };
}

/** O texto para guardar os dois mapas. */
export function textoAtalhos({ teclado, controle }) {
  return JSON.stringify({ v: 1, teclado, controle });
}

/**
 * Põe `entrada` na casa `i` da ação (substitui o que havia nela). A mesma entrada em
 * outra ação de contexto que conflita sai de lá. Devolve { mapa, tirouDe } (o mapa
 * novo e a ação de onde a entrada saiu, ou null); a entrada inválida não muda nada.
 */
export function atribuir(disp, mapa, acao, i, entrada) {
  const a = ACAO[acao];
  const valida = disp === 'teclado' ? teclaValida(entrada) && !TECLAS_RESERVADAS.includes(entrada) : entradaValida(entrada);
  if (!a || !valida || (disp === 'teclado' && a.fixaTeclado) || i < 0 || i >= ATALHOS_POR_ACAO) return { mapa, tirouDe: null };
  const novo = Object.fromEntries(Object.entries(mapa).map(([k, v]) => [k, [...v]]));
  let tirouDe = null;
  for (const b of ACOES) {
    if (b.id === acao || !contextosConflitam(a.ctx, b.ctx)) continue;
    const j = novo[b.id]?.indexOf(entrada) ?? -1;
    if (j >= 0) {
      novo[b.id].splice(j, 1);
      tirouDe = b.id;
    }
  }
  // Casa ocupada: troca; casa vazia: entra no fim. Se a entrada já estava na outra
  // casa da mesma ação, fica uma só.
  const atual = novo[acao] ?? [];
  const lista = i < atual.length ? atual.map((c, k) => (k === i ? entrada : c)) : [...atual, entrada];
  novo[acao] = lista.filter((c, k) => lista.indexOf(c) === k).slice(0, ATALHOS_POR_ACAO);
  return { mapa: novo, tirouDe };
}

/** Tira a entrada da casa `i` da ação. */
export function limpar(mapa, acao, i) {
  const novo = Object.fromEntries(Object.entries(mapa).map(([k, v]) => [k, [...v]]));
  if (novo[acao]) novo[acao].splice(i, 1);
  return novo;
}

/** A ação (do contexto) que usa esta tecla ou entrada, ou null. */
export function acaoDe(mapa, entrada, ctxs = ['voo', 'menu', 'sempre']) {
  return ACOES.find((a) => ctxs.includes(a.ctx) && mapa[a.id]?.includes(entrada))?.id ?? null;
}

// ---------- Nomes na tela ----------

const NOMES_TECLA = {
  Space: 'Espaço',
  Enter: 'Enter',
  NumpadEnter: 'Enter num.',
  Tab: 'TAB',
  Backspace: '⌫',
  ShiftLeft: 'Shift',
  ShiftRight: 'Shift dir.',
  ControlLeft: 'Ctrl',
  ControlRight: 'Ctrl dir.',
  AltLeft: 'Alt',
  AltRight: 'AltGr',
  CapsLock: 'Caps',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  PageUp: 'PgUp',
  PageDown: 'PgDn',
  Home: 'Home',
  End: 'End',
  Insert: 'Ins',
  Delete: 'Del',
  Backquote: "'",
  Minus: '-',
  Equal: '=',
  BracketLeft: '´',
  BracketRight: '[',
  Backslash: ']',
  IntlBackslash: '\\',
  Semicolon: 'Ç',
  Quote: '~',
  Comma: ',',
  Period: '.',
  Slash: ';',
  IntlRo: '/',
  NumpadAdd: 'Num +',
  NumpadSubtract: 'Num -',
  NumpadMultiply: 'Num *',
  NumpadDivide: 'Num /',
  NumpadDecimal: 'Num ,',
};

/** Nome curto de uma tecla (o `code`) para a tela: 'KeyW' → 'W', 'Space' → 'Espaço'. */
export function nomeTecla(code) {
  if (!code) return '';
  if (NOMES_TECLA[code]) return NOMES_TECLA[code];
  let m = /^Key([A-Z])$/.exec(code);
  if (m) return m[1];
  m = /^Digit(\d)$/.exec(code);
  if (m) return m[1];
  m = /^Numpad(\d)$/.exec(code);
  if (m) return `Num ${m[1]}`;
  return code;
}

/** Botões do mapeamento padrão com o nome do DualShock 3 [curto, longo]. */
const NOMES_BOTAO = [
  ['✕', '✕ (Cruz)'],
  ['○', '○ (Círculo)'],
  ['□', '□ (Quadrado)'],
  ['△', '△ (Triângulo)'],
  ['L1', 'L1'],
  ['R1', 'R1'],
  ['L2', 'L2'],
  ['R2', 'R2'],
  ['Select', 'Select'],
  ['Start', 'Start'],
  ['L3', 'L3 (aperta o analógico esq.)'],
  ['R3', 'R3 (aperta o analógico dir.)'],
  ['D↑', 'Direcional ↑'],
  ['D↓', 'Direcional ↓'],
  ['D←', 'Direcional ←'],
  ['D→', 'Direcional →'],
  ['PS', 'PS'],
];
const NOMES_EIXO = {
  'a0-': ['LS←', 'Analógico esq. ←'],
  'a0+': ['LS→', 'Analógico esq. →'],
  'a1-': ['LS↑', 'Analógico esq. ↑'],
  'a1+': ['LS↓', 'Analógico esq. ↓'],
  'a2-': ['RS←', 'Analógico dir. ←'],
  'a2+': ['RS→', 'Analógico dir. →'],
  'a3-': ['RS↑', 'Analógico dir. ↑'],
  'a3+': ['RS↓', 'Analógico dir. ↓'],
};

/** Nome de uma entrada do controle: curto ('R2', 'LS↑') ou longo ('Analógico esq. ↑'). */
export function nomeEntrada(e, longo = false) {
  if (!entradaValida(e)) return '';
  if (e[0] === 'b') {
    const n = Number(e.slice(1));
    return NOMES_BOTAO[n]?.[longo ? 1 : 0] ?? (longo ? `Botão ${n}` : `B${n}`);
  }
  if (NOMES_EIXO[e]) return NOMES_EIXO[e][longo ? 1 : 0];
  return `${longo ? 'Eixo ' : 'E'}${e.slice(1, -1)}${e.at(-1)}`;
}

/** Rótulo da ação no dispositivo (a primeira entrada, ou a tecla fixa), '' sem nada. */
export function rotuloAcao(mapas, disp, acao) {
  const a = ACAO[acao];
  if (!a) return '';
  const e = mapas?.[disp]?.[acao]?.[0];
  if (disp === 'teclado') return e ? nomeTecla(e) : (a.fixaTeclado ?? '');
  return e ? nomeEntrada(e) : '';
}

// ---------- Leitura do controle ----------

/** Valor de 0 a 1 de um eixo além da zona morta (reescalado: sai do 0 sem pulo). */
export function alemDaZonaMorta(v) {
  const m = Math.abs(v);
  if (!(m > ZONA_MORTA)) return 0;
  return Math.min(1, (m - ZONA_MORTA) / (1 - ZONA_MORTA));
}

/**
 * Quanto uma entrada está apertada (0 a 1) num controle `{ buttons: [{value, pressed}],
 * axes: [números] }`: botão pelo valor (analógico no L2 e no R2), eixo pelo lado.
 */
export function valorEntrada(pad, e) {
  if (!pad || !entradaValida(e)) return 0;
  if (e[0] === 'b') {
    const b = pad.buttons?.[Number(e.slice(1))];
    if (!b) return 0;
    const v = typeof b === 'number' ? b : Math.max(b.value ?? 0, b.pressed ? 1 : 0);
    return v > 0.05 ? Math.min(1, v) : 0;
  }
  const v = pad.axes?.[Number(e.slice(1, -1))];
  if (typeof v !== 'number') return 0;
  const lado = e.at(-1) === '-' ? -v : v;
  return lado > 0 ? alemDaZonaMorta(lado) : 0;
}

/** Todas as entradas de um controle que estão apertadas além do LIMIAR_APERTO. */
export function entradasApertadas(pad) {
  const lista = [];
  if (!pad) return lista;
  (pad.buttons ?? []).forEach((_, i) => {
    if (valorEntrada(pad, `b${i}`) >= LIMIAR_APERTO) lista.push(`b${i}`);
  });
  (pad.axes ?? []).forEach((_, i) => {
    for (const lado of ['-', '+']) if (valorEntrada(pad, `a${i}${lado}`) >= LIMIAR_APERTO) lista.push(`a${i}${lado}`);
  });
  return lista;
}

/** Valor da ação (0 a 1): a maior das entradas dela, em todos os controles ligados. */
export function valorAcao(mapa, acao, pads) {
  let v = 0;
  for (const e of mapa?.[acao] ?? []) for (const p of pads) v = Math.max(v, valorEntrada(p, e));
  return v;
}

// ---------- Navegação dos menus com o controle ----------

/** Direções da navegação: [dx, dy] na tela (y para baixo). */
export const DIRECOES = Object.freeze({ uiCima: [0, -1], uiBaixo: [0, 1], uiEsq: [-1, 0], uiDir: [1, 0] });

/**
 * Navegação espacial: de `de` (retângulo {x, y, w, h}) na direção [dx, dy], o índice
 * do retângulo de `alvos` mais perto que está daquele lado (o centro além da borda
 * de partida), com a distância de lado pesando o dobro; -1 se não há nenhum.
 */
export function proximoNaDirecao(de, alvos, [dx, dy]) {
  const cx = de.x + de.w / 2;
  const cy = de.y + de.h / 2;
  let melhor = -1;
  let melhorCusto = Infinity;
  alvos.forEach((r, i) => {
    const ax = r.x + r.w / 2;
    const ay = r.y + r.h / 2;
    // Para frente: o centro do alvo passa do centro de partida (com folga de 1 px).
    const frente = dx ? (ax - cx) * dx : (ay - cy) * dy;
    if (frente <= 1) return;
    // Distância na direção (entre as bordas) e de lado (entre as faixas que se sobrepõem).
    const ladoDe = dx ? [de.y, de.y + de.h] : [de.x, de.x + de.w];
    const ladoAlvo = dx ? [r.y, r.y + r.h] : [r.x, r.x + r.w];
    const lado = Math.max(0, ladoAlvo[0] - ladoDe[1], ladoDe[0] - ladoAlvo[1]);
    const custo = frente + lado * 2;
    if (custo < melhorCusto) {
      melhorCusto = custo;
      melhor = i;
    }
  });
  return melhor;
}

/** Ritmo da navegação segurando a direção: o primeiro passo, a espera e o repetir. */
export const NAV_ESPERA_S = 0.4;
export const NAV_REPETE_S = 0.12;
