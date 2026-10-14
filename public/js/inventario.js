// Janela INVENTÁRIO (#inventario, tecla I ou o botão do HUD; ESC fecha): o que vai
// na nave, como a INVENTORY do Astro-N original, com a identidade visual do jogo
// novo. Em cima, a tabela Ph. / El. / Op. × Arma Z / Arma X / Resistência e a
// miniatura da nave; no meio, os seis encaixes (Arma Z, Arma X, Escudo, Armadura,
// Potenciador 1 e 2); embaixo, o compartimento: tudo o que o piloto tem e não está
// na nave (armas compradas e de fábrica, escudos, armaduras, potenciadores).
//
// Clique (ou toque) num item do compartimento equipa no encaixe da categoria dele:
// - Escudo, armadura e potenciador pedem ao servidor {t:'equipar', slot, item}
//   (o potenciador vai no primeiro encaixe vazio, ou no 1). Só vale POUSADO na
//   própria base (anel ou plataformas): fora dela a janela abre igual e avisa, e o
//   servidor recusa com 'nao_pousado'. Clique num desses encaixes ocupado tira o
//   item ({item: null}).
// - Armas não passam pelo servidor aqui: são os `encaixes` do cliente, que vão nos
//   campos a/a2 de cada comando, a mesma coisa que o menu do Q/E faz (reusa
//   MenuArmas.equipar, com a recarga de troca fora da base). A arma vai no encaixe
//   marcado (Z ou X: clique no encaixe da arma escolhe qual); a nave sempre tem
//   duas armas, então o encaixe de arma não esvazia.
//
// Passar o mouse (ou tocar) num item mostra o detalhe como no original: nome e
// versão (V1 a V8), tipo de equipamento, efeitos, nível exigido e classe. A posse e
// o que está equipado vêm do snapshot (me.equip, me.equipado, me.armas, me.niveis).

import { EQUIPAMENTOS, ORDEM_EQUIP, CATEGORIA_DO_SLOT } from '/shared/equipamentos.js';
import { ARMAS } from '/shared/sim.js';
import { iconeArma, nomeArma, ordenarPorCategoria } from './armas.js';
import { iconeEquip, nomeEquip, detalheEquip, detalheArma, tabelaTipos } from './equipamento.js';
import { MENSAGEM_ERRO } from './servicos.js';
import { miniatura } from './vitrine.js';
import { naveDe } from '/shared/naves.js';

/** Encaixes na ordem da janela (duas colunas, como no original). */
const ENCAIXES_INV = [
  { slot: 'z', nome: 'Arma Z', arma: 0 },
  { slot: 'x', nome: 'Arma X', arma: 1 },
  { slot: 'escudo', nome: 'Escudo' },
  { slot: 'armadura', nome: 'Armadura' },
  { slot: 'pot1', nome: 'Potenciador 1' },
  { slot: 'pot2', nome: 'Potenciador 2' },
];

/** Mensagens do pedido {t:'equipar'} (o resto vem do painel da Loja). */
const MENSAGEM = {
  ...MENSAGEM_ERRO,
  nao_pousado: 'Para equipar, pouse na sua base (anel ou plataformas)',
  sem_item: 'Você não tem esse item: compre na Loja',
  invalido: 'Esse item não vai nesse encaixe',
  ja_possui: 'Esse potenciador já está no outro encaixe',
};

const vazioEquipado = () => ({ escudo: null, armadura: null, pot: [null, null] });

/** O item equipado no encaixe de equipamento (chave ou null). */
function noSlot(equipado, slot) {
  if (slot === 'pot1') return equipado.pot?.[0] ?? null;
  if (slot === 'pot2') return equipado.pot?.[1] ?? null;
  return equipado[slot] ?? null;
}

