// A aba "Como Jogar" em inglês (shared/idioma.js): os mesmos capítulos de
// como-jogar-regras.js, na mesma ordem e com os mesmos blocos, ícones, ações e
// números (FATOS), só o texto traduzido. Mudou um capítulo lá, mude aqui também
// (tests/como-jogar.test.mjs compara a estrutura das duas versões).
//
// Recebe os FATOS, o relogio e o começo da fase final de como-jogar-regras.js (para
// não fazer ciclo de import).

/** Os capítulos em inglês. */
export function capitulosEn(F, relogio, minFinal) {
  return [
    {
      id: 'objetivo',
      titulo: 'How to win',
      curto: 'The goal of the match',
      min: 1,
      resumo: `Two teams of ${F.porTime} pilots. In ${F.duracaoS / 60} minutes, **the team with the most Helium-3 ore** in its base basin wins. You do not mine: **you protect your miners and shoot down the enemy's**.`,
      blocos: [
        {
          tipo: 'cartoes',
          itens: [
            { icone: 'minerio', titulo: 'Ore decides', texto: 'The score in the top right corner shows the ore of each team. It is the only number that counts at the end.', cor: 'objetivo' },
            { icone: 'escudo', titulo: 'Protect yours', texto: `${F.mineradoresPorTime} miners of your team go to the mining plant in the center and back, on their own. Each delivered trip adds ${F.cargaMinerador} to the score.`, cor: 'neon' },
            { icone: 'alvo', titulo: 'Take down theirs', texto: 'A destroyed enemy miner delivers nothing, and what it carried is lost. It is the play that changes the score the most.', cor: 'inimigo' },
            { icone: 'estrela', titulo: 'Get stronger', texto: 'Monsters, kills and objectives give gold and XP. With them you buy weapons and equipment and evolve your ship.', cor: 'xp' },
          ],
        },
        {
          tipo: 'tempo',
          titulo: 'The pace of the match',
          itens: [
            { t: `−${relogio(F.preparacaoS)}`, texto: `**Preparation.** Nothing leaves and nobody mines: explore the map, buy at the Shop with the ${F.ouroInicial} starting gold and plan with your team.` },
            { t: relogio(F.acampamentoS), texto: '**Started.** The miners leave the base and the jungle monsters spawn.' },
            { t: relogio(F.ataqueS), texto: 'The **SN-4** (attack buff) and the **communication tower** (support buff) wake up.' },
            { t: relogio(F.plataformaS), texto: 'The **gold platforms** light up.' },
            { t: relogio(F.sondaS), texto: 'The **wandering probe** passes through the central column.' },
            { t: relogio(F.medusaS), texto: 'The **Ancient Medusa** rises from the water in the lower pit.' },
            { t: relogio(F.nucleoS), texto: 'The **He-3 Core** appears in the upper pit: the biggest objective of the match.' },
            { t: minFinal, texto: `**Final phase:** all delivered ore is worth ×${F.multFaseFinal} until the end.` },
            { t: relogio(F.duracaoS), texto: '**End.** More ore wins (a draw is possible). After the results screen another match starts, from scratch.' },
          ],
        },
        {
          tipo: 'dica',
          texto: 'Killing pilots **does not score points**: it opens the way. A team that only hunts ships and leaves the lane empty loses on ore.',
        },
      ],
      praticar: { modo: 'privada', texto: 'Play a whole match against the computers, with no rush.' },
    },
    {
      id: 'pilotar',
      titulo: 'Flying the ship',
      curto: 'Flight, shooting and controls',
      min: 1,
      resumo: 'The ship flies low, 10 m above the water, and the camera stays behind it. **Two weapons**, one on [[armaZ]] and the other on [[armaX]], use the same **energy** as the boost: fire in bursts and let the energy come back.',
      blocos: [
        {
          tipo: 'teclas',
          titulo: 'Flight',
          itens: [
            { acoes: ['frente', 're', 'esq', 'dir'], texto: 'Accelerate, reverse and turn. Rock blocks you: go around it.' },
            { acoes: ['boost'], texto: 'Boost (hold). It uses energy; when it runs out, it locks until you release it.' },
            { acoes: ['pouso'], texto: 'Land and take off, only on landing areas. Landed, the ship repairs faster but cannot fire.' },
            { acoes: ['recall'], texto: `Back to base in ${F.recallS} s, standing still. Taking damage, firing or boosting cancels it.` },
          ],
        },
        {
          tipo: 'teclas',
          titulo: 'Weapons and items',
          itens: [
            { acoes: ['armaZ', 'armaX'], texto: 'Fires the weapon of each slot. Each one has its own cooldown.' },
            { acoes: ['trocaZ', 'trocaX'], texto: 'Quick swap: puts in the slot the weapon stored in the Q or E slot of the inventory.' },
            { acoes: ['reparo', 'energia'], texto: 'Repair kit (health) and energy cell, bought at the Shop.' },
          ],
        },
        {
          tipo: 'teclas',
          titulo: 'Camera and windows',
          itens: [
            { acoes: ['camCima', 'camBaixo'], texto: 'Higher or lower camera (the mouse wheel too).' },
            { acoes: ['tabela'], texto: 'Match scoreboard (hold): everyone\'s KDA, farm and items.' },
            { acoes: ['status', 'inventario'], texto: 'STATUS (pilot points) and INVENTORY (the ship parts).' },
            { acoes: ['opcoes', 'comandos'], texto: 'Match options and the list of all commands.' },
          ],
        },
        {
          tipo: 'p',
          texto: 'Landed and stopped on the ring of **your base**, the ship refills health and energy in about 3 seconds. It is the place to recover after a fight.',
        },
        {
          tipo: 'dica',
          texto: 'Every key can be changed in **Settings › Controls**, and the controller (joystick) works too. The keys in this guide are already yours.',
        },
      ],
      praticar: { modo: 'sandbox', texto: 'Fly freely in a world of your own, with no clock and gold on hand.' },
    },
    {
      id: 'mapa',
      titulo: 'The map: Helium-3 Lake',
      curto: 'Bases, lane, jungle and towers',
      min: 2,
      resumo: 'Your team spawns at one end of the **lane**, the enemy at the other, and the **mining plant** sits in the middle. Above and below is the **jungle**, with monsters, gas clouds and the two epic objectives. Hover the map to see each piece.',
      blocos: [
        { tipo: 'mapa' },
        {
          tipo: 'cartoes',
          itens: [
            { icone: 'base', titulo: 'Base and force field', texto: 'At the mouth of each base there is a force field: your team passes, but **an enemy ship that touches it explodes** and no shot goes through. Inside are the Shop, the Evolution and the ore basin.', cor: 'neon' },
            { icone: 'mineradora', titulo: 'Lane and mining plant', texto: 'The lane is the straight path of the miners. The mining plant, in the center, is solid: it blocks passage, shots and vision. Each team has its dock in a hangar that only its own miner goes through.', cor: 'objetivo' },
            { icone: 'torre', titulo: 'Sentry towers', texto: `Four per team, ${F.alcanceTorre} m range (the longest in the game). The homing missile hits harder with each consecutive shot on the same target: **do not stay alone in range** of the enemy tower.`, cor: 'inimigo' },
            { icone: 'monstro', titulo: 'Jungle', texto: 'Monster camps above and below. They only attack whoever provokes them, and they do not leave their territory.', cor: 'xp' },
            { icone: 'nuvem', titulo: 'Gas clouds', texto: 'You can fly inside them, and whoever is there stays hidden from those outside. Good for ambushes.', cor: 'laser' },
            { icone: 'poco', titulo: 'Pits', texto: 'The upper pit holds the He-3 Core, the lower one the Ancient Medusa. Each one has three entrances.', cor: 'evolucao' },
          ],
        },
        {
          tipo: 'p',
          titulo: 'Fog of war',
          texto: `You only see what your team sees: each ship sees ${F.visao} m, and rock and the mining plant cut the vision. What nobody on the team sees stays dark, on the screen and on the minimap. An enemy disappears behind the rock? They may be waiting for you.`,
        },
      ],
      praticar: { modo: 'sandbox', texto: 'Take a tour of the map with nobody shooting at you.' },
    },
    {
      id: 'mineradores',
      titulo: 'Miners and ore',
      curto: 'What decides the score',
      min: 1,
      resumo: 'The miners make the trip from the base to the mining plant and back on their own. **Escort yours along the lane and hunt the enemy\'s**, preferably on the way back, full of ore.',
      blocos: [
        {
          tipo: 'passos',
          titulo: 'A miner\'s trip',
          itens: [
            'It leaves the basin of your base, one at a time.',
            'It flies in a straight line along the lane to the door of the team hangar, in the mining plant.',
            'It goes in and mines. **Inside the hangar nobody can reach it**: the door field stops ships and shots.',
            'It comes back loaded along the same lane. This is when it is most valuable to the enemy.',
            `It unloads the cargo in the base basin: **+${F.cargaMinerador} ore** for the team.`,
          ],
        },
        {
          tipo: 'cartoes',
          itens: [
            { icone: 'escudo', titulo: 'Escorts', texto: 'Three armed ships follow each team\'s convoy and shoot whoever comes close. Take down the escort before hunting.', cor: 'neon' },
            { icone: 'evolucao', titulo: 'Upgrade the convoy', texto: 'In the Evolution, any pilot can pay for more miners, hull, armor and engine for the whole team.', cor: 'evolucao' },
            { icone: 'nucleo', titulo: 'Core wave', texto: `Whoever takes the He-3 Core releases ${F.ondaNucleo} giant miners with ${F.minerioOndaNucleo} ore each. Escort yours; hunt the enemy's.`, cor: 'objetivo' },
          ],
        },
        {
          tipo: 'dica',
          texto: `In the final phase (from ${minFinal} on) each delivery is worth ×${F.multFaseFinal}. A whole convoy saved or lost in these minutes turns the match.`,
        },
      ],
      praticar: { modo: 'privada', texto: 'Watch the convoys moving in a match against the computers.' },
    },
    {
      id: 'combate',
      titulo: 'Combat',
      curto: 'Damage, shield and death',
      min: 2,
      resumo: 'Damage comes **out of the shield first** and then out of health. Each weapon has a type, **Ph.** (physical), **Op.** (optical, laser) or **El.** (electric), and each type has its own resistance. Dying costs time: the respawn grows with your level and with the match.',
      blocos: [
        {
          tipo: 'cartoes',
          itens: [
            { icone: 'escudo', titulo: 'Shield and health', texto: 'The shield (blue bar above health) holds the damage and recharges by itself, even while being hit. When it runs out, the damage goes to health.', cor: 'escudo' },
            { icone: 'raio', titulo: 'Damage types', texto: 'Armor, shield and enhancers give resistance to a type. Look at the color of the enemy\'s name: it shows what they are protected against.', cor: 'laser' },
            { icone: 'alvo', titulo: 'Critical and effects', texto: 'Each weapon has a critical chance (damage ×2). Some paralyze, slow down, drain energy or stop the target from firing.', cor: 'ouro' },
            { icone: 'time', titulo: 'No friendly fire', texto: 'Your shots pass through allies and your team\'s miners. At the base, the safe zone protects only the owner team.', cor: 'neon' },
          ],
        },
        {
          tipo: 'p',
          titulo: 'Kills',
          texto: 'Taking down an enemy pilot gives gold and XP by their level. Whoever helped in the last 10 s gets an **assist**. Ending the streak of someone killing without dying pays a bonus. The announcer calls First Blood, Double Kill, Godlike…',
        },
        {
          tipo: 'teclas',
          titulo: 'After the fight',
          itens: [
            { acoes: ['morte'], texto: 'Last death summary: who hit you, how much and of what type. It opens by itself when you go down.' },
            { acoes: ['tabela'], texto: 'Scoreboard: who is strong, everyone\'s KDA and items.' },
          ],
        },
        {
          tipo: 'dica',
          texto: 'Fight close to your team. In 3 vs 3, whoever stays alone becomes the target of three.',
        },
      ],
      praticar: { modo: 'sandbox', texto: 'Test weapons and equipment freely.' },
    },
    {
      id: 'progresso',
      titulo: 'Gold, XP and level',
      curto: 'How to get stronger',
      min: 1,
      resumo: `Everyone starts with **${F.ouroInicial} gold** and earns **${F.ouroPorSegundo} per second**. The rest comes from monsters, miners, pilots and objectives. XP raises your level (up to ${F.nivelMax}): **each level refills health, shield and energy** and gives ${F.pontosPorNivel} points to put into the ship.`,
      blocos: [
        {
          tipo: 'cartoes',
          itens: [
            { icone: 'ouro', titulo: 'Where gold comes from', texto: 'Passive gold, jungle monsters, enemy miners and escorts, towers, pilots, the gold platforms and the neutral objectives.', cor: 'ouro' },
            { icone: 'estrela', titulo: 'Wing XP', texto: `When an ally takes down a monster, a miner, an escort or a tower, you also get the full XP if you are within ${F.wingRaio} m. Flying together pays off.`, cor: 'xp' },
            { icone: 'monstro', titulo: 'The jungle grows', texto: 'Every 5 minutes the camps get bigger and each monster pays more gold.', cor: 'xp' },
            { icone: 'nave', titulo: 'New ship', texto: `At levels ${F.niveisNave.join(', ')} the Evolution sells the next ship of your line: more health, energy and size.`, cor: 'evolucao' },
          ],
        },
        {
          tipo: 'teclas',
          titulo: 'Pilot points',
          itens: [
            { acoes: ['pontoHp', 'pontoEn'], texto: 'Durability (health) and Energy.' },
            { acoes: ['pontoFis', 'pontoEl', 'pontoOp'], texto: 'Power of physical, electric and laser weapons.' },
            { acoes: ['status'], texto: `The STATUS window shows what each point gives. Up to ${F.pontoMax} in each attribute.` },
          ],
        },
        {
          tipo: 'p',
          texto: 'With a free point, tabs show up above the health and energy bars: each click (or key) puts 10 points. **Put the points into the damage type of your weapons.**',
        },
        {
          tipo: 'p',
          titulo: 'Leveling up heals',
          texto: 'Each new level instantly refills the ship\'s health, shield and energy. About to level up? One last kill in the middle of the fight restores the whole ship and can turn the battle.',
        },
        {
          tipo: 'dica',
          texto: 'Gold, level, items and the bought ship belong **to the match**, as in a MOBA: in the next one, everybody starts from zero.',
        },
      ],
      praticar: { modo: 'sandbox', texto: 'In the Sandbox, the test panel gives gold, XP and levels right away.' },
    },
    {
      id: 'loja',
      titulo: 'Shop, inventory and Evolution',
      curto: 'Spending the gold',
      min: 2,
      resumo: 'To buy, **land and stop on the platform** of the Shop or the Evolution of your base ([[pouso]]): the panel opens by itself. Start with the Shop\'s **Recommended** tab.',
      blocos: [
        {
          tipo: 'cartoes',
          itens: [
            { icone: 'loja', titulo: 'Shop (pink platform)', texto: 'Weapons of your race and class, shields, armors, enhancers, repair kits and energy cells. The Recommended tab shows what is worth it for your ship.', cor: 'loja' },
            { icone: 'evolucao', titulo: 'Evolution (violet platform)', texto: 'The next ship of the line, the team miner upgrades and the towers (raising their level and rebuilding the destroyed ones).', cor: 'evolucao' },
            { icone: 'inventario', titulo: 'Inventory', texto: `The ship carries 2 weapons, 1 shield, 1 armor and 2 enhancers. The rest stays in the cargo hold (up to ${F.compartimento}). Equipping works anywhere, even by dragging the item.`, cor: 'neon' },
            { icone: 'estrela', titulo: 'Upgrading items', texto: `Each item goes from V1 to V${F.versaoMax}, with no chance of failure. Upgrading and selling only at the base, through the item box in the inventory.`, cor: 'ouro' },
          ],
        },
        {
          tipo: 'teclas',
          itens: [
            { acoes: ['inventario'], texto: 'Opens the inventory (at the Shop it opens along with it).' },
            { acoes: ['loja'], texto: 'Reopens the Shop or the Evolution, landed on the platform.' },
            { acoes: ['recall'], texto: 'Back to base to spend your gold without crossing the map.' },
          ],
        },
        {
          tipo: 'p',
          texto: `Swapping a weapon outside the base leaves that slot ${F.trocaArmaS} s without firing ("LOADING"). Inside the base, swapping is free: set up your build before leaving.`,
        },
        {
          tipo: 'dica',
          texto: 'Saved gold does not win fights. Whenever you go back to base, spend it: a new part or one more version makes a difference.',
        },
      ],
      praticar: { modo: 'sandbox', texto: 'Put builds together in the Sandbox, with the gold from the test panel.' },
    },
    {
      id: 'objetivos',
      titulo: 'Neutral objectives',
      curto: 'Buffs, Medusa and Core',
      min: 2,
      resumo: 'Spread around the jungle, the objectives give **bonuses, gold and XP** to whoever takes them. The biggest is the **He-3 Core**: whoever takes it gets a wave of giant miners.',
      blocos: [
        {
          tipo: 'cartoes',
          itens: [
            { icone: 'monstro', titulo: `SN-4 · ${relogio(F.ataqueS)}`, texto: `The attack buff boss. Whoever lands the final blow gets +${F.buffAtaquePct}% damage for ${F.buffAtaqueS} s.`, cor: 'inimigo' },
            { icone: 'torre', titulo: `Communication tower · ${relogio(F.suporteS)}`, texto: 'The support buff. Whoever takes down the tower regenerates health and energy for a while.', cor: 'laser' },
            { icone: 'ouro', titulo: `Gold platform · ${relogio(F.plataformaS)}`, texto: `Land and stay still for ${F.pousoPlataformaS} s on the golden platform: ${F.ouroPlataforma} gold for each pilot of the team. Taking damage cancels it.`, cor: 'ouro' },
            { icone: 'sonda', titulo: `Wandering probe · ${relogio(F.sondaS)}`, texto: `It runs from whoever attacks it. Shot down, it gives +${F.sondaPct}% speed for ${F.sondaBuffS} s to get around.`, cor: 'xp' },
            { icone: 'medusa', titulo: `Ancient Medusa · ${relogio(F.medusaS)}`, texto: `Epic boss of the lower pit. It pays gold and XP to each pilot of the team and +${F.medusaPct}% damage and speed to everyone for ${F.medusaBuffS / 60} minutes.`, cor: 'evolucao' },
            { icone: 'nucleo', titulo: `He-3 Core · ${relogio(F.nucleoS)}`, texto: `It does not attack, but it has a fast regenerating shield and **reflects part of the damage** to whoever hits it, split among the nearby ships. It comes back ${F.nucleoVoltaS / 60} minutes later, stronger.`, cor: 'objetivo' },
          ],
        },
        {
          tipo: 'passos',
          titulo: 'Taking the Core',
          itens: [
            'Gather the team at the entrance of the upper pit before starting.',
            'Hit it **all at the same time**: damage in small doses does not beat the shield regeneration.',
            'The reflection is split among whoever is close. Alone, you take it all and usually die.',
            `Once taken, ${F.ondaNucleo} giant miners leave your team's base, with ${F.minerioOndaNucleo} ore each: escort them to the basin.`,
          ],
        },
        {
          tipo: 'dica',
          texto: 'Your attack buff is close to one epic objective and the enemy\'s close to the other. When the enemy goes for one, go for the other.',
        },
      ],
      praticar: { modo: 'sandbox', texto: 'In the Sandbox, the Reset Core button brings the Core right away for practice.' },
    },
    {
      id: 'naves',
      titulo: 'Races, classes and ships',
      curto: 'Which ship to choose',
      min: 1,
      resumo: 'Before taking off you choose the **race** (the weapon style) and the **class** (the role of the ship). Each combination is a line of **five ships**: you start with the first and buy the others during the match.',
      blocos: [
        {
          tipo: 'cartoes',
          titulo: 'Races',
          itens: [
            { icone: 'nave', titulo: 'Acron', texto: 'Aquatic people, masters of energy waves.', cor: 'acron' },
            { icone: 'nave', titulo: 'Bellico', texto: 'Desert warriors. They hit hard and the ship **regenerates health in flight**.', cor: 'bellico' },
            { icone: 'nave', titulo: 'Shrewdo', texto: 'Ground corporations, with a stealth field.', cor: 'shrewdo' },
          ],
        },
        {
          tipo: 'cartoes',
          titulo: 'Classes',
          itens: [
            { icone: 'escudo', titulo: 'Assault · more health', texto: 'Holds the front of the fight and holds the lane.', cor: 'hp' },
            { icone: 'raio', titulo: 'Mobile · more speed', texto: 'Gets there first: hunts miners, steals objectives and escapes.', cor: 'neon' },
            { icone: 'time', titulo: 'Functional · more energy', texto: 'More energy to fire and a unique power: **allies teleport to you** through the team bar.', cor: 'en' },
          ],
        },
        {
          tipo: 'p',
          texto: 'Each ship only uses the weapons of its race and class. All of them start with the race\'s two factory weapons; the others are bought at the Shop. The **Ships** tab of the menu shows every line, with size and stats.',
        },
        {
          tipo: 'dica',
          texto: 'If in doubt, start with an Assault: the extra health forgives the mistakes of the first matches.',
        },
      ],
      praticar: { modo: 'sandbox', texto: 'Try each race and class in the Sandbox.' },
    },
    {
      id: 'primeira',
      titulo: 'Your first match',
      curto: 'Step by step',
      min: 2,
      resumo: 'A script for your first match. Follow it in order and, in the second one, you will already be deciding on your own.',
      blocos: [
        {
          tipo: 'passos',
          itens: [
            'In the **Play** tab, choose **Private Match with Bots**: 3 vs 3 against the computers, with no pressure.',
            'Choose the race and the class (an Assault is a good start) and press **Take off**.',
            `During preparation, land ([[pouso]]) at the **Shop** and buy what the Recommended tab suggests with the ${F.ouroInicial} gold.`,
            'Put the 10 points of level 1 into the damage type of your weapons ([[pontoFis]] [[pontoEl]] [[pontoOp]]).',
            'When the match starts, follow your miners along the lane or clear the camp close to your base.',
            `Gold piling up? Go back to base ([[recall]]) and spend it. At level ${F.niveisNave[0]}, buy the next ship in the Evolution.`,
            `At ${relogio(F.nucleoS)}, gather the team at the He-3 Core and hit it together.`,
            `In the final phase (${minFinal}), take down the loaded enemy miners and protect yours all the way to the basin.`,
          ],
        },
        {
          tipo: 'cartoes',
          titulo: 'Common mistakes',
          itens: [
            { icone: 'perigo', titulo: 'Staying alone at the tower', texto: 'The sentry tower hits harder with each shot. Only enter its range with your team.', cor: 'inimigo' },
            { icone: 'perigo', titulo: 'Touching the enemy field', texto: 'The enemy base force field destroys your ship instantly.', cor: 'inimigo' },
            { icone: 'perigo', titulo: 'Hitting the Core alone', texto: 'The whole reflection comes back to you.', cor: 'inimigo' },
            { icone: 'perigo', titulo: 'Forgetting the lane', texto: 'Score is ore. With nobody on the lane, your miners go down.', cor: 'inimigo' },
          ],
        },
      ],
      praticar: { modo: 'privada', texto: 'Start your first match against the computers now.' },
    },
    {
      id: 'glossario',
      titulo: 'Glossary',
      curto: 'The game terms',
      min: 1,
      resumo: 'The words you will hear (and read on the HUD) during the match.',
      blocos: [
        {
          tipo: 'glossario',
          itens: [
            { termo: 'Lane', texto: 'The straight path between the two bases, where the miners travel.' },
            { termo: 'Jungle', texto: 'The upper and lower areas of the map, with the monster camps and the objectives.' },
            { termo: 'Farm', texto: 'Taking down monsters, miners and escorts to earn gold and XP.' },
            { termo: 'Buff', texto: 'A timed bonus, like the SN-4 attack buff or the Medusa one.' },
            { termo: 'KDA', texto: 'Kills / deaths / assists. The match scoreboard shows everyone\'s.' },
            { termo: 'Assist', texto: 'Hurting an enemy pilot that an ally took down in the next 10 s. It pays half the gold and XP of the kill.' },
            { termo: 'Wing', texto: 'Your team. Wing XP is what you get when an ally kills something near you.' },
            { termo: 'Recall', texto: `Going back to base by channeling for ${F.recallS} s, standing still ([[recall]]).` },
            { termo: 'Fog of war', texto: 'The darkness where your team cannot see. Whoever is there does not show up for you.' },
            { termo: 'Safe zone', texto: 'The pocket of your base, behind the force field. The enemy cannot get in.' },
            { termo: 'Convoy', texto: 'The line of miners with their escorts.' },
            { termo: 'Ph. / Op. / El.', texto: 'The damage types: physical, laser (optical) and electric.' },
            { termo: 'Resistance', texto: 'How much of a damage type the ship blocks. The attacker\'s penetration goes through part of it.' },
            { termo: 'V1 to V8', texto: 'The version of an item. Each extra version makes the weapon or the equipment stronger.' },
            { termo: 'Tier', texto: 'The position of the ship in the line, from 1st to 5th.' },
            { termo: 'Cargo hold', texto: `The items you own that are not on the ship (up to ${F.compartimento}).` },
            { termo: 'Final phase', texto: `The last ${F.faseFinalS / 60} minutes: delivered ore is worth ×${F.multFaseFinal}.` },
            { termo: 'Core wave', texto: `The ${F.ondaNucleo} giant miners that leave the base of whoever takes the Core.` },
            { termo: 'First Blood', texto: 'The first pilot kill of the match, called by the announcer.' },
          ],
        },
      ],
      praticar: { modo: 'privada', texto: 'Time to put it all into practice.' },
    },
  ];
}
