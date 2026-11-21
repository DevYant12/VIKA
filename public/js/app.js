// Interfaz de Vika. Todo el texto de la gente se inserta con textContent (evita código inyectado).
const $ = s => document.querySelector(s);
const h = (t, a = {}, ...k) => { const e = document.createElement(t);
  for (const [x, v] of Object.entries(a)) x.startsWith('on') ? e.addEventListener(x.slice(2), v) : x === 'class' ? e.className = v : e.setAttribute(x, v);
  e.append(...k); return e; };
let yo = null;
const quien = () => yo ? yo.nombre : '';
let cat = { clinicas: [], medicos: [] };
// Almacenamiento del navegador (con respaldo en memoria si está bloqueado, p. ej. modo privado)
const store = (() => { try { localStorage.setItem('_t', '1'); localStorage.removeItem('_t'); return localStorage; } catch { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } }; } })();
const leerJson = k => { try { return JSON.parse(store.getItem(k)); } catch { return null; } };
const guardarJson = (k, v) => { try { store.setItem(k, JSON.stringify(v)); } catch {} };
let enLinea = true, vistaActual = '';
const modoSinRed = () => !enLinea || navigator.onLine === false;
function mostrarEstadoRed() {
  const o = $('#offline'); o.hidden = !modoSinRed();
  o.textContent = yo && yo.rol !== 'paciente' ? 'Sin conexión con el sistema. Puede seguir agendando: las citas quedan SIN CONFIRMAR y se envían solas cuando vuelva el internet.' : 'Sin conexión con el sistema. Lo que escriba no se guardará hasta que vuelva el internet.';
}

async function api(url, cuerpo) {
  try {
    const r = await fetch('/api/' + url, cuerpo ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) } : undefined);
    const j = await r.json(); enLinea = true; mostrarEstadoRed(); if (r.status === 401 && yo) { yo = null; login(); } if (Array.isArray(j)) return Object.assign(j, { ok: r.ok, status: r.status }); return { ...j, ok: r.ok, status: r.status };
  } catch { enLinea = false; mostrarEstadoRed(); return { ok: false, sinRed: true, error: 'No hay conexión. No se guardó nada; intente de nuevo cuando vuelva el internet.' }; }
}
let t; function aviso(txt) { const a = $('#aviso'); a.textContent = txt; a.classList.add('ver'); clearTimeout(t); t = setTimeout(() => a.classList.remove('ver'), 5000); }
const hoy = () => new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
const opciones = (lista, f) => lista.map(x => h('option', { value: x.id }, f(x)));

/* ---------- Inicio sencillo para recepción ---------- */
function inicio() {
  const esPac = yo.rol === 'paciente';
  const acciones = [
    ['agendar', '📅', 'Agendar cita', 'Buscar al paciente y reservar una hora disponible.'],
    ['citas', '🗓', 'Consultar citas', 'Ver la agenda de hoy o de otro día.'],
    ['pacientes', '👤', 'Registrar paciente', 'Guardar los datos de una persona nueva.'],
    ['buscar', '🔎', 'Buscar paciente', 'Encontrar una persona y ver su historial administrativo.']
  ].filter(x => !esPac || ['agendar'].includes(x[0]));
  const s = h('section', {}, h('h2', {}, esPac ? '¿Qué desea hacer?' : '¿Qué desea hacer?'), h('p', { class: 'suave' }, 'Elija una opción. Puede volver aquí en cualquier momento.'),
    h('div', { class: 'acciones-principales' }, ...acciones.map(([v, icono, titulo, desc]) => h('button', { class: 'accion-principal', onclick: () => irA(v) }, h('span', { class: 'accion-icono', 'aria-hidden': 'true' }, icono), h('strong', {}, titulo), h('small', {}, desc)))));
  if (!esPac) s.append(h('p', { class: 'suave' }, 'Consejo: las horas tachadas ya están ocupadas. Si otra recepcionista reserva primero, Vika le avisará y podrá escoger otra hora.'));
  $('#vista').replaceChildren(s);
}

function historialPaciente(p) {
  api(`pacientes/${p.id}/citas`).then(r => {
    if (!r.ok) return aviso(r.error || 'No se pudo consultar el historial.');
    const lista = h('div');
    if (!r.citas.length) lista.append(h('p', { class: 'suave' }, 'Este paciente todavía no tiene citas registradas.'));
    (r.citas || []).forEach(c => lista.append(h('div', { class: 'fila' }, h('div', { class: c.estado === 'cancelada' ? 'cancelada' : '' }, h('strong', {}, c.inicio.replace('T', ' ')), h('div', { class: 'suave' }, `${c.medico} · ${c.clinica} · ${c.estado === 'cancelada' ? 'Cancelada' : 'Activa'}${ETQ[c.anticipo] ? ' · ' + ETQ[c.anticipo] : ''}`)))));
    (r.reprogramaciones || []).forEach(x => lista.append(h('div', { class: 'nota' }, `Reprogramada por ${x.quien}: ${x.inicio_anterior.replace('T', ' ')} → ${x.inicio_nuevo.replace('T', ' ')}.`)));
    $('#vista').replaceChildren(h('section', {}, h('h2', {}, 'Historial de ' + p.nombre), h('p', { class: 'suave' }, 'Solo se muestran datos administrativos de citas y anticipos.'), lista, h('button', { class: 'sec', onclick: () => irA('buscar') }, 'Volver a buscar')));
  });
}

