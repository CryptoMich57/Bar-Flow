import { createContext, useContext } from 'react'

// ============================================================
//  ACCESO A LA VISTA ACTUAL
//
//  Lo provee PuertaDeAcceso, que es quien ya resolvio el rol de la
//  persona DENTRO del local que se esta mirando. Las vistas lo leen
//  para saber si estan atendiendo a su propio local o si alguien de
//  Hexa Group entro a dar soporte.
//
//  soporte = admin de la plataforma mirando un local en el que no
//  trabaja. Puede ver todo, pero no operar: las reglas de Firestore
//  no le dan escritura sobre las mesas, asi que los botones de accion
//  se ocultan en vez de fallar al hacer clic.
// ============================================================

const Contexto = createContext({ rol: null, esAdmin: false, soporte: false })

export const useAccesoActual = () => useContext(Contexto)

export function AccesoProvider({ rol, esAdmin, children }) {
  const soporte = !!esAdmin && !rol
  return (
    <Contexto.Provider value={{ rol, esAdmin, soporte }}>
      {children}
    </Contexto.Provider>
  )
}
