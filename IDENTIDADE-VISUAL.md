# Identidade visual do New AstroN

Guia obrigatório para qualquer coisa que entre no jogo: cenário, nave, inimigo, efeito, HUD, tela ou e-mail. Se algo novo não cabe nestas regras, mude o guia primeiro (no mesmo PR) e explique o porquê; não deixe o jogo e o guia divergirem.

## Conceito

**Ficção científica industrial, mid-poly hard-surface com materiais PBR, em planetas hostis ao entardecer.**

- A referência é o AstroN (naves voando baixo por cânions, lagos e bases, painel metálico verde-azulado). É **inspiração, não cópia**: nada de sprites, modelos, logos ou nomes tirados do jogo original. **Exceção, por decisão do Mateus (out/2026):** entram do AstroN original as **45 naves de jogador com classe** das raças Acron, Bellico e Shrewdo (`public/modelos/naves/<raca>/<classe>/<id>.glb`, low-poly de ~170 a ~740 triângulos, com a textura própria de cada uma; as faces do avesso de algumas são corrigidas ao carregar, `orientarFaces` em `nave.js`), os **modelos das armas** (`public/modelos/armas/`), as **texturas dos efeitos de tiro** (`public/texturas/efeitos/`) e os **sons** (`public/sons/`), cada pasta com a sua `LISTA.md`. **Também por decisão do Mateus (out/2026, mapa do Stage 6):** entram os **modelos dos monstros do Stage 6** e do **SN-4** (chefe do Stage 5), com a textura própria (`public/modelos/monstros/<esp>.glb`, com `LISTA.md`). Outra coisa do jogo original só entra com a mesma decisão explícita.
- Fora as naves de jogador, as armas penduradas nelas, os efeitos de tiro, os sons e os monstros, tudo é **feito em código** (primitivas do Three.js, shaders e ruído) **ou modelado por nós no Blender** (os modelos do mapa em `public/modelos/mapa/`, gerados por script `bpy`; fontes e scripts em `~/Documentos/new-astron-progresso/mapa-stage6/`; o Stage 6 do original foi só referência de forma e clima), sem texturas fotográficas. **Desde out/2026 (decisão do Mateus) o padrão dos modelos novos é o _sci-fi mid-poly PBR_** (ver "Padrão dos modelos" em Regras do 3D): mais polígonos que antes, chapas, frestas e desgaste no relevo de texturas compartilhadas geradas por nós, dentro de um teto de triângulos por tipo de peça, porque continua rodando no navegador e no celular. As peças low-poly facetadas que ainda não foram refeitas continuam valendo até serem trocadas.
- Três camadas de cor em toda cena:
  1. **Ambiente** quente e dessaturado (rocha, areia, céu);
  2. **Tecnologia** em cinza-metal com **neon turquesa**;
  3. **Perigo** em vermelho-laranja vivo (inimigos, alertas, tiro inimigo).

  Se uma cor nova não se encaixa em uma dessas três, provavelmente está errada. As
  exceções são as **cores de jogo do mapa** (abaixo, em "Mapa da partida"): âmbar dos
  objetivos, azul-gelo do Hélio-3 e as cores dos serviços. Elas marcam lugares
  com regra própria e só aparecem no chão, no minimapa e na interface ligada a esses
  lugares (o painel de cada serviço usa a cor da plataforma dele).

## Paleta

### Interface (HUD, telas, botões)

Tokens em `public/css/jogo.css` (`:root`). Use as variáveis; não escreva hex solto no CSS.

| Token | Hex | Uso |
|---|---|---|
| `--neon` | `#00efc0` | Destaque principal, botão primário, bordas ativas, base do seu time no minimapa |
| `--neon-escuro` | `#0a5f50` | Contorno de painéis e brilho sutil |
| `--chapa` | `#18302e` | Fundo de painel (chapa metálica) |
| `--chapa-clara` | `#2c4a46` | Borda e topo iluminado do painel |
| `--texto` | `#dff5ef` | Texto sobre painel |
| `--hp` | `#ff5a3c` | Vida, dano, inimigo |
| `--en` | `#3fa9ff` | Energia |
| `--ouro` | `#ffd166` | Ouro e recompensas |
| `--laser` | `#5ff7ff` | Cor de reserva do ícone de arma (quando a arma não traz cor) |
| `--cor-arma` | (por arma) | Cor do ícone de cada arma: a cor do projétil do original, posta no próprio SVG (`corDaArma` em `public/js/armas.js`) |
| `--emp` | `#c8d2ff` | Borda das armas no painel inferior com a nave sem sistemas (EMP), o mesmo branco-elétrico da aura |
| `--inimigo` | `#ff4a2a` | Placar e coisas do outro time no HUD (mesmo vermelho dos inimigos no minimapa) |
| `--objetivo` | `#ffb627` | Ícones dos bônus por tempo no placar (âmbar dos objetivos, de onde os bônus vêm), faixa "MINÉRIO ×2" da fase final, rótulo e barra dos objetivos |
| `--evolucao` | `#a58bff` | Painel da Evolução (título, aba ativa, selo, níveis das melhorias): o mesmo violeta da plataforma |
| `--loja` | `#ff6fd8` | Painel da Loja (título, aba ativa, selo "COMPRAR"): o mesmo magenta da plataforma |
| `--vida-aliado` | `#3f8cff` | Barra de vida sobre as naves, mineradores, escoltas e torretas do seu time (a do inimigo é `--hp`). Azul pedido pelo Mateus, um pouco mais fundo que a energia (`--en`) para não se confundir com ela |
| `--xp` | `#b6f05a` | Barra de XP e o nível (no painel e no nome sobre a nave) e o anel de "subiu de nível". Verde-lima: cor própria do HUD, fora das três camadas, longe do ouro (amarelo), da energia (azul) e do plasma (verde mais frio, só no tiro) |
| `--escudo` | `#8fd0ff` | Barra ESC do painel (12 px, listrada, acima do HP; só com escudo na nave) e a barra de 3 px nos rótulos, em cima da de vida. O mesmo azul da aura de escudo |
| `--dano-fisico` | `#6ee07a` | Ph. (físico): STATUS, INVENTÁRIO, ícones de equipamento e textos de efeito. Item sem tipo fica em `--neon` |
| `--dano-eletrico` | `#8fa0ff` | El. (elétrico), nos mesmos lugares |
| `--dano-laser` | `#ff6b8b` | Op. (laser), nos mesmos lugares. As três cores são as do original (Ph. verde, El. azul, Op. vermelho) |

- **Botão primário:** fundo `#00efc0`, texto `#032b22`, peso 700. É o mesmo turquesa do Sideral, de propósito: os dois jogos são da mesma casa.
- **Mensagens:** boas em `--neon`, ruins em `#ff8a70`, neutras em `--texto`.

### Raças

Definidas em `shared/sim.js` (`RACES[].cor`). Cada raça, classe e tier tem o seu modelo do original, com a textura dele (Acron dourada, Bellico vermelha e cobre, Shrewdo verde-oliva e areia); a cor da raça vai **só** no brilho dos motores. Mechan aparece na tela inicial apagada, com o selo "EM BREVE". O rótulo (nome e barra) usa a cor do **time**, não a da raça (ver "Times" abaixo).

### Times (cor relativa a quem olha)

