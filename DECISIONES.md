# DECISIONES — Vika (ClinAgenda)

Aquí está lo que decidí para el sistema de la Dra. Paredes, por qué, y lo que **no** resolví. Prefiero decir "esto falta" antes que fingir que todo está resuelto.

**Cómo leer este archivo:** cada pregunta de las bases tiene su respuesta, con una etiqueta: ✅ resuelto y probado · 🟡 resuelto a medias · ❌ no resuelto (con lo que haría).
Las pruebas automáticas (`npm test`, 193) respaldan casi todo lo marcado ✅; entre paréntesis dejo el archivo de pruebas.

---

## 0. Lo que entendí que la clienta necesita

La doctora dijo "haz lo que creas que necesito", pero de su historia saqué tres dolores reales:

1. **Que no se le crucen las citas.**
2. **Que cualquiera pueda usarlo** (doña Rosa incluida, que nunca usó un sistema).
3. **Que no se pierda nada** (citas, datos, ni por error humano ni por fallas).

Todo lo demás lo decidí a partir de esas tres ideas. Supuse además: que Ecuador continental no tiene cambio de hora; que una consulta dura 30 minutos; que el horario por defecto es 8:00–17:00; y que 12 médicos y ~400 pacientes al mes caben sin problema en una base de datos pequeña (SQLite).

### La contradicción de lo que pidió
Quiere que **"cualquiera pueda cancelar fácilmente"** y a la vez **"no soporta que se pierdan citas"**. Chocan si cancelar es un clic descuidado. Decisión:
- Cancelar es **un solo botón**, pero primero pregunta "¿cancelar la cita de X a las Y?".
- La cita **nunca se borra**: queda como *cancelada*, con quién y cuándo.
- Hay botón **Reactivar** para deshacer (si nadie tomó esa hora mientras tanto).
- "Cualquiera" = cualquier persona **que entró con su PIN**, no cualquier persona que pase por ahí.

Con el cambio de planes apareció otra: cancelar es fácil, pero ahora **cuesta** el anticipo. Se mantiene fácil, y el costo se explica antes de confirmar.

---

## 1. Sobre las citas

| Pregunta | Qué hace el sistema | Estado |
|---|---|---|
| Dos recepcionistas, misma hora, mismo médico, mismo segundo | La regla vive en la **base de datos** (índice único médico+hora para citas activas), no en la pantalla. Gana la primera; la segunda ve "esa hora acaba de ser ocupada, elija otra". Probado con 30 peticiones simultáneas: una cita creada, cero errores del sistema. (`concurrencia.test.js`) | ✅ |
| Cita en fecha pasada | Se rechaza explicando por qué. También se rechaza en la sincronización sin internet. | ✅ |
| Cancelar dos veces seguidas | La segunda vez no hace nada malo: avisa "ya estaba cancelada". | ✅ |
| La hora que quedó libre | Se libera al instante y otra persona puede tomarla. | ✅ |
| Un médico en dos clínicas a la misma hora (Dr. Salazar) | La regla mira al **médico**, no a la clínica, así que es imposible. Además cada médico puede tener horario distinto por clínica y día. | ✅ |
| Un día con 500 citas / un día sin ninguna | Se probó con 500 citas en un día (se listan completas en <2 s) y con un día vacío (lista vacía y mensaje claro "no hay citas este día"). (`volumen.test.js`) | ✅ |
| Doble clic en "Agendar" | Devuelve la misma cita, no un falso "ocupada por otra persona" (solo si coinciden paciente, médico, hora y clínica). | ✅ |

## 2. Sobre las personas

| Pregunta | Qué hace el sistema | Estado |
|---|---|---|
| ¿Es el mismo Juan Pérez? ¿Dos con el mismo nombre? | Se compara **por documento** si existe. Si solo coincide el nombre, **no bloquea**: muestra a quién se parece (con fecha de nacimiento) y pide confirmar, porque pueden ser dos personas. Nombres se comparan sin tildes, mayúsculas ni espacios extra. | ✅ |
| Paciente sin cédula, correo ni teléfono | Se puede registrar ("todavía no tiene documento"); teléfono y correo son opcionales. Hay niños y adultos mayores así. Límite: **sin documento no puede crear su propia cuenta** (se le agenda por recepción). | ✅ |
| Teléfono mal escrito | Se valida el formato (celular 09 + 8 dígitos; fijo con código de provincia) y se dice cómo corregir. **Límite:** no se puede saber si el número *existe*; eso solo lo confirmaría un mensaje de prueba (❌, ver "pendiente"). | 🟡 |
| ¿Quién ve qué? | Dos roles de personal + paciente. **Doctora:** todo, crea/quita accesos, ve el historial de movimientos, configura horarios, importa datos, devuelve anticipos. **Recepción:** agenda, cancela, registra pacientes, da acceso a pacientes y consulta el historial administrativo del paciente; no administra personas ni ve la auditoría global. **Paciente:** solo sus propias citas. (`acceso.test.js`) | ✅ |

