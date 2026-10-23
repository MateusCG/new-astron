// Jogadores do computador (pedido do Mateus): naves de jogador controladas pelo
// servidor, que entram num time como qualquer piloto (contam no limite de
// MAX_POR_TIME) e jogam como uma pessoa jogaria.
//
// O computador é um jogador de verdade no World: mesma nave da raça e da classe,
// mesma física (o comando dele passa pelo mesmo sanitizeInput e stepShip, um por
// tick), mesmo dano, XP, ouro, Loja e Evolução. A única diferença é quem aperta as
// teclas: em vez de chegar pela rede, o comando sai daqui (`passo`, chamado pelo
// World antes de aplicar os comandos). Nada é trapaça: ele não atravessa rocha, não
// compra fora da plataforma (pousa nela e faz o mesmo pedido do cliente, em
// Servicos.pedido), não atira na base do outro time e **só sabe dos inimigos o que o
// time dele enxerga** (a névoa de guerra: as mesmas regras de shared/visao.js com os
// mesmos olhos que o servidor usa para o snapshot, mais a camuflagem, que só se vê de
// perto). O que é público ele sabe como qualquer piloto: o mapa (posições fixas de
// acampamentos, buffs, poços, torres), o estado dos objetivos (`obj`), quais torres
// estão de pé, o placar e as regras de tempo (um acampamento volta 1:30 depois de
// morrer). Os acampamentos que o time não vê ficam na memória do time (`memoria`):
// visto vazio, volta na hora que a regra diz; nunca visto, conta que nasceu.
//
// O nick é sempre "NOME (IA)", com um nome próprio brasileiro em maiúsculas (NOMES),
// sem repetir dentro do mundo. O jogador humano não consegue fingir (o limpaNome do
// World tira os parênteses).
//
// Papéis (o mapa do Stage 6 pede três, new-astron-mapa.md §6). Os computadores de
// cada time ganham os papéis na ordem em que entraram, IA.papeis: com um só ele é o
// da lane, com dois lane e jungle, com três também o roamer.
// - LANE: escolta os mineradores do time (fica um pouco à frente do mais adiantado,
//   no lado da lane, sem passar da mineradora) e briga com quem vem à metade da lane
//   do time (debaixo das torres do time). Com a lane quieta e pouco nível, limpa o
//   acampamento da base mais perto da lane que ninguém do time está limpando. Com o
//   time ganhando (ver "torres"), empurra: derruba os mineradores do outro time na
//   doca deles e a torre inimiga mais perto.
// - JUNGLE: farma os acampamentos do território do time na ordem natural, os da base
//   primeiro e depois os do centro (o mais perto de cada tipo); pega o buff de
//   suporte (a torre, que não revida) assim que acende e o de ataque (o SN-4) com
//   nível IA.chefeNivel e vida; pousa na plataforma de pouso do território quando
//   ninguém do outro time está à vista; mata a sonda errante. Sem nada para fazer,
//   espera o próximo acampamento ou ajuda a lane (faz o mesmo que ela: dois juntos
//   no posto ganham a licença para empurrar).
// - ROAMER: alterna (IA.emboscadaS emboscando, IA.roamerFarmS farmando). Na
//   emboscada, vai pela jungle e pelos asteroides (o caminho contorna o alcance das
//   torres inimigas) até a beira do campo de asteroides central do outro time mais
//   perto da doca deles e, escondido ali (de dentro do campo ninguém de fora o vê),
//   derruba os mineradores que param para minerar. Troca de lado (de cima, de baixo)
//   a cada emboscada.
//
// Torres sentinela inimigas (alcance 560 m, míssil teleguiado): ninguém entra no
// alcance de uma torre de pé que o veja (a mesma regra de visão: rocha, mineradora e
// asteroide escondem) a não ser que o time esteja GANHANDO a briga ali (pelo menos
// IA.forcaMin pilotos do time perto e a força deles, vida × nível, IA.vantagem vezes a
// dos inimigos à vista) e ele tenha vida. Os caminhos já evitam a área das torres (o
// A* de server/navegacao.js com custo a mais nas células cobertas); brigando, ele
// atira de onde está em vez de avançar para dentro do alcance; alvo que só se pega
// lá dentro, ele larga. Caiu a torre, a área dela fica livre.
//
// Objetivos épicos (o time de computadores vai junto, nunca um só):
// - Ancient Medusa (5:00) e Núcleo de He-3 (8:00 e 15:00): com pelo menos IA.epicoMin
//   computadores vivos no time e o nível médio deles (IA.medusaNivel, IA.nucleoNivel),
//   todos vão a um ponto de reunião fora do alcance do chefe (e das torres) e só
//   atacam quando o grupo chegou (ou alguém do time já está brigando lá). Grupo
//   desfeito (menos de IA.epicoMin vivos perto) com o chefe ainda forte: desistem por
//   IA.desistirS.
// - Onda do Núcleo (os 3 mineradores grandes): a do outro time é caçada pelo grupo
//   (com o grupo, pode entrar no alcance das torres); a do time é escoltada pela lane.
//   O time sabe quem tomou o Núcleo pelo `obj` (público), e conta IA.ondaS da onda.
//
// Sobrevivência: vida abaixo de IA.vidaFugir larga tudo e volta para a base (recall se
// estiver longe e sossegado; voando, se não), pousa e conserta; usa o kit de reparo
// (se tiver). Briga com jogador só se a força dos dois lados permite (ou ele tem vida
// e não está em menor número); senão recua. Não fica no alcance da torre inimiga sem
// licença (sai pelo caminho mais curto para fora dele). Provocou a Medusa sem o time
// junto, foge.
//
// Compras e pontos (como antes): ouro sobrando, pousa na Evolução para a próxima nave
// da linha e na Loja para as versões das duas armas de fábrica, o equipamento (um
// escudo, uma armadura geral e dois potenciadores: o Reforço do tipo de dano das armas
// dele e o de Durabilidade), as versões dele e kits, pelos mesmos pedidos do cliente
// ({t:'comprar'}, {t:'equipar'}, {t:'evoluirItem'}). Guarda ouro para a nave quando já
// tem o nível dela; fora a nave, só vai comprar com ouro que valha a viagem
// (IA.compraMin, mais IA.compraPorNivel por nível). A cada nível, distribui os pontos livres ({t:'pontos'}) entre o
// poder do tipo de dano das armas, a Energia (IA.fracaoEnergia) e a Durabilidade (IA.fracaoDurabilidade).
//
// Para não parecer máquina: demora um pouco para reagir a um alvo novo (IA.reacaoS),
// erra a mira um pouco (menos com o nível) e cada um tem a sua agressividade
// (sorteada ao entrar). Alvo que some da visão é seguido até onde foi visto por
// IA.memoriaAlvoS e depois esquecido.
//
// Navegação (server/navegacao.js, grade de 10 m sem bloqueio nas bases): destino perto
// com linha livre (a nave tem largura: três linhas paralelas) e fora do alcance das
// torres, vai reto; senão, um caminho A* com o custo a mais da área das torres
// inimigas e da base do outro time (`perigo`, por time, refeito quando cai uma torre)
// e a nave mira o ponto mais adiante do caminho que ela alcança em linha livre. O
// caminho é refeito quando o destino anda (IA.replanMover) ou de tempos em tempos.
// Presa numa quina (acelerando sem andar), dá ré virando e refaz o caminho.
//
// Custo: o cérebro pensa IA.pensarTicks vezes menos que o tick (cada computador num
// tick diferente); o que o time vê é contado uma vez por tick por time; o A* custa
// de 0,1 a 5 ms e só roda ao trocar de destino.

import { DT, sanitizeInput, versaoArma, velocidadeBase, ARMAS, WEAPONS } from '../shared/sim.js';
import {
  BASES,
  MINERADORA,
  LANE,
  AREAS_POUSO,
  ACAMPAMENTOS,
  BUFFS,
  PLATAFORMAS_POUSO,
  NUCLEO,
  MEDUSA,
  ESPERAS,
  ASTEROIDES,
  MAP_HALF_X,
  MAP_HALF_Z,
  BOLSAO,
  trajetoSonda,
} from '../shared/terrain.js';
import { enxerga, bloqueiaVisao, olho, olhosDaBase, algumOlhoVe, VISAO_RAIO, VISAO_MINERADOR, VISAO_TORRETA } from '../shared/visao.js';
import { naveDe } from '../shared/naves.js';
import { ITENS, precoEvoluirInst, naNave } from '../shared/loja.js';
import { EQUIPAMENTOS, equipamentosAVenda } from '../shared/equipamentos.js';
import { pontosLivres, PONTO_MAX, ORDEM_ATRIBUTOS } from '../shared/status.js';
import { NIVEL_MAX } from './progressao.js';
import { MapaNavegacao, CELULA } from './navegacao.js';
import { TORRETA } from './torretas.js';
import { TORRETA as PLANTA_TORRETA, TORRE_SUPORTE } from '../shared/obstaculos.js';
import { alcanceMaximo } from './especies.js';
import { INVISIVEL_VISTO_M } from './golpes.js';
import { naPlataforma } from './servicos.js';
import { RECALL_VEL_MAX } from '../shared/recall.js';

const TICK_HZ = Math.round(1 / DT);
const ticks = (s) => Math.round(s * TICK_HZ);

