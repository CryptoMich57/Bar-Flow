import { createContext, useContext, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { suscribirLocal } from '../firebase/locales'
import { useSesion } from './useSesion'
import { getLogoDefecto, getNombrePlataforma } from '../config'

// ============================================================
//  EL LOCAL ACTUAL
//
//  El localId sale de la URL (/l/:localId/...), no de una variable
//  global ni del usuario logueado. Asi la misma app sirve a todos los
//  negocios y el QR de una mesa siempre apunta a un local concreto.
//
//  Todo componente que toque datos lee el localId de aca. Ninguno lo
//  recibe por props desde arriba, para que no haya forma de que una
//  vista quede apuntando al local equivocado.
// ============================================================

const Contexto = createContext({
  localId: null, local: null, cargando: true, error: null,
  nombre: getNombrePlataforma(), logo: getLogoDefecto(),
})

export const useLocal = () => useContext(Contexto)

export function LocalProvider({ children }) {
  const { localId } = useParams()
  // Solo observa la sesion, no la crea: quien la crea es cada vista.
  // El comensal entra anonimo desde ZonaCliente y el personal con Google
  // desde PuertaDeAcceso, ambas por dentro de este provider.
  const { user } = useSesion({ anonimoAutomatico: false })
  const [local, setLocal] = useState(null)
  const [cargando, setCargando] = useState(true)
  // Distinto de `local === null`: eso significa "no existe", esto significa
  // "no lo pude leer". Al primero no hay nada que hacerle —el QR esta mal—,
  // al segundo se lo reintenta.
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!localId) { setLocal(null); setError(null); setCargando(false); return }

    // Sin sesion no se puede leer el local: las reglas exigen estar
    // logueado. Si nos suscribimos antes de tiempo, Firestore rechaza la
    // lectura, mata el listener —onSnapshot no reintenta despues de un
    // error— y la pantalla queda colgada o diciendo que el local no
    // existe. Asi que esperamos, y volvemos a intentar cuando aparece.
    // Sin sesion no hay nada que esperar: dejamos de "cargar" para que la
    // pantalla de acceso se pueda dibujar, y este efecto vuelve a correr
    // solo cuando la sesion aparece.
    if (!user) { setLocal(null); setError(null); setCargando(false); return }

    setCargando(true)
    setError(null)
    const unsub = suscribirLocal(
      localId,
      (datos) => { setLocal(datos); setCargando(false) },
      (err) => { setError(err); setCargando(false) },
    )
    return unsub
  }, [localId, user])

  // El nombre y el logo que ve el comensal salen del local, no del
  // codigo. Mientras carga, o si el local no subio logo, cae en los
  // valores de la plataforma para que nunca quede un hueco en pantalla.
  const valor = {
    localId,
    local,
    cargando,
    error,
    nombre: local?.nombre || getNombrePlataforma(),
    logo:   local?.logo   || getLogoDefecto(),
  }

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>

}
