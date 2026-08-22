import { Routes, Route, Navigate } from 'react-router-dom'
import MesaPage from './pages/MesaPage'
import EncargadoPage from './pages/EncargadoPage'
import MozoPage from './pages/MozoPage'
import CocinaPage from './pages/CocinaPage'
import LoginPage from './pages/LoginPage'

export default function App() {
  return (
    <Routes>
      <Route path="/mesa/:mesaId" element={<MesaPage />} />
      <Route path="/login"      element={<LoginPage />} />
      <Route path="/encargado"  element={<EncargadoPage />} />
      <Route path="/mozo"       element={<MozoPage />} />
      <Route path="/cocina"     element={<CocinaPage />} />
      <Route path="*" element={<Navigate to="/mesa/1" replace />} />
    </Routes>
  )
}
