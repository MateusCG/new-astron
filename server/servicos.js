// Loja e Evolução no servidor (DESIGN-PARTIDA.md): valida e cobra as compras, guarda
// o que cada piloto e cada time têm, e aplica os efeitos na nave e nos mineradores.
// Os dados (preços, efeitos, limites) ficam em shared/loja.js, shared/evolucao.js e
// shared/naves.js (as naves da Evolução).
//
// O cliente só PEDE ({t:'comprar', item}, {t:'evoluir', opcao:'nave'}, {t:'melhorar',
// melhoria}, {t:'reconstruir', torreta}, {t:'usar', item}); nada do pedido é confiado além do id, que tem de
// existir no catálogo (qualquer outra coisa, string malformada inclusive, vira
// 'invalido'). Para comprar, evoluir ou melhorar o piloto tem de estar vivo,
// POUSADO E PARADO na plataforma do serviço certo da PRÓPRIA base (Loja para
// comprar, Evolução para evoluir, melhorar e reconstruir); usar um item vale em
// qualquer lugar. Evoluir uma ARMA é uma compra da Loja ({t:'comprar',
// item:'evoluir:<arma>'}): exige possuir a arma (senão 'sem_item'), e no máximo dá 'limite'.
// A resposta é {t:'resultado', acao, item, ok, codigo?}, com código estável que o
// cliente traduz: nao_pousado, ouro_insuficiente, nivel_insuficiente, ja_possui,
// limite, invalido, e no uso de item sem_item, recarga e cheio.
//
// Onde fica cada coisa: a posse do piloto fica no JOGADOR (j.armas, j.niveisArmas,
// j.armadura, j.itens, j.itemPronto, j.tier), porque a nave é recriada a cada
// renascimento; prepararNave() copia tudo para a nave nova junto com o nível (HP e
// energia máximos, velocidade, armas).
//
// Evolução da nave ({t:'evoluir', opcao:'nave'}): compra a PRÓXIMA nave da linha
// da raça e classe do piloto (shared/naves.js), com o nível exigido (a cada 5) e o
// preço dela; na última, 'limite'. O tier comprado fica em j.tier e vale para os
// renascimentos da partida; a troca é na hora (a nave em uso ganha os status novos,
// e o HP e a energia atuais sobem ou descem com o máximo) e vira o evento 'nave',
// para todos trocarem o modelo. As melhorias dos mineradores ficam por time
// em this.niveis e viram world.mineradores.melhorias[time]. Tudo é da partida:
// novoEquipamento() e reiniciar() zeram na seguinte (World, #passoPartida).
//
// Torretas do time (Evolução): {t:'melhorar', melhoria:'torretas'} sobe o nível das
// quatro torretas do time de quem paga (limite: TORRETA_NIVEL_MAX) e
// {t:'reconstruir', torreta} reconstrói uma torreta destruída DO PRÓPRIO TIME (a do
// outro time, ou id que não existe, é 'invalido'; de pé ou já em obra, 'ja_possui').
// O nível e a vida ficam em world.torretas (server/torretas.js), que zera sozinho
// na partida seguinte. Como nas melhorias dos mineradores, o time recebe a notícia
// (evento 'melhoria' com melhoria 'torretas'; a reconstrução vira o evento 'torreta').

import { VEL_TOQUE, ARMAS, ARMAS_INICIAIS, DT, NAVE_SEM_CLASSE, aplicarNave } from '../shared/sim.js';
import { areaPouso } from '../shared/terrain.js';
import { itemDaLoja, armadura, ITENS, ORDEM_ITENS, niveisArmasIniciais, precoEvoluirArma } from '../shared/loja.js';
import { naveDe } from '../shared/naves.js';
import {
  melhoriaMinerador,
  efeitosMineradores,
  niveisIniciais,
  MELHORIA_TORRETAS,
  precoNivelTorretas,
  PRECO_RECONSTRUIR,
} from '../shared/evolucao.js';
import { hpMaxDoJogador, naveDoJogador } from './progressao.js';

const ACOES = ['comprar', 'evoluir', 'melhorar', 'reconstruir', 'usar'];

/** Campos de loja e evolução de um piloto no começo da partida. */
export function novoEquipamento() {
  return {
    armas: [...ARMAS_INICIAIS], // posse: as de fábrica e as compradas
    niveisArmas: niveisArmasIniciais(), // nível de cada arma (índice em ARMAS), evoluído na Loja
    armadura: -1, // nível em ARMADURAS (-1 = nenhuma)
    itens: Object.fromEntries(ORDEM_ITENS.map((id) => [id, 0])), // carga de cada item
    itemPronto: Object.fromEntries(ORDEM_ITENS.map((id) => [id, 0])), // tick em que pode usar de novo
    tier: 0, // nave da linha comprada na Evolução (0 = a primeira, de fábrica)
  };
}

/** Fração do dano que a armadura da Loja do piloto segura (0 sem armadura). */
export function reducaoArmadura(j) {
  return armadura(j.armadura)?.reducao ?? 0;
}

/** Energia máxima da nave do piloto (a da nave da linha). */
export function enMaxDoJogador(j) {
  return naveDoJogador(j)?.energia ?? NAVE_SEM_CLASSE.energia;
}

/** Multiplicador de velocidade da nave do piloto (armadura pesada). */
export function velMultDoJogador(j) {
  return armadura(j.armadura)?.velMult ?? 1;
}

