// Janela "Sua opinião" (#opiniao; regras e limites em shared/opiniao.js): um resumo
// curto (até OPINIAO_MAX caracteres, com o contador), o chip do assunto (Opinião,
// Sugestão ou Problema) e a nota de 1 a 5 estrelas, opcional (clicar na mesma estrela
// tira a nota). Abre por dois caminhos, como nos jogos online em acesso antecipado:
// o botão "Opinião" do topo do menu, sempre à vista, e as estrelas do "Como foi a
// partida?" da tela de resultado (resultado.js), que já chegam com a nota marcada.
//
// O envio é um POST /api/opiniao (server/opinioes.js grava no banco). Junto vai o
// contexto, sem pedir nada ao jogador: o nome do chip, a nave, o idioma e, da tela de
// resultado, o modo e se ganhou ou perdeu. Deu certo, a janela agradece e fecha
// sozinha; deu errado, a mensagem fica na janela e o texto continua lá para tentar de
// novo. Fecha no ✕, no Cancelar, no ESC (main.js) ou clicando fora; Ctrl+Enter envia.
// Enquanto aberta, na partida, o Z e o X não disparam, e as teclas do jogo não valem
// dentro da caixa de texto (campoDeTexto em atalhos.js).

import { OPINIAO_MAX, OPINIAO_MIN, NOTA_MAX, CATEGORIAS_OPINIAO, tamanhoTexto } from '../../shared/opiniao.js';
import { tr, idioma } from '../../shared/idioma.js';
import { SONS_INTERFACE } from './sons.js';

/** O nome de cada nota, embaixo das estrelas. */
export const NOMES_NOTA = [null, 'Muito ruim', 'Ruim', 'Regular', 'Bom', 'Ótimo'];

/** O que a caixa de texto sugere em cada assunto. */
const DICA_CATEGORIA = {
  opiniao: 'O que você achou do jogo? O que mais gostou e o que menos gostou?',
  sugestao: 'O que você gostaria de ver no New Astron?',
  problema: 'O que aconteceu? Onde você estava e o que estava fazendo?',
};

/** A resposta do servidor (o `codigo`) em texto para o jogador. */
const MENSAGEM = {
  texto_curto: 'Escreva pelo menos {n} caracteres.',
  texto_longo: 'O texto passou de {n} caracteres.',
  nota_invalida: 'A nota vai de 1 a 5 estrelas.',
  muitas: 'Você já mandou várias opiniões agora. Tente de novo daqui a alguns minutos.',
  indisponivel: 'Não deu para guardar agora. Tente de novo em instantes.',
  rede: 'Sem conexão com o servidor. Confira sua internet e tente de novo.',
};

/** Quanto tempo o "Obrigado" fica antes de a janela fechar sozinha (ms). */
const OBRIGADO_MS = 2200;

/** As estrelas de 1 a NOTA_MAX, em botões (a mesma figura no menu e no resultado). */
export function htmlEstrelas() {
  let h = '';
  for (let n = 1; n <= NOTA_MAX; n++) {
    h += `<button type="button" class="estrela" data-nota="${n}" role="radio" aria-checked="false" aria-label="${tr('{n} de 5 estrelas', { n })}" title="${tr(NOMES_NOTA[n])}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2l2.7 5.5 6 .9-4.35 4.25 1.03 6-5.38-2.83-5.38 2.83 1.03-6L3.3 9.6l6-.9z" /></svg></button>`;
  }
  return h;
}

/** Acende as estrelas até `nota` (0 apaga todas). */
export function pintarEstrelas(caixa, nota) {
  for (const b of caixa.querySelectorAll('.estrela')) {
    const n = Number(b.dataset.nota);
    b.classList.toggle('acesa', n <= nota);
    b.setAttribute('aria-checked', String(n === nota));
  }
}

/** A mensagem de um código de erro do envio. */
export function mensagemOpiniao(codigo) {
  const m = MENSAGEM[codigo] ?? MENSAGEM.indisponivel;
  return tr(m, { n: codigo === 'texto_longo' ? OPINIAO_MAX : OPINIAO_MIN });
}

/** Manda a opinião ao servidor: `{ok: true}` ou `{ok: false, codigo}` (nunca lança). */
export async function enviarOpiniao(corpo, { fetch: buscar = globalThis.fetch, base = '' } = {}) {
  try {
    const r = await buscar(`${base}/api/opiniao`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(corpo),
    });
    const resposta = await r.json().catch(() => ({}));
    if (r.ok && resposta.ok) return { ok: true };
    return { ok: false, codigo: resposta.codigo ?? 'indisponivel' };
  } catch {
    return { ok: false, codigo: 'rede' };
  }
}

