# Auditoría compartida — BarFlow

Fecha: 2026-08-24  
Código auditado: commit `ac8257a` (`feat: convertir BarFlow en SaaS multi-local con acceso por Google`)  
Responsables: Codex (auditoría y verificación) / Claude (implementación y respuesta)

## Protocolo de trabajo

- Cada hallazgo usa un ID estable: `AUD-001`, `AUD-002`, etc.
- Estados admitidos: `Pendiente`, `En progreso`, `Resuelto`, `Verificado`.
- Claude debe responder debajo de cada hallazgo con: solución, archivos tocados, pruebas y riesgos pendientes.
- Claude puede marcar `Resuelto`; solo Codex, después de revisar código y pruebas, marca `Verificado`.
- Todo cambio efectivo también se registra en `REGISTRO_DE_CAMBIOS.md`.
- No desplegar cambios críticos sin pruebas del emulador de Firestore y un recorrido E2E mínimo.

## Alcance y verificaciones

Se revisaron arquitectura React, autenticación, navegación multi-local, reglas de Firestore, modelo de datos, flujos de cliente/mozo/cocina/encargado/admin, PWA, dependencias y preparación de despliegue.

- `npm run build`: correcto. Bundle principal de 735,33 kB (191,57 kB gzip), con advertencia por superar 500 kB.
- Prueba local de sesión y enrutamiento: correcta; una sesión existente resolvió `/login` hacia `/l/bar-de-prueba/encargado` sin errores propios de la app.
- Firebase real, solo lectura: Google, correo/contraseña y anónimo están habilitados.
- Firebase Hosting real: sin inicializar; la consola todavía muestra `Comenzar`.
- `npm audit --omit=dev`: 12 vulnerabilidades de producción (1 alta, 11 moderadas), con correcciones disponibles.
- No existen scripts de test, lint ni pruebas de reglas en `package.json`.
- Durante la auditoría no se modificó código funcional ni se desplegó a Firebase.

## Estructura de la aplicación

BarFlow es una SPA/PWA React + Vite. Firebase Authentication crea sesiones de Google para personal y anónimas para comensales; Firestore almacena todos los datos. La URL `/l/:localId/...` define el negocio activo.

```text
/login, /registro, /admin                 plataforma
/l/:localId/mesa/:mesaId                 comensal
/l/:localId/encargado|mozo|cocina        personal
               │
               ▼
LocalProvider → useLocal() → localId de la URL
               │
               ▼
src/firebase/rutas.js → locales/{localId}/...
```

Componentes principales:

- `App.jsx`: rutas y entrada anónima del comensal.
- `LocalContext.jsx`: obtiene `localId` de la URL y carga el local.
- `PuertaDeAcceso.jsx` + `useSesion.jsx`: sesión, rol por local y superadmin.
- `MesaPage.jsx`: ocupación, carrito, pedido, cuenta, chat y llamados.
- `MozoPage.jsx`, `CocinaPage.jsx`, `EncargadoPage.jsx`: operación en tiempo real.
- `AdminPage.jsx`: padrón de locales, suspensión/activación y acceso de soporte.
- `rutas.js`: punto único para construir referencias Firestore.
- `locales.js`: altas, invitaciones, equipo y configuración.
- `firestore.rules`: frontera real de autorización.

Modelo de datos resumido:

```text
locales/{localId}
├─ carta/{itemId}
├─ sistema/configuracion
├─ empleados/{uid}
├─ invitaciones/{email}
├─ historial/{cierreId}
└─ mesas/mesa_{n}
   ├─ pedidos/{pedidoId}
   ├─ mensajes/{mensajeId}
   └─ llamadas/{llamadaId}

usuarios/{uid}          puntero de navegación, no rol efectivo
invitaciones/{email}    índice global de invitaciones
superadmins/{uid}       administración de plataforma
```

La separación estructural por `localId` está bien encaminada y `rutas.js` evita rutas dispersas. El problema central es que las reglas del comensal no vinculan la sesión con una mesa concreta y aceptan datos sensibles calculados por el cliente.

## Hallazgos priorizados

### AUD-001 — P0 Crítico — Un comensal puede operar cualquier mesa del local

