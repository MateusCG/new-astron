// O corte do Short: um trecho do vídeo gravado (jogo + câmera no canto) virado
// para a tela em pé, 1080 × 1920, 30 fps, H.264 + AAC, pronto para o YouTube
// Shorts e o TikTok.
//
// Dois jeitos de montar:
//  - com --camera (o retângulo da sua câmera no vídeo gravado): a câmera em
//    cima (1080 × 700) e o jogo embaixo (1080 × 1220), recortado do meio da
//    tela ou do retângulo --jogo;
//  - sem câmera: o jogo inteiro no meio, na largura da tela, com o próprio
//    jogo desfocado preenchendo o fundo.
// Com --titulo, o gancho aparece nos 3 primeiros segundos, em branco com
// contorno preto (legível nos três tipos de daltonismo, como as miniaturas).
// O texto vai por arquivo (textfile) para não brigar com o escape do ffmpeg.

import { existsSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn, spawnSync } from 'node:child_process';

export const SHORT = { largura: 1080, altura: 1920, camera: 700, fps: 30, maxS: 180 };
export const TITULO_S = 3;

const FONTES = [
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf',
  '/usr/share/fonts/TTF/DejaVuSans-Bold.ttf',
  '/Library/Fonts/Arial Bold.ttf',
  '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
  'C:/Windows/Fonts/arialbd.ttf',
];

export function acharFonte(pedida) {
  if (pedida) {
    if (!existsSync(pedida)) throw new Error(`Fonte não encontrada: ${pedida}`);
    return pedida;
  }
  return FONTES.find((f) => existsSync(f)) ?? null;
}

export const GANCHO = { porLinha: 18, linhas: 3, fonte: 84, entreLinhas: 104 };

/**
 * Quebra o gancho em linhas de até 18 caracteres; cabem 3 linhas.
 * @returns {{linhas: string[], sobra: string}} `sobra` é o que não coube
 */
export function quebrarTitulo(texto, max = GANCHO.porLinha) {
  const linhas = [];
  let atual = '';
  for (const palavra of String(texto).trim().split(/\s+/)) {
    if (!atual) atual = palavra;
    else if ((atual + ' ' + palavra).length <= max) atual += ' ' + palavra;
    else { linhas.push(atual); atual = palavra; }
  }
  if (atual) linhas.push(atual);
  return { linhas: linhas.slice(0, GANCHO.linhas), sobra: linhas.slice(GANCHO.linhas).join(' ') };
}

const escFiltro = (s) => s.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");

/** O filtro do vídeo (filter_complex), terminando em [v]. `arquivosTitulo`: um arquivo por linha do gancho. */
export function filtroDoShort({ camera = null, jogo = null, arquivosTitulo = [], fonte = null }) {
  const { largura: L, altura: A, camera: C } = SHORT;
  const partes = [];
  if (camera) {
    const AJ = A - C;
    const recJogo = jogo
      ? `crop=${jogo.l}:${jogo.a}:${jogo.x}:${jogo.y},`
      : '';
    partes.push(
      '[0:v]split=2[a][b]',
      `[a]crop=${camera.l}:${camera.a}:${camera.x}:${camera.y},scale=${L}:${C}:force_original_aspect_ratio=increase,crop=${L}:${C},setsar=1[cam]`,
      `[b]${recJogo}scale=${L}:${AJ}:force_original_aspect_ratio=increase,crop=${L}:${AJ},setsar=1[jogo]`,
      '[cam][jogo]vstack=inputs=2[base]',
    );
  } else {
    const recJogo = jogo ? `crop=${jogo.l}:${jogo.a}:${jogo.x}:${jogo.y},` : '';
    partes.push(
      `[0:v]${recJogo}split=2[a][b]`,
      `[a]scale=${L}:${A}:force_original_aspect_ratio=increase,crop=${L}:${A},boxblur=24:2,eq=brightness=-0.12[fundo]`,
      `[b]scale=${L}:-2,setsar=1[frente]`,
      '[fundo][frente]overlay=(W-w)/2:(H-h)/2[base]',
    );
  }
  if (arquivosTitulo.length && fonte) {
    // Uma drawtext por linha, cada uma centrada (o text_align do ffmpeg só
    // existe nas versões novas).
    const y0 = camera ? C + 60 : 220;
    const textos = arquivosTitulo.map((arq, i) =>
      `drawtext=fontfile='${escFiltro(fonte)}':textfile='${escFiltro(arq)}':fontsize=${GANCHO.fonte}:fontcolor=white:borderw=9:bordercolor=black:x=(w-text_w)/2:y=${y0 + i * GANCHO.entreLinhas}:enable='lt(t,${TITULO_S})'`);
    partes.push(`[base]${textos.join(',')},fps=${SHORT.fps}[v]`);
  } else {
    partes.push(`[base]fps=${SHORT.fps}[v]`);
  }
  return partes.join(';');
}

