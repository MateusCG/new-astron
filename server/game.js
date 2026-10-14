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
// Armas (catálogo do Astro-N original em shared/armas.js): o stepShip devolve os
// disparos de cada encaixe e server/golpes.js cria e resolve tudo o que sai deles
// (projéteis com rajada, leque, área, atravessar, dividir e teleguiado; novas;
// minas e campos; dispositivos na própria nave) com os números da versão da arma
// (o nível dela, evoluído na Loja). Efeitos de arma são só do servidor: o que mexe
// em movimento, tiro ou energia vai para a nave (o stepShip conta e a predição lê
// pelo `me`); o resto fica na entidade (ent.st). O dreno de HP segue em
// drenoTicks/drenoDono/drenoDps, aplicado aqui a cada tick, respeitando a zona
// segura e a proteção de nascimento. Todo dano passa por #ferir, que pergunta aos
// golpes o dano final (invulnerável, escudo, resistência, vulnerável, fraco,
// conversor, recuo). As entidades do snapshot trazem `dreno`, `lento`, `emp` e `fx`
// (os outros efeitos visíveis) para todos desenharem; quem está invisível sai da
// lista dos inimigos dele, salvo de perto.
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
// Torretas do corredor (server/torretas.js) e a escolta armada dos mineradores
// (server/escoltas.js): ganchos no step (andar e atirar), no tiro que bate numa
// torreta (tiroNaTorreta, como a torre B), no dano em área (#area) e no snapshot
// (`torretas`; a escolta é uma entidade como o minerador). Os tiros delas entram
// por adicionarTiro, com `fonte` e `time` no evento para o cliente pintar.
//
// Loja e Evolução (server/servicos.js): pedidos do cliente atendidos em pedido();
// a posse de armas, a armadura, os itens e a nave comprada (tier da linha da raça e
// classe, shared/naves.js) ficam no jogador e vão para cada nave nova em
// prepararNave (nascimento e renascimento). A armadura da Loja e a defesa dos
// mineradores reduzem o dano em #ferir.
//
// Nível das armas (Loja): é a versão do original (V1 a V5) e vai na nave (s.niveis,
// copiado de j.niveisArmas por prepararNave): o stepShip e os golpes leem a versão
// dali. Monstro e minerador atiram sempre no nível 1.
//
// Recall (shared/recall.js): o campo r do comando é um pulso; a borda de subida
// (j.rAnt) começa ou cancela a canalização no passo daquele comando, e os mesmos
// comandos cancelam com gatilho, boost ou velocidade (#comandoRecall). Dano cancela
// em #ferir. Terminada, a nave vai para um ponto da base do time como no
// renascimento, mas é a mesma nave (vida, energia, nível e equipamento ficam); a
// fila de comandos segue, e o cliente reconcilia o salto pelo `me`.

import { DT, WEAPONS, createShip, sanitizeInput, stepShip, VEL_TOQUE, velocidadeBase } from '../shared/sim.js';
import { BASE, BASES, CORREDOR } from '../shared/terrain.js';
import { pontoAberto } from '../shared/obstaculos.js';
import { racaJogavel, RACAS_JOGAVEIS, classeOuPadrao } from '../shared/naves.js';
import { MapaNavegacao } from './navegacao.js';
import { Partida, N_TIMES, MULT_FASE_FINAL } from './partida.js';
import { Mineradores } from './mineradores.js';
import { Escoltas } from './escoltas.js';
import { Torretas } from './torretas.js';
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
import { Golpes, INVISIVEL_VISTO_M } from './golpes.js';
import { RECALL_S, motivoRecall } from '../shared/recall.js';

