// Escudos, armaduras e potenciadores na interface: ícone, nome com a versão, detalhe
// do item (o "cartão" do original ao passar o mouse) e a tabela Ph. / El. / Op. ×
// Arma Z / Arma X / Resistência. Usado pela Loja (servicos.js), pelo INVENTÁRIO
// (inventario.js) e pelo STATUS (status.js), para os três mostrarem o mesmo número.
//
// Cores dos tipos de dano (tokens --dano-fisico, --dano-laser, --dano-eletrico em
// jogo.css): a leitura do original (Ph. verde, El. azul, Op. vermelho), puxada para
// os tons dos tiros do jogo (metralhadora verde, efeito elétrico azul-violeta, feixe
// vermelho-rosado). Item sem tipo (armadura geral, potenciador "Total") fica no
// --neon da tecnologia. Os ícones são os do original (icones-itens.js), como os de
// arma.
//
// Tudo aqui só desenha: quem diz o que o piloto tem e o que está equipado é o
// servidor (me.inv, me.equipado, me.status); os números saem de
// shared/equipamentos.js e shared/status.js.

import { EQUIPAMENTOS, CATEGORIAS_EQUIP, ORDEM_TIPOS_DANO, SIGLA_TIPO, versaoEquip, textoEfeitoEquip, nivelEquipValido } from '/shared/equipamentos.js';
import { ARMAS, WEAPONS, TIPOS_DANO } from '/shared/sim.js';
import { versaoArma, resumoVersao, CATEGORIAS } from '/shared/armas.js';
import { CLASSES, ORDEM_CLASSES } from '/shared/naves.js';
import { iconeArma, nomeArma, descreverArma, textoDano } from './armas.js';
import { htmlIcone } from './icones-itens.js';

/** Ordem das linhas da tabela de tipos, como no original: Ph., El., Op. */
export const LINHAS_TIPO = ['fisico', 'eletrico', 'laser'];

const esc = (t) => String(t).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const pct = (f) => `${(+(f * 100).toFixed(1)).toLocaleString('pt-BR')}%`;

/** Classe CSS do tipo de dano (cor do ícone e do texto): tipo-fisico, tipo-laser, tipo-eletrico ou tipo-geral. */
export function classeTipo(tipoDano) {
  return ORDEM_TIPOS_DANO.includes(tipoDano) ? `tipo-${tipoDano}` : 'tipo-geral';
}

/**
 * Ícone de um equipamento pela chave, o do original (texture/item: xs = escudo, xa =
 * armadura, xd = potenciador, com a moldura na cor do tipo), com o número da versão
 * no canto da V2 em diante. Sem chave: a moldura vazia do encaixe.
 */
export function iconeEquip(chave, nivel = 1) {
  return htmlIcone(EQUIPAMENTOS[chave]?.icone ?? null, nivel, 'icone-equip');
}

/** Nome do item em português com a versão ("Escudo Neutron Op. V3"). */
export function nomeEquip(chave, nivel = 1) {
  const e = EQUIPAMENTOS[chave];
  return e ? `${e.nomePt} V${nivelEquipValido(nivel)}` : '';
}

/** "Todas as classes" ou os nomes das classes que podem usar. */
export function textoClasses(classes) {
  if (!classes?.length || ORDEM_CLASSES.every((c) => classes.includes(c))) return 'Todas as classes';
  return classes.map((c) => CLASSES[c]?.nome ?? c).join(', ');
}

/** Efeitos do item no nível, uma linha cada, na cor do tipo de dano do efeito. */
export function linhasEfeitos(chave, nivel = 1) {
  return (versaoEquip(chave, nivel)?.efeitos ?? []).map((ef) => `<li class="${ef.tipoDano ? classeTipo(ef.tipoDano) : ''}">${esc(textoEfeitoEquip(ef))}</li>`).join('');
}

/**
 * Detalhe de um equipamento, como o cartão do original: nome e versão, tipo de
 * equipamento, efeitos e classe (a versão não pede nível do piloto). `acao` é a
 * linha de baixo (o que o clique faz), opcional; com `aviso`, ela sai no vermelho-claro (não dá agora).
 */
