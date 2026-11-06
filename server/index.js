// Servidor do New AstroN: um processo Node só, que serve os arquivos do jogo (HTTP)
// e roda o mundo em tempo real (WebSocket em /ws).
//
// Sem Express e sem build: o cliente é ES module puro carregado direto do navegador,
// e o Three.js vem do próprio node_modules em /vendor/ (versão travada no
// package.json, sem depender de CDN no ar), com os addons (GLTFLoader, que lê o
// modelo da nave em public/modelos/) em /vendor/addons/.
//
// Protocolo (JSON):
//   cliente → servidor  {t:'entrar', nome, race, classe, teste?, privada?, iaMeu?, iaInimigo?}
//                        privada: true = Partida Privada com Bots, num mundo só seu
//                        (com relógio; MAX_MUNDOS_PRIVADOS ao mesmo tempo, senão
//                        'privada_cheia'); sem teste nem privada, o mundo principal
//                        (o dos testes automáticos)
//                       {t:'entrar', sala, token}   a vaga reservada de uma sala da
//                        fila online (o token do {t:'fila', estado:'comecar'}): o
//                        servidor usa o nome, a nave e o time travados na sala; token
//                        que não existe, já usado ou vencido (RESERVA_S): {t:'erro',
//                        codigo:'sala_invalida'}
//                        teste: true = modo de teste, num mundo só seu (partida sem
//                        relógio; MAX_MUNDOS_TESTE ao mesmo tempo, senão {t:'erro',
//                        codigo:'teste_cheio'}); iaMeu (0 a 2) e iaInimigo (0 a 3) =
//                        computadores escolhidos na tela inicial (inteiros; fora do
//                        limite vai para o limite, o que não é número vira 0:
//                        computadoresDaEntrada em server/partida.js). São o mínimo de
//                        vagas ocupadas: logo depois de entrar, o servidor completa o
//                        seu time até 1 + iaMeu e o outro até iaInimigo com
//                        computadores, contando gente e computador que já estão lá;
//                        só acrescenta (não tira ninguém, nem os computadores de outro
//                        piloto), nunca passa de 3 por time e gente ocupa a vaga antes
//                        (no modo de teste, no mundo dele)
//                       (race = 'acron' | 'bellico' | 'shrewdo'; 'mechan' ainda sem
//                        naves é recusada com 'raca_bloqueada', outra coisa com
//                        'raca_invalida'; classe = 'assault' | 'mobile' |
//                        'functional', inválida ou ausente vira 'assault'; o piloto
//                        começa na primeira nave da linha, shared/naves.js)
//                       {t:'teste', acao}   só no modo de teste: 'ouro' (+1000), 'xp'
//                        (+100), 'nivel' (sobe um), 'nivelMax' (vai ao 25), 'nucleo'
//                        (o Núcleo de He-3 volta ao começo na hora: nível 1, cheio); resposta
//                        {t:'resultado', acao:'teste', item, ok, codigo?} ('limite' no
//                        nível máximo, 'invalido' fora do modo de teste)
//                       {t:'in', s:seq, th, tu, b, f1, f2, p, r, a, a2}   um por passo de 1/30 s
//                       (p = botão de pouso, alterna pousar/decolar na borda;
//                        r = botão do recall (B), pulso: na borda começa a
//                        canalizar a volta à base ou cancela (shared/recall.js);
//                        f1/f2 = gatilho do Z/X (segurado: as armas de segurar a
//                        tecla ficam ligadas enquanto vale); a/a2 = INSTÂNCIA da
//                        arma do encaixe do Z/X: o id dela em me.inv (inteiro de 0
//                        a ID_ENCAIXE_MAX; outra coisa vira -1). Uma instância vai
//                        num encaixe só (a mesma arma no Z e no X são duas cópias:
//                        a mesma instância nos dois, o X fica sem ela); id que a
//                        nave não tem, de equipamento, de arma de outra raça ou
//                        classe, ou -1, cai na de fábrica do encaixe
//                        (armasIniciais: a primeira cópia dela; se está no outro
//                        encaixe, a de fábrica do outro); fora da própria base,
//                        trocar a arma de um encaixe o põe em recarga de troca de
//                        TROCA_ARMA_S, e outra troca nele enquanto conta é
//                        ignorada: o stepShip fica com a que tem. Índices em ARMAS
//                        (shared/armas.js): 0 e 1 são os tiros dos NPCs (laser,
//                        plasma), 2 a 141 as armas do Astro-N original na ordem
//                        das lojas (Acron 2–49, Bellico 50–92, Shrewdo 93–141;
//                        chave 'o<id do original>'))
//                       {t:'comprar', item}      Loja: item = id de shared/loja.js (arma
//                        pela chave, ex. 'o312010', só da raça e da classe do
//                        piloto, senão 'invalido'; até ARMA_COPIAS_MAX (2) cópias
//                        de cada, a de fábrica conta, cada uma com a sua versão:
//                        a terceira é 'ja_possui'; equipamento pela chave, ex. 'e330010'
//                        (escudo, armadura ou potenciador de shared/equipamentos.js,
//                        só da classe do piloto, senão 'invalido'; pode repetir);
//                        cria a instância V1 no COMPARTIMENTO do inventário, sem
//                        equipar; compartimento com COMPARTIMENTO_MAX (12), 'cheio');
//                        'reparo' | 'energia' (carga própria, 'limite' no máximo)
//                       {t:'vender', inst}       vende a instância `inst` (id em me.inv)
//                        do compartimento por metade do que se pagou nela (pago,
//                        para baixo); só pousado e parado numa área de pouso da
//                        própria base, senão 'nao_pousado'; na nave (num encaixe
//                        Z/X, me.encInst, ou de equipamento), 'equipado'; arma
//                        de fábrica ou inst que não é inteiro, 'invalido'; não tem,
//                        'sem_item'
//                       {t:'evoluirItem', inst}  sobe a instância `inst` (no compartimento
//                        ou na nave; só ela: a outra cópia da mesma arma fica na
//                        versão dela) para a próxima versão do original (V2 a V8),
//                        pagando a taxa de tuning dela, que soma no pago; só pousado
//                        e parado na própria base ('nao_pousado'); na V8, 'limite';
//                        sem ouro, 'ouro_insuficiente'; qualquer nível do piloto
//                       {t:'pontos', atributo, qtd}   põe pontos livres do piloto num
//                        atributo: 'durabilidade' (HP) | 'energia' | 'fisico' |
//                        'eletrico' | 'laser' (Op.);
//                        qtd inteiro 1 a 99 (padrão 1), põe o que couber nos livres
//                        e no máximo de 99 do atributo; vale em qualquer lugar, vivo
//                        ou morto; 'sem_pontos' sem livres, 'maximo' com o atributo
//                        em 99, 'invalido' atributo ou qtd ruins (shared/status.js)
//                       {t:'equipar', slot, inst}   slot 'escudo' | 'armadura' | 'pot1' |
//                        'pot2'; inst = id de uma instância de equipamento do
//                        compartimento (ou null para tirar o do slot, que volta ao
//                        compartimento: cheio, 'cheio'); em qualquer lugar, vivo
//                        (morto, 'invalido'); 'sem_item' sem a instância; 'invalido'
//                        categoria errada para o slot, outra classe, slot ruim ou
//                        inst que não é inteiro; a instância que já está no outro
//                        slot de potenciador troca de lugar com a deste. Trocar de
//                        escudo zera o escudo atual. As armas dos encaixes Z/X são
//                        do comando (a/a2, ids de instância), não deste pedido
//                       {t:'evoluir', opcao:'nave'}  Evolução da nave: compra a próxima
//                        nave da linha da raça e classe (nível e ouro dela; na
//                        última, 'limite'; outra opcao, 'invalido')
//                       {t:'melhorar', melhoria} mineradores do time: 'quantidade' |
//                        'durabilidade' | 'defesa' | 'velocidade'; ou 'torretas' (sobe
//                        o nível das quatro torretas do time)
//                       {t:'reconstruir', torreta}  reconstrói uma torreta destruída do
//                        próprio time: torreta = id em TORRETAS ('T0-1' a 'T1-4')
//                       {t:'usar', item}         item consumível: 'reparo' (R) | 'energia' (F)
//                       (resposta de pontos, equipar, vender e evoluirItem:
//                        {t:'resultado', acao, item: atributo, slot ou inst, ok,
//                        codigo?}; comprar/evoluir/melhorar/reconstruir só vivo,
//                        pousado e parado na plataforma do serviço da própria base;
//                        usar e equipar valem em qualquer lugar; tudo validado em
//                        server/servicos.js)
//                       {t:'teleportar', alvo}   salta na hora (sem recarga, com custo de energia) para junto
//                        do companheiro `alvo` (id de jogador) de nave Functional
//                        (classe 'functional'): o servidor valida e põe a nave num
//                        ponto livre em volta dele (atrás primeiro), na altura de voo,
//                        parada e decolada, olhando para onde ele olha; recall em
//                        andamento cancela (motivo 'teleporte'). Resposta {t:'resultado',
//                        acao:'teleportar', item: alvo, ok, codigo?}: 'sem_partida'
//                        (fora da preparação e do andamento, salvo no modo de teste), 'morto'
//                        (quem pede), 'invalido' (alvo não inteiro, que não existe, você
//                        mesmo ou do outro time), 'alvo_morto', 'nao_functional',
//                        'sem_energia' (com `custo`, arredondado para cima). Custa
//                        energia como no original (custoTeleporte em shared/sim.js:
//                        0,3 × (100 × (1 + nível/30) + 10 × |nível − nível do alvo|));
//                        deu certo, desconta e manda o evento 'teleporte'
//                        (server/game.js, pedidoTeleporte)
//                       {t:'ia', ...}   não vale mais: os computadores se escolhem só na
//                        entrada (iaMeu, iaInimigo); a resposta é sempre {t:'resultado',
//                        acao:'ia', item: acao, ok: false, codigo:'invalido'}. O nick do
//                        computador é sempre "NOME (IA)" (server/bots.js). Humano que
//                        entra com a partida cheia fica com a vaga de um computador.
//                       {t:'ping', c}
//                       Filas online (server/filas.js), na conexão do menu, que não
//                        vira jogo (o jogo abre outra conexão com o token):
//                       {t:'filas'}   observar: recebe {t:'filas'} agora e a cada mudança
//                       {t:'entrarFila', modo, nome, race, classe}   modo 'online' (3
//                        contra 3, 6 humanos) | 'publica' (3 humanos contra 3
//                        computadores); já na fila, só reenvia o estado
//                       {t:'escolha', nome?, race?, classe?}   troca a nave na fila ou na
//                        sala (os do seu time veem na hora); depois do Pronto, 'travada'
//                       {t:'trocarTime'}   só no 3 contra 3 ('online'), procurando: passa
//                        do time verde (0) para o vermelho (1) ou o contrário, se o
//                        outro tem vaga livre no seu grupo (vai para o fim do outro time;
//                        nunca mais de 3 num time de uma sala: o 4º é da sala seguinte;
//                        'cheio' sem vaga, 'invalido'
//                        na pública, 'fora' na sala); com 3 em cada, a sala fecha
//                       {t:'pronto', nome?, race?, classe?}   trava a nave (com a escolha
//                        final junto); todos prontos, a partida começa. No 3 contra 3
//                        vale também procurando, com o grupo já tendo 1 em cada time
//                        (o `cedo` do estado; antes disso, 'cedo'): trava a nave e o
//                        time, e todos do grupo prontos começam a partida só com eles
//                        (1 contra 1, 2 contra 1...), sem computadores. Na pública,
//                        o mesmo com 2 pilotos no grupo: os dois começam juntos e um
//                        computador completa o time deles
//                       {t:'cancelarPronto'}   desfaz o Pronto (na sala ou procurando):
//                        a nave e o time destravam; sem Pronto, nada muda; 'fora'
//                        fora da fila (a partida já começou)
//                       {t:'sairFila'}   sai (na sala, a desfaz: os outros voltam ao
//                        começo da fila); fechar a conexão é o mesmo
//                       (recusa: {t:'resultado', acao, ok:false, codigo} 'invalido',
//                        'fora' (não está na fila/sala), 'travada', 'cheio', 'cedo', 'raca_bloqueada',
//                        'raca_invalida')
//   (No servidor de verdade cada partida roda numa worker thread, server/mundos.js:
//    o protocolo com o cliente é o mesmo; só o pong sai sempre da linha principal.)
//   servidor → cliente  {t:'bemvindo', id, tickHz, time, teste, modo}   time = 0 (base de baixo) ou 1;
//                        modo 'partida' (o mundo principal) | 'teste' | 'privada' |
//                        'online' | 'publica'
//                       {t:'erro', codigo}   codigo 'partida_cheia' (3 em cada time),
//                        'raca_bloqueada', 'raca_invalida', 'teste_cheio',
//                        'privada_cheia' ou 'sala_invalida'; fecha
//                       {t:'filas', online: {fila, escolhendo, jogando, precisa},
//                        publica: {...}}   contagem em tempo real para o menu: pilotos
//                        procurando, na seleção de alguma sala e jogando; `precisa` =
//                        humanos por sala (6 e 3)
//                       {t:'fila', estado:'fora', aviso?}   fora da fila (aviso
//                        'sem_pronto': o contador zerou sem o seu Pronto)
//                       {t:'fila', estado:'procurando', modo, n, precisa, espera, voce:
//                        {time, pronto}, times, cedo?, aviso?}   cedo 1 = o grupo já pode
//                        começar com todos prontos (o Pronto acende);   n pilotos no seu grupo (o da próxima
//                        sala, você conta) de `precisa`, times como os da sala
//                        ([verde, vermelho]; o seu time com raça e classe, o outro só
//                        o nome; no 3 contra 3 o time escolhido na fila: quem chega
//                        vai para o que tem menos gente, e {t:'trocarTime'} troca;
//                        a sala mantém), espera = s
//                        desde que entrou; aviso 'sala_tempo' (alguém não apertou Pronto) ou
//                        'sala_saiu' (alguém saiu da sala): você voltou ao começo da fila
//                       {t:'fila', estado:'sala', modo, id, restante, prontos, total,
//                        bots, voce: {time, pronto, race, classe}, times: [[{nome,
//                        pronto, race?, classe?, voce?}], [...]]}   a seleção da sala:
//                        restante = s do contador (SELECAO_S); raça e classe só do seu
//                        time; bots 1 = o outro time é de computadores
//                       {t:'fila', estado:'comecar', modo, sala, token, time, nome,
//                        race, classe}   todos prontos: entre com {t:'entrar', sala, token}
//                       {t:'snap', tick, ack, vivo, renasceEm, time, me, ouro, abates, mortes,
//                        nivel, xp, xpProx, partida, bonus, obj, torretas, melhorias, minas,
//                        guiados, jogadores, st, ents, ev}
//                       (me.encInst = [id da instância no Z, id no X], e derivados
//                        dela me.encaixes = [arma do Z, arma do X] (índices em
//                        ARMAS) e me.nivEnc = [versão do Z, versão do X] (V1–V8);
//                        me.armasInst = [[id, índice em ARMAS, nível], ...] as armas
//                        do inventário por instância (tiradas de me.inv; o
//                        stepShip da predição resolve o encaixe e a versão daqui),
//                        me.cd1/cd2 = recarga de cada encaixe, me.troca1/troca2 = s
//                        de recarga de troca de arma de cada encaixe (sem tiro e
//                        sem troca nele), me.armas = armas que possui (índices sem
//                        repetir as cópias: as de fábrica da raça e as compradas),
//                        me.raj1/raj2 (+ rajT, rajK) = rajada em andamento de cada
//                        encaixe, me.seg1/seg2 = arma de segurar ligada (-1 nenhuma),
//                        efeitos de arma recebidos (s restantes, todos lidos no
//                        stepShip): me.lento + me.lentoMult (fração da velocidade; 0
//                        é paralisia do movimento), me.emp (sem tiro e sem boost),
//                        me.semTiro (paralisia do ataque), me.trava (sem acelerar
//                        nem frear), me.desgov (curva invertida), me.semRegen (energia
//                        não recupera), me.cadencia + me.cadMult (recarga maior),
//                        me.enCara + me.enCaraMult (tiro mais caro), me.drenoEn +
//                        me.drenoEnPs (perde energia por s),
//                        me.time = time da nave, para a predição do pouso;
//                        me.classe e me.tier = a nave da linha (shared/naves.js),
//                        me.velocidade (m/s) e me.regenEn (energia por s) = da
//                        nave, lidos no stepShip da predição; me.velMult e
//                        me.regenEn já vêm com os bônus por tempo (sonda, medusa,
//                        suporte; server/bonus.js); me.bonusNave = {ataque: s,
//                        suporte: s, sonda: s} os bônus de nave ativos e
//                        me.bonusSuspenso = ['sonda'] quando a sonda está suspensa
//                        (3 s depois de causar ou levar dano); me.regenHpVoo e
//                        me.regenHpPousada (HP/s voando e pousada) = da nave, só
//                        informação (quem regenera é o servidor); me.corpo (m) =
//                        o que a rocha e as construções param, lido no stepShip
//                        da predição, e me.raio (m) = o alvo dos tiros, os dois da
//                        nave da linha (crescem com o tier, shared/naves.js);
//                        cada ent traz dreno/lento/emp booleanos para desenhar o efeito;
//                        ev 'tiro' traz kind, que diz a arma e o efeito do projétil;
//                        nivel = nível do jogador (1 a NIVEL_MAX), xp = XP dentro do
//                        nível, xpProx = XP para o próximo (0 no máximo); ouro, xp e
//                        nivel zeram a cada partida; renasceEm = s até a nave
//                        renascer, 0 viva: cresce com o nível e com a partida)
//                       {t:'resultado', acao, item, ok, codigo?}   resposta (só a quem
//                       pediu) de comprar/evoluir/melhorar/reconstruir/usar/pontos/equipar/
//                       vender/evoluirItem/teleportar; codigo = 'nao_pousado' | 'ouro_insuficiente' |
//                       'nivel_insuficiente' | 'ja_possui' | 'limite' | 'invalido' |
//                       'sem_item' | 'recarga' | 'cheio' (item ou compartimento) |
//                       'equipado' | 'sem_pontos' | 'maximo' (e no teleportar
//                       'sem_partida' | 'morto' | 'alvo_morto' | 'nao_functional' |
//                       'sem_energia', este com `custo`)
//                       {t:'pong', c}
//   VISÃO DO TIME (névoa de guerra, server/visao.js): o snapshot de cada jogador só
//         leva o que algum aliado enxerga (naves de jogador vivas 550 m, mineradores e
//         escoltas 300 m, torres sentinela de pé 560 m, a base; rocha e mineradora
//         tampam, asteroide esconde quem está dentro: shared/visao.js). Vale para
//         ents (as do próprio time sempre vêm), minas, guiados e os eventos com x/z
//         (quem é autor ou alvo recebe o seu, o 'tiro' travado nele inclusive; 'tiro' vem se o caminho dele entra na
//         visão, e o 'fim'/'acerto' do tiro anunciado vem sempre (o 'fim' com `campo`
//         também a quem vê o ponto do campo de força); 'morte' de jogador
//         fora da visão vem sem x/y/z; 'recall' de outro time só o 'chegou', sem a
//         ponta escondida (de ou x/y/z)). Entidade que some some do `ents`; ao voltar,
//         vem no lugar novo. obj, torretas, partida, placar e jogadores são públicos.
//   me (Loja e Evolução): armas = posse (de fábrica + compradas, tirada de inv; zera
//         a cada partida), armasInst = as armas por instância com a versão de cada
//         cópia (tirado de inv; zera a cada partida), itens {reparo, energia} (carga),
//         cdItens {reparo, energia} (s de recarga), tier (nave da linha comprada,
//         0 a 4; zera a cada partida); maxHp e maxEn já com a nave, o nível, os
//         pontos e o equipamento
//   me (STATUS e INVENTÁRIO; tudo zera a cada partida): pontos = {durabilidade,
//         energia, fisico, eletrico, laser} distribuídos, pontosLivres (10 por nível menos os
//         gastos), inv = [{id, tipo: 'arma' | 'equip', chave, nivel (1 a 8), pago,
//         fabrica?}] o inventário por instância (id inteiro único do piloto;
//         chave 'o311001' da arma ou 'e330010' do equipamento; pago = ouro gasto
//         nela, compra + evoluções; fabrica: true nas duas armas de fábrica, de
//         pago 0, que também se vendem; até 2 instâncias da mesma arma), compMax = tamanho do
//         compartimento (12: o que está em inv e não na nave, as instâncias de arma
//         fora de me.encInst inclusive), equipado =
//         {escudo, armadura, pot: [a, b]} (id de instância ou null) o que está na nave,
//         escudo / maxEscudo / regenEscudo (por s) = escudo do equipamento (o
//         servidor conta; recupera sempre, enche pousado na base e ao renascer),
//         status = o statusDoPiloto já somado (shared/status.js:
//         {hpExtra, maxEscudo, regenEscudo, regenEscudoItem, enExtra, regenEnExtra, regenHpExtra,
//         poder, recarga, resist, penetra: {fisico, laser, eletrico}, critico,
//         velMult, acelMult}), e lidos no stepShip da predição: velMult e acelMult
//         (multiplicadores de velocidade máxima e aceleração) e recargaMult =
//         {fisico, laser, eletrico} (multiplicador da recarga da arma daquele tipo
//         de dano); regenEn, regenHpVoo e regenHpPousada já somam os extras
//   melhorias: {quantidade, durabilidade, defesa, velocidade}   níveis comprados
//         das melhorias dos mineradores do time de quem recebe (zeram a cada partida)
//   jogadores: [{id, nome, time, nivel, ia?, abates, abatesJog, mortes, mortesPartida,
//         assist, farm, vivo, race, classe, tier, itens}]   todos os jogadores da
//         partida, humanos e computadores (ia: true), para a tabela da partida (TAB,
//         public/js/tabela.js) e a barra do time no alto da tela; abates conta tudo o
//         que o piloto derrubou (monstro, minerador...), abatesJog só os jogadores do
//         outro time; mortesPartida, assist (assistências em abate de jogador) e farm
//         (monstros, mineradores e escoltas) são o KDA e o farm da tabela; os quatro
//         zeram na partida nova. itens = os seis na nave [arma Z, arma X, escudo,
//         armadura, pot1, pot2], cada um [chave, versão] ou null. Lista pública, como
//         o TAB do LoL: a nave e os itens sim, HP e posição nunca. A barra do time tira
//         a vida (hp/maxHp) dos ALIADOS das `ents`, onde o próprio time sempre vem (vivo
//         ou morto); a vida de inimigo só chega por lá quando o time o enxerga
//   partida: {n, estado, fase, restante, inicioEm, semTempo, placar:[t0, t1], vencedor, novaEm, estat}
//            (semTempo: modo de teste, a partida não acaba e restante vem 0; estat =
//            [t0, t1] com {torres, medusa, nucleo, abates}: torres sentinela do outro
//            time destruídas, Medusas e Núcleos tomados e abates de jogador inimigo do
//            time, o cabeçalho da tabela do TAB; zeram na partida nova)
//         estado = 'esperando' | 'preparacao' | 'andamento' | 'fim'; fase = 'normal' | 'final'
//         (últimos 3 min: minério entregue vale o dobro); restante, inicioEm e novaEm
//         em s; preparacao = os 3 min antes dos 20 (sem mineradores, jungle, objetivos,
//         tiro de torreta nem ouro passivo; inicioEm = s até começar, restante = a
//         duração inteira); vencedor = time, -1 empate, null jogando
//   bonus: {0: {medusa: s}, 1: {...}}   bônus de TIME ativos (s que faltam; medusa =
//         +15% de dano e +15% de velocidade das naves do time, server/bonus.js)
//   obj:  {[id]: estado}   objetivos do mapa, por id (server/objetivos.js: BS0, BS1,
//         P0, P1, NUCLEO; server/jungle.js: BA0, BA1, SONDA, MEDUSA). estado =
//         'espera' (ainda não apareceu) | 'ativo' | 'recarga' (tomado, volta depois) |
//         'tomado' (o Núcleo destruído que não volta antes do fim); volta = s até aparecer ou
//         voltar (em 'espera' e 'recarga'); time = time de quem tomou por último (ou
//         null). Torre de suporte (BS0/BS1): vida (0 a 1); em 'recarga' está caída e
//         o cliente a tira da física (definirObstaculoAtivo(id, false)); de pé em
//         'espera' e 'ativo' (em 'espera' não aceita dano). Plataforma (P0/P1): prog
//         (s pousado do time que está coletando), quem (esse time, ou null),
//         contestado? (os dois times pousados: trava); o feixe de luz acende com
//         quem != null. Núcleo: vida (a barreira, 0 a 1, ativo), aparicao (quantas
//         vezes já apareceu), nivel (a força: 1 na primeira aparição, +1 a cada morte;
//         fora do mapa, a da próxima volta). Da jungle (BA0/BA1 = SN-4 do buff de ataque, SONDA,
//         MEDUSA): estado 'espera' | 'ativo' | 'recarga', vida (0 a 1, ativo), volta,
//         time (de quem deu o último golpe final, ou null) e, na SONDA,
//         bloqueada (true: esperando a Medusa ou o Núcleo morrerem para aparecer)
//   torretas: [{id, time, vida, max, nivel, viva, alvo?, obra?}]   as oito torres (1400 de
//         HP no nível 1, alcance de 560 m, míssil teleguiado)
//         sentinela da lane (server/torretas.js; posição em TORRETAS de shared/terrain.js):
//         vida e max em HP, nivel = nível do time dono (1 a 3), viva = de pé e
//         sólida (false: o cliente a tira da física com definirObstaculoAtivo);
//         alvo = id na mira (só se mira alguém); obra = reconstrução paga
//         esperando o lugar ficar livre
//   minas: [{id, dono, time, kind, nv, p, campo?, atq?, raio, x, y, z, armada}]   minas e
//         campos no chão (time de quem soltou; kind/nv/p = a arma, a versão e a
//         profundidade do golpe, para o desenho; campo = área que fere a cada
//         intervalo; raio = gatilho da mina ou área do campo; armada = já age;
//         atq = ataque de monstro, ver "Ataques de monstro" abaixo)
//   guiados: [{id, kind, nv, p, atq?, x, y, z, vx, vy, vz, dx?, dz?, esp?}]   teleguiados
//         em voo: o cliente não prevê a curva e corrige o desenho por aqui (dx, dz, esp:
//         o rumo e a velocidade própria do tiro que anda a curva do original)
//   st: {cego?, invisivel?, revelado?, invulneravel?, escudo?, converte?, regen?,
//         fraco?, vulneravel?, recuo?, curaTempo?, resiste_<tipo>?}   estados das
//         armas no próprio jogador que só o servidor conta (s restantes; invisivel
//         -1 = segurando a camuflagem): o HUD avisa, e cego esconde os inimigos do
//         minimapa e dos rótulos
//   ents: [{id, nome, tipo, drone, vivo, race, x, y, z, yaw, roll, hp, maxHp, boost, pousado,
//           dreno, lento, emp, fx?, time?, carga?, minerando?, descarga?, nivel?, classe?, tier?,
//           arm?, esc?, res?, recall?, bn?, nucleo?, esp?}]
//         bn = bônus de nave ativos do jogador ('ataque' | 'suporte' | 'sonda');
//         nucleo = 1 no minerador da onda do Núcleo (maior, mais lento, carga 50);
//         descarga = 1 no minerador parado em cima de uma vaga da bacia da base
//         (VAGAS_BACIA), despejando o minério (só enquanto despeja; a entrega
//         sai no fim);
//         esc = fração (0 a 1) do escudo do equipamento, só em jogador com escudo;
//         res = [Ph., Op., El.] resistências do jogador (0 a 0,99, com as das armas
//         de dispositivo e já sem o que a
//         quebra tira; quatro casas), só com alguma: a cor do nick (o `me` traz o mesmo `res`,
//         que a coluna Resist. do STATUS e do INVENTÁRIO mostra; null = nenhuma);
//         fx = efeitos de arma visíveis ('para' (movimento paralisado), 'semTiro' (só o
//         tiro impedido), 'desg', 'energia', 'descarga' (a
//         energia descarregada, o ícone fica a duração do original), 'magma' (o dreno
//         de HP do original), 'resist' (todas as resistências quebradas), 'invul',
//         'escudo', 'fraco', 'recuo' (o dano devolvido do Canhão de Recuo), 'regen'
//         (conserto de HP com tempo), 'escudoRec' (o
//         reparo do escudo: os quanta do original), 'reforco' (o Reforço de Escudo
//         ligado: o 2163004 do original na nave), 'imovel' (o Reparador de Escudo
//         Shrewdo seguro, que prende a nave: o cross007 em cima dela), 'converte' (o conversor de
//         impacto), 'resEl', 'resOp' e 'resFis' (a resistência elétrica, a óptica
//         e a física dos dispositivos), 'acel', 'amplif' (o Amplificador de Energia
//         ligado: as faíscas do original), 'inv' (camuflagem ligada, mesmo
//         revelada: quem a vê desenha a nave translúcida)); arm = [arma do Z, arma do X]
//         dos jogadores (o modelo pendurado em cada asa). Jogador camuflado do outro
//         time não vem na lista (salvo a INVISIVEL_VISTO_M da sua nave ou logo
//         depois de atirar);
//         tipo = 'jogador' | 'monstro' | 'minerador' | 'escolta' | 'suporte' | 'nucleo' (o que
//         desenhar; o Núcleo de He-3 é uma entidade parada no poço de cima, neutra,
//         com hp/maxHp, só enquanto vivo; 'suporte' é a torre do buff de suporte acesa,
//         neutra e parada, com hp/maxHp: o modelo é do cenário, o cliente só põe o
//         rótulo); obj = o id do objetivo na torre de suporte (BS0/BS1) e no SN-4
//         (BA0/BA1); monstro (server/jungle.js, só vivo) traz
//         esp = 'sn3' | 'snzero' | 'xerxes' | 'great_xerxes' | 'bazit' | 'anti' |
//         'sn4' | 'medusa' | 'sonda' (o modelo: public/modelos/monstros/<esp>.glb;
//         nome = nome na tela, sem time); drone = inimigo do PvE; time em jogadores,
//         mineradores e escoltas; carga, minerando e descarga só nos mineradores; nivel, classe
//         e tier só nos jogadores (raça + classe + tier = o modelo da nave); recall
//         (0 a 1) só em quem está canalizando a volta à base
//   ev:   {e:'tiro'|'acerto'|'fim'|'renasceu'|'saiu', ...}
//         {e:'tiro', id, dono, kind, nv, p, x, y, z, vx, vy, vz, vida, enc?, dx?, dz?, esp?}
//                                    projétil de arma (nv = versão, p = profundidade do
//                                    golpe: 0 o disparo, 1+ subprojétil; enc = encaixe de
//                                    onde saiu, para o desenho sair da boca da arma;
//                                    dx, dz, esp no que anda a curva do original, a
//                                    `curva` do golpe: o rumo unitário e a velocidade
//                                    própria de saída, e o cliente anda a mesma curva no
//                                    stepBullet, com a herança da nave tirada de vx/vz)
//         {e:'fim', bala, x, y, z, campo?}   o projétil acabou sem acertar (vida, rocha,
//                                    construção); campo = time dono quando ele bateu
//                                    no campo de força da base desse time (x, z no
//                                    plano, CAMPO_RECUO antes dele: o cliente pisca
//                                    o campo ali). Nenhum tiro atravessa esse campo
//         {e:'rebatido', bala, kind, dono, time, x, y, z, vx, vy, vz, dx?, dz?, esp?}   o
//                                    Rebatedor de Projéteis virou o tiro: sai do centro
//                                    dele para fora (o rumo do original), agora de
//                                    `dono`; o cliente põe o desenho no ponto e no rumo
//                                    novos (o de curva perde a herança da nave)
//         {e:'entrou', id, nome, time}
//         {e:'morte', id, por, tipo, time?, esp?, x, y, z, ouro?, renasce?, assist?, ouroAssist?,
//          seq?, encerrou?, seqPor?, multi?, primeiro?, motivo?, campo?}   (esp = espécie, na morte de monstro)
//                                    motivo = 'campo' (com campo = time dono): nave de
//                                    jogador que encostou no campo de força da base
//                                    do outro time (CAMPOS_BASE), destruída na hora;
//                                    por = null, sem ouro, XP, abate nem assistência
//                                    ouro = ouro que o matador (jogador) ganhou, bônus
//                                    incluso; em morte de jogador: renasce = s até
//                                    renascer; assist = ids dos aliados do matador que
//                                    feriram a vítima na janela, ouroAssist = ouro de
//                                    cada um; seq = sequência da vítima encerrada e
//                                    encerrou = bônus de ouro (só com seq >= 2);
//                                    seqPor = sequência do matador com este abate;
//                                    os anúncios do locutor (public/js/locutor-regras.js):
//                                    multi = abates de jogador do matador com até
//                                    MULTI_JANELA_S entre um e outro (só com 2 ou mais) e
//                                    primeiro = 1 no primeiro abate de jogador da
//                                    partida (First Blood; a preparação conta)
//         Ataques de monstro (server/especies.js): os eventos 'tiro', 'acerto',
//                                    'explosao' e 'nova', as `minas` e os `guiados`
//                                    de um golpe de monstro trazem atq =
//                                    'disco_voador' (SN-3, 3 discos em leque que
//                                    atravessam), 'missil_descarga' (SN-3, 2
//                                    teleguiados que descarregam a energia),
//                                    'canhao_sn6' (SN-Zero VI, 2 disparos de 2 balas
//                                    com área), 'armadilha_sn6' (SN-Zero VI, mina
//                                    embaixo do alvo), 'lanca_chamas' e
//                                    'lanca_chamas_g' (Xerxes e Grande Xerxes, rajada
//                                    de 8 bolas de fogo que atravessam e deixam o
//                                    Magma), 'canhao_explosivo' (Xerxes, 2 balas com
//                                    área), 'feixe_optico_bazit' (Bazit, 3 feixes em
//                                    leque de 5°), 'missil_longo' (Anti, 4 mísseis
//                                    lado a lado), 'canhao_teleguiado' (Anti, 2 balas
//                                    teleguiadas com área), 'missil_cruzador' (SN-4,
//                                    10 teleguiados em volta), 'onda_feixe' (SN-4,
//                                    nova), 'campo_eletrico' (SN-4, campo de 20 s
//                                    embaixo do alvo que quebra as resistências),
//                                    'armadilha_paralisante' (Medusa, 8 cargas em
//                                    volta que viram minas de 30 s; a mina solta um
//                                    teleguiado que impede o tiro), 'disparo_controle'
//                                    (Medusa, leque de 10 com área, desgoverno),
//                                    'canhao_pedra' (Medusa, 2 pedras que atravessam);
//                                    kind = a arma de NPC do original ('n511080'... em
//                                    WEAPONS: o cliente desenha com os efeitos do
//                                    original)
//         {e:'tiro', ..., fonte, time, guiado?, alvo?, vida?}   tiro de torreta (fonte
//                                    'torreta', dono = id dela; míssil teleguiado:
//                                    guiado true, alvo = id travado, vai também em
//                                    `guiados`) ou de escolta (fonte 'escolta'): cor do time
//         {e:'acerto', ..., torre}   tiro que bateu numa torre de suporte apagada, ou a carga
//                                    que não fere (alvo 0, dano 0); acesa, a torre leva o
//                                    'acerto' de sempre, com alvo = o id da entidade dela
//         {e:'reflexo', id, x, y, z, dano, alvos:[{id, x, y, z}]}   o Núcleo de He-3
//                                    devolveu o dano que levou (id = o Núcleo; dano =
//                                    o pedaço de cada nave, antes do escudo dela;
//                                    alvos = as naves que dividiram, as que o time de
//                                    quem recebe não vê ficam de fora, server/visao.js)
//         {e:'acerto', kind:'reflexo', alvo, dano, x, y, z}   o reflexo do Núcleo pegou a nave
//         {e:'bonusNave', id, nome, s}   o jogador id ganhou o bônus de nave `nome`
//                                    ('ataque' | 'suporte' | 'sonda') por s segundos
//         {e:'ondaNucleo', time, ids}   saíram da base os mineradores do Núcleo
//         {e:'acerto', ..., torreta}   tiro ou área que bateu numa torreta (alvo 0;
//                                    dano 0 se não foi de jogador inimigo)
//         {e:'torreta', id, time, estado, por, nome, x, y, z}   estado 'destruida' (por =
//                                    quem deu o último tiro) ou 'reconstruida' (por =
//                                    quem pagou)
//         {e:'acerto', kind, nv?, p?, alvo, dano, x, y, z, bala?, escudo?, crit?}   golpe
//                                    de arma num alvo (um por alvo; nv e p = a versão e
//                                    o golpe da arma, o impacto do original de cada um;
//                                    bala = o tiro que bateu
//                                    direto; dano = o total, escudo + HP; escudo = a
//                                    parte que o escudo do equipamento segurou; crit =
//                                    golpe crítico, dano dobrado; com crit vem também
//                                    por = id de quem bateu, que sempre recebe o evento)
//         {e:'miss', para, id, kind}   PRIVADO: o debuff da arma elétrica de bloqueio
//                                    ou suporte não pegou no jogador `para` (a chance do
//                                    original pelo poder El. de quem atirou e a
//                                    resistência El. dele; o dano entrou): o "MISS"
//         {e:'debuff', para, ef, v?, dur?}   PRIVADO (só o jogador `para` recebe): o
//                                    debuff que ele levou, a mensagem do original
//                                    (CChatList::AddCollisionMsg): ef = 'magma',
//                                    'resist', 'descarga', 'semTiro', 'lento', 'imovel',
//                                    'paralisa', 'trava', 'cadencia', 'fraco',
//                                    'vulnFisico', 'vulnLaser', 'revela', 'cego',
//                                    'desgoverno', 'drenoDuplo', 'drenoEn', 'semRegen',
//                                    'enCara', 'recuo'; v = o número do texto, dur em s
//         {e:'ganho', para, id, esp, x, y, z, ouro, xp, crit?}   PRIVADO (só o jogador
//                                    `para` recebe): o ouro e o XP que ele ganhou ao
//                                    abater o monstro id (espécie esp) no lugar x, y, z
//                                    (a Medusa conta o que ela paga a ele); xp = 0 no
//                                    nível máximo; crit = o golpe final foi crítico.
//                                    O cliente faz os números subirem do lugar
//         {e:'resumoMorte', para, janela, por, fontes, tipos, total}   PRIVADO (só o
//                                    jogador `para`, que acabou de morrer; logo depois
//                                    do 'morte'): o resumo da morte, como no Dota 2
//                                    (server/resumo-morte.js). janela = os s somados
//                                    (RESUMO_MORTE_S); por = quem deu o golpe final
//                                    ({id, nome, tipo, esp?, time?, nivel?, ia?}; tipo
//                                    'campo' no campo de força da base; null sem autor);
//                                    fontes = quem feriu na janela, a que mais tirou
//                                    primeiro ({...a fonte, total, fisico, laser,
//                                    eletrico, outro}); tipos = {fisico, laser,
//                                    eletrico, outro}; total; tudo em inteiros, o dano
//                                    que entrou (escudo + HP)
//         {e:'explosao', arma, nv, p, dono, time, x, y, z, raio, mina?, expirou?}   área de um
//                                    golpe (impacto com área, fim da vida, mina; raio
//                                    0 = mina que atirou e sumiu (a que espera
//                                    inimigo perto atira só no mais perto e, se a
//                                    vida acaba antes, some sem evento); expirou = a mina
//                                    explodiu porque a vida acabou, não porque pisaram)
//         {e:'nova', id, dono, time, kind, nv, p, x, y, z, raio, vel}   esfera que
//                                    cresce parada no ponto a vel m/s até raio
//         {e:'efeito', id, kind, nv, time, x, y, z, ox?, oy?, oz?}   dispositivo
//                                    ligado na nave id (camuflagem, escudo, teleporte...);
//                                    o teleporte traz de onde a nave saltou (ox, oy, oz)
//         {e:'cura', id, por, kind?, hp, x, y, z}   aliado curado por arma de suporte
//         {e:'apoio', kind, nv, p, alvo, por, time, x, y, z, bala?}   a nova, o tiro ou
//                                    a área de suporte pegou o aliado `alvo` (o impacto
//                                    do original no casco); bala = o tiro que o pegou
//                                    direto (o 'fim' dele vem logo depois)
//         {e:'desarmou', id, x, y, z}   mina destruída pela Nova Desarmadora
//         {e:'nivel', id, nivel}     jogador subiu de nível
//         {e:'nave', id, nome, time, tier, nave}   jogador comprou a próxima nave da
//                                    linha na Evolução (nave = nome dela): todos trocam
//                                    o modelo (o snapshot também traz o tier)
//         {e:'melhoria', id, nome, time, melhoria, nivel}   alguém do time `time` comprou
//                                    um nível de melhoria dos mineradores (ou das
//                                    torretas: melhoria 'torretas')
//         {e:'objetivo', id, acao, time, quem, por?, motivo?, ouro?, ouroPouso?, x?, z?}
//                                    acao 'apareceu' (o Núcleo traz o nivel) | 'tomado' (torre de suporte ou
//                                    Núcleo; time e quem = nome de quem deu o golpe
//                                    final, por = id) | 'coletou' (plataforma: ouro =
//                                    de cada piloto do time, ouroPouso = a mais para
//                                    quem estava pousado) | 'cancelou' (plataforma:
//                                    motivo 'saiu' | 'dano'). Da jungle (id BA0, BA1,
//                                    SONDA, MEDUSA): 'apareceu' (x, z) e 'tomado'
//                                    (time, quem, por = quem deu o golpe final)
//         {e:'entrega', id, time, carga, x, y, z, nucleo?}   minerador terminou de
//                                    despejar na bacia da base (x, z em cima da vaga)
//                                    e somou a carga no placar (carga = o que entrou,
//                                    já dobrado na fase final; nucleo = 1 no da onda
//                                    do Núcleo)
//         {e:'faseFinal', mult, restante}   começou a fase final (minério × mult)
//         {e:'preparacao', n, s}   abriu a partida n (placar zerado) na preparação: começa em s
//         {e:'partida', n}   começou a partida n (acabou a preparação: os 20 minutos)
//         {e:'fimPartida', vencedor, placar}
//         {e:'teleporte', id, alvo, time, x, y, z}   a nave id saltou para junto do
//                                    companheiro alvo (Functional), chegando em x/y/z
//                                    ({t:'teleportar'}); o seu time sempre recebe, o
//                                    outro só se enxerga a chegada (sem a origem). O
//                                    cliente de quem saltou corta a suavização
//         {e:'recall', id, estado, motivo?, s?, de?, x?, y?, z?, partida?}   volta à base:
//                                    estado 'inicio' (s = segundos de canalização) |
//                                    'recusado' | 'cancelado' (motivo 'na_base' |
//                                    'tiro' | 'boost' | 'velocidade' | 'dano' |
//                                    'cancelou' | 'teleporte') | 'chegou' (de = de onde saiu,
//                                    x/y/z = onde apareceu na base; partida: 1 quando
//                                    foi o fim da preparação, que leva toda nave viva à
//                                    base do time e renasce lá a morta, junto com o
//                                    'partida')

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import { randomUUID } from 'node:crypto';
import { World, TICK_HZ } from './game.js';
import { MundoLocal, MundoEmWorker, PEDIDOS_MUNDO, iniciarLaco, temFolga, nucleosDisponiveis, memoriaDisponivelMb } from './mundos.js';
import { prepararBots } from './bots.js';
import { prepararJungle } from './jungle.js';
import { Filas, MODOS_FILA } from './filas.js';
import { MAX_POR_TIME } from './partida.js';
import { motivoRacaRecusada } from '../shared/naves.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PASTAS = {
  '/shared/': path.join(RAIZ, 'shared'),
  // Antes de '/vendor/': o primeiro prefixo que bate é o que vale.
  '/vendor/addons/': path.join(RAIZ, 'node_modules', 'three', 'examples', 'jsm'),
  '/vendor/': path.join(RAIZ, 'node_modules', 'three', 'build'),
  '/': path.join(RAIZ, 'public'),
};
const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.glb': 'model/gltf-binary',
  '.wasm': 'application/wasm',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
};
const MAX_MSG = 2048;
// Partidas (server/mundos.js): no servidor de verdade cada uma roda numa worker
// thread (um núcleo dela), e só abre partida nova com folga de processador e de
// memória (temFolga). Os tetos abaixo são de segurança, não a capacidade.
// Modo de teste: cada piloto que entra com {teste: true} ganha um mundo só dele
// (World com teste: true: partida sem relógio e pedidos de ouro/XP).
const MAX_MUNDOS_TESTE = 8;
// Partida Privada com Bots: cada piloto que entra com {privada: true} ganha uma
// partida só dele com os computadores (ninguém de fora cai nela).
const MAX_MUNDOS_PRIVADOS = 16;
// Todas as partidas juntas (teste, privada e salas das filas online).
const MAX_MUNDOS = 64;
// Vaga reservada da sala: o piloto tem RESERVA_S para entrar no mundo (a tela de
// carregamento baixa tudo antes). Passou disso, um computador fica com a vaga, para
// o time não jogar com um a menos.
const RESERVA_S = 120;
// De quanto em quanto tempo (ms) o relógio das filas olha os contadores das salas e
// as reservas vencidas.
const PASSO_FILAS_MS = 250;
// Mensagens da fila (antes do {t:'entrar'}): server/filas.js.
const PEDIDOS_FILA = new Set(['filas', 'entrarFila', 'escolha', 'trocarTime', 'pronto', 'cancelarPronto', 'sairFila']);

