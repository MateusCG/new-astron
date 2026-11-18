// YouTube Data API v3: autorização (OAuth de app para computador, com PKCE) e
// envio pelo upload retomável: um POST com os metadados devolve a URL da
// sessão (Location) e um PUT manda o arquivo.
//
// Regra do Google que manda no plano: vídeo enviado por um projeto de API
// criado depois de 28/07/2020 que ainda não passou na auditoria dos Serviços
// de API do YouTube fica TRAVADO como privado, seja qual for o privacyStatus
// pedido, e não dá para tornar público depois (é preciso reenviar). Por isso
// o publicador avisa antes de enviar enquanto o config.json da pasta de
// credenciais não disser "youtubeAuditado": true.

import { statSync, createReadStream } from 'node:fs';
import { clienteGoogle, lerJson, gravarJson } from './credenciais.js';
import { gerarPkce, gerarEstado, esperarCodigo, abrirNavegador, postarFormulario } from './oauth.js';

export const ESCOPOS_YOUTUBE = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
];
const URL_AUTORIZAR = 'https://accounts.google.com/o/oauth2/v2/auth';
const URL_TOKEN = 'https://oauth2.googleapis.com/token';
const URL_ENVIO = 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status';
const URL_CANAL = 'https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true';

export function urlAutorizacao({ clientId, redirectUri, desafio, estado }) {
  const p = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: ESCOPOS_YOUTUBE.join(' '),
    // offline + consent: o Google só devolve o refresh_token assim.
    access_type: 'offline',
    prompt: 'consent',
    code_challenge: desafio,
    code_challenge_method: 'S256',
    state: estado,
  });
  return `${URL_AUTORIZAR}?${p}`;
}

function guardarTokens(t, anterior = {}) {
  const tokens = {
    access_token: t.access_token,
    refresh_token: t.refresh_token || anterior.refresh_token,
    expira_em: Date.now() + (t.expires_in ?? 3600) * 1000,
    escopo: t.scope || anterior.escopo,
  };
  gravarJson('tokens-youtube.json', tokens);
  return tokens;
}

/** Abre o navegador, espera a permissão e grava os tokens. */
export async function autorizarYoutube({ log = console.log } = {}) {
  const { clientId, clientSecret } = clienteGoogle();
  const { verificador, desafio } = gerarPkce('base64url');
  const estado = gerarEstado();
  let redirectUri;
  const codigo = await esperarCodigo({
    estado,
    aoOuvir: (porta) => {
      redirectUri = `http://127.0.0.1:${porta}`;
      const url = urlAutorizacao({ clientId, redirectUri, desafio, estado });
      log('Abra este link, entre com a conta do canal e permita o acesso:\n\n' + url + '\n');
      abrirNavegador(url);
    },
  });
  const t = await postarFormulario(URL_TOKEN, {
    code: codigo,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
    code_verifier: verificador,
  });
  if (!t.refresh_token) throw new Error('O Google não devolveu refresh_token: tire o acesso do app em myaccount.google.com/permissions e autorize de novo');
  return guardarTokens(t);
}

/** Token de acesso válido, renovando com o refresh_token quando falta 1 minuto. */
export async function tokenYoutube(fetchFn = globalThis.fetch) {
  const tokens = lerJson('tokens-youtube.json');
  if (!tokens?.refresh_token) throw new Error('YouTube não autorizado: rode `node publicar.mjs autorizar youtube`');
  if (tokens.access_token && tokens.expira_em - 60_000 > Date.now()) return tokens.access_token;
  const { clientId, clientSecret } = clienteGoogle();
  try {
    const t = await postarFormulario(URL_TOKEN, {
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: tokens.refresh_token,
      grant_type: 'refresh_token',
    }, fetchFn);
    return guardarTokens(t, tokens).access_token;
  } catch (e) {
    if (/invalid_grant/.test(e.message)) {
      throw new Error('A autorização do YouTube venceu (no modo "Teste" do Google ela dura 7 dias): rode `node publicar.mjs autorizar youtube` de novo');
    }
    throw e;
  }
}

/** O canal da conta autorizada, para conferir que é o @DaltoniGames. */
export async function meuCanal(token, fetchFn = globalThis.fetch) {
  const res = await fetchFn(URL_CANAL, { headers: { Authorization: `Bearer ${token}` } });
  const j = await res.json();
  if (!res.ok) throw new Error(`YouTube respondeu ${res.status}: ${j.error?.message || JSON.stringify(j)}`);
  const c = j.items?.[0];
  if (!c) return null;
  return { id: c.id, titulo: c.snippet.title, handle: c.snippet.customUrl, inscritos: c.statistics?.subscriberCount, videos: c.statistics?.videoCount };
}

/**
 * Envia o arquivo com os metadados de `metadadosYoutube().corpo`.
 * @returns {Promise<{id: string, url: string, privacidade: string}>}
 */
export async function enviarYoutube({ arquivo, corpo, token, curto = true, fetchFn = globalThis.fetch }) {
  const tamanho = statSync(arquivo).size;
  const ini = await fetchFn(URL_ENVIO, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Length': String(tamanho),
      'X-Upload-Content-Type': 'video/mp4',
    },
    body: JSON.stringify(corpo),
  });
  if (!ini.ok) {
    const j = await ini.json().catch(() => ({}));
    throw new Error(`YouTube recusou o envio (${ini.status}): ${j.error?.message || JSON.stringify(j)}`);
  }
  const sessao = ini.headers.get('location');
  if (!sessao) throw new Error('YouTube não devolveu a URL da sessão de envio');
  const res = await fetchFn(sessao, {
    method: 'PUT',
    headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(tamanho) },
    body: createReadStream(arquivo),
    duplex: 'half',
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.id) throw new Error(`O envio do arquivo falhou (${res.status}): ${j.error?.message || JSON.stringify(j)}`);
  return {
    id: j.id,
    url: curto ? `https://youtube.com/shorts/${j.id}` : `https://youtu.be/${j.id}`,
    privacidade: j.status?.privacyStatus ?? corpo.status.privacyStatus,
  };
}
