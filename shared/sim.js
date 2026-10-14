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
import { alturaSolida, pontoLivre } from './obstaculos.js';
import { naveDe, classeOuPadrao, CLASSE_PADRAO } from './naves.js';
import {
  WEAPONS,
  ARMAS,
  IDX_ARMA,
  ARMAS_NPC,
  TIPOS_DANO,
  CATEGORIAS,
  PAPEIS,
  MINA_ATRAS,
  armasIniciais,
  armasDisponiveis,
  armaDisponivel,
  versaoArma,
  tirosDoGolpe,
  nivelArmaValido,
} from './armas.js';

export const DT = 1 / 30;
export const HOVER = 10;
export const ALTURA_POUSADO = 1.4; // trem de pouso
export const VEL_TOQUE = 6; // m/s: acima disso a nave ainda está freando para pousar
export const POUSO_GIRO = 0.4; // fração do giro normal com a nave no chão
export const POUSO_REGEN_MULT = 2.5; // energia recupera mais rápido pousada
// Pousada e parada na PRÓPRIA base (pedido do Mateus), a nave conserta e recarrega
// bem rápido: esta fração do HP e da energia máximos por segundo (enche em ~3 s),
// além da regeneração da nave. A energia corre aqui (predição); a vida, no servidor.
export const BASE_CURA_FRAC = 0.35;
export const MAX_SLOPE = 0.75;
export const TURN_RATE = 2.3;
// Inclinação na curva, em radianos: positiva abaixa a asa esquerda (rotation.z do
// Three.js visto de trás). A nave inclina para dentro da curva, como um avião:
// A (esquerda) abaixa a asa esquerda, D (direita) abaixa a direita.
export const INCLINACAO_CURVA = 0.55;
export const SHIP_RADIUS = 4.5;

/**
 * Raças. A cor vai no brilho dos motores; os status (HP, energia, velocidade) vêm
 * da NAVE (shared/naves.js: raça, classe e tier), não da raça. Mechan aparece na
 * entrada apagada ("EM BREVE"): ainda não tem naves (RACAS_BLOQUEADAS).
 */
export const RACES = {
  acron: { nome: 'Acron', cor: 0x3fa9ff, bioma: 'Aquático' },
  bellico: { nome: 'Bellico', cor: 0xff5a3c, bioma: 'Deserto' },
  shrewdo: { nome: 'Shrewdo', cor: 0x34e08a, bioma: 'Terreno' },
  mechan: { nome: 'Mechan', cor: 0xb15cff, bioma: 'Tóxico', bloqueada: true },
};
export const BOOST_MULT = 1.6;
export const BOOST_GASTO = 14; // energia por segundo
export const ENERGIA_REGEN = 9; // por segundo, sem boost (nave sem regenEn própria)

/**
 * Física de quem não é nave de jogador com classe (drones, Vorax, Krakor, guardião,
 * mineradores, escoltas, e a raça sem naves): só a velocidade máxima conta para a
 * IA deles (o HP cada um põe o seu). Os números são os da raça Mechan de antes,
 * para drones e Vorax andarem como andavam.
 */
export const NAVE_SEM_CLASSE = { hp: 250, energia: 60, velocidade: 52.25 }; // velocidade em m/s

