# BarFlow

SaaS de pedidos por QR para bares y cafeterías de Hexa Systems (hexagroup.com.ar).
El cliente escanea/abre la app en su mesa, pide desde su celular y sigue el estado
de su comida. Nació como "Qallariy Coffee". Hoy es **multi-local**: un proyecto de
Firebase atiende a todos los negocios.

## Stack

- React + Vite (JavaScript, no TypeScript)
- Firebase: proyecto `barflow-hexagroup` (Firestore + Auth + Hosting)
- PWA instalable (vite-plugin-pwa)

## Regla de oro: el localId

Todo dato de un negocio vive bajo `locales/{localId}`. El `localId` sale de la
URL (`/l/:localId/...`) vía `useLocal()`, nunca de una variable global ni de la
sesión.

**Nunca escribas una ruta de Firestore a mano.** Todas salen de
`src/firebase/rutas.js`. Si necesitás una nueva, agregala ahí.

El rol de una persona vive en `locales/{localId}/empleados/{uid}`, no en la
cuenta. Las reglas lo leen del path que se está tocando, así que un usuario del
bar A no tiene forma de alcanzar los datos del bar B.

## Estructura

- `src/pages/MesaPage.jsx` — vista del cliente en la mesa (pedir, ver estado)
- `src/pages/MozoPage.jsx` — vista del mozo
- `src/pages/CocinaPage.jsx` — vista de cocina
- `src/pages/EncargadoPage.jsx` — vista del encargado (incluye Ajustes y equipo)
- `src/pages/LoginPage.jsx` — acceso del personal, resuelve a qué local va
- `src/pages/RegistroPage.jsx` — alta de un negocio nuevo, self-service
- `src/pages/AdminPage.jsx` — panel de la plataforma (solo Hexa Group)
- `src/components/PuertaDeAcceso.jsx` — control de acceso por rol dentro del local
- `src/components/EquipoDelLocal.jsx` — el encargado da de alta a su personal
- `src/firebase/rutas.js` — todas las rutas de Firestore
- `src/firebase/locales.js` — registro de negocios y administración del equipo
- `src/utils/LocalContext.jsx` — el local actual, sacado de la URL

## Comandos

- `npm install` — instalar dependencias (la carpeta se guarda sin node_modules)
- `npm run dev` — desarrollo local
- `npm run build` — build de producción
- `node --env-file=.env seed.js <localId>` — carta de ejemplo en un local
- `firebase deploy` — publicar hosting y reglas

## Detalles que muerden

- **No hay contraseñas.** El personal entra con Google (`signInWithPopup`). No
  agregues email/contraseña "por las dudas": fue una decisión explícita del
  producto, porque la gente del bar olvida las contraseñas.
- Como no se le puede crear una cuenta de Google a otra persona, el equipo se
  suma por **invitación**: el encargado escribe `invitaciones/{email}` (una en
  el local y un puntero global), y la ficha de empleado la crea la propia
  persona al entrar, con el rol que dice la invitación. Las reglas comparan
  contra `request.auth.token.email`, que lo firma Google.
- `quitarEmpleado()` borra su ficha, que es lo que corta el acceso. La cuenta de
  Google no es nuestra y no se toca.
- `superadmins` es `allow write: if false`. Se crea solo desde la consola.

## Contexto de productos

BarFlow es la app grande. Conviven con ella dos apps hermanas más simples (en carpetas vecinas): **Control Comanda** (solo mozos → encargado, servidor `control-comanda`) y **Control Bar** (mozos + cocina, servidor `control-bar-mt-9d044`). No mezclar servidores de Firebase entre proyectos. Ver `../MAPA DE PROYECTOS.md`.

## Pendientes conocidos

- No hay cobro conectado: `plan` y `estado` se cambian a mano desde `/admin`.
- Falta el formulario para que el encargado edite nombre y logo de su local.
