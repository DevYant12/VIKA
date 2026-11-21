process.env.VIKA_DB = ':memory:';
const { test, describe } = require('node:test'), assert = require('node:assert/strict'), db = require('../db'), Ant = require('../anticipos');
describe('anticipo y términos', () => {
  test('los términos muestran el anticipo de $10 y dicen que no se devuelve', () => {
    const t = Ant.terminos(); const txt = t.reglas.join(' '); assert.equal(t.anticipo, 10); assert.match(txt, /\$10\.00/); assert.match(txt, /no se devuelve/); assert.match(txt, /tarjeta/); assert.equal(t.version, '1.1'); });
  test('sin horas de gracia, el anticipo nunca se devuelve al cancelar el paciente', () => assert.equal(Ant.destinoAnticipo('2099-01-01T10:00', '2098-01-01T10:00', 0), 'retenido'));
  test('con horas de gracia: devuelve si avisa a tiempo, retiene si no', () => {
    assert.equal(Ant.destinoAnticipo('2099-01-01T10:00', '2098-12-30T10:00', 24), 'reembolsado');
    assert.equal(Ant.destinoAnticipo('2099-01-01T10:00', '2099-01-01T05:00', 24), 'retenido'); });
  test('suelta solo las reservas sin pagar que ya vencieron', () => {
    db.prepare("INSERT INTO pacientes(nombre,nombre_norm) VALUES('Ana','ana')").run();
    const ins = (inicio, ant, creado) => Number(db.prepare(`INSERT INTO citas(paciente_id,medico_id,clinica_id,inicio,anticipo,creado) VALUES(1,1,1,?,?,${creado})`).run(inicio, ant).lastInsertRowid);
    const vieja = ins('2099-05-01T09:00', 'pendiente', "datetime('now','-30 minutes')"), nueva = ins('2099-05-01T10:00', 'pendiente', "datetime('now')"), pagada = ins('2099-05-01T11:00', 'pagado', "datetime('now','-30 minutes')");
    assert.equal(Ant.liberarVencidas(db, 15), 1);
    const f = id => db.prepare('SELECT estado,anticipo FROM citas WHERE id=?').get(id);
    assert.deepEqual({ ...f(vieja) }, { estado: 'cancelada', anticipo: 'vencido' }); assert.equal(f(nueva).estado, 'agendada'); assert.equal(f(pagada).anticipo, 'pagado');
    assert.doesNotThrow(() => ins('2099-05-01T09:00', 'pendiente', "datetime('now')")); });
});
