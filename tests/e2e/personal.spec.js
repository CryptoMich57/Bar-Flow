// ============================================================
//  EL RECORRIDO DEL PERSONAL, CON SESION DE GOOGLE
//
//  Estas son las que exigian "validacion manual" cada vez que se tocaba
//  algo: entrar como mozo, invitar personal, dar soporte. El emulador de
//  Auth permite entrar por el mismo camino que usa una persona —el popup
//  de Google— asi que dejan de depender de que alguien se acuerde.
//
//  El primer caso es el bug que llego al bar: el mozo veia la carta y no
//  podia tomar el pedido porque su lista de categorias no incluia
//  'promocion', que es donde el local habia cargado el menu del dia.
// ============================================================
import { test, expect } from '@playwright/test'
import {
  limpiarBase, limpiarCuentas, sembrarLocal, sembrarEmpleado,
  entrarConGoogle, uidDe, escribir, actualizar, listar, leer, LOCAL,
} from './emulador.js'

test.beforeEach(async () => {
  await limpiarBase()
  await limpiarCuentas()
  await sembrarLocal()
})

/**
 * Entra con Google y deja a la persona con su ficha en el local.
 *
 * El uid lo decide el emulador al crear la cuenta, asi que la ficha se
 * siembra despues de entrar y se recarga: es el mismo orden que en la
 * vida real, donde primero existe la cuenta y despues alguien la suma
 * al equipo.
 */
const entrarComo = async (page, { email, nombre, rol, ruta }) => {
  await page.goto(`/l/${LOCAL}/${ruta}`)
  await entrarConGoogle(page, { email, nombre })

  const uid = await uidDe(email)
  expect(uid, 'el emulador de Auth no creo la cuenta').toBeTruthy()
  await sembrarEmpleado(uid, { nombre, email, rol })
  if (rol === 'encargado') await actualizar(`locales/${LOCAL}`, { owner_uid: uid })

  await page.reload()
  return uid
}

test('el mozo puede tomar un pedido de la promocion del dia', async ({ page }) => {
  // La mesa ya esta ocupada cuando el mozo abre su vista.
  await escribir(`locales/${LOCAL}/mesas/mesa_1`, {
    estado: 'ocupada', personas: 2, clientes: ['Ana'], carrito: [],
    carrito_bloqueado: false, total_acumulado: 0, propina: 0, metodo_pago: null,
  })
  await entrarComo(page, {
    email: 'mario@bar.com', nombre: 'Mario', rol: 'mozo', ruta: 'mozo',
  })

  await page.getByRole('button', { name: /Tomar pedido/i }).first().click()
  await page.getByRole('button', { name: 'Mesa 1', exact: true }).click()

  // Esto es lo que fallaba: la categoria existe y el producto se alcanza.
  await expect(page.getByRole('button', { name: /Promo del d/i })).toBeVisible()
  await page.getByRole('button', { name: 'Agregar Menu del dia' }).click()

  await page.getByRole('button', { name: /Enviar pedido/i }).click()

  await expect.poll(async () =>
    (await listar(`locales/${LOCAL}/mesas/mesa_1/pedidos`)).length,
    { timeout: 20_000 }).toBe(1)

  const [pedido] = await listar(`locales/${LOCAL}/mesas/mesa_1/pedidos`)
  expect(pedido.total).toBe(5000)
})

test('el mozo ve su propio nombre y no elige quien es', async ({ page }) => {
  // Antes habia un selector de mozos: cualquiera podia operar y quedar
  // registrado como otro (AUD-008). Ahora el nombre sale de su ficha.
  await entrarComo(page, {
    email: 'mario@bar.com', nombre: 'Mario', rol: 'mozo', ruta: 'mozo',
  })
  await expect(page.getByText('Mario').first()).toBeVisible()
  await expect(page.getByRole('combobox')).toHaveCount(0)
})

// La tarjeta de una mesa en el salon del encargado. Por nombre no sirve:
// el nombre accesible arrastra el estado y el total, y ademas "Mesa 1"
// tambien es prefijo de "Mesa 10".
const tarjetaDeMesa = (page, num) =>
  page.locator('button').filter({ has: page.getByText(`Mesa ${num}`, { exact: true }) })

test('el encargado cierra la mesa y el cobro queda una sola vez en la caja', async ({ page }) => {
  await escribir(`locales/${LOCAL}/mesas/mesa_1`, {
    estado: 'esperando_cuenta', personas: 2, clientes: ['Cliente'], carrito: [],
    carrito_bloqueado: true, total_acumulado: 5000, propina: 500,
    metodo_pago: 'efectivo', abona_con: null,
  })
  await entrarComo(page, {
    email: 'ana@bar.com', nombre: 'Ana', rol: 'encargado', ruta: 'encargado',
  })

  page.on('dialog', d => d.accept())
  // Esperar a que el salon refleje el estado real y no el inicial.
  await expect(tarjetaDeMesa(page, 1)).toContainText(/Pide cuenta/i)
  await tarjetaDeMesa(page, 1).click()
  await page.getByRole('button', { name: /Confirmar pago y liberar/i }).click()

  await expect.poll(async () => (await listar(`locales/${LOCAL}/historial`)).length,
    { timeout: 20_000 }).toBe(1)

  const [cierre] = await listar(`locales/${LOCAL}/historial`)
  expect(cierre.total_cobrado).toBe(5000)
  expect((await leer(`locales/${LOCAL}/mesas/mesa_1`)).estado).toBe('libre')
})

test('quien no trabaja en el local no entra', async ({ page }) => {
  // Entra con Google pero sin ficha: no alcanza con tener cuenta.
  await page.goto(`/l/${LOCAL}/encargado`)
  await entrarConGoogle(page, { email: 'ajeno@otro.com', nombre: 'Ajeno' })
  await expect(page.getByText(/no perten|no estas asociad|no tenes acceso/i).first())
    .toBeVisible({ timeout: 20_000 })
})

test('todas las pestañas del encargado montan', async ({ page }) => {
  // Red para poder partir EncargadoPage sin romper nada: 1071 lineas y
  // seis pestañas que ninguna prueba tocaba. Un error al renderizar
  // cualquiera de ellas deja esa mitad de la pantalla en blanco.
  const errores = []
  page.on('pageerror', (e) => errores.push(e.message))

  await escribir(`locales/${LOCAL}/mesas/mesa_1`, {
    estado: 'esperando_cuenta', personas: 2, clientes: ['Cliente'], carrito: [],
    carrito_bloqueado: true, total_acumulado: 5000, propina: 500,
    metodo_pago: 'efectivo', abona_con: null,
  })
  await entrarComo(page, {
    email: 'ana@bar.com', nombre: 'Ana', rol: 'encargado', ruta: 'encargado',
  })

  const pestañas = [
    ['🏠 Mesas',        /Salón en tiempo real/i],
    ['☕ Barra',        /Barra|Cafeter/i],
    ['📋 Carta',        /Menu del dia/i],
    ['📊 Estadísticas', /Efectivo|Caja|Total/i],
    ['🕐 Historial',    /Historial|Desde|cierres/i],
    ['⚙️ Ajustes',      /Titular de la cuenta/i],
  ]

  for (const [boton, contenido] of pestañas) {
    await page.getByRole('button', { name: boton }).click()
    await expect(page.locator('main'), `la pestaña ${boton} no mostro su contenido`)
      .toContainText(contenido)
    expect(errores, `la pestaña ${boton} tiro un error al montar`).toEqual([])
  }
})
