// ============================================================
//  PRUEBAS DE LAS REGLAS DE FIRESTORE
//
//  Se corren contra el emulador, nunca contra el proyecto real:
//    npm run test:reglas
//
//  Lo que se prueba aca no es que la app funcione, sino que la
//  frontera de autorizacion aguante. Casi todos los casos son
//  NEGATIVOS —lo que NO se debe poder hacer— porque es lo unico
//  que no se detecta usando la aplicacion a mano: una regla de mas
//  no rompe ninguna pantalla, solo abre una puerta.
//
//  Cada bloque referencia el hallazgo de AUDITORIA_CLAUDE_CODEX.md
//  que cubre.
// ============================================================
import { readFileSync } from 'node:fs'
import { beforeAll, afterAll, beforeEach, describe, it } from 'vitest'
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing'
import {
  doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
} from 'firebase/firestore'

let entorno

// ── Identidades ─────────────────────────────────────────────
// El comensal es una sesion anonima CON capacidad de mesa: el backend
// se la entrego para una mesa concreta y vence. El proveedor y el claim
// los firma Firebase, asi que el cliente no puede fabricarlos.
const EN_UNA_HORA = () => Date.now() + 60 * 60 * 1000
const HACE_UNA_HORA = () => Date.now() - 60 * 60 * 1000

const comensalDe = (localId, mesa, opciones = {}) =>
  entorno.authenticatedContext(opciones.uid || 'comensal-1', {
    firebase: { sign_in_provider: 'anonymous' },
    mesa: { l: localId, m: `mesa_${mesa}`, exp: opciones.exp || EN_UNA_HORA() },
  })

// El de siempre: sentado en la mesa 1 del bar A.
const comensal = () => comensalDe('bar-a', 1)

// Una sesion anonima sin capacidad ninguna: es lo que tiene alguien que
// abrio la app pero todavia no paso por el backend.
const anonimoSinCapacidad = () => entorno.authenticatedContext('curioso', {
  firebase: { sign_in_provider: 'anonymous' },
})

// El personal entra con Google, que siempre trae el email verificado.
const conGoogle = (uid, email, verificado = true) =>
  entorno.authenticatedContext(uid, {
    email,
    email_verified: verificado,
    firebase: { sign_in_provider: 'google.com' },
  })

const db = (ctx) => ctx.firestore()

// Una mesa recien abierta tiene que nacer en cero: sin total, sin carrito,
// sin metodo de pago. Las reglas lo exigen para que nadie se siente con una
// cuenta ya puesta a mano.
const MESA_RECIEN_ABIERTA = {
  estado: 'ocupada',
  personas: 2,
  clientes: ['Ana'],
  carrito: [],
  carrito_bloqueado: false,
  total_acumulado: 0,
  propina: 0,
  metodo_pago: null,
}

// ── Rutas ───────────────────────────────────────────────────
const local      = (d, id) => doc(d, 'locales', id)
const carta      = (d, id) => collection(d, 'locales', id, 'carta')
const itemCarta  = (d, id, item) => doc(d, 'locales', id, 'carta', item)
const mesa       = (d, id, n) => doc(d, 'locales', id, 'mesas', `mesa_${n}`)
const pedidos    = (d, id, n) => collection(d, 'locales', id, 'mesas', `mesa_${n}`, 'pedidos')
const historial  = (d, id) => collection(d, 'locales', id, 'historial')
const empleado   = (d, id, uid) => doc(d, 'locales', id, 'empleados', uid)
const invitacion = (d, id, mail) => doc(d, 'locales', id, 'invitaciones', mail)
const invitGlobal = (d, mail) => doc(d, 'invitaciones', mail)
const mensajes   = (d, id, n) => collection(d, 'locales', id, 'mesas', `mesa_${n}`, 'mensajes')

beforeAll(async () => {
  entorno = await initializeTestEnvironment({
    projectId: 'barflow-pruebas',
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  })
})

afterAll(async () => { await entorno?.cleanup() })

