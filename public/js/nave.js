// Modelos 3D das naves, montados com primitivas (low-poly, sem arquivo de modelo).
//
// A nave olha para -z (convenção do Three.js e de shared/sim.js). Cada raça usa a
// mesma silhueta de caça com a cor da raça nas asas, e o time vem marcado por um
// anel de luz na fuselagem e luzes nas pontas das asas (turquesa = do seu time,
// vermelho = do outro, relativo a quem olha); os mineradores são mini-naves de
// carga com a mesma marca de time; os drones Arnosh são uma
// criatura orgânica escura com olho vermelho, como os inimigos dos planetas de
// missão do AstroN. Quando houver modelos de verdade (glTF feitos no Blender),
// só este arquivo muda.

import * as THREE from 'three';
import { RACES } from '/shared/sim.js';

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

function asa(cor) {
  // Asa em flecha: perfil 2D extrudado com pouca espessura.
  const f = new THREE.Shape();
  f.moveTo(0, -1.5);
  f.lineTo(5.8, 2.6);
  f.lineTo(5.8, 3.6);
  f.lineTo(0, 3.2);
  f.closePath();
  const geo = new THREE.ExtrudeGeometry(f, { depth: 0.35, bevelEnabled: false });
  geo.rotateX(Math.PI / 2);
  geo.translate(0, 0.17, 0);
  // DoubleSide porque a asa esquerda é a direita espelhada (scale.x = -1).
  const mat = new THREE.MeshStandardMaterial({ color: cor, metalness: 0.55, roughness: 0.4, flatShading: true, side: THREE.DoubleSide });
  return new THREE.Mesh(geo, mat);
}

/** Neon do time relativo a quem olha (mesmos tons das bases em cena.js). */
export const COR_TIME = { aliado: new THREE.Color('#00efc0'), inimigo: new THREE.Color('#ff3b2a') };

// Neon no teto do guia visual: cor = emissive, intensidade perto de 1.
function matNeon(cor) {
  return new THREE.MeshStandardMaterial({ color: cor, emissive: cor, emissiveIntensity: 1, flatShading: true });
}

/**
 * Nave de jogador da raça dada. `aliado` decide a marca do time (anel na
 * fuselagem e luzes nas pontas das asas): turquesa se é do seu time, vermelho se
 * não. userData.motores guarda os brilhos do motor.
 */
