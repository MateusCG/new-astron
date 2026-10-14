// HUD: painel inferior (escudo, HP, energia, nível e XP, ouro, velocidade), minimapa,
// nomes sobre as naves, avisos de abate, a barra do pouso no objetivo A, a barra
// do recall (volta à base), o "CARREGANDO" da troca de arma e a tela de
// "destruído". É DOM puro por cima do canvas.

import * as THREE from 'three';
import { paredeAt, MAP_HALF_X, MAP_HALF_Z, BASES, CORREDOR, MINERIO, ENTREGAS, SERVICOS, OBJETIVOS, TORRETAS } from '/shared/terrain.js';
import { WEAPONS, ARMAS, TROCA_ARMA_S, armasIniciais, versaoArma } from '/shared/sim.js';
import { iconeArma } from './armas.js';
import { iconeItem } from './servicos.js';
import { ITENS, ORDEM_ITENS } from '/shared/loja.js';
import { relogio } from './objetivos.js';

const $ = (s) => document.querySelector(s);

// O minimapa mostra o retângulo inteiro (o canvas tem a mesma proporção do mapa).
// Cores do guia visual: sua base em turquesa, a do outro time em vermelho, o
// circuito do minério em azul, serviços na cor de cada um e objetivos em âmbar.
const COR_MEU_TIME = '#00efc0';
const COR_OUTRO_TIME = '#ff4a2a';
const COR_INIMIGA = '#ff4a2a'; // monstros e tudo do outro time
const COR_OBJETIVO = '#ffb627';
const COR_CIRCUITO = '#4fb8ff';
const COR_MINERIO = '#9fe8ff';
const COR_SERVICO = { evolucao: '#a58bff', loja: '#ff6fd8' };
const NOME_SERVICO = { evolucao: 'Evolução', loja: 'Loja' };
const COR_APAGADA = '#8a7f6a'; // letra de objetivo em recarga
// Tamanho do ponto de cada inimigo no minimapa: quanto mais perigoso, maior.
const PONTO_INIMIGO = { vorax: 4.5, krakor: 6, guardiao: 7 };
/** O que cada bônus faz, para o HUD (nomes de server/bonus.js). */
export const NOME_BONUS = { mineracao: 'Mineração +1', velocidade: 'Velocidade', durabilidade: 'Durabilidade', furia: 'Fúria' };

/** Aviso de cada efeito de arma na própria nave: [texto, tipo da notícia]. */
const AVISOS_EFEITO = {
  dreno: ['Dreno: você está perdendo vida', 'ruim'],
  lento: ['Sua nave está lenta', 'ruim'],
  emp: ['Sem energia: sem tiro e sem boost por instantes', 'ruim'],
  semTiro: ['Paralisia: sem tiro por instantes', 'ruim'],
  desg: ['Desgoverno: a curva está invertida', 'ruim'],
  semRegen: ['A energia parou de recuperar', 'ruim'],
  cego: ['Radar desligado: inimigos fora do mapa', 'ruim'],
  inv: ['Camuflada: o inimigo não te vê de longe', 'bom'],
  invul: ['Invulnerável', 'bom'],
};

