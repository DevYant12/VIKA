// Copia de seguridad diaria de la base (conserva las últimas N)
const fs = require('fs'), path = require('path');
function respaldo(db, dir, conservar = 7) {
  fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, `vika-${new Date().toISOString().slice(0, 10)}.db`);
  if (!fs.existsSync(f)) db.exec(`VACUUM INTO '${f.replace(/'/g, "''")}'`);
  const todos = fs.readdirSync(dir).filter(x => /^vika-\d{4}-\d{2}-\d{2}\.db$/.test(x)).sort();
  todos.slice(0, Math.max(0, todos.length - conservar)).forEach(x => fs.rmSync(path.join(dir, x)));
  return f;
}
module.exports = { respaldo };
