// Acceso con PIN de 6 números, roles y bloqueo por intentos fallidos. Sin librerías externas.
const crypto = require('crypto'), db = require('./db'), V = require('./validators'), { crearPaciente } = require('./pacientes');
const SESION = 8 * 36e5, MAX_INTENTOS = 5, BLOQUEO = 5 * 6e4;
const nuevoToken = () => crypto.randomBytes(32).toString('base64url');
const audit = (q, a, d) => db.prepare('INSERT INTO auditoria(quien,accion,detalle) VALUES(?,?,?)').run(q, a, JSON.stringify(d || {}));

const pinFacil = p => /^(\d)\1{5}$/.test(p) || '0123456789012345'.includes(p) || '9876543210987654'.includes(p);
const pinValido = p => /^\d{6}$/.test(p) && !pinFacil(p);
const MSG_PIN = 'El PIN debe tener 6 números y no ser fácil de adivinar (como 123456 o 111111).';
function hash(pin) { const s = crypto.randomBytes(16); return s.toString('hex') + ':' + crypto.scryptSync(pin, s, 32).toString('hex'); }
function coincide(pin, h) { const [s, k] = String(h || ':').split(':'); if (!k) return false;
  return crypto.timingSafeEqual(crypto.scryptSync(pin, Buffer.from(s, 'hex'), 32), Buffer.from(k, 'hex')); }
function ponerPin(id, pin) {
  if (!pin) do { pin = String(crypto.randomInt(0, 1e6)).padStart(6, '0'); } while (!pinValido(pin));
  db.prepare('UPDATE usuarios SET pin_hash=?, intentos=0, bloqueado_hasta=0 WHERE id=?').run(hash(pin), id); return pin;
}
function usuarioDe(req) {
  const m = /(?:^|;\s*)vika=([\w-]+)/.exec(req.headers.cookie || ''); if (!m) return null;
  return db.prepare('SELECT u.id,u.nombre,u.rol FROM sesiones s JOIN usuarios u ON u.id=s.usuario_id WHERE s.token=? AND s.expira>? AND u.activo=1').get(m[1], Date.now())
    || db.prepare("SELECT -c.id AS id, p.nombre AS nombre, 'paciente' AS rol, p.id AS paciente_id FROM sesiones_pac s JOIN cuentas c ON c.id=s.cuenta_id JOIN pacientes p ON p.id=c.paciente_id WHERE s.token=? AND s.expira>?").get(m[1], Date.now()) || null;
}

// Primera vez: crea a la doctora y muestra su PIN inicial en la terminal
function arranque() {
  if (!db.prepare('SELECT 1 FROM usuarios').get()) db.prepare("INSERT INTO usuarios(nombre,rol) VALUES('Dra. Paredes','doctora')").run();
  for (const u of db.prepare("SELECT id,nombre FROM usuarios WHERE rol='doctora' AND activo=1 AND pin_hash IS NULL").all())
    console.log(`\n>>> PIN inicial de ${u.nombre}: ${ponerPin(u.id)}  (cámbielo en "Mi PIN" después de entrar)\n`);
}

function abrirSesionPaciente(req, res, cuentaId) {
  const tok = nuevoToken(); db.prepare('INSERT INTO sesiones_pac VALUES(?,?,?)').run(tok, cuentaId, Date.now() + SESION);
  res.setHeader('Set-Cookie', `vika=${tok}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESION / 1000}${req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : ''}`);
}

