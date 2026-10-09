// Modelos 3D das naves, montados com primitivas (low-poly, sem arquivo de modelo).
//
// A nave olha para -z (convenção do Three.js e de shared/sim.js). Cada raça usa a
// mesma silhueta de caça com a cor da raça nas asas; os drones Arnosh são uma
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

/** Nave de jogador da raça dada. userData.motores guarda os brilhos do motor. */
export function criarNave(race) {
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

/** Atualiza motores (maiores com boost, quase apagados pousada) e o trem de pouso. */
export function atualizarMotor(nave, boost, t, pousado = false) {
  if (nave.userData.trem) nave.userData.trem.visible = pousado;
  const base = pousado ? 0.9 : boost ? 4.2 : 2.4;
  for (const [i, m] of nave.userData.motores.entries()) {
    m.scale.setScalar(base + Math.sin(t * 40 + i * 2) * 0.35);
  }
}