export class Hud {
  /** @param {{ meuTime?: number }} [opcoes] time de quem joga (cor das bases no minimapa) */
  constructor({ meuTime = 0 } = {}) {
    this.meuTime = meuTime;
    // Escudo do equipamento (me.escudo / me.maxEscudo): a barra só aparece com um
    // escudo na nave, logo acima da do HP, porque o dano tira dele primeiro.
    this.esc = $('#esc');
    this.escVal = $('#esc .valor');
    this.escTxt = $('#esc .txt');
    this.hp = $('#hp .valor');
    this.hpTxt = $('#hp .txt');
    this.en = $('#en .valor');
    this.enTxt = $('#en .txt');
    this.xp = $('#xp .valor');
    this.xpTxt = $('#xp .txt');
    this.nivel = $('#xp em');
    this.progObj = $('#prog-obj');
    this.progRecall = $('#prog-recall');
    // "CARREGANDO" no meio da tela: uma linha por encaixe em recarga de troca.
    this.linhasCarregando = [0, 1].map((enc) => {
      const el = $(`#carregando [data-enc="${enc}"]`);
      return { el, ic: el.querySelector('.ic'), nm: el.querySelector('.nm'), seg: el.querySelector('.seg'), barra: el.querySelector('.barra i'), kind: null, txt: '' };
    });
    this.btnRecall = $('#btn-recall');
    this.ouro = $('#ouro');
    this.abates = $('#abates');
    this.vel = $('#vel');
    // As duas armas no painel (Z e X): ícone, nome e a linha de recarga de cada uma,
    // e a contagem da recarga de troca de arma (só aparece enquanto conta).
    this.slots = ['#arma-z', '#arma-x'].map((sel) => {
      const el = $(sel);
      let espera = el.querySelector('.espera');
      if (!espera) {
        espera = document.createElement('span');
        espera.className = 'espera';
        el.querySelector('.recarga').before(espera);
      }
      return { el, icone: el.querySelector('.icone'), nome: el.querySelector('.nome'), recarga: el.querySelector('.recarga i'), espera, kind: null, txtEspera: '' };
    });
    // Itens consumíveis (R e F): ícone, quantidade e a linha da recarga.
    this.itens = ORDEM_ITENS.map((id) => {
      const el = $(`#item-${id}`);
      el.querySelector('.icone').innerHTML = iconeItem(id);
      return { id, el, qtd: el.querySelector('.qtd'), recarga: el.querySelector('.recarga i') };
    });
    this.ping = $('#ping');
    this.aviso = $('#aviso');
    this.avisoPouso = $('#pouso');
    this.feed = $('#feed');
    this.rotulos = $('#rotulos');
    this.mapa = $('#minimapa');
    this.ctx = this.mapa.getContext('2d');
    this.fundoMapa = this.#desenharFundo();
    this.tags = new Map();
    this.v = new THREE.Vector3();
  }

  #desenharFundo() {
    const w = this.mapa.width;
    const h = this.mapa.height;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(w, h);
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const [x, z] = this.#doMapa(i + 0.5, j + 0.5);
        const p = paredeAt(x, z);
        const k = (j * w + i) * 4;
        img.data[k] = 40 + p * 90;
        img.data[k + 1] = 22 + p * 50;
        img.data[k + 2] = 14 + p * 25;
        img.data[k + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const k = this.#escala();
    const circulo = (x, z, raioM, cor, cheio) => {
      const [cx, cz] = this.#paraMapa(x, z);
      ctx.beginPath();
      ctx.arc(cx, cz, Math.max(2, raioM * k), 0, Math.PI * 2);
      if (cheio) {
        ctx.fillStyle = cor;
        ctx.fill();
      } else {
        ctx.strokeStyle = cor;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    };
    const retangulo = (x, z, larg, prof, cor) => {
      const [cx, cz] = this.#paraMapa(x - larg / 2, z - prof / 2);
      ctx.fillStyle = cor;
      ctx.fillRect(cx, cz, Math.max(1.5, larg * k), Math.max(1.5, prof * k));
    };
    // Corredor (faixa azul apagada), entregas e minério.
    ctx.globalAlpha = 0.35;
    retangulo(CORREDOR.x, (CORREDOR.zInicio + CORREDOR.zFim) / 2, CORREDOR.largura, CORREDOR.zFim - CORREDOR.zInicio, COR_CIRCUITO);
    ctx.globalAlpha = 1;
    for (const e of ENTREGAS) retangulo(e.x, e.z, e.largura, e.profundidade, COR_CIRCUITO);
    circulo(MINERIO.x, MINERIO.z, MINERIO.raio * 0.7, COR_MINERIO, true);
    for (const b of BASES) circulo(b.x, b.z, b.raio, b.time === this.meuTime ? COR_MEU_TIME : COR_OUTRO_TIME, false);
    for (const sv of SERVICOS) retangulo(sv.x, sv.z, sv.raio * 2.4, sv.raio * 2, COR_SERVICO[sv.servico]);
    // Objetivos: a letra do tipo em âmbar.
    ctx.font = 'bold 10px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const o of OBJETIVOS) {
      const [cx, cz] = this.#paraMapa(o.x, o.z);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.beginPath();
      ctx.arc(cx, cz, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = COR_OBJETIVO;
      ctx.fillText(o.tipo, cx, cz + 0.5);
    }
    return c;
  }

  /** Pixels do minimapa por metro do mundo. */
  #escala() {
    return Math.min(this.mapa.width / (2 * MAP_HALF_X), this.mapa.height / (2 * MAP_HALF_Z));
  }

