// Núcleo de He-3: as duas passivas do Tormentor na tela, a linha do tempo e a geometria
// dos efeitos (pura e testada; o desenho está em nucleo-efeitos.js, as malhas em
// nucleo-efeitos.glb). Nosso, nada do AstroN original. Pedido do Mateus (29/out/2026):
// efeitos maduros e sem exagero, então tudo é curto, fino e no lugar.
//
// - Escudo que se regenera rápido: a cúpula de colmeia em volta do cristal (ESCUDO), em
//   azul-gelo de He-3, quase transparente: só as costuras e a borda contra o céu acendem.
//   A barreira do servidor (a `vida` do obj) decide quantas células existem; cada célula
//   tem a sua ordem (do glb), e as que voltam acendem a partir de onde batem os feixes das
//   quatro lentes dos obeliscos (ALIMENTACAO), que ficam acesos enquanto a barreira enche.
//   A barreira mostrada segue a do servidor depressa, e duas atrasadas marcam as células
//   que acabaram de mudar (seguirBarreira): a da solda só atrasa subindo (as que voltaram
//   acendem com a borda clara, a mais nova mais forte) e a da quebra só atrasa descendo (as
//   que caíram viram brasa âmbar e somem). Em combate (a barreira enchendo) as células
//   ficam um pouco mais cheias, para os buracos lerem. Cada tiro que bate abre uma onda
//   curta pelas células a partir do lado de onde veio (quadroImpacto).
// - Reflexo de dano: a cada devolução do servidor, a célula da cúpula virada para cada
//   nave acende em âmbar, um raio fino sai dela até a nave, entra na nave (a cauda corre
//   atrás da cabeça) e um clarão pequeno marca onde bateu (quadroReflexo). A cúpula dá um
//   tranco curto para dentro e volta. O som (nucleo_reflexo) é escrito em cima disto.
//
// Coordenadas locais do Núcleo: pivô no centro do prato emissor, y = 0 no topo dele.

/** A esfera do escudo: raio e altura do centro (m). A borda encosta no prato (r 26,8) em y = 0. */
export const ESCUDO = Object.freeze({ raio: 29, centroY: 11 });

const TAU = 2 * Math.PI;
const C_CRISTAL = { x: 0, y: 18, z: 0 };

/**
 * As quatro lentes âmbar dos obeliscos do nucleo.glb (a mesma conta do nucleo_pbr.py: o
 * braço sai a 15,5 m do pé do obelisco e anda 7,5 m para o cristal; a lente fica 1,3 m
 * adiante), com a direção em que apontam (para o cristal).
 */
export const LENTES = Object.freeze(
  [0, 1, 2, 3].map((k) => {
    const a = (k / 4) * TAU;
    const rx = Math.cos(a);
    const rz = Math.sin(a);
    const pe = { x: rx * 50, y: 38, z: rz * 50 };
    const topo = { x: rx * 41, y: 72, z: rz * 41 };
    const e = normalizar(sub(topo, pe));
    const sai = somar(pe, e, 15.5);
    const alvo = normalizar(sub(C_CRISTAL, sai));
    return Object.freeze({ pos: somar(sai, alvo, 8.8), dir: alvo });
  }),
);

/** Onde a reta de `p` na direção `d` (unitária) entra na esfera do escudo, ou null. */
export function entradaNaCasca(p, d) {
  const oc = { x: p.x, y: p.y - ESCUDO.centroY, z: p.z };
  const b = oc.x * d.x + oc.y * d.y + oc.z * d.z;
  const c = oc.x * oc.x + oc.y * oc.y + oc.z * oc.z - ESCUDO.raio * ESCUDO.raio;
  const disc = b * b - c;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return t < 0 ? null : somar(p, d, t);
}

/** Os feixes de alimentação: de cada lente até onde ele bate na cúpula. */
export const ALIMENTACAO = Object.freeze(LENTES.map((l) => Object.freeze({ de: l.pos, ate: entradaNaCasca(l.pos, l.dir) })));

/**
 * Direção (unitária, local) do centro do escudo até o ponto `p` (local). Ponto em cima do
 * eixo (o tiro de área no centro) vira uma direção horizontal pelo `sorteio` (0 a 1).
 */
export function direcaoNaCasca(p, sorteio = 0) {
  const d = { x: p.x, y: p.y - ESCUDO.centroY, z: p.z };
  const n = Math.hypot(d.x, d.y, d.z);
  if (Math.hypot(d.x, d.z) < 1) return { x: Math.cos(sorteio * TAU), y: 0, z: Math.sin(sorteio * TAU) };
  return { x: d.x / n, y: d.y / n, z: d.z / n };
}

/** O ponto da cúpula (local) na direção `d` a partir do centro. */
export function pontoDaCasca(d) {
  return { x: d.x * ESCUDO.raio, y: ESCUDO.centroY + d.y * ESCUDO.raio, z: d.z * ESCUDO.raio };
}

/**
 * Rapidez (1/s) com que a barreira mostrada segue a do servidor, e com que a da solda e a
 * da quebra a alcançam (a largura da faixa de células mudando é a velocidade da barreira
 * dividida por isto).
 */