beforeEach(async () => {
  await entorno.clearFirestore()

  // Estado inicial: dos bares que no tienen nada que ver entre si,
  // y un admin de plataforma.
  await entorno.withSecurityRulesDisabled(async (ctx) => {
    const d = ctx.firestore()

    await setDoc(local(d, 'bar-a'), {
      nombre: 'Bar A', owner_uid: 'ana', estado: 'activo', plan: 'prueba',
    })
    await setDoc(local(d, 'bar-b'), {
      nombre: 'Bar B', owner_uid: 'beto', estado: 'activo', plan: 'prueba',
    })
    await setDoc(local(d, 'bar-suspendido'), {
      nombre: 'Bar Suspendido', owner_uid: 'ana', estado: 'suspendido', plan: 'prueba',
    })

    // Ana es encargada del bar A y tambien del suspendido. Mario, mozo del A.
    await setDoc(empleado(d, 'bar-a', 'ana'),   { nombre: 'Ana',   email: 'ana@a.com',   rol: 'encargado', activo: true })
    await setDoc(empleado(d, 'bar-a', 'mario'), { nombre: 'Mario', email: 'mario@a.com', rol: 'mozo',      activo: true })
    await setDoc(empleado(d, 'bar-suspendido', 'ana'), { nombre: 'Ana', email: 'ana@a.com', rol: 'encargado', activo: true })

    // Beto, encargado del bar B.
    await setDoc(empleado(d, 'bar-b', 'beto'), { nombre: 'Beto', email: 'beto@b.com', rol: 'encargado', activo: true })

    await setDoc(doc(d, 'superadmins', 'hexa'), { email: 'hexa@hexagroup.com.ar' })

    await setDoc(itemCarta(d, 'bar-a', 'cafe'), { nombre: 'Cafe', precio: 900, disponible: true })
    await setDoc(mesa(d, 'bar-a', 1), { estado: 'libre', mesa_numero: '1' })
    await setDoc(mesa(d, 'bar-a', 2), { estado: 'libre', mesa_numero: '2' })
    await setDoc(mesa(d, 'bar-b', 1), { estado: 'libre', mesa_numero: '1' })
    await setDoc(mesa(d, 'bar-suspendido', 1), { estado: 'libre', mesa_numero: '1' })

    // Invitacion pendiente del bar A para Carla.
    await setDoc(invitacion(d, 'bar-a', 'carla@gmail.com'), { email: 'carla@gmail.com', nombre: 'Carla', rol: 'cocina' })
    await setDoc(invitGlobal(d, 'carla@gmail.com'), { local_id: 'bar-a', rol: 'cocina' })
  })
})

// ════════════════════════════════════════════════════════════
describe('AUD-001 / AUD-003 — quien es comensal', () => {
  it('una sesion anonima puede abrir y escribir una mesa', async () => {
    const d = db(comensal())
    await assertSucceeds(getDoc(mesa(d, 'bar-a', 1)))
    await assertSucceeds(setDoc(mesa(d, 'bar-a', 1), MESA_RECIEN_ABIERTA))
  })

  it('una cuenta de Google sin ficha en el local NO es comensal', async () => {
    // Antes bastaba con estar logueado, asi que el personal de otro bar
    // —y la plataforma— podian escribir mesas ajenas. Y ni siquiera
    // fabricando el claim: las reglas exigen proveedor anonimo.
    const d = db(conGoogle('extranio', 'extranio@gmail.com'))
    await assertFails(setDoc(mesa(d, 'bar-a', 1), { estado: 'ocupada' }))
  })

  it('el personal del local si opera sus mesas', async () => {
    const d = db(conGoogle('mario', 'mario@a.com'))
    await assertSucceeds(setDoc(mesa(d, 'bar-a', 1), { estado: 'ocupada' }))
  })
})

