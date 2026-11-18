// Servidor Vika: sirve la interfaz y la API. Sin dependencias externas.
const http = require('http'), fs = require('fs'), path = require('path');
const db = require('./db'), V = require('./validators'), A = require('./auth');
A.arranque();
const PORT = process.env.PORT || 3000, PUB = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript' };

const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); };
const leer = req => new Promise(ok => { let d = ''; req.on('data', c => { d += c; if (d.length > 1e5) req.destroy(); });
  req.on('end', () => { try { ok(JSON.parse(d || '{}')); } catch { ok(null); } }); });
const audit = (q, a, d) => db.prepare('INSERT INTO auditoria(quien,accion,detalle) VALUES(?,?,?)').run(q || 'sin nombre', a, JSON.stringify(d));
const ahora = () => new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16);

function horas(clinica) {
  const [h1, m1] = clinica.abre.split(':').map(Number), [h2, m2] = clinica.cierra.split(':').map(Number);
  const out = []; for (let t = h1 * 60 + m1; t < h2 * 60 + m2; t += 30)
    out.push(String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'));
  return out;
}

async function api(req, res, url) {
  const p = url.pathname.replace('/api/', ''), q = url.searchParams, M = req.method;
  if ((p === 'yo' || p.startsWith('auth/')) && await A.rutas(req, res, url, p, M, leer, send)) return;
  const u = A.usuarioDe(req);
  if (!u) return send(res, 401, { error: 'Inicie sesión con su llave USB.' });
  if (p.startsWith('usuarios') || p === 'auditoria') {
    if (u.rol !== 'doctora') return send(res, 403, { error: 'Solo la doctora puede ver esto.' });
    if (await A.admin(req, res, url, p, M, leer, send, u)) return;
  }
  if (p === 'catalogos') return send(res, 200, { clinicas: db.prepare('SELECT * FROM clinicas').all(), medicos: db.prepare('SELECT * FROM medicos').all() });

  if (p === 'pacientes' && M === 'GET') {
    const t = '%' + V.normalizar(q.get('q')) + '%', d = '%' + V.limpiar(q.get('q')) + '%';
    return send(res, 200, db.prepare('SELECT id,nombre,tipo_doc,documento,telefono,nacimiento FROM pacientes WHERE nombre_norm LIKE ? OR documento LIKE ? ORDER BY nombre LIMIT 20').all(t, d));
  }
  if (p === 'pacientes' && M === 'POST') {
    const b = await leer(req); if (!b) return send(res, 400, { error: 'Datos ilegibles.' });
    const e = {}, nombre = V.limpiar(b.nombre), tipo = b.tipo_doc || 'sin_documento';
    const doc = V.limpiar(b.documento).replace(/[\s-]/g, ''), tel = V.limpiar(b.telefono).replace(/[\s-]/g, ''), mail = V.limpiar(b.email).toLowerCase();
    if (!/^[\p{L}\p{M}' .-]{2,100}$/u.test(nombre)) e.nombre = 'Escriba el nombre completo, solo con letras (ej.: María López).';
    if (!['cedula', 'pasaporte', 'sin_documento'].includes(tipo)) e.tipo_doc = 'Elija un tipo de documento.';
    if (tipo === 'cedula' && !V.cedulaValida(doc)) e.documento = 'La cédula no es válida. Debe tener 10 números; revise que no falte ni sobre ninguno.';
    if (tipo === 'pasaporte' && !/^[A-Za-z0-9]{5,20}$/.test(doc)) e.documento = 'El pasaporte debe tener entre 5 y 20 letras o números.';
    if (tel && !V.telefonoValido(tel)) e.telefono = 'El teléfono debe tener 10 números y empezar con 09 (celular) o 02 a 07 (fijo con código).';
    if (mail && !V.emailValido(mail)) e.email = 'El correo no parece correcto. Ejemplo: nombre@gmail.com';
    if (b.nacimiento && !V.nacimientoValido(b.nacimiento)) e.nacimiento = 'La fecha de nacimiento no es posible. Revise el año.';
    if (Object.keys(e).length) return send(res, 422, { errores: e });
    const norm = V.normalizar(nombre), docv = tipo === 'sin_documento' ? null : (tipo === 'pasaporte' ? doc.toUpperCase() : doc);
    if (docv) { const x = db.prepare('SELECT id,nombre FROM pacientes WHERE tipo_doc=? AND documento=?').get(tipo, docv);
      if (x) return send(res, 409, { error: `Este documento ya está registrado a nombre de ${x.nombre}.`, existente: x }); }
    if (!b.forzar) { const x = db.prepare('SELECT id,nombre,nacimiento FROM pacientes WHERE nombre_norm=?').all(norm);
      if (x.length) return send(res, 409, { posible_duplicado: true, error: 'Ya hay pacientes con este nombre. Confirme si es una persona distinta.', existentes: x }); }
    const r = db.prepare('INSERT INTO pacientes(nombre,nombre_norm,tipo_doc,documento,telefono,email,nacimiento) VALUES(?,?,?,?,?,?,?)')
      .run(nombre, norm, tipo, docv, tel || null, mail || null, b.nacimiento || null);
    audit(u.nombre, 'crear_paciente', { id: Number(r.lastInsertRowid), nombre });
    return send(res, 201, { id: Number(r.lastInsertRowid), nombre });
  }

  if (p === 'disponibilidad') {
    const c = db.prepare('SELECT * FROM clinicas WHERE id=?').get(q.get('clinica')), f = q.get('fecha') || '';
    if (!c || !/^\d{4}-\d{2}-\d{2}$/.test(f)) return send(res, 400, { error: 'Elija clínica y fecha.' });
    const ocupadas = db.prepare("SELECT substr(inicio,12,5) h FROM citas WHERE medico_id=? AND estado='agendada' AND substr(inicio,1,10)=?").all(q.get('medico'), f).map(x => x.h);
    return send(res, 200, horas(c).map(h => ({ hora: h, libre: !ocupadas.includes(h) && (f + 'T' + h) > ahora() })));
  }

  if (p === 'citas' && M === 'GET') {
    return send(res, 200, db.prepare(`SELECT ci.id, ci.inicio, ci.estado, pa.nombre paciente, me.nombre medico, cl.nombre clinica
      FROM citas ci JOIN pacientes pa ON pa.id=ci.paciente_id JOIN medicos me ON me.id=ci.medico_id JOIN clinicas cl ON cl.id=ci.clinica_id
      WHERE substr(ci.inicio,1,10)=? ORDER BY ci.inicio`).all(q.get('fecha') || ahora().slice(0, 10)));
  }
  if (p === 'citas' && M === 'POST') {
    const b = await leer(req); if (!b) return send(res, 400, { error: 'Datos ilegibles.' });
    const c = db.prepare('SELECT * FROM clinicas WHERE id=?').get(b.clinica_id);
    if (!c || !db.prepare('SELECT 1 FROM medicos WHERE id=?').get(b.medico_id) || !db.prepare('SELECT 1 FROM pacientes WHERE id=?').get(b.paciente_id))
      return send(res, 400, { error: 'Falta elegir clínica, médico o paciente.' });
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(b.inicio || '')) return send(res, 400, { error: 'Fecha u hora no válida.' });
    if (b.inicio <= ahora()) return send(res, 400, { error: 'Esa fecha y hora ya pasaron. Elija una hora futura.' });
    if (!horas(c).includes(b.inicio.slice(11))) return send(res, 400, { error: `${c.nombre} atiende de ${c.abre} a ${c.cierra}, cada 30 minutos.` });
    try {
      const r = db.prepare('INSERT INTO citas(paciente_id,medico_id,clinica_id,inicio,creado_por) VALUES(?,?,?,?,?)')
        .run(b.paciente_id, b.medico_id, b.clinica_id, b.inicio, u.nombre);
      audit(u.nombre, 'crear_cita', { id: Number(r.lastInsertRowid), ...b });
      return send(res, 201, { id: Number(r.lastInsertRowid) });
    } catch (err) {
      if (String(err.message).includes('UNIQUE')) return send(res, 409, { error: 'Esa hora acaba de ser ocupada por otra persona. Elija otra hora.' });
      throw err;
    }
  }
  const m = p.match(/^citas\/(\d+)\/cancelar$/);
  if (m && M === 'POST') {
    const b = (await leer(req)) || {}, r = db.prepare("UPDATE citas SET estado='cancelada' WHERE id=? AND estado='agendada'").run(m[1]);
    if (r.changes) { audit(u.nombre, 'cancelar_cita', { id: +m[1] }); return send(res, 200, { ok: true }); }
    return db.prepare('SELECT 1 FROM citas WHERE id=?').get(m[1]) ? send(res, 200, { ok: true, aviso: 'Esta cita ya estaba cancelada.' }) : send(res, 404, { error: 'No existe esa cita.' });
  }
  send(res, 404, { error: 'No encontrado.' });
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    const f = path.join(PUB, url.pathname === '/' ? 'index.html' : path.normalize(url.pathname));
    if (!f.startsWith(PUB) || !fs.existsSync(f)) { res.writeHead(404); return res.end('No encontrado'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'text/plain' }); fs.createReadStream(f).pipe(res);
  } catch (e) { console.error(e); send(res, 500, { error: 'Algo salió mal en el sistema. Intente de nuevo; si sigue igual, avise a soporte.' }); }
}).listen(PORT, () => console.log(`Vika lista en http://localhost:${PORT}`));
