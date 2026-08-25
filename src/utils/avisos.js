// ============================================================
//  DECIDIR QUE MERECE UN AVISO
//
//  Todas las vistas del personal escuchan Firestore y avisan —sonido y
//  banner— cuando aparece algo nuevo. Lo que ya estaba al abrir la
//  pantalla NO debe avisar: si no, el mozo entra a su turno y le suenan
//  de golpe las diez llamadas de la tarde.
//
//  El codigo usaba "el registro esta vacio" como senal de arranque, y
//  eso falla de dos maneras opuestas:
//
//  1. Si el primer snapshot no trae nada —una mesa sin llamadas
//     pendientes, que es lo normal— el registro queda vacio. La primera
//     llamada real llega, se vuelve a evaluar "esta vacio" como si fuera
//     el arranque, y NO avisa. El mozo no se entera.
//
//  2. Con varias mesas escuchando en paralelo, alcanza con que una
//     reporte algo para que el registro deje de estar vacio. El primer
//     snapshot de las demas se toma entonces por novedad y avisa por
//     cosas que ya estaban.
//
//  La senal correcta no es "hay algo guardado" sino "esta mesa ya
//  reporto alguna vez". Por eso el registro lleva dos cosas separadas:
//  que mesas ya dieron su linea de base, y que items ya se anunciaron.
// ============================================================

export const crearRegistroDeAvisos = () => ({
  mesasVistas: new Set(),
  itemsVistos: new Set(),
})

/**
 * Devuelve los items que corresponde anunciar y deja el registro al dia.
 *
 * @param registro          el que devuelve crearRegistroDeAvisos()
 * @param items             [{ id, mesa }] presentes ahora
 * @param mesasQueReportaron mesas cuyo snapshot ya llego en esta vuelta
 */
export const novedades = (registro, items, mesasQueReportaron) => {
  // Solo es novedad lo de una mesa que ya habia dado su linea de base.
  const nuevos = items.filter(i =>
    registro.mesasVistas.has(String(i.mesa)) && !registro.itemsVistos.has(i.id)
  )

  // Todo lo presente queda registrado, haya avisado o no: lo de la
  // primera vuelta es justamente lo que no hay que volver a anunciar.
  items.forEach(i => registro.itemsVistos.add(i.id))
  mesasQueReportaron.forEach(n => registro.mesasVistas.add(String(n)))

  return nuevos
}
