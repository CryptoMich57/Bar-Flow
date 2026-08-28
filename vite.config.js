import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // 'prompt' y no 'autoUpdate': con autoUpdate el service worker se
      // activa cuando quiere y la pestaña abierta puede seguir horas con
      // el codigo viejo sin que nadie lo note. Con 'prompt' la version
      // nueva espera y la aplicamos nosotros —ver src/utils/actualizacion.js—,
      // avisando en pantalla en vez de recargar encima de alguien que
      // esta cobrando.
      registerType: 'prompt',
      // El registro lo hace main.jsx, no un script inyectado: hace falta
      // engancharle el aviso de version nueva.
      injectRegister: null,
      includeAssets: ['logo.png', 'apple-touch-icon.png', 'favicon.ico'],
      manifest: {
        name:             'BarFlow',
        short_name:       'BarFlow',
        description:      'Pedidos y atención digital para tu mesa',
        theme_color:      '#0a0a0a',
        background_color: '#0a0a0a',
        display:          'standalone',
        orientation:      'portrait',
        start_url:        '/',
        scope:            '/',
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
        // El comensal entra una vez y se va. Guardarle en el telefono las
        // vistas del personal —que nunca va a abrir— es bajarle datos de
        // mas por nada. El personal las descarga la primera vez que entra
        // a la suya y ahi quedan en cache normal del navegador.
        globIgnores: [
          '**/{EncargadoPage,MozoPage,CocinaPage,AdminPage,RegistroPage}-*.js',
        ],
      }
    })
  ],

  build: {
    rollupOptions: {
      output: {
        // Las librerias van aparte del codigo de la app. Sin esto, tocar
        // una linea de una pantalla invalida el cache de los 700 kB de
        // Firebase y React, y todo el mundo se los vuelve a bajar en cada
        // despliegue.
        manualChunks: (id) => {
          if (!id.includes('node_modules')) return
          // Firebase va entero en un chunk. Separar firestore, auth y app
          // deja mejor la medicion —firestore solo son 473 kB de los 698—
          // pero los tres se referencian entre si y rollup avisa de chunks
          // circulares, que es una forma conocida de romper el orden de
          // inicializacion en produccion. No vale el riesgo por la foto.
          if (id.includes('/firebase/') || id.includes('/@firebase/')) return 'firebase'
          if (id.includes('/react-router')) return 'router'
          if (id.includes('/react-dom/') || id.includes('/react/')) return 'react'
        },
      },
    },
  },
})
