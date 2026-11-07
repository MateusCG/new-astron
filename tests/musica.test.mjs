// Música da partida (public/js/musica.js): o arquivo existe, começa do zero no canal da
// música, sobe até o ganho do arquivo, some e pausa ao sair, e sem Web Audio fica quieta.
// O servidor entrega a faixa por intervalo (Range), que o <audio> usa para tocar em fluxo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MusicaPartida,
  MUSICA_PARTIDA,
  GANHO_MUSICA,
  ALVO_MUSICA,
  LUFS_MUSICA_PARTIDA,
} from '../public/js/musica.js';
import { iniciar, intervaloPedido } from '../server/index.js';
import { World } from '../server/game.js';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** AudioParam de mentira: guarda o alvo da última rampa. */
function param(v = 1) {
  return {
    value: v,
    alvo: v,
    setTargetAtTime(a) {
      this.alvo = a;
    },
    setValueAtTime(a) {
      this.value = a;
    },
    cancelScheduledValues() {},
  };
}

function dubles({ semWebAudio = false } = {}) {
  const ligacoes = [];
  const no = (nome) => ({ nome, gain: param(), connect(d) { ligacoes.push([nome, d.nome]); } });
  const ctx = semWebAudio
    ? null
    : {
        currentTime: 3,
        createGain: () => no('ganho'),
        createMediaElementSource: () => no('fonte'),
      };
  const sons = {
    ctx,
    saidaMusica: ctx ? no('musica') : null,
    desbloqueios: 0,
    desbloquear() {
      this.desbloqueios++;
    },
  };
  const audio = {
    src: '',
    loop: false,
    preload: '',
    currentTime: 42,
    tocou: 0,
    pausou: 0,
    load() {},
    play() {
      this.tocou++;
      return Promise.resolve();
    },
    pause() {
      this.pausou++;
    },
  };
  let criados = 0;
  const musica = new MusicaPartida({ sons, criarAudio: () => (criados++, audio) });
  return { sons, audio, musica, ligacoes, criados: () => criados };
}

test('musica: o arquivo da trilha existe em public/sons/', () => {
  const arquivo = path.join(RAIZ, 'public/sons', MUSICA_PARTIDA);
  assert.ok(existsSync(arquivo), arquivo);
  assert.ok(statSync(arquivo).size > 1e6, 'a trilha inteira, não um pedaço');
});

test('musica: o ganho leva o arquivo ao alvo, abaixo dos efeitos', () => {
  assert.ok(Math.abs(20 * Math.log10(GANHO_MUSICA) - (ALVO_MUSICA - LUFS_MUSICA_PARTIDA)) < 1e-9);
  assert.ok(GANHO_MUSICA < 1, 'o arquivo é mais alto que o alvo');
  assert.ok(ALVO_MUSICA <= -20, 'música de fundo: abaixo dos tiros (−16)');
});

test('musica: preparar busca uma vez só, repetindo, sem tocar', () => {
  const { musica, audio, criados } = dubles();
  musica.preparar();
  musica.preparar();
  assert.equal(criados(), 1);
  assert.equal(audio.src, '/sons/' + MUSICA_PARTIDA);
  assert.equal(audio.loop, true);
  assert.equal(audio.preload, 'auto');
  assert.equal(audio.tocou, 0);
});

test('musica: tocar começa do zero no canal da música e sobe até o ganho', () => {
  const { musica, audio, ligacoes, sons } = dubles();
  musica.tocar();
  assert.equal(audio.tocou, 1);
  assert.equal(audio.currentTime, 0);
  assert.ok(musica.tocando);
  assert.ok(sons.desbloqueios >= 1);
  assert.deepEqual(ligacoes, [
    ['fonte', 'ganho'],
    ['ganho', 'musica'],
  ]);
  assert.equal(musica.ganho.gain.value, 0, 'entra do silêncio');
  assert.equal(musica.ganho.gain.alvo, GANHO_MUSICA);
  // A segunda partida reaproveita a mesma fonte (um MediaElementSource por elemento).
  musica.parar();
  audio.currentTime = 300;
  musica.tocar();
  assert.equal(ligacoes.length, 2);
  assert.equal(audio.currentTime, 0);
  assert.equal(audio.tocou, 2);
});

