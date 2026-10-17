// Névoa de guerra do cliente (visão do time, estilo MOBA).
//
// O servidor só manda o que algum aliado enxerga (server/visao.js). Aqui o cliente
// faz a MESMA conta (shared/visao.js: olho, olhosDaBase, raios e bloqueiaVisao) a
// partir do que ele já sabe dos aliados (a sua nave prevista, as naves, mineradores
// e escoltas do seu time no último snapshot, as torres sentinela de pé e a base) e
// desenha o mapa fora da visão escurecido e sem cor, sem esconder o terreno, como a
// névoa de guerra dos MOBAs. Dentro dos campos de asteroides que o time não vê, uma
// névoa própria (poeira azulada que se mexe devagar): é ali que alguém pode estar
// escondido.
//
// Como:
// - Grade de visibilidade do mapa inteiro, em células de CELULA m (150 × 112),
//   refeita REFAZER_S vezes por segundo. Os olhos fixos (base e torres) ficam em
//   cache até uma torre cair ou subir; os que andam testam só as células da caixa do
//   próprio raio, e célula já vista não é testada de novo. Rocha e mineradora não
//   são "vistas" pela conta (a linha até dentro delas cruza a própria rocha): a
//   visibilidade das células abertas vaza ESPALHAR_ROCHA células para dentro da
//   rocha, para a parede ao lado da nave aparecer acesa.
// - A grade vai para uma textura (R = visto, suavizado no tempo em SUAVE_S; G =
//   campo de asteroides) e um passo de tela inteira (pós-processo) reconstrói o
//   ponto do mundo de cada pixel pela profundidade e mistura a cor de "fora da
//   visão". Assim a névoa vale para qualquer material da cena (terreno, água,
//   rochas, modelos do Cenário) sem mexer em nenhum deles. Ponto abaixo da água
//   (fundo do lago visto pela água transparente) é levado ao plano da água pelo raio
//   da câmera, para a borda da névoa ficar no lugar certo na superfície.
// - O tone mapping e a conversão de cor saem no passo da névoa (a cena é
//   desenhada linear num alvo HalfFloat com MSAA e a profundidade numa textura).
// - Minimapa: `canvasMapa` é a mesma grade (escuro fora da visão), que o HUD
//   estica por cima do fundo (hud.minimapa, último parâmetro).
// - A neblina do horizonte (scene.fog) acompanha o raio de visão
//   (NEBLINA_PERTO/LONGE × VISAO_RAIO): dá a sensação de alcance sem apagar o mapa.
//
// Ganchos (main.js): `new Nevoa({ renderer, scene, meuTime })`, por quadro
// `nevoa.atualizar(dt, { eu, ents, torretas })` e `nevoa.desenhar(renderer, scene,
// camera)` no lugar de renderer.render; `nevoa.liberar()` ao sair.

import * as THREE from 'three';
import { MAP_HALF_X, MAP_HALF_Z, MINERADORA, NIVEL_AGUA, TORRETAS, emAsteroides, noMapaAberto, sdRetanguloArredondado } from '/shared/terrain.js';
import { VISAO_RAIO, VISAO_TORRETA, VISAO_MINERADOR, VISAO_ASTEROIDE_PERTO, olho, olhosDaBase, bloqueiaVisao } from '/shared/visao.js';

/** Lado da célula da grade (m). */
export const CELULA = 20;
const NX = Math.round((2 * MAP_HALF_X) / CELULA);
const NZ = Math.round((2 * MAP_HALF_Z) / CELULA);
/** Vezes por segundo que a grade é refeita. */
const REFAZER_S = 5;
/** Tempo (s) para a névoa abrir ou fechar numa célula (suavização no tempo). */
const SUAVE_S = 0.35;
/** Células que a visibilidade vaza para dentro de rocha e mineradora (paredes acesas). */
const ESPALHAR_ROCHA = 4;
/** Neblina do horizonte: começa e acaba nestas frações do raio de visão. */
const NEBLINA_PERTO = 1;
const NEBLINA_LONGE = 2.6;
/** Fora da visão: quanto da luz fica e quanto da cor fica (o resto vira cinza). */
const FORA_LUZ = 0.32;
const FORA_COR = 0.15;
// Cores da névoa, do ambiente do lago (frias, dessaturadas, nunca preto puro): o tom
// que a sombra da névoa puxa e a poeira dos asteroides escondidos.
const COR_NEVOA = new THREE.Color('#1c2c33');
const COR_POEIRA = new THREE.Color('#8fa6b2');
const PERTO2 = VISAO_ASTEROIDE_PERTO * VISAO_ASTEROIDE_PERTO;

