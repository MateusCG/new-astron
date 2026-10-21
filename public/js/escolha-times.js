// Escolha dos times na tela inicial (#escolha-times, acima dos COMANDOS): quantos
// computadores jogam no seu time (0 a 2, porque você ocupa uma das 3 vagas) e no
// time inimigo (0 a 3), ANTES de decolar. Dentro da partida não se mexe mais nisso
// (a janela Times, tecla P, é só consulta).
//
// Cada time mostra as três vagas (a sua com "VOCÊ", as dos computadores com "IA",
// as livres tracejadas) e o −/+ ao lado. Clicar numa vaga leva a conta até ela
// (clicar de novo na última acesa a apaga). A escolha fica no navegador (try/catch:
// sem armazenamento, entra com 0 e 0) e vai no pedido de entrada como iaMeu e
// iaInimigo. Quem decide é o servidor: os números são o mínimo de vagas ocupadas, e
// com a partida já rodando ele só completa o que falta com computadores, contando a
// gente que já está lá (server/game.js, addPlayer).

// Vagas por time: o mesmo MAX_POR_TIME de server/partida.js (quem manda é o servidor).
const MAX_POR_TIME = 3;
const MAXIMO = { meu: MAX_POR_TIME - 1, inimigo: MAX_POR_TIME };
const CHAVE = { meu: 'astron.iaMeu', inimigo: 'astron.iaInimigo' };

const ler = (k) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const gravar = (k, v) => {
  try {
    localStorage.setItem(k, v);
  } catch {}
};

/** Inteiro de 0 a max (o que não é número vira 0). */
const limitar = (v, max) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.max(0, Math.min(max, n)) : 0;
};

const plural = (n) => (n === 1 ? '1 computador' : `${n} computadores`);

export class EscolhaTimes {
  /** @param {HTMLElement} el o #escolha-times */
  constructor(el) {
    this.el = el;
    this.qtd = { meu: limitar(ler(CHAVE.meu), MAXIMO.meu), inimigo: limitar(ler(CHAVE.inimigo), MAXIMO.inimigo) };
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      const lado = b?.closest('[data-lado]')?.dataset.lado;
      if (!lado) return;
      if (b.dataset.delta) this.definir(lado, this.qtd[lado] + Number(b.dataset.delta));
      else if (b.dataset.vaga) {
        const k = Number(b.dataset.vaga);
        this.definir(lado, this.qtd[lado] === k ? k - 1 : k);
      }
    });
    this.#desenhar();
  }

  /** O que vai no {t:'entrar'}. */
  get pedido() {
    return { iaMeu: this.qtd.meu, iaInimigo: this.qtd.inimigo };
  }

  definir(lado, n) {
    this.qtd[lado] = limitar(n, MAXIMO[lado]);
    gravar(CHAVE[lado], String(this.qtd[lado]));
    this.#desenhar();
  }

  #desenhar() {
    for (const lado of ['meu', 'inimigo']) {
      const caixa = this.el.querySelector(`[data-lado="${lado}"]`);
      const n = this.qtd[lado];
      const nomeTime = lado === 'meu' ? 'no seu time' : 'no time inimigo';
      // A sua vaga é fixa; as outras são dos computadores, da esquerda para a direita.
      const vagas = [];
      if (lado === 'meu') vagas.push('<span class="vaga voce" title="Esta vaga é sua">Você</span>');
      for (let k = 1; k <= MAXIMO[lado]; k++) {
        const acesa = k <= n;
        vagas.push(
          `<button type="button" class="vaga${acesa ? ' ia' : ''}" data-vaga="${k}" aria-pressed="${acesa}" title="${
            acesa && k === n ? `Tirar o ${k}º computador` : `${plural(k)} ${nomeTime}`
          }">${acesa ? 'IA' : 'livre'}</button>`,
        );
      }
      caixa.querySelector('.vagas').innerHTML = vagas.join('');
      caixa.querySelector('.qtd').textContent = n;
      caixa.querySelector('[data-delta="-1"]').disabled = n <= 0;
      caixa.querySelector('[data-delta="1"]').disabled = n >= MAXIMO[lado];
      caixa.querySelector('.resumo').textContent =
        lado === 'meu' ? (n ? `Você + ${plural(n)}` : 'Só você') : n ? plural(n) : 'Nenhum computador';
    }
  }
}
