// ¿Qué pasa si un día llegan 500 citas? ¿Y si no llega ninguna?
const { test, describe } = require('node:test'), assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite'), path = require('node:path');
const { arrancar, fecha, cedula } = require('./helpers');

async function entrar(S) { const r = await S.llamar('auth/entrar', { id: 1, pin: S.pin }); return r.cookie; }

describe('volumen', () => {
  test('un día sin citas devuelve lista vacía (no error)', async () => {
    const S = await arrancar(); try {
      const ck = await entrar(S), r = await S.llamar('citas?fecha=' + fecha(3).slice(0, 10), null, ck);
      assert.equal(r.status, 200); assert.deepEqual(r.j, []);
    } finally { S.cerrar(); }
  });
  test('un día con 500 citas se lista completo y rápido', async () => {
    const S = await arrancar(); try {
      const ck = await entrar(S), dia = fecha(5).slice(0, 10);
      const db = new DatabaseSync(path.join(S.dir, 't.db')); db.exec('PRAGMA busy_timeout=5000');
      db.exec('BEGIN'); const pac = db.prepare("INSERT INTO pacientes(nombre,nombre_norm,tipo_doc) VALUES(?,?, 'sin_documento')"), cit = db.prepare('INSERT INTO citas(paciente_id,medico_id,clinica_id,inicio) VALUES(?,?,?,?)');
      // 500 citas: 25 médicos ficticios × 20 horas distintas en un mismo día
      const med = db.prepare("INSERT INTO medicos(nombre,especialidad) VALUES(?,'x')");
      for (let m = 0; m < 25; m++) med.run('Médico ' + m);
      const ids = db.prepare('SELECT id FROM medicos ORDER BY id DESC LIMIT 25').all().map(x => x.id);
      let n = 0; for (const id of ids) for (let h = 0; h < 20; h++, n++) { const p = pac.run('Paciente ' + n, 'paciente ' + n); cit.run(Number(p.lastInsertRowid), id, 1 + (n % 3), `${dia}T${String(8 + Math.floor(h / 2)).padStart(2, '0')}:${h % 2 ? '30' : '00'}`); }
      db.exec('COMMIT'); db.close();
      const t0 = Date.now(), r = await S.llamar('citas?fecha=' + dia, null, ck), ms = Date.now() - t0;
      assert.equal(r.status, 200); assert.equal(r.j.length, 500); assert.ok(ms < 2000, 'tardó ' + ms + ' ms');
    } finally { S.cerrar(); }
  });
});

describe('historial por paciente', () => {
  test('el personal ve las citas de un paciente (activas y canceladas); un paciente no puede', async () => {
    const S = await arrancar(); try {
      const ck = await entrar(S), p = await S.llamar('pacientes', { nombre: 'Rosa Prueba', tipo_doc: 'cedula', documento: cedula(777) }, ck);
      const c = await S.llamar('citas', { paciente_id: p.j.id, medico_id: 2, clinica_id: 1, inicio: fecha(2, '09:00') }, ck); assert.equal(c.status, 201);
      await S.llamar(`citas/${c.j.id}/cancelar`, {}, ck);
      await S.llamar('citas', { paciente_id: p.j.id, medico_id: 2, clinica_id: 1, inicio: fecha(3, '09:30') }, ck);
      const h = await S.llamar(`pacientes/${p.j.id}/citas`, null, ck);
      assert.equal(h.status, 200); assert.equal(h.j.citas.length, 2); assert.deepEqual(h.j.citas.map(x => x.estado).sort(), ['agendada', 'cancelada']);
      assert.equal((await S.llamar('pacientes/9999/citas', null, ck)).status, 404);
      assert.equal((await S.llamar('pacientes/1/citas')).status, 401);        // sin sesión no se ve nada
    } finally { S.cerrar(); }
  });
});
