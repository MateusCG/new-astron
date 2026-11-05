// Atalhos em uso: o mapa do teclado e o do controle (atalhos-regras.js), guardados no
// navegador, e um só despacho de teclas para as ações. Os módulos não olham mais o
// `e.code`: pedem a ação (aoApertar('status', abrir)) e recebem tanto a tecla quanto
// o botão do controle (joystick.js chama emitirAcao). A aba Configurações troca o
// mapa (atribuirAtalho, capturar) e quem desenha uma tecla na tela usa kbdAcao ou
// marca o elemento com data-acao-rotulo: o rótulo segue o mapa e o último aparelho
// usado (teclado ou controle).
//
// Os listeners globais entram uma vez, quando o módulo carrega (antes do main.js
// registrar os dele): a captura de uma tecla nova na tela de configurar vem antes de
// tudo e engole a tecla (o Esc que cancela a captura não pode voltar o menu).
//
// Os botões do mouse são teclas do mapa do teclado ('Mouse0' o esquerdo, 'Mouse2' o
// direito). Na partida só contam com o clique na tela do jogo (#jogo, onde o HUD
// deixa o clique passar): o clique num botão do HUD, na Loja ou numa janela é da
// interface, não um tiro. Na captura, o clique que vira o atalho é engolido inteiro
// (o click, o auxclick e o menu do botão direito), senão ele clicaria a casa de novo
// ou o botão direito a apagaria.

import {
  ACAO,
  CHAVE_ATALHOS,
  lerAtalhos,
  textoAtalhos,
  rotuloAcao,
  mapaPadrao,
  atribuir,
  limpar,
  TECLAS_RESERVADAS,
  teclaDoMouse,
} from './atalhos-regras.js';

const lerGuardado = () => {
  try {
    return localStorage.getItem(CHAVE_ATALHOS);
  } catch {
    return null;
  }
};

let mapas = lerAtalhos(lerGuardado());
let dispositivo = 'teclado';
let captura = null; // { disp, acao, i, fim(resultado) }
const ouvintes = { apertou: new Map(), soltou: new Map() }; // ação → Set de { fn, repetir }
const aoMudar = new Set();

function guardar() {
  try {
    localStorage.setItem(CHAVE_ATALHOS, textoAtalhos(mapas));
  } catch {}
}

function avisarMudanca() {
  pintarRotulos();
  for (const fn of aoMudar) fn(mapas);
}

/** Os dois mapas em uso ({ teclado, controle }); não mexa direto, use as funções abaixo. */
export function mapasAtuais() {
  return mapas;
}

/** A tecla (`code`) faz esta ação no teclado? */
export function teclaFaz(acao, code) {
  return mapas.teclado[acao]?.includes(code) ?? false;
}

/** A tecla está no mapa de alguma ação? */
export function teclaNoMapa(code) {
  return Object.values(mapas.teclado).some((l) => l.includes(code));
}

/** Campo de digitar: as teclas ficam para ele (o nome do piloto). */
export function campoDeTexto(alvo) {
  if (alvo?.isContentEditable || (typeof HTMLTextAreaElement !== 'undefined' && alvo instanceof HTMLTextAreaElement)) return true;
  return typeof HTMLInputElement !== 'undefined' && alvo instanceof HTMLInputElement && !['range', 'checkbox', 'radio', 'button', 'submit'].includes(alvo.type);
}

/** O clique caiu na tela do jogo (e não num painel ou botão por cima dela)? */
export function cliqueNoJogo(alvo) {
  return !!alvo?.closest?.('#jogo');
}

/** Algum botão do mouse está no mapa do teclado? */
function mouseNoMapa(code) {
  return Object.values(mapas.teclado).some((l) => l.includes(code));
}

function ouvir(tipo, acao, fn, { signal, repetir = false } = {}) {
  if (!ACAO[acao]) throw new Error(`Ação desconhecida: ${acao}`);
  if (signal?.aborted) return;
  let lista = ouvintes[tipo].get(acao);
  if (!lista) ouvintes[tipo].set(acao, (lista = new Set()));
  const reg = { fn, repetir };
  lista.add(reg);
  signal?.addEventListener('abort', () => lista.delete(reg), { once: true });
}

