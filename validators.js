// Validaciones y normalización de datos (compartidas por el servidor)
const normalizar = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/\s+/g, ' ').trim();

const limpiar = s => String(s || '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim();

// Cédula ecuatoriana: 10 dígitos, provincia válida, módulo 10
function cedulaValida(c) {
  if (!/^\d{10}$/.test(c) || /^(\d)\1{9}$/.test(c)) return false;
  const prov = +c.slice(0, 2);
  if (prov < 1 || (prov > 24 && prov !== 30) || +c[2] > 5) return false;
  let suma = 0;
  for (let i = 0; i < 9; i++) { let v = +c[i] * (i % 2 === 0 ? 2 : 1); if (v > 9) v -= 9; suma += v; }
  return (10 - (suma % 10)) % 10 === +c[9];
}

const telefonoValido = t => /^(09\d{8}|0[2-7]\d{7})$/.test(t);
const emailValido = e => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/.test(e);

// Hora actual en la zona de las clínicas (Ecuador continental por defecto; no tiene cambio de hora). Se puede cambiar con VIKA_TZ.
// Así el sistema no depende de la zona del computador o servidor donde corra.
const ZONA = process.env.VIKA_TZ || 'America/Guayaquil';
function ahoraLocal(ms = Date.now()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    .formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

// Fecha real (rechaza 31 de febrero), no futura y de máximo 120 años
function nacimientoValido(f) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(f || ''); if (!m) return false;
  const [y, mo, d] = [+m[1], +m[2], +m[3]], dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return false;
  const hoy = ahoraLocal().slice(0, 10);
  if (f > hoy) return false;
  const lim = String(+hoy.slice(0, 4) - 120) + hoy.slice(4);
  return f >= lim;
}

module.exports = { normalizar, limpiar, cedulaValida, telefonoValido, emailValido, nacimientoValido, ahoraLocal, ZONA };
