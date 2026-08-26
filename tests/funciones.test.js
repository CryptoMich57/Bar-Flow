// ============================================================
//  PRUEBAS DE LAS CLOUD FUNCTIONS
//
//  Se corren contra los emuladores de Functions, Firestore y Auth:
//    npm run test:funciones
//
//  Las de reglas prueban la frontera de Firestore. Estas prueban lo
//  que las reglas ya no pueden mirar: que el precio lo ponga el
//  servidor y no el navegador, que cada puesto haga solo lo suyo, que
//  un reintento no cobre dos veces, y que dos personas sobre la misma
//  comanda no se pisen.
//
//  Se llama a las callables como las llama la app —por HTTP, con un
//  token— y no importando el handler: si la envoltura de onCall
//  cambiara, queremos enterarnos acá y no en el salón.
// ============================================================
import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest'

// El emulador de Functions arranca en frio con la primera llamada y eso
// se come varios segundos. No es lentitud del codigo probado.
const PACIENCIA = 30000

const PROYECTO = 'barflow-pruebas'
const FUNCIONES = 'http://127.0.0.1:5001'
const FIRESTORE = 'http://127.0.0.1:8080'
const REGION = 'southamerica-east1'

// ── Tokens ──────────────────────────────────────────────────
// El emulador de Auth acepta tokens sin firmar: alcanza con el payload.
// Es exactamente lo que hace @firebase/rules-unit-testing por dentro, y
// nos deja fabricar cada identidad sin levantar sesiones reales.
const token = (payload) => {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${b64({ alg: 'none', type: 'JWT' })}.${b64({
    iss: `https://securetoken.google.com/${PROYECTO}`,
    aud: PROYECTO,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    auth_time: Math.floor(Date.now() / 1000),
    user_id: payload.uid,
    sub: payload.uid,
    ...payload,
  })}.`
}

const EN_UNA_HORA = () => Date.now() + 60 * 60 * 1000

const comensalEn = (localId, mesa, uid = 'comensal-1') => token({
  uid,
  provider_id: 'anonymous',
  firebase: { sign_in_provider: 'anonymous', identities: {} },
  mesa: { l: localId, m: `mesa_${mesa}`, exp: EN_UNA_HORA() },
})

const empleado = (uid, email) => token({
  uid,
  email,
  email_verified: true,
  firebase: { sign_in_provider: 'google.com', identities: { email: [email] } },
})

// ── Llamar una callable como lo hace la app ─────────────────
const llamar = async (nombre, datos, jwt) => {
  const r = await fetch(`${FUNCIONES}/${PROYECTO}/${REGION}/${nombre}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
    },
    body: JSON.stringify({ data: datos }),
  })
  const cuerpo = await r.json()
  if (cuerpo.error) {
    const e = new Error(cuerpo.error.message)
    e.code = cuerpo.error.status
    throw e
  }
  return cuerpo.result
}

const debeFallar = async (promesa, codigoEsperado) => {
  let error = null
  try { await promesa } catch (e) { error = e }
  expect(error, 'se esperaba un rechazo y la llamada paso').not.toBeNull()
  if (codigoEsperado) expect(error.code).toBe(codigoEsperado)
  return error
}

// ── Sembrar datos sin pasar por reglas ──────────────────────
// El emulador acepta el token "owner" para saltear las reglas. Es lo
// que necesitamos para dejar el escenario armado: probar las reglas es
// tarea de la otra suite, aca lo que se prueba es la logica del backend.
const COMO_DUENO = { Authorization: 'Bearer owner' }

const escribir = async (ruta, datos) => {
  const campos = {}
  for (const [k, v] of Object.entries(datos)) campos[k] = aValorFirestore(v)
  const r = await fetch(
    `${FIRESTORE}/v1/projects/${PROYECTO}/databases/(default)/documents/${ruta}`,
    { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...COMO_DUENO }, body: JSON.stringify({ fields: campos }) }
  )
  if (!r.ok) throw new Error(`No se pudo sembrar ${ruta}: ${await r.text()}`)
}

const leer = async (ruta) => {
  const r = await fetch(`${FIRESTORE}/v1/projects/${PROYECTO}/databases/(default)/documents/${ruta}`, { headers: COMO_DUENO })
  if (!r.ok) return null
  return desdeFirestore((await r.json()).fields || {})
}

