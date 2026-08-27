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

**Estado:** Resuelto — **sin desplegar**

**Evidencia:** `firestore.rules:84-85` define comensal como cualquier sesión en un local activo; `firestore.rules:163-183` le permite leer y modificar mesas, pedidos, mensajes y llamados sin comprobar `mesaId`, UID o una sesión de mesa.

**Riesgo:** cualquiera que conozca un `localId` puede autenticarse anónimamente y leer o alterar todas las mesas de ese comercio, incluso desde fuera del QR original.

**Solución requerida:** emitir en backend una sesión/capacidad de mesa ligada a `{uid, localId, mesaId, vencimiento}` y hacer que las reglas verifiquen esa relación. App Check puede complementar, pero no reemplaza la autorización. Agregar pruebas negativas entre mesas y locales.

**Respuesta de Claude:** implementada la capacidad de mesa que pedía el hallazgo. **No está
desplegada**, y por una razón que importa: ver "Secuencia de despliegue" abajo.

**El problema, dicho como se siente en el salón:** el comensal entra con una sesión anónima
que no dice dónde está sentado. Con eso, cualquiera que supiera el identificador de un local
podía leer y escribir **todas** sus mesas: ver la cuenta de la mesa de al lado, agregarle un
pedido, vaciarle el carrito. Esconder mejor el número de mesa no servía —está impreso en el
QR, a la vista de todos—. Lo que había que cambiar es qué significa el permiso.

**La solución:** el permiso deja de ser "tengo sesión" y pasa a ser "el servidor me habilitó
ESTA mesa, y vence".

1. **Backend** (`functions/index.js`, callable `abrirMesa`): valida que el local exista y
   esté atendiendo, y que la mesa sea una de las que ese local declaró —sin eso alguien
   podría pedir capacidad para la mesa 9999 y ensuciar la base—. Después emite un custom
   claim `mesa: { l, m, exp }` con 6 horas de vigencia: una comida larga entra cómoda, una
   sesión olvidada en un celular ajeno no sirve al día siguiente. Los claims anteriores se
   pisan a propósito: una sesión vale para una mesa a la vez, así que cambiarse de mesa
   invalida la anterior en el mismo acto.

2. **Reglas:** `esComensal(localId, mesaId)` compara el claim contra el path que se está
   escribiendo y exige que no esté vencido. El claim lo firma Firebase: el cliente no lo
   puede fabricar ni estirar el vencimiento.

3. **Distinción necesaria:** la carta y la configuración del local se leen **sin** capacidad,
   con `esComensalDelLocal`. Es lo que la pantalla muestra mientras la persona decide qué
   pedir, y no expone nada de otras mesas. Exigir capacidad ahí habría obligado a pedir
   permiso antes de poder mostrar siquiera el menú.

4. **Cliente** (`src/firebase/capacidadMesa.js` y `ZonaCliente`): pide la capacidad apenas
   se abre el QR, antes de tocar nada. Detalle que costó ver y conviene dejar escrito: los
   custom claims **no aparecen** en el token que el navegador ya tiene, así que hay que
   forzar `getIdToken(true)` después de que la función responde. Sin eso el permiso existe
   en el servidor y las escrituras se rechazan igual.

**Pruebas:** 7 casos nuevos, todos contra el emulador (36/36 en total):

| Caso | Resultado |
|---|---|
| Sesión anónima **sin** capacidad | No lee ni escribe ninguna mesa |
| Capacidad para la mesa 1 → mesa 2 | Denegado, también sus pedidos y mensajes |
| Capacidad del bar A → bar B | Denegado |
| Capacidad **vencida** | Denegado |
| Carta y configuración sin capacidad | Permitido, como debe ser |
| Personal del local | Opera cualquier mesa sin capacidad: entra por su ficha |

**Secuencia de despliegue — no separar estos pasos.** Las reglas nuevas exigen un claim que
sólo entrega la función. Publicar las reglas sin la función deja a todos los comensales sin
poder abrir su mesa. El orden es: desplegar `functions` primero, verificar que `abrirMesa`
responde, y recién entonces `firestore:rules` junto con el cliente nuevo. Por eso se deja
commiteado pero sin desplegar.

**Riesgo pendiente:** el recorrido completo del comensal contra el backend real no se
ejerció —requiere las funciones desplegadas o el emulador de Functions corriendo junto al de
Firestore—. Queda para `AUD-014`. Tampoco se cubrió qué pasa si el claim vence **mientras**
la persona está comiendo: hoy la escritura falla y la pantalla muestra el error genérico;
lo correcto sería renovar la capacidad sola, y queda anotado como mejora.

### AUD-002 — P0 Crítico — Precios, totales y estados financieros son controlados por el cliente

**Estado:** Resuelto — **sin desplegar**

**Evidencia:** `src/firebase/mesa.js:54-66` copia el objeto de carta recibido; `src/firebase/mesa.js:91-106` y `113-129` calculan y persisten totales con esos precios. Las reglas de pedidos/mesas no validan campos, precios, cantidades, transiciones ni valores negativos.

**Riesgo:** un cliente modificado puede enviar precios falsos, alterar `total_acumulado`, estados de mesa/pedido o datos de pago. La caja no es confiable.

**Solución requerida:** crear pedidos y cierres mediante Cloud Functions/API confiable que lea precios vigentes de la carta y calcule totales en servidor. Denegar al comensal escrituras directas sobre campos financieros y validar esquema, tamaños y transiciones en reglas.

**Respuesta de Claude:** el cálculo del dinero se movió al servidor. **No está desplegado**:
ver la secuencia al final.

**Procedencia del cambio:** el grueso lo escribió otra sesión de Claude que ya no interviene
sobre esta carpeta. Se revisó, se corrigió y se probó antes de darlo por bueno; lo que sigue
distingue qué vino de ahí y qué se agregó después.

**Lo que ya venía y se conservó:** el cliente manda *qué* quiere y *cuánta* cantidad, nunca a
qué precio. `crearPedido` lee la carta vigente, toma precio, nombre y **destino**, suma y
recién ahí escribe. El destino importa tanto como el precio: decide a qué cola va el pedido,
así que dejarlo elegir al cliente sería dejarle saltear la cocina. La escritura directa de
pedidos quedó en `allow create: if false`: sólo el backend los crea. Y la mesa debe **nacer
en cero** —sin total, sin carrito, sin método de pago—, para que nadie se siente con una
cuenta ya puesta.

**Lo que faltaba y se agregó tras la revisión de Codex:**

1. **Idempotencia.** Cada confirmación lleva una clave del cliente y el pedido se guarda con
   ese id. Sin eso, un celular que perdía señal justo después de que el backend escribió
   —pero antes de recibir la respuesta— reintentaba y **cargaba el pedido dos veces,
   cobrándole de más al cliente**. La verificación se hace además dentro de la transacción,
   no sólo antes: dos reintentos en paralelo llegan hasta ahí, y el segundo se va sin volver
   a sumar el total.

2. **Roles por puesto.** Antes alcanzaba con "ser personal", y eso le daba a cocina cosas que
   no son suyas: cargar pedidos, pedir la cuenta de una mesa y dar una comanda entera por
   entregada sin que nadie la hubiera llevado. Ahora hay una tabla `PUESTOS_HABILITADOS` en
   un solo lugar. El encargado figura en todas porque es quien cubre los huecos cuando falta
   alguien; es la única excepción que el negocio realmente usa.

**Pruebas:** suite nueva `tests/funciones.test.js`, **20 casos** contra los emuladores de
Functions, Firestore y Auth. Se llama a las callables **por HTTP como lo hace la app**, no
importando el handler: si la envoltura de `onCall` cambiara, queremos enterarnos ahí y no en
el salón.

| Caso | Verifica |
|---|---|
| Café enviado a $1 desde el cliente | Se cobra $900, el de la carta |
| Destino falseado a `mozo` | Queda `cocina`, el de la carta |
| Cantidad 0, negativa, decimal, 1000 | Rechazadas |
| Producto agotado o inexistente | Rechazado |
| Propina desproporcionada | Rechazada |
| Misma clave dos veces / **en paralelo** | Un solo pedido, la cuenta no se duplica |
| Sin clave | No se crea nada |
| Cocina crea pedido / pide cuenta / marca entregado | Denegado |
| Cocina marca listo lo suyo | Permitido |
| Cocina toca un renglón del mozo | Denegado |
| Cancelar siendo mozo | Denegado; el encargado sí |
| Comensal sobre la mesa de al lado | Denegado |

**Corrección de la idempatencia extremo a extremo (2026-08-24):** la verificación encontró
que lo entregado antes **no cerraba el circuito**. Dos huecos, y el primero anulaba todo lo
demás.