// Armas: a nave tem DUAS, cada uma num encaixe (Z e X). Não existe arma principal
// nem secundária: os dois encaixes são iguais e aceitam qualquer arma que a raça e a
// classe da nave podem usar e que o piloto possui, inclusive a mesma nos dois. Cada
// encaixe tem a sua recarga (cd1 para o Z, cd2 para o X); a ENERGIA é uma só e as
// duas gastam dela.
//
// O catálogo (shared/armas.js) é o do Astro-N original: 140 armas das lojas de
// Acron, Bellico e Shrewdo, cada uma com as versões V1 a V5 (o NÍVEL da arma, 1 a 5,
// evoluído na Loja). Aqui o stepShip lê da versão do encaixe (s.niveis[arma]) a
// recarga, a energia, a rajada, a varredura do padrão e se a arma é de segurar a
// tecla, e devolve os disparos; quem cria o golpe (projétil, nova, mina, campo,
// efeito na própria nave) é o servidor (server/golpes.js). O que muda o movimento,
// o tiro ou a energia da própria nave fica aqui, para a predição bater:
// - Rajada (s.raj1/raj2): o gatilho dispara o primeiro tiro e gasta a energia; os
//   outros saem a cada rajadaS, mesmo soltando a tecla (como no original), girando o
//   padrão pela varredura. Trocar a arma do encaixe, pousar ou levar paralisia corta.
// - Segurar a tecla (dispositivos): enquanto o gatilho está apertado e há energia,
//   gasta energia por segundo e fica ligado (s.seg1/seg2 = índice da arma, -1
//   desligado): acelerar e trocar HP por energia agem aqui; regenerar, ficar
//   invisível e o custo em HP o servidor lê do mesmo campo.
// - Teleporte: salto à frente até a distância da versão, recuando de
//   TELEPORTE_PASSO em TELEPORTE_PASSO até achar chão livre (pontoLivre).
// - Efeitos que o servidor põe na nave atingida (todos em s, contados aqui):
//   lento/lentoMult (lento e paralisia do movimento), emp (sem tiro e sem boost),
//   semTiro (paralisa o ataque), trava (trava aceleração e freio), desgov (curva
//   invertida), semRegen (sem regenerar energia), cadencia/cadMult (recarga maior),
//   enCara/enCaraMult (tiro mais caro) e drenoEn/drenoEnPs (perde energia por s).
//
// Armas iniciais: as duas da raça (armasIniciais) são de fábrica, sempre possuídas.
// Nave sem raça jogável (drones e monstros, que usam a física daqui) atira com os
// tiros de NPC (laser no Z, plasma no X), que ficam fora do catálogo do jogador.
export const AREA_ALTURA = 12; // m de diferença de altura até onde a área ainda pega
export const TELEPORTE_PASSO = 10; // m: o teleporte recua isto até achar lugar livre
export const TELEPORTE_FOLGA = SHIP_RADIUS + 3; // m de chão livre em volta do destino

// Troca de arma: trocar a arma de um encaixe fora da própria base põe AQUELE
// encaixe em recarga de troca por TROCA_ARMA_S (s.troca1 no Z, s.troca2 no X): sem
// tiro nele e sem nova troca nele até acabar (o outro encaixe segue normal). Sem
// isso dava para trocar no meio da luta a cada tiro e a build não pesava nada.
// Dentro da própria base (raio de BASES[s.time]) a troca é livre e a recarga de
// troca zera. Nave sem time (monstros, testes) troca livre, como no pouso. Fica no
// estado da nave e roda no stepShip, então a predição bate com o servidor.
export const TROCA_ARMA_S = 3;

export { WEAPONS, ARMAS, IDX_ARMA, TIPOS_DANO, CATEGORIAS, PAPEIS, armasIniciais, armasDisponiveis, versaoArma };

/** Funções das armas no menu e na Loja (do papel no original: ataque é dano, o resto é controle). */
export const FUNCOES_ARMA = { dano: 'Dano', controle: 'Controle' };

/** Encaixes padrão de nave sem raça jogável (os tiros dos NPCs: laser no Z, plasma no X). */
export const ENCAIXE_PADRAO = [...ARMAS_NPC];

/** As armas de fábrica da nave [Z, X] (as iniciais da raça; NPC: laser e plasma). */
export function encaixePadrao(s) {
  return armasIniciais(s?.race);
}

/** Índice de arma do comando: inteiro dentro do catálogo, ou -1 (cai na padrão do encaixe). */
export function armaValida(a) {
  return Number.isInteger(a) && a >= 0 && a < ARMAS.length ? a : -1;
}

/**
 * A nave pode usar a arma de índice a? Tem de ser da raça e da classe dela
 * (armasDisponiveis) e possuída: as de fábrica (armasIniciais) sempre; as outras se
 * estão em s.armas (a posse que a Loja dá ao piloto e o servidor copia para a nave).
 */
export function possuiArma(s, a) {
  if (!armaDisponivel(s.race, s.classe, a)) return false;
  return armasIniciais(s.race).includes(a) || !s.armas || s.armas.includes(a);
}

/** Arma que o encaixe usa de fato: a pedida, se válida e possuída; senão a de fábrica dele. */
export function armaDoEncaixe(s, pedida, encaixe) {
  const a = armaValida(pedida);
  return a >= 0 && possuiArma(s, a) ? a : encaixePadrao(s)[encaixe];
}

