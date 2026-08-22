import { useState, useEffect, useRef } from 'react'
import { collection, onSnapshot, doc, updateDoc, query, orderBy, getDoc, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase/config'
import { getCopyright, getNombreBar, getLogo, APP_CONFIG } from '../config'
import { suscribirConfiguracion } from '../firebase/configuracion'
import { suscribirCarta, confirmarPedido, agregarPedidoExtra } from '../firebase/mesa'
import styles from './MozoPage.module.css'
import '../utils/animaciones.css'
import { useNotificaciones } from '../utils/useNotificaciones.jsx'
import { sonidoPedidoListo, sonidoLlamadaMozo, sonidoCuenta, activarAudio, estaActivado } from '../utils/sonidos'

const NUMS_MESAS = Array.from({ length: APP_CONFIG.mesas.cantidad }, (_, i) => String(i + 1))

const CATEGORIAS = {
  comida:           { label: 'Comidas',   emoji: '🍽️' },
  bebida_preparada: { label: 'Cafetería', emoji: '☕' },
  bebida_simple:    { label: 'Bebidas',   emoji: '🥤' },
  postre:           { label: 'Postres',   emoji: '🍰' },
}

export default function MozoPage() {
  const [mozoActivo, setMozoActivo]       = useState(null)
  const [mesas, setMesas]                 = useState({})
  const [pedidosPorMesa, setPedidosPorMesa] = useState({})
  const [llamadasPorMesa, setLlamadasPorMesa] = useState({})
  const [carta, setCarta]                 = useState([])
  const [tab, setTab]                     = useState('alertas')
  const [mesaPedido, setMesaPedido]       = useState(null)
  const [carritoMozo, setCarritoMozo]     = useState([])
  const [categoriaActiva, setCategoriaActiva] = useState('comida')
  const [cargando, setCargando]           = useState(false)
  const [audioOn, setAudioOn]             = useState(false)
  const { agregar: notif, NotifBanner }   = useNotificaciones()

  const [mozos, setMozos] = useState([])
  const [cantMesas, setCantMesas] = useState(APP_CONFIG.mesas.cantidad)

  useEffect(() => {
    const unsub = suscribirConfiguracion((cfg) => {
      if (cfg?.mozos) setMozos(cfg.mozos)
      if (cfg?.mesas?.cantidad) setCantMesas(cfg.mesas.cantidad)
    })
    return unsub
  }, [])
  const listosAnteriores = useRef({})
  const llamadasAnteriores = useRef({})
  const cuentasAnteriores = useRef({})

  // ── Suscripciones ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mozoActivo) return
    const NUMS_MESAS = Array.from({ length: cantMesas }, (_, i) => String(i + 1))
    const unsubs = NUMS_MESAS.map(num => {
      const u1 = onSnapshot(doc(db, 'mesas', `mesa_${num}`), snap => {
        if (snap.exists()) setMesas(prev => ({ ...prev, [num]: { id: snap.id, ...snap.data() } }))
      })
      const u2 = onSnapshot(
        query(collection(db, 'mesas', `mesa_${num}`, 'pedidos'), orderBy('created_at', 'asc')),
        snap => {
          const pedidos = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => p.estado !== 'entregado')
          setPedidosPorMesa(prev => ({ ...prev, [num]: pedidos }))
        }
      )
      const u3 = onSnapshot(
        query(collection(db, 'mesas', `mesa_${num}`, 'llamadas'), orderBy('created_at', 'desc')),
        snap => {
          const llamadas = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(l => l.estado === 'pendiente')
          setLlamadasPorMesa(prev => ({ ...prev, [num]: llamadas }))
        }
      )
      return () => { u1(); u2(); u3() }
    })
    return () => unsubs.forEach(u => u())
  }, [mozoActivo, cantMesas])

  useEffect(() => {
    const unsub = suscribirCarta(setCarta)
    return unsub
  }, [])

  // ── Sonidos + notificaciones al detectar cambios ─────────────────────────────
  useEffect(() => {
    if (!mozoActivo) return

    // Pedidos listos nuevos
    const listosActuales = {}
    misMesas.flatMap(n => (pedidosPorMesa[n]||[]).map(p => ({ ...p, mesaId: n })))
      .filter(p => p.estado === 'listo')
      .forEach(p => { listosActuales[p.id] = p })
    const listosNuevos = Object.values(listosActuales).filter(p => !listosAnteriores.current[p.id])
    if (listosNuevos.length > 0 && Object.keys(listosAnteriores.current).length > 0) {
      sonidoPedidoListo()
      listosNuevos.forEach(p => notif(`✅ Pedido listo — Mesa ${p.mesaId}`, 'Green', 4000))
    }
    listosAnteriores.current = listosActuales

    // Llamadas nuevas
    const llamadasActuales = {}
    misMesas.flatMap(n => (llamadasPorMesa[n]||[]).map(l => ({ ...l, mesaId: n })))
      .forEach(l => { llamadasActuales[l.id] = l })
    const llamadasNuevas = Object.values(llamadasActuales).filter(l => !llamadasAnteriores.current[l.id])
    if (llamadasNuevas.length > 0 && Object.keys(llamadasAnteriores.current).length > 0) {
      sonidoLlamadaMozo()
      llamadasNuevas.forEach(l => notif(`✋ Mesa ${l.mesaId}: ${l.nota || 'te llama'}`, 'Yellow', 5000))
    }
    llamadasAnteriores.current = llamadasActuales

    // Cuentas nuevas
    const cuentasActuales = {}
    misMesas.map(n => mesas[n]).filter(m => m?.estado === 'esperando_cuenta')
      .forEach(m => { cuentasActuales[m.mesa_numero] = m })
    const cuentasNuevas = Object.values(cuentasActuales).filter(m => !cuentasAnteriores.current[m.mesa_numero])
    if (cuentasNuevas.length > 0 && Object.keys(cuentasAnteriores.current).length > 0) {
      sonidoCuenta()
      cuentasNuevas.forEach(m => notif(`💳 Mesa ${m.mesa_numero} pide la cuenta`, 'Red', 6000))
    }
    cuentasAnteriores.current = cuentasActuales

  }, [pedidosPorMesa, llamadasPorMesa, mesas])

  // ── Mis mesas (las asignadas al mozo activo) ──────────────────────────────────
  const NUMS_MESAS_ACTUAL = Array.from({ length: cantMesas }, (_, i) => String(i + 1))
  const misMesas = mozoActivo
    ? (mozoActivo.mesas_asignadas?.length > 0 ? mozoActivo.mesas_asignadas : NUMS_MESAS_ACTUAL)
    : []

  // ── Alertas del mozo ──────────────────────────────────────────────────────────
  const mesasCuenta = misMesas.map(n => mesas[n]).filter(m => m?.estado === 'esperando_cuenta')

  const pedidosListos = misMesas
    .flatMap(num => (pedidosPorMesa[num] || []).map(p => ({ ...p, mesaId: num })))
    .filter(p => p.estado === 'listo')

  const pedidosMozo = misMesas
    .flatMap(num => (pedidosPorMesa[num] || []).map(p => ({ ...p, mesaId: num })))
    .filter(p => p.estado !== 'listo' && p.items?.some(i => i.destino === 'mozo'))

  const llamadasPendientes = misMesas
    .flatMap(num => (llamadasPorMesa[num] || []).map(l => ({ ...l, mesaId: num })))

  const totalAlertas = mesasCuenta.length + pedidosListos.length + pedidosMozo.length + llamadasPendientes.length

  // ── Acciones ──────────────────────────────────────────────────────────────────
  const marcarEntregado = async (mesaId, pedidoId) => {
    await updateDoc(doc(db, 'mesas', `mesa_${mesaId}`, 'pedidos', pedidoId), { estado: 'entregado' })
  }

  const cambiarEstadoItem = async (mesaId, pedidoId, itemIdx, nuevoEstado) => {
    const pedidoRef = doc(db, 'mesas', `mesa_${mesaId}`, 'pedidos', pedidoId)
    const snap = await getDoc(pedidoRef)
    if (!snap.exists()) return
    const data = snap.data()
    let mozoIdx = -1, count = 0
    data.items.forEach((item, i) => {
      if (item.destino === 'mozo') { if (count === itemIdx) mozoIdx = i; count++ }
    })
    if (mozoIdx === -1) return
    const items = data.items.map((item, i) => i === mozoIdx ? { ...item, estado: nuevoEstado } : item)
    const todoListo = items.every(i => i.estado === 'listo' || i.estado === 'entregado')
    await updateDoc(pedidoRef, { items, estado: todoListo ? 'listo' : 'en_preparacion' })
  }

  const resolverLlamada = async (mesaId, llamadaId) => {
    await updateDoc(doc(db, 'mesas', `mesa_${mesaId}`, 'llamadas', llamadaId), { estado: 'resuelto' })
  }

  const marcarMesaCobrada = async (mesaId) => {
    await updateDoc(doc(db, 'mesas', `mesa_${mesaId}`), { estado: 'cuenta_cobrada' })
  }

  // ── Cargar pedido desde la vista del mozo ────────────────────────────────────
  const agregarAlCarritoMozo = (item) => {
    setCarritoMozo(prev => {
      const existe = prev.find(i => i.id === item.id)
      if (existe) return prev.map(i => i.id === item.id ? { ...i, cantidad: i.cantidad + 1 } : i)
      return [...prev, { ...item, cantidad: 1, nota: '' }]
    })
  }

  const quitarDelCarritoMozo = (itemId) => {
    setCarritoMozo(prev => prev.map(i => i.id === itemId ? { ...i, cantidad: i.cantidad - 1 } : i).filter(i => i.cantidad > 0))
  }

  const actualizarNotaMozo = (itemId, nota) => {
    setCarritoMozo(prev => prev.map(i => i.id === itemId ? { ...i, nota } : i))
  }

  const confirmarPedidoMozo = async () => {
    if (!mesaPedido || carritoMozo.length === 0) return
    setCargando(true)
    try {
      const mesa = mesas[mesaPedido]
      if (mesa?.carrito_bloqueado) {
        await agregarPedidoExtra(mesaPedido, carritoMozo, `mozo_${mozoActivo.id}`)
      } else {
        // Cargar directo como pedido confirmado
        const total = carritoMozo.reduce((a, i) => a + i.precio * i.cantidad, 0)
        await addDoc(collection(db, 'mesas', `mesa_${mesaPedido}`, 'pedidos'), {
          items: carritoMozo,
          estado: 'pendiente',
          confirmado_por: `mozo_${mozoActivo.id}`,
          total,
          created_at: serverTimestamp(),
        })
        await updateDoc(doc(db, 'mesas', `mesa_${mesaPedido}`), {
          carrito_bloqueado: true,
          total_acumulado: (mesa?.total_acumulado || 0) + total,
          estado: 'esperando_preparacion',
        })
      }
      setCarritoMozo([])
      setMesaPedido(null)
      setTab('alertas')
    } catch (e) { console.error(e) }
    setCargando(false)
  }

  // ── PANTALLA LOGIN MOZO ───────────────────────────────────────────────────────
  if (!mozoActivo) return (
    <div className={styles.login}>
      <div className={styles.loginBox}>
        <img src={getLogo()} alt="Logo" className={styles.loginLogo} onError={e => e.target.style.display='none'} />
        <h2 className={styles.loginTitle}>{getNombreBar()}</h2>
        <p className={styles.loginSub}>¿Quién sos?</p>
        <div className={styles.mozosBtns}>
          {mozos.map(m => (
            <button key={m.id} className={styles.mozoBtn} onClick={() => setMozoActivo(m)}>
              <span className={styles.mozoEmoji}>🧍</span>
              <span>{m.nombre}</span>
            </button>
          ))}
        </div>
      </div>
      <footer className={styles.footer}>{getCopyright()}</footer>
    </div>
  )

  // ── VISTA PRINCIPAL MOZO ──────────────────────────────────────────────────────
  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <img src={getLogo()} alt="Logo" className={styles.headerLogo} onError={e => e.target.style.display='none'} />
          <div>
            <span className={styles.headerNombre}>{mozoActivo.nombre}</span>
            <span className={styles.headerRol}>Mozo · {getNombreBar()}</span>
          </div>
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          {totalAlertas > 0 && <span className={styles.alertBadge}>{totalAlertas}</span>}
          <button
            className={`${styles.audioBtn} ${audioOn ? styles.audioBtnOn : ''}`}
            onClick={() => { activarAudio(); setAudioOn(true) }}
          >
            {audioOn ? '🔔' : '🔕'}
          </button>
          <button className={styles.cambiarBtn} onClick={() => setMozoActivo(null)}>Cambiar</button>
        </div>
      </header>

      {/* Tabs */}
      <nav className={styles.tabs}>
        {[
          { key: 'alertas',  label: '🔔 Alertas',   badge: totalAlertas },
          { key: 'mesas',    label: '🏠 Mis mesas',  badge: 0 },
          { key: 'pedido',   label: '📋 Tomar pedido', badge: 0 },
        ].map(t => (
          <button key={t.key} className={`${styles.tab} ${tab===t.key?styles.tabActivo:''}`} onClick={() => setTab(t.key)}>
            {t.label}
            {t.badge > 0 && <span className={styles.tabBadge}>{t.badge}</span>}
          </button>
        ))}
      </nav>

      {/* ── TAB ALERTAS ────────────────────────────────────────────────────── */}
      {tab === 'alertas' && (
        <div className={styles.content}>
          <NotifBanner />
      {totalAlertas === 0 ? (
            <div className={styles.vacio}><span>☕</span><p>Todo tranquilo por ahora</p></div>
          ) : (
            <>
              {/* Llamadas ✋ */}
              {llamadasPendientes.length > 0 && (
                <section>
                  <h2 className={styles.seccion}>✋ Llamadas de mesas</h2>
                  {llamadasPendientes.map(l => (
                    <div key={l.id} className={`${styles.card} ${styles.cardYellow}`}>
                      <div className={styles.cardHeader}>
                        <span className={styles.mesaTag}>Mesa {l.mesaId}</span>
                        <span style={{fontSize:'0.82em', color:'var(--text2)'}}>{l.cliente}</span>
                      </div>
                      <p style={{fontSize:'0.9em', margin:'8px 0'}}>{l.nota}</p>
                      <button className={styles.resolverBtn} onClick={() => resolverLlamada(l.mesaId, l.id)}>✓ Resolver</button>
                    </div>
                  ))}
                </section>
              )}

              {/* Listos para llevar */}
              {pedidosListos.length > 0 && (
                <section>
                  <h2 className={styles.seccion}>✅ Listo para llevar</h2>
                  {pedidosListos.map(p => (
                    <div key={p.id} className={`${styles.card} ${styles.cardGreen}`}>
                      <div className={styles.cardHeader}>
                        <span className={styles.mesaTag}>Mesa {p.mesaId}</span>
                        <button className={styles.entregarBtn} onClick={() => marcarEntregado(p.mesaId, p.id)}>
                          Marcar entregado ✓
                        </button>
                      </div>
                      {p.items.map((item, i) => (
                        <div key={i} className={styles.itemRow}>
                          <span>{item.cantidad}× {item.nombre}</span>
                          {item.nota && <span style={{color:'var(--yellow)',fontSize:'0.78em'}}>📝 {item.nota}</span>}
                        </div>
                      ))}
                    </div>
                  ))}
                </section>
              )}

              {/* Bebidas simples */}
              {pedidosMozo.length > 0 && (
                <section>
                  <h2 className={styles.seccion}>🥤 Preparar y llevar</h2>
                  {pedidosMozo.map(p => (
                    <div key={p.id} className={`${styles.card} ${styles.cardBlue}`}>
                      <div className={styles.cardHeader}>
                        <span className={styles.mesaTag}>Mesa {p.mesaId}</span>
                      </div>
                      {p.items.filter(i => i.destino==='mozo').map((item, idx) => (
                        <div key={idx} className={styles.itemRow}>
                          <div className={styles.itemLeft}>
                            <span className={styles.cantidad}>{item.cantidad}×</span>
                            <span>{item.nombre}</span>
                          </div>
                          <div className={styles.itemBtns}>
                            <button className={`${styles.btn} ${item.estado==='en_preparacion'?styles.btnYellow:''}`}
                              onClick={() => cambiarEstadoItem(p.mesaId, p.id, idx, 'en_preparacion')}>🔥</button>
                            <button className={`${styles.btn} ${item.estado==='listo'?styles.btnGreen:''}`}
                              onClick={() => cambiarEstadoItem(p.mesaId, p.id, idx, 'listo')}>✅</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </section>
              )}

              {/* Cuentas */}
              {mesasCuenta.length > 0 && (
                <section>
                  <h2 className={styles.seccion}>💳 Llevar cuenta</h2>
                  {mesasCuenta.map(mesa => (
                    <div key={mesa.mesa_numero} className={`${styles.card} ${styles.cardRed}`}>
                      <div className={styles.cardHeader}>
                        <span className={styles.mesaTag}>Mesa {mesa.mesa_numero}</span>
                        <span className={styles.metodoPago}>
                          {mesa.metodo_pago==='tarjeta'?'💳 Llevar posnet':mesa.metodo_pago==='efectivo'?'💵 Llevar ticket':'📲 Transferencia'}
                        </span>
                      </div>
                      <div className={styles.cuentaInfo}>
                        <span>Total: <strong>${((mesa.total_acumulado||0)+(mesa.propina||0)).toLocaleString()}</strong></span>
                        {mesa.propina>0 && <span style={{color:'var(--green)',fontSize:'0.82em'}}>Propina: ${mesa.propina.toLocaleString()}</span>}
                      </div>
                      <button className={styles.cobradoBtn} onClick={() => marcarMesaCobrada(mesa.mesa_numero)}>
                        ✅ Mesa cobrada — esperando confirmación
                      </button>
                    </div>
                  ))}
                </section>
              )}
            </>
          )}
        </div>
      )}

      {/* ── TAB MIS MESAS ──────────────────────────────────────────────────── */}
      {tab === 'mesas' && (
        <div className={styles.content}>
          <h2 className={styles.seccion}>Mis mesas</h2>
          {misMesas.map(num => {
            const mesa = mesas[num]
            const pedidosMesa = pedidosPorMesa[num] || []
            return (
              <div key={num} className={styles.mesaDetalle}>
                <div className={styles.mesaDetalleHeader}>
                  <span className={styles.mesaTag}>Mesa {num}</span>
                  <span style={{fontSize:'0.82em',color:'var(--text2)'}}>
                    {mesa?.estado==='libre'?'⬜ Libre':mesa?.clientes?.join(', ')||'Ocupada'}
                  </span>
                </div>
                {pedidosMesa.length > 0 ? pedidosMesa.map((p, pi) => (
                  <div key={p.id} className={styles.pedidoResumen}>
                    <span style={{fontSize:'0.78em',color:'var(--text3)'}}>Pedido #{pi+1}</span>
                    {p.items.map((item, j) => (
                      <div key={j} className={styles.itemRow}>
                        <div>
                          <span>{item.cantidad}× {item.nombre}</span>
                          {item.nota && <p style={{color:'var(--yellow)',fontSize:'0.75em'}}>📝 {item.nota}</p>}
                        </div>
                        <span className={`badge badge-${p.estado==='entregado'?'green':p.estado==='listo'?'yellow':'gold'}`} style={{fontSize:'0.7em'}}>
                          {p.estado==='pendiente'?'⏳':p.estado==='en_preparacion'?'🔥':p.estado==='listo'?'✅':'🎉'}
                        </span>
                      </div>
                    ))}
                  </div>
                )) : (
                  <p style={{color:'var(--text3)',fontSize:'0.82em',padding:'8px 0'}}>Sin pedidos</p>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── TAB TOMAR PEDIDO ───────────────────────────────────────────────── */}
      {tab === 'pedido' && (
        <div className={styles.content}>
          <h2 className={styles.seccion}>Tomar pedido</h2>

          {/* Seleccionar mesa */}
          <div className={styles.mesaSelector}>
            <label className={styles.inputLabel}>Mesa</label>
            <div className={styles.mesasBtns}>
              {misMesas.map(num => (
                <button key={num}
                  className={`${styles.mesaNumBtn} ${mesaPedido===num?styles.mesaNumActivo:''}`}
                  onClick={() => setMesaPedido(num)}>
                  {num}
                </button>
              ))}
            </div>
          </div>

          {mesaPedido && (
            <>
              {/* Categorías */}
              <div className={styles.categorias}>
                {Object.entries(CATEGORIAS).map(([key, val]) => (
                  <button key={key}
                    className={`${styles.catBtn} ${categoriaActiva===key?styles.catActivo:''}`}
                    onClick={() => setCategoriaActiva(key)}>
                    {val.emoji} {val.label}
                  </button>
                ))}
              </div>

              {/* Items */}
              <div className={styles.itemsCarta}>
                {carta.filter(i => i.categoria===categoriaActiva && i.disponible).map(item => {
                  const cant = carritoMozo.find(i => i.id===item.id)?.cantidad || 0
                  return (
                    <div key={item.id} className={styles.itemCartaCard}>
                      <div className={styles.itemCartaInfo}>
                        <span className={styles.itemNombre}>{item.nombre}</span>
                        <span className={styles.itemPrecio}>${item.precio.toLocaleString()}</span>
                        {cant > 0 && (
                          <input className={styles.notaInput} placeholder="Nota (ej: sin tomate)..."
                            value={carritoMozo.find(i=>i.id===item.id)?.nota||''}
                            onChange={e => actualizarNotaMozo(item.id, e.target.value)} />
                        )}
                      </div>
                      <div className={styles.itemControles}>
                        {cant > 0 ? (
                          <>
                            <button className={styles.contBtn} onClick={() => quitarDelCarritoMozo(item.id)}>−</button>
                            <span className={styles.contNum}>{cant}</span>
                            <button className={styles.contBtn} onClick={() => agregarAlCarritoMozo(item)}>+</button>
                          </>
                        ) : (
                          <button className={styles.addBtn} onClick={() => agregarAlCarritoMozo(item)}>+</button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Carrito */}
              {carritoMozo.length > 0 && (
                <div className={styles.carritoFloat}>
                  <div className={styles.carritoInfo}>
                    <span>Mesa {mesaPedido} · {carritoMozo.reduce((a,i)=>a+i.cantidad,0)} ítems</span>
                    <span>${carritoMozo.reduce((a,i)=>a+i.precio*i.cantidad,0).toLocaleString()}</span>
                  </div>
                  <button className="btn btn-gold" onClick={confirmarPedidoMozo} disabled={cargando}>
                    {cargando ? 'Enviando...' : '📤 Enviar pedido'}
                  </button>
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
