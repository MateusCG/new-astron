// Menu principal (#entrada): o header com as abas (Jogar, Naves, Configurações e,
// bloqueadas até as contas de piloto, Ranking e Perfil) e uma tela por aba, mais a Seleção, que
// abre depois de escolher o modo. As regras (modos, ESC, o que se guarda, escalas)
// estão em menu-regras.js; aqui só o desenho e os eventos.
//
// - JOGAR: os modos numa coluna, como o "Select Play Mode" do Deadlock, com a nave
//   girando à direita (a prévia da vitrine.js em #fundo-nave): a em destaque do
//   Hangar ou, sem ela, uma das NAVES_VITRINE (a última de cada linha), sorteada a
//   cada abertura do site e diferente da anterior (CHAVES.vitrine).
// - SELEÇÃO: a seleção de campeão dos MOBAs (LoL, Dota 2, Smite 2, Deadlock) com 3
//   raças × 3 classes numa grade com miniaturas (escolha num clique, setas também), a
//   nave grande no centro com a linha da Evolução, a ficha (raça, classe e as barras
//   na régua das primeiras naves, até o Regen.) com o mapa da partida embaixo dela,
//   no resto da coluna (mapa-selecao.js, a sua base marcada), e, embaixo, os times (escolha-times.js)
//   e o Decolar. Nos modos da fila online (Jogar New Astron e Partida Pública com
//   Bots: fila.js, fila-regras.js, server/filas.js) abrir a Seleção já entra na fila:
//   o Decolar fica "Aguardando…", os times viram a sala (companheiros, Pronto), e com a
//   sala formada o botão vira "Pronto", com o contador embaixo; todos prontos, a
//   partida começa sozinha. No Jogar New Astron, com pelo menos um piloto em cada
//   time, o "Pronto" já acende na fila: todos prontos, começa com quem está (1 contra
//   1 com um colega). Sair da Seleção (ESC, aba) sai da fila.
// - COMO JOGAR: a trilha do piloto iniciante, como a aba Learn do Dota 2
//   (como-jogar.js): capítulos curtos com o progresso, o "em resumo", as teclas do mapa
//   em uso e o "Praticar agora", que escolhe o modo e abre a Seleção. Com nada lido, a
//   aba Jogar mostra o convite "Primeira vez?".
// - NAVES: o hangar, só leitura: filtros de raça e classe, a nave no visor (arrastar
//   gira), a ficha com o tamanho real e as barras na régua das 45 naves, e a linha das
//   5 naves com o nível e o preço na Evolução. "Mostrar na tela Jogar" põe a nave
//   aberta (qualquer tier) em destaque na aba Jogar, sempre, no lugar da sorteada;
//   clicar de novo tira (fica no navegador, CHAVES.destaque).
// - CONFIGURAÇÕES: as barras de volume (outro PainelVolume, sobre #config-som) e os
//   atalhos do teclado e do controle (joystick), cada ação com as suas casas: clicar
//   numa casa espera a tecla ou o botão novo (atalhos.js, capturar), e o mapa fica no
//   navegador.
//
// O canvas da nave 3D é um só (vitrine.js) e vai para o palco da tela aberta; nas
// Configurações ele para. As miniaturas saem da mesma vitrine (cada uma uma vez por
// página). O menu só é montado depois da tela de abertura (abertura.js), que já baixou
// as 45 naves e desenhou todas as miniaturas: nenhuma aba carrega nada na hora.

import * as THREE from 'three';
import { RACES } from '/shared/sim.js';
import { WEAPONS, ARMAS, CATEGORIAS, armasIniciais } from '/shared/armas.js';
import { SIGLA_TIPO } from '/shared/equipamentos.js';
import { CLASSES, ORDEM_CLASSES, RACAS_JOGAVEIS, RACAS_BLOQUEADAS, linhaDe, naveDe } from '/shared/naves.js';
import { htmlIcone } from './icones-itens.js';
import { mostrarPrevia, pararPrevia, miniatura, girarPrevia, segurarPrevia } from './vitrine.js';
import { modeloDaNave } from './nave.js';
import { SONS_INTERFACE } from './sons.js';
import { EscolhaTimes } from './escolha-times.js';
import { MapaSelecao } from './mapa-selecao.js';
import { ComoJogar } from './como-jogar.js';
import { timeDoPiloto } from './mapa-selecao-regras.js';
import { ConexaoFila } from './fila.js';
import { estadoFilaVazio, botaoDaFila, linhaDaFila, textoAviso, textoContagemModo } from './fila-regras.js';
import { PainelVolume } from './volume.js';
import { ACAO, GRUPOS_ACOES, ATALHOS_POR_ACAO, nomeTecla, nomeEntrada } from './atalhos-regras.js';
import {
  mapasAtuais,
  kbdAcao,
  pintarRotulos,
  capturar,
  cancelarCaptura,
  capturaAtual,
  limparAtalho,
  restaurarPadrao,
  aoMudarAtalhos,
} from './atalhos.js';
import { controlesLigados, aoMudarControle } from './joystick.js';
import {
  ABAS,
  MODOS,
  CHAVES,
  modoPorId,
  pedidoDoModo,
  filaDoModo,
  telaAnterior,
  estadoGuardado,
  textoDestaque,
  mesmaNave,
  naveDaVitrine,
  sortearVitrine,
  proximoModo,
  moverNaGrade,
  escalaStatus,
  navesJogaveis,
  primeirasNaves,
} from './menu-regras.js';

/** Uma frase por raça (do documento de design do Mateus). */
const DESCRICAO_RACA = {
  acron: 'Povo aquático, mestre das ondas de energia.',
  bellico: 'Guerreiros do deserto, kamikazes no ataque.',
  shrewdo: 'Corporações do terreno, com campo furtivo.',
  mechan: 'Biônicos do mundo tóxico, com droides de restauração.',
};

/** O contador da sala da fila (o mesmo SELECAO_S de server/filas.js; só para a barra). */
const SELECAO_S = 60;
/** De quanto em quanto tempo (ms) o contador e a espera da fila andam na tela. */
const RELOGIO_FILA_MS = 250;
const TITULO_ACHOU = '▶ Partida encontrada · New AstroN';

