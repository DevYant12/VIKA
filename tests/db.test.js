process.env.VIKA_DB = ':memory:';
const { test, describe } = require('node:test'), assert = require('node:assert/strict'), db = require('../db');
const cita = (p, m, c, i) => db.prepare('INSERT INTO citas(paciente_id,medico_id,clinica_id,inicio) VALUES(?,?,?,?)').run(p, m, c, i);
const pac = (n, doc) => Number(db.prepare("INSERT INTO pacientes(nombre,nombre_norm,tipo_doc,documento) VALUES(?,?,?,?)").run(n, n.toLowerCase(), doc ? 'cedula' : 'sin_documento', doc || null).lastInsertRowid);
describe('base de datos', () => {
  test('datos iniciales: 3 clínicas y médicos de ejemplo', () => {
    assert.equal(db.prepare('SELECT COUNT(*) n FROM clinicas').get().n, 3); assert.ok(db.prepare('SELECT COUNT(*) n FROM medicos').get().n >= 4); });
  test('un médico no puede tener 2 citas a la misma hora, ni en otra clínica', () => {
    const p = pac('Ana', '1710034065'); cita(p, 2, 1, '2099-01-01T09:00');
    assert.throws(() => cita(p, 2, 3, '2099-01-01T09:00'), /UNIQUE/); });
  test('otro médico sí puede usar esa hora', () => { const p = pac('Luis', '1713175071'); assert.doesNotThrow(() => cita(p, 3, 1, '2099-01-01T09:00')); });
  test('al cancelar, la hora queda libre; reactivar con hora tomada falla', () => {
    const p = pac('Eva'), a = Number(cita(p, 1, 1, '2099-02-02T10:00').lastInsertRowid);
    db.prepare("UPDATE citas SET estado='cancelada' WHERE id=?").run(a);
    assert.doesNotThrow(() => cita(p, 1, 1, '2099-02-02T10:00'));
    assert.throws(() => db.prepare("UPDATE citas SET estado='agendada' WHERE id=?").run(a), /UNIQUE/); });
  test('el mismo documento no se repite, pero varios sin documento sí', () => {
    assert.throws(() => pac('Otra Ana', '1710034065'), /UNIQUE/);
    assert.doesNotThrow(() => { pac('Niño Uno'); pac('Niño Dos'); }); });
  test('rechaza estados inventados y pacientes que no existen', () => {
    assert.throws(() => db.prepare("UPDATE citas SET estado='rara' WHERE id=1").run(), /CHECK|constraint/i);
    assert.throws(() => cita(99999, 1, 1, '2099-03-03T10:00'), /FOREIGN|constraint/i); });
});
