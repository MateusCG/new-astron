// Visual das armas do Astro-N original (só aparência; quem acerta é o servidor).
//
// Cada golpe do catálogo (shared/armas.js) traz os ids dos efeitos visuais do
// original (`vis`: d = clarão do disparo, p = projétil, r = rastro, i = impacto, f =
// fim/área, a = armadilha ativa), e EFEITOS_VISUAIS diz as texturas de cada efeito
// (public/texturas/efeitos/<png>.png) com a cor dominante. Os efeitos do original são
// ADITIVOS (fundo preto = transparente): aqui todos usam AdditiveBlending, como manda
// o guia visual para efeito de luz. Quase todos os efeitos do original são planos
// deitados (quad no plano do chão, comprido no rumo do tiro): é o que lê bem na câmera
// de perseguição, que vê de trás e de cima. O projétil ganha também um plano em pé
// (cruz) para não sumir de lado e um brilho na cor da arma.
//
// Forma por categoria do original: feixe e raio = plano comprido com a textura;
// metralhadora = traçador fino na cor da arma (as texturas dela são do casco 3D da
// bala); canhão = carga animada (sprite que gira os quadros do original); míssil =
// casco + chama na cor da arma e rastro (esfumaçado, na cor do rastro do original);
// onda = arco que cresce com o raio de acerto; lâmina e lançador = hélice girando;
// nova = anel deitado crescendo + casca esférica clara; mina e campo = decalque no
// chão girando devagar.
//
// Desempenho: geometrias e materiais compartilhados por textura e cor; o que some aos
// poucos (clarão, impacto, área, nova, a carga do canhão) ganha material próprio, que
// sai de uma reserva e volta para ela no fim (nunca é liberado no meio da partida: o
// Three.js apagaria o programa de shader e o próximo efeito igual compilaria de novo);
// texturas baixadas uma vez (cache por nome), todas as da nave já na tela de
// carregamento (carregamento.js; quais são sai de insumos.js, que também guarda as
// sequências de quadros e as texturas de casco); sequências de quadros só nos
// efeitos curtos e na carga dos canhões.

import * as THREE from 'three';
import { WEAPONS, golpeDaArma, visualEfeito } from '/shared/armas.js';
import { brilho } from './nave.js';
import { corDaArma } from './armas.js';
import { PASTA_TEXTURAS_EFEITO, quadrosDe, texturaDoEfeito } from './insumos.js';

const QUADROS_POR_S = 24;
// Tamanhos (m) por categoria, na escala do jogo (efeitos do original × 0,25).
const TAM_PROJETIL = {
  beam: { comp: 7, larg: 2.4, brilho: 3.2 },
  raio: { comp: 7, larg: 2.8, brilho: 3.4 },
  suporte: { comp: 3.5, larg: 3.5, brilho: 4 },
  lamina: { comp: 3.4, larg: 3.4, brilho: 3 },
  lancador: { comp: 3.2, larg: 3.2, brilho: 3.4 },
  mina: { comp: 3, larg: 3, brilho: 2.6 },
  canhao: { comp: 3.6, larg: 3.6, brilho: 4.2 },
  gun: { comp: 4, larg: 0.26, brilho: 1.8 },
  onda: { comp: 4, larg: 4, brilho: 3 },
  nova: { comp: 4, larg: 4, brilho: 3 },
  missil: { comp: 0, larg: 0, brilho: 3.4 },
  dispositivo: { comp: 3, larg: 3, brilho: 3 },
};
// No máximo isto de efeitos passageiros (clarão, impacto, área, nova) na cena: passou,
// o mais velho sai. Um acampamento de SN-Zero VI provocado solta dezenas de balas de
// canhão com área por segundo; num quadro lento chegam muitos eventos de uma vez e,
// sem teto, os efeitos se empilhariam e deixariam o quadro seguinte ainda mais lento.
const PASSAGEIROS_MAX = 120;
const CLARAO_S = 0.12;
const IMPACTO_S = 0.4;
const AREA_S = 0.6;
const NOVA_FADE_S = 0.35;

const carregador = new THREE.TextureLoader();
const texturas = new Map(); // nome -> Texture (a imagem chega depois)
const carregando = new Map(); // nome -> Promise da textura pronta

/**
 * Baixa a textura de efeito do original (uma vez por nome) e devolve a promessa
 * dela pronta. A tela de carregamento espera todas as da nave antes da partida; no
 * meio dela, quem desenha usa texturaEfeito, que só pede (e já acha pronta).
 */
