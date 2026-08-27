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
  mesas: { cantidad: 10 },
  // Aca vivia una lista de mozos con sus nombres y mesas. La usaba la vista
  // del mozo para preguntar "¿quien sos?" y dejar elegir, con lo cual
  // cualquiera podia operar y quedar registrado como otro. Ahora el nombre y
  // las mesas de cada persona viven en su ficha de empleado, atada al uid con
  // el que entro. Los locales viejos pueden conservar el campo 'mozos' en la
  // base: ya no lo lee nadie.
  // Las contrasenas no viven aca: el acceso del personal usa cuentas
  // de Firebase Authentication y los roles se leen de
  // locales/{localId}/empleados/{uid}.
}

export const suscribirConfiguracion = (localId, callback, onError) => {
  return onSnapshot(
    refConfiguracion(localId),
    // Si no existe el documento, devolver defaults directamente
    (snap) => callback(snap.exists() ? { ...DEFAULTS_CONFIG, ...snap.data() } : { ...DEFAULTS_CONFIG }),
    // Sin esto, una lectura rechazada dejaba la vista con la cantidad de
    // mesas por defecto —10— como si esa fuera la configuracion real del
    // local. Se veia igual que un local bien cargado.
    (error) => onError?.(error),
  )
}

export const guardarConfiguracion = async (localId, datos) => {
  await setDoc(refConfiguracion(localId), datos, { merge: true })
}

export const cargarConfiguracion = async (localId) => {
  const snap = await getDoc(refConfiguracion(localId))
  return snap.exists() ? { ...DEFAULTS_CONFIG, ...snap.data() } : { ...DEFAULTS_CONFIG }
}
