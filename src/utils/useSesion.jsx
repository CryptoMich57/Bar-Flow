import { useState, useEffect } from 'react'
import { suscribirSesion, asegurarSesionAnonima } from '../firebase/auth'

// Estado de sesion para toda la app.
//
// anonimoAutomatico: en la vista del comensal entra en modo anonimo solo,
// para que no vea ningun login. En las vistas del personal va en false: si
// no, cada visita a /cocina crearia una cuenta anonima descartable antes
// de que la persona llegue a escribir su email.
export function useSesion({ anonimoAutomatico = true } = {}) {
  const [sesion, setSesion] = useState({ user: null, rol: null, cargando: true })

  useEffect(() => {
    let vivo = true
    const unsub = suscribirSesion((s) => {
      if (!vivo) return
      if (!s.user && anonimoAutomatico) {
        asegurarSesionAnonima().catch(() => {
          if (vivo) setSesion({ user: null, rol: null, cargando: false, error: true })
        })
        return
      }
      setSesion(s)
    })
    return () => { vivo = false; unsub() }
  }, [anonimoAutomatico])

  return sesion
}