const listar = async (ruta) => {
  const r = await fetch(`${FIRESTORE}/v1/projects/${PROYECTO}/databases/(default)/documents/${ruta}`, { headers: COMO_DUENO })
  if (!r.ok) return []
  const cuerpo = await r.json()
  return (cuerpo.documents || []).map(d => ({
    id: d.name.split('/').pop(),
    ...desdeFirestore(d.fields || {}),
  }))
}

function aValorFirestore(v) {
  if (v === null || v === undefined) return { nullValue: null }
  if (typeof v === 'boolean') return { booleanValue: v }
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v }
  if (typeof v === 'string') return { stringValue: v }
  if (Array.isArray(v)) return { arrayValue: { values: v.map(aValorFirestore) } }
  const fields = {}
  for (const [k, x] of Object.entries(v)) fields[k] = aValorFirestore(x)
  return { mapValue: { fields } }
}

function desdeFirestore(fields) {
  const salida = {}
  for (const [k, v] of Object.entries(fields)) salida[k] = unValor(v)
  return salida
}

function unValor(v) {
  if ('nullValue' in v) return null
  if ('booleanValue' in v) return v.booleanValue
  if ('integerValue' in v) return Number(v.integerValue)
  if ('doubleValue' in v) return v.doubleValue
  if ('stringValue' in v) return v.stringValue
  if ('timestampValue' in v) return v.timestampValue
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(unValor)
  if ('mapValue' in v) return desdeFirestore(v.mapValue.fields || {})
  return null
}

const limpiar = async () => {
  await fetch(
    `${FIRESTORE}/emulator/v1/projects/${PROYECTO}/databases/(default)/documents`,
    { method: 'DELETE' }
  )
}

const L = 'bar-a'

beforeAll(async () => {
  const r = await fetch(`${FUNCIONES}/`).catch(() => null)
  if (!r) throw new Error('El emulador de Functions no responde. Corré: npm run test:funciones')
})

afterAll(limpiar)

beforeEach(async () => {
  await limpiar()

  await escribir(`locales/${L}`, {
    nombre: 'Bar A', owner_uid: 'ana', estado: 'activo', plan: 'prueba',
  })
  await escribir(`locales/${L}/sistema/configuracion`, { mesas: { cantidad: 10 } })

  await escribir(`locales/${L}/empleados/ana`,   { nombre: 'Ana',   email: 'ana@a.com',   rol: 'encargado', activo: true })
  await escribir(`locales/${L}/empleados/mario`, { nombre: 'Mario', email: 'mario@a.com', rol: 'mozo',      activo: true })
  await escribir(`locales/${L}/empleados/kari`,  { nombre: 'Kari',  email: 'kari@a.com',  rol: 'cocina',    activo: true })

  await escribir(`locales/${L}/carta/cafe`,    { nombre: 'Cafe',    precio: 900,  disponible: true, destino: 'encargado' })
  await escribir(`locales/${L}/carta/tostado`, { nombre: 'Tostado', precio: 1800, disponible: true, destino: 'cocina' })
  await escribir(`locales/${L}/carta/agua`,    { nombre: 'Agua',    precio: 700,  disponible: true, destino: 'mozo' })
  await escribir(`locales/${L}/carta/agotado`, { nombre: 'Agotado', precio: 500,  disponible: false, destino: 'cocina' })

  await escribir(`locales/${L}/mesas/mesa_1`, {
    estado: 'ocupada', personas: 2, carrito: [], carrito_bloqueado: false,
    total_acumulado: 0, propina: 0, metodo_pago: null,
  })
})

