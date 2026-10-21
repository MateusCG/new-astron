# Partida do New AstroN (desenho do Mateus)

Documento de referência do modo de jogo principal. Toda tarefa de jogabilidade parte daqui; se a regra mudar, este arquivo muda junto (no mesmo PR).

**Legenda:** **[feito]** já está no jogo · **[em parte]** começou · sem marca, a fazer.

**Origem do mapa (out/2026):** o Mateus mandou um desenho 2D com a especificação do mapa (MOBA de naves, 3 contra 3, mineração de Hélio-3) e pediu para construí-lo com o visual do **Stage 6 do Astro-N original** (o lago com o Warp Gate alto e flutuante). Desenho, especificação e o contrato de implementação ficam fora do repo, em `~/Documentos/new-astron-progresso/mapa-stage6/` (`mapa-2d.png`, `new-astron-mapa.md`, `CONTRATO-MAPA-STAGE6.md`). Onde a especificação marcava [PROPOSTA], valem os números abaixo.

## Resumo

- **[feito]** **Partida de 20 minutos** (`DURACAO_PARTIDA_S` = 1200), **dois times de 3 jogadores** (`server/partida.js`). O cronômetro começa quando entra o primeiro jogador; com os dois times cheios, quem chega é recusado (`partida_cheia`). Sem fogo amigo. A zona segura de cada base só protege o time dono dela.
- **[feito]** **Vence o time que mais minerou Hélio-3 (He-3)**: o que conta é o minério que os **mineradores** (mini-naves controladas pelo jogo) entregam na base. Empate é possível. Depois da tela de fim (15 s) começa outra partida do zero.
- **[feito]** **Fase final**: nos últimos 3 minutos (17:00 a 20:00; `FASE_FINAL_S` = 180) o **minério entregue vale o dobro** (`MULT_FASE_FINAL` = 2). O snapshot traz `partida.fase` (`'normal'` ou `'final'`), o evento `faseFinal` anuncia a virada e o placar mostra "MINÉRIO ×2".
- Os jogadores não mineram: eles **protegem os próprios mineradores, destroem os do outro time**, farmam a **jungle** (XP, nível e ouro), tomam **buffs e objetivos épicos** e gastam o ouro na **Evolução** e na **Loja** da base.
- **[feito]** **Névoa de guerra (visão do time):** cada time só vê o que algum aliado enxerga (ver "Visão").

**Ritmo:** 0:00–3:00 jungle e lane; 0:45 acampamentos; 1:30 buffs; 2:00 plataformas de pouso; 3:00 sonda errante; 5:00 Ancient Medusa; 8:00 Núcleo de He-3 (pico de disputa); 15:00 segundo Núcleo; 17:00–20:00 fase final.

## Mapa: o lago de He-3 (vista de cima; −z é "em cima" no desenho)

**[feito]** `shared/terrain.js` (contrato do mapa), `shared/obstaculos.js` (construções sólidas) e `shared/visao.js` (linha de visão). Escala do desenho: 1 px = 2,25 m. Mapa de **3000 × 2240 m** (`MAP_HALF_X` = 1500, `MAP_HALF_Z` = 1120), simétrico por **rotação de 180°** em volta do centro: o time 1 tem tudo o que o time 0 tem, girado. **Time 0 = base A, à esquerda (x < 0)**; time 1 = base B, à direita.

As naves voam a 10 m de um chão plano (`heightAt` = 0) sobre um **lago**: a água fica abaixo do voo (`NIVEL_AGUA`, só visual) e o fundo bem mais embaixo, então tudo parece flutuar, como no Stage 6. Só o que é rocha sobe, íngreme, e a nave contorna.

**Três tipos de terreno:**

