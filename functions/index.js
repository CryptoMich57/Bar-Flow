// ============================================================
//  BACKEND CONFIABLE DE BARFLOW
//
//  Acá vive lo único que el navegador no puede decidir por sí mismo.
//  Todo lo demás sigue yendo directo a Firestore contra las reglas: no
//  se pone en el servidor lo que las reglas ya resuelven bien.
//
//  Por ahora: la CAPACIDAD DE MESA.
//
//  El comensal entra con una sesión anónima que no dice nada sobre
//  dónde está sentado. Con eso, cualquiera que supiera el identificador
//  de un local podía leer y escribir TODAS sus mesas: ver la cuenta de
//  la mesa de al lado, agregarle un pedido, o vaciarle el carrito.
//
//  La solución no es esconder mejor el número de mesa —está en el QR, a
//  la vista— sino que el permiso deje de ser "tengo sesión" y pase a ser
//  "el servidor me dio permiso para ESTA mesa, y vence". Eso no lo puede
//  falsificar el cliente: el custom claim lo firma Firebase.
// ============================================================
import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { setGlobalOptions } from 'firebase-functions/v2'

initializeApp()
setGlobalOptions({ region: 'southamerica-east1', maxInstances: 10 })

const db = getFirestore()

// Cuánto dura la capacidad. Una comida larga entra cómoda; una sesión
// olvidada en un celular ajeno no sirve al día siguiente.
const HORAS_DE_VIGENCIA = 6

const MESAS_POR_DEFECTO = 10

/**
 * Le da a quien está sentado permiso para operar UNA mesa concreta.
 *
 * Se llama apenas el comensal abre el QR, antes de que toque nada. El
 * permiso viaja como custom claim y las reglas lo comparan contra el
 * path que se está escribiendo.
 */
export const abrirMesa = onCall(async (req) => {
  if (!req.auth) {
    throw new HttpsError('unauthenticated', 'Hace falta una sesion.')
  }

  const localId = String(req.data?.localId || '').trim()
  const numeroMesa = String(req.data?.mesaId || '').trim()

  if (!localId || !numeroMesa) {
    throw new HttpsError('invalid-argument', 'Faltan el local y la mesa.')
  }
  if (!/^[0-9]+$/.test(numeroMesa)) {
    throw new HttpsError('invalid-argument', 'El numero de mesa no es valido.')
  }

  // El local tiene que existir y estar atendiendo. Un local suspendido no
  // reparte capacidades: es la misma frontera que aplican las reglas.
  const local = await db.doc(`locales/${localId}`).get()
  if (!local.exists) {
    throw new HttpsError('not-found', 'Ese local no existe.')
  }
  const estado = local.data()?.estado
  if (estado !== 'activo' && estado !== 'prueba') {
    throw new HttpsError('failed-precondition', 'Ese local no esta recibiendo pedidos.')
  }

  // Y la mesa tiene que ser una de las que el local declaró. Sin esto,
  // alguien podría pedir capacidad para la mesa 9999 y crear basura.
  const config = await db.doc(`locales/${localId}/sistema/configuracion`).get()
  const cantidad = config.data()?.mesas?.cantidad || MESAS_POR_DEFECTO
  const numero = Number(numeroMesa)
  if (numero < 1 || numero > cantidad) {
    throw new HttpsError('out-of-range', `Ese local tiene ${cantidad} mesas.`)
  }

  const vence = Date.now() + HORAS_DE_VIGENCIA * 60 * 60 * 1000

  // Se pisan los claims anteriores a propósito: una sesión vale para una
  // mesa a la vez. Si la persona se cambia de mesa, vuelve a pedir y la
  // anterior deja de servirle en el mismo acto.
  await getAuth().setCustomUserClaims(req.auth.uid, {
    mesa: { l: localId, m: `mesa_${numero}`, exp: vence },
  })

  return { localId, mesaId: `mesa_${numero}`, vence }
})
