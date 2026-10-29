# Sons do AstroN original

Efeitos sonoros tirados de `old-astron/reference/audio/sfx/` por `tools/sons_do_original.py`: WAV PCM mono, 22 050 Hz, 16 bits (o formato do original), só com o silêncio do fim cortado. Ficaram em WAV porque o ffmpeg da máquina não tem codificador de áudio e WAV decodifica em qualquer navegador. Total: 68 arquivos, ~4,8 MB. O uso de cada som vem do próprio jogo: colunas de som de disparo e de impacto de `inititemweapon.cfg` (armas) e as listas `commonsound.cfg` (sons no mundo, 3D) e `commonsound2d.cfg` (interface). Quem toca é `public/js/sons.js`.

## Disparo das armas

| Arquivo | Duração | Uso no original |
|---|---|---|
| `shot_ray` | 0,47 s | Feixe simples (Bellico Blow Beam, TRifle Rifle Beam, 3way Rifle Beam) |
| `shot_ray3_2`, `shot_ray3_3`, `shot_ray3_4`, `shot_ray3_5` | 0,66–1,55 s | Feixes em série (Array Blow Beam, Clone Array/Sector, CircleBlow); o número sobe com a versão da arma, cada vez mais cheio |
| `shot_ray4` | 0,61 s | Feixe pesado (MagmaStorm, CircleStorm, Force Magma, Clone Storm, LightningStorm) |
| `shot_ray_hm` | 0,88 s | Feixe teleguiado (HomingStorm, Homing Sector Beam) |
| `laser1` | 0,83 s | Feixe perfurante (Piercing Magma/Circle/Array Beam) |
| `shot_30m`, `shot_30m2`, `shot_30m3`, `shot_30m4`, `shot_30m5` | 0,37–0,67 s | Metralhadoras ("Gun": Vulkan, Storm Gun, Spinradius); o número sobe com a variante |
| `shot_cc` | 1,16 s | Canhões (Sector/Array Cannon, canhões de efeito: Freezer, Paralyzing, Energy Discharging) |
| `shot_ct` | 1,36 s | Mísseis (Acceleration, Cruise, Shield Breaking, Lock-Down) |
| `shot_nova` | 2,34 s | Novas (Energy Nova, SpeedTrap Nova, Acceleration Paralysis Nova) |
| `shot_iron` | 0,63 s | Lâmina giratória (Revolving Blade) |
| `shot_fxsph` | 1,22 s | Ondas de choque (Acron Blow Wave, Ph./El. Shock Wave, Energy Spear) |
| `volt` | 0,83 s | Raios elétricos (EnergyBolt Trap, Piercing Spark Bolt, Tracking Bolt; também o impacto deles) |
| `drop2` | 0,85 s | Lançador de cacho (Case Shot Launcher, Cyclone Storm/Wiper) |

## Dispositivos (ativação sem projétil)

| Arquivo | Duração | Uso no original |
|---|---|---|
| `u_mine` | 0,83 s | Larga armadilha/mina (Circle Trap, Storm Trap, Rifle Trap, Magma Trap) |
| `u_up` | 1,71 s | Recuperar escudo (Shield Recovering Device) e novas de carga |
| `u_acc` | 1,72 s | Amplificador / ricochete (Energy Amplifier, Bullet Rebouncing, Shock Converter) |
| `u_decoy` | 1,46 s | Onda de energia (Energy Wave) e balas de cacho |
| `u_remove` | 2,00 s | Novas de suporte (Repair Nova, Trap/Paralysis Removing Nova) |
| `up2` | 0,84 s | Teletransporte (Teleport Device) |
| `hide` | 1,65 s | Camuflagem (Cloak Device) |
| `moojuk` | 2,47 s | Invulnerabilidade ("무적"), Optical Beam Tent, Circuit Breaking, Plasma Field |
| `dt1` | 3,97 s | Aceleração (Acceleration Device, Instant Acceleration) |
| `dt2` | 2,37 s | Lança-chamas de chefe (boss4 Flamethrower) e dos Xerxes (Xerxes e G Xerxes Flamethrower) |
| `npcfire2` | 0,74 s | Feixe óptico de monstro (Optical Beam Launcher do Bazit) |
| `npcfire3` | 1,09 s | Canhão de monstro (Long Range Explosive Gun do Xerxes) |

## Impacto e explosão

| Arquivo | Duração | Uso no original |
|---|---|---|
| `g_impact` | 0,87 s | Impacto de feixe (todas as "Beam") |
| `b_impact` | 0,57 s | Impacto de bala (todas as "Gun") |
| `c_explo` | 2,26 s | Explosão de canhão, míssil e mina |
| `h_explo` | 3,41 s | Explosão grande (lista de sons 3D: nave destruída) |
| `n2_explo` | 0,80 s | Explosão curta (impacto de tiro de NPC) |
| `extra2` | 1,72 s | Impacto de descarga (Energy Discharging, Shield Breaking: tira energia/escudo) |
| `off_device` | 1,51 s | Impacto que desliga sistema (SpeedTrap, Resistance Break, Shock Acceleration) |
| `off_device2` | 1,82 s | Impacto que paralisa (Paralyzing, Lock-Down, Cloak Sensing, Radar Disturbing) |
| `cure` | 1,37 s | Impacto de cura (Repair Druid, Repair Nova) |