// ════════════════════════════════════════════════════════════
describe('AUD-001 — el comensal solo opera SU mesa', () => {
  it('sin capacidad no puede leer ni escribir ninguna mesa', async () => {
    // Es el estado de quien abrio la app y todavia no paso por el backend.
    // Antes bastaba con tener sesion anonima para operar todo el local.
    const d = db(anonimoSinCapacidad())
    await assertFails(getDoc(mesa(d, 'bar-a', 1)))
    await assertFails(setDoc(mesa(d, 'bar-a', 1), { estado: 'ocupada' }))
  })

  it('con capacidad para la mesa 1 NO puede tocar la mesa 2', async () => {
    const d = db(comensalDe('bar-a', 1))
    await assertSucceeds(setDoc(mesa(d, 'bar-a', 1), MESA_RECIEN_ABIERTA))
    await assertFails(getDoc(mesa(d, 'bar-a', 2)))
    await assertFails(setDoc(mesa(d, 'bar-a', 2), MESA_RECIEN_ABIERTA))
  })

  it('no puede sentarse con una cuenta ya puesta', async () => {
    // Lo que impide mesaNaceLimpia(): antes el comensal podia crear su mesa
    // con total_acumulado o carrito_bloqueado a gusto.
    const d = db(comensalDe('bar-a', 1))
    await assertFails(setDoc(mesa(d, 'bar-a', 1), { ...MESA_RECIEN_ABIERTA, total_acumulado: 99999 }))
    await assertFails(setDoc(mesa(d, 'bar-a', 1), { ...MESA_RECIEN_ABIERTA, propina: 5000 }))
  })

  it('tampoco los pedidos, mensajes ni llamadas de otra mesa', async () => {
    const d = db(comensalDe('bar-a', 1))
    await assertFails(getDocs(pedidos(d, 'bar-a', 2)))
    await assertFails(setDoc(doc(pedidos(d, 'bar-a', 2)), { total: 0 }))
    await assertFails(setDoc(doc(collection(d, 'locales', 'bar-a', 'mesas', 'mesa_2', 'mensajes')), { texto: 'hola' }))
  })

  it('una capacidad del bar A no sirve en el bar B', async () => {
    const d = db(comensalDe('bar-a', 1))
    await assertFails(setDoc(mesa(d, 'bar-b', 1), { estado: 'ocupada' }))
  })

  it('una capacidad vencida no sirve', async () => {
    const d = db(comensalDe('bar-a', 1, { exp: HACE_UNA_HORA() }))
    await assertFails(setDoc(mesa(d, 'bar-a', 1), { estado: 'ocupada' }))
    await assertFails(getDoc(mesa(d, 'bar-a', 1)))
  })

  it('la carta y la configuracion se leen sin capacidad: es lo que se ve antes de sentarse', async () => {
    const d = db(anonimoSinCapacidad())
    await assertSucceeds(getDocs(carta(d, 'bar-a')))
    await assertSucceeds(getDoc(doc(d, 'locales', 'bar-a', 'sistema', 'configuracion')))
  })

  it('el personal opera cualquier mesa de su local sin capacidad', async () => {
    // El mozo no pasa por el backend: entra por su ficha de empleado.
    const d = db(conGoogle('mario', 'mario@a.com'))
    await assertSucceeds(setDoc(mesa(d, 'bar-a', 2), { estado: 'ocupada' }))
  })
})

// ════════════════════════════════════════════════════════════
describe('Aislamiento entre negocios', () => {
  it('la encargada del bar A no lee el historial del bar B', async () => {
    const d = db(conGoogle('ana', 'ana@a.com'))
    await assertFails(getDocs(historial(d, 'bar-b')))
  })

  it('la encargada del bar A no edita la carta del bar B', async () => {
    const d = db(conGoogle('ana', 'ana@a.com'))
    await assertFails(setDoc(itemCarta(d, 'bar-b', 'infiltrado'), { nombre: 'x' }))
  })

  it('la encargada del bar A no da de alta empleados en el bar B', async () => {
    const d = db(conGoogle('ana', 'ana@a.com'))
    await assertFails(setDoc(empleado(d, 'bar-b', 'ana'), { rol: 'encargado', activo: true }))
  })

  it('en su propio local si puede todo eso', async () => {
    const d = db(conGoogle('ana', 'ana@a.com'))
    await assertSucceeds(getDocs(historial(d, 'bar-a')))
    await assertSucceeds(setDoc(itemCarta(d, 'bar-a', 'te'), { nombre: 'Te', precio: 800 }))
  })
})

