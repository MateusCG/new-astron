// Tela de resultado (#resultado), no fim da partida (pedido do Mateus, 04/nov/2026):
// por cima do jogo, com o fundo escurecido, a VITÓRIA, DERROTA ou EMPATE grande, o
// minério dos dois times, o destaque da partida (o MVP: o melhor KDA dos dois times,
// melhorDaPartida em tabela-regras.js) e, embaixo, a mesma tabela do TAB (ConteudoTabela
// de tabela.js), com a linha do destaque em ouro. Os números ficam congelados no
// instante em que a partida acabou.
//
// Embaixo, a contagem para voltar ao menu: o `novaEm` do snapshot (o servidor espera
// INTERVALO_FIM_S, 30 s, antes da partida nova; server/partida.js), com a barra
// esvaziando. No fim dela, ou no botão "Voltar ao menu agora" (Enter ou Esc), a
// partida é desmontada e o menu abre na aba Jogar (`aoSair`). Se a partida nova
// começar antes (o relógio do cliente atrasado), sai do mesmo jeito.
//
// Só abre para quem viu a partida rolando: quem entra no servidor durante a tela de
// fim de uma partida que não jogou só espera a próxima. O modo de teste não acaba.

import { kda, melhorDaPartida, textoRazaoKda } from './tabela-regras.js';
import { ConteudoTabela, miniaturaDoPiloto } from './tabela.js';
import { SONS_INTERFACE } from './sons.js';

const esc = (t) => String(t).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const TITULO = { vitoria: 'Vitória', derrota: 'Derrota', empate: 'Empate' };
const FRASE = {
  vitoria: 'Seu time minerou mais He-3',
  derrota: 'O time inimigo minerou mais He-3',
  empate: 'Os dois times mineraram igual',
};

export class TelaResultado {
  /**
   * @param {{ meuId: number, meuTime: number, signal: AbortSignal, aoSair: () => void,
   *   som?: (nome: string) => void }} opcoes
   */
  constructor({ meuId, meuTime, signal, aoSair, som = () => {} }) {
    this.el = document.querySelector('#resultado');
    this.meuId = meuId;
    this.meuTime = meuTime;
    this.aoSair = aoSair;
    this.som = som;
    this.tabela = new ConteudoTabela(this.el.querySelector('#resultado-tabela'), { meuId, meuTime });
    this.viuPartida = false; // esteve na partida rolando (preparação ou andamento)
    this.total = 0; // segundos da contagem quando a tela abriu (a barra cheia)
    this.saiu = false;
    this.el.querySelector('.sair').addEventListener('click', () => this.#sair(), { signal });
    addEventListener(
      'keydown',
      (e) => {
        if (!this.aberto || (e.code !== 'Enter' && e.code !== 'NumpadEnter')) return;
        e.preventDefault();
        this.#sair();
      },
      { signal },
    );
  }

  /** A tela está aberta? (enquanto estiver, o Z e o X não disparam) */
  get aberto() {
    return !this.el.hidden;
  }

  /** Snapshot: o `partida` e a lista pública `jogadores`. */
  atualizar(partida, jogadores) {
    if (!partida || partida.semTempo) return;
    if (partida.estado === 'preparacao' || partida.estado === 'andamento') {
      if (this.aberto) this.#sair(); // a partida nova começou com a tela aberta
      else this.viuPartida = true;
      return;
    }
    if (partida.estado !== 'fim' || !this.viuPartida) return;
    if (!this.aberto) this.#abrir(partida, jogadores);
    this.#contar(partida.novaEm ?? 0);
    if ((partida.novaEm ?? 0) <= 0) this.#sair();
  }

  /** Esconde (saída da partida). */
  limpar() {
    this.el.hidden = true;
  }

  #abrir(partida, jogadores) {
    const v = partida.vencedor;
    const tipo = v === -1 ? 'empate' : v === this.meuTime ? 'vitoria' : 'derrota';
    // Congela a lista: daqui até sair, o que vier no snapshot não muda a tela.
    const lista = (jogadores ?? []).map((j) => ({ ...j }));
    const mvp = melhorDaPartida(lista);
    this.total = Math.max(1, partida.novaEm ?? 0);
    this.el.className = tipo;
    this.el.querySelector('h2').textContent = TITULO[tipo];
    this.el.querySelector('.frase').textContent = FRASE[tipo];
    this.el.querySelector('.minerio-meu b').textContent = partida.placar?.[this.meuTime] ?? 0;
    this.el.querySelector('.minerio-outro b').textContent = partida.placar?.[1 - this.meuTime] ?? 0;
    this.#destaque(lista.find((j) => j.id === mvp));
    this.tabela.definir(lista, partida.estat, mvp);
    this.el.hidden = false;
    this.tabela.desenhar(true);
    this.som(tipo === 'vitoria' ? SONS_INTERFACE.nivel : SONS_INTERFACE.painel);
  }

  /** O cartão do destaque da partida (some se ninguém fez nada). */
  #destaque(p) {
    const el = this.el.querySelector('.mvp');
    el.hidden = !p;
    if (!p) return;
    const aliado = p.time === this.meuTime;
    el.classList.toggle('inimigo', !aliado);
    const nome = p.ia ? String(p.nome).replace(/ \(IA\)$/, '') : String(p.nome);
    el.querySelector('.nome-mvp').innerHTML = `${esc(nome)}${p.ia ? ' <span class="selo">IA</span>' : ''}`;
    el.querySelector('.time-mvp').textContent = p.id === this.meuId ? 'Você · seu time' : aliado ? 'Seu time' : 'Time inimigo';
    el.querySelector('.kda-mvp').textContent = kda(p);
    el.querySelector('.razao-mvp').textContent = textoRazaoKda(p);
    el.querySelector('.farm-mvp').textContent = p.farm ?? 0;
    el.querySelector('.nivel-mvp').textContent = p.nivel ?? 1;
    const img = el.querySelector('img');
    img.hidden = true;
    miniaturaDoPiloto(p).then((url) => {
      if (!url) return;
      img.src = url;
      img.hidden = false;
    });
  }

  #contar(s) {
    this.el.querySelector('.segundos').textContent = s;
    this.el.querySelector('.barra i').style.width = `${Math.max(0, Math.min(100, (s / this.total) * 100))}%`;
  }

  #sair() {
    if (this.saiu) return;
    this.saiu = true;
    this.aoSair();
  }
}
