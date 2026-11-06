// Filas do jogo online (os modos "Jogar New Astron" e "Partida Pública com Bots" do
// menu), em tempo real pelo mesmo WebSocket do jogo (/ws): o menu fica conectado e
// vê o tamanho das filas mudar na hora, e quem está na fila vê os pilotos chegando.
//
// Fluxo, como nos MOBAs do mercado (LoL, Dota 2, Deadlock), num passo só (a fila e a
// seleção de campeão; sem a tela de "Aceitar" separada):
//
//   1. PROCURANDO: o piloto abre a Seleção num modo de fila e entra nela na hora; o
//      Decolar vira "Aguardando…" com o tempo de espera e quantos pilotos faltam. A
//      fila já se reparte nos grupos da próxima sala (os primeiros `humanos`, os
//      seguintes...) e cada um vê o seu grupo chegando: os do próprio time com o nome
//      e a nave (que muda na hora), os do outro só com o nome (pedido do Mateus).
//      No 3 contra 3 os times são o TIME VERDE (0, a base da esquerda) e o TIME
//      VERMELHO (1): quem chega entra no que tem menos gente na fila (empate: verde)
//      e, enquanto procura, pode trocar para o outro clicando numa vaga livre dele
//      ({t:'trocarTime'}; pedido do Mateus). A sala fecha quando há 3 em cada e
//      mantém os times.
//      NUNCA mais de 3 num time de uma sala (pedido do Mateus): cada time é uma fila
//      própria, na ordem em que cada um entrou NELE (`ordem`: ao chegar, ou ao trocar,
//      que vai para o fim do outro time), cortada em pedaços de 3; o g-ésimo pedaço
//      de cada time é a g-ésima sala. O 4º de um time já é da sala seguinte, e trocar
//      para um time cheio só é aceito se for para a vaga de uma sala seguinte (quem
//      troca nunca empurra ninguém para fora da sala dele).
//   2. SALA: com gente bastante na fila (MODOS_FILA: 6 no 3 contra 3, 3 na pública,
//      que joga os 3 contra 3 computadores), os primeiros da fila viram uma sala e
//      começa o contador de SELECAO_S. Cada um escolhe a nave (os do próprio time
//      veem a escolha um do outro na hora; o time inimigo é às cegas, como no Blind
//      Pick do LoL) e aperta Pronto, que trava a nave.
//   2b. COMEÇAR MAIS CEDO (pedido do Mateus, para jogar só com um colega): no 3
//      contra 3, com pelo menos `minimoPorTime` (1) piloto em cada time no grupo, o
//      Pronto já vale procurando. Todos do grupo prontos, a partida começa com quem
//      está nele (1 contra 1, 2 contra 1...), sem computadores. Na pública vale o
//      mesmo com 2 pilotos no grupo (o único time de gente; 05/nov/2026): os dois
//      prontos jogam juntos, e a vaga que falta no time deles fica com um computador
//      (server/index.js). Quem chega depois cai no grupo e precisa apertar Pronto
//      também (ou, completando o grupo, vira a sala de sempre, com quem já estava
//      pronto ainda pronto). Pronto na fila trava a nave e o time. Os próximos que
//      procurarem caem num grupo novo.
//   3. COMEÇAR: todos prontos, a partida começa na hora: o servidor cria o mundo
//      (aoComecar, server/index.js) e manda a cada um o token de uma vaga só dele, com
//      o time e a nave travados. O cliente sai da fila e entra no mundo com o token.
//
// Contador zerado com alguém sem Pronto (pedido do Mateus, como o LoL): a sala se
// desfaz, quem estava pronto volta para o começo da fila (na ordem e com o tempo de
// espera de antes) e quem não apertou sai da fila. Alguém sair da sala (ESC, fechar a
// aba, cair a conexão) também desfaz a sala, e todos os outros voltam para o começo
// da fila.
//
// SELECAO_S = 60 s: o mercado vai de 30 s por escolha (LoL, Dota 2 no All Pick) a uns
// 60–90 s para todos escolherem juntos (Blind Pick do LoL, Deadlock); aqui todos
// escolhem ao mesmo tempo entre 9 naves (3 raças × 3 classes), então 60 s sobram.
//
// Este módulo é puro (sem socket nem relógio próprio): quem chama passa `enviar`, o
// relógio (`agora`, ms) e o sorteio (`rng`), e os testes (tests/filas.test.mjs)
// andam o tempo à mão. O protocolo está no topo de server/index.js.

