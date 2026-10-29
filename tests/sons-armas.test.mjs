// Insumos do jogo original (sons, modelos das armas, texturas dos efeitos) e o módulo
// de áudio do cliente. Os arquivos citados nas LISTA.md têm que existir (e o inverso),
// o servidor tem que servir cada tipo com o MIME certo e o sons.js tem que respeitar
// os limites de voz sem quebrar quando um som falha.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { iniciar } from '../server/index.js';
import { World } from '../server/game.js';
import {
  Sons,
  VOLUME_MUSICA_PADRAO,
  SONS_INTERFACE,
  SONS_ARMA,
  ganhoPorDistancia,
  panPorDirecao,
  DISTANCIA_REF,
  ALCANCE,
} from '../public/js/sons.js';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SONS = path.join(RAIZ, 'public/sons');
const ARMAS = path.join(RAIZ, 'public/modelos/armas');
const EFEITOS = path.join(RAIZ, 'public/texturas/efeitos');

/** Nomes entre crases na primeira coluna das tabelas da LISTA.md. */
function primeiraColuna(lista) {
  const nomes = [];
  for (const linha of readFileSync(lista, 'utf8').split('\n')) {
    if (!linha.startsWith('| `')) continue;
    const celula = linha.split('|')[1];
    for (const m of celula.matchAll(/`([^`]+)`/g)) nomes.push(m[1]);
  }
  return nomes;
}

test('sons: todo som da LISTA existe e todo arquivo está na LISTA', () => {
  const lista = primeiraColuna(path.join(SONS, 'LISTA.md'));
  const arquivos = readdirSync(SONS).filter((f) => f.endsWith('.wav')).map((f) => f.slice(0, -4));
  assert.ok(arquivos.length > 40);
  assert.deepEqual([...new Set(lista)].sort(), arquivos.sort());
  for (const f of arquivos) {
    const d = readFileSync(path.join(SONS, f + '.wav'));
    assert.equal(d.toString('ascii', 0, 4), 'RIFF', f);
    assert.equal(d.toString('ascii', 8, 12), 'WAVE', f);
  }
});

test('sons: as tabelas do sons.js apontam para arquivos que existem', () => {
  for (const nome of [...Object.values(SONS_INTERFACE), ...Object.values(SONS_ARMA)]) {
    assert.ok(readdirSync(SONS).includes(nome + '.wav'), nome);
  }
});

test('armas: todo modelo da LISTA existe, é GLB válido e traz raça, lado e boca', () => {
  const lista = primeiraColuna(path.join(ARMAS, 'LISTA.md')).map((n) => n.replace(/\.glb$/, ''));
  const arquivos = readdirSync(ARMAS).filter((f) => f.endsWith('.glb')).map((f) => f.slice(0, -4));
  assert.ok(arquivos.length >= 150);
  assert.deepEqual([...lista].sort(), arquivos.sort());
  let comBoca = 0;
  for (const nome of arquivos) {
    const d = readFileSync(path.join(ARMAS, nome + '.glb'));
    assert.equal(d.readUInt32LE(0), 0x46546c67, nome); // "glTF"
    assert.equal(d.readUInt32LE(4), 2, nome);
    assert.equal(d.readUInt32LE(8), d.length, nome);
    const json = JSON.parse(d.toString('utf8', 20, 20 + d.readUInt32LE(12)));
    const raiz = json.nodes[json.scenes[0].nodes[0]];
    const info = raiz.extras.astron_arma;
    assert.equal(info.modelo, nome);
    assert.equal(info.raca, { aw: 'acron', bw: 'bellico', sw: 'shrewdo' }[nome.slice(0, 2)]);
    assert.equal(info.lado, /_[lr]$/.test(nome) ? nome.at(-1) : null);
    assert.ok(json.meshes.length > 0, nome);
    if (json.nodes.some((n) => n.name === 'fire' && n.extras?.astron_helper)) comBoca++;
  }
  assert.ok(comBoca > 100, 'a maioria das armas tem a boca (fire)');
});

test('efeitos: toda textura da LISTA existe e todo PNG está na LISTA', () => {
  const lista = primeiraColuna(path.join(EFEITOS, 'LISTA.md')).filter((n) => n.endsWith('.png'));
  const arquivos = readdirSync(EFEITOS).filter((f) => f.endsWith('.png'));
  assert.ok(arquivos.length > 50);
  assert.deepEqual([...new Set(lista)].sort(), arquivos.sort());
});

test('servidor: serve som, modelo de arma e textura de efeito com o tipo certo', async () => {
  const srv = await iniciar({ porta: 0, world: new World({ preparacaoS: 0, jungle: false, torretas: false }) });
  try {
    const casos = [
      ['/sons/shot_ray.wav', 'audio/wav'],
      ['/modelos/armas/aw001_l.glb', 'model/gltf-binary'],
      ['/texturas/efeitos/0112001.png', 'image/png'],
    ];
    for (const [rota, tipo] of casos) {
      const r = await fetch(`http://localhost:${srv.porta}${rota}`);
      assert.equal(r.status, 200, rota);
      assert.equal(r.headers.get('content-type'), tipo, rota);
      assert.ok((await r.arrayBuffer()).byteLength > 100, rota);
    }
  } finally {
    await srv.fechar();
  }
});

