import { useState, useCallback } from 'react'

let idCounter = 0

export const useNotificaciones = () => {
  const [notifs, setNotifs] = useState([])

  const agregar = useCallback((texto, tipo = 'gold', duracion = 3500) => {
    const id = ++idCounter
    setNotifs(prev => [...prev, { id, texto, tipo }])
    setTimeout(() => {
      setNotifs(prev => prev.filter(n => n.id !== id))
    }, duracion)
  }, [])

  const NotifBanner = () => (
    <div className="notifBanner">
      {notifs.map(n => (
        <div key={n.id} className={`notifItem notif${n.tipo.charAt(0).toUpperCase() + n.tipo.slice(1)}`}>
          {n.texto}
        </div>
      ))}
    </div>
  )

  return { agregar, NotifBanner }
}
