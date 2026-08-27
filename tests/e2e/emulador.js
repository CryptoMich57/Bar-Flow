// ============================================================
//  UTILES DE LOS RECORRIDOS: SEMBRAR Y ENTRAR
//
//  El emulador acepta el token "owner" para saltear las reglas, que es
//  lo que hace falta para dejar el escenario armado. Probar las reglas
//  es tarea de la otra suite; aca lo que se prueba es que la aplicacion
//  funcione con datos reales adentro.
// ============================================================

export const PROYECTO = 'barflow-pruebas'
const FIRESTORE = 'http://127.0.0.1:8080'
const AUTH = 'http://127.0.0.1:9099'
const COMO_DUENO = { Authorization: 'Bearer owner' }

// ── Firestore por REST ──────────────────────────────────────
function aValor(v) {
  if (v === null || v === undefined) return { nullValue: null }
  if (typeof v === 'boolean') return { booleanValue: v }
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v }
  if (typeof v === 'string') return { stringValue: v }
  if (Array.isArray(v)) return { arrayValue: { values: v.map(aValor) } }
  const fields = {}
  for (const [k, x] of Object.entries(v)) fields[k] = aValor(x)
  return { mapValue: { fields } }
}

function desdeCampos(fields) {
  const salida = {}
  for (const [k, v] of Object.entries(fields)) salida[k] = unValor(v)
  return salida
}

function unValor(v) {
  if ('nullValue' in v) return null
  if ('booleanValue' in v) return v.booleanValue
  if ('integerValue' in v) return Number(v.integerValue)
  if ('doubleValue' in v) return v.doubleValue
  if ('stringValue' in v) return v.stringValue
  if ('timestampValue' in v) return v.timestampValue
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(unValor)
  if ('mapValue' in v) return desdeCampos(v.mapValue.fields || {})
  return null
}

const url = (ruta) =>
  `${FIRESTORE}/v1/projects/${PROYECTO}/databases/(default)/documents/${ruta}`

export const escribir = async (ruta, datos) => {
  const fields = {}
  for (const [k, v] of Object.entries(datos)) fields[k] = aValor(v)
  const r = await fetch(url(ruta), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...COMO_DUENO },
    body: JSON.stringify({ fields }),
  })
  if (!r.ok) throw new Error(`No se pudo sembrar ${ruta}: ${await r.text()}`)
}

/**
 * Cambia SOLO los campos que se le pasan.
 *
 * `escribir` hace un PATCH sin mascara, y eso reemplaza el documento
 * entero: cambiarle el `owner_uid` a un local le borraba el `estado`, y
 * las reglas dejaban de considerarlo activo. El sintoma era peor que la
 * causa —las mesas se dejaban de leer sin ningun error a la vista— asi
 * que conviene tener las dos operaciones separadas y elegir a conciencia.
 */
export const actualizar = async (ruta, datos) => {
  const fields = {}
  for (const [k, v] of Object.entries(datos)) fields[k] = aValor(v)
  const mascara = Object.keys(datos).map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&')
  const r = await fetch(`${url(ruta)}?${mascara}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...COMO_DUENO },
    body: JSON.stringify({ fields }),
  })
  if (!r.ok) throw new Error(`No se pudo actualizar ${ruta}: ${await r.text()}`)
}

export const leer = async (ruta) => {
  const r = await fetch(url(ruta), { headers: COMO_DUENO })
  if (!r.ok) return null
  return desdeCampos((await r.json()).fields || {})
}

export const listar = async (ruta) => {
  const r = await fetch(url(ruta), { headers: COMO_DUENO })
  if (!r.ok) return []
  const cuerpo = await r.json()
  return (cuerpo.documents || []).map(d => ({
    id: d.name.split('/').pop(),
    ...desdeCampos(d.fields || {}),
  }))
}

export const limpiarBase = async () => {
  await fetch(`${FIRESTORE}/emulator/v1/projects/${PROYECTO}/databases/(default)/documents`,
    { method: 'DELETE' })
}

export const limpiarCuentas = async () => {
  await fetch(`${AUTH}/emulator/v1/projects/${PROYECTO}/accounts`, { method: 'DELETE' })
}

// ── Entrar con Google ───────────────────────────────────────
/**
 * `signInWithPopup` contra el emulador abre una ventana con un formulario
 * propio del emulador en vez de la pantalla de Google. Se completa igual
 * que lo haria una persona: es lo que hace que esta prueba valga, porque
 * atraviesa el mismo camino de la app y no una puerta de atras.
 */
export const entrarConGoogle = async (page, { email, nombre }) => {
  const emergente = page.waitForEvent('popup')
  await page.getByRole('button', { name: /Google/i }).first().click()
  const popup = await emergente
  await popup.waitForLoadState('domcontentloaded')

  // El emulador ofrece las cuentas ya creadas y un boton para agregar una.
  const yaExiste = popup.getByText(email, { exact: false }).first()
  if (await yaExiste.isVisible().catch(() => false)) {
    await yaExiste.click()
  } else {
    await popup.getByRole('button', { name: /Add new account|Agregar/i }).click()
    await popup.locator('#email-input').fill(email)
    await popup.locator('#display-name-input').fill(nombre || email)
    await popup.getByRole('button', { name: /Sign in with Google|Iniciar/i }).click()
  }
  await popup.waitForEvent('close', { timeout: 20_000 }).catch(() => {})
}

// ── Escenario base ──────────────────────────────────────────
export const LOCAL = 'bar-de-pruebas'

export const sembrarLocal = async ({ ownerUid } = {}) => {
  await escribir(`locales/${LOCAL}`, {
    nombre: 'Bar de Pruebas', slogan: '', logo: '',
    owner_uid: ownerUid || 'sin-dueno', estado: 'activo', plan: 'prueba',
  })
  await escribir(`locales/${LOCAL}/sistema/configuracion`, { mesas: { cantidad: 4 } })

  // La carta incluye una promocion a proposito: es la categoria que le
  // faltaba a la vista del mozo y por la que no se podia tomar el pedido.
  await escribir(`locales/${LOCAL}/carta/menu-del-dia`, {
    nombre: 'Menu del dia', precio: 5000, disponible: true,
    categoria: 'promocion', destino: 'cocina',
  })
  await escribir(`locales/${LOCAL}/carta/cafe`, {
    nombre: 'Cafe', precio: 900, disponible: true,
    categoria: 'bebida_preparada', destino: 'encargado',
  })
}

export const sembrarEmpleado = async (uid, { nombre, email, rol }) => {
  await escribir(`locales/${LOCAL}/empleados/${uid}`,
    { nombre, email, rol, activo: true })
  await escribir(`usuarios/${uid}`, { local_id: LOCAL, rol })
}

// El uid que le toca a una cuenta la crea el emulador, asi que hay que
// preguntarselo despues de entrar.
export const uidDe = async (email) => {
  const r = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROYECTO}/accounts:query`,
    { method: 'POST', headers: { 'Content-Type': 'application/json', ...COMO_DUENO }, body: '{}' })
  const cuerpo = await r.json()
  const cuenta = (cuerpo.userInfo || []).find(u => u.email === email)
  return cuenta?.localId || null
}
