# Plan — Vika 1.0: interfaz con movimiento útil

## Dirección de diseño

**Movimiento de diseño:** inspiración en dashboards de 21st.dev, reinterpretada para una recepción clínica: vidrio ligero, gradientes aqua y microinteracciones claras, sin sacrificar legibilidad ni confianza.

**Principios:** 1) cada animación comunica estado; 2) la acción principal siempre es evidente; 3) el movimiento es corto y reversible; 4) la interfaz sigue siendo usable con teclado, móvil y `prefers-reduced-motion`.

**Paleta:** aqua/teal como color propio de Vika, azul suave para apoyo, fondos claros u oscuros según el sistema y rojo reservado para riesgo o errores.

**Composición:** tarjetas de trabajo con profundidad ligera, navegación tipo píldora, bloques grandes para recepción y estados de carga dentro del contenido en lugar de pantallas bloqueadas.

**Elementos distintivos:** aurora ambiental muy lenta, barra de progreso superior para operaciones de red y skeletons de horas mientras se consulta disponibilidad.

**Interacción y animación:** entrada escalonada de vistas, shimmer limitado a acciones disponibles, feedback de toque, progreso de red no bloqueante y toast accesible. Todas las animaciones se desactivan o reducen para usuarios con `prefers-reduced-motion`.

**Tipografía:** sistema sans-serif para lectura rápida; títulos de peso alto y etiquetas cortas. Se conservan los tamaños Normal, Grande y Muy grande.

**Voz:** directa y tranquila. Ejemplos: “Vika está comprobando la disponibilidad” y “La cita quedó guardada; puedes seguir con la siguiente”.

## Implementación

- Añadir barra de progreso accesible para peticiones API.
- Mantener skeletons existentes para disponibilidad y reforzar sus estados visuales.
- Añadir microinteracciones de presión, foco, entrada y salida sin alterar la lógica clínica.
- No añadir librerías ni cambiar el backend; usar CSS y JavaScript existentes.
- Verificar que `prefers-reduced-motion` elimine transformaciones y animaciones no esenciales.

## Alcance de Vika 1.0

Esta iteración mejora la percepción de velocidad, claridad de estado y acabado visual. No pretende resolver todavía el pago real, la prueba de usabilidad con una persona no técnica ni la publicación HTTPS.
