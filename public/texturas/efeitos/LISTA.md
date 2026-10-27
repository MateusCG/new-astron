# Texturas dos efeitos de tiro do AstroN original

Copiadas por `tools/efeitos_do_original.py` (de `old-astron/reference/textures_png`), só as usadas pelos efeitos das armas de jogador e dos monstros da jungle (SN-3 e SN-Zero VI): 213 arquivos, 896 KB. São insumo para `public/js/efeitos.js` (frente Armas); nenhuma está ligada no jogo ainda.

Os efeitos do original são **aditivos** (fundo preto = transparente): use `AdditiveBlending`, como o guia visual já pede para efeito de luz. A cor dominante é a média ponderada pelo brilho.

Funções (coluna de `inititemweapon.cfg`): **clarão do disparo** (50, na boca da arma), **projétil** (56, o tiro em voo), **impacto** (88), **efeito no alvo** (91: paralisia, descarga, lentidão) e **área** (104: armadilhas). Efeito sem textura usa só malha com cor de material ou não achou textura no pacote.

## Por efeito

| Efeito | Função | Texturas | Cor dominante | Armas (versão base) |
|---|---|---|---|---|
| `1121001` | clarão do disparo | `gun_flare_.png` | #edf78c | Shrewdo Storm Gun; Vulkan Blow Gun; Array Spin Gun; Array Thunder Gun; Rifle Thunder Gun; Vulkan Sector Gun (+21) |
| `1131055` | projétil | `1131056.png`, `1131055.png` | #47e742, #497e9f | Homing Clone Missile Lv.1 |
| `1131056` | projétil | `1131056.png`, `propulsion_light.png` | #47e742, #b6f59e | Homing Clone Missile (Acron)P1 |
| `1131256` | projétil | `propulsion_light.png`, `1131056.png` | #b6f59e, #47e742 | Homing Clone Missile (Acron)P2 |
| `1131356` | projétil | `propulsion_light.png`, `1131056.png` | #b6f59e, #47e742 | Homing Clone Missile (Acron)P3 |
| `1132001` | clarão do disparo | `1132001.png` | #ff9ee1 | Sector Storm Cannon; Rifle Storm Cannon; EnergyBolt Trap; Reinforced EnergyBolt Trap; Magma Sector Cannon; Energy Spear (+1) |
| `1133002` | clarão do disparo | `1133002.png` | #9ea4ff | Paralyzing Cannon; Rapid Shield Discharging Cannon; SpeedTrap Cannon; Resistance Break Cannon; Radar Disturbing Cannon; Control Disturbing Cannon (+23) |
| `1133055` | projétil | `1133055.png` | #8beb3f | Cyclone Storm Lv.1; Cyclone Wiper Lv.1 |
| `1150005` | clarão do disparo | `1150005.png` | #ffffff | Energy Field Trap; Homing Trap; Homing Trap (Shrewdo)(warhead); Lock-Down Missile; Striking Power Diminish Missile; Cloak Sensing Cannon (+25) |
| `1162020` | clarão do disparo, projétil | `1162020_01.png` | #f9a2d0 | Bullet Rebouncing Device Lv.1 |
| `1162022` | projétil | `1162022.png`, `1162022_02.png` | #74d871, #78db75 | Ph. Shock Wave; Front Sector Shock Wave |
| `1162023` | projétil | `1162023.png`, `1162023_02.png`, `1162022.png`, `1162022_02.png` | #ed569b, #fb4eac, #74d871, #78db75 | Acron Blow Wave Lv.1 |
| `1162024` | projétil | `1162024.png`, `1162024_02.png`, `1162022.png`, `1162022_02.png` | #498df8, #4d91fb, #74d871, #78db75 | El. Shock Wave |
| `1251010` | projétil | `propulsion04.png`, `1351005_01.png` | #9ef098, #999a6e | Homing Trap (Shrewdo)(warhead) |
| `1251205` | projétil, área | `1251005.png` | #86d64d | Storm Trap; Rifle Trap |
| `1312003` | projétil | `1312001.png` | #f66060 | Array Blow Beam; TRifle Rifle Beam Lv.1 |
| `1312005` | projétil | `1312001.png` | #f66060 | Array Blow Beam V8-S |
| `1312013` | projétil | `1312011.png` | #fe9090 | Force Magma Beam; MagmaStorm Beam |
| `1312023` | projétil | `1312021.png` | #fd8c8c | 3way Rifle Beam; Clone Sector Beam Lv.1; Clone Sector (mainbody); Clone Array Beam; Clone Array (mainbody) |
| `1312033` | projétil | `1312031.png` | #fd7676 | Homing Sector Beam; Homing Sector (Normal Bullet); Homing Sector (Cruise Bullet)2; Array Homing Beam; HomingStorm Beam Lv.1; HomingStorm Reinforced Beam Lv.1 |
| `1312043` | projétil | `1312041.png` | #fda2a2 | Clone Storm Beam; Clone Storm (mainbody)1 |
| `1312053` | projétil | `1312051.png` | #ff6666 | CircleStorm Beam Lv.1; Double Clone Beam; Double Clone Beam (1part) |
| `1312054` | projétil | `1312051.png` | #ff6666 | Double Clone Beam (2part) |
| `1312063` | projétil | `1312051.png` | #ff6666 | Piercing Array Beam; Piercing Magma Beam Lv.I; Piercing Circle Beam; Piercing Rifle |
| `1312073` | projétil | `1312071.png` | #ff6666 | CircleBlow Beam Lv.1; CircleBlow ( Normal Bullet); CircleBlow (Cruise Bullet)2; Bellico Blow Beam |
| `1321003` | projétil | `gun_light.png`, `gun.png` | #b6f59e, #9b9c74 | Shrewdo Storm Gun; Critic Blow Gun |
| `1321013` | projétil | `1321011_01.png`, `1321011_02.png` | #a1c48f, #00bc00 | Magma Rifle Gun; Acron Vulkan Gun Lv.1; WideStorm Gun Lv.1; Bellico Vulkan Gun |
| `1321023` | projétil | `1321021_01.png`, `1321021_02.png` | #c7b9a8, #4ecf4e | Array Spin Gun; Spinradius Gun Lv.1 |
| `1321025` | projétil | `1321021_01.png`, `1321021_02.png` | #c7b9a8, #4ecf4e | Spinradius Gun Lv.8-S |
| `1321033` | projétil | `gun.png`, `gun_light.png` | #9b9c74, #b6f59e | Homing Sector Gun Lv.1; HomingVulkan Gun; HomingVulkanStorm Gun |
| `1321063` | projétil | `1321011_01.png`, `1321061_02.png` | #a1c48f, #07bc07 | Array Thunder Gun; Rifle Thunder Gun; ShrewdoBlow Rifle |
| `1321073` | projétil | `1321011_01.png`, `1321011_02.png` | #a1c48f, #00bc00 | Vulkan Sector Gun; VulkanStorm Gun |
| `1321075` | projétil | `1321011_01.png`, `1321011_02.png` | #a1c48f, #00bc00 | VulkanStorm Gun VIII-S |
| `1321241` | projétil | `gun.png`, `gun_light.png`, `1321041.png` | #9b9c74, #b6f59e, #2cb52b | Front Storm Bomber Lv.1; Piercing Vulkan Gun |
| `1321251` | projétil | `gun.png`, `1321051_light.png` | #9b9c74, #b6f59e | Vulkan Blow Gun |
| `1331015` | projétil | `1331015.png` | #55ff00 | Case Shot Launcher |
| `1332003` | projétil | `charge_vox00.png`, `charge_vox01.png`, `charge_vox02.png`, `charge_vox03.png`, `charge_vox04.png` (+10 quadros) | #e64adc, #e54dd7, #e951d7, #e551d2 | Sector Storm Cannon; Rifle Storm Cannon; Array Cannon |
| `1332004` | projétil | `charge_vox00.png`, `charge_vox01.png`, `charge_vox02.png`, `charge_vox03.png`, `charge_vox04.png` (+10 quadros) | #e64adc, #e54dd7, #e951d7, #e551d2 | sn Cannon6 (NPC) |
| `1332008` | projétil | `charge_vox14.png`, `charge_vox00.png`, `charge_vox01.png`, `charge_vox02.png`, `charge_vox03.png` (+10 quadros) | #f55edb, #e64adc, #e54dd7, #e951d7 | Magma Sector Cannon |
| `1332025` | projétil | `1332023.png` | #f612c7 | Energy Spear |
| `1332034` | projétil | `1332034.png` | #ff53e1 | Energy Wave Lv.1; Wide Energy Wave Lv.1 |
| `1333002` | projétil | `1333002_00.png`, `1333002_001.png`, `1333002_002.png`, `1333002_003.png`, `icon_cross02.png` (+11 quadros) | #81bcbd, #a49ee8, #b3aeed, #aba5ea | SpeedTrap Cannon; Control Disturbing Cannon; Freezer Cannon Lv.1 |
| `1333003` | projétil | `1333002_00.png`, `1333002_001.png`, `1333002_002.png`, `1333002_003.png`, `icon_cross03.png` (+11 quadros) | #81bcbd, #a49ee8, #b3aeed, #aba5ea | Rapid Shield Discharging Cannon |
| `1333004` | projétil | `1333002_00.png`, `1333002_001.png`, `1333002_002.png`, `1333002_003.png`, `icon_cross04.png` (+11 quadros) | #81bcbd, #a49ee8, #b3aeed, #aba5ea | Paralyzing Cannon; Recoil Shock Boostergun Lv.1; Volley Disabling Cannon; Energy Consumer Cannon |
| `1333005` | projétil | `1333002_00.png`, `1333002_001.png`, `1333002_002.png`, `1333002_003.png`, `icon_cross01.png` (+11 quadros) | #81bcbd, #a49ee8, #b3aeed, #aba5ea | Resistance Break Cannon; Optical Beam Amplifier Cannon Lv.1; Shock Acceleration Cannon |
| `1333006` | projétil | `1353011_01.png`, `1353011_001.png`, `icon_r.png`, `1353011_02.png`, `1353011_03.png` (+3 quadros) | #4d92ed, #7179b6, #ffffff, #5599f1 | Radar Disturbing Cannon |
| `1333008` | projétil | `1353011_01.png`, `1353011_001.png`, `icon_e.png`, `1353011_02.png`, `1353011_03.png` (+3 quadros) | #4d92ed, #7179b6, #ffffff, #5599f1 | Energy Discharging Cannon Lv.1; Energy Reducing Cannon |
| `1333009` | projétil | `1353011_01.png`, `1353011_001.png`, `icon_s.png`, `1353011_02.png`, `1353011_03.png` (+3 quadros) | #4d92ed, #7179b6, #ffffff, #5599f1 | Cloak Sensing Cannon |
| `1333014` | projétil, área | `1333014.png`, `1333014_01.png` | #ea00ff, #f46bdc | EnergyBolt Trap; EnergyBolt (Shrewdo); Reinforced EnergyBolt Trap; kkkEnergyBolt; K EnergyBolt |
| `1333017` | projétil, área | `1333014.png`, `1333014_01.png` | #ea00ff, #f46bdc | EnergyBolt (Shrewdo) |
| `1335003` | projétil | `charge_vox14.png`, `charge_vox00.png`, `charge_vox01.png`, `charge_vox02.png`, `charge_vox03.png` (+10 quadros) | #f55edb, #e64adc, #e54dd7, #e951d7 | El. Bomber Lv.1; Wide Spark Cannon Lv.1; El. Trap Lv.1 |
| `1336014` | projétil | `1333014.png`, `1333014_01.png` | #ea00ff, #f46bdc | Tracking Bolt; Piercing Spark Bolt |
| `1351007` | projétil | `propulsion04.png`, `1351005_01.png` | #9ef098, #999a6e | Homing Trap |
| `1352004` | projétil | `1352004.png`, `1352004_0050.png`, `1352004_0051.png`, `1352004_0052.png`, `1352004_0053.png` (+6 quadros) | #ff00cc, #df5cc8, #df5dc8, #e162cb | Energy Field Trap; Shrewdo Energy Field Trap Lv.1; Shrewdo Energy Field Trap |
| `1352005` | projétil | `1352005.png`, `1352004_0050.png`, `1352004_0051.png`, `1352004_0052.png`, `1352004_0053.png` (+6 quadros) | #00ff33, #df5cc8, #df5dc8, #e162cb | Acron Suppress Trap; Suppress Trap Lv.1 |
| `1353019` | projétil | `1353019.png`, `1353019_01.png` | #4a56af, #86c5f9 | Repair Druid |
| `1353021` | projétil | `1353021_01.png`, `1353021_02.png` | #326cff, #5283ff | Trap Removing Nova; Trap Removing Nova Lv.1 |
| `1355004` | projétil | `1355004_01.png` | #f94440 | Magma Trap |
| `1361031` | projétil | `1361029.png` | #75d52a | Reinforced Revolving Blade Lv.1; Revolving Blade Lv.1; snThr Flying Disk(NPC) |
| `1361059` | projétil | `1361057_02.png`, `1361057_01.png` | #f888dc, #b65bb1 | Circle Trap Lv.1; Circle Trap (warhead) |
| `1401007` | impacto | `1401007_01.png`, `1401007_02.png`, `1401007_03.png`, `1401007_04.png`, `1401007_05.png` (+11 quadros) | #c2cad8, #dfe3ea, #e1e4ec, #dfe3eb | Homing Trap; Homing Clone Missile (Acron)P1; Rifle Trap |
| `1401107` | impacto | `1401007_01.png`, `1401007_02.png`, `1401007_03.png`, `1401007_04.png`, `1401007_05.png` (+11 quadros) | #c2cad8, #dfe3ea, #e1e4ec, #dfe3eb | Homing Trap (Shrewdo)(warhead); Homing Spin Missile; Homing Spin Missile T2; Homing Clone Missile Lv.1; Homing Clone Missile (Acron)P2; Reinforced Revolving Blade Lv.1 (+6) |
| `1401207` | impacto | `1401007_01.png`, `1401007_02.png`, `1401007_03.png`, `1401007_04.png`, `1401007_05.png` (+11 quadros) | #c2cad8, #dfe3ea, #e1e4ec, #dfe3eb | Homing Clone Missile (Acron)P3 |
| `1401307` | impacto | `1401007_01.png`, `1401007_02.png`, `1401007_03.png`, `1401007_04.png`, `1401007_05.png` (+11 quadros) | #c2cad8, #dfe3ea, #e1e4ec, #dfe3eb | snThr Flying Disk(NPC) |
| `1412001` | impacto | `1412001.png`, `1412001_01.png` | #ef42a9, #eb2082 | Array Blow Beam; Piercing Array Beam; Clone Storm Beam; Clone Storm (mainbody)1; Force Magma Beam; 3way Rifle Beam (+24) |
| `1412002` | efeito no alvo | `1412002.png` | #f47ab1 | Clone Storm Beam; Clone Storm (mainbody)1; CircleStorm Beam Lv.1; CircleBlow Beam Lv.1; HomingStorm Beam Lv.1; HomingStorm Reinforced Beam Lv.1 (+1) |
| `1412023` | projétil | `1412021.png` | #8ca4fe | Bolt Storm Beam Lv.1 |
| `1412043` | projétil | `1412041.png` | #8cbdfd | LightningStorm Rifle Lv.1 |
| `1413003` | projétil | `1413001.png` | #8260f7 | Array Bolt Beam |
| `1421001` | impacto | `1150005.png`, `1421001_01.png` | #ffffff, #6bba6b | Shrewdo Storm Gun; Vulkan Blow Gun; Array Spin Gun; Array Thunder Gun; Rifle Thunder Gun; Vulkan Sector Gun (+25) |
| `1421002` | efeito no alvo | `1421002.png` | #5de739 | Shrewdo Storm Gun; WideStorm Gun Lv.1; Spinradius Gun Lv.1; Front Storm Bomber Lv.1; Spinradius Gun Lv.8-S; VulkanStorm Gun (+3) |
| `1500001` | projétil | `1500001.png` | #4384fa | Acron Commandship Wave Cannon |
| `1500002` | projétil | `1500002.png` | #fa4343 | Bellico Commandship Wave Cannon |
| `1500003` | projétil | `1500003.png` | #43fa46 | Shrewdo Commandship Wave Cannon |
| `1502004` | impacto | `1502004.png` | #c91864 | Sector Storm Cannon; Rifle Storm Cannon; EnergyBolt Trap; EnergyBolt (Shrewdo); Reinforced EnergyBolt Trap; kkkEnergyBolt (+15) |
| `1503009` | impacto | `1503009.png` | #2b4d97 | Paralyzing Cannon; Rapid Shield Discharging Cannon; SpeedTrap Cannon; Lock-Down Missile; Resistance Break Cannon; Striking Power Diminish Missile (+32) |
| `1503010` | impacto, projétil | `1503010.png` | #ffffff | Paralysis Removing Nova; Paralysis Removing Nova Lv.1; Energy Distribution Nova Lv.1; Paralysis Removing Cannon |
| `1503011` | impacto | `1503010.png` | #ffffff | Repair Druid; Repair Nova Lv.1 |
| `1503012` | impacto | `1503010.png` | #ffffff | Shield Recharging Nova |
| `2112001` | clarão do disparo | `0112001.png` | #edaebb | Array Blow Beam; Piercing Array Beam; Clone Storm Beam; Force Magma Beam; 3way Rifle Beam; Homing Sector Beam (+16) |
| `2132017` | projétil | `2132017.png` | #ff53e3 | Energy Nova Lv.1 |
| `2132018` | projétil | `2132017.png` | #ff53e3 | Cyclone Storm Bullet; Cyclone Wiper Bullet |
| `2132051` | projétil | `2132051.png` | #477df2 | Piercing Spark Beam |
| `2142018` | projétil | `2132017.png` | #ff53e3 | Wide Spark Explosive Bullet; El. Charge Nova Lv.1 |
| `2163010` | projétil | `2163010.png`, `2163010_cross.png` | #f5737f, #ff462c | Repair Nova Lv.1 |
| `2163011` | projétil | `2163011.png`, `2163011_0001.png`, `2163011_0100.png`, `2163011_0101.png`, `2163011_0102.png` (+18 quadros) | #88a8df, #4f48ce, #e1e1e1, #e2e2e2 | Cloak Sensing Nova Lv.1 |
| `2163022` | efeito no alvo, projétil | `2163022.png`, `2163022_cross.png` | #2854ff, #2c2fff | Paralysis Removing Nova; Paralysis Removing Nova Lv.1; Paralysis Removing Cannon |
| `2164011` | projétil | `2164011.png`, `2164011_cross.png` | #f5eb7f, #fffc2c | Shield Recharging Nova |
| `2164012` | projétil | `2163011.png`, `2163022_cross.png` | #88a8df, #2c2fff | Energy Distribution Nova Lv.1 |
| `2165012` | projétil | `2163011.png`, `2163011_0001.png`, `2163011_0100.png`, `2163011_0101.png`, `2163011_0102.png` (+18 quadros) | #88a8df, #4f48ce, #e1e1e1, #e2e2e2 | SpeedTrap Nova Lv.1; Acceleration Paralysis Nova |
| `2252007` | projétil | `2252007.png` | #9e1466 | Sn6Trap (NPC) |
| `2252010` | projétil, área | `1352004.png`, `1352004_0050.png`, `icon_e.png`, `1352004_0051.png`, `1352004_0052.png` (+7 quadros) | #ff00cc, #df5cc8, #ffffff, #df5dc8 | Magnetic Field Trap |
| `2253006` | projétil, área | `1352005.png`, `1352004_0050.png`, `1352004_0051.png`, `1352004_0052.png`, `1352004_0053.png` (+6 quadros) | #00ff33, #df5cc8, #df5dc8, #e162cb | Suppress Trap Bullet |
| `2253007` | projétil, área | `1355004_01.png` | #f94440 | Magma Trap Bullet |
| `2341022` | projétil | `missile.png`, `gun_flare_.png`, `2343007_01.png` | #c8c8a0, #edf78c, #c1ef8f | Homing Spin Missile; Homing Spin Missile T2; Array Acceleration Missile; Piercing Sector Missile |
| `2343007` | projétil | `missile.png`, `missile_light.png`, `icon_cross02.png`, `2343007_01.png` | #c8c8a0, #a9bfe8, #ffffff, #c1ef8f | Paralyzing Stormmissile Lv.1 |
| `2343008` | projétil | `missile.png`, `missile_light.png`, `icon_cross03.png` | #c8c8a0, #a9bfe8, #ffffff | Shield Breaking Missile |
| `2343009` | projétil | `missile.png`, `missile_light.png`, `icon_cross04.png` | #c8c8a0, #a9bfe8, #ffffff | Striking Power Diminish Missile |
| `2343011` | projétil | `missile.png`, `missile_light.png`, `icon_ld.png` | #c8c8a0, #a9bfe8, #ffffff | Lock-Down Missile |
| `2343012` | projétil | `missile.png`, `missile_light.png`, `icon_e.png` | #c8c8a0, #a9bfe8, #ffffff | Double Discharging Missile; Energy Absorbing Missile Lv.1; snThr Energy Discharging Missile(NPC) |
| `2403002` | efeito no alvo | `2403002_0050.png`, `2403002_01.png`, `icon_cross02.png`, `2403002_0051.png`, `2403002_0052.png` (+18 quadros) | #5775cf, #7878d3, #ffffff, #5674ce | SpeedTrap Cannon; Control Disturbing Cannon; Paralyzing Stormmissile Lv.1 |
| `2403003` | efeito no alvo | `2403002_0050.png`, `2403002_01.png`, `icon_cross03.png`, `2403002_0051.png`, `2403002_0052.png` (+18 quadros) | #5775cf, #7878d3, #ffffff, #5674ce | Rapid Shield Discharging Cannon; Freezer Cannon Lv.1 |
| `2403004` | efeito no alvo | `2403002_0050.png`, `2403002_01.png`, `icon_cross04.png`, `2403002_0051.png`, `2403002_0052.png` (+18 quadros) | #5775cf, #7878d3, #ffffff, #5674ce | Paralyzing Cannon; Recoil Shock Boostergun Lv.1; Volley Disabling Cannon |
| `2403005` | efeito no alvo | `2403002_0050.png`, `2403002_01.png`, `icon_cross01.png`, `2403002_0051.png`, `2403002_0052.png` (+18 quadros) | #5775cf, #7878d3, #ffffff, #5674ce | Resistance Break Cannon; Optical Beam Amplifier Cannon Lv.1; Shock Acceleration Cannon |
| `2403006` | efeito no alvo | `2403002_0050.png`, `2403002_01.png`, `icon_r.png`, `2403002_0051.png`, `2403002_0052.png` (+18 quadros) | #5775cf, #7878d3, #ffffff, #5674ce | Radar Disturbing Cannon |
| `2403008` | efeito no alvo | `2403002_0050.png`, `2403002_01.png`, `icon_e.png`, `2403002_0051.png`, `2403002_0052.png` (+18 quadros) | #5775cf, #7878d3, #ffffff, #5674ce | Energy Discharging Cannon Lv.1; Energy Reducing Cannon; Energy Consumer Cannon |
| `2403009` | efeito no alvo | `2403002_0050.png`, `2403002_01.png`, `icon_s.png`, `2403002_0051.png`, `2403002_0052.png` (+18 quadros) | #5775cf, #7878d3, #ffffff, #5674ce | Cloak Sensing Cannon |
| `2432000` | efeito no alvo | `2403002_0050.png`, `2403002_01.png`, `2432001_0050.png`, `2432001_0051.png`, `2432001_0052.png` (+18 quadros) | #5775cf, #7878d3, #b938b9, #bc3abc | Tracking Bolt; El. Bomber Lv.1; LightningStorm Rifle Lv.1; El. Trap Lv.1; Bolt Storm Beam Lv.1; Acron Commandship Wave Cannon (+1) |
| `2432001` | efeito no alvo | `2403002_0050.png`, `2403002_01.png`, `2432001_0050.png`, `2432001_0051.png`, `2432001_0052.png` (+18 quadros) | #5775cf, #7878d3, #b938b9, #bc3abc | Sector Storm Cannon; Rifle Storm Cannon; EnergyBolt (Shrewdo); kkkEnergyBolt; K EnergyBolt; Magma Sector Cannon (+3) |
| `2432002` | efeito no alvo | `2403002_0050.png`, `2403002_01.png`, `2432001_0050.png`, `2432001_0051.png`, `2432001_0052.png` (+18 quadros) | #5775cf, #7878d3, #b938b9, #bc3abc | Shrewdo Commandship Wave Cannon |
| `2443007` | projétil | `missile.png`, `missile_light.png` | #c8c8a0, #a9bfe8 | ChargeBolt Missile; Shock Bolt Missile |
| `2541022` | projétil | `missile.png`, `gun_flare_.png`, `2343007_01.png` | #c8c8a0, #edf78c, #c1ef8f | Cruise Missile |

