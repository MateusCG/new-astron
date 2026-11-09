// Opinião dos jogadores: o contrato (shared/opiniao.js), o limite por endereço, a
// gravação no banco (server/opinioes.js, com um pool falso) e a rota POST /api/opiniao
// de verdade, com o armazém na memória; e os lugares dela no index.html.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validarOpiniao, tamanhoTexto, OPINIAO_MIN, OPINIAO_MAX, CATEGORIAS_OPINIAO } from '../shared/opiniao.js';
import { LimiteOpinioes, OpinioesNaMemoria, OpinioesNoBanco, enderecoDoPedido } from '../server/opinioes.js';
import { iniciar } from '../server/index.js';
import { World } from '../server/game.js';
import { enviarOpiniao, mensagemOpiniao } from '../public/js/opiniao.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

test('opinião: o texto tem mínimo e máximo, contado como o jogador vê', () => {
  assert.deepEqual(validarOpiniao({ texto: 'ok' }), { ok: false, codigo: 'texto_curto' });
  assert.deepEqual(validarOpiniao({ texto: '    a   ' }), { ok: false, codigo: 'texto_curto' });
  assert.deepEqual(validarOpiniao({}), { ok: false, codigo: 'texto_curto' });
  assert.equal(validarOpiniao({ texto: 'x'.repeat(OPINIAO_MAX) }).ok, true);
  assert.deepEqual(validarOpiniao({ texto: 'x'.repeat(OPINIAO_MAX + 1) }), { ok: false, codigo: 'texto_longo' });
  // Um emoji conta um caractere, não dois.
  assert.equal(tamanhoTexto('🚀🚀🚀🚀🚀'), 5);
  assert.equal(validarOpiniao({ texto: '🚀'.repeat(OPINIAO_MAX) }).ok, true);
  assert.equal(validarOpiniao({ texto: 'x'.repeat(OPINIAO_MIN) }).ok, true);
});

test('opinião: limpa o texto e aceita só o que conhece', () => {
  const v = validarOpiniao({
    texto: '  Muito bom\r\n\n\n\n\ndemais\u0007!  ',
    categoria: 'hack',
    origem: 'outra',
    nome: 'Piloto com nome muito comprido',
    raca: 'acron',
    classe: 'nada',
    modo: 'online',
    resultado: 'vitoria',
    idioma: 'en',
    ip: '1.2.3.4',
  });
  assert.equal(v.ok, true);
  assert.equal(v.opiniao.texto, 'Muito bom\n\ndemais!');
  assert.equal(v.opiniao.categoria, CATEGORIAS_OPINIAO[0]);
  assert.equal(v.opiniao.origem, 'menu');
  assert.equal(v.opiniao.nome.length, 16);
  assert.equal(v.opiniao.raca, 'acron');
  assert.equal(v.opiniao.classe, null);
  assert.equal(v.opiniao.modo, 'online');
  assert.equal(v.opiniao.resultado, 'vitoria');
  assert.equal(v.opiniao.idioma, 'en');
  assert.equal('ip' in v.opiniao, false);
  assert.deepEqual(validarOpiniao('texto'), { ok: false, codigo: 'invalido' });
  assert.deepEqual(validarOpiniao([1]), { ok: false, codigo: 'invalido' });
});

test('opinião: a nota é opcional, inteira de 1 a 5', () => {
  assert.equal(validarOpiniao({ texto: 'jogo bom', nota: null }).opiniao.nota, null);
  assert.equal(validarOpiniao({ texto: 'jogo bom' }).opiniao.nota, null);
  for (const n of [1, 2, 3, 4, 5]) assert.equal(validarOpiniao({ texto: 'jogo bom', nota: n }).opiniao.nota, n);
  for (const n of [0, 6, 2.5, '4', -1]) assert.deepEqual(validarOpiniao({ texto: 'jogo bom', nota: n }), { ok: false, codigo: 'nota_invalida' });
});

