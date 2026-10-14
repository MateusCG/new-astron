# Partida do New AstroN (desenho do Mateus)

Documento de referência do modo de jogo principal. Toda tarefa de jogabilidade parte daqui; se a regra mudar, este arquivo muda junto (no mesmo PR).

**Legenda:** **[feito]** já está no jogo · **[em parte]** começou · sem marca, a fazer.

## Resumo

- **[feito]** **Partida de 10 minutos**, **dois times de 3 jogadores** (`server/partida.js`). O cronômetro começa quando entra o primeiro jogador; com os dois times cheios, quem chega é recusado (`partida_cheia`). Sem fogo amigo. A zona segura de cada base só protege o time dono dela.
- **[feito]** **Vence o time que mais minerou**: o que conta é o minério que os **mineradores** (mini-naves controladas pelo jogo) entregam na base. Empate é possível. Depois da tela de fim (15 s) começa outra partida do zero.
- **[feito]** **Fase final**: nos últimos 3 minutos (a partir dos 7:00 decorridos; `FASE_FINAL_S` = 180 em `server/partida.js`) o **minério entregue vale o dobro** (`MULT_FASE_FINAL` = 2, aplicado na entrega em cima da carga que já vem com o bônus de mineração: 10 vira 20, 11 vira 22). O snapshot traz `partida.fase` (`'normal'` ou `'final'`), o evento `faseFinal` anuncia a virada e o placar mostra "MINÉRIO ×2". Partida nova volta à fase normal. (Partida mais curta que a fase final, só nos testes, não tem fase final.)
- Os jogadores não mineram: eles **protegem os próprios mineradores, destroem os do outro time**, caçam monstros no mundo aberto para ganhar **XP, nível e ouro**, tomam **objetivos** que dão bônus aos mineradores e gastam o ouro na **Evolução** e na **Loja** da base (**[feito]**, ver "Loja e Evolução").

## Mapa (vista de cima; -z é "em cima" no desenho)

Escala do desenho: 1 px ≈ 3 m. Retângulo aberto com muralha só na borda.

| Elemento | No desenho | No jogo |
|---|---|---|
| Base de cada time | Círculos verdes em cima e embaixo | `BASES` (x 0, z ±700, raio 200). Nasce, renasce, pousa e conserta ali; zona segura |
| Corredor dos mineradores | Faixa vermelha ligando as bases | `CORREDOR` (x 0, largura 100): estrada por onde os mineradores vão e voltam |
| Torretas | (não estão no desenho; pedido do Mateus) | `TORRETAS`: 4 por time, 2 de cada lado da estrada (x ±62), a 340 e 480 m do centro da base, na metade do time **[feito]** (ver "Torretas") |
| Minério | Bola azul no centro | `MINERIO` (0, 0, raio 60): depósito de cristais onde os mineradores carregam |
| Entrega | Retângulos azuis nas pontas do corredor | `ENTREGAS`: cada minerador entrega **10 de minério** ao chegar |
| Evolução | Retângulo preto da esquerda em cada base | Plataforma de pouso: **pousado e parado**, abre o painel da Evolução **[feito]** |
| Loja | Retângulo preto da direita em cada base | Plataforma de pouso: **pousado e parado**, abre o painel da Loja **[feito]** |
| Mundo aberto | Todo o cinza | Monstros para enfrentar (XP, nível, ouro) |
| Objetivos | Pontos brancos A, B, C (três de cada lado, simétricos) | Ver abaixo |

## Mineradores

- **[feito]** Saem da base de cada time de tempos em tempos (um a cada 20 s, até 3 por time), vão pelo corredor até o minério, carregam (5 s) e voltam até a entrega do próprio time: **+10 de minério** para o time por entrega. Depois da entrega voltam para o minério (`server/mineradores.js`).
- **[feito]** **Podem ser destruídos** pelos jogadores do outro time (o minério que carregavam se perde; quem destrói ganha 40 de ouro). Na própria base são protegidos como os jogadores.
- **[feito]** **Escolta armada** (`server/escoltas.js`, números em `ESCOLTA`): uma por time, que sai da base 3 s depois do começo da partida (e, destruída, 30 s depois) e anda com os mineradores pela mesma rota: ao lado do minerador mais longe da base (14 m para fora do corredor, um pouco atrás); sem minerador, faz a ronda da rota. Não minera. Atira como torre giratória (sem virar a nave) no inimigo mais perto a até 110 m, com linha de tiro livre: jogadores, mineradores e escoltas do outro time (monstros e torretas não). Dano fraco (6 por tiro, um a cada 0,6 s), 220 de HP, 45 m/s. Criogênico a deixa lenta e EMP a deixa parada e sem tiro, como os mineradores; na própria base é protegida. Destruída: 50 XP e 45 de ouro para quem destruiu.
- **[feito]** Melhoráveis na Evolução, para o time inteiro: **mais mineradores**, mais **durabilidade**, mais **defesa** (reduz o dano que o minerador leva) e mais **velocidade** (números em "Loja e Evolução"; `melhorias[time]` lido em `atributos(time, tick)`).

