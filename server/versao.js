// A versão do build que está no ar (pedido do Mateus, 09/nov/2026): a tela de abertura
// mostra no canto qual versão do jogo o piloto abriu, para quem joga dizer de qual
// build fala e quem testa saber se o deploy novo já chegou.
//
// Sem build no projeto, a versão é montada quando o servidor liga: o número do
// package.json (`version`, subido à mão a cada versão) e o commit do código. No Railway
// o contêiner não tem a pasta .git, mas o Railway passa o commit do deploy em
// RAILWAY_GIT_COMMIT_SHA; fora dele (a máquina de quem desenvolve), o `git` da pasta.
// Sem nenhum dos dois, só o número. O cliente lê em GET /api/versao.

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Caracteres do commit mostrados (o curto do git). */
export const COMMIT_CURTO = 7;

/** O commit da pasta pelo git, ou null (sem git ou sem .git). */
function commitDoGit() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: RAIZ, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 2000 }).trim();
  } catch {
    return null;
  }
}

/** O `version` do package.json. */
function versaoDoPacote() {
  try {
    return JSON.parse(readFileSync(path.join(RAIZ, 'package.json'), 'utf8')).version ?? null;
  } catch {
    return null;
  }
}

/**
 * A versão do build: `{ versao, commit }` (commit curto, ou null). As fontes vêm de fora
 * nos testes; sem elas, o package.json, o ambiente e o git da pasta.
 * @param {{ versao?: string|null, env?: Record<string, string|undefined>, git?: () => string|null }} [fontes]
 */
export function versaoDoBuild({ versao = versaoDoPacote(), env = process.env, git = commitDoGit } = {}) {
  const bruto = env.RAILWAY_GIT_COMMIT_SHA || git() || '';
  const commit = /^[0-9a-f]{7,40}$/i.test(bruto.trim()) ? bruto.trim().slice(0, COMMIT_CURTO).toLowerCase() : null;
  return { versao: typeof versao === 'string' && versao ? versao : null, commit };
}
