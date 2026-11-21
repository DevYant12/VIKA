const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { arrancar, fecha, cedula } = require('./helpers');

let S, ck, paciente, otra;
before(async () => {
  S = await arrancar();
  const u = (await S.llamar('auth/usuarios')).j;
  ck = (await S.llamar('auth/entrar', { id: u[0].id, pin: S.pin })).cookie;
  paciente = (await S.llamar('pacientes', { nombre: 'Paciente Reprogramación', tipo_doc: 'cedula', documento: cedula(812) }, ck)).j.id;
  otra = (await S.llamar('pacientes', { nombre: 'Paciente Segunda', tipo_doc: 'cedula', documento: cedula(813) }, ck)).j.id;
});
after(() => S.cerrar());

describe('reprogramación segura', () => {
  it('cambia fecha, hora, médico y clínica conservando el anticipo', async () => {
    const original = fecha(3, '09:00'), nuevo = fecha(4, '11:00');
    const c = await S.llamar('citas', { paciente_id: paciente, medico_id: 1, clinica_id: 1, inicio: original }, ck);
    assert.equal(c.status, 201);
    const r = await S.llamar(`citas/${c.j.id}/reprogramar`, { inicio: nuevo, medico_id: 2, clinica_id: 2 }, ck);
    assert.equal(r.status, 200, JSON.stringify(r.j));
    const agenda = (await S.llamar(`citas?fecha=${nuevo.slice(0, 10)}`, null, ck)).j.find(x => x.id === c.j.id);
    assert.equal(agenda.inicio, nuevo);
    const h = await S.llamar(`pacientes/${paciente}/citas`, null, ck);
    assert.equal(h.j.reprogramaciones.length, 1);
    assert.equal(h.j.reprogramaciones[0].inicio_anterior, original);
    assert.equal(h.j.reprogramaciones[0].inicio_nuevo, nuevo);
    assert.equal(h.j.reprogramaciones[0].quien, 'Dra. Paredes');
  });

  it('rechaza hora ocupada y deja intacta la cita original', async () => {
    const ocupada = fecha(5, '10:00'), original = fecha(6, '09:00');
    assert.equal((await S.llamar('citas', { paciente_id: otra, medico_id: 3, clinica_id: 1, inicio: ocupada }, ck)).status, 201);
    const c = await S.llamar('citas', { paciente_id: paciente, medico_id: 4, clinica_id: 1, inicio: original }, ck);
    const r = await S.llamar(`citas/${c.j.id}/reprogramar`, { inicio: ocupada, medico_id: 3, clinica_id: 2 }, ck);
    assert.equal(r.status, 409);
    const h = await S.llamar(`pacientes/${paciente}/citas`, null, ck);
    assert.ok(h.j.citas.some(x => x.id === c.j.id && x.inicio === original));
  });

  it('rechaza una fecha imposible y no altera la cita original', async () => {
    const original = fecha(7, '13:00');
    const c = await S.llamar('citas', { paciente_id: paciente, medico_id: 1, clinica_id: 1, inicio: original }, ck);
    assert.equal(c.status, 201);
    const r = await S.llamar('citas/' + c.j.id + '/reprogramar', { inicio: '2026-02-30T09:00', medico_id: 1, clinica_id: 1 }, ck);
    assert.equal(r.status, 400);
    const h = await S.llamar('pacientes/' + paciente + '/citas', null, ck);
    assert.ok(h.j.citas.some(x => x.id === c.j.id && x.inicio === original));
  });

  it('rechaza fechas pasadas y conserva el anticipo indicado', async () => {
    const c = await S.llamar('citas', { paciente_id: paciente, medico_id: 1, clinica_id: 1, inicio: fecha(7, '13:00') }, ck);
    const r = await S.llamar(`citas/${c.j.id}/reprogramar`, { inicio: '2020-01-01T09:00', medico_id: 1, clinica_id: 1 }, ck);
    assert.equal(r.status, 400);
  });
});