**1. La clave se generaba en cada llamada.** `confirmarPedido()` y `agregarPedidoExtra()`
llamaban a `nuevaClave()` dentro de la función. El backend guardaba el pedido con la clave
que le llegara, así que si el cliente inventaba una nueva en cada reintento, el reintento
caía en **otro documento** y el pedido se duplicaba igual. La clave es lo que dice "esto es
el mismo intento, no uno nuevo", y eso tiene que decidirlo quien reintenta, no quien recibe.

Ahora la clave se genera **una vez por operación pendiente** y se reutiliza hasta que esa
operación termine bien; recién ahí se suelta. Se guarda en `localStorage` y no en memoria
para que sobreviva también a recargar la página, que es justo lo que hace alguien cuando la
app se le queda colgada después de confirmar. Sin `localStorage` —modo privado— degrada a
clave por llamada, que no es peor que lo que había.

**2. El carrito no se consumía dentro de la transacción.** `crearPedido` leía el carrito
antes de abrirla y no verificaba nada adentro. Dos celulares de la misma mesa —lo normal en
una mesa de cuatro— podían confirmar el mismo carrito en paralelo **con claves distintas**:
para el servidor eran dos pedidos legítimos y diferentes, así que la idempotencia por clave
no los detenía. Resultado: dos pedidos y el total sumado dos veces.

Ahora el carrito es un recurso que **se consume**. Dentro de la transacción se verifica que
no esté ya bloqueado, y además que su contenido siga siendo el mismo que se cotizó afuera
—si alguien le agregó algo en el medio, cobrar la lista vieja sería cobrarle mal al cliente—.
Firestore reintenta la transacción cuando el documento cambió bajo sus pies, así que el
segundo confirmante vuelve a leer y encuentra la mesa ya bloqueada.

Se distinguieron además los dos caminos, que antes se trataban igual: **confirmar el
carrito** lo consume; un **pedido extra** manda renglones explícitos y no tiene por qué
tocarlo. Antes un pedido extra vaciaba el carrito de la mesa.

**Pruebas nuevas** (25 en total en la suite de Functions):

| Caso | Verifica |
|---|---|
| Respuesta perdida + reintento con la misma clave | Un solo pedido; total sumado una vez |
| Dos claves distintas sobre el mismo carrito, en paralelo | Una sola gana; queda un solo pedido |
| Confirmar dos veces | El total se suma una sola vez; el carrito queda vacío y bloqueado |
| Carrito vacío | No crea nada |
| Pedido extra | No toca el carrito, que después se puede confirmar igual |

**Riesgo pendiente:** los importes son enteros de pesos y no hay redondeo explícito; si
alguna vez se cargan precios con centavos, conviene revisarlo antes. Tampoco hay límite de
pedidos por mesa ni por minuto: un cliente con la app abierta puede crear muchos pedidos
válidos y ensuciar la comanda. No es robo, pero es una molestia real en un bar lleno.

### AUD-003 — P0 Crítico — El “modo soporte de solo lectura” se puede eludir

**Estado:** Resuelto

**Evidencia:** `PuertaDeAcceso.jsx:13-14` y `useSesion.jsx:79-80` dejan entrar al superadmin a todas las vistas. Solo `EncargadoPage.jsx` consulta `soporte`; desde sus botones (`EncargadoPage.jsx:429-430`) se accede a Mozo/Cocina, cuyas acciones no se deshabilitan. Además, `comensalDe()` considera comensal a cualquier usuario autenticado y las reglas conceden al admin escrituras sobre carta, configuración, historial y empleados.

**Riesgo:** soporte puede ejecutar acciones operativas o administrativas sin trazabilidad, contradiciendo la política declarada de acceso excepcional, limitado y auditado.

**Solución requerida:** separar permisos de plataforma y soporte; imponer solo lectura en reglas/backend, no solo en UI; bloquear o adaptar también Mozo/Cocina; crear sesiones de soporte con motivo, caducidad y registro. Para lecturas sensibles, evaluar Cloud Audit Logs/Data Access o un backend que audite cada consulta.

**Respuesta de Claude:** Confirmado, y el problema de fondo era peor de lo que se comunicó
en su momento. `comensalDe()` tenía un comentario que decía "sesión anónima" pero el código
era `logueado() && localActivo()`. Es decir: **cualquier cuenta con sesión contaba como
comensal**, incluido el admin de la plataforma, que por esa vía podía escribir mesas y
pedidos de un negocio ajeno aunque la interfaz le escondiera los botones. La afirmación
previa de que soporte "no podía liberar una mesa ni confirmar un pago" era falsa: las reglas
lo permitían.

Correcciones:

1. `comensalDe()` → `esComensal()`, que ahora exige
   `request.auth.token.firebase.sign_in_provider == 'anonymous'`. El proveedor lo firma
   Firebase y no lo elige el cliente, así que sirve como frontera real. El personal usa
   Google y entra por `esPersonal()`; la plataforma no entra por ninguna de las dos.

2. Separación de planos. La plataforma conserva únicamente lo que le corresponde:
   listar locales, y actualizar o dar de baja el documento `locales/{localId}` (plan y
   estado). Perdió toda escritura sobre datos del cliente: carta, configuración, mesas,
   pedidos, mensajes, llamadas, historial, empleados, invitaciones y punteros de usuario.
   Lectura la mantiene, que es lo que soporte necesita.

   La baja de `empleados` merece mención aparte: si la plataforma pudiera crear un
   encargado, tendría una puerta de entrada silenciosa a cualquier negocio. Un cliente que
   se queda sin acceso se resuelve desde la consola de Firebase, que sí deja rastro en los
   audit logs de Google Cloud.

3. UI: `MozoPage` y `CocinaPage` ahora consumen `useAccesoActual()` igual que
   `EncargadoPage`. En modo soporte muestran el cartel correspondiente, reemplazan los
   botones de estado por el estado en texto y ocultan entregar, resolver llamada, marcar
   cobrada y la pestaña de tomar pedido.

4. Efecto colateral que había que cubrir: con `esComensal` restringido a sesiones anónimas,
   una cuenta de Google sin ficha en ese local que abriera un QR quedaba sin permisos y la
   pantalla no cargaba en silencio. `ZonaCliente` ahora lo detecta y ofrece cerrar sesión
   para pedir como cliente.

**Archivos:** `firestore.rules`, `src/App.jsx`, `src/pages/MozoPage.jsx`,
`src/pages/CocinaPage.jsx`.

**Pruebas:** reglas compiladas y desplegadas a `barflow-hexagroup`. Verificación contra la
base real con sesión anónima: leer y escribir la propia mesa `PERMITIDO`; leer carta
`PERMITIDO`; editar carta `DENEGADO`; leer historial `DENEGADO`. `npm run build` correcto.

**Riesgo pendiente:** no se pudo ejecutar la matriz desde una sesión de superadmin, que
requiere la cuenta de Google del operador. Queda para validación manual. Lo que la
auditoría pide sobre sesiones de soporte con motivo, caducidad y auditoría de cada lectura
**no está hecho** y no puede hacerse solo con reglas: necesita backend. Depende de Blaze,
igual que `AUD-001` y `AUD-002`. Lo entregado acota el poder de soporte a lectura; no lo
deja trazable.

### AUD-004 — P0 Bloqueante — Crear invitaciones falla con las reglas actuales

**Estado:** Verificado

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

**Verificación de Codex (2026-08-24):** recorrido contra la base real con dos cuentas de
Google. El encargado creó la invitación sin `permission-denied`, pudo cancelarla y
recrearla; la persona invitada la canjeó y entró con el rol `mozo`. Después de eliminar su
ficha y `usuarios/{uid}`, la misma cuenta volvió a `/login` con el mensaje de que ya no está
asociada a ningún local. La prueba negativa entre locales ya está cubierta por la matriz de
`AUD-010`.

El duplicado dentro del **mismo** local no se rechaza: una segunda invitación al mismo email
sobrescribe silenciosamente nombre y rol y vuelve a mostrar un mensaje de alta exitosa. No
reabre el bloqueo de `AUD-004`, pero Claude debe decidir si ese comportamiento será un
`upsert` explícito o un error de duplicado y fijarlo en los E2E de `AUD-014`.

### AUD-005 — P1 Alto — Altas, canjes y cierres no son atómicos ni idempotentes

**Estado:** Resuelto (2026-08-27), sin verificar por Codex

**Evidencia:** `registrarLocal()` realiza cuatro `setDoc` secuenciales (`locales.js:81-100`); `aceptarInvitacion()` escribe empleado/usuario y luego borra invitaciones (`locales.js:172-185`); `confirmarPagoYLiberar()` crea historial y después libera (`EncargadoPage.jsx:259-280`).

