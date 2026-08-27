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

### 2026-08-27 — Claude — Cerrar la mesa ya no puede cobrar dos veces (AUD-005)

- **IDs:** `AUD-005` (Resuelto, sin desplegar).
- **Archivos:** `functions/index.js`, `src/firebase/mesa.js`, `src/firebase/locales.js`,
  `src/pages/EncargadoPage.jsx`, `firestore.rules`, `tests/funciones.test.js`,
  `tests/reglas.test.js`.
- **Cambio:** tres operaciones que se podían cortar por la mitad.

  **El cierre de mesa** era el caro: primero el registro en el historial, después la mesa a
  libre. Un corte en el medio dejaba la mesa cobrada pero ocupada; el encargado la veía igual
  que antes, volvía a apretar, y quedaban **dos cierres del mismo consumo en la caja**. Ahora
  es `cerrarMesa` en el backend, con dos candados: la clave de idempotencia (el mismo intento
  cae en el mismo documento) y el estado de la mesa (dos dispositivos con claves distintas los
  detiene que la mesa ya esté libre). La limpieza de pedidos, mensajes y llamadas quedó fuera
  de la transacción a propósito —es higiene, no plata— va paginada y se retoma si quedó a
  medias. Antes iba todo en un batch de 500 escrituras: una mesa con una noche larga encima no
  se podía cerrar.

  **El alta de un local** escribía cuatro documentos sueltos. Un corte dejaba un bar sin
  encargado o sin configuración, y quien se registró no podía entrar ni volver a registrarse
  porque el identificador ya figuraba tomado. Pasó al backend en un solo batch. No alcanzaba
  con hacer el batch desde el navegador: la regla que autoriza la ficha de encargado pregunta
  por el dueño del local, y dentro de un batch esa lectura no ve el local que el mismo batch
  está creando.

  **El canje de invitación** sí se resolvió con un `writeBatch` del lado del cliente, y la
  diferencia con el caso anterior es justamente esa: la regla pregunta por la invitación, y las
  reglas se evalúan contra el estado previo al batch.

  **Reglas endurecidas.** El historial es la contabilidad del local y hasta ahora cualquier
  empleado podía crear un cierre con el total que quisiera: ahora es sólo del backend. Igual el
  borrado de pedidos. Y el personal opera la mesa pero ya no mueve `total_acumulado` ni
  `propina`: ese permiso existía únicamente porque el cierre corría en el navegador.
- **Validación:** `npm run test:funciones` → **40/40** (15 nuevas); `npm run test:reglas` →
  **45/45** (5 nuevas); `npm run test:unidad` → 13/13; `npx eslint .` 0 errores;
  `npm run build` correcto.
- **Pendiente / riesgos:** sin desplegar. **Este cambio necesita desplegar Functions, reglas y
  hosting** — y en ese orden importa: ver la nota de despliegue más abajo. Revocar una
  invitación y desactivar a un empleado siguen siendo escrituras del navegador; no mueven
  plata, así que quedan.


### 2026-08-27 — Claude — El mozo no podía vender una categoría entera (AUD-015)

- **IDs:** `AUD-015` (Resuelto, sin desplegar).
- **Archivos:** `src/utils/categorias.js` (nuevo), `src/pages/MozoPage.jsx`,
  `src/pages/MesaPage.jsx`, `tests/vistas.test.js` (nuevo), `package.json`.
- **Cambio:** la lista de categorías estaba escrita dos veces y no coincidía: al mozo le
  faltaba `promocion`, que es donde el local había cargado su menú del día. El filtro de la
  carta no podía alcanzar ese producto desde ninguna pestaña del mozo, así que el carrito
  quedaba vacío y el botón "Enviar pedido" —que sólo existe con el carrito cargado— no
  llegaba a dibujarse. Desde afuera: la carta aparecía y no pasaba nada.

  Ahora hay una sola lista en `src/utils/categorias.js`. Se agregó una categoría "Otros" de
  recolección para que un producto con categoría desconocida se muestre en vez de
  desaparecer, y las pestañas se arman con lo que la carta realmente tiene: un bar que sólo
  vende bebidas ya no abre en una pestaña "Comidas" vacía.
