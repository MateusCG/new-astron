#!/usr/bin/env node
// Publicador do DaltoniGames: corta o Short e envia para o YouTube e o TikTok
// pelas APIs oficiais. As chaves ficam em ~/.daltonigames/ (lib/credenciais.js).
//
// `enviar` sem --confirmar é um ensaio: mostra exatamente o que iria para
// cada plataforma e não envia nada. Publicar é para fora, não se desfaz
// sozinho, então só sai com o --confirmar.

import { existsSync, writeFileSync, appendFileSync, readFileSync } from 'node:fs';
import { basename, dirname, join, extname, resolve } from 'node:path';
import { lerArgumentos, lista, retangulo, segundos } from './lib/argumentos.js';
import { metadadosYoutube, legendaTiktok, PRIVACIDADE_TIKTOK } from './lib/textos.js';
import { lerJson, caminho, pastaCredenciais } from './lib/credenciais.js';
import { cortarShort, duracao, temFfmpeg, SHORT } from './lib/corte.js';

const AJUDA = `Publicador do DaltoniGames

  node publicar.mjs autorizar youtube
  node publicar.mjs autorizar tiktok [--modo rascunho|direto]
  node publicar.mjs conta
      Mostra o canal do YouTube e o usuário do TikTok autorizados.

  node publicar.mjs cortar <video> --inicio 1:20 --fim 1:50
        [--camera x,y,l,a] [--jogo x,y,l,a] [--titulo "gancho"] [--saida arquivo.mp4] [--fonte arq.ttf]
      Corta o Short em pé (1080x1920). --camera é o retângulo da sua câmera no vídeo gravado.

  node publicar.mjs enviar <arquivo.mp4> --titulo "..." [--descricao "..."] [--tags a,b,c]
        [--onde youtube,tiktok] [--privacidade privado|naoListado|publico]
        [--tiktok rascunho|direto] [--privacidade-tiktok privado|amigos|seguidores|publico]
        [--legenda-tiktok "..."] [--agendar 2026-11-20T18:00:00-03:00] [--longo] [--ia] [--confirmar]
      Sem --confirmar é só um ensaio: mostra o que iria e não envia.

  node publicar.mjs situacao <publish_id>
      Situação de um envio do TikTok.

As chaves ficam em ${pastaCredenciais()} (mude com DALTONI_DIR).`;

const log = (...a) => console.log(...a);

function lerTexto(valor) {
  if (!valor || valor === true) return '';
  const s = String(valor);
  // --descricao @arquivo.txt lê do arquivo (descrição longa com quebras de linha).
  if (s.startsWith('@') && existsSync(s.slice(1))) return readFileSync(s.slice(1), 'utf8');
  return s.replace(/\\n/g, '\n');
}

async function autorizar(pos, op) {
  const qual = pos[1];
  if (qual === 'youtube') {
    const { autorizarYoutube, tokenYoutube, meuCanal } = await import('./lib/youtube.js');
    await autorizarYoutube({ log });
    const canal = await meuCanal(await tokenYoutube());
    log(canal ? `✔ YouTube autorizado: ${canal.titulo} (${canal.handle ?? canal.id})` : '✔ Autorizado, mas a conta não tem canal do YouTube');
  } else if (qual === 'tiktok') {
    const { autorizarTiktok, tokenTiktok, meuUsuario } = await import('./lib/tiktok.js');
    const modo = op.modo === 'direto' ? 'direto' : 'rascunho';
    await autorizarTiktok({ modo, log });
    const u = await meuUsuario(await tokenTiktok()).catch(() => null);
    log(`✔ TikTok autorizado (${modo})${u ? `: ${u.display_name}` : ''}`);
  } else {
    throw new Error('Use: autorizar youtube | autorizar tiktok');
  }
}

async function conta() {
  if (lerJson('tokens-youtube.json')) {
    const { tokenYoutube, meuCanal } = await import('./lib/youtube.js');
    const c = await meuCanal(await tokenYoutube());
    log(c ? `YouTube: ${c.titulo} ${c.handle ?? ''} · ${c.inscritos ?? '?'} inscritos · ${c.videos ?? '?'} vídeos` : 'YouTube: conta sem canal');
  } else log('YouTube: não autorizado');
  if (lerJson('tokens-tiktok.json')) {
    const { tokenTiktok, meuUsuario } = await import('./lib/tiktok.js');
    const u = await meuUsuario(await tokenTiktok());
    log(`TikTok: ${u?.display_name ?? '(sem nome)'}`);
  } else log('TikTok: não autorizado');
}

