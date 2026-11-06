// Regras da fila online no cliente, sem DOM nem socket (testadas em
// tests/fila-cliente.test.mjs): o estado da fila a partir das mensagens do servidor
// (server/filas.js), o texto e a ação do botão Decolar nos modos de fila, a linha de
// estado embaixo dele com o contador da sala, os avisos e a contagem dos modos na aba
// Jogar. O desenho fica em menu.js e escolha-times.js; a conexão em fila.js.
//
// O botão (pedido do Mateus): procurando, "Aguardando…" apagado; com a sala formada,
// "Pronto" aceso até apertar, e depois "Cancelar Pronto" (com o fio de "aguardando")
// até todos apertarem, que desfaz o Pronto para trocar a nave; no
// fim, "Decolando…". No 3 contra 3, com pelo menos um piloto em cada time no grupo
// (`cedo` do servidor), o "Pronto" já acende procurando: todos prontos, a partida
// começa com quem está (pedido do Mateus, para jogar só com um colega). Na pública,
// o mesmo com 2 pilotos no grupo, e um computador completa o time deles. Fora da fila
// (o contador zerou sem o seu Pronto, ou caiu a conexão), "Procurar partida" põe de
// volta.

/** Estado da fila fora dela. `fase`: 'fora' | 'conectando' | 'procurando' | 'sala' | 'comecar'. */
export function estadoFilaVazio() {
  return { fase: 'fora', modo: null, aviso: null };
}

/**
 * O estado novo a partir de uma mensagem {t:'fila'} do servidor, com os prazos em ms
 * do relógio local (`agora`): `desde` (entrou na fila) e `ate` (o contador da sala).
 */
export function aplicarMsgFila(antes, msg, agora) {
  switch (msg?.estado) {
    case 'procurando':
      return {
        fase: 'procurando',
        modo: msg.modo,
        n: msg.n,
        precisa: msg.precisa,
        desde: agora - (msg.espera ?? 0) * 1000,
        // O grupo da próxima sala, já repartido nos times (server/filas.js).
        voce: msg.voce ?? null,
        times: msg.times ?? null,
        // O grupo já pode começar mais cedo, com todos prontos (o Pronto acende).
        cedo: !!msg.cedo,
        // O aviso ("voltou para o começo da fila") fica enquanto procura.
        aviso: msg.aviso ?? (antes?.fase === 'procurando' ? antes.aviso : null),
      };
    case 'sala':
      return {
        fase: 'sala',
        modo: msg.modo,
        id: msg.id,
        ate: agora + (msg.restante ?? 0) * 1000,
        prontos: msg.prontos,
        total: msg.total,
        bots: !!msg.bots,
        voce: msg.voce,
        times: msg.times,
        // Sala nova (outro id): o aviso de antes some; a mesma sala mantém.
        aviso: antes?.fase === 'sala' && antes.id === msg.id ? antes.aviso : null,
        nova: !(antes?.fase === 'sala' && antes.id === msg.id),
      };
    case 'comecar':
      return { fase: 'comecar', modo: msg.modo, sala: msg.sala, token: msg.token, time: msg.time, nome: msg.nome, race: msg.race, classe: msg.classe, aviso: null };
    case 'fora':
      return { fase: 'fora', modo: antes?.modo ?? null, aviso: msg.aviso ?? null };
    default:
      return antes;
  }
}

