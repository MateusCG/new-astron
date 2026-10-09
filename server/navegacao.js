// Navegação dos monstros pelo labirinto de cânions (só no servidor).
//
// Ir em linha reta até o jogador prende o monstro na primeira parede: o M1 é uma rede
// de corredores. Por isso o mapa vira uma grade de CELULA metros, calculada uma vez a
// partir de heightAt, com a mesma regra de rampa da nave (MAX_SLOPE de shared/sim.js):
// de uma célula para a vizinha só se passa se a subida não for íngreme demais, e
// descer é sempre livre (a nave também despenca de um planalto, mas não escala a
// parede). Não basta "chão baixo = corredor": os cânions se ligam por selas e rampas
// que a nave sobe, e uma grade só de altura deixaria metade do mapa sem caminho.
//
// Sobre essa grade roda um Dijkstra com várias fontes (os jogadores caçáveis), que dá,
// para cada célula, o custo do caminho até o jogador mais próximo e qual jogador é
// esse. Um campo só serve para todos os monstros: cada um desce o "morro" do custo a
// partir de onde está.
//
// Detalhes que fazem a coisa funcionar de verdade:
// - Célula perto de parede custa mais (CUSTO_BEIRA), para o caminho ir pelo meio do
//   corredor e o monstro não ficar raspando nas quinas.
// - Diagonal só vale se os dois passos retos do lado também valem (sem cortar quina).
// - O monstro não mira a próxima célula, e sim o ponto mais adiante no caminho que
//   ele alcança em linha livre (até OLHAR_CELULAS): a curva sai suave.
// - A zona segura da base entra na grade como bloqueada, para nenhum caminho passar
//   por dentro dela.

import { heightAt, MAP_HALF, BASE } from '../shared/terrain.js';
import { MAX_SLOPE } from '../shared/sim.js';

export const CELULA = 10; // metros por célula da grade
const FOLGA_RAMPA = 0.85; // fração de MAX_SLOPE aceita na grade (margem para a física)
const CUSTO_BEIRA = [6, 3, 1]; // custo extra a 0, 1 e 2 células de uma parede
const OLHAR_CELULAS = 6; // até quantas células adiante o monstro mira
const PASSO_LINHA = 2.5; // metros entre amostras do teste de linha livre

// Vizinhos na ordem dos bits da máscara de passagem. Os quatro primeiros são retos.
const VIZ = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];
const OPOSTO = VIZ.map(([a, b]) => VIZ.findIndex(([c, d]) => c === -a && d === -b));
const RETOS_DA_DIAGONAL = VIZ.map(([a, b], k) =>
  k < 4 ? null : [VIZ.findIndex(([c, d]) => c === a && d === 0), VIZ.findIndex(([c, d]) => c === 0 && d === b)],
);
const COMPRIMENTO = VIZ.map(([a, b]) => (a && b ? Math.SQRT2 : 1));
const VIZ_I = VIZ.map(([a]) => a);
const VIZ_J = VIZ.map(([, b]) => b);
const BIT_OPOSTO = OPOSTO.map((k) => 1 << k);

/**
 * Fila de prioridade mínima (heap binário em arrays tipados) para o Dijkstra.
 * Aceita a mesma célula mais de uma vez; quem tira descarta a entrada velha.
 */
class Heap {
  constructor(capacidade = 1024) {
    this.k = new Float64Array(capacidade);
    this.v = new Int32Array(capacidade);
    this.n = 0;
    this.ultimaChave = 0;
  }
  get vazio() {
    return this.n === 0;
  }
  push(chave, valor) {
    if (this.n === this.k.length) {
      const k = new Float64Array(this.n * 2);
      const v = new Int32Array(this.n * 2);
      k.set(this.k);
      v.set(this.v);
      this.k = k;
      this.v = v;
    }
    const k = this.k;
    const v = this.v;
    let i = this.n++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= chave) break;
      k[i] = k[p];
      v[i] = v[p];
      i = p;
    }
    k[i] = chave;
    v[i] = valor;
  }
  /** Tira o menor e devolve o valor; a chave dele fica em ultimaChave. */
  pop() {
    const k = this.k;
    const v = this.v;
    const topoK = k[0];
    const topoV = v[0];
    const n = --this.n;
    if (n > 0) {
      const fimK = k[n];
      const fimV = v[n];
      let i = 0;
      for (;;) {
        const a = 2 * i + 1;
        if (a >= n) break;
        const b = a + 1;
        const m = b < n && k[b] < k[a] ? b : a;
        if (k[m] >= fimK) break;
        k[i] = k[m];
        v[i] = v[m];
        i = m;
      }
      k[i] = fimK;
      v[i] = fimV;
    }
    this.ultimaChave = topoK;
    return topoV;
  }
}

