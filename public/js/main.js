// Laço principal do cliente: tela de entrada, predição da própria nave,
// interpolação das outras, câmera de perseguição e desenho.
//
// Como a rede funciona do lado do cliente:
// - A cada passo fixo (DT = 1/30 s) lemos os controles, mandamos o comando numerado
//   (seq) ao servidor e já aplicamos o mesmo comando na nossa cópia local da nave
//   (predição): a nave responde sem esperar a rede.
// - Quando chega um snapshot, voltamos para o estado que o servidor mandou (me) e
//   reaplicamos os comandos com seq > ack. Se a predição tinha errado um pouco, a
//   diferença vira um "erro visual" que some em poucos quadros, sem tranco.
// - As outras naves são desenhadas INTERP_MS no passado, interpolando entre dois
//   snapshots, para o movimento sair liso mesmo com a rede irregular.
//
// Duas armas (encaixes Z e X): o menu (armas.js) guarda a escolha, que vai nos
// campos a e a2 de cada comando. Projétil comum é previsto aqui (tiro local); o
// míssil teleguiado não, porque quem faz a curva é o servidor: ele aparece pelo
// evento 'tiro' (o seu também) e é corrigido pela lista `guiados` do snapshot. A
// onda de choque própria já desenha o anel na hora; a mina aparece pela lista
// `minas` do snapshot. A recarga de troca de arma roda no stepShip (predição); depois
// de cada passo o menu recebe a nave prevista (menuArmas.nave) para travar o
// encaixe enquanto conta e mostrar a arma que a nave tem de fato.
//
// Loja e Evolução (servicos.js): pousado e parado na plataforma da própria base, o
// painel abre sozinho; os pedidos vão direto pela rede e a resposta chega como
// {t:'resultado'}. Com o painel aberto, como com o menu de armas, não sai tiro.
//
// Recall (B, shared/recall.js): o pedido vai no campo r do comando e só o servidor
// decide; o cliente não prevê a canalização. Na chegada a nave salta para a base:
// a reconciliação vê o salto (mais de SALTO_M), descarta a suavização e a câmera
// vai junto num quadro, sem atravessar o mapa (o renascimento usa o mesmo caminho).
// A barra do HUD corre com RECALL_S entre um snapshot e outro.
//
// ESC sai da partida e volta para a tela de entrada (nome e raça como estavam),
// para trocar de piloto sem recarregar a página. Sair desmonta tudo o que a
// partida criou (conexão, laço de quadros, listeners, cena na GPU); só o renderer
// WebGL fica, porque é reaproveitado na próxima entrada.

import * as THREE from 'three';
import { DT, RACES, WEAPONS, VEL_TOQUE, createBullet, stepShip, bulletHits, forward, pousoPermitido } from '/shared/sim.js';
import { areaPouso } from '/shared/terrain.js';
import { alturaSolida } from '/shared/obstaculos.js';
import { criarCena, liberarCena } from './cena.js';
import { criarNave, criarDrone, criarVorax, animarVorax, criarKrakor, animarKrakor, criarGuardiao, animarGuardiao, criarMinerador, animarMinerador, atualizarMotor } from './nave.js';
import { Efeitos, COR_TIME } from './efeitos.js';
import { Controles } from './controles.js';
import { Hud, NOME_BONUS } from './hud.js';
import { ObjetivosNaTela } from './objetivos.js';
import { Rede } from './rede.js';
import { MenuArmas } from './armas.js';
import { Placar } from './placar.js';
import { PainelServicos } from './servicos.js';
import { MELHORIAS_MINERADOR } from '/shared/evolucao.js';
import { RECALL_S } from '/shared/recall.js';

const INTERP_MS = 120;
// Diferença entre a predição e o servidor acima disso é salto (recall, renascimento),
// não erro de predição: vai direto, sem suavizar, e a câmera acompanha na hora.
const SALTO_M = 30;
// Por que a volta à base foi cancelada ou recusada (motivo do evento 'recall').
const MOTIVO_RECALL = {
  cancelado: {
    dano: 'você levou dano',
    tiro: 'você apertou o gatilho',
    boost: 'você deu boost',
    velocidade: 'a nave passou de quase parada',
  },
  recusado: {
    na_base: 'Você já está na base',
    tiro: 'Solte o gatilho para voltar à base',
    boost: 'Solte o boost para voltar à base',
    velocidade: 'Freie antes: a volta à base pede a nave quase parada',
  },
};
// Modelo de cada tipo de inimigo (o tipo vem do servidor em cada entidade).
const MODELO_INIMIGO = { vorax: criarVorax, krakor: criarKrakor, guardiao: criarGuardiao };
// O que o bônus de cada objetivo faz, para a notícia de quem tomou.
const EFEITO_BONUS = {
  mineracao: 'cada minerador traz +1 de minério',
  velocidade: 'mineradores mais rápidos',
  durabilidade: 'mineradores mais resistentes',
  furia: 'naves do time com +20% de dano',
};
const CAMERAS = [
  { dist: 22, alt: 8, olhar: 14 },
  { dist: 34, alt: 13, olhar: 18 },
  { dist: 14, alt: 5, olhar: 12 },
];

