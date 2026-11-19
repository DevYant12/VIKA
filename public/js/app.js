// Interfaz de Vika. Todo el texto de la gente se inserta con textContent (evita código inyectado).
const $ = s => document.querySelector(s);
const h = (t, a = {}, ...k) => { const e = document.createElement(t);
  for (const [x, v] of Object.entries(a)) x.startsWith('on') ? e.addEventListener(x.slice(2), v) : x === 'class' ? e.className = v : e.setAttribute(x, v);
  e.append(...k); return e; };
let yo = null;
const quien = () => yo ? yo.nombre : '';
let cat = { clinicas: [], medicos: [] };

async function api(url, cuerpo) {
  try {
    const r = await fetch('/api/' + url, cuerpo ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) } : undefined);
    const j = await r.json(); $('#offline').hidden = true; if (r.status === 401 && yo) { yo = null; login(); } if (Array.isArray(j)) return Object.assign(j, { ok: r.ok, status: r.status }); return { ...j, ok: r.ok, status: r.status };
  } catch { $('#offline').hidden = false; return { ok: false, error: 'No hay conexión. No se guardó nada; intente de nuevo cuando vuelva el internet.' }; }
}
let t; function aviso(txt) { const a = $('#aviso'); a.textContent = txt; a.classList.add('ver'); clearTimeout(t); t = setTimeout(() => a.classList.remove('ver'), 5000); }
const hoy = () => new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
const opciones = (lista, f) => lista.map(x => h('option', { value: x.id }, f(x)));

/* ---------- Agendar ---------- */
function agendar() {
  const v = $('#vista'); v.replaceChildren();
  const pac = yo.rol === 'paciente';
  let hora = null, paciente = pac ? 1 : null;
  const cl = h('select', { id: 'cl' }, ...opciones(cat.clinicas, x => x.nombre));
  const me = h('select', { id: 'me' }, ...opciones(cat.medicos, x => `${x.nombre} (${x.especialidad})`));
  const fe = h('input', { type: 'date', id: 'fe', min: hoy(), value: hoy() });
  const hs = h('div', { class: 'horas' }), ok = h('button', { disabled: '' }, yo.rol === 'paciente' ? 'Reservar y pagar anticipo' : 'Confirmar cita');
  const bus = h('input', { placeholder: 'Escriba nombre o documento', 'aria-label': 'Buscar paciente' }), rs = h('div');
  const acepta = h('input', { type: 'checkbox', 'aria-label': 'Acepto los términos' }); acepta.addEventListener('change', () => estado());
  const estado = () => ok.disabled = !(hora && paciente && (!pac || acepta.checked));

  async function cargarHoras() {
    hora = null; estado(); hs.replaceChildren(...Array.from({ length: 8 }, () => h('div', { class: 'sk' })));
    const r = await api(`disponibilidad?clinica=${cl.value}&medico=${me.value}&fecha=${fe.value}`);
    hs.replaceChildren(); if (!r.ok) return hs.append(h('p', { class: 'err' }, r.error));
    r.forEach(x => { const b = h('button', { class: 'hora', type: 'button', ...(x.libre ? {} : { disabled: '' }), onclick: () => { hora = x.hora; hs.querySelectorAll('button').forEach(y => y.classList.remove('sel')); b.classList.add('sel'); estado(); } }, x.hora); hs.append(b); });
  }
  [cl, me, fe].forEach(e => e.addEventListener('change', cargarHoras));

  bus.addEventListener('input', async () => {
    paciente = null; estado(); rs.replaceChildren(); if (bus.value.trim().length < 2) return;
    const r = await api('pacientes?q=' + encodeURIComponent(bus.value));
    if (!Array.isArray(r)) return rs.append(h('p', { class: 'err' }, r.error || ''));
    if (!r.length) rs.append(h('p', { class: 'suave' }, 'No hay pacientes con ese dato. Use "Nuevo paciente" para registrarlo.'));
    r.forEach(p => { const d = h('div', { class: 'res', tabindex: '0', onclick: () => { paciente = p.id; rs.querySelectorAll('.res').forEach(y => y.classList.remove('sel')); d.classList.add('sel'); estado(); } },
      h('strong', {}, p.nombre), h('div', { class: 'suave' }, [p.documento, p.nacimiento && 'nac. ' + p.nacimiento].filter(Boolean).join(' · ') || 'Sin documento')); rs.append(d); });
  });

  ok.addEventListener('click', async () => {
    if (!quien()) return aviso('Escriba su nombre arriba, en "Usted es".');
    ok.disabled = true;
    const r = await api('citas', { paciente_id: paciente, medico_id: +me.value, clinica_id: +cl.value, inicio: `${fe.value}T${hora}`, quien: quien(), acepta_terminos: acepta.checked });
    if (r.ok) { if (pac) return pagar(r); aviso('Cita guardada.'); agendar(); } else { aviso(r.error); cargarHoras(); }
  });

  v.append(h('section', {}, h('h2', {}, '1. ¿Dónde, con quién y cuándo?'),
      h('label', {}, 'Clínica'), cl, h('label', {}, 'Médico'), me, h('label', {}, 'Fecha'), fe,
      h('label', {}, 'Hora (las tachadas ya no están libres)'), hs),
    pac ? terminosSeccion(acepta) : h('section', {}, h('h2', {}, '2. ¿Para quién?'), bus, rs), ok);
  cargarHoras();
}