/** Números do comportamento do computador. */
export const IA = {
  pensarTicks: 5, // decide o que fazer 6 vezes por segundo
  reacaoS: [0.25, 0.6], // demora para começar a atirar num alvo novo
  erroMira: 0.045, // rad de erro de mira no nível 1 (cai pela metade no NIVEL_MAX)
  papeis: ['lane', 'jungle', 'roamer'], // na ordem de entrada no time; com menos computadores, os primeiros

  // Briga com jogadores (só os que o time vê).
  visaoJogador: 320, // m: jogador inimigo mais perto que isso vira briga
  defenderRaio: 260, // m: inimigo perto assim de um minerador do time também
  defenderMax: 750, // m: ...se o computador estiver a até isto
  forcaRaio: 450, // m em volta: quem conta na força de cada lado
  forcaNivel: 3, // somado ao nível no peso de cada piloto (vida × (nível + isto))
  forcaMin: 2, // pilotos do time perto para "ganhar a briga" (sozinho nunca)
  vantagem: 1.3, // força do time / força dos inimigos à vista para "ganhar a briga"
  encarar: 0.8, // briga com jogador se a força do time for pelo menos isto da deles

  // Vida (fração do HP).
  vidaFugir: 0.3, // larga tudo e volta para a base
  vidaBrigar: 0.45, // encara jogador sozinho
  vidaConsertar: 0.45, // sem briga por perto, vai consertar
  vidaPronto: 0.95, // pousado na base, decola com isto
  usarReparo: 0.4, // usa o kit de reparo
  energiaCelula: 0.15, // usa a célula de energia brigando

  // Torres sentinela inimigas.
  torretaFolga: 15, // m além do alcance (560) que já conta como perigo
  vidaTorreta: 0.6, // vida para entrar no alcance com o time ganhando (dele e de quem conta junto)
  licencaRaio: 220, // m: os do time a até isto dele contam para entrar no alcance da torre
  custoPerigo: 2.5, // custo a mais por célula coberta (o caminho contorna se der)
  custoBaseInimiga: 40, // por célula do bolsão da base do outro time
  segurarAdiante: 35, // m: brigando, se o ponto à frente está coberto, para de avançar

  // Lane.
  lanePostoBase: 650, // m da base: posto sem minerador do time na lane
  laneFrente: 40, // m à frente do minerador mais adiantado
  laneLado: 45, // m do eixo da lane (o lado é de cada um)
  laneLimite: 40, // m antes da face da mineradora: o posto não passa daqui
  laneDefesa: 500, // m do posto: inimigo mais perto que isso é da lane
  laneCacaRaio: 1000, // m do posto: acampamento da base até aqui ele limpa com a lane quieta
  laneFarmNivel: 8, // a partir daqui a lane só escolta e empurra
  empurrarNivel: 5, // nível para empurrar (com o time ganhando) e espreitar a doca deles (sem torre cobrindo)
  empurrarDist: 800, // m: torre inimiga mais longe que isso não vale o empurrão
  espreitaX: 60, // m além da face da mineradora, do lado do outro time
  espreitaZ: 80, // m do eixo da lane (de onde a doca deles fica à vista)

  // Jungle.
  chefeNivel: 6, // caça o SN-4 do buff de ataque a partir daqui
  chefeVida: 0.75,
  plataformaSegura: 500, // m: inimigo à vista mais perto que isso, não pousa (e decola)
  plataformaVida: 0.4,
  sondaRaio: 800, // m: sonda à vista até aqui, vai atrás
  cacaMax: 1400, // m: monstro mais longe que isso não vale a viagem
  esperaCampoS: 20, // s: acampamento que volta antes disto, espera nele; senão ajuda a lane
  revisitaS: 30, // s: acampamento visto vazio sem saber quando morreu, olha de novo depois disto

  // Roamer.
  roamerNivel: 3, // antes disso só farma
  emboscadaS: 45,
  roamerFarmS: 30,
  emboscadaRecuo: 8, // m para dentro do campo de asteroides, a partir da beira

  // Objetivos épicos (o time junto).
  epicoMin: 2, // computadores vivos do time para ir
  nucleoNivel: 5, // nível médio dos computadores do time
  medusaNivel: 7,
  epicoVida: 0.6, // abaixo, conserta antes de ir
  reuniaoRaio: 160, // m do ponto de reunião (ou mais perto do chefe): conta como chegou
  desistirS: 45, // grupo desfeito com o chefe ainda forte: desiste por isto
  desistirVida: 0.4, // ...se o chefe tem mais vida que isto
  ondaS: 130, // s que a onda do Núcleo fica no mapa depois de tomado
  nucleoPerto: 130, // m: não chega mais perto do Núcleo (o pulso vai a 80 m)
  medusaFolga: 40, // m além do alcance da Medusa: sem o time, não chega perto

  // Memória e pilotagem.
  memoriaAlvoS: 3, // s seguindo alvo que sumiu da visão, até onde foi visto
  presoS: 1.5, // parado querendo andar: dá ré
  reS: 0.7,
  retaMax: 350, // m: destino mais perto que isso com linha livre, vai reto
  folgaLinha: 5, // m das linhas paralelas do teste de linha livre (a nave tem 4,5 m de raio)
  linhaTicks: 8, // de quanto em quanto tempo refaz o teste de linha reta até o destino
  olharCelulas: 8, // até quantas células adiante no caminho ele mira
  miraTicks: 3, // de quanto em quanto tempo refaz a mira no caminho
  replanS: 4, // refaz o caminho até alvo que anda
  replanMover: 40, // m: destino andou isso, refaz o caminho
  pousoPerto: 140, // m da área de pouso: daqui vem freando
  pousoFreio: 0.7, // velocidade querida (m/s) por metro que falta
  pousoVel: 9, // m/s: abaixo disto, dentro da área, aperta o L
  recallDist: 550, // m da base: mais longe que isso, volta de recall
  calmoS: 2.5, // s sem levar dano para tentar o recall

  // Compras e pontos.
  compraMin: 110, // ouro de compras para valer a viagem à base (no nível 1)
  compraPorNivel: 30, // ...e mais isto por nível
  kitsDesejados: 2,
  fracaoEnergia: 0.3, // dos pontos do piloto, esta fração vai na Energia; o resto no poder das armas
  fracaoDurabilidade: 0.2, // e esta na Durabilidade (HP)
  potenciadorVida: 'e340001', // Potenciador de Durabilidade: o segundo potenciador de todo computador
};

/** Nomes próprios brasileiros para o nick ("JOAO (IA)"). */
export const NOMES = [
  'JOAO', 'LAIS', 'MARIO', 'ANA', 'PEDRO', 'LUCAS', 'GABRIEL', 'RAFAEL', 'JULIA', 'BEATRIZ',
  'CAMILA', 'FERNANDA', 'BRUNO', 'THIAGO', 'CARLOS', 'PAULO', 'MARCOS', 'RENATA', 'LETICIA', 'LARISSA',
  'VINICIUS', 'GUSTAVO', 'FELIPE', 'DIEGO', 'RODRIGO', 'ALINE', 'BIANCA', 'CAIO', 'DANIEL', 'EDUARDO',
  'FABIO', 'HELENA', 'IGOR', 'ISABELA', 'JORGE', 'KAUA', 'LUANA', 'MARIANA', 'NATALIA', 'OTAVIO',
  'PRISCILA', 'RAQUEL', 'SAMUEL', 'TATIANA', 'VITOR', 'YASMIN', 'CLARA', 'LUIZA', 'HEITOR', 'ENZO',
  'ARTHUR', 'DAVI', 'SOFIA', 'ALICE', 'MANUELA', 'VALENTINA', 'GIOVANNA', 'RICARDO', 'SERGIO', 'ANTONIO',
  'FRANCISCO', 'RAIMUNDO', 'TERESA', 'JOANA', 'CRISTIANE', 'LEANDRO', 'MURILO', 'PATRICIA', 'SIMONE', 'WESLEY',
];
export const SUFIXO_IA = ' (IA)';

/** Nick de computador com um nome que ainda não está no mundo. */
export function nomeDeBot(rng, usados) {
  const livres = NOMES.filter((n) => !usados.has(n + SUFIXO_IA));
  const lista = livres.length ? livres : NOMES;
  return lista[Math.floor(rng() * lista.length) % lista.length] + SUFIXO_IA;
}

