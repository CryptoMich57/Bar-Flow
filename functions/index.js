// ============================================================
//  BACKEND CONFIABLE DE BARFLOW
//
//  Acá vive lo único que el navegador no puede decidir por sí mismo.
//  Todo lo demás sigue yendo directo a Firestore contra las reglas: no
//  se pone en el servidor lo que las reglas ya resuelven bien.
//
//  Por ahora: la CAPACIDAD DE MESA.
//
//  El comensal entra con una sesión anónima que no dice nada sobre
//  dónde está sentado. Con eso, cualquiera que supiera el identificador
//  de un local podía leer y escribir TODAS sus mesas: ver la cuenta de
//  la mesa de al lado, agregarle un pedido, o vaciarle el carrito.
//
//  La solución no es esconder mejor el número de mesa —está en el QR, a
//  la vista— sino que el permiso deje de ser "tengo sesión" y pase a ser
//  "el servidor me dio permiso para ESTA mesa, y vence". Eso no lo puede
//  falsificar el cliente: el custom claim lo firma Firebase.
// ============================================================
import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { setGlobalOptions } from 'firebase-functions/v2'

initializeApp()
setGlobalOptions({ region: 'southamerica-east1', maxInstances: 10 })

const db = getFirestore()

// Cuánto dura la capacidad. Una comida larga entra cómoda; una sesión
// olvidada en un celular ajeno no sirve al día siguiente.
const HORAS_DE_VIGENCIA = 6

const MESAS_POR_DEFECTO = 10

/**
 * Le da a quien está sentado permiso para operar UNA mesa concreta.
 *
 * Se llama apenas el comensal abre el QR, antes de que toque nada. El
 * permiso viaja como custom claim y las reglas lo comparan contra el
 * path que se está escribiendo.
 */
export const abrirMesa = onCall(async (req) => {
  if (!req.auth) {
    throw new HttpsError('unauthenticated', 'Hace falta una sesion.')
  }

  const localId = String(req.data?.localId || '').trim()
  const numeroMesa = String(req.data?.mesaId || '').trim()

  if (!localId || !numeroMesa) {
    throw new HttpsError('invalid-argument', 'Faltan el local y la mesa.')
  }
  if (!/^[0-9]+$/.test(numeroMesa)) {
    throw new HttpsError('invalid-argument', 'El numero de mesa no es valido.')
  }

  // El local tiene que existir y estar atendiendo. Un local suspendido no
  // reparte capacidades: es la misma frontera que aplican las reglas.
  const local = await db.doc(`locales/${localId}`).get()
  if (!local.exists) {
    throw new HttpsError('not-found', 'Ese local no existe.')
  }
  const estado = local.data()?.estado
  if (estado !== 'activo' && estado !== 'prueba') {
    throw new HttpsError('failed-precondition', 'Ese local no esta recibiendo pedidos.')
  }

  // Y la mesa tiene que ser una de las que el local declaró. Sin esto,
  // alguien podría pedir capacidad para la mesa 9999 y crear basura.
  const config = await db.doc(`locales/${localId}/sistema/configuracion`).get()
  const cantidad = config.data()?.mesas?.cantidad || MESAS_POR_DEFECTO
  const numero = Number(numeroMesa)
  if (numero < 1 || numero > cantidad) {
    throw new HttpsError('out-of-range', `Ese local tiene ${cantidad} mesas.`)
  }

  const vence = Date.now() + HORAS_DE_VIGENCIA * 60 * 60 * 1000

  // Se pisan los claims anteriores a propósito: una sesión vale para una
  // mesa a la vez. Si la persona se cambia de mesa, vuelve a pedir y la
  // anterior deja de servirle en el mismo acto.
  await getAuth().setCustomUserClaims(req.auth.uid, {
    mesa: { l: localId, m: `mesa_${numero}`, exp: vence },
  })

  return { localId, mesaId: `mesa_${numero}`, vence }
})

// ============================================================
//  PEDIDOS Y PLATA  (AUD-002 y AUD-009)
//
//  Hasta acá el navegador armaba el pedido con los precios que él
//  mismo tenía en memoria y escribía el total en la mesa. Un cliente
//  modificado podía mandar un café a cero pesos, o bajar de una
//  el total acumulado: la caja del negocio dependía de que nadie
//  tocara el JavaScript.
//
//  Ahora el cliente manda QUÉ quiere y CUÁNTO, nunca a qué precio.
//  El servidor lee la carta vigente, decide el precio y el destino,
//  suma, y recién ahí escribe. Es la misma idea de la capacidad de
//  mesa: lo que no se puede verificar, no se le pregunta al cliente.
//
//  Y los cambios de estado también pasan por acá, en transacción.
//  Cocina y mozo leían el pedido entero y lo reescribían completo;
//  dos personas tocando la misma comanda al mismo tiempo se pisaban
//  y uno de los dos cambios se perdía sin que nadie se enterara.
// ============================================================

