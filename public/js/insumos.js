// O que a partida usa dos arquivos do original (modelos, texturas e sons), para a tela
// de carregamento (carregamento.js) baixar tudo ANTES da partida e nada carregar no
// meio dela: nem o que a sua nave usa (trocar de arma, evoluir a arma, comprar a nave
// seguinte), nem o que os OUTROS pilotos e os computadores trazem (qualquer raça,
// classe, nave e arma; ver insumosDaPartida).
//
// Puro: sem Three.js, sem DOM e sem rede, só os catálogos de shared/. Por isso os
// imports são relativos ('../../shared/...'): no navegador eles caem no mesmo
// /shared/armas.js que os outros módulos importam (o mesmo módulo, não uma cópia), e
// no Node os testes conseguem conferir que todo arquivo da lista existe.
//
// As regras de quais texturas um efeito usa moram aqui (efeitos-armas.js importa
// daqui): se o desenho de um efeito passar a usar outra textura, a lista do
// carregamento acompanha sozinha.

import { WEAPONS, ARMAS, armasDisponiveis, visualEfeito, visualDoOriginal } from '../../shared/armas.js';
import { linhaDe, RACAS_JOGAVEIS, ORDEM_CLASSES } from '../../shared/naves.js';
import { EQUIPAMENTOS, equipamentosAVenda } from '../../shared/equipamentos.js';
import { SONS_INTERFACE, SONS_ARMA, SONS_VOLTA, SONS_NUCLEO } from './sons.js';
import { EFEITOS_DESTRUICAO, SONS_DESTRUICAO } from './destruicao.js';

/** Pasta das texturas dos efeitos de arma do original. */
export const PASTA_TEXTURAS_EFEITO = '/texturas/efeitos/';
/** Pasta dos modelos das armas penduradas na asa. */
export const PASTA_MODELOS_ARMA = '/modelos/armas/';
/** Pasta dos efeitos do original convertidos (tools/efeitos3d_do_original.py, <id>.json). */
export const PASTA_EFEITOS_ORIGINAIS = '/modelos/efeitos/';
/** Pasta dos ícones dos itens do original (tools/icones_do_original.py, <nome>.png). */
export const PASTA_ICONES_ITENS = '/texturas/itens/';

/** Ícones do Kit de reparo e da Célula de energia: o Hpbattery e o Energybattery do original. */
export const ICONE_CONSUMIVEL = Object.freeze({ reparo: 'sp011', energia: 'sp012' });
/** O número da versão no canto do ícone, por versão (a V1 não tem, como no original). */
export function iconeVersao(nivel) {
  return nivel >= 2 && nivel <= 8 ? `item_lv${nivel}` : null;
}

/**
 * Os ícones (nomes, sem extensão) que a Loja e o INVENTÁRIO da raça e da classe podem
 * mostrar: as armas da raça e da classe, os equipamentos da classe, os consumíveis e
 * os números da versão. Só os do próprio piloto: ninguém vê o inventário dos outros.
 */
export function iconesDaNave(race, classe) {
  const nomes = new Set();
  for (const idx of armasDisponiveis(race, classe)) {
    const w = WEAPONS[ARMAS[idx]];
    if (!w.npc && w.icone) nomes.add(w.icone);
  }
  for (const k of equipamentosAVenda(classe)) nomes.add(EQUIPAMENTOS[k].icone);
  for (const n of Object.values(ICONE_CONSUMIVEL)) nomes.add(n);
  for (let v = 2; v <= 8; v++) nomes.add(iconeVersao(v));
  return [...nomes];
}

/**
 * Os efeitos do original convertidos (.eff + .3dx + .MPL → public/modelos/efeitos):
 * os das armas do jogador desenhadas como no original (disparo-original.js), os das
 * armas de NPC do original que os monstros usam (projétil, clarão, impacto, fim e
 * armadilha) e os de estado na nave. Efeito novo: converta com o tools/efeitos3d_do_original.py e ponha aqui.
 */
