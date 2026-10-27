// Gera shared/equipamentos-original.js, o catálogo dos escudos, armaduras e
// potenciadores (enhancers) do Astro-N original, a partir de
// tools/dados/equipamentos.json.
//
// De onde vêm os dados: os cfg decodificados do jogo original (inititemshield.cfg,
// inititemarmor.cfg e inititemenhanced.cfg, no old-astron), colunas separadas por
// TAB. O tools/dados/equipamentos.json é o recorte enxuto deles: só as linhas de loja
// (id 32xyyy armadura, 33xyyy escudo, 34xyyy potenciador; x = versão − 1, yyy = tipo),
// as oito versões de cada uma (V1 a V8) e só as colunas que o jogo usa. As linhas
// "1xxxxx ... Lv.N" dos mesmos arquivos são outra coisa (projetos e drop) e ficam fora.
//
//   node tools/gerar_equipamentos.mjs --ler [pasta dos cfg]   refaz tools/dados/equipamentos.json
//   node tools/gerar_equipamentos.mjs                         refaz shared/equipamentos-original.js
//
// A pasta padrão é a dos cfg do old-astron (PASTA_CFG). Colunas (índice 0):
// 0 id, 1 nome (a V1 sem sufixo "Vn"), 2 ícone (o mesmo nas oito versões, em
// texture/item do original), 11 tipo de dano (0 Ph, 1 Op, 2 El, 3 nenhum),
// 12 versão, 13 taxa de tuning para a próxima (0 na V8), 15 id da próxima versão,
// 16 categoria (2 armadura, 3 escudo, 4 potenciador), 20 a 23 classes (todas,
// Assault, Mobile, Functional), 25 nível exigido no original, 31 preço da versão e,
// a partir da 35, o que é de cada categoria:
// - escudo: 35 escudo máximo, 36 recuperação por ms, 37/38/39 resistência Ph/Op/El
//   em pontos;
// - armadura: 35 HP a mais, 36/37/38 resistência Ph/Op/El em pontos;
// - potenciador: 36/37/38 códigos de até três efeitos (0 = vazio) e 39/40/41 os
//   valores (a 35 é 0 ou 1 e não muda nada).
//
// O que este script decide e o que fica para o jogo: aqui só se lê e se confere (as
// oito versões ligadas pela coluna 15, na ordem) e se dá o nome em português; os
// números ficam nas UNIDADES DO ORIGINAL. A conversão para a escala do jogo novo, com
// as constantes nomeadas, é de shared/equipamentos.js. A saída é determinística e a
// ordem é escudos, armaduras e potenciadores, cada grupo na ordem do cfg: a chave de
// cada item ('e330010', o id da V1) é estável, item novo entra no fim do grupo.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DADOS = path.join(RAIZ, 'tools', 'dados', 'equipamentos.json');
const SAIDA = path.join(RAIZ, 'shared', 'equipamentos-original.js');
const PASTA_CFG = '/home/mateus/Documentos/old-astron/reference/game_data_decoded/locale/en/cfg';
const N_VERSOES = 8;

// Itens do original que ficam fora do jogo novo (pelo id da V1). Os Reforços T2 (Ph.,
// Op. e El.) são variantes dos Reforços, com o mesmo preço e o mesmo ícone, e não fazem
// mais sentido no jogo: o Mateus pediu para tirá-los (out/2026). A lista fica aqui para
// o --ler não trazê-los de volta.
const FORA_DO_JOGO = new Set([
  '340032', // Ph. Reinforcement T2
  '340033', // Op. Reinforcement T2
  '340034', // El. Reinforcement T2
]);

/** Arquivo, categoria do jogo novo e código da categoria no cfg (coluna 16). */
const ARQUIVOS = [
  { arquivo: 'inititemshield.cfg', categoria: 'escudo', codigo: 3, prefixo: '33' },
  { arquivo: 'inititemarmor.cfg', categoria: 'armadura', codigo: 2, prefixo: '32' },
  { arquivo: 'inititemenhanced.cfg', categoria: 'potenciador', codigo: 4, prefixo: '34' },
];

