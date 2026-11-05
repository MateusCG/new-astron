# Imagens da interface

Imagens estáticas das telas (não do 3D). Cada uma diz de onde veio.

| Arquivo | Onde aparece | De onde veio |
|---|---|---|
| `abertura.jpg` | Fundo da tela de abertura (`#abertura`, `public/js/abertura.js`, `ARTE_ABERTURA` em `abertura-regras.js`) | Gerada no **Gemini** pelo Mateus (04/nov/2026), 1376 × 768, a partir do prompt e das vistas de referência dos modelos do jogo em `~/Documentos/new-astron-progresso/abertura/` (`PROMPT-GEMINI.md`, `ref-*.png`): a Alchemium Wing (Shrewdo Mobile, tier 5) contra a Chimera (Bellico Functional, tier 5) sobre o lago de He-3 ao entardecer. Regravada em JPEG qualidade 88 (Pillow). A provisória, desenhada com os modelos do jogo, saiu; o script dela é o `arte-provisoria.mjs` da mesma pasta. |

**Para trocar a arte:** JPEG, 16:9, de preferência 2560 × 1440 (no mínimo 1920 × 1080), até ~600 KB, com o mesmo nome (`abertura.jpg`). O lado esquerdo e o terço de baixo ficam sob o véu escuro do nome do jogo e da barra: o assunto vai do centro para a direita. A tela usa `object-position: 62% 50%`, então em telas mais estreitas que 16:9 corta mais a esquerda.
| `carregamento.jpg` | Fundo da tela de carregamento da partida (`#carregamento`, `public/js/carregamento.js`, `ARTE_CARREGAMENTO` em `carregamento-regras.js`): o mapa em que se vai jogar | Gerada no **Gemini** pelo Mateus (05/nov/2026), 1376 × 768, a partir do prompt e das vistas de referência do mapa renderizadas pelo próprio jogo em `~/Documentos/new-astron-progresso/carregamento/` (`PROMPT-GEMINI.md`, `ref-mapa-*.png`, script `mapa-arte.mjs`): o lago de Hélio-3 do alto ao entardecer, com a mineradora no centro, o portal verde embaixo à esquerda e o vermelho ao fundo. Regravada em JPEG qualidade 88 (Pillow). A provisória (render do jogo retocado) saiu. |

**Para trocar a arte do carregamento:** as mesmas regras da abertura (JPEG 16:9, 2560 × 1440, até ~600 KB, o mesmo nome `carregamento.jpg`). O alto à esquerda (nome do jogo e do mapa), o alto à direita (a sua nave) e o terço de baixo (barra e chips) ficam sob o véu escuro: o mapa vai do centro para cima. A tela usa `object-position: 58% 50%`.