## Torretas

**[feito]** Pedido do Mateus: defesas fixas no corredor (`server/torretas.js`; posições em `TORRETAS` de `shared/terrain.js`; a construção é sólida, na mesma planta da física e do desenho em `shared/obstaculos.js`).

- **Onde:** 4 por time, 2 de cada lado da estrada, a 62 m do eixo (fora da estrada e longe das faixas dos mineradores), a 340 m e 480 m do centro da base, na metade do próprio time. As do time 1 são as do time 0 giradas 180°. As z (±360 e ±220) fogem dos caminhos retos do corredor até os objetivos. Alcançam a entrega e a metade do time, mas não a coroa do minério do outro lado.
- **Tiro:** no inimigo **mais perto** a até 160 m, com linha de tiro livre (rocha e construção tampam): jogadores, mineradores e escoltas do outro time. Monstros não: a torreta é da guerra entre times, e se limpasse os Vorax bastaria voar até ela para se livrar de qualquer caçada. Mira adiantada pela velocidade do alvo; o tiro acerta o que estiver no caminho.
- **Dano recebido:** só de **jogador do outro time** (tiro, mina e onda de choque). Tiro de aliado, de monstro, de minerador ou de escolta bate nela e some. Dreno, lentidão e EMP não pegam em estrutura, e o míssil não a persegue.
- **Destruída:** cai (sai da física dos dois lados, como a torre B); quem deu o último tiro ganha **80 XP e 70 de ouro** (`RECOMPENSA.torreta`) e cada outro piloto do time dele **25 de ouro**. **Não renasce sozinha**: só se o time dono a reconstruir na Evolução.
- **Partida nova:** todas de pé, inteiras, nível 1. Só atiram com a partida em andamento.

| Nível (do time) | HP | Dano por tiro | Cadência |
|---|---|---|---|
| 1 | 700 | 10 | 1 a cada 0,75 s |
| 2 | 945 | 12,5 | igual |
| 3 | 1190 | 15 | igual |

## Monstros do mundo aberto

**[feito]** XP e ouro de cada um em `RECOMPENSA` (`server/progressao.js`).

**Passivos** (pedido do Mateus, out/2026): os monstros da jungle patrulham e **só seguem e atacam quem os atacou**. Cada um guarda quem o feriu (tiro, área, dreno...) e esquece `RAIVA_S` (**20 s**) depois do último golpe recebido, ou quando o jogador ou o próprio monstro morre (renasce passivo). Passar perto não provoca nada. O guardião do objetivo C não é da jungle e continua defendendo a arena.

- **Arnosh** (`N_DRONES` = **28**): drones espalhados que patrulham devagar. Patrulhando, não entram nas bases nem na faixa do corredor (dão meia volta); provocados, perseguem quem os atacou (até 400 m) e atiram de longe, entrando no corredor atrás dele.
- **Vorax** (**12**): provocados, vêm de qualquer canto atrás de quem os atacou, contornando as rochas. Seguem o jogador também pelo corredor (escolha: o corredor é onde se briga pelos mineradores, e eles não atacam minerador), mas nunca entram nas bases. Sem raiva, patrulham a jungle como os Arnosh.
- **Krakor** (`N_KRAKOR` = **8**, `server/elites.js`): elite raro, grande e lento (450 de HP, 24 m/s), com covil longe das bases e do corredor; patrulha o território (260 m) e, provocado, vai atrás de quem o atacou até a borda dele e cospe plasma mirando adiantado. Nunca entra nas bases nem na faixa do corredor. Renasce em 30 s num covil novo, longe dos jogadores.
- **Guardião** (um em cada objetivo C): ver abaixo.

## Objetivos (bônus por tempo para os mineradores do time que tomar)

| Tipo | Como toma | Bônus (exemplo do Mateus) |
|---|---|---|
| **A** | Ficar **pousado 10 s** na marcação | Cada minerador do time minera **+1** de minério por viagem, por 1 minuto |
| **B** | **Destruir a torre** | Mineradores do time **mais rápidos** por 1 minuto |
| **C** | Derrotar o **guardião** da arena | Mineradores do time com **mais durabilidade** e naves do time com **+20% de dano** (fúria), por 1 minuto |

