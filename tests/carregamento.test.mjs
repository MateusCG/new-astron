// Lista da tela de carregamento (public/js/insumos.js): para cada raça e classe, tudo
// o que a nave pode usar na partida tem de estar na lista (as 5 naves da linha, as
// armas da raça e da classe com os modelos da asa, as texturas e os sons de TODAS as
// versões e dos subprojéteis) e todo arquivo da lista tem de existir: um nome errado
// viraria download falho na entrada ou, pior, um arquivo baixando no meio da partida.
// A lista da partida (insumosDaPartida) vai além: TUDO o que outro piloto ou um
// computador pode trazer (todas as naves, armas, texturas e sons), porque baixar isso
// quando ele aparece travava o jogo (medida de out/2026).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  insumosDaNave,
  insumosDaPartida,
  modelosDasArmas,
  insumosDoMapa,
  texturasDaArma,
  sonsDaArma,
  golpesDaArma,
  quadrosDe,
  texturaDoEfeito,
  SONS_GERAIS,
  SEQUENCIAS,
  ESPECIES_MONSTRO,
} from '../public/js/insumos.js';
import { ESPECIES } from '../server/especies.js';
import { RACAS_JOGAVEIS, ORDEM_CLASSES, linhaDe } from '../shared/naves.js';
import { WEAPONS, ARMAS, armasDisponiveis } from '../shared/armas.js';
import { SONS_INTERFACE, SONS_ARMA } from '../public/js/sons.js';

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

test('carregamento: todos os modelos do mapa e dos monstros entram na lista, e todo arquivo da lista existe', () => {
  const { mapa, monstros } = insumosDoMapa();
  // Cada .glb das pastas está na lista (um modelo novo do Cenário não fica de fora da tela de carregamento).
  const naPasta = (pasta) => readdirSync(path.join(PUBLIC, pasta)).filter((f) => f.endsWith('.glb')).map((f) => f.replace(/\.glb$/, ''));
  assert.deepEqual(new Set(mapa.map((m) => m.nome)), new Set(naPasta('modelos/mapa')));
  assert.deepEqual(new Set(monstros.map((m) => m.nome)), new Set(naPasta('modelos/monstros')));
  for (const m of [...mapa, ...monstros]) assert.ok(existe(m.url), m.url);
  assert.equal(new Set(mapa.map((m) => m.url)).size, mapa.length);
  assert.equal(new Set(monstros.map((m) => m.url)).size, monstros.length);
  // As peças que a cena monta pelos nomes (cena.js) e os efeitos da Medusa (monstros.js).
  for (const nome of ['borda-quadrante', 'borda-quadrante-espelhada', 'fundo-lago', 'mineradora', 'base-warp', 'nucleo', 'torre-suporte', 'torre-suporte-caida', 'plataforma-pouso']) {
    assert.ok(mapa.some((m) => m.nome === nome), nome);
  }
  for (const nome of ['medusa-sangue', 'medusa-bolha']) assert.ok(monstros.some((m) => m.nome === nome), nome);
});

test('carregamento: as texturas PBR do mapa existem e toda imagem da pasta está num conjunto', () => {
  const { texturas } = insumosDoMapa();
  assert.ok(texturas.length >= 3);
  for (const url of texturas) assert.ok(existe(url), url);
  const naPasta = readdirSync(path.join(PUBLIC, 'texturas/mapa')).filter((f) => f.endsWith('.webp'));
  assert.deepEqual(new Set(naPasta.map((f) => `/texturas/mapa/${f}`)), new Set(texturas));
});

test('carregamento: toda espécie do servidor tem modelo (a esp do protocolo é o nome do glb)', () => {
  assert.deepEqual(new Set(ESPECIES_MONSTRO), new Set(Object.keys(ESPECIES)));
  for (const esp of ESPECIES_MONSTRO) assert.ok(existe(`modelos/monstros/${esp}.glb`), esp);
});

// ---------- Lista da partida: tudo o que pode aparecer ----------