// A grade dos computadores não bloqueia as bases (os monstros usam outra, com a
// zona segura bloqueada). Depende só do terreno: uma por processo, na primeira vez
// que aparece um computador.
let grade = null;
function nav() {
  grade ??= new MapaNavegacao();
  return grade;
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const yawPara = (s, x, z) => Math.atan2(-(x - s.x), -(z - s.z));
function anguloEntre(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}
const PARADO = { th: 0, tu: 0, b: false, f1: false, f2: false, p: false, r: false, a: -1, a2: -1 };
/** Rumo da base do time até a mineradora, no eixo x (+1 para o time 0, que fica à esquerda). */
const sinal = (time) => (BASES[time].x < 0 ? 1 : -1);

const ANEL_BASE = BASES.map((b) => AREAS_POUSO.find((a) => a.base === b.time));
const PLATAFORMA = Object.fromEntries(
  ['evolucao', 'loja'].map((sv) => [sv, BASES.map((b) => AREAS_POUSO.find((a) => a.servico === sv && a.time === b.time))]),
);
/** Plataforma de pouso de dinheiro do território de cada time, com a área de pouso dela. */
const PLATAFORMA_OURO = BASES.map((b) => {
  const p = PLATAFORMAS_POUSO.find((x) => x.time === b.time);
  return { ...p, area: AREAS_POUSO.find((a) => a.plataforma === p.id) };
});
/** Acampamentos do território de cada time na ordem natural (os da base primeiro). */
const CAMPOS_DO_TIME = BASES.map((b) => ACAMPAMENTOS.filter((a) => a.time === b.time));
const BUFF = (tipo) => BASES.map((b) => BUFFS.find((x) => x.tipo === tipo && x.time === b.time));
const BUFF_ATAQUE = BUFF('ataque');
const BUFF_SUPORTE = BUFF('suporte');
/**
 * Pontos de emboscada de cada time: dentro do campo de asteroides central do OUTRO
 * time, no ponto mais perto da doca deles (IA.emboscadaRecuo para dentro da beira).
 * De lá a doca fica a ~250 m, ao alcance das armas, e ninguém de fora do campo o vê.
 */
const EMBOSCADAS = BASES.map((b) =>
  ASTEROIDES.filter((a) => a.time !== b.time && a.id.startsWith('AC')).map((a) => {
    const d = ESPERAS.find((x) => x.time !== b.time); // a porta do hangar deles (dentro, o minerador está protegido)
    const r = IA.emboscadaRecuo;
    return {
      id: a.id,
      x: clamp(d.x, a.x - a.largura / 2 + r, a.x + a.largura / 2 - r),
      z: clamp(d.z, a.z - a.profundidade / 2 + r, a.z + a.profundidade / 2 - r),
    };
  }),
);
/**
 * Ponto de reunião de cada time para cada chefe: na coluna central, entre os campos
 * de asteroides e as paredes em L do poço, do lado do time, fora do alcance do chefe
 * e das torres dos dois times.
 */
const REUNIAO = {
  nucleo: BASES.map((b) => ({ x: -sinal(b.time) * 60, z: NUCLEO.z + 302 * Math.sign(-NUCLEO.z) })),
  medusa: BASES.map((b) => ({ x: -sinal(b.time) * 60, z: MEDUSA.z + 302 * Math.sign(-MEDUSA.z) })),
};

/** Alcance (m) e velocidade do projétil da arma do encaixe, na versão que a nave tem. */
function armaDoEncaixe(s, enc) {
  const a = s.encaixes?.[enc];
  const v = versaoArma(a, s.nivEnc?.[enc] ?? 1);
  const g = v?.golpe;
  if (!g || g.forma !== 'projetil' || !(g.vel > 0)) return null;
  return { alcance: g.vel * g.vida, vel: g.vel, energia: v.energia };
}
/** Alcance das armas da nave: { min, max } (250 m sem arma de projétil). */
function alcances(s) {
  const z = armaDoEncaixe(s, 0)?.alcance;
  const x = armaDoEncaixe(s, 1)?.alcance;
  const l = [z, x].filter((a) => a > 0);
  return l.length ? { min: Math.min(...l), max: Math.max(...l) } : { min: 250, max: 250 };
}

export class Bots {
  /**
   * @param {import('./game.js').World} world
   * @param {{ zonaSegura: number }} opcoes raio da zona segura das bases (do World)
   */
  constructor(world, { zonaSegura }) {
    this.world = world;
    this.zonaSegura = zonaSegura;
    this.conhece = BASES.map(() => null); // o que cada time vê, por tick (#saber)
    this.perigos = BASES.map(() => null); // grade do alcance das torres inimigas (#perigo)
    this.memoria = BASES.map(() => new Map()); // acampamentos que o time viu (#campoVivo)
    this.planos = BASES.map(() => null); // objetivo épico do time, por tick (#plano)
    this.desistiu = BASES.map(() => ({})); // { nucleo: tick, medusa: tick }: até quando não tenta de novo
    this.ondas = BASES.map(() => 0); // tick até quando a onda do Núcleo do time está no mapa
    this.nucleoAntes = null; // estado do Núcleo no último tick (para ver quem o tomou)
    this.objCache = null;
    this.partida = -1;
  }

  /** Cérebro novo (entrada, partida nova): jeito sorteado e nada em andamento. */
  novoCerebro() {
    const rng = this.world.rng;
    return {
      partida: this.world.partida.numero,
      fase: Math.floor(rng() * IA.pensarTicks), // cada um pensa num tick diferente
      agressivo: rng(), // 0 = cauteloso, 1 = afoito
      papel: null,
      modo: 'parado',
      tarefa: '', // o que está fazendo (para os testes e para depurar)
      alvo: null, // entidade em que está atirando
      destino: null, // { x, z, area?, seguro? }
      visto: null, // { x, z, tick }: onde o alvo foi visto por último
      reagirEm: 0,
      erro: 0,
      preso: 0,
      re: 0,
      ronda: rng() < 0.5 ? 1 : -1, // lado para onde vira dando ré
      lado: rng() < 0.5 ? 1 : -1, // de que lado da lane fica
      rota: null, // caminho A*: { pts, i, x, z, seguro, ate }
      mira: null, // ponto do caminho em que mira: { x, z, ate }
      linha: null, // teste de linha reta até o destino: { x, z, livre, ate }
      campo: null, // id do acampamento que está limpando
      ciclo: 'farm', // roamer: 'farm' ou 'emboscada'
      cicloAte: 0,
      emboscada: rng() < 0.5 ? 0 : 1, // qual dos dois pontos de emboscada
      pulsoP: false,
      pulsoR: false,
      recallEm: 0,
      foge: 0, // ticks se afastando de monstro de garra
      enroscos: 0, // vezes que ficou preso numa quina e deu ré (para os testes)
      ordem: null, // { x, z }: vai até lá e para, sem decidir nada (testes de navegação)
    };
  }

  /** Todos os computadores do mundo. */
  *lista() {
    for (const j of this.world.players.values()) if (j.ia) yield j;
  }

  /** Um comando por computador vivo, na fila dele (o World aplica como o de qualquer jogador). */
  passo() {
    const w = this.world;
    if (this.partida !== w.partida.numero) {
      // Partida nova: memória e planos do zero.
      this.partida = w.partida.numero;
      this.memoria = BASES.map(() => new Map());
      this.desistiu = BASES.map(() => ({}));
      this.ondas = BASES.map(() => 0);
      this.nucleoAntes = null;
    }
    let algum = false;
    for (const j of this.lista()) {
      algum = true;
      if (!j.vivo) continue;
      if (j.ia.partida !== w.partida.numero) j.ia = this.novoCerebro(); // partida nova: começa do zero
      if ((w.tick + j.ia.fase) % IA.pensarTicks === 0) this.#pensar(j);
      const cmd = this.#agir(j);
      j.fila.push({ seq: j.ack + j.fila.length + 1, inp: sanitizeInput(cmd) });
    }
    if (algum) this.#acompanharNucleo();
  }

  // ---------- O que é público e o que o time vê ----------

  /** Estado dos objetivos (o `obj` do snapshot, público), uma vez por tick. */
  #obj() {
    const w = this.world;
    if (this.objCache?.tick !== w.tick) this.objCache = { tick: w.tick, obj: { ...w.objetivos.estado(), ...(w.jungle?.estado() ?? {}) } };
    return this.objCache.obj;
  }

  /** Quem tomou o Núcleo (público, pelo `obj`): a onda do Núcleo dele está no mapa por IA.ondaS. */
  #acompanharNucleo() {
    const n = this.#obj().NUCLEO;
    const antes = this.nucleoAntes;
    this.nucleoAntes = n ? { estado: n.estado, time: n.time } : null;
    if (antes?.estado === 'ativo' && n && n.estado !== 'ativo' && n.time !== null && n.time !== undefined) {
      this.ondas[n.time] = this.world.tick + ticks(IA.ondaS);
    }
  }

  /** A onda do Núcleo do `time` ainda está no mapa? */
  #ondaAtiva(time) {
    return this.world.tick < this.ondas[time];
  }

  /**
   * O que o `time` vê agora (uma vez por tick): os olhos (os mesmos do filtro do
   * snapshot, server/visao.js: naves vivas, mineradores e escoltas, torres de pé e a
   * base), os aliados vivos, os mineradores do time e, do outro time e neutros, só o
   * que algum olho enxerga.
   */
  #saber(time) {
    const w = this.world;
    let k = this.conhece[time];
    if (k?.tick === w.tick) return k;
    const olhos = olhosDaBase(time);
    const aliados = [];
    for (const j of w.players.values()) {
      if (!j.vivo || j.time !== time) continue;
      aliados.push(j);
      olhos.push(olho(j.ship.x, j.ship.z, VISAO_RAIO));
    }
    const meus = [];
    const outros = [];
    for (const m of [...w.mineradores.lista, ...w.escoltas.lista]) {
      if (!m.vivo) continue;
      if (m.time === time) {
        meus.push(m);
        olhos.push(olho(m.ship.x, m.ship.z, VISAO_MINERADOR));
      } else outros.push(m);
    }
    for (const t of w.torretas.lista) if (t.viva && t.time === time) olhos.push(olho(t.x, t.z, VISAO_TORRETA));
    const ve = (e) => algumOlhoVe(olhos, e.ship.x, e.ship.z);
    const inimigos = [];
    for (const o of w.players.values()) if (o.vivo && o.time !== time && ve(o)) inimigos.push(o);
    k = {
      tick: w.tick,
      olhos,
      aliados,
      meus,
      inimigos,
      mineradores: outros.filter(ve), // mineradores e escoltas do outro time à vista
      monstros: w.monstros.filter((m) => m.vivo && ve(m)),
      nucleo: w.objetivos.entidades().find(ve) ?? null,
    };
    this.conhece[time] = k;
    return k;
  }

  /** O time de `j` vê a entidade agora? (camuflado do outro time, só de perto dele) */
  #ve(j, e) {
    if (e.estrutura) return true; // construção: pública
    if (e.time === j.time) return true;
    if (e.tipo === 'jogador' && this.world.golpes.invisivel(e) && dist(j.ship, e.ship) > INVISIVEL_VISTO_M) return false;
    return algumOlhoVe(this.#saber(j.time).olhos, e.ship.x, e.ship.z);
  }

  /** Jogadores inimigos que `j` vê (o time vê e a camuflagem deixa). */
  #inimigosVistos(j) {
    return this.#saber(j.time).inimigos.filter((o) => !this.world.golpes.invisivel(o) || dist(j.ship, o.ship) <= INVISIVEL_VISTO_M);
  }

  /** Está na zona segura da base do próprio time (onde não leva dano)? */
  #naPropriaBase(ent) {
    const b = BASES[ent.time];
    return !!b && dist(ent.ship, b) < this.zonaSegura;
  }

  /**
   * Memória do time sobre o acampamento `c`: está (provavelmente) vivo agora? Visto
   * com monstro, vivo; visto vazio, volta na hora da regra (morreu à vista: voltaS
   * depois; antes do primeiro nascimento: na hora dele; vazio sem saber desde quando:
   * olha de novo IA.revisitaS depois). Nunca visto: vivo depois do primeiro nascimento.
   */
  #campoVivo(time, c) {
    const w = this.world;
    const t = w.tick;
    const K = this.#saber(time);
    const tempos = w.jungle.tempos.acampamento;
    const decorrido = w.partida.decorrido(t);
    const mem = this.memoria[time];
    let m = mem.get(c.id);
    if (!m) {
      m = { vivoEm: -Infinity, voltaEm: -Infinity };
      mem.set(c.id, m);
    }
    if (m.olhado !== t && algumOlhoVe(K.olhos, c.x, c.z)) {
      m.olhado = t;
      const vivos = K.monstros.some((x) => x.covil?.id === c.id);
      if (vivos) m.vivoEm = t;
      else if (t >= m.voltaEm) {
        if (decorrido < tempos.primeiroS) m.voltaEm = t + ticks(tempos.primeiroS - decorrido);
        else if (t - m.vivoEm < ticks(2)) m.voltaEm = t + ticks(tempos.voltaS);
        else m.voltaEm = t + ticks(IA.revisitaS);
      }
    }
    if (m.vivoEm === t) return { vivo: true, em: t };
    if (t < m.voltaEm) return { vivo: false, em: m.voltaEm };
    const primeiro = w.partida.inicioTick + ticks(tempos.primeiroS);
    return t >= primeiro ? { vivo: true, em: t } : { vivo: false, em: primeiro };
  }

  // ---------- Torres inimigas ----------

  /** Alguma torre de pé do outro time cobre o ponto (alcance e visão dela)? */
  #cobertoPorTorre(time, x, z) {
    const w = this.world;
    if (!w.torretasAtiram) return false;
    const r = TORRETA.alcance + IA.torretaFolga;
    for (const t of w.torretas.lista) {
      if (t.time === time || !t.viva) continue;
      if (Math.abs(t.x - x) > r || Math.abs(t.z - z) > r) continue;
      if (enxerga(t.x, t.z, x, z, r)) return true;
    }
    return false;
  }

  /**
   * Força de um lado em volta do ponto: Σ vida × (nível + IA.forcaNivel) dos pilotos
   * vivos a até IA.forcaRaio. Os do time de `j`: todos; os do outro: só os que ele vê.
   */
  #forcas(j, p) {
    const peso = (o) => (o.ship.hp / o.ship.maxHp) * (o.nivel + IA.forcaNivel);
    const f = { nosso: 0, deles: 0, nossos: 0, delesN: 0 };
    for (const o of this.#saber(j.time).aliados) {
      if (dist(o.ship, p) > IA.forcaRaio) continue;
      f.nosso += peso(o);
      f.nossos++;
    }
    for (const o of this.#inimigosVistos(j)) {
      if (dist(o.ship, p) > IA.forcaRaio) continue;
      f.deles += peso(o);
      f.delesN++;
    }
    return f;
  }

  /**
   * Licença para entrar no alcance das torres inimigas: o time está GANHANDO a briga
   * ali (pelo menos IA.forcaMin pilotos do time perto, força IA.vantagem vezes a dos
   * inimigos à vista) e ele tem vida.
   */
  #licenca(j) {
    if (j.ship.hp / j.ship.maxHp < IA.vidaTorreta) return false;
    // Os do time que contam estão ali com ele (dividem os mísseis da torre) e com vida.
    let juntos = 0;
    for (const o of this.#saber(j.time).aliados) {
      if (dist(o.ship, j.ship) <= IA.licencaRaio && o.ship.hp / o.ship.maxHp >= IA.vidaTorreta) juntos++;
    }
    if (juntos < IA.forcaMin) return false;
    const f = this.#forcas(j, j.ship);
    return f.nosso >= IA.vantagem * f.deles;
  }

  /** Pode estar no ponto (fora do alcance das torres inimigas, ou com licença)? */
  #permitido(j, x, z) {
    return !this.#cobertoPorTorre(j.time, x, z) || this.#licenca(j);
  }

  /**
   * Dá para pegar o alvo sem quebrar a regra das torres? Ou o lugar dele é permitido
   * (pode ir até lá), ou ele já está ao alcance de onde o computador está, e lá é
   * permitido (atira sem avançar).
   */
  #atingivel(j, alvo) {
    const t = alvo.ship;
    const s = j.ship;
    if (this.#permitido(j, t.x, t.z)) return true;
    return dist(s, t) <= alcances(s).max * 0.95 && !bloqueiaVisao(s.x, s.z, t.x, t.z) && this.#permitido(j, s.x, s.z);
  }

  /**
   * Grade de custo a mais do `time` para o A*: as células cobertas pelas torres de pé
   * do outro time (IA.custoPerigo) e o bolsão da base do outro time
   * (IA.custoBaseInimiga). Refeita só quando muda o conjunto de torres de pé.
   */
  #perigo(time) {
    const w = this.world;
    const vivas = w.torretasAtiram ? w.torretas.lista.filter((t) => t.time !== time && t.viva) : [];
    const chave = vivas.map((t) => t.id).join(',');
    const c = this.perigos[time];
    if (c?.chave === chave) return c.grade;
    const n = nav();
    const g = this.#soBase(time).slice();
    const r = TORRETA.alcance + IA.torretaFolga;
    for (const t of vivas) {
      for (let x = t.x - r; x <= t.x + r; x += CELULA) {
        for (let z = t.z - r; z <= t.z + r; z += CELULA) {
          const k = n.indice(x, z);
          if (k < 0 || g[k] > 0) continue;
          const p = n.centro(k);
          if (enxerga(t.x, t.z, p.x, p.z, r)) g[k] = IA.custoPerigo;
        }
      }
    }
    this.perigos[time] = { chave, grade: g };
    return g;
  }

  /**
   * Grade só com o bolsão da base do outro time (o caminho de quem tem licença para
   * entrar no alcance das torres; e a base de #perigo). Uma por time.
   */
  #soBase(time) {
    this.semTorres ??= BASES.map(() => null);
    if (!this.semTorres[time]) {
      const n = nav();
      const g = new Float32Array(n.total);
      const outra = BASES.find((b) => b.time !== time);
      for (let x = outra.x - 260; x <= outra.x + 260; x += CELULA) {
        for (let z = outra.z - 260; z <= outra.z + 260; z += CELULA) {
          const k = n.indice(x, z);
          if (k >= 0 && Math.abs(x) >= BOLSAO.xMin - 25) g[k] = IA.custoBaseInimiga;
        }
      }
      this.semTorres[time] = g;
    }
    return this.semTorres[time];
  }

  // ---------- Papéis e plano do time ----------

  /** Papel de `j` no time: a ordem de entrada dos computadores do time (IA.papeis). */
  #papel(j) {
    const ids = [];
    for (const o of this.lista()) if (o.time === j.time) ids.push(o.id);
    ids.sort((a, b) => a - b);
    return IA.papeis[ids.indexOf(j.id)] ?? IA.papeis[IA.papeis.length - 1];
  }

  /**
   * Objetivo épico do time agora (uma vez por tick), ou null: caçar a onda do Núcleo
   * do outro time, escoltar a do time, o Núcleo ou a Medusa. Só com IA.epicoMin
   * computadores vivos no time e o nível médio pedido.
   */
  #plano(time) {
    const w = this.world;
    const c = this.planos[time];
    if (c?.tick === w.tick) return c.plano;
    let plano = null;
    const bots = [...this.lista()].filter((j) => j.time === time && j.vivo);
    if (bots.length >= IA.epicoMin) {
      const obj = this.#obj();
      const nivel = bots.reduce((n, j) => n + j.nivel, 0) / bots.length;
      const pode = (tipo) => !(w.tick < (this.desistiu[time][tipo] ?? 0));
      if (this.#ondaAtiva(1 - time)) plano = { tipo: 'cacarOnda' };
      else if (this.#ondaAtiva(time) && this.#saber(time).meus.some((m) => m.nucleo)) plano = { tipo: 'escoltarOnda' };
      else if (obj.NUCLEO?.estado === 'ativo' && nivel >= IA.nucleoNivel && pode('nucleo')) plano = { tipo: 'nucleo', ponto: NUCLEO, reuniao: REUNIAO.nucleo[time] };
      else if (obj.MEDUSA?.estado === 'ativo' && nivel >= IA.medusaNivel && pode('medusa')) plano = { tipo: 'medusa', ponto: MEDUSA, reuniao: REUNIAO.medusa[time] };
    }
    this.planos[time] = { tick: w.tick, plano };
    return plano;
  }

  // ---------- Decisão ----------

  #pensar(j) {
    const w = this.world;
    const ia = j.ia;
    const s = j.ship;
    const vida = s.hp / s.maxHp;
    if (!w.partida.emAndamento) return this.#mudar(j, 'parado', {}, 'fim');
    ia.papel = this.#papel(j);
    this.#usarItens(j, vida);
    this.#distribuirPontos(j);

    if (ia.ordem) return this.#irPara(j, ia.ordem, 'ordem');
    if (j.recall) return this.#mudar(j, 'recall', {}, 'recall'); // canalizando: mãos fora do gatilho
    if (s.pousado) return this.#pousado(j, vida);

    const fugir = IA.vidaFugir - 0.06 * (ia.agressivo - 0.5);
    if (vida < fugir) return this.#voltarParaBase(j, 'fugir');

    const plano = this.#plano(j.time);
    // Jogador inimigo à vista (ou atacando os mineradores do time).
    const inimigo = this.#jogadorInimigo(j);
    if (inimigo) {
      if (this.#encara(j, inimigo, vida)) return this.#atacar(j, inimigo, 'briga');
      if (vida < IA.vidaConsertar) return this.#voltarParaBase(j, 'recuar');
      return this.#recuar(j, inimigo);
    }
    // Monstro que me atacou: ele não vai largar. A Medusa sem o time junto, foge.
    const raivoso = this.#monstroComRaiva(j);
    if (raivoso) {
      if (raivoso.esp === 'medusa' && plano?.tipo !== 'medusa') return this.#voltarParaBase(j, 'fugir medusa');
      return this.#atacar(j, raivoso, 'revidar');
    }
    // No alcance da torre inimiga sem licença: sai. (De passagem, a caminho de um
    // lugar fora do alcance, segue: o caminho já cruza o mínimo que dá.)
    if (!this.#permitido(j, s.x, s.z) && !this.#emTransito(j)) return this.#sairDoPerigo(j);
    if (this.#pertoDaMedusa(j) && plano?.tipo !== 'medusa') return this.#sairDaMedusa(j);

    if (vida < IA.vidaConsertar) return this.#voltarParaBase(j, 'consertar');
    if (this.#valeComprar(j)) return this.#irComprar(j);

    if (plano && this.#epico(j, plano, vida)) return;

    if (ia.papel === 'lane') return this.#lane(j, vida);
    if (ia.papel === 'jungle') return this.#jungle(j, vida);
    return this.#roamer(j, vida);
  }

  #mudar(j, modo, extra = {}, tarefa = '') {
    const ia = j.ia;
    ia.tarefa = tarefa;
    if (extra.alvo !== undefined && extra.alvo !== ia.alvo) {
      // Alvo novo: um instante para "ver" e mirar, como gente.
      const [a, b] = IA.reacaoS;
      ia.reagirEm = this.world.tick + Math.round((a + this.world.rng() * (b - a)) * TICK_HZ);
      ia.visto = null;
    }
    ia.modo = modo;
    ia.alvo = modo === 'atacar' ? (extra.alvo ?? ia.alvo) : null;
    ia.destino = extra.destino ?? null;
  }

  #atacar(j, alvo, tarefa) {
    const ia = j.ia;
    // Erro de mira sorteado a cada decisão: menos com o nível.
    const erro = IA.erroMira * (1 - (0.5 * (j.nivel - 1)) / (NIVEL_MAX - 1));
    ia.erro = (this.world.rng() * 2 - 1) * erro;
    this.#mudar(j, 'atacar', { alvo }, tarefa);
  }

  /** Vai até o ponto; `seguro` = o caminho contorna o alcance das torres inimigas. */
  #irPara(j, destino, tarefa, seguro = true) {
    this.#mudar(j, 'ir', { destino: { x: destino.x, z: destino.z, seguro } }, tarefa);
  }

  /**
   * Volta para a base: recall se está longe e sossegado, senão voando até o anel (ou
   * até a plataforma da compra a fazer: pousado em qualquer ponto da base a nave
   * conserta).
   */
  #voltarParaBase(j, tarefa = 'base') {
    const compra = this.#desejos(j)[0];
    const area = compra ? PLATAFORMA[compra.servico][j.time] : ANEL_BASE[j.time];
    this.#irParaBase(j, area, tarefa);
  }

  /** Até a área de pouso `area` da base: de recall se está longe e sossegado; no alcance de torre inimiga, sai dele antes. */
  #irParaBase(j, area, tarefa) {
    const w = this.world;
    // No alcance de torre inimiga: primeiro sai dele (o recall precisa de sossego e
    // voar de volta por baixo da torre é morrer); um campo de asteroides serve.
    if (this.#cobertoPorTorre(j.time, j.ship.x, j.ship.z)) return this.#sairDoPerigo(j, tarefa);
    const longe = dist(j.ship, ANEL_BASE[j.time]) > IA.recallDist;
    const calmo = w.tick - j.ultimoDano > IA.calmoS * TICK_HZ && !this.#jogadorInimigo(j, IA.visaoJogador * 0.8);
    if (longe && calmo) return this.#mudar(j, 'recall', {}, tarefa);
    this.#mudar(j, 'pousar', { destino: { x: area.x, z: area.z, area } }, tarefa);
  }

  /** Recua de um inimigo que não dá para encarar: para trás, rumo à base, pelo caminho seguro. */
  #recuar(j, inimigo) {
    const b = BASES[j.time];
    const s = j.ship;
    // Um ponto 250 m mais perto da base (ou a própria base, se está perto).
    const d = dist(s, b);
    const k = d > 300 ? 250 / d : 1;
    const p = { x: s.x + (b.x - s.x) * k, z: s.z + (b.z - s.z) * k };
    if (dist(inimigo.ship, s) < 140 && j.ship.hp / j.ship.maxHp > IA.vidaFugir) return this.#atacar(j, inimigo, 'briga encurralado');
    this.#irPara(j, p, 'recuar');
  }

  /** Voando para um destino fora do alcance das torres inimigas (cruzar o alcance de passagem vale)? */
  #emTransito(j) {
    const ia = j.ia;
    const d = ia.destino;
    if (ia.modo !== 'ir' || !d || Math.hypot(j.ship.vx, j.ship.vz) < 15) return false;
    return !this.#cobertoPorTorre(j.time, d.x, d.z);
  }

  /** Fora do alcance das torres inimigas pelo caminho mais curto: o ponto livre mais perto, para o lado da base. */
  #sairDoPerigo(j, tarefa = 'sair da torre') {
    const s = j.ship;
    const b = BASES[j.time];
    let melhor = null;
    let melhorD = Infinity;
    for (let r = 60; r <= 360 && !melhor; r += 60) {
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * 2 * Math.PI;
        const p = { x: s.x + Math.cos(a) * r, z: s.z + Math.sin(a) * r };
        if (Math.abs(p.x) > MAP_HALF_X - 60 || Math.abs(p.z) > MAP_HALF_Z - 60) continue;
        if (this.#cobertoPorTorre(j.time, p.x, p.z) || !nav().aberta[nav().indice(p.x, p.z)]) continue;
        const d = r + 0.2 * dist(p, b);
        if (d < melhorD) {
          melhor = p;
          melhorD = d;
        }
      }
    }
    this.#irPara(j, melhor ?? b, tarefa, false);
  }

  /** Perto da Medusa viva (alcance dela + folga)? */
  #pertoDaMedusa(j) {
    if (this.#obj().MEDUSA?.estado !== 'ativo') return false;
    return dist(j.ship, MEDUSA) < alcanceMaximo('medusa') + IA.medusaFolga + 60;
  }

  #sairDaMedusa(j) {
    const s = j.ship;
    const d = dist(s, MEDUSA) || 1;
    const r = alcanceMaximo('medusa') + IA.medusaFolga + 100;
    this.#irPara(j, { x: MEDUSA.x + ((s.x - MEDUSA.x) / d) * r, z: MEDUSA.z + ((s.z - MEDUSA.z) / d) * r }, 'longe da medusa');
  }

  /** Pousado: na base conserta e compra; na plataforma de ouro espera a coleta; pronto, decola. */
  #pousado(j, vida) {
    const ia = j.ia;
    const s = j.ship;
    const parado = Math.hypot(s.vx, s.vz) < 6;
    const plat = PLATAFORMA_OURO.find((p) => dist(s, p) <= p.raio);
    if (plat) {
      // Plataforma de pouso: fica até coletar; inimigo à vista perto ou vida baixa, decola.
      const est = this.#obj()[plat.id];
      const perigo = this.#inimigosVistos(j).some((o) => dist(o.ship, s) < IA.plataformaSegura);
      ia.modo = 'pousado';
      ia.tarefa = 'plataforma';
      if (est?.estado === 'ativo' && !perigo && vida >= IA.vidaFugir) return;
      if (parado) ia.pulsoP = true;
      return;
    }
    if (parado) {
      for (const sv of ['evolucao', 'loja']) if (naPlataforma(j, sv)) this.#comprar(j, sv);
    }
    // Ainda falta comprar na outra plataforma: decola e vai.
    const falta = this.#desejos(j).find((d) => !naPlataforma(j, d.servico));
    const naBase = dist(s, BASES[j.time]) < BASES[j.time].raio;
    ia.tarefa = 'base';
    if (naBase && vida < IA.vidaPronto && !falta) {
      ia.modo = 'pousado';
      return;
    }
    if (!parado) return; // ainda freando
    ia.modo = 'pousado';
    ia.pulsoP = true; // decola
  }

  // ---------- Inimigos e monstros ----------

  /** Jogador inimigo a brigar: à vista e perto, ou atacando os mineradores do time (e dá para pegar). */
  #jogadorInimigo(j, visao = IA.visaoJogador) {
    const meus = this.#saber(j.time).meus;
    let melhor = null;
    let melhorD = Infinity;
    for (const o of this.#inimigosVistos(j)) {
      if (this.#naPropriaBase(o) || !this.#atingivel(j, o)) continue;
      const d = dist(j.ship, o.ship);
      const ameaca = d < IA.defenderMax && meus.some((m) => dist(m.ship, o.ship) < IA.defenderRaio);
      if ((d < visao || ameaca) && d < melhorD) {
        melhor = o;
        melhorD = d;
      }
    }
    return melhor;
  }

  /** Encara o jogador? Pela força dos dois lados em volta dele (e a vida dele mesmo). */
  #encara(j, o, vida) {
    const f = this.#forcas(j, o.ship);
    const delaVida = o.ship.hp / o.ship.maxHp;
    if (f.delesN <= 1 && (vida >= IA.vidaBrigar || vida > delaVida + 0.15)) return true;
    return vida >= IA.vidaBrigar && f.nosso >= IA.encarar * f.deles;
  }

  /** Monstro da jungle (à vista) com raiva dele: vai atrás dele de qualquer jeito. */
  #monstroComRaiva(j) {
    const w = this.world;
    let melhor = null;
    let melhorD = Infinity;
    for (const m of this.#saber(j.time).monstros) {
      if (!(m.raiva?.get(j.id) > w.tick)) continue;
      const d = dist(j.ship, m.ship);
      if (d < melhorD) {
        melhor = m;
        melhorD = d;
      }
    }
    return melhorD < 500 ? melhor : null;
  }

  /**
   * Monstro à vista bom de caçar perto de `de` (até `max` m), dos acampamentos da
   * lista `campos` (ids; null = qualquer um, menos chefes). O SN-4 só com nível e vida.
   */
  #monstroParaCacar(j, de, max, campos = null) {
    const vida = j.ship.hp / j.ship.maxHp;
    let melhor = null;
    let melhorNota = Infinity;
    for (const m of this.#saber(j.time).monstros) {
      if (m.esp === 'medusa' || m.esp === 'sonda') continue;
      if (campos && !campos.includes(m.covil?.id)) continue;
      if (m.esp === 'sn4' && (j.nivel < IA.chefeNivel || vida < IA.chefeVida)) continue;
      const d = dist(de, m.ship);
      if (d > max || !this.#atingivel(j, m) || this.#perigoMedusa(m.ship)) continue;
      // Perto de quem caça vale mais; o de chama (curto) um pouco menos.
      const nota = dist(j.ship, m.ship) * (alcanceMaximo(m.esp) < 150 ? 1.2 : 1);
      if (nota < melhorNota) {
        melhor = m;
        melhorNota = nota;
      }
    }
    return melhor;
  }

  /** O ponto está ao alcance da Medusa viva? (chefe de time inteiro: o computador não encara sozinho) */
  #perigoMedusa(p) {
    if (this.#obj().MEDUSA?.estado !== 'ativo') return false;
    return dist(p, MEDUSA) < alcanceMaximo('medusa') + IA.medusaFolga + 60;
  }

  /** Mineradores e escoltas do outro time à vista que dá para pegar (os carregados e os do Núcleo valem mais). */
  #mineradorInimigo(j, perto, max) {
    let melhor = null;
    let melhorNota = Infinity;
    for (const m of this.#saber(j.time).mineradores) {
      if (this.#naPropriaBase(m) || dist(perto, m.ship) > max || !this.#atingivel(j, m)) continue;
      const nota = dist(j.ship, m.ship) * (m.nucleo ? 0.4 : m.tipo === 'escolta' ? 1.4 : m.carga > 0 ? 0.7 : 1);
      if (nota < melhorNota) {
        melhor = m;
        melhorNota = nota;
      }
    }
    return melhor;
  }

  /**
   * Torre sentinela inimiga de pé como alvo (construção: pública). Um objeto por
   * construção (o mesmo alvo de uma decisão para a outra: a reação não recomeça).
   */
  #alvoTorreta(t) {
    const w = this.world;
    this.estruturas ??= new Map();
    if (this.estruturas.has(t.id)) return this.estruturas.get(t.id);
    const alvo = {
      id: t.id,
      tipo: 'torreta',
      estrutura: true,
      get vivo() {
        return !!w.torretas.torreta(t.id)?.viva;
      },
      ship: { x: t.x, z: t.z, vx: 0, vz: 0, raio: PLANTA_TORRETA.raio },
    };
    this.estruturas.set(t.id, alvo);
    return alvo;
  }

  /** Torre do buff de suporte como alvo (vale enquanto o `obj` diz 'ativo'). */
  #alvoTorreSuporte(b) {
    const self = this;
    this.estruturas ??= new Map();
    if (this.estruturas.has(b.id)) return this.estruturas.get(b.id);
    const alvo = {
      id: b.id,
      tipo: 'torre',
      estrutura: true,
      get vivo() {
        return self.#obj()[b.id]?.estado === 'ativo';
      },
      ship: { x: b.x, z: b.z, vx: 0, vz: 0, raio: TORRE_SUPORTE.raio },
    };
    this.estruturas.set(b.id, alvo);
    return alvo;
  }

  // ---------- Papéis ----------

  /**
   * Posto da lane: um pouco à frente do minerador do time mais adiantado (sem passar
   * da mineradora), do lado dele da lane; sem minerador, a IA.lanePostoBase da base.
   */
  #postoLane(j) {
    const t = j.time;
    const sg = sinal(t);
    let frente = null;
    for (const m of this.#saber(t).meus) {
      if (m.tipo !== 'minerador') continue;
      if (!frente || sg * m.ship.x > sg * frente.ship.x) frente = m;
    }
    let x = frente ? frente.ship.x + sg * IA.laneFrente : BASES[t].x + sg * IA.lanePostoBase;
    const limite = MINERADORA.meiaX + IA.laneLimite;
    if (sg * x > -limite) x = -sg * limite;
    return { x, z: LANE.z + IA.laneLado * j.ia.lado };
  }

  /**
   * Lane: escolta, defende a metade do time, farma o acampamento perto com a lane
   * quieta e empurra ganhando. `ajuda` = jungle ou roamer sem nada para fazer (não
   * farma: já veio de lá).
   */
  #lane(j, vida, ajuda = false) {
    const posto = this.#postoLane(j);
    // Empurrar: com o time ganhando, os mineradores na doca deles e a torre mais perto.
    if (j.nivel >= IA.empurrarNivel && this.#licenca(j)) {
      const m = this.#mineradorInimigo(j, j.ship, 900);
      if (m) return this.#atacar(j, m, 'empurrar mineradores');
      const torre = this.#torreMaisPerto(j);
      if (torre && dist(j.ship, torre) < IA.empurrarDist) return this.#atacar(j, this.#alvoTorreta(torre), 'empurrar torre');
    }
    const m = this.#mineradorInimigo(j, posto, IA.laneDefesa);
    if (m) return this.#atacar(j, m, 'minerador inimigo');
    // A doca do outro time fora do alcance das torres deles (caíram, ou o time está
    // ganhando): espreita do lado de lá da mineradora, de onde se vê a doca deles.
    if (j.nivel >= IA.empurrarNivel) {
      const doca = ESPERAS.find((d) => d.time !== j.time); // a fila na porta do hangar deles
      if (this.#permitido(j, doca.x, doca.z)) {
        const sg = sinal(j.time);
        const espreita = { x: sg * (MINERADORA.meiaX + IA.espreitaX), z: LANE.z + IA.espreitaZ * j.ia.lado };
        const alvo = this.#mineradorInimigo(j, espreita, IA.laneDefesa);
        if (alvo) return this.#atacar(j, alvo, 'minerador na doca deles');
        if (this.#permitido(j, espreita.x, espreita.z)) return this.#irPara(j, espreita, 'espreitar doca');
      }
    }
    // Com a lane quieta e pouco nível, o acampamento da base perto da lane.
    if (!ajuda && j.nivel < IA.laneFarmNivel) {
      const campo = this.#proximoCampo(j, posto, IA.laneCacaRaio, ['base']);
      if (campo) return this.#limparCampo(j, campo);
    }
    // Monstro à vista perto do posto (sobra de acampamento).
    const perto = this.#monstroParaCacar(j, posto, 250);
    if (perto) return this.#atacar(j, perto, 'monstro perto da lane');
    j.ia.campo = null;
    this.#irPara(j, posto, ajuda ? 'ajudar lane' : 'escoltar');
  }

  /** A torre de pé do outro time mais perto de `j`. */
  #torreMaisPerto(j) {
    let melhor = null;
    for (const t of this.world.torretas.lista) {
      if (t.time === j.time || !t.viva) continue;
      if (!melhor || dist(j.ship, t) < dist(j.ship, melhor)) melhor = t;
    }
    return melhor;
  }

  /**
   * Acampamento do território do time a limpar: dos `tipos` (na ordem), o mais perto
   * de `de` (até `max` m) que o time acha que está vivo e que nenhum outro computador
   * do time está limpando.
   */
  #proximoCampo(j, de, max, tipos = ['base', 'centro']) {
    const ocupados = new Set();
    for (const o of this.lista()) if (o !== j && o.time === j.time && o.vivo && o.ia.campo) ocupados.add(o.ia.campo);
    for (const tipo of tipos) {
      let melhor = null;
      for (const c of CAMPOS_DO_TIME[j.time]) {
        if (c.tipo !== tipo || ocupados.has(c.id) || dist(de, c) > max) continue;
        if (!this.#campoVivo(j.time, c).vivo) continue;
        if (this.#perigoMedusa(c) || !this.#permitido(j, c.x, c.z)) continue;
        if (!melhor || dist(j.ship, c) < dist(j.ship, melhor)) melhor = c;
      }
      if (melhor) return melhor;
    }
    return null;
  }

  /** Vai ao acampamento e ataca os monstros dele (à vista). */
  #limparCampo(j, c) {
    j.ia.campo = c.id;
    const m = this.#monstroParaCacar(j, c, c.raio + 120, [c.id]);
    if (m) return this.#atacar(j, m, `limpar ${c.id}`);
    // Ainda não vê ninguém: vai até a beira do acampamento.
    this.#irPara(j, c, `ir ${c.id}`);
  }

  /** Jungle: sonda, buffs, plataforma de pouso e acampamentos do território na ordem natural. */
  #jungle(j, vida) {
    const w = this.world;
    const obj = this.#obj();
    const t = j.time;
    // A sonda errante à vista.
    const sonda = this.#saber(t).monstros.find((m) => m.esp === 'sonda');
    if (sonda && dist(j.ship, sonda.ship) < IA.sondaRaio && this.#atingivel(j, sonda)) return this.#atacar(j, sonda, 'sonda');
    // Buff de suporte: a torre do território (não revida).
    const bs = BUFF_SUPORTE[t];
    if (obj[bs.id]?.estado === 'ativo' && vida >= 0.5) {
      j.ia.campo = null;
      return this.#atacar(j, this.#alvoTorreSuporte(bs), 'buff de suporte');
    }
    // Buff de ataque: o SN-4, com nível e vida.
    const ba = BUFF_ATAQUE[t];
    if (obj[ba.id]?.estado === 'ativo' && j.nivel >= IA.chefeNivel && vida >= IA.chefeVida) {
      const sn4 = this.#saber(t).monstros.find((m) => m.esp === 'sn4' && m.covil?.id === ba.id);
      j.ia.campo = null;
      if (sn4) return this.#atacar(j, sn4, 'buff de ataque');
      return this.#irPara(j, ba, 'ir buff de ataque');
    }
    // Plataforma de pouso do território, com a área segura.
    const p = PLATAFORMA_OURO[t];
    const seguro = !this.#inimigosVistos(j).some((o) => dist(o.ship, p) < IA.plataformaSegura);
    if (obj[p.id]?.estado === 'ativo' && obj[p.id].quem !== t && seguro && vida >= IA.plataformaVida && this.#permitido(j, p.x, p.z)) {
      j.ia.campo = null;
      return this.#mudar(j, 'pousar', { destino: { x: p.x, z: p.z, area: p.area } }, 'plataforma');
    }
    // Acampamentos do território: os da base, depois os do centro.
    const campo = this.#proximoCampo(j, j.ship, IA.cacaMax);
    if (campo) return this.#limparCampo(j, campo);
    const perto = this.#monstroParaCacar(j, j.ship, 400);
    if (perto) return this.#atacar(j, perto, 'monstro perto');
    // Sonda viva e ninguém a vê: procura na coluna central, do lado do time.
    if (obj.SONDA?.estado === 'ativo') {
      const sg = sinal(t);
      const ponto = trajetoSonda(0)[0];
      const lado = Math.abs(j.ship.z - ponto.z) < Math.abs(j.ship.z + ponto.z) ? 1 : -1;
      const alvo = { x: -sg * 60, z: ponto.z * lado };
      if (this.#permitido(j, alvo.x, alvo.z)) return this.#irPara(j, alvo, 'procurar sonda');
    }
    // Nada agora: espera o acampamento que volta primeiro, ou ajuda a lane.
    j.ia.campo = null;
    let prox = null;
    for (const c of CAMPOS_DO_TIME[t]) {
      const v = this.#campoVivo(t, c);
      if (!prox || v.em < prox.em) prox = { c, em: v.em };
    }
    if (prox && prox.em - w.tick < ticks(IA.esperaCampoS)) return this.#irPara(j, prox.c, `esperar ${prox.c.id}`);
    // Ajuda a lane (faz o mesmo que ela: dois juntos no posto ganham a licença para empurrar).
    return this.#lane(j, vida, true);
  }

  /** Roamer: alterna farm e emboscada nos asteroides do outro time, perto da doca deles. */
  #roamer(j, vida) {
    const ia = j.ia;
    const tick = this.world.tick;
    if (ia.ciclo === 'farm' && tick >= ia.cicloAte && j.nivel >= IA.roamerNivel && vida >= 0.7) {
      ia.ciclo = 'emboscada';
      ia.cicloAte = tick + ticks(IA.emboscadaS);
      ia.emboscada = 1 - ia.emboscada;
    } else if (ia.ciclo === 'emboscada' && tick >= ia.cicloAte) {
      ia.ciclo = 'farm';
      ia.cicloAte = tick + ticks(IA.roamerFarmS);
    }
    if (ia.ciclo === 'emboscada') {
      const ponto = EMBOSCADAS[j.time][ia.emboscada];
      const m = this.#mineradorInimigo(j, ponto, 400);
      if (m) return this.#atacar(j, m, 'emboscada');
      ia.campo = null;
      return this.#irPara(j, ponto, 'emboscar');
    }
    const campo = this.#proximoCampo(j, j.ship, IA.cacaMax, ['centro', 'base']);
    if (campo) return this.#limparCampo(j, campo);
    const perto = this.#monstroParaCacar(j, j.ship, 500);
    if (perto) return this.#atacar(j, perto, 'monstro perto');
    ia.campo = null;
    // Nada para farmar: emboscada mais cedo; antes do nível dela, ajuda a lane.
    if (j.nivel >= IA.roamerNivel) ia.cicloAte = tick;
    return this.#lane(j, vida, true);
  }

  /**
   * Objetivo épico do time: vai junto. Devolve true se cuidou do computador (false:
   * segue o papel, por exemplo com pouca vida para ir).
   */
  #epico(j, plano, vida) {
    const w = this.world;
    const t = j.time;
    if (plano.tipo === 'cacarOnda') {
      const m = this.#mineradorInimigo(j, j.ship, 1400);
      if (m) {
        this.#atacar(j, m, 'caçar onda');
        return true;
      }
      // Ninguém à vista: vai ver a doca deles pela emboscada mais perto.
      const pontos = EMBOSCADAS[t];
      const ponto = dist(j.ship, pontos[0]) < dist(j.ship, pontos[1]) ? pontos[0] : pontos[1];
      this.#irPara(j, ponto, 'procurar onda');
      return true;
    }
    if (plano.tipo === 'escoltarOnda') {
      const m = this.#mineradorInimigo(j, this.#postoLane(j), IA.laneDefesa);
      if (m) this.#atacar(j, m, 'defender onda');
      else this.#irPara(j, this.#postoLane(j), 'escoltar onda');
      return true;
    }
    if (vida < IA.epicoVida) return false;
    // Chefe: reúne e ataca junto.
    const chefe = plano.tipo === 'nucleo' ? this.#saber(t).nucleo : this.#saber(t).monstros.find((m) => m.esp === 'medusa');
    const bots = [...this.lista()].filter((o) => o.time === t && o.vivo);
    const juntos = this.#saber(t).aliados.filter((o) => dist(o.ship, plano.ponto) < dist(plano.reuniao, plano.ponto) + IA.reuniaoRaio);
    const brigando = bots.some((o) => o.ia.alvo && (o.ia.alvo === chefe || o.ia.tarefa === plano.tipo));
    const vidaChefe = (this.#obj()[plano.tipo === 'nucleo' ? 'NUCLEO' : 'MEDUSA']?.vida ?? 1);
    if (brigando && juntos.length < IA.epicoMin && vidaChefe > IA.desistirVida) {
      // Grupo desfeito com o chefe ainda forte: desiste por um tempo.
      this.desistiu[t][plano.tipo] = w.tick + ticks(IA.desistirS);
      return false;
    }
    if ((juntos.length >= Math.min(IA.epicoMin, bots.length) || brigando) && chefe) {
      this.#atacar(j, chefe, plano.tipo);
      return true;
    }
    if (juntos.length >= IA.epicoMin && !chefe) {
      // Reunidos e o chefe ainda fora da visão: chega mais, do lado da reunião.
      const k = 230 / (dist(plano.reuniao, plano.ponto) || 1);
      this.#irPara(j, { x: plano.ponto.x + (plano.reuniao.x - plano.ponto.x) * k, z: plano.ponto.z + (plano.reuniao.z - plano.ponto.z) * k }, plano.tipo);
      return true;
    }
    this.#irPara(j, plano.reuniao, `reunir ${plano.tipo}`);
    return true;
  }

  // ---------- Loja e Evolução ----------

  /**
   * O que comprar agora, na ordem: a próxima nave (se já tem o nível; guarda ouro
   * para ela), as versões das armas de fábrica, o equipamento (compra e versões) e
   * kits de reparo. Cada desejo: { servico, pedido, preco }.
   */
  #desejos(j) {
    const out = [];
    let ouro = j.ouro;
    const race = j.ship.race;
    const proxima = naveDe(race, j.classe, j.tier + 1);
    if (proxima && j.nivel >= proxima.nivel) {
      if (ouro < proxima.preco) return out; // guardando para a nave
      out.push({ servico: 'evolucao', pedido: { t: 'evoluir', opcao: 'nave' }, preco: proxima.preco });
      ouro -= proxima.preco;
    }
    // Versões das armas de fábrica (por instância, pousado na base: a Loja serve).
    for (const x of j.inv) {
      if (!x.fabrica) continue;
      const preco = precoEvoluirInst(x);
      if (preco === null || ouro < preco) continue;
      out.push({ servico: 'loja', pedido: { t: 'evoluirItem', inst: x.id }, preco });
      ouro -= preco;
    }
    // Equipamento: compra o que falta (vai para o compartimento; #equiparDesejado
    // põe na nave) e depois evolui a instância que tem.
    for (const chave of this.#equipDesejado(j)) {
      const x = j.inv.find((y) => y.chave === chave);
      const preco = x ? precoEvoluirInst(x) : EQUIPAMENTOS[chave].preco;
      if (preco === null || ouro < preco) continue;
      out.push({ servico: 'loja', pedido: x ? { t: 'evoluirItem', inst: x.id } : { t: 'comprar', item: chave }, preco });
      ouro -= preco;
    }
    for (let k = j.itens.reparo; k < IA.kitsDesejados && ouro >= ITENS.reparo.preco; k++) {
      out.push({ servico: 'loja', pedido: { t: 'comprar', item: 'reparo' }, preco: ITENS.reparo.preco });
      ouro -= ITENS.reparo.preco;
    }
    return out;
  }

  /** Tipo de dano que mais aparece nas armas dos encaixes do computador. */
  #tipoDasArmas(j) {
    const conta = {};
    for (const a of j.ship.encaixes ?? []) {
      const t = WEAPONS[ARMAS[a]]?.tipoDano;
      if (t) conta[t] = (conta[t] ?? 0) + 1;
    }
    return Object.keys(conta).sort((a, b) => conta[b] - conta[a])[0] ?? 'laser';
  }

  /**
   * O equipamento que o computador quer, na ordem de compra: o escudo de mais
   * escudo, a armadura geral (sem tipo) de mais HP, o Reforço do tipo das armas dele
   * e o Potenciador de Durabilidade. Só da classe dele.
   */
  #equipDesejado(j) {
    const melhor = (lista, valor) => lista.reduce((m, k) => (m === null || valor(k) > valor(m) ? k : m), null);
    const escudo = melhor(equipamentosAVenda(j.classe, 'escudo'), (k) => EQUIPAMENTOS[k].versoes[0].maxEscudo);
    const geral = equipamentosAVenda(j.classe, 'armadura').filter((k) => EQUIPAMENTOS[k].tipoDano === null);
    const armadura = melhor(geral, (k) => EQUIPAMENTOS[k].versoes[0].hp);
    const tipo = this.#tipoDasArmas(j);
    const reforco = equipamentosAVenda(j.classe, 'potenciador').find(
      (k) => EQUIPAMENTOS[k].tipoDano === tipo && EQUIPAMENTOS[k].versoes[0].efeitos.some((e) => e.tipo === 'poder') && EQUIPAMENTOS[k].versoes[0].efeitos.length > 1,
    );
    return [escudo, armadura, reforco, IA.potenciadorVida].filter((k) => k && EQUIPAMENTOS[k]);
  }

  /**
   * Pontos livres do piloto: Energia até IA.fracaoEnergia do total, Durabilidade até
   * IA.fracaoDurabilidade, o resto no poder do tipo de dano das armas dele; atributo
   * no máximo (99), o que sobrar vai nos outros. Pelo mesmo pedido do cliente
   * ({t:'pontos'}).
   */
  #distribuirPontos(j) {
    const livres = pontosLivres(j.nivel, j.pontos);
    if (!livres) return;
    const p = j.pontos;
    const total = ORDEM_ATRIBUTOS.reduce((s, a) => s + p[a], livres);
    const energia = Math.min(livres, Math.max(0, Math.round(IA.fracaoEnergia * total) - p.energia));
    const durabilidade = Math.min(livres - energia, Math.max(0, Math.round(IA.fracaoDurabilidade * total) - p.durabilidade));
    const poder = this.#tipoDasArmas(j);
    const pedidos = [
      ['energia', energia],
      ['durabilidade', durabilidade],
      [poder, livres - energia - durabilidade],
      ...['energia', poder, ...ORDEM_ATRIBUTOS].map((a) => [a, PONTO_MAX]), // sobra (atributo cheio)
    ];
    for (const [atributo, qtd] of pedidos) {
      if (qtd < 1) continue;
      const r = this.world.servicos.pedido(j, { t: 'pontos', atributo, qtd: Math.min(qtd, PONTO_MAX) });
      if (!r.ok && r.codigo === 'sem_pontos') return;
    }
  }

  /** Vale a viagem até a base para comprar? */
  #valeComprar(j) {
    const d = this.#desejos(j);
    // A viagem custa mais tempo de partida que o ouro pequeno compra: o mínimo cresce com o nível.
    const minimo = IA.compraMin + IA.compraPorNivel * (j.nivel - 1);
    return d.some((x) => x.pedido.opcao === 'nave') || d.reduce((n, x) => n + x.preco, 0) >= minimo;
  }

  #irComprar(j) {
    const d = this.#desejos(j)[0];
    this.#irParaBase(j, PLATAFORMA[d.servico][j.time], 'comprar');
  }

  /** Pousado e parado na plataforma: faz os pedidos dela (os mesmos do cliente). */
  #comprar(j, servico) {
    for (const d of this.#desejos(j)) {
      if (d.servico !== servico) continue;
      this.world.servicos.pedido(j, d.pedido);
    }
    this.#equiparDesejado(j);
  }

  /**
   * Põe na nave o equipamento desejado que está no compartimento, cada um no
   * encaixe vazio da categoria (potenciador: o primeiro vazio), pelo pedido do
   * cliente ({t:'equipar'}).
   */
  #equiparDesejado(j) {
    for (const chave of this.#equipDesejado(j)) {
      const x = j.inv.find((y) => y.chave === chave);
      if (!x || naNave(x, j.equipado, j.ship.encInst)) continue;
      const cat = EQUIPAMENTOS[chave].categoria;
      const eq = j.equipado;
      const slot = cat === 'potenciador' ? ['pot1', 'pot2'][eq.pot.indexOf(null)] : eq[cat] === null ? cat : undefined;
      if (slot) this.world.servicos.pedido(j, { t: 'equipar', slot, inst: x.id });
    }
  }

  /** Kit de reparo com a vida baixa; célula de energia brigando sem energia. */
  #usarItens(j, vida) {
    const s = j.ship;
    if (vida < IA.usarReparo && j.itens.reparo > 0) this.world.servicos.pedido(j, { t: 'usar', item: 'reparo' });
    if (j.ia.modo === 'atacar' && s.en / s.maxEn < IA.energiaCelula && j.itens.energia > 0) {
      this.world.servicos.pedido(j, { t: 'usar', item: 'energia' });
    }
  }

  // ---------- Pilotagem (a cada tick) ----------

  #agir(j) {
    const ia = j.ia;
    let cmd;
    if (ia.modo === 'atacar' && this.#alvoValido(j, ia.alvo)) cmd = this.#lutar(j, ia.alvo);
    else if (ia.modo === 'atacar' && ia.visto && this.world.tick - ia.visto.tick < ticks(IA.memoriaAlvoS) && ia.alvo?.vivo) {
      // Sumiu da visão: vai até onde foi visto por último.
      cmd = this.#navegar(j, ia.visto, { seguro: true });
    } else if (ia.modo === 'ir' && ia.destino) cmd = this.#navegar(j, ia.destino, { seguro: ia.destino.seguro, chegada: 60 });
    else if (ia.modo === 'pousar' && ia.destino) cmd = this.#pousar(j, ia.destino);
    else if (ia.modo === 'recall') cmd = this.#recall(j);
    else cmd = { ...PARADO };
    // Pulsos (pouso e recall valem na borda do botão): um tick apertado, depois solto.
    cmd.p = ia.pulsoP;
    cmd.r = ia.pulsoR;
    ia.pulsoP = ia.pulsoR = false;
    return cmd;
  }

  #alvoValido(j, alvo) {
    if (!alvo?.vivo) return false;
    if (alvo.estrutura) return true;
    if (alvo.tipo === 'jogador' && !this.world.players.has(alvo.id)) return false;
    if (alvo.time !== undefined && alvo.time !== j.time && this.#naPropriaBase(alvo)) return false;
    if (!this.#ve(j, alvo)) return false;
    j.ia.visto = { x: alvo.ship.x, z: alvo.ship.z, tick: this.world.tick };
    return true;
  }

  /** Linha reta (larga) da nave até (x, z), refeita a cada IA.linhaTicks (ou se o ponto mudou muito). */
  #livre(j, x, z) {
    const ia = j.ia;
    const tick = this.world.tick;
    const c = ia.linha;
    if (c && tick < c.ate && Math.hypot(c.x - x, c.z - z) < 25) return c.livre;
    const livre = nav().linhaLivre(j.ship.x, j.ship.z, x, z, IA.folgaLinha);
    ia.linha = { x, z, livre, ate: tick + IA.linhaTicks };
    return livre;
  }

  /** O segmento até (x, z) passa por célula de perigo (alcance das torres inimigas)? */
  #segmentoPerigoso(j, x, z) {
    const g = this.#perigo(j.time);
    const s = j.ship;
    const d = Math.hypot(x - s.x, z - s.z);
    const n = Math.max(1, Math.ceil(d / CELULA));
    for (let k = 1; k <= n; k++) {
      const c = nav().indice(s.x + ((x - s.x) * k) / n, s.z + ((z - s.z) * k) / n);
      if (c >= 0 && g[c] > 0) return true;
    }
    return false;
  }

  /** Distância boa para brigar com o alvo. */
  #distanciaIdeal(j, alvo, alc) {
    if (alvo.tipo === 'monstro') {
      const am = alcanceMaximo(alvo.esp);
      if (am < 150) return 160; // garra e chama: de longe
      // Fora do alcance dele, se as armas deixam.
      if (am + 40 < alc.min * 0.9) return am + 40;
      return alc.min * 0.6;
    }
    if (alvo.tipo === 'nucleo') return Math.max(IA.nucleoPerto, alc.min * 0.6);
    if (alvo.estrutura) return alc.min * 0.7;
    return alc.min * 0.6;
  }

  /** Mira adiantada, distância de briga e gatilho. */
  #lutar(j, alvo) {
    const w = this.world;
    const ia = j.ia;
    const s = j.ship;
    const t = alvo.ship;
    const d = dist(s, t);
    const z = armaDoEncaixe(s, 0);
    const x = armaDoEncaixe(s, 1);
    const alc = alcances(s);
    // Sem licença para as torres inimigas e fora do alcance delas: não entra (segura
    // e atira daqui; o alvo que só se pega lá dentro, o #pensar larga).
    const seguro = !this.#licenca(j);
    const segurar = seguro && !this.#cobertoPorTorre(j.time, s.x, s.z);
    // Sem linha livre, contorna a rocha pelo caminho até ele. (Construção é sólida:
    // a linha vai até a face dela, do lado da nave.)
    const k = alvo.estrutura ? Math.min(1, ((t.raio ?? 0) + 3) / (d || 1)) : 0;
    const fx = t.x + (s.x - t.x) * k;
    const fz = t.z + (s.z - t.z) * k;
    if (d > 60 && !this.#livre(j, fx, fz)) {
      if (segurar && this.#cobertoPorTorre(j.time, t.x, t.z)) return { ...PARADO, th: Math.hypot(s.vx, s.vz) > 15 ? -0.5 : 0 };
      return this.#navegar(j, { x: fx, z: fz }, { seguro, movel: !alvo.estrutura });
    }

    // Monstro de garra encostando: vira e se afasta um pouco, depois volta a atirar.
    const garra = alvo.tipo === 'monstro' && alcanceMaximo(alvo.esp) < 150;
    if (garra && d < 45) ia.foge = Math.round(1.2 * TICK_HZ);
    if (ia.foge > 0) {
      ia.foge--;
      const diff = anguloEntre(s.yaw, yawPara(s, s.x * 2 - t.x, s.z * 2 - t.z));
      return { ...PARADO, th: 1, tu: clamp(diff * 3, -1, 1) };
    }

    const vel = z?.vel ?? 250;
    const voo = d / vel;
    const mx = t.x + (t.vx ?? 0) * voo;
    const mz = t.z + (t.vz ?? 0) * voo;
    const diff = anguloEntre(s.yaw, yawPara(s, mx, mz) + ia.erro);
    const ideal = this.#distanciaIdeal(j, alvo, alc);
    let th;
    if (d > ideal + 40) th = 1;
    else if (d < ideal - 60) th = Math.abs(diff) < 0.6 ? -0.6 : 0.2;
    else th = 0.25;
    th *= Math.max(0.3, 1 - Math.abs(diff) / 2);
    // Avançar para dentro do alcance de torre inimiga sem licença: não. Atira daqui.
    if (th > 0 && segurar) {
      const ax = s.x - Math.sin(s.yaw) * IA.segurarAdiante;
      const az = s.z - Math.cos(s.yaw) * IA.segurarAdiante;
      if (this.#cobertoPorTorre(j.time, ax, az)) th = Math.hypot(s.vx, s.vz) > 15 ? -0.5 : 0;
    }
    const boost = d > 450 && Math.abs(diff) < 0.25 && s.en / s.maxEn > 0.6 && th > 0.5;
    const pronto = w.tick >= ia.reagirEm && (alvo.estrutura || !w.estaProtegido(alvo));
    const tol = Math.max(0.05, Math.atan2((t.raio ?? 4.5) + 3, d));
    const mira = Math.abs(diff) < tol;
    return {
      ...PARADO,
      th,
      tu: clamp(diff * 3, -1, 1),
      b: boost,
      f1: pronto && mira && !!z && d < z.alcance * 0.95,
      f2: pronto && mira && !!x && d < x.alcance * 0.95,
      ...this.#desempacar(j, th),
    };
  }

  /**
   * Vai até `destino` ({x, z}): reto se está perto, com linha livre e (com `seguro`)
   * fora do alcance das torres inimigas; senão pelo caminho A* (`seguro`: contorna
   * esse alcance). `movel`: o destino anda (refaz o caminho quando ele se mexe).
   * Com `chegada`, freia chegando.
   */
  #navegar(j, destino, { seguro = true, movel = false, chegada = 0 } = {}) {
    const ia = j.ia;
    const s = j.ship;
    const d = dist(s, destino);
    let px = destino.x;
    let pz = destino.z;
    const reto = d <= 30 || (d < IA.retaMax && this.#livre(j, destino.x, destino.z) && !(seguro && this.#segmentoPerigoso(j, destino.x, destino.z)));
    if (!reto) {
      const p = this.#seguirRota(j, destino, seguro, movel);
      if (p) {
        px = p.x;
        pz = p.z;
      }
    } else ia.rota = null;
    const dp = Math.hypot(px - s.x, pz - s.z);
    const diff = anguloEntre(s.yaw, yawPara(s, px, pz));
    let th = Math.max(0.25, 1 - Math.abs(diff) / 1.6);
    if (chegada > 0) th = Math.min(th, clamp(d / chegada, d < 15 ? 0 : 0.1, 1));
    const boost = !chegada && d > 450 && dp > 60 && Math.abs(diff) < 0.2 && s.en / s.maxEn > 0.7;
    return { ...PARADO, th, tu: clamp(diff * 2.5, -1, 1), b: boost, ...this.#desempacar(j, th) };
  }

  /**
   * Ponto do caminho em que mirar: planeja (A*) se não há caminho para este destino
   * (ou ele andou, ou passou IA.replanS num destino que anda), anda o cursor e mira
   * o ponto mais adiante (até IA.olharCelulas) com linha livre.
   */
  #seguirRota(j, destino, seguro, movel) {
    const ia = j.ia;
    const s = j.ship;
    const tick = this.world.tick;
    let r = ia.rota;
    const velha = !r || r.seguro !== seguro || Math.hypot(r.x - destino.x, r.z - destino.z) > (movel ? IA.replanMover : 15) || (movel && tick >= r.ate);
    if (velha) {
      const extra = seguro ? this.#perigo(j.time) : this.#soBase(j.time);
      const pts = nav().caminho(s.x, s.z, destino.x, destino.z, extra);
      r = ia.rota = { pts: pts ?? [], i: 0, x: destino.x, z: destino.z, seguro, ate: tick + ticks(IA.replanS) };
      ia.mira = null;
    }
    if (!r.pts.length) return null;
    // Cursor: o ponto do caminho mais perto da nave entre os próximos.
    const fim = Math.min(r.pts.length - 1, r.i + IA.olharCelulas);
    let melhor = r.i;
    for (let k = r.i; k <= fim; k++) if (dist(s, r.pts[k]) < dist(s, r.pts[melhor])) melhor = k;
    r.i = melhor;
    if (ia.mira && tick < ia.mira.ate && ia.mira.k >= r.i) return r.pts[ia.mira.k];
    let k = Math.min(r.pts.length - 1, r.i + IA.olharCelulas);
    while (k > r.i + 1 && !nav().linhaLivre(s.x, s.z, r.pts[k].x, r.pts[k].z, IA.folgaLinha)) k--;
    ia.mira = { k, ate: tick + IA.miraTicks };
    return r.pts[k];
  }

  /** Preso numa quina (acelerando sem andar): dá ré virando por um instante e refaz o caminho. */
  #desempacar(j, th) {
    const ia = j.ia;
    const s = j.ship;
    if (ia.re > 0) {
      ia.re--;
      return { th: -0.7, tu: ia.ronda, b: false, f1: false, f2: false };
    }
    if (th > 0.5 && Math.hypot(s.vx, s.vz) < 4) ia.preso++;
    else ia.preso = 0;
    if (ia.preso > IA.presoS * TICK_HZ) {
      ia.preso = 0;
      ia.enroscos++;
      ia.re = Math.round(IA.reS * TICK_HZ);
      ia.ronda = -ia.ronda;
      ia.rota = null;
      ia.linha = null;
    }
    return {};
  }

  /**
   * Chega na área de pouso com a velocidade caindo com a distância (sem ficar
   * rodando em volta da plataforma), e aperta o L já devagar e dentro dela.
   */
  #pousar(j, destino) {
    const s = j.ship;
    const area = destino.area;
    const d = dist(s, area);
    if (d > IA.pousoPerto) return this.#navegar(j, area, { seguro: true });
    const vel = Math.hypot(s.vx, s.vz);
    if (d < area.raio * 0.7 && vel < IA.pousoVel) {
      if (!s.pousado) j.ia.pulsoP = true;
      return { ...PARADO };
    }
    const diff = anguloEntre(s.yaw, yawPara(s, area.x, area.z));
    const querida = clamp((d - 2) * IA.pousoFreio, 0, velocidadeBase(s));
    const th = (querida / velocidadeBase(s)) * Math.max(0.15, 1 - Math.abs(diff) / 1.2);
    return { ...PARADO, th, tu: clamp(diff * 3, -1, 1), ...this.#desempacar(j, th) };
  }

  /** Recall: para a nave, aperta o B e fica quieto até chegar. */
  #recall(j) {
    const ia = j.ia;
    const s = j.ship;
    const tick = this.world.tick;
    // Chegou: na base, vai pousar para consertar.
    if (!j.recall && dist(s, BASES[j.time]) < BASES[j.time].raio) {
      this.#voltarParaBase(j);
      return { ...PARADO };
    }
    if (!j.recall && Math.hypot(s.vx, s.vz) < RECALL_VEL_MAX * 0.6 && tick - ia.recallEm > TICK_HZ) {
      ia.pulsoR = true;
      ia.recallEm = tick;
    }
    return { ...PARADO };
  }
}
