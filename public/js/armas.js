// Menu de armas: a nave tem duas armas, uma em cada encaixe (Z e X), e as duas
// aceitam qualquer arma do catálogo ARMAS de shared/sim.js, inclusive a mesma. Não
// existe arma principal: o mesmo menu edita os dois encaixes. Q abre (e fecha) o
// menu do Z, E o do X; com o menu de um aberto, a tecla do outro troca de encaixe.
// No celular, os botões ARMA Z e ARMA X fazem o mesmo, e os indicadores das armas
// no painel também abrem o menu do encaixe deles. Escolhe com clique/toque ou com as
// teclas 1 a 9 e 0 (a décima arma), e escolher fecha o menu.
//
// O menu só guarda a escolha do piloto: ela vai nos campos `a` (Z) e `a2` (X) de
// cada comando e quem troca a arma de verdade é stepShip (no servidor e na predição,
// no mesmo passo). Arma que a nave não possui (s.armas: as de fábrica e as compradas
// na Loja) fica travada no menu com o selo "NA LOJA"; se chegar ao stepShip, ela cai
// na padrão do encaixe. Como é
// multijogador, o jogo não pausa com o menu aberto; só os tiros ficam travados
// enquanto ele está na tela. Os números das cartas saem de WEAPONS, então balancear
// em shared/sim.js já atualiza o menu.
//
// O estado "aberto" vem do próprio elemento #menu-armas (atributo hidden), um só
// para os dois encaixes, para quem mais precisar fechar o menu (o ESC, por exemplo)
// só esconder o elemento.
//
// Recarga de troca (TROCA_ARMA_S em shared/sim.js): fora da própria base, trocar a
// arma de um encaixe o trava por alguns segundos, e o stepShip ignora outra troca
// nele enquanto conta. Para o piloto nunca pedir uma troca que vai ser ignorada
// calado, o menu TRAVA o encaixe enquanto conta: as outras cartas ficam apagadas
// com a contagem, e escolher uma delas só dá a notícia (aoRecusar) sem mudar nada.
// main.js passa a nave prevista a cada passo (nave()), e o menu sempre volta a
// mostrar a arma que a nave tem de fato (se a predição recusou, o menu acompanha).
// Na base a troca é livre e a dica diz isso.
//
// Cada carta também mostra o tipo de dano e a função da arma (WEAPONS[].tipoDano e
// .funcao) e o nível dela (evoluído na Loja: definirNiveis), com o dano e o efeito
// já do nível.

import { WEAPONS, ARMAS, ENCAIXE_PADRAO, TODAS_AS_ARMAS, ARMAS_INICIAIS, TROCA_ARMA_S, TIPOS_DANO, FUNCOES_ARMA, trocaLivre } from '/shared/sim.js';
import { danoMultNivel, efeitoDaArma, ARMA_NIVEL_MAX } from '/shared/loja.js';

/** Tecla, nome e botões de cada encaixe (0 = Z, 1 = X). */
export const ENCAIXES = [
  { tecla: 'Z', menu: 'KeyQ', letraMenu: 'Q', botoes: ['#btn-arma-z', '#arma-z'] },
  { tecla: 'X', menu: 'KeyE', letraMenu: 'E', botoes: ['#btn-arma-x', '#arma-x'] },
];
// 1 a 9 e o 0 para a décima.
const TECLAS_OPCAO = ARMAS.map((_, i) => {
  const n = (i + 1) % 10;
  return [`Digit${n}`, `Numpad${n}`];
});

const numero = (v, casas = 0) => v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
const graus = (rad) => Math.round((rad * 180) / Math.PI);

/** Quantos projéteis a arma solta por disparo. */
export function projeteis(w) {
  return (w.canos?.length ?? 1) * (w.leque?.length ?? 1);
}

/**
 * Classe visual da arma (cor do ícone no CSS): 'laser', 'dreno', 'lento', 'plasma',
 * 'missil', 'mina', 'choque' ou 'emp'.
 */
