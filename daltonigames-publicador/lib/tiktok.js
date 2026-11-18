// TikTok Content Posting API (v2): autorização (OAuth com PKCE) e envio do
// arquivo em pedaços.
//
// Dois modos:
//  - rascunho (escopo video.upload): o vídeo cai na caixa de entrada do app do
//    TikTok e você termina lá (legenda, capa, publicar). A API não recebe a
//    legenda nesse modo; o publicador grava a legenda num .txt ao lado.
//  - direto (escopo video.publish): publica com a legenda e a privacidade.
//    Enquanto o app não passar na auditoria do TikTok, só posta como privado
//    (SELF_ONLY) e em conta privada.
//
// Pedaços (regra do TikTok): até 64 MB vai num pedaço só; acima disso,
// pedaços de 5 a 64 MB e o último leva a sobra (até 128 MB), com
// total_chunk_count = tamanho / pedaço arredondado para baixo.

import { statSync, openSync, readSync, closeSync } from 'node:fs';
import { clienteTiktok, lerJson, gravarJson } from './credenciais.js';
import { gerarPkce, gerarEstado, esperarCodigo, abrirNavegador, postarFormulario } from './oauth.js';

const API = 'https://open.tiktokapis.com';
const URL_AUTORIZAR = 'https://www.tiktok.com/v2/auth/authorize/';
const URL_TOKEN = `${API}/v2/oauth/token/`;
export const ESCOPOS_TIKTOK = { rascunho: ['user.info.basic', 'video.upload'], direto: ['user.info.basic', 'video.upload', 'video.publish'] };

const MB = 1024 * 1024;
export const PEDACO = { unico: 64 * MB, padrao: 10 * MB, minimo: 5 * MB };

/** @returns {{tamanhoPedaco: number, pedacos: {inicio: number, fim: number}[]}} fim inclusivo */
export function planoDePedacos(tamanho, tamanhoPedaco = PEDACO.padrao) {
  if (!(tamanho > 0)) throw new Error('Arquivo vazio');
  if (tamanho <= PEDACO.unico) return { tamanhoPedaco: tamanho, pedacos: [{ inicio: 0, fim: tamanho - 1 }] };
  const total = Math.floor(tamanho / tamanhoPedaco);
  const pedacos = [];
  for (let i = 0; i < total; i++) {
    const inicio = i * tamanhoPedaco;
    const fim = i === total - 1 ? tamanho - 1 : inicio + tamanhoPedaco - 1;
    pedacos.push({ inicio, fim });
  }
  return { tamanhoPedaco, pedacos };
}

export function urlAutorizacao({ clientKey, redirectUri, desafio, estado, modo = 'rascunho' }) {
  const p = new URLSearchParams({
    client_key: clientKey,
    response_type: 'code',
    scope: ESCOPOS_TIKTOK[modo].join(','),
    redirect_uri: redirectUri,
    state: estado,
    code_challenge: desafio,
    code_challenge_method: 'S256',
  });
  return `${URL_AUTORIZAR}?${p}`;
}

function guardarTokens(t, anterior = {}) {
  const tokens = {
    access_token: t.access_token,
    refresh_token: t.refresh_token || anterior.refresh_token,
    expira_em: Date.now() + (t.expires_in ?? 86400) * 1000,
    refresh_expira_em: t.refresh_expires_in ? Date.now() + t.refresh_expires_in * 1000 : anterior.refresh_expira_em,
    open_id: t.open_id || anterior.open_id,
    escopo: t.scope || anterior.escopo,
  };
  gravarJson('tokens-tiktok.json', tokens);
  return tokens;
}

export async function autorizarTiktok({ modo = 'rascunho', log = console.log } = {}) {
  const { clientKey, clientSecret, redirectUri } = clienteTiktok();
  const volta = new URL(redirectUri);
  if (!['localhost', '127.0.0.1'].includes(volta.hostname)) {
    throw new Error(`redirect_uri ${redirectUri} não é deste computador: cadastre no app uma do tipo http://127.0.0.1:8723/callback/`);
  }
  const { verificador, desafio } = gerarPkce('hex');
  const estado = gerarEstado();
  const url = urlAutorizacao({ clientKey, redirectUri, desafio, estado, modo });
  const codigo = await esperarCodigo({
    porta: Number(volta.port) || 80,
    caminho: volta.pathname,
    estado,
    aoOuvir: () => {
      log('Abra este link, entre com a conta do TikTok do canal e permita o acesso:\n\n' + url + '\n');
      abrirNavegador(url);
    },
  });
  const t = await postarFormulario(URL_TOKEN, {
    client_key: clientKey,
    client_secret: clientSecret,
    code: codigo,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
    code_verifier: verificador,
  });
  return guardarTokens(t);
}

