// Arranca un servidor real con base temporal para probar la API de punta a punta
const { spawn } = require('node:child_process'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
async function arrancar(extraEnv = {}, { https: usaHttps = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vika-')), puerto = 4000 + Math.floor(Math.random() * 3000);
  const hijo = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: String(puerto), VIKA_HOST: '127.0.0.1', VIKA_DB: path.join(dir, 't.db'), VIKA_BACKUPS: path.join(dir, 'copias'), ...extraEnv } });
  let salida = '';
  await new Promise((ok, mal) => { hijo.stdout.on('data', d => { salida += d; if (salida.includes('Vika lista')) ok(); });
    hijo.on('error', mal); setTimeout(() => mal(new Error('El servidor no arrancó')), 8000); });
  const base = `${usaHttps ? 'https' : 'http'}://127.0.0.1:${puerto}/api/`;
  const llamar = async (ruta, cuerpo, cookie) => {
    const r = await fetch(base + ruta, { method: cuerpo ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
    return { status: r.status, j: await r.json(), cookie: (r.headers.get('set-cookie') || '').split(';')[0] };
  };
  return { puerto, pin: /PIN inicial de [^:]+: (\d{6})/.exec(salida)[1], llamar, dir,
    cerrar() { hijo.kill(); setTimeout(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }, 500).unref(); } };
}
const fecha = (dias, hora = '10:00') => require('../validators').ahoraLocal(Date.now() + dias * 864e5).slice(0, 10) + 'T' + hora;
// Cédula ecuatoriana válida (semilla de 7 dígitos → 10 dígitos con su verificador). Prefijo = provincia, ej. '01'.
const cedula = (semilla, prov = '17') => { const c = prov + '1' + String(semilla).padStart(6, '0').slice(-6); let s = 0;
  for (let i = 0; i < 9; i++) { let v = +c[i] * (i % 2 === 0 ? 2 : 1); if (v > 9) v -= 9; s += v; } return c + ((10 - (s % 10)) % 10); };
// Próxima fecha (a ≥2 días) que cae en cierto día de la semana (0 = domingo … 6 = sábado)
const proximoDia = (dow, hora = '10:00', min = 2) => { for (let d = min; d < min + 8; d++) { const f = fecha(d, hora); if (new Date(f.slice(0, 10) + 'T12:00:00').getDay() === dow) return f; } };
module.exports = { arrancar, fecha, cedula, proximoDia };
