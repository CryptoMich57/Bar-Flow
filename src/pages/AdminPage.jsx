import { useState, useEffect } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useSesion, usePertenencia } from '../utils/useSesion'
import { listarLocales, cambiarEstadoLocal } from '../firebase/locales'
import { cerrarSesion } from '../firebase/auth'
import { getCopyright, getNombrePlataforma } from '../config'

// ============================================================
//  PANEL DE LA PLATAFORMA
//
//  La unica vista que ve TODOS los negocios. Entra solo quien tenga
//  documento en superadmins/{uid}, que se crea a mano desde la
//  consola de Firebase. Si esta pantalla se cargara para alguien mas,
//  las reglas devolverian una lista vacia igual: el permiso no depende
//  de que este componente se dibuje.
// ============================================================

const ESTADOS = {
  prueba:     { label: 'En prueba', clase: 'badge badge-yellow' },
  activo:     { label: 'Activo',    clase: 'badge badge-green' },
  suspendido: { label: 'Suspendido', clase: 'badge badge-red' },
}

const fecha = (ts) => {
  const d = ts?.toDate?.()
  return d ? d.toLocaleDateString('es-AR') : '—'
}

export default function AdminPage() {
  const { user, cargando } = useSesion({ anonimoAutomatico: false })
  const { esAdmin, cargando: cargandoPerm } = usePertenencia(user)
  const [locales, setLocales]   = useState([])
  const [cargandoLista, setCargandoLista] = useState(true)
  const [error, setError]       = useState(null)
  const [filtro, setFiltro]     = useState('')

  const recargar = async () => {
    setCargandoLista(true)
    try {
      const datos = await listarLocales()
      datos.sort((a, b) => (b.creado_en?.seconds || 0) - (a.creado_en?.seconds || 0))
      setLocales(datos)
      setError(null)
    } catch {
      setError('No se pudo leer la lista de locales.')
    }
    setCargandoLista(false)
  }

  useEffect(() => {
    if (esAdmin) recargar()
  }, [esAdmin])

  const cambiarEstado = async (localId, estado) => {
    try {
      await cambiarEstadoLocal(localId, estado)
      setLocales(prev => prev.map(l => l.id === localId ? { ...l, estado } : l))
    } catch (e) {
      alert('No se pudo cambiar el estado: ' + e.message)
    }
  }

  if (cargando || cargandoPerm) return (
    <div className="pantallaEstado"><p>Conectando...</p></div>
  )

  if (!user || user.isAnonymous) return <Navigate to="/login" replace />

  if (!esAdmin) return (
    <div className="pantallaEstado">
      <div style={{textAlign:'center'}}>
        <p>Esta sección es solo para la administración de {getNombrePlataforma()}.</p>
        <button className="btn btn-ghost" style={{marginTop:16}} onClick={() => cerrarSesion()}>
          Cambiar de cuenta
        </button>
      </div>
    </div>
  )

  const visibles = locales.filter(l =>
    !filtro.trim() ||
    l.id.includes(filtro.toLowerCase()) ||
    (l.nombre || '').toLowerCase().includes(filtro.toLowerCase())
  )

  const cuenta = (estado) => locales.filter(l => l.estado === estado).length

  return (
    <div style={{minHeight:'100vh', background:'var(--bg)', padding:'24px 16px'}}>
      <div style={{maxWidth:900, margin:'0 auto'}}>

        <header style={{display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:12}}>
          <div>
            <h1 style={{color:'var(--gold)', margin:0, fontSize:'1.4em'}}>
              🛠️ {getNombrePlataforma()} — Plataforma
            </h1>
            <p style={{color:'var(--text2)', fontSize:'0.85em', margin:'4px 0 0'}}>
              {user.email}
            </p>
          </div>
          <button className="btn btn-ghost" onClick={() => cerrarSesion()}>Cerrar sesion</button>
        </header>

        <div style={{display:'flex', gap:12, flexWrap:'wrap', margin:'24px 0'}}>
          <div className="card" style={{flex:'1 1 120px', textAlign:'center'}}>
            <div style={{fontSize:'1.6em', color:'var(--gold)'}}>{locales.length}</div>
            <div style={{color:'var(--text2)', fontSize:'0.8em'}}>Locales</div>
          </div>
          <div className="card" style={{flex:'1 1 120px', textAlign:'center'}}>
            <div style={{fontSize:'1.6em', color:'var(--gold)'}}>{cuenta('activo')}</div>
            <div style={{color:'var(--text2)', fontSize:'0.8em'}}>Activos</div>
          </div>
          <div className="card" style={{flex:'1 1 120px', textAlign:'center'}}>
            <div style={{fontSize:'1.6em', color:'var(--gold)'}}>{cuenta('prueba')}</div>
            <div style={{color:'var(--text2)', fontSize:'0.8em'}}>En prueba</div>
          </div>
          <div className="card" style={{flex:'1 1 120px', textAlign:'center'}}>
            <div style={{fontSize:'1.6em', color:'var(--gold)'}}>{cuenta('suspendido')}</div>
            <div style={{color:'var(--text2)', fontSize:'0.8em'}}>Suspendidos</div>
          </div>
        </div>

        <input className="input" placeholder="Buscar por nombre o identificador"
          value={filtro} onChange={e => setFiltro(e.target.value)} />

        {error && <p style={{color:'var(--red)', marginTop:16}}>{error}</p>}

        {cargandoLista ? (
          <p style={{color:'var(--text2)', marginTop:24}}>Cargando locales...</p>
        ) : visibles.length === 0 ? (
          <p style={{color:'var(--text2)', marginTop:24}}>
            {locales.length === 0 ? 'Todavia no hay ningun local registrado.' : 'Ningun local coincide con la busqueda.'}
          </p>
        ) : (
          <div style={{marginTop:16}}>
            {visibles.map(l => {
              const estado = ESTADOS[l.estado] || ESTADOS.prueba
              return (
                <div key={l.id} className="card" style={{marginBottom:12}}>
                  <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12, flexWrap:'wrap'}}>
                    <div>
                      <div style={{display:'flex', alignItems:'center', gap:8, flexWrap:'wrap'}}>
                        <strong>{l.nombre || l.id}</strong>
                        <span className={estado.clase}>{estado.label}</span>
                      </div>
                      <div style={{color:'var(--text3)', fontSize:'0.8em', marginTop:4}}>
                        /l/{l.id} · alta {fecha(l.creado_en)}
                      </div>
                    </div>
                    <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
                      <Link to={`/l/${l.id}/encargado`} className="btn btn-ghost">Entrar</Link>
                      {l.estado !== 'activo' && (
                        <button className="btn btn-gold" onClick={() => cambiarEstado(l.id, 'activo')}>
                          Activar
                        </button>
                      )}
                      {l.estado !== 'suspendido' ? (
                        <button className="btn btn-danger" onClick={() => cambiarEstado(l.id, 'suspendido')}>
                          Suspender
                        </button>
                      ) : (
                        <button className="btn btn-ghost" onClick={() => cambiarEstado(l.id, 'prueba')}>
                          Reactivar en prueba
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <p style={{color:'var(--text3)', fontSize:'0.75em', marginTop:32}}>
          Suspender un local corta el acceso de sus comensales al instante: las
          reglas dejan de considerarlo activo. El personal tampoco puede operar.
        </p>

        <footer style={{color:'var(--text3)', fontSize:'0.72em', textAlign:'center', marginTop:24}}>
          {getCopyright()}
        </footer>
      </div>
    </div>
  )
}