/* ---------- Citas del día ---------- */
async function citas() {
  const v = $('#vista'), fe = h('input', { type: 'date', value: hoy(), 'aria-label': 'Fecha' }), lista = h('div');
  async function cargar() {
    const r = await api('citas?fecha=' + fe.value); lista.replaceChildren();
    if (!Array.isArray(r)) return lista.append(h('p', { class: 'err' }, r.error));
    if (!r.length) return lista.append(h('p', { class: 'suave' }, 'No hay citas este día. Use "Agendar cita" para crear la primera.'));
    r.forEach(c => lista.append(h('div', { class: 'fila' },
      h('div', { class: c.estado === 'cancelada' ? 'cancelada' : '' }, h('strong', {}, c.inicio.slice(11) + ' · ' + c.paciente), h('div', { class: 'suave' }, `${c.medico} · ${c.clinica}${ETQ[c.anticipo] ? ' · ' + ETQ[c.anticipo] : ''}`)),
      c.estado === 'agendada' ? h('button', { class: 'peligro', onclick: async () => {
        if (!quien()) return aviso('Escriba su nombre arriba, en "Usted es".');
        if (!confirm(`¿Cancelar la cita de ${c.paciente} a las ${c.inicio.slice(11)}?`)) return;
        const x = await api(`citas/${c.id}/cancelar`, { quien: quien() }); aviso(x.ok ? (x.aviso || 'Cita cancelada. La hora quedó libre.') : x.error); cargar();
      } }, 'Cancelar') : h('button', { class: 'sec', onclick: async () => { const x = await api(`citas/${c.id}/reactivar`, {}); aviso(x.ok ? (x.aviso || 'Cita reactivada.') : x.error); cargar(); } }, 'Reactivar'), (yo.rol === 'doctora' && c.anticipo === 'retenido') ? h('button', { class: 'sec', onclick: async () => { if (!confirm('¿Devolver el anticipo a este paciente?')) return; const x = await api(`citas/${c.id}/devolver-anticipo`, {}); aviso(x.ok ? 'Anticipo devuelto.' : x.error); cargar(); } }, 'Devolver anticipo') : '')));
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
  $('#vista').replaceChildren(f);
}

/* ---------- Navegación ---------- */
const vistas = { agendar, citas, pacientes, equipo, mis: misCitas };
document.querySelectorAll('nav button').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('nav button').forEach(x => x.classList.toggle('on', x === b)); pill(b); vistas[b.dataset.v]();
}));

/* ---------- Acceso con PIN ---------- */
const campoPin = l => h('input', { type: 'password', inputmode: 'numeric', maxlength: '6', autocomplete: 'off', 'aria-label': l });
const irA = v => document.querySelector(`[data-v=${v}]`).click();

async function login() {
  $('nav').hidden = true; $('#sesion').hidden = true;
  const us = await api('auth/usuarios'), caja = h('section', {}, h('h2', {}, '¿Quién es usted?'));
  if (!Array.isArray(us)) caja.append(h('p', { class: 'err' }, us.error));
  else us.forEach(x => caja.append(h('p', {}, h('button', { class: 'sec', style: 'width:100%', onclick: () => pedirPin(x) }, x.nombre))));
  $('#vista').replaceChildren(caja, seccionPaciente());
}
function pedirPin(x) {
  const pin = campoPin('PIN de 6 números');
  const entrar = async () => { const r = await api('auth/entrar', { id: x.id, pin: pin.value }); pin.value = ''; r.ok ? iniciar(r) : aviso(r.error); };
  pin.addEventListener('keydown', e => e.key === 'Enter' && entrar());
  $('#vista').replaceChildren(h('section', {}, h('h2', {}, 'Hola, ' + x.nombre), h('label', {}, 'Escriba su PIN (6 números)'), pin, h('p'),
    h('button', { onclick: entrar }, 'Entrar'), ' ', h('button', { class: 'sec', onclick: login }, 'Cambiar de persona')));
  pin.focus();
}
async function iniciar(u) {
  yo = { nombre: u.nombre, rol: u.rol }; cat = await api('catalogos');
  $('nav').hidden = false; $('#sesion').hidden = false; $('#usuario').textContent = `${yo.nombre} (${{ doctora: 'doctora', recepcion: 'recepción', paciente: 'paciente' }[yo.rol]})`;
  const pac = yo.rol === 'paciente';
  document.querySelector('[data-v=equipo]').hidden = yo.rol !== 'doctora'; document.querySelector('[data-v=mis]').hidden = !pac;
  ['citas', 'pacientes'].forEach(v => document.querySelector(`[data-v=${v}]`).hidden = pac); $('#mipin').hidden = pac; irA('agendar');
}
$('#salir').addEventListener('click', async () => { await api('auth/salir', {}); yo = null; login(); });
$('#mipin').addEventListener('click', () => {
  const a = campoPin('PIN actual'), n = campoPin('PIN nuevo');
  $('#vista').replaceChildren(h('section', {}, h('h2', {}, 'Cambiar mi PIN'), h('label', {}, 'PIN actual'), a, h('label', {}, 'PIN nuevo (6 números)'), n, h('p'),
    h('button', { onclick: async () => { const r = await api('auth/pin', { actual: a.value, nuevo: n.value }); aviso(r.ok ? 'PIN cambiado.' : r.error); if (r.ok) irA('agendar'); } }, 'Guardar PIN')));
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
const seccionPaciente = () => h('section', {}, h('h2', {}, '¿Es paciente?'), h('p', { class: 'suave' }, 'Entre para agendar su cita usted mismo.'),
  h('button', { onclick: () => formPaciente(false) }, 'Entrar como paciente'), ' ', h('button', { class: 'sec', onclick: () => formPaciente(true) }, 'Crear mi cuenta'));
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

api('yo').then(r => r.ok ? iniciar(r) : login());
