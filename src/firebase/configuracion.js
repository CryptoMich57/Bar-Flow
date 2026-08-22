import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore'
import { db } from './config'

const CONFIG_REF = doc(db, 'sistema', 'configuracion')

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
  // Las contrasenas ya no viven aca: el acceso del personal usa cuentas
  // de Firebase Authentication y los roles se leen de /usuarios/{uid}.
}

export const suscribirConfiguracion = (callback) => {
  return onSnapshot(CONFIG_REF, (snap) => {
    // Si no existe el documento, devolver defaults directamente
    callback(snap.exists() ? { ...DEFAULTS_CONFIG, ...snap.data() } : { ...DEFAULTS_CONFIG })
  })
}

export const guardarConfiguracion = async (datos) => {
  await setDoc(CONFIG_REF, datos, { merge: true })
}

export const cargarConfiguracion = async () => {
  const snap = await getDoc(CONFIG_REF)
  return snap.exists() ? { ...DEFAULTS_CONFIG, ...snap.data() } : { ...DEFAULTS_CONFIG }
}
