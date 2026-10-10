# Identidade visual do New AstroN

Guia obrigatório para qualquer coisa que entre no jogo: cenário, nave, inimigo, efeito, HUD, tela ou e-mail. Se algo novo não cabe nestas regras, mude o guia primeiro (no mesmo PR) e explique o porquê; não deixe o jogo e o guia divergirem.

## Conceito

**Ficção científica industrial, low-poly facetado, em planetas hostis ao entardecer.**

- A referência é o AstroN (naves voando baixo por cânions e bases, painel metálico verde-azulado). É **inspiração, não cópia**: nada de sprites, modelos, logos ou nomes tirados do jogo original.
- Tudo é **feito em código** (primitivas do Three.js, shaders e ruído), sem texturas fotográficas. O estilo low-poly é escolha estética e de desempenho: roda no navegador e no celular.
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
| `--laser` | `#5ff7ff` | Ícone de arma no HUD (mesmo ciano do tiro de laser) |
| `--dreno` | `#d070ff` | Ícone da arma Dreno (mesmo violeta do tiro e da aura) |
| `--gelo` | `#a8e8ff` | Ícone da arma Criogênico (mesmo azul-gelo do tiro e da aura) |
| `--plasma` | `#7dff6a` | Ícone da arma Plasma (mesmo verde do tiro) |
| `--missil` | `#fff0c8` | Ícone do Míssil teleguiado (mesmo branco-quente da chama) |
| `--emp` | `#c8d2ff` | Ícone do Pulso EMP (mesmo branco-elétrico do tiro, da aura e das faíscas) |
| `--inimigo` | `#ff4a2a` | Placar e coisas do outro time no HUD (mesmo vermelho dos inimigos no minimapa) |
| `--objetivo` | `#ffb627` | Ícones dos bônus por tempo no placar (âmbar dos objetivos, de onde os bônus vêm), faixa "MINÉRIO ×2" da fase final, rótulo e barra dos objetivos |
| `--evolucao` | `#a58bff` | Painel da Evolução (título, aba ativa, selo, níveis das melhorias): o mesmo violeta da plataforma |
| `--loja` | `#ff6fd8` | Painel da Loja (título, aba ativa, selo "COMPRAR"): o mesmo magenta da plataforma |
| `--xp` | `#b6f05a` | Barra de XP e o nível (no painel e no nome sobre a nave) e o anel de "subiu de nível". Verde-lima: cor própria do HUD, fora das três camadas, longe do ouro (amarelo), da energia (azul) e do plasma (verde mais frio, só no tiro) |

- **Botão primário:** fundo `#00efc0`, texto `#032b22`, peso 700. É o mesmo turquesa do Sideral, de propósito: os dois jogos são da mesma casa.
- **Mensagens:** boas em `--neon`, ruins em `#ff8a70`, neutras em `--texto`.

### Raças

Definidas em `shared/sim.js` (`RACES[].cor`). A cor da raça vai **só** nas asas, no leme e no brilho do motor; o casco é sempre cinza-claro (`#c9d2d0`). O rótulo (nome e barra) usa a cor do **time**, não a da raça (ver "Times" abaixo).

### Times (cor relativa a quem olha)

Na partida 3 contra 3 a cor de time é sempre **relativa a quem olha**: o que é do **seu time** é turquesa `#00efc0`; o que é do **outro time**, vermelho (`#ff3b2a` no 3D, como o neon da base deles; `--inimigo` `#ff4a2a` no HUD). No código: `criarNave(race, { aliado })`, `criarMinerador({ aliado })`, `criarCena({ meuTime })`, `new Hud({ meuTime })`, `new Placar({ meuTime })`; `meuTime` vem do `bemvindo`.

| Onde | Como |
|---|---|
| Nave de jogador | **Marca de luz do time**: anel de neon em volta da fuselagem, atrás da cabine, e uma luz em cada ponta de asa (o que mais aparece na câmera de perseguição). A sua nave é sempre turquesa. A cor da raça continua nas asas, no leme e no motor |
| Minerador | Faixas de neon nos dois lados do casco e brilho dos motores na cor do time |
| Rótulo sobre a nave | Nome e barra de vida turquesa (aliado) ou vermelhos (inimigo: outro time e monstros) |
| Minimapa | Pontos do seu time em turquesa, do outro time e monstros em vermelho; minerador é uma bolinha menor que o quadrado das naves |
| Placar | Seu time sempre à esquerda, em turquesa; o outro à direita, em vermelho |

