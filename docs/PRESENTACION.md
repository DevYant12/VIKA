# Guion de la presentación (10 min demo + 5 min preguntas)

**Idea central a repetir:** "No gana quien tiene más funciones, sino quien piensa mejor. Estas son las tres cosas que le duelen a la doctora y cómo las resolvimos." (1) que no se crucen las citas, (2) que doña Rosa pueda usarlo, (3) que no se pierda nada.

## Demo (10 min)
| Min | Qué mostrar | Qué decir |
|---|---|---|
| 0–1 | Historia + las 3 preocupaciones | Qué entendimos que necesita, y la **contradicción** (cancelar fácil vs. que no se pierdan citas) y cómo la resolvimos. |
| 1–3 | Entrar con PIN; registrar paciente; cédula `0000000000` y `juan@@gmail` | Mensajes que dicen qué corregir sin borrar lo escrito. Mismo nombre ≠ mismo paciente. |
| 3–5 | **Dos pestañas, misma hora, mismo médico** → gana una | La regla está en la base de datos, no en la pantalla. Mostrar también al Dr. Salazar en dos clínicas. |
| 5–6 | Cancelar → confirmación → **Reactivar** → historial (doctora) | Nada se borra; se sabe quién y cuándo. |
| 6–8 | **Internet cortado** (Network → Offline), agendar como personal → "SIN CONFIRMAR" → volver en línea | Qué pasa si dos clínicas toman la misma hora sin internet: gana la primera que sincroniza, la otra recibe alternativas. |
| 8–9 | Cambio de planes: paciente crea cuenta, acepta términos, anticipo simulado, cancela y ve el aviso | Qué es simulado y el riesgo legal que dejamos escrito. |
| 9–10 | Importar `datos-ejemplo/` (Revisar sin guardar) | El sistema decide qué hacer con datos sucios. |

## Preguntas probables y respuesta honesta
- **¿Lo probaron con doña Rosa?** No. Está el guion en `docs/PRUEBA-USUARIO.md` y es lo primero que haríamos.
- **¿Qué falta?** Pago real, doble verificación, recordatorios, lista de espera, botón de historial en pantalla (la API existe). Todo en DECISIONES §10.
- **¿Por qué gana la primera que sincroniza?** Los relojes de cada computador pueden diferir; es la única regla que no depende de ellos. Nada se pierde en silencio.
- **¿Qué pasa si se borra todo?** Copias cada 6 h, verificadas; copia externa cifrada opcional; `npm run restaurar`. Límite: alguien debe configurarla y probarla.
- **¿Y si el sistema se cae el lunes a las 8?** Citas del día impresas + restaurar la última copia en otro computador. No hay servidor de reserva.
- **¿Es legal el anticipo no reembolsable?** No lo sabemos; no somos abogados. Dejamos devolución por emergencia/cancelación de la clínica y una ventana configurable.
- **¿Qué hizo la IA y qué hicieron ustedes?** DECISIONES §11. **Cada integrante debe poder explicar su parte y sus commits.**
