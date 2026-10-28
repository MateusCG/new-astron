// Efeitos do original tocados como no original (tools/efeitos3d_do_original.py →
// public/modelos/efeitos/<id>.json, public/js/efeitos-original.js), os ícones de estado
// em cima da nave e as mensagens de debuff (public/js/debuffs.js, server/golpes.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EFEITOS_ORIGINAIS, EFEITO_SUBIDA, ICONES_ESTADO, MAGMA_NA_NAVE, insumosDaPartida } from '../public/js/insumos.js';
import { DEBUFFS, textoDebuff } from '../public/js/debuffs.js';
import { mensagemDebuff } from '../server/golpes.js';
import { ESPECIES } from '../server/especies.js';
import { golpeDaArma, WEAPONS } from '../shared/armas.js';
import { RACAS_JOGAVEIS } from '../shared/naves.js';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const efeito = (id) => JSON.parse(readFileSync(path.join(RAIZ, 'public/modelos/efeitos', `${id}.json`), 'utf8'));

test('efeitos do original: cada um convertido, com as peças, os quadros e as texturas', () => {
  for (const id of EFEITOS_ORIGINAIS) {
    const e = efeito(id);
    assert.equal(e.id, id);
    assert.ok(e.pecas.length > 0, id);
    assert.equal(e.blocos.length, e.quadros, `${id}: um bloco por quadro`);
    for (const linha of e.blocos) {
      assert.equal(linha.length, e.pecas.length, `${id}: um bloco por peça`);
      linha.forEach(([fr, mat, flags, ...resto], i) => {
        assert.equal(resto.length, 6, `${id}: cor RGBA e rolagem`);
        const q = e.pecas[i].q;
        assert.ok(!q.length || fr < q.length, `${id}: quadro ${fr} do .3dx existe`);
        if (flags & 1) assert.ok(mat < e.mpal.length, `${id}: material ${mat} da paleta`);
      });
    }
    for (const p of e.pecas) {
      assert.equal(p.pos.length % 3, 0);
      assert.equal(p.uv.length / 2, p.pos.length / 3, `${id}: uma uv por vértice`);
      assert.ok(p.idx.every((k) => k < p.pos.length / 3), `${id}: índices dentro da malha`);
      assert.equal(p.m.length, 16);
    }
    for (const t of [...e.pecas.map((p) => p.tex).filter(Boolean), ...e.mpal]) {
      assert.ok(existsSync(path.join(RAIZ, 'public/texturas/efeitos', `${t}.png`)), `${id}: textura ${t}`);
    }
  }
});

test('efeitos do original: as armas do SN-3, SN-4, Xerxes, Grande Xerxes, Bazit, Anti e Medusa têm o projétil e o impacto do original', () => {
  for (const esp of ['sn3', 'sn4', 'xerxes', 'great_xerxes', 'bazit', 'anti', 'medusa']) {
    for (const a of ESPECIES[esp].ataques) {
      const vis = golpeDaArma(a.kind, 1, 0).vis;
      for (const campo of ['d', 'p', 'i', 'f', 'a']) {
        if (vis[campo]) assert.ok(EFEITOS_ORIGINAIS.includes(vis[campo]), `${esp} ${a.atq}: efeito ${campo} ${vis[campo]}`);
      }
      assert.ok(WEAPONS[a.kind].npc && WEAPONS[a.kind].original, a.kind);
    }
  }
  // A chama do Xerxes troca de textura a cada quadro (a paleta do original).
  const chama = efeito('1361153');
  assert.equal(chama.mpal.length, 57);
  assert.ok(new Set(chama.blocos.map((l) => l[0][1])).size > 40, 'muitas texturas diferentes');
  // O míssil do SN-3 leva o "E" (icon_e) e a descarga é a esfera azul.
  assert.ok(efeito('2343012').pecas.some((p) => p.tex === 'icon_e'));
  assert.equal(efeito('1503009').pecas[0].tex, '1503009');
});

test('estados na nave: o ícone de cada estado e o fogo do Magma são efeitos do original convertidos', () => {
  for (const id of [...Object.values(ICONES_ESTADO), MAGMA_NA_NAVE]) assert.ok(EFEITOS_ORIGINAIS.includes(id), id);
  assert.equal(ICONES_ESTADO.resist, 'cross003', 'o capacete das resistências, dentro do círculo vermelho');
  assert.equal(ICONES_ESTADO.descarga, 'cross013', 'o "E" da energia');
  // O fogo do Magma: peças viradas para a câmera (flag 8) que sobem (andam no x do original).
  const magma = efeito(MAGMA_NA_NAVE);
  assert.ok(magma.blocos.every((l) => l.every((b) => b[2] & 8)));
  const x0 = magma.pecas[0].q[0][12];
  const x1 = magma.pecas[0].q[magma.pecas[0].q.length - 1][12];
  assert.ok(x1 > x0 + 30, `sobe (${x0} → ${x1})`);
});

