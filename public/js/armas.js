// Menu de armas: a nave tem duas armas, uma em cada encaixe (Z e X), e as duas
// aceitam qualquer arma da raça e da classe do piloto (armasDisponiveis em
// shared/armas.js: 18 a 28 armas do Astro-N original), inclusive a mesma. Não existe
// arma principal: o mesmo menu edita os dois encaixes. Q abre (e fecha) o menu do Z,
// E o do X; com o menu de um aberto, a tecla do outro troca de encaixe. No celular,
// os botões ARMA Z e ARMA X fazem o mesmo, e os indicadores das armas no painel
// também abrem o menu do encaixe deles.
//
// Com tanta arma, o menu rola e se organiza assim: em cima as armas que o piloto
// POSSUI (as de fábrica da raça e as compradas na Loja), na ordem das categorias do
// original (feixe, metralhadora, canhão, míssil, mina, nova, dispositivo...), com as
// teclas 1 a 9 e 0 nas dez primeiras; embaixo, apagadas e agrupadas por categoria, as
// que ainda estão "NA LOJA". Escolher (clique, toque ou tecla) fecha o menu.
//
// O menu só guarda a escolha do piloto: ela vai nos campos `a` (Z) e `a2` (X) de
// cada comando e quem troca a arma de verdade é stepShip (no servidor e na predição,
// no mesmo passo). Arma que a nave não possui não chega a ser pedida; se chegar, o
// stepShip a troca pela de fábrica do encaixe. O jogo não pausa com o menu aberto;
// só os tiros ficam travados enquanto ele está na tela. Os números das cartas saem
// da VERSÃO da arma (o nível dela, evoluído na Loja: definirNiveis), pelo
// resumoVersao de shared/armas.js, então balancear lá já atualiza o menu.
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
  if (w?.npc) cor = kind === 'plasma' ? '#7dff6a' : '#5ff7ff';
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
 * Ícone da arma em SVG de traço, pela categoria do original: feixes (um traço por
 * projétil, paralelos ou em leque), metralhadora (rajada de tracinhos), canhão
 * (bala grande), míssil (foguete), raio (zigue-zague), onda (arcos), lâmina
 * (hélice), lançador (estouro), mina (espinhos), nova (anéis), suporte (cruz) e os
 * dispositivos pelo efeito (escudo, olho, setas, cruz, raio, espiral). A cor é a da
 * arma (corDaArma), no `--cor-arma` do SVG.
 */