const ESTADOS_DE_ITEM = ['pendiente', 'en_preparacion', 'listo']
const METODOS_DE_PAGO = ['efectivo', 'tarjeta', 'transferencia']
const DESTINOS = ['cocina', 'mozo', 'encargado']

const MAX_RENGLONES = 50
const MAX_UNIDADES = 99
const LARGO_MAX_NOTA = 200

const exigirSesion = (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Hace falta una sesion.')
  return req.auth
}

const textoPlano = (valor) => String(valor ?? '').trim()

const exigirLocalYMesa = (data) => {
  const localId = textoPlano(data?.localId)
  const numero = textoPlano(data?.mesaId).replace(/^mesa_/, '')
  if (!localId || !numero) {
    throw new HttpsError('invalid-argument', 'Faltan el local y la mesa.')
  }
  if (!/^[0-9]+$/.test(numero)) {
    throw new HttpsError('invalid-argument', 'El numero de mesa no es valido.')
  }
  return { localId, mesaId: `mesa_${numero}` }
}

const exigirLocalAtendiendo = async (localId) => {
  const local = await db.doc(`locales/${localId}`).get()
  if (!local.exists) throw new HttpsError('not-found', 'Ese local no existe.')
  const estado = local.data()?.estado
  if (estado !== 'activo' && estado !== 'prueba') {
    throw new HttpsError('failed-precondition', 'Ese local no esta recibiendo pedidos.')
  }
}

/**
 * Quien llama: personal con ficha activa, o comensal con capacidad
 * vigente para ESTA mesa. Se apoya en lo mismo que miran las reglas,
 * asi que no hay dos definiciones de "quien puede" que puedan
 * desincronizarse.
 */
const identificar = async (req, localId, mesaId) => {
  const { uid, token } = exigirSesion(req)

  const ficha = await db.doc(`locales/${localId}/empleados/${uid}`).get()
  if (ficha.exists && ficha.data()?.activo === true) {
    const rol = ficha.data()?.rol
    if (['encargado', 'cocina', 'mozo'].includes(rol)) {
      return { tipo: 'personal', rol, uid }
    }
  }

  const capacidad = token?.mesa
  const esAnonimo = token?.firebase?.sign_in_provider === 'anonymous'
  if (esAnonimo && capacidad && capacidad.l === localId
      && capacidad.m === mesaId && capacidad.exp > Date.now()) {
    return { tipo: 'comensal', rol: null, uid }
  }

  throw new HttpsError('permission-denied', 'No tenes permiso sobre esta mesa.')
}

const exigirPersonal = (actor) => {
  if (actor.tipo !== 'personal') {
    throw new HttpsError('permission-denied', 'Esto lo hace el personal del local.')
  }
}

/**
 * Quien puede hacer cada cosa, en un solo lugar y no repartido por las
 * funciones. Antes alcanzaba con "ser personal", y eso le daba a cocina
 * cosas que no son suyas: cargar pedidos, pedir la cuenta de una mesa o
 * dar una comanda entera por entregada sin haberla llevado nadie.
 *
 * El encargado figura en todas porque es quien cubre los huecos cuando
 * falta alguien; es la unica excepcion que el negocio realmente usa.
 */
const PUESTOS_HABILITADOS = {
  crearPedido:           ['encargado', 'mozo'],
  pedirCuenta:           ['encargado', 'mozo'],
  marcarPedidoEntregado: ['encargado', 'mozo'],
  cancelarItem:          ['encargado'],
}

const exigirPuesto = (actor, operacion) => {
  exigirPersonal(actor)
  const habilitados = PUESTOS_HABILITADOS[operacion] || []
  if (!habilitados.includes(actor.rol)) {
    throw new HttpsError(
      'permission-denied',
      `Tu puesto (${actor.rol}) no puede hacer esto.`
    )
  }
}

// Una operacion que el comensal tambien puede hacer sobre SU mesa.
const exigirComensalOPuesto = (actor, operacion) => {
  if (actor.tipo === 'comensal') return
  exigirPuesto(actor, operacion)
}

