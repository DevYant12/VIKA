const { describe, it, before, after } = require('node:test'), assert = require('node:assert/strict');
const { arrancar, cedula } = require('./helpers');
let S, ck, ckR, rosa, luis, sinDoc;
const est = (r, s) => assert.equal(r.status, s, JSON.stringify(r.j));
before(async () => {
  S = await arrancar(); const u = (await S.llamar('auth/usuarios')).j;
  ck = (await S.llamar('auth/entrar', { id: u[0].id, pin: S.pin })).cookie;
  const n = await S.llamar('usuarios', { nombre: 'Rosa Pérez', rol: 'recepcion' }, ck);
  ckR = (await S.llamar('auth/entrar', { id: n.j.id, pin: n.j.pin })).cookie;
  luis = (await S.llamar('pacientes', { nombre: 'Luis Mora', tipo_doc: 'cedula', documento: cedula(5) }, ckR)).j.id;
  sinDoc = (await S.llamar('pacientes', { nombre: 'Niño Sin Cédula', tipo_doc: 'sin_documento' }, ckR)).j.id;
});
after(() => S.cerrar());
const entrar = (doc, pin) => S.llamar('auth/paciente/entrar', { documento: doc, pin });

describe('recepción da acceso a un paciente ya registrado', () => {
  it('la búsqueda indica quién ya tiene cuenta', async () => { assert.equal((await S.llamar('pacientes?q=Luis', null, ckR)).j[0].tiene_cuenta, 0); });
  it('crea la cuenta, entrega el PIN una sola vez y el paciente entra con él', async () => {
    const r = await S.llamar(`pacientes/${luis}/acceso`, {}, ckR); est(r, 200); assert.equal(r.j.nuevo, true); assert.match(r.j.pin, /^\d{6}$/); rosa = r.j.pin;
    const e = await entrar(cedula(5), rosa); est(e, 200); assert.equal(e.j.rol, 'paciente');
    assert.equal((await S.llamar('pacientes?q=Luis', null, ckR)).j[0].tiene_cuenta, 1); });
  it('el PIN no aparece en la auditoría', async () => {
    const a = JSON.stringify((await S.llamar('auditoria', null, ck)).j); assert.ok(a.includes('activar_cuenta_paciente')); assert.ok(!a.includes(rosa)); });
  it('sin cédula ni pasaporte no se puede dar acceso', async () => { const r = await S.llamar(`pacientes/${sinDoc}/acceso`, {}, ckR); est(r, 422); assert.match(r.j.error, /cédula ni pasaporte/); });
  it('paciente inexistente: 404; un paciente no puede usar esta función', async () => {
    est(await S.llamar('pacientes/9999/acceso', {}, ckR), 404); est(await S.llamar('pacientes/9999/acceso', {}), 401);
    const ckP = (await entrar(cedula(5), rosa)).cookie; est(await S.llamar(`pacientes/${luis}/acceso`, {}, ckP), 403); });
  it('si olvidó el PIN: nuevo PIN, el viejo deja de servir, se cierran sus sesiones y se destraba', async () => {
    const vieja = (await entrar(cedula(5), rosa)).cookie; est(await S.llamar('mis-citas', null, vieja), 200);
    for (let i = 0; i < 5; i++) await entrar(cedula(5), '000111');              // lo bloquean
    est(await entrar(cedula(5), rosa), 429);
    const r = await S.llamar(`pacientes/${luis}/acceso`, {}, ckR); est(r, 200); assert.equal(r.j.nuevo, false);
    est(await entrar(cedula(5), rosa), 401); est(await entrar(cedula(5), r.j.pin), 200); est(await S.llamar('mis-citas', null, vieja), 401); rosa = r.j.pin; });
});

describe('el paciente cambia su propio PIN', () => {
  let ckP;
  before(async () => { ckP = (await entrar(cedula(5), rosa)).cookie; });
  it('exige el PIN actual y rechaza PIN fáciles', async () => {
    est(await S.llamar('auth/pin', { actual: '999888', nuevo: '482913' }, ckP), 400);
    est(await S.llamar('auth/pin', { actual: rosa, nuevo: '123456' }, ckP), 422); est(await S.llamar('auth/pin', { actual: rosa, nuevo: '111111' }, ckP), 422); });
  it('cambia el PIN: el nuevo sirve, el viejo no, y las otras sesiones se cierran pero la actual sigue', async () => {
    const otra = (await entrar(cedula(5), rosa)).cookie;
    est(await S.llamar('auth/pin', { actual: rosa, nuevo: '482913' }, ckP), 200);
    est(await entrar(cedula(5), rosa), 401); est(await entrar(cedula(5), '482913'), 200);
    est(await S.llamar('mis-citas', null, otra), 401); est(await S.llamar('mis-citas', null, ckP), 200); });
  it('sin sesión no se puede', async () => est(await S.llamar('auth/pin', { actual: '482913', nuevo: '593824' }), 401));
  it('adivinar el PIN actual desde una sesión robada se bloquea a los 5 intentos', async () => {
    const c = []; for (let i = 0; i < 5; i++) c.push((await S.llamar('auth/pin', { actual: '000111', nuevo: '593824' }, ckP)).status);
    assert.deepEqual(c, [400, 400, 400, 400, 429]); est(await S.llamar('auth/pin', { actual: '482913', nuevo: '593824' }, ckP), 429); });
});

describe('el personal también queda protegido al cambiar su PIN', () => {
  it('5 intentos fallidos bloquean; cambiar el PIN cierra las otras sesiones', async () => {
    const n = await S.llamar('usuarios', { nombre: 'Marta Cruz', rol: 'recepcion' }, ck), a = (await S.llamar('auth/entrar', { id: n.j.id, pin: n.j.pin })).cookie, b = (await S.llamar('auth/entrar', { id: n.j.id, pin: n.j.pin })).cookie;
    est(await S.llamar('auth/pin', { actual: n.j.pin, nuevo: '482913' }, a), 200); est(await S.llamar('yo', null, a), 200); est(await S.llamar('yo', null, b), 401);
    const c = []; for (let i = 0; i < 5; i++) c.push((await S.llamar('auth/pin', { actual: '000111', nuevo: '593824' }, a)).status); assert.deepEqual(c, [400, 400, 400, 400, 429]); });
});