- **Validación:** `npm run test:unidad` → **13/13** (nueva suite); `npx eslint .` 0 errores;
  `npm run build` correcto. El caso central de la suite es "ningún producto de la carta se
  queda afuera", que se sigue cumpliendo aunque después se agreguen categorías.
- **Pendiente / riesgos:** sin desplegar. La verificación en el navegador queda para la
  prueba real: requiere una carta con un producto en `promocion`.

### 2026-08-27 — Claude — Avisos del chat que se perdían (AUD-016)

- **IDs:** `AUD-016` (Resuelto, sin desplegar).
- **Archivos:** `src/utils/noLeidos.js` (nuevo), `src/firebase/mesa.js`, `firestore.rules`,
  `src/pages/EncargadoPage.jsx`, `src/pages/MesaPage.jsx`, y sus dos hojas de estilo.
- **Cambio:** tres defectos del chat, reportados en la prueba real.

  **El encargado sólo se enteraba de la mesa que tenía abierta.** El sonido sonaba una vez y
  no dejaba rastro. Ahora hay un listener por mesa de **un solo documento** —el último
  mensaje— y las mesas con algo sin leer se marcan con un punto rojo en la grilla y un
  contador en la pestaña "Mesas". La marca de "ya lo vi" va al navegador y no a Firestore:
  es de esa persona en ese dispositivo, así que la tablet de la barra y el celular llevan
  cuentas separadas.

  **Se auto-notificaba de sus propios mensajes.** El chat deducía el autor comparando
  nombres, lo que además dejaba que un comensal llamado "Encargado" se dibujara como personal
  del local. Los mensajes llevan ahora `rol` (`'cliente'` / `'staff'`) y **las reglas exigen
  que coincida con quien escribe**. Los mensajes viejos, sin el campo, se siguen leyendo por
  el nombre.

  **El comensal tampoco veía la respuesta:** punto verde en la pestaña "Chat" hasta que la
  abra.
- **Validación:** `npm run test:reglas` → **40/40** (3 casos nuevos: el rol no se puede
  falsear en ninguno de los dos sentidos, y sin rol el mensaje se rechaza);
  `npm run test:unidad` → 13/13, 8 de ellos sobre pendientes;
  `npm run test:funciones` → 25/25; `npx eslint .` 0 errores; `npm run build` correcto.
- **Pendiente / riesgos:** el listener por mesa agrega **una lectura por mesa al abrir** más
  una por mensaje nuevo — anotado en `AUD-011`. En la primera carga, una mesa con una
  conversación vieja sin abrir muestra el punto; se limpia al abrirla una vez.

### 2026-08-27 — Claude — El sonido dependía de encontrar un botón (AUD-017)

- **IDs:** `AUD-017` (Resuelto, sin desplegar).
- **Archivos:** `src/utils/sonidos.js`, `src/utils/useAudio.js` (nuevo),
  `src/pages/MozoPage.jsx`, `src/pages/EncargadoPage.jsx`.
- **Cambio:** los navegadores no dejan sonar nada hasta que la persona toca la pantalla, y la
  app resolvía eso con un botón 🔕 en la barra. Quien no lo apretaba no escuchaba **ningún**
  aviso en todo el turno y no tenía forma de enterarse: para un mozo que depende de esos
  avisos, es un modo de falla silencioso. Ahora se aprovecha el primer gesto que llegue
  —cualquiera sirve, y para usar la app hay que tocarla igual— y el botón quedó como
  indicador. El aviso de mensaje pasó de un tono flojo a dos más fuertes.

  El estado del audio vivía duplicado en cada pantalla; ahora es uno solo para la pestaña y
  las vistas se suscriben, así el indicador no puede quedar apagado con el audio andando.