## Por textura

| Arquivo | Tamanho | Cor dominante |
|---|---|---|
| `0112001.png` | 64×64 px, 4.2 KB | #edaebb |
| `1131055.png` | 128×128 px, 6.4 KB | #497e9f |
| `1131056.png` | 64×64 px, 2.4 KB | #47e742 |
| `1132001.png` | 64×64 px, 1.3 KB | #ff9ee1 |
| `1133002.png` | 64×64 px, 3.8 KB | #9ea4ff |
| `1133055.png` | 64×64 px, 1.8 KB | #8beb3f |
| `1150005.png` | 64×64 px, 2.0 KB | #ffffff |
| `1162020_01.png` | 128×128 px, 5.4 KB | #f9a2d0 |
| `1162022.png` | 128×128 px, 10.2 KB | #74d871 |
| `1162022_02.png` | 128×128 px, 9.6 KB | #78db75 |
| `1162023.png` | 128×128 px, 9.4 KB | #ed569b |
| `1162023_02.png` | 128×128 px, 9.2 KB | #fb4eac |
| `1162024.png` | 128×128 px, 9.7 KB | #498df8 |
| `1162024_02.png` | 128×128 px, 9.1 KB | #4d91fb |
| `1251005.png` | 128×128 px, 3.7 KB | #86d64d |
| `1312001.png` | 64×64 px, 1.3 KB | #f66060 |
| `1312011.png` | 64×64 px, 1.9 KB | #fe9090 |
| `1312021.png` | 64×64 px, 2.2 KB | #fd8c8c |
| `1312031.png` | 64×64 px, 3.5 KB | #fd7676 |
| `1312041.png` | 64×64 px, 2.4 KB | #fda2a2 |
| `1312051.png` | 64×64 px, 2.1 KB | #ff6666 |
| `1312071.png` | 64×64 px, 1.4 KB | #ff6666 |
| `1321011_01.png` | 64×64 px, 1.9 KB | #a1c48f |
| `1321011_02.png` | 64×64 px, 0.5 KB | #00bc00 |
| `1321021_01.png` | 64×64 px, 1.1 KB | #c7b9a8 |
| `1321021_02.png` | 64×64 px, 1.9 KB | #4ecf4e |
| `1321041.png` | 32×32 px, 0.5 KB | #2cb52b |
| `1321051_light.png` | 64×64 px, 1.6 KB | #b6f59e |
| `1321061_02.png` | 64×64 px, 0.6 KB | #07bc07 |
| `1331015.png` | 64×64 px, 0.6 KB | #55ff00 |
| `1332023.png` | 64×64 px, 0.8 KB | #f612c7 |
| `1332034.png` | 128×128 px, 3.3 KB | #ff53e1 |
| `1333002_00.png` | 64×64 px, 1.3 KB | #81bcbd |
| `1333002_001.png` | 128×128 px, 4.6 KB | #a49ee8 |
| `1333002_002.png` | 128×128 px, 5.8 KB | #b3aeed |
| `1333002_003.png` | 128×128 px, 5.6 KB | #aba5ea |
| `1333002_01.png` | 64×64 px, 1.2 KB | #8ac5c6 |
| `1333002_02.png` | 64×64 px, 1.1 KB | #92c9cc |
| `1333002_03.png` | 64×64 px, 1.4 KB | #95cdd1 |
| `1333002_04.png` | 64×64 px, 1.6 KB | #9cd4d4 |
| `1333002_05.png` | 64×64 px, 1.7 KB | #97dcd8 |
| `1333002_06.png` | 64×64 px, 2.3 KB | #8cdedc |
| `1333002_07.png` | 64×64 px, 2.5 KB | #85d8d9 |
| `1333002_08.png` | 64×64 px, 3.0 KB | #81d3d5 |
| `1333002_09.png` | 64×64 px, 3.0 KB | #6ec8d6 |
| `1333002_10.png` | 64×64 px, 3.2 KB | #53d0e4 |
| `1333002_11.png` | 64×64 px, 3.3 KB | #40cae3 |
| `1333014.png` | 64×64 px, 0.8 KB | #ea00ff |
| `1333014_01.png` | 128×128 px, 4.3 KB | #f46bdc |
| `1351005_01.png` | 64×64 px, 4.4 KB | #999a6e |
| `1352004.png` | 64×64 px, 0.8 KB | #ff00cc |
| `1352004_0050.png` | 128×128 px, 6.4 KB | #df5cc8 |
| `1352004_0051.png` | 128×128 px, 6.7 KB | #df5dc8 |
| `1352004_0052.png` | 128×128 px, 7.1 KB | #e162cb |
| `1352004_0053.png` | 128×128 px, 7.3 KB | #e267cc |
| `1352004_0054.png` | 128×128 px, 7.4 KB | #e05fca |
| `1352004_0055.png` | 128×128 px, 6.9 KB | #de56c6 |
| `1352004_0056.png` | 128×128 px, 6.9 KB | #de57c7 |
| `1352004_0057.png` | 128×128 px, 6.5 KB | #de56c6 |
| `1352004_0058.png` | 128×128 px, 6.8 KB | #dd56c6 |
| `1352004_0059.png` | 128×128 px, 6.5 KB | #de55c6 |
| `1352005.png` | 64×64 px, 0.4 KB | #00ff33 |
| `1353011_001.png` | 64×64 px, 1.8 KB | #7179b6 |
| `1353011_01.png` | 64×64 px, 2.2 KB | #4d92ed |
| `1353011_02.png` | 64×64 px, 2.8 KB | #5599f1 |
| `1353011_03.png` | 64×64 px, 3.2 KB | #6faaf7 |
| `1353011_04.png` | 64×64 px, 3.2 KB | #6faaf7 |
| `1353011_05.png` | 64×64 px, 2.8 KB | #5599f1 |
| `1353011_06.png` | 64×64 px, 2.2 KB | #4d92ed |
| `1353019.png` | 64×64 px, 1.3 KB | #4a56af |
| `1353019_01.png` | 64×64 px, 3.6 KB | #86c5f9 |
| `1353021_01.png` | 64×64 px, 0.4 KB | #326cff |
| `1353021_02.png` | 64×64 px, 2.0 KB | #5283ff |
| `1355004_01.png` | 64×64 px, 0.7 KB | #f94440 |
| `1361029.png` | 64×64 px, 3.2 KB | #75d52a |
| `1361057_01.png` | 64×64 px, 1.5 KB | #b65bb1 |
| `1361057_02.png` | 64×64 px, 3.6 KB | #f888dc |
| `1401007_01.png` | 32×32 px, 0.3 KB | #c2cad8 |
| `1401007_02.png` | 32×32 px, 0.6 KB | #dfe3ea |
| `1401007_03.png` | 32×32 px, 0.9 KB | #e1e4ec |
| `1401007_04.png` | 32×32 px, 1.0 KB | #dfe3eb |
| `1401007_05.png` | 32×32 px, 1.1 KB | #d6dce5 |
| `1401007_06.png` | 32×32 px, 1.2 KB | #ced5e0 |
| `1401007_07.png` | 32×32 px, 1.3 KB | #c9d0dd |
| `1401007_08.png` | 32×32 px, 1.3 KB | #c9d0de |
| `1401007_09.png` | 32×32 px, 1.4 KB | #c7cedc |
| `1401007_10.png` | 32×32 px, 1.2 KB | #bdc6d7 |
| `1401007_11.png` | 32×32 px, 1.3 KB | #a9b4c9 |
| `1401007_12.png` | 32×32 px, 1.2 KB | #8897b4 |
| `1401007_13.png` | 32×32 px, 1.1 KB | #667798 |
| `1401007_14.png` | 32×32 px, 1.1 KB | #536484 |
| `1401007_15.png` | 32×32 px, 0.9 KB | #3a4760 |
| `1401007_16.png` | 32×32 px, 0.6 KB | #212936 |
| `1412001.png` | 64×64 px, 2.6 KB | #ef42a9 |
| `1412001_01.png` | 128×128 px, 6.5 KB | #eb2082 |
| `1412002.png` | 128×128 px, 12.7 KB | #f47ab1 |
| `1412021.png` | 64×64 px, 2.2 KB | #8ca4fe |
| `1412041.png` | 64×64 px, 2.6 KB | #8cbdfd |
| `1413001.png` | 64×64 px, 1.2 KB | #8260f7 |
| `1421001_01.png` | 64×64 px, 1.7 KB | #6bba6b |
| `1421002.png` | 64×64 px, 2.7 KB | #5de739 |
| `1500001.png` | 128×128 px, 5.6 KB | #4384fa |
| `1500002.png` | 128×128 px, 3.9 KB | #fa4343 |
| `1500003.png` | 128×128 px, 4.8 KB | #43fa46 |
| `1502004.png` | 64×64 px, 4.1 KB | #c91864 |
| `1503009.png` | 64×64 px, 4.0 KB | #2b4d97 |
| `1503010.png` | 128×128 px, 2.1 KB | #ffffff |
| `2132017.png` | 128×128 px, 8.7 KB | #ff53e3 |
| `2132051.png` | 64×64 px, 0.5 KB | #477df2 |
| `2163010.png` | 128×128 px, 9.7 KB | #f5737f |
| `2163010_cross.png` | 128×128 px, 2.2 KB | #ff462c |
| `2163011.png` | 128×128 px, 9.1 KB | #88a8df |
| `2163011_0001.png` | 128×128 px, 6.6 KB | #4f48ce |
| `2163011_0100.png` | 128×128 px, 4.2 KB | #e1e1e1 |
| `2163011_0101.png` | 128×128 px, 4.2 KB | #e2e2e2 |
| `2163011_0102.png` | 128×128 px, 4.2 KB | #e0e0e0 |
| `2163011_0103.png` | 128×128 px, 4.1 KB | #e1e1e1 |
| `2163011_0104.png` | 128×128 px, 4.4 KB | #dfdfdf |
| `2163011_0105.png` | 128×128 px, 4.1 KB | #e0e0e0 |
| `2163011_0106.png` | 128×128 px, 4.1 KB | #e0e0e0 |
| `2163011_0107.png` | 128×128 px, 4.1 KB | #e0e0e0 |
| `2163011_0108.png` | 128×128 px, 4.2 KB | #e1e1e1 |
| `2163011_0109.png` | 128×128 px, 4.2 KB | #e2e2e2 |
| `2163011_0110.png` | 128×128 px, 4.2 KB | #e1e1e1 |
| `2163011_0111.png` | 128×128 px, 4.2 KB | #e1e1e1 |
| `2163011_0112.png` | 128×128 px, 3.9 KB | #dfdfdf |
| `2163011_0113.png` | 128×128 px, 4.0 KB | #e1e1e1 |
| `2163011_0114.png` | 128×128 px, 4.1 KB | #e1e1e1 |
| `2163011_0115.png` | 128×128 px, 4.0 KB | #e1e1e1 |
| `2163011_0116.png` | 128×128 px, 4.1 KB | #e0e0e0 |
| `2163011_0117.png` | 128×128 px, 4.3 KB | #e1e1e1 |
| `2163011_0118.png` | 128×128 px, 4.0 KB | #e1e1e1 |
| `2163011_0119.png` | 128×128 px, 4.5 KB | #e1e1e1 |
| `2163011_0120.png` | 128×128 px, 4.2 KB | #e0e0e0 |
| `2163022.png` | 128×128 px, 10.4 KB | #2854ff |
| `2163022_cross.png` | 128×128 px, 2.0 KB | #2c2fff |
| `2164011.png` | 128×128 px, 10.2 KB | #f5eb7f |
| `2164011_cross.png` | 128×128 px, 1.8 KB | #fffc2c |
| `2252007.png` | 128×128 px, 5.6 KB | #9e1466 |
| `2343007_01.png` | 64×64 px, 3.5 KB | #c1ef8f |
| `2403002_0050.png` | 128×128 px, 5.4 KB | #5775cf |
| `2403002_0051.png` | 128×128 px, 5.4 KB | #5674ce |
| `2403002_0052.png` | 128×128 px, 5.5 KB | #5372cd |
| `2403002_0053.png` | 128×128 px, 5.2 KB | #5473cd |
| `2403002_0054.png` | 128×128 px, 5.2 KB | #4e6ecb |
| `2403002_0055.png` | 128×128 px, 5.2 KB | #4c6bc9 |
| `2403002_0056.png` | 128×128 px, 5.1 KB | #496ac9 |
| `2403002_0057.png` | 128×128 px, 5.3 KB | #4e6dca |
| `2403002_0058.png` | 128×128 px, 5.2 KB | #4c6cc9 |
| `2403002_0059.png` | 128×128 px, 5.5 KB | #4f6ec9 |
| `2403002_0060.png` | 128×128 px, 5.4 KB | #4d6dc9 |
| `2403002_0061.png` | 128×128 px, 5.3 KB | #5170cb |
| `2403002_0062.png` | 128×128 px, 5.5 KB | #4d6dca |
| `2403002_0063.png` | 128×128 px, 5.4 KB | #4f6fcb |
| `2403002_0064.png` | 128×128 px, 5.3 KB | #4e6dca |
| `2403002_0065.png` | 128×128 px, 5.2 KB | #4f6fcb |
| `2403002_0066.png` | 128×128 px, 5.2 KB | #4e6ecb |
| `2403002_0067.png` | 128×128 px, 4.9 KB | #4f6fcb |
| `2403002_0068.png` | 128×128 px, 5.0 KB | #5372cc |
| `2403002_0069.png` | 128×128 px, 5.1 KB | #5271cd |
| `2403002_0070.png` | 128×128 px, 5.2 KB | #5574ce |
| `2403002_01.png` | 128×128 px, 4.3 KB | #7878d3 |
| `2432001_0050.png` | 128×128 px, 10.0 KB | #b938b9 |
| `2432001_0051.png` | 128×128 px, 10.2 KB | #bc3abc |
| `2432001_0052.png` | 128×128 px, 10.7 KB | #bd3bbd |
| `2432001_0053.png` | 128×128 px, 10.5 KB | #be3cbe |
| `2432001_0054.png` | 128×128 px, 9.8 KB | #bd3abd |
| `2432001_0055.png` | 128×128 px, 10.1 KB | #b934b9 |
| `2432001_0056.png` | 128×128 px, 11.5 KB | #b734b7 |
| `2432001_0057.png` | 128×128 px, 11.1 KB | #b834b8 |
| `2432001_0058.png` | 128×128 px, 9.7 KB | #ba35ba |
| `2432001_0059.png` | 128×128 px, 10.8 KB | #bd3abd |
| `2432001_0060.png` | 128×128 px, 10.0 KB | #b936b9 |
| `2432001_0061.png` | 128×128 px, 10.8 KB | #b633b6 |
| `2432001_0062.png` | 128×128 px, 10.9 KB | #b736b7 |
| `2432001_0063.png` | 128×128 px, 11.3 KB | #b232b2 |
| `2432001_0064.png` | 128×128 px, 10.5 KB | #b130b1 |
| `2432001_0065.png` | 128×128 px, 10.3 KB | #b433b4 |
| `2432001_0066.png` | 128×128 px, 9.8 KB | #b737b7 |
| `2432001_0067.png` | 128×128 px, 11.8 KB | #b635b6 |
| `2432001_0068.png` | 128×128 px, 10.4 KB | #b836b8 |
| `2432001_0069.png` | 128×128 px, 11.0 KB | #b835b8 |
| `2432001_0070.png` | 128×128 px, 10.8 KB | #b835b8 |
| `charge_vox00.png` | 64×64 px, 0.7 KB | #e64adc |
| `charge_vox01.png` | 64×64 px, 0.8 KB | #e54dd7 |
| `charge_vox02.png` | 64×64 px, 0.8 KB | #e951d7 |
| `charge_vox03.png` | 64×64 px, 1.0 KB | #e551d2 |
| `charge_vox04.png` | 64×64 px, 1.2 KB | #ee14ce |
| `charge_vox05.png` | 64×64 px, 1.2 KB | #ea0ccc |
| `charge_vox06.png` | 64×64 px, 1.4 KB | #ea0dcc |
| `charge_vox07.png` | 64×64 px, 1.5 KB | #ea0cca |
| `charge_vox08.png` | 64×64 px, 1.7 KB | #f128d3 |
| `charge_vox09.png` | 64×64 px, 1.9 KB | #f238d7 |
| `charge_vox10.png` | 64×64 px, 2.1 KB | #f140d1 |
| `charge_vox11.png` | 64×64 px, 2.2 KB | #f343d3 |
| `charge_vox12.png` | 64×64 px, 2.3 KB | #f260d6 |
| `charge_vox13.png` | 64×64 px, 2.1 KB | #f261d7 |
| `charge_vox14.png` | 64×64 px, 2.4 KB | #f55edb |
| `gun.png` | 64×64 px, 3.4 KB | #9b9c74 |
| `gun_flare_.png` | 64×64 px, 3.9 KB | #edf78c |
| `gun_light.png` | 64×64 px, 3.1 KB | #b6f59e |
| `icon_cross01.png` | 64×64 px, 2.2 KB | #ffffff |
| `icon_cross02.png` | 64×64 px, 1.9 KB | #ffffff |
| `icon_cross03.png` | 64×64 px, 1.8 KB | #ffffff |
| `icon_cross04.png` | 64×64 px, 2.0 KB | #ffffff |
| `icon_e.png` | 64×64 px, 0.2 KB | #ffffff |
| `icon_ld.png` | 64×64 px, 0.3 KB | #ffffff |
| `icon_r.png` | 64×64 px, 0.3 KB | #ffffff |
| `icon_s.png` | 64×64 px, 0.5 KB | #ffffff |
| `missile.png` | 64×64 px, 4.2 KB | #c8c8a0 |
| `missile_light.png` | 64×64 px, 3.7 KB | #a9bfe8 |
| `propulsion04.png` | 64×64 px, 3.1 KB | #9ef098 |
| `propulsion_light.png` | 64×64 px, 3.4 KB | #b6f59e |

