# Naves de jogador (mid-poly PBR)

As 45 naves com classe do AstroN original (Acron, Bellico e Shrewdo), na versão **mid-poly PBR** (pedido do Mateus,
14–15/nov/2026): a **mesma forma e o mesmo layout de UV** do original, com a malha chanfrada e lisa, a textura de cor ampliada
por IA e os mapas de relevo, rugosidade, metal, oclusão e emissivo. Nada é repintado: a cor e os detalhes são os do original.
Regras em IDENTIDADE-VISUAL.md ("Nave de jogador: mid-poly PBR").

Os modelos do original (low-poly, com a textura dentro do glb) são a **fonte** dos geradores e ficam em
`tools/dados/naves-original/<raça>/<classe>/<nave>.glb`, fora do que o site serve.

## Arquivos de cada nave (`<raça>/<classe>/`)

| Arquivo | Conteúdo |
|---|---|
| `<nave>.glb` | As peças do original soldadas, com as quinas chanfradas e o resto liso com normais ponderadas; os nós de encaixe do original (propulsão, armas, jatos), iguais; sem imagem. Um material por imagem do original: `pbr_nave` (imagem 0) e `pbr_nave_<k>` (as Shrewdo de várias peças têm até 3) |
| `<nave>[_<k>]_cor.webp` | A textura de cor do original ampliada 4× por IA (Real-ESRGAN): 1024 px (512 nas peças de 128 px), com um grão fino, sRGB |
| `<nave>[_<k>]_normal.webp` | Relevo das linhas da textura (frestas, grades) e micro-relevo da chapa, no tamanho da cor; verde = +v da imagem (linear) |
| `<nave>[_<k>]_mr.webp` | Vermelho = oclusão das frestas, verde = rugosidade, azul = metal (linear), na metade do tamanho da cor |
| `<nave>[_<k>]_emissivo.webp` | O que acende: o vidro azul e as luzes verdes do original (sRGB), na metade do tamanho da cor |

O cliente liga os mapas pelo nome do material (`public/js/nave-pbr-regras.js`); `tests/nave-pbr.test.mjs` confere, nas 45, a
forma, os encaixes, os triângulos (teto de 8 mil) e os arquivos.

## Como refazer

```sh
# Uma vez: o Real-ESRGAN (o zip realesrgan-ncnn-vulkan-20220424-ubuntu.zip da versão v0.2.5.0, de
# github.com/xinntao/Real-ESRGAN/releases, extraído numa pasta; não fica no repositório) e o Python com numpy, scipy e Pillow.
PYTHON=~/venv/bin/python tools/naves_pbr.sh ~/realesrgan                       # as 45 (uns 15 min numa Iris Xe)
PYTHON=~/venv/bin/python tools/naves_pbr.sh ~/realesrgan acron/assault/ulysses # uma só
```

- `tools/nave_pbr_malha.py` (no Blender): chanfro de 0,22 (metro do original) em 2 faixas nas quinas acima de 32°. A ponta fina
  (bico, ponta de asa) fica viva, sem chanfro: o script mede o quanto a malha nova se afasta do original, para dentro e para
  fora, e refaz sem as quinas que passam de 0,25.
- `tools/nave_pbr_montar.mjs`: os nós do glb do original com as malhas novas (pelo nome do nó); confere a caixa de cada peça.
- `tools/nave_pbr_cor_ia.py`: a cor ampliada 4× pelo Real-ESRGAN (`realesrgan-ncnn-vulkan`, modelo `realesrgan-x4plus`), rodando
  na máquina (qualquer placa com Vulkan). Dos três modelos do zip, foi o que deixou a borda das chapas reta sem mudar a cor (os
  de anime saturam e alisam demais).
- `tools/nave_pbr_texturas.py`: os quatro mapas a partir da cor ampliada (`--cor`), só Pillow, numpy e scipy, com semente fixa
  (o número da unidade no original). `--tinta rugosidade,metal` troca o acabamento da pintura do casco: só a Ulysses usa
  (`0.40,0.60`, o casco dourado mais metálico; a tabela `TINTA` de `naves_pbr.sh`).

## As 45 naves

Total: 24.0 MB (o original somava 7 MB).