export class MapaNavegacao {
  /**
   * Monta a grade a partir do terreno. raioBloqueio: raio em volta da base onde
   * monstro não entra (a zona segura), que fica bloqueado na grade.
   * @param {{ raioBloqueio?: number }} [opcoes]
   */
  constructor({ raioBloqueio = 0 } = {}) {
    const n = Math.ceil((2 * MAP_HALF) / CELULA);
    this.n = n;
    this.raioBloqueio = raioBloqueio;
    const total = n * n;
    // Alturas numa grade com o dobro da resolução: os pontos pares são os centros
    // das células e os ímpares, o meio do caminho entre dois centros. Conferir a
    // rampa nas duas metades do passo pega parede curta e íngreme que a média
    // entre dois centros esconderia.
    const nf = 2 * n - 1;
    const hf = new Float32Array(nf * nf);
    for (let jf = 0; jf < nf; jf++) {
      for (let if_ = 0; if_ < nf; if_++) {
        hf[jf * nf + if_] = heightAt(-MAP_HALF + CELULA / 2 + (if_ * CELULA) / 2, -MAP_HALF + CELULA / 2 + (jf * CELULA) / 2);
      }
    }
    this.zona = new Uint8Array(total);
    for (let c = 0; c < total; c++) {
      const { x, z } = this.centro(c);
      if (Math.hypot(x - BASE.x, z - BASE.z) < raioBloqueio) this.zona[c] = 1;
    }
    // passa[c]: bit k ligado = dá para ir de c para o vizinho k.
    const limite = MAX_SLOPE * FOLGA_RAMPA;
    this.passa = new Uint8Array(total);
    for (let c = 0; c < total; c++) {
      if (this.zona[c]) continue;
      const i = c % n;
      const j = (c - i) / n;
      const hc = hf[2 * j * nf + 2 * i];
      let m = 0;
      for (let k = 0; k < 8; k++) {
        const ii = i + VIZ_I[k];
        const jj = j + VIZ_J[k];
        if (ii < 0 || jj < 0 || ii >= n || jj >= n || this.zona[jj * n + ii]) continue;
        if (k >= 4) {
          const [a, b] = RETOS_DA_DIAGONAL[k];
          if (!(m & (1 << a)) || !(m & (1 << b))) continue;
        }
        const meio = (COMPRIMENTO[k] * CELULA) / 2;
        const hm = hf[(2 * j + VIZ_J[k]) * nf + 2 * i + VIZ_I[k]];
        const hv = hf[2 * jj * nf + 2 * ii];
        if ((hm - hc) / meio <= limite && (hv - hm) / meio <= limite) m |= 1 << k;
      }
      this.passa[c] = m;
    }
    // Distância (em células, até 3) da parede mais perto: parede é célula com algum
    // passo reto bloqueado, para qualquer lado.
    const beira = new Uint8Array(total).fill(3);
    for (let c = 0; c < total; c++) {
      if ((this.passa[c] & 0b1111) !== 0b1111) beira[c] = 0;
    }
    for (let r = 1; r < 3; r++) {
      for (let c = 0; c < total; c++) {
        if (beira[c] !== 3) continue;
        const i = c % n;
        const j = (c - i) / n;
        for (let k = 0; k < 8; k++) {
          const ii = i + VIZ_I[k];
          const jj = j + VIZ_J[k];
          if (ii >= 0 && jj >= 0 && ii < n && jj < n && beira[jj * n + ii] === r - 1) {
            beira[c] = r;
            break;
          }
        }
      }
    }
    this.custo = new Float32Array(total);
    for (let c = 0; c < total; c++) this.custo[c] = 1 + (CUSTO_BEIRA[beira[c]] ?? 0);
    this.base = null;
    this.redeCache = null;
  }

