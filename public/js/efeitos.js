// Efeitos visuais: tiros, faíscas de acerto e explosões. Só aparência; quem decide
// se o tiro acertou é o servidor (eventos 'acerto' e 'morte' do snapshot).
//
// Armas novas (cores no IDENTIDADE-VISUAL.md): o míssil teleguiado é um corpo
// metálico com chama branco-quente e rastro de fumaça cinza, e vira conforme a
// curva que o servidor manda (corrigirGuiados); a mina é um disco no chão com uma
// luz que pulsa (turquesa a do seu time, vermelha a do outro; devagar enquanto não
// arma, rápido armada); a onda de choque e a explosão da mina são anéis que abrem
// no plano, na cor do time de quem usou; o pulso EMP é uma bola branco-elétrica, e
// quem está sob EMP solta faíscas na mesma cor.
//
// Recall (volta à base): na linguagem do recall dos MOBAs (volta-regras.js e volta.js), na
// cor do time (relativa a quem olha). Canalizando, o círculo de runas embaixo da nave, o
// funil de partículas e fitas subindo, a coluna de luz e a nave acendendo; ao voltar, onde
// ela estava, clarão, a nave se desfaz de baixo para cima e a luz vai ao céu; na base, o
// feixe cai do céu, as partículas convergem e a nave se materializa. O teleporte até o
// companheiro continua com o feixe curto (feixeRecall).
//
// Armas do Astro-N original (catálogo de shared/armas.js): o desenho de cada tiro,
// clarão, impacto, área, nova e o decalque das minas e campos vêm de
// efeitos-armas.js, com as texturas e as cores do original. O tiro nasce na boca da
// arma pendurada na asa e escorrega para a linha do tiro de verdade (a da física) em
// DESVIO_S, para o desenho sair da arma sem mentir onde a bala está. As armas de início
// (as duas de fábrica de cada raça) saem com os efeitos do original tocados como no
// original, do clarão preso na boca ao impacto no casco (disparo-original.js). Os tiros
// dos NPCs (laser e plasma) continuam com a forma de antes. As naves atingidas mostram os
// efeitos das armas pela lista `fx` de cada entidade (paralisia, desgoverno, energia,
// invulnerável, escudo, fraco, conserto, aceleração, camuflagem).
//
// Bônus dos objetivos na nave (`bonus`: 'ataque', 'suporte', 'sonda' da própria nave e
// 'medusa' do time): um anel fino deitado em volta dela por bônus, cada um com raio,
// cor e jeito próprios (o de ataque âmbar pulsando, o de suporte verde abrindo para
// fora, o da sonda azul em três arcos girando, o da Medusa violeta largo e lento),
// para dar para empilhar e ler de longe.
//
// Monstros da jungle (server/jungle.js): todos atiram com as armas de NPC do original
// (`kind` 'n511080'...; o ataque, `atq`, vai nos eventos e nos `guiados`),
// desenhadas com os EFEITOS DO ORIGINAL tocados como no
// original (efeitos-original.js: o .eff + .3dx + .MPL de cada um; os golpes na escala
// do monstro, ESCALA_TIRO_ORIGINAL, o que fica preso na nave na dela,
// ESCALA_ORIGINAL): o projétil em voo (as bolas de fogo do Xerxes, o feixe do Bazit,
// os mísseis do Anti e do SN-4, o míssil com o "E" do SN-3), o clarão, o impacto (a
// esfera azul da descarga de energia), a área, a nova (a onda rosa do SN-4, esticada
// até o raio) e o campo (o campo elétrico do SN-4); efeito que não carregou cai no
// desenho das armas do jogador (efeitos-armas.js). O pulso do Núcleo de He-3 é um anel
// azul-gelo (puxando para o vermelho quanto mais forte) que abre até o raio.
//
// Estados na nave, como no original (CUnit::ChangeEffectFlag): os debuffs da lista `fx`
// que o original marca com um ícone ganham o ícone 3D do original girando EM CIMA da
// nave, empilhados (ICONES_ESTADO: o capacete das resistências, o "LD" da paralisia, o
// "E" da energia...), e o Magma é o fogo do original na nave (faíscas vermelhas
// subindo). Esses não levam mais a aura colorida.
//
// Desempenho (nada de travada quando a luta começa): o que vem e vai a cada tiro
// (faísca, fumaça do míssil, clarão, anel de área, pulso, feixe do recall, anel de
// nível, os efeitos do original) sai de RESERVAS e volta para elas ao sumir, com
// material e geometria já prontos; os tiros de NPC e de monstro dividem um material por
// cor; e as geometrias são de tamanho 1, escaladas (o pulso, o anel). Assim a partida
// não cria geometria nem material a cada tiro e não libera nenhum no meio dela: o
// Three.js apaga o programa de shader quando o último material dele é liberado, e o
// próximo efeito igual compilaria de novo. As reservas já nascem cheias na tela de
// carregamento (preencherReservas, chamado pelo aquecimento da placa de vídeo).

import * as THREE from 'three';
import { RACES, stepBullet, WEAPONS } from '/shared/sim.js';
import { heightAt, topoPouso } from '/shared/terrain.js';
import { FATOR_AREA, golpeDaArma, visualDoOriginal, visualEfeito } from '/shared/armas.js';
import { FATOR_TAMANHO_NAVE } from '/shared/naves.js';
import { brilho } from './nave.js';
import { VisualArmas } from './efeitos-armas.js';
import { DisparoOriginal } from './disparo-original.js';
import { ICONES_ESTADO, MAGMA_NA_NAVE } from './insumos.js';
import { criarEfeitoOriginal, tocarEfeitoOriginal, soltarEfeitoOriginal, raioEfeitoOriginal, efeitoOriginalPronto, particulaOriginal } from './efeitos-original.js';
import { criarSubida, desenharSubida, soltarSubida } from './subida.js';
import { quadroSubida } from './subida-regras.js';
import { criarVolta, soltarVolta, montarCasca, seguirCasca, desenharVolta } from './volta.js';
import { quadroCanal, quadroPartida, quadroChegada, VOLTA_APAGA_S, CASCO_ESCONDIDO_S } from './volta-regras.js';
import { texturaEfeito } from './efeitos-armas.js';

// Cores dos efeitos de arma (ver IDENTIDADE-VISUAL.md): o dreno é violeta e o
// criogênico azul-gelo, para não se confundirem com o laser ciano, o plasma verde
// nem com o vermelho de inimigo.
const COR_DRENO = new THREE.Color('#d070ff');
const COR_GELO = new THREE.Color('#a8e8ff');
const COR_EMP = new THREE.Color('#c8d2ff');
// Fúria (bônus do objetivo C): âmbar dos objetivos, de onde o bônus vem. Um anel
// fino deitado em volta da nave, pulsando devagar, sem partículas: brilho difuso
// some no deserto alaranjado, e o anel lê bem na câmera de perseguição sem
// competir com tiro, explosão nem com as auras de arma (que são nuvens).
// Efeitos presos na nave (anéis, auras, recall) entram no grupo `efeitos` dela
// (public/js/nave.js), que acompanha o tamanho da nave: os números abaixo são para a
// primeira nave da linha, e a grande leva tudo maior. Monstro e o resto: no próprio objeto.
const efeitosDa = (obj) => obj.userData.efeitos ?? obj;

