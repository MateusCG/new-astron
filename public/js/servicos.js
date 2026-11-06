// Painéis da Loja e da Evolução (#servico, um elemento só para os dois serviços) e
// os itens consumíveis (teclas R e F e os botões no painel inferior).
//
// Abrir e fechar: o painel abre sozinho quando a nave está POUSADA E PARADA na
// plataforma da Loja ou da Evolução da própria base (main.js chama lugar() a cada
// quadro com o serviço de onde ela está); decolar (L) fecha. ESC fecha o painel em
// vez de sair da partida, e aí ele não reabre sozinho enquanto a nave continuar no
// mesmo lugar: Enter (ou tocar na dica de pouso) abre de novo. Com o painel aberto
// o Z e o X não disparam (main.js lê `aberto`). O jogo não pausa.
//
// O painel só PEDE: cada cartão manda {t:'comprar'|'evoluir'|'melhorar', ...} e o
// servidor valida tudo (server/servicos.js). A resposta {t:'resultado', ...} vira
// uma linha curta no painel (o código de erro traduzido em MENSAGEM_ERRO), e o
// estado (ouro, nível, posse, armadura, itens, nave da linha, melhorias do time) vem
// sempre do snapshot. Preços e efeitos saem de shared/loja.js e shared/evolucao.js,
// então balancear lá já atualiza os cartões.
//
// Evolução › Nave: a linha das cinco naves da raça e classe do piloto (shared/
// naves.js), cada uma com a miniatura 3D (vitrine.js, carrega só os cinco modelos
// da linha, na primeira vez que a aba abre), o nível exigido, o preço e os status
// (HP, energia, velocidade e, nas Bellico, a regeneração em voo) comparados com a
// nave atual. Só a próxima
// da linha se compra ({t:'evoluir', opcao:'nave'}); a resposta e o evento 'nave'
// trocam o modelo (main.js).
//
// A Loja só VENDE: o que se compra vira um objeto (instância na V1) no
// COMPARTIMENTO do INVENTÁRIO (me.inv; no máximo me.compMax fora da nave), sem
// equipar sozinho. Equipar, vender e evoluir cada objeto é no INVENTÁRIO (tecla I,
// inventario.js), que abre junto com a Loja (pedido do Mateus: main.js, pelos
// `aoAbrir`/`aoFechar` do painel; o painel encolhe para a janela caber ao lado). Compartimento cheio: os cartões de comprar apagam
// ("COMPARTIMENTO CHEIO") e o servidor recusaria com 'cheio'.
//
// A aba "Recomendados" é a primeira (e a que abre): as seções Armas, Escudos,
// Armaduras e Potenciadores com o que vale comprar para a raça e a classe do piloto
// (shared/recomendados.js), nos mesmos cartões das outras abas; nas de
// equipamento, um dos três tipos (Op., Ph. ou El.).
//
// As abas "Escudos", "Armaduras" e "Potenciadores" mostram os itens do original à
// venda para a CLASSE do piloto (equipamentosAVenda em shared/equipamentos.js, com
// filtro por tipo de dano: Todos, Ph., Op., El. e Gerais, se houver), com os efeitos e o preço da V1
// ({t:'comprar', item:'e330010'}); o mesmo item pode ser comprado de novo (cada
// compra é outra instância) e o cartão conta quantos o piloto tem ("NO INVENTÁRIO
// ×n", "NA NAVE" se um está num encaixe).
//
// A aba "Armas" mostra as armas do Astro-N original da RAÇA e da CLASSE do piloto
// (armasAVenda em shared/loja.js; 16 a 26), na ordem das categorias do original e
// com filtro por tipo de dano (Todos, Ph., Op., El., como nos equipamentos) para não
// virar uma parede de cartões; cada cartão traz o ícone, o nome (e o do original em inglês,
// pequeno), dano, recarga e energia, a forma e o efeito, as etiquetas de tipo de
// dano e papel, e o preço. Cada arma vai até ARMA_COPIAS_MAX cópias (shared/
// loja.js; a de fábrica conta como a primeira, e por isso também está à venda),
// cada uma com a sua versão, para a mesma arma ir no Z e no X: como nos
// equipamentos, o cartão conta quantas o piloto tem ("NO INVENTÁRIO ×n", "NA NAVE"
// se uma está num encaixe) e, no máximo, apaga ("MÁXIMO ×2"; o servidor recusaria
// com 'ja_possui').
//
// Evolução › Torretas: o nível das quatro torretas do time ({t:'melhorar',
// melhoria:'torretas'}) e um cartão por torreta do time, com a vida (de pé), a obra
// esperando o lugar ficar livre ou o botão de reconstruir ({t:'reconstruir',
// torreta}). O estado vem do snapshot (`torretas`, filtrado pelo meuTime).
//
// Listeners no `signal` dos controles: sair da partida e entrar de novo não duplica.