export class PainelInventario {
  /**
   * @param {{ enviar: (m: object) => void, menuArmas: import('./armas.js').MenuArmas,
   *   noticia: (texto: string, tipo?: string) => void, signal: AbortSignal, aoAbrir?: () => void }} opcoes
   *   `aoAbrir` fecha a outra janela lateral (o STATUS).
   */
  constructor({ enviar, menuArmas, noticia, signal, aoAbrir = () => {} }) {
    this.enviar = enviar;
    this.menuArmas = menuArmas;
    this.noticia = noticia;
    this.aoAbrir = aoAbrir;
    this.el = document.querySelector('#inventario');
    this.tabela = this.el.querySelector('.tabela');
    this.nave = this.el.querySelector('.nave-inv');
    this.slotsEl = this.el.querySelector('.slots');
    this.grade = this.el.querySelector('.grade-inv');
    this.conta = this.el.querySelector('.conta-inv');
    this.avisoBase = this.el.querySelector('.aviso-base');
    this.msg = this.el.querySelector('.msg');
    this.detalhe = this.el.querySelector('.detalhe');
    this.el.hidden = true;
    this.alvoArma = 0; // encaixe que recebe a próxima arma (0 = Z, 1 = X)
    this.naBase = false;
    this.estado = { race: null, classe: null, tier: 0, nivel: 1, equip: {}, equipado: vazioEquipado(), status: null };
    this.chave = '';
    this.chaveNave = '';
    this.foco = null;

    this.el.addEventListener(
      'click',
      (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        if (b.classList.contains('fechar')) this.fechar();
        else if (b.dataset.slot) this.#clicarSlot(b.dataset.slot);
        else if (b.dataset.arma) this.#equiparArma(Number(b.dataset.arma));
        else if (b.dataset.equip) this.#equiparItem(b.dataset.equip);
        b.blur(); // o foco no botão não pode prender as teclas do jogo
      },
      { signal },
    );
    this.el.addEventListener(
      'pointerover',
      (e) => {
        const alvo = e.target.closest?.('[data-slot], [data-arma], [data-equip]');
        if (alvo) this.#focar(alvo);
      },
      { signal },
    );
    this.el.addEventListener(
      'pointerleave',
      () => {
        if (!document.body.classList.contains('toque')) this.#focar(null);
      },
      { signal },
    );
    document.querySelector('#inventario-hud')?.addEventListener(
      'click',
      (e) => {
        this.alternar();
        e.currentTarget.blur();
      },
      { signal },
    );
    addEventListener(
      'keydown',
      (e) => {
        if (e.code !== 'KeyI' || e.repeat || e.target instanceof HTMLInputElement) return;
        this.alternar();
      },
      { signal },
    );
  }

  get aberto() {
    return !this.el.hidden;
  }

  abrir() {
    this.aoAbrir();
    this.el.hidden = false;
    this.msg.textContent = '';
    this.#desenhar(true);
  }

  fechar() {
    if (this.el.contains(document.activeElement)) document.activeElement.blur();
    this.el.hidden = true;
    this.#focar(null);
  }

  alternar() {
    if (this.aberto) this.fechar();
    else this.abrir();
  }

  /** Estado do snapshot: { me, nivel }. Tolera os campos novos ausentes. */
  atualizar({ me, nivel }) {
    const eq = me?.equipado;
    this.estado = {
      race: me?.race ?? null,
      classe: me?.classe ?? null,
      tier: me?.tier ?? 0,
      nivel: nivel ?? 1,
      equip: me?.equip ?? {},
      equipado: { escudo: eq?.escudo ?? null, armadura: eq?.armadura ?? null, pot: [eq?.pot?.[0] ?? null, eq?.pot?.[1] ?? null] },
      status: me?.status ?? null,
    };
    if (this.aberto) this.#desenhar(false);
  }

  /**
   * A cada quadro, de main.js: a nave está pousada na própria base (anel ou
   * plataforma)? Só aí o servidor deixa trocar escudo, armadura e potenciador.
   */
  lugar(naBase) {
    if (naBase === this.naBase) return;
    this.naBase = naBase;
    if (this.aberto) this.#desenhar(true);
  }

  /** Resposta do servidor a um pedido {t:'equipar'}. */
  resultado(m) {
    const ok = !!m.ok;
    this.msg.textContent = ok ? 'Feito' : (MENSAGEM[m.codigo] ?? 'Não deu certo');
    this.msg.className = 'msg ' + (ok ? 'bom' : 'ruim');
  }