Objetivos voltam a ficar disponíveis depois de um tempo (a definir).

**[feito]** Regras exatas (`server/objetivos.js`; números no topo dele). O bônus vai para o **time** de quem tomou, por `OBJ_BONUS_S` (60 s; tomar de novo renova, não soma), e o objetivo entra em recarga por `OBJ_RECARGA_S` (90 s), mostrada sobre a marcação e no minimapa. Numa partida nova tudo volta ao começo.

- **A (pouso):** conta o tempo de quem está **pousado e parado** na marcação; com `OBJ_A_POUSO_S` (10 s) o time toma: bônus `'mineracao'` e +`XP_OBJETIVO` (60) para cada nave do time pousada lá. Ninguém pousado: o progresso zera (decolar antes perde tudo). Naves dos dois times pousadas: **contestado**, o progresso trava. Se só o outro time fica, o progresso recomeça do zero para ele.
- **B (torre):** a torre tem `TORRE_B_HP` (800) de vida e só tiro de jogador a machuca (tiro de monstro bate e some). Quem dá o **último tiro** toma: bônus `'velocidade'` e +60 XP. A torre cai (deixa de ser sólida para nave e tiro, nos dois lados: `definirObstaculoAtivo`) e volta inteira no fim da recarga, esperando sair quem estiver no lugar dela.
- **C (guardião, decisão combinada com o Mateus):** um guardião (monstro elite único, 1500 de HP, atira um leque de três plasmas) fica preso na arena. Quem o **mata** toma: bônus `'durabilidade'` para os mineradores do time e **[feito]** `'furia'` para as **naves dos jogadores do time** (todas, não só quem matou), pelos mesmos 60 s (o XP é o do abate: 250, e 150 de ouro). Ele renasce no meio da arena no fim da recarga.

Os bônus (`server/bonus.js`): dos mineradores, `'mineracao'` +1 por viagem, `'velocidade'` ×1,4, `'durabilidade'` ×1,5; das naves, `'furia'` ×1,2 no dano causado (tiro, míssil, mina, onda de choque e dreno; só o servidor calcula dano, em `World.multDanoDe`, então a predição não muda). Aparecem no placar com contagem regressiva; a fúria também como anel âmbar em volta das naves do time.

## Progressão do jogador

- **[feito]** **XP e nível** ao destruir monstros, mineradores e jogadores inimigos, e ao tomar objetivos A e B. Começa no nível 1, vai até o 25 (`NIVEL_MAX`); para passar do nível n são `60 + 20 × (n − 1)` XP (`xpParaNivel` em `server/progressao.js`). Cada nível dá +3% do HP máximo da nave. Subir de nível: notícia e anel de luz na nave.
- **[feito]** **Pontos do piloto** (pedido do Mateus, out/2026, como a janela CHARACTER do original): **10 pontos por nível** (`10 × nível`, 250 no 25), distribuídos na janela STATUS (tecla C) entre **Energia, Ph. (físico), El. (elétrico) e Op. (laser)**, até **99 em cada**, em qualquer lugar e sem devolver. Os valores por ponto são os do original (`pilotparameter.txt`) por raça e classe: cada ponto de Ph./El./Op. dá ~2 a 3% de poder às armas daquele tipo de dano; cada ponto de Energia dá energia máxima (fixa + 3% da energia da nave) e regeneração. Zeram com o nível na partida nova (`shared/status.js`).
- **[feito]** **Ouro** pelas mesmas fontes. XP e ouro por tipo em `RECOMPENSA`: Arnosh 20 XP / 25 ouro, Vorax 30 / 30, Krakor 120 / 90, guardião 250 / 150, minerador 40 / 40, escolta 50 / 45, torreta 80 / 70 (+25 de ouro para cada colega de time), jogador 100 / 50.
- **[feito]** Ouro, XP e nível são **da partida** (como num MOBA): zeram quando começa a seguinte.
- **[feito]** **Assistência e sequência de abates** em abate de jogador, e **renascimento** que demora mais com o nível e com o tempo de partida: ver "Combate".
- **[feito]** **Evolução da nave**: a cada 5 níveis (5, 10, 15, 20) o piloto pode comprar a **próxima nave da linha** da raça e da classe, pagando ouro. Ver "Raças, classes e naves" e "Loja e Evolução".
- **[feito]** **Duas armas na nave:** Q edita o Z, E edita o X; mesma arma pode ir nos dois. Não existe arma principal: os dois encaixes escolhem do mesmo catálogo, que são **as armas do Astro-N original da raça e da classe do piloto** (ver "Armas"), cada um com a sua recarga e a mesma energia. Cada partida começa com as **duas armas de fábrica da raça** (um feixe no Z e uma metralhadora no X, sempre possuídas).
- **[feito]** **Recarga de troca de arma** (pedido do Mateus, para a build pesar): fora da própria base, trocar a arma de um encaixe põe **aquele encaixe** em recarga de troca por `TROCA_ARMA_S` (**3 s**): sem tiro nele e sem nova troca nele até acabar; o outro encaixe segue normal. **Dentro da própria base** (raio de `BASES[time]`) a troca é livre e a recarga de troca zera. Roda no `stepShip` (estado `troca1`/`troca2` na nave, no `me`), então a predição bate com o servidor. O menu de armas **trava** o encaixe enquanto conta: as outras cartas ficam apagadas com "TROCA EM 2,1 s", tocar numa delas só dá a notícia de quanto falta (o menu nunca manda uma troca que seria ignorada), e o painel inferior mostra a contagem no encaixe.
- **[feito]** **Loja**: comprar armas (só as da raça e da classe), escudos, armaduras, potenciadores e itens. As armas compradas ficam na posse do piloto (no jogador, não na nave: voltam a cada renascimento). Arma não possuída fica apagada no menu ("NA LOJA") e cai na de fábrica do encaixe.
- **[feito]** Evolução e Loja só abrem **com a nave pousada e parada** na plataforma do serviço da **própria base**.
- **[feito]** **Recall (voltar à base, tecla B)**: ver abaixo.

