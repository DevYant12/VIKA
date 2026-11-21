# Vika — Agenda de citas

Sistema de citas para las tres clínicas de la Dra. Paredes. Concurso ClinAgenda (Seventech).

## Probar en 5 minutos
Requisito: **Node.js 22.5 o superior** (no hay que instalar nada más).
```bash
npm start
```
Al arrancar, la terminal muestra `Vika lista en http://127.0.0.1:3000` y el **PIN inicial** de la Dra. Paredes. Abra http://127.0.0.1:3000, elija su nombre y escriba el PIN. Después, desde la pestaña **Equipo**, cree a las recepcionistas. Registre un paciente (cédula de prueba válida: `1710034065`) y luego agende una cita.

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
`npm test` pasó: 202 pruebas, 0 fallos. Incluye validación de calendario estricta y pruebas de citas, cancelación/reactivación y sincronización offline.
`npm run test:ui` pasó con 28 comprobaciones del flujo de interfaz (incluidas selección por teclado y claridad de crear cuenta/entrar), usando `jsdom` instalada mediante `npm ci`.

## Interfaz de recepción fácil
Después de entrar como personal aparece un inicio con cuatro acciones grandes: **Agendar cita**, **Consultar citas**, **Registrar paciente** y **Buscar paciente**. Desde la agenda se puede cancelar una cita con confirmación y reactivarla si la hora sigue libre. Desde Buscar paciente se puede abrir el historial administrativo de citas y anticipos, sin mostrar información médica innecesaria.

La ayuda contextual funciona sin Internet desde «¿Necesitas ayuda?». El tamaño de letra se puede guardar por usuario como Normal, Grande o Muy grande. En una prueba exploratoria, una persona confundió crear cuenta con entrar; se aclaró la pantalla. En la prueba posterior reportada, la persona pudo usar el sistema como cliente sin problemas. Esto no sustituye la prueba completa del flujo de recepción con doña Rosa ni el registro de todas las tareas: ver `docs/PRUEBA-USUARIO.md`.

## Seguridad y publicación
Por defecto Vika **solo escucha en este computador**. Para usarla desde las clínicas hay que ponerle HTTPS: ver `docs/PUBLICAR.md` (también explica las copias externas cifradas y el trabajo sin internet).

## GitHub y comprobación automática
GitHub debe alojar el repositorio y su historial; `.github/workflows/test.yml` ejecuta `npm test` y `npm run test:ui` con Node.js 22 en cada cambio. **GitHub Pages no puede ejecutar Vika completa**, porque solo sirve archivos estáticos y no ejecuta `server.js`, SQLite, sesiones ni la API. Para usar la aplicación real desde las tres clínicas se necesita un servidor Node.js con HTTPS; la guía está en `docs/PUBLICAR.md`.

## Qué puede hacer la doctora (pestaña Ajustes)
Ver el estado de las copias y hacer una al momento · definir el horario de cada médico en cada clínica y el horario general de cada clínica · activar o desactivar médicos · **importar** pacientes, médicos y horarios desde Excel (primero se revisa sin guardar). Recepción puede **activar el acceso** de un paciente ya registrado o darle un PIN nuevo (pestaña Nuevo paciente).

## Pacientes y anticipo
En el primer ingreso, los pacientes distinguen **Soy paciente nuevo · Crear cuenta** de **Ya tengo cuenta · Entrar**. Aceptan los términos y pagan un anticipo de **$10** (pago **simulado**). Se configura con variables: `VIKA_ANTICIPO` (dólares, 10 por defecto), `VIKA_MINUTOS_PAGO` (15) y `VIKA_HORAS_REEMBOLSO` (0 = nunca se devuelve).

## Zona horaria
Las clínicas usan la hora de Ecuador continental (`America/Guayaquil`, sin cambio de hora) **sin importar la zona del computador**. Para Galápagos: `VIKA_TZ=Pacific/Galapagos`.

## Historial del repositorio
Vika la empecé yo; al crear el repositorio subí una base inicial del proyecto que ya venía desarrollando. Por eso el historial de Git comienza con esa primera carga y no refleja el trabajo previo que hice antes de subirlo; **no partí de un sistema ajeno ya terminado**. La rama `subida-para-prueba-con-persona` conserva la historia enlazada a GitHub, con commits fechados el 17, 19 y 20 de noviembre y autorías de `Royant` y `DevYant12`. Durante el cierre me equivoqué al trabajar temporalmente en una copia local `main` de respaldo sin revisar rama/upstream y dejé cambios sin commit; al principio confundí el historial de esa copia con el del repositorio remoto. Fue un error por no saber usar Git con suficiente cuidado. No se reescribieron ni inventaron fechas o autores.

**Entrega:** `main` es la rama predeterminada que aparece al abrir el repositorio y contiene la versión final. La etiqueta `entrega-final` identifica ese mismo estado. Si se hacen cambios posteriores, se registran en commits nuevos y no se falsifica el historial.
