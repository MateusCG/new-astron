// Onde ficam as chaves: fora do repositório, em ~/.daltonigames/ (ou na pasta
// de DALTONI_DIR). Cada plataforma tem o arquivo do cliente (o que o Google e
// o TikTok dão ao criar o app) e o dos tokens (o que a autorização devolve).
//
//   google-cliente.json   o JSON baixado do Google Cloud (cliente "App para computador")
//   tiktok-cliente.json   {"client_key": "...", "client_secret": "...", "redirect_uri": "..."}
//   tokens-youtube.json   gravado por `publicar autorizar youtube`
//   tokens-tiktok.json    gravado por `publicar autorizar tiktok`

import { mkdirSync, readFileSync, writeFileSync, existsSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export function pastaCredenciais() {
  return process.env.DALTONI_DIR || join(homedir(), '.daltonigames');
}

export function caminho(nome) {
  return join(pastaCredenciais(), nome);
}

export function lerJson(nome) {
  const arq = caminho(nome);
  if (!existsSync(arq)) return null;
  return JSON.parse(readFileSync(arq, 'utf8'));
}

/** Grava legível só pelo dono (600): são chaves da conta. */
export function gravarJson(nome, dados) {
  mkdirSync(pastaCredenciais(), { recursive: true, mode: 0o700 });
  const arq = caminho(nome);
  writeFileSync(arq, JSON.stringify(dados, null, 2) + '\n', { mode: 0o600 });
  try { chmodSync(arq, 0o600); } catch { /* Windows */ }
  return arq;
}

/** O cliente OAuth do Google: aceita o JSON como o Console baixa ({installed: {...}}). */
export function clienteGoogle() {
  const j = lerJson('google-cliente.json');
  if (!j) {
    throw new Error(`Falta ${caminho('google-cliente.json')}: baixe o JSON do cliente OAuth "App para computador" no Google Cloud e salve com esse nome`);
  }
  const c = j.installed || j.web || j;
  if (!c.client_id || !c.client_secret) throw new Error('google-cliente.json sem client_id ou client_secret');
  return { clientId: c.client_id, clientSecret: c.client_secret };
}

export function clienteTiktok() {
  const j = lerJson('tiktok-cliente.json');
  if (!j) {
    throw new Error(`Falta ${caminho('tiktok-cliente.json')}: {"client_key": "...", "client_secret": "...", "redirect_uri": "..."} do app no TikTok for Developers`);
  }
  if (!j.client_key || !j.client_secret || !j.redirect_uri) {
    throw new Error('tiktok-cliente.json precisa de client_key, client_secret e redirect_uri');
  }
  return { clientKey: j.client_key, clientSecret: j.client_secret, redirectUri: j.redirect_uri };
}