async function cortar(pos, op) {
  const entrada = pos[1];
  if (!entrada) throw new Error('Use: cortar <video> --inicio 1:20 --fim 1:50');
  const inicio = segundos(op.inicio, 'inicio') ?? 0;
  const fim = segundos(op.fim, 'fim');
  const saida = op.saida && op.saida !== true
    ? String(op.saida)
    : join(dirname(entrada), `${basename(entrada, extname(entrada))}-short-${Math.round(inicio)}s.mp4`);
  log(`Cortando ${entrada} de ${inicio}s a ${fim ?? 'o fim'}...`);
  await cortarShort({
    entrada, saida, inicio, fim,
    camera: retangulo(op.camera, 'camera'),
    jogo: retangulo(op.jogo, 'jogo'),
    titulo: op.titulo === true ? null : op.titulo,
    fonte: op.fonte === true ? null : op.fonte,
    log,
  });
  log(`✔ Short pronto: ${resolve(saida)} (${duracao(saida).toFixed(1)} s)`);
}

/** O plano do envio: o que vai para cada plataforma, e os avisos. */
export function planoDeEnvio(arquivo, op) {
  const onde = lista(op.onde ?? 'youtube,tiktok');
  for (const o of onde) if (!['youtube', 'tiktok'].includes(o)) throw new Error(`--onde: youtube e/ou tiktok (veio "${o}")`);
  const titulo = op.titulo === true ? '' : String(op.titulo ?? '');
  const descricao = lerTexto(op.descricao);
  const tags = lista(op.tags);
  const privacidade = op.privacidade && op.privacidade !== true ? String(op.privacidade) : 'publico';
  const config = lerJson('config.json') ?? {};
  const plano = { arquivo, onde, avisos: [] };
  if (onde.includes('youtube')) {
    const m = metadadosYoutube({ titulo, descricao, tags, privacidade, ia: Boolean(op.ia), agendar: op.agendar === true ? null : op.agendar });
    plano.youtube = { corpo: m.corpo, curto: !op.longo };
    if (m.tagsFora.length) plano.avisos.push(`YouTube: tags fora do limite de 500 caracteres: ${m.tagsFora.join(', ')}`);
    if (!config.youtubeAuditado) {
      plano.avisos.push('YouTube: o projeto ainda não passou na auditoria da API, então o vídeo vai ficar TRAVADO como privado e não dá para tornar público depois. Para publicar de verdade, envie pelo app ou espere a auditoria (depois ponha "youtubeAuditado": true em config.json).');
    }
  }
  if (onde.includes('tiktok')) {
    const modo = op.tiktok === 'direto' ? 'direto' : 'rascunho';
    const pt = op['privacidade-tiktok'] && op['privacidade-tiktok'] !== true ? String(op['privacidade-tiktok']) : (config.tiktokAuditado ? 'publico' : 'privado');
    const nivel = PRIVACIDADE_TIKTOK[pt];
    if (!nivel) throw new Error(`--privacidade-tiktok: ${Object.keys(PRIVACIDADE_TIKTOK).join(', ')}`);
    plano.tiktok = { modo, legenda: legendaTiktok({ titulo, descricao, tags, legenda: op['legenda-tiktok'] === true ? null : op['legenda-tiktok'] }), privacidade: nivel, ia: Boolean(op.ia) };
    if (modo === 'rascunho') plano.avisos.push('TikTok: vai para a caixa de entrada do app; abra o TikTok, cole a legenda (salva num .txt ao lado do vídeo) e publique.');
    else if (!config.tiktokAuditado && nivel !== 'SELF_ONLY') plano.avisos.push('TikTok: app sem auditoria só posta como privado (SELF_ONLY), e numa conta privada.');
  }
  return plano;
}

