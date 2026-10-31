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
// - Fim (area): o efeito de fim deitado no ponto, esticado até a área (Metralha Shrewdo,
//   feixes em círculo, Metralha Rotativa, Bombardeiro Frontal, Canhão Descarregador).
// - Nova (nova): a esfera que cresce (a do Canhão de Faíscas e a do Ciclone onde a carga
//   acabou; a Onda de Energia, a Nova de Energia e a Nova Desarmadora onde a nave
//   estava), deitada, esticada até o raio da nova, até a vida dela; os impactos dos alvos
//   que ela pega saem do lado dela.
// - Tiro que acaba a vida no ar some sem nada, como no original; o que explode no fim
//   (explodeNoFim) deixa o impacto ali, como no chão (expirou, fim).
// - Subprojétil (os três clones do Míssil Clone Teleguiado e os teleguiados de cada um):
//   o projétil da profundidade dele e, no modo 0, o clarão parado onde ele nasceu.
// - Armadilha (mina): o efeito dela parado onde caiu, repetindo (idMina), na altura do
//   voo (efeitos.js); os alvos que ela fere levam o impacto do lado dela; a que acaba a
//   vida deixa o impacto no lugar (area, `expirou`).
// - Rastro do míssil (rastro, soltar): a fita do original presa ao nó Tail do míssil
//   (rastro-missil.js).
// - Nova de suporte: o impacto em cada aliado que ela pega (o evento 'apoio' → impacto).
// - Teleporte (teleporte): o efeito do original onde a nave sumiu e onde apareceu.
// - Reparo do escudo (escudoRec): os quanta da raça saindo da nave e a esfera no centro.
// - Arma sem clarão no original (as novas, os dispositivos): nada na boca (semClarao).
//
// Efeito que não carregou (não deveria: a tela de carregamento baixa todos) devolve
// false e quem chama desenha como antes (efeitos-armas.js). Desempenho: as instâncias
// saem da reserva de cada efeito (efeitos-original.js) e voltam no fim; nada de material
// novo depois que a reserva enche, nada liberado no meio da partida.

import * as THREE from 'three';
import { golpeDaArma } from '/shared/armas.js';
import { HOVER } from '/shared/sim.js';
import { heightAt } from '/shared/terrain.js';
import { bocaDaArma } from './nave.js';
import { criarEfeitoOriginal, efeitoOriginalPronto, matrizDaPeca, soltarEfeitoOriginal, tocarEfeitoOriginal } from './efeitos-original.js';
import { criarRastro, seguirRastro, soltarRastro } from './rastro-missil.js';
import {
  disparoOriginal,
  ESCALA_DISPARO,
  ESCUDO_REC,
  giroDoClarao,
  inicioDoTiro,
  pontoDoImpacto,
  acabouAntes,
  escalaDaArea,
  recuoDaCarga,
  explodeNoFim,
  quantumDoEscudo,
  direcaoDoQuantum,
} from './disparo-regras.js';

// O seu impacto desenhado na hora vale pelo acerto do servidor que chegar até este
// tempo depois (s); a explosão de área vale como origem dos impactos que ela causa
// (o rumo no casco) até este tempo (s); a nova, enquanto cresce.
const IMPACTO_LOCAL_S = 0.8;
const EXPLOSAO_ORIGEM_S = 0.2;
// A armadilha vale como origem dos impactos enquanto o snapshot a mostra (renovada a cada um).
const ARMADILHA_ORIGEM_S = 0.5;
// Reparo do escudo: o quadro desenhado do original (a chance de quantum é por quadro),
// os quadros por segundo do efeito e o teto de quanta no ar (a cena toda).
const QUADRO_DESENHO_S = 1 / 30;
const QUADROS_POR_S = 24;
const QUANTA_MAX = 48;
const EIXO_Y = new THREE.Vector3(0, 1, 0);
const EIXO_Z = new THREE.Vector3(0, 0, 1);
const MEIA_VOLTA = new THREE.Quaternion().setFromAxisAngle(EIXO_Y, Math.PI);

