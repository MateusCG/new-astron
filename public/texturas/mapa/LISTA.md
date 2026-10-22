# Texturas PBR do mapa

Feitas por nós, sem foto nem nada do jogo original: geradas por `texturas_pbr.py` (numpy dentro do Blender, semente
fixa) em `~/Documentos/new-astron-progresso/mapa-stage6/tmp/cenario/`
(`blender -b --factory-startup --python texturas_pbr.py` refaz as três). Padrão em IDENTIDADE-VISUAL.md, "Padrão dos
modelos: sci-fi mid-poly PBR".

São **compartilhadas pelo mapa inteiro**: os glb não trazem imagem, e o cliente (`public/js/mapa-modelos.js`) liga o
conjunto no material `pbr_<conjunto>[_variação]`, pelo nome (lista em `TEXTURAS_PBR_MAPA`, `public/js/insumos.js`).
A cor de cada variação vem do fator do material no glb (a imagem de cor é quase cinza). `flipY` falso (UV do glTF).

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

Total: ~95 KB.