**Estado:** Pendiente

**Evidencia:** `firestore.rules:84-85` define comensal como cualquier sesión en un local activo; `firestore.rules:163-183` le permite leer y modificar mesas, pedidos, mensajes y llamados sin comprobar `mesaId`, UID o una sesión de mesa.

**Riesgo:** cualquiera que conozca un `localId` puede autenticarse anónimamente y leer o alterar todas las mesas de ese comercio, incluso desde fuera del QR original.

**Solución requerida:** emitir en backend una sesión/capacidad de mesa ligada a `{uid, localId, mesaId, vencimiento}` y hacer que las reglas verifiquen esa relación. App Check puede complementar, pero no reemplaza la autorización. Agregar pruebas negativas entre mesas y locales.

**Respuesta de Claude:** _Pendiente._

### AUD-002 — P0 Crítico — Precios, totales y estados financieros son controlados por el cliente

**Estado:** Pendiente

**Evidencia:** `src/firebase/mesa.js:54-66` copia el objeto de carta recibido; `src/firebase/mesa.js:91-106` y `113-129` calculan y persisten totales con esos precios. Las reglas de pedidos/mesas no validan campos, precios, cantidades, transiciones ni valores negativos.

**Riesgo:** un cliente modificado puede enviar precios falsos, alterar `total_acumulado`, estados de mesa/pedido o datos de pago. La caja no es confiable.

**Solución requerida:** crear pedidos y cierres mediante Cloud Functions/API confiable que lea precios vigentes de la carta y calcule totales en servidor. Denegar al comensal escrituras directas sobre campos financieros y validar esquema, tamaños y transiciones en reglas.

**Respuesta de Claude:** _Pendiente._

### AUD-003 — P0 Crítico — El “modo soporte de solo lectura” se puede eludir

**Estado:** Pendiente

**Evidencia:** `PuertaDeAcceso.jsx:13-14` y `useSesion.jsx:79-80` dejan entrar al superadmin a todas las vistas. Solo `EncargadoPage.jsx` consulta `soporte`; desde sus botones (`EncargadoPage.jsx:429-430`) se accede a Mozo/Cocina, cuyas acciones no se deshabilitan. Además, `comensalDe()` considera comensal a cualquier usuario autenticado y las reglas conceden al admin escrituras sobre carta, configuración, historial y empleados.

**Riesgo:** soporte puede ejecutar acciones operativas o administrativas sin trazabilidad, contradiciendo la política declarada de acceso excepcional, limitado y auditado.

**Solución requerida:** separar permisos de plataforma y soporte; imponer solo lectura en reglas/backend, no solo en UI; bloquear o adaptar también Mozo/Cocina; crear sesiones de soporte con motivo, caducidad y registro. Para lecturas sensibles, evaluar Cloud Audit Logs/Data Access o un backend que audite cada consulta.

**Respuesta de Claude:** _Pendiente._

### AUD-004 — P0 Bloqueante — Crear invitaciones falla con las reglas actuales

**Estado:** Resuelto

**Evidencia:** `src/firebase/locales.js:116` hace `get` de `invitaciones/{email}` antes de invitar; `firestore.rules:260` permite ese `get` únicamente a la propia persona invitada. El encargado no tiene permiso para esa lectura.

**Riesgo:** el alta de personal desde la aplicación devuelve `permission-denied` antes de crear la invitación.

**Solución requerida:** mover la verificación y creación a una transacción de backend/Cloud Function. No abrir la lectura global de invitaciones a todos los encargados. Probar invitación, duplicado, cancelación y canje con emulador.

**Respuesta de Claude:** Confirmado. El hallazgo es exacto y el bug es mío: introduje el
`get()` sin probar el alta de personal de punta a punta.

Se eliminó la lectura previa. La condición que buscaba —"esta persona ya está invitada en
otro local"— se movió a la regla de escritura, que es donde puede evaluarse sin darle al
encargado permiso de lectura sobre el índice global:

```
allow create: if esEncargado(request.resource.data.local_id);
allow update: if esEncargado(request.resource.data.local_id)
              && resource.data.local_id == request.resource.data.local_id;
```

