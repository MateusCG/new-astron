// Placar da partida (canto superior direito) e tela de fim de partida.
//
// Tudo vem do snapshot (`partida` e `bonus`, ver o topo de server/index.js): o
// cliente não conta tempo nem minério, só mostra. O seu time fica sempre à
// esquerda, em turquesa; o outro à direita, em vermelho. Embaixo de cada número,
// os bônus por tempo que o time tem agora (ícone âmbar, a cor dos objetivos, que
// é de onde os bônus vêm) com a contagem regressiva. Na fase final (últimos 3
// minutos, `partida.fase === 'final'`) aparece a faixa "MINÉRIO ×2" embaixo de tudo.

const $ = (s) => document.querySelector(s);

/** Ícones dos bônus (SVG de traço, como os das armas) e o nome para o title. */
const ICONE_BONUS = {
  // Cristal com "+": mais minério por viagem.
  mineracao: {
    nome: 'Mineração: +1 de minério por viagem',
    svg: '<path d="M12 3 L18 10 L12 21 L6 10 Z"/><path d="M6 10 H18"/>',
  },
  // Duas setas: mineradores mais rápidos.
  velocidade: {
    nome: 'Velocidade: mineradores mais rápidos',
    svg: '<path d="M5 6 L11 12 L5 18"/><path d="M13 6 L19 12 L13 18"/>',
  },
  // Escudo: mineradores mais duráveis.
  durabilidade: {
    nome: 'Durabilidade: mineradores com mais vida',
    svg: '<path d="M12 3 L19 6 V12 C19 16 16 19 12 21 C8 19 5 16 5 12 V6 Z"/>',
  },
  // Raio: naves do time batem mais forte.
  furia: {
    nome: 'Fúria: naves do time com +20% de dano',
    svg: '<path d="M13 3 L6 13 H11 L10 21 L18 10 H13 Z"/>',
  },
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
    this.tempo.textContent = partida.estado === 'andamento' ? relogio(partida.restante) : partida.estado === 'fim' ? 'FIM' : '--:--';
    this.tempo.classList.toggle('acabando', partida.estado === 'andamento' && partida.restante <= 60);
    this.faixaFinal.hidden = partida.fase !== 'final';
    this.#bonus(this.meu.querySelector('.bonus'), bonus[this.meuTime]);
    this.#bonus(this.outro.querySelector('.bonus'), bonus[this.outroTime]);
    this.#telaFim(partida);
  }

  #bonus(ul, ativos = {}) {
    const html = Object.entries(ativos)
      .filter(([nome]) => ICONE_BONUS[nome])
      .map(
        ([nome, s]) =>
          `<li title="${ICONE_BONUS[nome].nome}"><svg class="icone-bonus" viewBox="0 0 24 24" aria-hidden="true">${ICONE_BONUS[nome].svg}</svg>${s}s</li>`,
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