## Raças, classes e naves

**[feito]** Pedido do Mateus (out/2026), com as naves e os números do Astro-N original (`old-astron`, `initunit.cfg`). Dados em `shared/naves.js`.

- **Tela inicial em dois passos:** primeiro a **raça** (Acron, Bellico, Shrewdo; **Mechan aparece apagada com "EM BREVE"** e não se escolhe), depois a **classe**, cada uma com a especialidade do original: **Assault = mais HP**, **Mobile = mais velocidade**, **Functional = mais energia**. A tela mostra a primeira nave da escolha girando, com os status. Raça e classe ficam lembradas no navegador. O servidor recusa raça bloqueada (`raca_bloqueada`) ou desconhecida (`raca_invalida`); classe inválida vira Assault.
- **Cinco naves por raça e classe** (45 no total), na ordem do original. O piloto **começa na primeira** (ex.: Acron Assault = Warrior; Acron Functional = Esper) e, na Evolução, compra a seguinte quando tem o nível e o ouro. A nave comprada volta em cada renascimento e zera na partida seguinte.

| Tier | Nível | Preço (ouro) |
|---|---|---|
| 1ª nave | 1 | (de graça) |
| 2ª | 5 | 200 |
| 3ª | 10 | 400 |
| 4ª | 15 | 650 |
| 5ª | 20 | 900 |

| Raça | Assault | Mobile | Functional |
|---|---|---|---|
| Acron | Warrior, Paladin, Tristan, Kamasutra, Ulysses | Ranger, Tracker, Windwalker, Eurus, Sephiros | Esper, Mirage, Mystique, Mobius, Garuda |
| Bellico | Lioner, Tigera, Liger, Elephantera, Cheetahar | Condor, Falcon, Eagle, Phantom, Phoenix | Turtle, Snaker, Dragoner, Sphinx, Chimera |
| Shrewdo | Assault Wing, Power Wing, Plate Wing, Uranium Wing, Hellion Wing | Speed Wing, Rapier Wing, Thunder Wing, Lightning Wing, Alchemium Wing | Chaos Wing, Techron Wing, Magic Wing, Energy Wing, Cyclone Wing |

- **Escala do original para o jogo** (constantes nomeadas em `shared/naves.js`; as armas usam as mesmas): HP ×0,2 (`FATOR_ESCALA_HP`), energia ×0,3 (`FATOR_ENERGIA`), velocidade do original em m/ms × 1000 × 0,5 (`FATOR_VELOCIDADE`, a Warrior faz ~55,6 m/s), regeneração de energia por s = original/ms × 1000 × 0,3 / 0,5. Ex.: Warrior 170 HP, 27 de energia; Ulysses 668 HP, 132 de energia, 60 m/s.
- **Regeneração de vida da nave:** em voo, só as **Bellico** se recuperam (contínuo, como no original); pousada e parada, cada nave conserta no ritmo dela (`regenHpPousada`). **Pousada e parada na própria base** (anel ou serviços), vida e energia enchem rápido: +35% do máximo por segundo (`BASE_CURA_FRAC` em `shared/sim.js`), uns 3 s do vazio ao cheio.
- **Números do original mantidos de propósito**, mesmo quando a nave seguinte perde em algum status: Ulysses tem menos HP que Kamasutra (mas mais energia e velocidade), o mesmo em Cheetahar × Elephantera e Hellion × Uranium; Sephiros, Phoenix e Alchemium são mais lentas que a anterior; Garuda, Chimera e Cyclone têm menos energia que a anterior.

