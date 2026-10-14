# Identidade visual do New AstroN

Guia obrigatório para qualquer coisa que entre no jogo: cenário, nave, inimigo, efeito, HUD, tela ou e-mail. Se algo novo não cabe nestas regras, mude o guia primeiro (no mesmo PR) e explique o porquê; não deixe o jogo e o guia divergirem.

## Conceito

**Ficção científica industrial, low-poly facetado, em planetas hostis ao entardecer.**

- A referência é o AstroN (naves voando baixo por cânions e bases, painel metálico verde-azulado). É **inspiração, não cópia**: nada de sprites, modelos, logos ou nomes tirados do jogo original. **Exceção, por decisão do Mateus (out/2026):** entram do AstroN original as **45 naves de jogador com classe** das raças Acron, Bellico e Shrewdo (`public/modelos/naves/<raca>/<classe>/<id>.glb`, low-poly de ~170 a ~740 triângulos, com a textura própria de cada uma; as faces do avesso de algumas são corrigidas ao carregar, `orientarFaces` em `nave.js`), os **modelos das armas** (`public/modelos/armas/`), as **texturas dos efeitos de tiro** (`public/texturas/efeitos/`) e os **sons** (`public/sons/`), cada pasta com a sua `LISTA.md`. Outra coisa do jogo original só entra com a mesma decisão explícita.
- Fora as naves de jogador, as armas penduradas nelas, os efeitos de tiro e os sons, tudo é **feito em código** (primitivas do Three.js, shaders e ruído), sem texturas fotográficas. O estilo low-poly é escolha estética e de desempenho: roda no navegador e no celular.
- Três camadas de cor em toda cena:
  1. **Ambiente** quente e dessaturado (rocha, areia, céu);
  2. **Tecnologia** em cinza-metal com **neon turquesa**;
  3. **Perigo** em vermelho-laranja vivo (inimigos, alertas, tiro inimigo).

  Se uma cor nova não se encaixa em uma dessas três, provavelmente está errada. As
  exceções são as **cores de jogo do mapa** (abaixo, em "Mapa da partida"): âmbar dos
  objetivos, azul do circuito do minério e as cores dos serviços. Elas marcam lugares
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
| `--xp` | `#b6f05a` | Barra de XP e o nível (no painel e no nome sobre a nave) e o anel de "subiu de nível". Verde-lima: cor própria do HUD, fora das três camadas, longe do ouro (amarelo), da energia (azul) e do plasma (verde mais frio, só no tiro) |

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
| Rótulo sobre a nave | Nome e barra de vida turquesa (aliado) ou vermelhos (inimigo: outro time e monstros). Nas naves de jogador, só a barra em cima |
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

**Bônus na nave** (vem do `bonus` do snapshot, pelo time da nave): **Fúria** (objetivo C, +20% de dano) = anel fino `#ffb627` âmbar, aditivo, deitado em volta da nave (raio 7,5 m), pulsando devagar, sem partículas, em toda nave de jogador do time com o bônus (a sua inclusive). É âmbar porque vem de um objetivo; é anel, e não nuvem, porque brilho difuso âmbar some no deserto alaranjado e para não parecer aura de arma.

As cores de tiro e de aura são cores de **efeito de arma**, fora das três camadas de cena: só aparecem em tiro, aura e ícone de arma, nunca em cenário ou interface comum.

### Mapa da partida (M1, 3 contra 3)

O mapa segue `DESIGN-PARTIDA.md` e `shared/terrain.js`. Cores em `public/js/cena.js` (`CORES`) e no minimapa (`public/js/hud.js`).

**Cor das bases é relativa a quem olha:** a base do **seu time** tem neon **turquesa** `#00efc0`; a do **outro time**, neon **vermelho** `#ff3b2a` (perigo). As duas são a mesma planta (girada 180°): plataforma com anel de pouso, hangares, antenas, portal na boca do corredor. No código: `criarCena({ meuTime })` e `new Hud({ meuTime })` (padrão 0 enquanto o cliente não sabe o time).

