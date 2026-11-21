# Publicar Vika con seguridad

Vika guarda datos de salud y PIN. **Nunca debe quedar abierta en la red sin HTTPS.** Por eso, por defecto, solo escucha en el propio computador (`127.0.0.1`). Para que las tres clínicas la usen hay que ponerle HTTPS delante. Dos formas:

> **Estado de esta rama de prueba:** Vika está preparada para un servidor central y acceso simultáneo, pero no está desplegada en Internet desde este proyecto. Antes de usar datos reales, configure un dominio, HTTPS, una copia externa cifrada y pruebe una restauración en otro equipo. No comparta el puerto 3000 directamente.

## Opción A (recomendada): Caddy como "portero" con HTTPS automático
Caddy consigue y renueva solo el certificado. Se instala en el mismo computador que Vika y necesita un nombre de dominio (ej. `citas.clinicaparedes.com`) apuntando a ese computador.

```
# Caddyfile
citas.clinicaparedes.com {
    reverse_proxy 127.0.0.1:3000
}
```
Vika sigue escuchando solo en `127.0.0.1:3000`; Caddy atiende a las clínicas por HTTPS. Vika usa `X-Forwarded-Proto` para reconocer HTTPS detrás de un proxy y marcar la cookie como `Secure`. Configure el proxy para sobrescribir y no aceptar del cliente esa cabecera sin validar; HSTS se activa en solicitudes que la aplicación reconoce como HTTPS.

## Opción B: certificado propio en Vika
```bash
VIKA_CERT=/ruta/cert.pem VIKA_KEY=/ruta/key.pem VIKA_PUERTO_HTTP=80 PORT=443 npm start
```
Con certificado, Vika escucha en toda la red y redirige `http` → `https`. Para probar en una red interna con un certificado autofirmado (el navegador avisará que "no es de confianza"):
```bash
openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem -days 365 -subj "/CN=localhost"
```

## Copias de seguridad fuera del computador
Vika hace una copia al abrir y cada 6 horas, y **verifica** cada una. Para que no dependa de un solo equipo, configure una carpeta externa:

| Dónde guardar | Ejemplo de `VIKA_BACKUP_EXTRA` |
|---|---|
| USB | `E:\copias-vika` (Windows) · `/media/usb/copias-vika` (Linux) |
| Unidad de red | `\\servidor\copias\vika` |
| Nube | la carpeta sincronizada de Google Drive, OneDrive o Dropbox, ej. `C:\Users\Rosa\OneDrive\copias-vika` |

```bash
VIKA_BACKUP_EXTRA="E:\copias-vika" VIKA_BACKUP_CLAVE="una frase larga que solo usted sabe" npm start
```
- Con `VIKA_BACKUP_CLAVE` la copia externa se **cifra** (AES-256). Si va a la nube, úsela siempre. **Guarde esa frase en un lugar seguro: sin ella la copia no se puede abrir.**
- Si el USB no está conectado, Vika lo dice (pantalla **Ajustes**) en vez de guardar "en el vacío". La doctora ve avisos rojos si hay más de 2 días sin copia externa.
- **Restaurar** (con el servidor apagado): `npm run restaurar -- ruta/vika-2026-11-19.db` (si es `.enc`, defina antes `VIKA_BACKUP_CLAVE`). La base actual se guarda aparte antes de reemplazarla.
- **Pruebe una restauración** en otro computador al menos una vez: una copia que nunca se probó no es una copia.

## Trabajar sin internet (Clínica Sur)
Mientras no hay conexión, el personal puede **seguir agendando**: las citas quedan guardadas en ese computador como **SIN CONFIRMAR** y se envían solas al volver el internet. Cómo funciona y sus límites:

- Se necesita haber iniciado sesión con internet al menos una vez en ese equipo (así guarda la agenda de 7 días).
- Una cita sin confirmar **no es una cita**: hasta que el sistema la acepte, puede perderse la hora. Se le dice al paciente que se le confirmará.
- Si dos clínicas tomaron la misma hora sin internet, **gana la primera que se sincroniza**; a la otra se le muestran horas libres cercanas para elegir con un toque. Nada se pierde en silencio.
- El paciente se reconoce por su cédula; si solo coincide el nombre, el sistema pregunta (no adivina).
- Los datos de esas citas pendientes quedan en el almacenamiento local del navegador hasta enviarse. Esta cola local no está cifrada por Vika; use solo equipos controlados por la clínica, restrinja su acceso y cierre sesión al terminar. HTTPS protege el tránsito, no cifra por sí solo los datos almacenados en el navegador.
- **Para que la página abra aunque el internet esté caído**, se necesita HTTPS (o `localhost`): los navegadores solo guardan la aplicación para uso sin conexión en sitios seguros. Sin HTTPS, funciona si la página ya estaba abierta cuando se cayó la conexión, pero no si se recarga.
- Los pacientes necesitan internet (el anticipo se paga en línea).

## Variables de configuración
| Variable | Qué hace | Por defecto |
|---|---|---|
| `PORT` | Puerto | 3000 |
| `VIKA_HOST` | Dirección donde escucha | `127.0.0.1` (con certificado: toda la red) |
| `VIKA_CERT`, `VIKA_KEY` | Certificado HTTPS propio | — |
| `VIKA_PUERTO_HTTP` | Puerto que redirige a HTTPS | — |
| `VIKA_HTTPS=1` | Marcar cookies `Secure` (si un proxy no envía `X-Forwarded-Proto`) | — |
| `VIKA_DB` | Archivo de la base | `vika.db` |
| `VIKA_BACKUPS` | Carpeta de copias locales | `backups` |
| `VIKA_BACKUP_EXTRA` | Carpeta de copias externas | — |
| `VIKA_BACKUP_CLAVE` | Frase para cifrar la copia externa | — |
| `VIKA_ANTICIPO`, `VIKA_MINUTOS_PAGO`, `VIKA_HORAS_REEMBOLSO` | Anticipo | 5 · 15 · 0 |
