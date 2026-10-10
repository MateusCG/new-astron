// Servidor do New AstroN: um processo Node só, que serve os arquivos do jogo (HTTP)
// e roda o mundo em tempo real (WebSocket em /ws).
//
// Sem Express e sem build: o cliente é ES module puro carregado direto do navegador,
// e o Three.js vem do próprio node_modules em /vendor/ (versão travada no
// package.json, sem depender de CDN no ar).
//
// Protocolo (JSON):
//   cliente → servidor  {t:'entrar', nome, race}
//                       {t:'in', s:seq, th, tu, b, f1, f2, p, a, a2}   um por passo de 1/30 s
//                       (p = botão de pouso, alterna pousar/decolar na borda;
//                        f1/f2 = gatilho do Z/X; a/a2 = arma do encaixe do Z/X,
//                        índice em ARMAS: 0 laser simples, 1 duplo, 2 triplo,
//                        3 dreno, 4 criogênico, 5 plasma, 6 míssil, 7 mina,
//                        8 onda de choque, 9 pulso EMP; fora da lista, ou arma
//                        que a nave não possui (s.armas), vira a padrão do
//                        encaixe: 0 no Z, 5 no X)
//                       {t:'comprar', item}      Loja: item = id de shared/loja.js (arma
//                        pelo nome em ARMAS, 'armaduraLeve' | 'armaduraMedia' |
//                        'armaduraPesada', 'reparo' | 'energia')
//                       {t:'evoluir', opcao}     Evolução da nave: 'casco' | 'reator' | 'motor'
//                       {t:'melhorar', melhoria} mineradores do time: 'quantidade' |
//                        'durabilidade' | 'defesa' | 'velocidade'; ou 'torretas' (sobe
//                        o nível das quatro torretas do time)
//                       {t:'reconstruir', torreta}  reconstrói uma torreta destruída do
//                        próprio time: torreta = id em TORRETAS ('T0-1' a 'T1-4')
//                       {t:'usar', item}         item consumível: 'reparo' (R) | 'energia' (F)
//                       (comprar/evoluir/melhorar/reconstruir só vivo, pousado e parado na
//                        plataforma do serviço da própria base; usar vale em qualquer
//                        lugar; tudo validado em server/servicos.js)
//                       {t:'ping', c}
//   servidor → cliente  {t:'bemvindo', id, tickHz, time}   time = 0 (base de baixo) ou 1
//                       {t:'erro', codigo}   codigo 'partida_cheia' (3 em cada time); fecha
//                       {t:'snap', tick, ack, vivo, time, me, ouro, abates, mortes,
//                        nivel, xp, xpProx, partida, bonus, obj, torretas, melhorias, minas,
//                        guiados, ents, ev}
//                       (me.encaixes = [arma do Z, arma do X], me.cd1/cd2 = recarga
//                        de cada encaixe, me.armas = armas que possui, me.lento =
//                        s de lentidão, me.emp = s sem tiro e sem boost (pulso EMP),
//                        me.time = time da nave, para a predição do pouso;
//                        cada ent traz dreno/lento/emp booleanos para desenhar o efeito;
//                        ev 'tiro' traz kind, que diz a arma e o efeito do projétil;
//                        nivel = nível do jogador (1 a NIVEL_MAX), xp = XP dentro do
//                        nível, xpProx = XP para o próximo (0 no máximo); ouro, xp e
//                        nivel zeram a cada partida)
//                       {t:'resultado', acao, item, ok, codigo?}   resposta (só a quem
//                       pediu) de comprar/evoluir/melhorar/reconstruir/usar; codigo = 'nao_pousado' |
//                       'ouro_insuficiente' | 'nivel_insuficiente' | 'ja_possui' |
//                       'limite' | 'invalido' | 'sem_item' | 'recarga' | 'cheio'
//                       {t:'pong', c}
//   me (Loja e Evolução): armas = posse (de fábrica + compradas; zera a cada
//         partida), armadura (-1 ou 0 a 2), itens {reparo, energia} (carga),
//         cdItens {reparo, energia} (s de recarga), evolucoes (ids das opções da
//         nave, uma por marco), velMult (multiplicador de velocidade, lido no
//         stepShip da predição); maxHp e maxEn já com nível, evoluções e armadura
//   melhorias: {quantidade, durabilidade, defesa, velocidade}   níveis comprados
//         das melhorias dos mineradores do time de quem recebe (zeram a cada partida)
//   partida: {n, estado, restante, placar:[t0, t1], vencedor, novaEm}
//         estado = 'esperando' | 'andamento' | 'fim'; restante e novaEm em s;
//         vencedor = time, -1 empate, null jogando
//   bonus: {0: {mineracao: s, velocidade: s, durabilidade: s}, 1: {...}}  só os ativos
//   obj:  [{id, tipo, estado, time, resta, prog?, quem?, falta?, vida?}]  os seis
//         objetivos (server/objetivos.js): estado = 'livre' | 'tomando' |
//         'contestado' | 'recarga'; time = quem tomou por último (ou null); resta =
//         s de recarga; no A, prog (0 a 1), quem (time tomando) e falta (s); no B e
//         no C, vida (0 a 1) da torre ou do guardião. Torre B em 'recarga' está
//         caída: o cliente a tira da física (definirObstaculoAtivo).
//   torretas: [{id, time, vida, max, nivel, viva, alvo?, obra?}]   as oito torretas do
//         corredor (server/torretas.js; posição em TORRETAS de shared/terrain.js):
//         vida e max em HP, nivel = nível do time dono (1 a 3), viva = de pé e
//         sólida (false: o cliente a tira da física com definirObstaculoAtivo);
//         alvo = id na mira (só se mira alguém); obra = reconstrução paga
//         esperando o lugar ficar livre
//   minas: [{id, dono, time, x, y, z, armada}]   minas no chão (time de quem soltou;
//         armada = já explode com inimigo perto)
//   guiados: [{id, x, y, z, vx, vy, vz}]   mísseis teleguiados em voo: o cliente não
//         prevê a curva e corrige o desenho por aqui
//   ents: [{id, nome, tipo, drone, vivo, race, x, y, z, yaw, roll, hp, maxHp, boost, pousado,
//           dreno, lento, emp, time?, carga?, minerando?, nivel?}]
//         tipo = 'jogador' | 'arnosh' | 'vorax' | 'krakor' | 'guardiao' | 'minerador' |
//         'escolta' (o que desenhar); drone = inimigo do PvE; time em jogadores,
//         mineradores e escoltas;
//         carga e minerando só nos mineradores; nivel só nos jogadores
//   ev:   {e:'tiro'|'acerto'|'fim'|'renasceu'|'saiu', ...}
//         {e:'entrou', id, nome, time}
//         {e:'morte', id, por, tipo, time?, x, y, z}
//         {e:'garra', id, alvo, dano, x, y, z}   golpe corpo a corpo de um Vorax
//         {e:'tiro', ..., fonte, time}   tiro de torreta (fonte 'torreta', dono = id
//                                    dela) ou de escolta (fonte 'escolta'): cor do time
//         {e:'acerto', ..., torre}   tiro que bateu numa torre B (alvo 0)
//         {e:'acerto', ..., torreta}   tiro ou área que bateu numa torreta (alvo 0;
//                                    dano 0 se não foi de jogador inimigo)
//         {e:'torreta', id, time, estado, por, nome, x, y, z}   estado 'destruida' (por =
//                                    quem deu o último tiro) ou 'reconstruida' (por =
//                                    quem pagou)
//         {e:'acerto', arma, alvo, dano, x, y, z}   dano em área (arma 'mina' ou
//                                    'choque'), um por alvo, sem bala
//         {e:'choque', id, time, x, y, z, raio}   onda de choque da nave id
//         {e:'explosao', arma:'mina', id, dono, time, x, y, z, raio}   mina explodiu
//         {e:'nivel', id, nivel}     jogador subiu de nível
//         {e:'melhoria', id, nome, time, melhoria, nivel}   alguém do time `time` comprou
//                                    um nível de melhoria dos mineradores (ou das
//                                    torretas: melhoria 'torretas')
//         {e:'objetivo', id, tipo, time, bonus, segundos, quem}   um time tomou um objetivo
//         {e:'entrega', id, time, carga, x, y, z}   minerador somou carga no placar
//         {e:'partida', n}   começou a partida n (placar zerado)
//         {e:'fimPartida', vencedor, placar}

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
const PEDIDOS = new Set(['comprar', 'evoluir', 'melhorar', 'reconstruir', 'usar']); // server/servicos.js

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
        if (!jogador) {
          // Os dois times cheios: código estável que o cliente traduz na tela de entrada.
          ws.send(JSON.stringify({ t: 'erro', codigo: 'partida_cheia' }));
          ws.close();
          return;
        }
        sockets.set(jogador.id, ws);
        ws.send(JSON.stringify({ t: 'bemvindo', id: jogador.id, tickHz: TICK_HZ, time: jogador.time }));
      } else if (msg?.t === 'in' && jogador) {
        world.pushInput(jogador.id, msg);
      } else if (PEDIDOS.has(msg?.t) && jogador) {
        // Loja e Evolução: o servidor valida tudo e responde só a quem pediu.
        ws.send(JSON.stringify(world.pedido(jogador.id, msg)));
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
