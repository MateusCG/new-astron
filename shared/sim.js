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
// Construções (hangares, portal, antenas em shared/obstaculos.js) contam como
// parede do mesmo jeito, engordadas pelo raio da nave.
//
// Pouso (tecla L): também como no AstroN, a nave pode descer até o chão, mas só
// dentro de uma área de pouso (AREAS_POUSO em terrain.js) e, se a área é de um time
// (anel da base, Evolução, Loja), só se for do time da nave (s.time; ver
// pousoPermitido). O time vai junto no estado da nave, então servidor e predição
// decidem igual. Pousada ela
// não atira nem dá boost, gira devagar e se recupera mais rápido (energia aqui, vida
// no servidor). Só o L decola de novo; acelerar pousada não faz nada. A nave freia
// antes de tocar o chão: só desce de vez abaixo de VEL_TOQUE.

import { heightAt, areaPouso, topoPouso, BASES } from './terrain.js';
import { alturaSolida } from './obstaculos.js';

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

// Armas: a nave tem DUAS, cada uma num encaixe (Z e X). Não existe arma principal
// nem secundária: os dois encaixes são iguais e aceitam qualquer arma do catálogo
// (ARMAS), inclusive a mesma nos dois. Cada encaixe tem a sua recarga (cd1 para o
// Z, cd2 para o X), então a mesma arma nos dois dispara pelos dois; a ENERGIA é uma
// só e as duas gastam dela, e é isso que segura o abuso (dois lasers simples gastam
// quase três vezes o que a nave regenera).
//
// Nenhuma arma é estritamente melhor: o laser simples tem o maior dano por segundo
// num alvo só; as outras trocam dano por outra coisa.
// - Laser duplo: dois projéteis paralelos, um de cada lado do nariz (LASER_DUPLO_VAO
//   m do eixo). Faixa mais larga, mais fácil de acertar, mas menos dano e mais gasto.
// - Laser triplo: leque de três projéteis (um reto e dois abertos LASER_TRIPLO_ANGULO
//   rad). Pega quem desvia e mais de um alvo; de perto os três acertam, de longe um só.
// - Dreno: pouco dano no impacto, mas o alvo perde DRENO_DPS de vida por segundo
//   durante DRENO_DURACAO s. Acertar de novo renova a duração, não soma (sem
//   empilhar). Quem aplica o dreno é o servidor, a cada tick; o abate fica com quem
//   atirou. Gasta menos energia do que a nave regenera: dá para atirar sem parar.
// - Criogênico: pouco dano, mas o alvo voa a CRIO_LENTIDAO da velocidade máxima por
//   CRIO_DURACAO s (s.lento, usado aqui em stepShip para a predição bater).
// - Plasma: lento, caro e de recarga longa, mas o maior dano por projétil.
// - Míssil teleguiado: lento e de recarga longa; em voo, vira até MISSIL_GIRO rad/s
//   para o inimigo mais perto que estiver num cone de ±MISSIL_CONE rad à frente dele,
//   até MISSIL_ALCANCE m. Quem escolhe o alvo e faz a curva é só o servidor (o
//   cliente desenha o míssil pelos eventos e pelo snapshot, sem prever).
// - Mina: fica parada no chão, MINA_ATRAS m atrás da nave; arma depois de
//   MINA_ARMA_S s e explode quando um inimigo passa a MINA_GATILHO m, com dano em
//   área (MINA_AREA m) em todos os inimigos. Até MINA_MAX por piloto (soltar mais uma
//   tira a mais velha) e some sozinha depois de MINA_VIDA_S s.
// - Onda de choque: na hora, sem projétil, fere todos os inimigos a CHOQUE_AREA m
//   em volta da nave e os empurra para fora (CHOQUE_EMPURRAO m/s). Curto alcance e
//   muita energia.
// - Pulso EMP: projétil de quase nenhum dano que, ao acertar, zera a energia do alvo
//   e o deixa sem tiro e sem boost por EMP_DURACAO s (s.emp, lido aqui em stepShip,
//   então a predição bate). Em monstro: sem tiro, sem garra e sem cuspe pelo mesmo
//   tempo. Em minerador: fica parado (e não minera) pelo mesmo tempo.
export const LASER_DUPLO_VAO = 2.5; // m do eixo até cada cano
export const LASER_DUPLO_DANO = 7; // por projétil (o simples tira 12)
export const LASER_DUPLO_CD = 0.2; // s (o simples recarrega em 0,16)
export const LASER_DUPLO_ENERGIA = 3; // por disparo, os dois projéteis juntos (o simples gasta 2)
export const LASER_TRIPLO_ANGULO = 0.1; // rad (~6°) entre o projétil do meio e cada lado
export const LASER_TRIPLO_DANO = 5; // por projétil
export const LASER_TRIPLO_CD = 0.24;
export const LASER_TRIPLO_ENERGIA = 4; // por disparo, os três juntos
export const DRENO_DANO = 5; // no impacto
export const DRENO_DPS = 8; // vida por segundo enquanto drena
export const DRENO_DURACAO = 4; // s; acertar de novo volta para este valor
export const DRENO_CD = 0.45;
export const DRENO_ENERGIA = 4;
export const CRIO_DANO = 6;
export const CRIO_LENTIDAO = 0.5; // fração da velocidade máxima enquanto lento
export const CRIO_DURACAO = 3; // s; acertar de novo volta para este valor
export const CRIO_CD = 0.3;
export const CRIO_ENERGIA = 3;
export const PLASMA_DANO = 42;
export const PLASMA_CD = 0.9;
export const PLASMA_ENERGIA = 14;
export const MISSIL_DANO = 28;
export const MISSIL_CD = 1.5;
export const MISSIL_ENERGIA = 12;
export const MISSIL_VEL = 150; // m/s (o laser voa a 340): dá para fugir dele com boost
export const MISSIL_VIDA = 3; // s de voo
export const MISSIL_CONE = 0.6; // rad (~34°) para cada lado do rumo do míssil
export const MISSIL_ALCANCE = 280; // m: só persegue quem está até aqui
export const MISSIL_GIRO = 1.8; // rad/s: curva máxima (raio de ~80 m)
export const MINA_DANO = 50; // em cada inimigo na área
export const MINA_CD = 1.2;
export const MINA_ENERGIA = 10;
export const MINA_ATRAS = 9; // m atrás do centro da nave, onde ela fica
export const MINA_ARMA_S = 1; // s até armar (antes disso não explode)
export const MINA_GATILHO = 14; // m: inimigo a esta distância (no plano) explode a mina
export const MINA_AREA = 22; // m: raio do dano da explosão
export const MINA_VIDA_S = 30; // s: depois disso some sem explodir
export const MINA_MAX = 3; // minas ativas por piloto
export const CHOQUE_DANO = 20; // em cada inimigo na área
export const CHOQUE_CD = 1.6;
export const CHOQUE_ENERGIA = 16;
export const CHOQUE_AREA = 30; // m em volta da nave
export const CHOQUE_EMPURRAO = 55; // m/s somados à velocidade do alvo, para fora
export const EMP_DANO = 4;
export const EMP_CD = 1.8;
export const EMP_ENERGIA = 12;
export const EMP_DURACAO = 2.5; // s sem tiro e sem boost; acertar de novo volta para este valor
/** Diferença de altura (m) até onde área (mina e choque) ainda pega. */
export const AREA_ALTURA = 12;