## Armas

**[feito]** As **140 armas de loja** do Astro-N original (Acron 48, Bellico 43, Shrewdo 49), com os números decodificados do `inititemweapon.cfg`. Catálogo gerado em `shared/armas-original.js` (de `tools/dados/armas.json` por `tools/gerar_armas.mjs`), conversão para a escala do jogo em `shared/armas.js`, golpes no servidor em `server/golpes.js`.

- **Por raça e classe:** cada arma tem as classes que podem usá-la (bandeiras do original). Armas por classe: Acron 18 / 22 / 28, Bellico 18 / 22 / 27, Shrewdo 21 / 23 / 26 (Assault / Mobile / Functional). Arma de outra raça ou classe não se compra (`invalido`) nem se equipa (cai na de fábrica).
- **De fábrica** (as duas mais baratas que servem nas três classes): Acron = Feixe Rifle Triplo + Vulcan Acron; Bellico = Feixe Bellico + Vulcan Bellico; Shrewdo = Feixe Duplo + Metralha Shrewdo.
- **Mecânica pelo padrão do original:** feixes e metralhadoras com canos lado a lado, leque, rajada (às vezes varrendo), atravessar alvos, área no impacto, explodir no fim, dividir em subprojéteis, mira travada e teleguiado; mísseis; canhões de bloqueio que aplicam efeito no alvo (paralisar, lento, dreno de vida ou de energia, sem tiro, desgoverno, sem regeneração, energia mais cara, vulnerável a um tipo de dano, fraco, cego, revelar camuflado...); novas (área que abre no lugar); minas e campos no chão (alguns atiram); dispositivos na própria nave (camuflagem, invulnerável, escudo, resistência, conserto, acelerar, teleporte), alguns de **segurar a tecla**; e suporte para aliados (cura, limpar efeitos, doar energia, desarmar minas, rebater tiros).
- **Escala:** dano ×0,2, energia por disparo ×0,3, recarga ×0,5, velocidade e alcance ×0,5, raios e vão entre canos ×0,25 (com raio mínimo de acerto de 4 m), durações iguais ao original, preço = original × 0,06 (`FATOR_*` no topo de `shared/armas.js`). Com as de fábrica, o tempo para matar uma nave do tier 1 com fogo contínuo fica entre ~1,2 s (Bellico, que bate mais forte, como no original) e ~3,3 s (Acron).
- **Aproximações** onde o original não cabia no jogo (escolhas de design, ajustáveis): escudo do original = 15% do HP máximo; resistência em pontos = 0,5% por ponto (até 75%); crítico e chances aleatórias ficaram de fora (regra fixa); camuflado some da tela do outro time salvo a 25 m ou logo depois de atirar (monstros ainda veem); teleporte salta para a frente até chão livre.
- **No 3D:** o modelo de cada arma fica pendurado na asa (Z na esquerda, X na direita, nos encaixes `l_item`/`r_item` da nave) e o tiro tem a textura, a cor e o som do original.

## Recall (voltar à base)

**[feito]** A Loja e a Evolução só abrem na base, a ~700 m do minério; o recall põe a compra no ritmo da partida, como num MOBA (`shared/recall.js`, regras no servidor em `server/game.js`).

- **B** (no celular, o botão **BASE** ao lado do POUSAR) começa a **canalizar** por `RECALL_S` (**6 s**). No fim, a nave aparece na base do próprio time, no mesmo lugar e rumo de quem renasce, com a **vida, a energia, o nível e o equipamento** que tinha (não é renascer: não conserta nada nem dá proteção de nascimento; a zona segura da base já protege).
- **Cancela** se a nave **levar dano**, **apertar um gatilho** (Z ou X, mesmo sem sair tiro), **der boost**, passar de `RECALL_VEL_MAX` (**8 m/s**: "quase parada"; girar no lugar pode), **morrer** ou se **B for apertado de novo**. Pousada pode.
- **Não começa** dentro da zona segura da própria base (já está lá), rápido demais, com o gatilho ou o boost apertados, nem morto.
- Quem canaliza vê a barra "Voltando à base · 3,2 s" no HUD; todos veem uma **coluna de luz na cor do time** em volta da nave (anéis subindo cada vez mais rápido) e um feixe onde ela some e onde aparece.

## Combate

