// Servidor Vika: sirve la interfaz y la API. Sin dependencias externas.
const http = require('http'), fs = require('fs'), path = require('path');
const db = require('./db'), V = require('./validators'), A = require('./auth'), backup = require('./backup'), Ant = require('./anticipos'), { crearPaciente } = require('./pacientes');
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
  if (!u) return send(res, 401, { error: 'Inicie sesión.' });
  Ant.liberarVencidas(db);
  if (u.rol === 'paciente' && !/^(GET (catalogos|disponibilidad|terminos|mis-citas)|POST (citas|citas\/\d+\/(cancelar|pagar)))$/.test(M + ' ' + p))
    return send(res, 403, { error: 'Esta opción es solo para el personal de la clínica.' });
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
    const r = crearPaciente(b); if (r.status === 201) audit(u.nombre, 'crear_paciente', { id: r.body.id, nombre: r.body.nombre });
    return send(res, r.status, r.body);
  }
  if (p === 'disponibilidad') {
    const c = db.prepare('SELECT * FROM clinicas WHERE id=?').get(q.get('clinica')), f = q.get('fecha') || '';
    if (!c || !/^\d{4}-\d{2}-\d{2}$/.test(f)) return send(res, 400, { error: 'Elija clínica y fecha.' });
    const ocupadas = db.prepare("SELECT substr(inicio,12,5) h FROM citas WHERE medico_id=? AND estado='agendada' AND substr(inicio,1,10)=?").all(q.get('medico'), f).map(x => x.h);
    return send(res, 200, horas(c).map(h => ({ hora: h, libre: !ocupadas.includes(h) && (f + 'T' + h) > ahora() })));
  }

  if (p === 'citas' && M === 'GET') {
    return send(res, 200, db.prepare(`SELECT ci.id, ci.inicio, ci.estado, ci.anticipo, pa.nombre paciente, me.nombre medico, cl.nombre clinica
      FROM citas ci JOIN pacientes pa ON pa.id=ci.paciente_id JOIN medicos me ON me.id=ci.medico_id JOIN clinicas cl ON cl.id=ci.clinica_id
      WHERE substr(ci.inicio,1,10)=? ORDER BY ci.inicio`).all(q.get('fecha') || ahora().slice(0, 10)));
  }
  if (p === 'citas' && M === 'POST') {
    const b = await leer(req); if (!b) return send(res, 400, { error: 'Datos ilegibles.' });
    const esPac = u.rol === 'paciente';
    if (esPac) { if (b.acepta_terminos !== true) return send(res, 400, { error: 'Debe aceptar los términos y condiciones para agendar.' }); b.paciente_id = u.paciente_id; }
    for (const k of ['paciente_id', 'medico_id', 'clinica_id']) b[k] = Number.isInteger(Number(b[k])) && b[k] !== null && b[k] !== '' ? Number(b[k]) : 0;
    const c = db.prepare('SELECT * FROM clinicas WHERE id=?').get(b.clinica_id);
    if (!c || !db.prepare('SELECT 1 FROM medicos WHERE id=?').get(b.medico_id) || !db.prepare('SELECT 1 FROM pacientes WHERE id=?').get(b.paciente_id))
      return send(res, 400, { error: 'Falta elegir clínica, médico o paciente.' });
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(b.inicio || '')) return send(res, 400, { error: 'Fecha u hora no válida.' });
    if (b.inicio <= ahora()) return send(res, 400, { error: 'Esa fecha y hora ya pasaron. Elija una hora futura.' });
    if (!horas(c).includes(b.inicio.slice(11))) return send(res, 400, { error: `${c.nombre} atiende de ${c.abre} a ${c.cierra}, cada 30 minutos.` });
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

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    const f = path.join(PUB, url.pathname === '/' ? 'index.html' : path.normalize(url.pathname));
    if (!f.startsWith(PUB) || !fs.existsSync(f)) { res.writeHead(404); return res.end('No encontrado'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'text/plain' }); fs.createReadStream(f).pipe(res);
  } catch (e) { console.error(e); send(res, 500, { error: 'Algo salió mal en el sistema. Intente de nuevo; si sigue igual, avise a soporte.' }); }
}).listen(PORT, () => {
  const dir = process.env.VIKA_BACKUPS || 'backups', copiar = () => { try { backup.respaldo(db, dir); } catch (e) { console.error('Respaldo falló:', e.message); } };
  copiar(); setInterval(copiar, 864e5).unref();
  console.log(`Vika lista en http://localhost:${PORT}`);
});
