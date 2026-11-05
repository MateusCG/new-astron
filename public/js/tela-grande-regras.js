// Quem abre o site no celular (pedido do Mateus, 05/nov/2026): o jogo ainda não está
// pronto para tela pequena e toque, então em vez da abertura aparece a tela "Abra
// numa tela maior" (#tela-grande, inicio.js), e o jogo nem começa a baixar.
//
// Celular é: o navegador se diz celular (Android com "Mobile", iPhone, iPod, Windows
// Phone ou "Mobi"; o iPad e os tablets Android não dizem), ou o aparelho só tem toque
// (sem nenhum ponteiro fino: mouse ou caneta) e o lado menor da tela tem menos de
// LADO_MIN_TELA px, o que pega o celular no "modo computador". Tablet (lado menor de
// 600 px ou mais) e notebook com tela de toque (tem mouse ou touchpad) entram.
//
// `?tela=celular` mostra a tela num computador (para conferir o desenho) e
// `?tela=grande` deixa entrar no celular (para testar o jogo nele).
//
// Puro, sem DOM (testado em tests/tela-grande.test.mjs).

/** Lado menor da tela (px CSS) abaixo do qual um aparelho só de toque é celular. */
export const LADO_MIN_TELA = 600;

/** O que o navegador do celular põe no User-Agent (o iPad e os tablets Android não põem). */
const UA_CELULAR = /iPhone|iPod|Windows Phone|Android.+Mobile|Mobi/i;

/**
 * O aparelho é celular (mostra a tela "Abra numa tela maior")?
 * @param {{ ua?: string, pontoFino?: boolean, larguraTela?: number, alturaTela?: number, busca?: string }} a
 *   `pontoFino`: algum ponteiro fino (`(any-pointer: fine)`); `larguraTela`/`alturaTela`:
 *   `screen.width`/`screen.height`; `busca`: `location.search` (os `?tela=` acima).
 */
export function ehCelular({ ua = '', pontoFino = true, larguraTela = 0, alturaTela = 0, busca = '' } = {}) {
  const forcado = new URLSearchParams(busca).get('tela');
  if (forcado === 'celular') return true;
  if (forcado === 'grande') return false;
  if (UA_CELULAR.test(ua)) return true;
  const menorLado = Math.min(larguraTela, alturaTela);
  return !pontoFino && menorLado > 0 && menorLado < LADO_MIN_TELA;
}

/** O endereço que a tela mostra e copia: o do site, sem o `?tela=`. */
export function linkDoJogo(origem) {
  return `${origem}/`;
}
