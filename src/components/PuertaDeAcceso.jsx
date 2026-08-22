import { useState } from 'react'
import { useSesion } from '../utils/useSesion'
import { iniciarSesionPersonal, cerrarSesion, mensajeDeError } from '../firebase/auth'
import { getNombreBar, getLogo, getCopyright } from '../config'
import styles from './PuertaDeAcceso.module.css'

// Envuelve las vistas internas. Solo deja pasar a una cuenta real de Firebase
// cuyo rol este en rolesPermitidos. El encargado entra a todas las vistas.
export default function PuertaDeAcceso({ rolesPermitidos, titulo, emoji, children }) {
  const { user, rol, cargando } = useSesion({ anonimoAutomatico: false })
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState(null)
  const [enviando, setEnviando] = useState(false)

  const permitidos = ['encargado', ...rolesPermitidos]
  const tieneAcceso = !!user && !user.isAnonymous && permitidos.includes(rol)

  const handleLogin = async (e) => {
    e?.preventDefault?.()
    if (!email.trim() || !password) return
    setEnviando(true); setError(null)
    try {
      await iniciarSesionPersonal(email, password)
      setPassword('')
    } catch (err) {
      setError(mensajeDeError(err?.code))
    }
    setEnviando(false)
  }

  if (cargando) return (
    <div className={styles.pantalla}>
      <div className={styles.caja}>
        <p className={styles.cargando}>Conectando...</p>
      </div>
    </div>
  )

  if (tieneAcceso) return children

  // Sesion iniciada pero con un rol que no corresponde a esta vista.
  const rolAjeno = !!user && !user.isAnonymous && !permitidos.includes(rol)

  return (
    <div className={styles.pantalla}>
      <form className={styles.caja} onSubmit={handleLogin}>
        <img src={getLogo()} alt="Logo" className={styles.logo}
          onError={e => e.target.style.display='none'} />
        <h2 className={styles.titulo}>{getNombreBar()}</h2>
        <p className={styles.subtitulo}>{emoji} Acceso {titulo}</p>

        {rolAjeno ? (
          <>
            <p className={styles.aviso}>
              Esta sesion ({user.email}) no tiene permiso para entrar a {titulo}.
              {rol ? ` Su rol es "${rol}".` : ' Su usuario todavia no tiene un rol asignado.'}
            </p>
            <button type="button" className="btn btn-ghost" style={{marginTop:12}}
              onClick={() => cerrarSesion()}>
              Cambiar de cuenta
            </button>
          </>
        ) : (
          <>
            <label className={styles.label}>Email</label>
            <input className="input" type="email" autoComplete="username"
              placeholder="cocina@tubar.com" value={email}
              onChange={e => { setEmail(e.target.value); setError(null) }} autoFocus />

            <label className={styles.label} style={{marginTop:12}}>Contrasena</label>
            <input className="input" type="password" autoComplete="current-password"
              placeholder="Contrasena" value={password}
              onChange={e => { setPassword(e.target.value); setError(null) }} />

            {error && <p className={styles.error}>{error}</p>}

            <button type="submit" className="btn btn-gold" style={{marginTop:18}}
              disabled={enviando || !email.trim() || !password}>
              {enviando ? 'Entrando...' : 'Entrar'}
            </button>
            <p className={styles.ayuda}>
              La sesion queda guardada en este dispositivo.
            </p>
          </>
        )}
      </form>
      <footer className={styles.footer}>{getCopyright()}</footer>
    </div>
  )
}
