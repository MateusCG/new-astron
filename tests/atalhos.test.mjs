// Atalhos do teclado e do controle (public/js/atalhos-regras.js): os mapas de fábrica
// (todas as teclas de antes, o controle de um DualShock 3, nenhuma entrada em duas
// ações do mesmo contexto), o que se guarda no navegador (saneado), trocar e apagar
// uma casa, os nomes na tela, a leitura do controle (zona morta, gatilho analógico,
// eixo por lado) e a navegação espacial dos menus. E o contrato com o index.html e
// com os módulos que ouvem as ações.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ACOES,
  ACAO,
  GRUPOS_ACOES,
  ATALHOS_POR_ACAO,
  TECLADO_PADRAO,
  CONTROLE_PADRAO,
  ZONA_MORTA,
  mapaPadrao,
  sanearMapa,
  lerAtalhos,
  textoAtalhos,
  atribuir,
  limpar,
  acaoDe,
  contextosConflitam,
  nomeTecla,
  nomeEntrada,
  rotuloAcao,
  valorEntrada,
  entradasApertadas,
  valorAcao,
  alemDaZonaMorta,
  proximoNaDirecao,
  DIRECOES,
  teclaDoMouse,
  ehMouse,
} from '../public/js/atalhos-regras.js';

/** Nenhuma entrada em duas ações de contextos que conflitam. */
function semConflito(mapa) {
  const vistas = [];
  for (const a of ACOES) {
    for (const e of mapa[a.id] ?? []) {
      const outra = vistas.find(([v, ctx]) => v === e && contextosConflitam(ctx, a.ctx));
      assert.ok(!outra, `${e} em ${a.id} e em outra ação do mesmo contexto`);
      vistas.push([e, a.ctx]);
    }
  }
}

/** Um controle de mentira: botões (valor) e eixos. */
function pad({ botoes = {}, eixos = {} } = {}) {
  const buttons = Array.from({ length: 17 }, (_, i) => ({ value: botoes[i] ?? 0, pressed: (botoes[i] ?? 0) > 0.5 }));
  const axes = Array.from({ length: 4 }, (_, i) => eixos[i] ?? 0);
  return { buttons, axes };
}

test('ações: ids únicos, grupos na ordem, contexto conhecido', () => {
  assert.equal(new Set(ACOES.map((a) => a.id)).size, ACOES.length);
  for (const a of ACOES) assert.ok(['voo', 'menu', 'sempre'].includes(a.ctx), a.id);
  assert.deepEqual(
    GRUPOS_ACOES.map((g) => g.nome),
    ['Voo', 'Armas', 'Itens', 'Câmera', 'Janelas', 'Pontos', 'Sistema', 'Menus'],
  );
  assert.equal(GRUPOS_ACOES.flatMap((g) => g.acoes).length, ACOES.length);
});

test('teclado de fábrica: as teclas de sempre, sem conflito, até duas por ação', () => {
  const m = mapaPadrao('teclado');
  semConflito(m);
  for (const [acao, teclas] of Object.entries(TECLADO_PADRAO)) {
    assert.ok(ACAO[acao], acao);
    assert.ok(teclas.length <= ATALHOS_POR_ACAO, acao);
  }
  const esperado = { frente: 'KeyW', re: 'KeyS', esq: 'KeyA', dir: 'KeyD', boost: 'ShiftLeft', pouso: 'KeyL', recall: 'KeyB', armaZ: 'KeyZ', armaX: 'KeyX', trocaZ: 'KeyQ', trocaX: 'KeyE', reparo: 'KeyR', energia: 'KeyF', camTroca: 'KeyV', camCima: 'KeyT', camBaixo: 'KeyG', status: 'KeyC', inventario: 'KeyI', tabela: 'Tab', morte: 'KeyH', comandos: 'KeyJ', loja: 'Enter', som: 'KeyM', pontoHp: 'Digit1', pontoEn: 'Digit2', pontoFis: 'Digit3', pontoEl: 'Digit4', pontoOp: 'Digit5' };
  for (const [acao, tecla] of Object.entries(esperado)) assert.ok(m[acao].includes(tecla), `${acao}: ${tecla}`);
  assert.ok(m.armaZ.includes('Space'));
  // O Esc e a navegação dos menus são fixos: sem tecla no mapa.
  for (const a of ACOES.filter((x) => x.fixaTeclado)) assert.deepEqual(m[a.id], [], a.id);
});

