// Tabela da partida (#tabela), como a do TAB do League of Legends (pedido do Mateus,
// 04/nov/2026): segurando TAB ela aparece por cima do jogo e some ao soltar; o botão
// "Tabela" do HUD (e o celular) abre e fecha. É só leitura e não pega o mouse: a nave
// continua voando e atirando com ela na tela, como no LoL.
//
// Cabeçalho: do seu lado (turquesa) e do lado do inimigo (vermelho), as torres
// sentinela do outro time destruídas, as Medusas e os Núcleos de He-3 tomados, e no
// meio os abates de jogador de cada time ("12 ⚔ 34"). Vem de `partida.estat` do
// snapshot (server/partida.js), que não perde a conta quando alguém sai.
//
// Embaixo, uma linha por piloto, o seu time à esquerda e o inimigo à direita (um
// embaixo do outro em tela estreita): a miniatura da nave (vitrine.js, a mesma da
// barra do time) com o nível no canto, o nick (computador com o selo IA; a sua linha com a borda acesa), o farm (monstros,
// mineradores e escoltas abatidos), o KDA (abates de jogador / mortes / assistências)
// e os seis itens na nave (arma Z, arma X, escudo, armadura e os dois potenciadores,
// com os ícones do original). Tudo da lista pública `jogadores` do snapshot, que os
// dois times recebem (como no LoL, os itens do inimigo são públicos; a vida e o
// lugar não).
//
// O desenho fica em ConteudoTabela, que a tela de resultado (resultado.js) usa de novo
// sobre a cópia da tabela dela, com os números congelados no fim da partida e o
// destaque da partida (MVP) marcado em ouro.

import { miniatura } from './vitrine.js';
import { iconeArma, nomeArma } from './armas.js';
import { iconeEquip, nomeEquip } from './equipamento.js';
import { linhasDaTabela, kda } from './tabela-regras.js';

// Vagas por time: o mesmo MAX_POR_TIME de server/partida.js (quem manda é o servidor).
const MAX_POR_TIME = 3;
const NOMES_CASAS = ['Arma Z', 'Arma X', 'Escudo', 'Armadura', 'Potenciador 1', 'Potenciador 2'];

const esc = (t) => String(t).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// Ícones do cabeçalho, em traço (currentColor = a cor do time).
const ICONES = {
  torres: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 21h10M9 21V11h6v10M6.5 11h11l-1.5-4.5h-8z" /><path d="M12 6.5V3M10 4.5h4" /></svg>',
  medusa: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12.5a8 7.5 0 0 1 16 0z" /><path d="M7 12.5c0 3-1 5-2.2 8M10.2 12.5c0 3-.2 5.2-1.2 8M13.8 12.5c0 3 .2 5.2 1.2 8M17 12.5c0 3 1 5 2.2 8" /></svg>',
  nucleo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l8.2 4.75v9.5L12 21.5l-8.2-4.75v-9.5z" /><circle cx="12" cy="12" r="3.2" /></svg>',
  abates: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4l11 11M13.5 16.5l3-3M15 15l5 5M20 4L9 15M10.5 16.5l-3-3M9 15l-5 5" /></svg>',
};
const TITULOS = { torres: 'Torres sentinela destruídas', medusa: 'Medusas tomadas', nucleo: 'Núcleos de He-3 tomados' };
// Sem miniatura (sem WebGL ou ainda desenhando): o losango do time.
const SEM_MINI = '<svg class="sem-mini" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 21 12 12 21 3 12Z" /></svg>';

export class TabelaPartida {
  /** @param {{ meuId: number, meuTime: number, signal: AbortSignal }} opcoes */
  constructor({ meuId, meuTime, signal }) {
    this.el = document.querySelector('#tabela');
    this.conteudo = new ConteudoTabela(this.el, { meuId, meuTime });
    this.segurando = false; // aberta pelo TAB (fecha ao soltar)
    this.fixa = false; // aberta pelo botão (fecha no botão ou no ESC)
    addEventListener(
      'keydown',
      (e) => {
        if (e.code !== 'Tab' || e.target instanceof HTMLInputElement) return;
        e.preventDefault(); // o TAB do navegador passaria o foco para os botões
        if (e.repeat) return;
        this.segurando = true;
        this.#mostrar();
      },
      { signal },
    );
    addEventListener(
      'keyup',
      (e) => {
        if (e.code !== 'Tab') return;
        this.segurando = false;
        this.#mostrar();
      },
      { signal },
    );
    // A janela perdeu o foco com o TAB apertado (Alt+Tab): o keyup não chega.
    addEventListener('blur', () => {
      this.segurando = false;
      this.#mostrar();
    }, { signal });
    document.querySelector('#tabela-hud')?.addEventListener(
      'click',
      (e) => {
        this.fixa = !this.fixa;
        this.#mostrar();
        e.currentTarget.blur(); // o foco no botão não pode prender as teclas do jogo
      },
      { signal },
    );
  }

  get aberto() {
    return !this.el.hidden;
  }

  /** Fecha a tabela aberta pelo botão (ESC, sair da partida). */
  fechar() {
    this.fixa = false;
    this.segurando = false;
    this.#mostrar();
  }

  /** Snapshot: a lista pública `jogadores` e o `partida` (com `estat` por time). */
  atualizar(jogadores, partida) {
    this.conteudo.definir(jogadores, partida?.estat);
    if (this.aberto) this.conteudo.desenhar();
  }

