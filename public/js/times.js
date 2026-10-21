// Janela dos times (#times, tecla P ou o botão TIMES do HUD), só de CONSULTA: as
// três vagas de cada time, com quem está em cada uma (nick, nível, abates e mortes,
// vivo ou abatido; os computadores com o selo IA) e as vagas livres.
//
// Quantos computadores jogam com você e contra você se escolhe ANTES de decolar, na
// tela inicial (escolha-times.js, campos iaMeu e iaInimigo do {t:'entrar'}); dentro
// da partida não se põe nem se tira computador (o servidor recusa o {t:'ia'}). O
// servidor manda a lista no snapshot (`jogadores`); aqui só se desenha. Como as
// outras janelas, o jogo não pausa, mas não sai tiro com ela aberta.

// Vagas por time: o mesmo MAX_POR_TIME de server/partida.js (quem manda é o servidor).
const MAX_POR_TIME = 3;

const esc = (t) => String(t).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export class PainelTimes {
  /** @param {{ meuId: number, meuTime: number, signal: AbortSignal }} opcoes */
  constructor({ meuId, meuTime, signal }) {
    this.meuId = meuId;
    this.meuTime = meuTime;
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
      for (let k = lista.length; k < MAX_POR_TIME; k++) linhas.push('<li class="vaga">Vaga livre</li>');
      this.colunas[lado].innerHTML = linhas.join('');
      this.el.querySelector(`.${lado} .conta`).textContent = `${lista.length}/${MAX_POR_TIME}`;
    }
  }

  #linha(j) {
    const voce = j.id === this.meuId;
    const nome = j.ia ? j.nome.replace(/ \(IA\)$/, '') : j.nome;
    const selo = j.ia ? '<span class="selo-ia">IA</span>' : voce ? '<span class="selo-voce">VOCÊ</span>' : '';
    return `<li class="${voce ? 'voce' : ''}${j.vivo ? '' : ' morto'}">
      <span class="nome">${esc(nome)}</span>${selo}
      <span class="nv">NV ${j.nivel}</span>
      <span class="km" title="Abates / mortes">${j.abates}/${j.mortes}</span>
    </li>`;
  }
}