function buscar() {
  const bus = h('input', { placeholder: 'Escriba nombre o documento', 'aria-label': 'Buscar paciente' }), rs = h('div');
  bus.addEventListener('input', async () => {
    rs.replaceChildren(); if (bus.value.trim().length < 2) return;
    const r = await api('pacientes?q=' + encodeURIComponent(bus.value));
    if (!Array.isArray(r)) return rs.append(h('p', { class: 'err' }, r.error || 'No se pudo buscar.'));
    if (!r.length) return rs.append(h('p', { class: 'suave' }, 'No encontramos a ese paciente. Revise el nombre o documento.'));
    r.forEach(p => rs.append(h('div', { class: 'fila' }, h('div', {}, h('strong', {}, p.nombre), h('div', { class: 'suave' }, p.documento || 'Sin documento')), h('button', { class: 'sec', onclick: () => historialPaciente(p) }, 'Ver historial'))));
  });
  $('#vista').replaceChildren(h('section', {}, h('h2', {}, 'Buscar paciente'), h('p', { class: 'suave' }, 'Escriba al menos dos letras o parte del documento.'), bus, rs)); bus.focus();
}

/* ---------- Agendar ---------- */
function agendar() {
  const v = $('#vista'); v.replaceChildren();
  const pac = yo.rol === 'paciente', sinRed = !pac && modoSinRed();      // sin internet el personal sigue agendando; queda SIN CONFIRMAR
  let hora = null, paciente = pac ? 1 : null;
  const cl = h('select', { id: 'cl' }, ...opciones(cat.clinicas, x => x.nombre));
  const me = h('select', { id: 'me' }, ...opciones(cat.medicos, x => `${x.nombre} (${x.especialidad})`));
  const fe = h('input', { type: 'date', id: 'fe', min: hoy(), value: hoy() });
  const hs = h('div', { class: 'horas' }), info = h('p', { class: 'suave' }), ok = h('button', { disabled: '' }, pac ? 'Reservar y pagar anticipo' : sinRed ? 'Guardar SIN confirmar' : 'Confirmar cita');
  const bus = h('input', { placeholder: 'Escriba nombre o documento', 'aria-label': 'Buscar paciente', 'aria-autocomplete': 'list', 'aria-controls': 'resultados-paciente' }), rs = h('div', { id: 'resultados-paciente', role: 'listbox', 'aria-label': 'Resultados de pacientes' });
  const acepta = h('input', { type: 'checkbox', 'aria-label': 'Acepto los términos' }); acepta.addEventListener('change', () => estado());
  const fp = { nombre: h('input', { 'aria-label': 'Nombre completo' }), tipo_doc: h('select', {}, h('option', { value: 'cedula' }, 'Cédula'), h('option', { value: 'pasaporte' }, 'Pasaporte'), h('option', { value: 'sin_documento' }, 'Todavía no tiene documento')),
    documento: h('input', { 'aria-label': 'Número de documento' }), telefono: h('input', { type: 'tel', 'aria-label': 'Teléfono' }) };
  const pacienteOffline = () => ({ nombre: fp.nombre.value.trim(), tipo_doc: fp.tipo_doc.value, documento: fp.documento.value.trim(), telefono: fp.telefono.value.trim() });
  const estado = () => ok.disabled = !(hora && (sinRed ? fp.nombre.value.trim().length >= 2 : paciente) && (!pac || acepta.checked));
  Object.values(fp).forEach(e => e.addEventListener('input', estado));
  const botonHora = x => { const b = h('button', { class: 'hora', type: 'button', ...(x.libre ? {} : { disabled: '' }), onclick: () => { hora = x.hora; hs.querySelectorAll('button').forEach(y => y.classList.remove('sel')); b.classList.add('sel'); estado(); } }, x.hora); return b; };

  function horasLocales() {                                               // sin internet: horarios guardados en este equipo, menos lo ocupado y lo ya apartado
    hs.replaceChildren(); info.textContent = ''; const ag = leerJson(Cola.KA);
    if (!ag) return hs.append(h('p', { class: 'err' }, 'Este equipo todavía no tiene la agenda guardada. Hace falta internet al menos una vez para poder trabajar sin conexión.'));
    if (fe.value > ag.hasta) return hs.append(h('p', { class: 'err' }, `Sin internet solo se puede agendar hasta el ${ag.hasta}.`));
    const r = Cola.libres({ agenda: ag, cola: Cola.leer(store), clinica: +cl.value, medico: +me.value, fecha: fe.value });
    if (!r.length) return hs.append(h('p', { class: 'suave' }, 'Este médico no atiende en esa clínica ese día.'));
    r.forEach(x => hs.append(botonHora(x))); info.textContent = `Horas según la última conexión (${ag.generado.replace('T', ' ')}); pueden haber cambiado.`;
  }
  async function cargarHoras() {
    hora = null; estado(); if (sinRed) return horasLocales();
    hs.replaceChildren(...Array.from({ length: 8 }, () => h('div', { class: 'sk' })));
    const r = await api(`disponibilidad?clinica=${cl.value}&medico=${me.value}&fecha=${fe.value}`);
    if (r.sinRed && !pac) return agendar();                               // se cayó el internet: pasar al modo sin conexión
    hs.replaceChildren(); if (!r.ok) return hs.append(h('p', { class: 'err' }, r.error));
    r.forEach(x => hs.append(botonHora(x)));
  }
  [cl, me, fe].forEach(e => e.addEventListener('change', cargarHoras));

  bus.addEventListener('input', async () => {
    paciente = null; estado(); rs.replaceChildren(); if (bus.value.trim().length < 2) return;
    const r = await api('pacientes?q=' + encodeURIComponent(bus.value));
    if (!Array.isArray(r)) return rs.append(h('p', { class: 'err' }, r.error || ''));
    if (!r.length) rs.append(h('p', { class: 'suave' }, 'No hay pacientes con ese dato. Use "Nuevo paciente" para registrarlo.'));
    r.forEach(p => {
      const elegir = () => { paciente = p.id; rs.querySelectorAll('.res').forEach(y => { y.classList.remove('sel'); y.setAttribute('aria-selected', 'false'); }); d.classList.add('sel'); d.setAttribute('aria-selected', 'true'); estado(); };
      const d = h('div', { class: 'res', tabindex: '0', role: 'option', 'aria-selected': 'false', onclick: elegir, onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); elegir(); } } },
        h('strong', {}, p.nombre), h('div', { class: 'suave' }, [p.documento, p.nacimiento && 'nac. ' + p.nacimiento].filter(Boolean).join(' · ') || 'Sin documento'));
      rs.append(d);
    });
  });

  ok.addEventListener('click', async () => {
    if (!quien()) return aviso('Escriba su nombre arriba, en "Usted es".');
    if (sinRed) {
      const p = pacienteOffline(), err = Cola.validarPaciente(p); if (err) return aviso(err);
      if (p.tipo_doc !== 'sin_documento' && !p.documento) return aviso('Escriba el número de documento, o elija "Todavía no tiene documento".');
      Cola.encolar(store, { medico_id: +me.value, clinica_id: +cl.value, inicio: `${fe.value}T${hora}`, paciente: p, medico_nombre: me.selectedOptions[0].textContent, clinica_nombre: cl.selectedOptions[0].textContent, quien: quien() });
      aviso('Guardada SIN confirmar. Se enviará sola cuando vuelva el internet.'); actualizarPend(); sincronizarCola(); return agendar();
    }
    ok.disabled = true;
    const r = await api('citas', { paciente_id: paciente, medico_id: +me.value, clinica_id: +cl.value, inicio: `${fe.value}T${hora}`, quien: quien(), acepta_terminos: acepta.checked });
    if (r.ok) { if (pac) return pagar(r); aviso(r.repetida ? 'Esa cita ya estaba guardada.' : 'Cita guardada.'); agendar(); } else { aviso(r.error); cargarHoras(); }
  });

  const seccionPac = sinRed ? h('section', {}, h('h2', {}, '2. Datos del paciente'), h('p', { class: 'suave' }, 'Sin internet no se puede buscar en el registro: escriba los datos. Si ya está registrado, el sistema lo reconoce por su documento.'),
      h('label', {}, 'Nombre completo'), fp.nombre, h('label', {}, 'Documento'), fp.tipo_doc, h('label', {}, 'Número de documento'), fp.documento, h('label', {}, 'Teléfono (opcional)'), fp.telefono)
    : h('section', {}, h('h2', {}, '2. ¿Para quién?'), bus, rs);
  v.append(...(sinRed ? [h('div', { class: 'nota' }, '⚠ Sin internet. Esta cita quedará SIN CONFIRMAR hasta que vuelva la conexión. Avise al paciente que se le confirmará, o que se le llamará si la hora ya no está disponible.')] : []),
    h('section', {}, h('h2', {}, '1. ¿Dónde, con quién y cuándo?'),
      h('label', {}, 'Clínica'), cl, h('label', {}, 'Médico'), me, h('label', {}, 'Fecha'), fe,
      h('label', {}, 'Hora (las tachadas ya no están libres)'), hs, info),
    pac ? terminosSeccion(acepta) : seccionPac, ok);
  cargarHoras();
}

