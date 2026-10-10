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
// estado (ouro, nível, posse, armadura, itens, evoluções, melhorias do time) vem
// sempre do snapshot. Preços e efeitos saem de shared/loja.js e shared/evolucao.js,
// então balancear lá já atualiza os cartões.
//
// Listeners no `signal` dos controles: sair da partida e entrar de novo não duplica.

import { ARMAS, WEAPONS } from '/shared/sim.js';
import { ARMAS_A_VENDA, PRECO_ARMA, ARMADURAS, ITENS, ORDEM_ITENS } from '/shared/loja.js';
import { MARCOS_NAVE, OPCOES_NAVE, ORDEM_OPCOES_NAVE, MELHORIAS_MINERADOR, ORDEM_MELHORIAS, proximoMarco } from '/shared/evolucao.js';
import { iconeArma, descreverArma } from './armas.js';

/** Mensagem curta para cada código de erro estável do servidor. */
export const MENSAGEM_ERRO = {
  nao_pousado: 'Pouse e pare na plataforma da sua base',
  ouro_insuficiente: 'Ouro insuficiente',
  nivel_insuficiente: 'Nível insuficiente',
  ja_possui: 'Você já tem isso (ou melhor)',
  limite: 'Chegou ao limite',
  invalido: 'Pedido inválido',
  sem_item: 'Sem esse item: compre na Loja',
  recarga: 'Item ainda recarregando',
  cheio: 'Já está cheio',
};

const NOME_SERVICO = { loja: 'Loja', evolucao: 'Evolução' };
const ABAS = {
  loja: [
    ['armas', 'Armas'],
    ['armaduras', 'Armaduras'],
    ['itens', 'Itens'],
  ],
  evolucao: [
    ['nave', 'Nave'],
    ['mineradores', 'Mineradores do time'],
  ],
};
const TECLA_ITEM = Object.fromEntries(ORDEM_ITENS.map((id) => [`Key${ITENS[id].tecla}`, id]));

const numero = (v) => Math.round(v).toLocaleString('pt-BR');
const pct = (f) => `${Math.round(f * 100)}%`;
const svg = (classe, desenho) => `<svg class="icone-servico ${classe}" viewBox="0 0 24 24" aria-hidden="true">${desenho}</svg>`;

/** Ícone de item consumível: cruz de reparo (vida) e bateria (energia). */
export function iconeItem(id) {
  if (id === 'reparo') return svg('vida', '<rect x="4" y="4" width="16" height="16" rx="3" /><path d="M12 8 V16 M8 12 H16" />');
  return svg('energia', '<rect x="5" y="6" width="13" height="14" rx="2" /><path d="M9 3 H14 M12.5 9 L9.5 13.5 H13 L10.5 17.5" />');
}

/** Escudo da armadura, com uma divisa por nível (1 a 3). */
function iconeArmadura(nivel) {
  const divisas = Array.from({ length: nivel + 1 }, (_, i) => `<path d="M8 ${8 + i * 3.5} L12 ${10.5 + i * 3.5} L16 ${8 + i * 3.5}" />`).join('');
  return svg('tec', `<path d="M12 2 L20 5 V11 C20 16 16.5 20 12 22 C7.5 20 4 16 4 11 V5 Z" />${divisas}`);
}

