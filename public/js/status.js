// Janela STATUS (#status, tecla C ou o botão do HUD; ESC fecha): a ficha do piloto
// como a CHARACTER do Astro-N original, com a identidade visual do jogo novo.
//
// Em cima, o piloto (nick e nível, raça, classe e nave) e as linhas de ouro,
// experiência, escudo, durabilidade (HP) e energia, cada uma com o atual / máximo.
// Embaixo, a distribuição de pontos: PONTOS_POR_NIVEL a cada nível, para Durabilidade
// (HP máximo e regeneração de HP), Energia, Físico, Elétrico e Operacional (o laser
// do jogo novo; Ph., El. e Op. no original),
// no máximo PONTO_MAX em cada: aqui os nomes vão por extenso, que a janela é larga e
// a sigla confundia. As linhas dos três tipos trazem, como no original, o poder (%)
// das armas dos encaixes Z e X que são daquele tipo e a resistência da nave a ele.
//
// Os botões "+1" e "+10" de cada atributo só PEDEM ({t:'pontos', atributo, qtd}); o
// servidor põe o que couber, valida e o snapshot traz os pontos novos (me.pontos,
// me.pontosLivres) e o status somado (me.status). Não há devolver ponto. Passar o
// mouse (ou tocar) numa linha mostra o detalhe dela, como o original: o que os pontos
// dão agora e com +1 ponto, calculado por shared/status.js (porPonto,
// efeitoDosPontos) com a energia e o HP base da nave.
//
// O jogo não pausa; com a janela aberta não sai tiro (main.js lê `aberto`). Os
// números mudam a todo snapshot (regeneração), então a janela é montada uma vez e
// só os textos e as barras são trocados no lugar: o "+" não some debaixo do clique.

import {
  ORDEM_ATRIBUTOS,
  PONTO_MAX,
  PONTOS_POR_NIVEL,
  pontosVazios,
  normalizarPontos,
  pontosLivres,
  efeitoDosPontos,
  statusDoPiloto,
} from '/shared/status.js';
import { RACES } from '/shared/sim.js';
import { equipadosDoInv } from '/shared/loja.js';
import { CLASSES, naveDe } from '/shared/naves.js';
import { classeTipo, celulaArma } from './equipamento.js';

/** Quantos pontos cada botão do atributo põe ("+1" e "+10"). */
const QTDS = [1, 10];

/** Nome por extenso de cada atributo na janela (o original usa Ph., El. e Op.). */
export const NOME_ATRIBUTO = { durabilidade: 'Durabilidade', energia: 'Energia', fisico: 'Físico', eletrico: 'Elétrico', laser: 'Operacional' };

/** Mensagem de cada código de recusa do pedido {t:'pontos'}. */
const MENSAGEM = {
  sem_pontos: 'Sem pontos livres: suba de nível para ganhar mais',
  maximo: `Esse atributo já está no máximo (${PONTO_MAX})`,
  invalido: 'Pedido inválido',
};

const num = (v, casas = 0) => (+v).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: casas });
const pct = (f) => `${num(f * 100, 1)}%`;
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Dados do piloto que a janela usa, a partir do snapshot (tudo tolerante a campo ausente). */
function lerEstado({ me, nivel, xp, xpProx, ouro, nome }) {
  const race = me?.race ?? null;
  const classe = me?.classe ?? null;
  const tier = me?.tier ?? 0;
  const energiaBase = naveDe(race, classe, tier)?.energia ?? 0;
  const hpBase = naveDe(race, classe, tier)?.hp ?? 0;
  const pontos = normalizarPontos(me?.pontos ?? pontosVazios());
  const niv = nivel ?? 1;
  // O servidor manda o status já somado (pontos e equipamento); sem ele, a mesma conta daqui.
  const status = me?.status ?? statusDoPiloto({ race, classe, pontos, equipados: equipadosDoInv(me?.inv, me?.equipado), energiaBase, hpBase });
  return {
    nome: nome ?? '',
    race,
    classe,
    tier,
    nivel: niv,
    xp: xp ?? 0,
    xpProx: xpProx ?? 0,
    ouro: ouro ?? 0,
    hp: me?.hp ?? 0,
    maxHp: me?.maxHp ?? 0,
    en: me?.en ?? 0,
    maxEn: me?.maxEn ?? 0,
    escudo: me?.escudo ?? 0,
    maxEscudo: me?.maxEscudo ?? status.maxEscudo ?? 0,
    pontos,
    livres: Number.isInteger(me?.pontosLivres) ? me.pontosLivres : pontosLivres(niv, pontos),
    status,
    energiaBase,
    hpBase,
    encaixes: me?.encaixes ?? [],
    nivEnc: me?.nivEnc ?? [1, 1], // versão da arma de cada encaixe (por instância)
  };
}