async function reprogramarCita(c) {
  const cl = h('select', {}, ...opciones(cat.clinicas, x => x.nombre)); cl.value = cat.clinicas.find(x => x.nombre === c.clinica)?.id || cat.clinicas[0]?.id;
  const me = h('select', {}, ...opciones(cat.medicos, x => `${x.nombre} (${x.especialidad})`)); me.value = cat.medicos.find(x => x.nombre === c.medico)?.id || cat.medicos[0]?.id;
  const fe = h('input', { type: 'date', min: hoy(), value: c.inicio.slice(0, 10) }), hs = h('div', { class: 'horas' }), info = h('p', { class: 'suave' });
  let hora = c.inicio.slice(11, 16);
  const cargar = async () => {
    hs.replaceChildren(); hora = null;
    const r = await api(`disponibilidad?clinica=${cl.value}&medico=${me.value}&fecha=${fe.value}`);
    if (!r.ok) return hs.append(h('p', { class: 'err' }, r.error));
    const esCitaActual = fe.value === c.inicio.slice(0, 10) && String(me.value) === String(cat.medicos.find(x => x.nombre === c.medico)?.id) && String(cl.value) === String(cat.clinicas.find(x => x.nombre === c.clinica)?.id);
    r.forEach(x => hs.append(h('button', { class: 'hora' + (esCitaActual && x.hora === c.inicio.slice(11, 16) ? ' sel' : ''), disabled: !x.libre && !(esCitaActual && x.hora === c.inicio.slice(11, 16)), onclick: e => { hora = x.hora; hs.querySelectorAll('.hora').forEach(b => b.classList.remove('sel')); e.currentTarget.classList.add('sel'); } }, x.hora)));
    info.textContent = 'Seleccione una hora libre. La cita actual no se pierde si cancela.';
  };
  [cl, me, fe].forEach(x => x.addEventListener('change', cargar));
  const guardar = h('button', { onclick: async () => {
    if (!hora) return aviso('Seleccione una hora disponible.');
    if (!confirm(`¿Reprogramar la cita de ${c.paciente} para el ${fe.value} a las ${hora}?`)) return;
    const r = await api(`citas/${c.id}/reprogramar`, { inicio: `${fe.value}T${hora}`, medico_id: +me.value, clinica_id: +cl.value });
    aviso(r.ok ? 'Cita reprogramada. El anticipo y el historial se conservaron.' : r.error); if (r.ok) irA('citas');
  } });
  $('#vista').replaceChildren(h('section', {}, h('h2', {}, 'Reprogramar cita'), h('p', { class: 'suave' }, `${c.paciente} · cita actual: ${c.inicio.replace('T', ' ')}`), h('label', {}, 'Nueva clínica'), cl, h('label', {}, 'Nuevo médico'), me, h('label', {}, 'Nueva fecha'), fe, h('label', {}, 'Nueva hora'), hs, info, guardar, ' ', h('button', { class: 'sec', onclick: () => irA('citas') }, 'Volver')));
  cargar();
}

