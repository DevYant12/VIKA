const { describe, it, before, after } = require('node:test'), assert = require('node:assert/strict');
const { arrancar, cedula, proximoDia } = require('./helpers');
let S, ck, ckR;
const est = (r, s) => assert.equal(r.status, s, JSON.stringify(r.j));
before(async () => {
  S = await arrancar(); const u = (await S.llamar('auth/usuarios')).j;
  ck = (await S.llamar('auth/entrar', { id: u[0].id, pin: S.pin })).cookie;
  const n = await S.llamar('usuarios', { nombre: 'Rosa Pérez', rol: 'recepcion' }, ck);
  ckR = (await S.llamar('auth/entrar', { id: n.j.id, pin: n.j.pin })).cookie;
});
after(() => S.cerrar());
const imp = (tipo, texto, o = {}, c = ck) => S.llamar('importar', { tipo, texto, ...o }, c);
const buscar = async q => (await S.llamar('pacientes?q=' + encodeURIComponent(q), null, ck)).j;
const cSin0 = cedula(2000, '01').slice(1);                     // una cédula de provincia 01 a la que Excel le borró el cero inicial
const csv = ['\uFEFFNombre;Cédula;Celular;Fecha de nacimiento;Correo',
  `MARÍA  lópez;${cSin0};987654321;05/03/1990;MARIA@Correo.com`,
  `Juan Pérez;${cedula(3000)};;;`, `Pedro Mal;1234567890;;;`, `Sin Papeles;;;12/12/2015;`, `Juan Pérez;${cedula(3000)};;;`, `Luis Pasaporte;ab-123 456;0991112222;;`].join('\n');

describe('importar pacientes', () => {
  it('solo la doctora importa', async () => { est(await imp('pacientes', csv, {}, ckR), 403); est(await imp('pacientes', csv, {}, null), 401); });
  it('simular muestra el resultado exacto sin guardar nada', async () => {
    const r = await imp('pacientes', csv); est(r, 200);
    assert.equal(r.j.simulado, true); assert.equal(r.j.total, 6); assert.equal(r.j.creados, 4); assert.equal(r.j.ya_existian, 1); assert.equal(r.j.errores, 1);
    assert.equal((await buscar('lopez')).length, 0);
    const mal = r.j.filas.find(f => f.estado === 'error'); assert.equal(mal.linea, 4); assert.match(mal.mensaje, /cédula no es válida/);
    assert.equal(r.j.filas.find(f => f.estado === 'ya_existia').linea, 6); });
  it('importar de verdad: arregla ceros, fechas, tildes y documentos', async () => {
    const r = await imp('pacientes', csv, { simular: false }); est(r, 200); assert.equal(r.j.simulado, false); assert.equal(r.j.creados, 4);
    const m = (await buscar('MARIA LOPEZ'))[0]; assert.equal(m.nombre, 'MARÍA lópez'); assert.equal(m.documento, '0' + cSin0); assert.equal(m.telefono, '0987654321'); assert.equal(m.nacimiento, '1990-03-05');
    const p = (await buscar('pasaporte'))[0]; assert.equal(p.tipo_doc, 'pasaporte'); assert.equal(p.documento, 'AB123456');
    assert.equal((await buscar('sin papeles'))[0].tipo_doc, 'sin_documento'); });
  it('repetir el archivo no duplica: todo "ya existía" o "parecido"', async () => {
    const r = await imp('pacientes', csv, { simular: false }); assert.equal(r.j.creados, 0);
    assert.equal((await buscar('Juan Pérez')).length, 1); assert.ok(r.j.parecidos >= 1, 'Sin Papeles se parece a sí mismo'); });
  it('un parecido (mismo nombre) no se importa salvo que se pida', async () => {
    const t = 'nombre;cedula\nJuan Pérez;' + cedula(4000);
    let r = await imp('pacientes', t); assert.equal(r.j.parecidos, 1); assert.match(r.j.filas[0].mensaje, /se parece a: Juan Pérez/i); assert.equal(r.j.creados, 0);
    r = await imp('pacientes', t, { duplicados: true, simular: false }); assert.equal(r.j.creados, 1); assert.equal((await buscar('Juan Pérez')).length, 2); });
  it('errores claros: archivo vacío, sin columna nombre, tipo desconocido', async () => {
    assert.match((await imp('pacientes', 'nombre')).j.error, /vacío/); assert.match((await imp('pacientes', 'cedula;telefono\n1;2')).j.error, /Faltan.*nombre/);
    est(await imp('perros', 'nombre\nx'), 400); });
  it('acepta archivos grandes (miles de filas) sin romperse', async () => {
    const letras = n => { let t = ''; do { t = String.fromCharCode(97 + (n % 26)) + t; n = Math.floor(n / 26) - 1; } while (n >= 0); return t; };
    const filas = ['nombre;cedula;correo']; for (let i = 0; i < 3000; i++) filas.push(`Paciente de Prueba ${letras(i)};${cedula(10000 + i)};paciente.de.prueba.numero.${i}@ejemplo.com`);
    const t = filas.join('\n'); assert.ok(t.length > 1e5, 'mide ' + t.length);
    const r = await imp('pacientes', t, { simular: false }); est(r, 200); assert.equal(r.j.total, 3000); assert.equal(r.j.creados, 3000); });
});