// ════════════════════════════════════════════════════════════
describe('AUD-002 — el precio lo pone el servidor', () => {
  it('ignora el precio que manda el cliente y usa el de la carta', async () => {
    // Es el ataque concreto: un cliente modificado mandando el cafe a $1.
    const r = await llamar('crearPedido', {
      localId: L, mesaId: '1', clave: 'clave-precio-1',
      items: [{ id: 'cafe', cantidad: 2, precio: 1, nombre: 'Cafe gratis' }],
    }, comensalEn(L, 1))

    expect(r.total).toBe(1800)   // 2 x 900, no 2 x 1

    const mesa = await leer(`locales/${L}/mesas/mesa_1`)
    expect(mesa.total_acumulado).toBe(1800)
  }, PACIENCIA)

  it('el destino tambien sale de la carta: no se puede saltear la cocina', async () => {
    const r = await llamar('crearPedido', {
      localId: L, mesaId: '1', clave: 'clave-destino-1',
      items: [{ id: 'tostado', cantidad: 1, destino: 'mozo' }],
    }, comensalEn(L, 1))

    const pedido = await leer(`locales/${L}/mesas/mesa_1/pedidos/${r.pedidoId}`)
    expect(pedido.items[0].destino).toBe('cocina')
  }, PACIENCIA)

  it('rechaza cantidades invalidas', async () => {
    const base = { localId: L, mesaId: '1' }
    await debeFallar(llamar('crearPedido', { ...base, clave: 'clave-c1x', items: [{ id: 'cafe', cantidad: 0 }] }, comensalEn(L, 1)), 'INVALID_ARGUMENT')
    await debeFallar(llamar('crearPedido', { ...base, clave: 'clave-c2x', items: [{ id: 'cafe', cantidad: -3 }] }, comensalEn(L, 1)), 'INVALID_ARGUMENT')
    await debeFallar(llamar('crearPedido', { ...base, clave: 'clave-c3x', items: [{ id: 'cafe', cantidad: 1.5 }] }, comensalEn(L, 1)), 'INVALID_ARGUMENT')
    await debeFallar(llamar('crearPedido', { ...base, clave: 'clave-c4x', items: [{ id: 'cafe', cantidad: 1000 }] }, comensalEn(L, 1)), 'INVALID_ARGUMENT')
  }, PACIENCIA)

  it('rechaza un producto que no esta disponible', async () => {
    await debeFallar(llamar('crearPedido', {
      localId: L, mesaId: '1', clave: 'clave-agotado',
      items: [{ id: 'agotado', cantidad: 1 }],
    }, comensalEn(L, 1)), 'FAILED_PRECONDITION')
  }, PACIENCIA)

  it('rechaza un producto que no esta en la carta', async () => {
    await debeFallar(llamar('crearPedido', {
      localId: L, mesaId: '1', clave: 'clave-fantasma',
      items: [{ id: 'no-existe', cantidad: 1 }],
    }, comensalEn(L, 1)), 'FAILED_PRECONDITION')
  }, PACIENCIA)

  it('la propina desproporcionada se rechaza', async () => {
    await llamar('crearPedido', {
      localId: L, mesaId: '1', clave: 'clave-propina',
      items: [{ id: 'cafe', cantidad: 1 }],
    }, comensalEn(L, 1))

    await debeFallar(llamar('pedirCuenta', {
      localId: L, mesaId: '1', metodoPago: 'efectivo', propina: 999999,
    }, comensalEn(L, 1)), 'INVALID_ARGUMENT')
  }, PACIENCIA)
})

// ════════════════════════════════════════════════════════════
describe('AUD-002 — idempotencia: un reintento no cobra dos veces', () => {
  it('dos llamadas con la misma clave dejan un solo pedido', async () => {
    const datos = {
      localId: L, mesaId: '1', clave: 'la-misma-clave',
      items: [{ id: 'cafe', cantidad: 1 }],
    }
    const primera = await llamar('crearPedido', datos, comensalEn(L, 1))
    const segunda = await llamar('crearPedido', datos, comensalEn(L, 1))

    expect(segunda.pedidoId).toBe(primera.pedidoId)
    expect(segunda.repetido).toBe(true)

    const lista = await listar(`locales/${L}/mesas/mesa_1/pedidos`)
    expect(lista).toHaveLength(1)

    // Lo que de verdad importa: la cuenta no se duplico.
    const mesa = await leer(`locales/${L}/mesas/mesa_1`)
    expect(mesa.total_acumulado).toBe(900)
  }, PACIENCIA)

  it('dos reintentos EN PARALELO tampoco duplican', async () => {
    const datos = {
      localId: L, mesaId: '1', clave: 'clave-carrera',
      items: [{ id: 'cafe', cantidad: 1 }],
    }
    await Promise.all([
      llamar('crearPedido', datos, comensalEn(L, 1)),
      llamar('crearPedido', datos, comensalEn(L, 1)),
    ])

    const lista = await listar(`locales/${L}/mesas/mesa_1/pedidos`)
    expect(lista).toHaveLength(1)
    const mesa = await leer(`locales/${L}/mesas/mesa_1`)
    expect(mesa.total_acumulado).toBe(900)
  }, PACIENCIA)

  it('claves distintas si crean pedidos distintos', async () => {
    const items = [{ id: 'cafe', cantidad: 1 }]
    await llamar('crearPedido', { localId: L, mesaId: '1', clave: 'clave-una1', items }, comensalEn(L, 1))
    await llamar('crearPedido', { localId: L, mesaId: '1', clave: 'clave-otra', items }, comensalEn(L, 1))

    const lista = await listar(`locales/${L}/mesas/mesa_1/pedidos`)
    expect(lista).toHaveLength(2)
    const mesa = await leer(`locales/${L}/mesas/mesa_1`)
    expect(mesa.total_acumulado).toBe(1800)
  }, PACIENCIA)

  it('sin clave no se crea nada', async () => {
    await debeFallar(llamar('crearPedido', {
      localId: L, mesaId: '1', items: [{ id: 'cafe', cantidad: 1 }],
    }, comensalEn(L, 1)), 'INVALID_ARGUMENT')
  }, PACIENCIA)
})

