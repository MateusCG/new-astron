// Menu principal (public/js/menu-regras.js): as abas e os modos de jogo (os do online
// são modos de fila: a Seleção entra na fila em vez de decolar), o que cada modo manda no {t:'entrar'}, para onde o
// ESC volta, o que se lê do navegador (saneado), as setas da lista e da grade, a régua
// das barras das naves. (Os atalhos de teclado e controle estão em atalhos.test.mjs.) E o contrato com o index.html: todo
// elemento que menu.js procura tem de existir lá.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ABAS,
  MODOS,
  MODO_PADRAO,
  ABA_PADRAO,
  CHAVES,
  modoDisponivel,
  pedidoDoModo,
  filaDoModo,
  telaAnterior,
  estadoGuardado,
  proximoModo,
  moverNaGrade,
  escalaStatus,
  navesJogaveis,
  primeirasNaves,
  lerDestaque,
  textoDestaque,
  mesmaNave,
  naveDaVitrine,
  NAVES_VITRINE,
  sortearVitrine,
} from '../public/js/menu-regras.js';
import { RACAS_JOGAVEIS, ORDEM_CLASSES, naveDe } from '../shared/naves.js';

test('abas na ordem do header, com Ranking e Perfil bloqueadas até as contas de piloto', () => {
  assert.deepEqual(
    ABAS.map((a) => a.id),
    ['jogar', 'aprender', 'naves', 'config', 'ranking', 'perfil'],
  );
  assert.deepEqual(
    ABAS.filter((a) => a.bloqueada).map((a) => a.id),
    ['ranking', 'perfil'],
  );
});

test('modos: os quatro liberados; os dois do online são de fila', () => {
  assert.deepEqual(
    MODOS.map((m) => m.id),
    ['online', 'sandbox', 'publica', 'privada'],
  );
  assert.deepEqual(
    MODOS.filter((m) => m.disponivel).map((m) => m.id),
    ['online', 'sandbox', 'publica', 'privada'],
  );
  assert.equal(modoDisponivel('online'), true);
  assert.equal(modoDisponivel('publica'), true);
  assert.equal(modoDisponivel('xyz'), false);
  assert.ok(modoDisponivel(MODO_PADRAO));
  assert.equal(filaDoModo('online'), 'online');
  assert.equal(filaDoModo('publica'), 'publica');
  assert.equal(filaDoModo('privada'), null);
  assert.equal(filaDoModo('sandbox'), null);
});

test('fila sem conexão: os modos de fila mostram "—", nunca um número inventado', () => {
  for (const m of MODOS.filter((x) => x.fila)) assert.match(m.estado, /^— /);
});

test('o Sandbox é o modo de teste; a Partida Privada é um mundo só seu; os de fila não decolam direto', () => {
  assert.deepEqual(pedidoDoModo('sandbox'), { teste: true });
  assert.deepEqual(pedidoDoModo('privada'), { teste: false, privada: true });
  assert.deepEqual(pedidoDoModo('online'), { fila: 'online' });
  assert.deepEqual(pedidoDoModo('publica'), { fila: 'publica' });
  assert.equal(pedidoDoModo(undefined), null);
});

test('ESC volta um passo: Seleção e as outras abas para Jogar; em Jogar fica', () => {
  assert.equal(telaAnterior('selecao'), 'jogar');
  assert.equal(telaAnterior('naves'), 'jogar');
  assert.equal(telaAnterior('config'), 'jogar');
  assert.equal(telaAnterior('aprender'), 'jogar');
  assert.equal(telaAnterior('jogar'), null);
  assert.equal(telaAnterior('qualquer'), null);
});

test('estado guardado: vazio cai no padrão', () => {
  const g = estadoGuardado(() => null);
  assert.deepEqual(g, { aba: ABA_PADRAO, modo: MODO_PADRAO, raca: RACAS_JOGAVEIS[0], classe: ORDEM_CLASSES[0], nome: '', destaque: null });
});