for (const race of RACAS_JOGAVEIS) {
  for (const classe of ORDEM_CLASSES) {
    test(`carregamento: a partida de ${race} ${classe} baixa as naves, armas, texturas e sons de TODOS os pilotos`, () => {
      const ins = insumosDaPartida(race, classe);
      const propria = insumosDaNave(race, classe);
      // As 45 naves (toda raça jogável, classe e tier), a linha do piloto primeiro, sem repetir.
      const todas = RACAS_JOGAVEIS.flatMap((r) => ORDEM_CLASSES.flatMap((c) => linhaDe(r, c).map((n) => '/' + n.modelo)));
      assert.equal(ins.naves.length, todas.length);
      assert.deepEqual(new Set(ins.naves.map((n) => n.url)), new Set(todas));
      assert.deepEqual(
        ins.naves.slice(0, propria.naves.length).map((n) => n.url),
        propria.naves.map((n) => n.url),
      );
      for (const n of ins.naves) {
        assert.ok(existe(n.url), n.url);
        // Cada nave sabe de que linha é (a tela de carregamento pede pelo trio).
        assert.equal('/' + linhaDe(n.race, n.classe)[n.tier].modelo, n.url);
      }
      // Toda arma de jogador do catálogo, as do piloto primeiro.
      const kinds = ARMAS.filter((k) => !WEAPONS[k].npc);
      assert.deepEqual(new Set(ins.armas.map((a) => a.kind)), new Set(kinds));
      assert.equal(ins.armas.length, kinds.length);
      assert.deepEqual(
        ins.armas.slice(0, propria.armas.length).map((a) => a.kind),
        propria.armas.map((a) => a.kind),
      );
      // Todo modelo da asa, toda textura e todo som que alguma arma usa.
      const modelos = modelosDasArmas(ins.armas);
      assert.equal(new Set(modelos).size, modelos.length);
      for (const k of kinds) {
        for (const m of WEAPONS[k].modelo ?? []) if (m) assert.ok(modelos.includes(m), `${k}: ${m}`);
        for (const t of texturasDaArma(k)) assert.ok(ins.texturas.includes(t), `${k}: textura ${t}`);
      }
      for (const k of ARMAS) for (const so of sonsDaArma(k)) assert.ok(ins.sons.includes(so), `${k}: som ${so}`);
      for (const so of [...Object.values(SONS_INTERFACE), ...SONS_GERAIS, ...Object.values(SONS_ARMA)]) assert.ok(ins.sons.includes(so), so);
      // Tudo existe e nada repete.
      for (const m of modelos) assert.ok(existe(`modelos/armas/${m}.glb`), m);
      for (const t of ins.texturas) assert.ok(existe(`texturas/efeitos/${t}.png`), t);
      for (const so of ins.sons) assert.ok(existe(`sons/${so}.wav`), so);
      assert.equal(new Set(ins.texturas).size, ins.texturas.length);
      assert.equal(new Set(ins.sons).size, ins.sons.length);
    });
  }
}

test('carregamento: a lista da partida é a mesma para qualquer piloto (só a ordem muda)', () => {
  const chaves = (ins) => ({
    naves: new Set(ins.naves.map((n) => n.url)),
    armas: new Set(ins.armas.map((a) => a.kind)),
    texturas: new Set(ins.texturas),
    sons: new Set(ins.sons),
  });
  const base = chaves(insumosDaPartida('acron', 'assault'));
  for (const race of RACAS_JOGAVEIS) for (const classe of ORDEM_CLASSES) assert.deepEqual(chaves(insumosDaPartida(race, classe)), base, `${race} ${classe}`);
});

test('carregamento: toda nave da pasta de modelos está na lista da partida', () => {
  const naPasta = [];
  for (const race of readdirSync(path.join(PUBLIC, 'modelos/naves'))) {
    const dirRaca = path.join(PUBLIC, 'modelos/naves', race);
    if (!existsSync(dirRaca) || !RACAS_JOGAVEIS.includes(race)) continue;
    for (const classe of readdirSync(dirRaca)) {
      for (const f of readdirSync(path.join(dirRaca, classe))) if (f.endsWith('.glb')) naPasta.push(`/modelos/naves/${race}/${classe}/${f}`);
    }
  }
  const lista = new Set(insumosDaPartida('shrewdo', 'functional').naves.map((n) => n.url));
  assert.ok(naPasta.length >= 45);
  for (const url of naPasta) assert.ok(lista.has(url), url);
});
