// ============================================================
//  SESIONES Y ROLES
//
//  - El comensal entra sin registrarse: Firebase le da una identidad
//    anonima para que las reglas puedan exigir sesion sin pedirle
//    nada a la persona que se sento en la mesa.
//  - El personal entra con su cuenta de Google. No hay contrasenas
//    en ningun lado: nadie las olvida, nadie las anota en un papel
//    al lado de la caja, y no tenemos que guardarlas.
//  - El rol NO es una propiedad de la cuenta: vive en
//    locales/{localId}/empleados/{uid}. La misma cuenta puede ser
//    encargado en un local y no existir en ningun otro.
//  - El admin de la plataforma esta en superadmins/{uid} y solo se
//    da de alta desde la consola de Firebase.
// ============================================================
import {
  GoogleAuthProvider,
  signInAnonymously,
  signInWithPopup,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  signOut,
} from 'firebase/auth'
import { getDoc } from 'firebase/firestore'
import { auth } from './config'
import { refEmpleado, refUsuario, refSuperadmin } from './rutas'

export const ROLES = ['encargado', 'cocina', 'mozo']

// Evita disparar dos logins anonimos en paralelo al montar varias vistas.
let promesaAnonima = null

export const asegurarSesionAnonima = () => {
  if (auth.currentUser) return Promise.resolve(auth.currentUser)
  if (!promesaAnonima) {
    promesaAnonima = signInAnonymously(auth)
      .then(cred => cred.user)
      .catch(err => { promesaAnonima = null; throw err })
  }
  return promesaAnonima
}

// Entrada del personal y de quien registra un bar nuevo. Una sola
// puerta para todos: no hay pantalla de "crear cuenta" separada.
export const entrarConGoogle = async () => {
  // La sesion queda guardada en el dispositivo: el equipo del local
  // entra una vez y no vuelve a ver ninguna pantalla de acceso.
  await setPersistence(auth, browserLocalPersistence)
  const proveedor = new GoogleAuthProvider()
  // Que siempre pregunte con que cuenta entrar: en el celular del bar
  // suele haber varias, y la primera vez conviene elegir a conciencia.
  proveedor.setCustomParameters({ prompt: 'select_account' })
  const cred = await signInWithPopup(auth, proveedor)
  return cred.user
}

export const cerrarSesion = async () => {
  promesaAnonima = null
  await signOut(auth)
}

// El rol que vale para los permisos: el que esta en ESTE local.
// Si la persona no trabaja aca, no hay ficha y no hay rol. Punto.
export const leerRolEnLocal = async (localId, uid) => {
  if (!localId || !uid) return null
  try {
    const snap = await getDoc(refEmpleado(localId, uid))
    if (!snap.exists()) return null
    const datos = snap.data()
    if (datos.activo === false) return null
    return datos.rol || null
  } catch {
    return null
  }
}

// Atajo de navegacion: a que local pertenece esta cuenta. Sirve para
// mandar a la persona a su local despues del login, no para dar
// permisos.
export const leerPertenencia = async (uid) => {
  if (!uid) return null
  try {
    const snap = await getDoc(refUsuario(uid))
    return snap.exists() ? snap.data() : null
  } catch {
    return null
  }
}

export const leerEsAdminPlataforma = async (uid) => {
  if (!uid) return false
  try {
    const snap = await getDoc(refSuperadmin(uid))
    return snap.exists()
  } catch {
    return false
  }
}

// Observa la sesion. Devuelve la funcion para desuscribirse.
// No resuelve roles: eso depende del local que se este mirando y lo
// hace useAcceso, que si conoce la URL.
export const suscribirSesion = (callback) => {
  return onAuthStateChanged(auth, (user) => {
    callback({ user: user || null, cargando: false })
  })
}

// Mensajes de error de Firebase traducidos a algo que se pueda leer.
export const mensajeDeError = (codigo) => {
  switch (codigo) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':  return 'Cerraste la ventana de Google antes de terminar.'
    case 'auth/popup-blocked':            return 'El navegador bloqueo la ventana de Google. Permitila y volve a intentar.'
    // Pasa cuando ese email ya tiene una cuenta creada con contrasena, de
    // antes de que el acceso fuera solo con Google. No hay pantalla para
    // vincularlas —agregarla seria devolver las contrasenas por la ventana—,
    // asi que se resuelve una vez desde la consola.
    case 'auth/account-exists-with-different-credential':
                                          return 'Ese email ya tiene una cuenta creada con contrasena. Hay que borrarla desde Firebase Authentication y volver a entrar con Google.'
    case 'auth/user-disabled':            return 'Esta cuenta esta deshabilitada.'
    case 'auth/too-many-requests':        return 'Demasiados intentos. Espera unos minutos.'
    case 'auth/network-request-failed':   return 'Sin conexion. Revisa internet.'
    case 'auth/unauthorized-domain':      return 'Este dominio no esta autorizado en Firebase Authentication.'
    case 'auth/operation-not-allowed':    return 'El acceso con Google no esta habilitado en Firebase.'
    default:                              return 'No se pudo completar la operacion.'
  }
}