describe('importar médicos y horarios', () => {
  it('importa médicos nuevos y reconoce los que ya existen', async () => {
    const t = 'Nombre;Especialidad\nDra. Elena Ruiz;Dermatología\nDr. Mora;Cardiología\nXY;nada';
    const r = await imp('medicos', t, { simular: false }); est(r, 200); assert.equal(r.j.creados, 1); assert.equal(r.j.ya_existian, 1); assert.equal(r.j.errores, 1);
    assert.ok((await S.llamar('catalogos', null, ck)).j.medicos.some(m => m.nombre === 'Dra. Elena Ruiz')); });
  it('importa horarios con días escritos como la gente: "lun-vie", "mar, jue", "sábado"', async () => {
    const t = 'Médico;Clínica;Días;Desde;Hasta\nDra. Elena Ruiz;Norte;lunes a viernes;8:00;12:30\nDra. Elena Ruiz;Clínica Sur;mar, jue;14;18\nElena Ruiz;Centro;sábado;09:00;13:00\nNadie Aquí;Norte;lun;08:00;12:00\nDra. Elena Ruiz;Luna;lun;08:00;12:00\nDra. Elena Ruiz;Norte;lunar;08:00;12:00\nDra. Elena Ruiz;Norte;lun;10:15;12:00';
    const r = await imp('horarios', t, { simular: false }); est(r, 200); assert.equal(r.j.creados, 3); assert.equal(r.j.errores, 4);
    const msgs = r.j.filas.map(f => f.mensaje).join('|'); assert.match(msgs, /No hay un médico llamado "Nadie Aquí"/); assert.match(msgs, /No existe la clínica "Luna"/); assert.match(msgs, /No entiendo los días "lunar"/); assert.match(msgs, /en punto o y media/);
    const id = (await S.llamar('catalogos', null, ck)).j.medicos.find(m => m.nombre === 'Dra. Elena Ruiz').id, sur = proximoDia(2, '10:00');
    const d = await S.llamar(`disponibilidad?clinica=3&medico=${id}&fecha=${sur.slice(0, 10)}`, null, ck); assert.equal(d.j[0].hora, '14:00'); assert.equal(d.j.length, 8);
    assert.equal((await S.llamar(`disponibilidad?clinica=2&medico=${id}&fecha=${proximoDia(0).slice(0, 10)}`, null, ck)).j.length, 0); });
  it('la importación queda en la auditoría', async () => { assert.ok((await S.llamar('auditoria', null, ck)).j.some(a => a.accion === 'importar_pacientes')); });
});
