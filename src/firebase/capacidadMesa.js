// ============================================================
//  CAPACIDAD DE MESA
//
//  El comensal entra con una sesion anonima que no dice donde esta
//  sentado. Antes de tocar la mesa le pide al backend permiso para ESA
//  mesa, que llega como custom claim firmado por Firebase y con
//  vencimiento. Las reglas lo comparan contra el path que se escribe.
//
//  Detalle que hay que respetar: los custom claims NO aparecen en el
//  token que el navegador ya tiene. Hay que forzar el refresco con
//  getIdToken(true) despues de que la funcion responde; si no, la
//  primera escritura se rechaza aunque el permiso ya exista del lado
//  del servidor.
// ============================================================
import { getFunctions, httpsCallable } from 'firebase/functions'
import app, { auth } from './config'

const funciones = getFunctions(app, 'southamerica-east1')

// Evita pedir la misma capacidad dos veces cuando varias vistas montan
// a la vez. La clave incluye el uid: si la sesion cambia, se vuelve a pedir.
let enCurso = null
let ultima = null

const clave = (uid, localId, mesaId) => `${uid}|${localId}|${mesaId}`

export const abrirSesionDeMesa = async (localId, mesaId) => {
  const user = auth.currentUser
  if (!user) throw new Error('Hace falta una sesion antes de abrir la mesa.')

  const k = clave(user.uid, localId, mesaId)

  // Si ya la tenemos y le queda margen, no molestamos al backend. El
  // margen evita el caso feo de escribir justo cuando vence.
  if (ultima?.k === k && ultima.vence - Date.now() > 5 * 60 * 1000) {
    return ultima.datos
  }
  if (enCurso?.k === k) return enCurso.promesa

  const promesa = (async () => {
    const llamar = httpsCallable(funciones, 'abrirMesa')
    const { data } = await llamar({ localId, mesaId: String(mesaId) })

    // Sin esto el claim existe en el servidor pero no en el token que
    // usa el SDK para escribir, y las reglas rechazan igual.
    await user.getIdToken(true)

    ultima = { k, vence: data.vence, datos: data }
    return data
  })()

  enCurso = { k, promesa }
  try {
    return await promesa
  } finally {
    if (enCurso?.k === k) enCurso = null
  }
}

// Al cerrar sesion o cambiar de mesa conviene olvidar lo cacheado.
export const olvidarCapacidad = () => { enCurso = null; ultima = null }
