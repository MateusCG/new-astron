// Os envios com a rede de mentira: confere a ordem dos pedidos, os cabeçalhos
// e que nada sai sem o --confirmar.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const pasta = mkdtempSync(join(tmpdir(), 'daltoni-teste-'));
process.env.DALTONI_DIR = pasta;
const { enviarYoutube, urlAutorizacao: urlYoutube } = await import('../lib/youtube.js');
const { enviarTiktok, planoDePedacos, urlAutorizacao: urlTiktok, PEDACO } = await import('../lib/tiktok.js');
const { gerarPkce } = await import('../lib/oauth.js');
const { planoDeEnvio } = await import('../publicar.mjs');

const arquivo = join(pasta, 'video.mp4');
before(() => writeFileSync(arquivo, Buffer.alloc(1234, 7)));

function redeFalsa(respostas) {
  const pedidos = [];
  const fn = async (url, o = {}) => {
    let corpo = o.body;
    if (corpo && typeof corpo[Symbol.asyncIterator] === 'function') {
      const partes = [];
      for await (const p of corpo) partes.push(p);
      corpo = Buffer.concat(partes);
    }
    pedidos.push({ url, metodo: o.method ?? 'GET', cab: o.headers ?? {}, corpo });
    const r = respostas.shift();
    return new Response(JSON.stringify(r.json ?? {}), { status: r.status ?? 200, headers: r.headers ?? {} });
  };
  return { fn, pedidos };
}

test('YouTube: POST dos metadados, depois PUT do arquivo na sessão', async () => {
  const rede = redeFalsa([
    { headers: { location: 'https://upload.exemplo/sessao1' } },
    { json: { id: 'abc123', status: { privacyStatus: 'private' } } },
  ]);
  const corpo = { snippet: { title: 't' }, status: { privacyStatus: 'public' } };
  const r = await enviarYoutube({ arquivo, corpo, token: 'TK', fetchFn: rede.fn });
  assert.equal(r.url, 'https://youtube.com/shorts/abc123');
  assert.equal(r.privacidade, 'private');
  const [ini, put] = rede.pedidos;
  assert.equal(ini.metodo, 'POST');
  assert.match(ini.url, /uploadType=resumable/);
  assert.equal(ini.cab.Authorization, 'Bearer TK');
  assert.equal(ini.cab['X-Upload-Content-Length'], '1234');
  assert.deepEqual(JSON.parse(ini.corpo), corpo);
  assert.equal(put.url, 'https://upload.exemplo/sessao1');
  assert.equal(put.metodo, 'PUT');
  assert.equal(put.corpo.length, 1234);
});

test('YouTube: erro do Google chega na mensagem', async () => {
  const rede = redeFalsa([{ status: 403, json: { error: { message: 'quotaExceeded' } } }]);
  await assert.rejects(enviarYoutube({ arquivo, corpo: {}, token: 'TK', fetchFn: rede.fn }), /quotaExceeded/);
});

test('TikTok: rascunho vai para o inbox, num pedaço só', async () => {
  const rede = redeFalsa([
    { json: { data: { publish_id: 'p1', upload_url: 'https://up.tiktok/1' }, error: { code: 'ok' } } },
    { json: {} },
  ]);
  const r = await enviarTiktok({ arquivo, token: 'TT', fetchFn: rede.fn });
  assert.equal(r.publishId, 'p1');
  const [ini, put] = rede.pedidos;
  assert.match(ini.url, /\/v2\/post\/publish\/inbox\/video\/init\/$/);
  assert.deepEqual(JSON.parse(ini.corpo).source_info, { source: 'FILE_UPLOAD', video_size: 1234, chunk_size: 1234, total_chunk_count: 1 });
  assert.equal(put.cab['Content-Range'], 'bytes 0-1233/1234');
});

