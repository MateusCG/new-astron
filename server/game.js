// Mundo do jogo no servidor: um mapa, as naves dos jogadores, os monstros da jungle
// (server/jungle.js) e os tiros. Roda em passo fixo de 30 Hz (DT de shared/sim.js) e manda o
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
// (o nível dela, evoluído por instância: evoluirItem). Efeitos de arma são só do servidor: o que mexe
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
// (de nave e de time) em server/bonus.js. Aqui ficam só os ganchos: o jogador entra no
// time com menos gente e nasce na base dele; tiro de aliado atravessa aliado (sem
// fogo amigo, nem nos mineradores); a zona segura só protege o time dono da base
// (na base do outro time você leva dano normalmente). Monstro nenhum entra em base
// nenhuma: as duas são território dos jogadores.
//
// XP, nível e ouro por abate ficam em server/progressao.js (na morte, em #ferir); os
// objetivos do mapa (torre do buff de suporte, plataformas de pouso e o Núcleo de
// He-3) em server/objetivos.js (no step, no tiro que bate na torre e na morte do
// Núcleo, que é uma entidade como os monstros), que ligam os bônus em this.bonus. A
// jungle (server/jungle.js: acampamentos, buff de ataque, Medusa e sonda) tem
// ganchos no step (jungle.passo), no dano (jungle.provocar: a raiva dos monstros),
// na morte (jungle.aoMorrer: recarga do lugar e bônus do golpe final), na partida
// (comecar/limpar) e no snapshot (entidades `monstro` e o `obj` de BA0, BA1, SONDA
// e MEDUSA).
//
// Bônus (server/bonus.js): aplicados aqui. O dano em multDanoDe ('ataque' da nave e
// 'medusa' do time); a velocidade e a energia do suporte na nave, a cada tick antes
// dos comandos (#bonusDaNave: s.velMult e s.regenEn, que vão no `me` e o stepShip da
// predição lê); o HP do suporte em #regen. #ferir anota quem levou e quem causou dano
// (levouDanoTick, causouDanoTick: a 'sonda' fica suspensa em combate e a plataforma
// de pouso cancela) e quem agrediu alguém de um time (agrediu: as torres sentinela
// preferem esse alvo). Morrer limpa os bônus de nave.
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
// torreta (tiroNaTorreta, como a torre do buff de suporte), no dano em área (#area) e no snapshot
// (`torretas`; a escolta é uma entidade como o minerador). Os tiros delas entram
// por adicionarTiro, com `fonte` e `time` no evento para o cliente pintar.
//
// Loja e Evolução (server/servicos.js): pedidos do cliente atendidos em pedido();
// o inventário por instância (j.inv: armas e equipamentos, cada um na sua versão),
// o que está equipado, os pontos do piloto, os itens e a nave comprada (tier da
// linha da raça e classe, shared/naves.js) ficam no jogador e vão para cada nave
// nova em prepararNave (nascimento e renascimento), com o status do piloto em
// j.status (statusDoPiloto de shared/status.js).
//
// Status no dano (o servidor é quem aplica; números em shared/status.js e
// shared/equipamentos.js): o dano que sai de um jogador é × (1 + poder) do tipo de
// dano da arma (multDanoDe, o ponto único dos multiplicadores do atacante: tiro,
// área, nova, mina, campo, dreno, torre e torretas); em #ferir, o golpe direto pode
// sair crítico (chance `critico` do atacante, × CRITICO_MULT, sorteio só aqui com o
// rng do World), a resistência do alvo jogador àquele tipo, menos a penetração do
// atacante, tira a sua parte, os estados das armas agem (server/golpes.js:
// modificarDano, com o escudo de arma), a defesa dos mineradores do time conta, e o
// ESCUDO do equipamento (s.escudo) segura o que sobrou antes do HP. O escudo
// recupera regenEscudo por s depois de ESCUDO_ESPERA_S sem levar dano (no meio da
// briga ele não volta; quem recua, sim), enche rápido pousado na própria base, como
// o HP, e renasce cheio.
//
// Nível das armas (evoluirItem): é a versão do original (V1 a V8) da instância e vai
// na nave por instância (s.armasInst, tirado de j.inv por prepararNave; até duas
// cópias da mesma arma, cada uma na sua versão): o comando escolhe a instância de
// cada encaixe e o stepShip deixa a versão em s.nivEnc, que os disparos levam (nivel)
// para os golpes. Monstro e minerador atiram sempre no nível 1.
//
// Computador (server/bots.js): jogador sem socket, marcado com `ia` (o cérebro).
// Quantos, se escolhe na tela inicial, ANTES de decolar: a entrada traz iaMeu (0 a
// 2) e iaInimigo (0 a 3), saneados em computadoresDaEntrada (server/partida.js), e
// addPlayer completa as vagas logo depois de pôr o humano no time dele. Os números
// são o MÍNIMO de vagas ocupadas que ele quer: o seu time com pelo menos 1 + iaMeu
// (você conta) e o outro com pelo menos iaInimigo, contando gente e computador. Com
// a partida já rodando, o servidor só ACRESCENTA computadores até chegar nisso: não
// tira ninguém (os computadores que outro piloto escolheu ficam), não passa de
// MAX_POR_TIME e gente que já está no time ocupa a vaga antes do computador. Dentro
// da partida não se põe nem se tira computador (o pedido {t:'ia'} é recusado em
// server/index.js). A cada tick a IA põe um comando na fila dele (Bots.passo) e daí
// em diante ele é um jogador como outro qualquer. Humano que chega com os dois
// times cheios fica com a vaga de um computador (gente tem prioridade); quando sai
// o último humano, os computadores saem junto (e a partida volta a esperar).
//
// Recall (shared/recall.js): o campo r do comando é um pulso; a borda de subida
// (j.rAnt) começa ou cancela a canalização no passo daquele comando, e os mesmos
// comandos cancelam com gatilho, boost ou velocidade (#comandoRecall). Dano cancela
// em #ferir. Terminada, a nave vai para um ponto da base do time como no
// renascimento, mas é a mesma nave (vida, energia, nível e equipamento ficam); a
// fila de comandos segue, e o cliente reconcilia o salto pelo `me`.
//
// Campo de força das bases (CAMPOS_BASE em shared/terrain.js; pedido do Mateus): o
// tiro para nele (shared/sim.js, stepBullet) e a área não o atravessa
// (server/armas.js, naArea); a nave de jogador (gente ou computador) do OUTRO time
// que encosta no plano (o círculo dela, SHIP_RADIUS) ou o cruza no tick (teleporte
// inclusive) é destruída na hora, aqui (#campoDaBase), sem escudo, invulnerável nem
// proteção que segure. Ninguém ganha nada com isso (nem ouro, nem XP, nem abate, nem
// assistência): é morte como outra qualquer para o renascimento e a sequência, e o
// evento 'morte' sai com `por: null`, `motivo: 'campo'` e `campo` (time dono). Naves do
// time dono, mineradores e escoltas passam livres (a física não vira parede). Para os
// monstros, o bolsão atrás do campo conta como zona segura (#naZonaSegura).
//
// Teleporte até o companheiro ({t:'teleportar', alvo}, pedidoTeleporte): o piloto
// clica no card de um aliado de nave Functional na barra do time e a nave salta na
// hora para junto dele, sem recarga (pedido do Mateus: "imediatamente"; a nave
// Functional é o ponto de reunião do time), pagando em energia o custo do original
// (custoTeleporte em shared/sim.js: cresce com o nível e com a diferença de nível
// entre os dois). O servidor valida tudo (quem pede vivo, partida em andamento ou
// modo de teste, alvo do mesmo time, outro piloto, vivo e Functional, energia que
// pague o salto), desconta a energia e põe a nave num ponto livre em volta do companheiro (#pontoJuntoA:
// atrás dele primeiro, chão livre como o teleporte das armas, pontoLivre), na altura
// de voo, parada e decolada, olhando para onde ele olha; recall em andamento cancela.
// Como no recall, é a mesma nave e a fila de comandos segue: o cliente reconcilia
// pelo `me` e o evento 'teleporte' corta a suavização da predição e da câmera.

