// ============================================================
//  QUE CADA PANTALLA MONTE
//
//  Es la prueba mas barata de la suite y la que mas veces habria
//  servido. Un error de zona muerta temporal —una variable usada en el
//  array de dependencias de un efecto antes de su const— deja la pantalla
//  EN BLANCO, y no lo ve ni el build, ni el lint, ni las reglas. Ya pasó
//  una vez con MozoPage.
// ============================================================
import { test, expect } from '@playwright/test'
import { limpiarBase, limpiarCuentas, sembrarLocal, LOCAL } from './emulador.js'

test.beforeEach(async () => {
  await limpiarBase()
  await limpiarCuentas()
  await sembrarLocal()
})

// Cualquier excepcion de React al montar deja rastro en la consola.
const sinErroresDeRender = (page) => {
  const errores = []
  page.on('pageerror', (e) => errores.push(e.message))
  return errores
}

test('la pantalla de acceso monta y ofrece entrar con Google', async ({ page }) => {
  const errores = sinErroresDeRender(page)
  await page.goto('/login')
  await expect(page.getByRole('button', { name: /Google/i })).toBeVisible()
  expect(errores).toEqual([])
})

test('la pantalla de registro monta', async ({ page }) => {
  const errores = sinErroresDeRender(page)
  await page.goto('/registro')
  await expect(page.getByRole('button', { name: /Google/i })).toBeVisible()
  expect(errores).toEqual([])
})

test('las vistas del personal montan y piden identificarse', async ({ page }) => {
  // Sin sesion no muestran datos, pero tienen que MONTAR: si la pantalla
  // queda en blanco no hay diferencia visible entre "falta entrar" y
  // "la vista se rompio".
  for (const ruta of ['encargado', 'mozo', 'cocina']) {
    const errores = sinErroresDeRender(page)
    await page.goto(`/l/${LOCAL}/${ruta}`)
    await expect(page.getByRole('button', { name: /Google/i }).first()).toBeVisible()
    expect(errores, `la vista de ${ruta} tiro un error al montar`).toEqual([])
  }
})

test('un QR de un local que no existe lo dice, no falla', async ({ page }) => {
  const errores = sinErroresDeRender(page)
  await page.goto('/l/bar-que-no-existe/mesa/1')
  await expect(page.getByText(/no corresponde a ningun local/i)).toBeVisible()
  expect(errores).toEqual([])
})

test('un local suspendido no atiende, y lo explica', async ({ page }) => {
  const { actualizar } = await import('./emulador.js')
  await actualizar(`locales/${LOCAL}`, { estado: 'suspendido' })
  await page.goto(`/l/${LOCAL}/mesa/1`)
  await expect(page.getByText(/no esta recibiendo pedidos/i)).toBeVisible()
})