**Riesgo:** un corte intermedio deja locales incompletos, empleados sin puntero, invitaciones inconsistentes o cierres duplicados al reintentar.

**Solución requerida:** centralizar operaciones críticas en backend con transacciones/batches apropiados, claves de idempotencia y estados recuperables. La limpieza de subcolecciones debe ser paginada y reintentable.

**Nota (2026-08-24):** este hallazgo **sigue Pendiente**. `crearPedido` y `cancelarItem`
quedaron atómicos e idempotentes al resolver `AUD-002` y `AUD-009`, pero eso cubre sólo una
parte de lo que pide acá. **Siguen sin resolverse:**

- `registrarLocal()` con cuatro `setDoc` sueltos: un corte en el medio deja un local sin
  ficha de encargado, o sin configuración.
- `aceptarInvitacion()`: escribe la ficha y el puntero, y después borra las invitaciones. Un
  corte deja a la persona dentro con la invitación todavía en pie.
- `confirmarPagoYLiberar()`: crea el cierre en el historial y después libera la mesa. Un
  corte deja la mesa cobrada pero ocupada, o —peor al reintentar— **dos cierres del mismo
  consumo en la caja**.

Ese último es el más caro de los tres y merece el mismo tratamiento que se le dio a
`crearPedido`: clave de idempotencia y transacción.

**Respuesta de Claude (2026-08-27):** **Resuelto.** Los tres puntos, con tratamiento distinto
porque el riesgo de cada uno es distinto.

**`confirmarPagoYLiberar` → `cerrarMesa` en el backend.** Era el más caro: dos escrituras
sueltas —primero el cierre al historial, después la mesa a libre— y un corte en el medio
dejaba la mesa cobrada pero ocupada. El encargado la veía igual que antes, volvía a apretar, y
quedaban **dos cierres del mismo consumo en la caja**. Al cierre del turno los números no dan y
no hay forma de saber cuál sobra.

Ahora es una transacción con **dos candados distintos, porque son dos carreras distintas**:

1. La **clave** del cierre es el id del documento de historial: el mismo intento reintentado
   cae en el mismo documento.
2. El **estado de la mesa** es el recurso que se consume. Dos dispositivos cerrando la misma
   mesa a la vez traen claves *distintas*, así que la clave no los detiene: los detiene que la
   mesa ya esté libre. Es el mismo razonamiento que el carrito en `crearPedido`.

El borrado de pedidos, mensajes y llamadas quedó **fuera** de la transacción y a propósito: es
higiene, no plata. Si falla, la caja ya quedó bien y la mesa libre; queda marcada
(`limpieza_pendiente`) y el siguiente intento la termina. Antes iba todo en un solo batch, con
el límite de 500 escrituras: **una mesa con una noche larga encima no se podía cerrar**.

La marca de limpieza sólo se retoma si la mesa sigue libre. Sin esa condición, una mesa que
alguien volvió a ocupar antes de que la limpieza terminara se quedaba sin sus pedidos nuevos.

**Y se cerró la puerta de adelante.** El historial es la contabilidad del local, y hasta ahora
`allow create: if esPersonal(localId)`: cualquier empleado podía escribir un cierre con el
total que quisiera, sin que existiera consumo. Ahora es del backend. Lo mismo con el borrado de
pedidos y con los campos de plata de la mesa: el personal la opera —el mozo la marca cobrada—
pero no mueve `total_acumulado` ni `propina`.

**`registrarLocal` → backend.** Cuatro `setDoc` sueltos; un corte dejaba un bar sin encargado o
sin configuración, y —lo peor— quien se registró **no podía entrar ni volver a registrarse**,
porque el identificador ya figuraba tomado. Sin acceso a la consola de Firebase eso no lo
destrababa nadie.

No alcanzaba con un `writeBatch` del lado del cliente: la regla que autoriza la ficha de
encargado pregunta por el dueño del local, y dentro de un batch esa lectura no ve el local que
el mismo batch está creando. Del lado del servidor va en un solo batch con `create`, así que
dos altas simultáneas del mismo identificador las gana una sola.

**`aceptarInvitacion` → un solo `writeBatch`.** Acá el batch **sí** alcanza, y la diferencia
con el caso anterior es exactamente esa: la regla pregunta por la invitación, y las reglas se
evalúan contra el estado previo al batch, así que todavía la ve aunque el mismo batch la esté
borrando.

**Pruebas nuevas:** 15 (9 de cierre, 6 de alta) en la suite de Functions, y 5 de reglas. Los
casos que importan: reintento con la misma clave, dos dispositivos con claves distintas, cerrar
una mesa ya libre, una limpieza que quedó a medias, renglones cancelados que no entran al
resumen, y que ni el encargado pueda escribir un cierre a mano.

**Riesgo que permanece:** `invitarEmpleado` sigue escribiendo dos documentos en un batch —eso
ya era atómico— pero **revocar** una invitación y **desactivar** a un empleado siguen siendo
escrituras del navegador. No mueven plata, así que quedan.

### AUD-006 — P1 Alto — Migración de acceso incompatible con el superadmin existente

**Estado:** Verificado

**Evidencia:** el superadmin se creó con correo/contraseña, pero `auth.js:44-55`, `LoginPage.jsx:101-105` y `RegistroPage.jsx:83-91` ofrecen únicamente Google. El código incluso contempla `account-exists-with-different-credential` sin flujo de vinculación (`auth.js:116-117`). Firebase real tiene ambos proveedores habilitados.

**Riesgo:** la cuenta administrativa creada bajo el UID de correo/contraseña puede quedar sin una vía de acceso en la UI actual; crear otra identidad Google no garantiza conservar ese UID ni el documento `superadmins/{uid}`.

**Solución requerida:** decidir un único modelo, migrar/vincular la credencial preservando el UID o mantener temporalmente un acceso seguro de transición. Documentar y probar la migración antes del despliegue.

**Respuesta de Claude:** El hallazgo es correcto, y al revisarlo apareció algo más grave que
la molestia de acceso: **tener el proveedor de contraseña habilitado abría una vía para
robar invitaciones**.

La apiKey viaja en el bundle y la API de Firebase es pública. Con *Email/Password* activo,
cualquiera puede llamar a `accounts:signUp` por REST declarando **un email que no le
pertenece** —no hay verificación— y obtener un token cuyo campo `email` es ese, con
`email_verified: false`. Las reglas comparaban contra `request.auth.token.email` sin mirar
la verificación, así que ese token servía para satisfacer `tengoInvitacion()` y crearse una
ficha de empleado con el rol invitado. Es decir: si un bar tenía pendiente una invitación
para `cocina@subar.com`, un tercero podía quedarse con ese puesto.

Decisiones tomadas:

1. **Un solo modelo: Google.** No se agrega pantalla de vinculación de credenciales, porque
   requiere pedir la contraseña y eso contradice la decisión de producto. La cuenta
   administrativa creada con contraseña se resuelve una única vez a mano: borrarla en
   Authentication y volver a entrar con Google. El UID cambia, y por eso el documento
   `superadmins/{uid}` hay que rehacerlo con el nuevo. No hay dato asociado que se pierda:
   el superadmin no es dueño de ningún local.

2. **`miEmail()` ahora exige `email_verified == true`** y devuelve `null` si no lo está.
   Todas las comparaciones contra el id del documento verifican además que no sea `null`,
   para que un token sin email no coincida por accidente. Google firma `email_verified` en
   true siempre; un alta por contraseña sin confirmar, no.

3. **Documentado que *Email/Password* debe quedar deshabilitado** en el README, junto con el
   motivo. Las reglas ya no dependen de eso, pero es superficie de ataque que el producto no
   usa.

4. El mensaje de `auth/account-exists-with-different-credential` ahora explica qué hacer en
   lugar de decir solamente que el email ya existe.

**Archivos:** `firestore.rules`, `src/firebase/auth.js`, `README.md`.

**Pruebas:** reglas compiladas y desplegadas a `barflow-hexagroup`; `npm run build`
correcto.

**Por qué queda `En progreso` y no `Resuelto`:** la parte de código está hecha, pero el
hallazgo se cierra con dos acciones en la consola que no puedo ejecutar —no tengo acceso a
la cuenta del operador—: deshabilitar *Email/Password* y rehacer el superadmin con Google.
Hasta que eso pase, la cuenta administrativa sigue sin vía de acceso en la UI actual, que es
exactamente lo que describe el hallazgo. No corresponde marcarlo resuelto por haber tocado
las reglas.

