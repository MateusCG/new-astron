// Modelos 3D das naves.
//
// A nave olha para -z (convenção do Three.js e de shared/sim.js). A nave de
// jogador é o modelo do Astro-N original da raça, classe e tier dela (glTF, com a
// cor da raça no brilho dos motores), e o time vem marcado por luzes nas pontas
// das asas (turquesa = do seu time, vermelho = do outro, relativo a quem olha); o
// minerador e a escolta armada, naves do servidor, são os modelos nossos do mapa
// (minerador.glb e escolta.glb, mid-poly PBR, via mapa-modelos.js), com a mesma marca
// de time. Os monstros da jungle (modelos do original) ficam em monstros.js.

import * as THREE from 'three';
import { RACES, WEAPONS, ARMAS } from '/shared/sim.js';
import { naveDe } from '/shared/naves.js';
import { instanciaMapa, pintar } from './mapa-modelos.js';

let texturaBrilho = null;

/** Textura radial para brilhos aditivos (motor, tiro, explosão). */
export function brilho() {
  if (texturaBrilho) return texturaBrilho;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.75)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  texturaBrilho = new THREE.CanvasTexture(c);
  return texturaBrilho;
}

function spriteBrilho(cor, tamanho) {
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: brilho(), color: cor, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }),
  );
  s.scale.setScalar(tamanho);
  return s;
}

// Peças que se repetem em toda nave, minerador e escolta (geometrias de primitivas,
// materiais de cor fixa, o brilho dos motores): uma por página, divididas por todos.
// Naves, mineradores e escoltas somem e voltam da tela o tempo todo (névoa de guerra);
// sem isso cada volta criava ~20 geometrias e ~8 materiais novos (subindo para a
// placa no quadro em que aparece). Só o que anima sozinho (o feixe da mineração, o
// brilho do He-3) tem material próprio.
const pecas = new Map();
function peca(chave, criar) {
  let p = pecas.get(chave);
  if (!p) pecas.set(chave, (p = criar()));
  return p;
}
const cilindro = (...a) => peca(`cilindro ${a.join(' ')}`, () => new THREE.CylinderGeometry(...a));

