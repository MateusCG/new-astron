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
// inventario.js), que dá para abrir com a Loja aberta (o painel encolhe para a
// janela caber ao lado). Compartimento cheio: os cartões de comprar apagam
// ("COMPARTIMENTO CHEIO") e o servidor recusaria com 'cheio'.
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

import { ARMAS, WEAPONS } from '/shared/sim.js';
import { ITENS, ORDEM_ITENS, COMPARTIMENTO_MAX, ARMA_COPIAS_MAX, armasAVenda, noCompartimento, armasDoInv, copiasDaArma, gruposPorTipo } from '/shared/loja.js';
import { EQUIPAMENTOS, SIGLA_TIPO, equipamentosAVenda, versaoEquip, textoEfeitoEquip } from '/shared/equipamentos.js';
import { versaoArma, resumoVersao } from '/shared/armas.js';
import { linhaDe, CLASSES } from '/shared/naves.js';
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
import { iconeArma, descreverArma, etiquetasArma, textoDano, nomeArma, ordenarPorCategoria } from './armas.js';
import { miniatura } from './vitrine.js';
import { iconeEquip, textoClasses, classeTipo } from './equipamento.js';
import { htmlIcone } from './icones-itens.js';
import { ICONE_CONSUMIVEL } from './insumos.js';

/** Mensagem curta para cada código de erro estável do servidor. */
export const MENSAGEM_ERRO = {
  nao_pousado: 'Pouse e pare na plataforma da sua base',
  ouro_insuficiente: 'Ouro insuficiente',
  nivel_insuficiente: 'Nível insuficiente',
  ja_possui: 'Você já tem essa arma',
  limite: 'Chegou ao limite',
  invalido: 'Pedido inválido',
  sem_item: 'Sem esse item: compre na Loja',
  recarga: 'Item ainda recarregando',
  cheio: 'Já está cheio',
  equipado: 'Esse item está na nave: tire antes',
  sem_pontos: 'Sem pontos livres: suba de nível',
  maximo: 'Já está no máximo',
};

const NOME_SERVICO = { loja: 'Loja', evolucao: 'Evolução' };
const ABAS = {
  loja: [
    ['armas', 'Armas'],
    ['escudo', 'Escudos'],
    ['armadura', 'Armaduras'],
    ['potenciador', 'Potenciadores'],
    ['itens', 'Itens'],
  ],
  evolucao: [
    ['nave', 'Nave'],
    ['mineradores', 'Mineradores do time'],
    ['torretas', 'Torretas'],
  ],
};
const TECLA_ITEM = Object.fromEntries(ORDEM_ITENS.map((id) => [`Key${ITENS[id].tecla}`, id]));