| Tipo | Passagem | Visão | Tiro | Onde |
|---|---|---|---|---|
| **Rocha (bloqueio total)** | Não | Bloqueia | Bloqueia | A **borda** do mapa, as **4 rochas dos quadrantes** (cápsulas de 360 × 135 m) e as **paredes em L** dos poços (`ROCHAS`, planta única da física, da visão e do desenho; topo de 70 a 165 m) |
| **Campo de asteroides** | Sim | Quem está dentro só é visto por quem está no mesmo campo ou a até 60 m | Passa | 8 campos: um junto a cada buff (153 × 248 m) e 4 centrais (180 × 315 m) (`ASTEROIDES`) |
| **Campo aberto** | Sim | Livre | Livre | O resto: a **jungle** (\|x\| ≤ 1080, \|z\| ≤ 1060) e a **lane** com as bocas das bases (\|x\| ≤ 1440, \|z\| ≤ 180) |

| Elemento | Onde (time 0; o do time 1 é o girado) | O que é |
|---|---|---|
| **Base** | (−1280, 0), zona segura de raio 170, num bolsão no fim da lane | Portal warp alto e flutuante; anel de pouso, Evolução e Loja; nasce, renasce, pousa e conserta |
| **Lane** | Faixa \|z\| ≤ 90 entre as bases (`LANE`) | **Sem pista**: só o caminho dos mineradores e das torres |
| **Mineradora de He-3** | Centro (0, 0), 140 × 230 m, topo 95 m (`MINERADORA`) | Sólida: bloqueia **passagem, tiro e visão**. Divide a lane em duas metades; para pressionar o outro lado é preciso contornar pela jungle |
| **Docas** | (−84, 0), na face voltada para a própria base (`DOCAS`) | Onde os mineradores do time atracam e mineram |
| **Entregas** | (−1110, 0), na boca da base (`ENTREGAS`) | Onde o minerador entrega |
| **Torres sentinela** | (−787,5, ±171) e (−427,5, ±171) (`TORRETAS`) | 4 por time, fora da lane |
| **Acampamentos** | Perto da base (−945, ±337,5); perto do centro (−472,5, ±922,5) (`ACAMPAMENTOS`) | Jungle (ver "Jungle") |
| **Buff de ataque** | (−855, −909), em cima, perto do Núcleo (`BUFFS` BA0) | O SN-4 |
| **Buff de suporte** | (−855, 909), embaixo, perto da Medusa (`BUFFS` BS0) | Torre para destruir |
| **Plataforma de pouso** | (−495, −445,5), raio 28 (`PLATAFORMAS_POUSO` P0) | Ouro para o time |
| **Poços** | Paredes em L em volta do Núcleo (em cima, (0, −877)) e da Medusa (embaixo, (0, 877)) | Cada poço tem **três entradas**: lado A, lado B e a coluna central |
| **Sonda errante** | Coluna central, de (0, −337,5) a (0, 337,5), contornando a mineradora (`trajetoSonda`) | Ver "Jungle" |

Pela simetria, o buff de ataque do time 0 fica em cima (perto do Núcleo) e o do time 1 embaixo (perto da Medusa): cada time tem um lado mais forte, e os dois objetivos épicos favorecem times diferentes (estratégia de **trocar objetivos**).

## Visão (névoa de guerra)

**[feito]** Escolha do Mateus: **visão do time**, como num MOBA. O servidor (`server/visao.js`) só põe no snapshot de cada jogador as entidades do outro time e as neutras (monstros, sonda, chefes, Núcleo) que **algum aliado enxerga**; as do próprio time sempre vão. Tiros, minas, mísseis e eventos com lugar passam pelo mesmo filtro (o autor e o alvo sempre recebem o que é deles). Construções, o estado dos objetivos (`obj`), o placar e a lista de jogadores são públicos.

| Olho | Raio |
|---|---|
| Nave de jogador viva | **550 m** (`VISAO_RAIO`: a arma de maior alcance do jogo, a Lâmina Giratória, chega a 548 m) |
| Torre sentinela de pé | 560 m (`VISAO_TORRETA`) |
| Minerador e escolta | 300 m (`VISAO_MINERADOR`: avisa quem chega, sem virar radar da lane) |
| Base | 250 m do centro (o bolsão inteiro) |