## Efeitos tocados como no original (`public/modelos/efeitos/`)

Copiadas por `tools/efeitos3d_do_original.py` junto com os efeitos que as usam (o `.eff` + `.3dx` + `.MPL` do original, tocados por `public/js/efeitos-original.js`): as das armas dos monstros da jungle e as dos estados na nave (o fogo do Magma, `recharging`, e os ícones 3D em cima da nave, `cross` e `cross002`). As `1361053_01` a `_57` são os quadros da chama do lança-chamas do Xerxes (a paleta `1361053.MPL` troca a textura a cada quadro).

| Arquivo | Tamanho | Cor dominante | Efeitos |
|---|---|---|---|
| `1322060.png` | 64×16 px, 1.8 KB | #b9ff9a | 1322060 |
| `1322061.png` | 128×128 px, 9.7 KB | #d35273 | 1322061 |
| `1322065.png` | 64×64 px, 4.3 KB | #ee90a5 | 1322065 |
| `1361053_01.png` | 128×128 px, 0.1 KB | #000000 | 1361153, 1361253 |
| `1361053_02.png` | 128×128 px, 0.1 KB | #000000 | 1361153, 1361253 |
| `1361053_03.png` | 128×128 px, 0.4 KB | #a46b59 | 1361153, 1361253 |
| `1361053_04.png` | 128×128 px, 1.0 KB | #cd815c | 1361153, 1361253 |
| `1361053_05.png` | 128×128 px, 1.6 KB | #cd7f51 | 1361153, 1361253 |
| `1361053_06.png` | 128×128 px, 2.0 KB | #e79565 | 1361153, 1361253 |
| `1361053_07.png` | 128×128 px, 2.2 KB | #ee9b66 | 1361153, 1361253 |
| `1361053_08.png` | 128×128 px, 2.5 KB | #f4a779 | 1361153, 1361253 |
| `1361053_09.png` | 128×128 px, 2.7 KB | #f8b6a0 | 1361153, 1361253 |
| `1361053_10.png` | 128×128 px, 2.9 KB | #f9cab5 | 1361153, 1361253 |
| `1361053_11.png` | 128×128 px, 3.0 KB | #faddc4 | 1361153, 1361253 |
| `1361053_12.png` | 128×128 px, 3.1 KB | #fae5cd | 1361153, 1361253 |
| `1361053_13.png` | 128×128 px, 3.2 KB | #fae8d4 | 1361153, 1361253 |
| `1361053_14.png` | 128×128 px, 3.2 KB | #faead9 | 1361153, 1361253 |
| `1361053_15.png` | 128×128 px, 3.3 KB | #fae9dd | 1361153, 1361253 |
| `1361053_16.png` | 128×128 px, 3.5 KB | #f9e7e0 | 1361153, 1361253 |
| `1361053_17.png` | 128×128 px, 3.6 KB | #f8e4e1 | 1361153, 1361253 |
| `1361053_18.png` | 128×128 px, 3.8 KB | #f7e0e3 | 1361153, 1361253 |
| `1361053_19.png` | 128×128 px, 3.6 KB | #f4dae2 | 1361153, 1361253 |
| `1361053_20.png` | 128×128 px, 3.8 KB | #f0d3e1 | 1361153, 1361253 |
| `1361053_21.png` | 128×128 px, 3.9 KB | #ebcbde | 1361153, 1361253 |
| `1361053_22.png` | 128×128 px, 4.0 KB | #e5c1d9 | 1361153, 1361253 |
| `1361053_23.png` | 128×128 px, 4.5 KB | #ddb5d2 | 1361153, 1361253 |
| `1361053_24.png` | 128×128 px, 4.8 KB | #d4abcb | 1361153, 1361253 |
| `1361053_25.png` | 128×128 px, 5.1 KB | #c49dbf | 1361153, 1361253 |
| `1361053_26.png` | 128×128 px, 5.3 KB | #b28eb0 | 1361153, 1361253 |
| `1361053_27.png` | 128×128 px, 5.2 KB | #a481a4 | 1361153, 1361253 |
| `1361053_28.png` | 128×128 px, 5.4 KB | #927395 | 1361153, 1361253 |
| `1361053_29.png` | 128×128 px, 5.7 KB | #816686 | 1361153, 1361253 |
| `1361053_30.png` | 128×128 px, 5.7 KB | #705877 | 1361153, 1361253 |
| `1361053_31.png` | 128×128 px, 5.8 KB | #614d69 | 1361153, 1361253 |
| `1361053_32.png` | 128×128 px, 5.6 KB | #52425d | 1361153, 1361253 |
| `1361053_33.png` | 128×128 px, 5.4 KB | #44374d | 1361153, 1361253 |
| `1361053_34.png` | 128×128 px, 6.0 KB | #392e41 | 1361153, 1361253 |
| `1361053_35.png` | 128×128 px, 5.6 KB | #382832 | 1361153, 1361253 |
| `1361053_36.png` | 128×128 px, 5.4 KB | #4f2d1f | 1361153, 1361253 |
| `1361053_37.png` | 128×128 px, 5.8 KB | #6f3c1d | 1361153, 1361253 |
| `1361053_38.png` | 128×128 px, 6.1 KB | #854b24 | 1361153, 1361253 |
| `1361053_39.png` | 128×128 px, 6.3 KB | #9b5e30 | 1361153, 1361253 |
| `1361053_40.png` | 128×128 px, 6.9 KB | #a56a41 | 1361153, 1361253 |
| `1361053_41.png` | 128×128 px, 7.2 KB | #ac7350 | 1361153, 1361253 |
| `1361053_42.png` | 128×128 px, 7.5 KB | #b17b5e | 1361153, 1361253 |
| `1361053_43.png` | 128×128 px, 7.7 KB | #b17f71 | 1361153, 1361253 |
| `1361053_44.png` | 128×128 px, 7.9 KB | #ad7f7e | 1361153, 1361253 |
| `1361053_45.png` | 128×128 px, 8.0 KB | #a37a83 | 1361153, 1361253 |
| `1361053_46.png` | 128×128 px, 8.0 KB | #987588 | 1361153, 1361253 |
| `1361053_47.png` | 128×128 px, 8.0 KB | #896d86 | 1361153, 1361253 |
| `1361053_48.png` | 128×128 px, 7.9 KB | #7b6581 | 1361153, 1361253 |
| `1361053_49.png` | 128×128 px, 7.3 KB | #705e7c | 1361153, 1361253 |
| `1361053_50.png` | 128×128 px, 6.8 KB | #645470 | 1361153, 1361253 |
| `1361053_51.png` | 128×128 px, 6.3 KB | #5c485e | 1361153, 1361253 |
| `1361053_52.png` | 128×128 px, 5.7 KB | #5d4349 | 1361153, 1361253 |
| `1361053_53.png` | 128×128 px, 4.3 KB | #654337 | 1361153, 1361253 |
| `1361053_54.png` | 128×128 px, 3.5 KB | #70452b | 1361153, 1361253 |
| `1361053_55.png` | 128×128 px, 1.5 KB | #7a4724 | 1361153, 1361253 |
| `1361053_56.png` | 128×128 px, 1.3 KB | #894d20 | 1361153, 1361253 |
| `1361053_57.png` | 128×128 px, 0.5 KB | #e52600 | 1361153, 1361253 |
| `cross.png` | 32×32 px, 0.6 KB | #c7c7c7 | cross001, cross002, cross007, cross008, cross010, cross013 |
| `cross002.png` | 64×64 px, 1.4 KB | #ff0000 | cross007, cross008, cross010 |
| `recharging.png` | 32×32 px, 1.0 KB | #ff442f | 1164001 |
| `1322063.png` | 128×128 px, 8.5 KB | #22b1fe | 1322063 |
| `1322064_01.png` | 128×128 px, 6.0 KB | #75d269 | 1322064 |
| `1322064_02.png` | 128×128 px, 7.7 KB | #30ac63 | 1322064 |
| `1121030.png` | 64×64 px, 1.7 KB | #4fd206 | 1421030 |