test('controle de fábrica: DualShock 3 no mapeamento padrão, sem conflito no mesmo contexto', () => {
  const m = mapaPadrao('controle');
  semConflito(m);
  // Analógico esquerdo voa, gatilhos atiram, Start é o menu, ✕ e ○ nos menus.
  assert.deepEqual([m.frente, m.re, m.esq, m.dir], [['a1-'], ['a1+'], ['a0-'], ['a0+']]);
  assert.deepEqual([m.armaZ, m.armaX, m.menu], [['b7'], ['b6'], ['b9']]);
  assert.deepEqual([m.uiConfirmar, m.uiVoltar], [['b0'], ['b1']]);
  // Toda ação de voo e de janela tem um botão (o som não precisa, os pontos vão pelo
  // STATUS e os Comandos pelas Opções).
  for (const a of ACOES.filter((x) => !['som', 'comandos'].includes(x.id) && x.grupo !== 'Pontos')) assert.ok(m[a.id].length, a.id);
  // Cabe num DualShock 3: 17 botões (0–16) e 4 eixos.
  for (const e of Object.values(CONTROLE_PADRAO).flat()) {
    if (e[0] === 'b') assert.ok(Number(e.slice(1)) <= 16, e);
    else assert.ok(Number(e.slice(1, -1)) <= 3, e);
  }
  // O mesmo botão pode ser do voo e do menu (✕: turbo e confirmar).
  assert.equal(acaoDe(m, 'b0', ['voo']), 'boost');
  assert.equal(acaoDe(m, 'b0', ['menu']), 'uiConfirmar');
});

test('guardado no navegador: volta igual e o defeituoso cai no padrão', () => {
  const mapas = { teclado: mapaPadrao('teclado'), controle: mapaPadrao('controle') };
  mapas.teclado.armaZ = ['KeyU'];
  assert.deepEqual(lerAtalhos(textoAtalhos(mapas)), mapas);
  for (const ruim of [null, '', 'lixo', '[]', '{"teclado": 3}']) {
    assert.deepEqual(lerAtalhos(ruim), { teclado: mapaPadrao('teclado'), controle: mapaPadrao('controle') }, String(ruim));
  }
  // Ação desconhecida sai, entrada inválida sai, repetida fica na primeira, máximo de casas.
  const t = sanearMapa('teclado', { voar: ['KeyP'], frente: ['KeyP', 'lixo', 'KeyP', 'KeyO', 'KeyY'], re: ['KeyP'], menu: ['KeyU'], status: ['Escape'] });
  assert.equal(t.voar, undefined);
  assert.deepEqual(t.frente, ['KeyP', 'KeyO']);
  assert.deepEqual(t.re, []);
  assert.deepEqual(t.menu, []); // o Esc é fixo
  assert.deepEqual(t.status, []); // o Esc não entra
  assert.deepEqual(t.esq, TECLADO_PADRAO.esq); // a que faltou: padrão
  const c = sanearMapa('controle', { armaZ: ['b7', 'x9', 'a1*', 'a12-'], armaX: ['b7'] });
  assert.deepEqual(c.armaZ, ['b7', 'a12-']);
  assert.deepEqual(c.armaX, []);
});

test('atribuir: troca a casa, acrescenta, tira da outra ação do mesmo contexto', () => {
  const t = mapaPadrao('teclado');
  // W no Ré: sai do Acelera.
  let r = atribuir('teclado', t, 're', 0, 'KeyW');
  assert.equal(r.tirouDe, 'frente');
  assert.deepEqual(r.mapa.re, ['KeyW', 'ArrowDown']);
  assert.deepEqual(r.mapa.frente, ['ArrowUp']);
  assert.deepEqual(t.frente, ['KeyW', 'ArrowUp'], 'não mexe no mapa de entrada');
  // Casa vazia: entra no fim.
  r = atribuir('teclado', r.mapa, 'recall', 1, 'KeyN');
  assert.deepEqual(r.mapa.recall, ['KeyB', 'KeyN']);
  assert.equal(r.tirouDe, null);
  // A mesma tecla na outra casa da mesma ação: fica uma.
  r = atribuir('teclado', r.mapa, 'recall', 0, 'KeyN');
  assert.deepEqual(r.mapa.recall, ['KeyN']);
  // Inválida, reservada ou ação fixa: nada muda.
  for (const [acao, e] of [['recall', 'lixo!'], ['recall', 'Escape'], ['menu', 'KeyP'], ['naoexiste', 'KeyP']]) {
    assert.equal(atribuir('teclado', r.mapa, acao, 0, e).mapa, r.mapa, `${acao} ${e}`);
  }
  // No controle, o ✕ no Pouso (voo) sai do Turbo, mas continua o Confirmar dos menus.
  const c = atribuir('controle', mapaPadrao('controle'), 'pouso', 0, 'b0');
  assert.equal(c.tirouDe, 'boost');
  assert.deepEqual(c.mapa.boost, []);
  assert.deepEqual(c.mapa.uiConfirmar, ['b0']);
  // O Start (sempre) tira de qualquer contexto.
  const s = atribuir('controle', mapaPadrao('controle'), 'menu', 0, 'b0');
  assert.deepEqual([s.mapa.boost, s.mapa.uiConfirmar], [[], []]);
  semConflito(s.mapa);
  // Apagar.
  assert.deepEqual(limpar(mapaPadrao('teclado'), 'frente', 0).frente, ['ArrowUp']);
});

