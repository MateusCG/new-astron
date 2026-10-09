// Servidor do New AstroN: um processo Node só, que serve os arquivos do jogo (HTTP)
// e roda o mundo em tempo real (WebSocket em /ws).
//
// Sem Express e sem build: o cliente é ES module puro carregado direto do navegador,
// e o Three.js vem do próprio node_modules em /vendor/ (versão travada no
// package.json, sem depender de CDN no ar).
//
// Protocolo (JSON):
//   cliente → servidor  {t:'entrar', nome, race}
//                       {t:'in', s:seq, th, tu, b, f1, f2, p}   um por passo de 1/30 s
//                       (p = botão de pouso, alterna pousar/decolar na borda)
//                       {t:'ping', c}
//   servidor → cliente  {t:'bemvindo', id, tickHz}
//                       {t:'snap', tick, ack, vivo, me, ouro, abates, mortes, ents, ev}
//                       {t:'pong', c}

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import { World, TICK_HZ } from './game.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PASTAS = {
  '/shared/': path.join(RAIZ, 'shared'),
  '/vendor/': path.join(RAIZ, 'node_modules', 'three', 'build'),
  '/': path.join(RAIZ, 'public'),
};
const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};
const MAX_MSG = 2048;

async function servirArquivo(req, res) {
  const url = new URL(req.url, 'http://x');
  let rota = decodeURIComponent(url.pathname);
  if (rota === '/') rota = '/index.html';
  for (const [prefixo, pasta] of Object.entries(PASTAS)) {
    if (!rota.startsWith(prefixo)) continue;
    const arquivo = path.join(pasta, rota.slice(prefixo.length));
    // Nada de "../": o arquivo tem que ficar dentro da pasta mapeada.
    if (!arquivo.startsWith(pasta + path.sep)) break;
    try {
      const dados = await readFile(arquivo);
      res.writeHead(200, {
        'content-type': TIPOS[path.extname(arquivo)] ?? 'application/octet-stream',
        'cache-control': 'no-cache',
      });
      res.end(dados);
      return;
    } catch {
      break;
    }
  }
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('não encontrado');
}

/**
 * Sobe o servidor. Retorna { server, world, porta, fechar } para os testes.
 * @param {{ porta?: number, world?: World }} [opcoes]
 */
export async function iniciar({ porta = Number(process.env.PORT) || 5090, world = new World() } = {}) {
  const server = http.createServer((req, res) => {
    if (req.url === '/healthz') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, jogadores: world.players.size, tick: world.tick }));
      return;
    }
    servirArquivo(req, res).catch(() => {
      res.writeHead(500);
      res.end();
    });
  });

  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: MAX_MSG });
  const sockets = new Map(); // id do jogador -> ws

  wss.on('connection', (ws) => {
    let jogador = null;
    ws.on('message', (bruto) => {
      let msg;
      try {
        msg = JSON.parse(bruto);
      } catch {
        return;
      }
      if (msg?.t === 'entrar' && !jogador) {
        jogador = world.addPlayer(msg.nome, msg.race);
        sockets.set(jogador.id, ws);
        ws.send(JSON.stringify({ t: 'bemvindo', id: jogador.id, tickHz: TICK_HZ }));
      } else if (msg?.t === 'in' && jogador) {
        world.pushInput(jogador.id, msg);
      } else if (msg?.t === 'ping') {
        ws.send(JSON.stringify({ t: 'pong', c: msg.c }));
      }
    });
    ws.on('close', () => {
      if (!jogador) return;
      sockets.delete(jogador.id);
      world.removePlayer(jogador.id);
    });
  });

  // Passo fixo com acumulador: setInterval atrasa às vezes, e o mundo não pode
  // andar mais devagar por isso.
  const passoMs = 1000 / TICK_HZ;
  let ultimo = performance.now();
  let acumulado = 0;
  const loop = setInterval(() => {
    const agora = performance.now();
    acumulado = Math.min(acumulado + agora - ultimo, passoMs * 10);
    ultimo = agora;
    while (acumulado >= passoMs) {
      acumulado -= passoMs;
      world.step();
      if (world.ehTickDeSnapshot()) {
        const ents = world.entidades();
        const ev = world.tirarEventos();
        for (const [id, ws] of sockets) {
          const j = world.players.get(id);
          if (j && ws.readyState === ws.OPEN) ws.send(JSON.stringify(world.snapshotPara(j, ents, ev)));
        }
      }
    }
  }, passoMs / 2);

  await new Promise((ok) => server.listen(porta, ok));
  return {
    server,
    world,
    porta: server.address().port,
    fechar: () =>
      new Promise((ok) => {
        clearInterval(loop);
        for (const c of wss.clients) c.terminate();
        wss.close();
        server.close(ok);
      }),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { porta } = await iniciar();
  console.log(`New AstroN no ar: http://localhost:${porta}`);
}