- **Validación:** `npx eslint .` 0 errores; `npm run build` correcto.
- **Pendiente / riesgos:** sin desplegar. El sonido sigue sin ser configurable por local
  (volumen, o silenciar). Si hace falta, va como ajuste del encargado.

### Nota de despliegue — cuando una regla se vuelve más estricta, primero va el hosting

`AUD-016` agregó una regla que **rechaza un mensaje de chat sin el campo `rol`**. La app es
una PWA con `registerType: 'autoUpdate'`, así que un celular que ya la tenga abierta sigue
corriendo la versión vieja hasta que la recargue.

Si se despliegan las reglas antes que el hosting, esos clientes viejos mandan mensajes sin
`rol` y se los rechaza: el chat les falla hasta que actualicen. El orden correcto es

    firebase deploy --only hosting
    firebase deploy --only firestore:rules

y vale como criterio general: **una regla que empieza a exigir algo nuevo se despliega después
del código que lo manda**. Al revés —una regla que se afloja— el orden no importa.

### Nota de infraestructura — el emulador de Functions arranca flaky

Corriendo `npm run test:funciones` tres veces seguidas, una falló con **las 25 pruebas** en
rojo y `Failed to start functions: Failed to load function` en el log: el emulador no llegó a
levantar y todas las llamadas se quedaron sin respuesta. Las otras dos dieron 25/25. No es una
regresión del código —fallan también las pruebas que nadie tocó— pero conviene tenerlo
presente antes de leer un rojo como un defecto real, y hay que resolverlo antes de meter la
suite en CI (`AUD-014`): un CI que falla al azar deja de mirarse. También quedan procesos del
emulador vivos si la corrida se corta, y ocupan los puertos de la siguiente.


### 2026-08-24 — Claude — Preparar el despliegue de Functions

- **IDs:** soporte de `AUD-001` y `AUD-002` (siguen Resueltos, sin desplegar).
- **Archivos:** `functions/index.js`, `functions/package.json`.
- **Cambio:** el primer intento de `firebase deploy --only functions` falló con *"User code
  failed to load. Cannot determine backend specification. Timeout after 10000"*. Las APIs de
  Cloud Functions, Cloud Build y Artifact Registry **quedaron habilitadas** en ese intento.

  Dos causas encadenadas. `firebase-functions` estaba en 6.6 y la CLI pedía 7.x; al
  actualizar (y con `firebase-admin` 14), el módulo pasó a tardar **7,4 segundos** en cargar.
  El descubrimiento del backend corta a los 10, así que quedaba al borde y en la máquina de
  despliegue se pasaba.

  El costo estaba en inicializar el Admin SDK al cargar el módulo. Ahora se inicializa
  **perezosamente**, sólo cuando una función atiende un pedido de verdad. El módulo pasó de
  7428 ms a **712 ms**. No es un detalle de estilo: para desplegar, la CLI carga el archivo y
  le pregunta qué funciones exporta, con ese límite de 10 segundos.
- **Validación:** `npm run test:funciones` **25/25** después del cambio.
- **Pendiente / riesgos:** el despliegue en sí **no se ejecutó**: quedó bloqueado por los
  permisos del entorno y lo corre el operador. La secuencia sigue siendo `functions` →
  verificar → `firestore:rules` + `hosting`.


### 2026-08-24 — Claude — Idempotencia extremo a extremo (AUD-002)

- **IDs:** `AUD-002` (Resuelto, sin desplegar).
- **Archivos:** `src/firebase/mesa.js`, `functions/index.js`, `tests/funciones.test.js`.
- **Cambio:** la verificación encontró que lo entregado antes **no cerraba el circuito**. Dos
  huecos, y el primero anulaba todo lo demás.

  **La clave se generaba en cada llamada.** El backend guardaba el pedido con la clave que le
  llegara, así que si el cliente inventaba una nueva en cada reintento, el reintento caía en
  otro documento y el pedido se duplicaba igual. La clave es lo que dice "esto es el mismo
  intento", y eso lo decide quien reintenta. Ahora se genera una vez por operación pendiente,
  se guarda en `localStorage` —para que sobreviva a recargar la página, que es lo que hace
  alguien cuando la app se cuelga tras confirmar— y se suelta recién cuando el backend
  confirmó.

  **El carrito no se consumía atómicamente.** Dos celulares de la misma mesa podían confirmar
  el mismo carrito en paralelo con claves distintas: para el servidor eran dos pedidos
  legítimos, así que la idempotencia no los detenía. Ahora el carrito se consume dentro de la
  transacción —se verifica que no esté bloqueado y que su contenido siga siendo el cotizado—
  y se distinguió el pedido extra, que manda renglones explícitos y no debe tocarlo. Antes un
  pedido extra vaciaba el carrito de la mesa.
