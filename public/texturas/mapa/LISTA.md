# Texturas PBR do mapa

Feitas por nós, sem foto nem nada do jogo original: geradas por `texturas_pbr.py` (o `painel`) e `texturas_rocha.py`
(a `rocha`), numpy dentro do Blender, semente fixa, em `~/Documentos/new-astron-progresso/mapa-stage6/tmp/cenario/`
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

Total dos dois conjuntos: ~250 KB.
