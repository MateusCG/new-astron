// Regras do disparo das armas desenhadas como no AstroN original (puro: sem Three.js,
// sem DOM; quem desenha é disparo-original.js): as duas de fábrica de cada raça
// (INICIAIS_ORIGINAL em shared/armas.js) e as revistas depois, uma a uma, contra o
// original (o Feixe Perfurante de Magma, o Canhão de Faíscas, o Rebatedor de Projéteis,
// as quinze Acron da segunda leva: feixes em círculo, metralhas, lâmina, canhão
// descarregador, ciclone, armadilha, míssil clone, as três novas e os três
// dispositivos; as dezessete da terceira: os raios, os canhões, os mísseis com
// rastro, as armadilhas, as seis novas, a camuflagem e o teleporte; e as nove da
// quarta, as últimas Acron: os feixes e a metralha teleguiados, a Metralha Larga, o
// Feixe Clone em Leque, o Canhão de Recuo, a Onda de Energia Larga, o Ciclone Varredor
// e a Lâmina Giratória; as 41 Bellico e as 47 Shrewdo, nos lotes Assault, Mobile e
// Functional). A pesquisa, com a evidência de cada número, está em
// ~/Documentos/new-astron-progresso/ANIMACOES-ORIGINAL.md, seções "Disparo das armas
// de início", "Magma, Faíscas e Rebatedor", "Segunda leva Acron", "Terceira leva Acron",
// "Quarta leva Acron", "Armas Bellico" e "Armas Shrewdo".
//
// Como o original desenha um tiro (libgame decompilado):
// - Clarão na boca: CUnitBeam::InitData cria, para CADA projétil, o efeito da coluna 51
//   do inititemweapon.cfg com CUnitBeam::CreateEffect no modo da coluna 53. Os modos das
//   armas de início são o 14 (CUnitFire preso na boca da arma, girado ao acaso em volta do
//   cano: (rand() % 10) × 0,6283 rad) e o 15 (preso na boca, sem giro). Preso: a cada
//   quadro, CUnitFire::CalculateMovement põe o efeito em CBasePilot::GetWeaponMatrix, o nó
//   `fire` da arma pendurada no `l_item` (arma do encaixe par, o Z) ou no `r_item` (ímpar,
//   o X), no rumo da nave SEM a inclinação da curva (a matriz +0xdc da CUnit). Toca o .eff
//   uma vez e some (CUnitFire::OnStateEnd).
// - Projétil: nasce na boca (CBasePilot::GetWeaponFireMatrix: o mesmo `fire`, na altura
//   de voo), com os projéteis paralelos espalhados de lado em volta dela
//   (CPilotManage::Attack: i × vão − (n − 1) × vão / 2), e desenha o efeito da coluna 57
//   (CUnitBeam::LoadGraphic, tipo 0 = modelo) repetindo (CUnitBeam::OnStateEnd reinicia).
// - Acabou a vida no ar: some, sem efeito nem som (CUnitBeam::OnDeleteMe(false)).
// - Bateu no chão (MoveBullet devolve 0): o efeito de impacto (coluna 89) na matriz do
//   próprio tiro, e o som de impacto (coluna 11).
// - Acertou: CUnitBeam::ProcessDamage cria o impacto em cada alvo, no casco: o centro do
//   alvo mais o rumo (do alvo para o tiro, no plano) × 0,85 × o raio dele, com a matriz
//   (o giro) do ALVO; depois OnDeleteMe(true) toca o som de impacto e cria o efeito de
//   fim (coluna 92) no modo da coluna 94: o 7 (só a Metralha Shrewdo) põe o efeito
//   deitado no ponto, na escala raio da área / 100 (o anel do 1421002 tem raio 100).
// - Feixe que atravessa (coluna 74, 5º dígito '2': o Feixe Perfurante de Magma): o
//   ProcessDamage cria o impacto em cada alvo que ele pega, uma vez por alvo (a lista
//   de atingidos do CUnitBeam), e o feixe segue; só o chão o apaga.
// - Modo 2 do clarão (o Rebatedor de Projéteis): CUnitFire parado onde a nave estava
//   no disparo (a posição da unidade, sem o giro dela: de pé, no rumo do mundo), na
//   escala área / 100 (o anel do 1162020 tem raio 100), uma vez. O projétil dele tem
//   vida 0 e some no primeiro quadro: não aparece.
// - Projétil que acelera (colunas 64 a 66: o Canhão de Faíscas sai parado e acelera
//   0,0003 m/ms² até 0,5 m/ms; a Lâmina Giratória, 0,0002 até 0,35, e segue nela até o
//   fim da vida): CUnitBeam::MoveBullet soma a aceleração a cada quadro.
//   O jogo voa a velocidade média (o mesmo alcance no mesmo tempo, shared/armas.js);
//   o desenho anda pela curva do original na mesma linha (recuoDaCarga).
// - Esfera que cresce (tipo de gráfico 17, coluna 59: o subprojétil do Canhão de
//   Faíscas): o .eff na escala raio máximo da nova / 100 (coluna 55; o 2142018 chega a
//   raio 100 no último quadro), deitado onde o tiro acabou; sem repetir (OnStateEnd não
//   reinicia o tipo 17), o último quadro fica até a vida da nova acabar (e o que passa
//   dela é cortado: o CUnitBeam some). O impacto (coluna 89) sai no casco de cada alvo
//   pego, do lado do centro. As novas que a nave solta (Onda de Energia, Nova de
//   Energia, Nova Desarmadora) são o mesmo tipo 17, sem clarão (coluna 51 '0').
// - Explode no fim da vida (coluna 74, 6º dígito '2'): CUnitBeam::CalculateMovement
//   trata o fim da vida como o chão: o impacto (coluna 89) na matriz do próprio tiro, a
//   área e OnDeleteMe(true) (o som de impacto e o fim). Sem o dígito, some sem nada.
// - Projétil que freia (aceleração negativa: a Lâmina Giratória Reforçada sai a 0,5
//   m/ms e perde 0,0002 m/ms² até o fim da vida): MoveBullet só limita a velocidade por
//   cima, então ela cai sem parar (0,2 m/ms no fim); o desenho anda essa curva.
// - Subprojétil (CUnitBeam::Attack com a matriz do tiro que se divide): o InitData dele
//   cria o clarão da coluna 51 dele. No modo 0 (o do Míssil Clone Teleguiado) é um
//   CUnitFire parado na matriz do subprojétil, no rumo dele, uma vez. O que se divide
//   e não explode no fim some sem nada (OnDeleteMe(false)). O disparo com o clarão no
//   modo 0 (o Míssil Descarga Dupla, coluna 53 vazia) é o mesmo caso: o CUnitFire parado
//   na matriz do tiro, isto é, na boca, na altura do voo e no rumo da nave
//   (GetWeaponFireMatrix), sem seguir a nave.
// - Armadilha (tipo de gráfico 7, que o LoadGraphic trata como o 0, um modelo): o
//   efeito da coluna 57 parado onde ela caiu, repetindo, até a vida dela acabar.
// - Dispositivos (coluna 42 = 0, sem projétil): OnActiveWeapon só cria o clarão se a
//   coluna 51 não for '0' (nos três daqui é '0': nada na boca). O que aparece é o estado
//   da nave: ProcessActiveEvent liga o PILOT_STATE_FLAG do código (34 → 0, 44 → 0x22,
//   114 → 0xd, 24 → 5, 35 → 0xb), FillUnitState o põe no CUnitState (0x5a4 + 0x20 × flag), que
//   vai para todos (CPilotManage::Move copia em +0x94) e CBasePilot::
//   ProcessUnitStateEffect desenha: o reparo do escudo (+0x96) chama
//   CUnit::EffectShieldRecovery a cada quadro desenhado (veja ESCUDO_REC); o conversor de
//   impacto (+0xb2) e as resistências (+0xb1 elétrica, +0xb0 óptica da Tenda de Luz,
//   +0xaf física) ligam o efeito 24 (1163023), 23 (2163033), 21 (2163012) e 22 (2163013)
//   da tabela do CUnit::LoadResource, desenhados na matriz da nave (CUnit::RenderScene),
//   repetindo enquanto o estado dura (ESTADOS_NA_NAVE); a Invulnerabilidade (+0xa9) liga
//   o 20 (1163039), do mesmo jeito. O Amplificador de Energia (+0x97) solta as faíscas
//   do CUnitHyperEnergyRecovery (ENERGIA_REC) e a Arrancada (+0x9b) acende o turbo nos
//   dois motores principais (CUnit::RenderPropulsion, turboNaNave).
// - Onda que cresce em voo (a Onda de Sopro Acron: coluna 55 = raio máximo, 56 = quanto
//   cresce por ms, tipo de gráfico 0): só o raio de acerto cresce (MoveBullet); o
//   CUnitBeam::RenderScene desenha o modelo sem escala nenhuma, então o desenho é o da
//   coluna 57 no tamanho dele, repetindo, e a carga sai a 0,2 m/ms e acelera até 0,5.
// - Míssil com rastro (tipo de gráfico 6: o Sugador de Energia e o Tempestade
//   Paralisante): CUnitBeam::LoadGraphic cria o CUnitMissileTail com o .3dx da coluna
//   58 (2343101), uma fita com pele em 4 ossos; a cada quadro (MoveBullet → Proceed) a
//   matriz do nó Tail do míssil entra num histórico de 16, e o RenderScene põe os ossos
//   nele (quadroDoOsso): a fita estica pelo caminho. Desenho em rastro-missil.js.
// - Armadilha (a Circular, a Elétrica, a Supressora): o projétil para onde a vida dele
//   acaba (ou na boca, com velocidade 0), na altura do voo, e fica ali; a que acaba a
//   vida sem ninguém pisar explode como no chão (o impacto ali, a área e o fim).
// - Armadilha que espera inimigo perto (coluna 99 = 2: as de Raios e a Teleguiada;
//   CUnitBeam::ProcessNonActiveTrap, CheckTrapActiveCondition e, no modo 2 da coluna
//   101, a FUN_00264d60): fica parada com o próprio projétil (coluna 57,
//   graficoDaArmadilha) até um inimigo chegar a coluna 100 m; então atira o subprojétil
//   da coluna 102 no piloto mais perto (GetNearestPilot, a até a coluna 103 m) e some
//   com OnDeleteMe(true): o som de impacto e o fim (coluna 92, modo 94) no lugar dela. A
//   vida acabando antes, some sem nada (OnDeleteMe(false)). O raio que ela atira freia
//   como o original (cargaDoGolpe: a curva do subprojétil, `cargaSub`).
// - Suporte (coluna 74 com o 4º dígito '1': as novas de Reparo, Antiparalisia e
//   Doadora; o Druida Reparador e o Canhão Antiparalisia, tiros que só pegam aliado): o
//   ProcessDamage cria o impacto em cada aliado que a nova, o tiro ou a área pega.
// - Camuflagem (código 27 → PILOT_STATE_FLAG 0x1c → estado +0x99): CUnit::RenderScene
//   desenha a nave com o próprio casco e as armas no material de alfa 0,3 para quem
//   pode vê-la (o time dela, o inimigo que a revela); o inimigo que não revela não a
//   desenha (ALFA_CAMUFLADA).
// - Teleporte (código 20): CGameSocket::LGTeleportDisappear cria o CUnitTeleportEffect
//   (1163010) na matriz da nave onde ela some e LGTeleportAppear outro onde ela aparece,
//   só com a posição (de pé); cada um toca uma vez.
//
// Escala: o original desenha tudo no metro dele, o mesmo das naves; aqui as naves são o
// original × FATOR_TAMANHO_NAVE (0,5), e o clarão, o projétil e o impacto vão na mesma
// escala, para ficar do tamanho que eram perto da nave. O tiro anda o original × 0,5
// (FATOR_VEL), então a velocidade na tela, perto da nave, também é a do original. Os
// efeitos que o original estica pela área vão pela área do jogo (raio / 100), para o
// desenho chegar aonde a área pega. O fim da V8 do Feixe Perfurante de Magma (1412002,
// modo 7) tem área 0 no original: escala 0, não aparece, e aqui também não sai.

