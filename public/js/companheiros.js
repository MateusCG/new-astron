// Barra do time (#companheiros), no alto e no centro da tela durante a partida: um
// card por piloto do SEU time (você primeiro, com a borda turquesa; depois as
// pessoas e os computadores), com a miniatura da nave dele (raça, classe e tier:
// vitrine.js, a mesma das cartas da Evolução), o nick, os abates de JOGADOR inimigo
// (`abatesJog` da lista `jogadores`: monstro e minerador não contam) e uma barra fina
// com a vida. Abatido, o card apaga.
//
// De onde vem cada coisa: nick, abates e vivo da lista `jogadores` do snapshot, que é
// pública (os dois times recebem); a vida (hp/maxHp) e a nave (race, classe, tier) das
// entidades `ents`, onde os pilotos do próprio time SEMPRE vêm (vivos ou mortos, de
// qualquer canto do mapa: server/visao.js). Assim a vida de inimigo continua só
// chegando quando o time o enxerga, e a lista pública não ganhou vida nenhuma.
//
// Teleporte até o companheiro: o card de um companheiro (não o seu) de nave
// Functional fica clicável, com o símbolo do portal no canto. O clique abre uma
// caixinha embaixo dele com "Teleportar" e "Cancelar"; Teleportar manda
// {t:'teleportar', alvo: id} e o servidor decide (vivo, mesmo time, Functional,
// partida em andamento, energia) e põe a nave junto dele na hora. O salto custa
// energia como no original (custoTeleporte, shared/sim.js: cresce com o seu nível e
// com a diferença de nível entre vocês); a caixinha mostra o custo e apaga o
// Teleportar enquanto a energia não paga. A resposta chega como
// {t:'resultado', acao:'teleportar'} (resultado()). ESC fecha a caixinha antes de
// qualquer outra coisa (main.js, fecharPainel). Clique não atira (o tiro é só de
// teclado) e os botões soltam o foco, para o Espaço não apertá-los.

import { miniatura } from './vitrine.js';
import { custoTeleporte } from '/shared/sim.js';

const esc = (t) => String(t).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Por que o teleporte foi recusado (codigo do {t:'resultado', acao:'teleportar'}). */
const MOTIVO_TELEPORTE = {
  sem_partida: 'O teleporte só vale com a partida em andamento',
  morto: 'Você está abatido: espere renascer',
  alvo_morto: 'O companheiro foi abatido',
  nao_functional: 'Só dá para teleportar até uma nave Functional',
  invalido: 'Não dá para teleportar até esse piloto',
  sem_energia: 'Energia insuficiente para o teleporte',
};

/** Texto da falta de energia, com o custo (a diferença de nível encarece o salto). */
const faltaEnergia = (custo) => `Energia insuficiente: o teleporte custa ${custo} (a diferença de nível com o companheiro encarece)`;

// Símbolo do portal (anéis abertos com a seta para dentro), em traço.
const ICONE_PORTAL =
  '<svg class="portal" viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="12" rx="9" ry="9.5" /><ellipse cx="12" cy="12" rx="4.5" ry="5" /><path d="M2 12h6M6 9.5 8.5 12 6 14.5" /></svg>';
// Mira pequena ao lado do número de abates.
const ICONE_ABATE =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7" /><path d="M12 2v5M12 17v5M2 12h5M17 12h5" /></svg>';
// Sem miniatura (sem WebGL ou ainda desenhando): o losango do time.
const ICONE_NAVE = '<svg class="sem-mini" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 21 12 12 21 3 12Z" /></svg>';