// ---------- Tela de entrada ----------

let racaEscolhida = 'shrewdo';
let jogoAtual = null; // { sair } da partida em andamento; null na tela de entrada

function montarEntrada() {
  const lista = document.querySelector('#racas');
  const max = { velocidade: 120, hp: 300, energia: 80 };
  for (const [id, r] of Object.entries(RACES)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'raca';
    b.dataset.race = id;
    b.style.setProperty('--cor', '#' + new THREE.Color(r.cor).getHexString());
    b.innerHTML = `<strong>${r.nome}</strong><small>${r.bioma}</small>
      ${['velocidade', 'hp', 'energia']
        .map((k) => `<span class="stat"><em>${k === 'hp' ? 'HP' : k[0].toUpperCase() + k.slice(1)}</em><b style="width:${(r[k] / max[k]) * 100}%"></b><i>${r[k]}</i></span>`)
        .join('')}`;
    b.addEventListener('click', () => escolher(id));
    lista.append(b);
  }
  const escolher = (id) => {
    racaEscolhida = id;
    for (const el of lista.children) el.classList.toggle('sel', el.dataset.race === id);
  };
  escolher(racaEscolhida);
  const nome = document.querySelector('#nome');
  nome.value = localStorage.getItem('astron.nome') ?? '';
  document.querySelector('#form-entrada').addEventListener('submit', async (e) => {
    e.preventDefault();
    const botao = e.submitter;
    botao.disabled = true;
    botao.textContent = 'Conectando…';
    try {
      localStorage.setItem('astron.nome', nome.value);
    } catch {}
    const erro = document.querySelector('#erro-entrada');
    erro.textContent = '';
    try {
      jogoAtual = await iniciar(nome.value, racaEscolhida);
      document.querySelector('#entrada').hidden = true;
      // Quem decola com Enter no campo de nome deixaria o foco no <input>, e os
      // controles ignoram teclas digitadas em campo de texto.
      document.activeElement?.blur();
    } catch (err) {
      console.error('Falha ao entrar no jogo:', err);
      botao.disabled = false;
      botao.textContent = 'Decolar';
      erro.textContent = MENSAGENS_ERRO[err?.message] ?? `Erro ao iniciar o jogo (${err?.message ?? err}). Mande um print desta tela.`;
    }
  });

  // Fase de captura na janela: este handler roda antes de qualquer outro keydown,
  // então decide sozinho o que o ESC faz. Com o menu de armas (#menu-armas, o mesmo
  // elemento para o Z e o X) aberto, ESC só fecha o menu; com o painel da Loja ou
  // da Evolução (#servico) aberto, só fecha o painel; senão sai da partida. Na tela
  // de entrada (ou enquanto conecta) não há partida e o ESC não faz nada.
  addEventListener(
    'keydown',
    (e) => {
      if (e.code !== 'Escape' || e.repeat || !jogoAtual) return;
      const menu = document.querySelector('#menu-armas');
      if (menu && !menu.hidden) {
        menu.hidden = true;
        return;
      }
      if (jogoAtual.fecharPainel()) return;
      voltarParaEntrada();
    },
    { capture: true },
  );
}

/** Sai da partida e mostra a tela de entrada com o nome e a raça de antes. */
function voltarParaEntrada() {
  // A tela de entrada volta mesmo se o desmonte falhar: preso numa tela vazia, o
  // jogador não teria como continuar sem recarregar a página.
  try {
    jogoAtual?.sair();
  } catch (err) {
    console.error('Falha ao desmontar a partida:', err);
  }
  jogoAtual = null;
  const botao = document.querySelector('#form-entrada .decolar');
  botao.disabled = false;
  botao.textContent = 'Decolar';
  document.querySelector('#erro-entrada').textContent = '';
  document.querySelector('#entrada').hidden = false;
  document.querySelector('#nome').focus();
}

// Cada falha na entrada tem uma mensagem própria: "não conectou" para tudo
// escondia a causa (WebGL desligado no navegador parecia problema de servidor).
const MENSAGENS_ERRO = {
  sem_webgl:
    'Seu navegador está sem gráficos 3D (WebGL). Ative a "aceleração de hardware" nas configurações do navegador, reinicie-o e tente de novo.',
  sem_conexao: 'Não deu para conectar ao servidor do jogo. Confira sua internet e tente de novo.',
  tempo_esgotado: 'O servidor demorou demais para responder. Tente de novo em instantes.',
  conexao_fechada: 'O servidor fechou a conexão antes de você entrar. Tente de novo.',
  partida_cheia: 'A partida está cheia (3 contra 3). Tente de novo em instantes.',
};

