const { describe, it, before, after } = require('node:test'), assert = require('node:assert/strict');
const { arrancar, fecha } = require('./helpers');
let S, ck, ckR, juan, maria;
const est = (r, s) => assert.equal(r.status, s, JSON.stringify(r.j));
const nuevaCita = (o = {}, c = ck) => S.llamar('citas', { paciente_id: juan, medico_id: 3, clinica_id: 1, inicio: fecha(3), ...o }, c);
before(async () => { S = await arrancar(); const u = (await S.llamar('auth/usuarios')).j; ck = (await S.llamar('auth/entrar', { id: u[0].id, pin: S.pin })).cookie; });
after(() => S.cerrar());

describe('acceso y roles', () => {
  it('sin sesión no se puede nada', async () => { est(await S.llamar('citas?fecha=2099-01-01'), 401); est(await S.llamar('catalogos'), 401); });
  it('PIN incorrecto avisa cuántos intentos quedan', async () => {
    const u = (await S.llamar('auth/usuarios')).j[0], r = await S.llamar('auth/entrar', { id: u.id, pin: '000111' }); est(r, 401); assert.match(r.j.error, /Le quedan 4/); });
  it('la sesión identifica a la doctora', async () => { const r = await S.llamar('yo', null, ck); est(r, 200); assert.equal(r.j.rol, 'doctora'); });
  it('crea recepcionista: puede agendar pero no administrar', async () => {
    const n = await S.llamar('usuarios', { nombre: 'Rosa Pérez', rol: 'recepcion' }, ck); est(n, 201);
    ckR = (await S.llamar('auth/entrar', { id: n.j.id, pin: n.j.pin })).cookie;
    est(await S.llamar('citas?fecha=2099-01-01', null, ckR), 200); est(await S.llamar('usuarios', null, ckR), 403); est(await S.llamar('auditoria', null, ckR), 403); });
  it('cambiar PIN: rechaza fáciles y acepta buenos', async () => {
    est(await S.llamar('auth/pin', { actual: 'x', nuevo: '482913' }, ckR), 400);
    const u = (await S.llamar('auth/usuarios')).j.find(x => x.nombre === 'Rosa Pérez');
    const p = (await S.llamar(`usuarios/${u.id}/pin`, {}, ck)).j.pin;
    est(await S.llamar('auth/pin', { actual: p, nuevo: '123456' }, ckR), 422); est(await S.llamar('auth/pin', { actual: p, nuevo: '482913' }, ckR), 200);
    est(await S.llamar('auth/entrar', { id: u.id, pin: p }), 401); est(await S.llamar('auth/entrar', { id: u.id, pin: '482913' }), 200); });
  it('5 intentos fallidos bloquean; la doctora lo destraba con PIN nuevo', async () => {
    const n = await S.llamar('usuarios', { nombre: 'Bloqueo Prueba', rol: 'recepcion' }, ck), c = [];
    for (let i = 0; i < 5; i++) c.push((await S.llamar('auth/entrar', { id: n.j.id, pin: '000111' })).status);
    assert.deepEqual(c, [401, 401, 401, 401, 429]); est(await S.llamar('auth/entrar', { id: n.j.id, pin: n.j.pin }), 429);
    const nuevo = (await S.llamar(`usuarios/${n.j.id}/pin`, {}, ck)).j.pin; est(await S.llamar('auth/entrar', { id: n.j.id, pin: nuevo }), 200); });
  it('quitar acceso cierra sesiones; no puede quitarse a sí misma', async () => {
    const n = await S.llamar('usuarios', { nombre: 'Temporal', rol: 'recepcion' }, ck), s = await S.llamar('auth/entrar', { id: n.j.id, pin: n.j.pin });
    est(await S.llamar(`usuarios/${n.j.id}/desactivar`, {}, ck), 200); est(await S.llamar('yo', null, s.cookie), 401);
    est(await S.llamar(`usuarios/${(await S.llamar('yo', null, ck)).j.id}/desactivar`, {}, ck), 400); });
  it('salir cierra la sesión', async () => {
    const u = (await S.llamar('auth/usuarios')).j[0], s = await S.llamar('auth/entrar', { id: u.id, pin: S.pin });
    est(await S.llamar('auth/salir', {}, s.cookie), 200); est(await S.llamar('yo', null, s.cookie), 401); });
});

