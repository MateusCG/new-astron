// Volta à base (recall): a linha do tempo do efeito (pura e testada; o desenho está em
// volta.js). Nosso, nada do AstroN original nem da subida de nível: um PORTAL DE DOBRA, o
// mesmo vocabulário do portal warp alto e flutuante das bases, que se abre acima da nave
// e a puxa para dentro dele. Pedido do Mateus (29/out/2026): uma animação de qualidade só
// para a volta à base, na cor do time (relativa a quem olha), como o resto do recall.
//
// Três atos:
//
// - canal (os RECALL_S de canalização, pelo progresso k de 0 a 1): o portal deitado abre
//   em cima da nave (PORTAL_ALTURA corpos acima) e as 8 lâminas da íris acendem uma a uma,
//   a contagem que se lê de longe (uma a cada 0,75 s); o vórtice do meio gira cada vez mais
//   rápido; os fios de energia sobem da nave até o meio do portal; e a casca de luz (a
//   própria nave desenhada de novo, aditiva) acende com o progresso, com linhas de
//   varredura subindo. Cancelou: tudo fecha em VOLTA_APAGA_S (a íris encolhe).
// - partida (VOLTA_PARTIDA_S, onde a nave estava): a casca fica branca, a nave afina e
//   estica para cima, é sugada pelo portal, que fecha num clarão; uma linha de luz sobe
//   dele e uma onda tracejada abre na altura do portal.
// - chegada (VOLTA_CHEGADA_S, na base): o raio desce do céu (RAIO_ALTURA) até a nave, o
//   portal abre e fecha em cima dela, a luz esticada se condensa na forma da nave (passando
//   um pouco do tamanho e voltando) e a casca se desfaz de cima para baixo revelando o
//   casco; a onda tracejada abre na altura da nave (nunca no chão: anel no chão é só pouso).
//
// Tamanhos em corpos da nave (`userData.tamanho`), menos as alturas do raio (m).

export const PORTAL_ALTURA = 3; // corpos acima do centro da nave
export const PORTAL_RAIO = 1.15; // corpos
export const PORTAL_ALTURA_MIN = 14; // m: a nave pequena ainda vê o portal de baixo
export const LAMINAS = 8;
export const VOLTA_APAGA_S = 0.35;
export const VOLTA_PARTIDA_S = 0.9;
export const VOLTA_CHEGADA_S = 1.1;
export const RAIO_ALTURA = 150; // m: sai do alto da tela na câmera de perseguição
export const CASCO_ESCONDIDO_S = 0.3; // na chegada, o casco de verdade só aparece condensado

const sai3 = (k) => 1 - (1 - k) ** 3; // freia no fim
const entra2 = (k) => k * k; // acelera
const passa = (k) => 1 + 2.7 * (k - 1) ** 3 + 1.7 * (k - 1) ** 2; // passa do alvo e volta
const k01 = (t, a, b) => Math.min(1, Math.max(0, (t - a) / (b - a)));
const mistura = (a, b, k) => a + (b - a) * k;

/** Casca parada: a nave no tamanho dela, sem brilho. */
const CASCA = Object.freeze({ alfa: 0, branco: 0, estica: 1, aperta: 1, sobe: 0, revela: 99, varre: 0.4 });

/**
 * Canalizando com progresso `k` (0 a 1); `apaga` de 1 a 0 fecha tudo (cancelou). As
 * velocidades (voltas e ciclos por segundo) o desenho integra no tempo.
 */
export function quadroCanal(k, apaga = 1) {
  k = Math.min(1, Math.max(0, k));
  const a = Math.min(1, Math.max(0, apaga));
  const abre = sai3(k01(k, 0, 0.12)) * sai3(a); // a íris abre nos primeiros 0,7 s
  return {
    portal: {
      alfa: (0.45 + 0.55 * k) * a,
      raio: PORTAL_RAIO * (0.35 + 0.65 * abre) * (1 + 0.08 * k),
      abre,
      acesas: LAMINAS * k,
      vortice: (0.25 + 0.75 * k) * a,
      giro: 0.35 + 2.4 * k * k, // voltas/s da íris
      giroVortice: 0.6 + 2.6 * k, // voltas/s do rodamoinho
    },
    fios: { alfa: k01(k, 0.03, 0.3) * (0.35 + 0.65 * k) * a, corre: 0.7 + 2.6 * k, aperta: 1 },
    casca: { ...CASCA, alfa: (0.1 + 0.6 * k ** 1.5) * a, varre: 0.4 + 1.8 * k },
    clarao: { alfa: 0, tamanho: 0, noPortal: false },
    feixe: null,
    anel: null,
  };
}