import { WEAPONS } from '../../shared/armas.js';
import { FATOR_TAMANHO_NAVE } from '../../shared/naves.js';
import { forward } from '../../shared/sim.js';

/**
 * As armas desenhadas como no original e o modo de cada efeito (iguais nas versões V1
 * a V8 no inititemweapon.cfg): `clarao` 'giro' (modo 14), 'preso' (15), 'area' (2,
 * parado onde a nave estava, na escala da área), 'parado' (0, o Míssil Descarga Dupla:
 * parado na matriz do tiro, onde ele nasce) ou null (coluna 51 '0': sem clarão);
 * `fim` 'area' (modo 7: o fim deitado e esticado até a área); `carga`: o projétil que
 * acelera (ou freia), com a velocidade inicial, a máxima (m/ms) e a aceleração (m/ms²)
 * do original (colunas 64, 65 e 66; os mísseis saem a −0,05, caindo para trás);
 * `cargaSub`: a mesma curva para o subprojétil de cada profundidade (cargaDoGolpe);
 * `claraoSub` 'parado' (modo 0) no clarão dos subprojéteis; `teleporte`: o efeito do
 * CUnitTeleportEffect, onde a nave some (na matriz dela) e onde aparece (de pé).
 */
export const DISPARO_ORIGINAL = Object.freeze({
  o111001: Object.freeze({ clarao: 'giro' }), // Feixe Rifle Triplo (Acron)
  o111011: Object.freeze({ clarao: 'preso' }), // Vulcan Acron
  o211001: Object.freeze({ clarao: 'giro' }), // Feixe Bellico
  o211011: Object.freeze({ clarao: 'giro' }), // Vulcan Bellico
  o311001: Object.freeze({ clarao: 'giro' }), // Feixe Duplo (Shrewdo)
  o311004: Object.freeze({ clarao: 'preso', fim: 'area' }), // Metralha Shrewdo
  o111003: Object.freeze({ clarao: 'giro' }), // Feixe Perfurante de Magma (Acron Functional)
  o112028: Object.freeze({ clarao: 'preso', carga: Object.freeze({ v0: 0, vmax: 0.5, acel: 0.0003 }) }), // Canhão de Faíscas
  o112014: Object.freeze({ clarao: 'area' }), // Rebatedor de Projéteis
  // Segunda leva Acron.
  o111009: Object.freeze({ clarao: 'giro', fim: 'area' }), // Feixe Circular (CircleBlow Beam)
  o111005: Object.freeze({ clarao: 'giro', fim: 'area' }), // Feixe Tempestade Circular (CircleStorm Beam)
  o111017: Object.freeze({ clarao: 'preso', fim: 'area' }), // Metralha Rotativa (Spinradius Gun)
  o111019: Object.freeze({ clarao: 'preso', fim: 'area' }), // Bombardeiro Frontal (Front Storm Bomber)
  o112003: Object.freeze({ clarao: 'preso', carga: Object.freeze({ v0: 0.5, vmax: 0.5, acel: -0.0002 }) }), // Lâmina Giratória Reforçada
  o112010: Object.freeze({ clarao: 'preso', fim: 'area', carga: Object.freeze({ v0: 0, vmax: 0.5, acel: 0.0003 }) }), // Canhão Descarregador
  o116006: Object.freeze({ clarao: 'preso' }), // Ciclone (Cyclone Storm)
  o112034: Object.freeze({ clarao: 'preso' }), // Armadilha Supressora (Suppress Trap)
  o112001: Object.freeze({ clarao: 'preso', claraoSub: 'parado' }), // Míssil Clone Teleguiado
  o112006: Object.freeze({ clarao: null }), // Onda de Energia
  o112002: Object.freeze({ clarao: null }), // Nova de Energia
  o112024: Object.freeze({ clarao: null }), // Nova Desarmadora (Trap Removing Nova)
  o112007: Object.freeze({ clarao: null }), // Reparador de Escudo (Shield Recovering Device)
  o112019: Object.freeze({ clarao: null }), // Conversor de Impacto (Shock Converter)
  o112033: Object.freeze({ clarao: null }), // Disjuntor (Circuit Breaking Device)
  o112030: Object.freeze({ clarao: 'giro', carga: Object.freeze({ v0: 0.2, vmax: 0.5, acel: 0.0004 }) }), // Onda de Sopro Acron (Acron Blow Wave)
  o112008: Object.freeze({ clarao: null }), // Tenda de Luz (Optical Beam Tent)
  // Terceira leva Acron.
  o112035: Object.freeze({ clarao: 'giro', fim: 'area' }), // Rifle Relâmpago (LightningStorm Rifle)
  o112038: Object.freeze({ clarao: 'giro', fim: 'area' }), // Feixe Relâmpago (Bolt Storm Beam)
  o112011: Object.freeze({ clarao: 'preso', fim: 'area', carga: Object.freeze({ v0: 0, vmax: 0.5, acel: 0.0003 }) }), // Canhão Amplificador
  o112027: Object.freeze({ clarao: 'preso', fim: 'area', carga: Object.freeze({ v0: 0, vmax: 0.5, acel: 0.0003 }) }), // Canhão Congelante (Freezer Cannon)
  o112025: Object.freeze({ clarao: 'preso', fim: 'area', carga: Object.freeze({ v0: 0, vmax: 0.5, acel: 0.0003 }) }), // Bombardeiro Elétrico (El. Bomber)
  o112020: Object.freeze({ clarao: 'preso', carga: Object.freeze({ v0: -0.05, vmax: 0.4, acel: 0.0002 }) }), // Míssil Sugador de Energia
  o112009: Object.freeze({ clarao: 'preso', fim: 'area', carga: Object.freeze({ v0: -0.05, vmax: 0.4, acel: 0.0002 }) }), // Míssil Tempestade Paralisante
  o112004: Object.freeze({ clarao: 'preso', carga: Object.freeze({ v0: 0.2, vmax: 0.2, acel: -0.0001 }) }), // Armadilha Circular (Circle Trap)
  o112036: Object.freeze({ clarao: 'preso', fim: 'area' }), // Armadilha Elétrica (El. Trap)
  o112013: Object.freeze({ clarao: null }), // Nova Reveladora (Cloak Sensing Nova)
  o112017: Object.freeze({ clarao: null }), // Nova Freio (SpeedTrap Nova)
  o112018: Object.freeze({ clarao: null }), // Nova de Reparo (Repair Nova)
  o112023: Object.freeze({ clarao: null }), // Nova Antiparalisia (Paralysis Removing Nova)
  o112037: Object.freeze({ clarao: null }), // Nova de Carga Elétrica (El. Charge Nova)
  o112029: Object.freeze({ clarao: null }), // Nova Doadora de Energia (Energy Distribution Nova)
  o112012: Object.freeze({ clarao: null }), // Camuflagem (Cloak Device)
  o112021: Object.freeze({ clarao: null, teleporte: '1163010' }), // Teleporte (Teleport Device)
  // Quarta leva Acron.
  o116005: Object.freeze({ clarao: 'giro', fim: 'area' }), // Feixe Tempestade Reforçado (HomingStorm Reinforced Beam)
  o111013: Object.freeze({ clarao: 'preso', fim: 'area' }), // Metralha Larga (WideStorm Gun)
  o111015: Object.freeze({ clarao: 'preso' }), // Metralha Teleguiada (Homing Sector Gun)
  o111007: Object.freeze({ clarao: 'giro' }), // Feixe Clone em Leque (Clone Sector Beam)
  o112026: Object.freeze({ clarao: 'preso', fim: 'area', carga: Object.freeze({ v0: 0, vmax: 0.5, acel: 0.0003 }) }), // Canhão de Recuo
  o112031: Object.freeze({ clarao: null }), // Onda de Energia Larga (Wide Energy Wave)
  o112032: Object.freeze({ clarao: 'preso' }), // Ciclone Varredor (Cyclone Wiper)
  o112005: Object.freeze({ clarao: 'giro', fim: 'area' }), // Feixe Tempestade Teleguiado (HomingStorm Beam)
  o114003: Object.freeze({ clarao: 'preso', carga: Object.freeze({ v0: 0, vmax: 0.35, acel: 0.0002 }) }), // Lâmina Giratória (Revolving Blade)
  // Bellico Assault.
  o211007: Object.freeze({ clarao: 'giro' }), // Feixe Clone em Fila (Clone Array Beam)
  o211009: Object.freeze({ clarao: 'preso' }), // Feixe Perfurante Circular (Piercing Circle Beam)
  o211013: Object.freeze({ clarao: 'preso' }), // Vulcan Teleguiada (HomingVulkan Gun)
  o211015: Object.freeze({ clarao: 'preso', fim: 'area' }), // Vulcan Tempestade (VulkanStorm Gun)
  o211017: Object.freeze({ clarao: 'preso' }), // Metralha Crítica (Critic Blow Gun)
  o211019: Object.freeze({ clarao: 'giro' }), // Vulcan Perfurante (Piercing Vulkan Gun)
  o212002: Object.freeze({ clarao: 'giro', fim: 'area', carga: Object.freeze({ v0: 0, vmax: 0.5, acel: 0.0003 }) }), // Canhão de Magma em Leque
  o212011: Object.freeze({ clarao: 'preso', fim: 'area', carga: Object.freeze({ v0: 0, vmax: 0.5, acel: 0.0003 }) }), // Canhão de Choque Acelerado
  o212003: Object.freeze({ clarao: 'giro', carga: Object.freeze({ v0: 0.9, vmax: 0.9, acel: -0.00103 }) }), // Lança de Energia (Energy Spear)
  o214003: Object.freeze({ clarao: 'giro', carga: Object.freeze({ v0: 0.11, vmax: 0.5, acel: 0.00001 }) }), // Onda de Choque (Ph. Shock Wave)
  o212001: Object.freeze({ clarao: 'giro', carga: Object.freeze({ v0: 0, vmax: 0.4, acel: 0.00055 }) }), // Mísseis em Fila Acelerados
  o212008: Object.freeze({ clarao: null }), // Reparador de Escudo (Shield Recovering Device)
  o212018: Object.freeze({ clarao: null }), // Amplificador de Energia (Energy Amplifier)
  o212019: Object.freeze({ clarao: null }), // Invulnerabilidade (Invulnerability Device)
  o212020: Object.freeze({ clarao: null }), // Nova Desarmadora (Trap Removing Nova)
  o212031: Object.freeze({ clarao: null }), // Disjuntor (Circuit Breaking Device)
  // Bellico Mobile.
  o211005: Object.freeze({ clarao: 'giro' }), // Feixe Clone Duplo (Double Clone Beam)
  o212024: Object.freeze({ clarao: 'preso', carga: Object.freeze({ v0: 0.5, vmax: 0.7, acel: 0.0003 }) }), // Feixe de Faísca Perfurante
  o212005: Object.freeze({ clarao: 'preso', fim: 'area', carga: Object.freeze({ v0: 0, vmax: 0.5, acel: 0.0003 }) }), // Canhão em Fila (Array Cannon)
  o212013: Object.freeze({ clarao: 'preso', fim: 'area', carga: Object.freeze({ v0: 0, vmax: 0.5, acel: 0.0003 }) }), // Canhão Revelador
  o212022: Object.freeze({ clarao: 'preso', fim: 'area', carga: Object.freeze({ v0: 0, vmax: 0.5, acel: 0.0003 }) }), // Canhão Anticadência
  o212023: Object.freeze({ clarao: 'preso', fim: 'area', carga: Object.freeze({ v0: 0, vmax: 0.5, acel: 0.0003 }) }), // Canhão Redutor de Energia
  o212025: Object.freeze({ clarao: 'preso', fim: 'area', carga: Object.freeze({ v0: 0, vmax: 0.5, acel: 0.0003 }) }), // Canhão Consumidor
  o212010: Object.freeze({ clarao: 'preso', carga: Object.freeze({ v0: -0.05, vmax: 0.4, acel: 0.0002 }) }), // Míssil Quebra-Escudo
  o212004: Object.freeze({ clarao: 'preso', fim: 'area' }), // Armadilha Tempestade (Storm Trap)
  o212006: Object.freeze({ clarao: 'preso', carga: Object.freeze({ v0: 0.5, vmax: 0.5, acel: -0.0002 }) }), // Armadilha Atiradora (Rifle Trap)
  o212014: Object.freeze({ clarao: null }), // Arrancada (Instant Acceleration Device)
  o212027: Object.freeze({ clarao: 'giro' }), // Rifle Perfurante (Piercing Rifle)
  o212028: Object.freeze({ clarao: 'giro', carga: Object.freeze({ v0: 0.2, vmax: 0.5, acel: 0.0015 }) }), // Onda de Choque Frontal
  o212029: Object.freeze({ clarao: 'giro', carga: Object.freeze({ v0: 0, vmax: 0.45, acel: 0.00055 }) }), // Míssil de Cruzeiro
  o212032: Object.freeze({ clarao: 'preso', carga: Object.freeze({ v0: 0, vmax: 0.45, acel: 0.00055 }) }), // Míssil de Choque
  o212033: Object.freeze({ clarao: 'preso' }), // Armadilha de Magma (Magma Trap)
  // Bellico Functional.
  o211003: Object.freeze({ clarao: 'giro', fim: 'area' }), // Feixe Tempestade de Magma (MagmaStorm Beam)
  o212021: Object.freeze({ clarao: 'preso', fim: 'area', carga: Object.freeze({ v0: 0, vmax: 0.5, acel: 0.0003 }) }), // Canhão Antiparalisia
  o212007: Object.freeze({ clarao: 'preso', carga: Object.freeze({ v0: -0.05, vmax: 0.4, acel: 0.0002 }) }), // Míssil Perfurante em Leque
  o212026: Object.freeze({ clarao: 'preso', fim: 'area', carga: Object.freeze({ v0: 0.25, vmax: 0.25, acel: -0.00002 }) }), // Raio de Faísca Perfurante
  o212009: Object.freeze({ clarao: null }), // Amortecedor (Shock Reducing Device)
  o212015: Object.freeze({ clarao: null }), // Nova Trava-Aceleração (Acceleration Paralysis Nova)
  o212030: Object.freeze({ clarao: 'giro', carga: Object.freeze({ v0: 0.11, vmax: 0.5, acel: 0.00001 }) }), // Onda de Choque Elétrica
  o212034: Object.freeze({ clarao: 'preso', fim: 'area' }), // Vulcan Tempestade Teleguiada
  o212017: Object.freeze({ clarao: 'preso', carga: Object.freeze({ v0: 0, vmax: 0.5, acel: 0.0002 }) }), // Druida Reparador (Repair Druid)
  // Shrewdo Assault.
  o311002: Object.freeze({ clarao: 'giro' }), // Feixe Perfurante em Fila (Piercing Array Beam)
  o311008: Object.freeze({ clarao: 'giro' }), // Feixe Triplo (3way Rifle Beam)
  o312019: Object.freeze({ clarao: 'giro' }), // Feixe Teleguiado em Leque (Homing Sector Beam)
  o311005: Object.freeze({ clarao: 'preso' }), // Vulcan de Sopro (Vulkan Blow Gun)
  o311006: Object.freeze({ clarao: 'preso' }), // Metralha Giratória (Array Spin Gun)
  o311009: Object.freeze({ clarao: 'preso' }), // Metralha Trovão (Array Thunder Gun)
  o311010: Object.freeze({ clarao: 'preso' }), // Vulcan em Leque (Vulkan Sector Gun)
  o312001: Object.freeze({ clarao: 'preso', fim: 'area', carga: Object.freeze({ v0: 0, vmax: 0.5, acel: 0.0003 }) }), // Canhão Tempestade em Leque
  o312022: Object.freeze({ clarao: 'preso', fim: 'area', carga: Object.freeze({ v0: 0, vmax: 0.5, acel: 0.0003 }) }), // Canhão Antirradar
  o312012: Object.freeze({ clarao: 'preso', fim: 'area', carga: Object.freeze({ v0: 0, vmax: 0.5, acel: 0.0003 }) }), // Canhão Quebra-Resistência
  o312018: Object.freeze({ clarao: 'preso', carga: Object.freeze({ v0: -0.05, vmax: 0.4, acel: 0.0002 }) }), // Míssil Giratório (Homing Spin Missile)
  o312007: Object.freeze({ clarao: 'preso' }), // Campo de Energia (Energy Field Trap)
  o317020: Object.freeze({
    clarao: 'preso',
    fim: 'area',
    carga: Object.freeze({ v0: 0.2, vmax: 0.2, acel: -0.00005 }),
    cargaSub: Object.freeze({ 2: Object.freeze({ v0: 0.2, vmax: 0.2, acel: -0.0001 }) }),
  }), // Armadilha de Raios Reforçada (Reinforced EnergyBolt Trap)
  o312006: Object.freeze({ clarao: null }), // Reforço de Escudo (Shield Reinforcing Device)
  o312014: Object.freeze({ clarao: null }), // Camuflagem (Cloak Device)
  o312017: Object.freeze({ clarao: null }), // Invulnerabilidade (Invulnerability Device)
  o312029: Object.freeze({ clarao: null }), // Nova Desarmadora (Trap Removing Nova)
  o312034: Object.freeze({ clarao: null }), // Disjuntor (Circuit Breaking Device)
  o312039: Object.freeze({ clarao: 'giro' }), // Feixe Teleguiado em Fila (Array Homing Beam)
  // Shrewdo Mobile.
  o311007: Object.freeze({ clarao: 'giro' }), // Feixe de Magma (Force Magma Beam)
  o314009: Object.freeze({ clarao: 'preso' }), // Rifle Trovão (Rifle Thunder Gun)
  o312004: Object.freeze({ clarao: 'preso', fim: 'area', carga: Object.freeze({ v0: 0, vmax: 0.6, acel: 0.0009 }) }), // Canhão Quebra-Escudo Rápido
  o312015: Object.freeze({ clarao: 'preso', fim: 'area', carga: Object.freeze({ v0: 0, vmax: 0.5, acel: 0.0003 }) }), // Canhão Revelador (Cloak Sensing Cannon)
  o312009: Object.freeze({ clarao: 'preso', fim: 'area', carga: Object.freeze({ v0: 0, vmax: 0.5, acel: 0.0003 }) }), // Canhão Freio (SpeedTrap Cannon)
  o312024: Object.freeze({ clarao: 'preso', fim: 'area', carga: Object.freeze({ v0: 0, vmax: 0.5, acel: 0.0003 }) }), // Canhão Desgoverno (Control Disturbing Cannon)
  o312013: Object.freeze({ clarao: 'preso', carga: Object.freeze({ v0: -0.05, vmax: 0.4, acel: 0.0002 }) }), // Míssil Enfraquecedor
  o312008: Object.freeze({
    clarao: 'preso',
    carga: Object.freeze({ v0: 0.2, vmax: 0.2, acel: -0.0002 }),
    cargaSub: Object.freeze({ 2: Object.freeze({ v0: 0.2, vmax: 0.3, acel: 0.0001 }) }),
  }), // Armadilha Teleguiada (Homing Trap)
  o312020: Object.freeze({
    clarao: 'preso',
    fim: 'area',
    carga: Object.freeze({ v0: 0.2, vmax: 0.2, acel: -0.00005 }),
    cargaSub: Object.freeze({ 2: Object.freeze({ v0: 0.2, vmax: 0.2, acel: -0.0001 }) }),
  }), // Armadilha de Raios (EnergyBolt Trap)
  o312031: Object.freeze({ clarao: 'preso' }), // Campo Magnético (Magnetic Field Trap)
  o312016: Object.freeze({ clarao: null }), // Acelerador (Acceleration Device)
  o312037: Object.freeze({ clarao: 'preso', carga: Object.freeze({ v0: 0, vmax: 0.4, acel: 0.0002 }) }), // Míssil Carga Elétrica (ChargeBolt Missile)
  o312040: Object.freeze({ clarao: null }), // Campo de Plasma (Plasma Field)
  o312030: Object.freeze({ clarao: 'preso', fim: 'area' }), // Raio Rastreador (Tracking Bolt)
  o312035: Object.freeze({ clarao: 'preso' }), // Rifle Shrewdo (ShrewdoBlow Rifle)
  o312036: Object.freeze({ clarao: 'preso', carga: Object.freeze({ v0: 0, vmax: 0.4, acel: 0.0002 }) }), // Míssil Giratório T2
  // Shrewdo Functional.
  o311003: Object.freeze({ clarao: 'giro', fim: 'area' }), // Feixe Clone Tempestade (Clone Storm Beam)
  o311032: Object.freeze({ clarao: 'preso' }), // Rifle de Magma (Magma Rifle Gun)
  o314001: Object.freeze({ clarao: 'preso', fim: 'area', carga: Object.freeze({ v0: 0, vmax: 0.5, acel: 0.0003 }) }), // Canhão Tempestade (Rifle Storm Cannon)
  o312003: Object.freeze({ clarao: 'preso', fim: 'area', carga: Object.freeze({ v0: 0, vmax: 0.5, acel: 0.0003 }) }), // Canhão Paralisante
  o312010: Object.freeze({ clarao: 'preso', carga: Object.freeze({ v0: -0.05, vmax: 0.4, acel: 0.0002 }) }), // Míssil Paralisante (Lock-Down Missile)
  o312023: Object.freeze({ clarao: 'parado', carga: Object.freeze({ v0: -0.05, vmax: 0.4, acel: 0.0002 }) }), // Míssil Descarga Dupla
  o312005: Object.freeze({ clarao: null }), // Reparador de Escudo (Shield Recovering Device)
  o312021: Object.freeze({ clarao: 'preso', claraoSub: 'parado' }), // Lançador de Metralha (Case Shot Launcher)
  o312025: Object.freeze({ clarao: 'preso', carga: Object.freeze({ v0: -0.05, vmax: 0.4, acel: 0.0002 }) }), // Druida Reparador (Repair Druid)
  o312028: Object.freeze({ clarao: null }), // Nova Antiparalisia (Paralysis Removing Nova)
  o312033: Object.freeze({ clarao: null }), // Nova Recarrega-Escudo (Shield Recharging Nova)
  o312038: Object.freeze({ clarao: 'giro' }), // Feixe Elétrico Duplo (Array Bolt Beam)
});

