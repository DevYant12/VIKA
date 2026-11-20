# Vika — Agenda de citas

Sistema de citas para las tres clínicas de la Dra. Paredes. Concurso ClinAgenda (Seventech).

## Probar en 5 minutos
Requisito: **Node.js 22.5 o superior** (no hay que instalar nada más).
```bash
npm start
```
Al arrancar, la terminal muestra el **PIN inicial** de la Dra. Paredes. Abra http://localhost:3000, elija su nombre y escriba el PIN. Después, desde la pestaña **Equipo**, cree a las recepcionistas. Registre un paciente (cédula de prueba válida: `1710034065`) y luego agende una cita.

**Con datos de prueba (2 minutos más):** entre como la doctora → **Ajustes → Importar** y cargue, en este orden y usando primero *Revisar sin guardar*, los archivos de `datos-ejemplo/`: `medicos.csv`, `pacientes.csv`, `horarios.csv`, `citas-pasadas.csv`. Son datos inventados y sucios a propósito; el sistema muestra qué importa y qué rechaza (y por qué).

**Lo que un juez puede mirar rápido:** dos pestañas del navegador agendando la misma hora (gana una); cancelar y **Reactivar**; un nombre con emoji o `<script>`; cédula `0000000000`; cortar el internet en el navegador (F12 → Network → Offline) y agendar como personal (queda *SIN CONFIRMAR*).

## Estructura
- `server.js` API y servidor · `db.js` base de datos SQLite · `validators.js` validaciones · `auth.js` acceso con PIN y roles
- `horarios.js` horarios por médico y clínica · `importar.js` importar CSV · `ajustes.js` rutas de la doctora
- `offline.js` sincronización de citas hechas sin internet · `backup.js` y `restaurar.js` copias de seguridad
- `public/` interfaz (HTML, CSS, JS; `cola.js` guarda las citas sin internet, `sw.js` deja abrir la página sin conexión)
- `DECISIONES.md` decisiones del equipo (respuesta a cada pregunta de las bases) · `docs/PUBLICAR.md` HTTPS, copias externas y trabajo sin internet
- `docs/PRESENTACION.md` guion de la demostración de 10 minutos y preguntas probables del jurado · `docs/PRUEBA-USUARIO.md` guion para probar con una persona no técnica
- `datos-ejemplo/` archivos inventados para probar la importación

## Pruebas
`npm test` corre las pruebas automáticas (195; incluye reprogramación atómica, historial de cambios, validaciones, 500 citas en un día, base de datos, PIN, citas simultáneas, horarios, importación, copias externas, HTTPS, sincronización sin internet y toda la API).
`npm run test:ui` prueba la interfaz con un navegador simulado (caída del internet, citas sin confirmar, choques). `npm ci` instala `jsdom` desde `devDependencies`; no hace falta instalarlo manualmente.

## Interfaz de recepción fácil
Después de entrar como personal aparece un inicio con cuatro acciones grandes: **Agendar cita**, **Consultar citas**, **Registrar paciente** y **Buscar paciente**. La agenda permite reprogramar una cita con comprobación de disponibilidad real; el cambio se hace de forma atómica, conserva el anticipo y queda en el historial de auditoría. Desde Buscar paciente se puede abrir el historial administrativo de citas y anticipos, sin mostrar información médica innecesaria.

La ayuda contextual funciona sin Internet desde «¿Necesitas ayuda?». El tamaño de letra se puede guardar por usuario como Normal, Grande o Muy grande. Estas mejoras están implementadas y cubiertas por las pruebas automáticas; la prueba con una persona no técnica sigue pendiente de realizarse en condiciones reales.

## Seguridad y publicación
Por defecto Vika **solo escucha en este computador**. Para usarla desde las clínicas hay que ponerle HTTPS: ver `docs/PUBLICAR.md` (también explica las copias externas cifradas y el trabajo sin internet).

## GitHub y comprobación automática
GitHub debe alojar el repositorio y su historial; `.github/workflows/test.yml` ejecuta `npm test` y `npm run test:ui` con Node.js 22 en cada cambio. **GitHub Pages no puede ejecutar Vika completa**, porque solo sirve archivos estáticos y no ejecuta `server.js`, SQLite, sesiones ni la API. Para usar la aplicación real desde las tres clínicas se necesita un servidor Node.js con HTTPS; la guía está en `docs/PUBLICAR.md`.

## Qué puede hacer la doctora (pestaña Ajustes)
Ver el estado de las copias y hacer una al momento · definir el horario de cada médico en cada clínica y el horario general de cada clínica · activar o desactivar médicos · **importar** pacientes, médicos y horarios desde Excel (primero se revisa sin guardar). Recepción puede **activar el acceso** de un paciente ya registrado o darle un PIN nuevo (pestaña Nuevo paciente).

## Pacientes y anticipo
Los pacientes crean su cuenta, aceptan los términos y pagan un anticipo (pago **simulado**). Se configura con variables: `VIKA_ANTICIPO` (dólares, 5 por defecto), `VIKA_MINUTOS_PAGO` (15) y `VIKA_HORAS_REEMBOLSO` (0 = nunca se devuelve).

## Zona horaria
Las clínicas usan la hora de Ecuador continental (`America/Guayaquil`, sin cambio de hora) **sin importar la zona del computador**. Para Galápagos: `VIKA_TZ=Pacific/Galapagos`.

## Historial del repositorio y estado de Vika 1.0
El repositorio real de GitHub fue iniciado por **Royant**, único integrante del equipo, el martes 17 de noviembre. El historial conserva commits de ese día, del jueves 19 y de la continuación del viernes 20. Las ramas de trabajo incluyen `cambio-de-planes`, `mejora/citas-simultaneas` y `mejora/offline-seguridad-horarios-copias`; sus cambios fueron integrados en `main` mediante pull requests.

Los commits están firmados con el autor real `Royant <ciadoyant@gmail.com>` y describen qué se cambió. La rama `vika-1.0` contiene la versión de trabajo actual con las pruebas y la documentación consolidadas. **Esta no es todavía la entrega final:** no se ha creado la etiqueta `entrega-final` porque el desarrollo continúa.

Cuando se termine la revisión y se decida cerrar el concurso, se creará la etiqueta sin modificar commits posteriores:
```bash
git tag -a entrega-final -m "Entrega final del concurso ClinAgenda"
git push origin entrega-final
```
