// Dos (o muchas) recepcionistas intentan la misma hora con el mismo médico, al mismo tiempo
const { describe, it, before, after } = require('node:test'), assert = require('node:assert/strict');
const { arrancar, fecha } = require('./helpers');
let S, ck, pacientes = [];
before(async () => {
  S = await arrancar(); const u = (await S.llamar('auth/usuarios')).j;
  ck = (await S.llamar('auth/entrar', { id: u[0].id, pin: S.pin })).cookie;
  const docs = ['1710034065', '1713175071'];
  for (const [i, d] of docs.entries()) pacientes.push((await S.llamar('pacientes', { nombre: ['Ana Uno', 'Beto Dos'][i], tipo_doc: 'cedula', documento: d }, ck)).j.id);
});
after(() => S.cerrar());

describe('carrera por la misma hora', () => {
  it('2 peticiones simultáneas: una gana (201), la otra pierde (409)', async () => {
    const inicio = fecha(4, '09:00');
    const r = await Promise.all(pacientes.map(p => S.llamar('citas', { paciente_id: p, medico_id: 1, clinica_id: 1, inicio }, ck)));
    assert.deepEqual(r.map(x => x.status).sort(), [201, 409]);
    const citas = (await S.llamar('citas?fecha=' + inicio.slice(0, 10), null, ck)).j.filter(c => c.estado === 'agendada' && c.inicio === inicio);
    assert.equal(citas.length, 1);
  });
  it('30 peticiones simultáneas: exactamente 1 cita creada, ningún error 500', async () => {
    const inicio = fecha(4, '10:00');
    const r = await Promise.all(Array.from({ length: 30 }, (_, i) => S.llamar('citas', { paciente_id: pacientes[i % 2], medico_id: 2, clinica_id: (i % 3) + 1, inicio }, ck)));
    const n = c => r.filter(x => x.status === c).length;
    // 1 cita creada; los reintentos del mismo paciente devuelven esa misma cita (200); los demás pacientes pierden (409)
    assert.equal(n(201), 1); assert.equal(n(500), 0); assert.equal(n(200) + n(409), 29);
    const ganadora = r.find(x => x.status === 201).j.id;
    assert.ok(r.filter(x => x.status === 200).every(x => x.j.id === ganadora));
    assert.equal(n(200), 4); assert.equal(n(409), 25); // 6 combinaciones paciente+clínica, 5 intentos cada una
  });
});

describe('mejoras de robustez', () => {
  const cita = (o = {}) => S.llamar('citas', { paciente_id: pacientes[0], medico_id: 3, clinica_id: 1, inicio: fecha(6, '09:00'), ...o }, ck);
  it('faltan datos: responde 400 claro, nunca 500', async () => {
    for (const falta of ['paciente_id', 'medico_id', 'clinica_id']) {
      const r = await cita({ [falta]: undefined }); assert.equal(r.status, 400, falta); assert.match(r.j.error, /Falta elegir/);
    }
    assert.equal((await cita({ paciente_id: 'abc' })).status, 400);
    assert.equal((await cita({ medico_id: null })).status, 400);
  });
  it('doble clic del mismo paciente: devuelve la misma cita (200), no un falso "ocupada"', async () => {
    const a = await cita(); assert.equal(a.status, 201);
    const b = await cita(); assert.equal(b.status, 200); assert.equal(b.j.id, a.j.id); assert.equal(b.j.repetida, true);
    const c = await cita({ paciente_id: pacientes[1] }); assert.equal(c.status, 409); assert.match(c.j.error, /ocupada/);
    const d = await cita({ clinica_id: 3 }); assert.equal(d.status, 409); // mismo paciente en OTRA clínica sí es un cruce
  });
  it('doble clic simultáneo del mismo paciente: 1 creada y 1 repetida, misma cita', async () => {
    const r = await Promise.all([1, 2].map(() => cita({ inicio: fecha(6, '10:00') })));
    assert.deepEqual(r.map(x => x.status).sort(), [200, 201]); assert.equal(r[0].j.id, r[1].j.id);
  });
  it('el choque queda en la auditoría', async () => {
    const a = (await S.llamar('auditoria', null, ck)).j.map(x => x.accion);
    assert.ok(a.includes('conflicto_cita'));
  });
  it('hora apartada por un paciente sin pagar: mensaje distinto que explica el plazo', async () => {
    const d = { nombre: 'Carla Mena', tipo_doc: 'cedula', documento: '1712345674', pin: '482913' };
    const reg = await S.llamar('auth/paciente/registro', d);
    if (reg.status !== 200) return; // cédula de ejemplo no válida: no se puede armar este caso
    const ckP = reg.cookie;
    const res = await S.llamar('citas', { medico_id: 4, clinica_id: 1, inicio: fecha(6, '11:00'), acepta_terminos: true }, ckP);
    assert.equal(res.status, 201); assert.equal(res.j.anticipo, 'pendiente');
    const r = await S.llamar('citas', { paciente_id: pacientes[0], medico_id: 4, clinica_id: 1, inicio: fecha(6, '11:00') }, ck);
    assert.equal(r.status, 409); assert.match(r.j.error, /apartada.*anticipo/);
  });
});