/** Os argumentos do ffmpeg para cortar o Short. */
export function argumentosCorte({ entrada, saida, inicio = 0, fim = null, camera = null, jogo = null, arquivosTitulo = [], fonte = null }) {
  if (fim !== null && fim <= inicio) throw new Error('--fim precisa ser depois de --inicio');
  const dur = fim === null ? null : fim - inicio;
  if (dur !== null && dur > SHORT.maxS) throw new Error(`Trecho de ${dur} s: Short vai até ${SHORT.maxS} s`);
  const args = ['-hide_banner', '-y', '-ss', String(inicio)];
  if (dur !== null) args.push('-t', String(dur));
  args.push(
    '-i', entrada,
    '-filter_complex', filtroDoShort({ camera, jogo, arquivosTitulo, fonte }),
    '-map', '[v]', '-map', '0:a?',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '160k', '-ar', '48000',
    '-movflags', '+faststart',
    saida,
  );
  return args;
}

export function temFfmpeg() {
  return spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;
}

/** Duração do vídeo em segundos (ffprobe). */
export function duracao(arquivo) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', arquivo], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffprobe não leu ${arquivo}: ${r.stderr}`);
  return Number(r.stdout.trim());
}

/** Corta o Short e devolve o caminho da saída. */
export async function cortarShort({ entrada, saida, inicio, fim, camera, jogo, titulo, fonte, log = console.log }) {
  if (!existsSync(entrada)) throw new Error(`Vídeo não encontrado: ${entrada}`);
  if (!temFfmpeg()) throw new Error('ffmpeg não encontrado: instale (sudo apt install ffmpeg / brew install ffmpeg / winget install ffmpeg)');
  let arquivosTitulo = [];
  let f = null;
  if (titulo) {
    f = acharFonte(fonte);
    if (!f) log('Aviso: nenhuma fonte encontrada; o Short sai sem o gancho. Use --fonte caminho.ttf');
    else {
      const { linhas, sobra } = quebrarTitulo(titulo.toUpperCase());
      if (sobra) log(`Aviso: o gancho passa de ${GANCHO.linhas} linhas; ficou de fora: "${sobra}". Encurte para caber.`);
      const pasta = mkdtempSync(join(tmpdir(), 'daltoni-'));
      arquivosTitulo = linhas.map((l, i) => {
        const arq = join(pasta, `linha${i}.txt`);
        writeFileSync(arq, l);
        return arq;
      });
    }
  }
  const args = argumentosCorte({ entrada, saida, inicio, fim, camera, jogo, arquivosTitulo, fonte: f });
  await new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let erro = '';
    p.stderr.on('data', (d) => { erro = (erro + d).slice(-4000); });
    p.on('error', reject);
    p.on('close', (c) => (c === 0 ? resolve() : reject(new Error(`ffmpeg saiu com ${c}:\n${erro}`))));
  });
  return saida;
}