export const TICK_HZ = 30;
const SNAP_CADA = 2; // ticks entre snapshots (15 Hz)
const MAX_INPUTS_TICK = 4;
const MAX_FILA = 30;
const RESPAWN_TICKS = 3 * TICK_HZ; // drones; o do jogador cresce (tempoRenascer em server/progressao.js)
const ASSISTENCIA_TICKS = ASSISTENCIA_JANELA_S * TICK_HZ;
const REGEN_ESPERA_TICKS = 5 * TICK_HZ;
// Nave de jogador: a regeneração é a da nave (shared/naves.js, do original). Voando,
// regenHpVoo (HP/s, só as Bellico têm), contínua, mesmo levando dano; pousada e
// parada, regenHpPousada (HP/s), depois de POUSO_REGEN_ESPERA_TICKS sem dano (levar
// tiro interrompe por um instante). Monstros, mineradores e escoltas seguem as
// frações do HP máximo: VOO_REGEN_HP sem levar dano há REGEN_ESPERA_TICKS.
const VOO_REGEN_HP = 0.03; // fração do HP máximo por segundo, voando (sem nave do catálogo)
const POUSO_REGEN_HP = 0.08; // fração do HP máximo por segundo, pousada (sem nave do catálogo)
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
   *   duracaoPartidaS?: number, intervaloFimS?: number, faseFinalS?: number, torretas?: boolean }} [opcoes]
   * drones = Arnosh, monstros = Vorax, elites = Krakor (os guardiões dos objetivos C
   * sempre existem). torretas = false deixa as torretas de pé mas sem atirar (testes
   * que brigam no meio do corredor).
   */
  constructor({
    rng = Math.random,
    drones = N_DRONES,
    monstros = N_MONSTROS,
    elites = N_KRAKOR,
    duracaoPartidaS,
    intervaloFimS,
    faseFinalS,
    torretas = true,
  } = {}) {
    this.rng = rng;
    this.torretasAtiram = torretas;
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
    this.escoltas = new Escoltas(this);
    for (let i = 0; i < drones; i++) this.drones.push(this.#novoDrone());
    for (let i = 0; i < monstros; i++) this.monstros.push(this.#novoVorax());
    for (let i = 0; i < elites; i++) {
      const p = this.#pontoKrakor();
      this.elites.push(novaElite('krakor', this.#id(), p.x, p.z, this.rng() * Math.PI * 2));
    }
    this.objetivos = new Objetivos(this);
    this.torretas = new Torretas(this);
    this.servicos = new Servicos(this);
    this.danoMultDrone = DRONE.danoMult; // tiro de drone tira menos (server/golpes.js lê)
    this.golpes = new Golpes(this, {
      ferir: (alvo, dano, autor, ev, opcoes) => this.#ferir(alvo, dano, autor, ev, opcoes),
      podeAcertar: (b, alvo) => this.#podeAcertar(b, alvo),
      protegido: (ent) => this.#protegido(ent),
    });
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

  /** Nave nova do jogador na base do time dele, voltada para o corredor (a nave da classe e do tier dele). */
  #naveNaBase(race, time, classe, tier = 0) {
    const p = this.#pontoNaBase(time);
    const ship = createShip(race, p.x, p.z, p.yaw, classe, tier);
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
   * Entra um jogador, no time com menos gente, na primeira nave da linha da raça e
   * classe (shared/naves.js). Retorna o objeto do jogador (o servidor guarda o
   * socket nele), ou null se os dois times estão cheios (o servidor responde
   * 'partida_cheia'). Quem valida a raça é o servidor (server/index.js recusa raça
   * bloqueada ou inválida antes); aqui, raça sem naves vira a primeira jogável e
   * classe inválida vira CLASSE_PADRAO.
   */
  addPlayer(nome, race, classe) {
    const tamanhos = Array.from({ length: N_TIMES }, () => 0);
    for (const j of this.players.values()) tamanhos[j.time]++;
    const time = this.partida.escolherTime(tamanhos);
    if (time === null) return null;
    const id = this.#id();
    const raca = racaJogavel(race) ? race : RACAS_JOGAVEIS[0];
    const cls = classeOuPadrao(classe);
    const jogador = {
      id,
      tipo: 'jogador',
      nome: limpaNome(nome),
      time,
      classe: cls, // escolhida na entrada; o tier (nave da linha) é da partida, em novoEquipamento
      ship: this.#naveNaBase(raca, time, cls),
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
      ...novoEquipamento(), // armas, armadura, itens, tier da nave (Loja e Evolução)
    };
    prepararNave(jogador); // a primeira nave da linha, só com as armas de fábrica
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

  /**
   * Tiro que não sai de nave de jogador nem de monstro (torreta, escolta): entra no
   * mundo e vira o evento 'tiro', com `extra` ({fonte, time}) para o cliente pintar
   * na cor do time.
   */
  adicionarTiro(b, extra = {}) {
    this.bullets.push(b);
    this.eventos.push({ e: 'tiro', id: b.id, dono: b.owner, kind: b.kind, x: b.x, y: b.y, z: b.z, vx: b.vx, vy: b.vy, vz: b.vz, ...extra });
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

  /** Os disparos de `ent` (stepShip ou a IA dos elites) viram golpes (server/golpes.js). */
  #atira(ent, disparos) {
    this.golpes.disparar(ent, disparos);
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
    const thMax = Math.min(1, VORAX.velocidade / velocidadeBase(s));
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
    this.#ferir(alvo, VORAX.dano, m.id, { e: 'garra', id: m.id, x: s.x, y: s.y, z: s.z }, { tipoDano: 'fisico' });
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

  /** O tiro `b` pode acertar `alvo`? Não acerta o dono, aliado nem (se de drone) drone, minerador ou escolta. */
  #podeAcertar(b, alvo) {
    if (alvo.id === b.owner || !alvo.vivo) return false;
    if (b.time !== undefined && b.time === alvo.time) return false; // sem fogo amigo
    if (b.drone && (alvo.drone || alvo.tipo === 'minerador' || alvo.tipo === 'escolta')) return false;
    return true;
  }

  /** As entidades vivas agora (server/golpes.js usa para área, mira e suporte). */
  vivosAgora() {
    return this.#vivos();
  }

  /** Todas as entidades que podem levar dano e estão vivas. */
  #vivos() {
    return [
      ...this.players.values(),
      ...this.drones,
      ...this.monstros,
      ...this.elites,
      ...this.mineradores.lista,
      ...this.escoltas.lista,
    ].filter((e) => e.vivo);
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
   * Dano de um tiro no impacto, sem os estados do alvo (torre B e torretas usam):
   * o do golpe × multiplicador do NPC × bônus do time de quem atirou.
   */
  danoDoTiro(bala) {
    return (bala.dano ?? WEAPONS[bala.kind]?.dano ?? 0) * (bala.mult ?? 1) * (bala.drone ? 1 : this.multDanoDe(bala.owner));
  }

  /**
   * Tira `dano` de vida do alvo (tiro, garra ou dreno) e trata a morte, dando o
   * abate, o ouro e o XP a `autor` (RECOMPENSA pelo tipo do alvo). `ev` é o evento
   * do golpe, completado aqui com alvo e dano (0 se o alvo estava protegido); o
   * dreno, que fere a cada tick, não manda. `opcoes`: tipoDano (laser, físico,
   * elétrico) e direto (false no dreno e no recuo: a invulnerabilidade não segura).
   */
  #ferir(alvo, dano, autor, ev, opcoes = {}) {
    if (!alvo.vivo) return; // já morreu neste tick (área e efeito no mesmo golpe)
    if (this.#protegido(alvo)) {
      if (ev) this.eventos.push({ ...ev, alvo: alvo.id, dano: 0 });
      return;
    }
    // Estados das armas (invulnerável, escudo, resistência, vulnerável, fraco...).
    dano = this.golpes.modificarDano(alvo, dano, autor, opcoes);
    // Armadura do piloto (Loja) e defesa dos mineradores do time (Evolução).
    if (alvo.tipo === 'jogador') dano *= 1 - reducaoArmadura(alvo);
    else if (alvo.tipo === 'minerador') dano *= 1 - this.mineradores.atributos(alvo.time, this.tick).defesa;
    alvo.ship.hp -= dano;
    alvo.ultimoDano = this.tick;
    // Dano de jogador inimigo: anota para a assistência.
    const atacante = alvo.tipo === 'jogador' && dano > 0 ? this.players.get(autor) : undefined;
    if (atacante && atacante.time !== alvo.time) alvo.danoPor.set(atacante.id, this.tick);
    if (alvo.recall && dano > 0) this.#pararRecall(alvo, 'dano'); // vale também para a morte
    if (ev) this.eventos.push({ ...ev, alvo: alvo.id, dano: +dano.toFixed(1) });
    if (alvo.ship.hp > 0) return;
    alvo.ship.hp = 0;
    alvo.vivo = false;
    alvo.drenoTicks = 0;
    alvo.st = {};
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
    this.#ferir(ent, (ent.drenoDps ?? 0) * DT * this.multDanoDe(ent.drenoDono), ent.drenoDono, null, { direto: false });
  }

  #regen(ent) {
    const s = ent.ship;
    if (s.hp >= s.maxHp) return;
    const semDano = this.tick - ent.ultimoDano;
    // Pousada (parada no chão), a nave conserta rápido, como o "Landed: recovers"
    // das naves do AstroN; mas levar tiro interrompe por um instante.
    const noChao = s.pousado && Math.hypot(s.vx, s.vz) < VEL_TOQUE;
    if (ent.tipo === 'jogador') {
      const porS = noChao ? (semDano > POUSO_REGEN_ESPERA_TICKS ? s.regenHpPousada : 0) : s.regenHpVoo;
      if (porS > 0) s.hp = Math.min(s.maxHp, s.hp + porS * DT);
    } else if (noChao && semDano > POUSO_REGEN_ESPERA_TICKS) {
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
      ent.ship = this.#naveNaBase(ent.ship.race, ent.time, ent.classe, ent.tier);
      prepararNave(ent); // nave da linha, nível, armadura e a posse de armas
      ent.fila.length = 0;
      ent.protegidoAte = this.tick + PROTECAO_TICKS;
      ent.recall = null; // partida nova: quem canalizava já está na base
    }
    ent.vivo = true;
    ent.drenoTicks = 0;
    ent.st = {};
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
      if (vinhaDoFim) this.golpes.limpar();
      if (vinhaDoFim) this.objetivos.reiniciar();
      if (vinhaDoFim) this.servicos.reiniciar(); // melhorias dos mineradores dos dois times
      if (vinhaDoFim) this.torretas.reiniciar(); // todas de pé, nível 1
      this.mineradores.comecar(this.tick);
      this.escoltas.comecar(this.tick);
      // Depois da tela de fim, todo mundo volta para a base do time. (Na primeira
      // partida, quem entrou acabou de nascer lá.)
      if (vinhaDoFim) {
        for (const j of this.players.values()) {
          if (j.fila.length) j.ack = j.fila[j.fila.length - 1].seq; // descarta sem travar a predição
          // Ouro, XP, nível, armas compradas, armadura, itens e a nave comprada
          // (tier) são da partida (como num MOBA): zeram na seguinte. A raça e a
          // classe ficam (são escolha da entrada).
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
      this.golpes.limpar();
      this.objetivos.reiniciar();
      this.servicos.reiniciar();
      this.torretas.reiniciar();
      this.mineradores.limpar();
      this.escoltas.limpar();
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

    // Mineradores e escoltas andam só com a partida em andamento (na tela de fim
    // ficam parados).
    if (this.partida.emAndamento) {
      this.mineradores.passo(this.tick);
      this.escoltas.passo(this.tick);
    }
    for (const m of this.mineradores.lista) if (m.vivo) this.#drenar(m);
    for (const e of this.escoltas.lista) if (e.vivo) this.#drenar(e);

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
    this.torretas.passo(this.partida.emAndamento && this.torretasAtiram);

    this.golpes.passo(this.#vivos());
  }

  /** O snapshot sai neste tick? */
  ehTickDeSnapshot() {
    return this.tick % SNAP_CADA === 0;
  }

  /**
   * Entidades visíveis para todos (mesma lista para cada jogador). `tipo` diz o
   * que desenhar ('jogador', 'arnosh', 'vorax', 'krakor', 'guardiao', 'minerador'
   * ou 'escolta'); `drone` continua true para todo inimigo do PvE. Jogadores,
   * mineradores e escoltas trazem `time`; os mineradores também `carga` (minério no contêiner)
   * e `minerando`. Jogador traz `nivel`, `classe` e `tier` (a nave a desenhar).
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
      const fx = this.golpes.visiveis(e);
      if (fx.length) ent.fx = fx;
      if (e.time !== undefined) ent.time = e.time;
      if (e.nivel !== undefined) ent.nivel = e.nivel;
      if (e.tipo === 'jogador') {
        // Qual nave desenhar: raça (acima), classe e tier (muda ao evoluir).
        ent.classe = e.ship.classe;
        ent.tier = e.ship.tier;
        ent.arm = e.ship.encaixes; // armas do Z e do X (o modelo na asa de cada uma)
      }
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
    for (const e of this.escoltas.lista) add(e);
    for (const e of this.elites) add(e);
    return lista;
  }

  /**
   * Snapshot para um jogador: estado completo da própria nave + o resto do mundo.
   * Também o nível e o XP dele (xp dentro do nível, xpProx para o próximo; 0 no
   * máximo), o estado dos objetivos (`obj`) e das torretas (`torretas`), iguais
   * para todos: cache por tick.
   */
  snapshotPara(j, ents, eventos) {
    if (this.cacheObj?.tick !== this.tick) {
      this.cacheObj = {
        tick: this.tick,
        obj: this.objetivos.estado(),
        torretas: this.torretas.estado(),
        minas: this.#minasSnap(),
        guiados: this.#guiadosSnap(),
      };
    }
    // Invisível (Camuflagem) sai da lista de quem é do outro time, salvo de perto.
    const ocultos = this.#ocultosPara(j);
    if (ocultos.size) ents = ents.filter((e) => !ocultos.has(e.id));
    return {
      t: 'snap',
      tick: this.tick,
      ack: j.ack,
      vivo: j.vivo,
      renasceEm: j.vivo ? 0 : Math.max(0, +((j.respawnTick - this.tick) / TICK_HZ).toFixed(1)),
      time: j.time,
      me: { ...j.ship, ...this.servicos.paraMe(j) },
      st: this.golpes.paraMe(j), // estados das armas no próprio jogador (s restantes), para o HUD
      ouro: j.ouro,
      abates: j.abates,
      mortes: j.mortes,
      partida: this.partida.paraSnapshot(this.tick),
      bonus: this.bonus.paraSnapshot(this.tick),
      nivel: j.nivel,
      xp: j.xp,
      xpProx: xpParaNivel(j.nivel),
      obj: this.cacheObj.obj,
      torretas: this.cacheObj.torretas,
      melhorias: this.servicos.niveis[j.time], // níveis das melhorias dos mineradores do time
      minas: this.cacheObj.minas,
      guiados: this.cacheObj.guiados,
      ents,
      ev: eventos,
    };
  }

  /** Ids dos jogadores invisíveis para `j` (do outro time e longe da nave dele). */
  #ocultosPara(j) {
    const ocultos = new Set();
    for (const o of this.players.values()) {
      if (o.time === j.time || !this.golpes.invisivel(o)) continue;
      if (j.vivo && Math.hypot(o.ship.x - j.ship.x, o.ship.z - j.ship.z) <= INVISIVEL_VISTO_M) continue;
      ocultos.add(o.id);
    }
    return ocultos;
  }

  /**
   * Minas e campos no mapa para o snapshot: posição, time de quem soltou, se já
   * armou, a arma (kind, nv, p: o golpe a desenhar), campo e o raio (gatilho da mina
   * ou área do campo).
   */
  #minasSnap() {
    return this.minas.map((m) => ({
      id: m.id,
      dono: m.dono,
      time: m.time,
      kind: m.kind,
      nv: m.nivel,
      p: m.g?.prof ?? 0,
      campo: m.campo || undefined,
      raio: +((m.campo ? m.g?.area : m.g?.gatilho) ?? 0).toFixed(1),
      x: +m.x.toFixed(2),
      y: +m.y.toFixed(2),
      z: +m.z.toFixed(2),
      armada: this.tick >= m.armaTick,
    }));
  }

  /** Tiros que curvam em voo (teleguiados), para o cliente corrigir a curva que ele não prevê. */
  #guiadosSnap() {
    return this.bullets
      .filter((b) => b.g?.guia)
      .map((b) => ({ id: b.id, kind: b.kind, nv: b.nivel, p: b.prof, x: +b.x.toFixed(2), y: +b.y.toFixed(2), z: +b.z.toFixed(2), vx: +b.vx.toFixed(2), vy: +b.vy.toFixed(2), vz: +b.vz.toFixed(2) }));
  }

  /** Esvazia a lista de eventos acumulados desde o último snapshot. */
  tirarEventos() {
    const ev = this.eventos;
    this.eventos = [];
    return ev;
  }
}