| Coisa | Cor | Forma | Significado |
|---|---|---|---|
| Base do seu time | metal `#5d6866`/`#3a4442` + neon `#00efc0` | Plataforma redonda com anel, hangares, antenas, portal | Nasce, pousa, conserta; zona segura |
| Base do outro time | mesmo metal + neon `#ff3b2a` | A mesma planta | Base deles (também zona segura) |
| Corredor dos mineradores | estrada `#4a3326`, bordas tracejadas `#4fb8ff`, linha do meio `#cfe9ff` | Faixa de 100 m em x = 0, aberta dos lados | Por onde os mineradores vão e voltam |
| Entrega | placa `#36424a` com borda e setas `#4fb8ff` | Retângulo 120 × 30 m colado na boca de cada base | Onde o minerador entrega o minério |
| Minério | cristais azul-gelo `#9fe8ff` (emissivos, "respiram"), chão `#3f4a55` | Cristais grandes sólidos no miolo, lascas baixas na coroa | Onde os mineradores carregam |
| Evolução | violeta `#a58bff` | Placa retangular com borda, duas setas para cima e "EVOLUÇÃO" | Pousado e parado: abre o painel da Evolução (nave e mineradores) |
| Loja | magenta `#ff6fd8` | Placa retangular com borda, moeda (anel + barra) e "LOJA" | Pousado e parado: abre o painel da Loja (armas, armaduras, itens) |
| Objetivo A | âmbar `#ffb627` (pulsa) | Placa redonda com anel e losango no chão | **Pouse na marcação** para tomar |
| Objetivo B | âmbar `#ffb627` | Torre escura sextavada (sólida) com faixas âmbar e farol no alto, anel no chão | **Destrua a torre** para tomar |
| Objetivo C | âmbar `#ffb627` | Arena: anel largo de 60 m, anel interno, triângulo e pilares baixos | **Derrote o guardião** da arena |
| Torreta | metal `#5d6866`/`#3a4442` + neon do **time** (turquesa as suas, vermelho `#ff3b2a` as do outro) | Torre sextavada de 16 m (sólida, `TORRETA` em `obstaculos.js`): pé baixo, corpo com faixa de neon, cabeça giratória na altura de voo com dois canos de boca neon, mastro com sensor (octaedro neon) no alto. A cabeça vira para o alvo; o sensor fica firme mirando e pulsa em repouso. Caída: o corpo tomba e afunda; ficam o pé (2,4 m), lascas e um cano solto (até 2,5 m, sem colisão). Reconstruída, sobe do chão (`public/js/torretas.js`) | Defesa do time no corredor |
| Escolta | casco `#9aa5a3` + faixas, pontas de asa e bocas dos canos na cor do time | Casco de carga mais comprido e baixo que o minerador (~7 m), sem contêiner, asinhas curtas e uma torre de dois canos em cima que gira para onde atira (`criarEscolta` em `nave.js`) | Anda com os mineradores e atira |
| Minerador | casco `#9aa5a3` + faixas do time; minério `#9fe8ff` (cristais) sobre bloco `#2f7fb8` | Mini-nave de carga de ~6 m (`criarMinerador` em `nave.js`): casco quadrado, cabine em pirâmide na frente, dois motores laterais, moldura de contêiner em cima. Cheio, aparecem o bloco e os cristais azuis no contêiner; minerando, desce um feixe azul-gelo pulsando até o chão | Leva o minério do depósito até a entrega |