import { ARMAS, WEAPONS, IDX_ARMA, RACES } from '/shared/sim.js';
import { ITENS, ORDEM_ITENS, COMPARTIMENTO_MAX, ARMA_COPIAS_MAX, armasAVenda, noCompartimento, armasDoInv, copiasDaArma, gruposPorTipo } from '/shared/loja.js';
import { EQUIPAMENTOS, SIGLA_TIPO, equipamentosAVenda, versaoEquip, textoEfeitoEquip } from '/shared/equipamentos.js';
import { linhaDe, CLASSES } from '/shared/naves.js';
import { recomendadosDe } from '/shared/recomendados.js';
import {
  MELHORIAS_MINERADOR,
  ORDEM_MELHORIAS,
  mineradoresDoTime,
  MELHORIA_TORRETAS,
  TORRETA_NIVEL_MAX,
  PRECO_RECONSTRUIR,
  precoNivelTorretas,
} from '/shared/evolucao.js';
import { TORRETAS } from '/shared/terrain.js';
import { iconeArma, linhasDescricao, numerosArma, etiquetasArma, nomeArma, ordenarPorCategoria } from './armas.js';
import { miniatura } from './vitrine.js';
import { iconeEquip, textoClasses, classeTipo } from './equipamento.js';
import { htmlIcone } from './icones-itens.js';
import { ICONE_CONSUMIVEL } from './insumos.js';
import { aoApertar, kbdAcao } from './atalhos.js';
import { tr, localeNum, nomeEquip } from '../../shared/idioma.js';

/** Mensagem curta para cada código de erro estável do servidor. */
export const MENSAGEM_ERRO = {
  nao_pousado: tr('Pouse e pare na plataforma da sua base'),
  ouro_insuficiente: tr('Ouro insuficiente'),
  nivel_insuficiente: tr('Nível insuficiente'),
  ja_possui: tr('Você já tem essa arma'),
  limite: tr('Chegou ao limite'),
  invalido: tr('Pedido inválido'),
  sem_item: tr('Sem esse item: compre na Loja'),
  recarga: tr('Item ainda recarregando'),
  cheio: tr('Já está cheio'),
  equipado: tr('Esse item está na nave: tire antes'),
  sem_pontos: tr('Sem pontos livres: suba de nível'),
  maximo: tr('Já está no máximo'),
};

const NOME_SERVICO = { loja: tr('Loja'), evolucao: tr('Evolução') };
const ABAS = {
  loja: [
    ['recomendados', tr('Recomendados')],
    ['armas', tr('Armas')],
    ['escudo', tr('Escudos')],
    ['armadura', tr('Armaduras')],
    ['potenciador', tr('Potenciadores')],
    ['itens', tr('Itens')],
  ],
  evolucao: [
    ['nave', tr('Nave')],
    ['mineradores', tr('Mineradores do time')],
    ['torretas', tr('Torretas')],
  ],
};

const numero = (v) => Math.round(v).toLocaleString(localeNum());
const pct = (f) => `${Math.round(f * 100)}%`;
const svg = (classe, desenho) => `<svg class="icone-servico ${classe}" viewBox="0 0 24 24" aria-hidden="true">${desenho}</svg>`;

/** Ícone de item consumível, o do original: o Hpbattery (reparo) e o Energybattery (energia). */
export function iconeItem(id) {
  return htmlIcone(ICONE_CONSUMIVEL[id], 1, 'icone-consumivel');
}

/** Ícones da Evolução: torretas e as melhorias dos mineradores. */
function iconeEvolucao(id) {
  const desenhos = {
    quantidade: ['tec', '<rect x="3" y="9" width="11" height="8" rx="1.5" /><path d="M6 9 V6 H11 V9 M18 8 V16 M14 12 H22" />'],
    torreta: ['tec', '<path d="M6 21 H18 L16.5 14 H7.5 Z" /><rect x="7" y="9" width="10" height="5" rx="1.5" /><path d="M10 11 H3 M14 11 H21 M12 9 V5" />'],
    reconstruir: ['tec', '<path d="M6 21 H18 L16.5 14 H7.5 Z" /><path d="M12 11 V3 M8.5 6.5 L12 3 L15.5 6.5" />'],
    durabilidade: ['vida', '<rect x="3" y="8" width="18" height="10" rx="2" /><path d="M12 10 V16 M9 13 H15" />'],
    defesa: ['tec', '<path d="M12 3 L19 6 V11 C19 15.5 16 18.5 12 20 C8 18.5 5 15.5 5 11 V6 Z" /><path d="M9 11.5 L11.2 13.7 L15.5 9.3" />'],
    velocidade: ['tec', '<rect x="9" y="8" width="12" height="8" rx="1.5" /><path d="M2 9 H7 M3 12 H7 M2 15 H7" />'],
  };
  const [classe, d] = desenhos[id];
  return svg(classe, d);
}

/** Chama fn no clique (mouse e toque); o toque não bloqueia a rolagem do painel. */
function aoClicar(el, fn, signal) {
  el.addEventListener(
    'click',
    (e) => {
      fn(e);
      e.currentTarget.blur(); // Espaço também atira: não pode "clicar" de novo
    },
    { signal },
  );
}

