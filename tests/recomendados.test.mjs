// Aba Recomendados da Loja (shared/recomendados.js): cada item recomendado existe no
// catálogo e está à venda para a raça e a classe dele (senão o cartão compraria algo
// que o servidor recusa), as quatro seções na ordem, os três tipos em cada seção de
// equipamento e o equipamento da Bellico igual ao das outras.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { recomendadosDe, SECOES_RECOMENDADOS, ARMAS_RECOMENDADAS } from '../shared/recomendados.js';
import { armasAVenda } from '../shared/loja.js';
import { ARMAS, WEAPONS } from '../shared/armas.js';
import { EQUIPAMENTOS, equipamentosAVenda } from '../shared/equipamentos.js';
import { RACAS_JOGAVEIS, ORDEM_CLASSES } from '../shared/naves.js';

const nomes = (chaves) => chaves.map((k) => WEAPONS[k]?.nome ?? EQUIPAMENTOS[k]?.nomePt);

test('recomendados: quatro seções na ordem, em toda raça e classe jogável', () => {
  assert.deepEqual(
    SECOES_RECOMENDADOS.map((s) => s.nome),
    ['Armas', 'Escudos', 'Armaduras', 'Potenciadores'],
  );
  for (const race of RACAS_JOGAVEIS)
    for (const classe of ORDEM_CLASSES) {
      const secoes = recomendadosDe(race, classe);
      assert.deepEqual(secoes.map((s) => s.id), ['armas', 'escudo', 'armadura', 'potenciador']);
    }
});

test('recomendados: toda arma recomendada está à venda para a raça e a classe', () => {
  for (const [race, porClasse] of Object.entries(ARMAS_RECOMENDADAS))
    for (const [classe, chaves] of Object.entries(porClasse)) {
      if (chaves === null) continue;
      assert.equal(chaves.length, 5, `${race} ${classe}`);
      const venda = new Set(armasAVenda(race, classe).map((i) => ARMAS[i]));
      for (const k of chaves) assert.ok(venda.has(k), `${race} ${classe}: ${k} (${WEAPONS[k]?.nome}) não está à venda`);
    }
});

test('recomendados: todo equipamento recomendado está à venda para a classe, um de cada tipo', () => {
  for (const race of RACAS_JOGAVEIS)
    for (const classe of ORDEM_CLASSES)
      for (const s of recomendadosDe(race, classe).filter((x) => x.categoria !== 'arma')) {
        const venda = new Set(equipamentosAVenda(classe, s.categoria));
        assert.equal(s.itens.length, 3, `${race} ${classe} ${s.id}`);
        for (const k of s.itens) assert.ok(venda.has(k), `${classe} ${s.id}: ${k} não está à venda`);
        assert.deepEqual(new Set(s.itens.map((k) => EQUIPAMENTOS[k].tipoDano)), new Set(['laser', 'fisico', 'eletrico']));
      }
});