import { racaJogavel, classeValida, RACAS_JOGAVEIS, ORDEM_CLASSES } from '../shared/naves.js';
import { MAX_POR_TIME, N_TIMES } from './partida.js';

/**
 * Modos de fila: `humanos` = pilotos por sala (a partida só começa com todos
 * prontos); `bots` = o outro time é de computadores (na pública, os 3 humanos jogam
 * juntos no mesmo time); `minimoPorTime` = com tantos em cada time de gente no grupo
 * (na pública, só o dos humanos), todos prontos já começam a partida sem esperar a
 * sala encher (sem ele, só a sala cheia).
 */
export const MODOS_FILA = Object.freeze({
  online: Object.freeze({ humanos: MAX_POR_TIME * N_TIMES, bots: false, minimoPorTime: 1 }),
  publica: Object.freeze({ humanos: MAX_POR_TIME, bots: true, minimoPorTime: 2 }),
});
/** Tempo (s) para todos da sala escolherem a nave e apertarem Pronto. */
export const SELECAO_S = 60;

/** Nome de piloto como o World aceita (letras, números, espaço, _ e -; até 16). */
export function nomeDaFila(n) {
  const s = String(n ?? '')
    .replace(/[^\p{L}\p{N} _-]/gu, '')
    .trim()
    .slice(0, 16);
  return s || 'Piloto';
}

/** A escolha do piloto saneada (vem da rede): raça jogável e classe válida. */
export function escolhaDaFila(msg, antes = null) {
  return {
    nome: msg?.nome !== undefined ? nomeDaFila(msg.nome) : (antes?.nome ?? 'Piloto'),
    race: racaJogavel(msg?.race) ? msg.race : (antes?.race ?? RACAS_JOGAVEIS[0]),
    classe: classeValida(msg?.classe) ? msg.classe : (antes?.classe ?? ORDEM_CLASSES[0]),
  };
}

export class Filas {
  /**
   * @param {{ enviar: (cliente: any, msg: object) => void,
   *   aoComecar: (sala: { id: number, modo: string, membros: { nome: string, race: string, classe: string, time: number, token: string }[] }) => void,
   *   agora?: () => number, rng?: () => number, novoToken?: () => string,
   *   podeAbrirSala?: () => boolean, jogando?: () => Record<string, number>, selecaoS?: number }} op
   * `podeAbrirSala` false (servidor sem lugar para mais um mundo): a fila espera.
   * `jogando` = pilotos humanos já em partida, por modo (só para a contagem do menu).
   */
  constructor({ enviar, aoComecar, agora = Date.now, rng = Math.random, novoToken, podeAbrirSala = () => true, jogando = () => ({}), selecaoS = SELECAO_S }) {
    this.enviar = enviar;
    this.aoComecar = aoComecar;
    this.agora = agora;
    this.rng = rng;
    this.novoToken = novoToken ?? (() => Math.floor(rng() * 2 ** 52).toString(36) + Math.floor(rng() * 2 ** 52).toString(36));
    this.podeAbrirSala = podeAbrirSala;
    this.jogando = jogando;
    this.selecaoMs = selecaoS * 1000;
    this.filas = Object.fromEntries(Object.keys(MODOS_FILA).map((m) => [m, []])); // modo -> [entrada]
    this.salas = new Map(); // id -> sala
    this.salaDe = new Map(); // cliente -> sala
    this.observadores = new Set();
    this.proximaSala = 1;
    this.proximaOrdem = 1; // a posição no time (3 contra 3): cresce a cada entrada e troca
    this.ordemVolta = 0; // quem volta de uma sala desfeita fica na frente (decresce)
    this.ultimaContagem = '';
  }

