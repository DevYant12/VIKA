// Horarios de atención. Sin filas propias, el médico atiende en el horario general de cada clínica, todos los días.
// Con filas propias, atiende solo en las clínicas y días indicados.
const db = require('./db'), V = require('./validators');
const mins = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const hhmm = t => String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
const diaDe = f => new Date(f + 'T12:00:00').getDay();             // 0 = domingo … 6 = sábado
const NOMBRES_DIA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const horaValida = t => /^([01]\d|2[0-3]):[03]0$/.test(t || '');

function franja(clinica, medicoId, fecha) {
  if (!db.prepare('SELECT 1 FROM horarios WHERE medico_id=?').get(medicoId)) return { abre: clinica.abre, cierra: clinica.cierra, general: true };
  return db.prepare('SELECT abre,cierra FROM horarios WHERE medico_id=? AND clinica_id=? AND dia=?').get(medicoId, clinica.id, diaDe(fecha)) || null;
}
function horas(clinica, medicoId, fecha) {
  const f = franja(clinica, medicoId, fecha), out = [];
  if (!f) return out;
  for (let t = mins(f.abre); t < mins(f.cierra); t += 30) out.push(hhmm(t));
  return out;
}
// Mensaje claro cuando la hora pedida no está dentro del horario
function explicar(clinica, medico, fecha) {
  const f = franja(clinica, medico.id, fecha);
  if (!f) return `${medico.nombre} no atiende en ${clinica.nombre} el ${NOMBRES_DIA[diaDe(fecha)]}.`;
  return f.general ? `${clinica.nombre} atiende de ${f.abre} a ${f.cierra}, cada 30 minutos.`
    : `${medico.nombre} atiende en ${clinica.nombre} de ${f.abre} a ${f.cierra} ese día, cada 30 minutos.`;
}
// Citas futuras activas de un médico que quedaron fuera del horario (para avisar a la doctora al cambiarlo)
function citasFueraDeHorario(medicoId, ahora) {
  const cl = Object.fromEntries(db.prepare('SELECT * FROM clinicas').all().map(c => [c.id, c]));
  return db.prepare("SELECT id,inicio,clinica_id FROM citas WHERE medico_id=? AND estado='agendada' AND inicio>? ORDER BY inicio").all(medicoId, ahora)
    .filter(c => !horas(cl[c.clinica_id], medicoId, c.inicio.slice(0, 10)).includes(c.inicio.slice(11)))
    .map(c => ({ id: c.id, inicio: c.inicio, clinica: cl[c.clinica_id].nombre }));
}

// "lun-vie", "lunes a viernes", "lun, mie, vie", "todos"
const ORDEN = [1, 2, 3, 4, 5, 6, 0], PREFIJO = { dom: 0, lun: 1, mar: 2, mie: 3, jue: 4, vie: 5, sab: 6 };
function parsearDias(txt) {
  const t = V.normalizar(txt).replace(/\s+a\s+/g, '-');
  if (/^(todos|todo|diario|todos los dias|l-d)$/.test(t)) return [0, 1, 2, 3, 4, 5, 6];
  const dias = new Set();
  for (const parte of t.split(/[,;/y\s]+/).filter(Boolean)) {
    const r = parte.split('-').map(x => /^(lun(es)?|mar(tes)?|mie(rcoles)?|jue(ves)?|vie(rnes)?|sab(ados?)?|dom(ingos?)?)$/.test(x) ? PREFIJO[x.slice(0, 3)] : undefined);
    if (r.some(x => x === undefined) || r.length > 2) return null;
    if (r.length === 1) dias.add(r[0]);
    else { let i = ORDEN.indexOf(r[0]); const fin = ORDEN.indexOf(r[1]); for (let n = 0; n < 7; n++, i = (i + 1) % 7) { dias.add(ORDEN[i]); if (ORDEN[i] === ORDEN[fin]) break; } }
  }
  return dias.size ? [...dias].sort() : null;
}
module.exports = { franja, horas, explicar, citasFueraDeHorario, parsearDias, horaValida, diaDe, NOMBRES_DIA, mins };
