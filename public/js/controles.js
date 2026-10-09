// Controles: teclado no PC e joystick virtual + botões na tela de toque, no mesmo
// esquema do AstroN no celular (analógico à esquerda; Z, X e SHIFT à direita).
// ler() devolve o comando do passo atual no formato de shared/sim.js.

const TECLAS = {
  frente: ['KeyW', 'ArrowUp'],
  re: ['KeyS', 'ArrowDown'],
  esq: ['KeyA', 'ArrowLeft'],
  dir: ['KeyD', 'ArrowRight'],
  boost: ['ShiftLeft', 'ShiftRight'],
  laser: ['KeyZ', 'Space', 'KeyJ'],
  plasma: ['KeyX', 'KeyK'],
};

export class Controles {
  constructor(raiz) {
    this.apertadas = new Set();
    this.toque = { th: 0, tu: 0, b: false, f1: false, f2: false };
    addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;
      this.apertadas.add(e.code);
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.apertadas.delete(e.code));
    addEventListener('blur', () => this.apertadas.clear());
    if (matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window) this.#montarToque(raiz);
  }

  #tecla(acao) {
    return TECLAS[acao].some((c) => this.apertadas.has(c));
  }

  #montarToque(raiz) {
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
    });
    stick.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) if (t.identifier === dedo) mover(t);
      e.preventDefault();
    });
    const soltar = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== dedo) continue;
        dedo = null;
        pino.style.transform = '';
        this.toque.th = this.toque.tu = 0;
      }
    };
    stick.addEventListener('touchend', soltar);
    stick.addEventListener('touchcancel', soltar);

    for (const [id, campo] of [
      ['#btn-z', 'f1'],
      ['#btn-x', 'f2'],
      ['#btn-shift', 'b'],
    ]) {
      const btn = raiz.querySelector(id);
      btn.addEventListener('touchstart', (e) => {
        this.toque[campo] = true;
        btn.classList.add('ativo');
        e.preventDefault();
      });
      const fim = () => {
        this.toque[campo] = false;
        btn.classList.remove('ativo');
      };
      btn.addEventListener('touchend', fim);
      btn.addEventListener('touchcancel', fim);
    }
  }

  /** Comando do passo atual. */
  ler() {
    const th = (this.#tecla('frente') ? 1 : 0) - (this.#tecla('re') ? 1 : 0) || this.toque.th;
    const tu = (this.#tecla('esq') ? 1 : 0) - (this.#tecla('dir') ? 1 : 0) || this.toque.tu;
    return {
      th: Math.round(th * 100) / 100,
      tu: Math.round(tu * 100) / 100,
      b: this.#tecla('boost') || this.toque.b,
      f1: this.#tecla('laser') || this.toque.f1,
      f2: this.#tecla('plasma') || this.toque.f2,
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
