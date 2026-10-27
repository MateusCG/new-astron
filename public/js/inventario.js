// Janela INVENTÁRIO (#inventario, tecla I ou o botão do HUD; ESC fecha): o que vai
// na nave, como a INVENTORY do Astro-N original, com a identidade visual do jogo
// novo. Em cima, a tabela Ph. / El. / Op. × Arma Z / Arma X / Resistência e a
// miniatura da nave; no meio, os seis encaixes (Arma Z, Arma X, Escudo, Armadura,
// Potenciador 1 e 2); embaixo, o COMPARTIMENTO "n/12": tudo o que o piloto tem e
// não está na nave (armas fora do Z e do X, inclusive as de fábrica, e escudos,
// armaduras e potenciadores fora dos encaixes). As duas primeiras casas do
// compartimento são a TROCA RÁPIDA, como no original: a arma guardada no Q troca com
// a do Z quando se aperta Q, e a do E com a do X (ArmasNave em armas.js; elas contam
// nos 12).
//
// Cada coisa é um objeto (uma instância de me.inv, com a sua versão V1 a V8 e o ouro
// pago nela); a mesma arma pode estar em duas cópias, cada uma com a sua versão, e
// cada cópia aparece como um item (no Z, no X ou no compartimento). Clicar (ou tocar) num item abre uma caixinha junto dele com o que dá
// para fazer, e cada opção que não dá agora fica apagada com o porquê embaixo:
// - Item do compartimento: Equipar (arma: no Z ou no X; potenciador: no 1 ou no 2),
//   arma também Guardar no Q / no E, Vender (metade do que foi pago; arma de fábrica
//   não vende) e Evoluir (Vn → Vn+1 pela taxa de tuning; na V8 acabou).
// - Casa da troca rápida: ocupada, Trocar com o Z/X agora, Tirar (volta para o resto
//   do compartimento), Vender e Evoluir; vazia, Guardar cada arma do compartimento.
// - Encaixe ocupado: Tirar (volta para o compartimento; cheio, não cabe) e Evoluir.
//   Encaixe de arma não esvazia (a nave sempre leva duas): no lugar do Tirar vem
//   Trocar com a arma guardada no Q/E.
// Equipar vale em qualquer lugar; vender e evoluir só pousado e parado na própria base
// (anel ou plataformas). O cliente só PEDE ({t:'equipar', slot, inst}, {t:'vender',
// inst}, {t:'evoluirItem', inst}); o servidor valida, cobra e o snapshot traz o
// inventário novo. As armas Z/X e as casas da troca rápida não passam pelo
// servidor: são os `encaixes` e as `casas` do cliente (ids das instâncias; os
// encaixes vão nos campos a/a2 de cada comando), o mesmo caminho do Q/E
// (ArmasNave.equipar, com a recarga de troca fora da base).
//
// Passar o mouse (ou tocar) num item mostra o detalhe como no original, à esquerda da
// janela: nome e versão, tipo, efeitos e classe. Preços e contas saem de
// shared/loja.js (precoVenda, precoEvoluirInst, noCompartimento), as mesmas do servidor.

import { EQUIPAMENTOS, CATEGORIA_DO_SLOT, NIVEL_ITEM_MAX } from '/shared/equipamentos.js';
import { ARMAS, IDX_ARMA } from '/shared/sim.js';
import { COMPARTIMENTO_MAX, armaDaInst, instDoInv, noCompartimento, precoVenda, precoEvoluirInst, equipadoVazio } from '/shared/loja.js';
import { iconeArma, nomeArma, ENCAIXES } from './armas.js';
import { iconeEquip, detalheEquip, detalheArma, tabelaTipos } from './equipamento.js';
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
const NOME_SLOT = Object.fromEntries(ENCAIXES_INV.map((e) => [e.slot, e.nome]));

/** Mensagens dos pedidos do inventário (o resto vem do painel da Loja). */
const MENSAGEM = {
  ...MENSAGEM_ERRO,
  nao_pousado: 'Para vender e evoluir, pouse e pare na sua base (anel ou plataformas)',
  cheio: 'Compartimento cheio: venda algo antes de tirar da nave',
  equipado: 'Esse item está na nave: tire antes de vender',
  sem_item: 'Esse item não está mais com você',
  limite: 'Já está na V8, a última versão',
  ouro_insuficiente: 'Ouro insuficiente para evoluir',
};
/** 'invalido' muda de sentido conforme o pedido. */
const INVALIDO = {
  equipar: 'Esse item não vai nesse encaixe',
  vender: 'Arma de fábrica não se vende',
  evoluirItem: 'Esse item não evolui',
};

