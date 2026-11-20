// Importar pacientes, médicos y horarios desde un CSV (Excel: "Guardar como CSV"). Pensado para datos sucios:
// separador coma o punto y coma, tildes, mayúsculas, ceros iniciales que Excel borra, fechas dd/mm/aaaa.
// Todo corre dentro de una transacción: "simular" muestra el resultado exacto y deshace; si no, guarda.
const db = require('./db'), V = require('./validators'), H = require('./horarios'), { crearPaciente } = require('./pacientes');
const MAX_FILAS = 5000, MAX_LISTADAS = 300;

function csv(texto) {
  let t = String(texto || '').replace(/^\uFEFF/, '');
  const primera = t.split(/\r?\n/, 1)[0], sep = (primera.match(/;/g) || []).length > (primera.match(/,/g) || []).length ? ';' : ',';
  const filas = []; let fila = [], cel = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { cel += '"'; i++; } else q = false; } else cel += c; }
    else if (c === '"') q = true;
    else if (c === sep) { fila.push(cel); cel = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; fila.push(cel); cel = ''; if (fila.some(x => x.trim())) filas.push(fila); fila = []; }
    else cel += c;
  }
  fila.push(cel); if (fila.some(x => x.trim())) filas.push(fila);
  return filas;
}
const clave = s => V.normalizar(s).replace(/[^a-z0-9]/g, '');
const SINONIMOS = {
  nombre: ['nombre', 'nombres', 'paciente', 'nombrecompleto', 'apellidosynombres', 'apellidosnombres', 'medico', 'doctor', 'doctora'],
  documento: ['documento', 'cedula', 'ci', 'identificacion', 'numerodocumento', 'pasaporte', 'cedulaopasaporte'],
  tipo_doc: ['tipodoc', 'tipodocumento', 'tipo', 'tipoidentificacion'],
  telefono: ['telefono', 'celular', 'movil', 'telf', 'telefonocelular', 'whatsapp'],
  email: ['email', 'correo', 'correoelectronico', 'mail'],
  nacimiento: ['nacimiento', 'fechanacimiento', 'fechadenacimiento', 'fnacimiento'],
  especialidad: ['especialidad', 'area'],
  clinica: ['clinica', 'sede', 'sucursal'],
  dias: ['dias', 'dia'],
  abre: ['abre', 'desde', 'entrada', 'inicio', 'horainicio'],
  cierra: ['cierra', 'hasta', 'salida', 'fin', 'horafin'],
  fecha: ['fecha', 'fechacita', 'fechadelacita'],
  hora: ['hora', 'horacita', 'horadelacita'],
  estado: ['estado', 'situacion'],
};
// En el archivo de citas pasadas hay dos nombres por fila (paciente y médico): se leen aparte
const COL_CITAS = { paciente: ['paciente', 'nombrepaciente', 'nombre', 'nombres'], medico: ['medico', 'doctor', 'doctora', 'nombremedico'] };
function leerTabla(texto, tipo) {
  const f = csv(texto); if (f.length < 2) return { error: 'El archivo está vacío o solo tiene los títulos. Debe tener una fila por cada registro.' };
  const col = {}; f[0].forEach((t, i) => { for (const [k, s] of Object.entries(SINONIMOS)) if (s.includes(clave(t)) && !(k in col)) col[k] = i; });
  if (tipo === 'citas') { delete col.nombre; f[0].forEach((t, i) => { for (const [k, s] of Object.entries(COL_CITAS)) if (s.includes(clave(t)) && !(k in col)) col[k] = i; }); }
  const filas = f.slice(1).map((r, i) => ({ linea: i + 2, v: Object.fromEntries(Object.entries(col).map(([k, i2]) => [k, String(r[i2] ?? '').trim()])) }));
  if (filas.length > MAX_FILAS) return { error: `El archivo tiene ${filas.length} filas; el máximo es ${MAX_FILAS}. Divídalo en partes.` };
  return { col, filas };
}
const aIso = s => { s = String(s || '').trim(); if (!s) return ''; let m;
  if ((m = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/.exec(s))) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return s; };
const fechaReal = f => /^\d{4}-\d{2}-\d{2}$/.test(f) && !isNaN(new Date(f + 'T12:00:00')) && new Date(f + 'T12:00:00Z').toISOString().slice(0, 10) === f;   // rechaza 31/02
const aHora = s => { const m = /^(\d{1,2})(?::|h|\.)?(\d{2})?$/.exec(String(s || '').trim()); return m ? String(m[1]).padStart(2, '0') + ':' + (m[2] || '00') : String(s || '').trim(); };