export function iconeArma(kind, nivel = 1) {
  const w = WEAPONS[kind];
  if (!w) return '';
  const cat = classeArma(kind);
  const g = versaoArma(kind, nivel)?.golpe ?? w.versoes[0].golpe;
  const linha = (x1, y1, x2, y2) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" />`;
  const raios = (angulos, r1, r2, cy = 12, cx = 12) =>
    angulos
      .map((gr) => {
        const r = (gr * Math.PI) / 180;
        const [sx, sy] = [Math.sin(r), Math.cos(r)];
        return linha(+(cx + sx * r1).toFixed(2), +(cy - sy * r1).toFixed(2), +(cx + sx * r2).toFixed(2), +(cy - sy * r2).toFixed(2));
      })
      .join('');
  const tiros = g.tiros ?? [{ off: 0, ang: 0 }];
  const leque = tiros.some((t) => t.ang);
  let d;
  if (cat === 'beam' || (w.npc && kind === 'laser')) {
    if (tiros.length >= 6) d = raios(tiros.map((t) => (-t.ang * 180) / Math.PI), 2, 10);
    else if (leque) d = tiros.map((t) => linha(12, 21, +(12 - Math.sin(t.ang * 3) * 16).toFixed(2), +(21 - Math.cos(t.ang * 3) * 17).toFixed(2))).join('');
    else {
      const n = Math.min(tiros.length, 4);
      d = Array.from({ length: n }, (_, i) => {
        const x = n === 1 ? 12 : 6 + (i * 12) / (n - 1);
        return linha(x, 3, x, 21);
      }).join('');
    }
  } else if (cat === 'gun') {
    const n = Math.min(tiros.length, 4);
    const rajada = Math.min(g.rajada ?? 1, 3);
    d = Array.from({ length: n }, (_, i) => {
      const x = n === 1 ? 12 : 6 + (i * 12) / (n - 1);
      return Array.from({ length: rajada + 1 }, (_, k) => linha(x, 4 + k * 5.5, x, 6.5 + k * 5.5)).join('');
    }).join('');
  } else if (cat === 'canhao' || (w.npc && kind === 'plasma')) {
    d = '<circle cx="12" cy="10" r="6" /><circle cx="12" cy="10" r="2" />' + linha(12, 17, 12, 22);
  } else if (cat === 'missil') {
    d = '<path d="M12 2 L15 7 L15 16 L9 16 L9 7 Z" />' + linha(9, 12, 6, 17) + linha(15, 12, 18, 17) + linha(12, 19, 12, 22);
  } else if (cat === 'raio') {
    d = '<path d="M14 2 L7 12 L12 12 L9 22 L17 10 L12 10 Z" />';
  } else if (cat === 'onda') {
    d = '<path d="M5 15 A9 9 0 0 1 19 15 M3 10 A12 12 0 0 1 21 10 M8 20 A5 5 0 0 1 16 20" />';
  } else if (cat === 'lamina') {
    d = '<circle cx="12" cy="12" r="2.5" /><path d="M12 9.5 C12 4 17 3 19 5 M14.5 12 C20 12 21 17 19 19 M12 14.5 C12 20 7 21 5 19 M9.5 12 C4 12 3 7 5 5" />';
  } else if (cat === 'lancador') {
    d = '<circle cx="12" cy="12" r="3" />' + raios([0, 45, 90, 135, 180, 225, 270, 315], 6, 10);
  } else if (cat === 'mina') {
    d = '<circle cx="12" cy="13" r="4.5" />' + raios([0, 72, 144, 216, 288], 6, 9, 13) + linha(3, 22, 21, 22);
  } else if (cat === 'nova') {
    d = '<circle cx="12" cy="12" r="2" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="10" stroke-dasharray="3 3" />';
  } else if (cat === 'suporte') {
    d = '<circle cx="12" cy="12" r="9" /><path d="M12 7 V17 M7 12 H17" />';
  } else {
    // Dispositivo: pelo efeito.
    const ef = g.efeitos?.[0]?.tipo;
    if (ef === 'invisivel') d = '<path d="M2 12 C6 5 18 5 22 12 C18 19 6 19 2 12 Z" /><circle cx="12" cy="12" r="3" />' + linha(4, 20, 20, 4);
    else if (ef === 'acelera') d = '<path d="M4 6 L10 12 L4 18 M11 6 L17 12 L11 18" />' + linha(19, 6, 19, 18);
    else if (ef === 'energiaPorHp') d = '<rect x="5" y="6" width="13" height="14" rx="2" /><path d="M9 3 H14 M12.5 9 L9.5 13.5 H13 L10.5 17.5" />';
    else if (ef === 'regen' || ef === 'converte') d = '<path d="M12 3 L20 6 V12 C20 17 16 20 12 22 C8 20 4 17 4 12 V6 Z" /><path d="M12 9 V16 M8.5 12.5 H15.5" />';
    else if (ef === 'teleporte') d = '<path d="M12 12 m-1 0 a1 1 0 1 1 2 0 a3 3 0 1 1 -6 0 a5 5 0 1 1 10 0 a7 7 0 1 1 -14 0 a9 9 0 0 1 9 -9" />';
    else d = '<path d="M12 3 L20 6 V12 C20 17 16 20 12 22 C8 20 4 17 4 12 V6 Z" />' + (ef === 'resiste' ? '<path d="M8 12 L11 15 L16 9" />' : '');
  }
  return `<svg class="icone-arma ${cat}" viewBox="0 0 24 24" aria-hidden="true" style="--cor-arma:${corDaArma(kind)}">${d}</svg>`;
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
 * energia 2,4 → 3 · pede NV 5"). '' no máximo.
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
  partes.push(`pede NV ${b.nivelPiloto}`);
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
    this.encaixes = [...this.fabrica];
    this.encaixe = 0; // qual encaixe o menu está editando
    this.posse = [...this.fabrica];
    this.niveis = {};
    this.atalhos = []; // índices das armas nas teclas 1 a 0
    this.troca = [0, 0]; // s de recarga de troca de cada encaixe (da nave prevista)
    this.livre = true; // na própria base: troca sem recarga
    this.textoTroca = '';
    this.aviso = document.createElement('p');
    this.aviso.className = 'aviso-troca';
    this.lista.before(this.aviso);
    this.botoes = new Map(); // índice -> botão
    aoTocar(
      this.lista,
      (e) => {
        const b = e.target.closest?.('[data-arma]');
        if (b) this.escolher(Number(b.dataset.arma));
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

  /** A arma está liberada (de fábrica ou comprada)? */
  possui(i) {
    return this.fabrica.includes(i) || this.posse.includes(i);
  }

  /**
   * Monta as cartas: as possuídas primeiro (com as teclas), depois as da Loja por
   * categoria, cada grupo com o nome dele. Refeito quando a posse muda.
   */
  #montar() {
    const minhas = ordenarPorCategoria(this.disponiveis.filter((i) => this.possui(i)));
    const loja = ordenarPorCategoria(this.disponiveis.filter((i) => !this.possui(i)));
    this.atalhos = minhas.slice(0, 10);
    const grupos = [{ titulo: 'Suas armas', lista: minhas, classe: 'minhas' }];
    for (const cat of ORDEM_CATEGORIAS) {
      const daCat = loja.filter((i) => classeArma(ARMAS[i]) === cat);
      if (daCat.length) grupos.push({ titulo: `${CATEGORIAS[cat]} · na Loja`, lista: daCat, classe: 'loja' });
    }
    this.lista.replaceChildren();
    this.botoes.clear();
    for (const g of grupos) {
      const h = document.createElement('h3');
      h.className = `grupo-armas ${g.classe}`;
      h.textContent = g.titulo;
      this.lista.append(h);
      for (const i of g.lista) {
        const kind = ARMAS[i];
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'opcao-arma';
        b.dataset.arma = String(i);
        const tecla = this.atalhos.indexOf(i);
        b.innerHTML = `${tecla >= 0 ? `<kbd>${(tecla + 1) % 10}</kbd>` : ''}<span class="nivel"></span><span class="cab"><span class="ic"></span><strong>${nomeArma(kind)}</strong></span>
          ${etiquetasArma(kind)}
          <dl>
            <dt>Dano</dt><dd class="val-dano"></dd>
            <dt>Energia</dt><dd class="val-en"></dd>
            <dt>Recarga</dt><dd class="val-cd"></dd>
          </dl>
          <small class="efeito"></small>
          <span class="selo"></span>`;
        if (tecla < 0) b.classList.add('sem-tecla');
        this.lista.append(b);
        this.botoes.set(i, b);
      }
    }
    this.#desenharNiveis();
    this.#marcar();
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

  /** Escolhe a arma de índice i para o encaixe em edição e fecha o menu. */
  escolher(i) {
    if (!this.possui(i)) return; // travada: a Loja libera
    const espera = this.esperaTroca(this.encaixe);
    if (espera > 0 && i !== this.encaixes[this.encaixe]) {
      // O stepShip ignoraria a troca: avisa e não muda nada (o menu continua aberto).
      this.aoRecusar?.(`Arma do ${ENCAIXES[this.encaixe].tecla} em troca: ${um(espera)} s`);
      return;
    }
    const mudou = i !== this.encaixes[this.encaixe];
    this.encaixes[this.encaixe] = i;
    this.#marcar();
    this.el.hidden = true;
    if (mudou) this.aoTrocar?.(this.encaixe, i, ARMAS[i]);
  }

  /**
   * A cada passo, a nave prevista (formato de shared/sim.js): recarga de troca de
   * cada encaixe, se está na própria base e as armas que ela tem de fato. Se a nave
   * ficou com outra arma (a troca não passou), o menu volta a mostrar a dela.
   */
  nave(s) {
    if (!s) return;
    this.troca = [s.troca1 ?? 0, s.troca2 ?? 0];
    this.livre = trocaLivre(s);
    let mudou = false;
    if (Array.isArray(s.encaixes)) {
      s.encaixes.forEach((a, enc) => {
        if (Number.isInteger(a) && a !== this.encaixes[enc]) {
          this.encaixes[enc] = a;
          mudou = true;
        }
      });
    }
    if (mudou) this.#marcar();
    else if (this.aberto) this.#marcarTroca();
  }

  /** Nível de cada arma (me.niveis: índice → nível, só as evoluídas), para os números das cartas. */
  definirNiveis(niveis) {
    if (!niveis || typeof niveis !== 'object') return;
    const chave = JSON.stringify(niveis);
    if (chave === this.chaveNiveis) return;
    this.chaveNiveis = chave;
    this.niveis = { ...niveis };
    this.#desenharNiveis();
  }

  #desenharNiveis() {
    for (const [i, b] of this.botoes) {
      const kind = ARMAS[i];
      const nivel = this.niveis[i] ?? 1;
      const v = versaoArma(i, nivel);
      const r = resumoVersao(v);
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
  }

  /**
   * Armas que a nave possui (me.armas: as de fábrica e as compradas). As outras
   * ficam no grupo da Loja e, se estavam equipadas, o encaixe volta para a de fábrica.
   */
  definirPosse(armas) {
    const posse = Array.isArray(armas) ? armas : [];
    if (posse.length === this.posse.length && posse.every((a, i) => a === this.posse[i])) return;
    this.posse = [...posse];
    this.encaixes = this.encaixes.map((a, enc) => (this.possui(a) ? a : this.fabrica[enc]));
    this.#montar();
  }

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
    for (const [i, b] of this.botoes) {
      const aqui = i === this.encaixes[enc];
      const la = i === this.encaixes[outro];
      const travada = !this.possui(i);
      const esperando = !travada && !aqui && espera > 0;
      b.classList.toggle('sel', aqui);
      b.classList.toggle('no-outro', la);
      b.classList.toggle('travada', travada);
      b.classList.toggle('espera', esperando);
      b.disabled = travada;
      b.querySelector('.selo').textContent =
        aqui && la ? `EM USO · também no ${y.tecla}` : aqui ? 'EM USO' : travada ? 'NA LOJA' : esperando ? `TROCA EM ${texto} s` : la ? `NO ${y.tecla}` : '';
    }
  }
}
