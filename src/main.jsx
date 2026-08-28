import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { vigilarVersiones } from './utils/actualizacion'
import './styles/global.css'

// Que un dispositivo no se quede con la app vieja despues de un despliegue.
// Ver src/utils/actualizacion.js: no es cosmetico, con reglas nuevas y
// cliente viejo el cobro de una mesa falla con "insufficient permissions".
vigilarVersiones()


ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
)