async function servirArquivo(req, res) {
  const url = new URL(req.url, 'http://x');
  let rota = decodeURIComponent(url.pathname);
  if (rota === '/') rota = '/index.html';
  for (const [prefixo, pasta] of Object.entries(PASTAS)) {
    if (!rota.startsWith(prefixo)) continue;
    const arquivo = path.join(pasta, rota.slice(prefixo.length));
    // Nada de "../": o arquivo tem que ficar dentro da pasta mapeada.
    if (!arquivo.startsWith(pasta + path.sep)) break;
    try {
      const dados = await readFile(arquivo);
      res.writeHead(200, {
        'content-type': TIPOS[path.extname(arquivo)] ?? 'application/octet-stream',
        'cache-control': 'no-cache',
      });
      res.end(dados);
      return;
    } catch {
      break;
    }
  }
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('não encontrado');
}

/**
 * Sobe o servidor. Retorna { server, world, mundos, filas, porta, fechar } para os
 * testes. `workers`: as partidas novas (teste, privada, salas) rodam cada uma numa
 * worker thread (o servidor de verdade); sem isso, na mesma linha (os testes, que
 * mexem no World direto). O `world` (quem entra sem modo) roda sempre aqui.
 * @param {{ porta?: number, world?: World, workers?: boolean }} [opcoes]
 */