export function criarNave(race, { aliado = true } = {}) {
  const cor = new THREE.Color(RACES[race]?.cor ?? 0xffffff);
  const g = new THREE.Group();
  const casco = new THREE.MeshStandardMaterial({ color: '#c9d2d0', metalness: 0.7, roughness: 0.35, flatShading: true });
  const escuro = new THREE.MeshStandardMaterial({ color: '#2b3233', metalness: 0.6, roughness: 0.5, flatShading: true });

  const fuselagem = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.3, 7.5, 6), casco);
  fuselagem.rotation.x = -Math.PI / 2;
  const nariz = new THREE.Mesh(new THREE.ConeGeometry(0.7, 3.2, 6), casco);
  nariz.rotation.x = -Math.PI / 2;
  nariz.position.z = -5.35;
  const cabine = new THREE.Mesh(
    new THREE.SphereGeometry(0.75, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: '#0b2a33', emissive: '#00b3ff', emissiveIntensity: 0.6, metalness: 0.2, roughness: 0.1 }),
  );
  cabine.scale.set(1, 0.8, 2.2);
  cabine.position.set(0, 0.55, -1.6);

  const asaD = asa(cor);
  asaD.position.set(0.6, -0.1, -0.2);
  const asaE = asa(cor);
  asaE.scale.x = -1;
  asaE.position.set(-0.6, -0.1, -0.2);

  const leme = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.8, 2.2), new THREE.MeshStandardMaterial({ color: cor, flatShading: true }));
  leme.position.set(0, 1.1, 2.6);
  leme.rotation.x = -0.35;

  g.add(fuselagem, nariz, cabine, asaD, asaE, leme);

  // Marca do time: anel de luz em volta da fuselagem, atrás da cabine, e uma luz
  // em cada ponta de asa (o que mais aparece na câmera de perseguição).
  const neonTime = matNeon(aliado ? COR_TIME.aliado : COR_TIME.inimigo);
  const anelTime = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.14, 4, 16), neonTime);
  anelTime.position.z = 1.6;
  g.add(anelTime);
  for (const lado of [-1, 1]) {
    const ponta = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 1), neonTime);
    ponta.position.set(lado * 6.45, 0.17, 3.1);
    g.add(ponta);
  }

  const motores = [];
  for (const lado of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, 2.6, 8), escuro);
    m.rotation.x = -Math.PI / 2;
    m.position.set(lado * 1.5, 0, 3.2);
    const bocal = new THREE.Mesh(
      new THREE.CircleGeometry(0.5, 10),
      new THREE.MeshBasicMaterial({ color: cor.clone().lerp(new THREE.Color('#ffffff'), 0.5) }),
    );
    bocal.position.set(lado * 1.5, 0, 4.52);
    const chama = spriteBrilho(cor.clone().lerp(new THREE.Color('#fff2c0'), 0.15), 2.6);
    chama.material.opacity = 0.75;
    chama.position.set(lado * 1.5, 0, 5.1);
    motores.push(chama);
    g.add(m, bocal, chama);
  }
  // Trem de pouso: três pernas que só aparecem com a nave pousada.
  const trem = new THREE.Group();
  for (const [x, z] of [
    [0, -3.6],
    [-1.6, 2.2],
    [1.6, 2.2],
  ]) {
    const perna = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.4, 5), escuro);
    perna.position.set(x, -0.8, z);
    const pe = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.15, 8), escuro);
    pe.position.set(x, -1.45, z);
    trem.add(perna, pe);
  }
  trem.visible = false;
  g.add(trem);

  g.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });

  // O grupo de fora gira em yaw; o de dentro inclina (roll) nas curvas.
  const raiz = new THREE.Group();
  raiz.add(g);
  raiz.userData = { corpo: g, motores, trem };
  return raiz;
}

/**
 * Minerador: mini-nave de carga de uns 6 m (metade de uma nave de jogador), casco
 * cinza quadrado, cabine na frente, dois motores laterais e faixas de neon com a
 * cor do time de quem olha (turquesa seu, vermelho do outro). Em cima, a moldura
 * do contêiner; o minério (bloco e cristais azul-gelo, a cor do minério no mapa)
 * só aparece com o contêiner cheio. Minerando, desce um feixe azul até os cristais.
 * userData: corpo, motores, carga (grupo do minério), feixe.
 */
