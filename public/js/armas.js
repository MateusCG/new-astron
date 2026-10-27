// Menu de armas: a nave tem duas armas, uma em cada encaixe (Z e X), e as duas
// aceitam qualquer arma da raça e da classe do piloto (armasDisponiveis em
// shared/armas.js: 18 a 28 armas do Astro-N original). Não existe arma principal: o
// mesmo menu edita os dois encaixes. Q abre (e fecha) o menu do Z, E o do X; com o
// menu de um aberto, a tecla do outro troca de encaixe. No celular, os botões ARMA Z
// e ARMA X fazem o mesmo, e os indicadores das armas no painel também abrem o menu
// do encaixe deles.
//
// Cada arma do piloto é um OBJETO do inventário (uma instância, com a sua versão V1
// a V8), e a mesma arma pode estar em duas cópias (ARMA_COPIAS_MAX, shared/loja.js):
// a mesma arma no Z e no X são duas cópias. O menu mostra uma carta por instância,
// cada uma com a versão dela; escolher a carta que está no outro encaixe troca os
// dois de lugar.
//
// Com tanta arma, o menu rola e se organiza assim: em cima as armas que o piloto
// POSSUI (as de fábrica da raça e as compradas na Loja, cada cópia), na ordem das
// categorias do original (feixe, metralhadora, canhão, míssil, mina, nova,
// dispositivo...), com as teclas 1 a 9 e 0 nas dez primeiras; embaixo, apagadas e
// agrupadas por categoria, as que ainda estão "NA LOJA". Escolher (clique, toque ou
// tecla) fecha o menu.
//
// O menu só guarda a escolha do piloto: os ids das instâncias vão nos campos `a` (Z)
// e `a2` (X) de cada comando e quem troca a arma de verdade é stepShip (no servidor
// e na predição, no mesmo passo). Instância que a nave não tem não chega a ser
// pedida; se chegar, o stepShip a troca pela de fábrica do encaixe. As instâncias e
// os encaixes vêm da nave prevista (nave(): s.armasInst = [[id, índice, nível]] e
// s.encInst, que o `me` traz), então o menu mostra o que a nave tem. O jogo não
// pausa com o menu aberto; só os tiros ficam travados enquanto ele está na tela. Os
// números das cartas saem da VERSÃO de cada instância, pelo resumoVersao de
// shared/armas.js, então balancear lá já atualiza o menu.
//
// Recarga de troca (TROCA_ARMA_S em shared/sim.js): fora da própria base, trocar a
// arma de um encaixe o trava por alguns segundos, e o stepShip ignora outra troca
// nele enquanto conta. O menu trava o encaixe enquanto conta (as outras cartas
// apagadas com a contagem; escolher só dá a notícia em aoRecusar). main.js passa a
// nave prevista a cada passo (nave()), e o menu sempre mostra a arma que a nave tem.
//
// Daqui saem também o ícone, a cor, a descrição e as etiquetas de cada arma para o
// painel da Loja (servicos.js) e o painel inferior (hud.js).

import { WEAPONS, ARMAS, TROCA_ARMA_S, TIPOS_DANO, trocaLivre, armasIniciais, armasDisponiveis } from '/shared/sim.js';
import { versaoArma, resumoVersao, visualEfeito, CATEGORIAS, ORDEM_CATEGORIAS, PAPEIS, NIVEL_ARMA_MAX } from '/shared/armas.js';
import { htmlIcone } from './icones-itens.js';

/** Tecla, nome e botões de cada encaixe (0 = Z, 1 = X). */
export const ENCAIXES = [
  { tecla: 'Z', menu: 'KeyQ', letraMenu: 'Q', botoes: ['#btn-arma-z', '#arma-z'] },
  { tecla: 'X', menu: 'KeyE', letraMenu: 'E', botoes: ['#btn-arma-x', '#arma-x'] },
];
// 1 a 9 e o 0 para a décima arma possuída.
const TECLAS_OPCAO = Array.from({ length: 10 }, (_, i) => {
  const n = (i + 1) % 10;
  return [`Digit${n}`, `Numpad${n}`];
});

