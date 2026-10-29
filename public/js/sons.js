// Áudio do cliente: os efeitos sonoros do AstroN original (public/sons/, ver LISTA.md)
// tocados pela Web Audio API, sem dependência.
//
// Por que Web Audio e não <audio>: tiro de metralhadora sai várias vezes por segundo e
// de várias naves ao mesmo tempo; com Web Audio cada disparo é um AudioBufferSourceNode
// barato sobre um buffer já decodificado, com ganho e pan próprios e sem atraso de rede.
//
// Decisões:
// - O navegador só deixa tocar som depois de um gesto do jogador. Criar o AudioContext
//   antes disso suja o console com aviso, então o contexto só nasce em `desbloquear()`
//   (chame no primeiro clique ou tecla). Antes disso `carregar()` já busca os arquivos
//   (só os bytes); a decodificação acontece quando o contexto existir.
// - Carregamento com cache: cada som é buscado uma vez por página. A tela de
//   carregamento (carregamento.js) pede antes da partida TODOS os sons (armas de
//   todos os pilotos, tiros de NPC e interface) e espera cada um ficar pronto (buscado
//   e decodificado): nada decodifica no meio da partida. Som que
//   falhou (404, arquivo corrompido) fica marcado e nunca quebra o jogo: `tocar` só não
//   faz nada. Som pedido que ainda não chegou também não toca (tiro com som atrasado
//   engana mais do que tiro mudo), mas o pedido já dispara o carregamento para a
//   próxima vez.
// - Posição: o jogo é visto de cima no plano x/z, então o som também. O volume cai com
//   a distância até o ouvinte (curva "inversa" da Web Audio: cheio até DISTANCIA_REF,
//   metade a 2× etc.) e some de vez perto de ALCANCE, para tiro do outro lado do mapa não
//   ocupar voz. O pan estéreo é a projeção da direção do som no lado direito do ouvinte
//   (a nave, não a câmera: na câmera de perseguição as duas olham para o mesmo lado).
//   Sem HRTF nem PannerNode: é mais barato, igual em todo navegador e suficiente para
//   saber se o tiro veio da esquerda ou da direita.
// - Nível por arquivo: os arquivos do original vieram cada um com o volume de lá (26 dB
//   entre o mais alto e o mais baixo, e a barra de volume não corrige isso). Ao decodificar,
//   cada som é medido e ganha o ganho que o leva ao volume da categoria dele (nivel-sons.js).
// - Uma voz por origem: o tiro que se repete (rajada, metralhadora, míssil de som longo)
//   empilhava até MAX_POR_SOM cópias e ficava uns 8 dB acima do tiro avulso. Com `origem`
//   (o atirador e a arma, o alvo e a arma), a voz nova corta a anterior da mesma origem
//   com uma rampa de CORTE_ORIGEM_S.
// - Limitador no canal de efeitos: quase todo arquivo chega ao teto digital, e vários
//   juntos passavam dele e estalavam. O compressor (LIMITADOR) segura a soma.
// - Limite de vozes: no máximo MAX_POR_SOM cópias do mesmo som e MAX_TOTAL no total.
//   Passou do limite do som, a voz mais antiga dele é cortada (a rajada continua
//   respondendo); passou do total, a nova só entra se for mais alta que a mais baixa
//   tocando, que então é cortada. E duas cópias do mesmo som que começariam juntas
//   (menos de INTERVALO_MIN_S) viram uma só: somadas, só estourariam o volume.
// - Voz controlada (`tocarControlado`): a carga da volta à base é um arquivo escrito em
//   cima da linha do tempo da animação; quem chama começa do ponto do progresso (`desde`),
//   move a voz junto com a nave e o ouvinte a cada quadro e a corta com rampa curta.
//   Começa mesmo baixa (longe), para subir quando a nave se aproxima, e entra nos mesmos
//   limites de vozes.
// - `atraso` (s) agenda o começo: a chegada de outra nave é desenhada no passado e o som
//   espera por ela.
// - `tom` muda a velocidade de reprodução (1 = original). `variacao` sorteia um tom em
//   volta dele (ex. 0.05 = ±5%), para a mesma metralhadora não soar como máquina de
//   repetir. Isto é cliente e só visual/sonoro: Math.random aqui não afeta a simulação.
// - Dois canais de volume, cada um com o seu ganho: efeitos (tudo o que `tocar` e
//   `tocarInterface` tocam) e música (`saidaMusica`, onde a trilha vai se ligar quando
//   existir). Os dois passam pelo mestre, que só cuida do mudo: o M desliga tudo sem
//   mexer nos dois ajustes. Volumes e mudo ficam no localStorage (dentro de try/catch:
//   navegação privada ou armazenamento bloqueado não podem impedir o jogo de abrir).
//
// Exemplo de uso (quem integrar no main.js):
//
//   import { Sons, SONS_INTERFACE, SONS_ARMA } from './sons.js';
//   const sons = new Sons();
//   sons.carregar([...Object.values(SONS_INTERFACE), 'shot_ray', 'shot_30m', 'g_impact']);
//   addEventListener('pointerdown', () => sons.desbloquear(), { once: true });
//   addEventListener('keydown', () => sons.desbloquear(), { once: true });
//   // no laço, depois de mover a câmera:
//   sons.ouvinte(minhaNave.x, minhaNave.z, minhaNave.yaw);
//   // no evento 'tiro' do servidor:
//   sons.tocar('shot_30m', { x: ev.x, z: ev.z, variacao: 0.04, origem: `t${ev.dono}` });
//   // no evento 'nivel' da própria nave:
//   sons.tocarInterface(SONS_INTERFACE.nivel);
//   // tecla de mudo:
//   sons.mudo = !sons.mudo;

