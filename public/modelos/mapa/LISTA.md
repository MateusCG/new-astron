# Modelos do mapa (lago de Hélio-3, Stage 6 no formato do mapa 2D)

Feitos no Blender por script (bpy, procedural), **sem copiar** geometria nem textura do original: o Stage 6 do AstroN
(`old-astron/reference/models_obj/stage 6.obj`, `s6_*`) foi só referência de forma e clima (rocha em estratos, lago
turquesa, warp gate em ilha flutuante com tubos pendurados, cristais azuis no veio). Fontes `.blend` e scripts fora do
repo: `new-astron-progresso/mapa-stage6/blender/` e `.../tmp/cenario/` (`cenario_lib.py` + um script por grupo;
`blender -b --factory-startup --python <script>.py` refaz o `.glb`).

## Padrão de todos

- glTF binário, **Y para cima, 1 unidade = 1 m**, no referencial do jogo (x para a direita do desenho, z para baixo do
  desenho). Pivô na origem do mapa ou do objeto, **y = 0 = chão de voo** (a nave voa a 10 m), salvo nota.
- Facetado: os arquivos **não trazem normais** de propósito (ficam ~4× menores); o `GLTFLoader` liga `flatShading`
  sozinho quando falta a normal. Sem textura nem UV: cor + emissivo.
- Materiais por nome (o cliente acha pelo nome e troca o que precisar):

| Material | Cor | O que é |
|---|---|---|
| `rocha_topo`, `rocha_clara`, `rocha`, `rocha_escura`, `rocha_molhada` | `#b59a74`, `#9c8062`, `#765c45`, `#4f3d2e`, `#33302a` | Estratos da rocha (o molhado fica da água para baixo) |
| `fundo_lago` | `#4a4b40` | Leito do lago |
| `coral`, `coral_claro`, `alga` | `#b25a3e`, `#d08a62`, `#5b6a3a` | Decoração do fundo |
| `metal`, `metal_escuro`, `metal_claro` | `#5d6866`, `#3a4442`, `#9aa5a3` | Tecnologia (metalness 0,3–0,35, rugosidade 0,55–0,65) |
| `neon_time` | `#00efc0` (padrão) | **Acento do time**: o cliente pinta turquesa `#00efc0` no seu time e vermelho `#ff3b2a` no outro (cor e emissivo, intensidade 0,9–1) |
| `portal_time` | `#00efc0`, alpha 0,35 (BLEND) | Membrana do portal warp: cor do time, translúcida; o cliente pode trocar por shader (redemoinho aditivo) |
| `neon_doca_0`, `neon_doca_1` | turquesa / vermelho | Luzes das docas da mineradora: a `_0` é a doca do **time 0** (face −x), a `_1` a do time 1 (face +x). Pintar cada uma com a cor do time dono relativa a quem olha |
| `neon_he3` | `#9fe8ff` | Hélio-3 (neon, pode "respirar" 0,6–1,2) |
| `he3_escuro` | `#2f7fb8` | Faces escuras dos cristais de He-3 (sem emissivo) |
| `neon_objetivo` | `#ffb627` | Âmbar dos objetivos (núcleo, torre de suporte, plataforma de pouso) |
| `neon_servico` | `#a58bff` (padrão) | Anel das plataformas de serviço: o cliente pinta violeta `#a58bff` na Evolução e magenta `#ff6fd8` na Loja |

Todos os materiais saem `doubleSided` (o padrão do exportador). Malha fechada pode virar `FrontSide` no cliente para
economizar, conferindo no print (a borda e as faixas de neon são abertas).

## Peças

Planta = a forma de `shared/terrain.js` / `shared/obstaculos.js`. Toda peça sólida foi conferida por script: os vértices
entre 3 e 30 m de altura ficam **entre a planta e a planta + 4 m** (números abaixo). Acima de 30 m a rocha recua em
degraus (como a física: degrau de 30% do topo e rampa de 16 m); da água para baixo ela abre em talude até o fundo.

