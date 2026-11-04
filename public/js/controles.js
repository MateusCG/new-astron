// Controles: teclado e controle (joystick) no PC e joystick virtual + botões na tela
// de toque, no mesmo esquema do AstroN no celular (analógico à esquerda; Z, X, SHIFT e
// pouso à direita, e BASE, o recall, ao lado do pouso).
// ler() devolve o comando do passo atual no formato de shared/sim.js.
//
// As teclas e os botões do controle de cada ação vêm do mapa que o piloto configura
// (atalhos.js, aba Configurações); o controle é lido por joystick.js, com o
// analógico de verdade no acelerar e no girar.
//
// Todos os listeners (globais e dos botões de toque, que ficam no HTML fixo da
// página) são registrados com o mesmo AbortController: destruir() desliga tudo de
// uma vez. Sem isso, sair para a tela inicial e entrar de novo somaria um segundo
// conjunto de listeners, e cada toque contaria duas vezes.

import { aoApertar, teclaFaz, teclaNoMapa, campoDeTexto } from './atalhos.js';
import { valorJoystick } from './joystick.js';

/** Teclas que o navegador usaria (rolar a página, passar o foco): o jogo segura. */
const TECLAS_DO_NAVEGADOR = new Set(['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End']);

const CAM_VEL = 0.7; // rad/s com T ou G seguradas

export class Controles {
  constructor(raiz) {
    this.raiz = raiz;
    this.parar = new AbortController();
    const signal = this.parar.signal;
    this.apertadas = new Set();
    // Toques curtos (pouso) ficam guardados até o próximo passo ler: um L rápido que
    // cai entre dois quadros (celular lento, aba pesada) não pode se perder.
    this.pulsoPouso = false;
    this.pulsoRecall = false; // B (recall): também um pulso, lido na borda pelo servidor
    this.toque = { th: 0, tu: 0, b: false, f1: false, f2: false, p: false };
    this.pulsoCamera = false; // troca de câmera (V): um pulso lido no quadro
    addEventListener('keydown', (e) => {
      if (campoDeTexto(e.target)) return;
      this.apertadas.add(e.code);
      if (TECLAS_DO_NAVEGADOR.has(e.code) && teclaNoMapa(e.code)) e.preventDefault();
    }, { signal });
    aoApertar('pouso', () => (this.pulsoPouso = true), { signal });
    aoApertar('recall', () => (this.pulsoRecall = true), { signal });
    aoApertar('camTroca', () => (this.pulsoCamera = true), { signal });
    addEventListener('keyup', (e) => this.apertadas.delete(e.code), { signal });
    // Roda do mouse sobre o jogo (não sobre um painel que rola): sobe e desce a
    // câmera. Acumula até o laço ler (rodaCamera).
    this.roda = 0;
    addEventListener(
      'wheel',
      (e) => {
        if (e.target.closest?.('#servico, #entrada, #volume')) return;
        this.roda += Math.sign(e.deltaY);
      },
      { signal, passive: true },
    );
    addEventListener('blur', () => this.apertadas.clear(), { signal });
    if (matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window) this.#montarToque(raiz, signal);
  }

  /** Desliga teclado e toque e solta tudo o que estava apertado (saída da partida). */
  destruir() {
    this.parar.abort();
    this.apertadas.clear();
    this.pulsoPouso = false;
    this.pulsoRecall = false;
    this.pulsoCamera = false;
    this.roda = 0;
    this.toque = { th: 0, tu: 0, b: false, f1: false, f2: false, p: false };
    this.raiz.classList.remove('toque');
    const pino = this.raiz.querySelector?.('#stick .pino');
    if (pino) pino.style.transform = '';
    for (const btn of this.raiz.querySelectorAll?.('#botoes .ativo') ?? []) btn.classList.remove('ativo');
  }