/** Centro da célula (i, k) no mundo. */
const centroX = (i) => -MAP_HALF_X + (i + 0.5) * CELULA;
const centroZ = (k) => -MAP_HALF_Z + (k + 0.5) * CELULA;

// Planta fixa da grade: o que é sólido (rocha ou mineradora) e o campo de asteroides de cada célula.
const SOLIDO = new Uint8Array(NX * NZ);
const CAMPO = new Array(NX * NZ).fill(null);
for (let k = 0; k < NZ; k++) {
  for (let i = 0; i < NX; i++) {
    const x = centroX(i);
    const z = centroZ(k);
    const m = MINERADORA;
    SOLIDO[k * NX + i] = !noMapaAberto(x, z) || sdRetanguloArredondado(x, z, m.x, m.z, m.meiaX, m.meiaZ, m.canto) < 0 ? 1 : 0;
    CAMPO[k * NX + i] = emAsteroides(x, z);
  }
}

/** Marca em `vis` as células abertas que o olho enxerga (mesma regra de algumOlhoVe). */
function marcarOlho(vis, o) {
  const i0 = Math.max(0, Math.floor((o.x - o.raio + MAP_HALF_X) / CELULA));
  const i1 = Math.min(NX - 1, Math.floor((o.x + o.raio + MAP_HALF_X) / CELULA));
  const k0 = Math.max(0, Math.floor((o.z - o.raio + MAP_HALF_Z) / CELULA));
  const k1 = Math.min(NZ - 1, Math.floor((o.z + o.raio + MAP_HALF_Z) / CELULA));
  for (let k = k0; k <= k1; k++) {
    const z = centroZ(k);
    const dz = z - o.z;
    for (let i = i0; i <= i1; i++) {
      const c = k * NX + i;
      if (vis[c] || SOLIDO[c]) continue;
      const x = centroX(i);
      const dx = x - o.x;
      const d2 = dx * dx + dz * dz;
      if (d2 > o.r2) continue;
      const campo = CAMPO[c];
      if (campo && o.campo !== campo && d2 > PERTO2) continue;
      if (!bloqueiaVisao(o.x, o.z, x, z)) vis[c] = 1;
    }
  }
}

/** A visibilidade das células abertas vaza `passos` células para dentro do sólido. */
function espalharNaRocha(vis, passos) {
  let borda = [];
  for (let c = 0; c < vis.length; c++) if (vis[c] && !SOLIDO[c]) borda.push(c);
  for (let p = 0; p < passos && borda.length; p++) {
    const nova = [];
    for (const c of borda) {
      const i = c % NX;
      for (const v of [i > 0 ? c - 1 : -1, i < NX - 1 ? c + 1 : -1, c - NX, c + NX]) {
        if (v < 0 || v >= vis.length || vis[v] || !SOLIDO[v]) continue;
        vis[v] = 1;
        nova.push(v);
      }
    }
    borda = nova;
  }
}

/**
 * Olhos do seu time no cliente: a sua nave (`eu`, a posição desenhada), as naves,
 * mineradores e escoltas vivos do seu time no snapshot e as torres sentinela de pé.
 * A base fica de fora (olho fixo, em cache).
 */
export function olhosDoCliente({ meuTime, eu, ents = [], torretas = [] }) {
  const moveis = [];
  if (eu) moveis.push(olho(eu.x, eu.z, VISAO_RAIO));
  for (const e of ents) {
    if (!e.vivo || e.drone || e.time !== meuTime || (eu && e.id === eu.id)) continue;
    if (e.tipo === 'jogador') moveis.push(olho(e.x, e.z, VISAO_RAIO));
    else if (e.tipo === 'minerador' || e.tipo === 'escolta') moveis.push(olho(e.x, e.z, VISAO_MINERADOR));
  }
  const fixos = [];
  for (const t of torretas) {
    const p = TORRETAS.find((x) => x.id === t.id);
    if (p && p.time === meuTime && t.viva) fixos.push(olho(p.x, p.z, VISAO_TORRETA));
  }
  return { moveis, fixos };
}