// Anéis dos bônus na nave: cor, raio (m) e jeito (pulsa, abre, gira em arcos, lento).
const ANEIS_BONUS = {
  ataque: { cor: new THREE.Color('#ffb627'), raio: 7.5, jeito: 'pulsa' },
  suporte: { cor: new THREE.Color('#7dff9a'), raio: 8.2, jeito: 'abre' },
  sonda: { cor: new THREE.Color('#7fd8ff'), raio: 6.4, jeito: 'arcos' },
  medusa: { cor: new THREE.Color('#e7a6ff'), raio: 9.6, jeito: 'lento' },
};
const BONUS_OPACIDADE = 0.85;
// Efeitos do original: o que fica preso na nave (ícones de estado, o Magma) na escala
// das naves (o modelo das naves é o do original × isto); os golpes do monstro
// (projétil, clarão, impacto, explosão) na escala dos monstros e do raio de acerto dos
// tiros (FATOR_AREA): na das naves, as bolas de fogo do Xerxes, que crescem 4 vezes no
// voo, e os oito impactos de cada rajada cobririam a tela.
const ESCALA_ORIGINAL = FATOR_TAMANHO_NAVE;
const ESCALA_TIRO_ORIGINAL = FATOR_AREA;
// Ícones de estado em cima da nave (CUnit::RenderScene do original: 15 m acima da
// nave e mais 20 a cada ícone, na escala do original), em m da primeira nave da linha.
const ICONE_ALTURA = 15 * ESCALA_ORIGINAL;
const ICONE_PASSO = 20 * ESCALA_ORIGINAL;
// Rastro do projétil de partículas do original (feixe do Bazit, canhão do Anti): uma
// partícula com a textura do efeito a cada PARTICULA_PASSO m andados, que cresce
// PARTICULA_CRESCE vezes e some em PARTICULA_S (a nuvem que liga o monstro ao alvo).
const PARTICULA_PASSO = 4;
const PARTICULA_S = 0.6;
const PARTICULA_CRESCE = 1.6;
const PARTICULAS_MAX = 160;
// Impactos iguais que chegam juntos no mesmo lugar desenham um só (impactoMonstro).
const IMPACTO_JUNTO_S = 0.15;
const IMPACTO_JUNTO_M = 6;
// Pulso do Núcleo: duração (s) do anel abrindo, cor com força 1 e com força máxima.
const PULSO_S = 0.7;
const PULSO_RAIO_INICIO = 11; // m: o círculo âmbar de 22 m do prato do Núcleo
const COR_PULSO = new THREE.Color('#9fe8ff');
const COR_PULSO_FORTE = new THREE.Color('#ff6a4a');
const COR_BRANCO = new THREE.Color('#ffffff'); // estalo mais forte das faíscas do EMP
const COR_CHAMA = new THREE.Color('#fff0c8'); // chama do míssil
const COR_FUMACA = new THREE.Color('#8f8a83'); // rastro do míssil (sem brilho)
const COR_METAL = new THREE.Color('#c9d2d0'); // casco do míssil, o mesmo das naves
// Cor de time relativa a quem olha (mina e anéis): seu time turquesa, o outro vermelho.
export const COR_TIME = { meu: new THREE.Color('#00efc0'), outro: new THREE.Color('#ff3b2a') };
const COR_TIRO = {
  laser: new THREE.Color('#5ff7ff'),
  laserDuplo: new THREE.Color('#5ff7ff'),
  laserTriplo: new THREE.Color('#5ff7ff'),
  dreno: COR_DRENO,
  crio: COR_GELO,
  plasma: new THREE.Color('#7dff6a'),
  missil: COR_CHAMA,
  emp: COR_EMP,
  inimigo: new THREE.Color('#ff4a2a'),
};
// Forma de cada tiro: barra (comprimento em m, 0 = sem barra) + brilho. Os lasers
// de vários projéteis usam barras menores, já que saem juntas; o dreno é uma bola
// de brilho e o criogênico um estilhaço curto e grosso.
const FORMA_TIRO = {
  laser: { barra: 7, grossura: 0.35, brilho: 3 },
  laserDuplo: { barra: 6, grossura: 0.28, brilho: 2.4 },
  laserTriplo: { barra: 5, grossura: 0.25, brilho: 2.2 },
  dreno: { barra: 0, brilho: 4.2 },
  crio: { barra: 3, grossura: 0.5, brilho: 3.4 },
  plasma: { barra: 0, brilho: 6 },
  missil: { barra: 0, brilho: 4.5, corpo: true },
  emp: { barra: 0, brilho: 4.6 },
};
// Rastro do míssil: uma baforada de fumaça a cada FUMACA_PASSO m andados (por
// distância, não por quadro: com quadro lento ou correção do servidor o rastro
// continua inteiro), no máximo FUMACA_MAX por quadro; cada uma cresce e some.
const FUMACA_PASSO = 4;
const FUMACA_MAX = 30;
const FUMACA_DUR = 1.2;
// Anel de área (onda de choque e explosão de mina): abre do centro até o raio.
const ANEL_AREA_S = 0.45;
// Faíscas de quem está sob EMP: estalos curtos e rápidos em volta da nave.
const FAISCA_EMP_S = 0.05;
// Mina: piscar da luz (vezes por segundo) desarmada e armada; tamanho em m.
const MINA_PISCA = { desarmada: 1.2, armada: 4 };
const MINA_RAIO_CORPO = 1.6;
// Aura de quem está sob efeito: brilho em volta da nave + partículas. O dreno
// "puxa" a vida para fora (partículas violeta subindo); o gelo cai em cristais.
const AURA_PARTICULA_S = 0.07; // intervalo entre partículas por nave afetada
// Subiu de nível ou evoluiu a nave: o efeito nosso (subida-regras.js e subida.js), a luz
// que sobe da nave até o alto da tela, na cor da raça. Segue a posição da nave, de pé (não
// inclina nem gira com ela): vai na cena, não no grupo `efeitos` da nave. O pé (o selo e
// o começo do feixe) fica logo abaixo da barriga da nave, medida no modelo a cada quadro
// (na evolução o modelo troca pelo maior no meio); pousada, no piso. Dois "subiu" na
// mesma nave a menos de SUBIDA_JUNTA_S (vários níveis de uma vez) viram um só.
const SUBIDA_ABAIXO = 0.35; // m abaixo da barriga da nave
const SUBIDA_PISO = 0.25; // m acima do chão ou da plataforma, no mínimo
const SUBIDA_CORPO_PADRAO = 5; // m, nave sem userData.tamanho
const caixaSubida = new THREE.Box3();
const SUBIDA_JUNTA_S = 0.3;
// O desenho do tiro sai da boca da arma e encontra a linha da física neste tempo (s).
const DESVIO_S = 0.15;
// Efeitos das armas na nave atingida (lista `fx` do servidor): cor da aura de cada um.
const COR_FX = {
  para: new THREE.Color('#c8d2ff'),
  desg: new THREE.Color('#b47cff'),
  energia: new THREE.Color('#3fa9ff'),
  invul: new THREE.Color('#ffe28a'),
  escudo: new THREE.Color('#8fd0ff'),
  fraco: new THREE.Color('#ff8a70'),
  regen: new THREE.Color('#7dff9a'),
  acel: new THREE.Color('#7fd8ff'),
};
const FX_PARTICULA_S = 0.09;
// Camuflagem: a nave (sua ou de aliado) fica fantasma, nesta opacidade.
const FANTASMA_OPACIDADE = 0.28;
// Teleporte até o companheiro: o feixe curto na saída e na chegada (raio e altura em m,
// duração em s).
const TELEPORTE_FEIXE_RAIO = 6;
const TELEPORTE_FEIXE_ALTURA = 46;
const TELEPORTE_FEIXE_S = 0.7;
// Volta à base (volta.js): logo depois da volta, o progresso que ainda chega da nave (o
// desenho dos outros vem INTERP_MS atrás) não reabre o canal; nave sem tamanho (m); o pé
// do efeito (o círculo) fica logo abaixo da barriga da nave (m), medida no modelo como na
// subida de nível, e nunca abaixo do chão.
const VOLTA_IGNORA_S = 0.4;
const VOLTA_CORPO_PADRAO = 5;
const VOLTA_ABAIXO = 0.6;
const VOLTA_PISO = 0.3;
const caixaVolta = new THREE.Box3();
// Quantos de cada efeito passageiro já nascem prontos na tela de carregamento (a
// reserva cresce sozinha se a partida pedir mais). Uma briga de 6 naves com mísseis
// passa de cem faíscas e baforadas de fumaça ao mesmo tempo.
const RESERVA_INICIAL = { brilho: 160, fumaca: 120, faiscas: 12, anelArea: 12, pulsoAnel: 4, pulsoCasca: 4, feixe: 4 };
// Faíscas de uma explosão: 14 por tamanho, até este tanto (o buffer da reserva é deste tamanho).
const FAISCAS_MAX = 128;

function spriteAditivo(cor, tamanho) {
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: brilho(), color: cor, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }),
  );
  s.scale.setScalar(tamanho);
  return s;
}

// Geometria de cada anel de bônus, uma para todas as naves (nunca liberada: é pequena
// e volta em toda partida).
const GEO_BONUS = new Map();
function geoBonus(def) {
  if (!GEO_BONUS.has(def)) {
    GEO_BONUS.set(
      def,
      def.jeito === 'arcos'
        ? new THREE.TorusGeometry(def.raio, 0.2, 4, 24, Math.PI * 0.45)
        : new THREE.TorusGeometry(def.raio, def.jeito === 'lento' ? 0.24 : 0.18, 4, 64),
    );
  }
  return GEO_BONUS.get(def);
}