test('sons.js: volume cai com a distância e some no alcance', () => {
  assert.equal(ganhoPorDistancia(0), 1);
  assert.equal(ganhoPorDistancia(DISTANCIA_REF), 1);
  assert.ok(Math.abs(ganhoPorDistancia(DISTANCIA_REF * 2) - 0.5) < 1e-9);
  assert.ok(ganhoPorDistancia(300) > ganhoPorDistancia(600));
  assert.equal(ganhoPorDistancia(ALCANCE), 0);
  assert.equal(ganhoPorDistancia(ALCANCE + 1), 0);
  assert.equal(ganhoPorDistancia(NaN), 0);
});

test('sons.js: pan pela direção da nave (frente = -z com yaw 0)', () => {
  assert.ok(panPorDirecao(100, 0, 0, 0, 0) > 0.7, 'à direita');
  assert.ok(panPorDirecao(-100, 0, 0, 0, 0) < -0.7, 'à esquerda');
  assert.ok(Math.abs(panPorDirecao(0, -100, 0, 0, 0)) < 1e-9, 'na frente');
  // Virada 90° para a esquerda (yaw +π/2, frente = -x): o que está em -z fica à direita.
  assert.ok(panPorDirecao(0, -100, 0, 0, Math.PI / 2) > 0.7);
  assert.equal(panPorDirecao(0, 0, 0, 0, 0), 0);
});

// Dublê mínimo da Web Audio API: conta as fontes que tocam e param.
function contextoFalso() {
  const ctx = {
    state: 'running',
    currentTime: 0,
    destination: {},
    tocando: 0,
    paradas: 0,
    inicios: [],
    createGain: () => ({ gain: { value: 1, alvo: null, setTargetAtTime(v) { this.alvo = v; } }, connect() {}, disconnect() {} }),
    createStereoPanner: () => ({ pan: { value: 0 }, connect() {}, disconnect() {} }),
    createBufferSource: () => ({
      buffer: null,
      playbackRate: { value: 1 },
      connect() {},
      disconnect() {},
      start(quando = 0, desde = 0) {
        ctx.tocando++;
        ctx.inicios.push([quando, desde]);
      },
      stop() {
        ctx.paradas++;
      },
    }),
    decodeAudioData: (bytes) => Promise.resolve({ duration: 1, bytes }),
    resume: () => Promise.resolve(),
  };
  return ctx;
}

const buscarFalso = (url) =>
  Promise.resolve(url.includes('falta') ? { ok: false, status: 404 } : { ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) });

test('sons.js: só toca depois de desbloquear e com o som carregado', async () => {
  const ctx = contextoFalso();
  const sons = new Sons({ criarContexto: () => ctx, buscar: buscarFalso });
  await sons.carregar(['shot_ray', 'falta']);
  assert.equal(sons.tocar('shot_ray'), false, 'antes do gesto não toca');
  sons.desbloquear();
  await sons.carregar('shot_ray');
  assert.ok(sons.carregado('shot_ray'));
  assert.equal(sons.carregado('falta'), false);
  assert.equal(sons.tocar('falta'), false, 'som que falhou não quebra');
  assert.equal(sons.tocar('nunca_pedido'), false, 'som não carregado não toca');
  assert.equal(sons.tocarInterface('shot_ray'), true);
  assert.equal(sons.tocar('shot_ray', { x: ALCANCE * 2, z: 0 }), false, 'longe demais não toca');
});

test('sons.js: limita vozes por som e no total, e junta cópias simultâneas', async () => {
  const ctx = contextoFalso();
  const sons = new Sons({ criarContexto: () => ctx, buscar: buscarFalso, maxPorSom: 3, maxTotal: 5 });
  sons.desbloquear();
  await sons.carregar(['a', 'b', 'c']);
  assert.equal(sons.tocar('a'), true);
  assert.equal(sons.tocar('a'), false, 'mesmo som no mesmo instante vira um só');
  for (let i = 0; i < 5; i++) {
    ctx.currentTime += 0.05;
    sons.tocar('a');
  }
  assert.equal(sons.vozes, 3, 'no máximo 3 cópias do mesmo som');
  for (let i = 0; i < 4; i++) {
    ctx.currentTime += 0.05;
    sons.tocar('b', { volume: 1 + i * 0.1 });
  }
  assert.equal(sons.vozes, 5, 'no máximo 5 no total');
  ctx.currentTime += 0.05;
  assert.equal(sons.tocar('c', { volume: 0.05 }), false, 'som mais baixo que todos não entra com tudo cheio');
  assert.equal(sons.tocar('c', { volume: 2 }), true, 'som mais alto entra no lugar do mais baixo');
  assert.equal(sons.vozes, 5);
  ctx.currentTime += 5;
  assert.equal(sons.vozes, 0, 'vozes que acabaram saem da conta');
});

