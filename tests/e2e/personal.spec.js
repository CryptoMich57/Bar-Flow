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
    { timeout: 40_000 }).toBe(1)

  const [pedido] = await listar(`locales/${LOCAL}/mesas/mesa_1/pedidos`)
  expect(pedido.total).toBe(5000)
})

test('el mozo toma el pedido de una mesa que nadie abrio', async ({ page }) => {
  // El caso real del bar: el mozo se acerca a la mesa 1, que esta libre
  // porque nadie escaneo el QR, y carga el pedido. Antes daba 400 Bad
  // Request —"esa mesa esta libre"— y no habia forma de vender sin que el
  // cliente usara el telefono.
  await entrarComo(page, {
    email: 'mario@bar.com', nombre: 'Mario', rol: 'mozo', ruta: 'mozo',
  })

  await page.getByRole('button', { name: /Tomar pedido/i }).first().click()
  await page.getByRole('button', { name: 'Mesa 1', exact: true }).click()
  await page.getByRole('button', { name: 'Agregar Menu del dia' }).click()
  await page.getByRole('button', { name: /Enviar pedido/i }).click()

  await expect.poll(async () =>
    (await listar(`locales/${LOCAL}/mesas/mesa_1/pedidos`)).length,
    { timeout: 40_000 }).toBe(1)

  const mesa = await leer(`locales/${LOCAL}/mesas/mesa_1`)
  expect(mesa.estado).toBe('esperando_preparacion')
  expect(mesa.total_acumulado).toBe(5000)
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
    { timeout: 40_000 }).toBe(1)

  const [cierre] = await listar(`locales/${LOCAL}/historial`)
  expect(cierre.total_cobrado).toBe(5000)
  expect((await leer(`locales/${LOCAL}/mesas/mesa_1`)).estado).toBe('libre')
})

test('el circuito completo sin QR: el mozo carga, cobra, y la venta queda en la caja', async ({ page, browser }) => {
  // El agujero que llego del bar. El mozo podia cargar el pedido pero la
  // mesa no tenia salida hacia el cobro: la unica era "Cerrar mesa", que
  // libera SIN registrar la venta. Se cobraba en efectivo y la plata
  // desaparecia del historial y de las estadisticas, en silencio.
  await entrarComo(page, {
    email: 'mario@bar.com', nombre: 'Mario', rol: 'mozo', ruta: 'mozo',
  })

  // 1. El mozo carga el pedido en una mesa que nadie abrio.
  await page.getByRole('button', { name: /Tomar pedido/i }).first().click()
  await page.getByRole('button', { name: 'Mesa 1', exact: true }).click()
  await page.getByRole('button', { name: 'Agregar Menu del dia' }).click()
  await page.getByRole('button', { name: /Enviar pedido/i }).click()

  // Esperar a que el envio termine antes de cambiar de pestaña: al
  // confirmar, la vista salta sola a "Alertas", y ese salto pisaba el
  // cambio de pestaña si se hacia en el medio.
  await expect.poll(async () =>
    (await listar(`locales/${LOCAL}/mesas/mesa_1/pedidos`)).length,
    { timeout: 40_000 }).toBe(1)

  // 2. "Mis mesas" tiene que mostrarla, con su total y quien la abrio.
  //    Antes esta seccion decia "Sin pedidos" apenas se entregaba todo.
  await page.getByRole('button', { name: /Mis mesas/i }).click()
  // El separador de miles depende del idioma del navegador: el runner da
  // "5,000" y un telefono argentino "5.000". La prueba no puede casarse
  // con uno de los dos.
  await expect(page.getByText(/5[.,]000/).first()).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText(/Cargada por/i)).toBeVisible()

  // 3. El mozo cobra: elige el metodo y la mesa pasa a pedir la cuenta.
  await page.getByRole('button', { name: /Cobrar/i }).first().click()
  await page.getByRole('button', { name: /Efectivo/i }).click()

  await expect.poll(async () =>
    (await leer(`locales/${LOCAL}/mesas/mesa_1`))?.estado,
    { timeout: 20_000 }).toBe('esperando_cuenta')
  expect((await leer(`locales/${LOCAL}/mesas/mesa_1`)).metodo_pago).toBe('efectivo')

  // 4. El encargado la cierra, y RECIEN AHI se escribe la caja.
  //    Contexto aparte y no otra pestaña: la sesion de Firebase se comparte
  //    entre pestañas del mismo navegador, asi que el encargado heredaba la
  //    cuenta del mozo. Son dos dispositivos distintos en el bar tambien.
  const dispositivoEncargado = await browser.newContext()
  const paginaEncargado = await dispositivoEncargado.newPage()
  await entrarComo(paginaEncargado, {
    email: 'ana@bar.com', nombre: 'Ana', rol: 'encargado', ruta: 'encargado',
  })
  paginaEncargado.on('dialog', d => d.accept())
  await expect(tarjetaDeMesa(paginaEncargado, 1)).toContainText(/Pide cuenta/i)
  await tarjetaDeMesa(paginaEncargado, 1).click()
  await paginaEncargado.getByRole('button', { name: /Confirmar pago y liberar/i }).click()

  await expect.poll(async () => (await listar(`locales/${LOCAL}/historial`)).length,
    { timeout: 40_000 }).toBe(1)

  const [cierre] = await listar(`locales/${LOCAL}/historial`)
  expect(cierre.total_cobrado).toBe(5000)
  expect(cierre.metodo_pago).toBe('efectivo')
  expect((await leer(`locales/${LOCAL}/mesas/mesa_1`)).estado).toBe('libre')

  await dispositivoEncargado.close()
})

test('el encargado puede cobrar una mesa que cargo el mozo', async ({ page }) => {
  // El mismo circuito pero sin el mozo a mano: el cliente se acerco a la
  // barra a pagar.
  await escribir(`locales/${LOCAL}/mesas/mesa_2`, {
    estado: 'esperando_preparacion', personas: 0, clientes: [], carrito: [],
    carrito_bloqueado: false, total_acumulado: 3000, propina: 0,
    metodo_pago: null, abona_con: null,
  })
  await entrarComo(page, {
    email: 'ana@bar.com', nombre: 'Ana', rol: 'encargado', ruta: 'encargado',
  })

  page.on('dialog', d => d.accept())
  await tarjetaDeMesa(page, 2).click()
  await page.getByRole('button', { name: /Cobrar/ }).click()
  await page.getByRole('button', { name: /Tarjeta/i }).click()
  await page.getByRole('button', { name: /Confirmar pago y liberar/i }).click()

  await expect.poll(async () => (await listar(`locales/${LOCAL}/historial`)).length,
    { timeout: 40_000 }).toBe(1)
  const [cierre] = await listar(`locales/${LOCAL}/historial`)
  expect(cierre.total_cobrado).toBe(3000)
  expect(cierre.metodo_pago).toBe('tarjeta')
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