test('subir de nível e evoluir a nave: o lvup do original de cada raça, três segundos, a coluna de luz sobe', () => {
  // CUnit::EffectLevelUp: o brood 0 (Acron) carrega lvup003, o 1 (Bellico) lvup002 e o 2 (Shrewdo) lvup001.
  assert.deepEqual({ ...EFEITO_SUBIDA }, { acron: 'lvup003', bellico: 'lvup002', shrewdo: 'lvup001' });
  for (const raca of RACAS_JOGAVEIS) assert.ok(EFEITO_SUBIDA[raca], `${raca} tem o efeito`);
  // A corrente de quadros do lvup001 (CEffectSprite::NextFrame): ..., 60, 71, 61, ..., 70. O
  // quadro 71 (alfa 0,1 na espiral) toca entre o 60 e o 61 (alfa 1), não depois do 70.
  const verde = efeito('lvup001').blocos;
  assert.equal(verde.length, 72);
  assert.deepEqual([60, 61, 62].map((i) => verde[i][2][6]), [0.1, 0.1, 1]);
  assert.equal(verde.at(-1)[0][6], 0.1, 'acaba apagado');
  for (const id of Object.values(EFEITO_SUBIDA)) {
    assert.ok(EFEITOS_ORIGINAIS.includes(id), `${id} baixa na tela de carregamento`);
    const e = efeito(id);
    // Uma vez só, de ponta a ponta (71 ou 72 quadros, na ordem da corrente do .eff: no lvup001 o
    // quadro solto 71 toca entre o 60 e o 61, não no fim) a 24 por segundo: ~3 s.
    assert.ok(e.quadros >= 71 && e.quadros <= 72, `${id}: ${e.quadros} quadros`);
    assert.equal(e.pecas.length, 3, 'a coluna, o anel e a espiral');
    const [coluna, anel] = e.pecas;
    // A coluna: cilindro fino e comprido que, com a matriz da peça (giro de 180° em x), sobe do 0 ao alto.
    assert.equal(coluna.m[10], -1, 'o eixo z da coluna inverte: o que era -z vira para cima');
    const zs = coluna.pos.filter((_, i) => i % 3 === 2);
    assert.ok(-Math.min(...zs) > 250 && Math.max(...zs) < 50, `${id}: coluna de ~300 m em -z`);
    // O anel: um quadrado de 39 m deitado no plano do chão.
    const ys = anel.pos.filter((_, i) => i % 3 === 1);
    assert.ok(Math.max(...ys) - Math.min(...ys) > 38);
    // A luz some no fim: a alfa do último quadro é baixa.
    assert.ok(e.blocos[e.quadros - 1].every((b) => b[2] & 16 || b[6] < 0.2), `${id}: apaga no fim`);
    // Cada textura existe (a cor da raça está nelas).
    for (const p of e.pecas) assert.ok(existsSync(path.join(RAIZ, 'public/texturas/efeitos', `${p.tex}.png`)), p.tex);
  }
});

test('carregamento: os efeitos do original vão na lista da partida', () => {
  const ins = insumosDaPartida('acron', 'assault');
  assert.deepEqual(ins.efeitosOriginais, [...EFEITOS_ORIGINAIS]);
});

test('debuffs: toda mensagem do servidor tem nome, texto e ícone do original', () => {
  const efeitos = [
    { tipo: 'dreno', magma: true, dps: 4, dur: 5 },
    { tipo: 'drenoDuplo', dps: 2, dur: 3 },
    { tipo: 'drenoEn', enPs: 3, dur: 3 },
    { tipo: 'lento', mult: 0.7, dur: 2 },
    { tipo: 'lento', mult: 0, dur: 2 },
    { tipo: 'trava', dur: 2 },
    { tipo: 'paralisa', dur: 1.5 },
    { tipo: 'semTiro', dur: 2.5 },
    { tipo: 'descarga', frac: 1, dur: 2 },
    { tipo: 'semRegen', dur: 2 },
    { tipo: 'enCara', mult: 1.5, dur: 2 },
    { tipo: 'cadencia', mult: 1.3, dur: 2 },
    { tipo: 'desgoverno', dur: 3 },
    { tipo: 'fraco', mult: 0.73, dur: 2.5 },
    { tipo: 'vulneravel', k: 1, tipoDano: null, dur: 2 },
    { tipo: 'vulneravel', k: 0.6, tipoDano: 'fisico', dur: 2 },
    { tipo: 'vulneravel', k: 0.6, tipoDano: 'laser', dur: 2 },
    { tipo: 'cego', dur: 4 },
    { tipo: 'revela', dur: 4 },
    { tipo: 'recuo', frac: 0.3, dur: 4 },
  ];
  for (const ef of efeitos) {
    const msg = mensagemDebuff(ef);
    assert.ok(msg && DEBUFFS[msg.ef], `${ef.tipo}: ${JSON.stringify(msg)}`);
    const t = textoDebuff(msg);
    assert.ok(t.nome && t.texto && !t.texto.includes('{'), msg.ef);
    assert.ok(existsSync(path.join(RAIZ, 'public/texturas/debuffs', `${t.icone}.png`)), t.icone);
  }
  // O Magma do Xerxes: "Dano de magma: HP diminui 20,0 em 5,0 s" (100 em 5 s do original × 0,2).
  assert.deepEqual(textoDebuff(mensagemDebuff({ tipo: 'dreno', magma: true, dps: 4, dur: 5 })), { icone: '1164001_s', nome: 'Dano de magma', texto: 'HP diminui 20,0 em 5,0 s' });
  // O dreno que não é o Magma do original não avisa (superaquecer).
  assert.equal(mensagemDebuff({ tipo: 'dreno', dps: 4, dur: 5 }), null);
});