async function rutas(req, res, url, p, M, leer, send) {
  if (p === 'yo') { const u = usuarioDe(req); send(res, u ? 200 : 401, u || { error: 'Sin sesión.' }); return true; }
  if (p === 'auth/usuarios' && M === 'GET') { send(res, 200, db.prepare('SELECT id,nombre FROM usuarios WHERE activo=1 ORDER BY nombre').all()); return true; }
  if (M !== 'POST') return false;
  const b = await leer(req); if (!b) { send(res, 400, { error: 'Datos ilegibles.' }); return true; }

  if (p === 'auth/entrar') {
    const u = db.prepare('SELECT * FROM usuarios WHERE id=? AND activo=1').get(b.id), pin = String(b.pin || '');
    if (!u) { send(res, 400, { error: 'Elija su nombre de la lista.' }); return true; }
    if (u.bloqueado_hasta > Date.now()) { send(res, 429, { error: `Demasiados intentos. Espere ${Math.ceil((u.bloqueado_hasta - Date.now()) / 6e4)} minuto(s) o pida a la doctora un PIN nuevo.` }); return true; }
    if (!coincide(pin, u.pin_hash)) {
      const n = u.intentos + 1;
      if (n >= MAX_INTENTOS) { db.prepare('UPDATE usuarios SET intentos=0, bloqueado_hasta=? WHERE id=?').run(Date.now() + BLOQUEO, u.id); audit(u.nombre, 'bloqueo_por_intentos'); send(res, 429, { error: 'PIN incorrecto demasiadas veces. Espere 5 minutos.' }); }
      else { db.prepare('UPDATE usuarios SET intentos=? WHERE id=?').run(n, u.id); send(res, 401, { error: `PIN incorrecto. Le quedan ${MAX_INTENTOS - n} intento(s).` }); }
      return true;
    }
    db.prepare('UPDATE usuarios SET intentos=0 WHERE id=?').run(u.id);
    const tok = nuevoToken(); db.prepare('INSERT INTO sesiones VALUES(?,?,?)').run(tok, u.id, Date.now() + SESION); audit(u.nombre, 'entrar');
    res.setHeader('Set-Cookie', `vika=${tok}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESION / 1000}${req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : ''}`);
    send(res, 200, { nombre: u.nombre, rol: u.rol }); return true;
  }
  if (p === 'auth/paciente/registro') {
    if (!b.tipo_doc || b.tipo_doc === 'sin_documento') { send(res, 422, { errores: { tipo_doc: 'Para crear su cuenta necesita cédula o pasaporte. Si no tiene, pida a recepción que le agende la cita.' } }); return true; }
    const pin = String(b.pin || ''); if (!pinValido(pin)) { send(res, 422, { errores: { pin: MSG_PIN } }); return true; }
    const r = crearPaciente({ ...b, forzar: true });
    if (r.status === 409 && r.body.existente) { send(res, 409, { error: 'Ese documento ya está registrado. Si es suyo, pida en recepción que le activen el acceso.' }); return true; }
    if (r.status !== 201) { send(res, r.status, r.body); return true; }
    const c = Number(db.prepare('INSERT INTO cuentas(paciente_id,pin_hash) VALUES(?,?)').run(r.body.id, hash(pin)).lastInsertRowid);
    audit(r.body.nombre, 'registro_paciente', { paciente: r.body.id }); abrirSesionPaciente(req, res, c); send(res, 200, { nombre: r.body.nombre, rol: 'paciente' }); return true;
  }
  if (p === 'auth/paciente/entrar') {
    const doc = V.limpiar(b.documento).replace(/[\s-]/g, '').toUpperCase(), pin = String(b.pin || ''), mal = { error: 'Documento o PIN incorrectos.' };
    const c = db.prepare('SELECT c.*, p.nombre FROM cuentas c JOIN pacientes p ON p.id=c.paciente_id WHERE p.documento=?').get(doc);
    if (!c) { send(res, 401, mal); return true; }
    if (c.bloqueado_hasta > Date.now()) { send(res, 429, { error: 'Demasiados intentos. Espere unos minutos e intente de nuevo.' }); return true; }
    if (!coincide(pin, c.pin_hash)) {
      const n = c.intentos + 1;
      if (n >= MAX_INTENTOS) { db.prepare('UPDATE cuentas SET intentos=0, bloqueado_hasta=? WHERE id=?').run(Date.now() + BLOQUEO, c.id); send(res, 429, { error: 'Demasiados intentos. Espere 5 minutos.' }); }
      else { db.prepare('UPDATE cuentas SET intentos=? WHERE id=?').run(n, c.id); send(res, 401, mal); }
      return true;
    }
    db.prepare('UPDATE cuentas SET intentos=0 WHERE id=?').run(c.id); audit(c.nombre, 'entrar_paciente');
    abrirSesionPaciente(req, res, c.id); send(res, 200, { nombre: c.nombre, rol: 'paciente' }); return true;
  }
  if (p === 'auth/salir') {
    const m = /vika=([\w-]+)/.exec(req.headers.cookie || ''); if (m) { db.prepare('DELETE FROM sesiones WHERE token=?').run(m[1]); db.prepare('DELETE FROM sesiones_pac WHERE token=?').run(m[1]); }
    res.setHeader('Set-Cookie', 'vika=; Max-Age=0; Path=/'); send(res, 200, { ok: true }); return true;
  }
  if (p === 'auth/pin') {
    const u = usuarioDe(req); if (!u) { send(res, 401, { error: 'Inicie sesión.' }); return true; }
    if (u.rol === 'paciente') { send(res, 400, { error: 'El PIN de paciente lo cambia recepción por ahora.' }); return true; }
    const fila = db.prepare('SELECT pin_hash FROM usuarios WHERE id=?').get(u.id);
    if (!coincide(String(b.actual || ''), fila.pin_hash)) { send(res, 400, { error: 'El PIN actual no es correcto.' }); return true; }
    if (!pinValido(String(b.nuevo || ''))) { send(res, 422, { error: MSG_PIN }); return true; }
    ponerPin(u.id, String(b.nuevo)); audit(u.nombre, 'cambiar_pin'); send(res, 200, { ok: true }); return true;
  }
  return false;
}

