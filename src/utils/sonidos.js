// ── SONIDOS CON WEB AUDIO API ─────────────────────────────────────────────
let audioCtx = null
let audioActivado = false

// Quien quiera mostrar en pantalla si el sonido esta listo se anota aca.
const suscriptores = new Set()
const avisarEstado = () => suscriptores.forEach(fn => { try { fn(audioActivado) } catch {} })

export const alCambiarAudio = (cb) => {
  suscriptores.add(cb)
  cb(audioActivado)
  return () => suscriptores.delete(cb)
}

const getCtx = () => {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)()
  return audioCtx
}

const tono = (frecuencia, duracion = 0.3, volumen = 0.5, tipo = 'sine', delay = 0) => {
  if (!audioActivado) return
  try {
    const ctx = getCtx()
    if (ctx.state === 'suspended') ctx.resume()

    // Oscilador principal
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    // Compresor para que no distorsione al subir volumen
    const compressor = ctx.createDynamicsCompressor()
    compressor.threshold.setValueAtTime(-20, ctx.currentTime)
    compressor.knee.setValueAtTime(5, ctx.currentTime)
    compressor.ratio.setValueAtTime(8, ctx.currentTime)
    compressor.attack.setValueAtTime(0.002, ctx.currentTime)
    compressor.release.setValueAtTime(0.1, ctx.currentTime)

    osc.connect(gain)
    gain.connect(compressor)
    compressor.connect(ctx.destination)

    osc.type = tipo
    osc.frequency.setValueAtTime(frecuencia, ctx.currentTime + delay)
    gain.gain.setValueAtTime(0, ctx.currentTime + delay)
    gain.gain.linearRampToValueAtTime(volumen, ctx.currentTime + delay + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + duracion)
    osc.start(ctx.currentTime + delay)
    osc.stop(ctx.currentTime + delay + duracion + 0.05)
  } catch {}
}

// ── SONIDOS ────────────────────────────────────────────────────────────────

// 🆕 Nuevo pedido — dos bips ascendentes claros (cocina / encargado)
export const sonidoNuevoPedido = () => {
  tono(880,  0.2, 0.6, 'square', 0)
  tono(1100, 0.25, 0.6, 'square', 0.2)
}

// ✅ Pedido listo — tres notas ascendentes tipo timbre (mozo)
export const sonidoPedidoListo = () => {
  tono(880,  0.18, 0.55, 'sine', 0)
  tono(1100, 0.18, 0.55, 'sine', 0.18)
  tono(1320, 0.28, 0.6,  'sine', 0.36)
}

// ✋ Llamada al mozo — dos bips cortos tipo intercomunicador
export const sonidoLlamadaMozo = () => {
  tono(1200, 0.12, 0.65, 'square', 0)
  tono(1200, 0.12, 0.65, 'square', 0.2)
}

// 💬 Mensaje nuevo — ting agudo y limpio
export const sonidoMensaje = () => {
  tono(1568, 0.14, 0.7, 'triangle', 0)
  tono(1975, 0.3,  0.7, 'triangle', 0.14)
}

// 💳 Cliente pide cuenta — dos notas graves pero fuertes
export const sonidoCuenta = () => {
  tono(660, 0.25, 0.6, 'sine', 0)
  tono(880, 0.3,  0.6, 'sine', 0.25)
}

// ── ACTIVAR AUDIO ─────────────────────────────────────────────────────────
export const activarAudio = () => {
  try {
    const ctx = getCtx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0, ctx.currentTime)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.001)
    ctx.resume().then(() => { audioActivado = true; avisarEstado() })
  } catch {}
}

/**
 * Los navegadores no dejan sonar nada hasta que la persona toca la pantalla.
 * Hasta ahora habia que encontrar el boton 🔕 de la barra: el mozo que no lo
 * apretaba se perdia todos los avisos y —peor— no tenia forma de enterarse de
 * que se los estaba perdiendo.
 *
 * Cualquier gesto sirve para levantar el bloqueo del navegador, y para usar la
 * app hay que tocarla igual. Asi que se aprovecha el primero que llegue y el
 * boton queda solo como indicador.
 */
export const activarAudioAlPrimerGesto = () => {
  if (audioActivado) return () => {}
  const gestos = ['pointerdown', 'keydown', 'touchstart']
  const quitar = () => gestos.forEach(g => window.removeEventListener(g, alGesto))
  function alGesto() { activarAudio(); quitar() }
  gestos.forEach(g => window.addEventListener(g, alGesto, { passive: true }))
  return quitar
}

export const estaActivado = () => audioActivado