export function carregarTexturaEfeito(nome) {
  if (!carregando.has(nome)) {
    const p = new Promise((ok, falha) => {
      const t = carregador.load(PASTA_TEXTURAS_EFEITO + nome + '.png', ok, undefined, () => falha(new Error(`textura ${nome}`)));
      t.colorSpace = THREE.SRGBColorSpace;
      texturas.set(nome, t);
    });
    // Ninguém esperando (pedido do meio da partida): a falha não vira erro solto no
    // console; o efeito só sai sem a textura.
    p.catch(() => {});
    carregando.set(nome, p);
  }
  return carregando.get(nome);
}

/** Textura de efeito do original (cache por nome). */
export function texturaEfeito(nome) {
  if (!texturas.has(nome)) carregarTexturaEfeito(nome);
  return texturas.get(nome);
}

/** As texturas de efeito já pedidas (para a tela de carregamento enviar à placa de vídeo). */
export function texturasEfeitoPedidas() {
  return [...texturas.values()];
}

/** A primeira textura de luz (aditiva) do efeito visual `id`, ou null. */
const texturaDe = texturaDoEfeito;

/** Quadros de uma textura (ela mesma, ou a sequência do original que começa nela). */
function quadros(nome) {
  return quadrosDe(nome).map(texturaEfeito);
}

const BRANCO = new THREE.Color('#ffffff');

export class VisualArmas {
  constructor(scene) {
    this.scene = scene;
    this.mats = new Map(); // 'textura|cor' -> material compartilhado (aditivo)
    this.efeitos = []; // passageiros: clarão, impacto, área, nova
    // Reservas dos materiais próprios: 'sprite' e 'malha' (aditivos com textura) e
    // 'casca' (a casca da nova, sem textura: outro shader, então outra reserva).
    this.reservas = { sprite: [], malha: [], casca: [] };
    // Plano deitado de 1×1 m, comprido no eixo z (o rumo depois do lookAt).
    this.geoDeitado = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    // Plano em pé, comprido no eixo z: a "cruz" que aparece de lado.
    this.geoEmPe = new THREE.PlaneGeometry(1, 1).rotateY(Math.PI / 2);
    this.geoCasca = new THREE.SphereGeometry(1, 20, 12);
    this.geoBarra = new THREE.BoxGeometry(1, 1, 1);
    this.geoMissil = new THREE.CylinderGeometry(0.28, 0.4, 2.4, 6).rotateX(Math.PI / 2);
    this.geoNariz = new THREE.ConeGeometry(0.28, 0.8, 6).rotateX(Math.PI / 2).translate(0, 0, 1.6);
    this.matMissil = new THREE.MeshBasicMaterial({ color: '#c9d2d0' });
  }