  // ---------- Pedidos (um por mensagem da rede) ----------

  /** O menu conectou: recebe a contagem das filas agora e a cada mudança. */
  observar(cliente) {
    this.observadores.add(cliente);
    this.enviar(cliente, this.contagem());
  }

  /** A conexão fechou: sai de onde estiver (fila ou sala) e para de receber. */
  esquecer(cliente) {
    this.observadores.delete(cliente);
    this.sair(cliente, false);
  }

  /**
   * {t:'entrarFila', modo, nome, race, classe}: entra no fim da fila do modo. Já na
   * fila ou numa sala: só reenvia o estado (o pedido repetido não muda de lugar).
   * Devolve null ou o código de erro ('invalido' para modo que não é de fila).
   */
  entrar(cliente, msg) {
    const modo = msg?.modo;
    if (!Object.hasOwn(MODOS_FILA, modo)) return 'invalido';
    if (this.#onde(cliente)) {
      this.#avisar(cliente);
      return null;
    }
    const e = { cliente, modo, desde: this.agora(), time: 0, ...escolhaDaFila(msg) };
    if (!MODOS_FILA[modo].bots) {
      // O time com menos gente na fila (empate: o verde).
      const n = [0, 1].map((t) => this.filas[modo].filter((x) => x.time === t).length);
      e.time = n[1] < n[0] ? 1 : 0;
      e.ordem = this.proximaOrdem++;
    }
    this.filas[modo].push(e);
    this.#formar(modo);
    this.#avisarFila(modo);
    this.avisarContagem();
    return null;
  }

  /** {t:'escolha', nome?, race?, classe?}: troca a nave (ou o nome); travada depois do Pronto. */
  escolher(cliente, msg) {
    const sala = this.salaDe.get(cliente);
    if (sala) {
      const m = sala.membros.find((x) => x.cliente === cliente);
      if (m.pronto) return 'travada';
      Object.assign(m, escolhaDaFila(msg, m));
      this.#avisarSala(sala);
      return null;
    }
    const e = this.#naFila(cliente);
    if (!e) return 'fora';
    if (e.pronto) return 'travada';
    Object.assign(e, escolhaDaFila(msg, e));
    // O grupo vê a nave nova na hora.
    this.#avisarFila(e.modo);
    return null;
  }

