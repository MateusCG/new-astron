// Volta à base (recall): a linha do tempo do efeito (pura e testada; o desenho está em
// volta.js). Nosso, nada do AstroN original nem da subida de nível, na linguagem do recall
// dos MOBAs (pedido do Mateus, 29/out/2026: "se baseie em como é no LoL, no Dota 2 e no
// Smite 2"): o que os três têm em comum é o círculo de runas embaixo de quem volta, a
// energia subindo em funil em volta dele, a coluna de luz crescendo com a carga, quem volta
// acendendo e, no fim, a descarga (clarão, a luz indo ao céu, o corpo se desfazendo); na
// chegada, o inverso. Na cor do time de quem volta (relativa a quem olha).
//
// Três atos:
//
// - canal (os RECALL_S, pelo progresso k de 0 a 1): o círculo se desenha em volta (0,5 s)
//   embaixo da nave, com três camadas girando em sentidos contrários e o arco de progresso
//   enchendo na borda; as partículas sobem em funil (mais e mais rápidas com a carga), as
//   fitas espiralam até o alto, a coluna de luz cresce com a energia correndo nela, a nave
//   acende (borda clara e energia correndo no casco). Na carga final (CARGA_FINAL) tudo
//   aperta e acelera, a antecipação antes da descarga. Cancelou: tudo murcha em
//   VOLTA_APAGA_S.
// - partida (VOLTA_PARTIDA_S, onde a nave estava): clarão, a nave em luz se desfaz de baixo
//   para cima com a borda incandescente, as partículas explodem para cima, o feixe sobe ao
//   céu, a coluna e o círculo se fecham para dentro e a onda abre na altura da nave.
// - chegada (VOLTA_CHEGADA_S, na base): o feixe cai do céu, clarão no impacto, as
//   partículas convergem para a nave, que se materializa de cima para baixo com a borda
//   incandescente; o círculo carimba embaixo e some, a onda abre, e a luz sai do casco.
//
// Tamanhos em corpos da nave (`userData.tamanho`), menos a altura do feixe (m). O `corte`
// da casca é em corpos a partir do centro da nave (a dissolução: some o que está abaixo).

export const VOLTA_APAGA_S = 0.35;
export const VOLTA_PARTIDA_S = 0.8;
export const VOLTA_CHEGADA_S = 1.1;
export const FEIXE_ALTURA = 160; // m: sai do alto da tela na câmera de perseguição
export const CASCO_ESCONDIDO_S = 0.45; // na chegada, o casco de verdade só aparece materializado
export const CARGA_FINAL = 0.85; // k a partir do qual vem a antecipação
export const CIRCULO_RAIO = 2.1; // corpos
export const COLUNA_RAIO = 1.25; // corpos
export const COLUNA_ALTURA = 5; // corpos
export const SEM_CORTE = -99; // casca inteira

const sai3 = (k) => 1 - (1 - k) ** 3; // freia no fim
const entra2 = (k) => k * k; // acelera
const passa = (k) => 1 + 2.7 * (k - 1) ** 3 + 1.7 * (k - 1) ** 2; // passa do alvo e volta
const k01 = (t, a, b) => Math.min(1, Math.max(0, (t - a) / (b - a)));
const sino = (k) => (k > 0 && k < 1 ? Math.sin(Math.PI * k) : 0);

/**
 * Canalizando com progresso `k` (0 a 1) há `t` s; `apaga` de 1 a 0 murcha tudo (cancelou).
 * Os giros (rad/s) e as velocidades (ciclos/s) o desenho integra no tempo.
 */
export function quadroCanal(k, t, apaga = 1) {
  k = Math.min(1, Math.max(0, k));
  const a = Math.min(1, Math.max(0, apaga));
  const final = k01(k, CARGA_FINAL, 1); // a antecipação
  const nasce = k01(t, 0, 0.5);
  return {
    circulo: {
      alfa: Math.min(1, t / 0.15) * (0.55 + 0.3 * k + 0.15 * final) * a,
      raio: CIRCULO_RAIO * (0.55 + 0.45 * passa(k01(t, 0, 0.35))) * (1 - 0.12 * final) * (0.6 + 0.4 * a),
      desenha: sai3(nasce),
      prog: k,
      giros: [0.35 + 1.2 * k + 3 * final, -(0.5 + 1.6 * k + 4 * final), 0.8 + 2.4 * k + 6 * final],
      pulso: 0.5 * final + 0.5 * sino(k01(t, 0, 0.4)),
    },
    particulas: { modo: 'funil', alfa: (0.35 + 0.65 * k) * a, densidade: 0.25 + 0.75 * k, veloc: 0.6 + 1.2 * k + 1.5 * final, raio: 1.5 * (1 - 0.3 * final), altura: COLUNA_ALTURA, k: 0 },
    fitas: { alfa: k01(k, 0.05, 0.3) * (0.4 + 0.6 * k) * a, corre: 0.5 + 1.3 * k + 2 * final, aperta: (1 - 0.35 * final) * (0.7 + 0.3 * a) },
    coluna: { alfa: (0.12 + 0.5 * k ** 1.4 + 0.25 * final) * a, raio: COLUNA_RAIO * (1 - 0.3 * final), altura: COLUNA_ALTURA * (0.5 + 0.5 * sai3(k01(k, 0, 0.4))), branco: 0.4 * final },
    casca: { alfa: (0.12 + 0.55 * k ** 1.8 + 0.3 * final) * a, branco: 0.6 * final * final, corte: SEM_CORTE },
    clarao: { alfa: 0, tamanho: 0 },
    feixe: null,
    anel: null,
  };
}