/**
 * Camuflagem na nave (CUnit::RenderScene com o estado +0x99, o PILOT_STATE_FLAG 0x1c
 * que o código 27 liga): quem pode ver a nave (o próprio time, ou o inimigo com a
 * camuflagem revelada) a vê com o próprio casco e as armas, no material de difusa
 * branca e alfa 0,3; o inimigo que não a revela não a desenha.
 */
export const ALFA_CAMUFLADA = 0.3;

/**
 * Estados da nave com efeito do original preso nela (`fx` do servidor → efeito da
 * tabela do CUnit::LoadResource), desenhados na matriz da nave e repetindo enquanto o
 * estado dura: o conversor de impacto (24, 1163023), a resistência elétrica do Disjuntor
 * (23, 2163033), a óptica da Tenda de Luz (21, 2163012), a física do Amortecedor (22,
 * 2163013), a Invulnerabilidade (20, 1163039: código 102 → PILOT_STATE_FLAG 0x2d →
 * CUnitState[0x15] → piloto +0xa9), o Reforço de Escudo (15, 2163004: o código 4 liga
 * o PILOT_STATE_FLAG 0, o reparo do escudo, e o 2 → CUnitState[1] → piloto +0x95) e o
 * Campo de Plasma (24, 1163023, o mesmo do conversor: o código 1021 liga o
 * PILOT_STATE_FLAG 0x33, que CMyPilot::OnStateFlagStart transforma na proteção de v% do
 * HP máximo em +0x448, e FillUnitState acende o CUnitState[0x1e] enquanto ela for > 0;
 * o `fx` 'escudo' do servidor também só vale com a proteção de pé).
 */
