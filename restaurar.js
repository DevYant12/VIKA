// Restaurar una copia de seguridad:  node restaurar.js <archivo de copia> [destino=vika.db]
// Si la copia es cifrada (.enc) hace falta VIKA_BACKUP_CLAVE. DETENGA el servidor antes de restaurar.
const fs = require('fs'), path = require('path'), { descifrar, integra } = require('./backup');
const [origen, destino = process.env.VIKA_DB || 'vika.db'] = process.argv.slice(2);
if (!origen) { console.error('Uso: node restaurar.js <archivo de copia> [destino]\nEjemplo: node restaurar.js backups/vika-2026-11-19.db'); process.exit(1); }
try {
  if (!fs.existsSync(origen)) throw new Error('No encuentro el archivo: ' + origen);
  let datos = fs.readFileSync(origen);
  if (origen.endsWith('.enc')) { if (!process.env.VIKA_BACKUP_CLAVE) throw new Error('Esta copia está cifrada. Defina VIKA_BACKUP_CLAVE con la clave usada al hacerla.'); datos = descifrar(datos, process.env.VIKA_BACKUP_CLAVE); }
  const tmp = destino + '.restaurando'; fs.writeFileSync(tmp, datos);
  if (!integra(tmp)) { fs.rmSync(tmp, { force: true }); throw new Error('La copia está dañada; no se restauró nada.'); }
  if (fs.existsSync(destino)) { const guardada = `${destino}.antes-de-restaurar-${Date.now()}`; fs.renameSync(destino, guardada); console.log('La base actual se guardó como ' + guardada); }
  for (const x of ['-wal', '-shm']) fs.rmSync(destino + x, { force: true });
  fs.renameSync(tmp, destino); console.log('Listo. Se restauró ' + path.basename(origen) + ' en ' + destino + '. Ya puede iniciar el servidor.');
} catch (e) { console.error('No se pudo restaurar: ' + e.message); process.exit(1); }
