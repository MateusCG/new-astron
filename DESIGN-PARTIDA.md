# Partida do New AstroN (desenho do Mateus)

Documento de referência do modo de jogo principal. Toda tarefa de jogabilidade parte daqui; se a regra mudar, este arquivo muda junto (no mesmo PR).

**Legenda:** **[feito]** já está no jogo · **[em parte]** começou · sem marca, a fazer.

## Resumo

- **[feito]** **Partida de 10 minutos**, **dois times de 3 jogadores** (`server/partida.js`). O cronômetro começa quando entra o primeiro jogador; com os dois times cheios, quem chega é recusado (`partida_cheia`). Sem fogo amigo. A zona segura de cada base só protege o time dono dela.
- **[feito]** **Vence o time que mais minerou**: o que conta é o minério que os **mineradores** (mini-naves controladas pelo jogo) entregam na base. Empate é possível. Depois da tela de fim (15 s) começa outra partida do zero.
- Os jogadores não mineram: eles **protegem os próprios mineradores, destroem os do outro time**, caçam monstros no mundo aberto para ganhar **XP, nível e ouro**, tomam **objetivos** que dão bônus aos mineradores e gastam o ouro na **Evolução** e na **Loja** da base.

## Mapa (vista de cima; -z é "em cima" no desenho)

Escala do desenho: 1 px ≈ 3 m. Retângulo aberto com muralha só na borda.

| Elemento | No desenho | No jogo |
|---|---|---|
| Base de cada time | Círculos verdes em cima e embaixo | `BASES` (x 0, z ±700, raio 200). Nasce, renasce, pousa e conserta ali; zona segura |
| Corredor dos mineradores | Faixa vermelha ligando as bases | `CORREDOR` (x 0, largura 100): estrada por onde os mineradores vão e voltam |
| Minério | Bola azul no centro | `MINERIO` (0, 0, raio 60): depósito de cristais onde os mineradores carregam |
| Entrega | Retângulos azuis nas pontas do corredor | `ENTREGAS`: cada minerador entrega **10 de minério** ao chegar |
| Evolução | Retângulo preto da esquerda em cada base | Plataforma de pouso: **pousado**, abre a tela de evolução |
| Loja | Retângulo preto da direita em cada base | Plataforma de pouso: **pousado**, abre a loja |
| Mundo aberto | Todo o cinza | Monstros para enfrentar (XP, nível, ouro) |
| Objetivos | Pontos brancos A, B, C (três de cada lado, simétricos) | Ver abaixo |

## Mineradores

- **[feito]** Saem da base de cada time de tempos em tempos (um a cada 20 s, até 3 por time), vão pelo corredor até o minério, carregam (5 s) e voltam até a entrega do próprio time: **+10 de minério** para o time por entrega. Depois da entrega voltam para o minério (`server/mineradores.js`).
- **[feito]** **Podem ser destruídos** pelos jogadores do outro time (o minério que carregavam se perde; quem destrói ganha 40 de ouro). Na própria base são protegidos como os jogadores.
- Melhoráveis na Evolução: **mais mineradores**, mais **durabilidade**, mais **defesa**, mais **velocidade**. (O gancho já existe: `melhorias[time]` lido em `atributos(time, tick)`.)

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
- **Evolução da nave** nos níveis **5, 10 e 15**, pagando ouro: mais durabilidade, mais energia etc.
- **[feito]** **Duas armas na nave:** Q edita o Z, E edita o X; mesma arma pode ir nos dois. Não existe arma principal: os dois encaixes escolhem do mesmo catálogo (`ARMAS` em `shared/sim.js`: laser simples, duplo, triplo, dreno, criogênico, plasma, míssil teleguiado, mina, onda de choque e pulso EMP), cada um com a sua recarga e a mesma energia. Padrão: laser simples no Z e plasma no X (as duas de fábrica, sempre possuídas).
- **Loja**: comprar e trocar armas, armaduras e itens (as armas do menu passam a ser compradas aqui: quem compra põe o índice em `s.armas`; arma não possuída fica travada no menu e cai na padrão do encaixe).
- Evolução e Loja só abrem **com a nave pousada** na plataforma do serviço.

## HUD

- **[feito]** **Canto superior direito**: minério de cada time (placar, seu time em turquesa à esquerda) e o tempo restante da partida, com os bônus ativos de cada time embaixo.
- **[feito]** Ouro, nível e XP do jogador (barra de XP com o nível no painel; nível também no nome sobre a nave).
- **[feito]** Fim da partida: tela com o time vencedor, o placar e a contagem para a próxima.
