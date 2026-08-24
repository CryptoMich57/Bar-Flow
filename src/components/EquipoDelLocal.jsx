import { useState, useEffect } from 'react'
import {
  suscribirEmpleados, suscribirInvitaciones, invitarEmpleado,
  cancelarInvitacion, cambiarRolEmpleado, activarEmpleado,
  quitarEmpleado, ROLES, ETIQUETA_ROL,
} from '../firebase/locales'
import { auth } from '../firebase/config'

// ============================================================
//  EQUIPO DEL LOCAL
//
//  El personal entra con su cuenta de Google, asi que el encargado no
//  puede crearle la cuenta a nadie: lo que hace es dejar una
//  INVITACION con el email de la persona. Cuando esa persona entra por
//  primera vez, la app encuentra la invitacion y le da su ficha con el
//  rol que le corresponde.
//
//  Ventaja de fondo: nunca circula una contrasena. Ni por WhatsApp, ni
//  anotada al lado de la caja, ni guardada por nosotros.
//
//  Las reglas siguen siendo las que mandan: un encargado solo escribe
//  invitaciones y fichas dentro de SU local, y no puede quitarse a si
//  mismo el rol ni desactivarse.
// ============================================================

const ROL_DESC = {
  encargado: 'Ve todo: salon, carta, caja, estadisticas y ajustes.',
  cocina:    'Solo el tablero de comandas de cocina.',
  mozo:      'Alertas, sus mesas y toma de pedidos.',
}