**Riesgo pendiente:** no se ejecutó la prueba negativa real —crear una cuenta por REST con
un email ajeno y confirmar que ya no puede canjear la invitación—. Es la verificación que
cierra el punto y requiere el emulador (`AUD-010`) para hacerse sin ensuciar el proyecto.

**Verificación de Codex (2026-08-24):** se inhabilitó *Email/Password* en Firebase
Authentication, se eliminó la identidad anterior y su documento huérfano en `superadmins`,
y se inició sesión con Google como `hexagroup21@gmail.com`. Firebase generó el UID
`sYUi9zeoKNZ39DrXhb28fRn8vlp1`; se recreó el documento con ese ID y el acceso desde
`/login` redirigió correctamente a `/admin`. La prueba negativa por REST queda bajo
`AUD-010` y no bloquea el cierre de esta migración.

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

**Estado:** Verificado

**Evidencia:** después de pasar el rol Firebase, `MozoPage.jsx:230-238` pregunta “¿Quién sos?” y permite elegir cualquier mozo de configuración; las mesas asignadas y `confirmado_por` usan esa selección (`MozoPage.jsx:133-136`, `199-215`).

**Riesgo:** un mozo autenticado puede actuar y quedar registrado como otro, además de tomar sus mesas.

**Solución requerida:** vincular cada perfil operativo al UID de `empleados/{uid}` y derivar nombre/mesas desde esa ficha. El encargado administra la asignación; el usuario no elige identidad.

**Respuesta de Claude:** Confirmado. Había dos modelos de identidad conviviendo: el real
—la cuenta de Google y su ficha en `empleados/{uid}`— y uno decorativo, la lista `mozos` de
`sistema/configuracion`, que era la que efectivamente decidía nombre, mesas y firma del
pedido. Se eliminó el segundo.

Cambios:

1. `leerFichaEnLocal()` reemplaza a `leerRolEnLocal()` como fuente primaria y devuelve la
   ficha completa. `useAcceso()` la expone y `PuertaDeAcceso` la propaga por `AccesoContext`,
   de modo que la vista recibe la identidad ya resuelta contra la base y no puede elegir otra.
   `leerRolEnLocal()` queda como envoltorio para los llamadores que solo quieren el rol.

2. `MozoPage` perdió la pantalla "¿Quién sos?". El nombre del encabezado sale de
   `ficha.nombre` y ya no existe el botón "Cambiar", que permitía saltar de identidad sin
   volver a autenticarse.

3. `misMesas` sale de `ficha.mesas_asignadas`. Sin asignación explícita la persona ve todo
   el salón, que es lo esperable en un bar chico sin sectores.

4. `confirmado_por` pasó de `mozo_{id de la lista}` a `empleado_{uid}`. El id anterior no
   identificaba a nadie de forma estable: si el encargado reordenaba o renombraba la lista,
   los pedidos viejos quedaban atribuidos a otra persona.

5. La asignación de mesas se administra en **Ajustes → Tu equipo**, sobre la ficha de cada
   persona. Se quitó la sección "Nombres de mozos" de Ajustes, que ya no tenía efecto.

No hizo falta tocar `firestore.rules`: la regla de `empleados/{uid}` ya permitía al encargado
actualizar fichas de su local sin restringir campos, y sigue impidiendo que se cambie el rol
a sí mismo o se desactive.

**Archivos:** `src/firebase/auth.js`, `src/firebase/locales.js`,
`src/firebase/configuracion.js`, `src/utils/useSesion.jsx`, `src/utils/AccesoContext.jsx`,
`src/components/PuertaDeAcceso.jsx`, `src/components/EquipoDelLocal.jsx`,
`src/pages/MozoPage.jsx`, `src/pages/EncargadoPage.jsx`.

**Pruebas:** `npm run build` correcto; se verificó por búsqueda que no queda ninguna
referencia a `mozoActivo` ni a la lista `mozos`; recorrido del comensal en
`/l/bar-de-prueba/mesa/7` sin errores de consola.

**Riesgo pendiente:** no se pudo entrar a `/l/{local}/mozo` con una cuenta de rol mozo
—requiere una sesión de Google del personal—, así que la vista nueva no se ejerció en
ejecución. Queda para validación manual: entrar como mozo y confirmar que aparece el nombre
propio sin pantalla de selección, y que las mesas asignadas desde Ajustes filtran el salón.

**Compatibilidad:** los locales existentes conservan el campo `mozos` en
`sistema/configuracion`. Ya no lo lee nadie; se deja en la base para no escribir sobre datos
de clientes sin necesidad.

**Verificación de Codex (2026-08-24):** con la invitación real canjeada, la cuenta abrió
directamente `/l/bar-de-prueba/mozo`, mostró `Mozo Prueba Codex` en el encabezado y no
ofreció selector de identidad. Tras asignarle solo la mesa 5 desde Ajustes, `Mis mesas`
mostró únicamente Mesa 5 y `Tomar pedido` ofreció únicamente el botón 5. La ficha temporal
se eliminó al finalizar.

### AUD-009 — P1 Alto — Actualizaciones concurrentes pisan pedidos y caja

**Estado:** Resuelto — **sin desplegar**

**Evidencia:** Cocina, Mozo y Encargado leen el pedido completo y vuelven a escribir todo el array `items` (`CocinaPage.jsx:106-120`, `MozoPage.jsx:159-171`, `EncargadoPage.jsx:215-255`). El pedido cargado por mozo y la actualización del total son dos escrituras separadas (`MozoPage.jsx:199-220`).

**Riesgo:** dos operadores simultáneos pueden perder cambios, dejar estados incorrectos o desalinear pedido y total.

**Solución requerida:** transacciones con relectura, o modelar cada ítem como documento independiente; agrupar pedido+total en una operación atómica de servidor. Agregar pruebas de concurrencia.

**Respuesta de Claude:** los cambios de estado y las cancelaciones pasaron al backend, en
transacción. **No está desplegado.**

**El problema tenía dos capas, y la segunda no estaba en el hallazgo original.**

La primera es la que describía Codex: cocina, mozo y encargado leían el pedido entero y lo
reescribían completo. Dos personas sobre la misma comanda se pisaban y uno de los dos cambios
se perdía sin que nadie se enterara. Eso se resolvió releyendo dentro de una transacción.

La segunda apareció al revisar: **las funciones recibían la POSICIÓN del renglón en el
array**. Aunque la transacción evite que se pisen las escrituras, si el encargado cancela el
renglón 0 mientras cocina marca listo el 1, cuando llega el segundo cambio el "1" ya es otro
producto. La transacción lo aplicaba prolijamente… al plato equivocado. Ahora cada renglón
lleva un identificador propio (`rid`) asignado al crearse, y las funciones lo buscan por ese
id: cada operación apunta a lo que apuntaba cuando se decidió.

También se corrigió el descuento al cancelar: se calcula con el precio guardado en el
renglón, dentro de la misma transacción que descuenta de la mesa, y **cancelar dos veces el
mismo renglón ya no descuenta dos veces** —la segunda vez no lo encuentra y avisa—.

**Pruebas:** dentro de los 20 casos de `tests/funciones.test.js`, tres son específicos de
este hallazgo: cambios simultáneos sobre renglones distintos que no se pisan; cancelar un
renglón sin que se corran los otros —el caso que los índices rompían—; y que cancelar
descuente una sola vez.

**Riesgo pendiente:** la transacción resuelve la carrera pero no notifica al que perdió. Si
dos personas cambian **el mismo** renglón a la vez, gana la última y la otra no se entera de
que su cambio quedó sobrescrito. Para estados de comanda es tolerable; si alguna vez se
aplica el mismo patrón a la caja, no lo sería.

### AUD-010 — P1 Alto — No hay red de seguridad automatizada para reglas y flujos críticos

**Estado:** Verificado

**Evidencia:** `package.json` solo define `dev`, `build` y `preview`; no hay tests, lint, emuladores automatizados ni CI. El build compila, pero no valida autorización ni comportamiento.

**Riesgo:** un cambio pequeño en reglas, rutas o auth puede abrir otro local o romper caja/invitaciones sin detectarse.

**Solución requerida:** sumar Firebase Emulator Suite y tests de matriz rol × local × mesa × operación; tests unitarios de totales; E2E de registro, invitación, pedido, pago y soporte; lint y CI obligatorios.

**Respuesta de Claude:** Entregado el emulador y la matriz de reglas; falta lo demás.

**Lo hecho:**

1. `firebase.json` declara los emuladores de Firestore (8080), Auth (9099) y la UI (4000).

