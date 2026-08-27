// ============================================================
//  EL RECORRIDO DEL CLIENTE, DE PUNTA A PUNTA
//
//  Escanear el QR, sentarse, pedir y que eso llegue a la base con el
//  precio correcto. Es el camino que usa toda la gente que entra al bar,
//  y hasta ahora no lo verificaba nada de forma automatica.
// ============================================================
import { test, expect } from '@playwright/test'
import { limpiarBase, limpiarCuentas, sembrarLocal, listar, leer, LOCAL } from './emulador.js'

test.beforeEach(async () => {
  await limpiarBase()
  await limpiarCuentas()
  await sembrarLocal()
})

// Sentarse en la mesa: nombre y cantidad de personas.
const sentarse = async (page, { mesa = '1', nombre = 'Ana' } = {}) => {
  await page.goto(`/l/${LOCAL}/mesa/${mesa}`)
  await page.getByRole('button', { name: /Empezar|Comenzar|Entrar/i }).first().click()
  await page.getByRole('textbox').first().fill(nombre)
  await page.getByRole('button', { name: /Continuar|Listo|Entrar/i }).first().click()
}

test('el comensal ve la promocion del dia en la carta', async ({ page }) => {
  await sentarse(page)
  await expect(page.getByText('Menu del dia')).toBeVisible()
})

test('pide, y el precio que queda guardado es el de la carta', async ({ page }) => {
  await sentarse(page)

  // Agregar el menu del dia al carrito y confirmar.
  await page.getByRole('button', { name: 'Agregar Menu del dia' }).click()
  await page.getByRole('button', { name: /Confirmar pedido/i }).click()

  await expect.poll(async () => {
    const pedidos = await listar(`locales/${LOCAL}/mesas/mesa_1/pedidos`)
    return pedidos.length
  }, { timeout: 20_000 }).toBe(1)

  const [pedido] = await listar(`locales/${LOCAL}/mesas/mesa_1/pedidos`)
  // El precio lo pone el servidor leyendo la carta, nunca el navegador.
  expect(pedido.total).toBe(5000)

  const mesa = await leer(`locales/${LOCAL}/mesas/mesa_1`)
  expect(mesa.total_acumulado).toBe(5000)
  // Y el carrito quedo consumido: no se puede confirmar dos veces.
  expect(mesa.carrito_bloqueado).toBe(true)
})

test('la mesa de al lado no se toca', async ({ page }) => {
  // La capacidad que reparte el backend vale para UNA mesa. Es la
  // frontera de AUD-001 vista desde la aplicacion.
  await sentarse(page, { mesa: '1' })
  await page.goto(`/l/${LOCAL}/mesa/2`)
  await expect(page.getByRole('button', { name: /Empezar|Comenzar|Entrar/i }).first())
    .toBeVisible()
  // La mesa 1 sigue ocupada por su cuenta, sin arrastrar datos.
  const mesa2 = await leer(`locales/${LOCAL}/mesas/mesa_2`)
  expect(mesa2?.total_acumulado ?? 0).toBe(0)
})