function mostrarPlano(p) {
  log(`Arquivo: ${resolve(p.arquivo)}`);
  if (temFfmpeg()) {
    try {
      const d = duracao(p.arquivo);
      log(`Duração: ${d.toFixed(1)} s${d > SHORT.maxS && p.youtube?.curto ? ' (passa de 3 min: no YouTube não vira Short; use --longo)' : ''}`);
    } catch { /* sem ffprobe ou arquivo estranho: segue */ }
  }
  if (p.youtube) {
    const { snippet, status } = p.youtube.corpo;
    log('\n▶ YouTube');
    log(`  Título: ${snippet.title}`);
    log(`  Privacidade: ${status.privacyStatus}${status.publishAt ? ` (publica sozinho em ${status.publishAt})` : ''}`);
    log(`  Tags: ${snippet.tags.join(', ') || '(nenhuma)'}`);
    log(`  Conteúdo sintético (IA): ${status.containsSyntheticMedia ? 'sim' : 'não'}`);
    if (snippet.description) log('  Descrição:\n' + snippet.description.split('\n').map((l) => '    ' + l).join('\n'));
  }
  if (p.tiktok) {
    log(`\n♪ TikTok (${p.tiktok.modo})`);
    if (p.tiktok.modo === 'direto') log(`  Privacidade: ${p.tiktok.privacidade}`);
    log('  Legenda:\n' + p.tiktok.legenda.split('\n').map((l) => '    ' + l).join('\n'));
  }
  for (const a of p.avisos) log(`\n⚠ ${a}`);
}

async function enviar(pos, op) {
  const arquivo = pos[1];
  if (!arquivo) throw new Error('Use: enviar <arquivo.mp4> --titulo "..."');
  if (!existsSync(arquivo)) throw new Error(`Arquivo não encontrado: ${arquivo}`);
  const p = planoDeEnvio(arquivo, op);
  mostrarPlano(p);
  if (!op.confirmar) {
    log('\nEnsaio: nada foi enviado. Repita com --confirmar para publicar.');
    return;
  }
  const registro = { quando: new Date().toISOString(), arquivo: resolve(arquivo) };
  if (p.youtube) {
    const { tokenYoutube, enviarYoutube } = await import('./lib/youtube.js');
    log('\nEnviando para o YouTube...');
    const r = await enviarYoutube({ arquivo, corpo: p.youtube.corpo, curto: p.youtube.curto, token: await tokenYoutube() });
    log(`✔ YouTube: ${r.url} (${r.privacidade})`);
    registro.youtube = r;
  }
  if (p.tiktok) {
    const { tokenTiktok, enviarTiktok } = await import('./lib/tiktok.js');
    if (p.tiktok.modo === 'rascunho') {
      const txt = arquivo.replace(/\.[^.]+$/, '') + '.tiktok.txt';
      writeFileSync(txt, p.tiktok.legenda + '\n');
      log(`\nLegenda do TikTok salva em ${txt}`);
    }
    log('Enviando para o TikTok...');
    const r = await enviarTiktok({ arquivo, token: await tokenTiktok(), modo: p.tiktok.modo, legenda: p.tiktok.legenda, privacidade: p.tiktok.privacidade, ia: p.tiktok.ia });
    log(`✔ TikTok: enviado (${r.modo}), publish_id ${r.publishId}. Acompanhe com: node publicar.mjs situacao ${r.publishId}`);
    registro.tiktok = r;
  }
  try { appendFileSync(caminho('historico.jsonl'), JSON.stringify(registro) + '\n'); } catch { /* histórico é só conveniência */ }
}

async function situacao(pos) {
  if (!pos[1]) throw new Error('Use: situacao <publish_id>');
  const { tokenTiktok, situacaoTiktok } = await import('./lib/tiktok.js');
  const s = await situacaoTiktok(await tokenTiktok(), pos[1]);
  log(`TikTok: ${s.status}${s.fail_reason ? ` (${s.fail_reason})` : ''}`);
}

async function principal(argv) {
  const { pos, op } = lerArgumentos(argv);
  const cmd = pos[0];
  if (!cmd || cmd === 'ajuda' || op.ajuda || op.help) return log(AJUDA);
  if (cmd === 'autorizar') return autorizar(pos, op);
  if (cmd === 'conta') return conta();
  if (cmd === 'cortar') return cortar(pos, op);
  if (cmd === 'enviar') return enviar(pos, op);
  if (cmd === 'situacao') return situacao(pos);
  throw new Error(`Comando desconhecido: ${cmd}\n\n${AJUDA}`);
}

const ehPrincipal = process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname);
if (ehPrincipal) {
  principal(process.argv.slice(2)).catch((e) => {
    console.error(`✖ ${e.message}`);
    process.exit(1);
  });
}