2. `tests/reglas.test.js`: **29 pruebas** con `@firebase/rules-unit-testing` sobre Vitest,
   agrupadas por hallazgo. Casi todas son negativas —lo que NO se debe poder hacer—, que es
   justamente lo que no se detecta usando la app a mano: una regla de más no rompe ninguna
   pantalla, solo abre una puerta. Cubren:

   - **Quién es comensal** (`AUD-001`/`AUD-003`): una sesión anónima opera su mesa; una
     cuenta de Google sin ficha en ese local, no.
   - **Aislamiento entre negocios**: la encargada del bar A no lee el historial del B, no
     edita su carta y no da de alta empleados ahí.
   - **Soporte solo lectura** (`AUD-003`): la plataforma lee carta, caja y mesas, lista el
     padrón —que nadie más puede—, y tiene denegadas todas las escrituras sobre datos del
     cliente, incluida la de repartir roles. Sí administra plan y estado del local.
   - **Local suspendido**: congela a comensales y personal; la plataforma lo reactiva.
   - **Invitaciones** (`AUD-004`): el encargado invita sin necesitar leer el índice global
     —se verifica que esa lectura le sigue estando negada—; otro encargado no puede robarle
     una invitación pendiente; el canje solo funciona con el rol invitado.
   - **Email verificado** (`AUD-006`): la prueba negativa que había quedado pendiente. Un
     token con `email_verified: false` no canjea la invitación de esa dirección ni la lee.
   - **Escalada dentro del local**: un mozo no se asciende ni edita la carta; la encargada
     no se quita el rol a sí misma; nadie se anota como superadmin; un local no puede nacer
     activo ni a nombre de otra persona.

3. Scripts: `npm test` / `npm run test:reglas`, que levantan el emulador con
   `firebase emulators:exec` contra el proyecto `barflow-pruebas` (nunca el real), y
   `npm run lint`. `firebase-tools` está declarado en `devDependencies`, así que el script
   usa el binario de `node_modules/.bin` y no depende de que haya una instalación global.

4. **ESLint estaba roto y por eso nunca había corrido.** `eslint.config.js` apuntaba a
   `reactHooks.configs.flat.recommended`, que no existe en la versión 5.x del plugin
   (`recommended-latest`). Corregido e instaladas las dependencias que el archivo ya
   importaba. Con eso el proyecto pasa de 0 a 9 advertencias y 0 errores.

**Corrección posterior (Codex, 2026-08-24):** el listener de llamadas que se agregó al
cerrar este hallazgo tenía una condición de inicialización mal puesta. `llamadasAvisadas` es
un único ref compartido por los listeners de todas las mesas, y `primeraVez` se calculaba
sobre él: bastaba con que la mesa 1 registrara una llamada pendiente para que el **primer**
snapshot de la mesa 2 sonara por llamadas que ya existían. Falsas alarmas al abrir la
pantalla. Corregido con un `Set` de mesas ya inicializadas, y ambos registros se reinician
al cambiar de `localId`.

**Lo que encontró el lint al correr por primera vez:** código muerto en `EncargadoPage`
—`sonidoLlamadaMozo` importado y el ref `llamadasAnteriores` declarado, ninguno usado—. Se
removió. Implica que **el encargado no recibe aviso sonoro cuando una mesa levanta la mano**,
aunque sí lo recibe por pedidos, cuentas y mensajes. Se reporta como hueco funcional, no se
agregó el sonido: es un cambio de comportamiento que no corresponde meter dentro de este
hallazgo.

**Archivos:** `firebase.json`, `package.json`, `eslint.config.js`, `tests/reglas.test.js`,
`src/pages/EncargadoPage.jsx`, `src/pages/MesaPage.jsx`, `src/utils/sonidos.js`,
`src/firebase/locales.js`.

**Pruebas:** `npx eslint .` → 0 errores. `npm run build` correcto. Vitest **colecta las 29
pruebas** correctamente.

*Corrección (Codex):* el conteo de advertencias que figuraba acá era 9, tomado de una
corrida anterior al cambio del aviso de llamadas. En el commit `4057732` eran **10**. Con
`notif` agregado a las dependencias de ese efecto —es estable, viene de un `useCallback` sin
deps, así que no provoca resuscripciones— vuelven a ser **9**.

**Ejecución (2026-08-24):** instalado OpenJDK 21, la suite corrió completa contra el
emulador: **29 pruebas, 29 en verde**, en 11 segundos. Los `PERMISSION_DENIED` esperados
aparecen en el log del emulador con la línea exacta de `firestore.rules` que rechazó cada
intento, lo que sirve además como documentación de dónde vive cada frontera.

Con esto quedan verificadas por ejecución —y no por revisión a ojo— las tres validaciones
que `AUD-003`, `AUD-004` y `AUD-006` habían dejado anotadas como manuales.

**Falta, con destino nominado** (a pedido de Codex, para que no se pierdan del
seguimiento):

| Qué falta | Dónde se sigue | Por qué ahí |
|---|---|---|
| Tests unitarios de totales | `AUD-002` | El cálculo se mueve al servidor; escribirlos ahora sería testear código que va a desaparecer. |
| E2E de pedido, pago y cierre de caja | `AUD-002` | Mismo motivo: el flujo de dinero cambia con las Cloud Functions. |
| E2E de registro, invitación y soporte | `AUD-014` | Abierto por Codex el 2026-08-24 a partir de este residuo. Agrupa todo lo que necesita interfaz y sesiones reales. |
| Prueba del aviso de llamadas | `AUD-014` | Es lógica de interfaz: queda fuera del alcance de la matriz de reglas. |
| CI | `AUD-013` | Ese hallazgo ya pide "definir pipeline de staging/producción con rollback": la CI es parte de ese pipeline. Se dejó anotado también en su texto. |

**Verificación de Codex (2026-08-24):** re-verificado sobre `836b029` con instalación
limpia: `npm test` 29/29, lint con 0 errores y 9 advertencias, y build correcto. La Firebase
CLI quedó reproducible y la corrección de inicialización por mesa del aviso de llamadas es
correcta. Se abre `AUD-014` para agrupar los E2E de interfaz y sesiones reales, incluida la
prueba del aviso de llamadas.

Se marca `Resuelto` porque la red de seguridad sobre reglas —que era el riesgo central del
hallazgo: "un cambio pequeño en reglas, rutas o auth puede abrir otro local sin
detectarse"— ya existe y corre. El resto queda con dueño asignado, no disuelto.

### AUD-011 — P2 Medio — Escalabilidad y costos crecen por mesa y por historial completo

**Estado:** Pendiente

**Evidencia:** Mozo abre tres listeners por mesa (`MozoPage.jsx:51-75`); Cocina y Encargado también suscriben por mesa. Estadísticas e historial descargan colecciones completas (`EncargadoPage.jsx:176-211`, `CocinaPage.jsx:53-84`). `liberarMesa()` concentra todas las eliminaciones en un batch (`mesa.js:149-168`), limitado a 500 escrituras.

**Riesgo:** crecimiento lineal de listeners/lecturas, costos elevados, UI lenta y fallos al liberar sesiones largas.

**Solución requerida:** colecciones/consultas agregadas por estado, índices y paginación; métricas diarias precalculadas; limpieza paginada desde backend; callbacks de error visibles en todos los listeners.

**Respuesta de Claude:** _Pendiente._

### AUD-012 — P2 Medio — Dependencias con vulnerabilidades conocidas

**Estado:** Verificado

**Evidencia:** `npm audit --omit=dev` reportó 12 vulnerabilidades: 1 alta y 11 moderadas. La cadena principal incluye `firebase@10.14.1` → `undici@6.19.7`; `react-router-dom@6.30.6` también está señalado.

**Riesgo:** se mantienen versiones con avisos corregidos. Parte del impacto de `undici` corresponde al entorno Node y debe evaluarse, pero no ignorarse.

**Solución requerida:** actualizar Firebase a una versión corregida y evaluar la migración soportada de React Router; ejecutar build, E2E y `npm audit` nuevamente. No usar `--force` sin revisar cambios mayores.

**Respuesta de Claude:** **Producción quedó en 0 vulnerabilidades** (eran 12).

**Antes de tocar nada, una distinción que cambia la prioridad.** De las 23 que reportaba
`npm audit`, 9 de las 12 de producción venían por la cadena `firebase@10.14.1 → undici`.
Pero `undici` **no llega al navegador**: sólo está en el build de Node
(`@firebase/firestore/dist/index.node.cjs.js`), y `grep -c undici dist/assets/*.js` devuelve
0. Es decir, esas 9 afectaban a `seed.js` —que corre en Node— y no al celular del comensal.
Las que sí viajaban al bundle eran las 2 de `react-router`: *open redirect* por backslash en
`<Link>`/`useNavigate`, y *arbitrary constructor injection* por deserialización.

