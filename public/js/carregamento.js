// Tela de carregamento: entre o "Decolar" e o começo da partida, baixa e prepara tudo
// o que a nave do piloto pode precisar, para nada carregar no meio da partida (trocar
// de arma, evoluir a arma, comprar a nave seguinte na Evolução).
//
// O que entra (a lista sai de insumos.js, que é puro e testado no Node):
// - os modelos das 5 naves da linha da raça e da classe (as que a Evolução compra) e
//   as miniaturas delas para o cartão da Evolução (vitrine.js);
// - os modelos das armas na asa de todas as armas que a raça e a classe usam;
// - as texturas dos efeitos dessas armas em todas as versões (V1 a V8, com os filhos:
//   subprojétil, o que a mina dispara);
// - os sons dessas armas e os de interface;
// - a nave e as armas que os outros pilotos já na partida estão usando agora;
// - e, no fim, a placa de vídeo: compila os shaders de tudo isso e envia as texturas
//   (aquecerGpu), para a primeira aparição de cada coisa não travar o quadro.
//
// Por que conecta AO MESMO TEMPO que carrega (e não depois): a nave nasce na base do
// próprio time, que é zona segura (o servidor não deixa ninguém levar dano lá, e os
// monstros não entram), então ela pode esperar o carregamento parada sem levar tiro.
// Em troca, "partida cheia" e falta de servidor aparecem na hora, não depois de baixar
// tudo, e a nave e as armas de quem já está na partida entram na lista. A predição e o
// envio de comandos só começam depois do aquecimento (o laço de quadros nem roda antes),
// então a nave fica parada e o piloto não pilota às cegas atrás da tela.
//
// Naves dos OUTROS pilotos (outras raças e classes): a que cada um usa agora entra na
// tela de carregamento (é pouco: uma nave e duas armas cada); o resto da linha dele e
// as armas, texturas e sons da raça e classe dele vêm em segundo plano, devagar
// (carregarEmFundo, poucos arquivos por vez), quando ele aparece. Baixar as 45 naves e
// as 151 armas (~16 MB) para todo piloto atrasaria a entrada de quem só vai ver duas
// ou três linhas; e o que um outro piloto troca no meio da partida não trava a SUA
// nave: até o modelo novo chegar, fica o antigo (ou o losango do time).
//
// Programas de shader: o Three.js apaga o programa quando o último material que o usa
// é liberado, e quase todo efeito passageiro libera o seu ao sumir (o próximo igual
// compilaria de novo). Os materiais do aquecimento nunca são liberados, então cada
// programa fica na placa a sessão inteira, entre uma entrada e outra também.
//
// Erro de rede num arquivo não trava a entrada: conta como feito, sai um aviso no
// console e a linha mostra quantos falharam (o jogo tenta de novo sob demanda). O cache
// é de cada módulo (nave.js, efeitos-armas.js, sons.js) e vale para a página toda:
// sair e entrar de novo com a mesma nave não baixa nada, só aquece a placa de novo
// (sair libera a cena da GPU).

import * as THREE from 'three';
import { RACES } from '/shared/sim.js';
import { CLASSES, naveDe } from '/shared/naves.js';
import { WEAPONS, ARMAS } from '/shared/armas.js';
import { BASES } from '/shared/terrain.js';
import { insumosDaNave } from './insumos.js';
import {
  modeloDaNave,
  carregarArma,
  texturasDosModelos,
  brilho,
  criarNave,
  definirArmas,
  criarDrone,
  criarVorax,
  criarKrakor,
  criarGuardiao,
  criarMinerador,
  criarEscolta,
} from './nave.js';
import { carregarTexturaEfeito, texturasEfeitoPedidas } from './efeitos-armas.js';
import { COR_TIME } from './efeitos.js';
import { miniatura } from './vitrine.js';