const VERTICE = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }`;

const FRAGMENTO = `
  uniform sampler2D tCor;
  uniform sampler2D tProf;
  uniform sampler2D tNevoa;
  uniform mat4 projInv;
  uniform mat4 camMundo;
  uniform vec3 camPos;
  uniform vec2 meioMapa;
  uniform vec2 passoGrade;
  uniform float nivelAgua;
  uniform float tempo;
  uniform float foraLuz;
  uniform float foraCor;
  uniform float forca;
  uniform vec3 corNevoa;
  uniform vec3 corPoeira;
  varying vec2 vUv;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float ruido(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }

  void main() {
    vec3 c = texture2D(tCor, vUv).rgb;
    float prof = texture2D(tProf, vUv).x;
    if (prof < 1.0) {
      vec4 vista = projInv * vec4(vUv * 2.0 - 1.0, prof * 2.0 - 1.0, 1.0);
      vista /= vista.w;
      vec3 p = (camMundo * vista).xyz;
      // Abaixo da água (o fundo do lago visto pela água): o ponto da superfície no mesmo raio.
      if (p.y < nivelAgua && camPos.y > nivelAgua) p.xz = camPos.xz + (p.xz - camPos.xz) * (camPos.y - nivelAgua) / (camPos.y - p.y);
      vec2 uvN = (p.xz + meioMapa) / (2.0 * meioMapa);
      float v = texture2D(tNevoa, uvN).r * 2.0;
      v += texture2D(tNevoa, uvN + vec2(passoGrade.x, 0.0)).r;
      v += texture2D(tNevoa, uvN - vec2(passoGrade.x, 0.0)).r;
      v += texture2D(tNevoa, uvN + vec2(0.0, passoGrade.y)).r;
      v += texture2D(tNevoa, uvN - vec2(0.0, passoGrade.y)).r;
      v = smoothstep(0.12, 0.88, v / 6.0);
      float ast = texture2D(tNevoa, uvN).g;
      float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
      vec3 fora = mix(vec3(lum), c, foraCor) * foraLuz + corNevoa * 0.04;
      // Campo de asteroides que o time não vê: poeira que se mexe devagar.
      float n = ruido(p.xz * 0.018 + vec2(tempo * 0.07, -tempo * 0.05)) * 0.6 + ruido(p.xz * 0.06 - tempo * 0.11) * 0.4;
      // A borda do campo também se mexe, para não parecer uma placa.
      ast = smoothstep(0.25, 0.75, ast + (n - 0.5) * 0.45);
      fora = mix(fora, corPoeira * (0.22 + 0.22 * n) + fora * 0.4, ast * 0.75);
      c = mix(c, mix(fora, c, v), forca);
    }
    gl_FragColor = vec4(c, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

export class Nevoa {
  /**
   * @param {{ renderer: THREE.WebGLRenderer, scene: THREE.Scene, meuTime: number }} opcoes
   */
  constructor({ renderer, scene, meuTime }) {
    this.meuTime = meuTime;
    this.alvo = new Uint8Array(NX * NZ); // 0/1, da última conta
    this.atual = new Float32Array(NX * NZ); // suavizado no tempo
    this.fixos = { chave: null, vis: new Uint8Array(NX * NZ) };
    this.base = olhosDaBase(meuTime);
    this.desdeConta = Infinity;
    this.tempo = 0;
    this.primeira = true;

    // Textura da grade: R = visto (suavizado), G = campo de asteroides (fixo).
    this.dados = new Uint8Array(NX * NZ * 4);
    for (let c = 0; c < NX * NZ; c++) {
      this.dados[c * 4 + 1] = CAMPO[c] ? 255 : 0;
      this.dados[c * 4 + 3] = 255;
    }
    this.textura = new THREE.DataTexture(this.dados, NX, NZ, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.textura.magFilter = this.textura.minFilter = THREE.LinearFilter;
    this.textura.wrapS = this.textura.wrapT = THREE.ClampToEdgeWrapping;
    this.textura.needsUpdate = true;

    // Minimapa: a mesma grade, escura fora da visão.
    this.canvasMapa = document.createElement('canvas');
    this.canvasMapa.width = NX;
    this.canvasMapa.height = NZ;
    this.ctxMapa = this.canvasMapa.getContext('2d');
    this.imgMapa = this.ctxMapa.createImageData(NX, NZ);

    // Alvo da cena: cor linear em HalfFloat (o tone mapping sai no passo da névoa) e a profundidade numa textura.
    const tam = renderer.getDrawingBufferSize(new THREE.Vector2());
    this.alvoCena = new THREE.WebGLRenderTarget(tam.x, tam.y, {
      type: THREE.HalfFloatType,
      samples: 4,
      depthTexture: new THREE.DepthTexture(tam.x, tam.y, THREE.FloatType),
    });
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERTICE,
      fragmentShader: FRAGMENTO,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tCor: { value: this.alvoCena.texture },
        tProf: { value: this.alvoCena.depthTexture },
        tNevoa: { value: this.textura },
        projInv: { value: new THREE.Matrix4() },
        camMundo: { value: new THREE.Matrix4() },
        camPos: { value: new THREE.Vector3() },
        meioMapa: { value: new THREE.Vector2(MAP_HALF_X, MAP_HALF_Z) },
        passoGrade: { value: new THREE.Vector2(1 / NX, 1 / NZ) },
        nivelAgua: { value: NIVEL_AGUA },
        tempo: { value: 0 },
        foraLuz: { value: FORA_LUZ },
        foraCor: { value: FORA_COR },
        forca: { value: 1 }, // 0 desliga o desenho da névoa (depuração e comparação)
        corNevoa: { value: COR_NEVOA },
        corPoeira: { value: COR_POEIRA },
      },
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.quad.frustumCulled = false;
    this.cenaQuad = new THREE.Scene();
    this.cenaQuad.add(this.quad);
    this.camQuad = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // A neblina do horizonte acompanha o raio de visão.
    if (scene.fog?.isFog) {
      scene.fog.near = VISAO_RAIO * NEBLINA_PERTO;
      scene.fog.far = VISAO_RAIO * NEBLINA_LONGE;
    }
  }

  /** O time enxerga a célula do ponto (x, z) na última conta? (depuração e testes de navegador) */
  visto(x, z) {
    const i = Math.floor((x + MAP_HALF_X) / CELULA);
    const k = Math.floor((z + MAP_HALF_Z) / CELULA);
    return i >= 0 && i < NX && k >= 0 && k < NZ ? this.atual[k * NX + i] : 0;
  }

  /** Refaz a grade com os olhos de agora. */
  #contar(olhos) {
    // Olhos fixos (base e torres de pé): em cache até uma torre cair ou subir.
    const chave = olhos.fixos.map((o) => `${o.x},${o.z}`).join(';');
    if (chave !== this.fixos.chave) {
      this.fixos.chave = chave;
      this.fixos.vis.fill(0);
      for (const o of [...this.base, ...olhos.fixos]) marcarOlho(this.fixos.vis, o);
    }
    const vis = this.alvo;
    vis.set(this.fixos.vis);
    for (const o of olhos.moveis) marcarOlho(vis, o);
    espalharNaRocha(vis, ESPALHAR_ROCHA);
  }

  /**
   * Um quadro: refaz a grade REFAZER_S vezes por segundo e suaviza a textura.
   * `eu` = {id, x, z} da sua nave (null morta); `ents` = entidades do último
   * snapshot; `torretas` = estado das torretas (snapshot).
   */
  atualizar(dt, { eu, ents, torretas }) {
    this.tempo += dt;
    this.desdeConta += dt;
    if (this.desdeConta >= 1 / REFAZER_S) {
      this.desdeConta = 0;
      const t0 = performance.now();
      this.#contar(olhosDoCliente({ meuTime: this.meuTime, eu, ents, torretas }));
      this.msConta = performance.now() - t0;
    }
    // No primeiro quadro a névoa já nasce no lugar (sem abrir devagar o mapa inteiro).
    const k = this.primeira ? 1 : 1 - Math.exp(-dt / (SUAVE_S / 3));
    this.primeira = false;
    const img = this.imgMapa.data;
    for (let c = 0; c < NX * NZ; c++) {
      const a = (this.atual[c] += (this.alvo[c] - this.atual[c]) * k);
      this.dados[c * 4] = a * 255;
      img[c * 4] = 6;
      img[c * 4 + 1] = 14;
      img[c * 4 + 2] = 18;
      img[c * 4 + 3] = (1 - a) * 150;
    }
    this.textura.needsUpdate = true;
    this.ctxMapa.putImageData(this.imgMapa, 0, 0);
    this.material.uniforms.tempo.value = this.tempo;
  }

  /** Desenha a cena com a névoa (no lugar de renderer.render(scene, camera)). */
  desenhar(renderer, scene, camera) {
    const tam = renderer.getDrawingBufferSize(this.tamanho ?? (this.tamanho = new THREE.Vector2()));
    if (tam.x !== this.alvoCena.width || tam.y !== this.alvoCena.height) this.alvoCena.setSize(tam.x, tam.y);
    renderer.setRenderTarget(this.alvoCena);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    // Depois do render: a matriz da câmera é a que ele acabou de usar.
    const u = this.material.uniforms;
    u.projInv.value.copy(camera.projectionMatrixInverse);
    u.camMundo.value.copy(camera.matrixWorld);
    u.camPos.value.setFromMatrixPosition(camera.matrixWorld);
    renderer.render(this.cenaQuad, this.camQuad);
  }

  /** Solta da GPU o alvo, a textura e o passo da névoa (ao sair da partida). */
  liberar() {
    this.alvoCena.depthTexture?.dispose();
    this.alvoCena.dispose();
    this.textura.dispose();
    this.material.dispose();
    this.quad.geometry.dispose();
  }
}