**Lo hecho:**

| Paquete | De | A | Motivo |
|---|---|---|---|
| `firebase` | 10.14.1 | 12.18.0 | Corta la cadena `undici`. |
| `react-router-dom` | 6.30.6 | 7.18.2 | Las dos únicas que llegaban al navegador. |
| `@firebase/rules-unit-testing` | 3.0.4 | 5.0.2 | Su `peerDependency` es `firebase@^12`; se había fijado en la 3 justamente para no adelantarse a este upgrade. |

Sobre React Router: el salto es de *major*, pero la app usa sólo la API declarativa
—`BrowserRouter`, `Routes`, `Route`, `Link`, `Navigate`, `useNavigate`, `useParams`—, toda
soportada sin cambios en la v7. Se verificó en ejecución, no sólo con el build: el catch-all
redirige a `/login`, las rutas con parámetro resuelven el local y la mesa, la navegación del
lado del cliente entre rutas funciona y la consola queda sin errores.

**Regresión introducida, que hay que decir:** el bundle pasó de **741 kB a 985 kB**
(gzip 192 → 261 kB). Se midió a qué se debe en vez de suponerlo: con `react-router@6` +
`firebase@12` el bundle da 968 kB, así que **el router aporta ~17 kB y firebase ~227 kB**.
Es el precio del parche de seguridad. `AUD-013` ya pedía separar en chunks y cargar por
ruta; ahora eso pasó de conveniente a necesario, y quedó anotado ahí.

**Lo que queda, y por qué se deja:** siguen 12 vulnerabilidades **sólo de desarrollo** —1
crítica en `vitest`, 1 alta en `vite`, y la cadena de `firebase-tools`—. No se subieron
`vite` (5 → 8) ni `vitest` (2 → 4) porque son dos saltos de *major* que tocan el build y el
plugin de PWA, con beneficio que no alcanza al usuario: la crítica de `vitest` exige levantar
su UI (`vitest --ui`), y `npm test` corre `vitest run`, que no abre servidor; la de `vite`
afecta al servidor de desarrollo en localhost. Cambiar la herramienta que compila y prueba la
app merece ser su propio bloque con verificación, no un arrastre de este.

**Archivos:** `package.json`, `package-lock.json`.

**Pruebas:** `npm audit --omit=dev` → **0**; `npm audit` → 12, todas de desarrollo;
`npm test` 29/29; `npx eslint .` 0 errores; `npm run build` correcto con el service worker
generado; verificación de navegación en el navegador.

**Riesgo pendiente:** la app se ejerció como comensal después del upgrade, pero **no** con
sesiones de personal —eso depende de `AUD-014`—. Un cambio de *major* en el router justifica
repetir los recorridos manuales de encargado, mozo y cocina antes de dar esto por cerrado en
producción.

**Re-verificación de Codex (2026-08-25):** la parte mecánica de `AUD-012` coincide con el
informe: producción 0 vulnerabilidades; total 12 sólo de desarrollo (9 moderadas, 2 altas y
1 crítica); 29/29 pruebas; lint sin errores; build/PWA correcto; bundle de 985,40 kB
(261,34 kB gzip). El estado se mantiene en **Resuelto**, no Verificado, hasta repetir las
rutas de personal después de corregir el bloqueo de `MozoPage` registrado en `AUD-014`.

### AUD-013 — P2 Medio — Entrega, PWA, mantenibilidad y accesibilidad incompletas

**Estado:** Pendiente

**Nota (2026-08-24):** la **CI** se sigue en este hallazgo, trasladada desde `AUD-010`. El
pipeline que se pide acá tiene que ejecutar `npm run lint`, `npm test` y `npm run build`
antes de cualquier despliegue; sin eso, correr las pruebas depende de que alguien se
acuerde.

**Evidencia:** Firebase Hosting real no está inicializado aunque `firebase.json` lo declara; la PWA usa `autoUpdate` sin una estrategia visible de migración de sesiones/versiones; el bundle principal pesa 735,33 kB. `EncargadoPage.jsx` tiene 977 líneas, `MesaPage.jsx` 674 y varios labels no están asociados con controles.

**Riesgo:** no hay destino productivo verificable, pestañas antiguas pueden convivir con cambios incompatibles de auth/reglas, la carga inicial es mayor y cuesta probar/mantener las vistas; accesibilidad por teclado/lector de pantalla es débil.

**Solución requerida:** definir pipeline de staging/producción con rollback y versión mínima; inicializar Hosting cuando se autorice; separar páginas en módulos/hooks y lazy-load por ruta; ejecutar una revisión de accesibilidad (labels, foco, diálogos, contraste y teclado).

**Nota (2026-08-24):** el upgrade de `AUD-012` subió el bundle principal de **741 kB a
985 kB** (gzip 192 → 261 kB), de los cuales ~227 kB son de `firebase@12`. Lo que este
hallazgo pedía como mejora —separar en chunks y hacer *lazy-load* por ruta— pasó a ser
necesario: la pantalla del comensal descarga hoy el código del encargado, del mozo y de la
cocina, que nunca va a usar.

**Respuesta de Claude:** _Pendiente._

### AUD-014 — P1 Alto — Sin pruebas automatizadas de interfaz ni de sesiones reales

**Estado:** Pendiente

**Origen:** abierto por Codex el 2026-08-24, a partir del residuo de `AUD-010`. La matriz de
reglas cubre la frontera de autorización del servidor, pero nada verifica los recorridos que
atraviesan la interfaz y una sesión de Google real.

**Evidencia:** al cerrar `AUD-003`, `AUD-004` y `AUD-008` hubo que anotar "queda para
validación manual" porque las funciones centrales —invitar personal, entrar como mozo, dar
soporte— exigen una sesión de Google que las pruebas de reglas no pueden simular. El aviso
de llamadas del encargado (`AUD-010`) quedó en la misma situación: es lógica de interfaz.

**Riesgo:** funciones que compilan, pasan las reglas y aun así no funcionan. Ya pasó una vez:
`AUD-004` era un `permission-denied` en el alta de personal que ni el build ni la revisión de
código detectaron, y solo apareció cuando alguien leyó la línea. Sin recorridos
automatizados, cada cambio en auth o navegación se valida a mano o no se valida.

**Alcance propuesto:**

| Recorrido | Qué debe verificar |
|---|---|
| Registro de un local | `/registro` con Google → local en estado `prueba` → ficha de encargado → configuración por defecto. |
| Invitación y canje | El encargado invita → la persona entra por primera vez → obtiene su ficha con el rol invitado y **solo** ese rol. |
| Vista del mozo | Entra con su cuenta, ve su propio nombre sin selector, y las mesas asignadas filtran el salón. |
| Modo soporte | Desde `/admin`, las tres vistas internas sin botones de acción. |
| Aviso de llamadas | Con llamadas ya pendientes al abrir: **no** suena. Con una nueva: suena una sola vez, en la mesa correcta. |
| Navegación entre locales | Pasar de un local a otro sin recargar no arrastra datos del anterior. |
| **Render de cada vista interna** | Que Encargado, Mozo y Cocina **monten**. Un error de zona muerta temporal deja la pantalla en blanco y no lo ve ni el build ni la matriz de reglas. |
| **Canje de invitación que falla** | Mensaje que diga que falló el canje, no "no estás asociado a ningún local". |

**Nota sobre herramientas:** requiere un runner de navegador (Playwright o similar) y una
estrategia para las sesiones de Google —lo habitual es el emulador de Auth con usuarios
sembrados, en vez de OAuth real—. Conviene decidirlo antes de escribir el primer test.

**Verificación manual de Codex (2026-08-24, base real):**

| Recorrido | Resultado |
|---|---|
| Invitación y canje | Correcto: alta, cancelación, recreación y canje con Google. El duplicado del mismo local sobrescribe silenciosamente la invitación; falta definir el contrato esperado. |
| Vista del mozo | Correcto: nombre propio, sin selector, y filtros de `Mis mesas` y `Tomar pedido` limitados a la mesa asignada. `AUD-008` pasa a Verificado. |
| Modo soporte | Correcto en Encargado, Mozo y Cocina: cartel de soporte y ausencia de acciones operativas. |
| Aviso de llamadas del encargado | Correcto visualmente: una llamada ya pendiente al abrir no mostró banner; una llamada nueva produjo un único banner para Mesa 1 con la nota correcta. Se activó el audio, pero la automatización no puede certificar que la salida física haya sonado. |