| Arquivo | O que é | Medidas (x × y × z, m) | Triângulos | Pivô | Como pôr no mapa |
|---|---|---|---|---|---|
| `rocha-quadrante.glb`, `rocha-quadrante-b.glb` | Rocha do quadrante em estratos (cápsula 360 × 135, `ROCHA_QUADRANTE`), com entulho no pé que fura a água (até 1,8 m, sem colisão). Duas variantes | 382 × −64…107 × 167 | 1.862 cada | centro da cápsula, y = 0 | Q0N (−697,5, −652,5) `rocha-quadrante` giro 0; Q0S (−697,5, 652,5) `-b` giro 0; Q1S (697,5, 652,5) `rocha-quadrante` giro π; Q1N (697,5, −652,5) `-b` giro π. Planta: 0,4 a 3,5 m |
| `parede-l.glb` | Parede em L do poço de cima, lado do time 0 (barras `LN0v` + `LN0h`, espessura 40, topo 84–100) | −39…239 × −64…98 × −238…33 (local) | 2.318 | **cruzamento dos eixos das barras**, (−324, −648) | LN0: (−324, 0, −648) giro 0; LS1: (324, 0, 648) giro π. Planta: −0,7 a 5,3 m (o 5,3 é no dente de 3 m entre as barras) |
| `parede-l-espelhada.glb` | O mesmo L espelhado em z (poço de baixo) | idem, z −33…240 | 2.318 | idem | LS0: (−324, 0, 648) giro 0; LN1: (324, 0, −648) giro π |
| `borda-quadrante.glb` | A parede da borda de **um quarto** do mapa (x ≤ 0, z ≤ 0): do meio da borda de cima (0, −1060) ao meio do fundo do bolsão (−1440, 0), com os cantos de raio 40 de `sdBorda`, topo 100–165 e o tampo até ~150 m para dentro da rocha | −1590…0 × −64…164 × −1210…0 | 6.092 | **origem do mapa** | giro 0 (em cima à esquerda) e giro π (embaixo à direita). Planta: 0,3 a 3,6 m |
| `borda-quadrante-espelhada.glb` | O mesmo quarto espelhado em z (x ≤ 0, z ≥ 0) | z 0…1210 | 6.092 | origem do mapa | giro 0 (embaixo à esquerda) e giro π (em cima à direita). As emendas em x = 0 e z = 0 são espelho, sem fresta |
| `borda-horizonte.glb` | Planalto e montanhas de fundo em volta do mapa inteiro (até ±3300 × ±3000), começando escondido atrás da borda (saia a 92 m) e subindo a ~330 m | 6630 × 92…334 × 5970 | 5.488 | origem do mapa | uma peça, giro 0 |
| `fundo-lago.glb` | Leito do lago no mapa inteiro, ondulado entre −68 e −60 (simétrico pela rotação de 180°) | 3200 × −68…−60 × 2400 | 2.400 | origem do mapa | uma peça, giro 0 |
| `mineradora.glb` | **Mineradora de Hélio-3** (ver abaixo) | 264 × −75…134 × 344 (com as pernas e os cristais do fundo; o casco é 143 × 233) | 9.121 | centro da mineradora, y = 0 | (0, 0, 0), giro 0. Planta (`MINERADORA` 70 × 115, canto 24): 0,0 a 3,95 m |
| `base-warp.glb` | **Portal warp** da base do time 0 (ver abaixo), virado para +x | 80 × 31…224 × 156 | 3.068 | ponto do `PORTAL_WARP` (local −95, 0 da base), y = 0 | time 0: (−1375, 0, 0) giro 0; time 1: (1375, 0, 0) giro π. Peça mais baixa a 31 m (acima de `PORTAL_WARP.base` = 30): sem colisão |
| `plataforma-base.glb` | Anel de pouso da base: deque flutuante r 70, anel `neon_time` r 64 e r 14, balizas de 1,2 m, pilares até o fundo | 140 × −62…1,2 × 140 | 1.186 | centro, **topo do deque em y = 0** | (∓1280, 1,7, 0): y = `heightAt + piso` da área de pouso |
| `plataforma-servico.glb` | Plataforma da Evolução e da Loja: deque r 23, anel `neon_servico` r 20 | 46 × −62…1,2 × 46 | 866 | centro, topo em y = 0 | `SERVICOS` com y = piso (1,2). O ícone do serviço continua desenhado pelo cliente |
| `plataforma-pouso.glb` | Plataforma de pouso do ouro (P0/P1): deque r 32, anel âmbar r 28, quatro setas para o centro e o nó **`emissor`** no centro (de onde sai o feixe com alguém pousado) | 64 × −62…1,2 × 64 | 1.018 | centro, topo em y = 0 | P0 (−495, 1, −445,5), P1 (495, 1, 445,5) |
| `nucleo.glb` | **Núcleo de He-3** (ver abaixo) | 138 × −62…71 × 138 | 3.144 | centro do poço, y = 0 | (0, 0, −877). Cristal centrado em y = 18 (a entidade do servidor) |
| `torre-suporte.glb` | Torre do buff de suporte (cilindro r 7, topo 30): fuste sextavado com três faixas âmbar, colar, capitel e o nó **`suporte_nucleo`** (octaedro âmbar com anel, a 30,5 m: pulsar/girar) | 17 × −62…34 × 19 | 320 | centro, y = 0 | BS0 (−855, 0, 909), BS1 (855, 0, −909). Planta: até 2,6 m para fora |
| `torre-suporte-caida.glb` | A mesma torre derrubada: toco quebrado (até 2,4 m acima do voo, sem colisão), destroços e uma faixa âmbar caída | 30 × −62…2,2 × 26 | 266 | idem | troca com a de pé quando `definirObstaculoAtivo('BS0', false)` |
| `entrega.glb` | Arco da entrega dos mineradores na boca da base: viga flutuante a 40–49 m com fendas e luminárias `neon_time`, dois pilares flutuantes e duas boias na água (até 2,2 m) | 6,4 × −20…49 × 143 | 676 | centro da entrega, y = 0 | time 0: (−1110, 0, 0) giro 0; time 1: (1110, 0, 0) giro π |
| `asteroide-1.glb` … `asteroide-4.glb` | Pedaços flutuantes dos campos de asteroides: 1 = pedra de ~8 m, 2 = lasca comprida de ~20 m, 3 = rochedo de ~29 m com veio de He-3, 4 = aglomerado de lascas achatadas com um cristal | 8 / 22 / 29 / 18 m | 80 / 80 / 436 / 349 | **centro do pedaço** (não a base) | espalhar dentro de `ASTEROIDES` (sugestão abaixo) |
| `coral.glb`, `alga.glb`, `cristais-he3.glb` | Decoração do fundo: coral ramificado (~13 m), tufo de algas (fita dos dois lados, ~20 m), aglomerado de cristais de He-3 (~10 m) | — | 720 / 60 / 174 | **base no fundo** | y = `FUNDO_LAGO` − 3 (−63), espalhados (a montagem usou 70) |
| `pedra-lago-1.glb` | Pedra que sobe do fundo e fura a água (topo +1,5 a 2,5 m: espuma em volta, abaixo do voo) | 37 × −64…2,5 × 33 | 174 | centro, y = 0 | pontos livres da região aberta (não na lane) |
| `pedra-lago-2.glb` | Pedra inteira embaixo d'água (topo −22) | 48 × −64…−22 × 42 | 218 | idem | idem |
| `ruina-submersa.glb` | Anel de pilares quebrados no fundo, com cristais no meio (lembrança do templo do Stage 6) | 67 × −63…−29 × 70 | 601 | centro, y = 0 | um ou dois pontos de cada lado (a montagem usou (∓420, ±640)) |

