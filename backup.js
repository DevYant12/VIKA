// Copias de seguridad: una local y, si se configura, otra EXTERNA (USB, unidad de red o carpeta sincronizada con Drive/OneDrive/Dropbox).
// Cada copia se verifica antes de darse por buena. La copia externa puede cifrarse (los datos de salud no deben viajar sin proteger).
const fs = require('fs'), path = require('path'), crypto = require('crypto'), { DatabaseSync } = require('node:sqlite');
const NOMBRE = /^vika-\d{4}-\d{2}-\d{2}\.db(\.enc)?$/, MAGIA = Buffer.from('VIKA1');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const sql = s => s.replace(/'/g, "''");

function cifrar(buf, clave) {
  const sal = crypto.randomBytes(16), iv = crypto.randomBytes(12), k = crypto.scryptSync(String(clave), sal, 32);
  const c = crypto.createCipheriv('aes-256-gcm', k, iv), datos = Buffer.concat([c.update(buf), c.final()]);
  return Buffer.concat([MAGIA, sal, iv, c.getAuthTag(), datos]);
}
function descifrar(buf, clave) {
  if (buf.subarray(0, 5).compare(MAGIA) !== 0) throw new Error('El archivo no es una copia cifrada de Vika.');
  const sal = buf.subarray(5, 21), iv = buf.subarray(21, 33), tag = buf.subarray(33, 49), k = crypto.scryptSync(String(clave), sal, 32);
  const d = crypto.createDecipheriv('aes-256-gcm', k, iv); d.setAuthTag(tag);
  try { return Buffer.concat([d.update(buf.subarray(49)), d.final()]); } catch { throw new Error('La clave no es correcta o el archivo está dañado.'); }
}
function integra(archivo) {
  const c = new DatabaseSync(archivo);
  try { const r = c.prepare('PRAGMA integrity_check').get(); return Object.values(r)[0] === 'ok'; } finally { c.close(); }
}
function podar(dir, conservar) {
  const todos = fs.readdirSync(dir).filter(x => NOMBRE.test(x)).sort();
  todos.slice(0, Math.max(0, todos.length - conservar)).forEach(x => fs.rmSync(path.join(dir, x), { force: true }));
}

// Copia local. Se renueva cada vez que corre (el archivo del día siempre es el más reciente) y se conservan las últimas N.
function respaldo(db, dir, conservar = 7) {
  fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, `vika-${new Date().toISOString().slice(0, 10)}.db`), tmp = f + '.tmp';
  fs.rmSync(tmp, { force: true });
  db.exec(`VACUUM INTO '${sql(tmp)}'`);
  if (!integra(tmp)) { fs.rmSync(tmp, { force: true }); throw new Error('La copia salió dañada y se descartó.'); }
  fs.renameSync(tmp, f); podar(dir, conservar);
  return f;
}

// Copia externa: devuelve { ok, mismo_disco, cifrado, error }. Nunca lanza: un fallo aquí no debe tumbar la copia local.
function copiaExterna(archivo, extra, { clave, conservar = 30 } = {}) {
  const r = { ok: false, mismo_disco: false, cifrado: !!clave, error: null };
  try {
    // Si falta la carpeta madre, lo normal es que el USB o la unidad de red no esté conectado: no se inventa una carpeta local.
    if (!fs.existsSync(extra) && !fs.existsSync(path.dirname(path.resolve(extra))))
      throw new Error('La carpeta de la copia externa no está disponible. ¿Está conectado el USB o la unidad de red?');
    fs.mkdirSync(extra, { recursive: true });
    r.mismo_disco = fs.statSync(extra).dev === fs.statSync(path.dirname(archivo)).dev;
    const origen = fs.readFileSync(archivo), nombre = path.basename(archivo) + (clave ? '.enc' : ''), destino = path.join(extra, nombre), tmp = destino + '.tmp';
    fs.writeFileSync(tmp, clave ? cifrar(origen, clave) : origen); fs.renameSync(tmp, destino);
    const leido = fs.readFileSync(destino);
    if (sha(clave ? descifrar(leido, clave) : leido) !== sha(origen)) throw new Error('La copia externa no coincide con la original.');
    podar(extra, conservar); r.ok = true;
  } catch (e) { r.error = e.message; }
  return r;
}

// Todo junto, para el servidor y el botón "Hacer copia ahora"
function ejecutar(db, { dir, extra, clave, conservar = 7, conservarExtra = 30 }) {
  const res = { archivo: null, bytes: 0, local_ok: false, extra_config: !!extra, extra_ok: null, cifrado: !!(extra && clave), mismo_disco: false, error: null };
  try { res.archivo = respaldo(db, dir, conservar); res.bytes = fs.statSync(res.archivo).size; res.local_ok = true; }
  catch (e) { res.error = 'Copia local: ' + e.message; return res; }
  if (extra) { const x = copiaExterna(res.archivo, extra, { clave, conservar: conservarExtra }); res.extra_ok = x.ok; res.mismo_disco = x.mismo_disco; if (x.error) res.error = 'Copia externa: ' + x.error; }
  return res;
}
function registrar(db, r) {
  db.prepare('INSERT INTO respaldos(archivo,bytes,local_ok,extra_config,extra_ok,cifrado,mismo_disco,error) VALUES(?,?,?,?,?,?,?,?)')
    .run(r.archivo ? path.basename(r.archivo) : null, r.bytes ?? 0, r.local_ok ? 1 : 0, r.extra_config ? 1 : 0, r.extra_ok == null ? null : (r.extra_ok ? 1 : 0), r.cifrado ? 1 : 0, r.mismo_disco ? 1 : 0, r.error ?? null);
}
// Estado para la doctora, con avisos en lenguaje claro
function estado(db, extraConfigurada, ahora = Date.now()) {
  const ult = db.prepare('SELECT * FROM respaldos ORDER BY id DESC LIMIT 1').get() || null;
  const okLocal = db.prepare('SELECT cuando FROM respaldos WHERE local_ok=1 ORDER BY id DESC LIMIT 1').get();
  const okExtra = db.prepare('SELECT cuando,cifrado,mismo_disco FROM respaldos WHERE extra_ok=1 ORDER BY id DESC LIMIT 1').get();
  const horas = f => f ? (ahora - Date.parse(f.cuando.replace(' ', 'T') + 'Z')) / 36e5 : Infinity;
  const avisos = [];
  if (!extraConfigurada) avisos.push({ codigo: 'sin_copia_externa', mensaje: 'Las copias de seguridad están solo en este computador. Si se daña o lo roban, se pierde todo. Configure una copia externa (ver docs/PUBLICAR.md).' });
  else if (ult && ult.extra_ok === 0) avisos.push({ codigo: 'copia_externa_fallo', mensaje: 'La última copia externa falló: ' + (ult.error || 'motivo desconocido') });
  else if (horas(okExtra) > 48) avisos.push({ codigo: 'copia_externa_vieja', mensaje: 'Hace más de 2 días que no se logra una copia externa.' });
  if (horas(okLocal) > 48) avisos.push({ codigo: 'copia_vieja', mensaje: 'Hace más de 2 días que no se hace ninguna copia de seguridad.' });
  return { extra_configurada: !!extraConfigurada, ultima: ult, ultima_ok_local: okLocal ? okLocal.cuando : null, ultima_ok_externa: okExtra ? okExtra.cuando : null,
    cifrada: !!(okExtra && okExtra.cifrado), misma_unidad: !!(okExtra && okExtra.mismo_disco), avisos };
}
module.exports = { respaldo, copiaExterna, ejecutar, registrar, estado, cifrar, descifrar, integra };