import { DT, WEAPONS, createShip, sanitizeInput, stepShip, VEL_TOQUE, velocidadeBase, pousadaNaBase, BASE_CURA_FRAC, forward, HOVER, TELEPORTE_FOLGA, custoTeleporte, SHIP_RADIUS } from '../shared/sim.js';
import { BASE, BASES, CAMPOS_BASE, heightAt, cruzaCampoBase, encostaNoCampo, dentroDoCampo } from '../shared/terrain.js';
import { pontoLivre } from '../shared/obstaculos.js';
import { racaJogavel, RACAS_JOGAVEIS, classeOuPadrao } from '../shared/naves.js';
import { Partida, N_TIMES, MULT_FASE_FINAL, MAX_POR_TIME, computadoresDaEntrada } from './partida.js';
import { Mineradores } from './mineradores.js';
import { Escoltas } from './escoltas.js';
import { Torretas } from './torretas.js';
import { Bonus } from './bonus.js';
import { Objetivos } from './objetivos.js';
import {
  novaProgressao,
  novoCombate,
  recompensar,
  ganharXp,
  xpParaNivel,
  NIVEL_MAX,
  tempoRenascer,
  ouroEncerrar,
  recompensaAssistencia,
  ouroAbateJogador,
  ASSISTENCIA_JANELA_S,
  chaveRecompensa,
  OURO_POR_SEGUNDO,
} from './progressao.js';
import { Servicos, novoEquipamento, prepararNave } from './servicos.js';
import { Jungle } from './jungle.js';
import { Golpes, INVISIVEL_VISTO_M } from './golpes.js';
import { RECALL_S, motivoRecall } from '../shared/recall.js';
import { Bots, nomeDeBot } from './bots.js';
import { Visao } from './visao.js';

export const TICK_HZ = 30;
const SNAP_CADA = 2; // ticks entre snapshots (15 Hz)
const MAX_INPUTS_TICK = 4;
const MAX_FILA = 30;
const RESPAWN_TICKS = 3 * TICK_HZ; // padrão; o do jogador cresce (tempoRenascer em server/progressao.js) e os monstros renascem pela jungle
const ASSISTENCIA_TICKS = ASSISTENCIA_JANELA_S * TICK_HZ;
const REGEN_ESPERA_TICKS = 5 * TICK_HZ;
// Nave de jogador: a regeneração é a da nave (shared/naves.js, do original). Voando,
// regenHpVoo (HP/s, só as Bellico têm), contínua, mesmo levando dano; pousada e
// parada, regenHpPousada (HP/s), depois de POUSO_REGEN_ESPERA_TICKS sem dano (levar
// tiro interrompe por um instante). Nave sem catálogo segue as frações do HP máximo:
// VOO_REGEN_HP sem levar dano há REGEN_ESPERA_TICKS. Os monstros regeneram pela
// jungle (server/jungle.js).
const VOO_REGEN_HP = 0.03; // fração do HP máximo por segundo, voando (sem nave do catálogo)
const POUSO_REGEN_HP = 0.08; // fração do HP máximo por segundo, pousada (sem nave do catálogo)
const POUSO_REGEN_ESPERA_TICKS = 1 * TICK_HZ;
// Escudo do equipamento (server/servicos.js põe s.maxEscudo e s.regenEscudo): volta
// regenEscudo por s, mas só depois de ESCUDO_ESPERA_S sem levar dano, para não virar
// uma segunda barra de vida que se refaz no meio da troca de tiros.
export const ESCUDO_ESPERA_S = 3;
const ESCUDO_ESPERA_TICKS = ESCUDO_ESPERA_S * TICK_HZ;
// Golpe crítico (potenciador Golpe Fatal): o dano do golpe direto sai × isto.
export const CRITICO_MULT = 2;
// Modo de teste: quanto cada botão dá.
const TESTE_OURO = 1000;
const TESTE_XP = 100;
// Zona segura: em volta da base do PRÓPRIO time ninguém leva dano (o raio de BASES).
// Monstro não persegue quem está em base nenhuma (nem entra nelas).
export const ZONA_SEGURA = BASE.raio;
const PROTECAO_TICKS = 3 * TICK_HZ; // invulnerável logo depois de nascer
const RECALL_TICKS = Math.round(RECALL_S * TICK_HZ);
// Teleporte até o companheiro Functional: distâncias (m) do companheiro tentadas em
// ordem (perto, sem encostar: duas naves de SHIP_RADIUS com folga), em
// TELEPORTE_DIRECOES rumos a partir de trás dele. Sem lugar livre, vai para o ponto
// dele (onde uma nave já está voando). Sem recarga: o pedido é "na hora".
export const TELEPORTE_ALIADO_DIST = [16, 26, 10];
const TELEPORTE_DIRECOES = 8;

function limpaNome(n) {
  const s = String(n ?? '')
    .replace(/[^\p{L}\p{N} _-]/gu, '')
    .trim()
    .slice(0, 16);
  return s || 'Piloto';
}