test('musica: parar some e pausa; tocar logo depois não deixa a pausa velha cortar', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { musica, audio } = dubles();
  musica.tocar();
  musica.parar();
  assert.equal(musica.tocando, false);
  assert.equal(musica.ganho.gain.alvo, 0);
  t.mock.timers.tick(2000);
  assert.equal(audio.pausou, 1);

  musica.tocar();
  musica.parar();
  musica.tocar(); // voltou para outra partida antes da pausa
  t.mock.timers.tick(2000);
  assert.equal(audio.pausou, 1, 'a pausa da saída anterior não vale mais');
  assert.equal(musica.ganho.gain.alvo, GANHO_MUSICA);

  musica.parar();
  musica.parar(); // sair de novo não faz nada
  t.mock.timers.tick(2000);
  assert.equal(audio.pausou, 2);
});

test('musica: sem Web Audio, nada toca e nada quebra', () => {
  const { musica, audio } = dubles({ semWebAudio: true });
  musica.tocar();
  musica.parar();
  assert.equal(audio.tocou, 0);
  assert.equal(musica.tocando, false);
  const semAudio = new MusicaPartida({ sons: { desbloquear() {}, saidaMusica: null }, criarAudio: () => null });
  semAudio.tocar();
  semAudio.parar();
});

test('servidor: intervalo do cabeçalho Range', () => {
  assert.deepEqual(intervaloPedido('bytes=0-', 100), { inicio: 0, fim: 99 });
  assert.deepEqual(intervaloPedido('bytes=10-19', 100), { inicio: 10, fim: 19 });
  assert.deepEqual(intervaloPedido('bytes=90-500', 100), { inicio: 90, fim: 99 });
  assert.deepEqual(intervaloPedido('bytes=-30', 100), { inicio: 70, fim: 99 });
  assert.equal(intervaloPedido('bytes=100-', 100), false);
  assert.equal(intervaloPedido('bytes=20-10', 100), false);
  assert.equal(intervaloPedido(undefined, 100), null);
  assert.equal(intervaloPedido('bytes=0-1,5-6', 100), null, 'vários intervalos: o arquivo inteiro');
});

test('servidor: a trilha sai por intervalo (206) e inteira sem Range', async () => {
  const srv = await iniciar({ porta: 0, world: new World({ preparacaoS: 0, jungle: false, torretas: false }) });
  try {
    const url = `http://localhost:${srv.porta}/sons/${MUSICA_PARTIDA}`;
    const tamanho = statSync(path.join(RAIZ, 'public/sons', MUSICA_PARTIDA)).size;
    const parte = await fetch(url, { headers: { range: 'bytes=100-199' } });
    assert.equal(parte.status, 206);
    assert.equal(parte.headers.get('content-type'), 'audio/mpeg');
    assert.equal(parte.headers.get('content-range'), `bytes 100-199/${tamanho}`);
    assert.equal((await parte.arrayBuffer()).byteLength, 100);

    const fora = await fetch(url, { headers: { range: `bytes=${tamanho}-` } });
    assert.equal(fora.status, 416);
    await fora.arrayBuffer();

    const html = await fetch(`http://localhost:${srv.porta}/`);
    assert.equal(html.status, 200);
    assert.equal(html.headers.get('accept-ranges'), 'bytes');
    await html.text();

    const nada = await fetch(`http://localhost:${srv.porta}/sons/musica/nao-existe.mp3`, { headers: { range: 'bytes=0-' } });
    assert.equal(nada.status, 404);
    await nada.text();
  } finally {
    await srv.fechar();
  }
});