/** Sprite de brilho de motor com o material dividido por cor (a opacidade é fixa; o tamanho anima no objeto). */
function motorBrilho(cor, tamanho, opacidade) {
  const mat = peca(`motor ${cor.getHexString()} ${opacidade}`, () => {
    const m = new THREE.SpriteMaterial({ map: brilho(), color: cor, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    m.opacity = opacidade;
    return m;
  });
  const s = new THREE.Sprite(mat);
  s.scale.setScalar(tamanho);
  return s;
}

/** Neon do time relativo a quem olha (mesmos tons das bases em cena.js). */
export const COR_TIME = { aliado: new THREE.Color('#00efc0'), inimigo: new THREE.Color('#ff3b2a') };

// Neon no teto do guia visual: cor = emissive, intensidade perto de 1.
function matNeon(cor) {
  return new THREE.MeshStandardMaterial({ color: cor, emissive: cor, emissiveIntensity: 1, flatShading: true });
}

/**
 * Luz a mais no casco das naves de jogador e nas armas da asa: o mapa ficou mais
 * escuro para os tiros se destacarem (cena.js), e a nave, que é o que o piloto mais
 * olha, voltaria a ficar apagada. Multiplica toda a luz que chega no material (sol,
 * hemisférica, sombra e reflexo continuam com o mesmo desenho), como se as luzes da
 * cena fossem LUZ_NAVE vezes mais fortes só para ela; o resto da cena não muda.
 */
export const LUZ_NAVE = 1.4;
const uLuzNave = { value: LUZ_NAVE };

/** Material de casco ou de arma da asa (textura do modelo, regras do guia) com a LUZ_NAVE. */
function matCasco(map) {
  const m = new THREE.MeshStandardMaterial({ map, metalness: 0.4, roughness: 0.5, flatShading: true, side: THREE.DoubleSide });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uLuzNave = uLuzNave;
    shader.fragmentShader = shader.fragmentShader.replace('void main() {', 'uniform float uLuzNave;\nvoid main() {').replace(
      '#include <lights_fragment_end>',
      `#include <lights_fragment_end>
      reflectedLight.directDiffuse *= uLuzNave;
      reflectedLight.directSpecular *= uLuzNave;
      reflectedLight.indirectDiffuse *= uLuzNave;
      reflectedLight.indirectSpecular *= uLuzNave;`,
    );
  };
  m.customProgramCacheKey = () => 'luz-nave'; // um programa só para todas as naves e armas
  return m;
}

// Naves de jogador: os 45 modelos do Astro-N original (public/modelos/naves/<raça>/
// <classe>/<id>.glb, um por nave de shared/naves.js), escolhidos pela raça, pela
// classe e pelo tier da nave. A tela de carregamento (carregamento.js) baixa antes
// da partida TODAS as naves e todas as armas da asa (as suas e as de quem mais
// aparecer); se mesmo assim um modelo faltar (falha de rede), criarNave/definirNave
// pedem de novo e, até chegar, a nave é um losango neon do time no lugar. Cada
// arquivo é baixado e preparado uma vez só por página (cache por URL,
// que sobrevive a sair e entrar de novo) e todas as naves daquele modelo dividem a
// mesma geometria e o mesmo material; cada nave é só um Mesh novo.
//
// Os arquivos vêm com o nariz para +x (os motores, encaixes *_propulsion, ficam
// sempre em x negativo), em escala própria e às vezes em mais de uma malha (as
// Shrewdo têm 2 a 4 peças, cada uma com a sua textura). Aqui tudo gira para -z,
// encolhe e fica centrado na origem. O tamanho é pela média do comprimento com a
// envergadura (TAMANHO_POR_TIER, crescendo com o tier, e MULT_CLASSE: a Assault um
// pouco maior, a Mobile um pouco menor), e não só pelo comprimento: as asas-voadoras
// (Dragoner, Tracker) ficariam enormes de lado. Os pontos de encaixe (nós l_/r_/c_)
// passam pela mesma conta e dizem onde ficam os motores (todos os *_propulsion: a
// Eagle tem quatro) e as pontas das asas (l_fire01/r_fire01, a luz do time).
//
// Trocar de nave (Evolução) troca o modelo na hora: definirNave(raiz, ...) monta o
// modelo novo dentro do mesmo grupo, então o que estiver pendurado nele (auras,
// recall, anel de nível) continua.
//
// Armas na asa (como no original): o modelo da arma do Z vai pendurado no encaixe
// l_item da nave e o da do X no r_item (public/modelos/armas/<modelo>.glb, a peça da
// esquerda e a da direita quando a arma tem par). A arma passa pela MESMA conta da
// nave (a matriz do nó, o giro de +x para -z e a escala da nave), sem escala própria,
// então fica do tamanho certo em qualquer nave. O nó `fire` da arma é a boca: de lá
// sai o clarão e o desenho do tiro (bocaDaArma). Trocar de arma (definirArmas) troca o
// modelo, para você e para os outros (o snapshot traz as armas de cada jogador).

/** Tamanho da nave (m, média de comprimento e envergadura) por tier: ~11 a ~14 m de comprimento. */
const TAMANHO_POR_TIER = [9.6, 10.1, 10.6, 11.1, 11.6];
const MULT_CLASSE = { assault: 1.04, mobile: 0.97, functional: 1 };
// Envergadura máxima, em vezes o tamanho: as naves muito largas (Uranium Wing,
// Dragoner) encolhem um pouco a mais para não passar de ~17 m de lado a lado.
const ENVERGADURA_MAX = 1.45;

let carregador = null; // GLTFLoader, importado na primeira nave
const modelos = new Map(); // URL -> Promise do modelo preparado
const prontos = new Map(); // URL -> { partes: [{ geometria, material }], encaixes, propulsores, caixa }
const matNeonTime = {}; // 'aliado' | 'inimigo' -> material compartilhado da luz do time

/** A nave do catálogo para a raça, classe e tier (classe ou tier inválido: a primeira Assault). */
function naveDoCatalogo(race, classe, tier) {
  return naveDe(race, classe ?? 'assault', tier ?? 0) ?? naveDe(race, 'assault', 0) ?? naveDe('acron', 'assault', 0);
}

const urlDa = (nave) => '/' + nave.modelo;

/** Baixa e prepara o modelo da nave (uma vez por arquivo). */
function carregarNave(nave) {
  const url = urlDa(nave);
  if (!modelos.has(url)) {
    const p = (async () => {
      carregador ??= new (await import('three/addons/loaders/GLTFLoader.js')).GLTFLoader();
      const gltf = await carregador.loadAsync(url);
      const tamanho = TAMANHO_POR_TIER[nave.tier] * (MULT_CLASSE[nave.classe] ?? 1);
      const modelo = prepararModelo(gltf, tamanho);
      prontos.set(url, modelo);
      return modelo;
    })();
    // Falhou (rede): sai do cache para tentar de novo na próxima vez.
    p.catch(() => modelos.delete(url));
    modelos.set(url, p);
  }
  return modelos.get(url);
}

/**
 * Põe cada triângulo na ordem que concorda com as normais do arquivo (que apontam
 * para fora). O exportador das naves errou a ordem nas peças espelhadas: em várias
 * naves (Esper, Ranger, Tracker, Mirage, Snaker, Falcon...) quase todas as faces
 * vinham do avesso e, com o material de dois lados, a luz parecia vir de trás.
 */
function orientarFaces(geo) {
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  if (!nor) return;
  const idx = geo.index;
  const n = idx ? idx.count : pos.count;
  const v = (i) => (idx ? idx.getX(i) : i);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const soma = new THREE.Vector3();
  const t = new THREE.Vector3();
  for (let i = 0; i + 2 < n; i += 3) {
    const [ia, ib, ic] = [v(i), v(i + 1), v(i + 2)];
    a.fromBufferAttribute(pos, ia);
    b.fromBufferAttribute(pos, ib).sub(a);
    c.fromBufferAttribute(pos, ic).sub(a);
    soma.fromBufferAttribute(nor, ia).add(t.fromBufferAttribute(nor, ib)).add(t.fromBufferAttribute(nor, ic));
    if (b.cross(c).dot(soma) >= 0) continue;
    // Do avesso: troca o 2º e o 3º vértice do triângulo.
    if (idx) {
      idx.setX(i + 1, ic);
      idx.setX(i + 2, ib);
    } else {
      for (const attr of Object.values(geo.attributes)) {
        for (let k = 0; k < attr.itemSize; k++) {
          const x = attr.getComponent(i + 1, k);
          attr.setComponent(i + 1, k, attr.getComponent(i + 2, k));
          attr.setComponent(i + 2, k, x);
        }
      }
    }
  }
}

/** Gira o glTF para -z, escala para `tamanho` (média de comprimento e envergadura) e centra. */
function prepararModelo(gltf, tamanho) {
  gltf.scene.updateMatrixWorld(true);
  const malhas = [];
  const encaixes = new Map();
  const propulsores = [];
  const itensOriginal = new Map(); // 'l_item' | 'r_item' -> matriz do nó (espaço do arquivo)
  gltf.scene.traverse((o) => {
    if (o.isMesh) malhas.push(o);
    else if (o.userData?.astron_helper) {
      const p = o.getWorldPosition(new THREE.Vector3());
      if (!encaixes.has(o.name)) encaixes.set(o.name, p);
      if (/_propulsion$/.test(o.name)) propulsores.push(p.clone());
      if (/^[lr]_item$/.test(o.name) && !itensOriginal.has(o.name)) itensOriginal.set(o.name, o.matrixWorld.clone());
    }
  });
  if (!malhas.length) throw new Error('modelo da nave sem malha');

  // Nariz de +x para -z (todas as peças), depois escala e centro pela caixa do conjunto.
  const giro = new THREE.Matrix4().makeRotationY(Math.PI / 2);
  const geos = malhas.map((m) => m.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(giro, m.matrixWorld)));
  const caixa = new THREE.Box3();
  for (const g of geos) {
    g.computeBoundingBox();
    caixa.union(g.boundingBox);
  }
  const lados = caixa.getSize(new THREE.Vector3());
  const centro = caixa.getCenter(new THREE.Vector3());
  const escala = Math.min(tamanho / Math.sqrt(lados.x * lados.z), (tamanho * ENVERGADURA_MAX) / lados.x);
  const final = new THREE.Matrix4().makeScale(escala, escala, escala).multiply(new THREE.Matrix4().makeTranslation(-centro.x, -centro.y, -centro.z));
  for (const g of geos) orientarFaces(g.applyMatrix4(final));
  for (const p of [...encaixes.values(), ...propulsores]) p.applyMatrix4(giro).applyMatrix4(final);
  caixa.applyMatrix4(final);
  // Onde as armas penduram: a matriz do nó passando pela mesma conta da nave.
  const itens = {};
  for (const [nome, m] of itensOriginal) itens[nome[0]] = new THREE.Matrix4().multiplyMatrices(final, giro).multiply(m);

  // Material dentro das regras do guia (facetado, metal até 0.5), com a textura do modelo.
  const partes = malhas.map((m, i) => ({
    geometria: geos[i],
    material: matCasco(m.material.map),
  }));
  return { partes, encaixes, propulsores, caixa, itens };
}

