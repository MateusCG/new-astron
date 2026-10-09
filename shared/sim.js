// Física da nave e dos tiros, compartilhada entre servidor e cliente.
//
// O servidor é a autoridade: recebe só os comandos (acelerar, girar, atirar) e roda
// stepShip() para todo mundo. O cliente roda a MESMA função com os próprios comandos
// para a nave responder na hora (predição) e, quando chega o estado do servidor,
// volta para ele e reaplica os comandos ainda não confirmados. Por isso tudo aqui é
// determinístico, em passo fixo (DT) e sem relógio nem aleatoriedade.
//
// Como no AstroN, a nave voa baixo, acompanhando o terreno (HOVER metros acima do
// chão): o movimento é num plano e o terreno decide a altura. Parede de cânion é
// qualquer subida mais íngreme que MAX_SLOPE; nela a nave desliza em vez de escalar.
//
// Pouso (tecla L): também como no AstroN, a nave pode descer até o chão, mas só
// dentro de uma área de pouso (AREAS_POUSO em terrain.js). Pousada ela
// não atira nem dá boost, gira devagar e se recupera mais rápido (energia aqui, vida
// no servidor). Só o L decola de novo; acelerar pousada não faz nada. A nave freia
// antes de tocar o chão: só desce de vez abaixo de VEL_TOQUE.

import { heightAt, podePousar, topoPouso } from './terrain.js';

export const DT = 1 / 30;
export const HOVER = 10;
export const ALTURA_POUSADO = 1.4; // trem de pouso
export const VEL_TOQUE = 6; // m/s: acima disso a nave ainda está freando para pousar
export const POUSO_GIRO = 0.4; // fração do giro normal com a nave no chão
export const POUSO_REGEN_MULT = 2.5; // energia recupera mais rápido pousada
export const MAX_SLOPE = 0.75;
export const TURN_RATE = 2.3;
// Inclinação na curva, em radianos: positiva abaixa a asa esquerda (rotation.z do
// Three.js visto de trás). A nave inclina para dentro da curva, como um avião:
// A (esquerda) abaixa a asa esquerda, D (direita) abaixa a direita.
export const INCLINACAO_CURVA = 0.55;
export const SHIP_RADIUS = 4.5;

/**
 * Raças e status iniciais (slide "Status Inicial" do documento de design).
 * velocidade vira m/s pelo fator VEL_FATOR.
 */
export const RACES = {
  acron: { nome: 'Acron', velocidade: 100, hp: 180, energia: 80, cor: 0x3fa9ff, bioma: 'Aquático' },
  bellico: { nome: 'Bellico', velocidade: 90, hp: 300, energia: 40, cor: 0xff5a3c, bioma: 'Deserto' },
  shrewdo: { nome: 'Shrewdo', velocidade: 120, hp: 150, energia: 45, cor: 0x34e08a, bioma: 'Terreno' },
  mechan: { nome: 'Mechan', velocidade: 95, hp: 250, energia: 60, cor: 0xb15cff, bioma: 'Tóxico' },
};
export const VEL_FATOR = 0.55;
export const BOOST_MULT = 1.6;
export const BOOST_GASTO = 14; // energia por segundo
export const ENERGIA_REGEN = 9; // por segundo, sem boost

/** Armas: Z = laser rápido e barato, X = plasma lento e pesado. */
export const WEAPONS = {
  laser: { dano: 12, vel: 340, cd: 0.16, energia: 2, vida: 1.3, raio: 5 },
  plasma: { dano: 42, vel: 190, cd: 0.9, energia: 14, vida: 2.2, raio: 6.5 },
};

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

/** Vetor "para frente" de um yaw (convenção do Three.js: yaw 0 olha para -z). */
export function forward(yaw) {
  return { x: -Math.sin(yaw), z: -Math.cos(yaw) };
}

/** Estado novo de uma nave da raça dada, parada no ponto (x, z). */
export function createShip(race, x, z, yaw = 0) {
  const r = RACES[race] ?? RACES.shrewdo;
  return {
    race: RACES[race] ? race : 'shrewdo',
    x,
    z,
    y: heightAt(x, z) + HOVER,
    yaw,
    vx: 0,
    vz: 0,
    roll: 0,
    hp: r.hp,
    maxHp: r.hp,
    en: r.energia,
    maxEn: r.energia,
    cd1: 0,
    cd2: 0,
    boost: false,
    boostTravado: false,
    pousado: false,
    pAnt: false,
  };
}

/** Comando vazio (nave solta). */
export const INPUT_VAZIO = { th: 0, tu: 0, b: false, f1: false, f2: false, p: false };

/** Normaliza um comando vindo da rede: nunca confie no cliente. */
export function sanitizeInput(i) {
  return {
    th: clamp(Number(i?.th) || 0, -1, 1),
    tu: clamp(Number(i?.tu) || 0, -1, 1),
    b: !!i?.b,
    f1: !!i?.f1,
    f2: !!i?.f2,
    p: !!i?.p,
  };
}

function bloqueado(gAtual, x, z, passo) {
  if (passo < 1e-6) return false;
  return (heightAt(x, z) - gAtual) / passo > MAX_SLOPE;
}

/**
 * Avança a nave um passo DT com o comando dado. Retorna a lista de armas que
 * dispararam neste passo ('laser' | 'plasma'), para quem chamou criar os tiros.
 */
