// Propulsão das naves (public/js/propulsao.js e public/modelos/propulsao/, gerados por
// tools/propulsao_do_original.py): a regra de quais encaixes acendem (a do original) e o
// contrato dos arquivos (os três efeitos de cada raça, as texturas do tremor e os
// encaixes das naves apontando o motor para trás).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { encaixesAcesos, EFEITOS_PROPULSAO, ENCAIXES_PROPULSAO } from '../public/js/propulsao.js';
import { RACAS_JOGAVEIS } from '../shared/naves.js';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'modelos');
const PASTA = path.join(RAIZ, 'propulsao');

function jsonDoGlb(arquivo) {
  const b = readFileSync(arquivo);
  assert.equal(b.toString('latin1', 0, 4), 'glTF');
  return JSON.parse(b.toString('utf8', 20, 20 + b.readUInt32LE(12)));
}

test('propulsão: parada e reta, nada acende', () => {
  assert.deepEqual(encaixesAcesos({}), { motor: false, turbo: false, re: false, esquerda: false, direita: false });
});

test('propulsão: para a frente acende o motor, e o turbo só andando', () => {
  assert.equal(encaixesAcesos({ frente: 30 }).motor, true);
  assert.equal(encaixesAcesos({ frente: 30 }).turbo, false);
  assert.equal(encaixesAcesos({ frente: 30, turbo: true }).turbo, true);
  assert.equal(encaixesAcesos({ frente: 0, turbo: true }).turbo, false);
  assert.equal(encaixesAcesos({ frente: -10 }).motor, false);
});

test('propulsão: de ré acende o nariz e apaga o motor', () => {
  const a = encaixesAcesos({ frente: -12 });
  assert.equal(a.re, true);
  assert.equal(a.motor, false);
});

test('propulsão: na curva acende a ponta da asa de fora, e de ré a outra', () => {
  const esquerda = encaixesAcesos({ frente: 30, curva: 1 });
  assert.equal(esquerda.direita, true);
  assert.equal(esquerda.esquerda, false);
  const direita = encaixesAcesos({ frente: 30, curva: -1 });
  assert.equal(direita.esquerda, true);
  assert.equal(direita.direita, false);
  // Parada girando também acende (o original não pede velocidade para a curva).
  assert.equal(encaixesAcesos({ curva: 1 }).direita, true);
  assert.equal(encaixesAcesos({ frente: -12, curva: 1 }).esquerda, true);
  // Inclinação pequena (a nave voltando a nivelar) não conta.
  assert.equal(encaixesAcesos({ frente: 30, curva: 0.1 }).direita, false);
});

test('propulsão: subindo ou descendo do pouso, todos os auxiliares; pousada, nada', () => {
  assert.deepEqual(encaixesAcesos({ vertical: true }), { motor: false, turbo: false, re: true, esquerda: true, direita: true });
  assert.deepEqual(encaixesAcesos({ pousado: true, frente: 5, curva: 1 }), { motor: false, turbo: false, re: false, esquerda: false, direita: false });
});

test('propulsão: os três efeitos de cada raça, aditivos, com as texturas do tremor', () => {
  for (const race of RACAS_JOGAVEIS) {
    for (const efeito of EFEITOS_PROPULSAO) {
      const arquivo = path.join(PASTA, `${race}-${efeito}.glb`);
      assert.ok(existsSync(arquivo), `${race}-${efeito}.glb`);
      const g = jsonDoGlb(arquivo);
      assert.ok(g.meshes.length >= 1, `${race}-${efeito}: sem peça`);
      for (const m of g.materials) {
        assert.equal(m.extras?.aditivo, true, `${race}-${efeito} ${m.name}`);
        assert.ok(m.extras.quadros.length >= 1);
        for (const q of m.extras.quadros) assert.ok(existsSync(path.join(PASTA, 'texturas', `${q}.png`)), `textura ${q}`);
      }
      // A chama sai do encaixe para +x (o motor do encaixe aponta para trás da nave).
      const maxX = Math.max(...g.accessors.filter((a) => a.type === 'VEC3' && a.max).map((a) => a.max[0]));
      assert.ok(maxX > 2, `${race}-${efeito}: chama para +x (${maxX})`);
    }
    // O motor normal treme: pelo menos uma peça troca de textura em ciclo (o .MPL do original), salvo a Acron, que não tem.
    const normal = jsonDoGlb(path.join(PASTA, `${race}-normal.glb`));
    if (race !== 'acron') assert.ok(normal.materials.some((m) => m.extras.quadros.length === 3), race);
  }
});

test('propulsão: toda nave tem os dois motores virados para trás e os encaixes auxiliares', () => {
  const pasta = path.join(RAIZ, 'naves');
  for (const race of readdirSync(pasta)) {
    if (!statSync(path.join(pasta, race)).isDirectory()) continue;
    for (const classe of readdirSync(path.join(pasta, race))) {
      for (const arq of readdirSync(path.join(pasta, race, classe)).filter((a) => a.endsWith('.glb'))) {
        const nos = jsonDoGlb(path.join(pasta, race, classe, arq)).nodes.filter((n) => n.extras?.astron_helper);
        const motores = nos.filter((n) => ENCAIXES_PROPULSAO.motor.test(n.name));
        assert.ok(motores.length >= 2, `${arq}: motores`);
        // Nariz para +x no arquivo: o eixo x do encaixe do motor aponta para −x.
        for (const m of motores) assert.ok(m.matrix[0] < -0.9, `${arq} ${m.name}`);
        for (const papel of ['re', 'esquerda', 'direita']) assert.ok(nos.some((n) => ENCAIXES_PROPULSAO[papel].test(n.name)), `${arq}: ${papel}`);
      }
    }
  }
});
