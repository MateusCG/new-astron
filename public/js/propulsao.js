// Propulsão das naves de jogador, como no AstroN original.
//
// O original (CUnit::RenderPropulsion e CUnit::RenderScene, decompilados do libgame;
// as regras e a conversão estão em tools/propulsao_do_original.py) tem oito encaixes
// de propulsão por nave, nos pontos do próprio modelo: os motores l_propulsion e
// r_propulsion, o nariz c_fire01/c_fire02 e as pontas das asas l_fire01/l_fire02 e
// r_fire01/r_fire02. Cada raça tem três efeitos (public/modelos/propulsao/): o normal
// (NG001) nos motores com a nave andando para a frente, o turbo (NG002) no lugar dele
// com o boost, e o auxiliar (NG003) nos outros seis: no nariz andando de ré, nas
// pontas de uma asa na curva (de ré, na outra) e em todos subindo ou descendo do
// pouso. Cada encaixe acende e apaga devagar (lá o alfa anda 0,05 por quadro:
// ALFA_POR_S); a chama treme trocando a textura em ciclo (os três quadros do .MPL do
// original, a QUADROS_POR_S); tudo aditivo e sem luz, no branco das texturas, que
// já trazem a cor da raça na borda (Acron azul, Bellico vermelho, Shrewdo verde).
//
// Por cima do original (o Mateus pediu "igual ou melhor"): a chama cresce com a
// velocidade (de COMPRIMENTO_MIN parada até 1 na velocidade da nave), o turbo acende
// com um estalo (a chama nasce IGNICAO_MAIOR vezes maior e assenta em IGNICAO_S), um
// brilho suave na cor da raça no bocal segura o motor quando ele é visto de lado (os
// planos do original somem de perfil), e cada encaixe treme com a sua fase, para os
// dois motores não piscarem juntos.

import * as THREE from 'three';

export const PASTA_PROPULSAO = '/modelos/propulsao/';
/** Os três efeitos de cada raça (public/modelos/propulsao/<raça>-<efeito>.glb). */
export const EFEITOS_PROPULSAO = Object.freeze(['normal', 'turbo', 'auxiliar']);

/** Encaixes do modelo da nave por papel (os nós do glb; motor pode ter mais de dois, como a Eagle). */
export const ENCAIXES_PROPULSAO = Object.freeze({
  motor: /_propulsion$/,
  re: /^c_fire0[12]$/,
  esquerda: /^l_fire0[12]$/,
  direita: /^r_fire0[12]$/,
});

/** Alfa por segundo ao acender e apagar (o original: 0,05 por quadro). */
export const ALFA_POR_S = 1.4;
/** Troca do normal para o turbo e de volta (o original troca na hora; aqui funde rápido). */
const TROCA_POR_S = 6;
/** Quadros por segundo do tremor (a textura do .MPL em ciclo) e do pulso do auxiliar. */
const QUADROS_POR_S = 24;
/** Comprimento da chama com a nave quase parada, em relação ao da velocidade dela. */
export const COMPRIMENTO_MIN = 0.55;
/** Força de cada efeito (opacidade no alfa cheio): o turbo tem três peças aditivas de dois lados. */
const FORCA = { normal: 1, turbo: 0.8, auxiliar: 0.9 };
/** Estalo do turbo: quanto maior a chama nasce e em quanto tempo assenta. */
const IGNICAO_MAIOR = 1.2;
const IGNICAO_S = 0.3;
/** Brilho do bocal (m, antes da escala da nave) e a força dele no normal e no turbo. */
const BRILHO_TAM = 5.5;
const BRILHO_NORMAL = 0.25;
const BRILHO_TURBO = 0.4;
/** Cor do brilho do bocal por raça (o tom da borda das texturas do original). */
const COR_BRILHO = { acron: '#5d8cff', bellico: '#ff4a5a', shrewdo: '#5cff6a' };

let carregador = null;
const texLoader = new THREE.TextureLoader();
const texturas = new Map(); // nome -> Texture
const pedidos = new Map(); // raça -> Promise({ normal, turbo, auxiliar })
const prontos = new Map(); // raça -> { normal, turbo, auxiliar }
const matsBrilho = new Map(); // raça -> SpriteMaterial (o molde; cada bocal tem a cópia dele)

const esperas = new Map(); // nome -> Promise da textura baixada

function textura(nome) {
  let t = texturas.get(nome);
  if (!t) {
    esperas.set(nome, new Promise((ok, falha) => (t = texLoader.load(`${PASTA_PROPULSAO}texturas/${nome}.png`, ok, undefined, falha))));
    t.colorSpace = THREE.SRGBColorSpace;
    t.flipY = false; // UV do glTF (como o GLTFLoader faz com as texturas de dentro do glb)
    texturas.set(nome, t);
  }
  return t;
}