Total: 27 arquivos, ~880 KB (limite do contrato: 6 MB).

### Mineradora (`mineradora.glb`)

Plataforma de extração que **sobe do fundo do lago**. Nós (para o cliente ligar efeitos):
- `mineradora_fundo`: quatro pernas de âncora cravadas no leito, a coluna da broca e o **veio de cristais de He-3** em
  volta (10 aglomerados grandes colados na fundação e 12 espalhados até ~230 m), tudo embaixo d'água, visto pela água;
- `mineradora_casco`: casco blindado na planta, da água (cinta da linha d'água a −17…−7) até 34 m com contrafortes, a
  cornija, o 2º andar recuado 10 m (até 55 m) e o convés recuado 22 m (64 m); **duas docas** nas faces ±x: moldura da boca
  de captação (luzes `neon_doca_N`), plataforma de atracação baixa (topo 1,6 m, sai até x = ±102, setas para a base),
  escoras, e o **pórtico de carga** por cima (vigas de x = ±70 a ±100, a 35–38 m, e o funil em x = ±94 com a boca a 31 m;
  o ponto da doca, `DOCAS` em x = ±84, fica embaixo do pórtico, sobre a plataforma);
- `mineradora_conves`: torre de perfuração treliçada (derrick) de 64 a 128 m, dois tanques esféricos, quatro chaminés e
  casas de máquinas;
- `mineradora_he3`: tudo o que é `neon_he3` (duto que dá a volta no casco a 22 m, janelas do 2º andar, lâminas da boca, o
  **cristal sendo içado** dentro da torre, o farol no alto e os anéis dos tanques e chaminés): pulsar junto, mais forte
  quando um minerador está minerando.

### Portal warp (`base-warp.glb`)

Ilha de rocha flutuante (topo a 86 m) com o anel do portal em pé (centro a 124 m, raio 46, virado para +x),
12 nós de reforço com fendas `neon_time`, 5 aletas em cunha com a luz do time nas quinas, dois mastros; embaixo da ilha,
4 emissores antigravidade, 6 tubos que descem e se juntam numa **ponta de broca** (até 31 m) e duas agulhas penduradas.
Nós: `portal` (anel, nós, aletas), `portal_membrana` (o disco, `portal_time`: animar redemoinho), `ilha`, `pendurados`.
Sugestões: a ilha boiar ±1,5 m bem devagar; um feixe fino da ponta da broca até a água na cor do time.

### Núcleo de He-3 (`nucleo.glb`)

Nós, todos com o **pivô no centro do cristal (0, 18, 0)** para girar no lugar:
- `nucleo_cristal`: cristal bipirâmide de 26 m (7 a 31 m), faces alternando `neon_he3` e `he3_escuro`;
- `nucleo_lascas`: seis lascas em órbita a 8,5–10 m (girar devagar em y);
- `nucleo_anel_1`, `_2`, `_3`: anéis de contenção r 11,5 / 15 / 18,5, inclinados, com faixas e emissores âmbar (girar
  cada um num eixo, mais rápido quando o Núcleo perde vida; parar e cair quando ele morre);
- `nucleo_base` (pivô na origem): prato emissor flutuando logo acima do lago (topo y = 0, abaixo do voo) com o círculo
  âmbar de 22 m (bom lugar para o anel do pulso começar) e o projetor no meio;
- `nucleo_estabilizadores` (pivô na origem): quatro agulhas flutuando a 50 m do centro, de 38 a ~70 m de altura,
  apontando para o cristal (feixes âmbar delas até o cristal ficam bonitos no pulso).

## Campos de asteroides (sugestão de espalhamento)

Por campo (`ASTEROIDES`), ~26 pedaços com semente fixa: tipo 1/2/3/4 com pesos 5/4/1/2, posição dentro de 92% do
retângulo, altura 4–42 m, giro em y ao acaso, inclinação em x até ±0,6 rad, escala 0,7–1,3; girar devagar
(0,02–0,08 rad/s) e boiar ±1 m. Mais denso no miolo que nas beiradas, para o "mato" ler de longe.
