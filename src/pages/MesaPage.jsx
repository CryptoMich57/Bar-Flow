import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import {
  suscribirMesa, ocuparMesa, agregarAlCarrito, quitarDelCarrito,
  confirmarPedido, agregarPedidoExtra, suscribirPedidos,
  suscribirCarta, pedirCuenta, enviarMensaje, suscribirMensajes
} from '../firebase/mesa'
import { addDoc, serverTimestamp } from 'firebase/firestore'
import { colLlamadas } from '../firebase/rutas'
import { useLocal } from '../utils/LocalContext'
import { categoriasDeLaCarta, esDeCategoria, etiquetaDeCategoria } from '../utils/categorias'
import { rolDelMensaje } from '../utils/noLeidos'
import { crearRegistroDeAvisos, novedades } from '../utils/avisos'
import { getCopyright, getTextos } from '../config'
import { cargarConfiguracion } from '../firebase/configuracion'
import styles from './MesaPage.module.css'
import { sonidoMensaje, activarAudio } from '../utils/sonidos'

// ── Persistencia de sesión ───────────────────────────────────────────────────
const getDispositivoId = () => {
  let id = localStorage.getItem('dispositivo_id')
  if (!id) { id = 'disp_' + Math.random().toString(36).slice(2); localStorage.setItem('dispositivo_id', id) }
  return id
}
// La sesion se guarda por local Y por mesa. Con una sola clave global, al
// pasar de un bar a otro se reusaba el nombre y la cantidad de personas del
// anterior, y el comensal aparecia sentado en una mesa que no era la suya.
const claveSesion = (localId, mesaId) => `sesion_mesa:${localId}:${mesaId}`

const guardarSesion = (localId, mesaId, nombre, personas) => {
  localStorage.setItem(
    claveSesion(localId, mesaId),
    JSON.stringify({ localId, mesaId, nombre, personas, ts: Date.now() })
  )
}
const cargarSesion = (localId, mesaId) => {
  if (!localId || !mesaId) return null
  try {
    const s = JSON.parse(localStorage.getItem(claveSesion(localId, mesaId)) || '{}')
    // Solo recuperar si es el mismo local y mesa, y no pasaron más de 4 horas
    if (s.localId === localId && s.mesaId === mesaId
        && Date.now() - s.ts < 4 * 60 * 60 * 1000) return s
  } catch {}
  return null
}
const borrarSesion = (localId, mesaId) => localStorage.removeItem(claveSesion(localId, mesaId))

