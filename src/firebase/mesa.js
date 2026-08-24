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
  query, orderBy, writeBatch, getDocs, doc,
} from 'firebase/firestore'
import { db } from './config'
import {
  refMesa, colPedidos, colMensajes, colLlamadas, colCarta,
} from './rutas'

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
      ? carrito.map(i => i.id === item.id ? { ...i, cantidad: i.cantidad + 1 } : i)
      : [...carrito, { ...item, cantidad: 1 }]
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

export const confirmarPedido = async (localId, mesaId, dispositivoId) => {
  const ref = refMesa(localId, mesaId)
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref)
    if (!snap.exists()) throw new Error('Mesa no existe')
    const data = snap.data()
    if (data.carrito_bloqueado) throw new Error('Ya fue confirmado')
    if (!data.carrito || data.carrito.length === 0) throw new Error('Carrito vacío')
    const total = data.carrito.reduce((acc, i) => acc + i.precio * i.cantidad, 0)
    const pedidoRef = doc(colPedidos(localId, mesaId))
    transaction.set(pedidoRef, {
      items: data.carrito.map(i => ({
        ...i,
        estado: 'pendiente',
        nota: i.nota || ''
      })),
      estado: 'pendiente',
      confirmado_por: dispositivoId,
      total,
      created_at: serverTimestamp(),
    })
    transaction.update(ref, {
      carrito_bloqueado: true,
      total_acumulado: (data.total_acumulado || 0) + total,
      estado: 'esperando_preparacion',
      carrito: []
    })
  })
}

export const agregarPedidoExtra = async (localId, mesaId, items, dispositivoId) => {
  const total = items.reduce((acc, i) => acc + i.precio * i.cantidad, 0)
  const ref = refMesa(localId, mesaId)
  const pedidoRef = doc(colPedidos(localId, mesaId))
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref)
    const data = snap.data()
    transaction.set(pedidoRef, {
      items: items.map(i => ({ ...i, estado: 'pendiente' })),
      estado: 'pendiente',
      confirmado_por: dispositivoId,
      total,
      created_at: serverTimestamp(),
    })
    transaction.update(ref, {
      total_acumulado: (data.total_acumulado || 0) + total
    })
  })
}

export const suscribirPedidos = (localId, mesaId, callback) => {
  const q = query(colPedidos(localId, mesaId), orderBy('created_at', 'asc'))
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  })
}

export const pedirCuenta = async (localId, mesaId, metodoPago, propina, abonaCon = null) => {
  await updateDoc(refMesa(localId, mesaId), {
    estado: 'esperando_cuenta',
    metodo_pago: metodoPago,
    propina: propina || 0,
    abona_con: abonaCon,
  })
}

// Liberar mesa completamente - borra subcolecciones
export const liberarMesa = async (localId, mesaId) => {
  const batch = writeBatch(db)
  const cols = [
    colPedidos(localId, mesaId),
    colMensajes(localId, mesaId),
    colLlamadas(localId, mesaId),
  ]
  for (const col of cols) {
    const snap = await getDocs(col)
    snap.docs.forEach(d => batch.delete(d.ref))
  }
  batch.update(refMesa(localId, mesaId), {
    estado: 'libre',
    clientes: [], dispositivos: [], carrito: [],
    carrito_bloqueado: false, total_acumulado: 0,
    propina: 0, metodo_pago: null, abona_con: null,
    hora_apertura: null, personas: 0,
  })
  await batch.commit()
}

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

export const enviarMensaje = async (localId, mesaId, texto, autor) => {
  await addDoc(colMensajes(localId, mesaId), {
    texto, autor, created_at: serverTimestamp(),
  })
}

export const suscribirMensajes = (localId, mesaId, callback) => {
  const q = query(colMensajes(localId, mesaId), orderBy('created_at', 'asc'))
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  })
}
