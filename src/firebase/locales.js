// ============================================================
//  LOCALES, EQUIPO E INVITACIONES
//
//  - registrarLocal: un bar nuevo se da de alta solo, con la cuenta
//    de Google de quien lo registra. Nadie de Hexa Group toca la
//    consola.
//  - Con Google no se le puede crear la cuenta a otra persona, asi
//    que el equipo se suma por INVITACION: el encargado anota el
//    email, y la persona queda dentro la primera vez que entra.
//  - Las consultas de plataforma (listarLocales) solo funcionan si
//    quien las hace es admin del SaaS; si no, las reglas las rechazan.
// ============================================================
import {
  getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  onSnapshot, serverTimestamp, writeBatch, query, orderBy,
} from 'firebase/firestore'
import { db } from './config'
import {
  refLocal, colLocales, refEmpleado, colEmpleados,
  refUsuario, refConfiguracion, refSuperadmin,
  colInvitaciones, refInvitacion, refInvitacionGlobal,
} from './rutas'
import { DEFAULTS_CONFIG } from './configuracion'

export const ROLES = ['encargado', 'cocina', 'mozo']

export const ETIQUETA_ROL = {
  encargado: 'Encargado',
  cocina:    'Cocina',
  mozo:      'Mozo',
}

// El email es la clave de la invitacion, asi que tiene que normalizarse
// siempre igual: en la ficha, en la busqueda y en las reglas.
export const normalizarEmail = (email) => (email || '').trim().toLowerCase()

// ── IDENTIFICADOR DEL LOCAL ──────────────────────────────────
// El localId va en la URL de los QR (/l/mi-bar/mesa/3), asi que
// tiene que ser corto, sin acentos y sin espacios.
export const generarLocalId = (nombre) =>
  (nombre || '')
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)

export const LOCAL_ID_VALIDO = /^[a-z0-9][a-z0-9-]{2,39}$/

// Nombres que no puede tomar un cliente porque son rutas de la app.
const RESERVADOS = ['admin', 'login', 'registro', 'mesa', 'api', 'app', 'www', 'hexa']

export const validarLocalId = (localId) => {
  if (!LOCAL_ID_VALIDO.test(localId)) {
    return 'Usa entre 3 y 40 caracteres: letras, numeros y guiones.'
  }
  if (RESERVADOS.includes(localId)) return 'Ese nombre esta reservado. Elegi otro.'
  return null
}

export const localIdDisponible = async (localId) => {
  const snap = await getDoc(refLocal(localId))
  return !snap.exists()
}

// ── ALTA DE UN NEGOCIO ───────────────────────────────────────
// La sesion de Google ya existe cuando se llama a esto. El orden
// importa: primero el local, despues la ficha de encargado. Las
// reglas dependen de que exista lo anterior.
export const registrarLocal = async ({ localId, nombreLocal, user }) => {
  const problema = validarLocalId(localId)
  if (problema) throw new Error(problema)
  if (!user) throw new Error('Hay que entrar con Google antes de crear el local.')
  if (!(await localIdDisponible(localId))) {
    throw new Error('Ya existe un local con ese identificador. Elegi otro.')
  }

  // El local nace en 'prueba'. Pasarlo a 'activo' o suspenderlo es
  // decision de la plataforma, y las reglas no dejan que el cliente
  // se cambie el estado a si mismo.
  await setDoc(refLocal(localId), {
    nombre:     nombreLocal.trim(),
    slogan:     '',
    logo:       '',
    owner_uid:  user.uid,
    estado:     'prueba',
    plan:       'prueba',
    creado_en:  serverTimestamp(),
  })

  await setDoc(refEmpleado(localId, user.uid), {
    nombre:     user.displayName || nombreLocal.trim(),
    email:      normalizarEmail(user.email),
    rol:        'encargado',
    activo:     true,
    creado_en:  serverTimestamp(),
  })

  await setDoc(refUsuario(user.uid), { local_id: localId, rol: 'encargado' })
  await setDoc(refConfiguracion(localId), DEFAULTS_CONFIG)

  return { localId, uid: user.uid }
}

// ── INVITACIONES ─────────────────────────────────────────────
// Se escriben dos documentos en un solo batch:
//   locales/{localId}/invitaciones/{email}  la lista el encargado
//   invitaciones/{email}                    la lee la persona invitada,
//                                           que todavia no sabe a que
//                                           local la invitaron
export const invitarEmpleado = async ({ localId, email, nombre, rol }) => {
  if (!ROLES.includes(rol)) throw new Error('Rol invalido.')
  const mail = normalizarEmail(email)
  if (!mail.includes('@')) throw new Error('Ese email no es valido.')

  // Aca antes se leia invitaciones/{email} para ver si la persona ya estaba
  // invitada en otro local. Esa lectura las reglas se la niegan al encargado
  // —el indice global solo lo lee su propio dueno— y el alta moria con
  // permission-denied antes de escribir nada. Ahora el chequeo lo hace la
  // regla al escribir: si el puntero ya pertenece a otro local, rechaza.
  const batch = writeBatch(db)
  batch.set(refInvitacion(localId, mail), {
    email:     mail,
    nombre:    (nombre || '').trim(),
    rol,
    creada_en: serverTimestamp(),
  })
  batch.set(refInvitacionGlobal(mail), { local_id: localId, rol })

  try {
    await batch.commit()
  } catch (err) {
    if (err?.code === 'permission-denied') {
      throw new Error('Esa persona ya tiene una invitacion pendiente en otro local.')
    }
    throw err
  }
}