/** A nave sumindo pelo portal, `t` s depois da volta (null no fim). */
export function quadroPartida(t) {
  if (t < 0 || t >= VOLTA_PARTIDA_S) return null;
  // A casca fica branca, afina e estica para cima, e sobe até o portal.
  const kb = k01(t, 0, 0.12);
  const ka = k01(t, 0.06, 0.32);
  const ks = k01(t, 0.22, 0.5);
  const casca = {
    ...CASCA,
    alfa: 1 - k01(t, 0.42, 0.52),
    branco: sai3(kb),
    aperta: mistura(1, 0.05, sai3(ka)),
    estica: mistura(1, 3.2, sai3(ka)) * mistura(1, 0.25, entra2(ks)),
    sobe: entra2(ks), // 0 a 1 da altura do portal
    varre: 3,
  };
  // O portal segura aberto, acende tudo e fecha quando a nave entra.
  const kf = k01(t, 0.44, 0.6);
  const portal = {
    alfa: 1 - k01(t, 0.52, 0.66),
    raio: PORTAL_RAIO * 1.08 * (1 + 0.15 * sai3(k01(t, 0.2, 0.44))) * (1 - sai3(kf)),
    abre: 1 - kf,
    acesas: LAMINAS,
    vortice: 1 + 0.6 * k01(t, 0.1, 0.44),
    giro: 3.2,
    giroVortice: 4,
  };
  // O clarão onde o portal fechou, a linha de luz que sobe dele e a onda na altura dele.
  const kc = k01(t, 0.46, 0.8);
  const kl = k01(t, 0.46, 0.66);
  const kd = k01(t, 0.5, VOLTA_PARTIDA_S);
  const ko = k01(t, 0.47, 0.88);
  return {
    portal,
    fios: { alfa: 1 - k01(t, 0, 0.3), corre: 5, aperta: mistura(1, 0.3, sai3(k01(t, 0, 0.3))) },
    casca,
    clarao: { alfa: kc > 0 && kc < 1 ? (1 - kc) ** 2 : 0, tamanho: 1.4 + 2 * sai3(kc), noPortal: true },
    feixe: {
      doPortal: true, // a linha sai do portal e sobe RAIO_ALTURA m
      cabeca: sai3(kl), // 0 a 1 do caminho
      sobe: true,
      raio: 0.1 * (1 - 0.7 * sai3(kd)),
      alfa: kl > 0 ? 1 - kd * kd : 0,
    },
    anel: { alfa: ko > 0 && ko < 1 ? 0.85 * (1 - ko) ** 1.5 : 0, raio: 0.8 + 2.6 * sai3(ko), noPortal: true },
  };
}

/** A nave chegando na base, `t` s depois da volta (null no fim; antes de 0, nada ainda). */
export function quadroChegada(t) {
  if (t >= VOLTA_CHEGADA_S) return null;
  if (t < 0) return { espera: true };
  // O raio desce do céu num instante, engrossa no impacto e afina até sumir.
  const kd = k01(t, 0, 0.14);
  const ka = k01(t, 0.18, 0.8);
  const feixe = {
    doPortal: false, // do céu até a nave
    cabeca: 1 - sai3(kd), // a ponta de baixo desce do alto (1) até a nave (0)
    sobe: false,
    raio: (0.08 + 0.08 * Math.sin(Math.PI * k01(t, 0.1, 0.3))) * (1 - 0.75 * sai3(ka)),
    alfa: 1 - ka * ka,
  };
  // O portal abre junto com o raio e fecha depois que a nave condensou.
  const kp = k01(t, 0, 0.14);
  const kf = k01(t, 0.42, 0.75);
  const portal = {
    alfa: 1 - k01(t, 0.6, 0.8),
    raio: PORTAL_RAIO * (0.4 + 0.7 * sai3(kp)) * (1 - sai3(kf)),
    abre: sai3(kp) * (1 - kf),
    acesas: LAMINAS,
    vortice: 1.3,
    giro: -3,
    giroVortice: -4,
  };
  // A luz esticada se condensa na nave (passa do tamanho e volta) e se desfaz de cima
  // para baixo (`revela`, em corpos a partir do centro), revelando o casco.
  const kc = k01(t, 0.08, 0.38);
  const kr = k01(t, 0.4, 1.0);
  const casca = {
    ...CASCA,
    alfa: t < 0.08 ? 0 : 1 - k01(t, 0.9, VOLTA_CHEGADA_S),
    branco: 1 - sai3(k01(t, 0.3, 0.7)),
    estica: mistura(5, 1, passa(kc)),
    aperta: mistura(0.06, 1, passa(kc)),
    revela: mistura(1.3, -1.3, kr),
    varre: 2,
  };
  const kc2 = k01(t, 0.12, 0.5);
  const ko = k01(t, 0.3, 0.9);
  return {
    portal,
    fios: { alfa: 0, corre: 0, aperta: 1 },
    casca,
    clarao: { alfa: kc2 > 0 && kc2 < 1 ? 0.9 * (1 - kc2) ** 2 : 0, tamanho: 1.6 + 2.4 * sai3(kc2), noPortal: false },
    feixe,
    anel: { alfa: ko > 0 && ko < 1 ? 0.9 * (1 - ko) ** 1.5 : 0, raio: 0.6 + 2.4 * sai3(ko), noPortal: false },
    cascoVisivel: t >= CASCO_ESCONDIDO_S,
  };
}
