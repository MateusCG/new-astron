// Loja e Evolução no servidor (DESIGN-PARTIDA.md): valida e cobra as compras, guarda
// o que cada piloto e cada time têm, e aplica os efeitos na nave e nos mineradores.
// Os dados (preços, efeitos, limites) ficam em shared/loja.js e shared/evolucao.js.
//
// O cliente só PEDE ({t:'comprar', item}, {t:'evoluir', opcao}, {t:'melhorar',
// melhoria}, {t:'usar', item}); nada do pedido é confiado além do id, que tem de
// existir no catálogo (qualquer outra coisa, string malformada inclusive, vira
// 'invalido'). Para comprar, evoluir ou melhorar o piloto tem de estar vivo,
// POUSADO E PARADO na plataforma do serviço certo da PRÓPRIA base (Loja para
// comprar, Evolução para evoluir e melhorar); usar um item vale em qualquer lugar.
// A resposta é {t:'resultado', acao, item, ok, codigo?}, com código estável que o
// cliente traduz: nao_pousado, ouro_insuficiente, nivel_insuficiente, ja_possui,
// limite, invalido, e no uso de item sem_item, recarga e cheio.
//
// Onde fica cada coisa: a posse do piloto fica no JOGADOR (j.armas, j.armadura,
// j.itens, j.itemPronto, j.evolucoes), porque a nave é recriada a cada
// renascimento; prepararNave() copia tudo para a nave nova junto com o nível (HP e
// energia máximos, velocidade, armas). As melhorias dos mineradores ficam por time
// em this.niveis e viram world.mineradores.melhorias[time]. Tudo é da partida:
// novoEquipamento() e reiniciar() zeram na seguinte (World, #passoPartida).

import { RACES, VEL_TOQUE, ARMAS_INICIAIS, DT } from '../shared/sim.js';
import { areaPouso } from '../shared/terrain.js';
import { itemDaLoja, armadura, ITENS, ORDEM_ITENS } from '../shared/loja.js';
import { opcaoNave, proximoMarco, efeitosNave, melhoriaMinerador, efeitosMineradores, niveisIniciais } from '../shared/evolucao.js';
import { hpMaxDoJogador } from './progressao.js';

const ACOES = ['comprar', 'evoluir', 'melhorar', 'usar'];

/** Campos de loja e evolução de um piloto no começo da partida. */
export function novoEquipamento() {
  return {
    armas: [...ARMAS_INICIAIS], // posse: as de fábrica e as compradas
    armadura: -1, // nível em ARMADURAS (-1 = nenhuma)
    itens: Object.fromEntries(ORDEM_ITENS.map((id) => [id, 0])), // carga de cada item
    itemPronto: Object.fromEntries(ORDEM_ITENS.map((id) => [id, 0])), // tick em que pode usar de novo
    evolucoes: [], // opções de nave escolhidas, uma por marco, em ordem
  };
}

/** Fração do dano que a armadura do piloto segura (0 sem armadura). */
export function reducaoArmadura(j) {
  return armadura(j.armadura)?.reducao ?? 0;
}

/** Energia máxima da nave do piloto (raça × evoluções de reator). */
export function enMaxDoJogador(j) {
  const base = RACES[j.ship.race]?.energia ?? RACES.shrewdo.energia;
  return Math.round(base * efeitosNave(j.evolucoes).en);
}

/** Multiplicador de velocidade da nave do piloto (motor × armadura pesada). */
export function velMultDoJogador(j) {
  return efeitosNave(j.evolucoes).vel * (armadura(j.armadura)?.velMult ?? 1);
}

/**
 * Nave nova (nascimento ou renascimento): copia a posse de armas e põe HP e energia
 * máximos (nível, evoluções, armadura), cheios, e a velocidade.
 */
export function prepararNave(j) {
  const s = j.ship;
  s.armas = [...j.armas];
  s.maxHp = hpMaxDoJogador(j);
  s.hp = s.maxHp;
  s.maxEn = enMaxDoJogador(j);
  s.en = s.maxEn;
  s.velMult = velMultDoJogador(j);
}

/**
 * Compra com a nave em uso: o que subiu de máximo sobe junto no atual (comprar não
 * cura o resto nem fere), e a energia nunca passa do máximo.
 */
function atualizarNave(j) {
  const s = j.ship;
  s.armas = [...j.armas];
  const hp = hpMaxDoJogador(j);
  if (s.hp > 0) s.hp = Math.max(1, s.hp + hp - s.maxHp);
  s.maxHp = hp;
  const en = enMaxDoJogador(j);
  s.en = Math.max(0, Math.min(en, s.en + Math.max(0, en - s.maxEn)));
  s.maxEn = en;
  s.velMult = velMultDoJogador(j);
}

/** Pousado e parado na plataforma `servico` ('loja' ou 'evolucao') da própria base? */
export function naPlataforma(j, servico) {
  const s = j.ship;
  if (!j.vivo || !s.pousado || Math.hypot(s.vx, s.vz) >= VEL_TOQUE) return false;
  const a = areaPouso(s.x, s.z);
  return !!a && a.servico === servico && a.time === j.time;
}

export class Servicos {
  /** @param {import('./game.js').World} world */
  constructor(world) {
    this.world = world;
    this.reiniciar();
  }

