import { useEffect, useState } from 'react'
import { alCambiarAudio, activarAudioAlPrimerGesto } from './sonidos'

/**
 * Deja el sonido listo sin pedirle nada a la persona y devuelve si ya lo esta.
 *
 * El estado no se guarda en cada pantalla por separado: el audio es uno solo
 * para toda la pestaña, asi que vive en sonidos.js y las vistas se suscriben.
 * Cuando cada pagina llevaba su propio `audioOn`, el boton podia mostrarse
 * apagado aunque el audio ya estuviera andando —o al reves—.
 */
export const useAudioListo = () => {
  const [listo, setListo] = useState(false)
  useEffect(() => {
    const soltarGesto = activarAudioAlPrimerGesto()
    const soltarEstado = alCambiarAudio(setListo)
    return () => { soltarGesto(); soltarEstado() }
  }, [])
  return listo
}
