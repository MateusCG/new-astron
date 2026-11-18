// O que o login OAuth das duas plataformas tem em comum: o PKCE e o servidor
// local que recebe o código quando o navegador volta da tela de permissão.
//
// O Google aceita qualquer porta em http://127.0.0.1 para cliente de
// computador. O TikTok só volta para a URI cadastrada no app, então a porta e
// o caminho saem dela. O TikTok, no login de computador, pede o desafio do
// PKCE em hexadecimal (SHA-256 em hex), e o Google em base64url: daí o formato.

import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';

const base64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** @param {'base64url'|'hex'} formato */
export function gerarPkce(formato = 'base64url') {
  const verificador = base64url(randomBytes(48));
  const hash = createHash('sha256').update(verificador).digest();
  const desafio = formato === 'hex' ? hash.toString('hex') : base64url(hash);
  return { verificador, desafio };
}

export function gerarEstado() {
  return base64url(randomBytes(16));
}

const PAGINA_OK = '<!doctype html><meta charset="utf-8"><title>Publicador</title><body style="font-family:sans-serif;background:#0D1117;color:#fff;padding:40px"><h1>✔ Autorizado</h1><p>Pode fechar esta aba e voltar para o terminal.</p>';
const PAGINA_ERRO = (msg) => `<!doctype html><meta charset="utf-8"><title>Publicador</title><body style="font-family:sans-serif;background:#0D1117;color:#fff;padding:40px"><h1>✖ Não autorizado</h1><p>${String(msg).replace(/[<>&]/g, '')}</p>`;

/**
 * Sobe um servidor em 127.0.0.1 e espera o navegador voltar com ?code=.
 * @param {{porta?: number, caminho?: string, estado: string, tempoMs?: number, aoOuvir?: (porta:number)=>void}} o
 * @returns {Promise<string>} o código de autorização
 */
export function esperarCodigo({ porta = 0, caminho = '/', estado, tempoMs = 5 * 60_000, aoOuvir }) {
  return new Promise((resolve, reject) => {
    const servidor = createServer((req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (url.pathname.replace(/\/+$/, '') !== caminho.replace(/\/+$/, '')) { res.writeHead(404).end(); return; }
      const erro = url.searchParams.get('error');
      const codigo = url.searchParams.get('code');
      const fim = (status, html, f) => {
        res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' }).end(html);
        clearTimeout(relogio);
        servidor.close();
        f();
      };
      if (erro) return fim(400, PAGINA_ERRO(erro), () => reject(new Error(`A plataforma recusou: ${erro} ${url.searchParams.get('error_description') || ''}`.trim())));
      if (url.searchParams.get('state') !== estado) return fim(400, PAGINA_ERRO('estado diferente'), () => reject(new Error('O estado voltou diferente: autorização descartada')));
      if (!codigo) return fim(400, PAGINA_ERRO('sem código'), () => reject(new Error('Voltou sem código de autorização')));
      fim(200, PAGINA_OK, () => resolve(codigo));
    });
    const relogio = setTimeout(() => { servidor.close(); reject(new Error('Tempo esgotado esperando a autorização no navegador')); }, tempoMs);
    servidor.on('error', (e) => { clearTimeout(relogio); reject(e); });
    servidor.listen(porta, '127.0.0.1', () => aoOuvir?.(servidor.address().port));
  });
}

/** Tenta abrir o navegador; se não der, o link já foi impresso no terminal. */
export function abrirNavegador(url) {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  try {
    const p = spawn(cmd, args, { stdio: 'ignore', detached: true });
    p.on('error', () => {});
    p.unref();
  } catch { /* sem navegador: o link está no terminal */ }
}

/** POST de formulário que devolve JSON, com o erro da plataforma na mensagem. */
export async function postarFormulario(url, campos, fetchFn = globalThis.fetch) {
  const res = await fetchFn(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(campos).toString(),
  });
  const texto = await res.text();
  let j;
  try { j = JSON.parse(texto); } catch { j = { texto }; }
  if (!res.ok || j.error) {
    const msg = j.error_description || j.error?.message || j.message || j.error || texto;
    throw new Error(`${url} respondeu ${res.status}: ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`);
  }
  return j;
}
