import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useSesion } from '../utils/useSesion'
import {
  registrarLocal, generarLocalId, validarLocalId, localIdDisponible,
} from '../firebase/locales'
import { entrarConGoogle, cerrarSesion, mensajeDeError } from '../firebase/auth'
import { getCopyright, getLogoDefecto, getNombrePlataforma } from '../config'
import BotonGoogle from '../components/BotonGoogle'
import styles from '../components/PuertaDeAcceso.module.css'

// Alta de un negocio nuevo, sin intervencion de nadie de la plataforma.
// Son dos pasos: primero la persona se identifica con Google, y recien
// despues elige el nombre del bar. Asi no hay formulario largo antes de
// saber siquiera quien es.
export default function RegistroPage() {
  const navigate = useNavigate()
  const { user, cargando } = useSesion({ anonimoAutomatico: false })
  const [nombreLocal, setNombreLocal]     = useState('')
  const [localId, setLocalId]             = useState('')
  const [localIdTocado, setLocalIdTocado] = useState(false)
  const [error, setError]                 = useState(null)
  const [enviando, setEnviando]           = useState(false)

  const handleEntrar = async () => {
    setEnviando(true); setError(null)
    try {
      await entrarConGoogle()
    } catch (err) {
      setError(mensajeDeError(err?.code))
    }
    setEnviando(false)
  }

  // El identificador se sugiere solo a partir del nombre, pero se puede
  // corregir: va en la URL de todos los QR del local, asi que conviene
  // que la persona lo vea antes de confirmar.
  const cambiarNombre = (valor) => {
    setNombreLocal(valor)
    if (!localIdTocado) setLocalId(generarLocalId(valor))
    setError(null)
  }

  const handleCrear = async (e) => {
    e?.preventDefault?.()
    setError(null)

    if (!nombreLocal.trim()) return setError('Poné el nombre de tu bar.')
    const problema = validarLocalId(localId)
    if (problema) return setError(problema)

    setEnviando(true)
    try {
      if (!(await localIdDisponible(localId))) {
        setError('Ya existe un local con ese identificador. Probá con otro.')
        setEnviando(false)
        return
      }
      await registrarLocal({ localId, nombreLocal, user })
      navigate(`/l/${localId}/encargado`, { replace: true })
    } catch (err) {
      setError(err?.code ? mensajeDeError(err.code) : (err?.message || 'No se pudo crear el local.'))
      setEnviando(false)
    }
  }

  if (cargando) return (
    <div className={styles.pantalla}>
      <div className={styles.caja}><p className={styles.cargando}>Conectando...</p></div>
    </div>
  )

  const identificado = !!user && !user.isAnonymous

  return (
    <div className={styles.pantalla}>
      <div className={styles.caja} style={{maxWidth:420}}>
        <img src={getLogoDefecto()} alt="Logo" className={styles.logo}
          onError={e => e.target.style.display='none'} />
        <h2 className={styles.titulo}>{getNombrePlataforma()}</h2>
        <p className={styles.subtitulo}>🏪 Crear la cuenta de tu bar</p>

        {!identificado ? (
          <>
            <p className={styles.ayuda} style={{marginBottom:18}}>
              Primero identificate con tu cuenta de Google. Con esa misma cuenta
              vas a entrar siempre: no hay contrasena que recordar.
            </p>

            <BotonGoogle onClick={handleEntrar} enviando={enviando}
              texto="Continuar con Google" />

            {error && <p className={styles.error}>{error}</p>}

            <p className={styles.ayuda} style={{marginTop:20}}>
              ¿Ya tenes cuenta? <Link to="/login" style={{color:'var(--gold)'}}>Entrar</Link>
            </p>
          </>
        ) : (
          <form onSubmit={handleCrear}>
            <p className={styles.ayuda} style={{marginBottom:18}}>
              Hola {user.displayName || user.email}. Contanos de tu bar.
            </p>

            <label className={styles.label} htmlFor="reg-nombre-del-bar">Nombre del bar</label>
            <input id="reg-nombre-del-bar" className="input" value={nombreLocal} autoFocus
              placeholder="Bar La Esquina"
              onChange={e => cambiarNombre(e.target.value)} />

            <label className={styles.label} style={{marginTop:12}} htmlFor="reg-identificador">Identificador</label>
            <input id="reg-identificador" className="input" value={localId}
              placeholder="bar-la-esquina"
              onChange={e => {
                setLocalIdTocado(true)
                setLocalId(generarLocalId(e.target.value))
                setError(null)
              }} />
            <p className={styles.ayuda} style={{marginTop:6, textAlign:'left'}}>
              Va en el link de tus mesas: <strong>/l/{localId || 'tu-bar'}/mesa/1</strong>
            </p>

            {error && <p className={styles.error}>{error}</p>}

            <button type="submit" className="btn btn-gold" style={{marginTop:18, width:'100%'}}
              disabled={enviando}>
              {enviando ? 'Creando tu bar...' : 'Crear mi bar'}
            </button>

            <p className={styles.ayuda} style={{marginTop:16}}>
              ¿No sos vos?{' '}
              <button type="button" onClick={() => cerrarSesion()}
                style={{background:'none', border:'none', color:'var(--gold)', cursor:'pointer', padding:0, font:'inherit'}}>
                Cambiar de cuenta
              </button>
            </p>
          </form>
        )}
      </div>
      <footer className={styles.footer}>{getCopyright()}</footer>
    </div>
  )
}