export class PainelServicos {
  /**
   * @param {{ enviar: (msg: object) => void, noticia: (texto: string, tipo?: string) => void,
   *   signal: AbortSignal, meuTime?: number, aoAbrir?: (servico: string) => void,
   *   aoFechar?: (servico: string) => void }} opcoes
   *   `aoAbrir`/`aoFechar`: o painel apareceu ou sumiu (a Loja abre o INVENTÁRIO junto).
   */
  constructor({ enviar, noticia, signal, meuTime = 0, aoAbrir = () => {}, aoFechar = () => {} }) {
    this.meuTime = meuTime;
    this.enviar = enviar;
    this.noticia = noticia;
    this.aoAbrir = aoAbrir;
    this.aoFechar = aoFechar;
    this.el = document.querySelector('#servico');
    this.titulo = this.el.querySelector('h2');
    this.ouroEl = this.el.querySelector('.ouro b');
    this.abasEl = this.el.querySelector('.abas');
    this.cartas = this.el.querySelector('.cartas');
    this.msg = this.el.querySelector('.msg');
    this.el.hidden = true;
    this.servico = null; // serviço do painel aberto (ou do último aberto)
    this.onde = null; // serviço da plataforma onde a nave está pousada (ou null)
    this.aba = { loja: 'recomendados', evolucao: 'nave' };
    this.filtroTipo = { armas: 'todos', escudo: 'todos', armadura: 'todos', potenciador: 'todos' }; // tipo de dano do filtro de cada aba da Loja
    this.compEl = this.el.querySelector('.comp-loja');
    this.estado = { ouro: 0, nivel: 1, armas: [], inv: [], compMax: COMPARTIMENTO_MAX, noComp: 0, encInst: [], equipado: {}, itens: {}, race: null, classe: null, tier: 0, melhorias: {}, torretas: [] };
    this.minis = new Map(); // 'race/classe/tier' -> data URL da miniatura já feita
    this.chave = '';

    aoClicar(this.el.querySelector('.fechar'), () => this.fechar(), signal);
    aoClicar(
      this.abasEl,
      (e) => {
        const aba = e.target.closest('[data-aba]')?.dataset.aba;
        if (!aba || !this.servico) return;
        this.aba[this.servico] = aba;
        this.#desenhar(true);
      },
      signal,
    );
    aoClicar(
      this.cartas,
      (e) => {
        const ft = e.target.closest('button[data-filtro-tipo]');
        if (ft) {
          this.filtroTipo[this.aba.loja] = ft.dataset.filtroTipo;
          this.#desenhar(true);
          return;
        }
        const b = e.target.closest('button[data-pedido]');
        if (!b || b.disabled) return;
        this.enviar(JSON.parse(b.dataset.pedido));
      },
      signal,
    );
    for (const id of ORDEM_ITENS) {
      const b = document.querySelector(`#item-${id}`);
      if (b) aoClicar(b, () => this.usar(id), signal);
    }
    // A dica de pouso na plataforma reabre o painel (toque no celular).
    aoClicar(document.querySelector('#pouso'), () => this.reabrir(), signal);
    for (const id of ORDEM_ITENS) aoApertar(id, () => this.usar(id), { signal }); // R e F de fábrica
    aoApertar('loja', () => this.reabrir(), { signal }); // Enter
  }

  /** O painel está na tela? (enquanto estiver, o Z e o X não disparam) */
  get aberto() {
    return !this.el.hidden;
  }

  /**
   * A cada quadro: serviço da plataforma da própria base onde a nave está pousada
   * e parada ('loja', 'evolucao') ou null. Chegar abre; sair (decolar) fecha.
   */
  lugar(servico) {
    if (servico === this.onde) return;
    this.onde = servico;
    if (servico) this.abrir(servico);
    else this.fechar();
  }

  /** Abre o painel do serviço. */
  abrir(servico) {
    if (this.servico !== servico) this.msg.textContent = '';
    this.servico = servico;
    this.el.dataset.servico = servico;
    const estava = this.aberto;
    this.el.hidden = false;
    this.#desenhar(true);
    if (!estava) this.aoAbrir(servico);
  }

  /**
   * Fecha (ESC, botão, decolagem). Como só a CHEGADA na plataforma abre, fechado
   * com a nave ainda ali ele fica fechado até o Enter ou o toque na dica.
   */
  fechar() {
    if (!this.aberto) return;
    this.el.hidden = true;
    this.aoFechar(this.servico);
  }

  /** Enter ou toque na dica: abre de novo o painel da plataforma onde a nave está. */
  reabrir() {
    if (!this.onde || this.aberto) return;
    this.abrir(this.onde);
  }

  /** Pede ao servidor para usar o item (R, F ou o botão no painel). */
  usar(id) {
    if (!ITENS[id]) return;
    this.enviar({ t: 'usar', item: id });
  }

  /** Estado que vem do snapshot: ouro, nível, `me`, as melhorias e as torretas do time. */
  atualizar({ ouro, nivel, me, melhorias, torretas }) {
    this.estado = {
      ouro: ouro ?? 0,
      nivel: nivel ?? 1,
      // Posse por instância (me.inv); sem ela (servidor antigo), as armas de me.armas.
      armas: Array.isArray(me?.inv) ? armasDoInv(me.inv) : (me?.armas ?? []),
      inv: (me?.inv ?? []).map(({ id, tipo, chave, fabrica }) => ({ id, tipo, chave, fabrica: !!fabrica })),
      compMax: me?.compMax ?? COMPARTIMENTO_MAX,
      noComp: noCompartimento(me?.inv, me?.equipado, me?.encInst).length,
      encInst: me?.encInst ?? [], // instâncias das armas no Z e no X
      equipado: me?.equipado ?? {},
      itens: me?.itens ?? {},
      race: me?.race ?? null,
      classe: me?.classe ?? null,
      tier: me?.tier ?? 0,
      melhorias: melhorias ?? {},
      // Só as do time, com a vida em passos de 5% (o painel não redesenha a cada tiro).
      torretas: (torretas ?? [])
        .filter((t) => t.time === this.meuTime)
        .map((t) => ({ id: t.id, viva: t.viva, obra: !!t.obra, nivel: t.nivel, vida: Math.ceil((t.vida / t.max) * 20) / 20 })),
    };
    if (this.aberto) this.#desenhar(false);
  }

