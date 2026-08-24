import { useState, useEffect } from 'react'
import {
  suscribirSesion, asegurarSesionAnonima,
  leerRolEnLocal, leerPertenencia, leerEsAdminPlataforma,
} from '../firebase/auth'
import { aceptarInvitacion, buscarInvitacion } from '../firebase/locales'

// Estado de sesion de Firebase, sin roles.
//
// anonimoAutomatico: en la vista del comensal entra en modo anonimo
// solo, para que no vea ningun login. En las vistas del personal va en
// false: si no, cada visita a /cocina crearia una cuenta anonima
// descartable antes de que la persona llegue a escribir su email.
export function useSesion({ anonimoAutomatico = true } = {}) {
  const [sesion, setSesion] = useState({ user: null, cargando: true })

  useEffect(() => {
    let vivo = true
    const unsub = suscribirSesion((s) => {
      if (!vivo) return
      if (!s.user && anonimoAutomatico) {
        asegurarSesionAnonima().catch(() => {
          if (vivo) setSesion({ user: null, cargando: false, error: true })
        })
        return
      }
      setSesion(s)
    })
    return () => { vivo = false; unsub() }
  }, [anonimoAutomatico])

  return sesion
}

// Acceso del personal A UN LOCAL CONCRETO.
//
// El rol no es una propiedad de la cuenta sino de la relacion entre la
// cuenta y el local que se esta mirando: se lee de
// locales/{localId}/empleados/{uid}. Si alguien del bar A abre la URL
// del bar B, ahi no tiene ficha y no hay rol que devolver.
export function useAcceso(localId, rolesPermitidos = []) {
  const { user, cargando: cargandoSesion } = useSesion({ anonimoAutomatico: false })
  const [estado, setEstado] = useState({ rol: null, esAdmin: false, resolviendo: true })

  useEffect(() => {
    let vivo = true
    if (cargandoSesion) return
    if (!user || user.isAnonymous) {
      setEstado({ rol: null, esAdmin: false, resolviendo: false })
      return
    }
    setEstado(e => ({ ...e, resolviendo: true }))

    const resolver = async () => {
      let [rol, esAdmin] = await Promise.all([
        leerRolEnLocal(localId, user.uid),
        leerEsAdminPlataforma(user.uid),
      ])
      // Sin ficha, pero puede ser alguien que entra por primera vez
      // con una invitacion pendiente para este local. Se canjea sola:
      // la persona hizo clic en el link de su bar y entro con Google,
      // no tiene por que apretar un boton mas.
      if (!rol && !esAdmin) {
        const invitacion = await buscarInvitacion(user.email)
        if (invitacion?.local_id === localId) {
          await aceptarInvitacion(user).catch(() => {})
          rol = await leerRolEnLocal(localId, user.uid)
        }
      }
      if (vivo) setEstado({ rol, esAdmin, resolviendo: false })
    }
    resolver()

    return () => { vivo = false }
  }, [user, cargandoSesion, localId])

  // El encargado entra a todas las vistas de su local. El admin de la
  // plataforma entra a cualquier local, para poder dar soporte.
  const permitidos = ['encargado', ...rolesPermitidos]
  const tieneAcceso = estado.esAdmin || (!!estado.rol && permitidos.includes(estado.rol))

  return {
    user,
    rol: estado.rol,
    esAdmin: estado.esAdmin,
    tieneAcceso,
    cargando: cargandoSesion || estado.resolviendo,
  }
}

// A donde mandar a alguien despues de un login suelto (/login), cuando
// todavia no sabemos de que local es.
export function usePertenencia(user) {
  const [estado, setEstado] = useState({ pertenencia: null, esAdmin: false, cargando: true })

  useEffect(() => {
    let vivo = true
    if (!user || user.isAnonymous) {
      setEstado({ pertenencia: null, esAdmin: false, cargando: false })
      return
    }
    Promise.all([leerPertenencia(user.uid), leerEsAdminPlataforma(user.uid)])
      .then(([pertenencia, esAdmin]) => {
        if (vivo) setEstado({ pertenencia, esAdmin, cargando: false })
      })
    return () => { vivo = false }
  }, [user])

  return estado
}