// ── (1) Idempotencia ────────────────────────────────────────────────
// Un pedido se crea con un id que trae el cliente, no con uno al azar.
// Si el celular pierde senal despues de escribir pero antes de recibir
// la respuesta, la app reintenta: con id al azar eso cargaba el pedido
// DOS VECES y le cobraba de mas al cliente. Con id estable, el reintento
// cae en el mismo documento y devuelve lo que ya se habia guardado.
const LARGO_MIN_CLAVE = 8
const LARGO_MAX_CLAVE = 128

const exigirClaveDeIdempotencia = (valor) => {
  const clave = textoPlano(valor)
  if (!clave) {
    throw new HttpsError('invalid-argument', 'Falta la clave del pedido.')
  }
  if (clave.length < LARGO_MIN_CLAVE || clave.length > LARGO_MAX_CLAVE) {
    throw new HttpsError('invalid-argument', 'La clave del pedido no es valida.')
  }
  // Tiene que servir como id de documento: sin barras ni puntos sueltos.
  if (!/^[A-Za-z0-9_-]+$/.test(clave)) {
    throw new HttpsError('invalid-argument', 'La clave del pedido tiene caracteres invalidos.')
  }
  return clave
}

/**
 * Huella de un carrito: que productos y en que cantidad, en orden fijo.
 *
 * Sirve para verificar DENTRO de la transaccion que el carrito que se
 * cotizo afuera sigue siendo el mismo. Si entre la cotizacion y la
 * escritura alguien le agrego algo, cobrar el carrito viejo seria
 * cobrarle mal al cliente.
 */
const huellaDeCarrito = (carrito) =>
  (carrito || [])
    .map(i => `${textoPlano(i?.id)}x${Number(i?.cantidad) || 0}`)
    .sort()
    .join('|')

/**
 * Traduce lo que pidio el cliente a renglones con precio de verdad.
 * El precio, el nombre y el DESTINO salen de la carta: el destino
 * decide a que cola va el pedido, asi que dejarlo elegir al cliente
 * seria dejarle saltear la cocina.
 */
const armarRenglones = async (localId, pedido) => {
  if (!Array.isArray(pedido) || pedido.length === 0) {
    throw new HttpsError('invalid-argument', 'El pedido esta vacio.')
  }
  if (pedido.length > MAX_RENGLONES) {
    throw new HttpsError('invalid-argument', `No se pueden pedir mas de ${MAX_RENGLONES} productos distintos.`)
  }

  // Se juntan las repeticiones del mismo producto antes de leer la carta.
  const pedidos = new Map()
  for (const renglon of pedido) {
    const id = textoPlano(renglon?.id)
    const cantidad = Number(renglon?.cantidad)
    const nota = textoPlano(renglon?.nota).slice(0, LARGO_MAX_NOTA)

    if (!id) throw new HttpsError('invalid-argument', 'Hay un producto sin identificar.')
    if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > MAX_UNIDADES) {
      throw new HttpsError('invalid-argument', `La cantidad de "${id}" no es valida.`)
    }

    const previo = pedidos.get(id)
    if (previo) {
      previo.cantidad = Math.min(previo.cantidad + cantidad, MAX_UNIDADES)
      if (nota && !previo.nota) previo.nota = nota
    } else {
      pedidos.set(id, { id, cantidad, nota })
    }
  }

  const ids = [...pedidos.keys()]
  const docs = await db.getAll(...ids.map(id => db.doc(`locales/${localId}/carta/${id}`)))

  const renglones = []
  let total = 0

  docs.forEach((snap, i) => {
    const solicitado = pedidos.get(ids[i])
    if (!snap.exists) {
      throw new HttpsError('failed-precondition', 'Hay un producto que ya no esta en la carta.')
    }
    const item = snap.data()
    if (item.disponible !== true) {
      throw new HttpsError('failed-precondition', `"${item.nombre || solicitado.id}" no esta disponible ahora.`)
    }
    const precio = Number(item.precio)
    if (!Number.isFinite(precio) || precio < 0) {
      throw new HttpsError('failed-precondition', `"${item.nombre || solicitado.id}" tiene un precio mal cargado.`)
    }

    const destino = DESTINOS.includes(item.destino) ? item.destino : 'cocina'

    renglones.push({
      // Identificador estable del renglon. Antes las funciones recibian
      // la POSICION en el array, y eso se rompe solo: si el encargado
      // cancela el renglon 0 mientras cocina marca listo el 1, cuando
      // llega el segundo cambio el 1 ya es otro producto. Con id propio,
      // cada operacion apunta a lo que apuntaba cuando se decidio.
      rid: `${snap.id}_${i}`,
      carta_id: snap.id,
      nombre: String(item.nombre || ''),
      precio,
      cantidad: solicitado.cantidad,
      nota: solicitado.nota,
      destino,
      estado: 'pendiente',
    })
    total += precio * solicitado.cantidad
  })

  return { renglones, total }
}