function filaPaciente(v) {
  let tipo = clave(v.tipo_doc), doc = String(v.documento || '').replace(/[\s.-]/g, '');
  tipo = /^(cedula|ci|cdi)$/.test(tipo) ? 'cedula' : /^(pasaporte|pas|passport)$/.test(tipo) ? 'pasaporte' : /^(sin|sindocumento|ninguno|no)$/.test(tipo) ? 'sin_documento' : '';
  if (!tipo) tipo = !doc ? 'sin_documento' : /^\d{9,10}$/.test(doc) ? 'cedula' : 'pasaporte';
  if (tipo === 'cedula' && /^\d{9}$/.test(doc)) doc = '0' + doc;                       // Excel borra el cero inicial
  let tel = String(v.telefono || '').replace(/[\s.()+-]/g, ''); if (/^9\d{8}$/.test(tel)) tel = '0' + tel;
  if (/^593\d{9}$/.test(tel)) tel = '0' + tel.slice(3);
  return { nombre: v.nombre, tipo_doc: tipo, documento: tipo === 'sin_documento' ? '' : doc, telefono: tel, email: v.email, nacimiento: aIso(v.nacimiento) };
}
function textoErrores(e) { return Object.values(e).join(' '); }

function ejecutar(tipo, texto, { simular = true, duplicados = false, quien = 'importación' } = {}) {
  const t = leerTabla(texto, tipo); if (t.error) return { status: 422, body: { error: t.error } };
  const faltan = { pacientes: ['nombre'], medicos: ['nombre'], horarios: ['nombre', 'clinica', 'dias', 'abre', 'cierra'], citas: ['paciente', 'medico', 'clinica', 'fecha', 'hora'] }[tipo];
  if (!faltan) return { status: 400, body: { error: 'Elija qué desea importar.' } };
  const sin = faltan.filter(k => !(k in t.col));
  if (sin.length) return { status: 422, body: { error: `Faltan estas columnas en la primera fila: ${sin.join(', ')}.` } };
  const res = { simulado: simular, tipo, total: t.filas.length, creados: 0, ya_existian: 0, parecidos: 0, errores: 0, filas: [] };
  const nota = (linea, estado, mensaje, nombre) => { if (estado === 'creado') res.creados++; else if (estado === 'ya_existia') res.ya_existian++; else if (estado === 'parecido') res.parecidos++; else res.errores++;
    if (estado !== 'creado' && res.filas.length < MAX_LISTADAS) res.filas.push({ linea, estado, mensaje, nombre: nombre || '' }); };
  db.exec('BEGIN');
  try {
    const medicos = db.prepare('SELECT id,nombre FROM medicos').all(), clinicas = db.prepare('SELECT id,nombre FROM clinicas').all();
    for (const { linea, v } of t.filas) {
      if (tipo === 'pacientes') {
        const r = crearPaciente({ ...filaPaciente(v), forzar: duplicados });
        if (r.status === 201) nota(linea, 'creado');
        else if (r.status === 422) nota(linea, 'error', textoErrores(r.body.errores), v.nombre);
        else if (r.body.existente) nota(linea, 'ya_existia', r.body.error, v.nombre);
        else nota(linea, 'parecido', 'Se parece a: ' + r.body.existentes.map(x => x.nombre + (x.nacimiento ? ' (' + x.nacimiento + ')' : '')).join(', ') + '. No se importó; revísela a mano o marque "importar también los parecidos".', v.nombre);
      } else if (tipo === 'medicos') {
        const nombre = V.limpiar(v.nombre);
        if (nombre.length < 3 || nombre.length > 80) { nota(linea, 'error', 'Escriba el nombre del médico (entre 3 y 80 letras).', nombre); continue; }
        const x = medicos.find(m => V.normalizar(m.nombre) === V.normalizar(nombre));
        if (x) { nota(linea, 'ya_existia', 'Ya existe un médico con ese nombre.', nombre); continue; }
        const id = Number(db.prepare('INSERT INTO medicos(nombre,especialidad) VALUES(?,?)').run(nombre, V.limpiar(v.especialidad) || null).lastInsertRowid);
        medicos.push({ id, nombre }); nota(linea, 'creado');
      } else if (tipo === 'citas') {          // citas pasadas del archivo de la clínica: se guardan como historial, sin exigir que la fecha sea futura
        const nn = V.normalizar(v.medico), m = medicos.find(x => V.normalizar(x.nombre) === nn) || medicos.find(x => V.normalizar(x.nombre).replace(/^(dr|dra)\.?\s/, '') === nn.replace(/^(dr|dra)\.?\s/, ''));
        const cn = V.normalizar(v.clinica).replace(/^clinica\s/, ''), c = clinicas.find(x => V.normalizar(x.nombre).replace(/^clinica\s/, '') === cn);
        const fecha = aIso(v.fecha), hora = aHora(v.hora), cancelada = /cancel/.test(V.normalizar(v.estado));
        const doc = String(v.documento || '').replace(/[\s.-]/g, ''), pn = V.normalizar(v.paciente);
        let pacs = doc ? db.prepare('SELECT id FROM pacientes WHERE documento=?').all(doc.length === 9 && /^\d+$/.test(doc) ? '0' + doc : doc.toUpperCase()) : [];
        if (!pacs.length) pacs = db.prepare('SELECT id FROM pacientes WHERE nombre_norm=?').all(pn);
        if (!m) nota(linea, 'error', `No hay un médico llamado "${v.medico}". Impórtelo primero.`, v.paciente);
        else if (!c) nota(linea, 'error', `No existe la clínica "${v.clinica}". Las clínicas son: ${clinicas.map(x => x.nombre).join(', ')}.`, v.paciente);
        else if (!fechaReal(fecha)) nota(linea, 'error', `La fecha "${v.fecha}" no es válida. Use día/mes/año, por ejemplo 15/03/2026.`, v.paciente);
        else if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) nota(linea, 'error', `La hora "${v.hora}" no es válida. Ejemplo: 09:30.`, v.paciente);
        else if (!pacs.length) nota(linea, 'error', `No encuentro al paciente "${v.paciente}". Importe primero a los pacientes.`, v.paciente);
        else if (pacs.length > 1) nota(linea, 'parecido', `Hay ${pacs.length} pacientes con el nombre "${v.paciente}". Agregue su cédula en el archivo para saber cuál es.`, v.paciente);
        else {
          if (db.prepare('SELECT 1 FROM citas WHERE paciente_id=? AND medico_id=? AND inicio=? AND estado=?').get(pacs[0].id, m.id, fecha + 'T' + hora, cancelada ? 'cancelada' : 'agendada')) { nota(linea, 'ya_existia', 'Esta cita ya estaba registrada.', v.paciente); continue; }   // repetir la importación no duplica
          try { db.prepare("INSERT INTO citas(paciente_id,medico_id,clinica_id,inicio,estado,creado_por,origen) VALUES(?,?,?,?,?,?,'importada')").run(pacs[0].id, m.id, c.id, fecha + 'T' + hora, cancelada ? 'cancelada' : 'agendada', quien); nota(linea, 'creado'); }
          catch (e) { if (!String(e.message).includes('UNIQUE')) throw e; nota(linea, 'ya_existia', 'Ese médico ya tiene una cita a esa hora (puede que ya se haya importado).', v.paciente); }
        }
      } else {
        const nn = V.normalizar(v.nombre), m = medicos.find(x => V.normalizar(x.nombre) === nn) || medicos.find(x => V.normalizar(x.nombre).replace(/^(dr|dra)\.?\s/, '') === nn.replace(/^(dr|dra)\.?\s/, ''));
        const cn = V.normalizar(v.clinica).replace(/^clinica\s/, ''), c = clinicas.find(x => V.normalizar(x.nombre).replace(/^clinica\s/, '') === cn);
        const dias = H.parsearDias(v.dias), abre = aHora(v.abre), cierra = aHora(v.cierra);
        if (!m) nota(linea, 'error', `No hay un médico llamado "${v.nombre}". Impórtelo primero.`, v.nombre);
        else if (!c) nota(linea, 'error', `No existe la clínica "${v.clinica}". Las clínicas son: ${clinicas.map(x => x.nombre).join(', ')}.`, v.nombre);
        else if (!dias) nota(linea, 'error', `No entiendo los días "${v.dias}". Ejemplos: lun-vie, lun, mie, vie, todos.`, v.nombre);
        else if (!H.horaValida(abre) || !H.horaValida(cierra) || H.mins(abre) >= H.mins(cierra)) nota(linea, 'error', 'Las horas deben ser en punto o y media (ej.: 08:00, 13:30) y la salida después de la entrada.', v.nombre);
        else { for (const d of dias) db.prepare('INSERT INTO horarios(medico_id,clinica_id,dia,abre,cierra) VALUES(?,?,?,?,?) ON CONFLICT(medico_id,clinica_id,dia) DO UPDATE SET abre=excluded.abre, cierra=excluded.cierra').run(m.id, c.id, d, abre, cierra); nota(linea, 'creado'); }
      }
    }
    if (!simular) db.prepare('INSERT INTO auditoria(quien,accion,detalle) VALUES(?,?,?)').run(quien, 'importar_' + tipo, JSON.stringify({ total: res.total, creados: res.creados, errores: res.errores }));
    db.exec(simular ? 'ROLLBACK' : 'COMMIT');
  } catch (e) { try { db.exec('ROLLBACK'); } catch {} throw e; }
  return { status: 200, body: res };
}
module.exports = { ejecutar, csv, leerTabla, filaPaciente };
