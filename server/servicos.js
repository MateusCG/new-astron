// Loja e Evolução no servidor (DESIGN-PARTIDA.md): valida e cobra as compras, guarda
// o que cada piloto e cada time têm, e aplica os efeitos na nave e nos mineradores.
// Os dados (preços, efeitos, limites, as contas do inventário) ficam em
// shared/loja.js, shared/evolucao.js e shared/naves.js (as naves da Evolução).
//
// O cliente só PEDE ({t:'comprar', item}, {t:'evoluir', opcao:'nave'}, {t:'melhorar',
// melhoria}, {t:'reconstruir', torreta}, {t:'usar', item}, {t:'pontos', atributo,
// qtd}, {t:'equipar', slot, inst}, {t:'vender', inst}, {t:'evoluirItem', inst});
// nada do pedido é confiado além do id, que tem de existir no catálogo ou no
// inventário do piloto (qualquer outra coisa, string malformada inclusive, vira
// 'invalido'). Para comprar, evoluir a nave ou melhorar o piloto tem de estar vivo,
// POUSADO E PARADO na plataforma do serviço certo da PRÓPRIA base (Loja para
// comprar, Evolução para evoluir, melhorar e reconstruir); usar um item vale em
// qualquer lugar. Arma só da raça e da classe do piloto (armasDisponiveis; de outra,
// 'invalido'); equipamento só da classe (podeUsar; de outra, 'invalido').
// A resposta é {t:'resultado', acao, item, ok, codigo?}, com código estável que o
// cliente traduz: nao_pousado, ouro_insuficiente, nivel_insuficiente, ja_possui,
// limite, invalido, sem_item, recarga, cheio (item cheio ou compartimento cheio),
// equipado, e nos pontos sem_pontos e maximo.
//
// Inventário por instância (como o INVENTORY do original): cada coisa comprada é um
// objeto do piloto em j.inv, { id, tipo: 'arma' | 'equip', chave, nivel, pago,
// fabrica? } (id inteiro, crescente por piloto: j.invProx). A nave leva 2 armas
// (encaixes Z/X, escolhidos no comando a/a2), 1 escudo, 1 armadura e 2
// potenciadores (j.equipado: ids de instância); o resto é o COMPARTIMENTO, com no
// máximo COMPARTIMENTO_MAX (shared/loja.js: noCompartimento). Por pedido:
// - comprar (na Loja): cria a instância V1 no compartimento, sem equipar; arma, até
//   ARMA_COPIAS_MAX cópias (a de fábrica conta; passou, 'ja_possui'), cada uma com a
//   sua versão (o encaixe Z/X do comando escolhe a instância pelo id); compartimento
//   cheio, 'cheio'. Equipamento pode repetir à vontade (cada um com a sua versão).
// - equipar ({slot: 'escudo' | 'armadura' | 'pot1' | 'pot2', inst: id | null}): em
//   QUALQUER lugar, vivo (morto, 'invalido'); a instância tem de estar no
//   compartimento (ou já num encaixe: no mesmo nada muda, no outro encaixe de
//   potenciador as duas trocam de lugar); sem ela, 'sem_item'; categoria errada,
//   outra classe ou slot ruim, 'invalido'; null tira para o compartimento (cheio,
//   'cheio'). Trocar de escudo zera o escudo atual (sem trocar para encher).
// - vender: pousado e parado numa área de pouso da própria base (senão
//   'nao_pousado'); só do compartimento (na nave, 'equipado': a instância que está
//   num encaixe Z/X, s.encInst, ou de equipamento); arma de fábrica,
//   'invalido'; dá precoVenda (metade do pago, para baixo).
// - evoluirItem: pousado e parado na própria base (senão 'nao_pousado'); vale no
//   compartimento e na nave; paga a taxa de tuning da versão (precoEvoluirInst), que
//   soma no pago; na V8, 'limite'. Sem nível do piloto (o limite é o ouro). Muda só
//   aquela instância: a outra cópia da mesma arma fica na versão dela.
//
// Pontos do piloto ({t:'pontos', atributo, qtd}): põe até qtd (1 a PONTO_MAX,
// padrão 1) pontos livres no atributo (distribuirPontos em shared/status.js), em
// qualquer lugar, vivo ou morto; não há devolver. Vão em j.pontos e zeram com o
// nível na partida nova.
//
// Onde fica cada coisa: a posse do piloto fica no JOGADOR (j.inv, j.invProx,
// j.equipado, j.itens, j.itemPronto, j.tier, j.pontos), porque a nave é recriada a
// cada renascimento; prepararNave() tira dela o que vai na nave junto com o nível
// (as armas por instância em s.armasInst, [[id, índice, nível], ...], e as possuídas
// em s.armas, derivadas de j.inv: armasInstDoInv, armasDoInv; os encaixes Z/X em
// s.encInst, que o comando escolhe e o renascimento mantém) e aplica o status do piloto (aplicarStatus:
// statusDoPiloto de shared/status.js com as instâncias equipadas, guardado em
// j.status): HP máximo (nave + nível + hpExtra), energia máxima (nave + enExtra),
// regenerações (nave + extras), escudo (s.maxEscudo, s.regenEscudo), velocidade e
// aceleração (s.velMult, s.acelMult) e a recarga por tipo de dano (s.recargaMult),
// que o stepShip lê (a predição acompanha), e o tamanho da nave da linha (s.corpo, que
// a rocha para, e s.raio, que o tiro e as áreas acertam; crescem com o tier). O
// dano (poder, resistência, penetração, crítico e o escudo) o World aplica em #ferir
// e multDanoDe, lendo j.status.
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

