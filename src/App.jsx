import { Routes, Route, Navigate } from 'react-router-dom'
import MesaPage from './pages/MesaPage'
import EncargadoPage from './pages/EncargadoPage'
import MozoPage from './pages/MozoPage'
import CocinaPage from './pages/CocinaPage'
import LoginPage from './pages/LoginPage'
import PuertaDeAcceso from './components/PuertaDeAcceso'
import { useSesion } from './utils/useSesion'

// El comensal no ve ningun login, pero igual necesita una sesion anonima
// activa antes de tocar Firestore: sin eso las reglas rechazan cada lectura.
function ZonaCliente({ children }) {
  const { user, cargando, error } = useSesion()
  if (error) return (
    <div className="pantallaEstado">
      <p>No se pudo conectar con el servidor. Revisa tu internet y volve a intentar.</p>
    </div>
  )
  if (cargando || !user) return (
    <div className="pantallaEstado"><p>Conectando...</p></div>
  )
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/mesa/:mesaId" element={
        <ZonaCliente><MesaPage /></ZonaCliente>
      } />

      <Route path="/login" element={<LoginPage />} />

      <Route path="/encargado" element={
        <PuertaDeAcceso rolesPermitidos={[]} titulo="Encargado" emoji="🧑‍💼">
          <EncargadoPage />
        </PuertaDeAcceso>
      } />

      <Route path="/mozo" element={
        <PuertaDeAcceso rolesPermitidos={['mozo']} titulo="Mozo" emoji="🧍">
          <MozoPage />
        </PuertaDeAcceso>
      } />

      <Route path="/cocina" element={
        <PuertaDeAcceso rolesPermitidos={['cocina']} titulo="Cocina" emoji="👨‍🍳">
          <CocinaPage />
        </PuertaDeAcceso>
      } />

      <Route path="*" element={<Navigate to="/mesa/1" replace />} />
    </Routes>
  )
}