## 3. Sobre los datos médicos
| Pregunta | Qué hace el sistema | Estado |
|---|---|---|
| ¿Qué pasa si alguien ajeno ve la información? | Nada se ve sin PIN. PIN de 6 números guardado con *scrypt* (nadie, ni yo, puede leerlo), rechaza PIN fáciles (123456, 111111), bloquea 5 minutos tras 5 errores. Cookies HttpOnly + SameSite. Por defecto el servidor **solo escucha en el propio computador**; para usarlo en red hay que ponerle HTTPS (`docs/PUBLICAR.md`). La API nunca se guarda en caché del navegador. Las citas sin confirmar que quedan en el navegador de la Clínica Sur son datos de salud: por eso solo deben usarse **computadores de la clínica**. | ✅ / 🟡 |
| ¿Quién cambió o borró una cita, y cuándo? | Cada creación, cancelación, reactivación, pago, devolución, registro de paciente, entrada al sistema y choque de horas queda en la tabla de auditoría con quién y hora. La doctora lo ve. Las citas **no se borran nunca**. | ✅ |
| ¿Y si se borra todo por accidente? | Copia automática al arrancar y cada 6 horas, verificada antes de darla por buena; guarda las últimas 7. Se puede configurar copia **externa** (USB/red/nube) cifrada. Programa `npm run restaurar` que guarda la base actual antes de reemplazarla. (`backup.test.js`, `respaldo-externo.test.js`) **Límite:** si nadie configura la copia externa ni prueba restaurar, la protección existe solo en el papel; el sistema avisa en rojo si pasan 2 días sin copia externa. | 🟡 |

## 4. Sobre el uso real
| Pregunta | Qué hace el sistema | Estado |
|---|---|---|
| ¿Podría doña Rosa usarlo sin ayuda? ¿Se probó? | En una prueba exploratoria reportada por el equipo, una persona confundió la pantalla inicial con «Entrar» y no vio que debía crear una cuenta. Se priorizó y separó «Crear cuenta» / «Ya tengo cuenta · Entrar», con el acceso del personal aparte. Falta repetir la prueba humana y completar las tareas del guion; no se conocen fecha, dispositivo ni resultados de las otras tareas. Ver `docs/PRUEBA-USUARIO.md`. | 🟡 (repetir y completar) |
| ¿El mensaje de error sirve a una persona normal? | Todos los errores dicen qué pasó y qué hacer ("La cédula no es válida. Debe tener 10 números; revise que no falte ni sobre ninguno"). Un error interno del sistema dice "Algo salió mal… intente de nuevo; si sigue igual, avise a soporte", sin códigos. | ✅ |
| Botón equivocado: ¿se puede deshacer? | Cancelar pide confirmación y se puede **Reactivar**. Registrar un paciente por error no borra nada peligroso (se puede ignorar). **Límite:** reactivar falla si otra persona ya tomó esa hora, y lo explica. | 🟡 |
| ¿Celular, letra pequeña, poca luz? | Diseño adaptable a celular, letra grande, **modo oscuro** automático (sigue la configuración del teléfono) y campos con etiquetas para lectores de pantalla. **No medí el contraste ni lo probé con poca luz real.** | ✅ |

## 5. Sobre los fallos
| Pregunta | Qué hace el sistema | Estado |
|---|---|---|
| Clínica Sur: se cae el internet a mitad de agendar | El personal **sigue agendando**: la cita queda guardada en ese computador como **"SIN CONFIRMAR"** (letras claras, no se confunde con una real) y se envía sola al volver el internet. Cada cita lleva identificador propio, así que reenviar no duplica. Si otra clínica tomó la misma hora mientras tanto, **gana la primera que sincroniza** (la única regla justa: los relojes de cada computador pueden diferir); la otra recibe horas libres cercanas para elegir con un toque, y todo queda en el historial. Nada se pierde en silencio. (`offline.test.js`, `cola.test.js`) **Condiciones:** hay que haber entrado con internet una vez en ese equipo; la agenda guardada cubre 7 días; los **pacientes** no agendan sin internet (el anticipo se paga en línea); y para que la página abra sin internet hace falta HTTPS (los navegadores solo guardan la app en sitios seguros). | ✅ / 🟡 |
| El sistema se cae un lunes a las 8 am | No hay servidor de reserva; la medida real es de proceso: tener las citas del día **impresas** y poder abrir una copia reciente en otro computador (`npm run restaurar`). El sistema no puede evitar que se caiga el computador; sí que se pierda el trabajo. Dejo escrito el plan; **no lo ejecuté** ni lo ensayé con la clienta. | 🟡 |
| Horarios distintos por clínica / cambio de hora | La doctora define **por médico, clínica y día** el horario; sin horario propio, se usa el general de la clínica. Al cambiar un horario, avisa cuántas citas ya agendadas quedaron fuera (no las cancela sola). **Cambio de hora:** Ecuador continental no tiene. Aun así el servidor ya **no depende de la zona del computador**: usa `America/Guayaquil` (se cambia con `VIKA_TZ`, p. ej. `Pacific/Galapagos` que es UTC-6). (`validators.test.js`, `horarios.test.js`) | ✅ |

