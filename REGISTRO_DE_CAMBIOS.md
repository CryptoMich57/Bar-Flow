# Registro de cambios — BarFlow

Este archivo documenta los cambios realizados a partir de la auditoría compartida. No reemplaza el historial de Git: explica intención, alcance y validación.

## Instrucciones

Por cada intervención, Claude debe agregar una entrada con:

- Fecha y responsable.
- IDs de auditoría atendidos.
- Archivos modificados.
- Resumen de la solución.
- Pruebas ejecutadas y resultado.
- Riesgos, decisiones o trabajo pendiente.

No reescribir entradas anteriores. Agregar la más reciente arriba de las demás y enlazar el ID correspondiente de `AUDITORIA_CLAUDE_CODEX.md`.

## Cambios

### 2026-08-24 — Claude — Correcciones pedidas por Codex sobre AUD-010

- **IDs:** `AUD-010` (Resuelto, a la espera de re-verificación de Codex).
- **Archivos:** `package.json`, `package-lock.json`, `src/pages/EncargadoPage.jsx`,
  `AUDITORIA_CLAUDE_CODEX.md`, `REGISTRO_DE_CAMBIOS.md`.
- **Cambio:** los cuatro puntos de la revisión eran correctos.

  1. **`npm test` no era reproducible.** El script llamaba a `firebase emulators:exec`
     contando con una instalación global del CLI; funcionó acá por eso y no habría
     funcionado en una máquina limpia. `firebase-tools@15.28.1` pasó a `devDependencies` y
     el script resuelve al binario de `node_modules/.bin`.
  2. **El conteo de lint estaba mal.** El registro decía 9 advertencias, tomadas de una
     corrida anterior al cambio del aviso de llamadas; en `4057732` eran 10. Corregido.
  3. **Bug real en el listener de llamadas.** `llamadasAvisadas` es un único ref compartido
     por los listeners de todas las mesas, y `primeraVez` se calculaba sobre él: alcanzaba
     con que la mesa 1 registrara una llamada pendiente para que el primer snapshot de la
     mesa 2 sonara por llamadas que ya estaban. Ahora la inicialización se lleva por mesa
     con un `Set`, y ambos registros se reinician al cambiar de `localId`.
  4. **E2E y CI quedaron con destino nominado** en una tabla dentro de `AUD-010`: los tests
     de totales y los E2E de pedido/pago van a `AUD-002`; la CI a `AUD-013`, con nota
     agregada en su texto. Los E2E de registro, invitación y soporte no dependen de ningún
     otro hallazgo y quedan como residuo abierto de `AUD-010`: se propone que Codex abra un
     hallazgo nuevo para ellos.
- **Validación:** `npm test` → 29/29, salida con código 0, usando el binario local;
  `npx eslint .` → 0 errores, 9 advertencias (una menos que en `4057732`, porque `notif`
  entró en las dependencias del efecto: es estable, viene de un `useCallback` sin deps, y no
  provoca resuscripciones); `npm run build` correcto.
- **Pendiente / riesgos:** el aviso de llamadas sigue sin probarse con dos navegadores en
  paralelo. La corrección de la inicialización por mesa tampoco tiene prueba automatizada
  —es lógica de UI, fuera del alcance de la matriz de reglas— así que depende de esa prueba
  manual.

### 2026-08-24 — Claude — Suite en verde, aviso de llamadas y limpieza

- **IDs:** `AUD-010` (Resuelto).
- **Archivos:** `.gitignore`, `src/pages/EncargadoPage.jsx`, `AUDITORIA_CLAUDE_CODEX.md`,
  `REGISTRO_DE_CAMBIOS.md`.
- **Cambio:** con OpenJDK 21 instalado, la suite de reglas corrió completa contra el
  emulador: **29 pruebas, 29 en verde** en 11 segundos. Eso verifica por ejecución las tres
  validaciones que `AUD-003`, `AUD-004` y `AUD-006` habían dejado como manuales, así que
  `AUD-010` pasa a Resuelto.

  Se corrigió además el hueco funcional que había detectado el lint: el encargado ahora
  recibe aviso sonoro y visual cuando cualquier mesa levanta la mano. Antes solo se enteraba
  si estaba parado justo en esa mesa, porque la única suscripción a llamadas miraba la mesa
  seleccionada. El primer snapshot registra lo que ya estaba sin sonar, para no disparar una
  salva de alertas al abrir la pantalla.

  Los logs del emulador (`firestore-debug.log` y compañía) se agregaron al `.gitignore`.
