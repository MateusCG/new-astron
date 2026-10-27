// Armas da nave: a nave tem duas armas, uma em cada encaixe (Z e X), e as duas
// aceitam qualquer arma da raça e da classe do piloto (armasDisponiveis em
// shared/armas.js: 18 a 28 armas do Astro-N original). Não existe arma principal.
//
// Cada arma do piloto é um OBJETO do inventário (uma instância, com a sua versão V1
// a V8), e a mesma arma pode estar em duas cópias (ARMA_COPIAS_MAX, shared/loja.js):
// a mesma arma no Z e no X são duas cópias.
//
// Troca rápida, como no original (TROCA_RAPIDA em shared/loja.js): as duas
// primeiras casas do compartimento do INVENTÁRIO guardam uma arma cada, a do Q para
// o Z e a do E para o X. Apertar Q troca a arma do Z pela guardada no Q, e a que
// sai do Z fica guardada no Q (apertar de novo desfaz); o E faz o mesmo com o X. No
// painel inferior, cada encaixe mostra a arma guardada da sua tecla, e clicar no
// encaixe (ou no celular, TROCA Z / TROCA X) é o mesmo que a tecla. O que vai em
// cada casa se escolhe no INVENTÁRIO (inventario.js).
//
// Esta classe só guarda a escolha do piloto: os ids das instâncias do Z e do X vão
// nos campos `a` (Z) e `a2` (X) de cada comando, e quem troca a arma de verdade é o
// stepShip (no servidor e na predição, no mesmo passo). As casas da troca rápida
// ficam só aqui (o servidor não precisa delas). As instâncias e os encaixes vêm da
// nave prevista (nave(): s.armasInst = [[id, índice, nível]] e s.encInst, que o `me`
// traz), então o que aparece é o que a nave tem.
//
// Recarga de troca (TROCA_ARMA_S em shared/sim.js): fora da própria base, trocar a
// arma de um encaixe o trava por alguns segundos, e o stepShip ignora outra troca
// nele enquanto conta. Aqui a troca recusada só dá a notícia (aoRecusar) e não
// muda nada; main.js passa a nave prevista a cada passo (nave()).
//
// Daqui saem também o ícone, a cor, a descrição e as etiquetas de cada arma para o
// painel da Loja (servicos.js), o INVENTÁRIO e o painel inferior (hud.js).

import { WEAPONS, ARMAS, TIPOS_DANO, trocaLivre, armasIniciais } from '/shared/sim.js';
import { versaoArma, resumoVersao, visualEfeito, ORDEM_CATEGORIAS, PAPEIS, NIVEL_ARMA_MAX } from '/shared/armas.js';
import { TROCA_RAPIDA, limparTrocaRapida, guardarNaTrocaRapida, equiparArmaRapida } from '/shared/loja.js';
import { htmlIcone } from './icones-itens.js';

/**
 * Tecla de tiro, tecla da troca rápida e botões de cada encaixe (0 = Z, 1 = X): o
 * encaixe do painel inferior e o TROCA Z/X do celular trocam como a tecla.
 */
export const ENCAIXES = [
  { tecla: 'Z', codigoTroca: 'KeyQ', letraTroca: TROCA_RAPIDA[0], botoes: ['#btn-arma-z', '#arma-z'] },
  { tecla: 'X', codigoTroca: 'KeyE', letraTroca: TROCA_RAPIDA[1], botoes: ['#btn-arma-x', '#arma-x'] },
];

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