| Raça | Cor | Bioma |
|---|---|---|
| Acron | `#3fa9ff` azul | Aquático |
| Bellico | `#ff5a3c` vermelho | Deserto |
| Shrewdo | `#34e08a` verde | Terreno |
| Mechan | `#b15cff` roxo | Tóxico |

### Armas e efeitos

Em `public/js/efeitos.js` (`COR_TIRO`). Efeitos de luz são sempre **aditivos** (`AdditiveBlending`) com a textura radial de `brilho()`.

| Tiro | Cor | Forma |
|---|---|---|
| Laser | `#5ff7ff` ciano | Barra fina de 7 m + brilho pequeno |
| Laser duplo | `#5ff7ff` ciano | Duas barras de 6 m, mais finas, lado a lado (2,5 m de cada lado do nariz) + brilho menor |
| Laser triplo | `#5ff7ff` ciano | Três barras de 5 m em leque (±6°) + brilho pequeno |
| Dreno | `#d070ff` violeta | Bola de brilho, sem barra |
| Criogênico | `#a8e8ff` azul-gelo | Estilhaço curto e grosso (3 m) + brilho |
| Plasma | `#7dff6a` verde | Esfera de brilho grande |
| Míssil teleguiado | casco `#c9d2d0` + chama `#fff0c8` branco-quente; fumaça `#8f8a83` | Corpo de 3 m (cilindro + nariz) com a chama atrás, vira com a curva; **rastro de fumaça cinza** (sem brilho, uma baforada a cada 4 m) que cresce e some em ~1 s |
| Pulso EMP | `#c8d2ff` branco-elétrico | Bola de brilho média, sem barra |
| Mina | corpo `#3a4442` + luz na cor do **time** | Disco facetado de ~3 m no chão, com quatro espinhos e uma luz em cima que pulsa: devagar enquanto não arma, rápido armada. Turquesa `#00efc0` a do seu time, vermelha `#ff3b2a` a do outro (nada de anel no chão: anel turquesa no chão é só pouso) |
| Onda de choque / explosão de mina | cor do **time** de quem usou (turquesa ou vermelho) | Dois anéis finos aditivos abrindo no plano até o raio da área em ~0,45 s + clarão; a mina ainda solta a explosão laranja |
| Inimigo | `#ff4a2a` vermelho | Qualquer forma, sempre vermelho |
| Explosão | `#ff9a3a` a `#ffd28a` | Clarão + fagulhas que caem |

**Efeitos de arma na nave atingida** (qualquer nave, drone ou monstro; vêm do servidor em `dreno`/`lento` de cada entidade):

| Efeito | Cor | Forma |
|---|---|---|
| Dreno (perdendo vida) | `#d070ff` violeta | Aura pulsando em volta da nave + partículas **subindo** (a vida sendo puxada para fora). Não é fogo: nada de laranja/amarelo |
| Lento (criogênico) | `#a8e8ff` azul-gelo | Aura fixa em volta da nave + cristais **caindo** |
| Sem sistemas (EMP) | `#c8d2ff` branco-elétrico + `#ffffff` | Aura que **falha** (pisca irregular, como curto-circuito) + **faíscas** curtas estalando em volta, para qualquer nave, monstro ou minerador atingido |

**Bônus na nave** (vem do `bonus` do snapshot, pelo time da nave): **Fúria** (objetivo C, +20% de dano) = anel fino `#ffb627` âmbar, aditivo, deitado em volta da nave (raio 7,5 m), pulsando devagar, sem partículas, em toda nave de jogador do time com o bônus (a sua inclusive). É âmbar porque vem de um objetivo; é anel, e não nuvem, porque brilho difuso âmbar some no deserto alaranjado e para não parecer aura de arma.