- **Âmbar = objetivo.** Os três tipos usam âmbar e se distinguem pela forma (losango, torre, triângulo) e, no minimapa, pela letra.
- **Estado do objetivo** (vem do servidor, `public/js/objetivos.js`): sobre cada marcação, um rótulo em chapa escura com a letra numa caixinha `--objetivo` e o estado em uma linha: o que fazer ("Pouse para tomar", "Destrua a torre", "Derrote o guardião", com barra de vida âmbar no B e no C), progresso ("Seu time · 6 s" em turquesa ou "Inimigo · 6 s" em vermelho, com barra na mesma cor), "Contestado" (âmbar piscando) ou a recarga ("Volta em 1:12 · seu time", letra e borda em cinza-areia `#8a7f6a`). Em recarga o âmbar da marcação **para de pulsar e apaga** (0,2). A torre B caída some e deixa **destroços** escuros baixos (até 1,5 m, sem colisão) em volta do pedestal, depois de uma explosão laranja + âmbar.
- **Objetivos no minimapa:** em cima da letra, um arco de progresso do A na cor do time que está tomando (âmbar piscando se contestado), arco vermelho com a vida da torre B ou do guardião quando ferido; em recarga, a letra fica `#8a7f6a`, com um anel na cor de quem tomou e os segundos que faltam embaixo.
- **Azul = circuito do minério** (estrada, entregas, cristais). Os cristais usam o mesmo azul-gelo do Criogênico, mas só no chão; aura em nave é sempre efeito de arma.
- **Torretas no minimapa:** triângulo na cor do time (cheio de pé; só o contorno com a reconstrução esperando o lugar ficar livre) e um "x" cinza-areia `#8a7f6a` onde ela caiu. A **escolta** é um losango pequeno, entre a bolinha do minerador e o quadrado das naves. Rótulo da torreta: o mesmo das naves ("Torreta NV n" com a barra de vida), na cor do time.
- **Minimapa:** retângulo inteiro do mapa; sua base em turquesa, a outra em vermelho, corredor em azul apagado, entregas e minério em azul, serviços em violeta e magenta, objetivos com a letra em âmbar.
- **Mesas de rocha** do mundo aberto: a mesma rocha em estratos das paredes de cânion, com o alto mais claro (`#b9804f`) e torres de treliça em cima.

### Planetas (biomas)

Cada planeta é definido por **céu (3 tons) + neblina + rocha + chão**. A neblina tem sempre a cor do horizonte, para o fundo "derreter" no céu.

| Planeta | Céu topo / meio / horizonte | Neblina | Rocha | Chão | Status |
|---|---|---|---|---|---|
| **M1 Cânion (Bellico)** | `#2a0f1c` / `#a8402a` / `#f59a45` | `#c96a3a` | `#5a2f1e` a `#a8683e` em estratos | `#6e3f24` a `#9b6239` | **feito** (`public/js/cena.js`, `CORES`): mapa da partida 3 contra 3 |
| Base Shrewdo | `#1d3b5c` / `#6f9cc4` / `#d8e6ee` | `#b9cdd8` | metal `#5d6866` | concreto `#7a817f` | planejado |
| Vale tóxico (Mechan) | `#1a0820` / `#6a1f5e` / `#c0508a` | `#7a3460` | `#4a3328` | `#5c4a2a` com poças `#7dff6a` | planejado |
| Mar raso (Acron) | `#04131f` / `#0f4c6b` / `#5fc9d6` | `#3e8fa0` | `#2c3d45` | água `#0f5a6e` | planejado |

## Regras do 3D

- **Low-poly facetado:** `flatShading: true` em terreno, naves e estruturas. Nada de superfícies lisas brilhantes.
- **Metal sem mapa de ambiente:** `metalness` até **0.5** e `roughness` de **0.4 a 0.8**. Metal alto sem nada para refletir fica preto ou estoura no reflexo do sol.
- **Neon:** material com `color` e `emissive` iguais e `emissiveIntensity` entre **0.8 e 1.2**. Acima disso o tone mapping (ACES) puxa para o branco e a cor some. Luz piscando vai de 0.1 a 1.2.
- **Uma cor de destaque por objeto.** Hangar e portal: cinza + neon da base (turquesa na sua, vermelho na do outro time). Nave de jogador: a textura do modelo do original + neon do time nas pontas das asas.
- **Inimigos são orgânicos:** formas irregulares (icosaedro, espinhos), pele escura `#4a1414`/`#8c2a1f` e **olho vermelho emissivo**. Nunca usar o visual "nave limpa" dos jogadores neles.
- **Cada inimigo tem silhueta própria**, para o jogador saber de longe o que vem:

  | Inimigo | Forma | Comportamento |
  |---|---|---|
  | Arnosh (drone) | Disco de icosaedro com espinhos em volta, olho na frente | Patrulha e atira de longe |
  | Vorax (monstro) | Comprido, três gomos (cabeça, tórax, cauda com ferrão), espinhos nas costas, duas garras em foice que abrem e fecham | Caça de qualquer distância e ataca de perto; o golpe de garra é uma faísca `#ff4a2a` em quem leva |
  | Krakor (elite) | "Tanque" largo e alto (~17 m): carapaça em cúpula, chifre comprido para a frente, placas espinhentas em duas fileiras no lombo, seis patas curtas penduradas que balançam devagar, um olho embaixo do chifre | Raro e lento; guarda o covil e cospe plasma (tiro inimigo vermelho) em quem chega perto |
  | Guardião (objetivo C) | Colosso **vertical** (~23 m de altura): núcleo facetado, coroa de sete chifres abertos no alto, três lascas de carapaça girando em volta, olho grande na frente | Único em cada arena; atira um leque de três plasmas e não sai da arena |

  No minimapa todo inimigo é ponto vermelho, maior quanto mais perigoso: Arnosh 3 px, Vorax 4,5, Krakor 6, guardião 7.