/** Dicas do rodapé por tela. */
const DICAS = {
  jogar: '<kbd>↑</kbd><kbd>↓</kbd> escolhe o modo · <kbd>Enter</kbd> entra',
  aprender: '<kbd>↑</kbd><kbd>↓</kbd> escolhe o capítulo · <kbd>←</kbd><kbd>→</kbd> anterior e próximo · <kbd>Esc</kbd> volta',
  selecao: '<kbd>←</kbd><kbd>→</kbd><kbd>↑</kbd><kbd>↓</kbd> escolhe a nave · <kbd>Esc</kbd> volta',
  naves: 'Arraste a nave para girar · <kbd>Esc</kbd> volta',
  config: '<kbd>Esc</kbd> volta',
};
/** As mesmas dicas com o controle (o rótulo segue o mapa: data-acao-rotulo). */
const DICAS_CONTROLE = {
  jogar: `${kbdAcao('uiCima')}${kbdAcao('uiBaixo')} escolhe o modo · ${kbdAcao('uiConfirmar')} entra`,
  aprender: `${kbdAcao('uiCima')}${kbdAcao('uiBaixo')} navega · ${kbdAcao('uiConfirmar')} abre · ${kbdAcao('uiVoltar')} volta`,
  selecao: `${kbdAcao('uiEsq')}${kbdAcao('uiDir')}${kbdAcao('uiCima')}${kbdAcao('uiBaixo')} navega · ${kbdAcao('uiConfirmar')} escolhe · ${kbdAcao('uiVoltar')} volta`,
  naves: `${kbdAcao('uiConfirmar')} escolhe · ${kbdAcao('uiVoltar')} volta`,
  config: `${kbdAcao('uiConfirmar')} troca a casa · ${kbdAcao('uiVoltar')} volta`,
};

const ARRASTO_RAD_POR_PX = 0.012;

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
const corCss = (cor) => '#' + new THREE.Color(cor).getHexString();
const escapar = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const num = (v, casas = 0) => v.toLocaleString('pt-BR', { maximumFractionDigits: casas });

/** Barras de status de uma nave na escala `max` (menu-regras.js, escalaStatus). */
function barrasNave(n, max) {
  const linhas = [
    ['HP', n.hp, max.hp, num(n.hp), 'hp'],
    ['Energia', n.energia, max.energia, num(n.energia), 'en'],
    ['Veloc.', n.velocidade, max.velocidade, `${Math.round(n.velocidade)} m/s`, 'vel'],
  ];
  // A regeneração de vida em voo é o traço das Bellico; nas outras raças fica zerada.
  if (n.regenHpVoo > 0) linhas.push(['Regen.', n.regenHpVoo, max.regenHpVoo, `${num(n.regenHpVoo, 1)}/s`, 'regen']);
  return `<div class="barras-nave">${linhas
    .map(
      ([nome, v, m, txt, k]) =>
        `<span class="stat ${k}"><em>${nome}</em><span class="trilho"><b style="width:${Math.max(3, Math.min(100, (v / (m || 1)) * 100))}%"></b></span><i>${txt}</i></span>`,
    )
    .join('')}</div>`;
}

/** As duas armas de fábrica da raça, com o ícone do original. */
function armasDeFabrica(race) {
  return `<ul class="armas-fabrica">${armasIniciais(race)
    .map((i) => {
      const w = WEAPONS[ARMAS[i]];
      const tipo = SIGLA_TIPO[w.tipoDano] ?? '';
      return `<li>${htmlIcone(w.icone, 1)}<span class="nome-arma"><b>${escapar(w.nome)}</b><small>${CATEGORIAS[w.categoria] ?? ''}${tipo ? ` · ${tipo}` : ''}</small></span></li>`;
    })
    .join('')}</ul>`;
}

/** Imagem da miniatura num <img> (placeholder enquanto não chega; some se falhar). */
function pintarMiniatura(img, race, classe, tier) {
  const chave = `${race}/${classe}/${tier}`;
  img.dataset.chave = chave;
  img.classList.add('carregando');
  miniatura(race, classe, tier).then((url) => {
    if (img.dataset.chave !== chave) return;
    img.classList.remove('carregando');
    if (url) img.src = url;
    else img.classList.add('falhou');
  });
}

export class Menu {
  /**
   * @param {{ el: HTMLElement, sons: import('./sons.js').Sons, painelVolume: PainelVolume,
   *   aoMudarSom: () => void,
   *   aoDecolar: (pedido: { nome: string, race: string, classe: string, teste: boolean, ia: object }) => Promise<void> }} op
   *   `aoDecolar` resolve quando a partida começou e rejeita com o erro (Error.message
   *   'cancelado' quando o piloto cancelou o carregamento) para o menu mostrar.
   */
  constructor({ el, sons, painelVolume, aoMudarSom, aoDecolar, mensagemErro }) {
    this.el = el;
    this.sons = sons;
    this.aoDecolar = aoDecolar;
    this.mensagemErro = mensagemErro;
    const g = estadoGuardado(ler);
    this.aba = g.aba;
    this.modo = g.modo;
    this.raca = g.raca;
    this.classe = g.classe;
    this.destaque = g.destaque; // a nave da aba Jogar escolhida no Hangar (null: a sorteada)
    // Sem destaque, a aba Jogar mostra uma das NAVES_VITRINE, sorteada a cada abertura
    // do site e diferente da última (guardada no navegador).
    this.sorteada = sortearVitrine(Math.random, ler(CHAVES.vitrine));
    gravar(CHAVES.vitrine, textoDestaque(this.sorteada));
    this.tela = g.aba;
    this.catalogo = { raca: g.raca, classe: g.classe, tier: 0 };
    this.secao = 'som';
    this.decolando = false;

    this.q = (s) => el.querySelector(s);
    this.nome = this.q('#nome');
    this.nome.value = g.nome;
    this.nome.addEventListener('input', () => {
      gravar(CHAVES.nome, this.nome.value);
      this.times.definirVoce({ nome: this.nome.value.trim() });
      if (this.#filaAtiva()) this.fila.escolher(this.#escolha());
    });
    this.nome.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.nome.blur();
    });

    this.q('#botao-som').addEventListener('click', () => painelVolume.abrir());
    this.volumeConfig = new PainelVolume({ sons, aoMudarSom, el: this.q('#config-som'), fundo: false });

    this.times = new EscolhaTimes(this.q('#escolha-times'), {
      miniatura,
      // 3 contra 3, procurando: a vaga livre do outro time troca de time.
      aoTrocarTime: () => {
        this.#som(SONS_INTERFACE.clique, 0.6);
        this.fila.trocarTime();
      },
    });
    this.times.definirVoce({ nome: g.nome.trim() });