// ---------- Armas na asa ----------

const armasCarregando = new Map(); // modelo -> Promise({ partes, boca })
const armasProntas = new Map(); // modelo -> { partes, boca }

/**
 * Baixa o modelo de arma (public/modelos/armas/<modelo>.glb), uma vez por arquivo.
 * A tela de carregamento chama para todas as armas da raça e da classe, para a
 * troca de arma (Q/E, inventário) pendurar a nova na hora, sem baixar nada.
 */
export function carregarArma(modelo) {
  if (!armasCarregando.has(modelo)) {
    const p = (async () => {
      carregador ??= new (await import('three/addons/loaders/GLTFLoader.js')).GLTFLoader();
      const gltf = await carregador.loadAsync(`/modelos/armas/${modelo}.glb`);
      gltf.scene.updateMatrixWorld(true);
      const partes = [];
      let boca = null;
      gltf.scene.traverse((o) => {
        if (o.isMesh) {
          const geo = o.geometry.clone().applyMatrix4(o.matrixWorld);
          orientarFaces(geo);
          partes.push({ geometria: geo, material: matCasco(o.material.map) });
        } else if (o.name === 'fire' && o.userData?.astron_helper) boca = o.getWorldPosition(new THREE.Vector3());
      });
      const pronta = { partes, boca };
      armasProntas.set(modelo, pronta);
      return pronta;
    })();
    p.catch(() => armasCarregando.delete(modelo));
    armasCarregando.set(modelo, p);
  }
  return armasCarregando.get(modelo);
}