/**
 * Nave nova (nascimento ou renascimento): os status da nave da linha (tier da
 * partida), a posse de armas e HP e energia máximos (nave, nível, armadura),
 * cheios, e a velocidade.
 */
export function prepararNave(j) {
  const s = j.ship;
  aplicarNave(s, naveDoJogador(j));
  s.armas = [...j.armas];
  s.maxHp = hpMaxDoJogador(j);
  s.hp = s.maxHp;
  s.maxEn = enMaxDoJogador(j);
  s.en = s.maxEn;
  s.velMult = velMultDoJogador(j);
}

/**
 * Compra com a nave em uso (inclusive a troca de nave na Evolução): o que mudou de
 * máximo muda junto no atual (comprar não cura o resto nem fere; nave nova com
 * menos HP máximo tira a diferença, sem matar), e a energia nunca passa do máximo.
 */
function atualizarNave(j) {
  const s = j.ship;
  const antes = { hp: s.maxHp, en: s.maxEn };
  aplicarNave(s, naveDoJogador(j));
  s.armas = [...j.armas];
  const hp = hpMaxDoJogador(j);
  if (s.hp > 0) s.hp = Math.min(hp, Math.max(1, s.hp + hp - antes.hp));
  s.maxHp = hp;
  const en = enMaxDoJogador(j);
  s.en = Math.max(0, Math.min(en, s.en + Math.max(0, en - antes.en)));
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
    const id = acao === 'evoluir' ? msg?.opcao : acao === 'melhorar' ? msg?.melhoria : acao === 'reconstruir' ? msg?.torreta : msg?.item;
    const item = typeof id === 'string' ? id.slice(0, 32) : null;
    let codigo;
    if (!j) codigo = 'invalido';
    else if (acao === 'comprar') codigo = this.#comprar(j, item);
    else if (acao === 'evoluir') codigo = this.#evoluir(j, item);
    else if (acao === 'melhorar') codigo = item === MELHORIA_TORRETAS.id ? this.#melhorarTorretas(j) : this.#melhorar(j, item);
    else if (acao === 'reconstruir') codigo = this.#reconstruir(j, item);
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
    if (it.tipo === 'evoluirArma') return this.#evoluirArma(j, it.arma);
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

  /** Sobe um nível da arma de índice `a` (já pousado na Loja). O efeito é lido no World. */
  #evoluirArma(j, a) {
    if (!j.armas.includes(a)) return 'sem_item';
    const nivel = j.niveisArmas[a];
    const preco = precoEvoluirArma(ARMAS[a], nivel);
    if (preco === null) return 'limite';
    const erro = this.#pagar(j, preco);
    if (erro) return erro;
    j.niveisArmas = j.niveisArmas.map((n, i) => (i === a ? n + 1 : n));
    return null;
  }

  /** Compra a próxima nave da linha (opcao 'nave', a única). */
  #evoluir(j, id) {
    if (id !== 'nave') return 'invalido';
    if (!naPlataforma(j, 'evolucao')) return 'nao_pousado';
    const proxima = naveDe(j.ship.race, j.classe, j.tier + 1);
    if (!proxima) return 'limite';
    if (j.nivel < proxima.nivel) return 'nivel_insuficiente';
    const erro = this.#pagar(j, proxima.preco);
    if (erro) return erro;
    j.tier = proxima.tier;
    atualizarNave(j);
    // Notícia e troca de modelo para todos (o snapshot também traz o tier).
    this.world.eventos.push({ e: 'nave', id: j.id, nome: j.nome, time: j.time, tier: proxima.tier, nave: proxima.nome });
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

  /** Próximo nível das torretas do time de quem paga (vale para as quatro). */
  #melhorarTorretas(j) {
    if (!naPlataforma(j, 'evolucao')) return 'nao_pousado';
    const torretas = this.world.torretas;
    const preco = precoNivelTorretas(torretas.nivel[j.time]);
    if (preco == null) return 'limite';
    const erro = this.#pagar(j, preco);
    if (erro) return erro;
    const nivel = torretas.subirNivel(j.time);
    this.world.eventos.push({ e: 'melhoria', id: j.id, nome: j.nome, time: j.time, melhoria: MELHORIA_TORRETAS.id, nivel });
    return null;
  }

  /** Reconstrói a torreta `id` (destruída, do time de quem paga). */
  #reconstruir(j, id) {
    const t = this.world.torretas.torreta(id);
    if (!t || t.time !== j.time) return 'invalido';
    if (!naPlataforma(j, 'evolucao')) return 'nao_pousado';
    if (t.viva || t.obra) return 'ja_possui';
    const erro = this.#pagar(j, PRECO_RECONSTRUIR);
    if (erro) return erro;
    this.world.torretas.reconstruir(id, j);
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
   * O que vai no `me` do snapshot além da nave (que já traz classe, tier,
   * velocidade, regenEn, regenHpVoo e regenHpPousada): armadura, itens (carga), recarga dos itens em s e o
   * nível de cada arma (índice em ARMAS).
   */
  paraMe(j) {
    const tick = this.world.tick;
    return {
      armadura: j.armadura,
      itens: { ...j.itens },
      cdItens: Object.fromEntries(ORDEM_ITENS.map((id) => [id, Math.max(0, +((j.itemPronto[id] - tick) * DT).toFixed(1))])),
      niveisArmas: j.niveisArmas,
    };
  }
}