// ════════════════════════════════════════════════════════════
describe('AUD-003 — el soporte de plataforma es de solo lectura', () => {
  const admin = () => db(conGoogle('hexa', 'hexa@hexagroup.com.ar'))

  it('lee los datos del cliente', async () => {
    await assertSucceeds(getDocs(carta(admin(), 'bar-a')))
    await assertSucceeds(getDocs(historial(admin(), 'bar-a')))
    await assertSucceeds(getDoc(mesa(admin(), 'bar-a', 1)))
  })

  it('lista el padron de locales, que nadie mas puede', async () => {
    await assertSucceeds(getDocs(collection(admin(), 'locales')))
    await assertFails(getDocs(collection(db(conGoogle('ana', 'ana@a.com')), 'locales')))
    await assertFails(getDocs(collection(db(comensal()), 'locales')))
  })

  it('NO escribe mesas ni pedidos', async () => {
    await assertFails(setDoc(mesa(admin(), 'bar-a', 1), { estado: 'libre' }))
    await assertFails(setDoc(doc(pedidos(admin(), 'bar-a', 1)), { total: 0 }))
  })

  it('NO edita la carta ni la configuracion', async () => {
    await assertFails(setDoc(itemCarta(admin(), 'bar-a', 'cafe'), { precio: 1 }))
    await assertFails(setDoc(doc(admin(), 'locales', 'bar-a', 'sistema', 'configuracion'), { mesas: { cantidad: 99 } }))
  })

  it('NO toca la caja', async () => {
    await assertFails(setDoc(doc(historial(admin(), 'bar-a')), { total_cobrado: 1 }))
  })

  it('NO reparte roles: seria una puerta de entrada silenciosa', async () => {
    await assertFails(setDoc(empleado(admin(), 'bar-a', 'hexa'), { rol: 'encargado', activo: true }))
  })

  it('si administra el plan y el estado del local, que es lo suyo', async () => {
    await assertSucceeds(updateDoc(local(admin(), 'bar-a'), { estado: 'suspendido' }))
  })
})

// ════════════════════════════════════════════════════════════
describe('Local suspendido', () => {
  it('congela al comensal y al personal', async () => {
    // Incluso con una capacidad valida para ese local: si esta suspendido,
    // no atiende. El backend tampoco entrega capacidades nuevas.
    await assertFails(setDoc(mesa(db(comensalDe('bar-suspendido', 1)), 'bar-suspendido', 1), { estado: 'ocupada' }))
    const ana = db(conGoogle('ana', 'ana@a.com'))
    await assertFails(setDoc(itemCarta(ana, 'bar-suspendido', 'x'), { nombre: 'x' }))
  })

  it('la plataforma lo puede reactivar', async () => {
    const admin = db(conGoogle('hexa', 'hexa@hexagroup.com.ar'))
    await assertSucceeds(updateDoc(local(admin, 'bar-suspendido'), { estado: 'activo' }))
  })
})

// ════════════════════════════════════════════════════════════
describe('AUD-004 — invitaciones', () => {
  it('la encargada invita a alguien a su local', async () => {
    const d = db(conGoogle('ana', 'ana@a.com'))
    await assertSucceeds(setDoc(invitacion(d, 'bar-a', 'nuevo@gmail.com'), { email: 'nuevo@gmail.com', rol: 'mozo' }))
    await assertSucceeds(setDoc(invitGlobal(d, 'nuevo@gmail.com'), { local_id: 'bar-a', rol: 'mozo' }))
  })

  it('no necesita LEER el indice global para invitar', async () => {
    // Este era el bug: la app hacia un get() previo que las reglas niegan,
    // y el alta de personal moria antes de escribir nada.
    const d = db(conGoogle('ana', 'ana@a.com'))
    await assertFails(getDoc(invitGlobal(d, 'carla@gmail.com')))
  })

  it('un encargado no puede robarle una invitacion pendiente a otro local', async () => {
    const d = db(conGoogle('beto', 'beto@b.com'))
    await assertFails(setDoc(invitGlobal(d, 'carla@gmail.com'), { local_id: 'bar-b', rol: 'encargado' }))
  })

  it('la persona invitada lee la suya y solo la suya', async () => {
    const carla = db(conGoogle('carla', 'carla@gmail.com'))
    await assertSucceeds(getDoc(invitGlobal(carla, 'carla@gmail.com')))
    const otra = db(conGoogle('otra', 'otra@gmail.com'))
    await assertFails(getDoc(invitGlobal(otra, 'carla@gmail.com')))
  })

  it('canjearla crea la ficha con el rol invitado', async () => {
    const carla = db(conGoogle('carla', 'carla@gmail.com'))
    await assertSucceeds(setDoc(empleado(carla, 'bar-a', 'carla'), {
      nombre: 'Carla', email: 'carla@gmail.com', rol: 'cocina', activo: true,
    }))
  })

  it('NO se puede canjear pidiendo un rol distinto al invitado', async () => {
    const carla = db(conGoogle('carla', 'carla@gmail.com'))
    await assertFails(setDoc(empleado(carla, 'bar-a', 'carla'), {
      nombre: 'Carla', email: 'carla@gmail.com', rol: 'encargado', activo: true,
    }))
  })
})