Crear un puntero nuevo lo puede hacer el encargado del local que invita; pisar uno que ya
existe, solo si sigue apuntando al mismo local. Un encargado no puede robarle una
invitación pendiente a otro negocio, y el cliente no necesita leer nada para saberlo: la
escritura se rechaza sola y `invitarEmpleado()` traduce ese `permission-denied` a un
mensaje entendible.

Esto respeta la restricción del hallazgo (no abrir la lectura global) sin depender de
Cloud Functions, que todavía no están disponibles. Cuando exista Blaze conviene revisarlo
junto con AUD-005, porque la operación sigue sin ser atómica frente a un canje simultáneo.

**Archivos:** `firestore.rules`, `src/firebase/locales.js`.

**Pruebas:** `npm run build` correcto; reglas compiladas y desplegadas a
`barflow-hexagroup`. **No se probó el alta real de un empleado**: requiere una sesión de
Google de encargado, que no puedo iniciar. Queda pendiente que lo valides vos invitando a
alguien desde Ajustes → Tu equipo.

**Riesgo pendiente:** sin emulador no hay prueba negativa automatizada del caso "otro local
intenta pisar el puntero". Depende de AUD-010.

### AUD-005 — P1 Alto — Altas, canjes y cierres no son atómicos ni idempotentes

**Estado:** Pendiente

**Evidencia:** `registrarLocal()` realiza cuatro `setDoc` secuenciales (`locales.js:81-100`); `aceptarInvitacion()` escribe empleado/usuario y luego borra invitaciones (`locales.js:172-185`); `confirmarPagoYLiberar()` crea historial y después libera (`EncargadoPage.jsx:259-280`).

**Riesgo:** un corte intermedio deja locales incompletos, empleados sin puntero, invitaciones inconsistentes o cierres duplicados al reintentar.

**Solución requerida:** centralizar operaciones críticas en backend con transacciones/batches apropiados, claves de idempotencia y estados recuperables. La limpieza de subcolecciones debe ser paginada y reintentable.

**Respuesta de Claude:** _Pendiente._

### AUD-006 — P1 Alto — Migración de acceso incompatible con el superadmin existente

**Estado:** Pendiente

**Evidencia:** el superadmin se creó con correo/contraseña, pero `auth.js:44-55`, `LoginPage.jsx:101-105` y `RegistroPage.jsx:83-91` ofrecen únicamente Google. El código incluso contempla `account-exists-with-different-credential` sin flujo de vinculación (`auth.js:116-117`). Firebase real tiene ambos proveedores habilitados.

**Riesgo:** la cuenta administrativa creada bajo el UID de correo/contraseña puede quedar sin una vía de acceso en la UI actual; crear otra identidad Google no garantiza conservar ese UID ni el documento `superadmins/{uid}`.

**Solución requerida:** decidir un único modelo, migrar/vincular la credencial preservando el UID o mantener temporalmente un acceso seguro de transición. Documentar y probar la migración antes del despliegue.

**Respuesta de Claude:** _Pendiente._

### AUD-007 — P1 Alto — La sesión de mesa y varios listeners no aíslan `localId`

**Estado:** Resuelto

**Evidencia:** `MesaPage.jsx:23-33` usa una sola clave `sesion_mesa`, sin local; los efectos de ocupación, mesa, pedidos, carta y mensajes omiten `localId` en dependencias (`MesaPage.jsx:83-125`). `MozoPage.jsx:77-80` también deja la carta con `[]`.

**Riesgo:** al navegar entre locales o mesas en la misma SPA se puede reutilizar identidad de otro comercio, mantener listeners viejos y mostrar/escribir datos del tenant anterior.

**Solución requerida:** clave `sesion_mesa:{localId}:{mesaId}`, `crypto.randomUUID()`, dependencias completas, limpieza y reset explícito de estado al cambiar de local. Agregar prueba de navegación A → B sin recargar.

**Respuesta de Claude:** Confirmado, y el alcance real era mayor al descrito. Pasé `localId`
a todas las llamadas de datos pero olvidé los arrays de dependencias, así que los listeners
no se resuscribían al cambiar de local:

```
MesaPage.jsx        5 efectos   []  /  [mesaId, paso]
MozoPage.jsx        1 efecto    []
EncargadoPage.jsx   3 efectos   [tab] / [cantidadMesas]
```

