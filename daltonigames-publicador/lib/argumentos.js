// Leitura da linha de comando, sem dependência: posicionais e opções
// `--chave valor`, `--chave=valor` ou só `--chave` (vira true).

/**
 * @param {string[]} argv os argumentos depois do script (process.argv.slice(2))
 * @returns {{pos: string[], op: Record<string, string|true>}}
 */
export function lerArgumentos(argv) {
  const pos = [];
  const op = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { pos.push(a); continue; }
    const igual = a.indexOf('=');
    if (igual > 0) { op[a.slice(2, igual)] = a.slice(igual + 1); continue; }
    const chave = a.slice(2);
    const prox = argv[i + 1];
    if (prox !== undefined && !prox.startsWith('--')) { op[chave] = prox; i++; }
    else op[chave] = true;
  }
  return { pos, op };
}

/** Lista separada por vírgula ("a, b,c") em array limpo. */
export function lista(valor) {
  if (!valor || valor === true) return [];
  return String(valor).split(',').map((s) => s.trim()).filter(Boolean);
}

/** Retângulo "x,y,l,a" em pixels do vídeo de origem; null se não veio. */
export function retangulo(valor, nome) {
  if (!valor || valor === true) return null;
  const n = String(valor).split(',').map((s) => Number(s.trim()));
  if (n.length !== 4 || n.some((v) => !Number.isFinite(v) || v < 0) || n[2] <= 0 || n[3] <= 0) {
    throw new Error(`--${nome} precisa de "x,y,largura,altura" em pixels (ex.: 1500,40,380,300)`);
  }
  const [x, y, l, a] = n.map(Math.round);
  return { x, y, l, a };
}

/** Tempo "1:20", "01:01:20", "80" ou "80.5" em segundos. */
export function segundos(valor, nome) {
  if (valor === undefined || valor === true) return null;
  const partes = String(valor).split(':').map(Number);
  if (partes.length > 3 || partes.some((p) => !Number.isFinite(p) || p < 0)) {
    throw new Error(`--${nome} inválido: use 1:20, 01:01:20 ou segundos`);
  }
  return partes.reduce((t, p) => t * 60 + p, 0);
}