export function classeArma(kind) {
  const w = WEAPONS[kind];
  if (w.efeito) return w.efeito.tipo;
  if (w.tipo) return w.tipo;
  if (w.guiado) return 'missil';
  if (kind === 'plasma') return 'plasma';
  return 'laser';
}

/** Segundos com uma casa (só quando precisa), no jeito brasileiro. */
const seg = (v) => numero(v, Number.isInteger(+v.toFixed(1)) ? 0 : 1);

/**
 * Frase curta do que a arma faz no nível dado (1 se omitido), montada das
 * constantes de shared/sim.js e dos efeitos por nível de shared/loja.js.
 */
export function descreverArma(kind, nivel = 1) {
  const w = WEAPONS[kind];
  const e = efeitoDaArma(kind, nivel);
  const s = seg;
  if (e?.tipo === 'dreno') return `Drena ${numero(e.dps, Number.isInteger(e.dps) ? 0 : 1)} HP/s por ${s(e.duracao)} s`;
  if (e?.tipo === 'lento') return `Alvo ${Math.round((1 - e.mult) * 100)}% mais lento por ${s(e.duracao)} s`;
  if (e?.tipo === 'emp') return `Zera a energia: sem tiro e sem boost por ${s(e.duracao)} s`;
  if (w.tipo === 'mina') return `Cai atrás, arma em ${s(w.armaS)} s e explode em ${w.area} m · até ${w.max}`;
  if (w.tipo === 'choque') return `Área de ${w.area} m em volta, empurra para fora`;
  if (w.guiado) return `Persegue inimigo à frente (±${graus(w.guiado.cone)}°, ${w.guiado.alcance} m)`;
  if (w.leque) return `${w.leque.length} tiros em leque (±${graus(Math.max(...w.leque))}°)`;
  if (w.canos) return `${w.canos.length} tiros paralelos, faixa larga`;
  if (kind === 'plasma') return 'Lento e pesado: o maior golpe';
  return 'Tiro único, maior dano por segundo';
}

/**
 * Ícone da arma em SVG de traço: um traço por projétil nos lasers (paralelos ou em
 * leque), gota no dreno, floco no criogênico, esfera no plasma, foguete no míssil,
 * mina com espinhos, ondas no choque e raio no EMP. A cor vem do CSS pela classe.
 */
export function iconeArma(kind) {
  const w = WEAPONS[kind];
  const classe = classeArma(kind);
  const linha = (x1, y1, x2, y2) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" />`;
  // Traços saindo do centro (cx, cy), de r1 até r2, nos ângulos dados (graus).
  const raios = (angulos, r1, r2, cy = 12, cx = 12) =>
    angulos
      .map((g) => {
        const r = (g * Math.PI) / 180;
        const [sx, sy] = [Math.sin(r), Math.cos(r)];
        return linha(+(cx + sx * r1).toFixed(2), +(cy - sy * r1).toFixed(2), +(cx + sx * r2).toFixed(2), +(cy - sy * r2).toFixed(2));
      })
      .join('');
  let desenho;
  if (classe === 'dreno') {
    desenho = '<path d="M12 3 C9 8 6 11 6 15 a6 6 0 0 0 12 0 C18 11 15 8 12 3 Z" />';
  } else if (classe === 'lento') {
    desenho = raios([0, 60, 120, 180, 240, 300], 0, 8);
  } else if (classe === 'plasma') {
    desenho = '<circle cx="12" cy="12" r="6.5" /><circle cx="12" cy="12" r="2" />';
  } else if (classe === 'missil') {
    desenho = '<path d="M12 2 L15 7 L15 16 L9 16 L9 7 Z" />' + linha(9, 12, 6, 17) + linha(15, 12, 18, 17) + linha(12, 19, 12, 22);
  } else if (classe === 'mina') {
    desenho = '<circle cx="12" cy="13" r="4.5" />' + raios([0, 72, 144, 216, 288], 6, 9, 13) + linha(3, 22, 21, 22);
  } else if (classe === 'choque') {
    desenho = '<circle cx="12" cy="12" r="2.5" /><path d="M5 7 A8.5 8.5 0 0 0 5 17 M19 7 A8.5 8.5 0 0 1 19 17 M2 4 A12 12 0 0 0 2 20 M22 4 A12 12 0 0 1 22 20" />';
  } else if (classe === 'emp') {
    desenho = '<path d="M13.5 2 L6 13 L11.5 13 L10 22 L18 10 L12.5 10 Z" />';
  } else if (w.leque) {
    desenho = w.leque.map((a) => linha(12, 21, +(12 - Math.sin(a * 6) * 16).toFixed(2), +(21 - Math.cos(a * 6) * 17).toFixed(2))).join('');
  } else {
    const n = w.canos?.length ?? 1;
    desenho = Array.from({ length: n }, (_, i) => {
      const x = n === 1 ? 12 : 7 + (i * 10) / (n - 1);
      return linha(x, 4, x, 20);
    }).join('');
  }
  return `<svg class="icone-arma ${classe}" viewBox="0 0 24 24" aria-hidden="true">${desenho}</svg>`;
}

