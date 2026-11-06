// Regras e conteúdo da aba "Como Jogar" do menu (pedido do Mateus, 06/nov/2026: uma aba
// na tela inicial ensinando a ganhar a partida e todas as mecânicas, nos padrões do LoL,
// do Dota 2 e do Smite 2). Sem DOM: o desenho fica em como-jogar.js; aqui o texto, os
// números e o progresso, testados em tests/como-jogar.test.mjs.
//
// Como o mercado ensina hoje, e o que veio de cada um:
// - Dota 2: a aba "Learn" no topo do menu, com uma trilha de objetivos para o iniciante
//   que vai marcando o que já foi feito, e um Glossário. Aqui: capítulos curtos numa
//   trilha com o progresso (✓ no que já foi lido, guardado no navegador) e o glossário
//   no fim.
// - LoL: o tutorial em degraus (o básico, depois o mapa e os objetivos) e a prática
//   contra bots. Aqui: cada capítulo leva um "Praticar agora" que abre o modo certo (o
//   Sandbox para voar e testar, a Partida Privada com Bots para a partida inteira).
// - Smite 2 e Deadlock: o "em resumo" no topo de cada assunto e a primeira partida
//   guiada passo a passo. Aqui: o resumo de cada capítulo e "Sua primeira partida".
// - Todos: as teclas na tela são as do jogador (as trocadas na aba Configurações), não
//   as de fábrica: o texto marca a ação com [[acao]] (atalhos-regras.js, ACOES) e o
//   desenho põe o kbdAcao dela.
//
// Texto: `**negrito**` e `[[acao]]` (tecla da ação). Os números da partida saem de
// FATOS, que o teste confere com as constantes do servidor e de shared/: mudou a regra,
// o teste aponta o capítulo que ficou para trás.

/** Os números que o texto usa, conferidos com as constantes do jogo pelo teste. */
export const FATOS = Object.freeze({
  porTime: 3, // MAX_POR_TIME
  duracaoS: 1200, // DURACAO_PARTIDA_S
  preparacaoS: 180, // PREPARACAO_S
  faseFinalS: 180, // FASE_FINAL_S
  multFaseFinal: 2, // MULT_FASE_FINAL
  mineradoresPorTime: 10, // MINERADORES_POR_TIME
  cargaMinerador: 10, // MINERADOR.carga
  ouroInicial: 500, // OURO_INICIAL
  ouroPorSegundo: 1, // OURO_POR_SEGUNDO
  nivelMax: 25, // NIVEL_MAX
  pontosPorNivel: 10, // PONTOS_POR_NIVEL
  pontoMax: 99, // PONTO_MAX
  niveisNave: [5, 10, 15, 20], // NIVEL_POR_TIER sem o 1
  compartimento: 12, // COMPARTIMENTO_MAX
  versaoMax: 8, // NIVEL_ITEM_MAX
  recallS: 6, // RECALL_S
  trocaArmaS: 3, // TROCA_ARMA_S
  visao: 550, // VISAO_RAIO
  wingRaio: 550, // WING_RAIO
  alcanceTorre: 560, // VISAO_TORRETA (o alcance da torre sentinela)
  acampamentoS: 0, // TEMPOS_JUNGLE.acampamento.primeiroS
  ataqueS: 90, // TEMPOS_JUNGLE.ataque.primeiroS (SN-4)
  suporteS: 90, // TEMPOS.suporte.primeiroS
  plataformaS: 120, // TEMPOS.plataforma.primeiroS
  pousoPlataformaS: 6, // TEMPOS.plataforma.pousoS
  ouroPlataforma: 200, // OURO_PLATAFORMA
  sondaS: 180, // TEMPOS_JUNGLE.sonda.primeiroS
  medusaS: 300, // TEMPOS_JUNGLE.medusa.primeiroS
  nucleoS: 480, // TEMPOS.nucleo.primeiroS
  nucleoVoltaS: 300, // TEMPOS.nucleo.renasceS
  ondaNucleo: 3, // mineradores da onda do Núcleo
  minerioOndaNucleo: 50, // minério de cada um
  buffAtaquePct: 20, // BONUS_NAVE.ataque.dano − 1
  buffAtaqueS: 90, // BONUS_NAVE.ataque.s
  medusaPct: 15, // BONUS.medusa (dano e velocidade)
  medusaBuffS: 120, // BONUS.medusa.s
  sondaPct: 25, // BONUS_NAVE.sonda.vel − 1
  sondaBuffS: 40, // BONUS_NAVE.sonda.s
});

