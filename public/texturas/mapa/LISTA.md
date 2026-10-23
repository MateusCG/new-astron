# Texturas PBR do mapa

Feitas por nós, sem foto nem nada do jogo original: geradas por `texturas_pbr.py` (o `painel`), `texturas_rocha.py`
(a `rocha`) e `texturas_agua.py` (a `agua`), numpy dentro do Blender, semente fixa, em `~/Documentos/new-astron-progresso/mapa-stage6/tmp/cenario/`
(`blender -b --factory-startup --python <script>.py` refaz as três de cada conjunto). Padrão em IDENTIDADE-VISUAL.md, "Padrão dos
modelos: sci-fi mid-poly PBR".

São **compartilhadas pelo mapa inteiro**: os glb não trazem imagem, e o cliente (`public/js/mapa-modelos.js`) liga o
conjunto no material `pbr_<conjunto>[_variação]`, pelo nome (lista em `TEXTURAS_PBR_MAPA`, `public/js/insumos.js`).
A cor de cada variação vem do fator do material no glb (a imagem de cor é quase cinza). `flipY` falso (UV do glTF) e
`RepeatWrapping` (a rocha repete; o atlas do painel fica dentro de 0..1).

## Conjunto `painel` (chapa metálica)

Atlas 2 × 2 (*trim sheet*), 1024 × 1024. Cada quadrante é **uma chapa inteira** com a fresta na borda e rebites; a
malha mapeia cada face num quadrante (sem repetir a textura), com uma margem de 0,006 para o mipmap não vazar.

| Quadrante (UV do Blender, v para cima) | Chapa |
|---|---|
| 0: u 0–0,5, v 0–0,5 | lisa, com friso perto da borda |
| 1: u 0,5–1, v 0–0,5 | com grade de ventilação (8 fendas) |
| 2: u 0–0,5, v 0,5–1 | com escotilha, duas alças e a placa central |
| 3: u 0,5–1, v 0,5–1 | dividida em quatro, com a barra de reforço |

| Arquivo | Conteúdo | Espaço de cor |
|---|---|---|
| `painel_cor.webp` | cor (cinza 0,72 com manchas, sujeira nas frestas, quinas e riscos claros) | sRGB |
| `painel_mr.webp` | metallicRoughness do glTF: **verde = rugosidade** (0,38–0,92), **azul = metal** (multiplica o fator) | linear |
| `painel_normal.webp` | relevo (normal tangente, convenção glTF/OpenGL: verde = +v); o cliente usa `normalScale (1, −1)` porque o glb vem sem tangentes e a textura não é invertida | linear |

## Conjunto `rocha` (rocha em estratos)

Uma textura de 1024 × 1024 que **repete sem emenda** nos dois sentidos (ruído periódico). Rocha sedimentar: 8 camadas
horizontais de espessura desigual com a linha entre elas ondulando, o sulco entre as camadas, juntas verticais tortas
(desencontradas entre camadas) que partem cada camada em blocos com a sua inclinação, camadas duras que saltam e moles
que esfarelam, fissuras finas cortando as camadas, poros de erosão, grão e pintas de mineral. Material `pbr_rocha`
(`rochas_pbr.py`): a parede mapeia **u ao longo do contorno e v na altura** (um ladrilho a cada 24 m; no contorno
fechado o comprimento fecha num número inteiro de ladrilhos), as faces deitadas projetam no plano xz (ladrilho de 40 m,
girado 27°), e o tom de cada estrato vem da cor do vértice.

| Arquivo | Conteúdo | Espaço de cor |
|---|---|---|
| `rocha_cor.webp` | cor quase cinza (média ~0,84 sRGB), um tom levemente quente ou cinza por camada, cavidades e juntas escuras, quinas e pintas claras | sRGB |
| `rocha_mr.webp` | **verde = rugosidade** (0,7–0,98), azul = metal (0) | linear |
| `rocha_normal.webp` | relevo (mesma convenção do painel) | linear |

## Conjunto `agua` (superfície do lago)

Duas imagens de 1024 × 1024 que **repetem sem emenda**, geradas por `texturas_agua.py` (numpy dentro do Blender, semente fixa).
Não vão num material do glb: o shader da água (`public/js/agua.js`) lê cada uma várias vezes, em tamanhos, giros e direções
diferentes, andando com o tempo (o `agua.glb` traz o material `pbr_agua` só para o cliente baixar o conjunto junto).

| Arquivo | Conteúdo | Espaço de cor |
|---|---|---|
| `agua_normal.webp` | relevo das ondulações (mesma convenção do painel): a altura sai de um espectro de ondas só em frequências inteiras do ladrilho (\|H\|² ~ k^−4,5, mais energia ao longo de u, corte nas altas), a normal é a derivada exata no espectro, a crista um pouco mais aguda que o vale; inclinação média 0,32 | linear |
| `agua_espuma.webp` | R = renda de espuma fina (bordas de Voronoi periódico, 26 células, domínio torcido), G = renda grossa (9 células), B = a altura do relevo do mesmo ladrilho; valores de densidade: o shader corta num limiar que sobe com a quantidade de espuma | linear |

Total dos três conjuntos: ~510 KB.
