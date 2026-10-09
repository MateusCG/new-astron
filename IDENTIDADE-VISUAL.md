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

  Se uma cor nova não se encaixa em uma dessas três, provavelmente está errada.

## Paleta

### Interface (HUD, telas, botões)

Tokens em `public/css/jogo.css` (`:root`). Use as variáveis; não escreva hex solto no CSS.

| Token | Hex | Uso |
|---|---|---|
| `--neon` | `#00efc0` | Destaque principal, botão primário, bordas ativas, base no minimapa |
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

- **Botão primário:** fundo `#00efc0`, texto `#032b22`, peso 700. É o mesmo turquesa do Sideral, de propósito: os dois jogos são da mesma casa.
- **Mensagens:** boas em `--neon`, ruins em `#ff8a70`, neutras em `--texto`.

### Raças

Definidas em `shared/sim.js` (`RACES[].cor`). A cor da raça vai **só** nas asas, no leme e no brilho do motor; o casco é sempre cinza-claro (`#c9d2d0`). O nome do jogador no rótulo usa a mesma cor.

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
| Laser (Z) | `#5ff7ff` ciano | Barra fina de 7 m + brilho pequeno |
| Laser duplo (Z) | `#5ff7ff` ciano | Duas barras de 6 m, mais finas, lado a lado (2,5 m de cada lado do nariz) + brilho menor |
| Laser triplo (Z) | `#5ff7ff` ciano | Três barras de 5 m em leque (±6°) + brilho pequeno |
| Dreno (Z) | `#d070ff` violeta | Bola de brilho, sem barra |
| Criogênico (Z) | `#a8e8ff` azul-gelo | Estilhaço curto e grosso (3 m) + brilho |
| Plasma (X) | `#7dff6a` verde | Esfera de brilho grande |
| Inimigo | `#ff4a2a` vermelho | Qualquer forma, sempre vermelho |
| Explosão | `#ff9a3a` a `#ffd28a` | Clarão + fagulhas que caem |

**Efeitos de arma na nave atingida** (qualquer nave, drone ou monstro; vêm do servidor em `dreno`/`lento` de cada entidade):

| Efeito | Cor | Forma |
|---|---|---|
| Dreno (perdendo vida) | `#d070ff` violeta | Aura pulsando em volta da nave + partículas **subindo** (a vida sendo puxada para fora). Não é fogo: nada de laranja/amarelo |
| Lento (criogênico) | `#a8e8ff` azul-gelo | Aura fixa em volta da nave + cristais **caindo** |

O violeta e o azul-gelo são cores de **efeito de arma**, fora das três camadas de cena: só aparecem em tiro, aura e ícone dessas armas, nunca em cenário ou interface comum.

### Planetas (biomas)

Cada planeta é definido por **céu (3 tons) + neblina + rocha + chão**. A neblina tem sempre a cor do horizonte, para o fundo "derreter" no céu.

| Planeta | Céu topo / meio / horizonte | Neblina | Rocha | Chão | Status |
|---|---|---|---|---|---|
| **M1 Cânion (Bellico)** | `#2a0f1c` / `#a8402a` / `#f59a45` | `#c96a3a` | `#5a2f1e` a `#a8683e` em estratos | `#6e3f24` a `#9b6239` | **feito** (`public/js/cena.js`, `CORES`) |
| Base Shrewdo | `#1d3b5c` / `#6f9cc4` / `#d8e6ee` | `#b9cdd8` | metal `#5d6866` | concreto `#7a817f` | planejado |
| Vale tóxico (Mechan) | `#1a0820` / `#6a1f5e` / `#c0508a` | `#7a3460` | `#4a3328` | `#5c4a2a` com poças `#7dff6a` | planejado |
| Mar raso (Acron) | `#04131f` / `#0f4c6b` / `#5fc9d6` | `#3e8fa0` | `#2c3d45` | água `#0f5a6e` | planejado |

## Regras do 3D