// Solo doctora: gestionar equipo y ver historial
async function admin(req, res, url, p, M, leer, send, u) {
  if (p === 'usuarios' && M === 'GET') { send(res, 200, db.prepare('SELECT id,nombre,rol,activo FROM usuarios ORDER BY id').all()); return true; }
  if (p === 'auditoria') { send(res, 200, db.prepare('SELECT cuando,quien,accion FROM auditoria ORDER BY id DESC LIMIT 40').all()); return true; }
  if (M !== 'POST') return false;
  if (p === 'usuarios') {
    const b = (await leer(req)) || {}, nombre = V.limpiar(b.nombre);
    if (nombre.length < 2 || nombre.length > 60 || !['doctora', 'recepcion'].includes(b.rol)) { send(res, 422, { error: 'Escriba el nombre y elija el rol.' }); return true; }
    const id = Number(db.prepare('INSERT INTO usuarios(nombre,rol) VALUES(?,?)').run(nombre, b.rol).lastInsertRowid);
    audit(u.nombre, 'crear_usuario', { id, nombre, rol: b.rol }); send(res, 201, { id, pin: ponerPin(id) }); return true;
  }
  const m = p.match(/^usuarios\/(\d+)\/(pin|desactivar)$/); if (!m) return false;
  if (m[2] === 'pin') { audit(u.nombre, 'reiniciar_pin', { id: +m[1] }); send(res, 200, { pin: ponerPin(+m[1]) }); return true; }
  if (+m[1] === u.id) { send(res, 400, { error: 'No puede quitarse el acceso a sí misma.' }); return true; }
  db.prepare('UPDATE usuarios SET activo=0 WHERE id=?').run(m[1]); db.prepare('DELETE FROM sesiones WHERE usuario_id=?').run(m[1]);
  audit(u.nombre, 'desactivar_usuario', { id: +m[1] }); send(res, 200, { ok: true }); return true;
}
module.exports = { arranque, rutas, admin, usuarioDe, pinValido, hash, coincide };
