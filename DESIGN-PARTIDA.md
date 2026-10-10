# Partida do New AstroN (desenho do Mateus)

Documento de referência do modo de jogo principal. Toda tarefa de jogabilidade parte daqui; se a regra mudar, este arquivo muda junto (no mesmo PR).

**Legenda:** **[feito]** já está no jogo · **[em parte]** começou · sem marca, a fazer.

## Resumo

- **[feito]** **Partida de 10 minutos**, **dois times de 3 jogadores** (`server/partida.js`). O cronômetro começa quando entra o primeiro jogador; com os dois times cheios, quem chega é recusado (`partida_cheia`). Sem fogo amigo. A zona segura de cada base só protege o time dono dela.
- **[feito]** **Vence o time que mais minerou**: o que conta é o minério que os **mineradores** (mini-naves controladas pelo jogo) entregam na base. Empate é possível. Depois da tela de fim (15 s) começa outra partida do zero.
- Os jogadores não mineram: eles **protegem os próprios mineradores, destroem os do outro time**, caçam monstros no mundo aberto para ganhar **XP, nível e ouro**, tomam **objetivos** que dão bônus aos mineradores e gastam o ouro na **Evolução** e na **Loja** da base (**[feito]**, ver "Loja e Evolução").

## Mapa (vista de cima; -z é "em cima" no desenho)

Escala do desenho: 1 px ≈ 3 m. Retângulo aberto com muralha só na borda.

| Elemento | No desenho | No jogo |
|---|---|---|
| Base de cada time | Círculos verdes em cima e embaixo | `BASES` (x 0, z ±700, raio 200). Nasce, renasce, pousa e conserta ali; zona segura |
| Corredor dos mineradores | Faixa vermelha ligando as bases | `CORREDOR` (x 0, largura 100): estrada por onde os mineradores vão e voltam |
| Minério | Bola azul no centro | `MINERIO` (0, 0, raio 60): depósito de cristais onde os mineradores carregam |
| Entrega | Retângulos azuis nas pontas do corredor | `ENTREGAS`: cada minerador entrega **10 de minério** ao chegar |
| Evolução | Retângulo preto da esquerda em cada base | Plataforma de pouso: **pousado e parado**, abre o painel da Evolução **[feito]** |
| Loja | Retângulo preto da direita em cada base | Plataforma de pouso: **pousado e parado**, abre o painel da Loja **[feito]** |
| Mundo aberto | Todo o cinza | Monstros para enfrentar (XP, nível, ouro) |
| Objetivos | Pontos brancos A, B, C (três de cada lado, simétricos) | Ver abaixo |

## Mineradores

- **[feito]** Saem da base de cada time de tempos em tempos (um a cada 20 s, até 3 por time), vão pelo corredor até o minério, carregam (5 s) e voltam até a entrega do próprio time: **+10 de minério** para o time por entrega. Depois da entrega voltam para o minério (`server/mineradores.js`).
- **[feito]** **Podem ser destruídos** pelos jogadores do outro time (o minério que carregavam se perde; quem destrói ganha 40 de ouro). Na própria base são protegidos como os jogadores.
- **[feito]** Melhoráveis na Evolução, para o time inteiro: **mais mineradores**, mais **durabilidade**, mais **defesa** (reduz o dano que o minerador leva) e mais **velocidade** (números em "Loja e Evolução"; `melhorias[time]` lido em `atributos(time, tick)`).

## Monstros do mundo aberto

**[feito]** XP e ouro de cada um em `RECOMPENSA` (`server/progressao.js`).

- **Arnosh** (`N_DRONES` = 14): drones espalhados que patrulham e atiram de longe. Patrulhando, não entram nas bases nem na faixa do corredor (dão meia volta); caçando um jogador, entram no corredor atrás dele.
- **Vorax** (6): caçadores que vêm de qualquer canto atrás de quem sai da base. Seguem o jogador também pelo corredor (escolha: o corredor é onde se briga pelos mineradores, e eles não atacam minerador), mas nunca entram nas bases.
- **Krakor** (`N_KRAKOR` = 4, `server/elites.js`): elite raro, grande e lento (450 de HP, 24 m/s), com covil longe das bases e do corredor; patrulha o território (260 m), vai atrás de quem entra na visão até a borda dele e cospe plasma mirando adiantado. Nunca entra nas bases nem na faixa do corredor. Renasce em 30 s num covil novo, longe dos jogadores.
- **Guardião** (um em cada objetivo C): ver abaixo.

## Objetivos (bônus por tempo para os mineradores do time que tomar)

| Tipo | Como toma | Bônus (exemplo do Mateus) |
|---|---|---|
| **A** | Ficar **pousado 10 s** na marcação | Cada minerador do time minera **+1** de minério por viagem, por 1 minuto |
| **B** | **Destruir a torre** | Mineradores do time **mais rápidos** por 1 minuto |
| **C** | Livre (proposta: derrotar o **guardião** da arena) | A definir (proposta: mineradores com mais durabilidade por 1 minuto) |