import { VEL_TOQUE, DT, NAVE_SEM_CLASSE, SHIP_RADIUS, aplicarNave, armasDisponiveis, derivarEncaixes } from '../shared/sim.js';
import { areaPouso } from '../shared/terrain.js';
import {
  itemDaLoja,
  ITENS,
  ORDEM_ITENS,
  COMPARTIMENTO_MAX,
  ARMA_COPIAS_MAX,
  copiasDaArma,
  equipadoVazio,
  invInicial,
  instDoInv,
  armasDoInv,
  armasInstDoInv,
  naNave,
  noCompartimento,
  slotAceita,
  precoVenda,
  precoEvoluirInst,
} from '../shared/loja.js';
import { naveDe } from '../shared/naves.js';
import { equipamento, podeUsar, CATEGORIA_DO_SLOT, ORDEM_TIPOS_DANO } from '../shared/equipamentos.js';
import { distribuirPontos, pontosLivres, multRecarga } from '../shared/status.js';
import {
  melhoriaMinerador,
  efeitosMineradores,
  niveisIniciais,
  MELHORIA_TORRETAS,
  precoNivelTorretas,
  PRECO_RECONSTRUIR,
} from '../shared/evolucao.js';
import { hpMaxDoJogador, naveDoJogador, statusDoJogador } from './progressao.js';

const ACOES = ['comprar', 'evoluir', 'melhorar', 'reconstruir', 'usar', 'pontos', 'equipar', 'vender', 'evoluirItem'];
/** Pedidos sobre uma instância do inventário: o `item` da resposta é o id dela. */
const POR_INSTANCIA = new Set(['vender', 'evoluirItem']);

export { equipadoVazio };

/**
 * Campos de loja e evolução de um piloto no começo da partida: o inventário com as
 * duas armas de fábrica da raça `race` (ids a partir de `proxId`, para o id nunca
 * repetir no mesmo piloto), nada equipado, sem itens e a primeira nave da linha.
 */
