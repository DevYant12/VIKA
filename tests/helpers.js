// Arranca un servidor real con base temporal para probar la API de punta a punta
const { spawn } = require('node:child_process'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
async function arrancar() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vika-')), puerto = 4000 + Math.floor(Math.random() * 3000);
  const hijo = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: String(puerto), VIKA_DB: path.join(dir, 't.db'), VIKA_BACKUPS: path.join(dir, 'copias') } });
  let salida = '';
  await new Promise((ok, mal) => { hijo.stdout.on('data', d => { salida += d; if (salida.includes('Vika lista')) ok(); });
    hijo.on('error', mal); setTimeout(() => mal(new Error('El servidor no arrancó')), 8000); });
  const base = `http://localhost:${puerto}/api/`;
  const llamar = async (ruta, cuerpo, cookie) => {
    const r = await fetch(base + ruta, { method: cuerpo ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
    return { status: r.status, j: await r.json(), cookie: (r.headers.get('set-cookie') || '').split(';')[0] };
  };
  return { pin: /PIN inicial de [^:]+: (\d{6})/.exec(salida)[1], llamar, dir,
    cerrar() { hijo.kill(); setTimeout(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }, 500).unref(); } };
}
const fecha = (dias, hora = '10:00') => new Date(Date.now() + dias * 864e5 - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10) + 'T' + hora;
module.exports = { arrancar, fecha };
