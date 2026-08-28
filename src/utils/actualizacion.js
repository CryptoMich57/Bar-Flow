// ============================================================
//  VERSIONES: QUE NADIE SE QUEDE CON LA APP VIEJA
//
//  La app es una PWA: el service worker guarda una copia y la sirve
//  desde el teléfono. Eso es lo que la hace rápida y lo que la deja
//  andar con mala señal, pero tiene un costo: una pestaña que quedó
//  abierta sigue corriendo el código con el que se abrió.
//
//  En un bar eso no es un detalle. La tablet de la barra se abre a la
//  mañana y no se cierra hasta la noche; el celular del mozo, igual.
//  Después de un despliegue pueden pasar horas sin que ninguno se entere.
//
//  Y no es solo "ven la pantalla vieja". Pasó de verdad: se desplegaron
//  reglas nuevas —que dejaron de permitir que el navegador escriba en la
//  caja— y los dispositivos que seguían con la versión anterior
//  intentaban escribir igual. Resultado: "Missing or insufficient
//  permissions" al cobrar una mesa, sin ninguna pista de que el problema
//  era la versión.
//
//  Por eso el aviso es explícito y no automático: recargar sola la
//  pantalla mientras alguien está cobrando es peor que esperar. Se avisa,
//  y se aplica solo cuando nadie está mirando —la pestaña en segundo
//  plano— o cuando la persona toca "Actualizar".
// ============================================================
import { registerSW } from 'virtual:pwa-register'

// Cada cuánto se le pregunta al servidor si hay algo nuevo. Es un pedido
// mínimo, y cinco minutos es suficiente para que un despliegue llegue
// dentro del mismo turno.
const CADA_CINCO_MINUTOS = 5 * 60 * 1000

const suscriptores = new Set()
let hayVersionNueva = false
let aplicar = null

const avisar = () => suscriptores.forEach(fn => { try { fn(hayVersionNueva) } catch { /* una vista rota no frena a las otras */ } })

export const alHaberVersionNueva = (cb) => {
  suscriptores.add(cb)
  cb(hayVersionNueva)
  return () => suscriptores.delete(cb)
}

// Aplica la versión nueva: activa el service worker que estaba esperando
// y recarga. Se pierde lo que no esté guardado, que es justamente por lo
// que no se hace solo.
export const aplicarVersionNueva = () => { aplicar?.(true) }

export const vigilarVersiones = () => {
  aplicar = registerSW({
    immediate: true,

    onNeedRefresh() {
      hayVersionNueva = true
      avisar()
    },

    onRegisteredSW(_url, registro) {
      if (!registro) return
      setInterval(() => {
        // Sin red no tiene sentido preguntar: solo llenaría la consola de
        // errores cada cinco minutos.
        if (navigator.onLine !== false) registro.update()
      }, CADA_CINCO_MINUTOS)
    },
  })

  // Si la pestaña se va a segundo plano y hay una versión esperando, se
  // aplica ahí: nadie está usando la pantalla en ese momento, así que la
  // recarga no interrumpe nada. Es lo que resuelve la tablet que queda
  // abierta todo el turno sin que nadie la toque.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && hayVersionNueva) aplicarVersionNueva()
  })
}
