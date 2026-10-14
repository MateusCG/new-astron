# Modelos das armas do AstroN original

Gerados por `tools/armas_do_original.py` a partir de `old-astron/assets_obb/3dx` (aw = Acron, bw = Bellico, sw = Shrewdo). 150 modelos, 3.35 MB no total, cada um com a textura embutida.

## Como montar na nave

- **Espaço:** o mesmo dos GLB das naves (`public/modelos/ulysses.glb`): Y para cima, nariz para +x, +z à direita, unidades do jogo original (as naves têm ~30–50 de envergadura; as armas, ~10–20 de comprimento).
- **Encaixe:** a origem do modelo é o ponto de fixação. Pendure o GLB da arma como filho do nó `l_item` (arma esquerda) ou `r_item` (direita) do GLB da nave, com a matriz do nó, e aplique a mesma rotação e escala que a nave recebe em `public/js/nave.js` (nariz de +x para -z e `COMPRIMENTO_NAVE / comprimento da nave`). Nada de escala própria para a arma.
- **Lado:** modelo com `_l`/`_r` tem uma peça para cada encaixe (no original: colunas L e R de `inititemweapon.cfg`). Modelo sem sufixo vai **igual nos dois encaixes**, sem espelhar.
- **Boca:** o nó `fire` (`extras.astron_helper = true`) é de onde sai o tiro. Modelo sem `fire` é dispositivo (escudo, camuflagem, acelerador): não dispara projétil.
- **Raiz:** `extras.astron_arma = { modelo, raca, lado }`.
- Ficaram de fora `aw301`, `bw301` e `sw301`: um triângulo de marcador invisível (`particle_dummy`) do canhão das naves-comando.