- **Área de pouso é sempre marcada no chão**, com a cor do que ela é: anel com o neon da base (turquesa na sua), placa violeta da Evolução, placa magenta da Loja, anel âmbar do objetivo A (`AREAS_POUSO`). Nenhum anel turquesa no chão pode existir fora da sua base, para o jogador não confundir.
- **Tudo projeta sombra** (`castShadow`), e o terreno a recebe.

### Escala de referência

| Coisa | Tamanho |
|---|---|
| Nave de jogador | 9,6 m (1ª nave da linha) a 11,6 m (5ª) na média de comprimento × envergadura; a Assault 4% maior, a Mobile 3% menor; envergadura no máximo 1,45× esse tamanho (o modelo é escalado ao carregar, em `nave.js`) |
| Minerador | ~6 m de comprimento, ~4 m de largura (metade da nave), voa na mesma altura (`HOVER`) |
| Krakor | ~17 m de comprimento, ~10 m de largura (acerto com raio 8 m, `KRAKOR.raio`) |
| Guardião | ~23 m de altura, lascas girando a 9 m do centro (acerto com raio 10 m) |
| Altura de voo | 10 m acima do chão (`HOVER`) |
| Nave pousada | 1,4 m (`ALTURA_POUSADO`), com trem de pouso visível e motores quase apagados |
| Parede de cânion / mesa de rocha | ~50 a 95 m; começa com um degrau vertical de ~20 m (nem de lado a nave sobe) |
| Mapa | 3000 × 2000 m (`MAP_HALF_X`, `MAP_HALF_Z`), muralha só na borda |
| Base de time | raio 200 m (`BASES`) |
| Corredor dos mineradores | 100 m de largura (`CORREDOR`) |
| Hangar | 26 × 14 × 18 m |
| Decoração no chão do cânion | **até 2,5 m de altura** (a nave passa por cima; não há colisão com decoração) |
| Torreta do corredor | 16 m de altura, raio 4,5 m (canhão na altura de voo) |
| Construções (hangar, portal, antena, cristais do minério, torre do objetivo B, torretas) | **sólidas**: nave e tiro batem. Tamanho e posição saem de `shared/obstaculos.js`, nunca só do `cena.js` |

## Luz e atmosfera

- **Sol baixo e quente**, que desenha silhuetas e sombras longas. A direção do sol (`SOL_DIR`) bate com o disco desenhado no céu.
- **Luz hemisférica** com o céu quente em cima e marrom escuro embaixo: sombra nunca é preta pura.
- **Tone mapping ACES**, com exposição em torno de 1.05.
- **Poeira flutuando** em volta da câmera em todo planeta com atmosfera (dá noção de velocidade).

## Câmera

- **Perseguição em terceira pessoa**, como no AstroN: atrás e acima da nave, que fica no **terço de baixo da tela**, centralizada.
- A câmera acompanha a curva com atraso suave e **nunca entra na parede**: aproxima até enxergar a nave.
- O boost abre o campo de visão (65° para 74°).
- **V** troca a distância (três modos) e **T/G**, PageUp/PageDown ou a **roda do mouse** sobem e descem a câmera, de ~20° por baixo da nave a ~72° quase de cima; o ângulo fica guardado no navegador. Quanto mais de cima, mais a câmera mira na própria nave, para ela não sumir embaixo do painel.