/** Modelo da peça da arma (índice em ARMAS) no lado do encaixe (0 = Z, esquerda; 1 = X, direita). */
function modeloDaArma(arma, enc) {
  const w = WEAPONS[ARMAS[arma]];
  return w?.modelo?.[enc] ?? null;
}

/**
 * Pendura (ou troca) os modelos das armas da nave: `armas` = [índice do Z, do X].
 * Sem o encaixe no modelo da nave (losango enquanto carrega), não desenha nada.
 */
export function definirArmas(raiz, armas) {
  const ud = raiz.userData;
  const chave = (armas ?? []).join();
  if (ud.chaveArmas === chave) return;
  ud.chaveArmas = chave;
  ud.armas = armas ? [...armas] : null;
  montarArmas(raiz);
}

function montarArmas(raiz) {
  const ud = raiz.userData;
  if (!ud.casco || !ud.armas) return;
  ud.pecasArmas ??= [null, null];
  ud.bocas ??= [null, null];
  [0, 1].forEach((enc) => {
    const modelo = modeloDaArma(ud.armas[enc], enc);
    const m = ud.itens?.[enc ? 'r' : 'l'];
    const atual = ud.pecasArmas[enc];
    if (atual?.userData.modelo === modelo && atual.parent === ud.casco) return;
    if (atual) atual.parent?.remove(atual);
    ud.pecasArmas[enc] = null;
    ud.bocas[enc] = null;
    if (!modelo || !m) return;
    const montar = (pronta) => {
      if (modeloDaArma(ud.armas?.[enc], enc) !== modelo || ud.pecasArmas[enc]) return;
      const g = new THREE.Group();
      g.userData.modelo = modelo;
      for (const { geometria, material } of pronta.partes) {
        const malha = new THREE.Mesh(geometria, material);
        malha.castShadow = true;
        g.add(malha);
      }
      g.matrixAutoUpdate = false;
      g.matrix.copy(m);
      ud.casco.add(g);
      ud.pecasArmas[enc] = g;
      ud.bocas[enc] = pronta.boca ? pronta.boca.clone().applyMatrix4(m) : new THREE.Vector3().setFromMatrixPosition(m);
    };
    const pronta = armasProntas.get(modelo);
    if (pronta) montar(pronta);
    else carregarArma(modelo).then(montar).catch((err) => console.error('Falha ao carregar a arma', modelo, err));
  });
}