/** Anel de um bônus: toro fino deitado em volta da nave (três arcos na sonda), aditivo. */
function anelBonus(def) {
  const mat = new THREE.MeshBasicMaterial({ color: def.cor, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
  const g = new THREE.Group();
  if (def.jeito === 'arcos') {
    for (let i = 0; i < 3; i++) {
      const arco = new THREE.Mesh(geoBonus(def), mat);
      arco.rotation.z = (i * Math.PI * 2) / 3;
      g.add(arco);
    }
  } else g.add(new THREE.Mesh(geoBonus(def), mat));
  g.rotation.x = Math.PI / 2;
  g.userData.mat = mat;
  return g;
}

export class Efeitos {
  /** Libera da GPU as geometrias guardadas fora da cena (saída da partida). */
  liberar() {
    for (const t of this.tiros.values()) if (t.visual) this.armas.soltarProjetil(t.g);
    this.armas.liberar();
    this.matFantasma?.dispose();
    for (const geo of this.geoBarra.values()) geo.dispose();
    this.geoBarra.clear();
    this.atualizarMinas([]);
    this.esquecer();
    // As reservas e os materiais por cor só se liberam aqui, saindo da partida.
    for (const sp of this.reservaParticulas) sp.material.dispose();
    this.reservaParticulas = [];
    for (const lista of this.reservas.values()) {
      for (const o of lista) {
        o.material.dispose();
        if (o.userData.reserva === 'faiscas') o.geometry.dispose();
      }
    }
    this.reservas.clear();
    for (const m of this.matsPorCor.values()) m.dispose();
    this.matsPorCor.clear();
    for (const g of this.geoPulso.values()) g.dispose();
    this.geoPulso.clear();
    for (const r of [this.geoMina, this.geoEspinho, this.geoLuzMina, this.matMina, this.geoMissil, this.geoNarizMissil, this.matMissil, this.geoAnel, this.geoColuna, this.geoCascaPulso]) {
      r.dispose();
    }
  }

  /**
   * Tira de cena e das listas tudo o que está passando (tiros, explosões, anéis,
   * feixes do recall, fumaça, partículas das auras e os passageiros das armas) SEM
   * liberar os materiais. Só para o aquecimento da placa (carregamento.js): material
   * liberado faz o Three.js apagar o programa de shader que ninguém mais usa, e o
   * próximo efeito igual compilaria de novo no meio da partida; estes ficam de reserva.
   */
  esquecer() {
    for (const t of this.tiros.values()) {
      this.scene.remove(t.g);
      if (t.original) soltarEfeitoOriginal(t.original);
    }
    this.tiros.clear();
    for (const p of this.particulas) {
      this.#devolver(p.flash);
      this.#devolver(p.pts);
    }
    for (const a of this.aneisArea) this.#devolver(a.anel);
    for (const f of this.feixes) this.#devolver(f.m);
    for (const p of [...this.fumacas, ...this.auras]) this.#devolver(p.s);
    for (const s of this.subidas) {
      soltarSubida(s.desenho);
      this.#devolver(s.clarao);
    }
    this.subidas = [];
    for (const c of this.canais.values()) soltarVolta(c.desenho);
    this.canais.clear();
    for (const v of this.voltas) {
      soltarVolta(v.desenho);
      this.#devolver(v.clarao);
    }
    this.voltas = [];
    for (const obj of this.ocultos) if (obj.userData.casco) obj.userData.casco.visible = true;
    this.ocultos.clear();
    for (const c of this.pulsos) this.#devolver(c.m);
    for (const o of this.originais) soltarEfeitoOriginal(o.inst);
    this.originais = [];
    for (const p of this.particulasRastro) this.#soltarParticula(p);
    this.particulasRastro = [];
    this.pulsos = [];
    this.particulas = [];
    this.aneisArea = [];
    this.feixes = [];
    this.fumacas = [];
    this.auras = [];
    this.armas.esquecer();
    this.disparo.esquecer();
  }

  constructor(scene) {
    this.scene = scene;
    this.tiros = new Map();
    this.particulas = [];
    this.geoBarra = new Map();
    this.auras = [];
    this.subidas = []; // subida de nível seguindo uma nave: { obj, desenho, clarao, cor, forte, vida }
    this.aneisArea = [];
    this.fumacas = [];
    this.minas = new Map(); // id -> { g, luz, brilho, armada, fase }
    this.tempo = 0;
    this.v = new THREE.Vector3();
    // Peças da mina e do míssil, criadas uma vez e liberadas em liberar().
    this.geoMina = new THREE.CylinderGeometry(MINA_RAIO_CORPO, MINA_RAIO_CORPO * 1.15, 0.6, 8);
    this.geoEspinho = new THREE.ConeGeometry(0.25, 0.9, 4);
    this.geoLuzMina = new THREE.OctahedronGeometry(0.55);
    this.matMina = new THREE.MeshStandardMaterial({ color: '#3a4442', metalness: 0.5, roughness: 0.6, flatShading: true });
    this.geoMissil = new THREE.CylinderGeometry(0.28, 0.4, 2.4, 6);
    this.geoNarizMissil = new THREE.ConeGeometry(0.28, 0.8, 6);
    this.matMissil = new THREE.MeshBasicMaterial({ color: COR_METAL });
    this.geoAnel = new THREE.RingGeometry(0.86, 1, 48);
    // Coluna do teleporte: cilindro aberto de raio e altura 1, com a cor dos vértices
    // indo de branco embaixo a preto em cima (aditivo: preto some), para a luz
    // "derreter" no alto em vez de acabar num corte reto.
    this.geoColuna = new THREE.CylinderGeometry(1, 1, 1, 20, 1, true);
    this.geoColuna.translate(0, 0.5, 0);
    const pos = this.geoColuna.attributes.position;
    const cores = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) cores.fill(1 - pos.getY(i), i * 3, i * 3 + 3);
    this.geoColuna.setAttribute('color', new THREE.BufferAttribute(cores, 3));
    this.feixes = []; // feixes de saída e chegada do teleporte
    this.canais = new Map(); // volta à base canalizando: nave -> { desenho, k, t, ligado, apaga, cor, brilho, visto, casco }
    this.voltas = []; // partidas e chegadas da volta à base: { tipo, obj, desenho, clarao, cor, corpo, x, y, z, t, brilho, casco }
    this.ocultos = new Set(); // naves com o casco escondido (a chegada mostra a luz antes)
    this.originais = []; // efeitos do original que tocam uma vez: { inst }
    this.particulasRastro = []; // rastro dos projéteis de partículas do original
    this.reservaParticulas = [];
    this.camera = null; // quem desenha a cena põe a câmera (peças viradas para ela)
    this.pulsos = []; // pulsos do Núcleo de He-3
    // Geometrias de tamanho 1 (a malha escala): o pulso.
    this.geoCascaPulso = new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    this.geoPulso = new Map(); // grossura do anel do pulso (em degraus) -> TorusGeometry
    const aditivo = { blending: THREE.AdditiveBlending, transparent: true, depthWrite: false };
    this.matsPorCor = new Map(); // materiais dos tiros de NPC e de monstro, um por cor e jeito
    // Reservas dos efeitos passageiros (#pegar/#devolver) e como nasce cada um.
    this.reservas = new Map();
    this.fabricas = {
      brilho: () => new THREE.Sprite(new THREE.SpriteMaterial({ map: brilho(), ...aditivo })),
      fumaca: () => new THREE.Sprite(new THREE.SpriteMaterial({ map: brilho(), depthWrite: false, transparent: true })),
      faiscas: () => {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(FAISCAS_MAX * 3), 3).setUsage(THREE.DynamicDrawUsage));
        const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: '#ffd28a', size: 1, ...aditivo }));
        pts.frustumCulled = false; // as faíscas se espalham: a esfera do primeiro uso não vale para o próximo
        return pts;
      },
      anelArea: () => {
        const m = new THREE.Mesh(this.geoAnel, new THREE.MeshBasicMaterial({ ...aditivo, side: THREE.DoubleSide }));
        m.rotation.x = -Math.PI / 2;
        return m;
      },
      pulsoAnel: () => {
        const m = new THREE.Mesh(this.#geoPulso(0), new THREE.MeshBasicMaterial({ ...aditivo }));
        m.rotation.x = Math.PI / 2;
        return m;
      },
      pulsoCasca: () => new THREE.Mesh(this.geoCascaPulso, new THREE.MeshBasicMaterial({ ...aditivo, side: THREE.DoubleSide })),
      feixe: () => new THREE.Mesh(this.geoColuna, new THREE.MeshBasicMaterial({ ...aditivo, vertexColors: true, side: THREE.DoubleSide })),
    };
    this.armas = new VisualArmas(scene);
    // Armas de início desenhadas como no original (clarão, projétil, impacto e fim);
    // `aoImpacto(kind, x, y, z)` (quem desenha a partida liga) toca o som do impacto no
    // chão, que só o cliente vê.
    this.disparo = new DisparoOriginal(this);
    this.aoImpacto = null;
  }

  /**
   * Um efeito passageiro da reserva `tipo` (ou um novo, da fábrica), visível. Volta
   * com #devolver quando some: nem material nem geometria novos a cada tiro, e nada
   * liberado no meio da partida.
   */
  #pegar(tipo) {
    const o = this.reservas.get(tipo)?.pop() ?? this.fabricas[tipo]();
    o.userData.reserva = tipo;
    o.visible = true;
    return o;
  }

  /** Tira o efeito de onde estiver e guarda na reserva dele. */
  #devolver(o) {
    o.parent?.remove(o);
    const tipo = o.userData.reserva;
    if (!this.reservas.has(tipo)) this.reservas.set(tipo, []);
    this.reservas.get(tipo).push(o);
  }

  /** Brilho solto da reserva (faísca, clarão, partícula de aura; `aditivo` false: fumaça cinza). */
  #brilhoSolto(cor, tamanho, aditivo = true, opacidade = 1) {
    const s = this.#pegar(aditivo ? 'brilho' : 'fumaca');
    s.material.color.set(cor);
    s.material.opacity = opacidade;
    s.scale.setScalar(tamanho);
    return s;
  }

  /**
   * Enche as reservas (RESERVA_INICIAL) na tela de carregamento, com tudo dentro de
   * `grupo` (o do aquecimento: entra no quadro de aquecimento e sai junto).
   */
  preencherReservas(grupo) {
    for (const [tipo, n] of Object.entries(RESERVA_INICIAL)) {
      const lista = this.reservas.get(tipo) ?? [];
      this.reservas.set(tipo, lista);
      for (let i = lista.length; i < n; i++) {
        const o = this.fabricas[tipo]();
        o.userData.reserva = tipo;
        if (o.isPoints) o.geometry.setDrawRange(0, 1);
        grupo.add(o);
        lista.push(o);
      }
    }
  }

  /** Material de tiro de NPC ou de monstro por cor e jeito (dividido por todos os tiros iguais). */
  #matPorCor(jeito, cor) {
    const c = cor instanceof THREE.Color ? cor : new THREE.Color(cor);
    const chave = `${jeito}|${c.getHexString()}`;
    let m = this.matsPorCor.get(chave);
    if (!m) {
      const aditivo = { color: c, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false };
      if (jeito === 'brilho') m = new THREE.SpriteMaterial({ map: brilho(), ...aditivo });
      else m = new THREE.MeshBasicMaterial({ color: c });
      this.matsPorCor.set(chave, m);
    }
    return m;
  }

  /** Anel do pulso do Núcleo com a grossura da força `k` (0 a 1, em 5 degraus). */
  #geoPulso(k) {
    const degrau = Math.round(k * 4) / 4;
    if (!this.geoPulso.has(degrau)) this.geoPulso.set(degrau, new THREE.TorusGeometry(1, 0.02 + 0.03 * degrau, 4, 64));
    return this.geoPulso.get(degrau);
  }

  /**
   * Volta à base canalizando na nave `obj` (grupo do Three.js): `frac` de 0 a 1 enquanto
   * canaliza (null: não canaliza, e o que estava aberto murcha em VOLTA_APAGA_S), `cor` do
   * time de quem canaliza relativa a quem olha. `propria` (a sua nave, com a câmera logo
   * atrás) acende menos, para não cegar a tela. Chamar a cada quadro para cada nave
   * visível (a que some da cena deixa o efeito murchar sozinho).
   */
  recall(obj, frac, cor, dt, tempo, propria = false) {
    const recente = this.tempo - (obj.userData.voltaPartiu ?? -Infinity) < VOLTA_IGNORA_S;
    const ligado = frac !== null && frac !== undefined && !recente;
    let c = this.canais.get(obj);
    if (!ligado) {
      if (c) c.ligado = false;
      return;
    }
    if (!c) {
      const desenho = criarVolta();
      if (!desenho) return;
      this.scene.add(desenho.obj);
      c = { desenho, apaga: 0, t: 0, cor: new THREE.Color(), casco: undefined };
      this.canais.set(obj, c);
    }
    Object.assign(c, { ligado: true, k: frac, brilho: propria ? 0.55 : 1, visto: this.tempo });
    c.cor.copy(cor);
  }

  /** Solta o canal da nave `obj` na hora (devolve o desenho, para quem quiser seguir com ele). */
  #tirarCanal(obj) {
    const c = obj && this.canais.get(obj);
    if (!c) return null;
    this.canais.delete(obj);
    return c.desenho;
  }

  /**
   * A volta à base aconteceu: onde a nave estava (`x`, `y`, `z`, o centro dela), clarão e
   * ela se desfaz em luz para o céu. `obj` é a nave desenhada (null se não se vê): ainda no
   * lugar da partida, a casca sai dela; o círculo e a coluna que já estavam abertos em volta
   * dela seguem daqui, sem pular.
   */
  partidaRecall(obj, x, y, z, cor) {
    const corpo = obj?.userData.tamanho ?? VOLTA_CORPO_PADRAO;
    let desenho = this.#tirarCanal(obj);
    if (obj) obj.userData.voltaPartiu = this.tempo;
    desenho ??= criarVolta();
    if (!desenho) return;
    const ud = obj?.userData;
    const perto = obj?.visible && obj.parent && Math.hypot(obj.position.x - x, obj.position.z - z) < 4 * corpo;
    if (perto) {
      ({ x, y, z } = obj.position);
      this.#ocultarCasco(obj, this.tempo + VOLTA_IGNORA_S / 2); // no lugar dele, a casca se desfaz
    }
    const pe = this.#peDaVolta(perto ? obj : null, x, y, z, corpo);
    montarCasca(desenho, perto ? ud.casco : null); // parada no lugar da partida
    if (!desenho.obj.parent) this.scene.add(desenho.obj);
    const clarao = this.#brilhoSolto(cor, 1, true, 0);
    this.scene.add(clarao);
    this.voltas.push({ tipo: 'partida', obj: null, desenho, clarao, cor: new THREE.Color(cor), corpo, x, y, z, pe, t: 0, brilho: 1 });
  }

  /**
   * A nave chegou na base de volta: o feixe cai do céu e ela se materializa. Segue `obj` (a
   * nave desenhada; sem ela, fica em `x`, `y`, `z`) e esconde o casco de verdade até a luz
   * tomar a forma dele. `atraso` (s): a nave dos outros é desenhada no passado e só chega
   * depois (negativo começa no meio: a tela de carregamento aquece com tudo à mostra).
   * `propria`: a sua, com a câmera logo atrás, acende menos.
   */
  chegadaRecall(obj, x, y, z, cor, atraso = 0, propria = false) {
    const desenho = criarVolta();
    if (!desenho) return;
    this.scene.add(desenho.obj);
    desenho.obj.visible = false;
    const clarao = this.#brilhoSolto(cor, 1, true, 0);
    this.scene.add(clarao);
    if (obj) this.#ocultarCasco(obj, this.tempo + atraso + CASCO_ESCONDIDO_S);
    const corpo = obj?.userData.tamanho ?? VOLTA_CORPO_PADRAO;
    this.voltas.push({ tipo: 'chegada', obj, desenho, clarao, cor: new THREE.Color(cor), corpo, x, y, z, pe: this.#peDaVolta(null, x, y, z, corpo), t: -atraso, brilho: propria ? 0.7 : 1, casco: undefined });
  }

  /** Esconde o casco da nave `obj` até `ate` (no relógio dos efeitos). */
  #ocultarCasco(obj, ate) {
    obj.userData.cascoOcultoAte = Math.max(obj.userData.cascoOcultoAte ?? 0, ate);
    this.ocultos.add(obj);
  }

  /**
   * O pé do efeito da volta (y do círculo): logo abaixo da barriga de `obj` (medida no
   * modelo; sem ele, pelo corpo) e nunca abaixo do chão nem da plataforma.
   */
  #peDaVolta(obj, x, y, z, corpo) {
    let baixo = y - corpo * 0.3;
    const casco = obj?.userData.casco;
    if (casco) {
      caixaVolta.setFromObject(casco);
      if (!caixaVolta.isEmpty()) baixo = caixaVolta.min.y;
    }
    const chao = Math.max(heightAt(x, z), topoPouso(x, z) ?? -Infinity);
    return Math.max(baixo - VOLTA_ABAIXO, chao + VOLTA_PISO);
  }

  /** Um quadro da volta à base: os canais abertos, as partidas, as chegadas e os cascos escondidos. */
  #atualizarVoltas(dt) {
    for (const [obj, c] of this.canais) {
      if (this.tempo - c.visto > 0.2) c.ligado = false; // a nave saiu da cena
      c.apaga = Math.min(1, Math.max(0, c.apaga + ((c.ligado ? 1 : -1) * dt) / VOLTA_APAGA_S));
      if (!c.ligado && c.apaga <= 0) {
        soltarVolta(c.desenho);
        this.canais.delete(obj);
        continue;
      }
      const ud = obj.userData;
      if (c.casco !== ud.casco) montarCasca(c.desenho, (c.casco = ud.casco));
      else seguirCasca(c.desenho);
      const corpo = ud.tamanho ?? VOLTA_CORPO_PADRAO;
      const { x, y, z } = obj.position;
      c.t += dt;
      c.pe = this.#peDaVolta(obj, x, y, z, corpo);
      desenharVolta(c.desenho, quadroCanal(c.k, c.t, c.apaga), { cor: c.cor, corpo, x, y, z, pe: c.pe, dt, brilho: c.brilho });
    }

    this.voltas = this.voltas.filter((v) => {
      v.t += dt;
      const q = v.tipo === 'partida' ? quadroPartida(v.t) : quadroChegada(v.t);
      if (!q) {
        soltarVolta(v.desenho);
        this.#devolver(v.clarao);
        return false;
      }
      if (q.espera) return true;
      v.desenho.obj.visible = true;
      const obj = v.obj;
      if (obj?.parent && obj.visible) {
        // A chegada vai junto com a nave (a casca na forma dela, o casco escondido até materializar).
        ({ x: v.x, y: v.y, z: v.z } = obj.position);
        v.corpo = obj.userData.tamanho ?? v.corpo;
        v.pe = this.#peDaVolta(obj, v.x, v.y, v.z, v.corpo);
        if (v.casco !== obj.userData.casco) montarCasca(v.desenho, (v.casco = obj.userData.casco));
        else seguirCasca(v.desenho);
      } else if (v.casco) montarCasca(v.desenho, (v.casco = null));
      const { x, y, z, pe, corpo } = v;
      desenharVolta(v.desenho, q, { cor: v.cor, corpo, x, y, z, pe, dt, brilho: v.brilho });
      v.clarao.position.set(x, y, z);
      v.clarao.scale.setScalar(q.clarao.tamanho * corpo);
      v.clarao.material.opacity = q.clarao.alfa * v.brilho;
      return true;
    });

    for (const obj of this.ocultos) {
      const ud = obj.userData;
      const oculto = this.tempo < ud.cascoOcultoAte;
      if (ud.casco) ud.casco.visible = !oculto;
      if (!oculto) this.ocultos.delete(obj);
    }
  }

  /** Feixe curto de luz na cor `cor` onde a nave do teleporte sumiu ou apareceu. */
  feixeRecall(x, y, z, cor) {
    const m = this.#pegar('feixe');
    m.material.color.set(cor);
    m.material.opacity = 1;
    m.scale.set(1, 1, 1);
    m.position.set(x, y - 6, z);
    this.scene.add(m);
    this.feixes.push({ m, vida: 0 });
    const s = this.#brilhoSolto(cor, 18);
    s.position.set(x, y, z);
    this.scene.add(s);
    this.auras.push({ s, subida: 0, vida: 0, dur: 0.5, tamanho: 18 });
  }

  /**
   * "Subiu de nível" ou "evoluiu a nave" (`forte`): a luz da raça (`race`) subindo da nave
   * (grupo do Three.js) até o alto da tela, acompanhando-a enquanto voa. Devolve false se
   * o modelo do efeito não chegou ou se a nave acabou de ganhar um (vários níveis juntos):
   * quem chama só toca o som quando devolve true. `t0` começa no meio (a tela de
   * carregamento aquece com todas as peças à mostra).
   */
  subirNivel(obj, race, forte = false, t0 = 0) {
    if (this.subidas.some((s) => s.obj === obj && s.vida < SUBIDA_JUNTA_S)) return false;
    const desenho = criarSubida();
    if (!desenho) return false;
    const cor = new THREE.Color(RACES[race]?.cor ?? RACES.acron.cor);
    const clarao = this.#brilhoSolto(cor, 1, true, 0);
    this.scene.add(desenho.obj, clarao);
    const s = { obj, desenho, clarao, cor, forte, vida: t0 };
    this.subidas.push(s);
    this.#seguirSubida(s, quadroSubida(t0, forte));
    return true;
  }

  /** Põe a subida `s` no lugar da nave e desenha o quadro `q`. */
  #seguirSubida(s, q) {
    const { obj, desenho, clarao } = s;
    const corpo = obj.userData.tamanho ?? SUBIDA_CORPO_PADRAO;
    if (obj.parent) {
      const { x, y, z } = obj.position;
      let baixo = y - corpo * 0.3;
      s.alto = y + corpo * 0.3; // sem modelo medido
      caixaSubida.setFromObject(obj.userData.casco ?? obj.userData.corpo ?? obj);
      if (!caixaSubida.isEmpty()) {
        baixo = caixaSubida.min.y;
        s.alto = caixaSubida.max.y;
      }
      const chao = Math.max(heightAt(x, z), topoPouso(x, z) ?? -Infinity);
      s.pe = Math.max(baixo - SUBIDA_ABAIXO, chao + SUBIDA_PISO);
      desenho.obj.position.set(x, 0, z);
      clarao.position.copy(obj.position);
    }
    desenharSubida(desenho, q, { cor: s.cor, corpo, pe: s.pe, alto: s.alto, t: s.vida });
    clarao.scale.setScalar(q.clarao.tamanho * corpo);
    clarao.material.opacity = q.clarao.alfa;
  }

  /**
   * Mostra na nave (grupo do Three.js) os efeitos ativos vindos do servidor:
   * dreno (aura violeta pulsando + partículas subindo) e lento (aura azul-gelo +
   * cristais caindo), e os bônus dos objetivos (`bonus`: lista de 'ataque',
   * 'suporte', 'sonda', 'medusa'; um anel cada). Chamar a cada quadro para cada
   * nave visível.
   */
  estadoNave(obj, { dreno = false, lento = false, emp = false, bonus = [], fx = [] }, dt, tempo) {
    this.#fxArmas(obj, fx, dt, tempo);
    // O dreno do original (Magma) é o fogo do original, não a aura violeta.
    if (dreno && obj.userData.magmaOriginal) dreno = false;
    this.#bonus(obj, bonus, tempo);
    let a = obj.userData.auras;
    if (!a) {
      if (!dreno && !lento && !emp) return;
      a = obj.userData.auras = {
        dreno: spriteAditivo(COR_DRENO, 11),
        gelo: spriteAditivo(COR_GELO, 13),
        emp: spriteAditivo(COR_EMP, 14),
        acc: 0,
        accEmp: 0,
      };
      efeitosDa(obj).add(a.dreno, a.gelo, a.emp);
    }
    a.dreno.visible = dreno;
    a.gelo.visible = lento;
    a.emp.visible = emp;
    if (dreno) a.dreno.material.opacity = 0.45 + 0.3 * Math.sin(tempo * 9);
    if (lento) a.gelo.material.opacity = 0.5 + 0.1 * Math.sin(tempo * 3);
    // EMP: a aura falha como um curto-circuito (pisca irregular).
    if (emp) a.emp.material.opacity = Math.sin(tempo * 37) * Math.sin(tempo * 23) > 0.1 ? 0.55 : 0.12;
    if (!dreno && !lento && !emp) {
      a.acc = a.accEmp = 0;
      return;
    }
    obj.getWorldPosition(this.v);
    if (dreno || lento) {
      a.acc += dt;
      while (a.acc >= AURA_PARTICULA_S) {
        a.acc -= AURA_PARTICULA_S;
        if (dreno) this.#particula(COR_DRENO, 2, 7, 0.8);
        if (lento) this.#particula(COR_GELO, 1.6, -4, 0.9);
      }
    }
    if (emp) {
      a.accEmp += dt;
      while (a.accEmp >= FAISCA_EMP_S) {
        a.accEmp -= FAISCA_EMP_S;
        this.#particula(Math.random() < 0.5 ? COR_EMP : COR_BRANCO, 1.8 + Math.random() * 2, (Math.random() * 2 - 1) * 6, 0.14, 6);
      }
    }
  }

  /** Anéis dos bônus ativos na nave (criados na primeira vez, escondidos quando acabam). */
  #bonus(obj, bonus, tempo) {
    const ud = obj.userData;
    if (!ud.bonus) {
      if (!bonus?.length) return;
      ud.bonus = {};
    }
    const ativos = new Set(bonus ?? []);
    for (const [nome, def] of Object.entries(ANEIS_BONUS)) {
      let anel = ud.bonus[nome];
      if (!anel) {
        if (!ativos.has(nome)) continue;
        anel = ud.bonus[nome] = anelBonus(def);
        efeitosDa(obj).add(anel);
      }
      anel.visible = ativos.has(nome);
      if (!anel.visible) continue;
      const m = anel.userData.mat;
      if (def.jeito === 'pulsa') m.opacity = BONUS_OPACIDADE * (0.65 + 0.35 * Math.sin(tempo * 3));
      else if (def.jeito === 'abre') {
        const k = (tempo * 0.8) % 1;
        anel.scale.setScalar(0.8 + 0.4 * k);
        m.opacity = BONUS_OPACIDADE * (1 - k);
      } else if (def.jeito === 'arcos') {
        anel.rotation.z = tempo * 2.4;
        m.opacity = BONUS_OPACIDADE;
      } else m.opacity = BONUS_OPACIDADE * (0.55 + 0.2 * Math.sin(tempo * 1.2));
    }
  }

  /**
   * Efeitos das armas do original na nave (lista `fx` do servidor): aura na cor de
   * cada um (paralisia pisca como curto, invulnerável e escudo envolvem a nave,
   * conserto e aceleração soltam partículas), e a camuflagem deixa a nave fantasma.
   */
  #fxArmas(obj, fx, dt, tempo) {
    const ud = obj.userData;
    const ativos = new Set(fx ?? []);
    this.#fantasma(obj, ativos.has('inv'));
    const comIcone = this.#estadosOriginais(obj, ativos, dt);
    if (!ud.fx) {
      if (!ativos.size) return;
      ud.fx = { auras: {}, acc: 0 };
    }
    for (const [k, cor] of Object.entries(COR_FX)) {
      let s = ud.fx.auras[k];
      if (!ativos.has(k) || comIcone.has(k)) {
        if (s) s.visible = false;
        continue;
      }
      if (!s) {
        s = ud.fx.auras[k] = spriteAditivo(cor, k === 'invul' || k === 'escudo' ? 15 : 12);
        efeitosDa(obj).add(s);
      }
      s.visible = true;
      const pisca = k === 'para' ? (Math.sin(tempo * 41) * Math.sin(tempo * 17) > 0 ? 0.6 : 0.15) : 0.35 + 0.15 * Math.sin(tempo * (k === 'invul' ? 5 : 3));
      s.material.opacity = pisca;
    }
    const energia = ativos.has('energia') && !comIcone.has('energia');
    if (!(ativos.has('regen') || ativos.has('acel') || energia)) return;
    obj.getWorldPosition(this.v);
    ud.fx.acc += dt;
    while (ud.fx.acc >= FX_PARTICULA_S) {
      ud.fx.acc -= FX_PARTICULA_S;
      if (ativos.has('regen')) this.#particula(COR_FX.regen, 1.6, 5, 0.8);
      if (energia) this.#particula(COR_FX.energia, 1.4, -5, 0.7);
      if (ativos.has('acel')) this.#particula(COR_FX.acel, 2.2, 0, 0.35, 3);
    }
  }

  /**
   * Estados com efeito do original na nave (CUnit::ChangeEffectFlag): o ícone 3D
   * girando em cima dela, um em cima do outro na ordem de ICONES_ESTADO (dois estados
   * com o mesmo ícone mostram um só), e o fogo do Magma na nave. Devolve os nomes do
   * `fx` que ganharam efeito do original (esses não levam a aura).
   */
  #estadosOriginais(obj, ativos, dt) {
    const ud = obj.userData;
    const feitos = new Set();
    if (!ud.estados) {
      if (!ativos.size) return feitos;
      ud.estados = {};
    }
    const querer = new Map(); // id do efeito -> altura (m)
    let n = 0;
    for (const [k, id] of Object.entries(ICONES_ESTADO)) {
      if (!ativos.has(k) || !efeitoOriginalPronto(id)) continue;
      feitos.add(k);
      if (!querer.has(id)) querer.set(id, ICONE_ALTURA + ICONE_PASSO * n++);
    }
    if (ativos.has('magma') && efeitoOriginalPronto(MAGMA_NA_NAVE)) {
      feitos.add('magma');
      querer.set(MAGMA_NA_NAVE, 0);
    }
    for (const [id, inst] of Object.entries(ud.estados)) {
      if (querer.has(id)) continue;
      soltarEfeitoOriginal(inst);
      delete ud.estados[id];
    }
    for (const [id, altura] of querer) {
      let inst = ud.estados[id];
      if (!inst) {
        inst = ud.estados[id] = criarEfeitoOriginal(id, { escala: ESCALA_ORIGINAL, loop: true });
        efeitosDa(obj).add(inst.obj);
      }
      inst.obj.position.set(0, altura, 0);
      tocarEfeitoOriginal(inst, dt, this.camera);
    }
    ud.magmaOriginal = querer.has(MAGMA_NA_NAVE);
    return feitos;
  }

  /** Nave camuflada (vista por você ou aliado): materiais do casco trocados por um fantasma. */
  #fantasma(obj, ligado) {
    const ud = obj.userData;
    if (!!ud.fantasma === ligado && (!ligado || ud.fantasmaCasco === ud.casco)) return;
    this.matFantasma ??= new THREE.MeshBasicMaterial({ color: '#9fb4c8', transparent: true, opacity: FANTASMA_OPACIDADE, depthWrite: false });
    if (ud.fantasma && ud.fantasmaCasco) {
      for (const [m, mat] of ud.fantasma) m.material = mat;
    }
    ud.fantasma = null;
    ud.fantasmaCasco = null;
    if (!ligado || !ud.casco) return;
    ud.fantasma = new Map();
    ud.fantasmaCasco = ud.casco;
    ud.casco.traverse((o) => {
      if (o.isMesh) {
        ud.fantasma.set(o, o.material);
        o.material = this.matFantasma;
      }
    });
  }

  #particula(cor, tamanho, subida, dur, espalha = 4.5) {
    const s = this.#brilhoSolto(cor, tamanho);
    s.position.set(
      this.v.x + (Math.random() * 2 - 1) * espalha,
      this.v.y + (Math.random() * 2 - 1) * 1.5,
      this.v.z + (Math.random() * 2 - 1) * espalha,
    );
    this.scene.add(s);
    this.auras.push({ s, subida, vida: 0, dur, tamanho });
  }

  /**
   * Anel que abre no plano a partir de (x, y, z) até `raio` m, na cor dada: onda de
   * choque e explosão de mina. Dois anéis (o segundo um pouco atrás) e um clarão.
   */
  anelArea(x, y, z, raio, cor) {
    for (const atraso of [0, 0.08]) {
      const anel = this.#pegar('anelArea');
      anel.material.color.set(cor);
      anel.position.set(x, y, z);
      anel.visible = false;
      this.scene.add(anel);
      this.aneisArea.push({ anel, raio, vida: -atraso });
    }
    const clarao = this.#brilhoSolto(cor, raio * 0.6);
    clarao.position.set(x, y, z);
    this.scene.add(clarao);
    this.aneisArea.push({ anel: clarao, raio, vida: 0, clarao: true });
  }

  /**
   * Minas e campos do snapshot ([{ id, time, kind, nv, p, campo, raio, x, y, z,
   * armada }]): cria os novos, tira os que sumiram (explodiram, venceram, passaram do
   * limite ou foram desarmados). A mina é o disco com a luz do time e o decalque da
   * arma no chão; o campo é só o decalque, do tamanho da área, pulsando. Cor do time
   * relativa a meuTime.
   */
  atualizarMinas(lista, meuTime) {
    const vistas = new Set();
    for (const m of lista ?? []) {
      vistas.add(m.id);
      let v = this.minas.get(m.id);
      if (!v) {
        // Mina ou campo de arma do original de monstro (a armadilha da Medusa, o campo
        // elétrico do SN-4): o efeito do original repetindo; o campo esticado até a área.
        const id = this.#idOriginal(m.kind, 'a', m.p ?? 0) ?? this.#idOriginal(m.kind, 'p', m.p ?? 0);
        if (id) {
          const raio = Math.max(3, m.raio ?? 10);
          const escala = m.campo ? raio / Math.max(1, raioEfeitoOriginal(id)) : ESCALA_TIRO_ORIGINAL;
          const inst = criarEfeitoOriginal(id, { escala, loop: true });
          this.scene.add(inst.obj);
          v = { g: inst.obj, original: inst, campo: true };
          this.minas.set(m.id, v);
        }
      }
      if (!v && m.campo) {
        const g = new THREE.Group();
        const campo = this.armas.campo(m.kind, m.nv, m.p, Math.max(3, m.raio ?? 10));
        const decal = campo.userData.miolo;
        g.add(campo);
        const cor = m.time === meuTime ? COR_TIME.meu : COR_TIME.outro;
        const brilhoCampo = this.#brilhoSolto(cor, 4);
        brilhoCampo.position.set(0, 1.5, 0);
        g.add(brilhoCampo);
        this.scene.add(g);
        v = { g, luz: null, brilho: brilhoCampo, decal, campo: true, fase: Math.random() * Math.PI * 2 };
        this.minas.set(m.id, v);
      }
      if (!v) {
        const cor = m.time === meuTime ? COR_TIME.meu : COR_TIME.outro;
        const g = new THREE.Group();
        if (m.kind) {
          const decal = this.armas.decalque(m.kind, m.nv, m.p, 2.6);
          g.add(decal);
        }
        const corpo = new THREE.Mesh(this.geoMina, this.matMina);
        corpo.position.y = 0.3;
        corpo.castShadow = true;
        g.add(corpo);
        for (let i = 0; i < 4; i++) {
          const esp = new THREE.Mesh(this.geoEspinho, this.matMina);
          const ang = (i * Math.PI) / 2 + Math.PI / 4;
          esp.position.set(Math.cos(ang) * MINA_RAIO_CORPO, 0.35, Math.sin(ang) * MINA_RAIO_CORPO);
          esp.rotation.set(Math.sin(ang) * 1.2, 0, -Math.cos(ang) * 1.2);
          g.add(esp);
        }
        const luz = new THREE.Mesh(this.geoLuzMina, new THREE.MeshStandardMaterial({ color: cor, emissive: cor, emissiveIntensity: 1, flatShading: true }));
        luz.position.y = 0.85;
        g.add(luz);
        const brilhoMina = this.#brilhoSolto(cor, 5);
        brilhoMina.position.set(0, 1, 0);
        g.add(brilhoMina);
        this.scene.add(g);
        v = { g, luz, brilho: brilhoMina, fase: Math.random() * Math.PI * 2 };
        this.minas.set(m.id, v);
      }
      v.g.position.set(m.x, m.y, m.z);
      v.armada = !!m.armada;
    }
    for (const [id, v] of this.minas) {
      if (vistas.has(id)) continue;
      this.minas.delete(id);
      if (v.original) {
        soltarEfeitoOriginal(v.original);
        continue;
      }
      this.scene.remove(v.g);
      // A luz da mina pulsa sozinha (material próprio); o programa dela fica com as
      // outras luzes neon (naves, torres), então liberar não recompila nada.
      v.luz?.material.dispose();
      this.#devolver(v.brilho);
    }
  }

  /**
   * Corrige os mísseis teleguiados com o estado do servidor (lista `guiados` do
   * snapshot): o cliente não prevê a curva, então posição e rumo vêm de lá. Míssil
   * que ainda não estava na tela (entrou agora, ou o evento se perdeu) é criado.
   */
  corrigirGuiados(lista) {
    for (const g of lista ?? []) {
      const t = this.tiros.get(g.id);
      if (!t) {
        // Míssil de monstro (atq), de torre (tiro de NPC sem atq: o evento se perdeu ou
        // entrou agora na visão) ou de arma de jogador.
        const npc = !visualDoOriginal(g.kind);
        const b = { id: g.id, kind: g.kind ?? 'plasma', atq: g.atq, nv: g.nv, p: g.p, x: g.x, y: g.y, z: g.z, vx: g.vx, vy: g.vy, vz: g.vz, vida: 3 };
        if (npc && !g.atq) this.tiro({ ...b, kind: 'missil' }, true);
        else this.tiro(b);
        continue;
      }
      Object.assign(t.b, { x: g.x, y: g.y, z: g.z, vx: g.vx, vy: g.vy, vz: g.vz });
      t.acc = 0;
    }
  }

  #barra(forma) {
    const chave = `${forma.grossura}x${forma.barra}`;
    if (!this.geoBarra.has(chave)) this.geoBarra.set(chave, new THREE.BoxGeometry(forma.grossura, forma.grossura, forma.barra));
    return this.geoBarra.get(chave);
  }

  /**
   * Cria um tiro visual. inimigo = tiro de drone (vermelho); `cor` troca a cor da
   * arma pela do time (tiro de torreta e de escolta: turquesa do seu time,
   * vermelho do outro). Arma do original (b.kind 'o...', com b.nv e b.p): o desenho
   * dela (efeitos-armas.js); `boca` (Vector3) é de onde o desenho sai.
   */
  tiro(b, inimigo = false, cor = null, boca = null) {
    if (b.atq && this.#tiroOriginal(b)) return;
    if (!inimigo && !cor && this.disparo.tiro(b, boca)) return;
    const w = WEAPONS[b.kind];
    // Arma do original: a do jogador, ou a de NPC do original que um monstro usa (o
    // SN-3 e o SN-Zero VI atiram com as armas deles, desenhadas como no original).
    if (visualDoOriginal(b.kind) && (w.original || !inimigo) && !cor) {
      const p = this.armas.projetil(b.kind, b.nv ?? 1, b.p ?? 0);
      p.g.position.set(b.x, b.y, b.z);
      p.g.lookAt(b.x + b.vx, b.y + b.vy, b.z + b.vz);
      this.scene.add(p.g);
      const desvio = boca ? { x: boca.x - b.x, y: boca.y - b.y, z: boca.z - b.z, t: 0 } : null;
      this.tiros.set(b.id, { b, g: p.g, visual: true, guiado: p.guiado, giro: p.giro, onda: p.onda, corRastro: p.rastro, rastro: { x: b.x, y: b.y, z: b.z }, desvio });
      return;
    }
    cor ??= inimigo ? COR_TIRO.inimigo : (COR_TIRO[b.kind] ?? COR_TIRO.laser);
    const forma = FORMA_TIRO[b.kind] ?? FORMA_TIRO.laser;
    const g = new THREE.Group();
    if (forma.barra) {
      const nucleo = new THREE.Mesh(this.#barra(forma), this.#matPorCor('solido', cor.clone().lerp(COR_BRANCO, 0.5)));
      g.add(nucleo);
    }
    if (forma.corpo) {
      // Míssil: casco metálico (o nariz para a frente, +z do grupo depois do lookAt).
      const casco = new THREE.Mesh(this.geoMissil, this.matMissil);
      casco.rotation.x = Math.PI / 2;
      const nariz = new THREE.Mesh(this.geoNarizMissil, this.matMissil);
      nariz.rotation.x = Math.PI / 2;
      nariz.position.z = 1.6;
      g.add(casco, nariz);
    }
    const s = new THREE.Sprite(this.#matPorCor('brilho', cor));
    s.scale.setScalar(forma.brilho);
    if (forma.corpo) s.position.z = -1.5; // a chama fica atrás do casco
    g.add(s);
    g.position.set(b.x, b.y, b.z);
    g.lookAt(b.x + b.vx, b.y + b.vy, b.z + b.vz);
    this.scene.add(g);
    this.tiros.set(b.id, { b, g, guiado: !!forma.corpo, rastro: { x: b.x, y: b.y, z: b.z } });
  }

  /**
   * O id do efeito do original `campo` ('d' clarão, 'p' projétil, 'i' impacto, 'f'
   * fim, 'a' armadilha) do golpe da arma de monstro `kind`, se a arma é de NPC do
   * original e o efeito já está pronto (senão null: quem chama desenha como antes).
   */
  #idOriginal(kind, campo, prof = 0) {
    const w = WEAPONS[kind];
    if (!w?.npc || !w.original) return null;
    const id = golpeDaArma(kind, 1, prof)?.vis?.[campo];
    return id && efeitoOriginalPronto(id) ? id : null;
  }

  /**
   * Tiro de monstro com arma do original: o efeito do projétil do original repetindo,
   * no rumo do tiro. Míssil (com rastro no original) deixa a fumaça na cor do rastro.
   */
  #tiroOriginal(b) {
    const id = this.#idOriginal(b.kind, 'p', b.p ?? 0);
    if (!id) return false;
    const inst = criarEfeitoOriginal(id, { escala: ESCALA_TIRO_ORIGINAL, loop: true });
    const vis = golpeDaArma(b.kind, 1, b.p ?? 0).vis;
    inst.obj.position.set(b.x, b.y, b.z);
    inst.obj.lookAt(b.x + b.vx, b.y + b.vy, b.z + b.vz);
    this.scene.add(inst.obj);
    const missil = vis.tipo === 'missil_com_rastro';
    const corRastro = vis.r ? new THREE.Color(visualEfeito(vis.r)?.cores?.[0] ?? '#8f8a83') : null;
    const pt = particulaOriginal(id);
    const particula = pt?.texs.length ? { texs: pt.texs, tam: pt.raio * 2 * ESCALA_TIRO_ORIGINAL, x: b.x, y: b.y, z: b.z } : null;
    this.tiros.set(b.id, { b, g: inst.obj, original: inst, guiado: missil, corRastro, particula, rastro: { x: b.x, y: b.y, z: b.z } });
    return true;
  }

  /** Solta as partículas do rastro do projétil `t` no caminho andado desde a última. */
  #rastroParticulas(t) {
    const r = t.particula;
    const dist = Math.hypot(t.b.x - r.x, t.b.y - r.y, t.b.z - r.z);
    const n = Math.min(FUMACA_MAX, Math.floor(dist / PARTICULA_PASSO));
    for (let i = 1; i <= n; i++) {
      const k = (i * PARTICULA_PASSO) / dist;
      let s = this.reservaParticulas.pop();
      if (!s) {
        s = new THREE.Sprite(new THREE.SpriteMaterial({ blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
      }
      const mapa = texturaEfeito(r.texs[Math.floor(Math.random() * r.texs.length)]);
      if (s.material.map !== mapa) {
        s.material.map = mapa;
        s.material.needsUpdate = true;
      }
      s.material.opacity = 1;
      s.material.rotation = Math.random() * Math.PI * 2;
      s.position.set(r.x + (t.b.x - r.x) * k, r.y + (t.b.y - r.y) * k, r.z + (t.b.z - r.z) * k);
      s.scale.setScalar(r.tam);
      this.scene.add(s);
      this.particulasRastro.push({ s, vida: 0, tam: r.tam });
      if (this.particulasRastro.length > PARTICULAS_MAX) this.#soltarParticula(this.particulasRastro.shift());
    }
    if (n) Object.assign(r, { x: t.b.x, y: t.b.y, z: t.b.z });
  }

  #soltarParticula(p) {
    this.scene.remove(p.s);
    this.reservaParticulas.push(p.s);
  }

  /** Efeito do original que toca uma vez no ponto (clarão, impacto, fim), na escala `escala`. */
  #umaVez(id, x, y, z, escala = ESCALA_TIRO_ORIGINAL, rumo = null) {
    const inst = criarEfeitoOriginal(id, { escala });
    inst.obj.position.set(x, y, z);
    if (rumo) inst.obj.lookAt(x + rumo.x, y + rumo.y, z + rumo.z);
    this.scene.add(inst.obj);
    this.originais.push({ inst });
  }

  /**
   * Clarão do disparo de um monstro com arma do original, no rumo do tiro; sem o
   * efeito do original, o das armas do jogador.
   */
  claraoMonstro(kind, x, y, z, rumo, nv = 1) {
    const id = this.#idOriginal(kind, 'd');
    if (id) this.#umaVez(id, x, y, z, ESCALA_TIRO_ORIGINAL, rumo);
    else this.armas.clarao(kind, x, y, z, nv);
  }

  /**
   * Impacto de golpe de monstro com arma do original no ponto (o efeito do original
   * fica onde bateu). O mesmo impacto a menos de IMPACTO_JUNTO_M de outro que acabou de
   * nascer (os dez mísseis do SN-4 chegando juntos, a rajada de fogo) não desenha de
   * novo: dez luzes aditivas no mesmo ponto virariam uma mancha branca.
   */
  impactoMonstro(kind, x, y, z, prof = 0) {
    const id = this.#idOriginal(kind, 'i', prof);
    if (id && this.originais.some((o) => o.inst.d.id === id && o.inst.t < IMPACTO_JUNTO_S && o.inst.obj.position.distanceToSquared(this.v.set(x, y, z)) < IMPACTO_JUNTO_M ** 2)) return;
    if (id) this.#umaVez(id, x, y, z, ESCALA_TIRO_ORIGINAL);
    else this.armas.impacto(kind, 1, prof, x, y, z, 3.5);
  }

  /**
   * Explosão de área de monstro com arma do original: o efeito de fim (ou o de
   * impacto) do original, esticado para chegar ao raio da área no maior quadro.
   */
  areaMonstro(kind, x, y, z, raio, prof = 0) {
    const id = this.#idOriginal(kind, 'f', prof) ?? this.#idOriginal(kind, 'i', prof);
    if (id) this.#umaVez(id, x, y, z, raio > 0 ? raio / Math.max(1, raioEfeitoOriginal(id, true)) : ESCALA_TIRO_ORIGINAL);
    else this.armas.area(kind, 1, prof, x, y, z, raio);
  }

  /**
   * Nova de monstro com arma do original (a onda do SN-4): o efeito do projétil do
   * original esticado para chegar ao raio da nova no fim dele.
   */
  novaMonstro(kind, x, y, z, raio, vel, prof = 0) {
    const id = this.#idOriginal(kind, 'p', prof);
    if (id) this.#umaVez(id, x, y, z, raio / Math.max(1, raioEfeitoOriginal(id, true)));
    else this.armas.nova(kind, 1, prof, x, y, z, raio, vel);
  }

  /**
   * Pulso de energia do Núcleo de He-3 (evento 'pulso'): anel que abre do prato do
   * Núcleo até `raio`, mais grosso e mais vermelho quanto maior a `forca` (1 a 2,5),
   * com uma casca clara.
   */
  pulsoNucleo(x, y, z, raio, forca = 1) {
    const k = Math.max(0, Math.min(1, (forca - 1) / 1.5));
    const cor = COR_PULSO.clone().lerp(COR_PULSO_FORTE, k);
    const anel = this.#pegar('pulsoAnel');
    anel.geometry = this.#geoPulso(k);
    anel.material.color.copy(cor);
    anel.position.set(x, y, z);
    this.scene.add(anel);
    this.pulsos.push({ m: anel, vida: 0, raio, anel: true });
    const casca = this.#pegar('pulsoCasca');
    casca.material.color.copy(cor);
    casca.position.set(x, y - 10, z);
    this.scene.add(casca);
    this.pulsos.push({ m: casca, vida: 0, raio, anel: false, forca: 0.18 + 0.12 * k });
  }

  /**
   * Uma baforada do rastro do míssil no ponto dado: fumaça cinza sem brilho ou, com
   * a cor do rastro do original (`cor`), luz aditiva naquela cor.
   */
  #fumaca(x, y, z, cor = null) {
    const s = this.#brilhoSolto(cor ?? COR_FUMACA, 2, !!cor, 0.7);
    s.position.set(x, y, z);
    this.scene.add(s);
    this.fumacas.push({ s, vida: 0 });
  }

  removerTiro(id) {
    const t = this.tiros.get(id);
    if (!t) return null;
    this.scene.remove(t.g);
    if (t.visual) this.armas.soltarProjetil(t.g);
    if (t.original) soltarEfeitoOriginal(t.original);
    this.tiros.delete(id);
    return t.b;
  }

  /** Clarão rápido + fagulhas. tamanho 1 = faísca de acerto, ~4 = explosão de nave. */
  explosao(x, y, z, tamanho = 1, cor = '#ffb050') {
    const flash = this.#brilhoSolto(cor, tamanho * 6 * 0.4);
    flash.position.set(x, y, z);
    this.scene.add(flash);
    const n = Math.min(FAISCAS_MAX, Math.round(14 * tamanho));
    const pts = this.#pegar('faiscas');
    const atr = pts.geometry.attributes.position;
    const vel = [];
    for (let i = 0; i < n; i++) {
      atr.array.set([x, y, z], i * 3);
      const v = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 1.6 - 0.3, Math.random() * 2 - 1)
        .normalize()
        .multiplyScalar((8 + Math.random() * 18) * Math.sqrt(tamanho));
      vel.push(v);
    }
    atr.needsUpdate = true;
    pts.geometry.setDrawRange(0, n);
    pts.material.size = 0.5 + tamanho * 0.25;
    pts.material.opacity = 1;
    this.scene.add(pts);
    this.particulas.push({ flash, pts, vel, vida: 0, dur: 0.35 + tamanho * 0.25, tamanho });
  }

  /**
   * Avança tiros e partículas. aoAvancar(b) pode devolver o alvo ({ id, obj, raio })
   * para o tiro sumir (usado no tiro do próprio jogador, que some ao encostar num alvo
   * na tela; a arma de início desenha o impacto nele na hora).
   */
  atualizar(dt, aoAvancar) {
    for (const [id, t] of this.tiros) {
      let vivo = true;
      let tocou = false;
      // Tiros andam no mesmo passo fixo da simulação, para bater com o servidor.
      t.acc = (t.acc ?? 0) + dt;
      while (vivo && t.acc >= 1 / 30) {
        t.acc -= 1 / 30;
        vivo = stepBullet(t.b);
        const alvo = vivo && aoAvancar?.(t.b);
        if (alvo) {
          vivo = false;
          tocou = true;
          // Arma de início: o impacto do original no casco do alvo; as outras, a faísca.
          if (!(t.armaInicio && this.disparo.impactoLocal(t, alvo))) this.explosao(t.b.x, t.b.y, t.b.z, 0.6, '#9ff');
        }
      }
      if (!vivo) {
        // Parou antes da vida acabar: bateu no chão, numa construção ou no campo.
        if (t.armaInicio) {
          if (!tocou && t.b.vida > 0) this.disparo.bateu(t);
        } else if (t.b.vida > 0 && !t.visual) this.explosao(t.b.x, t.b.y, t.b.z, 0.4, '#ffcf90');
        this.removerTiro(id);
        continue;
      }
      t.g.position.set(t.b.x, t.b.y, t.b.z);
      if (t.desvio) {
        // Sai da boca da arma e encontra a linha do tiro de verdade.
        t.desvio.t += dt;
        const k = Math.max(0, 1 - t.desvio.t / DESVIO_S);
        if (k > 0) t.g.position.add(this.v.set(t.desvio.x * k, t.desvio.y * k, t.desvio.z * k));
        else t.desvio = null;
      }
      if (t.visual) {
        this.armas.animarProjetil(t, dt);
        if (t.b.vx || t.b.vz) t.g.lookAt(t.g.position.x + t.b.vx, t.g.position.y + t.b.vy, t.g.position.z + t.b.vz);
      }
      if (t.original) {
        if (t.b.vx || t.b.vz) t.g.lookAt(t.g.position.x + t.b.vx, t.g.position.y + t.b.vy, t.g.position.z + t.b.vz);
        tocarEfeitoOriginal(t.original, dt, this.camera);
        if (t.particula) this.#rastroParticulas(t);
      }
      if (t.guiado) {
        // O míssil vira com a curva e deixa fumaça para trás.
        t.g.lookAt(t.b.x + t.b.vx, t.b.y + t.b.vy, t.b.z + t.b.vz);
        const r = t.rastro;
        const dist = Math.hypot(t.b.x - r.x, t.b.y - r.y, t.b.z - r.z);
        const n = Math.min(FUMACA_MAX, Math.floor(dist / FUMACA_PASSO));
        for (let i = 1; i <= n; i++) {
          const k = (i * FUMACA_PASSO) / dist;
          this.#fumaca(r.x + (t.b.x - r.x) * k, r.y + (t.b.y - r.y) * k, r.z + (t.b.z - r.z) * k, t.corRastro);
        }
        if (n) Object.assign(r, { x: t.b.x, y: t.b.y, z: t.b.z });
      }
    }

    this.tempo += dt;
    this.#atualizarVoltas(dt);
    this.armas.atualizar(dt);
    this.disparo.atualizar(dt, this.camera);
    for (const m of this.minas.values()) {
      if (m.original) {
        tocarEfeitoOriginal(m.original, dt, this.camera);
        continue;
      }
      // Pulsa devagar enquanto não arma e rápido armada; o decalque gira devagar.
      const f = m.armada ? MINA_PISCA.armada : MINA_PISCA.desarmada;
      const k = 0.5 + 0.5 * Math.sin(this.tempo * f * Math.PI * 2 + m.fase);
      if (m.luz) m.luz.material.emissiveIntensity = m.armada ? 0.2 + k : 0.15 + 0.5 * k;
      m.brilho.material.opacity = m.armada ? 0.25 + 0.75 * k : 0.12 + 0.3 * k;
      if (m.decal) m.decal.rotation.y += dt * (m.campo ? 0.4 : 1.2);
    }

    this.aneisArea = this.aneisArea.filter((a) => {
      a.vida += dt;
      const k = a.vida / ANEL_AREA_S;
      if (k >= 1) {
        this.#devolver(a.anel);
        return false;
      }
      if (k < 0) return true;
      a.anel.visible = true;
      const sai = 1 - (1 - k) * (1 - k);
      if (a.clarao) {
        a.anel.material.opacity = (1 - k) * 0.6;
      } else {
        a.anel.scale.setScalar(Math.max(0.5, a.raio * sai));
        a.anel.material.opacity = (1 - k) * 0.9;
      }
      return true;
    });

    this.particulasRastro = this.particulasRastro.filter((p) => {
      p.vida += dt;
      const k = p.vida / PARTICULA_S;
      if (k >= 1) {
        this.#soltarParticula(p);
        return false;
      }
      p.s.scale.setScalar(p.tam * (1 + (PARTICULA_CRESCE - 1) * k));
      p.s.material.opacity = 1 - k;
      return true;
    });

    this.originais = this.originais.filter((o) => {
      if (tocarEfeitoOriginal(o.inst, dt, this.camera)) return true;
      soltarEfeitoOriginal(o.inst);
      return false;
    });

    this.pulsos = this.pulsos.filter((p) => {
      p.vida += dt;
      const k = p.vida / PULSO_S;
      if (k >= 1) {
        this.#devolver(p.m);
        return false;
      }
      const sai = 1 - (1 - k) * (1 - k);
      const r = PULSO_RAIO_INICIO + (p.raio - PULSO_RAIO_INICIO) * sai;
      if (p.anel) {
        p.m.scale.setScalar(r);
        p.m.material.opacity = 0.95 * (1 - k);
      } else {
        p.m.scale.set(r, r * 0.35, r);
        p.m.material.opacity = p.forca * (1 - k);
      }
      return true;
    });

    this.feixes = this.feixes.filter((f) => {
      f.vida += dt;
      const k = f.vida / TELEPORTE_FEIXE_S;
      if (k >= 1) {
        this.#devolver(f.m);
        return false;
      }
      // Sobe alto num instante e afina até sumir.
      const raio = TELEPORTE_FEIXE_RAIO * (1 - k) * 1.2;
      f.m.scale.set(Math.max(0.2, raio), TELEPORTE_FEIXE_ALTURA * 2 * Math.min(1, k * 5), Math.max(0.2, raio));
      f.m.material.opacity = 0.9 * (1 - k);
      return true;
    });

    this.fumacas = this.fumacas.filter((p) => {
      p.vida += dt;
      const k = p.vida / FUMACA_DUR;
      if (k >= 1) {
        this.#devolver(p.s);
        return false;
      }
      p.s.position.y += 1.5 * dt;
      p.s.scale.setScalar(2 + 5 * k);
      p.s.material.opacity = 0.7 * (1 - k);
      return true;
    });

    // A subida vai junto com a nave (a nave que saiu da cena ou foi desfeita deixa o
    // efeito acabar onde estava).
    this.subidas = this.subidas.filter((s) => {
      s.vida += dt;
      const q = quadroSubida(s.vida, s.forte);
      if (q) {
        this.#seguirSubida(s, q);
        return true;
      }
      soltarSubida(s.desenho);
      this.#devolver(s.clarao);
      return false;
    });

    this.auras = this.auras.filter((p) => {
      p.vida += dt;
      const k = p.vida / p.dur;
      if (k >= 1) {
        this.#devolver(p.s);
        return false;
      }
      p.s.position.y += p.subida * dt;
      p.s.material.opacity = 1 - k;
      p.s.scale.setScalar(p.tamanho * (1 - k * 0.5));
      return true;
    });

    this.particulas = this.particulas.filter((p) => {
      p.vida += dt;
      const k = p.vida / p.dur;
      if (k >= 1) {
        this.#devolver(p.flash);
        this.#devolver(p.pts);
        return false;
      }
      p.flash.scale.setScalar(p.tamanho * 6 * (0.4 + k * 1.6));
      p.flash.material.opacity = 1 - k;
      const arr = p.pts.geometry.attributes.position.array;
      for (let i = 0; i < p.vel.length; i++) {
        p.vel[i].y -= 18 * dt;
        arr[i * 3] += p.vel[i].x * dt;
        arr[i * 3 + 1] += p.vel[i].y * dt;
        arr[i * 3 + 2] += p.vel[i].z * dt;
      }
      p.pts.geometry.attributes.position.needsUpdate = true;
      p.pts.material.opacity = 1 - k;
      return true;
    });
  }
}