describe('pacientes', () => {
  const base = { nombre: 'Juan Pérez', tipo_doc: 'cedula', documento: '1713175071', telefono: '0991234567', email: 'juan@gmail.com', nacimiento: '1990-05-20' };
  for (const [motivo, cambio, campo] of [['cédula con 9 dígitos', { documento: '171317507' }, 'documento'], ['cédula todo ceros', { documento: '0000000000' }, 'documento'],
    ['cédula con letras', { documento: '17131750ab' }, 'documento'], ['teléfono 12345', { telefono: '12345' }, 'telefono'], ['correo juan@@gmail', { email: 'juan@@gmail' }, 'email'],
    ['nacido en 2090', { nacimiento: '2090-01-01' }, 'nacimiento'], ['nombre con emoji', { nombre: 'Juan 😀' }, 'nombre'], ['nombre con código', { nombre: 'Juan <script>alert(1)</script>' }, 'nombre']])
    it('rechaza ' + motivo + ' y explica qué corregir', async () => { const r = await S.llamar('pacientes', { ...base, ...cambio }, ck); est(r, 422); assert.ok(r.j.errores[campo].length > 10); });
  it('guarda un paciente válido', async () => { const r = await S.llamar('pacientes', base, ck); est(r, 201); juan = r.j.id; });
  it('no repite el mismo documento', async () => { const r = await S.llamar('pacientes', { ...base, nombre: 'Otro Nombre' }, ck); est(r, 409); assert.match(r.j.error, /Juan Pérez/); });
  it('paciente sin documento, correo ni teléfono es válido', async () => { const r = await S.llamar('pacientes', { nombre: 'MARÍA   lópez', tipo_doc: 'sin_documento' }, ck); est(r, 201); maria = r.j.id; });
  it('mismo nombre (sin tildes/mayúsculas) pide confirmar y luego permite', async () => {
    const r = await S.llamar('pacientes', { nombre: 'Maria Lopez', tipo_doc: 'sin_documento' }, ck); est(r, 409); assert.equal(r.j.posible_duplicado, true);
    est(await S.llamar('pacientes', { nombre: 'Maria Lopez', tipo_doc: 'sin_documento', forzar: true }, ck), 201); });
  it('acepta pasaporte de extranjero', async () => est(await S.llamar('pacientes', { nombre: 'John Smith', tipo_doc: 'pasaporte', documento: 'ab123456' }, ck), 201));
  it('la búsqueda ignora tildes y mayúsculas, y busca por documento', async () => {
    assert.ok((await S.llamar('pacientes?q=MARIA', null, ck)).j.length >= 2); assert.equal((await S.llamar('pacientes?q=1713175071', null, ck)).j[0].nombre, 'Juan Pérez'); });
});

describe('citas', () => {
  let id;
  it('agenda una cita futura', async () => { const r = await nuevaCita(); est(r, 201); id = r.j.id; });
  it('la misma hora con el mismo médico se rechaza', async () => { const r = await nuevaCita({ paciente_id: maria }); est(r, 409); assert.match(r.j.error, /ocupada/); });
  it('el mismo médico no puede estar en dos clínicas a la vez', async () => { est(await nuevaCita({ medico_id: 3, clinica_id: 3 }), 409); });
  it('otro médico sí puede esa hora', async () => est(await nuevaCita({ medico_id: 4 }), 201));
  it('rechaza fecha pasada, fuera de horario y minutos raros', async () => {
    assert.match((await nuevaCita({ inicio: fecha(-1) })).j.error, /pasaron/); assert.match((await nuevaCita({ inicio: fecha(3, '07:00') })).j.error, /atiende de/);
    est(await nuevaCita({ inicio: fecha(3, '10:15') }), 400); est(await nuevaCita({ inicio: 'mañana' }), 400); est(await nuevaCita({ paciente_id: 9999 }), 400); });
  it('la disponibilidad marca la hora ocupada', async () => {
    const d = (await S.llamar(`disponibilidad?clinica=1&medico=3&fecha=${fecha(3).slice(0, 10)}`, null, ck)).j;
    assert.equal(d.find(x => x.hora === '10:00').libre, false); assert.equal(d.find(x => x.hora === '09:00').libre, true); });
  it('aparece en las citas del día con los nombres', async () => {
    const l = (await S.llamar('citas?fecha=' + fecha(3).slice(0, 10), null, ck)).j; assert.ok(l.some(c => c.id === id && c.paciente === 'Juan Pérez')); });
  it('cancelar: la hora queda libre y cancelar otra vez no falla', async () => {
    est(await S.llamar(`citas/${id}/cancelar`, {}, ck), 200); const r = await S.llamar(`citas/${id}/cancelar`, {}, ck); est(r, 200); assert.match(r.j.aviso, /ya estaba cancelada/);
    est(await S.llamar('citas/99999/cancelar', {}, ck), 404); });
  it('reactivar falla si otra persona tomó la hora, y funciona cuando está libre', async () => {
    const otra = await nuevaCita({ paciente_id: maria }); est(otra, 201);
    const r = await S.llamar(`citas/${id}/reactivar`, {}, ck); est(r, 409); assert.match(r.j.error, /ya fue tomada/);
    est(await S.llamar(`citas/${otra.j.id}/cancelar`, {}, ck), 200); est(await S.llamar(`citas/${id}/reactivar`, {}, ck), 200);
    assert.match((await S.llamar(`citas/${id}/reactivar`, {}, ck)).j.aviso, /ya estaba activa/); est(await S.llamar('citas/99999/reactivar', {}, ck), 404); });
  it('el historial anota quién hizo qué (solo la doctora lo ve)', async () => {
    const a = (await S.llamar('auditoria', null, ck)).j.map(x => x.accion);
    for (const x of ['entrar', 'crear_paciente', 'crear_cita', 'cancelar_cita', 'reactivar_cita']) assert.ok(a.includes(x), 'falta ' + x); });
});