export const ESTADOS_NA_NAVE = Object.freeze({
  converte: '1163023',
  escudo: '1163023',
  resEl: '2163033',
  resOp: '2163012',
  resFis: '2163013',
  invul: '1163039',
  reforco: '2163004',
});

/**
 * Os efeitos do original presos na nave para os estados ativos `fx`, cada um uma vez:
 * o Conversor de Impacto e o Campo de Plasma ligam o mesmo CUnitState[0x1e] (o efeito
 * 24, 1163023), então os dois juntos desenham um só.
 */
export function efeitosNaNave(fx) {
  const ids = new Set();
  for (const k of fx ?? []) if (ESTADOS_NA_NAVE[k]) ids.add(ESTADOS_NA_NAVE[k]);
  return [...ids];
}

/**
 * As faíscas do Amplificador de Energia (código 32 → PILOT_STATE_FLAG 0x16 →
 * CUnitState[3] → piloto +0x97 → CUnit::EffectHERecovery a cada quadro desenhado): 1
 * chance em 4 (`rand() & 3`) de um CUnitHyperEnergyRecovery, o quadrado `modelo` (15 u,
 * textura 1163014) virado para a câmera, que nasce `recuo` × o raio da nave atrás do
 * centro dela, anda a `arrasto` da velocidade que a nave tinha, sobe (subidaDaFaisca),
 * gira na tela (giroDaFaisca) e some pela alfa em `quadros` quadros (alfaDaFaisca). O
 * passo (CCode::Run) é o quadro desenhado.
 */
