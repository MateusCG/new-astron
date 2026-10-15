// Lista da tela de carregamento (public/js/insumos.js): para cada raça e classe, tudo
// o que a nave pode usar na partida tem de estar na lista (as 5 naves da linha, as
// armas da raça e da classe com os modelos da asa, as texturas e os sons de TODAS as
// versões e dos subprojéteis) e todo arquivo da lista tem de existir: um nome errado
// viraria download falho na entrada ou, pior, um arquivo baixando no meio da partida.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { insumosDaNave, texturasDaArma, sonsDaArma, golpesDaArma, quadrosDe, texturaDoEfeito, SONS_GERAIS, SEQUENCIAS } from '../public/js/insumos.js';
import { RACAS_JOGAVEIS, ORDEM_CLASSES, linhaDe } from '../shared/naves.js';
import { WEAPONS, ARMAS, armasDisponiveis } from '../shared/armas.js';
import { SONS_INTERFACE } from '../public/js/sons.js';

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const existe = (rel) => existsSync(path.join(PUBLIC, rel));

for (const race of RACAS_JOGAVEIS) {
  for (const classe of ORDEM_CLASSES) {
    test(`carregamento: ${race} ${classe} lista tudo o que a nave usa e os arquivos existem`, () => {
      const ins = insumosDaNave(race, classe);
      // As 5 naves da linha, na ordem da Evolução.
      assert.deepEqual(
        ins.naves.map((n) => n.url),
        linhaDe(race, classe).map((n) => '/' + n.modelo),
      );
      for (const n of ins.naves) assert.ok(existe(n.url), n.url);
      // Todas as armas que a raça e a classe usam, com as duas peças da asa.
      const kinds = armasDisponiveis(race, classe).map((i) => ARMAS[i]).filter((k) => !WEAPONS[k].npc);
      assert.deepEqual(ins.armas.map((a) => a.kind), kinds);
      assert.ok(ins.armas.length >= 18, `${ins.armas.length} armas`);
      for (const a of ins.armas) {
        for (const m of WEAPONS[a.kind].modelo ?? []) if (m) assert.ok(a.modelos.includes(m), `${a.kind}: ${m}`);
        for (const m of a.modelos) assert.ok(existe(`modelos/armas/${m}.glb`), m);
      }
      // Texturas e sons de todas as versões (V1 a V8) e dos golpes filhos.
      for (const a of ins.armas) {
        for (const t of texturasDaArma(a.kind)) assert.ok(ins.texturas.includes(t), `${a.kind}: textura ${t}`);
        for (const s of sonsDaArma(a.kind)) assert.ok(ins.sons.includes(s), `${a.kind}: som ${s}`);
        for (const v of WEAPONS[a.kind].versoes) if (v.som) assert.ok(ins.sons.includes(v.som), `${a.kind} V${v.nivel}: ${v.som}`);
      }
      for (const t of ins.texturas) assert.ok(existe(`texturas/efeitos/${t}.png`), t);
      for (const s of ins.sons) assert.ok(existe(`sons/${s}.wav`), s);
      for (const s of [...Object.values(SONS_INTERFACE), ...SONS_GERAIS]) assert.ok(ins.sons.includes(s), s);
      // Sem repetição (cada arquivo baixa uma vez).
      assert.equal(new Set(ins.texturas).size, ins.texturas.length);
      assert.equal(new Set(ins.sons).size, ins.sons.length);
    });
  }
}

test('carregamento: textura de efeito em sequência entra com todos os quadros', () => {
  let achou = 0;
  for (const kind of ARMAS) {
    for (const g of golpesDaArma(kind)) {
      for (const k of ['d', 'p', 'i', 'f', 'a']) {
        const tex = texturaDoEfeito(g.vis?.[k]);
        if (!tex || !SEQUENCIAS[tex]) continue;
        achou++;
        const lista = texturasDaArma(kind);
        for (const q of quadrosDe(tex)) assert.ok(lista.includes(q), `${kind}: quadro ${q}`);
      }
    }
  }
  assert.ok(achou > 0, 'alguma arma usa sequência de quadros');
});

test('carregamento: golpes de todas as versões, com subprojétil e o que a mina dispara', () => {
  for (const kind of ARMAS) {
    const w = WEAPONS[kind];
    const golpes = golpesDaArma(kind);
    assert.ok(golpes.length >= w.versoes.length, kind);
    for (const v of w.versoes) {
      for (let g = v.golpe; g; g = g.divide ?? g.dispara ?? null) assert.ok(golpes.includes(g), `${kind} V${v.nivel}`);
    }
  }
});
