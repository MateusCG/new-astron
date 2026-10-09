// Laço principal do cliente: tela de entrada, predição da própria nave,
// interpolação das outras, câmera de perseguição e desenho.
//
// Como a rede funciona do lado do cliente:
// - A cada passo fixo (DT = 1/30 s) lemos os controles, mandamos o comando numerado
//   (seq) ao servidor e já aplicamos o mesmo comando na nossa cópia local da nave
//   (predição): a nave responde sem esperar a rede.
// - Quando chega um snapshot, voltamos para o estado que o servidor mandou (me) e
//   reaplicamos os comandos com seq > ack. Se a predição tinha errado um pouco, a
//   diferença vira um "erro visual" que some em poucos quadros, sem tranco.
// - As outras naves são desenhadas INTERP_MS no passado, interpolando entre dois
//   snapshots, para o movimento sair liso mesmo com a rede irregular.

import * as THREE from 'three';
import { DT, RACES, WEAPONS, createBullet, stepShip, bulletHits, forward } from '/shared/sim.js';
import { heightAt, podePousar } from '/shared/terrain.js';
import { criarCena } from './cena.js';
import { criarNave, criarDrone, atualizarMotor } from './nave.js';
import { Efeitos } from './efeitos.js';
import { Controles } from './controles.js';
import { Hud } from './hud.js';
import { Rede } from './rede.js';
import { MenuArmas } from './armas.js';

const INTERP_MS = 120;
const CAMERAS = [
  { dist: 22, alt: 8, olhar: 14 },
  { dist: 34, alt: 13, olhar: 18 },
  { dist: 14, alt: 5, olhar: 12 },
];

// ---------- Tela de entrada ----------

let racaEscolhida = 'shrewdo';
function montarEntrada() {
  const lista = document.querySelector('#racas');
  const max = { velocidade: 120, hp: 300, energia: 80 };
  for (const [id, r] of Object.entries(RACES)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'raca';
    b.dataset.race = id;
    b.style.setProperty('--cor', '#' + new THREE.Color(r.cor).getHexString());
    b.innerHTML = `<strong>${r.nome}</strong><small>${r.bioma}</small>
      ${['velocidade', 'hp', 'energia']
        .map((k) => `<span class="stat"><em>${k === 'hp' ? 'HP' : k[0].toUpperCase() + k.slice(1)}</em><b style="width:${(r[k] / max[k]) * 100}%"></b><i>${r[k]}</i></span>`)
        .join('')}`;
    b.addEventListener('click', () => escolher(id));
    lista.append(b);
  }
  const escolher = (id) => {
    racaEscolhida = id;
    for (const el of lista.children) el.classList.toggle('sel', el.dataset.race === id);
  };
  escolher(racaEscolhida);
  const nome = document.querySelector('#nome');
  nome.value = localStorage.getItem('astron.nome') ?? '';
  document.querySelector('#form-entrada').addEventListener('submit', async (e) => {
    e.preventDefault();
    const botao = e.submitter;
    botao.disabled = true;
    botao.textContent = 'Conectando…';
    try {
      localStorage.setItem('astron.nome', nome.value);
    } catch {}
    const erro = document.querySelector('#erro-entrada');
    erro.textContent = '';
    try {
      await iniciar(nome.value, racaEscolhida);
      document.querySelector('#entrada').hidden = true;
    } catch (err) {
      console.error('Falha ao entrar no jogo:', err);
      botao.disabled = false;
      botao.textContent = 'Decolar';
      erro.textContent = MENSAGENS_ERRO[err?.message] ?? `Erro ao iniciar o jogo (${err?.message ?? err}). Mande um print desta tela.`;
    }
  });
}

// Cada falha na entrada tem uma mensagem própria: "não conectou" para tudo
// escondia a causa (WebGL desligado no navegador parecia problema de servidor).
const MENSAGENS_ERRO = {
  sem_webgl:
    'Seu navegador está sem gráficos 3D (WebGL). Ative a "aceleração de hardware" nas configurações do navegador, reinicie-o e tente de novo.',
  sem_conexao: 'Não deu para conectar ao servidor do jogo. Confira sua internet e tente de novo.',
  tempo_esgotado: 'O servidor demorou demais para responder. Tente de novo em instantes.',
  conexao_fechada: 'O servidor fechou a conexão antes de você entrar. Tente de novo.',
};

let rendererUnico = null;

/** Cria o renderer uma vez só (reaproveitado se a entrada falhar e tentar de novo). */
function criarRenderer() {
  if (rendererUnico) return rendererUnico;
  try {
    rendererUnico = new THREE.WebGLRenderer({ antialias: true });
  } catch {
    throw new Error('sem_webgl');
  }
  return rendererUnico;
}