Rocha e mineradora cortam a linha de visão. Quem está num campo de asteroides só é visto de dentro do mesmo campo ou a até 60 m dele. No cliente (`public/js/nevoa.js`), o que o time não vê escurece e perde a cor (sem sumir o terreno), e o campo de asteroides que o time não vê ganha uma poeira; o minimapa escurece igual.

## Mineradores

- **[feito]** **10 por time** (`MINERADORES_POR_TIME`), saindo da base em fila, um a cada **7,5 s** (o ciclo dividido pelos 10: ficam espalhados pela lane); **voam em linha reta** da entrega até a **doca** do time na mineradora (sem estrada), carregam e voltam: **+10 de minério** por entrega. Ida de ~40 s, ciclo de ~75 s (umas 15 viagens por minerador numa partida). **Fila:** nenhum encosta no da frente na mesma faixa; com um minerando na doca, o próximo espera parado atrás e quem sai da doca vai de lado para a faixa da volta. Destruído, o substituto sai 20 s depois. Sem ninguém atrapalhar, ~8 entregas por minuto: **~1760 de minério por time** em 20 minutos (era ~530 com três) (`server/mineradores.js`).
- **[feito]** **Podem ser destruídos** pelos jogadores do outro time (o minério que carregavam se perde; quem destrói ganha 40 de ouro). Na própria base são protegidos como os jogadores.
- **[feito]** **Escolta armada** (`server/escoltas.js`, números em `ESCOLTA`): **três por time**, saindo em fila (8 s entre uma e outra), cada uma acompanhando um minerador diferente (frente, meio e fim do comboio), pela mesma rota, e atira como torre giratória no inimigo mais perto a até 110 m (jogadores, mineradores e escoltas do outro time). Destruída: 50 XP e 45 de ouro, e a reposição sai 30 s depois.
- **[feito]** Melhoráveis na Evolução, para o time inteiro: mais mineradores, durabilidade, defesa e velocidade (ver "Loja e Evolução").
- **[feito]** **Onda do Núcleo:** ver "Núcleo de He-3".

## Torres sentinela

**[feito]** As torretas de defesa (`server/torretas.js`; posições em `TORRETAS`, construção sólida em `shared/obstaculos.js`). Pedido do MD: **mais robustas, o maior alcance do jogo e tiro teleguiado**.

- **Tiro:** **míssil teleguiado** (16 de dano a cada 1,2 s, 180 m/s, curva de 3 rad/s; vai na lista `guiados` e pode bater em rocha e na mineradora), alcance **560 m**. Só mira quem o time dela enxerga, nunca camuflado. **Prioridade:** o mais perto entre quem agrediu um aliado (ou a própria torre) dentro do alcance nos últimos 3 s; sem ninguém assim, o mais perto. Alvos: jogadores, mineradores e escoltas do outro time (monstros não).
- **Vida:** 1400 no nível 1 (+35% por nível, até o 3). Dano só de jogador do outro time.
- **Destruída:** cai (sai da física), dá 80 XP e 70 de ouro a quem deu o último tiro e 25 de ouro a cada colega; **não renasce sozinha**: o time reconstrói na Evolução (200 de ouro). Partida nova: todas de pé, nível 1.

## Jungle do Stage 6

**[feito]** Os monstros do **Stage 6 do Astro-N original** (`server/jungle.js`, números de cada espécie em `server/especies.js`; pesquisa das tabelas do original em `PESQUISA-MONSTROS.md`, na pasta do mapa). Os modelos 3D são os do original (`public/modelos/monstros/`). Saíram Arnosh, Vorax, Krakor e o guardião.

