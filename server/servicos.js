// Loja e Evolução no servidor (DESIGN-PARTIDA.md): valida e cobra as compras, guarda
// o que cada piloto e cada time têm, e aplica os efeitos na nave e nos mineradores.
// Os dados (preços, efeitos, limites) ficam em shared/loja.js, shared/evolucao.js e
// shared/naves.js (as naves da Evolução).
//
// O cliente só PEDE ({t:'comprar', item}, {t:'evoluir', opcao:'nave'}, {t:'melhorar',
// melhoria}, {t:'reconstruir', torreta}, {t:'usar', item}, {t:'pontos', atributo,
// qtd}, {t:'equipar', slot, item}); nada do pedido é confiado além do id, que tem de
// existir no catálogo (qualquer outra coisa, string malformada inclusive, vira
// 'invalido'). Para comprar, evoluir ou melhorar o piloto tem de estar vivo,
// POUSADO E PARADO na plataforma do serviço certo da PRÓPRIA base (Loja para
// comprar, Evolução para evoluir, melhorar e reconstruir); usar um item vale em
// qualquer lugar. Arma só da raça e da classe do piloto (armasDisponiveis; de outra,
// 'invalido'); equipamento só da classe (podeUsar; de outra, 'invalido'). Evoluir
// uma ARMA ou um EQUIPAMENTO é uma compra da Loja ({t:'comprar',
// item:'evoluir:<chave>'}): sobe para a próxima versão do original, exige possuir o
// item (senão 'sem_item'), em qualquer nível do piloto; na V8, 'limite'.
// A resposta é {t:'resultado', acao, item, ok, codigo?}, com código estável que o
// cliente traduz: nao_pousado, ouro_insuficiente, nivel_insuficiente, ja_possui,
// limite, invalido, no uso de item sem_item, recarga e cheio, e nos pontos
// sem_pontos e maximo.
//
// Pontos do piloto ({t:'pontos', atributo, qtd}): põe até qtd (1 a PONTO_MAX,
// padrão 1) pontos livres no atributo (distribuirPontos em shared/status.js), em
// qualquer lugar, vivo ou morto; não há devolver. Vão em j.pontos e zeram com o
// nível na partida nova.
//
// Equipamento ({t:'equipar', slot, item}): a nave leva 1 escudo, 1 armadura e 2
// potenciadores (slot 'escudo' | 'armadura' | 'pot1' | 'pot2'); item = chave de um
// equipamento possuído ou null (tira). Só pousado e parado em qualquer área de pouso
// da PRÓPRIA base (anel ou plataformas; senão 'nao_pousado'), para a build não
// mudar no meio da briga; sem o item, 'sem_item'; categoria errada, outra classe ou
// slot que não existe, 'invalido'; o mesmo potenciador nos dois slots só com as duas
// cópias (j.copias; com uma só, 'sem_item').
// Comprar um equipamento com o encaixe da categoria vazio já o equipa.
//
// Onde fica cada coisa: a posse do piloto fica no JOGADOR (j.armas = as compradas,
// j.niveisArmas = índice → nível das evoluídas, j.equip = chave → nível dos
// equipamentos possuídos, j.equipado = o que está na nave, j.itens, j.itemPronto,
// j.tier, j.pontos), porque a nave é recriada a cada renascimento; prepararNave()
// copia tudo para a nave nova junto com o nível (armas: as de fábrica da raça mais
// as compradas em s.armas, e os níveis em s.niveis) e aplica o status do piloto
// (aplicarStatus: statusDoPiloto de shared/status.js, guardado em j.status): HP
// máximo (nave + nível + hpExtra), energia máxima (nave + enExtra), regenerações
// (nave + extras), escudo (s.maxEscudo, s.regenEscudo), velocidade e aceleração
// (s.velMult, s.acelMult) e a recarga por tipo de dano (s.recargaMult), que o
// stepShip lê (a predição acompanha). O dano (poder, resistência, penetração,
// crítico e o escudo) o World aplica em #ferir e multDanoDe, lendo j.status.
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