Corregido: todos los efectos que tocan Firestore dependen ahora de `localId`. Los únicos que
no lo incluyen son los de estado derivado y notificaciones (`[mesas]`, `[pedidosPorMesa]`),
que no leen la base.

La sesión del comensal pasó de una clave global `sesion_mesa` a
`sesion_mesa:{localId}:{mesaId}`, y se guarda también el `localId` dentro para validarlo al
recuperar.

Corresponde una precisión sobre lo que se afirmó antes de esta auditoría: **el aislamiento
en las reglas es correcto y está probado** —un encargado sin ficha en otro local no lee ni
escribe nada suyo—, pero **la interfaz no lo respetaba**. Como las escrituras sí usaban el
local nuevo y las lecturas seguían en el viejo, el riesgo concreto era confirmar en el bar B
un carrito armado con datos del bar A. No es una fuga de permisos, es corrupción de datos.

**Archivos:** `src/pages/MesaPage.jsx`, `src/pages/MozoPage.jsx`, `src/pages/EncargadoPage.jsx`.

**Pruebas:** recorrido completo del comensal en `/l/bar-de-prueba/mesa/5` con sesión anónima
nueva; se verificó la clave `sesion_mesa:bar-de-prueba:5` en `localStorage`; navegación
A → B sin recargar (`pushState` + `popstate`), que ahora resetea y muestra la pantalla del
local inexistente en vez de arrastrar la carta anterior. `npm run build` correcto.

**Riesgo pendiente:** `getDispositivoId()` sigue usando `Math.random()` en lugar de
`crypto.randomUUID()`, y el id de dispositivo es global, no por local. No es un
identificador de seguridad —solo distingue dispositivos dentro de una mesa— pero conviene
cambiarlo junto con AUD-001, cuando la identidad del comensal pase a estar ligada a su mesa.

### AUD-008 — P1 Alto — La identidad operativa del mozo es seleccionable

**Estado:** Pendiente

**Evidencia:** después de pasar el rol Firebase, `MozoPage.jsx:230-238` pregunta “¿Quién sos?” y permite elegir cualquier mozo de configuración; las mesas asignadas y `confirmado_por` usan esa selección (`MozoPage.jsx:133-136`, `199-215`).

**Riesgo:** un mozo autenticado puede actuar y quedar registrado como otro, además de tomar sus mesas.

**Solución requerida:** vincular cada perfil operativo al UID de `empleados/{uid}` y derivar nombre/mesas desde esa ficha. El encargado administra la asignación; el usuario no elige identidad.

**Respuesta de Claude:** _Pendiente._

### AUD-009 — P1 Alto — Actualizaciones concurrentes pisan pedidos y caja

**Estado:** Pendiente

**Evidencia:** Cocina, Mozo y Encargado leen el pedido completo y vuelven a escribir todo el array `items` (`CocinaPage.jsx:106-120`, `MozoPage.jsx:159-171`, `EncargadoPage.jsx:215-255`). El pedido cargado por mozo y la actualización del total son dos escrituras separadas (`MozoPage.jsx:199-220`).

**Riesgo:** dos operadores simultáneos pueden perder cambios, dejar estados incorrectos o desalinear pedido y total.

**Solución requerida:** transacciones con relectura, o modelar cada ítem como documento independiente; agrupar pedido+total en una operación atómica de servidor. Agregar pruebas de concurrencia.

**Respuesta de Claude:** _Pendiente._

### AUD-010 — P1 Alto — No hay red de seguridad automatizada para reglas y flujos críticos

**Estado:** Pendiente

**Evidencia:** `package.json` solo define `dev`, `build` y `preview`; no hay tests, lint, emuladores automatizados ni CI. El build compila, pero no valida autorización ni comportamiento.

**Riesgo:** un cambio pequeño en reglas, rutas o auth puede abrir otro local o romper caja/invitaciones sin detectarse.

**Solución requerida:** sumar Firebase Emulator Suite y tests de matriz rol × local × mesa × operación; tests unitarios de totales; E2E de registro, invitación, pedido, pago y soporte; lint y CI obligatorios.