/** Dano por projétil (ou em área) da arma no nível, arredondado como no servidor. */
export function danoNoNivel(kind, nivel = 1) {
  return Math.round(WEAPONS[kind].dano * danoMultNivel(nivel));
}

/** Texto do dano na carta: "7×2" (por projétil × quantos) ou o número (a área vai no efeito). */
export function textoDano(kind, nivel = 1) {
  const n = projeteis(WEAPONS[kind]);
  const d = danoNoNivel(kind, nivel);
  return n > 1 ? `${d}×${n}` : String(d);
}

/** Etiquetas de tipo de dano e função ("Laser · Dano"), para o menu e a Loja. */
export function etiquetasArma(kind) {
  const w = WEAPONS[kind];
  return `<span class="etiquetas"><i class="tipo-dano ${w.tipoDano}">${TIPOS_DANO[w.tipoDano]}</i><i class="funcao ${w.funcao}">${FUNCOES_ARMA[w.funcao]}</i></span>`;
}

/**
 * O que muda do nível `nivel` para o seguinte, em texto curto: o dano e, nas de
 * controle, o efeito ("Dano 12 → 13 · lento 50% → 55%, 3 → 3,4 s"). '' no máximo.
 */
export function proximoNivelArma(kind, nivel) {
  if (nivel >= ARMA_NIVEL_MAX) return '';
  const partes = [`Dano ${textoDano(kind, nivel)} → ${textoDano(kind, nivel + 1)}`];
  const a = efeitoDaArma(kind, nivel);
  const b = efeitoDaArma(kind, nivel + 1);
  const um = (v) => numero(v, Number.isInteger(+v.toFixed(1)) ? 0 : 1);
  if (a?.tipo === 'dreno') partes.push(`dreno ${um(a.dps)} → ${um(b.dps)} HP/s, ${seg(a.duracao)} → ${seg(b.duracao)} s`);
  else if (a?.tipo === 'lento') {
    const pct = (e) => `${Math.round((1 - e.mult) * 100)}%`;
    partes.push(`lento ${pct(a)} → ${pct(b)}, ${seg(a.duracao)} → ${seg(b.duracao)} s`);
  } else if (a?.tipo === 'emp') partes.push(`EMP ${seg(a.duracao)} → ${seg(b.duracao)} s`);
  else if (a?.tipo === 'empurrao') partes.push(`empurrão +${Math.round((b.empurrao / a.empurrao - 1) * 100)}%`);
  return partes.join(' · ');
}

