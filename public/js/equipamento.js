// Escudos, armaduras e potenciadores na interface: ícone, nome com a versão, detalhe
// do item (o "cartão" do original ao passar o mouse) e a tabela Ph. / El. / Op. ×
// Arma Z / Arma X / Resistência. Usado pela Loja (servicos.js), pelo INVENTÁRIO
// (inventario.js) e pelo STATUS (status.js), para os três mostrarem o mesmo número.
//
// Cores dos tipos de dano (tokens --dano-fisico, --dano-laser, --dano-eletrico em
// jogo.css): a leitura do original (Ph. verde, El. azul, Op. vermelho), puxada para
// os tons dos tiros do jogo (metralhadora verde, efeito elétrico azul-violeta, feixe
// vermelho-rosado). Item sem tipo (armadura geral, potenciador "Total") fica no
// --neon da tecnologia. Os ícones são de traço, como os de arma: escudo = bolha de
// energia sobre um disco, armadura = casco de placas, potenciador = cápsula com o
// sinal do efeito principal dentro.
//
// Tudo aqui só desenha: quem diz o que o piloto tem e o que está equipado é o
// servidor (me.inv, me.equipado, me.status); os números saem de
// shared/equipamentos.js e shared/status.js.

import { EQUIPAMENTOS, CATEGORIAS_EQUIP, ORDEM_TIPOS_DANO, SIGLA_TIPO, versaoEquip, textoEfeitoEquip, nivelEquipValido } from '/shared/equipamentos.js';
import { ARMAS, WEAPONS, TIPOS_DANO } from '/shared/sim.js';
import { versaoArma, resumoVersao, CATEGORIAS } from '/shared/armas.js';
import { CLASSES, ORDEM_CLASSES } from '/shared/naves.js';
import { iconeArma, nomeArma, descreverArma, textoDano } from './armas.js';

/** Ordem das linhas da tabela de tipos, como no original: Ph., El., Op. */
export const LINHAS_TIPO = ['fisico', 'eletrico', 'laser'];

const esc = (t) => String(t).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const pct = (f) => `${(+(f * 100).toFixed(1)).toLocaleString('pt-BR')}%`;

/** Classe CSS do tipo de dano (cor do ícone e do texto): tipo-fisico, tipo-laser, tipo-eletrico ou tipo-geral. */
export function classeTipo(tipoDano) {
  return ORDEM_TIPOS_DANO.includes(tipoDano) ? `tipo-${tipoDano}` : 'tipo-geral';
}

// Sinal dentro da cápsula do potenciador, pelo primeiro efeito do item.
const SINAL_POTENCIADOR = {
  hp: '<path d="M12 9 V15 M9 12 H15" />',
  regenHp: '<path d="M12 9 V15 M9 12 H15" />',
  escudo: '<path d="M8.5 14 A3.5 3.5 0 0 1 15.5 14" /><path d="M10.5 11.2 A2 2 0 0 1 13.5 11.2" />',
  regenEscudo: '<path d="M8.5 14 A3.5 3.5 0 0 1 15.5 14" /><path d="M10.5 11.2 A2 2 0 0 1 13.5 11.2" />',
  energia: '<path d="M13 8.5 L10 12.5 H14 L11 16" />',
  regenEn: '<path d="M13 8.5 L10 12.5 H14 L11 16" />',
  poder: '<path d="M9 13.5 L12 10.5 L15 13.5 M9 16 L12 13 L15 16" />',
  recarga: '<path d="M15 12 A3 3 0 1 1 12 9 M12 9 L13.5 7.8 M12 9 L13.5 10.2" />',
  resist: '<path d="M12 8.5 L15 9.8 V12.5 C15 14.4 13.7 15.6 12 16.2 C10.3 15.6 9 14.4 9 12.5 V9.8 Z" />',
  penetra: '<path d="M9 15 L15 9 M12.5 9 H15 V11.5 M8.5 11 L11 13.5" />',
  critico: '<path d="M12 8.5 V15.5 M9 10 L15 14 M15 10 L9 14" />',
  velocidade: '<path d="M9 9 L12 12 L9 15 M12 9 L15 12 L12 15" />',
  aceleracao: '<path d="M9 9 L12 12 L9 15 M12 9 L15 12 L12 15" />',
};

