import { useEffect, useState } from 'react'
import { alHaberVersionNueva, aplicarVersionNueva } from '../utils/actualizacion'

// Ver src/utils/actualizacion.js. Aparece cuando hay una versión nueva
// esperando y el dispositivo sigue con la anterior. No se recarga solo
// mientras alguien está mirando la pantalla: puede estar cobrando.
export default function AvisoDeVersion() {
  const [hayNueva, setHayNueva] = useState(false)
  useEffect(() => alHaberVersionNueva(setHayNueva), [])

  if (!hayNueva) return null

  return (
    <div role="status" style={{
      position: 'fixed', left: 12, right: 12, bottom: 12, zIndex: 9999,
      display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between',
      flexWrap: 'wrap',
      background: 'var(--gold)', color: '#000',
      padding: '12px 16px', borderRadius: 12,
      boxShadow: '0 6px 24px rgba(0,0,0,0.35)',
      fontSize: '0.9em', fontWeight: 600,
    }}>
      <span>Hay una versión nueva de BarFlow.</span>
      <button onClick={aplicarVersionNueva} style={{
        background: '#000', color: 'var(--gold)', border: 'none',
        padding: '8px 16px', borderRadius: 8, cursor: 'pointer',
        fontFamily: 'inherit', fontSize: '0.95em', fontWeight: 700,
      }}>
        Actualizar
      </button>
    </div>
  )
}
