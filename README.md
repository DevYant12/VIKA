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
- `public/` interfaz (HTML, CSS, JS) · `DECISIONES.md` decisiones del equipo