/* ---------- Citas del día ---------- */
async function citas() {
  const v = $('#vista'), fe = h('input', { type: 'date', value: hoy(), 'aria-label': 'Fecha' }), lista = h('div');
  async function cargar() {
    const r = await api('citas?fecha=' + fe.value); lista.replaceChildren();
    const locales = Cola.leer(store).filter(i => i.inicio.slice(0, 10) === fe.value);        // guardadas sin internet y aún sin confirmar
    locales.forEach(i => lista.append(h('div', { class: 'fila' }, h('div', {}, h('strong', {}, `${i.inicio.slice(11)} · ${i.paciente.nombre}`), h('div', { class: 'suave' }, `${i.medico_nombre} · ${i.clinica_nombre} · ⏳ SIN CONFIRMAR${i.estado !== 'pendiente' ? ' (necesita atención)' : ''}`)))));
    if (!Array.isArray(r)) return lista.append(h('p', { class: 'err' }, r.sinRed ? 'Sin conexión: no se pueden ver las citas ya confirmadas.' : r.error));
    if (!r.length && !locales.length) return lista.append(h('p', { class: 'suave' }, 'No hay citas este día. Use "Agendar cita" para crear la primera.'));
    r.forEach(c => lista.append(h('div', { class: 'fila' },
      h('div', { class: c.estado === 'cancelada' ? 'cancelada' : '' }, h('strong', {}, c.inicio.slice(11) + ' · ' + c.paciente), h('div', { class: 'suave' }, `${c.medico} · ${c.clinica}${ETQ[c.anticipo] ? ' · ' + ETQ[c.anticipo] : ''}${c.origen === 'offline' ? ' · registrada sin internet' : ''}`)),
      c.estado === 'agendada' ? h('div', {}, h('button', { class: 'sec', onclick: () => reprogramarCita(c) }, 'Reprogramar'), ' ', h('button', { class: 'peligro', onclick: async () => {
        if (!quien()) return aviso('Escriba su nombre arriba, en "Usted es".');
        if (!confirm(`¿Cancelar la cita de ${c.paciente} a las ${c.inicio.slice(11)}?`)) return;
        const x = await api(`citas/${c.id}/cancelar`, { quien: quien() }); aviso(x.ok ? (x.aviso || 'Cita cancelada. La hora quedó libre.') : x.error); cargar();
      } }, 'Cancelar')) : h('button', { class: 'sec', onclick: async () => { const x = await api(`citas/${c.id}/reactivar`, {}); aviso(x.ok ? (x.aviso || 'Cita reactivada.') : x.error); cargar(); } }, 'Reactivar'), (yo.rol === 'doctora' && c.anticipo === 'retenido') ? h('button', { class: 'sec', onclick: async () => { if (!confirm('¿Devolver el anticipo a este paciente?')) return; const x = await api(`citas/${c.id}/devolver-anticipo`, {}); aviso(x.ok ? 'Anticipo devuelto.' : x.error); cargar(); } }, 'Devolver anticipo') : '')));
  }
  fe.addEventListener('change', cargar); v.replaceChildren(h('section', {}, h('h2', {}, 'Citas del día'), fe, lista)); cargar();
}

/* ---------- Nuevo paciente ---------- */
function pacientes() {
  const campos = [['nombre', 'Nombre completo', 'text'], ['tipo_doc', 'Documento', 'select'], ['documento', 'Número de documento', 'text'],
    ['telefono', 'Teléfono (opcional)', 'tel'], ['email', 'Correo (opcional)', 'email'], ['nacimiento', 'Fecha de nacimiento (opcional)', 'date']];
  const f = h('section', {}, h('h2', {}, 'Nuevo paciente')), el = {}, er = {};
  campos.forEach(([k, et, tipo]) => {
    el[k] = tipo === 'select' ? h('select', {}, h('option', { value: 'cedula' }, 'Cédula'), h('option', { value: 'pasaporte' }, 'Pasaporte'), h('option', { value: 'sin_documento' }, 'Todavía no tiene documento')) : h('input', { type: tipo, ...(k === 'nacimiento' ? { max: hoy() } : {}) });
    er[k] = h('div', { class: 'err' }); f.append(h('label', {}, et), el[k], er[k]);
  });
  const guardar = async forzar => {
    if (!quien()) return aviso('Escriba su nombre arriba, en "Usted es".');
    Object.values(er).forEach(x => x.textContent = '');
    const d = { quien: quien(), forzar }; campos.forEach(([k]) => d[k] = el[k].value);
    const r = await api('pacientes', d);
    if (r.ok) { aviso(`Paciente ${r.nombre} guardado.`); pacientes(); }
    else if (r.errores) Object.entries(r.errores).forEach(([k, m]) => er[k].textContent = m);   // se conserva lo escrito
    else if (r.posible_duplicado) { if (confirm(r.error + '\n\n' + r.existentes.map(x => `• ${x.nombre} ${x.nacimiento || ''}`).join('\n') + '\n\n¿Es una persona distinta? Aceptar = guardar igual.')) guardar(true); }
    else aviso(r.error);
  };
  f.append(h('p'), h('button', { onclick: () => guardar(false) }, 'Guardar paciente'));
  $('#vista').replaceChildren(f, accesoPacientes());
}

