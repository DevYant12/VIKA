const { test, describe } = require('node:test'), assert = require('node:assert/strict'), V = require('../validators');
describe('normalizar y limpiar', () => {
  test('ignora tildes, mayúsculas y espacios de más', () => { assert.equal(V.normalizar('  MARÍA   lópez '), 'maria lopez'); assert.equal(V.normalizar('Maria Lopez'), 'maria lopez'); });
  test('texto vacío o nulo', () => { assert.equal(V.normalizar(null), ''); assert.equal(V.limpiar(undefined), ''); });
  test('limpiar quita símbolos peligrosos y compacta espacios', () => assert.equal(V.limpiar('  a\u0007 <b>  c '), 'a b c'));
});
describe('cédula', () => {
  for (const c of ['1710034065', '1713175071']) test('acepta cédula real ' + c, () => assert.equal(V.cedulaValida(c), true));
  for (const [c, motivo] of [['171003406', '9 dígitos'], ['17100340ab', 'letras'], ['0000000000', 'todo ceros'], ['1710034066', 'dígito verificador malo'], ['9910034065', 'provincia inexistente'], ['1760034065', 'tercer dígito inválido'], ['', 'vacía']])
    test('rechaza: ' + motivo, () => assert.equal(V.cedulaValida(c), false));
});
describe('teléfono y correo', () => {
  for (const t of ['0991234567', '022345678']) test('teléfono válido ' + t, () => assert.equal(V.telefonoValido(t), true));
  for (const t of ['12345', '0891234567', '099123456', 'abc']) test('teléfono inválido ' + t, () => assert.equal(V.telefonoValido(t), false));
  test('correo válido', () => assert.equal(V.emailValido('juan@gmail.com'), true));
  for (const e of ['juan@@gmail', 'juan@gmail', 'juan gmail.com', '<a>@b.com']) test('correo inválido ' + e, () => assert.equal(V.emailValido(e), false));
});
describe('fecha de nacimiento', () => {
  test('acepta una fecha normal y hoy', () => { assert.equal(V.nacimientoValido('1990-05-20'), true); assert.equal(V.nacimientoValido(V.ahoraLocal().slice(0, 10)), true); });
  for (const f of ['2090-01-01', '1700-01-01', '1890-01-01', '1990-13-45', '2023-02-31', '2021-02-29', '20/05/1990', ''])
    test('rechaza ' + (f || 'vacía'), () => assert.equal(V.nacimientoValido(f), false));
});
describe('hora de las clínicas', () => {
  test('ahoraLocal usa la zona de Ecuador (UTC-5) sin importar la del computador', () => {
    assert.equal(V.ahoraLocal(Date.UTC(2026, 0, 15, 3, 30)), '2026-01-14T22:30');   // 03:30 UTC = 22:30 del día anterior en Ecuador
    assert.equal(V.ahoraLocal(Date.UTC(2026, 6, 1, 17, 0)), '2026-07-01T12:00');
  });
  test('29 de febrero solo en año bisiesto', () => { assert.equal(V.nacimientoValido('2020-02-29'), true); assert.equal(V.nacimientoValido('2019-02-29'), false); });
});