let rendererUnico = null;

/** Cria o renderer uma vez só (reaproveitado se a entrada falhar e tentar de novo). */
function criarRenderer() {
  if (rendererUnico) return rendererUnico;
  try {
    rendererUnico = new THREE.WebGLRenderer({ antialias: true });
  } catch {
    throw new Error('sem_webgl');
  }
  return rendererUnico;
}

// ---------- Jogo ----------

/**
 * Entra no jogo: confere o WebGL ANTES de conectar (sem 3D não adianta entrar e
 * deixar uma nave fantasma no servidor), conecta e monta a cena. Se montar falhar
 * depois de conectado, fecha a conexão para a nave não ficar parada no mundo.
 * Devolve { sair } para desmontar a partida.
 */
async function iniciar(nome, race) {
  const renderer = criarRenderer();
  const rede = new Rede();
  const boas = await rede.entrar(nome, race);
  try {
    return montarJogo(rede, boas, renderer, race);
  } catch (err) {
    rede.fechar();
    throw err;
  }
}

function montarJogo(rede, boas, renderer, race) {
  const meuId = boas.id;
  // Time de quem joga: decide as cores relativas (seu time turquesa, o outro vermelho).
  const meuTime = boas.time ?? 0;

  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  document.querySelector('#jogo').append(renderer.domElement);

  const camera = new THREE.PerspectiveCamera(65, 1, 0.5, 5000);
  const { scene, atualizar: atualizarCena, definirObjetivo } = criarCena({ meuTime });
  const efeitos = new Efeitos(scene);
  const controles = new Controles(document.body);
  const hud = new Hud({ meuTime });
  const placar = new Placar({ meuTime });
  const menuArmas = new MenuArmas({
    aoTrocar: (encaixe, i, kind) => hud.noticia(`Arma do ${encaixe ? 'X' : 'Z'}: ${WEAPONS[kind].nome}`, 'bom'),
    aoRecusar: (texto) => hud.noticia(texto, 'ruim'),
    signal: controles.parar.signal, // desliga junto com os controles ao sair
  });
  const painel = new PainelServicos({
    enviar: (m) => rede.enviar(m),
    noticia: (texto, tipo) => hud.noticia(texto, tipo),
    signal: controles.parar.signal,
  });
  document.querySelector('#hud').hidden = false;
  const objetivos = new ObjetivosNaTela({ definirObjetivo, meuTime, container: document.querySelector('#rotulos-obj') });

  function redimensionar() {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', redimensionar);
  redimensionar();

  // Estado da própria nave.
  let pred = null; // nave prevista (formato de shared/sim.js)
  let ant = null; // pose no passo anterior, para interpolar entre passos
  let vivo = false;
  let seq = 0;
  let pendentes = [];
  const erro = new THREE.Vector3();
  let extra = { ouro: 0, abates: 0, mortes: 0, nivel: 1, xp: 0, xpProx: 0 };
  let ganhoOuro = 0; // ouro ganho no último snapshot (para a notícia de abate)
  let bonusAtivos = {}; // bônus por time do último snapshot (aura da fúria nas naves)
  const minhaNave = criarNave(race, { aliado: true });
  scene.add(minhaNave);

  // Outras naves.
  const snaps = [];
  const outras = new Map(); // id -> { obj, drone, nome, race }
  const nomes = new Map();

  let camModo = 0;
  let camYaw = 0;
  let tempo = 0;
  let renasceAte = 0; // performance.now() em que a nave renasce (do renasceEm do servidor)
  let localSeq = 0;
  let saltoCamera = false; // a nave saltou (recall, renascimento): câmera vai junto
  let recallLocal = null; // { frac, t }: progresso da própria volta à base no último snapshot

  const pose = (s) => ({ x: s.x, y: s.y, z: s.z, yaw: s.yaw, roll: s.roll });

  function passo() {
    if (!vivo || !pred) return;
    const inp = controles.ler();
    // As armas dos dois encaixes vão em todo comando; com o menu ou o painel da
    // Loja/Evolução aberto não sai tiro.
    [inp.a, inp.a2] = menuArmas.encaixes;
    if (menuArmas.aberto || painel.aberto) inp.f1 = inp.f2 = false;
    seq++;
    rede.enviar({ t: 'in', s: seq, ...inp });
    ant = pose(pred);
    const apertouPouso = inp.p && !pred.pAnt;
    if (apertouPouso && !pred.pousado && !pousoPermitido(pred)) {
      hud.noticia(
        areaPouso(pred.x, pred.z) ? 'Esta plataforma é do outro time' : 'Só dá para pousar na sua base e nos objetivos A',
        'ruim',
      );
    }
    for (const { kind, off, ang } of stepShip(pred, inp)) {
      const w = WEAPONS[kind];
      if (w.tipo === 'choque') efeitos.anelArea(pred.x, pred.y, pred.z, w.area, COR_TIME.meu);
      else if (!w.tipo && !w.guiado) efeitos.tiro(createBullet(pred, kind, 'l' + localSeq++, meuId, off, ang));
    }
    // Recarga de troca e a arma que a nave tem de fato (troca recusada volta no menu).
    menuArmas.nave(pred);
    pendentes.push({ seq, inp });
    if (pendentes.length > 120) pendentes.shift();
  }

  function aoSnapshot(m) {
    const ouroAntes = extra.ouro;
    extra = { ouro: m.ouro, abates: m.abates, mortes: m.mortes, nivel: m.nivel, xp: m.xp, xpProx: m.xpProx };
    ganhoOuro = m.ouro - ouroAntes;
    snaps.push({ t: performance.now(), ents: m.ents });
    while (snaps.length > 30) snaps.shift();
    for (const e of m.ents) nomes.set(e.id, e.nome);
    const euNoSnap = m.ents.find((e) => e.id === meuId);
    recallLocal = euNoSnap?.recall !== undefined ? { frac: euNoSnap.recall, t: performance.now() } : null;
    placar.atualizar(m.partida, m.bonus);
    bonusAtivos = m.bonus ?? {};
    // Antes da predição: a torre B caída já sai da física daqui em diante.
    for (const t of objetivos.atualizar(m.obj)) {
      efeitos.explosao(t.x, t.y, t.z, 6, '#ff9a3a');
      efeitos.explosao(t.x, t.y + 12, t.z, 3, '#ffb627');
    }
    tratarEventos(m.ev);
    efeitos.corrigirGuiados(m.guiados);
    efeitos.atualizarMinas(m.minas, meuTime);
    menuArmas.definirPosse(m.me?.armas);
    menuArmas.definirNiveis(m.me?.niveisArmas);
    painel.atualizar({ ouro: m.ouro, nivel: m.nivel, me: m.me, melhorias: m.melhorias });

    if (!m.vivo) {
      // O tempo de renascer é do servidor (cresce com o nível e com a partida).
      renasceAte = performance.now() + (m.renasceEm ?? 0) * 1000;
      vivo = false;
      pendentes = [];
      pred = m.me;
      return;
    }
    if (!vivo) {
      // Nasceu ou renasceu: começa do estado do servidor, sem suavização.
      vivo = true;
      pred = structuredClone(m.me);
      ant = pose(pred);
      pendentes = pendentes.filter((p) => p.seq > m.ack);
      erro.set(0, 0, 0);
      camYaw = pred.yaw;
      saltoCamera = true;
      hud.mostrarAviso('');
      return;
    }
    const antes = pose(pred);
    pred = structuredClone(m.me);
    pendentes = pendentes.filter((p) => p.seq > m.ack);
    for (const p of pendentes) stepShip(pred, p.inp);
    const dx = antes.x - pred.x;
    const dy = antes.y - pred.y;
    const dz = antes.z - pred.z;
    if (Math.hypot(dx, dy, dz) > SALTO_M) {
      // Salto (recall): começa do lugar novo, sem arrastar a nave pelo caminho.
      erro.set(0, 0, 0);
      ant = pose(pred);
      camYaw = pred.yaw;
      saltoCamera = true;
      return;
    }
    erro.add(new THREE.Vector3(dx, dy, dz));
    ant.x -= dx;
    ant.y -= dy;
    ant.z -= dz;
  }

  /** Volta à base (evento 'recall'): avisos para quem pediu, feixe de luz para todos. */
  function eventoRecall(e) {
    if (e.estado === 'chegou') {
      const time = e.id === meuId ? meuTime : snaps.at(-1)?.ents.find((x) => x.id === e.id)?.time;
      const cor = time === meuTime ? COR_TIME.meu : COR_TIME.outro;
      if (e.de) efeitos.feixeRecall(e.de.x, e.de.y, e.de.z, cor);
      efeitos.feixeRecall(e.x, e.y, e.z, cor);
    }
    if (e.id !== meuId) return;
    if (e.estado === 'inicio') hud.noticia(`Voltando à base em ${e.s} s · sem tiro, sem boost, quase parado`, 'bom');
    else if (e.estado === 'chegou') hud.noticia('De volta à base', 'bom');
    else if (e.estado === 'cancelado') {
      recallLocal = null;
      const porque = MOTIVO_RECALL.cancelado[e.motivo];
      hud.noticia(porque ? `Volta à base cancelada: ${porque}` : 'Volta à base cancelada', porque ? 'ruim' : '');
    } else if (e.estado === 'recusado') hud.noticia(MOTIVO_RECALL.recusado[e.motivo] ?? 'Não dá para voltar à base agora', 'ruim');
  }

  function tratarEventos(ev) {
    for (const e of ev) {
      if (e.e === 'tiro' && (e.dono !== meuId || WEAPONS[e.kind]?.guiado)) {
        // O míssil próprio também vem daqui: a curva é do servidor, não da predição.
        const dono = outras.get(e.dono);
        const vida = WEAPONS[e.kind]?.guiado ? WEAPONS[e.kind].vida : 2.5;
        efeitos.tiro({ id: e.id, kind: e.kind, x: e.x, y: e.y, z: e.z, vx: e.vx, vy: e.vy, vz: e.vz, vida }, !!dono?.drone);
      } else if (e.e === 'choque') {
        // A sua já foi desenhada na hora, pela predição.
        if (e.id !== meuId) efeitos.anelArea(e.x, e.y, e.z, e.raio, e.time === meuTime ? COR_TIME.meu : COR_TIME.outro);
      } else if (e.e === 'explosao' && e.arma === 'mina') {
        efeitos.explosao(e.x, e.y + 1.5, e.z, 3, '#ff9a3a');
        efeitos.anelArea(e.x, e.y + 1.5, e.z, e.raio, e.time === meuTime ? COR_TIME.meu : COR_TIME.outro);
      } else if (e.e === 'acerto') {
        efeitos.removerTiro(e.bala);
        efeitos.explosao(e.x, e.y, e.z, 0.7, '#ffd080');
        if (e.alvo === meuId) hud.levarDano();
      } else if (e.e === 'garra') {
        // Golpe de garra de um Vorax: faísca vermelha (cor de perigo) em quem levou.
        efeitos.explosao(e.x, e.y, e.z, 0.8, '#ff4a2a');
        if (e.alvo === meuId && e.dano > 0) hud.levarDano();
      } else if (e.e === 'fim') {
        efeitos.removerTiro(e.bala);
      } else if (e.e === 'morte' && e.tipo === 'minerador') {
        efeitos.explosao(e.x, e.y, e.z, 3, '#ff9a3a');
        const por = nomes.get(e.por) ?? '?';
        if (e.time === meuTime) hud.noticia(`${por} destruiu um minerador do seu time`, 'ruim');
        else if (e.por === meuId) hud.noticia(`Você destruiu um minerador inimigo${ganhoOuro > 0 ? ` · +${ganhoOuro} ouro` : ''}`, 'bom');
        else hud.noticia(`${por} destruiu um minerador inimigo`, 'bom');
      } else if (e.e === 'recall') {
        eventoRecall(e);
      } else if (e.e === 'entrega') {
        placar.entrega(e.time);
      } else if (e.e === 'faseFinal') {
        placar.faseFinal();
        hud.noticia(`Fase final: minério entregue vale ×${e.mult} até o fim`, 'bom');
      } else if (e.e === 'partida' && e.n > 1) {
        hud.noticia('Nova partida: o time que minerar mais vence', 'bom');
      } else if (e.e === 'morte') {
        const tipo = e.tipo ?? outras.get(e.id)?.tipo;
        efeitos.explosao(e.x, e.y, e.z, tipo === 'guardiao' ? 9 : tipo === 'krakor' ? 6 : 4, '#ff9a3a');
        const quem = nomes.get(e.id) ?? '?';
        const matador = e.por === meuId ? 'Você' : (nomes.get(e.por) ?? '?');
        if (e.id === meuId) hud.noticia(`Você foi destruído por ${nomes.get(e.por) ?? '?'}`, 'ruim');
        else if (e.por === meuId && outras.get(e.id)?.drone) {
          hud.noticia(`Você destruiu ${tipo === 'guardiao' ? 'o' : 'um'} ${quem}${ganhoOuro > 0 ? ` · +${ganhoOuro} ouro` : ''}`, 'bom');
        } else if (e.por === meuId) hud.noticia(`Você abateu ${quem}${e.ouro > 0 ? ` · +${e.ouro} ouro` : ''}`, 'bom');
        else if (!outras.get(e.id)?.drone) hud.noticia(`${matador} abateu ${quem}`, e.time === meuTime ? 'ruim' : '');
        // Combate entre jogadores: sequência encerrada, assistência e sequência nova.
        if (e.encerrou > 0) {
          const de = e.id === meuId ? 'a sua sequência' : `a sequência de ${quem}`;
          hud.noticia(`${matador} encerrou ${de} (${e.seq} abates, +${e.encerrou} ouro)`, e.por === meuId ? 'bom' : '');
        }
        if (e.assist?.includes(meuId)) hud.noticia(`Assistência no abate de ${quem} · +${e.ouroAssist} ouro`, 'bom');
        if (e.seqPor >= 2) hud.noticia(`${matador} está em sequência de ${e.seqPor} abates`, e.por === meuId ? 'bom' : '');
      } else if (e.e === 'nivel') {
        // Subiu de nível: anel de luz na nave de quem subiu (você ou outro).
        const nave = e.id === meuId ? minhaNave : outras.get(e.id)?.obj;
        if (nave?.visible) efeitos.anelNivel(nave);
        if (e.id === meuId) hud.noticia(`Nível ${e.nivel}! HP máximo maior`, 'bom');
      } else if (e.e === 'objetivo') {
        const meu = e.time === meuTime;
        const como = { A: 'pousou no', B: 'derrubou a torre do', C: 'derrotou o guardião do' }[e.tipo];
        const quem = e.quem ? `${e.quem} ${como} objetivo ${e.tipo}` : `Objetivo ${e.tipo} tomado`;
        const ganhos = [e.bonus, e.bonusNaves].filter(Boolean).map((b) => `${NOME_BONUS[b]} (${EFEITO_BONUS[b]})`);
        hud.noticia(`${quem} · ${meu ? 'seu time' : 'inimigo'}: ${ganhos.join(' e ')} por ${e.segundos}s`, meu ? 'bom' : 'ruim');
      } else if (e.e === 'melhoria' && e.time === meuTime) {
        // Melhoria dos mineradores: vale para o time todo, então o time todo fica sabendo.
        const nome = MELHORIAS_MINERADOR[e.melhoria]?.nome ?? e.melhoria;
        hud.noticia(`${e.id === meuId ? 'Você' : e.nome} melhorou os mineradores: ${nome} nível ${e.nivel}`, 'bom');
      } else if (e.e === 'entrou' && e.id !== meuId) {
        hud.noticia(`${e.nome} entrou no setor`);
      } else if (e.e === 'saiu') {
        hud.noticia(`${e.nome} saiu`);
      }
    }
  }

  rede.aoReceber = (m) => {
    if (m.t === 'snap') aoSnapshot(m);
    else if (m.t === 'resultado') painel.resultado(m);
  };
  rede.aoFechar = () => hud.mostrarAviso('Conexão perdida. Aperte Esc ou recarregue a página.');

  const lerp = (a, b, k) => a + (b - a) * k;
  const lerpAng = (a, b, k) => {
    let d = b - a;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return a + d * k;
  };

  /** Pose interpolada das outras naves no instante de desenho (passado). */
  function posesOutras() {
    const t = performance.now() - INTERP_MS;
    if (!snaps.length) return [];
    let a = snaps[0];
    let b = snaps[snaps.length - 1];
    for (let i = snaps.length - 1; i > 0; i--) {
      if (snaps[i - 1].t <= t) {
        a = snaps[i - 1];
        b = snaps[i];
        break;
      }
    }
    const k = b.t > a.t ? Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))) : 1;
    const mapaA = new Map(a.ents.map((e) => [e.id, e]));
    return b.ents.map((eb) => {
      const ea = mapaA.get(eb.id) ?? eb;
      const salto = Math.hypot(eb.x - ea.x, eb.z - ea.z) > 40; // renasceu: sem interpolar
      const kk = salto ? 1 : k;
      return {
        ...eb,
        x: lerp(ea.x, eb.x, kk),
        y: lerp(ea.y, eb.y, kk),
        z: lerp(ea.z, eb.z, kk),
        yaw: lerpAng(ea.yaw, eb.yaw, kk),
        roll: lerp(ea.roll, eb.roll, kk),
      };
    });
  }

  const foco = new THREE.Vector3();
  const desejada = new THREE.Vector3();
  const alvoCam = new THREE.Vector3();
  let acumulado = 0;
  let ultimo = performance.now();

  let ativo = true;
  let idQuadro = 0;

  function quadro(agora) {
    if (!ativo) return;
    const dt = Math.min(0.1, (agora - ultimo) / 1000);
    ultimo = agora;
    tempo += dt;
    acumulado = Math.min(acumulado + dt, 0.25);
    while (acumulado >= DT) {
      acumulado -= DT;
      passo();
    }
    const alfa = acumulado / DT;
    if (controles.trocouCamera()) camModo = (camModo + 1) % CAMERAS.length;

    // Própria nave.
    erro.multiplyScalar(Math.exp(-10 * dt));
    minhaNave.visible = vivo;
    if (pred && ant) {
      const x = lerp(ant.x, pred.x, alfa) + erro.x;
      const y = lerp(ant.y, pred.y, alfa) + erro.y;
      const z = lerp(ant.z, pred.z, alfa) + erro.z;
      // Balanço de flutuação só no ar; no chão a nave fica parada.
      minhaNave.position.set(x, y + (pred.pousado ? 0 : Math.sin(tempo * 2.2) * 0.25), z);
      minhaNave.rotation.y = lerpAng(ant.yaw, pred.yaw, alfa);
      minhaNave.userData.corpo.rotation.z = lerp(ant.roll, pred.roll, alfa);
      atualizarMotor(minhaNave, pred.boost, tempo, pred.pousado);
      const eu = snaps.at(-1)?.ents.find((e) => e.id === meuId);
      const meusEfeitos = { dreno: !!eu?.dreno && vivo, lento: pred.lento > 0 && vivo, emp: pred.emp > 0 && vivo };
      efeitos.estadoNave(minhaNave, { ...meusEfeitos, furia: vivo && !!bonusAtivos[meuTime]?.furia }, dt, tempo);
      hud.efeitosProprios(meusEfeitos);
      // Volta à base: a barra corre entre um snapshot e outro com RECALL_S.
      const fracRecall = vivo && recallLocal ? Math.min(1, recallLocal.frac + (agora - recallLocal.t) / 1000 / RECALL_S) : null;
      efeitos.recall(minhaNave, fracRecall, COR_TIME.meu, dt, tempo, true);
      hud.recall(fracRecall, fracRecall === null ? 0 : (1 - fracRecall) * RECALL_S);
      foco.set(x, y, z);
    }

    // Outras naves.
    const poses = posesOutras();
    const presentes = new Set();
    const rotulos = [];
    for (const e of poses) {
      if (e.id === meuId) continue;
      presentes.add(e.id);
      let o = outras.get(e.id);
      // Aliado: do seu time (jogador ou minerador). Monstro nunca é aliado.
      const aliado = !e.drone && e.time === meuTime;
      if (!o) {
        const obj =
          MODELO_INIMIGO[e.tipo]?.() ??
          (e.tipo === 'minerador' ? criarMinerador({ aliado }) : e.drone ? criarDrone() : criarNave(e.race, { aliado }));
        o = { obj, drone: e.drone, tipo: e.tipo, aliado };
        scene.add(o.obj);
        outras.set(e.id, o);
      }
      o.obj.visible = e.vivo;
      o.pos = o.obj.position;
      if (!e.vivo) continue;
      o.obj.position.set(e.x, e.y + (e.pousado ? 0 : Math.sin(tempo * 2 + e.id) * 0.25), e.z);
      o.obj.rotation.y = e.yaw;
      o.obj.userData.corpo.rotation.z = e.roll;
      if (e.tipo === 'vorax') animarVorax(o.obj, tempo, e.id);
      else if (e.tipo === 'krakor') animarKrakor(o.obj, tempo, e.id);
      else if (e.tipo === 'guardiao') animarGuardiao(o.obj, tempo);
      else if (e.drone) o.obj.userData.corpo.rotation.y = Math.sin(tempo * 3 + e.id) * 0.15;
      if (e.tipo === 'minerador') animarMinerador(o.obj, e, tempo, e.id);
      else atualizarMotor(o.obj, e.boost, tempo, e.pousado);
      const furia = e.tipo === 'jogador' && !!bonusAtivos[e.time]?.furia;
      efeitos.estadoNave(o.obj, { dreno: !!e.dreno, lento: !!e.lento, emp: !!e.emp, furia }, dt, tempo);
      efeitos.recall(o.obj, e.recall ?? null, aliado ? COR_TIME.meu : COR_TIME.outro, dt, tempo);
      rotulos.push({ id: e.id, nome: e.nome, aliado, hp: e.hp, maxHp: e.maxHp, pos: o.obj.position, nivel: e.nivel });
    }
    for (const [id, o] of outras) {
      if (!presentes.has(id)) {
        scene.remove(o.obj);
        outras.delete(id);
      }
    }

    // Tiros: o nosso some ao encostar em alguém na tela (o dano vem do servidor).
    // Aliado não: no servidor o tiro atravessa quem é do mesmo time.
    efeitos.atualizar(dt, (b) => {
      if (b.owner !== meuId) return false;
      for (const o of outras.values()) {
        if (o.obj.visible && !o.aliado && bulletHits(b, { x: o.obj.position.x, y: o.obj.position.y, z: o.obj.position.z })) return true;
      }
      return false;
    });

    // Câmera de perseguição, como no AstroN: atrás e um pouco acima da nave.
    if (pred) {
      const cfg = CAMERAS[camModo];
      if (vivo) camYaw = lerpAng(camYaw, minhaNave.rotation.y, 1 - Math.exp(-5 * dt));
      else camYaw += dt * 0.4; // morto: gira devagar em volta dos destroços
      const f = forward(camYaw);
      desejada.set(foco.x - f.x * cfg.dist, foco.y + cfg.alt, foco.z - f.z * cfg.dist);
      // Não deixa a câmera entrar na parede do cânion nem numa construção: aproxima
      // até ver a nave.
      for (let i = 1; i <= 8; i++) {
        const k = i / 8;
        const px = lerp(foco.x, desejada.x, k);
        const pz = lerp(foco.z, desejada.z, k);
        const py = lerp(foco.y + 2, desejada.y, k);
        if (alturaSolida(px, pz) + 2 > py) {
          const kk = Math.max(0.25, (i - 1) / 8);
          desejada.set(lerp(foco.x, desejada.x, kk), lerp(foco.y + 2, desejada.y, kk) + 3, lerp(foco.z, desejada.z, kk));
          break;
        }
      }
      // Primeiro quadro, ou a nave saltou (recall, renascimento): a câmera vai direto,
      // em vez de deslizar pelo mapa atravessando rochas.
      if (camera.position.lengthSq() === 0 || saltoCamera) camera.position.copy(desejada);
      saltoCamera = false;
      camera.position.lerp(desejada, 1 - Math.exp(-8 * dt));
      const chao = alturaSolida(camera.position.x, camera.position.z) + 2;
      if (camera.position.y < chao) camera.position.y = chao;
      alvoCam.set(foco.x + f.x * cfg.olhar, foco.y + 2, foco.z + f.z * cfg.olhar);
      camera.lookAt(alvoCam);
      camera.fov = lerp(camera.fov, pred.boost ? 74 : 65, 1 - Math.exp(-4 * dt));
      camera.updateProjectionMatrix();
    }

    atualizarCena(dt, foco);

    if (pred) {
      hud.painel(pred, extra, rede.ping);
      const area = vivo ? areaPouso(pred.x, pred.z) : null;
      // Pousada e parada na Loja ou na Evolução da própria base: o painel abre.
      const parada = vivo && pred.pousado && Math.hypot(pred.vx, pred.vz) < VEL_TOQUE;
      painel.lugar(parada && area?.servico && area.time === meuTime ? area.servico : null);
      // Plataforma do outro time não oferece pouso.
      hud.pouso(vivo && pousoPermitido(pred) ? area : null, vivo && pred.pousado, painel.aberto);
      // Pousada na marcação de um objetivo A: barra do progresso.
      hud.objetivoPouso(area?.objetivo && pred.pousado ? objetivos.estado.get(area.objetivo) : null);
      hud.minimapa(vivo ? { x: foco.x, z: foco.z, yaw: minhaNave.rotation.y } : null, snaps.at(-1)?.ents ?? [], meuId, [
        ...objetivos.estado.values(),
      ]);
    }
    if (!vivo && renasceAte) {
      const falta = Math.max(0, (renasceAte - performance.now()) / 1000);
      hud.mostrarAviso(`Nave destruída · renascendo na base em ${Math.ceil(falta - 1e-3)}s`);
    }
    hud.rotulosNaves(rotulos, camera, innerWidth, innerHeight);
    objetivos.desenhar(camera, innerWidth, innerHeight);
    renderer.render(scene, camera);
    idQuadro = requestAnimationFrame(quadro);
  }
  idQuadro = requestAnimationFrame(quadro);

  // Para depuração no console e para os testes de navegador.
  window.__astron = {
    get pred() {
      return pred;
    },
    get vivo() {
      return vivo;
    },
    get ents() {
      return snaps.at(-1)?.ents ?? [];
    },
    meuTime,
    scene,
    camera,
    menuArmas,
    painel,
    objetivos,
    efeitos,
    minhaNave,
  };

  /**
   * Desmonta a partida: fecha a conexão (o servidor tira a nave do mundo no
   * 'close'), para o laço de quadros, desliga os listeners e libera a cena da GPU.
   * O canvas sai de #jogo e volta na próxima entrada, então nunca há dois.
   */
  function sair() {
    if (!ativo) return;
    ativo = false;
    cancelAnimationFrame(idQuadro);
    rede.fechar();
    controles.destruir();
    menuArmas.el.hidden = true;
    painel.lugar(null);
    removeEventListener('resize', redimensionar);
    hud.limpar();
    placar.limpar();
    objetivos.limpar();
    renderer.domElement.remove();
    efeitos.liberar();
    liberarCena(scene);
    renderer.renderLists.dispose();
    if (window.__astron?.scene === scene) window.__astron = null;
  }

  /** ESC com o painel da Loja/Evolução aberto: fecha só ele. Devolve se fechou. */
  function fecharPainel() {
    if (!painel.aberto) return false;
    painel.fechar();
    return true;
  }

  return { sair, fecharPainel };
}

montarEntrada();