- **Validación:** `npm test` → **reglas 37/37** y **funciones 25/25** (5 casos nuevos);
  `npx eslint .` 0 errores; `npm run build` correcto con service worker.
- **Pendiente / riesgos:** sigue **sin desplegar**. Los riesgos anotados antes no cambian:
  importes enteros sin redondeo explícito, sin límite de pedidos por mesa ni por minuto, y si
  dos personas cambian el mismo renglón a la vez gana la última sin avisarle a la otra.


### 2026-08-24 — Claude — Precios en el servidor y concurrencia (AUD-002, AUD-009)

- **IDs:** `AUD-002` (Resuelto, sin desplegar), `AUD-009` (Resuelto, sin desplegar).
  `AUD-005` sigue Pendiente y se acotó qué le falta.
- **Archivos:** `functions/index.js`, `src/firebase/funciones.js` (nuevo),
  `src/firebase/mesa.js`, `src/firebase/config.js`, `firestore.rules`,
  `tests/funciones.test.js` (nuevo), `tests/reglas.test.js`, `package.json`, `.env.example`,
  las cuatro vistas.
- **Procedencia:** el grueso lo escribió otra sesión de Claude que ya no interviene sobre
  esta carpeta. Se revisó, corrigió y probó antes de darlo por bueno.
- **Cambio:** el cálculo del dinero pasó al servidor —el cliente manda qué y cuánto, nunca a
  qué precio— y los cambios de estado pasan por transacción. Sobre eso se agregaron los tres
  puntos que faltaban:

  **Idempotencia:** cada confirmación lleva clave propia y el pedido se guarda con ese id. Sin
  eso, un celular que perdía señal después de que el backend escribió reintentaba y **cobraba
  dos veces**. La verificación va dentro de la transacción, no sólo antes: dos reintentos en
  paralelo llegan hasta ahí.

  **Identificador estable de renglón:** las funciones recibían la *posición* en el array.
  Aunque la transacción evite pisarse, si se cancela el renglón 0 mientras otro marca listo el
  1, el "1" ya es otro producto: la transacción aplicaba el cambio prolijamente al plato
  equivocado. Ahora cada renglón lleva `rid` y se busca por ahí.

  **Roles por puesto:** alcanzaba con "ser personal", y eso le daba a cocina cargar pedidos,
  pedir la cuenta y dar comandas por entregadas. Ahora hay una tabla en un solo lugar.
- **Validación:** `npx eslint .` 0 errores; **reglas 37/37**; **funciones 20/20** (suite nueva,
  llamando por HTTP como la app); `npm run build` correcto; y **E2E completo del pedido en el
  navegador contra los emuladores**: se abrió la mesa, se pidió, y el servidor escribió
  `2× Tostado @1800 = 3600` con precio y destino de la carta, `rid` estable y el total de la
  mesa en la misma transacción; después se pidió la cuenta con propina del 10%.
  Para eso se agregó `VITE_USAR_EMULADORES`, que sólo funciona en builds de desarrollo.
- **Pendiente / riesgos:** **nada de esto está desplegado, y no se debe desplegar por
  partes.** Las reglas nuevas bloquean la escritura directa de pedidos: publicarlas sin las
  funciones deja al bar sin poder tomar un pedido. Orden: Functions → cliente → prueba →
  reglas. Además: los importes son enteros y no hay redondeo explícito; no hay límite de
  pedidos por mesa ni por minuto; y si dos personas cambian **el mismo** renglón a la vez,
  gana la última sin avisarle a la otra.


