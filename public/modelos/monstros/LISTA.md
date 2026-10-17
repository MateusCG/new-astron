# Monstros do AstroN original (Stage 6 e chefe do Stage 5)

Modelos dos monstros da jungle do mapa novo (Stage 6), tirados do AstroN original por decisão do
Mateus (out/2026, exceção do `IDENTIDADE-VISUAL.md`). A pesquisa (colunas do `initnpc.cfg`, força,
números do jogo) está em `new-astron-progresso/mapa-stage6/PESQUISA-MONSTROS.md`.

## Como usar

- glTF binário, **Y para cima, 1 unidade = 1 m, já na escala do jogo** (não precisa escalar ao carregar).
- **Origem no centro da caixa** do modelo (meio do comprimento, da envergadura e da altura).
- **Frente em −z** (a frente das naves no jogo): diferente dos glb das naves, que vêm com o nariz em +x
  e são girados no `nave.js`. Aqui é só pôr no lugar e aplicar o `yaw` da entidade.
- Materiais como os das naves: dois lados (`doubleSided`), sem metal, rugosidade 0,6, a textura do
  original embutida (PNG). Textura com transparência (asas, tentáculos, efeitos) vem com
  `alphaMode: MASK` (corte 0,5).
- Faces já na ordem certa (a mesma correção do `orientarFaces` do `nave.js`, feita na conversão).
- Os ossos do esqueleto do original (objetos `BoneNN` do 3DX, que no jogo só deformam a malha) saíram;
  o modelo é a pose parada (sem animação). Animar (bater de asas, tentáculos) fica para o cliente.

## Arquivos

| Arquivo (`esp`) | Monstro (original) | id no `initnpc.cfg` → unidade → modelo | Triângulos | Tamanho no jogo (envergadura × comprimento × altura) | Escala sobre o original | Textura |
|---|---|---|---|---|---|---|
| `armish.glb` | Armish IV | 700103 → 500103 → NU0013 (usa a malha `nu0012`, ver `effect/nu0013.eff`) | 178 | 4,4 × 12,0 × 5,4 m | 0,305 (original 39 m) | `nu0012.png` 128² |
| `chrometic.glb` | Chrometic | 705020 → 502030 → `nu0240` | 258 | 3,5 × 12,0 × 4,4 m | 0,173 (original 69 m) | `nu0240.png` 256², `-nu0270_wing.png` 256² (MASK, barbatanas) |
| `xerxes.glb` | Xerxes | 705050 → 502060 → `nu0270` | 602 | 13,0 × 10,6 × 5,4 m | 0,135 (original 96 m) | `nu0270.png` 256², `-nu0270_wing.png` 256² (MASK) |
| `great_xerxes.glb` | Great Xerxes | 705055 → 502065 → `nu0300` (a malha do Xerxes 2× maior, couro vermelho) | 602 | 26,0 × 21,2 × 10,7 m | 0,135 (original 193 m) | `nu0300.png` 256², `-nu0270_wing.png` 256² (MASK) |
| `bazit.glb` | Bazit | 705040 → 502050 → `nu0260` | 658 | 13,0 × 10,8 × 8,9 m | 0,171 (original 76 m) | `nu0260.png` 256², `-nu0260_wing.png` 256² (MASK, asas) |
| `anti.glb` | Anti | 705060 → 502070 → `nu0280` | 326 | 26,0 × 23,1 × 5,5 m | 0,383 (original 68 m) | `nu0280.png` 256² |
| `sn4.glb` | SN-4 (chefe do Stage 5) | 702600 → 510600 → `nu1060` | 1498 | 30,0 × 28,6 × 28,5 m | 0,118 (original 255 m) | `nu1060_1.png`, `nu1060_2.png` 256² |
| `medusa.glb` | Ancient Medusa (chefe do Stage 6) | 702700 → 510700 → `nu1070` | 1390 | 48,0 × 47,5 × 42,7 m | 0,242 (original 199 m) | `nu1070.png` 256², `nu1070_tail.png` 64×256 (MASK, tentáculos) |
| `sonda.glb` | A-Fly IV (sonda errante) | 700303 → 500303 → `nu0033` | 226 | 3,5 × 8,0 × 3,3 m | 0,171 (original 47 m) | `nu0033.png` 128² |
| `medusa-sangue.glb` | efeito `BOSS_BLOOD` (#59 do `effectevent.txt`) | `s6_boss_blood` | 2 | 1,4 × 1,4 m, plano deitado | 0,242 (a da Medusa) | `s6_boss_blood.png` 128² (MASK) |
| `medusa-bolha.glb` | efeito `BOSS_BUBBLE` (#60) | `s6_boss_bubble` | 18 | 1,5 × 1,3 × 0,6 m | 0,242 (a da Medusa) | `1321045.png` 64² (MASK) |

Pasta inteira: ~1,15 MB.

**Efeitos da Medusa no original** (`assets_obb/cfg/effectevent.txt`): o sangue nasce num ponto
sorteado a até 70 m (original) do centro, girado ao acaso, cresce 0,3–0,7× por segundo e some em
1,5–2 s; a bolha nasce a até 60 m, cresce 0,1–0,3× por segundo e some em 3,5 s. Na escala daqui:
até ~17 m e ~15 m do centro da Medusa. São decoração do cliente (sem regra de jogo).

## De onde veio e como refazer

Origem: `old-astron/reference/models_obj/<modelo>.obj` (+ `.mtl`) e `reference/textures_png/`
(convertidos do `assets_obb/3dx/*.3dx` por `old-astron/scripts/x3dx_to_obj.py`). Scripts da conversão
em `new-astron-progresso/mapa-stage6/tmp/monstros/`:

1. `python3 -I preparar_obj.py <models_obj> <textures_png> obj <modelos...>`: acerta a ordem das faces
   pelas normais do arquivo, tira as faces dos ossos e aponta o MTL para as texturas;
2. `blender -b --factory-startup --python blender_monstros.py -- specs.json obj <saída glb> <prints>`:
   importa, junta, centra, gira a frente (+x do OBJ) para −z, escala para o `tamanho` (maior medida
   horizontal) do `specs.json`, exporta o glb e fotografa (de trás, de frente e de cima, com uma régua
   turquesa de 10 m e uma seta laranja na frente). Prints em `new-astron-progresso/mapa-stage6/prints-monstros/`.