// Troca de arma: trocar a arma de um encaixe fora da própria base põe AQUELE
// encaixe em recarga de troca por TROCA_ARMA_S (s.troca1 no Z, s.troca2 no X): sem
// tiro nele e sem nova troca nele até acabar (o outro encaixe segue normal). Sem
// isso dava para trocar no meio da luta a cada tiro e a build não pesava nada.
// Dentro da própria base (raio de BASES[s.time]) a troca é livre e a recarga de
// troca zera. Nave sem time (monstros, testes) troca livre, como no pouso. Fica no
// estado da nave e roda no stepShip, então a predição bate com o servidor.
export const TROCA_ARMA_S = 3;

/**
 * Catálogo de armas (as mesmas para os dois encaixes). tipo: sem tipo é projétil
 * (createBullet); 'mina' e 'choque' não têm projétil e o servidor resolve na hora.
 * tipoDano: 'laser', 'fisico' ou 'eletrico' (o tipo de dano do documento de design;
 * o campo não se chama `tipo` porque `tipo` já diz a forma: mina ou choque). funcao:
 * 'dano' ou 'controle' (as de debuff: dreno, lento, empurrão, EMP; na Loja, evoluir
 * uma de controle também aumenta o efeito, ver shared/loja.js). Por enquanto
 * tipoDano é só informação no menu e na Loja: a armadura por tipo de dano (resistir
 * mais a laser, por exemplo) fica para depois.
 * Projétil: por disparo saem projéteis em cada combinação de canos (deslocamento
 * lateral em m, + = direita) e leque (ângulo em rad, + = esquerda, como o yaw); sem
 * os dois, um projétil só, reto pelo nariz. energia é por disparo. efeito é aplicado
 * pelo servidor em quem o projétil acerta; guiado diz que o servidor faz a curva.
 */