export const ENERGIA_REC = Object.freeze({ modelo: '1163014', chance: 4, quadros: 20, recuo: 0.5, arrasto: 0.2 });

/** Quanto (u do original por quadro) a faísca do Amplificador sobe: (rand() % 20) / 10 + 2, de um sorteio em [0, 1). */
export function subidaDaFaisca(r) {
  return Math.floor(r * 20) / 10 + 2;
}

/** Quanto (rad por quadro) a faísca do Amplificador gira na tela: ((rand() % 10) − 20) / 200, de um sorteio em [0, 1). */
export function giroDaFaisca(r) {
  return (Math.floor(r * 10) - 20) / 200;
}

/** Alfa da faísca do Amplificador `n` quadros depois de nascer (1 − n / 20), ou null quando ela já sumiu. */
export function alfaDaFaisca(n) {
  return n >= ENERGIA_REC.quadros ? null : 1 - n / ENERGIA_REC.quadros;
}

/**
 * Os motores acendem o turbo? O boost, ou a Arrancada ligada (`fx` 'acel': código 28 →
 * PILOT_STATE_FLAG 0x12 → CUnitState[7] → piloto +0x9b, que o CUnit::RenderPropulsion
 * lê para trocar o efeito dos dois motores principais pelo do turbo).
 */