const numero = (v) => Math.round(v).toLocaleString('pt-BR');
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
   *   signal: AbortSignal, meuTime?: number }} opcoes
   */
  constructor({ enviar, noticia, signal, meuTime = 0 }) {
    this.meuTime = meuTime;
    this.enviar = enviar;
    this.noticia = noticia;
    this.el = document.querySelector('#servico');
    this.titulo = this.el.querySelector('h2');
    this.ouroEl = this.el.querySelector('.ouro b');
    this.abasEl = this.el.querySelector('.abas');
    this.cartas = this.el.querySelector('.cartas');
    this.msg = this.el.querySelector('.msg');
    this.el.hidden = true;
    this.servico = null; // serviço do painel aberto (ou do último aberto)
    this.onde = null; // serviço da plataforma onde a nave está pousada (ou null)
    this.aba = { loja: 'armas', evolucao: 'nave' };
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
    addEventListener(
      'keydown',
      (e) => {
        if (e.target instanceof HTMLInputElement || e.repeat) return;
        if (TECLA_ITEM[e.code]) this.usar(TECLA_ITEM[e.code]);
        else if (e.code === 'Enter' || e.code === 'NumpadEnter') this.reabrir();
      },
      { signal },
    );
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
    this.el.hidden = false;
    this.#desenhar(true);
  }

  /**
   * Fecha (ESC, botão, decolagem). Como só a CHEGADA na plataforma abre, fechado
   * com a nave ainda ali ele fica fechado até o Enter ou o toque na dica.
   */
  fechar() {
    this.el.hidden = true;
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
      texto = ok ? (m.item === 'reparo' ? `${item.nome}: +${pct(item.cura)} de HP` : `${item.nome}: energia cheia`) : `${item.nome}: ${MENSAGEM_ERRO[m.codigo] ?? 'não deu'}`;
      this.noticia(texto, ok ? 'bom' : 'ruim');
      return;
    }
    if (ok) texto = this.#textoSucesso(m);
    else if (m.acao === 'comprar' && m.codigo === 'cheio' && !ITENS[m.item]) {
      texto = `Compartimento cheio (${this.estado.compMax}): venda ou equipe algo no Inventário (I)`;
    } else if (m.acao === 'comprar' && m.codigo === 'ja_possui' && WEAPONS[m.item]) {
      texto = `Você já tem ${ARMA_COPIAS_MAX} cópias de ${WEAPONS[m.item].nome}, o máximo`;
    } else texto = MENSAGEM_ERRO[m.codigo] ?? 'Não deu certo';
    this.msg.textContent = texto;
    this.msg.className = 'msg ' + (ok ? 'bom' : 'ruim');
    const nome = WEAPONS[m.item]?.nome ?? EQUIPAMENTOS[m.item]?.nomePt;
    if (ok && m.acao === 'comprar' && nome) this.noticia(`${nome} no compartimento: I abre o inventário`, 'bom');
  }

  #textoSucesso(m) {
    if (m.acao === 'comprar') {
      const nome = WEAPONS[m.item]?.nome ?? EQUIPAMENTOS[m.item]?.nomePt ?? ITENS[m.item]?.nome ?? m.item;
      return ITENS[m.item] ? `Comprado: ${nome}` : `Comprado: ${nome} · no compartimento do Inventário (I)`;
    }
    if (m.acao === 'evoluir') {
      // O snapshot com a nave nova pode ainda não ter chegado: é a próxima da linha.
      const nova = linhaDe(this.estado.race, this.estado.classe)[this.estado.tier + 1];
      return nova ? `Nave nova: ${nova.nome}` : 'Nave nova';
    }
    if (m.acao === 'reconstruir') return 'Torreta reconstruída';
    if (m.item === MELHORIA_TORRETAS.id) return 'Torretas do time: nível novo';
    return `Mineradores do time: ${MELHORIAS_MINERADOR[m.item]?.nome ?? m.item}`;
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
      aba === 'armas'
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
   * Um cartão: ícone, nome, efeito, preço e o selo do estado. estado: 'livre'
   * (dá para comprar), 'comprado', 'equipado', 'bloqueado' (nível), 'sem-ouro',
   * 'max' ou 'passou' (nave da linha que já ficou para trás). Só 'livre' e
   * 'sem-ouro' ficam clicáveis (o servidor responde o porquê).
   */
  #cartao({ icone, nome, efeito, preco, selo, estado, pedido, extra = '', classe = '' }) {
    const ativo = estado === 'livre' || estado === 'sem-ouro';
    const custo = preco == null ? '' : `<span class="preco">${numero(preco)}</span>`;
    return `<button type="button" class="carta-servico ${estado} ${classe}" ${ativo ? '' : 'disabled'} data-pedido='${JSON.stringify(pedido)}'>
      <span class="cab">${icone}<strong>${nome}</strong></span>
      ${efeito ? `<small class="efeito">${efeito}</small>` : ''}${extra}
      <span class="rodape">${custo}<span class="selo">${selo}</span></span>
    </button>`;
  }

  /** Estado de compra pelo preço: livre ou sem ouro. */
  #pelaCarteira(preco) {
    return this.estado.ouro >= preco ? ['livre', 'COMPRAR'] : ['sem-ouro', 'SEM OURO'];
  }

  /** O compartimento do inventário está cheio (arma e equipamento não cabem)? */
  #cheio() {
    return this.estado.noComp >= this.estado.compMax;
  }

  /** Estado de compra de arma ou equipamento: o compartimento cheio apaga o cartão. */
  #paraOCompartimento(preco) {
    return this.#cheio() ? ['max', 'COMPARTIMENTO CHEIO'] : this.#pelaCarteira(preco);
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
    const nome = (g) => (g === 'todos' ? 'Todos' : g === 'geral' ? 'Gerais' : SIGLA_TIPO[g]);
    const html = `<div class="filtro-armas">${grupos
      .map((g) => `<button type="button" data-filtro-tipo="${g.id}" class="${g.id === sel ? 'sel' : ''}">${nome(g.id)} <i>${g.itens.length}</i></button>`)
      .join('')}</div>`;
    return { html, filtrada: grupos.find((g) => g.id === sel).itens };
  }

  /** Dano, recarga e energia da arma no nível (linha de números do cartão). */
  #numerosArma(i, nivel) {
    const r = resumoVersao(versaoArma(i, nivel));
    const um = (v) => v.toLocaleString('pt-BR', { maximumFractionDigits: v < 1 ? 2 : 1 });
    return `<dl class="stats-arma"><dt>Dano</dt><dd>${textoDano(ARMAS[i], nivel)}</dd><dt>Recarga</dt><dd>${r.segurar ? 'segure' : `${um(r.cd)} s`}</dd><dt>Energia</dt><dd>${um(r.energia)}${r.segurar ? '/s' : ''}</dd></dl>`;
  }

  /** Armas à venda da raça e da classe do piloto, por categoria. */
  #armas() {
    const { race, classe, inv, encInst } = this.estado;
    const venda = ordenarPorCategoria(armasAVenda(race, classe));
    if (!venda.length) return '<p class="nota">Sem armas à venda para esta nave.</p>';
    // Filtro por tipo de dano, como nos equipamentos (os cartões seguem na ordem das categorias).
    const { html, filtrada: doTipo } = this.#filtroTipo('armas', venda.map((i) => ARMAS[i]));
    const filtrada = venda.filter((i) => doTipo.includes(ARMAS[i]));
    const cartoes = filtrada.map((i) => {
      const kind = ARMAS[i];
      const preco = WEAPONS[kind].preco;
      const n = copiasDaArma(inv, kind);
      const cheia = n >= ARMA_COPIAS_MAX;
      const [estado, selo] = cheia ? ['comprado', `MÁXIMO ×${ARMA_COPIAS_MAX}`] : this.#paraOCompartimento(preco);
      const naNave = inv.some((x) => x.tipo === 'arma' && x.chave === kind && encInst.includes(x.id));
      const fabrica = inv.some((x) => x.chave === kind && x.fabrica);
      const marcas = [
        naNave ? '<i class="selo-nave">NA NAVE</i>' : '',
        n > 0 ? `<i class="selo-nave guardado">NO INVENTÁRIO ×${n}</i>` : '',
        fabrica ? '<i class="so-classe">DE FÁBRICA</i>' : '',
      ].join('');
      return this.#cartao({
        icone: iconeArma(kind),
        nome: nomeArma(kind, true),
        efeito: descreverArma(kind),
        preco: cheia ? null : preco,
        selo,
        estado,
        pedido: { t: 'comprar', item: kind },
        extra: `${this.#numerosArma(i, 1)}${etiquetasArma(kind)}${marcas ? `<span class="linha-nivel">${marcas}</span>` : ''}`,
        classe: n > 0 ? 'possuido' : '',
      });
    });
    const nota = `<p class="nota">Armas da ${CLASSES[classe]?.nome ?? ''} ${race ? race[0].toUpperCase() + race.slice(1) : ''}, até ${ARMA_COPIAS_MAX} cópias de cada (a de fábrica conta como a primeira), cada uma na sua versão: com duas, a mesma arma vai no Z e no X. A comprada vai para o compartimento do Inventário (<kbd>I</kbd>), de onde se equipa no Z ou no X (ou com Q e E), se evolui e se vende. As de fábrica não se vendem.</p>`;
    return `${nota}${html}<div class="grade">${cartoes.join('')}</div>`;
  }

  /**
   * Escudos, armaduras ou potenciadores à venda para a classe do piloto: efeitos e
   * preço da V1 e COMPRAR (cada compra é uma instância nova no compartimento; a
   * versão sobe no Inventário). O cartão conta quantos o piloto já tem ("NO
   * INVENTÁRIO ×n") e se um deles está num encaixe ("NA NAVE"). Filtro por tipo de dano
   * nas três abas.
   */
  #equipamentos(categoria) {
    const { classe, inv, equipado } = this.estado;
    const venda = equipamentosAVenda(classe, categoria);
    const { html: filtro, filtrada: lista } = venda.length ? this.#filtroTipo(categoria, venda) : { html: '', filtrada: [] };
    // Chaves dos equipamentos que estão nos quatro encaixes (equipado traz ids de instância).
    const idsNaNave = new Set([equipado?.escudo, equipado?.armadura, ...(equipado?.pot ?? [])].filter((x) => x != null));
    const naNave = new Set(inv.filter((x) => idsNaNave.has(x.id)).map((x) => x.chave));
    const cartoes = lista.map((k) => {
      const e = EQUIPAMENTOS[k];
      const n = inv.filter((x) => x.tipo === 'equip' && x.chave === k).length;
      const efeitos = versaoEquip(k, 1).efeitos.map(textoEfeitoEquip).join(' · ');
      const classes = e.classes.length < 3 ? `<i class="so-classe">${textoClasses(e.classes)}</i>` : '';
      const original = `<small class="original">${e.nome.trim()}</small>`;
      const [estado, selo] = this.#paraOCompartimento(e.preco);
      const marcas = [
        naNave.has(k) ? '<i class="selo-nave">NA NAVE</i>' : '',
        n > 0 ? `<i class="selo-nave guardado">NO INVENTÁRIO ×${n}</i>` : '',
        classes,
      ].join('');
      return this.#cartao({
        icone: iconeEquip(k),
        nome: `${e.nomePt} ${original}`,
        efeito: efeitos,
        preco: e.preco,
        selo,
        estado,
        pedido: { t: 'comprar', item: k },
        extra: marcas ? `<span class="linha-nivel">${marcas}</span>` : '',
        classe: n > 0 ? `possuido ${classeTipo(e.tipoDano)}` : classeTipo(e.tipoDano),
      });
    });
    const textos = {
      escudo: 'O escudo tem energia própria, que recupera sozinha: o dano tira primeiro dele e, acabando, do HP. Também segura um pouco de um tipo de dano.',
      armadura: 'A armadura soma HP máximo e resistência aos três tipos de dano (a geral igual nos três; a Op., Ph. ou El. forte em um).',
      potenciador: 'Dois na nave (podem ser iguais, cada um na sua versão): poder, recarga, resistência, penetração, crítico, energia, escudo, HP, velocidade.',
    };
    const nota = `<p class="nota">${textos[categoria]} O comprado vai para o compartimento do Inventário (<kbd>I</kbd>) na V1: lá se equipa (em qualquer lugar), se evolui até a V8 e se vende (na base).</p>`;
    if (!cartoes.length) return `${nota}${filtro}<p class="nota">Nada à venda aqui para esta classe.</p>`;
    return `${nota}${filtro}<div class="grade">${cartoes.join('')}</div>`;
  }

  #itens() {
    return ORDEM_ITENS.map((id) => {
      const it = ITENS[id];
      const tem = this.estado.itens[id] ?? 0;
      const efeito = (id === 'reparo' ? `Cura ${pct(it.cura)} do HP na hora` : 'Enche a energia na hora') + ` · recarga ${it.recargaS} s`;
      let [estado, selo] = this.#pelaCarteira(it.preco);
      if (tem >= it.max) [estado, selo] = ['max', `CHEIO ${tem}/${it.max}`];
      else selo += ` · ${tem}/${it.max}`;
      return this.#cartao({
        icone: iconeItem(id),
        nome: `<kbd>${it.tecla}</kbd> ${it.nome}`,
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
    if (!linha.length) return '<p class="nota">Nave sem linha de evolução.</p>';
    const atual = linha[tier] ?? linha[0];
    const cartoes = linha.map((n) => {
      let estado;
      let selo;
      if (n.tier < tier) [estado, selo] = ['passou', 'JÁ PASSOU'];
      else if (n.tier === tier) [estado, selo] = ['equipado', 'ATUAL'];
      else if (n.tier > tier + 1) [estado, selo] = ['bloqueado', `PEDE NV ${n.nivel}`];
      else if (nivel < n.nivel) [estado, selo] = ['bloqueado', `PEDE NV ${n.nivel}`];
      else [estado, selo] = ouro >= n.preco ? ['livre', 'COMPRAR'] : ['sem-ouro', 'SEM OURO'];
      const chave = `${race}/${classe}/${n.tier}`;
      const src = this.minis.get(chave);
      const img = `<span class="mini-nave" data-mini="${chave}">${src ? `<img src="${src}" alt="" />` : ''}</span>`;
      const extra = `${img}<dl class="cmp-nave">${this.#comparar(n, atual)}</dl>`;
      return this.#cartao({
        icone: '',
        nome: `${n.nome} <em class="nv">NV ${n.nivel}</em>`,
        efeito: '',
        preco: n.tier > tier && n.preco > 0 ? n.preco : null,
        selo,
        estado,
        pedido: { t: 'evoluir', opcao: 'nave' },
        extra,
      });
    });
    const nota = `<p class="nota">Linha ${CLASSES[classe]?.nome ?? ''}: uma nave nova a cada 5 níveis, comprada com o ouro da partida. Vale para os renascimentos; na partida seguinte, volta à ${linha[0].nome}. Armadura, escudo, potenciadores, pontos e o bônus de nível somam por cima.</p>`;
    // Miniaturas que faltam: carregam só os modelos desta linha e entram sem redesenhar tudo.
    queueMicrotask(() => this.#preencherMiniaturas());
    return `${nota}<div class="grade linha-naves">${cartoes.join('')}</div>`;
  }

  /** Linhas de status da nave `n`, com a diferença para a `atual`. */
  #comparar(n, atual) {
    const linhas = [
      ['HP', n.hp, atual.hp, (v) => numero(v)],
      ['Energia', n.energia, atual.energia, (v) => numero(v)],
      ['Veloc.', n.velocidade, atual.velocidade, (v) => `${Math.round(v)} m/s`],
    ];
    // Regeneração de vida em voo: só as Bellico têm (o traço da raça no original).
    if (n.regenHpVoo > 0) linhas.push(['Regen.', n.regenHpVoo, atual.regenHpVoo, (v) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}/s`]);
    return linhas
      .map(([nome, v, a, fmt]) => {
        const d = Math.round((v - a) * 10) / 10;
        const txt = Math.abs(d) >= 10 ? Math.round(d) : d.toLocaleString('pt-BR');
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
      precoNivel == null ? ['max', 'MÁX.'] : this.estado.ouro >= precoNivel ? ['livre', `NÍVEL ${nivel + 1}`] : ['sem-ouro', 'SEM OURO'];
    const cartaNivel = this.#cartao({
      icone: iconeEvolucao('torreta'),
      nome: `${MELHORIA_TORRETAS.nome} · NV ${nivel}`,
      efeito: `${MELHORIA_TORRETAS.efeito} por nível, nas quatro`,
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
        [estado, selo] = ['comprado', `DE PÉ · ${Math.round(r.vida * 100)}%`];
        extra = `<span class="vida-torreta"><i style="width:${r.vida * 100}%"></i></span>`;
      } else if (r.obra) {
        [estado, selo] = ['bloqueado', 'SUBINDO · LIBERE O LUGAR'];
        extra = '<span class="vida-torreta caida"><i></i></span>';
      } else {
        preco = PRECO_RECONSTRUIR;
        [estado, selo] = this.estado.ouro >= preco ? ['livre', 'RECONSTRUIR'] : ['sem-ouro', 'SEM OURO'];
        extra = '<span class="vida-torreta caida"><i></i></span>';
      }
      return this.#cartao({
        icone: iconeEvolucao(r.viva ? 'torreta' : 'reconstruir'),
        nome: `Torreta ${i + 1}${r.viva ? '' : ' · destruída'}`,
        efeito: TORRETAS.find((x) => x.id === r.id)?.nome ?? r.id,
        preco,
        selo,
        estado,
        pedido: { t: 'reconstruir', torreta: r.id },
        extra,
      });
    });
    const nota = 'Vale para o time inteiro: qualquer piloto paga. Destruída, a torreta só volta se alguém reconstruir (inteira, no nível do time).';
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
      if (n >= max) [estado, selo] = ['max', 'MÁX.'];
      else [estado, selo] = this.estado.ouro >= m.precos[n] ? ['livre', `NÍVEL ${n + 1}`] : ['sem-ouro', 'SEM OURO'];
      return this.#cartao({
        icone: iconeEvolucao(id),
        nome: m.nome,
        // Na quantidade, quantos o time tem agora (a base é 10; a melhoria soma).
        efeito: id === 'quantidade' ? `${m.efeito} por nível (o time tem ${mineradoresDoTime(n)})` : `${m.efeito} por nível`,
        preco: n >= max ? null : m.precos[n],
        selo,
        estado,
        pedido: { t: 'melhorar', melhoria: id },
        extra: pips,
      });
    }).join('');
    return `<p class="nota">Vale para o time inteiro: qualquer piloto paga o próximo nível.</p><div class="grade">${cartoes}</div>`;
  }
}