O violeta, o azul-gelo, o branco-quente do míssil e o branco-elétrico do EMP são cores de **efeito de arma**, fora das três camadas de cena: só aparecem em tiro, aura e ícone dessas armas, nunca em cenário ou interface comum. O branco-elétrico é azulado (puxa para o lilás claro) para não se confundir com o azul-gelo (mais ciano) nem com a chama do míssil (quente). Mina e onda de choque não têm cor própria: usam a cor do time (seu time turquesa, o outro vermelho), como tudo que é de um time.

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
| Minerador | casco `#9aa5a3` + faixas do time; minério `#9fe8ff` (cristais) sobre bloco `#2f7fb8` | Mini-nave de carga de ~6 m (`criarMinerador` em `nave.js`): casco quadrado, cabine em pirâmide na frente, dois motores laterais, moldura de contêiner em cima. Cheio, aparecem o bloco e os cristais azuis no contêiner; minerando, desce um feixe azul-gelo pulsando até o chão | Leva o minério do depósito até a entrega |

- **Âmbar = objetivo.** Os três tipos usam âmbar e se distinguem pela forma (losango, torre, triângulo) e, no minimapa, pela letra.
- **Estado do objetivo** (vem do servidor, `public/js/objetivos.js`): sobre cada marcação, um rótulo em chapa escura com a letra numa caixinha `--objetivo` e o estado em uma linha: o que fazer ("Pouse para tomar", "Destrua a torre", "Derrote o guardião", com barra de vida âmbar no B e no C), progresso ("Seu time · 6 s" em turquesa ou "Inimigo · 6 s" em vermelho, com barra na mesma cor), "Contestado" (âmbar piscando) ou a recarga ("Volta em 1:12 · seu time", letra e borda em cinza-areia `#8a7f6a`). Em recarga o âmbar da marcação **para de pulsar e apaga** (0,2). A torre B caída some e deixa **destroços** escuros baixos (até 1,5 m, sem colisão) em volta do pedestal, depois de uma explosão laranja + âmbar.
- **Objetivos no minimapa:** em cima da letra, um arco de progresso do A na cor do time que está tomando (âmbar piscando se contestado), arco vermelho com a vida da torre B ou do guardião quando ferido; em recarga, a letra fica `#8a7f6a`, com um anel na cor de quem tomou e os segundos que faltam embaixo.
- **Azul = circuito do minério** (estrada, entregas, cristais). Os cristais usam o mesmo azul-gelo do Criogênico, mas só no chão; aura em nave é sempre efeito de arma.
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
- **Uma cor de destaque por objeto.** Hangar e portal: cinza + neon da base (turquesa na sua, vermelho na do outro time). Nave: casco cinza + cor da raça.
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
| Nave de jogador | ~11 m de comprimento, ~12 m de envergadura |
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
| Construções (hangar, portal, antena, cristais do minério, torre do objetivo B) | **sólidas**: nave e tiro batem. Tamanho e posição saem de `shared/obstaculos.js`, nunca só do `cena.js` |

## Luz e atmosfera

- **Sol baixo e quente**, que desenha silhuetas e sombras longas. A direção do sol (`SOL_DIR`) bate com o disco desenhado no céu.
- **Luz hemisférica** com o céu quente em cima e marrom escuro embaixo: sombra nunca é preta pura.
- **Tone mapping ACES**, com exposição em torno de 1.05.
- **Poeira flutuando** em volta da câmera em todo planeta com atmosfera (dá noção de velocidade).

## Câmera

- **Perseguição em terceira pessoa**, como no AstroN: atrás e acima da nave, que fica no **terço de baixo da tela**, centralizada.
- A câmera acompanha a curva com atraso suave e **nunca entra na parede**: aproxima até enxergar a nave.
- O boost abre o campo de visão (65° para 74°).

## Interface

