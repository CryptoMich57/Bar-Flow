// ============================================================
//  MENSAJES SIN LEER, POR MESA
//
//  El encargado escucha el chat de UNA mesa: la que tiene abierta. Si un
//  cliente de la mesa 7 escribe mientras el mira la 3, no se entera —el
//  sonido suena una vez y se pierde, y no queda ninguna marca—. Esto
//  lleva la cuenta de que mesas tienen algo sin leer para poder pintarlas.
//
//  La marca de "ya lo vi" se guarda en el navegador y no en Firestore: es
//  de esta persona en este dispositivo, no del local. Si el encargado
//  atiende desde la tablet de la barra y desde su celular, cada uno tiene
//  su propia marca, que es lo correcto.
// ============================================================

const casillero = (localId, quien) => `chat_visto:${localId}:${quien}`

export const leerVistos = (localId, quien) => {
  try {
    const crudo = localStorage.getItem(casillero(localId, quien))
    const datos = crudo ? JSON.parse(crudo) : null
    return datos && typeof datos === 'object' ? datos : {}
  } catch {
    // Modo privado o storage lleno: se degrada a "nada visto todavia".
    // Peor caso, se muestra un punto de mas; nunca se pierde un aviso.
    return {}
  }
}

export const guardarVistos = (localId, quien, vistos) => {
  try {
    localStorage.setItem(casillero(localId, quien), JSON.stringify(vistos))
  } catch { /* sin persistencia: la marca vive lo que dure la pestaña */ }
}

/**
 * Cuando llega un mensaje todavia sin confirmar por el servidor su
 * `created_at` viene vacio. Tomarlo como 0 lo dejaria por debajo de
 * cualquier marca de visto y el aviso no aparecería nunca; se asume que
 * es de recién.
 */
export const momentoDelMensaje = (mensaje) => {
  const t = mensaje?.created_at
  if (t?.toMillis) return t.toMillis()
  if (typeof t === 'number') return t
  return Date.now()
}

// Los mensajes escritos antes de que existiera el campo `rol` no lo tienen.
// Para esos vale la regla vieja: si el autor dice "Encargado", es del local.
export const rolDelMensaje = (mensaje) =>
  mensaje?.rol || (mensaje?.autor === 'Encargado' ? 'staff' : 'cliente')

// Un mensaje del propio lado nunca cuenta como pendiente: el encargado no
// tiene que enterarse de lo que acaba de escribir el.
export const hayPendiente = (ultimoMensaje, visto, rolPropio) => {
  if (!ultimoMensaje) return false
  if (rolDelMensaje(ultimoMensaje) === rolPropio) return false
  return momentoDelMensaje(ultimoMensaje) > (visto || 0)
}
