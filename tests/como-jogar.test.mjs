// A aba Como Jogar (public/js/como-jogar-regras.js): os números do texto batem com as
// regras do jogo, as teclas citadas existem, o progresso da trilha e o lugar no menu.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  FATOS,
  CAPITULOS,
  relogio,
  lerLidos,
  textoLidos,
  progresso,
  capituloInicial,
  vizinho,
  acoesDoCapitulo,
  formatar,
} from '../public/js/como-jogar-regras.js';
import { ACOES } from '../public/js/atalhos-regras.js';
import { ABAS, MODOS, telaAnterior } from '../public/js/menu-regras.js';
import { DURACAO_PARTIDA_S, PREPARACAO_S, FASE_FINAL_S, MULT_FASE_FINAL, MAX_POR_TIME } from '../server/partida.js';
import { OURO_INICIAL, OURO_POR_SEGUNDO, NIVEL_MAX, WING_RAIO } from '../server/progressao.js';
import { MINERADOR, MINERADOR_NUCLEO } from '../server/mineradores.js';
import { TEMPOS, OURO_PLATAFORMA } from '../server/objetivos.js';
import { TEMPOS_JUNGLE } from '../server/jungle.js';
import { BONUS, BONUS_NAVE } from '../server/bonus.js';
import { PONTOS_POR_NIVEL, PONTO_MAX } from '../shared/status.js';
import { NIVEL_POR_TIER } from '../shared/naves.js';
import { MINERADORES_POR_TIME } from '../shared/evolucao.js';
import { COMPARTIMENTO_MAX } from '../shared/loja.js';
import { NIVEL_ITEM_MAX } from '../shared/versoes.js';
import { RECALL_S } from '../shared/recall.js';
import { TROCA_ARMA_S } from '../shared/sim.js';
import { VISAO_RAIO, VISAO_TORRETA } from '../shared/visao.js';

test('os números do Como Jogar são os do jogo', () => {
  const pct = (m) => Math.round((m - 1) * 100);
  assert.deepEqual(
    {
      porTime: FATOS.porTime,
      duracaoS: FATOS.duracaoS,
      preparacaoS: FATOS.preparacaoS,
      faseFinalS: FATOS.faseFinalS,
      multFaseFinal: FATOS.multFaseFinal,
      mineradoresPorTime: FATOS.mineradoresPorTime,
      cargaMinerador: FATOS.cargaMinerador,
      ouroInicial: FATOS.ouroInicial,
      ouroPorSegundo: FATOS.ouroPorSegundo,
      nivelMax: FATOS.nivelMax,
      pontosPorNivel: FATOS.pontosPorNivel,
      pontoMax: FATOS.pontoMax,
      niveisNave: FATOS.niveisNave,
      compartimento: FATOS.compartimento,
      versaoMax: FATOS.versaoMax,
      recallS: FATOS.recallS,
      trocaArmaS: FATOS.trocaArmaS,
      visao: FATOS.visao,
      wingRaio: FATOS.wingRaio,
      alcanceTorre: FATOS.alcanceTorre,
      acampamentoS: FATOS.acampamentoS,
      ataqueS: FATOS.ataqueS,
      suporteS: FATOS.suporteS,
      plataformaS: FATOS.plataformaS,
      pousoPlataformaS: FATOS.pousoPlataformaS,
      ouroPlataforma: FATOS.ouroPlataforma,
      sondaS: FATOS.sondaS,
      medusaS: FATOS.medusaS,
      nucleoS: FATOS.nucleoS,
      nucleoVoltaS: FATOS.nucleoVoltaS,
      buffAtaquePct: FATOS.buffAtaquePct,
      buffAtaqueS: FATOS.buffAtaqueS,
      medusaPct: FATOS.medusaPct,
      medusaBuffS: FATOS.medusaBuffS,
      sondaPct: FATOS.sondaPct,
      sondaBuffS: FATOS.sondaBuffS,
    },
    {
      porTime: MAX_POR_TIME,
      duracaoS: DURACAO_PARTIDA_S,
      preparacaoS: PREPARACAO_S,
      faseFinalS: FASE_FINAL_S,
      multFaseFinal: MULT_FASE_FINAL,
      mineradoresPorTime: MINERADORES_POR_TIME,
      cargaMinerador: MINERADOR.carga,
      ouroInicial: OURO_INICIAL,
      ouroPorSegundo: OURO_POR_SEGUNDO,
      nivelMax: NIVEL_MAX,
      pontosPorNivel: PONTOS_POR_NIVEL,
      pontoMax: PONTO_MAX,
      niveisNave: NIVEL_POR_TIER.slice(1),
      compartimento: COMPARTIMENTO_MAX,
      versaoMax: NIVEL_ITEM_MAX,
      recallS: RECALL_S,
      trocaArmaS: TROCA_ARMA_S,
      visao: VISAO_RAIO,
      wingRaio: WING_RAIO,
      alcanceTorre: VISAO_TORRETA,
      acampamentoS: TEMPOS_JUNGLE.acampamento.primeiroS,
      ataqueS: TEMPOS_JUNGLE.ataque.primeiroS,
      suporteS: TEMPOS.suporte.primeiroS,
      plataformaS: TEMPOS.plataforma.primeiroS,
      pousoPlataformaS: TEMPOS.plataforma.pousoS,
      ouroPlataforma: OURO_PLATAFORMA,
      sondaS: TEMPOS_JUNGLE.sonda.primeiroS,
      medusaS: TEMPOS_JUNGLE.medusa.primeiroS,
      nucleoS: TEMPOS.nucleo.primeiroS,
      nucleoVoltaS: TEMPOS.nucleo.renasceS,
      buffAtaquePct: pct(BONUS_NAVE.ataque.dano),
      buffAtaqueS: BONUS_NAVE.ataque.s,
      medusaPct: pct(BONUS.medusa.dano),
      medusaBuffS: BONUS.medusa.s,
      sondaPct: pct(BONUS_NAVE.sonda.vel),
      sondaBuffS: BONUS_NAVE.sonda.s,
    },
  );
  assert.equal(pct(BONUS.medusa.vel), FATOS.medusaPct, 'a Medusa dá o mesmo % de dano e de velocidade');
});

