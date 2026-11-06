// Aba "Recomendados" da Loja (pedido do Mateus, 05/nov/2026): a primeira aba, com o
// que vale comprar para cada raça e classe, em quatro seções (Armas, Escudos,
// Armaduras e Potenciadores). É só uma vitrine: cada cartão compra o mesmo item das
// outras abas ({t:'comprar', item}), e o servidor valida como sempre.
//
// Nas seções de equipamento a recomendação é UM dos três tipos (Op., Ph. ou El.),
// então as três versões aparecem, com a dica de como escolher (`dica`): o escudo e
// a armadura pelo dano que mais acerta o piloto, o potenciador para potencializar
// os status dele.
// Raça sem armas escolhidas (null na lista) mostra "EM BREVE" na seção.
//
// As chaves são as do catálogo (WEAPONS em shared/armas.js, EQUIPAMENTOS em
// shared/equipamentos.js); tests/recomendados.test.mjs confere que cada uma existe e
// está à venda para a raça e a classe dela. Sem imports, puro, mesmo arquivo nos
// dois lados; os computadores montam a build por aqui (server/bots.js: as armas que
// sabem usar, e o escudo e a armadura pelo dano que mais os acerta).

const PELO_DANO = 'escolha um: Op., Ph. ou El., pelo dano que mais te acerta';

/** Ordem das seções da aba, com o nome, a categoria do item e a dica ao lado do título. */
export const SECOES_RECOMENDADOS = [
  { id: 'armas', nome: 'Armas', categoria: 'arma' },
  { id: 'escudo', nome: 'Escudos', categoria: 'escudo', dica: PELO_DANO },
  { id: 'armadura', nome: 'Armaduras', categoria: 'armadura', dica: PELO_DANO },
  { id: 'potenciador', nome: 'Potenciadores', categoria: 'potenciador', dica: 'escolha um: Op., Ph. ou El., para potencializar seus status' },
];

// Equipamento: Op., Ph. e El. de cada linha (a ordem da lista do Mateus).
const ESCUDO_MAXIMO = ['e330001', 'e330002', 'e330003'];
const ESCUDO_NEUTRON = ['e330010', 'e330011', 'e330012'];
const ARMADURA_TITANIO = ['e320002', 'e320003', 'e320004'];
const ARMADURA_AMANDIO = ['e320006', 'e320007', 'e320008'];
const ARMADURA_ARGONIO = ['e320009', 'e320010', 'e320011'];
const REFORCO = ['e340025', 'e340024', 'e340026']; // Reforço Op., Ph. e El.

/** Escudo, armadura e potenciadores por classe (iguais nas três raças). */
const EQUIP_POR_CLASSE = {
  assault: { escudo: ESCUDO_MAXIMO, armadura: ARMADURA_TITANIO, potenciador: REFORCO },
  mobile: { escudo: ESCUDO_NEUTRON, armadura: ARMADURA_AMANDIO, potenciador: REFORCO },
  functional: { escudo: ESCUDO_NEUTRON, armadura: ARMADURA_ARGONIO, potenciador: REFORCO },
};

/** Armas recomendadas por raça e classe; null = ainda não escolhidas (EM BREVE). */
export const ARMAS_RECOMENDADAS = {
  acron: {
    // Feixe Circular, Onda de Sopro Acron, Bombardeiro Frontal, Tenda de Luz, Reparador de Escudo
    assault: ['o111009', 'o112030', 'o111019', 'o112008', 'o112007'],
    // Feixe Tempestade Circular, Feixe Clone em Leque, Teleporte, Camuflagem, Bombardeiro Elétrico
    mobile: ['o111005', 'o111007', 'o112021', 'o112012', 'o112025'],
    // Feixe Tempestade Circular, Feixe Perfurante de Magma, Feixe Relâmpago, Canhão de Faíscas, Rebatedor de Projéteis
    functional: ['o111005', 'o111003', 'o112038', 'o112028', 'o112014'],
  },
  bellico: {
    // Metralha Crítica, Vulcan Teleguiada, Feixe Perfurante Circular, Canhão de Magma em Leque, Invulnerabilidade
    assault: ['o211017', 'o211013', 'o211009', 'o212002', 'o212019'],
    // Feixe Clone Duplo, Canhão em Fila, Míssil Quebra-Escudo, Canhão Redutor de Energia, Invulnerabilidade
    mobile: ['o211005', 'o212005', 'o212010', 'o212023', 'o212019'],
    // Feixe Perfurante Circular, Feixe Clone Duplo, Canhão em Fila, Vulcan Tempestade Teleguiada, Reparador de Escudo
    functional: ['o211009', 'o211005', 'o212005', 'o212034', 'o212008'],
  },
  shrewdo: {
    // Metralha Trovão, Feixe Triplo, Canhão Tempestade em Leque, Invulnerabilidade, Camuflagem
    assault: ['o311009', 'o311008', 'o312001', 'o312017', 'o312014'],
    // Feixe Triplo, Feixe de Magma, Raio Rastreador, Canhão Desgoverno, Acelerador
    mobile: ['o311008', 'o311007', 'o312030', 'o312024', 'o312016'],
    // Rifle de Magma, Feixe Triplo, Feixe de Magma, Canhão Paralisante, Acelerador
    functional: ['o311032', 'o311008', 'o311007', 'o312003', 'o312016'],
  },
};

/**
 * As quatro seções da aba Recomendados para a raça e a classe: `[{id, nome,
 * categoria, dica?, itens: [chave...], emBreve?}]`. `emBreve` quando a seção
 * ainda não tem recomendação (null em ARMAS_RECOMENDADAS); raça ou classe desconhecida
 * dá seções vazias.
 */
export function recomendadosDe(race, classe) {
  const armas = ARMAS_RECOMENDADAS[race]?.[classe];
  const equip = EQUIP_POR_CLASSE[classe];
  return SECOES_RECOMENDADOS.map((s) => {
    if (s.id === 'armas') return { ...s, itens: armas ? [...armas] : [], emBreve: armas === null };
    return { ...s, itens: ARMAS_RECOMENDADAS[race] && equip ? [...equip[s.id]] : [] };
  });
}
