// Sincronización de citas registradas SIN internet (por ejemplo en la Clínica Sur).
// Reglas, decididas para que nunca se pierda ni se duplique nada:
//  1. Cada cita lleva un identificador propio (cliente_id): si el envío se repite, devuelve la misma cita.
//  2. Si dos clínicas tomaron la misma hora estando desconectadas, GANA LA PRIMERA QUE SE SINCRONIZA. Es la única regla justa
//     posible, porque los relojes de cada equipo pueden diferir. A la otra se le ofrecen horas libres cercanas del mismo médico.
//  3. El paciente se busca por documento; si no existe se crea. Si solo coincide el nombre, NO se adivina: se pide confirmar.
//  4. Todo queda en la auditoría, con la hora en que realmente se agendó (creada_cliente) y la de sincronización.
const db = require('./db'), V = require('./validators'), H = require('./horarios'), { crearPaciente } = require('./pacientes');

const ok = (status, body) => ({ status, body });
const fecha = (n, desde) => { const d = new Date(desde + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

// Próximas horas libres de ese médico en esa clínica, para ofrecer al que perdió la hora
function alternativas(clinica, medicoId, inicio, ahora, cuantas = 5) {
  const out = [], f0 = inicio.slice(0, 10);
  for (let n = 0; n < 8 && out.length < cuantas; n++) {
    const f = fecha(n, f0), ocup = new Set(db.prepare("SELECT substr(inicio,12,5) h FROM citas WHERE medico_id=? AND estado='agendada' AND substr(inicio,1,10)=?").all(medicoId, f).map(x => x.h));
    for (const h of H.horas(clinica, medicoId, f)) { const i = f + 'T' + h; if (!ocup.has(h) && i > ahora && i !== inicio && out.length < cuantas) out.push(i); }
  }
  return out;
}

function sincronizar(b, u, { ahora, audit }) {
  const cid = String(b.cliente_id || '');
  if (!/^[\w-]{8,64}$/.test(cid)) return ok(400, { estado: 'dato_invalido', error: 'Falta el identificador de la cita.' });
  const ya = db.prepare('SELECT id FROM citas WHERE cliente_id=?').get(cid);
  if (ya) return ok(200, { estado: 'ya_sincronizada', id: ya.id });

  const n = k => Number.isInteger(Number(b[k])) && b[k] !== null && b[k] !== '' ? Number(b[k]) : 0;
  const clin = db.prepare('SELECT * FROM clinicas WHERE id=?').get(n('clinica_id')), med = db.prepare('SELECT * FROM medicos WHERE id=? AND activo=1').get(n('medico_id'));
  if (!clin || !med) return ok(400, { estado: 'dato_invalido', error: 'La clínica o el médico ya no existen. Descarte esta cita y agéndela de nuevo.' });
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(b.inicio || '')) return ok(400, { estado: 'dato_invalido', error: 'Fecha u hora no válida.' });
  if (b.inicio <= ahora()) return ok(400, { estado: 'hora_pasada', error: 'Esa hora ya pasó antes de poder confirmarla. Hay que agendar al paciente en otra hora y avisarle.' });
  if (!H.horas(clin, med.id, b.inicio.slice(0, 10)).includes(b.inicio.slice(11))) return ok(400, { estado: 'fuera_de_horario', error: H.explicar(clin, med, b.inicio.slice(0, 10)) });

  db.exec('BEGIN');
  try {
    const choque = db.prepare("SELECT id FROM citas WHERE medico_id=? AND inicio=? AND estado='agendada'").get(med.id, b.inicio);
    if (choque) {
      db.exec('ROLLBACK');
      audit(u.nombre, 'conflicto_cita_offline', { cliente_id: cid, medico_id: med.id, clinica_id: clin.id, inicio: b.inicio, creada_cliente: b.creada_en || null, cita_existente: choque.id });
      return ok(409, { estado: 'conflicto_hora', error: `La hora de las ${b.inicio.slice(11)} con ${med.nombre} ya fue tomada por otra cita mientras no había internet. Elija otra hora.`, alternativas: alternativas(clin, med.id, b.inicio, ahora()) });
    }
    // Paciente
    let pid = 0, nuevo = false;
    if (n('paciente_id')) { if (!db.prepare('SELECT 1 FROM pacientes WHERE id=?').get(n('paciente_id'))) { db.exec('ROLLBACK'); return ok(400, { estado: 'dato_invalido', error: 'Ese paciente no existe.' }); } pid = n('paciente_id'); }
    else {
      const p = b.paciente || {}, tipo = p.tipo_doc || 'sin_documento', doc = V.limpiar(p.documento).replace(/[\s-]/g, '');
      const conocido = tipo !== 'sin_documento' && doc ? db.prepare('SELECT id FROM pacientes WHERE tipo_doc=? AND documento=?').get(tipo, tipo === 'pasaporte' ? doc.toUpperCase() : doc) : null;
      if (conocido) pid = conocido.id;
      else if (b.decision_paciente_id) { const e = db.prepare('SELECT id FROM pacientes WHERE id=?').get(Number(b.decision_paciente_id)); if (!e) { db.exec('ROLLBACK'); return ok(400, { estado: 'dato_invalido', error: 'Ese paciente no existe.' }); } pid = e.id; }
      else {
        const r = crearPaciente({ ...p, forzar: b.decision === 'otra' });
        if (r.status === 201) { pid = r.body.id; nuevo = true; }
        else if (r.status === 409 && r.body.existente) pid = r.body.existente.id;
        else { db.exec('ROLLBACK');
          if (r.status === 409) return ok(409, { estado: 'posible_duplicado', error: 'Ya hay pacientes con ese nombre. Confirme si es la misma persona.', existentes: r.body.existentes });
          return ok(422, { estado: 'dato_invalido', errores: r.body.errores, error: Object.values(r.body.errores || {}).join(' ') }); }
      }
    }
    const creada = /^[\d\-T:.Z+ ]{10,32}$/.test(b.creada_en || '') ? b.creada_en : null;
    const id = Number(db.prepare("INSERT INTO citas(paciente_id,medico_id,clinica_id,inicio,creado_por,anticipo,anticipo_monto,origen,creada_cliente,cliente_id) VALUES(?,?,?,?,?, 'no_aplica',0,'offline',?,?)")
      .run(pid, med.id, clin.id, b.inicio, u.nombre, creada, cid).lastInsertRowid);
    db.exec('COMMIT');
    audit(u.nombre, 'cita_offline_sincronizada', { id, cliente_id: cid, creada_cliente: creada, paciente_id: pid, paciente_nuevo: nuevo });
    return ok(201, { estado: 'creada', id, paciente_id: pid, paciente_nuevo: nuevo });
  } catch (e) { try { db.exec('ROLLBACK'); } catch {} throw e; }
}
module.exports = { sincronizar, alternativas };
