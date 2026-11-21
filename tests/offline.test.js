const { describe, it, before, after } = require('node:test'), assert = require('node:assert/strict');
const { arrancar, fecha, cedula, proximoDia } = require('./helpers');
let S, ck, ckR, ckSur;
const est = (r, s) => assert.equal(r.status, s, JSON.stringify(r.j));
before(async () => {
  S = await arrancar(); const u = (await S.llamar('auth/usuarios')).j;
  ck = (await S.llamar('auth/entrar', { id: u[0].id, pin: S.pin })).cookie;
  const a = await S.llamar('usuarios', { nombre: 'Rosa Norte', rol: 'recepcion' }, ck), b = await S.llamar('usuarios', { nombre: 'Marta Sur', rol: 'recepcion' }, ck);
  ckR = (await S.llamar('auth/entrar', { id: a.j.id, pin: a.j.pin })).cookie; ckSur = (await S.llamar('auth/entrar', { id: b.j.id, pin: b.j.pin })).cookie;
});
after(() => S.cerrar());
let n = 0; const cid = () => 'cliente' + String(++n).padStart(8, '0');
const pac = (o = {}) => ({ nombre: 'Elena Torres', tipo_doc: 'cedula', documento: cedula(500), telefono: '0991234567', ...o });
const sync = (o = {}, c = ckSur) => S.llamar('citas/sincronizar', { cliente_id: cid(), creada_en: fecha(0, '08:00'), medico_id: 3, clinica_id: 3, inicio: fecha(7, '10:00'), paciente: pac(), ...o }, c);

describe('sincronizar citas hechas sin internet', () => {
  it('crea la cita y el paciente nuevo; queda marcada como registrada sin internet', async () => {
    const r = await sync(); est(r, 201); assert.equal(r.j.estado, 'creada'); assert.equal(r.j.paciente_nuevo, true);
    const dia = (await S.llamar('citas?fecha=' + fecha(7).slice(0, 10), null, ck)).j; const c = dia.find(x => x.id === r.j.id);
    assert.equal(c.paciente, 'Elena Torres'); assert.equal(c.origen, 'offline'); assert.equal(c.anticipo, 'no_aplica'); });
  it('reenviar la misma cita (se perdió la respuesta) no la duplica', async () => {
    const id = cid(), a = await sync({ cliente_id: id, inicio: fecha(7, '11:00') }); est(a, 201);
    const b = await sync({ cliente_id: id, inicio: fecha(7, '11:00') }); est(b, 200); assert.equal(b.j.estado, 'ya_sincronizada'); assert.equal(b.j.id, a.j.id);
    const mismo = await Promise.all([1, 2, 3].map(() => sync({ cliente_id: 'repetida0001', inicio: fecha(7, '12:00') })));
    assert.deepEqual(mismo.map(x => x.status).sort(), [200, 200, 201]); assert.equal(new Set(mismo.map(x => x.j.id)).size, 1); });
  it('reconoce al paciente por su documento: no crea otro', async () => {
    const r = await sync({ inicio: fecha(7, '13:00'), paciente: pac({ nombre: 'Elena Torres Vega' }) }); est(r, 201); assert.equal(r.j.paciente_nuevo, false);
    assert.equal((await S.llamar('pacientes?q=' + cedula(500), null, ck)).j.length, 1); });
  it('también acepta un paciente ya registrado por su id', async () => {
    const id = (await S.llamar('pacientes?q=' + cedula(500), null, ck)).j[0].id; const r = await sync({ inicio: fecha(7, '14:00'), paciente: undefined, paciente_id: id }); est(r, 201); assert.equal(r.j.paciente_id, id); });
  it('CHOQUE: dos clínicas tomaron la misma hora sin internet → gana la primera en sincronizar y la otra recibe alternativas', async () => {
    const hora = fecha(8, '09:00'), sur = await sync({ inicio: hora, paciente: pac({ nombre: 'Paciente Sur', documento: cedula(601) }) }), norte = await sync({ inicio: hora, clinica_id: 1, paciente: pac({ nombre: 'Paciente Norte', documento: cedula(602) }) }, ckR);
    est(sur, 201); est(norte, 409); assert.equal(norte.j.estado, 'conflicto_hora'); assert.match(norte.j.error, /ya fue tomada/);
    assert.equal(norte.j.alternativas.length, 5); assert.ok(norte.j.alternativas.every(a => a > hora || a.slice(0, 10) > hora.slice(0, 10) || a.slice(11) !== '09:00'));
    assert.ok(!norte.j.alternativas.includes(hora)); assert.ok(norte.j.alternativas[0].startsWith(hora.slice(0, 10)));
    // el paciente del choque NO se creó (todo se deshizo)
    assert.equal((await S.llamar('pacientes?q=' + cedula(602), null, ck)).j.length, 0);
    // elegir una alternativa y reenviar con el mismo identificador funciona
    const idNorte = cid(); const otra = await sync({ cliente_id: idNorte, inicio: norte.j.alternativas[0], clinica_id: 1, paciente: pac({ nombre: 'Paciente Norte', documento: cedula(602) }) }, ckR); est(otra, 201); });
  it('el choque queda en la auditoría', async () => assert.ok((await S.llamar('auditoria', null, ck)).j.some(a => a.accion === 'conflicto_cita_offline')));
  it('sin documento y con el mismo nombre: pide confirmar y no adivina', async () => {
    est(await sync({ inicio: fecha(9, '09:00'), paciente: { nombre: 'Niño Pérez', tipo_doc: 'sin_documento' } }), 201);
    const r = await sync({ inicio: fecha(9, '09:30'), paciente: { nombre: 'Niño Pérez', tipo_doc: 'sin_documento' } }); est(r, 409); assert.equal(r.j.estado, 'posible_duplicado'); assert.equal(r.j.existentes.length, 1);
    const otra = await sync({ cliente_id: 'dup00000001', inicio: fecha(9, '09:30'), paciente: { nombre: 'Niño Pérez', tipo_doc: 'sin_documento' }, decision: 'otra' }); est(otra, 201); assert.equal(otra.j.paciente_nuevo, true);
    const misma = await sync({ inicio: fecha(9, '10:00'), paciente: { nombre: 'Niño Pérez', tipo_doc: 'sin_documento' }, decision_paciente_id: r.j.existentes[0].id }); est(misma, 201); assert.equal(misma.j.paciente_id, r.j.existentes[0].id); });
  it('datos inválidos: mensajes claros y nada se guarda', async () => {
    let r = await sync({ inicio: fecha(10, '10:00'), paciente: pac({ documento: '1234567890' }) }); est(r, 422); assert.match(r.j.error, /cédula no es válida/);
    r = await sync({ cliente_id: 'corto' }); est(r, 400); r = await sync({ medico_id: 999 }); est(r, 400); r = await sync({ inicio: 'mañana' }); est(r, 400); r = await sync({ inicio: '2026-02-30T10:00' }); est(r, 400); assert.equal(r.j.estado, 'dato_invalido');
    r = await sync({ medico_id: undefined }); est(r, 400); r = await sync({ inicio: fecha(10, '11:00'), paciente_id: 99999, paciente: undefined }); est(r, 400);
    r = await sync({ inicio: fecha(-1, '10:00') }); est(r, 400); assert.equal(r.j.estado, 'hora_pasada');
    r = await sync({ inicio: fecha(7, '07:00') }); est(r, 400); assert.equal(r.j.estado, 'fuera_de_horario'); });
  it('respeta el horario del médico aunque la cita se haya hecho sin internet', async () => {
    est(await S.llamar('horarios', { medico_id: 3, clinica_id: 3, dias: [1], abre: '09:00', cierra: '12:00' }, ck), 200);
    const f = proximoDia(2, '10:00'); const r = await sync({ inicio: f }); est(r, 400); assert.match(r.j.error, /no atiende en Clínica Sur el martes/); });
  it('pacientes y visitantes no pueden usarlo', async () => { est(await sync({}, null), 401);
    const p = await S.llamar('auth/paciente/registro', { nombre: 'Carla Mena', tipo_doc: 'cedula', documento: cedula(900), pin: '482913' }); est(await sync({}, p.cookie), 403); });
});

