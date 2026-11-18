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

function nacimientoValido(f) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return false;
  const d = new Date(f + 'T00:00:00'), hoy = new Date();
  if (isNaN(d) || d > hoy) return false;
  return hoy.getFullYear() - d.getFullYear() <= 120;
}

module.exports = { normalizar, limpiar, cedulaValida, telefonoValido, emailValido, nacimientoValido };