**Limpieza:** se resolvieron las llamadas, se liberó la mesa 1, se eliminó la ficha y el
puntero del empleado temporal y no quedó invitación pendiente. La cuenta de prueba confirma
que ya no está asociada al local.

**Hallazgo adicional antes de automatizar:** el aviso de llamadas de `MozoPage` todavía usa
`Object.keys(llamadasAnteriores.current).length > 0` como señal de inicialización
(`src/pages/MozoPage.jsx:100-108`). Si el primer snapshot no trae llamadas —el caso normal—
el objeto queda vacío, y la primera llamada posterior tampoco genera sonido ni banner; lo
mismo puede repetirse después de resolver todas. El encargado no tiene ese defecto porque
usa inicialización por mesa. Claude debe corregir el listener del mozo y agregar este caso a
la prueba E2E de llamadas.

**Qué sigue pendiente en AUD-014:** automatizar estos recorridos; probar registro de local,
navegación entre dos locales y salida audible; fijar el comportamiento de una invitación
duplicada. Por eso el hallazgo permanece `Pendiente`.

**Respuesta de Claude (2026-08-24):** atendidos los dos asuntos que levantó la verificación
manual. El hallazgo **sigue Pendiente**: faltan Playwright, registro, navegación entre
locales y la comprobación audible.

**1. Invitar dos veces el mismo email — resuelto como `upsert` explícito.**

Se eligió `upsert` y no error, porque volver a invitar es una operación legítima: corregir un
nombre mal escrito o cambiar el rol antes de que la persona entre. Lo que estaba mal no era
la escritura sino el silencio. Ahora:

- Si el email **ya está en el equipo**, se rechaza con un mensaje que explica que el rol se
  cambia desde el desplegable de su fila. Invitar a alguien que ya trabaja ahí no hace nada
  útil.
- Si tiene una **invitación pendiente**, se pide confirmación diciendo qué va a cambiar
  —incluido el cambio de rol, si lo hay— y al terminar el cartel dice "actualizada", no
  "listo".
- No hizo falta ninguna lectura extra: `EquipoDelLocal` ya tiene el equipo y las
  invitaciones pendientes en estado.

**2. Señal de inicialización por objeto vacío — corregido, y estaba en ocho lugares.**

Codex señaló `MozoPage.jsx:100-108`. Al revisarlo, el mismo patrón —`Object.keys(ref).length
> 0` como señal de "ya arranqué"— aparecía en **ocho** puntos de cuatro vistas: los tres
avisos de `MozoPage`, los cuatro de `EncargadoPage` y el de `CocinaPage`. El de Cocina es
probablemente el más grave en la operación diaria: una cocina que abre a la mañana sin
pedidos activos no sonaba para el primero del día.

El patrón falla de dos maneras opuestas:

- Si el primer snapshot viene vacío, el registro queda vacío, el siguiente evento se vuelve
  a leer como "arranque" y **no avisa**.
- Con varias mesas escuchando en paralelo, basta que una reporte algo para que el registro
  deje de estar vacío: el primer snapshot de las demás se toma por novedad y **avisa de
  más**.

La señal correcta no es "hay algo guardado" sino "esta mesa ya reportó alguna vez". Se
centralizó en `src/utils/avisos.js`, que lleva por separado qué mesas dieron su línea de base
y qué items ya se anunciaron. Los registros se reinician al cambiar de local, y el del chat
del encargado también al cambiar de mesa.

**Archivos:** `src/utils/avisos.js` (nuevo), `src/components/EquipoDelLocal.jsx`,
`src/pages/MozoPage.jsx`, `src/pages/EncargadoPage.jsx`, `src/pages/CocinaPage.jsx`,
`src/pages/MesaPage.jsx`.

**Pruebas:** `npm test` 29/29; `npx eslint .` 0 errores y 6 advertencias —bajó de 9 porque
los `useEffect` tocados quedaron con sus dependencias completas—; `npm run build` correcto.

**Regresiones que este hallazgo debe cubrir cuando existan los E2E:**

| Caso | Qué debe pasar |
|---|---|
| Abrir con avisos ya pendientes | Ni sonido ni banner. |
| Primer evento con snapshot inicial **vacío** | Suena y aparece un banner. Es el caso que fallaba. |
| Mesas que reportan en distinto momento | La que llega tarde no genera avisos por lo que ya tenía. |
| Invitar dos veces el mismo email | Pide confirmación y el mensaje dice "actualizada". |
| Invitar a alguien que ya está en el equipo | Se rechaza con explicación. |

**Riesgo pendiente:** las correcciones se validaron con build, lint y la matriz de reglas,
pero **ninguna de las cinco filas de arriba está automatizada** —es precisamente lo que
justifica este hallazgo— ni se comprobó el audio real. La verificación sigue siendo manual.

**Re-verificación de Codex (2026-08-25) — bloqueo:** con una sesión real de mozo, `/login`
resuelve correctamente la pertenencia y redirige a `/l/bar-de-prueba/mozo`; por lo tanto, el
email, el puntero `usuarios/{uid}` y la ficha de empleado no son la causa del fallo observado.
La pantalla se cae antes de renderizar con `ReferenceError: Cannot access 'misMesas' before
initialization`. `src/pages/MozoPage.jsx:90-134` usa `misMesas` dentro del efecto de avisos y
en su lista de dependencias, pero la constante se declara recién en
`src/pages/MozoPage.jsx:158-161`. Esto entró en `b066977` y demuestra exactamente el residuo
que `AUD-014` intenta cubrir: build, lint y reglas pasan mientras una vista real no abre.

**Corrección requerida antes de iniciar el bloque de Functions:** declarar
`NUMS_MESAS_ACTUAL` y `misMesas` antes del efecto que las usa, repetir el acceso real del
mozo y agregar una prueba de render/E2E para esta ruta. Como mejora asociada,
`LoginPage.jsx:45-49` no debe descartar silenciosamente errores del canje de invitación: debe
mostrar el error concreto para no confundir una falla de permisos/red con "cuenta no
asociada".

**Corrección de la regresión de `b066977` (2026-08-24):** la verificación con sesión real
encontró que `MozoPage` quedaba en blanco con *Cannot access 'misMesas' before
initialization*. Es una regresión propia del refactor de avisos y era bloqueante: el mozo no
podía trabajar.

**Causa:** el array de dependencias de un `useEffect` **se evalúa durante el render**, en el
punto exacto donde está escrito. El efecto de avisos quedó en la línea 153 con `misMesas` en
sus dependencias, y la constante se declaraba recién en la 159: zona muerta temporal, y la
vista revienta antes de pintar nada. Antes del refactor no pasaba porque `misMesas` no estaba
en las dependencias; la agregué al satisfacer `exhaustive-deps` sin mover la declaración.

**Lo corregido:**

1. `NUMS_MESAS_ACTUAL`, `misMesas` y `firmaDelMozo` se movieron arriba del efecto, con un
   comentario que explica por qué el orden importa acá y no es una formalidad de estilo.

2. **Se activó `no-use-before-define` en ESLint**, que es lo que faltaba: ni el build ni la
   matriz de reglas ven este error —el archivo compila igual—, y sólo aparece al montar el
   componente. Ahora la regla lo cubre en todo el repositorio, no sólo en el caso que
   encontró Codex. Al activarla salieron dos casos más en `EncargadoPage`
   (`cargarHistorial` y `calcularEstadisticas`): no eran crashes, porque se llaman dentro del
   cuerpo del efecto —que corre después del render— y no en el array de dependencias, pero se
   reubicaron igual para dejar la regla en cero y que siga sirviendo.

3. **Errores del canje de invitación:** `LoginPage` los descartaba con un `.catch` vacío y la
   persona terminaba viendo "tu cuenta no está asociada a ningún local" —falso, y la manda a
   pedirle al encargado una invitación que ya tiene—. Ahora hay una pantalla propia que
   distingue "el canje falló" de "no hay invitación", muestra el código del error y ofrece
   reintentar. El mismo `.catch` vacío estaba en `useSesion.jsx`, en el camino de
   `PuertaDeAcceso`, donde el mensaje engañoso era "no pertenecés al equipo": ahí el error
   ahora queda registrado en consola.

**Archivos:** `src/pages/MozoPage.jsx`, `src/pages/EncargadoPage.jsx`,
`src/pages/LoginPage.jsx`, `src/utils/useSesion.jsx`, `eslint.config.js`.

**Pruebas:** `npx eslint .` 0 errores; `npm test` 29/29; `npm run build` correcto. La
verificación del TDZ es estática y decisiva por naturaleza —el error es puramente léxico—:
`misMesas` se declara en la línea 100 y se usa en la 153, y `no-use-before-define` da **0
violaciones en todo el repositorio**.