export function stepShip(s, inp, dt = DT) {
  const raca = RACES[s.race];
  // Pouso alterna na borda do botão (apertou agora), para segurar L não ficar
  // pousando e decolando sem parar.
  if (inp.p && !s.pAnt) s.pousado = s.pousado ? false : podePousar(s.x, s.z);
  s.pAnt = !!inp.p;
  // Se ainda freando ela escorregar para fora da área, o pouso é cancelado.
  if (s.pousado && !podePousar(s.x, s.z)) s.pousado = false;
  const pousado = s.pousado;
  // Energia zerada no boost trava o boost até soltar o botão; sem isso ele piscaria
  // liga/desliga a cada passo com a energia que regenera.
  if (!inp.b) s.boostTravado = false;
  const querBoost = !pousado && inp.b && inp.th > 0 && s.en > 0 && !s.boostTravado;
  s.boost = querBoost;
  const maxV = raca.velocidade * VEL_FATOR * (querBoost ? BOOST_MULT : 1);

  s.yaw += inp.tu * TURN_RATE * (pousado ? POUSO_GIRO : 1) * dt;
  s.roll += ((pousado ? 0 : inp.tu * INCLINACAO_CURVA) - s.roll) * Math.min(1, 6 * dt);

  const f = forward(s.yaw);
  const r = { x: -f.z, z: f.x };
  let vf = s.vx * f.x + s.vz * f.z;
  let vl = s.vx * r.x + s.vz * r.z;
  const alvo = pousado ? 0 : inp.th >= 0 ? inp.th * maxV : inp.th * maxV * 0.4;
  vf += (alvo - vf) * Math.min(1, (pousado ? 3 : querBoost ? 3.2 : 2.2) * dt);
  vl *= Math.exp(-5 * dt); // a nave não derrapa muito de lado
  s.vx = f.x * vf + r.x * vl;
  s.vz = f.z * vf + r.z * vl;

  // Colisão com parede: tenta o movimento inteiro, depois cada eixo (deslizar).
  const g = heightAt(s.x, s.z);
  const dx = s.vx * dt;
  const dz = s.vz * dt;
  if (!bloqueado(g, s.x + dx, s.z + dz, Math.hypot(dx, dz))) {
    s.x += dx;
    s.z += dz;
  } else if (!bloqueado(g, s.x + dx, s.z, Math.abs(dx))) {
    s.x += dx;
    s.vz *= -0.2;
  } else if (!bloqueado(g, s.x, s.z + dz, Math.abs(dz))) {
    s.z += dz;
    s.vx *= -0.2;
  } else {
    s.vx *= -0.3;
    s.vz *= -0.3;
  }

  // Altura: sobe rápido (não entra no chão), desce mais devagar (sensação de peso);
  // no pouso, desce devagar só depois de frear.
  const chao = heightAt(s.x, s.z);
  const piso = Math.max(chao, topoPouso(s.x, s.z) ?? chao); // em cima da plataforma, se houver
  const tocando = pousado && Math.hypot(s.vx, s.vz) < VEL_TOQUE;
  const alvoY = tocando ? piso + ALTURA_POUSADO : chao + HOVER;
  const taxa = alvoY > s.y ? 30 : tocando ? 7 : 14;
  s.y += clamp(alvoY - s.y, -taxa * dt, taxa * dt);
  if (s.y < piso + ALTURA_POUSADO) s.y = piso + ALTURA_POUSADO;

  if (querBoost) {
    s.en = Math.max(0, s.en - BOOST_GASTO * dt);
    if (s.en === 0) s.boostTravado = true;
  }
  else s.en = Math.min(s.maxEn, s.en + ENERGIA_REGEN * (pousado ? POUSO_REGEN_MULT : 1) * dt);

  s.cd1 = Math.max(0, s.cd1 - dt);
  s.cd2 = Math.max(0, s.cd2 - dt);
  const disparos = [];
  if (pousado) return disparos;
  if (inp.f1 && s.cd1 <= 0 && s.en >= WEAPONS.laser.energia) {
    s.cd1 = WEAPONS.laser.cd;
    s.en -= WEAPONS.laser.energia;
    disparos.push('laser');
  }
  if (inp.f2 && s.cd2 <= 0 && s.en >= WEAPONS.plasma.energia) {
    s.cd2 = WEAPONS.plasma.cd;
    s.en -= WEAPONS.plasma.energia;
    disparos.push('plasma');
  }
  return disparos;
}

/** Cria um tiro saindo do nariz da nave. */
export function createBullet(s, kind, id, owner) {
  const w = WEAPONS[kind];
  const f = forward(s.yaw);
  return {
    id,
    owner,
    kind,
    x: s.x + f.x * 6,
    y: s.y,
    z: s.z + f.z * 6,
    vx: f.x * w.vel + s.vx * 0.5,
    vy: 0,
    vz: f.z * w.vel + s.vz * 0.5,
    vida: w.vida,
  };
}

/** Avança um tiro. Retorna false quando ele acabou (tempo ou bateu no chão). */
export function stepBullet(b, dt = DT) {
  b.px = b.x;
  b.pz = b.z;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.z += b.vz * dt;
  b.vida -= dt;
  return b.vida > 0 && b.y > heightAt(b.x, b.z);
}

/**
 * O tiro passou pela nave neste passo? Teste de segmento contra cilindro vertical,
 * para tiro rápido não atravessar nave sem acertar entre um passo e outro.
 */
export function bulletHits(b, s) {
  const raio = WEAPONS[b.kind].raio + SHIP_RADIUS;
  if (Math.abs(b.y - s.y) > 7) return false;
  const ax = b.px ?? b.x;
  const az = b.pz ?? b.z;
  const sx = b.x - ax;
  const sz = b.z - az;
  const len2 = sx * sx + sz * sz;
  let t = len2 > 0 ? ((s.x - ax) * sx + (s.z - az) * sz) / len2 : 0;
  t = clamp(t, 0, 1);
  const cx = ax + sx * t - s.x;
  const cz = az + sz * t - s.z;
  return cx * cx + cz * cz <= raio * raio;
}