// ---------- Jogo ----------

/**
 * Entra no jogo: confere o WebGL ANTES de conectar (sem 3D não adianta entrar e
 * deixar uma nave fantasma no servidor), conecta e monta a cena. Se montar falhar
 * depois de conectado, fecha a conexão para a nave não ficar parada no mundo.
 */
async function iniciar(nome, race) {
  const renderer = criarRenderer();
  const rede = new Rede();
  const boas = await rede.entrar(nome, race);
  try {
    montarJogo(rede, boas, renderer, race);
  } catch (err) {
    rede.fechar();
    throw err;
  }
}

function montarJogo(rede, boas, renderer, race) {
  const meuId = boas.id;

  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  document.querySelector('#jogo').append(renderer.domElement);

  const camera = new THREE.PerspectiveCamera(65, 1, 0.5, 5000);
  const { scene, atualizar: atualizarCena } = criarCena();
  const efeitos = new Efeitos(scene);
  const controles = new Controles(document.body);
  const hud = new Hud();
  const menuArmas = new MenuArmas({ aoTrocar: (i, kind) => hud.noticia(`Arma: ${WEAPONS[kind].nome}`, 'bom') });
  document.querySelector('#hud').hidden = false;

  function redimensionar() {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', redimensionar);
  redimensionar();

  // Estado da própria nave.
  let pred = null; // nave prevista (formato de shared/sim.js)
  let ant = null; // pose no passo anterior, para interpolar entre passos
  let vivo = false;
  let seq = 0;
  let pendentes = [];
  const erro = new THREE.Vector3();
  let extra = { ouro: 0, abates: 0, mortes: 0 };
  const minhaNave = criarNave(race);
  scene.add(minhaNave);

  // Outras naves.
  const snaps = [];
  const outras = new Map(); // id -> { obj, drone, nome, race }
  const nomes = new Map();

  let camModo = 0;
  let camYaw = 0;
  let tempo = 0;
  let morteEm = 0;
  let localSeq = 0;

  const pose = (s) => ({ x: s.x, y: s.y, z: s.z, yaw: s.yaw, roll: s.roll });

  function passo() {
    if (!vivo || !pred) return;
    const inp = controles.ler();
    // A arma escolhida no menu vai em todo comando; com o menu aberto não sai tiro.
    inp.a = menuArmas.arma;
    if (menuArmas.aberto) inp.f1 = inp.f2 = false;
    seq++;
    rede.enviar({ t: 'in', s: seq, ...inp });
    ant = pose(pred);
    const apertouPouso = inp.p && !pred.pAnt;
    if (apertouPouso && !pred.pousado && !podePousar(pred.x, pred.z)) {
      hud.noticia('Só dá para pousar no círculo de neon da base', 'ruim');
    }
    for (const { kind, off, ang } of stepShip(pred, inp)) {
      efeitos.tiro(createBullet(pred, kind, 'l' + localSeq++, meuId, off, ang));
    }
    pendentes.push({ seq, inp });
    if (pendentes.length > 120) pendentes.shift();
  }

  function aoSnapshot(m) {
    extra = { ouro: m.ouro, abates: m.abates, mortes: m.mortes };
    snaps.push({ t: performance.now(), ents: m.ents });
    while (snaps.length > 30) snaps.shift();
    for (const e of m.ents) nomes.set(e.id, e.nome);
    tratarEventos(m.ev);

    if (!m.vivo) {
      if (vivo) morteEm = performance.now();
      vivo = false;
      pendentes = [];
      pred = m.me;
      return;
    }
    if (!vivo) {
      // Nasceu ou renasceu: começa do estado do servidor, sem suavização.
      vivo = true;
      pred = structuredClone(m.me);
      ant = pose(pred);
      pendentes = pendentes.filter((p) => p.seq > m.ack);
      erro.set(0, 0, 0);
      camYaw = pred.yaw;
      hud.mostrarAviso('');
      return;
    }
    const antes = pose(pred);
    pred = structuredClone(m.me);
    pendentes = pendentes.filter((p) => p.seq > m.ack);
    for (const p of pendentes) stepShip(pred, p.inp);
    const dx = antes.x - pred.x;
    const dy = antes.y - pred.y;
    const dz = antes.z - pred.z;
    if (Math.hypot(dx, dy, dz) > 30) erro.set(0, 0, 0);
    else erro.add(new THREE.Vector3(dx, dy, dz));
    ant.x -= dx;
    ant.y -= dy;
    ant.z -= dz;
  }

  function tratarEventos(ev) {
    for (const e of ev) {
      if (e.e === 'tiro' && e.dono !== meuId) {
        const dono = outras.get(e.dono);
        efeitos.tiro({ id: e.id, kind: e.kind, x: e.x, y: e.y, z: e.z, vx: e.vx, vy: e.vy, vz: e.vz, vida: 2.5 }, !!dono?.drone);
      } else if (e.e === 'acerto') {
        efeitos.removerTiro(e.bala);
        efeitos.explosao(e.x, e.y, e.z, 0.7, '#ffd080');
        if (e.alvo === meuId) hud.levarDano();
      } else if (e.e === 'fim') {
        efeitos.removerTiro(e.bala);
      } else if (e.e === 'morte') {
        efeitos.explosao(e.x, e.y, e.z, 4, '#ff9a3a');
        const quem = nomes.get(e.id) ?? '?';
        if (e.id === meuId) hud.noticia(`Você foi destruído por ${nomes.get(e.por) ?? '?'}`, 'ruim');
        else if (e.por === meuId) hud.noticia(`Você abateu ${quem}`, 'bom');
        else if (!outras.get(e.id)?.drone) hud.noticia(`${nomes.get(e.por) ?? '?'} abateu ${quem}`);
      } else if (e.e === 'entrou' && e.id !== meuId) {
        hud.noticia(`${e.nome} entrou no setor`);
      } else if (e.e === 'saiu') {
        hud.noticia(`${e.nome} saiu`);
      }
    }
  }

  rede.aoReceber = (m) => {
    if (m.t === 'snap') aoSnapshot(m);
  };
  rede.aoFechar = () => hud.mostrarAviso('Conexão perdida. Recarregue a página.');

  const lerp = (a, b, k) => a + (b - a) * k;
  const lerpAng = (a, b, k) => {
    let d = b - a;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return a + d * k;
  };

  /** Pose interpolada das outras naves no instante de desenho (passado). */
  function posesOutras() {
    const t = performance.now() - INTERP_MS;
    if (!snaps.length) return [];
    let a = snaps[0];
    let b = snaps[snaps.length - 1];
    for (let i = snaps.length - 1; i > 0; i--) {
      if (snaps[i - 1].t <= t) {
        a = snaps[i - 1];
        b = snaps[i];
        break;
      }
    }
    const k = b.t > a.t ? Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))) : 1;
    const mapaA = new Map(a.ents.map((e) => [e.id, e]));
    return b.ents.map((eb) => {
      const ea = mapaA.get(eb.id) ?? eb;
      const salto = Math.hypot(eb.x - ea.x, eb.z - ea.z) > 40; // renasceu: sem interpolar
      const kk = salto ? 1 : k;
      return {
        ...eb,
        x: lerp(ea.x, eb.x, kk),
        y: lerp(ea.y, eb.y, kk),
        z: lerp(ea.z, eb.z, kk),
        yaw: lerpAng(ea.yaw, eb.yaw, kk),
        roll: lerp(ea.roll, eb.roll, kk),
      };
    });
  }

  const foco = new THREE.Vector3();
  const desejada = new THREE.Vector3();
  const alvoCam = new THREE.Vector3();
  let acumulado = 0;
  let ultimo = performance.now();

  function quadro(agora) {
    const dt = Math.min(0.1, (agora - ultimo) / 1000);
    ultimo = agora;
    tempo += dt;
    acumulado = Math.min(acumulado + dt, 0.25);
    while (acumulado >= DT) {
      acumulado -= DT;
      passo();
    }
    const alfa = acumulado / DT;
    if (controles.trocouCamera()) camModo = (camModo + 1) % CAMERAS.length;

    // Própria nave.
    erro.multiplyScalar(Math.exp(-10 * dt));
    minhaNave.visible = vivo;
    if (pred && ant) {
      const x = lerp(ant.x, pred.x, alfa) + erro.x;
      const y = lerp(ant.y, pred.y, alfa) + erro.y;
      const z = lerp(ant.z, pred.z, alfa) + erro.z;
      // Balanço de flutuação só no ar; no chão a nave fica parada.
      minhaNave.position.set(x, y + (pred.pousado ? 0 : Math.sin(tempo * 2.2) * 0.25), z);
      minhaNave.rotation.y = lerpAng(ant.yaw, pred.yaw, alfa);
      minhaNave.userData.corpo.rotation.z = lerp(ant.roll, pred.roll, alfa);
      atualizarMotor(minhaNave, pred.boost, tempo, pred.pousado);
      foco.set(x, y, z);
    }

    // Outras naves.
    const poses = posesOutras();
    const presentes = new Set();
    const rotulos = [];
    for (const e of poses) {
      if (e.id === meuId) continue;
      presentes.add(e.id);
      let o = outras.get(e.id);
      if (!o) {
        o = { obj: e.drone ? criarDrone() : criarNave(e.race), drone: e.drone };
        scene.add(o.obj);
        outras.set(e.id, o);
      }
      o.obj.visible = e.vivo;
      o.pos = o.obj.position;
      if (!e.vivo) continue;
      o.obj.position.set(e.x, e.y + (e.pousado ? 0 : Math.sin(tempo * 2 + e.id) * 0.25), e.z);
      o.obj.rotation.y = e.yaw;
      o.obj.userData.corpo.rotation.z = e.roll;
      if (e.drone) o.obj.userData.corpo.rotation.y = Math.sin(tempo * 3 + e.id) * 0.15;
      atualizarMotor(o.obj, e.boost, tempo, e.pousado);
      rotulos.push({ id: e.id, nome: e.nome, drone: e.drone, race: e.race, hp: e.hp, maxHp: e.maxHp, pos: o.obj.position });
    }
    for (const [id, o] of outras) {
      if (!presentes.has(id)) {
        scene.remove(o.obj);
        outras.delete(id);
      }
    }

    // Tiros: o nosso some ao encostar em alguém na tela (o dano vem do servidor).
    efeitos.atualizar(dt, (b) => {
      if (b.owner !== meuId) return false;
      for (const o of outras.values()) {
        if (o.obj.visible && bulletHits(b, { x: o.obj.position.x, y: o.obj.position.y, z: o.obj.position.z })) return true;
      }
      return false;
    });

    // Câmera de perseguição, como no AstroN: atrás e um pouco acima da nave.
    if (pred) {
      const cfg = CAMERAS[camModo];
      if (vivo) camYaw = lerpAng(camYaw, minhaNave.rotation.y, 1 - Math.exp(-5 * dt));
      else camYaw += dt * 0.4; // morto: gira devagar em volta dos destroços
      const f = forward(camYaw);
      desejada.set(foco.x - f.x * cfg.dist, foco.y + cfg.alt, foco.z - f.z * cfg.dist);
      // Não deixa a câmera entrar na parede do cânion: aproxima até ver a nave.
      for (let i = 1; i <= 8; i++) {
        const k = i / 8;
        const px = lerp(foco.x, desejada.x, k);
        const pz = lerp(foco.z, desejada.z, k);
        const py = lerp(foco.y + 2, desejada.y, k);
        if (heightAt(px, pz) + 2 > py) {
          const kk = Math.max(0.25, (i - 1) / 8);
          desejada.set(lerp(foco.x, desejada.x, kk), lerp(foco.y + 2, desejada.y, kk) + 3, lerp(foco.z, desejada.z, kk));
          break;
        }
      }
      if (camera.position.lengthSq() === 0) camera.position.copy(desejada);
      camera.position.lerp(desejada, 1 - Math.exp(-8 * dt));
      const chao = heightAt(camera.position.x, camera.position.z) + 2;
      if (camera.position.y < chao) camera.position.y = chao;
      alvoCam.set(foco.x + f.x * cfg.olhar, foco.y + 2, foco.z + f.z * cfg.olhar);
      camera.lookAt(alvoCam);
      camera.fov = lerp(camera.fov, pred.boost ? 74 : 65, 1 - Math.exp(-4 * dt));
      camera.updateProjectionMatrix();
    }

    atualizarCena(dt, foco);

    if (pred) {
      hud.painel(pred, extra, rede.ping);
      hud.pouso(!vivo ? null : pred.pousado ? 'pousada' : podePousar(pred.x, pred.z) ? 'area' : null);
      hud.minimapa(vivo ? { x: foco.x, z: foco.z, yaw: minhaNave.rotation.y } : null, snaps.at(-1)?.ents ?? [], meuId);
    }
    if (!vivo && morteEm) {
      const falta = Math.max(0, 3 - (performance.now() - morteEm) / 1000);
      hud.mostrarAviso(`Nave destruída · renascendo na base em ${falta.toFixed(0)}s`);
    }
    hud.rotulosNaves(rotulos, camera, innerWidth, innerHeight);
    renderer.render(scene, camera);
    requestAnimationFrame(quadro);
  }
  requestAnimationFrame(quadro);

  // Para depuração no console e para os testes de navegador.
  window.__astron = { get pred() { return pred; }, get vivo() { return vivo; }, scene, camera, menuArmas };
}

montarEntrada();