/** A nave se desfazendo onde estava, `t` s depois da volta (null no fim). */
export function quadroPartida(t) {
  if (t < 0 || t >= VOLTA_PARTIDA_S) return null;
  const kf = k01(t, 0, 0.3); // o que estava aberto se fecha para dentro
  const kd = k01(t, 0.04, 0.42); // a dissolução
  const kb = k01(t, 0, 0.75); // a explosão das partículas
  const kc = k01(t, 0, 0.35);
  const ko = k01(t, 0.02, 0.6);
  const ks = k01(t, 0.02, 0.22); // o feixe sobe
  const kz = k01(t, 0.25, VOLTA_PARTIDA_S); // e apaga
  return {
    circulo: { alfa: 1 - entra2(kf), raio: CIRCULO_RAIO * (0.88 + 0.25 * sino(k01(t, 0, 0.12))) * (1 - 0.8 * entra2(kf)), desenha: 1, prog: 1, giros: [6, -8, 12], pulso: 1 - kf },
    particulas: { modo: 'explosao', alfa: 1 - k01(t, 0.65, VOLTA_PARTIDA_S), densidade: 1, veloc: 1, raio: 1.3, altura: COLUNA_ALTURA * 1.4, k: sai3(kb) },
    fitas: { alfa: 1 - kf, corre: 6, aperta: 0.65 * (1 - 0.7 * sai3(kf)) },
    coluna: { alfa: 1 - entra2(kf), raio: COLUNA_RAIO * 0.7 * (1 - 0.85 * sai3(kf)), altura: COLUNA_ALTURA * (1 + 0.6 * sai3(kf)), branco: 0.6 },
    casca: { alfa: 1 - k01(t, 0.38, 0.46), branco: 1 - 0.5 * kd, corte: -1.2 + 2.6 * entra2(kd) },
    clarao: { alfa: kc > 0 && kc < 1 ? (1 - kc) ** 2 : 0, tamanho: 2.4 + 2.6 * sai3(kc) },
    feixe: { doCeu: false, cabeca: sai3(ks), raio: 0.35 * (1 - 0.8 * sai3(kz)), alfa: 1 - kz * kz },
    anel: { alfa: ko > 0 && ko < 1 ? (1 - ko) ** 1.5 : 0, raio: 0.8 + 3.2 * sai3(ko) },
  };
}

/** A nave chegando na base, `t` s depois da volta (null no fim; antes de 0, nada ainda). */
export function quadroChegada(t) {
  if (t >= VOLTA_CHEGADA_S) return null;
  if (t < 0) return { espera: true };
  const kd = k01(t, 0, 0.12); // o feixe cai
  const kz = k01(t, 0.2, 0.75); // e apaga
  const ki = k01(t, 0.04, 0.5); // as partículas convergem
  const km = k01(t, 0.1, 0.5); // a materialização
  const ks = k01(t, 0.5, VOLTA_CHEGADA_S); // a luz sai do casco
  const kc = k01(t, 0.1, 0.45);
  const ko = k01(t, 0.14, 0.75);
  const kr = k01(t, 0.1, 0.32); // o círculo carimba
  const kv = k01(t, 0.55, 1.0); // e some
  return {
    circulo: { alfa: (t < 0.1 ? 0 : 1) * (1 - kv), raio: CIRCULO_RAIO * (0.4 + 0.6 * passa(kr)) * (1 + 0.15 * kv), desenha: 1, prog: 1, giros: [-2, 3, -5], pulso: 1 - kr },
    particulas: { modo: 'implosao', alfa: 1, densidade: 1, veloc: 1, raio: 2.2, altura: COLUNA_ALTURA, k: sai3(ki) },
    fitas: { alfa: 0, corre: 0, aperta: 1 },
    coluna: { alfa: 0.9 * sino(k01(t, 0.05, 0.6)), raio: COLUNA_RAIO * (0.5 + 0.6 * sai3(k01(t, 0.05, 0.6))), altura: COLUNA_ALTURA, branco: 0.4 },
    casca: { alfa: t < 0.1 ? 0 : 1 - entra2(ks), branco: 1 - sai3(k01(t, 0.35, 0.8)), corte: 1.3 - 2.6 * sai3(km) },
    clarao: { alfa: kc > 0 && kc < 1 ? 0.9 * (1 - kc) ** 2 : 0, tamanho: 2 + 2.4 * sai3(kc) },
    feixe: { doCeu: true, cabeca: 1 - sai3(kd), raio: (0.12 + 0.18 * sino(k01(t, 0.08, 0.3))) * (1 - 0.7 * sai3(kz)), alfa: 1 - kz * kz },
    anel: { alfa: ko > 0 && ko < 1 ? 0.9 * (1 - ko) ** 1.5 : 0, raio: 0.6 + 2.8 * sai3(ko) },
    cascoVisivel: t >= CASCO_ESCONDIDO_S,
  };
}