export const WEAPONS = {
  laser: { nome: 'Laser simples', tipoDano: 'laser', funcao: 'dano', dano: 12, vel: 340, cd: 0.16, energia: 2, vida: 1.3, raio: 5 },
  laserDuplo: {
    nome: 'Laser duplo',
    tipoDano: 'laser',
    funcao: 'dano',
    dano: LASER_DUPLO_DANO,
    vel: 340,
    cd: LASER_DUPLO_CD,
    energia: LASER_DUPLO_ENERGIA,
    vida: 1.3,
    raio: 4,
    canos: [-LASER_DUPLO_VAO, LASER_DUPLO_VAO],
  },
  laserTriplo: {
    nome: 'Laser triplo',
    tipoDano: 'laser',
    funcao: 'dano',
    dano: LASER_TRIPLO_DANO,
    vel: 340,
    cd: LASER_TRIPLO_CD,
    energia: LASER_TRIPLO_ENERGIA,
    vida: 1.1,
    raio: 4,
    leque: [LASER_TRIPLO_ANGULO, 0, -LASER_TRIPLO_ANGULO],
  },
  dreno: {
    nome: 'Dreno',
    tipoDano: 'eletrico',
    funcao: 'controle',
    dano: DRENO_DANO,
    vel: 260,
    cd: DRENO_CD,
    energia: DRENO_ENERGIA,
    vida: 1.6,
    raio: 5.5,
    efeito: { tipo: 'dreno', dps: DRENO_DPS, duracao: DRENO_DURACAO },
  },
  crio: {
    nome: 'Criogênico',
    tipoDano: 'fisico',
    funcao: 'controle',
    dano: CRIO_DANO,
    vel: 300,
    cd: CRIO_CD,
    energia: CRIO_ENERGIA,
    vida: 1.4,
    raio: 5,
    efeito: { tipo: 'lento', mult: CRIO_LENTIDAO, duracao: CRIO_DURACAO },
  },
  plasma: { nome: 'Plasma', tipoDano: 'eletrico', funcao: 'dano', dano: PLASMA_DANO, vel: 190, cd: PLASMA_CD, energia: PLASMA_ENERGIA, vida: 2.2, raio: 6.5 },
  missil: {
    nome: 'Míssil teleguiado',
    tipoDano: 'fisico',
    funcao: 'dano',
    dano: MISSIL_DANO,
    vel: MISSIL_VEL,
    cd: MISSIL_CD,
    energia: MISSIL_ENERGIA,
    vida: MISSIL_VIDA,
    raio: 5,
    guiado: { cone: MISSIL_CONE, alcance: MISSIL_ALCANCE, giro: MISSIL_GIRO },
  },
  mina: {
    nome: 'Mina',
    tipoDano: 'fisico',
    funcao: 'dano',
    tipo: 'mina',
    dano: MINA_DANO,
    cd: MINA_CD,
    energia: MINA_ENERGIA,
    area: MINA_AREA,
    gatilho: MINA_GATILHO,
    armaS: MINA_ARMA_S,
    vidaS: MINA_VIDA_S,
    max: MINA_MAX,
    atras: MINA_ATRAS,
  },
  choque: {
    nome: 'Onda de choque',
    tipoDano: 'fisico',
    funcao: 'controle',
    tipo: 'choque',
    dano: CHOQUE_DANO,
    cd: CHOQUE_CD,
    energia: CHOQUE_ENERGIA,
    area: CHOQUE_AREA,
    empurrao: CHOQUE_EMPURRAO,
  },
  emp: {
    nome: 'Pulso EMP',
    tipoDano: 'eletrico',
    funcao: 'controle',
    dano: EMP_DANO,
    vel: 240,
    cd: EMP_CD,
    energia: EMP_ENERGIA,
    vida: 1.5,
    raio: 6,
    efeito: { tipo: 'emp', duracao: EMP_DURACAO },
  },
};