  /** Resposta do servidor a um pedido: linha no painel (ou notícia, no uso de item). */
  resultado(m) {
    const ok = !!m.ok;
    let texto;
    if (m.acao === 'usar') {
      const item = ITENS[m.item];
      if (!item) return;
      texto = ok ? (m.item === 'reparo' ? tr('{item}: +{v} de HP', { item: item.nome, v: pct(item.cura) }) : tr('{item}: energia cheia', { item: item.nome })) : `${item.nome}: ${MENSAGEM_ERRO[m.codigo] ?? tr('não deu')}`;
      this.noticia(texto, ok ? 'bom' : 'ruim');
      return;
    }
    if (ok) texto = this.#textoSucesso(m);
    else if (m.acao === 'comprar' && m.codigo === 'cheio' && !ITENS[m.item]) {
      texto = tr('Compartimento cheio ({n}): venda ou equipe algo no Inventário (I)', { n: this.estado.compMax });
    } else if (m.acao === 'comprar' && m.codigo === 'ja_possui' && WEAPONS[m.item]) {
      texto = tr('Você já tem {n} cópias de {arma}, o máximo', { n: ARMA_COPIAS_MAX, arma: nomeArma(m.item) });
    } else texto = MENSAGEM_ERRO[m.codigo] ?? tr('Não deu certo');
    this.msg.textContent = texto;
    this.msg.className = 'msg ' + (ok ? 'bom' : 'ruim');
    const nome = WEAPONS[m.item] ? nomeArma(m.item) : EQUIPAMENTOS[m.item] ? nomeEquip(EQUIPAMENTOS[m.item]) : null;
    if (ok && m.acao === 'comprar' && nome) this.noticia(tr('{nome} no compartimento: I abre o inventário', { nome }), 'bom');
  }

