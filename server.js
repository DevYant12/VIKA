// Servidor Vika: sirve la interfaz y la API. Sin dependencias externas.
const http = require('http'), https = require('https'), fs = require('fs'), path = require('path');
const db = require('./db'), V = require('./validators'), A = require('./auth'), backup = require('./backup'), Ant = require('./anticipos'), { crearPaciente } = require('./pacientes'), H = require('./horarios'), Off = require('./offline'), Aj = require('./ajustes');
A.arranque();
const PORT = process.env.PORT || 3000, PUB = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript' };
const respaldoCfg = { dir: process.env.VIKA_BACKUPS || 'backups', extra: process.env.VIKA_BACKUP_EXTRA || '', clave: process.env.VIKA_BACKUP_CLAVE || '' };
const hacerRespaldo = () => { let r; try { r = backup.ejecutar(db, respaldoCfg); } catch (e) { r = { local_ok: false, extra_config: !!respaldoCfg.extra, extra_ok: null, error: e.message, bytes: 0 }; }
  try { backup.registrar(db, r); } catch {} if (r.error) console.error('Respaldo:', r.error); return r; };

const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); };
const leer = req => new Promise(ok => { let d = ''; req.on('data', c => { d += c; if (d.length > 1e5) req.destroy(); });
  req.on('end', () => { try { ok(JSON.parse(d || '{}')); } catch { ok(null); } }); });
const leerGrande = req => new Promise(ok => { let d = '', largo = false; req.on('data', c => { if (largo) return; d += c; if (d.length > 2e6) { largo = true; d = ''; } });
  req.on('end', () => { if (largo) return ok(null); try { ok(JSON.parse(d || '{}')); } catch { ok(null); } }); });
const audit = (q, a, d) => db.prepare('INSERT INTO auditoria(quien,accion,detalle) VALUES(?,?,?)').run(q || 'sin nombre', a, JSON.stringify(d));
const ahora = () => V.ahoraLocal();       // hora de las clínicas (VIKA_TZ), no la del computador