export const EFEITOS_ORIGINAIS = Object.freeze([
  // Armas de início (as duas de fábrica de cada raça; disparo-regras.js): o clarão dos
  // feixes, os projéteis de cada versão (V1–V3, V4–V6, V7–V8) do Feixe Rifle Triplo e
  // do Feixe Duplo, do Feixe Bellico, dos Vulcans e da Metralha Shrewdo. O clarão dos
  // Vulcans e da Metralha (1121001), os impactos (1412001, 1421001) e o fim da Metralha
  // (1421002) são os mesmos dos monstros, mais abaixo.
  '2112001', '1312003', '1312004', '1312005', '1312073', '1312074', '1312075',
  '1321013', '1321014', '1321015', '1321003', '1321004', '1321005',
  // Revistas contra o original (disparo-regras.js): os feixes do Feixe Perfurante de
  // Magma (o clarão e o impacto são os dos feixes de início); o clarão, a carga de cada
  // versão e a esfera que cresce do Canhão de Faíscas (o impacto é o 1421001); o anel
  // do Rebatedor de Projéteis.
  '1312063', '1312064', '1312065', '1133002', '1335003', '1335004', '1335005', '2142018', '1162020',
  // Segunda leva Acron (disparo-regras.js): o fim dos feixes em círculo e os feixes da
  // Tempestade Circular; as balas da Metralha Rotativa e do Bombardeiro Frontal; a
  // Lâmina Reforçada (projétil e impacto de cada degrau); a carga e o fim do Canhão
  // Descarregador; a carga e a esfera do Ciclone; a carga e a armadilha da Armadilha
  // Supressora; o míssil e os clones do Míssil Clone Teleguiado; as três novas.
  '1412002', '1312053', '1312054', '1312055', '1321023', '1321024', '1321025', '1321241', '1321341', '1321441',
  '1361032', '1361033', '1401107', '1401207', '1333008', '2403008', '1133055', '2132018', '1352005', '2253006',
  '1131055', '1131056', '1131156', '1131256', '1131356', '1131456', '1332034', '2132017', '1353021',
  // A onda da Onda de Sopro Acron.
  '1162023',
  // Terceira leva Acron (disparo-regras.js): os raios do Rifle Relâmpago e do Feixe
  // Relâmpago (de cada degrau) e o fim elétrico deles, do Bombardeiro Elétrico e da
  // Armadilha Elétrica; a carga e o fim do Canhão Amplificador e do Congelante; os dois
  // mísseis, o fim do Paralisante e o rastro com pele dos dois (2343101, malha de
  // rastro-missil.js); a Armadilha Circular de cada degrau; as seis novas e os impactos
  // de suporte; o efeito do Teleporte.
  '1412043', '1412044', '1412045', '1412023', '1412024', '1412025', '2432000', '1333005', '2403005', '1333002', '2403003',
  '2343007', '2403002', '2343101', '1361059', '1361060', '1361061',
  '2163011', '2165012', '2163010', '2163022', '2164012', '1503010', '1503011', '1163010',
  // Quarta leva Acron (disparo-regras.js): o feixe dos dois Feixes Tempestade
  // teleguiados e a bala da Metralha Teleguiada, de cada degrau.
  '1312033', '1312034', '1312035', '1321033', '1321034', '1321035',
  // Os estados dos dispositivos na nave: o conversor de impacto, as resistências e o
  // reparo do escudo (o quantum e a esfera de cada raça).
  // O "MISS" do debuff elétrico que não pegou.
  'miss',
  '1163023', '2163033', '2163012', '2163013', '1163005_01', '1163005_02', '1163004_01', '1163004_02', '1163003_01', '1163003_02',
  // Destruição de nave, torre e monstro (destruicao.js): as explosões EXP001 a EXP007,
  // a fagulha e a fumaça da queda, a faísca e as peças dos destroços.
  ...EFEITOS_DESTRUICAO,
  // SN-3: clarão, Disco Voador, impacto; clarão do míssil, o míssil com o "E", a esfera azul da descarga.
  '1121001', '1361031', '1401307', '1150005', '2343012', '1503009',
  // SN-4: Míssil Cruzador, Onda de Feixe Óptico (e o impacto), Campo Elétrico.
  '2341024', '1332035', '1502004', '2252008',
  // Xerxes e Grande Xerxes: as bolas de fogo, o impacto; o canhão explosivo e as explosões.
  '1361153', '1361253', '1412001', '1322060', '1421001', '1421002',
  // Bazit: o feixe óptico. Anti: o canhão teleguiado, o impacto do míssil e o fim do canhão.
  '1322065', '1322061', '1401007', '2432001',
  // Medusa: a armadilha paralisante (a esfera ciano), a pedra e o disparo de controle
  // (as partículas verdes) e o respingo verde da pedra.
  '1322063', '1322064', '1421030',
  // Estados na nave: o fogo do Magma e os ícones.
  '1164001', 'cross003', 'cross002', 'cross007', 'cross008', 'cross010', 'cross013',
]);