export class DisparoOriginal {
  /** `efeitos`: o Efeitos de efeitos.js (cena, câmera, a lista de tiros e a dos efeitos que tocam uma vez). */
  constructor(efeitos) {
    this.ef = efeitos;
    this.presos = []; // clarões presos na boca: { inst, nave, enc, giro }
    this.locais = []; // seus impactos já desenhados: { alvo, kind, t }
    this.explosoes = []; // áreas, novas e armadilhas recentes (origem dos impactos): { kind, x, y, z, t, ate }
    this.quanta = []; // reparo do escudo: { inst, nave, esfera, dir, quadros }
    this.esferas = []; // a esfera do fim de cada quantum: { inst, nave }
    this.tempo = 0;
    this.q = new THREE.Quaternion();
    this.m = new THREE.Matrix4();
    this.v = new THREE.Vector3();
    this.boca = new THREE.Vector3();
  }

  /** O efeito `campo` ('d', 'p', 'i', 'f') da arma `kind` na versão `nv` (golpe `prof`), se está pronto (senão null). */
  #id(kind, nv, campo, prof = 0) {
    if (!disparoOriginal(kind)) return null;
    const id = golpeDaArma(kind, nv ?? 1, prof)?.vis?.[campo];
    return id && efeitoOriginalPronto(id) ? id : null;
  }

  /**
   * O impacto do golpe `p` da arma ou, sem `p` (acerto sem a profundidade), o do
   * projétil e, sem ele, o dos subprojéteis (a nova do Canhão de Faíscas).
   */
  #idImpacto(kind, nv, p) {
    if (p !== undefined && p !== null) return this.#id(kind, nv, 'i', p);
    return this.#id(kind, nv, 'i', 0) ?? this.#id(kind, nv, 'i', 1) ?? this.#id(kind, nv, 'i', 2);
  }

  /** A arma `kind` (versão `nv`) dispara como no original (um clarão por projétil)? */
  usa(kind, nv) {
    return !!this.#id(kind, nv, 'p');
  }

  /**
   * Efeito que toca uma vez na cena (impacto, fim): entra na lista de efeitos.js, que
   * toca e devolve. `ate` (s): o último quadro fica até lá; com `corta`, o efeito
   * também não passa dali (o CUnitBeam da nova some no fim da vida dele).
   */
  #umaVez(id, escala, x, y, z, quat = null, ate = 0, corta = false) {
    const inst = criarEfeitoOriginal(id, { escala });
    inst.obj.position.set(x, y, z);
    if (quat) inst.obj.quaternion.copy(quat);
    this.ef.scene.add(inst.obj);
    this.ef.originais.push({ inst, ate, corta });
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
    if (this.semClarao(kind, nv)) return true;
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

  /**
   * A arma é desenhada como no original e lá não tem clarão (coluna 51 '0': as novas que
   * a nave solta e os dispositivos)? Quem chama não desenha o clarão de antes.
   */
  semClarao(kind, nv) {
    return !!disparoOriginal(kind) && !golpeDaArma(kind, nv ?? 1, 0)?.vis?.d;
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
   * Desenho do projétil (o do golpe `b.p`: o disparo ou um subprojétil), repetindo, na
   * lista de tiros de efeitos.js (que anda com ele, faz o desvio da boca e o tira de
   * cena). O subprojétil com clarão no modo 0 acende o clarão parado onde nasceu, no rumo
   * dele. false: a arma não é desenhada como no original ou o efeito não carregou.
   */
  tiro(b, boca) {
    const p = b.p ?? 0;
    const id = this.#id(b.kind, b.nv, 'p', p);
    if (!id) return false;
    const inst = criarEfeitoOriginal(id, { escala: ESCALA_DISPARO, loop: true });
    inst.obj.position.set(b.x, b.y, b.z);
    inst.obj.lookAt(b.x + b.vx, b.y + b.vy, b.z + b.vz);
    this.ef.scene.add(inst.obj);
    const desvio = boca ? { x: boca.x - b.x, y: boca.y - b.y, z: boca.z - b.z, t: 0 } : null;
    const como = disparoOriginal(b.kind);
    const golpe = golpeDaArma(b.kind, b.nv ?? 1, p);
    const carga = como.carga && p === 0 ? golpe : null;
    // Míssil com rastro (tipo de gráfico 6): a fita do original presa ao nó Tail dele.
    const cauda = golpe?.vis?.tipo === 'missil_com_rastro' && golpe.vis.r ? criarRastro(golpe.vis.r) : null;
    if (cauda) this.ef.scene.add(cauda.obj);
    this.ef.tiros.set(b.id, { b, g: inst.obj, original: inst, comoOriginal: true, carga, cauda, rastro: { x: b.x, y: b.y, z: b.z }, desvio });
    const clarao = p > 0 && como.claraoSub === 'parado' ? this.#id(b.kind, b.nv, 'd', p) : null;
    if (clarao) this.#umaVez(clarao, ESCALA_DISPARO, b.x, b.y, b.z, this.#rumo(b));
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
    if (recuo !== 0 && v > 0) t.g.position.addScaledVector(this.v.set(t.b.vx, t.b.vy, t.b.vz), -recuo / v);
  }

  /** O rastro do míssil `t` segue o nó Tail dele (chamar depois de o efeito tocar o quadro). */
  rastro(t, dt) {
    if (!t.cauda) return;
    if (!matrizDaPeca(t.original, 'Tail', this.m)) this.m.copy(t.g.matrixWorld);
    seguirRastro(t.cauda, this.m, dt);
  }

  /** O tiro `t` saiu de cena: o rastro dele volta para a reserva. */
  soltar(t) {
    if (t?.cauda) soltarRastro(t.cauda);
  }

  /**
   * Teleporte da nave (o Teleporte, `kind`): o CUnitTeleportEffect onde ela sumiu
   * (`de`: { x, y, z }), na matriz da nave (o giro de `nave`, o grupo dela, se está na
   * tela), e onde apareceu (`para`), de pé: o original só põe a posição
   * (CGameSocket::LGTeleportDisappear e LGTeleportAppear). Uma vez cada. false: a arma
   * não salta como no original ou o efeito não carregou.
   */
  teleporte(kind, de, para, nave = null) {
    const id = disparoOriginal(kind)?.teleporte;
    if (!id || !efeitoOriginalPronto(id)) return false;
    const giro = nave?.parent ? (nave.userData.corpo ?? nave).getWorldQuaternion(this.q).multiply(MEIA_VOLTA) : null;
    if (de) this.#umaVez(id, ESCALA_DISPARO, de.x, de.y, de.z, giro);
    if (para) this.#umaVez(id, ESCALA_DISPARO, para.x, para.y, para.z);
    return true;
  }

  /** Rumo do tiro `b` como giro do efeito (o efeito olha para +z). */
  #rumo(b) {
    const v = this.v.set(b.vx, b.vy, b.vz);
    if (v.lengthSq() < 1e-9) return this.q.identity();
    return this.q.setFromUnitVectors(EIXO_Z, v.normalize());
  }

  /**
   * Impacto onde o tiro `b` parou (chão, construção, campo, fim da vida do que explode
   * no fim), no rumo dele; avisa o som (efeitos.aoImpacto), menos o do que explode com
   * área no fim (o som sai com a explosão do servidor, uma vez).
   */
  #noLugar(b, x = b.x, y = b.y, z = b.z) {
    const p = b.p ?? 0;
    const g = golpeDaArma(b.kind, b.nv ?? 1, p);
    const id = this.#id(b.kind, b.nv, 'i', p);
    if (id) this.#umaVez(id, ESCALA_DISPARO, x, y, z, this.#rumo(b));
    if (!(explodeNoFim(g) && g.area > 0)) this.ef.aoImpacto?.(b.kind, x, y, z, b.nv, p);
  }

  /** O desenho do tiro `t` acabou antes da vida (bateu no chão, numa construção, no campo): o impacto ali. */
  bateu(t) {
    this.#noLugar(t.b);
  }

  /** O desenho do tiro `t` chegou ao fim da vida: o que explode no fim deixa o impacto ali; o resto some sem nada. */
  expirou(t) {
    if (t?.comoOriginal && explodeNoFim(golpeDaArma(t.b.kind, t.b.nv ?? 1, t.b.p ?? 0))) this.#noLugar(t.b);
  }

  /**
   * O servidor disse que o tiro `t` acabou em (x, y, z) (evento 'fim'): se foi antes da
   * hora (bateu em algo que o desenho ainda não alcançou, ou que o cliente não conhece,
   * como uma torre) ou se ele explode no fim, o impacto ali; se só acabou a vida, nada.
   */
  fim(t, x, y, z) {
    if (!t?.comoOriginal) return;
    if (acabouAntes(t.b, x, z) || explodeNoFim(golpeDaArma(t.b.kind, t.b.nv ?? 1, t.b.p ?? 0))) this.#noLugar(t.b, x, y, z);
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
   * Acerto do servidor com a arma `kind` (versão `nv`, golpe `p`, quando o evento traz)
   * em `alvo` ({ id, obj, raio, x, y, z }). `bala`: o estado do tiro que acertou, ou
   * null (área, nova, armadilha). `proprio`: foi você quem bateu (o seu impacto pode já
   * ter saído na hora em que o tiro encostou). false: a arma não é desenhada como no
   * original ou o efeito não carregou.
   */
  impacto(kind, nv, p, alvo, bala, proprio) {
    if (!disparoOriginal(kind)) return false;
    const versao = bala?.nv ?? nv ?? 1;
    const prof = bala ? (bala.p ?? 0) : p;
    // O golpe que acertou não tem impacto no original (a Nova Desarmadora): nada.
    if (prof !== undefined && prof !== null && !golpeDaArma(kind, versao, prof)?.vis?.i) return true;
    const id = this.#idImpacto(kind, versao, prof);
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
    const id = this.#id(t.b.kind, t.b.nv, 'i', t.b.p ?? 0);
    if (!id) return false;
    this.#noCasco(id, alvo, t.b);
    this.locais.push({ alvo: alvo.id, kind: t.b.kind, t: this.tempo });
    if (this.locais.length > 64) this.locais.shift();
    return true;
  }

  /**
   * Explosão de área (evento 'explosao'): o efeito de fim deitado no ponto, esticado
   * até a área (modo 7 do original); a arma sem fim no original (a carga da Armadilha
   * Supressora) não desenha nada. false: a arma não é desenhada como no original (quem
   * chama desenha a área de antes).
   */
  area(kind, nv, x, y, z, raio, p = 0, expirou = false) {
    if (!disparoOriginal(kind)) return false;
    const g = golpeDaArma(kind, nv ?? 1, p);
    if (g?.forma === 'mina') {
      // A armadilha explode onde está, na altura do voo (o servidor a guarda no chão);
      // a que acabou a vida é o caso do chão no original: o impacto dela ali.
      y = heightAt(x, z) + HOVER;
      const imp = expirou ? this.#id(kind, nv, 'i', p) : null;
      if (imp) this.#umaVez(imp, ESCALA_DISPARO, x, y, z);
    }
    this.#origem(kind, x, y, z, EXPLOSAO_ORIGEM_S);
    const id = disparoOriginal(kind).fim === 'area' ? this.#id(kind, nv, 'f') : null;
    if (id && raio > 0) this.#umaVez(id, escalaDaArea(raio), x, y, z);
    return true;
  }

  /**
   * Nova (evento 'nova') da arma `kind`, golpe `p`, de raio `raio` em (x, y, z). O
   * Rebatedor (clarão no modo 2, golpe 0): o clarão parado ali, se não é seu (o seu saiu
   * na hora, pela predição). A esfera que cresce (tipo 17: a do Canhão de Faíscas e a do
   * Ciclone, golpe 1; as novas que a nave solta, golpe 0): deitada ali, esticada até o
   * raio, o último quadro até a vida da nova acabar e nada depois dela. false: a arma
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
    this.#umaVez(id, escalaDaArea(raio), x, y, z, null, g.vida, true);
    this.#origem(kind, x, y, z, g.vida);
    return true;
  }

  /**
   * O efeito da armadilha `kind` (versão `nv`, golpe `p`) que fica parada onde caiu
   * (tipo 7, desenhado como modelo), ou null se a arma não é desenhada como no original.
   */
  idMina(kind, nv, p) {
    if (!disparoOriginal(kind)) return null;
    return this.#id(kind, nv, 'a', p) ?? this.#id(kind, nv, 'p', p);
  }

  /** A armadilha `kind` está em (x, y, z): os alvos que ela fere levam o impacto do lado dela. */
  armadilhaEm(kind, x, y, z) {
    const e = this.explosoes.find((o) => o.kind === kind && o.x === x && o.z === z);
    if (e) e.ate = this.tempo + ARMADILHA_ORIGEM_S;
    else this.#origem(kind, x, y, z, ARMADILHA_ORIGEM_S);
  }

  /**
   * Reparo do escudo ligado na nave `nave` (o grupo dela) da raça `race`: chamar a cada
   * quadro desenhado. A cada passo de 1/30 s (o quadro do original), 1 chance em 4 de
   * soltar um quantum (ESCUDO_REC), que se afasta seguindo a nave e vira a esfera no
   * centro dela.
   */
  escudoRec(nave, race, dt) {
    const ud = nave.userData;
    const ids = ESCUDO_REC[race] ?? ESCUDO_REC.acron;
    if (!efeitoOriginalPronto(ids.quantum) || !efeitoOriginalPronto(ids.esfera)) return;
    ud.escudoRecAcc = (ud.escudoRecAcc ?? 0) + dt;
    while (ud.escudoRecAcc >= QUADRO_DESENHO_S) {
      ud.escudoRecAcc -= QUADRO_DESENHO_S;
      if (Math.floor(Math.random() * ESCUDO_REC.chance) !== 0) continue;
      // Original (Z para cima) → jogo (Y para cima): o y do original é o z daqui.
      const d = direcaoDoQuantum(Math.random(), Math.random(), Math.random());
      // O quantum toca uma vez e fica no último quadro (CBaseEffect::OnStateEnd não faz nada).
      const inst = criarEfeitoOriginal(ids.quantum, { escala: ESCALA_DISPARO });
      this.ef.scene.add(inst.obj);
      this.quanta.push({ inst, nave, esfera: ids.esfera, dir: new THREE.Vector3(d.x, d.z, d.y), quadros: 0 });
      if (this.quanta.length > QUANTA_MAX) this.#soltarQuantum(this.quanta.shift());
    }
  }

  #soltarQuantum(q) {
    soltarEfeitoOriginal(q.inst);
  }

  /** Anda os quanta do reparo do escudo (24 quadros por segundo) e as esferas que seguem a nave. */
  #atualizarQuanta(dt, camera) {
    this.quanta = this.quanta.filter((q) => {
      q.quadros += dt * QUADROS_POR_S;
      const dist = quantumDoEscudo(q.quadros);
      const naCena = !!q.nave.parent;
      if (dist === null || !naCena) {
        this.#soltarQuantum(q);
        if (dist === null && naCena) {
          // A esfera no centro da nave, com o x do original (o +z do efeito aqui) para a direção do quantum.
          const inst = criarEfeitoOriginal(q.esfera, { escala: ESCALA_DISPARO });
          inst.obj.quaternion.setFromUnitVectors(EIXO_Z, q.dir);
          this.ef.scene.add(inst.obj);
          this.esferas.push({ inst, nave: q.nave });
        }
        return false;
      }
      const corpo = q.nave.userData.corpo ?? q.nave;
      corpo.getWorldPosition(q.inst.obj.position).addScaledVector(q.dir, dist * ESCALA_DISPARO);
      corpo.getWorldQuaternion(q.inst.obj.quaternion).multiply(MEIA_VOLTA);
      tocarEfeitoOriginal(q.inst, dt, camera);
      return true;
    });
    this.esferas = this.esferas.filter((e) => {
      if (e.nave.parent) (e.nave.userData.corpo ?? e.nave).getWorldPosition(e.inst.obj.position);
      if (e.nave.parent && tocarEfeitoOriginal(e.inst, dt, camera)) return true;
      soltarEfeitoOriginal(e.inst);
      return false;
    });
  }

  /** Avança os clarões presos na boca e o reparo do escudo (chamar a cada quadro, depois de as naves andarem). */
  atualizar(dt, camera) {
    this.tempo += dt;
    this.#atualizarQuanta(dt, camera);
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
    for (const q of this.quanta) this.#soltarQuantum(q);
    for (const e of this.esferas) soltarEfeitoOriginal(e.inst);
    this.quanta = [];
    this.esferas = [];
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
