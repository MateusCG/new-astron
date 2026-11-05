// Escolha dos times na tela de Seleção do menu (#escolha-times, embaixo, ao lado do
// Decolar, como as faixas de time da seleção de campeão dos MOBAs): quantos
// computadores jogam no seu time (0 a 2, porque você ocupa uma das 3 vagas) e no
// time inimigo (0 a 3), ANTES de decolar. Dentro da partida não se mexe mais nisso
// (a tabela do TAB é só consulta).
//
// Cada time mostra as três vagas (a sua com a miniatura da nave escolhida e o seu
// nome, `definirVoce`; as dos computadores com "IA", as livres tracejadas) e o −/+. Clicar numa vaga leva a conta até ela
// (clicar de novo na última acesa a apaga). A escolha fica no navegador (try/catch:
// sem armazenamento, entra com 0 e 0) e vai no pedido de entrada como iaMeu e
// iaInimigo. Quem decide é o servidor: os números são o mínimo de vagas ocupadas, e
// com a partida já rodando ele só completa o que falta com computadores, contando a
// gente que já está lá (server/game.js, addPlayer).
//
// Nos modos da fila online (mostrarFila, fila-regras.js) as faixas viram a sala, como
// a seleção de campeão dos MOBAs: sem o −/+ (quem escolhe é a fila), o seu time com a
// nave e o nome de cada companheiro e o ✓ de quem já apertou Pronto, as vagas que a
// fila ainda procura piscando, e o time inimigo às cegas (só o nome e o Pronto; na
// pública, os três computadores). No 3 contra 3 as faixas são o TIME VERDE e o TIME
// VERMELHO, com cor fixa, e enquanto a fila procura as vagas livres do outro time são
// botões: clicar troca de time (aoTrocarTime → {t:'trocarTime'}).

import { vagasDaFila, titulosDosLados } from './fila-regras.js';
import { RACES } from '../../shared/sim.js';
import { CLASSES } from '../../shared/naves.js';

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

const escapar = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const plural = (n) => (n === 1 ? '1 computador' : `${n} computadores`);