test('a onda do Núcleo do texto é a do servidor', () => {
  assert.equal(MINERADOR_NUCLEO.quantos, FATOS.ondaNucleo);
  assert.equal(MINERADOR_NUCLEO.carga, FATOS.minerioOndaNucleo);
});

test('os capítulos: ids únicos, resumo, blocos válidos e o modo do Praticar existe', () => {
  const ids = CAPITULOS.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(CAPITULOS.length >= 8);
  const tipos = new Set(['p', 'cartoes', 'teclas', 'passos', 'tempo', 'mapa', 'dica', 'glossario']);
  for (const c of CAPITULOS) {
    assert.ok(c.titulo && c.curto && c.resumo && c.min > 0, c.id);
    assert.ok(c.blocos.length > 0, c.id);
    for (const b of c.blocos) assert.ok(tipos.has(b.tipo), `${c.id}: ${b.tipo}`);
    const modo = MODOS.find((m) => m.id === c.praticar?.modo);
    assert.ok(modo?.disponivel, `${c.id}: praticar ${c.praticar?.modo}`);
  }
  // O que ninguém pode deixar de saber: como se ganha, o mapa, os objetivos e o glossário.
  for (const id of ['objetivo', 'pilotar', 'mapa', 'mineradores', 'objetivos', 'primeira', 'glossario']) assert.ok(ids.includes(id), id);
  assert.equal(ids[0], 'objetivo', 'a trilha começa por como se ganha');
  assert.ok(CAPITULOS.find((c) => c.id === 'mapa').blocos.some((b) => b.tipo === 'mapa'));
});

test('toda tecla citada é de uma ação que existe', () => {
  const existentes = new Set(ACOES.map((a) => a.id));
  for (const c of CAPITULOS) for (const a of acoesDoCapitulo(c)) assert.ok(existentes.has(a), `${c.id}: [[${a}]]`);
  // As essenciais aparecem em algum capítulo.
  const citadas = new Set(CAPITULOS.flatMap((c) => [...acoesDoCapitulo(c)]));
  for (const a of ['frente', 'armaZ', 'armaX', 'boost', 'pouso', 'recall', 'trocaZ', 'reparo', 'status', 'inventario', 'tabela']) assert.ok(citadas.has(a), a);
});

test('formatar: escapa, negrito e a tecla da ação', () => {
  const html = formatar('**Z** <b> [[armaZ]]', (a) => `<kbd>${a}</kbd>`);
  assert.equal(html, '<b>Z</b> &lt;b&gt; <kbd>armaZ</kbd>');
});

test('relogio', () => {
  assert.equal(relogio(0), '0:00');
  assert.equal(relogio(90), '1:30');
  assert.equal(relogio(1020), '17:00');
});

test('progresso da trilha: lido, guardado, o capítulo que abre e os vizinhos', () => {
  const vazio = lerLidos(null);
  assert.equal(vazio.size, 0);
  assert.equal(capituloInicial(vazio), CAPITULOS[0].id);
  assert.deepEqual(progresso(vazio), { lidos: 0, total: CAPITULOS.length, fracao: 0, completo: false });

  const lidos = lerLidos(`${CAPITULOS[1].id},lixo,${CAPITULOS[0].id}`);
  assert.equal(lidos.size, 2, 'o que não existe sai');
  assert.equal(textoLidos(lidos), `${CAPITULOS[0].id},${CAPITULOS[1].id}`, 'na ordem da trilha');
  assert.equal(capituloInicial(lidos), CAPITULOS[2].id, 'abre no primeiro não lido');

  const todos = lerLidos(CAPITULOS.map((c) => c.id).join(','));
  assert.equal(progresso(todos).completo, true);
  assert.equal(capituloInicial(todos), CAPITULOS[0].id);

  assert.equal(vizinho(CAPITULOS[0].id, -1), null);
  assert.equal(vizinho(CAPITULOS[0].id, 1), CAPITULOS[1].id);
  assert.equal(vizinho(CAPITULOS.at(-1).id, 1), null);
});

test('a aba Como Jogar no menu e no index.html', () => {
  const aba = ABAS.find((a) => a.id === 'aprender');
  assert.ok(aba && !aba.bloqueada);
  assert.equal(aba.nome, 'Como Jogar');
  assert.equal(ABAS[1].id, 'aprender', 'logo depois de Jogar');
  assert.equal(telaAnterior('aprender'), 'jogar');
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  for (const s of ['id="tela-aprender"', 'class="trilha-capitulos"', 'class="capitulo"', 'class="progresso-trilha"', 'class="convite-aprender"']) assert.ok(html.includes(s), s);
});