import { loudnessMaxima, ganhoDeNivel } from './nivel-sons.js';

/** Sons de interface (sem posição) por situação → arquivo em public/sons/. */
export const SONS_INTERFACE = Object.freeze({
  nivel: 'level_up',
  compra: 'get_item',
  erro: 'error',
  clique: 'click',
  alerta: 'st_warn',
  painel: 'w_open',
  contagem: 'count',
  reparo: 'usehpbattery',
  energia: 'usehebattery',
});

/**
 * Volume do próprio tiro: ele toca a cada disparo, a distância zero e no centro, enquanto
 * o dos outros cai com a distância.
 */
export const VOLUME_TIRO_PROPRIO = 0.7;

/**
 * Volta à base e teleporte até o companheiro: sons nossos, gerados por tools/sons_volta.py
 * em cima da linha do tempo de volta-regras.js (a carga, que o jogo toca do ponto do
 * progresso; o cancelamento; a nave sumindo; a nave chegando, também no teleporte).
 */
export const SONS_VOLTA = Object.freeze({
  canal: 'volta_canal',
  cancela: 'volta_cancela',
  partida: 'volta_partida',
  chegada: 'volta_chegada',
});

/**
 * Sons do mundo por situação → arquivo, para quem ligar os eventos do jogo.
 * As armas novas devem usar o som do original (coluna de disparo de inititemweapon.cfg,
 * ver public/sons/LISTA.md); aqui ficam os padrões por família.
 */
export const SONS_ARMA = Object.freeze({
  feixe: 'shot_ray',
  feixePesado: 'shot_ray4',
  feixeTeleguiado: 'shot_ray_hm',
  perfurante: 'laser1',
  metralhadora: 'shot_30m',
  canhao: 'shot_cc',
  missil: 'shot_ct',
  nova: 'shot_nova',
  onda: 'shot_fxsph',
  raio: 'volt',
  mina: 'u_mine',
  impactoFeixe: 'g_impact',
  impactoBala: 'b_impact',
  explosao: 'c_explo',
  explosaoNave: 'h_explo',
  paralisia: 'off_device2',
  descarga: 'extra2',
  boost: 'hyper',
});

export const PASTA_SONS = '/sons/';
export const EXTENSAO_SONS = '.wav';
/** Até aqui (m) o som toca cheio. */
export const DISTANCIA_REF = 60;
/** Além disto (m) o som não toca. */
export const ALCANCE = 900;
/** Quanto a curva inversa cai depois de DISTANCIA_REF. */
export const QUEDA = 1;
export const MAX_POR_SOM = 6;
export const MAX_TOTAL = 24;
/** Mesma fonte começando a menos disto (s) de outra igual vira uma só. */
export const INTERVALO_MIN_S = 0.025;
/** Rampa (s) com que a voz nova da mesma origem corta a anterior. */
export const CORTE_ORIGEM_S = 0.06;
/** Teto do ganho de uma voz (distância × volume × nível). */
const GANHO_VOZ_MAX = 8;
/** Compressor na saída dos efeitos (DynamicsCompressorNode), quase um limitador. */
export const LIMITADOR = Object.freeze({ threshold: -8, knee: 6, ratio: 12, attack: 0.003, release: 0.25 });
/** Abaixo disto o som nem é tocado. */
const GANHO_MIN = 0.01;
// A chave dos efeitos é a do antigo volume geral, para quem já tinha ajustado.
const CHAVE_EFEITOS = 'astron.som.volume';
const CHAVE_MUSICA = 'astron.som.musica';
const CHAVE_MUDO = 'astron.som.mudo';
/** Volume de cada canal na primeira vez (0 a 1). */
export const VOLUME_EFEITOS_PADRAO = 0.8;
export const VOLUME_MUSICA_PADRAO = 0.6;