export class PainelOpiniao {
  /**
   * @param {{ el?: HTMLElement, sons?: import('./sons.js').Sons,
   *   contexto?: () => object }} opcoes
   *   `contexto` dá o que vai junto sem o jogador digitar (nome, raca, classe).
   */
  constructor({ el = document.querySelector('#opiniao'), sons = null, contexto = () => ({}) } = {}) {
    this.el = el;
    this.sons = sons;
    this.contexto = contexto;
    this.form = el.querySelector('form');
    this.texto = el.querySelector('textarea');
    this.contador = el.querySelector('.contador');
    this.erro = el.querySelector('.erro');
    this.botaoEnviar = el.querySelector('.enviar');
    this.estrelas = el.querySelector('.estrelas');
    this.nomeNota = el.querySelector('.nome-nota');
    this.obrigado = el.querySelector('.obrigado');
    this.texto.maxLength = OPINIAO_MAX;
    this.estrelas.innerHTML = htmlEstrelas();
    this.nota = 0;
    this.categoria = CATEGORIAS_OPINIAO[0];
    this.extra = {}; // o contexto de quem abriu (origem, modo, resultado)
    this.aoEnviar = null;
    this.enviando = false;
    this.timer = null;

    for (const b of el.querySelectorAll('[data-categoria]')) {
      b.addEventListener('click', () => {
        this.#categoria(b.dataset.categoria);
        this.#som(SONS_INTERFACE.clique, 0.5);
      });
    }
    this.estrelas.addEventListener('click', (e) => {
      const b = e.target.closest('.estrela');
      if (!b) return;
      const n = Number(b.dataset.nota);
      this.#nota(n === this.nota ? 0 : n); // a mesma estrela de novo tira a nota
      this.#som(SONS_INTERFACE.clique, 0.5);
    });
    this.texto.addEventListener('input', () => {
      this.erro.hidden = true; // mexeu no texto: o aviso de antes já não vale
      this.#contar();
    });
    this.texto.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        this.#enviar();
      }
    });
    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.#enviar();
    });
    el.querySelector('.cancelar').addEventListener('click', () => this.fechar());
    el.querySelector('.fechar').addEventListener('click', () => this.fechar());
    el.addEventListener('pointerdown', (e) => {
      if (e.target === el) this.fechar();
    });
  }

  /** A janela está na tela? (na partida, enquanto estiver, o Z e o X não disparam) */
  get aberto() {
    return !this.el.hidden;
  }

  /**
   * Abre o formulário. `nota` já marcada (as estrelas do resultado), `origem` ('menu'
   * ou 'resultado'), `extra` (modo, resultado) e `aoEnviar` (chamado quando gravou).
   * Reabrir sem ter enviado guarda o texto de antes.
   */
  abrir({ nota = null, origem = 'menu', extra = {}, aoEnviar = null } = {}) {
    clearTimeout(this.timer);
    this.sons?.desbloquear?.();
    this.extra = { origem, ...extra };
    this.aoEnviar = aoEnviar;
    if (nota != null) this.#nota(nota);
    this.form.hidden = false;
    this.obrigado.hidden = true;
    this.erro.hidden = true;
    this.#contar();
    this.#categoria(this.categoria);
    this.el.hidden = false;
    this.#som(SONS_INTERFACE.painel, 0.6);
    // O cursor já na caixa de texto: abriu para escrever.
    requestAnimationFrame(() => this.texto.focus({ preventScroll: true }));
  }

  fechar() {
    clearTimeout(this.timer);
    if (this.el.contains(document.activeElement)) document.activeElement.blur();
    this.el.hidden = true;
  }

  alternar() {
    if (this.aberto) this.fechar();
    else this.abrir();
  }

  #categoria(c) {
    this.categoria = CATEGORIAS_OPINIAO.includes(c) ? c : CATEGORIAS_OPINIAO[0];
    for (const b of this.el.querySelectorAll('[data-categoria]')) {
      const sel = b.dataset.categoria === this.categoria;
      b.classList.toggle('sel', sel);
      b.setAttribute('aria-pressed', String(sel));
    }
    this.texto.placeholder = tr(DICA_CATEGORIA[this.categoria]);
  }

  #nota(n) {
    this.nota = n;
    pintarEstrelas(this.estrelas, n);
    this.nomeNota.textContent = n ? tr(NOMES_NOTA[n]) : tr('Sem nota');
    this.nomeNota.classList.toggle('vazia', !n);
  }

  #contar() {
    const n = tamanhoTexto(this.texto.value);
    this.contador.textContent = `${n}/${OPINIAO_MAX}`;
    this.contador.classList.toggle('perto', n > OPINIAO_MAX * 0.9);
    this.botaoEnviar.disabled = this.enviando || n < OPINIAO_MIN;
  }

  async #enviar() {
    if (this.enviando) return;
    if (tamanhoTexto(this.texto.value) < OPINIAO_MIN) {
      this.#mostrarErro('texto_curto');
      return;
    }
    this.enviando = true;
    this.botaoEnviar.disabled = true;
    this.botaoEnviar.textContent = tr('Enviando…');
    const corpo = {
      ...this.contexto(),
      ...this.extra,
      idioma: idioma(),
      texto: this.texto.value,
      nota: this.nota || null,
      categoria: this.categoria,
    };
    const r = await enviarOpiniao(corpo);
    this.enviando = false;
    this.botaoEnviar.textContent = tr('Enviar');
    if (!r.ok) {
      this.#contar();
      this.#mostrarErro(r.codigo);
      this.#som(SONS_INTERFACE.erro, 0.6);
      return;
    }
    const nota = this.nota;
    // Gravou: limpa para a próxima e agradece.
    this.texto.value = '';
    this.#nota(0);
    this.#contar();
    this.form.hidden = true;
    this.obrigado.hidden = false;
    this.#som(SONS_INTERFACE.compra, 0.6);
    this.aoEnviar?.({ nota });
    this.timer = setTimeout(() => this.fechar(), OBRIGADO_MS);
  }

  #mostrarErro(codigo) {
    this.erro.textContent = mensagemOpiniao(codigo);
    this.erro.hidden = false;
  }

  #som(nome, volume) {
    if (nome) this.sons?.tocarInterface?.(nome, { volume });
  }
}