export class BarraTime {
  /**
   * @param {{ meuId: number, meuTime: number, enviar: (m: object) => void,
   *   noticia: (texto: string, tipo?: string) => void, signal: AbortSignal }} opcoes
   */
  constructor({ meuId, meuTime, enviar, noticia, signal }) {
    this.meuId = meuId;
    this.meuTime = meuTime;
    this.enviar = enviar;
    this.noticia = noticia;
    this.el = document.querySelector('#companheiros');
    this.lista = this.el.querySelector('.cards');
    this.caixa = this.el.querySelector('.caixa-tele');
    this.cards = new Map(); // id -> { li, nave, img, nome, abates, hp }
    this.pilotos = new Map(); // id -> o último estado mostrado (para a caixinha)
    this.alvo = null; // id do companheiro com a caixinha aberta
    this.euVivo = true;
    this.minhaEn = Infinity; // energia da sua nave (me.en); sem ela, o servidor decide
    this.el.hidden = false;
    // Clique num card de Functional abre a caixinha; no mesmo card, fecha.
    this.lista.addEventListener(
      'pointerdown',
      (e) => {
        const li = e.target.closest('li[data-id]');
        if (!li || !li.classList.contains('tele')) return;
        e.preventDefault(); // sem foco: o Espaço continua sendo tiro
        const id = Number(li.dataset.id);
        if (this.alvo === id) this.fecharCaixa();
        else this.#abrirCaixa(id);
      },
      { signal },
    );
    this.caixa.addEventListener(
      'click',
      (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        b.blur();
        if (b.classList.contains('sim') && !b.disabled && this.alvo !== null) {
          this.enviar({ t: 'teleportar', alvo: this.alvo });
        }
        this.fecharCaixa();
      },
      { signal },
    );
  }

  /** A caixinha do teleporte está aberta? */
  get caixaAberta() {
    return this.alvo !== null;
  }

  /**
   * Snapshot: `jogadores` (lista pública) e `ents` (entidades visíveis; as do seu
   * time sempre vêm). `euVivo` = a sua nave está viva e `minhaEn` = a energia dela
   * (me.en), para a caixinha.
   */
  atualizar(jogadores, ents, euVivo = true, minhaEn = Infinity) {
    if (!Array.isArray(jogadores)) return;
    this.euVivo = euVivo;
    this.minhaEn = Number.isFinite(minhaEn) ? minhaEn : Infinity;
    const porId = new Map((ents ?? []).map((e) => [e.id, e]));
    // Você primeiro, depois as pessoas, depois os computadores (como na janela Times).
    const meus = jogadores
      .filter((j) => j.time === this.meuTime)
      .sort((a, b) => (b.id === this.meuId) - (a.id === this.meuId) || !!a.ia - !!b.ia || a.id - b.id);
    const vistos = new Set();
    meus.forEach((j, ordem) => {
      vistos.add(j.id);
      const ent = porId.get(j.id);
      const p = {
        id: j.id,
        nome: j.ia ? j.nome.replace(/ \(IA\)$/, '') : j.nome,
        ia: !!j.ia,
        abates: j.abatesJog ?? 0,
        nivel: j.nivel,
        vivo: ent ? ent.vivo !== false && j.vivo !== false : j.vivo !== false,
        frac: ent && ent.maxHp > 0 ? Math.max(0, Math.min(1, ent.hp / ent.maxHp)) : j.vivo === false ? 0 : 1,
        race: ent?.race,
        classe: ent?.classe,
        tier: ent?.tier ?? 0,
      };
      this.pilotos.set(j.id, p);
      this.#desenharCard(p, ordem);
    });
    for (const [id, c] of this.cards) {
      if (vistos.has(id)) continue;
      c.li.remove();
      this.cards.delete(id);
      this.pilotos.delete(id);
    }
    if (this.alvo !== null) {
      if (!this.pilotos.has(this.alvo) || this.pilotos.get(this.alvo).classe !== 'functional') this.fecharCaixa();
      else this.#estadoCaixa();
    }
  }