/**
 * Ganho pela distância: 1 até `ref`, curva inversa depois, zero em `alcance`
 * (com os últimos 20% suavizados para o som não sumir de repente).
 */
export function ganhoPorDistancia(d, ref = DISTANCIA_REF, alcance = ALCANCE, queda = QUEDA) {
  if (!(d >= 0)) return 0;
  if (d >= alcance) return 0;
  const inverso = d <= ref ? 1 : ref / (ref + queda * (d - ref));
  const inicioFade = alcance * 0.8;
  if (d <= inicioFade) return inverso;
  const t = (d - inicioFade) / (alcance - inicioFade);
  return inverso * (1 - t * t * (3 - 2 * t));
}

/**
 * Pan estéreo (-1 esquerda, +1 direita) de um som em (x, z) para um ouvinte em
 * (ox, oz) olhando para `yaw` (frente = (-sin yaw, -cos yaw), como em shared/sim.js).
 * Perto demais do ouvinte o pan vai para o centro, para o próprio tiro não pular de lado.
 */
export function panPorDirecao(x, z, ox, oz, yaw) {
  const dx = x - ox;
  const dz = z - oz;
  const d = Math.hypot(dx, dz);
  if (d < 1e-6) return 0;
  const direita = (dx * Math.cos(yaw) - dz * Math.sin(yaw)) / d;
  const perto = Math.min(1, d / 15);
  return Math.max(-1, Math.min(1, direita * 0.8 * perto));
}

function lerArmazenado(chave) {
  try {
    return globalThis.localStorage?.getItem(chave) ?? null;
  } catch {
    return null;
  }
}

/** Volume de 0 a 1 guardado em `chave`, ou `padrao` se não houver um válido. */
function lerVolume(chave, padrao) {
  const txt = lerArmazenado(chave);
  const v = Number(txt);
  return txt !== null && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : padrao;
}

function gravarArmazenado(chave, valor) {
  try {
    globalThis.localStorage?.setItem(chave, String(valor));
  } catch {
    // Sem armazenamento: o ajuste vale só nesta sessão.
  }
}

export class Sons {
  /**
   * @param {{ pasta?: string, extensao?: string, maxPorSom?: number, maxTotal?: number,
   *   criarContexto?: () => AudioContext, buscar?: typeof fetch }} [opcoes]
   *   `criarContexto` e `buscar` existem para os testes trocarem o navegador por dublês.
   */
  constructor({
    pasta = PASTA_SONS,
    extensao = EXTENSAO_SONS,
    maxPorSom = MAX_POR_SOM,
    maxTotal = MAX_TOTAL,
    criarContexto = null,
    buscar = null,
  } = {}) {
    this.pasta = pasta;
    this.extensao = extensao;
    this.maxPorSom = maxPorSom;
    this.maxTotal = maxTotal;
    this._criarContexto = criarContexto ?? (() => {
      const Ctx = globalThis.AudioContext ?? globalThis.webkitAudioContext;
      return Ctx ? new Ctx() : null;
    });
    this._buscar = buscar ?? ((url) => globalThis.fetch(url));
    this.ctx = null;
    this.mestre = null;
    this.efeitos = null;
    this.limitador = null;
    this.musica = null;
    /** nome → { bytes: Promise<ArrayBuffer|null>, buffer: AudioBuffer|null, nivel, falhou, decodificando } */
    this._cache = new Map();
    /** Vozes tocando: { nome, origem, fonte, ganho, valor, inicio } */
    this._vozes = [];
    this._ouvinte = { x: 0, z: 0, yaw: 0 };
    this._volumeEfeitos = lerVolume(CHAVE_EFEITOS, VOLUME_EFEITOS_PADRAO);
    this._volumeMusica = lerVolume(CHAVE_MUSICA, VOLUME_MUSICA_PADRAO);
    this._mudo = lerArmazenado(CHAVE_MUDO) === '1';
  }

