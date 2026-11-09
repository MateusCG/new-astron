// Controle (joystick) pela Gamepad API: um laço próprio de quadros lê todos os
// controles ligados e, pelo mapa do controle (atalhos.js), dá às ações o mesmo que o
// teclado dá.
//
// Dois contextos (atalhos-regras.js):
// - 'voo': nenhuma janela de mexer aberta. Os analógicos e botões seguram as ações
//   (Controles.ler lê valorJoystick, analógico de verdade no acelerar e no girar) e o
//   apertar de cada um dispara a ação, como a tecla (emitirAcao).
// - 'menu': a tela de abertura, o menu, a tela de carregamento, a de resultado, a
//   janela de volume, a de Opções, a Loja/Evolução, o STATUS ou o INVENTÁRIO aberto. O controle
//   navega nela: o direcional (ou o analógico) leva o foco ao botão mais perto
//   daquele lado (navegação espacial, proximoNaDirecao), o Confirmar clica e o
//   Voltar é o Esc (main.js ouve uiVoltar). Numa barra (volume), ← e → mexem nela.
// Na troca de contexto o botão que estava segurado não dispara de novo: o ○ que
// fecha a Loja não pode decolar a nave no quadro seguinte.
//
// O foco do controle (o botão com o contorno, .foco-joy) não some sozinho: só sai
// quando o piloto mexe no teclado ou fecha a janela em que está. Se o painel troca o
// HTML (a Loja, o INVENTÁRIO e o STATUS se redesenham quando o ouro sobe), o foco
// volta ao mesmo botão no HTML novo; se o botão deixou de existir, ao mais perto de
// onde ele estava. O clique do mouse leva o foco do controle junto. Com o controle
// em uso, a janela que abre já vem com o foco no primeiro botão.
//
// A captura de um botão novo (aba Configurações) também é daqui: o primeiro botão ou
// eixo que passa do LIMIAR_APERTO depois de solto (o ✕ que abriu a captura precisa
// ser solto antes) vai para a ação.

import {
  ACOES,
  DIRECOES,
  LIMIAR_APERTO,
  NAV_ESPERA_S,
  NAV_REPETE_S,
  entradasApertadas,
  proximoNaDirecao,
  valorAcao,
} from './atalhos-regras.js';
import { mapasAtuais, emitirAcao, definirDispositivo, dispositivoAtual, capturaAtual, concluirCaptura } from './atalhos.js';

/** Janelas em que o controle navega, da que fica por cima para a de baixo. */
const ESCOPOS = [['#opiniao'], ['#volume'], ['#sair-partida'], ['#comandos'], ['#opcoes'], ['#resultado'], ['#servico', '#inventario', '#status'], ['#carregamento'], ['#entrada'], ['#abertura']];

/** Qualquer uma das janelas (a raiz do foco). */
const RAIZES = ESCOPOS.flat().join(', ');

/** As janelas da partida (as que se redesenham com o snapshot). */
const JANELAS_DA_PARTIDA = '#servico, #inventario, #status';

/** O que o foco do controle visita. */
const FOCAVEIS =
  'button:not(:disabled), a[href], input:not([type=hidden]):not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"]), [role="button"]';

let iniciado = false;
let pads = [];
let ctx = 'voo';
let ctxAntes = null;
const apertada = {}; // ação → apertada no quadro anterior
let bloqueadas = null; // na captura: as entradas seguradas quando ela começou
let nav = null; // { acao, prox }: direção segurada e quando repete
let ultimoFoco = null; // o último elemento que o controle focou
let ultimoCentro = null; // o centro dele (para achar o vizinho se ele sumir num redesenho)
let ultimaAssinatura = null; // quem ele é (assinatura): o mesmo botão no HTML novo
let focoAtivo = false; // o controle tem um botão focado (até o teclado ou a janela fechar)
let raizFoco = null; // a janela dele
let chaveEscopo = ''; // as janelas abertas no quadro anterior
let ultimo = 0;
const aoMudarControles = new Set();

const ligados = () => [...(navigator.getGamepads?.() ?? [])].filter((p) => p && p.connected);

