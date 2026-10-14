// Servidor do New AstroN: um processo Node só, que serve os arquivos do jogo (HTTP)
// e roda o mundo em tempo real (WebSocket em /ws).
//
// Sem Express e sem build: o cliente é ES module puro carregado direto do navegador,
// e o Three.js vem do próprio node_modules em /vendor/ (versão travada no
// package.json, sem depender de CDN no ar), com os addons (GLTFLoader, que lê o
// modelo da nave em public/modelos/) em /vendor/addons/.
//
// Protocolo (JSON):
//   cliente → servidor  {t:'entrar', nome, race, classe, teste?}   teste: true = modo de
//                        teste, num mundo só seu (partida sem relógio; MAX_MUNDOS_TESTE
//                        ao mesmo tempo, senão {t:'erro', codigo:'teste_cheio'})
//                       (race = 'acron' | 'bellico' | 'shrewdo'; 'mechan' ainda sem
//                        naves é recusada com 'raca_bloqueada', outra coisa com
//                        'raca_invalida'; classe = 'assault' | 'mobile' |
//                        'functional', inválida ou ausente vira 'assault'; o piloto
//                        começa na primeira nave da linha, shared/naves.js)
//                       {t:'teste', acao}   só no modo de teste: 'ouro' (+1000), 'xp'
//                        (+100), 'nivel' (sobe um), 'nivelMax' (vai ao 20); resposta
//                        {t:'resultado', acao:'teste', item, ok, codigo?} ('limite' no
//                        nível máximo, 'invalido' fora do modo de teste)
//                       {t:'in', s:seq, th, tu, b, f1, f2, p, r, a, a2}   um por passo de 1/30 s
//                       (p = botão de pouso, alterna pousar/decolar na borda;
//                        r = botão do recall (B), pulso: na borda começa a
//                        canalizar a volta à base ou cancela (shared/recall.js);
//                        f1/f2 = gatilho do Z/X (segurado: as armas de segurar a
//                        tecla ficam ligadas enquanto vale); a/a2 = arma do
//                        encaixe do Z/X, índice em ARMAS (shared/armas.js): 0 e 1
//                        são os tiros dos NPCs (laser, plasma; o jogador nunca
//                        usa), 2 a 141 as armas do Astro-N original na ordem das
//                        lojas (Acron 2–49, Bellico 50–92, Shrewdo 93–141; chave
//                        'o<id do original>'); fora da lista vira -1; arma de outra
//                        raça ou classe, ou que a nave não possui (s.armas), cai
//                        na de fábrica da raça no encaixe (armasIniciais: um feixe
//                        no Z, uma metralhadora no X); fora da própria base, trocar
//                        a arma de um encaixe o põe em recarga de troca de
//                        TROCA_ARMA_S, e outra troca nele enquanto conta é
//                        ignorada: o stepShip fica com a arma que tem)
//                       {t:'comprar', item}      Loja: item = id de shared/loja.js (arma
//                        pela chave, ex. 'o312010', só da raça e da classe do
//                        piloto, senão 'invalido'; 'armaduraLeve' | 'armaduraMedia' |
//                        'armaduraPesada', 'reparo' | 'energia', ou
//                        'evoluir:<arma>' para subir a arma possuída para a próxima
//                        versão do original (V2 a V5), ex. 'evoluir:o311001'; sem
//                        possuir: 'sem_item'; sem o nível do piloto da versão (5,
//                        10, 15, 20): 'nivel_insuficiente'; na V5: 'limite')
//                       {t:'evoluir', opcao:'nave'}  Evolução da nave: compra a próxima
//                        nave da linha da raça e classe (nível e ouro dela; na
//                        última, 'limite'; outra opcao, 'invalido')
//                       {t:'melhorar', melhoria} mineradores do time: 'quantidade' |
//                        'durabilidade' | 'defesa' | 'velocidade'; ou 'torretas' (sobe
//                        o nível das quatro torretas do time)
//                       {t:'reconstruir', torreta}  reconstrói uma torreta destruída do
//                        próprio time: torreta = id em TORRETAS ('T0-1' a 'T1-4')
//                       {t:'usar', item}         item consumível: 'reparo' (R) | 'energia' (F)
//                       (comprar/evoluir/melhorar/reconstruir só vivo, pousado e parado na
//                        plataforma do serviço da própria base; usar vale em qualquer
//                        lugar; tudo validado em server/servicos.js)
//                       {t:'ia', acao, lado?, id?}   computador: acao 'adicionar' com
//                        lado 'meu' | 'inimigo' (relativo a quem pede) põe um jogador do
//                        computador naquele time ('cheio' com 3); acao 'remover' com o id
//                        de um computador o tira (de humano, 'invalido'); resposta
//                        {t:'resultado', acao:'ia', item: acao, ok, codigo?}. O nick dele
//                        é sempre "NOME (IA)" (server/bots.js). Humano que entra com a
//                        partida cheia fica com a vaga de um computador.
//                       {t:'ping', c}
//   servidor → cliente  {t:'bemvindo', id, tickHz, time, teste}   time = 0 (base de baixo) ou 1
//                       {t:'erro', codigo}   codigo 'partida_cheia' (3 em cada time),
//                        'raca_bloqueada' ou 'raca_invalida'; fecha
//                       {t:'snap', tick, ack, vivo, renasceEm, time, me, ouro, abates, mortes,
//                        nivel, xp, xpProx, partida, bonus, obj, torretas, melhorias, minas,
//                        guiados, jogadores, st, ents, ev}
//                       (me.encaixes = [arma do Z, arma do X], me.cd1/cd2 = recarga
//                        de cada encaixe, me.troca1/troca2 = s de recarga de troca
//                        de arma de cada encaixe (sem tiro e sem troca nele),
//                        me.armas = armas que possui (as de fábrica da raça e as
//                        compradas), me.niveis = nível (versão V1–V5) de cada arma
//                        evoluída {índice: nível} (o stepShip lê a versão daqui),
//                        me.raj1/raj2 (+ rajT, rajK) = rajada em andamento de cada
//                        encaixe, me.seg1/seg2 = arma de segurar ligada (-1 nenhuma),
//                        efeitos de arma recebidos (s restantes, todos lidos no
//                        stepShip): me.lento + me.lentoMult (fração da velocidade; 0
//                        é paralisia do movimento), me.emp (sem tiro e sem boost),
//                        me.semTiro (paralisia do ataque), me.trava (sem acelerar
//                        nem frear), me.desgov (curva invertida), me.semRegen (energia
//                        não recupera), me.cadencia + me.cadMult (recarga maior),
//                        me.enCara + me.enCaraMult (tiro mais caro), me.drenoEn +
//                        me.drenoEnPs (perde energia por s),
//                        me.time = time da nave, para a predição do pouso;
//                        me.classe e me.tier = a nave da linha (shared/naves.js),
//                        me.velocidade (m/s) e me.regenEn (energia por s) = da
//                        nave, lidos no stepShip da predição; me.regenHpVoo e
//                        me.regenHpPousada (HP/s voando e pousada) = da nave, só
//                        informação (quem regenera é o servidor);
//                        cada ent traz dreno/lento/emp booleanos para desenhar o efeito;
//                        ev 'tiro' traz kind, que diz a arma e o efeito do projétil;
//                        nivel = nível do jogador (1 a NIVEL_MAX), xp = XP dentro do
//                        nível, xpProx = XP para o próximo (0 no máximo); ouro, xp e
//                        nivel zeram a cada partida; renasceEm = s até a nave
//                        renascer, 0 viva: cresce com o nível e com a partida)
//                       {t:'resultado', acao, item, ok, codigo?}   resposta (só a quem
//                       pediu) de comprar/evoluir/melhorar/reconstruir/usar; codigo = 'nao_pousado' |
//                       'ouro_insuficiente' | 'nivel_insuficiente' | 'ja_possui' |
//                       'limite' | 'invalido' | 'sem_item' | 'recarga' | 'cheio'
//                       {t:'pong', c}
//   me (Loja e Evolução): armas = posse (de fábrica + compradas; zera a cada
//         partida), niveis = {índice em ARMAS: nível 2 a 5} das armas evoluídas na
//         Loja (zera a cada partida), armadura (-1 ou 0 a 2), itens {reparo, energia} (carga),
//         cdItens {reparo, energia} (s de recarga), tier (nave da linha comprada,
//         0 a 4; zera a cada partida), velMult (multiplicador de velocidade da
//         armadura pesada, lido no stepShip da predição); maxHp e maxEn já com a
//         nave, o nível e a armadura
//   melhorias: {quantidade, durabilidade, defesa, velocidade}   níveis comprados
//         das melhorias dos mineradores do time de quem recebe (zeram a cada partida)
//   jogadores: [{id, nome, time, nivel, ia?, abates, mortes, vivo}]   todos os
//         jogadores da partida, humanos e computadores (ia: true), para a janela de
//         times
//   partida: {n, estado, fase, restante, semTempo, placar:[t0, t1], vencedor, novaEm}
//            (semTempo: modo de teste, a partida não acaba e restante vem 0)
//         estado = 'esperando' | 'andamento' | 'fim'; fase = 'normal' | 'final'
//         (últimos 3 min: minério entregue vale o dobro); restante e novaEm em s;
//         vencedor = time, -1 empate, null jogando
//   bonus: {0: {mineracao: s, velocidade: s, durabilidade: s, furia: s}, 1: {...}}
//         só os ativos; furia = +20% de dano das naves do time (objetivo C)
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
//   minas: [{id, dono, time, kind, nv, p, campo?, raio, x, y, z, armada}]   minas e
//         campos no chão (time de quem soltou; kind/nv/p = a arma, a versão e a
//         profundidade do golpe, para o desenho; campo = área que fere a cada
//         intervalo; raio = gatilho da mina ou área do campo; armada = já age)
//   guiados: [{id, kind, nv, p, x, y, z, vx, vy, vz}]   teleguiados em voo: o
//         cliente não prevê a curva e corrige o desenho por aqui
//   st: {cego?, invisivel?, revelado?, invulneravel?, escudo?, converte?, regen?,
//         fraco?, vulneravel?, recuo?, curaTempo?, resiste_<tipo>?}   estados das
//         armas no próprio jogador que só o servidor conta (s restantes; invisivel
//         -1 = segurando a camuflagem): o HUD avisa, e cego esconde os inimigos do
//         minimapa e dos rótulos
//   ents: [{id, nome, tipo, drone, vivo, race, x, y, z, yaw, roll, hp, maxHp, boost, pousado,
//           dreno, lento, emp, fx?, time?, carga?, minerando?, nivel?, classe?, tier?, arm?, recall?}]
//         fx = efeitos de arma visíveis ('para', 'desg', 'energia', 'invul',
//         'escudo', 'fraco', 'regen', 'acel', 'inv'); arm = [arma do Z, arma do X]
//         dos jogadores (o modelo pendurado em cada asa). Jogador camuflado do outro
//         time não vem na lista (salvo a INVISIVEL_VISTO_M da sua nave ou logo
//         depois de atirar);
//         tipo = 'jogador' | 'arnosh' | 'vorax' | 'krakor' | 'guardiao' | 'minerador' |
//         'escolta' (o que desenhar); drone = inimigo do PvE; time em jogadores,
//         mineradores e escoltas; carga e minerando só nos mineradores; nivel, classe
//         e tier só nos jogadores (raça + classe + tier = o modelo da nave); recall
//         (0 a 1) só em quem está canalizando a volta à base
//   ev:   {e:'tiro'|'acerto'|'fim'|'renasceu'|'saiu', ...}
//         {e:'tiro', id, dono, kind, nv, p, x, y, z, vx, vy, vz, vida, enc?}   projétil
//                                    de arma (nv = versão, p = profundidade do golpe:
//                                    0 o disparo, 1+ subprojétil; enc = encaixe de
//                                    onde saiu, para o desenho sair da boca da arma)
//         {e:'entrou', id, nome, time}
//         {e:'morte', id, por, tipo, time?, x, y, z, ouro?, renasce?, assist?, ouroAssist?,
//          seq?, encerrou?, seqPor?}
//                                    ouro = ouro que o matador (jogador) ganhou, bônus
//                                    incluso; em morte de jogador: renasce = s até
//                                    renascer; assist = ids dos aliados do matador que
//                                    feriram a vítima na janela, ouroAssist = ouro de
//                                    cada um; seq = sequência da vítima encerrada e
//                                    encerrou = bônus de ouro (só com seq >= 2);
//                                    seqPor = sequência do matador com este abate
//         {e:'garra', id, alvo, dano, x, y, z}   golpe corpo a corpo de um Vorax
//         {e:'tiro', ..., fonte, time}   tiro de torreta (fonte 'torreta', dono = id
//                                    dela) ou de escolta (fonte 'escolta'): cor do time
//         {e:'acerto', ..., torre}   tiro que bateu numa torre B (alvo 0)
//         {e:'acerto', ..., torreta}   tiro ou área que bateu numa torreta (alvo 0;
//                                    dano 0 se não foi de jogador inimigo)
//         {e:'torreta', id, time, estado, por, nome, x, y, z}   estado 'destruida' (por =
//                                    quem deu o último tiro) ou 'reconstruida' (por =
//                                    quem pagou)
//         {e:'acerto', kind, alvo, dano, x, y, z, bala?}   golpe de arma num alvo (um
//                                    por alvo; bala = o tiro que bateu direto)
//         {e:'explosao', arma, nv, p, dono, time, x, y, z, raio, mina?}   área de um
//                                    golpe (impacto com área, fim da vida, mina; raio
//                                    0 = mina que atirou e sumiu)
//         {e:'nova', id, dono, time, kind, nv, p, x, y, z, raio, vel}   esfera que
//                                    cresce parada no ponto a vel m/s até raio
//         {e:'efeito', id, kind, nv, time, x, y, z}   dispositivo ligado na nave id
//                                    (camuflagem, escudo, teleporte...)
//         {e:'cura', id, por, hp, x, y, z}   aliado curado por arma de suporte
//         {e:'desarmou', id, x, y, z}   mina destruída pela Nova Desarmadora
//         {e:'nivel', id, nivel}     jogador subiu de nível
//         {e:'nave', id, nome, time, tier, nave}   jogador comprou a próxima nave da
//                                    linha na Evolução (nave = nome dela): todos trocam
//                                    o modelo (o snapshot também traz o tier)
//         {e:'melhoria', id, nome, time, melhoria, nivel}   alguém do time `time` comprou
//                                    um nível de melhoria dos mineradores (ou das
//                                    torretas: melhoria 'torretas')
//         {e:'objetivo', id, tipo, time, bonus, bonusNaves, segundos, quem}   um time
//                                    tomou um objetivo (bonus = dos mineradores;
//                                    bonusNaves = das naves do time, só no C: 'furia')
//         {e:'entrega', id, time, carga, x, y, z}   minerador somou carga no placar
//                                    (carga = o que entrou, já dobrado na fase final)
//         {e:'faseFinal', mult, restante}   começou a fase final (minério × mult)
//         {e:'partida', n}   começou a partida n (placar zerado)
//         {e:'fimPartida', vencedor, placar}
//         {e:'recall', id, estado, motivo?, s?, de?, x?, y?, z?}   volta à base:
//                                    estado 'inicio' (s = segundos de canalização) |
//                                    'recusado' | 'cancelado' (motivo 'na_base' |
//                                    'tiro' | 'boost' | 'velocidade' | 'dano' |
//                                    'cancelou') | 'chegou' (de = de onde saiu,
//                                    x/y/z = onde apareceu na base)

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import { World, TICK_HZ } from './game.js';
import { motivoRacaRecusada } from '../shared/naves.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PASTAS = {
  '/shared/': path.join(RAIZ, 'shared'),
  // Antes de '/vendor/': o primeiro prefixo que bate é o que vale.
  '/vendor/addons/': path.join(RAIZ, 'node_modules', 'three', 'examples', 'jsm'),
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
  '.glb': 'model/gltf-binary',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
};
const MAX_MSG = 2048;
// Modo de teste: cada piloto que entra com {teste: true} ganha um mundo só dele
// (World com teste: true: partida sem relógio e pedidos de ouro/XP), para testar a
// progressão da nave sem mexer na partida dos outros. Limite de mundos de teste ao
// mesmo tempo, porque cada um roda a simulação inteira (monstros, mineradores...).
const MAX_MUNDOS_TESTE = 4;
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
  // Mundos rodando: o da partida de verdade e os de teste. Cada um com os sockets
  // dos seus jogadores (os ids de jogador são por mundo).
  const mundos = new Map([[world, new Map()]]); // World -> (id do jogador -> ws)

  wss.on('connection', (ws) => {
    let jogador = null;
    let mundo = world;
    ws.on('message', (bruto) => {
      let msg;
      try {
        msg = JSON.parse(bruto);
      } catch {
        return;
      }
      if (msg?.t === 'entrar' && !jogador) {
        // Raça sem naves (Mechan, "em breve") ou que não existe: recusa com código.
        const recusa = motivoRacaRecusada(msg.race);
        if (recusa) {
          ws.send(JSON.stringify({ t: 'erro', codigo: recusa }));
          ws.close();
          return;
        }
        if (msg.teste === true) {
          const testes = [...mundos.keys()].filter((m) => m.teste).length;
          if (testes >= MAX_MUNDOS_TESTE) {
            ws.send(JSON.stringify({ t: 'erro', codigo: 'teste_cheio' }));
            ws.close();
            return;
          }
          mundo = new World({ teste: true });
          mundos.set(mundo, new Map());
        }
        jogador = mundo.addPlayer(msg.nome, msg.race, msg.classe);
        if (!jogador) {
          // Os dois times cheios: código estável que o cliente traduz na tela de entrada.
          ws.send(JSON.stringify({ t: 'erro', codigo: 'partida_cheia' }));
          ws.close();
          return;
        }
        mundos.get(mundo).set(jogador.id, ws);
        ws.send(JSON.stringify({ t: 'bemvindo', id: jogador.id, tickHz: TICK_HZ, time: jogador.time, teste: mundo.teste }));
      } else if (msg?.t === 'in' && jogador) {
        mundo.pushInput(jogador.id, msg);
      } else if (PEDIDOS.has(msg?.t) && jogador) {
        // Loja e Evolução: o servidor valida tudo e responde só a quem pediu.
        ws.send(JSON.stringify(mundo.pedido(jogador.id, msg)));
      } else if (msg?.t === 'ia' && jogador) {
        // Computador no seu time ou no outro (ou tirar um): o servidor decide e responde.
        ws.send(JSON.stringify(mundo.pedidoIa(jogador.id, msg)));
      } else if (msg?.t === 'teste' && jogador) {
        // Modo de teste (ouro, XP, nível): só o mundo de teste aceita.
        ws.send(JSON.stringify(mundo.pedidoTeste(jogador.id, msg)));
      } else if (msg?.t === 'ping') {
        ws.send(JSON.stringify({ t: 'pong', c: msg.c }));
      }
    });
    ws.on('close', () => {
      if (!jogador) return;
      mundos.get(mundo)?.delete(jogador.id);
      mundo.removePlayer(jogador.id);
      if (mundo.teste) mundos.delete(mundo); // o mundo de teste era só dele
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
      for (const [w, sockets] of mundos) {
        w.step();
        if (!w.ehTickDeSnapshot()) continue;
        const ents = w.entidades();
        const ev = w.tirarEventos();
        for (const [id, ws] of sockets) {
          const j = w.players.get(id);
          if (j && ws.readyState === ws.OPEN) ws.send(JSON.stringify(w.snapshotPara(j, ents, ev)));
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