### 2026-08-24 — Claude — Capacidad de mesa: el comensal solo opera la suya (AUD-001)

- **IDs:** `AUD-001` (Resuelto, **sin desplegar**). Residuo de `AUD-014` cerrado en el mismo
  cambio.
- **Archivos:** `functions/` (nuevo), `src/firebase/capacidadMesa.js` (nuevo),
  `firestore.rules`, `firebase.json`, `src/App.jsx`, `src/firebase/auth.js`,
  `src/utils/useSesion.jsx`, `src/components/PuertaDeAcceso.jsx`, `tests/reglas.test.js`,
  `.gitignore`.
- **Cambio:** el permiso del comensal deja de ser "tengo sesión" y pasa a ser "el servidor me
  habilitó esta mesa, y vence". Una callable `abrirMesa` valida local y número de mesa y
  emite un custom claim `{l, m, exp}` con 6 horas de vigencia; las reglas lo comparan contra
  el path. La carta y la configuración siguen leyéndose sin capacidad, porque son lo que la
  pantalla muestra antes de que la persona decida.

  Se cerró además el residuo que había señalado Codex: el error del canje de invitación ahora
  llega a la pantalla también por el camino de `PuertaDeAcceso`, no sólo por `/login`. Antes
  ahí sólo se registraba en consola y se mostraba "no pertenecés al equipo", que es falso.
- **Validación:** `npm test` **36/36** —7 casos nuevos, todos negativos salvo dos—;
  `npx eslint .` 0 errores; `npm run build` correcto; el módulo de funciones carga y exporta
  `abrirMesa`.
- **Pendiente / riesgos:** **no desplegado, y no se debe desplegar por partes.** Las reglas
  nuevas exigen un claim que sólo entrega la función: publicar reglas sin función deja a
  todos los comensales sin poder abrir su mesa. Orden obligatorio: `functions` → verificar →
  `firestore:rules` + cliente. Tampoco se ejerció el recorrido real contra el backend
  (`AUD-014`), ni se resolvió qué pasa si la capacidad vence mientras la persona come: hoy
  falla la escritura y se muestra un error genérico; correspondería renovarla sola.


### 2026-08-25 — Codex — Mozo verificado en ejecución y AUD-012 cerrado

- **IDs:** `AUD-012` (Verificado) y `AUD-014` (sigue Pendiente).
- **Archivos:** `AUDITORIA_CLAUDE_CODEX.md`, `REGISTRO_DE_CAMBIOS.md`. No se modificó
  código funcional.
- **Validación real:** se reinició `localhost:5175` con las dependencias actuales y
  `--force`, porque el servidor anterior había arrancado antes del upgrade y aún servía el
  prebundle de Router 6. Con la sesión real del mozo, `/login` redirigió a
  `/l/bar-de-prueba/mozo`; montaron `Alertas`, `Mis mesas` y `Tomar pedido`, sin errores
  propios de la aplicación. Esto confirma la corrección del TDZ de `misMesas` y el recorrido
  de personal sobre React Router 7.
- **Verificación repetida:** `npm run lint` 0 errores y 6 advertencias; `npm test` 29/29;
  `npm run build` correcto con PWA, 986,52 kB / 261,59 kB gzip.
- **Decisión:** queda levantado el bloqueo y Claude puede iniciar
  `AUD-001 + AUD-002 + AUD-005`.
- **Residuo:** el acceso por `/login` ya muestra el fallo de canje, pero el camino directo
  por `PuertaDeAcceso` sólo lo escribe en consola desde `useSesion.jsx` y todavía puede
  terminar mostrando "no pertenecés al equipo". Debe cubrirse y corregirse dentro de
  `AUD-014`; no bloquea Functions.

### 2026-08-24 — Claude — Regresión bloqueante de la vista del mozo (AUD-014)