/**
 * Crea un pedido con precios del servidor y actualiza el total de la
 * mesa en la misma transaccion. Antes eran dos escrituras separadas y
 * un corte en el medio dejaba el pedido cargado sin sumar a la cuenta.
 */
export const crearPedido = onCall(async (req) => {
  const { localId, mesaId } = exigirLocalYMesa(req.data)
  await exigirLocalAtendiendo(localId)
  const actor = await identificar(req, localId, mesaId)
  // Cocina no carga pedidos: prepara lo que le llega.
  exigirComensalOPuesto(actor, 'crearPedido')

  const clave = exigirClaveDeIdempotencia(req.data?.clave)

  const refMesa = db.doc(`locales/${localId}/mesas/${mesaId}`)
  const refPedido = refMesa.collection('pedidos').doc(clave)

  // Atajo barato para el reintento comun: si ya existe, ni siquiera se
  // vuelve a leer la carta. La transaccion igual lo verifica, porque
  // entre este get y ella puede entrar otro reintento.
  const yaEstaba = await refPedido.get()
  if (yaEstaba.exists) {
    return { pedidoId: refPedido.id, total: yaEstaba.data().total, repetido: true }
  }

  // Dos caminos distintos, y la diferencia importa:
  //
  //  - CONFIRMAR EL CARRITO: el cliente no manda renglones, se toma el
  //    carrito guardado en la mesa. Ese carrito es un recurso que se
  //    CONSUME: solo una confirmacion puede convertirlo en pedido.
  //  - PEDIDO EXTRA: el cliente manda los renglones. No hay carrito que
  //    consumir, asi que no corresponde bloquear nada.
  const pidioRenglones = Array.isArray(req.data?.items) && req.data.items.length > 0

  let solicitado = req.data?.items
  let huellaCotizada = null
  if (!pidioRenglones) {
    const mesaActual = await refMesa.get()
    const carrito = mesaActual.data()?.carrito || []
    if (carrito.length === 0) {
      throw new HttpsError('failed-precondition', 'El carrito esta vacio.')
    }
    solicitado = carrito
    huellaCotizada = huellaDeCarrito(carrito)
  }

  const { renglones, total } = await armarRenglones(localId, solicitado)

  const resultado = await db.runTransaction(async (tx) => {
    const [mesa, pedidoPrevio] = await Promise.all([tx.get(refMesa), tx.get(refPedido)])

    // Dos reintentos en paralelo llegan hasta aca. El segundo encuentra
    // el pedido ya escrito y se va sin sumar el total otra vez: es lo
    // que evita el doble cobro.
    if (pedidoPrevio.exists) {
      return { pedidoId: refPedido.id, total: pedidoPrevio.data().total, repetido: true }
    }

    if (!mesa.exists) throw new HttpsError('not-found', 'Esa mesa no esta abierta.')
    const datos = mesa.data()
    if (datos.estado === 'libre') {
      throw new HttpsError('failed-precondition', 'Esa mesa esta libre.')
    }

    if (!pidioRenglones) {
      // Aca esta el consumo atomico. Dos celulares de la misma mesa pueden
      // confirmar el mismo carrito al mismo tiempo con claves DISTINTAS: la
      // idempotencia por clave no los detiene, porque para el servidor son
      // dos pedidos legitimos y diferentes. Lo que los detiene es que el
      // carrito ya no este disponible.
      //
      // Firestore reintenta la transaccion cuando el documento cambio bajo
      // sus pies, asi que el segundo vuelve a leer y encuentra la mesa ya
      // bloqueada.
      if (datos.carrito_bloqueado === true) {
        throw new HttpsError('aborted', 'Ese pedido ya fue confirmado desde otro dispositivo.')
      }
      // Y si entre la cotizacion y este momento alguien agrego algo al
      // carrito, lo cotizado ya no es lo que hay: mejor rechazar y que la
      // app reintente, que cobrar una lista vieja.
      if (huellaDeCarrito(datos.carrito) !== huellaCotizada) {
        throw new HttpsError('aborted', 'El carrito cambio mientras se confirmaba. Proba de nuevo.')
      }
    }

    tx.set(refPedido, {
      items: renglones,
      estado: 'pendiente',
      total,
      creado_por: { uid: actor.uid, tipo: actor.tipo, rol: actor.rol },
      created_at: FieldValue.serverTimestamp(),
    })

    const cambios = {
      total_acumulado: Number(datos.total_acumulado || 0) + total,
      estado: datos.estado === 'esperando_cuenta' ? datos.estado : 'esperando_preparacion',
    }
    // El carrito se vacia y se marca consumido solo cuando fue el carrito
    // lo que se confirmo. Un pedido extra no tiene por que tocarlo.
    if (!pidioRenglones) {
      cambios.carrito = []
      cambios.carrito_bloqueado = true
    }
    tx.update(refMesa, cambios)

    return { pedidoId: refPedido.id, total, repetido: false }
  })

  return resultado
})