  /** Cria ou atualiza o card de um piloto (só mexe no que mudou). */
  #desenharCard(p, ordem) {
    let c = this.cards.get(p.id);
    if (!c) {
      const li = document.createElement('li');
      li.dataset.id = p.id;
      li.innerHTML = `<span class="mini">${ICONE_NAVE}</span>
        <span class="info">
          <span class="linha"><b class="nome"></b><span class="selo-ia" hidden>IA</span><span class="abates" title="Abates de jogadores inimigos">${ICONE_ABATE}<b>0</b></span></span>
          <span class="vida" title="Vida"><i></i></span>
        </span>${ICONE_PORTAL}`;
      c = {
        li,
        nave: '',
        mini: li.querySelector('.mini'),
        nome: li.querySelector('.nome'),
        ia: li.querySelector('.selo-ia'),
        abates: li.querySelector('.abates b'),
        vida: li.querySelector('.vida i'),
        valores: {},
      };
      this.cards.set(p.id, c);
    }
    if (this.lista.children[ordem] !== c.li) this.lista.insertBefore(c.li, this.lista.children[ordem] ?? null);
    const v = c.valores;
    const voce = p.id === this.meuId;
    const tele = !voce && p.classe === 'functional';
    if (v.nome !== p.nome) c.nome.textContent = v.nome = p.nome;
    if (v.ia !== p.ia) c.ia.hidden = !(v.ia = p.ia);
    if (v.abates !== p.abates) c.abates.textContent = v.abates = p.abates;
    const largura = `${(p.vivo ? p.frac * 100 : 0).toFixed(1)}%`;
    if (v.largura !== largura) c.vida.style.width = v.largura = largura;
    c.li.classList.toggle('voce', voce);
    c.li.classList.toggle('morto', !p.vivo);
    c.li.classList.toggle('tele', tele);
    c.li.classList.toggle('aberto', this.alvo === p.id);
    const titulo = tele ? `${p.nome} · nave Functional: clique para teleportar até ele` : p.nome;
    if (v.titulo !== titulo) c.li.title = v.titulo = titulo;
    // Miniatura da nave (uma por modelo na página: vitrine.js guarda).
    const nave = p.race && p.classe ? `${p.race}/${p.classe}/${p.tier}` : '';
    if (nave && nave !== c.nave) {
      c.nave = nave;
      miniatura(p.race, p.classe, p.tier).then((url) => {
        if (!url || c.nave !== nave) return;
        c.mini.innerHTML = `<img alt="" src="${url}" />`;
      });
    }
  }

  #abrirCaixa(id) {
    const p = this.pilotos.get(id);
    if (!p || id === this.meuId || p.classe !== 'functional') return;
    this.alvo = id;
    this.caixa.querySelector('.alvo').textContent = p.nome;
    this.#estadoCaixa();
    // Embaixo do card, alinhada a ele.
    const li = this.cards.get(id)?.li;
    if (li) this.caixa.style.left = `${li.offsetLeft}px`;
    this.caixa.hidden = false;
    for (const c of this.cards.values()) c.li.classList.toggle('aberto', Number(c.li.dataset.id) === id);
  }

  /**
   * Custo em energia na caixinha, e Teleportar apagado (com o motivo) enquanto você
   * ou o companheiro estão abatidos ou a sua energia não paga o salto.
   */
  #estadoCaixa() {
    const p = this.pilotos.get(this.alvo);
    const custo = custoTeleporte(this.pilotos.get(this.meuId)?.nivel, p?.nivel);
    const motivo = !this.euVivo
      ? MOTIVO_TELEPORTE.morto
      : !p?.vivo
        ? MOTIVO_TELEPORTE.alvo_morto
        : this.minhaEn < custo
          ? MOTIVO_TELEPORTE.sem_energia
          : '';
    const sim = this.caixa.querySelector('.sim');
    sim.disabled = !!motivo;
    const c = this.caixa.querySelector('.custo b');
    const txt = String(Math.ceil(custo));
    if (c.textContent !== txt) c.textContent = txt;
    const m = this.caixa.querySelector('.motivo');
    m.hidden = !motivo;
    if (m.textContent !== motivo) m.textContent = motivo;
  }

  /** Fecha a caixinha do teleporte. Devolve se ela estava aberta (o ESC para aqui). */
  fecharCaixa() {
    if (this.alvo === null) return false;
    this.alvo = null;
    if (this.caixa.contains(document.activeElement)) document.activeElement.blur();
    this.caixa.hidden = true;
    for (const c of this.cards.values()) c.li.classList.remove('aberto');
    return true;
  }

  /** Resposta do servidor ao {t:'teleportar'}: só a recusa vira notícia (o salto já diz que deu certo). */
  resultado(m) {
    if (m.ok) return;
    const texto = m.codigo === 'sem_energia' && Number.isFinite(m.custo) ? faltaEnergia(m.custo) : MOTIVO_TELEPORTE[m.codigo];
    this.noticia(texto ?? 'Não deu para teleportar agora', 'ruim');
  }

  /** Sai da partida: some com a barra e esvazia. */
  limpar() {
    this.fecharCaixa();
    this.lista.replaceChildren();
    this.cards.clear();
    this.pilotos.clear();
    this.el.hidden = true;
  }
}