/**
 * Ícone 3D do original em cima da nave para cada estado da lista `fx` (os que o
 * original marca: CUnit::ChangeEffectFlag), na ordem em que empilham: o capacete das
 * resistências quebradas (o campo do SN-4; azul, dentro do círculo vermelho), o "LD" da
 * paralisia, a espada proibida do tiro impedido (a armadilha da Medusa), as setas
 * proibidas do desgoverno (o disparo de controle da Medusa), o "E" da energia (a
 * descarga do míssil do SN-3, o dreno e a recarga cortada) e a espada proibida do
 * ataque enfraquecido. Os mesmos símbolos das mensagens de debuff (debuffs.js).
 */
export const ICONES_ESTADO = Object.freeze({ resist: 'cross003', para: 'cross002', semTiro: 'cross008', desg: 'cross010', descarga: 'cross013', energia: 'cross013', fraco: 'cross008' });
/** O fogo do Magma na nave (o dreno de HP do original: faíscas vermelhas subindo). */
export const MAGMA_NA_NAVE = '1164001';
/** O "MISS" do original na nave que resistiu ao debuff elétrico (CUnit::EffectMiss). */
export const EFEITO_MISS = 'miss';

// Texturas que no original são do casco 3D (opacas), não luz: não servem de efeito aditivo.
export const TEXTURAS_CASCO = new Set(['1321011_01', '1321021_01', 'gun', 'missile', '1351005_01', '1131056']);
// Sequências de quadros do original (o primeiro quadro é o que a lista do efeito cita).
export const SEQUENCIAS = {
  charge_vox00: Array.from({ length: 15 }, (_, i) => `charge_vox${String(i).padStart(2, '0')}`),
  '2403002_0050': Array.from({ length: 21 }, (_, i) => `2403002_00${50 + i}`),
  '2432001_0050': Array.from({ length: 21 }, (_, i) => `2432001_00${50 + i}`),
  '1352004_0050': Array.from({ length: 10 }, (_, i) => `1352004_00${50 + i}`),
  '1333002_00': ['1333002_00', ...Array.from({ length: 11 }, (_, i) => `1333002_${String(i + 1).padStart(2, '0')}`)],
  '1401007_01': Array.from({ length: 16 }, (_, i) => `1401007_${String(i + 1).padStart(2, '0')}`),
  '2163011_0100': Array.from({ length: 21 }, (_, i) => `2163011_0${100 + i}`),
};
// Efeitos de um golpe que o desenho usa com textura: clarão (d), projétil (p),
// impacto (i), fim/área (f) e armadilha (a). O rastro (r) só empresta a cor.
const EFEITOS_COM_TEXTURA = ['d', 'p', 'i', 'f', 'a'];