export function turboNaNave(boost, fx) {
  return !!boost || !!fx?.includes('acel');
}

/**
 * O reparo do escudo (CUnit::EffectShieldRecovery e CUnitShieldRecoveryQuantum), pela
 * raça (o BROOD_TYPE da nave): a cada quadro desenhado, 1 chance em 4 (`rand() & 3`) de
 * soltar um quantum (`quantum`: o efeito com o giro da nave, que toca uma vez e fica no
 * último quadro, pois o OnStateEnd dele é o do CBaseEffect, vazio) numa direção ao acaso
 * (cada eixo rand() % 20 − 10, normalizado), que se afasta da nave até `distancia` m do
 * original em 1 / `passo` quadros (0,04 por quadro, 24 por segundo) seguindo a posição
 * dela; ao chegar, some e acende a esfera (`esfera`, CUnitSphereEffect) no centro da
 * nave, com o x virado para aquela direção, seguindo a posição dela, uma vez.
 */
export const ESCUDO_REC = Object.freeze({
  acron: Object.freeze({ quantum: '1163005_01', esfera: '1163005_02' }),
  bellico: Object.freeze({ quantum: '1163004_01', esfera: '1163004_02' }),
  shrewdo: Object.freeze({ quantum: '1163003_01', esfera: '1163003_02' }),
  chance: 4,
  distancia: 20,
  passo: 0.04,
});

