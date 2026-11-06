// Lista dos debuffs que a sua nave recebeu, como no AstroN original: cada golpe com
// efeito escreve uma linha no canto esquerdo com o ícone do efeito, o nome e o que ele
// faz, com o valor e a duração ("Magma damage : HP diminished by 100.0 for 5.0 sec."
// no original; CChatList::AddCollisionMsg, o nome em rosa claro e o texto em
// vermelho, com o ícone item/<nome>_s ao lado). O servidor manda o evento privado
// {e:'debuff', ef, v?, dur?} só para quem foi atingido (server/golpes.js
// mensagemDebuff); os textos aqui são os do original em português, com o número do
// jogo. A linha some depois que o efeito acaba (no mínimo LINHA_MIN_S); no máximo
// LINHAS_MAX linhas (a mais velha sai). O mesmo texto da última linha renova a linha
// (o campo que fere a cada meio segundo não enche a lista). Ícones em public/texturas/debuffs/ (os do
// original, 32 × 32).

import { tr, localeNum } from '../../shared/idioma.js';

export const PASTA_ICONES_DEBUFF = '/texturas/debuffs/';
const LINHAS_MAX = 6;
const LINHA_MIN_S = 4; // s na tela, mesmo para efeito de duração curta ou sem duração
const SAI_S = 0.6; // s do esmaecer

const n1 = (x) => (x ?? 0).toLocaleString(localeNum(), { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/**
 * Por efeito (o `ef` do evento): o ícone do original, o nome e o texto. `{v}` e
 * `{dur}` viram o valor e a duração com uma casa (como o %0.1f do original).
 */
export const DEBUFFS = {
  magma: { icone: '1164001_s', nome: tr('Dano de magma'), texto: tr('HP diminui {v} em {dur} s') },
  resist: { icone: 'allresist_s', nome: tr('Resistências reduzidas'), texto: tr('Todas as resistências caem {v} por {dur} s') },
  descarga: { icone: 'discharge_s', nome: tr('Descarga de energia'), texto: tr('Energia descarregada em {v}%') },
  semTiro: { icone: 'cross008_s', nome: tr('Ataque paralisado'), texto: tr('Paralisado por {dur} s') },
  lento: { icone: 'cross007_s', nome: tr('Lentidão'), texto: tr('Velocidade reduzida em {v}% por {dur} s') },
  imovel: { icone: 'cross007_s', nome: tr('Movimento paralisado'), texto: tr('Movimento paralisado por {dur} s') },
  paralisa: { icone: 'cross002_s', nome: tr('Travamento'), texto: tr('Movimento e ataque paralisados por {dur} s') },
  trava: { icone: 'cross007_s', nome: tr('Aceleração paralisada'), texto: tr('Aceleração e frenagem desligadas por {dur} s') },
  cadencia: { icone: 'cross008_s', nome: tr('Cadência atrapalhada'), texto: tr('Cadência de tiro cai {v}% por {dur} s') },
  fraco: { icone: 'cross008_s', nome: tr('Ataque enfraquecido'), texto: tr('Dano de ataque cai {v}% por {dur} s') },
  vulnFisico: { icone: 'cross005_s', nome: tr('Resistência física reduzida'), texto: tr('Vulnerável a ataque físico por {dur} s') },
  vulnLaser: { icone: 'cross004_s', nome: tr('Resistência laser reduzida'), texto: tr('Vulnerável a ataque laser por {dur} s') },
  revela: { icone: 'cross009_s', nome: tr('Camuflagem paralisada'), texto: tr('Camuflagem desligada por {dur} s') },
  cego: { icone: 'raderoff_s', nome: tr('Radar paralisado'), texto: tr('Radar desligado por {dur} s') },
  desgoverno: { icone: 'cross010_s', nome: tr('Controle embaralhado'), texto: tr('A nave anda ao contrário por {dur} s') },
  drenoDuplo: { icone: 'discharge_s', nome: tr('Descarga dupla'), texto: tr('Energia e escudo caem {v} por segundo por {dur} s') },
  drenoEn: { icone: 'discharge_s', nome: tr('Energia drenada'), texto: tr('Energia cai {v} por segundo por {dur} s') },
  semRegen: { icone: 'discharge_s', nome: tr('Energia paralisada'), texto: tr('Recuperação de energia desligada por {dur} s') },
  enCara: { icone: 'cross013_s', nome: tr('Consumo de energia'), texto: tr('Gasto de energia sobe {v}% por {dur} s') },
  recuo: { icone: 'cross011_s', nome: tr('Dano devolvido'), texto: tr('Devolve {v}% do dano a quem ataca por {dur} s') },
};

/** O texto de um evento de debuff ({ ef, v, dur }), ou null para efeito sem mensagem. */
export function textoDebuff({ ef, v, dur }) {
  const d = DEBUFFS[ef];
  if (!d) return null;
  return { icone: d.icone, nome: d.nome, texto: d.texto.replace('{v}', n1(v)).replace('{dur}', n1(dur)) };
}

export class ListaDebuffs {
  /** `el`: a lista (#debuffs) no HUD. */
  constructor(el) {
    this.el = el;
    // Os ícones baixam já (nada carrega no meio da partida).
    this.icones = Object.fromEntries(
      [...new Set(Object.values(DEBUFFS).map((d) => d.icone))].map((nome) => {
        const img = new Image();
        img.src = `${PASTA_ICONES_DEBUFF}${nome}.png`;
        return [nome, img.src];
      }),
    );
  }

  /**
   * Escreve a linha do debuff recebido (o evento do servidor). O mesmo texto da última
   * linha ainda na tela (o campo do SN-4 fere a cada 0,5 s, a rajada de fogo pega oito
   * vezes) renova aquela linha em vez de escrever outra.
   */
  adicionar(e) {
    const t = textoDebuff(e);
    if (!t || !this.el) return;
    const chave = `${t.nome}|${t.texto}`;
    const s = Math.max(LINHA_MIN_S, e.dur ?? 0);
    let li = this.el.lastElementChild;
    if (li?.dataset.chave === chave) {
      li.classList.remove('sai');
      clearTimeout(li._sai);
      clearTimeout(li._tira);
    } else {
      li = document.createElement('li');
      li.dataset.chave = chave;
      const img = document.createElement('img');
      img.src = this.icones[t.icone];
      img.alt = '';
      const nome = document.createElement('b');
      nome.textContent = `${t.nome}:`;
      const texto = document.createElement('span');
      texto.textContent = t.texto;
      li.append(img, nome, texto);
      this.el.append(li);
      while (this.el.children.length > LINHAS_MAX) this.el.firstElementChild.remove();
    }
    li._sai = setTimeout(() => li.classList.add('sai'), s * 1000);
    li._tira = setTimeout(() => li.remove(), (s + SAI_S) * 1000);
  }

  /** Partida nova ou morte: limpa a lista. */
  limpar() {
    if (this.el) this.el.textContent = '';
  }
}
