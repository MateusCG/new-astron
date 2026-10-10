// Mundo do jogo no servidor: um mapa, as naves dos jogadores, os inimigos (PvE:
// drones Arnosh e monstros Vorax) e os tiros. Roda em passo fixo de 30 Hz (DT de shared/sim.js) e manda o
// estado para os clientes a 15 Hz.
//
// Regra de ouro herdada do Sideral: o servidor decide tudo o que importa (posição,
// acerto, dano, morte, ouro, XP). O cliente só manda comandos numerados (seq); o servidor
// aplica cada comando uma vez, em ordem, e devolve no snapshot o último seq aplicado
// (ack) junto com o estado da nave, para o cliente reconciliar a predição.
//
// Limites contra trapaça: no máximo MAX_INPUTS_TICK comandos por tick (não dá para
// "acelerar o tempo" mandando comando demais) e fila de no máximo MAX_FILA.
//
// Efeitos de arma (WEAPONS[].efeito) também são só do servidor: o dreno fica na
// entidade (drenoTicks, drenoDono) e tira vida a cada tick, respeitando a zona
// segura e a proteção de nascimento; a lentidão do criogênico vai para ship.lento,
// que o stepShip usa e o snapshot leva no `me` (para a predição bater). As
// entidades do snapshot trazem `dreno` e `lento` para todos desenharem o efeito.
//
// Duas armas na nave (encaixes Z e X, shared/sim.js): o que stepShip devolve pode
// ser projétil (createBullet), mina ou onda de choque, resolvidas aqui com a
// geometria de server/armas.js. O míssil teleguiado é um projétil que o servidor
// curva a cada passo (o cliente o desenha pelo evento e pela lista `guiados` do
// snapshot). As minas ficam em this.minas e vão no snapshot (`minas`). O pulso EMP
// zera a energia e põe ship.emp (sem tiro e sem boost, lido no stepShip; monstro
// também fica sem garra e sem cuspe, minerador fica parado). Mina e choque usam o
// mesmo #ferir: sem fogo amigo, zona segura e proteção de nascimento valem igual.
//
// Partida 3 contra 3 (DESIGN-PARTIDA.md): times, cronômetro e placar ficam em
// server/partida.js; os mineradores em server/mineradores.js; os bônus por tempo
// dos mineradores em server/bonus.js. Aqui ficam só os ganchos: o jogador entra no
// time com menos gente e nasce na base dele; tiro de aliado atravessa aliado (sem
// fogo amigo, nem nos mineradores); a zona segura só protege o time dono da base
// (na base do outro time você leva dano normalmente). Drones e Vorax continuam sem
// entrar em base nenhuma: as duas são território dos jogadores.
//
// XP, nível e ouro por abate ficam em server/progressao.js (na morte, em #ferir); os
// objetivos A, B e C em server/objetivos.js (no step, no tiro que bate na torre e
// na morte do guardião), que ligam os bônus em this.bonus; os monstros elite
// (Krakor e o guardião) em server/elites.js.
//
// Combate entre jogadores (DESIGN-PARTIDA.md, "Combate"; números em
// server/progressao.js): todo dano de jogador inimigo (tiro, dreno, mina, choque)
// fica anotado na vítima (`danoPor`: atacante → tick); na morte de um jogador,
// quem do time do matador feriu na janela leva a assistência, a sequência da
// vítima zera (e o matador ganha o bônus por encerrá-la) e o renascimento do
// jogador demora tempoRenascer(nível, partida decorrida).
//
// Loja e Evolução (server/servicos.js): pedidos do cliente atendidos em pedido();
// a posse de armas, a armadura, os itens e as evoluções ficam no jogador e vão
// para cada nave nova em prepararNave (nascimento e renascimento). A armadura e a
// defesa dos mineradores reduzem o dano em #ferir.
//
// Nível das armas (Loja, shared/loja.js): o tiro, a mina e a onda de choque levam o
// nível da arma de quem atirou (`nivel`, lido de j.niveisArmas na hora do disparo);
// o dano passa por multDano() e o efeito das armas de controle sai de
// efeitoDaArma(kind, nivel). O dreno guarda o dano por segundo na entidade
// (drenoDps) e o lento guarda a força na nave (ship.lentoMult, que vai no `me` e o
// stepShip do alvo lê). Monstro e minerador atiram sempre no nível 1.
//
// Recall (shared/recall.js): o campo r do comando é um pulso; a borda de subida
// (j.rAnt) começa ou cancela a canalização no passo daquele comando, e os mesmos
// comandos cancelam com gatilho, boost ou velocidade (#comandoRecall). Dano cancela
// em #ferir. Terminada, a nave vai para um ponto da base do time como no
// renascimento, mas é a mesma nave (vida, energia, nível e equipamento ficam); a
// fila de comandos segue, e o cliente reconcilia o salto pelo `me`.

import {
  DT,
  WEAPONS,
  createShip,
  sanitizeInput,
  stepShip,
  createBullet,
  stepBullet,
  bulletHits,
  VEL_TOQUE,
  VEL_FATOR,
  RACES,
  IDX_ARMA,
} from '../shared/sim.js';
import { danoMultNivel, efeitoDaArma } from '../shared/loja.js';
import { BASE, BASES, CORREDOR } from '../shared/terrain.js';
import { pontoAberto } from '../shared/obstaculos.js';
import { MapaNavegacao } from './navegacao.js';
import { Partida, N_TIMES, MULT_FASE_FINAL } from './partida.js';
import { Mineradores } from './mineradores.js';
import { Bonus, BONUS } from './bonus.js';
import { Objetivos } from './objetivos.js';
import {
  novaProgressao,
  novoCombate,
  recompensar,
  ganharXp,
  xpParaNivel,
  tempoRenascer,
  ouroEncerrar,
  recompensaAssistencia,
  ASSISTENCIA_JANELA_S,
} from './progressao.js';
import { Servicos, novoEquipamento, prepararNave, reducaoArmadura } from './servicos.js';
import { KRAKOR, N_KRAKOR, novaElite, renascerElite, iaElite } from './elites.js';
import { alvoDoMissil, guiarMissil, novaMina, naArea } from './armas.js';
import { RECALL_S, motivoRecall } from '../shared/recall.js';