/** Começa a ler os controles (uma vez por página). */
export function iniciarJoystick() {
  if (iniciado || typeof navigator === 'undefined' || !navigator.getGamepads) return;
  iniciado = true;
  const avisar = () => {
    pads = ligados();
    for (const fn of aoMudarControles) fn(pads);
  };
  addEventListener('gamepadconnected', avisar);
  addEventListener('gamepaddisconnected', avisar);
  // O teclado tira o foco do controle (o mouse não: o clique o leva junto).
  addEventListener('keydown', () => soltarFoco(), { capture: true });
  requestAnimationFrame(laco);
}

/** Controles ligados agora: [{ id, mapping, botoes, eixos }]. */
export function controlesLigados() {
  return ligados().map((p) => ({ id: p.id, mapping: p.mapping, botoes: p.buttons.length, eixos: p.axes.length }));
}

/** Chama fn quando um controle liga ou desliga. */
export function aoMudarControle(fn, { signal } = {}) {
  aoMudarControles.add(fn);
  signal?.addEventListener('abort', () => aoMudarControles.delete(fn), { once: true });
}

/** Quanto a ação está segurada no controle (0 a 1); 0 com uma janela de mexer aberta. */
export function valorJoystick(acao) {
  if (!pads.length) return 0;
  const a = ACOES.find((x) => x.id === acao);
  if (!a || (a.ctx !== 'sempre' && a.ctx !== ctx)) return 0;
  return valorAcao(mapasAtuais().controle, acao, pads);
}

/** As janelas abertas onde o controle navega (vazio: em voo). */
function escopoAberto() {
  for (const grupo of ESCOPOS) {
    const abertos = grupo.map((s) => document.querySelector(s)).filter((el) => el && !el.hidden && el.getClientRects().length);
    if (abertos.length) return abertos;
  }
  return [];
}

function visivel(el) {
  if (!el.getClientRects().length || el.closest('[inert], [aria-hidden="true"]')) return false;
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  const cs = getComputedStyle(el);
  return cs.visibility !== 'hidden' && cs.pointerEvents !== 'none';
}

function candidatos(escopo) {
  const lista = escopo.flatMap((raiz) => [...raiz.querySelectorAll(FOCAVEIS)]).filter(visivel);
  // Um contêiner focável (uma lista com tabindex) não entra se tem focáveis dentro.
  return lista.filter((el) => !lista.some((o) => o !== el && el.contains(o)));
}

const ret = (el) => {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
};

function tirarDestaque() {
  document.querySelector('.foco-joy')?.classList.remove('foco-joy');
}

/**
 * Rola só o contêiner rolável mais perto (overflow auto ou scroll) até o elemento
 * aparecer inteiro. O scrollIntoView rolaria também as telas de overflow escondido
 * (o menu inteiro subia, com o header fora da tela).
 */
function rolarAte(el) {
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY;
    if ((oy !== 'auto' && oy !== 'scroll') || p.scrollHeight <= p.clientHeight + 1) continue;
    const r = el.getBoundingClientRect();
    const c = p.getBoundingClientRect();
    const folga = 12;
    if (r.top < c.top + folga) p.scrollTop -= c.top + folga - r.top;
    else if (r.bottom > c.bottom - folga) p.scrollTop += Math.min(r.bottom - (c.bottom - folga), r.top - (c.top + folga));
    return;
  }
}