async function api(req, res, url) {
  const p = url.pathname.replace('/api/', ''), q = url.searchParams, M = req.method;
  if ((p === 'yo' || p.startsWith('auth/')) && await A.rutas(req, res, url, p, M, leer, send)) return;
  const u = A.usuarioDe(req);
  if (!u) return send(res, 401, { error: 'Inicie sesión.' });
  Ant.liberarVencidas(db);
  if (u.rol === 'paciente' && !/^(GET (catalogos|disponibilidad|terminos|mis-citas)|POST (citas|citas\/\d+\/(cancelar|pagar)))$/.test(M + ' ' + p))
    return send(res, 403, { error: 'Esta opción es solo para el personal de la clínica.' });
  if (p.startsWith('usuarios') || p === 'auditoria') {
    if (u.rol !== 'doctora') return send(res, 403, { error: 'Solo la doctora puede ver esto.' });
    if (await A.admin(req, res, url, p, M, leer, send, u)) return;
  }
  if (Aj.SOLO_DOCTORA.test(p)) {
    if (u.rol !== 'doctora') return send(res, 403, { error: 'Solo la doctora puede hacer esto.' });
    if (await Aj.rutas(req, res, p, M, { leer, leerGrande, send, u, ahora, audit, respaldoCfg, hacerRespaldo })) return;
  }
  if (p === 'catalogos') return send(res, 200, { clinicas: db.prepare('SELECT * FROM clinicas').all(), medicos: db.prepare('SELECT * FROM medicos WHERE activo=1').all() });

  if (p === 'pacientes' && M === 'GET') {
    const t = '%' + V.normalizar(q.get('q')) + '%', d = '%' + V.limpiar(q.get('q')) + '%';
    return send(res, 200, db.prepare('SELECT id,nombre,tipo_doc,documento,telefono,nacimiento,EXISTS(SELECT 1 FROM cuentas c WHERE c.paciente_id=pacientes.id) tiene_cuenta FROM pacientes WHERE nombre_norm LIKE ? OR documento LIKE ? ORDER BY nombre LIMIT 20').all(t, d));
  }
  if (p === 'pacientes' && M === 'POST') {
    const b = await leer(req); if (!b) return send(res, 400, { error: 'Datos ilegibles.' });
    const r = crearPaciente(b); if (r.status === 201) audit(u.nombre, 'crear_paciente', { id: r.body.id, nombre: r.body.nombre });
    return send(res, r.status, r.body);
  }
  const hp = p.match(/^pacientes\/(\d+)\/citas$/);          // historial de un paciente (solo personal)
  if (hp && M === 'GET') {
    const pa = db.prepare('SELECT id,nombre FROM pacientes WHERE id=?').get(hp[1]);
    if (!pa) return send(res, 404, { error: 'No existe ese paciente.' });
    return send(res, 200, { paciente: pa, citas: db.prepare(`SELECT ci.id,ci.inicio,ci.estado,ci.anticipo,me.nombre medico,cl.nombre clinica FROM citas ci
      JOIN medicos me ON me.id=ci.medico_id JOIN clinicas cl ON cl.id=ci.clinica_id WHERE ci.paciente_id=? ORDER BY ci.inicio DESC LIMIT 200`).all(pa.id) });
  }
  const ac = p.match(/^pacientes\/(\d+)\/acceso$/);
  if (ac && M === 'POST') {
    const pa = db.prepare('SELECT id,nombre,tipo_doc,documento FROM pacientes WHERE id=?').get(ac[1]);
    if (!pa) return send(res, 404, { error: 'No existe ese paciente.' });
    if (pa.tipo_doc === 'sin_documento' || !pa.documento) return send(res, 422, { error: 'Este paciente no tiene cédula ni pasaporte registrados. Complete el documento primero; sin él no se puede crear su acceso.' });
    const r = A.darAccesoPaciente(pa.id); audit(u.nombre, r.nuevo ? 'activar_cuenta_paciente' : 'reiniciar_pin_paciente', { paciente: pa.id });
    return send(res, 200, { pin: r.pin, nuevo: r.nuevo, nombre: pa.nombre });
  }
  if (p === 'agenda-offline' && M === 'GET') {          // todo lo necesario para poder agendar sin internet: horarios y horas ocupadas de los próximos días
    const dias = Math.min(14, Math.max(1, Number(q.get('dias')) || 7)), desde = ahora().slice(0, 10), fechas = [];
    for (let i = 0; i < dias; i++) { const d = new Date(desde + 'T12:00:00'); d.setDate(d.getDate() + i); fechas.push(d.toISOString().slice(0, 10)); }
    const clin = db.prepare('SELECT * FROM clinicas').all(), med = db.prepare('SELECT id FROM medicos WHERE activo=1').all(), horarios = {}, ocupadas = {};
    for (const c of clin) for (const m of med) for (const f of fechas) { const hs = H.horas(c, m.id, f); if (hs.length) horarios[`${c.id}|${m.id}|${f}`] = hs; }
    for (const x of db.prepare("SELECT medico_id m, substr(inicio,1,10) f, substr(inicio,12,5) h FROM citas WHERE estado='agendada' AND substr(inicio,1,10) BETWEEN ? AND ?").all(fechas[0], fechas[fechas.length - 1])) (ocupadas[`${x.m}|${x.f}`] ||= []).push(x.h);
    return send(res, 200, { generado: ahora(), desde: fechas[0], hasta: fechas[fechas.length - 1], horarios, ocupadas });
  }
  if (p === 'citas/sincronizar' && M === 'POST') {
    const b = await leer(req); if (!b) return send(res, 400, { error: 'Datos ilegibles.' });
    const r = Off.sincronizar(b, u, { ahora, audit }); return send(res, r.status, r.body);
  }
  if (p === 'disponibilidad') {
    const c = db.prepare('SELECT * FROM clinicas WHERE id=?').get(q.get('clinica')), f = q.get('fecha') || '';
    if (!c || !/^\d{4}-\d{2}-\d{2}$/.test(f)) return send(res, 400, { error: 'Elija clínica y fecha.' });
    const mid = Number(q.get('medico')) || 0, ocupadas = db.prepare("SELECT substr(inicio,12,5) h FROM citas WHERE medico_id=? AND estado='agendada' AND substr(inicio,1,10)=?").all(mid, f).map(x => x.h);
    return send(res, 200, H.horas(c, mid, f).map(h => ({ hora: h, libre: !ocupadas.includes(h) && (f + 'T' + h) > ahora() })));
  }

  if (p === 'citas' && M === 'GET') {
    return send(res, 200, db.prepare(`SELECT ci.id, ci.inicio, ci.estado, ci.anticipo, ci.origen, pa.nombre paciente, me.nombre medico, cl.nombre clinica
      FROM citas ci JOIN pacientes pa ON pa.id=ci.paciente_id JOIN medicos me ON me.id=ci.medico_id JOIN clinicas cl ON cl.id=ci.clinica_id
      WHERE substr(ci.inicio,1,10)=? ORDER BY ci.inicio`).all(q.get('fecha') || ahora().slice(0, 10)));
  }
  if (p === 'citas' && M === 'POST') {
    const b = await leer(req); if (!b) return send(res, 400, { error: 'Datos ilegibles.' });
    const esPac = u.rol === 'paciente';
    if (esPac) { if (b.acepta_terminos !== true) return send(res, 400, { error: 'Debe aceptar los términos y condiciones para agendar.' }); b.paciente_id = u.paciente_id; }
    for (const k of ['paciente_id', 'medico_id', 'clinica_id']) b[k] = Number.isInteger(Number(b[k])) && b[k] !== null && b[k] !== '' ? Number(b[k]) : 0;
    const c = db.prepare('SELECT * FROM clinicas WHERE id=?').get(b.clinica_id);
    if (!c || !db.prepare('SELECT 1 FROM medicos WHERE id=? AND activo=1').get(b.medico_id) || !db.prepare('SELECT 1 FROM pacientes WHERE id=?').get(b.paciente_id))
      return send(res, 400, { error: 'Falta elegir clínica, médico o paciente.' });
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(b.inicio || '')) return send(res, 400, { error: 'Fecha u hora no válida.' });
    if (b.inicio <= ahora()) return send(res, 400, { error: 'Esa fecha y hora ya pasaron. Elija una hora futura.' });
    if (!H.horas(c, b.medico_id, b.inicio.slice(0, 10)).includes(b.inicio.slice(11))) return send(res, 400, { error: H.explicar(c, db.prepare('SELECT * FROM medicos WHERE id=?').get(b.medico_id), b.inicio.slice(0, 10)) });
    try {
      const r = db.prepare('INSERT INTO citas(paciente_id,medico_id,clinica_id,inicio,creado_por,anticipo,anticipo_monto,terminos_version,terminos_en) VALUES(?,?,?,?,?,?,?,?,?)')
        .run(b.paciente_id, b.medico_id, b.clinica_id, b.inicio, u.nombre, esPac ? 'pendiente' : 'no_aplica', esPac ? Ant.ANTICIPO : 0, esPac ? Ant.terminos().version : null, esPac ? new Date().toISOString() : null);
      audit(u.nombre, 'crear_cita', { id: Number(r.lastInsertRowid), ...b });
      return send(res, 201, { id: Number(r.lastInsertRowid), anticipo: esPac ? 'pendiente' : 'no_aplica', monto: esPac ? Ant.ANTICIPO : 0, minutos_para_pagar: Ant.MINUTOS_PAGO });
    } catch (err) {
      if (!String(err.message).includes('UNIQUE')) throw err;
      const ya = db.prepare("SELECT id,paciente_id,clinica_id,anticipo,anticipo_monto FROM citas WHERE medico_id=? AND inicio=? AND estado='agendada'").get(b.medico_id, b.inicio);
      // Doble clic o reintento: la cita ya es de este mismo paciente y clínica, así que se devuelve la misma en vez de un falso "ocupada"
      if (ya && ya.paciente_id === b.paciente_id && ya.clinica_id === b.clinica_id)
        return send(res, 200, { id: ya.id, anticipo: ya.anticipo, monto: ya.anticipo_monto, minutos_para_pagar: Ant.MINUTOS_PAGO, repetida: true });
      audit(u.nombre, 'conflicto_cita', { medico_id: b.medico_id, clinica_id: b.clinica_id, inicio: b.inicio, paciente_id: b.paciente_id, cita_existente: ya ? ya.id : null });
      if (ya && ya.anticipo === 'pendiente')
        return send(res, 409, { error: `Esa hora está apartada por un paciente que aún no paga el anticipo. Si no paga en ${Ant.MINUTOS_PAGO} minutos se libera sola. Elija otra hora o intente más tarde.` });
      return send(res, 409, { error: 'Esa hora acaba de ser ocupada por otra persona. Elija otra hora.' });
    }
  }
  const m = p.match(/^citas\/(\d+)\/cancelar$/);
  if (m && M === 'POST') {
    const c = db.prepare('SELECT * FROM citas WHERE id=?').get(m[1]);
    if (!c || (u.rol === 'paciente' && c.paciente_id !== u.paciente_id)) return send(res, 404, { error: 'No existe esa cita.' });
    if (c.estado === 'cancelada') return send(res, 200, { ok: true, aviso: 'Esta cita ya estaba cancelada.', anticipo: c.anticipo });
    const nuevo = c.anticipo === 'pagado' ? Ant.destinoAnticipo(c.inicio, ahora()) : c.anticipo === 'pendiente' ? 'vencido' : c.anticipo;
    db.prepare("UPDATE citas SET estado='cancelada', anticipo=? WHERE id=?").run(nuevo, c.id);
    audit(u.nombre, 'cancelar_cita', { id: c.id, anticipo: nuevo }); return send(res, 200, { ok: true, anticipo: nuevo });
  }
  if (p === 'terminos' && M === 'GET') return send(res, 200, Ant.terminos());
  if (p === 'mis-citas' && M === 'GET') return send(res, 200, db.prepare(`SELECT ci.id,ci.inicio,ci.estado,ci.anticipo,ci.anticipo_monto,me.nombre medico,cl.nombre clinica
    FROM citas ci JOIN medicos me ON me.id=ci.medico_id JOIN clinicas cl ON cl.id=ci.clinica_id WHERE ci.paciente_id=? ORDER BY ci.inicio DESC LIMIT 50`).all(u.paciente_id || 0));
  const pg = p.match(/^citas\/(\d+)\/pagar$/);
  if (pg && M === 'POST') {
    const c = db.prepare('SELECT * FROM citas WHERE id=?').get(pg[1]);
    if (!c || c.paciente_id !== u.paciente_id) return send(res, 404, { error: 'No existe esa cita.' });
    if (c.anticipo === 'pagado') return send(res, 200, { ok: true, aviso: 'El anticipo ya estaba pagado.' });
    if (c.anticipo !== 'pendiente' || c.estado !== 'agendada') return send(res, 400, { error: 'Esta reserva ya venció. Elija la hora de nuevo.' });
    // Pago SIMULADO. Con un proveedor real (PayPhone, Stripe...) aquí se confirma con el aviso del proveedor, nunca con lo que diga el navegador.
    db.prepare("UPDATE citas SET anticipo='pagado', pago_ref=? WHERE id=?").run('SIM-' + Date.now().toString(36), c.id);
    audit(u.nombre, 'pago_anticipo', { id: c.id, monto: c.anticipo_monto }); return send(res, 200, { ok: true });
  }
  const dv = p.match(/^citas\/(\d+)\/devolver-anticipo$/);
  if (dv && M === 'POST') {
    if (u.rol !== 'doctora') return send(res, 403, { error: 'Solo la doctora puede devolver un anticipo.' });
    if (!db.prepare("UPDATE citas SET anticipo='reembolsado' WHERE id=? AND anticipo IN ('pagado','retenido')").run(dv[1]).changes) return send(res, 400, { error: 'Esa cita no tiene un anticipo que devolver.' });
    audit(u.nombre, 'devolver_anticipo', { id: +dv[1] }); return send(res, 200, { ok: true });
  }
  const rx = p.match(/^citas\/(\d+)\/reactivar$/);
  if (rx && M === 'POST') {
    const c = db.prepare('SELECT estado,inicio,anticipo FROM citas WHERE id=?').get(rx[1]);
    if (!c) return send(res, 404, { error: 'No existe esa cita.' });
    if (c.estado === 'agendada') return send(res, 200, { ok: true, aviso: 'Esta cita ya estaba activa.' });
    if (['reembolsado', 'vencido'].includes(c.anticipo)) return send(res, 409, { error: 'No se puede reactivar: el anticipo ya se devolvió o venció. El paciente debe agendar de nuevo.' });
    if (c.inicio <= ahora()) return send(res, 400, { error: 'Esa cita ya pasó y no se puede reactivar.' });
    try { db.prepare("UPDATE citas SET estado='agendada', anticipo=CASE WHEN anticipo='retenido' THEN 'pagado' ELSE anticipo END WHERE id=?").run(rx[1]); audit(u.nombre, 'reactivar_cita', { id: +rx[1] }); return send(res, 200, { ok: true }); }
    catch (err) { if (String(err.message).includes('UNIQUE')) return send(res, 409, { error: 'No se puede deshacer: esa hora ya fue tomada por otra cita.' }); throw err; }
  }
  send(res, 404, { error: 'No encontrado.' });
}

