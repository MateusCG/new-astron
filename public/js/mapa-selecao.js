// O mapa 2D da partida na Seleção (regras e textos em mapa-selecao-regras.js): o Lago
// de Hélio-3 visto de cima no espaço embaixo da grade de raças e classes. Um SVG só,
// em metros do mundo (viewBox = o retângulo do mapa, x para a direita e z para baixo,
// como o minimapa), que estica na caixa sem deformar: o relevo (lago e rocha, o mesmo
// paredeAt do minimapa) é uma imagem desenhada uma vez no primeiro uso, e por cima
// ficam as nuvens de gás, a lane, a mineradora, as bases com o campo e a bacia, a
// Loja e a Evolução, as torres, os acampamentos e os objetivos com o ícone deles
// (os de ICONE_OBJETIVO, os mesmos dos rótulos da partida).
//
// Sem legenda (pedido do Mateus): cada peça leva `data-item`, e o mouse em cima abre
// uma caixinha ao lado com o nome e o que ela faz (dicaDoItem), que some ao sair.

import { paredeAt } from '/shared/terrain.js';
import { ICONE_OBJETIVO } from './objetivos.js';
import { MUNDO_MAPA, TIMES_MAPA, OBJETIVOS_MAPA, TRAJETO_SONDA_MAPA, ESTRUTURAS_MAPA, dicaDoItem } from './mapa-selecao-regras.js';
import { tr } from '../../shared/idioma.js';

const COR_MINERIO = '#9fe8ff';
const COR_MONSTRO = '#ff4a2a';
const COR_NUVEM = '#e8d6ba';
const COR_SERVICO = { evolucao: '#a58bff', loja: '#ff6fd8' };
/** Pixels do relevo por metro (o SVG estica; 0,15 = 450 × 336). */
const RELEVO_PX_POR_M = 0.15;
const R_OBJETIVO = 78; // raio do círculo de um objetivo no mapa (m)
const TORRETA_M = 52; // meia largura do triângulo da torre sentinela (m)
const SERVICO_M = 42; // meio lado do losango da Loja e da Evolução (m)
const DICA_AFASTA_PX = 12; // a caixinha fica a esta distância da borda esquerda do mapa

let relevoUrl = null;