/**
 * Chama `fn(evento?)` quando a ação é apertada, no teclado (o evento de tecla vem
 * junto) ou no controle (sem evento). Sem `repetir`, a repetição da tecla segurada
 * não conta. `signal` desliga.
 */
export function aoApertar(acao, fn, opcoes) {
  ouvir('apertou', acao, fn, opcoes);
}

/** Chama `fn(evento?)` quando a ação é solta (a tabela do TAB fecha ao soltar). */
export function aoSoltar(acao, fn, opcoes) {
  ouvir('soltou', acao, fn, opcoes);
}

/** Dispara a ação para quem ouve (o teclado daqui e o controle de joystick.js). */
export function emitirAcao(tipo, acao, evento = null) {
  for (const reg of [...(ouvintes[tipo].get(acao) ?? [])]) {
    if (tipo === 'apertou' && evento?.repeat && !reg.repetir) continue;
    reg.fn(evento);
  }
}

// ---------- Rótulos na tela ----------

/** O aparelho usado por último: 'teclado' ou 'controle'. */
export function dispositivoAtual() {
  return dispositivo;
}

/** Troca o aparelho dos rótulos (joystick.js no primeiro botão, o teclado na tecla). */
export function definirDispositivo(d) {
  if (d === dispositivo) return;
  dispositivo = d;
  if (globalThis.document?.documentElement) document.documentElement.dataset.aparelho = d;
  pintarRotulos();
}

/** O rótulo da ação no aparelho em uso (no controle sem botão, a tecla). */
export function rotulo(acao) {
  return rotuloAcao(mapas, dispositivo, acao) || rotuloAcao(mapas, 'teclado', acao);
}

const escapar = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** `<kbd>` da ação, que acompanha o mapa e o aparelho (pintarRotulos). */
export function kbdAcao(acao) {
  return `<kbd data-acao-rotulo="${acao}">${escapar(rotulo(acao))}</kbd>`;
}

/** Atualiza os elementos com data-acao-rotulo (os kbd do HUD, dos itens e das janelas). */
export function pintarRotulos(raiz = globalThis.document) {
  for (const el of raiz?.querySelectorAll?.('[data-acao-rotulo]') ?? []) {
    const t = rotulo(el.dataset.acaoRotulo);
    if (el.textContent !== t) el.textContent = t;
    el.classList.toggle('sem-atalho', !t);
  }
}

/** Chama fn(mapas) quando o mapa muda (não no troca de aparelho). Devolve o desligar. */
export function aoMudarAtalhos(fn, { signal } = {}) {
  aoMudar.add(fn);
  const tirar = () => aoMudar.delete(fn);
  signal?.addEventListener('abort', tirar, { once: true });
  return tirar;
}

// ---------- Trocar o mapa (aba Configurações) ----------

/** Põe a entrada na casa `i` da ação; devolve a ação de onde ela saiu (ou null). */
export function atribuirAtalho(disp, acao, i, entrada) {
  const r = atribuir(disp, mapas[disp], acao, i, entrada);
  if (r.mapa === mapas[disp]) return null;
  mapas = { ...mapas, [disp]: r.mapa };
  guardar();
  avisarMudanca();
  return r.tirouDe;
}

/** Tira a entrada da casa `i` da ação. */
export function limparAtalho(disp, acao, i) {
  mapas = { ...mapas, [disp]: limpar(mapas[disp], acao, i) };
  guardar();
  avisarMudanca();
}

/** Volta o aparelho ao mapa de fábrica. */
export function restaurarPadrao(disp) {
  mapas = { ...mapas, [disp]: mapaPadrao(disp) };
  guardar();
  avisarMudanca();
}

/**
 * Espera a próxima tecla (disp 'teclado') ou o próximo botão do controle (disp
 * 'controle', lido por joystick.js) para a casa `i` da ação. `fim(r)` recebe
 * { entrada } (já gravada, com `tirouDe`), { limpou: true } (Delete ou Backspace)
 * ou { cancelou: true } (Esc, outra captura ou cancelarCaptura).
 */
export function capturar(disp, acao, i, fim) {
  cancelarCaptura();
  captura = { disp, acao, i, fim };
}

