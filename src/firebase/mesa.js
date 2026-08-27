// ============================================================
//  MESAS, CARRITO, PEDIDOS, CHAT Y CUENTA
//
//  Todas las funciones reciben el localId como primer argumento y
//  arman sus rutas con rutas.js. Ninguna escribe un path a mano: es
//  lo que garantiza que los datos de un negocio no puedan caer en
//  otro por un descuido.
// ============================================================
import {
  getDoc, setDoc, updateDoc, onSnapshot,
  addDoc, serverTimestamp, runTransaction,
  query, orderBy, limit,
} from 'firebase/firestore'
import { db } from './config'
import {
  refMesa, colPedidos, colMensajes, colCarta,
} from './rutas'
import { llamarBackend } from './funciones'

// Cada confirmacion lleva una clave propia. Si el celular pierde senal
// justo despues de que el backend escribio pero antes de que llegue la
// respuesta, la app reintenta: sin clave eso cargaba el pedido dos veces
// y le cobraba de mas al cliente. Con clave, el reintento cae en el mismo
// documento y el backend devuelve lo que ya habia guardado.
const generarClave = () => (
  crypto.randomUUID?.() || `p_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
).replace(/[^A-Za-z0-9_-]/g, '')

// La clave NO se genera en cada llamada: se genera una vez por operación
// pendiente y se reutiliza hasta que esa operación termine bien.
//
// Es el detalle que hacía inútil todo lo demás. El backend guarda el pedido
// con la clave que le llega, así que si el cliente inventa una nueva en cada
// reintento, el reintento cae en OTRO documento y el pedido se duplica igual.
// La clave es lo que dice "esto es el mismo intento, no uno nuevo", y eso
// tiene que decidirlo quien reintenta.
//
// Se guarda en localStorage y no en memoria para que también sobreviva a
// recargar la página, que es justo lo que hace alguien cuando la app se le
// queda colgada tras confirmar.
const claveGuardada = (localId, mesaId, operacion) => {
  const casillero = `pedido_pendiente:${localId}:${mesaId}:${operacion}`
  try {
    const guardada = localStorage.getItem(casillero)
    if (guardada) return { clave: guardada, casillero }
    const nueva = generarClave()
    localStorage.setItem(casillero, nueva)
    return { clave: nueva, casillero }
  } catch {
    // Sin localStorage —modo privado, navegador viejo— la clave dura lo
    // que dure la llamada. Peor que lo anterior no es.
    return { clave: generarClave(), casillero: null }
  }
}

const soltarClave = (casillero) => {
  if (!casillero) return
  try { localStorage.removeItem(casillero) } catch { /* nada que hacer */ }
}

// Envuelve una creación de pedido: reutiliza la clave pendiente y recién la
// suelta cuando el backend confirmó. Si falla, la clave queda para el
// próximo intento.
const conClavePendiente = async (funcion, localId, mesaId, operacion, extra = {}) => {
  const { clave, casillero } = claveGuardada(localId, mesaId, operacion)
  const resultado = await llamarBackend(funcion, { localId, mesaId, clave, ...extra })
  soltarClave(casillero)
  return resultado
}

const crearPedidoConClave = (localId, mesaId, operacion, extra = {}) =>
  conClavePendiente('crearPedido', localId, mesaId, operacion, extra)

// El carrito guarda un borrador, no plata: que producto y cuantos.
// El precio lo pone el servidor al confirmar, leyendo la carta vigente.
// Si lo guardara el navegador, seria el navegador el que fija el precio.
const aRenglon = (item, cantidad = 1) => ({
  id: item.id,
  cantidad,
  nota: item.nota || '',
})

export const suscribirMesa = (localId, mesaId, callback) => {
  return onSnapshot(refMesa(localId, mesaId), (snap) => {
    callback(snap.exists() ? { id: snap.id, ...snap.data() } : null)
  })
}

export const ocuparMesa = async (localId, mesaId, nombreCliente, dispositivoId, personas = 1) => {
  const ref = refMesa(localId, mesaId)
  const snap = await getDoc(ref)
  const data = snap.exists() ? snap.data() : {}

  // Si la mesa está ocupada o en cualquier estado activo, agregar cliente
  if (data.estado && data.estado !== 'libre') {
    await updateDoc(ref, {
      clientes: [...new Set([...(data.clientes || []), nombreCliente])],
      dispositivos: [...new Set([...(data.dispositivos || []), dispositivoId])],
    })
  } else {
    await setDoc(ref, {
      estado: 'ocupada',
      mesa_numero: mesaId,
      clientes: [nombreCliente],
      dispositivos: [dispositivoId],
      personas,
      carrito: [],
      carrito_bloqueado: false,
      total_acumulado: 0,
      propina: 0,
      metodo_pago: null,
      abona_con: null,
      hora_apertura: serverTimestamp(),
    })
  }
}

export const agregarAlCarrito = async (localId, mesaId, item) => {
  const ref = refMesa(localId, mesaId)
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref)
    if (!snap.exists()) throw new Error('Mesa no existe')
    const data = snap.data()
    if (data.carrito_bloqueado) throw new Error('Carrito bloqueado')
    const carrito = data.carrito || []
    const existe = carrito.find(i => i.id === item.id)
    const nuevoCarrito = existe
      ? carrito.map(i => i.id === item.id
          ? { ...i, cantidad: i.cantidad + 1, nota: item.nota || i.nota || '' }
          : i)
      : [...carrito, aRenglon(item)]
    transaction.update(ref, { carrito: nuevoCarrito })
  })
}

export const quitarDelCarrito = async (localId, mesaId, itemId) => {
  const ref = refMesa(localId, mesaId)
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref)
    const data = snap.data()
    if (data.carrito_bloqueado) throw new Error('Carrito bloqueado')
    const carrito = (data.carrito || [])
      .map(i => i.id === itemId ? { ...i, cantidad: i.cantidad - 1 } : i)
      .filter(i => i.cantidad > 0)
    transaction.update(ref, { carrito })
  })
}

// Confirmar el pedido ya no calcula nada en el navegador: le avisa al
// backend, que lee el carrito guardado en la mesa, le pone precio con
// la carta vigente y suma el total en la misma transaccion.
export const confirmarPedido = async (localId, mesaId) => {
  return crearPedidoConClave(localId, mesaId, 'confirmacion')
}

// Agregar a una mesa que ya confirmo: se mandan los renglones, nunca
// los importes.
export const agregarPedidoExtra = async (localId, mesaId, items) => {
  return crearPedidoConClave(localId, mesaId, 'extra', {
    items: (items || []).map(i => aRenglon(i, i.cantidad)),
  })
}

export const suscribirPedidos = (localId, mesaId, callback) => {
  const q = query(colPedidos(localId, mesaId), orderBy('created_at', 'asc'))
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  })
}

// La propina y el metodo de pago terminan en el cierre de caja, asi que
// los valida el backend antes de escribirlos.
export const pedirCuenta = async (localId, mesaId, metodoPago, propina, abonaCon = null) => {
  return llamarBackend('pedirCuenta', { localId, mesaId, metodoPago, propina, abonaCon })
}

// Liberar mesa completamente - borra subcolecciones
/**
 * Cierra la mesa: registra el consumo en la caja y la deja libre.
 *
 * Antes eran dos escrituras sueltas desde el navegador —primero el cierre
 * al historial, despues la mesa— y un corte en el medio dejaba la mesa
 * cobrada pero ocupada. El encargado la veia igual que antes, volvia a
 * apretar, y quedaban DOS cierres del mismo consumo en la caja.
 *
 * Ahora va todo en una transaccion del backend, con la misma clave
 * persistida que usan los pedidos: el reintento cae en el mismo cierre.
 *
 * `conRegistro: false` es "se fue sin pagar": libera la mesa sin tocar la
 * caja.
 */
export const cerrarMesa = (localId, mesaId, { conRegistro = true } = {}) =>
  conClavePendiente(
    'cerrarMesa', localId, mesaId,
    conRegistro ? 'cierre' : 'cierre_sin_pago',
    { conRegistro },
  )

export const suscribirCarta = (localId, callback) => {
  return onSnapshot(colCarta(localId), (snap) => {
    const items = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(i => i.disponible)
      .sort((a, b) => {
        if (a.categoria === 'promocion' && b.categoria !== 'promocion') return -1
        if (b.categoria === 'promocion' && a.categoria !== 'promocion') return 1
        return 0
      })
    callback(items)
  })
}

/**
 * `rol` es 'cliente' o 'staff'. Antes se distinguia comparando el nombre
 * del autor con el propio, y eso fallaba de dos maneras: el encargado se
 * auto-notificaba de sus propios mensajes, y un comensal que se pusiera de
 * nombre "Encargado" aparecia como personal del local. Las reglas ahora
 * exigen que el rol coincida con quien escribe, asi que no se puede mentir.
 */
export const enviarMensaje = async (localId, mesaId, texto, autor, rol) => {
  await addDoc(colMensajes(localId, mesaId), {
    texto, autor, rol, created_at: serverTimestamp(),
  })
}

// Solo el ultimo mensaje de la mesa: alcanza para saber si hay algo sin leer
// y cuesta un documento por mesa en vez de la conversacion entera.
export const suscribirUltimoMensaje = (localId, mesaId, callback) => {
  const q = query(colMensajes(localId, mesaId), orderBy('created_at', 'desc'), limit(1))
  return onSnapshot(q, (snap) => {
    const doc = snap.docs[0]
    callback(doc ? { id: doc.id, ...doc.data() } : null)
  })
}

export const suscribirMensajes = (localId, mesaId, callback) => {
  const q = query(colMensajes(localId, mesaId), orderBy('created_at', 'asc'))
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  })
}
