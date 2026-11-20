const { describe, it, before, after } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), https = require('node:https'), http = require('node:http');
const { spawnSync } = require('node:child_process'), { arrancar } = require('./helpers');
const pedir = (mod, o, cuerpo) => new Promise((ok, no) => { const r = mod.request({ rejectUnauthorized: false, ...o }, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => ok({ status: res.statusCode, h: res.headers, d })); }); r.on('error', no); r.end(cuerpo); });

describe('cabeceras de seguridad (HTTP local)', () => {
  let S; before(async () => { S = await arrancar(); }); after(() => S.cerrar());
  it('la API nunca se guarda en caché y trae protecciones del navegador', async () => {
    const r = await pedir(http, { port: S.puerto, host: '127.0.0.1', path: '/api/auth/usuarios' });
    assert.equal(r.h['cache-control'], 'no-store'); assert.equal(r.h['x-content-type-options'], 'nosniff'); assert.equal(r.h['x-frame-options'], 'DENY'); assert.equal(r.h['referrer-policy'], 'no-referrer');
    assert.match(r.h['content-security-policy'], /default-src 'self'/); assert.match(r.h['content-security-policy'], /frame-ancestors 'none'/); assert.ok(!r.h['strict-transport-security']); });
  it('la página también las lleva; los archivos estáticos se revalidan', async () => {
    const r = await pedir(http, { port: S.puerto, host: '127.0.0.1', path: '/' }); assert.equal(r.status, 200); assert.equal(r.h['cache-control'], 'no-cache'); assert.equal(r.h['x-frame-options'], 'DENY'); });
  it('no se puede leer fuera de la carpeta pública', async () => { for (const p of ['/../server.js', '/..%2Fserver.js', '/../../etc/passwd']) assert.notEqual((await pedir(http, { port: S.puerto, host: '127.0.0.1', path: p })).status, 200, p); });
  it('sin HTTPS la cookie no lleva Secure, pero detrás de un proxy HTTPS sí', async () => {
    const u = (await S.llamar('auth/usuarios')).j[0], cuerpo = JSON.stringify({ id: u.id, pin: S.pin }), o = { port: S.puerto, host: '127.0.0.1', path: '/api/auth/entrar', method: 'POST', headers: { 'Content-Type': 'application/json' } };
    const a = await pedir(http, o, cuerpo); assert.match(a.h['set-cookie'][0], /HttpOnly; SameSite=Strict/); assert.ok(!/Secure/.test(a.h['set-cookie'][0]));
    const b = await pedir(http, { ...o, headers: { ...o.headers, 'x-forwarded-proto': 'https' } }, cuerpo); assert.match(b.h['set-cookie'][0], /; Secure/); assert.match(b.h['strict-transport-security'], /max-age=/); });
  it('solo escucha en este computador por defecto (sin HTTPS no se expone a la red)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-')), { spawn } = require('node:child_process');
    const p = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT: '4871', VIKA_DB: path.join(dir, 'a.db'), VIKA_BACKUPS: path.join(dir, 'c'), VIKA_HOST: '' } });
    const salida = await new Promise(ok => { let t = ''; p.stdout.on('data', d => { t += d; if (/copia de seguridad externa/.test(t)) ok(t); }); setTimeout(() => ok(t), 6000); }); p.kill();
    assert.match(salida, /Vika lista en http:\/\/127\.0\.0\.1:4871/); assert.match(salida, /no hay copia de seguridad externa/); });
});

const hayOpenssl = spawnSync('openssl', ['version']).status === 0;
describe('HTTPS propio', { skip: !hayOpenssl && 'openssl no disponible' }, () => {
  let S, dir;
  before(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tls-'));
    const g = spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', path.join(dir, 'k.pem'), '-out', path.join(dir, 'c.pem'), '-days', '2', '-subj', '/CN=localhost']); assert.equal(g.status, 0);
    S = await arrancar({ VIKA_CERT: path.join(dir, 'c.pem'), VIKA_KEY: path.join(dir, 'k.pem') }, { https: true });
  });
  after(() => S && S.cerrar());
  it('sirve por HTTPS, con cookie Secure y HSTS', async () => {
    const u = (await pedir(https, { port: S.puerto, host: '127.0.0.1', path: '/api/auth/usuarios' })).d, id = JSON.parse(u)[0].id;
    const r = await pedir(https, { port: S.puerto, host: '127.0.0.1', path: '/api/auth/entrar', method: 'POST', headers: { 'Content-Type': 'application/json' } }, JSON.stringify({ id, pin: S.pin }));
    assert.equal(r.status, 200); assert.match(r.h['set-cookie'][0], /; Secure/); assert.match(r.h['strict-transport-security'], /max-age=15552000/); });
  it('por HTTP plano ya no responde', async () => { await assert.rejects(pedir(http, { port: S.puerto, host: '127.0.0.1', path: '/' })); });
});
