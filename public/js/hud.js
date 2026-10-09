// HUD: painel inferior (HP, energia, ouro, velocidade), minimapa, nomes sobre as
// naves, avisos de abate e a tela de "destruído". É DOM puro por cima do canvas.

import * as THREE from 'three';
import { paredeAt, MAP_HALF_X, MAP_HALF_Z, BASES, CORREDOR, MINERIO, ENTREGAS, SERVICOS, OBJETIVOS } from '/shared/terrain.js';
import { WEAPONS, ARMAS_PRINCIPAIS } from '/shared/sim.js';
import { iconeArma } from './armas.js';

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
// Tamanho do ponto de cada inimigo no minimapa: quanto mais perigoso, maior.
const PONTO_INIMIGO = { vorax: 4.5, krakor: 6, guardiao: 7 };

export class Hud {
  /** @param {{ meuTime?: number }} [opcoes] time de quem joga (cor das bases no minimapa) */
  constructor({ meuTime = 0 } = {}) {
    this.meuTime = meuTime;
    this.hp = $('#hp .valor');
    this.hpTxt = $('#hp .txt');
    this.en = $('#en .valor');
    this.enTxt = $('#en .txt');
    this.ouro = $('#ouro');
    this.abates = $('#abates');
    this.vel = $('#vel');
    this.armaAtual = $('#arma-atual');
    this.armaMostrada = null;
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

  /** Desenha o minimapa com o mapa fixo, os outros (pontos) e você (seta). */
  minimapa(eu, ents, meuId) {
    const ctx = this.ctx;
    ctx.drawImage(this.fundoMapa, 0, 0);
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

  painel(me, extra, ping) {
    const php = Math.max(0, me.hp / me.maxHp);
    this.hp.style.width = `${php * 100}%`;
    this.hp.classList.toggle('critico', php < 0.3);
    this.hpTxt.textContent = `${Math.ceil(me.hp)} / ${me.maxHp}`;
    this.en.style.width = `${(me.en / me.maxEn) * 100}%`;
    this.enTxt.textContent = `${Math.floor(me.en)} / ${me.maxEn}`;
    this.ouro.textContent = extra.ouro.toLocaleString('pt-BR');
    this.abates.textContent = extra.abates;
    this.vel.textContent = Math.round(Math.hypot(me.vx, me.vz) * 3.6) + ' km/h';
    this.ping.textContent = ping ? `${ping} ms` : '';
    // Mostra a arma da nave prevista (a mesma que o servidor usa no próximo tiro).
    const kind = ARMAS_PRINCIPAIS[me.arma ?? 0] ?? ARMAS_PRINCIPAIS[0];
    if (kind !== this.armaMostrada) {
      this.armaMostrada = kind;
      this.armaAtual.querySelector('.icone').innerHTML = iconeArma(kind);
      this.armaAtual.querySelector('.nome').textContent = WEAPONS[kind].nome;
    }
  }

  /**
   * Dica de pouso. `area` é a área de pouso onde a nave está (AREAS_POUSO) ou
   * null; `pousada` diz se ela já está no chão. Nos serviços, pousada mostra que a
   * tela ainda vem ("em breve").
   */
  pouso(area, pousada) {
    const nome = !area
      ? ''
      : area.servico
        ? NOME_SERVICO[area.servico]
        : area.objetivo
          ? `Objetivo ${area.tipo}`
          : 'Área de pouso';
    let html = '';
    if (pousada && area?.servico) html = `${nome} · em breve · <kbd>L</kbd> decola`;
    else if (pousada) html = `${area?.objetivo ? nome + ' · ' : ''}Pousada · consertando · <kbd>L</kbd> decola`;
    else if (area) html = `${nome} · <kbd>L</kbd> pousa`;
    if (this.avisoPouso.dataset.html !== html) {
      this.avisoPouso.innerHTML = html;
      this.avisoPouso.dataset.html = html;
    }
    this.avisoPouso.hidden = !html;
  }

  /** Avisa quando a própria nave começa a drenar ou fica lenta (só na mudança). */
  efeitosProprios({ dreno, lento }) {
    if (dreno && !this.drenando) this.noticia('Dreno: você está perdendo vida', 'ruim');
    if (lento && !this.lenta) this.noticia('Criogênico: sua nave está lenta', 'ruim');
    this.drenando = dreno;
    this.lenta = lento;
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
   * Nome e barra de vida sobre cada nave visível. `aliado` (do seu time) pinta de
   * turquesa; inimigo (outro time ou monstro) de vermelho.
   */
  rotulosNaves(lista, camera, largura, altura) {
    const vistos = new Set();
    for (const { id, nome, aliado, hp, maxHp, pos } of lista) {
      this.v.copy(pos);
      this.v.y += 6;
      this.v.project(camera);
      if (this.v.z > 1 || Math.abs(this.v.x) > 1.1 || Math.abs(this.v.y) > 1.1) continue;
      const dist = camera.position.distanceTo(pos);
      if (dist > 450) continue;
      vistos.add(id);
      let tag = this.tags.get(id);
      if (!tag) {
        tag = document.createElement('div');
        tag.className = 'rotulo' + (aliado ? ' aliado' : ' inimigo');
        tag.innerHTML = '<span class="nome"></span><span class="barra"><i></i></span>';
        tag.querySelector('.nome').textContent = nome;
        this.rotulos.append(tag);
        this.tags.set(id, tag);
      }
      tag.style.transform = `translate(${((this.v.x + 1) / 2) * largura}px, ${((1 - this.v.y) / 2) * altura}px) translate(-50%, -100%)`;
      tag.style.opacity = dist > 300 ? String(1 - (dist - 300) / 150) : '1';
      tag.querySelector('i').style.width = `${Math.max(0, hp / maxHp) * 100}%`;
    }
    for (const [id, tag] of this.tags) {
      if (!vistos.has(id)) {
        tag.remove();
        this.tags.delete(id);
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
    this.ping.textContent = '';
    document.body.classList.remove('dano');
  }

  levarDano() {
    document.body.classList.remove('dano');
    void document.body.offsetWidth;
    document.body.classList.add('dano');
  }
}