export async function tokenTiktok(fetchFn = globalThis.fetch) {
  const tokens = lerJson('tokens-tiktok.json');
  if (!tokens?.refresh_token) throw new Error('TikTok não autorizado: rode `node publicar.mjs autorizar tiktok`');
  if (tokens.access_token && tokens.expira_em - 60_000 > Date.now()) return tokens.access_token;
  const { clientKey, clientSecret } = clienteTiktok();
  const t = await postarFormulario(URL_TOKEN, {
    client_key: clientKey,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
    refresh_token: tokens.refresh_token,
  }, fetchFn);
  return guardarTokens(t, tokens).access_token;
}

async function chamar(caminho, token, corpo, fetchFn) {
  const res = await fetchFn(`${API}${caminho}`, {
    method: corpo === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || (j.error && j.error.code && j.error.code !== 'ok')) {
    const e = j.error || {};
    const dica = e.code === 'unaudited_client_can_only_post_to_private_accounts'
      ? ' (o app ainda não passou na auditoria do TikTok: a conta precisa estar privada, ou use o modo rascunho)'
      : '';
    throw new Error(`TikTok ${caminho} respondeu ${res.status}: ${e.code || ''} ${e.message || ''}${dica}`.trim());
  }
  return j.data ?? {};
}

export async function meuUsuario(token, fetchFn = globalThis.fetch) {
  const d = await chamar('/v2/user/info/?fields=open_id,display_name', token, undefined, fetchFn);
  return d.user ?? null;
}

/** As opções de privacidade que a conta aceita no modo direto. */
export async function infoCriador(token, fetchFn = globalThis.fetch) {
  return chamar('/v2/post/publish/creator_info/query/', token, {}, fetchFn);
}

/**
 * Envia o vídeo. No modo direto, `legenda` e `privacidade` (SELF_ONLY,
 * PUBLIC_TO_EVERYONE...) vão no post; `ia` liga o rótulo de conteúdo feito
 * por IA (is_aigc).
 * @returns {Promise<{publishId: string, modo: string}>}
 */
export async function enviarTiktok({ arquivo, token, modo = 'rascunho', legenda = '', privacidade = 'SELF_ONLY', ia = false, fetchFn = globalThis.fetch }) {
  const tamanho = statSync(arquivo).size;
  const plano = planoDePedacos(tamanho);
  const source_info = {
    source: 'FILE_UPLOAD',
    video_size: tamanho,
    chunk_size: plano.tamanhoPedaco,
    total_chunk_count: plano.pedacos.length,
  };
  let dados;
  if (modo === 'direto') {
    const criador = await infoCriador(token, fetchFn);
    const opcoes = criador.privacy_level_options ?? [];
    if (opcoes.length && !opcoes.includes(privacidade)) {
      throw new Error(`A conta do TikTok não aceita ${privacidade} agora; aceita: ${opcoes.join(', ')}`);
    }
    const post_info = { title: legenda, privacy_level: privacidade, disable_duet: false, disable_comment: false, disable_stitch: false, video_cover_timestamp_ms: 1000 };
    if (ia) post_info.is_aigc = true;
    dados = await chamar('/v2/post/publish/video/init/', token, { post_info, source_info }, fetchFn);
  } else {
    dados = await chamar('/v2/post/publish/inbox/video/init/', token, { source_info }, fetchFn);
  }
  if (!dados.upload_url || !dados.publish_id) throw new Error('TikTok não devolveu upload_url e publish_id');

  const fd = openSync(arquivo, 'r');
  try {
    for (const { inicio, fim } of plano.pedacos) {
      const buf = Buffer.alloc(fim - inicio + 1);
      readSync(fd, buf, 0, buf.length, inicio);
      const res = await fetchFn(dados.upload_url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'video/mp4',
          'Content-Length': String(buf.length),
          'Content-Range': `bytes ${inicio}-${fim}/${tamanho}`,
        },
        body: buf,
      });
      if (!res.ok) throw new Error(`TikTok recusou o pedaço ${inicio}-${fim} (${res.status}): ${await res.text().catch(() => '')}`);
    }
  } finally {
    closeSync(fd);
  }
  return { publishId: dados.publish_id, modo };
}

/** Situação do envio (PROCESSING_UPLOAD, SEND_TO_USER_INBOX, PUBLISH_COMPLETE, FAILED...). */
export async function situacaoTiktok(token, publishId, fetchFn = globalThis.fetch) {
  return chamar('/v2/post/publish/status/fetch/', token, { publish_id: publishId }, fetchFn);
}