// ---------- Nomes em português ----------

// Prefixo do tipo de dano no nome do original: fica como sufixo abreviado, igual à
// interface do original ("Op." é o laser do jogo novo).
const SIGLAS = ['Ph.', 'Op.', 'El.'];

/** Nome do original sem a sigla do tipo, em português (sem a sigla). */
const NOMES_PT = {
  'Maximum Shield': 'Escudo Máximo',
  'Delta Shield': 'Escudo Delta',
  'Light Shield': 'Escudo Leve',
  'Neutron Shield': 'Escudo Neutron',
  'Titanium Armor': 'Armadura de Titânio',
  'Amandium Armor': 'Armadura de Amândio',
  'Argon Armor': 'Armadura de Argônio',
  'Alchanium Armor': 'Armadura de Alcânio',
  'Durability Enhancer': 'Potenciador de Durabilidade',
  'Maximum Shield Enhancer': 'Potenciador de Escudo',
  'Shield Recovering Enhancer': 'Potenciador de Regeneração do Escudo',
  'Maximum Energy Enhancer': 'Potenciador de Energia',
  'Energy Recovering Enhancer': 'Potenciador de Regeneração de Energia',
  'Striking Power Enhancer': 'Potenciador de Poder',
  'Cooldown Enhancer': 'Potenciador de Recarga',
  'Resistance Enhancer': 'Potenciador de Resistência',
  'Maximum Speed Enhancer': 'Potenciador de Velocidade',
  'Acceleration Enhancer': 'Potenciador de Aceleração',
  'Durability Recovering Enhancer': 'Potenciador de Conserto',
  'Total Maximum Enhancer': 'Potenciador Máximo Total',
  'Total Recovering Enhancer': 'Potenciador de Recuperação Total',
  'Total Striking Power Enhancer': 'Potenciador de Poder Total',
  'Total Cooldown Enhancer': 'Potenciador de Recarga Total',
  'Total Resistance Enhancer': 'Potenciador de Resistência Total',
  'Mobility Enhancer': 'Potenciador de Mobilidade',
  Reinforcement: 'Reforço',
  'Fatal Stirke Enhancer': 'Potenciador de Golpe Fatal', // "Stirke" assim no original
  'Penetration Enhancer': 'Potenciador de Penetração',
  'Total Penetration Enhancer': 'Potenciador de Penetração Total',
};

/** 'Op. Neutron Shield' -> 'Escudo Neutron Op.'; 'Op. Reinforcement' -> 'Reforço Op.'. */
function nomePt(nome) {
  const sigla = SIGLAS.find((s) => nome.startsWith(s + ' '));
  const base = sigla ? nome.slice(sigla.length + 1) : nome;
  const pt = NOMES_PT[base];
  if (!pt) throw new Error(`item sem nome em português: "${nome}" (acrescente em NOMES_PT)`);
  return sigla ? `${pt} ${sigla}` : pt;
}

// ---------- ler: cfg -> tools/dados/equipamentos.json ----------

const num = (x) => Number(String(x).trim());