  /**
   * {t:'trocarTime'}: no 3 contra 3, procurando, passa para o outro time se ele tem
   * vaga livre no seu grupo ('cheio' sem vaga; 'invalido' na pública; 'fora' na sala
   * ou fora da fila). Com 3 em cada, a sala fecha.
   */
  trocarTime(cliente) {
    const e = this.#naFila(cliente);
    if (!e) return 'fora';
    if (MODOS_FILA[e.modo].bots) return 'invalido';
    if (e.pronto) return 'travada';
    // Quem troca vai para o fim do outro time: a sala em que cai é a do pedaço de 3
    // dele. Só vale se for a sua sala (ou uma antes dela); cair numa sala seguinte é
    // o time cheio.
    const alvo = 1 - e.time;
    const minhaSala = Math.floor(this.#doTime(e.modo, e.time).indexOf(e) / MAX_POR_TIME);
    if (Math.floor(this.#doTime(e.modo, alvo).length / MAX_POR_TIME) > minhaSala) return 'cheio';
    e.time = alvo;
    e.ordem = this.proximaOrdem++;
    this.#formar(e.modo);
    this.#comecarProntos(e.modo);
    this.#avisarFila(e.modo);
    this.avisarContagem();
    return null;
  }

  /**
   * {t:'pronto'}: trava a nave; com todos prontos, a partida começa. Procurando, só
   * no modo com `minimoPorTime` e com o grupo já tendo esse mínimo em cada time
   * ('cedo' antes disso; 'fora' fora da fila).
   */
  pronto(cliente, msg) {
    const sala = this.salaDe.get(cliente);
    const temEscolha = msg && (msg.nome !== undefined || msg.race !== undefined || msg.classe !== undefined);
    if (!sala) {
      const e = this.#naFila(cliente);
      if (!e) return 'fora';
      if (!this.#podeCedo(e)) return 'cedo';
      if (temEscolha && !e.pronto) Object.assign(e, escolhaDaFila(msg, e));
      e.pronto = true;
      this.#comecarProntos(e.modo);
      // Os que ficaram (ou o grupo, se ainda falta alguém) veem o Pronto na hora.
      this.#avisarFila(e.modo);
      this.avisarContagem();
      return null;
    }
    const m = sala.membros.find((x) => x.cliente === cliente);
    if (temEscolha && !m.pronto) Object.assign(m, escolhaDaFila(msg, m));
    m.pronto = true;
    if (sala.membros.every((x) => x.pronto)) this.#comecar(sala);
    else this.#avisarSala(sala);
    return null;
  }

  /**
   * {t:'cancelarPronto'}: desfaz o Pronto (pedido do Mateus, 06/nov/2026: apertou e
   * quer trocar a nave). A nave e, procurando, o time destravam; a partida não começa
   * enquanto ele não apertar de novo. Com todos prontos a partida já começou, então
   * não há o que desfazer ('fora'). Sem Pronto, nada muda.
   */
  cancelarPronto(cliente) {
    const sala = this.salaDe.get(cliente);
    if (!sala) {
      const e = this.#naFila(cliente);
      if (!e) return 'fora';
      if (!e.pronto) return null;
      e.pronto = false;
      this.#avisarFila(e.modo);
      this.avisarContagem();
      return null;
    }
    const m = sala.membros.find((x) => x.cliente === cliente);
    if (!m.pronto) return null;
    m.pronto = false;
    this.#avisarSala(sala);
    return null;
  }

  /**
   * {t:'sairFila'} (ou a conexão caiu, `avisar` false): sai da fila; numa sala, a
   * desfaz e os outros voltam para o começo da fila.
   */
  sair(cliente, avisar = true) {
    const sala = this.salaDe.get(cliente);
    if (sala) {
      this.#desfazer(sala, (m) => m.cliente !== cliente, 'sala_saiu');
    } else {
      const e = this.#naFila(cliente);
      if (!e) return;
      const fila = this.filas[e.modo];
      fila.splice(fila.indexOf(e), 1);
      // Quem faltava apertar Pronto saiu: os que ficaram podem estar todos prontos.
      this.#comecarProntos(e.modo);
      this.#avisarFila(e.modo);
    }
    if (avisar) this.enviar(cliente, { t: 'fila', estado: 'fora' });
    this.avisarContagem();
  }

  // ---------- Relógio ----------

  /** Chamado de tempos em tempos: desfaz as salas cujo contador zerou e tenta formar outras. */
  passo() {
    const agora = this.agora();
    for (const sala of [...this.salas.values()]) {
      if (agora < sala.fim) continue;
      // Quem não apertou Pronto sai da fila; quem apertou volta para o começo dela.
      for (const m of sala.membros) if (!m.pronto) this.enviar(m.cliente, { t: 'fila', estado: 'fora', aviso: 'sem_pronto' });
      this.#desfazer(sala, (m) => m.pronto, 'sala_tempo');
    }
    for (const modo of Object.keys(MODOS_FILA)) if (this.#formar(modo) | this.#comecarProntos(modo)) this.#avisarFila(modo);
    this.avisarContagem();
  }

  // ---------- Contagem (o menu) ----------

  /** {t:'filas', <modo>: {fila, escolhendo, jogando}} para os modos de fila. */
  contagem() {
    const jogando = this.jogando() ?? {};
    const msg = { t: 'filas' };
    for (const modo of Object.keys(MODOS_FILA)) {
      let escolhendo = 0;
      for (const s of this.salas.values()) if (s.modo === modo) escolhendo += s.membros.length;
      msg[modo] = { fila: this.filas[modo].length, escolhendo, jogando: jogando[modo] ?? 0, precisa: MODOS_FILA[modo].humanos };
    }
    return msg;
  }

  /** Manda a contagem a quem observa, só se mudou. */
  avisarContagem() {
    const msg = this.contagem();
    const texto = JSON.stringify(msg);
    if (texto === this.ultimaContagem) return;
    this.ultimaContagem = texto;
    for (const c of this.observadores) this.enviar(c, msg);
  }

  // ---------- Por dentro ----------

  #naFila(cliente) {
    for (const fila of Object.values(this.filas)) {
      const e = fila.find((x) => x.cliente === cliente);
      if (e) return e;
    }
    return null;
  }

  #onde(cliente) {
    return this.salaDe.get(cliente) ?? this.#naFila(cliente);
  }

  /**
   * Os próximos membros de sala que a fila do modo já dá (null se ainda não dá): na
   * pública os primeiros `humanos`; no 3 contra 3 os 3 primeiros de cada time.
   */
  #proximaSala(modo) {
    const { humanos, bots } = MODOS_FILA[modo];
    const fila = this.filas[modo];
    if (bots) return fila.length >= humanos ? fila.slice(0, humanos) : null;
    const verde = this.#doTime(modo, 0).slice(0, MAX_POR_TIME);
    const vermelho = this.#doTime(modo, 1).slice(0, MAX_POR_TIME);
    return verde.length === MAX_POR_TIME && vermelho.length === MAX_POR_TIME ? [...verde, ...vermelho] : null;
  }

  /** Os da fila do 3 contra 3 num time, na ordem em que entraram nele. */
  #doTime(modo, time) {
    return this.filas[modo].filter((x) => x.time === time).sort((a, b) => a.ordem - b.ordem);
  }

  /** Forma as salas que a fila do modo já dá. Devolve se formou alguma. */
  #formar(modo) {
    const { bots } = MODOS_FILA[modo];
    const fila = this.filas[modo];
    let formou = false;
    let escolhidos;
    while (this.podeAbrirSala() && (escolhidos = this.#proximaSala(modo))) {
      for (const e of escolhidos) fila.splice(fila.indexOf(e), 1);
      // Quem já apertou Pronto na fila (começar mais cedo) continua pronto na sala.
      const membros = escolhidos.map((e) => ({ ...e, pronto: !!e.pronto }));
      if (bots) {
        // Os humanos juntos num time, do lado sorteado; o outro é dos computadores.
        const time = this.rng() < 0.5 ? 0 : 1;
        for (const m of membros) m.time = time;
      }
      // No 3 contra 3, cada um fica no time que escolheu na fila.
      const sala = { id: this.proximaSala++, modo, fim: this.agora() + this.selecaoMs, membros };
      this.salas.set(sala.id, sala);
      for (const m of membros) this.salaDe.set(m.cliente, sala);
      this.#avisarSala(sala);
      formou = true;
    }
    return formou;
  }

  /**
   * Os grupos do 3 contra 3 ([verde, vermelho] cada), na ordem das salas: o g-ésimo
   * pedaço de 3 de cada time.
   */
  #grupos(modo) {
    const porTime = [0, 1].map((t) => this.#doTime(modo, t));
    const n = Math.ceil(Math.max(porTime[0].length, porTime[1].length) / MAX_POR_TIME);
    return Array.from({ length: n }, (_, g) => porTime.map((l) => l.slice(g * MAX_POR_TIME, (g + 1) * MAX_POR_TIME)));
  }

  /** O grupo de `e` já tem o mínimo em cada time para começar mais cedo? */
  #podeCedo(e) {
    return this.#temMinimo(e.modo, this.#grupoDe(e).grupo);
  }