export function criarMinerador({ aliado = true } = {}) {
  const corTime = aliado ? COR_TIME.aliado : COR_TIME.inimigo;
  const g = new THREE.Group();
  const casco = new THREE.MeshStandardMaterial({ color: '#9aa5a3', metalness: 0.4, roughness: 0.6, flatShading: true });
  const escuro = new THREE.MeshStandardMaterial({ color: '#2b3233', metalness: 0.4, roughness: 0.6, flatShading: true });
  const neonTime = matNeon(corTime);

  const corpo = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.2, 4.6), casco);
  const cabine = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 1.1, 1.4, 4),
    new THREE.MeshStandardMaterial({ color: '#0b2a33', emissive: '#00b3ff', emissiveIntensity: 0.5, roughness: 0.3, flatShading: true }),
  );
  cabine.rotation.set(-Math.PI / 2, Math.PI / 4, 0);
  cabine.position.set(0, 0.1, -2.9);
  g.add(corpo, cabine);
  // Faixas do time dos dois lados do casco.
  for (const lado of [-1, 1]) {
    const faixa = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.25, 4.2), neonTime);
    faixa.position.set(lado * 1.22, 0.1, 0);
    g.add(faixa);
  }

  const motores = [];
  for (const lado of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 2.2, 6), escuro);
    m.rotation.x = -Math.PI / 2;
    m.position.set(lado * 1.6, -0.2, 1.4);
    const chama = spriteBrilho(corTime.clone().lerp(new THREE.Color('#ffffff'), 0.3), 1.6);
    chama.material.opacity = 0.7;
    chama.position.set(lado * 1.6, -0.2, 2.7);
    motores.push(chama);
    g.add(m, chama);
  }

  // Moldura do contêiner (sempre) e o minério dentro (só cheio).
  for (const [x, z] of [[-0.95, -1.1], [0.95, -1.1], [-0.95, 1.5], [0.95, 1.5]]) {
    const coluna = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.3, 0.18), escuro);
    coluna.position.set(x, 1.25, z);
    g.add(coluna);
  }
  const tampa = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.15, 2.8), escuro);
  tampa.position.set(0, 1.95, 0.2);
  g.add(tampa);
  // Minério: cristais azul-gelo (como os do depósito) sobre um bloco azul mais
  // fundo; brilho moderado, senão o ACES puxa o azul-gelo para o branco.
  const azul = new THREE.MeshStandardMaterial({ color: '#9fe8ff', emissive: '#9fe8ff', emissiveIntensity: 0.6, roughness: 0.3, flatShading: true });
  const azulFundo = new THREE.MeshStandardMaterial({ color: '#2f7fb8', emissive: '#4fb8ff', emissiveIntensity: 0.5, roughness: 0.4, flatShading: true });
  const carga = new THREE.Group();
  const bloco = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1, 2.4), azulFundo);
  bloco.position.set(0, 1.1, 0.2);
  carga.add(bloco);
  for (const [x, z, k] of [[-0.5, -0.4, 0.5], [0.45, 0.6, 0.6], [0, 1.1, 0.4]]) {
    const cristal = new THREE.Mesh(new THREE.OctahedronGeometry(k, 0), azul);
    cristal.scale.y = 1.8;
    cristal.position.set(x, 1.6 + k * 0.6, z);
    carga.add(cristal);
  }
  carga.visible = false;
  g.add(carga);

  g.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });

  // Feixe de mineração: cone aditivo do casco até o chão (a nave paira a 10 m).
  const feixe = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 1.6, 9, 8, 1, true),
    new THREE.MeshBasicMaterial({ color: '#9fe8ff', transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  );
  feixe.position.y = -5.1;
  feixe.visible = false;
  g.add(feixe);

  const raiz = new THREE.Group();
  raiz.add(g);
  raiz.userData = { corpo: g, motores, carga, feixe };
  return raiz;
}

/** Anima o minerador: contêiner cheio ou vazio, feixe pulsando enquanto minera, motores. */
export function animarMinerador(m, { carga, minerando }, t, fase = 0) {
  const { carga: grupo, feixe, motores } = m.userData;
  grupo.visible = carga > 0;
  feixe.visible = !!minerando;
  if (minerando) {
    feixe.material.opacity = 0.25 + 0.2 * (Math.sin(t * 8 + fase) + 1) / 2;
    feixe.rotation.y = t * 2;
  }
  const base = minerando ? 0.8 : 1.6;
  for (const [i, s] of motores.entries()) s.scale.setScalar(base + Math.sin(t * 40 + i * 2 + fase) * 0.2);
}

/** Drone inimigo Arnosh. */
export function criarDrone() {
  const g = new THREE.Group();
  const pele = new THREE.MeshStandardMaterial({ color: '#4a1414', roughness: 0.6, metalness: 0.2, flatShading: true });
  const espinho = new THREE.MeshStandardMaterial({ color: '#8c2a1f', roughness: 0.5, flatShading: true });
  const corpo = new THREE.Mesh(new THREE.IcosahedronGeometry(2.6, 0), pele);
  corpo.scale.set(1, 0.7, 1.4);
  g.add(corpo);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const e = new THREE.Mesh(new THREE.ConeGeometry(0.45, 3.6, 5), espinho);
    e.position.set(Math.cos(a) * 2.6, 0, Math.sin(a) * 2.6 * 1.2);
    e.rotation.z = -Math.PI / 2;
    e.rotation.y = -a;
    g.add(e);
  }
  const olho = new THREE.Mesh(
    new THREE.SphereGeometry(0.8, 10, 8),
    new THREE.MeshStandardMaterial({ color: '#300', emissive: '#ff2a1a', emissiveIntensity: 3 }),
  );
  olho.position.set(0, 0.3, -3.3);
  const brilhoOlho = spriteBrilho(new THREE.Color('#ff3a1a'), 4);
  brilhoOlho.position.copy(olho.position);
  g.add(olho, brilhoOlho);
  g.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  const raiz = new THREE.Group();
  raiz.add(g);
  raiz.userData = { corpo: g, motores: [] };
  return raiz;
}