test('sons.js: voz controlada começa do ponto pedido, segue a posição e para; o atraso agenda', async () => {
  const ctx = contextoFalso();
  const sons = new Sons({ criarContexto: () => ctx, buscar: buscarFalso });
  sons.desbloquear();
  await sons.carregar(['carga', 'chegada']);
  sons.ouvinte(0, 0, 0);
  // Longe (ganho quase zero) ainda começa: sobe quando a nave chega perto.
  const voz = sons.tocarControlado('carga', { x: ALCANCE * 0.95, z: 0, desde: 0.6 });
  assert.ok(voz);
  assert.deepEqual(ctx.inicios.at(-1), [0, 0.6]);
  assert.equal(sons.vozes, 1);
  voz.mover(10, 0, 1);
  voz.parar();
  assert.equal(sons.vozes, 0);
  assert.equal(ctx.paradas, 1);
  voz.parar(); // de novo não quebra
  assert.equal(sons.tocar('chegada', { x: 5, z: 0, atraso: 0.12 }), true);
  assert.deepEqual(ctx.inicios.at(-1), [0.12, 0]);
  assert.equal(sons.tocarControlado('nunca_pedido'), null);
});

test('sons.js: volume e mudo ficam guardados no navegador', () => {
  const guardado = new Map();
  const antes = globalThis.localStorage;
  globalThis.localStorage = { getItem: (k) => guardado.get(k) ?? null, setItem: (k, v) => guardado.set(k, v) };
  try {
    const a = new Sons({ criarContexto: () => contextoFalso(), buscar: buscarFalso });
    a.volumeEfeitos = 0.3;
    a.volumeMusica = 0.45;
    a.mudo = true;
    const b = new Sons({ criarContexto: () => contextoFalso(), buscar: buscarFalso });
    assert.equal(b.volumeEfeitos, 0.3);
    assert.equal(b.volumeMusica, 0.45);
    assert.equal(b.mudo, true);
    b.volumeMusica = 7;
    assert.equal(b.volumeMusica, 1, 'volume fica entre 0 e 1');
    b.volumeEfeitos = 'x';
    assert.equal(b.volumeEfeitos, 0.3, 'valor inválido não muda o volume');
    // Quem já tinha ajustado o antigo volume geral fica com ele nos efeitos.
    guardado.clear();
    guardado.set('astron.som.volume', '0.25');
    const velho = new Sons({ criarContexto: () => contextoFalso(), buscar: buscarFalso });
    assert.equal(velho.volumeEfeitos, 0.25);
    assert.equal(velho.volumeMusica, VOLUME_MUSICA_PADRAO);
    globalThis.localStorage = {
      getItem() {
        throw new Error('bloqueado');
      },
      setItem() {
        throw new Error('bloqueado');
      },
    };
    const c = new Sons({ criarContexto: () => contextoFalso(), buscar: buscarFalso });
    c.mudo = true; // não pode lançar
    assert.equal(c.mudo, true);
  } finally {
    if (antes === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = antes;
  }
});

test('sons.js: efeitos e música têm volumes separados e o mudo cala os dois', async () => {
  const ctx = contextoFalso();
  // Grava em quem cada nó de ganho se liga, para conferir o caminho do som.
  const ganhos = [];
  ctx.createGain = () => {
    const no = { gain: { value: 1, setTargetAtTime(v) { this.value = v; } }, ligadoEm: null, disconnect() {} };
    no.connect = (alvo) => (no.ligadoEm = alvo);
    ganhos.push(no);
    return no;
  };
  const sons = new Sons({ criarContexto: () => ctx, buscar: buscarFalso });
  sons.volumeEfeitos = 0.5;
  sons.volumeMusica = 0.2;
  sons.desbloquear();
  assert.equal(sons.efeitos.gain.value, 0.5, 'volume ajustado antes do gesto vale ao desbloquear');
  assert.equal(sons.saidaMusica.gain.value, 0.2);
  assert.equal(sons.efeitos.ligadoEm, sons.mestre);
  assert.equal(sons.saidaMusica.ligadoEm, sons.mestre);
  assert.equal(sons.mestre.ligadoEm, ctx.destination);

  await sons.carregar('shot_ray');
  assert.equal(sons.tocarInterface('shot_ray'), true);
  assert.equal(ganhos.at(-1).ligadoEm, sons.efeitos, 'efeito toca pelo canal de efeitos');

  sons.volumeMusica = 0.9;
  assert.equal(sons.saidaMusica.gain.value, 0.9);
  assert.equal(sons.efeitos.gain.value, 0.5, 'mexer na música não mexe nos efeitos');
  sons.mudo = true;
  assert.equal(sons.mestre.gain.value, 0);
  assert.equal(sons.efeitos.gain.value, 0.5, 'o mudo não apaga o ajuste');
  sons.mudo = false;
  assert.equal(sons.mestre.gain.value, 1);
});
