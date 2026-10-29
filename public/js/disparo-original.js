// Disparo das armas desenhadas como no AstroN original (as de início e as revistas
// depois; a lista em disparo-regras.js), do clarão ao fim: os efeitos do original (.eff
// + .3dx convertidos em public/modelos/efeitos/, tocados por efeitos-original.js) no
// lugar, no rumo e na escala em que o original os põe. As regras e a evidência (o
// código do original que cada passo segue) estão em disparo-regras.js; aqui só o desenho.
//
// - Clarão (clarao): na boca da arma pendurada na asa (nó `fire`, bocaDaArma), preso a
//   ela enquanto toca (o efeito anda com a nave), no rumo da nave sem a inclinação da
//   curva, girado ao acaso em volta do cano nas armas de modo 14. Um por projétil, como
//   no original: os três do Feixe Rifle Triplo se somam, cada um num giro. No modo 2 (o
//   Rebatedor de Projéteis), parado onde a nave estava, de pé, esticado até a área.
// - Projétil (tiro): o efeito do projétil da versão, repetindo, no rumo do tiro; nasce
//   na boca, com os projéteis paralelos espalhados em volta dela, e escorrega até a
//   linha do tiro de verdade (o desvio de efeitos.js). O que acelera (a carga do Canhão
//   de Faíscas) anda pela curva do original na linha do tiro (posicionar).
// - Impacto (impacto, impactoLocal): no casco do alvo, virado como o alvo; o seu tiro
//   desenha na hora em que encosta no alvo na tela, e o acerto do servidor que chega
//   depois não desenha de novo. O feixe que atravessa deixa um em cada alvo e segue.
//   Tiro que bate no chão, numa construção ou no campo de força (bateu, fim): o
//   impacto onde parou, no rumo do tiro, e o som de impacto.
// - Fim (area): o efeito de fim deitado no ponto, esticado até a área (Metralha Shrewdo).
// - Nova (nova): a esfera que cresce do Canhão de Faíscas, deitada onde a carga acabou,
//   esticada até o raio da nova; os impactos dos alvos que ela pega saem do lado dela.
// - Tiro que acaba a vida no ar some sem nada, como no original.
//
// Efeito que não carregou (não deveria: a tela de carregamento baixa todos) devolve
// false e quem chama desenha como antes (efeitos-armas.js). Desempenho: as instâncias
// saem da reserva de cada efeito (efeitos-original.js) e voltam no fim; nada de material
// novo depois que a reserva enche, nada liberado no meio da partida.

import * as THREE from 'three';
import { golpeDaArma } from '/shared/armas.js';
import { bocaDaArma } from './nave.js';
import { criarEfeitoOriginal, efeitoOriginalPronto, soltarEfeitoOriginal, tocarEfeitoOriginal } from './efeitos-original.js';
import { disparoOriginal, ESCALA_DISPARO, giroDoClarao, inicioDoTiro, pontoDoImpacto, acabouAntes, escalaDaArea, recuoDaCarga } from './disparo-regras.js';

// O seu impacto desenhado na hora vale pelo acerto do servidor que chegar até este
// tempo depois (s); a explosão de área vale como origem dos impactos que ela causa
// (o rumo no casco) até este tempo (s); a nova, enquanto cresce.
const IMPACTO_LOCAL_S = 0.8;
const EXPLOSAO_ORIGEM_S = 0.2;
const EIXO_Y = new THREE.Vector3(0, 1, 0);
const EIXO_Z = new THREE.Vector3(0, 0, 1);
const MEIA_VOLTA = new THREE.Quaternion().setFromAxisAngle(EIXO_Y, Math.PI);

export class DisparoOriginal {
  /** `efeitos`: o Efeitos de efeitos.js (cena, câmera, a lista de tiros e a dos efeitos que tocam uma vez). */
  constructor(efeitos) {
    this.ef = efeitos;
    this.presos = []; // clarões presos na boca: { inst, nave, enc, giro }
    this.locais = []; // seus impactos já desenhados: { alvo, kind, t }
    this.explosoes = []; // áreas e novas recentes (origem dos impactos): { kind, x, y, z, t, ate }
    this.tempo = 0;
    this.q = new THREE.Quaternion();
    this.v = new THREE.Vector3();
    this.boca = new THREE.Vector3();
  }

