// ============================================================
//  LLAMADAS AL BACKEND CONFIABLE
//
//  Todo lo que decide plata o estados de una comanda vive en Cloud
//  Functions. Este archivo es el unico punto por donde la app las
//  llama, para no repetir la region ni el manejo de errores.
// ============================================================
import { getFunctions, httpsCallable } from 'firebase/functions'
import app from './config'

const funciones = getFunctions(app, 'southamerica-east1')

// Los errores de una callable llegan envueltos. Nos quedamos con el
// mensaje que escribio el backend, que esta pensado para leerse.
export const llamarBackend = async (nombre, datos = {}) => {
  try {
    const { data } = await httpsCallable(funciones, nombre)(datos)
    return data
  } catch (error) {
    const mensaje = error?.message || 'No se pudo completar la operacion.'
    const limpio = new Error(mensaje)
    limpio.code = error?.code
    throw limpio
  }
}
