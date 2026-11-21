// Prueba de la interfaz con un navegador simulado (jsdom): entrar, caída del internet, citas sin confirmar, reconexión, choques.
// jsdom NO es dependencia del proyecto. Instalar solo para esta prueba:  npm i --no-save jsdom   y luego   npm run test:ui
const { JSDOM } = require('jsdom'), { spawn } = require('node:child_process'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), assert = require('node:assert/strict');
const PROY = path.join(__dirname, '..'), { cedula } = require(path.join(PROY, 'tests', 'helpers.js'));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smk-')), PORT = 4990 + Math.floor(Math.random() * 9), BASE = `http://127.0.0.1:${PORT}`;
const esperar = async (f, ms = 5000, msg = 'condición') => { const t = Date.now(); while (Date.now() - t < ms) { try { const r = f(); if (r) return r; } catch {} await new Promise(r => setTimeout(r, 30)); } throw new Error('Tiempo agotado esperando: ' + msg); };
const manana = () => { const d = new Date(Date.now() + 864e5); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
let ok = 0; const paso = (t) => { ok++; console.log('  ✓', t); };

async function main() {
  const srv = spawn(process.execPath, ['server.js'], { cwd: PROY, env: { ...process.env, PORT: String(PORT), VIKA_HOST: '127.0.0.1', VIKA_DB: dir + '/s.db', VIKA_BACKUPS: dir + '/c' } });
  let salida = ''; srv.stdout.on('data', d => salida += d); srv.stderr.on('data', d => salida += d);
  await esperar(() => /Vika lista/.test(salida), 8000, 'servidor'); const PIN = /PIN inicial de [^:]+: (\d{6})/.exec(salida)[1];
  let internet = true, jar = {};
  const mkFetch = () => async (u, o = {}) => {
    if (!internet) throw new TypeError('fetch failed');
    const ck = Object.entries(jar).map(([k, v]) => k + '=' + v).join('; ');
    const r = await fetch(new URL(u, BASE), { ...o, headers: { ...(o.headers || {}), ...(ck ? { cookie: ck } : {}) } });
    for (const c of r.headers.getSetCookie()) { const [kv] = c.split(';'), [k, v] = kv.split('='); if (v) jar[k] = v; else delete jar[k]; }
    return r;
  };
  const otroEquipo = (u, o = {}) => fetch(new URL(u, BASE), { ...o, headers: { ...(o.headers || {}), cookie: Object.entries(jar).map(([k, v]) => k + '=' + v).join('; ') } });   // otro computador que SÍ tiene internet
  const abrir = (extra = {}) => JSDOM.fromURL(BASE, { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, beforeParse(w) {
    w.fetch = mkFetch(); w.confirm = () => true; w.alert = () => {}; Object.defineProperty(w.navigator, 'onLine', { get: () => internet, configurable: true });
    w.HTMLElement.prototype.scrollIntoView = () => {}; if (extra.antes) extra.antes(w); } });
  const q = (w, s) => w.document.querySelector(s), qa = (w, s) => [...w.document.querySelectorAll(s)];
  const clic = (w, el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  const escribir = (w, el, v) => { el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); el.dispatchEvent(new w.Event('change', { bubbles: true })); };
  const nav = (w, v) => clic(w, q(w, `nav [data-v=${v}]`));
  const vista = w => q(w, '#vista').textContent;

  // ---------- 1. Entrar como doctora
  const dom = await abrir(), w = dom.window;
  await esperar(() => qa(w, '#vista button').some(b => /Paredes/.test(b.textContent)), 8000, 'pantalla de acceso'); paso('carga la pantalla de acceso');
  clic(w, qa(w, '#vista button').find(b => /Paredes/.test(b.textContent)));
  const pin = await esperar(() => q(w, '#vista input[type=password]'), 3000, 'campo PIN'); pin.value = PIN; clic(w, qa(w, '#vista button').find(b => b.textContent === 'Entrar'));
  await esperar(() => !q(w, 'nav').hidden && /¿Qué desea hacer/.test(vista(w)), 8000, 'inicio tras entrar'); paso('entra con PIN y muestra las acciones principales');
  nav(w, 'agendar'); await esperar(() => qa(w, '.hora').length, 8000, 'agenda tras entrar'); paso('abre Agendar cita y carga las horas');
  const pacientePrueba = await (await mkFetch()('/api/pacientes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nombre: 'Teclado Prueba', tipo_doc: 'cedula', documento: cedula(321) }) })).json(); assert.ok(pacientePrueba.id);
  const buscarPac = q(w, '#vista input[aria-label="Buscar paciente"]'); escribir(w, buscarPac, 'Teclado'); const opcion = await esperar(() => q(w, '#resultados-paciente [role=option]'), 4000, 'resultado teclado'); opcion.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); assert.equal(opcion.getAttribute('aria-selected'), 'true');
  paso('selecciona resultado de paciente con Enter y actualiza aria-selected');
  assert.equal(q(w, 'nav [data-v=ajustes]').hidden, false); assert.equal(q(w, 'nav [data-v=pend]').hidden, true); assert.equal(q(w, '#mipin').hidden, false); paso('doctora ve Ajustes; "Sin confirmar" oculto mientras no hay nada');
  await esperar(() => w.localStorage.getItem('vika_agenda'), 5000, 'agenda guardada para trabajar sin internet'); assert.ok(w.localStorage.getItem('vika_cat') && w.localStorage.getItem('vika_yo')); paso('guarda catálogo, identidad y agenda para trabajar sin internet');
  await esperar(() => /Ajustes ⚠/.test(q(w, 'nav [data-v=ajustes]').textContent), 3000, 'aviso de copia externa'); paso('avisa a la doctora que no hay copia externa');

  // ---------- 2. Se cae el internet: agendar sin conexión
  internet = false; w.dispatchEvent(new w.Event('offline'));
  assert.equal(q(w, '#offline').hidden, false); assert.match(q(w, '#offline').textContent, /SIN CONFIRMAR/); nav(w, 'agendar');
  await esperar(() => /Guardar SIN confirmar/.test(vista(w)) && /Sin internet/.test(vista(w)), 3000, 'formulario sin internet'); paso('sin internet: aparece el formulario con el aviso SIN CONFIRMAR');
  escribir(w, q(w, '#fe'), manana()); await esperar(() => qa(w, '.hora:not(:disabled)').length, 3000, 'horas locales'); paso('muestra horas desde la agenda guardada');
  const botonOk = () => qa(w, '#vista button').find(b => /Guardar SIN confirmar/.test(b.textContent)), inputs = () => [...qa(w, '#vista section')[1].querySelectorAll('input')]; 
  const hora1 = qa(w, '.hora:not(:disabled)')[0]; clic(w, hora1); const horaTxt = hora1.textContent;
  escribir(w, inputs()[0], 'Elena Torres'); escribir(w, inputs()[1], '1234567890'); assert.equal(botonOk().disabled, false);
  clic(w, botonOk()); await esperar(() => /cédula no es válida/.test(q(w, '#aviso').textContent), 2000, 'rechazo de cédula mala'); assert.equal(JSON.parse(w.localStorage.getItem('vika_cola') || '[]').length, 0); paso('una cédula mal escrita se rechaza al momento (no se guarda)');
  escribir(w, inputs()[1], cedula(777)); clic(w, botonOk());
  await esperar(() => JSON.parse(w.localStorage.getItem('vika_cola') || '[]').length === 1, 3000, 'cita en cola'); paso('guarda la cita en la cola de este equipo');
  assert.equal(q(w, '#pendientes').hidden, false); assert.match(q(w, '#pendientes').textContent, /1 cita\(s\) SIN CONFIRMAR/); assert.equal(q(w, 'nav [data-v=pend]').hidden, false); paso('barra y botón "Sin confirmar (1)" visibles');
  escribir(w, q(w, '#fe'), manana()); await esperar(() => qa(w, '.hora').find(b => b.textContent === horaTxt && b.disabled), 3000, 'hora apartada'); paso('esa hora queda tachada localmente (no se puede doblar en este equipo)');
  nav(w, 'citas'); escribir(w, q(w, '#vista input[type=date]'), manana()); await esperar(() => /SIN CONFIRMAR/.test(vista(w)) && /Elena Torres/.test(vista(w)), 3000, 'cita pendiente en citas del día'); paso('"Citas del día" muestra la pendiente marcada SIN CONFIRMAR');
  nav(w, 'pend'); await esperar(() => /Esperando conexión/.test(vista(w)), 2000); assert.match(vista(w), /NO están confirmadas/); paso('vista "Sin confirmar" explica que todavía NO está confirmada');

  // ---------- 3. Vuelve el internet: se sincroniza sola
  internet = true; w.dispatchEvent(new w.Event('online'));
  await esperar(() => JSON.parse(w.localStorage.getItem('vika_cola') || '[]').length === 0, 6000, 'sincronización'); await esperar(() => /confirmada/.test(q(w, '#aviso').textContent), 2000);
  assert.equal(q(w, '#pendientes').hidden, true); assert.equal(q(w, '#offline').hidden, true); paso('al volver el internet se envía sola, se vacía la cola y se ocultan los avisos');
  const dia = await (await mkFetch()('/api/citas?fecha=' + manana())).json(), c = dia.find(x => x.paciente === 'Elena Torres'); assert.ok(c); assert.equal(c.origen, 'offline'); paso('la cita quedó confirmada en el servidor, marcada como registrada sin internet');

  // ---------- 4. Choque: alguien tomó la hora mientras no había internet
  internet = false; w.dispatchEvent(new w.Event('offline')); nav(w, 'agendar'); await esperar(() => /Guardar SIN confirmar/.test(vista(w)), 3000);
  escribir(w, q(w, '#fe'), manana()); await esperar(() => qa(w, '.hora:not(:disabled)').length, 3000); const h2 = qa(w, '.hora:not(:disabled)')[0], h2t = h2.textContent, med = q(w, '#me').value, cli = q(w, '#cl').value; clic(w, h2);
  escribir(w, inputs()[0], 'Paciente Perdedor'); escribir(w, inputs()[1], cedula(888)); clic(w, botonOk()); await esperar(() => JSON.parse(w.localStorage.getItem('vika_cola') || '[]').length === 1, 3000);
  const hecho = await (await otroEquipo('/api/pacientes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nombre: 'Paciente Ganador', tipo_doc: 'cedula', documento: cedula(889) }) })).json();   // (sin internet para la página; el otro equipo sí)
  const otro = await (await otroEquipo('/api/citas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paciente_id: hecho.id, medico_id: +med, clinica_id: +cli, inicio: `${manana()}T${h2t}` }) })).json(); assert.ok(otro.id);
  internet = true; w.dispatchEvent(new w.Event('online'));
  await esperar(() => JSON.parse(w.localStorage.getItem('vika_cola') || '[]')[0]?.estado === 'conflicto', 6000, 'conflicto detectado'); paso('el choque se detecta: la cita NO se pierde ni se da por confirmada');
  assert.match(q(w, '#pendientes').textContent, /necesita/); nav(w, 'pend'); await esperar(() => /ya fue tomada/.test(vista(w)) && qa(w, '#vista .hora').length >= 3, 3000, 'alternativas'); paso('muestra el motivo y horas alternativas para elegir');
  clic(w, qa(w, '#vista .hora')[0]); await esperar(() => JSON.parse(w.localStorage.getItem('vika_cola') || '[]').length === 0, 6000, 'reprogramada'); await esperar(() => /No hay citas sin confirmar/.test(vista(w)), 3000); paso('al elegir otra hora se confirma y la cola queda vacía');

  // ---------- 5. Ajustes de la doctora
  nav(w, 'ajustes'); await esperar(() => /Copias de seguridad/.test(vista(w)) && /Horarios/.test(vista(w)) && /Médicos/.test(vista(w)) && /Importar datos/.test(vista(w)), 5000, 'ajustes');
  assert.match(vista(w), /no configurada/); assert.match(vista(w), /Hacer copia ahora/); paso('Ajustes muestra copias, horarios, médicos e importar');
  clic(w, qa(w, '#vista button').find(b => /Hacer copia ahora/.test(b.textContent))); await esperar(() => /Copia hecha|Copia local/.test(q(w, '#aviso').textContent), 4000); paso('"Hacer copia ahora" funciona');
  const sel = qa(w, '#vista select')[0]; assert.ok(sel.options.length >= 4); paso('lista de médicos para editar horarios');

  // ---------- 6. Acceso de pacientes desde recepción
  nav(w, 'pacientes'); await esperar(() => /Acceso de pacientes/.test(vista(w)), 3000); const busc = qa(w, '#vista input[placeholder*="documento del paciente"]')[0]; escribir(w, busc, 'Teclado');
  await esperar(() => qa(w, '#vista button').some(b => /Activar acceso/.test(b.textContent)), 4000, 'resultado de búsqueda'); clic(w, qa(w, '#vista button').find(b => /Activar acceso/.test(b.textContent)));
  await esperar(() => /PIN de Teclado Prueba/.test(vista(w)), 3000); assert.match(q(w, '.codigo').textContent, /^\d{6}$/); paso('recepción activa el acceso de un paciente y ve el PIN una sola vez');

  // ---------- 7. Abrir la página SIN internet (equipo que ya trabajó antes)
  const guardado = {}; for (const k of ['vika_yo', 'vika_cat', 'vika_agenda']) guardado[k] = w.localStorage.getItem(k);
  internet = false; const dom2 = await JSDOM.fromURL(BASE, { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, beforeParse(x) {
    x.fetch = mkFetch(); x.confirm = () => true; x.alert = () => {}; Object.defineProperty(x.navigator, 'onLine', { get: () => internet, configurable: true });
    for (const [k, v] of Object.entries(guardado)) x.localStorage.setItem(k, v); } });
  const w2 = dom2.window; await esperar(() => /sin conexión/.test(q(w2, '#usuario').textContent) && !q(w2, 'nav').hidden, 8000, 'arranque sin conexión'); paso('abrir la página sin internet: entra en modo "sin conexión" con la identidad guardada');
  await esperar(() => /Guardar SIN confirmar/.test(vista(w2)), 3000); assert.equal(q(w2, '#mipin').hidden, true); assert.equal(q(w2, 'nav [data-v=ajustes]').hidden, true); paso('ofrece agendar sin confirmar; oculta "Mi PIN" y Ajustes (requieren internet)');
  const dom3 = await JSDOM.fromURL(BASE, { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, beforeParse(x) { x.fetch = mkFetch(); x.confirm = () => true; Object.defineProperty(x.navigator, 'onLine', { get: () => internet, configurable: true }); } });
  await esperar(() => /No hay conexión con el sistema/.test(dom3.window.document.querySelector('#vista').textContent), 8000, 'equipo nuevo sin internet'); paso('equipo nuevo sin internet: mensaje claro, sin entrar');
  [dom, dom2, dom3].forEach(d => d.window.close()); srv.kill(); console.log(`\nINTERFAZ: ${ok} comprobaciones OK`); process.exit(0);
}
main().catch(e => { console.error('\nFALLÓ:', e.message); process.exit(1); });