/** Nível (1 a 5) da arma de índice a na nave (s.niveis, que o servidor copia do piloto). */
export function nivelDaArma(s, a) {
  return nivelArmaValido(s.niveis?.[a] ?? 1);
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
 * Pousada e parada (abaixo de VEL_TOQUE) dentro da própria base: é onde a nave
 * conserta e recarrega rápido (BASE_CURA_FRAC). Nave sem time não tem base.
 */
export function pousadaNaBase(s) {
  const b = BASES[s.time];
  if (s.time === undefined || !b || !s.pousado || Math.hypot(s.vx, s.vz) >= VEL_TOQUE) return false;
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

/**
 * Põe na nave os status da nave do catálogo (shared/naves.js) ou, sem ela,
 * NAVE_SEM_CLASSE: classe, tier, HP e energia máximos, velocidade (m/s),
 * regeneração de energia (s.regenEn, por segundo) e de vida voando e pousada
 * (s.regenHpVoo e s.regenHpPousada, HP por segundo; quem regenera vida é o
 * servidor). Não mexe em HP e energia atuais. A velocidade e a regeneração de
 * energia vão no `me`: o stepShip da predição lê os mesmos números.
 */
export function aplicarNave(s, nave) {
  const n = nave ?? NAVE_SEM_CLASSE;
  s.classe = nave?.classe;
  s.tier = nave?.tier ?? 0;
  s.maxHp = n.hp;
  s.maxEn = n.energia;
  s.velocidade = n.velocidade;
  s.regenEn = n.regenEnergia ?? ENERGIA_REGEN;
  s.regenHpVoo = n.regenHpVoo ?? 0;
  s.regenHpPousada = n.regenHpPousada ?? 0;
  return s;
}

/**
 * Estado novo de uma nave da raça dada, parada no ponto (x, z). Raça com naves
 * (acron, bellico, shrewdo) usa a nave de `classe` e `tier` (classe inválida vira
 * CLASSE_PADRAO); raça sem naves (mechan, a física dos monstros) usa NAVE_SEM_CLASSE.
 */
export function createShip(race, x, z, yaw = 0, classe = CLASSE_PADRAO, tier = 0) {
  const raca = RACES[race] ? race : 'shrewdo';
  const s = {
    race: raca,
    x,
    z,
    y: heightAt(x, z) + HOVER,
    yaw,
    vx: 0,
    vz: 0,
    roll: 0,
    cd1: 0,
    cd2: 0,
    troca1: 0, // s de recarga de troca do Z (TROCA_ARMA_S): sem tiro e sem troca nele
    troca2: 0, // o mesmo no X
    raj1: 0, // tiros que faltam da rajada do Z (rajT1 = s até o próximo, rajK1 = quantos já saíram)
    raj2: 0, // o mesmo no X
    seg1: -1, // arma de segurar ligada no Z (índice; -1 desligada)
    seg2: -1, // o mesmo no X
    velMult: 1, // multiplicador da velocidade máxima (armadura pesada da Loja)
    // Efeitos que o servidor põe na nave atingida (s restantes; ver o bloco das armas).
    lento: 0,
    lentoMult: 1,
    emp: 0,
    boost: false,
    boostTravado: false,
    pousado: false,
    pAnt: false,
  };
  aplicarNave(s, naveDe(raca, classeOuPadrao(classe), tier));
  // Armas de fábrica nos encaixes; a posse sem restrição aqui (monstros, mineradores,
  // testes): a nave de jogador recebe a do piloto no World (server/servicos.js).
  s.encaixes = [...armasIniciais(raca)];
  s.armas = [...armasDisponiveis(raca, s.classe)];
  s.niveis = {}; // nível de cada arma (índice → 1 a 5; sem entrada = 1)
  s.hp = s.maxHp;
  s.en = s.maxEn;
  return s;
}

/** Velocidade máxima da nave em m/s, sem boost nem multiplicadores (para as IAs). */
export function velocidadeBase(s) {
  return s.velocidade ?? NAVE_SEM_CLASSE.velocidade;
}

/** Comando vazio (nave solta). */
export const INPUT_VAZIO = { th: 0, tu: 0, b: false, f1: false, f2: false, p: false, r: false, a: -1, a2: -1 };

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
    a: armaValida(i?.a), // -1: a arma de fábrica do encaixe
    a2: armaValida(i?.a2),
  };
}