/* ---------- Acceso de pacientes (personal) ---------- */
function accesoPacientes() {
  const bus = h('input', { placeholder: 'Nombre o documento del paciente', 'aria-label': 'Buscar paciente' }), rs = h('div'), caja = h('div');
  bus.addEventListener('input', async () => {
    rs.replaceChildren(); caja.replaceChildren(); if (bus.value.trim().length < 2) return;
    const r = await api('pacientes?q=' + encodeURIComponent(bus.value)); if (!Array.isArray(r)) return rs.append(h('p', { class: 'err' }, r.error || ''));
    r.forEach(p => rs.append(h('div', { class: 'fila' }, h('div', {}, h('strong', {}, p.nombre), h('div', { class: 'suave' }, (p.documento || 'Sin documento') + (p.tiene_cuenta ? ' · ya tiene acceso' : ''))),
      p.documento ? h('button', { class: 'sec', onclick: async () => {
        if (!confirm(`Antes de continuar: verifique en persona la cédula o el pasaporte de ${p.nombre}. ¿Ya lo verificó?`)) return;
        const x = await api(`pacientes/${p.id}/acceso`, {}); if (!x.ok) return aviso(x.error);
        caja.replaceChildren(h('section', {}, h('h2', {}, 'PIN de ' + x.nombre), h('p', { class: 'codigo' }, x.pin), h('p', { class: 'suave' }, 'Se muestra una sola vez. Entréguelo en persona; el paciente puede cambiarlo en "Mi PIN". Si ya tenía PIN, el anterior dejó de servir.'))); bus.value = ''; rs.replaceChildren();
      } }, p.tiene_cuenta ? 'PIN nuevo' : 'Activar acceso') : h('span', { class: 'suave' }, 'Falta documento'))));
  });
  return h('section', {}, h('h2', {}, 'Acceso de pacientes'), h('p', { class: 'suave' }, 'Para que un paciente ya registrado agende por su cuenta, o si olvidó su PIN.'), bus, rs, caja);
}

/* ---------- Citas sin confirmar (hechas sin internet) ---------- */
const etiquetaHora = a => new Date(a).toLocaleDateString('es-EC', { weekday: 'short', day: 'numeric', month: 'short' }) + ' · ' + a.slice(11);
function pendientes() {
  const cola = Cola.leer(store), lista = h('div');
  const tras = async () => { await sincronizarCola(); pendientes(); };
  if (!cola.length) lista.append(h('p', { class: 'suave' }, 'No hay citas sin confirmar. Todo lo que se agendó ya está en el sistema.'));
  cola.forEach(i => {
    const cab = h('div', {}, h('strong', {}, `${etiquetaHora(i.inicio)} · ${i.paciente.nombre}`), h('div', { class: 'suave' }, `${i.medico_nombre} · ${i.clinica_nombre} · agendada ${i.creada_en.replace('T', ' ')} por ${i.quien || '—'}`));
    const descartar = h('button', { class: 'peligro', onclick: () => { if (!confirm('¿Descartar esta cita? El paciente NO tendrá cita en el sistema.')) return; Cola.descartar(store, i.cliente_id); actualizarPend(); pendientes(); } }, 'Descartar');
    const caja = h('section', {}, cab);
    if (i.estado === 'pendiente') caja.append(h('div', { class: 'nota' }, '⏳ Esperando conexión. Todavía NO está confirmada.'), descartar);
    else if (i.estado === 'conflicto') caja.append(h('div', { class: 'nota mal' }, i.mensaje), h('p', { class: 'suave' }, 'Elija otra hora para este paciente:'),
      h('div', { class: 'horas' }, ...(i.alternativas || []).map(a => h('button', { class: 'hora', onclick: () => { Cola.reprogramar(store, i.cliente_id, a); tras(); } }, etiquetaHora(a)))), h('p'), descartar);
    else if (i.estado === 'revisar') caja.append(h('div', { class: 'nota mal' }, i.mensaje), ...(i.existentes || []).map(e => h('p', {}, h('button', { class: 'sec', onclick: () => { Cola.decidir(store, i.cliente_id, { paciente_id: e.id }); tras(); } }, `Es la misma persona: ${e.nombre}${e.nacimiento ? ' (' + e.nacimiento + ')' : ''}`))),
      h('p', {}, h('button', { class: 'sec', onclick: () => { Cola.decidir(store, i.cliente_id, {}); tras(); } }, 'Es otra persona (crear nuevo paciente)')), descartar);
    else caja.append(h('div', { class: 'nota mal' }, i.mensaje || 'No se pudo confirmar.'), h('button', { class: 'sec', onclick: () => { Cola.reintentar(store, i.cliente_id); tras(); } }, 'Reintentar'), ' ', descartar);
    lista.append(caja);
  });
  $('#vista').replaceChildren(h('section', {}, h('h2', {}, 'Citas sin confirmar'), h('p', { class: 'suave' }, 'Se guardaron en este equipo cuando no había internet. NO están confirmadas hasta que el sistema las acepte.' + (modoSinRed() ? ' Ahora no hay conexión.' : '')),
    h('button', { class: 'sec', onclick: tras }, 'Enviar ahora')), lista);
}
function actualizarPend() {
  const r = Cola.resumen(Cola.leer(store)), staff = !!yo && yo.rol !== 'paciente', bar = $('#pendientes'), nb = document.querySelector('[data-v=pend]');
  bar.hidden = nb.hidden = !(staff && r.total); nb.textContent = `Sin confirmar (${r.total})`; bar.replaceChildren();
  if (!bar.hidden) bar.append(`⏳ ${r.total} cita(s) SIN CONFIRMAR guardada(s) en este equipo. ${r.con_problema ? r.con_problema + ' necesita(n) su atención. ' : ''}`, h('button', { class: 'sec', onclick: () => irA('pend') }, 'Ver'));
  pill(document.querySelector('nav button.on'));
}
let sincronizando = false;
async function sincronizarCola() {
  if (sincronizando || !yo || yo.rol === 'paciente' || !Cola.resumen(Cola.leer(store)).pendientes) return;
  sincronizando = true; const antes = Cola.resumen(Cola.leer(store)).con_problema;
  try {
    const r = await Cola.sincronizar(store, async it => { const x = await fetch('/api/citas/sincronizar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(it) }); const j = await x.json().catch(() => ({})); return { ...j, status: x.status }; });
    enLinea = !r.sinRed; mostrarEstadoRed();
    if (r.confirmadas.length) { aviso(`${r.confirmadas.length} cita(s) confirmada(s) y guardada(s) en el sistema.`); refrescarAgenda(); }
    if (!r.sesion) { aviso('Su sesión venció. Entre de nuevo: las citas guardadas se enviarán solas.'); yo = null; login(); }
    else if (Cola.resumen(Cola.leer(store)).con_problema > antes) aviso('Hay citas que necesitan su atención: vea "Sin confirmar".');
  } finally { sincronizando = false; actualizarPend(); if (vistaActual === 'pend' && yo) pendientes(); }
}
async function refrescarAgenda() { if (!yo || yo.rol === 'paciente' || modoSinRed()) return; const r = await api('agenda-offline?dias=7'); if (r.ok) guardarJson(Cola.KA, { generado: r.generado, desde: r.desde, hasta: r.hasta, horarios: r.horarios, ocupadas: r.ocupadas }); }
addEventListener('online', () => { enLinea = true; mostrarEstadoRed(); sincronizarCola(); refrescarAgenda(); });
addEventListener('offline', () => { enLinea = false; mostrarEstadoRed(); });
setInterval(() => { sincronizarCola(); }, 20000); setInterval(refrescarAgenda, 300000);

/* ---------- Navegación ---------- */
const vistas = { inicio, agendar, citas, pacientes, buscar, equipo, mis: misCitas, pend: pendientes, ajustes: () => window.ajustesVista && window.ajustesVista() };
document.querySelectorAll('nav button').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('nav button').forEach(x => x.classList.toggle('on', x === b)); pill(b); vistaActual = b.dataset.v; vistas[b.dataset.v]();
}));

