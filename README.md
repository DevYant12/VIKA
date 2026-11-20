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
`npm test` corre las pruebas automáticas (192; validaciones, 500 citas en un día, base de datos, PIN, citas simultáneas, horarios, importación, copias externas, HTTPS, sincronización sin internet y toda la API).
`npm run test:ui` prueba la interfaz con un navegador simulado (caída del internet, citas sin confirmar, choques). Solo esa necesita `npm i --no-save jsdom`.

## Seguridad y publicación
Por defecto Vika **solo escucha en este computador**. Para usarla desde las clínicas hay que ponerle HTTPS: ver `docs/PUBLICAR.md` (también explica las copias externas cifradas y el trabajo sin internet).

## Qué puede hacer la doctora (pestaña Ajustes)
Ver el estado de las copias y hacer una al momento · definir el horario de cada médico en cada clínica y el horario general de cada clínica · activar o desactivar médicos · **importar** pacientes, médicos y horarios desde Excel (primero se revisa sin guardar). Recepción puede **activar el acceso** de un paciente ya registrado o darle un PIN nuevo (pestaña Nuevo paciente).

## Pacientes y anticipo
Los pacientes crean su cuenta, aceptan los términos y pagan un anticipo (pago **simulado**). Se configura con variables: `VIKA_ANTICIPO` (dólares, 5 por defecto), `VIKA_MINUTOS_PAGO` (15) y `VIKA_HORAS_REEMBOLSO` (0 = nunca se devuelve).

## Zona horaria
Las clínicas usan la hora de Ecuador continental (`America/Guayaquil`, sin cambio de hora) **sin importar la zona del computador**. Para Galápagos: `VIKA_TZ=Pacific/Galapagos`.

## Historial del repositorio
Este repositorio **empezó con una versión del sistema que ya existía**, importada en el primer commit (`Importar versión existente de Vika`); por eso el historial anterior a esa fecha no está. Lo hecho después, para cumplir las bases, va en commits separados (cada uno dice qué y por qué). Cada integrante debe hacer sus propios commits desde ahora y poder explicarlos. **Cierre:** el viernes por la noche se crea la etiqueta `entrega-final`:
```bash
git tag entrega-final && git push origin main --tags
```