    // Filas online: a conexão fica aberta com o menu (contagem em tempo real na aba
    // Jogar) e leva a fila, a escolha e o Pronto da Seleção.
    this.estadoFila = estadoFilaVazio();
    this.contagemFila = null;
    this.fila = new ConexaoFila({
      aoContagem: (c) => {
        this.contagemFila = c;
        this.#mostrarContagem();
      },
      aoEstado: (e) => this.#mudouFila(e),
    });
    this.fila.ligar();
    this.relogioFila = setInterval(() => this.#tiqueFila(), RELOGIO_FILA_MS);

    this.#montarAbas();
    this.comoJogar = new ComoJogar(this.q('#tela-aprender'), {
      aoPraticar: (modo) => this.#escolherModo(modo),
      aoSom: () => this.#som(SONS_INTERFACE.clique),
      aoProgresso: () => this.#mostrarNovidade(),
    });
    this.q('.convite-aprender').addEventListener('click', () => {
      this.#som(SONS_INTERFACE.clique);
      this.mostrar('aprender');
      this.#focarTela();
    });
    this.#mostrarNovidade();
    this.#montarModos();
    this.#montarSelecao();
    this.#montarNaves();
    this.#montarConfig();
    this.#sonsDeInterface();
    this.mostrar(this.tela);
  }

  // ---------- Navegação ----------

  /** Abre uma tela: o id de uma aba ou 'selecao'. */
  mostrar(tela) {
    const aba = tela === 'selecao' ? 'jogar' : tela;
    const antes = this.tela;
    // Sair da Seleção sai da fila (numa sala, a desfaz); entrar nela num modo de fila
    // já entra na fila.
    if (antes === 'selecao' && tela !== 'selecao' && this.estadoFila.fase !== 'fora') this.fila.sair();
    this.tela = tela;
    this.aba = aba;
    gravar(CHAVES.aba, aba);
    this.el.dataset.tela = tela;
    for (const s of this.el.querySelectorAll('.tela-menu')) {
      const aberta = s.id === `tela-${tela}`;
      if (aberta && s.hidden) {
        s.classList.remove('entrando');
        void s.offsetWidth; // reinicia a animação de entrada
        s.classList.add('entrando');
      }
      s.hidden = !aberta;
    }
    for (const b of this.el.querySelectorAll('.abas-menu [data-aba]')) {
      const sel = b.dataset.aba === aba;
      b.classList.toggle('sel', sel);
      b.setAttribute('aria-selected', String(sel));
      b.tabIndex = sel ? 0 : -1;
    }
    // As duas dicas; o CSS mostra a do aparelho em uso (html[data-aparelho]).
    this.q('.menu-rodape .dicas').innerHTML = `<span class="dica-teclado">${DICAS[tela] ?? ''}</span><span class="dica-controle">${DICAS_CONTROLE[tela] ?? ''}</span>`;
    pintarRotulos(this.q('.menu-rodape'));
    if (tela !== 'config') cancelarCaptura();
    this.#atualizarPrevia();
    if (tela === 'config') this.volumeConfig.atualizar();
    if (tela === 'selecao') this.#atualizarSelecao();
    if (tela === 'naves') this.#atualizarNaves();
    if (tela === 'aprender') this.comoJogar.mostrar();
    const fila = tela === 'selecao' ? filaDoModo(this.modo) : null;
    this.times.mostrarFila(fila, this.estadoFila);
    if (tela === 'selecao') this.mapa.mostrar(timeDoPiloto(fila, this.estadoFila));
    if (fila && antes !== 'selecao' && !this.decolando) {
      this.q('#erro-entrada').textContent = '';
      this.fila.entrar(fila, this.#escolha());
    }
    this.#pintarBotao();
  }

  /** ESC no menu: volta um passo (a Seleção para os modos, as outras abas para Jogar). */
  voltar() {
    if (this.decolando) return false;
    const antes = telaAnterior(this.tela);
    if (!antes) return false;
    this.#som(SONS_INTERFACE.clique, 0.5);
    this.mostrar(antes);
    this.#focarTela();
    return true;
  }

  /**
   * Mostra o menu (saiu da partida, ou o JOGAR da tela de abertura): a aba `tela`
   * (Jogar, a não ser na abertura, que volta à aba de antes), Decolar liberado.
   */
  abrir(tela = 'jogar') {
    this.decolando = false;
    this.q('#erro-entrada').textContent = '';
    this.fila.ligar();
    this.el.hidden = false;
    this.mostrar(tela);
    this.#focarTela();
  }

  /** Para a nave 3D (o menu vai sumir). */
  pausar() {
    pararPrevia();
  }

  #focarTela() {
    const alvo =
      this.tela === 'jogar'
        ? this.q(`.modo[data-modo="${this.modo}"]`)
        : this.tela === 'selecao'
          ? this.q(`.carta-nave[data-raca="${this.raca}"][data-classe="${this.classe}"]`)
          : this.tela === 'aprender'
            ? this.comoJogar.focoInicial
            : this.q('.abas-menu .sel');
    alvo?.focus({ preventScroll: true });
  }

