// ============================================================
//  PRUEBAS DE RECORRIDO  (AUD-014)
//
//  Corren con:  npm run test:e2e
//
//  Las otras dos suites prueban la frontera de Firestore y la logica del
//  backend. Ninguna abre la app. Por eso el bug que dejo al mozo sin poder
//  vender una categoria entera llego al bar: compilaba, pasaba el lint y
//  pasaba las reglas.
//
//  Estas prueban lo que solo se ve usando la aplicacion, contra los
//  emuladores y nunca contra el proyecto real: el .env.e2e apunta a
//  barflow-pruebas.
// ============================================================
import { defineConfig, devices } from '@playwright/test'

const BASE = 'http://127.0.0.1:5173'

export default defineConfig({
  testDir: './tests/e2e',
  // El emulador de Functions arranca en frio con la primera llamada.
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  // En serie: todas comparten la misma base del emulador y se limpian
  // entre casos. En paralelo se borrarian los datos entre ellas.
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],

  use: {
    baseURL: BASE,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],

  webServer: {
    command: 'npm run dev:e2e',
    url: BASE,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
