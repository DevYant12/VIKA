const { describe, it, before, after } = require('node:test'), assert = require('node:assert/strict');
const { arrancar, fecha, cedula, proximoDia } = require('./helpers');
let S, ck, ckR, ana;
const est = (r, s) => assert.equal(r.status, s, JSON.stringify(r.j));
before(async () => {
  S = await arrancar(); const u = (await S.llamar('auth/usuarios')).j;
  ck = (await S.llamar('auth/entrar', { id: u[0].id, pin: S.pin })).cookie;
  const n = await S.llamar('usuarios', { nombre: 'Rosa Pérez', recepcion: 1, rol: 'recepcion' }, ck);
  ckR = (await S.llamar('auth/entrar', { id: n.j.id, pin: n.j.pin })).cookie;
  ana = (await S.llamar('pacientes', { nombre: 'Ana Uno', tipo_doc: 'cedula', documento: cedula(11) }, ck)).j.id;
});
after(() => S.cerrar());
const cita = (o = {}) => S.llamar('citas', { paciente_id: ana, medico_id: 4, clinica_id: 2, inicio: proximoDia(1, '09:00'), ...o }, ck);
const disp = (clinica, medico, f) => S.llamar(`disponibilidad?clinica=${clinica}&medico=${medico}&fecha=${f.slice(0, 10)}`, null, ck);

describe('horarios por médico y clínica', () => {
  it('sin horario propio, el médico atiende en el horario general de la clínica, todos los días', async () => {
    const d = await disp(1, 4, proximoDia(0)); assert.equal(d.j.length, 18); est(await cita({ inicio: proximoDia(0, '10:00') }), 201); });
  it('solo la doctora cambia horarios', async () => {
    const b = { medico_id: 4, clinica_id: 2, dias: [1, 2, 3], abre: '09:00', cierra: '13:00' };
    est(await S.llamar('horarios', b, ckR), 403); est(await S.llamar('horarios'), 401); assert.equal((await S.llamar('horarios', null, ckR)).status, 403); });
  it('valida días y horas con mensajes claros', async () => {
    const b = { medico_id: 4, clinica_id: 2, dias: [1], abre: '09:00', cierra: '13:00' };
    est(await S.llamar('horarios', { ...b, dias: [] }, ck), 422); est(await S.llamar('horarios', { ...b, dias: [9] }, ck), 422);
    est(await S.llamar('horarios', { ...b, abre: '09:15' }, ck), 422); est(await S.llamar('horarios', { ...b, abre: '14:00' }, ck), 422); est(await S.llamar('horarios', { ...b, medico_id: 999 }, ck), 400); });
  it('con horario propio solo atiende donde y cuando se indicó', async () => {
    const r = await S.llamar('horarios', { medico_id: 4, clinica_id: 2, dias: [1, 2, 3], abre: '09:00', cierra: '13:00' }, ck); est(r, 200);
    const lun = proximoDia(1), jue = proximoDia(4);
    assert.deepEqual((await disp(2, 4, lun)).j.map(x => x.hora), ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30']);
    assert.equal((await disp(2, 4, jue)).j.length, 0);          // jueves no atiende
    assert.equal((await disp(1, 4, lun)).j.length, 0);          // en la Clínica Centro tampoco
    assert.equal((await disp(2, 3, jue)).j.length, 18);         // otros médicos no cambian
  });
  it('rechaza agendar fuera del horario del médico y lo explica', async () => {
    let r = await cita({ inicio: proximoDia(1, '14:00') }); est(r, 400); assert.match(r.j.error, /atiende en Clínica Norte de 09:00 a 13:00/);
    r = await cita({ inicio: proximoDia(4, '10:00') }); est(r, 400); assert.match(r.j.error, /no atiende en Clínica Norte el jueves/);
    r = await cita({ clinica_id: 1, inicio: proximoDia(1, '10:00') }); est(r, 400); assert.match(r.j.error, /no atiende en Clínica Centro el lunes/);
    est(await cita({ inicio: proximoDia(1, '10:00') }), 201); });
  it('al cambiar el horario avisa de las citas que quedaron fuera', async () => {
    const r = await S.llamar('horarios', { medico_id: 4, clinica_id: 2, dias: [1], abre: '11:00', cierra: '13:00' }, ck); est(r, 200);
    // dos citas quedan fuera: la del lunes 10:00 (ahora solo atiende 11-13) y la del domingo (ya no atiende ese día)
    assert.equal(r.j.citas_fuera_de_horario, 2); assert.ok(r.j.ejemplos.every(e => e.clinica === 'Clínica Norte'));
    assert.deepEqual(r.j.ejemplos.map(e => new Date(e.inicio.slice(0, 10) + 'T12:00:00').getDay()).sort(), [0, 1]); });
  it('quitar un día y restablecer vuelven al horario general', async () => {
    est(await S.llamar('horarios/quitar', { medico_id: 4, clinica_id: 2, dias: [3] }, ck), 200); assert.equal((await disp(2, 4, proximoDia(3))).j.length, 0);
    est(await S.llamar('horarios/restablecer', { medico_id: 4 }, ck), 200); assert.equal((await disp(2, 4, proximoDia(3))).j.length, 18); });
  it('cambia el horario general de una clínica y solo afecta a médicos sin horario propio', async () => {
    est(await S.llamar('horarios/clinica', { clinica_id: 3, abre: '09:00', cierra: '12:00' }, ck), 200);
    assert.equal((await disp(3, 1, proximoDia(2))).j.length, 6);
    est(await S.llamar('horarios/clinica', { clinica_id: 3, abre: '12:00', cierra: '09:00' }, ck), 422); });
  it('desactivar un médico lo quita del catálogo y no deja agendarle; avisa de sus citas futuras', async () => {
    const f = proximoDia(5, '10:00'); est(await cita({ medico_id: 2, clinica_id: 1, inicio: f }), 201);
    const r = await S.llamar('medicos/2/desactivar', {}, ck); est(r, 200); assert.equal(r.j.citas_futuras, 1);
    assert.ok(!(await S.llamar('catalogos', null, ck)).j.medicos.some(m => m.id === 2));
    est(await cita({ medico_id: 2, clinica_id: 1, inicio: proximoDia(5, '11:00') }), 400);
    est(await S.llamar('medicos/2/desactivar', {}, ckR), 403);
    est(await S.llamar('medicos/2/activar', {}, ck), 200); assert.ok((await S.llamar('catalogos', null, ck)).j.medicos.some(m => m.id === 2)); });
  it('los cambios quedan en la auditoría', async () => {
    const a = (await S.llamar('auditoria', null, ck)).j.map(x => x.accion);
    for (const x of ['horario_medico', 'quitar_horario_medico', 'restablecer_horario_medico', 'horario_clinica', 'desactivar_medico']) assert.ok(a.includes(x), 'falta ' + x); });
});
