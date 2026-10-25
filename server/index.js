// Servidor do New AstroN: um processo Node só, que serve os arquivos do jogo (HTTP)
// e roda o mundo em tempo real (WebSocket em /ws).
//
// Sem Express e sem build: o cliente é ES module puro carregado direto do navegador,
// e o Three.js vem do próprio node_modules em /vendor/ (versão travada no
// package.json, sem depender de CDN no ar), com os addons (GLTFLoader, que lê o
// modelo da nave em public/modelos/) em /vendor/addons/.
//
// Protocolo (JSON):
//   cliente → servidor  {t:'entrar', nome, race, classe, teste?, iaMeu?, iaInimigo?}
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
//                        (+100), 'nivel' (sobe um), 'nivelMax' (vai ao 25); resposta
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
//   servidor → cliente  {t:'bemvindo', id, tickHz, time, teste}   time = 0 (base de baixo) ou 1
//                       {t:'erro', codigo}   codigo 'partida_cheia' (3 em cada time),
//                        'raca_bloqueada' ou 'raca_invalida'; fecha
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
//         nela, compra + evoluções; fabrica: true nas duas armas de fábrica, que
//         não se vendem; até 2 instâncias da mesma arma), compMax = tamanho do
//         compartimento (12: o que está em inv e não na nave, as instâncias de arma
//         fora de me.encInst inclusive), equipado =
//         {escudo, armadura, pot: [a, b]} (id de instância ou null) o que está na nave,
//         escudo / maxEscudo / regenEscudo (por s) = escudo do equipamento (o
//         servidor conta; recupera depois de 3 s sem dano, enche pousado na base e
//         ao renascer), status = o statusDoPiloto já somado (shared/status.js:
//         {hpExtra, maxEscudo, regenEscudo, enExtra, regenEnExtra, regenHpExtra,
//         poder, recarga, resist, penetra: {fisico, laser, eletrico}, critico,
//         velMult, acelMult}), e lidos no stepShip da predição: velMult e acelMult
//         (multiplicadores de velocidade máxima e aceleração) e recargaMult =
//         {fisico, laser, eletrico} (multiplicador da recarga da arma daquele tipo
//         de dano); regenEn, regenHpVoo e regenHpPousada já somam os extras
//   melhorias: {quantidade, durabilidade, defesa, velocidade}   níveis comprados
//         das melhorias dos mineradores do time de quem recebe (zeram a cada partida)
//   jogadores: [{id, nome, time, nivel, ia?, abates, abatesJog, mortes, vivo}]   todos os
//         jogadores da partida, humanos e computadores (ia: true), para a janela de
//         times (só consulta) e a barra do time no alto da tela; abates conta tudo o
//         que o piloto derrubou (monstro, minerador...), abatesJog só os jogadores do
//         outro time (zera na partida nova). Lista pública: sem HP, posição nem nave.
//         A barra do time tira a vida (hp/maxHp), a raça, a classe e o tier dos
//         ALIADOS das `ents`, onde o próprio time sempre vem (vivo ou morto); a vida
//         de inimigo só chega por lá quando o time o enxerga, como antes
//   partida: {n, estado, fase, restante, inicioEm, semTempo, placar:[t0, t1], vencedor, novaEm}
//            (semTempo: modo de teste, a partida não acaba e restante vem 0)
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
//         'tomado' (o Núcleo depois da última aparição); volta = s até aparecer ou
//         voltar (em 'espera' e 'recarga'); time = time de quem tomou por último (ou
//         null). Torre de suporte (BS0/BS1): vida (0 a 1); em 'recarga' está caída e
//         o cliente a tira da física (definirObstaculoAtivo(id, false)); de pé em
//         'espera' e 'ativo' (em 'espera' não aceita dano). Plataforma (P0/P1): prog
//         (s pousado do time que está coletando), quem (esse time, ou null),
//         contestado? (os dois times pousados: trava); o feixe de luz acende com
//         quem != null. Núcleo: vida (0 a 1, ativo), aparicao (quantas vezes já
//         apareceu: 0, 1 ou 2). Da jungle (BA0/BA1 = SN-4 do buff de ataque, SONDA,
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
//   guiados: [{id, kind, nv, p, atq?, x, y, z, vx, vy, vz}]   teleguiados em voo: o
//         cliente não prevê a curva e corrige o desenho por aqui
//   st: {cego?, invisivel?, revelado?, invulneravel?, escudo?, converte?, regen?,
//         fraco?, vulneravel?, recuo?, curaTempo?, resiste_<tipo>?}   estados das
//         armas no próprio jogador que só o servidor conta (s restantes; invisivel
//         -1 = segurando a camuflagem): o HUD avisa, e cego esconde os inimigos do
//         minimapa e dos rótulos
//   ents: [{id, nome, tipo, drone, vivo, race, x, y, z, yaw, roll, hp, maxHp, boost, pousado,
//           dreno, lento, emp, fx?, time?, carga?, minerando?, descarga?, nivel?, classe?, tier?,
//           arm?, esc?, recall?, bn?, nucleo?, esp?}]
//         bn = bônus de nave ativos do jogador ('ataque' | 'suporte' | 'sonda');
//         nucleo = 1 no minerador da onda do Núcleo (maior, mais lento, carga 50);
//         descarga = 1 no minerador parado em cima de uma vaga da bacia da base
//         (VAGAS_BACIA), despejando o minério (só enquanto despeja; a entrega
//         sai no fim);
//         esc = fração (0 a 1) do escudo do equipamento, só em jogador com escudo;
//         fx = efeitos de arma visíveis ('para', 'desg', 'energia', 'invul',
//         'escudo', 'fraco', 'regen', 'acel', 'inv'); arm = [arma do Z, arma do X]
//         dos jogadores (o modelo pendurado em cada asa). Jogador camuflado do outro
//         time não vem na lista (salvo a INVISIVEL_VISTO_M da sua nave ou logo
//         depois de atirar);
//         tipo = 'jogador' | 'monstro' | 'minerador' | 'escolta' | 'nucleo' (o que
//         desenhar; o Núcleo de He-3 é uma entidade parada no poço de cima, neutra,
//         com hp/maxHp, só enquanto vivo); monstro (server/jungle.js, só vivo) traz
//         esp = 'sn3' | 'snzero' | 'xerxes' | 'great_xerxes' | 'bazit' | 'anti' |
//         'sn4' | 'medusa' | 'sonda' (o modelo: public/modelos/monstros/<esp>.glb;
//         nome = nome na tela, sem time); drone = inimigo do PvE; time em jogadores,
//         mineradores e escoltas; carga, minerando e descarga só nos mineradores; nivel, classe
//         e tier só nos jogadores (raça + classe + tier = o modelo da nave); recall
//         (0 a 1) só em quem está canalizando a volta à base
//   ev:   {e:'tiro'|'acerto'|'fim'|'renasceu'|'saiu', ...}
//         {e:'tiro', id, dono, kind, nv, p, x, y, z, vx, vy, vz, vida, enc?}   projétil
//                                    de arma (nv = versão, p = profundidade do golpe:
//                                    0 o disparo, 1+ subprojétil; enc = encaixe de
//                                    onde saiu, para o desenho sair da boca da arma)
//         {e:'fim', bala, x, y, z, campo?}   o projétil acabou sem acertar (vida, rocha,
//                                    construção); campo = time dono quando ele bateu
//                                    no campo de força da base desse time (x, z no
//                                    plano, CAMPO_RECUO antes dele: o cliente pisca
//                                    o campo ali). Nenhum tiro atravessa esse campo
//         {e:'entrou', id, nome, time}
//         {e:'morte', id, por, tipo, time?, esp?, x, y, z, ouro?, renasce?, assist?, ouroAssist?,
//          seq?, encerrou?, seqPor?, motivo?, campo?}   (esp = espécie, na morte de monstro)
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
//                                    seqPor = sequência do matador com este abate
//         Ataques de monstro (server/especies.js): os eventos 'tiro', 'acerto',
//                                    'explosao' e 'nova', as `minas` e os `guiados`
//                                    de um golpe de monstro trazem atq =
//                                    'disco_voador' (SN-3, 3 discos em leque que
//                                    atravessam), 'missil_descarga' (SN-3, 2
//                                    teleguiados que descarregam a energia),
//                                    'canhao_sn6' (SN-Zero VI, 2 disparos de 2 balas
//                                    com área), 'armadilha_sn6' (SN-Zero VI, mina
//                                    embaixo do alvo), 'bala_explosiva' (Xerxes, área 10 m), 'chama'
//                                    (Xerxes e Grande Xerxes; só 'acerto', o desenho
//                                    vem no evento 'chama'), 'feixe_optico' (Bazit, 3
//                                    feixes paralelos), 'missil' (Anti, 3 teleguiados de
//                                    curva leve), 'missil_cruzador' (SN-4, 4
//                                    teleguiados), 'onda_feixe' (SN-4, nova de 70 m),
//                                    'campo_eletrico' (SN-4, campo de 20 m no chão,
//                                    lento), 'pedra_gigante' (Medusa, 2 pedras),
//                                    'controle' (Medusa, leque de 10, desgoverno),
//                                    'armadilha' (Medusa, 8 teleguiados lentos, sem
//                                    tiro); kind = 'laser' ou 'plasma' (tiro de NPC)
//                                    ou, no SN-3 e no SN-Zero VI, a arma de NPC do
//                                    original ('n511080', 'n511090', 'n510372',
//                                    'n510373' em WEAPONS: o cliente desenha e toca
//                                    como as armas do jogador)
//         {e:'chama', id, esp, x, y, z, yaw, alcance, abertura, area}   chama em cone
//                                    de um monstro (id): do ponto, no rumo yaw, até
//                                    alcance m, meia-abertura em rad (ou area m do
//                                    eixo, a chama larga do Grande Xerxes)
//         {e:'tiro', ..., fonte, time, guiado?, alvo?, vida?}   tiro de torreta (fonte
//                                    'torreta', dono = id dela; míssil teleguiado:
//                                    guiado true, alvo = id travado, vai também em
//                                    `guiados`) ou de escolta (fonte 'escolta'): cor do time
//         {e:'acerto', ..., torre}   tiro que bateu numa torre de suporte (alvo 0;
//                                    dano 0 se não foi de jogador ou se ela ainda não acendeu)
//         {e:'acerto', kind:'pulso', alvo, dano, x, y, z}   o pulso do Núcleo pegou a nave
//         {e:'pulso', id, x, y, z, raio, forca}   pulso de energia do Núcleo (id = o
//                                    Núcleo; forca de 1, vida cheia, a 2,5, sem vida)
//         {e:'bonusNave', id, nome, s}   o jogador id ganhou o bônus de nave `nome`
//                                    ('ataque' | 'suporte' | 'sonda') por s segundos
//         {e:'ondaNucleo', time, ids}   saíram da base os mineradores do Núcleo
//         {e:'acerto', ..., torreta}   tiro ou área que bateu numa torreta (alvo 0;
//                                    dano 0 se não foi de jogador inimigo)
//         {e:'torreta', id, time, estado, por, nome, x, y, z}   estado 'destruida' (por =
//                                    quem deu o último tiro) ou 'reconstruida' (por =
//                                    quem pagou)
//         {e:'acerto', kind, alvo, dano, x, y, z, bala?, escudo?, crit?}   golpe de arma
//                                    num alvo (um por alvo; bala = o tiro que bateu
//                                    direto; dano = o total, escudo + HP; escudo = a
//                                    parte que o escudo do equipamento segurou; crit =
//                                    golpe crítico, dano dobrado; com crit vem também
//                                    por = id de quem bateu, que sempre recebe o evento)
//         {e:'ganho', para, id, esp, x, y, z, ouro, xp, crit?}   PRIVADO (só o jogador
//                                    `para` recebe): o ouro e o XP que ele ganhou ao
//                                    abater o monstro id (espécie esp) no lugar x, y, z
//                                    (a Medusa conta o que ela paga a ele); xp = 0 no
//                                    nível máximo; crit = o golpe final foi crítico.
//                                    O cliente faz os números subirem do lugar
//         {e:'explosao', arma, nv, p, dono, time, x, y, z, raio, mina?}   área de um
//                                    golpe (impacto com área, fim da vida, mina; raio
//                                    0 = mina que atirou e sumiu)
//         {e:'nova', id, dono, time, kind, nv, p, x, y, z, raio, vel}   esfera que
//                                    cresce parada no ponto a vel m/s até raio
//         {e:'efeito', id, kind, nv, time, x, y, z}   dispositivo ligado na nave id
//                                    (camuflagem, escudo, teleporte...)
//         {e:'cura', id, por, hp, x, y, z}   aliado curado por arma de suporte
//         {e:'desarmou', id, x, y, z}   mina destruída pela Nova Desarmadora
//         {e:'nivel', id, nivel}     jogador subiu de nível
//         {e:'nave', id, nome, time, tier, nave}   jogador comprou a próxima nave da
//                                    linha na Evolução (nave = nome dela): todos trocam
//                                    o modelo (o snapshot também traz o tier)
//         {e:'melhoria', id, nome, time, melhoria, nivel}   alguém do time `time` comprou
//                                    um nível de melhoria dos mineradores (ou das
//                                    torretas: melhoria 'torretas')
//         {e:'objetivo', id, acao, time, quem, por?, motivo?, ouro?, ouroPouso?, x?, z?}
//                                    acao 'apareceu' | 'tomado' (torre de suporte ou
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
import { World, TICK_HZ } from './game.js';
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
// Modo de teste: cada piloto que entra com {teste: true} ganha um mundo só dele
// (World com teste: true: partida sem relógio e pedidos de ouro/XP), para testar a
// progressão da nave sem mexer na partida dos outros. Limite de mundos de teste ao
// mesmo tempo, porque cada um roda a simulação inteira (monstros, mineradores...).
const MAX_MUNDOS_TESTE = 4;
const PEDIDOS = new Set(['comprar', 'evoluir', 'melhorar', 'reconstruir', 'usar', 'pontos', 'equipar', 'vender', 'evoluirItem']); // server/servicos.js

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
 * Sobe o servidor. Retorna { server, world, porta, fechar } para os testes.
 * @param {{ porta?: number, world?: World }} [opcoes]
 */
