// Arrastar e soltar no INVENTÁRIO (inventario.js): clicar, segurar e levar um item até
// o lugar dele. Cada encaixe só aceita o que é dele, como no original: arma no Z e no
// X e nas casas da troca rápida (Q e E), escudo só no Escudo, armadura só na
// Armadura, potenciador só no Potenciador 1 ou 2; soltar no compartimento tira da
// nave (ou da casa da troca rápida). Puro e testado (tests/inventario-arrastar.test.mjs):
// diz se o lugar aceita e o que fazer, e o painel faz pelo mesmo caminho das opções
// da caixinha (ArmasNave.equipar/guardar para as armas, {t:'equipar'} para o resto).
//
// Origem: { inst: {id, tipo, chave}, categoria?, slot? | casa? | comp: true } (de onde
// o item saiu; `categoria` é a do equipamento, de shared/equipamentos.js).
// Destino: { slot } (encaixe da nave), { casa, ocupante? } (troca rápida; ocupante é
// o id da arma guardada nela) ou { comp: true } (o compartimento).

import { CATEGORIA_DO_SLOT } from '../../shared/equipamentos.js';

/** Encaixe de arma da nave por slot (z = 0, x = 1). */
const ENC_ARMA = { z: 0, x: 1 };

/**
 * O que soltar `origem` em `destino` faz, ou null se o lugar não aceita (ou nada
 * muda). Jogadas: {acao:'arma', enc, inst} (põe a arma no Z/X; vinda da casa, a que
 * sai fica guardada nela; vinda do outro encaixe, as duas trocam), {acao:'guardar',
 * casa, inst} (guarda na casa da troca rápida; inst null esvazia) e {acao:'equipar',
 * slot, inst} (pedido ao servidor; inst null tira para o compartimento).
 */
export function jogadaDoArrasto(origem, destino) {
  const inst = origem?.inst;
  if (!inst || !destino) return null;
  const arma = inst.tipo === 'arma';
  if (destino.slot !== undefined) {
    if (origem.slot === destino.slot) return null;
    const enc = ENC_ARMA[destino.slot];
    if (enc !== undefined) return arma ? { acao: 'arma', enc, inst: inst.id } : null;
    const cat = CATEGORIA_DO_SLOT[destino.slot];
    if (!cat || arma || origem.categoria !== cat) return null;
    return { acao: 'equipar', slot: destino.slot, inst: inst.id };
  }
  if (destino.casa !== undefined) {
    if (!arma || origem.casa === destino.casa) return null;
    const enc = ENC_ARMA[origem.slot];
    if (enc !== undefined) {
      // A arma do Z/X não sai da nave sozinha (ela sempre leva duas): só troca com a
      // que está guardada na casa, que entra no encaixe dela.
      return Number.isInteger(destino.ocupante) ? { acao: 'arma', enc, inst: destino.ocupante } : null;
    }
    return { acao: 'guardar', casa: destino.casa, inst: inst.id };
  }
  if (destino.comp) {
    if (origem.casa !== undefined) return { acao: 'guardar', casa: origem.casa, inst: null };
    if (origem.slot !== undefined && CATEGORIA_DO_SLOT[origem.slot]) return { acao: 'equipar', slot: origem.slot, inst: null };
    return null;
  }
  return null;
}

/** Quanto o ponteiro anda (px) antes de virar arrasto: menos que isso é clique. */
export const ARRASTO_MIN_PX = 6;
/** No toque, segurar parado esse tempo (ms) pega o item (arrastar sem segurar rola a janela). */
export const SEGURAR_TOQUE_MS = 250;
