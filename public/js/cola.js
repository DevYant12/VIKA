// Cola de citas registradas SIN internet. Lógica pura (sin pantalla) para poder probarla.
// Principio: una cita en la cola NUNCA se muestra como confirmada. Solo el servidor confirma.
(function (raiz) {
  const KC = 'vika_cola', KA = 'vika_agenda';
  const json = (a, def) => { try { const v = JSON.parse(a); return v ?? def; } catch { return def; } };

  function idNuevo() {
    const b = new Uint8Array(16), c = raiz.crypto || (typeof require !== 'undefined' ? require('node:crypto').webcrypto : null);
    c.getRandomValues(b); return Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
  }
  const leer = store => json(store.getItem(KC), []);
  const guardar = (store, cola) => store.setItem(KC, JSON.stringify(cola));
  const ahoraLocal = () => new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16);

  // Agrega una cita a la cola. datos: { medico_id, clinica_id, inicio, paciente:{nombre,tipo_doc,documento,telefono}, medico_nombre, clinica_nombre, quien }
  function encolar(store, datos, ahora = ahoraLocal()) {
    const cola = leer(store), item = { ...datos, cliente_id: idNuevo(), creada_en: ahora, estado: 'pendiente', intentos: 0 };
    guardar(store, cola.concat(item)); return item;
  }
  // Horas que se pueden ofrecer sin internet: horarios guardados, menos lo ocupado y menos lo ya apartado en la cola
  function libres({ agenda, cola, clinica, medico, fecha, ahora = ahoraLocal() }) {
    if (!agenda || !agenda.horarios) return [];
    const ofrecidas = agenda.horarios[`${clinica}|${medico}|${fecha}`] || [];
    const ocupadas = new Set(agenda.ocupadas[`${medico}|${fecha}`] || []);
    for (const i of cola) if (i.medico_id == medico && String(i.inicio).slice(0, 10) === fecha) ocupadas.add(i.inicio.slice(11));
    return ofrecidas.map(hora => ({ hora, libre: !ocupadas.has(hora) && fecha + 'T' + hora > ahora }));
  }
  const primerError = r => r.error || (r.errores ? Object.values(r.errores).join(' ') : 'No se pudo confirmar esta cita.');

  // Aplica la respuesta del servidor a un item. Devuelve 'confirmada' | 'queda' (sigue en la cola)
  function aplicar(it, r) {
    if (r.estado === 'creada' || r.estado === 'ya_sincronizada') { it.cita_id = r.id; return 'confirmada'; }
    it.mensaje = primerError(r);
    if (r.estado === 'conflicto_hora') { it.estado = 'conflicto'; it.alternativas = r.alternativas || []; }
    else if (r.estado === 'posible_duplicado') { it.estado = 'revisar'; it.existentes = r.existentes || []; }
    else if (r.status >= 500 || !r.status) { it.intentos = (it.intentos || 0) + 1; if (it.intentos >= 5) it.estado = 'error'; else { it.mensaje = null; return 'queda'; } }
    else it.estado = 'error';
    return 'queda';
  }

  // Envía las pendientes, de a una y en orden. enviar(item) → {status, ...cuerpo}; si no hay red, lanza.
  // Las confirmadas SE BORRAN de este equipo (menos datos personales guardados). Devuelve el resumen.
  async function sincronizar(store, enviar) {
    const res = { confirmadas: [], sinRed: false, sesion: true, pendientes: 0 };
    let cola = leer(store);
    for (const it of cola.filter(x => x.estado === 'pendiente')) {
      let r;
      try { r = await enviar(it); } catch { res.sinRed = true; break; }
      if (r.status === 401) { res.sesion = false; break; }
      if (aplicar(it, r) === 'confirmada') { res.confirmadas.push({ ...it }); cola = cola.filter(x => x.cliente_id !== it.cliente_id); }
      guardar(store, cola);
      if (r.status >= 500) break;                                    // el servidor tiene problemas: no insistir ahora
    }
    res.pendientes = cola.filter(x => x.estado === 'pendiente').length; return res;
  }
  // Acciones de la recepcionista sobre una cita con problema
  function mutar(store, id, f) { const cola = leer(store), it = cola.find(x => x.cliente_id === id); if (!it) return null; f(it); guardar(store, cola); return it; }
  const reprogramar = (store, id, inicio) => mutar(store, id, it => { it.inicio = inicio; it.estado = 'pendiente'; it.mensaje = null; it.alternativas = null; it.intentos = 0; });
  const decidir = (store, id, d) => mutar(store, id, it => { if (d.paciente_id) it.decision_paciente_id = d.paciente_id; else it.decision = 'otra'; it.estado = 'pendiente'; it.mensaje = null; it.existentes = null; });
  const reintentar = (store, id) => mutar(store, id, it => { it.estado = 'pendiente'; it.mensaje = null; it.intentos = 0; });
  const descartar = (store, id) => guardar(store, leer(store).filter(x => x.cliente_id !== id));
  const resumen = cola => ({ total: cola.length, pendientes: cola.filter(x => x.estado === 'pendiente').length, con_problema: cola.filter(x => x.estado !== 'pendiente').length });

  function cedulaValida(c) {
    if (!/^\d{10}$/.test(c) || /^(\d)\1{9}$/.test(c)) return false;
    const prov = +c.slice(0, 2); if (prov < 1 || (prov > 24 && prov !== 30) || +c[2] > 5) return false;
    let suma = 0; for (let i = 0; i < 9; i++) { let v = +c[i] * (i % 2 === 0 ? 2 : 1); if (v > 9) v -= 9; suma += v; }
    return (10 - (suma % 10)) % 10 === +c[9];
  }
  // Revisa los datos del paciente escritos sin internet; devuelve el mensaje de error o '' si están bien
  function validarPaciente(p) {
    const doc = String(p.documento || '').replace(/[\s-]/g, ''), tel = String(p.telefono || '').replace(/[\s-]/g, '');
    if (!/^[\p{L}\p{M}' .-]{2,100}$/u.test(String(p.nombre || '').trim())) return 'Escriba el nombre completo, solo con letras (ej.: María López).';
    if (p.tipo_doc === 'cedula' && !cedulaValida(doc)) return 'La cédula no es válida. Debe tener 10 números; revise que no falte ni sobre ninguno.';
    if (p.tipo_doc === 'pasaporte' && !/^[A-Za-z0-9]{5,20}$/.test(doc)) return 'El pasaporte debe tener entre 5 y 20 letras o números.';
    if (tel && !/^(09\d{8}|0[2-7]\d{7})$/.test(tel)) return 'Celular: 10 números que empiezan con 09. Fijo: 9 números con el código de provincia.';
    return '';
  }

  const API = { cedulaValida, validarPaciente, KC, KA, leer, guardar, encolar, libres, sincronizar, reprogramar, decidir, reintentar, descartar, resumen, aplicar, ahoraLocal };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else raiz.Cola = API;
})(typeof window !== 'undefined' ? window : globalThis);