export const TICK_HZ = 30;
const SNAP_CADA = 2; // ticks entre snapshots (15 Hz)
const MAX_INPUTS_TICK = 4;
const MAX_FILA = 30;
const RESPAWN_TICKS = 3 * TICK_HZ; // drones; o do jogador cresce (tempoRenascer em server/progressao.js)
const ASSISTENCIA_TICKS = ASSISTENCIA_JANELA_S * TICK_HZ;
const REGEN_ESPERA_TICKS = 5 * TICK_HZ;
const VOO_REGEN_HP = 0.03; // fração do HP máximo por segundo, voando
const POUSO_REGEN_HP = 0.08; // fração do HP máximo por segundo, pousada
const POUSO_REGEN_ESPERA_TICKS = 1 * TICK_HZ;
// Monstros do mundo aberto (3000 × 2000 m): Arnosh espalhados patrulhando, Vorax
// caçando (N_MONSTROS) e os Krakor, elites raros (N_KRAKOR em server/elites.js).
// XP e ouro de cada tipo ficam em RECOMPENSA (server/progressao.js).
const N_DRONES = 14;
const DRONE = { nome: 'Arnosh', hp: 90, visao: 200, alcance: 210, danoMult: 0.5 };
// Arnosh patrulhando não entra na faixa do corredor (é dos mineradores): dá meia
// volta a esta distância do meio dele. Caçando um jogador, entra.
const DRONE_LIMITE_CORREDOR = CORREDOR.largura / 2 + 40;
// Zona segura: em volta da base do PRÓPRIO time ninguém leva dano. Drones não
// perseguem quem está em base nenhuma (nem entram nelas).
export const ZONA_SEGURA = BASE.raio + 30;
// Drone que chega a esta distância de uma base (patrulhando ou caçando) dá meia
// volta para o mundo aberto: as bases são território dos jogadores.
const DRONE_LIMITE_BASE = ZONA_SEGURA + 60;
const PROTECAO_TICKS = 3 * TICK_HZ; // invulnerável logo depois de nascer
const RECALL_TICKS = Math.round(RECALL_S * TICK_HZ);

// Monstros Vorax: caçadores que vêm atrás de quem sai da base, de qualquer canto do
// mapa, contornando as mesas de rocha (server/navegacao.js). Atacam com as garras, de
// perto, e não atiram. Mais lentos que qualquer nave de jogador (a mais lenta faz
// ~50 m/s sem boost), para dar para fugir ou virar e brigar. Não entram na zona
// segura: quem está na base fica a salvo e eles rondam a borda esperando. Quando
// morrem, renascem longe de todo mundo e voltam a caçar, para sempre ter monstro
// vindo.
const N_MONSTROS = 6;
const VORAX = {
  nome: 'Vorax',
  raca: 'mechan', // só para a física (stepShip); o tipo é que diz o que ele é
  hp: 70,
  velocidade: 42, // m/s
  dano: 10, // por golpe de garra
  alcance: 14, // m entre os centros para a garra pegar
  intervaloS: 1.2, // s entre golpes do mesmo monstro
  renascerS: 6,
  distRenascer: 450, // m mínimos de qualquer jogador vivo ao renascer
};
const VORAX_INTERVALO_TICKS = Math.round(VORAX.intervaloS * TICK_HZ);
const VORAX_RENASCER_TICKS = VORAX.renascerS * TICK_HZ;
const VORAX_RECALCULO_TICKS = 15; // de quanto em quanto tempo o mapa de caça é refeito
const VORAX_PERTO = 60; // m: daqui para dentro, com linha livre, vai direto no jogador
const VORAX_AFASTAR = 16; // m: dois monstros mais perto que isso se empurram
const VORAX_ESPACO = 9; // m: não encosta mais que isso numa nave (não fica dentro dela)
const VORAX_MARGEM_ZONA = 5; // m além da zona segura que o monstro não cruza
const VORAX_RONDA_TROCA_TICKS = 4 * TICK_HZ; // ronda na borda troca de sentido
const VORAX_PRESO_TICKS = 1.5 * TICK_HZ; // parado esse tempo querendo andar: dá ré
const VORAX_RE_TICKS = 0.6 * TICK_HZ;
const LIMITE_VORAX = ZONA_SEGURA + VORAX_MARGEM_ZONA;

// A grade de navegação depende só do terreno: monta uma vez por processo, na
// primeira vez que aparece um monstro.
let navegacao = null;
function nav() {
  navegacao ??= new MapaNavegacao({ raioBloqueio: LIMITE_VORAX });
  return navegacao;
}

function limpaNome(n) {
  const s = String(n ?? '')
    .replace(/[^\p{L}\p{N} _-]/gu, '')
    .trim()
    .slice(0, 16);
  return s || 'Piloto';
}

