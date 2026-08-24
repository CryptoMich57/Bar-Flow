// ============================================================
//  RUTAS DE FIRESTORE — MULTI-LOCAL
//
//  Todo lo que pertenece a un negocio cuelga de locales/{localId}.
//  Ningun archivo de la app arma rutas a mano: todas salen de aca.
//  Asi es imposible que una consulta se escape a los datos de otro
//  local por un typo, y las reglas pueden confiar en que el localId
//  siempre viaja en el path.
// ============================================================
import { collection, doc } from 'firebase/firestore'
import { db } from './config'

// Lanza si falta el local: preferimos un error claro en desarrollo
// antes que una consulta silenciosa a la coleccion equivocada.
const exigirLocal = (localId) => {
  if (!localId) throw new Error('Falta el localId: no se puede armar la ruta.')
  return localId
}

// ── EL LOCAL ─────────────────────────────────────────────────
export const refLocal      = (localId) => doc(db, 'locales', exigirLocal(localId))
export const colLocales    = () => collection(db, 'locales')

// ── CARTA ────────────────────────────────────────────────────
export const colCarta      = (localId) => collection(refLocal(localId), 'carta')
export const refItemCarta  = (localId, itemId) => doc(refLocal(localId), 'carta', itemId)

// ── MESAS ────────────────────────────────────────────────────
export const idMesa        = (numero) => `mesa_${numero}`
export const colMesas      = (localId) => collection(refLocal(localId), 'mesas')
export const refMesa       = (localId, numero) => doc(refLocal(localId), 'mesas', idMesa(numero))

export const colPedidos    = (localId, numero) => collection(refMesa(localId, numero), 'pedidos')
export const refPedido     = (localId, numero, pedidoId) => doc(refMesa(localId, numero), 'pedidos', pedidoId)

export const colMensajes   = (localId, numero) => collection(refMesa(localId, numero), 'mensajes')
export const colLlamadas   = (localId, numero) => collection(refMesa(localId, numero), 'llamadas')
export const refLlamada    = (localId, numero, llamadaId) => doc(refMesa(localId, numero), 'llamadas', llamadaId)

// ── HISTORIAL / CAJA ─────────────────────────────────────────
export const colHistorial  = (localId) => collection(refLocal(localId), 'historial')
export const refHistorial  = (localId, docId) => doc(refLocal(localId), 'historial', docId)

// ── CONFIGURACION DEL LOCAL ──────────────────────────────────
export const refConfiguracion = (localId) => doc(refLocal(localId), 'sistema', 'configuracion')

// ── EMPLEADOS (roles que miran las reglas) ───────────────────
export const colEmpleados  = (localId) => collection(refLocal(localId), 'empleados')
export const refEmpleado   = (localId, uid) => doc(refLocal(localId), 'empleados', uid)

// ── INVITACIONES ─────────────────────────────────────────────
// La del local la lista el encargado; la global la lee la persona
// invitada, que todavia no sabe a que local pertenece.
export const colInvitaciones = (localId) => collection(refLocal(localId), 'invitaciones')
export const refInvitacion   = (localId, email) => doc(refLocal(localId), 'invitaciones', email)
export const refInvitacionGlobal = (email) => doc(db, 'invitaciones', email)

// ── INDICE GLOBAL uid -> local ───────────────────────────────
export const refUsuario    = (uid) => doc(db, 'usuarios', uid)

// ── SUPERADMIN (dueno del SaaS) ──────────────────────────────
export const refSuperadmin = (uid) => doc(db, 'superadmins', uid)