export function detalheEquip(chave, nivel = 1, acao = '', aviso = false) {
  const e = EQUIPAMENTOS[chave];
  if (!e) return '';
  return `<div class="detalhe-cab">${iconeEquip(chave, nivel)}<strong>[${esc(nomeEquip(chave, nivel))}]</strong></div>
    <p class="tipo-item">${CATEGORIAS_EQUIP[e.categoria]}${e.tipoDano ? ` · ${SIGLA_TIPO[e.tipoDano]}` : ''} <small class="original">${esc(e.nome.trim())}</small></p>
    <ul class="efeitos-item">${linhasEfeitos(chave, nivel)}</ul>
    <p class="exige">Classe: <b>${textoClasses(e.classes)}</b></p>
    ${acao ? `<p class="acao-item${aviso ? ' aviso' : ''}">${acao}</p>` : ''}`;
}

/** Detalhe de uma arma (índice em ARMAS) no mesmo formato do de equipamento. */
export function detalheArma(idx, nivel = 1, acao = '') {
  const kind = ARMAS[idx];
  const w = WEAPONS[kind];
  if (!w || w.npc) return '';
  const v = versaoArma(idx, nivel);
  const r = resumoVersao(v);
  const um = (x) => x.toLocaleString('pt-BR', { maximumFractionDigits: x < 1 ? 2 : 1 });
  return `<div class="detalhe-cab">${iconeArma(kind, nivel)}<strong>[${nomeArma(kind)} V${v.nivel}]</strong></div>
    <p class="tipo-item">Arma · ${CATEGORIAS[w.categoria] ?? ''} <small class="original">${esc(w.nomeEn ?? '')}</small></p>
    <ul class="efeitos-item">
      <li class="${classeTipo(w.tipoDano)}">Dano ${TIPOS_DANO[w.tipoDano].toLowerCase()} ${textoDano(kind, nivel)}</li>
      <li>${r.segurar ? `Energia ${um(r.energia)}/s · segure a tecla` : `Recarga ${um(r.cd)} s · energia ${um(r.energia)}`}</li>
      <li>${esc(descreverArma(kind, nivel))}</li>
    </ul>
    <p class="exige">Classe: <b>${textoClasses(w.classes)}</b></p>
    ${acao ? `<p class="acao-item">${acao}</p>` : ''}`;
}

/**
 * Uma célula de arma da tabela de tipos: o dano REAL por disparo da arma do encaixe,
 * já multiplicado (todos os projéteis, canos e a rajada de um aperto do gatilho ×
 * (1 + poder do piloto no tipo dela): a Metralha Larga "6×6" com +20% mostra 43,2),
 * na linha do tipo dela; nas outras linhas, vazia. A conta fica no title. Pedido do Mateus: a porcentagem de poder já aparece no atributo (STATUS) e
 * no title; aqui vale o número que sai no tiro. Arma sem dano (suporte) mostra "—".
 */
export function celulaArma(idx, nivel, tipo, poder) {
  const w = WEAPONS[ARMAS[idx]];
  if (!w || w.npc || w.tipoDano !== tipo) return '<td class="vazia"></td>';
  const p = poder?.[tipo] ?? 0;
  const r = resumoVersao(versaoArma(idx, nivel));
  if (!(r.dano > 0)) return `<td title="${esc(`${w.nome} V${nivel}: sem dano`)}">—</td>`;
  const total = (+(r.dano * (1 + p)).toFixed(1)).toLocaleString('pt-BR');
  return `<td title="${esc(`${w.nome} V${nivel}: dano ${textoDano(idx, nivel)} = ${(+r.dano.toFixed(1)).toLocaleString('pt-BR')} × (1 + poder ${SIGLA_TIPO[tipo]} ${pct(p)}) = ${total} por disparo`)}">${total}</td>`;
}

/**
 * A tabela do INVENTÁRIO (e do original): uma linha por tipo de dano (Ph., El.,
 * Op.), com o dano real por disparo de cada arma equipada no tipo dela e a resistência da nave.
 * `encaixes` = [Z, X] (índices), `nivEnc` = [versão do Z, versão do X] (me.nivEnc),
 * `status` = me.status.
 */
export function tabelaTipos({ encaixes = [], nivEnc = [1, 1], status }) {
  const linhas = LINHAS_TIPO.map(
    (t) => `<tr class="${classeTipo(t)}"><th>${SIGLA_TIPO[t]}</th>${[0, 1].map((enc) => celulaArma(encaixes[enc], nivEnc?.[enc] ?? 1, t, status?.poder)).join('')}<td class="resist">${pct(status?.resist?.[t] ?? 0)}</td></tr>`,
  ).join('');
  return `<table class="tabela-tipos"><thead><tr><th></th><th>Arma <kbd>Z</kbd></th><th>Arma <kbd>X</kbd></th><th>Resist.</th></tr></thead><tbody>${linhas}</tbody></table>`;
}
