// Gera shared/armas-original.js, o catálogo das armas do Astro-N original (as 140
// das lojas de Acron, Bellico e Shrewdo), a partir de tools/dados/armas.json.
//
// De onde vêm os dados: a pesquisa das armas (fora do repositório, em
// new-astron-progresso/armas/) decodificou o inititemweapon.cfg do jogo original
// (colunas, unidades, efeitos, subprojéteis, visual e sons) em armas_completo.json.
// O tools/dados/armas.json é esse arquivo enxuto: só as armas de loja, as versões V1
// a V8 (os níveis 1 a 8 da arma no jogo novo) e só os campos que a mecânica e a
// interface usam, mais o dicionário dos efeitos visuais (id → texturas e cores).
//
//   node tools/gerar_armas.mjs --enxugar <armas_completo.json> [<armas_npc_completo.json>]
//                                                                refaz tools/dados/armas.json
//   node tools/gerar_armas.mjs                                   refaz shared/armas-original.js
//
// As armas "(NPC)" dos monstros da jungle que vêm do original (SN-3 e SN-Zero VI do
// Stage M5) saem da mesma pesquisa, num arquivo à parte (armas_npc_completo.json, uma
// versão por arma, gerado pelo mesmo leitor do cfg com os ids das armas do
// initnpc.cfg): ficam na lista "npc" do armas.json e em ARMAS_NPC_ORIGINAL, fora do
// catálogo do jogador (shared/armas.js as põe no fim do WEAPONS, como tiros de NPC).
//
// O que este script decide (a interpretação do cfg) e o que fica para o jogo:
// - Aqui: a FORMA de cada golpe (projétil, nova, mina, campo ou efeito na própria
//   nave), a árvore de subprojéteis (divide no fim da vida; a mina que atira), os
//   efeitos com o código do original (mecânica, valor, duração, raio) e o visual e o
//   som de cada golpe. Os números ficam nas UNIDADES DO ORIGINAL (ms, metro, m/ms,
//   HP e energia do original).
// - Em shared/armas.js: a conversão para a escala do jogo novo, com as constantes
//   nomeadas (FATOR_*), para dar para balancear sem gerar de novo.
// A saída é determinística (mesma entrada, mesmo arquivo) e a ordem das armas é a
// das lojas do original, raça por raça: é ela que dá o índice de cada arma no
// protocolo, então nunca reordene; arma nova entra no fim.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DADOS = path.join(RAIZ, 'tools', 'dados', 'armas.json');
const SAIDA = path.join(RAIZ, 'shared', 'armas-original.js');
const N_VERSOES = 8; // V1..V8 (NIVEL_POR_VERSAO em shared/versoes.js)
const RACAS = ['acron', 'bellico', 'shrewdo'];

// ---------- enxugar: armas_completo.json -> tools/dados/armas.json ----------

const CAMPOS_VISUAL = ['disparo', 'projetil', 'rastro', 'impacto', 'fim', 'armadilhaAtiva'];

