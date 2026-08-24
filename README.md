# BarFlow

SaaS de pedidos por QR para bares y cafeterias, de Hexa Systems.
El comensal escanea el QR de su mesa, pide desde el celular, sigue el estado
de su pedido en tiempo real y pide la cuenta, sin esperar a que pase el mozo.

Nacio como "Qallariy Coffee", se generalizo como producto y hoy es
**multi-local**: un solo proyecto de Firebase atiende a todos los negocios.

## Stack

- React 18 + Vite (JavaScript, sin TypeScript)
- Firebase: Firestore (tiempo real), Authentication y Hosting
- PWA instalable (vite-plugin-pwa)

## Como se organiza la base

Todo lo que pertenece a un negocio cuelga de `locales/{localId}`. El `localId`
viaja en la URL, asi que cada consulta y cada regla sabe de que local se trata
sin tener que confiar en el cliente.

```
locales/{localId}                    el negocio: nombre, logo, owner_uid, plan, estado
  ├─ carta/{itemId}
  ├─ mesas/mesa_{n}
  │    ├─ pedidos/{id}
  │    ├─ mensajes/{id}
  │    └─ llamadas/{id}
  ├─ historial/{id}                  caja y facturacion cerrada
  ├─ sistema/configuracion           transferencia, mozos, cantidad de mesas
  ├─ empleados/{uid}                 { nombre, email, rol, activo }
  └─ invitaciones/{email}            pendientes de que la persona entre

usuarios/{uid}         { local_id, rol }   indice: a que local pertenece una cuenta
invitaciones/{email}   { local_id, rol }   indice: a que local me invitaron
superadmins/{uid}                    el admin del SaaS. Solo desde la consola.
```

**El rol no es una propiedad de la cuenta sino de la relacion entre la cuenta y
el local.** Trabajar en el bar A no dice nada sobre el bar B: alla no hay ficha
en `empleados`, y sin ficha no hay permiso. El aislamiento entre negocios es por
construccion, no un filtro que alguien pueda olvidar de poner.

Ningun archivo arma rutas de Firestore a mano: todas salen de
`src/firebase/rutas.js`.

## Vistas

| Ruta                       | Quien entra    | Que hace |
|----------------------------|----------------|----------|
| `/registro`                | Un bar nuevo   | Da de alta su negocio y queda como encargado |
| `/login`                   | Personal       | Entra y lo manda a la vista de su local |
| `/admin`                   | Hexa Group     | Todos los locales: activar, suspender, entrar |
| `/l/:localId/mesa/:numero` | El comensal    | Carta, carrito, estado del pedido, chat y cuenta |
| `/l/:localId/encargado`    | Encargado      | Salon en vivo, barra, carta, estadisticas, historial, ajustes y equipo |
| `/l/:localId/cocina`       | Cocina         | Tablero de comandas por estado |
| `/l/:localId/mozo`         | Mozo           | Alertas, sus mesas y toma de pedidos |

Los QR de las mesas apuntan a `/l/{localId}/mesa/{numero}`.

Cada producto de la carta tiene un **destino** (`cocina`, `encargado` o `mozo`)
que decide en que cola de preparacion aparece.

## Puesta en marcha

```bash
npm install
cp .env.example .env     # completar con los datos del proyecto de Firebase
npm run dev
```

El `.env` no se versiona: cada entorno tiene el suyo.

## Configuracion de Firebase (una sola vez por proyecto)

1. **Crear el proyecto** en la consola de Firebase y registrar una app web.
   Copiar los datos que da la consola al `.env`.

2. **Crear la base de Firestore** (modo produccion).

3. **Activar Authentication** con dos proveedores:
   - *Anonimo*: lo usa el comensal. No ve ningun acceso, pero sin esto las
     reglas rechazan todas las lecturas.
   - *Google*: lo usa el personal y el registro de locales. **No hay
     contrasenas en ningun lado**: nadie las olvida y nosotros no las
     guardamos.

4. **Publicar las reglas**: `firebase deploy --only firestore:rules`