/* ---------- Acceso con PIN ---------- */
const campoPin = l => h('input', { type: 'password', inputmode: 'numeric', maxlength: '6', autocomplete: 'off', 'aria-label': l });
const irA = v => document.querySelector(`[data-v=${v}]`).click();

async function login() {
  $('nav').hidden = true; $('#sesion').hidden = true;
  const us = await api('auth/usuarios'), caja = h('section', {}, h('h2', {}, 'Acceso del personal'), h('p', { class: 'suave' }, 'Doctora y recepción: seleccione su nombre para entrar con su PIN.'));
  if (!Array.isArray(us)) caja.append(h('p', { class: 'err' }, us.sinRed ? 'No hay conexión con el sistema. Para entrar por primera vez en este equipo hace falta internet.' : us.error));
  else us.forEach(x => caja.append(h('p', {}, h('button', { class: 'sec', style: 'width:100%', onclick: () => pedirPin(x) }, x.nombre))));
  $('#vista').replaceChildren(seccionPaciente(), caja);
}
function pedirPin(x) {
  const pin = campoPin('PIN de 6 números');
  const entrar = async () => { const r = await api('auth/entrar', { id: x.id, pin: pin.value }); pin.value = ''; r.ok ? iniciar(r) : aviso(r.error); };
  pin.addEventListener('keydown', e => e.key === 'Enter' && entrar());
  $('#vista').replaceChildren(h('section', {}, h('h2', {}, 'Hola, ' + x.nombre), h('label', {}, 'Escriba su PIN (6 números)'), pin, h('p'),
    h('button', { onclick: entrar }, 'Entrar'), ' ', h('button', { class: 'sec', onclick: login }, 'Cambiar de persona')));
  pin.focus();
}
async function iniciar(u, o = {}) {
  yo = { nombre: u.nombre, rol: u.rol }; const pac = yo.rol === 'paciente';
  const c = o.sinRed ? { sinRed: true } : await api('catalogos'); if (c.sinRed) cat = leerJson('vika_cat') || cat; else { cat = c; if (!pac) guardarJson('vika_cat', c); }
  if (!pac && !o.sinRed) { guardarJson('vika_yo', yo); refrescarAgenda(); }
  $('nav').hidden = false; $('#sesion').hidden = false; $('#usuario').textContent = `${yo.nombre} (${{ doctora: 'doctora', recepcion: 'recepción', paciente: 'paciente' }[yo.rol]})${o.sinRed ? ' · sin conexión' : ''}`;
  const tamano = store.getItem('vika_tamano_' + yo.nombre) || 'normal'; document.body.dataset.tamano = tamano; $('#tamano').value = tamano;
  document.querySelector('[data-v=equipo]').hidden = yo.rol !== 'doctora' || !!o.sinRed; document.querySelector('[data-v=ajustes]').hidden = yo.rol !== 'doctora' || !!o.sinRed; document.querySelector('[data-v=mis]').hidden = !pac;
  ['citas', 'pacientes', 'buscar'].forEach(v => document.querySelector(`[data-v=${v}]`).hidden = pac); $('#mipin').hidden = !!o.sinRed;
  mostrarEstadoRed(); irA(o.sinRed || pac ? 'agendar' : 'inicio'); actualizarPend(); sincronizarCola(); if (yo.rol === 'doctora' && !o.sinRed) avisosRespaldo();
}
async function avisosRespaldo() { const r = await api('respaldos'); if (r.avisos && r.avisos.length) { aviso('⚠ ' + r.avisos[0].mensaje); document.querySelector('[data-v=ajustes]').textContent = 'Ajustes ⚠'; } }
// Si no hay internet al abrir y este equipo ya tenía una persona del personal, se entra en modo sin conexión (solo para agendar)
function arranqueSinRed() { const g = leerJson('vika_yo'); if (g && g.rol !== 'paciente') iniciar(g, { sinRed: true }); else login(); }
$('#salir').addEventListener('click', async () => {
  const r = Cola.resumen(Cola.leer(store)); if (r.total && !confirm(`Hay ${r.total} cita(s) sin confirmar guardadas en este equipo. Si sale, se conservan aquí y se enviarán cuando entre alguien del personal. ¿Salir igual?`)) return;
  await api('auth/salir', {}); store.removeItem('vika_yo'); yo = null; login();
});
$('#mipin').addEventListener('click', () => {
  const a = campoPin('PIN actual'), n = campoPin('PIN nuevo');
  $('#vista').replaceChildren(h('section', {}, h('h2', {}, 'Cambiar mi PIN'), h('label', {}, 'PIN actual'), a, h('label', {}, 'PIN nuevo (6 números)'), n, h('p'),
    h('button', { onclick: async () => { const r = await api('auth/pin', { actual: a.value, nuevo: n.value }); aviso(r.ok ? 'PIN cambiado.' : r.error); if (r.ok) irA('agendar'); } }, 'Guardar PIN')));
});

