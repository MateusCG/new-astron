# Modelos do mapa (lago de Hélio-3, Stage 6 no formato do mapa 2D)

Feitos no Blender por script (bpy, procedural), **sem copiar** geometria nem textura do original: o Stage 6 do AstroN
(`old-astron/reference/models_obj/stage 6.obj`, `s6_*`) foi só referência de forma e clima (rocha em estratos, lago
turquesa, warp gate em ilha flutuante com tubos pendurados, cristais azuis no veio). Fontes `.blend` e scripts fora do
repo: `new-astron-progresso/mapa-stage6/blender/` e `.../tmp/cenario/` (`cenario_lib.py` + um script por grupo;
`blender -b --factory-startup --python <script>.py` refaz o `.glb`).

## Padrão de todos

- glTF binário, **Y para cima, 1 unidade = 1 m**, no referencial do jogo (x para a direita do desenho, z para baixo do
  desenho). Pivô na origem do mapa ou do objeto, **y = 0 = chão de voo** (a nave voa a 10 m), salvo nota.
- Dois padrões (IDENTIDADE-VISUAL.md, "Padrão dos modelos"):
  - **mid-poly PBR** (o padrão das peças novas; hoje as três plataformas, a mineradora e as torres): normais e UV, **Draco**, materiais
    `pbr_*` que o cliente liga nas texturas compartilhadas de `public/texturas/mapa/` (o glb não traz imagem),
    sombreado liso com quinas vivas por ângulo. Fontes: `plataformas_pbr.py`, `mineradora_pbr.py`, `torres_pbr.py` e `texturas_pbr.py`;
  - **low-poly facetado** (as peças antigas, até serem refeitas): os arquivos **não trazem normais** de propósito
    (ficam ~4× menores); o `GLTFLoader` liga `flatShading` sozinho quando falta a normal. Sem textura nem UV: cor +
    emissivo.