  /** A nave 3D no palco da tela aberta. */
  #atualizarPrevia() {
    this.#pintarFundo();
    const palco = { jogar: '#fundo-nave', selecao: '.selecao-centro .palco-nave', naves: '.naves-visor .palco-nave' }[this.tela];
    if (!palco) {
      pararPrevia();
      return;
    }
    const { raca, classe, tier } =
      this.tela === 'naves' ? this.catalogo : this.tela === 'jogar' ? naveDaVitrine(this.destaque, this.sorteada) : { raca: this.raca, classe: this.classe, tier: 0 };
    mostrarPrevia(this.q(palco), raca, classe, tier);
  }

  #som(nome, volume = 0.6, tom = 1) {
    this.sons.tocarInterface(nome, { volume, tom });
  }

  /** Clique baixo no hover e no clique dos botões do menu (sem repetir no mesmo). */
  #sonsDeInterface() {
    let ultimo = null;
    this.el.addEventListener('pointerover', (e) => {
      const b = e.target.closest('button:not(:disabled), .modo:not(.bloqueado)');
      if (!b || b === ultimo) return;
      ultimo = b;
      this.#som(SONS_INTERFACE.clique, 0.18, 1.5);
    });
    this.el.addEventListener('pointerout', (e) => {
      if (ultimo && !ultimo.contains(e.relatedTarget)) ultimo = null;
    });
  }

  // ---------- Header ----------

  #montarAbas() {
    const nav = this.q('.abas-menu');
    nav.innerHTML = ABAS.map(
      (a) =>
        `<button type="button" role="tab" data-aba="${a.id}"${a.bloqueada ? ` class="bloqueada" aria-disabled="true" title="${a.dica}"` : ''}>${a.nome}${
          a.bloqueada ? '<span class="selo-breve">EM BREVE</span>' : ''
        }</button>`,
    ).join('');
    const abrir = (id) => {
      if (this.decolando || id === this.aba) return;
      this.#som(SONS_INTERFACE.clique);
      this.mostrar(id);
    };
    nav.addEventListener('click', (e) => {
      const b = e.target.closest('[data-aba]');
      if (b && !b.classList.contains('bloqueada')) abrir(b.dataset.aba);
    });
    // Setas no header: aba vizinha, pulando as bloqueadas.
    nav.addEventListener('keydown', (e) => {
      const passo = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
      if (!passo) return;
      e.preventDefault();
      const livres = ABAS.filter((a) => !a.bloqueada).map((a) => a.id);
      const i = livres.indexOf(this.aba);
      const id = livres[(i + passo + livres.length) % livres.length];
      abrir(id);
      nav.querySelector(`[data-aba="${id}"]`).focus();
    });
  }

  /**
   * Piloto que ainda não leu nada da trilha: o convite "Primeira vez?" na aba Jogar.
   * Leu um capítulo, ele some.
   */
  #mostrarNovidade() {
    this.q('.convite-aprender').hidden = this.comoJogar.progresso.lidos > 0;
  }

  // ---------- Jogar ----------

  #montarModos() {
    const lista = this.q('.modos');
    lista.innerHTML = MODOS.map((m) => {
      const bloqueado = !m.disponivel;
      return `<button type="button" role="listitem" class="modo${bloqueado ? ' bloqueado' : ''}" data-modo="${m.id}"${bloqueado ? ' aria-disabled="true"' : ''}>
        <strong>${m.titulo}</strong>
        <span class="estado-modo"><span class="texto-estado">${m.estado}</span>${bloqueado ? '<span class="selo-breve">EM BREVE</span>' : ''}</span>
        <span class="texto-modo">${m.texto}</span>
      </button>`;
    }).join('');
    lista.addEventListener('click', (e) => {
      const b = e.target.closest('.modo');
      if (b && !b.classList.contains('bloqueado')) this.#escolherModo(b.dataset.modo);
    });
    lista.addEventListener('keydown', (e) => {
      const passo = { ArrowDown: 1, ArrowUp: -1 }[e.key];
      if (!passo) return;
      e.preventDefault();
      const atual = e.target.closest('.modo')?.dataset.modo ?? this.modo;
      lista.querySelector(`[data-modo="${proximoModo(atual, passo)}"]`)?.focus();
    });
    this.#atualizarLegenda();
  }

  #escolherModo(id) {
    if (!pedidoDoModo(id)) return;
    this.modo = id;
    gravar(CHAVES.modo, id);
    this.#som(SONS_INTERFACE.painel, 0.7);
    this.mostrar('selecao');
    this.#focarTela();
  }

  /** A legenda da nave da aba Jogar e o nome da raça no fundo. */
  /**
   * A legenda da nave da aba Jogar e o nome da raça no fundo: a nave em destaque do
   * Hangar ou, sem ela, a sorteada nesta abertura (as duas com "EM DESTAQUE").
   */
  #atualizarLegenda() {
    const { raca, classe, tier } = naveDaVitrine(this.destaque, this.sorteada);
    const n = naveDe(raca, classe, tier);
    const leg = this.q('#tela-jogar .legenda-nave');
    leg.querySelector('small').textContent = 'Em destaque';
    leg.querySelector('.nome-nave').textContent = n.nome;
    leg.querySelector('.raca-classe').innerHTML = `<b style="color:${corCss(RACES[raca].cor)}">${RACES[raca].nome}</b> · ${CLASSES[classe].nome}`;
    this.q('#fundo-nave').dataset.raca = RACES[raca].nome;
  }

  /**
   * O céu do menu na cor da raça da nave que a tela aberta mostra: na aba Jogar, a em
   * destaque (ou a sorteada); na Seleção, a escolhida; no Hangar, a aberta; nas
   * Configurações, a da aba Jogar.
   */
  #pintarFundo() {
    const raca = this.tela === 'naves' ? this.catalogo.raca : this.tela === 'selecao' ? this.raca : naveDaVitrine(this.destaque, this.sorteada).raca;
    this.el.style.setProperty('--cor-raca', corCss(RACES[raca].cor));
  }

  /** Põe (ou tira, se já é ela) a nave do Hangar em destaque na aba Jogar. */
  #alternarDestaque() {
    this.destaque = mesmaNave(this.destaque, this.catalogo) ? null : { ...this.catalogo };
    const texto = textoDestaque(this.destaque);
    if (texto) gravar(CHAVES.destaque, texto);
    else {
      try {
        localStorage.removeItem(CHAVES.destaque);
      } catch {}
    }
    this.#som(this.destaque ? SONS_INTERFACE.compra : SONS_INTERFACE.clique, 0.6);
    this.#atualizarLegenda();
    this.#pintarFundo();
    this.#mostrarBotaoDestaque();
  }

  /** O botão da ficha do Hangar diz se a nave aberta é a que está em destaque. */
  #mostrarBotaoDestaque() {
    const b = this.q('#tela-naves .botao-destaque');
    if (!b) return;
    const e = mesmaNave(this.destaque, this.catalogo);
    b.classList.toggle('ativo', e);
    b.setAttribute('aria-pressed', String(e));
    b.querySelector('span').textContent = e ? 'Em destaque na tela Jogar' : 'Mostrar na tela Jogar';
    b.title = e ? 'Clique para voltar a mostrar a nave da Seleção' : 'Esta nave passa a aparecer na aba Jogar';
  }

  // ---------- Seleção ----------

  #montarSelecao() {
    const grade = this.q('.selecao-grade');
    const linhas = Object.keys(RACES).map((r) => {
      const raca = RACES[r];
      const cor = corCss(raca.cor);
      if (RACAS_BLOQUEADAS.includes(r)) {
        return `<div class="linha-raca bloqueada" style="--cor:${cor}"><p class="nome-raca"><b>${raca.nome}</b><small>${raca.bioma}</small><span class="selo-breve">EM BREVE</span></p></div>`;
      }
      const cartas = ORDEM_CLASSES.map(
        (c) => `<button type="button" role="gridcell" class="carta-nave" data-raca="${r}" data-classe="${c}" aria-label="${raca.nome} ${CLASSES[c].nome}: ${naveDe(r, c, 0).nome}">
          <img alt="" draggable="false"><strong>${CLASSES[c].nome}</strong><small>${CLASSES[c].especialidade}</small>
        </button>`,
      ).join('');
      return `<div class="linha-raca" role="row" style="--cor:${cor}"><p class="nome-raca"><b>${raca.nome}</b><small>${raca.bioma}</small></p><div class="cartas-raca">${cartas}</div></div>`;
    });
    grade.innerHTML = linhas.join('');
    this.primeirasMontadas = false;
    this.mapa = new MapaSelecao(this.q('.mapa-partida'));
    grade.addEventListener('click', (e) => {
      const b = e.target.closest('.carta-nave');
      if (b) this.#escolherNave(b.dataset.raca, b.dataset.classe);
    });
    grade.addEventListener('keydown', (e) => {
      const d = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] }[e.key];
      if (!d) return;
      e.preventDefault();
      const { raca, classe } = moverNaGrade(this.raca, this.classe, d[0], d[1]);
      this.#escolherNave(raca, classe);
      grade.querySelector(`.carta-nave[data-raca="${raca}"][data-classe="${classe}"]`)?.focus();
    });
    this.q('#tela-selecao .voltar').addEventListener('click', () => this.voltar());
    this.q('.decolar').addEventListener('click', () => this.#decolar());
  }

  #escolherNave(raca, classe) {
    if (this.decolando || this.#naveTravada() || (raca === this.raca && classe === this.classe)) return;
    this.raca = raca;
    this.classe = classe;
    gravar(CHAVES.raca, raca);
    gravar(CHAVES.classe, classe);
    this.catalogo = { raca, classe, tier: 0 };
    this.#som(SONS_INTERFACE.clique);
    this.#atualizarSelecao();
    this.#atualizarLegenda();
    this.#atualizarPrevia();
    if (this.#filaAtiva()) this.fila.escolher(this.#escolha());
  }

  #atualizarSelecao() {
    const tela = this.q('#tela-selecao');
    // Miniaturas da grade: só na primeira vez que a Seleção abre (9 naves pequenas).
    if (!this.primeirasMontadas) {
      this.primeirasMontadas = true;
      for (const img of tela.querySelectorAll('.carta-nave img')) {
        const b = img.closest('.carta-nave');
        pintarMiniatura(img, b.dataset.raca, b.dataset.classe, 0);
      }
    }
    for (const b of tela.querySelectorAll('.carta-nave')) {
      const sel = b.dataset.raca === this.raca && b.dataset.classe === this.classe;
      b.classList.toggle('sel', sel);
      b.setAttribute('aria-selected', String(sel));
      b.tabIndex = sel ? 0 : -1;
    }
    const modo = modoPorId(this.modo);
    const selo = tela.querySelector('.selo-modo');
    selo.textContent = modo?.selo ?? '';
    selo.classList.toggle('sandbox', this.modo === 'sandbox');

    const cor = corCss(RACES[this.raca].cor);
    tela.style.setProperty('--cor', cor);
    const linha = linhaDe(this.raca, this.classe);
    const n = linha[0];
    tela.querySelector('.nome-escolha .nome-nave').textContent = n.nome;
    tela.querySelector('.nome-escolha .raca-classe').innerHTML = `<b>${RACES[this.raca].nome}</b> · ${CLASSES[this.classe].nome}`;
    const evol = tela.querySelector('.linha-evolucao');
    evol.innerHTML = linha
      .map(
        (nave, i) => `<li class="${i === 0 ? 'atual' : ''}" title="${nave.nome}${i ? `: na Evolução no nível ${nave.nivel}` : ': sua primeira nave'}">
          <img alt="" draggable="false"><span>${escapar(nave.nome)}</span><small>${i ? `NV ${nave.nivel}` : 'Inicial'}</small></li>`,
      )
      .join('');
    evol.querySelectorAll('img').forEach((img, i) => pintarMiniatura(img, this.raca, this.classe, i));

    const ficha = tela.querySelector('.selecao-ficha');
    this.escalaPrimeiras ??= escalaStatus(primeirasNaves());
    ficha.innerHTML = `
      <p class="rotulo-ficha">Raça</p>
      <h2 class="nome-raca-ficha">${RACES[this.raca].nome} <small>${RACES[this.raca].bioma}</small></h2>
      <p class="descricao">${DESCRICAO_RACA[this.raca] ?? ''}</p>
      <p class="rotulo-ficha">Classe</p>
      <h2>${CLASSES[this.classe].nome} <small>${CLASSES[this.classe].especialidade}</small></h2>
      ${barrasNave(n, this.escalaPrimeiras)}`;

    // A sua vaga nos times leva a miniatura da nave escolhida.
    const chave = `${this.raca}/${this.classe}`;
    this.chaveVoce = chave;
    miniatura(this.raca, this.classe, 0).then((img) => {
      if (this.chaveVoce === chave) this.times.definirVoce({ img, nome: this.nome.value.trim() });
    });
  }

  async #decolar() {
    const pedido = pedidoDoModo(this.modo);
    if (!pedido || this.decolando) return;
    if (pedido.fila) {
      // Modo de fila: o botão procura partida de novo ou aperta Pronto.
      const { acao } = botaoDaFila(this.estadoFila);
      if (acao === 'entrar') {
        this.q('#erro-entrada').textContent = '';
        this.#som(SONS_INTERFACE.clique, 0.6);
        this.fila.entrar(pedido.fila, this.#escolha());
      } else if (acao === 'pronto') {
        this.#som(SONS_INTERFACE.compra, 0.7);
        this.fila.pronto(this.#escolha());
      } else if (acao === 'cancelar') {
        this.#som(SONS_INTERFACE.clique, 0.6);
        this.fila.cancelarPronto();
      }
      return;
    }
    this.decolando = true;
    const botao = this.q('.decolar');
    const erro = this.q('#erro-entrada');
    botao.disabled = true;
    botao.textContent = 'Conectando…';
    erro.textContent = '';
    gravar(CHAVES.nome, this.nome.value);
    // O foco num campo de texto prenderia as teclas da nave (controles.js ignora).
    document.activeElement?.blur();
    // A prévia para: a vitrine desenha as miniaturas da Evolução no carregamento.
    pararPrevia();
    this.#som(SONS_INTERFACE.painel, 0.8);
    try {
      await this.aoDecolar({ nome: this.nome.value, race: this.raca, classe: this.classe, ...pedido, ia: this.times.pedido });
      this.el.hidden = true;
      this.fila.desligar();
    } catch (err) {
      this.decolando = false;
      botao.disabled = false;
      botao.textContent = 'Decolar';
      this.mostrar('selecao');
      if (err?.message === 'cancelado') return;
      console.error('Falha ao entrar no jogo:', err);
      erro.textContent = this.mensagemErro(err);
    }
  }

  // ---------- Fila online ----------

  /** A Seleção está aberta num modo de fila. */
  #filaAtiva() {
    return this.tela === 'selecao' && !!filaDoModo(this.modo);
  }

  /** Depois do Pronto, a nave não muda mais (como o "travar campeão" dos MOBAs). */
  #naveTravada() {
    const e = this.estadoFila;
    return this.#filaAtiva() && (e.fase === 'comecar' || ((e.fase === 'sala' || e.fase === 'procurando') && !!e.voce?.pronto));
  }

  /** O que a fila leva da Seleção. */
  #escolha() {
    return { nome: this.nome.value.trim(), race: this.raca, classe: this.classe };
  }

  /** A contagem real das filas na linha de estado dos modos da aba Jogar. */
  #mostrarContagem() {
    for (const m of MODOS) {
      if (!m.fila) continue;
      const el = this.q(`.modo[data-modo="${m.id}"] .estado-modo .texto-estado`);
      if (el) el.textContent = textoContagemModo(this.contagemFila?.[m.fila]) ?? m.estado;
    }
  }

  /** Chegou um estado novo da fila (fila.js). */
  #mudouFila(e) {
    const antes = this.estadoFila;
    this.estadoFila = e;
    if (!this.#filaAtiva()) return;
    this.times.mostrarFila(filaDoModo(this.modo), e);
    // No 3 contra 3 a sua base é a do time em que você está (troca de time troca a base).
    this.mapa.mostrar(timeDoPiloto(filaDoModo(this.modo), e));
    if (e.fase === 'sala' && e.nova) {
      // Sala formada: o som de alerta, o foco no Pronto e o título da aba piscando se
      // o piloto estava em outra janela (como o "partida encontrada" dos MOBAs).
      this.#som(SONS_INTERFACE.alerta, 0.9);
      this.q('.decolar').focus({ preventScroll: true });
      if (document.hidden) this.#avisarNoTitulo();
    }
    if (e.fase === 'procurando' && antes.fase === 'sala') this.#som(SONS_INTERFACE.erro, 0.5);
    // O grupo chegou ao mínimo (um em cada time no 3 contra 3, dois na pública): já dá
    // para começar mais cedo (o Pronto acende).
    if (e.fase === 'procurando' && e.cedo && !e.voce?.pronto && !(antes.fase === 'procurando' && antes.cedo)) {
      this.#som(SONS_INTERFACE.alerta, 0.7);
      if (document.hidden) this.#avisarNoTitulo();
    }
    if (e.fase === 'fora' && e.aviso === 'sem_pronto') this.#som(SONS_INTERFACE.erro, 0.6);
    this.#pintarBotao();
    if (e.fase === 'comecar') this.#decolarNaSala(e);
  }

  /** O título da aba avisa a sala formada até o piloto voltar para ela. */
  #avisarNoTitulo() {
    if (document.title === TITULO_ACHOU) return;
    const original = document.title;
    document.title = TITULO_ACHOU;
    const voltar = () => {
      if (document.hidden) return;
      document.title = original;
      document.removeEventListener('visibilitychange', voltar);
    };
    document.addEventListener('visibilitychange', voltar);
  }

  /** O botão Decolar, a linha da fila e o aviso, do modo e do estado da fila. */
  #pintarBotao() {
    const botao = this.q('.decolar');
    const linha = this.q('.estado-fila');
    const aviso = this.q('.aviso-fila');
    const tela = this.q('#tela-selecao');
    if (!this.#filaAtiva()) {
      if (!this.decolando) {
        botao.disabled = false;
        botao.textContent = 'Decolar';
      }
      botao.classList.remove('aguardando', 'pronto-acao', 'cancelar-pronto');
      linha.hidden = true;
      aviso.textContent = '';
      tela.classList.remove('travada');
      return;
    }
    const b = botaoDaFila(this.estadoFila);
    botao.textContent = b.texto;
    botao.disabled = !b.habilitado;
    // Pronto apertado: o botão segue com o fio de "esperando os outros", mas clicável
    // para desfazer o Pronto.
    botao.classList.toggle('aguardando', (!b.habilitado || b.acao === 'cancelar') && ['procurando', 'sala', 'conectando'].includes(this.estadoFila.fase));
    botao.classList.toggle('cancelar-pronto', b.acao === 'cancelar');
    botao.classList.toggle('pronto-acao', b.acao === 'pronto');
    tela.classList.toggle('travada', this.#naveTravada());
    aviso.textContent = textoAviso(this.estadoFila.aviso) ?? '';
    this.#tiqueFila();
  }

  /** O relógio da linha da fila: a espera procurando e o contador da sala. */
  #tiqueFila() {
    if (!this.#filaAtiva() || this.el.hidden) return;
    const l = linhaDaFila(this.estadoFila, performance.now(), SELECAO_S);
    const linha = this.q('.estado-fila');
    linha.hidden = !l.texto;
    linha.classList.toggle('urgente', l.urgente);
    linha.classList.toggle('com-barra', l.fracao !== null);
    linha.querySelector('.texto').textContent = l.texto;
    linha.querySelector('.contador').textContent = l.contador ?? '';
    linha.querySelector('.barra-fila b').style.width = `${(l.fracao ?? 0) * 100}%`;
    // Os últimos segundos sem Pronto: a contagem do original, uma vez por segundo.
    if (l.urgente && this.estadoFila.fase === 'sala' && !this.estadoFila.voce?.pronto && l.contador !== this.ultimoContador) this.#som(SONS_INTERFACE.contagem, 0.5);
    this.ultimoContador = l.contador;
  }

  /** Todos prontos: decola para a vaga da sala, com a nave travada nela. */
  async #decolarNaSala(e) {
    if (this.decolando) return;
    this.decolando = true;
    const erro = this.q('#erro-entrada');
    erro.textContent = '';
    document.activeElement?.blur();
    pararPrevia();
    this.#som(SONS_INTERFACE.painel, 0.8);
    try {
      await this.aoDecolar({ nome: e.nome, race: e.race, classe: e.classe, sala: e.sala, token: e.token });
      this.el.hidden = true;
      this.fila.desligar();
    } catch (err) {
      this.decolando = false;
      this.estadoFila = { fase: 'fora', modo: e.modo, aviso: null };
      this.mostrar('selecao');
      if (err?.message === 'cancelado') return;
      console.error('Falha ao entrar na partida da fila:', err);
      erro.textContent = this.mensagemErro(err);
    }
  }

  // ---------- Naves (hangar) ----------

  #montarNaves() {
    const tela = this.q('#tela-naves');
    tela.querySelector('.filtro-racas').innerHTML = Object.entries(RACES)
      .map(([r, raca]) => {
        const bloqueada = RACAS_BLOQUEADAS.includes(r);
        return `<button type="button" data-raca="${r}" style="--cor:${corCss(raca.cor)}"${bloqueada ? ' disabled title="Ainda não liberada"' : ''}>${raca.nome}${
          bloqueada ? '<span class="selo-breve">EM BREVE</span>' : ''
        }</button>`;
      })
      .join('');
    tela.querySelector('.filtro-classes').innerHTML = ORDEM_CLASSES.map((c) => `<button type="button" data-classe="${c}">${CLASSES[c].nome}</button>`).join('');
    tela.querySelector('.naves-topo').addEventListener('click', (e) => {
      const b = e.target.closest('button:not(:disabled)');
      if (!b) return;
      const { raca = this.catalogo.raca, classe = this.catalogo.classe } = b.dataset;
      if (raca === this.catalogo.raca && classe === this.catalogo.classe) return;
      this.catalogo = { raca, classe, tier: 0 };
      this.#som(SONS_INTERFACE.clique);
      this.#atualizarNaves();
      this.#atualizarPrevia();
    });
    tela.querySelector('.naves-ficha').addEventListener('click', (e) => {
      if (e.target.closest('.botao-destaque')) this.#alternarDestaque();
    });
    tela.querySelector('.naves-linha').addEventListener('click', (e) => {
      const li = e.target.closest('[data-tier]');
      if (!li || Number(li.dataset.tier) === this.catalogo.tier) return;
      this.catalogo.tier = Number(li.dataset.tier);
      this.#som(SONS_INTERFACE.clique);
      this.#atualizarNaves();
      this.#atualizarPrevia();
    });

    // Arrastar no visor gira a nave (mouse e dedo).
    const visor = tela.querySelector('.naves-visor');
    let x0 = null;
    visor.addEventListener('pointerdown', (e) => {
      x0 = e.clientX;
      visor.setPointerCapture(e.pointerId);
      visor.classList.add('arrastando');
      segurarPrevia(true);
    });
    visor.addEventListener('pointermove', (e) => {
      if (x0 === null) return;
      girarPrevia((e.clientX - x0) * ARRASTO_RAD_POR_PX);
      x0 = e.clientX;
    });
    const soltar = () => {
      x0 = null;
      visor.classList.remove('arrastando');
      segurarPrevia(false);
    };
    visor.addEventListener('pointerup', soltar);
    visor.addEventListener('pointercancel', soltar);
  }

  #atualizarNaves() {
    const tela = this.q('#tela-naves');
    const { raca, classe, tier } = this.catalogo;
    tela.style.setProperty('--cor', corCss(RACES[raca].cor));
    for (const b of tela.querySelectorAll('.filtro-racas button')) b.classList.toggle('sel', b.dataset.raca === raca);
    for (const b of tela.querySelectorAll('.filtro-classes button')) b.classList.toggle('sel', b.dataset.classe === classe);

    const linha = linhaDe(raca, classe);
    const lista = tela.querySelector('.naves-linha');
    const chaveLinha = `${raca}/${classe}`;
    if (lista.dataset.linha !== chaveLinha) {
      lista.dataset.linha = chaveLinha;
      lista.innerHTML = linha
        .map(
          (n, i) => `<li><button type="button" data-tier="${i}"><img alt="" draggable="false"><strong>${escapar(n.nome)}</strong>
            <small>${i ? `NV ${n.nivel} · <b class="preco">${num(n.preco)} de ouro</b>` : 'Nave inicial'}</small></button></li>`,
        )
        .join('');
      lista.querySelectorAll('img').forEach((img, i) => pintarMiniatura(img, raca, classe, i));
    }
    for (const b of lista.querySelectorAll('[data-tier]')) b.classList.toggle('sel', Number(b.dataset.tier) === tier);

    const n = linha[tier];
    this.escalaTodas ??= escalaStatus(navesJogaveis());
    const ficha = tela.querySelector('.naves-ficha');
    ficha.innerHTML = `
      <p class="rotulo-ficha">${RACES[raca].nome} · ${CLASSES[classe].nome} · nave ${tier + 1} de ${linha.length}</p>
      <h2 class="nome-nave-ficha">${escapar(n.nome)}</h2>
      <button type="button" class="botao-destaque" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.9z" /></svg><span></span></button>
      <dl class="dados-nave">
        <div><dt>Na Evolução</dt><dd>${tier ? `nível ${n.nivel} · <b class="preco">${num(n.preco)} de ouro</b>` : 'Nave inicial'}</dd></div>
        <div><dt>Tamanho</dt><dd class="tamanho">…</dd></div>
        <div><dt>Especialidade</dt><dd>${CLASSES[classe].especialidade}</dd></div>
      </dl>
      <p class="rotulo-ficha">Status <small>(régua das 45 naves)</small></p>
      ${barrasNave(n, this.escalaTodas)}
      <p class="rotulo-ficha">Armas de fábrica</p>
      ${armasDeFabrica(raca)}`;
    this.#mostrarBotaoDestaque();
    // Tamanho real: a caixa do modelo já na escala do jogo (nave.js), em metros.
    const chave = `${raca}/${classe}/${tier}`;
    this.chaveCatalogo = chave;
    modeloDaNave(raca, classe, tier)
      .then(({ caixa }) => {
        if (this.chaveCatalogo !== chave) return;
        const comp = caixa.max.z - caixa.min.z;
        const larg = caixa.max.x - caixa.min.x;
        ficha.querySelector('.tamanho').textContent = `${num(comp, 1)} × ${num(larg, 1)} m`;
      })
      .catch(() => {
        if (this.chaveCatalogo === chave) ficha.querySelector('.tamanho').textContent = '—';
      });
  }

  // ---------- Configurações ----------

  #montarConfig() {
    const tela = this.q('#tela-config');
    tela.querySelector('.config-secoes').addEventListener('click', (e) => {
      const b = e.target.closest('[data-secao]:not(:disabled)');
      if (!b || b.dataset.secao === this.secao) return;
      this.secao = b.dataset.secao;
      cancelarCaptura();
      this.#som(SONS_INTERFACE.clique);
      for (const x of tela.querySelectorAll('.config-secoes [data-secao]')) x.classList.toggle('sel', x === b);
      for (const p of tela.querySelectorAll('.config-painel')) p.hidden = p.dataset.secao !== this.secao;
      if (this.secao === 'som') this.volumeConfig.atualizar();
    });

    // As listas de atalhos (atalhos.js): uma casa por tecla ou botão de cada ação;
    // clicar espera a entrada nova (capturar), o botão direito apaga. No teclado, a
    // entrada nova pode ser um clique (o botão do mouse: atalhos.js engole o clique
    // inteiro), então o clique na casa que espera vira o clique esquerdo; Esc cancela.
    for (const lista of tela.querySelectorAll('.lista-atalhos')) {
      const disp = lista.dataset.disp;
      const painel = lista.closest('.config-atalhos');
      const aviso = painel.querySelector('.aviso-atalhos');
      lista.addEventListener('click', (e) => {
        const casa = e.target.closest('.casa-atalho:not(:disabled)');
        if (!casa) return;
        const { acao } = casa.dataset;
        const i = Number(casa.dataset.i);
        if (casa.classList.contains('esperando')) return cancelarCaptura();
        this.#som(SONS_INTERFACE.clique, 0.6);
        aviso.textContent = '';
        clearTimeout(this.tempoCaptura);
        capturar(disp, acao, i, (r) => {
          clearTimeout(this.tempoCaptura);
          this.#desenharAtalhos();
          if (r.entrada) {
            const nome = disp === 'teclado' ? nomeTecla(r.entrada) : nomeEntrada(r.entrada, true);
            aviso.textContent = r.tirouDe ? `${nome} saiu de "${ACAO[r.tirouDe].nome}" e agora é "${ACAO[acao].nome}".` : `${nome}: ${ACAO[acao].nome}.`;
            // O foco volta à casa (o controle segue dali).
            lista.querySelector(`.casa-atalho[data-acao="${acao}"][data-i="${Math.min(i, mapasAtuais()[disp][acao].length - 1)}"]`)?.focus();
          } else if (r.limpou) aviso.textContent = `"${ACAO[acao].nome}" ficou sem essa casa.`;
        });
        casa.classList.add('esperando');
        casa.textContent = disp === 'teclado' ? 'Tecla ou clique…' : 'Aperte o botão…';
        // O controle não tem Esc: a espera acaba sozinha.
        if (disp === 'controle') this.tempoCaptura = setTimeout(() => cancelarCaptura(), 8000);
      });
      lista.addEventListener('contextmenu', (e) => {
        const casa = e.target.closest('.casa-atalho:not(:disabled)');
        if (!casa) return;
        e.preventDefault();
        cancelarCaptura();
        if (casa.classList.contains('vazia')) return;
        limparAtalho(disp, casa.dataset.acao, Number(casa.dataset.i));
        aviso.textContent = `"${ACAO[casa.dataset.acao].nome}" ficou sem essa casa.`;
      });
      painel.querySelector('.restaurar-atalhos').addEventListener('click', () => {
        cancelarCaptura();
        restaurarPadrao(disp);
        this.#som(SONS_INTERFACE.clique);
        aviso.textContent = disp === 'teclado' ? 'Teclado de fábrica de volta.' : 'Controle de fábrica de volta.';
      });
    }
    aoMudarAtalhos(() => {
      if (!capturaAtual()) this.#desenharAtalhos();
    });
    aoMudarControle(() => this.#estadoControle());
    this.#desenharAtalhos();
    this.#estadoControle();
  }

  /** As duas listas de atalhos, do mapa em uso. */
  #desenharAtalhos() {
    const mapas = mapasAtuais();
    for (const lista of this.el.querySelectorAll('.lista-atalhos')) {
      const disp = lista.dataset.disp;
      // O teclado não lista a navegação dos menus (as setas, o Enter e o Esc de sempre).
      const grupos = GRUPOS_ACOES.filter((g) => disp === 'controle' || g.nome !== 'Menus');
      lista.innerHTML = grupos
        .map(
          (g) => `<section class="grupo-atalhos"><h3>${g.nome}</h3>${g.acoes
            .map((a) => {
              const casas = [];
              if (disp === 'teclado' && a.fixaTeclado) {
                casas.push(`<button type="button" class="casa-atalho fixa" disabled title="Esta tecla não muda">${escapar(a.fixaTeclado)}</button>`);
              } else {
                const atuais = mapas[disp][a.id] ?? [];
                for (let i = 0; i < ATALHOS_POR_ACAO; i++) {
                  const e = atuais[i];
                  // Uma casa vazia por vez: a segunda só aparece com a primeira cheia.
                  if (!e && i > atuais.length) break;
                  const nome = e ? (disp === 'teclado' ? nomeTecla(e) : nomeEntrada(e)) : '+';
                  const titulo = e ? (disp === 'teclado' ? `Tecla ${nomeTecla(e)}` : nomeEntrada(e, true)) : 'Acrescentar';
                  casas.push(
                    `<button type="button" class="casa-atalho${e ? '' : ' vazia'}" data-acao="${a.id}" data-i="${i}" title="${escapar(titulo)}: clique para trocar">${escapar(nome)}</button>`,
                  );
                }
              }
              return `<div class="linha-atalho"><span class="nome-acao">${escapar(a.nome)}</span><span class="casas">${casas.join('')}</span></div>`;
            })
            .join('')}</section>`,
        )
        .join('');
    }
  }

  /** A linha do controle ligado (ou de como ligar um). */
  #estadoControle() {
    const el = this.q('.estado-controle');
    if (!el) return;
    const pads = controlesLigados();
    if (!pads.length) {
      el.className = 'estado-controle desligado';
      el.textContent = 'Nenhum controle encontrado. Ligue o controle (USB ou Bluetooth) e aperte qualquer botão: o navegador só mostra o controle depois do primeiro botão.';
      return;
    }
    el.className = 'estado-controle ligado';
    el.textContent = pads
      .map((p) => `Controle ligado: ${p.id.replace(/\s*\(.*?Vendor.*?\)\s*/i, ' ').trim()} · ${p.botoes} botões${p.mapping === 'standard' ? '' : ' · sem o mapeamento padrão: confira as casas abaixo apertando os botões'}`)
      .join(' · ');
  }
}