/**
 * Posição no mundo da boca da arma do encaixe (0 = Z, 1 = X) da nave, ou null se
 * a arma ainda não está montada. Serve para o clarão e o começo do desenho do tiro.
 */
export function bocaDaArma(raiz, enc, alvo = new THREE.Vector3()) {
  const b = raiz?.userData.bocas?.[enc];
  if (!b) return null;
  raiz.userData.corpo.updateWorldMatrix(true, false);
  return alvo.copy(b).applyMatrix4(raiz.userData.corpo.matrixWorld);
}

/**
 * Promessa do modelo da nave pronto (a tela de carregamento, a vitrine da entrada e
 * as miniaturas da Evolução). Falha de rede rejeita e sai do cache.
 */
export function modeloDaNave(race, classe, tier) {
  return carregarNave(naveDoCatalogo(race, classe, tier));
}

/**
 * Texturas dos modelos já prontos (naves e armas), para a tela de carregamento
 * enviar à placa de vídeo antes da partida (renderer.initTexture): sem isso, o
 * envio acontece no primeiro quadro em que a nave ou a arma aparece.
 */
export function texturasDosModelos() {
  const lista = new Set();
  for (const m of [...prontos.values(), ...armasProntas.values()]) for (const { material } of m.partes) if (material.map) lista.add(material.map);
  return [...lista];
}

/**
 * Nave de jogador da raça, classe e tier dados. `aliado` decide a marca do time
 * (luzes nas pontas das asas): turquesa se é do seu time, vermelho se não. A cor
 * da raça vai no brilho dos motores. Se o modelo ainda não chegou, aparece o
 * losango neon do time e o modelo entra sozinho quando carregar.
 * userData: corpo (inclina nas curvas), motores (brilhos), trem (pouso), nave
 * (URL do modelo desenhado).
 */
export function criarNave(race, { aliado = true, classe = 'assault', tier = 0 } = {}) {
  // O grupo de fora gira em yaw; o de dentro (corpo) inclina (roll) nas curvas. O
  // casco (modelo, luzes, motores e trem) fica dentro do corpo e é o que troca.
  const raiz = new THREE.Group();
  const corpo = new THREE.Group();
  raiz.add(corpo);
  Object.assign(raiz.userData, { corpo, motores: [], trem: null, aliado });
  definirNave(raiz, race, classe, tier);
  return raiz;
}

