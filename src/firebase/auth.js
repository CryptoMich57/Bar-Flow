// ============================================================
//  SESIONES Y ROLES
//  - El cliente de la mesa entra sin registrarse: Firebase le da una
//    identidad anonima para que las reglas puedan exigir sesion sin
//    pedirle absolutamente nada al comensal.
//  - El personal (encargado, cocina, mozo) usa cuentas reales de
//    Firebase Authentication. El rol vive en /usuarios/{uid}.rol y es
//    lo unico que las reglas de Firestore miran para dar permisos.
// ============================================================
import {
  signInAnonymously,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  signOut,
} from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from './config'

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

export const iniciarSesionPersonal = async (email, password) => {
  // La sesion queda guardada en el dispositivo: el equipo del local
  // se loguea una vez y no vuelve a pedir la clave.
  await setPersistence(auth, browserLocalPersistence)
  const cred = await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password)
  return cred.user
}

export const cerrarSesion = async () => {
  promesaAnonima = null
  await signOut(auth)
}

export const leerRol = async (uid) => {
  const snap = await getDoc(doc(db, 'usuarios', uid))
  return snap.exists() ? (snap.data().rol || null) : null
}

// Observa la sesion y resuelve el rol. Devuelve la funcion para desuscribirse.
export const suscribirSesion = (callback) => {
  return onAuthStateChanged(auth, async (user) => {
    if (!user) {
      callback({ user: null, rol: null, cargando: false })
      return
    }
    if (user.isAnonymous) {
      callback({ user, rol: 'cliente', cargando: false })
      return
    }
    let rol = null
    try {
      rol = await leerRol(user.uid)
    } catch {
      rol = null
    }
    callback({ user, rol, cargando: false })
  })
}

// Mensajes de error de Firebase traducidos a algo que se pueda leer.
export const mensajeDeError = (codigo) => {
  switch (codigo) {
    case 'auth/invalid-email':        return 'Ese email no es valido.'
    case 'auth/user-disabled':        return 'Esta cuenta esta deshabilitada.'
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':   return 'Email o contrasena incorrectos.'
    case 'auth/too-many-requests':    return 'Demasiados intentos. Espera unos minutos.'
    case 'auth/network-request-failed': return 'Sin conexion. Revisa internet.'
    default:                          return 'No se pudo iniciar sesion.'
  }
}