  /** O efeito `campo` ('d', 'p', 'i', 'f') da arma `kind` na versão `nv` (golpe `prof`), se está pronto (senão null). */
  #id(kind, nv, campo, prof = 0) {
    if (!disparoOriginal(kind)) return null;
    const id = golpeDaArma(kind, nv ?? 1, prof)?.vis?.[campo];
    return id && efeitoOriginalPronto(id) ? id : null;
  }

  /** O impacto da arma: o do projétil ou, sem ele, o do subprojétil (a nova do Canhão de Faíscas). */
  #idImpacto(kind, nv) {
    return this.#id(kind, nv, 'i', 0) ?? this.#id(kind, nv, 'i', 1);
  }

  /** A arma `kind` (versão `nv`) dispara como no original (um clarão por projétil)? */
  usa(kind, nv) {
    return !!this.#id(kind, nv, 'p');
  }

  /** Efeito que toca uma vez na cena (impacto, fim): entra na lista de efeitos.js, que toca e devolve. `ate` (s): o último quadro fica até lá. */
  #umaVez(id, escala, x, y, z, quat = null, ate = 0) {
    const inst = criarEfeitoOriginal(id, { escala });
    inst.obj.position.set(x, y, z);
    if (quat) inst.obj.quaternion.copy(quat);
    this.ef.scene.add(inst.obj);
    this.ef.originais.push({ inst, ate });
    return inst;
  }

  /** Lembra o centro de uma área ou nova, de onde vêm os impactos que ela causa (até `dur` s). */
  #origem(kind, x, y, z, dur) {
    this.explosoes.push({ kind, x, y, z, t: this.tempo, ate: this.tempo + dur });
    if (this.explosoes.length > 16) this.explosoes.shift();
  }

  /**
   * Clarão na boca da arma do encaixe `enc` (0 = Z, 1 = X) da nave `nave`, preso a ela
   * enquanto toca. No modo 'area' (o Rebatedor), parado onde a nave está, de pé,
   * esticado até a área da versão. false: a arma não é desenhada como no original, o
   * efeito não carregou ou a arma ainda não está pendurada (quem chama desenha o
   * clarão de antes).
   */
  clarao(kind, nv, nave, enc) {
    const id = this.#id(kind, nv, 'd');
    if (!id || !nave) return false;
    const modo = disparoOriginal(kind).clarao;
    if (modo === 'area') {
      const area = golpeDaArma(kind, nv ?? 1, 0)?.area ?? 0;
      this.#umaVez(id, escalaDaArea(area), nave.position.x, nave.position.y, nave.position.z);
      return true;
    }
    if (!bocaDaArma(nave, enc, this.boca)) return false;
    const inst = criarEfeitoOriginal(id, { escala: ESCALA_DISPARO });
    const preso = { inst, nave, enc, giro: giroDoClarao(modo, Math.random()) };
    this.#naBoca(preso);
    this.ef.scene.add(inst.obj);
    this.presos.push(preso);
    return true;
  }

  /** Põe o clarão na boca da arma, no rumo da nave (sem a inclinação da curva), girado em volta do cano. */
  #naBoca({ inst, nave, enc, giro }) {
    if (!nave.parent || !bocaDaArma(nave, enc, this.boca)) return; // a nave saiu de cena: fica onde estava
    inst.obj.position.copy(this.boca);
    // O efeito olha para +z; o nariz da nave, para -z do grupo de fora (que só gira no rumo).
    inst.obj.quaternion.setFromAxisAngle(EIXO_Y, nave.rotation.y).multiply(MEIA_VOLTA);
    if (giro) inst.obj.quaternion.multiply(this.q.setFromAxisAngle(EIXO_Z, giro));
  }

  /**
   * Onde o desenho do tiro `b` nasce (para o desvio de efeitos.js): a boca `boca` da
   * arma com o projétil deslocado de lado como em volta da nave que atirou (`nave`:
   * { x, z, yaw }, de onde ele saiu). Arma que não é desenhada como no original: a
   * própria boca (o desenho de antes sai todo da boca). Não mexe em `boca`.
   */
  inicio(b, nave, boca) {
    if (!boca || !nave || !disparoOriginal(b.kind)) return boca;
    const p = inicioDoTiro(b, boca, nave);
    return (this.inicioTiro ??= new THREE.Vector3()).set(p.x, p.y, p.z);
  }

  /**
   * Desenho do projétil, repetindo, na lista de tiros de efeitos.js (que anda com ele,
   * faz o desvio da boca e o tira de cena). false: a arma não é desenhada como no
   * original ou o efeito não carregou.
   */
  tiro(b, boca) {
    const id = this.#id(b.kind, b.nv, 'p');
    if (!id || (b.p ?? 0) !== 0) return false;
    const inst = criarEfeitoOriginal(id, { escala: ESCALA_DISPARO, loop: true });
    inst.obj.position.set(b.x, b.y, b.z);
    inst.obj.lookAt(b.x + b.vx, b.y + b.vy, b.z + b.vz);
    this.ef.scene.add(inst.obj);
    const desvio = boca ? { x: boca.x - b.x, y: boca.y - b.y, z: boca.z - b.z, t: 0 } : null;
    const carga = disparoOriginal(b.kind).carga ? golpeDaArma(b.kind, b.nv ?? 1, 0) : null;
    this.ef.tiros.set(b.id, { b, g: inst.obj, original: inst, comoOriginal: true, carga, rastro: { x: b.x, y: b.y, z: b.z }, desvio });
    return true;
  }

  /**
   * Ajusta o desenho do tiro `t` já posto na posição do tiro: o projétil que acelera
   * (a carga do Canhão de Faíscas) fica para trás na linha dele, onde o original estaria.
   */
  posicionar(t) {
    if (!t.carga) return;
    const recuo = recuoDaCarga(t.carga.vida - t.b.vida, t.carga, disparoOriginal(t.b.kind).carga);
    const v = Math.hypot(t.b.vx, t.b.vy, t.b.vz);
    if (recuo > 0 && v > 0) t.g.position.addScaledVector(this.v.set(t.b.vx, t.b.vy, t.b.vz), -recuo / v);
  }

  /** Rumo do tiro `b` como giro do efeito (o efeito olha para +z). */
  #rumo(b) {
    const v = this.v.set(b.vx, b.vy, b.vz);
    if (v.lengthSq() < 1e-9) return this.q.identity();
    return this.q.setFromUnitVectors(EIXO_Z, v.normalize());
  }

  /** Impacto onde o tiro `b` parou (chão, construção, campo), no rumo dele; avisa o som (efeitos.aoImpacto). */
  #noLugar(b, x = b.x, y = b.y, z = b.z) {
    const id = this.#id(b.kind, b.nv, 'i');
    if (!id) return;
    this.#umaVez(id, ESCALA_DISPARO, x, y, z, this.#rumo(b));
    this.ef.aoImpacto?.(b.kind, x, y, z);
  }

  /** O desenho do tiro `t` acabou antes da vida (bateu no chão, numa construção, no campo): o impacto ali. */
  bateu(t) {
    this.#noLugar(t.b);
  }

  /**
   * O servidor disse que o tiro `t` acabou em (x, y, z) (evento 'fim'): se foi antes da
   * hora (bateu em algo que o desenho ainda não alcançou, ou que o cliente não conhece,
   * como uma torre), o impacto ali; se só acabou a vida, nada.
   */
  fim(t, x, y, z) {
    if (t?.comoOriginal && acabouAntes(t.b, x, z)) this.#noLugar(t.b, x, y, z);
  }

  /**
   * Centro, raio e giro de quem levou o tiro. `alvo`: { id, obj, raio, x, y, z } (obj e
   * raio quando ele está na tela; sem obj, o ponto do evento).
   */
  #alvo(alvo) {
    const obj = alvo.obj?.visible !== false ? alvo.obj : null;
    if (!obj) return { centro: { x: alvo.x, y: alvo.y, z: alvo.z }, raio: 0, quat: null };
    const corpo = obj.userData.corpo ?? obj;
    const centro = corpo.getWorldPosition(new THREE.Vector3());
    const quat = corpo.getWorldQuaternion(new THREE.Quaternion()).multiply(MEIA_VOLTA);
    return { centro, raio: alvo.raio ?? raioDoModelo(obj), quat };
  }

  /** Desenha o impacto da arma `kind` no casco do alvo, vindo de `de` (onde o tiro estava). */
  #noCasco(id, alvo, de) {
    const { centro, raio, quat } = this.#alvo(alvo);
    const p = pontoDoImpacto(centro, raio, de);
    this.#umaVez(id, ESCALA_DISPARO, p.x, p.y, p.z, quat ?? (de?.vx !== undefined ? this.#rumo(de) : null));
  }

  /**
   * Acerto do servidor com a arma `kind` em `alvo` ({ id, obj, raio, x, y, z }).
   * `bala`: o estado do tiro que acertou, ou null (área, nova). `proprio`: foi você quem
   * bateu (o seu impacto pode já ter saído na hora em que o tiro encostou). false: a
   * arma não é desenhada como no original ou o efeito não carregou.
   */
  impacto(kind, alvo, bala, proprio) {
    const id = this.#idImpacto(kind, 1);
    if (!id) return false;
    if (proprio) {
      const i = this.locais.findIndex((l) => l.alvo === alvo.id && l.kind === kind && this.tempo - l.t < IMPACTO_LOCAL_S);
      if (i >= 0) {
        this.locais.splice(i, 1);
        return true;
      }
    }
    // Sem o tiro (o alvo pego pela área ou pela nova): o rumo vem do centro dela.
    const de = bala ?? this.explosoes.findLast((e) => e.kind === kind && this.tempo <= e.ate) ?? null;
    this.#noCasco(id, alvo, de);
    return true;
  }

  /** O seu tiro `t` encostou no alvo `alvo` na tela: o impacto na hora (o acerto do servidor não repete). */
  impactoLocal(t, alvo) {
    const id = this.#id(t.b.kind, t.b.nv, 'i');
    if (!id) return false;
    this.#noCasco(id, alvo, t.b);
    this.locais.push({ alvo: alvo.id, kind: t.b.kind, t: this.tempo });
    if (this.locais.length > 64) this.locais.shift();
    return true;
  }

  /**
   * Explosão de área (evento 'explosao'): o efeito de fim deitado no ponto, esticado
   * até a área (modo 7 do original). false: a arma não tem fim do original (quem chama
   * desenha a área de antes).
   */
  area(kind, nv, x, y, z, raio) {
    if (!disparoOriginal(kind)) return false;
    this.#origem(kind, x, y, z, EXPLOSAO_ORIGEM_S);
    const id = disparoOriginal(kind).fim === 'area' ? this.#id(kind, nv, 'f') : null;
    if (!id) return false;
    this.#umaVez(id, escalaDaArea(raio), x, y, z);
    return true;
  }

  /**
   * Nova (evento 'nova') da arma `kind`, golpe `p`, de raio `raio` em (x, y, z). O
   * Rebatedor (clarão no modo 2, golpe 0): o clarão parado ali, se não é seu (o seu saiu
   * na hora, pela predição). A esfera que cresce do Canhão de Faíscas (golpe 1): deitada
   * ali, esticada até o raio, o último quadro até a vida da nova acabar. false: a arma
   * não é desenhada como no original (quem chama desenha a nova de antes).
   */
  nova(kind, nv, p, x, y, z, raio, proprio) {
    const como = disparoOriginal(kind);
    if (!como) return false;
    if (p === 0 && como.clarao === 'area') {
      const id = this.#id(kind, nv, 'd');
      if (!id) return false;
      if (!proprio) this.#umaVez(id, escalaDaArea(raio), x, y, z);
      return true;
    }
    const g = golpeDaArma(kind, nv ?? 1, p);
    const id = g?.vis?.tipo === 'esfera_que_cresce' ? this.#id(kind, nv, 'p', p) : null;
    if (!id) return false;
    this.#umaVez(id, escalaDaArea(raio), x, y, z, null, g.vida);
    this.#origem(kind, x, y, z, g.vida);
    return true;
  }

  /** Avança os clarões presos na boca (chamar a cada quadro, depois de as naves andarem). */
  atualizar(dt, camera) {
    this.tempo += dt;
    this.presos = this.presos.filter((p) => {
      if (tocarEfeitoOriginal(p.inst, dt, camera)) {
        this.#naBoca(p);
        return true;
      }
      soltarEfeitoOriginal(p.inst);
      return false;
    });
  }

  /** Tira de cena os clarões presos e esquece o resto (aquecimento da placa e saída da partida). */
  esquecer() {
    for (const p of this.presos) soltarEfeitoOriginal(p.inst);
    this.presos = [];
    this.locais = [];
    this.explosoes = [];
  }
}

/**
 * Raio no chão do modelo (m) de quem não traz raio de acerto no snapshot (monstros,
 * mineradores, escoltas): metade do maior lado da caixa, medido uma vez por modelo.
 */
function raioDoModelo(obj) {
  const casco = obj.userData.casco ?? obj;
  if (obj.userData.raioModelo === undefined || obj.userData.raioDe !== casco) {
    const caixa = new THREE.Box3().setFromObject(casco);
    const t = caixa.isEmpty() ? null : caixa.getSize(new THREE.Vector3());
    obj.userData.raioModelo = t ? Math.max(t.x, t.z) / 2 : 0;
    obj.userData.raioDe = casco;
  }
  return obj.userData.raioModelo;
}
