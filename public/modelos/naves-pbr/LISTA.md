# Naves mid-poly PBR (protótipo)

Pedido do Mateus, 14/nov/2026: melhorar a qualidade das naves **sem mudar a forma nem o layout de UV** do original.
Por enquanto **só a Cyclone Wing**, para comparar antes e depois jogando (a plaquinha "Protótipo" no canto direito da
tela, ou a tecla **P**, troca na hora; `public/js/prototipo-nave.js`, regras em `public/js/nave-pbr-regras.js`).

Cada nave fica no mesmo caminho dela em `public/modelos/naves/`, com cinco arquivos:

| Arquivo | Conteúdo |
|---|---|
| `<nave>.glb` | A malha do original soldada, com as quinas chanfradas e o resto liso com normais ponderadas; os nós de encaixe do original, iguais; sem imagem (material `pbr_nave`) |
| `<nave>_cor.webp` | A textura de cor do original ampliada 4× (256 → 1024), sRGB |
| `<nave>_mr.webp` | Vermelho = oclusão das frestas, verde = rugosidade, azul = metal (linear) |
| `<nave>_normal.webp` | Relevo das linhas da textura (frestas, grades) e micro-relevo da chapa; verde = +v da imagem (linear) |
| `<nave>_emissivo.webp` | O que acende: o vidro azul da cabine e as luzes verdes (sRGB) |

| Nave | Triângulos (antes → depois) | Tamanho |
|---|---|---|
| `shrewdo/functional/cyclone-wing` | 362 → 2072 | glb 58 KB + mapas 790 KB (antes: 140 KB) |

## Como refazer

```sh
pip install bpy scipy pillow numpy          # o Blender como módulo do Python
N=shrewdo/functional/cyclone-wing
python3 tools/nave_pbr_malha.py public/modelos/naves/$N.glb /tmp/malha.glb
node tools/nave_pbr_montar.mjs public/modelos/naves/$N.glb /tmp/malha.glb public/modelos/naves-pbr/$N.glb
python3 -I tools/nave_pbr_texturas.py public/modelos/naves/$N.glb public/modelos/naves-pbr/$N
```

- `nave_pbr_malha.py`: chanfro de 0,22 (metro do original) em 2 faixas nas quinas acima de 32°; a ponta fina (bico, ponta de
  asa) fica viva, sem chanfro, e nenhum vértice do original fica a mais de 0,25 da malha nova (o script mede e refaz).
- `nave_pbr_montar.mjs`: os nós do glb do original com a malha nova; confere a caixa.
- `nave_pbr_texturas.py`: só Pillow, numpy e scipy, semente fixa, **sem modelo de IA** (a ampliação é Lanczos + filtro de
  choque). Um upscaler de IA (Real-ESRGAN) ou repintura à mão daria uma cor melhor de perto; os outros mapas não mudam.

Nave nova no protótipo: gerar os cinco arquivos e pôr o modelo em `NAVES_PBR` (`public/js/nave-pbr-regras.js`);
`tests/nave-pbr.test.mjs` confere a forma, os encaixes e os arquivos.
