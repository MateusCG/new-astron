# Efeitos do AstroN original (tocados como no original)

Gerados por `tools/efeitos3d_do_original.py` a partir de `old-astron/assets_obb` (`effect/<id>.eff`, `3dx/<modelo>.3dx` e `mpal/<paleta>.mpl`); quem toca é `public/js/efeitos-original.js`, e a lista do que a partida baixa é `EFEITOS_ORIGINAIS` em `public/js/insumos.js`. Cada json guarda a malha crua de cada peça (espaço do original: Z para cima, frente +x), as matrizes por quadro do `.3dx`, a paleta de texturas do `.MPL`, as texturas sem alfa (sólidas) e, por quadro e por peça, o bloco do `.eff` (quadro do `.3dx`, material da paleta, flags, cor RGBA e rolagem da textura). As texturas ficam em `public/texturas/efeitos/` (ver a `LISTA.md` de lá). Todos andam a 24 quadros por segundo; os de projétil, campo e estado repetem.

Escala no jogo: os golpes dos monstros (projétil, clarão, impacto, explosão) são o original × 0,25 (`FATOR_AREA`, a dos monstros e do raio de acerto dos tiros); o que fica preso na nave (ícones de estado, o Magma) e o disparo das armas de início do jogador (clarão, projétil e impacto, `public/js/disparo-original.js`), o original × 0,5 (`FATOR_TAMANHO_NAVE`, a das naves); a onda do SN-4 estica até o raio da nova, o campo elétrico até a área dele e o fim da Metralha Shrewdo até a área (raio / 100, o modo 7 do original).

| Arquivo | O que é | Peças | Quadros | Paleta | Tamanho |
|---|---|---|---|---|---|
| `2112001.json` | clarão dos feixes de início (Feixe Rifle Triplo, Feixe Bellico, Feixe Duplo) | 1 | 1 (0.04 s) | — | 11 KB |
| `1312003.json` | feixe do Feixe Rifle Triplo e do Feixe Duplo, V1–V3 (plano deitado de 21 m do original) | 1 | 1 (0.04 s) | — | 8 KB |
| `1312004.json` | o mesmo feixe, V4–V6 (25,5 m) | 1 | 1 (0.04 s) | — | 8 KB |
| `1312005.json` | o mesmo feixe, V7–V8 (30,7 m) | 1 | 1 (0.04 s) | — | 8 KB |
| `1312073.json` | Feixe Bellico, V1–V3: três anéis vermelhos girando | 3 | 21 (0.88 s) | — | 9 KB |
| `1312074.json` | Feixe Bellico, V4–V6 | 3 | 21 (0.88 s) | — | 9 KB |
| `1312075.json` | Feixe Bellico, V7–V8 | 3 | 21 (0.88 s) | — | 9 KB |
| `1321013.json` | bala dos Vulcans (Acron e Bellico), V1–V3: a bala sólida e o anel verde | 2 | 1 (0.04 s) | — | 6 KB |
| `1321014.json` | bala dos Vulcans, V4–V6 | 2 | 1 (0.04 s) | — | 6 KB |
| `1321015.json` | bala dos Vulcans, V7–V8 | 2 | 1 (0.04 s) | — | 6 KB |
| `1321003.json` | bala da Metralha Shrewdo, V1–V3: a bala sólida e o brilho verde virado para a câmera | 2 | 1 (0.04 s) | — | 6 KB |
| `1321004.json` | bala da Metralha Shrewdo, V4–V6 | 2 | 1 (0.04 s) | — | 6 KB |
| `1321005.json` | bala da Metralha Shrewdo, V7–V8 | 2 | 1 (0.04 s) | — | 6 KB |
| `1121001.json` | clarão do Disco Voador (SN-3) e dos Vulcans e da Metralha Shrewdo | 1 | 11 (0.46 s) | — | 3 KB |
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
| `1412001.json` | impacto do fogo, do feixe óptico e dos feixes de início | 3 | 15 (0.62 s) | — | 7 KB |
| `1421001.json` | impacto do Canhão Explosivo, dos Vulcans e da Metralha Shrewdo | 9 | 15 (0.62 s) | — | 24 KB |
| `1421002.json` | explosão no fim do Canhão Explosivo e da Metralha Shrewdo (o anel de raio 100) | 12 | 30 (1.25 s) | — | 47 KB |
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
| `1322063.json` | Armadilha Paralisante (Medusa): a esfera ciano | 1 | 30 (1.25 s) | — | 26 KB |
| `1322064.json` | Canhão de Pedra e Disparo de Controle (Medusa): partículas verdes, duas variantes | 2 | 41 (1.71 s) | — | 9 KB |
| `1421030.json` | impacto do Canhão de Pedra (Medusa): respingo verde | 5 | 11 (0.46 s) | — | 10 KB |
