// Controles: teclado no PC e joystick virtual + botões na tela de toque, no mesmo
// esquema do AstroN no celular (analógico à esquerda; Z, X, SHIFT e pouso à direita).
// ler() devolve o comando do passo atual no formato de shared/sim.js.
//
// Todos os listeners (globais e dos botões de toque, que ficam no HTML fixo da
// página) são registrados com o mesmo AbortController: destruir() desliga tudo de
// uma vez. Sem isso, sair para a tela inicial e entrar de novo somaria um segundo
// conjunto de listeners, e cada toque contaria duas vezes.

const TECLAS = {
  frente: ['KeyW', 'ArrowUp'],
  re: ['KeyS', 'ArrowDown'],
  esq: ['KeyA', 'ArrowLeft'],
  dir: ['KeyD', 'ArrowRight'],
  boost: ['ShiftLeft', 'ShiftRight'],
  laser: ['KeyZ', 'Space', 'KeyJ'],
  plasma: ['KeyX', 'KeyK'],
  pouso: ['KeyL'],
};

export class Controles {
  constructor(raiz) {
    this.raiz = raiz;
    this.parar = new AbortController();
    const signal = this.parar.signal;
    this.apertadas = new Set();
    // Toques curtos (pouso) ficam guardados até o próximo passo ler: um L rápido que
    // cai entre dois quadros (celular lento, aba pesada) não pode se perder.
    this.pulsoPouso = false;
    this.toque = { th: 0, tu: 0, b: false, f1: false, f2: false, p: false };
    addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;
      this.apertadas.add(e.code);
      if (TECLAS.pouso.includes(e.code) && !e.repeat) this.pulsoPouso = true;
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    }, { signal });
    addEventListener('keyup', (e) => this.apertadas.delete(e.code), { signal });
    addEventListener('blur', () => this.apertadas.clear(), { signal });
    if (matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window) this.#montarToque(raiz, signal);
  }

  /** Desliga teclado e toque e solta tudo o que estava apertado (saída da partida). */
  destruir() {
    this.parar.abort();
    this.apertadas.clear();
    this.pulsoPouso = false;
    this.toque = { th: 0, tu: 0, b: false, f1: false, f2: false, p: false };
    this.raiz.classList.remove('toque');
    const pino = this.raiz.querySelector?.('#stick .pino');
    if (pino) pino.style.transform = '';
    for (const btn of this.raiz.querySelectorAll?.('#botoes .ativo') ?? []) btn.classList.remove('ativo');
  }

  #tecla(acao) {
    return TECLAS[acao].some((c) => this.apertadas.has(c));
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
    ]) {
      const btn = raiz.querySelector(id);
      btn.addEventListener('touchstart', (e) => {
        this.toque[campo] = true;
        if (campo === 'p') this.pulsoPouso = true;
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
    const th = (this.#tecla('frente') ? 1 : 0) - (this.#tecla('re') ? 1 : 0) || this.toque.th;
    const tu = (this.#tecla('esq') ? 1 : 0) - (this.#tecla('dir') ? 1 : 0) || this.toque.tu;
    return {
      th: Math.round(th * 100) / 100,
      tu: Math.round(tu * 100) / 100,
      b: this.#tecla('boost') || this.toque.b,
      f1: this.#tecla('laser') || this.toque.f1,
      f2: this.#tecla('plasma') || this.toque.f2,
      p,
    };
  }

  /** Alternou a distância da câmera (tecla V) desde a última chamada? */
  trocouCamera() {
    if (this.apertadas.has('KeyV')) {
      this.apertadas.delete('KeyV');
      return true;
    }
    return false;
  }
}