**[feito]** Regras do combate entre jogadores (`server/progressao.js`, números no topo dele; aplicadas em `#ferir` de `server/game.js`). A morte pesa mais conforme a partida avança, e jogar junto rende.

- **Renascimento crescente** (só jogadores; monstros têm o tempo deles): `3 s + 0,6 s × (nível − 1) + até 3 s pelo tempo de partida` (linear, 0 no começo e 3 s no fim do cronômetro), com **teto de 15 s** (`tempoRenascer`). Ex.: nível 1 no começo = 3 s; nível 10 na metade = 9,9 s; nível 20 no fim = 15 s. O snapshot traz `renasceEm` e o HUD conta o tempo certo.
- **Assistência:** quem é do time do matador e feriu a vítima (jogador inimigo) nos últimos **10 s** (`ASSISTENCIA_JANELA_S`), sem dar o último tiro, ganha **50% do ouro e do XP** do abate de jogador (**25 ouro e 50 XP**), cada um a parte cheia, sem dividir (no 3 contra 3 são no máximo dois ajudantes, e dividir puniria quem joga junto). Vale todo dano com dono: tiro, dreno, mina e onda de choque. Assistência não conta como abate. Só em abate de jogador (minerador e monstro, não). O registro de dano da vítima zera quando ela morre.
- **Sequência de abates:** cada piloto conta os abates de jogador seguidos sem morrer. Derrubar quem está com sequência de **2 ou mais** (`SEQUENCIA_MIN`) dá ao matador **+25 de ouro por abate da sequência** encerrada, com **teto de 150** (`ouroEncerrar`), além dos 50 do abate. Morrer (para jogador ou monstro) zera a sequência.
- Sequência e registro de dano zeram também na partida nova, junto com ouro e nível.
- Notícias: "X encerrou a sequência de Y (N abates, +B ouro)", "Assistência no abate de Y · +25 ouro" e "X está em sequência de N abates".

## Loja e Evolução

**[feito]** Dados em `shared/loja.js` e `shared/evolucao.js`; o servidor valida e cobra em `server/servicos.js`. Pousado e parado na plataforma da própria base, o painel abre sozinho; decolar (L) ou ESC fecha (Enter, ou tocar na dica de pouso, reabre). Tudo é **da partida**: na seguinte, posse e nível das armas, armadura, itens, a nave comprada e as melhorias dos mineradores (dos dois times) voltam ao começo, junto com ouro e nível. Erros têm código estável (`nao_pousado`, `ouro_insuficiente`, `nivel_insuficiente`, `ja_possui`, `limite`, `invalido`; no uso de item `sem_item`, `recarga`, `cheio`).

### Loja (plataforma magenta)

**Armas:** só as da raça e da classe do piloto (menos as de fábrica), organizadas por categoria (feixe, metralhadora, canhão, míssil, lâmina, mina, nova, dispositivo...) com filtro. Preço = preço do original × 0,06 (`FATOR_OURO`; de 60 a ~360 de ouro). O pedido leva a chave da arma: `{t:'comprar', item:'o311001'}`. Comprada, a arma pode ir em qualquer um dos dois encaixes (Q e E).

**[feito] Evoluir armas** (na caixinha do item, no INVENTÁRIO; a Loja não evolui). Cada arma possuída, as de fábrica inclusive, sobe da **versão V1 à V8 do original** (o nível da arma, 1 a `ARMA_NIVEL_MAX` = 8). **Nenhuma versão pede nível do piloto** (pedido do Mateus: qualquer piloto pode ter V1 a V8; o limite é o ouro) e cada uma custa a taxa de evolução do original × 0,06, **sem chance de falhar** (no original a evolução podia falhar). A versão muda tudo o que o original muda (dano, recarga, energia, projéteis, efeito). Pedido `{t:'evoluirItem', inst}` (pousado e parado na própria base); na V8, `limite`. O nível da arma é do piloto e vai na nave (`niveis` no `me`, que o `stepShip` lê, então a predição acompanha): volta a cada renascimento e zera na partida seguinte. Monstros, torretas e escolta atiram com os tiros próprios de antes.

**[feito] Escudos, armaduras e potenciadores** (pedido do Mateus, out/2026): os do Astro-N original (`shared/equipamentos.js`, dos `.cfg` do original), cada um da V1 à V8, com a classe que o original exige (alguns são de todas as classes, outros de uma só). Preço e evolução = os do original × 0,06, sem falha; nenhuma versão pede nível do piloto. Pedido de compra: `{t:'comprar', item:'e330010'}`; a evolução é por item, no INVENTÁRIO.