/**
 * Monstro caçador Vorax: corpo comprido em três gomos (cabeça, tórax, cauda com
 * ferrão), espinhos nas costas e duas garras em foice na frente, que abrem e
 * fecham. Mesma pele escura do Arnosh, mas a silhueta é de bicho que corre atrás
 * de você (comprida, de garras para a frente), não o disco espinhento que patrulha.
 * Um olho só, vermelho, na cabeça. Uns 10 m de comprimento, do tamanho da nave.
 */
export function criarVorax() {
  const g = new THREE.Group();
  const pele = new THREE.MeshStandardMaterial({ color: '#4a1414', roughness: 0.7, metalness: 0.1, flatShading: true });
  const carapaca = new THREE.MeshStandardMaterial({ color: '#8c2a1f', roughness: 0.55, metalness: 0.2, flatShading: true });

  // Gomos do corpo, da cabeça (-z) para a cauda (+z). Cada um num grupo próprio
  // para a animação ondular o corpo.
  const gomos = [];
  const medidas = [
    { r: 1.8, z: -3, esc: [1, 0.8, 1.2] },
    { r: 2.3, z: 0, esc: [1.1, 0.75, 1.3] },
    { r: 1.6, z: 3.2, esc: [0.9, 0.7, 1.4] },
  ];
  for (const [k, m] of medidas.entries()) {
    const gomo = new THREE.Group();
    gomo.position.z = m.z;
    const corpo = new THREE.Mesh(new THREE.DodecahedronGeometry(m.r, 0), k === 1 ? carapaca : pele);
    corpo.scale.set(...m.esc);
    gomo.add(corpo);
    // Espinhos nas costas, inclinados para trás.
    for (const lado of k === 1 ? [-0.7, 0, 0.7] : [0]) {
      const e = new THREE.Mesh(new THREE.ConeGeometry(0.35, 2.2 - Math.abs(lado), 5), carapaca);
      e.position.set(lado, m.r * 0.75, 0.2);
      e.rotation.x = 0.6;
      gomo.add(e);
    }
    gomos.push(gomo);
    g.add(gomo);
  }
  // Ferrão na ponta da cauda.
  const ferrao = new THREE.Mesh(new THREE.ConeGeometry(0.5, 3, 5), carapaca);
  ferrao.position.set(0, 0.6, 2.4);
  ferrao.rotation.x = Math.PI / 2 + 0.5;
  gomos[2].add(ferrao);

  // Garras: braço curto + lâmina em foice, presas em pivôs dos lados da cabeça.
  const garras = [];
  for (const lado of [-1, 1]) {
    // Pivô ao lado da cabeça (coordenadas do gomo da cabeça); girar nele em y
    // abre e fecha a garra.
    const pivo = new THREE.Group();
    pivo.position.set(lado * 1.6, -0.3, -0.2);
    const braco = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 2.6, 5), pele);
    braco.rotation.x = Math.PI / 2;
    braco.position.z = -1.2;
    // Lâmina no fim do braço, apontando para a frente e curvada para dentro.
    const cotovelo = new THREE.Group();
    cotovelo.position.z = -2.4;
    cotovelo.rotation.y = lado * 0.7;
    const lamina = new THREE.Mesh(new THREE.ConeGeometry(0.45, 3.4, 4), carapaca);
    lamina.rotation.x = -Math.PI / 2;
    lamina.position.z = -1.6;
    cotovelo.add(lamina);
    pivo.add(braco, cotovelo);
    gomos[0].add(pivo);
    garras.push({ pivo, lado });
  }

  // Olho vermelho emissivo (neon: cor = emissive, intensidade no teto do guia).
  const olho = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.55, 0),
    new THREE.MeshStandardMaterial({ color: '#ff2a1a', emissive: '#ff2a1a', emissiveIntensity: 1.2, flatShading: true }),
  );
  olho.position.set(0, 0.7, -1.55);
  const brilhoOlho = spriteBrilho(new THREE.Color('#ff3a1a'), 3.5);
  brilhoOlho.position.copy(olho.position);
  gomos[0].add(olho, brilhoOlho);

  g.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  const raiz = new THREE.Group();
  raiz.add(g);
  raiz.userData = { corpo: g, motores: [], gomos, garras };
  return raiz;
}

