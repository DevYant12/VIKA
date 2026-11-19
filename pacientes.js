// Registro y validación de pacientes (lo usan el personal y el registro de pacientes)
const db = require('./db'), V = require('./validators');
function crearPaciente(b) {
  const e = {}, nombre = V.limpiar(b.nombre), tipo = b.tipo_doc || 'sin_documento';
  const doc = V.limpiar(b.documento).replace(/[\s-]/g, ''), tel = V.limpiar(b.telefono).replace(/[\s-]/g, ''), mail = V.limpiar(b.email).toLowerCase();
  if (!/^[\p{L}\p{M}' .-]{2,100}$/u.test(nombre)) e.nombre = 'Escriba el nombre completo, solo con letras (ej.: María López).';
  if (!['cedula', 'pasaporte', 'sin_documento'].includes(tipo)) e.tipo_doc = 'Elija un tipo de documento.';
  if (tipo === 'cedula' && !V.cedulaValida(doc)) e.documento = 'La cédula no es válida. Debe tener 10 números; revise que no falte ni sobre ninguno.';
  if (tipo === 'pasaporte' && !/^[A-Za-z0-9]{5,20}$/.test(doc)) e.documento = 'El pasaporte debe tener entre 5 y 20 letras o números.';
  if (tel && !V.telefonoValido(tel)) e.telefono = 'Celular: 10 números que empiezan con 09. Fijo: 9 números con el código de provincia (ej.: 022345678).';
  if (mail && !V.emailValido(mail)) e.email = 'El correo no parece correcto. Ejemplo: nombre@gmail.com';
  if (b.nacimiento && !V.nacimientoValido(b.nacimiento)) e.nacimiento = 'La fecha de nacimiento no es posible. Revise el año.';
  if (Object.keys(e).length) return { status: 422, body: { errores: e } };
  const norm = V.normalizar(nombre), docv = tipo === 'sin_documento' ? null : (tipo === 'pasaporte' ? doc.toUpperCase() : doc);
  if (docv) { const x = db.prepare('SELECT id,nombre FROM pacientes WHERE tipo_doc=? AND documento=?').get(tipo, docv);
    if (x) return { status: 409, body: { error: `Este documento ya está registrado a nombre de ${x.nombre}.`, existente: x } }; }
  if (!b.forzar) { const x = db.prepare('SELECT id,nombre,nacimiento FROM pacientes WHERE nombre_norm=?').all(norm);
    if (x.length) return { status: 409, body: { posible_duplicado: true, error: 'Ya hay pacientes con este nombre. Confirme si es una persona distinta.', existentes: x } }; }
  const r = db.prepare('INSERT INTO pacientes(nombre,nombre_norm,tipo_doc,documento,telefono,email,nacimiento) VALUES(?,?,?,?,?,?,?)')
    .run(nombre, norm, tipo, docv, tel || null, mail || null, b.nacimiento || null);
  return { status: 201, body: { id: Number(r.lastInsertRowid), nombre } };
}
module.exports = { crearPaciente };