| Nave | Triângulos (original → agora) | Materiais | Tamanho (glb + mapas) |
|---|---|---|---|
| `acron/assault/kamasutra` | 484 → 3121 | 1 | 627 KB |
| `acron/assault/paladin` | 260 → 1459 | 1 | 455 KB |
| `acron/assault/tristan` | 564 → 3410 | 1 | 473 KB |
| `acron/assault/ulysses` | 498 → 2792 | 1 | 582 KB |
| `acron/assault/warrior` | 266 → 1352 | 1 | 421 KB |
| `acron/mobile/eurus` | 484 → 2514 | 1 | 573 KB |
| `acron/mobile/ranger` | 174 → 894 | 1 | 426 KB |
| `acron/mobile/sephiros` | 470 → 2428 | 1 | 508 KB |
| `acron/mobile/tracker` | 588 → 2732 | 1 | 473 KB |
| `acron/mobile/windwalker` | 384 → 2060 | 1 | 447 KB |
| `acron/functional/esper` | 266 → 1962 | 1 | 587 KB |
| `acron/functional/garuda` | 616 → 2868 | 1 | 440 KB |
| `acron/functional/mirage` | 296 → 1820 | 1 | 455 KB |
| `acron/functional/mobius` | 438 → 2371 | 1 | 587 KB |
| `acron/functional/mystique` | 460 → 2397 | 1 | 499 KB |
| `bellico/assault/cheetahar` | 646 → 3454 | 1 | 500 KB |
| `bellico/assault/elephantera` | 700 → 3161 | 1 | 469 KB |
| `bellico/assault/liger` | 386 → 2280 | 1 | 487 KB |
| `bellico/assault/lioner` | 330 → 1846 | 1 | 474 KB |
| `bellico/assault/tigera` | 322 → 1510 | 1 | 477 KB |
| `bellico/mobile/condor` | 516 → 2577 | 1 | 535 KB |
| `bellico/mobile/eagle` | 736 → 3722 | 1 | 553 KB |
| `bellico/mobile/falcon` | 540 → 2660 | 1 | 554 KB |
| `bellico/mobile/phantom` | 686 → 3785 | 1 | 541 KB |
| `bellico/mobile/phoenix` | 662 → 3580 | 1 | 529 KB |
| `bellico/functional/chimera` | 660 → 4192 | 1 | 489 KB |
| `bellico/functional/dragoner` | 196 → 654 | 1 | 434 KB |
| `bellico/functional/snaker` | 188 → 641 | 1 | 407 KB |
| `bellico/functional/sphinx` | 622 → 2864 | 1 | 486 KB |
| `bellico/functional/turtle` | 252 → 1186 | 1 | 445 KB |
| `shrewdo/assault/assault-wing` | 298 → 1553 | 2 | 534 KB |
| `shrewdo/assault/hellion-wing` | 614 → 3486 | 1 | 565 KB |
| `shrewdo/assault/plate-wing` | 350 → 1780 | 2 | 560 KB |
| `shrewdo/assault/power-wing` | 330 → 1762 | 2 | 510 KB |
| `shrewdo/assault/uranium-wing` | 681 → 4465 | 1 | 606 KB |
| `shrewdo/mobile/alchemium-wing` | 454 → 2521 | 1 | 542 KB |
| `shrewdo/mobile/lightning-wing` | 565 → 3657 | 1 | 525 KB |
| `shrewdo/mobile/rapier-wing` | 276 → 1648 | 2 | 543 KB |
| `shrewdo/mobile/speed-wing` | 270 → 1570 | 3 | 1013 KB |
| `shrewdo/mobile/thunder-wing` | 296 → 1337 | 2 | 600 KB |
| `shrewdo/functional/chaos-wing` | 414 → 2606 | 3 | 1000 KB |
| `shrewdo/functional/cyclone-wing` | 362 → 2072 | 1 | 569 KB |
| `shrewdo/functional/energy-wing` | 518 → 3045 | 1 | 523 KB |
| `shrewdo/functional/magic-wing` | 440 → 2589 | 2 | 592 KB |
| `shrewdo/functional/techron-wing` | 427 → 2624 | 3 | 979 KB |
