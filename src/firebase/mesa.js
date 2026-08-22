import {
  doc, getDoc, setDoc, updateDoc, onSnapshot,
  collection, addDoc, serverTimestamp, runTransaction,
  query, orderBy, writeBatch, getDocs
} from 'firebase/firestore'
import { db } from './config'

export const getMesaRef = (mesaId) => doc(db, 'mesas', `mesa_${mesaId}`)

export const suscribirMesa = (mesaId, callback) => {
  return onSnapshot(getMesaRef(mesaId), (snap) => {
    callback(snap.exists() ? { id: snap.id, ...snap.data() } : null)
  })
}

export const ocuparMesa = async (mesaId, nombreCliente, dispositivoId, personas = 1) => {
  const ref = getMesaRef(mesaId)
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

export const agregarAlCarrito = async (mesaId, item) => {
  const ref = getMesaRef(mesaId)
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

export const quitarDelCarrito = async (mesaId, itemId) => {
  const ref = getMesaRef(mesaId)
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

export const confirmarPedido = async (mesaId, dispositivoId) => {
  const ref = getMesaRef(mesaId)
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref)
    if (!snap.exists()) throw new Error('Mesa no existe')
    const data = snap.data()
    if (data.carrito_bloqueado) throw new Error('Ya fue confirmado')
    if (!data.carrito || data.carrito.length === 0) throw new Error('Carrito vacío')
    const total = data.carrito.reduce((acc, i) => acc + i.precio * i.cantidad, 0)
    const pedidoRef = doc(collection(db, 'mesas', `mesa_${mesaId}`, 'pedidos'))
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

export const agregarPedidoExtra = async (mesaId, items, dispositivoId) => {
  const total = items.reduce((acc, i) => acc + i.precio * i.cantidad, 0)
  const ref = getMesaRef(mesaId)
  const pedidoRef = doc(collection(db, 'mesas', `mesa_${mesaId}`, 'pedidos'))
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

export const suscribirPedidos = (mesaId, callback) => {
  const q = query(
    collection(db, 'mesas', `mesa_${mesaId}`, 'pedidos'),
    orderBy('created_at', 'asc')
  )
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  })
}

export const pedirCuenta = async (mesaId, metodoPago, propina, abonaCon = null) => {
  await updateDoc(getMesaRef(mesaId), {
    estado: 'esperando_cuenta',
    metodo_pago: metodoPago,
    propina: propina || 0,
    abona_con: abonaCon,
  })
}

// Liberar mesa completamente - borra subcolecciones
export const liberarMesa = async (mesaId) => {
  const batch = writeBatch(db)
  const cols = ['pedidos', 'mensajes', 'llamadas']
  for (const col of cols) {
    const snap = await getDocs(collection(db, 'mesas', `mesa_${mesaId}`, col))
    snap.docs.forEach(d => batch.delete(d.ref))
  }
  batch.update(getMesaRef(mesaId), {
    estado: 'libre',
    clientes: [], dispositivos: [], carrito: [],
    carrito_bloqueado: false, total_acumulado: 0,
    propina: 0, metodo_pago: null, abona_con: null,
    hora_apertura: null, personas: 0,
  })
  await batch.commit()
}

export const suscribirCarta = (callback) => {
  return onSnapshot(collection(db, 'carta'), (snap) => {
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

export const enviarMensaje = async (mesaId, texto, autor) => {
  await addDoc(collection(db, 'mesas', `mesa_${mesaId}`, 'mensajes'), {
    texto, autor, created_at: serverTimestamp(),
  })
}

export const suscribirMensajes = (mesaId, callback) => {
  const q = query(
    collection(db, 'mesas', `mesa_${mesaId}`, 'mensajes'),
    orderBy('created_at', 'asc')
  )
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  })
}