| Categoria | Quantos | O que faz |
|---|---|---|
| Escudo | 12 (Maximum, Delta, Light, Neutron × Ph./Op./El.) | Energia de escudo própria: o dano sai **primeiro do escudo** e, acabado, do HP. Recupera sozinho depois de `ESCUDO_ESPERA_S` (3 s) sem levar dano e enche rápido pousado na base. Dá um pouco de resistência do seu tipo |
| Armadura | 16 (Titanium, Amandium, Argon, Alchanium × geral/Ph./Op./El.) | **Soma HP máximo** e resistência Ph./Op./El. |
| Potenciador | 34 | Até 3 efeitos: poder, recarga, resistência e penetração por tipo, crítico (×2), HP, escudo, energia, regenerações, velocidade e aceleração |

**Inventário** (janela INVENTÁRIO, tecla I): a nave equipa **2 armas, 1 escudo, 1 armadura e 2 potenciadores**. **Cada item comprado é um objeto próprio** (pedido do Mateus, out/2026), com a versão dele: comprar na Loja manda o item V1 para o **compartimento** (no máximo **12** itens fora da nave, `COMPARTIMENTO_MAX`; cheio, a compra é recusada). Arma, uma de cada; escudo, armadura e potenciador podem repetir (os dois potenciadores podem ser iguais: duas compras, efeitos somados). Clicar num item do compartimento abre uma caixinha com **Equipar** (vale **em qualquer lugar**), **Vender** (devolve **metade do que se pagou** nele, compra + evoluções; arma de fábrica não se vende) e **Evoluir** (sobe **só aquele item** para a próxima versão, pela taxa do original); vender e evoluir só **pousado e parado numa área de pouso da própria base**. No encaixe: Tirar (volta ao compartimento, se couber) e Evoluir. Trocar de escudo zera o escudo atual. Tudo é da partida: volta a cada renascimento e zera na seguinte.

**Dano entre tipos:** o dano que sai de um piloto é multiplicado pelo poder do tipo da arma (pontos + potenciadores); no alvo, a resistência do tipo (armadura, escudo e potenciadores, em pontos × 0,005 e %; teto 75%) menos a penetração de quem bateu; crítico dobra; depois o escudo e então o HP.

| Item | Tecla | Preço | Efeito | Recarga | Carga máx. |
|---|---|---|---|---|---|
| Kit de reparo | R | 60 | cura 40% do HP máximo na hora | 10 s | 3 |
| Célula de energia | F | 40 | enche a energia (e destrava o boost) | 8 s | 3 |

Usar item vale em qualquer lugar; com a vida (ou a energia) cheia, o servidor recusa (`cheio`) e não gasta.

### Evolução (plataforma violeta)

**Nave** (do piloto): a aba "Nave" mostra as cinco naves da linha da raça e da classe, cada uma com miniatura 3D, nível exigido, preço e os status comparados com a atual (ATUAL, COMPRAR, PEDE NV n, SEM OURO, JÁ PASSOU). `{t:'evoluir', opcao:'nave'}` compra a próxima (nível e ouro; na última, `limite`). A troca de modelo vale na hora, para todos (evento `nave`). Tabela de níveis e preços em "Raças, classes e naves". Substituiu os antigos marcos casco/reator/motor.

**Mineradores do time**: qualquer piloto paga o próximo nível, que vale para o time inteiro; o time recebe a notícia de quem comprou.

| Melhoria | Por nível | Preços por nível |
|---|---|---|
| Mais mineradores | +1 minerador ao mesmo tempo | 200, 350 |
| Casco de carga (durabilidade) | +25% de HP | 120, 200, 300 |
| Blindagem de carga (defesa) | −15% de dano recebido | 120, 200, 300 |
| Motor de carga (velocidade) | +10% de velocidade | 120, 200, 300 |

**Torretas do time** **[feito]** (aba Torretas; `MELHORIA_TORRETAS` e `PRECO_RECONSTRUIR` em `shared/evolucao.js`): qualquer piloto paga, vale para o time e o time recebe a notícia.

| Compra | Efeito | Preço |
|---|---|---|
| Nível das torretas (`{t:'melhorar', melhoria:'torretas'}`) | +35% de HP e +25% de dano por nível, nas quatro (nível 1 a 3; as de pé ganham vida na mesma proporção) | 250 (nível 2), 400 (nível 3) |
| Reconstruir uma torreta (`{t:'reconstruir', torreta}`) | Volta inteira, com o nível atual do time; se houver nave no lugar, espera ela sair | 200 cada |

Reconstruir só vale para torreta destruída do próprio time (a do outro time é `invalido`; de pé ou já em obra, `ja_possui`); nível no máximo é `limite`.

## Jogadores do computador