test('mouse: os botões entram no mapa do teclado (Z no clique esquerdo, X no direito)', () => {
  assert.equal(teclaDoMouse(0), 'Mouse0');
  assert.equal(teclaDoMouse(2), 'Mouse2');
  assert.equal(teclaDoMouse(4), 'Mouse4');
  assert.equal(teclaDoMouse(7), null, 'botão fora da lista não entra');
  assert.ok(ehMouse('Mouse1') && !ehMouse('KeyM'));
  assert.equal(nomeTecla('Mouse0'), 'Clique esq.');
  assert.equal(nomeTecla('Mouse1'), 'Clique meio');
  assert.equal(nomeTecla('Mouse2'), 'Clique dir.');
  assert.equal(nomeTecla('Mouse3'), 'Mouse 4');
  let m = atribuir('teclado', mapaPadrao('teclado'), 'armaZ', 0, 'Mouse0').mapa;
  m = atribuir('teclado', m, 'armaX', 0, 'Mouse2').mapa;
  assert.deepEqual([m.armaZ, m.armaX], [['Mouse0', 'Space'], ['Mouse2', 'KeyK']]);
  assert.equal(rotuloAcao({ teclado: m }, 'teclado', 'armaZ'), 'Clique esq.');
  // O guardado no navegador volta igual.
  const lido = lerAtalhos(textoAtalhos({ teclado: m, controle: mapaPadrao('controle') }));
  assert.deepEqual([lido.teclado.armaZ, lido.teclado.armaX], [['Mouse0', 'Space'], ['Mouse2', 'KeyK']]);
  // O mesmo botão em outra ação do voo sai da primeira.
  const r = atribuir('teclado', m, 'boost', 0, 'Mouse2');
  assert.equal(r.tirouDe, 'armaX');
  assert.deepEqual(r.mapa.armaX, ['KeyK']);
});

test('nomes: teclas, botões do DualShock e eixos', () => {
  assert.equal(nomeTecla('KeyW'), 'W');
  assert.equal(nomeTecla('Digit7'), '7');
  assert.equal(nomeTecla('Space'), 'Espaço');
  assert.equal(nomeTecla('ArrowUp'), '↑');
  assert.equal(nomeTecla('Numpad3'), 'Num 3');
  assert.equal(nomeTecla('Tab'), 'TAB');
  assert.equal(nomeEntrada('b0'), '✕');
  assert.equal(nomeEntrada('b7'), 'R2');
  assert.equal(nomeEntrada('b9', true), 'Start');
  assert.equal(nomeEntrada('b20'), 'B20');
  assert.equal(nomeEntrada('a1-'), 'LS↑');
  assert.equal(nomeEntrada('a3+', true), 'Analógico dir. ↓');
  assert.equal(nomeEntrada('a6+', true), 'Eixo 6+');
  assert.equal(nomeEntrada('lixo'), '');
  const mapas = { teclado: mapaPadrao('teclado'), controle: mapaPadrao('controle') };
  assert.equal(rotuloAcao(mapas, 'teclado', 'status'), 'C');
  assert.equal(rotuloAcao(mapas, 'controle', 'status'), 'D↑');
  assert.equal(rotuloAcao(mapas, 'teclado', 'menu'), 'Esc');
  assert.equal(rotuloAcao(mapas, 'controle', 'som'), '');
});