export function novoEquipamento(race, proxId = 1) {
  const { inv, proxId: invProx } = invInicial(race, proxId);
  return {
    inv, // instâncias: { id, tipo: 'arma' | 'equip', chave, nivel, pago, fabrica? }
    invProx, // próximo id de instância
    equipado: equipadoVazio(), // o que está na nave: { escudo, armadura, pot: [a, b] } (id ou null)
    itens: Object.fromEntries(ORDEM_ITENS.map((id) => [id, 0])), // carga de cada item
    itemPronto: Object.fromEntries(ORDEM_ITENS.map((id) => [id, 0])), // tick em que pode usar de novo
    tier: 0, // nave da linha comprada na Evolução (0 = a primeira, de fábrica)
  };
}

/** Instâncias do compartimento do piloto (o que tem e não está na nave). */
export function compartimento(j) {
  return noCompartimento(j.inv, j.equipado, j.ship?.encInst);
}

/** Cabe mais um item no compartimento? */
function cabe(j) {
  return compartimento(j).length < COMPARTIMENTO_MAX;
}

/**
 * Põe na nave os números da nave da linha (tier da partida) com o status do piloto
 * (pontos e equipamento), e guarda o status em j.status (o dano lê de lá). Não mexe
 * em HP, energia e escudo atuais: quem chama decide (prepararNave enche, atualizarNave
 * acompanha a mudança).
 */
function aplicarStatus(j) {
  const s = j.ship;
  const nave = naveDoJogador(j);
  const st = statusDoJogador(j);
  j.status = st;
  aplicarNave(s, nave);
  s.raio = nave?.raio ?? SHIP_RADIUS; // alvo: tiro e área
  s.corpo = nave?.corpo ?? SHIP_RADIUS; // o que a rocha e as construções param
  s.armas = armasDoInv(j.inv);
  s.armasInst = armasInstDoInv(j.inv);
  delete s.niveis; // com inventário a versão é da instância (s.nivEnc, por encaixe)
  derivarEncaixes(s); // a versão nova (ou a venda) vale na hora, sem esperar o comando
  s.maxHp = hpMaxDoJogador(j, st);
  s.maxEn = Math.round((nave?.energia ?? NAVE_SEM_CLASSE.energia) + st.enExtra);
  s.regenEn += st.regenEnExtra;
  s.regenHpVoo += st.regenHpExtra;
  s.regenHpPousada += st.regenHpExtra;
  s.maxEscudo = st.maxEscudo;
  s.regenEscudo = st.regenEscudo;
  s.velMult = st.velMult;
  s.acelMult = st.acelMult;
  s.recargaMult = Object.fromEntries(ORDEM_TIPOS_DANO.map((t) => [t, multRecarga(st.recarga[t])]));
  // Sem os bônus por tempo: o World (server/game.js, #bonusDaNave) põe os bônus em
  // cima destes a cada tick.
  j.baseNave = { velMult: s.velMult, regenEn: s.regenEn };
}

/**
 * Nave nova (nascimento ou renascimento): os status da nave da linha (tier da
 * partida) com os pontos e o equipamento, a posse de armas, e HP, energia e escudo
 * cheios.
 */
export function prepararNave(j) {
  aplicarStatus(j);
  const s = j.ship;
  s.hp = s.maxHp;
  s.en = s.maxEn;
  s.escudo = s.maxEscudo;
}

/**
 * Compra, evolução, pontos ou troca de equipamento com a nave em uso (inclusive a
 * troca de nave na Evolução): o que mudou de máximo muda junto no atual (comprar não
 * cura o resto nem fere; nave nova com menos HP máximo tira a diferença, sem matar),
 * e a energia nunca passa do máximo. O escudo nunca sobe com a troca (só recupera
 * com o tempo, ou pousado na base): trocar o ESCUDO equipado zera o atual, para não
 * dar para encher trocando de escudo; o resto só o limita ao máximo novo.
 */