/** m por unidade do original dos efeitos do disparo (a escala das naves). */
export const ESCALA_DISPARO = FATOR_TAMANHO_NAVE;
/** Passos do giro do clarão no modo 14: rand() % 10, cada um de 0,6283 rad (36°). */
export const GIRO_PASSOS = 10;
export const GIRO_PASSO = 0.6283185482025146;
/** Fração do raio do alvo onde o impacto aparece (ProcessDamage: raio × 0,85). */
export const IMPACTO_NO_CASCO = 0.85;
/**
 * Raio (unidades do original) dos efeitos que o original estica pela área: o fim no
 * modo 7, o clarão no modo 2 e a esfera que cresce (tipo 17); a escala é o raio / 100.
 */
export const RAIO_AREA_ORIGINAL = 100;
/** O servidor disse que o tiro acabou antes de a vida dele acabar por mais que isto (s): bateu em algo. */
export const FOLGA_FIM_S = 0.1;
/** Campos do golpe (`vis` do catálogo) que o disparo usa: clarão, projétil, impacto, fim, armadilha e rastro do míssil. */
export const CAMPOS_DISPARO = Object.freeze(['d', 'p', 'i', 'f', 'a', 'r']);

/** Como o original desenha a arma `kind` ({ clarao, fim?, carga?, claraoSub? }), ou null se ela não é desenhada como lá. */
export function disparoOriginal(kind) {
  return DISPARO_ORIGINAL[kind] ?? null;
}

/**
 * A curva do original (colunas 64 a 66) do golpe `prof` da arma `kind`: a do disparo
 * (`carga`) ou a de um subprojétil (`cargaSub`: o raio que a Armadilha de Raios atira),
 * ou null quando ele voa constante.
 */
export function cargaDoGolpe(kind, prof = 0) {
  const como = DISPARO_ORIGINAL[kind];
  if (!como) return null;
  return (prof ? como.cargaSub?.[prof] : como.carga) ?? null;
}

/**
 * O efeito que a armadilha `g` mostra parada (CUnitBeam::ProcessNonActiveTrap): a que
 * ativa na hora (coluna 99 = 0) troca já no primeiro quadro para o gráfico ativo
 * (coluna 105, `a`), quando tem; a que espera inimigo perto (`ativaPerto`) fica com o
 * próprio projétil (coluna 57, `p`): ao ativar ela atira e some no mesmo quadro.
 */
export function graficoDaArmadilha(g) {
  if (!g?.vis) return null;
  return (g.ativaPerto ? g.vis.p : (g.vis.a ?? g.vis.p)) ?? null;
}

/** O golpe e os subprojéteis dele (divide e dispara), do disparo para dentro. */
function golpeESubs(g) {
  const lista = [];
  for (let x = g; x; x = x.divide ?? x.dispara ?? null) lista.push(x);
  return lista;
}

/**
 * Os efeitos do original (ids) que o disparo dessas armas usa, em todas as versões (com
 * os dos subprojéteis), e os dos estados na nave dos dispositivos. O de fim só nas de
 * `fim` (o da V8 do Feixe Perfurante de Magma tem área 0 no original e não aparece).
 */
export function efeitosDoDisparo() {
  const ids = new Set();
  for (const [kind, como] of Object.entries(DISPARO_ORIGINAL)) {
    for (const v of WEAPONS[kind].versoes) {
      for (const g of golpeESubs(v.golpe)) {
        for (const c of CAMPOS_DISPARO) if (g.vis?.[c] && (c !== 'f' || como.fim)) ids.add(g.vis[c]);
      }
    }
    if (como.teleporte) ids.add(como.teleporte);
  }
  for (const id of Object.values(ESTADOS_NA_NAVE)) ids.add(id);
  ids.add(ENERGIA_REC.modelo);
  for (const r of ['acron', 'bellico', 'shrewdo']) ids.add(ESCUDO_REC[r].quantum).add(ESCUDO_REC[r].esfera);
  return [...ids];
}

