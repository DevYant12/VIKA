// Anticipo y términos para citas agendadas por el propio paciente
const ANTICIPO = Number(process.env.VIKA_ANTICIPO || 10);                   // dólares
const HORAS_REEMBOLSO = Number(process.env.VIKA_HORAS_REEMBOLSO || 0);      // 0 = nunca se devuelve al cancelar el paciente
const MINUTOS_PAGO = Number(process.env.VIKA_MINUTOS_PAGO || 15);           // tiempo para pagar antes de soltar la hora

function terminos() {
  const reglas = [
    `Para confirmar su cita debe pagar un anticipo de $${ANTICIPO.toFixed(2)}. Ese valor se descuenta del costo de su consulta.`,
    `Al reservar, su hora queda apartada ${MINUTOS_PAGO} minutos. Si no paga en ese tiempo, la hora se libera sin ningún cargo.`,
    HORAS_REEMBOLSO > 0
      ? `Si usted cancela con al menos ${HORAS_REEMBOLSO} horas de anticipación, el anticipo se le devuelve. Si cancela después, o no asiste, el anticipo no se devuelve.`
      : 'Si usted cancela o no asiste a su cita, el anticipo no se devuelve.',
    'Si la clínica o el médico cancelan, o hay una emergencia comprobada, el anticipo se devuelve completo.',
    'En este sistema no se guardan datos de su tarjeta. Sus datos de salud se usan solo para gestionar su atención.'];
  return { version: '1.1', anticipo: ANTICIPO, minutos_para_pagar: MINUTOS_PAGO, horas_reembolso: HORAS_REEMBOLSO, reglas };
}
// Qué pasa con un anticipo pagado cuando el paciente cancela
const destinoAnticipo = (inicio, ahora, horas = HORAS_REEMBOLSO) =>
  horas > 0 && (new Date(inicio) - new Date(ahora)) >= horas * 36e5 ? 'reembolsado' : 'retenido';
// Suelta las reservas que nadie pagó a tiempo
const liberarVencidas = (db, min = MINUTOS_PAGO) => db.prepare(
  "UPDATE citas SET estado='cancelada', anticipo='vencido' WHERE estado='agendada' AND anticipo='pendiente' AND creado < datetime('now', ?)").run(`-${min} minutes`).changes;
module.exports = { ANTICIPO, HORAS_REEMBOLSO, MINUTOS_PAGO, terminos, destinoAnticipo, liberarVencidas };