function enxugar(origem, origemNpc) {
  const todas = JSON.parse(readFileSync(origem, 'utf8'));
  const npcTodas = origemNpc ? JSON.parse(readFileSync(origemNpc, 'utf8')) : [];
  const efeitos = {};
  const visualCurto = (vis) => {
    if (!vis) return null;
    const out = { projetilTipo: vis.projetilTipo };
    for (const k of CAMPOS_VISUAL) {
      const e = vis[k];
      if (!e || typeof e !== 'object') continue;
      out[k] = e.id;
      efeitos[e.id] ??= { modelos: e.modelos, tex: e.texturas.map((t) => [t.png.replace(/\.png$/i, ''), t.cor]) };
    }
    return out;
  };
  const CAMPOS_NUMEROS = ['danoTiro', 'projeteis', 'vaoCanos', 'lequeGraus', 'anguloInicialGraus', 'velMax', 'acel', 'vidaMs',
    'alcanceM', 'raioColisao', 'nova', 'teleguiado', 'divide', 'subprojetilNoChao', 'atravessa', 'acertaInimigo', 'acertaAliado',
    'explodeNoFimDaVida', 'mira', 'areaDano', 'intervaloDanoMs', 'rajada', 'intervaloRajadaMs', 'varredura', 'armadilha'];
  const numeros = (n) => Object.fromEntries(CAMPOS_NUMEROS.filter((k) => n[k] !== undefined).map((k) => [k, n[k]]));
  const efeitoCurto = (e) => (e ? { mecanica: e.mecanica, codigo: e.codigo, valor: e.valor, valor2: e.valor2, duracaoMs: e.duracaoMs, raioM: e.raioM } : null);
  const sub = (s) => ({
    id: s.id,
    ligacao: s.ligacao,
    som: s.somDisparo?.nome ?? null,
    somImpacto: s.somImpacto?.nome ?? null,
    efeitos: [efeitoCurto(s.efeito), efeitoCurto(s.efeito2)].filter(Boolean),
    numeros: numeros(s.numeros),
    visual: visualCurto(s.visual),
    subprojeteis: s.subprojeteis.map(sub),
  });
  const enxugarArma = (a) => ({
      id: a.id,
      nome: a.nome,
      nomePt: a.nomePt,
      raca: a.naLojaDaRaca ?? a.raca,
      classes: a.classes,
      tipoDano: a.tipoDano,
      categoria: a.categoria,
      papel: a.papel,
      auxiliar: a.auxiliar,
      descricao: a.descricao,
      som: a.somDisparo?.nome ?? null,
      somImpacto: a.somImpacto?.nome ?? null,
      modeloArma: a.modeloArma,
      versoes: a.versoes.slice(0, N_VERSOES).map((v) => ({
        v: v.v,
        id: v.id,
        preco: v.preco,
        taxaTuningProxima: v.taxaTuningProxima,
        nivelExigido: v.nivelExigido,
        recargaMs: v.recargaMs,
        energia: v.energia,
        gastoHpPorS: v.gastoHpPorS,
        segurarTecla: v.segurarTecla,
        som: v.somDisparo,
        efeitos: [efeitoCurto(v.efeito), efeitoCurto(v.efeito2)].filter(Boolean),
        numeros: numeros(v.numeros),
        visual: visualCurto(v.visual),
        subprojeteis: v.subprojeteis.map(sub),
      })),
  });
  const armas = todas.filter((a) => RACAS.includes(a.naLojaDaRaca)).map(enxugarArma);
  const npc = npcTodas.map(enxugarArma);
  const ordenados = Object.fromEntries(Object.keys(efeitos).sort().map((k) => [k, efeitos[k]]));
  // Uma arma por linha: o arquivo fica curto e o diff mostra qual arma mudou.
  const linhas = (lista) => lista.map((x) => JSON.stringify(x)).join(',\n');
  const efs = Object.entries(ordenados).map(([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v)}`).join(',\n');
  const blocoNpc = npc.length ? `"npc":[\n${linhas(npc)}\n],\n` : '';
  writeFileSync(DADOS, `{"armas":[\n${linhas(armas)}\n],\n${blocoNpc}"efeitos":{\n${efs}\n}}\n`);
  console.log(`${armas.length} armas, ${npc.length} de NPC e ${Object.keys(efeitos).length} efeitos visuais em ${path.relative(RAIZ, DADOS)}`);
}

// ---------- gerar: tools/dados/armas.json -> shared/armas-original.js ----------

/** Som do original ('SHOT_RAY3_2') -> arquivo em public/sons sem extensão ('shot_ray3_2'). */
const som = (nome) => (nome ? nome.toLowerCase() : null);

/** Tira campos vazios (null, false, 0, lista vazia) para o arquivo ficar curto. */
function limpo(o) {
  const out = {};
  for (const [k, v] of Object.entries(o)) {
    if (v === null || v === undefined || v === false || v === 0 || (Array.isArray(v) && !v.length)) continue;
    out[k] = v;
  }
  return out;
}

const r3 = (x) => Math.round(x * 1000) / 1000;

/**
 * Forma do golpe (o que o servidor cria): 'projetil' (voa), 'nova' (esfera que
 * cresce parada num ponto), 'mina' (parada no chão, dispara com inimigo perto),
 * 'campo' (área parada que fere quem fica dentro a cada intervalo) ou 'efeito' (sem
 * projétil: dispositivo da própria nave).
 */
function forma(n, categoria, raiz) {
  if (raiz && categoria === 'dispositivo') return 'efeito';
  const parado = !(n.velMax > 0);
  if (n.nova && parado) return 'nova';
  if (raiz && categoria === 'nova') return 'nova'; // nova sem esfera (Rebatedor): na hora
  const arm = n.armadilha;
  if (arm && parado && !n.divide) {
    const area = n.intervaloDanoMs || (n.atravessa && n.raioColisao >= 30);
    return area ? 'campo' : 'mina';
  }
  return 'projetil';
}

/** Golpe (projétil, nova, mina, campo ou efeito) nas unidades do original. */
function golpe(n, efeitos, subs, categoria, raiz) {
  const f = forma(n, categoria, raiz);
  const filho = (lig) => subs.find((s) => s.ligacao === lig);
  const g = {
    forma: f,
    dano: n.danoTiro,
    efeitos: efeitos.map((e) => limpo({ t: e.mecanica, v: e.valor, v2: e.valor2, ms: e.duracaoMs, raio: e.raioM })),
  };
  if (f === 'efeito') {
    // Teleporte: o alcance vem do raio do efeito (ou da área).
    g.area = n.areaDano;
    return limpo(g);
  }
  Object.assign(g, {
    area: n.areaDano,
    raio: n.raioColisao > 0 ? n.raioColisao : 0,
    vidaMs: n.vidaMs,
    atravessa: n.atravessa,
    inimigo: n.acertaInimigo,
    aliado: n.acertaAliado,
    fim: n.explodeNoFimDaVida,
    intervaloMs: n.intervaloDanoMs,
  });
  if (f === 'nova') {
    g.nova = n.nova ? { raio: n.nova.raioMax, cresce: n.nova.crescePorMs } : null;
    return limpo(g);
  }
  if (f === 'mina' || f === 'campo') {
    const a = n.armadilha;
    g.mina = limpo({
      gatilho: a.raioAtivaM ?? n.raioColisao,
      ativa: a.ativa,
      ativaParam: a.ativaParam,
      acao: a.acao,
      raioDisparo: a.raioDisparoM,
    });
    const s = a.subprojetil ? filho('subprojetilDaArmadilha') : null;
    if (s) g.dispara = golpeDe(s, categoria);
    return limpo(g);
  }
  // Projétil.
  Object.assign(g, {
    n: n.projeteis,
    vao: n.vaoCanos,
    leque: n.lequeGraus,
    a0: n.anguloInicialGraus,
    rajada: n.rajada > 1 ? n.rajada : 0,
    rajadaMs: n.rajada > 1 ? n.intervaloRajadaMs : 0,
    varre: n.varredura ? { modo: n.varredura.modo, passo: n.varredura.passoGraus } : null,
    vel: n.velMax,
    // Velocidade média (alcance do original / vida): quem acelera ou freia voa a
    // esta velocidade constante no jogo novo, com o mesmo alcance e o mesmo tempo.
    velMedia: n.acel && n.vidaMs ? r3(n.alcanceM / n.vidaMs) : 0,
    cresce: n.nova ? { raio: n.nova.raioMax, cresce: n.nova.crescePorMs } : null,
    guia: n.teleguiado && n.teleguiado.giroGrausS > 0 ? { comecaMs: n.teleguiado.comecaMs, giro: n.teleguiado.giroGrausS } : null,
    mira: n.mira ? { modo: n.mira.modo, raio: n.mira.raioM } : null,
  });
  const d = n.divide ? filho('subprojetil') : null;
  if (d) {
    g.divide = golpeDe(d, categoria);
    if (n.subprojetilNoChao) g.divideNoChao = true;
  }
  return limpo(g);
}

function golpeDe(s, categoria) {
  const g = golpe(s.numeros, s.efeitos, s.subprojeteis, categoria, false);
  g.vis = visualIds(s.visual);
  if (s.som) g.som = som(s.som);
  if (s.somImpacto) g.somImpacto = som(s.somImpacto);
  return g;
}

/** Ids dos efeitos visuais de um golpe (d = clarão, p = projétil, r = rastro, i = impacto, f = fim, a = armadilha ativa). */
function visualIds(v) {
  if (!v) return {};
  return limpo({ tipo: v.projetilTipo !== 'modelo' ? v.projetilTipo : null, d: v.disparo, p: v.projetil, r: v.rastro, i: v.impacto, f: v.fim, a: v.armadilhaAtiva });
}

function modelo(m) {
  const base = m.modelo.toLowerCase();
  return m.pares ? [m.esquerda.toLowerCase(), m.direita.toLowerCase()] : [base, base];
}

function gerar() {
  const { armas, npc = [], efeitos: todos } = JSON.parse(readFileSync(DADOS, 'utf8'));
  // Textura que não está em public/texturas/efeitos (o original cita algumas por
  // engano, como as shrewdo_* no clarão dos canhões elétricos, e o 1343007_01 do
  // rastro dos mísseis) fica sem arquivo (null), mas com a cor: o cliente usa a cor.
  const TEX = path.join(RAIZ, 'public', 'texturas', 'efeitos');
  const efeitos = Object.fromEntries(
    Object.entries(todos).map(([id, e]) => [id, { ...e, tex: e.tex.map(([png, cor]) => [existsSync(path.join(TEX, png + '.png')) ? png : null, cor]) }]),
  );
  const converter = (a) => {
    const versoes = a.versoes.map((v) => {
      const g = golpe(v.numeros, v.efeitos, v.subprojeteis, a.categoria, true);
      g.vis = visualIds(v.visual);
      return limpo({
        id: v.id,
        nivel: v.nivelExigido,
        preco: v.preco,
        taxa: v.taxaTuningProxima,
        recargaMs: v.recargaMs,
        energia: v.energia,
        hpPorS: v.gastoHpPorS,
        segurar: v.segurarTecla,
        som: som(v.som),
        golpe: g,
      });
    });
    return limpo({
      id: a.id,
      nome: a.nomePt,
      nomeEn: a.nome,
      raca: a.raca,
      classes: a.classes,
      categoria: a.categoria,
      papel: a.papel,
      auxiliar: a.auxiliar,
      tipoDano: a.tipoDano,
      descricao: a.descricao,
      icone: a.modeloArma.icone,
      modelo: modelo(a.modeloArma),
      som: som(a.som),
      somImpacto: som(a.somImpacto),
      versoes,
    });
  };
  const saida = armas.map(converter);
  const saidaNpc = npc.map(converter);
  const texto = `// GERADO por tools/gerar_armas.mjs a partir de tools/dados/armas.json: não edite à mão.
//
// As ${saida.length} armas das lojas do Astro-N original (Acron, Bellico e Shrewdo), na
// ordem das lojas, com as versões V1 a V8 (níveis 1 a 8 da arma). Números nas
// unidades do original (ms, metro, m/ms, HP e energia do original): a conversão para
// o jogo novo é de shared/armas.js. ARMAS_NPC_ORIGINAL: as ${saidaNpc.length} armas "(NPC)" dos
// monstros da jungle que vêm do original (uma versão cada). EFEITOS_VISUAIS: id do
// efeito do original -> modelos e texturas (public/texturas/efeitos/<png>.png) com a
// cor dominante.

export const ARMAS_ORIGINAL = [
${saida.map((a) => JSON.stringify(a)).join(',\n')},
];

export const ARMAS_NPC_ORIGINAL = [
${saidaNpc.map((a) => JSON.stringify(a)).join(',\n')},
];

export const EFEITOS_VISUAIS = {
${Object.entries(efeitos).map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n')},
};
`;
  writeFileSync(SAIDA, texto);
  console.log(`${saida.length} armas e ${saidaNpc.length} de NPC em ${path.relative(RAIZ, SAIDA)} (${(texto.length / 1024).toFixed(0)} KB)`);
}

if (process.argv[2] === '--enxugar') enxugar(process.argv[3], process.argv[4]);
else gerar();
