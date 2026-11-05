// Comandos da partida (#comandos): uma janela maior, por cima das Opções, com todas
// as teclas, os botões do mouse e os botões do controle que o piloto tem guardados
// agora (pedido do Mateus, 05/nov/2026). Só para ver: trocar continua sendo na aba
// Configurações do menu, fora da partida. Abre pelo "Ver comandos" das Opções ou
// pela ação `comandos` (J); fecha no ✕, no J de novo, no ESC (main.js) ou clicando
// fora, e as Opções de baixo continuam abertas.
//
// O desenho é outro que o da aba Configurações (lá uma lista por aparelho, com as
// casas de trocar): aqui os grupos viram cartões em colunas e cada ação mostra o
// teclado e o controle lado a lado, com as teclas em relevo, o mouse com o ícone dele
// e os botões do controle nas cores do DualShock. A coluna do aparelho em uso acende
// (html[data-aparelho], atalhos.js). O conteúdo sai de `linhasDosComandos`
// (atalhos-regras.js, puro e testado) sobre o mapa em uso, montado a cada abertura.
//
// O jogo não pausa: a nave segue voando por baixo, sem tiro enquanto a janela está
// aberta. No controle é uma janela de mexer (joystick.js): os cartões têm tabindex
// para o foco descer por eles e a lista rolar junto.

import { linhasDosComandos } from './atalhos-regras.js';

const escapar = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const ICONE_MOUSE =
  '<svg class="icone-mouse" viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="3" width="11" height="18" rx="5.5" /><path d="M12 3v6.5M6.5 9.5h11" /></svg>';

/** Uma tecla (ou botão do mouse) em relevo. */
function tecla(t) {
  const classe = t.mouse ? 'tecla mouse' : t.fixa ? 'tecla fixa' : 'tecla';
  return `<kbd class="${classe}" title="${escapar(t.titulo)}">${t.mouse ? ICONE_MOUSE : ''}${escapar(t.texto)}</kbd>`;
}

/** Um botão do controle, com a entrada para a cor do DualShock. */
function botao(b) {
  return `<kbd class="botao-joy" data-entrada="${escapar(b.entrada)}" title="${escapar(b.titulo)}">${escapar(b.texto)}</kbd>`;
}

const NADA = '<span class="sem" aria-label="Sem atalho">—</span>';

/** O HTML dos cartões de grupo (exportado para os testes). */
export function htmlDosComandos(mapas) {
  return linhasDosComandos(mapas)
    .map(
      (g) =>
        `<section class="grupo-comandos" tabindex="0" aria-label="${escapar(g.nome)}"><h3>${escapar(g.nome)}</h3><ul>${g.acoes
          .map(
            (a) =>
              `<li data-acao="${a.id}"><span class="acao">${escapar(a.nome)}</span><span class="col-teclado">${a.teclado.map(tecla).join('') || NADA}</span><span class="col-controle">${a.controle.map(botao).join('') || NADA}</span></li>`,
          )
          .join('')}</ul></section>`,
    )
    .join('');
}

export class PainelComandos {
  /**
   * @param {{ el: HTMLElement, mapas: () => {teclado: object, controle: object},
   *   controles?: () => {id: string}[], som?: (nome: string) => void }} opcoes
   *   `mapas` é o mapa em uso (mapasAtuais de atalhos.js); `controles`, os ligados.
   */
  constructor({ el, mapas, controles = () => [], som = () => {} }) {
    this.el = el;
    this.mapas = mapas;
    this.controles = controles;
    this.som = som;
    el.querySelector('.fechar').addEventListener('click', () => this.fechar());
    // Clique no fundo escurecido (fora da caixa) fecha; as Opções de baixo ficam.
    el.addEventListener('pointerdown', (e) => {
      if (e.target === el) this.fechar();
    });
  }

  /** A janela está na tela? (enquanto estiver, o Z e o X não disparam) */
  get aberto() {
    return !this.el.hidden;
  }

  /** Monta a lista com o mapa guardado de agora. */
  desenhar() {
    this.el.querySelector('.lista-comandos').innerHTML = htmlDosComandos(this.mapas());
    const pads = this.controles();
    const linha = this.el.querySelector('.controle-ligado');
    // O id do Chrome termina em "(STANDARD GAMEPAD Vendor: ... Product: ...)": sai.
    const nome = pads[0]?.id.replace(/\s*\([^()]*(?:Vendor|STANDARD GAMEPAD)[^()]*\)\s*$/i, '').trim();
    if (linha) linha.textContent = pads.length ? `Controle ligado: ${nome || 'controle'}` : 'Nenhum controle ligado';
  }

  abrir() {
    if (this.aberto) return;
    this.desenhar();
    this.el.hidden = false;
    this.el.querySelector('.lista-comandos').scrollTop = 0;
    this.som('painel');
  }

  fechar() {
    if (!this.aberto) return;
    this.el.hidden = true;
    // O foco num cartão da janela prenderia o Espaço e o Enter do jogo.
    if (this.el.contains(document.activeElement)) document.activeElement.blur();
  }

  alternar() {
    if (this.aberto) this.fechar();
    else this.abrir();
  }
}
