// HUD: painel inferior (HP, energia, ouro, velocidade), minimapa, nomes sobre as
// naves, avisos de abate e a tela de "destruído". É DOM puro por cima do canvas.

import * as THREE from 'three';
import { paredeAt, MAP_HALF, BASE } from '/shared/terrain.js';
import { RACES } from '/shared/sim.js';

const $ = (s) => document.querySelector(s);

export class Hud {
  constructor() {
    this.hp = $('#hp .valor');
    this.hpTxt = $('#hp .txt');
    this.en = $('#en .valor');
    this.enTxt = $('#en .txt');
    this.ouro = $('#ouro');
    this.abates = $('#abates');
    this.vel = $('#vel');
    this.ping = $('#ping');
    this.aviso = $('#aviso');
    this.feed = $('#feed');
    this.rotulos = $('#rotulos');
    this.mapa = $('#minimapa');
    this.ctx = this.mapa.getContext('2d');
    this.fundoMapa = this.#desenharFundo();
    this.tags = new Map();
    this.v = new THREE.Vector3();
  }

  #desenharFundo() {
    const n = 160;
    const c = document.createElement('canvas');
    c.width = c.height = n;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(n, n);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const x = (i / n) * 2 * MAP_HALF - MAP_HALF;
        const z = (j / n) * 2 * MAP_HALF - MAP_HALF;
        const p = paredeAt(x, z);
        const k = (j * n + i) * 4;
        img.data[k] = 40 + p * 90;
        img.data[k + 1] = 22 + p * 50;
        img.data[k + 2] = 14 + p * 25;
        img.data[k + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  #paraMapa(x, z) {
    const n = this.mapa.width;
    return [((x + MAP_HALF) / (2 * MAP_HALF)) * n, ((z + MAP_HALF) / (2 * MAP_HALF)) * n];
  }

  /** Desenha o minimapa com a base, os outros (pontos) e você (seta). */
  minimapa(eu, ents, meuId) {
    const ctx = this.ctx;
    const n = this.mapa.width;
    ctx.drawImage(this.fundoMapa, 0, 0, n, n);
    const [bx, bz] = this.#paraMapa(BASE.x, BASE.z);
    ctx.strokeStyle = '#00efc0';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(bx, bz, 5, 0, Math.PI * 2);
    ctx.stroke();
    for (const e of ents) {
      if (e.id === meuId || !e.vivo) continue;
      const [x, z] = this.#paraMapa(e.x, e.z);
      ctx.fillStyle = e.drone ? '#ff4a2a' : '#5ff7ff';
      ctx.fillRect(x - 1.5, z - 1.5, 3, 3);
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

  /** Nome e barra de vida sobre cada nave visível. */
  rotulosNaves(lista, camera, largura, altura) {
    const vistos = new Set();
    for (const { id, nome, drone, race, hp, maxHp, pos } of lista) {
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
        tag.className = 'rotulo' + (drone ? ' inimigo' : '');
        tag.innerHTML = '<span class="nome"></span><span class="barra"><i></i></span>';
        tag.querySelector('.nome').textContent = nome;
        if (!drone) tag.querySelector('.nome').style.color = '#' + new THREE.Color(RACES[race]?.cor ?? 0xffffff).getHexString();
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

  levarDano() {
    document.body.classList.remove('dano');
    void document.body.offsetWidth;
    document.body.classList.add('dano');
  }
}