**Comportamento:** passivos; só atacam quem os atacou (e atacar um provoca o **acampamento inteiro**), por 20 s depois do último golpe. **Sem alcance para revidar, o monstro se aproxima** de quem o atacou (até 85% do alcance da arma; com rocha no meio, contorna). Não saem do **território** (250 m dos comuns, 175 m dos chefes): passando dele, desistem, voltam ao ponto e regeneram. Fora de briga regeneram (3%/s comuns, 2%/s chefes). Nunca atacam quem está numa zona segura.

**Acampamentos** (6 por território: 4 comuns e 2 buffs). Aparecem aos **0:45** e voltam **1:30** depois de o acampamento inteiro morrer. Composição no referencial do time 0 (o time 1 é o mesmo girado; escolha do Mateus: variedade com a mesma força por papel):

| Acampamento | Monstros |
|---|---|
| Perto da base, em cima | 4 **Armish** |
| Perto da base, embaixo | 4 **Chrometic** |
| Perto do centro, em cima | 1 **Grande Xerxes** + 2 **Xerxes** |
| Perto do centro, embaixo | 1 **Anti** + 2 **Bazit** |

| Espécie | Papel | HP | Ataque | XP / ouro |
|---|---|---|---|---|
| Armish | pequeno da base | 160 | pedra (físico), 4 a cada 1,4 s, 170 m | 20 / 18 |
| Chrometic | pequeno da base | 160 | onda elétrica, 4 a cada 1,4 s, 170 m | 20 / 18 |
| Xerxes | pequeno do centro | 240 | chama em cone de perto (70 m) e bala explosiva de longe (220 m) | 35 / 28 |
| Bazit | pequeno do centro | 240 | 3 feixes laser paralelos, 200 m | 35 / 28 |
| Grande Xerxes | grande do centro | 900 | chama larga (110 m, área 15 m) | 90 / 70 |
| Anti | grande do centro | 900 | 3 mísseis físicos de curva leve, 240 m | 90 / 70 |
| **SN-4** (chefe do Stage 5, **2× o modelo original**: 60 m, raio de acerto 26 m; não entra na rocha) | buff de ataque | 2000 | 4 mísseis teleguiados (320 m), onda em volta (70 m), campo elétrico que deixa lento | 150 / 100 |
| **Ancient Medusa** | chefe épico | 12000 (+10 HP/s) | pedras gigantes, leque de 10 raios com desgoverno, armadilhas que impedem o tiro | 220 / 150 **para cada piloto do time** |
| **Sonda errante** (A-Fly IV) | neutra | 300 | nenhum: foge | 40 / 35 |

- **Buff de ataque (SN-4):** aparece aos **1:30**, volta **4:00** depois de morrer. Quem dá o golpe final ganha **'ataque': +20% de dano por 90 s** (só ele).
- **Ancient Medusa** (no lugar do Leviatã da especificação): no poço de baixo, aparece aos **5:00**, volta **5:00** depois de morrer, **não se teleporta** (escolha do Mateus). O time de quem dá o golpe final ganha, para cada piloto, 150 de ouro e 220 de XP, e **'medusa': +15% de dano e +15% de velocidade por 120 s** para as naves do time.
- **Sonda errante:** aparece aos **3:00** (alternando a ponta onde nasce), volta **2:00** depois de morrer; anda pela coluna central contornando a mineradora, pausa 4 s nas pontas e **foge** de quem a ataca (6 s). Não aparece enquanto a Medusa ou o Núcleo estão vivos (a que já estava viva continua). Golpe final: **'sonda': +25% de velocidade por 40 s** (só ele), **suspensa nos 3 s depois de causar ou levar dano** (serve para se deslocar, não para lutar).

## Objetivos

**[feito]** `server/objetivos.js` (torre de suporte, plataformas de pouso e Núcleo) e `server/jungle.js` (SN-4, Medusa, sonda). O estado vai no snapshot em `obj`, por id (`BA0`, `BA1`, `BS0`, `BS1`, `P0`, `P1`, `SONDA`, `MEDUSA`, `NUCLEO`), e aparece sobre cada lugar e no minimapa.