  /** Partida nova (ou servidor vazio): nenhuma melhoria de minerador nos dois times. */
  reiniciar() {
    this.niveis = this.world.mineradores.melhorias.map(() => niveisIniciais());
    this.world.mineradores.melhorias = this.niveis.map((n) => efeitosMineradores(n));
  }

  /**
   * Atende um pedido do cliente. Devolve a resposta para mandar a ele:
   * {t:'resultado', acao, item, ok, codigo?}.
   */
  pedido(j, msg) {
    const acao = ACOES.includes(msg?.t) ? msg.t : null;
    const id = acao === 'evoluir' ? msg?.opcao : acao === 'melhorar' ? msg?.melhoria : msg?.item;
    const item = typeof id === 'string' ? id.slice(0, 32) : null;
    let codigo;
    if (!j) codigo = 'invalido';
    else if (acao === 'comprar') codigo = this.#comprar(j, item);
    else if (acao === 'evoluir') codigo = this.#evoluir(j, item);
    else if (acao === 'melhorar') codigo = this.#melhorar(j, item);
    else if (acao === 'usar') codigo = this.#usar(j, item);
    else codigo = 'invalido';
    return codigo ? { t: 'resultado', acao, item, ok: false, codigo } : { t: 'resultado', acao, item, ok: true };
  }

  /** Cobra o preço, se der. Devolve o código de erro ou null. */
  #pagar(j, preco) {
    if (j.ouro < preco) return 'ouro_insuficiente';
    j.ouro -= preco;
    return null;
  }

  #comprar(j, id) {
    const it = itemDaLoja(id);
    if (!it) return 'invalido';
    if (!naPlataforma(j, 'loja')) return 'nao_pousado';
    if (it.tipo === 'arma') {
      if (j.armas.includes(it.arma)) return 'ja_possui';
      const erro = this.#pagar(j, it.preco);
      if (erro) return erro;
      j.armas = [...j.armas, it.arma].sort((a, b) => a - b);
    } else if (it.tipo === 'armadura') {
      if (it.nivel <= j.armadura) return 'ja_possui'; // igual ou pior que a equipada
      const erro = this.#pagar(j, it.preco);
      if (erro) return erro;
      j.armadura = it.nivel;
    } else {
      if (j.itens[it.item] >= ITENS[it.item].max) return 'limite';
      const erro = this.#pagar(j, it.preco);
      if (erro) return erro;
      j.itens[it.item]++;
    }
    atualizarNave(j);
    return null;
  }

  #evoluir(j, id) {
    const op = opcaoNave(id);
    if (!op) return 'invalido';
    if (!naPlataforma(j, 'evolucao')) return 'nao_pousado';
    const marco = proximoMarco(j.evolucoes.length);
    if (!marco) return 'limite';
    if (j.nivel < marco.nivel) return 'nivel_insuficiente';
    const erro = this.#pagar(j, marco.preco);
    if (erro) return erro;
    j.evolucoes = [...j.evolucoes, op.id];
    atualizarNave(j);
    return null;
  }

  #melhorar(j, id) {
    const m = melhoriaMinerador(id);
    if (!m) return 'invalido';
    if (!naPlataforma(j, 'evolucao')) return 'nao_pousado';
    const niveis = this.niveis[j.time];
    const n = niveis[m.id];
    if (n >= m.precos.length) return 'limite';
    const erro = this.#pagar(j, m.precos[n]);
    if (erro) return erro;
    niveis[m.id] = n + 1;
    this.world.mineradores.melhorias[j.time] = efeitosMineradores(niveis);
    // Notícia para o time: quem pagou, o quê e o nível novo.
    this.world.eventos.push({ e: 'melhoria', id: j.id, nome: j.nome, time: j.time, melhoria: m.id, nivel: n + 1 });
    return null;
  }

  #usar(j, id) {
    const item = typeof id === 'string' && Object.hasOwn(ITENS, id) ? ITENS[id] : null;
    if (!item || !j.vivo) return 'invalido';
    if (!(j.itens[item.id] > 0)) return 'sem_item';
    const tick = this.world.tick;
    if (tick < j.itemPronto[item.id]) return 'recarga';
    const s = j.ship;
    if (item.id === 'reparo') {
      if (s.hp >= s.maxHp) return 'cheio';
      s.hp = Math.min(s.maxHp, s.hp + s.maxHp * item.cura);
    } else {
      if (s.en >= s.maxEn) return 'cheio';
      s.en = s.maxEn;
      s.boostTravado = false;
    }
    j.itens[item.id]--;
    j.itemPronto[item.id] = tick + Math.round(item.recargaS / DT);
    return null;
  }

  /**
   * O que vai no `me` do snapshot além da nave: armadura, itens (carga), recarga
   * dos itens em s e as evoluções da nave.
   */
  paraMe(j) {
    const tick = this.world.tick;
    return {
      armadura: j.armadura,
      itens: { ...j.itens },
      cdItens: Object.fromEntries(ORDEM_ITENS.map((id) => [id, Math.max(0, +((j.itemPronto[id] - tick) * DT).toFixed(1))])),
      evolucoes: j.evolucoes,
    };
  }
}