  /** Cria (ou retoma) o AudioContext. Chame dentro de um gesto do jogador. */
  desbloquear() {
    if (!this.ctx) {
      try {
        this.ctx = this._criarContexto();
      } catch {
        this.ctx = null;
      }
      if (!this.ctx) return;
      this.mestre = this.ctx.createGain();
      this.mestre.gain.value = this._mudo ? 0 : 1;
      this.mestre.connect(this.ctx.destination);
      this.efeitos = this.ctx.createGain();
      this.efeitos.gain.value = this._volumeEfeitos;
      this.limitador = this.ctx.createDynamicsCompressor?.() ?? null;
      if (this.limitador) {
        for (const [k, v] of Object.entries(LIMITADOR)) this.limitador[k].value = v;
        this.efeitos.connect(this.limitador);
        this.limitador.connect(this.mestre);
      } else this.efeitos.connect(this.mestre);
      this.musica = this.ctx.createGain();
      this.musica.gain.value = this._volumeMusica;
      this.musica.connect(this.mestre);
      for (const nome of this._cache.keys()) this._decodificar(nome);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume?.().catch(() => {});
  }

  /** True depois do desbloqueio, com o contexto rodando. */
  get pronto() {
    return !!this.ctx && this.ctx.state !== 'suspended' && this.ctx.state !== 'closed';
  }

  /**
   * Busca (e, se já houver contexto, decodifica) os sons. Pode ser chamado de novo
   * com nomes repetidos: o que já está em cache não é buscado outra vez.
   * @param {string[]|string} nomes nomes sem extensão (ex. 'shot_ray')
   * @returns {Promise<void>} resolve quando todos terminarem, com ou sem falha
   */
  carregar(nomes) {
    const lista = Array.isArray(nomes) ? nomes : [nomes];
    return Promise.all(lista.map((nome) => this._carregar(nome))).then(() => {});
  }

  /** Ganho de nível do som (1 antes de decodificar ou sem alvo; ver nivel-sons.js). */
  nivel(nome) {
    return this._cache.get(nome)?.nivel ?? 1;
  }

  /** True se o som está decodificado e pronto para tocar. */
  carregado(nome) {
    return !!this._cache.get(nome)?.buffer;
  }

  /** True se o som foi pedido e não deu para buscar ou decodificar (a tela de carregamento avisa no console). */
  falhou(nome) {
    return !!this._cache.get(nome)?.falhou;
  }

  _carregar(nome) {
    let item = this._cache.get(nome);
    if (!item) {
      item = { bytes: null, buffer: null, nivel: 1, falhou: false, decodificando: null };
      item.bytes = Promise.resolve()
        .then(() => this._buscar(this.pasta + nome + this.extensao))
        .then((r) => {
          if (!r || !r.ok) throw new Error(`som ${nome}: ${r?.status}`);
          return r.arrayBuffer();
        })
        .catch(() => {
          item.falhou = true;
          return null;
        });
      this._cache.set(nome, item);
    }
    return this.ctx ? this._decodificar(nome) : item.bytes;
  }

  _decodificar(nome) {
    const item = this._cache.get(nome);
    if (!item || item.buffer || item.falhou) return Promise.resolve();
    if (item.decodificando) return item.decodificando;
    const ctx = this.ctx;
    item.decodificando = item.bytes
      .then((bytes) => {
        if (!bytes) return null;
        // decodeAudioData consome o ArrayBuffer: decodifica uma cópia, e só uma vez.
        return new Promise((ok, erro) => {
          const p = ctx.decodeAudioData(bytes.slice(0), ok, erro);
          if (p?.then) p.then(ok, erro);
        });
      })
      .then((buffer) => {
        if (!buffer) {
          item.falhou = true;
          return;
        }
        item.nivel = nivelDoBuffer(nome, buffer);
        item.buffer = buffer;
      })
      .catch(() => {
        item.falhou = true;
      });
    return item.decodificando;
  }

  /** Posição e direção de quem ouve (a própria nave). Chame a cada quadro. */
  ouvinte(x, z, yaw) {
    this._ouvinte.x = x;
    this._ouvinte.z = z;
    this._ouvinte.yaw = yaw;
  }

  /** Volume dos efeitos (tiros, impactos, interface) de 0 a 1, guardado no navegador. */
  get volumeEfeitos() {
    return this._volumeEfeitos;
  }

  set volumeEfeitos(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return;
    this._volumeEfeitos = Math.max(0, Math.min(1, n));
    gravarArmazenado(CHAVE_EFEITOS, this._volumeEfeitos);
    this._aplicarGanho(this.efeitos, this._volumeEfeitos);
  }

  /** Volume da música de 0 a 1, guardado no navegador. */
  get volumeMusica() {
    return this._volumeMusica;
  }

  set volumeMusica(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return;
    this._volumeMusica = Math.max(0, Math.min(1, n));
    gravarArmazenado(CHAVE_MUSICA, this._volumeMusica);
    this._aplicarGanho(this.musica, this._volumeMusica);
  }

  /**
   * Onde a música se liga (já com o volume da música e o mudo aplicados); null antes
   * do desbloqueio.
   */
  get saidaMusica() {
    return this.musica;
  }

  /** Mudo, guardado no navegador. */
  get mudo() {
    return this._mudo;
  }

  set mudo(m) {
    this._mudo = !!m;
    gravarArmazenado(CHAVE_MUDO, this._mudo ? '1' : '0');
    this._aplicarGanho(this.mestre, this._mudo ? 0 : 1);
  }

  _aplicarGanho(no, alvo) {
    if (!no) return;
    const g = no.gain;
    // Rampa curta: arrastar a barra aos saltos não estala.
    if (g.setTargetAtTime) g.setTargetAtTime(alvo, this.ctx.currentTime, 0.02);
    else g.value = alvo;
  }

  /**
   * Toca um som no mundo.
   * @param {string} nome arquivo sem extensão
   * @param {{ x?: number, z?: number, volume?: number, tom?: number, variacao?: number,
   *   atraso?: number, origem?: string }} [opcoes]
   *   sem x/z o som toca no ouvinte (cheio e no centro); `origem` (ex. o atirador e a
   *   arma): a voz nova corta a anterior da mesma origem
   * @returns {boolean} se tocou
   */
  tocar(nome, { x, z, volume = 1, tom = 1, variacao = 0, atraso = 0, origem = null } = {}) {
    const [ganho, pan] = this._posicao(x, z, volume);
    return !!this._tocar(nome, ganho, pan, tom, variacao, { atraso, origem });
  }

  /** Toca um som de interface: sem posição, cheio e no centro. */
  tocarInterface(nome, { volume = 1, tom = 1, atraso = 0 } = {}) {
    return !!this._tocar(nome, volume, 0, tom, 0, { atraso });
  }

  /**
   * Toca um som que quem chamou controla, a partir de `desde` s do arquivo (sem x/z, no
   * ouvinte). Devolve a voz, `{ mover(x, z, volume), parar(s) }`, ou null se não deu
   * para tocar (sem contexto, som não carregado, vozes cheias de sons mais altos).
   */
  tocarControlado(nome, { x, z, volume = 1, desde = 0 } = {}) {
    const [ganho, pan] = this._posicao(x, z, volume);
    const voz = this._tocar(nome, ganho, pan, 1, 0, { desde, controlado: true });
    if (!voz) return null;
    return {
      mover: (nx, nz, nv = volume) => {
        if (!this._vozes.includes(voz)) return;
        const [g, p] = this._posicao(nx, nz, nv);
        const t = this.ctx.currentTime;
        voz.valor = g * this.nivel(nome);
        voz.ganho.gain.setTargetAtTime?.(Math.min(voz.valor, GANHO_VOZ_MAX), t, 0.05);
        voz.pan?.pan.setTargetAtTime?.(p, t, 0.05);
      },
      parar: (fade = 0.04) => {
        if (!this._vozes.includes(voz)) return;
        try {
          const t = this.ctx.currentTime;
          voz.ganho.gain.setTargetAtTime?.(0, t, fade / 3);
          voz.fonte.stop(t + fade * 1.5);
        } catch {
          // Já tinha parado.
        }
        this._soltar(voz);
      },
    };
  }

  /** Ganho pela distância e pan de um som em (x, z); sem posição, cheio e no centro. */
  _posicao(x, z, volume) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return [volume, 0];
    const o = this._ouvinte;
    return [volume * ganhoPorDistancia(Math.hypot(x - o.x, z - o.z)), panPorDirecao(x, z, o.x, o.z, o.yaw)];
  }