/** A captura em andamento (ou null): joystick.js lê o controle para ela. */
export function capturaAtual() {
  return captura;
}

export function cancelarCaptura() {
  const c = captura;
  captura = null;
  c?.fim({ cancelou: true });
}

/** joystick.js achou o botão novo da captura do controle. */
export function concluirCaptura(entrada) {
  const c = captura;
  if (!c) return;
  captura = null;
  const tirouDe = atribuirAtalho(c.disp, c.acao, c.i, entrada);
  c.fim({ entrada, tirouDe });
}

// ---------- Teclado ----------

if (typeof addEventListener === 'function') {
  if (globalThis.document?.documentElement) document.documentElement.dataset.aparelho = dispositivo;
  // Captura de tecla nova: antes de qualquer outro listener, e engole a tecla.
  addEventListener(
    'keydown',
    (e) => {
      if (!captura) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.repeat) return;
      const c = captura;
      if (e.code === 'Escape') return cancelarCaptura();
      if (c.disp !== 'teclado') return; // o controle: só o Esc cancela
      if (e.code === 'Backspace' || e.code === 'Delete') {
        captura = null;
        limparAtalho(c.disp, c.acao, c.i);
        return c.fim({ limpou: true });
      }
      if (TECLAS_RESERVADAS.includes(e.code)) return;
      concluirCaptura(e.code);
    },
    { capture: true },
  );
  addEventListener('keyup', (e) => {
    if (captura) e.stopImmediatePropagation();
  }, { capture: true });

  // Captura de um botão do mouse: o mousedown vira o atalho, e o resto do clique
  // (mouseup, click, auxclick, menu do botão direito) é engolido até o fim dele.
  let engolindo = null; // o botão cujo clique está sendo engolido
  addEventListener(
    'mousedown',
    (e) => {
      if (captura?.disp !== 'teclado') return void (engolindo = null);
      const code = teclaDoMouse(e.button);
      if (!code) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      engolindo = e.button;
      concluirCaptura(code);
    },
    { capture: true },
  );
  for (const tipo of ['mouseup', 'click', 'auxclick', 'contextmenu']) {
    addEventListener(
      tipo,
      (e) => {
        if (engolindo === null || (tipo !== 'contextmenu' && e.button !== engolindo)) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        // O click vem logo depois do mouseup; o menu do botão direito, no Windows,
        // um pouco depois. Um clique novo também para de engolir (mousedown acima).
        if (tipo === 'mouseup') setTimeout(() => (engolindo = null), 250);
      },
      { capture: true },
    );
  }

  addEventListener('keydown', (e) => {
    definirDispositivo('teclado');
    if (campoDeTexto(e.target)) return;
    for (const [acao, lista] of Object.entries(mapas.teclado)) if (lista.includes(e.code)) emitirAcao('apertou', acao, e);
  });
  addEventListener('keyup', (e) => {
    for (const [acao, lista] of Object.entries(mapas.teclado)) if (lista.includes(e.code)) emitirAcao('soltou', acao, e);
  });
  addEventListener('pointerdown', () => definirDispositivo('teclado'), { capture: true });

  // Botões do mouse na partida: só o clique na tela do jogo aperta; soltar vale em
  // qualquer lugar (o botão pode ser solto em cima de um painel).
  addEventListener('mousedown', (e) => {
    const code = teclaDoMouse(e.button);
    if (!code || !cliqueNoJogo(e.target)) return;
    // O botão do meio rola a página e os laterais voltam e avançam no histórico.
    if (e.button !== 0 && mouseNoMapa(code)) e.preventDefault();
    for (const [acao, lista] of Object.entries(mapas.teclado)) if (lista.includes(code)) emitirAcao('apertou', acao, e);
  });
  addEventListener('mouseup', (e) => {
    const code = teclaDoMouse(e.button);
    if (!code) return;
    if (e.button > 2 && mouseNoMapa(code)) e.preventDefault();
    for (const [acao, lista] of Object.entries(mapas.teclado)) if (lista.includes(code)) emitirAcao('soltou', acao, e);
  });
  // O menu do botão direito não abre em cima do jogo (o botão direito pode ser o X).
  addEventListener('contextmenu', (e) => {
    if (cliqueNoJogo(e.target)) e.preventDefault();
  });
}