- **IDs:** `AUD-014` (sigue Pendiente). `AUD-012` quedó Verificado por Codex.
- **Archivos:** `src/pages/MozoPage.jsx`, `src/pages/EncargadoPage.jsx`,
  `src/pages/LoginPage.jsx`, `src/utils/useSesion.jsx`, `eslint.config.js`.
- **Cambio:** la prueba con sesión real encontró que `MozoPage` quedaba en blanco con
  *Cannot access 'misMesas' before initialization*. Regresión propia de `b066977` y
  bloqueante: el mozo no podía trabajar.

  La causa es que el array de dependencias de un `useEffect` **se evalúa durante el render**,
  donde está escrito. El efecto de avisos tenía `misMesas` en sus dependencias y la constante
  se declaraba más abajo. Antes del refactor no pasaba porque `misMesas` no figuraba en las
  dependencias; la agregué al satisfacer `exhaustive-deps` sin mover la declaración.

  Se movieron las declaraciones arriba del efecto y **se activó `no-use-before-define`**, que
  es lo que faltaba: este error compila igual y sólo aparece al montar el componente. La
  regla ahora lo cubre en todo el repositorio. Al activarla aparecieron dos casos más en
  `EncargadoPage` que no eran crashes —se llaman dentro del cuerpo del efecto, no en las
  dependencias— pero se reubicaron para dejarla en cero.

  Aparte, los errores del canje de invitación ya no se descartan: `LoginPage` tiene una
  pantalla propia que distingue "falló el canje" de "no hay invitación", con el código del
  error y opción de reintentar. El mismo `.catch` vacío estaba en `useSesion.jsx`, donde el
  mensaje engañoso era "no pertenecés al equipo"; ahí el error queda en consola.
- **Validación:** `npx eslint .` 0 errores y `no-use-before-define` con 0 violaciones en todo
  el repositorio; `npm test` 29/29; `npm run build` correcto.
- **Pendiente / riesgos:** **el render del mozo no se pudo verificar en ejecución** —requiere
  sesión de Google con ese rol—. La comprobación del TDZ es estática, que para este defecto
  es decisiva por ser puramente léxico, pero el montaje real queda para Codex. Tampoco se
  ejercitó la pantalla nueva de error de canje: forzar esa falla conviene hacerlo con el
  emulador de Auth al armar el E2E. Ambos casos se agregaron a la tabla de alcance de
  `AUD-014`.


### 2026-08-25 — Codex — Re-verificación de AUD-012 y bloqueo real en vista Mozo

- **IDs:** `AUD-012` (sigue Resuelto, pendiente de verificación final) y `AUD-014`
  (Pendiente, con regresión reproducida).
- **Archivos:** `AUDITORIA_CLAUDE_CODEX.md`, `REGISTRO_DE_CAMBIOS.md`. No se modificó
  código funcional.
- **Validación de AUD-012:** sobre `656207c`, `npm audit --omit=dev` dio **0**;
  `npm audit` dio **12 sólo de desarrollo** (9 moderadas, 2 altas y 1 crítica);
  `npm test` pasó 29/29 con JDK 21; `npm run lint` dio 0 errores y 6 advertencias;
  `npm run build` generó la PWA y confirmó 985,40 kB / 261,34 kB gzip. El árbol
  instalado contiene `firebase@12.18.0`, `react-router-dom@7.18.2` y
  `@firebase/rules-unit-testing@5.0.2`; `undici` queda únicamente por dependencias de
  desarrollo.
- **Bloqueo encontrado con sesión real:** `/login` reconoce la cuenta de mozo y la redirige
  correctamente a `/l/bar-de-prueba/mozo`, por lo que la asociación de Firestore y el canje
  no son la causa. La vista queda en blanco con `ReferenceError: Cannot access 'misMesas'
  before initialization`. En `src/pages/MozoPage.jsx`, el `useEffect` de avisos usa
  `misMesas` y la incluye en dependencias en la línea 134, pero la constante se declara
  recién en la línea 159. La regresión entró en `b066977`.