export class ArmasNave {
  /**
   * `race` do piloto diz as armas de fábrica. `signal` desliga os listeners quando a
   * partida acaba (sair com ESC e entrar de novo não duplica o Q). `aoTrocar` avisa a
   * troca feita; `aoRecusar(texto)`, a que não deu (casa vazia, recarga de troca).
   * @param {{ race: string, aoTrocar?: (encaixe: number, indice: number, kind: string) => void,
   *   aoRecusar?: (texto: string) => void, signal?: AbortSignal }} opcoes
   */
  constructor({ race, aoTrocar, aoRecusar, signal } = {}) {
    this.aoTrocar = aoTrocar;
    this.aoRecusar = aoRecusar;
    this.fabrica = armasIniciais(race);
    // Ids das instâncias do Z e do X (o que vai em a/a2); -1 até a nave chegar = a de fábrica.
    this.encaixes = [-1, -1];
    this.casas = [null, null]; // ids guardados na troca rápida: [do Q, do E]
    this.insts = []; // armas do piloto por instância: [[id, índice, nível], ...] (s.armasInst)
    this.chaveInsts = '';
    this.troca = [0, 0]; // s de recarga de troca de cada encaixe (da nave prevista)
    this.livre = true; // na própria base: troca sem recarga
    this.chaveCasas = '';
    // No painel inferior, a arma guardada da tecla de cada encaixe ("Q ▸ ícone").
    this.indicadores = ENCAIXES.map((x) => {
      const el = document.querySelector(x.botoes[1]);
      if (!el) return null;
      el.querySelector('.casa-troca')?.remove(); // nova partida: refeito do zero
      const casa = document.createElement('span');
      casa.className = 'casa-troca vazia';
      el.querySelector('.recarga').before(casa);
      return { el, casa };
    });
    this.#desenharCasas();

    addEventListener(
      'keydown',
      (e) => {
        if (e.target instanceof HTMLInputElement || e.repeat) return;
        const enc = ENCAIXES.findIndex((x) => x.codigoTroca === e.code);
        if (enc >= 0) this.trocar(enc);
      },
      { signal },
    );
    ENCAIXES.forEach((x, enc) => {
      for (const sel of x.botoes) {
        const el = document.querySelector(sel);
        if (el) aoTocar(el, () => this.trocar(enc), signal);
      }
    });
  }

  /** A instância de arma `id` do piloto ([id, índice, nível]) ou null. */
  inst(id) {
    return this.insts.find((x) => x[0] === id) ?? null;
  }

  /** A instância no encaixe (0 = Z, 1 = X), [id, índice, nível], ou null antes da nave chegar. */
  instDoEncaixe(encaixe) {
    return this.inst(this.encaixes[encaixe]);
  }

  /** A instância guardada na casa de troca rápida k (0 = Q, 1 = E), ou null. */
  instDaCasa(k) {
    return this.inst(this.casas[k]);
  }

  /** Índices das armas do Z e do X (a de fábrica enquanto a nave não chegou). */
  get armasNosEncaixes() {
    return [0, 1].map((enc) => this.instDoEncaixe(enc)?.[1] ?? this.fabrica[enc]);
  }

  /** Versões das armas do Z e do X. */
  get nivEnc() {
    return [0, 1].map((enc) => this.instDoEncaixe(enc)?.[2] ?? 1);
  }

  /** Segundos de recarga de troca do encaixe (0 se pode trocar agora). */
  esperaTroca(encaixe) {
    return this.livre ? 0 : (this.troca[encaixe] ?? 0);
  }

  /**
   * Troca rápida (Q no Z, E no X): a arma guardada na casa da tecla vai para o
   * encaixe e a do encaixe fica guardada. Casa vazia ou troca em recarga: só avisa.
   */
  trocar(encaixe) {
    const id = this.casas[encaixe];
    if (id === null) {
      const { tecla, letraTroca } = ENCAIXES[encaixe];
      this.aoRecusar?.(`Nada guardado no ${letraTroca}: no INVENTÁRIO (I), guarde uma arma para trocar com o ${tecla}`);
      return false;
    }
    return this.equipar(encaixe, id);
  }