/** Tracinhos do nível da arma (1 a ARMA_NIVEL_MAX), acesos até o nível. */
export function pipsNivel(nivel) {
  return `<span class="pips" title="Nível ${nivel} de ${ARMA_NIVEL_MAX}">${Array.from({ length: ARMA_NIVEL_MAX }, (_, i) => `<i class="${i < nivel ? 'on' : ''}"></i>`).join('')}</span>`;
}

/** Chama fn no clique (mouse) e no toque, sem esperar o clique atrasado do celular. */
function aoTocar(el, fn, signal) {
  el.addEventListener('click', (e) => {
    fn();
    e.currentTarget.blur(); // Espaço também atira: não pode "clicar" no botão de novo
  }, { signal });
  el.addEventListener('touchstart', (e) => {
    e.preventDefault();
    fn();
  }, { signal });
}

export class MenuArmas {
  /**
   * `signal` desliga todos os listeners do menu (teclado e botões, que ficam no HTML
   * fixo da página) quando a partida acaba; sem ele, sair com ESC e entrar de novo
   * deixaria o Q alternando o menu duas vezes.
   * `aoRecusar(texto)` avisa quando o piloto tenta trocar um encaixe em recarga de troca.
   * @param {{ aoTrocar?: (encaixe: number, indice: number, kind: string) => void,
   *   aoRecusar?: (texto: string) => void, signal?: AbortSignal }} [opcoes]
   */
  constructor({ aoTrocar, aoRecusar, signal } = {}) {
    this.el = document.querySelector('#menu-armas');
    this.titulo = this.el.querySelector('h2');
    this.dica = this.el.querySelector('.dica-encaixe');
    this.lista = this.el.querySelector('.opcoes');
    this.lista.replaceChildren(); // nova partida: cartas desenhadas do zero
    this.el.hidden = true;
    this.aoTrocar = aoTrocar;
    this.aoRecusar = aoRecusar;
    this.encaixes = [...ENCAIXE_PADRAO];
    this.encaixe = 0; // qual encaixe o menu está editando
    this.posse = [...TODAS_AS_ARMAS];
    this.niveis = ARMAS.map(() => 1);
    this.troca = [0, 0]; // s de recarga de troca de cada encaixe (da nave prevista)
    this.livre = true; // na própria base: troca sem recarga
    this.textoTroca = '';
    this.botoes = ARMAS.map((kind, i) => {
      const w = WEAPONS[kind];
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'opcao-arma';
      b.dataset.arma = String(i);
      b.innerHTML = `<kbd>${(i + 1) % 10}</kbd><span class="nivel"></span><span class="cab">${iconeArma(kind)}<strong>${w.nome}</strong></span>
        ${etiquetasArma(kind)}
        <dl>
          <dt>Dano</dt><dd class="val-dano"></dd>
          <dt>Energia</dt><dd>${w.energia}</dd>
          <dt>Recarga</dt><dd>${numero(w.cd, 2)} s</dd>
        </dl>
        <small class="efeito"></small>
        <span class="selo"></span>`;
      aoTocar(b, () => this.escolher(i), signal);
      this.lista.append(b);
      return b;
    });
    this.aviso = document.createElement('p');
    this.aviso.className = 'aviso-troca';
    this.lista.before(this.aviso);
    this.#desenharNiveis();
    this.#marcar();

    addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.repeat) return;
      const enc = ENCAIXES.findIndex((x) => x.menu === e.code);
      if (enc >= 0) this.alternar(enc);
      else if (this.aberto) {
        const i = TECLAS_OPCAO.findIndex((codigos) => codigos.includes(e.code));
        if (i >= 0) this.escolher(i);
      }
    }, { signal });
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
  }

  /** Segundos de recarga de troca do encaixe (0 se pode trocar agora). */
  esperaTroca(encaixe) {
    return this.livre ? 0 : this.troca[encaixe] ?? 0;
  }

  /** Escolhe a arma de índice i para o encaixe em edição e fecha o menu. */
  escolher(i) {
    if (!this.posse.includes(i) && !ARMAS_INICIAIS.includes(i)) return; // travada: a Loja libera
    const espera = this.esperaTroca(this.encaixe);
    if (espera > 0 && i !== this.encaixes[this.encaixe]) {
      // O stepShip ignoraria a troca: avisa e não muda nada (o menu continua aberto).
      this.aoRecusar?.(`Arma do ${ENCAIXES[this.encaixe].tecla} em troca: ${seg(espera)} s`);
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

  /** Nível de cada arma (índice em ARMAS; me.niveisArmas), para o dano e o efeito das cartas. */
  definirNiveis(niveis) {
    if (!Array.isArray(niveis)) return;
    if (niveis.length === this.niveis.length && niveis.every((n, i) => n === this.niveis[i])) return;
    this.niveis = ARMAS.map((_, i) => niveis[i] ?? 1);
    this.#desenharNiveis();
  }

  #desenharNiveis() {
    this.botoes.forEach((b, i) => {
      const kind = ARMAS[i];
      const nivel = this.niveis[i];
      const nv = b.querySelector('.nivel');
      nv.textContent = `NV ${nivel}`;
      nv.classList.toggle('base', nivel <= 1);
      nv.classList.toggle('max', nivel >= ARMA_NIVEL_MAX);
      b.querySelector('.val-dano').textContent = textoDano(kind, nivel);
      const efeito = descreverArma(kind, nivel);
      b.querySelector('.efeito').textContent = efeito;
      b.title = `${efeito} · ${TIPOS_DANO[WEAPONS[kind].tipoDano]}, ${FUNCOES_ARMA[WEAPONS[kind].funcao].toLowerCase()}`; // em tela baixa o efeito some da carta e fica aqui
    });
  }

  /**
   * Armas que a nave possui (s.armas do servidor). As outras ficam travadas no menu
   * e, se estavam equipadas, o encaixe volta para a padrão.
   */
  definirPosse(armas) {
    const posse = Array.isArray(armas) ? armas : TODAS_AS_ARMAS;
    if (posse.length === this.posse.length && posse.every((a, i) => a === this.posse[i])) return;
    this.posse = [...posse];
    this.encaixes = this.encaixes.map((a, enc) => (this.posse.includes(a) || ARMAS_INICIAIS.includes(a) ? a : ENCAIXE_PADRAO[enc]));
    this.#marcar();
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
    const texto = espera > 0 ? seg(Math.ceil(espera * 10) / 10) : '';
    const chave = `${enc}|${texto}|${this.livre}`;
    if (chave === this.textoTroca) return;
    this.textoTroca = chave;
    this.el.classList.toggle('trocando', espera > 0);
    this.aviso.innerHTML =
      espera > 0
        ? `Troca do <kbd>${ENCAIXES[enc].tecla}</kbd> em recarga: <b>${texto} s</b>`
        : this.livre
          ? 'Na base: troca livre'
          : `Fora da base: trocar trava o encaixe por ${seg(TROCA_ARMA_S)} s`;
    this.aviso.classList.toggle('livre', this.livre && espera <= 0);
    this.botoes.forEach((b, i) => {
      const aqui = i === this.encaixes[enc];
      const la = i === this.encaixes[outro];
      const travada = !this.posse.includes(i) && !ARMAS_INICIAIS.includes(i);
      const esperando = !travada && !aqui && espera > 0;
      b.classList.toggle('sel', aqui);
      b.classList.toggle('no-outro', la);
      b.classList.toggle('travada', travada);
      b.classList.toggle('espera', esperando);
      b.disabled = travada;
      b.querySelector('.selo').textContent =
        aqui && la ? `EM USO · também no ${y.tecla}` : aqui ? 'EM USO' : travada ? 'NA LOJA' : esperando ? `TROCA EM ${texto} s` : la ? `NO ${y.tecla}` : '';
    });
  }
}