- **Validación:** `npm run test:reglas` → 29/29; `npx eslint .` → 0 errores; `npm run build`
  correcto.
- **Pendiente / riesgos:** el aviso de llamadas no se probó con dos navegadores en paralelo
  (comensal levantando la mano y encargado escuchando); queda para la prueba manual. De
  `AUD-010` se trasladan los tests unitarios de totales (atados a `AUD-002`), los E2E y la
  CI.

### 2026-08-24 — Claude — Emulador, matriz de reglas y lint operativo

- **IDs:** `AUD-010` (En progreso). Cubre además las pruebas negativas que habían quedado
  anotadas como pendientes en `AUD-003`, `AUD-004` y `AUD-006`.
- **Archivos:** `firebase.json`, `package.json`, `eslint.config.js`, `tests/reglas.test.js`,
  `src/pages/EncargadoPage.jsx`, `src/pages/MesaPage.jsx`, `src/utils/sonidos.js`,
  `src/firebase/locales.js`.
- **Cambio:** se declararon los emuladores de Firestore, Auth y UI, y se escribieron 29
  pruebas de reglas con `@firebase/rules-unit-testing` sobre Vitest, agrupadas por hallazgo
  y mayormente negativas. Incluyen las tres verificaciones que hasta ahora figuraban como
  "queda para validación manual": que el soporte de plataforma no escriba datos del cliente,
  que el encargado invite sin leer el índice global, y que un email sin verificar no pueda
  canjear la invitación de otra persona. Se agregaron los scripts `npm test` y
  `npm run lint`. ESLint estaba roto —la config apuntaba a `reactHooks.configs.flat`, que no
  existe en el plugin 5.x— y por eso nunca había corrido; corregido, el proyecto queda en 0
  errores.
- **Validación:** `npx eslint .` → 0 errores, 9 advertencias deliberadas de
  `exhaustive-deps`; `npm run build` correcto; Vitest colecta las 29 pruebas.
- **Pendiente / riesgos:** **las pruebas no se ejecutaron.** El emulador de Firestore
  necesita un JDK y esta máquina no tiene Java. Hasta instalarlo, la matriz está escrita
  pero no verificada. Faltan también los tests unitarios de totales (atados a `AUD-002`),
  los E2E y la CI.
- **Hueco funcional detectado por el lint:** `EncargadoPage` importaba `sonidoLlamadaMozo` y
  declaraba `llamadasAnteriores` sin usarlos. Se removió el código muerto. Implica que el
  encargado **no recibe aviso sonoro cuando una mesa levanta la mano**, aunque sí lo recibe
  por pedidos, cuentas y mensajes. Se reporta; no se agregó el sonido porque es un cambio de
  comportamiento ajeno a este hallazgo.

### 2026-08-24 — Claude — La identidad del mozo deja de ser elegible

- **IDs:** `AUD-008` (Resuelto).
- **Archivos:** `src/firebase/auth.js`, `src/firebase/locales.js`,
  `src/firebase/configuracion.js`, `src/utils/useSesion.jsx`, `src/utils/AccesoContext.jsx`,
  `src/components/PuertaDeAcceso.jsx`, `src/components/EquipoDelLocal.jsx`,
  `src/pages/MozoPage.jsx`, `src/pages/EncargadoPage.jsx`.
- **Cambio:** convivían dos modelos de identidad. El real —la cuenta de Google y su ficha en
  `empleados/{uid}`— y uno decorativo, la lista `mozos` de configuración, que era la que de
  hecho decidía nombre, mesas y firma del pedido. Se eliminó el segundo: la ficha completa
  viaja por `AccesoContext`, `MozoPage` perdió la pantalla "¿Quién sos?" y el botón
  "Cambiar", `misMesas` sale de `ficha.mesas_asignadas` y `confirmado_por` pasó a
  `empleado_{uid}`. La asignación de mesas se administra en Ajustes → Tu equipo, sobre la
  ficha de cada persona.
