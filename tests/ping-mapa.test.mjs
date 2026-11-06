// O círculo que pisca no minimapa onde está o companheiro clicado na barra do time
// (public/js/ping-mapa-regras.js, hud.js e companheiros.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PING_S, PING_PULSOS, PING_RAIO_MIN, PING_RAIO_MAX, aneisDoPing } from '../public/js/ping-mapa-regras.js';

test('ping: anéis que abrem e apagam, PING_PULSOS vezes, e nada depois de PING_S', () => {
  const dur = PING_S / PING_PULSOS;
  const [fixo, comeco] = aneisDoPing(0);
  assert.ok(fixo.alfa > 0.8);
  assert.equal(comeco.raio, PING_RAIO_MIN);
  assert.equal(comeco.alfa, 1);
  const quase = aneisDoPing(dur * 0.99)[1];
  assert.ok(quase.raio > PING_RAIO_MAX - 0.5 && quase.alfa < 0.05, 'o pulso abre e apaga');
  assert.equal(aneisDoPing(dur)[1].raio, PING_RAIO_MIN, 'o pulso seguinte recomeça');
  assert.ok(aneisDoPing(PING_S - 0.1)[0].alfa < 0.3, 'o anel fixo apaga no fim');
  assert.deepEqual(aneisDoPing(PING_S), []);
  assert.deepEqual(aneisDoPing(-1), []);
});

test('ping: o clique em qualquer card da barra do time chama aoLocalizar, e o minimapa desenha', () => {
  const comp = readFileSync(new URL('../public/js/companheiros.js', import.meta.url), 'utf8');
  assert.match(comp, /if \(!li\) return;\s*e\.preventDefault\(\);[^\n]*\n\s*const id = Number\(li\.dataset\.id\);\s*aoLocalizar\(id\);/);
  const hud = readFileSync(new URL('../public/js/hud.js', import.meta.url), 'utf8');
  assert.match(hud, /localizar\(id\) \{\s*this\.ping = \{ id, t0: performance\.now\(\) \};/);
  assert.match(hud, /this\.#pingNoMapa\(eu, ents, meuId\);/);
  const main = readFileSync(new URL('../public/js/main.js', import.meta.url), 'utf8');
  assert.match(main, /aoLocalizar: \(id\) => hud\.localizar\(id\)/);
});