/** Anima o Vorax: corpo ondulando, garras abrindo e fechando. fase separa um do outro. */
export function animarVorax(vorax, t, fase = 0) {
  const { gomos, garras } = vorax.userData;
  for (const [k, gomo] of gomos.entries()) {
    gomo.rotation.y = Math.sin(t * 4 + fase - k * 0.9) * 0.18;
    gomo.position.y = Math.sin(t * 4 + fase - k * 0.9) * 0.25;
  }
  const abre = (Math.sin(t * 6 + fase) + 1) / 2; // 0 fechada, 1 aberta
  for (const { pivo, lado } of garras) pivo.rotation.y = lado * (0.1 + abre * 0.6);
}

/** Atualiza motores (maiores com boost, quase apagados pousada) e o trem de pouso. */
export function atualizarMotor(nave, boost, t, pousado = false) {
  if (nave.userData.trem) nave.userData.trem.visible = pousado;
  const base = pousado ? 0.9 : boost ? 4.2 : 2.4;
  for (const [i, m] of nave.userData.motores.entries()) {
    m.scale.setScalar(base + Math.sin(t * 40 + i * 2) * 0.35);
  }
}

/**
 * Krakor, o elite do mundo aberto: besta pesada e lenta, bem maior que a nave
 * (uns 17 m), com uma carapaça grossa em cúpula, chifre comprido para a frente,
 * placas espinhentas no lombo e seis patas curtas penduradas (ela flutua como os
 * outros). Mesma pele escura e um olho vermelho só, embaixo do chifre. A
 * silhueta é de "tanque" (larga e alta), para não confundir com o Vorax comprido
 * nem com o disco do Arnosh.
 */
export function criarKrakor() {
  const g = new THREE.Group();
  const pele = new THREE.MeshStandardMaterial({ color: '#4a1414', roughness: 0.75, metalness: 0.1, flatShading: true });
  const carapaca = new THREE.MeshStandardMaterial({ color: '#8c2a1f', roughness: 0.55, metalness: 0.2, flatShading: true });

  const barriga = new THREE.Mesh(new THREE.DodecahedronGeometry(4.2, 0), pele);
  barriga.scale.set(1.15, 0.7, 1.6);
  const casco = new THREE.Mesh(new THREE.IcosahedronGeometry(4.6, 0), carapaca);
  casco.scale.set(1.2, 0.75, 1.55);
  casco.position.y = 1.4;
  const cabeca = new THREE.Mesh(new THREE.DodecahedronGeometry(2.4, 0), pele);
  cabeca.scale.set(1.1, 0.8, 1.1);
  cabeca.position.set(0, 0.4, -6.2);
  const chifre = new THREE.Mesh(new THREE.ConeGeometry(0.9, 5.5, 5), carapaca);
  chifre.rotation.x = -Math.PI / 2 - 0.35;
  chifre.position.set(0, 2, -8.6);
  g.add(barriga, casco, cabeca, chifre);
  // Placas espinhentas no lombo, em duas fileiras.
  for (let k = 0; k < 4; k++) {
    for (const lado of [-1, 1]) {
      const placa = new THREE.Mesh(new THREE.ConeGeometry(0.8, 3 - k * 0.3, 4), carapaca);
      placa.position.set(lado * 1.6, 4.4 - k * 0.2, -2.4 + k * 2.2);
      placa.rotation.set(0.5, 0, lado * -0.35);
      g.add(placa);
    }
  }
  // Patas: três de cada lado, presas em pivôs para a animação balançar.
  const patas = [];
  for (let k = 0; k < 3; k++) {
    for (const lado of [-1, 1]) {
      const pivo = new THREE.Group();
      pivo.position.set(lado * 3.6, -1.6, -3 + k * 3);
      const pata = new THREE.Mesh(new THREE.ConeGeometry(0.6, 3.6, 4), pele);
      pata.rotation.z = Math.PI + lado * 0.35;
      pata.position.set(lado * 0.6, -1.6, 0);
      pivo.add(pata);
      g.add(pivo);
      patas.push({ pivo, fase: k * 2.1 + (lado > 0 ? Math.PI : 0) });
    }
  }
  const olho = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.75, 0),
    new THREE.MeshStandardMaterial({ color: '#ff2a1a', emissive: '#ff2a1a', emissiveIntensity: 1.2, flatShading: true }),
  );
  olho.position.set(0, 0.6, -8.3);
  const brilhoOlho = spriteBrilho(new THREE.Color('#ff3a1a'), 5);
  brilhoOlho.position.copy(olho.position);
  g.add(olho, brilhoOlho);

  g.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  const raiz = new THREE.Group();
  raiz.add(g);
  raiz.userData = { corpo: g, motores: [], patas };
  return raiz;
}