function atualizarNave(j, { trocouEscudo = false } = {}) {
  const s = j.ship;
  const antes = { hp: s.maxHp, en: s.maxEn };
  aplicarStatus(j);
  if (s.hp > 0) s.hp = Math.min(s.maxHp, Math.max(1, s.hp + s.maxHp - antes.hp));
  s.en = Math.max(0, Math.min(s.maxEn, s.en + Math.max(0, s.maxEn - antes.en)));
  s.escudo = trocouEscudo ? 0 : Math.min(s.escudo ?? 0, s.maxEscudo);
}

/** Pousado e parado em qualquer área de pouso da própria base (anel ou plataformas)? */
export function pousadoNaPropriaBase(j) {
  const s = j.ship;
  if (!j.vivo || !s.pousado || Math.hypot(s.vx, s.vz) >= VEL_TOQUE) return false;
  const a = areaPouso(s.x, s.z);
  return !!a && (a.base ?? a.time) === j.time;
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
    const id =
      acao === 'evoluir'
        ? msg?.opcao
        : acao === 'melhorar'
          ? msg?.melhoria
          : acao === 'reconstruir'
            ? msg?.torreta
            : acao === 'pontos'
              ? msg?.atributo
              : acao === 'equipar'
                ? msg?.slot
                : POR_INSTANCIA.has(acao)
                  ? msg?.inst
                  : msg?.item;
    const item = typeof id === 'string' ? id.slice(0, 32) : POR_INSTANCIA.has(acao) && Number.isInteger(id) ? id : null;
    let codigo;
    if (!j) codigo = 'invalido';
    else if (acao === 'pontos') codigo = this.#pontos(j, item, msg?.qtd);
    else if (acao === 'equipar') codigo = this.#equipar(j, item, msg?.inst);
    else if (acao === 'vender') codigo = this.#vender(j, item);
    else if (acao === 'evoluirItem') codigo = this.#evoluirItem(j, item);
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
    if (it.tipo === 'item') {
      if (j.itens[it.item] >= ITENS[it.item].max) return 'limite';
      const erro = this.#pagar(j, it.preco);
      if (erro) return erro;
      j.itens[it.item]++;
      return null;
    }
    let chave;
    if (it.tipo === 'arma') {
      if (!armasDisponiveis(j.ship.race, j.classe).includes(it.arma)) return 'invalido'; // outra raça ou classe
      chave = id;
      if (copiasDaArma(j.inv, chave) >= ARMA_COPIAS_MAX) return 'ja_possui'; // até duas cópias
    } else {
      if (!podeUsar(it.chave, j.classe)) return 'invalido'; // de outra classe
      chave = it.chave;
    }
    if (!cabe(j)) return 'cheio';
    const erro = this.#pagar(j, it.preco);
    if (erro) return erro;
    j.inv = [...j.inv, { id: j.invProx++, tipo: it.tipo, chave, nivel: 1, pago: it.preco }];
    atualizarNave(j); // arma nova entra em s.armasInst (o comando já pode pô-la num encaixe)
    return null;
  }

  /**
   * Vende a instância `inst` do compartimento (pousado e parado na própria base) por
   * precoVenda (metade do que se pagou nela, compra e evoluções).
   */
  #vender(j, inst) {
    if (!Number.isInteger(inst)) return 'invalido';
    if (!pousadoNaPropriaBase(j)) return 'nao_pousado';
    const x = instDoInv(j.inv, inst);
    if (!x) return 'sem_item';
    if (x.fabrica) return 'invalido'; // as de fábrica não se vendem
    if (naNave(x, j.equipado, j.ship.encInst)) return 'equipado';
    j.ouro += precoVenda(x);
    j.inv = j.inv.filter((y) => y !== x);
    atualizarNave(j);
    return null;
  }

  /**
   * Sobe a instância `inst` (no compartimento ou na nave) para a próxima versão,
   * pousado e parado na própria base; a taxa paga soma no `pago` dela. Arma: a nave
   * lê a versão nova de s.armasInst (só a daquela cópia; no encaixe, s.nivEnc muda na
   * hora); equipamento na nave: o status muda na hora.
   */
  #evoluirItem(j, inst) {
    if (!Number.isInteger(inst)) return 'invalido';
    if (!pousadoNaPropriaBase(j)) return 'nao_pousado';
    const x = instDoInv(j.inv, inst);
    if (!x) return 'sem_item';
    const preco = precoEvoluirInst(x);
    if (preco === null) return 'limite';
    const erro = this.#pagar(j, preco);
    if (erro) return erro;
    j.inv = j.inv.map((y) => (y === x ? { ...x, nivel: x.nivel + 1, pago: x.pago + preco } : y));
    atualizarNave(j);
    return null;
  }

  /** Distribui pontos do piloto (em qualquer lugar, vivo ou morto). */
  #pontos(j, atributo, qtd = 1) {
    const r = distribuirPontos(j.nivel, j.pontos, atributo, qtd);
    if (!r.ok) return r.codigo;
    j.pontos = r.pontos;
    atualizarNave(j);
    return null;
  }

  /**
   * Põe no encaixe `slot` a instância `inst` do compartimento (ou tira, com null),
   * em qualquer lugar, vivo. A que estava no encaixe volta ao compartimento.
   */
  #equipar(j, slot, inst) {
    if (!Object.hasOwn(CATEGORIA_DO_SLOT, slot ?? '')) return 'invalido';
    if (inst !== null && !Number.isInteger(inst)) return 'invalido';
    if (!j.vivo) return 'invalido';
    const eq = j.equipado;
    const pot = slot === 'pot1' ? 0 : slot === 'pot2' ? 1 : -1;
    const atual = pot >= 0 ? eq.pot[pot] : eq[slot];
    if (inst === null) {
      if (atual === null) return null; // já vazio
      if (!cabe(j)) return 'cheio'; // não tem para onde ir
    } else {
      const x = instDoInv(j.inv, inst);
      if (!x) return 'sem_item';
      if (x.tipo !== 'equip' || !slotAceita(slot, equipamento(x.chave)?.categoria) || !podeUsar(x.chave, j.classe)) return 'invalido';
      if (atual === inst) return null; // já está aí
      if (naNave(x, eq, j.ship.encInst)) {
        // Só pode estar no outro encaixe de potenciador: os dois trocam de lugar.
        if (pot < 0 || eq.pot[1 - pot] !== inst) return 'invalido';
        eq.pot = pot === 0 ? [inst, atual] : [atual, inst];
        atualizarNave(j);
        return null;
      }
    }
    if (pot >= 0) eq.pot = pot === 0 ? [inst, eq.pot[1]] : [eq.pot[0], inst];
    else eq[slot] = inst;
    atualizarNave(j, { trocouEscudo: slot === 'escudo' });
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
   * velocidade, regenEn, regenHpVoo e regenHpPousada, os encaixes Z/X (encInst,
   * encaixes, nivEnc), as armas por instância em `armasInst` e as possuídas em
   * `armas`, escudo, maxEscudo,
   * regenEscudo, velMult, acelMult e recargaMult): pontos e pontos livres, o
   * inventário (inv, cópia das instâncias), o tamanho do compartimento (compMax), o
   * que está na nave (equipado, ids), o status do piloto já somado (para a janela
   * STATUS), itens (carga) e recarga dos itens em s.
   */
  paraMe(j) {
    const tick = this.world.tick;
    return {
      pontos: { ...j.pontos },
      pontosLivres: pontosLivres(j.nivel, j.pontos),
      inv: j.inv.map((x) => ({ ...x })),
      compMax: COMPARTIMENTO_MAX,
      equipado: { escudo: j.equipado.escudo, armadura: j.equipado.armadura, pot: [...j.equipado.pot] },
      status: j.status,
      itens: { ...j.itens },
      cdItens: Object.fromEntries(ORDEM_ITENS.map((id) => [id, Math.max(0, +((j.itemPronto[id] - tick) * DT).toFixed(1))])),
    };
  }
}