Na partida 3 contra 3 a cor de time é sempre **relativa a quem olha**: o que é do **seu time** é turquesa `#00efc0`; o que é do **outro time**, vermelho (`#ff3b2a` no 3D, como o neon da base deles; `--inimigo` `#ff4a2a` no HUD). No código: `criarNave(race, { aliado })`, `criarMinerador({ aliado })`, `criarCena({ meuTime })`, `new Hud({ meuTime })`, `new Placar({ meuTime })`; `meuTime` vem do `bemvindo`.

| Onde | Como |
|---|---|
| Nave de jogador | **Marca de luz do time**: uma luz de neon em cada ponta de asa, nos encaixes de arma da ponta do modelo (`l_fire01`/`r_fire01`), o que mais aparece na câmera de perseguição. A sua nave é sempre turquesa. A cor da raça continua no brilho dos motores. Enquanto o modelo de uma nave ainda está baixando, um **losango neon** na cor do time segura o lugar |
| Minerador | Faixas de neon nos dois lados do casco e brilho dos motores na cor do time |
| Rótulo sobre a nave | Nome turquesa e **barra de vida azul `--vida-aliado`** no aliado (pedido do Mateus: azul é "do meu lado", vermelho é "inimigo"); nome e barra vermelhos no inimigo (outro time e monstros). Nas naves de jogador, só a barra em cima. Vale para naves, mineradores, escoltas e torretas |
| Etiqueta do piloto | **Embaixo** de toda nave de jogador (a sua inclusive): plaquinha de chapa escura (`rgba(8,20,19,.72)`, cantos de 8 px) com o nick na cor do time e "NV n" em `--xp` mono; borda `--neon-escuro` no aliado, vermelha apagada no inimigo e `--neon` na sua |
| Minimapa | Pontos do seu time em turquesa, do outro time e monstros em vermelho; minerador é uma bolinha menor que o quadrado das naves |
| Placar | Seu time sempre à esquerda, em turquesa; o outro à direita, em vermelho |

| Raça | Cor | Bioma |
|---|---|---|
| Acron | `#3fa9ff` azul | Aquático |
| Bellico | `#ff5a3c` vermelho | Deserto |
| Shrewdo | `#34e08a` verde | Terreno |
| Mechan | `#b15cff` roxo | Tóxico |

### Armas e efeitos

As armas de jogador são as do AstroN original (`shared/armas.js`), com o **visual do original**: cada golpe traz os ids dos efeitos dele (clarão do disparo, projétil, rastro, impacto, fim/área, armadilha) e cada efeito, as texturas (`public/texturas/efeitos/`) e a cor dominante. Desenho em `public/js/efeitos-armas.js`. Efeitos de luz são sempre **aditivos** (`AdditiveBlending`; o fundo preto das texturas do original vira transparente). Quase todos são planos deitados (compridos no rumo do tiro), o que lê bem na câmera de perseguição; o projétil ganha um plano em pé (cruz) para não sumir de lado e um brilho na cor da arma. As cores são as do original, fora das três camadas de cena (por família, em geral: feixes vermelho-rosados, metralhadoras verdes, efeitos elétricos azuis e violeta) e só aparecem em tiro, aura e ícone de arma.

| Categoria | Forma |
|---|---|
| Feixe e raio | Plano comprido com a textura do original e **núcleo claro** no meio |
| Metralhadora | Traçador fino na cor da arma (as texturas dela no original são do casco 3D da bala) |
| Canhão | Carga animada (sprite que gira os quadros do original) |
| Míssil | Casco + chama na cor da arma e rastro esfumaçado na cor do rastro do original |
| Onda | Arco que cresce com o raio de acerto |
| Lâmina e lançador | Hélice girando |
| Nova | Anel deitado crescendo + casca esférica clara |
| Mina e campo | Decalque da arma no chão girando devagar; o campo é um disco na cor da arma |
| Tiro de NPC (drones, torretas, escolta, elites) | Como antes: barra + brilho do laser e esfera do plasma; torreta e escolta na cor do time de quem atira, inimigo `#ff4a2a` |
| Explosão | `#ff9a3a` a `#ffd28a`: clarão + fagulhas que caem |

**Arma na asa:** o modelo de cada arma do original vai pendurado na nave, a do Z no encaixe `l_item` e a do X no `r_item`, com a mesma transformação do modelo da nave (sem escala própria; peças `_l`/`_r` por lado), e troca quando o piloto troca de arma. O tiro sai da boca da arma (nó `fire`) ou dos encaixes `*_fire01/02` da nave, como no original.

**Efeitos de arma na nave atingida** (qualquer nave, drone ou monstro; vêm do servidor em `dreno`/`lento`/`emp` e na lista `fx` de cada entidade): aura aditiva em volta da nave, na cor do efeito.

| Efeito | Cor |
|---|---|
| Dreno (perdendo vida) | `#d070ff` violeta, partículas **subindo** |
| Lento / paralisado | `#a8e8ff` azul-gelo, cristais **caindo** |
| Sem sistemas (EMP) e parado | `#c8d2ff` branco-elétrico, aura que **falha** + faíscas |
| Desgoverno | `#b47cff` |
| Perdendo energia | `#3fa9ff` |
| Invulnerável | `#ffe28a` |
| Escudo | `#8fd0ff` |
| Fraco | `#ff8a70` |
| Consertando | `#7dff9a` |
| Acelerado | `#7fd8ff` |
| Camuflado | a nave vira um **fantasma** `#9fb4c8` para você e os aliados; o outro time não a vê |

**Bônus na nave** (vêm do `bn` de cada nave e do `bonus` do time; `public/js/efeitos.js`): anéis aditivos deitados em volta da nave, sem partículas, um por bônus (é anel, e não nuvem, para não parecer aura de arma). No HUD, ícones âmbar com o tempo, empilhados à esquerda acima do painel (o da sonda apaga enquanto ela está suspensa em combate); no placar, só o da Medusa.

| Bônus | Cor | Raio | Jeito |
|---|---|---|---|
| Ataque (SN-4, +20% de dano) | âmbar `#ffb627` | 7,5 m | pulsa |
| Suporte (torre, regeneração) | verde `#7dff9a` | 8,2 m | abre para fora |
| Sonda (+25% de velocidade) | azul `#7fd8ff` | 6,4 m | três arcos girando |
| Medusa (time: dano e velocidade) | violeta `#e7a6ff` | 9,6 m | largo e lento |

As cores de tiro e de aura são cores de **efeito de arma**, fora das três camadas de cena: só aparecem em tiro, aura e ícone de arma, nunca em cenário ou interface comum.

### Mapa da partida: o lago de He-3 (3 contra 3)

O mapa segue `DESIGN-PARTIDA.md` e `shared/terrain.js`; o visual é inspirado no **Stage 6** do original (lago, Warp Gate alto e flutuante), com modelos nossos do Blender (`public/modelos/mapa/`, `LISTA.md` com medidas, pivôs e onde pôr cada peça) montados em `public/js/cena.js`.

**Cor de time é relativa a quem olha:** o que é do **seu time** tem neon **turquesa** `#00efc0`; o do **outro time**, **vermelho** `#ff3b2a`. Os `.glb` marcam isso pelo **nome do material**, e o cliente pinta (`public/js/mapa-modelos.js`, `pintar()`): `neon_time` (acento do time), `portal_time` (membrana do portal), `neon_doca_0`/`neon_doca_1` (luz da doca de cada time), `neon_servico` (violeta na Evolução, magenta na Loja); `neon_he3` (azul-gelo `#9fe8ff`) e `neon_objetivo` (âmbar `#ffb627`) são fixos.