export class World {
  /**
   * @param {{ rng?: () => number, jungle?: boolean, temposJungle?: object,
   *   duracaoPartidaS?: number, intervaloFimS?: number, faseFinalS?: number, preparacaoS?: number,
   *   torretas?: boolean, teste?: boolean, objetivos?: object, ouroPorSegundo?: number }} [opcoes]
   * jungle = false: mundo sem monstros (testes). temposJungle: troca os tempos de
   * aparecer e voltar da jungle (TEMPOS_JUNGLE em server/jungle.js; os testes
   * encurtam). torretas = false deixa as torretas de pé mas sem atirar (testes que
   * brigam no meio da lane). teste = mundo do modo de teste (um por piloto,
   * server/index.js): partida sem relógio e os pedidos {t:'teste'} (pedidoTeste).
   * objetivos = tempos dos objetivos (TEMPOS de server/objetivos.js) trocados, para
   * os testes não esperarem minutos. ouroPorSegundo troca o ouro passivo
   * (OURO_POR_SEGUNDO; 0 nos testes que contam o ouro de um abate exato).
   * preparacaoS troca a contagem antes dos 20 minutos (PREPARACAO_S de
   * server/partida.js; 0 começa a partida na hora, como fazem os testes).
   */
  constructor({
    rng = Math.random,
    jungle = true,
    temposJungle,
    duracaoPartidaS,
    intervaloFimS,
    faseFinalS,
    preparacaoS,
    torretas = true,
    teste = false,
    objetivos,
    ouroPorSegundo = OURO_POR_SEGUNDO,
  } = {}) {
    this.teste = teste;
    this.ouroPorSegundo = ouroPorSegundo;
    this.rng = rng;
    this.torretasAtiram = torretas;
    this.tick = 0;
    this.nextId = 1;
    this.players = new Map();
    this.bullets = [];
    this.minas = [];
    this.eventos = [];
    this.partida = new Partida({ duracaoS: teste ? Infinity : duracaoPartidaS, intervaloFimS, faseFinalS, preparacaoS });
    this.bonus = new Bonus({ evento: (ev) => this.eventos.push(ev) });
    this.mineradores = new Mineradores({
      novoId: () => this.#id(),
      entregar: (time, carga) => this.partida.somar(time, carga, this.tick),
      evento: (ev) => this.eventos.push(ev),
    });
    this.escoltas = new Escoltas(this);
    this.jungle = new Jungle(this, {
      ferir: (alvo, dano, autor, ev, opcoes) => this.#ferir(alvo, dano, autor, ev, opcoes),
      podeAcertar: (b, alvo) => this.#podeAcertar(b, alvo),
      naZonaSegura: (s) => this.#naZonaSegura(s),
      ativo: jungle,
      tempos: temposJungle,
    });
    this.objetivos = new Objetivos(this, {
      ferir: (alvo, dano, autor, ev, opcoes) => this.#ferir(alvo, dano, autor, ev, opcoes),
      tempos: objetivos,
    });
    this.torretas = new Torretas(this);
    this.servicos = new Servicos(this);
    this.bots = new Bots(this, { zonaSegura: ZONA_SEGURA });
    // Visão do time (névoa de guerra): o snapshot de cada jogador só leva o que algum
    // aliado enxerga (server/visao.js, aplicado em snapshotPara).
    this.visao = new Visao(this);
    this.golpes = new Golpes(this, {
      ferir: (alvo, dano, autor, ev, opcoes) => this.#ferir(alvo, dano, autor, ev, opcoes),
      podeAcertar: (b, alvo) => this.#podeAcertar(b, alvo),
      protegido: (ent) => this.#protegido(ent),
    });
  }

