const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { DatabaseSync } = require('node:sqlite'), { respaldo } = require('../backup');
test('crea una copia legible y conserva solo las últimas', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'resp-')), db = new DatabaseSync(':memory:');
  db.exec("CREATE TABLE t(x); INSERT INTO t VALUES(1),(2)");
  for (let d = 1; d <= 9; d++) fs.writeFileSync(path.join(dir, `vika-2020-01-0${d}.db`), '');
  const f = respaldo(db, dir, 3), copia = new DatabaseSync(f);
  assert.equal(copia.prepare('SELECT COUNT(*) n FROM t').get().n, 2); copia.close();
  assert.equal(fs.readdirSync(dir).length, 3);
  assert.doesNotThrow(() => respaldo(db, dir, 3)); fs.rmSync(dir, { recursive: true, force: true });
});