export default function EquipoDelLocal({ localId }) {
  const [equipo, setEquipo]           = useState([])
  const [invitaciones, setInvitaciones] = useState([])
  const [abriendo, setAbriendo]       = useState(false)
  const [nombre, setNombre]           = useState('')
  const [email, setEmail]             = useState('')
  const [rol, setRol]                 = useState('mozo')
  const [error, setError]             = useState(null)
  const [aviso, setAviso]             = useState(null)
  const [enviando, setEnviando]       = useState(false)

  const miUid = auth.currentUser?.uid

  useEffect(() => {
    if (!localId) return
    const u1 = suscribirEmpleados(localId, setEquipo)
    const u2 = suscribirInvitaciones(localId, setInvitaciones)
    return () => { u1(); u2() }
  }, [localId])

  const limpiar = () => {
    setNombre(''); setEmail(''); setRol('mozo')
    setError(null); setAbriendo(false)
  }

  const handleInvitar = async (e) => {
    e?.preventDefault?.()
    setError(null)
    if (!nombre.trim()) return setError('Poné el nombre de la persona.')
    if (!email.includes('@')) return setError('Poné el email de Google de la persona.')

    setEnviando(true)
    try {
      await invitarEmpleado({ localId, email, nombre, rol })
      setAviso(`Listo. ${nombre.trim()} entra en ${email.trim().toLowerCase()} y queda dentro sola.`)
      setTimeout(() => setAviso(null), 8000)
      limpiar()
    } catch (err) {
      setError(err?.message || 'No se pudo crear la invitacion.')
    }
    setEnviando(false)
  }

  const handleRol = async (uid, nuevoRol) => {
    try { await cambiarRolEmpleado(localId, uid, nuevoRol) }
    catch (e) { alert('No se pudo cambiar el rol: ' + e.message) }
  }

  const handleActivo = async (uid, activo) => {
    try { await activarEmpleado(localId, uid, activo) }
    catch (e) { alert('No se pudo cambiar el estado: ' + e.message) }
  }

  const handleQuitar = async (uid, nombrePersona) => {
    if (!window.confirm(`¿Quitar a ${nombrePersona} del equipo? Deja de tener acceso al instante.`)) return
    try { await quitarEmpleado(localId, uid) }
    catch (e) { alert('No se pudo quitar: ' + e.message) }
  }

  const handleCancelar = async (mail) => {
    if (!window.confirm(`¿Cancelar la invitacion a ${mail}?`)) return
    try { await cancelarInvitacion(localId, mail) }
    catch (e) { alert('No se pudo cancelar: ' + e.message) }
  }

  return (
    <div>
      <p style={{color:'var(--text2)', fontSize:'0.85em', marginTop:0}}>
        Cada persona entra con su cuenta de Google — no hay contrasenas que
        recordar ni que pasarse. Anota su email y queda dentro la primera vez
        que abre la app.
      </p>

      {aviso && (
        <p style={{color:'var(--green)', fontSize:'0.85em', margin:'12px 0'}}>✅ {aviso}</p>
      )}

      {/* ── EN EL EQUIPO ── */}
      <div style={{marginTop:16}}>
        {equipo.length === 0 ? (
          <p style={{color:'var(--text3)', fontSize:'0.85em'}}>Todavia no hay nadie cargado.</p>
        ) : equipo.map(p => {
          const soyYo = p.uid === miUid
          return (
            <div key={p.uid} className="card" style={{
              marginBottom:10, padding:'12px 14px',
              opacity: p.activo === false ? 0.5 : 1,
            }}>
              <div style={{display:'flex', justifyContent:'space-between', gap:12, flexWrap:'wrap', alignItems:'center'}}>
                <div style={{minWidth:0}}>
                  <div style={{display:'flex', alignItems:'center', gap:8, flexWrap:'wrap'}}>
                    <strong>{p.nombre || p.email}</strong>
                    {soyYo && <span className="badge badge-gold">vos</span>}
                    {p.activo === false && <span className="badge badge-red">sin acceso</span>}
                  </div>
                  <div style={{color:'var(--text3)', fontSize:'0.78em', marginTop:2, wordBreak:'break-all'}}>
                    {p.email}
                  </div>
                </div>

                <div style={{display:'flex', gap:8, alignItems:'center', flexWrap:'wrap'}}>
                  <select className="input" style={{width:'auto', padding:'8px 10px'}}
                    value={p.rol} disabled={soyYo}
                    onChange={e => handleRol(p.uid, e.target.value)}>
                    {ROLES.map(r => <option key={r} value={r}>{ETIQUETA_ROL[r]}</option>)}
                  </select>

                  {!soyYo && (
                    <>
                      <button className="btn btn-ghost" style={{padding:'8px 12px'}}
                        onClick={() => handleActivo(p.uid, p.activo === false)}>
                        {p.activo === false ? 'Dar acceso' : 'Quitar acceso'}
                      </button>
                      <button className="btn btn-danger" style={{padding:'8px 12px'}}
                        onClick={() => handleQuitar(p.uid, p.nombre || p.email)}>
                        Eliminar
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── INVITACIONES PENDIENTES ── */}
      {invitaciones.length > 0 && (
        <div style={{marginTop:20}}>
          <h4 style={{margin:'0 0 8px', color:'var(--text2)', fontSize:'0.85em'}}>
            Invitaciones pendientes
          </h4>
          {invitaciones.map(inv => (
            <div key={inv.email} className="card" style={{
              marginBottom:8, padding:'10px 14px', borderStyle:'dashed',
            }}>
              <div style={{display:'flex', justifyContent:'space-between', gap:12, flexWrap:'wrap', alignItems:'center'}}>
                <div style={{minWidth:0}}>
                  <div style={{display:'flex', alignItems:'center', gap:8, flexWrap:'wrap'}}>
                    <strong>{inv.nombre || inv.email}</strong>
                    <span className="badge badge-yellow">esperando</span>
                    <span style={{color:'var(--text3)', fontSize:'0.78em'}}>{ETIQUETA_ROL[inv.rol]}</span>
                  </div>
                  <div style={{color:'var(--text3)', fontSize:'0.78em', marginTop:2, wordBreak:'break-all'}}>
                    {inv.email}
                  </div>
                </div>
                <button className="btn btn-ghost" style={{padding:'8px 12px'}}
                  onClick={() => handleCancelar(inv.email)}>
                  Cancelar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── INVITAR ── */}
      {!abriendo ? (
        <button className="btn btn-gold" style={{marginTop:16}} onClick={() => setAbriendo(true)}>
          + Invitar a alguien
        </button>
      ) : (
        <form className="card" style={{marginTop:12}} onSubmit={handleInvitar}>
          <h4 style={{margin:'0 0 12px', color:'var(--gold)'}}>Invitar a alguien</h4>

          <label style={{color:'var(--text2)', fontSize:'0.8em'}}>Nombre</label>
          <input className="input" value={nombre} autoFocus
            placeholder="Nombre y apellido"
            onChange={e => { setNombre(e.target.value); setError(null) }} />

          <label style={{color:'var(--text2)', fontSize:'0.8em', display:'block', marginTop:10}}>
            Email de su cuenta de Google
          </label>
          <input className="input" type="email" value={email}
            placeholder="persona@gmail.com"
            onChange={e => { setEmail(e.target.value); setError(null) }} />
          <p style={{color:'var(--text3)', fontSize:'0.72em', margin:'6px 0 0'}}>
            Tiene que ser el mismo con el que va a entrar. Si se equivoca de
            cuenta, la app no la va a reconocer.
          </p>

          <label style={{color:'var(--text2)', fontSize:'0.8em', display:'block', marginTop:10}}>Rol</label>
          <select className="input" value={rol} onChange={e => setRol(e.target.value)}>
            {ROLES.map(r => <option key={r} value={r}>{ETIQUETA_ROL[r]}</option>)}
          </select>
          <p style={{color:'var(--text3)', fontSize:'0.72em', margin:'6px 0 0'}}>{ROL_DESC[rol]}</p>

          {error && <p style={{color:'var(--red)', fontSize:'0.85em', marginTop:12}}>{error}</p>}

          <div style={{display:'flex', gap:10, marginTop:16}}>
            <button type="submit" className="btn btn-gold" disabled={enviando}>
              {enviando ? 'Invitando...' : 'Invitar'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={limpiar} disabled={enviando}>
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