/** 'm:ss' de segundos (para cima: o contador mostra 0:01 até zerar). */
export function formatarTempo(s, paraCima = false) {
  const t = Math.max(0, paraCima ? Math.ceil(s) : Math.floor(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

const CANCELAR_PRONTO = Object.freeze({ texto: 'Cancelar Pronto', habilitado: true, acao: 'cancelar' });

/**
 * O botão Decolar num modo de fila: { texto, habilitado, acao } (acao 'entrar' |
 * 'pronto' | 'cancelar' | null). Depois do Pronto o botão continua clicável para
 * desfazê-lo ("Cancelar Pronto"), como no LoL: o piloto pode trocar a nave.
 */
export function botaoDaFila(estado) {
  switch (estado?.fase) {
    case 'conectando':
      return { texto: 'Conectando…', habilitado: false, acao: null };
    case 'procurando':
      if (estado.voce?.pronto) return CANCELAR_PRONTO;
      return estado.cedo ? { texto: 'Pronto', habilitado: true, acao: 'pronto' } : { texto: 'Aguardando…', habilitado: false, acao: null };
    case 'sala':
      return estado.voce?.pronto ? CANCELAR_PRONTO : { texto: 'Pronto', habilitado: true, acao: 'pronto' };
    case 'comecar':
      return { texto: 'Decolando…', habilitado: false, acao: null };
    default:
      return { texto: 'Procurar partida', habilitado: true, acao: 'entrar' };
  }
}

/**
 * A linha embaixo do botão: { texto, contador ('m:ss' ou null), fracao (0–1 do
 * contador da sala, para a barra; null fora dela), urgente (últimos 10 s) }.
 */
export function linhaDaFila(estado, agora, selecaoS) {
  switch (estado?.fase) {
    case 'conectando':
      return { texto: 'Conectando ao servidor', contador: null, fracao: null, urgente: false };
    case 'procurando': {
      const faltam = Math.max(0, estado.precisa - estado.n);
      let texto = faltam ? `Procurando partida · ${estado.n} de ${estado.precisa} pilotos` : `Pilotos encontrados · abrindo a sala`;
      if (faltam && estado.cedo) {
        const prontos = (estado.times ?? []).flat().filter((m) => m.pronto).length;
        // Na pública a vaga que falta no time fica com um computador.
        const ia = estado.modo === 'publica' ? ' · um computador completa o time' : '';
        texto = estado.voce?.pronto
          ? `Nave travada · ${prontos} de ${estado.n} prontos · começa com todos prontos${ia}`
          : `${estado.n} de ${estado.precisa} pilotos · aperte Pronto para começar já · ${prontos} de ${estado.n} prontos${ia}`;
      }
      return { texto, contador: formatarTempo((agora - estado.desde) / 1000), fracao: null, urgente: false };
    }
    case 'sala': {
      const resta = Math.max(0, (estado.ate - agora) / 1000);
      const texto = estado.voce?.pronto
        ? `Nave travada · ${estado.prontos} de ${estado.total} prontos`
        : `Escolha a nave e aperte Pronto · ${estado.prontos} de ${estado.total} prontos`;
      return { texto, contador: formatarTempo(resta, true), fracao: selecaoS > 0 ? Math.min(1, resta / selecaoS) : 0, urgente: resta <= 10 };
    }
    case 'comecar':
      return { texto: 'Todos prontos · entrando na partida', contador: null, fracao: null, urgente: false };
    default:
      return { texto: '', contador: null, fracao: null, urgente: false };
  }
}

/** A frase de cada aviso do servidor (e da conexão). */
export const AVISOS_FILA = Object.freeze({
  sem_pronto: 'O tempo da seleção acabou sem o seu Pronto e você saiu da fila. Aperte "Procurar partida" para voltar.',
  sala_tempo: 'Um piloto não apertou Pronto a tempo. Você voltou para o começo da fila.',
  sala_saiu: 'Um piloto saiu da sala. Você voltou para o começo da fila.',
  sem_conexao: 'Sem conexão com o servidor das filas. Tentando de novo…',
});

/** O aviso em texto (null sem aviso). */
export function textoAviso(aviso) {
  return aviso ? (AVISOS_FILA[aviso] ?? null) : null;
}

/**
 * A linha de estado do modo de fila na aba Jogar, da contagem do servidor ({fila,
 * escolhendo, jogando}); sem contagem (sem conexão), null: fica o "—" do MODOS.
 */
export function textoContagemModo(c) {
  if (!c) return null;
  const partes = [`${c.fila} na fila`];
  if (c.escolhendo) partes.push(`${c.escolhendo} escolhendo`);
  if (c.jogando) partes.push(`${c.jogando} jogando`);
  return partes.join(' · ');
}

/** Vagas de cada time na Seleção de um modo de fila. */
export const VAGAS_POR_TIME = 3;

/**
 * Os títulos das duas faixas (a da esquerda, `meu`, e a da direita, `inimigo`). No 3
 * contra 3 os times têm cor fixa, como pediu o Mateus: TIME VERDE (0, a esquerda) e
 * TIME VERMELHO (1, a direita), e o piloto escolhe em qual fica; na pública, o seu
 * time contra os computadores.
 */
export function titulosDosLados(modo) {
  return modo === 'online' ? { meu: 'Time verde', inimigo: 'Time vermelho' } : { meu: 'Seu time', inimigo: 'Inimigo' };
}

/**
 * As vagas das duas faixas para desenhar: cada vaga { tipo: 'voce' | 'piloto' |
 * 'oculto' | 'ia' | 'procurando' | 'trocar', nome?, race?, classe?, pronto? }.
 *
 * Na pública: a faixa da esquerda é o seu time (a sua vaga primeiro) e a da direita os
 * computadores ('ia'). No 3 contra 3: a esquerda é o time verde e a direita o
 * vermelho, cada um na ordem de chegada, com você no que estiver; os do seu time às
 * claras, os do outro às cegas ('oculto'). As vagas que faltam são "procurando" no
 * seu time e, procurando no 3 contra 3, 'trocar' no outro (clicar troca de time).
 * Sem o grupo (fora da fila): só a sua vaga.
 */
export function vagasDaFila(estado, modo) {
  const bots = modo === 'publica';
  const preencher = (lista, tipo) => {
    while (lista.length < VAGAS_POR_TIME) lista.push({ tipo });
    return lista;
  };
  if ((estado?.fase === 'sala' || estado?.fase === 'procurando') && estado.times) {
    const meuT = estado.voce?.time ?? 0;
    const linha = (m, time) =>
      time === meuT ? { tipo: m.voce ? 'voce' : 'piloto', nome: m.nome, race: m.race, classe: m.classe, pronto: !!m.pronto } : { tipo: 'oculto', nome: m.nome, pronto: !!m.pronto };
    if (bots || estado.bots) {
      const meu = (estado.times[meuT] ?? []).map((m) => linha(m, meuT));
      meu.sort((a, b) => (b.tipo === 'voce') - (a.tipo === 'voce'));
      return { meu: preencher(meu, 'procurando'), inimigo: preencher([], 'ia') };
    }
    // Depois do Pronto na fila (começar mais cedo) o time também fica travado.
    const vaga = (time) => (time === meuT || estado.fase !== 'procurando' || estado.voce?.pronto ? 'procurando' : 'trocar');
    const [verde, vermelho] = [0, 1].map((t) => preencher((estado.times[t] ?? []).map((m) => linha(m, t)), vaga(t)));
    return { meu: verde, inimigo: vermelho };
  }
  return { meu: preencher([{ tipo: 'voce' }], 'procurando'), inimigo: preencher([], bots ? 'ia' : 'procurando') };
}