const numero = (v) => Math.round(v).toLocaleString('pt-BR');
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Id da instância no encaixe de equipamento (ou null). */
function noSlot(equipado, slot) {
  if (slot === 'pot1') return equipado.pot?.[0] ?? null;
  if (slot === 'pot2') return equipado.pot?.[1] ?? null;
  return equipado[slot] ?? null;
}

/** Nome da instância com a versão ("Escudo Neutron Op. V3"). */
function nomeInst(inst) {
  if (!inst) return '';
  if (inst.tipo === 'arma') return `${nomeArma(inst.chave)} V${inst.nivel}`;
  return `${EQUIPAMENTOS[inst.chave]?.nomePt ?? inst.chave} V${inst.nivel}`;
}

export class PainelInventario {
  /**
   * @param {{ enviar: (m: object) => void, armasNave: import('./armas.js').ArmasNave,
   *   noticia: (texto: string, tipo?: string) => void, signal: AbortSignal, aoAbrir?: () => void }} opcoes
   *   `aoAbrir` fecha a outra janela lateral (o STATUS).
   */
  constructor({ enviar, armasNave, noticia, signal, aoAbrir = () => {} }) {
    this.enviar = enviar;
    this.armasNave = armasNave;
    this.noticia = noticia;
    this.aoAbrir = aoAbrir;
    this.el = document.querySelector('#inventario');
    this.corpo = this.el.querySelector('.corpo');
    this.tabela = this.el.querySelector('.tabela');
    this.nave = this.el.querySelector('.nave-inv');
    this.slotsEl = this.el.querySelector('.slots');
    this.grade = this.el.querySelector('.grade-inv');
    this.casasEl = this.el.querySelector('.casas-troca');
    this.conta = this.el.querySelector('.conta-inv');
    this.avisoBase = this.el.querySelector('.aviso-base');
    this.msg = this.el.querySelector('.msg');
    this.ouroEl = this.el.querySelector('.ouro-janela b');
    this.detalhe = this.el.querySelector('.detalhe');
    this.caixaEl = document.createElement('div');
    this.caixaEl.className = 'caixa-item';
    this.caixaEl.hidden = true;
    this.caixaEl.setAttribute('role', 'menu');
    // Dentro da área que rola: a caixinha anda junto com o item.
    this.corpo.append(this.caixaEl);
    this.el.hidden = true;
    this.naBase = false;
    this.estado = { race: null, classe: null, tier: 0, ouro: 0, inv: [], compMax: COMPARTIMENTO_MAX, equipado: equipadoVazio(), status: null };
    this.caixa = null; // { inst } (item do compartimento), { slot } (encaixe) ou { casa } (troca rápida), com a caixinha aberta
    this.pedidos = new Map(); // id da instância -> texto do sucesso (venda e evolução)
    this.chave = '';
    this.chaveNave = '';
    this.foco = null;

    this.el.addEventListener(
      'click',
      (e) => {
        const b = e.target.closest('button');
        if (!b) {
          if (!e.target.closest('.caixa-item')) this.fecharCaixa();
          return;
        }
        if (b.classList.contains('fechar')) this.fechar();
        else if (b.dataset.acao) this.#agir(b);
        else if (b.dataset.slot) this.#abrirCaixa({ slot: b.dataset.slot }, b);
        else if (b.dataset.casa) this.#abrirCaixa({ casa: Number(b.dataset.casa) }, b);
        else if (b.dataset.inst) this.#abrirCaixa({ inst: Number(b.dataset.inst) }, b);
        b.blur(); // o foco no botão não pode prender as teclas do jogo
      },
      { signal },
    );
    this.el.addEventListener(
      'pointerover',
      (e) => {
        if (this.caixa || e.target.closest?.('.caixa-item')) return;
        const alvo = e.target.closest?.('[data-slot], [data-inst], [data-casa]');
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
    this.fecharCaixa();
    this.el.hidden = true;
    this.#focar(null);
  }

  alternar() {
    if (this.aberto) this.fechar();
    else this.abrir();
  }

  /** Fecha a caixinha do item; devolve se ela estava aberta (o ESC fecha só ela). */
  fecharCaixa() {
    const estava = !!this.caixa;
    this.caixa = null;
    this.caixaEl.hidden = true;
    for (const el of this.el.querySelectorAll('.com-caixa')) el.classList.remove('com-caixa');
    return estava;
  }

  /** Estado do snapshot: { me, nivel, ouro }. Tolera os campos novos ausentes. */
  atualizar({ me, nivel, ouro }) {
    const eq = me?.equipado;
    this.estado = {
      race: me?.race ?? null,
      classe: me?.classe ?? null,
      tier: me?.tier ?? 0,
      nivel: nivel ?? 1,
      ouro: ouro ?? 0,
      inv: Array.isArray(me?.inv) ? me.inv : [],
      compMax: me?.compMax ?? COMPARTIMENTO_MAX,
      equipado: { escudo: eq?.escudo ?? null, armadura: eq?.armadura ?? null, pot: [eq?.pot?.[0] ?? null, eq?.pot?.[1] ?? null] },
      status: me?.status ?? null,
    };
    if (this.aberto) this.#desenhar(false);
  }

  /**
   * A cada quadro, de main.js: a nave está pousada e parada na própria base (anel ou
   * plataforma)? Só aí o servidor deixa vender e evoluir.
   */
  lugar(naBase) {
    if (naBase === this.naBase) return;
    this.naBase = naBase;
    if (this.aberto) this.#desenhar(true);
  }

  /** Resposta do servidor a um pedido {t:'equipar'|'vender'|'evoluirItem'}. */
  resultado(m) {
    const ok = !!m.ok;
    let texto;
    if (ok) {
      texto = m.acao === 'equipar' ? 'Feito' : (this.pedidos.get(m.item) ?? 'Feito');
      if (m.acao === 'vender') this.noticia(texto, 'bom');
    } else if (m.codigo === 'invalido') texto = INVALIDO[m.acao] ?? MENSAGEM.invalido;
    else texto = MENSAGEM[m.codigo] ?? 'Não deu certo';
    this.pedidos.delete(m.item);
    this.msg.textContent = texto;
    this.msg.className = 'msg ' + (ok ? 'bom' : 'ruim');
  }

  /** Instâncias do compartimento (as armas pelos encaixes do cliente, ids que vão no comando). */
  #compartimento() {
    const s = this.estado;
    return noCompartimento(s.inv, s.equipado, this.armasNave.encaixes);
  }

  /** A instância da arma que está no encaixe enc (0 = Z, 1 = X). */
  #instDaArma(enc) {
    return instDoInv(this.estado.inv, this.armasNave.encaixes[enc]);
  }

