// Ajustes que solo hace la doctora: horarios, médicos, importar datos y copias de seguridad.
const db = require('./db'), V = require('./validators'), H = require('./horarios'), Imp = require('./importar'), B = require('./backup');
const SOLO_DOCTORA = /^(horarios(\/.*)?|importar|respaldos(\/ahora)?|medicos\/\d+\/(activar|desactivar))$/;

async function rutas(req, res, p, M, { leer, leerGrande, send, u, ahora, audit, respaldoCfg, hacerRespaldo }) {
  const n = (b, k) => Number.isInteger(Number(b[k])) && b[k] !== null && b[k] !== '' ? Number(b[k]) : 0;
  const medico = id => db.prepare('SELECT * FROM medicos WHERE id=?').get(id), clinica = id => db.prepare('SELECT * FROM clinicas WHERE id=?').get(id);

  if (p === 'horarios' && M === 'GET')
    return send(res, 200, { clinicas: db.prepare('SELECT * FROM clinicas').all(), medicos: db.prepare('SELECT id,nombre,especialidad,activo FROM medicos ORDER BY id').all(),
      filas: db.prepare('SELECT medico_id,clinica_id,dia,abre,cierra FROM horarios ORDER BY medico_id,clinica_id,dia').all() }), true;
  if (p === 'respaldos' && M === 'GET') return send(res, 200, B.estado(db, !!respaldoCfg.extra)), true;
  if (M !== 'POST') return false;

  if (p === 'respaldos/ahora') {
    const r = hacerRespaldo(); audit(u.nombre, 'respaldo_manual', { local_ok: r.local_ok, extra_ok: r.extra_ok });
    return send(res, r.local_ok ? 200 : 500, { ...B.estado(db, !!respaldoCfg.extra), resultado: { local_ok: r.local_ok, extra_ok: r.extra_ok, error: r.error } }), true;
  }
  if (p === 'importar') {
    const b = await leerGrande(req); if (!b) return send(res, 413, { error: 'El archivo es demasiado grande (máximo 2 MB) o no se pudo leer.' }), true;
    const r = Imp.ejecutar(String(b.tipo || ''), b.texto, { simular: b.simular !== false, duplicados: b.duplicados === true, quien: u.nombre });
    return send(res, r.status, r.body), true;
  }
  const b = await leer(req); if (!b) return send(res, 400, { error: 'Datos ilegibles.' }), true;

  let m = p.match(/^medicos\/(\d+)\/(activar|desactivar)$/);
  if (m) {
    const md = medico(m[1]); if (!md) return send(res, 404, { error: 'No existe ese médico.' }), true;
    db.prepare('UPDATE medicos SET activo=? WHERE id=?').run(m[2] === 'activar' ? 1 : 0, md.id);
    audit(u.nombre, m[2] + '_medico', { id: md.id, nombre: md.nombre });
    const futuras = m[2] === 'desactivar' ? db.prepare("SELECT COUNT(*) n FROM citas WHERE medico_id=? AND estado='agendada' AND inicio>?").get(md.id, ahora()).n : 0;
    return send(res, 200, { ok: true, citas_futuras: futuras }), true;
  }
  if (p === 'horarios/clinica') {
    const c = clinica(n(b, 'clinica_id'));
    if (!c) return send(res, 400, { error: 'Elija la clínica.' }), true;
    if (!H.horaValida(b.abre) || !H.horaValida(b.cierra) || H.mins(b.abre) >= H.mins(b.cierra)) return send(res, 422, { error: 'Las horas deben ser en punto o y media (ej.: 08:00, 13:30) y la salida después de la entrada.' }), true;
    db.prepare('UPDATE clinicas SET abre=?, cierra=? WHERE id=?').run(b.abre, b.cierra, c.id); audit(u.nombre, 'horario_clinica', { clinica: c.nombre, abre: b.abre, cierra: b.cierra });
    return send(res, 200, { ok: true }), true;
  }
  if (p === 'horarios' || p === 'horarios/quitar' || p === 'horarios/restablecer') {
    const md = medico(n(b, 'medico_id')), c = p === 'horarios/restablecer' ? true : clinica(n(b, 'clinica_id'));
    if (!md || !c) return send(res, 400, { error: 'Elija el médico y la clínica.' }), true;
    if (p === 'horarios') {
      const dias = Array.isArray(b.dias) ? [...new Set(b.dias.map(Number))] : [];
      if (!dias.length || dias.some(d => !Number.isInteger(d) || d < 0 || d > 6)) return send(res, 422, { error: 'Marque al menos un día de la semana.' }), true;
      if (!H.horaValida(b.abre) || !H.horaValida(b.cierra) || H.mins(b.abre) >= H.mins(b.cierra)) return send(res, 422, { error: 'Las horas deben ser en punto o y media (ej.: 08:00, 13:30) y la salida después de la entrada.' }), true;
      for (const d of dias) db.prepare('INSERT INTO horarios(medico_id,clinica_id,dia,abre,cierra) VALUES(?,?,?,?,?) ON CONFLICT(medico_id,clinica_id,dia) DO UPDATE SET abre=excluded.abre, cierra=excluded.cierra').run(md.id, c.id, d, b.abre, b.cierra);
      audit(u.nombre, 'horario_medico', { medico: md.nombre, clinica: c.nombre, dias, abre: b.abre, cierra: b.cierra });
    } else if (p === 'horarios/quitar') {
      const dias = Array.isArray(b.dias) ? b.dias.map(Number).filter(d => d >= 0 && d <= 6) : [0, 1, 2, 3, 4, 5, 6];
      for (const d of dias) db.prepare('DELETE FROM horarios WHERE medico_id=? AND clinica_id=? AND dia=?').run(md.id, c.id, d);
      audit(u.nombre, 'quitar_horario_medico', { medico: md.nombre, clinica: c.nombre, dias });
    } else { db.prepare('DELETE FROM horarios WHERE medico_id=?').run(md.id); audit(u.nombre, 'restablecer_horario_medico', { medico: md.nombre }); }
    const fuera = H.citasFueraDeHorario(md.id, ahora());
    return send(res, 200, { ok: true, citas_fuera_de_horario: fuera.length, ejemplos: fuera.slice(0, 10) }), true;
  }
  return false;
}
module.exports = { rutas, SOLO_DOCTORA };