// ════════════════════════════════════════════════════════════
describe('AUD-002 — el carrito se consume una sola vez', () => {
  // Escenario: la mesa tiene un carrito armado y dos celulares mirando la
  // misma pantalla. Es lo normal en una mesa de cuatro.
  const conCarrito = () => escribir(`locales/${L}/mesas/mesa_1`, {
    estado: 'ocupada', personas: 2, carrito_bloqueado: false,
    total_acumulado: 0, propina: 0, metodo_pago: null,
    carrito: [
      { id: 'tostado', cantidad: 1, nota: '' },
      { id: 'cafe', cantidad: 2, nota: '' },
    ],
  })

  it('respuesta perdida y reintento con la MISMA clave: un solo pedido', async () => {
    await conCarrito()
    const datos = { localId: L, mesaId: '1', clave: 'clave-reintento' }

    // Primera llamada: el servidor escribe. Simulamos que la respuesta se
    // pierde en el camino y el cliente vuelve a intentar con su clave.
    const primera = await llamar('crearPedido', datos, comensalEn(L, 1))
    const reintento = await llamar('crearPedido', datos, comensalEn(L, 1))

    expect(reintento.pedidoId).toBe(primera.pedidoId)
    expect(reintento.repetido).toBe(true)

    const lista = await listar(`locales/${L}/mesas/mesa_1/pedidos`)
    expect(lista).toHaveLength(1)

    const mesa = await leer(`locales/${L}/mesas/mesa_1`)
    expect(mesa.total_acumulado).toBe(3600)   // 1800 + 2x900, una sola vez
  }, PACIENCIA)

  it('dos claves DISTINTAS sobre el mismo carrito: una sola gana', async () => {
    await conCarrito()

    // Este es el caso que la idempotencia por clave no cubre: para el
    // servidor son dos pedidos legitimos y distintos. Lo que los separa es
    // que el carrito solo se puede consumir una vez.
    const resultados = await Promise.allSettled([
      llamar('crearPedido', { localId: L, mesaId: '1', clave: 'celular-uno' }, comensalEn(L, 1)),
      llamar('crearPedido', { localId: L, mesaId: '1', clave: 'celular-dos' }, comensalEn(L, 1, 'comensal-2')),
    ])

    const ok = resultados.filter(r => r.status === 'fulfilled')
    expect(ok).toHaveLength(1)

    const lista = await listar(`locales/${L}/mesas/mesa_1/pedidos`)
    expect(lista).toHaveLength(1)
  }, PACIENCIA)

  it('el total se suma una sola vez aunque se confirme dos veces', async () => {
    await conCarrito()

    await llamar('crearPedido', { localId: L, mesaId: '1', clave: 'primera-vez' }, comensalEn(L, 1))

    // Segundo intento con otra clave, ya con el carrito consumido.
    await debeFallar(llamar('crearPedido', {
      localId: L, mesaId: '1', clave: 'segunda-vez',
    }, comensalEn(L, 1)))

    const mesa = await leer(`locales/${L}/mesas/mesa_1`)
    expect(mesa.total_acumulado).toBe(3600)
    expect(mesa.carrito).toEqual([])
    expect(mesa.carrito_bloqueado).toBe(true)
  }, PACIENCIA)

  it('confirmar un carrito vacio no crea nada', async () => {
    await debeFallar(llamar('crearPedido', {
      localId: L, mesaId: '1', clave: 'carrito-vacio',
    }, comensalEn(L, 1)), 'FAILED_PRECONDITION')

    const lista = await listar(`locales/${L}/mesas/mesa_1/pedidos`)
    expect(lista).toHaveLength(0)
  }, PACIENCIA)

  it('un pedido extra NO toca el carrito: es otro camino', async () => {
    await conCarrito()

    // Con renglones explicitos no hay carrito que consumir.
    await llamar('crearPedido', {
      localId: L, mesaId: '1', clave: 'extra-aparte',
      items: [{ id: 'agua', cantidad: 1 }],
    }, comensalEn(L, 1))

    const mesa = await leer(`locales/${L}/mesas/mesa_1`)
    expect(mesa.total_acumulado).toBe(700)
    expect(mesa.carrito).toHaveLength(2)          // el carrito sigue intacto
    expect(mesa.carrito_bloqueado).toBe(false)    // y sigue disponible

    // Y despues se puede confirmar el carrito, que es lo que espera la mesa.
    await llamar('crearPedido', { localId: L, mesaId: '1', clave: 'despues-del-extra' }, comensalEn(L, 1))
    const final = await leer(`locales/${L}/mesas/mesa_1`)
    expect(final.total_acumulado).toBe(4300)      // 700 + 3600
  }, PACIENCIA)
})

