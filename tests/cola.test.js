const { describe, it, beforeEach } = require('node:test'), assert = require('node:assert/strict');
const C = require('../public/js/cola.js');
const memoria = () => { const d = {}; return { getItem: k => (k in d ? d[k] : null), setItem: (k, v) => { d[k] = String(v); }, d }; };
let st;
beforeEach(() => { st = memoria(); });
const datos = (o = {}) => ({ medico_id: 3, clinica_id: 3, inicio: '2099-01-05T10:00', paciente: { nombre: 'Elena Torres', tipo_doc: 'cedula', documento: '1710034065' }, ...o });
const respuestas = lista => { const enviados = []; return { enviados, enviar: async it => { enviados.push(it.cliente_id); const r = lista.shift(); if (r instanceof Error) throw r; return r; } }; };

describe('cola de citas sin internet', () => {
  it('encolar guarda la cita como pendiente con identificador único y hora real de creación', () => {
    const a = C.encolar(st, datos(), '2099-01-01T08:15'), b = C.encolar(st, datos({ inicio: '2099-01-05T10:30' }));
    assert.notEqual(a.cliente_id, b.cliente_id); assert.match(a.cliente_id, /^[0-9a-f]{32}$/); assert.equal(a.estado, 'pendiente'); assert.equal(a.creada_en, '2099-01-01T08:15');
    assert.equal(C.leer(st).length, 2); });
  it('sobrevive a recargar la página (se lee de nuevo del almacenamiento)', () => { C.encolar(st, datos()); assert.equal(C.leer(JSON.parse(JSON.stringify({}) ) && st).length, 1); });
  it('un almacenamiento dañado no rompe nada', () => { st.setItem(C.KC, '{no es json'); assert.deepEqual(C.leer(st), []); });

  it('libres: usa horarios guardados y descarta ocupadas, horas pasadas y las ya apartadas en la cola', () => {
    const agenda = { horarios: { '3|3|2099-01-05': ['09:00', '09:30', '10:00', '10:30'] }, ocupadas: { '3|2099-01-05': ['09:30'] } };
    C.encolar(st, datos({ inicio: '2099-01-05T10:00' }));
    const r = C.libres({ agenda, cola: C.leer(st), clinica: 3, medico: 3, fecha: '2099-01-05', ahora: '2099-01-05T09:10' });
    assert.deepEqual(r.map(x => [x.hora, x.libre]), [['09:00', false], ['09:30', false], ['10:00', false], ['10:30', true]]);
    assert.deepEqual(C.libres({ agenda, cola: [], clinica: 3, medico: 3, fecha: '2099-01-06' }), []);     // día sin horario
    assert.deepEqual(C.libres({ agenda: null, cola: [], clinica: 3, medico: 3, fecha: '2099-01-05' }), []); });
  it('libres: la cola de OTRO médico u otro día no bloquea', () => {
    const agenda = { horarios: { '3|3|2099-01-05': ['10:00'] }, ocupadas: {} };
    C.encolar(st, datos({ medico_id: 2 })); C.encolar(st, datos({ inicio: '2099-01-06T10:00' }));
    assert.equal(C.libres({ agenda, cola: C.leer(st), clinica: 3, medico: 3, fecha: '2099-01-05', ahora: '2099-01-01T00:00' })[0].libre, true); });

  it('sincronizar: las confirmadas se borran del equipo y se informan', async () => {
    const a = C.encolar(st, datos()), b = C.encolar(st, datos({ inicio: '2099-01-05T10:30' })), { enviar, enviados } = respuestas([{ status: 201, estado: 'creada', id: 10 }, { status: 200, estado: 'ya_sincronizada', id: 11 }]);
    const r = await C.sincronizar(st, enviar); assert.deepEqual(enviados, [a.cliente_id, b.cliente_id]); assert.deepEqual(r.confirmadas.map(x => x.cita_id), [10, 11]);
    assert.equal(C.leer(st).length, 0); assert.equal(r.pendientes, 0); assert.equal(r.sinRed, false); });
  it('sin red: no pierde nada, queda todo pendiente y se reintenta después', async () => {
    C.encolar(st, datos()); C.encolar(st, datos({ inicio: '2099-01-05T10:30' }));
    const r = await C.sincronizar(st, respuestas([new TypeError('fetch failed')]).enviar); assert.equal(r.sinRed, true); assert.equal(r.pendientes, 2); assert.equal(C.leer(st).length, 2);
    const r2 = await C.sincronizar(st, respuestas([{ status: 201, estado: 'creada', id: 1 }, { status: 201, estado: 'creada', id: 2 }]).enviar); assert.equal(r2.confirmadas.length, 2); assert.equal(C.leer(st).length, 0); });
  it('se corta la red a mitad: las ya enviadas se confirman y las demás siguen pendientes', async () => {
    C.encolar(st, datos()); C.encolar(st, datos({ inicio: '2099-01-05T10:30' })); C.encolar(st, datos({ inicio: '2099-01-05T11:00' }));
    const r = await C.sincronizar(st, respuestas([{ status: 201, estado: 'creada', id: 1 }, new TypeError('x')]).enviar);
    assert.equal(r.confirmadas.length, 1); assert.equal(r.sinRed, true); assert.equal(C.leer(st).length, 2); assert.equal(r.pendientes, 2); });
  it('choque de hora: queda como "conflicto" con alternativas y NO se pierde ni se da por confirmada', async () => {
    C.encolar(st, datos()); const r = await C.sincronizar(st, respuestas([{ status: 409, estado: 'conflicto_hora', error: 'La hora ya fue tomada.', alternativas: ['2099-01-05T10:30'] }]).enviar);
    const it = C.leer(st)[0]; assert.equal(r.confirmadas.length, 0); assert.equal(it.estado, 'conflicto'); assert.equal(it.mensaje, 'La hora ya fue tomada.'); assert.deepEqual(it.alternativas, ['2099-01-05T10:30']);
    assert.deepEqual(C.resumen(C.leer(st)), { total: 1, pendientes: 0, con_problema: 1 }); });
  it('un conflicto no frena las demás: se siguen enviando', async () => {
    C.encolar(st, datos()); C.encolar(st, datos({ inicio: '2099-01-05T10:30' }));
    const r = await C.sincronizar(st, respuestas([{ status: 409, estado: 'conflicto_hora', error: 'x', alternativas: [] }, { status: 201, estado: 'creada', id: 5 }]).enviar);
    assert.equal(r.confirmadas.length, 1); assert.equal(C.leer(st).length, 1); assert.equal(C.leer(st)[0].estado, 'conflicto'); });
  it('elegir hora: elige una alternativa y vuelve a pendiente; luego se confirma', async () => {
    const it = C.encolar(st, datos()); await C.sincronizar(st, respuestas([{ status: 409, estado: 'conflicto_hora', error: 'x', alternativas: ['2099-01-05T10:30'] }]).enviar);
    C.elegirHora(st, it.cliente_id, '2099-01-05T10:30'); const p = C.leer(st)[0]; assert.equal(p.estado, 'pendiente'); assert.equal(p.inicio, '2099-01-05T10:30'); assert.equal(p.alternativas, null); assert.equal(p.cliente_id, it.cliente_id);
    const r = await C.sincronizar(st, respuestas([{ status: 201, estado: 'creada', id: 8 }]).enviar); assert.equal(r.confirmadas.length, 1); });
  it('posible duplicado: pide decidir; "misma persona" o "otra" y reenvía', async () => {
    const it = C.encolar(st, datos({ paciente: { nombre: 'Niño Pérez', tipo_doc: 'sin_documento' } }));
    await C.sincronizar(st, respuestas([{ status: 409, estado: 'posible_duplicado', error: 'Ya hay pacientes con ese nombre.', existentes: [{ id: 7, nombre: 'Niño Pérez' }] }]).enviar);
    assert.equal(C.leer(st)[0].estado, 'revisar'); C.decidir(st, it.cliente_id, { paciente_id: 7 }); let p = C.leer(st)[0]; assert.equal(p.estado, 'pendiente'); assert.equal(p.decision_paciente_id, 7);
    C.decidir(st, it.cliente_id, {}); p = C.leer(st)[0]; assert.equal(p.decision, 'otra'); });
  it('dato inválido: queda como "error" con el mensaje del servidor; se puede descartar', async () => {
    const it = C.encolar(st, datos()); await C.sincronizar(st, respuestas([{ status: 422, estado: 'dato_invalido', errores: { documento: 'La cédula no es válida.' } }]).enviar);
    const e = C.leer(st)[0]; assert.equal(e.estado, 'error'); assert.equal(e.mensaje, 'La cédula no es válida.'); C.descartar(st, it.cliente_id); assert.equal(C.leer(st).length, 0); });
  it('sesión vencida (401): se detiene sin perder nada y avisa para volver a entrar', async () => {
    C.encolar(st, datos()); const r = await C.sincronizar(st, respuestas([{ status: 401, error: 'Inicie sesión.' }]).enviar);
    assert.equal(r.sesion, false); assert.equal(C.leer(st).length, 1); assert.equal(C.leer(st)[0].estado, 'pendiente'); });
  it('error del servidor (500): reintenta después, y tras 5 fallos la marca como error para no insistir para siempre', async () => {
    const it = C.encolar(st, datos());
    for (let i = 1; i <= 4; i++) { const r = await C.sincronizar(st, respuestas([{ status: 500, error: 'x' }]).enviar); assert.equal(C.leer(st)[0].estado, 'pendiente'); assert.equal(C.leer(st)[0].intentos, i); assert.equal(r.pendientes, 1); }
    await C.sincronizar(st, respuestas([{ status: 500, error: 'x' }]).enviar); assert.equal(C.leer(st)[0].estado, 'error'); C.reintentar(st, it.cliente_id); assert.equal(C.leer(st)[0].estado, 'pendiente'); });
  it('las que tienen problema no se reenvían solas', async () => {
    C.encolar(st, datos()); await C.sincronizar(st, respuestas([{ status: 409, estado: 'conflicto_hora', error: 'x' }]).enviar);
    const { enviar, enviados } = respuestas([]); await C.sincronizar(st, enviar); assert.equal(enviados.length, 0); });
  it('mutar un id que no existe no rompe nada', () => { assert.equal(C.elegirHora(st, 'noexiste', '2099-01-01T10:00'), null); C.descartar(st, 'noexiste'); });
});