/** Peças de um glb de efeito: geometria, quadros (texturas), pulso e se é chama (sai do encaixe) ou clarão (centrado nele). */
function pecasDoEfeito(gltf) {
  const pecas = [];
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    const geometria = o.geometry.clone().applyMatrix4(o.matrixWorld);
    geometria.computeBoundingBox();
    const caixa = geometria.boundingBox;
    const quadros = (o.material.userData?.quadros ?? []).map(textura);
    pecas.push({ geometria, quadros, pulso: o.userData?.pulso ?? null, chama: caixa.min.x >= -0.05 * (caixa.max.x - caixa.min.x) });
  });
  return pecas;
}

/** Baixa os três efeitos da raça (uma vez por página). Falha de rede sai do cache. */
export function carregarPropulsao(race) {
  if (!pedidos.has(race)) {
    const p = (async () => {
      carregador ??= new (await import('three/addons/loaders/GLTFLoader.js')).GLTFLoader();
      const efeitos = {};
      await Promise.all(
        EFEITOS_PROPULSAO.map(async (e) => {
          efeitos[e] = pecasDoEfeito(await carregador.loadAsync(`${PASTA_PROPULSAO}${race}-${e}.glb`));
        }),
      );
      // Todos os quadros do tremor já baixados (a tela de carregamento os envia à placa).
      await Promise.all([...esperas.values()]);
      prontos.set(race, efeitos);
      return efeitos;
    })();
    p.catch(() => pedidos.delete(race));
    pedidos.set(race, p);
  }
  return pedidos.get(race);
}

/** Texturas já pedidas (a tela de carregamento envia à placa de vídeo antes da partida). */
export function texturasDaPropulsao() {
  return [...texturas.values()];
}

