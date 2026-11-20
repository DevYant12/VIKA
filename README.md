# Vika — Agenda de citas

Sistema de citas para las tres clínicas de la Dra. Paredes. Concurso ClinAgenda (Seventech).

## Probar en 5 minutos
Requisito: **Node.js 22.5 o superior** (no hay que instalar nada más).
```bash
npm start
```
Al arrancar, la terminal muestra el **PIN inicial** de la Dra. Paredes. Abra http://localhost:3000, elija su nombre y escriba el PIN. Después, desde la pestaña **Equipo**, cree a las recepcionistas. Registre un paciente (cédula de prueba válida: `1710034065`) y luego agende una cita.

## Estructura
- `server.js` API y servidor · `db.js` base de datos SQLite · `validators.js` validaciones · `auth.js` acceso con PIN y roles
- `horarios.js` horarios por médico y clínica · `importar.js` importar CSV · `ajustes.js` rutas de la doctora
- `offline.js` sincronización de citas hechas sin internet · `backup.js` y `restaurar.js` copias de seguridad
- `public/` interfaz (HTML, CSS, JS; `cola.js` guarda las citas sin internet, `sw.js` deja abrir la página sin conexión)
- `DECISIONES.md` decisiones del equipo · `docs/PUBLICAR.md` HTTPS, copias externas y trabajo sin internet

## Pruebas
`npm test` corre las pruebas automáticas (validaciones, base de datos, PIN, citas simultáneas, horarios, importación, copias externas, HTTPS, sincronización sin internet y toda la API).
`npm run test:ui` prueba la interfaz con un navegador simulado (caída del internet, citas sin confirmar, choques). Solo esa necesita `npm i --no-save jsdom`.

## Seguridad y publicación
Por defecto Vika **solo escucha en este computador**. Para usarla desde las clínicas hay que ponerle HTTPS: ver `docs/PUBLICAR.md` (también explica las copias externas cifradas y el trabajo sin internet).

## Qué puede hacer la doctora (pestaña Ajustes)
Ver el estado de las copias y hacer una al momento · definir el horario de cada médico en cada clínica y el horario general de cada clínica · activar o desactivar médicos · **importar** pacientes, médicos y horarios desde Excel (primero se revisa sin guardar). Recepción puede **activar el acceso** de un paciente ya registrado o darle un PIN nuevo (pestaña Nuevo paciente).

## Pacientes y anticipo
Los pacientes crean su cuenta, aceptan los términos y pagan un anticipo (pago **simulado**). Se configura con variables: `VIKA_ANTICIPO` (dólares, 5 por defecto), `VIKA_MINUTOS_PAGO` (15) y `VIKA_HORAS_REEMBOLSO` (0 = nunca se devuelve).