/**
 * Ícone (SVG de traço) de um equipamento pela chave, ou da categoria vazia
 * (`categoria` sem chave: o contorno apagado do encaixe).
 */
export function iconeEquip(chave, categoria) {
  const e = EQUIPAMENTOS[chave];
  const cat = e?.categoria ?? categoria;
  let d;
  if (cat === 'escudo') {
    d = '<path d="M4 15 A8 8 0 0 1 20 15" /><path d="M7.5 12.2 A5 5 0 0 1 16.5 12.2" /><ellipse cx="12" cy="16.5" rx="8.5" ry="3" /><circle cx="12" cy="16.5" r="1.2" />';
  } else if (cat === 'armadura') {
    d = '<path d="M12 3 L20 7 V13 L12 21 L4 13 V7 Z" /><path d="M4.5 10 L12 13 L19.5 10 M7 15.5 L12 17.5 L17 15.5 M12 3 V8" />';
  } else {
    const sinal = e ? (SINAL_POTENCIADOR[e.versoes[0].efeitos[0]?.tipo] ?? '') : '';
    d = `<rect x="7" y="5" width="10" height="15" rx="2.5" /><path d="M9.5 2.5 H14.5 M12 2.5 V5" />${sinal}`;
  }
  return `<svg class="icone-equip ${e ? classeTipo(e.tipoDano) : 'vazio'}" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
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
  return `<div class="detalhe-cab">${iconeEquip(chave)}<strong>[${esc(nomeEquip(chave, nivel))}]</strong></div>
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
 * Uma célula de arma da tabela de tipos: o poder (%) da arma do encaixe na linha
 * do tipo dela; nas outras linhas, vazia. O title mostra o dano com o poder.
 */
export function celulaArma(idx, nivel, tipo, poder) {
  const w = WEAPONS[ARMAS[idx]];
  if (!w || w.npc || w.tipoDano !== tipo) return '<td class="vazia"></td>';
  const p = poder?.[tipo] ?? 0;
  const r = resumoVersao(versaoArma(idx, nivel));
  const dano = r.dano > 0 ? ` · dano ${(+(r.dano * (1 + p)).toFixed(1)).toLocaleString('pt-BR')} por disparo` : '';
  return `<td title="${esc(`${w.nome} V${nivel}: poder ${SIGLA_TIPO[tipo]} +${pct(p)}${dano}`)}">+${pct(p)}</td>`;
}

/**
 * A tabela do INVENTÁRIO (e do original): uma linha por tipo de dano (Ph., El.,
 * Op.), com o poder de cada arma equipada no tipo dela e a resistência da nave.
 * `encaixes` = [Z, X] (índices), `nivEnc` = [versão do Z, versão do X] (me.nivEnc),
 * `status` = me.status.
 */
export function tabelaTipos({ encaixes = [], nivEnc = [1, 1], status }) {
  const linhas = LINHAS_TIPO.map(
    (t) => `<tr class="${classeTipo(t)}"><th>${SIGLA_TIPO[t]}</th>${[0, 1].map((enc) => celulaArma(encaixes[enc], nivEnc?.[enc] ?? 1, t, status?.poder)).join('')}<td class="resist">${pct(status?.resist?.[t] ?? 0)}</td></tr>`,
  ).join('');
  return `<table class="tabela-tipos"><thead><tr><th></th><th>Arma <kbd>Z</kbd></th><th>Arma <kbd>X</kbd></th><th>Resist.</th></tr></thead><tbody>${linhas}</tbody></table>`;
}