$('#tamano').addEventListener('change', e => { if (!yo) return; document.body.dataset.tamano = e.target.value; store.setItem('vika_tamano_' + yo.nombre, e.target.value); });
$('#ayuda').addEventListener('click', () => {
  const pasos = [
    '1. Para agendar, toque «Agendar cita», busque o registre al paciente y elija una hora que no esté tachada.',
    '2. Para consultar la agenda, toque «Citas del día» y cambie la fecha si necesita revisar otro día.',
    '3. Para cancelar, busque la cita y confirme. La cita no se borra: queda registrada y puede reactivarse si la hora sigue libre.',
    '4. Para corregir una fecha u hora, use «Reprogramar» en la cita. Vika comprueba la disponibilidad antes de guardar.',
    '5. Si necesita revisar a una persona, toque «Buscar paciente» y luego «Ver historial».'
  ];
  $('#vista').replaceChildren(h('section', {}, h('h2', {}, 'Ayuda para esta pantalla'), h('p', { class: 'suave' }, 'Instrucciones rápidas, sin necesidad de Internet.'), h('ol', {}, ...pasos.map(x => h('li', {}, x))), h('button', { class: 'sec', onclick: () => irA(yo.rol === 'paciente' ? 'agendar' : 'inicio') }, 'Volver')));
});

/* ---------- Equipo (solo doctora) ---------- */
async function equipo() {
  const [us, au] = [await api('usuarios'), await api('auditoria')], caja = h('div');
  const nom = h('input', { placeholder: 'Nombre (ej.: Rosa Pérez)', 'aria-label': 'Nombre' });
  const rol = h('select', {}, h('option', { value: 'recepcion' }, 'Recepcionista'), h('option', { value: 'doctora' }, 'Doctora'));
  const mostrar = (pin, n) => caja.replaceChildren(h('section', {}, h('h2', {}, 'PIN de ' + n), h('p', { class: 'codigo' }, pin),
    h('p', { class: 'suave' }, 'Se muestra una sola vez. Entréguelo en persona; la persona puede cambiarlo en "Mi PIN".')));
  const lista = h('section', {}, h('h2', {}, 'Personas con acceso'));
  (Array.isArray(us) ? us : []).forEach(x => lista.append(h('div', { class: 'fila' },
    h('div', { class: x.activo ? '' : 'cancelada' }, h('strong', {}, x.nombre), h('div', { class: 'suave' }, x.rol === 'doctora' ? 'Doctora' : 'Recepción')),
    x.activo ? h('div', {}, h('button', { class: 'sec', onclick: async () => { const r = await api(`usuarios/${x.id}/pin`, {}); r.ok && mostrar(r.pin, x.nombre); } }, 'PIN nuevo'), ' ',
      x.nombre === yo.nombre ? '' : h('button', { class: 'peligro', onclick: async () => { if (!confirm(`¿Quitar el acceso de ${x.nombre}?`)) return; const r = await api(`usuarios/${x.id}/desactivar`, {}); aviso(r.ok ? 'Acceso quitado.' : r.error); equipo(); } }, 'Quitar acceso')) : h('span', { class: 'suave' }, 'Sin acceso'))));
  const nuevo = h('section', {}, h('h2', {}, 'Agregar persona'), nom, h('p'), rol, h('p'), h('button', { onclick: async () => {
    const r = await api('usuarios', { nombre: nom.value, rol: rol.value }); if (!r.ok) return aviso(r.error); mostrar(r.pin, nom.value); nom.value = ''; } }, 'Crear acceso'));
  const hist = h('section', {}, h('h2', {}, 'Últimos movimientos'));
  (Array.isArray(au) ? au : []).forEach(a => hist.append(h('div', { class: 'fila' }, h('span', {}, `${a.quien} · ${a.accion.replaceAll('_', ' ')}`), h('span', { class: 'suave' }, a.cuando))));
  $('#vista').replaceChildren(lista, caja, nuevo, hist);
}

/* ---------- Paciente: términos, pago y mis citas ---------- */
const ETQ = { pendiente: 'Falta pagar el anticipo', pagado: 'Anticipo pagado', retenido: 'Anticipo no devuelto', reembolsado: 'Anticipo devuelto', vencido: 'Reserva vencida' };

