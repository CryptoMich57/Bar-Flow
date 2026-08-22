# BarFlow

App de pedidos por QR para bares y cafeterias, de Hexa Systems.
El comensal escanea el QR de su mesa, pide desde el celular, sigue el estado
de su pedido en tiempo real y pide la cuenta, sin esperar a que pase el mozo.

Nacio como "Qallariy Coffee" y se esta generalizando como producto.

## Stack

- React 18 + Vite (JavaScript, sin TypeScript)
- Firebase: Firestore (tiempo real), Authentication y Hosting
- PWA instalable (vite-plugin-pwa)

## Vistas

| Ruta            | Quien entra | Que hace |
|-----------------|-------------|----------|
| `/mesa/:numero` | El comensal | Carta, carrito, estado del pedido, chat y cuenta |
| `/encargado`    | Encargado   | Salon en vivo, barra, carta, estadisticas, historial y ajustes |
| `/cocina`       | Cocina      | Tablero de comandas por estado |
| `/mozo`         | Mozo        | Alertas, sus mesas y toma de pedidos |
| `/login`        | Personal    | Hub con acceso a las tres vistas internas |

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

2. **Activar Authentication** con dos proveedores:
   - *Anonimo*: lo usa el comensal. No ve ningun login, pero sin esto las
     reglas rechazan todas las lecturas.
   - *Email y contrasena*: lo usa el personal.

3. **Crear las cuentas del personal** en Authentication > Users. Por ejemplo:
   `encargado@tubar.com`, `cocina@tubar.com`, `mozo@tubar.com`.

4. **Asignar el rol de cada cuenta.** Copiar el UID de cada usuario y crear en
   Firestore un documento en la coleccion `usuarios` con ese UID como ID:

   ```
   usuarios/{uid}  ->  { rol: "encargado" }   // o "cocina" o "mozo"
   ```

   Sin este documento la cuenta entra a Firebase pero la app no la deja pasar.
   El rol `encargado` abre las tres vistas internas.

5. **Publicar las reglas**: `firebase deploy --only firestore:rules`

6. **Cargar la carta inicial** (opcional): `node --env-file=.env seed.js`

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
  y automatica; el personal, con cuenta y contrasena reales.
- Los roles viven en `usuarios/{uid}` y **no se pueden escribir desde la app**:
  se administran desde la consola de Firebase.
- El historial y la caja son solo para el personal. La carta y la configuracion
  solo las edita el encargado.
- Las contrasenas ya no viven en Firestore ni en el codigo.

Limitacion conocida: una vez con sesion anonima, un usuario puede escribir en
cualquier mesa. Es el precio de que el comensal no tenga que registrarse. Si
hace falta cerrar eso, el paso siguiente es firmar el numero de mesa en el QR.

## Estructura

```
src/
  components/PuertaDeAcceso.jsx   control de acceso por rol de las vistas internas
  firebase/auth.js                sesiones anonimas, login del personal y roles
  firebase/config.js              conexion (lee del .env)
  firebase/configuracion.js       configuracion editable del local
  firebase/mesa.js                mesas, carrito, pedidos, chat y cuenta
  pages/                          una vista por rol
  utils/                          sonidos, notificaciones y sesion
```

## Productos hermanos

Conviven dos apps mas simples en carpetas vecinas: **Control Comanda**
(mozos -> encargado) y **Control Bar** (mozos + cocina). No mezclar los
proyectos de Firebase entre ellas. Ver `../MAPA DE PROYECTOS.md`.

## Pendientes

- Renombrar la marca visible "Qallary Coffe" -> "BarFlow" en `src/config.js`,
  `index.html` y `vite.config.js`.
- `eslint.config.js` existe pero eslint no esta en las dependencias.
- El bundle pasa los 700 kB: conviene separar en chunks.