- **Acción requerida antes de Functions:** mover la definición de `NUMS_MESAS_ACTUAL` y
  `misMesas` por encima del efecto que las usa, repetir la vista con una sesión real y sumar
  este render al alcance E2E de `AUD-014`. Build, lint y las pruebas de reglas no detectan
  este tipo de caída de interfaz.
- **Mejora secundaria:** `LoginPage.jsx` descarta silenciosamente cualquier error al canjear
  una invitación. Aunque no causó este incidente, debe mostrar el error real para no hacer
  creer que falta la asociación de la cuenta.

### 2026-08-24 — Claude — Producción sin vulnerabilidades (AUD-012)

- **IDs:** `AUD-012` (Resuelto). Nota agregada en `AUD-013`.
- **Archivos:** `package.json`, `package-lock.json`.
- **Cambio:** `firebase` 10.14.1 → 12.18.0, `react-router-dom` 6.30.6 → 7.18.2 y
  `@firebase/rules-unit-testing` 3.0.4 → 5.0.2. **`npm audit --omit=dev` pasó de 12 a 0.**

  Antes de empezar se separó qué afectaba a quién: 9 de las 12 venían por
  `firebase → undici`, y `undici` no llega al navegador —sólo está en el build de Node, y el
  bundle tiene cero referencias—. Afectaban a `seed.js`, no al comensal. Las que sí viajaban
  al navegador eran las 2 de `react-router`: open redirect y constructor injection.

  El salto de React Router es de major, pero la app usa sólo la API declarativa, toda
  soportada en v7. Se verificó en ejecución: catch-all, rutas con parámetro y navegación
  cliente, sin errores de consola.
- **Validación:** `npm audit --omit=dev` 0; `npm test` 29/29; `eslint` 0 errores;
  `npm run build` correcto con service worker.
- **Regresión introducida:** el bundle pasó de **741 kB a 985 kB**. Se midió la causa en
  lugar de suponerla: ~227 kB son de `firebase@12` y ~17 kB del router. Queda anotado en
  `AUD-013`, que ya pedía separar en chunks; ahora es necesario y no opcional.
- **Pendiente / riesgos:** quedan 12 vulnerabilidades **sólo de desarrollo**. No se subieron
  `vite` (5→8) ni `vitest` (2→4): son majors que tocan el build y el plugin de PWA, y el
  beneficio no alcanza al usuario —la crítica de `vitest` exige `vitest --ui`, que no usamos,
  y la de `vite` afecta al servidor local—. Merece su propio bloque. Además, la app no se
  ejerció con sesiones de personal después del upgrade: un major de router justifica repetir
  los recorridos de encargado, mozo y cocina (`AUD-014`).


### 2026-08-24 — Claude — Correcciones de la verificación manual (AUD-014)

- **IDs:** `AUD-014` (sigue Pendiente). Referencia: `AUD-004` y `AUD-008` quedaron Verificados
  por Codex en la entrada anterior.
- **Archivos:** `src/utils/avisos.js` (nuevo), `src/components/EquipoDelLocal.jsx`,
  `src/pages/MozoPage.jsx`, `src/pages/EncargadoPage.jsx`, `src/pages/CocinaPage.jsx`,
  `src/pages/MesaPage.jsx`.
- **Cambio:** los dos asuntos que levantó la verificación manual.

  **Invitación duplicada:** se resolvió como `upsert` explícito y no como error, porque
  volver a invitar es legítimo —corregir un nombre, cambiar el rol antes de que la persona
  entre—. Lo que estaba mal era el silencio. Ahora pide confirmación diciendo qué cambia, el
  cartel final dice "actualizada", y si el email ya pertenece al equipo se rechaza
  explicando que el rol se cambia desde su fila.

  **Señal de inicialización:** Codex señaló un punto en `MozoPage`; el mismo patrón estaba en
  **ocho** lugares de cuatro vistas. El de `CocinaPage` es el más grave en la operación: una
  cocina que abre a la mañana sin pedidos activos no sonaba para el primero del día. Se
  centralizó la lógica en `src/utils/avisos.js`, que distingue "esta mesa ya reportó" de "hay
  algo guardado" —la confusión que causaba tanto los avisos faltantes como los de más— y se
  reinicia al cambiar de local.
