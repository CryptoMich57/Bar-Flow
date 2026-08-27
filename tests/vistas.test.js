// ============================================================
//  PRUEBAS DE LA LOGICA DE LAS VISTAS
//
//  Sin emulador y sin navegador: son funciones puras.
//    npm run test:unidad
//
//  Estan aca porque los dos errores que cubren llegaron al bar. Ninguno
//  rompia una pantalla —todo cargaba, todo se veia bien— y por eso
//  ninguna prueba de reglas ni de Functions los podia atrapar: no son
//  fallas de autorizacion ni de plata, son fallas de que la vista
//  muestre lo que hay.
// ============================================================
import { describe, it, expect } from 'vitest'
import {
  CATEGORIAS, categoriasDeLaCarta, esDeCategoria, etiquetaDeCategoria,
} from '../src/utils/categorias'
import { hayPendiente, rolDelMensaje, momentoDelMensaje } from '../src/utils/noLeidos'

const item = (categoria) => ({ nombre: 'x', categoria, disponible: true })

describe('Categorias de la carta', () => {
  // El error real: el comensal tenia 5 categorias y el mozo 4. El local
  // cargaba su menu del dia como 'promocion', el cliente lo veia y el mozo
  // no: la vista de tomar pedido mostraba la carta pero ese producto no
  // aparecia nunca, asi que el carrito quedaba vacio y el boton de enviar
  // —que solo existe con el carrito cargado— no llegaba a dibujarse.
  it('promocion existe: es lo que el mozo no tenia', () => {
    expect(Object.keys(CATEGORIAS)).toContain('promocion')
  })

  it('ningun producto de la carta se queda afuera', () => {
    const carta = [item('promocion'), item('comida'), item('bebida_simple')]
    const visibles = categoriasDeLaCarta(carta)
    for (const i of carta) {
      expect(visibles.some(c => esDeCategoria(i, c))).toBe(true)
    }
  })

  it('un producto con una categoria desconocida cae en Otros, no desaparece', () => {
    // Puede venir de una version vieja o de alguien editando a mano en la
    // consola. Antes ese producto no era alcanzable desde ninguna pestaña.
    const carta = [item('comida'), item('vinos_importados')]
    const visibles = categoriasDeLaCarta(carta)
    expect(visibles).toContain('otros')
    expect(esDeCategoria(item('vinos_importados'), 'otros')).toBe(true)
    expect(etiquetaDeCategoria('vinos_importados').label).toBe('Otros')
  })

  it('solo se dibujan las categorias que tienen algo', () => {
    expect(categoriasDeLaCarta([item('comida')])).toEqual(['comida'])
    expect(categoriasDeLaCarta([])).toEqual([])
  })

  it('sin sueltos no aparece Otros', () => {
    expect(categoriasDeLaCarta([item('comida'), item('postre')])).not.toContain('otros')
  })

  it('el orden es el de la lista, no el de carga de la carta', () => {
    // Que el mozo y el comensal vean las pestañas en el mismo orden aunque
    // los productos se hayan cargado en cualquiera.
    const carta = [item('postre'), item('promocion'), item('comida')]
    expect(categoriasDeLaCarta(carta)).toEqual(['promocion', 'comida', 'postre'])
  })
})

describe('Mensajes sin leer', () => {
  const staff   = (ms) => ({ rol: 'staff',   autor: 'Encargado', created_at: { toMillis: () => ms } })
  const cliente = (ms) => ({ rol: 'cliente', autor: 'Ana',       created_at: { toMillis: () => ms } })

  it('el encargado no se avisa a si mismo', () => {
    // El error que reporto la prueba en el bar: al mandar un mensaje al
    // cliente, al encargado le aparecia la notificacion sobre su propio texto.
    expect(hayPendiente(staff(1000), 0, 'staff')).toBe(false)
  })

  it('el mensaje del cliente si queda pendiente', () => {
    expect(hayPendiente(cliente(1000), 0, 'staff')).toBe(true)
  })

  it('lo ya leido deja de figurar', () => {
    expect(hayPendiente(cliente(1000), 1000, 'staff')).toBe(false)
    expect(hayPendiente(cliente(1001), 1000, 'staff')).toBe(true)
  })

  it('una mesa sin mensajes no tiene nada pendiente', () => {
    expect(hayPendiente(null, 0, 'staff')).toBe(false)
  })

  it('los mensajes viejos sin rol se deducen del autor', () => {
    // Compatibilidad: lo que se escribio antes de que existiera el campo.
    expect(rolDelMensaje({ autor: 'Encargado' })).toBe('staff')
    expect(rolDelMensaje({ autor: 'Ana' })).toBe('cliente')
    expect(rolDelMensaje({ rol: 'cliente', autor: 'Encargado' })).toBe('cliente')
  })

  it('un mensaje que el servidor todavia no sello se toma como recien llegado', () => {
    // Con created_at nulo, tomarlo como 0 lo dejaba debajo de cualquier
    // marca de visto y el aviso no aparecia nunca.
    const antes = Date.now()
    expect(momentoDelMensaje({ rol: 'cliente', created_at: null })).toBeGreaterThanOrEqual(antes)
    expect(hayPendiente({ rol: 'cliente', created_at: null }, Date.now() - 1, 'staff')).toBe(true)
  })

  it('del lado del cliente, lo suyo tampoco le avisa', () => {
    expect(hayPendiente(cliente(1000), 0, 'cliente')).toBe(false)
    expect(hayPendiente(staff(1000), 0, 'cliente')).toBe(true)
  })
})