/**
 * Catálogo na ordem do menu (teclas 1 a 9 e 0): os campos `a` (encaixe do Z) e `a2`
 * (encaixe do X) do comando são índices aqui. Arma nova entra no fim, para não
 * mudar o índice das outras.
 */
export const ARMAS = ['laser', 'laserDuplo', 'laserTriplo', 'dreno', 'crio', 'plasma', 'missil', 'mina', 'choque', 'emp'];

/** Índice de cada arma no catálogo (ex.: IDX_ARMA.plasma). */
export const IDX_ARMA = Object.fromEntries(ARMAS.map((k, i) => [k, i]));

/** Os encaixes da nave: 0 = Z, 1 = X. Arma padrão de cada um: laser simples e plasma. */
export const ENCAIXE_PADRAO = [IDX_ARMA.laser, IDX_ARMA.plasma];

/**
 * Armas de fábrica: toda nave tem e nunca perde (são as padrão dos encaixes, para o
 * "cai no padrão" sempre ter uma arma que funciona).
 */
export const ARMAS_INICIAIS = [...ENCAIXE_PADRAO];

/** Nome de cada tipo de dano e de cada função, para o menu e a Loja. */
export const TIPOS_DANO = { laser: 'Laser', fisico: 'Físico', eletrico: 'Elétrico' };
export const FUNCOES_ARMA = { dano: 'Dano', controle: 'Controle' };

/** Todas as armas do catálogo (índices). Nave sem dono (createShip) nasce com todas. */
export const TODAS_AS_ARMAS = ARMAS.map((_, i) => i);

/** Índice de arma válido para o encaixe; qualquer outra coisa vira a padrão dele. */
export function armaValida(a, encaixe = 0) {
  return Number.isInteger(a) && a >= 0 && a < ARMAS.length ? a : ENCAIXE_PADRAO[encaixe] ?? ENCAIXE_PADRAO[0];
}

/**
 * A nave pode usar a arma de índice a? Olha s.armas (as armas que o piloto possui);
 * as de fábrica (ARMAS_INICIAIS) são sempre liberadas. A Loja põe o índice
 * comprado na posse do jogador, que o servidor copia para s.armas a cada nave nova.
 */
export function possuiArma(s, a) {
  return ARMAS_INICIAIS.includes(a) || !s.armas || s.armas.includes(a);
}

/** Arma que o encaixe usa de fato: a pedida, se válida e possuída; senão a padrão. */
export function armaDoEncaixe(s, pedida, encaixe) {
  const a = armaValida(pedida, encaixe);
  return possuiArma(s, a) ? a : ENCAIXE_PADRAO[encaixe];
}

/**
 * A nave está dentro da própria base (raio de BASES[s.time]), onde trocar de arma é
 * livre? Nave sem time conta como dentro (troca livre fora da partida).
 */
export function trocaLivre(s) {
  const b = BASES[s.time];
  if (s.time === undefined || !b) return true;
  return Math.hypot(s.x - b.x, s.z - b.z) <= b.raio;
}

/**
 * A nave pode pousar onde está? Só dentro de uma área de pouso; o anel da base e os
 * serviços (Evolução, Loja) só aceitam o próprio time. Área sem dono (objetivo A)
 * aceita qualquer um, e nave sem time (fora da partida) pousa em qualquer área.
 */