## 6. Sobre lo que la clienta no dijo
Cosas que un sistema así necesita y ella no mencionó:
- **Auditoría y copias de seguridad** ✅ (arriba).
- **Quién administra cuando ella no está:** hoy solo existe el rol "doctora". ❌ Habría que permitir un segundo administrador de confianza.
- **Historial por paciente** ✅ (`GET /api/pacientes/:id/citas` y botón «Ver historial» desde Buscar paciente).
- **Recordatorios por mensaje** (faltan menos pacientes) ❌.
- **Lista de espera** para aprovechar horas liberadas ❌.
- **Cambio de médico o clínica:** si cambia el plan, se cancela la cita y se registra una nueva.
- **Privacidad legal:** en Ecuador rige la Ley Orgánica de Protección de Datos Personales; los datos de salud son sensibles. No soy abogado: antes de usarlo de verdad hay que revisar consentimiento, retención y quién es el responsable del tratamiento.

## 7. Sobre la calidad de los datos
| Pregunta | Qué hace el sistema | Estado |
|---|---|---|
| Cédula con 9 dígitos, letras, "0000000000" | Se rechazan. La cédula debe tener 10 dígitos, **provincia válida (01–24 o 30), tercer dígito ≤5 y el dígito verificador módulo 10 correcto**. Así se distingue una cédula real de una que solo lo parece (aunque no se puede saber si pertenece a alguien: eso solo lo sabe el Registro Civil). (`validators.test.js`) | ✅ |
| Extranjero con pasaporte / sin documento | Pasaporte (5–20 letras/números) y la opción "todavía no tiene documento". | ✅ |
| Teléfono "12345", correo "juan@@gmail" | Se rechazan con mensaje que dice cómo corregir. | ✅ |
| Nacido en 2090 o con 300 años | Se rechaza: no futura, máximo 120 años y **fecha real** (se corrigió un fallo mío: antes aceptaba "31 de febrero" porque JavaScript lo convertía en marzo). | ✅ |
| "MARÍA lópez" vs "Maria Lopez" | Se normalizan (tildes, mayúsculas, espacios) para comparar; se **guarda como se escribió**. Mismo nombre ≠ mismo paciente: pregunta antes de asumir. | ✅ |
| Cuando el sistema rechaza un dato… | Dice qué está mal y cómo corregirlo **sin borrar lo que la persona ya escribió**. | ✅ |
| Texto raro (emojis, comillas, código) | Los nombres solo admiten letras (rechaza emojis y `<script>`); todo texto se limpia en el servidor y en pantalla se muestra siempre como texto (nunca se ejecuta). Todas las consultas a la base usan parámetros (no se arma SQL con lo que escribe la gente). (`api.test.js`, `seguridad.test.js`) | ✅ |

## 8. Datos de prueba (martes)
El sistema **importa** pacientes, médicos, horarios y **citas pasadas** desde Excel/CSV (Ajustes → Importar). Primero se **revisa sin guardar** y se muestra fila por fila qué se importaría y por qué no. Arregla lo que Excel suele dañar: ceros iniciales de cédulas y celulares, fechas día/mes/año, tildes, separador `;`. Los que se parecen a alguien ya registrado **no** se importan salvo que la doctora lo pida. Repetir una importación no duplica.
No tuve a mano el archivo real del martes, así que preparé `datos-ejemplo/` con datos **inventados y sucios a propósito** (cédulas falsas, homónimos, 31 de febrero, emojis, código pegado) para demostrar que el sistema decide qué hacer con lo que encuentra. **Si el archivo real trae columnas con nombres que no reconoce, hay que agregar el sinónimo en `importar.js` (tabla `SINONIMOS`).**

