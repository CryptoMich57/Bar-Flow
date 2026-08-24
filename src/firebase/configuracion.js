import { getDoc, setDoc, onSnapshot } from 'firebase/firestore'
import { refConfiguracion } from './rutas'

// Configuracion editable de CADA local. Vive en
// locales/{localId}/sistema/configuracion, asi que dos negocios nunca
// comparten datos de transferencia, mozos ni cantidad de mesas.

export const DEFAULTS_CONFIG = {
  transferencia: {
    titular: '',
    banco: '',
    cbu: '',
    alias: '',
  },
  mozos: [
    { id: 1, nombre: 'Mozo 1', mesas_asignadas: [] },
    { id: 2, nombre: 'Mozo 2', mesas_asignadas: [] },
    { id: 3, nombre: 'Mozo 3', mesas_asignadas: [] },
  ],
  mesas: { cantidad: 10 },
  // Las contrasenas no viven aca: el acceso del personal usa cuentas
  // de Firebase Authentication y los roles se leen de
  // locales/{localId}/empleados/{uid}.
}

export const suscribirConfiguracion = (localId, callback) => {
  return onSnapshot(refConfiguracion(localId), (snap) => {
    // Si no existe el documento, devolver defaults directamente
    callback(snap.exists() ? { ...DEFAULTS_CONFIG, ...snap.data() } : { ...DEFAULTS_CONFIG })
  })
}

export const guardarConfiguracion = async (localId, datos) => {
  await setDoc(refConfiguracion(localId), datos, { merge: true })
}

export const cargarConfiguracion = async (localId) => {
  const snap = await getDoc(refConfiguracion(localId))
  return snap.exists() ? { ...DEFAULTS_CONFIG, ...snap.data() } : { ...DEFAULTS_CONFIG }
}