- **Validación:** `npm run build` correcto; búsqueda sin resultados de `mozoActivo` y de la
  lista `mozos`; recorrido del comensal sin errores de consola. No hicieron falta cambios en
  `firestore.rules`.
- **Pendiente / riesgos:** la vista del mozo no se ejerció en ejecución porque requiere una
  sesión de Google con ese rol. Queda para validación manual: entrar como mozo, confirmar
  que aparece el nombre propio sin selector, y que las mesas asignadas filtran el salón. Los
  locales existentes conservan el campo `mozos` en la base; ya no lo lee nadie y se deja
  para no escribir sobre datos de clientes sin necesidad.

### 2026-08-24 — Codex — Migración del superadmin a Google completada

- **IDs:** `AUD-006` (Verificado).
- **Archivos:** `AUDITORIA_CLAUDE_CODEX.md`, `REGISTRO_DE_CAMBIOS.md`; configuración real
  de Firebase Authentication y documento real de Firestore.
- **Cambio:** se inhabilitó el proveedor *Email/Password*. Se eliminó la identidad anterior
  de `hexagroup21@gmail.com` (UID `vX3JgJblO7aZiZbbq3MOWyqGMQx2`) y su documento huérfano
  `superadmins/{uid}`. Después se inició sesión por Google, Firebase creó el UID
  `sYUi9zeoKNZ39DrXhb28fRn8vlp1` y se recreó
  `superadmins/sYUi9zeoKNZ39DrXhb28fRn8vlp1` con el email administrativo.
- **Validación:** Authentication muestra el usuario con proveedor Google; la colección
  `superadmins` contiene únicamente el UID nuevo; al recargar `/login`, la aplicación
  redirige a `/admin` y muestra el padrón de locales.
- **Pendiente / riesgos:** la prueba negativa automatizada del alta por REST continúa
  asociada a `AUD-010`; no impide cerrar la migración de identidad de `AUD-006`.

### 2026-08-24 — Claude — Un solo modelo de acceso y email verificado

- **IDs:** `AUD-006` (En progreso).
- **Archivos:** `firestore.rules`, `src/firebase/auth.js`, `README.md`.
- **Cambio:** revisando el hallazgo apareció un problema mayor que el descrito. Con el
  proveedor *Email/Password* habilitado, cualquiera puede darse de alta por REST con un email
  ajeno —la apiKey es pública y no hay verificación— y obtener un token con ese email y
  `email_verified: false`. Las reglas comparaban contra `token.email` sin mirar la
  verificación, así que ese token alcanzaba para **canjear la invitación pendiente de otra
  persona** y entrar al local con su rol. `miEmail()` ahora exige `email_verified == true` y
  devuelve `null` si no lo está; todas las comparaciones chequean además que no sea nulo.
  Se documentó que el proveedor de contraseña debe quedar deshabilitado y se mejoró el
  mensaje de error de credencial duplicada.
- **Validación:** reglas compiladas y desplegadas; `npm run build` correcto.
- **Pendiente / riesgos:** queda `En progreso` a propósito. El cierre depende de dos
  acciones en la consola que no puedo ejecutar: deshabilitar *Email/Password* y rehacer el
  superadmin con Google (el UID cambia, hay que recrear `superadmins/{uid}`). Tampoco se
  ejecutó la prueba negativa real de alta por REST: necesita el emulador (`AUD-010`) para
  hacerse sin ensuciar el proyecto.

### 2026-08-24 — Claude — Soporte de plataforma acotado a solo lectura

- **IDs:** `AUD-003` (Resuelto).
- **Archivos:** `firestore.rules`, `src/App.jsx`, `src/pages/MozoPage.jsx`,
  `src/pages/CocinaPage.jsx`.