function lerArquivo(pasta, { arquivo, categoria, codigo, prefixo }) {
  const linhas = readFileSync(path.join(pasta, arquivo), 'latin1')
    .split(/\r?\n/)
    .map((l) => l.split('\t').map((c) => c.trim()))
    .filter((c) => /^\d{6}$/.test(c[0]) && c[0].startsWith(prefixo));
  const porId = new Map(linhas.map((c) => [c[0], c]));
  const itens = [];
  for (const c of linhas) {
    if (c[0][2] !== '0') continue; // só a V1 abre um item; as outras vêm pela corrente
    if (FORA_DO_JOGO.has(c[0])) continue;
    const versoes = [];
    for (let id = c[0], v = 1; v <= N_VERSOES; v++) {
      const l = porId.get(id);
      if (!l) throw new Error(`${arquivo}: falta a V${v} de ${c[0]} (${id})`);
      if (num(l[12]) !== v || num(l[16]) !== codigo) throw new Error(`${arquivo}: ${id} não é a V${v} de ${categoria}`);
      versoes.push(versao(categoria, l));
      id = l[15];
      if (v === N_VERSOES && id !== '0') throw new Error(`${arquivo}: ${c[0]} tem mais de ${N_VERSOES} versões`);
    }
    const nome = c[1];
    itens.push({
      id: c[0],
      nome,
      nomePt: nomePt(nome),
      icone: c[2].toLowerCase(),
      categoria,
      tipo: num(c[11]),
      classes: [20, 21, 22, 23].map((k) => num(c[k])),
      versoes,
    });
  }
  return itens;
}

/** Uma versão nas unidades do original: o comum e o que é da categoria. */
function versao(categoria, l) {
  const v = { v: num(l[12]), id: l[0], preco: num(l[31]), taxa: num(l[13]), nivel: num(l[25]) };
  if (categoria === 'escudo') Object.assign(v, { escudo: num(l[35]), regenMs: num(l[36]), resist: [37, 38, 39].map((k) => num(l[k])) });
  else if (categoria === 'armadura') Object.assign(v, { hp: num(l[35]), resist: [36, 37, 38].map((k) => num(l[k])) });
  else v.efeitos = [0, 1, 2].filter((i) => num(l[36 + i]) !== 0).map((i) => [num(l[36 + i]), num(l[39 + i])]);
  return v;
}

function ler(pasta = PASTA_CFG) {
  const itens = ARQUIVOS.flatMap((a) => lerArquivo(pasta, a));
  // Um item por linha: o arquivo fica curto e o diff mostra qual item mudou.
  writeFileSync(DADOS, `{"equipamentos":[\n${itens.map((x) => JSON.stringify(x)).join(',\n')}\n]}\n`);
  const conta = Object.fromEntries(ARQUIVOS.map((a) => [a.categoria, itens.filter((i) => i.categoria === a.categoria).length]));
  console.log(`${itens.length} itens (${JSON.stringify(conta)}) em ${path.relative(RAIZ, DADOS)}`);
}

// ---------- gerar: tools/dados/equipamentos.json -> shared/equipamentos-original.js ----------

function gerar() {
  const { equipamentos } = JSON.parse(readFileSync(DADOS, 'utf8'));
  const texto = `// GERADO por tools/gerar_equipamentos.mjs a partir de tools/dados/equipamentos.json: não edite à mão.
//
// Os ${equipamentos.length} escudos, armaduras e potenciadores do Astro-N original, na ordem do
// catálogo (escudos, armaduras, potenciadores), com as versões V1 a V8. Números nas
// unidades do original: a conversão para o jogo novo é de shared/equipamentos.js.
// Campos: id (da V1), nome (original), nomePt, icone (public/texturas/itens), categoria, tipo (0 Ph, 1 Op, 2 El,
// 3 nenhum), classes ([todas, Assault, Mobile, Functional]) e versoes ({ v, id,
// preco, taxa (tuning para a próxima), nivel (exigido no original) } mais escudo +
// regenMs + resist [Ph, Op, El] no escudo, hp + resist na armadura e efeitos
// [[código, valor]] no potenciador).

export const EQUIPAMENTOS_ORIGINAL = [
${equipamentos.map((e) => JSON.stringify(e)).join(',\n')},
];
`;
  writeFileSync(SAIDA, texto);
  console.log(`${equipamentos.length} itens em ${path.relative(RAIZ, SAIDA)} (${(texto.length / 1024).toFixed(0)} KB)`);
}

if (process.argv[2] === '--ler') ler(process.argv[3]);
else gerar();
