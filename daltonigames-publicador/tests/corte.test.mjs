import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { argumentosCorte, filtroDoShort, quebrarTitulo, cortarShort, temFfmpeg, duracao, acharFonte } from '../lib/corte.js';

test('gancho em até 3 linhas curtas', () => {
  assert.deepEqual(quebrarTitulo('ESCAPEI COM 1 DE VIDA DO CICLOPE SENDO DALTÔNICO'), { linhas: ['ESCAPEI COM 1 DE', 'VIDA DO CICLOPE', 'SENDO DALTÔNICO'], sobra: '' });
  assert.equal(quebrarTitulo('SOU DALTÔNICO E MEU JOGO TEM TIME VERDE CONTRA VERMELHO').sobra, 'VERMELHO');
});

test('filtro: uma linha centrada por arquivo do gancho', () => {
  const f = filtroDoShort({ arquivosTitulo: ['/t/a.txt', '/t/b.txt'], fonte: '/f/x.ttf' });
  assert.equal((f.match(/drawtext=/g) || []).length, 2);
  assert.match(f, /x=\(w-text_w\)\/2:y=220/);
  assert.match(f, /y=324/);
});

test('filtro: com câmera empilha câmera (700) e jogo (1220)', () => {
  const f = filtroDoShort({ camera: { x: 1500, y: 40, l: 380, a: 300 } });
  assert.match(f, /crop=380:300:1500:40,scale=1080:700/);
  assert.match(f, /scale=1080:1220/);
  assert.match(f, /vstack/);
  assert.match(f, /\[v\]$/);
});

test('filtro: sem câmera, jogo no meio sobre o fundo desfocado', () => {
  const f = filtroDoShort({});
  assert.match(f, /boxblur/);
  assert.match(f, /overlay=\(W-w\)\/2:\(H-h\)\/2/);
});

test('argumentos: trecho, áudio opcional e Short de até 3 min', () => {
  const a = argumentosCorte({ entrada: 'in.mp4', saida: 'out.mp4', inicio: 80, fim: 110 });
  assert.deepEqual(a.slice(a.indexOf('-ss'), a.indexOf('-ss') + 4), ['-ss', '80', '-t', '30']);
  assert.ok(a.includes('0:a?'));
  assert.equal(a.at(-1), 'out.mp4');
  assert.throws(() => argumentosCorte({ entrada: 'i', saida: 'o', inicio: 0, fim: 200 }));
  assert.throws(() => argumentosCorte({ entrada: 'i', saida: 'o', inicio: 50, fim: 40 }));
});

test('corte de verdade com o ffmpeg: 1080x1920 com câmera e gancho', { skip: !temFfmpeg() && 'sem ffmpeg' }, async () => {
  const pasta = mkdtempSync(join(tmpdir(), 'daltoni-corte-'));
  const entrada = join(pasta, 'gravacao.mp4');
  const gerar = spawnSync('ffmpeg', ['-hide_banner', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=30:duration=6', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=6', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', entrada]);
  assert.equal(gerar.status, 0, String(gerar.stderr));
  const saida = join(pasta, 'short.mp4');
  await cortarShort({ entrada, saida, inicio: 1, fim: 5, camera: { x: 1500, y: 40, l: 380, a: 300 }, titulo: acharFonte() ? 'Escapei com 1 de vida' : null, log: () => {} });
  const p = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate', '-of', 'csv=p=0', saida], { encoding: 'utf8' });
  assert.equal(p.stdout.trim(), '1080,1920,30/1');
  assert.ok(Math.abs(duracao(saida) - 4) < 0.2);
  const audio = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', saida], { encoding: 'utf8' });
  assert.equal(audio.stdout.trim(), 'aac');
});