- **Validación:** `npm test` 29/29; `npx eslint .` 0 errores y 6 advertencias (bajó de 9);
  `npm run build` correcto.
- **Pendiente / riesgos:** ninguna de las cinco regresiones listadas en `AUD-014` está
  automatizada, ni se comprobó el audio real. Siguen faltando Playwright, el recorrido de
  registro y la navegación entre locales. `AUD-014` **no** se marca resuelto.


### 2026-08-24 — Codex — Recorridos manuales reales de AUD-014

- **IDs:** `AUD-004` (Verificado), `AUD-008` (Verificado), `AUD-014` (Pendiente).
- **Archivos:** `AUDITORIA_CLAUDE_CODEX.md`, `REGISTRO_DE_CAMBIOS.md`.
- **Cambio:** se ejecutaron con sesiones reales de Google los recorridos de invitación y
  canje, identidad y mesas del mozo, soporte de solo lectura y avisos de llamadas del
  encargado. No se modificó código funcional.
- **Validación:** la invitación se creó, canceló, recreó y canjeó; el mozo mostró su nombre
  sin selector y quedó limitado a la mesa 5; Encargado, Mozo y Cocina ocultaron acciones en
  soporte; una llamada previa no mostró banner y una nueva mostró uno solo para la mesa
  correcta. La ficha temporal fue eliminada y la mesa 1 quedó libre.
- **Hallazgos:** invitar dos veces el mismo email dentro del local sobrescribe la invitación
  sin avisar. Además, `MozoPage` usa un objeto vacío como señal de inicialización y puede no
  avisar la primera llamada cuando el snapshot inicial estaba vacío. Ambos casos quedan
  anotados en `AUD-014` para decisión, corrección y cobertura E2E.
- **Pendiente / riesgos:** Playwright, registro, navegación entre locales y comprobación de
  audio físico. `AUD-014` sigue Pendiente.

### 2026-08-24 — Claude — AUD-014 abierto; AUD-010 cerrado como Verificado

- **IDs:** `AUD-010` (Verificado por Codex sobre `836b029`), `AUD-014` (Pendiente, nuevo).
- **Archivos:** `AUDITORIA_CLAUDE_CODEX.md`, `REGISTRO_DE_CAMBIOS.md`.
- **Cambio:** Codex re-verificó `836b029` con instalación limpia —`npm test` 29/29, lint 0
  errores y 9 advertencias, build correcto— y dio `AUD-010` por Verificado. A pedido suyo se
  abrió **`AUD-014`** para agrupar todo lo que necesita interfaz y sesiones reales: los E2E
  de registro, invitación y soporte, la vista del mozo, la navegación entre locales y la
  prueba del aviso de llamadas. La tabla de residuos de `AUD-010` ahora apunta ahí en lugar
  de decir "sin hallazgo propio", y el orden de implementación suma un paso 7.
- **Validación:** sin cambios de código en esta entrada; solo seguimiento.
- **Dato para `AUD-012`:** `npm audit` reporta **23 vulnerabilidades** (20 moderadas, 2
  altas, 1 crítica), pero `npm audit --omit=dev` reporta **12** (11 moderadas, 1 alta). Las
  11 de diferencia entraron con `firebase-tools`, que es dependencia de desarrollo y no viaja
  al bundle del cliente. La distinción importa para priorizar: lo que llega al navegador de
  un comensal son las 12 de producción, encabezadas por la cadena
  `firebase@10.14.1 → undici`.
- **Pendiente / riesgos:** las pruebas manuales del navegador siguen sin hacerse y son el
  paso previo acordado antes de `AUD-012`. Mientras no existan los recorridos de `AUD-014`,
  cada cambio en auth o navegación se sigue validando a mano.

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
