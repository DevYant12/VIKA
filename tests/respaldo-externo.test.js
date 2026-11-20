const { test, describe } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), { spawnSync } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite'), B = require('../backup');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'vk-'));
const nuevaDb = () => { const d = new DatabaseSync(':memory:'); d.exec("CREATE TABLE t(x); INSERT INTO t VALUES(1),(2),(3)"); return d; };
const filas = f => { const c = new DatabaseSync(f); try { return c.prepare('SELECT COUNT(*) n FROM t').get().n; } finally { c.close(); } };

describe('cifrado', () => {
  test('ida y vuelta; clave equivocada o archivo alterado fallan con mensaje claro', () => {
    const c = B.cifrar(Buffer.from('datos de salud'), 'clave-larga'); assert.ok(!c.includes('datos de salud'));
    assert.equal(B.descifrar(c, 'clave-larga').toString(), 'datos de salud');
    assert.throws(() => B.descifrar(c, 'otra'), /clave no es correcta/); c[60] ^= 1; assert.throws(() => B.descifrar(c, 'clave-larga'), /dañado/);
    assert.throws(() => B.descifrar(Buffer.from('basura'.repeat(20)), 'x'), /no es una copia cifrada/); });
});
describe('copia externa', () => {
  test('copia local + externa verificadas; la externa conserva más días', () => {
    const [dir, extra] = [tmp(), path.join(tmp(), 'usb')], db = nuevaDb();
    const r = B.ejecutar(db, { dir, extra, conservarExtra: 2 }); assert.equal(r.local_ok, true); assert.equal(r.extra_ok, true); assert.equal(r.cifrado, false);
    assert.equal(filas(path.join(extra, path.basename(r.archivo))), 3);
    for (const d of ['2020-01-01', '2020-01-02', '2020-01-03']) fs.writeFileSync(path.join(extra, `vika-${d}.db`), '');
    B.ejecutar(db, { dir, extra, conservarExtra: 2 }); assert.equal(fs.readdirSync(extra).filter(x => x.endsWith('.db')).length, 2); });
  test('cifrada: el archivo externo no se puede abrir sin la clave y sí con ella', () => {
    const [dir, extra, db] = [tmp(), tmp(), nuevaDb()], r = B.ejecutar(db, { dir, extra, clave: 'mi-clave-secreta' });
    assert.equal(r.extra_ok, true); assert.equal(r.cifrado, true);
    const f = path.join(extra, path.basename(r.archivo) + '.enc'); assert.ok(fs.existsSync(f)); assert.throws(() => new DatabaseSync(f).prepare('SELECT 1 FROM t').get());
    const plano = path.join(tmp(), 'x.db'); fs.writeFileSync(plano, B.descifrar(fs.readFileSync(f), 'mi-clave-secreta')); assert.equal(filas(plano), 3); });
  test('USB desconectado (la carpeta madre no existe): lo dice claro, NO inventa una carpeta local, y la copia local sí se hace', () => {
    const dir = tmp(), extra = path.join(os.tmpdir(), 'no-existe-' + Date.now(), 'usb'), r = B.ejecutar(nuevaDb(), { dir, extra });
    assert.equal(r.local_ok, true); assert.equal(r.extra_ok, false); assert.match(r.error, /USB o la unidad de red/); assert.ok(!fs.existsSync(path.dirname(extra))); });
  test('si la copia local falla, lo informa sin lanzar', () => { const archivo = path.join(tmp(), 'soy-un-archivo'); fs.writeFileSync(archivo, 'x'); const r = B.ejecutar(nuevaDb(), { dir: path.join(archivo, 'sub'), extra: tmp() }); assert.equal(r.local_ok, false); assert.match(r.error, /Copia local/); });
  test('se puede repetir el mismo día: el archivo se renueva con los datos más recientes', () => {
    const [dir, extra, db] = [tmp(), tmp(), nuevaDb()]; B.ejecutar(db, { dir, extra }); db.exec('INSERT INTO t VALUES(4)'); const r = B.ejecutar(db, { dir, extra });
    assert.equal(filas(r.archivo), 4); assert.equal(filas(path.join(extra, path.basename(r.archivo))), 4); });
});
describe('estado y avisos para la doctora', () => {
  const tabla = () => { const d = new DatabaseSync(':memory:'); d.exec("CREATE TABLE respaldos(id INTEGER PRIMARY KEY, cuando TEXT DEFAULT CURRENT_TIMESTAMP, archivo TEXT, bytes INTEGER, local_ok INTEGER, extra_config INTEGER, extra_ok INTEGER, cifrado INTEGER, mismo_disco INTEGER, error TEXT)"); return d; };
  test('sin copia externa configurada avisa que todo está en un solo computador', () => { const d = tabla(); B.registrar(d, { local_ok: true, extra_config: false, extra_ok: null, bytes: 1 });
    assert.deepEqual(B.estado(d, false).avisos.map(a => a.codigo), ['sin_copia_externa']); });
  test('todo bien: sin avisos', () => { const d = tabla(); B.registrar(d, { local_ok: true, extra_config: true, extra_ok: true, cifrado: true, bytes: 1 }); const e = B.estado(d, true); assert.deepEqual(e.avisos, []); assert.equal(e.cifrada, true); });
  test('la copia externa falló: lo dice con el motivo', () => { const d = tabla(); B.registrar(d, { local_ok: true, extra_config: true, extra_ok: false, error: 'Copia externa: USB desconectado', bytes: 1 });
    const a = B.estado(d, true).avisos; assert.equal(a[0].codigo, 'copia_externa_fallo'); assert.match(a[0].mensaje, /USB desconectado/); });
  test('copias viejas (más de 2 días) generan aviso', () => { const d = tabla(); B.registrar(d, { local_ok: true, extra_config: true, extra_ok: true, bytes: 1 });
    const cod = B.estado(d, true, Date.now() + 3 * 864e5).avisos.map(a => a.codigo); assert.ok(cod.includes('copia_vieja') && cod.includes('copia_externa_vieja')); });
  test('sin ninguna copia registrada también avisa', () => assert.ok(B.estado(tabla(), true).avisos.some(a => a.codigo === 'copia_vieja')));
});
describe('restaurar.js', () => {
  const restaurar = (args, env = {}) => spawnSync(process.execPath, [path.join(__dirname, '..', 'restaurar.js'), ...args], { env: { ...process.env, ...env }, encoding: 'utf8' });
  test('restaura una copia normal y guarda la base anterior', () => {
    const [dir, d2] = [tmp(), tmp()], r = B.ejecutar(nuevaDb(), { dir }), dest = path.join(d2, 'vika.db'); fs.writeFileSync(dest, 'base vieja'); fs.writeFileSync(dest + '-wal', 'x');
    const x = restaurar([r.archivo, dest]); assert.equal(x.status, 0, x.stderr); assert.equal(filas(dest), 3); assert.ok(fs.readdirSync(d2).some(n => n.includes('antes-de-restaurar'))); assert.ok(!fs.existsSync(dest + '-wal')); });
  test('restaura una cifrada solo con la clave correcta', () => {
    const [dir, extra, d2] = [tmp(), tmp(), tmp()], r = B.ejecutar(nuevaDb(), { dir, extra, clave: 'clave-uno' }), enc = path.join(extra, path.basename(r.archivo) + '.enc'), dest = path.join(d2, 'vika.db');
    assert.notEqual(restaurar([enc, dest]).status, 0); const mal = restaurar([enc, dest], { VIKA_BACKUP_CLAVE: 'otra' }); assert.notEqual(mal.status, 0); assert.match(mal.stderr, /clave no es correcta/); assert.ok(!fs.existsSync(dest));
    assert.equal(restaurar([enc, dest], { VIKA_BACKUP_CLAVE: 'clave-uno' }).status, 0); assert.equal(filas(dest), 3); });
  test('un archivo dañado o inexistente no toca la base actual', () => {
    const d = tmp(), dest = path.join(d, 'vika.db'), malo = path.join(d, 'malo.db'); fs.writeFileSync(dest, 'actual'); fs.writeFileSync(malo, 'esto no es sqlite'.repeat(50));
    const x = restaurar([malo, dest]); assert.notEqual(x.status, 0); assert.equal(fs.readFileSync(dest, 'utf8'), 'actual'); assert.match(restaurar([path.join(d, 'nada.db'), dest]).stderr, /No encuentro/); assert.notEqual(restaurar([]).status, 0); });
});
