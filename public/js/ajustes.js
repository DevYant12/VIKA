// Ajustes de la doctora: copias de seguridad, horarios, médicos e importar datos. Usa h, $, api, aviso de app.js.
const DIAS = [['Lun', 1], ['Mar', 2], ['Mié', 3], ['Jue', 4], ['Vie', 5], ['Sáb', 6], ['Dom', 0]];
const horasOpc = (sel) => { const s = h('select'); for (let m = 5 * 60; m <= 22 * 60; m += 30) { const t = String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); s.append(h('option', { value: t }, t)); } s.value = sel; return s; };
const local = c => c ? new Date(c.replace(' ', 'T') + 'Z').toLocaleString('es-EC', { dateStyle: 'medium', timeStyle: 'short' }) : 'nunca';

async function ajustesVista() {
  const [rs, hr] = [await api('respaldos'), await api('horarios')];
  $('#vista').replaceChildren(seccionRespaldos(rs), seccionHorarios(hr), seccionMedicos(hr), seccionImportar());
}

function seccionRespaldos(r) {
  const s = h('section', {}, h('h2', {}, 'Copias de seguridad'));
  if (!r.ok) return s.append(h('p', { class: 'err' }, r.error || 'No se pudo leer el estado.')), s;
  (r.avisos || []).forEach(a => s.append(h('div', { class: 'nota mal' }, '⚠ ' + a.mensaje)));
  s.append(h('p', {}, 'Última copia en este computador: ', h('strong', {}, local(r.ultima_ok_local))),
    h('p', {}, 'Última copia externa: ', h('strong', {}, r.extra_configurada ? local(r.ultima_ok_externa) : 'no configurada'), r.cifrada ? h('span', { class: 'ok' }, ' · cifrada') : (r.extra_configurada ? h('span', { class: 'mal' }, ' · sin cifrar') : '')),
    r.misma_unidad ? h('p', { class: 'suave' }, 'La copia externa está en la misma unidad de este computador: sirve solo si es una carpeta sincronizada con la nube (Drive, OneDrive, Dropbox).') : '',
    h('p', { class: 'suave' }, 'Se hace sola al abrir el sistema y cada 6 horas.'),
    h('button', { class: 'sec', onclick: async function () { this.disabled = true; const x = await api('respaldos/ahora', {}); aviso(x.resultado && x.resultado.local_ok ? (x.resultado.extra_ok === false ? 'Copia local hecha, pero la externa falló.' : 'Copia hecha.') : (x.error || 'La copia falló.')); ajustesVista(); } }, 'Hacer copia ahora'));
  return s;
}