import { VEL_TOQUE, DT, NAVE_SEM_CLASSE, aplicarNave, armasIniciais, armasDisponiveis } from '../shared/sim.js';
import { areaPouso } from '../shared/terrain.js';
import { itemDaLoja, ITENS, ORDEM_ITENS, niveisArmasIniciais, precoEvoluirArma, copiasMax, precoCopiaEquip, precoEvoluirComCopias } from '../shared/loja.js';
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

const ACOES = ['comprar', 'evoluir', 'melhorar', 'reconstruir', 'usar', 'pontos', 'equipar'];

/** Encaixes de equipamento vazios (o que vai em j.equipado). */
export function equipadoVazio() {
  return { escudo: null, armadura: null, pot: [null, null] };
}

/** Quantas cópias do equipamento `chave` o piloto tem (0 se nenhuma). */
export function copiasDe(j, chave) {
  return Object.hasOwn(j.equip, chave) ? (j.copias?.[chave] ?? 1) : 0;
}

/** Campos de loja e evolução de um piloto no começo da partida. */
export function novoEquipamento() {
  return {
    armas: [], // posse: as compradas (as de fábrica da raça valem sempre: armasDoPiloto)
    niveisArmas: niveisArmasIniciais(), // índice em ARMAS → nível (V1..V8), só as evoluídas
    equip: {}, // posse de equipamentos: chave → nível (V1..V8)
    copias: {}, // chave → cópias no total, só do potenciador comprado 2 vezes (as duas na mesma versão)
    equipado: equipadoVazio(), // o que está na nave: { escudo, armadura, pot: [a, b] } (chave ou null)
    itens: Object.fromEntries(ORDEM_ITENS.map((id) => [id, 0])), // carga de cada item
    itemPronto: Object.fromEntries(ORDEM_ITENS.map((id) => [id, 0])), // tick em que pode usar de novo
    tier: 0, // nave da linha comprada na Evolução (0 = a primeira, de fábrica)
  };
}