// Cabeceras de seguridad en todo: la API trae datos de salud, así que nunca se guarda en caché del navegador.
function cabeceras(req, res, esApi) {
  res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('X-Frame-Options', 'DENY'); res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  if (A.esHttps(req)) res.setHeader('Strict-Transport-Security', 'max-age=15552000');
  res.setHeader('Cache-Control', esApi ? 'no-store' : 'no-cache');
}
const manejar = async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    cabeceras(req, res, url.pathname.startsWith('/api/'));
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    const f = path.join(PUB, url.pathname === '/' ? 'index.html' : path.normalize(url.pathname));
    if (!f.startsWith(PUB) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404); return res.end('No encontrado'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'text/plain' }); fs.createReadStream(f).pipe(res);
  } catch (e) { console.error(e); if (!res.headersSent) send(res, 500, { error: 'Algo salió mal en el sistema. Intente de nuevo; si sigue igual, avise a soporte.' }); else res.end(); }
};

// HTTPS: con VIKA_CERT y VIKA_KEY el propio servidor lo atiende; si no, se usa detrás de un proxy HTTPS (ver docs/PUBLICAR.md).
// Sin HTTPS el servidor solo escucha en este computador: los PIN no deben viajar sin cifrar por la red.
const tls = process.env.VIKA_CERT && process.env.VIKA_KEY ? { cert: fs.readFileSync(process.env.VIKA_CERT), key: fs.readFileSync(process.env.VIKA_KEY) } : null;
const HOST = process.env.VIKA_HOST || (tls ? '0.0.0.0' : '127.0.0.1');
(tls ? https.createServer(tls, manejar) : http.createServer(manejar)).listen(PORT, HOST, () => {
  hacerRespaldo(); setInterval(hacerRespaldo, 216e5).unref();        // al arrancar y cada 6 horas; el archivo del día siempre es el más reciente
  console.log(`Vika lista en ${tls ? 'https' : 'http'}://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  if (!tls && HOST !== '127.0.0.1' && HOST !== 'localhost') console.log('AVISO: está escuchando en la red sin HTTPS. Use un proxy HTTPS o VIKA_CERT/VIKA_KEY (docs/PUBLICAR.md).');
  if (!respaldoCfg.extra) console.log('AVISO: no hay copia de seguridad externa (VIKA_BACKUP_EXTRA). Las copias están solo en este computador.');
});
if (tls && process.env.VIKA_PUERTO_HTTP)       // redirige http → https
  http.createServer((req, res) => { res.writeHead(301, { Location: 'https://' + (req.headers.host || 'localhost').replace(/:\d+$/, '') + (PORT === '443' ? '' : ':' + PORT) + req.url }); res.end(); }).listen(process.env.VIKA_PUERTO_HTTP, HOST);