**[feito]** Pedido do Mateus: dá para pôr o computador no seu time e no time inimigo, para jogar junto ou contra (`server/bots.js`).

- **Como pôr e tirar:** a janela **Times** (tecla **P** ou o botão "Times" do HUD) mostra as três vagas de cada time; vaga livre tem "+ Computador", e cada computador tem o ✕ para tirar. Qualquer piloto da partida pode pedir (`{t:'ia'}`); o servidor decide. O limite continua **3 por time**, contando pessoas e computadores. **Gente tem prioridade:** quem entra com os dois times cheios fica com a vaga de um computador (o do time com menos pessoas). Quando sai a última pessoa, os computadores saem junto e a partida volta a esperar. Vale também no modo de teste.
- **Nick:** sempre **"NOME (IA)"**, com um nome próprio brasileiro em maiúsculas (JOAO, LAIS, MARIO...), sem repetir na partida. Pessoa não consegue usar "(IA)" no nick (os parênteses saem).
- **Joga como uma pessoa:** é uma nave de jogador de verdade (raça e classe sorteadas), com a mesma física, o mesmo dano, XP, ouro, Loja e Evolução; o comando dele passa pelo mesmo caminho do comando que vem da rede. Não atravessa rocha, não vê camuflado de longe, não compra fora da plataforma e não briga dentro da base do outro time.
  - **Começo:** caça os monstros da jungle (Arnosh e Vorax; Krakor só a partir do nível 7 e com vida) para ficar mais forte. Foge do alcance do guardião do C e das torretas inimigas.
  - **Com nível 4 (± o jeito de cada um) ou com 2:30 de partida:** vai atrapalhar a mineração do outro time. Espera perto do minério, do lado de lá, fora do alcance das torretas deles, e derruba os mineradores (os carregados primeiro) e a escolta. Sem minerador à vista, caça monstro ali perto.
  - **Jogador inimigo à vista** (até 320 m) ou atacando os mineradores do time dele: briga se tem vida (45% ou mais), senão foge.
  - **Vida baixa:** usa o kit de reparo; volta para a base (recall se está longe e ninguém o ataca, senão voando), pousa e conserta.
  - **Ouro:** pousa na Evolução para a próxima nave da linha (guarda ouro para ela quando já tem o nível) e na Loja para escudo, armadura, potenciadores (Reforço do tipo das armas e Durabilidade), que põe na nave com `equipar`, e kits de reparo; evolui as armas de fábrica e o equipamento com `evoluirItem`. Distribui os pontos a cada nível: 30% em Energia e o resto no tipo de dano das armas.
  - **Não é perfeito de propósito:** demora um pouco para reagir a um alvo novo e erra um pouco a mira (menos com o nível); cada um tem a sua agressividade.

## Modo de teste

**[feito]** Para testar a progressão sem jogar uma partida inteira (pedido do Mateus). Na tela inicial, a opção **"Modo de teste"** entra num **mundo só seu** (`World` com `teste: true`, criado por `server/index.js` para aquele piloto e apagado quando ele sai; até `MAX_MUNDOS_TESTE` = 4 ao mesmo tempo): a partida **não tem relógio** (não acaba nem entra na fase final; o placar mostra "TESTE") e um painel no HUD dá **+1000 ouro**, **+100 XP**, **+1 nível** e **nível 20** (pedido `{t:'teste', acao}`, que só o mundo de teste aceita). Monstros, mineradores, torretas e objetivos rodam como na partida normal.

## HUD

- **[feito]** **Canto superior direito**: minério de cada time (placar, seu time em turquesa à esquerda) e o tempo restante da partida, com os bônus ativos de cada time embaixo (mineração, velocidade, durabilidade e fúria). Na fase final, a faixa "MINÉRIO ×2" embaixo do placar e a notícia "Fase final: minério entregue vale ×2 até o fim" quando ela começa.
- **[feito]** Ouro, nível e XP do jogador (barra de XP com o nível no painel; nível também no nome sobre a nave).
- **[feito]** **Escudo** na barra ESC acima do HP e nos rótulos das naves; janelas **STATUS** (C: ficha do piloto e pontos com "+1"/"+10") e **INVENTÁRIO** (I: os seis encaixes e o compartimento n/12 com a caixinha de cada item), na altura toda da tela, como as CHARACTER e INVENTORY do original.
- **[feito]** **"CARREGANDO"** no meio da tela (encaixe, arma e segundos) enquanto a troca de arma fora da base conta (`TROCA_ARMA_S` = 3 s, regra contra trocar a cada tiro).
- **[feito]** Fim da partida: tela com o time vencedor, o placar e a contagem para a próxima.
