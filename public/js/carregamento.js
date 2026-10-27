// Tela de carregamento: entre o "Decolar" e o começo da partida, baixa e prepara TUDO
// o que pode aparecer na partida, para nada carregar nem compilar no meio dela.
//
// O que entra (a lista sai de insumos.js, que é puro e testado no Node):
// - os modelos do mapa (o lago de He-3; as nuvens de gás não têm arquivo, nuvens.js
//   gera a textura) e os dos monstros da jungle;
// - as naves de TODAS as raças jogáveis, classes e tiers (45) e as miniaturas da sua
//   linha para o cartão da Evolução (vitrine.js);
// - os modelos da asa de TODAS as armas (as suas e as de quem mais aparecer);
// - as texturas dos efeitos de todas as armas em todas as versões (V1 a V8, com os
//   filhos: subprojétil, o que a mina dispara);
// - todos os sons (armas de todos, tiros de NPC e interface), já decodificados;
// - e, no fim, a placa de vídeo: compila os shaders, envia texturas e geometrias e
//   desenha um quadro de tudo isso (aquecerGpu).
//
// Por que tudo, e não só a sua raça e classe: a medida (out/2026, Intel Iris Xe) achou
// as travadas no meio da partida em quem chega depois: computador ou piloto de outra
// raça baixava a linha de naves, as armas da asa, as texturas e os sons dele (até 290
// arquivos), mandava as texturas para a placa e decodificava o áudio no meio do jogo,
// e o primeiro efeito da Medusa e a sombra de peças novas compilavam shader na hora
// (um quadro de 280 ms). São ~18 MB: o Mateus prefere esperar na entrada.
//
// Por que conecta AO MESMO TEMPO que carrega (e não depois): a nave nasce na base do
// próprio time, que é zona segura (o servidor não deixa ninguém levar dano lá, e os
// monstros não entram), então ela pode esperar o carregamento parada sem levar tiro.
// Em troca, "partida cheia" e falta de servidor aparecem na hora, não depois de baixar
// tudo. A predição e o envio de comandos só começam depois do aquecimento (o laço de
// quadros nem roda antes), então a nave fica parada e o piloto não pilota às cegas.
//
// Programas de shader: o Three.js apaga o programa quando o último material que o usa
// é liberado. Os materiais do aquecimento nunca são liberados (e os efeitos passageiros
// voltam para as reservas de efeitos.js em vez de liberar), então cada programa fica na
// placa a partida inteira.
//
// Erro de rede num arquivo não trava a entrada: conta como feito, sai um aviso no
// console e a linha mostra quantos falharam (o jogo tenta de novo sob demanda). O cache
// é de cada módulo (nave.js, efeitos-armas.js, sons.js) e vale para a página toda:
// sair e entrar de novo não baixa nada, só aquece a placa de novo (sair libera a cena
// da GPU).

import * as THREE from 'three';
import { RACES } from '/shared/sim.js';
import { CLASSES, RACAS_JOGAVEIS, naveDe } from '/shared/naves.js';
import { WEAPONS } from '/shared/armas.js';
import { BASES } from '/shared/terrain.js';
import { insumosDaPartida, insumosDoMapa, modelosDasArmas, ESPECIES_MONSTRO } from './insumos.js';
import { carregarModeloMapa } from './mapa-modelos.js';
import { carregarMonstro, criarMonstro, prepararFxMedusa, texturasDosMonstros } from './monstros.js';
import {
  modeloDaNave,
  carregarArma,
  texturasDosModelos,
  brilho,
  criarNave,
  definirArmas,
  criarMinerador,
  criarEscolta,
  atualizarMotor,
} from './nave.js';
import { carregarTexturaEfeito, texturasEfeitoPedidas } from './efeitos-armas.js';
import { carregarEfeitoOriginal, criarEfeitoOriginal, tocarEfeitoOriginal } from './efeitos-original.js';
import { carregarPropulsao, texturasDaPropulsao } from './propulsao.js';
import { COR_TIME } from './efeitos.js';
import { miniatura } from './vitrine.js';