  /** O `grupo` ([verde, vermelho]) tem o mínimo em cada time de gente (na pública, só o 0)? */
  #temMinimo(modo, grupo) {
    const { minimoPorTime, bots } = MODOS_FILA[modo];
    return !!minimoPorTime && (bots ? grupo.slice(0, 1) : grupo).every((t) => t.length >= minimoPorTime);
  }

  /**
   * Os grupos da fila do modo, na ordem das salas, cada um [verde, vermelho]: na
   * pública os pedaços de `humanos` da fila (todos no 0); no 3 contra 3 os de #grupos.
   */
  #gruposDoModo(modo) {
    const { humanos, bots } = MODOS_FILA[modo];
    if (!bots) return this.#grupos(modo);
    const fila = this.filas[modo];
    return Array.from({ length: Math.ceil(fila.length / humanos) }, (_, g) => [fila.slice(g * humanos, (g + 1) * humanos), []]);
  }

  /**
   * Começa a partida dos grupos com o mínimo em cada time e todos prontos (começar
   * mais cedo). Devolve se começou alguma.
   */
  #comecarProntos(modo) {
    const { minimoPorTime, bots } = MODOS_FILA[modo];
    if (!minimoPorTime) return false;
    const fila = this.filas[modo];
    let comecou = false;
    let achou = true;
    while (achou && this.podeAbrirSala()) {
      achou = false;
      for (const grupo of this.#gruposDoModo(modo)) {
        if (!this.#temMinimo(modo, grupo) || !grupo.every((t) => t.every((e) => e.pronto))) continue;
        const membros = grupo.flat();
        for (const e of membros) fila.splice(fila.indexOf(e), 1);
        if (bots) {
          // Como na sala: os humanos juntos num time, do lado sorteado.
          const time = this.rng() < 0.5 ? 0 : 1;
          for (const e of membros) e.time = time;
        }
        this.#comecar({ id: this.proximaSala++, modo, membros });
        comecou = achou = true;
        break; // os grupos de trás andaram: conta de novo
      }
    }
    return comecou;
  }

  /**
   * Desfaz a sala: os membros que `volta` aceita voltam para o começo da fila (na
   * ordem de antes e com a espera de antes) com o `aviso`; quem chama avisa os outros.
   */
  #desfazer(sala, volta, aviso) {
    this.salas.delete(sala.id);
    for (const m of sala.membros) this.salaDe.delete(m.cliente);
    const voltam = sala.membros
      .filter(volta)
      .map(({ cliente, modo, desde, nome, race, classe, time }) => ({ cliente, modo, desde, nome, race, classe, time: MODOS_FILA[modo].bots ? 0 : time }));
    voltam.sort((a, b) => a.desde - b.desde);
    // Na frente de quem já esperava, inclusive dentro de cada time.
    for (let i = voltam.length - 1; i >= 0; i--) voltam[i].ordem = this.ordemVolta--;
    this.filas[sala.modo].unshift(...voltam);
    this.#formar(sala.modo);
    // Quem voltou e não caiu numa sala nova recebe o aviso junto com o tamanho da fila.
    this.#avisarFila(sala.modo, new Set(voltam.map((e) => e.cliente)), aviso);
  }

  /**
   * O grupo da próxima sala em que `e` está, por time ([verde, vermelho]; na pública
   * todos no 0): na pública os pedaços de `humanos` da fila; no 3 contra 3 os pedaços
   * de 3 de cada time (o g-ésimo grupo são os 3g-ésimos de cada um).
   */
  #grupoDe(e) {
    const { humanos, bots } = MODOS_FILA[e.modo];
    const fila = this.filas[e.modo];
    if (bots) {
      const inicio = Math.floor(fila.indexOf(e) / humanos) * humanos;
      return { grupo: [fila.slice(inicio, inicio + humanos), []] };
    }
    const g = Math.floor(this.#doTime(e.modo, e.time).indexOf(e) / MAX_POR_TIME);
    return { grupo: this.#grupos(e.modo)[g] };
  }

  /**
   * O estado de quem está na fila: o grupo da próxima sala em que ele está (`n`
   * pilotos de `precisa`) com os times, como na sala (o seu time às claras, o outro
   * às cegas), o Pronto de cada um e `cedo` (1: o grupo já pode começar mais cedo,
   * com todos prontos).
   */
  #estadoFila(e, aviso) {
    const { humanos } = MODOS_FILA[e.modo];
    const { grupo } = this.#grupoDe(e);
    const times = grupo.map((lista) =>
      lista.map((m) => {
        const linha = { nome: m.nome, pronto: m.pronto ? 1 : 0 };
        if (m.time === e.time) Object.assign(linha, { race: m.race, classe: m.classe });
        if (m === e) linha.voce = 1;
        return linha;
      }),
    );
    const msg = {
      t: 'fila',
      estado: 'procurando',
      modo: e.modo,
      n: times[0].length + times[1].length,
      precisa: humanos,
      espera: Math.max(0, (this.agora() - e.desde) / 1000),
      voce: { time: e.time, pronto: e.pronto ? 1 : 0 },
      times,
    };
    if (this.#podeCedo(e)) msg.cedo = 1;
    if (aviso) msg.aviso = aviso;
    return msg;
  }

  /**
   * Todos da fila do modo recebem o tamanho dela (os pilotos chegando, em tempo real);
   * os `comAviso` recebem também o `aviso`.
   */
  #avisarFila(modo, comAviso = null, aviso = null) {
    for (const e of this.filas[modo]) this.enviar(e.cliente, this.#estadoFila(e, comAviso?.has(e.cliente) ? aviso : null));
  }

  /** O estado da sala para cada membro: o próprio time às claras, o outro às cegas. */
  #avisarSala(sala) {
    const restante = Math.max(0, (sala.fim - this.agora()) / 1000);
    const prontos = sala.membros.filter((m) => m.pronto).length;
    for (const eu of sala.membros) {
      const times = Array.from({ length: N_TIMES }, () => []);
      for (const m of sala.membros) {
        const linha = { nome: m.nome, pronto: m.pronto ? 1 : 0 };
        if (m.time === eu.time) Object.assign(linha, { race: m.race, classe: m.classe });
        if (m === eu) linha.voce = 1;
        times[m.time].push(linha);
      }
      this.enviar(eu.cliente, {
        t: 'fila',
        estado: 'sala',
        modo: sala.modo,
        id: sala.id,
        restante,
        prontos,
        total: sala.membros.length,
        bots: MODOS_FILA[sala.modo].bots ? 1 : 0,
        voce: { time: eu.time, pronto: eu.pronto ? 1 : 0, race: eu.race, classe: eu.classe },
        times,
      });
    }
  }

  /**
   * Todos prontos: cria o mundo (aoComecar) e entrega a cada um o token da vaga. A
   * `sala` é a da seleção ou o grupo que começou mais cedo ({id, modo, membros}).
   */
  #comecar(sala) {
    this.salas.delete(sala.id);
    for (const m of sala.membros) {
      this.salaDe.delete(m.cliente);
      m.token = this.novoToken();
    }
    this.aoComecar({
      id: sala.id,
      modo: sala.modo,
      membros: sala.membros.map(({ nome, race, classe, time, token }) => ({ nome, race, classe, time, token })),
    });
    for (const m of sala.membros) {
      this.enviar(m.cliente, { t: 'fila', estado: 'comecar', modo: sala.modo, sala: sala.id, token: m.token, time: m.time, race: m.race, classe: m.classe, nome: m.nome });
    }
    this.avisarContagem();
  }

  /** Reenvia o estado de onde o cliente está (fila ou sala). */
  #avisar(cliente) {
    const sala = this.salaDe.get(cliente);
    if (sala) return this.#avisarSala(sala);
    const e = this.#naFila(cliente);
    if (e) this.enviar(cliente, this.#estadoFila(e));
  }
}