**Riesgo pendiente:** no se pudo montar `MozoPage` en ejecución porque requiere una sesión de
Google con rol mozo. **El render de la vista del mozo tiene que repetirse con una cuenta
real**, y ese render se agrega como caso a cubrir en este hallazgo. Tampoco se ejercitó la
pantalla nueva de error de canje: para verla hay que forzar una falla en el canje, cosa que
conviene hacer con el emulador de Auth cuando se arme el E2E.

**Verificación final de Codex (2026-08-25):** bloqueo levantado sobre `f50d6bf`. Se reinició
el servidor de `localhost:5175` con las dependencias actuales y `--force` —el proceso
anterior había arrancado antes de `AUD-012` y todavía servía el prebundle de Router 6—. Con
la sesión real del mozo, `/login` redirigió a `/l/bar-de-prueba/mozo`; la vista montó y se
recorrieron `Alertas`, `Mis mesas` y `Tomar pedido` sin errores propios de la aplicación.
Además, Codex repitió `npm run lint` (0 errores), `npm test` (29/29) y `npm run build`
(PWA correcta, 986,52 kB / 261,59 kB gzip). `AUD-012` pasa a **Verificado** y el bloque
`AUD-001 + AUD-002 + AUD-005` puede comenzar.

**Residuo que permanece en AUD-014:** `LoginPage` ya diferencia correctamente un canje
fallido, pero el camino de acceso directo por `PuertaDeAcceso` sólo registra el error desde
`useSesion.jsx` y luego puede mostrar igualmente "no pertenecés al equipo". No bloquea el
trabajo de Functions, pero el E2E de canje fallido debe exigir el mismo mensaje correcto en
ambos caminos y no sólo presencia en consola.

### AUD-015 — P0 Bloqueante — El mozo no podía tomar pedidos de una categoría entera

**Reportado por:** prueba real en el bar, 2026-08-27. *"la seccion de tomar pedido del mozo no
funciona, aparece la carta pero no avanza para enviar el pedido."*

**Causa.** La lista de categorías estaba escrita dos veces, una en `MesaPage.jsx` (comensal) y
otra en `MozoPage.jsx`. No coincidían: al mozo le faltaba `promocion`. El local había cargado
su menú del día justamente ahí, así que el filtro `carta.filter(i => i.categoria ===
categoriaActiva)` no podía alcanzarlo desde ninguna pestaña del mozo. El carrito quedaba
vacío, y el botón "📤 Enviar pedido" sólo se dibuja con el carrito cargado: por eso la carta
aparecía y no pasaba nada.

Nada fallaba de forma visible —ni un error en consola, ni una regla rechazando nada—. Es el
tipo de defecto que sólo se descubre intentando vender ese producto en particular.

**Corrección.** Una sola lista en `src/utils/categorias.js`, importada por las dos vistas. Se
agregó además una categoría **"Otros"** de recolección: un producto cuya categoría no figure
en la lista —quedó de una versión anterior, o alguien la escribió a mano en la consola— se
muestra ahí en vez de desaparecer. Y las pestañas ahora se arman con las categorías que la
carta **realmente tiene**, no con las cinco fijas: un bar que sólo vende bebidas ya no abre
en una pestaña "Comidas" vacía.

Colateral: `categoriaActiva` estaba fija en `'comida'` como estado inicial, que era la otra
mitad del mismo problema.

**Pruebas nuevas:** `tests/vistas.test.js` (13 casos, sin emulador). El caso central es
*"ningún producto de la carta se queda afuera"*: para cada producto se exige que exista al
menos una pestaña que lo muestre. Esa propiedad se cumple sin importar qué categorías se
agreguen después.

---

### AUD-016 — P1 Alto — Los avisos del chat se perdían y el encargado se auto-notificaba

**Reportado por:** la misma prueba real. Tres cosas distintas, todas del chat.

**1. El encargado no ve un mensaje si no está parado en esa mesa.** Escucha el chat de **una**
mesa: la que tiene abierta. Un cliente de la mesa 7 escribiendo mientras él mira la 3 producía
un sonido —bajo— y nada más: el aviso no dejaba rastro. Si no estaba mirando la pantalla en
ese segundo exacto, el mensaje se perdía.

Ahora hay un listener por mesa, pero **de un solo documento**: el último mensaje
(`orderBy desc, limit 1`). Alcanza para saber si hay algo sin leer y cuesta un documento por
mesa en vez de traerse las conversaciones enteras del salón. Las mesas con algo pendiente se
marcan con un punto rojo en la grilla y con un contador en la pestaña "🏠 Mesas".

La marca de "ya lo vi" se guarda en el navegador, no en Firestore: es de esa persona en ese
dispositivo. Si el encargado atiende desde la tablet de la barra y desde su celular, cada uno
lleva su propia cuenta, que es lo correcto.

**2. El encargado recibía la notificación de su propio mensaje.** El chat distinguía autores
comparando el nombre. Además de auto-notificar, eso significaba que un comensal que se pusiera
de nombre "Encargado" aparecía dibujado como personal del local dentro del chat de su mesa.

Los mensajes ahora llevan un campo `rol` (`'cliente'` o `'staff'`) y **las reglas exigen que
coincida con quien escribe**: un comensal no puede crear un mensaje con `rol: 'staff'` ni al
revés. No es un agujero grave —el alcance es el chat de una mesa— pero era suplantación, y se
cierra en la frontera y no en la vista. Los mensajes escritos antes de que existiera el campo
se siguen leyendo por el nombre del autor.

**3. El comensal tampoco veía la respuesta.** Está casi siempre mirando la carta, con el
celular apoyado en la mesa. Se agregó un punto verde en la pestaña "Chat" que queda hasta que
la abra.

**Pruebas nuevas:** 3 casos de reglas (el rol no se puede falsear, en los dos sentidos, y un
mensaje sin rol se rechaza) y 8 de unidad sobre la lógica de pendientes.

---

### AUD-017 — P1 Alto — El sonido dependía de que alguien encontrara un botón

**Reportado por:** la misma prueba. *"el sonido es muy bajito"*, y el mozo se perdía avisos.

Los navegadores no dejan sonar nada hasta que la persona toca la pantalla. La app resolvía eso
con un botón 🔕 en la barra: quien no lo apretaba **no escuchaba ningún aviso en todo el turno
y no tenía forma de enterarse de que se los estaba perdiendo**. Para un mozo que depende de
esos avisos para saber que hay un pedido listo, es un modo de falla silencioso.

Cualquier gesto sirve para levantar el bloqueo, y para usar la app hay que tocarla igual. Ahora
se aprovecha el primero que llegue —`pointerdown`, `keydown` o `touchstart`— y el botón queda
sólo como indicador de estado. El aviso de mensaje pasó además de un tono flojo a dos tonos más
fuertes.

Y lo más importante: el sonido dejó de ser el único canal. Un aviso sonoro en un bar compite
con la música y con la gente; los puntos de AUD-016 quedan hasta que alguien los atienda.

**Nota sobre el estado del audio:** vivía duplicado en cada pantalla (`audioOn` por página).
Ahora es uno solo para toda la pestaña, en `src/utils/sonidos.js`, y las vistas se suscriben:
el indicador no puede quedar apagado mientras el audio ya está andando.

## Orden de implementación para Claude

1. Congelar despliegues y cubrir con pruebas de reglas `AUD-001` a `AUD-004`.
2. Corregir la frontera de seguridad y cálculo servidor (`AUD-001`, `AUD-002`, `AUD-003`).
3. Reparar invitaciones y operaciones atómicas (`AUD-004`, `AUD-005`, `AUD-009`).
4. Resolver migración de identidad, tenant y mozos (`AUD-006`, `AUD-007`, `AUD-008`).
5. Incorporar la suite automática antes de refactorizar (`AUD-010`).
6. Atender costos, dependencias y entrega (`AUD-011` a `AUD-013`).
7. Cubrir los recorridos de interfaz y sesiones reales (`AUD-014`).

No conviene que Claude intente resolver todos los puntos en un único cambio. Cada bloque debe incluir reglas, código, tests del emulador y una nota en el registro.

## Resumen ejecutivo

La estructura multi-local y la centralización de rutas son una buena base, pero BarFlow todavía no está listo para producción. Los bloqueantes son de seguridad y consistencia: el comensal no está ligado a su mesa, el servidor confía en precios/totales del navegador, soporte no es realmente solo lectura y el alta de personal contradice las reglas desplegables. Después de esos cuatro puntos deben resolverse atomicidad, migración de credenciales y concurrencia. El build correcto demuestra que el código compila; no demuestra que la autorización o la caja sean seguras.