export function pousoPermitido(s) {
  const a = areaPouso(s.x, s.z);
  if (!a) return false;
  const dono = a.base ?? a.time;
  return dono === undefined || s.time === undefined || dono === s.time;
}

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
    troca1: 0, // s de recarga de troca do Z (TROCA_ARMA_S): sem tiro e sem troca nele
    troca2: 0, // o mesmo no X
    encaixes: [...ENCAIXE_PADRAO], // arma (índice em ARMAS) no Z e no X
    // Armas que a nave pode usar (ver possuiArma). Sem restrição aqui (monstros,
    // mineradores, testes); a nave de jogador recebe a posse do piloto no World
    // (só as de fábrica e as compradas na Loja: server/servicos.js).
    armas: [...TODAS_AS_ARMAS],
    velMult: 1, // multiplicador da velocidade máxima (evolução do motor, armadura pesada)
    lento: 0, // segundos restantes de lentidão (tiro criogênico); o servidor põe no acerto
    lentoMult: CRIO_LENTIDAO, // fração da velocidade enquanto lento (o nível do criogênico de quem acertou a abaixa)
    emp: 0, // segundos restantes sem tiro e sem boost (pulso EMP); o servidor põe no acerto
    boost: false,
    boostTravado: false,
    pousado: false,
    pAnt: false,
  };
}

/** Comando vazio (nave solta). */
export const INPUT_VAZIO = { th: 0, tu: 0, b: false, f1: false, f2: false, p: false, r: false, a: ENCAIXE_PADRAO[0], a2: ENCAIXE_PADRAO[1] };

/** Normaliza um comando vindo da rede: nunca confie no cliente. */
export function sanitizeInput(i) {
  return {
    th: clamp(Number(i?.th) || 0, -1, 1),
    tu: clamp(Number(i?.tu) || 0, -1, 1),
    b: !!i?.b,
    f1: !!i?.f1,
    f2: !!i?.f2,
    p: !!i?.p,
    r: !!i?.r, // recall (B): pulso; só o servidor lê (shared/recall.js), o stepShip não
    a: armaValida(i?.a, 0),
    a2: armaValida(i?.a2, 1),
  };
}

function bloqueado(gAtual, x, z, passo) {
  if (passo < 1e-6) return false;
  return (alturaSolida(x, z, SHIP_RADIUS) - gAtual) / passo > MAX_SLOPE;
}

/**
 * Avança a nave um passo DT com o comando dado. Retorna os disparos deste passo,
 * como [{ kind, off, ang }] (kind = chave de WEAPONS, off = deslocamento lateral
 * em metros, ang = desvio do rumo em rad), para quem
 * chamou criar cada tiro com createBullet (ou, se WEAPONS[kind].tipo, resolver a
 * mina ou a onda de choque).
 */