export class PainelStatus {
  /**
   * @param {{ enviar: (m: object) => void, signal: AbortSignal, aoAbrir?: () => void }} opcoes
   *   `aoAbrir` fecha a outra janela lateral (o INVENTÁRIO).
   */
  constructor({ enviar, signal, aoAbrir = () => {} }) {
    this.enviar = enviar;
    this.aoAbrir = aoAbrir;
    this.el = document.querySelector('#status');
    this.corpo = this.el.querySelector('.corpo');
    this.msg = this.el.querySelector('.msg');
    this.detalhe = this.el.querySelector('.detalhe');
    this.el.hidden = true;
    this.estado = lerEstado({});
    this.foco = null; // atributo cujo detalhe está à mostra
    this.#montar();

    this.el.addEventListener(
      'click',
      (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        if (b.classList.contains('fechar')) this.fechar();
        else if (b.dataset.mais) this.#pedir(b.dataset.mais, Number(b.dataset.qtd) || 1);
        b.blur(); // o foco no botão não pode prender as teclas do jogo
      },
      { signal },
    );
    // Detalhe da linha sob o mouse (ou tocada, no celular).
    this.el.addEventListener(
      'pointerover',
      (e) => {
        const linha = e.target.closest?.('[data-atributo]');
        if (linha) this.#focar(linha.dataset.atributo, linha);
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
    document.querySelector('#status-hud')?.addEventListener(
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
        if (e.code !== 'KeyC' || e.repeat || e.target instanceof HTMLInputElement) return;
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
    this.#desenhar();
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

  /** Estado do snapshot: { me, nivel, xp, xpProx, ouro, nome }. */
  atualizar(dados) {
    this.estado = lerEstado(dados);
    if (this.aberto) this.#desenhar();
  }

  /** Resposta do servidor a um pedido {t:'pontos'}. */
  resultado(m) {
    const nome = NOME_ATRIBUTO[m.item] ?? '';
    this.msg.textContent = m.ok ? `Pontos em ${nome}` : (MENSAGEM[m.codigo] ?? 'Não deu certo');
    this.msg.className = 'msg ' + (m.ok ? 'bom' : 'ruim');
  }

  #pedir(atributo, qtd) {
    if (!ORDEM_ATRIBUTOS.includes(atributo)) return;
    this.enviar({ t: 'pontos', atributo, qtd });
  }

  /** Monta a janela uma vez: as linhas de cima e uma linha por atributo. */
  #montar() {
    const linha = (k, nome, barra = true) =>
      `<div class="linha-st ${k}"><span>${nome}</span><b class="v-${k}"></b>${barra ? `<i class="barrinha"><i class="b-${k}"></i></i>` : ''}</div>`;
    const atributo = (a) => {
      const simples = a === 'energia' || a === 'durabilidade'; // sem a tabela dos tipos de dano
      const tipo = simples ? '' : classeTipo(a);
      const meio = simples
        ? `<span class="nome-at">${a === 'durabilidade' ? 'Durabilidade (HP)' : 'Energia'}</span><span class="efeito-at"></span>`
        : `<table class="mini-tipos"><tr><th class="nome-at">${NOME_ATRIBUTO[a]}</th><th>Arma <kbd>Z</kbd></th><th>Arma <kbd>X</kbd></th><th>Resist.</th></tr><tr class="valores"></tr></table>`;
      return `<div class="atributo ${tipo}" data-atributo="${a}">
        <b class="qtd"></b>
        <div class="meio">${meio}<span class="linha-pontos"><i class="barra-pontos"><i></i></i><small></small></span></div>
        <span class="botoes-at">${QTDS.map((q) => `<button type="button" class="mais" data-mais="${a}" data-qtd="${q}" title="+${q} ponto${q > 1 ? 's' : ''} em ${NOME_ATRIBUTO[a]}">+${q}</button>`).join('')}</span>
      </div>`;
    };
    this.corpo.innerHTML = `
      <dl class="ficha">
        <dt>Piloto</dt><dd class="v-piloto"></dd>
        <dt>Nave</dt><dd class="v-nave"></dd>
      </dl>
      <div class="linhas-st">
        ${linha('ouro', 'Ouro', false)}
        ${linha('xp', 'Experiência')}
        ${linha('esc', 'Escudo')}
        ${linha('hp', 'Durabilidade (HP)')}
        ${linha('en', 'Energia')}
      </div>
      <div class="pontos-st">
        <div class="livres"><b class="v-livres"></b><span>Pontos livres</span><small>${PONTOS_POR_NIVEL} por nível · máx. ${PONTO_MAX} em cada · sem devolver</small></div>
        ${ORDEM_ATRIBUTOS.map(atributo).join('')}
      </div>
      <p class="extras-st"></p>`;
    const $ = (s) => this.corpo.querySelector(s);
    this.campos = {
      piloto: $('.v-piloto'),
      nave: $('.v-nave'),
      livres: $('.v-livres'),
      extras: $('.extras-st'),
      linhas: Object.fromEntries(['ouro', 'xp', 'esc', 'hp', 'en'].map((k) => [k, { v: $(`.v-${k}`), b: $(`.b-${k}`) }])),
      atributos: Object.fromEntries(
        ORDEM_ATRIBUTOS.map((a) => {
          const el = $(`[data-atributo="${a}"]`);
          return [a, { el, qtd: el.querySelector('.qtd'), barra: el.querySelector('.barra-pontos i'), max: el.querySelector('.linha-pontos small'), efeito: el.querySelector('.efeito-at'), valores: el.querySelector('.valores'), botoes: el.querySelectorAll('.mais') }];
        }),
      ),
    };
    this.chaves = {};
  }

  /** Troca um texto só quando muda (a janela é atualizada a cada snapshot). */
  #texto(el, txt, chave) {
    if (this.chaves[chave] === txt) return;
    this.chaves[chave] = txt;
    el.innerHTML = txt;
  }

  #desenhar() {
    const s = this.estado;
    const c = this.campos;
    const raca = RACES[s.race]?.nome ?? '';
    this.#texto(c.piloto, `${esc(s.nome || 'Piloto')} <em>NV ${s.nivel}</em>`, 'piloto');
    this.#texto(c.nave, [raca, CLASSES[s.classe]?.nome, naveDe(s.race, s.classe, s.tier)?.nome].filter(Boolean).join(' · '), 'nave');
    const barra = (k, atual, max, txt) => {
      this.#texto(c.linhas[k].v, txt, `l${k}`);
      if (c.linhas[k].b) c.linhas[k].b.style.width = `${max > 0 ? Math.max(0, Math.min(1, atual / max)) * 100 : 0}%`;
    };
    barra('ouro', 0, 0, num(s.ouro));
    barra('xp', s.xp, s.xpProx, s.xpProx > 0 ? `${num(s.xp)} / ${num(s.xpProx)}` : 'máx.');
    barra('esc', s.escudo, s.maxEscudo, s.maxEscudo > 0 ? `${num(Math.round(s.escudo))} / ${num(Math.round(s.maxEscudo))}` : 'sem escudo');
    barra('hp', s.hp, s.maxHp, `${num(Math.ceil(s.hp))} / ${num(s.maxHp)}`);
    barra('en', s.en, s.maxEn, `${num(Math.floor(s.en))} / ${num(s.maxEn)}`);
    this.el.querySelector('.linha-st.esc').classList.toggle('apagada', !(s.maxEscudo > 0));

    this.#texto(c.livres, String(s.livres), 'livres');
    c.livres.parentElement.classList.toggle('tem', s.livres > 0);
    const efeito = efeitoDosPontos(s.race, s.classe, s.pontos, s.energiaBase, s.hpBase);
    for (const a of ORDEM_ATRIBUTOS) {
      const at = c.atributos[a];
      const n = s.pontos[a];
      this.#texto(at.qtd, String(n), `q${a}`);
      at.barra.style.width = `${(n / PONTO_MAX) * 100}%`;
      this.#texto(at.max, `${n}/${PONTO_MAX}`, `m${a}`);
      const pode = s.livres > 0 && n < PONTO_MAX;
      for (const b of at.botoes) b.disabled = !pode;
      if (a === 'durabilidade') {
        this.#texto(at.efeito, `+${num(efeito.hp, 1)} HP · +${num(efeito.regenHp, 2)}/s`, 'efHp');
      } else if (a === 'energia') {
        this.#texto(at.efeito, `+${num(efeito.energia, 1)} · +${num(efeito.regenEn, 1)}/s`, 'efEn');
      } else {
        const cel = [0, 1].map((enc) => celulaArma(s.encaixes[enc], s.nivEnc?.[enc] ?? 1, a, s.status.poder)).join('');
        this.#texto(at.valores, `<td class="poder-at">+${pct(efeito.poder[a])}</td>${cel}<td class="resist">${pct(s.status.resist?.[a] ?? 0)}</td>`, `v${a}`);
      }
    }
    // O que mais o equipamento dá (só o que não é zero).
    const st = s.status;
    const extras = [
      st.critico > 0 ? `Crítico ${pct(st.critico)}` : '',
      st.velMult && st.velMult !== 1 ? `Velocidade ${st.velMult > 1 ? '+' : ''}${pct(st.velMult - 1)}` : '',
      st.acelMult && st.acelMult !== 1 ? `Aceleração ${st.acelMult > 1 ? '+' : ''}${pct(st.acelMult - 1)}` : '',
      st.regenEscudo > 0 ? `Escudo +${num(st.regenEscudo, 1)}/s` : '',
      st.regenHpExtra > 0 ? `Conserto +${num(st.regenHpExtra, 2)} HP/s` : '',
    ].filter(Boolean);
    this.#texto(c.extras, extras.join(' · '), 'extras');
    c.extras.hidden = !extras.length;
    if (this.foco) this.#focar(this.foco);
  }