test('leitura do controle: zona morta, gatilho analógico, eixo por lado', () => {
  assert.equal(alemDaZonaMorta(ZONA_MORTA * 0.9), 0);
  assert.equal(alemDaZonaMorta(-1), 1);
  assert.ok(alemDaZonaMorta(0.6) > 0 && alemDaZonaMorta(0.6) < 1);
  const p = pad({ botoes: { 7: 0.4, 0: 1 }, eixos: { 1: -0.8, 0: 0.1 } });
  assert.equal(valorEntrada(p, 'b7'), 0.4); // R2 pela metade
  assert.equal(valorEntrada(p, 'b0'), 1);
  assert.ok(valorEntrada(p, 'a1-') > 0.6); // analógico para cima
  assert.equal(valorEntrada(p, 'a1+'), 0);
  assert.equal(valorEntrada(p, 'a0+'), 0); // dentro da zona morta
  assert.equal(valorEntrada(p, 'b30'), 0);
  assert.deepEqual(entradasApertadas(p).sort(), ['a1-', 'b0']);
  // Ação: a maior das entradas, em todos os controles.
  const m = mapaPadrao('controle');
  assert.ok(valorAcao(m, 'frente', [p]) > 0.6);
  assert.equal(valorAcao(m, 're', [p]), 0);
  assert.equal(valorAcao(m, 'armaZ', [pad(), p]), 0.4);
});

test('navegação espacial: o vizinho mais perto daquele lado, sem pular de coluna', () => {
  // Grade 2 × 2 de botões de 100 × 40, e um botão largo embaixo.
  const r = (x, y, w = 100, h = 40) => ({ x, y, w, h });
  const alvos = [r(0, 0), r(120, 0), r(0, 60), r(120, 60), r(0, 120, 220)];
  assert.equal(proximoNaDirecao(alvos[0], alvos, DIRECOES.uiDir), 1);
  assert.equal(proximoNaDirecao(alvos[0], alvos, DIRECOES.uiBaixo), 2);
  assert.equal(proximoNaDirecao(alvos[3], alvos, DIRECOES.uiCima), 1);
  assert.equal(proximoNaDirecao(alvos[3], alvos, DIRECOES.uiBaixo), 4);
  assert.equal(proximoNaDirecao(alvos[1], alvos, DIRECOES.uiDir), -1);
  assert.equal(proximoNaDirecao(alvos[0], alvos, DIRECOES.uiCima), -1);
  // De lado pesa o dobro: o que está na mesma linha ganha do mais perto na diagonal.
  const linha = [r(150, 0), r(130, 70)];
  assert.equal(proximoNaDirecao(r(0, 0), linha, DIRECOES.uiDir), 0);
});

test('quem ouve as ações: os módulos pedem a ação, não a tecla', () => {
  const ler = (f) => readFileSync(new URL(`../public/js/${f}`, import.meta.url), 'utf8');
  const ouvidas = new Set();
  for (const f of ['controles.js', 'main.js', 'status.js', 'inventario.js', 'ultima-morte.js', 'tabela.js', 'armas.js', 'servicos.js', 'upar.js']) {
    const js = ler(f);
    assert.ok(!/e\.code\s*[!=]==\s*'Key[A-Z]'/.test(js), `${f} ainda olha a tecla`);
    for (const m of js.matchAll(/aoApertar\(\s*'(\w+)'/g)) ouvidas.add(m[1]);
  }
  ouvidas.add('trocaZ').add('trocaX').add('reparo').add('energia'); // por variável
  for (const a of ACOES.filter((x) => x.grupo === 'Pontos')) ouvidas.add(a.id); // upar.js, pela lista OPCOES_UPAR
  for (const a of ACOES.filter((x) => x.ctx !== 'menu' || x.id === 'uiVoltar')) {
    const lida = ['frente', 're', 'esq', 'dir', 'boost', 'armaZ', 'armaX', 'camCima', 'camBaixo'].includes(a.id); // Controles.ler
    assert.ok(lida || ouvidas.has(a.id), `ninguém ouve ${a.id}`);
  }
  // O index.html: as duas listas da aba Configurações e os rótulos que seguem o mapa.
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  for (const d of ['teclado', 'controle']) {
    assert.ok(html.includes(`class="lista-atalhos" data-disp="${d}"`), d);
    assert.ok(html.includes(`data-secao="${d}"`), d);
  }
  for (const m of html.matchAll(/data-acao-rotulo="(\w+)"/g)) assert.ok(ACAO[m[1]], m[1]);
});