  #id() {
    return this.nextId++;
  }

  /** Ponto sorteado no centro da base do time, e o yaw de quem olha para a lane. */
  #pontoNaBase(time) {
    const b = BASES[time];
    const a = this.rng() * Math.PI * 2;
    const r = this.rng() * 60;
    // yaw 0 olha para -z e -π/2 para +x: a base da esquerda (x < 0) olha para +x.
    const yaw = b.x < 0 ? -Math.PI / 2 : Math.PI / 2;
    return { x: b.x + Math.cos(a) * r, z: b.z + Math.sin(a) * r, yaw };
  }

  /** Nave nova do jogador na base do time dele, voltada para a lane (a nave da classe e do tier dele). */
  #naveNaBase(race, time, classe, tier = 0) {
    const p = this.#pontoNaBase(time);
    const ship = createShip(race, p.x, p.z, p.yaw, classe, tier);
    ship.time = time; // vai no `me`: a predição precisa para o pouso (pousoPermitido)
    return ship;
  }

  /**
   * Entra um jogador, no time com menos gente, na primeira nave da linha da raça e
   * classe (shared/naves.js). Retorna o objeto do jogador (o servidor guarda o
   * socket nele), ou null se os dois times estão cheios (o servidor responde
   * 'partida_cheia'). Quem valida a raça é o servidor (server/index.js recusa raça
   * bloqueada ou inválida antes); aqui, raça sem naves vira a primeira jogável e
   * classe inválida vira CLASSE_PADRAO. `pedido` = {iaMeu, iaInimigo} da entrada
   * (como veio da rede; saneado aqui): os computadores que completam os times (ver
   * completarComBots).
   */
  addPlayer(nome, race, classe, pedido = {}) {
    let time = this.partida.escolherTime(this.#tamanhos());
    if (time === null) time = this.#cederVagaDeBot();
    if (time === null) return null;
    const j = this.#novoJogador(limpaNome(nome), race, classe, time);
    const { iaMeu, iaInimigo } = computadoresDaEntrada(pedido);
    this.completarComBots(time, 1 + iaMeu);
    this.completarComBots((time + 1) % N_TIMES, iaInimigo);
    return j;
  }

  /**
   * Acrescenta computadores no `time` até ele ter `alvo` jogadores (gente e
   * computador), sem passar de MAX_POR_TIME e sem tirar ninguém. Devolve quantos
   * entraram.
   */
  completarComBots(time, alvo) {
    let n = 0;
    while (this.#tamanhos()[time] < Math.min(alvo, MAX_POR_TIME) && this.adicionarBot(time)) n++;
    return n;
  }

  /** Jogadores (humanos e computadores) em cada time. */
  #tamanhos() {
    const tamanhos = Array.from({ length: N_TIMES }, () => 0);
    for (const j of this.players.values()) tamanhos[j.time]++;
    return tamanhos;
  }

  /**
   * Partida cheia, mas com computador: tira um do time com menos humanos (empate:
   * o time 0) e devolve esse time para o humano que chega. Null se só há humanos.
   */
  #cederVagaDeBot() {
    const humanos = Array.from({ length: N_TIMES }, () => 0);
    for (const j of this.players.values()) if (!j.ia) humanos[j.time]++;
    let escolhido = null;
    for (const j of this.players.values()) {
      if (!j.ia) continue;
      if (!escolhido || humanos[j.time] < humanos[escolhido.time]) escolhido = j;
    }
    if (!escolhido) return null;
    this.removePlayer(escolhido.id);
    return escolhido.time;
  }

  /**
   * Põe um computador no `time` (raça e classe sorteadas entre as jogáveis), com
   * nick "NOME (IA)". Null se o time já tem MAX_POR_TIME.
   */
  adicionarBot(time) {
    if (!(time >= 0 && time < N_TIMES) || this.#tamanhos()[time] >= MAX_POR_TIME) return null;
    const usados = new Set([...this.players.values()].map((j) => j.nome));
    const race = RACAS_JOGAVEIS[Math.floor(this.rng() * RACAS_JOGAVEIS.length) % RACAS_JOGAVEIS.length];
    const classes = ['assault', 'mobile', 'functional'];
    const classe = classes[Math.floor(this.rng() * classes.length) % classes.length];
    const j = this.#novoJogador(nomeDeBot(this.rng, usados), race, classe, time);
    j.ia = this.bots.novoCerebro();
    return j;
  }

  #novoJogador(nome, race, classe, time) {
    const id = this.#id();
    const raca = racaJogavel(race) ? race : RACAS_JOGAVEIS[0];
    const cls = classeOuPadrao(classe);
    const jogador = {
      id,
      tipo: 'jogador',
      nome,
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
      ...novoEquipamento(raca), // inventário (as duas armas de fábrica), equipado, itens, tier da nave (Loja e Evolução)
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
    this.bonus.limparNave(id);
    this.eventos.push({ e: 'saiu', id, nome: j.nome });
    // Saiu o último humano: os computadores saem junto (ninguém para jogar com eles).
    if (!j.ia && ![...this.players.values()].some((o) => !o.ia)) {
      for (const o of [...this.players.values()]) this.removePlayer(o.id);
    }
  }

  /**
   * Jogadores da partida para a janela de times e a barra do time: [{id, nome,
   * time, nivel, ia?, abates, abatesJog, mortes, vivo}] (camuflado entra também:
   * não diz onde ele está). Lista PÚBLICA: nada de HP, posição nem nave aqui (a vida
   * e a nave dos aliados vêm das entidades do próprio time, que o time sempre vê).
   */
  #jogadoresSnap() {
    return [...this.players.values()].map((j) => ({
      id: j.id,
      nome: j.nome,
      time: j.time,
      nivel: j.nivel,
      ...(j.ia ? { ia: true } : {}),
      abates: j.abates,
      abatesJog: j.abatesJog,
      mortes: j.mortes,
      vivo: j.vivo,
    }));
  }

  /**
   * Pedido de Loja, Evolução, pontos ou inventário ({t:'comprar'|'evoluir'|
   * 'melhorar'|'reconstruir'|'usar'|'pontos'|'equipar'|'vender'|'evoluirItem'}) do
   * jogador `id`. Devolve a resposta para ele (server/servicos.js).
   */
  pedido(id, msg) {
    return this.servicos.pedido(this.players.get(id), msg);
  }

  /**
   * Pedido do modo de teste ({t:'teste', acao}): só vale no mundo de teste (no mundo
   * de verdade responde 'invalido'). acao: 'ouro' (+TESTE_OURO), 'xp' (+TESTE_XP),
   * 'nivel' (sobe um nível) ou 'nivelMax' (vai ao NIVEL_MAX). Responde como a Loja:
   * {t:'resultado', acao:'teste', item: acao, ok, codigo?}.
   */
  pedidoTeste(id, msg) {
    const j = this.players.get(id);
    const acao = typeof msg?.acao === 'string' ? msg.acao : '';
    const resposta = (ok, codigo) => ({ t: 'resultado', acao: 'teste', item: acao, ok, ...(codigo ? { codigo } : {}) });
    if (!this.teste || !j) return resposta(false, 'invalido');
    if (acao === 'ouro') j.ouro += TESTE_OURO;
    else if (acao === 'xp' || acao === 'nivel' || acao === 'nivelMax') {
      if (j.nivel >= NIVEL_MAX) return resposta(false, 'limite');
      const falta = xpParaNivel(j.nivel) - j.xp;
      if (acao === 'xp') ganharXp(j, TESTE_XP, this.eventos);
      else if (acao === 'nivel') ganharXp(j, falta, this.eventos);
      else while (j.nivel < NIVEL_MAX) ganharXp(j, xpParaNivel(j.nivel) - j.xp, this.eventos);
    } else return resposta(false, 'invalido');
    return resposta(true);
  }

  /**
   * Teleporte até o companheiro ({t:'teleportar', alvo}): o jogador `id` salta para
   * junto do aliado `alvo` (id de jogador) de nave Functional. Responde só a quem
   * pediu: {t:'resultado', acao:'teleportar', item: alvo, ok, codigo?}, com codigo
   * 'sem_partida' (fora do andamento, salvo no modo de teste), 'morto' (quem pede
   * está morto), 'invalido' (alvo que não é inteiro, não existe, é ele mesmo ou é do
   * outro time), 'alvo_morto', 'nao_functional' ou 'sem_energia' (com o `custo`, a
   * energia que faltou pagar: custoTeleporte). Deu certo: desconta a energia e
   * manda o evento 'teleporte'.
   */
  pedidoTeleporte(id, msg) {
    const j = this.players.get(id);
    const alvoId = Number.isInteger(msg?.alvo) ? msg.alvo : null;
    const alvo = alvoId === null ? null : this.players.get(alvoId);
    let codigo = null;
    if (!j || !alvo || alvo === j || alvo.time !== j.time) codigo = 'invalido';
    else if (!this.partida.emAndamento && !this.partida.emPreparacao && !this.teste) codigo = 'sem_partida';
    else if (!j.vivo) codigo = 'morto';
    else if (!alvo.vivo) codigo = 'alvo_morto';
    else if ((alvo.ship.classe ?? alvo.classe) !== 'functional') codigo = 'nao_functional';
    const custo = codigo ? 0 : custoTeleporte(j.nivel, alvo.nivel);
    if (!codigo && j.ship.en < custo) codigo = 'sem_energia';
    if (!codigo) {
      j.ship.en -= custo;
      this.#teleportarAte(j, alvo);
    }
    const extra = codigo === 'sem_energia' ? { codigo, custo: Math.ceil(custo) } : codigo ? { codigo } : {};
    return { t: 'resultado', acao: 'teleportar', item: alvoId, ok: !codigo, ...extra };
  }

  /**
   * Põe a nave de `j` junto de `alvo`: parada, decolada, na altura de voo, olhando
   * para onde ele olha. Mesma nave (vida, armas e efeitos ficam; a energia já veio
   * descontada do custo).
   */
  #teleportarAte(j, alvo) {
    if (j.recall) this.#pararRecall(j, 'teleporte');
    const s = j.ship;
    const p = this.#pontoJuntoA(alvo.ship);
    Object.assign(s, { x: p.x, z: p.z, y: heightAt(p.x, p.z) + HOVER, yaw: alvo.ship.yaw, vx: 0, vz: 0, roll: 0, pousado: false, boost: false });
    this.eventos.push({ e: 'teleporte', id: j.id, alvo: alvo.id, time: j.time, x: +s.x.toFixed(2), y: +s.y.toFixed(2), z: +s.z.toFixed(2) });
  }

  /**
   * Ponto livre (fora de rocha, construção e muralha: pontoLivre com a folga do
   * teleporte das armas) em volta da nave `a`: cada distância de TELEPORTE_ALIADO_DIST
   * em TELEPORTE_DIRECOES rumos, começando por trás dela e abrindo para os lados.
   * Sem nenhum, o ponto dela.
   */
  #pontoJuntoA(a) {
    const f = forward(a.yaw);
    const atras = Math.atan2(-f.z, -f.x);
    const passo = (2 * Math.PI) / TELEPORTE_DIRECOES;
    for (const d of TELEPORTE_ALIADO_DIST) {
      for (let k = 0; k < TELEPORTE_DIRECOES; k++) {
        // 0, +1, -1, +2, -2...: atrás primeiro, depois cada vez mais para os lados.
        const giro = Math.ceil(k / 2) * (k % 2 ? 1 : -1) * passo;
        const x = a.x + Math.cos(atras + giro) * d;
        const z = a.z + Math.sin(atras + giro) * d;
        if (pontoLivre(x, z, TELEPORTE_FOLGA)) return { x, z };
      }
    }
    return { x: a.x, z: a.z };
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

  /** Os disparos de `ent` (stepShip) viram golpes (server/golpes.js). */
  #atira(ent, disparos) {
    this.golpes.disparar(ent, disparos);
  }

  /** Em alguma zona segura (o raio da base ou o bolsão atrás do campo de força)? Os monstros não caçam lá. */
  #naZonaSegura(s) {
    return BASES.some((b) => Math.hypot(s.x - b.x, s.z - b.z) < ZONA_SEGURA || dentroDoCampo(b.time, s.x));
  }

  /** Na zona segura da base do próprio time (a do outro time não protege). */
  #naPropriaBase(ent) {
    const b = BASES[ent.time];
    return !!b && Math.hypot(ent.ship.x - b.x, ent.ship.z - b.z) < ZONA_SEGURA;
  }

  #protegido(ent) {
    return !ent.drone && (this.tick < ent.protegidoAte || this.#naPropriaBase(ent));
  }

  /** O alvo não leva dano agora (proteção de nascimento ou na própria base)? A IA lê. */
  estaProtegido(ent) {
    return this.#protegido(ent);
  }

  /** O tiro `b` pode acertar `alvo`? Não acerta o dono, aliado nem (se de monstro: `drone`) monstro, minerador ou escolta. */
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
      ...this.jungle.lista,
      ...this.mineradores.lista,
      ...this.escoltas.lista,
      ...this.objetivos.entidades(),
    ].filter((e) => e.vivo);
  }

  /**
   * Multiplicador do dano causado pelo jogador `autorId` agora (1 para monstro,
   * drone ou quem já saiu), para um golpe do tipo `tipoDano` ('fisico', 'laser',
   * 'eletrico'). Ponto único dos multiplicadores do atacante: os bônus (o 'ataque'
   * da nave e a 'medusa' do time, server/bonus.js; valem no impacto, então só
   * enquanto duram) e o poder do piloto naquele tipo (pontos e potenciadores: ×
   * (1 + status.poder[tipo])). Tiro, área, nova, mina, campo, dreno, torre de
   * suporte, Núcleo e torretas passam por aqui, uma vez por golpe.
   */
  /** Os monstros da jungle (vivos e os mortos até o lugar deles renascer). */
  get monstros() {
    return this.jungle.lista;
  }

  multDanoDe(autorId, tipoDano) {
    const j = this.players.get(autorId);
    if (!j) return 1;
    return this.bonus.multDano(j, this.tick) * (1 + (j.status?.poder[tipoDano] ?? 0));
  }

  /**
   * Os bônus que mexem na nave (server/bonus.js), postos a cada tick antes dos
   * comandos: a velocidade máxima (s.velMult = a do status × 'sonda' fora de combate
   * × 'medusa') e a energia do 'suporte' (s.regenEn = a da nave e do status + o
   * bônus). Os dois vão no `me`, e o stepShip da predição lê os mesmos números.
   * j.baseNave é o que o status pôs (server/servicos.js, aplicarStatus).
   */
  #bonusDaNave(j) {
    const b = j.baseNave;
    if (!b) return;
    j.ship.velMult = b.velMult * this.bonus.multVelocidade(j, this.tick);
    j.ship.regenEn = b.regenEn + this.bonus.regenNave(j, this.tick).en;
  }

  /**
   * Dano de um tiro no impacto, sem os estados do alvo (torre de suporte e torretas usam):
   * o do golpe × multiplicador do NPC × bônus do time e poder de quem atirou.
   */
  danoDoTiro(bala) {
    const tipoDano = WEAPONS[bala.kind]?.tipoDano;
    return (bala.dano ?? WEAPONS[bala.kind]?.dano ?? 0) * (bala.mult ?? 1) * (bala.drone ? 1 : this.multDanoDe(bala.owner, tipoDano));
  }

  /**
   * Tira `dano` de vida do alvo (tiro, garra ou dreno) e trata a morte, dando o
   * abate, o ouro e o XP a `autor` (RECOMPENSA pelo tipo do alvo). `ev` é o evento
   * do golpe, completado aqui com alvo e dano (0 se o alvo estava protegido); o
   * dreno, que fere a cada tick, não manda. `opcoes`: tipoDano (laser, físico,
   * elétrico) e direto (false no dreno e no recuo: a invulnerabilidade não segura
   * e não há crítico). O poder do atacante já vem no `dano` (multDanoDe); aqui
   * entram o crítico, a resistência e a penetração, os estados das armas e o escudo
   * do equipamento (ver o topo do arquivo). O evento leva o dano todo (escudo + HP)
   * e, se houve, `escudo` (a parte que o escudo segurou) e `crit`.
   */
  #ferir(alvo, dano, autor, ev, opcoes = {}) {
    if (!alvo.vivo) return; // já morreu neste tick (área e efeito no mesmo golpe)
    // Monstro da jungle atacado por um jogador: passa a caçá-lo (server/jungle.js, RAIVA_S).
    if (alvo.tipo === 'monstro') this.jungle.provocar(alvo, autor);
    if (this.#protegido(alvo)) {
      if (ev) this.eventos.push({ ...ev, alvo: alvo.id, dano: 0 });
      return;
    }
    const quem = this.players.get(autor);
    // Alvo que só jogador fere (o Núcleo de He-3): tiro de monstro, torreta ou escolta bate e não tira nada.
    if (alvo.soJogador && !quem) {
      if (ev) this.eventos.push({ ...ev, alvo: alvo.id, dano: 0 });
      return;
    }
    const tipo = opcoes.tipoDano;
    // Golpe crítico do atacante (só golpe direto de arma; o sorteio é só do servidor).
    let crit = false;
    if (quem?.status?.critico > 0 && tipo && opcoes.direto !== false && dano > 0 && this.rng() < quem.status.critico) {
      dano *= CRITICO_MULT;
      crit = true;
    }
    // Resistência do piloto atingido ao tipo do golpe, menos a penetração de quem bateu.
    if (alvo.tipo === 'jogador' && tipo && alvo.status) {
      const resist = Math.max(0, (alvo.status.resist[tipo] ?? 0) - (quem?.status?.penetra[tipo] ?? 0));
      dano *= 1 - resist;
    }
    // Estados das armas (invulnerável, escudo de arma, resistência, vulnerável, fraco...).
    dano = this.golpes.modificarDano(alvo, dano, autor, opcoes);
    // Defesa dos mineradores do time (Evolução).
    if (alvo.tipo === 'minerador') dano *= 1 - this.mineradores.atributos(alvo.time, this.tick).defesa;
    // Escudo do equipamento: segura o que sobrou antes do HP.
    const total = dano;
    let noEscudo = 0;
    const s = alvo.ship;
    if (s.escudo > 0 && dano > 0) {
      noEscudo = Math.min(s.escudo, dano);
      s.escudo -= noEscudo;
      dano -= noEscudo;
    }
    s.hp -= dano;
    alvo.ultimoDano = this.tick;
    if (total > 0) {
      // Combate (server/bonus.js e server/objetivos.js) e agressão (server/torretas.js).
      if (alvo.tipo === 'jogador') alvo.levouDanoTick = this.tick;
      if (quem && quem !== alvo) {
        quem.causouDanoTick = this.tick;
        if (alvo.time !== undefined && alvo.time !== quem.time) quem.agrediu = { tick: this.tick, time: alvo.time, x: alvo.ship.x, z: alvo.ship.z };
      }
    }
    // Dano de jogador inimigo (no escudo também): anota para a assistência.
    const atacante = alvo.tipo === 'jogador' && total > 0 ? quem : undefined;
    if (atacante && atacante.time !== alvo.time) alvo.danoPor.set(atacante.id, this.tick);
    if (alvo.recall && total > 0) this.#pararRecall(alvo, 'dano'); // vale também para a morte
    if (ev) {
      const e = { ...ev, alvo: alvo.id, dano: +total.toFixed(1) };
      if (noEscudo > 0) e.escudo = +noEscudo.toFixed(1);
      if (crit) {
        // Crítico: quem bateu (`por`) recebe o acerto onde quer que ele caia, para o "CRÍTICO" na tela.
        e.crit = true;
        e.por = autor;
      }
      this.eventos.push(e);
    }
    if (alvo.ship.hp > 0) return;
    this.#morrer(alvo, autor, { crit });
  }

  /**
   * A morte de `alvo` (a vida já acabou ou o campo de força da base o destruiu):
   * renascimento, o evento 'morte' (com `extra` por cima, como o `motivo`) e, com
   * `autor` jogador, o abate, o ouro e o XP dele (RECOMPENSA), a assistência e a
   * sequência. `crit`: o golpe final foi crítico (vai no 'ganho').
   */
  #morrer(alvo, autor, { crit = false, extra = null } = {}) {
    alvo.ship.hp = 0;
    alvo.vivo = false;
    alvo.drenoTicks = 0;
    alvo.st = {};
    alvo.raiva?.clear(); // monstro que morre esquece; renasce passivo
    if (alvo.tipo === 'jogador') {
      const s = tempoRenascer(alvo.nivel, this.partida.fracaoDecorrida(this.tick));
      alvo.respawnTick = this.tick + Math.round(s * TICK_HZ);
    } else {
      alvo.respawnTick = this.tick + (alvo.renascerTicks ?? RESPAWN_TICKS);
    }
    if (alvo.tipo === 'jogador') alvo.mortes++;
    if (alvo.tipo === 'minerador') alvo.carga = 0; // o minério que carregava se perde
    let matador = this.players.get(autor);
    if (matador?.id === alvo.id) matador = undefined;
    const morte = { e: 'morte', id: alvo.id, por: autor, tipo: alvo.tipo, x: alvo.ship.x, y: alvo.ship.y, z: alvo.ship.z, ...extra };
    if (alvo.time !== undefined) morte.time = alvo.time;
    if (alvo.esp) morte.esp = alvo.esp;
    this.eventos.push(morte);
    const ouroAntes = matador?.ouro ?? 0;
    const xpAntes = matador?.xpGanho ?? 0;
    if (matador) {
      // Ouro e XP pelo que morreu (RECOMPENSA: espécie do monstro, minerador, jogador;
      // o ouro dos acampamentos sobe com as ondas da jungle).
      matador.abates++;
      // Abate de jogador do outro time: o número do card na barra do time.
      if (alvo.tipo === 'jogador' && alvo.time !== matador.time) matador.abatesJog++;
      // O abate de jogador paga pelo nível da vítima (ouroAbateJogador).
      const mult = alvo.tipo === 'monstro' ? this.jungle.multOuro(alvo) : 1;
      recompensar(matador, chaveRecompensa(alvo), this.eventos, mult, alvo.tipo === 'jogador' ? ouroAbateJogador(alvo.nivel) : null);
      if (alvo.tipo === 'jogador') this.#abateDeJogador(alvo, matador, morte);
    }
    // Jungle: recarga do lugar e bônus do golpe final (a Medusa paga o time inteiro).
    if (alvo.tipo === 'monstro') this.jungle.aoMorrer(alvo, matador);
    if (matador) morte.ouro = matador.ouro - ouroAntes;
    // Monstro abatido: o ouro e o XP que o matador ganhou dele (a Medusa paga pelo
    // golpe final) sobem do lugar da morte só na tela dele (evento privado 'ganho',
    // server/visao.js), com o crítico do golpe final.
    if (matador && alvo.tipo === 'monstro') {
      const ganho = { e: 'ganho', para: matador.id, id: alvo.id, esp: alvo.esp, x: +alvo.ship.x.toFixed(2), y: +alvo.ship.y.toFixed(2), z: +alvo.ship.z.toFixed(2), ouro: matador.ouro - ouroAntes, xp: (matador.xpGanho ?? 0) - xpAntes };
      if (crit) ganho.crit = true;
      if (ganho.ouro > 0 || ganho.xp > 0 || crit) this.eventos.push(ganho);
    }
    if (alvo.tipo === 'jogador') {
      // Morrer (para quem for) zera a sequência, o registro de dano e os bônus de nave.
      alvo.sequencia = 0;
      alvo.danoPor.clear();
      this.bonus.limparNave(alvo.id);
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
    const r = recompensaAssistencia(alvo.nivel);
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

  /**
   * Campo de força da base do outro time: a nave de `j` que encostou no plano ou o
   * cruzou neste tick (de (x0, z0) até onde está) é destruída na hora, sem crédito
   * para ninguém. Devolve true se morreu.
   */
  #campoDaBase(j, x0, z0) {
    const s = j.ship;
    for (const c of CAMPOS_BASE) {
      if (c.time === j.time) continue;
      const cruzou = cruzaCampoBase(x0, z0, s.x, s.z)?.time === c.time;
      if (!cruzou && !encostaNoCampo(c.time, s.x, s.z, SHIP_RADIUS)) continue;
      if (j.recall) this.#pararRecall(j, 'dano');
      this.#morrer(j, null, { extra: { motivo: 'campo', campo: c.time } });
      return true;
    }
    return false;
  }

  /** Dreno: um tick de dano por tempo. Na zona segura/proteção o tempo corre sem dano. */
  #drenar(ent) {
    if (!(ent.drenoTicks > 0)) return;
    ent.drenoTicks--;
    const tipoDano = ent.drenoTipo;
    this.#ferir(ent, (ent.drenoDps ?? 0) * DT * this.multDanoDe(ent.drenoDono, tipoDano), ent.drenoDono, null, { direto: false, tipoDano });
  }

  /** Escudo do equipamento: recupera depois de ESCUDO_ESPERA_S sem dano; pousada na própria base, enche rápido. */
  #regenEscudo(ent) {
    const s = ent.ship;
    if (!(s.maxEscudo > 0) || s.escudo >= s.maxEscudo) return;
    let porS = this.tick - ent.ultimoDano > ESCUDO_ESPERA_TICKS ? s.regenEscudo : 0;
    if (pousadaNaBase(s)) porS += s.maxEscudo * BASE_CURA_FRAC;
    if (porS > 0) s.escudo = Math.min(s.maxEscudo, s.escudo + porS * DT);
  }

  #regen(ent) {
    const s = ent.ship;
    if (ent.tipo === 'jogador') this.#regenEscudo(ent);
    if (s.hp >= s.maxHp) return;
    const semDano = this.tick - ent.ultimoDano;
    // Pousada (parada no chão), a nave conserta rápido, como o "Landed: recovers"
    // das naves do AstroN; mas levar tiro interrompe por um instante.
    const noChao = s.pousado && Math.hypot(s.vx, s.vz) < VEL_TOQUE;
    if (ent.tipo === 'jogador') {
      let porS = noChao ? (semDano > POUSO_REGEN_ESPERA_TICKS ? s.regenHpPousada : 0) : s.regenHpVoo;
      // Bônus 'suporte' (server/bonus.js): fração do HP máximo por s, sempre.
      porS += s.maxHp * this.bonus.regenNave(ent, this.tick).hpFrac;
      // Pousada e parada na própria base: conserta rápido (BASE_CURA_FRAC em shared/sim.js).
      if (pousadaNaBase(s)) porS += s.maxHp * BASE_CURA_FRAC;
      if (porS > 0) s.hp = Math.min(s.maxHp, s.hp + porS * DT);
    } else if (noChao && semDano > POUSO_REGEN_ESPERA_TICKS) {
      s.hp = Math.min(s.maxHp, s.hp + s.maxHp * POUSO_REGEN_HP * DT);
    } else if (semDano > REGEN_ESPERA_TICKS) {
      s.hp = Math.min(s.maxHp, s.hp + s.maxHp * VOO_REGEN_HP * DT);
    }
  }

  /** Renasce o jogador na base do time (os monstros renascem pela jungle). */
  #respawn(ent) {
    const encInst = ent.ship.encInst; // as cópias que estavam no Z e no X continuam lá
    ent.ship = this.#naveNaBase(ent.ship.race, ent.time, ent.classe, ent.tier);
    if (encInst) ent.ship.encInst = [...encInst];
    prepararNave(ent); // nave da linha, nível, pontos, equipamento e a posse de armas
    ent.fila.length = 0;
    ent.protegidoAte = this.tick + PROTECAO_TICKS;
    ent.recall = null; // partida nova: quem canalizava já está na base
    ent.vivo = true;
    ent.drenoTicks = 0;
    ent.st = {};
    this.eventos.push({ e: 'renasceu', id: ent.id });
  }

  /**
   * Relógio da partida: abre com o primeiro jogador; no fim de uma, espera a tela
   * de resultado e abre outra do zero (placar, bônus e mineradores zerados, todo
   * mundo renasce na base do time). Partida aberta começa na preparação
   * (PREPARACAO_S): o mapa fica vazio (sem mineradores, escoltas e jungle) até ela
   * acabar; o relógio deles já é marcado para o fim dela.
   */
  #passoPartida() {
    const antes = this.partida.estado;
    const virou = this.partida.passo(this.tick, this.players.size);
    // Partida nova: na preparação, ou no 'comecou' direto quando ela é 0.
    if (virou === 'preparacao' || (virou === 'comecou' && antes !== 'preparacao')) this.#abrirPartida(antes === 'fim');
    if (virou === 'preparacao') {
      this.eventos.push({ e: 'preparacao', n: this.partida.numero, s: Math.round(this.partida.inicioEm(this.tick)) });
    } else if (virou === 'comecou') {
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
      this.jungle.limpar();
    }
  }

  /**
   * Partida nova aberta (preparação ou andamento direto): bônus zerados, mapa sem
   * mineradores, escoltas e monstros dos lugares, com o relógio deles marcado para
   * quando os 20 minutos começam (inicioTick: os mineradores só andam no andamento e
   * a jungle só nasce depois dele). Vindo da tela de fim, também objetivos,
   * melhorias, torretas e a progressão de todo mundo, que renasce na base do time.
   * (Na primeira partida, quem entrou acabou de nascer lá.)
   */
  #abrirPartida(vinhaDoFim) {
    const inicio = this.partida.inicioTick;
    this.bonus.limpar();
    this.mineradores.comecar(inicio);
    this.escoltas.comecar(inicio);
    this.jungle.comecar(inicio); // monstros somem; o relógio da jungle recomeça
    if (!vinhaDoFim) return;
    this.minas = [];
    this.golpes.limpar();
    this.objetivos.reiniciar();
    this.servicos.reiniciar(); // melhorias dos mineradores dos dois times
    this.torretas.reiniciar(); // todas de pé, nível 1
    for (const j of this.players.values()) {
      if (j.fila.length) j.ack = j.fila[j.fila.length - 1].seq; // descarta sem travar a predição
      // Ouro, XP, nível, pontos, o inventário (volta às duas armas de fábrica;
      // os ids seguem crescendo), o que está na nave, itens e a nave comprada
      // (tier) são da partida (como num MOBA): zeram na seguinte. A raça e a
      // classe ficam (são escolha da entrada).
      Object.assign(j, novaProgressao(), novoCombate(), novoEquipamento(j.ship.race, j.invProx), { ouro: 0 });
      this.#respawn(j);
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

  /**
   * Ouro passivo (server/progressao.js): a cada segundo inteiro de partida em
   * andamento, OURO_POR_SEGUNDO para cada jogador, computadores e mortos inclusive.
   * Contado pelos ticks desde o começo (TICK_HZ por segundo): sempre inteiro, sem
   * fração acumulada no passo de 1/30 s.
   */
  #ouroPassivo() {
    if (!this.partida.emAndamento || !this.ouroPorSegundo) return;
    const decorridos = this.tick - this.partida.inicioTick;
    if (decorridos <= 0 || decorridos % TICK_HZ !== 0) return;
    for (const j of this.players.values()) j.ouro += this.ouroPorSegundo;
  }

  /** Avança o mundo um passo. */
  step() {
    this.tick++;
    this.#ouroPassivo(); // antes do relógio: o último segundo da partida também paga
    this.#passoPartida();
    this.bots.passo(); // o comando de cada computador entra na fila dele

    for (const j of this.players.values()) {
      if (!j.vivo) {
        // Morto: descarta comandos mas confirma o seq, para a predição não acumular.
        if (j.fila.length) j.ack = j.fila[j.fila.length - 1].seq;
        j.fila.length = 0;
        if (this.tick >= j.respawnTick) this.#respawn(j);
        continue;
      }
      this.#bonusDaNave(j);
      const x0 = j.ship.x;
      const z0 = j.ship.z;
      const n = Math.min(MAX_INPUTS_TICK, j.fila.length);
      for (let k = 0; k < n; k++) {
        const { seq, inp } = j.fila.shift();
        this.#atira(j, stepShip(j.ship, inp));
        this.#comandoRecall(j, inp);
        j.ack = seq;
      }
      // Encostou no campo de força da base do outro time (antes do recall, que o tiraria de lá).
      if (this.#campoDaBase(j, x0, z0)) {
        if (j.fila.length) j.ack = j.fila[j.fila.length - 1].seq;
        j.fila.length = 0;
        continue;
      }
      if (j.recall && this.tick >= j.recall.fim) this.#chegarNaBase(j);
      this.#drenar(j);
      if (j.vivo) this.#regen(j);
    }

    // Jungle: nascimentos pelo relógio e a IA dos monstros (server/jungle.js).
    this.jungle.passo();
    for (const m of this.jungle.lista) if (m.vivo) this.#drenar(m);

    // Mineradores e escoltas andam só com a partida em andamento (na tela de fim
    // ficam parados).
    if (this.partida.emAndamento) {
      this.mineradores.passo(this.tick);
      this.escoltas.passo(this.tick);
    }
    for (const m of this.mineradores.lista) if (m.vivo) this.#drenar(m);
    for (const e of this.escoltas.lista) if (e.vivo) this.#drenar(e);

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
   * que desenhar ('jogador', 'monstro', 'minerador', 'escolta' ou 'nucleo'; o
   * monstro traz `esp`, a espécie de server/especies.js, e só vem vivo); `drone`
   * continua true para todo inimigo do PvE e o Núcleo. Jogadores,
   * mineradores e escoltas trazem `time`; os mineradores também `carga` (minério no contêiner)
   * e `minerando`, `descarga: 1` enquanto despejam na bacia da base e os da onda do Núcleo
   * `nucleo: 1`. Jogador traz `nivel`, `classe` e
   * `tier` (a nave a desenhar), com escudo equipado `esc` (fração 0 a 1 do escudo) e,
   * com bônus de nave, `bn` (['ataque', 'suporte', 'sonda'], os ativos).
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
        // Fração do escudo do equipamento, para a barra nos rótulos (sem escudo, não vem).
        if (e.ship.maxEscudo > 0) ent.esc = +Math.max(0, Math.min(1, e.ship.escudo / e.ship.maxEscudo)).toFixed(2);
        // Bônus de nave ativos ('ataque', 'suporte', 'sonda'), para a aura.
        const bn = Object.keys(this.bonus.paraNave(e.id, this.tick));
        if (bn.length) ent.bn = bn;
      }
      if (e.recall) ent.recall = +Math.min(1, (this.tick - e.recall.inicio) / (e.recall.fim - e.recall.inicio)).toFixed(2);
      if (e.tipo === 'minerador') {
        ent.carga = e.carga;
        ent.minerando = e.estado === 'minerando';
        if (e.estado === 'descarregando' && e.carga > 0) ent.descarga = 1; // despejando na bacia da base
        if (e.nucleo) ent.nucleo = 1; // da onda do Núcleo (maior, brilhando He-3)
      }
      if (e.tipo === 'monstro') ent.esp = e.esp;
      lista.push(ent);
    };
    for (const j of this.players.values()) add(j);
    for (const m of this.jungle.lista) if (m.vivo) add(m);
    for (const m of this.mineradores.lista) add(m);
    for (const e of this.escoltas.lista) add(e);
    for (const e of this.objetivos.entidades()) add(e); // o Núcleo de He-3 (tipo 'nucleo')
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
        obj: { ...this.objetivos.estado(), ...(this.jungle?.estado() ?? {}) },
        torretas: this.torretas.estado(),
        minas: this.#minasSnap(),
        guiados: this.#guiadosSnap(),
        jogadores: this.#jogadoresSnap(),
      };
    }
    // Visão do time: só o que algum aliado enxerga (server/visao.js); a camuflagem vem por cima.
    ents = this.visao.entidades(j, ents);
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
      me: { ...j.ship, ...this.servicos.paraMe(j), ...this.#bonusParaMe(j) },
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
      minas: this.visao.minas(j, this.cacheObj.minas),
      guiados: this.visao.guiados(j, this.cacheObj.guiados),
      jogadores: this.cacheObj.jogadores,
      ents,
      ev: this.visao.eventos(j, eventos),
    };
  }

  /**
   * Bônus de nave no `me`: bonusNave = { ataque: s, suporte: s, sonda: s } (só os
   * ativos) e, com a 'sonda' suspensa em combate, bonusSuspenso = ['sonda'].
   */
  #bonusParaMe(j) {
    const bonusNave = this.bonus.paraNave(j.id, this.tick);
    if (bonusNave.sonda && this.bonus.emCombate(j, this.tick)) return { bonusNave, bonusSuspenso: ['sonda'] };
    return { bonusNave };
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
      atq: m.g?.atq, // campo de monstro (server/jungle.js)
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
      .map((b) => ({ id: b.id, kind: b.kind, nv: b.nivel, p: b.prof, ...(b.g.atq ? { atq: b.g.atq } : {}), x: +b.x.toFixed(2), y: +b.y.toFixed(2), z: +b.z.toFixed(2), vx: +b.vx.toFixed(2), vy: +b.vy.toFixed(2), vz: +b.vz.toFixed(2) }));
  }

  /** Esvazia a lista de eventos acumulados desde o último snapshot. */
  tirarEventos() {
    const ev = this.eventos;
    this.eventos = [];
    return ev;
  }
}

