# Efeitos do AstroN original (tocados como no original)

Gerados por `tools/efeitos3d_do_original.py` a partir de `old-astron/assets_obb` (`effect/<id>.eff`, `3dx/<modelo>.3dx` e `mpal/<paleta>.mpl`); quem toca é `public/js/efeitos-original.js`, e a lista do que a partida baixa é `EFEITOS_ORIGINAIS` em `public/js/insumos.js`. Cada json guarda a malha crua de cada peça (espaço do original: Z para cima, frente +x), as matrizes por quadro do `.3dx`, a paleta de texturas do `.MPL`, as texturas sem alfa (sólidas) e, por quadro e por peça, o bloco do `.eff` (quadro do `.3dx`, material da paleta, flags, cor RGBA e rolagem da textura). As texturas ficam em `public/texturas/efeitos/` (ver a `LISTA.md` de lá). Todos andam a 24 quadros por segundo; os de projétil, campo e estado repetem.

Escala no jogo: os golpes (projétil, clarão, impacto, explosão) são o original × 0,25 (`FATOR_AREA`, a dos monstros e do raio de acerto dos tiros); o que fica preso na nave (ícones de estado, o Magma), o original × 0,5 (`FATOR_TAMANHO_NAVE`, a das naves); a onda do SN-4 estica até o raio da nova e o campo elétrico até a área dele.

| Arquivo | O que é | Peças | Quadros | Paleta | Tamanho |
|---|---|---|---|---|---|
| `1121001.json` | clarão do Disco Voador (SN-3) | 1 | 11 (0.46 s) | — | 3 KB |
| `1150005.json` | clarão dos mísseis (SN-3, SN-4) | 1 | 7 (0.29 s) | — | 1 KB |
| `1164001.json` | Magma na nave (dreno de HP: faíscas vermelhas subindo) | 4 | 71 (2.96 s) | — | 38 KB |
| `1322060.json` | Canhão Explosivo (Xerxes) | 1 | 1 (0.04 s) | — | 2 KB |
| `1322061.json` | Canhão Teleguiado (Anti) | 1 | 41 (1.71 s) | — | 5 KB |
| `1322065.json` | Lançador de Feixe Óptico (Bazit) | 1 | 41 (1.71 s) | — | 5 KB |
| `1332035.json` | Onda de Feixe Óptico (SN-4) | 4 | 39 (1.62 s) | — | 21 KB |
| `1361031.json` | Disco Voador (SN-3) | 1 | 69 (2.88 s) | — | 9 KB |
| `1361153.json` | Lança-chamas (Xerxes) | 1 | 58 (2.42 s) | 57 | 11 KB |
| `1361253.json` | Lança-chamas (Grande Xerxes) | 1 | 58 (2.42 s) | 57 | 11 KB |
| `1401007.json` | impacto do Míssil de Longo Alcance (Anti) | 1 | 15 (0.62 s) | 16 | 8 KB |
| `1401307.json` | impacto do Disco Voador e do Míssil Cruzador | 1 | 15 (0.62 s) | 16 | 8 KB |
| `1412001.json` | impacto do fogo e do feixe óptico | 3 | 15 (0.62 s) | — | 7 KB |
| `1421001.json` | impacto do Canhão Explosivo | 9 | 15 (0.62 s) | — | 24 KB |
| `1421002.json` | explosão no fim do Canhão Explosivo | 12 | 30 (1.25 s) | — | 47 KB |
| `1502004.json` | impacto da onda (SN-4) e do Canhão Teleguiado (Anti) | 2 | 30 (1.25 s) | — | 18 KB |
| `1503009.json` | impacto do míssil do SN-3 (a esfera azul) e do campo do SN-4 | 2 | 30 (1.25 s) | — | 18 KB |
| `2252008.json` | Campo Elétrico (SN-4) | 9 | 40 (1.67 s) | 10 | 27 KB |
| `2341024.json` | Míssil Cruzador (SN-4) e Míssil de Longo Alcance (Anti) | 3 | 10 (0.42 s) | — | 14 KB |
| `2343012.json` | Míssil Descarregador de Energia (SN-3), com o "E" | 3 | 1 (0.04 s) | — | 27 KB |
| `2432001.json` | explosão no fim do Canhão Teleguiado (Anti) | 2 | 31 (1.29 s) | 21 | 5 KB |
| `cross003.json` | ícone: resistências quebradas (capacete no círculo vermelho) | 2 | 30 (1.25 s) | — | 14 KB |
| `cross002.json` | ícone: paralisia (LD) | 1 | 20 (0.83 s) | — | 12 KB |
| `cross007.json` | ícone: movimento (avião proibido) | 2 | 30 (1.25 s) | — | 12 KB |
| `cross008.json` | ícone: ataque (espada proibida) | 2 | 30 (1.25 s) | — | 13 KB |
| `cross010.json` | ícone: desgoverno | 2 | 50 (2.08 s) | — | 19 KB |
| `cross013.json` | ícone: energia ("E") | 1 | 50 (2.08 s) | — | 11 KB |