/** O golpe `g` explode no fim da vida (coluna 74, 6º dígito '2'): o impacto no ponto, como no chão? */
export function explodeNoFim(g) {
  return !!g?.fim;
}

/**
 * Quantos m (do original) o quantum do reparo do escudo está longe do centro da nave
 * `quadros` quadros (24 por segundo) depois de sair; null quando ele já chegou (e vira
 * a esfera).
 */
export function quantumDoEscudo(quadros) {
  const t = quadros * ESCUDO_REC.passo;
  return t > 1 ? null : ESCUDO_REC.distancia * t;
}

/** A direção ao acaso do quantum (cada eixo rand() % 20 − 10, normalizado), de três sorteios em [0, 1). */
export function direcaoDoQuantum(r1, r2, r3) {
  const [x, y, z] = [r1, r2, r3].map((r) => Math.floor(r * 20) - 10);
  const n = Math.hypot(x, y, z);
  return n > 0 ? { x: x / n, y: y / n, z: z / n } : { x: 1, y: 0, z: 0 };
}

/**
 * O rastro do míssil (CUnitMissileTail::RenderScene): qual das `historico` matrizes
 * guardadas (0 = a de agora, uma por quadro do original) puxa o osso `k` (0 = Bone01)
 * de um rastro de `ossos` ossos. O primeiro fica no míssil, o último na mais velha e os
 * do meio em (historico − 1) × k / ossos + 1 (divisão inteira, como lá).
 */
export function quadroDoOsso(k, ossos, historico) {
  if (k <= 0) return 0;
  if (k >= ossos - 1) return historico - 1;
  return Math.floor(((historico - 1) * k) / ossos) + 1;
}

/** O golpe `g` é um projétil que atravessa quem acerta (o desenho segue depois do impacto)? */
export function atravessa(g) {
  return !!g && g.forma === 'projetil' && !!g.atravessa;
}

/** Giro (rad) do clarão em volta do cano: no modo 'giro', um dos 10 passos de 36° (`r` sorteado em [0, 1)); nos outros, 0. */
export function giroDoClarao(modo, r) {
  return modo === 'giro' ? Math.min(GIRO_PASSOS - 1, Math.floor(r * GIRO_PASSOS)) * GIRO_PASSO : 0;
}

/**
 * Onde o desenho do tiro `b` nasce: a boca da arma mais o deslocamento de lado do
 * projétil (o mesmo que ele tem em relação à nave, de rumo `nave.yaw`, no ponto
 * `nave.x`, `nave.z`), na altura do tiro. Assim os projéteis paralelos saem espalhados
 * em volta da boca, como no original, e não todos do mesmo ponto.
 */
export function inicioDoTiro(b, boca, nave) {
  const f = forward(nave.yaw);
  const lado = (b.x - nave.x) * -f.z + (b.z - nave.z) * f.x;
  return { x: boca.x - f.z * lado, y: b.y, z: boca.z + f.x * lado };
}

/**
 * Ponto do impacto no casco do alvo: o centro mais o rumo do centro para `de` (onde o
 * tiro estava), no plano, × raio × 0,85, na altura do centro. Sem `de` (ou em cima do
 * centro), o próprio centro.
 */
export function pontoDoImpacto(centro, raio, de) {
  const dx = de ? de.x - centro.x : 0;
  const dz = de ? de.z - centro.z : 0;
  const d = Math.hypot(dx, dz);
  if (!(d > 1e-6) || !(raio > 0)) return { x: centro.x, y: centro.y, z: centro.z };
  const k = (raio * IMPACTO_NO_CASCO) / d;
  return { x: centro.x + dx * k, y: centro.y, z: centro.z + dz * k };
}

/**
 * O tiro `b` (o estado no cliente) acabou antes da hora no ponto (x, z) que o servidor
 * mandou (bateu no chão, numa construção, no campo de força)? Falso quando ele só
 * chegou ao fim da vida (o cliente anda um pouco atrás do servidor).
 */
export function acabouAntes(b, x, z) {
  const v = Math.hypot(b.vx, b.vz);
  if (!(v > 0)) return false;
  const frente = ((x - b.x) * b.vx + (z - b.z) * b.vz) / v;
  return frente < (b.vida - FOLGA_FIM_S) * v;
}

/** Escala (m por unidade do original) do efeito que o original estica pela área (modos 7 e 2, tipo 17) numa área de `raio` m. */
export function escalaDaArea(raio) {
  return raio / RAIO_AREA_ORIGINAL;
}

/**
 * Distância (m do original) que o projétil de `carga` andou em `ms` ms: acelera de v0
 * até vmax e segue; o que freia (aceleração negativa) cai sem limite por baixo, como no
 * MoveBullet do original.
 */
function andouNoOriginal(ms, { v0, vmax, acel }) {
  if (!(acel > 0)) return v0 * ms + (acel * ms * ms) / 2;
  const ate = Math.max(0, (vmax - v0) / acel);
  if (ms <= ate) return v0 * ms + (acel * ms * ms) / 2;
  return v0 * ate + (acel * ate * ate) / 2 + vmax * (ms - ate);
}

/**
 * Quanto (m) o desenho do projétil que acelera fica atrás do tiro do jogo, que voa a
 * velocidade média do golpe `g` (vel em m/s, vida em s): a fração do caminho que o
 * original já andou na `idade` (s) do tiro, sobre o caminho inteiro. Começa e termina
 * em 0 (sai da boca e chega junto ao fim da vida); negativo no que freia (o desenho
 * vai na frente no começo).
 */
export function recuoDaCarga(idade, g, carga) {
  const vida = g.vida;
  if (!(vida > 0) || !(g.vel > 0)) return 0;
  const t = Math.min(Math.max(idade, 0), vida);
  const caminho = g.vel * vida;
  const fracao = andouNoOriginal(t * 1000, carga) / andouNoOriginal(vida * 1000, carga);
  return g.vel * t - caminho * fracao;
}