function seccionHorarios(d) {
  const s = h('section', {}, h('h2', {}, 'Horarios'));
  if (!d.ok) return s.append(h('p', { class: 'err' }, d.error || '')), s;
  const med = h('select', { 'aria-label': 'Médico' }, ...d.medicos.filter(m => m.activo).map(m => h('option', { value: m.id }, m.nombre))), cuerpo = h('div');
  const nom = c => d.clinicas.find(x => x.id === c).nombre;
  const resultado = r => { if (!r.ok) return aviso(r.error); aviso('Horario guardado.'); if (r.citas_fuera_de_horario) alert(`Atención: ${r.citas_fuera_de_horario} cita(s) ya agendada(s) quedaron fuera del nuevo horario. Avise a esos pacientes:\n\n` + r.ejemplos.map(e => `• ${e.inicio.replace('T', ' ')} · ${e.clinica}`).join('\n')); ajustesVista(); };
  function pintar() {
    const mid = +med.value, filas = d.filas.filter(f => f.medico_id === mid); cuerpo.replaceChildren();
    if (!filas.length) cuerpo.append(h('p', { class: 'suave' }, 'Sin horario propio: atiende en el horario general de cada clínica, todos los días. Al agregar el primer horario, SOLO atenderá donde y cuando usted indique.'));
    else {
      const t = h('table', { class: 'tabla' });
      [...new Set(filas.map(f => f.clinica_id))].forEach(c => t.append(h('tr', {}, h('td', {}, h('strong', {}, nom(c))),
        h('td', {}, filas.filter(f => f.clinica_id === c).map(f => `${DIAS.find(x => x[1] === f.dia)[0]} ${f.abre}–${f.cierra}`).join(' · ')),
        h('td', {}, h('button', { class: 'sec', onclick: async () => { if (confirm(`¿Quitar todos los horarios de ${nom(c)}?`)) resultado(await api('horarios/quitar', { medico_id: mid, clinica_id: c })); } }, 'Quitar')))));
      cuerpo.append(t, h('p'), h('button', { class: 'sec', onclick: async () => { if (confirm('¿Volver al horario general de las clínicas, todos los días?')) resultado(await api('horarios/restablecer', { medico_id: mid })); } }, 'Volver al horario general'));
    }
    const cl = h('select', {}, ...d.clinicas.map(c => h('option', { value: c.id }, c.nombre))), dias = h('div', { class: 'dias' }, ...DIAS.map(([n, v]) => h('label', {}, h('input', { type: 'checkbox', value: v, ...(v >= 1 && v <= 5 ? { checked: '' } : {}) }), n)));
    const a = horasOpc('08:00'), b = horasOpc('13:00');
    cuerpo.append(h('div', { class: 'bloque' }, h('h2', {}, 'Agregar o cambiar horario'), h('label', {}, 'Clínica'), cl, h('label', {}, 'Días'), dias, h('div', { class: 'dos' }, h('div', {}, h('label', {}, 'Desde'), a), h('div', {}, h('label', {}, 'Hasta'), b)), h('p'),
      h('button', { onclick: async () => resultado(await api('horarios', { medico_id: mid, clinica_id: +cl.value, dias: [...dias.querySelectorAll('input:checked')].map(x => +x.value), abre: a.value, cierra: b.value })) }, 'Guardar horario')));
  }
  med.addEventListener('change', pintar); pintar();
  const gen = h('div', { class: 'bloque' }, h('h2', {}, 'Horario general de cada clínica'), h('p', { class: 'suave' }, 'Lo usan los médicos que no tienen horario propio.'));
  d.clinicas.forEach(c => { const a = horasOpc(c.abre), b = horasOpc(c.cierra);
    gen.append(h('div', { class: 'fila' }, h('strong', {}, c.nombre), h('div', { class: 'dos' }, a, b, h('button', { class: 'sec', onclick: async () => { const r = await api('horarios/clinica', { clinica_id: c.id, abre: a.value, cierra: b.value }); aviso(r.ok ? 'Horario guardado.' : r.error); } }, 'Guardar')))); });
  s.append(h('label', {}, 'Médico'), med, cuerpo, gen); return s;
}

function seccionMedicos(d) {
  const s = h('section', {}, h('h2', {}, 'Médicos'), h('p', { class: 'suave' }, 'Los médicos desactivados no aparecen para agendar; sus citas anteriores se conservan. Para agregar médicos, use "Importar datos".'));
  (d.medicos || []).forEach(m => s.append(h('div', { class: 'fila' }, h('div', { class: m.activo ? '' : 'cancelada' }, h('strong', {}, m.nombre), h('div', { class: 'suave' }, m.especialidad || '')),
    h('button', { class: m.activo ? 'peligro' : 'sec', onclick: async () => {
      if (m.activo && !confirm(`¿Desactivar a ${m.nombre}? Ya no se podrán agendar citas con este médico.`)) return;
      const r = await api(`medicos/${m.id}/${m.activo ? 'desactivar' : 'activar'}`, {}); if (!r.ok) return aviso(r.error);
      if (r.citas_futuras) alert(`${m.nombre} tiene ${r.citas_futuras} cita(s) futura(s) agendada(s). Siguen vigentes: revíselas en "Citas del día".`); ajustesVista();
    } }, m.activo ? 'Desactivar' : 'Activar'))));
  return s;
}

const PLANTILLAS = {
  pacientes: 'Nombre;Cédula;Teléfono;Fecha de nacimiento;Correo\nMaría López;1710034065;0991234567;05/03/1990;maria@correo.com\n',
  medicos: 'Nombre;Especialidad\nDra. Elena Ruiz;Dermatología\n',
  citas: 'Paciente;Cédula;Médico;Clínica;Fecha;Hora;Estado\nMaría López;1710034065;Dra. Paredes;Centro;15/03/2026;09:30;atendida\n',
  horarios: 'Médico;Clínica;Días;Desde;Hasta\nDra. Elena Ruiz;Norte;lun-vie;08:00;12:30\nDra. Elena Ruiz;Sur;sábado;09:00;13:00\n',
};
const AYUDA = {
  pacientes: 'Columnas: Nombre (obligatoria), Cédula o pasaporte, Teléfono, Fecha de nacimiento (día/mes/año) y Correo. Si Excel le borró el cero inicial de una cédula o celular, el sistema lo arregla.',
  medicos: 'Columnas: Nombre (obligatoria) y Especialidad. Los que ya existen se omiten.',
  citas: 'Citas pasadas (historial). Columnas: Paciente, Médico, Clínica, Fecha (día/mes/año), Hora; opcional Cédula (para distinguir homónimos) y Estado ("cancelada" las deja canceladas). Importe antes a los pacientes y médicos.',
  horarios: 'Columnas: Médico, Clínica, Días (ej.: lun-vie, lun mie vie, sábado), Desde y Hasta (en punto o y media). El médico debe existir antes: impórtelo primero.',
};
// Excel guarda "CSV" en Windows-1252 y "CSV UTF-8" en UTF-8: se prueba UTF-8 y, si falla, se usa Windows-1252 para no dañar las tildes
const leerArchivo = async f => { const b = await f.arrayBuffer(); try { return new TextDecoder('utf-8', { fatal: true }).decode(b); } catch { return new TextDecoder('windows-1252').decode(b); } };