## Morte das unidades

Tocados como no original (`CBasePilot::Dead`): o som de morte da unidade (coluna 14 do `initunit.cfg`) quando ela é destruída, e o `h_explo` quando explode (logo, ou quando bate no chão depois de cair). Quem decide qual é `public/js/destruicao.js`.

| Arquivo | Duração | Unidade no original |
|---|---|---|
| `snzerod1` | 3,30 s | SN-Zero, SN-3 e SN-4 ("snzeroD1") |
| `sekisd1` | 1,27 s | Xerxes e Grande Xerxes ("sekisD1") |
| `vajytd1` | 2,86 s | Bazit ("vajytD1") |
| `medusad1` | 4,27 s | Ancient Medusa ("medusaD1") |
| `aflyd1` | 0,57 s | A-Fly, a sonda errante ("AflyD1") |

## Nave

| Arquivo | Duração | Uso |
|---|---|---|
| `hyper` | 3,00 s | Hiperpropulsão (lista 3D; serve para o boost forte ou o salto) |
| `repair` | 2,29 s | Conserto |
| `usehpbattery` | 1,71 s | Usar bateria de HP (Kit de reparo, tecla R) |
| `usehebattery` | 1,46 s | Usar bateria de energia (Célula de energia, tecla F) |
| `level_up` | 1,59 s | Subiu de nível |

## Interface

| Arquivo | Duração | Uso |
|---|---|---|
| `click`, `click2`, `click3`, `click4` | 1,32 s | Cliques de botão (quatro variações quase iguais) |
| `error` | 0,51 s | Ação negada |
| `count` | 0,27 s | Bipe de contagem regressiva |
| `get_item` | 0,59 s | Ganhou item (serve para a compra) |
| `pickitem` | 1,49 s | Pegou item do chão |
| `i_drop` | 0,98 s | Item caiu |
| `w_open`, `w_open2` | 1,00 s, 1,97 s | Janela abrindo (painel) |
| `a_warn`, `b_warn`, `s_warn` | ~3 s | Alerta da base Acron, Bellico, Shrewdo (voz/sirene) |
| `g_warn` | 3,00 s | Alerta geral |
| `st_warn` | 1,05 s | Alerta curto (estado crítico) |
| `sm_warn` | 8,83 s | Alerta longo de missão |

## Nossos: volta à base e teleporte

Não são do original: gerados por `tools/sons_volta.py` (Python puro, `python3 -I tools/sons_volta.py`) em cima da linha do tempo de `public/js/volta-regras.js`, misturando o timbre do original (`extra2`, `u_up`, `up2`, `volt`, lidos daqui) com camadas sintetizadas. WAV PCM mono, **44 100 Hz**, 16 bits. Quem toca é `public/js/efeitos.js` (junto com a animação) e o teleporte em `main.js` (`SONS_VOLTA` em `sons.js`).

| Arquivo | Duração | Uso |
|---|---|---|
| `volta_canal` | 6,40 s | A carga da volta à base (os 6 s de `RECALL_S` e 0,4 s segurando o pico): o zumbido grave sobe uma oitava e abre, pulsa cada vez mais rápido, o zumbido elétrico do original sobe junto e na carga final (5,1 s) entra o riser, sem tilintado por baixo; começa com a carga do original. O jogo toca do ponto do progresso |
| `volta_cancela` | 0,50 s | A carga desligando (o tom caindo como fita parando) quando a volta à base cai |
| `volta_partida` | 0,90 s | A nave sumindo onde estava: estalo, golpe grave caindo, sopro subindo ao céu, o teletransporte do original mais agudo e faíscas; também na saída do teleporte |
| `volta_chegada` | 1,40 s | A nave chegando: o raio descendo até o impacto em 0,125 s (golpe grave, estalo e o estalo elétrico do original) e a materialização, pesada e mecânica: o "vuum" grave assentando, o travamento metálico em 0,45 s (quando o casco aparece), o chiado de plasma esfriando e o zumbido do original abafado se apagando; na volta à base e no teleporte |

Ficaram de fora: as falas dos NPCs da base (`*_buy`, `*_bye`, `*_enter`, `*_lack`, `*_de`, `*_act`, em coreano), os outros sons dos monstros e chefes (`*p1`, os `*d1` de monstros que não estão no jogo, `boss*`), `logo`, `fadein`/`fadeout`, `h_rotate`, `dc1`/`dc2`, `i_munit` e os jingles longos `exwin`/`exlose` (35 s cada, vitória e derrota de fase, não são explosão). A música (`reference/audio/music/*.mp3`, 15 MB) também ficou de fora.