/** Arquivos baixando ao mesmo tempo na tela de carregamento (o navegador abre ~6 por servidor). */
const SIMULTANEOS = 6;
/** Arquivos ao mesmo tempo no segundo plano (no meio da partida: devagar, para não disputar com o jogo). */
const SIMULTANEOS_FUNDO = 2;
/** Texturas enviadas à placa por vez no segundo plano (cada uma é pequena; poucas por folga do quadro). */
const TEXTURAS_POR_FOLGA = 8;
/** Quanto esperar o primeiro snapshot (chega 1/30 s depois do bemvindo) para ver quem já está na partida. */
const ESPERA_SNAP_MS = 800;

// Linhas da tela, na ordem em que carregam. `peso` é a parte da barra de cada uma,
// mais ou menos pelo tamanho (uma linha de naves ~0,8 MB, as armas ~0,4 a 1,6 MB,
// as texturas ~0,25 MB, os sons ~1,8 MB) e pelo tempo da placa de vídeo.
const LINHAS = [
  { id: 'naves', nome: 'Naves da linha', curto: 'Naves', peso: 20 },
  { id: 'armas', nome: 'Armas na asa', curto: 'Armas', peso: 18 },
  { id: 'efeitos', nome: 'Efeitos das armas · V1 a V8', curto: 'Efeitos', peso: 8 },
  { id: 'sons', nome: 'Sons das armas e da interface', curto: 'Sons', peso: 34 },
  { id: 'miniaturas', nome: 'Miniaturas da Evolução', curto: 'Miniaturas', peso: 3 },
  { id: 'pilotos', nome: 'Naves dos outros pilotos', curto: 'Outros pilotos', peso: 5 },
  { id: 'servidor', nome: 'Servidor', curto: 'Conectando ao servidor', peso: 4 },
  { id: 'gpu', nome: 'Placa de vídeo · shaders e texturas', curto: 'Preparando a placa de vídeo', peso: 8 },
];

/** Roda as tarefas com no máximo `n` ao mesmo tempo, na ordem da lista. */
function emFila(tarefas, n) {
  let i = 0;
  const trabalhador = async () => {
    while (i < tarefas.length) await tarefas[i++]();
  };
  return Promise.all(Array.from({ length: Math.min(n, tarefas.length) }, trabalhador));
}