// ════════════════════════════════════════════════════════════
describe('AUD-002 — cada puesto hace lo suyo', () => {
  const pedirAlgo = () => llamar('crearPedido', {
    localId: L, mesaId: '1', clave: 'clave-base', items: [{ id: 'tostado', cantidad: 1 }],
  }, comensalEn(L, 1))

  it('cocina NO carga pedidos', async () => {
    await debeFallar(llamar('crearPedido', {
      localId: L, mesaId: '1', clave: 'cocina-pide', items: [{ id: 'cafe', cantidad: 1 }],
    }, empleado('kari', 'kari@a.com')), 'PERMISSION_DENIED')
  }, PACIENCIA)

  it('cocina NO pide la cuenta', async () => {
    await pedirAlgo()
    await debeFallar(llamar('pedirCuenta', {
      localId: L, mesaId: '1', metodoPago: 'efectivo', propina: 0,
    }, empleado('kari', 'kari@a.com')), 'PERMISSION_DENIED')
  }, PACIENCIA)

  it('cocina NO da una comanda entera por entregada', async () => {
    const r = await pedirAlgo()
    await debeFallar(llamar('marcarPedidoEntregado', {
      localId: L, mesaId: '1', pedidoId: r.pedidoId,
    }, empleado('kari', 'kari@a.com')), 'PERMISSION_DENIED')
  }, PACIENCIA)

  it('cocina SI marca listo lo que es de cocina', async () => {
    const r = await pedirAlgo()
    const pedido = await leer(`locales/${L}/mesas/mesa_1/pedidos/${r.pedidoId}`)
    await llamar('cambiarEstadoItem', {
      localId: L, mesaId: '1', pedidoId: r.pedidoId,
      rid: pedido.items[0].rid, estado: 'listo',
    }, empleado('kari', 'kari@a.com'))

    const despues = await leer(`locales/${L}/mesas/mesa_1/pedidos/${r.pedidoId}`)
    expect(despues.items[0].estado).toBe('listo')
  }, PACIENCIA)

  it('cocina NO toca un renglon que es del mozo', async () => {
    const r = await llamar('crearPedido', {
      localId: L, mesaId: '1', clave: 'clave-mixto', items: [{ id: 'agua', cantidad: 1 }],
    }, comensalEn(L, 1))
    const pedido = await leer(`locales/${L}/mesas/mesa_1/pedidos/${r.pedidoId}`)

    await debeFallar(llamar('cambiarEstadoItem', {
      localId: L, mesaId: '1', pedidoId: r.pedidoId,
      rid: pedido.items[0].rid, estado: 'listo',
    }, empleado('kari', 'kari@a.com')), 'PERMISSION_DENIED')
  }, PACIENCIA)

  it('cancelar un renglon es solo del encargado', async () => {
    const r = await pedirAlgo()
    const pedido = await leer(`locales/${L}/mesas/mesa_1/pedidos/${r.pedidoId}`)
    const rid = pedido.items[0].rid

    await debeFallar(llamar('cancelarItem', {
      localId: L, mesaId: '1', pedidoId: r.pedidoId, rid,
    }, empleado('mario', 'mario@a.com')), 'PERMISSION_DENIED')

    await llamar('cancelarItem', {
      localId: L, mesaId: '1', pedidoId: r.pedidoId, rid,
    }, empleado('ana', 'ana@a.com'))
  }, PACIENCIA)

  it('un comensal NO opera la mesa de al lado', async () => {
    await debeFallar(llamar('crearPedido', {
      localId: L, mesaId: '2', clave: 'mesa-ajena', items: [{ id: 'cafe', cantidad: 1 }],
    }, comensalEn(L, 1)), 'PERMISSION_DENIED')
  }, PACIENCIA)
})

