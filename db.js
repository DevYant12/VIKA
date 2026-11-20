// Base de datos SQLite (módulo integrado de Node, sin instalar nada)
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(process.env.VIKA_DB || 'vika.db');

db.exec(`
PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS clinicas(id INTEGER PRIMARY KEY, nombre TEXT UNIQUE NOT NULL, abre TEXT NOT NULL DEFAULT '08:00', cierra TEXT NOT NULL DEFAULT '17:00');
CREATE TABLE IF NOT EXISTS medicos(id INTEGER PRIMARY KEY, nombre TEXT NOT NULL, especialidad TEXT);
CREATE TABLE IF NOT EXISTS pacientes(
  id INTEGER PRIMARY KEY, nombre TEXT NOT NULL, nombre_norm TEXT NOT NULL,
  tipo_doc TEXT NOT NULL DEFAULT 'sin_documento' CHECK(tipo_doc IN ('cedula','pasaporte','sin_documento')),
  documento TEXT, telefono TEXT, email TEXT, nacimiento TEXT, creado TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE UNIQUE INDEX IF NOT EXISTS ux_doc ON pacientes(tipo_doc, documento) WHERE documento IS NOT NULL;
CREATE TABLE IF NOT EXISTS citas(
  id INTEGER PRIMARY KEY, paciente_id INTEGER NOT NULL REFERENCES pacientes(id),
  medico_id INTEGER NOT NULL REFERENCES medicos(id), clinica_id INTEGER NOT NULL REFERENCES clinicas(id),
  inicio TEXT NOT NULL, estado TEXT NOT NULL DEFAULT 'agendada' CHECK(estado IN ('agendada','cancelada')),
  creado_por TEXT, creado TEXT DEFAULT CURRENT_TIMESTAMP);
-- Clave anti-cruces: un médico no puede tener 2 citas activas a la misma hora (en ninguna clínica)
CREATE UNIQUE INDEX IF NOT EXISTS ux_medico_hora ON citas(medico_id, inicio) WHERE estado='agendada';
CREATE TABLE IF NOT EXISTS auditoria(id INTEGER PRIMARY KEY, cuando TEXT DEFAULT CURRENT_TIMESTAMP, quien TEXT, accion TEXT, detalle TEXT);
CREATE TABLE IF NOT EXISTS usuarios(id INTEGER PRIMARY KEY, nombre TEXT NOT NULL, rol TEXT NOT NULL CHECK(rol IN ('doctora','recepcion')), activo INTEGER NOT NULL DEFAULT 1, pin_hash TEXT, intentos INTEGER NOT NULL DEFAULT 0, bloqueado_hasta INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS sesiones(token TEXT PRIMARY KEY, usuario_id INTEGER NOT NULL REFERENCES usuarios(id), expira INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS cuentas(id INTEGER PRIMARY KEY, paciente_id INTEGER NOT NULL UNIQUE REFERENCES pacientes(id), pin_hash TEXT NOT NULL, intentos INTEGER NOT NULL DEFAULT 0, bloqueado_hasta INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS horarios(
  id INTEGER PRIMARY KEY, medico_id INTEGER NOT NULL REFERENCES medicos(id), clinica_id INTEGER NOT NULL REFERENCES clinicas(id),
  dia INTEGER NOT NULL CHECK(dia BETWEEN 0 AND 6), abre TEXT NOT NULL, cierra TEXT NOT NULL, UNIQUE(medico_id, clinica_id, dia));
CREATE TABLE IF NOT EXISTS respaldos(
  id INTEGER PRIMARY KEY, cuando TEXT DEFAULT CURRENT_TIMESTAMP, archivo TEXT, bytes INTEGER, local_ok INTEGER NOT NULL DEFAULT 0,
  extra_config INTEGER NOT NULL DEFAULT 0, extra_ok INTEGER, cifrado INTEGER NOT NULL DEFAULT 0, mismo_disco INTEGER NOT NULL DEFAULT 0, error TEXT);
CREATE TABLE IF NOT EXISTS sesiones_pac(token TEXT PRIMARY KEY, cuenta_id INTEGER NOT NULL REFERENCES cuentas(id), expira INTEGER NOT NULL);
`);
// Migración: bases creadas con la versión anterior
for (const c of ['pin_hash TEXT', 'intentos INTEGER NOT NULL DEFAULT 0', 'bloqueado_hasta INTEGER NOT NULL DEFAULT 0'])
  try { db.exec('ALTER TABLE usuarios ADD COLUMN ' + c); } catch {}
for (const c of ["anticipo TEXT NOT NULL DEFAULT 'no_aplica'", 'anticipo_monto REAL NOT NULL DEFAULT 0', 'terminos_version TEXT', 'terminos_en TEXT', 'pago_ref TEXT'])
  try { db.exec('ALTER TABLE citas ADD COLUMN ' + c); } catch {}
for (const c of ["cliente_id TEXT", "origen TEXT NOT NULL DEFAULT 'normal'", 'creada_cliente TEXT'])
  try { db.exec('ALTER TABLE citas ADD COLUMN ' + c); } catch {}
try { db.exec('ALTER TABLE medicos ADD COLUMN activo INTEGER NOT NULL DEFAULT 1'); } catch {}
// Una cita registrada sin internet lleva un identificador propio: si el envío se repite, no se duplica
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS ux_cita_cliente ON citas(cliente_id) WHERE cliente_id IS NOT NULL');

if (db.prepare('SELECT COUNT(*) n FROM clinicas').get().n === 0) {
  for (const c of ['Clínica Centro', 'Clínica Norte', 'Clínica Sur']) db.prepare('INSERT INTO clinicas(nombre) VALUES(?)').run(c);
  const m = db.prepare('INSERT INTO medicos(nombre,especialidad) VALUES(?,?)');
  [['Dra. Paredes', 'Medicina general'], ['Dr. Salazar', 'Pediatría'], ['Dra. Vera', 'Ginecología'], ['Dr. Mora', 'Cardiología']]
    .forEach(x => m.run(...x)); // datos de ejemplo; reemplazar con el archivo del martes
}
module.exports = db;