test('estado guardado: valores válidos voltam como estavam', () => {
  const salvo = { [CHAVES.aba]: 'naves', [CHAVES.modo]: 'sandbox', [CHAVES.raca]: 'shrewdo', [CHAVES.classe]: 'mobile', [CHAVES.nome]: 'Mateus', [CHAVES.destaque]: 'bellico/functional/4' };
  assert.deepEqual(estadoGuardado((k) => salvo[k] ?? null), {
    aba: 'naves',
    modo: 'sandbox',
    raca: 'shrewdo',
    classe: 'mobile',
    nome: 'Mateus',
    destaque: { raca: 'bellico', classe: 'functional', tier: 4 },
  });
});

test('estado guardado: aba bloqueada, modo que não existe, Mechan e lixo são saneados', () => {
  const salvo = { [CHAVES.aba]: 'ranking', [CHAVES.modo]: 'ranqueada', [CHAVES.raca]: 'mechan', [CHAVES.classe]: 'tanque', [CHAVES.nome]: 'x'.repeat(40) };
  const g = estadoGuardado((k) => salvo[k] ?? null);
  assert.equal(g.aba, ABA_PADRAO);
  assert.equal(g.modo, MODO_PADRAO);
  assert.equal(g.raca, RACAS_JOGAVEIS[0]);
  assert.equal(g.classe, ORDEM_CLASSES[0]);
  assert.equal(g.nome.length, 16);
  // A Seleção nunca vem do navegador: quem recarrega cai numa aba.
  assert.equal(estadoGuardado((k) => (k === CHAVES.aba ? 'selecao' : null)).aba, ABA_PADRAO);
});

test('setas na lista de modos andam na ordem e param nas pontas', () => {
  assert.equal(proximoModo('online', 1), 'sandbox');
  assert.equal(proximoModo('sandbox', 1), 'publica');
  assert.equal(proximoModo('publica', 1), 'privada');
  assert.equal(proximoModo('privada', 1), 'privada');
  assert.equal(proximoModo('online', -1), 'online');
  assert.equal(proximoModo('privada', -1), 'publica');
});

test('setas na grade da Seleção andam por raça e classe e param nas bordas', () => {
  assert.deepEqual(moverNaGrade('acron', 'assault', 1, 0), { raca: 'acron', classe: 'mobile' });
  assert.deepEqual(moverNaGrade('acron', 'assault', 0, 1), { raca: 'bellico', classe: 'assault' });
  assert.deepEqual(moverNaGrade('acron', 'assault', -1, -1), { raca: 'acron', classe: 'assault' });
  assert.deepEqual(moverNaGrade('shrewdo', 'functional', 1, 1), { raca: 'shrewdo', classe: 'functional' });
});

test('régua das barras: as primeiras naves para a Seleção e as 45 para o Hangar', () => {
  assert.equal(primeirasNaves().length, RACAS_JOGAVEIS.length * ORDEM_CLASSES.length);
  assert.ok(primeirasNaves().every((n) => n.tier === 0));
  const todas = navesJogaveis();
  assert.equal(todas.length, RACAS_JOGAVEIS.length * ORDEM_CLASSES.length * 5);
  const max = escalaStatus(todas);
  for (const k of ['hp', 'energia', 'velocidade', 'regenHpVoo']) {
    assert.equal(max[k], Math.max(...todas.map((n) => n[k])));
    assert.ok(max[k] > 0, k);
  }
  // A régua das primeiras é menor (as naves crescem com o tier): a barra delas não fica nanica.
  assert.ok(escalaStatus(primeirasNaves()).hp < max.hp);
  assert.ok(!todas.some((n) => n.race === 'mechan'));
});