| Coisa | Cor | Forma | Significado |
|---|---|---|---|
| Base (portal warp) | chapas PBR + `neon_time` | `base-warp.glb` (mid-poly PBR): estação metálica flutuando bem alto (era a ilha de rocha; pode voltar a ser pedra com o conjunto de textura `rocha`, que já existe), com o anel blindado em pé (centro a 124 m: núcleo, 12 blocos de armadura, nós com fendas e o lábio de luz do time por dentro) e aletas em cunha com o gume na cor do time, membrana girando; embaixo, tubos que convergem numa ponta de broca e um feixe fino até a água. Anel de pouso e plataformas da Evolução e da Loja flutuando sobre o lago | Nasce, pousa, conserta; zona segura |
| Entrega | `neon_time` | Arco flutuante na boca da base | Onde o minerador entrega |
| **Mineradora de He-3** | metal escuro + He-3 `#9fe8ff` + docas na cor do time dono | Plataforma de perfuração que sobe do fundo do lago: pernas de âncora e veio de cristais no fundo, casco blindado em degraus (34, 55 e 64 m) com duto de He-3 em volta, torre de perfuração em treliça até 128 m, um hangar por face (porta sempre aberta com o campo de força do time, translúcido e aditivo; lá dentro, piso, pórticos e luzes, as faixas do time até a doca e a bacia de He-3 de 19,5 m de raio: leito de minério escuro com pedras e aglomerados de cristais, a piscina de He-3 líquido no meio com o núcleo de cristais, três braços extratores e um anel de carga no teto em cima de cada uma das três baias; na frente, a plataforma de atracação e o pórtico de carga acima de 31 m) | Bloqueia passagem, tiro e visão; o minerador do time atravessa o campo e minera lá dentro; a escolta espera na porta |
| **Núcleo de He-3** | cristal `#9fe8ff` + anéis âmbar | Bipirâmide de cristal com três anéis de contenção, lascas orbitando, prato emissor e quatro agulhas flutuantes; gira mais rápido quanto menos vida | Objetivo épico (poço de cima) |
| Pulso do Núcleo | azul-gelo, puxando para o vermelho com a força | Anel e cúpula que abrem até o raio (80 m) | Área que machuca |
| Torre do buff de suporte | chapas PBR + âmbar | Mid-poly PBR no tamanho da planta (r 14 × 60 m, `ESCALA_TORRE_SUPORTE` = 1, antena até ~92 m, rótulo a 96 m): fuste sextavado chanfrado com três canais de luz âmbar, dutos, capitel com passarela, cone com bobinas e, no topo, uma antena de comunicação (mastro treliçado e a cabeça com o prato, que gira com a torre acesa); apagada esperando, acesa ativa, o modelo caído em recarga | Destrua para o buff de suporte |
| Anel de pouso da base, Evolução e Loja | chapas PBR + `neon_time` / `neon_servico` | Deque flutuante em chapas metálicas (relevo de frestas, rebites, grades e escotilhas), aro de blocos chanfrados com faixa de luz, torres de controle na borda, casco cônico com nervuras, janelas e propulsores, pilares até o fundo. No anel da base, o **H** do time no centro (só o H, nenhum texto) com o anel r 14, setas de aproximação nas diagonais e o anel r 64 em arcos; nas de serviço o centro fica livre para o ícone e o nome | Pousa, conserta, compra |
| Plataforma de pouso (ouro) | âmbar + chapas PBR | Plataforma flutuante no mesmo padrão do anel da base, setas âmbar para o centro e o prato emissor no meio; com alguém pousado, feixe de luz na cor do time de quem pousou (âmbar piscando se contestado), começando 7 m acima do deque | Pouse 6 s: ouro para o time |
| Rochas, paredes em L e borda | estratos `#b59a74` / `#9c8062` / `#765c45` / `#4f3d2e`, molhada `#33302a` (na cor do vértice, sobre a textura `rocha`) | Mid-poly PBR: paredes em estratos de espessura desigual saindo da água, cada camada uma aba saliente com a sombra do sulco embaixo, a parede em blocos (contrafortes) com fendas verticais, o alto recuando em degraus até a mesa e entulho no pé; no relevo da textura, as camadas finas, as juntas, os poros e o grão. A borda continua em montanhas com cristas até o horizonte | Bloqueio total |
| Nuvens de gás e poeira | luz `#e8d6ba`, sombra `#61788a`, He-3 `#9fe8ff` em alguns tufos baixos | Tufos instanciados (`public/js/nuvens.js`) da água até uns 45 m, em três camadas, borda suave e rala, deriva lenta; lado do sol mais claro, brilho quente contra o sol. De dentro, o tufo perto da câmera some e a nuvem fica 28% mais rala, e as gotículas em volta da câmera ficam mais densas, maiores e cor de poeira `#d9c8ad` | Passáveis; escondem quem está dentro |
| Torre sentinela | chapas PBR + neon do time | `torreta.glb`, mid-poly PBR: torre octogonal de 16 m e r 9 (sólida, `TORRETA`) com aletas e a faixa do time, em cima de um pilar octogonal que desce até o fundo do lago (cinta na linha d'água, sapata no fundo), cabeça blindada giratória com dois canos (freio de boca na cor do time), radar e sensor; caída, sobram o pé com o toco rasgado, a cabeça partida e destroços na água, com a luz do time quase apagada; o tiro é um míssil com corpo, curva e fumaça | Defesa do time na lane |
| Escolta e minerador | chapas PBR claras + faixas do time | `minerador.glb` e `escolta.glb` (mid-poly PBR): o minerador é um cargueiro com cabine, motores laterais e a moldura do contêiner (o minério de He-3 só aparece cheio); a escolta, um caça de asas enflechadas com a torre de dois canos; faixas, pontas e bocas dos canos `neon_time`; o **minerador do Núcleo** é 1,7× maior, com a carga sempre à mostra e brilho de He-3 pulsando | Mineração |

- **Âmbar = objetivo.** Rótulo de estado sobre cada um, com ícone por tipo (espada = SN-4, escudo com cruz = suporte, moeda = plataforma, setas = sonda, água-viva = Medusa, cristal com anel = Núcleo), barra de vida ou de pouso e o tempo até voltar (`public/js/objetivos.js`).
- **Azul-gelo = Hélio-3** (cristais, duto da mineradora, Núcleo, brilho na água), só no cenário; aura em nave é sempre efeito de arma.
- **Minimapa:** retângulo do mapa na paleta do lago (água, rocha, nuvens de gás em manchas `#e8d6ba` de borda suave), sua base em turquesa e a outra em vermelho, mineradora e docas, letras dos objetivos (A, S, $, V, M, N) com arco de vida ou de pouso e o tempo de recarga, torres em triângulo na cor do time, monstros em ponto vermelho redondo pelo tamanho (sonda 3 px, Armish e Chrometic 3,5, Xerxes e Bazit 4, Grande Xerxes e Anti 5,5, SN-4 7,5, Medusa 8).

### Névoa de guerra

O que o seu time não enxerga (`shared/visao.js`; ver `DESIGN-PARTIDA.md`, "Visão") fica **escuro e sem cor**, sem sumir o terreno: luz × 0,32 e 15% da cor, puxando para o frio `#1c2c33`, **nunca preto**. Borda suave (20 a 40 m), abrindo e fechando em 0,35 s. Nuvem de gás que o time não vê fica mais grossa, escura e fria (`#2c3d47`), com um **véu de gás** entre os tufos (meio-termo entre `#61788a` e `#e8d6ba`). O minimapa escurece igual. A neblina do horizonte vai de 550 a 1430 m, acompanhando o raio de visão. É um passo de tela inteira (`public/js/nevoa.js`), então vale para qualquer material.

### Água (lago de He-3)

Shader próprio (`public/js/agua.js`), superfície em `NIVEL_AGUA` (−16 m, abaixo do voo; o fundo a −60/−68): três senos de onda (~0,6 m) com normal facetada; cor rasa `#4fb3a6` a funda `#0e3f4a` por um mapa de distância às rochas (a água fica rasa e transparente perto delas); Fresnel 0,45 puxando para a cor do céu; brilho do sol em faíscas (expoente 600, força 0,45; mais que isso vira placa branca); espuma `#e9f3ea` serrilhada onde a rocha está a menos de 6 m; brilho de He-3 sobre a mineradora e os cristais; cáusticas `#bff3e6` fracas (0,12 no fundo, 0,10 na rocha) que somem com a profundidade; o fundo e a rocha molhada não recebem sombra.

### Planetas (biomas)

Cada planeta é definido por **céu (3 tons) + neblina + rocha + chão**. A neblina tem sempre a cor do horizonte, para o fundo "derreter" no céu.

| Planeta | Céu topo / meio / horizonte | Neblina | Rocha | Chão | Status |
|---|---|---|---|---|---|
| **Lago de He-3 (Stage 6)** | `#22304a` / `#9a8574` / `#ebcba2` | `#d8b993` | `#4f3d2e` a `#b59a74` em estratos | água `#4fb3a6` / `#0e3f4a`, fundo `#4a4b40` | **feito** (`public/js/cena.js`, `public/js/agua.js`): mapa da partida 3 contra 3 |
| M1 Cânion (Bellico) | `#2a0f1c` / `#a8402a` / `#f59a45` | `#c96a3a` | `#5a2f1e` a `#a8683e` em estratos | `#6e3f24` a `#9b6239` | saiu (substituído pelo lago em out/2026) |
| Base Shrewdo | `#1d3b5c` / `#6f9cc4` / `#d8e6ee` | `#b9cdd8` | metal `#5d6866` | concreto `#7a817f` | planejado |
| Vale tóxico (Mechan) | `#1a0820` / `#6a1f5e` / `#c0508a` | `#7a3460` | `#4a3328` | `#5c4a2a` com poças `#7dff6a` | planejado |
| Mar raso (Acron) | `#04131f` / `#0f4c6b` / `#5fc9d6` | `#3e8fa0` | `#2c3d45` | água `#0f5a6e` | planejado |

## Regras do 3D

- **Modelos novos no padrão mid-poly PBR** (seção abaixo); as peças low-poly antigas continuam facetadas (`flatShading: true`) até serem refeitas. Nada de superfícies lisas brilhantes nem de plástico: o metal é gasto e fosco.
- **Metal sem mapa de ambiente:** `metalness` até **0.5** e `roughness` de **0.4 a 0.8** (nas peças PBR a textura varia a rugosidade de 0,38 a 0,92 em volta disso: risco liso, sujeira áspera). Metal alto sem nada para refletir fica preto ou estoura no reflexo do sol; as chapas PBR usam 0,3.
- **Neon:** material com `color` e `emissive` iguais e `emissiveIntensity` entre **0.8 e 1.2**. Acima disso o tone mapping (ACES) puxa para o branco e a cor some. Luz piscando vai de 0.1 a 1.2.
- **Uma cor de destaque por objeto.** Hangar e portal: cinza + neon da base (turquesa na sua, vermelho na do outro time). Nave de jogador: a textura do modelo do original + neon do time nas pontas das asas.
- **Monstros são os do original** (Stage 6 e o SN-4), cada um com a textura própria; a regra antiga "pele escura e olho vermelho" não vale para eles. **O perigo fica no vermelho da interface:** rótulo e barra vermelhos, ponto vermelho no minimapa e o brilho `#ff4a2a` em todo tiro de monstro. Cada um tem silhueta própria (`public/js/monstros.js`):

  | Monstro | Forma | Papel |
  |---|---|---|
  | Armish | peixe-girino compacto (12 m) | pequeno do acampamento da base |
  | Chrometic | peixe-diabo comprido (12 m) | pequeno do acampamento da base |
  | Xerxes | dragão de asas de morcego (13 m) | pequeno do acampamento do centro |
  | Bazit | criatura de asas abertas (13 m) | pequeno do acampamento do centro |
  | Grande Xerxes | o dragão 2× maior e vermelho (26 m) | grande do centro |
  | Anti | forma larga e achatada (26 m) | grande do centro |
  | SN-4 | máquina suspensa com quatro garras (30 m) | buff de ataque |
  | Ancient Medusa | água-viva de cúpula dourada (48 m), centro a 18 m, cúpula respirando, sangue e bolhas do original em volta | chefe épico |
  | Sonda errante | inseto azul (8 m), menor que a nave | neutra, foge |

  **Ataques de monstro** (sempre com o brilho `#ff4a2a`): pedra marrom girando; onda elétrica = anel azulado; bala explosiva = bola laranja; feixe óptico = feixes rosados; controle = leque de raios azul-violeta; mísseis com fumaça; armadilha = orbes pulsando; chama = cone laranja; campo elétrico = disco azulado com borda vermelha.
- **Área de pouso é sempre marcada no chão**, com a cor do que ela é: anel com o neon da base (turquesa na sua), placa violeta da Evolução, placa magenta da Loja, plataforma âmbar de ouro (`AREAS_POUSO`). Nenhum anel turquesa no chão pode existir fora da sua base, para o jogador não confundir.
- **Tudo projeta sombra** (`castShadow`), e o terreno a recebe.

### Padrão dos modelos: sci-fi mid-poly PBR

Decisão do Mateus (out/2026), a partir da plataforma de pouso modelada no Blender: o cenário passa de low-poly facetado para **mid-poly hard-surface com materiais PBR**.

- **Mid-poly:** o meio-termo entre o low-poly (faces chapadas, só cor) e o high-poly de cinema. A malha leva o **volume** (quinas chanfradas, blocos, aros, nervuras, peças de verdade) e polígono só onde aparece.
- **Hard-surface:** coisa construída: chapas, frestas, rebites, grades, escotilhas, desgaste nas quinas.
- **PBR:** cada superfície tem cor, metal, rugosidade e relevo. **O detalhe fino fica no relevo da textura (normal map), não na malha**: frestas entre chapas, rebites e grades das construções, e as fissuras e estratos finos das rochas.

**Teto de triângulos por peça** (o arquivo `.glb` inteiro; conferido em `tests/modelos-mapa.test.mjs`):

| Tipo de peça | Triângulos |
|---|---|
| Teto de qualquer peça (só para as únicas e grandes: mineradora, portal warp, Núcleo) | **até 50 mil** |
| Plataformas e torres | **10 a 15 mil** (as menores podem ficar abaixo: a de serviço tem r 23) |
| Rochas e bordas | **até 20 mil**, com o detalhe no relevo da textura |
| Decoração (coral, alga, cristais, ruínas) | **até 2 mil** (aparecem dezenas de vezes) |

A conta que importa é a da cena: somando as cópias, o mapa inteiro deve ficar em uns **500 a 700 mil triângulos** e uns **5 MB** de download (modelos + texturas).

**Como o arquivo sai** (`public/modelos/mapa/LISTA.md` tem o contrato de cada peça):

- glTF binário **com normais e UV** (liso, com as quinas vivas marcadas pelo ângulo, ~32°) e **comprimido com Draco** (o decodificador vem do próprio three, `/vendor/addons/libs/draco/gltf/`).
- **Sem imagem dentro do glb.** As texturas são **compartilhadas pelo mapa inteiro** (`public/texturas/mapa/`, com `LISTA.md`): um **atlas de chapas 2 × 2** (*trim sheet*: chapa lisa, com grade de ventilação, com escotilha e dividida em quatro), em três imagens WebP de 1024²: cor (quase cinza), metal/rugosidade (o canal do glTF: verde = rugosidade, azul = metal) e relevo (normal, convenção glTF). Cada face da malha mapeia **um quadrante inteiro** (uma chapa com a fresta na borda); face comprida vira uma chapa esticada só no comprimento. A **rocha** é outro conjunto, `rocha`: rocha sedimentar em estratos que **repete sem emenda** (u ao longo da parede, v na altura, um ladrilho a cada 24 m; as faces deitadas projetam no plano). Texturas geradas por nós (scripts `texturas_pbr.py` e `texturas_rocha.py`), nunca fotográficas.
- Os materiais se chamam **`pbr_<conjunto>[_variação]`**: `pbr_painel` (deque), `pbr_painel_escuro` (casco, pilares), `pbr_painel_claro` (aro, torres) e `pbr_painel_grafite` (o metal escuro da mineradora) ganham as texturas do conjunto `painel` e a cor vem do **fator** do glb; `pbr_tinta` (sinalização branca) e `pbr_vidro` são lisos, sem textura. A rocha é **um material só**, `pbr_rocha` (conjunto `rocha`, com as cáusticas da água), e o tom de cada estrato vai na **cor do vértice**: um material por estrato abria frestas na costura, porque o Draco quantiza cada material numa grade própria. Peça grande de vários tons segue o mesmo caminho. Conjunto novo entra em `TEXTURAS_PBR_MAPA` (`public/js/insumos.js`).
- **Os neon continuam iguais**: material separado com o nome do contrato (`neon_time`, `neon_servico`, `neon_objetivo`, `neon_he3`...), pintado pelo cliente; `neon_luz` é a luz quente fixa das balizas (`#ffe2b8`). Faixa de luz, janela e farol são geometria própria, nunca pintados na textura (a cor do time é relativa a quem olha).
- **Sinalização é geometria**, não textura: anéis, tracejados, setas e o H são faces finas 2 cm acima do deque, nítidas de perto, sem texto escrito.
- Superfícies abertas e planas (deque, pintura) saem com a normal **para cima**: o cliente desenha dos dois lados, mas a luz e a sombra seguem a normal.

### Escala de referência

| Coisa | Tamanho |
|---|---|
| Nave de jogador | 9,6 m (1ª nave da linha) a 11,6 m (5ª) na média de comprimento × envergadura; a Assault 4% maior, a Mobile 3% menor; envergadura no máximo 1,45× esse tamanho (o modelo é escalado ao carregar, em `nave.js`) |
| Minerador | ~6 m de comprimento, ~4 m de largura (metade da nave), voa na mesma altura (`HOVER`) |
| Monstros | sonda 8 m, Armish/Chrometic 12, Xerxes/Bazit 13, Grande Xerxes/Anti 26, SN-4 30, Medusa 48 de largura × ~43 de altura (acerto com raio 4 a 20 m, `ESPECIES`) |
| Altura de voo | 10 m acima do chão (`HOVER`) |
| Nave pousada | 1,4 m (`ALTURA_POUSADO`), com trem de pouso visível e motores quase apagados |
| Rocha (quadrante, parede em L, borda) | quadrante 360 × 135 m, topo 74–110; paredes em L com 40 m de espessura, topo 84–100; borda 100–165 m (montanhas até o horizonte); começa com um degrau vertical de 30% da altura (nem de lado a nave sobe) |
| Mapa | 3000 × 2240 m (`MAP_HALF_X`, `MAP_HALF_Z`) |
| Água | superfície a −16 m (`NIVEL_AGUA`), fundo a −60/−68 m |
| Base de time | zona segura de raio 170 m (`BASES`), num bolsão no fim da lane; portal warp de 31 a 224 m (anel de raio 46 com centro a 124 m) |
| Lane | 180 m de largura (`LANE`), sem pista |
| Mineradora | 140 × 230 m, sólida até 95 m; do fundo (−64) à ponta da torre (134 m) |
| Plataformas (base, serviço, ouro) | deque no piso da área de pouso; **aro até 1 m e torres de controle até 3,5 m acima do deque**, só na borda, fora do círculo de pouso (a nave voa uns 8 m acima do deque) |
| Decoração | acima do chão de voo **até 2,5 m** (pedras que furam a água, balizas; a nave passa por cima, sem colisão); **embaixo da água**, qualquer altura; **acima de 30 m** podem flutuar peças sem colisão (portal, pórtico da doca, arco da entrega, estabilizadores do Núcleo; nuvens de gás até uns 45 m são passáveis por regra) |
| Torreta da lane | 16 m de altura, raio 9 m (canhão na altura de voo), a 133 m do eixo da lane (140 m de largura); o pilar embaixo d'água não colide |
| Construções (mineradora, torre do buff de suporte, torretas) | **sólidas**: nave e tiro batem. Tamanho e posição saem de `shared/obstaculos.js`, nunca só do `cena.js` |

## Luz e atmosfera

- **Sol quente e não muito alto** (no lago, elevação ~25°), que desenha silhuetas e sombras longas. A direção do sol (`SOL_DIR`) bate com o disco desenhado no céu.
- **Luz hemisférica** com o céu quente em cima e, no lago, verde-azulado embaixo (`#3a6e69`, a luz que volta da água; mais escuro, o fundo da ilha do portal ficava preto): sombra nunca é preta pura.
- **Tone mapping ACES**, com exposição em torno de 1.05.
- **Poeira flutuando** em volta da câmera em todo planeta com atmosfera (dá noção de velocidade).
- **Ordem dos transparentes** (nenhum grava profundidade): água (`renderOrder` −2), nuvem (−1), efeitos (0); assim o tiro na frente da nuvem aparece inteiro.

## Câmera

- **Perseguição em terceira pessoa**, como no AstroN: atrás e acima da nave, que fica no **terço de baixo da tela**, centralizada.
- A câmera acompanha a curva com atraso suave e **nunca entra na parede**: aproxima até enxergar a nave.
- O boost abre o campo de visão (65° para 74°).
- **V** troca a distância (três modos) e **T/G**, PageUp/PageDown ou a **roda do mouse** sobem e descem a câmera, de ~20° por baixo da nave a ~72° quase de cima; o ângulo fica guardado no navegador. Quanto mais de cima, mais a câmera mira na própria nave, para ela não sumir embaixo do painel.

## Interface

- **Painel inferior em chapa metálica** (degradê `--chapa-clara` para `--chapa`, cantos de cima mais arredondados, contorno `--neon-escuro`). Barras de HP e EN com rótulo à esquerda e número à direita, em fonte mono. Embaixo delas, uma **barra de XP** mais baixa (12 px) em `--xp`, com "NV n" à esquerda e "xp / próximo" à direita ("máx." no nível 20).
- **Tamanhos do painel inferior e da Loja (desktop):** painel inferior com 940 px de largura, barras HP/EN 26 px e ESC/XP 20 px, ícones de arma e item 26 px, linha de recarga 3 px; em telas baixas a cena sobe um pouco (`setViewOffset`: 54 px em 720 de altura, nada a partir de ~980 px) para a nave e a dica de pouso não ficarem embaixo do painel. Loja e Evolução quase na largura toda (`min(1720px, 100% − 32px − lateral)`, altura até o painel inferior, cartões a partir de 230 px, ícones 28 px); menu de armas 920 px.
- **Recall (volta à base):** quem canaliza vê, no centro da tela acima da nave (a 26% do alto, longe da barra do pouso na plataforma), um painel escuro com borda `--neon-escuro` e brilho turquesa: "Voltando à base · 3,2 s" em `--neon` (segundos em mono) e a barra `--neon` enchendo. No 3D, qualquer nave canalizando fica dentro de uma **coluna de luz** aditiva na **cor do time** (turquesa `#00efc0` do seu, vermelho `#ff3b2a` do outro), de ~12 m de diâmetro e ~46 m de altura, que some no alto (cor dos vértices até o preto) e acende e afina com o progresso, com três anéis finos subindo cada vez mais rápido e um clarão na nave; ao sumir e ao aparecer na base, um feixe alto e curto (0,7 s) na mesma cor. Nada no chão (anel turquesa no chão é só pouso). No celular, o botão BASE (64 px) fica à esquerda do POUSAR e acende em `--neon` enquanto canaliza.
- **Subiu de nível:** dois anéis finos `--xp` (aditivos) abrindo em volta da nave até ~14 m e subindo, com um clarão suave, por 1,2 s; vale para qualquer nave (a sua e as dos outros). Notícia "Nível n! HP máximo maior".
- **Ouro e XP do monstro abatido** (`hud.flutuante`, camada `#flutuantes` por cima dos rótulos; só na tela de quem matou, com os valores do servidor): sobe do lugar da morte, acima do alto do monstro, "+n ouro" em `--ouro` (mono 22 px) e embaixo "+n XP" em `--xp` (mono 20 px), com contorno escuro para ler sobre a água; aparece num estalo (escala 0,7 → 1), sobe ~70 px freando e apaga no último terço de 1,5 s. **Crítico:** "CRÍTICO" em `#ff9a3a` (o laranja da explosão), `system-ui` 800 com letras espaçadas e brilho laranja, que sai do corpo do alvo a cada golpe crítico seu e vai em cima do ouro quando o golpe final foi crítico. O jogo desenha a **30 fps** (`public/js/quadros.js`), a prévia da Evolução também.
- **Pouso na plataforma de ouro:** a dica diz "Pouse 6 s: ouro para o time" (pousado: "sem tiro enquanto pousada") e, acima dela, a barra do pouso enchendo até 6 s, com contestado e recarga.
- **Minimapa** no canto superior esquerdo, **placar** no superior direito (na mesma chapa do painel: minério do seu time em turquesa à esquerda, tempo `mm:ss` em fonte mono no meio, que pisca em `#ff8a70` no último minuto, minério do outro time em vermelho à direita; embaixo de cada número, o bônus de time ativo (Medusa) como ícone de traço + segundos; na **fase final** (últimos 3 min), uma faixa âmbar "MINÉRIO ×2" na largura do placar, separada por um fio âmbar, que pisca ao começar), **notícias** logo abaixo do placar (descem junto quando a faixa aparece), **avisos** no centro da tela.
- **Tela de fim de partida** (`#fim-partida`): painel em chapa no alto e centro, sem bloquear o jogo, com "VITÓRIA" (turquesa com brilho), "DERROTA" (vermelho com brilho) ou "EMPATE" (texto claro), uma frase curta, o placar grande (seu time × outro) e "Nova partida em Ns".
- **Menu de armas** (`#menu-armas`, Q edita a arma do Z, E a do X; um elemento só, com o título "Arma do Z" / "Arma do X"): painel na mesma chapa do painel inferior, no **alto e centro** da tela, para a nave continuar à vista (o jogo não pausa). Com 18 a 28 armas por raça e classe, ele **rola**: em cima, "SUAS ARMAS" (as de fábrica e as compradas), na ordem das categorias do original, com as teclas 1 a 9 e 0 nas dez primeiras; embaixo, apagadas e agrupadas por categoria, as que estão "NA LOJA". Cada carta: tecla, ícone e nome em português, nível da arma ("NV 3", mono, `--neon`), etiquetas de tipo de dano (LASER, FÍSICO, ELÉTRICO) e papel (ATAQUE; BLOQUEIO, REFORÇO e SUPORTE com contorno `--neon-escuro` e texto `--neon`), dano / energia / recarga da versão e uma linha do que a arma faz. A arma deste encaixe tem borda `--neon` e o selo "EM USO"; a do outro encaixe, borda tracejada `--neon-escuro` e o selo "NO X" (ou "NO Z"). Linha da troca entre o título e as cartas: "Na base: troca livre" em `--neon`, "Fora da base: trocar trava o encaixe por 3 s" em texto, e com a recarga contando "Troca do Z em recarga: 2,1 s" em `#ff8a70`, com as outras cartas apagadas (0,4). **Ícone de arma** (SVG de traço, sem preenchimento): um desenho por categoria (traços paralelos ou em leque para feixe e metralhadora, carga para canhão, foguete para míssil, hélice para lâmina, espinhos para mina, anel para nova, escudo/raio para dispositivo), na **cor do projétil do original** (`--cor-arma`).
- **Painel da Loja e da Evolução** (`#servico`, um elemento para os dois; `public/js/servicos.js`): abre sozinho com a nave pousada e parada na plataforma do serviço da própria base, na mesma chapa do painel inferior, no **alto e centro** (como o menu de armas, que abre por cima dele). A **cor do serviço** é a da plataforma no chão: borda de cima, título com brilho, aba ativa e selos em `--loja` (magenta) na Loja e `--evolucao` (violeta) na Evolução. No cabeçalho, o **ouro em destaque** (`--ouro`, mono, 20 px, com brilho) e o botão ✕. Abas: Loja = Armas · Evoluir · Armaduras · Itens. Na aba Armas, só as da raça e da classe, com **filtro por categoria** (pílulas "Todas 26 · Feixe 6 · ..." na cor do serviço) e, em cada cartão, o nome em português com o original em inglês pequeno embaixo, a linha do que faz e a linha mono de dano / recarga / energia. Na aba Evoluir, um cartão por arma possuída com "NV n" (a versão do original, V1 a V5) mono na cor do serviço ao lado do nome, o que muda na próxima versão, o nível de piloto que ela pede e os tracinhos do nível na cor do serviço; selo "EVOLUIR" ou "MÁX." apagado (versão não pede nível); Evolução = Nave · Mineradores do time · Torretas. Na aba Torretas: um cartão com o nível do time (tracinhos como nas melhorias) e um por torreta do time, com a barra de vida fina em `--neon` e o selo "DE PÉ · n%" (é seu), "RECONSTRUIR" com o preço (caída; barra vazia tracejada em `#ff8a70`) ou "SUBINDO" apagado; ícones de torreta e de reconstruir (seta para cima) em traço `--neon`. **Cartões** em grade (mín. 150 px): ícone de traço e nome, uma linha de efeito, preço em `--ouro` mono ("120 ouro") e o selo do estado à direita: "COMPRAR" / "ESCOLHER" / "NÍVEL n" na cor do serviço (disponível); "COMPRADA · Q/E equipa" e "EQUIPADA" em `--neon` com borda neon (é seu); "SEM OURO" com preço e selo em `#ff8a70`; "PEDE NV 10", "JÁ TEM MELHOR", "CHEIO 3/3", "MÁX." e "COMPLETA" apagados (0,45). Na Evolução da nave (aba Nave), cinco cartões com a linha de naves da raça e da classe: nome e "NV n", **miniatura 3D** da nave (renderizada uma vez por modelo, `public/js/vitrine.js`), HP / energia / velocidade com a diferença para a atual em `--neon` (e a regeneração em voo nas Bellico), preço em `--ouro` e o selo: "ATUAL" em `--neon` com borda neon, "COMPRAR" na cor do serviço, "PEDE NV n", "SEM OURO" e "JÁ PASSOU" apagados. Melhorias dos mineradores com tracinhos de nível acesos na cor do serviço. Embaixo, uma linha com a resposta do servidor (boa em `--neon`, ruim em `#ff8a70`). **Ícones da Loja/Evolução** (SVG de traço, como os de arma): armas com o próprio ícone de arma; armadura = escudo `--neon` com 1 a 3 divisas; Kit de reparo = cruz em quadrado `--hp`; Célula de energia = bateria com raio `--en`; Casco de carga em `--hp`, Mais mineradores, Blindagem e Motor de carga em `--neon`. Fechado com ESC ainda pousado, a dica de pouso vira botão: "Loja · Enter ou toque abre · L decola".
- **Itens no painel inferior** (`#itens-nave`, ao lado das armas): "R · ícone ×2" e "F · ícone ×1", no mesmo formato das armas (a letra em `--neon`, a quantidade em mono), com a linha de 2 px da recarga do item; sem nenhum, o botão fica apagado (0,4). Clicar (ou tocar) usa o item.
- **Armas no painel inferior:** as duas, uma em cima da outra, como "Z · ícone nome" e "X · ícone nome" (a letra em `--neon`), com uma linha fina de 2 px embaixo de cada uma que enche conforme a recarga daquele encaixe (`--neon` pronta, `--texto` apagado recarregando, `--hp` se falta energia para o próximo disparo). Sob EMP, as duas ficam apagadas com a borda `--emp`. Com a recarga de troca contando, o ícone do encaixe apaga (0,4), a linha mostra a troca enchendo em `--texto` e a contagem aparece ao lado ("2,1 s", mono, `--texto`), no celular também. Clicar abre o menu daquele encaixe. No celular o nome some (fica "Z · ícone").
- **Tela inicial em dois passos** (na mesma chapa): "1 Escolha sua raça" com um cartão por raça (Mechan apagada, não clicável, com o selo "EM BREVE"); depois "2 Escolha sua classe", com um botão de voltar com o nome da raça na cor dela e três cartões (Assault, Mobile, Functional) com a especialidade, a primeira nave da linha e barras de HP (`--hp`), energia (`--en`), velocidade (`--neon`) e regeneração; embaixo, a **prévia 3D** da primeira nave girando e a linha das próximas ("Na Evolução: Falcon (NV 5) › Eagle (NV 10) › ..."). Botão de som (M) embaixo do Decolar.
- **Tela inicial larga** (desktop): janela de até 1480 px em duas colunas; à esquerda nome, raça/classe, prévia e Decolar; à direita, em cima, a escolha dos **TIMES** ("3 contra 3" em mono apagado), depois "COMANDOS" em lista "tecla · ação" (15 px), um embaixo do outro, em 1 a 3 colunas conforme a largura, com o modo de teste e o volume embaixo. Cabe sem rolar em 1920×1004, 1366×768 e 1280×720 (telas baixas apertam título, margens, prévia e linhas). **Escolha dos times** (`#escolha-times`, `public/js/escolha-times.js`): duas caixas lado a lado na chapa escura `#0f1e1d` com a faixa de 3 px à esquerda na cor do time, **SEU TIME** (`--neon`) e **INIMIGO** (`--inimigo`), cada uma com o resumo à direita ("Você + 1 computador", "Só você", "3 computadores", "Nenhum computador"), as **três vagas** (a sua cheia em `--neon` com "VOCÊ" em `#032b22`; computador "IA" em mono com borda e texto na cor do time e fundo dela a 12–14%; livre tracejada e apagada, "LIVRE") e o **−/+** com a conta em mono 18 px na cor do time (apagado a 0,3 no limite: 0 a 2 no seu time, 0 a 3 no inimigo). Clicar numa vaga também escolhe. Embaixo, uma nota apagada: gente tem prioridade e, com a partida rolando, os computadores só completam o que falta. No celular, vagas e botões com 44 px.
- **Som:** os efeitos do original (`public/sons/`, WAV) tocam pelo `public/js/sons.js`: disparo na posição do tiro, impacto, explosão e os de interface (subir de nível, compra, erro, painel). Volume pela distância (cheio até 60 m, some aos 900 m), pan estéreo pela direção, no máximo 6 vozes por som e 24 no total (metralhadora não estoura). **M** liga e desliga; o estado fica no navegador e aparece no HUD (botão pequeno ao lado do ping: alto-falante de traço com ondas e "Som ligado", ou com um "x" e "Som desligado" em `#ff8a70`) e na tela inicial (botão "Volume · Som ligado" embaixo do Decolar). Os dois botões abrem a **janela de volume** (`#volume`, `public/js/volume.js`): fundo escurecido por cima de tudo e, no centro, a chapa do painel com a borda de cima em `--neon`, título "VOLUME" com brilho e ✕; duas barras, **Música** e **Efeitos**, cada uma com o nome em maiúsculas, a porcentagem em mono `--neon` e a barra (trilho escuro, parte cheia e pino em `--neon` com brilho), mais uma nota pequena embaixo; no pé, o botão de mudo com o estado e a tecla M (borda e texto em `#ff8a70` quando mudo, e as barras apagam a 0,45). Fecha no ✕, no ESC ou clicando fora; o jogo não pausa, mas não sai tiro com ela aberta. No celular, barras e botões com 44 px de altura.
- **Barra do time** (`#companheiros`, `public/js/companheiros.js`): no alto e no centro, entre o minimapa e o placar, um card por piloto do seu time na chapa do painel (204 px; 156 px abaixo de 1100 px): miniatura da nave (`vitrine.js`), nick (computador com o selo "IA"), abates de jogador inimigo em mono com ícone de mira à direita e a barra fina de vida em `--hp` embaixo. O seu card vem primeiro, com borda `--neon` e brilho. Morto: card a 45% e miniatura em cinza. Companheiro de nave Functional: cursor de clique e um símbolo de portal no canto; o clique abre a caixinha (chapa escura, borda `--neon`, "Teleportar até NOME?", Teleportar em `--neon` cheio e Cancelar; apagada com o motivo se alguém está abatido; ESC fecha só ela). O salto tem um feixe de luz na saída e na chegada. Com STATUS/INVENTÁRIO aberto até 1760 px e no celular, os cards viram uma coluna à esquerda embaixo do minimapa, sem miniatura.
- **Times** (`#times`, `public/js/times.js`; tecla **P** ou o botão "Times" com o ícone de duas pessoas, ao lado do botão de som no HUD), **só de consulta** (os computadores se escolhem na tela inicial): janela com fundo escurecido, na chapa do painel com a borda de cima em `--neon`, como a de volume, mais larga (560 px). Duas colunas: **SEU TIME** (título `--neon`) e **INIMIGO** (título `--inimigo`), cada uma com "n/3" em mono e as três vagas. Vaga ocupada: linha em `#0f1e1d` com faixa de 3 px à esquerda na cor do time, nick (o seu com o selo "VOCÊ"; o computador sem o "(IA)" e com o selo "IA", mono, `--neon` no seu time e `#ff8a70` no inimigo), "NV n" em `--xp` mono e abates/mortes em mono apagado; morto, o nick apaga. Vaga livre: linha tracejada e apagada, "Vaga livre", sem botão. Embaixo, uma linha apagada: computador se escolhe antes de decolar, e o que cada um faz. No celular as colunas ficam uma embaixo da outra, com linhas de 44 px. O nick do computador é sempre "NOME (IA)" também na etiqueta embaixo da nave.
- **Janelas laterais STATUS e INVENTÁRIO** (`.janela-lateral`, chapa do painel com a borda de cima em `--neon`, coladas à direita na **altura toda da tela** (rolam por dentro), uma de cada vez; STATUS 500 px (`--larg-status`), INVENTÁRIO 560 px (`--larg-inventario`); botões "Status" (C) e "Inventário" (I) ao lado de Som e Times no HUD; ESC fecha). Abertas, a variável `--lateral` do `#hud` abre espaço: placar e notícias vão para a esquerda da janela, o painel inferior desliza e a Loja e o menu de armas encolhem (até 1500 px de largura, o painel inferior esconde Ouro/Abates/Vel.). STATUS (`public/js/status.js`): ficha do piloto (nick e NV, raça · classe · nave, ouro, XP, escudo, HP e energia com barrinha), "N PONTOS LIVRES" em `--xp` e uma linha por atributo (**Durabilidade (HP), Energia, Físico, Elétrico, Operacional**, por extenso; a Durabilidade com a borda em `--hp`) com a borda esquerda na cor do tipo, o valor, a barra x/99, a mini-tabela Arma Z / Arma X / Resist. (nas colunas de arma, o **dano real por disparo**, já multiplicado: todos os projéteis, canos e a rajada de um aperto do gatilho × o poder, ex. Metralha Larga "6×6" com +20% = 43,2; vale para qualquer arma, a sem dano mostra "—"; a conta e a % ficam no title) e os botões **"+1" e "+10" empilhados**; passar o mouse abre o detalhe à esquerda, com "Com +1 ponto: ..." em `--xp`. INVENTÁRIO (`public/js/inventario.js`): ouro no cabeçalho, tabela de tipos, miniatura da nave, seis encaixes e "NO COMPARTIMENTO n/12"; clicar num item abre a **caixinha** junto dele (chapa escura, borda `--neon`, título com onde o item está e o nome, opções empilhadas: Equipar, Vender com o valor em `--ouro`, "Evoluir Vn → Vn+1" com o preço; a que não dá agora fica apagada com o motivo em `#ff8a70`; no encaixe: Tirar/Trocar e Evoluir; ESC fecha a caixinha primeiro).
- **Ícones de equipamento** (`public/js/equipamento.js`, SVG no estilo dos de arma, na cor do tipo de dano): escudo = bolha sobre disco, armadura = casco de placas, potenciador = cápsula com o sinal do efeito. Na Loja, as abas Escudos, Armaduras e Potenciadores (filtro Todos/Ph./Op./El./Gerais) só compram: selos "NO INVENTÁRIO ×n" / "NA NAVE", arma já comprada "COMPRADA · NO INVENTÁRIO", e o cabeçalho "Compartimento n/12" (vermelho-claro e cartões apagados com "COMPARTIMENTO CHEIO" quando lota).
- **Tela de carregamento** (`#carregamento`, `public/js/carregamento.js`): o mesmo céu da entrada e uma chapa de até 760 px com a borda de cima em `--neon`; "NEW ASTRON", "PREPARANDO A DECOLAGEM" em `--neon` com letras espaçadas piscando, e "Raça · Classe · Nave" (raça na cor dela, nave em `--neon`); porcentagem em mono 34 px `--neon` com brilho, barra de 16 px `--neon` com brilho e embaixo "Carregando · Armas 12/24"; uma linha por grupo (naves, armas, efeitos, sons, miniaturas, servidor, placa de vídeo) com marca (anel girando enquanto carrega, ponto `--neon` pronto), nome, contagem em mono (`--neon` pronto, `#ff8a70` com falha) e fio de 3 px enchendo; rodapé com a explicação e "Esc cancela"; fica acima do HUD e some esmaecendo em 0,2 s.
- **Menu de armas e INVENTÁRIO com cópias:** uma carta por cópia, cada uma com o seu NV; a segunda diz "2ª cópia". Na Loja, arma com os selos "NO INVENTÁRIO ×n", "NA NAVE", "DE FÁBRICA" e "MÁXIMO ×2".
- **"CARREGANDO"** (`#carregando`): pílula escura translúcida no meio da tela, no alto (`top: max(168px, 20%)`, no céu, longe da linha de tiro), uma por encaixe em troca: "CARREGANDO" em `--neon` com letras espaçadas piscando devagar, "Arma Z/X", ícone e nome da arma, segundos em mono e uma barra `--neon` enchendo; some quando a contagem acaba ou a nave morre.
- **Modo de teste:** painel `#painel-teste` à esquerda, embaixo do minimapa, na chapa do painel com **borda tracejada `--ouro`** (é ferramenta, não jogo): título "MODO DE TESTE" em `--ouro` e quatro botões (+1000 ouro, +100 XP, +1 nível, Nível 20). O relógio do placar mostra "TESTE". Na tela inicial, a caixa "Modo de teste" com a explicação embaixo, marcada em `--ouro`.
- **Tipografia:** `system-ui` para texto e `ui-monospace` para números. **Tamanhos (desktop): corpo 18 px; todo texto da interface ficou 4 px maior** (pedido do Mateus, out/2026), ex.: kbd 15–20 px, título de janela 17 px, cartão da Loja 16 px, selo 13,5 px, ouro da Loja 24 px; o celular (media queries e `.toque`) ficou como era. Nada pode cortar em 1280×720. Título "NEW **ASTRON**" com letras espaçadas e "ASTRON" inteiro em `--neon` com brilho.
- **Celular:** joystick à esquerda; Z, X e SHIFT à direita (mesma disposição do AstroN), com ARMA Z e ARMA X em cima (cada uma sobre a coluna do botão de tiro do seu encaixe). No menu do celular, as cartas mostram só ícone, nome e selo. O painel da Loja/Evolução fica entre a borda esquerda e o placar (sem cobrir os botões), com cartões menores (efeito em 9,5 px), abas mais altas para o dedo e a lista rolando com o dedo. Área de toque com no mínimo 64 px.
- **Idioma:** português do Brasil, frases curtas e diretas, sem jargão técnico para o jogador ("Nave destruída · renascendo na base em 3s").

## Checklist antes de abrir o PR

- [ ] As cores novas saem da paleta acima (ou o guia foi atualizado no mesmo PR).
- [ ] Peça nova no padrão mid-poly PBR, dentro do teto de triângulos do tipo dela (`npm test` confere), texturas compartilhadas (nada de imagem dentro do glb), metal ≤ 0.5, neon ≤ 1.2.
- [ ] Inimigo em vermelho, tecnologia em turquesa, ambiente em tons quentes.
- [ ] Escala conferida contra a tabela (a nave cabe e passa por cima da decoração).
- [ ] Testado com print no navegador (base, corredor e mundo aberto), sem erro no console.
- [ ] Texto em PT-BR.
