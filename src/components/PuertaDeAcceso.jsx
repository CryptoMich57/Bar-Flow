import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAcceso } from '../utils/useSesion'
import { useLocal } from '../utils/LocalContext'
import { AccesoProvider } from '../utils/AccesoContext'
import { entrarConGoogle, cerrarSesion, mensajeDeError } from '../firebase/auth'
import { getCopyright } from '../config'
import BotonGoogle from './BotonGoogle'
import styles from './PuertaDeAcceso.module.css'

// Envuelve las vistas internas. Solo deja pasar a una cuenta que tenga
// ficha de empleado EN ESTE LOCAL y con un rol habilitado para la vista.
// El encargado entra a todas las vistas de su local; el admin de la
// plataforma entra a cualquier local para poder dar soporte.
export default function PuertaDeAcceso({ rolesPermitidos, titulo, emoji, children }) {
  const { localId, local, nombre: nombreBar, logo, cargando: cargandoLocal } = useLocal()
  const { user, rol, ficha, esAdmin, errorCanje, tieneAcceso, cargando } = useAcceso(localId, rolesPermitidos)
  const [error, setError]       = useState(null)
  const [enviando, setEnviando] = useState(false)

  const handleEntrar = async () => {
    setEnviando(true); setError(null)
    try {
      await entrarConGoogle()
    } catch (err) {
      setError(mensajeDeError(err?.code))
    }
    setEnviando(false)
  }

  if (cargando || cargandoLocal) return (
    <div className={styles.pantalla}>
      <div className={styles.caja}>
        <p className={styles.cargando}>Conectando...</p>
      </div>
    </div>
  )

  // Sin sesion todavia no sabemos nada del local: las reglas no dejan
  // leerlo. Primero que entre, despues vemos si el local existe.
  const sesionAjena = !!user && !user.isAnonymous

  if (!sesionAjena) return (
    <div className={styles.pantalla}>
      <div className={styles.caja}>
        <img src={logo} alt="Logo" className={styles.logo}
          onError={e => e.target.style.display='none'} />
        <h2 className={styles.titulo}>{nombreBar}</h2>
        <p className={styles.subtitulo}>{emoji} Acceso {titulo}</p>

        <p className={styles.ayuda} style={{marginBottom:18}}>
          Entra con la cuenta de Google que le pasaste al encargado.
        </p>

        <BotonGoogle onClick={handleEntrar} enviando={enviando} />

        {error && <p className={styles.error}>{error}</p>}

        <p className={styles.ayuda} style={{marginTop:14}}>
          No hay contrasenas que recordar. La sesion queda guardada en este
          dispositivo.
        </p>
      </div>
      <footer className={styles.footer}>{getCopyright()}</footer>
    </div>
  )

  // La URL apunta a un local que no existe. Mejor decirlo claro que
  // mostrar un acceso que nunca va a funcionar.
  if (!local) return (
    <div className={styles.pantalla}>
      <div className={styles.caja}>
        <h2 className={styles.titulo}>Local no encontrado</h2>
        <p className={styles.aviso}>
          No existe ningun local con el identificador "{localId}". Revisa la
          direccion.
        </p>
        <Link to="/login" className="btn btn-ghost" style={{marginTop:12}}>Ir al acceso</Link>
      </div>
    </div>
  )

  // La vista necesita saber con que sombrero entro la persona, para poder
  // esconder lo que no va a poder hacer.
  if (tieneAcceso) return (
    <AccesoProvider rol={rol} ficha={ficha} esAdmin={esAdmin}>{children}</AccesoProvider>
  )

  // Tenia invitacion para este local pero el canje fallo. Decirle "no
  // pertenecés al equipo" seria mentirle y mandarla a pedir algo que ya tiene.
  if (errorCanje) return (
    <div className={styles.pantalla}>
      <div className={styles.caja}>
        <img src={logo} alt="Logo" className={styles.logo}
          onError={e => e.target.style.display='none'} />
        <h2 className={styles.titulo}>{nombreBar}</h2>
        <p className={styles.subtitulo}>{emoji} Acceso {titulo}</p>
        <p className={styles.aviso}>
          Encontramos tu invitacion a {nombreBar} pero no pudimos completarla.
          Volve a intentar; si sigue igual, avisale al encargado.
        </p>
        <p className={styles.ayuda} style={{marginTop:8}}>
          {errorCanje?.code || errorCanje?.message || 'Error desconocido'}
        </p>
        <button type="button" className="btn btn-gold" style={{marginTop:16}}
          onClick={() => window.location.reload()}>
          Reintentar
        </button>
        <button type="button" className="btn btn-ghost" style={{marginTop:10}}
          onClick={() => cerrarSesion()}>
          Cambiar de cuenta
        </button>
      </div>
      <footer className={styles.footer}>{getCopyright()}</footer>
    </div>
  )

  // Entro con una cuenta real, pero sin permiso para esta vista de este local.
  return (
    <div className={styles.pantalla}>
      <div className={styles.caja}>
        <img src={logo} alt="Logo" className={styles.logo}
          onError={e => e.target.style.display='none'} />
        <h2 className={styles.titulo}>{nombreBar}</h2>
        <p className={styles.subtitulo}>{emoji} Acceso {titulo}</p>

        <p className={styles.aviso}>
          {rol
            ? `Tu cuenta (${user.email}) tiene el rol "${rol}" en ${nombreBar}, que no puede entrar a ${titulo}.`
            : `Tu cuenta (${user.email}) no pertenece al equipo de ${nombreBar}. Pedile al encargado que te invite con este mismo email.`}
        </p>
        <button type="button" className="btn btn-ghost" style={{marginTop:12}}
          onClick={() => cerrarSesion()}>
          Cambiar de cuenta
        </button>
      </div>
      <footer className={styles.footer}>{getCopyright()}</footer>
    </div>
  )
}