/** Sons que não são de arma: interface, explosões de nave e de monstro, cura. */
export const SONS_GERAIS = Object.freeze([...new Set([...Object.values(SONS_INTERFACE), ...Object.values(SONS_VOLTA), ...Object.values(SONS_NUCLEO), 'h_explo', 'n2_explo', 'cure'])]);

/** A primeira textura de luz (aditiva) do efeito visual `id`, ou null. */
export function texturaDoEfeito(id) {
  const v = visualEfeito(id);
  return v?.texturas.find((t) => t && !TEXTURAS_CASCO.has(t)) ?? null;
}

/** Nomes dos quadros de uma textura: ela mesma, ou a sequência do original que começa nela. */
export function quadrosDe(nome) {
  return SEQUENCIAS[nome] ?? [nome];
}

/** Todos os golpes da arma (chave): todas as versões, o disparo e os filhos (subprojétil, o que a mina dispara). */
export function golpesDaArma(kind) {
  const w = WEAPONS[kind];
  if (!w) return [];
  const golpes = [];
  for (const v of w.versoes) {
    for (let g = v.golpe; g; g = g.divide ?? g.dispara ?? null) golpes.push(g);
  }
  return golpes;
}

/** Texturas (nomes, sem extensão) que a arma pode desenhar em qualquer versão. */
export function texturasDaArma(kind) {
  const nomes = new Set();
  for (const g of golpesDaArma(kind)) {
    for (const k of EFEITOS_COM_TEXTURA) {
      const tex = texturaDoEfeito(g.vis?.[k]);
      if (tex) for (const q of quadrosDe(tex)) nomes.add(q);
    }
  }
  return [...nomes];
}

/** Sons (nomes, sem extensão) que a arma pode tocar em qualquer versão: disparo e impacto. */
export function sonsDaArma(kind) {
  const w = WEAPONS[kind];
  if (!w) return [];
  const nomes = new Set([w.som, w.somImpacto, ...w.versoes.map((v) => v.som)]);
  for (const g of golpesDaArma(kind)) nomes.add(g.som).add(g.somImpacto);
  nomes.delete(undefined);
  nomes.delete(null);
  return [...nomes];
}

/** Modelos (nomes de arquivo sem extensão) das peças da arma na asa, esquerda e direita. */
export function modelosDaArma(kind) {
  return [...new Set((WEAPONS[kind]?.modelo ?? []).filter(Boolean))];
}

/**
 * Tudo o que a nave da raça e da classe pode precisar na partida:
 * - `naves`: as 5 da linha (as que a Evolução compra), { tier, nome, url };
 * - `armas`: todas as que a raça e a classe usam, { idx, kind, nome, modelos };
 * - `texturas`: as dos efeitos dessas armas, em todas as versões;
 * - `sons`: os dessas armas e os gerais (interface, explosões);
 * - `icones`: os dos itens da Loja e do INVENTÁRIO (iconesDaNave).
 */
export function insumosDaNave(race, classe) {
  const naves = linhaDe(race, classe).map((n) => ({ tier: n.tier, nome: n.nome, url: '/' + n.modelo }));
  const armas = armasDisponiveis(race, classe)
    .map((idx) => ({ idx, kind: ARMAS[idx] }))
    .filter(({ kind }) => !WEAPONS[kind].npc)
    .map(({ idx, kind }) => ({ idx, kind, nome: WEAPONS[kind].nome, modelos: modelosDaArma(kind) }));
  const texturas = new Set();
  const sons = new Set(SONS_GERAIS);
  for (const { kind } of armas) {
    for (const t of texturasDaArma(kind)) texturas.add(t);
    for (const s of sonsDaArma(kind)) sons.add(s);
  }
  return { naves, armas, texturas: [...texturas], sons: [...sons], icones: iconesDaNave(race, classe) };
}

