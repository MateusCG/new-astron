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
// no mesmo passo). Arma que a nave não possui (s.armas, a Loja vai preencher) fica
// travada no menu; se chegar ao stepShip, ela cai na padrão do encaixe. Como é
// multijogador, o jogo não pausa com o menu aberto; só os tiros ficam travados
// enquanto ele está na tela. Os números das cartas saem de WEAPONS, então balancear
// em shared/sim.js já atualiza o menu.
//
// O estado "aberto" vem do próprio elemento #menu-armas (atributo hidden), um só
// para os dois encaixes, para quem mais precisar fechar o menu (o ESC, por exemplo)
// só esconder o elemento.

import { WEAPONS, ARMAS, ENCAIXE_PADRAO, TODAS_AS_ARMAS, ARMAS_INICIAIS } from '/shared/sim.js';

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

/** Frase curta do que a arma faz, montada das constantes de shared/sim.js. */
export function descreverArma(kind) {
  const w = WEAPONS[kind];
  const s = (v) => numero(v, Number.isInteger(v) ? 0 : 1);
  if (w.efeito?.tipo === 'dreno') return `Drena ${w.efeito.dps} HP/s por ${s(w.efeito.duracao)} s`;
  if (w.efeito?.tipo === 'lento') return `Alvo ${Math.round((1 - w.efeito.mult) * 100)}% mais lento por ${s(w.efeito.duracao)} s`;
  if (w.efeito?.tipo === 'emp') return `Zera a energia: sem tiro e sem boost por ${s(w.efeito.duracao)} s`;
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

/** Texto do dano na carta: "7×2" (por projétil × quantos) ou o número (a área vai no efeito). */
function textoDano(w) {
  const n = projeteis(w);
  return n > 1 ? `${w.dano}×${n}` : String(w.dano);
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
   * @param {{ aoTrocar?: (encaixe: number, indice: number, kind: string) => void, signal?: AbortSignal }} [opcoes]
   */
  constructor({ aoTrocar, signal } = {}) {
    this.el = document.querySelector('#menu-armas');
    this.titulo = this.el.querySelector('h2');
    this.dica = this.el.querySelector('.dica-encaixe');
    this.lista = this.el.querySelector('.opcoes');
    this.lista.replaceChildren(); // nova partida: cartas desenhadas do zero
    this.el.hidden = true;
    this.aoTrocar = aoTrocar;
    this.encaixes = [...ENCAIXE_PADRAO];
    this.encaixe = 0; // qual encaixe o menu está editando
    this.posse = [...TODAS_AS_ARMAS];
    this.botoes = ARMAS.map((kind, i) => {
      const w = WEAPONS[kind];
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'opcao-arma';
      b.dataset.arma = String(i);
      b.title = descreverArma(kind); // em tela baixa o efeito some da carta e fica aqui
      b.innerHTML = `<kbd>${(i + 1) % 10}</kbd><span class="cab">${iconeArma(kind)}<strong>${w.nome}</strong></span>
        <dl>
          <dt>Dano</dt><dd>${textoDano(w)}</dd>
          <dt>Energia</dt><dd>${w.energia}</dd>
          <dt>Recarga</dt><dd>${numero(w.cd, 2)} s</dd>
        </dl>
        <small class="efeito">${descreverArma(kind)}</small>
        <span class="selo"></span>`;
      aoTocar(b, () => this.escolher(i), signal);
      this.lista.append(b);
      return b;
    });
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

  /** Escolhe a arma de índice i para o encaixe em edição e fecha o menu. */
  escolher(i) {
    if (!this.posse.includes(i) && !ARMAS_INICIAIS.includes(i)) return; // travada: a Loja libera
    const mudou = i !== this.encaixes[this.encaixe];
    this.encaixes[this.encaixe] = i;
    this.#marcar();
    this.el.hidden = true;
    if (mudou) this.aoTrocar?.(this.encaixe, i, ARMAS[i]);
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
    this.botoes.forEach((b, i) => {
      const aqui = i === this.encaixes[enc];
      const la = i === this.encaixes[outro];
      const travada = !this.posse.includes(i) && !ARMAS_INICIAIS.includes(i);
      b.classList.toggle('sel', aqui);
      b.classList.toggle('no-outro', la);
      b.classList.toggle('travada', travada);
      b.disabled = travada;
      b.querySelector('.selo').textContent = aqui && la ? `EM USO · também no ${y.tecla}` : aqui ? 'EM USO' : la ? `NO ${y.tecla}` : travada ? 'NA LOJA' : '';
    });
  }
}