  #paraMapa(x, z) {
    const k = this.#escala();
    return [this.mapa.width / 2 + x * k, this.mapa.height / 2 + z * k];
  }

  #doMapa(px, pz) {
    const k = this.#escala();
    return [(px - this.mapa.width / 2) / k, (pz - this.mapa.height / 2) / k];
  }

  /**
   * Desenha o minimapa com o mapa fixo, o estado dos objetivos (`obj` do
   * snapshot) e das torretas (`torretas`), os outros (pontos) e você (seta).
   */
  minimapa(eu, ents, meuId, obj = [], torretas = []) {
    const ctx = this.ctx;
    ctx.drawImage(this.fundoMapa, 0, 0);
    this.#objetivosNoMapa(obj);
    this.#torretasNoMapa(torretas);
    for (const e of ents) {
      if (e.id === meuId || !e.vivo) continue;
      const [x, z] = this.#paraMapa(e.x, e.z);
      // Do seu time em turquesa; do outro time e monstros em vermelho.
      ctx.fillStyle = !e.drone && e.time === this.meuTime ? COR_MEU_TIME : COR_INIMIGA;
      if (e.tipo === 'minerador') {
        // Minerador: bolinha menor que o quadrado das naves.
        ctx.beginPath();
        ctx.arc(x, z, 1.6, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      if (e.tipo === 'escolta') {
        // Escolta: losango pequeno (armada, entre o minerador e a nave).
        ctx.beginPath();
        ctx.moveTo(x, z - 2.6);
        ctx.lineTo(x + 2.2, z);
        ctx.lineTo(x, z + 2.6);
        ctx.lineTo(x - 2.2, z);
        ctx.closePath();
        ctx.fill();
        continue;
      }
      // Quem é mais perigoso (Vorax, Krakor, guardião) num ponto maior que o Arnosh.
      const t = PONTO_INIMIGO[e.tipo] ?? 3;
      ctx.fillRect(x - t / 2, z - t / 2, t, t);
    }
    if (eu) {
      const [x, z] = this.#paraMapa(eu.x, eu.z);
      ctx.save();
      ctx.translate(x, z);
      ctx.rotate(-eu.yaw);
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(0, -5);
      ctx.lineTo(3.5, 4);
      ctx.lineTo(-3.5, 4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  /**
   * Estado dos objetivos por cima da letra fixa: arco de progresso do A (na cor
   * do time que está tomando; pisca se contestado), arco de vida da torre B e do
   * guardião C, e em recarga a letra apagada, um anel na cor de quem tomou e os
   * segundos que faltam.
   */
  #objetivosNoMapa(obj) {
    const ctx = this.ctx;
    const corTime = (t) => (t === this.meuTime ? COR_MEU_TIME : COR_OUTRO_TIME);
    const pisca = Math.floor(performance.now() / 250) % 2 === 0;
    ctx.font = 'bold 10px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const r of obj) {
      const o = OBJETIVOS.find((x) => x.id === r.id);
      if (!o) continue;
      const [cx, cz] = this.#paraMapa(o.x, o.z);
      const arco = (frac, cor) => {
        ctx.beginPath();
        ctx.arc(cx, cz, 7.5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
        ctx.strokeStyle = cor;
        ctx.lineWidth = 2;
        ctx.stroke();
      };
      if (r.estado === 'recarga') {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
        ctx.beginPath();
        ctx.arc(cx, cz, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = COR_APAGADA;
        ctx.fillText(o.tipo, cx, cz + 0.5);
        if (r.time != null) arco(1, corTime(r.time));
        ctx.font = '8px ui-monospace, monospace';
        ctx.fillStyle = COR_APAGADA;
        ctx.fillText(String(r.resta), cx, cz + 13);
        ctx.font = 'bold 10px ui-monospace, monospace';
      } else if (r.estado === 'contestado') {
        if (pisca) arco(Math.max(0.05, r.prog), COR_OBJETIVO);
      } else if (r.estado === 'tomando') {
        arco(r.prog, corTime(r.quem));
      } else if (r.vida != null && r.vida < 1) {
        arco(r.vida, COR_INIMIGA);
      }
    }
  }

  /**
   * Torretas: triângulo na cor do time (cheio de pé, só o contorno com a obra
   * esperando o lugar), e um "x" cinza-areia onde ela caiu.
   */
  #torretasNoMapa(torretas) {
    const ctx = this.ctx;
    for (const r of torretas) {
      const t = TORRETAS.find((x) => x.id === r.id);
      if (!t) continue;
      const [cx, cz] = this.#paraMapa(t.x, t.z);
      const cor = t.time === this.meuTime ? COR_MEU_TIME : COR_OUTRO_TIME;
      if (!r.viva && !r.obra) {
        ctx.strokeStyle = COR_APAGADA;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(cx - 2, cz - 2);
        ctx.lineTo(cx + 2, cz + 2);
        ctx.moveTo(cx + 2, cz - 2);
        ctx.lineTo(cx - 2, cz + 2);
        ctx.stroke();
        continue;
      }
      ctx.beginPath();
      ctx.moveTo(cx, cz - 3.2);
      ctx.lineTo(cx + 3, cz + 2.2);
      ctx.lineTo(cx - 3, cz + 2.2);
      ctx.closePath();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.strokeStyle = cor;
      ctx.lineWidth = 1.2;
      if (r.viva) {
        ctx.fillStyle = cor;
        ctx.fill();
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
      } else ctx.fill();
      ctx.stroke();
    }
  }

  painel(me, extra, ping) {
    const maxEsc = me.maxEscudo ?? 0;
    this.esc.hidden = !(maxEsc > 0);
    if (maxEsc > 0) {
      const e = Math.max(0, Math.min(maxEsc, me.escudo ?? 0));
      this.escVal.style.width = `${(e / maxEsc) * 100}%`;
      this.escTxt.textContent = `${Math.round(e)} / ${Math.round(maxEsc)}`;
    }
    const php = Math.max(0, me.hp / me.maxHp);
    this.hp.style.width = `${php * 100}%`;
    this.hp.classList.toggle('critico', php < 0.3);
    this.hpTxt.textContent = `${Math.ceil(me.hp)} / ${me.maxHp}`;
    this.en.style.width = `${(me.en / me.maxEn) * 100}%`;
    this.enTxt.textContent = `${Math.floor(me.en)} / ${me.maxEn}`;
    // Nível e XP: a barra enche até o próximo nível; no máximo fica cheia.
    const nv = extra.nivel ?? 1;
    const prox = extra.xpProx ?? 0;
    this.nivel.textContent = `NV ${nv}`;
    this.xp.style.width = prox > 0 ? `${Math.min(1, (extra.xp ?? 0) / prox) * 100}%` : '100%';
    this.xpTxt.textContent = prox > 0 ? `${extra.xp ?? 0} / ${prox}` : 'máx.';
    this.ouro.textContent = extra.ouro.toLocaleString('pt-BR');
    this.abates.textContent = extra.abates;
    this.vel.textContent = Math.round(Math.hypot(me.vx, me.vz) * 3.6) + ' km/h';
    this.ping.textContent = ping ? `${ping} ms` : '';
    // As armas da nave prevista (as mesmas que o servidor usa no próximo tiro), com
    // a recarga do encaixe de cada uma (cd1 do Z, cd2 do X) e a energia, que é uma só.
    // Com a recarga de troca contando (troca1/troca2), a linha mostra a troca e o
    // encaixe ganha a contagem em segundos.
    this.slots.forEach((slot, enc) => {
      const idx = me.encaixes?.[enc] ?? armasIniciais(me.race)[enc];
      const kind = ARMAS[idx];
      const w = WEAPONS[kind];
      const nivel = me.niveis?.[idx] ?? 1;
      const v = versaoArma(idx, nivel);
      if (kind !== slot.kind || nivel !== slot.nivel) {
        slot.kind = kind;
        slot.nivel = nivel;
        slot.icone.innerHTML = iconeArma(kind, nivel);
        slot.nome.textContent = nivel > 1 ? `${w.nome} ${nivel}` : w.nome;
      }
      const cd = (enc === 0 ? me.cd1 : me.cd2) ?? 0;
      const troca = (enc === 0 ? me.troca1 : me.troca2) ?? 0;
      const fracao = troca > 0 ? troca / TROCA_ARMA_S : v.cd > 0 ? cd / v.cd : 0;
      slot.el.classList.toggle('segurando', (enc === 0 ? me.seg1 : me.seg2) === idx);
      slot.recarga.style.width = `${(1 - Math.min(1, fracao)) * 100}%`;
      const txt = troca > 0 ? `${(Math.ceil(troca * 10) / 10).toLocaleString('pt-BR', { minimumFractionDigits: 1 })} s` : '';
      if (txt !== slot.txtEspera) slot.espera.textContent = slot.txtEspera = txt;
      slot.el.classList.toggle('trocando', troca > 0);
      slot.el.classList.toggle('carregando', cd > 0 || troca > 0);
      slot.el.classList.toggle('sem-energia', cd <= 0 && me.en < v.energia * (v.segurar ? 0.1 : 1));
      slot.el.classList.toggle('emp', me.emp > 0 || me.semTiro > 0);
    });
    // Itens: quantidade (apagado sem nenhum) e a recarga (s, do `me`) enchendo.
    for (const it of this.itens) {
      const n = me.itens?.[it.id] ?? 0;
      const cd = me.cdItens?.[it.id] ?? 0;
      it.qtd.textContent = n;
      it.el.classList.toggle('vazio', n <= 0);
      it.el.classList.toggle('carregando', cd > 0);
      it.recarga.style.width = `${(1 - Math.min(1, cd / ITENS[it.id].recargaS)) * 100}%`;
    }
  }

  /**
   * Dica de pouso. `area` é a área de pouso onde a nave está (AREAS_POUSO) ou
   * null; `pousada` diz se ela já está no chão. Pousada num serviço, com o painel
   * fechado (`painelAberto` false, depois do ESC), a dica ensina a abrir de novo
   * (Enter ou tocar nela).
   */
  pouso(area, pousada, painelAberto = false) {
    const nome = !area
      ? ''
      : area.servico
        ? NOME_SERVICO[area.servico]
        : area.objetivo
          ? `Objetivo ${area.tipo}`
          : 'Área de pouso';
    let html = '';
    if (pousada && area?.servico) html = painelAberto ? `${nome} · <kbd>L</kbd> decola` : `${nome} · <kbd>Enter</kbd> ou toque abre · <kbd>L</kbd> decola`;
    else if (pousada) html = `${area?.objetivo ? nome + ' · ' : ''}Pousada · consertando · <kbd>L</kbd> decola`;
    else if (area) html = `${nome} · <kbd>L</kbd> pousa`;
    if (this.avisoPouso.dataset.html !== html) {
      this.avisoPouso.innerHTML = html;
      this.avisoPouso.dataset.html = html;
    }
    this.avisoPouso.hidden = !html;
    this.avisoPouso.classList.toggle('servico', !!(pousada && area?.servico && !painelAberto));
  }

  /**
   * Barra do objetivo A enquanto você está pousado na marcação: quanto falta
   * (na cor do seu time), contestado, ou a recarga. `r` é o estado do servidor
   * desse objetivo; null esconde.
   */
  objetivoPouso(r) {
    let html = '';
    let frac = 0;
    let classe = '';
    if (r?.estado === 'recarga') {
      html = `Objetivo A em recarga · volta em ${relogio(r.resta)}`;
      classe = 'recarga';
    } else if (r?.estado === 'contestado') {
      html = 'Contestado · tem inimigo pousado na marcação';
      frac = r.prog;
      classe = 'contestado';
    } else if (r?.estado === 'tomando') {
      const meu = r.quem === this.meuTime;
      html = meu ? `Tomando o objetivo A · ${r.falta.toFixed(1).replace('.', ',')} s` : 'O inimigo está tomando';
      frac = r.prog;
      classe = meu ? 'meu' : 'deles';
    } else if (r) {
      html = 'Objetivo A · fique pousado';
    }
    const el = this.progObj;
    el.hidden = !html;
    if (!html) return;
    if (el.dataset.html !== html) {
      el.querySelector('.txt').textContent = html;
      el.dataset.html = html;
    }
    el.className = classe;
    el.querySelector('i').style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`;
  }

  /**
   * Barra da volta à base (recall): `frac` de 0 a 1 e `resta` em s; null esconde.
   * O botão BASE do celular acende enquanto canaliza.
   */
  recall(frac, resta) {
    const el = this.progRecall;
    const ligado = frac !== null && frac !== undefined;
    el.hidden = !ligado;
    this.btnRecall?.classList.toggle('canalizando', ligado);
    if (!ligado) return;
    const txt = `Voltando à base · <b>${Math.max(0, resta).toFixed(1).replace('.', ',')} s</b>`;
    if (el.dataset.txt !== txt) {
      el.querySelector('.txt').innerHTML = txt;
      el.dataset.txt = txt;
    }
    el.querySelector('i').style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`;
  }

  /**
   * "CARREGANDO" no meio da tela enquanto a recarga de troca de arma conta
   * (troca1 no Z, troca2 no X, da nave prevista; TROCA_ARMA_S em shared/sim.js):
   * qual encaixe, a arma nova, quanto falta e a barra enchendo. A regra é do
   * stepShip (fora da própria base, trocar trava o encaixe: sem tiro nele); aqui só
   * se mostra, para o piloto não achar que a arma "travou". null (morto) esconde.
   */
  carregando(me) {
    for (const [enc, linha] of this.linhasCarregando.entries()) {
      const troca = (enc === 0 ? me?.troca1 : me?.troca2) ?? 0;
      linha.el.hidden = !(troca > 0);
      if (!(troca > 0)) continue;
      const idx = me.encaixes?.[enc];
      const kind = ARMAS[idx];
      const nivel = me.niveis?.[idx] ?? 1;
      if (kind !== linha.kind) {
        linha.kind = kind;
        linha.ic.innerHTML = WEAPONS[kind] ? iconeArma(kind, nivel) : '';
        linha.nm.textContent = WEAPONS[kind]?.nome ?? '';
      }
      const txt = `${(Math.ceil(troca * 10) / 10).toLocaleString('pt-BR', { minimumFractionDigits: 1 })} s`;
      if (txt !== linha.txt) linha.seg.textContent = linha.txt = txt;
      linha.barra.style.width = `${(1 - Math.min(1, troca / TROCA_ARMA_S)) * 100}%`;
    }
  }

  /**
   * Avisa quando um efeito de arma começa na própria nave (só na mudança): os do
   * inimigo (dreno, lento, paralisia, desgoverno, energia, radar) como ruins e os
   * próprios (camuflagem, invulnerável) como bons.
   */
  efeitosProprios(estados) {
    this.efeitosAtivos ??= {};
    for (const [k, [texto, tipo]] of Object.entries(AVISOS_EFEITO)) {
      if (estados[k] && !this.efeitosAtivos[k]) this.noticia(texto, tipo);
      this.efeitosAtivos[k] = !!estados[k];
    }
  }

  mostrarAviso(texto) {
    this.aviso.textContent = texto;
    this.aviso.hidden = !texto;
  }

  noticia(texto, tipo = '') {
    const li = document.createElement('li');
    li.textContent = texto;
    li.className = tipo;
    this.feed.prepend(li);
    setTimeout(() => li.remove(), 6000);
    while (this.feed.children.length > 5) this.feed.lastChild.remove();
  }

  /**
   * Rótulos das naves visíveis. Sobre a nave, o nome e a barra de vida (monstros,
   * mineradores, torretas) ou só a barra (naves de jogador). Embaixo da nave de
   * jogador (`piloto`, a sua inclusive), a etiqueta com o nick e o nível. `aliado`
   * (do seu time) pinta de turquesa; inimigo (outro time ou monstro) de vermelho.
   * Entrada: { id, nome, aliado, hp, maxHp, pos, nivel, piloto, proprio, esc }.
   * `esc` (fração 0 a 1 do escudo, das naves de jogador com escudo) põe uma barra
   * fina do escudo em cima da de vida.
   */
  rotulosNaves(lista, camera, largura, altura) {
    const vistos = new Set();
    const pos = (chave, p, dy, ancoraY, criar) => {
      this.v.copy(p);
      this.v.y += dy;
      this.v.project(camera);
      if (this.v.z > 1 || Math.abs(this.v.x) > 1.1 || Math.abs(this.v.y) > 1.1) return null;
      vistos.add(chave);
      let tag = this.tags.get(chave);
      if (!tag) {
        tag = criar();
        this.rotulos.append(tag);
        this.tags.set(chave, tag);
      }
      tag.style.transform = `translate(${((this.v.x + 1) / 2) * largura}px, ${((1 - this.v.y) / 2) * altura}px) translate(-50%, ${ancoraY})`;
      return tag;
    };
    for (const { id, nome, aliado, hp, maxHp, pos: p, nivel, piloto, proprio, esc } of lista) {
      const dist = camera.position.distanceTo(p);
      if (dist > 450) continue;
      const opacidade = dist > 300 ? String(1 - (dist - 300) / 150) : '1';
      const cor = aliado ? ' aliado' : ' inimigo';
      // Em cima: nome e barra (só a barra nas naves de jogador; nada na sua, que tem o painel).
      if (!proprio) {
        const cima = pos(`c${id}`, p, 6, '-100%', () => {
          const tag = document.createElement('div');
          tag.className = 'rotulo' + cor;
          tag.innerHTML = piloto
            ? '<span class="barra-esc" hidden><i></i></span><span class="barra"><i></i></span>'
            : '<span class="nome"></span><span class="barra"><i></i></span>';
          if (!piloto) {
            tag.querySelector('.nome').textContent = nome;
            tag.querySelector('.nome').insertAdjacentHTML('beforeend', ' <small class="nv"></small>');
          }
          return tag;
        });
        if (cima) {
          cima.style.opacity = opacidade;
          cima.querySelector('.barra i').style.width = `${Math.max(0, hp / maxHp) * 100}%`;
          const barraEsc = cima.querySelector('.barra-esc');
          if (barraEsc) {
            barraEsc.hidden = esc === undefined || esc === null;
            if (!barraEsc.hidden) barraEsc.firstChild.style.width = `${Math.max(0, Math.min(1, esc)) * 100}%`;
          }
          const nv = cima.querySelector('.nv');
          if (nv && nivel) nv.textContent = `NV ${nivel}`;
        }
      }
      // Embaixo da nave de jogador: a etiqueta com o nick e o nível.
      if (piloto) {
        const baixo = pos(`b${id}`, p, -3.5, '0', () => {
          const tag = document.createElement('div');
          tag.className = 'rotulo piloto' + cor + (proprio ? ' proprio' : '');
          tag.innerHTML = '<span class="nome"></span><b class="nv"></b>';
          tag.querySelector('.nome').textContent = nome;
          return tag;
        });
        if (baixo) {
          baixo.style.opacity = opacidade;
          const nv = baixo.querySelector('.nv');
          const txt = `NV ${nivel ?? 1}`;
          if (nv.textContent !== txt) nv.textContent = txt;
        }
      }
    }
    for (const [chave, tag] of this.tags) {
      if (!vistos.has(chave)) {
        tag.remove();
        this.tags.delete(chave);
      }
    }
  }

  /**
   * Esconde o HUD e apaga o que é da partida (rótulos, feed, avisos, clarão de
   * dano). O HTML do HUD é fixo na página: sem limpar, quem sai e entra de novo
   * veria nomes e notícias da partida anterior.
   */
  limpar() {
    $('#hud').hidden = true;
    this.rotulos.replaceChildren();
    this.tags.clear();
    this.feed.replaceChildren();
    this.mostrarAviso('');
    this.pouso(null, false);
    this.objetivoPouso(null);
    this.recall(null);
    this.carregando(null);
    this.ping.textContent = '';
    document.body.classList.remove('dano');
  }

  levarDano() {
    document.body.classList.remove('dano');
    void document.body.offsetWidth;
    document.body.classList.add('dano');
  }
}
