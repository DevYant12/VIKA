// Acceso con PIN de 6 números, roles y bloqueo por intentos fallidos. Sin librerías externas.
const crypto = require('crypto'), db = require('./db'), V = require('./validators');
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
  return db.prepare('SELECT u.id,u.nombre,u.rol FROM sesiones s JOIN usuarios u ON u.id=s.usuario_id WHERE s.token=? AND s.expira>? AND u.activo=1').get(m[1], Date.now()) || null;
}

// Primera vez: crea a la doctora y muestra su PIN inicial en la terminal
function arranque() {
  if (!db.prepare('SELECT 1 FROM usuarios').get()) db.prepare("INSERT INTO usuarios(nombre,rol) VALUES('Dra. Paredes','doctora')").run();
  for (const u of db.prepare("SELECT id,nombre FROM usuarios WHERE rol='doctora' AND activo=1 AND pin_hash IS NULL").all())
    console.log(`\n>>> PIN inicial de ${u.nombre}: ${ponerPin(u.id)}  (cámbielo en "Mi PIN" después de entrar)\n`);
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
  if (p === 'auth/salir') {
    const m = /vika=([\w-]+)/.exec(req.headers.cookie || ''); if (m) db.prepare('DELETE FROM sesiones WHERE token=?').run(m[1]);
    res.setHeader('Set-Cookie', 'vika=; Max-Age=0; Path=/'); send(res, 200, { ok: true }); return true;
  }
  if (p === 'auth/pin') {
    const u = usuarioDe(req); if (!u) { send(res, 401, { error: 'Inicie sesión.' }); return true; }
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
module.exports = { arranque, rutas, admin, usuarioDe };