function seccionImportar() {
  const tipo = h('select', { 'aria-label': 'Qué importar' }, h('option', { value: 'pacientes' }, 'Pacientes'), h('option', { value: 'medicos' }, 'Médicos'), h('option', { value: 'horarios' }, 'Horarios de médicos'), h('option', { value: 'citas' }, 'Citas pasadas'));
  const arch = h('input', { type: 'file', accept: '.csv,.txt', 'aria-label': 'Archivo CSV' }), dup = h('input', { type: 'checkbox' }), ayuda = h('p', { class: 'suave' }), ejemplo = h('pre', { class: 'ejemplo' });
  const res = h('div'), revisar = h('button', { disabled: '' }, 'Revisar (no guarda nada)'), importar = h('button', { class: 'sec', disabled: '' }, 'Importar ahora'), cajaDup = h('label', { style: 'display:flex;gap:8px;align-items:center;color:var(--texto)' }, dup, 'Importar también los que se parecen a alguien ya registrado');
  let texto = null;
  const pintarTipo = () => { ayuda.textContent = AYUDA[tipo.value]; ejemplo.textContent = PLANTILLAS[tipo.value]; cajaDup.hidden = tipo.value !== 'pacientes'; res.replaceChildren(); importar.disabled = true; };
  tipo.addEventListener('change', pintarTipo); pintarTipo();
  arch.addEventListener('change', async () => { texto = arch.files[0] ? await leerArchivo(arch.files[0]) : null; revisar.disabled = !texto; importar.disabled = true; res.replaceChildren(); });
  const ejecutar = async simular => {
    const r = await api('importar', { tipo: tipo.value, texto, simular, duplicados: dup.checked }); res.replaceChildren(); if (!r.ok) return res.append(h('div', { class: 'nota mal' }, r.error || 'No se pudo importar.'));
    res.append(h('div', { class: 'nota ' + (r.errores ? 'mal' : 'bien') }, (simular ? 'Revisión (todavía no se guardó nada): ' : 'Importación terminada: ') + `${r.total} filas · ${r.creados} se crean · ${r.ya_existian} ya existían · ${r.parecidos} se parecen a alguien · ${r.errores} con error.`));
    if (r.filas.length) { const t = h('table', { class: 'tabla' }, h('tr', {}, h('th', {}, 'Fila'), h('th', {}, 'Nombre'), h('th', {}, 'Qué pasó'))); r.filas.forEach(f => t.append(h('tr', {}, h('td', {}, String(f.linea)), h('td', {}, f.nombre), h('td', { class: f.estado === 'error' ? 'mal' : '' }, f.mensaje)))); res.append(t); }
    if (simular) importar.disabled = !r.creados; else { aviso(`${r.creados} registro(s) importado(s).`); importar.disabled = true; revisar.disabled = true; }
  };
  revisar.addEventListener('click', () => ejecutar(true)); importar.addEventListener('click', () => { if (confirm('¿Importar ahora los registros revisados?')) ejecutar(false); });
  const bajar = h('button', { class: 'sec', onclick: () => { const a = h('a', { href: URL.createObjectURL(new Blob(['\uFEFF' + PLANTILLAS[tipo.value]], { type: 'text/csv' })), download: `plantilla-${tipo.value}.csv` }); a.click(); } }, 'Descargar plantilla');
  return h('section', {}, h('h2', {}, 'Importar datos'), h('p', { class: 'suave' }, 'Desde Excel: "Guardar como" → CSV. Primero se revisa todo sin guardar; solo después se importa.'),
    h('label', {}, 'Qué desea importar'), tipo, ayuda, ejemplo, bajar, h('label', {}, 'Archivo CSV'), arch, cajaDup, h('p'), revisar, ' ', importar, res);
}
window.ajustesVista = ajustesVista;
