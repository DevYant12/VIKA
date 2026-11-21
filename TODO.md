# TODO — Mejora visual de Vika 1.0

## Interfaz y estados

- [ ] Añadir una barra de progreso superior no bloqueante para solicitudes de red.
  - Debe aparecer mientras Vika consulta o guarda datos.
  - Debe desaparecer incluso cuando la solicitud falla.
  - Debe respetar `prefers-reduced-motion`.
- [ ] Mejorar microinteracciones de botones, tarjetas, navegación y toasts.
- [ ] Mantener skeletons visibles mientras se carga disponibilidad.
- [ ] Revisar visualmente la experiencia en móvil y escritorio.
- [ ] Confirmar que el tamaño Normal/Grande/Muy grande conserve legibilidad.

## Validación

- [x] Ejecutar `npm test` (202 pruebas aprobadas en esta rama).
- [x] Ejecutar `npm run test:ui` (27 comprobaciones aprobadas en esta rama).
- [ ] Revisar que el modo sin conexión conserve el aviso `SIN CONFIRMAR`.
- [ ] Revisar con `prefers-reduced-motion: reduce`.
- [ ] Hacer una prueba manual con una persona no técnica y registrar el resultado en `docs/PRUEBA-USUARIO.md`.

## Pendientes del producto

- [ ] Configurar y probar una copia externa.
- [ ] Sustituir el pago simulado por un proveedor real con webhook.
- [ ] Evaluar segundo factor de autenticación.
- [ ] Diseñar recordatorios y lista de espera.
- [ ] Realizar la prueba con una persona no técnica y registrar el resultado en `docs/PRUEBA-USUARIO.md` antes de considerar cualquier cierre.