/**
 * Cambia el estado de UN renglon. Se relee dentro de la transaccion,
 * asi dos personas trabajando la misma comanda no se pisan.
 */
export const cambiarEstadoItem = onCall(async (req) => {
  const { localId, mesaId } = exigirLocalYMesa(req.data)
  await exigirLocalAtendiendo(localId)
  const actor = await identificar(req, localId, mesaId)
  exigirPersonal(actor)

  const pedidoId = textoPlano(req.data?.pedidoId)
  const rid = textoPlano(req.data?.rid)
  const estado = textoPlano(req.data?.estado)

  if (!pedidoId) throw new HttpsError('invalid-argument', 'Falta el pedido.')
  if (!rid) throw new HttpsError('invalid-argument', 'Falta el renglon.')
  if (!ESTADOS_DE_ITEM.includes(estado)) {
    throw new HttpsError('invalid-argument', 'Ese estado no existe.')
  }

  const refPedido = db.doc(`locales/${localId}/mesas/${mesaId}/pedidos/${pedidoId}`)

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(refPedido)
    if (!snap.exists) throw new HttpsError('not-found', 'Ese pedido ya no existe.')

    const items = [...(snap.data().items || [])]
    // Se busca por identificador, no por posicion: si mientras tanto se
    // cancelo otro renglon, la posicion apuntaria a un producto distinto.
    const i = items.findIndex(it => it.rid === rid)
    if (i === -1) throw new HttpsError('not-found', 'Ese renglon ya no existe.')

    // Cocina toca lo de cocina y el mozo lo suyo. El encargado, todo:
    // es quien cubre los huecos cuando falta alguien.
    const destino = items[i].destino
    if (actor.rol !== 'encargado' && destino !== actor.rol) {
      throw new HttpsError('permission-denied', 'Ese renglon no es de tu puesto.')
    }

    items[i] = { ...items[i], estado }

    const todoListo = items.every(it => it.estado === 'listo' || it.estado === 'entregado')
    tx.update(refPedido, {
      items,
      estado: todoListo ? 'listo' : 'en_preparacion',
    })
  })

  return { ok: true }
})

export const marcarPedidoEntregado = onCall(async (req) => {
  const { localId, mesaId } = exigirLocalYMesa(req.data)
  await exigirLocalAtendiendo(localId)
  const actor = await identificar(req, localId, mesaId)
  // Entregar es llevar la comanda a la mesa. Cocina no la lleva, asi que
  // tampoco puede darla por entregada.
  exigirPuesto(actor, 'marcarPedidoEntregado')

  const pedidoId = textoPlano(req.data?.pedidoId)
  if (!pedidoId) throw new HttpsError('invalid-argument', 'Falta el pedido.')

  const refPedido = db.doc(`locales/${localId}/mesas/${mesaId}/pedidos/${pedidoId}`)

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(refPedido)
    if (!snap.exists) throw new HttpsError('not-found', 'Ese pedido ya no existe.')
    const items = (snap.data().items || []).map(i => ({ ...i, estado: 'entregado' }))
    tx.update(refPedido, { items, estado: 'entregado' })
  })

  return { ok: true }
})

/**
 * Cancela un renglon y descuenta lo que corresponde de la cuenta.
 * Antes eran dos escrituras sueltas y el descuento se calculaba con
 * el total que tenia el navegador en pantalla, que podia estar viejo.
 */