- **Buff de suporte (torre BS0/BS1):** de pé desde o começo, mas só aceita dano a partir de **1:30**; 900 de HP, só tiro de jogador (de qualquer time) machuca. O último tiro dá **'suporte': +2% do HP máximo por s e +4 de energia por s, por 90 s** (só ele), 150 XP e 100 de ouro; a torre cai e volta inteira **4:00** depois.
- **Plataforma de pouso (P0/P1):** ativa a partir de **2:00**. **Pousado e parado 6 s** nela: **50 de ouro para cada piloto do time** e +12 para quem pousou (`OURO_PLATAFORMA`, `OURO_PLATAFORMA_POUSOU`). Decolar, sair ou **levar dano** cancela e zera. Pousada, a nave não atira (vale para todo pouso). Qualquer time pousa em qualquer uma; os dois times pousados = contestado (trava). Feixe de luz acende enquanto alguém está pousado. Recarga de **2:30** depois da coleta.
- **Núcleo de He-3** (criação nossa para o "evento épico principal"): um reator de cristal de He-3 flutuando no poço de cima, preso por anéis de contenção. Aparece aos **8:00** e, se tiver sido tomado, de novo aos **15:00** (no máximo duas vezes; vivo às 15:00, nada muda). 6000 de HP, só jogador fere; fora de briga por 10 s regenera 2%/s. A cada 4 s solta um **pulso** de energia (raio 80 m, dano 30 × força, força de 1 a 2,5 conforme perde vida) que machuca naves dos dois times. O golpe final dá ao time 250 XP e 150 de ouro por piloto e a **onda do Núcleo**: na hora saem da base dele **3 mineradores do Núcleo** (4× o HP, 70% da velocidade, maiores e brilhando He-3) que levam **50 de minério cada** (5× o normal), contam além do limite e somem depois de entregar: um alvo enorme para o inimigo.

Bônus (`server/bonus.js`): por nave (`ativarNave`; morrer limpa) `'ataque'`, `'suporte'` e `'sonda'`; de time `'medusa'`. O dano é só do servidor (`World.multDanoDe`); velocidade e regeneração vêm no `me` (`velMult`, `regenEn`), então a predição acompanha. Os bônus antigos dos mineradores (mineração, velocidade, durabilidade) e a fúria saíram, junto com os objetivos A, B e C.

## Progressão do jogador

- **[feito]** **XP e nível** ao destruir monstros, mineradores e jogadores inimigos, e ao tomar buffs e objetivos. Começa no nível 1, vai até o 25 (`NIVEL_MAX`); para passar do nível n são `60 + 20 × (n − 1)` XP (`xpParaNivel` em `server/progressao.js`). Cada nível dá +3% do HP máximo da nave. Subir de nível: notícia e anel de luz na nave.
- **[feito]** **Pontos do piloto** (pedido do Mateus, out/2026, como a janela CHARACTER do original): **10 pontos por nível** (`10 × nível`, 250 no 25), distribuídos na janela STATUS (tecla C) entre **Durabilidade (HP), Energia, Ph. (físico), El. (elétrico) e Op. (laser)**, até **99 em cada**, em qualquer lugar e sem devolver. Os valores por ponto são os do original (`pilotparameter.txt`) por raça e classe: cada ponto de Ph./El./Op. dá ~2 a 3% de poder às armas daquele tipo de dano; cada ponto de Energia dá energia máxima (fixa + 3% da energia da nave) e regeneração; cada ponto de Durabilidade (pedido do Mateus, 21/out/2026) dá HP máximo (fixo + 3% do HP da nave) e regeneração de HP, em voo e pousada. Zeram com o nível na partida nova (`shared/status.js`).
- **[feito]** **Ouro** pelas mesmas fontes. XP e ouro por tipo em `RECOMPENSA` (os monstros pela espécie, ver "Jungle do Stage 6"): minerador 40 / 40, escolta 50 / 45, torreta 80 / 70 (+25 de ouro para cada colega de time), jogador 100 / 50.
- **[feito]** **Ouro passivo** (como no Dota 2 e no LoL): **+1 de ouro por segundo** de partida em andamento para cada piloto, computadores e mortos inclusive (`OURO_POR_SEGUNDO`); nada na espera nem na tela de fim; o modo de teste também conta. São 1200 de ouro por partida de 20 minutos.
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