  /** A ação está segurada no teclado? */
  #tecla(acao) {
    for (const c of this.apertadas) if (teclaFaz(acao, c)) return true;
    return false;
  }

  /** A ação segurada no teclado (1) ou no controle (0 a 1). */
  #valor(acao) {
    return this.#tecla(acao) ? 1 : valorJoystick(acao);
  }

  /** A ação segurada no teclado ou no controle (passa da metade)? */
  #segura(acao) {
    return this.#tecla(acao) || valorJoystick(acao) >= 0.5;
  }

  #montarToque(raiz, signal) {
    raiz.classList.add('toque');
    const stick = raiz.querySelector('#stick');
    const pino = stick.querySelector('.pino');
    let dedo = null;
    const mover = (t) => {
      const r = stick.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const raio = r.width / 2;
      let dx = (t.clientX - cx) / raio;
      let dy = (t.clientY - cy) / raio;
      const m = Math.hypot(dx, dy);
      if (m > 1) {
        dx /= m;
        dy /= m;
      }
      pino.style.transform = `translate(${dx * raio * 0.6}px, ${dy * raio * 0.6}px)`;
      this.toque.th = Math.abs(dy) < 0.15 ? 0 : -dy;
      this.toque.tu = Math.abs(dx) < 0.15 ? 0 : -dx;
    };
    stick.addEventListener('touchstart', (e) => {
      dedo = e.changedTouches[0].identifier;
      mover(e.changedTouches[0]);
      e.preventDefault();
    }, { signal });
    stick.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) if (t.identifier === dedo) mover(t);
      e.preventDefault();
    }, { signal });
    const soltar = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== dedo) continue;
        dedo = null;
        pino.style.transform = '';
        this.toque.th = this.toque.tu = 0;
      }
    };
    stick.addEventListener('touchend', soltar, { signal });
    stick.addEventListener('touchcancel', soltar, { signal });

    for (const [id, campo] of [
      ['#btn-z', 'f1'],
      ['#btn-x', 'f2'],
      ['#btn-shift', 'b'],
      ['#btn-pouso', 'p'],
      ['#btn-recall', 'r'],
    ]) {
      const btn = raiz.querySelector(id);
      btn.addEventListener('touchstart', (e) => {
        this.toque[campo] = true;
        if (campo === 'p') this.pulsoPouso = true;
        if (campo === 'r') this.pulsoRecall = true;
        btn.classList.add('ativo');
        e.preventDefault();
      }, { signal });
      const fim = () => {
        this.toque[campo] = false;
        btn.classList.remove('ativo');
      };
      btn.addEventListener('touchend', fim, { signal });
      btn.addEventListener('touchcancel', fim, { signal });
    }
  }

  /** Comando do passo atual. */
  ler() {
    // Pouso vai como pulso de um passo só (a simulação alterna na borda do botão).
    const p = this.pulsoPouso && !this.pousoEnviado;
    this.pousoEnviado = p;
    if (p) this.pulsoPouso = false;
    const r = this.pulsoRecall && !this.recallEnviado;
    this.recallEnviado = r;
    if (r) this.pulsoRecall = false;
    const th = this.#valor('frente') - this.#valor('re') || this.toque.th;
    const tu = this.#valor('esq') - this.#valor('dir') || this.toque.tu;
    return {
      th: Math.round(th * 100) / 100,
      tu: Math.round(tu * 100) / 100,
      b: this.#segura('boost') || this.toque.b,
      f1: this.#segura('armaZ') || this.toque.f1,
      f2: this.#segura('armaX') || this.toque.f2,
      p,
      r,
    };
  }

  /**
   * Quanto subir (+) ou descer (−) o ângulo da câmera neste quadro, em radianos: T
   * ou PageUp e G ou PageDown seguradas (ou o analógico direito do controle) dão até
   * ±CAM_VEL rad/s, e cada passo da roda do mouse um degrau (roda para cima sobe a
   * câmera, para baixo desce).
   */
  ajusteCamera(dt) {
    let v = this.#valor('camCima') - this.#valor('camBaixo');
    v *= CAM_VEL * dt;
    v -= this.roda * 0.08; // roda para cima (deltaY < 0) sobe a câmera
    this.roda = 0;
    return v;
  }

  /** Trocou a câmera (V ou o botão do controle) desde a última chamada? */
  trocouCamera() {
    const t = this.pulsoCamera;
    this.pulsoCamera = false;
    return t;
  }
}