export async function iniciar({ porta = Number(process.env.PORT) || 5090, world = new World(), workers = false } = {}) {
  // As grades de navegação dos computadores e dos monstros e os mapas de perigo das
  // torres são por processo e custavam ~250 ms na primeira partida (um tranco no
  // ping de todo mundo): montados aqui, antes de abrir a porta (cada worker monta as
  // dele ao nascer, fora desta linha).
  prepararBots();
  prepararJungle();
  const nucleos = nucleosDisponiveis();
  const memoriaMb = memoriaDisponivelMb();

  // Partidas rodando: a principal (o `world`) e as que nascem (teste, privada, salas
  // da fila online), cada uma com os sockets dos seus jogadores (os ids de jogador
  // são por partida). As que nascem levam `modo` ('teste', 'privada', 'online' ou
  // 'publica') e somem quando o último jogador de gente sai.
  const principal = new MundoLocal(world);
  const mundos = new Map(); // MundoLocal | MundoEmWorker -> (id do jogador -> ws)
  /** Liga a partida ao servidor: o que ela manda vai ao socket de cada jogador. */
  const registrar = (mundo) => {
    const sockets = new Map();
    mundos.set(mundo, sockets);
    mundo.aoMensagens = (lista) => {
      for (const [id, texto] of lista) {
        const ws = sockets.get(id);
        // Sem socket (o jogador ainda não ligou ou já saiu), a mensagem cai fora.
        if (ws && ws.readyState === ws.OPEN) ws.send(texto);
      }
    };
    mundo.aoFalhar = () => {
      // O worker caiu: fecha as conexões (o cliente volta ao menu com o erro).
      for (const ws of sockets.values()) ws.close(1011, 'partida caiu');
      sockets.clear();
      for (const [token, r] of reservas) if (r.mundo === mundo) reservas.delete(token);
      mundos.delete(mundo);
      filas.avisarContagem();
    };
    return mundo;
  };
  registrar(principal);
  const novoMundo = ({ modo, sala = null, teste = false }) =>
    registrar(workers ? new MundoEmWorker({ modo, sala, teste }) : new MundoLocal(new World({ teste }), { modo, sala }));
  const contar = (modo) => [...mundos.keys()].filter((m) => m.modo === modo).length;
  const humanosEm = (mundo) => mundos.get(mundo)?.size ?? 0;
  /** Cabe mais uma partida (teto de segurança, processador e memória)? */
  const folga = () =>
    mundos.size - 1 < MAX_MUNDOS &&
    temFolga({ cargas: [...mundos.keys()].filter((m) => m !== principal).map((m) => m.carga), nucleos, memoriaMb, usadaMb: process.memoryUsage().rss / 2 ** 20 });
  // Vagas das salas que começaram: token -> { mundo, nome, race, classe, time, iaMeu, iaInimigo, expira }.
  const reservas = new Map();

  const server = http.createServer((req, res) => {
    if (req.url === '/healthz') {
      const partidas = [...mundos.keys()].filter((m) => m !== principal);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          ok: true,
          jogadores: [...mundos.values()].reduce((s, m) => s + m.size, 0), // pilotos de gente conectados
          partidas: partidas.length,
          carga: +partidas.reduce((s, m) => s + m.carga, 0).toFixed(2),
          nucleos,
          memoriaMb: Math.round(process.memoryUsage().rss / 2 ** 20),
          folga: folga(),
          filas: filas.contagem(),
        }),
      );
      return;
    }
    servirArquivo(req, res).catch(() => {
      res.writeHead(500);
      res.end();
    });
  });

  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: MAX_MSG });

  const filas = new Filas({
    enviar: (ws, msg) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
    },
    novoToken: () => randomUUID(),
    podeAbrirSala: folga,
    jogando: () => {
      const n = {};
      for (const m of mundos.keys()) if (Object.hasOwn(MODOS_FILA, m.modo ?? '')) n[m.modo] = (n[m.modo] ?? 0) + humanosEm(m);
      return n;
    },
    aoComecar: (sala) => {
      // A sala da fila vira uma partida nova; cada piloto tem a vaga dele reservada no
      // time que a sala sorteou, com a nave travada na seleção.
      const mundo = novoMundo({ modo: sala.modo, sala: sala.id });
      const expira = Date.now() + RESERVA_S * 1000;
      // Na pública, o time dos humanos que começou com menos de 3 (Pronto com 2 na
      // fila) completa com computador; o outro time é todo de computadores.
      const bots = MODOS_FILA[sala.modo]?.bots;
      for (const m of sala.membros) {
        const iaMeu = bots ? MAX_POR_TIME - sala.membros.filter((x) => x.time === m.time).length : 0;
        reservas.set(m.token, { mundo, nome: m.nome, race: m.race, classe: m.classe, time: m.time, iaMeu, iaInimigo: bots ? MAX_POR_TIME : 0, expira });
      }
    },
  });

  /** Some com a partida que não é a principal quando não há mais gente nem vaga reservada. */
  const limparMundo = (mundo) => {
    if (mundo === principal || !mundos.has(mundo) || humanosEm(mundo) > 0) return;
    for (const r of reservas.values()) if (r.mundo === mundo) return;
    mundos.delete(mundo);
    mundo.fechar();
  };

  wss.on('connection', (ws) => {
    let jogador = null; // { id, time }
    let mundo = null;
    let entrando = false;
    let fechou = false;
    let naFila = false; // a conexão é do menu (filas), não de um jogo
    ws.on('message', async (bruto) => {
      let msg;
      try {
        msg = JSON.parse(bruto);
      } catch {
        return;
      }
      if (PEDIDOS_FILA.has(msg?.t) && !jogador && !entrando) {
        // Filas online (server/filas.js): o menu observa a contagem, entra na fila,
        // escolhe a nave, aperta Pronto e sai. Tudo em tempo real.
        naFila = true;
        let codigo = null;
        if (msg.t === 'filas') filas.observar(ws);
        else if (msg.t === 'entrarFila') {
          const recusa = motivoRacaRecusada(msg.race);
          codigo = recusa ?? filas.entrar(ws, msg);
        } else if (msg.t === 'escolha') codigo = filas.escolher(ws, msg);
        else if (msg.t === 'trocarTime') codigo = filas.trocarTime(ws);
        else if (msg.t === 'pronto') codigo = filas.pronto(ws, msg);
        else if (msg.t === 'cancelarPronto') codigo = filas.cancelarPronto(ws);
        else if (msg.t === 'sairFila') filas.sair(ws);
        if (codigo) ws.send(JSON.stringify({ t: 'resultado', acao: msg.t, ok: false, codigo }));
      } else if (msg?.t === 'entrar' && !jogador && !entrando) {
        // A conexão do menu não vira jogo: o jogo abre uma conexão própria.
        if (naFila) return;
        entrando = true;
        const recusar = (codigo) => {
          ws.send(JSON.stringify({ t: 'erro', codigo }));
          ws.close();
        };
        let alvo;
        let pedido;
        if (msg.sala !== undefined || msg.token !== undefined) {
          // Vaga da sala da fila online: o servidor decide nome, nave e time.
          const r = typeof msg.token === 'string' ? reservas.get(msg.token) : null;
          if (!r || !mundos.has(r.mundo)) return recusar('sala_invalida');
          reservas.delete(msg.token);
          alvo = r.mundo;
          // Na pública, o outro time é dos computadores (os três entram com o primeiro
          // humano) e, se a sala começou com 2, um computador completa o time deles.
          pedido = { nome: r.nome, race: r.race, classe: r.classe, pedido: { time: r.time, iaMeu: r.iaMeu, iaInimigo: r.iaInimigo } };
        } else {
          // Raça sem naves (Mechan, "em breve") ou que não existe: recusa com código.
          const recusa = motivoRacaRecusada(msg.race);
          if (recusa) return recusar(recusa);
          if (msg.teste === true) {
            if (contar('teste') >= MAX_MUNDOS_TESTE || !folga()) return recusar('teste_cheio');
            alvo = novoMundo({ modo: 'teste', teste: true });
          } else if (msg.privada === true) {
            if (contar('privada') >= MAX_MUNDOS_PRIVADOS || !folga()) return recusar('privada_cheia');
            alvo = novoMundo({ modo: 'privada' });
          } else alvo = principal;
          // Os computadores da tela inicial vêm junto; o World sanea e completa os times.
          pedido = { nome: msg.nome, race: msg.race, classe: msg.classe, pedido: { iaMeu: msg.iaMeu, iaInimigo: msg.iaInimigo } };
        }
        const r = await alvo.entrar(pedido);
        entrando = false;
        if (r.codigo) {
          limparMundo(alvo);
          // Os dois times cheios: código estável que o cliente traduz na tela de entrada.
          return recusar(r.codigo === 'partida_cheia' && pedido.pedido.time !== undefined ? 'sala_invalida' : r.codigo);
        }
        if (fechou || !mundos.has(alvo)) {
          // Fechou a aba enquanto entrava: a nave sai na hora.
          alvo.sair(r.id);
          limparMundo(alvo);
          return;
        }
        mundo = alvo;
        jogador = r;
        mundos.get(mundo).set(jogador.id, ws);
        ws.send(JSON.stringify({ t: 'bemvindo', id: jogador.id, tickHz: TICK_HZ, time: jogador.time, teste: mundo.teste, modo: mundo.modo ?? 'partida' }));
        filas.avisarContagem();
      } else if (msg?.t === 'in' && jogador) {
        mundo.comando(jogador.id, msg);
      } else if (PEDIDOS_MUNDO.has(msg?.t) && jogador) {
        // Loja, Evolução, pontos, equipamento, teleporte e teste: a partida valida
        // tudo e responde só a quem pediu.
        mundo.pedido(jogador.id, msg);
      } else if (msg?.t === 'ia' && jogador) {
        // Computador só se escolhe na entrada: dentro da partida a janela Times é consulta.
        const item = typeof msg.acao === 'string' ? msg.acao.slice(0, 16) : '';
        ws.send(JSON.stringify({ t: 'resultado', acao: 'ia', item, ok: false, codigo: 'invalido' }));
      } else if (msg?.t === 'ping') {
        // O pong sai daqui, da linha das conexões: as partidas pesadas rodam nos workers.
        ws.send(JSON.stringify({ t: 'pong', c: msg.c }));
      }
    });
    ws.on('close', () => {
      fechou = true;
      if (naFila) filas.esquecer(ws);
      if (!jogador) return;
      mundos.get(mundo)?.delete(jogador.id);
      // Saiu alguém de uma partida online no meio: um computador fica com a vaga.
      mundo.sair(jogador.id, { substituir: Object.hasOwn(MODOS_FILA, mundo.modo ?? '') });
      limparMundo(mundo);
      filas.avisarContagem();
    });
  });

  // Relógio das filas: contadores das salas e vagas reservadas que ninguém usou.
  const relogioFilas = setInterval(() => {
    filas.passo();
    const agora = Date.now();
    for (const [token, r] of reservas) {
      if (agora < r.expira) continue;
      reservas.delete(token);
      r.mundo.vagaParaBot(r.time);
      limparMundo(r.mundo);
    }
  }, PASSO_FILAS_MS);

  // As partidas desta linha (a principal e, sem workers, todas): passo fixo de 1/30 s.
  const pararLaco = iniciarLaco(() => {
    for (const m of mundos.keys()) m.passo();
  });

  await new Promise((ok) => server.listen(porta, ok));
  return {
    server,
    world,
    mundos,
    filas,
    porta: server.address().port,
    fechar: () =>
      new Promise((ok) => {
        pararLaco();
        clearInterval(relogioFilas);
        for (const m of mundos.keys()) m.fechar();
        for (const c of wss.clients) c.terminate();
        wss.close();
        server.close(ok);
      }),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // No servidor de verdade cada partida roda num núcleo (worker thread).
  const { porta } = await iniciar({ workers: true });
  console.log(`New AstroN no ar: http://localhost:${porta} (${nucleosDisponiveis()} núcleos)`);
}