/**
 * Troca a nave desenhada (evoluiu: tier novo). Mesma nave, nada muda. Modelo
 * pronto, troca na hora; senão o losango segura o lugar (ou a nave antiga fica
 * até o modelo novo chegar).
 */
export function definirNave(raiz, race, classe, tier) {
  const nave = naveDoCatalogo(race, classe, tier);
  const chave = urlDa(nave);
  if (raiz.userData.nave === chave) return;
  raiz.userData.nave = chave;
  const pronto = prontos.get(chave);
  if (pronto) {
    montarCasco(raiz, pronto, race);
    return;
  }
  if (!raiz.userData.casco) montarCasco(raiz, null, race);
  carregarNave(nave)
    .then((modelo) => {
      if (raiz.userData.nave === chave) montarCasco(raiz, modelo, race);
    })
    .catch((err) => console.error('Falha ao carregar a nave', chave, err));
}

/** Material neon do time (um para todas as naves de cada lado). */
function neonDoTime(aliado) {
  const k = aliado ? 'aliado' : 'inimigo';
  return (matNeonTime[k] ??= matNeon(aliado ? COR_TIME.aliado : COR_TIME.inimigo));
}

const GEO_PONTA = new THREE.BoxGeometry(0.35, 0.35, 1.4);
const GEO_PE = new THREE.CylinderGeometry(0.35, 0.35, 0.15, 8);
const GEO_LOSANGO = new THREE.OctahedronGeometry(1, 0);
let materialEscuro = null;
function matEscuro() {
  return (materialEscuro ??= new THREE.MeshStandardMaterial({ color: '#2b3233', metalness: 0.4, roughness: 0.6, flatShading: true }));
}

/** Monta o casco (modelo ou, sem ele, o losango) dentro do corpo, no lugar do anterior. */
function montarCasco(raiz, modelo, race) {
  const { corpo, aliado } = raiz.userData;
  if (raiz.userData.casco) corpo.remove(raiz.userData.casco);
  const casco = new THREE.Group();
  const cor = new THREE.Color(RACES[race]?.cor ?? 0xffffff);
  const neonTime = neonDoTime(aliado);
  let caixa;
  let encaixes;
  let propulsores;
  let itens = null;
  if (modelo) {
    for (const { geometria, material } of modelo.partes) casco.add(new THREE.Mesh(geometria, material));
    ({ caixa, encaixes, propulsores, itens } = modelo);
  } else {
    // Losango neon do time enquanto o modelo não chega (do tamanho de uma nave).
    const lugar = new THREE.Mesh(GEO_LOSANGO, neonTime);
    lugar.scale.set(4.5, 1, 6.5);
    casco.add(lugar);
    caixa = new THREE.Box3(new THREE.Vector3(-4.5, -1, -6.5), new THREE.Vector3(4.5, 1, 6.5));
    encaixes = new Map();
    propulsores = [new THREE.Vector3(-1.2, 0, 5.5), new THREE.Vector3(1.2, 0, 5.5)];
  }

  // Marca do time: uma luz em cada ponta de asa (o que mais aparece na câmera de
  // perseguição), nos encaixes de arma da ponta (l_/r_fire01).
  for (const nome of ['l_fire01', 'r_fire01']) {
    const p = encaixes.get(nome);
    if (!p) continue;
    const ponta = new THREE.Mesh(GEO_PONTA, neonTime);
    ponta.position.copy(p);
    casco.add(ponta);
  }

  // Motores: brilho na cor da raça em cada bocal (encaixes *_propulsion).
  const motores = [];
  for (const p of propulsores) {
    const chama = motorBrilho(cor.clone().lerp(new THREE.Color('#fff2c0'), 0.15), 2.6, 0.75);
    chama.position.copy(p).add(new THREE.Vector3(0, 0, 0.6));
    motores.push(chama);
    casco.add(chama);
  }

  // Trem de pouso: três pernas que só aparecem com a nave pousada, do fundo do
  // casco até 1,45 m abaixo do centro (pousada, a nave fica a ALTURA_POUSADO do chão).
  const trem = new THREE.Group();
  const fundo = Math.min(-0.2, caixa.min.y);
  const comp = caixa.max.z - caixa.min.z;
  const altura = fundo + 1.45;
  for (const [x, z] of [
    [0, -comp * 0.3],
    [-1.6, comp * 0.18],
    [1.6, comp * 0.18],
  ]) {
    const perna = new THREE.Mesh(cilindro(0.12, 0.12, +Math.max(0.1, altura).toFixed(2), 5), matEscuro());
    perna.position.set(x, fundo - altura / 2, z);
    const pe = new THREE.Mesh(GEO_PE, matEscuro());
    pe.position.set(x, -1.45, z);
    trem.add(perna, pe);
  }
  trem.visible = false;
  casco.add(trem);

  casco.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  corpo.add(casco);
  Object.assign(raiz.userData, { casco, motores, trem, itens, pecasArmas: [null, null], bocas: [null, null] });
  montarArmas(raiz); // as armas voltam penduradas na nave nova
}

