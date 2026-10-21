// Pontos do piloto e a soma de tudo (shared/status.js): pontos por nível, máximo por
// atributo, a tabela do original por raça e classe (conferida com os prints da janela
// CHARACTER) e o objeto único que o servidor e a janela STATUS usam.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import {
  ATRIBUTOS,
  ORDEM_ATRIBUTOS,
  PONTOS_POR_NIVEL,
  PONTO_MAX,
  PILOT_PARAMETER,
  RECARGA_MAX,
  pontosTotais,
  pontosLivres,
  pontosVazios,
  normalizarPontos,
  distribuirPontos,
  porPonto,
  efeitoDosPontos,
  statusDoPiloto,
  statusVazio,
  somaEquipamento,
  multRecarga,
} from '../shared/status.js';
import { versaoEquip, RESIST_MAX } from '../shared/equipamentos.js';
import { naveDe } from '../shared/naves.js';

const perto = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg ?? ''} ${a} != ${b}`);
const PILOT = '/home/mateus/Documentos/old-astron/reference/game_data_decoded/cfg/pilotparameter.txt';

test('pontos: 10 por nível, 99 no máximo em cada um dos cinco atributos', () => {
  assert.deepEqual(ORDEM_ATRIBUTOS, ['durabilidade', 'energia', 'fisico', 'eletrico', 'laser']);
  assert.deepEqual(ORDEM_ATRIBUTOS.map((a) => ATRIBUTOS[a].nome), ['HP', 'Energia', 'Ph.', 'El.', 'Op.']);
  assert.equal(PONTOS_POR_NIVEL, 10);
  assert.equal(PONTO_MAX, 99);
  assert.equal(pontosTotais(1), 10);
  assert.equal(pontosTotais(25), 250);
  assert.equal(pontosTotais(0), 0);
  assert.equal(pontosTotais('3'), 0);
  assert.equal(pontosLivres(1, pontosVazios()), 10);
  assert.equal(pontosLivres(3, { energia: 5, fisico: 10, eletrico: 0, laser: 2 }), 13);
  assert.equal(pontosLivres(1, { energia: 50 }), 0, 'nunca negativo');
  assert.equal(pontosLivres(2, null), 20);
  assert.deepEqual(normalizarPontos({ energia: 150, fisico: -3, eletrico: 2.5, laser: '4', outro: 9 }), { durabilidade: 0, energia: 99, fisico: 0, eletrico: 0, laser: 0 });
  assert.equal(pontosLivres(3, { durabilidade: 7, energia: 5 }), 18, 'a Durabilidade gasta pontos como os outros');
});

test('pontos: distribuir põe o que cabe e recusa com o código certo', () => {
  let r = distribuirPontos(1, pontosVazios(), 'eletrico', 4);
  assert.deepEqual(r, { ok: true, pontos: { durabilidade: 0, energia: 0, fisico: 0, eletrico: 4, laser: 0 }, qtd: 4 });
  r = distribuirPontos(1, r.pontos, 'laser', 99);
  assert.equal(r.qtd, 6, 'só os 6 livres');
  assert.deepEqual(distribuirPontos(1, r.pontos, 'laser'), { ok: false, codigo: 'sem_pontos' });
  assert.deepEqual(distribuirPontos(20, { energia: 99 }, 'energia'), { ok: false, codigo: 'maximo' });
  assert.equal(distribuirPontos(20, { energia: 95 }, 'energia', 10).qtd, 4, 'para no 99');
  assert.deepEqual(distribuirPontos(5, {}, 'hp'), { ok: false, codigo: 'invalido' });
  assert.deepEqual(distribuirPontos(5, {}, 'energia', 0), { ok: false, codigo: 'invalido' });
  assert.deepEqual(distribuirPontos(5, {}, 'energia', 100), { ok: false, codigo: 'invalido' });
  assert.deepEqual(distribuirPontos(5, {}, 'toString'), { ok: false, codigo: 'invalido' });
  const p = { energia: 1, fisico: 0, eletrico: 0, laser: 0 };
  distribuirPontos(5, p, 'energia', 2);
  assert.equal(p.energia, 1, 'não muda o objeto recebido');
});

test('pontos: tabela do original por raça e classe (igual ao pilotparameter.txt)', { skip: !existsSync(PILOT) && 'sem o old-astron' }, () => {
  const texto = readFileSync(PILOT, 'latin1');
  const bloco = (n) => {
    const m = texto.match(new RegExp(`!${n}\\.[^\\n]*\\n\\{([^}]*)\\}`));
    return Object.fromEntries([...m[1].matchAll(/(\d+)\s*=\s*([\d.]+)/g)].map((x) => [x[1], Number(x[2])]));
  };
  const hp = bloco(2);
  const he = bloco(3);
  const phy = bloco(4);
  const opt = bloco(5);
  const elec = bloco(6);
  const regenHp = bloco(7);
  const regen = bloco(8);
  const pctHp = bloco(9);
  const pct = bloco(10);
  for (const [rc, t] of Object.entries(PILOT_PARAMETER)) {
    assert.equal(t.hp, hp[rc], rc);
    assert.equal(t.regenHpMs, regenHp[rc], rc);
    assert.equal(t.hpPct, pctHp[rc], rc);
    assert.equal(t.he, he[rc], rc);
    assert.equal(t.fisico, phy[rc], rc);
    assert.equal(t.laser, opt[rc], rc);
    assert.equal(t.eletrico, elec[rc], rc);
    assert.equal(t.regenEnMs, regen[rc], rc);
    assert.equal(t.hePct, pct[rc], rc);
  }
  assert.equal(Object.keys(PILOT_PARAMETER).length, 9);
});

test('pontos: números conferidos com os prints (Shrewdo Functional)', () => {
  const t = porPonto('shrewdo', 'functional');
  assert.deepEqual([t.he, t.fisico, t.laser, t.eletrico], [14, 2.4, 2.4, 2.6]);
  // El. 30 pontos = +78,0%; 31 = +80,6%.
  perto(efeitoDosPontos('shrewdo', 'functional', { eletrico: 30 }).poder.eletrico, 0.78);
  perto(efeitoDosPontos('shrewdo', 'functional', { eletrico: 31 }).poder.eletrico, 0.806);
  // Energia 50 pontos com energia base 450: +1375 no original (50 × (14 + 0,03 × 450)), regen +5,0/s.
  // No jogo a energia base já vem × 0,3 (135) e o resultado também: 1375 × 0,3.
  const e = efeitoDosPontos('shrewdo', 'functional', { energia: 50 }, 450 * 0.3);
  perto(e.energia, 1375 * 0.3);
  perto(e.regenEn, 5.0 * 0.3 / 0.5);
  // Raça ou classe sem tabela: ponto não vale nada.
  assert.deepEqual(efeitoDosPontos('mechan', 'assault', { energia: 50, laser: 50 }, 100), { hp: 0, regenHp: 0, energia: 0, regenEn: 0, poder: { fisico: 0, laser: 0, eletrico: 0 } });
  // A energia base em % usa a nave do piloto (naves.js).
  const nave = naveDe('acron', 'assault', 0);
  perto(efeitoDosPontos('acron', 'assault', { energia: 10 }, nave.energia).energia, 10 * (11 * 0.3 + 0.03 * nave.energia));
});

test('pontos: Durabilidade dá HP (Skill HP + 3% do HP base) e regeneração de HP, linear como no original', () => {
  const t = porPonto('bellico', 'assault');
  assert.deepEqual([t.hp, t.hpPct, t.regenHpMs], [40, 0.03, 0.0001]);
  const nave = naveDe('bellico', 'assault', 0);
  const um = efeitoDosPontos('bellico', 'assault', { durabilidade: 1 }, 0, nave.hp);
  perto(um.hp, 40 * 0.2 + 0.03 * nave.hp);
  // "Recovery +0,1" por ponto no original (0,0001/ms), na escala do HP do jogo (× 0,2).
  perto(um.regenHp, 0.1 * 0.2);
  const dois = efeitoDosPontos('bellico', 'assault', { durabilidade: 2 }, 0, nave.hp);
  perto(dois.hp, 2 * um.hp);
  perto(dois.regenHp, 2 * um.regenHp);
  // Não mexe na energia nem no poder, e a Energia não mexe no HP.
  assert.equal(um.energia, 0);
  assert.equal(efeitoDosPontos('bellico', 'assault', { energia: 5 }, 100, nave.hp).hp, 0);
  // No status vira hpExtra e regenHpExtra.
  const st = statusDoPiloto({ race: 'bellico', classe: 'assault', pontos: { durabilidade: 10 }, hpBase: nave.hp });
  perto(st.hpExtra, 10 * um.hp);
  perto(st.regenHpExtra, 10 * um.regenHp);
});

test('status: soma pontos, escudo, armadura e os dois potenciadores num objeto só', () => {
  const st = statusDoPiloto({
    race: 'shrewdo',
    classe: 'functional',
    pontos: { energia: 0, fisico: 0, eletrico: 0, laser: 10 },
    equipados: [['e330010', 7], ['e320009', 7], ['e340025', 7], ['e340010', 1]],
    energiaBase: 45,
  });
  assert.deepEqual(Object.keys(st).sort(), Object.keys(statusVazio()).sort());
  perto(st.maxEscudo, 273.8);
  perto(st.regenEscudo, 1.6);
  perto(st.hpExtra, 68.4);
  // Op.: 10 pontos × 2,4% + 20% do Reforço V7.
  perto(st.poder.laser, 0.24 + 0.2);
  perto(st.poder.fisico, 0);
  // Recarga Op.: 15% do Reforço + 8% do Potenciador de Recarga Op. V1 (os dois somam).
  perto(st.recarga.laser, 0.23);
  perto(multRecarga(st.recarga.laser), 0.77);
  // Resistência Op.: escudo 6 pts + armadura 38 pts (× 0,005) + 22% do Reforço.
  perto(st.resist.laser, 0.03 + 0.19 + 0.22);
  perto(st.resist.fisico, 0.05);
  assert.equal(st.critico, 0);
  assert.equal(st.velMult, 1);
  assert.equal(st.acelMult, 1);
});

test('status: tetos, potenciador nos dois encaixes, item de outra classe e potenciadores de mobilidade e crítico', () => {
  // Resistência Ph.: Alcânio Ph. V8 + Neutron Ph. V8 + Resistência Ph. V8 + Total V8 passa do teto.
  const cheio = somaEquipamento([['e330011', 8], ['e320014', 8], ['e340012', 8], ['e340022', 8]], 'assault');
  assert.equal(cheio.resist.fisico, RESIST_MAX);
  // O mesmo potenciador nos dois encaixes (duas instâncias) conta duas vezes, cada
  // uma na sua versão.
  perto(somaEquipamento([['e340027', 8]]).critico, 0.4);
  perto(somaEquipamento([['e340027', 8], ['e340027', 8]]).critico, 0.8);
  const v1 = somaEquipamento([['e340027', 1]]).critico;
  perto(somaEquipamento([['e340027', 8], ['e340027', 1]]).critico, 0.4 + v1);
  // Velocidade e aceleração viram multiplicadores.
  const mob = somaEquipamento([['e340023', 8], ['e340015', 8]]);
  perto(mob.velMult, 1 + 0.05 + 0.08);
  perto(mob.acelMult, 1.2);
  // Armadura de Argônio é Functional: numa Assault não conta.
  assert.equal(somaEquipamento([['e320009', 1]], 'assault').hpExtra, 0);
  perto(somaEquipamento([['e320009', 1]], 'functional').hpExtra, versaoEquip('e320009', 1).hp);
  // Recarga nunca passa de RECARGA_MAX.
  assert.equal(multRecarga(2), 1 - RECARGA_MAX);
  assert.equal(multRecarga(undefined), 1);
  // Sem nada: o status vazio; chaves que não existem não quebram.
  assert.deepEqual(statusDoPiloto(), statusVazio());
  assert.deepEqual(statusDoPiloto({ equipados: [['nada', 1], null, ['x'], 'e330010', 42] }), statusVazio());
  // Nível fora de 1..8 vira V1.
  assert.deepEqual(somaEquipamento([['e330010', 99]]), somaEquipamento([['e330010', 8]]));
  assert.deepEqual(somaEquipamento([['e330010', 'x']]), somaEquipamento([['e330010', 1]]));
});

test('status: determinístico (mesma entrada, mesmo objeto)', () => {
  const entrada = { race: 'acron', classe: 'mobile', pontos: { energia: 20, fisico: 7, eletrico: 3, laser: 0 }, equipados: [['e330007', 3], ['e340019', 1], ['e340031', 1]], energiaBase: 36 };
  assert.deepEqual(statusDoPiloto(entrada), statusDoPiloto(structuredClone(entrada)));
});