/**
 * As armas de NPC do original que os monstros usam (o SN-3 e o SN-Zero VI atiram com
 * elas): { idx, kind, nome }. Sem modelo na asa; entram pelas texturas dos efeitos.
 */
export function armasDeMonstro() {
  return ARMAS.map((kind, idx) => ({ idx, kind, nome: WEAPONS[kind].nome })).filter(({ kind }) => WEAPONS[kind].npc && visualDoOriginal(kind));
}

/**
 * Tudo o que pode aparecer na partida, para a tela de carregamento baixar de uma vez:
 * as naves de TODAS as raças jogáveis, classes e tiers (os outros pilotos e os
 * computadores podem vir com qualquer uma e comprar a seguinte no meio da partida),
 * os modelos da asa de todas as armas, as texturas dos efeitos de todas as armas em
 * todas as versões (e as das armas de NPC do original que os monstros usam,
 * `armasMonstro`) e todos os sons (os das armas de todos, os dos tiros de NPC, os
 * de interface e os padrões de SONS_ARMA). A raça e a classe do piloto vêm primeiro
 * em cada lista (o que ele mais usa fica pronto antes). São ~18 MB: o Mateus prefere
 * esperar na entrada a ter o jogo travando quando um piloto novo aparece.
 * Mesma forma de insumosDaNave, mais `armasMonstro` e `efeitosOriginais` (os efeitos do
 * original convertidos, com as texturas que cada um pede: o carregamento lê do json);
 * as naves trazem também `race` e `classe`. Os `icones` são só os do piloto.
 */
export function insumosDaPartida(race, classe) {
  const propria = insumosDaNave(race, classe);
  const naves = propria.naves.map((n) => ({ ...n, race, classe }));
  const urls = new Set(naves.map((n) => n.url));
  for (const r of RACAS_JOGAVEIS) {
    for (const c of ORDEM_CLASSES) {
      for (const n of linhaDe(r, c)) {
        const url = '/' + n.modelo;
        if (urls.has(url)) continue;
        urls.add(url);
        naves.push({ tier: n.tier, nome: n.nome, url, race: r, classe: c });
      }
    }
  }
  const armas = [...propria.armas];
  const kinds = new Set(armas.map((a) => a.kind));
  ARMAS.forEach((kind, idx) => {
    if (WEAPONS[kind].npc || kinds.has(kind)) return;
    kinds.add(kind);
    armas.push({ idx, kind, nome: WEAPONS[kind].nome, modelos: modelosDaArma(kind) });
  });
  const texturas = new Set(propria.texturas);
  const sons = new Set(propria.sons);
  const armasMonstro = armasDeMonstro();
  for (const { kind } of [...armas, ...armasMonstro]) for (const t of texturasDaArma(kind)) texturas.add(t);
  // Sons de todas as armas, as de NPC também (torres, escoltas e drones atiram com elas).
  for (const kind of ARMAS) for (const s of sonsDaArma(kind)) sons.add(s);
  for (const s of Object.values(SONS_ARMA)) sons.add(s);
  // Os sons de morte das unidades e o da explosão (destruicao.js).
  for (const s of SONS_DESTRUICAO) sons.add(s);
  return { naves, armas, armasMonstro, texturas: [...texturas], sons: [...sons], icones: propria.icones, efeitosOriginais: [...EFEITOS_ORIGINAIS] };
}

/** Os arquivos dos modelos da asa de uma lista de armas, sem repetição (peças compartilhadas baixam uma vez). */
export function modelosDasArmas(armas) {
  return [...new Set(armas.flatMap((a) => a.modelos))];
}

// ---------- Mapa e monstros ----------
//
// Os modelos do cenário (public/modelos/mapa/, feitos no Blender pela frente Cenário)
// e os dos monstros da jungle (public/modelos/monstros/, do AstroN original) são os
// mesmos para todo piloto: entram inteiros na tela de carregamento, antes da cena ser
// montada (cena.js e monstros.js só montam o que já está no cache).