- Teto de triângulos por tipo de peça (plataformas e torres 15 mil, rochas e bordas 20 mil, decoração 2 mil, qualquer
  peça 50 mil), conferido em `tests/modelos-mapa.test.mjs`.
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
| `campo_doca_0`, `campo_doca_1` | turquesa / vermelho | Campo de força na porta de cada hangar da mineradora (time 0 na face −x): o cliente troca por um material translúcido e aditivo na cor do time dono, relativa a quem olha |
| `neon_he3` | `#9fe8ff` | Hélio-3 (neon, pode "respirar" 0,6–1,2) |
| `he3_escuro` | `#2f7fb8` | Faces escuras dos cristais de He-3 (sem emissivo) |
| `neon_objetivo` | `#ffb627` | Âmbar dos objetivos (núcleo, torre de suporte, plataforma de pouso) |
| `neon_servico` | `#a58bff` (padrão) | Anel das plataformas de serviço: o cliente pinta violeta `#a58bff` na Evolução e magenta `#ff6fd8` na Loja |
| `neon_luz` | `#ffe2b8` | Luz quente fixa (balizas do aro, luzes de aproximação, janelas brancas) |
| `pbr_painel`, `pbr_painel_escuro`, `pbr_painel_claro`, `pbr_painel_grafite` | fator `#e2e8e8`, `#8a9696`, `#f2f6f6`, `#5a6866`; metal 0,3 | Chapa metálica do padrão PBR: o cliente liga o atlas `painel` (cor × fator, metal/rugosidade, relevo). Deque, casco e pilares, aro e torres; na mineradora o grafite é o "metal escuro" (com o atlas dá a cor do `metal_escuro`), o escuro faz o aço e o `pbr_painel` o claro |
| `pbr_tinta` | `#dfe4e1`, rugosidade 0,7 | Sinalização branca (anéis, tracejados, marcas radiais), sem textura |
| `pbr_vidro` | `#0d1416`, rugosidade 0,25 | Visor das torres e miolo dos propulsores |

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
| `mineradora.glb` | **PBR.** **Mineradora de Hélio-3** com um hangar aberto de cada lado (ver abaixo) | 312 × −75…135 × 408 (com as pernas e os cristais do fundo; o casco na linha d'água é 147,6 × 237,6) | 38.233 | centro da mineradora, y = 0 | (0, 0, 0), giro 0. Planta (`MINERADORA` 70 × 115, canto 24): 0,05 a 3,95 m; fora da planta, nada entre 2,5 e 30 m |
| `base-warp.glb` | **Portal warp** da base do time 0 (ver abaixo), virado para +x | 80 × 31…224 × 156 | 3.068 | ponto do `PORTAL_WARP` (local −95, 0 da base), y = 0 | time 0: (−1375, 0, 0) giro 0; time 1: (1375, 0, 0) giro π. Peça mais baixa a 31 m (acima de `PORTAL_WARP.base` = 30): sem colisão |
| `plataforma-base.glb` | **PBR.** Anel de pouso da base: deque flutuante r 70 em chapas, aro de 64 blocos (até 1 m) com faixa `neon_time` e balizas `neon_luz`, 4 torres de controle na borda (até 3,5 m), anel `neon_time` r 64 (quatro arcos) e r 14, o **H** `neon_time` no centro (pernas ao longo de x, lido de quem vem da lane), setas e luzes de aproximação nas diagonais, casco cônico até −10,2 com nervuras, janelas e propulsores, 4 pilares até o fundo | 141 × −62…3,5 × 141 | 14.614 | centro, **topo do deque em y = 0** | (∓1280, 1,7, 0): y = `heightAt + piso` da área de pouso |
| `plataforma-servico.glb` | **PBR.** Plataforma da Evolução e da Loja: deque r 23, aro com faixa `neon_servico`, 3 torres, anel `neon_servico` r 20 e tracejado branco; o **centro fica livre** (o cliente desenha o ícone e o nome do serviço no chão), 3 pilares | 47 × −62…3,5 × 47 | 8.648 | centro, topo em y = 0 | `SERVICOS` com y = piso (1,2) |
| `plataforma-pouso.glb` | **PBR.** Plataforma de pouso do ouro (P0/P1): deque r 32, aro com faixa `neon_objetivo`, 4 torres, anel âmbar r 28 (quatro arcos), quatro setas âmbar para o centro e o nó **`emissor`** no centro (prato com anel âmbar, de onde sai o feixe com alguém pousado), 3 pilares | 65 × −62…3,5 × 65 | 10.812 | centro, topo em y = 0 | P0 (−495, 1, −445,5), P1 (495, 1, 445,5) |
| `nucleo.glb` | **Núcleo de He-3** (ver abaixo) | 138 × −62…71 × 138 | 3.144 | centro do poço, y = 0 | (0, 0, −877). Cristal centrado em y = 18 (a entidade do servidor) |
| `torre-suporte.glb` | **PBR.** Torre do buff de suporte no tamanho da planta (`TORRE_SUPORTE`: r 14, topo 60): fundação octogonal até o leito, colar na linha d'água, cinta da base com escotilhas, fuste sextavado de quinas chanfradas com nervuras, três canais de luz `neon_objetivo` (faces 0°, 120° e 240°), grelhas e dutos nas outras faces, faixas de reforço, capitel com consoles, passarela e balizas `neon_luz`, cone com bobinas, emissor com anel âmbar e a **antena de comunicação**: mastro treliçado de três pernas até 80 m com anel de passarela, painéis setoriais em dois andares e luzes âmbar, e em cima o nó **`suporte_nucleo`** (a cabeça da antena: mesa giratória, prato de 14 m com o alimentador âmbar, contrapeso e a vareta com o farol âmbar até ~92 m, abaixo do rótulo a 96; **pivô no eixo, a 80 m**: o cliente gira com a torre acesa) | 37 × −61…92 × 40 | 7.188 | centro, y = 0 | BS0 (−855, 0, 909), BS1 (855, 0, −909), **escala 1** (`ESCALA_TORRE_SUPORTE`). Planta: 0,4 a 4,0 m entre 3 e 30 m |
| `torre-suporte-caida.glb` | **PBR.** A mesma torre derrubada: a cinta da base e o toco quebrado (borda irregular com rombos, até 4,8 m, sem colisão), chapas tombadas dentro do toco, o capitel partido e um gomo do fuste meio afundados com a faixa âmbar caída (`neon_objetivo`, o cliente apaga) e lascas boiando | 66 × −61…4,8 × 51 | 1.368 | idem | troca com a de pé quando `definirObstaculoAtivo('BS0', false)` |
| `torreta.glb` | **PBR.** Torre sentinela da lane (`TORRETA`: r 9, topo 16), que antes era feita em código: nós `torreta_base` (pilar octogonal até o fundo, cinta na linha d'água, sapata, e o pé de 2,4 m com luzes `neon_time`; sempre de pé), `torreta_corpo` (o que tomba, pivô no chão: torre octogonal com aletas nas quinas e a faixa `neon_time` a 8 m) e, dentro dele, `torreta_cabeca` (**pivô no eixo, a 9 m**, gira em y: carcaça blindada, saias, mantelete, dois canos para **−z** a 10 m com freio de boca `neon_time`, lançadores de fumaça, radar e o sensor `neon_time` no mastro, até 17 m), e `torreta_destrocos` (o toco da torre rasgado sobre o pé, com rombos e aletas tortas, a cabeça partida tombada em cima, um cano torto, lascas e chapas na água, tudo abaixo de 7 m; o cliente só mostra com ela caída e quase apaga o neon) | 31 × −62…17 × 32 | 3.212 | centro, y = 0 | `TORRETAS` (`public/js/torretas.js`), giro 0; o cliente pinta o `neon_time` de cada cópia com a cor do time. Planta: corpo de −1,8 a −0,4 m (a cabeça é mais estreita), ponta do cano a 3,5 m |
| `entrega.glb` | Arco da entrega dos mineradores na boca da base: viga flutuante a 40–49 m com fendas e luminárias `neon_time`, dois pilares flutuantes e duas boias na água (até 2,2 m) | 6,4 × −20…49 × 143 | 676 | centro da entrega, y = 0 | time 0: (−1110, 0, 0) giro 0; time 1: (1110, 0, 0) giro π |
| `coral.glb`, `alga.glb`, `cristais-he3.glb` | Decoração do fundo: coral ramificado (~13 m), tufo de algas (fita dos dois lados, ~20 m), aglomerado de cristais de He-3 (~10 m) | — | 720 / 60 / 174 | **base no fundo** | y = `FUNDO_LAGO` − 3 (−63), espalhados (a montagem usou 70) |
| `pedra-lago-1.glb` | Pedra que sobe do fundo e fura a água (topo +1,5 a 2,5 m: espuma em volta, abaixo do voo) | 37 × −64…2,5 × 33 | 174 | centro, y = 0 | pontos livres da região aberta (não na lane) |
| `pedra-lago-2.glb` | Pedra inteira embaixo d'água (topo −22) | 48 × −64…−22 × 42 | 218 | idem | idem |
| `ruina-submersa.glb` | Anel de pilares quebrados no fundo, com cristais no meio (lembrança do templo do Stage 6) | 67 × −63…−29 × 70 | 601 | centro, y = 0 | um ou dois pontos de cada lado (a montagem usou (∓420, ±640)) |

Total: 24 arquivos, ~1,5 MB, mais ~95 KB das texturas compartilhadas (alvo do padrão PBR: uns 5 MB para o mapa inteiro).

### Mineradora (`mineradora.glb`)

Plataforma de extração que **sobe do fundo do lago**, no padrão mid-poly PBR (`mineradora_pbr.py`): cada face é uma
chapa do atlas `painel` (grafite com uma chapa de aço trocada aqui e ali), o volume na malha (cinta, saliência do duto,
cornijas, contrafortes chanfrados com luz `neon_luz`, guarda-corpos nos tetos dos andares), simétrica pela rotação de
180° como o mapa. Nós (para o cliente ligar efeitos):
- `mineradora_fundo`: quatro pernas de âncora (com colares e sapatas de anel `neon_he3`) cravadas no leito, a coluna da broca e o **veio de cristais de He-3** em
  volta (10 aglomerados grandes colados na fundação e 12 espalhados até ~230 m), tudo embaixo d'água, visto pela água;
- `mineradora_casco`: casco blindado na planta, da água (cinta da linha d'água a −18…−8) até 34 m com contrafortes, a
  cornija, o 2º andar recuado 10 m (até 55 m) e o convés recuado 22 m (64 m), com quatro tubos de subida em cada face ±z;
  **dois hangares** nas faces ±x (`HANGARES` em shared/terrain.js): a porta sempre aberta entre os pilares e a verga
  chanfrados (faixas `neon_doca_N`), do piso (1,52 m, rente ao deque da plataforma) até 20,5 m e de z = −34,1 a 34,1; lá
  dentro (até x = ±12) piso, paredes e teto em chapas, seis pórticos, rodapé, luzes `neon_luz` no teto e nas paredes, as
  duas faixas do minerador pintadas `neon_doca_N` no piso com setas de entrada, a **estação de mineração** na doca
  (`DOCAS` em x = ±38, na faixa de ida, z = ∓15): bacia sobre o piso com aro e moldura pintada, e o anel de carga
  pendurado no teto; no fundo, três condutos e duas grades. Na frente da porta, a plataforma de atracação baixa (topo
  1,6 m, frisos e balizas até 2,5 m, sai até x = ±102, setas `neon_doca_N` para a base, cabeços, flutuadores na linha
  d'água) e o **pórtico de carga** por cima (vigas treliçadas de x = ±70 a ±101, a 35–38 m, com faixa `neon_doca_N` e
  holofotes `neon_luz`, talha e o funil em x = ±94 com a boca a 31 m);
- `mineradora_campo`: o **campo de força** de cada porta, um retângulo em x = ±71,9 com o material `campo_doca_0` /
  `campo_doca_1` (UV de 0 a 1): o cliente troca por um translúcido aditivo na cor do time dono, relativa a quem olha. Só
  o minerador do time atravessa (a física é de shared/obstaculos.js, não do desenho);
- `mineradora_conves`: mesa rotativa, torre de perfuração treliçada (derrick) de 64 a 128 m com piso de grade, coroa e
  moitão, dois tanques esféricos com berço e cintas, quatro chaminés, quatro casas de máquinas e dois mastros de antena;
- `mineradora_he3`: tudo o que é `neon_he3` (duto que dá a volta no casco a 22 m, janelas do 2º andar, a bacia de He-3 com
  cristais e as luzes do anel de carga de cada hangar, as cintas dos condutos do fundo, o
  **cristal sendo içado** dentro da torre, o poço da mesa, o farol no alto e as cintas dos tanques e os anéis das
  chaminés; os cristais do içado usam também `he3_escuro`): pulsar junto, mais forte
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

## Campos que escondem: nuvens de gás, sem modelo

Os campos de `ASTEROIDES` (passáveis, escondem quem está dentro) eram pedaços flutuantes de rocha
(`asteroide-1.glb` … `asteroide-4.glb`); viraram **nuvens de gás e poeira** feitas em código
(`public/js/nuvens.js`: tufos instanciados virados para a câmera, textura gerada na hora). Os quatro `.glb` saíram
da pasta e da tela de carregamento; as fontes `.blend` continuam em `new-astron-progresso/mapa-stage6/blender/`.
