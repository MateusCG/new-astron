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
// Duas armas (encaixes Z e X), do catálogo do Astro-N original da raça e classe:
// o menu (armas.js) guarda a escolha, que vai nos campos a e a2 de cada comando. O
// projétil reto é previsto aqui (tiro local, golpePrevisivel); o resto (teleguiado,
// o que se divide, nova, mina, campo, dispositivo) vem do servidor pelos eventos
// ('tiro', 'nova', 'efeito', 'explosao'), o seu também, e o teleguiado é corrigido
// pela lista `guiados` do snapshot. Minas e campos vêm da lista `minas`. A recarga de
// troca de arma roda no stepShip (predição); depois de cada passo o menu recebe a
// nave prevista (menuArmas.nave) para travar o encaixe enquanto conta e mostrar a
// arma que a nave tem de fato. As armas penduram nas asas (nave.js, definirArmas): a
// sua pela nave prevista, as dos outros pelo `arm` de cada jogador no snapshot; o
// clarão e o desenho do tiro saem da boca delas.
//
// Som (sons.js): o contexto de áudio nasce no primeiro gesto (clique ou tecla). Cada
// disparo toca o som da arma do original na posição dele (o seu na hora, pela
// predição; o dos outros pelo evento), cada acerto e explosão o som de impacto da
// arma, morte a explosão, e subir de nível, a Loja e os itens os sons de interface.
// O ouvinte é a sua nave. M liga e desliga o som (fica salvo), com o aviso no HUD.
// O botão de som (tela inicial e HUD) abre a janela de volume (volume.js), com uma
// barra para a música e outra para os efeitos; aberta, não sai tiro.
//
// Times: quantos computadores no seu time e no inimigo se escolhe na tela inicial
// (escolha-times.js), e vai no {t:'entrar'} (iaMeu, iaInimigo). Na partida, a janela
// Times (times.js, tecla P ou o botão do HUD) é só consulta: as vagas dos dois times
// pela lista `jogadores` do snapshot.
//
// Loja e Evolução (servicos.js): pousado e parado na plataforma da própria base, o
// painel abre sozinho; os pedidos vão direto pela rede e a resposta chega como
// {t:'resultado'}. Com o painel aberto, como com o menu de armas, não sai tiro.
//
// STATUS (status.js, tecla C) e INVENTÁRIO (inventario.js, tecla I): janelas laterais
// com a altura toda da tela, uma de cada vez, que leem o `me` do snapshot (pontos,
// inventário por instância, status somado). Os pedidos {t:'pontos'}, {t:'equipar'},
// {t:'vender'} e {t:'evoluirItem'} vão direto pela rede; as armas Z/X do inventário
// mudam os encaixes do menu de armas, como o Q/E. Abertas, a nave atira normal
// (pedido do Mateus: dá para olhar o status ou trocar de arma no meio da luta); os
// botões delas soltam o foco no clique, para o Espaço do tiro não apertá-los.
//
// Recall (B, shared/recall.js): o pedido vai no campo r do comando e só o servidor
// decide; o cliente não prevê a canalização. Na chegada a nave salta para a base:
// a reconciliação vê o salto (mais de SALTO_M), descarta a suavização e a câmera
// vai junto num quadro, sem atravessar o mapa (o renascimento usa o mesmo caminho).
// A barra do HUD corre com RECALL_S entre um snapshot e outro.
//
// Barra do time (companheiros.js): no alto e no centro, um card por piloto do seu
// time (nick e abates de jogador da lista `jogadores`; vida e nave das `ents`, onde o
// seu time sempre vem). Clicar no card de um companheiro de nave Functional abre a
// caixinha do teleporte, que manda {t:'teleportar', alvo}; o servidor salta a nave na
// hora para junto dele e manda o evento 'teleporte', que marca o próximo snapshot
// como salto (saltoForcado): a reconciliação começa do lugar novo, sem suavizar, e a
// câmera vai junto, mesmo que o salto seja curto. ESC fecha a caixinha primeiro.
//
// Torretas do corredor (torretas.js): o snapshot traz o estado delas (`torretas`);
// caída sai da física da predição (definirObstaculoAtivo) e tomba no cenário. Tiro de
// torreta e de escolta vem pelo evento 'tiro' com `fonte` e `time` e sai na cor do
// time de quem atirou.
//
// Tela de carregamento (carregamento.js): depois do Decolar, conecta e, ao mesmo
// tempo, baixa TUDO o que pode aparecer na partida (as naves de todas as raças,
// classes e tiers, as armas na asa de todas, as texturas dos efeitos de todas as
// versões, todos os sons e as miniaturas da Evolução); depois monta a cena e aquece a
// placa de vídeo (shaders, texturas e geometrias) com ela ainda coberta. Só então o
// laço de quadros começa: até lá a nave espera parada na base (zona segura) e nenhum
// comando sai. ESC na tela cancela e volta para a entrada.
//
// Naves (nave.js): cada jogador traz raça, classe e tier no snapshot, e definirNave
// troca o modelo quando o tier muda (Evolução), para você e para os outros; o modelo
// de qualquer piloto que aparecer já veio na tela de carregamento.
//
// Mapa, monstros e objetivos (cena.js, monstros.js, objetivos.js): o cenário são os
// modelos do lago de He-3, já no cache quando a cena é montada (tela de
// carregamento); os monstros da jungle chegam como entidades { tipo: 'monstro', esp }
// e são desenhados com os modelos do original; o Núcleo de He-3 é o modelo do
// cenário e a entidade dele só leva o rótulo com a vida. O `obj` do snapshot
// ({ id: estado }) acende, apaga e derruba as peças dos objetivos e escreve os
// rótulos; o pulso do Núcleo, a chama e os tiros de cada ataque de monstro (`atq`)
// saem pelos eventos. Os bônus de nave (`bn` de cada jogador e o `me.bonusNave`) e o
// da Medusa (do time) viram anéis em volta das naves e ícones no HUD.
//
// Névoa de guerra (nevoa.js): o servidor só manda o que o seu time enxerga; o
// cliente faz a mesma conta (shared/visao.js) com a sua nave, os aliados, as torres
// de pé e a base, e desenha o que está fora da visão escurecido e sem cor (passo de
// tela inteira: nevoa.desenhar no lugar de renderer.render) e escuro no minimapa.
// Quem some da visão some do snapshot (e da tela); ao voltar é criado de novo, sem
// interpolar do ponto antigo. Morte de jogador fora da visão vem sem lugar: só a
// notícia, sem explosão. Os nomes vêm da lista `jogadores` (o placar de abates é público).
//
// ESC sai da partida e volta para a tela de entrada (nome, raça e classe como estavam),
// para trocar de piloto sem recarregar a página. Sair desmonta tudo o que a
// partida criou (conexão, laço de quadros, listeners, cena na GPU); só o renderer
// WebGL fica, porque é reaproveitado na próxima entrada.

import * as THREE from 'three';
import { DT, RACES, WEAPONS, VEL_TOQUE, HOVER, createBullet, stepShip, bulletHits, forward, pousoPermitido } from '/shared/sim.js';
import { golpeDaArma, golpePrevisivel, versaoArma } from '/shared/armas.js';
import { CLASSES, ORDEM_CLASSES, RACAS_BLOQUEADAS, naveDe, linhaDe, classeValida, racaJogavel } from '/shared/naves.js';
import { areaPouso, heightAt } from '/shared/terrain.js';
import { alturaSolida } from '/shared/obstaculos.js';
import { criarCena, liberarCena } from './cena.js';
import { Nevoa } from './nevoa.js';
import {
  criarNave,
  definirNave,
  criarMinerador,
  animarMinerador,
  criarEscolta,
  animarEscolta,
  atualizarMotor,
  definirArmas,
  bocaDaArma,
} from './nave.js';
import { Sons, SONS_INTERFACE } from './sons.js';
import { PainelVolume } from './volume.js';
import { Efeitos, COR_TIME } from './efeitos.js';
import { Controles } from './controles.js';
import { Hud, BONUS_NAVE } from './hud.js';
import { ObjetivosNaTela, LUGARES_OBJETIVO, NOME_OBJETIVO } from './objetivos.js';
import { criarLimitador } from './quadros.js';
import { criarMonstro, animarMonstro, criarMarcadorNucleo, EXPLOSAO_MONSTRO, ROTULO_MONSTRO } from './monstros.js';
import { TorretasNaTela } from './torretas.js';
import { Rede } from './rede.js';
import { mostrarPrevia, pararPrevia } from './vitrine.js';
import { MenuArmas } from './armas.js';
import { Placar, relogio } from './placar.js';
import { PainelTeste } from './teste.js';
import { PainelTimes } from './times.js';
import { BarraTime } from './companheiros.js';
import { EscolhaTimes } from './escolha-times.js';
import { PainelServicos } from './servicos.js';
import { PainelStatus } from './status.js';
import { PainelInventario } from './inventario.js';
import { TelaCarregamento, Carregamento, aquecerGpu } from './carregamento.js';
import { MELHORIAS_MINERADOR, MELHORIA_TORRETAS } from '/shared/evolucao.js';
import { RECALL_S } from '/shared/recall.js';
import { TORRETAS } from '/shared/terrain.js';