  /** A instância no encaixe (de arma ou de equipamento), ou null. */
  #instDoSlot(slot) {
    const enc = ENCAIXES_INV.find((x) => x.slot === slot);
    if (!enc) return null;
    if (enc.arma !== undefined) return this.#instDaArma(enc.arma);
    return instDoInv(this.estado.inv, noSlot(this.estado.equipado, slot));
  }

  /** A instância guardada na casa de troca rápida k (0 = Q, 1 = E), ou null. */
  #instDaCasa(k) {
    return instDoInv(this.estado.inv, this.armasNave.casas[k]);
  }

  /** As armas do compartimento fora das casas da troca rápida (as que dá para guardar). */
  #armasSoltas() {
    const casas = this.armasNave.casas;
    return this.#compartimento().filter((x) => x.tipo === 'arma' && !casas.includes(x.id));
  }

  /** Por que a troca com o encaixe enc não dá agora ('' = dá). */
  #porqueNaoTroca(enc) {
    const espera = this.armasNave.esperaTroca(enc);
    return espera > 0 ? `Arma ${ENCAIXES[enc].tecla} carregando: ${espera.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} s` : '';
  }

  /** Abre (ou fecha, se já aberta no mesmo) a caixinha junto do botão clicado. */
  #abrirCaixa(alvo, botao) {
    const aberta = this.caixa;
    const mesmo = aberta && (alvo.slot ? aberta.slot === alvo.slot : alvo.casa !== undefined ? aberta.casa === alvo.casa : aberta.inst === alvo.inst);
    this.fecharCaixa();
    if (mesmo) return;
    if (alvo.slot && !this.#instDoSlot(alvo.slot)) return; // encaixe vazio: nada a fazer
    // Casa da troca rápida vazia sem arma para guardar: nada a fazer.
    if (alvo.casa !== undefined && !this.#instDaCasa(alvo.casa) && !this.#armasSoltas().length) return;
    this.caixa = alvo;
    this.#focar(null); // o detalhe do mouse sai: a caixinha já diz o que é
    botao.classList.add('com-caixa');
    this.#desenharCaixa();
    // Embaixo do item (ou em cima, se não couber na parte visível), alinhada com ele;
    // as contas são na área que rola (a caixinha mora nela).
    const c = this.corpo.getBoundingClientRect();
    const r = botao.getBoundingClientRect();
    this.caixaEl.hidden = false;
    const w = this.caixaEl.offsetWidth;
    const h = this.caixaEl.offsetHeight;
    const left = Math.max(0, Math.min(r.left - c.left, c.width - w - 4));
    const baixo = r.bottom - c.top + 4;
    const cabe = baixo + h <= c.height || r.top - c.top - h - 4 < 0;
    const top = this.corpo.scrollTop + (cabe ? baixo : r.top - c.top - h - 4);
    this.caixaEl.style.left = `${left}px`;
    this.caixaEl.style.top = `${top}px`;
  }

  /** Por que não dá para vender a instância agora ('' = dá). */
  #porqueNaoVende(inst) {
    if (inst.fabrica) return 'Arma de fábrica não se vende';
    if (!this.naBase) return 'Só pousado e parado na sua base';
    return '';
  }

  /** Por que não dá para evoluir a instância agora ('' = dá), e o preço. */
  #evolucao(inst) {
    const preco = precoEvoluirInst(inst);
    if (preco === null) return { preco, porque: `Já está na V${NIVEL_ITEM_MAX}, a última versão` };
    if (!this.naBase) return { preco, porque: 'Só pousado e parado na sua base' };
    if (this.estado.ouro < preco) return { preco, porque: `Ouro insuficiente: faltam ${numero(preco - this.estado.ouro)}` };
    return { preco, porque: '' };
  }

  /** Conteúdo da caixinha: o nome e as opções (apagadas com o motivo quando não dá). */
  #desenharCaixa() {
    const c = this.caixa;
    if (!c) return;
    const s = this.estado;
    const casa = c.casa;
    const inst = c.slot ? this.#instDoSlot(c.slot) : casa !== undefined ? this.#instDaCasa(casa) : instDoInv(s.inv, c.inst);
    // Sumiu (vendido, ou o encaixe esvaziou), deixou o compartimento ou a casa vazia
    // não tem mais arma para guardar: fecha.
    const sumiu = casa !== undefined ? !inst && !this.#armasSoltas().length : !inst || (c.inst !== undefined && !this.#compartimento().some((x) => x.id === inst.id));
    if (sumiu) {
      this.fecharCaixa();
      return;
    }
    const opcao = (rotulo, acao, dados, porque = '', destaque = '') =>
      `<button type="button" class="opcao-caixa ${destaque}" role="menuitem" data-acao="${acao}" ${Object.entries(dados)
        .map(([k, v]) => `data-${k}="${esc(v)}"`)
        .join(' ')} ${porque ? 'disabled' : ''}>${rotulo}</button>${porque ? `<small class="porque">${esc(porque)}</small>` : ''}`;
    const ops = [];
    if (casa !== undefined && !inst) {
      // Casa vazia: guardar uma das armas soltas do compartimento.
      const { tecla, letraTroca } = ENCAIXES[casa];
      for (const x of this.#armasSoltas()) ops.push(opcao(`Guardar ${esc(nomeInst(x))}`, 'guardar', { casa, inst: x.id }, '', 'principal'));
      const html = `<p class="titulo-caixa"><span>Troca rápida · ${letraTroca} troca com o ${tecla}</span><strong>Guardar no ${letraTroca}</strong></p>${ops.join('')}`;
      if (this.caixaEl.dataset.html !== html) {
        this.caixaEl.innerHTML = html;
        this.caixaEl.dataset.html = html;
      }
      return;
    }
    const id = inst.id;
    if (casa !== undefined) {
      const { tecla, letraTroca } = ENCAIXES[casa];
      const noEncaixe = this.#instDaArma(casa);
      const com = noEncaixe ? ` <i>sai ${esc(nomeInst(noEncaixe))}</i>` : '';
      ops.push(opcao(`Trocar com o ${tecla} <kbd>${letraTroca}</kbd>${com}`, 'trocarCasa', { enc: casa }, this.#porqueNaoTroca(casa), 'principal'));
      ops.push(opcao(`Tirar do ${letraTroca}`, 'guardar', { casa, inst: '' }));
    } else if (c.slot) {
      const enc = ENCAIXES_INV.find((x) => x.slot === c.slot);
      if (enc.arma !== undefined) {
        const { letraTroca } = ENCAIXES[enc.arma];
        const guardada = this.#instDaCasa(enc.arma);
        const porque = guardada ? this.#porqueNaoTroca(enc.arma) : `Nada guardado no ${letraTroca}: guarde uma arma do compartimento`;
        const com = guardada ? ` <i>com ${esc(nomeInst(guardada))}</i>` : '';
        ops.push(opcao(`Trocar <kbd>${letraTroca}</kbd>${com}`, 'trocarCasa', { enc: enc.arma }, porque));
        ops.push(opcao('Tirar', 'tirar', {}, 'A nave sempre leva duas armas: equipe outra no lugar'));
      } else {
        const cheio = this.#compartimento().length >= s.compMax;
        ops.push(opcao('Tirar', 'tirar', { slot: c.slot }, cheio ? `Compartimento cheio (${s.compMax}/${s.compMax})` : ''));
      }
    } else if (inst.tipo === 'arma') {
      for (const enc of [0, 1]) {
        const ocupado = this.#instDaArma(enc);
        const troca = ocupado ? ` <i>troca com ${esc(nomeInst(ocupado))}</i>` : '';
        ops.push(opcao(`Equipar no <kbd>${ENCAIXES[enc].tecla}</kbd>${troca}`, 'arma', { enc, inst: id }, this.#porqueNaoTroca(enc), 'principal'));
      }
      for (const k of [0, 1]) {
        const { tecla, letraTroca } = ENCAIXES[k];
        const ocupado = this.#instDaCasa(k);
        const troca = ocupado ? ` <i>no lugar de ${esc(nomeInst(ocupado))}</i>` : ` <i>troca com o ${tecla}</i>`;
        ops.push(opcao(`Guardar no <kbd>${letraTroca}</kbd>${troca}`, 'guardar', { casa: k, inst: id }));
      }
    } else {
      const cat = EQUIPAMENTOS[inst.chave]?.categoria;
      const slots = Object.keys(CATEGORIA_DO_SLOT).filter((k) => CATEGORIA_DO_SLOT[k] === cat);
      for (const slot of slots) {
        const ocupado = instDoInv(s.inv, noSlot(s.equipado, slot));
        const rotulo = slots.length > 1 ? `Equipar no ${slot === 'pot1' ? '1' : '2'}` : 'Equipar';
        const troca = ocupado ? ` <i>troca com ${esc(nomeInst(ocupado))}</i>` : '';
        ops.push(opcao(rotulo + troca, 'equipar', { slot, inst: id }, '', 'principal'));
      }
    }
    if (!c.slot) {
      const valor = precoVenda(inst);
      ops.push(opcao(`Vender${valor !== null ? ` <b class="ouro">+${numero(valor)}</b>` : ''}`, 'vender', { inst: id, valor: valor ?? 0 }, this.#porqueNaoVende(inst)));
    }
    const ev = this.#evolucao(inst);
    const rotEv = ev.preco === null ? 'Evoluir' : `Evoluir V${inst.nivel} → V${inst.nivel + 1} <b class="preco">${numero(ev.preco)}</b>`;
    ops.push(opcao(rotEv, 'evoluir', { inst: id }, ev.porque));
    const onde = c.slot ? NOME_SLOT[c.slot] : casa !== undefined ? `Troca rápida · ${ENCAIXES[casa].letraTroca} troca com o ${ENCAIXES[casa].tecla}` : 'No compartimento';
    const html = `<p class="titulo-caixa"><span>${onde}</span><strong>${esc(nomeInst(inst))}</strong></p>${ops.join('')}`;
    if (this.caixaEl.dataset.html !== html) {
      this.caixaEl.innerHTML = html;
      this.caixaEl.dataset.html = html;
    }
  }

  /** Clique numa opção da caixinha. */
  #agir(b) {
    if (b.disabled) return;
    const d = b.dataset;
    const inst = instDoInv(this.estado.inv, Number(d.inst));
    if (d.acao === 'arma') {
      if (this.armasNave.equipar(Number(d.enc), Number(d.inst))) {
        this.msg.textContent = '';
        this.fecharCaixa();
        this.#desenhar(true);
      }
      return;
    }
    if (d.acao === 'trocarCasa' || d.acao === 'guardar') {
      const ok = d.acao === 'trocarCasa' ? this.armasNave.trocar(Number(d.enc)) : this.armasNave.guardar(Number(d.casa), d.inst === '' ? null : Number(d.inst));
      if (ok) {
        this.msg.textContent = '';
        this.fecharCaixa();
        this.#desenhar(true);
      }
      return;
    }
    if (d.acao === 'equipar') this.enviar({ t: 'equipar', slot: d.slot, inst: Number(d.inst) });
    else if (d.acao === 'tirar' && d.slot) this.enviar({ t: 'equipar', slot: d.slot, inst: null });
    else if (d.acao === 'vender' && inst) {
      this.pedidos.set(inst.id, `Vendido: ${nomeInst(inst)} · +${numero(Number(d.valor))} ouro`);
      this.enviar({ t: 'vender', inst: inst.id });
    } else if (d.acao === 'evoluir' && inst) {
      // Evoluir mantém a caixinha aberta (dá para subir várias versões seguidas).
      this.pedidos.set(inst.id, `${nomeInst({ ...inst, nivel: inst.nivel + 1 })}: evoluído`);
      this.enviar({ t: 'evoluirItem', inst: inst.id });
      return;
    }
    this.fecharCaixa();
  }

  #desenhar(forcar) {
    const s = this.estado;
    const m = this.armasNave;
    const encaixes = m.armasNosEncaixes; // índices das armas do Z e do X
    const nivEnc = m.nivEnc;
    const espera = [m.esperaTroca(0) > 0, m.esperaTroca(1) > 0];
    const chave = JSON.stringify([s, m.encaixes, m.casas, encaixes, nivEnc, espera, this.naBase]);
    if (!forcar && chave === this.chave) {
      if (this.caixa) this.#desenharCaixa();
      return;
    }
    this.chave = chave;

    if (this.ouroEl) this.ouroEl.textContent = numero(s.ouro);
    this.tabela.innerHTML = tabelaTipos({ encaixes, nivEnc, status: s.status });
    this.#desenharNave();

    // Encaixes da nave. A versão não vai em texto ao lado do nome: o número (V2 a V8)
    // já está desenhado no canto da figura, como no original (htmlIcone).
    const caixaSlot = this.caixa?.slot;
    this.slotsEl.innerHTML = ENCAIXES_INV.map((enc) => {
      const inst = this.#instDoSlot(enc.slot);
      const marcado = caixaSlot === enc.slot ? ' com-caixa' : '';
      if (enc.arma !== undefined) {
        const i = encaixes[enc.arma];
        const nv = inst?.nivel ?? nivEnc[enc.arma];
        return `<button type="button" class="slot arma${marcado}" data-slot="${enc.slot}" title="Clique para trocar ou evoluir">
          <span class="rot">${enc.nome}</span><span class="ic">${ARMAS[i] ? iconeArma(ARMAS[i], nv) : ''}</span><span class="nm">${ARMAS[i] ? nomeArma(ARMAS[i]) : ''}</span>
        </button>`;
      }
      const k = inst?.chave ?? null;
      return `<button type="button" class="slot${k ? '' : ' vazio'}${marcado}" data-slot="${enc.slot}" title="${k ? 'Clique para tirar ou evoluir' : 'Vazio: equipe pelo compartimento'}">
        <span class="rot">${enc.nome}</span><span class="ic">${iconeEquip(k, inst?.nivel)}</span><span class="nm">${k ? EQUIPAMENTOS[k].nomePt : 'Vazio'}</span>
      </button>`;
    }).join('');

    this.avisoBase.className = 'aviso-base' + (this.naBase ? ' livre' : '');
    this.avisoBase.textContent = this.naBase
      ? 'Na base: equipar, vender e evoluir liberados'
      : 'Equipar vale em qualquer lugar · vender e evoluir, só pousado e parado na sua base';

    // Troca rápida: as duas primeiras casas do compartimento (Q troca com o Z, E com o X).
    const casaMarcada = this.caixa?.casa;
    this.casasEl.innerHTML = ENCAIXES.map(({ tecla, letraTroca }, k) => {
      const x = this.#instDaCasa(k);
      const marcado = casaMarcada === k ? ' com-caixa' : '';
      const nm = x ? nomeArma(x.chave) : 'Vazio';
      const dica = x ? `${letraTroca} troca com a arma do ${tecla} · clique para mais` : `Guarde aqui a arma que o ${letraTroca} põe no ${tecla}`;
      return `<button type="button" class="slot casa${x ? '' : ' vazio'}${marcado}" data-casa="${k}" title="${esc(dica)}">
        <span class="rot"><kbd>${letraTroca}</kbd> troca com o ${tecla}</span><span class="ic">${x ? iconeArma(x.chave, x.nivel) : '<span class="icone-item vazio"></span>'}</span><span class="nm">${esc(nm)}</span>
      </button>`;
    }).join('');

    // Resto do compartimento: as armas primeiro (na ordem do catálogo), depois os equipamentos.
    const casas = m.casas;
    const todos = this.#compartimento();
    const comp = todos.filter((x) => !casas.includes(x.id)).sort((a, b) => (a.tipo === b.tipo ? (a.tipo === 'arma' ? IDX_ARMA[a.chave] - IDX_ARMA[b.chave] || a.id - b.id : a.id - b.id) : a.tipo === 'arma' ? -1 : 1));
    const caixaInst = this.caixa?.inst;
    const cartas = comp.map((x) => {
      const ic = x.tipo === 'arma' ? iconeArma(x.chave, x.nivel) : iconeEquip(x.chave, x.nivel);
      const nm = x.tipo === 'arma' ? nomeArma(x.chave) : (EQUIPAMENTOS[x.chave]?.nomePt ?? x.chave);
      const marcado = caixaInst === x.id ? ' com-caixa' : '';
      return `<button type="button" class="item-inv${marcado}" data-inst="${x.id}"><span class="ic">${ic}</span><span class="nm">${esc(nm)}</span></button>`;
    });
    this.conta.textContent = `${todos.length}/${s.compMax}`;
    this.conta.classList.toggle('cheio', todos.length >= s.compMax);
    this.grade.innerHTML = cartas.length ? cartas.join('') : '<p class="nota-inv">Vazio: o que você comprar na Loja e não estiver na nave aparece aqui</p>';
    if (this.caixa) {
      // Os botões foram refeitos: a caixinha continua (o item marcado vem do HTML).
      this.#desenharCaixa();
    }
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
    let html = '';
    const acao = 'Clique para ver o que dá para fazer';
    if (alvo.dataset.slot) {
      const inst = this.#instDoSlot(alvo.dataset.slot);
      if (inst?.tipo === 'arma') html = detalheArma(armaDaInst(inst), inst.nivel, acao);
      else if (inst) html = detalheEquip(inst.chave, inst.nivel, acao);
      this.foco = `[data-slot="${alvo.dataset.slot}"]`;
    } else if (alvo.dataset.casa) {
      const inst = this.#instDaCasa(Number(alvo.dataset.casa));
      if (inst) html = detalheArma(armaDaInst(inst), inst.nivel, acao);
      this.foco = `[data-casa="${alvo.dataset.casa}"]`;
    } else if (alvo.dataset.inst) {
      const inst = instDoInv(this.estado.inv, Number(alvo.dataset.inst));
      if (inst?.tipo === 'arma') html = detalheArma(armaDaInst(inst), inst.nivel, acao);
      else if (inst) html = detalheEquip(inst.chave, inst.nivel, acao);
      this.foco = `[data-inst="${alvo.dataset.inst}"]`;
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