export const SEGUE_BARREIRA = 9;
export const SEGUE_ATRAS = 2.2;
/**
 * O mais rápido (fração por s) que a barreira mostrada sobe: só freia o nascer da cúpula
 * (0,7 s, a frente da solda correndo das lentes até o prato); a regeneração do servidor,
 * 4 a 10% por s, nunca chega perto.
 */
export const SOBE_MAX = 1.4;
/** Rapidez com que os feixes de alimentação acendem e apagam. */
export const SEGUE_ALIMENTA = 4;

/**
 * Um passo da barreira mostrada: `b` = { vis, solda, quebra, alimenta } (0 a 1; solda ≤
 * vis ≤ quebra), `alvo` = a barreira do servidor (0 fora do mapa), `enchendo` = ela está
 * abaixo da cheia (os feixes das lentes acendem), `dt` em s. Devolve o novo estado. As
 * células com a ordem entre solda e vis acabaram de voltar; entre vis e quebra, de cair.
 */
export function seguirBarreira(b, alvo, enchendo, dt) {
  const k = (taxa) => 1 - Math.exp(-taxa * dt);
  const vis = b.vis + Math.min((alvo - b.vis) * k(SEGUE_BARREIRA), SOBE_MAX * dt);
  const solda = Math.min(vis, b.solda + (vis - b.solda) * k(SEGUE_ATRAS));
  const quebra = Math.max(vis, b.quebra + (vis - b.quebra) * k(SEGUE_ATRAS));
  const alimenta = b.alimenta + ((enchendo ? 1 : 0) - b.alimenta) * k(SEGUE_ALIMENTA);
  return { vis, solda, quebra, alimenta };
}

const k01 = (t, a, b) => Math.min(1, Math.max(0, (t - a) / (b - a)));
const sai3 = (k) => 1 - (1 - k) ** 3;
const entra2 = (k) => k * k;

/** Duração (s) da onda de um tiro no escudo, e o menor intervalo entre duas ondas. */
export const IMPACTO_S = 0.55;
export const IMPACTO_INTERVALO_S = 0.08;

/**
 * A onda de um tiro na cúpula no tempo `t` (s desde o acerto), ou null quando acabou:
 * raio (rad, em volta do ponto do impacto), alfa do anel e o miolo (o clarão da célula
 * atingida, só no começo).
 */
export function quadroImpacto(t) {
  if (t < 0 || t >= IMPACTO_S) return null;
  const k = t / IMPACTO_S;
  return { raio: 0.04 + 0.5 * sai3(k), alfa: (1 - k) ** 1.5, miolo: Math.exp(-t * 14) };
}

/** Duração (s) do reflexo na tela. */
export const REFLEXO_S = 0.5;
/** Quando (s) a cabeça do raio chega na nave (o clarão e o golpe do som caem aqui). */
export const REFLEXO_CHEGA_S = 0.12;

/**
 * O reflexo no tempo `t` (s desde o evento), ou null quando acabou:
 * - saida: alfa da célula da cúpula de onde sai o raio (âmbar);
 * - tranco: quanto a cúpula encolhe (fração do raio, negativa) e volta;
 * - raio: cabeca e cauda (0 a 1 do caminho, da cúpula à nave), alfa, largura (fração da
 *   cheia) e tremor (fração do cheio);
 * - clarao: alfa e tamanho (fração do cheio) do clarão na nave.
 */
export function quadroReflexo(t) {
  if (t < 0 || t >= REFLEXO_S) return null;
  const ks = k01(t, 0, 0.32);
  const saida = Math.min(1, t / 0.03) * (1 - ks) ** 2;
  const kt = k01(t, 0, 0.22);
  const tranco = -0.012 * Math.sin(Math.PI * kt) * (1 - kt);
  const cabeca = sai3(k01(t, 0.03, REFLEXO_CHEGA_S));
  const cauda = entra2(k01(t, 0.16, 0.42));
  const ka = k01(t, 0.26, REFLEXO_S - 0.02);
  const raio = {
    cabeca,
    cauda: Math.min(cauda, cabeca),
    alfa: cabeca > 0 ? 1 - ka * ka : 0,
    largura: 1 - 0.6 * k01(t, 0.12, REFLEXO_S),
    tremor: 1 - k01(t, 0.04, 0.18),
  };
  const kc = k01(t, REFLEXO_CHEGA_S, REFLEXO_CHEGA_S + 0.06);
  const kf = k01(t, REFLEXO_CHEGA_S + 0.04, 0.45);
  const clarao = { alfa: t < REFLEXO_CHEGA_S ? 0 : kc * (1 - kf) ** 1.5, tamanho: 0.6 + 0.4 * sai3(kc) + 0.25 * kf };
  return { saida, tranco, raio, clarao };
}

function sub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function somar(a, d, k) {
  return { x: a.x + d.x * k, y: a.y + d.y * k, z: a.z + d.z * k };
}

function normalizar(v) {
  const n = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / n, y: v.y / n, z: v.z / n };
}