export const suscribirInvitaciones = (localId, callback) => {
  return onSnapshot(
    query(colInvitaciones(localId), orderBy('creada_en', 'asc')),
    (snap) => callback(snap.docs.map(d => ({ email: d.id, ...d.data() }))),
    () => callback([]),
  )
}

export const cancelarInvitacion = async (localId, email) => {
  const mail = normalizarEmail(email)
  const batch = writeBatch(db)
  batch.delete(refInvitacion(localId, mail))
  batch.delete(refInvitacionGlobal(mail))
  await batch.commit()
}

// ¿A esta persona la invito alguien? Se consulta despues de entrar
// con Google, cuando todavia no sabemos si pertenece a algun local.
export const buscarInvitacion = async (email) => {
  const mail = normalizarEmail(email)
  if (!mail) return null
  try {
    const snap = await getDoc(refInvitacionGlobal(mail))
    return snap.exists() ? { email: mail, ...snap.data() } : null
  } catch {
    return null
  }
}

// Canjea la invitacion: crea la ficha de empleado y borra la invitacion.
// Devuelve el local al que quedo asociada la persona.
export const aceptarInvitacion = async (user) => {
  const mail = normalizarEmail(user?.email)
  const puntero = await buscarInvitacion(mail)
  if (!puntero) return null

  const localId = puntero.local_id
  const detalle = await getDoc(refInvitacion(localId, mail))
  const datos = detalle.exists() ? detalle.data() : { rol: puntero.rol, nombre: '' }

  await setDoc(refEmpleado(localId, user.uid), {
    nombre:    datos.nombre || user.displayName || mail,
    email:     mail,
    rol:       datos.rol,
    activo:    true,
    creado_en: serverTimestamp(),
  })
  await setDoc(refUsuario(user.uid), { local_id: localId, rol: datos.rol })

  // Ya no hace falta: la persona esta dentro.
  const batch = writeBatch(db)
  batch.delete(refInvitacion(localId, mail))
  batch.delete(refInvitacionGlobal(mail))
  await batch.commit()

  return { localId, rol: datos.rol }
}

// ── EQUIPO ───────────────────────────────────────────────────
export const suscribirEmpleados = (localId, callback) => {
  return onSnapshot(
    query(colEmpleados(localId), orderBy('creado_en', 'asc')),
    (snap) => callback(snap.docs.map(d => ({ uid: d.id, ...d.data() }))),
    () => callback([]),
  )
}

export const cambiarRolEmpleado = async (localId, uid, rol) => {
  if (!ROLES.includes(rol)) throw new Error('Rol invalido.')
  await updateDoc(refEmpleado(localId, uid), { rol })
  await updateDoc(refUsuario(uid), { rol })
}

export const activarEmpleado = async (localId, uid, activo) => {
  await updateDoc(refEmpleado(localId, uid), { activo })
}

// Quita a la persona del local. Su cuenta de Google no se toca —no es
// nuestra—, pero sin ficha no puede entrar a ninguna vista ni leer un
// solo dato del negocio.
export const quitarEmpleado = async (localId, uid) => {
  const batch = writeBatch(db)
  batch.delete(refEmpleado(localId, uid))
  batch.delete(refUsuario(uid))
  await batch.commit()
}

// ── DATOS DEL LOCAL ──────────────────────────────────────────
// El segundo callback importa: si las reglas rechazan la lectura (o no hay
// red), sin el la suscripcion se queda muda y la pantalla espera para
// siempre. Preferimos avisar que el local no se pudo cargar.
export const suscribirLocal = (localId, callback) => {
  return onSnapshot(
    refLocal(localId),
    (snap) => callback(snap.exists() ? { id: snap.id, ...snap.data() } : null),
    () => callback(null),
  )
}

export const leerLocal = async (localId) => {
  const snap = await getDoc(refLocal(localId))
  return snap.exists() ? { id: snap.id, ...snap.data() } : null
}

export const guardarDatosLocal = async (localId, datos) => {
  await updateDoc(refLocal(localId), datos)
}

// ── PLATAFORMA (solo el admin del SaaS) ──────────────────────
export const esAdminPlataforma = async (uid) => {
  if (!uid) return false
  try {
    const snap = await getDoc(refSuperadmin(uid))
    return snap.exists()
  } catch {
    return false
  }
}

export const listarLocales = async () => {
  const snap = await getDocs(colLocales())
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export const cambiarEstadoLocal = async (localId, estado) => {
  await updateDoc(refLocal(localId), { estado })
}