test('opinião: o limite segura o excesso por endereço e solta depois da janela', () => {
  let t = 0;
  const lim = new LimiteOpinioes({ max: 3, janelaMs: 1000, agora: () => t });
  assert.deepEqual([lim.pode('a'), lim.pode('a'), lim.pode('a'), lim.pode('a')], [true, true, true, false]);
  assert.equal(lim.pode('b'), true); // outro endereço não paga pelo primeiro
  t = 1001;
  assert.equal(lim.pode('a'), true);
  assert.equal(enderecoDoPedido({ headers: { 'x-forwarded-for': '9.9.9.9, 10.0.0.1' }, socket: { remoteAddress: '::1' } }), '9.9.9.9');
  assert.equal(enderecoDoPedido({ headers: {}, socket: { remoteAddress: '::1' } }), '::1');
});

test('opinião: no banco, cria a tabela uma vez e grava com parâmetros (nunca o texto na SQL)', async () => {
  const consultas = [];
  const pool = {
    query: async (sql, valores) => {
      consultas.push({ sql, valores });
      return { rows: [{ id: String(consultas.length) }] };
    },
    end: async () => {},
  };
  const banco = new OpinioesNoBanco(pool);
  const { opiniao } = validarOpiniao({ texto: "'); DROP TABLE opinioes; --", nota: 4, categoria: 'problema', raca: 'bellico' });
  await banco.gravar(opiniao, 'Navegador');
  await banco.gravar(opiniao, null);
  assert.equal(consultas.filter((c) => /CREATE TABLE IF NOT EXISTS opinioes/.test(c.sql)).length, 1);
  const insert = consultas.filter((c) => c.sql.startsWith('INSERT'));
  assert.equal(insert.length, 2);
  assert.ok(!insert[0].sql.includes('DROP'));
  assert.ok(insert[0].valores.includes("'); DROP TABLE opinioes; --"));
  assert.ok(insert[0].valores.includes(4));
  assert.ok(insert[0].valores.includes('problema'));
  assert.ok(insert[0].valores.includes('bellico'));
  assert.equal(insert[0].valores.at(-1), 'Navegador');
});

test('opinião: a tabela que falhou ao criar tenta de novo na próxima', async () => {
  let falhar = true;
  const pool = {
    query: async (sql) => {
      if (sql.startsWith('CREATE') && falhar) {
        falhar = false;
        throw new Error('banco fora');
      }
      return { rows: [{ id: '1' }] };
    },
    end: async () => {},
  };
  const banco = new OpinioesNoBanco(pool);
  const { opiniao } = validarOpiniao({ texto: 'jogo bom' });
  await assert.rejects(banco.gravar(opiniao));
  assert.equal(await banco.gravar(opiniao), 1);
});

async function postar(porta, corpo, { tipo = 'application/json', metodo = 'POST' } = {}) {
  const r = await fetch(`http://localhost:${porta}/api/opiniao`, {
    method: metodo,
    headers: { 'content-type': tipo },
    body: metodo === 'GET' ? undefined : typeof corpo === 'string' ? corpo : JSON.stringify(corpo),
  });
  return { status: r.status, corpo: await r.json() };
}

test('opinião: POST /api/opiniao grava, recusa o inválido e segura o excesso', async (t) => {
  const armazem = new OpinioesNaMemoria();
  const srv = await iniciar({
    porta: 0,
    world: new World({ jungle: false, torretas: false }),
    opinioes: armazem,
    limiteOpinioes: new LimiteOpinioes({ max: 2 }),
  });
  t.after(() => srv.fechar());
  const p = srv.porta;

  let r = await postar(p, { texto: 'Gostei muito das naves', nota: 5, categoria: 'opiniao', origem: 'resultado', resultado: 'vitoria', modo: 'online' });
  assert.deepEqual(r, { status: 201, corpo: { ok: true } });
  assert.equal(armazem.lista.length, 1);
  assert.equal(armazem.lista[0].texto, 'Gostei muito das naves');
  assert.equal(armazem.lista[0].nota, 5);
  assert.equal(armazem.lista[0].origem, 'resultado');

  // Inválido não grava nem gasta o limite.
  r = await postar(p, { texto: 'oi' });
  assert.deepEqual(r, { status: 400, corpo: { ok: false, codigo: 'texto_curto' } });
  r = await postar(p, '{quebrado');
  assert.deepEqual(r, { status: 400, corpo: { ok: false, codigo: 'json' } });
  r = await postar(p, { texto: 'sem json' }, { tipo: 'text/plain' });
  assert.equal(r.status, 415);
  r = await postar(p, null, { metodo: 'GET' });
  assert.equal(r.status, 405);
  r = await postar(p, { texto: 'x'.repeat(5000) });
  assert.deepEqual(r, { status: 413, corpo: { ok: false, codigo: 'grande' } });

  r = await postar(p, { texto: 'Segunda opinião' });
  assert.equal(r.status, 201);
  r = await postar(p, { texto: 'Terceira opinião' });
  assert.deepEqual(r, { status: 429, corpo: { ok: false, codigo: 'muitas' } });
  assert.equal(armazem.lista.length, 2);
});