  #textoSucesso(m) {
    if (m.acao === 'comprar') {
      const nome = WEAPONS[m.item] ? nomeArma(m.item) : EQUIPAMENTOS[m.item] ? nomeEquip(EQUIPAMENTOS[m.item]) : (ITENS[m.item]?.nome ?? m.item);
      return ITENS[m.item] ? tr('Comprado: {nome}', { nome }) : tr('Comprado: {nome} · no compartimento do Inventário (I)', { nome });
    }
    if (m.acao === 'evoluir') {
      // O snapshot com a nave nova pode ainda não ter chegado: é a próxima da linha.
      const nova = linhaDe(this.estado.race, this.estado.classe)[this.estado.tier + 1];
      return nova ? tr('Nave nova: {nave}', { nave: nova.nome }) : tr('Nave nova');
    }
    if (m.acao === 'reconstruir') return tr('Torreta reconstruída');
    if (m.item === MELHORIA_TORRETAS.id) return tr('Torretas do time: nível novo');
    return tr('Mineradores do time: {nome}', { nome: MELHORIAS_MINERADOR[m.item]?.nome ?? m.item });
  }

  /** Redesenha o painel; sem `forcar`, só se algo mudou (ouro, posse, aba...). */
  #desenhar(forcar) {
    const s = this.estado;
    const servico = this.servico;
    const aba = this.aba[servico];
    const chave = JSON.stringify([servico, aba, this.filtroTipo, s]);
    if (!forcar && chave === this.chave) return;
    this.chave = chave;
    this.titulo.textContent = NOME_SERVICO[servico];
    this.ouroEl.textContent = numero(s.ouro);
    // Na Loja, quanto cabe no compartimento (para onde vai o que se compra).
    if (this.compEl) {
      this.compEl.hidden = servico !== 'loja';
      this.compEl.classList.toggle('cheio', this.#cheio());
      this.compEl.querySelector('b').textContent = `${s.noComp}/${s.compMax}`;
    }
    this.abasEl.innerHTML = ABAS[servico]
      .map(([id, nome]) => `<button type="button" data-aba="${id}" class="${id === aba ? 'sel' : ''}">${nome}</button>`)
      .join('');
    const grade = (html) => `<div class="grade">${html}</div>`;
    this.cartas.innerHTML =
      aba === 'recomendados'
        ? this.#recomendados()
        : aba === 'armas'
        ? this.#armas()
        : aba === 'escudo' || aba === 'armadura' || aba === 'potenciador'
          ? this.#equipamentos(aba)
          : aba === 'itens'
            ? grade(this.#itens())
            : aba === 'nave'
              ? this.#nave()
              : aba === 'torretas'
                ? this.#torretas()
                : this.#mineradores();
  }

  /**
   * Um cartão: ícone, nome, efeito (texto ou lista: uma informação por linha), preço
   * e o selo do estado. estado: 'livre'
   * (dá para comprar), 'comprado', 'equipado', 'bloqueado' (nível), 'sem-ouro',
   * 'max' ou 'passou' (nave da linha que já ficou para trás). Só 'livre' e
   * 'sem-ouro' ficam clicáveis (o servidor responde o porquê).
   */
  #cartao({ icone, nome, efeito, preco, selo, estado, pedido, extra = '', classe = '' }) {
    const ativo = estado === 'livre' || estado === 'sem-ouro';
    const custo = preco == null ? '' : `<span class="preco">${numero(preco)}</span>`;
    return `<button type="button" class="carta-servico ${estado} ${classe}" ${ativo ? '' : 'disabled'} data-pedido='${JSON.stringify(pedido)}'>
      <span class="cab">${icone}<strong>${nome}</strong></span>
      ${efeito?.length ? `<small class="efeito">${[].concat(efeito).map((l) => `<span>${l}</span>`).join('')}</small>` : ''}${extra}
      <span class="rodape">${custo}<span class="selo">${selo}</span></span>
    </button>`;
  }

  /** Estado de compra pelo preço: livre ou sem ouro. */
  #pelaCarteira(preco) {
    return this.estado.ouro >= preco ? ['livre', tr('COMPRAR')] : ['sem-ouro', tr('SEM OURO')];
  }

  /** O compartimento do inventário está cheio (arma e equipamento não cabem)? */
  #cheio() {
    return this.estado.noComp >= this.estado.compMax;
  }

  /** Estado de compra de arma ou equipamento: o compartimento cheio apaga o cartão. */
  #paraOCompartimento(preco) {
    return this.#cheio() ? ['max', tr('COMPARTIMENTO CHEIO')] : this.#pelaCarteira(preco);
  }

  /**
   * Filtro por tipo de dano da aba `aba` (Todos, Ph., Op., El. e Gerais; só os grupos
   * que têm item, gruposPorTipo em shared/loja.js) sobre os ids à venda. O grupo
   * escolhido que sumiu da lista volta para "Todos".
   */
  #filtroTipo(aba, ids) {
    const grupos = gruposPorTipo(ids);
    if (!grupos.some((g) => g.id === this.filtroTipo[aba])) this.filtroTipo[aba] = 'todos';
    const sel = this.filtroTipo[aba];
    const nome = (g) => (g === 'todos' ? tr('Todos') : g === 'geral' ? tr('Gerais') : SIGLA_TIPO[g]);
    const html = `<div class="filtro-armas">${grupos
      .map((g) => `<button type="button" data-filtro-tipo="${g.id}" class="${g.id === sel ? 'sel' : ''}">${nome(g.id)} <i>${g.itens.length}</i></button>`)
      .join('')}</div>`;
    return { html, filtrada: grupos.find((g) => g.id === sel).itens };
  }

  /** Dano, crítico, alcance máximo, recarga e energia da arma no nível, um por linha. */
  #numerosArma(i, nivel) {
    return `<dl class="stats-arma">${numerosArma(ARMAS[i], nivel)
      .map(([rotulo, valor]) => `<dt>${rotulo}</dt><dd>${valor}</dd>`)
      .join('')}</dl>`;
  }

  /**
   * Aba Recomendados (a primeira da Loja): as quatro seções de shared/recomendados.js
   * para a raça e a classe do piloto, com os mesmos cartões das outras abas. Nas de
   * equipamento a recomendação é um dos três tipos; a seção sem lista
   * (null em ARMAS_RECOMENDADAS) mostra EM BREVE.
   */
  #recomendados() {
    const { race, classe } = this.estado;
    const secoes = recomendadosDe(race, classe).map((s) => {
      const cab = `<h3 class="secao-rec">${s.nome}${s.dica && s.itens.length ? ` <small>${s.dica}</small>` : ''}</h3>`;
      if (s.emBreve) return `${cab}<p class="nota em-breve-rec">${tr('EM BREVE')}</p>`;
      if (!s.itens.length) return `${cab}<p class="nota">${tr('Sem recomendação para esta nave.')}</p>`;
      const cartoes = s.itens.map((k) => (s.categoria === 'arma' ? this.#cartaoArma(k) : this.#cartaoEquip(k)));
      return `${cab}<div class="grade">${cartoes.join('')}</div>`;
    });
    const nota = `<p class="nota">${tr('O que vale comprar para a {classe} {raca}. O comprado vai para o compartimento do Inventário (<kbd>I</kbd>) na V1, como nas outras abas.', { classe: CLASSES[classe]?.nome ?? '', raca: RACES[race]?.nome ?? '' })}</p>`;
    return `${nota}${secoes.join('')}`;
  }

  /**
   * Cartão de compra de uma arma (chave `kind`): ícone, nome, descrição, números da
   * V1, etiquetas, preço e quantas cópias o piloto já tem (Armas e Recomendados).
   */
  #cartaoArma(kind) {
    const { inv, encInst } = this.estado;
    const preco = WEAPONS[kind].preco;
    const n = copiasDaArma(inv, kind);
    const cheia = n >= ARMA_COPIAS_MAX;
    const [estado, selo] = cheia ? ['comprado', tr('MÁXIMO ×{n}', { n: ARMA_COPIAS_MAX })] : this.#paraOCompartimento(preco);
    const naNave = inv.some((x) => x.tipo === 'arma' && x.chave === kind && encInst.includes(x.id));
    const fabrica = inv.some((x) => x.chave === kind && x.fabrica);
    const marcas = [
      naNave ? `<i class="selo-nave">${tr('NA NAVE')}</i>` : '',
      n > 0 ? `<i class="selo-nave guardado">${tr('NO INVENTÁRIO ×{n}', { n })}</i>` : '',
      fabrica ? `<i class="so-classe">${tr('DE FÁBRICA')}</i>` : '',
    ].join('');
    return this.#cartao({
      icone: iconeArma(kind),
      nome: nomeArma(kind),
      efeito: linhasDescricao(kind),
      preco: cheia ? null : preco,
      selo,
      estado,
      pedido: { t: 'comprar', item: kind },
      extra: `${this.#numerosArma(IDX_ARMA[kind], 1)}${etiquetasArma(kind)}${marcas ? `<span class="linha-nivel">${marcas}</span>` : ''}`,
      classe: n > 0 ? 'possuido' : '',
    });
  }

  /** Armas à venda da raça e da classe do piloto, por categoria. */
  #armas() {
    const { race, classe } = this.estado;
    const venda = ordenarPorCategoria(armasAVenda(race, classe));
    if (!venda.length) return `<p class="nota">${tr('Sem armas à venda para esta nave.')}</p>`;
    // Filtro por tipo de dano, como nos equipamentos (os cartões seguem na ordem das categorias).
    const { html, filtrada: doTipo } = this.#filtroTipo('armas', venda.map((i) => ARMAS[i]));
    const cartoes = venda.filter((i) => doTipo.includes(ARMAS[i])).map((i) => this.#cartaoArma(ARMAS[i]));
    const nota = `<p class="nota">${tr('Armas da {classe} {raca}, até {n} cópias de cada (a de fábrica conta como a primeira), cada uma na sua versão: com duas, a mesma arma vai no Z e no X. A comprada vai para o compartimento do Inventário (<kbd>I</kbd>), de onde se equipa no Z ou no X (ou com Q e E), se evolui e se vende (as de fábrica também, pela metade do que se pagou nelas: na V1, de graça, não rendem ouro).', { classe: CLASSES[classe]?.nome ?? '', raca: RACES[race]?.nome ?? '', n: ARMA_COPIAS_MAX })}</p>`;
    return `${nota}${html}<div class="grade">${cartoes.join('')}</div>`;
  }

  /**
   * Cartão de compra de um escudo, armadura ou potenciador (chave `k`): efeitos e
   * preço da V1, quantos o piloto tem ("NO INVENTÁRIO ×n") e se um está num encaixe
   * ("NA NAVE"). Usado nas abas de equipamento e em Recomendados.
   */
  #cartaoEquip(k) {
    const { inv, equipado } = this.estado;
    const e = EQUIPAMENTOS[k];
    // Equipado traz ids de instância: algum dos quatro encaixes tem esta chave?
    const idsNaNave = new Set([equipado?.escudo, equipado?.armadura, ...(equipado?.pot ?? [])].filter((x) => x != null));
    const naNave = inv.some((x) => idsNaNave.has(x.id) && x.chave === k);
    const n = inv.filter((x) => x.tipo === 'equip' && x.chave === k).length;
    const efeitos = versaoEquip(k, 1).efeitos.map(textoEfeitoEquip);
    const classes = e.classes.length < 3 ? `<i class="so-classe">${textoClasses(e.classes)}</i>` : '';
    const [estado, selo] = this.#paraOCompartimento(e.preco);
    const marcas = [
      naNave ? `<i class="selo-nave">${tr('NA NAVE')}</i>` : '',
      n > 0 ? `<i class="selo-nave guardado">${tr('NO INVENTÁRIO ×{n}', { n })}</i>` : '',
      classes,
    ].join('');
    return this.#cartao({
      icone: iconeEquip(k),
      nome: nomeEquip(e).trim(),
      efeito: efeitos,
      preco: e.preco,
      selo,
      estado,
      pedido: { t: 'comprar', item: k },
      extra: marcas ? `<span class="linha-nivel">${marcas}</span>` : '',
      classe: n > 0 ? `possuido ${classeTipo(e.tipoDano)}` : classeTipo(e.tipoDano),
    });
  }

  /**
   * Escudos, armaduras ou potenciadores à venda para a classe do piloto: efeitos e
   * preço da V1 e COMPRAR (cada compra é uma instância nova no compartimento; a
   * versão sobe no Inventário). O cartão conta quantos o piloto já tem ("NO
   * INVENTÁRIO ×n") e se um deles está num encaixe ("NA NAVE"). Filtro por tipo de dano
   * nas três abas.
   */
  #equipamentos(categoria) {
    const { classe } = this.estado;
    const venda = equipamentosAVenda(classe, categoria);
    const { html: filtro, filtrada: lista } = venda.length ? this.#filtroTipo(categoria, venda) : { html: '', filtrada: [] };
    const cartoes = lista.map((k) => this.#cartaoEquip(k));
    const textos = {
      escudo: tr('O escudo tem energia própria, que recupera sozinha: o dano tira primeiro dele e, acabando, do HP. Também segura um pouco de um tipo de dano.'),
      armadura: tr('A armadura soma HP máximo e resistência aos três tipos de dano (a geral igual nos três; a Op., Ph. ou El. forte em um).'),
      potenciador: tr('Dois na nave (podem ser iguais, cada um na sua versão): poder, recarga, resistência, penetração, crítico, energia, escudo, HP, velocidade.'),
    };
    const nota = `<p class="nota">${textos[categoria]} ${tr('O comprado vai para o compartimento do Inventário (<kbd>I</kbd>) na V1: lá se equipa (em qualquer lugar), se evolui até a V8 e se vende (na base).')}</p>`;
    if (!cartoes.length) return `${nota}${filtro}<p class="nota">${tr('Nada à venda aqui para esta classe.')}</p>`;
    return `${nota}${filtro}<div class="grade">${cartoes.join('')}</div>`;
  }

  #itens() {
    return ORDEM_ITENS.map((id) => {
      const it = ITENS[id];
      const tem = this.estado.itens[id] ?? 0;
      const efeito = [id === 'reparo' ? tr('Cura {v} do HP na hora', { v: pct(it.cura) }) : tr('Enche a energia na hora'), tr('Recarga {s} s', { s: it.recargaS })];
      let [estado, selo] = this.#pelaCarteira(it.preco);
      if (tem >= it.max) [estado, selo] = ['max', tr('CHEIO {n}/{max}', { n: tem, max: it.max })];
      else selo += ` · ${tem}/${it.max}`;
      return this.#cartao({
        icone: iconeItem(id),
        nome: `${kbdAcao(id)} ${it.nome}`,
        efeito,
        preco: it.preco,
        selo,
        estado,
        pedido: { t: 'comprar', item: id },
      });
    }).join('');
  }

  /**
   * A linha das cinco naves da raça e classe: miniatura, nome, nível exigido,
   * preço, status (HP, energia, velocidade; nas Bellico, a regeneração em voo)
   * comparados com a atual e o estado (ATUAL, COMPRAR, PEDE NV n,
   * SEM OURO, JÁ PASSOU). Só a próxima da linha se compra.
   */
  #nave() {
    const { race, classe, tier, nivel, ouro } = this.estado;
    const linha = linhaDe(race, classe);
    if (!linha.length) return `<p class="nota">${tr('Nave sem linha de evolução.')}</p>`;
    const atual = linha[tier] ?? linha[0];
    const cartoes = linha.map((n) => {
      let estado;
      let selo;
      if (n.tier < tier) [estado, selo] = ['passou', tr('JÁ PASSOU')];
      else if (n.tier === tier) [estado, selo] = ['equipado', tr('ATUAL')];
      else if (n.tier > tier + 1) [estado, selo] = ['bloqueado', tr('PEDE NV {n}', { n: n.nivel })];
      else if (nivel < n.nivel) [estado, selo] = ['bloqueado', tr('PEDE NV {n}', { n: n.nivel })];
      else [estado, selo] = ouro >= n.preco ? ['livre', tr('COMPRAR')] : ['sem-ouro', tr('SEM OURO')];
      const chave = `${race}/${classe}/${n.tier}`;
      const src = this.minis.get(chave);
      const img = `<span class="mini-nave" data-mini="${chave}">${src ? `<img src="${src}" alt="" />` : ''}</span>`;
      const extra = `${img}<dl class="cmp-nave">${this.#comparar(n, atual)}</dl>`;
      return this.#cartao({
        icone: '',
        nome: `${n.nome} <em class="nv">${tr('NV {n}', { n: n.nivel })}</em>`,
        efeito: '',
        preco: n.tier > tier && n.preco > 0 ? n.preco : null,
        selo,
        estado,
        pedido: { t: 'evoluir', opcao: 'nave' },
        extra,
      });
    });
    const nota = `<p class="nota">${tr('Linha {classe}: uma nave nova a cada 5 níveis, comprada com o ouro da partida. Vale para os renascimentos; na partida seguinte, volta à {primeira}. Armadura, escudo, potenciadores, pontos e o bônus de nível somam por cima.', { classe: CLASSES[classe]?.nome ?? '', primeira: linha[0].nome })}</p>`;
    // Miniaturas que faltam: carregam só os modelos desta linha e entram sem redesenhar tudo.
    queueMicrotask(() => this.#preencherMiniaturas());
    return `${nota}<div class="grade linha-naves">${cartoes.join('')}</div>`;
  }

  /** Linhas de status da nave `n`, com a diferença para a `atual`. */
  #comparar(n, atual) {
    const linhas = [
      ['HP', n.hp, atual.hp, (v) => numero(v)],
      [tr('Energia'), n.energia, atual.energia, (v) => numero(v)],
      [tr('Veloc.'), n.velocidade, atual.velocidade, (v) => `${Math.round(v)} m/s`],
    ];
    // Regeneração de vida em voo: só as Bellico têm (o traço da raça no original).
    if (n.regenHpVoo > 0) linhas.push(['Regen.', n.regenHpVoo, atual.regenHpVoo, (v) => `${v.toLocaleString(localeNum(), { maximumFractionDigits: 1 })}/s`]);
    return linhas
      .map(([nome, v, a, fmt]) => {
        const d = Math.round((v - a) * 10) / 10;
        const txt = Math.abs(d) >= 10 ? Math.round(d) : d.toLocaleString(localeNum());
        const delta = n === atual || d === 0 ? '' : `<i class="${d > 0 ? 'mais' : 'menos'}">${d > 0 ? '+' : ''}${txt}</i>`;
        return `<dt>${nome}</dt><dd>${fmt(v)}${delta}</dd>`;
      })
      .join('');
  }

  /** Põe as miniaturas 3D nos cartões que ainda estão sem (uma por modelo, com cache). */
  #preencherMiniaturas() {
    for (const el of this.cartas.querySelectorAll('.mini-nave[data-mini]')) {
      if (el.firstChild) continue;
      const chave = el.dataset.mini;
      const [race, classe, tier] = chave.split('/');
      miniatura(race, classe, Number(tier)).then((src) => {
        if (!src) return;
        this.minis.set(chave, src);
        for (const alvo of this.cartas.querySelectorAll(`.mini-nave[data-mini="${chave}"]`)) {
          if (!alvo.firstChild) alvo.innerHTML = `<img src="${src}" alt="" />`;
        }
      });
    }
  }

  /** Nível das torretas do time e um cartão por torreta (vida ou reconstruir). */
  #torretas() {
    const minhas = this.estado.torretas;
    const nivel = minhas[0]?.nivel ?? 1;
    const precoNivel = precoNivelTorretas(nivel);
    const pips = `<span class="pips">${Array.from({ length: TORRETA_NIVEL_MAX - 1 }, (_, i) => `<i class="${i < nivel - 1 ? 'on' : ''}"></i>`).join('')}</span>`;
    const [estadoNivel, seloNivel] =
      precoNivel == null ? ['max', tr('MÁX.')] : this.estado.ouro >= precoNivel ? ['livre', tr('NÍVEL {n}', { n: nivel + 1 })] : ['sem-ouro', tr('SEM OURO')];
    const cartaNivel = this.#cartao({
      icone: iconeEvolucao('torreta'),
      nome: `${MELHORIA_TORRETAS.nome} · ${tr('NV {n}', { n: nivel })}`,
      efeito: tr('{efeito} por nível, nas quatro', { efeito: MELHORIA_TORRETAS.efeito }),
      preco: precoNivel,
      selo: seloNivel,
      estado: estadoNivel,
      pedido: { t: 'melhorar', melhoria: MELHORIA_TORRETAS.id },
      extra: pips,
    });
    const cartas = minhas.map((r, i) => {
      let estado;
      let selo;
      let extra;
      let preco = null;
      if (r.viva) {
        [estado, selo] = ['comprado', tr('DE PÉ · {v}%', { v: Math.round(r.vida * 100) })];
        extra = `<span class="vida-torreta"><i style="width:${r.vida * 100}%"></i></span>`;
      } else if (r.obra) {
        [estado, selo] = ['bloqueado', tr('SUBINDO · LIBERE O LUGAR')];
        extra = '<span class="vida-torreta caida"><i></i></span>';
      } else {
        preco = PRECO_RECONSTRUIR;
        [estado, selo] = this.estado.ouro >= preco ? ['livre', tr('RECONSTRUIR')] : ['sem-ouro', tr('SEM OURO')];
        extra = '<span class="vida-torreta caida"><i></i></span>';
      }
      return this.#cartao({
        icone: iconeEvolucao(r.viva ? 'torreta' : 'reconstruir'),
        nome: r.viva ? tr('Torreta {n}', { n: i + 1 }) : tr('Torreta {n} · destruída', { n: i + 1 }),
        efeito: tr(TORRETAS.find((x) => x.id === r.id)?.nome ?? r.id),
        preco,
        selo,
        estado,
        pedido: { t: 'reconstruir', torreta: r.id },
        extra,
      });
    });
    const nota = tr('Vale para o time inteiro: qualquer piloto paga. Destruída, a torreta só volta se alguém reconstruir (inteira, no nível do time).');
    return `<p class="nota">${nota}</p><div class="grade">${cartaNivel}${cartas.join('')}</div>`;
  }

  #mineradores() {
    const niveis = this.estado.melhorias;
    const cartoes = ORDEM_MELHORIAS.map((id) => {
      const m = MELHORIAS_MINERADOR[id];
      const n = niveis[id] ?? 0;
      const max = m.precos.length;
      const pips = `<span class="pips">${Array.from({ length: max }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span>`;
      let estado;
      let selo;
      if (n >= max) [estado, selo] = ['max', tr('MÁX.')];
      else [estado, selo] = this.estado.ouro >= m.precos[n] ? ['livre', tr('NÍVEL {n}', { n: n + 1 })] : ['sem-ouro', tr('SEM OURO')];
      return this.#cartao({
        icone: iconeEvolucao(id),
        nome: m.nome,
        // Na quantidade, quantos o time tem agora (a base é 10; a melhoria soma).
        efeito: id === 'quantidade' ? tr('{efeito} por nível (o time tem {n})', { efeito: m.efeito, n: mineradoresDoTime(n) }) : tr('{efeito} por nível', { efeito: m.efeito }),
        preco: n >= max ? null : m.precos[n],
        selo,
        estado,
        pedido: { t: 'melhorar', melhoria: id },
        extra: pips,
      });
    }).join('');
    return `<p class="nota">${tr('Vale para o time inteiro: qualquer piloto paga o próximo nível.')}</p><div class="grade">${cartoes}</div>`;
  }
}
