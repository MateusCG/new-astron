// Catálogo dos escudos, armaduras e potenciadores do original (shared/equipamentos.js,
// dados gerados por tools/gerar_equipamentos.mjs): quantidade e ordem, as oito
// versões, classes, preços, a escala do jogo e os números conferidos com os prints do
// original.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EQUIPAMENTOS,
  ORDEM_EQUIP,
  CATEGORIAS_EQUIP,
  CATEGORIA_DO_SLOT,
  SLOTS_EQUIP,
  NIVEL_ITEM_MAX,
  equipamentosAVenda,
  equipamento,
  versaoEquip,
  precoEquip,
  precoEvoluirEquip,
  efeitosDoEquip,
  textoEfeitoEquip,
  podeUsar,
} from '../shared/equipamentos.js';
import { EQUIPAMENTOS_ORIGINAL } from '../shared/equipamentos-original.js';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const perto = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg ?? ''} ${a} != ${b}`);
const efeito = (k, nv, tipo, tipoDano) => efeitosDoEquip(k, nv).find((e) => e.tipo === tipo && (tipoDano === undefined || e.tipoDano === tipoDano));

test('equipamentos: 12 escudos, 16 armaduras e 31 potenciadores, nessa ordem, com oito versões cada', () => {
  assert.equal(ORDEM_EQUIP.length, 59);
  const cats = ORDEM_EQUIP.map((k) => EQUIPAMENTOS[k].categoria);
  assert.deepEqual(Object.keys(CATEGORIAS_EQUIP), ['escudo', 'armadura', 'potenciador']);
  assert.equal(cats.filter((c) => c === 'escudo').length, 12);
  assert.equal(cats.filter((c) => c === 'armadura').length, 16);
  assert.equal(cats.filter((c) => c === 'potenciador').length, 31);
  assert.deepEqual(cats, [...cats].sort((a, b) => Object.keys(CATEGORIAS_EQUIP).indexOf(a) - Object.keys(CATEGORIAS_EQUIP).indexOf(b)));
  // A chave é o id da V1 e não muda (é o que vai no protocolo).
  assert.equal(ORDEM_EQUIP[0], 'e330001');
  assert.equal(ORDEM_EQUIP[9], 'e330010');
  assert.equal(ORDEM_EQUIP.at(-1), 'e340031');
  assert.equal(NIVEL_ITEM_MAX, 8);
  for (const k of ORDEM_EQUIP) {
    const e = EQUIPAMENTOS[k];
    assert.equal(e.chave, k);
    assert.equal(k, 'e' + e.id);
    assert.ok(e.nome && e.nomePt && e.nome !== e.nomePt, k);
    assert.equal(e.nome, e.nome.trim(), `${k}: nome sem espaço sobrando`);
    assert.ok(e.classes.length >= 1, k);
    assert.equal(e.versoes.length, NIVEL_ITEM_MAX, k);
    assert.deepEqual(e.versoes.map((v) => v.v), [1, 2, 3, 4, 5, 6, 7, 8], k);
    assert.ok(e.versoes.every((v) => v.nivelPiloto === undefined), `${k}: versão não pede nível`);
    assert.ok(e.preco > 0 && e.preco % 10 === 0, `${k}: ${e.preco}`);
    for (const v of e.versoes) {
      assert.ok(v.preco > 0 && v.preco % 10 === 0, `${k} V${v.v}: ${v.preco}`);
      assert.ok(v.efeitos.length >= 1 && v.efeitos.every((x) => Number.isFinite(x.valor) && x.valor > 0), `${k} V${v.v}`);
    }
    assert.equal(e.versoes.at(-1).taxaTuning, 0, 'a V8 não tem próxima');
  }
});

test('equipamentos: nomes em português, com o original guardado', () => {
  assert.equal(EQUIPAMENTOS.e330010.nomePt, 'Escudo Neutron Op.');
  assert.equal(EQUIPAMENTOS.e330010.nome, 'Op. Neutron Shield');
  assert.equal(EQUIPAMENTOS.e320009.nomePt, 'Armadura de Argônio Op.');
  assert.equal(EQUIPAMENTOS.e320010.nome, 'Ph. Argon Armor', 'espaço sobrando no original sai');
  assert.equal(EQUIPAMENTOS.e320016.nomePt, 'Armadura de Argônio');
  assert.equal(EQUIPAMENTOS.e340025.nomePt, 'Reforço Op.');
  assert.equal(new Set(ORDEM_EQUIP.map((k) => EQUIPAMENTOS[k].nomePt)).size, ORDEM_EQUIP.length, 'nomes únicos');
});

test('equipamentos: tipo de dano e classes como no original', () => {
  assert.equal(EQUIPAMENTOS.e330010.tipoDano, 'laser');
  assert.equal(EQUIPAMENTOS.e330011.tipoDano, 'fisico');
  assert.equal(EQUIPAMENTOS.e330012.tipoDano, 'eletrico');
  assert.equal(EQUIPAMENTOS.e320001.tipoDano, null, 'armadura geral');
  assert.equal(EQUIPAMENTOS.e340025.tipoDano, 'laser', 'Reforço Op.');
  assert.equal(EQUIPAMENTOS.e340020.tipoDano, null, 'Poder Total');
  assert.equal(EQUIPAMENTOS.e340027.tipoDano, null, 'Golpe Fatal não tem tipo');
  // Neutron e Alcânio: todas; Máximo e Titânio: Assault; Leve e Amândio: Mobile; Delta e Argônio: Functional.
  assert.deepEqual(EQUIPAMENTOS.e330010.classes, ['assault', 'mobile', 'functional']);
  assert.deepEqual(EQUIPAMENTOS.e320012.classes, ['assault', 'mobile', 'functional']);
  assert.deepEqual(EQUIPAMENTOS.e330001.classes, ['assault']);
  assert.deepEqual(EQUIPAMENTOS.e320001.classes, ['assault']);
  assert.deepEqual(EQUIPAMENTOS.e330007.classes, ['mobile']);
  assert.deepEqual(EQUIPAMENTOS.e320005.classes, ['mobile']);
  assert.deepEqual(EQUIPAMENTOS.e330004.classes, ['functional']);
  assert.deepEqual(EQUIPAMENTOS.e320009.classes, ['functional']);
  assert.ok(podeUsar('e320009', 'functional'));
  assert.equal(podeUsar('e320009', 'assault'), false);
  assert.equal(podeUsar('nada', 'assault'), false);
  for (const classe of ['assault', 'mobile', 'functional']) {
    assert.equal(equipamentosAVenda(classe, 'escudo').length, 6, classe);
    assert.equal(equipamentosAVenda(classe, 'armadura').length, 8, classe);
    assert.equal(equipamentosAVenda(classe, 'potenciador').length, 31, classe);
    assert.equal(equipamentosAVenda(classe).length, 45, classe);
    assert.ok(equipamentosAVenda(classe).every((k) => podeUsar(k, classe)));
  }
  assert.deepEqual(equipamentosAVenda('nada'), []);
  assert.deepEqual(SLOTS_EQUIP, ['escudo', 'armadura', 'pot1', 'pot2']);
  assert.equal(CATEGORIA_DO_SLOT.pot2, 'potenciador');
});

test('equipamentos: números dos prints do original (escudo e armadura iguais; potenciadores na escala do jogo)', () => {
  // Op. Neutron Shield V7: escudo 1369, recupera 8,0 por s, resistência Op 6.
  const o = EQUIPAMENTOS_ORIGINAL.find((e) => e.id === '330010').versoes[6];
  assert.equal(o.escudo, 1369);
  perto(o.regenMs * 1000, 8.0);
  const neutron = versaoEquip('e330010', 7);
  perto(neutron.maxEscudo, 1369);
  perto(neutron.regenEscudo, 8.0);
  perto(efeito('e330010', 7, 'resist', 'laser').valor, 0.06);
  assert.equal(efeito('e330010', 7, 'resist', 'fisico'), undefined);
  // Op. Argon Armor V7: 342 de HP e resistência 10 / 38 / 10.
  const argon = versaoEquip('e320009', 7);
  perto(argon.hp, 342);
  perto(efeito('e320009', 7, 'resist', 'fisico').valor, 0.1);
  perto(efeito('e320009', 7, 'resist', 'laser').valor, 0.38);
  perto(efeito('e320009', 7, 'resist', 'eletrico').valor, 0.1);
  // Op. Reinforcement V7: +20% poder Op, +15% recarga Op, +22% resistência Op.
  assert.deepEqual(efeitosDoEquip('e340025', 7), [
    { tipo: 'poder', tipoDano: 'laser', valor: 0.2 },
    { tipo: 'recarga', tipoDano: 'laser', valor: 0.15 },
    { tipo: 'resist', tipoDano: 'laser', valor: 0.22 },
  ]);
  // Energia (× 0,3), regeneração de energia (por ms × 1000 × 0,3 ÷ 0,5), penetração (pontos × 0,01).
  perto(efeito('e340004', 1, 'energia').valor, 50 * 0.3);
  perto(efeito('e340005', 1, 'regenEn').valor, 0.003 * 1000 * 0.6);
  perto(efeito('e340017', 1, 'regenHp').valor, 0.0025 * 1000 * 0.2);
  perto(efeito('e340028', 1, 'penetra', 'fisico').valor, 4 * 0.01);
  perto(efeito('e340027', 8, 'critico').valor, 0.4);
  perto(efeito('e340015', 8, 'velocidade').valor, 0.08);
  perto(efeito('e340023', 1, 'aceleracao').valor, 0.1);
  assert.equal(efeitosDoEquip('e340018', 1).length, 3, 'Máximo Total: HP, escudo e energia');
});

test('equipamentos: preço da V1 é a compra, evoluir é a taxa de tuning da anterior, nada depois da V8', () => {
  // Neutron Op.: 2400 no original × 0,06; taxas 3120, 4560 ... × 0,006 (FATOR_OURO_EVOLUIR),
  // de 10 em 10 e no mínimo 10.
  assert.equal(precoEquip('e330010'), 140);
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map((n) => precoEvoluirEquip('e330010', n)), [20, 30, 40, 60, 110, 160, 200]);
  assert.equal(precoEvoluirEquip('e330010', 8), null);
  assert.equal(precoEvoluirEquip('e330010', 0), null);
  assert.equal(precoEvoluirEquip('nada', 1), null);
  assert.equal(precoEquip('nada'), null);
  const e = EQUIPAMENTOS.e330010;
  assert.equal(e.versoes.at(-1).custoTotal, e.versoes.reduce((s, v) => s + v.preco, 0));
  assert.equal(e.versoes[0].taxaTuning, e.versoes[1].preco);
  // Versão fora da faixa: a V1 (ou a V8 acima dela); item que não existe: null.
  assert.equal(versaoEquip('e330010', 0).v, 1);
  assert.equal(versaoEquip('e330010', 99).v, 8);
  assert.equal(versaoEquip('nada', 1), null);
  assert.deepEqual(efeitosDoEquip('nada', 1), []);
  assert.equal(equipamento('toString'), null);
  assert.equal(equipamento(null), null);
});

test('equipamentos: texto de cada efeito em português', () => {
  const t = efeitosDoEquip('e340025', 7).map(textoEfeitoEquip);
  assert.deepEqual(t, ['Poder Op. +20%', 'Recarga Op. 15% mais rápida', 'Resistência Op. +22%']);
  assert.deepEqual(efeitosDoEquip('e330010', 7).map(textoEfeitoEquip), ['Escudo +1.369', 'Escudo +8/s', 'Resistência Op. +6%']);
  assert.equal(textoEfeitoEquip(efeito('e320009', 7, 'hp')), 'Durabilidade +342');
  for (const k of ORDEM_EQUIP) for (const ef of efeitosDoEquip(k, 8)) assert.notEqual(textoEfeitoEquip(ef), ef.tipo, `${k}: ${ef.tipo} sem texto`);
});

test('equipamentos: o gerador é determinístico e o arquivo gerado bate com os dados', () => {
  const alvo = path.join(RAIZ, 'shared', 'equipamentos-original.js');
  const antes = readFileSync(alvo, 'utf8');
  execFileSync(process.execPath, [path.join(RAIZ, 'tools', 'gerar_equipamentos.mjs')], { stdio: 'pipe' });
  assert.equal(readFileSync(alvo, 'utf8'), antes);
  assert.match(antes, /^\/\/ GERADO por tools\/gerar_equipamentos\.mjs/);
});