function anguloEntre(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

/** A base mais perto do ponto. */
function baseMaisPerto(s) {
  let melhor = BASES[0];
  for (const b of BASES) if (Math.hypot(s.x - b.x, s.z - b.z) < Math.hypot(s.x - melhor.x, s.z - melhor.z)) melhor = b;
  return melhor;
}

export class World {
  /**
   * @param {{ rng?: () => number, drones?: number, monstros?: number, elites?: number,
   *   duracaoPartidaS?: number, intervaloFimS?: number, faseFinalS?: number }} [opcoes]
   * drones = Arnosh, monstros = Vorax, elites = Krakor (os guardiões dos objetivos C
   * sempre existem).
   */
  constructor({ rng = Math.random, drones = N_DRONES, monstros = N_MONSTROS, elites = N_KRAKOR, duracaoPartidaS, intervaloFimS, faseFinalS } = {}) {
    this.rng = rng;
    this.tick = 0;
    this.nextId = 1;
    this.players = new Map();
    this.drones = [];
    this.monstros = [];
    this.elites = []; // Krakor e guardiões
    this.bullets = [];
    this.minas = [];
    this.eventos = [];
    // Mapa de caça dos Vorax: campo de caminhos até os jogadores caçáveis.
    this.caca = { campo: null, alvos: [], ate: 0 };
    this.partida = new Partida({ duracaoS: duracaoPartidaS, intervaloFimS, faseFinalS });
    this.bonus = new Bonus();
    this.mineradores = new Mineradores({
      bonus: this.bonus,
      novoId: () => this.#id(),
      entregar: (time, carga) => this.partida.somar(time, carga, this.tick),
      evento: (ev) => this.eventos.push(ev),
    });
    for (let i = 0; i < drones; i++) this.drones.push(this.#novoDrone());
    for (let i = 0; i < monstros; i++) this.monstros.push(this.#novoVorax());
    for (let i = 0; i < elites; i++) {
      const p = this.#pontoKrakor();
      this.elites.push(novaElite('krakor', this.#id(), p.x, p.z, this.rng() * Math.PI * 2));
    }
    this.objetivos = new Objetivos(this);
    this.servicos = new Servicos(this);
    // O que a IA dos elites lê do mundo.
    const players = this.players;
    this.ctxElite = {
      tick: 0,
      rng: this.rng,
      get jogadores() {
        return players.values();
      },
      naZonaSegura: (s) => this.#naZonaSegura(s),
      zonaSegura: ZONA_SEGURA,
    };
  }

  #id() {
    return this.nextId++;
  }

  /** Ponto sorteado no centro da base do time, e o yaw de quem olha para o corredor. */
  #pontoNaBase(time) {
    const b = BASES[time];
    const a = this.rng() * Math.PI * 2;
    const r = this.rng() * 60;
    // yaw 0 olha para -z: a base de baixo (+z) olha para o norte, a de cima para o sul.
    const yaw = b.z > CORREDOR.zInicio ? 0 : Math.PI;
    return { x: b.x + Math.cos(a) * r, z: b.z + Math.sin(a) * r, yaw };
  }

  /** Nave nova do jogador na base do time dele, voltada para o corredor. */
  #naveNaBase(race, time) {
    const p = this.#pontoNaBase(time);
    const ship = createShip(race, p.x, p.z, p.yaw);
    ship.time = time; // vai no `me`: a predição precisa para o pouso (pousoPermitido)
    return ship;
  }

  #novoDrone() {
    const p = pontoAberto(this.rng);
    const ship = createShip('mechan', p.x, p.z, this.rng() * Math.PI * 2);
    ship.hp = ship.maxHp = DRONE.hp;
    return { id: this.#id(), tipo: 'arnosh', drone: true, nome: DRONE.nome, ship, vivo: true, respawnTick: 0, giro: 0, ultimoDano: 0 };
  }

  /**
   * Ponto do mundo aberto para um Vorax nascer: na parte do mapa ligada à saída da
   * base (sem ilha cercada de rocha), e longe de todo jogador vivo, para ninguém ver
   * monstro brotar do lado.
   */
  #pontoVorax(opcoes) {
    const rede = nav().rede(BASE.x, BASE.z - LIMITE_VORAX - 50);
    let reserva = null;
    for (let t = 0; t < 300; t++) {
      const p = pontoAberto(this.rng, opcoes);
      const c = nav().indice(p.x, p.z);
      if (c < 0 || !rede[c]) continue;
      reserva = p;
      let longe = true;
      for (const j of this.players.values()) {
        if (j.vivo && Math.hypot(j.ship.x - p.x, j.ship.z - p.z) < VORAX.distRenascer) longe = false;
      }
      if (longe) return p;
    }
    return reserva ?? pontoAberto(this.rng, opcoes);
  }

  /** Covil de um Krakor: como o ponto do Vorax, mas bem longe das bases e do corredor. */
  #pontoKrakor() {
    return this.#pontoVorax({ folgaBase: KRAKOR.folgaBase, folgaCorredor: KRAKOR.folgaCorredor });
  }

  #naveVorax() {
    const p = this.#pontoVorax();
    const ship = createShip(VORAX.raca, p.x, p.z, this.rng() * Math.PI * 2);
    ship.hp = ship.maxHp = VORAX.hp;
    return ship;
  }

  #novoVorax() {
    return {
      id: this.#id(),
      tipo: 'vorax',
      drone: true, // inimigo: o cliente pinta de vermelho e o tiro de drone não o acerta
      nome: VORAX.nome,
      ship: this.#naveVorax(),
      vivo: true,
      respawnTick: 0,
      ultimoDano: 0,
      ultimoGolpe: -VORAX_INTERVALO_TICKS,
      alvo: 0,
      ronda: this.rng() < 0.5 ? 1 : -1,
      preso: 0,
      re: 0,
    };
  }

  /**
   * Entra um jogador, no time com menos gente. Retorna o objeto do jogador (o
   * servidor guarda o socket nele), ou null se os dois times estão cheios
   * (o servidor responde 'partida_cheia').
   */
  addPlayer(nome, race) {
    const tamanhos = Array.from({ length: N_TIMES }, () => 0);
    for (const j of this.players.values()) tamanhos[j.time]++;
    const time = this.partida.escolherTime(tamanhos);
    if (time === null) return null;
    const id = this.#id();
    const jogador = {
      id,
      tipo: 'jogador',
      nome: limpaNome(nome),
      time,
      ship: this.#naveNaBase(race, time),
      fila: [],
      ack: 0,
      vivo: true,
      respawnTick: 0,
      ultimoDano: 0,
      protegidoAte: this.tick + PROTECAO_TICKS,
      recall: null, // canalizando: { inicio, fim } em ticks
      rAnt: false, // botão do recall no comando anterior (borda de subida)
      ouro: 0,
      abates: 0,
      mortes: 0,
      ...novaProgressao(), // nivel, xp
      ...novoCombate(), // sequencia, danoPor
      ...novoEquipamento(), // armas, armadura, itens, evoluções (Loja e Evolução)
    };
    prepararNave(jogador); // só as armas de fábrica
    this.players.set(id, jogador);
    this.eventos.push({ e: 'entrou', id, nome: jogador.nome, time });
    return jogador;
  }

  removePlayer(id) {
    const j = this.players.get(id);
    if (!j) return;
    this.players.delete(id);
    this.minas = this.minas.filter((m) => m.dono !== id); // as minas de quem saiu somem
    this.eventos.push({ e: 'saiu', id, nome: j.nome });
  }

  /**
   * Pedido de Loja ou Evolução ({t:'comprar'|'evoluir'|'melhorar'|'usar'}) do
   * jogador `id`. Devolve a resposta para ele (server/servicos.js).
   */
  pedido(id, msg) {
    return this.servicos.pedido(this.players.get(id), msg);
  }

  /** Enfileira um comando do cliente. Comando fora de ordem ou repetido é ignorado. */
  pushInput(id, msg) {
    const j = this.players.get(id);
    if (!j) return;
    const seq = Number(msg?.s);
    if (!Number.isInteger(seq) || seq <= j.ack) return;
    const ultimo = j.fila.length ? j.fila[j.fila.length - 1].seq : j.ack;
    if (seq <= ultimo) return;
    if (j.fila.length >= MAX_FILA) j.fila.shift();
    j.fila.push({ seq, inp: sanitizeInput(msg) });
  }

  /** Nível da arma `kind` de quem atira (Loja); 1 para quem não evolui armas. */
  #nivelArma(ent, kind) {
    return ent.niveisArmas?.[IDX_ARMA[kind]] ?? 1;
  }

  #atira(ent, disparos) {
    for (const { kind, off, ang } of disparos) {
      const tipo = WEAPONS[kind].tipo;
      const nivel = this.#nivelArma(ent, kind);
      if (tipo === 'mina') {
        this.#soltarMina(ent, nivel);
        continue;
      }
      if (tipo === 'choque') {
        this.#choque(ent, nivel);
        continue;
      }
      const b = createBullet(ent.ship, kind, this.#id(), ent.id, off, ang);
      b.drone = !!ent.drone;
      b.time = ent.time; // sem fogo amigo: o tiro atravessa quem é do mesmo time
      b.mult = ent.danoMult ?? (ent.drone ? DRONE.danoMult : 1);
      b.nivel = nivel;
      this.bullets.push(b);
      this.eventos.push({ e: 'tiro', id: b.id, dono: ent.id, kind, x: b.x, y: b.y, z: b.z, vx: b.vx, vy: b.vy, vz: b.vz });
    }
  }

  #iaDrone(d) {
    const s = d.ship;
    const b = baseMaisPerto(s);
    if (Math.hypot(s.x - b.x, s.z - b.z) < DRONE_LIMITE_BASE) {
      // Perto de uma base: dá as costas para ela e volta para o mundo aberto.
      const diff = anguloEntre(s.yaw, Math.atan2(-(s.x - b.x), -(s.z - b.z)));
      return { th: Math.abs(diff) > 1 ? 0.2 : 0.6, tu: Math.max(-1, Math.min(1, diff * 2.5)), b: false, f1: false, f2: false };
    }
    let alvo = null;
    let melhor = DRONE.visao;
    for (const j of this.players.values()) {
      if (!j.vivo || this.#naZonaSegura(j.ship)) continue;
      const dist = Math.hypot(j.ship.x - s.x, j.ship.z - s.z);
      if (dist < melhor) {
        melhor = dist;
        alvo = j;
      }
    }
    if (!alvo && Math.abs(s.x - CORREDOR.x) < DRONE_LIMITE_CORREDOR) {
      // Patrulhando na faixa do corredor: vira para o lado de onde veio.
      const lado = Math.sign(s.x - CORREDOR.x) || 1;
      const diff = anguloEntre(s.yaw, Math.atan2(-lado, 0));
      return { th: Math.abs(diff) > 1 ? 0.2 : 0.6, tu: Math.max(-1, Math.min(1, diff * 2.5)), b: false, f1: false, f2: false };
    }
    if (alvo) {
      const yawAlvo = Math.atan2(-(alvo.ship.x - s.x), -(alvo.ship.z - s.z));
      const diff = anguloEntre(s.yaw, yawAlvo);
      return {
        th: melhor > 70 ? 0.75 : 0.1,
        tu: Math.max(-1, Math.min(1, diff * 2.5)),
        b: false,
        f1: Math.abs(diff) < 0.18 && melhor < DRONE.alcance,
        f2: false,
      };
    }
    // Patrulha: anda devagar, mudando de rumo aos poucos; se parou, vira.
    if (this.tick % 45 === d.id % 45) d.giro = (this.rng() * 2 - 1) * 0.6;
    const vel = Math.hypot(s.vx, s.vz);
    return { th: 0.45, tu: vel < 4 ? 1 : d.giro, b: false, f1: false, f2: false };
  }

  /**
   * Refaz de tempos em tempos o mapa de caça: o caminho, contornando as rochas, de cada
   * ponto do mapa até o jogador caçável mais próximo (vivo e fora da zona segura).
   * Sem ninguém caçável, o mapa leva até a borda da zona segura.
   */
  #atualizarCaca() {
    if (this.caca.campo && this.tick < this.caca.ate) return;
    this.caca.ate = this.tick + VORAX_RECALCULO_TICKS;
    const alvos = [...this.players.values()].filter((j) => j.vivo && !this.#naZonaSegura(j.ship));
    if (!alvos.length) {
      this.caca.campo = nav().campoBase();
      this.caca.alvos = [];
      return;
    }
    const paradas = this.monstros.filter((m) => m.vivo).map((m) => m.ship);
    this.caca.campo = nav().campo(
      alvos.map((j) => j.ship),
      paradas,
    );
    this.caca.alvos = alvos;
  }

  #iaVorax(m) {
    const s = m.ship;
    const thMax = Math.min(1, VORAX.velocidade / (RACES[s.race].velocidade * VEL_FATOR));
    if (m.re > 0) {
      // Preso numa quina: dá ré virando, e depois tenta de novo.
      m.re--;
      return { th: -0.6, tu: m.ronda, b: false, f1: false, f2: false };
    }
    const passo = this.caca.campo ? nav().proximoPonto(this.caca.campo, s.x, s.z) : null;
    let alvo = passo && passo.origem >= 0 ? this.caca.alvos[passo.origem] : null;
    if (alvo && (!alvo.vivo || !this.players.has(alvo.id) || this.#naZonaSegura(alvo.ship))) alvo = null;
    m.alvo = alvo?.id ?? 0;

    let dx = 0;
    let dz = 0;
    let th = thMax;
    if (alvo) {
      const ax = alvo.ship.x - s.x;
      const az = alvo.ship.z - s.z;
      const d = Math.hypot(ax, az);
      if (d < VORAX_PERTO && nav().linhaLivre(s.x, s.z, alvo.ship.x, alvo.ship.z)) {
        // Já vê o jogador: vai direto e, encostado, freia para ficar grudado nele.
        dx = ax;
        dz = az;
        if (d < VORAX.alcance * 0.7) th = 0;
        else if (d < VORAX.alcance * 1.5) th = thMax * 0.5;
      } else if (passo) {
        dx = passo.x - s.x;
        dz = passo.z - s.z;
      }
    } else if (passo && passo.dist > 3) {
      // Ninguém caçável: vai para a borda da zona segura.
      dx = passo.x - s.x;
      dz = passo.z - s.z;
    } else if (passo) {
      // Na borda da zona segura: ronda em volta da base, trocando de sentido às vezes.
      if (this.tick % VORAX_RONDA_TROCA_TICKS === m.id % VORAX_RONDA_TROCA_TICKS) m.ronda = this.rng() < 0.5 ? 1 : -1;
      const b = baseMaisPerto(s);
      const rx = s.x - b.x;
      const rz = s.z - b.z;
      const r = Math.hypot(rx, rz) || 1;
      dx = (-rz / r) * m.ronda + (rx / r) * 0.3;
      dz = (rx / r) * m.ronda + (rz / r) * 0.3;
      th = thMax * 0.45;
    } else {
      // Sem caminho daqui (canto isolado): patrulha devagar como o Arnosh.
      if (this.tick % 45 === m.id % 45) m.ronda = this.rng() < 0.5 ? 1 : -1;
      return { th: thMax * 0.5, tu: Math.hypot(s.vx, s.vz) < 4 ? 1 : m.ronda * 0.3, b: false, f1: false, f2: false };
    }

    // Monstros perto um do outro se empurram, para cercar o jogador em vez de
    // virarem um bolo só.
    const len = Math.hypot(dx, dz) || 1;
    let vx = dx / len;
    let vz = dz / len;
    for (const o of this.monstros) {
      if (o === m || !o.vivo) continue;
      const ox = s.x - o.ship.x;
      const oz = s.z - o.ship.z;
      const d = Math.hypot(ox, oz);
      if (d > 0.01 && d < VORAX_AFASTAR) {
        const k = ((VORAX_AFASTAR - d) / VORAX_AFASTAR) * 1.5;
        vx += (ox / d) * k;
        vz += (oz / d) * k;
      }
    }
    const diff = anguloEntre(s.yaw, Math.atan2(-vx, -vz));
    th *= Math.max(0.15, 1 - Math.abs(diff) / 1.6); // curva fechada: freia para virar

    if (th >= thMax * 0.5 && Math.hypot(s.vx, s.vz) < 4) m.preso++;
    else m.preso = 0;
    if (m.preso > VORAX_PRESO_TICKS) {
      m.preso = 0;
      m.re = VORAX_RE_TICKS;
      m.ronda = -m.ronda;
    }
    return { th, tu: Math.max(-1, Math.min(1, diff * 2.5)), b: false, f1: false, f2: false };
  }

  /** Monstro não cruza a zona segura: se a física o pôs dentro, volta para a borda. */
  #foraDaZona(s) {
    const b = baseMaisPerto(s);
    const rx = s.x - b.x;
    const rz = s.z - b.z;
    const r = Math.hypot(rx, rz);
    if (r >= LIMITE_VORAX) return;
    const ux = r > 1e-6 ? rx / r : 0;
    const uz = r > 1e-6 ? rz / r : Math.sign(-b.z) || -1; // de dentro, sai pelo corredor
    s.x = b.x + ux * LIMITE_VORAX;
    s.z = b.z + uz * LIMITE_VORAX;
    const vr = s.vx * ux + s.vz * uz;
    if (vr < 0) {
      s.vx -= vr * ux;
      s.vz -= vr * uz;
    }
  }

  /** O monstro não entra dentro da nave do jogador: fica a VORAX_ESPACO do centro. */
  #naoEncostar(s) {
    for (const j of this.players.values()) {
      if (!j.vivo) continue;
      const rx = s.x - j.ship.x;
      const rz = s.z - j.ship.z;
      const r = Math.hypot(rx, rz);
      if (r >= VORAX_ESPACO || r < 1e-6) continue;
      s.x = j.ship.x + (rx / r) * VORAX_ESPACO;
      s.z = j.ship.z + (rz / r) * VORAX_ESPACO;
    }
  }

  /** Golpe de garra no jogador mais perto ao alcance (nunca na zona segura). */
  #garra(m) {
    if (m.ship.emp > 0) return; // pulso EMP: sem garra enquanto durar
    if (this.tick - m.ultimoGolpe < VORAX_INTERVALO_TICKS) return;
    let alvo = null;
    let melhor = VORAX.alcance;
    for (const j of this.players.values()) {
      if (!j.vivo || this.#naZonaSegura(j.ship) || Math.abs(j.ship.y - m.ship.y) > 8) continue;
      const d = Math.hypot(j.ship.x - m.ship.x, j.ship.z - m.ship.z);
      if (d < melhor) {
        melhor = d;
        alvo = j;
      }
    }
    if (!alvo) return;
    m.ultimoGolpe = this.tick;
    const s = alvo.ship;
    this.#ferir(alvo, VORAX.dano, m.id, { e: 'garra', id: m.id, x: s.x, y: s.y, z: s.z });
  }

  #naZonaSegura(s) {
    return BASES.some((b) => Math.hypot(s.x - b.x, s.z - b.z) < ZONA_SEGURA);
  }

  /** Na zona segura da base do próprio time (a do outro time não protege). */
  #naPropriaBase(ent) {
    const b = BASES[ent.time];
    return !!b && Math.hypot(ent.ship.x - b.x, ent.ship.z - b.z) < ZONA_SEGURA;
  }

  #protegido(ent) {
    return !ent.drone && (this.tick < ent.protegidoAte || this.#naPropriaBase(ent));
  }

  /** O tiro `b` pode acertar `alvo`? Não acerta o dono, aliado nem (se de drone) drone ou minerador. */
  #podeAcertar(b, alvo) {
    if (alvo.id === b.owner || !alvo.vivo) return false;
    if (b.time !== undefined && b.time === alvo.time) return false; // sem fogo amigo
    if (b.drone && (alvo.drone || alvo.tipo === 'minerador')) return false;
    return true;
  }

  /** Todas as entidades que podem levar dano e estão vivas. */
  #vivos() {
    return [...this.players.values(), ...this.drones, ...this.monstros, ...this.elites, ...this.mineradores.lista].filter(
      (e) => e.vivo,
    );
  }

  /** Mina nova atrás da nave; passando de MINA_MAX, a mais velha do piloto some. */
  #soltarMina(ent, nivel = 1) {
    const minha = this.minas.filter((m) => m.dono === ent.id);
    if (minha.length >= WEAPONS.mina.max) {
      const velha = minha[0];
      this.minas = this.minas.filter((m) => m !== velha);
    }
    const m = novaMina(this.#id(), ent, this.tick);
    m.nivel = nivel; // nível da mina de quem soltou, para o dano da explosão
    this.minas.push(m);
  }

  /**
   * Fere com `dano` todos os inimigos de `fonte` ({id, time, drone}) a `raio` m do
   * ponto e, com `empurrao`, os joga para fora do centro. Devolve quantos pegou.
   */
  #area(fonte, x, y, z, raio, dano, arma, empurrao = 0) {
    let n = 0;
    const como = { owner: fonte.id, time: fonte.time, drone: !!fonte.drone };
    for (const alvo of this.#vivos()) {
      if (!this.#podeAcertar(como, alvo) || !naArea(alvo, x, y, z, raio)) continue;
      n++;
      const s = alvo.ship;
      if (empurrao && !this.#protegido(alvo)) {
        const dx = s.x - x;
        const dz = s.z - z;
        const d = Math.hypot(dx, dz);
        // No centro exato não há "para fora": empurra para a frente do alvo.
        const ux = d > 1e-6 ? dx / d : -Math.sin(s.yaw);
        const uz = d > 1e-6 ? dz / d : -Math.cos(s.yaw);
        s.vx += ux * empurrao;
        s.vz += uz * empurrao;
      }
      this.#ferir(alvo, dano * this.multDanoDe(fonte.id), fonte.id, { e: 'acerto', arma, x: s.x, y: s.y, z: s.z });
    }
    return n;
  }

  /** Onda de choque em volta da nave de `ent`: dano em área e empurrão (os dois crescem com o nível). */
  #choque(ent, nivel = 1) {
    const w = WEAPONS.choque;
    const s = ent.ship;
    const dano = Math.round(w.dano * this.multDano({ nivel, time: ent.time, owner: ent.id }));
    this.eventos.push({ e: 'choque', id: ent.id, time: ent.time, x: s.x, y: s.y, z: s.z, raio: w.area });
    this.#area(ent, s.x, s.y, s.z, w.area, dano, 'choque', efeitoDaArma('choque', nivel).empurrao);
  }

  /**
   * Minas: vencem sozinhas; armadas, explodem quando um inimigo de quem soltou
   * chega a MINA_GATILHO m, ferindo todos os inimigos na área.
   */
  #passoMinas(vivos) {
    const w = WEAPONS.mina;
    this.minas = this.minas.filter((m) => {
      if (this.tick >= m.fimTick) return false;
      if (this.tick < m.armaTick) return true;
      const como = { owner: m.dono, time: m.time, drone: m.drone };
      if (!vivos.some((alvo) => this.#podeAcertar(como, alvo) && naArea(alvo, m.x, m.y, m.z, w.gatilho))) return true;
      this.eventos.push({ e: 'explosao', arma: 'mina', id: m.id, dono: m.dono, time: m.time, x: m.x, y: m.y, z: m.z, raio: w.area });
      const dano = Math.round(w.dano * this.multDano({ nivel: m.nivel, time: m.time, owner: m.dono }));
      this.#area({ id: m.dono, time: m.time, drone: m.drone }, m.x, m.y, m.z, w.area, dano, 'mina');
      return false;
    });
  }

  /**
   * Multiplicador do dano causado pelo jogador `autorId` agora (1 para monstro,
   * drone ou quem já saiu). Ponto único dos multiplicadores de time do atacante:
   * hoje só o bônus 'furia' (objetivo C). Vale no impacto, então só enquanto o
   * bônus dura. Tiro, área (mina e choque, em #area) e dreno passam por aqui.
   */
  multDanoDe(autorId) {
    const j = this.players.get(autorId);
    if (!j) return 1;
    return this.bonus.ativo(j.time, 'furia', this.tick) ? BONUS.furia.mult : 1;
  }

  /**
   * Multiplicador do dano de um golpe de arma pelo nível da arma de quem atirou
   * (Loja: danoMultNivel). `golpe` é a bala, a mina ou {nivel, time, owner} da onda
   * de choque. O bônus de time fica em multDanoDe, aplicado à parte.
   */
  multDano(golpe) {
    return danoMultNivel(golpe.nivel);
  }

  /** Dano de um tiro no impacto (arma × multiplicador do atirador × nível × bônus do time). */
  danoDoTiro(bala) {
    return WEAPONS[bala.kind].dano * (bala.mult ?? 1) * this.multDano(bala) * (bala.drone ? 1 : this.multDanoDe(bala.owner));
  }

  #dano(alvo, bala) {
    const efeito = efeitoDaArma(bala.kind, bala.nivel);
    const dano = Math.round(this.danoDoTiro(bala));
    // Efeitos de arma só pegam em quem pode levar dano. Acertar de novo renova a
    // duração; não soma nem empilha. No lento, se já havia um, fica o mais forte.
    if (efeito && !this.#protegido(alvo)) {
      const s = alvo.ship;
      if (efeito.tipo === 'dreno') {
        alvo.drenoTicks = Math.round(efeito.duracao * TICK_HZ);
        alvo.drenoDono = bala.owner;
        alvo.drenoDps = efeito.dps;
      } else if (efeito.tipo === 'lento') {
        s.lentoMult = s.lento > 0 ? Math.min(s.lentoMult ?? efeito.mult, efeito.mult) : efeito.mult;
        s.lento = Math.max(s.lento || 0, efeito.duracao);
      } else if (efeito.tipo === 'emp') {
        s.en = 0;
        s.emp = Math.max(s.emp || 0, efeito.duracao);
      }
    }
    this.#ferir(alvo, dano, bala.owner, { e: 'acerto', bala: bala.id, x: bala.x, y: bala.y, z: bala.z });
  }

  /**
   * Tira `dano` de vida do alvo (tiro, garra ou dreno) e trata a morte, dando o
   * abate, o ouro e o XP a `autor` (RECOMPENSA pelo tipo do alvo). `ev` é o evento
   * do golpe, completado aqui com alvo e dano (0 se o alvo estava protegido); o
   * dreno, que fere a cada tick, não manda.
   */
  #ferir(alvo, dano, autor, ev) {
    if (this.#protegido(alvo)) {
      if (ev) this.eventos.push({ ...ev, alvo: alvo.id, dano: 0 });
      return;
    }
    // Armadura do piloto (Loja) e defesa dos mineradores do time (Evolução).
    if (alvo.tipo === 'jogador') dano *= 1 - reducaoArmadura(alvo);
    else if (alvo.tipo === 'minerador') dano *= 1 - this.mineradores.atributos(alvo.time, this.tick).defesa;
    alvo.ship.hp -= dano;
    alvo.ultimoDano = this.tick;
    // Dano de jogador inimigo: anota para a assistência.
    const atacante = alvo.tipo === 'jogador' && dano > 0 ? this.players.get(autor) : undefined;
    if (atacante && atacante.time !== alvo.time) alvo.danoPor.set(atacante.id, this.tick);
    if (alvo.recall && dano > 0) this.#pararRecall(alvo, 'dano'); // vale também para a morte
    if (ev) this.eventos.push({ ...ev, alvo: alvo.id, dano });
    if (alvo.ship.hp > 0) return;
    alvo.ship.hp = 0;
    alvo.vivo = false;
    alvo.drenoTicks = 0;
    if (alvo.tipo === 'jogador') {
      const s = tempoRenascer(alvo.nivel, this.partida.fracaoDecorrida(this.tick));
      alvo.respawnTick = this.tick + Math.round(s * TICK_HZ);
    } else {
      alvo.respawnTick = this.tick + (alvo.renascerTicks ?? (alvo.tipo === 'vorax' ? VORAX_RENASCER_TICKS : RESPAWN_TICKS));
    }
    if (alvo.tipo === 'jogador') alvo.mortes++;
    if (alvo.tipo === 'minerador') alvo.carga = 0; // o minério que carregava se perde
    let matador = this.players.get(autor);
    if (matador?.id === alvo.id) matador = undefined;
    const morte = { e: 'morte', id: alvo.id, por: autor, tipo: alvo.tipo, x: alvo.ship.x, y: alvo.ship.y, z: alvo.ship.z };
    if (alvo.time !== undefined) morte.time = alvo.time;
    this.eventos.push(morte);
    if (matador) {
      // Ouro e XP pelo tipo do que morreu (RECOMPENSA: monstro, minerador, jogador).
      matador.abates++;
      const ouroAntes = matador.ouro;
      recompensar(matador, alvo.tipo, this.eventos);
      if (alvo.tipo === 'jogador') this.#abateDeJogador(alvo, matador, morte);
      morte.ouro = matador.ouro - ouroAntes;
    }
    if (alvo.tipo === 'jogador') {
      // Morrer (para quem for) zera a sequência e o registro de dano.
      alvo.sequencia = 0;
      alvo.danoPor.clear();
      morte.renasce = Math.round((alvo.respawnTick - this.tick) / TICK_HZ);
    }
    this.objetivos.aoMorrer(alvo, matador);
  }

  /**
   * Extras do abate de jogador por jogador: assistências (aliados do matador que
   * feriram a vítima na janela, cada um com recompensaAssistencia) e a sequência
   * (o matador soma um; encerrar a da vítima dá ouroEncerrar). Completa o evento
   * de morte com `assist` (ids), `ouroAssist`, `seq` (sequência encerrada),
   * `encerrou` (bônus) e `seqPor` (sequência nova do matador).
   */
  #abateDeJogador(alvo, matador, morte) {
    const assist = [];
    const r = recompensaAssistencia();
    for (const [id, tick] of alvo.danoPor) {
      if (id === matador.id || this.tick - tick > ASSISTENCIA_TICKS) continue;
      const j = this.players.get(id);
      if (!j || j.time !== matador.time) continue;
      j.ouro += r.ouro;
      ganharXp(j, r.xp, this.eventos);
      assist.push(id);
    }
    if (assist.length) {
      morte.assist = assist;
      morte.ouroAssist = r.ouro;
    }
    const bonus = ouroEncerrar(alvo.sequencia);
    if (bonus) {
      matador.ouro += bonus;
      morte.seq = alvo.sequencia;
      morte.encerrou = bonus;
    }
    matador.sequencia++;
    morte.seqPor = matador.sequencia;
  }

  /** Dreno: um tick de dano por tempo. Na zona segura/proteção o tempo corre sem dano. */
  #drenar(ent) {
    if (!(ent.drenoTicks > 0)) return;
    ent.drenoTicks--;
    this.#ferir(ent, (ent.drenoDps ?? WEAPONS.dreno.efeito.dps) * DT * this.multDanoDe(ent.drenoDono), ent.drenoDono);
  }

  #regen(ent) {
    const s = ent.ship;
    if (s.hp >= s.maxHp) return;
    const semDano = this.tick - ent.ultimoDano;
    // Pousada (parada no chão), a nave conserta rápido, como o "Landed: recovers"
    // das naves do AstroN; mas levar tiro interrompe por um instante.
    const noChao = s.pousado && Math.hypot(s.vx, s.vz) < VEL_TOQUE;
    if (noChao && semDano > POUSO_REGEN_ESPERA_TICKS) {
      s.hp = Math.min(s.maxHp, s.hp + s.maxHp * POUSO_REGEN_HP * DT);
    } else if (semDano > REGEN_ESPERA_TICKS) {
      s.hp = Math.min(s.maxHp, s.hp + s.maxHp * VOO_REGEN_HP * DT);
    }
  }

  #respawn(ent) {
    if (ent.tipo === 'vorax') {
      ent.ship = this.#naveVorax();
      ent.preso = ent.re = 0;
    } else if (ent.tipo === 'guardiao') {
      this.objetivos.renascerGuardiao(ent);
    } else if (ent.elite) {
      const p = this.#pontoKrakor();
      renascerElite(ent, p.x, p.z, this.rng() * Math.PI * 2);
    } else if (ent.drone) {
      const novo = this.#novoDrone();
      ent.ship = novo.ship;
    } else {
      ent.ship = this.#naveNaBase(ent.ship.race, ent.time);
      prepararNave(ent); // nível, evoluções, armadura e a posse de armas
      ent.fila.length = 0;
      ent.protegidoAte = this.tick + PROTECAO_TICKS;
      ent.recall = null; // partida nova: quem canalizava já está na base
    }
    ent.vivo = true;
    ent.drenoTicks = 0;
    this.eventos.push({ e: 'renasceu', id: ent.id });
  }

  /**
   * Relógio da partida: começa com o primeiro jogador; no fim de uma, espera a tela
   * de resultado e começa outra do zero (placar, bônus e mineradores zerados, todo
   * mundo renasce na base do time).
   */
  #passoPartida() {
    const vinhaDoFim = this.partida.estado === 'fim';
    const virou = this.partida.passo(this.tick, this.players.size);
    if (virou === 'comecou') {
      this.bonus.limpar();
      if (vinhaDoFim) this.minas = [];
      if (vinhaDoFim) this.objetivos.reiniciar();
      if (vinhaDoFim) this.servicos.reiniciar(); // melhorias dos mineradores dos dois times
      this.mineradores.comecar(this.tick);
      // Depois da tela de fim, todo mundo volta para a base do time. (Na primeira
      // partida, quem entrou acabou de nascer lá.)
      if (vinhaDoFim) {
        for (const j of this.players.values()) {
          if (j.fila.length) j.ack = j.fila[j.fila.length - 1].seq; // descarta sem travar a predição
          // Ouro, XP, nível, armas compradas, armadura, itens e evoluções são da
          // partida (como num MOBA): zeram na seguinte.
          Object.assign(j, novaProgressao(), novoCombate(), novoEquipamento(), { ouro: 0 });
          this.#respawn(j);
        }
      }
      this.eventos.push({ e: 'partida', n: this.partida.numero });
    } else if (virou === 'faseFinal') {
      this.eventos.push({ e: 'faseFinal', mult: MULT_FASE_FINAL, restante: Math.round(this.partida.restante(this.tick)) });
    } else if (virou === 'fim') {
      const { vencedor, placar } = this.partida;
      this.eventos.push({ e: 'fimPartida', vencedor, placar: [...placar] });
    } else if (virou === 'vazia') {
      this.bonus.limpar();
      this.minas = [];
      this.objetivos.reiniciar();
      this.servicos.reiniciar();
      this.mineradores.limpar();
    }
  }

  /**
   * Recall depois de aplicar o comando `inp` na nave de `j`: B apertado agora (borda
   * de subida) começa ou cancela; canalizando, gatilho, boost e velocidade cancelam.
   * Recusa vem como evento ('na_base' ou o motivo de motivoRecall).
   */
  #comandoRecall(j, inp) {
    const apertou = inp.r && !j.rAnt;
    j.rAnt = inp.r;
    if (j.recall) {
      const motivo = apertou ? 'cancelou' : motivoRecall(inp, j.ship);
      if (motivo) this.#pararRecall(j, motivo);
      return;
    }
    if (!apertou) return;
    const motivo = this.#naPropriaBase(j) ? 'na_base' : motivoRecall(inp, j.ship);
    if (motivo) {
      this.eventos.push({ e: 'recall', id: j.id, estado: 'recusado', motivo });
      return;
    }
    j.recall = { inicio: this.tick, fim: this.tick + RECALL_TICKS };
    this.eventos.push({ e: 'recall', id: j.id, estado: 'inicio', s: RECALL_S });
  }

  #pararRecall(j, motivo) {
    j.recall = null;
    this.eventos.push({ e: 'recall', id: j.id, estado: 'cancelado', motivo });
  }

  /**
   * Fim da canalização: a mesma nave aparece num ponto da base do time, voltada para
   * o corredor, como quem renasce (sem a proteção de nascimento: na própria base a
   * zona segura já protege). Vida, energia, armas e efeitos ficam como estavam.
   */
  #chegarNaBase(j) {
    const s = j.ship;
    const de = { x: s.x, y: s.y, z: s.z };
    const p = this.#pontoNaBase(j.time);
    const nova = createShip(s.race, p.x, p.z, p.yaw);
    Object.assign(s, { x: nova.x, y: nova.y, z: nova.z, yaw: nova.yaw, vx: 0, vz: 0, roll: 0, pousado: false, boost: false });
    j.recall = null;
    this.eventos.push({ e: 'recall', id: j.id, estado: 'chegou', de, x: s.x, y: s.y, z: s.z });
  }

  /** Avança o mundo um passo. */
  step() {
    this.tick++;
    this.#passoPartida();

    for (const j of this.players.values()) {
      if (!j.vivo) {
        // Morto: descarta comandos mas confirma o seq, para a predição não acumular.
        if (j.fila.length) j.ack = j.fila[j.fila.length - 1].seq;
        j.fila.length = 0;
        if (this.tick >= j.respawnTick) this.#respawn(j);
        continue;
      }
      const n = Math.min(MAX_INPUTS_TICK, j.fila.length);
      for (let k = 0; k < n; k++) {
        const { seq, inp } = j.fila.shift();
        this.#atira(j, stepShip(j.ship, inp));
        this.#comandoRecall(j, inp);
        j.ack = seq;
      }
      if (j.recall && this.tick >= j.recall.fim) this.#chegarNaBase(j);
      this.#drenar(j);
      if (j.vivo) this.#regen(j);
    }

    for (const d of this.drones) {
      if (!d.vivo) {
        if (this.tick >= d.respawnTick) this.#respawn(d);
        continue;
      }
      this.#atira(d, stepShip(d.ship, this.#iaDrone(d)));
      this.#drenar(d);
      if (d.vivo) this.#regen(d);
    }

    if (this.monstros.length) this.#atualizarCaca();
    for (const m of this.monstros) {
      if (!m.vivo) {
        if (this.tick >= m.respawnTick) this.#respawn(m);
        continue;
      }
      stepShip(m.ship, this.#iaVorax(m)); // não atira: o ataque é a garra
      this.#naoEncostar(m.ship);
      this.#foraDaZona(m.ship);
      this.#garra(m);
      this.#drenar(m);
      this.#regen(m);
    }

    // Mineradores andam só com a partida em andamento (na tela de fim ficam parados).
    if (this.partida.emAndamento) this.mineradores.passo(this.tick);
    for (const m of this.mineradores.lista) if (m.vivo) this.#drenar(m);

    this.ctxElite.tick = this.tick;
    for (const e of this.elites) {
      if (!e.vivo) {
        if (this.tick >= e.respawnTick) this.#respawn(e);
        continue;
      }
      const { inp, disparos } = iaElite(e, this.ctxElite);
      const semCuspe = e.ship.emp > 0; // pulso EMP: o cuspe também para
      this.#atira(e, [...stepShip(e.ship, inp), ...(semCuspe ? [] : disparos)]);
      this.#drenar(e);
      if (e.vivo) this.#regen(e);
    }

    this.objetivos.step();

    const vivos = this.#vivos();
    this.#passoMinas(vivos);
    this.bullets = this.bullets.filter((b) => {
      if (WEAPONS[b.kind].guiado) guiarMissil(b, alvoDoMissil(b, vivos.filter((a) => this.#podeAcertar(b, a))));
      const segue = stepBullet(b);
      if (this.objetivos.tiroNaTorre(b)) return false; // bateu na torre de um objetivo B
      if (!segue) {
        this.eventos.push({ e: 'fim', bala: b.id, x: b.x, y: b.y, z: b.z });
        return false;
      }
      for (const alvo of vivos) {
        if (!this.#podeAcertar(b, alvo)) continue;
        if (bulletHits(b, alvo.ship)) {
          this.#dano(alvo, b);
          return false;
        }
      }
      return true;
    });
  }

  /** O snapshot sai neste tick? */
  ehTickDeSnapshot() {
    return this.tick % SNAP_CADA === 0;
  }

  /**
   * Entidades visíveis para todos (mesma lista para cada jogador). `tipo` diz o
   * que desenhar ('jogador', 'arnosh', 'vorax', 'krakor', 'guardiao' ou
   * 'minerador'); `drone` continua true para todo inimigo do PvE. Jogadores e
   * mineradores trazem `time`; os mineradores também `carga` (minério no contêiner)
   * e `minerando`. Jogador traz `nivel`.
   */
  entidades() {
    const lista = [];
    const add = (e) => {
      const ent = {
        id: e.id,
        nome: e.nome,
        tipo: e.tipo,
        drone: !!e.drone,
        vivo: e.vivo,
        race: e.ship.race,
        x: +e.ship.x.toFixed(2),
        y: +e.ship.y.toFixed(2),
        z: +e.ship.z.toFixed(2),
        yaw: +e.ship.yaw.toFixed(3),
        roll: +e.ship.roll.toFixed(3),
        hp: Math.ceil(e.ship.hp),
        maxHp: e.ship.maxHp,
        boost: e.ship.boost,
        pousado: e.ship.pousado,
        dreno: e.drenoTicks > 0,
        lento: e.ship.lento > 0,
        emp: e.ship.emp > 0,
      };
      if (e.time !== undefined) ent.time = e.time;
      if (e.nivel !== undefined) ent.nivel = e.nivel;
      if (e.recall) ent.recall = +Math.min(1, (this.tick - e.recall.inicio) / (e.recall.fim - e.recall.inicio)).toFixed(2);
      if (e.tipo === 'minerador') {
        ent.carga = e.carga;
        ent.minerando = e.estado === 'minerando';
      }
      lista.push(ent);
    };
    for (const j of this.players.values()) add(j);
    for (const d of this.drones) add(d);
    for (const m of this.monstros) add(m);
    for (const m of this.mineradores.lista) add(m);
    for (const e of this.elites) add(e);
    return lista;
  }

  /**
   * Snapshot para um jogador: estado completo da própria nave + o resto do mundo.
   * Também o nível e o XP dele (xp dentro do nível, xpProx para o próximo; 0 no
   * máximo) e o estado dos objetivos (`obj`, igual para todos: cache por tick).
   */
  snapshotPara(j, ents, eventos) {
    if (this.cacheObj?.tick !== this.tick) {
      this.cacheObj = { tick: this.tick, obj: this.objetivos.estado(), minas: this.#minasSnap(), guiados: this.#guiadosSnap() };
    }
    return {
      t: 'snap',
      tick: this.tick,
      ack: j.ack,
      vivo: j.vivo,
      renasceEm: j.vivo ? 0 : Math.max(0, +((j.respawnTick - this.tick) / TICK_HZ).toFixed(1)),
      time: j.time,
      me: { ...j.ship, ...this.servicos.paraMe(j) },
      ouro: j.ouro,
      abates: j.abates,
      mortes: j.mortes,
      partida: this.partida.paraSnapshot(this.tick),
      bonus: this.bonus.paraSnapshot(this.tick),
      nivel: j.nivel,
      xp: j.xp,
      xpProx: xpParaNivel(j.nivel),
      obj: this.cacheObj.obj,
      melhorias: this.servicos.niveis[j.time], // níveis das melhorias dos mineradores do time
      minas: this.cacheObj.minas,
      guiados: this.cacheObj.guiados,
      ents,
      ev: eventos,
    };
  }

  /** Minas no mapa para o snapshot: posição, time de quem soltou e se já armou. */
  #minasSnap() {
    return this.minas.map((m) => ({
      id: m.id,
      dono: m.dono,
      time: m.time,
      x: +m.x.toFixed(2),
      y: +m.y.toFixed(2),
      z: +m.z.toFixed(2),
      armada: this.tick >= m.armaTick,
    }));
  }

  /** Mísseis teleguiados em voo, para o cliente corrigir a curva que ele não prevê. */
  #guiadosSnap() {
    return this.bullets
      .filter((b) => WEAPONS[b.kind].guiado)
      .map((b) => ({ id: b.id, x: +b.x.toFixed(2), y: +b.y.toFixed(2), z: +b.z.toFixed(2), vx: +b.vx.toFixed(2), vy: +b.vy.toFixed(2), vz: +b.vz.toFixed(2) }));
  }

  /** Esvazia a lista de eventos acumulados desde o último snapshot. */
  tirarEventos() {
    const ev = this.eventos;
    this.eventos = [];
    return ev;
  }
}

