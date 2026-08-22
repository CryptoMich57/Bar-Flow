# BarFlow

App de pedidos para bares y cafeterías de Hexa Systems (hexagroup.com.ar). El cliente escanea/abre la app en su mesa, pide desde su celular y sigue el estado de su comida. Nació como "Qallariy Coffee".

## Stack

- React + Vite (JavaScript, no TypeScript)
- Firebase: proyecto `qallariy-coffee` (Firestore + Hosting)
- PWA instalable (vite-plugin-pwa)

## Estructura

- `src/pages/MesaPage.jsx` — vista del cliente en la mesa (pedir, ver estado)
- `src/pages/MozoPage.jsx` — vista del mozo
- `src/pages/CocinaPage.jsx` — vista de cocina
- `src/pages/EncargadoPage.jsx` — vista del encargado
- `src/pages/LoginPage.jsx` — acceso por roles
- `src/firebase/` — config, mesas y seed de datos
- `src/utils/` — sonidos y notificaciones

## Comandos

- `npm install` — instalar dependencias (la carpeta se guarda sin node_modules)
- `npm run dev` — desarrollo local
- `npm run build` — build de producción
- `firebase deploy` — publicar en Hosting

## Contexto de productos

BarFlow es la app grande. Conviven con ella dos apps hermanas más simples (en carpetas vecinas): **Control Comanda** (solo mozos → encargado, servidor `control-comanda`) y **Control Bar** (mozos + cocina, servidor `control-bar-mt-9d044`). No mezclar servidores de Firebase entre proyectos. Ver `../MAPA DE PROYECTOS.md`.

## Pendientes conocidos

- Renombrar la marca visible "Qallariy Coffee" → "BarFlow" dentro de la app.
- Revisar reglas de seguridad de Firestore antes de sumar clientes nuevos.
