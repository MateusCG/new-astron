# Naves mid-poly PBR (protótipo)

Pedido do Mateus, 14/nov/2026: melhorar a qualidade das naves **sem mudar a forma nem o layout de UV** do original.
Por enquanto **a Cyclone Wing e a Ulysses**, para comparar antes e depois jogando (a plaquinha "Protótipo" no canto direito da
tela, ou a tecla **P**, troca na hora; `public/js/prototipo-nave.js`, regras em `public/js/nave-pbr-regras.js`).

Cada nave fica no mesmo caminho dela em `public/modelos/naves/`, com cinco arquivos:

| Arquivo | Conteúdo |
|---|---|
| `<nave>.glb` | A malha do original soldada, com as quinas chanfradas e o resto liso com normais ponderadas; os nós de encaixe do original, iguais; sem imagem (material `pbr_nave`) |
| `<nave>_cor.webp` | A textura de cor do original ampliada 4× (256 → 1024) por IA (Real-ESRGAN), com um grão fino, sRGB |
| `<nave>_mr.webp` | Vermelho = oclusão das frestas, verde = rugosidade, azul = metal (linear) |
| `<nave>_normal.webp` | Relevo das linhas da textura (frestas, grades) e micro-relevo da chapa; verde = +v da imagem (linear) |
| `<nave>_emissivo.webp` | O que acende: o vidro azul da cabine e as luzes verdes (sRGB) |

| Nave | Triângulos (antes → depois) | Tamanho |
|---|---|---|
| `shrewdo/functional/cyclone-wing` | 362 → 2072 | glb 58 KB + mapas 610 KB (antes: 140 KB) |
| `acron/assault/ulysses` | 498 → 2792 | glb 74 KB + mapas 600 KB (antes: 137 KB); `--semente 14 --tinta 0.40,0.60` (casco dourado, mais metálico) |

## Como refazer

```sh
pip install bpy scipy pillow numpy          # o Blender como módulo do Python
N=shrewdo/functional/cyclone-wing
python3 tools/nave_pbr_malha.py public/modelos/naves/$N.glb /tmp/malha.glb
node tools/nave_pbr_montar.mjs public/modelos/naves/$N.glb /tmp/malha.glb public/modelos/naves-pbr/$N.glb
python3 -I tools/nave_pbr_cor_ia.py public/modelos/naves/$N.glb /tmp/cor.png ~/realesrgan   # a cor ampliada por IA (pasta do zip extraído)
python3 -I tools/nave_pbr_texturas.py public/modelos/naves/$N.glb public/modelos/naves-pbr/$N --cor /tmp/cor.png   # + as opções da tabela
```

- `nave_pbr_malha.py`: chanfro de 0,22 (metro do original) em 2 faixas nas quinas acima de 32°; a ponta fina (bico, ponta de
  asa) fica viva, sem chanfro, e nenhum vértice do original fica a mais de 0,25 da malha nova (o script mede e refaz).
- `nave_pbr_montar.mjs`: os nós do glb do original com a malha nova; confere a caixa.
- `nave_pbr_cor_ia.py`: a cor ampliada 4× pelo **Real-ESRGAN** (`realesrgan-ncnn-vulkan`, modelo `realesrgan-x4plus`), rodando na
  máquina (qualquer placa com Vulkan; uns 15 s por textura numa Iris Xe). O executável e os modelos não ficam no repositório:
  são o zip `realesrgan-ncnn-vulkan-20220424-ubuntu.zip` da versão v0.2.5.0 (github.com/xinntao/Real-ESRGAN/releases). Dos três
  modelos do zip, o `x4plus` foi o que deixou a borda das chapas reta sem mudar a cor (os de anime saturam e alisam demais).
- `nave_pbr_texturas.py`: só Pillow, numpy e scipy, semente fixa (`--semente`, o número da unidade no original); `--tinta rugosidade,metal`
  troca o acabamento da pintura do casco; `--cor` recebe a cor da IA (as duas naves do protótipo usam) e, sem ela, a ampliação é a
  daqui (Lanczos + filtro de choque, sem IA, com a borda das chapas ondulada de perto). Os outros mapas saem da cor ampliada.

Nave nova no protótipo: gerar os cinco arquivos e pôr o modelo em `NAVES_PBR` (`public/js/nave-pbr-regras.js`);
`tests/nave-pbr.test.mjs` confere a forma, os encaixes e os arquivos.
