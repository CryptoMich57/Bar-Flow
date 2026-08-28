import { Routes, Route, Navigate } from 'react-router-dom'
import PuertaDeAcceso from './components/PuertaDeAcceso'
import AvisoDeVersion from './components/AvisoDeVersion'
import { LocalProvider, useLocal } from './utils/LocalContext'
import { useState, useEffect, lazy, Suspense } from 'react'
import { useParams } from 'react-router-dom'
import { useSesion, useAcceso } from './utils/useSesion'
import { cerrarSesion } from './firebase/auth'
import { abrirSesionDeMesa } from './firebase/capacidadMesa'

// Cada vista se descarga cuando alguien entra a su ruta, no antes.
// Todo venia en un solo archivo, asi que el comensal que escanea un QR
// para ver la carta se bajaba tambien el codigo del encargado, del mozo,
// de la cocina y del panel de la plataforma —que nunca va a abrir—. Con
// datos moviles en un bar, eso es el primer contacto del cliente con el
// producto.
const MesaPage      = lazy(() => import('./pages/MesaPage'))
const EncargadoPage = lazy(() => import('./pages/EncargadoPage'))
const MozoPage      = lazy(() => import('./pages/MozoPage'))
const CocinaPage    = lazy(() => import('./pages/CocinaPage'))
const LoginPage     = lazy(() => import('./pages/LoginPage'))
const RegistroPage  = lazy(() => import('./pages/RegistroPage'))
const AdminPage     = lazy(() => import('./pages/AdminPage'))

// ============================================================
//  RUTAS
//
//  Todo lo que pertenece a un negocio vive bajo /l/:localId/...
//  El QR de una mesa apunta a /l/mi-bar/mesa/3, y de ahi sale el
//  local para cada consulta a la base. Fuera de /l/ solo quedan las
//  pantallas de la plataforma: entrar, registrarse y administrar.
// ============================================================

