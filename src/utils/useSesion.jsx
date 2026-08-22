import { useState, useEffect } from 'react'
import { suscribirSesion, asegurarSesionAnonima } from '../firebase/auth'

// Estado de sesion para toda la app. Si nadie inicio sesion, entra en modo
// anonimo automaticamente para que el cliente de la mesa no vea ningun login.
export function useSesion() {
  const [sesion, setSesion] = useState({ user: null, rol: null, cargando: true })

  useEffect(() => {
    let vivo = true
    const unsub = suscribirSesion((s) => {
      if (!vivo) return
      if (!s.user) {
        asegurarSesionAnonima().catch(() => {
          if (vivo) setSesion({ user: null, rol: null, cargando: false, error: true })
        })
        return
      }
      setSesion(s)
    })
    return () => { vivo = false; unsub() }
  }, [])

  return sesion
}