function terminosSeccion(acepta) {
  const lista = h('ul'), monto = h('strong', {}, '…');
  acepta.style.cssText = 'width:24px;min-height:24px;flex:none';
  api('terminos').then(t => { monto.textContent = '$' + Number(t.anticipo).toFixed(2); (t.reglas || []).forEach(x => lista.append(h('li', {}, x))); });
  return h('section', {}, h('h2', {}, '2. Anticipo y términos'), h('p', {}, 'Para confirmar su cita se paga un anticipo de ', monto, '. Léalo antes de continuar:'), lista,
    h('label', { style: 'display:flex;gap:10px;align-items:center;color:var(--texto)' }, acepta, 'He leído y acepto los términos y condiciones.'));
}
function pagar(c) {
  $('#vista').replaceChildren(h('section', {}, h('h2', {}, 'Último paso: pague su anticipo'), h('p', { class: 'codigo' }, '$' + Number(c.monto).toFixed(2)),
    h('p', { class: 'suave' }, (c.minutos_para_pagar ? `Su hora está apartada ${c.minutos_para_pagar} minutos; si no paga, se libera. ` : '') + 'Este anticipo no se devuelve si usted cancela o no asiste.'),
    h('button', { onclick: async () => { const x = await api(`citas/${c.id}/pagar`, {}); if (x.ok) { aviso('Pago recibido. Su cita está confirmada.'); irA('mis'); } else aviso(x.error); } }, 'Pagar (simulado)'), ' ',
    h('button', { class: 'sec', onclick: async () => { await api(`citas/${c.id}/cancelar`, {}); irA('agendar'); } }, 'No pagar y soltar la hora')));
}
async function misCitas() {
  const r = await api('mis-citas'), lista = h('div');
  if (!Array.isArray(r)) lista.append(h('p', { class: 'err' }, r.error));
  else if (!r.length) lista.append(h('p', { class: 'suave' }, 'Todavía no tiene citas. Toque "Agendar" para reservar la primera.'));
  else r.forEach(c => lista.append(h('div', { class: 'fila' },
    h('div', { class: c.estado === 'cancelada' ? 'cancelada' : '' }, h('strong', {}, c.inicio.replace('T', ' ')), h('div', { class: 'suave' }, `${c.medico} · ${c.clinica}`), h('div', { class: 'suave' }, ETQ[c.anticipo] || '')),
    c.estado === 'agendada' ? h('div', {}, c.anticipo === 'pendiente' ? h('button', { onclick: () => pagar({ id: c.id, monto: c.anticipo_monto }) }, 'Pagar') : '', ' ',
      h('button', { class: 'peligro', onclick: async () => {
        const txt = c.anticipo === 'pagado' ? `Si cancela, el anticipo de $${c.anticipo_monto.toFixed(2)} no se le devuelve. ¿Cancelar igual?` : '¿Cancelar esta reserva?';
        if (!confirm(txt)) return; const x = await api(`citas/${c.id}/cancelar`, {}); aviso(x.ok ? 'Cita cancelada.' : x.error); misCitas(); } }, 'Cancelar')) : '')));
  $('#vista').replaceChildren(h('section', {}, h('h2', {}, 'Mis citas'), lista));
}
const seccionPaciente = () => h('section', {}, h('h2', {}, 'Acceso para pacientes'), h('p', { class: 'suave' }, '¿Es su primera vez? Cree una cuenta. Si ya creó una, entre con su cédula o pasaporte y su PIN.'),
  h('button', { onclick: () => formPaciente(true) }, 'Soy paciente nuevo · Crear cuenta'), ' ', h('button', { class: 'sec', onclick: () => formPaciente(false) }, 'Ya tengo cuenta · Entrar'));
function formPaciente(registro) {
  const campos = registro ? [['nombre', 'Nombre completo', 'text'], ['tipo_doc', 'Documento', 'select'], ['documento', 'Número de documento', 'text'], ['telefono', 'Celular (opcional)', 'tel'],
    ['nacimiento', 'Fecha de nacimiento (opcional)', 'date'], ['pin', 'Cree un PIN de 6 números', 'password'], ['pin2', 'Repita el PIN', 'password']]
    : [['documento', 'Cédula o pasaporte', 'text'], ['pin', 'Su PIN de 6 números', 'password']];
  const f = h('section', {}, h('h2', {}, registro ? 'Crear mi cuenta' : 'Entrar como paciente')), el = {}, er = {};
  campos.forEach(([k, et, tipo]) => {
    el[k] = tipo === 'select' ? h('select', {}, h('option', { value: 'cedula' }, 'Cédula'), h('option', { value: 'pasaporte' }, 'Pasaporte')) : tipo === 'password' ? campoPin(et) : h('input', { type: tipo, ...(k === 'nacimiento' ? { max: hoy() } : {}) });
    er[k] = h('div', { class: 'err' }); f.append(h('label', {}, et), el[k], er[k]);
  });
  const enviar = async () => {
    Object.values(er).forEach(x => x.textContent = ''); const d = {}; campos.forEach(([k]) => d[k] = el[k].value);
    if (registro && d.pin !== d.pin2) return er.pin2.textContent = 'Los PIN no coinciden.';
    const r = await api(registro ? 'auth/paciente/registro' : 'auth/paciente/entrar', d);
    if (r.ok) iniciar(r); else if (r.errores) Object.entries(r.errores).forEach(([k, m]) => (er[k] || er.pin).textContent = m); else aviso(r.error);
  };
  f.append(h('p'), h('button', { onclick: enviar }, registro ? 'Crear cuenta y entrar' : 'Entrar'), ' ', h('button', { class: 'sec', onclick: login }, 'Volver'));
  $('#vista').replaceChildren(f);
}

/* ---------- Detalles de diseño ---------- */
const pill = b => { const p = document.querySelector('nav .pill'); if (!b || !p) return; p.style.width = b.offsetWidth + 'px'; p.style.transform = `translateX(${b.offsetLeft}px)`; };
addEventListener('resize', () => pill(document.querySelector('nav button.on')));
document.addEventListener('pointermove', e => { const s = e.target.closest && e.target.closest('section'); if (!s) return;
  const r = s.getBoundingClientRect(); s.style.setProperty('--mx', e.clientX - r.left + 'px'); s.style.setProperty('--my', e.clientY - r.top + 'px'); });

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
api('yo').then(r => r.ok ? iniciar(r) : r.sinRed ? arranqueSinRed() : login());