## Interface

- **Painel inferior em chapa metálica** (degradê `--chapa-clara` para `--chapa`, cantos de cima mais arredondados, contorno `--neon-escuro`). Barras de HP e EN com rótulo à esquerda e número à direita, em fonte mono. Embaixo delas, uma **barra de XP** mais baixa (12 px) em `--xp`, com "NV n" à esquerda e "xp / próximo" à direita ("máx." no nível 20).
- **Recall (volta à base):** quem canaliza vê, no centro da tela acima da nave (a 26% do alto, longe da barra do objetivo A), um painel escuro com borda `--neon-escuro` e brilho turquesa: "Voltando à base · 3,2 s" em `--neon` (segundos em mono) e a barra `--neon` enchendo. No 3D, qualquer nave canalizando fica dentro de uma **coluna de luz** aditiva na **cor do time** (turquesa `#00efc0` do seu, vermelho `#ff3b2a` do outro), de ~12 m de diâmetro e ~46 m de altura, que some no alto (cor dos vértices até o preto) e acende e afina com o progresso, com três anéis finos subindo cada vez mais rápido e um clarão na nave; ao sumir e ao aparecer na base, um feixe alto e curto (0,7 s) na mesma cor. Nada no chão (anel turquesa no chão é só pouso). No celular, o botão BASE (64 px) fica à esquerda do POUSAR e acende em `--neon` enquanto canaliza.
- **Subiu de nível:** dois anéis finos `--xp` (aditivos) abrindo em volta da nave até ~14 m e subindo, com um clarão suave, por 1,2 s; vale para qualquer nave (a sua e as dos outros). Notícia "Nível n! HP máximo maior".
- **Pouso no objetivo A:** acima da dica de pouso, um painel escuro com borda âmbar e a barra de progresso: "Tomando o objetivo A · 6,2 s" (turquesa), "O inimigo está tomando" (vermelho), "Contestado" (âmbar piscando) ou "Objetivo A em recarga · volta em 1:12".
- **Minimapa** no canto superior esquerdo, **placar** no superior direito (na mesma chapa do painel: minério do seu time em turquesa à esquerda, tempo `mm:ss` em fonte mono no meio, que pisca em `#ff8a70` no último minuto, minério do outro time em vermelho à direita; embaixo de cada número, os bônus ativos do time como ícone de traço âmbar + segundos: cristal = mineração, setas = velocidade, escudo = durabilidade, raio = fúria; na **fase final** (últimos 3 min), uma faixa âmbar "MINÉRIO ×2" na largura do placar, separada por um fio âmbar, que pisca ao começar), **notícias** logo abaixo do placar (descem junto quando a faixa aparece), **avisos** no centro da tela.
- **Tela de fim de partida** (`#fim-partida`): painel em chapa no alto e centro, sem bloquear o jogo, com "VITÓRIA" (turquesa com brilho), "DERROTA" (vermelho com brilho) ou "EMPATE" (texto claro), uma frase curta, o placar grande (seu time × outro) e "Nova partida em Ns".
- **Menu de armas** (`#menu-armas`, Q edita a arma do Z, E a do X; um elemento só, com o título "Arma do Z" / "Arma do X"): painel na mesma chapa do painel inferior, no **alto e centro** da tela, para a nave continuar à vista (o jogo não pausa). Com 18 a 28 armas por raça e classe, ele **rola**: em cima, "SUAS ARMAS" (as de fábrica e as compradas), na ordem das categorias do original, com as teclas 1 a 9 e 0 nas dez primeiras; embaixo, apagadas e agrupadas por categoria, as que estão "NA LOJA". Cada carta: tecla, ícone e nome em português, nível da arma ("NV 3", mono, `--neon`), etiquetas de tipo de dano (LASER, FÍSICO, ELÉTRICO) e papel (ATAQUE; BLOQUEIO, REFORÇO e SUPORTE com contorno `--neon-escuro` e texto `--neon`), dano / energia / recarga da versão e uma linha do que a arma faz. A arma deste encaixe tem borda `--neon` e o selo "EM USO"; a do outro encaixe, borda tracejada `--neon-escuro` e o selo "NO X" (ou "NO Z"). Linha da troca entre o título e as cartas: "Na base: troca livre" em `--neon`, "Fora da base: trocar trava o encaixe por 3 s" em texto, e com a recarga contando "Troca do Z em recarga: 2,1 s" em `#ff8a70`, com as outras cartas apagadas (0,4). **Ícone de arma** (SVG de traço, sem preenchimento): um desenho por categoria (traços paralelos ou em leque para feixe e metralhadora, carga para canhão, foguete para míssil, hélice para lâmina, espinhos para mina, anel para nova, escudo/raio para dispositivo), na **cor do projétil do original** (`--cor-arma`).
- **Painel da Loja e da Evolução** (`#servico`, um elemento para os dois; `public/js/servicos.js`): abre sozinho com a nave pousada e parada na plataforma do serviço da própria base, na mesma chapa do painel inferior, no **alto e centro** (como o menu de armas, que abre por cima dele). A **cor do serviço** é a da plataforma no chão: borda de cima, título com brilho, aba ativa e selos em `--loja` (magenta) na Loja e `--evolucao` (violeta) na Evolução. No cabeçalho, o **ouro em destaque** (`--ouro`, mono, 20 px, com brilho) e o botão ✕. Abas: Loja = Armas · Evoluir · Armaduras · Itens. Na aba Armas, só as da raça e da classe, com **filtro por categoria** (pílulas "Todas 26 · Feixe 6 · ..." na cor do serviço) e, em cada cartão, o nome em português com o original em inglês pequeno embaixo, a linha do que faz e a linha mono de dano / recarga / energia. Na aba Evoluir, um cartão por arma possuída com "NV n" (a versão do original, V1 a V5) mono na cor do serviço ao lado do nome, o que muda na próxima versão, o nível de piloto que ela pede e os tracinhos do nível na cor do serviço; selo "EVOLUIR", "PEDE NV n" ou "MÁX." apagado; Evolução = Nave · Mineradores do time · Torretas. Na aba Torretas: um cartão com o nível do time (tracinhos como nas melhorias) e um por torreta do time, com a barra de vida fina em `--neon` e o selo "DE PÉ · n%" (é seu), "RECONSTRUIR" com o preço (caída; barra vazia tracejada em `#ff8a70`) ou "SUBINDO" apagado; ícones de torreta e de reconstruir (seta para cima) em traço `--neon`. **Cartões** em grade (mín. 150 px): ícone de traço e nome, uma linha de efeito, preço em `--ouro` mono ("120 ouro") e o selo do estado à direita: "COMPRAR" / "ESCOLHER" / "NÍVEL n" na cor do serviço (disponível); "COMPRADA · Q/E equipa" e "EQUIPADA" em `--neon` com borda neon (é seu); "SEM OURO" com preço e selo em `#ff8a70`; "PEDE NV 10", "JÁ TEM MELHOR", "CHEIO 3/3", "MÁX." e "COMPLETA" apagados (0,45). Na Evolução da nave (aba Nave), cinco cartões com a linha de naves da raça e da classe: nome e "NV n", **miniatura 3D** da nave (renderizada uma vez por modelo, `public/js/vitrine.js`), HP / energia / velocidade com a diferença para a atual em `--neon` (e a regeneração em voo nas Bellico), preço em `--ouro` e o selo: "ATUAL" em `--neon` com borda neon, "COMPRAR" na cor do serviço, "PEDE NV n", "SEM OURO" e "JÁ PASSOU" apagados. Melhorias dos mineradores com tracinhos de nível acesos na cor do serviço. Embaixo, uma linha com a resposta do servidor (boa em `--neon`, ruim em `#ff8a70`). **Ícones da Loja/Evolução** (SVG de traço, como os de arma): armas com o próprio ícone de arma; armadura = escudo `--neon` com 1 a 3 divisas; Kit de reparo = cruz em quadrado `--hp`; Célula de energia = bateria com raio `--en`; Casco de carga em `--hp`, Mais mineradores, Blindagem e Motor de carga em `--neon`. Fechado com ESC ainda pousado, a dica de pouso vira botão: "Loja · Enter ou toque abre · L decola".
- **Itens no painel inferior** (`#itens-nave`, ao lado das armas): "R · ícone ×2" e "F · ícone ×1", no mesmo formato das armas (a letra em `--neon`, a quantidade em mono), com a linha de 2 px da recarga do item; sem nenhum, o botão fica apagado (0,4). Clicar (ou tocar) usa o item.
- **Armas no painel inferior:** as duas, uma em cima da outra, como "Z · ícone nome" e "X · ícone nome" (a letra em `--neon`), com uma linha fina de 2 px embaixo de cada uma que enche conforme a recarga daquele encaixe (`--neon` pronta, `--texto` apagado recarregando, `--hp` se falta energia para o próximo disparo). Sob EMP, as duas ficam apagadas com a borda `--emp`. Com a recarga de troca contando, o ícone do encaixe apaga (0,4), a linha mostra a troca enchendo em `--texto` e a contagem aparece ao lado ("2,1 s", mono, `--texto`), no celular também. Clicar abre o menu daquele encaixe. No celular o nome some (fica "Z · ícone").
- **Tela inicial em dois passos** (na mesma chapa): "1 Escolha sua raça" com um cartão por raça (Mechan apagada, não clicável, com o selo "EM BREVE"); depois "2 Escolha sua classe", com um botão de voltar com o nome da raça na cor dela e três cartões (Assault, Mobile, Functional) com a especialidade, a primeira nave da linha e barras de HP (`--hp`), energia (`--en`), velocidade (`--neon`) e regeneração; embaixo, a **prévia 3D** da primeira nave girando e a linha das próximas ("Na Evolução: Falcon (NV 5) › Eagle (NV 10) › ..."). Botão de som (M) embaixo do Decolar.
- **Som:** os efeitos do original (`public/sons/`, WAV) tocam pelo `public/js/sons.js`: disparo na posição do tiro, impacto, explosão e os de interface (subir de nível, compra, erro, painel). Volume pela distância (cheio até 60 m, some aos 900 m), pan estéreo pela direção, no máximo 6 vozes por som e 24 no total (metralhadora não estoura). **M** liga e desliga; o estado fica no navegador e aparece no HUD ("Som ligado" / "Sem som", texto pequeno ao lado do ping) e na tela inicial.
- **Modo de teste:** painel `#painel-teste` à esquerda, embaixo do minimapa, na chapa do painel com **borda tracejada `--ouro`** (é ferramenta, não jogo): título "MODO DE TESTE" em `--ouro` e quatro botões (+1000 ouro, +100 XP, +1 nível, Nível 20). O relógio do placar mostra "TESTE". Na tela inicial, a caixa "Modo de teste" com a explicação embaixo, marcada em `--ouro`.
- **Tipografia:** `system-ui` para texto e `ui-monospace` para números. Título com letras espaçadas e "ASTRO" em `--neon` com brilho.
- **Celular:** joystick à esquerda; Z, X e SHIFT à direita (mesma disposição do AstroN), com ARMA Z e ARMA X em cima (cada uma sobre a coluna do botão de tiro do seu encaixe). No menu do celular, as cartas mostram só ícone, nome e selo. O painel da Loja/Evolução fica entre a borda esquerda e o placar (sem cobrir os botões), com cartões menores (efeito em 9,5 px), abas mais altas para o dedo e a lista rolando com o dedo. Área de toque com no mínimo 64 px.
- **Idioma:** português do Brasil, frases curtas e diretas, sem jargão técnico para o jogador ("Nave destruída · renascendo na base em 3s").

## Checklist antes de abrir o PR

- [ ] As cores novas saem da paleta acima (ou o guia foi atualizado no mesmo PR).
- [ ] Facetado, metal ≤ 0.5, neon ≤ 1.2.
- [ ] Inimigo em vermelho, tecnologia em turquesa, ambiente em tons quentes.
- [ ] Escala conferida contra a tabela (a nave cabe e passa por cima da decoração).
- [ ] Testado com print no navegador (base, corredor e mundo aberto), sem erro no console.
- [ ] Texto em PT-BR.