test('index.html tem tudo o que menu.js procura', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const js = readFileSync(new URL('../public/js/menu.js', import.meta.url), 'utf8');
  // Seletores simples usados com this.q('...') ou querySelector('...') no menu.
  const seletores = [...js.matchAll(/(?:this\.q|querySelector)\('([^'$]+)'\)/g)].map((m) => m[1]);
  assert.ok(seletores.length > 10);
  for (const sel of seletores) {
    // Cada parte do seletor (id ou classe) tem de aparecer no HTML.
    for (const [, tipo, nome] of sel.matchAll(/([#.])([\w-]+)/g)) {
      const achou = tipo === '#' ? html.includes(`id="${nome}"`) : new RegExp(`class="[^"]*\\b${nome}\\b`).test(html) || js.includes(`class="${nome}`) || js.includes(` ${nome}`);
      assert.ok(achou, `${sel}: falta ${tipo}${nome}`);
    }
  }
  // Os modos e as abas entram por JS; as telas, uma por aba (menos as bloqueadas).
  for (const a of ABAS.filter((x) => !x.bloqueada)) assert.ok(html.includes(`id="tela-${a.id}"`), a.id);
  assert.ok(html.includes('id="tela-selecao"'));
});

test('nave em destaque do Hangar: guarda e lê raça, classe e tier; o inválido vira null', () => {
  const d = { raca: 'bellico', classe: 'functional', tier: 3 };
  assert.equal(textoDestaque(d), 'bellico/functional/3');
  assert.deepEqual(lerDestaque(textoDestaque(d)), d);
  assert.equal(textoDestaque(null), null);
  for (const ruim of [null, '', 'lixo', 'mechan/assault/0', 'acron/tanque/0', 'acron/assault/5', 'acron/assault/-1', 'acron/assault/1.5', 'acron/assault/']) {
    assert.equal(lerDestaque(ruim), null, String(ruim));
  }
});

test('a aba Jogar mostra o destaque; sem ele, a nave sorteada', () => {
  const d = { raca: 'shrewdo', classe: 'mobile', tier: 4 };
  const s = { raca: 'bellico', classe: 'functional', tier: 4 };
  assert.deepEqual(naveDaVitrine(d, s), d);
  assert.deepEqual(naveDaVitrine(null, s), s);
  assert.ok(mesmaNave(d, { ...d }));
  assert.ok(!mesmaNave(d, { ...d, tier: 3 }));
  assert.ok(!mesmaNave(null, d));
});

test('vitrine da aba Jogar: as nove naves pedidas, sorteadas sem repetir a anterior', () => {
  const nomes = NAVES_VITRINE.map((n) => naveDe(n.raca, n.classe, n.tier).nome).sort();
  assert.deepEqual(nomes, ['Alchemium Wing', 'Cheetahar', 'Chimera', 'Cyclone Wing', 'Garuda', 'Hellion Wing', 'Phoenix', 'Sephiros', 'Ulysses']);
  for (let i = 0; i < 9; i++) {
    const rng = () => i / 9;
    const n = sortearVitrine(rng, null);
    assert.ok(NAVES_VITRINE.some((v) => mesmaNave(v, n)));
  }
  // Nunca a mesma da vez anterior, em todo o intervalo do rng.
  for (const ant of NAVES_VITRINE) {
    for (const r of [0, 0.3, 0.5, 0.99, 0.999999]) {
      const n = sortearVitrine(() => r, textoDestaque(ant));
      assert.ok(!mesmaNave(n, ant));
      assert.ok(NAVES_VITRINE.some((v) => mesmaNave(v, n)));
    }
  }
  // Todas saem.
  const vistas = new Set();
  for (let k = 0; k < 9; k++) vistas.add(textoDestaque(sortearVitrine(() => k / 9 + 0.01, null)));
  assert.equal(vistas.size, 9);
  // Guardado ruim ou rng estranho não quebra.
  assert.ok(sortearVitrine(() => NaN, 'lixo'));
  assert.ok(sortearVitrine(() => 1, null));
});