  /** Material aditivo compartilhado (textura opcional, cor). */
  #mat(textura, cor = BRANCO, sprite = false) {
    const chave = `${textura ?? '-'}|${cor.getHexString()}|${sprite}`;
    if (!this.mats.has(chave)) {
      const opcoes = { map: textura ? texturaEfeito(textura) : brilho(), color: cor, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false };
      this.mats.set(chave, sprite ? new THREE.SpriteMaterial(opcoes) : new THREE.MeshBasicMaterial({ ...opcoes, side: THREE.DoubleSide }));
    }
    return this.mats.get(chave);
  }

  /** Material sólido (núcleo do feixe, traçador) por cor, compartilhado. */
  #matCor(cor) {
    const chave = 'n|' + cor.getHexString();
    if (!this.mats.has(chave)) this.mats.set(chave, new THREE.MeshBasicMaterial({ color: cor }));
    return this.mats.get(chave);
  }

  liberar() {
    for (const m of this.mats.values()) m.dispose();
    this.mats.clear();
    for (const e of this.efeitos) this.#tirar(e);
    this.efeitos = [];
    for (const lista of Object.values(this.reservas)) {
      for (const m of lista) m.dispose();
      lista.length = 0;
    }
    for (const g of [this.geoDeitado, this.geoEmPe, this.geoCasca, this.geoBarra, this.geoMissil, this.geoNariz, this.matMissil]) g.dispose();
  }

  /**
   * Desenho do projétil do golpe (kind, nível, profundidade): um grupo que olha para
   * +z (quem chama faz o lookAt no rumo). Devolve { g, guiado, giro, rastro, onda }.
   */
  projetil(kind, nv = 1, prof = 0) {
    const w = WEAPONS[kind];
    const golpe = golpeDaArma(kind, nv, prof);
    const cat = w?.categoria ?? 'beam';
    const tam = TAM_PROJETIL[cat] ?? TAM_PROJETIL.beam;
    const cor = new THREE.Color(corDaArma(kind, prof));
    const g = new THREE.Group();
    const vis = golpe?.vis ?? {};
    const missil = vis.tipo === 'missil_com_rastro' || cat === 'missil';
    const tex = texturaDe(vis.p);
    let giro = 0;
    if (missil) {
      g.add(new THREE.Mesh(this.geoMissil, this.matMissil), new THREE.Mesh(this.geoNariz, this.matMissil));
      const chama = new THREE.Sprite(this.#mat(null, cor.clone().lerp(BRANCO, 0.4), true));
      chama.scale.setScalar(tam.brilho);
      chama.position.z = -1.5;
      g.add(chama);
    } else if (cat === 'gun') {
      // Traçador: barra fina e clara na cor da arma (como o laser de antes).
      const barra = new THREE.Mesh(this.geoBarra, this.#matCor(cor.clone().lerp(BRANCO, 0.45)));
      barra.scale.set(tam.larg, tam.larg, tam.comp);
      g.add(barra);
    } else if (cat === 'canhao' && tex) {
      // Carga do canhão: sprite com os quadros do original girando.
      const s = new THREE.Sprite(this.#matProprio(tex, BRANCO, true));
      s.scale.setScalar(tam.comp);
      g.add(s);
      g.userData.anima = { mat: s.material, quadros: quadros(tex), t: 0 };
    } else if (tex) {
      const deitado = new THREE.Mesh(this.geoDeitado, this.#mat(tex));
      deitado.scale.set(tam.larg, 1, tam.comp);
      g.add(deitado);
      if (cat === 'beam' || cat === 'raio' || cat === 'onda') {
        const emPe = new THREE.Mesh(this.geoEmPe, this.#mat(tex));
        emPe.scale.set(1, tam.larg * 0.7, tam.comp);
        g.add(emPe);
      }
      if (cat === 'beam' || cat === 'raio') {
        // Núcleo claro: o feixe lê de longe na câmera de perseguição (o plano deitado
        // fica fino visto quase de lado).
        const nucleo = new THREE.Mesh(this.geoBarra, this.#matCor(cor.clone().lerp(BRANCO, 0.55)));
        nucleo.scale.set(0.28, 0.28, tam.comp * 0.8);
        g.add(nucleo);
      }
      if (cat === 'lamina' || cat === 'lancador' || cat === 'mina' || cat === 'suporte') giro = 9;
      g.userData.deitado = deitado;
    }
    const s = new THREE.Sprite(this.#mat(null, cor, true));
    s.scale.setScalar(tam.brilho);
    g.add(s);
    const rastro = vis.r ? new THREE.Color(visualEfeito(vis.r)?.cores?.[0] ?? '#8f8a83') : null;
    return { g, guiado: missil, giro, rastro, onda: golpe?.cresce ? tam : null };
  }

  /** Avança a animação de um projétil (quadros da carga, giro da hélice, onda crescendo). */
  animarProjetil(t, dt) {
    const a = t.g.userData.anima;
    if (a?.mat) {
      a.t += dt;
      a.mat.map = a.quadros[Math.floor(a.t * QUADROS_POR_S) % a.quadros.length];
    }
    if (t.giro) t.g.userData.deitado?.rotateY(t.giro * dt);
    if (t.onda && t.b.raio) {
      const d = t.g.userData.deitado;
      if (d) d.scale.set(t.b.raio * 2, 1, t.b.raio * 1.2);
    }
  }

  /** Devolve à reserva o material próprio de um projétil que saiu de cena. */
  soltarProjetil(g) {
    const a = g.userData.anima;
    if (a?.mat) this.#guardar(a.mat);
    if (a) a.mat = null;
  }

  /** Efeito passageiro na cena: some sozinho em `dur` s (atualizar). */
  #passageiro(obj, dur, anima = {}) {
    this.scene.add(obj);
    this.efeitos.push({ obj, vida: 0, dur, ...anima });
    if (this.efeitos.length > PASSAGEIROS_MAX) this.#tirar(this.efeitos.shift());
  }

  #tirar(e) {
    this.scene.remove(e.obj);
    e.obj.traverse?.((o) => {
      if (o.userData.proprio) this.#guardar(o.material);
    });
  }

  /** Guarda um material próprio na reserva dele (pelo `userData.reserva`). */
  #guardar(m) {
    this.reservas[m.userData.reserva]?.push(m);
  }

  /**
   * Material próprio (some aos poucos): aditivo, com a textura e a cor, da reserva
   * (troca só a textura, a cor e a opacidade; o shader é o mesmo de todos).
   */
  #matProprio(textura, cor = BRANCO, sprite = false) {
    const tipo = sprite ? 'sprite' : 'malha';
    let m = this.reservas[tipo].pop();
    if (!m) {
      const opcoes = { map: brilho(), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false };
      m = sprite ? new THREE.SpriteMaterial(opcoes) : new THREE.MeshBasicMaterial({ ...opcoes, side: THREE.DoubleSide });
      m.userData.reserva = tipo;
    }
    m.map = textura ? texturaEfeito(textura) : brilho();
    m.color.copy(cor);
    m.opacity = 1;
    return m;
  }

  /** Material da casca da nova (sem textura), da reserva. */
  #matCasca(cor) {
    let m = this.reservas.casca.pop();
    if (!m) {
      m = new THREE.MeshBasicMaterial({ blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
      m.userData.reserva = 'casca';
    }
    m.color.copy(cor);
    m.opacity = 0.16;
    return m;
  }

  /** Clarão na boca da arma (efeito 'd' do original, ou um brilho na cor da arma). */
  clarao(kind, x, y, z, nv = 1) {
    const golpe = golpeDaArma(kind, nv, 0);
    const tex = texturaDe(golpe?.vis?.d);
    const cor = tex ? BRANCO : new THREE.Color(corDaArma(kind));
    const s = new THREE.Sprite(this.#matProprio(tex, cor, true));
    s.userData.proprio = true;
    s.position.set(x, y, z);
    s.scale.setScalar(WEAPONS[kind]?.categoria === 'canhao' ? 4 : 2.6);
    this.#passageiro(s, CLARAO_S, { cresce: 1.4 });
  }

  /**
   * Impacto do golpe no ponto (efeito 'i' do original): plano deitado com a textura
   * (quadros, se é sequência) e um clarão na cor da arma. `tamanho` em m.
   */
  impacto(kind, nv, prof, x, y, z, tamanho = 4) {
    const golpe = golpeDaArma(kind, nv, prof);
    const tex = texturaDe(golpe?.vis?.i);
    const cor = new THREE.Color(corDaArma(kind, prof));
    const grupo = new THREE.Group();
    grupo.position.set(x, y, z);
    let anima = null;
    if (tex) {
      const m = new THREE.Mesh(this.geoDeitado, this.#matProprio(tex));
      m.userData.proprio = true;
      m.scale.set(tamanho, 1, tamanho);
      m.rotation.y = Math.random() * Math.PI * 2;
      grupo.add(m);
      const q = quadros(tex);
      if (q.length > 1) anima = { mat: m.material, quadros: q };
      const s = new THREE.Sprite(this.#matProprio(tex, BRANCO, true));
      s.userData.proprio = true;
      s.scale.setScalar(tamanho * 0.7);
      grupo.add(s);
    }
    const c = new THREE.Sprite(this.#matProprio(null, cor, true));
    c.userData.proprio = true;
    c.scale.setScalar(tamanho * 0.6);
    grupo.add(c);
    this.#passageiro(grupo, IMPACTO_S, { anima, cresce: 1.3 });
  }

  /**
   * Explosão em área do golpe (evento 'explosao'): o efeito de fim ('f') ou o de
   * impacto do original esticado até o raio, deitado, e um clarão.
   */
  area(kind, nv, prof, x, y, z, raio) {
    const golpe = golpeDaArma(kind, nv, prof);
    const tex = texturaDe(golpe?.vis?.f) ?? texturaDe(golpe?.vis?.i);
    const cor = new THREE.Color(corDaArma(kind, prof));
    const grupo = new THREE.Group();
    grupo.position.set(x, y, z);
    let anima = null;
    const r = Math.max(2, raio);
    if (tex) {
      const m = new THREE.Mesh(this.geoDeitado, this.#matProprio(tex));
      m.userData.proprio = true;
      m.scale.set(r * 2, 1, r * 2);
      grupo.add(m);
      const q = quadros(tex);
      if (q.length > 1) anima = { mat: m.material, quadros: q };
    }
    // Clarão mais fraco que o raio (área pequena e rápida, como a da Metralha Shrewdo,
    // não pode cegar a tela a cada tiro).
    const c = new THREE.Sprite(this.#matProprio(null, cor.clone().multiplyScalar(0.5), true));
    c.userData.proprio = true;
    c.scale.setScalar(Math.min(r * 0.8, 14));
    grupo.add(c);
    this.#passageiro(grupo, AREA_S, { anima, cresce: 1.15 });
  }

  /**
   * Nova (esfera que cresce parada no ponto): anel deitado com a textura do
   * original e uma casca clara, crescendo a `vel` m/s até `raio` (vel 0: na hora).
   */
  nova(kind, nv, prof, x, y, z, raio, vel) {
    const golpe = golpeDaArma(kind, nv, prof);
    const tex = texturaDe(golpe?.vis?.p) ?? texturaDe(golpe?.vis?.i);
    const cor = new THREE.Color(corDaArma(kind, prof));
    const grupo = new THREE.Group();
    grupo.position.set(x, y, z);
    if (tex) {
      const m = new THREE.Mesh(this.geoDeitado, this.#matProprio(tex));
      m.userData.proprio = true;
      m.scale.set(2, 1, 2); // o grupo cresce até o raio; o plano é o diâmetro
      grupo.add(m);
    }
    const casca = new THREE.Mesh(this.geoCasca, this.#matCasca(cor));
    casca.userData.proprio = true;
    casca.scale.set(1, 0.45, 1);
    grupo.add(casca);
    const dur = (vel > 0 ? raio / vel : 0.15) + NOVA_FADE_S;
    grupo.scale.setScalar(0.5);
    this.#passageiro(grupo, dur, { nova: { raio, vel, dur } });
  }

  /** Decalque no chão de uma mina ou campo (textura do projétil ou da armadilha do original). */
  decalque(kind, nv, prof, raio) {
    const golpe = golpeDaArma(kind, nv, prof);
    const tex = texturaDe(golpe?.vis?.a) ?? texturaDe(golpe?.vis?.p) ?? texturaDe(golpe?.vis?.i);
    const m = new THREE.Mesh(this.geoDeitado, tex ? this.#mat(tex) : this.#mat(null, new THREE.Color(corDaArma(kind, prof))));
    m.scale.set(raio * 2, 1, raio * 2);
    m.position.y = 0.4;
    return m;
  }

  /**
   * Campo (área parada que fere quem fica dentro): disco de luz redondo na cor da
   * arma do tamanho da área, com o decalque do original girando no miolo.
   */
  campo(kind, nv, prof, raio) {
    const g = new THREE.Group();
    const disco = new THREE.Mesh(this.geoDeitado, this.#mat(null, new THREE.Color(corDaArma(kind, prof)).multiplyScalar(0.55)));
    disco.scale.set(raio * 2.2, 1, raio * 2.2);
    disco.position.y = 0.3;
    g.add(disco);
    const miolo = this.decalque(kind, nv, prof, raio * 0.55);
    g.add(miolo);
    g.userData.miolo = miolo;
    g.userData.disco = disco;
    return g;
  }

  /** Tira de cena os passageiros SEM liberar os materiais (só no aquecimento da placa; ver Efeitos.esquecer). */
  esquecer() {
    for (const e of this.efeitos) this.scene.remove(e.obj);
    this.efeitos = [];
  }

  /** Avança os efeitos passageiros (chamar a cada quadro). */
  atualizar(dt) {
    this.efeitos = this.efeitos.filter((e) => {
      e.vida += dt;
      const k = e.vida / e.dur;
      if (k >= 1) {
        this.#tirar(e);
        return false;
      }
      if (e.anima) e.anima.mat.map = e.anima.quadros[Math.min(e.anima.quadros.length - 1, Math.floor(k * e.anima.quadros.length))];
      if (e.nova) {
        const { raio, vel, dur } = e.nova;
        const r = vel > 0 ? Math.min(raio, vel * e.vida) : raio;
        e.obj.scale.setScalar(Math.max(0.5, r));
        const some = Math.max(0, (e.vida - (dur - NOVA_FADE_S)) / NOVA_FADE_S);
        e.obj.traverse((o) => {
          if (o.material) o.material.opacity = (o.geometry === this.geoCasca ? 0.16 : 1) * (1 - some);
        });
        return true;
      }
      if (e.cresce) e.obj.scale.setScalar(1 + (e.cresce - 1) * k);
      e.obj.traverse((o) => {
        if (o.material && o.userData.proprio) o.material.opacity = 1 - k * k;
      });
      return true;
    });
  }
}