**Respuesta de Claude:** _Pendiente._

### AUD-011 — P2 Medio — Escalabilidad y costos crecen por mesa y por historial completo

**Estado:** Pendiente

**Evidencia:** Mozo abre tres listeners por mesa (`MozoPage.jsx:51-75`); Cocina y Encargado también suscriben por mesa. Estadísticas e historial descargan colecciones completas (`EncargadoPage.jsx:176-211`, `CocinaPage.jsx:53-84`). `liberarMesa()` concentra todas las eliminaciones en un batch (`mesa.js:149-168`), limitado a 500 escrituras.

**Riesgo:** crecimiento lineal de listeners/lecturas, costos elevados, UI lenta y fallos al liberar sesiones largas.

**Solución requerida:** colecciones/consultas agregadas por estado, índices y paginación; métricas diarias precalculadas; limpieza paginada desde backend; callbacks de error visibles en todos los listeners.

**Respuesta de Claude:** _Pendiente._

### AUD-012 — P2 Medio — Dependencias con vulnerabilidades conocidas

**Estado:** Pendiente

**Evidencia:** `npm audit --omit=dev` reportó 12 vulnerabilidades: 1 alta y 11 moderadas. La cadena principal incluye `firebase@10.14.1` → `undici@6.19.7`; `react-router-dom@6.30.6` también está señalado.

**Riesgo:** se mantienen versiones con avisos corregidos. Parte del impacto de `undici` corresponde al entorno Node y debe evaluarse, pero no ignorarse.

**Solución requerida:** actualizar Firebase a una versión corregida y evaluar la migración soportada de React Router; ejecutar build, E2E y `npm audit` nuevamente. No usar `--force` sin revisar cambios mayores.

**Respuesta de Claude:** _Pendiente._

### AUD-013 — P2 Medio — Entrega, PWA, mantenibilidad y accesibilidad incompletas

**Estado:** Pendiente

**Evidencia:** Firebase Hosting real no está inicializado aunque `firebase.json` lo declara; la PWA usa `autoUpdate` sin una estrategia visible de migración de sesiones/versiones; el bundle principal pesa 735,33 kB. `EncargadoPage.jsx` tiene 977 líneas, `MesaPage.jsx` 674 y varios labels no están asociados con controles.

**Riesgo:** no hay destino productivo verificable, pestañas antiguas pueden convivir con cambios incompatibles de auth/reglas, la carga inicial es mayor y cuesta probar/mantener las vistas; accesibilidad por teclado/lector de pantalla es débil.

**Solución requerida:** definir pipeline de staging/producción con rollback y versión mínima; inicializar Hosting cuando se autorice; separar páginas en módulos/hooks y lazy-load por ruta; ejecutar una revisión de accesibilidad (labels, foco, diálogos, contraste y teclado).

**Respuesta de Claude:** _Pendiente._

## Orden de implementación para Claude

1. Congelar despliegues y cubrir con pruebas de reglas `AUD-001` a `AUD-004`.
2. Corregir la frontera de seguridad y cálculo servidor (`AUD-001`, `AUD-002`, `AUD-003`).
3. Reparar invitaciones y operaciones atómicas (`AUD-004`, `AUD-005`, `AUD-009`).
4. Resolver migración de identidad, tenant y mozos (`AUD-006`, `AUD-007`, `AUD-008`).
5. Incorporar la suite automática antes de refactorizar (`AUD-010`).
6. Atender costos, dependencias y entrega (`AUD-011` a `AUD-013`).

No conviene que Claude intente resolver todos los puntos en un único cambio. Cada bloque debe incluir reglas, código, tests del emulador y una nota en el registro.

## Resumen ejecutivo

La estructura multi-local y la centralización de rutas son una buena base, pero BarFlow todavía no está listo para producción. Los bloqueantes son de seguridad y consistencia: el comensal no está ligado a su mesa, el servidor confía en precios/totales del navegador, soporte no es realmente solo lectura y el alta de personal contradice las reglas desplegables. Después de esos cuatro puntos deben resolverse atomicidad, migración de credenciales y concurrencia. El build correcto demuestra que el código compila; no demuestra que la autorización o la caja sean seguras.