export async function iniciar({ porta = Number(process.env.PORT) || 5090, world = new World() } = {}) {
  const server = http.createServer((req, res) => {
    if (req.url === '/healthz') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, jogadores: world.players.size, tick: world.tick }));
      return;
    }
    servirArquivo(req, res).catch(() => {
      res.writeHead(500);
      res.end();
    });
  });

  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: MAX_MSG });
  // Mundos rodando: o da partida de verdade e os de teste. Cada um com os sockets
  // dos seus jogadores (os ids de jogador são por mundo).
  const mundos = new Map([[world, new Map()]]); // World -> (id do jogador -> ws)

  wss.on('connection', (ws) => {
    let jogador = null;
    let mundo = world;
    ws.on('message', (bruto) => {
      let msg;
      try {
        msg = JSON.parse(bruto);
      } catch {
        return;
      }
      if (msg?.t === 'entrar' && !jogador) {
        // Raça sem naves (Mechan, "em breve") ou que não existe: recusa com código.
        const recusa = motivoRacaRecusada(msg.race);
        if (recusa) {
          ws.send(JSON.stringify({ t: 'erro', codigo: recusa }));
          ws.close();
          return;
        }
        if (msg.teste === true) {
          const testes = [...mundos.keys()].filter((m) => m.teste).length;
          if (testes >= MAX_MUNDOS_TESTE) {
            ws.send(JSON.stringify({ t: 'erro', codigo: 'teste_cheio' }));
            ws.close();
            return;
          }
          mundo = new World({ teste: true });
          mundos.set(mundo, new Map());
        }
        // Os computadores da tela inicial vêm junto; o World sanea e completa os times.
        jogador = mundo.addPlayer(msg.nome, msg.race, msg.classe, { iaMeu: msg.iaMeu, iaInimigo: msg.iaInimigo });
        if (!jogador) {
          // Os dois times cheios: código estável que o cliente traduz na tela de entrada.
          ws.send(JSON.stringify({ t: 'erro', codigo: 'partida_cheia' }));
          ws.close();
          return;
        }
        mundos.get(mundo).set(jogador.id, ws);
        ws.send(JSON.stringify({ t: 'bemvindo', id: jogador.id, tickHz: TICK_HZ, time: jogador.time, teste: mundo.teste }));
      } else if (msg?.t === 'in' && jogador) {
        mundo.pushInput(jogador.id, msg);
      } else if (PEDIDOS.has(msg?.t) && jogador) {
        // Loja, Evolução, pontos e equipamento: o servidor valida tudo e responde só a quem pediu.
        ws.send(JSON.stringify(mundo.pedido(jogador.id, msg)));
      } else if (msg?.t === 'ia' && jogador) {
        // Computador só se escolhe na entrada: dentro da partida a janela Times é consulta.
        const item = typeof msg.acao === 'string' ? msg.acao.slice(0, 16) : '';
        ws.send(JSON.stringify({ t: 'resultado', acao: 'ia', item, ok: false, codigo: 'invalido' }));
      } else if (msg?.t === 'teleportar' && jogador) {
        // Teleporte até o companheiro Functional: o World valida e responde só a quem pediu.
        ws.send(JSON.stringify(mundo.pedidoTeleporte(jogador.id, msg)));
      } else if (msg?.t === 'teste' && jogador) {
        // Modo de teste (ouro, XP, nível): só o mundo de teste aceita.
        ws.send(JSON.stringify(mundo.pedidoTeste(jogador.id, msg)));
      } else if (msg?.t === 'ping') {
        ws.send(JSON.stringify({ t: 'pong', c: msg.c }));
      }
    });
    ws.on('close', () => {
      if (!jogador) return;
      mundos.get(mundo)?.delete(jogador.id);
      mundo.removePlayer(jogador.id);
      if (mundo.teste) mundos.delete(mundo); // o mundo de teste era só dele
    });
  });

  // Passo fixo com acumulador: setInterval atrasa às vezes, e o mundo não pode
  // andar mais devagar por isso.
  const passoMs = 1000 / TICK_HZ;
  let ultimo = performance.now();
  let acumulado = 0;
  const loop = setInterval(() => {
    const agora = performance.now();
    acumulado = Math.min(acumulado + agora - ultimo, passoMs * 10);
    ultimo = agora;
    while (acumulado >= passoMs) {
      acumulado -= passoMs;
      for (const [w, sockets] of mundos) {
        w.step();
        if (!w.ehTickDeSnapshot()) continue;
        const ents = w.entidades();
        const ev = w.tirarEventos();
        for (const [id, ws] of sockets) {
          const j = w.players.get(id);
          if (j && ws.readyState === ws.OPEN) ws.send(JSON.stringify(w.snapshotPara(j, ents, ev)));
        }
      }
    }
  }, passoMs / 2);

  await new Promise((ok) => server.listen(porta, ok));
  return {
    server,
    world,
    porta: server.address().port,
    fechar: () =>
      new Promise((ok) => {
        clearInterval(loop);
        for (const c of wss.clients) c.terminate();
        wss.close();
        server.close(ok);
      }),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { porta } = await iniciar();
  console.log(`New AstroN no ar: http://localhost:${porta}`);
}