  /**
   * Guarda a instância de arma `id` na casa de troca rápida k (0 = Q, 1 = E), ou
   * esvazia com null; a arma tem de estar no compartimento (fora do Z e do X). Se
   * ela estava na outra casa, as duas trocam. Devolve se ficou.
   */
  guardar(k, id) {
    if (!TROCA_RAPIDA[k]) return false;
    if (id !== null && (!this.inst(id) || this.encaixes.includes(id))) return false;
    this.casas = guardarNaTrocaRapida(this.casas, k, id);
    this.#desenharCasas();
    return true;
  }

  /**
   * Põe a instância de arma `id` no encaixe (0 = Z, 1 = X): o caminho do Q/E e do
   * INVENTÁRIO (inventario.js). Se ela está no outro encaixe, os dois trocam de lugar
   * (uma instância vai num encaixe só); se estava guardada numa casa da troca
   * rápida, a que sai do encaixe fica guardada no lugar dela. Devolve se ficou
   * (false: não possui, ou um dos encaixes que mudam está em recarga de troca, com o
   * aviso em aoRecusar).
   */
  equipar(encaixe, id) {
    const x = this.inst(id);
    if (!x || !ENCAIXES[encaixe]) return false;
    if (id === this.encaixes[encaixe]) return true;
    const outro = 1 - encaixe;
    const troca = id === this.encaixes[outro]; // está no outro: os dois trocam de lugar
    for (const enc of troca ? [encaixe, outro] : [encaixe]) {
      const espera = this.esperaTroca(enc);
      if (espera > 0) {
        // O stepShip ignoraria a troca: avisa e não muda nada.
        this.aoRecusar?.(`Arma do ${ENCAIXES[enc].tecla} em troca: ${um(espera)} s`);
        return false;
      }
    }
    ({ encInst: this.encaixes, casas: this.casas } = equiparArmaRapida(this.encaixes, this.casas, encaixe, id));
    this.#desenharCasas();
    this.aoTrocar?.(encaixe, x[1], ARMAS[x[1]]);
    return true;
  }

  /**
   * A cada passo, a nave prevista (formato de shared/sim.js): as armas do piloto por
   * instância (s.armasInst), recarga de troca de cada encaixe, se está na própria
   * base e as instâncias que ela tem de fato nos encaixes (s.encInst). Se a nave
   * ficou com outra (a troca não passou), volta a valer a dela, e a casa da troca
   * rápida que tinha recebido essa arma guarda de novo a que não entrou.
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
      }
    }
    if (Array.isArray(s.encInst)) {
      s.encInst.forEach((id, enc) => {
        if (!Number.isInteger(id) || id === this.encaixes[enc]) return;
        const k = this.casas.indexOf(id);
        if (k >= 0 && this.encaixes[enc] >= 0) this.casas[k] = this.encaixes[enc];
        this.encaixes[enc] = id;
      });
    }
    // Vendida, partida nova: a casa que guardava o que não existe mais esvazia.
    this.casas = limparTrocaRapida(this.casas, this.insts, this.encaixes);
    this.#desenharCasas();
  }

  /** Painel inferior: a tecla e o ícone da arma guardada ao lado de cada encaixe. */
  #desenharCasas() {
    const chave = JSON.stringify([this.casas, this.casas.map((id) => this.inst(id))]);
    if (chave === this.chaveCasas) return;
    this.chaveCasas = chave;
    this.indicadores.forEach((ind, enc) => {
      if (!ind) return;
      const x = this.instDaCasa(enc);
      const { tecla, letraTroca } = ENCAIXES[enc];
      ind.casa.classList.toggle('vazia', !x);
      ind.casa.innerHTML = `<kbd>${letraTroca}</kbd>${x ? iconeArma(ARMAS[x[1]], x[2]) : '<span class="icone-item vazio"></span>'}`;
      ind.el.title = x
        ? `${letraTroca} (ou clique) troca a arma do ${tecla} por ${WEAPONS[ARMAS[x[1]]].nome}`
        : `Nada guardado no ${letraTroca}: guarde uma arma no INVENTÁRIO (I) para trocar com o ${tecla}`;
    });
  }
}