  #clicarSlot(slot) {
    const enc = ENCAIXES_INV.find((x) => x.slot === slot);
    if (!enc) return;
    if (enc.arma !== undefined) {
      // Encaixe de arma: escolhe para qual vai a próxima arma do compartimento.
      this.alvoArma = enc.arma;
      this.#desenhar(true);
      return;
    }
    if (!noSlot(this.estado.equipado, slot)) return;
    this.enviar({ t: 'equipar', slot, item: null });
  }

  #equiparArma(i) {
    if (this.menuArmas.equipar(this.alvoArma, i)) {
      this.msg.textContent = '';
      this.#desenhar(true);
    }
  }

  #equiparItem(chave) {
    const e = EQUIPAMENTOS[chave];
    if (!e) return;
    let slot = e.categoria;
    if (e.categoria === 'potenciador') {
      const [a, b] = this.estado.equipado.pot;
      slot = !a ? 'pot1' : !b ? 'pot2' : 'pot1';
    }
    this.enviar({ t: 'equipar', slot, item: chave });
  }

  /** Armas que a nave tem (de fábrica e compradas), na ordem do menu. */
  #armasPossuidas() {
    const m = this.menuArmas;
    return ordenarPorCategoria(m.disponiveis.filter((i) => m.possui(i)));
  }

  #desenhar(forcar) {
    const s = this.estado;
    const m = this.menuArmas;
    const encaixes = [...m.encaixes];
    const chave = JSON.stringify([s, encaixes, m.niveis, m.posse, this.alvoArma, this.naBase]);
    if (!forcar && chave === this.chave) return;
    this.chave = chave;

    this.tabela.innerHTML = tabelaTipos({ encaixes, niveis: m.niveis, status: s.status });
    this.#desenharNave();

    // Encaixes da nave.
    this.slotsEl.innerHTML = ENCAIXES_INV.map((enc) => {
      if (enc.arma !== undefined) {
        const i = encaixes[enc.arma];
        const nv = m.niveis[i] ?? 1;
        const alvo = this.alvoArma === enc.arma;
        return `<button type="button" class="slot arma${alvo ? ' alvo' : ''}" data-slot="${enc.slot}" title="${alvo ? 'A próxima arma do compartimento vai aqui' : 'Clique para a próxima arma ir aqui'}">
          <span class="rot">${enc.nome}${alvo ? ' <i>◂ recebe</i>' : ''}</span><span class="ic">${ARMAS[i] ? iconeArma(ARMAS[i], nv) : ''}</span><span class="nm">${ARMAS[i] ? nomeArma(ARMAS[i]) : ''}</span><b class="v">V${nv}</b>
        </button>`;
      }
      const k = noSlot(s.equipado, enc.slot);
      const nv = s.equip[k] ?? 1;
      return `<button type="button" class="slot${k ? '' : ' vazio'}" data-slot="${enc.slot}" ${k ? `data-chave="${k}"` : ''} title="${k ? 'Clique para tirar' : 'Vazio'}">
        <span class="rot">${enc.nome}</span><span class="ic">${iconeEquip(k, CATEGORIA_DO_SLOT[enc.slot])}</span><span class="nm">${k ? EQUIPAMENTOS[k].nomePt : 'Vazio'}</span>${k ? `<b class="v">V${nv}</b>` : ''}
      </button>`;
    }).join('');

    this.avisoBase.className = 'aviso-base' + (this.naBase ? ' livre' : '');
    this.avisoBase.textContent = this.naBase
      ? 'Na base: escudo, armadura e potenciadores trocam livre'
      : 'Escudo, armadura e potenciadores só trocam pousado na sua base · armas trocam em qualquer lugar';

    // Compartimento: o que se tem e não está na nave.
    const armas = this.#armasPossuidas().filter((i) => !encaixes.includes(i));
    const equipados = new Set([s.equipado.escudo, s.equipado.armadura, ...s.equipado.pot].filter(Boolean));
    const itens = ORDEM_EQUIP.filter((k) => Object.hasOwn(s.equip, k) && !equipados.has(k));
    const cartas = [
      ...armas.map((i) => {
        const nv = m.niveis[i] ?? 1;
        return `<button type="button" class="item-inv" data-arma="${i}"><span class="ic">${iconeArma(ARMAS[i], nv)}</span><span class="nm">${nomeArma(ARMAS[i])}</span><b class="v">V${nv}</b></button>`;
      }),
      ...itens.map((k) => {
        const nv = s.equip[k] ?? 1;
        return `<button type="button" class="item-inv" data-equip="${k}"><span class="ic">${iconeEquip(k)}</span><span class="nm">${EQUIPAMENTOS[k].nomePt}</span><b class="v">V${nv}</b></button>`;
      }),
    ];
    this.conta.textContent = String(cartas.length);
    this.grade.innerHTML = cartas.length ? cartas.join('') : '<p class="nota-inv">Vazio: o que você comprar na Loja e não estiver na nave aparece aqui</p>';
    if (this.foco) this.#focar(this.el.querySelector(this.foco), true);
  }

  /** Miniatura da nave atual (vitrine.js; uma por modelo, com cache). */
  #desenharNave() {
    const { race, classe, tier } = this.estado;
    const chave = `${race}/${classe}/${tier}`;
    if (chave === this.chaveNave || !race) return;
    this.chaveNave = chave;
    const n = naveDe(race, classe, tier);
    this.nave.innerHTML = `<span class="mini"></span><span class="nome-nave">${n?.nome ?? ''}</span>`;
    miniatura(race, classe, tier).then((src) => {
      if (src && this.chaveNave === chave) this.nave.querySelector('.mini').innerHTML = `<img src="${src}" alt="" />`;
    });
  }

  /**
   * Detalhe do item sob o mouse (ou tocado), ao lado da janela. `alvo` é o botão
   * (encaixe ou item do compartimento); null esconde.
   */
  #focar(alvo, redesenho = false) {
    if (!alvo) {
      this.foco = null;
      this.detalhe.hidden = true;
      return;
    }
    const s = this.estado;
    const m = this.menuArmas;
    let html = '';
    const tecla = this.alvoArma ? 'X' : 'Z';
    if (alvo.dataset.slot) {
      const enc = ENCAIXES_INV.find((x) => x.slot === alvo.dataset.slot);
      if (enc.arma !== undefined) {
        const i = m.encaixes[enc.arma];
        html = detalheArma(i, m.niveis[i] ?? 1, `No ${enc.arma ? 'X' : 'Z'} · clique para a próxima arma ir aqui`);
      } else if (alvo.dataset.chave) {
        const k = alvo.dataset.chave;
        html = detalheEquip(k, s.equip[k] ?? 1, this.naBase ? 'Clique para tirar' : 'Para tirar, pouse na sua base', !this.naBase);
      }
      this.foco = `[data-slot="${alvo.dataset.slot}"]`;
    } else if (alvo.dataset.arma) {
      const i = Number(alvo.dataset.arma);
      html = detalheArma(i, m.niveis[i] ?? 1, `Clique para equipar no ${tecla}`);
      this.foco = `[data-arma="${i}"]`;
    } else if (alvo.dataset.equip) {
      const k = alvo.dataset.equip;
      html = detalheEquip(k, s.equip[k] ?? 1, this.naBase ? 'Clique para equipar' : 'Para equipar, pouse na sua base', !this.naBase);
      this.foco = `[data-equip="${k}"]`;
    }
    if (!html) {
      this.detalhe.hidden = true;
      return;
    }
    if (this.detalhe.dataset.html !== html) {
      this.detalhe.innerHTML = html;
      this.detalhe.dataset.html = html;
    }
    this.detalhe.hidden = false;
    if (!redesenho) {
      this.detalhe.style.setProperty('--topo', `${alvo.getBoundingClientRect().top - this.el.getBoundingClientRect().top}px`);
    }
  }
}