function moldeBrilho(race, mapa) {
  let m = matsBrilho.get(race);
  if (!m) {
    m = new THREE.SpriteMaterial({ map: mapa, color: COR_BRILHO[race] ?? '#ffffff', blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
    matsBrilho.set(race, m);
  }
  return m;
}

/** Uma camada (um efeito) num encaixe: as malhas com material próprio (opacidade e quadro de cada uma). */
function camada(pecas, fase) {
  const malhas = pecas.map((p) => {
    const mat = new THREE.MeshBasicMaterial({
      map: p.quadros[0] ?? null,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      opacity: 0,
    });
    const m = new THREE.Mesh(p.geometria, mat);
    m.visible = false;
    m.userData.peca = p;
    return m;
  });
  return { malhas, fase, quadro: -1 };
}

/**
 * Monta a propulsão no casco da nave. `encaixes` = [{ nome, matriz }] (matriz do nó do
 * encaixe já no espaço do casco, com a escala da nave); `brilho` é a textura radial do
 * brilho do bocal (a de nave.js). Se os efeitos da raça ainda não chegaram, monta
 * quando chegarem. Devolve o equipamento que animarPropulsao anima.
 */
export function montarPropulsao(casco, race, encaixes, brilho) {
  const equip = { slots: [], alfa: 0, turbo: 0, ignicao: 0, turboAntes: false };
  // Chegou depois de a nave trocar de casco: monta no antigo, que já saiu da cena.
  const montar = (efeitos) => {
    let i = 0;
    for (const { nome, matriz } of encaixes) {
      const papel = Object.keys(ENCAIXES_PROPULSAO).find((k) => ENCAIXES_PROPULSAO[k].test(nome));
      if (!papel) continue;
      const g = new THREE.Group();
      g.matrixAutoUpdate = false;
      g.matrix.copy(matriz);
      const fase = (i++ * 0.37) % 1;
      const slot = { papel, grupo: g, alfa: 0, camadas: {} };
      if (papel === 'motor') {
        slot.camadas.normal = camada(efeitos.normal, fase);
        slot.camadas.turbo = camada(efeitos.turbo, fase + 0.5);
        slot.brilho = new THREE.Sprite(moldeBrilho(race, brilho).clone());
        slot.brilho.material.opacity = 0;
        slot.brilho.scale.setScalar(BRILHO_TAM);
        slot.brilho.position.x = 0.6; // um pouco para fora do bocal
        slot.brilho.visible = false;
        g.add(slot.brilho);
      } else {
        slot.camadas.auxiliar = camada(efeitos.auxiliar, fase);
      }
      for (const c of Object.values(slot.camadas)) for (const m of c.malhas) g.add(m);
      casco.add(g);
      equip.slots.push(slot);
    }
  };
  const efeitos = prontos.get(race);
  if (efeitos) montar(efeitos);
  else carregarPropulsao(race).then(montar).catch((err) => console.error('Falha ao carregar a propulsão', race, err));
  return equip;
}

function aproximar(v, alvo, passo) {
  return v < alvo ? Math.min(alvo, v + passo) : Math.max(alvo, v - passo);
}

/** Desenha uma camada com o alfa dado: quadro do tremor, pulso e comprimento. */
function desenharCamada(c, alfa, t, comprimento) {
  const visivel = alfa > 0.004;
  const k = Math.floor((t + c.fase) * QUADROS_POR_S);
  for (const m of c.malhas) {
    m.visible = visivel;
    if (!visivel) continue;
    const { quadros, pulso, chama } = m.userData.peca;
    m.material.opacity = alfa;
    if (quadros.length > 1) m.material.map = quadros[k % quadros.length];
    const p = pulso ? pulso[k % pulso.length] : null;
    const comp = chama ? comprimento : 1;
    m.scale.set((p?.[0] ?? 1) * comp, p?.[1] ?? 1, p?.[2] ?? 1);
  }
}

/** Velocidade (m/s) para a frente ou de ré que já conta como andando. */
const VEL_ANDANDO = 0.8;
/** Inclinação na curva (fração da inclinação máxima) que já conta como virando. */
const CURVA_MIN = 0.25;

/**
 * Quais encaixes acendem (a regra do CUnit::RenderScene do original). `estado`: frente
 * (velocidade para a frente em m/s, negativa de ré), curva (−1 a 1: positivo para a
 * esquerda), vertical (subindo ou descendo do pouso), turbo e pousado (no chão: tudo
 * apaga). Motor com a nave andando para a frente (turbo no lugar do normal com o
 * boost); nariz de ré; na curva, as pontas da asa de fora (curva para a esquerda: as
 * da direita, que empurram aquela asa para a frente; de ré, o contrário, como lá);
 * subindo ou descendo do pouso, todos os auxiliares. Parada e reta, nada.
 */
export function encaixesAcesos({ frente = 0, curva = 0, vertical = false, turbo = false, pousado = false } = {}) {
  const anda = !pousado && frente > VEL_ANDANDO;
  const re = !pousado && frente < -VEL_ANDANDO;
  const vira = pousado || Math.abs(curva) <= CURVA_MIN ? 0 : Math.sign(curva);
  const lado = vira === 0 ? null : (vira > 0) !== re ? 'direita' : 'esquerda';
  return {
    motor: anda,
    turbo: anda && turbo,
    re: re || vertical,
    esquerda: vertical || lado === 'esquerda',
    direita: vertical || lado === 'direita',
  };
}

/**
 * Anima a propulsão: o `estado` de encaixesAcesos, mais velocidade (a da nave, m/s:
 * a chama cresce até ela). `dt` em segundos.
 */
export function animarPropulsao(equip, estado, t, dt) {
  if (!equip) return;
  const { frente = 0, velocidade = 50 } = estado;
  const acesos = encaixesAcesos(estado);
  const querTurbo = acesos.turbo;
  if (querTurbo && !equip.turboAntes) equip.ignicao = IGNICAO_S;
  equip.turboAntes = querTurbo;
  equip.ignicao = Math.max(0, equip.ignicao - dt);
  equip.turbo = aproximar(equip.turbo, querTurbo ? 1 : 0, TROCA_POR_S * dt);
  const estalo = 1 + (IGNICAO_MAIOR - 1) * (equip.ignicao / IGNICAO_S);
  const fracao = Math.min(1, Math.max(0, frente / Math.max(1, velocidade)));
  const comprimento = COMPRIMENTO_MIN + (1 - COMPRIMENTO_MIN) * fracao;
  for (const s of equip.slots) {
    s.alfa = aproximar(s.alfa, acesos[s.papel] ? 1 : 0, ALFA_POR_S * dt);
    if (s.papel === 'motor') {
      desenharCamada(s.camadas.normal, s.alfa * (1 - equip.turbo) * FORCA.normal, t, comprimento);
      desenharCamada(s.camadas.turbo, s.alfa * equip.turbo * FORCA.turbo, t, estalo);
      const forca = s.alfa * (BRILHO_NORMAL + (BRILHO_TURBO - BRILHO_NORMAL) * equip.turbo) * (0.92 + 0.08 * Math.sin(t * 31 + s.camadas.normal.fase * 6));
      s.brilho.visible = forca > 0.004;
      s.brilho.material.opacity = Math.min(1, forca * estalo);
      s.brilho.scale.setScalar(BRILHO_TAM * (1 + 0.35 * equip.turbo) * estalo);
    } else {
      desenharCamada(s.camadas.auxiliar, s.alfa * FORCA.auxiliar, t, 1);
    }
  }
}