test('TikTok: direto confere a privacidade aceita e manda a legenda', async () => {
  const rede = redeFalsa([
    { json: { data: { privacy_level_options: ['SELF_ONLY'] }, error: { code: 'ok' } } },
    { json: { data: { publish_id: 'p2', upload_url: 'https://up.tiktok/2' }, error: { code: 'ok' } } },
    { json: {} },
  ]);
  await enviarTiktok({ arquivo, token: 'TT', modo: 'direto', legenda: 'oi #daltonismo', privacidade: 'SELF_ONLY', ia: true, fetchFn: rede.fn });
  const post = JSON.parse(rede.pedidos[1].corpo).post_info;
  assert.equal(post.title, 'oi #daltonismo');
  assert.equal(post.privacy_level, 'SELF_ONLY');
  assert.equal(post.is_aigc, true);

  const recusa = redeFalsa([{ json: { data: { privacy_level_options: ['SELF_ONLY'] }, error: { code: 'ok' } } }]);
  await assert.rejects(enviarTiktok({ arquivo, token: 'TT', modo: 'direto', privacidade: 'PUBLIC_TO_EVERYONE', fetchFn: recusa.fn }), /não aceita PUBLIC_TO_EVERYONE/);
});

test('TikTok: o erro de app sem auditoria vem explicado', async () => {
  const rede = redeFalsa([{ status: 403, json: { error: { code: 'unaudited_client_can_only_post_to_private_accounts', message: 'x' } } }]);
  await assert.rejects(enviarTiktok({ arquivo, token: 'TT', fetchFn: rede.fn }), /auditoria do TikTok/);
});

test('TikTok: pedaços pela regra (até 64 MB num só; depois o último leva a sobra)', () => {
  const MB = 1024 * 1024;
  assert.deepEqual(planoDePedacos(30 * MB).pedacos, [{ inicio: 0, fim: 30 * MB - 1 }]);
  const p = planoDePedacos(105 * MB + 7);
  assert.equal(p.tamanhoPedaco, PEDACO.padrao);
  assert.equal(p.pedacos.length, 10);
  assert.equal(p.pedacos.at(-1).fim, 105 * MB + 6);
  assert.ok(p.pedacos.at(-1).fim - p.pedacos.at(-1).inicio + 1 <= 128 * MB);
  for (let i = 1; i < p.pedacos.length; i++) assert.equal(p.pedacos[i].inicio, p.pedacos[i - 1].fim + 1);
});

test('PKCE: Google em base64url, TikTok em hex, e as URLs de autorização', () => {
  const g = gerarPkce('base64url');
  assert.match(g.verificador, /^[A-Za-z0-9_-]{43,128}$/);
  assert.match(g.desafio, /^[A-Za-z0-9_-]{43}$/);
  assert.match(gerarPkce('hex').desafio, /^[0-9a-f]{64}$/);
  const uy = new URL(urlYoutube({ clientId: 'C', redirectUri: 'http://127.0.0.1:5000', desafio: 'D', estado: 'E' }));
  assert.equal(uy.searchParams.get('access_type'), 'offline');
  assert.match(uy.searchParams.get('scope'), /youtube\.upload/);
  const ut = new URL(urlTiktok({ clientKey: 'K', redirectUri: 'http://127.0.0.1:8723/callback/', desafio: 'D', estado: 'E' }));
  assert.equal(ut.searchParams.get('scope'), 'user.info.basic,video.upload');
});

test('plano: sem auditoria, avisa que o YouTube trava como privado', () => {
  const p = planoDeEnvio(arquivo, { titulo: 'Teste', tags: 'a,b' });
  assert.deepEqual(p.onde, ['youtube', 'tiktok']);
  assert.ok(p.avisos.some((a) => /TRAVADO como privado/.test(a)));
  assert.equal(p.tiktok.modo, 'rascunho');
  assert.throws(() => planoDeEnvio(arquivo, { titulo: 'x', onde: 'bilibili' }));
});

test('enviar sem --confirmar é só ensaio e não toca a rede', () => {
  const cli = fileURLToPath(new URL('../publicar.mjs', import.meta.url));
  const r = spawnSync(process.execPath, [cli, 'enviar', arquivo, '--titulo', 'Hades II pelos olhos de um daltônico', '--tags', 'hades,daltonismo'], {
    encoding: 'utf8',
    env: { ...process.env, DALTONI_DIR: pasta, HTTPS_PROXY: 'http://127.0.0.1:9', https_proxy: 'http://127.0.0.1:9' },
  });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Ensaio: nada foi enviado/);
  assert.match(r.stdout, /#hades #daltonismo/);
});