function bloqueado(gAtual, x, z, passo) {
  if (passo < 1e-6) return false;
  return (alturaSolida(x, z, SHIP_RADIUS) - gAtual) / passo > MAX_SLOPE;
}

/** Conta para baixo um efeito em s (em segundos), sem criar o campo se ele não existe. */
function contar(s, campo, dt) {
  if (s[campo] > 0) s[campo] = Math.max(0, s[campo] - dt);
}

/** Efeito de segurar a tecla da arma de índice a no nível dado (ou null). */
function efeitoSegurar(a, nivel) {
  if (a < 0) return null;
  return versaoArma(a, nivel)?.golpe.efeitos.find((e) => e.segurar) ?? null;
}

/**
 * Teleporte: a nave salta para a frente até `dist` m, recuando TELEPORTE_PASSO por
 * vez até achar chão livre (fora de rocha, construção e muralha). Sem lugar, fica.
 */
export function teleportar(s, dist) {
  const f = forward(s.yaw);
  for (let d = dist; d >= TELEPORTE_PASSO; d -= TELEPORTE_PASSO) {
    const x = s.x + f.x * d;
    const z = s.z + f.z * d;
    if (!pontoLivre(x, z, TELEPORTE_FOLGA)) continue;
    s.x = x;
    s.z = z;
    s.y = heightAt(x, z) + HOVER;
    return true;
  }
  return false;
}

/**
 * Avança a nave um passo DT com o comando dado. Retorna os disparos deste passo,
 * como [{ kind, enc, nivel, k, off, ang }] (kind = chave de WEAPONS, enc = encaixe,
 * nivel = da arma, k = tiro da rajada, off = deslocamento lateral em metros, ang =
 * desvio do rumo em rad). O servidor cria o golpe de cada um (server/golpes.js): um
 * projétil por (off, ang) com createBullet; nova, mina, campo e efeito na própria
 * nave vêm como um disparo só. O teleporte já acontece aqui (a predição salta junto).
 */