**[feito]** A Loja e a Evolução só abrem na base, a ~1200 m da mineradora; o recall põe a compra no ritmo da partida, como num MOBA (`shared/recall.js`, regras no servidor em `server/game.js`).

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

**Inventário** (janela INVENTÁRIO, tecla I): a nave equipa **2 armas, 1 escudo, 1 armadura e 2 potenciadores**. **Cada item comprado é um objeto próprio** (pedido do Mateus, out/2026), com a versão dele: comprar na Loja manda o item V1 para o **compartimento** (no máximo **12** itens fora da nave, `COMPARTIMENTO_MAX`; cheio, a compra é recusada). Arma, até **2 cópias** (pedido do Mateus: a mesma arma no Z e no X são duas cópias, cada uma evoluída à parte; a arma de fábrica conta como a 1ª e está à venda para a 2ª; a 3ª é recusada); escudo, armadura e potenciador podem repetir (os dois potenciadores podem ser iguais: duas compras, efeitos somados). Clicar num item do compartimento abre uma caixinha com **Equipar** (vale **em qualquer lugar**), **Vender** (devolve **metade do que se pagou** nele, compra + evoluções; arma de fábrica não se vende) e **Evoluir** (sobe **só aquele item** para a próxima versão, pela taxa do original); vender e evoluir só **pousado e parado numa área de pouso da própria base**. No encaixe: Tirar (volta ao compartimento, se couber) e Evoluir. Trocar de escudo zera o escudo atual. Tudo é da partida: volta a cada renascimento e zera na seguinte.

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
| Mais mineradores | +2 mineradores ao mesmo tempo (10 → 12 → 14) | 200, 350 |
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
  - **Só sabe o que o time vê** (os mesmos olhos da névoa: naves, mineradores, escoltas, torres de pé e a base); o mapa, o estado dos objetivos (`obj`) e as regras de tempo são públicos. Lembra, por time, quando cada acampamento volta. Anda pela grade de `server/navegacao.js` com **A\*** que evita o alcance das torres inimigas e o bolsão da base do outro time; sem enroscar em quina.
  - **Papéis** (MD §6), pela ordem em que os computadores entram no time: com 1, **lane**; com 2, lane e **jungle**; com 3, entra o **roamer**.
    - **Lane:** fica um pouco à frente do minerador mais adiantado do time, sem passar da mineradora, e defende a metade do time; com a lane quieta (e abaixo do nível 8) limpa o acampamento perto da base. A partir do nível 5, com a doca do outro time fora do alcance das torres deles, espreita do outro lado da mineradora e derruba os mineradores na doca; com licença (abaixo), empurra mineradores e torre.
    - **Jungle:** sonda à vista → torre do buff de suporte do território quando acende → SN-4 (nível 6 e 75% de vida) → plataforma de pouso do território se não há inimigo a menos de 500 m → acampamentos, os da base antes dos do centro. Sem nada, espera o acampamento que volta logo ou ajuda a lane.
    - **Roamer:** a partir do nível 3 alterna 45 s de **emboscada** dentro do campo de asteroides central do outro time (perto da doca deles, onde ninguém de fora o vê) e 30 s de farm.
  - **Torres:** ninguém fica no alcance de uma torre inimiga de pé (560 m) sem **licença**: pelo menos 2 do time a até 220 m, todos com 60% de vida ou mais, e força (vida × (nível + 3)) 1,3× a dos inimigos à vista. Cruzar o alcance de passagem pode; ficar, não.
  - **Objetivos épicos em grupo:** só com 2 ou mais computadores vivos no time (Núcleo com nível médio 5, Medusa com 7); reúnem-se na coluna central fora do alcance e atacam juntos (do Núcleo a 130 m, fora do pulso); grupo desfeito com o chefe acima de 40%, desistem por 45 s. Sozinho, nunca vai. A onda do Núcleo do outro time é caçada; a do próprio, escoltada pela lane.
  - **Jogador inimigo à vista:** briga ou recua conforme a força dos dois lados; com menos de ~30% de vida recua (sai do alcance de torre primeiro), usa o kit, volta de recall ou voando, pousa e conserta.
  - **Ouro:** só viaja para gastar com pelo menos 110 + 30 × nível de ouro (a próxima nave sempre vale); pousa na Evolução para a próxima nave da linha (guarda ouro para ela quando já tem o nível) e na Loja para escudo, armadura, potenciadores (Reforço do tipo das armas e Durabilidade), que põe na nave com `equipar`, e kits de reparo; evolui as armas de fábrica e o equipamento com `evoluirItem`. Distribui os pontos a cada nível: 30% em Energia e o resto no tipo de dano das armas.
  - **Não é perfeito de propósito:** demora um pouco para reagir a um alvo novo e erra um pouco a mira (menos com o nível); cada um tem a sua agressividade.