/** Pasta dos modelos do mapa (lago de Hélio-3). */
export const PASTA_MODELOS_MAPA = '/modelos/mapa/';
/** Pasta dos modelos dos monstros. */
export const PASTA_MODELOS_MONSTRO = '/modelos/monstros/';

/** Os modelos do mapa, sem extensão (ver public/modelos/mapa/LISTA.md). */
export const MODELOS_MAPA = Object.freeze([
  'borda-quadrante',
  'borda-quadrante-espelhada',
  'borda-horizonte',
  'fundo-lago',
  'agua',
  'rocha-quadrante',
  'rocha-quadrante-b',
  'parede-l',
  'parede-l-espelhada',
  'mineradora',
  'base-warp',
  'plataforma-base',
  'plataforma-servico',
  'plataforma-pouso',
  'bacia',
  'campo-base',
  'nucleo',
  'torre-suporte',
  'torre-suporte-caida',
  'torreta',
  'minerador',
  'escolta',
  'coral',
  'alga',
  'cristais-he3',
  'pedra-lago-1',
  'pedra-lago-2',
  'ruina-submersa',
  // As malhas de luz do efeito de subir de nível e de evoluir a nave (subida.js).
  'subida-nivel',
  // As malhas de luz do efeito da volta à base (volta.js).
  'volta-base',
  // As malhas de luz das passivas do Núcleo de He-3: o escudo e o reflexo (nucleo-efeitos.js).
  'nucleo-efeitos',
]);

/** Espécies de monstro (a `esp` do protocolo = o nome do glb). */
export const ESPECIES_MONSTRO = Object.freeze(['sn3', 'snzero', 'xerxes', 'great_xerxes', 'bazit', 'anti', 'sn4', 'medusa', 'sonda']);
/** Os modelos dos monstros e os efeitos da Medusa (sangue e bolhas, decoração). */
export const MODELOS_MONSTRO = Object.freeze([...ESPECIES_MONSTRO, 'medusa-sangue', 'medusa-bolha']);

/** Pasta das texturas PBR compartilhadas do mapa (padrão mid-poly PBR). */
export const PASTA_TEXTURAS_MAPA = '/texturas/mapa/';

/**
 * Conjuntos de texturas PBR do mapa: o material `pbr_<conjunto>[_variação]` de um glb
 * ganha as três imagens do conjunto (cor, metal/rugosidade do glTF e normal): `painel`, o
 * atlas de chapas metálicas 2 × 2, e `rocha`, a rocha em estratos que repete sem emenda.
 * A `agua` é do shader da água (agua.js): o relevo das ondulações e a espuma, que repetem
 * (ver public/texturas/mapa/LISTA.md).
 */
export const TEXTURAS_PBR_MAPA = Object.freeze({
  painel: Object.freeze({ cor: 'painel_cor.webp', mr: 'painel_mr.webp', normal: 'painel_normal.webp' }),
  rocha: Object.freeze({ cor: 'rocha_cor.webp', mr: 'rocha_mr.webp', normal: 'rocha_normal.webp' }),
  agua: Object.freeze({ normal: 'agua_normal.webp', espuma: 'agua_espuma.webp' }),
});

/** URLs do que o mapa e os monstros usam: { mapa: [{ nome, url }], monstros: [{ nome, url }], texturas: [url] }. */
export function insumosDoMapa() {
  return {
    mapa: MODELOS_MAPA.map((nome) => ({ nome, url: `${PASTA_MODELOS_MAPA}${nome}.glb` })),
    monstros: MODELOS_MONSTRO.map((nome) => ({ nome, url: `${PASTA_MODELOS_MONSTRO}${nome}.glb` })),
    texturas: Object.values(TEXTURAS_PBR_MAPA).flatMap((c) => Object.values(c).map((f) => `${PASTA_TEXTURAS_MAPA}${f}`)),
  };
}