export default function MesaPage() {
  // El QR de la mesa trae el local y el numero: /l/:localId/mesa/:mesaId
  const { localId, nombre: nombreBar, logo } = useLocal()
  const { mesaId } = useParams()
  const dispositivoId = getDispositivoId()
  const textos = getTextos()
  const [configApp, setConfigApp] = useState(null)

  useEffect(() => {
    cargarConfiguracion(localId).then(setConfigApp)
  }, [localId])

  // Recuperar sesión guardada
  const sesionGuardada = cargarSesion(localId, mesaId)

  const [paso, setPaso]             = useState(sesionGuardada ? 'carta' : 'bienvenida')
  const [nombre, setNombre]         = useState(sesionGuardada?.nombre || '')
  const [personas, setPersonas]     = useState(sesionGuardada?.personas || 1)
  const [mesa, setMesa]             = useState(null)
  const [carta, setCarta]           = useState([])
  const [pedidos, setPedidos]       = useState([])
  const [mensajes, setMensajes]     = useState([])
  const [categoriaActiva, setCategoriaActiva] = useState(null)
  const [carritoLocal, setCarritoLocal] = useState([])
  const [notasPorItem, setNotasPorItem] = useState({})
  const [textoMensaje, setTextoMensaje] = useState('')
  const [metodoPago, setMetodoPago] = useState(null)
  const [propina, setPropina]       = useState(0)
  const [propinaCustom, setPropinaCustom] = useState('')
  const [abonaCon, setAbonaCon]     = useState('')
  const [cargando, setCargando]     = useState(false)
  const [error, setError]           = useState(null)
  const [tab, setTab]               = useState('carta')
  // El comensal casi siempre esta mirando la carta. Sin una marca visible,
  // la respuesta del encargado llegaba y nadie la veia.
  const [chatSinLeer, setChatSinLeer] = useState(false)
  const tabRef = useRef('carta')
  const [llamadoMozo, setLlamadoMozo] = useState(false)
  const [notaMozo, setNotaMozo]     = useState('')
  const [showLlamarMozo, setShowLlamarMozo] = useState(false)
  const mensajesRef = useRef(null)
  const avisosMensajes = useRef(crearRegistroDeAvisos())

  // Si hay sesión guardada, registrar dispositivo en firebase al montar
  useEffect(() => {
    if (sesionGuardada && paso === 'carta') {
      ocuparMesa(localId, mesaId, sesionGuardada.nombre, dispositivoId, sesionGuardada.personas)
        .catch(() => {})
    }
  }, [localId, mesaId])

  useEffect(() => {
    if (paso === 'bienvenida' || paso === 'nombre') return
    const unsub = suscribirMesa(localId, mesaId, (data) => {
      setMesa(data)
      // Si el encargado liberó la mesa, limpiar sesión y mostrar despedida
      if (data?.estado === 'libre' && paso === 'carta') {
        borrarSesion(localId, mesaId)
        setPaso('pagado')
      }
    })
    return unsub
  }, [localId, mesaId, paso])

  useEffect(() => {
    tabRef.current = tab
    if (tab === 'mensajes') setChatSinLeer(false)
  }, [tab])

  useEffect(() => {
    if (paso === 'bienvenida' || paso === 'nombre') return
    const unsub = suscribirPedidos(localId, mesaId, setPedidos)
    return unsub
  }, [localId, mesaId, paso])

  useEffect(() => {
    // Sin aviso, una carta que no se puede leer se ve igual que una carta
    // vacia, y el comensal se queda esperando sin saber que hacer.
    return suscribirCarta(localId, setCarta,
      () => setError('No pudimos cargar la carta. Proba de nuevo en un momento.'))
  }, [localId])

  useEffect(() => {
    if (paso === 'bienvenida' || paso === 'nombre') return
    const unsub = suscribirMensajes(localId, mesaId, (msgs) => {
      // El primer snapshot es la linea de base: si el comensal abre el chat
      // con mensajes ya escritos, no tiene que sonar. Antes se usaba "el
      // registro esta vacio", asi que en una mesa sin mensajes previos el
      // primero del encargado pasaba en silencio.
      const hayNuevo = novedades(
        avisosMensajes.current,
        msgs.map(m => ({ ...m, mesa: mesaId })),
        [mesaId],
      ).some(m => rolDelMensaje(m) === 'staff')
      if (hayNuevo) {
        sonidoMensaje()
        // Si ya esta en el chat lo esta leyendo: no hace falta marcar nada.
        if (tabRef.current !== 'mensajes') setChatSinLeer(true)
      }
      setMensajes(msgs)
      setTimeout(() => mensajesRef.current?.scrollTo({ top: 99999, behavior: 'smooth' }), 100)
    })
    return unsub
  }, [localId, mesaId, paso])

  const handleEntrarNombre = async () => {
    if (!nombre.trim()) return
    setCargando(true)
    setError(null)
    try {
      await ocuparMesa(localId, mesaId, nombre.trim(), dispositivoId, personas)
      guardarSesion(localId, mesaId, nombre.trim(), personas)
      setPaso('carta')
    } catch { setError('No se pudo conectar con la mesa. Intentá de nuevo.') }
    setCargando(false)
  }

  // ── Llamar al mozo ────────────────────────────────────────────────────────
  const handleLlamarMozo = async () => {
    if (!notaMozo.trim()) return
    setCargando(true)
    try {
      await addDoc(colLlamadas(localId, mesaId), {
        nota: notaMozo.trim(), cliente: nombre,
        estado: 'pendiente', created_at: serverTimestamp(),
      })
      setLlamadoMozo(true); setNotaMozo(''); setShowLlamarMozo(false)
      setTimeout(() => setLlamadoMozo(false), 5000)
    } catch { setError('No se pudo enviar.') }
    setCargando(false)
  }

  // ── Carrito ───────────────────────────────────────────────────────────────
  const esCarritoBloqueado = mesa?.carrito_bloqueado

  const agregarItem = async (item) => {
    const nota = notasPorItem[item.id] || ''
    if (esCarritoBloqueado) {
      setCarritoLocal(prev => {
        const existe = prev.find(i => i.id === item.id)
        if (existe) return prev.map(i => i.id === item.id ? { ...i, cantidad: i.cantidad + 1 } : i)
        return [...prev, { id: item.id, cantidad: 1, nota }]
      })
    } else {
      try { await agregarAlCarrito(localId, mesaId, { ...item, nota }) }
      catch (e) { setError(e.message) }
    }
  }

  const quitarItem = async (itemId) => {
    if (esCarritoBloqueado) {
      setCarritoLocal(prev =>
        prev.map(i => i.id === itemId ? { ...i, cantidad: i.cantidad - 1 } : i).filter(i => i.cantidad > 0)
      )
    } else {
      await quitarDelCarrito(localId, mesaId, itemId)
    }
  }

  const getCantidadItem = (itemId) => {
    if (esCarritoBloqueado) return carritoLocal.find(i => i.id === itemId)?.cantidad || 0
    return mesa?.carrito?.find(i => i.id === itemId)?.cantidad || 0
  }

  // El carrito guarda solo que producto y cuantos. El nombre y el precio
  // se resuelven contra la carta vigente al dibujar: lo que se cobra lo
  // calcula el servidor, esto es lo que la persona ve mientras elige.
  const resolverRenglon = (renglon) => {
    const enCarta = carta.find(c => c.id === renglon.id)
    return {
      ...renglon,
      nombre: enCarta?.nombre || 'Ya no esta en la carta',
      precio: enCarta?.precio ?? 0,
      enCarta: !!enCarta,
    }
  }

  const carrito = (esCarritoBloqueado ? carritoLocal : (mesa?.carrito || [])).map(resolverRenglon)
  const totalCarrito = carrito.reduce((acc, i) => acc + i.precio * i.cantidad, 0)
  const hayFueraDeCarta = carrito.some(i => !i.enCarta)

  const handleConfirmar = async () => {
    setCargando(true); setError(null)
    try {
      // Aplicar notas al carrito antes de confirmar
      if (esCarritoBloqueado) {
        if (carritoLocal.length === 0) { setCargando(false); return }
        const itemsConNotas = carritoLocal.map(i => ({ ...i, nota: notasPorItem[i.id] || i.nota || '' }))
        await agregarPedidoExtra(localId, mesaId, itemsConNotas)
        setCarritoLocal([])
      } else {
        await confirmarPedido(localId, mesaId)
      }
      setNotasPorItem({})
    } catch (e) { setError(e.message) }
    setCargando(false)
  }

  // ── Cuenta ────────────────────────────────────────────────────────────────
  const totalFinal = mesa?.total_acumulado || 0
  const calcularPropina = () => {
    if (propina === 'custom') return parseFloat(propinaCustom) || 0
    if (propina === 0) return 0
    return Math.round(totalFinal * propina)
  }

  const handlePedirCuenta = async () => {
    if (!metodoPago) return
    setCargando(true)
    try {
      await pedirCuenta(localId, mesaId, metodoPago, calcularPropina(), metodoPago === 'efectivo' ? abonaCon : null)
    } catch (e) { setError(e.message) }
    setCargando(false)
  }

  const handleEnviarMensaje = async () => {
    if (!textoMensaje.trim()) return
    await enviarMensaje(localId, mesaId, textoMensaje.trim(), nombre, 'cliente')
    setTextoMensaje('')
  }

  const transferencia = configApp?.transferencia || {}

  // ── BIENVENIDA ────────────────────────────────────────────────────────────
  if (paso === 'bienvenida') return (
    <div className={styles.splash}>
      <div className={styles.splashBg} />
      <div className={styles.splashParticles}>
        {[...Array(12)].map((_, i) => <div key={i} className={styles.particle} style={{ '--i': i }} />)}
      </div>
      <div className={styles.splashContent}>
        <div className={styles.splashLogoWrap}>
          <img src={logo} alt="Logo" className={styles.splashLogo} onError={e => e.target.style.display='none'} />
        </div>
        <h1 className={styles.splashTitle}>{textos.bienvenida.titulo}</h1>
        <p className={styles.splashBar}>{nombreBar}</p>
        <p className={styles.splashMesa}>Mesa {mesaId}</p>
        <p className={styles.splashText}>{textos.bienvenida.descripcion}</p>
        <button className={`btn btn-gold ${styles.splashBtn}`} onClick={() => { setPaso('nombre'); activarAudio() }}>
          {textos.bienvenida.boton}
        </button>
      </div>
      <footer className={styles.footer}>{getCopyright()}</footer>
    </div>
  )

  // ── NOMBRE ────────────────────────────────────────────────────────────────
  if (paso === 'nombre') return (
    <div className={styles.centrado}>
      <div className={styles.nombreBox}>
        <img src={logo} alt="Logo" className={styles.miniLogo} onError={e => e.target.style.display='none'} />
        <h2 className={styles.nombreTitle}>{textos.nombre.titulo}</h2>
        <p className={styles.nombreSub}>Mesa {mesaId} · {nombreBar}</p>
        <label className={styles.inputLabel}>Tu nombre o el del grupo</label>
        <input className="input" placeholder="Ej: Mesa de Juan" value={nombre}
          onChange={e => setNombre(e.target.value)} onKeyDown={e => e.key==='Enter'&&handleEntrarNombre()} autoFocus />
        <label className={styles.inputLabel} style={{marginTop:16}}>¿Cuántas personas son?</label>
        <div className={styles.personasRow}>
          {[1,2,3,4,5,6,7,8].map(n => (
            <button key={n} className={`${styles.personaBtn} ${personas===n?styles.personaBtnActivo:''}`}
              onClick={() => setPersonas(n)}>{n}</button>
          ))}
        </div>
        <p className={styles.personasHint}>Así preparamos los cubiertos y cada uno puede elegir su pedido.</p>
        {error && <p className={styles.errorMsg}>{error}</p>}
        <button className="btn btn-gold" style={{marginTop:20}} onClick={handleEntrarNombre} disabled={!nombre.trim()||cargando}>
          {cargando ? 'Conectando...' : textos.nombre.boton}
        </button>
      </div>
      <footer className={styles.footer}>{getCopyright()}</footer>
    </div>
  )

  // ── DESPEDIDA ─────────────────────────────────────────────────────────────
  if (paso === 'pagado') return (
    <div className={styles.centrado}>
      <div className={styles.nombreBox} style={{textAlign:'center'}}>
        <div style={{fontSize:56,marginBottom:16}}>{textos.despedida.emoji}</div>
        <h2 style={{color:'var(--gold)'}}>{textos.despedida.titulo}</h2>
        <p style={{color:'var(--text2)',marginTop:12,lineHeight:1.7}}>{textos.despedida.mensaje}</p>
        <p style={{color:'var(--text3)',marginTop:16,fontSize:'0.85em'}}>{nombreBar}</p>
      </div>
      <footer className={styles.footer}>{getCopyright()}</footer>
    </div>
  )

  // ── VISTA PRINCIPAL ───────────────────────────────────────────────────────
  // Las categorias salen de lo que la carta realmente tiene, y la primera
  // se elige sola. Fijarla en 'comida' dejaba la pantalla vacia en un bar
  // que solo vende bebidas, y un producto con categoria desconocida
  // desaparecia del menu en vez de caer en "Otros".
  const categoriasVisibles = categoriasDeLaCarta(carta)
  const categoriaMostrada = categoriaActiva || categoriasVisibles[0] || null
  const cartaFiltrada = carta.filter(i => esDeCategoria(i, categoriaMostrada))

  return (
    <div className={styles.app}>

      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <img src={logo} alt="Logo" className={styles.headerLogo} onError={e => e.target.style.display='none'} />
          <div>
            <span className={styles.mesaLabel}>Mesa {mesaId}</span>
            <span className={styles.nombreLabel}>{nombre}</span>
          </div>
        </div>
        <div className={styles.headerRight}>
          <button className={`${styles.llamarBtn} ${llamadoMozo?styles.llamarEnviado:''}`}
            onClick={() => setShowLlamarMozo(true)}>
            {llamadoMozo ? '✓ Enviado' : '✋'}
          </button>
          {mesa?.total_acumulado > 0 && mesa?.estado !== 'esperando_cuenta' && (
            <span className={styles.totalHeader}>${mesa.total_acumulado.toLocaleString()}</span>
          )}
          {mesa?.estado === 'esperando_cuenta' && <span className="badge badge-yellow">Cuenta en camino</span>}
        </div>
      </header>

      {/* Modal llamar mozo */}
      {showLlamarMozo && (
        <div className={styles.modalOverlay} onClick={() => setShowLlamarMozo(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>✋ Llamar al mozo</h3>
            <p className={styles.modalSub}>¿Qué necesitás?</p>
            <div className={styles.notasRapidas}>
              {['Me falta hielo','Me falta un cubierto','Me falta una servilleta','Tengo una consulta'].map(nota => (
                <button key={nota} className={styles.notaRapida} onClick={() => setNotaMozo(nota)}>{nota}</button>
              ))}
            </div>
            <input className="input" style={{marginTop:10}} placeholder="O escribí lo que necesitás..."
              value={notaMozo} onChange={e => setNotaMozo(e.target.value)} />
            <div style={{display:'flex',gap:8,marginTop:12}}>
              <button className="btn btn-ghost" style={{flex:1}} onClick={() => setShowLlamarMozo(false)}>Cancelar</button>
              <button className="btn btn-gold" style={{flex:2}} onClick={handleLlamarMozo} disabled={!notaMozo.trim()||cargando}>
                Llamar ✋
              </button>
            </div>
          </div>
        </div>
      )}

      {mesa?.dispositivos?.length > 1 && !esCarritoBloqueado && (
        <div className={styles.alertaMulti}>
          ⚠️ Hay {mesa.dispositivos.length} dispositivos en esta mesa. Coordiná el pedido.
        </div>
      )}

      <nav className={styles.tabs}>
        {[
          {key:'carta',    label:'Carta',    emoji:'📋'},
          {key:'pedidos',  label:'Pedidos',  emoji:'🧾'},
          {key:'mensajes', label:'Chat',     emoji:'💬'},
          {key:'cuenta',   label:'Cuenta',   emoji:'💳'},
        ].map(t => (
          <button key={t.key} className={`${styles.tab} ${tab===t.key?styles.tabActivo:''}`} onClick={() => setTab(t.key)}>
            {t.emoji} {t.label}
            {t.key === 'mensajes' && chatSinLeer && (
              <span className={styles.puntoSinLeer} aria-label="Mensaje sin leer" />
            )}
          </button>
        ))}
      </nav>

      {/* ── CARTA ────────────────────────────────────────────────────────── */}
      {tab === 'carta' && (
        <div className={styles.content}>
          <div className={styles.categorias}>
            {categoriasVisibles.map(key => {
              const val = etiquetaDeCategoria(key === 'otros' ? null : key)
              return (
                <button key={key} className={`${styles.catBtn} ${categoriaMostrada===key?styles.catActivo:''}`}
                  onClick={() => setCategoriaActiva(key)}>
                  {val.emoji} {val.label}
                </button>
              )
            })}
          </div>

          {/* Nota guía carta */}
          {carrito.length === 0 && !esCarritoBloqueado && (
            <div className={styles.guiaBox}>
              <span className={styles.guiaEmoji}>👆</span>
              <p>Tocá el <strong>+</strong> para agregar lo que querés. Cuando termines, confirmá tu pedido.</p>
            </div>
          )}

          {/* Carrito actual (antes de confirmar) */}
          {!esCarritoBloqueado && carrito.length > 0 && (
            <div className={styles.carritoPreview}>
              <p className={styles.carritoPreviewTitle}>🛒 Tu pedido actual</p>
              {carrito.map(item => (
                <div key={item.id} className={styles.carritoPreviewItem}>
                  <div className={styles.carritoPreviewInfo}>
                    <span>{item.nombre}</span>
                    <input
                      className={styles.notaInput}
                      placeholder="Nota (ej: sin tomate)..."
                      value={notasPorItem[item.id] || ''}
                      onChange={e => setNotasPorItem(prev => ({ ...prev, [item.id]: e.target.value }))}
                    />
                  </div>
                  <div className={styles.itemControles}>
                    <button className={styles.contBtn} aria-label={`Quitar uno de ${item.nombre}`}
                      onClick={() => quitarItem(item.id)}>−</button>
                    <span className={styles.contNum}>{item.cantidad}</span>
                    <button className={styles.contBtn} aria-label={`Agregar otro ${item.nombre}`}
                      onClick={() => agregarItem(item)}>+</button>
                  </div>
                  <span className={styles.carritoItemPrecio}>${(item.precio*item.cantidad).toLocaleString()}</span>
                </div>
              ))}
              <div className={styles.carritoPreviewTotal}>
                <span>Total</span>
                <span>${totalCarrito.toLocaleString()}</span>
              </div>
              {hayFueraDeCarta && (
                <p className={styles.errorMsg}>
                  Hay algo que el bar dejo de ofrecer mientras elegias. Sacalo del pedido para continuar.
                </p>
              )}
              {error && <p className={styles.errorMsg}>{error}</p>}
              <button className="btn btn-gold" style={{width:'100%',marginTop:10}}
                onClick={handleConfirmar} disabled={cargando || hayFueraDeCarta}>
                {cargando ? 'Enviando...' : '✅ Confirmar pedido'}
              </button>
            </div>
          )}

          {/* Carrito post-confirmación */}
          {esCarritoBloqueado && carritoLocal.length > 0 && (
            <div className={styles.carritoPreview}>
              <p className={styles.carritoPreviewTitle}>➕ Agregar al pedido</p>
              {carritoLocal.map(item => (
                <div key={item.id} className={styles.carritoPreviewItem}>
                  <div className={styles.carritoPreviewInfo}>
                    <span>{item.nombre}</span>
                    <input
                      className={styles.notaInput}
                      placeholder="Nota (ej: sin tomate)..."
                      value={notasPorItem[item.id] || item.nota || ''}
                      onChange={e => setNotasPorItem(prev => ({ ...prev, [item.id]: e.target.value }))}
                    />
                  </div>
                  <div className={styles.itemControles}>
                    <button className={styles.contBtn} aria-label={`Quitar uno de ${item.nombre}`}
                      onClick={() => quitarItem(item.id)}>−</button>
                    <span className={styles.contNum}>{item.cantidad}</span>
                    <button className={styles.contBtn} aria-label={`Agregar otro ${item.nombre}`}
                      onClick={() => agregarItem(item)}>+</button>
                  </div>
                  <span className={styles.carritoItemPrecio}>${(item.precio*item.cantidad).toLocaleString()}</span>
                </div>
              ))}
              {error && <p className={styles.errorMsg}>{error}</p>}
              <button className="btn btn-gold" style={{width:'100%',marginTop:10}} onClick={handleConfirmar} disabled={cargando}>
                {cargando ? 'Enviando...' : '➕ Agregar al pedido'}
              </button>
            </div>
          )}

          <div className={styles.items}>
            {cartaFiltrada.map(item => {
              const cant = getCantidadItem(item.id)
              return (
                <div key={item.id} className={styles.itemCard}>
                  <div className={styles.itemInfo}>
                    <span className={styles.itemNombre}>{item.nombre}</span>
                    <span className={styles.itemDesc}>{item.descripcion}</span>
                    <span className={styles.itemPrecio}>${item.precio.toLocaleString()}</span>
                  </div>
                  <div className={styles.itemControles}>
                    {cant > 0 ? (
                      <>
                        <button className={styles.contBtn} aria-label={`Quitar uno de ${item.nombre}`}
                          onClick={() => quitarItem(item.id)}>−</button>
                        <span className={styles.contNum}>{cant}</span>
                        <button className={styles.contBtn} aria-label={`Agregar otro ${item.nombre}`}
                          onClick={() => agregarItem(item)}>+</button>
                      </>
                    ) : (
                      <button className={styles.addBtn} aria-label={`Agregar ${item.nombre}`}
                        onClick={() => agregarItem(item)}>+</button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── PEDIDOS ──────────────────────────────────────────────────────── */}
      {tab === 'pedidos' && (
        <div className={styles.content}>
          <div className={styles.guiaBox} style={{marginBottom:12}}>
            <span className={styles.guiaEmoji}>🧾</span>
            <p>Acá ves el estado de tus pedidos en tiempo real. <strong>⏳ Pendiente → 👨‍🍳 Preparando → ✅ Listo → 🎉 Entregado</strong></p>
          </div>
          {pedidos.length === 0
            ? <div className={styles.empty}><p>Todavía no hay pedidos.</p></div>
            : pedidos.map((p, i) => (
              <div key={p.id} className={styles.pedidoCard}>
                <div className={styles.pedidoHeader}>
                  <span>Pedido #{i+1}</span>
                  <span className={`badge badge-${p.estado==='entregado'?'green':p.estado==='listo'?'yellow':'gold'}`}>
                    {p.estado==='pendiente'&&'⏳ Pendiente'}
                    {p.estado==='en_preparacion'&&'👨‍🍳 Preparando'}
                    {p.estado==='listo'&&'✅ Listo para llevar'}
                    {p.estado==='entregado'&&'🎉 Entregado'}
                  </span>
                </div>
                {p.items.map((item, j) => (
                  <div key={j} className={styles.pedidoItem}>
                    <div>
                      <span>{item.cantidad}× {item.nombre}</span>
                      {item.nota && <p style={{color:'var(--yellow)',fontSize:'0.78em',marginTop:2}}>📝 {item.nota}</p>}
                    </div>
                    <span>${(item.precio*item.cantidad).toLocaleString()}</span>
                  </div>
                ))}
                <div className={styles.pedidoTotal}>Total: ${p.total?.toLocaleString()}</div>
              </div>
            ))
          }
        </div>
      )}

      {/* ── CHAT ─────────────────────────────────────────────────────────── */}
      {tab === 'mensajes' && (
        <div className={styles.chatContainer}>
          <div className={styles.chatMensajes} ref={mensajesRef}>
            {mensajes.length === 0 && (
              <div style={{textAlign:'center',padding:24}}>
                <p style={{fontSize:'1.5em',marginBottom:8}}>💬</p>
                <p style={{color:'var(--text2)',fontSize:'0.88em',fontWeight:600,marginBottom:4}}>Chateá con el encargado</p>
                <p style={{color:'var(--text3)',fontSize:'0.82em',lineHeight:1.6}}>
                  ¿Necesitás algo? ¿Tenés alguna consulta?<br/>Escribinos y te respondemos enseguida.
                </p>
              </div>
            )}
            {mensajes.map(m => (
              <div key={m.id} className={`${styles.msg} ${rolDelMensaje(m)==='staff'?styles.msgOtro:styles.msgPropio}`}>
                <span className={styles.msgAutor}>
                  {rolDelMensaje(m)==='staff' ? 'Encargado' : (m.autor===nombre ? 'Vos' : m.autor)}
                </span>
                <span className={styles.msgTexto}>{m.texto}</span>
              </div>
            ))}
          </div>
          <div className={styles.chatInput}>
            <input className="input" style={{borderRadius:'10px 0 0 10px',borderRight:'none'}}
              placeholder="Escribí un mensaje..." value={textoMensaje}
              onChange={e => setTextoMensaje(e.target.value)} onKeyDown={e => e.key==='Enter'&&handleEnviarMensaje()} />
            <button className={styles.chatSend} onClick={handleEnviarMensaje} disabled={!textoMensaje.trim()}>→</button>
          </div>
        </div>
      )}

      {/* ── CUENTA ───────────────────────────────────────────────────────── */}
      {tab === 'cuenta' && (
        <div className={styles.content}>
          {pedidos.length === 0
            ? <div className={styles.empty}><p>Todavía no hay nada para mostrar.</p></div>
            : (
            <>
              <div className={styles.ticket}>
                <div className={styles.ticketHeader}>
                  <span>{nombreBar}</span><span>Mesa {mesaId} · {nombre}</span>
                </div>
                <div className="divider" />
                {pedidos.map((p, i) => (
                  <div key={p.id}>
                    <p style={{color:'var(--text3)',fontSize:'0.78em',marginBottom:6}}>Pedido #{i+1}</p>
                    {p.items.map((item, j) => (
                      <div key={j} className={styles.ticketRow}>
                        <div>
                          <span>{item.cantidad}× {item.nombre}</span>
                          {item.nota && <p style={{color:'var(--text3)',fontSize:'0.75em'}}>{item.nota}</p>}
                        </div>
                        <span>${(item.precio*item.cantidad).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                ))}
                <div className="divider" />
                <div className={styles.ticketTotal}><span>Subtotal</span><span>${totalFinal.toLocaleString()}</span></div>
                {calcularPropina() > 0 && (
                  <div className={styles.ticketRow}>
                    <span style={{color:'var(--text2)'}}>Propina</span>
                    <span style={{color:'var(--green)'}}>+${calcularPropina().toLocaleString()}</span>
                  </div>
                )}
                <div className={styles.ticketFinal}>
                  <span>TOTAL</span>
                  <span>${(totalFinal+calcularPropina()).toLocaleString()}</span>
                </div>
              </div>

              {mesa?.estado !== 'esperando_cuenta' && mesa?.estado !== 'cuenta_cobrada' && (
                <>
                  <h3 className={styles.seccionLabel}>¿Querés dejar propina?</h3>
                  <div className={styles.propinaOpciones}>
                    {[0,0.1,0.15,'custom'].map(op => (
                      <button key={op} className={`${styles.propinaBtn} ${propina===op?styles.propinaBtnActivo:''}`}
                        onClick={() => setPropina(op)}>
                        {op===0?'Sin propina':op==='custom'?'Otra':`${op*100}%`}
                      </button>
                    ))}
                  </div>
                  {propina==='custom' && (
                    <input className="input" style={{marginTop:10}} placeholder="Monto de propina..."
                      type="number" value={propinaCustom} onChange={e => setPropinaCustom(e.target.value)} />
                  )}

                  <h3 className={styles.seccionLabel}>Método de pago</h3>
                  <div className={styles.pagoOpciones}>
                    {['efectivo','tarjeta','transferencia'].map(m => (
                      <button key={m} className={`${styles.pagoBtn} ${metodoPago===m?styles.pagoBtnActivo:''}`}
                        onClick={() => setMetodoPago(m)}>
                        {m==='efectivo'?'💵 Efectivo':m==='tarjeta'?'💳 Tarjeta':'📲 Transferencia'}
                      </button>
                    ))}
                  </div>

                  {/* Efectivo: preguntar con cuánto abona */}
                  {metodoPago === 'efectivo' && (
                    <div className={styles.transferenciaBox} style={{marginTop:10}}>
                      <p className={styles.transferenciaTitle}>¿Con cuánto abonás?</p>
                      <p style={{color:'var(--text2)',fontSize:'0.82em',marginBottom:8}}>
                        Total a pagar: <strong>${(totalFinal+calcularPropina()).toLocaleString()}</strong>
                      </p>
                      <input className="input" type="number" placeholder="Ej: 5000"
                        value={abonaCon} onChange={e => setAbonaCon(e.target.value)} />
                      {abonaCon && parseFloat(abonaCon) >= totalFinal + calcularPropina() && (
                        <p style={{color:'var(--green)',fontSize:'0.85em',marginTop:6}}>
                          Vuelto: ${(parseFloat(abonaCon) - totalFinal - calcularPropina()).toLocaleString()}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Transferencia: datos bancarios */}
                  {metodoPago === 'transferencia' && (
                    <div className={styles.transferenciaBox}>
                      <p className={styles.transferenciaTitle}>📲 Realizá la transferencia y esperá la confirmación</p>
                      <p style={{color:'var(--text2)',fontSize:'0.8em',marginBottom:10,lineHeight:1.5}}>
                        Una vez que transferís, el encargado confirma el pago y te avisamos por acá.
                      </p>
                      <div className={styles.transferenciaRow}><span>Titular</span><strong>{transferencia.titular}</strong></div>
                      <div className={styles.transferenciaRow}><span>Banco</span><strong>{transferencia.banco}</strong></div>
                      <div className={styles.transferenciaRow}><span>CBU</span><strong>{transferencia.cbu}</strong></div>
                      <div className={styles.transferenciaRow}><span>Alias</span><strong>{transferencia.alias}</strong></div>
                    </div>
                  )}

                  {error && <p className={styles.errorMsg}>{error}</p>}
                  <button className="btn btn-gold" style={{marginTop:20}} onClick={handlePedirCuenta}
                    disabled={!metodoPago||cargando}>
                    {cargando ? 'Enviando...' : '🧾 Pedir la cuenta'}
                  </button>
                </>
              )}

              {mesa?.estado === 'esperando_cuenta' && (
                <div className={styles.cuentaEnCamino}>
                  <span style={{fontSize:32}}>⏳</span>
                  <p>La cuenta está en camino.</p>
                  <p style={{color:'var(--text2)',fontSize:'0.85em'}}>
                    El mozo viene con {mesa.metodo_pago==='tarjeta'?'el posnet':mesa.metodo_pago==='transferencia'?'la confirmación':'el ticket'}.
                  </p>
                  {mesa.abona_con && (
                    <p style={{color:'var(--text3)',fontSize:'0.82em'}}>
                      Abona con: ${parseFloat(mesa.abona_con).toLocaleString()}
                    </p>
                  )}
                </div>
              )}

              {mesa?.estado === 'cuenta_cobrada' && (
                <div className={styles.cuentaEnCamino}>
                  <span style={{fontSize:40}}>✅</span>
                  <p style={{fontWeight:600}}>¡Cuenta cobrada!</p>
                  <p style={{color:'var(--text2)',fontSize:'0.85em'}}>{getTextos().cuenta_cobrada.mensaje}</p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <footer className={styles.footerApp}>{getCopyright()}</footer>
    </div>
  )
}
