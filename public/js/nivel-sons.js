// Nível de cada som (puro, sem Web Audio: testado no Node). Os arquivos do original vieram
// cada um com o volume que tinha lá, e entre eles há 26 dB de diferença (o feixe de
// fábrica, `shot_ray`, 7,5 dB abaixo do `shot_ray3_5` da mesma linha; o clique quase
// mudo). A barra de volume dos efeitos multiplica todos pelo mesmo fator e não corrige
// isso, então cada som ganha, ao ser decodificado, um ganho que o leva ao volume da
// categoria dele.
//
// A medida é a loudness momentânea máxima do BS.1770 (a curva K, que pesa as frequências
// como o ouvido, numa janela de 400 ms andando de 100 ms): o trecho mais alto do som, que
// é o que o jogador ouve como "alto" num tiro ou numa explosão. O resultado sai em LUFS.
//
// As categorias dão a hierarquia: a destruição de uma nave acima do tiro, o tiro acima do
// impacto (que se repete a cada acerto), a interface discreta. Os sons nossos da volta à
// base (tools/sons_volta.py) já foram feitos no nível certo e ficam como estão.

/** Alvo de cada categoria (LUFS, loudness momentânea máxima). */
export const ALVO_CATEGORIA = Object.freeze({
  disparo: -16,
  impacto: -19,
  explosao: -16,
  morte: -15,
  destruicao: -13,
  interface: -20,
});

/**
 * Alvos por arquivo, por cima da categoria. O de subir de nível e evoluir a nave é o que
 * o Mateus pediu em 29/out/2026 (70% mais baixo que o arquivo do original, que media −12).
 */
export const ALVO_POR_SOM = Object.freeze({
  level_up: -22.5,
});

const lista = (cat, nomes) => nomes.split(' ').map((n) => [n, cat]);

/**
 * Categoria de cada arquivo de public/sons/ (o teste confere que nenhum fica de fora).
 * `null`: o som toca com o volume do arquivo.
 */
export const CATEGORIA_DO_SOM = Object.freeze(
  Object.fromEntries([
    ...lista(
      'disparo',
      'shot_ray shot_ray3_2 shot_ray3_3 shot_ray3_4 shot_ray3_5 shot_ray4 shot_ray_hm laser1 ' +
        'shot_30m shot_30m2 shot_30m3 shot_30m4 shot_30m5 shot_cc shot_ct shot_nova shot_iron ' +
        'shot_fxsph volt drop2 u_mine u_up u_acc u_decoy u_remove up2 hide moojuk dt1 dt2 ' +
        'npcfire2 npcfire3 hyper',
    ),
    ...lista('impacto', 'g_impact b_impact n2_explo extra2 off_device off_device2 cure nucleo_reflexo'),
    ...lista('explosao', 'c_explo'),
    ...lista('morte', 'snzerod1 sekisd1 vajytd1 medusad1 aflyd1'),
    ...lista('destruicao', 'h_explo'),
    ...lista(
      'interface',
      'click click2 click3 click4 level_up get_item error st_warn s_warn a_warn b_warn g_warn sm_warn ' +
        'w_open w_open2 count usehpbattery usehebattery repair pickitem i_drop',
    ),
    ...lista(null, 'volta_canal volta_cancela volta_partida volta_chegada'),
  ]),
);

/** O ganho de nível fica entre estes (o clique, o mais baixo, pede ~4,5×). */
export const NIVEL_GANHO_MIN = 0.05;
export const NIVEL_GANHO_MAX = 6;

/** Coeficientes [b0, b1, b2, a1, a2] da curva K (prefiltro + passa-alta) para a taxa `fs`. */
function curvaK(fs) {
  const prefiltro = (() => {
    const G = 3.999843853973347;
    const Q = 0.7071752369554196;
    const fc = 1681.974450955533;
    const A = 10 ** (G / 40);
    const w0 = (2 * Math.PI * fc) / fs;
    const al = Math.sin(w0) / (2 * Q);
    const c = Math.cos(w0);
    const r = 2 * Math.sqrt(A) * al;
    const a0 = A + 1 - (A - 1) * c + r;
    return [
      (A * (A + 1 + (A - 1) * c + r)) / a0,
      (-2 * A * (A - 1 + (A + 1) * c)) / a0,
      (A * (A + 1 + (A - 1) * c - r)) / a0,
      (2 * (A - 1 - (A + 1) * c)) / a0,
      (A + 1 - (A - 1) * c - r) / a0,
    ];
  })();
  const passaAlta = (() => {
    const Q = 0.5003270373238773;
    const fc = 38.13547087602444;
    const w0 = (2 * Math.PI * fc) / fs;
    const al = Math.sin(w0) / (2 * Q);
    const c = Math.cos(w0);
    const a0 = 1 + al;
    return [(1 + c) / 2 / a0, -(1 + c) / a0, (1 + c) / 2 / a0, (-2 * c) / a0, (1 - al) / a0];
  })();
  return [prefiltro, passaAlta];
}

/**
 * Loudness momentânea máxima (LUFS) de um som: `canais` são as amostras de cada canal
 * (Float32Array de −1 a 1, como o getChannelData do AudioBuffer), `fs` a taxa. Som mais
 * curto que a janela conta como se o resto fosse silêncio. Silêncio dá −Infinity.
 */
export function loudnessMaxima(canais, fs) {
  const n = canais[0]?.length ?? 0;
  if (!n || !(fs > 0)) return -Infinity;
  const energia = new Float64Array(n);
  for (const x of canais) {
    let y = x;
    for (const [b0, b1, b2, a1, a2] of curvaK(fs)) {
      const saida = new Float64Array(n);
      let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
      for (let i = 0; i < n; i++) {
        const v = y[i];
        const o = b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
        x2 = x1;
        x1 = v;
        y2 = y1;
        y1 = o;
        saida[i] = o;
      }
      y = saida;
    }
    for (let i = 0; i < n; i++) energia[i] += y[i] * y[i];
  }
  const janela = Math.round(0.4 * fs);
  const passo = Math.round(0.1 * fs);
  const acumulada = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) acumulada[i + 1] = acumulada[i] + energia[i];
  let maior = 0;
  for (let i = 0; i === 0 || i + janela <= n; i += passo) {
    const fim = Math.min(n, i + janela);
    maior = Math.max(maior, (acumulada[fim] - acumulada[i]) / janela);
  }
  return maior > 0 ? -0.691 + 10 * Math.log10(maior) : -Infinity;
}

/** Alvo (LUFS) do som `nome`, ou null se ele toca com o volume do arquivo. */
export function alvoDoSom(nome) {
  if (Object.hasOwn(ALVO_POR_SOM, nome)) return ALVO_POR_SOM[nome];
  const cat = Object.hasOwn(CATEGORIA_DO_SOM, nome) ? CATEGORIA_DO_SOM[nome] : null;
  return cat ? ALVO_CATEGORIA[cat] : null;
}

/**
 * Ganho que leva o som `nome`, medido em `lufs`, ao alvo dele (1 se ele não tem alvo ou
 * é silêncio), entre NIVEL_GANHO_MIN e NIVEL_GANHO_MAX.
 */
export function ganhoDeNivel(nome, lufs) {
  const alvo = alvoDoSom(nome);
  if (alvo === null || !Number.isFinite(lufs)) return 1;
  return Math.max(NIVEL_GANHO_MIN, Math.min(NIVEL_GANHO_MAX, 10 ** ((alvo - lufs) / 20)));
}