## 9. El cambio de planes
Pidió: los pacientes agendan ellos mismos tras entrar con su cuenta, pagan un anticipo **no reembolsable** y aceptan términos y condiciones antes.
- Cuenta del paciente con cédula/pasaporte y PIN de 6 números; puede cambiar su PIN; recepción puede activarle el acceso o darle un PIN nuevo (se muestra una sola vez, nunca queda en el historial; hay que verificar la cédula en persona).
- Debe leer y **marcar** los términos; se guarda **qué versión** aceptó y **cuándo**.
- La hora queda apartada **15 minutos** mientras paga; si no paga, se libera sola.
- Si cancela con el anticipo pagado, queda **retenido** y se le avisa **antes** de confirmar. Si no había pagado, cancelar es gratis.
- Monto y plazos por variables: `VIKA_ANTICIPO` ($10 por defecto), `VIKA_MINUTOS_PAGO` (15), `VIKA_HORAS_REEMBOLSO` (0 = nunca).
- El anticipo se devuelve completo si cancela la clínica o hay emergencia (solo la doctora, y queda anotado).
- **El pago es SIMULADO.** Un botón lo marca como pagado. Con un proveedor real (PayPhone, Stripe…) debe confirmarse con el aviso del proveedor, nunca con lo que diga el navegador. Nunca se guardan datos de tarjeta.
- **Riesgo legal que no puedo resolver:** no soy abogado. La Ley Orgánica de Defensa del Consumidor regula los contratos de adhesión y declara nulas ciertas cláusulas abusivas; no encontré norma que diga expresamente si un anticipo no reembolsable para una cita médica es válido. **Hay que revisarlo con un abogado antes de cobrar.** Por eso dejé las tres salidas (devolución por clínica/emergencia, texto claro antes de pagar, ventana de devolución por variable).

## 10. Mejoras implementadas en la finalización
**Decisión de última hora:** decidí quitar la opción de cambiar una cita porque me di cuenta de que tenía un fallo y preferí dejar únicamente la cancelación, para no ofrecer una operación que pudiera dejar datos o disponibilidad inconsistentes.

1. **Cancelación:** una cita se cancela con confirmación, nunca se borra, y puede reactivarse si la hora sigue libre; el anticipo se trata según sus reglas y queda en auditoría. ✅
2. **Historial desde la interfaz:** «Buscar paciente» permite abrir las citas activas y canceladas. La API no expone este historial a pacientes. ✅
3. **Recepción fácil:** inicio con cuatro acciones grandes, ayuda contextual sin Internet, navegación de teclado y tamaño de letra por usuario. La prueba exploratoria reveló confusión al crear cuenta; se cambió el acceso y queda pendiente validarlo de nuevo con una persona.
4. **Pruebas:** la suite automática y la prueba de interfaz cubren cancelación, reactivación, citas sin internet y el resto de reglas del sistema.

## 11. Lo que NO resolví (y cómo lo haría)
1. **Repetir y completar la prueba con una persona no técnica** después del cambio del acceso. Cronometrar las 5 tareas sin ayuda y registrar fecha, dispositivo y resultados en `docs/PRUEBA-USUARIO.md`.
2. **Pago real del anticipo** (proveedor + confirmación por webhook).
3. **Verificación en dos pasos.** Un PIN de 6 números es una barrera modesta frente a alguien con acceso físico al equipo.
4. **Recordatorios por mensaje y lista de espera.**
5. **Segundo administrador** y registro de quién tiene acceso.
6. **Confirmar que un teléfono existe** (mensaje de prueba).
7. **Que la doctora configure y pruebe la copia externa.** Es lo único que no puedo garantizar yo.
8. **Recordatorios y lista de espera** requieren diseño adicional e integraciones o proceso operativo.

## 12. Uso de inteligencia artificial
Usé IA para escribir y revisar código y pruebas. Antes de pedirle nada leí la historia, listé las preocupaciones y decidí las reglas (qué pasa con cada pregunta); después la usé para implementarlas y para buscar casos que se me escapaban (por ejemplo, el "31 de febrero" y la dependencia de la zona horaria salieron de revisar el código con mirada crítica). Cada parte del sistema está cubierta por pruebas y debo poder explicarla en la defensa.

## 13. Control de versiones y datos sensibles
- El repositorio no contiene datos reales, contraseñas ni llaves: `.gitignore` excluye `*.db`, copias (`backups/`), `.env` y `node_modules/`. El PIN inicial de la doctora se **genera al arrancar** y solo se muestra en la terminal.
- Los datos de `datos-ejemplo/` son inventados.
- Historial: ver `README.md` (sección *Historial del repositorio*) para una descripción honesta de cómo se construyó.