  #mostrar() {
    const abrir = this.segurando || this.fixa;
    if (abrir === this.aberto) return;
    this.el.hidden = !abrir;
    document.querySelector('#tabela-hud')?.classList.toggle('ativo', abrir);
    if (abrir) this.conteudo.desenhar(true);
  }
}

/**
 * O conteúdo da tabela (o cabeçalho com os objetivos e os abates de cada time e as
 * linhas dos pilotos) dentro de `el`, que tem a marcação da tabela (.cab-meu,
 * .cab-inimigo, .abates-meu, .abates-inimigo, .time-meu ol, .time-inimigo ol).
 */
export class ConteudoTabela {
  /** @param {HTMLElement} el @param {{ meuId: number, meuTime: number }} opcoes */
  constructor(el, { meuId, meuTime }) {
    this.el = el;
    this.meuId = meuId;
    this.meuTime = meuTime;
    this.jogadores = [];
    this.estat = null;
    this.mvp = null; // id do destaque da partida (a linha em ouro), ou null
    this.chave = '';
    this.minis = new Map(); // 'raça/classe/tier' -> data URL (null: sem miniatura)
  }

  /** Os dados da tabela: a lista `jogadores`, o `estat` por time e o destaque (id). */
  definir(jogadores, estat, mvp = this.mvp) {
    if (Array.isArray(jogadores)) this.jogadores = jogadores;
    if (estat) this.estat = estat;
    this.mvp = mvp;
  }

  desenhar(forcar = false) {
    const chave = JSON.stringify([this.jogadores, this.estat, this.mvp]);
    if (!forcar && chave === this.chave) return; // nada mudou: não mexe no DOM
    this.chave = chave;
    const { meu, inimigo } = linhasDaTabela(this.jogadores, { meuId: this.meuId, meuTime: this.meuTime });
    const estat = (t) => this.estat?.[t] ?? { torres: 0, medusa: 0, nucleo: 0, abates: 0 };
    const eMeu = estat(this.meuTime);
    const eInim = estat(1 - this.meuTime);
    this.el.querySelector('.cab-meu').innerHTML = this.#objetivos(eMeu);
    this.el.querySelector('.cab-inimigo').innerHTML = this.#objetivos(eInim);
    this.el.querySelector('.abates-meu').textContent = eMeu.abates;
    this.el.querySelector('.abates-inimigo').textContent = eInim.abates;
    this.el.querySelector('.time-meu ol').innerHTML = this.#linhas(meu);
    this.el.querySelector('.time-inimigo ol').innerHTML = this.#linhas(inimigo);
  }

  #objetivos(e) {
    return ['torres', 'medusa', 'nucleo']
      .map((k) => `<span class="obj" title="${TITULOS[k]}">${ICONES[k]}<b>${e[k] ?? 0}</b></span>`)
      .join('');
  }

  #linhas(lista) {
    const linhas = lista.map((p) => this.#linha(p));
    for (let k = lista.length; k < MAX_POR_TIME; k++) linhas.push('<li class="vaga">Vaga livre</li>');
    return linhas.join('');
  }

  #linha(p) {
    const selo = p.ia ? '<span class="selo">IA</span>' : ''; // você: a linha com a borda acesa
    const mvp = p.id === this.mvp;
    const seloMvp = mvp ? '<span class="selo-mvp" title="Destaque da partida">MVP</span>' : '';
    const itens = p.itens.map((it, k) => this.#item(it, k)).join('');
    return `<li class="${p.voce ? 'voce' : ''}${p.vivo === false ? ' morto' : ''}${mvp ? ' mvp' : ''}">
      <span class="retrato">${this.#mini(p)}<b class="nv" title="Nível">${p.nivel ?? 1}</b></span>
      <span class="nome"><span>${esc(p.nome)}</span>${selo}${seloMvp}</span>
      <span class="farm" title="Farm: monstros, mineradores e escoltas abatidos">${p.farm ?? 0}</span>
      <span class="kda" title="Abates / mortes / assistências">${kda(p)}</span>
      <span class="itens">${itens}</span>
    </li>`;
  }

  #item(it, k) {
    if (!it) return `<span class="casa" title="${NOMES_CASAS[k]}: vazio">${iconeEquip(null)}</span>`; // a moldura vazia
    const [chave, nivel] = it;
    const icone = k < 2 ? iconeArma(chave, nivel) : iconeEquip(chave, nivel);
    const nome = k < 2 ? `${nomeArma(chave)} V${nivel}` : nomeEquip(chave, nivel);
    return `<span class="casa" title="${esc(nome)}">${icone || '<span class="icone-item vazio"></span>'}</span>`;
  }

  /** A miniatura da nave (pedida uma vez por modelo; desenha de novo quando chega). */
  #mini(p) {
    if (!p.race) return SEM_MINI;
    const k = `${p.race}/${p.classe}/${p.tier ?? 0}`;
    if (!this.minis.has(k)) {
      this.minis.set(k, undefined);
      miniatura(p.race, p.classe, p.tier ?? 0).then((url) => {
        this.minis.set(k, url ?? null);
        if (!this.el.closest('[hidden]')) this.desenhar(true);
      });
    }
    const url = this.minis.get(k);
    return url ? `<img src="${url}" alt="" draggable="false">` : SEM_MINI;
  }
}

/** Miniatura da nave (a mesma da tabela), para o cartão do destaque da partida. */
export function miniaturaDoPiloto(p) {
  return p?.race ? miniatura(p.race, p.classe, p.tier ?? 0) : Promise.resolve(null);
}