  /** Índice da célula que contém (x, z), ou -1 fora do mapa. */
  indice(x, z) {
    const i = Math.floor((x + MAP_HALF) / CELULA);
    const j = Math.floor((z + MAP_HALF) / CELULA);
    if (i < 0 || j < 0 || i >= this.n || j >= this.n) return -1;
    return j * this.n + i;
  }

  /** Centro da célula, em metros. */
  centro(c) {
    const i = c % this.n;
    const j = (c - i) / this.n;
    return { x: -MAP_HALF + (i + 0.5) * CELULA, z: -MAP_HALF + (j + 0.5) * CELULA };
  }

  /** A célula fora da zona segura mais perto de (x, z), até `raio` células em volta. */
  celulaPerto(x, z, raio = 3) {
    const c = this.indice(x, z);
    if (c < 0) return -1;
    if (!this.zona[c]) return c;
    const n = this.n;
    const i0 = c % n;
    const j0 = (c - i0) / n;
    let melhor = -1;
    let melhorD = Infinity;
    for (let dj = -raio; dj <= raio; dj++) {
      for (let di = -raio; di <= raio; di++) {
        const i = i0 + di;
        const j = j0 + dj;
        if (i < 0 || j < 0 || i >= n || j >= n || this.zona[j * n + i]) continue;
        const d = di * di + dj * dj;
        if (d < melhorD) {
          melhorD = d;
          melhor = j * n + i;
        }
      }
    }
    return melhor;
  }

  /**
   * Dijkstra com várias fontes. Devolve { dist, origem }: para cada célula, o custo
   * do caminho até a fonte mais próxima e o índice dessa fonte em `fontes`
   * (Infinity / -1 onde não dá para chegar). Com `paradas` (posições de quem vai usar
   * o campo), para assim que todas elas têm custo final: o resto do mapa não
   * interessa, e o campo sai bem mais barato quando os monstros estão perto.
   * @param {{x:number, z:number}[]} fontes
   * @param {{x:number, z:number}[]} [paradas]
   */
  campo(fontes, paradas = null) {
    const total = this.n * this.n;
    const dist = new Float64Array(total).fill(Infinity);
    const origem = new Int16Array(total).fill(-1);
    const heap = new Heap();
    fontes.forEach((f, k) => {
      const c = this.celulaPerto(f.x, f.z);
      if (c < 0 || dist[c] === 0) return;
      dist[c] = 0;
      origem[c] = k;
      heap.push(0, c);
    });
    let faltam = null;
    if (paradas) {
      faltam = new Set();
      for (const p of paradas) {
        const c = this.celulaPerto(p.x, p.z, 2);
        if (c >= 0) faltam.add(c);
      }
    }
    this.#espalhar(dist, origem, heap, faltam);
    return { dist, origem };
  }

  /**
   * A rede de corredores ligada à saída da base: células de onde se chega a (x, z) e
   * que se alcançam saindo de lá. Monstro só nasce nela, senão poderia nascer num
   * buraco de onde não sai (ou num planalto onde jogador nunca chega).
   * Calculada uma vez.
   */
  rede(x, z) {
    if (this.redeCache) return this.redeCache;
    const total = this.n * this.n;
    const n = this.n;
    const volta = this.campo([{ x, z }]).dist; // quem chega lá
    const ida = new Uint8Array(total); // quem se alcança de lá
    const inicio = this.celulaPerto(x, z);
    const fila = [inicio];
    ida[inicio] = 1;
    while (fila.length) {
      const c = fila.pop();
      const i = c % n;
      const j = (c - i) / n;
      for (let k = 0; k < 8; k++) {
        if (!(this.passa[c] & (1 << k))) continue;
        const v = (j + VIZ_J[k]) * n + i + VIZ_I[k];
        if (ida[v]) continue;
        ida[v] = 1;
        fila.push(v);
      }
    }
    const rede = new Uint8Array(total);
    for (let c = 0; c < total; c++) if (ida[c] && Number.isFinite(volta[c])) rede[c] = 1;
    this.redeCache = rede;
    return rede;
  }

