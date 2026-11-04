// Tela de abertura (#abertura): a primeira coisa do site. O nome do jogo sobre a arte
// das naves (a Alchemium Wing contra a Chimera, imagem estática em ARTE_ABERTURA), a
// barra de carregamento com os grupos, a dica do canto e o botão JOGAR, que só acende
// com tudo o que o menu mostra já no navegador e então abre o menu (as abas Jogar,
// Naves, Configurações). Regras puras em abertura-regras.js.
//
// O que carrega (insumosDoMenu em insumos.js): as 45 naves e a propulsão das raças
// (o Hangar abre qualquer nave, girando com o motor aceso), as miniaturas de todas
// (cartas da Seleção, linha da Evolução e do Hangar), os ícones das armas de fábrica
// (as fichas), os sons da interface e as vozes do locutor (Configurações), e a placa
// de vídeo da vitrine (aquecerVitrine). O cache é o dos próprios módulos (nave.js,
// vitrine.js, sons.js, o do navegador para os ícones): o menu e a tela de
// carregamento da partida acham tudo pronto e não baixam de novo.
//
// Os sons só baixam aqui: o navegador não deixa decodificar áudio antes do primeiro
// clique, e o JOGAR é esse clique (main.js desbloqueia o som no primeiro toque).

import { insumosDoMenu } from './insumos.js';
import { modeloDaNave } from './nave.js';
import { carregarPropulsao } from './propulsao.js';
import { carregarIcone } from './icones-itens.js';
import { miniatura, aquecerVitrine } from './vitrine.js';
import { emFila } from './carregamento.js';
import { SONS_INTERFACE } from './sons.js';
import {
  ARTE_ABERTURA,
  GRUPOS_ABERTURA,
  DICAS_ABERTURA,
  DICA_S,
  pctAbertura,
  grupoPronto,
  aberturaPronta,
  textoAbertura,
  proximaDica,
} from './abertura-regras.js';

/** Arquivos baixando ao mesmo tempo (o navegador abre ~6 por servidor). */
const SIMULTANEOS = 6;

export class TelaAbertura {
  /**
   * @param {{ el: HTMLElement, sons: import('./sons.js').Sons, painelVolume: { abrir: () => void, aberto: boolean },
   *   aoJogar: () => void }} op `aoJogar` monta e mostra o menu (a abertura já sumiu).
   */
  constructor({ el, sons, painelVolume, aoJogar }) {
    this.el = el;
    this.sons = sons;
    this.aoJogar = aoJogar;
    this.painelVolume = painelVolume;
    this.estado = Object.fromEntries(GRUPOS_ABERTURA.map((g) => [g.id, { feitos: 0, total: 0, falhas: 0 }]));
    this.inicio = performance.now();
    this.saiu = false;
    this.q = (s) => el.querySelector(s);
    this.botao = this.q('.jogar-abertura');

    // Os grupos embaixo da barra (marca girando, nome e contagem).
    const lista = this.q('.grupos-abertura');
    this.linhas = new Map();
    for (const g of GRUPOS_ABERTURA) {
      const li = document.createElement('li');
      li.dataset.grupo = g.id;
      li.innerHTML = `<i class="marca" aria-hidden="true"></i><span class="nome">${g.nome}</span><b class="conta"></b>`;
      lista.append(li);
      this.linhas.set(g.id, li);
    }

    // A arte: aparece esmaecendo quando chega (sem ela, fica o céu do CSS).
    const arte = this.q('.arte-abertura');
    arte.addEventListener('load', () => arte.classList.add('pronta'), { once: true });
    arte.src = ARTE_ABERTURA;
    if (arte.complete && arte.naturalWidth) arte.classList.add('pronta');

    this.botao.addEventListener('click', () => this.jogar());
    this.botao.addEventListener('pointerenter', () => !this.botao.disabled && this.sons.tocarInterface(SONS_INTERFACE.clique, { volume: 0.18, tom: 1.5 }));
    this.q('.som-abertura').addEventListener('click', (e) => {
      painelVolume.abrir();
      e.currentTarget.blur();
    });
    this.teclas = (e) => {
      if (this.saiu || e.repeat || this.painelVolume.aberto) return;
      if (e.key === 'Enter' && !this.botao.disabled) {
        e.preventDefault();
        this.jogar();
      }
    };
    addEventListener('keydown', this.teclas);

    // A dica do canto troca sozinha.
    this.dica = Math.floor(Math.random() * DICAS_ABERTURA.length);
    this.#mostrarDica();
    this.relogioDica = setInterval(() => {
      this.dica = proximaDica(this.dica);
      this.#mostrarDica();
    }, DICA_S * 1000);

    this.desenhar();
  }