test('opinião: banco fora do ar responde 503 e o jogo segue', async (t) => {
  const srv = await iniciar({
    porta: 0,
    world: new World({ jungle: false, torretas: false }),
    opinioes: { gravar: async () => Promise.reject(new Error('fora')), fechar: async () => {} },
  });
  t.after(() => srv.fechar());
  const erro = console.error;
  console.error = () => {};
  try {
    const r = await postar(srv.porta, { texto: 'Gostei do jogo' });
    assert.deepEqual(r, { status: 503, corpo: { ok: false, codigo: 'indisponivel' } });
  } finally {
    console.error = erro;
  }
  const saude = await (await fetch(`http://localhost:${srv.porta}/healthz`)).json();
  assert.equal(saude.ok, true);
});

test('opinião: o cliente manda pelo POST e traduz o que deu errado', async () => {
  let pedido = null;
  const ok = await enviarOpiniao({ texto: 'jogo bom' }, {
    fetch: async (url, op) => {
      pedido = { url, op };
      return { ok: true, json: async () => ({ ok: true }) };
    },
  });
  assert.deepEqual(ok, { ok: true });
  assert.equal(pedido.url, '/api/opiniao');
  assert.equal(pedido.op.method, 'POST');
  assert.deepEqual(JSON.parse(pedido.op.body), { texto: 'jogo bom' });
  const semRede = await enviarOpiniao({}, { fetch: async () => Promise.reject(new Error('x')) });
  assert.deepEqual(semRede, { ok: false, codigo: 'rede' });
  const cheio = await enviarOpiniao({}, { fetch: async () => ({ ok: false, json: async () => ({ ok: false, codigo: 'muitas' }) }) });
  assert.deepEqual(cheio, { ok: false, codigo: 'muitas' });
  assert.match(mensagemOpiniao('texto_curto'), new RegExp(String(OPINIAO_MIN)));
  assert.match(mensagemOpiniao('texto_longo'), new RegExp(String(OPINIAO_MAX)));
  assert.ok(mensagemOpiniao('desconhecido').length > 0);
});

test('opinião: o botão no topo do menu, a janela e o "Como foi a partida?" no index.html', () => {
  const html = readFileSync(join(RAIZ, 'public/index.html'), 'utf8');
  const topo = html.slice(html.indexOf('<header class="menu-topo">'), html.indexOf('</header>', html.indexOf('<header class="menu-topo">')));
  assert.match(topo, /id="botao-opiniao"/);
  const janela = html.slice(html.indexOf('<div id="opiniao"'));
  for (const s of ['<textarea', 'class="estrelas"', 'data-categoria="opiniao"', 'data-categoria="sugestao"', 'data-categoria="problema"', 'class="enviar"', 'class="cancelar"', 'class="contador"', 'class="obrigado"']) {
    assert.ok(janela.includes(s), s);
  }
  const resultado = html.slice(html.indexOf('<section id="resultado"'), html.indexOf('<section id="painel-teste"'));
  assert.match(resultado, /class="avaliar-partida"/);
  assert.match(resultado, /Como foi a partida\?/);
});