const INTERP_MS = 120;
// Quanto a cena sobe em tela baixa (redimensionar): SUBIR_CENA_PX − FRAC × altura.
const SUBIR_CENA_PX = 205;
const SUBIR_CENA_FRAC = 0.21;
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
    teleporte: 'você se teleportou',
  },
  recusado: {
    na_base: 'Você já está na base',
    tiro: 'Solte o gatilho para voltar à base',
    boost: 'Solte o boost para voltar à base',
    velocidade: 'Freie antes: a volta à base pede a nave quase parada',
  },
};
// O que cada objetivo dá a quem o toma, para a notícia (números de server/bonus.js e server/objetivos.js).
const GANHO_OBJETIVO = {
  ataque: ['derrotou o SN-4', 'bônus de ataque (+20% de dano)'],
  suporte: ['derrubou a torre de suporte', 'bônus de suporte (vida e energia)'],
  sonda: ['destruiu a sonda errante', 'bônus de velocidade (+25%)'],
  medusa: ['derrotou a Medusa Anciã', 'o time ganha +15% de dano e de velocidade'],
  nucleo: ['tomou o Núcleo de He-3', 'onda de mineradores do Núcleo'],
};
// Mais que isto para dentro da planta, a câmera estaria dentro da casca do modelo de
// rocha (que fica até 4 m para fora da planta): a câmera confere uma volta deste raio.
const CAMERA_FOLGA_ROCHA = 5;
const CAMERAS = [
  { dist: 22, alt: 8, olhar: 14 },
  { dist: 34, alt: 13, olhar: 18 },
  { dist: 14, alt: 5, olhar: 12 },
];
// Altura da câmera escolhida pelo piloto (T/G, PageUp/PageDown ou a roda do mouse):
// um ângulo somado ao de cada modo do V, de CAM_ANG_MIN (por baixo da nave, olhando
// para cima) a CAM_ANG_MAX (quase de cima). Fica guardado no navegador.
const CAM_ANG_MIN = -0.35; // rad (~20° abaixo da nave)
const CAM_ANG_MAX = 1.25; // rad (~72° acima)
const CHAVE_CAM_ANG = 'astron.camAngulo';
function lerCamAngulo() {
  try {
    const v = Number(localStorage.getItem(CHAVE_CAM_ANG));
    return Number.isFinite(v) ? v : 0;
  } catch {
    return 0;
  }
}

// ---------- Tela de entrada ----------
//
// Dois passos, como no Astro-N: primeiro a raça (Acron, Bellico, Shrewdo; Mechan
// aparece apagada, "EM BREVE"), depois a classe (Assault, Mobile, Functional), cada
// uma com a especialidade e a primeira nave daquela raça e classe (nome, status e a
// prévia 3D girando, que baixa só aquele modelo). A escolha fica no localStorage
// (com try/catch: navegador sem armazenamento entra igual) e, na volta, a tela
// abre direto no passo da classe.

// Som: um só por página (o AudioContext sobrevive à saída e à volta da partida).
const sons = new Sons();
const desbloquearSom = () => sons.desbloquear();
addEventListener('pointerdown', desbloquearSom, { once: true });
addEventListener('keydown', desbloquearSom, { once: true });
sons.carregar(Object.values(SONS_INTERFACE).concat(['h_explo', 'n2_explo', 'cure']));

/** Liga ou desliga o som (M ou o botão da tela inicial) e mostra o estado. */
function alternarSom() {
  sons.desbloquear();
  sons.mudo = !sons.mudo;
  mostrarEstadoSom();
}
function mostrarEstadoSom() {
  for (const el of document.querySelectorAll('.estado-som')) el.textContent = sons.mudo ? 'Som desligado' : 'Som ligado';
  for (const el of document.querySelectorAll('.estado-som, .botao-volume')) el.classList.toggle('mudo', sons.mudo);
}
const painelVolume = new PainelVolume({ sons, aoMudarSom: mostrarEstadoSom });
addEventListener('keydown', (e) => {
  // Só o campo de nome engole o M; na barra de volume ele continua valendo.
  if (e.code !== 'KeyM' || e.repeat || (e.target instanceof HTMLInputElement && e.target.type === 'text')) return;
  alternarSom();
});

let racaEscolhida = 'acron';
let classeEscolhida = 'assault';
let jogoAtual = null; // { sair } da partida em andamento; null na tela de entrada
let cargaAtual = null; // o Carregamento da tela de carregamento aberta (ESC cancela)

const lerLocal = (k) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const gravarLocal = (k, v) => {
  try {
    localStorage.setItem(k, v);
  } catch {}
};
const corCss = (cor) => '#' + new THREE.Color(cor).getHexString();

/** Barras de status da primeira nave de cada classe, na escala da maior da raça. */
function barrasNave(n, max) {
  // Cada status na cor dele no HUD: vida, energia, velocidade (neon) e, nas Bellico,
  // a regeneração de vida em voo (o traço da raça no original).
  const linhas = [
    ['HP', n.hp, max.hp, n.hp, 'hp'],
    ['Energia', n.energia, max.energia, n.energia, 'en'],
    ['Veloc.', n.velocidade, max.velocidade, `${Math.round(n.velocidade)} m/s`, 'vel'],
  ];
  if (n.regenHpVoo > 0) linhas.push(['Regen.', n.regenHpVoo, 3, `${n.regenHpVoo.toLocaleString('pt-BR')}/s`, 'regen']);
  return linhas
    .map(([nome, v, m, txt, k]) => `<span class="stat ${k}"><em>${nome}</em><b style="width:${Math.min(100, (v / m) * 100)}%"></b><i>${txt}</i></span>`)
    .join('');
}