Objetivos voltam a ficar disponíveis depois de um tempo (a definir).

**[feito]** Regras exatas (`server/objetivos.js`; números no topo dele). O bônus vai para o **time** de quem tomou, por `OBJ_BONUS_S` (60 s; tomar de novo renova, não soma), e o objetivo entra em recarga por `OBJ_RECARGA_S` (90 s), mostrada sobre a marcação e no minimapa. Numa partida nova tudo volta ao começo.

- **A (pouso):** conta o tempo de quem está **pousado e parado** na marcação; com `OBJ_A_POUSO_S` (10 s) o time toma: bônus `'mineracao'` e +`XP_OBJETIVO` (60) para cada nave do time pousada lá. Ninguém pousado: o progresso zera (decolar antes perde tudo). Naves dos dois times pousadas: **contestado**, o progresso trava. Se só o outro time fica, o progresso recomeça do zero para ele.
- **B (torre):** a torre tem `TORRE_B_HP` (800) de vida e só tiro de jogador a machuca (tiro de monstro bate e some). Quem dá o **último tiro** toma: bônus `'velocidade'` e +60 XP. A torre cai (deixa de ser sólida para nave e tiro, nos dois lados: `definirObstaculoAtivo`) e volta inteira no fim da recarga, esperando sair quem estiver no lugar dela.
- **C (guardião, decisão combinada com o Mateus):** um guardião (monstro elite único, 1500 de HP, atira um leque de três plasmas) fica preso na arena. Quem o **mata** toma: bônus `'durabilidade'` para o time (o XP é o do abate: 250, e 150 de ouro). Ele renasce no meio da arena no fim da recarga.

Os bônus do lado dos mineradores (`server/bonus.js`): `'mineracao'` +1 por viagem, `'velocidade'` ×1,4, `'durabilidade'` ×1,5; aparecem no placar com contagem regressiva.

## Progressão do jogador

- **[feito]** **XP e nível** ao destruir monstros, mineradores e jogadores inimigos, e ao tomar objetivos A e B. Começa no nível 1, vai até o 20 (`NIVEL_MAX`); para passar do nível n são `60 + 20 × (n − 1)` XP (`xpParaNivel` em `server/progressao.js`). Cada nível dá +3% do HP máximo da raça. Subir de nível: notícia e anel de luz na nave.
- **[feito]** **Ouro** pelas mesmas fontes. XP e ouro por tipo em `RECOMPENSA`: Arnosh 20 XP / 25 ouro, Vorax 30 / 30, Krakor 120 / 90, guardião 250 / 150, minerador 40 / 40, jogador 100 / 50.
- **[feito]** Ouro, XP e nível são **da partida** (como num MOBA): zeram quando começa a seguinte.
- **[feito]** **Assistência e sequência de abates** em abate de jogador, e **renascimento** que demora mais com o nível e com o tempo de partida: ver "Combate".
- **[feito]** **Evolução da nave** nos níveis **5, 10 e 15**, pagando ouro: escolher 1 de 3 (durabilidade, energia, velocidade). Ver "Loja e Evolução".
- **[feito]** **Duas armas na nave:** Q edita o Z, E edita o X; mesma arma pode ir nos dois. Não existe arma principal: os dois encaixes escolhem do mesmo catálogo (`ARMAS` em `shared/sim.js`: laser simples, duplo, triplo, dreno, criogênico, plasma, míssil teleguiado, mina, onda de choque e pulso EMP), cada um com a sua recarga e a mesma energia. Padrão: laser simples no Z e plasma no X (as duas de fábrica, sempre possuídas).
- **[feito]** **Loja**: comprar armas, armaduras e itens. Cada partida começa só com as armas de fábrica (laser simples e plasma); as outras oito se compram aqui e ficam na posse do piloto (no jogador, não na nave: voltam a cada renascimento). Arma não possuída fica travada no menu ("NA LOJA") e cai na padrão do encaixe.
- **[feito]** Evolução e Loja só abrem **com a nave pousada e parada** na plataforma do serviço da **própria base**.

## Combate

**[feito]** Regras do combate entre jogadores (`server/progressao.js`, números no topo dele; aplicadas em `#ferir` de `server/game.js`). A morte pesa mais conforme a partida avança, e jogar junto rende.

