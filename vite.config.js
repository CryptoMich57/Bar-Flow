import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo.png', 'apple-touch-icon.png', 'favicon.ico'],
      manifest: {
        name:             'Qallary Coffe',
        short_name:       'Qallary',
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
      }
    })
  ]
})
