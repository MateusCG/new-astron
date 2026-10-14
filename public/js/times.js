// Janela dos times (#times, tecla P ou o botão TIMES do HUD): as três vagas de cada
// time, com quem está em cada uma (nick, nível, abates e mortes; os computadores
// com o selo IA), e o computador para jogar com você ou contra você.
//
// Vaga livre mostra "+ Computador": o pedido {t:'ia', acao:'adicionar', lado} vai
// para o servidor, que decide (pode recusar com 'cheio' se outro jogador ocupou a
// vaga antes). Computador tem o "×" para tirar ({t:'ia', acao:'remover', id}). O
// servidor manda a lista no snapshot (`jogadores`); aqui só se desenha e se pede.
// Como as outras janelas, o jogo não pausa, mas não sai tiro com ela aberta.

// Vagas por time: o mesmo MAX_POR_TIME de server/partida.js (quem manda é o servidor).
const MAX_POR_TIME = 3;

const MENSAGEM = {
  cheio: 'Esse time já tem 3 jogadores',
  invalido: 'Não deu para mexer nesse computador',
};

const esc = (t) => String(t).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export class PainelTimes {
  /**
   * @param {{ meuId: number, meuTime: number, enviar: (m: object) => void,
   *   noticia: (texto: string, tipo?: string) => void, signal: AbortSignal }} opcoes
   */
  constructor({ meuId, meuTime, enviar, noticia, signal }) {
    this.meuId = meuId;
    this.meuTime = meuTime;
    this.enviar = enviar;
    this.noticia = noticia;
    this.el = document.querySelector('#times');
    this.colunas = { meu: this.el.querySelector('.meu ul'), inimigo: this.el.querySelector('.inimigo ul') };
    this.jogadores = [];
    this.chave = '';
    this.el.addEventListener(
      'click',
      (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        if (b.classList.contains('fechar')) this.fechar();
        else if (b.dataset.lado) this.enviar({ t: 'ia', acao: 'adicionar', lado: b.dataset.lado });
        else if (b.dataset.tirar) this.enviar({ t: 'ia', acao: 'remover', id: Number(b.dataset.tirar) });
        b.blur(); // o foco no botão não pode prender as teclas do jogo
      },
      { signal },
    );
    // Clique no fundo escurecido (fora da janela) fecha.
    this.el.addEventListener('pointerdown', (e) => e.target === this.el && this.fechar(), { signal });
    document.querySelector('#times-hud')?.addEventListener('click', (e) => {
      this.alternar();
      e.currentTarget.blur();
    }, { signal });
    addEventListener(
      'keydown',
      (e) => {
        if (e.code !== 'KeyP' || e.repeat || e.target instanceof HTMLInputElement) return;
        this.alternar();
      },
      { signal },
    );
  }

  get aberto() {
    return !this.el.hidden;
  }

  abrir() {
    this.el.hidden = false;
    this.#desenhar(true);
  }

  fechar() {
    if (this.el.contains(document.activeElement)) document.activeElement.blur();
    this.el.hidden = true;
  }

  alternar() {
    if (this.aberto) this.fechar();
    else this.abrir();
  }

  /** Lista do snapshot: [{id, nome, time, nivel, ia?, abates, mortes, vivo}]. */
  atualizar(jogadores) {
    if (!Array.isArray(jogadores)) return;
    this.jogadores = jogadores;
    if (this.aberto) this.#desenhar();
  }

  /** Resposta do servidor a um pedido {t:'ia'}. */
  resultado(m) {
    if (m.ok) this.noticia(m.item === 'adicionar' ? 'Computador entrou na partida' : 'Computador saiu da partida', 'bom');
    else this.noticia(MENSAGEM[m.codigo] ?? 'Pedido recusado', 'ruim');
  }

  #desenhar(forcar = false) {
    const chave = JSON.stringify(this.jogadores);
    if (!forcar && chave === this.chave) return; // nada mudou: não mexe no DOM
    this.chave = chave;
    for (const lado of ['meu', 'inimigo']) {
      const time = lado === 'meu' ? this.meuTime : 1 - this.meuTime;
      // Você primeiro, depois as pessoas, depois os computadores.
      const lista = this.jogadores
        .filter((j) => j.time === time)
        .sort((a, b) => (b.id === this.meuId) - (a.id === this.meuId) || !!a.ia - !!b.ia || a.id - b.id);
      const linhas = lista.map((j) => this.#linha(j));
      for (let k = lista.length; k < MAX_POR_TIME; k++) {
        linhas.push(
          `<li class="vaga"><button type="button" data-lado="${lado}" title="Pôr um computador ${lado === 'meu' ? 'no seu time' : 'no time inimigo'}">+ Computador</button></li>`,
        );
      }
      this.colunas[lado].innerHTML = linhas.join('');
      this.el.querySelector(`.${lado} .conta`).textContent = `${lista.length}/${MAX_POR_TIME}`;
    }
  }

  #linha(j) {
    const voce = j.id === this.meuId;
    const nome = j.ia ? j.nome.replace(/ \(IA\)$/, '') : j.nome;
    const selo = j.ia ? '<span class="selo-ia">IA</span>' : voce ? '<span class="selo-voce">VOCÊ</span>' : '';
    const tirar = j.ia ? `<button type="button" class="tirar" data-tirar="${j.id}" title="Tirar ${esc(j.nome)}" aria-label="Tirar ${esc(j.nome)}">✕</button>` : '';
    return `<li class="${voce ? 'voce' : ''}${j.vivo ? '' : ' morto'}">
      <span class="nome">${esc(nome)}</span>${selo}
      <span class="nv">NV ${j.nivel}</span>
      <span class="km" title="Abates / mortes">${j.abates}/${j.mortes}</span>
      ${tirar}
    </li>`;
  }
}