- **Renascimento crescente** (só jogadores; monstros têm o tempo deles): `3 s + 0,6 s × (nível − 1) + até 3 s pelo tempo de partida` (linear, 0 no começo e 3 s no fim do cronômetro), com **teto de 15 s** (`tempoRenascer`). Ex.: nível 1 no começo = 3 s; nível 10 na metade = 9,9 s; nível 20 no fim = 15 s. O snapshot traz `renasceEm` e o HUD conta o tempo certo.
- **Assistência:** quem é do time do matador e feriu a vítima (jogador inimigo) nos últimos **10 s** (`ASSISTENCIA_JANELA_S`), sem dar o último tiro, ganha **50% do ouro e do XP** do abate de jogador (**25 ouro e 50 XP**), cada um a parte cheia, sem dividir (no 3 contra 3 são no máximo dois ajudantes, e dividir puniria quem joga junto). Vale todo dano com dono: tiro, dreno, mina e onda de choque. Assistência não conta como abate. Só em abate de jogador (minerador e monstro, não). O registro de dano da vítima zera quando ela morre.
- **Sequência de abates:** cada piloto conta os abates de jogador seguidos sem morrer. Derrubar quem está com sequência de **2 ou mais** (`SEQUENCIA_MIN`) dá ao matador **+25 de ouro por abate da sequência** encerrada, com **teto de 150** (`ouroEncerrar`), além dos 50 do abate. Morrer (para jogador ou monstro) zera a sequência.
- Sequência e registro de dano zeram também na partida nova, junto com ouro e nível.
- Notícias: "X encerrou a sequência de Y (N abates, +B ouro)", "Assistência no abate de Y · +25 ouro" e "X está em sequência de N abates".

## Loja e Evolução

**[feito]** Dados em `shared/loja.js` e `shared/evolucao.js`; o servidor valida e cobra em `server/servicos.js`. Pousado e parado na plataforma da própria base, o painel abre sozinho; decolar (L) ou ESC fecha (Enter, ou tocar na dica de pouso, reabre). Tudo é **da partida**: na seguinte, posse de armas, armadura, itens, evoluções da nave e melhorias dos mineradores (dos dois times) voltam ao começo, junto com ouro e nível. Erros têm código estável (`nao_pousado`, `ouro_insuficiente`, `nivel_insuficiente`, `ja_possui`, `limite`, `invalido`; no uso de item `sem_item`, `recarga`, `cheio`).

### Loja (plataforma magenta)

| Arma | Preço (ouro) |
|---|---|
| Laser duplo | 120 |
| Laser triplo | 150 |
| Criogênico | 180 |
| Dreno | 200 |
| Mina | 240 |
| Onda de choque | 260 |
| Pulso EMP | 300 |
| Míssil teleguiado | 340 |

Comprada, a arma pode ir em qualquer um dos dois encaixes (Q e E).

| Armadura | Preço | Efeito |
|---|---|---|
| Leve | 150 | −10% de dano recebido |
| Média | 300 | −15% de dano, +30 HP máx. |
| Pesada | 480 | −25% de dano, +60 HP máx., −8% de velocidade |

Uma equipada por vez: comprar uma melhor substitui (preço cheio); igual ou pior que a equipada é recusada (`ja_possui`). A redução vale para todo dano (tiro, garra, dreno, mina, onda de choque).

| Item | Tecla | Preço | Efeito | Recarga | Carga máx. |
|---|---|---|---|---|---|
| Kit de reparo | R | 60 | cura 40% do HP máximo na hora | 10 s | 3 |
| Célula de energia | F | 40 | enche a energia (e destrava o boost) | 8 s | 3 |

Usar item vale em qualquer lugar; com a vida (ou a energia) cheia, o servidor recusa (`cheio`) e não gasta.

### Evolução (plataforma violeta)

**Nave** (do piloto): três marcos, em ordem, cada um exige o nível **e** o ouro; em cada marco escolhe-se 1 de 3 opções, e a mesma opção pode ser escolhida de novo no marco seguinte (os ganhos somam).

| Marco | Nível | Preço |
|---|---|---|
| 1 | 5 | 150 |
| 2 | 10 | 300 |
| 3 | 15 | 450 |

| Opção | Efeito |
|---|---|
| Casco reforçado | +25% de HP máximo (sobre o HP do nível) |
| Reator ampliado | +25% de energia máxima |
| Motor afinado | +10% de velocidade máxima (o boost multiplica por cima) |

Os efeitos ficam no estado da nave e voltam a cada renascimento, junto com o nível.

**Mineradores do time**: qualquer piloto paga o próximo nível, que vale para o time inteiro; o time recebe a notícia de quem comprou.

| Melhoria | Por nível | Preços por nível |
|---|---|---|
| Mais mineradores | +1 minerador ao mesmo tempo | 200, 350 |
| Casco de carga (durabilidade) | +25% de HP | 120, 200, 300 |
| Blindagem de carga (defesa) | −15% de dano recebido | 120, 200, 300 |
| Motor de carga (velocidade) | +10% de velocidade | 120, 200, 300 |

## HUD

- **[feito]** **Canto superior direito**: minério de cada time (placar, seu time em turquesa à esquerda) e o tempo restante da partida, com os bônus ativos de cada time embaixo.
- **[feito]** Ouro, nível e XP do jogador (barra de XP com o nível no painel; nível também no nome sobre a nave).
- **[feito]** Fim da partida: tela com o time vencedor, o placar e a contagem para a próxima.
