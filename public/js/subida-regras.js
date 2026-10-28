// Subir de nível e evoluir a nave: a linha do tempo do efeito (pura e testada; o desenho
// está em subida.js). Nosso, inspirado no "level up" do LoL e do Dota 2: a luz que sai do
// herói e sobe rápido até o alto da tela, no vocabulário do jogo (holograma sci-fi na cor
// da raça). Pedido do Mateus (28/out/2026): que dê satisfação sem poluir a tela, então é
// curto (1,3 s; a evolução 1,6 s) e tudo nasce, brilha e some no próprio lugar:
//
// - clarão: um brilho na nave, no primeiro quarto de segundo;
// - selo: o selo holográfico embaixo da nave carimba (abre passando um pouco do tamanho e
//   volta), gira, fica e, no fim, sobe e encolhe atrás da luz;
// - onda: a onda de choque fina abrindo no chão (a evolução solta duas);
// - feixe: a luz sai da nave e chega ao alto (FEIXE_ALTURA) em 0,3 s, freando; depois
//   afina e apaga;
// - hélice: duas fitas de luz enrolando a nave, subindo do selo até passar do alto dela.
//
// Tamanhos em corpos da nave (`userData.tamanho`), menos a altura do feixe (m).

export const SUBIDA_S = 1.3;
export const SUBIDA_FORTE_S = 1.6;
export const FEIXE_ALTURA = 170; // m: sai do alto da tela na câmera de perseguição
export const FEIXE_ALTURA_FORTE = 210;

const sai3 = (k) => 1 - (1 - k) ** 3; // freia no fim
const passa = (k) => 1 + 2.7 * (k - 1) ** 3 + 1.7 * (k - 1) ** 2; // passa do alvo e volta
const k01 = (t, a, b) => Math.min(1, Math.max(0, (t - a) / (b - a)));

/**
 * O estado de cada peça no tempo `t` (s desde a subida), ou null quando acabou. `forte`
 * (nave nova) é mais larga, mais longa e com duas ondas.
 */
export function quadroSubida(t, forte = false) {
  const fim = forte ? SUBIDA_FORTE_S : SUBIDA_S;
  if (t < 0 || t >= fim) return null;
  const f = forte ? 1.25 : 1; // esticador do tempo da evolução
  // Clarão na nave.
  const kc = k01(t, 0, 0.3);
  const clarao = { alfa: 0.6 * (1 - kc) ** 2, tamanho: (forte ? 2.2 : 1.7) + 1.2 * kc };
  // Selo: carimba em 0,16 s, fica, sobe e some.
  const ks = k01(t, 0, 0.16);
  const kv = k01(t, 0.75 * f, fim - 0.1);
  const selo = {
    alfa: Math.min(1, t / 0.06) * (1 - kv),
    raio: (forte ? 1.25 : 1.05) * (0.55 + 0.45 * passa(ks)) * (1 - 0.35 * kv),
    giro: 0.8 * t + 1.4 * (1 - Math.exp(-6 * t)),
    sobe: 0.6 * kv * kv, // corpos
    varre: t * 1.6, // a varredura de luz que corre o selo (voltas)
  };
  // Ondas de choque.
  const ondas = (forte ? [0.02, 0.24] : [0.02]).map((t0) => {
    const k = k01(t, t0, t0 + 0.55);
    return { alfa: k > 0 && k < 1 ? 0.5 * (1 - k) ** 1.5 : 0, raio: 0.5 + (forte ? 2.1 : 1.6) * sai3(k) };
  });
  // Feixe: a cabeça sobe, depois afina e apaga.
  const kf = k01(t, 0.04, 0.34);
  const ka = k01(t, 0.45 * f, fim - 0.15);
  const feixe = {
    cabeca: sai3(kf), // 0 a 1 da altura
    alfa: kf > 0 ? 1 - ka * ka : 0,
    raio: (forte ? 0.45 : 0.32) * (1 - 0.85 * sai3(ka)),
    altura: forte ? FEIXE_ALTURA_FORTE : FEIXE_ALTURA,
  };
  // Hélice: a cabeça corre a fita de baixo até sair do alto (o rastro some atrás dela).
  const kh = k01(t, 0.06, 0.95 * f);
  const helice = {
    cabeca: 1.6 * sai3(kh), // 0 a 1,6 do comprimento (passa do fim: o rastro sai por cima)
    alfa: kh > 0 && kh < 1 ? 1 - k01(t, 0.7 * f, 0.95 * f) : 0,
    giro: 5 * sai3(kh),
    raio: forte ? 1.05 : 0.9,
  };
  return { clarao, selo, ondas, feixe, helice };
}