function montarEntrada() {
  const lista = document.querySelector('#racas');
  const classes = document.querySelector('#classes');
  const passoRaca = document.querySelector('#passo-raca');
  const passoClasse = document.querySelector('#passo-classe');
  const decolar = document.querySelector('#form-entrada .decolar');
  const previa = document.querySelector('#previa-nave');
  const salva = lerLocal('astron.raca');
  if (racaJogavel(salva)) racaEscolhida = salva;
  if (classeValida(lerLocal('astron.classe'))) classeEscolhida = lerLocal('astron.classe');

  for (const [id, r] of Object.entries(RACES)) {
    const bloqueada = RACAS_BLOQUEADAS.includes(id);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'raca' + (bloqueada ? ' bloqueada' : '');
    b.dataset.race = id;
    b.disabled = bloqueada;
    b.style.setProperty('--cor', corCss(r.cor));
    b.innerHTML = `<strong>${r.nome}</strong><small>${r.bioma}</small>${
      bloqueada ? '<span class="selo-breve">EM BREVE</span>' : `<span class="resumo">${ORDEM_CLASSES.map((c) => CLASSES[c].nome).join(' · ')}</span>`
    }`;
    if (!bloqueada) {
      b.addEventListener('click', () => {
        escolherRaca(id);
        mostrarPasso('classe');
      });
    }
    lista.append(b);
  }

  const escolherRaca = (id) => {
    racaEscolhida = id;
    gravarLocal('astron.raca', id);
    for (const el of lista.children) el.classList.toggle('sel', el.dataset.race === id);
    passoClasse.style.setProperty('--cor', corCss(RACES[id].cor));
    passoClasse.querySelector('.voltar-raca span').textContent = RACES[id].nome;
    // Cartões das classes: especialidade e a primeira nave da linha.
    const primeiras = ORDEM_CLASSES.map((c) => naveDe(id, c, 0));
    const max = { hp: 0, energia: 0, velocidade: 0 };
    for (const n of primeiras) for (const k of Object.keys(max)) max[k] = Math.max(max[k], n[k]);
    classes.innerHTML = ORDEM_CLASSES.map((c, i) => {
      const n = primeiras[i];
      return `<button type="button" class="classe" data-classe="${c}">
        <strong>${CLASSES[c].nome}</strong><small>${CLASSES[c].especialidade}</small>
        <span class="nave-classe">${n.nome}</span>${barrasNave(n, max)}
      </button>`;
    }).join('');
    escolherClasse(classeEscolhida);
  };
  const escolherClasse = (c) => {
    classeEscolhida = c;
    gravarLocal('astron.classe', c);
    for (const el of classes.children) el.classList.toggle('sel', el.dataset.classe === c);
    const linha = linhaDe(racaEscolhida, c);
    previa.querySelector('.nome-nave').textContent = linha[0].nome;
    previa.querySelector('.linha-nave').textContent = `Na Evolução: ${linha.slice(1).map((n) => `${n.nome} (NV ${n.nivel})`).join(' › ')}`;
    if (!passoClasse.hidden) mostrarPrevia(previa.querySelector('.palco'), racaEscolhida, c, 0);
  };
  classes.addEventListener('click', (e) => {
    const c = e.target.closest('[data-classe]')?.dataset.classe;
    if (c) escolherClasse(c);
  });
  const mostrarPasso = (passo) => {
    passoRaca.hidden = passo !== 'raca';
    passoClasse.hidden = passo !== 'classe';
    decolar.textContent = passo === 'raca' ? 'Escolher a classe ›' : 'Decolar';
    if (passo === 'classe') mostrarPrevia(previa.querySelector('.palco'), racaEscolhida, classeEscolhida, 0);
    else pararPrevia();
  };
  passoClasse.querySelector('.voltar-raca').addEventListener('click', () => mostrarPasso('raca'));
  entrada.mostrarPasso = mostrarPasso;
  escolherRaca(racaEscolhida);
  // Quem já escolheu antes cai direto na classe (trocar de raça é um clique).
  mostrarPasso(salva && racaJogavel(salva) ? 'classe' : 'raca');

  const botaoSom = document.querySelector('#botao-som');
  botaoSom?.addEventListener('click', () => painelVolume.abrir());
  document.querySelector('#som-hud')?.addEventListener('click', (e) => {
    painelVolume.alternar();
    e.currentTarget.blur(); // o foco no botão não pode prender as teclas do jogo
  });
  mostrarEstadoSom();

  const escolhaTimes = new EscolhaTimes(document.querySelector('#escolha-times'));

  const nome = document.querySelector('#nome');
  nome.value = lerLocal('astron.nome') ?? '';
  document.querySelector('#form-entrada').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!passoRaca.hidden) {
      escolherRaca(racaEscolhida);
      mostrarPasso('classe');
      return;
    }
    const botao = decolar;
    botao.disabled = true;
    botao.textContent = 'Conectando…';
    gravarLocal('astron.nome', nome.value);
    const erro = document.querySelector('#erro-entrada');
    erro.textContent = '';
    // Quem decola com Enter no campo de nome deixaria o foco no <input>, e os
    // controles ignoram teclas digitadas em campo de texto.
    document.activeElement?.blur();
    // A prévia para: a vitrine desenha as miniaturas da Evolução no carregamento.
    pararPrevia();
    try {
      jogoAtual = await iniciar(nome.value, racaEscolhida, classeEscolhida, document.querySelector('#modo-teste').checked, escolhaTimes.pedido);
      document.querySelector('#entrada').hidden = true;
      telaCarregamento?.esconder();
    } catch (err) {
      telaCarregamento?.esconder();
      botao.disabled = false;
      botao.textContent = 'Decolar';
      entrada.mostrarPasso('classe');
      if (err?.message === 'cancelado') return;
      console.error('Falha ao entrar no jogo:', err);
      erro.textContent = MENSAGENS_ERRO[err?.message] ?? `Erro ao iniciar o jogo (${err?.message ?? err}). Mande um print desta tela.`;
    } finally {
      cargaAtual = null;
    }
  });

  // Fase de captura na janela: este handler roda antes de qualquer outro keydown,
  // então decide sozinho o que o ESC faz. Com a janela de volume aberta (na partida
  // ou na tela de entrada), ESC só fecha ela. Com o menu de armas (#menu-armas, o mesmo
  // elemento para o Z e o X) aberto, ESC só fecha o menu; com o painel da Loja ou
  // da Evolução (#servico) aberto, só fecha o painel; senão sai da partida. Na tela
  // de carregamento, cancela e volta para a entrada; na de entrada, não faz nada.
  addEventListener(
    'keydown',
    (e) => {
      if (e.code !== 'Escape' || e.repeat) return;
      if (painelVolume.aberto) {
        painelVolume.fechar();
        return;
      }
      if (!jogoAtual) {
        cargaAtual?.cancelar();
        return;
      }
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

const entrada = { mostrarPasso: () => {} };

/** Sai da partida e mostra a tela de entrada com o nome, a raça e a classe de antes. */
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
  entrada.mostrarPasso('classe');
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
  teste_cheio: 'Muitos pilotos no modo de teste agora. Tente de novo em instantes ou entre na partida normal.',
  raca_bloqueada: 'Essa raça ainda não está liberada. Escolha Acron, Bellico ou Shrewdo.',
  raca_invalida: 'Raça desconhecida. Escolha Acron, Bellico ou Shrewdo.',
};

let rendererUnico = null;
let telaCarregamento = null; // criada na primeira entrada (o DOM já existe)

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
 * deixar uma nave fantasma no servidor), abre a tela de carregamento, conecta e
 * baixa tudo ao mesmo tempo (carregamento.js), monta a cena, aquece a placa de vídeo
 * e só então começa o laço de quadros. Falhou ou cancelou (ESC) depois de conectado:
 * fecha a conexão para a nave não ficar parada no mundo. Devolve { sair } para
 * desmontar a partida.
 */
async function iniciar(nome, race, classe, teste = false, ia = null) {
  const renderer = criarRenderer();
  telaCarregamento ??= new TelaCarregamento();
  telaCarregamento.mostrar(race, classe);
  const carga = new Carregamento({ race, classe, sons, tela: telaCarregamento });
  cargaAtual = carga;
  const rede = new Rede();
  let jogo = null;
  try {
    const entrou = rede.entrar(nome, race, classe, teste, ia).then((boas) => {
      carga.conectado(boas);
      return boas;
    });
    const [boas] = await carga.esperar(Promise.all([entrou, carga.carregar()]));
    jogo = montarJogo(rede, boas, renderer, race, classe);
    await carga.esperar(jogo.aquecer(carga));
    jogo.comecar();
    const r = carga.resumo();
    console.info(
      `Carregamento: pronto em ${(r.ms / 1000).toFixed(1)} s (arquivos ${((r.msArquivos ?? 0) / 1000).toFixed(1)} s, placa ${((r.msGpu ?? 0) / 1000).toFixed(1)} s):`,
      `${r.mapa} modelos do mapa, ${r.monstros} de monstros, ${r.naves} naves, ${r.armas} armas (${r.modelosArma} modelos), ${r.texturas} texturas, ${r.sons} sons`,
    );
    window.__carregamento = r;
    return jogo;
  } catch (err) {
    if (jogo) jogo.sair();
    else rede.fechar();
    throw err;
  }
}

