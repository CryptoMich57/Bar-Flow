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
  getDoc, getDocs, updateDoc,
  onSnapshot, serverTimestamp, writeBatch, query, orderBy,
} from 'firebase/firestore'
import { db } from './config'
import {
  refLocal, colLocales, refEmpleado, colEmpleados,
  refUsuario, refSuperadmin,
  colInvitaciones, refInvitacion, refInvitacionGlobal,
} from './rutas'
import { llamarBackend } from './funciones'

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
// Escribia cuatro documentos sueltos desde el navegador y un corte en el
// medio dejaba un bar a medio nacer: sin encargado, o sin configuracion.
// Peor todavia, quien se registro no podia entrar NI volver a registrarse,
// porque el localId ya figuraba tomado.
//
// Ahora lo arma el backend en un solo batch. Tampoco alcanzaba con hacer
// el batch desde aca: la regla que deja crear la ficha de encargado
// pregunta por el dueno del local, y dentro de un batch esa lectura no ve
// el local que el mismo batch esta creando.
export const registrarLocal = async ({ localId, nombreLocal, user }) => {
  const problema = validarLocalId(localId)
  if (problema) throw new Error(problema)
  if (!user) throw new Error('Hay que entrar con Google antes de crear el local.')

  await llamarBackend('registrarLocal', {
    localId,
    nombre: nombreLocal.trim(),
    nombreEncargado: user.displayName || '',
  })

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
//
// Las cuatro escrituras van en un solo batch (AUD-005). Antes eran cuatro
// pasos: un corte despues del segundo dejaba a la persona dentro con la
// invitacion todavia en pie, y un corte antes la dejaba afuera con la
// invitacion consumida a medias.
//
// A diferencia del alta de local, aca el batch SI alcanza: la regla que
// autoriza la ficha pregunta por la invitacion, y las reglas se evaluan
// contra el estado anterior al batch, asi que todavia la ve aunque el
// mismo batch la este borrando.
export const aceptarInvitacion = async (user) => {
  const mail = normalizarEmail(user?.email)
  const puntero = await buscarInvitacion(mail)
  if (!puntero) return null

  const localId = puntero.local_id
  const detalle = await getDoc(refInvitacion(localId, mail))
  const datos = detalle.exists() ? detalle.data() : { rol: puntero.rol, nombre: '' }

  const batch = writeBatch(db)
  batch.set(refEmpleado(localId, user.uid), {
    nombre:    datos.nombre || user.displayName || mail,
    email:     mail,
    rol:       datos.rol,
    activo:    true,
    creado_en: serverTimestamp(),
  })
  batch.set(refUsuario(user.uid), { local_id: localId, rol: datos.rol })
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

// Que mesas atiende cada persona. Vive en su ficha —no en una lista suelta
// de configuracion— para que la identidad operativa y las mesas sean el
// mismo dato: el mozo no elige quien es ni que mesas toma.
// Una lista vacia significa "todo el salon", que es lo normal en un bar
// chico donde no hay sectores.
export const asignarMesas = async (localId, uid, mesas) => {
  const limpias = [...new Set((mesas || []).map(String))]
    .sort((a, b) => Number(a) - Number(b))
  await updateDoc(refEmpleado(localId, uid), { mesas_asignadas: limpias })
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
// siempre.
//
// Pero devolver `null` y nada mas tampoco alcanzaba: "este local no
// existe" y "no lo pude leer" terminaban en la misma pantalla, y son
// cosas muy distintas. A la primera no hay nada que hacerle —el QR esta
// mal—; la segunda se arregla reintentando. Ahora el error sube.
export const suscribirLocal = (localId, callback, onError) => {
  return onSnapshot(
    refLocal(localId),
    (snap) => callback(snap.exists() ? { id: snap.id, ...snap.data() } : null),
    (error) => { onError?.(error); callback(null) },
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