/** Armas que o piloto possui (índices): as de fábrica da raça e as compradas. */
export function armasDoPiloto(j) {
  return [...new Set([...armasIniciais(j.ship.race), ...j.armas])];
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
  s.armas = armasDoPiloto(j);
  s.niveis = { ...j.niveisArmas };
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
                : msg?.item;
    const item = typeof id === 'string' ? id.slice(0, 32) : null;
    let codigo;
    if (!j) codigo = 'invalido';
    else if (acao === 'pontos') codigo = this.#pontos(j, item, msg?.qtd);
    else if (acao === 'equipar') codigo = this.#equipar(j, item, msg?.item);
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
    if (it.tipo === 'evoluirEquip') return this.#evoluirEquip(j, it.chave);
    if (it.tipo === 'equip') return this.#comprarEquip(j, it.chave);
    if (it.tipo === 'arma') {
      if (!armasDisponiveis(j.ship.race, j.classe).includes(it.arma)) return 'invalido'; // outra raça ou classe
      if (armasDoPiloto(j).includes(it.arma)) return 'ja_possui';
      const erro = this.#pagar(j, it.preco);
      if (erro) return erro;
      j.armas = [...j.armas, it.arma].sort((a, b) => a - b);
    } else {
      if (j.itens[it.item] >= ITENS[it.item].max) return 'limite';
      const erro = this.#pagar(j, it.preco);
      if (erro) return erro;
      j.itens[it.item]++;
    }
    atualizarNave(j);
    return null;
  }

  /** Sobe a arma de índice `a` para a próxima versão (já pousado na Loja); a nave lê a versão de s.niveis. */
  #evoluirArma(j, a) {
    if (!armasDoPiloto(j).includes(a)) return 'sem_item';
    const nivel = j.niveisArmas[a] ?? 1;
    const preco = precoEvoluirArma(a, nivel);
    if (preco === null) return 'limite';
    const erro = this.#pagar(j, preco);
    if (erro) return erro;
    j.niveisArmas = { ...j.niveisArmas, [a]: nivel + 1 };
    atualizarNave(j);
    return null;
  }

  /**
   * Compra a V1 de um equipamento (já pousado na Loja); com o encaixe da categoria
   * vazio, já equipa. Potenciador que o piloto já tem: compra a segunda cópia, na
   * versão da primeira e pelo que ela custou até ali (precoCopiaEquip).
   */
  #comprarEquip(j, chave) {
    if (!podeUsar(chave, j.classe)) return 'invalido'; // de outra classe
    const tem = copiasDe(j, chave);
    if (tem >= copiasMax(chave)) return 'ja_possui';
    const erro = this.#pagar(j, tem ? precoCopiaEquip(chave, j.equip[chave]) : equipamento(chave).preco);
    if (erro) return erro;
    if (tem) j.copias = { ...j.copias, [chave]: tem + 1 };
    else j.equip = { ...j.equip, [chave]: 1 };
    const cat = equipamento(chave).categoria;
    const eq = j.equipado;
    let trocouEscudo = false;
    if (cat === 'escudo' && !eq.escudo) {
      eq.escudo = chave;
      trocouEscudo = true;
    } else if (cat === 'armadura' && !eq.armadura) eq.armadura = chave;
    else if (cat === 'potenciador') {
      const vazio = eq.pot.indexOf(null);
      if (vazio >= 0) eq.pot[vazio] = chave;
    }
    atualizarNave(j, { trocouEscudo });
    return null;
  }

  /** Sobe o equipamento possuído para a próxima versão (já pousado na Loja); as cópias sobem juntas, pagando cada uma. */
  #evoluirEquip(j, chave) {
    if (!Object.hasOwn(j.equip, chave)) return 'sem_item';
    const nivel = j.equip[chave];
    const preco = precoEvoluirComCopias(chave, nivel, copiasDe(j, chave));
    if (preco === null) return 'limite';
    const erro = this.#pagar(j, preco);
    if (erro) return erro;
    j.equip = { ...j.equip, [chave]: nivel + 1 };
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

  /** Põe (ou tira, com item null) um equipamento possuído num encaixe da nave. */
  #equipar(j, slot, chave) {
    if (!Object.hasOwn(CATEGORIA_DO_SLOT, slot ?? '')) return 'invalido';
    if (chave !== null) {
      const e = equipamento(chave);
      if (!e || e.categoria !== CATEGORIA_DO_SLOT[slot] || !podeUsar(chave, j.classe)) return 'invalido';
    }
    if (!pousadoNaPropriaBase(j)) return 'nao_pousado';
    if (chave !== null && !Object.hasOwn(j.equip, chave)) return 'sem_item';
    const eq = j.equipado;
    if (slot === 'pot1' || slot === 'pot2') {
      const i = slot === 'pot1' ? 0 : 1;
      // O mesmo potenciador nos dois encaixes só com as duas cópias.
      if (chave !== null && eq.pot[1 - i] === chave && copiasDe(j, chave) < 2) return 'sem_item';
      eq.pot = i === 0 ? [chave, eq.pot[1]] : [eq.pot[0], chave];
      atualizarNave(j);
    } else {
      const trocou = eq[slot] !== chave;
      eq[slot] = chave;
      atualizarNave(j, { trocouEscudo: slot === 'escudo' && trocou });
    }
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
   * velocidade, regenEn, regenHpVoo e regenHpPousada, a posse de armas em `armas` e
   * os níveis delas em `niveis`, escudo, maxEscudo, regenEscudo, velMult, acelMult e
   * recargaMult): pontos e pontos livres, a posse de equipamentos (equip) e o que
   * está na nave (equipado), o status do piloto já somado (para a janela STATUS),
   * itens (carga) e recarga dos itens em s.
   */
  paraMe(j) {
    const tick = this.world.tick;
    return {
      pontos: { ...j.pontos },
      pontosLivres: pontosLivres(j.nivel, j.pontos),
      equip: { ...j.equip },
      copias: { ...j.copias },
      equipado: { escudo: j.equipado.escudo, armadura: j.equipado.armadura, pot: [...j.equipado.pot] },
      status: j.status,
      itens: { ...j.itens },
      cdItens: Object.fromEntries(ORDEM_ITENS.map((id) => [id, Math.max(0, +((j.itemPronto[id] - tick) * DT).toFixed(1))])),
    };
  }
}