  /** Mostra (ou esconde, com null) o detalhe do atributo, ao lado da linha. */
  #focar(atributo, linha) {
    this.foco = atributo;
    for (const el of this.corpo.querySelectorAll('.atributo')) el.classList.toggle('focada', el.dataset.atributo === atributo);
    if (!atributo) {
      this.detalhe.hidden = true;
      return;
    }
    const html = this.#textoDetalhe(atributo);
    if (this.detalhe.dataset.html !== html) {
      this.detalhe.innerHTML = html;
      this.detalhe.dataset.html = html;
    }
    this.detalhe.hidden = false;
    // Ao lado da linha (no computador o detalhe fica à esquerda da janela).
    const alvo = linha ?? this.corpo.querySelector(`[data-atributo="${atributo}"]`);
    if (alvo) this.detalhe.style.setProperty('--topo', `${alvo.getBoundingClientRect().top - this.el.getBoundingClientRect().top}px`);
  }

  /** O detalhe do original: o que os pontos dão agora e com +1 ponto. */
  #textoDetalhe(a) {
    const s = this.estado;
    const n = s.pontos[a];
    const agora = efeitoDosPontos(s.race, s.classe, s.pontos, s.energiaBase, s.hpBase);
    const mais = n < PONTO_MAX ? efeitoDosPontos(s.race, s.classe, { ...s.pontos, [a]: n + 1 }, s.energiaBase, s.hpBase) : null;
    const st = s.status;
    if (a === 'durabilidade') {
      return `<strong>Durabilidade · ${n} ponto${n === 1 ? '' : 's'}</strong>
        <p>HP máximo +${num(agora.hp, 1)}</p>
        <p>Recuperação +${num(agora.regenHp, 2)} HP/s</p>
        ${mais ? `<p class="mais-um">Com +1 ponto: HP +${num(mais.hp, 1)}, recuperação +${num(mais.regenHp, 2)} HP/s</p>` : '<p class="mais-um">No máximo</p>'}`;
    }
    if (a === 'energia') {
      return `<strong>Energia · ${n} ponto${n === 1 ? '' : 's'}</strong>
        <p>Energia máxima +${num(agora.energia, 1)}</p>
        <p>Recuperação +${num(agora.regenEn, 1)}/s</p>
        ${mais ? `<p class="mais-um">Com +1 ponto: energia +${num(mais.energia, 1)}, recuperação +${num(mais.regenEn, 1)}/s</p>` : '<p class="mais-um">No máximo</p>'}`;
    }
    const sig = NOME_ATRIBUTO[a].toLowerCase();
    const linhas = [
      `Poder ${sig} dos pontos: +${pct(agora.poder[a])}`,
      `Poder ${sig} total: +${pct(st.poder?.[a] ?? 0)}`,
      `Resistência ao ${sig}: ${pct(st.resist?.[a] ?? 0)}`,
      `Recarga das armas de dano ${sig}: ${pct(st.recarga?.[a] ?? 0)} mais rápida`,
      st.penetra?.[a] > 0 ? `Penetração ${sig}: ignora ${pct(st.penetra[a])}` : '',
      st.critico > 0 ? `Golpe crítico: ${pct(st.critico)}` : '',
    ].filter(Boolean);
    return `<strong class="${classeTipo(a)}">Poder ${sig} · ${n} ponto${n === 1 ? '' : 's'}</strong>
      ${linhas.map((l) => `<p>${l}</p>`).join('')}
      ${mais ? `<p class="mais-um">Com +1 ponto: poder ${sig} +${pct(mais.poder[a])}</p>` : '<p class="mais-um">No máximo</p>'}`;
  }
}