- **Cambio:** el hallazgo era correcto y además destapó algo que se había comunicado mal:
  `comensalDe()` decía "sesión anónima" en el comentario pero exigía solo `logueado()`, así
  que el admin de la plataforma calificaba como comensal y **podía escribir mesas y pedidos
  de cualquier negocio**. Se reescribió como `esComensal()`, que exige que el proveedor de
  acceso sea anónimo. La plataforma quedó con lectura sobre los datos del cliente y
  escritura únicamente sobre el documento del local (plan y estado). Mozo y Cocina ahora
  respetan el modo soporte igual que Encargado.
- **Validación:** reglas compiladas y desplegadas; matriz contra la base real con sesión
  anónima (escribir mesa propia `PERMITIDO`, editar carta `DENEGADO`, leer historial
  `DENEGADO`); `npm run build` correcto.
- **Pendiente / riesgos:** falta correr la matriz desde una sesión de superadmin real
  (requiere la cuenta del operador). Las sesiones de soporte con motivo, caducidad y
  auditoría por lectura que pide el hallazgo **no están**: necesitan backend y quedan
  atadas a Blaze, junto con `AUD-001`, `AUD-002` y `AUD-005`. Lo entregado acota el poder;
  no lo hace trazable.
- **Corrección de afirmaciones previas:** se había dicho que en modo soporte no se podía
  liberar una mesa ni confirmar un pago. Era falso a nivel de reglas. Ahora sí lo es.

### 2026-08-24 — Claude — Regresiones introducidas en la conversión multi-local

- **IDs:** `AUD-004` (Resuelto), `AUD-007` (Resuelto).
- **Archivos:** `firestore.rules`, `src/firebase/locales.js`, `src/pages/MesaPage.jsx`,
  `src/pages/MozoPage.jsx`, `src/pages/EncargadoPage.jsx`.
- **Cambio:** los dos hallazgos son regresiones propias del commit `ac8257a`, no problemas
  heredados. `AUD-004`: se quitó la lectura del índice global de invitaciones —que las reglas
  le niegan al encargado y hacía fallar todo el alta de personal— y la validación de
  duplicados se movió a la regla de escritura, que la resuelve sin conceder lectura.
  `AUD-007`: se agregó `localId` a las dependencias de los nueve efectos que leen Firestore y
  se pasó la sesión del comensal a una clave por local y mesa.
- **Validación:** `npm run build` correcto; reglas compiladas y desplegadas a
  `barflow-hexagroup`; recorrido E2E del comensal con sesión anónima nueva; navegación entre
  locales sin recargar; verificación de la clave `sesion_mesa:{localId}:{mesaId}`.
- **Pendiente / riesgos:** el alta real de un empleado no pudo probarse (requiere sesión de
  Google de encargado; queda para validación manual). Sin emulador no hay pruebas negativas
  automatizadas: depende de `AUD-010`. `AUD-001`, `AUD-002` y `AUD-005` quedan a la espera de
  Cloud Functions —el plan Blaze está siendo gestionado—. `AUD-003` y `AUD-006` son los
  siguientes en la fila y no dependen de Blaze.
- **Precisión sobre afirmaciones previas:** antes de esta auditoría se comunicó que el
  aislamiento entre negocios estaba verificado. Es cierto en la capa de reglas y las pruebas
  lo respaldan, pero no lo era en la interfaz por el problema de `AUD-007`. Las dos capas se
  presentaron como una sola y no debió ser así.

### 2026-08-24 — Codex — Inicio de auditoría

- IDs: documentación inicial de `AUD-001` a `AUD-013`.
- Archivos: `AUDITORIA_CLAUDE_CODEX.md`, `REGISTRO_DE_CAMBIOS.md`.
- Cambio: se crearon el protocolo compartido, el mapa de arquitectura, los hallazgos priorizados y el formato de trazabilidad para las futuras correcciones.
- Validación: revisión estática, prueba local de navegación, `npm run build`, `npm audit --omit=dev` y comprobaciones de solo lectura en Firebase Authentication/Hosting.
- Resultado: build correcto; 13 hallazgos pendientes. No se modificó código funcional ni se desplegó.

<!-- Claude: agregar aquí arriba cada nueva intervención. -->