- **Painel inferior em chapa metálica** (degradê `--chapa-clara` para `--chapa`, cantos de cima mais arredondados, contorno `--neon-escuro`). Barras de HP e EN com rótulo à esquerda e número à direita, em fonte mono. Embaixo delas, uma **barra de XP** mais baixa (12 px) em `--xp`, com "NV n" à esquerda e "xp / próximo" à direita ("máx." no nível 20).
- **Recall (volta à base):** quem canaliza vê, no centro da tela acima da nave (a 26% do alto, longe da barra do objetivo A), um painel escuro com borda `--neon-escuro` e brilho turquesa: "Voltando à base · 3,2 s" em `--neon` (segundos em mono) e a barra `--neon` enchendo. No 3D, qualquer nave canalizando fica dentro de uma **coluna de luz** aditiva na **cor do time** (turquesa `#00efc0` do seu, vermelho `#ff3b2a` do outro), de ~12 m de diâmetro e ~46 m de altura, que some no alto (cor dos vértices até o preto) e acende e afina com o progresso, com três anéis finos subindo cada vez mais rápido e um clarão na nave; ao sumir e ao aparecer na base, um feixe alto e curto (0,7 s) na mesma cor. Nada no chão (anel turquesa no chão é só pouso). No celular, o botão BASE (64 px) fica à esquerda do POUSAR e acende em `--neon` enquanto canaliza.
- **Subiu de nível:** dois anéis finos `--xp` (aditivos) abrindo em volta da nave até ~14 m e subindo, com um clarão suave, por 1,2 s; vale para qualquer nave (a sua e as dos outros). Notícia "Nível n! HP máximo maior".
- **Pouso no objetivo A:** acima da dica de pouso, um painel escuro com borda âmbar e a barra de progresso: "Tomando o objetivo A · 6,2 s" (turquesa), "O inimigo está tomando" (vermelho), "Contestado" (âmbar piscando) ou "Objetivo A em recarga · volta em 1:12".
- **Minimapa** no canto superior esquerdo, **placar** no superior direito (na mesma chapa do painel: minério do seu time em turquesa à esquerda, tempo `mm:ss` em fonte mono no meio, que pisca em `#ff8a70` no último minuto, minério do outro time em vermelho à direita; embaixo de cada número, os bônus ativos do time como ícone de traço âmbar + segundos: cristal = mineração, setas = velocidade, escudo = durabilidade, raio = fúria; na **fase final** (últimos 3 min), uma faixa âmbar "MINÉRIO ×2" na largura do placar, separada por um fio âmbar, que pisca ao começar), **notícias** logo abaixo do placar (descem junto quando a faixa aparece), **avisos** no centro da tela.
- **Tela de fim de partida** (`#fim-partida`): painel em chapa no alto e centro, sem bloquear o jogo, com "VITÓRIA" (turquesa com brilho), "DERROTA" (vermelho com brilho) ou "EMPATE" (texto claro), uma frase curta, o placar grande (seu time × outro) e "Nova partida em Ns".
- **Menu de armas** (`#menu-armas`, Q edita a arma do Z, E a do X; um elemento só, com o título "Arma do Z" / "Arma do X"): painel na mesma chapa do painel inferior, no **alto e centro** da tela, para a nave continuar à vista (o jogo não pausa). Dez cartas compactas em duas fileiras, com número da tecla (1 a 9 e 0), ícone e nome na mesma linha, dano / energia / recarga lado a lado e uma linha do efeito (em tela baixa, até 520 px, a linha do efeito some e fica no `title` da carta). A arma deste encaixe tem borda `--neon` e o selo "EM USO"; a do outro encaixe, borda tracejada `--neon-escuro` e o selo "NO X" (ou "NO Z"); a mesma nos dois mostra "EM USO · também no X". Arma que a nave não possui fica apagada com o selo "NA LOJA". Embaixo do nome, duas etiquetas de contorno `--chapa-clara` em caixa alta 8,5 px: o tipo de dano (LASER, FÍSICO, ELÉTRICO) e a função (DANO; CONTROLE com contorno `--neon-escuro` e texto `--neon`). No canto de cima, oposto à tecla, o nível da arma ("NV 3", mono 9 px, `--neon`; "NV 1" apagado), com o dano e o efeito da carta já do nível. Entre o título e as cartas, a linha da troca: "Na base: troca livre" em `--neon`, "Fora da base: trocar trava o encaixe por 3 s" em texto, e com a recarga de troca contando "Troca do Z em recarga: 2,1 s" em `#ff8a70`, com as outras cartas apagadas (0,4) e o selo "TROCA EM 2,1 s" em `#ff8a70`. **Ícone de arma** (SVG de traço, sem preenchimento): traços `--laser` para os lasers (1 simples, 2 paralelos no duplo, 3 em leque no triplo), gota `--dreno` para o Dreno, floco `--gelo` para o Criogênico, esfera `--plasma` para o Plasma, foguete `--missil` para o Míssil, mina com espinhos e ondas em `--neon` para a Mina e a Onda de choque (armas suas, na cor do seu time) e raio `--emp` para o Pulso EMP.
- **Painel da Loja e da Evolução** (`#servico`, um elemento para os dois; `public/js/servicos.js`): abre sozinho com a nave pousada e parada na plataforma do serviço da própria base, na mesma chapa do painel inferior, no **alto e centro** (como o menu de armas, que abre por cima dele). A **cor do serviço** é a da plataforma no chão: borda de cima, título com brilho, aba ativa e selos em `--loja` (magenta) na Loja e `--evolucao` (violeta) na Evolução. No cabeçalho, o **ouro em destaque** (`--ouro`, mono, 20 px, com brilho) e o botão ✕. Abas: Loja = Armas · Evoluir · Armaduras · Itens (na aba Evoluir, um cartão por arma possuída com "NV n" mono na cor do serviço ao lado do nome, o que muda no próximo nível como efeito, as etiquetas de tipo e função e os tracinhos do nível na cor do serviço; selo "EVOLUIR", ou "MÁX." apagado); Evolução = Nave · Mineradores do time. **Cartões** em grade (mín. 150 px): ícone de traço e nome, uma linha de efeito, preço em `--ouro` mono ("120 ouro") e o selo do estado à direita: "COMPRAR" / "ESCOLHER" / "NÍVEL n" na cor do serviço (disponível); "COMPRADA · Q/E equipa" e "EQUIPADA" em `--neon` com borda neon (é seu); "SEM OURO" com preço e selo em `#ff8a70`; "PEDE NV 10", "JÁ TEM MELHOR", "CHEIO 3/3", "MÁX." e "COMPLETA" apagados (0,45). Na Evolução da nave, uma faixa com os três marcos (NV 5 · 10 · 15): feito em `--neon` com o nome da escolha, próximo com borda da cor do serviço, os outros apagados. Melhorias dos mineradores com tracinhos de nível acesos na cor do serviço. Embaixo, uma linha com a resposta do servidor (boa em `--neon`, ruim em `#ff8a70`). **Ícones da Loja/Evolução** (SVG de traço, como os de arma): armas com o próprio ícone de arma; armadura = escudo `--neon` com 1 a 3 divisas; Kit de reparo = cruz em quadrado `--hp`; Célula de energia = bateria com raio `--en`; Casco reforçado e Casco de carga em `--hp`, Reator em `--en`, Motor, Mais mineradores, Blindagem e Motor de carga em `--neon`. Fechado com ESC ainda pousado, a dica de pouso vira botão: "Loja · Enter ou toque abre · L decola".
- **Itens no painel inferior** (`#itens-nave`, ao lado das armas): "R · ícone ×2" e "F · ícone ×1", no mesmo formato das armas (a letra em `--neon`, a quantidade em mono), com a linha de 2 px da recarga do item; sem nenhum, o botão fica apagado (0,4). Clicar (ou tocar) usa o item.
- **Armas no painel inferior:** as duas, uma em cima da outra, como "Z · ícone nome" e "X · ícone nome" (a letra em `--neon`), com uma linha fina de 2 px embaixo de cada uma que enche conforme a recarga daquele encaixe (`--neon` pronta, `--texto` apagado recarregando, `--hp` se falta energia para o próximo disparo). Sob EMP, as duas ficam apagadas com a borda `--emp`. Com a recarga de troca contando, o ícone do encaixe apaga (0,4), a linha mostra a troca enchendo em `--texto` e a contagem aparece ao lado ("2,1 s", mono, `--texto`), no celular também. Clicar abre o menu daquele encaixe. No celular o nome some (fica "Z · ícone").
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