function montarJogo(rede, boas, renderer, race, classe) {
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
  const { scene, atualizar: atualizarCena, definirObjetivo, definirMineracao, definirBacias, atingirCampo } = criarCena({ meuTime });
  const efeitos = new Efeitos(scene);
  const nevoa = new Nevoa({ renderer, scene, meuTime }); // névoa de guerra (visão do time)
  const controles = new Controles(document.body);
  const hud = new Hud({ meuTime });
  const placar = new Placar({ meuTime });
  // Modo de teste (mundo só seu): painel com ouro e XP à vontade.
  const painelTeste = boas.teste
    ? new PainelTeste({ enviar: (m) => rede.enviar(m), noticia: (texto, tipo) => hud.noticia(texto, tipo), signal: controles.parar.signal })
    : null;
  const menuArmas = new MenuArmas({
    race,
    classe,
    aoTrocar: (encaixe, i, kind) => hud.noticia(`Arma do ${encaixe ? 'X' : 'Z'}: ${WEAPONS[kind].nome}`, 'bom'),
    aoRecusar: (texto) => hud.noticia(texto, 'ruim'),
    signal: controles.parar.signal, // desliga junto com os controles ao sair
  });
  const painel = new PainelServicos({
    meuTime,
    enviar: (m) => rede.enviar(m),
    noticia: (texto, tipo) => hud.noticia(texto, tipo),
    signal: controles.parar.signal,
  });
  // STATUS e INVENTÁRIO: janelas laterais, uma de cada vez (abrir uma fecha a outra).
  const status = new PainelStatus({
    enviar: (m) => rede.enviar(m),
    signal: controles.parar.signal,
    aoAbrir: () => inventario.fechar(),
  });
  const inventario = new PainelInventario({
    enviar: (m) => rede.enviar(m),
    menuArmas,
    noticia: (texto, tipo) => hud.noticia(texto, tipo),
    signal: controles.parar.signal,
    aoAbrir: () => status.fechar(),
  });
  const times = new PainelTimes({ meuId, meuTime, signal: controles.parar.signal }); // só consulta
  // Barra do time no alto (companheiros.js): cards dos aliados e o teleporte até o Functional.
  const barraTime = new BarraTime({
    meuId,
    meuTime,
    enviar: (m) => rede.enviar(m),
    noticia: (texto, tipo) => hud.noticia(texto, tipo),
    signal: controles.parar.signal,
  });
  // Os sons de todas as armas já vieram (decodificados) na tela de carregamento.
  mostrarEstadoSom();

  /** Som de arma (disparo ou impacto) no ponto, com a variação de tom da metralhadora. */
  const somNoMundo = (nome, x, z, volume = 1) => {
    if (!nome) return;
    sons.carregar(nome);
    sons.tocar(nome, { x, z, volume, variacao: 0.04 });
  };
  /** Som de disparo da versão da arma. */
  const somDaArma = (kind, nv = 1, prof = 0) => {
    if (prof > 0) return golpeDaArma(kind, nv, prof)?.som ?? null;
    return versaoArma(kind, nv)?.som ?? WEAPONS[kind]?.som ?? null;
  };
  const somImpacto = (kind, nv = 1, prof = 0) => golpeDaArma(kind, nv, prof)?.somImpacto ?? WEAPONS[kind]?.somImpacto ?? null;
  const boca = new THREE.Vector3();
  document.querySelector('#hud').hidden = false;
  const objetivos = new ObjetivosNaTela({ definirObjetivo, meuTime, container: document.querySelector('#rotulos-obj') });
  const torretas = new TorretasNaTela({ scene, meuTime });

  function redimensionar() {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    // Tela baixa: a cena sobe alguns pixels para a nave e a etiqueta do piloto não
    // ficarem embaixo da dica de pouso, que se apoia no painel inferior (que ocupa
    // uma altura fixa em pixels). De ~900 px de altura para cima não muda nada.
    const subir = Math.max(0, Math.round(SUBIR_CENA_PX - SUBIR_CENA_FRAC * innerHeight));
    if (subir > 0) camera.setViewOffset(innerWidth, innerHeight, 0, subir, innerWidth, innerHeight);
    else camera.clearViewOffset();
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
  let meuNome = ''; // nick que o servidor guardou (vem na sua entidade do snapshot)
  let ganhoOuro = 0; // ouro ganho no último snapshot (para a notícia de abate)
  let bonusAtivos = {}; // bônus por time do último snapshot (o da Medusa: anel nas naves do time)
  let meusBonus = []; // bônus de nave da sua nave (me.bonusNave), para o anel
  let ultimoObj = {}; // obj do último snapshot (minimapa)
  const minhaNave = criarNave(race, { aliado: true, classe, tier: 0 });
  scene.add(minhaNave);

  // Outras naves.
  const snaps = [];
  const outras = new Map(); // id -> { obj, drone, nome, race }
  const nomes = new Map(TORRETAS.map((t) => [t.id, 'Torreta'])); // "destruído por Torreta"

  let camModo = 0;
  let camAjuste = lerCamAngulo(); // rad somados ao ângulo do modo
  let camAjusteSalvo = camAjuste;
  let camYaw = 0;
  let tempo = 0;
  let renasceAte = 0; // performance.now() em que a nave renasce (do renasceEm do servidor)
  let localSeq = 0;
  let saltoCamera = false; // a nave saltou (recall, renascimento): câmera vai junto
  let saltoForcado = false; // evento 'teleporte' seu: o próximo snapshot é salto, mesmo curto
  let recallLocal = null; // { frac, t }: progresso da própria volta à base no último snapshot
  let estadosArmas = {}; // estados das armas em você (snapshot `st`): cego, invisível, invulnerável...
  let painelEstava = false; // o painel da Loja/Evolução estava aberto no quadro anterior (som de abrir)

  const pose = (s) => ({ x: s.x, y: s.y, z: s.z, yaw: s.yaw, roll: s.roll });

  function passo() {
    if (!vivo || !pred) return;
    const inp = controles.ler();
    // As armas dos dois encaixes vão em todo comando; com o menu, o painel da
    // Loja/Evolução ou a janela de volume ou dos times aberta não sai tiro. Com o
    // STATUS ou o INVENTÁRIO aberto, sai (são janelas laterais de consulta).
    [inp.a, inp.a2] = menuArmas.encaixes;
    if (menuArmas.aberto || painel.aberto || painelVolume.aberto || times.aberto) inp.f1 = inp.f2 = false;
    seq++;
    rede.enviar({ t: 'in', s: seq, ...inp });
    ant = pose(pred);
    const apertouPouso = inp.p && !pred.pAnt;
    if (apertouPouso && !pred.pousado && !pousoPermitido(pred)) {
      hud.noticia(
        areaPouso(pred.x, pred.z) ? 'Esta plataforma é do outro time' : 'Só dá para pousar na sua base e nas plataformas de pouso',
        'ruim',
      );
    }
    // Disparos previstos: o projétil reto já sai desenhado (da boca da arma na asa);
    // o clarão e o som, um por encaixe e tiro da rajada.
    const tocados = new Set();
    for (const d of stepShip(pred, inp)) {
      const g = golpeDaArma(d.kind, d.nivel, 0);
      const daBoca = bocaDaArma(minhaNave, d.enc, boca);
      if (golpePrevisivel(g)) {
        const b = createBullet(pred, d.kind, 'l' + localSeq++, meuId, d.off, d.ang, d.nivel, g);
        b.nv = d.nivel;
        b.p = 0;
        efeitos.tiro(b, false, null, daBoca);
      }
      const chave = `${d.enc}:${d.k}`;
      if (tocados.has(chave)) continue;
      tocados.add(chave);
      if (daBoca) efeitos.armas.clarao(d.kind, daBoca.x, daBoca.y, daBoca.z, d.nivel);
      somNoMundo(somDaArma(d.kind, d.nivel), pred.x, pred.z);
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
    for (const p of m.jogadores ?? []) nomes.set(p.id, p.nome); // névoa: quem não está à vista também tem nome
    const euNoSnap = m.ents.find((e) => e.id === meuId);
    recallLocal = euNoSnap?.recall !== undefined ? { frac: euNoSnap.recall, t: performance.now() } : null;
    placar.atualizar(m.partida, m.bonus);
    times.atualizar(m.jogadores);
    barraTime.atualizar(m.jogadores, m.ents, m.vivo, m.me?.en);
    bonusAtivos = m.bonus ?? {};
    meusBonus = Object.keys(m.me?.bonusNave ?? {});
    hud.bonusNave(m.me?.bonusNave, bonusAtivos[meuTime], m.me?.bonusSuspenso);
    ultimoObj = m.obj ?? {};
    definirMineracao(m.ents.filter((e) => e.tipo === 'minerador' && e.minerando).length);
    // Bacia de cada base: o minério sobe com o placar e cai de quem está despejando.
    definirBacias(
      m.partida?.placar,
      m.ents.filter((e) => e.tipo === 'minerador' && e.descarga && e.vivo !== false).map((e) => ({ x: e.x, y: e.y, z: e.z, time: e.time })),
    );
    // Antes da predição: a torre de suporte caída já sai da física daqui em diante.
    for (const t of objetivos.atualizar(m.obj)) {
      efeitos.explosao(t.x, t.y, t.z, 6, '#ff9a3a');
      efeitos.explosao(t.x, t.y + 12, t.z, 3, '#ffb627');
    }
    // Torreta que caiu: explosão laranja e faíscas na cor do time dela.
    for (const t of torretas.atualizar(m.torretas)) {
      efeitos.explosao(t.x, t.y, t.z, 5, '#ff9a3a');
      efeitos.explosao(t.x, t.y + 4, t.z, 2.5, TORRETAS.find((x) => x.id === t.id).time === meuTime ? '#00efc0' : '#ff3b2a');
    }
    tratarEventos(m.ev);
    efeitos.corrigirGuiados(m.guiados);
    efeitos.atualizarMinas(m.minas, meuTime);
    menuArmas.definirPosse(m.me?.armas);
    menuArmas.definirNiveis(m.me?.niveis);
    estadosArmas = m.st ?? {};
    painel.atualizar({ ouro: m.ouro, nivel: m.nivel, me: m.me, melhorias: m.melhorias, torretas: m.torretas });
    status.atualizar({ me: m.me, nivel: m.nivel, xp: m.xp, xpProx: m.xpProx, ouro: m.ouro, nome: euNoSnap?.nome ?? meuNome });
    inventario.atualizar({ me: m.me, nivel: m.nivel, ouro: m.ouro });
    // A nave da linha que você pilota (muda ao evoluir na Evolução).
    if (m.me) definirNave(minhaNave, race, m.me.classe ?? classe, m.me.tier ?? 0);

    if (!m.vivo) {
      // O tempo de renascer é do servidor (cresce com o nível e com a partida).
      renasceAte = performance.now() + (m.renasceEm ?? 0) * 1000;
      vivo = false;
      pendentes = [];
      saltoForcado = false;
      pred = m.me;
      // Morta, a predição não roda e `ant` ficaria na última pose viva: a câmera,
      // que interpola ant → pred pela fração do tick, pularia entre as duas a cada
      // quadro (a tela tremia). Parada no lugar da morte, as duas são a mesma pose.
      ant = pose(pred);
      erro.set(0, 0, 0);
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
    if (saltoForcado || Math.hypot(dx, dy, dz) > SALTO_M) {
      // Salto (recall, teleporte): começa do lugar novo, sem arrastar a nave pelo caminho.
      saltoForcado = false;
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
      if (e.x !== undefined) efeitos.feixeRecall(e.x, e.y, e.z, cor); // névoa: a ponta escondida não vem
    }
    if (e.id !== meuId) return;
    if (e.estado === 'chegou') saltoForcado = true; // mesmo curto (já estava perto da base), sem suavizar
    if (e.estado === 'inicio') hud.noticia(`Voltando à base em ${e.s} s · sem tiro, sem boost, quase parado`, 'bom');
    else if (e.estado === 'chegou' && !e.partida) hud.noticia('De volta à base', 'bom'); // no começo da partida, a notícia é a do 'partida'
    else if (e.estado === 'cancelado') {
      recallLocal = null;
      const porque = MOTIVO_RECALL.cancelado[e.motivo];
      hud.noticia(porque ? `Volta à base cancelada: ${porque}` : 'Volta à base cancelada', porque ? 'ruim' : '');
    } else if (e.estado === 'recusado') hud.noticia(MOTIVO_RECALL.recusado[e.motivo] ?? 'Não dá para voltar à base agora', 'ruim');
  }

  /**
   * Teleporte até o companheiro (evento 'teleporte'): feixe de luz na saída e na
   * chegada, na cor do time; o seu marca o snapshot como salto e avisa.
   */
  function eventoTeleporte(e) {
    const cor = e.time === meuTime ? COR_TIME.meu : COR_TIME.outro;
    // Ponta de saída: a sua pela predição (ainda no lugar antigo); a dos outros, pela nave desenhada.
    const de = e.id === meuId ? (vivo ? pred : null) : outras.get(e.id)?.obj?.position;
    if (de) efeitos.feixeRecall(de.x, de.y, de.z, cor);
    efeitos.feixeRecall(e.x, e.y, e.z, cor);
    somNoMundo('up2', e.x, e.z);
    const alvo = e.alvo === meuId ? 'você' : (nomes.get(e.alvo) ?? 'o companheiro');
    if (e.id === meuId) {
      saltoForcado = true;
      hud.noticia(`Teleportado até ${alvo}`, 'bom');
    } else if (e.time === meuTime) hud.noticia(`${nomes.get(e.id) ?? '?'} se teleportou até ${alvo}`, 'bom');
  }

  /** Notícia de um evento 'objetivo' (apareceu, tomado, coletou, cancelou). */
  function noticiaObjetivo(e) {
    const tipo = LUGARES_OBJETIVO.find((o) => o.id === e.id)?.tipo;
    if (!tipo) return;
    const nome = NOME_OBJETIVO[tipo];
    const meu = e.time === meuTime;
    if (e.acao === 'apareceu') {
      hud.noticia(tipo === 'plataforma' ? `${nome} aberta: pouse 6 s para o time ganhar ouro` : `${nome} apareceu`);
    } else if (e.acao === 'tomado') {
      const [como, ganho] = GANHO_OBJETIVO[tipo] ?? ['tomou', ''];
      const quem = e.por === meuId ? 'Você' : (e.quem ?? (meu ? 'Seu time' : 'O inimigo'));
      hud.noticia(`${quem} ${como} · ${meu ? 'seu time' : 'inimigo'}${ganho ? `: ${ganho}` : ''}`, meu ? 'bom' : 'ruim');
    } else if (e.acao === 'coletou') {
      if (meu) hud.noticia(`${nome}: +${e.ouro} de ouro para cada um do time${e.quem ? ` (${e.quem} +${e.ouroPouso})` : ''}`, 'bom');
      else hud.noticia(`O inimigo coletou a ${nome.toLowerCase()}`, 'ruim');
    } else if (e.acao === 'cancelou' && meu) {
      hud.noticia(`Pouso na ${nome.toLowerCase()} cancelado: ${e.motivo === 'dano' ? 'levou dano' : 'saiu da plataforma'}`, 'ruim');
    }
  }

  function tratarEventos(ev) {
    const tocados = new Set(); // um som por arma e atirador em cada lote de eventos
    const tocarUmaVez = (chave, nome, x, z, volume) => {
      if (tocados.has(chave)) return;
      tocados.add(chave);
      somNoMundo(nome, x, z, volume);
    };
    // Golpe final crítico: o "CRÍTICO" sai junto do ouro e do XP (evento 'ganho'), não duas vezes.
    const critFinal = new Set();
    for (const e of ev) if (e.e === 'ganho' && e.crit) critFinal.add(e.id);
    for (const e of ev) {
      if (e.e === 'tiro' && e.fonte) {
        // Torreta ou escolta: tiro na cor do time de quem atirou, e o canhão vira.
        // O da torre sentinela é um míssil teleguiado (a curva vem de `guiados`).
        const b = { id: e.id, kind: e.guiado ? 'missil' : e.kind, x: e.x, y: e.y, z: e.z, vx: e.vx, vy: e.vy, vz: e.vz, vida: e.vida ?? 2.5 };
        efeitos.tiro(b, false, e.time === meuTime ? COR_TIME.meu : COR_TIME.outro);
        if (e.fonte === 'torreta') torretas.disparou(e.dono, e.vx, e.vz);
        const escolta = outras.get(e.dono)?.obj;
        if (escolta) Object.assign(escolta.userData, { mira: Math.atan2(-e.vx, -e.vz), miraAte: tempo + 1.5 });
      } else if (e.e === 'tiro') {
        // Projétil reto do próprio jogador já saiu na predição; o resto (teleguiado,
        // subprojétil, os dos outros) vem daqui.
        const p = e.p ?? 0;
        const proprio = e.dono === meuId;
        if (proprio && p === 0 && golpePrevisivel(golpeDaArma(e.kind, e.nv ?? 1, 0))) continue;
        const dono = proprio ? { obj: minhaNave } : outras.get(e.dono);
        const daBoca = p === 0 && e.enc !== undefined && dono?.obj?.visible !== false ? bocaDaArma(dono?.obj, e.enc, boca) : null;
        // O tiro direto sai da nave: o primeiro passo do campo de força da base conta de
        // onde ela está (stepBullet), para o tiro que nasce já do outro lado parar no plano.
        const origem = p === 0 && dono?.obj ? { ox: dono.obj.position.x, oz: dono.obj.position.z } : {};
        efeitos.tiro({ id: e.id, kind: e.kind, atq: e.atq, nv: e.nv, p, x: e.x, y: e.y, z: e.z, vx: e.vx, vy: e.vy, vz: e.vz, vida: e.vida ?? 2.5, ...origem }, !!dono?.drone, null, daBoca);
        if (proprio && p === 0) continue; // clarão e som já saíram na predição
        if (p === 0 && daBoca) efeitos.armas.clarao(e.kind, daBoca.x, daBoca.y, daBoca.z, e.nv);
        tocarUmaVez(`t${e.dono}:${e.kind}:${p}`, somDaArma(e.kind, e.nv, p), e.x, e.z);
      } else if (e.e === 'nova' && e.atq) {
        // Onda do SN-4 em volta dele: anel no vermelho de perigo.
        efeitos.anelArea(e.x, e.y, e.z, e.raio, COR_TIME.outro);
        tocarUmaVez(`n${e.id}`, 'n2_explo', e.x, e.z, 0.6);
      } else if (e.e === 'chama') {
        efeitos.chama(e);
      } else if (e.e === 'pulso') {
        // Pulso do Núcleo de He-3: anel na altura de voo, abrindo até o raio.
        efeitos.pulsoNucleo(e.x, HOVER, e.z, e.raio, e.forca);
        tocarUmaVez(`p${e.id}`, 'n2_explo', e.x, e.z, 0.8);
      } else if (e.e === 'explosao' && e.atq) {
        // Bala explosiva do Xerxes e o resto de área de monstro: explosão laranja e o anel vermelho.
        efeitos.explosao(e.x, e.y, e.z, 2.5, '#ff9a3a');
        if (e.raio > 0) efeitos.anelArea(e.x, e.y, e.z, e.raio, COR_TIME.outro);
        tocarUmaVez(`x${Math.round(e.x / 20)}:${Math.round(e.z / 20)}`, 'n2_explo', e.x, e.z, 0.5);
      } else if (e.e === 'nova') {
        efeitos.armas.nova(e.kind, e.nv, e.p, e.x, e.y, e.z, e.raio, e.vel);
        if (!(e.dono === meuId && !e.p)) tocarUmaVez(`n${e.id}`, somDaArma(e.kind, e.nv, e.p), e.x, e.z);
      } else if (e.e === 'efeito') {
        // Dispositivo ligado (camuflagem, escudo, teleporte...): clarão na nave e o som.
        efeitos.armas.clarao(e.kind, e.x, e.y, e.z, e.nv);
        if (e.id !== meuId) tocarUmaVez(`e${e.id}:${e.kind}`, somDaArma(e.kind, e.nv), e.x, e.z);
      } else if (e.e === 'explosao' && e.arma !== 'mina') {
        efeitos.armas.area(e.arma, e.nv, e.p, e.x, e.y, e.z, e.raio);
        tocarUmaVez(`x${e.arma}:${Math.round(e.x / 20)}:${Math.round(e.z / 20)}`, somImpacto(e.arma, e.nv, e.p), e.x, e.z);
      } else if (e.e === 'cura') {
        efeitos.explosao(e.x, e.y, e.z, 0.6, '#7dff9a');
        tocarUmaVez(`c${e.id}`, 'cure', e.x, e.z, 0.6);
      } else if (e.e === 'desarmou') {
        efeitos.explosao(e.x, e.y + 1, e.z, 0.8, '#c8d2ff');
      } else if (e.e === 'choque') {
        // A sua já foi desenhada na hora, pela predição.
        if (e.id !== meuId) efeitos.anelArea(e.x, e.y, e.z, e.raio, e.time === meuTime ? COR_TIME.meu : COR_TIME.outro);
      } else if (e.e === 'explosao' && e.arma === 'mina') {
        efeitos.explosao(e.x, e.y + 1.5, e.z, 3, '#ff9a3a');
        efeitos.anelArea(e.x, e.y + 1.5, e.z, e.raio, e.time === meuTime ? COR_TIME.meu : COR_TIME.outro);
      } else if (e.e === 'acerto' && (e.atq || e.kind === 'pulso')) {
        // Golpe de monstro (vermelho de perigo) ou do pulso do Núcleo (azul-gelo).
        efeitos.removerTiro(e.bala);
        efeitos.explosao(e.x, e.y, e.z, 0.8, e.kind === 'pulso' ? '#9fe8ff' : '#ff4a2a');
        if (e.alvo === meuId && e.dano > 0) hud.levarDano();
      } else if (e.e === 'acerto') {
        efeitos.removerTiro(e.bala);
        if (WEAPONS[e.kind] && !WEAPONS[e.kind].npc) {
          efeitos.armas.impacto(e.kind, 1, 0, e.x, e.y, e.z, 3.5);
          tocarUmaVez(`a${e.kind}:${e.alvo}`, somImpacto(e.kind), e.x, e.z, 0.8);
        } else efeitos.explosao(e.x, e.y, e.z, 0.7, '#ffd080');
        if (e.alvo === meuId && e.dano > 0) hud.levarDano();
        // Seu golpe crítico: "CRÍTICO" sobe do alvo.
        if (e.crit && e.por === meuId && !critFinal.has(e.alvo)) {
          hud.flutuante(e.x, e.y + 1, e.z, [{ txt: 'CRÍTICO', classe: 'crit' }]);
        }
      } else if (e.e === 'ganho') {
        // Monstro que você abateu: o ouro e o XP que o servidor deu sobem do lugar da morte.
        const linhas = [];
        if (e.crit) linhas.push({ txt: 'CRÍTICO', classe: 'crit' });
        if (e.ouro > 0) linhas.push({ txt: `+${e.ouro} ouro`, classe: 'ouro' });
        if (e.xp > 0) linhas.push({ txt: `+${e.xp} XP`, classe: 'xp' });
        hud.flutuante(e.x, e.y + 7 + (ROTULO_MONSTRO[e.esp] ?? 0), e.z, linhas);
      } else if (e.e === 'fim') {
        efeitos.removerTiro(e.bala);
        // O tiro parou no campo de força de uma base: um anel se abre onde bateu.
        if (e.campo !== undefined && e.x !== undefined) atingirCampo(e.campo, e.x, e.y, e.z);
      } else if (e.e === 'morte' && e.tipo === 'minerador') {
        efeitos.explosao(e.x, e.y, e.z, outras.get(e.id)?.nucleo ? 6 : 3, '#ff9a3a');
        const por = nomes.get(e.por) ?? '?';
        if (e.time === meuTime) hud.noticia(`${por} destruiu um minerador do seu time`, 'ruim');
        else if (e.por === meuId) hud.noticia(`Você destruiu um minerador inimigo${ganhoOuro > 0 ? ` · +${ganhoOuro} ouro` : ''}`, 'bom');
        else hud.noticia(`${por} destruiu um minerador inimigo`, 'bom');
      } else if (e.e === 'recall') {
        eventoRecall(e);
      } else if (e.e === 'teleporte') {
        eventoTeleporte(e);
      } else if (e.e === 'morte' && e.tipo === 'escolta') {
        efeitos.explosao(e.x, e.y, e.z, 3.5, '#ff9a3a');
        const por = nomes.get(e.por) ?? '?';
        if (e.time === meuTime) hud.noticia(`${por} destruiu a escolta do seu time`, 'ruim');
        else if (e.por === meuId) hud.noticia(`Você destruiu a escolta inimiga${ganhoOuro > 0 ? ` · +${ganhoOuro} ouro` : ''}`, 'bom');
        else hud.noticia(`${por} destruiu a escolta inimiga`, 'bom');
      } else if (e.e === 'torreta') {
        const minha = e.time === meuTime;
        const quem = e.por === meuId ? 'Você' : e.nome ?? '?';
        if (e.estado === 'reconstruida') {
          if (minha) hud.noticia(`${quem} reconstruiu uma torreta do seu time`, 'bom');
        } else if (minha) hud.noticia(`${quem} destruiu uma torreta do seu time`, 'ruim');
        else hud.noticia(`${quem} destruiu uma torreta inimiga${ganhoOuro > 0 ? ` · +${ganhoOuro} ouro` : ''}`, 'bom');
      } else if (e.e === 'entrega') {
        placar.entrega(e.time);
      } else if (e.e === 'faseFinal') {
        placar.faseFinal();
        hud.noticia(`Fase final: minério entregue vale ×${e.mult} até o fim`, 'bom');
      } else if (e.e === 'preparacao') {
        hud.noticia(`Preparação: a partida começa em ${relogio(e.s)} · explore o mapa e se prepare`, 'bom');
      } else if (e.e === 'partida') {
        hud.noticia('A partida começou: mineradores e jungle em campo · o time que minerar mais vence', 'bom');
      } else if (e.e === 'morte') {
        const tipo = e.tipo ?? outras.get(e.id)?.tipo;
        // Fora da visão (névoa) a morte de jogador vem sem lugar: só a notícia.
        if (e.x !== undefined) {
          const tam = tipo === 'nucleo' ? 12 : (EXPLOSAO_MONSTRO[e.esp] ?? 4);
          efeitos.explosao(e.x, e.y, e.z, tam, tipo === 'nucleo' ? '#9fe8ff' : '#ff9a3a');
          somNoMundo(tipo === 'jogador' || tam >= 5 ? 'h_explo' : 'n2_explo', e.x, e.z);
        }
        const quem = nomes.get(e.id) ?? '?';
        const matador = e.por === meuId ? 'Você' : (nomes.get(e.por) ?? '?');
        if (e.motivo === 'campo') {
          // Encostou no campo de força de uma base que não é a dele: o campo pisca forte ali.
          if (e.x !== undefined) for (let i = 0; i < 3; i++) atingirCampo(1 - e.time, e.x, e.y + (i - 1) * 4, e.z);
          if (e.id === meuId) hud.noticia('Você encostou no campo de força da base inimiga e foi destruído', 'ruim');
          else hud.noticia(`${quem} foi destruído pelo campo de força da ${e.time === meuTime ? 'base inimiga' : 'sua base'}`, e.time === meuTime ? 'ruim' : 'bom');
        } else if (e.id === meuId) hud.noticia(`Você foi destruído por ${nomes.get(e.por) ?? '?'}`, 'ruim');
        else if (e.por === meuId && outras.get(e.id)?.drone) {
          const chefe = ['sn4', 'medusa', 'sonda'].includes(e.esp) || tipo === 'nucleo';
          hud.noticia(`Você destruiu ${chefe ? 'o' : 'um'} ${quem}${ganhoOuro > 0 ? ` · +${ganhoOuro} ouro` : ''}`, 'bom');
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
        if (e.id === meuId) {
          hud.noticia(`Nível ${e.nivel}! HP máximo maior`, 'bom');
          sons.tocarInterface(SONS_INTERFACE.nivel);
        }
      } else if (e.e === 'nave') {
        // Nave nova na Evolução: anel de luz e notícia (o modelo troca pelo snapshot).
        const nave = e.id === meuId ? minhaNave : outras.get(e.id)?.obj;
        if (nave?.visible) efeitos.anelNivel(nave);
        if (e.id === meuId) hud.noticia(`Nave nova: ${e.nave}`, 'bom');
        else hud.noticia(`${e.nome} trocou de nave: ${e.nave}`, e.time === meuTime ? 'bom' : 'ruim');
      } else if (e.e === 'objetivo') {
        noticiaObjetivo(e);
      } else if (e.e === 'bonusNave' && e.id === meuId) {
        const b = BONUS_NAVE[e.nome];
        hud.noticia(`Bônus de ${b?.nome.toLowerCase() ?? e.nome}: ${b?.efeito ?? ''} por ${Math.round(e.s)} s`, 'bom');
      } else if (e.e === 'ondaNucleo') {
        const n = e.ids?.length ?? 3;
        if (e.time === meuTime) hud.noticia(`Onda do Núcleo: ${n} mineradores de He-3 saíram da sua base (50 de minério cada)`, 'bom');
        else hud.noticia(`Onda do Núcleo inimiga: ${n} mineradores de He-3 a caminho da doca deles`, 'ruim');
      } else if (e.e === 'melhoria' && e.time === meuTime && e.melhoria === MELHORIA_TORRETAS.id) {
        hud.noticia(`${e.id === meuId ? 'Você' : e.nome} evoluiu as torretas do time: nível ${e.nivel}`, 'bom');
      } else if (e.e === 'melhoria' && e.time === meuTime) {
        // Melhoria dos mineradores: vale para o time todo, então o time todo fica sabendo.
        const nome = MELHORIAS_MINERADOR[e.melhoria]?.nome ?? e.melhoria;
        hud.noticia(`${e.id === meuId ? 'Você' : e.nome} melhorou os mineradores: ${nome} nível ${e.nivel}`, 'bom');
      } else if (e.e === 'entrou' && e.id !== meuId) {
        hud.noticia(`${e.nome} entrou ${e.time === meuTime ? 'no seu time' : 'no time inimigo'}`);
      } else if (e.e === 'saiu') {
        hud.noticia(`${e.nome} saiu`);
      }
    }
  }

  rede.aoReceber = (m) => {
    if (m.t === 'snap') aoSnapshot(m);
    else if (m.t === 'resultado' && m.acao === 'teste') painelTeste?.resultado(m);
    else if (m.t === 'resultado' && m.acao === 'teleportar') {
      // Deu certo: o evento 'teleporte' avisa (e toca); recusado, a notícia e o "não".
      barraTime.resultado(m);
      if (!m.ok) sons.tocarInterface(SONS_INTERFACE.erro);
    }
    else if (m.t === 'resultado' && (m.acao === 'pontos' || m.acao === 'equipar' || m.acao === 'vender' || m.acao === 'evoluirItem')) {
      if (m.acao === 'pontos') status.resultado(m);
      else inventario.resultado(m);
      // Vender e evoluir mexem no ouro: o som da compra; o resto, o clique.
      const ouro = m.acao === 'vender' || m.acao === 'evoluirItem';
      sons.tocarInterface(!m.ok ? SONS_INTERFACE.erro : ouro ? SONS_INTERFACE.compra : SONS_INTERFACE.clique);
    } else if (m.t === 'resultado') {
      painel.resultado(m);
      // Som da resposta: compra/uso que deu certo, ou o "não" da Loja.
      if (m.acao === 'usar' && m.ok) sons.tocarInterface(m.item === 'reparo' ? SONS_INTERFACE.reparo : SONS_INTERFACE.energia);
      else sons.tocarInterface(m.ok ? SONS_INTERFACE.compra : SONS_INTERFACE.erro);
    }
  };
  rede.aoFechar = () => hud.mostrarAviso('Conexão perdida. Aperte Esc ou recarregue a página.');

  const lerp = (a, b, k) => a + (b - a) * k;
  /**
   * Altura do que é sólido em volta do ponto, para a câmera: o modelo da rocha fica
   * até 4 m para fora da planta (heightAt), então olha uma volta de CAMERA_FOLGA_ROCHA.
   */
  const solidoCamera = (x, z) => {
    const f = CAMERA_FOLGA_ROCHA;
    return Math.max(alturaSolida(x, z, f), heightAt(x + f, z), heightAt(x - f, z), heightAt(x, z + f), heightAt(x, z - f));
  };
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

  // 30 quadros por segundo, qualquer que seja o monitor (public/js/quadros.js).
  const limitador = criarLimitador();

  function quadro(agora) {
    if (!ativo) return;
    if (!limitador.deveDesenhar(agora)) {
      idQuadro = requestAnimationFrame(quadro);
      return;
    }
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
    const ajuste = controles.ajusteCamera(dt);
    if (ajuste) {
      const base = Math.atan2(CAMERAS[camModo].alt, CAMERAS[camModo].dist);
      camAjuste = Math.max(CAM_ANG_MIN - base, Math.min(CAM_ANG_MAX - base, camAjuste + ajuste));
    } else if (camAjuste !== camAjusteSalvo) {
      // Soltou: guarda (uma vez, não a cada quadro).
      camAjusteSalvo = camAjuste;
      try {
        localStorage.setItem(CHAVE_CAM_ANG, String(camAjuste));
      } catch {}
    }

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
      definirArmas(minhaNave, pred.encaixes);
      const eu = snaps.at(-1)?.ents.find((e) => e.id === meuId);
      const meusEfeitos = {
        dreno: !!eu?.dreno && vivo,
        lento: pred.lento > 0 && vivo,
        emp: pred.emp > 0 && vivo,
        semTiro: pred.semTiro > 0 && vivo,
        desg: pred.desgov > 0 && vivo,
        semRegen: pred.semRegen > 0 && vivo,
        cego: estadosArmas.cego > 0 && vivo,
        inv: !!estadosArmas.invisivel && vivo,
        invul: estadosArmas.invulneravel > 0 && vivo,
      };
      const bonusMeus = vivo ? [...meusBonus, ...(bonusAtivos[meuTime]?.medusa ? ['medusa'] : [])] : [];
      efeitos.estadoNave(minhaNave, { ...meusEfeitos, fx: vivo ? eu?.fx : [], bonus: bonusMeus }, dt, tempo);
      hud.efeitosProprios(meusEfeitos);
      sons.ouvinte(x, z, minhaNave.rotation.y);
      // Volta à base: a barra corre entre um snapshot e outro com RECALL_S.
      const fracRecall = vivo && recallLocal ? Math.min(1, recallLocal.frac + (agora - recallLocal.t) / 1000 / RECALL_S) : null;
      efeitos.recall(minhaNave, fracRecall, COR_TIME.meu, dt, tempo, true);
      hud.recall(fracRecall, fracRecall === null ? 0 : (1 - fracRecall) * RECALL_S);
      // Troca de arma fora da base: "CARREGANDO" no meio da tela enquanto conta.
      hud.carregando(vivo ? pred : null);
      foco.set(x, y, z);
    }

    // Outras naves.
    const poses = posesOutras();
    const presentes = new Set();
    const rotulos = [];
    let sonda = null; // posição da sonda viva (o rótulo do objetivo vai junto)
    for (const e of poses) {
      if (e.id === meuId) {
        meuNome = e.nome ?? meuNome;
        continue;
      }
      presentes.add(e.id);
      let o = outras.get(e.id);
      // Aliado: do seu time (jogador ou minerador). Monstro nunca é aliado.
      const aliado = !e.drone && e.time === meuTime;
      if (!o) {
        const obj =
          e.tipo === 'monstro'
            ? criarMonstro(e.esp)
            : e.tipo === 'nucleo'
              ? criarMarcadorNucleo()
              : e.tipo === 'minerador'
                ? criarMinerador({ aliado, nucleo: !!e.nucleo })
                : e.tipo === 'escolta'
                  ? criarEscolta({ aliado })
                  : criarNave(e.race, { aliado, classe: e.classe, tier: e.tier });
        o = { obj, drone: e.drone, tipo: e.tipo, aliado, nucleo: !!e.nucleo };
        scene.add(o.obj);
        outras.set(e.id, o);
      }
      // Comprou a próxima nave na Evolução: o modelo troca (carrega se for novo); as
      // armas dele penduram nas asas.
      if (e.tipo === 'jogador') {
        definirNave(o.obj, e.race, e.classe, e.tier);
        definirArmas(o.obj, e.arm);
        o.raio = naveDe(e.race, e.classe, e.tier)?.raio; // raio de acerto, que cresce com o tier
      }
      o.obj.visible = e.vivo;
      o.pos = o.obj.position;
      if (!e.vivo) continue;
      const bicho = e.tipo === 'monstro' || e.tipo === 'nucleo';
      o.obj.position.set(e.x, e.y + (e.pousado || bicho ? 0 : Math.sin(tempo * 2 + e.id) * 0.25), e.z);
      o.obj.rotation.y = e.yaw;
      o.obj.userData.corpo.rotation.z = e.roll;
      if (e.tipo === 'monstro') {
        animarMonstro(o.obj, tempo, dt, e.id);
        if (e.esp === 'sonda') sonda = o.obj.position;
      } else if (e.tipo === 'minerador') animarMinerador(o.obj, e, tempo, e.id);
      else if (e.tipo === 'escolta') animarEscolta(o.obj, tempo, dt, e.id);
      else if (!bicho) atualizarMotor(o.obj, e.boost, tempo, e.pousado);
      const bonus = e.tipo === 'jogador' ? [...(e.bn ?? []), ...(bonusAtivos[e.time]?.medusa ? ['medusa'] : [])] : [];
      efeitos.estadoNave(o.obj, { dreno: !!e.dreno, lento: !!e.lento, emp: !!e.emp, fx: e.fx, bonus }, dt, tempo);
      efeitos.recall(o.obj, e.recall ?? null, aliado ? COR_TIME.meu : COR_TIME.outro, dt, tempo);
      // Radar desligado (Canhão Antirradar): sem rótulo de quem não é do seu time.
      if (aliado || !(estadosArmas.cego > 0)) {
        // Monstro grande: o rótulo sobe até o alto dele (a Medusa é desenhada mais alta).
        let pos = o.obj.position;
        if (e.tipo === 'monstro' && ROTULO_MONSTRO[e.esp]) pos = (o.posRotulo ??= new THREE.Vector3()).copy(pos).setY(pos.y + ROTULO_MONSTRO[e.esp]);
        rotulos.push({ id: e.id, nome: e.nome, aliado, hp: e.hp, maxHp: e.maxHp, pos, nivel: e.nivel, piloto: e.tipo === 'jogador', esc: e.esc });
      }
    }
    objetivos.seguir('SONDA', sonda);
    // Torretas: queda, subida e a cabeça atrás do alvo (posição desenhada dele).
    torretas.quadro(dt, tempo, (id) => (id === meuId ? (vivo ? foco : null) : outras.get(id)?.obj.position ?? null));
    rotulos.push(...torretas.rotulos());
    // A sua nave também leva a etiqueta com o nick e o nível embaixo.
    if (vivo && meuNome) rotulos.push({ id: meuId, nome: meuNome, aliado: true, pos: minhaNave.position, nivel: extra.nivel, piloto: true, proprio: true });
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
        if (o.obj.visible && !o.aliado && bulletHits(b, { x: o.obj.position.x, y: o.obj.position.y, z: o.obj.position.z, raio: o.raio })) return true;
      }
      return false;
    });

    // Câmera de perseguição, como no AstroN: atrás e um pouco acima da nave.
    if (pred) {
      const cfg = CAMERAS[camModo];
      // Morto, a câmera fica parada onde estava até renascer (pedido do Mateus: tela estática).
      if (vivo) camYaw = lerpAng(camYaw, minhaNave.rotation.y, 1 - Math.exp(-5 * dt));
      const f = forward(camYaw);
      // Mesma distância do modo, no ângulo do modo mais o ajuste do piloto.
      const raio = Math.hypot(cfg.dist, cfg.alt);
      const ang = Math.max(CAM_ANG_MIN, Math.min(CAM_ANG_MAX, Math.atan2(cfg.alt, cfg.dist) + camAjuste));
      const horiz = raio * Math.cos(ang);
      desejada.set(foco.x - f.x * horiz, foco.y + raio * Math.sin(ang), foco.z - f.z * horiz);
      // Não deixa a câmera entrar na parede do cânion nem numa construção: aproxima
      // até ver a nave.
      for (let i = 1; i <= 8; i++) {
        const k = i / 8;
        const px = lerp(foco.x, desejada.x, k);
        const pz = lerp(foco.z, desejada.z, k);
        const py = lerp(foco.y + 2, desejada.y, k);
        if (solidoCamera(px, pz) + 2 > py) {
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
      const chao = solidoCamera(camera.position.x, camera.position.z) + 2;
      if (camera.position.y < chao) camera.position.y = chao;
      // Quanto mais de cima, mais a câmera mira na própria nave (senão ela some
      // embaixo do painel); por baixo, mira à frente como no modo normal.
      const kOlhar = Math.min(1, Math.cos(ang) / Math.cos(Math.atan2(cfg.alt, cfg.dist))) ** 2;
      alvoCam.set(foco.x + f.x * cfg.olhar * kOlhar, foco.y + 2, foco.z + f.z * cfg.olhar * kOlhar);
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
      // Pousada e parada em qualquer área da própria base (anel ou plataformas): o
      // inventário vende e evolui (equipar vale em qualquer lugar).
      inventario.lugar(!!(parada && area && (area.base === meuTime || (area.servico && area.time === meuTime))));
      // Plataforma do outro time não oferece pouso.
      hud.pouso(vivo && pousoPermitido(pred) ? area : null, vivo && pred.pousado, painel.aberto);
      // Pousada na marcação de um objetivo A: barra do progresso.
      hud.objetivoPouso(area?.plataforma && pred.pousado ? objetivos.estado.get(area.plataforma) : null);
      // Painel da Loja/Evolução abrindo: o som de abrir.
      if (painel.aberto && !painelEstava) sons.tocarInterface(SONS_INTERFACE.painel);
      painelEstava = painel.aberto;
      // Radar desligado (Canhão Antirradar): o minimapa só mostra o seu time.
      const entsMapa = snaps.at(-1)?.ents ?? [];
      hud.minimapa(
        vivo ? { x: foco.x, z: foco.z, yaw: minhaNave.rotation.y } : null,
        estadosArmas.cego > 0 ? entsMapa.filter((e) => e.id === meuId || (!e.drone && e.time === meuTime)) : entsMapa,
        meuId,
        ultimoObj,
        torretas.estados(),
        nevoa.canvasMapa,
      );
    }
    if (!vivo && renasceAte) {
      const falta = Math.max(0, (renasceAte - performance.now()) / 1000);
      hud.mostrarAviso(`Nave destruída · renascendo na base em ${Math.ceil(falta - 1e-3)}s`);
    }
    hud.rotulosNaves(rotulos, camera, innerWidth, innerHeight);
    hud.desenharFlutuantes(camera, innerWidth, innerHeight);
    objetivos.desenhar(camera, innerWidth, innerHeight);
    // Névoa: a grade da visão do time (sua nave, aliados, torres, base) e a cena desenhada com ela.
    nevoa.atualizar(dt, { eu: vivo && pred ? { id: meuId, x: foco.x, z: foco.z } : null, ents: snaps.at(-1)?.ents, torretas: torretas.estados() });
    nevoa.desenhar(renderer, scene, camera);
    idQuadro = requestAnimationFrame(quadro);
  }

  /**
   * Aquece a placa de vídeo com a cena montada, ainda atrás da tela de carregamento
   * (carregamento.js): shaders, texturas e geometrias de tudo o que a partida pode
   * desenhar, pelo mesmo caminho do quadro (a névoa).
   */
  function aquecer(carga) {
    return aquecerGpu({
      renderer,
      scene,
      camera,
      efeitos,
      focar: (p) => atualizarCena(0, p),
      race,
      classe,
      meuTime,
      tela: carga.tela,
      carga,
      alvo: nevoa.alvoCena,
      desenhar: () => nevoa.desenhar(renderer, scene, camera),
    });
  }

  /** Começa o laço de quadros (e com ele a predição e os comandos). */
  function comecar() {
    if (!ativo || idQuadro) return;
    ultimo = performance.now();
    limitador.reiniciar();
    idQuadro = requestAnimationFrame(quadro);
  }

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
    renderer,
    scene,
    camera,
    menuArmas,
    painel,
    status,
    inventario,
    sons,
    objetivos,
    torretas,
    efeitos,
    minhaNave,
    nevoa,
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
    times.fechar();
    barraTime.limpar();
    status.fechar();
    inventario.fechar();
    painelTeste?.fechar();
    painel.lugar(null);
    removeEventListener('resize', redimensionar);
    hud.limpar();
    placar.limpar();
    objetivos.limpar();
    torretas.limpar();
    renderer.domElement.remove();
    efeitos.liberar();
    nevoa.liberar();
    liberarCena(scene);
    renderer.renderLists.dispose();
    if (window.__astron?.scene === scene) window.__astron = null;
  }

  /**
   * ESC com a caixinha do teleporte (barra do time), a janela dos times, o STATUS,
   * o INVENTÁRIO ou o painel da Loja/Evolução aberto: fecha só ele. Devolve se fechou.
   */
  function fecharPainel() {
    if (barraTime.fecharCaixa()) return true; // a caixinha do teleporte, antes de tudo
    if (inventario.fecharCaixa()) return true; // a caixinha do item fecha antes da janela
    for (const janela of [times, status, inventario]) {
      if (janela.aberto) {
        janela.fechar();
        return true;
      }
    }
    if (!painel.aberto) return false;
    painel.fechar();
    return true;
  }

  return { sair, fecharPainel, aquecer, comecar };
}

montarEntrada();