describe('pacientes con cuenta, términos y anticipo', () => {
  let ckP, citaP;
  const reservar = (o = {}, c = ckP) => S.llamar('citas', { medico_id: 4, clinica_id: 1, inicio: fecha(5), acepta_terminos: true, ...o }, c);
  it('el registro exige PIN no obvio, documento real y que no esté repetido', async () => {
    const d = { nombre: 'Carla Mena', tipo_doc: 'cedula', documento: '1710034065', pin: '482913' };
    est(await S.llamar('auth/paciente/registro', { ...d, pin: '123456' }), 422);
    est(await S.llamar('auth/paciente/registro', { ...d, tipo_doc: 'sin_documento' }), 422);
    const dup = await S.llamar('auth/paciente/registro', { ...d, documento: '1713175071' }); est(dup, 409); assert.match(dup.j.error, /recepción/);
    const r = await S.llamar('auth/paciente/registro', d); est(r, 200); assert.equal(r.j.rol, 'paciente'); ckP = r.cookie; });
  it('entrar: error genérico si falla y entra con el PIN correcto', async () => {
    est(await S.llamar('auth/paciente/entrar', { documento: '1710034065', pin: '000111' }), 401); est(await S.llamar('auth/paciente/entrar', { documento: '0000000000', pin: '482913' }), 401);
    est(await S.llamar('auth/paciente/entrar', { documento: '1710034065', pin: '482913' }), 200); });
  it('un paciente no accede a datos del personal', async () => {
    for (const r of ['pacientes?q=a', 'citas?fecha=2099-01-01', 'usuarios', 'auditoria']) est(await S.llamar(r, null, ckP), 403);
    est(await S.llamar('citas/1/reactivar', {}, ckP), 403); est(await S.llamar('auth/pin', { actual: 'x', nuevo: '482913' }, ckP), 400); });
  it('no deja agendar sin aceptar los términos', async () => { const r = await reservar({ acepta_terminos: false }); est(r, 400); assert.match(r.j.error, /términos/); });
  it('agenda con términos: anticipo de $10 por pagar y la hora se aparta', async () => {
    const r = await reservar(); est(r, 201); citaP = r.j.id; assert.equal(r.j.anticipo, 'pendiente'); assert.equal(r.j.monto, 10);
    est(await nuevaCita({ medico_id: 4, inicio: fecha(5) }), 409); });
  it('no puede agendar a nombre de otra persona; cancelar sin pagar no cuesta', async () => {
    const r = await reservar({ inicio: fecha(5, '11:00'), paciente_id: juan }); est(r, 201);
    assert.ok((await S.llamar('mis-citas', null, ckP)).j.find(c => c.id === r.j.id));
    const x = await S.llamar(`citas/${r.j.id}/cancelar`, {}, ckP); est(x, 200); assert.equal(x.j.anticipo, 'vencido'); });
  it('paga el anticipo (simulado) y aparece como pagado', async () => {
    est(await S.llamar(`citas/${citaP}/pagar`, {}, ckP), 200); assert.match((await S.llamar(`citas/${citaP}/pagar`, {}, ckP)).j.aviso, /ya estaba/);
    assert.equal((await S.llamar('mis-citas', null, ckP)).j.find(c => c.id === citaP).anticipo, 'pagado'); });
  it('no puede pagar ni cancelar citas de otras personas', async () => {
    const o = await nuevaCita({ medico_id: 2, inicio: fecha(6) }); est(o, 201);
    est(await S.llamar(`citas/${o.j.id}/pagar`, {}, ckP), 404); est(await S.llamar(`citas/${o.j.id}/cancelar`, {}, ckP), 404); });
  it('cancelar con anticipo pagado lo retiene y la hora se libera', async () => {
    const r = await S.llamar(`citas/${citaP}/cancelar`, {}, ckP); est(r, 200); assert.equal(r.j.anticipo, 'retenido'); est(await nuevaCita({ medico_id: 4, inicio: fecha(5) }), 201); });
  it('solo la doctora devuelve el anticipo y entonces no se puede reactivar', async () => {
    est(await S.llamar(`citas/${citaP}/devolver-anticipo`, {}, ckR), 403); est(await S.llamar(`citas/${citaP}/devolver-anticipo`, {}, ck), 200); est(await S.llamar(`citas/${citaP}/devolver-anticipo`, {}, ck), 400);
    assert.equal((await S.llamar('citas?fecha=' + fecha(5).slice(0, 10), null, ck)).j.find(c => c.id === citaP).anticipo, 'reembolsado');
    const r = await S.llamar(`citas/${citaP}/reactivar`, {}, ck); est(r, 409); assert.match(r.j.error, /anticipo/); });
});