/** Arquivos baixando ao mesmo tempo na tela de carregamento (o navegador abre ~6 por servidor). */
const SIMULTANEOS = 6;

// Linhas da tela, na ordem em que carregam. `peso` é a parte da barra de cada uma,
// mais ou menos pelo tamanho (naves ~7 MB, armas ~3,7 MB, sons ~4,2 MB e a
// decodificação, efeitos ~1,4 MB, monstros ~1,2 MB, mapa ~0,9 MB) e pelo tempo da
// placa de vídeo (agora com tudo isso para compilar e enviar).
const LINHAS = [
  { id: 'mapa', nome: 'Cenário · lago de Hélio-3', curto: 'Cenário', peso: 5 },
  { id: 'monstros', nome: 'Monstros da jungle', curto: 'Monstros', peso: 6 },
  { id: 'naves', nome: 'Naves · todas as raças e classes', curto: 'Naves', peso: 28 },
  { id: 'armas', nome: 'Armas na asa · todas', curto: 'Armas', peso: 15 },
  { id: 'efeitos', nome: 'Efeitos das armas · V1 a V8', curto: 'Efeitos', peso: 7 },
  { id: 'sons', nome: 'Sons das armas e da interface', curto: 'Sons', peso: 20 },
  { id: 'miniaturas', nome: 'Miniaturas da Evolução', curto: 'Miniaturas', peso: 3 },
  { id: 'servidor', nome: 'Servidor', curto: 'Conectando ao servidor', peso: 3 },
  { id: 'gpu', nome: 'Placa de vídeo · shaders, texturas e modelos', curto: 'Preparando a placa de vídeo', peso: 13 },
];
/** Passos da linha da placa de vídeo (aquecerGpu): montar, compilar, texturas, desenhar. */
const PASSOS_GPU = 4;

/** Roda as tarefas com no máximo `n` ao mesmo tempo, na ordem da lista. */
function emFila(tarefas, n) {
  let i = 0;
  const trabalhador = async () => {
    while (i < tarefas.length) await tarefas[i++]();
  };
  return Promise.all(Array.from({ length: Math.min(n, tarefas.length) }, trabalhador));
}

// ---------- A tela ----------

/** A tela (#carregamento): barra com a porcentagem, o que está carregando e uma linha por grupo. */
export class TelaCarregamento {
  constructor(el = document.querySelector('#carregamento')) {
    this.el = el;
    this.lista = el.querySelector('.grupos');
    this.linhas = new Map();
    for (const l of LINHAS) {
      const li = document.createElement('li');
      li.dataset.grupo = l.id;
      li.innerHTML = `<i class="marca" aria-hidden="true"></i><span class="nome">${l.nome}</span><b class="conta"></b><span class="fio"><i></i></span>`;
      this.lista.append(li);
      this.linhas.set(l.id, { ...l, li, feitos: 0, total: 0, falhas: 0, texto: '', ativa: true });
    }
  }

  /** Abre a tela zerada para a raça e a classe (e o nome da primeira nave). */
  mostrar(race, classe) {
    const r = RACES[race];
    this.el.style.setProperty('--cor-raca', '#' + new THREE.Color(r?.cor ?? 0xffffff).getHexString());
    this.el.querySelector('.piloto').innerHTML = `<b>${r?.nome ?? race}</b> · ${CLASSES[classe]?.nome ?? classe} · <span>${naveDe(race, classe, 0)?.nome ?? ''}</span>`;
    for (const l of this.linhas.values()) Object.assign(l, { feitos: 0, total: 0, falhas: 0, texto: '', ativa: true });
    this.el.classList.remove('saindo');
    this.el.hidden = false;
    this.desenhar();
  }

  /** Fecha a tela (some com um esmaecer curto). */
  esconder() {
    this.el.classList.add('saindo');
    setTimeout(() => {
      if (this.el.classList.contains('saindo')) this.el.hidden = true;
    }, 220);
  }

  /** Muda uma linha: { feitos, total, falhas, texto, ativa } (o que vier). */
  linha(id, campos) {
    Object.assign(this.linhas.get(id), campos);
    this.desenhar();
  }