/** Segundos em "m:ss" (o relógio da partida). */
export function relogio(s) {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.round(s - m * 60)).padStart(2, '0')}`;
}

const F = FATOS;
const minFinal = relogio(F.duracaoS - F.faseFinalS);

/**
 * Os capítulos da trilha, na ordem. Cada um: `id`, `titulo`, `curto` (a linha da lista),
 * `min` (minutos de leitura), `resumo` (o "em resumo" do topo), `blocos` (o corpo) e
 * `praticar` (o modo do menu que o botão "Praticar agora" abre, com o texto dele).
 *
 * Blocos: `p` (parágrafo), `cartoes` (`itens` com `icone`, `titulo`, `texto` e `cor`
 * opcional), `teclas` (`itens` com `acoes` e `texto`), `passos` (lista numerada),
 * `tempo` (linha do tempo: `itens` com `t` e `texto`), `mapa` (o mapa da Seleção, com
 * as dicas ao passar o mouse), `dica` (a caixa "Dica de piloto") e `glossario`
 * (`itens` com `termo` e `texto`). `titulo` opcional em todos.
 */
export const CAPITULOS = Object.freeze([
  {
    id: 'objetivo',
    titulo: 'Como se ganha',
    curto: 'O objetivo da partida',
    min: 1,
    resumo: `Dois times de ${F.porTime} pilotos. Em ${F.duracaoS / 60} minutos, **vence o time com mais minério de Hélio-3** na bacia da base. Você não minera: **protege os seus mineradores e derruba os do inimigo**.`,
    blocos: [
      {
        tipo: 'cartoes',
        itens: [
          { icone: 'minerio', titulo: 'O minério decide', texto: 'O placar no canto de cima à direita mostra o minério de cada time. É o único número que vale no fim.', cor: 'objetivo' },
          { icone: 'escudo', titulo: 'Proteja os seus', texto: `${F.mineradoresPorTime} mineradores do seu time vão e voltam da mineradora no centro, sozinhos. Cada viagem entregue soma ${F.cargaMinerador} no placar.`, cor: 'neon' },
          { icone: 'alvo', titulo: 'Derrube os deles', texto: 'Minerador inimigo destruído não entrega nada, e o que ele carregava se perde. É a jogada que mais muda o placar.', cor: 'inimigo' },
          { icone: 'estrela', titulo: 'Fique mais forte', texto: 'Monstros, abates e objetivos dão ouro e XP. Com eles você compra armas e equipamento e evolui a nave.', cor: 'xp' },
        ],
      },
      {
        tipo: 'tempo',
        titulo: 'O ritmo da partida',
        itens: [
          { t: `−${relogio(F.preparacaoS)}`, texto: `**Preparação.** Nada sai e ninguém minera: explore o mapa, compre na Loja com os ${F.ouroInicial} de ouro iniciais e combine com o time.` },
          { t: relogio(F.acampamentoS), texto: '**Começou.** Os mineradores saem da base e os monstros da jungle nascem.' },
          { t: relogio(F.ataqueS), texto: 'O **SN-4** (buff de ataque) e a **torre de comunicação** (buff de suporte) acordam.' },
          { t: relogio(F.plataformaS), texto: 'As **plataformas de ouro** acendem.' },
          { t: relogio(F.sondaS), texto: 'A **sonda errante** passa pela coluna central.' },
          { t: relogio(F.medusaS), texto: 'A **Ancient Medusa** sobe da água no poço de baixo.' },
          { t: relogio(F.nucleoS), texto: `O **Núcleo de He-3** aparece no poço de cima: o maior objetivo da partida.` },
          { t: minFinal, texto: `**Fase final:** todo minério entregue vale ×${F.multFaseFinal} até o fim.` },
          { t: relogio(F.duracaoS), texto: '**Fim.** Mais minério vence (o empate existe). Depois da tela de resultado começa outra partida, do zero.' },
        ],
      },
      {
        tipo: 'dica',
        texto: 'Abater pilotos **não dá ponto no placar**: abre caminho. Um time que só caça naves e deixa a lane vazia perde no minério.',
      },
    ],
    praticar: { modo: 'privada', texto: 'Jogue uma partida inteira contra os computadores, sem pressa.' },
  },
  {
    id: 'pilotar',
    titulo: 'Pilotando a nave',
    curto: 'Voo, tiro e comandos',
    min: 1,
    resumo: 'A nave voa baixo, a 10 m da água, e a câmera fica atrás dela. **Duas armas**, uma no [[armaZ]] e outra no [[armaX]], gastam a mesma **energia** do turbo: atire em rajadas e deixe a energia voltar.',
    blocos: [
      {
        tipo: 'teclas',
        titulo: 'Voo',
        itens: [
          { acoes: ['frente', 're', 'esq', 'dir'], texto: 'Acelera, ré e gira. A rocha bloqueia: contorne.' },
          { acoes: ['boost'], texto: 'Turbo (segure). Gasta energia; zerada, ele trava até você soltar.' },
          { acoes: ['pouso'], texto: 'Pousa e decola, só nas áreas de pouso. Pousada, a nave conserta mais rápido mas não atira.' },
          { acoes: ['recall'], texto: `Volta à base em ${F.recallS} s, parado. Levar dano, atirar ou dar turbo cancela.` },
        ],
      },
      {
        tipo: 'teclas',
        titulo: 'Armas e itens',
        itens: [
          { acoes: ['armaZ', 'armaX'], texto: 'Atira com a arma de cada encaixe. Cada uma tem a sua recarga.' },
          { acoes: ['trocaZ', 'trocaX'], texto: 'Troca rápida: põe no encaixe a arma guardada na casa Q ou E do inventário.' },
          { acoes: ['reparo', 'energia'], texto: 'Kit de reparo (vida) e célula de energia, comprados na Loja.' },
        ],
      },
      {
        tipo: 'teclas',
        titulo: 'Câmera e janelas',
        itens: [
          { acoes: ['camCima', 'camBaixo'], texto: 'Câmera mais alta ou mais baixa (a roda do mouse também).' },
          { acoes: ['tabela'], texto: 'Tabela da partida (segure): KDA, farm e itens de todos.' },
          { acoes: ['status', 'inventario'], texto: 'STATUS (pontos do piloto) e INVENTÁRIO (as peças da nave).' },
          { acoes: ['opcoes', 'comandos'], texto: 'Opções da partida e a lista de todos os comandos.' },
        ],
      },
      {
        tipo: 'p',
        texto: 'Pousada e parada no anel da **sua base**, a nave enche vida e energia em uns 3 segundos. É o lugar para se recuperar depois de uma briga.',
      },
      {
        tipo: 'dica',
        texto: 'Todas as teclas se trocam em **Configurações › Controles**, e o controle (joystick) também funciona. As teclas deste guia já são as suas.',
      },
    ],
    praticar: { modo: 'sandbox', texto: 'Voe à vontade num mundo só seu, sem relógio e com ouro na mão.' },
  },
  {
    id: 'mapa',
    titulo: 'O mapa: Lago de Hélio-3',
    curto: 'Bases, lane, jungle e torres',
    min: 2,
    resumo: 'O seu time nasce numa ponta da **lane**, o inimigo na outra, e a **mineradora** fica no meio. Em cima e embaixo fica a **jungle**, com monstros, nuvens de gás e os dois objetivos épicos. Passe o mouse no mapa para ver cada peça.',
    blocos: [
      { tipo: 'mapa' },
      {
        tipo: 'cartoes',
        itens: [
          { icone: 'base', titulo: 'Base e campo de força', texto: 'Na boca de cada base há um campo de força: o seu time passa, mas **nave inimiga que encosta explode** e nenhum tiro atravessa. Lá dentro ficam a Loja, a Evolução e a bacia de minério.', cor: 'neon' },
          { icone: 'mineradora', titulo: 'Lane e mineradora', texto: 'A lane é o caminho reto dos mineradores. A mineradora, no centro, é sólida: bloqueia passagem, tiro e visão. Cada time tem a sua doca num hangar que só o minerador dele atravessa.', cor: 'objetivo' },
          { icone: 'torre', titulo: 'Torres sentinela', texto: `Quatro por time, alcance de ${F.alcanceTorre} m (o maior do jogo). O míssil teleguiado bate mais forte a cada tiro seguido no mesmo alvo: **não fique sozinho no alcance** da torre inimiga.`, cor: 'inimigo' },
          { icone: 'monstro', titulo: 'Jungle', texto: 'Acampamentos de monstros em cima e embaixo. Eles só atacam quem os provoca, e não saem do território deles.', cor: 'xp' },
          { icone: 'nuvem', titulo: 'Nuvens de gás', texto: 'Dá para voar por dentro, e quem está lá fica escondido de quem está fora. Boas para emboscada.', cor: 'laser' },
          { icone: 'poco', titulo: 'Poços', texto: 'O poço de cima guarda o Núcleo de He-3, o de baixo a Ancient Medusa. Cada um tem três entradas.', cor: 'evolucao' },
        ],
      },
      {
        tipo: 'p',
        titulo: 'Névoa de guerra',
        texto: `Você só vê o que o seu time vê: cada nave enxerga ${F.visao} m, e rocha e mineradora cortam a visão. O que ninguém do time vê fica escuro, na tela e no minimapa. Um inimigo some atrás da rocha? Ele pode estar esperando você.`,
      },
    ],
    praticar: { modo: 'sandbox', texto: 'Dê uma volta no mapa sem ninguém atirando em você.' },
  },
  {
    id: 'mineradores',
    titulo: 'Mineradores e minério',
    curto: 'O que decide o placar',
    min: 1,
    resumo: 'Os mineradores fazem sozinhos o caminho da base até a mineradora e de volta. **Escolte os seus pela lane e cace os do inimigo**, de preferência na volta, cheios de minério.',
    blocos: [
      {
        tipo: 'passos',
        titulo: 'A viagem de um minerador',
        itens: [
          'Sai da bacia da sua base, um de cada vez.',
          'Voa em linha reta pela lane até a porta do hangar do time, na mineradora.',
          'Entra e minera. **Dentro do hangar ninguém o alcança**: o campo da porta segura nave e tiro.',
          'Volta carregado pela mesma lane. É aqui que ele é mais valioso para o inimigo.',
          `Despeja a carga na bacia da base: **+${F.cargaMinerador} de minério** para o time.`,
        ],
      },
      {
        tipo: 'cartoes',
        itens: [
          { icone: 'escudo', titulo: 'Escoltas', texto: 'Três naves armadas acompanham o comboio de cada time e atiram em quem chega perto. Derrube a escolta antes de caçar.', cor: 'neon' },
          { icone: 'evolucao', titulo: 'Melhore o comboio', texto: 'Na Evolução, qualquer piloto paga mais mineradores, casco, blindagem e motor para o time inteiro.', cor: 'evolucao' },
          { icone: 'nucleo', titulo: 'Onda do Núcleo', texto: `Quem toma o Núcleo de He-3 solta ${F.ondaNucleo} mineradores gigantes com ${F.minerioOndaNucleo} de minério cada. Escolte a sua; cace a do inimigo.`, cor: 'objetivo' },
        ],
      },
      {
        tipo: 'dica',
        texto: `Na fase final (de ${minFinal} em diante) cada entrega vale ×${F.multFaseFinal}. Um comboio inteiro salvo ou perdido nesses minutos vira a partida.`,
      },
    ],
    praticar: { modo: 'privada', texto: 'Veja os comboios andando numa partida contra os computadores.' },
  },
  {
    id: 'combate',
    titulo: 'Combate',
    curto: 'Dano, escudo e morte',
    min: 2,
    resumo: 'O dano sai **primeiro do escudo** e depois da vida. Cada arma é de um tipo, **Ph.** (físico), **Op.** (laser) ou **El.** (elétrico), e cada tipo tem a sua resistência. Morrer custa tempo: o renascimento cresce com o nível e com a partida.',
    blocos: [
      {
        tipo: 'cartoes',
        itens: [
          { icone: 'escudo', titulo: 'Escudo e vida', texto: 'O escudo (barra azul acima da vida) segura o dano e se recupera sozinho, mesmo apanhando. Acabou, o dano vai para a vida.', cor: 'escudo' },
          { icone: 'raio', titulo: 'Tipos de dano', texto: 'Armadura, escudo e potenciadores dão resistência a um tipo. Repare na cor do nome do inimigo: ela mostra contra o que ele está protegido.', cor: 'laser' },
          { icone: 'alvo', titulo: 'Crítico e efeitos', texto: 'Cada arma tem chance de crítico (dano ×2). Algumas paralisam, deixam lento, tiram a energia ou impedem o tiro do alvo.', cor: 'ouro' },
          { icone: 'time', titulo: 'Sem fogo amigo', texto: 'Seu tiro atravessa os aliados e os mineradores do seu time. Na base, a zona segura protege só o time dono.', cor: 'neon' },
        ],
      },
      {
        tipo: 'p',
        titulo: 'Abates',
        texto: 'Derrubar um piloto inimigo dá ouro e XP pelo nível dele. Quem ajudou nos últimos 10 s ganha uma **assistência**. Encerrar a sequência de quem está matando sem morrer paga um bônus. O locutor anuncia o First Blood, o Double Kill, o Godlike…',
      },
      {
        tipo: 'teclas',
        titulo: 'Depois da briga',
        itens: [
          { acoes: ['morte'], texto: 'Resumo da última morte: quem bateu, quanto e de que tipo. Abre sozinho quando você cai.' },
          { acoes: ['tabela'], texto: 'Tabela: quem está forte, o KDA e os itens de cada um.' },
        ],
      },
      {
        tipo: 'dica',
        texto: 'Brigue perto do seu time. No 3 contra 3, quem fica sozinho vira alvo de três.',
      },
    ],
    praticar: { modo: 'sandbox', texto: 'Teste as armas e os equipamentos à vontade.' },
  },
  {
    id: 'progresso',
    titulo: 'Ouro, XP e nível',
    curto: 'Como ficar mais forte',
    min: 1,
    resumo: `Todos começam com **${F.ouroInicial} de ouro** e ganham **${F.ouroPorSegundo} por segundo**. O resto vem de monstros, mineradores, pilotos e objetivos. A XP sobe o nível (até o ${F.nivelMax}): **cada nível enche a vida, o escudo e a energia** e dá ${F.pontosPorNivel} pontos para pôr na nave.`,
    blocos: [
      {
        tipo: 'cartoes',
        itens: [
          { icone: 'ouro', titulo: 'De onde vem o ouro', texto: 'Ouro passivo, monstros da jungle, mineradores e escoltas inimigos, torres, pilotos, as plataformas de ouro e os objetivos neutros.', cor: 'ouro' },
          { icone: 'estrela', titulo: 'XP do wing', texto: `Quando um aliado derruba um monstro, um minerador, uma escolta ou uma torre, você também ganha a XP inteira se estiver a até ${F.wingRaio} m. Andar junto rende.`, cor: 'xp' },
          { icone: 'monstro', titulo: 'A jungle cresce', texto: 'A cada 5 minutos os acampamentos ficam maiores e cada monstro paga mais ouro.', cor: 'xp' },
          { icone: 'nave', titulo: 'Nave nova', texto: `Nos níveis ${F.niveisNave.join(', ')} a Evolução vende a próxima nave da sua linha: mais vida, energia e tamanho.`, cor: 'evolucao' },
        ],
      },
      {
        tipo: 'teclas',
        titulo: 'Pontos do piloto',
        itens: [
          { acoes: ['pontoHp', 'pontoEn'], texto: 'Durabilidade (vida) e Energia.' },
          { acoes: ['pontoFis', 'pontoEl', 'pontoOp'], texto: 'Poder das armas físicas, elétricas e laser.' },
          { acoes: ['status'], texto: `A janela STATUS mostra o que cada ponto dá. Até ${F.pontoMax} em cada atributo.` },
        ],
      },
      {
        tipo: 'p',
        texto: 'Com ponto livre, aparecem abas em cima das barras de vida e energia: cada clique (ou tecla) põe 10 pontos. **Ponha os pontos no tipo de dano das suas armas.**',
      },
      {
        tipo: 'p',
        titulo: 'Subir de nível cura',
        texto: 'Cada nível novo enche na hora a vida, o escudo e a energia da nave. Está quase subindo? Um último abate no meio da briga recupera a nave inteira e pode virar a luta.',
      },
      {
        tipo: 'dica',
        texto: 'Ouro, nível, itens e a nave comprada são **da partida**, como num MOBA: na seguinte, todo mundo começa do zero.',
      },
    ],
    praticar: { modo: 'sandbox', texto: 'No Sandbox, o painel de teste dá ouro, XP e nível na hora.' },
  },
  {
    id: 'loja',
    titulo: 'Loja, inventário e Evolução',
    curto: 'Gastar o ouro',
    min: 2,
    resumo: `Para comprar, **pouse e pare na plataforma** da Loja ou da Evolução da sua base ([[pouso]]): o painel abre sozinho. Comece pela aba **Recomendados** da Loja.`,
    blocos: [
      {
        tipo: 'cartoes',
        itens: [
          { icone: 'loja', titulo: 'Loja (plataforma rosa)', texto: 'Armas da sua raça e classe, escudos, armaduras, potenciadores, kits de reparo e células de energia. A aba Recomendados mostra o que vale a pena para a sua nave.', cor: 'loja' },
          { icone: 'evolucao', titulo: 'Evolução (plataforma violeta)', texto: 'A próxima nave da linha, as melhorias dos mineradores do time e as torres (subir o nível e reconstruir as destruídas).', cor: 'evolucao' },
          { icone: 'inventario', titulo: 'Inventário', texto: `A nave leva 2 armas, 1 escudo, 1 armadura e 2 potenciadores. O resto fica no compartimento (até ${F.compartimento}). Equipar vale em qualquer lugar, até arrastando o item.`, cor: 'neon' },
          { icone: 'estrela', titulo: 'Evoluir itens', texto: `Cada item vai da V1 à V${F.versaoMax}, sem chance de falhar. Evoluir e vender só na base, pela caixinha do item no inventário.`, cor: 'ouro' },
        ],
      },
      {
        tipo: 'teclas',
        itens: [
          { acoes: ['inventario'], texto: 'Abre o inventário (na Loja ele abre junto).' },
          { acoes: ['loja'], texto: 'Reabre a Loja ou a Evolução, pousado na plataforma.' },
          { acoes: ['recall'], texto: 'Volta à base para gastar o ouro sem atravessar o mapa.' },
        ],
      },
      {
        tipo: 'p',
        texto: `Trocar de arma fora da base deixa aquele encaixe ${F.trocaArmaS} s sem atirar ("CARREGANDO"). Dentro da base, a troca é livre: monte a build antes de sair.`,
      },
      {
        tipo: 'dica',
        texto: 'Ouro guardado não ganha briga. Sempre que voltar à base, gaste: uma peça nova ou uma versão a mais faz diferença.',
      },
    ],
    praticar: { modo: 'sandbox', texto: 'Monte builds no Sandbox, com o ouro do painel de teste.' },
  },
  {
    id: 'objetivos',
    titulo: 'Objetivos neutros',
    curto: 'Buffs, Medusa e Núcleo',
    min: 2,
    resumo: 'Espalhados pela jungle, os objetivos dão **bônus, ouro e XP** a quem os toma. O maior é o **Núcleo de He-3**: quem o toma ganha uma onda de mineradores gigantes.',
    blocos: [
      {
        tipo: 'cartoes',
        itens: [
          { icone: 'monstro', titulo: `SN-4 · ${relogio(F.ataqueS)}`, texto: `O chefe do buff de ataque. Quem dá o golpe final ganha +${F.buffAtaquePct}% de dano por ${F.buffAtaqueS} s.`, cor: 'inimigo' },
          { icone: 'torre', titulo: `Torre de comunicação · ${relogio(F.suporteS)}`, texto: 'O buff de suporte. Quem derruba a torre regenera vida e energia por um tempo.', cor: 'laser' },
          { icone: 'ouro', titulo: `Plataforma de ouro · ${relogio(F.plataformaS)}`, texto: `Pouse e fique parado ${F.pousoPlataformaS} s na plataforma dourada: ${F.ouroPlataforma} de ouro para cada piloto do time. Levar dano cancela.`, cor: 'ouro' },
          { icone: 'sonda', titulo: `Sonda errante · ${relogio(F.sondaS)}`, texto: `Foge de quem a ataca. Derrubada, dá +${F.sondaPct}% de velocidade por ${F.sondaBuffS} s para se deslocar.`, cor: 'xp' },
          { icone: 'medusa', titulo: `Ancient Medusa · ${relogio(F.medusaS)}`, texto: `Chefe épico do poço de baixo. Paga ouro e XP a cada piloto do time e +${F.medusaPct}% de dano e velocidade para todos por ${F.medusaBuffS / 60} minutos.`, cor: 'evolucao' },
          { icone: 'nucleo', titulo: `Núcleo de He-3 · ${relogio(F.nucleoS)}`, texto: `Não ataca, mas tem um escudo que se regenera rápido e **devolve parte do dano** para quem bate, dividido entre as naves por perto. Volta ${F.nucleoVoltaS / 60} minutos depois, mais forte.`, cor: 'objetivo' },
        ],
      },
      {
        tipo: 'passos',
        titulo: 'Tomando o Núcleo',
        itens: [
          'Junte o time na entrada do poço de cima antes de começar.',
          'Batam **todos ao mesmo tempo**: dano aos poucos não vence a regeneração do escudo.',
          'O reflexo se divide entre quem está perto. Sozinho, você leva tudo e costuma morrer.',
          `Tomado, saem ${F.ondaNucleo} mineradores gigantes da base do seu time, com ${F.minerioOndaNucleo} de minério cada: escolte-os até a bacia.`,
        ],
      },
      {
        tipo: 'dica',
        texto: 'O seu buff de ataque fica perto de um objetivo épico e o do inimigo perto do outro. Quando o inimigo for para um, vá para o outro.',
      },
    ],
    praticar: { modo: 'sandbox', texto: 'No Sandbox, o botão Resetar Núcleo traz o Núcleo na hora para treinar.' },
  },
  {
    id: 'naves',
    titulo: 'Raças, classes e naves',
    curto: 'Qual nave escolher',
    min: 1,
    resumo: 'Antes de decolar você escolhe a **raça** (o estilo das armas) e a **classe** (o papel da nave). Cada combinação é uma linha de **cinco naves**: você começa na primeira e compra as outras durante a partida.',
    blocos: [
      {
        tipo: 'cartoes',
        titulo: 'Raças',
        itens: [
          { icone: 'nave', titulo: 'Acron', texto: 'Povo aquático, mestre das ondas de energia.', cor: 'acron' },
          { icone: 'nave', titulo: 'Bellico', texto: 'Guerreiros do deserto. Batem forte e a nave **regenera vida em voo**.', cor: 'bellico' },
          { icone: 'nave', titulo: 'Shrewdo', texto: 'Corporações do terreno, com campo furtivo.', cor: 'shrewdo' },
        ],
      },
      {
        tipo: 'cartoes',
        titulo: 'Classes',
        itens: [
          { icone: 'escudo', titulo: 'Assault · mais vida', texto: 'Aguenta a frente da briga e segura a lane.', cor: 'hp' },
          { icone: 'raio', titulo: 'Mobile · mais velocidade', texto: 'Chega primeiro: caça mineradores, rouba objetivos e foge.', cor: 'neon' },
          { icone: 'time', titulo: 'Functional · mais energia', texto: 'Mais energia para atirar e um poder único: **os aliados se teleportam até você** pela barra do time.', cor: 'en' },
        ],
      },
      {
        tipo: 'p',
        texto: 'Cada nave usa só as armas da sua raça e classe. Todas começam com as duas armas de fábrica da raça; as outras se compram na Loja. A aba **Naves** do menu mostra todas as linhas, com o tamanho e os status.',
      },
      {
        tipo: 'dica',
        texto: 'Na dúvida, comece com uma Assault: a vida a mais perdoa os erros das primeiras partidas.',
      },
    ],
    praticar: { modo: 'sandbox', texto: 'Experimente cada raça e classe no Sandbox.' },
  },
  {
    id: 'primeira',
    titulo: 'Sua primeira partida',
    curto: 'O passo a passo',
    min: 2,
    resumo: 'Um roteiro para a primeira partida. Siga na ordem e, na segunda, você já vai estar decidindo sozinho.',
    blocos: [
      {
        tipo: 'passos',
        itens: [
          'Na aba **Jogar**, escolha **Partida Privada com Bots**: 3 contra 3 contra os computadores, sem pressão.',
          'Escolha a raça e a classe (uma Assault é um bom começo) e aperte **Decolar**.',
          `Na preparação, pouse ([[pouso]]) na **Loja** e compre o que a aba Recomendados sugere com os ${F.ouroInicial} de ouro.`,
          'Ponha os 10 pontos do nível 1 no tipo de dano das suas armas ([[pontoFis]] [[pontoEl]] [[pontoOp]]).',
          'Quando a partida começar, acompanhe os seus mineradores na lane ou limpe o acampamento perto da sua base.',
          `Ouro acumulado? Volte à base ([[recall]]) e gaste. No nível ${F.niveisNave[0]}, compre a próxima nave na Evolução.`,
          `Aos ${relogio(F.nucleoS)}, junte o time no Núcleo de He-3 e batam juntos.`,
          `Na fase final (${minFinal}), derrube os mineradores inimigos carregados e proteja os seus até a bacia.`,
        ],
      },
      {
        tipo: 'cartoes',
        titulo: 'Erros comuns',
        itens: [
          { icone: 'perigo', titulo: 'Ficar sozinho na torre', texto: 'A torre sentinela bate mais forte a cada tiro. Entre no alcance dela só com o time.', cor: 'inimigo' },
          { icone: 'perigo', titulo: 'Encostar no campo inimigo', texto: 'O campo de força da base inimiga destrói a sua nave na hora.', cor: 'inimigo' },
          { icone: 'perigo', titulo: 'Bater no Núcleo sozinho', texto: 'O reflexo inteiro volta para você.', cor: 'inimigo' },
          { icone: 'perigo', titulo: 'Esquecer a lane', texto: 'Placar é minério. Sem ninguém na lane, os seus mineradores caem.', cor: 'inimigo' },
        ],
      },
    ],
    praticar: { modo: 'privada', texto: 'Comece agora a sua primeira partida contra os computadores.' },
  },
  {
    id: 'glossario',
    titulo: 'Glossário',
    curto: 'Os termos do jogo',
    min: 1,
    resumo: 'As palavras que você vai ouvir (e ler no HUD) durante a partida.',
    blocos: [
      {
        tipo: 'glossario',
        itens: [
          { termo: 'Lane', texto: 'O caminho reto entre as duas bases, por onde passam os mineradores.' },
          { termo: 'Jungle', texto: 'As áreas de cima e de baixo do mapa, com os acampamentos de monstros e os objetivos.' },
          { termo: 'Farm', texto: 'Derrubar monstros, mineradores e escoltas para ganhar ouro e XP.' },
          { termo: 'Buff', texto: 'Um bônus por tempo, como o de ataque do SN-4 ou o da Medusa.' },
          { termo: 'KDA', texto: 'Abates / mortes / assistências. A tabela da partida mostra o de todos.' },
          { termo: 'Assistência', texto: 'Ferir um piloto inimigo que um aliado derrubou nos 10 s seguintes. Paga metade do ouro e da XP do abate.' },
          { termo: 'Wing', texto: 'O seu time. A XP do wing é a que você ganha quando um aliado abate algo perto de você.' },
          { termo: 'Recall', texto: `Voltar à base canalizando ${F.recallS} s, parado ([[recall]]).` },
          { termo: 'Névoa de guerra', texto: 'O escuro onde o seu time não enxerga. Quem está lá não aparece para você.' },
          { termo: 'Zona segura', texto: 'O bolsão da sua base, atrás do campo de força. Lá o inimigo não entra.' },
          { termo: 'Comboio', texto: 'A fila de mineradores com as escoltas.' },
          { termo: 'Ph. / Op. / El.', texto: 'Os tipos de dano: físico, laser (operacional) e elétrico.' },
          { termo: 'Resistência', texto: 'Quanto do dano de um tipo a nave segura. A penetração de quem bate atravessa parte dela.' },
          { termo: 'V1 a V8', texto: 'A versão de um item. Cada versão a mais deixa a arma ou o equipamento mais forte.' },
          { termo: 'Tier', texto: 'A posição da nave na linha, da 1ª à 5ª.' },
          { termo: 'Compartimento', texto: `Os itens que você tem mas não estão na nave (até ${F.compartimento}).` },
          { termo: 'Fase final', texto: `Os últimos ${F.faseFinalS / 60} minutos: o minério entregue vale ×${F.multFaseFinal}.` },
          { termo: 'Onda do Núcleo', texto: `Os ${F.ondaNucleo} mineradores gigantes que saem da base de quem toma o Núcleo.` },
          { termo: 'First Blood', texto: 'O primeiro abate de piloto da partida, anunciado pelo locutor.' },
        ],
      },
    ],
    praticar: { modo: 'privada', texto: 'Hora de pôr tudo em prática.' },
  },
]);

/** Chave do navegador com os capítulos lidos. */
export const CHAVE_LIDOS = 'astron.comoJogar';

export const capituloPorId = (id) => CAPITULOS.find((c) => c.id === id) ?? null;

/** Os capítulos lidos a partir do texto guardado ("id,id,..."), só os que existem. */
export function lerLidos(texto) {
  const ids = String(texto ?? '').split(',');
  return new Set(CAPITULOS.map((c) => c.id).filter((id) => ids.includes(id)));
}

/** O texto guardado para os capítulos lidos, na ordem da trilha. */
export function textoLidos(lidos) {
  return CAPITULOS.map((c) => c.id)
    .filter((id) => lidos.has(id))
    .join(',');
}

/** Progresso da trilha: { lidos, total, fracao, completo }. */
export function progresso(lidos) {
  const n = CAPITULOS.filter((c) => lidos.has(c.id)).length;
  return { lidos: n, total: CAPITULOS.length, fracao: n / CAPITULOS.length, completo: n === CAPITULOS.length };
}

/** O capítulo que abre: o primeiro ainda não lido (tudo lido: o primeiro). */
export function capituloInicial(lidos) {
  return (CAPITULOS.find((c) => !lidos.has(c.id)) ?? CAPITULOS[0]).id;
}

/** O capítulo vizinho na direção `passo` (+1 próximo, −1 anterior); null nas pontas. */
export function vizinho(id, passo) {
  const i = CAPITULOS.findIndex((c) => c.id === id);
  return CAPITULOS[i + passo]?.id ?? null;
}

/** As ações de atalho que o texto de um capítulo usa ([[acao]] e os blocos de teclas). */
export function acoesDoCapitulo(cap) {
  const acoes = new Set();
  const doTexto = (t) => {
    for (const m of String(t ?? '').matchAll(/\[\[(\w+)\]\]/g)) acoes.add(m[1]);
  };
  doTexto(cap.resumo);
  for (const b of cap.blocos) {
    doTexto(b.texto);
    for (const it of b.itens ?? []) {
      if (typeof it === 'string') doTexto(it);
      else {
        doTexto(it.texto);
        for (const a of it.acoes ?? []) acoes.add(a);
      }
    }
  }
  return acoes;
}

/**
 * O texto em HTML: escapa, `**x**` vira <b> e `[[acao]]` vira a tecla dela
 * (`tecla(acao)`, no cliente o kbdAcao de atalhos.js).
 */
export function formatar(texto, tecla) {
  return String(texto ?? '')
    .replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/\[\[(\w+)\]\]/g, (_, a) => tecla(a));
}