/**
 * Minerador: mini-nave de carga de uns 6 m (metade de uma nave de jogador), o
 * minerador.glb do mapa (mid-poly PBR, public/modelos/mapa/LISTA.md): casco com
 * cabine, dois motores laterais e as faixas `neon_time`, pintadas com a cor do time
 * de quem olha (turquesa seu, vermelho do outro). Em cima, a moldura do contêiner; o
 * minério (nó `minerador_carga`: bloco e cristais de He-3) só aparece com o contêiner
 * cheio. Minerando, desce um feixe azul até a bacia de He-3 do hangar. O minerador da
 * onda do Núcleo (`nucleo`) é o mesmo casco ESCALA_NUCLEO vezes maior, com a carga
 * sempre à mostra e um brilho azul-gelo pulsando em volta (carga de 50: o alvo enorme
 * da partida). Sem o modelo (não baixou), um losango do time segura o lugar.
 * userData: corpo, motores, carga (o minério), feixe, he3 (brilho do Núcleo).
 */
const ESCALA_NUCLEO = 1.7;
export function criarMinerador({ aliado = true, nucleo = false } = {}) {
  const corTime = aliado ? COR_TIME.aliado : COR_TIME.inimigo;
  const g = modeloDoServidor('minerador', aliado);
  const carga = g.getObjectByName('minerador_carga') ?? new THREE.Group();
  carga.visible = false;

  // Brilho dos motores, na boca de cada nacele do modelo.
  const motores = [];
  for (const lado of [-1, 1]) {
    const chama = motorBrilho(corTime.clone().lerp(new THREE.Color('#ffffff'), 0.3), 1.6, 0.7);
    chama.position.set(lado * 1.65, -0.2, 2.7);
    motores.push(chama);
    g.add(chama);
  }

  // Feixe de mineração: cone aditivo do casco até o chão (a nave paira a 10 m).
  // Material próprio: pulsa com a fase de cada minerador.
  const feixe = new THREE.Mesh(
    cilindro(0.35, 1.6, 9, 8, 1, true),
    new THREE.MeshBasicMaterial({ color: '#9fe8ff', transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  );
  feixe.position.y = -5.1;
  feixe.visible = false;
  g.add(feixe);

  let he3 = null;
  if (nucleo) {
    g.scale.setScalar(ESCALA_NUCLEO);
    he3 = spriteBrilho(new THREE.Color('#9fe8ff'), 11);
    he3.material.opacity = 0.5;
    he3.position.y = 1.5;
    g.add(he3);
  }

  const raiz = new THREE.Group();
  raiz.add(g);
  raiz.userData = { corpo: g, motores, carga, feixe, he3 };
  return raiz;
}

/**
 * Cópia do modelo de uma nave do servidor (minerador.glb, escolta.glb) com o
 * `neon_time` na cor do time de quem olha; sem o modelo, o losango do time.
 */
function modeloDoServidor(nome, aliado) {
  const g = instanciaMapa(nome);
  if (g) {
    pintar(g, 'neon_time', neonDoTime(aliado));
    return g;
  }
  const lugar = new THREE.Group();
  const losango = new THREE.Mesh(GEO_LOSANGO, neonDoTime(aliado));
  losango.scale.set(1.6, 0.8, 2.6);
  lugar.add(losango);
  return lugar;
}

/** Anima o minerador: contêiner cheio ou vazio, feixe pulsando enquanto minera ou despeja na bacia, motores. */
export function animarMinerador(m, { carga, minerando, descarga }, t, fase = 0) {
  const { carga: grupo, feixe, motores, he3 } = m.userData;
  grupo.visible = carga > 0 || !!he3;
  if (he3) he3.material.opacity = 0.35 + 0.25 * (Math.sin(t * 3 + fase) + 1) / 2;
  // Despejando na bacia da base, o mesmo feixe desce enquanto o minério cai (cena.js).
  feixe.visible = !!minerando || !!descarga;
  if (feixe.visible) {
    feixe.material.opacity = 0.25 + 0.2 * (Math.sin(t * 8 + fase) + 1) / 2;
    feixe.rotation.y = t * 2;
  }
  const base = minerando ? 0.8 : 1.6;
  for (const [i, s] of motores.entries()) s.scale.setScalar(base + Math.sin(t * 40 + i * 2 + fase) * 0.2);
}

/**
 * Escolta armada dos mineradores: o escolta.glb do mapa (mid-poly PBR), um caça de
 * asas enflechadas com as faixas, as pontas e as bocas dos canos na cor do time, e
 * a torre de dois canos em cima (nó `escolta_torre`, pivô no eixo dela: gira sozinha
 * para o alvo, a nave não precisa virar para atirar). Mais comprida e baixa que o
 * minerador, para a silhueta dizer "armada" de longe.
 * userData: corpo, motores, torre (o nó que gira em y, no referencial da nave).
 */
export function criarEscolta({ aliado = true } = {}) {
  const corTime = aliado ? COR_TIME.aliado : COR_TIME.inimigo;
  const g = modeloDoServidor('escolta', aliado);
  const motores = [];
  for (const lado of [-1, 1]) {
    const chama = motorBrilho(corTime.clone().lerp(new THREE.Color('#ffffff'), 0.3), 1.6, 0.7);
    chama.position.set(lado * 1.1, -0.1, 4.1);
    motores.push(chama);
    g.add(chama);
  }
  const raiz = new THREE.Group();
  raiz.add(g);
  raiz.userData = { corpo: g, motores, torre: g.getObjectByName('escolta_torre') ?? new THREE.Group(), mira: null, miraAte: 0 };
  return raiz;
}

/**
 * Anima a escolta: motores e a torre girando para `userData.mira` (yaw do mundo do
 * último tiro dela) até `userData.miraAte` (tempo de `t`); depois olha para a frente.
 */
export function animarEscolta(e, t, dt, fase = 0) {
  const { motores, torre, mira, miraAte = 0 } = e.userData;
  for (const [i, s] of motores.entries()) s.scale.setScalar(1.6 + Math.sin(t * 40 + i * 2 + fase) * 0.2);
  const quer = mira == null || t > miraAte ? 0 : mira - e.rotation.y;
  let d = quer - torre.rotation.y;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  torre.rotation.y += Math.max(-5 * dt, Math.min(5 * dt, d));
}

/** Atualiza motores (maiores com boost, quase apagados pousada) e o trem de pouso. */
export function atualizarMotor(nave, boost, t, pousado = false) {
  if (nave.userData.trem) nave.userData.trem.visible = pousado;
  const base = pousado ? 0.9 : boost ? 4.2 : 2.4;
  for (const [i, m] of nave.userData.motores.entries()) {
    m.scale.setScalar(base + Math.sin(t * 40 + i * 2) * 0.35);
  }
}