export function stepShip(s, inp, dt = DT) {
  const raca = RACES[s.race];
  // As armas dos dois encaixes vêm no comando (a = Z, a2 = X) a cada passo, para
  // predição e servidor trocarem no mesmo passo. A recarga do tiro é do encaixe,
  // não da arma: trocar de arma não zera a espera do tiro. Arma que a nave não
  // possui (ou índice ruim) cai na padrão do encaixe. Fora da própria base, trocar
  // põe o encaixe em recarga de troca (TROCA_ARMA_S); pedir outra troca enquanto
  // ela conta é ignorado (a nave fica com a arma que tem).
  const livre = trocaLivre(s);
  if (livre) s.troca1 = s.troca2 = 0;
  const encaixes = s.encaixes ?? ENCAIXE_PADRAO;
  s.encaixes = [0, 1].map((enc) => {
    const atual = encaixes[enc];
    const pedida = armaDoEncaixe(s, enc === 0 ? inp.a : inp.a2, enc);
    if (pedida === atual) return atual;
    // A arma do encaixe deixou de ser possuída (não acontece no jogo): volta à padrão sem recarga.
    if (!possuiArma(s, atual)) return ENCAIXE_PADRAO[enc];
    if (livre) return pedida;
    const troca = enc === 0 ? 'troca1' : 'troca2';
    if (s[troca] > 0) return atual;
    s[troca] = TROCA_ARMA_S;
    return pedida;
  });
  // Pulso EMP: sem tiro e sem boost enquanto durar (o servidor zerou a energia).
  const semSistemas = s.emp > 0;
  s.emp = Math.max(0, (s.emp || 0) - dt);
  // Pouso alterna na borda do botão (apertou agora), para segurar L não ficar
  // pousando e decolando sem parar.
  if (inp.p && !s.pAnt) s.pousado = s.pousado ? false : pousoPermitido(s);
  s.pAnt = !!inp.p;
  // Se ainda freando ela escorregar para fora da área, o pouso é cancelado.
  if (s.pousado && !pousoPermitido(s)) s.pousado = false;
  const pousado = s.pousado;
  // Energia zerada no boost trava o boost até soltar o botão; sem isso ele piscaria
  // liga/desliga a cada passo com a energia que regenera.
  if (!inp.b) s.boostTravado = false;
  const querBoost = !pousado && !semSistemas && inp.b && inp.th > 0 && s.en > 0 && !s.boostTravado;
  s.boost = querBoost;
  // s.velMult: evolução de motor e armadura pesada (o servidor põe; vai no `me`).
  // s.lentoMult: força do lento de quem acertou (o servidor põe no acerto; vai no `me`).
  const lento = s.lento > 0 ? (s.lentoMult ?? CRIO_LENTIDAO) : 1;
  const maxV = raca.velocidade * VEL_FATOR * (s.velMult ?? 1) * (querBoost ? BOOST_MULT : 1) * lento;
  s.lento = Math.max(0, (s.lento || 0) - dt);

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
  const g = alturaSolida(s.x, s.z, SHIP_RADIUS);
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
  s.troca1 = Math.max(0, (s.troca1 || 0) - dt);
  s.troca2 = Math.max(0, (s.troca2 || 0) - dt);
  const disparos = [];
  if (pousado || semSistemas) return disparos;
  // Z primeiro, depois X, cada um com a sua recarga e gastando da mesma energia.
  // Encaixe em recarga de troca não atira.
  for (const [encaixe, aperto, cd, troca] of [
    [0, inp.f1, 'cd1', 'troca1'],
    [1, inp.f2, 'cd2', 'troca2'],
  ]) {
    const kind = ARMAS[s.encaixes[encaixe]];
    const w = WEAPONS[kind];
    if (!aperto || s[cd] > 0 || s[troca] > 0 || s.en < w.energia) continue;
    s[cd] = w.cd;
    s.en -= w.energia;
    for (const off of w.canos ?? [0]) {
      for (const ang of w.leque ?? [0]) disparos.push({ kind, off, ang });
    }
  }
  return disparos;
}

/**
 * Cria um tiro saindo do nariz da nave, deslocado off metros para o lado (+ =
 * direita da nave) e desviado ang rad do rumo (+ = esquerda, como o yaw).
 */
export function createBullet(s, kind, id, owner, off = 0, ang = 0) {
  const w = WEAPONS[kind];
  const f = forward(s.yaw);
  const d = ang ? forward(s.yaw + ang) : f;
  return {
    id,
    owner,
    kind,
    x: s.x + f.x * 6 - f.z * off,
    y: s.y,
    z: s.z + f.z * 6 + f.x * off,
    vx: d.x * w.vel + s.vx * 0.5,
    vy: 0,
    vz: d.z * w.vel + s.vz * 0.5,
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
  return b.vida > 0 && b.y > alturaSolida(b.x, b.z); // terreno ou construção
}

/**
 * O tiro passou pela nave neste passo? Teste de segmento contra cilindro vertical,
 * para tiro rápido não atravessar nave sem acertar entre um passo e outro. Monstro
 * grande (os elites) leva `s.raio` maior que o da nave.
 */
export function bulletHits(b, s) {
  const raio = WEAPONS[b.kind].raio + (s.raio ?? SHIP_RADIUS);
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