function focar(el) {
  tirarDestaque();
  el.focus({ preventScroll: true });
  rolarAte(el);
  el.classList.add('foco-joy');
  ultimoFoco = el;
  focoAtivo = true;
  raizFoco = el.closest(RAIZES);
  ultimaAssinatura = assinatura(el);
  const r = ret(el);
  ultimoCentro = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

/**
 * Quem é o botão, para achá-lo de novo depois de um redesenho: a tag e os atributos
 * que dizem o que ele faz (id, data-*, role); sem nenhum, o texto. A classe fica de
 * fora, porque muda com o estado (a carta da Loja fica "compravel" com mais ouro).
 */
function assinatura(el) {
  const attrs = [...el.attributes]
    .filter((a) => a.name === 'id' || a.name === 'role' || a.name.startsWith('data-'))
    .map((a) => `${a.name}=${a.value}`)
    .sort()
    .join('|');
  return `${el.tagName}|${attrs || el.textContent.trim().slice(0, 60)}`;
}

/**
 * Tira o foco do controle (o piloto mexeu no teclado ou a janela fechou). Numa
 * janela da partida o botão também perde o foco do navegador, senão o Espaço (que
 * também atira) clicaria nele.
 */
function soltarFoco() {
  if (!focoAtivo) return;
  focoAtivo = false;
  const ativo = document.activeElement;
  if (ativo?.classList.contains('foco-joy') && ativo.closest(JANELAS_DA_PARTIDA)) ativo.blur();
  tirarDestaque();
  ultimoFoco = raizFoco = ultimaAssinatura = ultimoCentro = null;
}

/** O elemento de `els` mais perto do centro do último foco (até `max` px). */
function maisPerto(els, max = Infinity) {
  let melhor = null;
  let dist = max;
  for (const el of els) {
    const r = ret(el);
    const d = Math.hypot(r.x + r.w / 2 - ultimoCentro.x, r.y + r.h / 2 - ultimoCentro.y);
    if (d < dist) {
      dist = d;
      melhor = el;
    }
  }
  return melhor;
}

/**
 * O foco do controle a cada quadro (as regras no topo do arquivo): solta quando a
 * janela dele fecha, segue o clique do mouse, devolve o foco que o clique tirou (os
 * painéis tiram o foco do botão clicado, por causa do Espaço), reencontra o botão
 * redesenhado (pela assinatura; entre iguais, o mais perto) ou o vizinho, e põe o
 * foco na janela que abre com o controle em uso.
 */
function atualizarFoco(escopo) {
  const chave = escopo.map((el) => el.id).join(',');
  const mudou = chave !== chaveEscopo;
  chaveEscopo = chave;
  if (focoAtivo && (!raizFoco || !escopo.includes(raizFoco))) soltarFoco();
  if (!escopo.length) return;
  if (!focoAtivo) {
    if (mudou && dispositivoAtual() === 'controle') {
      const p = primeiroFoco(candidatos(escopo));
      if (p) focar(p);
    }
    return;
  }
  // O caminho de todo quadro sem a lista inteira: o foco onde estava.
  const naJanela = (el) => el && el !== document.body && el.isConnected && escopo.some((r) => r.contains(el)) && visivel(el);
  const ativo = document.activeElement;
  // O mouse (ou o próprio menu) focou outro botão da janela: o controle vai junto.
  if (ativo !== ultimoFoco && naJanela(ativo) && ativo.matches(FOCAVEIS)) return focar(ativo);
  if (naJanela(ultimoFoco)) {
    if (ativo !== ultimoFoco || !ultimoFoco.classList.contains('foco-joy')) focar(ultimoFoco);
    return;
  }
  // O botão sumiu (redesenho, caixinha que fechou, tela que trocou).
  const lista = candidatos(escopo);
  const novo = maisPerto(lista.filter((el) => assinatura(el) === ultimaAssinatura)) ?? maisPerto(lista) ?? primeiroFoco(lista);
  if (novo) focar(novo);
}

/** De onde o controle parte: o foco, o último que ele focou ou o vizinho do lugar dele. */
function pontoDePartida(lista) {
  const ativo = document.activeElement;
  if (lista.includes(ativo)) return ativo;
  if (ultimoFoco && lista.includes(ultimoFoco)) return ultimoFoco;
  if (!ultimoCentro) return null;
  // O botão foi redesenhado (o painel trocou o HTML): o que está no mesmo lugar.
  return maisPerto(lista, 60);
}

/** O primeiro foco numa janela: o botão principal, o selecionado ou o primeiro. */
function primeiroFoco(lista) {
  return (
    lista.find((el) => el.matches('[data-joy-principal]')) ??
    lista.find((el) => el.matches('.sel, [aria-selected="true"]')) ??
    lista[0] ??
    null
  );
}

function mover(escopo, acao) {
  const lista = candidatos(escopo);
  const de = pontoDePartida(lista);
  if (!de) {
    const p = primeiroFoco(lista);
    if (p) focar(p);
    return;
  }
  const [dx] = DIRECOES[acao];
  // Barra (volume): ← e → mexem nela.
  if (dx && de instanceof HTMLInputElement && de.type === 'range') {
    const passo = (Number(de.max || 100) - Number(de.min || 0)) / 20;
    de.value = String(Number(de.value) + dx * passo);
    de.dispatchEvent(new Event('input', { bubbles: true }));
    de.dispatchEvent(new Event('change', { bubbles: true }));
    focar(de);
    return;
  }
  const outros = lista.filter((el) => el !== de);
  const i = proximoNaDirecao(ret(de), outros.map(ret), DIRECOES[acao]);
  focar(i >= 0 ? outros[i] : de);
}

function confirmar(escopo) {
  const lista = candidatos(escopo);
  const el = pontoDePartida(lista);
  if (!el) {
    const p = primeiroFoco(lista);
    if (!p) return;
    focar(p);
    if (p.matches('[data-joy-principal]')) p.click();
    return;
  }
  if (el instanceof HTMLInputElement && el.type === 'range') return focar(el);
  if (el instanceof HTMLInputElement && el.type !== 'checkbox' && el.type !== 'radio') return focar(el); // o nome: digita no teclado
  focar(el);
  el.click();
  // O clique pode ter trocado o HTML ou tirado o foco (os painéis tiram, por causa
  // do Espaço): volta ao mesmo lugar no próximo passo.
  if (el.isConnected && visivel(el)) focar(el);
}

function laco(agora) {
  requestAnimationFrame(laco);
  const dt = Math.min(0.1, (agora - ultimo) / 1000 || 0);
  ultimo = agora;
  pads = ligados();
  if (!pads.length) {
    soltarTudo();
    return;
  }
  const mapa = mapasAtuais().controle;
  const ativas = new Set(pads.flatMap(entradasApertadas));
  if (ativas.size) definirDispositivo('controle');

  // Captura de um botão novo para a tela de configurar.
  const cap = capturaAtual();
  if (cap?.disp === 'controle') {
    if (!bloqueadas) bloqueadas = new Set(ativas);
    for (const e of [...bloqueadas]) if (!ativas.has(e)) bloqueadas.delete(e);
    const nova = [...ativas].find((e) => !bloqueadas.has(e));
    if (nova) {
      bloqueadas = null;
      concluirCaptura(nova);
    }
    // Nada dispara durante a captura (nem ao terminar: o botão novo já está segurado).
    for (const a of ACOES) apertada[a.id] = valorAcao(mapa, a.id, pads) >= LIMIAR_APERTO;
    nav = null;
    return;
  }
  bloqueadas = null;

  const escopo = escopoAberto();
  ctx = escopo.length ? 'menu' : 'voo';
  const trocou = ctx !== ctxAntes;
  ctxAntes = ctx;
  for (const a of ACOES) {
    const ativa = a.ctx === 'sempre' || a.ctx === ctx;
    const agoraApertada = ativa && valorAcao(mapa, a.id, pads) >= LIMIAR_APERTO;
    const antes = apertada[a.id] ?? false;
    apertada[a.id] = agoraApertada;
    if (agoraApertada && !antes) {
      if (trocou) continue; // segurado de antes da troca: não dispara
      emitirAcao('apertou', a.id);
      if (DIRECOES[a.id]) {
        mover(escopo, a.id);
        nav = { acao: a.id, prox: NAV_ESPERA_S };
      } else if (a.id === 'uiConfirmar') confirmar(escopo);
    } else if (!agoraApertada && antes) {
      emitirAcao('soltou', a.id);
      if (nav?.acao === a.id) nav = null;
    }
  }
  atualizarFoco(escopo);
  // Direção segurada: repete no ritmo da lista.
  if (nav && ctx === 'menu' && apertada[nav.acao]) {
    nav.prox -= dt;
    if (nav.prox <= 0) {
      mover(escopo, nav.acao);
      nav.prox += NAV_REPETE_S;
    }
  } else nav = null;
}

/** O controle desligou: solta o que estava segurado. */
function soltarTudo() {
  for (const a of ACOES) {
    if (!apertada[a.id]) continue;
    apertada[a.id] = false;
    emitirAcao('soltou', a.id);
  }
  nav = null;
}