// El comensal no ve ningun login, pero igual necesita una sesion
// anonima activa antes de tocar Firestore: sin eso las reglas
// rechazan cada lectura.
function ZonaCliente({ children }) {
  const { user, cargando, error } = useSesion()
  const { localId, local, cargando: cargandoLocal, error: errorLocal } = useLocal()
  const { mesaId } = useParams()
  const { rol, cargando: cargandoRol } = useAcceso(localId, ['cocina', 'mozo'])
  const [capacidad, setCapacidad] = useState({ lista: false, error: null })

  // Antes de que el comensal toque nada, el backend le da permiso para
  // ESTA mesa. Sin eso las reglas rechazan cada escritura: una sesion
  // anonima ya no alcanza, justamente para que nadie pueda operar la mesa
  // de al lado. El personal no lo necesita: entra por su ficha.
  useEffect(() => {
    let vivo = true
    setCapacidad({ lista: false, error: null })
    if (!user || !localId || !mesaId) return
    if (!user.isAnonymous) { setCapacidad({ lista: true, error: null }); return }
    if (local?.estado === 'suspendido') return

    abrirSesionDeMesa(localId, mesaId)
      .then(() => { if (vivo) setCapacidad({ lista: true, error: null }) })
      .catch(err => {
        console.error('No se pudo abrir la mesa:', err)
        if (vivo) setCapacidad({ lista: false, error: err })
      })
    return () => { vivo = false }
  }, [user, localId, mesaId, local?.estado])

  if (error) return (
    <div className="pantallaEstado">
      <p>No se pudo conectar con el servidor. Revisa tu internet y volve a intentar.</p>
    </div>
  )

  if (cargando || cargandoLocal || !user) return (
    <div className="pantallaEstado"><p>Conectando...</p></div>
  )

  // "No existe" y "no lo pude leer" no son lo mismo. Al comensal que
  // escaneo un QR bien pero se quedo sin senal, mandarle a pedir ayuda a un
  // mozo por un codigo que esta bien es hacerle perder el tiempo a los dos.
  if (errorLocal) return (
    <div className="pantallaEstado">
      <div style={{textAlign:'center', maxWidth:340}}>
        <p>No pudimos cargar el bar. Puede ser la conexion.</p>
        <button className="btn btn-gold" style={{marginTop:16}}
          onClick={() => window.location.reload()}>Reintentar</button>
      </div>
    </div>
  )

  if (!local) return (
    <div className="pantallaEstado">
      <p>Este codigo QR no corresponde a ningun local. Pedile ayuda a un mozo.</p>
    </div>
  )

  // Un local suspendido deja de atender: mejor un cartel claro que una
  // pantalla que falla al primer toque contra las reglas.
  if (local.estado === 'suspendido') return (
    <div className="pantallaEstado">
      <p>{local.nombre} no esta recibiendo pedidos por la app en este momento.</p>
    </div>
  )

  // Las reglas definen "comensal" como una sesion ANONIMA. Si alguien abre
  // el QR con una cuenta de Google y no trabaja en este local —personal de
  // otro bar, o alguien de la plataforma— no va a poder leer ni escribir la
  // mesa. Mejor decirselo que dejarlo mirando una pantalla que no carga.
  if (!user.isAnonymous && !rol && !cargandoRol) return (
    <div className="pantallaEstado">
      <div style={{textAlign:'center', maxWidth:340}}>
        <p>Estas usando la app con la cuenta <strong>{user.email}</strong>.</p>
        <p style={{color:'var(--text3)', fontSize:'0.88em', marginTop:8}}>
          Para pedir como cliente hace falta salir de esa sesion. Tus datos de
          trabajo no se pierden: volves a entrar cuando quieras.
        </p>
        <button className="btn btn-gold" style={{marginTop:16}}
          onClick={() => cerrarSesion()}>
          Salir y pedir como cliente
        </button>
      </div>
    </div>
  )

  // La capacidad todavia no llego o fallo. Es distinto de "no hay sesion":
  // aca ya hay sesion, lo que falta es el permiso para esta mesa.
  if (capacidad.error) return (
    <div className="pantallaEstado">
      <div style={{textAlign:'center', maxWidth:340}}>
        <p>No pudimos abrir la mesa {mesaId}.</p>
        <p style={{color:'var(--text3)', fontSize:'0.85em', marginTop:8}}>
          {capacidad.error?.message || 'Probá de nuevo en un momento.'}
        </p>
        <button className="btn btn-gold" style={{marginTop:16}}
          onClick={() => window.location.reload()}>
          Reintentar
        </button>
      </div>
    </div>
  )

  if (!capacidad.lista) return (
    <div className="pantallaEstado"><p>Abriendo tu mesa...</p></div>
  )

  return children
}

// Envuelve una vista con el local de la URL.
function ConLocal({ children }) {
  return <LocalProvider>{children}</LocalProvider>
}

export default function App() {
  return (
    // El fallback tiene que ser sobrio: aparece un instante mientras baja
    // el chunk de la vista, y en una conexion buena casi no se ve.
    <>
    <AvisoDeVersion />
    <Suspense fallback={<div className="pantallaEstado"><p>Cargando...</p></div>}>
    <Routes>
      {/* ── Plataforma ────────────────────────────────────── */}
      <Route path="/login"    element={<LoginPage />} />
      <Route path="/registro" element={<RegistroPage />} />
      <Route path="/admin"    element={<AdminPage />} />

      {/* ── Un local ──────────────────────────────────────── */}
      <Route path="/l/:localId/mesa/:mesaId" element={
        <ConLocal>
          <ZonaCliente><MesaPage /></ZonaCliente>
        </ConLocal>
      } />

      <Route path="/l/:localId/encargado" element={
        <ConLocal>
          <PuertaDeAcceso rolesPermitidos={[]} titulo="Encargado" emoji="🧑‍💼">
            <EncargadoPage />
          </PuertaDeAcceso>
        </ConLocal>
      } />

      <Route path="/l/:localId/mozo" element={
        <ConLocal>
          <PuertaDeAcceso rolesPermitidos={['mozo']} titulo="Mozo" emoji="🧍">
            <MozoPage />
          </PuertaDeAcceso>
        </ConLocal>
      } />

      <Route path="/l/:localId/cocina" element={
        <ConLocal>
          <PuertaDeAcceso rolesPermitidos={['cocina']} titulo="Cocina" emoji="👨‍🍳">
            <CocinaPage />
          </PuertaDeAcceso>
        </ConLocal>
      } />

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
    </Suspense>
    </>
  )
}