  /** Mais um item da linha pronto (com ou sem falha). */
  feito(id, falhou = false) {
    const l = this.linhas.get(id);
    l.feitos++;
    if (falhou) l.falhas++;
    this.desenhar();
  }

  /** Fração da barra (0 a 1), pelo peso de cada linha ativa. */
  get fracao() {
    let soma = 0;
    let feito = 0;
    for (const l of this.linhas.values()) {
      if (!l.ativa) continue;
      soma += l.peso;
      feito += l.peso * (l.total > 0 ? Math.min(1, l.feitos / l.total) : 0);
    }
    return soma ? feito / soma : 0;
  }

  desenhar() {
    if (this.quadro) return;
    // Um desenho por quadro, por mais arquivos que terminem nele.
    this.quadro = requestAnimationFrame(() => {
      this.quadro = 0;
      const pct = Math.floor(this.fracao * 100);
      this.el.querySelector('.pct').textContent = `${pct}%`;
      this.el.querySelector('.barra-total i').style.width = `${this.fracao * 100}%`;
      let agora = null;
      for (const l of this.linhas.values()) {
        l.li.hidden = !l.ativa;
        const pronto = l.total > 0 && l.feitos >= l.total;
        l.li.classList.toggle('pronto', pronto);
        l.li.classList.toggle('falhou', l.falhas > 0);
        const conta = l.texto || (l.total ? `${l.feitos}/${l.total}` : '—');
        l.li.querySelector('.conta').textContent = l.falhas ? `${conta} · ${l.falhas} falh${l.falhas > 1 ? 'aram' : 'ou'}` : conta;
        l.li.querySelector('.fio i').style.width = `${l.total ? (Math.min(l.feitos, l.total) / l.total) * 100 : 0}%`;
        if (l.ativa && !pronto && !agora) agora = l;
      }
      this.el.querySelector('.agora').textContent = agora
        ? agora.id === 'servidor' || agora.id === 'gpu'
          ? `${agora.curto}…`
          : `Carregando · ${agora.curto} ${agora.feitos}/${agora.total || '…'}`
        : 'Pronto · decolando';
    });
  }
}

// ---------- O carregamento da entrada ----------

/**
 * Um carregamento de entrada (um por "Decolar"): `carregar()` baixa a lista da
 * partida, `conectado(boas)` marca o servidor e `aquecer(...)` prepara a placa de
 * vídeo. `cancelar()` (ESC) faz toda espera em `esperar(p)` falhar com 'cancelado';
 * o que já baixou fica no cache.
 */
export class Carregamento {
  constructor({ race, classe, sons, tela }) {
    this.race = race;
    this.classe = classe;
    this.sons = sons;
    this.tela = tela;
    this.insumos = insumosDaPartida(race, classe);
    this.cancelado = false;
    this.inicio = performance.now();
    this.paraCancelar = new Promise((_, falha) => (this.desistir = falha));
    this.paraCancelar.catch(() => {});
  }

  /** Cancela (ESC na tela): quem espera em `esperar` recebe Error('cancelado'). */
  cancelar() {
    this.cancelado = true;
    this.desistir(new Error('cancelado'));
  }

  /** A promessa, ou Error('cancelado') se o piloto desistir antes. */
  esperar(p) {
    return Promise.race([p, this.paraCancelar]);
  }

