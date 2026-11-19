process.env.VIKA_DB = ':memory:';
const { test, describe } = require('node:test'), assert = require('node:assert/strict'), { pinValido, hash, coincide } = require('../auth');
describe('PIN', () => {
  test('acepta PIN de 6 números no obvios', () => assert.equal(pinValido('482913'), true));
  for (const p of ['123456', '654321', '111111', '000000', '12345', '1234567', 'abcdef', '48291a', ''])
    test('rechaza ' + (p || 'vacío'), () => assert.equal(pinValido(p), false));
  test('guarda cifrado y verifica', () => { const h = hash('482913'); assert.ok(!h.includes('482913')); assert.equal(coincide('482913', h), true); assert.equal(coincide('482914', h), false); });
  test('el mismo PIN genera cifrados distintos', () => assert.notEqual(hash('482913'), hash('482913')));
  test('sin PIN guardado no deja entrar', () => { assert.equal(coincide('482913', null), false); assert.equal(coincide('482913', ''), false); });
});