const numero = (v, casas = 0) => v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
/** Número com uma casa só quando precisa ("2", "2,4"). */
const um = (v) => numero(v, Number.isInteger(+(+v).toFixed(1)) ? 0 : 1);

// Cor de cada arma na interface: a cor do projétil do original (textura do efeito),
// clareada para ler bem sobre a chapa escura. Dispositivos não têm projétil: a cor
// vem do efeito (CORES_DISPOSITIVO).
const LUZ_MIN = 0.62;
const CORES_DISPOSITIVO = {
  invisivel: '#b9c6d6',
  acelera: '#7fd8ff',
  energiaPorHp: '#3fa9ff',
  invulneravel: '#ffe28a',
  escudo: '#8fd0ff',
  resiste: '#ffe28a',
  converte: '#9dffb0',
  regen: '#7dff9a',
  teleporte: '#d6a8ff',
};

function hexParaHsl(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}

function hslParaHex(h, s, l) {
  const f = (n) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return Math.round((l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255);
  };
  return '#' + [f(0), f(8), f(4)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/** A cor mais viva de uma lista de cores (a mais saturada e clara). */
function corViva(cores) {
  let melhor = null;
  let nota = -1;
  for (const c of cores) {
    if (!c) continue; // textura sem cor no catálogo (o campo elétrico do SN-4)
    const [, s, l] = hexParaHsl(c);
    const n = s * (1 - Math.abs(l - 0.55));
    if (n > nota) [melhor, nota] = [c, n];
  }
  return melhor;
}

const cacheCor = new Map();
/**
 * Cor da arma (hex): a do projétil do original (ou do clarão, da nova, do impacto),
 * com a luminosidade levantada até LUZ_MIN. Golpe de profundidade `prof` (os
 * subprojéteis) pode ter cor própria.
 */
export function corDaArma(kind, prof = 0) {
  const chave = `${kind}:${prof}`;
  if (cacheCor.has(chave)) return cacheCor.get(chave);
  const w = WEAPONS[kind];
  let cor = null;
  if (w?.npc && !w.original) cor = kind === 'plasma' ? '#7dff6a' : '#5ff7ff';
  else if (w) {
    let g = w.versoes[0].golpe;
    for (let i = 0; i < prof && g; i++) g = g.divide ?? g.dispara;
    const v = g?.vis ?? {};
    const fontes = [v.p, v.a, v.i, v.d].map(visualEfeito).filter(Boolean);
    const cores = fontes[0]?.cores ?? [];
    cor = cores.length ? corViva(cores) : null;
    if (!cor && w.categoria === 'dispositivo') cor = CORES_DISPOSITIVO[w.versoes[0].golpe.efeitos[0]?.tipo] ?? '#ffe28a';
    cor ??= '#5ff7ff';
    const [h, s, l] = hexParaHsl(cor);
    cor = hslParaHex(h, Math.max(s, 0.55), Math.max(l, LUZ_MIN));
  }
  cacheCor.set(chave, cor);
  return cor;
}

/** Classe visual da arma (a categoria do original: 'beam', 'gun', 'canhao'...). */
export function classeArma(kind) {
  return WEAPONS[kind]?.categoria ?? 'beam';
}

/** Nome da arma, com o do original em inglês como referência (texto pequeno no HTML). */
export function nomeArma(kind, comOriginal = false) {
  const w = WEAPONS[kind];
  if (!w) return kind;
  return comOriginal && w.nomeEn ? `${w.nome} <small class="original">${w.nomeEn}</small>` : w.nome;
}

/**
 * Ícone da arma, o do original (a figura do modelo dela, texture/item/aw001...), com o
 * número da versão no canto da V2 em diante (icones-itens.js). As armas de NPC não têm.
 */
export function iconeArma(kind, nivel = 1) {
  const w = WEAPONS[kind];
  if (!w) return '';
  return htmlIcone(w.icone, nivel, 'icone-arma');
}

/** Texto do dano na carta: "4×3" (por projétil × quantos, contando a rajada), o total ou "—". */
export function textoDano(kind, nivel = 1) {
  const v = versaoArma(kind, nivel);
  if (!v) return '—';
  const r = resumoVersao(v);
  if (!(r.dano > 0)) return '—';
  const n = Math.round(r.dano / (r.danoProjetil || r.dano));
  return n > 1 ? `${um(r.danoProjetil)}×${n}` : um(r.dano);
}

/** Forma do golpe em poucas palavras ("3 paralelos", "leque de 8", "rajada de 3", "área 17 m"...). */
function formaDoGolpe(v) {
  const g = v.golpe;
  const partes = [];
  if (g.forma === 'projetil') {
    const n = g.tiros.length;
    if (n > 1) partes.push(g.tiros.some((t) => t.ang) ? `leque de ${n}` : `${n} paralelos`);
    if (g.rajada > 1) partes.push(`rajada de ${g.rajada}`);
    if (g.guia) partes.push('teleguiado');
    if (g.atravessa) partes.push('atravessa');
    if (g.cresce) partes.push(`onda de ${Math.round(g.cresce.raio)} m`);
    if (g.divide) partes.push(g.divide.forma === 'nova' ? 'abre numa nova' : g.divide.forma === 'mina' || g.divide.forma === 'campo' ? 'vira armadilha' : 'se divide');
    if (g.area > 0) partes.push(`área ${Math.round(g.area)} m`);
    if (g.aliado && !g.inimigo) partes.push('acerta aliado');
  } else if (g.forma === 'nova') partes.push(`nova de ${Math.round(g.nova.raio)} m`);
  else if (g.forma === 'mina') partes.push(g.dispara ? 'mina que atira' : `mina de ${Math.round(g.area)} m`);
  else if (g.forma === 'campo') partes.push(`campo de ${Math.round(g.area)} m`);
  if (v.segurar) partes.push('segure a tecla');
  return partes;
}

/** Frase curta do que a arma faz no nível dado: a forma e o efeito principal. */
export function descreverArma(kind, nivel = 1) {
  const v = versaoArma(kind, nivel);
  if (!v) return '';
  const r = resumoVersao(v);
  const partes = formaDoGolpe(v);
  const texto = [partes.slice(0, 3).join(', '), r.efeitos[0]].filter(Boolean).join(' · ');
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** Etiquetas de tipo de dano e papel ("Laser · Bloqueio"), para o menu e a Loja. */
export function etiquetasArma(kind) {
  const w = WEAPONS[kind];
  if (!w) return '';
  return `<span class="etiquetas"><i class="tipo-dano ${w.tipoDano}">${TIPOS_DANO[w.tipoDano]}</i><i class="funcao ${w.funcao} papel-${w.papel}">${PAPEIS[w.papel] ?? ''}</i></span>`;
}

/**
 * O que muda do nível `nivel` para o seguinte, em texto curto ("Dano 7×2 → 12×3 ·
 * energia 2,4 → 3"). '' no máximo.
 */
export function proximoNivelArma(kind, nivel) {
  const a = versaoArma(kind, nivel);
  const b = nivel < NIVEL_ARMA_MAX ? versaoArma(kind, nivel + 1) : null;
  if (!a || !b || a === b) return '';
  const ra = resumoVersao(a);
  const rb = resumoVersao(b);
  const partes = [];
  if (rb.dano > 0) partes.push(`Dano ${textoDano(kind, nivel)} → ${textoDano(kind, nivel + 1)}`);
  if (ra.energia !== rb.energia) partes.push(`energia ${um(ra.energia)} → ${um(rb.energia)}`);
  if (ra.cd !== rb.cd) partes.push(`recarga ${um(ra.cd)} → ${um(rb.cd)} s`);
  if (rb.efeitos[0] && rb.efeitos[0] !== ra.efeitos[0]) partes.push(rb.efeitos[0]);
  return partes.join(' · ');
}

/** Tracinhos do nível da arma (1 a NIVEL_ARMA_MAX), acesos até o nível. */
export function pipsNivel(nivel) {
  return `<span class="pips" title="Nível ${nivel} de ${NIVEL_ARMA_MAX}">${Array.from({ length: NIVEL_ARMA_MAX }, (_, i) => `<i class="${i < nivel ? 'on' : ''}"></i>`).join('')}</span>`;
}

/** Armas (índices) na ordem das categorias do original e, dentro de cada uma, a do catálogo. */
export function ordenarPorCategoria(lista) {
  return [...lista].sort((a, b) => ORDEM_CATEGORIAS.indexOf(classeArma(ARMAS[a])) - ORDEM_CATEGORIAS.indexOf(classeArma(ARMAS[b])) || a - b);
}

/** Chama fn no clique (mouse) e no toque, sem esperar o clique atrasado do celular. */
function aoTocar(el, fn, signal) {
  el.addEventListener(
    'click',
    (e) => {
      fn(e);
      e.currentTarget.blur(); // Espaço também atira: não pode "clicar" no botão de novo
    },
    { signal },
  );
}

export class MenuArmas {
  /**
   * `race` e `classe` do piloto dizem as armas do menu. `signal` desliga todos os
   * listeners do menu quando a partida acaba (sair com ESC e entrar de novo não
   * duplica o Q). `aoRecusar(texto)` avisa quando o piloto tenta trocar um encaixe
   * em recarga de troca.
   * @param {{ race: string, classe: string, aoTrocar?: (encaixe: number, indice: number, kind: string) => void,
   *   aoRecusar?: (texto: string) => void, signal?: AbortSignal }} opcoes
   */
  constructor({ race, classe, aoTrocar, aoRecusar, signal } = {}) {
    this.el = document.querySelector('#menu-armas');
    this.titulo = this.el.querySelector('h2');
    this.dica = this.el.querySelector('.dica-encaixe');
    this.lista = this.el.querySelector('.opcoes');
    this.lista.replaceChildren(); // nova partida: cartas desenhadas do zero
    this.el.hidden = true;
    this.race = race;
    this.classe = classe;
    this.aoTrocar = aoTrocar;
    this.aoRecusar = aoRecusar;
    this.fabrica = armasIniciais(race);
    this.disponiveis = armasDisponiveis(race, classe);
    // Ids das instâncias do Z e do X (o que vai em a/a2); -1 até a nave chegar = a de fábrica.
    this.encaixes = [-1, -1];
    this.encaixe = 0; // qual encaixe o menu está editando
    this.insts = []; // armas do piloto por instância: [[id, índice, nível], ...] (s.armasInst)
    this.chaveInsts = '';
    this.atalhos = []; // ids das instâncias nas teclas 1 a 0
    this.troca = [0, 0]; // s de recarga de troca de cada encaixe (da nave prevista)
    this.livre = true; // na própria base: troca sem recarga
    this.textoTroca = '';
    this.aviso = document.createElement('p');
    this.aviso.className = 'aviso-troca';
    this.lista.before(this.aviso);
    this.botoes = new Map(); // id da instância (ou 'a<índice>' na Loja) -> botão
    aoTocar(
      this.lista,
      (e) => {
        const b = e.target.closest?.('[data-inst]');
        if (b) this.escolher(Number(b.dataset.inst));
      },
      signal,
    );
    this.#montar();

    addEventListener(
      'keydown',
      (e) => {
        if (e.target instanceof HTMLInputElement || e.repeat) return;
        const enc = ENCAIXES.findIndex((x) => x.menu === e.code);
        if (enc >= 0) this.alternar(enc);
        else if (this.aberto) {
          const i = TECLAS_OPCAO.findIndex((codigos) => codigos.includes(e.code));
          if (i >= 0 && this.atalhos[i] !== undefined) this.escolher(this.atalhos[i]);
        }
      },
      { signal },
    );
    ENCAIXES.forEach((x, enc) => {
      for (const sel of x.botoes) {
        const el = document.querySelector(sel);
        if (el) aoTocar(el, () => this.alternar(enc), signal);
      }
    });
  }

  /** O menu está na tela? (enquanto estiver, o Z e o X não disparam) */
  get aberto() {
    return !this.el.hidden;
  }

  /** A instância de arma `id` do piloto ([id, índice, nível]) ou null. */
  inst(id) {
    return this.insts.find((x) => x[0] === id) ?? null;
  }

  /** A instância no encaixe (0 = Z, 1 = X), [id, índice, nível], ou null antes da nave chegar. */
  instDoEncaixe(encaixe) {
    return this.inst(this.encaixes[encaixe]);
  }

  /** Índices das armas do Z e do X (a de fábrica enquanto a nave não chegou). */
  get armasNosEncaixes() {
    return [0, 1].map((enc) => this.instDoEncaixe(enc)?.[1] ?? this.fabrica[enc]);
  }

  /** Versões das armas do Z e do X. */
  get nivEnc() {
    return [0, 1].map((enc) => this.instDoEncaixe(enc)?.[2] ?? 1);
  }

  /**
   * Monta as cartas: uma por instância possuída primeiro (com as teclas), depois as
   * armas que o piloto não tem, da Loja, por categoria, cada grupo com o nome dele.
   * Refeito quando as instâncias mudam (compra, venda, evolução).
   */
  #montar() {
    const ordem = (i) => ORDEM_CATEGORIAS.indexOf(classeArma(ARMAS[i]));
    const minhas = [...this.insts].sort((x, y) => ordem(x[1]) - ordem(y[1]) || x[1] - y[1] || x[0] - y[0]);
    const tem = new Set(this.insts.map((x) => x[1]));
    const loja = ordenarPorCategoria(this.disponiveis.filter((i) => !tem.has(i)));
    this.atalhos = minhas.slice(0, 10).map((x) => x[0]);
    // Qual cópia da arma é cada instância (a carta da segunda diz "2ª cópia").
    const conta = new Map();
    const suas = minhas.map(([id, i, nivel]) => {
      const n = (conta.get(i) ?? 0) + 1;
      conta.set(i, n);
      return { id, i, nivel, n };
    });
    const grupos = [{ titulo: 'Suas armas', lista: suas, classe: 'minhas' }];
    for (const cat of ORDEM_CATEGORIAS) {
      const daCat = loja.filter((i) => classeArma(ARMAS[i]) === cat);
      if (daCat.length) grupos.push({ titulo: `${CATEGORIAS[cat]} · na Loja`, lista: daCat.map((i) => ({ id: null, i, nivel: 1 })), classe: 'loja' });
    }
    this.lista.replaceChildren();
    this.botoes.clear();
    for (const g of grupos) {
      const h = document.createElement('h3');
      h.className = `grupo-armas ${g.classe}`;
      h.textContent = g.titulo;
      this.lista.append(h);
      for (const { id, i, nivel, n } of g.lista) {
        const kind = ARMAS[i];
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'opcao-arma';
        if (id !== null) b.dataset.inst = String(id);
        else b.dataset.arma = String(i);
        const tecla = id !== null ? this.atalhos.indexOf(id) : -1;
        const nome = n > 1 ? `${nomeArma(kind)} <small class="copia">${n}ª cópia</small>` : nomeArma(kind);
        b.innerHTML = `${tecla >= 0 ? `<kbd>${(tecla + 1) % 10}</kbd>` : ''}<span class="nivel"></span><span class="cab"><span class="ic"></span><strong>${nome}</strong></span>
          ${etiquetasArma(kind)}
          <dl>
            <dt>Dano</dt><dd class="val-dano"></dd>
            <dt>Energia</dt><dd class="val-en"></dd>
            <dt>Recarga</dt><dd class="val-cd"></dd>
          </dl>
          <small class="efeito"></small>
          <span class="selo"></span>`;
        if (tecla < 0) b.classList.add('sem-tecla');
        this.#numeros(b, i, nivel);
        this.lista.append(b);
        this.botoes.set(id ?? `a${i}`, b);
      }
    }
    this.textoTroca = null;
    this.#marcar();
  }

  /** Os números da carta da arma de índice i no nível dado. */
  #numeros(b, i, nivel) {
    const kind = ARMAS[i];
    const r = resumoVersao(versaoArma(i, nivel));
    const nv = b.querySelector('.nivel');
    nv.textContent = `NV ${nivel}`;
    nv.classList.toggle('base', nivel <= 1);
    nv.classList.toggle('max', nivel >= NIVEL_ARMA_MAX);
    b.querySelector('.ic').innerHTML = iconeArma(kind, nivel);
    b.querySelector('.val-dano').textContent = textoDano(kind, nivel);
    b.querySelector('.val-en').textContent = r.segurar ? `${um(r.energia)}/s` : um(r.energia);
    b.querySelector('.val-cd').textContent = r.segurar ? 'segure' : `${numero(r.cd, r.cd < 1 ? 2 : 1)} s`;
    const efeito = descreverArma(kind, nivel);
    b.querySelector('.efeito').textContent = efeito;
    b.title = `${WEAPONS[kind].nomeEn} · ${efeito}`; // em tela baixa o efeito some da carta e fica aqui
  }

  /**
   * Abre o menu do encaixe; se ele já está aberto nesse encaixe, fecha; se está
   * aberto no outro, troca de encaixe.
   */
  alternar(encaixe = 0) {
    if (this.aberto && this.encaixe === encaixe) {
      this.el.hidden = true;
      return;
    }
    this.encaixe = encaixe;
    this.#marcar();
    this.el.hidden = false;
    // A arma em uso à vista (com 28 armas a lista rola).
    this.botoes.get(this.encaixes[encaixe])?.scrollIntoView?.({ block: 'nearest' });
  }

  /** Segundos de recarga de troca do encaixe (0 se pode trocar agora). */
  esperaTroca(encaixe) {
    return this.livre ? 0 : (this.troca[encaixe] ?? 0);
  }

  /** Escolhe a instância `id` para o encaixe em edição e fecha o menu. */
  escolher(id) {
    if (this.equipar(this.encaixe, id)) this.el.hidden = true;
  }

  /**
   * Põe a instância de arma `id` no encaixe (0 = Z, 1 = X): o mesmo caminho do menu,
   * usado também pelo INVENTÁRIO (inventario.js). Se ela está no outro encaixe, os
   * dois trocam de lugar (uma instância vai num encaixe só). Devolve se ficou
   * (false: não possui, ou um dos encaixes que mudam está em recarga de troca, com o
   * aviso em aoRecusar).
   */
  equipar(encaixe, id) {
    const x = this.inst(id);
    if (!x || !ENCAIXES[encaixe]) return false; // travada: a Loja libera
    if (id === this.encaixes[encaixe]) return true;
    const outro = 1 - encaixe;
    const troca = id === this.encaixes[outro]; // está no outro: os dois trocam de lugar
    for (const enc of troca ? [encaixe, outro] : [encaixe]) {
      const espera = this.esperaTroca(enc);
      if (espera > 0) {
        // O stepShip ignoraria a troca: avisa e não muda nada (o menu continua aberto).
        this.aoRecusar?.(`Arma do ${ENCAIXES[enc].tecla} em troca: ${um(espera)} s`);
        return false;
      }
    }
    if (troca) this.encaixes[outro] = this.encaixes[encaixe];
    this.encaixes[encaixe] = id;
    this.#marcar();
    this.aoTrocar?.(encaixe, x[1], ARMAS[x[1]]);
    return true;
  }

  /**
   * A cada passo, a nave prevista (formato de shared/sim.js): as armas do piloto por
   * instância (s.armasInst), recarga de troca de cada encaixe, se está na própria
   * base e as instâncias que ela tem de fato nos encaixes (s.encInst). Se a nave
   * ficou com outra (a troca não passou), o menu volta a mostrar a dela.
   */
  nave(s) {
    if (!s) return;
    this.troca = [s.troca1 ?? 0, s.troca2 ?? 0];
    this.livre = trocaLivre(s);
    if (Array.isArray(s.armasInst)) {
      const chave = JSON.stringify(s.armasInst);
      if (chave !== this.chaveInsts) {
        this.chaveInsts = chave;
        this.insts = s.armasInst.map((x) => [...x]);
        this.#montar();
      }
    }
    let mudou = false;
    if (Array.isArray(s.encInst)) {
      s.encInst.forEach((id, enc) => {
        if (Number.isInteger(id) && id !== this.encaixes[enc]) {
          this.encaixes[enc] = id;
          mudou = true;
        }
      });
    }
    if (mudou) this.#marcar();
    else if (this.aberto) this.#marcarTroca();
  }

  /**
   * Compatibilidade com main.js (que passa me.armas e me.niveis a cada snapshot): a
   * posse e as versões agora são por instância e chegam pela nave prevista (nave()).
   */
  definirPosse() {}

  /** Ver definirPosse: as versões vêm de s.armasInst, em nave(). */
  definirNiveis() {}

  #marcar() {
    const enc = this.encaixe;
    const outro = 1 - enc;
    const x = ENCAIXES[enc];
    const y = ENCAIXES[outro];
    this.el.dataset.encaixe = x.tecla;
    this.titulo.innerHTML = `Arma do <kbd>${x.tecla}</kbd>`;
    if (this.dica) this.dica.innerHTML = `<kbd>${x.letraMenu}</kbd> fecha · <kbd>${y.letraMenu}</kbd> edita o ${y.tecla}`;
    this.textoTroca = null;
    this.#marcarTroca();
  }

  /**
   * Cartas e aviso da recarga de troca do encaixe em edição: com a troca contando,
   * as outras armas ficam apagadas ("TROCA EM 2,1 s") até acabar. Só mexe no DOM
   * quando o texto muda (a contagem anda de décimo em décimo).
   */
  #marcarTroca() {
    const enc = this.encaixe;
    const outro = 1 - enc;
    const y = ENCAIXES[outro];
    const espera = this.esperaTroca(enc);
    const texto = espera > 0 ? um(Math.ceil(espera * 10) / 10) : '';
    const chave = `${enc}|${texto}|${this.livre}|${this.encaixes.join()}`;
    if (chave === this.textoTroca) return;
    this.textoTroca = chave;
    this.el.classList.toggle('trocando', espera > 0);
    this.aviso.innerHTML =
      espera > 0
        ? `Troca do <kbd>${ENCAIXES[enc].tecla}</kbd> em recarga: <b>${texto} s</b>`
        : this.livre
          ? 'Na base: troca livre'
          : `Fora da base: trocar trava o encaixe por ${um(TROCA_ARMA_S)} s`;
    this.aviso.classList.toggle('livre', this.livre && espera <= 0);
    for (const [id, b] of this.botoes) {
      const travada = typeof id !== 'number';
      const aqui = !travada && id === this.encaixes[enc];
      const la = !travada && id === this.encaixes[outro];
      const esperando = !travada && !aqui && espera > 0;
      b.classList.toggle('sel', aqui);
      b.classList.toggle('no-outro', la);
      b.classList.toggle('travada', travada);
      b.classList.toggle('espera', esperando);
      b.disabled = travada;
      b.querySelector('.selo').textContent = aqui ? 'EM USO' : travada ? 'NA LOJA' : esperando ? `TROCA EM ${texto} s` : la ? `NO ${y.tecla} · TROCA` : '';
    }
  }
}