  /** Item da linha `id`: roda `fazer`, conta como feito com ou sem falha e loga a falha. */
  #item(id, rotulo, fazer) {
    return async () => {
      let falhou = false;
      try {
        falhou = (await fazer()) === false;
        if (falhou) console.warn(`Carregamento: ${rotulo} não carregou (a entrada segue)`);
      } catch (err) {
        falhou = true;
        console.warn(`Carregamento: ${rotulo} não carregou (a entrada segue):`, err?.message ?? err);
      }
      this.tela?.feito(id, falhou);
    };
  }

  /** As 5 naves da linha do piloto (as miniaturas da Evolução). */
  get linhaPropria() {
    return this.insumos.naves.filter((n) => n.race === this.race && n.classe === this.classe);
  }

  /** Baixa tudo da lista da partida (resolve sempre, mesmo com falhas). */
  carregar() {
    const { naves, armas, texturas, sons, efeitosOriginais = [] } = this.insumos;
    const modelosArma = modelosDasArmas(armas);
    const { mapa, monstros } = insumosDoMapa();
    const linha = this.linhaPropria;
    const t = this.tela;
    t?.linha('mapa', { total: mapa.length });
    t?.linha('monstros', { total: monstros.length });
    t?.linha('naves', { total: naves.length + RACAS_JOGAVEIS.length });
    t?.linha('armas', { total: modelosArma.length });
    t?.linha('efeitos', { total: texturas.length + efeitosOriginais.length });
    t?.linha('sons', { total: sons.length });
    t?.linha('miniaturas', { total: linha.length });
    t?.linha('servidor', { total: 1, texto: 'Conectando…' });
    t?.linha('gpu', { total: PASSOS_GPU });
    const tarefas = [
      // O mapa primeiro: a cena só se monta com ele (o resto pode chegar depois).
      ...mapa.map((m) => this.#item('mapa', `cenário ${m.url}`, () => carregarModeloMapa(m.nome))),
      ...monstros.map((m) => this.#item('monstros', `monstro ${m.url}`, () => carregarMonstro(m.nome))),
      ...naves.map((n) => this.#item('naves', `nave ${n.url}`, () => modeloDaNave(n.race, n.classe, n.tier))),
      // A propulsão do original de cada raça (motor, turbo e jatos auxiliares).
      ...RACAS_JOGAVEIS.map((r) => this.#item('naves', `propulsão ${r}`, () => carregarPropulsao(r))),
      ...modelosArma.map((m) => this.#item('armas', `arma ${m}`, () => carregarArma(m))),
      ...texturas.map((nome) => this.#item('efeitos', `textura ${nome}`, () => carregarTexturaEfeito(nome))),
      // Os efeitos do original (os das armas dos monstros e os de estado na nave), com as texturas deles.
      ...efeitosOriginais.map((id) => this.#item('efeitos', `efeito ${id}`, () => carregarEfeitoOriginal(id))),
      // Os sons já saem decodificados (o contexto de áudio nasce no clique do Decolar).
      ...sons.map((nome) =>
        this.#item('sons', `som ${nome}`, async () => {
          await this.sons.carregar(nome);
          return !this.sons.falhou(nome);
        }),
      ),
      // Miniaturas por último: cada uma é um desenho na vitrine (com o modelo já pronto).
      ...linha.map((n) => this.#item('miniaturas', `miniatura ${n.nome}`, async () => (await miniatura(this.race, this.classe, n.tier)) !== null)),
    ];
    return emFila(tarefas, SIMULTANEOS).then(() => {
      this.msArquivos = Math.round(performance.now() - this.inicio);
    });
  }

  /** O servidor aceitou a entrada (bemvindo). */
  conectado(boas) {
    this.tela?.linha('servidor', { feitos: 1, texto: boas?.teste ? 'Mundo de teste' : 'Conectado' });
  }

  /** Quanto levou, para o console e os testes de navegador. */
  resumo() {
    const ms = Math.round(performance.now() - this.inicio);
    const { naves, armas, texturas, sons } = this.insumos;
    const { mapa, monstros } = insumosDoMapa();
    return {
      ms,
      msArquivos: this.msArquivos,
      msGpu: this.msGpu,
      gpu: this.gpu,
      mapa: mapa.length,
      monstros: monstros.length,
      naves: naves.length,
      armas: armas.length,
      modelosArma: modelosDasArmas(armas).length,
      texturas: texturas.length,
      sons: sons.length,
    };
  }
}

// ---------- Placa de vídeo ----------

/**
 * Prepara a placa de vídeo antes do primeiro quadro. Monta, num canto do céu sobre a
 * base do piloto, um exemplar de cada coisa que a partida pode desenhar:
 * - as 45 naves (todas as raças, classes e tiers, aliadas e inimigas) e naves com
 *   cada modelo de arma na asa, com motor, trem de pouso, auras, bônus, recall,
 *   camuflagem e o anel de nível;
 * - o projétil de cada versão de cada arma (e dos filhos), os passageiros (clarão,
 *   impacto, área, nova), campos e minas;
 * - os monstros (com o sangue e as bolhas da Medusa), mineradores dos dois times, o
 *   da onda do Núcleo, escoltas, os tiros de NPC e de monstro, chama, pulso, explosões,
 *   fumaça e as reservas de efeitos de efeitos.js;
 * e então, com TUDO da cena visível e sem recorte de câmera (o que está escondido,
 * como a torre caída ou o trem de pouso, e o que está longe também conta): compila os
 * shaders (compileAsync, nas duas faces dos transparentes de dois lados), envia todas
 * as texturas (initTexture: as dos modelos, dos efeitos com todos os quadros das
 * sequências, e as da cena) e desenha um quadro pelo caminho da partida (`desenhar`:
 * a névoa), com a sombra do sol, para compilar também os shaders de sombra de cada
 * tipo de peça e mandar cada geometria para a placa. Depois desfaz tudo.
 * `focar(p)` põe o sol e a sombra em p (atualizar de cena.js); `alvo` é o alvo de
 * desenho da névoa (nevoa.alvoCena), usado se não vier `desenhar`. Falha aqui não
 * impede a entrada: o pior caso é a travada de antes.
 */
export async function aquecerGpu({ renderer, scene, camera, efeitos, focar, race, classe, meuTime = 0, tela = null, carga = null, alvo = null, desenhar = null }) {
  const t0 = performance.now();
  const ins = insumosDaPartida(race, classe);
  const base = BASES[meuTime] ?? BASES[0];
  const ponto = new THREE.Vector3(base.x, 260, base.z);
  const grupo = new THREE.Group();
  grupo.position.copy(ponto);
  let n = 0;
  // Grade de 12 colunas, 15 m entre as coisas, centrada no ponto.
  const lugar = (obj, alturaExtra = 0) => {
    obj.position.set(((n % 12) - 6) * 15, alturaExtra, (Math.floor(n / 12) - 4) * 15);
    n++;
    grupo.add(obj);
    return obj;
  };
  const restaurar = []; // [objeto, visible, frustumCulled] da cena, para desfazer
  const programasAntes = renderer.info.programs?.length ?? 0;
  try {
    // Todas as naves (aliada e inimiga: a luz do time muda de material), com motor e trem.
    for (const nave of ins.naves) {
      for (const aliado of [true, false]) {
        const obj = lugar(criarNave(nave.race, { aliado, classe: nave.classe, tier: nave.tier }));
        atualizarMotor(obj, { vitrine: true }, 0, 1 / 30);
      }
    }
    // Cada modelo de arma pendurado numa nave (dois por nave, um em cada asa).
    for (let i = 0; i < ins.armas.length; i += 2) {
      const a = ins.armas[i];
      const b = ins.armas[i + 1] ?? a;
      const obj = lugar(criarNave(race, { aliado: false, classe, tier: 0 }));
      definirArmas(obj, [a.idx, b.idx]);
      definirArmas(lugar(criarNave(race, { aliado: true, classe, tier: 1 })), [b.idx, a.idx]);
    }
    // Auras, recall, bônus, camuflagem e o anel de nível, em duas naves só para isso.
    const auras = lugar(criarNave(race, { aliado: true, classe, tier: 0 }));
    efeitos.estadoNave(
      auras,
      { dreno: true, lento: true, emp: true, bonus: ['ataque', 'suporte', 'sonda', 'medusa'], fx: ['para', 'desg', 'energia', 'invul', 'escudo', 'fraco', 'regen', 'acel'] },
      0.2,
      0,
    );
    efeitos.recall(auras, 0.5, COR_TIME.meu, 0.016, 0);
    efeitos.anelNivel(auras);
    const fantasma = lugar(criarNave(race, { aliado: true, classe, tier: 0 }));
    efeitos.estadoNave(fantasma, { fx: ['inv'] }, 0.016, 0);
    // Monstros (modelos do original; a Medusa com o sangue e as bolhas, que são
    // transparentes e compilam outro shader), mineradores (o comum dos dois times, o
    // do Núcleo, cheios e minerando) e escoltas dos dois times.
    for (const esp of ESPECIES_MONSTRO) {
      const m = lugar(criarMonstro(esp));
      if (esp === 'medusa') prepararFxMedusa(m);
    }
    for (const criar of [
      () => criarMinerador({ aliado: true }),
      () => criarMinerador({ aliado: false }),
      () => criarMinerador({ aliado: false, nucleo: true }),
      () => criarEscolta({ aliado: true }),
      () => criarEscolta({ aliado: false }),
    ]) {
      lugar(criar());
    }
    // Projétil de cada versão e golpe de cada arma, acima das naves, e os passageiros.
    const altoProjetil = 18;
    let k = 0;
    for (const a of [...ins.armas, ...ins.armasMonstro]) {
      const w = WEAPONS[a.kind];
      for (let nv = 1; nv <= w.versoes.length; nv++) {
        for (let prof = 0; golpeProfundo(a.kind, nv, prof); prof++) {
          const p = efeitos.armas.projetil(a.kind, nv, prof);
          p.g.position.set(((k % 24) - 12) * 5, altoProjetil + Math.floor(k / 24) * 4, -20);
          grupo.add(p.g);
          k++;
        }
      }
      const x = ponto.x + ((k % 24) - 12) * 5;
      efeitos.armas.clarao(a.kind, x, ponto.y + 10, ponto.z + 20, 1);
      efeitos.armas.impacto(a.kind, 1, 0, x, ponto.y + 10, ponto.z + 25, 4);
      efeitos.armas.area(a.kind, 1, 0, x, ponto.y + 10, ponto.z + 30, 6);
      efeitos.armas.nova(a.kind, 1, 0, x, ponto.y + 10, ponto.z + 35, 6, 0);
    }
    if (ins.armas.length) {
      lugar(efeitos.armas.campo(ins.armas[0].kind, 1, 0, 6));
      lugar(efeitos.armas.decalque(ins.armas[0].kind, 1, 0, 3));
    }
    // Minas e campos como a partida os desenha (corpo, luz, decalque; campo de arma e
    // o campo elétrico de monstro), dos dois times.
    const mina = (id, extra) => ({ id, time: 0, x: ponto.x, y: ponto.y - 20, z: ponto.z, armada: true, nv: 1, p: 0, ...extra });
    efeitos.atualizarMinas(
      [
        mina('aq-mina0', { kind: ins.armas[0]?.kind }),
        mina('aq-mina1', { kind: ins.armas[0]?.kind, time: 1 }),
        mina('aq-campo', { kind: ins.armas[0]?.kind, campo: true, raio: 8 }),
        // O campo elétrico do SN-4 (efeito do original).
        mina('aq-campo-monstro', { kind: 'n550140', campo: true, atq: 'campo_eletrico', raio: 12.5 }),
        // A armadilha do SN-Zero VI (arma de NPC do original), no vermelho dos monstros.
        ...ins.armasMonstro.filter((a) => WEAPONS[a.kind].categoria === 'mina').map((a) => mina(`aq-mina-${a.kind}`, { kind: a.kind, time: undefined, atq: 'armadilha_sn6' })),
      ],
      meuTime,
    );
    // Tiros dos NPCs (drones, torreta, escolta e o míssil da torre sentinela, com o
    // rastro) e explosões, anéis e feixe do recall.
    const tiro = (id, kind, dx, extra = {}, inimigo = true, cor = null) =>
      efeitos.tiro({ id, kind, x: ponto.x + dx, y: ponto.y + 5, z: ponto.z, vx: 0, vy: 0, vz: -1, vida: 0.5, ...extra }, inimigo, cor);
    tiro('aq-laser', 'laser', 0);
    tiro('aq-plasma', 'plasma', 5);
    tiro('aq-torreta', 'laser', -5, {}, false, COR_TIME.meu);
    tiro('aq-missil', 'missil', 10, { vz: -200 });
    efeitos.explosao(ponto.x, ponto.y + 5, ponto.z + 10, 3, '#ff9a3a');
    efeitos.anelArea(ponto.x, ponto.y + 5, ponto.z - 10, 8, COR_TIME.outro);
    efeitos.feixeRecall(ponto.x + 20, ponto.y, ponto.z, COR_TIME.meu);
    // O pulso do Núcleo.
    efeitos.pulsoNucleo(ponto.x, ponto.y + 35, ponto.z, 80, 1.5);
    // Os efeitos do original (armas dos monstros e estados na nave): uma instância de
    // cada, que volta para a reserva em efeitos.esquecer() (o material já compilado
    // fica pronto para a partida).
    efeitos.camera = camera;
    (ins.efeitosOriginais ?? []).forEach((id, i) => {
      const inst = criarEfeitoOriginal(id, { escala: 0.5, loop: true });
      if (!inst) return;
      inst.obj.position.set(ponto.x + ((i % 12) - 6) * 8, ponto.y + 40 + Math.floor(i / 12) * 8, ponto.z);
      grupo.add(inst.obj);
      tocarEfeitoOriginal(inst, 0, camera);
      efeitos.originais.push({ inst });
    });
    // Um passo de animação: os mísseis soltam a fumaça e tudo ganha a forma do quadro.
    efeitos.atualizar(1 / 30);
    // As reservas de efeitos.js (fumaça, faíscas, anéis): criadas aqui, prontas na partida.
    efeitos.preencherReservas(grupo);
    // Sombra: o Three.js desenha a sombra de quase tudo com UM material de profundidade,
    // trocando o lado (peça de um lado só sombreia pelo avesso) sem recompilar, e só
    // escolhe outro shader quando alterna entre peça instanciada (rochas, nuvens) e
    // comum: o shader novo sai com o lado da peça daquele momento. Na partida a ordem
    // das peças muda com quem aparece (uma mina depois das rochas compilava um shader
    // de sombra no meio da luta), então aqui vão as seis combinações em sequência:
    // instanciada e comum alternando, em cada lado.
    lugar(grupoSombras());

    scene.add(grupo);
    // Tudo visível e sem recorte: escondidos (trem de pouso, carga, torre caída,
    // feixes) e o que está fora da câmera ou da sombra também compilam e sobem agora.
    scene.traverse((o) => {
      restaurar.push([o, o.visible, o.frustumCulled]);
      o.visible = true;
      o.frustumCulled = false;
    });
    scene.updateMatrixWorld(true);
    camera.position.set(ponto.x, ponto.y + 70, ponto.z + 150);
    camera.lookAt(ponto);
    camera.updateMatrixWorld(true);
    focar(ponto);
    tela?.feito('gpu');

    // Um quadro para a tela mostrar "Preparando a placa de vídeo" antes do trabalho.
    await new Promise((ok) => requestAnimationFrame(ok));
    // A partida desenha no alvo da névoa (nevoa.js: cor linear, sem tone mapping no
    // material): compila lá, para os programas serem os mesmos da partida.
    if (alvo) renderer.setRenderTarget(alvo);
    await compilarTudo(renderer, scene, camera);
    renderer.setRenderTarget(null);
    tela?.feito('gpu');
    if (carga?.cancelado) return;
    // Texturas: as das naves e armas, as dos monstros, as dos efeitos (todos os quadros
    // das sequências, não só o primeiro), o brilho e as que a cena usa (plaquinhas,
    // névoa, água). initTexture de uma já enviada não faz nada.
    const texturas = new Set([brilho(), ...texturasDosModelos(), ...texturasDosMonstros(), ...texturasEfeitoPedidas(), ...texturasDaPropulsao()]);
    scene.traverse((o) => {
      for (const m of [o.material].flat()) {
        if (!m) continue;
        for (const v of Object.values(m)) if (v?.isTexture) texturas.add(v);
        if (m.uniforms) for (const u of Object.values(m.uniforms)) if (u?.value?.isTexture) texturas.add(u.value);
      }
    });
    for (const t of texturas) if (t.version > 0 || t.isRenderTargetTexture) renderer.initTexture(t);
    tela?.feito('gpu');
    // O quadro de verdade (sombra, geometrias, passo da névoa), duas vezes: a primeira
    // compila o que só o desenho compila (sombras), a segunda confere que nada sobrou.
    const quadro = desenhar ?? (() => {
      if (alvo) renderer.setRenderTarget(alvo);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
    });
    quadro();
    const programasQuadro = renderer.info.programs?.length ?? 0;
    quadro();
    tela?.feito('gpu');
    if (carga) {
      carga.gpu = {
        programas: renderer.info.programs?.length ?? 0,
        novosNoAquecimento: (renderer.info.programs?.length ?? 0) - programasAntes,
        noSegundoQuadro: (renderer.info.programs?.length ?? 0) - programasQuadro,
        texturas: renderer.info.memory.textures,
        geometrias: renderer.info.memory.geometries,
      };
    }
  } catch (err) {
    console.warn('Carregamento: aquecer a placa de vídeo falhou (a entrada segue):', err);
  } finally {
    renderer.setRenderTarget(null);
    for (const [o, visivel, recorte] of restaurar) {
      o.visible = visivel;
      o.frustumCulled = recorte;
    }
    scene.remove(grupo);
    // Os passageiros, tiros, partículas e anéis criados aqui saem de cena SEM liberar
    // os materiais (os que têm reserva voltam para ela): material liberado faz o
    // Three.js apagar o programa de shader que ninguém mais usa, e o próximo efeito
    // igual compilaria de novo no meio da partida. As geometrias das naves, dos
    // mineradores e das escoltas são compartilhadas com a partida: ficam também.
    efeitos.esquecer();
    efeitos.atualizarMinas([], meuTime);
    // A câmera volta à origem: o primeiro quadro de verdade a põe atrás da nave.
    camera.position.set(0, 0, 0);
    camera.rotation.set(0, 0, 0);
    if (carga) carga.msGpu = Math.round(performance.now() - t0);
  }
}

/** Peças pequenas, instanciada e comum alternando, nos três lados, todas com sombra (ver o aquecimento). */
function grupoSombras() {
  const g = new THREE.Group();
  const geo = new THREE.BoxGeometry(1, 1, 1);
  for (const lado of [THREE.FrontSide, THREE.DoubleSide, THREE.BackSide]) {
    const mat = new THREE.MeshBasicMaterial({ side: lado });
    const inst = new THREE.InstancedMesh(geo, mat, 1);
    inst.setMatrixAt(0, new THREE.Matrix4());
    for (const o of [inst, new THREE.Mesh(geo, mat)]) {
      o.castShadow = true;
      g.add(o);
    }
  }
  return g;
}

/** Quanto esperar, no máximo, a placa terminar de ligar os shaders (não trava a entrada). */
const ESPERA_SHADERS_MS = 30000;

/**
 * Compila os shaders de tudo na cena. Com KHR_parallel_shader_compile, a placa
 * compila em paralelo e aqui só se espera cada programa ficar pronto (como o
 * compileAsync do Three.js, que não serve aqui: ele quebra quando um material da
 * lista fica sem programa no meio, e nunca resolve); sem a extensão, compila direto.
 */
async function compilarTudo(renderer, scene, camera) {
  const materiais = renderer.compile(scene, camera);
  if (!renderer.extensions?.has?.('KHR_parallel_shader_compile')) return;
  const ate = performance.now() + ESPERA_SHADERS_MS;
  while (materiais.size && performance.now() < ate) {
    for (const m of materiais) {
      const programa = renderer.properties.get(m).currentProgram;
      if (!programa || programa.isReady()) materiais.delete(m);
    }
    if (materiais.size) await new Promise((ok) => setTimeout(ok, 10));
  }
}

/** Existe golpe nessa profundidade (subprojétil, o que a mina dispara)? */
function golpeProfundo(kind, nv, prof) {
  let g = WEAPONS[kind]?.versoes[nv - 1]?.golpe ?? null;
  for (let i = 0; i < prof && g; i++) g = g.divide ?? g.dispara ?? null;
  return !!g;
}