/** O lago e a rocha num PNG (uma vez por página: o terreno é fixo). */
function relevo() {
  if (relevoUrl) return relevoUrl;
  const w = Math.round(MUNDO_MAPA.largura * RELEVO_PX_POR_M);
  const h = Math.round(MUNDO_MAPA.altura * RELEVO_PX_POR_M);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const x = MUNDO_MAPA.x0 + ((i + 0.5) / w) * MUNDO_MAPA.largura;
      const z = MUNDO_MAPA.z0 + ((j + 0.5) / h) * MUNDO_MAPA.altura;
      const p = paredeAt(x, z);
      const k = (j * w + i) * 4;
      // A paleta do minimapa mais escura, para assentar no menu: o lago azul-tinta da
      // cratera e a rocha em estratos quentes apagados, mais clara no alto.
      img.data[k] = p === 0 ? 14 : 44 + p * 42;
      img.data[k + 1] = p === 0 ? 46 : 36 + p * 32;
      img.data[k + 2] = p === 0 ? 64 : 30 + p * 22;
      img.data[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  relevoUrl = c.toDataURL('image/png');
  return relevoUrl;
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const corTime = (t) => TIMES_MAPA[t].cor;

/** O círculo âmbar com o ícone de traço do objetivo, centrado em (x, z). */
function objetivo(o) {
  const k = (R_OBJETIVO * 1.25) / 24; // o ícone (24 × 24) dentro do círculo
  return `<g class="obj item" data-item="objetivo:${o.id}" transform="translate(${o.x} ${o.z})">
    <circle r="${R_OBJETIVO}" class="obj-fundo"/>
    <g transform="scale(${k}) translate(-12 -12)" class="obj-icone">${ICONE_OBJETIVO[o.tipo]}</g>
  </g>`;
}

function torreta(t) {
  const m = TORRETA_M;
  return `<path class="torreta item" data-item="torreta:${t.id}" d="M${t.x} ${t.z - m * 1.1} L${t.x + m} ${t.z + m * 0.75} L${t.x - m} ${t.z + m * 0.75} Z" fill="${corTime(t.time)}"/>`;
}

function servico(s) {
  const m = SERVICO_M;
  return `<rect class="servico item" data-item="servico:${s.servico}:${s.time}" x="${s.x - m}" y="${s.z - m}" width="${m * 2}" height="${m * 2}" rx="8" transform="rotate(45 ${s.x} ${s.z})" fill="${COR_SERVICO[s.servico]}"/>`;
}

/** A base: a área na cor do time, o anel de pouso, o campo de força na boca e a bacia de minério. */
function base(b, meuTime) {
  const campo = ESTRUTURAS_MAPA.campos.find((c) => c.time === b.time);
  const bacia = ESTRUTURAS_MAPA.bacias.find((c) => c.time === b.time);
  const sua = b.time === meuTime;
  // O selo fica acima da base, preso na borda de fora dela e crescendo para dentro do
  // mapa (o "YOUR BASE" do inglês é mais comprido que o "SUA BASE" e saía pela borda).
  const esquerda = b.x < 0;
  const seloX = b.x + (esquerda ? -b.raio : b.raio);
  const ancora = esquerda ? 'start' : 'end';
  return `<g class="base${sua ? ' sua' : ''}" style="--cor-time:${corTime(b.time)}">
    <circle cx="${b.x}" cy="${b.z}" r="${b.raio}" class="base-area item" data-item="base:${b.time}"/>
    <circle cx="${b.x}" cy="${b.z}" r="${b.raio * 0.42}" class="base-anel"/>
    <line x1="${campo.x}" y1="${campo.z - campo.meiaZ}" x2="${campo.x}" y2="${campo.z + campo.meiaZ}" class="base-campo item" data-item="campo:${b.time}"/>
    <circle cx="${bacia.x}" cy="${bacia.z}" r="${bacia.raio * 1.8}" fill="${COR_MINERIO}" class="bacia item" data-item="bacia:${b.time}"/>
    <text x="${seloX}" y="${b.z - b.raio - 46}" class="base-selo" style="text-anchor:${ancora}">${sua ? tr('SUA BASE') : tr('INIMIGO')}</text>
  </g>`;
}

/** O SVG inteiro do mapa, com a sua base marcada. */
export function svgDoMapa(meuTime = 0) {
  const { x0, z0, largura, altura } = MUNDO_MAPA;
  const { lane, mineradora: mn, hangares, acampamentos, nuvens, bases, torretas, servicos } = ESTRUTURAS_MAPA;
  const sonda = TRAJETO_SONDA_MAPA.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.z}`).join(' ') + ' Z';
  return `<svg viewBox="${x0} ${z0} ${largura} ${altura}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${meuTime === 0 ? tr('Mapa da partida: Lago de Hélio-3, com a sua base à esquerda') : tr('Mapa da partida: Lago de Hélio-3, com a sua base à direita')}">
    <defs>
      <filter id="mapa-nuvem" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="34"/></filter>
    </defs>
    <image href="${relevo()}" x="${x0}" y="${z0}" width="${largura}" height="${altura}" preserveAspectRatio="none"/>
    <g class="nuvens" filter="url(#mapa-nuvem)">${nuvens
      .map((a) => `<rect x="${a.x - a.largura / 2}" y="${a.z - a.profundidade / 2}" width="${a.largura}" height="${a.profundidade}" rx="${Math.min(a.largura, a.profundidade) * 0.4}" fill="${COR_NUVEM}"/>`)
      .join('')}</g>
    ${nuvens.map((a) => `<rect class="alvo-nuvem item" data-item="nuvem" x="${a.x - a.largura / 2}" y="${a.z - a.profundidade / 2}" width="${a.largura}" height="${a.profundidade}" rx="${Math.min(a.largura, a.profundidade) * 0.4}"/>`).join('')}
    <rect class="lane item" data-item="lane" x="${lane.xInicio}" y="${lane.z - lane.meiaLargura}" width="${lane.xFim - lane.xInicio}" height="${lane.largura}"/>
    <line class="lane-meio" x1="${lane.xInicio}" y1="${lane.z}" x2="${lane.xFim}" y2="${lane.z}"/>
    <path class="sonda-trajeto item" data-item="sonda" d="${sonda}"/>
    ${acampamentos.map((a) => `<circle class="acampamento item" data-item="acampamento:${a.id}" cx="${a.x}" cy="${a.z}" r="${a.raio + 12}" fill="${COR_MONSTRO}"/>`).join('')}
    <g class="mineradora item" data-item="mineradora">
      <rect x="${mn.x - mn.meiaX}" y="${mn.z - mn.meiaZ}" width="${mn.meiaX * 2}" height="${mn.meiaZ * 2}" rx="${mn.canto}"/>
      ${hangares.map((h) => `<rect class="hangar" x="${h.xMin}" y="${-h.meiaZ}" width="${h.xMax - h.xMin}" height="${h.meiaZ * 2}" fill="${corTime(h.time)}"/>`).join('')}
    </g>
    ${bases.map((b) => base(b, meuTime)).join('')}
    ${servicos.map(servico).join('')}
    ${torretas.map(torreta).join('')}
    ${OBJETIVOS_MAPA.map(objetivo).join('')}
  </svg>`;
}

/**
 * O mapa na Seleção. `el` é o `.mapa-partida` do index.html (com `.quadro-mapa`
 * dentro); `mostrar(meuTime)` redesenha só quando o time muda. A caixinha da dica
 * (`.dica-mapa-pop`) fica em posição fixa, para passar por cima do palco.
 */
export class MapaSelecao {
  constructor(el) {
    this.el = el;
    this.quadro = el.querySelector('.quadro-mapa');
    this.meuTime = null;
    this.pop = document.createElement('div');
    this.pop.className = 'dica-mapa-pop';
    this.pop.hidden = true;
    this.pop.setAttribute('role', 'tooltip');
    // Na tela da Seleção (some junto com ela), fora do .mapa-partida: a contenção de
    // tamanho dele prenderia a posição fixa da caixinha.
    (el.closest('.tela-menu') ?? document.body).append(this.pop);
    this.itemAtual = null;
    this.quadro.addEventListener('pointermove', (e) => this.#mover(e));
    this.quadro.addEventListener('pointerleave', () => this.esconderDica());
  }

  /** Desenha (ou mantém) o mapa com a base do time `meuTime` marcada como a sua. */
  mostrar(meuTime = 0) {
    if (this.meuTime === meuTime) return;
    this.meuTime = meuTime;
    this.quadro.innerHTML = svgDoMapa(meuTime);
    this.esconderDica();
  }

  esconderDica() {
    this.pop.hidden = true;
    this.itemAtual?.classList.remove('sob-mouse');
    this.itemAtual = null;
  }

  /** O mouse andou no mapa: abre (ou troca) a caixinha da peça embaixo dele e a leva junto. */
  #mover(e) {
    const item = e.target.closest?.('[data-item]');
    const dica = item ? dicaDoItem(item.dataset.item, this.meuTime ?? 0) : null;
    if (!dica) return this.esconderDica();
    if (item !== this.itemAtual) {
      this.itemAtual?.classList.remove('sob-mouse');
      this.itemAtual = item;
      item.classList.add('sob-mouse');
      this.pop.style.setProperty('--cor-dica', dica.cor ?? 'var(--neon)');
      this.pop.innerHTML = `<b>${esc(dica.titulo)}</b><span>${esc(dica.texto)}</span>`;
      this.pop.hidden = false;
    }
    // Do lado de fora do mapa, à esquerda (ele fica na coluna da direita, embaixo da
    // ficha), na altura do mouse: a caixinha não tapa o mapa. Sem sair da tela.
    const r = this.pop.getBoundingClientRect();
    const mapa = this.quadro.querySelector('svg').getBoundingClientRect();
    const x = Math.max(8, mapa.left - DICA_AFASTA_PX - r.width);
    const y = Math.max(8, Math.min(e.clientY - r.height / 2, innerHeight - r.height - 8));
    this.pop.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }
}