export function stepShip(s, inp, dt = DT) {
  // As armas dos dois encaixes vêm no comando (a = Z, a2 = X) a cada passo, para
  // predição e servidor trocarem no mesmo passo. A recarga do tiro é do encaixe,
  // não da arma: trocar de arma não zera a espera do tiro. Arma que a nave não
  // possui (ou índice ruim) cai na de fábrica do encaixe. Fora da própria base, trocar
  // põe o encaixe em recarga de troca (TROCA_ARMA_S); pedir outra troca enquanto
  // ela conta é ignorado (a nave fica com a arma que tem).
  const livre = trocaLivre(s);
  if (livre) s.troca1 = s.troca2 = 0;
  const padrao = encaixePadrao(s);
  const encaixes = s.encaixes ?? padrao;
  s.encaixes = [0, 1].map((enc) => {
    const atual = encaixes[enc];
    const pedida = armaDoEncaixe(s, enc === 0 ? inp.a : inp.a2, enc);
    if (pedida === atual) return atual;
    // A arma do encaixe deixou de ser possuída (não acontece no jogo): volta à de fábrica sem recarga.
    if (!possuiArma(s, atual)) return padrao[enc];
    if (livre) return pedida;
    const troca = enc === 0 ? 'troca1' : 'troca2';
    if (s[troca] > 0) return atual;
    s[troca] = TROCA_ARMA_S;
    return pedida;
  });
  // Trocou a arma: a rajada daquele encaixe acaba.
  for (const enc of [0, 1]) if (s.encaixes[enc] !== encaixes[enc]) s[enc ? 'raj2' : 'raj1'] = 0;

  // Efeitos de quem levou tiro. EMP: sem tiro e sem boost (o servidor já zerou a
  // energia); paralisia do ataque: sem tiro. Contam aqui, a predição junto.
  const semBoost = s.emp > 0;
  const semTiro = semBoost || s.semTiro > 0;
  contar(s, 'emp', dt);
  contar(s, 'semTiro', dt);
  // Pouso alterna na borda do botão (apertou agora), para segurar L não ficar
  // pousando e decolando sem parar.
  if (inp.p && !s.pAnt) s.pousado = s.pousado ? false : pousoPermitido(s);
  s.pAnt = !!inp.p;
  // Se ainda freando ela escorregar para fora da área, o pouso é cancelado.
  if (s.pousado && !pousoPermitido(s)) s.pousado = false;
  const pousado = s.pousado;

  // Armas de segurar a tecla (dispositivos): ligadas enquanto o gatilho do encaixe
  // está apertado, há energia para o passo e a nave pode atirar.
  const cadMult = s.cadencia > 0 ? (s.cadMult ?? 1) : 1;
  const enMult = s.enCara > 0 ? (s.enCaraMult ?? 1) : 1;
  let aceleraMult = 1;
  let parada = false;
  let ganhoEn = 0;
  for (const enc of [0, 1]) {
    const campo = enc ? 'seg2' : 'seg1';
    const a = s.encaixes[enc];
    const nivel = nivelDaArma(s, a);
    const v = versaoArma(a, nivel);
    const aperto = enc ? inp.f2 : inp.f1;
    const troca = enc ? s.troca2 : s.troca1;
    const custo = (v?.energia ?? 0) * enMult * dt;
    const ligado = !!v?.segurar && aperto && !pousado && !semTiro && !(troca > 0) && s.en >= custo && s.en > 0;
    s[campo] = ligado ? a : -1;
    if (!ligado) continue;
    s.en = Math.max(0, s.en - custo);
    const ef = efeitoSegurar(a, nivel);
    if (ef?.tipo === 'acelera') aceleraMult *= ef.mult;
    if (ef?.tipo === 'energiaPorHp') ganhoEn += ef.enPs * dt;
    if (ef?.parado) parada = true;
  }

  // Energia zerada no boost trava o boost até soltar o botão; sem isso ele piscaria
  // liga/desliga a cada passo com a energia que regenera.
  if (!inp.b) s.boostTravado = false;
  const querBoost = !pousado && !semBoost && inp.b && inp.th > 0 && s.en > 0 && !s.boostTravado;
  s.boost = querBoost;
  // s.velocidade: a da nave (shared/naves.js); s.velMult: armadura pesada (o
  // servidor põe; os dois vão no `me`). s.lentoMult: força do lento de quem acertou
  // (o servidor põe no acerto; vai no `me`); 0 é paralisia do movimento.
  const lento = s.lento > 0 ? (s.lentoMult ?? 1) : 1;
  const maxV = velocidadeBase(s) * (s.velMult ?? 1) * aceleraMult * (querBoost ? BOOST_MULT : 1) * lento;
  contar(s, 'lento', dt);
  // Controle invertido (Canhão Desgoverno): a curva vai para o outro lado.
  const tu = s.desgov > 0 ? -inp.tu : inp.tu;
  contar(s, 'desgov', dt);

  s.yaw += tu * TURN_RATE * (pousado ? POUSO_GIRO : 1) * dt;
  s.roll += ((pousado ? 0 : tu * INCLINACAO_CURVA) - s.roll) * Math.min(1, 6 * dt);

  const f = forward(s.yaw);
  const r = { x: -f.z, z: f.x };
  let vf = s.vx * f.x + s.vz * f.z;
  let vl = s.vx * r.x + s.vz * r.z;
  // Trava de aceleração: a nave segue na velocidade que tinha, sem acelerar nem frear.
  const travada = s.trava > 0 && !pousado;
  contar(s, 'trava', dt);
  const alvo = pousado || parada ? 0 : inp.th >= 0 ? inp.th * maxV : inp.th * maxV * 0.4;
  if (!travada) vf += (alvo - vf) * Math.min(1, (pousado ? 3 : querBoost ? 3.2 : 2.2) * dt);
  else if (vf > maxV) vf = maxV; // travada, mas sem passar do máximo (com lento junto, por exemplo)
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

  // Energia: boost gasta; sem boost regenera (pousada mais rápido), salvo com a
  // regeneração cortada. Dreno de energia tira por segundo; o Amplificador de
  // Energia (segurar) dá.
  if (querBoost) {
    s.en = Math.max(0, s.en - BOOST_GASTO * dt);
    if (s.en === 0) s.boostTravado = true;
  } else if (!(s.semRegen > 0)) s.en = Math.min(s.maxEn, s.en + (s.regenEn ?? ENERGIA_REGEN) * (pousado ? POUSO_REGEN_MULT : 1) * dt);
  // Pousada na própria base: recarga rápida (vale mesmo com a regeneração cortada).
  if (pousadaNaBase(s)) s.en = Math.min(s.maxEn, s.en + s.maxEn * BASE_CURA_FRAC * dt);
  contar(s, 'semRegen', dt);
  if (s.drenoEn > 0) s.en = Math.max(0, s.en - (s.drenoEnPs ?? 0) * dt);
  contar(s, 'drenoEn', dt);
  if (ganhoEn) s.en = Math.min(s.maxEn, s.en + ganhoEn);
  contar(s, 'cadencia', dt);
  contar(s, 'enCara', dt);

  s.cd1 = Math.max(0, s.cd1 - dt);
  s.cd2 = Math.max(0, s.cd2 - dt);
  s.troca1 = Math.max(0, (s.troca1 || 0) - dt);
  s.troca2 = Math.max(0, (s.troca2 || 0) - dt);
  const disparos = [];
  if (pousado || semTiro) {
    s.raj1 = s.raj2 = 0; // pousar ou levar paralisia corta a rajada
    return disparos;
  }
  // Z primeiro, depois X, cada um com a sua recarga e gastando da mesma energia.
  // Encaixe em recarga de troca não atira.
  for (const enc of [0, 1]) {
    const [cd, troca, raj, rajT, rajK] = enc ? ['cd2', 'troca2', 'raj2', 'rajT2', 'rajK2'] : ['cd1', 'troca1', 'raj1', 'rajT1', 'rajK1'];
    const a = s.encaixes[enc];
    const kind = ARMAS[a];
    const nivel = nivelDaArma(s, a);
    const v = versaoArma(a, nivel);
    if (!v || v.segurar) continue;
    const g = v.golpe;
    const atirar = (k) => {
      if (g.forma !== 'projetil') disparos.push({ kind, enc, nivel, k, off: 0, ang: 0 });
      else for (const { off, ang } of tirosDoGolpe(g, k)) disparos.push({ kind, enc, nivel, k, off, ang });
    };
    // Rajada em andamento: os outros tiros saem no tempo deles, sem gastar energia.
    if (s[raj] > 0) {
      s[rajT] -= dt;
      while (s[raj] > 0 && s[rajT] <= 1e-9) {
        atirar(s[rajK]);
        s[rajK]++;
        s[raj]--;
        s[rajT] += g.rajadaS;
      }
    }
    const aperto = enc ? inp.f2 : inp.f1;
    const custo = v.energia * enMult;
    if (!aperto || s[cd] > 0 || s[troca] > 0 || s.en < custo) continue;
    s[cd] = v.cd * cadMult;
    s.en -= custo;
    if (v.zeraEnergia) s.en = 0; // Nova Doadora e Recarrega-Escudo: custa toda a energia
    atirar(0);
    if (g.rajada > 1) {
      s[raj] = g.rajada - 1;
      s[rajT] = g.rajadaS;
      s[rajK] = 1;
    }
    const tele = g.forma === 'efeito' ? g.efeitos.find((e) => e.tipo === 'teleporte') : null;
    if (tele) teleportar(s, tele.dist);
  }
  return disparos;
}