## Modo de teste

**[feito]** Para testar a progressão sem jogar uma partida inteira (pedido do Mateus). Na tela inicial, a opção **"Modo de teste"** entra num **mundo só seu** (`World` com `teste: true`, criado por `server/index.js` para aquele piloto e apagado quando ele sai; até `MAX_MUNDOS_TESTE` = 4 ao mesmo tempo): a partida **não tem relógio** (não acaba nem entra na fase final; o placar mostra "TESTE") e um painel no HUD dá **+1000 ouro**, **+100 XP**, **+1 nível** e **nível 20** (pedido `{t:'teste', acao}`, que só o mundo de teste aceita). Monstros, mineradores, torretas e objetivos rodam como na partida normal.

## HUD

- **[feito]** **Canto superior direito**: minério de cada time (placar, seu time em turquesa à esquerda) e o tempo restante da partida, com o bônus de time ativo embaixo (Medusa); os bônus da própria nave (ataque, suporte, sonda) aparecem no HUD com o tempo. Na fase final, a faixa "MINÉRIO ×2" embaixo do placar e a notícia "Fase final: minério entregue vale ×2 até o fim" quando ela começa.
- **[feito]** Ouro, nível e XP do jogador (barra de XP com o nível no painel; nível também no nome sobre a nave).
- **[feito]** **Escudo** na barra ESC acima do HP e nos rótulos das naves; janelas **STATUS** (C: ficha do piloto e pontos com "+1"/"+10") e **INVENTÁRIO** (I: os seis encaixes e o compartimento n/12 com a caixinha de cada item), na altura toda da tela, como as CHARACTER e INVENTORY do original; com elas abertas a nave **atira normal** (pedido do Mateus: olhar o status ou trocar de arma no meio da luta).
- **[feito]** **Tela de carregamento** entre o Decolar e a partida: baixa tudo o que a nave da raça e classe usa (as 5 naves da linha, as armas, os efeitos de V1 a V8, os sons) e aquece a placa de vídeo, para trocar de arma, evoluir ou comprar a próxima nave não travar no meio da partida; a nave já espera na zona segura da base enquanto carrega.
- **[feito]** **"CARREGANDO"** no meio da tela (encaixe, arma e segundos) enquanto a troca de arma fora da base conta (`TROCA_ARMA_S` = 3 s, regra contra trocar a cada tiro).
- **[feito]** Fim da partida: tela com o time vencedor, o placar e a contagem para a próxima.