export class EscolhaTimes {
  /**
   * @param {HTMLElement} el o #escolha-times
   * @param {{ miniatura?: (race: string, classe: string, tier: number) => Promise<string|null>,
   *   aoTrocarTime?: () => void }} [op]
   *   a miniatura das naves dos companheiros na sala da fila (vitrine.js) e o clique
   *   numa vaga livre do outro time no 3 contra 3
   */
  constructor(el, { miniatura = null, aoTrocarTime = () => {} } = {}) {
    this.el = el;
    this.miniatura = miniatura;
    this.aoTrocarTime = aoTrocarTime;
    this.fila = null; // { modo, estado } nos modos da fila online
    this.imgs = new Map(); // 'raça/classe' -> data URL (as miniaturas da sala)
    this.qtd = { meu: limitar(ler(CHAVE.meu), MAXIMO.meu), inimigo: limitar(ler(CHAVE.inimigo), MAXIMO.inimigo) };
    this.voce = { nome: '', img: null };
    el.addEventListener('click', (e) => {
      if (this.fila) {
        if (e.target.closest('.vaga.trocar')) this.aoTrocarTime();
        return;
      }
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

  /** A sua vaga: o nome do piloto e a miniatura da nave (data URL ou null). */
  definirVoce({ nome = this.voce.nome, img = this.voce.img } = {}) {
    this.voce = { nome, img };
    this.#desenhar();
  }

  /**
   * Modo da fila online: `modo` ('online' | 'publica') e o estado da fila
   * (fila-regras.js); null volta às vagas dos computadores.
   */
  mostrarFila(modo, estado = null) {
    this.fila = modo ? { modo, estado } : null;
    this.el.classList.toggle('na-fila', !!modo);
    // Cores fixas (verde e vermelho) só no 3 contra 3.
    this.el.classList.toggle('cores-fixas', modo === 'online');
    const titulos = titulosDosLados(modo);
    for (const lado of ['meu', 'inimigo']) this.el.querySelector(`[data-lado="${lado}"] .titulo-lado b`).textContent = titulos[lado];
    this.#desenhar();
  }

  definir(lado, n) {
    this.qtd[lado] = limitar(n, MAXIMO[lado]);
    gravar(CHAVE[lado], String(this.qtd[lado]));
    this.#desenhar();
  }

  /** A miniatura da nave (do cache; pede e redesenha quando chega). */
  #img(race, classe) {
    const k = `${race}/${classe}`;
    if (this.imgs.has(k)) return this.imgs.get(k);
    this.imgs.set(k, null);
    this.miniatura?.(race, classe, 0).then((url) => {
      this.imgs.set(k, url ?? null);
      if (url && this.fila) this.#desenhar();
    });
    return null;
  }

  /** As faixas como a sala da fila: companheiros, Pronto e as vagas que faltam. */
  #desenharFila() {
    const { modo, estado } = this.fila;
    const vagas = vagasDaFila(estado, modo);
    const naSala = estado?.fase === 'sala';
    const procurando = estado?.fase === 'procurando' || estado?.fase === 'conectando';
    for (const lado of ['meu', 'inimigo']) {
      const caixa = this.el.querySelector(`[data-lado="${lado}"]`);
      const html = vagas[lado].map((v) => {
        if (v.tipo === 'voce') {
          const { nome, img } = this.voce;
          return `<span class="vaga voce${v.pronto ? ' pronto' : ''}" title="Esta vaga é sua">${img ? `<img src="${img}" alt="" draggable="false">` : ''}<b>${escapar(nome || 'Piloto')}</b><small>${v.pronto ? '✓ Pronto' : 'Você'}</small></span>`;
        }
        if (v.tipo === 'piloto') {
          const img = v.race ? this.#img(v.race, v.classe) : null;
          const nave = v.race ? `${RACES[v.race]?.nome ?? ''} ${CLASSES[v.classe]?.nome ?? ''}` : '';
          return `<span class="vaga piloto${v.pronto ? ' pronto' : ''}" title="${escapar(`${v.nome} · ${nave}`)}">${img ? `<img src="${img}" alt="" draggable="false">` : ''}<b>${escapar(v.nome)}</b><small>${v.pronto ? '✓ Pronto' : naSala ? 'Escolhendo' : 'Na fila'}</small></span>`;
        }
        if (v.tipo === 'oculto') {
          return `<span class="vaga oculto${v.pronto ? ' pronto' : ''}" title="${escapar(v.nome)}: a nave do inimigo só aparece na partida"><b>${escapar(v.nome)}</b><small>${v.pronto ? '✓ Pronto' : naSala ? 'Escolhendo' : 'Na fila'}</small></span>`;
        }
        if (v.tipo === 'ia') return '<span class="vaga ia" title="Computador">IA</span>';
        if (v.tipo === 'trocar') {
          return `<button type="button" class="vaga trocar" title="Passar para o ${lado === 'meu' ? 'time verde' : 'time vermelho'}">Trocar para cá</button>`;
        }
        if (!naSala && !procurando) return '<span class="vaga livre" title="Fora da fila">livre</span>';
        return `<span class="vaga procurando" title="${naSala ? 'Vaga' : 'Procurando piloto'}">${naSala ? '—' : 'Procurando'}</span>`;
      });
      caixa.querySelector('.vagas').innerHTML = html.join('');
      const gente = vagas[lado].filter((v) => !['procurando', 'ia', 'trocar'].includes(v.tipo)).length;
      const seu = vagas[lado].some((v) => v.tipo === 'voce');
      let resumo;
      if (lado === 'inimigo' && modo === 'publica') resumo = '3 computadores';
      else if (naSala) resumo = `${vagas[lado].filter((v) => v.pronto).length} de ${gente} prontos`;
      else if (!procurando) resumo = 'Fora da fila';
      else if (modo === 'online') resumo = seu ? `Seu time · ${gente} de 3` : gente >= 3 ? '3 de 3 · completo' : estado?.voce?.pronto ? `${gente} de 3` : `${gente} de 3 · clique para trocar`;
      else resumo = lado === 'meu' ? 'Procurando companheiros' : 'Procurando adversários';
      caixa.querySelector('.resumo').textContent = resumo;
      caixa.classList.toggle('seu', modo === 'online' && seu);
    }
  }

  #desenhar() {
    if (this.fila) return this.#desenharFila();
    for (const lado of ['meu', 'inimigo']) {
      const caixa = this.el.querySelector(`[data-lado="${lado}"]`);
      const n = this.qtd[lado];
      const nomeTime = lado === 'meu' ? 'no seu time' : 'no time inimigo';
      // A sua vaga é fixa; as outras são dos computadores, da esquerda para a direita.
      const vagas = [];
      if (lado === 'meu') {
        const { nome, img } = this.voce;
        vagas.push(
          `<span class="vaga voce" title="Esta vaga é sua">${img ? `<img src="${img}" alt="" draggable="false">` : ''}<b>${escapar(nome || 'Piloto')}</b><small>Você</small></span>`,
        );
      }
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