  _tocar(nome, ganho, pan, tom, variacao, { atraso = 0, desde = 0, controlado = false, origem = null } = {}) {
    if ((!controlado && ganho < GANHO_MIN) || !this.ctx || this.ctx.state === 'closed') return null;
    const item = this._cache.get(nome);
    if (!item) {
      this._carregar(nome);
      return null;
    }
    if (!item.buffer) return null;
    const agora = this.ctx.currentTime;
    this._limpar(agora);
    // Daqui em diante o ganho é o que se ouve: com o nível do arquivo.
    ganho *= item.nivel;
    if (origem !== null) {
      const anterior = this._vozes.find((v) => v.origem === origem);
      if (anterior) this._parar(anterior, CORTE_ORIGEM_S);
    }

    const mesmas = this._vozes.filter((v) => v.nome === nome);
    // Duas cópias começando juntas só somam volume: fica a mais alta.
    const junto = controlado ? null : mesmas.find((v) => Math.abs(agora + atraso - v.inicio) < INTERVALO_MIN_S);
    if (junto) {
      if (ganho <= junto.valor) return null;
      this._parar(junto);
    } else if (mesmas.length >= this.maxPorSom) {
      this._parar(mesmas[0]);
    }
    if (this._vozes.length >= this.maxTotal) {
      let menor = this._vozes[0];
      for (const v of this._vozes) if (v.valor < menor.valor) menor = v;
      if (ganho <= menor.valor) return null;
      this._parar(menor);
    }

    const fonte = this.ctx.createBufferSource();
    fonte.buffer = item.buffer;
    const sorteio = variacao > 0 ? 1 + (Math.random() * 2 - 1) * variacao : 1;
    fonte.playbackRate.value = Math.max(0.25, Math.min(4, tom * sorteio));
    const g = this.ctx.createGain();
    g.gain.value = Math.min(ganho, GANHO_VOZ_MAX);
    let saida = g;
    let p = null;
    if ((pan !== 0 || controlado) && this.ctx.createStereoPanner) {
      p = this.ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p);
      saida = p;
    }
    fonte.connect(g);
    saida.connect(this.efeitos);
    // `inicio` é quando o começo do arquivo tocaria: a conta do fim (_limpar) vale com
    // atraso e com `desde`.
    const desdeOk = Math.max(0, Math.min(desde, item.buffer.duration ?? 0));
    const voz = { nome, origem, fonte, ganho: g, pan: p, saida, valor: ganho, inicio: agora + atraso - desdeOk / fonte.playbackRate.value };
    fonte.onended = () => {
      this._soltar(voz);
      this._desligar(voz);
    };
    this._vozes.push(voz);
    fonte.start(agora + atraso, desdeOk);
    return voz;
  }

  /** Quantas vozes estão tocando (para depuração e testes). */
  get vozes() {
    if (this.ctx) this._limpar(this.ctx.currentTime);
    return this._vozes.length;
  }

  _limpar(agora) {
    // Rede de segurança caso algum onended não dispare (aba em segundo plano).
    this._vozes = this._vozes.filter((v) => {
      const dur = (v.fonte.buffer?.duration ?? 0) / (v.fonte.playbackRate?.value || 1);
      if (agora - v.inicio <= dur + 0.25 || agora < v.inicio) return true;
      this._desligar(v);
      return false;
    });
  }

  _parar(voz, rampa = 0.024) {
    try {
      // Corte com rampa curta: parar no meio da onda estala.
      const t = this.ctx.currentTime;
      voz.ganho.gain.setTargetAtTime?.(0, t, rampa / 3);
      voz.fonte.stop(t + rampa * 1.6);
    } catch {
      // Já tinha parado.
    }
    this._soltar(voz);
  }

  _soltar(voz) {
    const i = this._vozes.indexOf(voz);
    if (i >= 0) this._vozes.splice(i, 1);
  }

  _desligar(voz) {
    try {
      voz.fonte.disconnect();
      voz.saida.disconnect();
    } catch {
      // Nada conectado.
    }
  }
}

/** Ganho de nível de um AudioBuffer decodificado (1 se não dá para ler as amostras). */
function nivelDoBuffer(nome, buffer) {
  try {
    const canais = [];
    for (let c = 0; c < (buffer.numberOfChannels ?? 0); c++) canais.push(buffer.getChannelData(c));
    return canais.length ? ganhoDeNivel(nome, loudnessMaxima(canais, buffer.sampleRate)) : 1;
  } catch {
    return 1;
  }
}