| Modelo | Raça | Lado | Tamanho | Triângulos | Comprimento × largura × altura | Encaixes (posição) | Armas do original que usam |
|---|---|---|---|---|---|---|---|
| `aw001_l.glb` | Acron | l | 19.8 KB | 70 | 10.5 × 4.4 × 2.5 | `fire` (7.8, -0.0, -1.8) | TRifle Rifle Beam Lv.1 |
| `aw001_r.glb` | Acron | r | 19.8 KB | 70 | 10.5 × 4.4 × 2.5 | `fire` (7.6, -0.0, 2.2) | TRifle Rifle Beam Lv.1 |
| `aw002.glb` | Acron | ambos | 22.2 KB | 94 | 14.1 × 4.6 × 1.5 | `fire` (11.4, 0.0, 0.0) | Piercing Magma Beam Lv.I |
| `aw003.glb` | Acron | ambos | 22.4 KB | 96 | 13.9 × 5.9 × 2.9 | `fire` (11.5, 0.6, 0.0) | CircleStorm Beam Lv.1 |
| `aw004.glb` | Acron | ambos | 23.6 KB | 108 | 12.8 × 5.7 × 3.6 | `fire` (10.2, -0.0, 0.0) | Clone Sector Beam Lv.1 |
| `aw005.glb` | Acron | ambos | 28.4 KB | 156 | 16.6 × 7.0 × 4.5 | `fire` (12.7, 2.4, 0.0) | CircleBlow Beam Lv.1 |
| `aw101.glb` | Acron | ambos | 20.0 KB | 70 | 11.3 × 6.5 × 1.9 | `fire` (9.6, 0.0, 0.0) | WideStorm Gun Lv.1 |
| `aw102.glb` | Acron | ambos | 24.2 KB | 112 | 14.2 × 6.2 × 1.8 | `fire` (10.7, 0.1, 0.0) | Front Storm Bomber Lv.1 |
| `aw103.glb` | Acron | ambos | 32.8 KB | 198 | 13.1 × 7.5 × 2.8 | `fire` (11.2, 0.9, 0.0) | Spinradius Gun Lv.1 |
| `aw104.glb` | Acron | ambos | 19.6 KB | 66 | 14.5 × 4.1 × 1.7 | `fire` (11.8, -0.0, 0.0) | Acron Vulkan Gun Lv.1 |
| `aw105.glb` | Acron | ambos | 23.2 KB | 102 | 15.6 × 9.2 × 2.2 | `fire` (11.9, -0.0, -0.0) | Homing Sector Gun Lv.1 |
| `aw201.glb` | Acron | ambos | 18.5 KB | 74 | 18.7 × 9.9 × 3.8 | `fire` (10.2, -0.8, 0.0) | Acron Suppress Trap; Homing Clone Missile Lv.1; Cyclone Storm Lv.1; Cyclone Storm Bullet; Wide Spark Explosive Bullet; Cyclone Wiper Lv.1; Cyclone Wiper Bullet; Suppress Trap Lv.1 |
| `aw202.glb` | Acron | ambos | 19.5 KB | 84 | 18.8 × 5.4 × 3.9 | `fire` (14.5, -0.0, -0.0) | Energy Wave Lv.1; Wide Energy Wave Lv.1 |
| `aw203_l.glb` | Acron | l | 29.8 KB | 68 | 10.4 × 11.2 × 5.7 | — | Shield Recovering Device Lv.1 |
| `aw203_r.glb` | Acron | r | 29.8 KB | 68 | 10.4 × 11.2 × 5.7 | — | Shield Recovering Device Lv.1 |
| `aw204_l.glb` | Acron | l | 13.8 KB | 28 | 7.7 × 11.9 × 3.7 | — | Optical Beam Tent Lv.1; Circuit Breaking Device Lv.1 |
| `aw204_r.glb` | Acron | r | 13.8 KB | 28 | 7.7 × 11.9 × 3.7 | — | Optical Beam Tent Lv.1; Circuit Breaking Device Lv.1 |
| `aw205_l.glb` | Acron | l | 22.5 KB | 104 | 13.8 × 8.2 × 3.8 | `fire` (7.2, 3.0, 0.0) | Reinforced Revolving Blade Lv.1; Revolving Blade Lv.1 |
| `aw205_r.glb` | Acron | r | 22.5 KB | 104 | 13.8 × 8.2 × 3.8 | `fire` (7.2, 3.0, 0.0) | Reinforced Revolving Blade Lv.1; Revolving Blade Lv.1 |
| `aw206_l.glb` | Acron | l | 21.5 KB | 94 | 12.5 × 7.8 × 4.4 | `fire` (10.2, 2.9, -0.0) | Energy Nova Lv.1; Acron Blow Wave Lv.1 |
| `aw206_r.glb` | Acron | r | 21.5 KB | 94 | 12.5 × 7.8 × 4.4 | `fire` (10.2, 2.9, -0.0) | Energy Nova Lv.1; Acron Blow Wave Lv.1 |
| `aw207_l.glb` | Acron | l | 14.1 KB | 20 | 17.6 × 3.9 × 1.4 | `fire` (6.5, -1.5, 0.0) | Teleport Device Lv.1 |
| `aw207_r.glb` | Acron | r | 14.1 KB | 20 | 17.6 × 3.9 × 1.4 | `fire` (6.5, -1.5, 0.0) | Teleport Device Lv.1 |
| `aw208_l.glb` | Acron | l | 17.7 KB | 56 | 17.1 × 3.5 × 1.1 | `fire` (7.5, -0.9, -0.0) | Energy Discharging Cannon Lv.1; Bolt Storm Beam Lv.1 |
| `aw208_r.glb` | Acron | r | 17.7 KB | 56 | 17.1 × 3.5 × 1.1 | `fire` (7.5, -0.9, -0.0) | Energy Discharging Cannon Lv.1; Bolt Storm Beam Lv.1 |
| `aw209_l.glb` | Acron | l | 18.5 KB | 64 | 18.4 × 4.6 × 5.4 | `fire` (6.5, -3.0, 0.0) | Optical Beam Amplifier Cannon Lv.1; Recoil Shock Boostergun Lv.1; Freezer Cannon Lv.1; LightningStorm Rifle Lv.1 |
| `aw209_r.glb` | Acron | r | 18.5 KB | 64 | 18.4 × 4.6 × 5.4 | `fire` (6.5, -3.0, 0.0) | Optical Beam Amplifier Cannon Lv.1; Recoil Shock Boostergun Lv.1; Freezer Cannon Lv.1; LightningStorm Rifle Lv.1 |
| `aw210_l.glb` | Acron | l | 16.3 KB | 60 | 14.1 × 4.9 × 2.2 | — | Cloak Device Lv.1 |
| `aw210_r.glb` | Acron | r | 16.3 KB | 60 | 14.1 × 4.9 × 2.2 | — | Cloak Device Lv.1 |
| `aw211_l.glb` | Acron | l | 15.3 KB | 48 | 14.6 × 5.2 × 2.1 | `fire` (8.5, -1.3, -0.0) | Cloak Sensing Nova Lv.1 |
| `aw211_r.glb` | Acron | r | 15.3 KB | 48 | 14.6 × 5.2 × 2.1 | `fire` (8.5, -1.3, 0.0) | Cloak Sensing Nova Lv.1 |
| `aw212_l.glb` | Acron | l | 14.1 KB | 36 | 21.7 × 8.1 × 2.9 | `fire` (10.0, -0.0, 0.0) | Bullet Rebouncing Device Lv.1 |
| `aw212_r.glb` | Acron | r | 14.1 KB | 36 | 21.7 × 8.1 × 2.9 | `fire` (10.0, -0.0, -0.0) | Bullet Rebouncing Device Lv.1 |
| `aw213_l.glb` | Acron | l | 14.7 KB | 44 | 23.4 × 10.7 × 2.9 | — | — |
| `aw213_r.glb` | Acron | r | 14.7 KB | 44 | 23.4 × 10.7 × 2.9 | — | — |
| `aw214.glb` | Acron | ambos | 14.8 KB | 36 | 16.3 × 3.9 × 3.3 | `fire` (15.1, 0.1, -0.0) | Circle Trap Lv.1 |
| `aw215_l.glb` | Acron | l | 18.4 KB | 63 | 13.6 × 8.5 × 4.2 | `fire` (13.3, 0.6, -5.4) | HomingStorm Beam Lv.1; HomingStorm Reinforced Beam Lv.1 |
| `aw215_r.glb` | Acron | r | 18.4 KB | 63 | 13.6 × 8.5 × 4.2 | `fire` (13.4, 0.6, 5.5) | HomingStorm Beam Lv.1; HomingStorm Reinforced Beam Lv.1 |
| `aw216_l.glb` | Acron | l | 18.2 KB | 56 | 15.8 × 6.1 × 1.0 | `fire` (8.6, -1.1, -0.0) | El. Bomber Lv.1; Wide Spark Cannon Lv.1; El. Trap Lv.1 |
| `aw216_r.glb` | Acron | r | 18.2 KB | 56 | 15.8 × 6.1 × 1.0 | `fire` (8.6, -1.1, -0.0) | El. Bomber Lv.1; Wide Spark Cannon Lv.1; El. Trap Lv.1 |
| `aw217_l.glb` | Acron | l | 19.0 KB | 64 | 18.4 × 4.7 × 5.4 | `fire` (10.0, -1.8, 0.0) | SpeedTrap Nova Lv.1; El. Charge Nova Lv.1 |
| `aw217_r.glb` | Acron | r | 19.0 KB | 64 | 18.4 × 4.7 × 5.4 | `fire` (10.0, -1.8, -0.0) | SpeedTrap Nova Lv.1; El. Charge Nova Lv.1 |
| `aw218_l.glb` | Acron | l | 16.6 KB | 40 | 19.1 × 9.0 × 2.0 | `fire` (11.5, -0.8, -5.9) | Repair Nova Lv.1 |
| `aw218_r.glb` | Acron | r | 16.6 KB | 40 | 19.1 × 9.0 × 2.0 | `fire` (11.6, -0.8, 5.9) | Repair Nova Lv.1 |
| `aw219_l.glb` | Acron | l | 16.8 KB | 44 | 22.0 × 8.7 × 3.0 | — | Shock Converter Lv.1 |
| `aw219_r.glb` | Acron | r | 16.8 KB | 44 | 22.0 × 8.7 × 3.0 | — | Shock Converter Lv.1 |
| `aw220_l.glb` | Acron | l | 19.4 KB | 68 | 11.9 × 11.2 × 7.7 | `fire` (5.7, 2.9, -5.9) | Energy Absorbing Missile Lv.1 |
| `aw220_r.glb` | Acron | r | 19.4 KB | 68 | 11.9 × 11.2 × 7.7 | `fire` (5.7, 2.9, 5.9) | Energy Absorbing Missile Lv.1 |
| `aw221_l.glb` | Acron | l | 23.2 KB | 106 | 16.2 × 9.7 × 1.8 | `fire` (11.0, 1.2, -4.9) | — |
| `aw221_r.glb` | Acron | r | 23.2 KB | 106 | 16.2 × 9.7 × 1.8 | `fire` (11.0, 1.2, 4.9) | — |
| `aw222_l.glb` | Acron | l | 20.8 KB | 82 | 15.0 × 12.4 × 7.4 | `fire` (12.6, -5.4, -5.8) | Paralyzing Stormmissile Lv.1 |
| `aw222_r.glb` | Acron | r | 20.8 KB | 82 | 15.0 × 12.4 × 7.4 | `fire` (12.5, -5.4, 5.6) | Paralyzing Stormmissile Lv.1 |
| `aw223_l.glb` | Acron | l | 21.2 KB | 86 | 13.9 × 9.7 × 0.9 | `fire` (10.0, 0.3, -5.4) | Paralysis Removing Nova Lv.1; Trap Removing Nova Lv.1; Energy Distribution Nova Lv.1 |
| `aw223_r.glb` | Acron | r | 21.2 KB | 86 | 13.9 × 9.7 × 0.9 | `fire` (10.0, 1.0, 5.3) | Paralysis Removing Nova Lv.1; Trap Removing Nova Lv.1; Energy Distribution Nova Lv.1 |
| `aw224_l.glb` | Acron | l | 19.4 KB | 70 | 15.0 × 12.2 × 4.3 | — | — |
| `aw224_r.glb` | Acron | r | 19.4 KB | 70 | 15.0 × 12.2 × 4.3 | — | — |
| `bw001.glb` | Bellico | ambos | 29.0 KB | 40 | 14.0 × 1.9 × 1.7 | `fire` (7.3, 0.5, 0.0) | Bellico Blow Beam |
| `bw002.glb` | Bellico | ambos | 31.4 KB | 64 | 14.0 × 4.3 × 1.7 | `fire` (7.5, 0.5, 0.0) | MagmaStorm Beam |
| `bw003.glb` | Bellico | ambos | 30.8 KB | 58 | 16.2 × 1.9 × 1.7 | `fire` (8.9, 0.5, 0.0) | Piercing Circle Beam; Piercing Rifle |
| `bw004.glb` | Bellico | ambos | 33.6 KB | 86 | 14.0 × 3.9 × 1.8 | `fire` (7.3, 0.5, 0.0) | Clone Array Beam |
| `bw005.glb` | Bellico | ambos | 32.6 KB | 76 | 21.8 × 6.4 × 3.4 | `fire` (11.5, -0.0, 0.0) | Double Clone Beam; Magma Trap; Magma Trap Bullet |
| `bw101.glb` | Bellico | ambos | 21.8 KB | 44 | 13.8 × 1.6 × 1.3 | `fire` (7.6, 0.7, 0.0) | Bellico Vulkan Gun |
| `bw102.glb` | Bellico | ambos | 26.7 KB | 94 | 13.8 × 3.4 × 1.5 | `fire` (7.0, 0.6, 0.0) | Critic Blow Gun |
| `bw103.glb` | Bellico | ambos | 25.3 KB | 80 | 15.3 × 3.3 × 2.8 | `fire` (8.1, -0.0, 0.0) | VulkanStorm Gun |
| `bw104.glb` | Bellico | ambos | 40.9 KB | 236 | 14.4 × 2.8 × 2.8 | `fire` (7.6, -0.8, 0.0) | Piercing Vulkan Gun |
| `bw105.glb` | Bellico | ambos | 25.3 KB | 80 | 20.8 × 6.3 × 5.4 | `fire` (10.9, -0.0, 0.0) | HomingVulkan Gun |
| `bw201.glb` | Bellico | ambos | 29.8 KB | 48 | 12.4 × 3.9 × 3.4 | `fire` (6.5, -0.3, 0.0) | Array Acceleration Missile; HomingVulkanStorm Gun |
| `bw202.glb` | Bellico | ambos | 33.6 KB | 72 | 13.5 × 3.5 × 3.0 | `fire` (6.9, -0.0, 0.0) | Magma Sector Cannon |
| `bw203.glb` | Bellico | ambos | 39.8 KB | 48 | 15.7 × 6.5 × 5.6 | `fire` (8.1, -1.4, 0.0) | Shield Recovering Device; Shock Reducing Device |
| `bw204.glb` | Bellico | ambos | 49.0 KB | 84 | 17.0 × 6.2 × 5.4 | `fire` (8.7, -1.3, 0.0) | Piercing Spark Beam |
| `bw205_l.glb` | Bellico | l | 26.1 KB | 88 | 15.5 × 3.9 × 2.5 | `fire` (8.1, -0.0, 0.0) | Energy Spear |
| `bw205_r.glb` | Bellico | r | 26.1 KB | 88 | 15.5 × 3.9 × 2.5 | `fire` (8.1, -0.0, 0.0) | Energy Spear |
| `bw206_l.glb` | Bellico | l | 31.7 KB | 52 | 14.3 × 3.7 × 2.3 | `fire` (7.2, -0.0, 0.0) | Ph. Shock Wave; Storm Trap; Front Sector Shock Wave |
| `bw206_r.glb` | Bellico | r | 31.7 KB | 52 | 14.3 × 3.7 × 2.3 | `fire` (7.2, -0.0, 0.0) | Ph. Shock Wave; Storm Trap; Front Sector Shock Wave |
| `bw207_l.glb` | Bellico | l | 34.0 KB | 76 | 18.8 × 5.9 × 5.3 | `fire` (9.8, -0.0, 0.0) | Shield Breaking Missile |
| `bw207_r.glb` | Bellico | r | 34.0 KB | 76 | 18.8 × 5.9 × 5.3 | `fire` (9.8, -0.0, 0.0) | Shield Breaking Missile |
| `bw208_l.glb` | Bellico | l | 36.5 KB | 100 | 18.2 × 5.2 × 4.2 | `fire` (9.2, -0.3, 0.0) | Piercing Spark Bolt |
| `bw208_r.glb` | Bellico | r | 36.5 KB | 100 | 18.2 × 5.2 × 4.2 | `fire` (9.2, -0.3, 0.0) | Piercing Spark Bolt |
| `bw209_l.glb` | Bellico | l | 52.1 KB | 115 | 20.9 × 5.9 × 5.3 | `fire` (10.5, 0.6, 0.0) | Shock Acceleration Cannon; Energy Reducing Cannon; El. Shock Wave |
| `bw209_r.glb` | Bellico | r | 52.1 KB | 115 | 20.9 × 5.9 × 5.3 | `fire` (10.5, 0.6, 0.0) | Shock Acceleration Cannon; Energy Reducing Cannon; El. Shock Wave |
| `bw210_l.glb` | Bellico | l | 50.6 KB | 100 | 23.4 × 7.6 × 6.8 | `fire` (9.5, -1.0, 0.0) | Cloak Sensing Cannon; Shock Bolt Missile |
| `bw210_r.glb` | Bellico | r | 50.6 KB | 100 | 23.4 × 7.6 × 6.8 | `fire` (9.5, -1.0, 0.0) | Cloak Sensing Cannon; Shock Bolt Missile |
| `bw211_l.glb` | Bellico | l | 42.8 KB | 76 | 22.9 × 5.9 × 5.1 | `fire` (14.3, 0.6, 0.0) | Instant Acceleration Device |
| `bw211_r.glb` | Bellico | r | 42.8 KB | 76 | 22.9 × 5.9 × 5.1 | `fire` (14.3, 0.6, 0.0) | Instant Acceleration Device |
| `bw212_l.glb` | Bellico | l | 35.7 KB | 60 | 17.8 × 5.1 × 3.6 | `fire` (9.0, -0.2, 0.0) | Array Cannon |
| `bw212_r.glb` | Bellico | r | 35.7 KB | 60 | 17.8 × 5.1 × 3.6 | `fire` (9.0, -0.2, 0.0) | Array Cannon |
| `bw213_l.glb` | Bellico | l | 37.8 KB | 82 | 17.8 × 5.2 × 4.5 | `fire` (9.1, -0.0, 0.0) | Rifle Trap |
| `bw213_r.glb` | Bellico | r | 37.8 KB | 82 | 17.8 × 5.2 × 4.5 | `fire` (9.1, -0.0, 0.0) | Rifle Trap |
| `bw214_l.glb` | Bellico | l | 38.9 KB | 92 | 19.0 × 5.1 × 3.2 | `fire` (9.6, -0.2, 0.0) | Piercing Sector Missile; Cruise Missile |
| `bw214_r.glb` | Bellico | r | 38.9 KB | 92 | 19.0 × 5.1 × 3.2 | `fire` (9.6, -0.2, 0.0) | Piercing Sector Missile; Cruise Missile |
| `bw215_l.glb` | Bellico | l | 33.3 KB | 36 | 21.0 × 7.5 × 4.8 | `fire` (9.8, -0.7, 0.0) | Acceleration Paralysis Nova |
| `bw215_r.glb` | Bellico | r | 33.3 KB | 36 | 21.0 × 7.5 × 4.8 | `fire` (9.8, -0.7, 0.0) | Acceleration Paralysis Nova |
| `bw216_l.glb` | Bellico | l | 33.3 KB | 36 | 22.7 × 7.5 × 4.8 | `fire` (9.8, -0.6, 0.0) | Volley Disabling Cannon; Energy Consumer Cannon |
| `bw216_r.glb` | Bellico | r | 33.3 KB | 36 | 22.7 × 7.5 × 4.8 | `fire` (9.9, -0.6, 0.4) | Volley Disabling Cannon; Energy Consumer Cannon |
| `bw217_l.glb` | Bellico | l | 39.8 KB | 48 | 21.4 × 7.0 × 4.3 | `fire` (7.2, -0.1, 0.0) | Repair Druid |
| `bw217_r.glb` | Bellico | r | 39.8 KB | 48 | 21.4 × 7.0 × 4.3 | `fire` (7.2, -0.1, 0.0) | Repair Druid |
| `bw218_l.glb` | Bellico | l | 42.4 KB | 72 | 23.4 × 7.7 × 6.3 | `fire` (10.0, -1.6, -0.0) | Energy Amplifier; Circuit Breaking Device |
| `bw218_r.glb` | Bellico | r | 42.4 KB | 72 | 23.4 × 7.7 × 6.3 | `fire` (10.0, -1.6, -0.0) | Energy Amplifier; Circuit Breaking Device |
| `bw219_l.glb` | Bellico | l | 40.6 KB | 56 | 23.2 × 7.7 × 6.3 | `fire` (11.8, -0.9, 0.0) | Invulnerability Device |
| `bw219_r.glb` | Bellico | r | 40.6 KB | 56 | 23.2 × 7.7 × 6.3 | `fire` (11.8, -0.9, 0.0) | Invulnerability Device |
| `bw220_l.glb` | Bellico | l | 43.2 KB | 80 | 25.8 × 10.1 × 6.3 | `fire` (10.0, -1.5, 0.0) | Trap Removing Nova |
| `bw220_r.glb` | Bellico | r | 43.2 KB | 80 | 25.8 × 10.1 × 6.3 | `fire` (10.0, -1.5, 0.0) | Trap Removing Nova |
| `bw221_l.glb` | Bellico | l | 41.6 KB | 64 | 21.0 × 10.8 × 4.3 | `fire` (10.0, -0.6, 0.0) | Paralysis Removing Cannon |
| `bw221_r.glb` | Bellico | r | 41.6 KB | 64 | 21.0 × 10.8 × 4.3 | `fire` (10.0, -0.6, 0.0) | Paralysis Removing Cannon |
| `sw001_l.glb` | Shrewdo | l | 16.5 KB | 108 | 10.9 × 3.6 × 1.0 | `fire` (10.9, -0.1, -1.4) | Array Blow Beam; Array Bolt Beam |
| `sw001_r.glb` | Shrewdo | r | 16.5 KB | 108 | 10.9 × 3.6 × 1.0 | `fire` (10.9, -0.1, 1.4) | Array Blow Beam; Array Bolt Beam |
| `sw002_l.glb` | Shrewdo | l | 12.4 KB | 72 | 11.0 × 3.7 × 0.5 | `fire` (10.4, 0.0, -1.9) | Piercing Array Beam |
| `sw002_r.glb` | Shrewdo | r | 12.4 KB | 72 | 11.0 × 3.7 × 0.5 | `fire` (10.4, 0.0, 1.9) | Piercing Array Beam |
| `sw003_l.glb` | Shrewdo | l | 9.5 KB | 42 | 8.0 × 5.3 × 0.5 | `fire` (7.6, -0.1, -2.6) | Force Magma Beam |
| `sw003_r.glb` | Shrewdo | r | 9.5 KB | 42 | 8.0 × 5.3 × 0.5 | `fire` (7.6, -0.1, 2.6) | Force Magma Beam |
| `sw004.glb` | Shrewdo | ambos | 10.0 KB | 44 | 12.4 × 1.6 × 1.3 | `fire` (12.5, 0.0, 0.0) | Clone Storm Beam |
| `sw005.glb` | Shrewdo | ambos | 14.8 KB | 92 | 12.5 × 3.6 × 1.4 | `fire` (12.7, -0.0, -0.0) | 3way Rifle Beam |
| `sw101.glb` | Shrewdo | ambos | 8.8 KB | 32 | 12.8 × 2.6 × 0.6 | `fire` (12.8, -0.0, 0.0) | Shrewdo Storm Gun |
| `sw102.glb` | Shrewdo | ambos | 9.7 KB | 40 | 12.7 × 1.2 × 1.1 | `fire` (12.7, -0.0, 0.0) | Vulkan Blow Gun |
| `sw103.glb` | Shrewdo | ambos | 17.7 KB | 120 | 11.0 × 3.1 × 3.1 | `fire` (11.2, -0.0, 0.0) | Array Spin Gun |
| `sw104_l.glb` | Shrewdo | l | 14.2 KB | 84 | 9.2 × 6.4 × 1.0 | `fire` (9.5, -0.0, -3.0) | Array Thunder Gun; Rifle Thunder Gun; Magma Rifle Gun; ShrewdoBlow Rifle |
| `sw104_r.glb` | Shrewdo | r | 14.2 KB | 84 | 9.2 × 6.4 × 1.0 | `fire` (9.5, -0.0, 3.0) | Array Thunder Gun; Rifle Thunder Gun; Magma Rifle Gun; ShrewdoBlow Rifle |
| `sw105.glb` | Shrewdo | ambos | 14.1 KB | 83 | 9.7 × 8.6 × 1.0 | `fire` (9.8, -0.0, 0.0) | Vulkan Sector Gun |
| `sw201.glb` | Shrewdo | ambos | 14.2 KB | 82 | 13.1 × 5.2 × 2.9 | `fire` (13.5, -0.0, 0.0) | EnergyBolt Trap; Reinforced EnergyBolt Trap; kkkEnergyBolt; K EnergyBolt |
| `sw202_l.glb` | Shrewdo | l | 11.3 KB | 58 | 9.9 × 3.9 × 1.0 | `fire` (9.5, -0.0, -1.5) | Cloak Sensing Cannon; Radar Disturbing Cannon |
| `sw202_r.glb` | Shrewdo | r | 11.3 KB | 58 | 9.9 × 3.9 × 1.0 | `fire` (9.5, -0.0, 1.5) | Cloak Sensing Cannon; Radar Disturbing Cannon |
| `sw203_l.glb` | Shrewdo | l | 12.2 KB | 70 | 14.7 × 7.2 × 3.9 | — | Cloak Device |
| `sw203_r.glb` | Shrewdo | r | 12.2 KB | 70 | 14.7 × 7.2 × 3.9 | — | Cloak Device |
| `sw204_l.glb` | Shrewdo | l | 7.9 KB | 36 | 21.0 × 5.6 × 3.2 | — | Shield Recovering Device; Shield Reinforcing Device |
| `sw204_r.glb` | Shrewdo | r | 7.9 KB | 36 | 21.0 × 5.6 × 3.2 | — | Shield Recovering Device; Shield Reinforcing Device |
| `sw205_l.glb` | Shrewdo | l | 8.7 KB | 36 | 11.1 × 5.6 × 1.6 | `fire` (-4.5, -0.5, -3.8) | Homing Sector Beam; Array Homing Beam |
| `sw205_r.glb` | Shrewdo | r | 8.7 KB | 36 | 11.1 × 5.6 × 1.6 | `fire` (-4.5, -0.5, 3.8) | Homing Sector Beam; Array Homing Beam |
| `sw206_l.glb` | Shrewdo | l | 11.6 KB | 66 | 9.0 × 8.9 × 1.8 | `fire` (-2.5, -0.2, -5.6) | Homing Trap |
| `sw206_r.glb` | Shrewdo | r | 11.6 KB | 66 | 9.0 × 8.9 × 1.8 | `fire` (-2.5, -0.2, 5.6) | Homing Trap |
| `sw207_l.glb` | Shrewdo | l | 13.4 KB | 80 | 11.8 × 6.8 × 3.6 | `fire` (11.8, -2.6, -3.6) | Lock-Down Missile; Double Discharging Missile; ChargeBolt Missile |
| `sw207_r.glb` | Shrewdo | r | 13.4 KB | 80 | 11.8 × 6.8 × 3.6 | `fire` (11.8, -2.6, 3.6) | Lock-Down Missile; Double Discharging Missile; ChargeBolt Missile |
| `sw208_l.glb` | Shrewdo | l | 12.9 KB | 70 | 10.2 × 3.9 × 1.2 | `fire` (9.3, 0.0, -1.6) | SpeedTrap Cannon; Resistance Break Cannon; Striking Power Diminish Missile |
| `sw208_r.glb` | Shrewdo | r | 12.8 KB | 70 | 10.2 × 3.9 × 1.2 | `fire` (9.3, 0.0, 1.6) | SpeedTrap Cannon; Resistance Break Cannon; Striking Power Diminish Missile |
| `sw209_l.glb` | Shrewdo | l | 13.1 KB | 80 | 15.2 × 7.9 × 3.2 | — | Acceleration Device |
| `sw209_r.glb` | Shrewdo | r | 13.1 KB | 80 | 15.2 × 7.9 × 3.2 | — | Acceleration Device |
| `sw210.glb` | Shrewdo | ambos | 9.4 KB | 41 | 14.5 × 2.8 × 3.2 | — | Invulnerability Device; Plasma Field |
| `sw211.glb` | Shrewdo | ambos | 11.3 KB | 54 | 11.7 × 3.1 × 4.9 | `fire` (12.1, -3.8, 0.0) | Homing Spin Missile; Homing Spin Missile T2 |
| `sw212.glb` | Shrewdo | ambos | 9.8 KB | 46 | 12.1 × 2.1 × 4.8 | `fire` (12.4, -3.8, 0.0) | Energy Field Trap; Suppress Trap Bullet; Shrewdo Energy Field Trap Lv.1; Shrewdo Energy Field Trap |
| `sw213.glb` | Shrewdo | ambos | 12.4 KB | 70 | 12.7 × 4.4 × 4.3 | `fire` (13.2, -0.0, 0.0) | Sector Storm Cannon; Rifle Storm Cannon |
| `sw214.glb` | Shrewdo | ambos | 11.7 KB | 60 | 9.6 × 6.4 × 2.5 | `fire` (10.1, -0.0, 0.0) | Case Shot Launcher |
| `sw215_l.glb` | Shrewdo | l | 12.2 KB | 72 | 11.5 × 5.4 × 4.9 | `fire` (11.7, -0.0, -2.6) | Repair Druid; Circuit Breaking Device |
| `sw215_r.glb` | Shrewdo | r | 12.2 KB | 72 | 11.5 × 5.4 × 4.9 | `fire` (11.7, -0.0, -2.6) | Repair Druid; Circuit Breaking Device |
| `sw216_l.glb` | Shrewdo | l | 12.2 KB | 68 | 10.8 × 6.7 × 2.2 | `fire` (10.4, -0.1, -2.7) | Paralyzing Cannon; Control Disturbing Cannon |
| `sw216_r.glb` | Shrewdo | r | 12.2 KB | 68 | 10.8 × 6.7 × 2.2 | `fire` (10.4, -0.1, 2.7) | Paralyzing Cannon; Control Disturbing Cannon |
| `sw217_l.glb` | Shrewdo | l | 16.9 KB | 114 | 12.2 × 6.2 × 3.3 | `fire` (11.9, -0.0, -3.7) | Magnetic Field Trap |
| `sw217_r.glb` | Shrewdo | r | 16.9 KB | 114 | 12.2 × 6.2 × 3.3 | `fire` (11.9, -0.0, 3.7) | Magnetic Field Trap |
| `sw218_l.glb` | Shrewdo | l | 13.1 KB | 80 | 12.0 × 5.7 × 0.5 | `fire` (7.9, -1.0, -2.5) | Paralysis Removing Nova; Trap Removing Nova; Shield Recharging Nova |
| `sw218_r.glb` | Shrewdo | r | 13.1 KB | 80 | 12.0 × 5.7 × 0.5 | `fire` (7.9, -1.0, 2.5) | Paralysis Removing Nova; Trap Removing Nova; Shield Recharging Nova |
| `sw219_l.glb` | Shrewdo | l | 11.5 KB | 62 | 15.3 × 6.1 × 3.1 | `fire` (10.2, -0.0, -3.8) | Rapid Shield Discharging Cannon; Tracking Bolt |
| `sw219_r.glb` | Shrewdo | r | 11.5 KB | 62 | 15.3 × 6.1 × 3.1 | `fire` (10.2, -0.0, 3.8) | Rapid Shield Discharging Cannon; Tracking Bolt |