describe('agenda para trabajar sin internet', () => {
  it('entrega horarios y horas ocupadas de los próximos días', async () => {
    const f = fecha(3, '10:00'); est(await S.llamar('citas', { paciente_id: 1, medico_id: 2, clinica_id: 1, inicio: f }, ck), 201);
    const r = await S.llamar('agenda-offline?dias=5', null, ckSur); est(r, 200); assert.equal(Object.keys(r.j.horarios).length > 0, true);
    assert.ok(r.j.ocupadas[`2|${f.slice(0, 10)}`].includes('10:00')); assert.equal(r.j.horarios[`1|2|${f.slice(0, 10)}`].length, 18); assert.ok(r.j.desde <= f.slice(0, 10) && f.slice(0, 10) <= r.j.hasta);
    assert.ok(Object.keys(r.j.horarios).every(k => k.split('|')[2] <= r.j.hasta)); });
  it('limita los días, respeta horarios propios y es solo para el personal', async () => {
    assert.ok((await S.llamar('agenda-offline?dias=500', null, ckSur)).j.hasta <= fecha(15).slice(0, 10));
    const lun = proximoDia(1, '10:00'); const r = await S.llamar('agenda-offline?dias=14', null, ckSur); assert.equal(r.j.horarios[`3|3|${lun.slice(0, 10)}`].length, 6);
    est(await S.llamar('agenda-offline'), 401); const p = await S.llamar('auth/paciente/entrar', { documento: cedula(900), pin: '482913' }); est(await S.llamar('agenda-offline', null, p.cookie), 403); });
});
