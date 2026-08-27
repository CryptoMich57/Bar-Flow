// ============================================================
//  CONSULTAS AL HISTORIAL (LA CAJA DEL LOCAL)
//
//  Las tres vistas que lo miran —estadísticas del día, historial del
//  encargado y la cocina— hacían lo mismo: `getDocs` de la colección
//  entera y filtrar por fecha en JavaScript. Funciona con un bar de
//  prueba y es carísimo con uno de verdad: un local que cierra 40 mesas
//  por día llega a 15.000 documentos en un año, y los descargaba TODOS
//  cada vez que alguien abría "Estadísticas" para ver la caja de hoy.
//
//  Firestore cobra por documento leído, así que el filtro tiene que
//  viajar a la consulta y no quedarse en el navegador.
//
//  El rango va sobre `fecha_hora_cierre`, que es el mismo campo del
//  `orderBy`: eso lo deja como consulta de un solo campo y no hace falta
//  crear ningún índice compuesto.
// ============================================================
import { getDocs, query, orderBy, where, limit, writeBatch, Timestamp } from 'firebase/firestore'
import { db } from './config'
import { colHistorial, refHistorial } from './rutas'

// Tope de seguridad para cuando no hay filtro de fechas. Nadie mira mil
// cierres de corrido, y sin tope una consulta sin filtro vuelve a ser la
// descarga completa de antes.
export const TOPE_HISTORIAL = 300

const comienzoDelDia = (fecha) => {
  const d = new Date(fecha)
  d.setHours(0, 0, 0, 0)
  return d
}

const finDelDia = (fecha) => {
  const d = new Date(fecha)
  d.setHours(23, 59, 59, 999)
  return d
}

const aFilas = (snap) => snap.docs.map(d => ({ id: d.id, ...d.data() }))

/**
 * Cierres entre dos fechas (ambas opcionales, en formato de <input date>).
 * Sin fechas devuelve los últimos `TOPE_HISTORIAL`.
 */
export const buscarCierres = async (localId, { desde, hasta, tope = TOPE_HISTORIAL } = {}) => {
  const condiciones = []
  if (desde) condiciones.push(where('fecha_hora_cierre', '>=', Timestamp.fromDate(comienzoDelDia(desde))))
  if (hasta) condiciones.push(where('fecha_hora_cierre', '<=', Timestamp.fromDate(finDelDia(hasta))))

  const snap = await getDocs(query(
    colHistorial(localId),
    ...condiciones,
    orderBy('fecha_hora_cierre', 'desc'),
    limit(tope),
  ))
  return aFilas(snap)
}

// Los cierres de hoy. Es lo que miran las estadísticas y la cocina.
export const cierresDeHoy = async (localId) => {
  const snap = await getDocs(query(
    colHistorial(localId),
    where('fecha_hora_cierre', '>=', Timestamp.fromDate(comienzoDelDia(new Date()))),
    orderBy('fecha_hora_cierre', 'desc'),
  ))
  return aFilas(snap)
}

/**
 * Borra los cierres que se le pasen, de a lotes.
 *
 * Un batch de Firestore admite 500 escrituras. Borrar el historial de un
 * año entero de una sola vez fallaba, y el mensaje de error no decía por
 * qué: quedaba como "el botón no anda".
 */
const LOTE = 400

export const borrarCierres = async (localId, ids) => {
  for (let i = 0; i < ids.length; i += LOTE) {
    const batch = writeBatch(db)
    for (const id of ids.slice(i, i + LOTE)) batch.delete(refHistorial(localId, id))
    await batch.commit()
  }
}