  /** Baixa e prepara tudo o que o menu mostra; resolve sempre (falha conta como feito). */
  async carregar() {
    const { naves, propulsao, icones, sons } = insumosDoMenu();
    this.#total('naves', naves.length + propulsao.length);
    this.#total('hangar', naves.length);
    this.#total('audio', sons.length);
    this.#total('interface', icones.length + 1);
    const tarefas = [
      ...naves.map((n) => this.#item('naves', `nave ${n.url}`, () => modeloDaNave(n.race, n.classe, n.tier))),
      ...propulsao.map((r) => this.#item('naves', `propulsão ${r}`, () => carregarPropulsao(r))),
      ...icones.map((nome) => this.#item('interface', `ícone ${nome}`, () => carregarIcone(nome))),
      ...sons.map((nome) =>
        this.#item('audio', `som ${nome}`, async () => {
          await this.sons.carregar(nome);
          return !this.sons.falhou(nome);
        }),
      ),
    ];
    await emFila(tarefas, SIMULTANEOS);
    // Com os modelos no cache: as miniaturas (um desenho cada, em fila, na mesma
    // vitrine) e a placa de vídeo da vitrine (a primeira nave de cada raça com o motor).
    await emFila(
      naves.map((n) => this.#item('hangar', `miniatura ${n.nome}`, async () => (await miniatura(n.race, n.classe, n.tier)) !== null)),
      1,
    );
    await this.#item('interface', 'placa de vídeo da vitrine', () => aquecerVitrine(naves.filter((n) => n.tier === 0 && n.classe === 'assault')))();
    this.ms = Math.round(performance.now() - this.inicio);
    console.info(`Abertura: menu pronto em ${this.ms} ms`);
  }

  /** Fecha a abertura e abre o menu (clique no JOGAR ou Enter, com tudo pronto). */
  jogar() {
    if (this.saiu || this.botao.disabled) return;
    this.saiu = true;
    this.sons.desbloquear();
    this.sons.tocarInterface(SONS_INTERFACE.painel);
    clearInterval(this.relogioDica);
    removeEventListener('keydown', this.teclas);
    this.el.classList.add('saindo');
    this.aoJogar();
    setTimeout(() => (this.el.hidden = true), 450);
  }

  #total(id, total) {
    this.estado[id].total = total;
    this.desenhar();
  }

  /** Item do grupo `id`: roda `fazer`, conta como feito com ou sem falha e avisa a falha no console. */
  #item(id, rotulo, fazer) {
    return async () => {
      let falhou = false;
      try {
        falhou = (await fazer()) === false;
        if (falhou) console.warn(`Abertura: ${rotulo} não carregou (o menu tenta de novo quando precisar)`);
      } catch (err) {
        falhou = true;
        console.warn(`Abertura: ${rotulo} não carregou (o menu tenta de novo quando precisar):`, err?.message ?? err);
      }
      const e = this.estado[id];
      e.feitos++;
      if (falhou) e.falhas++;
      this.desenhar();
    };
  }

  #mostrarDica() {
    const p = this.q('.dica-abertura p');
    p.classList.remove('entrando');
    void p.offsetWidth; // reinicia a animação de entrada
    p.innerHTML = DICAS_ABERTURA[this.dica];
    p.classList.add('entrando');
  }

  /** Um desenho por quadro, por mais arquivos que terminem nele. */
  desenhar() {
    if (this.quadro) return;
    this.quadro = requestAnimationFrame(() => {
      this.quadro = 0;
      const pct = pctAbertura(this.estado);
      this.q('.pct-abertura').textContent = `${pct}%`;
      this.q('.barra-abertura i').style.width = `${pct}%`;
      this.q('.agora-abertura').textContent = textoAbertura(this.estado);
      for (const [id, li] of this.linhas) {
        const e = this.estado[id];
        li.classList.toggle('pronto', grupoPronto(e));
        li.classList.toggle('falhou', e.falhas > 0);
        li.querySelector('.conta').textContent = e.total ? `${e.feitos}/${e.total}` : '';
        li.title = e.falhas ? `${e.falhas} não carregaram: o menu tenta de novo quando precisar` : '';
      }
      const pronta = aberturaPronta(this.estado);
      if (pronta && this.botao.disabled) {
        this.botao.disabled = false;
        this.el.classList.add('pronta');
        if (!document.activeElement || document.activeElement === document.body) this.botao.focus({ preventScroll: true });
      }
    });
  }
}
