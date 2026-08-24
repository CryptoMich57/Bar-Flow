import { useState, useEffect } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useSesion, usePertenencia } from '../utils/useSesion'
import { entrarConGoogle, cerrarSesion, mensajeDeError } from '../firebase/auth'
import { buscarInvitacion, aceptarInvitacion } from '../firebase/locales'
import { getCopyright, getLogoDefecto, getNombrePlataforma } from '../config'
import BotonGoogle from '../components/BotonGoogle'
import styles from '../components/PuertaDeAcceso.module.css'

// Puerta de entrada del personal cuando no viene por el link de su
// local. Aca todavia no sabemos a que negocio pertenece la cuenta: se
// resuelve despues de entrar, leyendo usuarios/{uid}.local_id, y si no
// hay nada, viendo si alguien dejo una invitacion a ese email.
const VISTA_POR_ROL = {
  encargado: 'encargado',
  cocina:    'cocina',
  mozo:      'mozo',
}

export default function LoginPage() {
  const { user, cargando } = useSesion({ anonimoAutomatico: false })
  const { pertenencia, esAdmin, cargando: cargandoPertenencia } = usePertenencia(user)
  const [error, setError]       = useState(null)
  const [enviando, setEnviando] = useState(false)
  const [canjeando, setCanjeando] = useState(false)
  const [reciencanjeado, setRecienCanjeado] = useState(null)

  const handleEntrar = async () => {
    setEnviando(true); setError(null)
    try {
      await entrarConGoogle()
    } catch (err) {
      setError(mensajeDeError(err?.code))
    }
    setEnviando(false)
  }

  // Primera vez de alguien a quien invitaron: no tiene ficha todavia,
  // pero si una invitacion esperando. Se canjea sola.
  useEffect(() => {
    let vivo = true
    if (!user || user.isAnonymous) return
    if (cargandoPertenencia || pertenencia?.local_id || esAdmin) return
    setCanjeando(true)
    buscarInvitacion(user.email)
      .then(inv => inv ? aceptarInvitacion(user) : null)
      .then(res => { if (vivo) { setRecienCanjeado(res); setCanjeando(false) } })
      .catch(() => { if (vivo) setCanjeando(false) })
    return () => { vivo = false }
  }, [user, cargandoPertenencia, pertenencia, esAdmin])

  const esperando = cargando
    || (user && !user.isAnonymous && (cargandoPertenencia || canjeando))

  if (esperando) return (
    <div className={styles.pantalla}>
      <div className={styles.caja}><p className={styles.cargando}>Conectando...</p></div>
    </div>
  )

  // El admin del SaaS va derecho a su panel.
  if (user && !user.isAnonymous && esAdmin) {
    return <Navigate to="/admin" replace />
  }

  // El personal va a la vista que le corresponde en SU local.
  const destino = pertenencia?.local_id
    ? { local: pertenencia.local_id, rol: pertenencia.rol }
    : reciencanjeado
      ? { local: reciencanjeado.localId, rol: reciencanjeado.rol }
      : null

  if (user && !user.isAnonymous && destino) {
    return <Navigate to={`/l/${destino.local}/${VISTA_POR_ROL[destino.rol] || 'encargado'}`} replace />
  }

  // Cuenta real, pero sin local, sin invitacion y sin permisos de plataforma.
  const sesionHuerfana = !!user && !user.isAnonymous

  return (
    <div className={styles.pantalla}>
      <div className={styles.caja}>
        <img src={getLogoDefecto()} alt="Logo" className={styles.logo}
          onError={e => e.target.style.display='none'} />
        <h2 className={styles.titulo}>{getNombrePlataforma()}</h2>
        <p className={styles.subtitulo}>Acceso del personal</p>

        {sesionHuerfana ? (
          <>
            <p className={styles.aviso}>
              La cuenta {user.email} no esta asociada a ningun local. Pedile al
              encargado de tu bar que te invite con este mismo email.
            </p>
            <button type="button" className="btn btn-ghost" style={{marginTop:12}}
              onClick={() => cerrarSesion()}>
              Cambiar de cuenta
            </button>
          </>
        ) : (
          <>
            <p className={styles.ayuda} style={{marginBottom:18}}>
              Entra con tu cuenta de Google. Sin contrasenas.
            </p>

            <BotonGoogle onClick={handleEntrar} enviando={enviando} />

            {error && <p className={styles.error}>{error}</p>}

            <p className={styles.ayuda} style={{marginTop:20}}>
              ¿Todavia no tenes tu bar en {getNombrePlataforma()}?{' '}
              <Link to="/registro" style={{color:'var(--gold)'}}>Crear una cuenta</Link>
            </p>
          </>
        )}
      </div>
      <footer className={styles.footer}>{getCopyright()}</footer>
    </div>
  )
}