// ════════════════════════════════════════════════════════════
describe('AUD-006 — el email tiene que estar verificado', () => {
  it('un email SIN verificar no puede canjear la invitacion de esa direccion', async () => {
    // La apiKey es publica: sin este chequeo, cualquiera se daba de alta por
    // REST declarando el email de otro y se quedaba con su puesto.
    const impostor = db(conGoogle('impostor', 'carla@gmail.com', false))
    await assertFails(setDoc(empleado(impostor, 'bar-a', 'impostor'), {
      nombre: 'Impostor', email: 'carla@gmail.com', rol: 'cocina', activo: true,
    }))
  })

  it('un email SIN verificar tampoco lee la invitacion', async () => {
    const impostor = db(conGoogle('impostor', 'carla@gmail.com', false))
    await assertFails(getDoc(invitGlobal(impostor, 'carla@gmail.com')))
  })
})

// ════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════
describe('El rol del mensaje no se puede falsear', () => {
  // La vista decide que avisar segun el rol. Si un comensal pudiera
  // escribir rol:'staff', se dibujaria como personal del local dentro del
  // chat de su propia mesa, y ademas el encargado dejaria de recibir el
  // aviso. Es suplantacion, aunque sea de bajo impacto.

  it('el comensal escribe como cliente y no puede decir que es del local', async () => {
    const d = db(comensalDe('bar-a', 1))
    await assertSucceeds(setDoc(doc(mensajes(d, 'bar-a', 1)), { texto: 'hola', autor: 'Ana', rol: 'cliente' }))
    await assertFails(setDoc(doc(mensajes(d, 'bar-a', 1)), { texto: 'soy el bar', autor: 'Encargado', rol: 'staff' }))
  })

  it('el personal escribe como staff y no puede hacerse pasar por cliente', async () => {
    const d = db(conGoogle('ana', 'ana@a.com'))
    await assertSucceeds(setDoc(doc(mensajes(d, 'bar-a', 1)), { texto: 'ya va', autor: 'Encargado', rol: 'staff' }))
    await assertFails(setDoc(doc(mensajes(d, 'bar-a', 1)), { texto: 'que rico', autor: 'Ana', rol: 'cliente' }))
  })

  it('un mensaje sin rol no entra', async () => {
    // Sin rol no hay forma de saber a quien avisarle, asi que se rechaza en
    // vez de adivinar por el nombre del autor.
    const d = db(comensalDe('bar-a', 1))
    await assertFails(setDoc(doc(mensajes(d, 'bar-a', 1)), { texto: 'hola', autor: 'Ana' }))
  })
})

describe('Escalada de privilegios dentro del local', () => {
  it('un mozo no se asciende a encargado', async () => {
    const d = db(conGoogle('mario', 'mario@a.com'))
    await assertFails(updateDoc(empleado(d, 'bar-a', 'mario'), { rol: 'encargado' }))
  })

  it('un mozo no edita la carta', async () => {
    const d = db(conGoogle('mario', 'mario@a.com'))
    await assertFails(setDoc(itemCarta(d, 'bar-a', 'cafe'), { precio: 1 }))
  })

  it('la encargada no se quita a si misma el rol: el local nunca queda sin admin', async () => {
    const d = db(conGoogle('ana', 'ana@a.com'))
    await assertFails(updateDoc(empleado(d, 'bar-a', 'ana'), { rol: 'mozo', activo: true }))
    await assertFails(deleteDoc(empleado(d, 'bar-a', 'ana')))
  })

  it('nadie se anota como superadmin', async () => {
    await assertFails(setDoc(doc(db(conGoogle('ana', 'ana@a.com')), 'superadmins', 'ana'), { email: 'ana@a.com' }))
    await assertFails(setDoc(doc(db(comensal()), 'superadmins', 'comensal-1'), {}))
  })

  it('un local no puede nacer activo ni a nombre de otro', async () => {
    const d = db(conGoogle('nuevo', 'nuevo@gmail.com'))
    await assertFails(setDoc(local(d, 'trucho'), { nombre: 'Trucho', owner_uid: 'nuevo', estado: 'activo' }))
    await assertFails(setDoc(local(d, 'trucho'), { nombre: 'Trucho', owner_uid: 'ana', estado: 'prueba' }))
    await assertSucceeds(setDoc(local(d, 'legitimo'), { nombre: 'Legitimo', owner_uid: 'nuevo', estado: 'prueba' }))
  })
})
