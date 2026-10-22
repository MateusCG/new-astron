// Placar da partida (canto superior direito) e tela de fim de partida.
//
// Tudo vem do snapshot (`partida` e `bonus`, ver o topo de server/index.js): o
// cliente não conta tempo nem minério, só mostra. O seu time fica sempre à
// esquerda, em turquesa; o outro à direita, em vermelho. Embaixo de cada número,
// o bônus de time que ele tem agora (o da Medusa Anciã: ícone âmbar, a cor dos
// objetivos, que é de onde os bônus vêm) com a contagem regressiva. Na fase final (últimos 3
// minutos, `partida.fase === 'final'`) aparece a faixa "MINÉRIO ×2" embaixo de tudo.
// Na preparação (os 3 minutos antes dos 20, `partida.estado === 'preparacao'`), o
// relógio conta o que falta para a partida começar (`inicioEm`) e a faixa diz
// "PREPARAÇÃO".

import { ICONE_OBJETIVO } from './objetivos.js';

const $ = (s) => document.querySelector(s);

/**
 * Bônus de TIME (o `bonus` do snapshot) com o ícone e o que faz, para o title. Hoje
 * só a Medusa dá bônus ao time inteiro (server/bonus.js); os de nave (ataque,
 * suporte, sonda) ficam no HUD de quem os tem (hud.bonusNave).
 */
const ICONE_BONUS = {
  medusa: { nome: 'Medusa Anciã: naves do time com +15% de dano e +15% de velocidade', svg: ICONE_OBJETIVO.medusa },
};

/** "mm:ss" de um número de segundos. */
export function relogio(segundos) {
  const s = Math.max(0, Math.ceil(segundos));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export class Placar {
  /** @param {{ meuTime?: number }} [opcoes] */
  constructor({ meuTime = 0 } = {}) {
    this.meuTime = meuTime;
    this.outroTime = 1 - meuTime;
    this.el = $('#placar');
    this.meu = this.el.querySelector('.time.meu');
    this.outro = this.el.querySelector('.time.outro');
    this.tempo = this.el.querySelector('.relogio');
    this.faixaFinal = this.el.querySelector('.fase-final');
    this.faixaPrep = this.el.querySelector('.preparacao');
    this.fim = $('#fim-partida');
    this.ultimo = '';
    this.el.hidden = false;
  }

  /** Atualiza com o `partida` e o `bonus` do snapshot. */
  atualizar(partida, bonus = {}) {
    if (!partida) return;
    const chave = JSON.stringify([partida, bonus]);
    if (chave === this.ultimo) return; // nada mudou: não mexe no DOM
    this.ultimo = chave;
    this.meu.querySelector('b').textContent = partida.placar[this.meuTime];
    this.outro.querySelector('b').textContent = partida.placar[this.outroTime];
    // Modo de teste: a partida não tem relógio.
    if (partida.semTempo) this.tempo.textContent = 'TESTE';
    else if (partida.estado === 'preparacao') this.tempo.textContent = relogio(partida.inicioEm);
    else this.tempo.textContent = partida.estado === 'andamento' ? relogio(partida.restante) : partida.estado === 'fim' ? 'FIM' : '--:--';
    this.tempo.classList.toggle('acabando', !partida.semTempo && partida.estado === 'andamento' && partida.restante <= 60);
    this.faixaFinal.hidden = partida.fase !== 'final';
    this.faixaPrep.hidden = partida.estado !== 'preparacao';
    this.#bonus(this.meu.querySelector('.bonus'), bonus[this.meuTime]);
    this.#bonus(this.outro.querySelector('.bonus'), bonus[this.outroTime]);
    this.#telaFim(partida);
  }

  #bonus(ul, ativos = {}) {
    const html = Object.entries(ativos)
      .filter(([nome]) => ICONE_BONUS[nome])
      .map(
        ([nome, s]) =>
          `<li title="${ICONE_BONUS[nome].nome}"><svg class="icone-bonus" viewBox="0 0 24 24" aria-hidden="true">${ICONE_BONUS[nome].svg}</svg>${Math.ceil(s)}s</li>`,
      )
      .join('');
    if (ul.innerHTML !== html) ul.innerHTML = html;
  }

  #telaFim(partida) {
    const mostrar = partida.estado === 'fim';
    this.fim.hidden = !mostrar;
    if (!mostrar) return;
    const v = partida.vencedor;
    const titulo = v === -1 ? 'EMPATE' : v === this.meuTime ? 'VITÓRIA' : 'DERROTA';
    const frase = v === -1 ? 'Os dois times mineraram igual' : v === this.meuTime ? 'Seu time minerou mais' : 'O outro time minerou mais';
    this.fim.className = v === -1 ? 'empate' : v === this.meuTime ? 'vitoria' : 'derrota';
    this.fim.querySelector('h2').textContent = titulo;
    this.fim.querySelector('.frase').textContent = frase;
    this.fim.querySelector('.meu').textContent = partida.placar[this.meuTime];
    this.fim.querySelector('.outro').textContent = partida.placar[this.outroTime];
    this.fim.querySelector('.nova').textContent = `Nova partida em ${partida.novaEm}s`;
  }

  /** Pisca o número do time que acabou de receber minério. */
  entrega(time) {
    const el = (time === this.meuTime ? this.meu : this.outro).querySelector('b');
    el.classList.remove('pulsa');
    void el.offsetWidth;
    el.classList.add('pulsa');
  }

  /** Começou a fase final: a faixa "MINÉRIO ×2" pisca para chamar atenção. */
  faseFinal() {
    this.faixaFinal.hidden = false;
    this.faixaFinal.classList.remove('anuncia');
    void this.faixaFinal.offsetWidth;
    this.faixaFinal.classList.add('anuncia');
  }

  /** Esconde tudo (saída da partida). */
  limpar() {
    this.el.hidden = true;
    this.fim.hidden = true;
    this.ultimo = '';
  }
}