/**
 * Cria um projétil do golpe `g` (o disparo da versão `nivel` da arma, se não vier)
 * saindo do nariz da nave, deslocado off metros para o lado (+ = direita da nave) e
 * desviado ang rad do rumo (+ = esquerda, como o yaw). Golpe parado (vel 0: a carga
 * das armadilhas soltas) nasce MINA_ATRAS m atrás da nave, sem herdar a velocidade.
 * O raio de acerto, a vida e o dano vão no tiro.
 */
export function createBullet(s, kind, id, owner, off = 0, ang = 0, nivel = 1, g = versaoArma(kind, nivel).golpe) {
  const f = forward(s.yaw);
  const d = ang ? forward(s.yaw + ang) : f;
  const vel = g.vel ?? 0;
  const frente = vel > 0 ? 6 : -MINA_ATRAS;
  const herda = vel > 0 ? 0.5 : 0;
  return {
    id,
    owner,
    kind,
    nivel,
    prof: g.prof ?? 0,
    x: s.x + f.x * frente - f.z * off,
    y: s.y,
    z: s.z + f.z * frente + f.x * off,
    vx: d.x * vel + s.vx * herda,
    vy: 0,
    vz: d.z * vel + s.vz * herda,
    vida: g.vida,
    raio: g.raio,
    dano: g.dano,
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
  const raio = (b.raio ?? WEAPONS[b.kind]?.raio ?? 0) + (s.raio ?? SHIP_RADIUS);
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
