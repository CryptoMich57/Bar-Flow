// ============================================================
//  CATEGORÍAS DE LA CARTA
//
//  Una sola lista para todas las vistas. Estaba duplicada entre el
//  comensal y el mozo, y las listas no coincidían: al mozo le faltaba
//  "Promo del día". Consecuencia real: un local que cargaba su menú del
//  día como promoción se lo mostraba al cliente pero NO al mozo, que
//  entonces no podía tomar ese pedido desde su vista.
//
//  Es el tipo de error que no rompe nada visiblemente —la pantalla
//  carga, la carta aparece— y solo se descubre cuando alguien intenta
//  vender justo ese producto.
// ============================================================

export const CATEGORIAS = {
  promocion:        { label: 'Promo del día', emoji: '🌟' },
  comida:           { label: 'Comidas',       emoji: '🍽️' },
  bebida_preparada: { label: 'Cafetería',     emoji: '☕' },
  bebida_simple:    { label: 'Bebidas',       emoji: '🥤' },
  postre:           { label: 'Postres',       emoji: '🍰' },
}

// Para un producto con una categoría que no está en la lista —quedó de
// una versión vieja, o alguien la escribió a mano en la consola— vale
// más mostrarlo en "Otros" que hacerlo desaparecer de la carta.
export const CATEGORIA_SUELTA = { label: 'Otros', emoji: '📦' }

export const etiquetaDeCategoria = (clave) =>
  CATEGORIAS[clave] || CATEGORIA_SUELTA

/**
 * Las categorías que hay que dibujar para una carta concreta: las
 * conocidas que tengan algún producto, más "Otros" si quedó algo suelto.
 * Así ninguna vista puede perder un producto por tener su lista corta.
 */
export const categoriasDeLaCarta = (carta = []) => {
  const presentes = new Set(carta.map(i => i?.categoria))
  const conocidas = Object.keys(CATEGORIAS).filter(k => presentes.has(k))
  const haySueltos = [...presentes].some(c => c && !CATEGORIAS[c])
  return haySueltos ? [...conocidas, 'otros'] : conocidas
}

// Un producto pertenece a la categoría pedida, o a "Otros" si la suya no
// figura entre las conocidas.
export const esDeCategoria = (item, clave) =>
  clave === 'otros'
    ? !CATEGORIAS[item?.categoria]
    : item?.categoria === clave