- **Low-poly facetado:** `flatShading: true` em terreno, naves e estruturas. Nada de superfícies lisas brilhantes.
- **Metal sem mapa de ambiente:** `metalness` até **0.5** e `roughness` de **0.4 a 0.8**. Metal alto sem nada para refletir fica preto ou estoura no reflexo do sol.
- **Neon:** material com `color` e `emissive` iguais e `emissiveIntensity` entre **0.8 e 1.2**. Acima disso o tone mapping (ACES) puxa para o branco e a cor some. Luz piscando vai de 0.1 a 1.2.
- **Uma cor de destaque por objeto.** Hangar: cinza + faixa turquesa. Portal: escuro + luz vermelha. Nave: casco cinza + cor da raça.
- **Inimigos são orgânicos:** formas irregulares (icosaedro, espinhos), pele escura `#4a1414`/`#8c2a1f` e **olho vermelho emissivo**. Nunca usar o visual "nave limpa" dos jogadores neles.
- **Cada inimigo tem silhueta própria**, para o jogador saber de longe o que vem:

  | Inimigo | Forma | Comportamento |
  |---|---|---|
  | Arnosh (drone) | Disco de icosaedro com espinhos em volta, olho na frente | Patrulha e atira de longe |
  | Vorax (monstro) | Comprido, três gomos (cabeça, tórax, cauda com ferrão), espinhos nas costas, duas garras em foice que abrem e fecham | Caça de qualquer distância e ataca de perto; o golpe de garra é uma faísca `#ff4a2a` em quem leva |

  No minimapa todo inimigo é ponto vermelho; o Vorax num ponto maior.
- **Área de pouso = anel de neon turquesa no chão.** Todo lugar onde a nave pode pousar (`AREAS_POUSO`) é marcado assim, e nenhum outro anel turquesa no chão pode existir, para o jogador não confundir.
- **Tudo projeta sombra** (`castShadow`), e o terreno a recebe.

### Escala de referência

| Coisa | Tamanho |
|---|---|
| Nave de jogador | ~11 m de comprimento, ~12 m de envergadura |
| Altura de voo | 10 m acima do chão (`HOVER`) |
| Nave pousada | 1,4 m (`ALTURA_POUSADO`), com trem de pouso visível e motores quase apagados |
| Parede de cânion | ~70 m (`WALL_HEIGHT`) |
| Corredor de cânion | 30 a 80 m de largura |
| Hangar | 26 × 14 × 18 m |
| Decoração no chão do cânion | **até 2,5 m de altura** (a nave passa por cima; não há colisão com decoração) |
| Construções (hangar, portal, antena) | **sólidas**: nave e tiro batem. Tamanho e posição saem de `shared/obstaculos.js`, nunca só do `cena.js` |

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

- **Painel inferior em chapa metálica** (degradê `--chapa-clara` para `--chapa`, cantos de cima mais arredondados, contorno `--neon-escuro`). Barras de HP e EN com rótulo à esquerda e número à direita, em fonte mono.
- **Minimapa** no canto superior esquerdo, **notícias** no superior direito, **avisos** no centro da tela.
- **Menu de armas** (`#menu-armas`, tecla Q): painel na mesma chapa do painel inferior, no **alto e centro** da tela, para a nave continuar à vista (o jogo não pausa). Uma carta por arma com número da tecla, ícone, nome, dano, energia, recarga e uma linha do efeito; a arma em uso tem borda `--neon` e o selo "EM USO". **Ícone de arma** (SVG de traço, sem preenchimento): traços `--laser` para os lasers (1 simples, 2 paralelos no duplo, 3 em leque no triplo), gota `--dreno` para o Dreno e floco `--gelo` para o Criogênico; o mesmo ícone, com o nome, fica no painel inferior. No celular o menu fica entre o minimapa e os botões da direita, e o nome no painel some (só o ícone).
- **Tipografia:** `system-ui` para texto e `ui-monospace` para números. Título com letras espaçadas e "ASTRO" em `--neon` com brilho.
- **Celular:** joystick à esquerda; Z, X e SHIFT à direita (mesma disposição do AstroN), com ARMA numa pílula acima deles. Área de toque com no mínimo 64 px.
- **Idioma:** português do Brasil, frases curtas e diretas, sem jargão técnico para o jogador ("Nave destruída · renascendo na base em 3s").

## Checklist antes de abrir o PR

- [ ] As cores novas saem da paleta acima (ou o guia foi atualizado no mesmo PR).
- [ ] Facetado, metal ≤ 0.5, neon ≤ 1.2.
- [ ] Inimigo em vermelho, tecnologia em turquesa, ambiente em tons quentes.
- [ ] Escala conferida contra a tabela (a nave cabe e passa por cima da decoração).
- [ ] Testado com print no navegador (base e cânion), sem erro no console.
- [ ] Texto em PT-BR.