5. **Dar de alta al admin de la plataforma.** Es el unico paso que se hace a
   mano, y a proposito: si `superadmins` fuera escribible desde la app,
   cualquiera podria darse acceso a todos los negocios.

   La cuenta del SaaS es **hexagroup21@gmail.com** (la misma que es dueña del
   proyecto de Firebase). No se registra por `/registro`: el superadmin no es
   dueño de ningun bar, y pasar por el registro le crearia uno al pedo.

   - Entrar una vez a `/login` con Google usando esa cuenta. Va a decir que no
     pertenece a ningun local: es lo esperado, lo unico que queremos es que
     Firebase cree el usuario.
     **No usar "Add user" en la consola**: eso crea una cuenta de
     email/contrasena y despues el acceso con Google choca contra ella con
     `auth/account-exists-with-different-credential`.
   - Copiar su UID de **Authentication > Users** y crear en Firestore el
     documento:

     ```
     superadmins/{uid}  ->  { email: "hexagroup21@gmail.com" }
     ```

   Con eso `/admin` deja entrar y muestra todos los locales. Una cuenta sin
   local pero con este documento va derecho al panel al entrar por `/login`.

## Alta de un cliente nuevo

No requiere que nadie de Hexa Group toque la consola:

1. El bar entra a `/registro`, elige nombre e identificador, y crea su cuenta.
2. Queda como **encargado** de su local, que nace en estado `prueba`.
3. Desde **Ajustes > Tu equipo** invita a su cocina y sus mozos anotando el
   email de Google de cada uno. La primera vez que esa persona entra, la app
   encuentra la invitacion y le crea la ficha con su rol.
4. Desde `/admin` pasas el local de `prueba` a `activo` cuando corresponda.

Para cargar una carta de ejemplo en un local:

```bash
node --env-file=.env seed.js mi-bar
```

## Deploy

```bash
npm run build
firebase deploy
```

El proyecto por defecto esta en `.firebaserc`. Si el ID del proyecto es
distinto, `firebase use --add` y elegirlo.

`firebase deploy` publica el hosting y las reglas de Firestore juntos.

## Seguridad

- Nadie entra a Firestore sin sesion. El comensal la obtiene de forma anonima
  y automatica; el personal, con su cuenta de Google.
- Los roles viven en `locales/{localId}/empleados/{uid}`. El encargado los
  administra desde la app, pero solo dentro de su local, y no puede cambiarse
  el rol a si mismo ni desactivarse: el local nunca queda sin administrador.
- `superadmins` no se puede escribir desde la app. Solo desde la consola.
- El email de las invitaciones lo firma Google, no lo elige el cliente: por eso
  las reglas pueden confiar en `request.auth.token.email` para decidir quien
  canjea que invitacion.
- Suspender un local lo congela para todos —comensales y personal— excepto para
  la plataforma, que es quien tiene que poder reactivarlo.
- El historial y la caja son solo para el personal del local. La carta y la
  configuracion solo las edita su encargado.
- No hay contrasenas: ni en Firestore, ni en el codigo, ni circulando por
  WhatsApp entre el encargado y sus empleados.

Limitacion conocida: con sesion anonima, alguien puede escribir en cualquier
mesa **del local que este mirando**, y tambien en las de otro local activo si
arma la peticion a mano. Es el precio de que el comensal no se registre. Si hace
falta cerrarlo, el paso siguiente es firmar local y numero de mesa en el QR.

## Estructura

```
src/
  components/PuertaDeAcceso.jsx   control de acceso por rol dentro de un local
  components/EquipoDelLocal.jsx   invitaciones y bajas del personal
  components/BotonGoogle.jsx      el unico acceso: entrar con Google
  firebase/rutas.js               TODAS las rutas de Firestore, por local
  firebase/auth.js                sesion anonima, acceso con Google y roles por local
  firebase/locales.js             registro de negocios, invitaciones y equipo
  firebase/config.js              conexion (lee del .env)
  firebase/configuracion.js       configuracion editable de cada local
  firebase/mesa.js                mesas, carrito, pedidos, chat y cuenta
  pages/                          una vista por rol, mas registro y admin
  utils/LocalContext.jsx          el local actual, sacado de la URL
  utils/useSesion.jsx             sesion, acceso por local y pertenencia
  utils/AccesoContext.jsx         con que rol entro la persona (y si es soporte)
```

## Productos hermanos

Conviven dos apps mas simples en carpetas vecinas: **Control Comanda**
(mozos -> encargado) y **Control Bar** (mozos + cocina). No mezclar los
proyectos de Firebase entre ellas. Ver `../MAPA DE PROYECTOS.md`.

## Pendientes

- Facturacion y planes: hoy `plan` y `estado` son campos que se cambian a mano
  desde `/admin`. No hay cobro conectado.
- El encargado todavia no puede editar el nombre ni el logo de su local desde
  Ajustes (los datos existen en la base, falta el formulario).
- `eslint.config.js` existe pero eslint no esta en las dependencias.
- El bundle pasa los 700 kB: conviene separar en chunks.
