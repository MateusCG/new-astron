// Uma partida numa worker thread (server/mundos.js, MundoEmWorker): o World, o laço
// de 30 Hz dele e os snapshots já em texto, longe da linha do processo principal,
// que só repassa o texto ao socket de cada jogador.
//
// Mensagens do processo principal: {t:'entrar', req, nome, race, classe, pedido},
// {t:'in', id, msg}, {t:'pedido', id, msg}, {t:'sair', id, substituir} e
// {t:'bot', time}. Para ele: {t:'entrou', req, id, time} ou {t:'recusado', req,
// codigo}, {t:'msgs', lista: [[id, texto], ...]} (snapshots e respostas) e, a cada
// segundo, {t:'carga', v, mb} (a fração de um núcleo que a partida ocupou e a
// memória do worker).

import { parentPort, workerData } from 'node:worker_threads';
import { World } from './game.js';
import { prepararBots } from './bots.js';
import { prepararJungle } from './jungle.js';
import { MundoLocal, iniciarLaco } from './mundos.js';

// Cada worker tem a própria memória: as grades de navegação são montadas aqui, antes
// do primeiro passo (as mensagens que chegam enquanto isso esperam na fila).
prepararBots();
prepararJungle();

const mundo = new MundoLocal(new World({ teste: !!workerData.teste }), { modo: workerData.modo });
mundo.aoMensagens = (lista) => parentPort.postMessage({ t: 'msgs', lista });

parentPort.on('message', async (m) => {
  if (m.t === 'in') mundo.comando(m.id, m.msg);
  else if (m.t === 'pedido') mundo.pedido(m.id, m.msg);
  else if (m.t === 'entrar') {
    const r = await mundo.entrar(m);
    parentPort.postMessage(r.codigo ? { t: 'recusado', req: m.req, codigo: r.codigo } : { t: 'entrou', req: m.req, id: r.id, time: r.time });
  } else if (m.t === 'sair') mundo.sair(m.id, { substituir: m.substituir });
  else if (m.t === 'bot') mundo.vagaParaBot(m.time);
});

iniciarLaco(() => mundo.passo());
setInterval(() => {
  const { heapUsed, external } = process.memoryUsage();
  parentPort.postMessage({ t: 'carga', v: mundo.carga, mb: (heapUsed + external) / 2 ** 20 });
}, 1000);
