# Monstros do AstroN original (Stage 6, chefe do Stage 5 e os SN-3 e SN-Zero VI do Stage M5)

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
  o modelo é a pose parada (sem animação), salvo as exceções abaixo.
- **Exceção, com a animação do original: `sn3.glb` e `snzero.glb`** (feitos por
  `tools/monstros_do_original.py` direto do `.3dx`, sem Blender): cada peça da malha é um nó e
  a animação `STAND` do original vai junto (os quadros de matriz de cada peça do `.3dx`, 24 por
  segundo, em laço: as asas do SN-3 batendo, a cauda do SN-Zero VI ondulando e o cone de luz
  dele pulsando). Escala de um fator só, o tamanho do original × 0,25 (o `FATOR_AREA` das
  armas), com a origem no centro da caixa do **corpo** (sem o cone de luz). O material de luz
  (`nu0040_light`, o cone do SN-Zero VI) vem `BLEND` com `extras.aditivo`: o cliente desenha com
  mistura aditiva, como o original (`CAlphaManage::OnPaint`: SRCALPHA + ONE).
- **Exceção, com o esqueleto do original: `medusa.glb`** (o mesmo `tools/monstros_do_original.py`):
  a cúpula e os tentáculos são malhas com **pele** (`skins`: os 112 ossos `BoneNN` do `.3dx` viram
  juntas; cada vértice leva até 4 ossos e os pesos do original, `JOINTS_0`/`WEIGHTS_0`), e as
  animações são os **movimentos do `.eff`** (`nu1070.eff`, cada um com o quadro do `.3dx` de cada
  osso): `STAND` (o laço parado, quadros 146–202, 2,3 s: os tentáculos e os braços com garras
  ondulando), `STAND02`, `STAND03` e `STAND04` (1 s cada: ela sobe da água, nascendo ~85 m abaixo;
  no original o alfa abre no `STAND02`) e `STAND05` (o começo da volta, que só entra por trazer o
  quadro 72; os outros movimentos repetem quadros e ficam de fora). Origem no centro da caixa da
  **pose do laço parado** (a pose de ligação, o quadro 0, é ela debaixo d'água). ~1,4 MB.

## Arquivos

| Arquivo (`esp`) | Monstro (original) | id no `initnpc.cfg` → unidade → modelo | Triângulos | Tamanho no jogo (envergadura × comprimento × altura) | Escala sobre o original | Textura |
|---|---|---|---|---|---|---|
| `sn3.glb` | SN-3 (Stage M5) | 705010 → 502020 → `nu0230` | 671 (15 peças, `STAND` de 31 quadros, 1,25 s) | 18,5 × 23,0 × 9,0 m | 0,25 (original 92 m) | `nu0230.png` 256² |
| `snzero.glb` | SN-Zero VI (Stage M5) | 700405 → 500405 → `nu0045` | 257 (6 peças, `STAND` de 21 quadros, 0,83 s) | 16,3 × 18,2 × 14,1 m de corpo; o cone de luz vai 27 m à frente | 0,25 (original 73 m de corpo) | `nu0045.png` 128², `nu0040_light.png` 128² (BLEND, aditivo) |
| `xerxes.glb` | Xerxes | 705050 → 502060 → `nu0270` | 602 | 13,0 × 10,6 × 5,4 m | 0,135 (original 96 m) | `nu0270.png` 256², `-nu0270_wing.png` 256² (MASK) |
| `great_xerxes.glb` | Great Xerxes | 705055 → 502065 → `nu0300` (a malha do Xerxes 2× maior, couro vermelho) | 602 | 26,0 × 21,2 × 10,7 m | 0,135 (original 193 m) | `nu0300.png` 256², `-nu0270_wing.png` 256² (MASK) |
| `bazit.glb` | Bazit | 705040 → 502050 → `nu0260` | 658 | 13,0 × 10,8 × 8,9 m | 0,171 (original 76 m) | `nu0260.png` 256², `-nu0260_wing.png` 256² (MASK, asas) |
| `anti.glb` | Anti | 705060 → 502070 → `nu0280` | 326 | 26,0 × 23,1 × 5,5 m | 0,383 (original 68 m) | `nu0280.png` 256² |
| `sn4.glb` | SN-4 (chefe do Stage 5) | 702600 → 510600 → `nu1060` | 1498 | 30,0 × 28,6 × 28,5 m | 0,118 (original 255 m) | `nu1060_1.png`, `nu1060_2.png` 256² |
| `medusa.glb` | Ancient Medusa (chefe do Stage 6), com pele e movimentos | 702700 → 510700 → `nu1070` | 1390 | 60,1 × 58,1 × 65,7 m (no laço parado, tentáculos esticados) | 0,242 (original 199 m) | `nu1070.png` 256², `nu1070_tail.png` 64×256 (MASK, tentáculos) |
| `sonda.glb` | A-Fly IV (sonda errante) | 700303 → 500303 → `nu0033` | 226 | 3,5 × 8,0 × 3,3 m | 0,171 (original 47 m) | `nu0033.png` 128² |
| `medusa-sangue.glb` | efeito `BOSS_BLOOD` (#59 do `effectevent.txt`) | `s6_boss_blood` | 2 | 1,4 × 1,4 m, plano deitado | 0,242 (a da Medusa) | `s6_boss_blood.png` 128² (MASK) |
| `medusa-bolha.glb` | efeito `BOSS_BUBBLE` (#60) | `s6_boss_bubble` | 18 | 1,5 × 1,3 × 0,6 m | 0,242 (a da Medusa) | `1321045.png` 64² (MASK) |

Pasta inteira: ~2,5 MB.

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

**SN-3 e SN-Zero VI** (out/2026): `python3 -I tools/monstros_do_original.py <old-astron> public/modelos/monstros/sn3.glb nu0230 0.25`
e o mesmo com `snzero.glb nu0045`. O `.eff` do modelo (`assets_obb/effect/nu0230.eff`) só nomeia a animação
(`STAND`) e a sequência; quem mexe são as matrizes por quadro de cada peça no `.3dx` (`CDummy::SetFrame`), e o
efeito anda um quadro por atualização (`CEffectSprite::NextFrame`), a 24 por segundo.