/** Ícones da Evolução: casco, reator, motor e as melhorias dos mineradores. */
function iconeEvolucao(id) {
  const desenhos = {
    casco: ['vida', '<path d="M12 2 L20 6.5 V17.5 L12 22 L4 17.5 V6.5 Z" /><path d="M12 8 V16 M8 12 H16" />'],
    reator: ['energia', '<circle cx="12" cy="12" r="8.5" /><path d="M13 6 L9 13 H12.5 L11 18 L15 11 H11.5 Z" />'],
    motor: ['tec', '<path d="M5 6 L11 12 L5 18 M12 6 L18 12 L12 18" />'],
    quantidade: ['tec', '<rect x="3" y="9" width="11" height="8" rx="1.5" /><path d="M6 9 V6 H11 V9 M18 8 V16 M14 12 H22" />'],
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
   *   signal: AbortSignal }} opcoes
   */
  constructor({ enviar, noticia, signal }) {
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
    this.estado = { ouro: 0, nivel: 1, armas: [], armadura: -1, itens: {}, evolucoes: [], melhorias: {} };
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

  /** Estado que vem do snapshot: ouro, nível, `me` e as melhorias do time. */
  atualizar({ ouro, nivel, me, melhorias }) {
    this.estado = {
      ouro: ouro ?? 0,
      nivel: nivel ?? 1,
      armas: me?.armas ?? [],
      armadura: me?.armadura ?? -1,
      itens: me?.itens ?? {},
      evolucoes: me?.evolucoes ?? [],
      melhorias: melhorias ?? {},
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
    else texto = MENSAGEM_ERRO[m.codigo] ?? 'Não deu certo';
    this.msg.textContent = texto;
    this.msg.className = 'msg ' + (ok ? 'bom' : 'ruim');
    if (ok && m.acao === 'comprar' && WEAPONS[m.item]) this.noticia(`${WEAPONS[m.item].nome} liberada: Q ou E para equipar`, 'bom');
  }

  #textoSucesso(m) {
    if (m.acao === 'comprar') {
      const nome = WEAPONS[m.item]?.nome ?? ARMADURAS.find((a) => a.id === m.item)?.nome ?? ITENS[m.item]?.nome ?? m.item;
      return `Comprado: ${nome}`;
    }
    if (m.acao === 'evoluir') return `Nave evoluída: ${OPCOES_NAVE[m.item]?.nome ?? m.item}`;
    return `Mineradores do time: ${MELHORIAS_MINERADOR[m.item]?.nome ?? m.item}`;
  }

  /** Redesenha o painel; sem `forcar`, só se algo mudou (ouro, posse, aba...). */
  #desenhar(forcar) {
    const s = this.estado;
    const servico = this.servico;
    const aba = this.aba[servico];
    const chave = JSON.stringify([servico, aba, s]);
    if (!forcar && chave === this.chave) return;
    this.chave = chave;
    this.titulo.textContent = NOME_SERVICO[servico];
    this.ouroEl.textContent = numero(s.ouro);
    this.abasEl.innerHTML = ABAS[servico]
      .map(([id, nome]) => `<button type="button" data-aba="${id}" class="${id === aba ? 'sel' : ''}">${nome}</button>`)
      .join('');
    const grade = (html) => `<div class="grade">${html}</div>`;
    this.cartas.innerHTML =
      aba === 'armas'
        ? grade(this.#armas())
        : aba === 'armaduras'
          ? grade(this.#armaduras())
          : aba === 'itens'
            ? grade(this.#itens())
            : aba === 'nave'
              ? this.#nave()
              : this.#mineradores();
  }

  /**
   * Um cartão: ícone, nome, efeito, preço e o selo do estado. estado: 'livre'
   * (dá para comprar), 'comprado', 'equipado', 'bloqueado' (nível), 'sem-ouro' ou
   * 'max'. Só 'livre' e 'sem-ouro' ficam clicáveis (o servidor responde o porquê).
   */
  #cartao({ icone, nome, efeito, preco, selo, estado, pedido, extra = '' }) {
    const ativo = estado === 'livre' || estado === 'sem-ouro';
    const custo = preco == null ? '' : `<span class="preco">${numero(preco)}</span>`;
    return `<button type="button" class="carta-servico ${estado}" ${ativo ? '' : 'disabled'} data-pedido='${JSON.stringify(pedido)}'>
      <span class="cab">${icone}<strong>${nome}</strong></span>
      <small class="efeito">${efeito}</small>${extra}
      <span class="rodape">${custo}<span class="selo">${selo}</span></span>
    </button>`;
  }

  /** Estado de compra pelo preço: livre ou sem ouro. */
  #pelaCarteira(preco) {
    return this.estado.ouro >= preco ? ['livre', 'COMPRAR'] : ['sem-ouro', 'SEM OURO'];
  }

  #armas() {
    return ARMAS_A_VENDA.map((i) => {
      const kind = ARMAS[i];
      const w = WEAPONS[kind];
      const preco = PRECO_ARMA[kind];
      const tem = this.estado.armas.includes(i);
      const [estado, selo] = tem ? ['comprado', 'COMPRADA · Q/E equipa'] : this.#pelaCarteira(preco);
      return this.#cartao({
        icone: iconeArma(kind),
        nome: w.nome,
        efeito: descreverArma(kind),
        preco: tem ? null : preco,
        selo,
        estado,
        pedido: { t: 'comprar', item: kind },
      });
    }).join('');
  }

  #armaduras() {
    const atual = this.estado.armadura;
    return ARMADURAS.map((a, nivel) => {
      const efeito = [`-${pct(a.reducao)} de dano`, a.hp ? `+${a.hp} HP máx.` : '', a.velMult < 1 ? `-${pct(1 - a.velMult)} de velocidade` : '']
        .filter(Boolean)
        .join(' · ');
      let [estado, selo] = this.#pelaCarteira(a.preco);
      if (nivel === atual) [estado, selo] = ['equipado', 'EQUIPADA'];
      else if (nivel < atual) [estado, selo] = ['comprado', 'JÁ TEM MELHOR'];
      else if (atual >= 0 && estado === 'livre') selo = 'TROCAR';
      return this.#cartao({ icone: iconeArmadura(nivel), nome: a.nome, efeito, preco: nivel <= atual ? null : a.preco, selo, estado, pedido: { t: 'comprar', item: a.id } });
    }).join('');
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

  #nave() {
    const { evolucoes, nivel, ouro } = this.estado;
    const marco = proximoMarco(evolucoes.length);
    const marcos = MARCOS_NAVE.map((m, i) => {
      const feito = evolucoes[i];
      const classe = feito ? 'feito' : i === evolucoes.length ? (nivel >= m.nivel ? 'proximo' : 'bloqueado') : 'depois';
      const txt = feito ? OPCOES_NAVE[feito]?.nome ?? feito : `${numero(m.preco)} de ouro`;
      return `<li class="${classe}"><b>NV ${m.nivel}</b><span>${txt}</span></li>`;
    }).join('');
    const faixa = `<ol class="marcos">${marcos}</ol>`;
    const cartoes = ORDEM_OPCOES_NAVE.map((id) => {
      const op = OPCOES_NAVE[id];
      const vezes = evolucoes.filter((e) => e === id).length;
      let estado;
      let selo;
      if (!marco) [estado, selo] = ['max', 'COMPLETA'];
      else if (nivel < marco.nivel) [estado, selo] = ['bloqueado', `PEDE NV ${marco.nivel}`];
      else [estado, selo] = ouro >= marco.preco ? ['livre', 'ESCOLHER'] : ['sem-ouro', 'SEM OURO'];
      const extra = vezes ? `<small class="vezes">escolhido ${vezes}×</small>` : '';
      return this.#cartao({ icone: iconeEvolucao(id), nome: op.nome, efeito: op.efeito, preco: marco?.preco, selo, estado, pedido: { t: 'evoluir', opcao: id }, extra });
    }).join('');
    const dica = marco
      ? `<p class="nota">Marco do nível ${marco.nivel}: escolha 1 de 3. Os efeitos voltam a cada renascimento.</p>`
      : '<p class="nota">Os três marcos da nave já foram feitos nesta partida.</p>';
    return faixa + dica + `<div class="grade">${cartoes}</div>`;
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
        efeito: `${m.efeito} por nível`,
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