// ════════════════════════════════════════════════════════════
describe('AUD-009 — dos personas sobre la misma comanda', () => {
  const pedidoConTres = async () => {
    const r = await llamar('crearPedido', {
      localId: L, mesaId: '1', clave: 'tres-renglones',
      items: [
        { id: 'tostado', cantidad: 1 },
        { id: 'agua', cantidad: 1 },
        { id: 'cafe', cantidad: 1 },
      ],
    }, comensalEn(L, 1))
    const pedido = await leer(`locales/${L}/mesas/mesa_1/pedidos/${r.pedidoId}`)
    return { pedidoId: r.pedidoId, items: pedido.items }
  }

  it('cambios simultaneos sobre renglones distintos NO se pisan', async () => {
    const { pedidoId, items } = await pedidoConTres()
    const cocina = items.find(i => i.destino === 'cocina')
    const mozo = items.find(i => i.destino === 'mozo')

    // Antes cada uno leia el pedido entero y lo reescribia completo: el
    // ultimo en escribir borraba el cambio del otro sin avisar.
    await Promise.all([
      llamar('cambiarEstadoItem', { localId: L, mesaId: '1', pedidoId, rid: cocina.rid, estado: 'listo' }, empleado('kari', 'kari@a.com')),
      llamar('cambiarEstadoItem', { localId: L, mesaId: '1', pedidoId, rid: mozo.rid, estado: 'listo' }, empleado('mario', 'mario@a.com')),
    ])

    const final = await leer(`locales/${L}/mesas/mesa_1/pedidos/${pedidoId}`)
    expect(final.items.find(i => i.rid === cocina.rid).estado).toBe('listo')
    expect(final.items.find(i => i.rid === mozo.rid).estado).toBe('listo')
  }, PACIENCIA)

  it('cancelar un renglon no corre los otros: el rid sigue apuntando a lo mismo', async () => {
    const { pedidoId, items } = await pedidoConTres()
    const primero = items[0]
    const tercero = items[2]

    await llamar('cancelarItem', { localId: L, mesaId: '1', pedidoId, rid: primero.rid }, empleado('ana', 'ana@a.com'))

    // Con indices, este cambio habria caido en otro producto.
    await llamar('cambiarEstadoItem', {
      localId: L, mesaId: '1', pedidoId, rid: tercero.rid, estado: 'listo',
    }, empleado('ana', 'ana@a.com'))

    const final = await leer(`locales/${L}/mesas/mesa_1/pedidos/${pedidoId}`)
    expect(final.items.find(i => i.rid === primero.rid)).toBeUndefined()
    expect(final.items.find(i => i.rid === tercero.rid).estado).toBe('listo')
  }, PACIENCIA)

  it('cancelar descuenta de la cuenta y no dos veces', async () => {
    const { pedidoId, items } = await pedidoConTres()
    const tostado = items.find(i => i.carta_id === 'tostado')

    const antes = await leer(`locales/${L}/mesas/mesa_1`)
    expect(antes.total_acumulado).toBe(3400)   // 1800 + 700 + 900

    await llamar('cancelarItem', { localId: L, mesaId: '1', pedidoId, rid: tostado.rid }, empleado('ana', 'ana@a.com'))

    const despues = await leer(`locales/${L}/mesas/mesa_1`)
    expect(despues.total_acumulado).toBe(1600)

    // Segundo intento sobre el mismo renglon: ya no esta, no descuenta de nuevo.
    await debeFallar(llamar('cancelarItem', {
      localId: L, mesaId: '1', pedidoId, rid: tostado.rid,
    }, empleado('ana', 'ana@a.com')), 'NOT_FOUND')

    const final = await leer(`locales/${L}/mesas/mesa_1`)
    expect(final.total_acumulado).toBe(1600)
  }, PACIENCIA)
})