  /**
   * Campo para quando ninguém está caçável: leva até o anel logo fora da zona
   * segura, onde os monstros ficam rondando. Não muda, então é calculado uma vez.
   */
  campoBase() {
    if (this.base) return this.base;
    const total = this.n * this.n;
    const dist = new Float64Array(total).fill(Infinity);
    const origem = new Int16Array(total).fill(-1);
    const heap = new Heap();
    for (let c = 0; c < total; c++) {
      if (this.zona[c]) continue;
      const { x, z } = this.centro(c);
      if (Math.hypot(x - BASE.x, z - BASE.z) < this.raioBloqueio + 3 * CELULA) {
        dist[c] = 0;
        heap.push(0, c);
      }
    }
    this.#espalhar(dist, origem, heap);
    this.base = { dist, origem };
    return this.base;
  }

  /**
   * Espalha o custo a partir das fontes, andando para trás (v chega em c se passa[v]
   * tem o passo para c). Com `faltam`, para quando todas essas células saem da fila.
   */
  #espalhar(dist, origem, heap, faltam = null) {
    const n = this.n;
    const passa = this.passa;
    const custo = this.custo;
    while (!heap.vazio) {
      const c = heap.pop();
      const dc = heap.ultimaChave;
      if (dc > dist[c]) continue;
      if (faltam && faltam.delete(c) && faltam.size === 0) return;
      const i = c % n;
      const j = (c - i) / n;
      for (let k = 0; k < 8; k++) {
        const ii = i + VIZ_I[k];
        const jj = j + VIZ_J[k];
        if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue;
        const v = jj * n + ii;
        if (!(passa[v] & BIT_OPOSTO[k])) continue;
        const nd = dc + COMPRIMENTO[k] * custo[v];
        if (nd < dist[v]) {
          dist[v] = nd;
          origem[v] = origem[c];
          heap.push(nd, v);
        }
      }
    }
  }

  #melhorPasso(campo, c) {
    const n = this.n;
    const i = c % n;
    const j = (c - i) / n;
    let melhor = -1;
    let melhorD = campo.dist[c];
    for (let k = 0; k < 8; k++) {
      if (!(this.passa[c] & (1 << k))) continue;
      const v = (j + VIZ_J[k]) * n + i + VIZ_I[k];
      if (campo.dist[v] < melhorD) {
        melhorD = campo.dist[v];
        melhor = v;
      }
    }
    return melhor;
  }

  /**
   * Uma nave vai de (x1, z1) a (x2, z2) em linha reta sem bater em subida íngreme
   * nem entrar na zona segura?
   */
  linhaLivre(x1, z1, x2, z2) {
    const d = Math.hypot(x2 - x1, z2 - z1);
    const passos = Math.max(1, Math.ceil(d / PASSO_LINHA));
    const passo = d / passos;
    let hAnt = heightAt(x1, z1);
    for (let k = 1; k <= passos; k++) {
      const t = k / passos;
      const x = x1 + (x2 - x1) * t;
      const z = z1 + (z2 - z1) * t;
      const h = heightAt(x, z);
      if ((h - hAnt) / passo > MAX_SLOPE * FOLGA_RAMPA) return false;
      if (Math.hypot(x - BASE.x, z - BASE.z) < this.raioBloqueio) return false;
      hAnt = h;
    }
    return true;
  }

  /**
   * Para onde mirar quem está em (x, z) seguindo o campo: o ponto mais adiante no
   * caminho que ele alcança em linha livre. Devolve { x, z, dist, origem, chegou }
   * ou null se dali não há caminho.
   */
  proximoPonto(campo, x, z) {
    const c = this.celulaPerto(x, z, 2);
    if (c < 0 || !Number.isFinite(campo.dist[c])) return null;
    const caminho = [c];
    for (let k = 0; k < OLHAR_CELULAS; k++) {
      const v = this.#melhorPasso(campo, caminho[caminho.length - 1]);
      if (v < 0) break;
      caminho.push(v);
    }
    const info = { dist: campo.dist[c], origem: campo.origem[c] };
    if (caminho.length === 1) return { ...this.centro(c), ...info, chegou: true };
    for (let k = caminho.length - 1; k > 1; k--) {
      const p = this.centro(caminho[k]);
      if (this.linhaLivre(x, z, p.x, p.z)) return { ...p, ...info, chegou: false };
    }
    return { ...this.centro(caminho[1]), ...info, chegou: false };
  }
}