export const cancelarItem = onCall(async (req) => {
  const { localId, mesaId } = exigirLocalYMesa(req.data)
  await exigirLocalAtendiendo(localId)
  const actor = await identificar(req, localId, mesaId)
  exigirPuesto(actor, 'cancelarItem')

  const pedidoId = textoPlano(req.data?.pedidoId)
  const rid = textoPlano(req.data?.rid)
  if (!pedidoId) throw new HttpsError('invalid-argument', 'Falta el pedido.')
  if (!rid) throw new HttpsError('invalid-argument', 'Falta el renglon.')

  const refMesa = db.doc(`locales/${localId}/mesas/${mesaId}`)
  const refPedido = refMesa.collection('pedidos').doc(pedidoId)

  const resultado = await db.runTransaction(async (tx) => {
    const [pedido, mesa] = await Promise.all([tx.get(refPedido), tx.get(refMesa)])
    if (!pedido.exists) throw new HttpsError('not-found', 'Ese pedido ya no existe.')
    if (!mesa.exists) throw new HttpsError('not-found', 'Esa mesa ya no existe.')

    const items = [...(pedido.data().items || [])]
    const i = items.findIndex(it => it.rid === rid)
    // Si ya lo cancelo otro, no se descuenta dos veces: se avisa y listo.
    if (i === -1) throw new HttpsError('not-found', 'Ese renglon ya no esta en el pedido.')

    const quitado = items[i]
    const descuento = Number(quitado.precio || 0) * Number(quitado.cantidad || 0)
    items.splice(i, 1)

    const totalPedido = items.reduce((acc, i) => acc + Number(i.precio || 0) * Number(i.cantidad || 0), 0)
    const totalMesa = Math.max(0, Number(mesa.data().total_acumulado || 0) - descuento)

    if (items.length === 0) {
      tx.delete(refPedido)
    } else {
      tx.update(refPedido, { items, total: totalPedido })
    }
    tx.update(refMesa, { total_acumulado: totalMesa })

    return { descuento, total_mesa: totalMesa }
  })

  return resultado
})

/**
 * Pedir la cuenta. La propina la elige el comensal, pero se valida:
 * era un campo numerico que el cliente escribia libre en la mesa, y
 * de ahi salia despues el cierre de caja.
 */
export const pedirCuenta = onCall(async (req) => {
  const { localId, mesaId } = exigirLocalYMesa(req.data)
  await exigirLocalAtendiendo(localId)
  const actor = await identificar(req, localId, mesaId)
  // La pide el comensal, o el mozo por el. Cocina no atiende mesas.
  exigirComensalOPuesto(actor, 'pedirCuenta')

  const metodoPago = textoPlano(req.data?.metodoPago)
  if (!METODOS_DE_PAGO.includes(metodoPago)) {
    throw new HttpsError('invalid-argument', 'Ese metodo de pago no existe.')
  }

  const propina = Number(req.data?.propina || 0)
  if (!Number.isFinite(propina) || propina < 0) {
    throw new HttpsError('invalid-argument', 'La propina no es valida.')
  }

  const abonaConCrudo = req.data?.abonaCon
  const abonaCon = abonaConCrudo == null || abonaConCrudo === ''
    ? null
    : Number(abonaConCrudo)
  if (abonaCon !== null && (!Number.isFinite(abonaCon) || abonaCon < 0)) {
    throw new HttpsError('invalid-argument', 'El importe con el que abona no es valido.')
  }

  const refMesa = db.doc(`locales/${localId}/mesas/${mesaId}`)

  await db.runTransaction(async (tx) => {
    const mesa = await tx.get(refMesa)
    if (!mesa.exists) throw new HttpsError('not-found', 'Esa mesa no esta abierta.')
    const datos = mesa.data()
    if (datos.estado === 'libre') {
      throw new HttpsError('failed-precondition', 'Esa mesa esta libre.')
    }

    // Una propina desproporcionada casi siempre es un dedo de mas o un
    // cliente tocado. Se corta en el doble de la cuenta.
    const consumido = Number(datos.total_acumulado || 0)
    if (propina > Math.max(consumido * 2, 1000)) {
      throw new HttpsError('invalid-argument', 'Esa propina es desproporcionada.')
    }

    tx.update(refMesa, {
      estado: 'esperando_cuenta',
      metodo_pago: metodoPago,
      propina,
      abona_con: metodoPago === 'efectivo' ? abonaCon : null,
    })
  })

  return { ok: true }
})