test('recomendados: os itens da lista do Mateus', () => {
  const armas = (race, classe) => nomes(recomendadosDe(race, classe)[0].itens);
  assert.deepEqual(armas('acron', 'assault'), ['Feixe Circular', 'Onda de Sopro Acron', 'Bombardeiro Frontal', 'Tenda de Luz', 'Reparador de Escudo']);
  assert.deepEqual(armas('acron', 'mobile'), ['Feixe Tempestade Circular', 'Feixe Clone em Leque', 'Teleporte', 'Camuflagem', 'Bombardeiro Elétrico']);
  assert.deepEqual(armas('acron', 'functional'), ['Feixe Tempestade Circular', 'Feixe Perfurante de Magma', 'Feixe Relâmpago', 'Canhão de Faíscas', 'Rebatedor de Projéteis']);
  assert.deepEqual(armas('bellico', 'assault'), ['Metralha Crítica', 'Vulcan Teleguiada', 'Feixe Perfurante Circular', 'Canhão de Magma em Leque', 'Invulnerabilidade']);
  assert.deepEqual(armas('bellico', 'mobile'), ['Feixe Clone Duplo', 'Canhão em Fila', 'Míssil Quebra-Escudo', 'Canhão Redutor de Energia', 'Invulnerabilidade']);
  assert.deepEqual(armas('bellico', 'functional'), ['Feixe Perfurante Circular', 'Feixe Clone Duplo', 'Canhão em Fila', 'Vulcan Tempestade Teleguiada', 'Reparador de Escudo']);
  assert.deepEqual(armas('shrewdo', 'assault'), ['Metralha Trovão', 'Feixe Triplo', 'Canhão Tempestade em Leque', 'Invulnerabilidade', 'Camuflagem']);
  assert.deepEqual(armas('shrewdo', 'mobile'), ['Feixe Triplo', 'Feixe de Magma', 'Raio Rastreador', 'Canhão Desgoverno', 'Acelerador']);
  assert.deepEqual(armas('shrewdo', 'functional'), ['Rifle de Magma', 'Feixe Triplo', 'Feixe de Magma', 'Feixe Elétrico Duplo', 'Acelerador']);

  const equip = (classe, i) => nomes(recomendadosDe('acron', classe)[i].itens);
  assert.deepEqual(equip('assault', 1), ['Escudo Máximo Op.', 'Escudo Máximo Ph.', 'Escudo Máximo El.']);
  assert.deepEqual(equip('mobile', 1), ['Escudo Neutron Op.', 'Escudo Neutron Ph.', 'Escudo Neutron El.']);
  assert.deepEqual(equip('functional', 1), ['Escudo Neutron Op.', 'Escudo Neutron Ph.', 'Escudo Neutron El.']);
  assert.deepEqual(equip('assault', 2), ['Armadura de Titânio Op.', 'Armadura de Titânio Ph.', 'Armadura de Titânio El.']);
  assert.deepEqual(equip('mobile', 2), ['Armadura de Amândio Op.', 'Armadura de Amândio Ph.', 'Armadura de Amândio El.']);
  assert.deepEqual(equip('functional', 2), ['Armadura de Argônio Op.', 'Armadura de Argônio Ph.', 'Armadura de Argônio El.']);
  for (const classe of ORDEM_CLASSES) assert.deepEqual(equip(classe, 3), ['Reforço Op.', 'Reforço Ph.', 'Reforço El.']);
});

test('recomendados: nenhuma raça jogável em EM BREVE, o equipamento da Bellico igual ao das outras', () => {
  for (const race of RACAS_JOGAVEIS)
    for (const classe of ORDEM_CLASSES) assert.equal(recomendadosDe(race, classe)[0].emBreve, false, `${race} ${classe}`);
  for (const classe of ORDEM_CLASSES) {
    const [, ...equip] = recomendadosDe('bellico', classe);
    assert.deepEqual(
      equip.map((s) => s.itens),
      recomendadosDe('acron', classe).slice(1).map((s) => s.itens),
    );
  }
});

test('recomendados: raça ou classe desconhecida dá seções vazias, sem quebrar', () => {
  for (const s of recomendadosDe('nada', 'assault')) assert.deepEqual(s.itens, []);
  for (const s of recomendadosDe('acron', 'nada')) assert.deepEqual(s.itens, []);
  for (const s of recomendadosDe(null, null)) assert.deepEqual(s.itens, []);
});

test('recomendados: a dica de cada seção', () => {
  const dica = Object.fromEntries(SECOES_RECOMENDADOS.map((s) => [s.id, s.dica]));
  assert.equal(dica.armas, 'Escolha sua arma pelo tipo de dano que mais deseja causar: Op., Ph. ou El.');
  assert.equal(dica.escudo, 'escolha um: Op., Ph. ou El., pelo dano que mais te acerta');
  assert.equal(dica.armadura, 'escolha um: Op., Ph. ou El., pelo dano que mais te acerta');
  assert.equal(dica.potenciador, 'escolha um: Op., Ph. ou El., para potencializar seus status');
});

test('recomendados: é a primeira aba da Loja e a que abre', () => {
  const src = readFileSync(new URL('../public/js/servicos.js', import.meta.url), 'utf8');
  const loja = src.slice(src.indexOf('loja: ['), src.indexOf('evolucao: ['));
  assert.match(loja, /^loja: \[\s*\['recomendados', tr\('Recomendados'\)\],\s*\['armas'/);
  assert.match(src, /this\.aba = \{ loja: 'recomendados'/);
});