/** Anima o Krakor: patas balançando devagar e o corpo arfando. */
export function animarKrakor(k, t, fase = 0) {
  const { corpo, patas } = k.userData;
  corpo.position.y = Math.sin(t * 1.6 + fase) * 0.4;
  for (const p of patas) p.pivo.rotation.x = Math.sin(t * 2.4 + fase + p.fase) * 0.35;
}

/**
 * Guardião da arena (objetivo C): colosso flutuante, de pé, bem maior que o
 * Krakor. Núcleo escuro facetado, coroa de chifres grandes em volta do alto,
 * três lascas de carapaça girando em volta do corpo e um olho vermelho enorme na
 * frente. É a única silhueta "vertical" entre os inimigos: dá para reconhecer de
 * longe que aquilo é o chefe da arena.
 */
export function criarGuardiao() {
  const g = new THREE.Group();
  const pele = new THREE.MeshStandardMaterial({ color: '#4a1414', roughness: 0.7, metalness: 0.15, flatShading: true });
  const carapaca = new THREE.MeshStandardMaterial({ color: '#8c2a1f', roughness: 0.5, metalness: 0.25, flatShading: true });

  const nucleo = new THREE.Mesh(new THREE.IcosahedronGeometry(5, 0), pele);
  nucleo.scale.set(1, 1.35, 1);
  nucleo.position.y = 3;
  const base = new THREE.Mesh(new THREE.ConeGeometry(3.4, 6, 6), carapaca);
  base.rotation.x = Math.PI;
  base.position.y = -3.5;
  g.add(nucleo, base);
  // Coroa: chifres grandes em volta do alto, abertos para fora.
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2;
    const chifre = new THREE.Mesh(new THREE.ConeGeometry(0.9, 6 + (k % 2) * 2, 4), carapaca);
    chifre.position.set(Math.cos(a) * 3.4, 9, Math.sin(a) * 3.4);
    chifre.rotation.set(Math.sin(a) * 0.55, 0, -Math.cos(a) * 0.55);
    g.add(chifre);
  }
  // Lascas girando em volta.
  const orbita = new THREE.Group();
  orbita.position.y = 2;
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    const lasca = new THREE.Mesh(new THREE.OctahedronGeometry(2, 0), carapaca);
    lasca.scale.set(0.6, 1.6, 1);
    lasca.position.set(Math.cos(a) * 9, 0, Math.sin(a) * 9);
    lasca.rotation.y = -a;
    orbita.add(lasca);
  }
  g.add(orbita);
  const olho = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.5, 0),
    new THREE.MeshStandardMaterial({ color: '#ff2a1a', emissive: '#ff2a1a', emissiveIntensity: 1.2, flatShading: true }),
  );
  olho.position.set(0, 4, -4.6);
  const brilhoOlho = spriteBrilho(new THREE.Color('#ff3a1a'), 9);
  brilhoOlho.position.copy(olho.position);
  g.add(olho, brilhoOlho);

  g.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  const raiz = new THREE.Group();
  raiz.add(g);
  raiz.userData = { corpo: g, motores: [], orbita };
  return raiz;
}

/** Anima o guardião: lascas girando e o corpo subindo e descendo devagar. */
export function animarGuardiao(gd, t) {
  gd.userData.orbita.rotation.y = t * 0.8;
  gd.userData.corpo.position.y = Math.sin(t * 1.1) * 0.6;
}
