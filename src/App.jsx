import { Routes, Route, Navigate } from 'react-router-dom'
import MesaPage from './pages/MesaPage'
import EncargadoPage from './pages/EncargadoPage'
import MozoPage from './pages/MozoPage'
import CocinaPage from './pages/CocinaPage'
import LoginPage from './pages/LoginPage'
import RegistroPage from './pages/RegistroPage'
import AdminPage from './pages/AdminPage'
import PuertaDeAcceso from './components/PuertaDeAcceso'
import { LocalProvider, useLocal } from './utils/LocalContext'
import { useSesion } from './utils/useSesion'

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
  const { local, cargando: cargandoLocal } = useLocal()

  if (error) return (
    <div className="pantallaEstado">
      <p>No se pudo conectar con el servidor. Revisa tu internet y volve a intentar.</p>
    </div>
  )

  if (cargando || cargandoLocal || !user) return (
    <div className="pantallaEstado"><p>Conectando...</p></div>
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

  return children
}

// Envuelve una vista con el local de la URL.
function ConLocal({ children }) {
  return <LocalProvider>{children}</LocalProvider>
}

export default function App() {
  return (
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
  )
}