/** Modelos das peças na asa para as armas [Z, X] (índices em ARMAS) de um piloto. */
function modelosNosEncaixes(arm) {
  return (arm ?? []).map((a, enc) => WEAPONS[ARMAS[a]]?.modelo?.[enc]).filter(Boolean);
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
      this.linhas.set(l.id, { ...l, li, feitos: 0, total: 0, falhas: 0, texto: '', ativa: l.id !== 'pilotos' });
    }
  }

  /** Abre a tela zerada para a raça e a classe (e o nome da primeira nave). */
  mostrar(race, classe) {
    const r = RACES[race];
    this.el.style.setProperty('--cor-raca', '#' + new THREE.Color(r?.cor ?? 0xffffff).getHexString());
    this.el.querySelector('.piloto').innerHTML = `<b>${r?.nome ?? race}</b> · ${CLASSES[classe]?.nome ?? classe} · <span>${naveDe(race, classe, 0)?.nome ?? ''}</span>`;
    for (const l of this.linhas.values()) Object.assign(l, { feitos: 0, total: 0, falhas: 0, texto: '', ativa: l.id !== 'pilotos' });
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
 * Um carregamento de entrada (um por "Decolar"): `carregar()` baixa a lista da nave,
 * `conectado(boas)` marca o servidor, `outrosPilotos(...)` pega as naves de quem já
 * está na partida e `aquecer(...)` prepara a placa de vídeo. `cancelar()` (ESC) faz
 * toda espera em `esperar(p)` falhar com 'cancelado'; o que já baixou fica no cache.
 */
export class Carregamento {
  constructor({ race, classe, sons, tela }) {
    this.race = race;
    this.classe = classe;
    this.sons = sons;
    this.tela = tela;
    this.insumos = insumosDaNave(race, classe);
    this.cancelado = false;
    this.inicio = performance.now();
    this.paraCancelar = new Promise((_, falha) => (this.desistir = falha));
    this.paraCancelar.catch(() => {});
    // A sua raça e classe não precisam do segundo plano: estão todas aqui.
    feitosNoFundo.add(`${race}/${classe}`);
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

  /** Baixa tudo da lista da nave (resolve sempre, mesmo com falhas). */
  carregar() {
    const { naves, armas, texturas, sons } = this.insumos;
    const t = this.tela;
    t?.linha('naves', { total: naves.length });
    t?.linha('armas', { total: armas.length });
    t?.linha('efeitos', { total: texturas.length });
    t?.linha('sons', { total: sons.length });
    t?.linha('miniaturas', { total: naves.length });
    t?.linha('servidor', { total: 1, texto: 'Conectando…' });
    t?.linha('gpu', { total: 3 });
    const tarefas = [
      ...naves.map((n) => this.#item('naves', `nave ${n.url}`, () => modeloDaNave(this.race, this.classe, n.tier))),
      ...armas.map((a) =>
        this.#item('armas', `arma ${a.nome} (${a.modelos.join(', ') || 'sem modelo'})`, () => Promise.all(a.modelos.map((m) => carregarArma(m)))),
      ),
      ...texturas.map((nome) => this.#item('efeitos', `textura ${nome}`, () => carregarTexturaEfeito(nome))),
      ...sons.map((nome) =>
        this.#item('sons', `som ${nome}`, async () => {
          await this.sons.carregar(nome);
          return !this.sons.falhou(nome);
        }),
      ),
      // Miniaturas por último: cada uma é um desenho na vitrine (com o modelo já pronto).
      ...naves.map((n) => this.#item('miniaturas', `miniatura ${n.nome}`, async () => (await miniatura(this.race, this.classe, n.tier)) !== null)),
    ];
    return emFila(tarefas, SIMULTANEOS).then(() => {
      this.msArquivos = Math.round(performance.now() - this.inicio);
    });
  }

  /** O servidor aceitou a entrada (bemvindo). */
  conectado(boas) {
    this.tela?.linha('servidor', { feitos: 1, texto: boas?.teste ? 'Mundo de teste' : 'Conectado' });
  }

  /**
   * Naves e armas que os outros pilotos estão usando agora (do primeiro snapshot,
   * lido por `lerSnap`). O resto da linha de cada um vai para o segundo plano.
   */
  async outrosPilotos(lerSnap, meuId) {
    const t0 = performance.now();
    while (!lerSnap() && performance.now() - t0 < ESPERA_SNAP_MS && !this.cancelado) await new Promise((ok) => setTimeout(ok, 30));
    const outros = (lerSnap()?.ents ?? []).filter((e) => e.tipo === 'jogador' && e.id !== meuId && e.race);
    if (!outros.length) return;
    this.tela?.linha('pilotos', { ativa: true, total: outros.length });
    await emFila(
      outros.map((e) =>
        this.#item('pilotos', `nave de ${e.nome}`, () =>
          Promise.all([modeloDaNave(e.race, e.classe, e.tier), ...modelosNosEncaixes(e.arm).map((m) => carregarArma(m))]),
        ),
      ),
      SIMULTANEOS,
    );
    for (const e of outros) carregarEmFundo(e.race, e.classe, this.sons);
  }

  /** Quanto levou, para o console e os testes de navegador. */
  resumo() {
    const ms = Math.round(performance.now() - this.inicio);
    const { naves, armas, texturas, sons } = this.insumos;
    return { ms, msArquivos: this.msArquivos, msGpu: this.msGpu, naves: naves.length, armas: armas.length, texturas: texturas.length, sons: sons.length };
  }
}

// ---------- Placa de vídeo ----------

let rendererAtual = null; // o renderer do jogo (único na página), para o segundo plano
const enviadas = new WeakSet(); // texturas já enviadas à placa nesta entrada
let entradaAtual = 0; // muda a cada aquecimento (sair libera tudo da placa)

/**
 * Prepara a placa de vídeo antes do primeiro quadro: monta, num canto do céu sobre a
 * base do piloto, as 5 naves da linha, uma nave com cada arma da raça e da classe, o
 * projétil de cada versão de cada arma, os efeitos passageiros (clarão, impacto, área,
 * nova, campo), as auras, o recall, os monstros, mineradores e escoltas; compila os
 * shaders de tudo (compileAsync), envia todas as texturas (initTexture) e desenha um
 * quadro com a sombra do sol em cima (o shader de sombra das naves também compila).
 * Depois tira tudo de cena. `focar(p)` põe o sol e a sombra em p (atualizar de
 * cena.js). Falha aqui não impede a entrada: o pior caso é a travada de antes.
 */
export async function aquecerGpu({ renderer, scene, camera, efeitos, focar, race, classe, meuTime = 0, tela = null, carga = null }) {
  const t0 = performance.now();
  rendererAtual = renderer;
  entradaAtual++;
  const ins = insumosDaNave(race, classe);
  const base = BASES[meuTime] ?? BASES[0];
  const ponto = new THREE.Vector3(base.x, 260, base.z);
  const grupo = new THREE.Group();
  grupo.position.copy(ponto);
  const temporarios = []; // geometrias próprias (monstros), liberadas no fim
  let n = 0;
  // Grade de 9 colunas, 15 m entre as coisas, centrada no ponto.
  const lugar = (obj, alturaExtra = 0) => {
    obj.position.set(((n % 9) - 4) * 15, alturaExtra, (Math.floor(n / 9) - 2) * 15);
    n++;
    grupo.add(obj);
    return obj;
  };
  try {
    // Naves da linha (com o primeiro par de armas) e uma nave com cada arma dos dois lados.
    for (const nave of ins.naves) {
      const obj = criarNave(race, { aliado: true, classe, tier: nave.tier });
      definirArmas(obj, ins.armas.length ? [ins.armas[0].idx, ins.armas[Math.min(1, ins.armas.length - 1)].idx] : null);
      lugar(obj);
    }
    for (const a of ins.armas) {
      const obj = criarNave(race, { aliado: false, classe, tier: 0 });
      definirArmas(obj, [a.idx, a.idx]);
      lugar(obj);
    }
    // Auras, recall, fúria, camuflagem e o anel de nível, em duas naves só para isso.
    const auras = lugar(criarNave(race, { aliado: true, classe, tier: 0 }));
    efeitos.estadoNave(auras, { dreno: true, lento: true, emp: true, furia: true, fx: ['para', 'desg', 'energia', 'invul', 'escudo', 'fraco', 'regen', 'acel'] }, 0.2, 0);
    efeitos.recall(auras, 0.5, COR_TIME.meu, 0.016, 0);
    efeitos.anelNivel(auras);
    const fantasma = lugar(criarNave(race, { aliado: true, classe, tier: 0 }));
    efeitos.estadoNave(fantasma, { fx: ['inv'] }, 0.016, 0);
    // Monstros, mineradores e escoltas (primitivas, mas com materiais próprios).
    for (const criar of [criarDrone, criarVorax, criarKrakor, criarGuardiao, () => criarMinerador({ aliado: true }), () => criarEscolta({ aliado: false })]) {
      const obj = lugar(criar());
      obj.traverse((o) => o.geometry && temporarios.push(o.geometry));
    }
    // Projétil de cada versão e golpe de cada arma, acima das naves.
    const altoProjetil = 18;
    let k = 0;
    for (const a of ins.armas) {
      const w = WEAPONS[a.kind];
      for (let nv = 1; nv <= w.versoes.length; nv++) {
        for (let prof = 0; golpeProfundo(a.kind, nv, prof); prof++) {
          const p = efeitos.armas.projetil(a.kind, nv, prof);
          p.g.position.set(((k % 24) - 12) * 5, altoProjetil + Math.floor(k / 24) * 4, -20);
          grupo.add(p.g);
          k++;
        }
      }
      // Efeitos passageiros (vão direto para a cena; saem no fim).
      const x = ponto.x + ((k % 24) - 12) * 5;
      efeitos.armas.clarao(a.kind, x, ponto.y + 10, ponto.z + 20, 1);
      efeitos.armas.impacto(a.kind, 1, 0, x, ponto.y + 10, ponto.z + 25, 4);
      efeitos.armas.area(a.kind, 1, 0, x, ponto.y + 10, ponto.z + 30, 6);
      efeitos.armas.nova(a.kind, 1, 0, x, ponto.y + 10, ponto.z + 35, 6, 0);
    }
    if (ins.armas.length) {
      const campo = efeitos.armas.campo(ins.armas[0].kind, 1, 0, 6);
      lugar(campo);
      lugar(efeitos.armas.decalque(ins.armas[0].kind, 1, 0, 3));
    }
    // Tiros dos NPCs (drones, torreta e escolta) e explosões, anéis e feixe do recall.
    efeitos.tiro({ id: 'aq-laser', kind: 'laser', x: ponto.x, y: ponto.y + 5, z: ponto.z, vx: 0, vy: 0, vz: -1, vida: 0.5 }, true);
    efeitos.tiro({ id: 'aq-plasma', kind: 'plasma', x: ponto.x + 5, y: ponto.y + 5, z: ponto.z, vx: 0, vy: 0, vz: -1, vida: 0.5 }, true);
    efeitos.tiro({ id: 'aq-torreta', kind: 'laser', x: ponto.x - 5, y: ponto.y + 5, z: ponto.z, vx: 0, vy: 0, vz: -1, vida: 0.5 }, false, COR_TIME.meu);
    efeitos.explosao(ponto.x, ponto.y + 5, ponto.z + 10, 3, '#ff9a3a');
    efeitos.anelArea(ponto.x, ponto.y + 5, ponto.z - 10, 8, COR_TIME.outro);
    efeitos.feixeRecall(ponto.x + 20, ponto.y, ponto.z, COR_TIME.meu);

    scene.add(grupo);
    grupo.updateMatrixWorld(true);
    camera.position.set(ponto.x, ponto.y + 70, ponto.z + 150);
    camera.lookAt(ponto);
    camera.updateMatrixWorld(true);
    focar(ponto);

    // Um quadro para a tela mostrar "Preparando a placa de vídeo" antes do trabalho.
    await new Promise((ok) => requestAnimationFrame(ok));
    // Compilação em paralelo só onde a placa ajuda (KHR_parallel_shader_compile); sem
    // ela o compileAsync do Three.js só avisa no console e compila igual, então vai
    // direto o compile.
    if (renderer.extensions?.has?.('KHR_parallel_shader_compile')) await renderer.compileAsync(scene, camera);
    else renderer.compile(scene, camera);
    tela?.feito('gpu');
    if (carga?.cancelado) return;
    // Texturas: as das naves e armas, as dos efeitos (todos os quadros das
    // sequências, não só o primeiro) e o brilho dos motores.
    enviarTexturas([brilho(), ...texturasDosModelos(), ...texturasEfeitoPedidas()], Infinity);
    tela?.feito('gpu');
    renderer.render(scene, camera);
    tela?.feito('gpu');
  } catch (err) {
    console.warn('Carregamento: aquecer a placa de vídeo falhou (a entrada segue):', err);
  } finally {
    scene.remove(grupo);
    for (const g of temporarios) g.dispose();
    // Os passageiros, tiros, partículas e anéis criados aqui saem de cena SEM liberar
    // os materiais: material liberado faz o Three.js apagar o programa de shader que
    // ninguém mais usa, e o próximo efeito igual compilaria de novo no meio da
    // partida. Estes ficam de reserva, segurando cada programa na placa.
    efeitos.esquecer();
    // A câmera volta à origem: o primeiro quadro de verdade a põe atrás da nave.
    camera.position.set(0, 0, 0);
    camera.rotation.set(0, 0, 0);
    if (carga) carga.msGpu = Math.round(performance.now() - t0);
  }
}

/** Existe golpe nessa profundidade (subprojétil, o que a mina dispara)? */
function golpeProfundo(kind, nv, prof) {
  let g = WEAPONS[kind]?.versoes[nv - 1]?.golpe ?? null;
  for (let i = 0; i < prof && g; i++) g = g.divide ?? g.dispara ?? null;
  return !!g;
}

/** Envia à placa as texturas já baixadas que ainda não foram (no máximo `max`). Devolve quantas faltam. */
function enviarTexturas(lista, max) {
  if (!rendererAtual) return 0;
  let feitas = 0;
  let faltam = 0;
  for (const t of lista) {
    if (!t || enviadas.has(t) || !(t.version > 0)) continue;
    if (feitas >= max) {
      faltam++;
      continue;
    }
    rendererAtual.initTexture(t);
    enviadas.add(t);
    feitas++;
  }
  return faltam;
}

// ---------- Segundo plano (naves dos outros pilotos) ----------

const feitosNoFundo = new Set(); // 'raça/classe' já pedidas
const filaFundo = [];
let rodandoFundo = 0;

/**
 * Baixa devagar, no meio da partida, a linha de naves, as armas, as texturas e os
 * sons da raça e da classe de outro piloto (chamar quando ele aparece). Uma vez por
 * raça e classe; a sua já veio na tela de carregamento. No fim, as texturas novas vão
 * para a placa aos poucos, nas folgas entre quadros.
 */
export function carregarEmFundo(race, classe, sons) {
  const chave = `${race}/${classe}`;
  if (!race || !classe || feitosNoFundo.has(chave) || !RACES[race]) return;
  feitosNoFundo.add(chave);
  let ins;
  try {
    ins = insumosDaNave(race, classe);
  } catch {
    return;
  }
  const quieto = (rotulo, fazer) => () =>
    Promise.resolve()
      .then(fazer)
      .catch((err) => console.warn(`Segundo plano: ${rotulo} não carregou:`, err?.message ?? err));
  filaFundo.push(
    ...ins.naves.map((n) => quieto(`nave ${n.url}`, () => modeloDaNave(race, classe, n.tier))),
    ...ins.armas.flatMap((a) => a.modelos.map((m) => quieto(`arma ${m}`, () => carregarArma(m)))),
    ...ins.texturas.map((t) => quieto(`textura ${t}`, () => carregarTexturaEfeito(t))),
    ...ins.sons.map((s) => quieto(`som ${s}`, () => sons?.carregar(s))),
  );
  bombearFundo();
}

function bombearFundo() {
  while (rodandoFundo < SIMULTANEOS_FUNDO && filaFundo.length) {
    const tarefa = filaFundo.shift();
    rodandoFundo++;
    tarefa().finally(() => {
      rodandoFundo--;
      if (filaFundo.length) bombearFundo();
      else if (!rodandoFundo) agendarEnvio(entradaAtual);
    });
  }
}

/** Envia as texturas do segundo plano à placa, poucas por folga do navegador. */
function agendarEnvio(entrada) {
  const folga = globalThis.requestIdleCallback ?? ((f) => setTimeout(f, 50));
  folga(() => {
    if (entrada !== entradaAtual) return; // saiu da partida no meio: a próxima entrada aquece de novo
    const faltam = enviarTexturas([...texturasDosModelos(), ...texturasEfeitoPedidas()], TEXTURAS_POR_FOLGA);
    if (faltam) agendarEnvio(entrada);
  });
}
