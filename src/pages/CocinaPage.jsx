import { useState, useEffect, useRef } from 'react'
import { collection, onSnapshot, doc, updateDoc, query, orderBy, getDoc, getDocs } from 'firebase/firestore'
import { db } from '../firebase/config'
import { getCopyright, getNombreBar, getLogo } from '../config'
import { suscribirConfiguracion } from '../firebase/configuracion'
import styles from './CocinaPage.module.css'
import '../utils/animaciones.css'
import { useNotificaciones } from '../utils/useNotificaciones.jsx'
import { sonidoNuevoPedido, activarAudio } from '../utils/sonidos'
import { cerrarSesion } from '../firebase/auth'

// NUMS_MESAS se genera dinámicamente

export default function CocinaPage() {
  // Quien puede entrar aca lo decide PuertaDeAcceso con una cuenta real
  // de Firebase; esta vista ya se renderiza solo si el rol es valido.
  const [cantidadMesas, setCantidadMesas] = useState(10)

  useEffect(() => {
    const unsub = suscribirConfiguracion((cfg) => {
      if (cfg?.mesas?.cantidad) setCantidadMesas(cfg.mesas.cantidad)
    })
    return unsub
  }, [])
  const [pedidosPorMesa, setPedidosPorMesa] = useState({})
  const [historialDia, setHistorialDia]     = useState([])
  const [tab, setTab]                 = useState('activos')
  const [audioOn, setAudioOn]         = useState(false)
  const pedidosAnteriores = useRef({})
  const pedidosNuevos = useRef({})
  const { agregar: notif, NotifBanner } = useNotificaciones()

  // ── Suscripciones ────────────────────────────────────────────────────────────
  useEffect(() => {
    const numsMesas = Array.from({ length: cantidadMesas }, (_, i) => String(i + 1))
    const unsubs = numsMesas.map(num => {
      const q = query(collection(db, 'mesas', `mesa_${num}`, 'pedidos'), orderBy('created_at', 'asc'))
      return onSnapshot(q, snap => {
        const pedidos = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(p => p.estado !== 'entregado')
          .map(p => ({ ...p, items: (p.items || []).filter(i => i.destino === 'cocina') }))
          .filter(p => p.items.length > 0)
        setPedidosPorMesa(prev => ({ ...prev, [num]: pedidos }))
      })
    })
    return () => unsubs.forEach(u => u())
  }, [cantidadMesas])

  // ── Historial del día ────────────────────────────────────────────────────────
  useEffect(() => {
    if (tab !== 'historial') return
    const cargarHistorial = async () => {
      const hoy = new Date(); hoy.setHours(0,0,0,0)
      const todos = []
      const numsMesas = Array.from({ length: cantidadMesas }, (_, i) => String(i + 1))
      for (const num of numsMesas) {
        const snap = await getDocs(collection(db, 'mesas', `mesa_${num}`, 'pedidos'))
        snap.docs.forEach(d => {
          const data = { id: d.id, mesaId: num, ...d.data() }
          const itemsCocina = (data.items || []).filter(i => i.destino === 'cocina')
          if (itemsCocina.length > 0) todos.push({ ...data, items: itemsCocina })
        })
      }
      // También del historial cerrado hoy
      const histSnap = await getDocs(collection(db, 'historial'))
      const cerradosHoy = histSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(d => d.fecha_hora_cierre?.toDate?.() >= hoy)
        .map(d => ({
          id: d.id,
          mesaId: d.mesa_id,
          estado: 'entregado',
          items: (d.pedidos_resumen || []).filter(i => i.destino === 'cocina'),
          cerrado: true,
          hora: d.fecha_hora_cierre,
        }))
        .filter(d => d.items.length > 0)
      setHistorialDia([...todos, ...cerradosHoy])
    }
    cargarHistorial()
  }, [tab, cantidadMesas])

  // ── Detectar pedidos nuevos — sonido + notificación ─────────────────────────
  useEffect(() => {
    const todos = Object.entries(pedidosPorMesa)
      .flatMap(([mesaId, pedidos]) => pedidos.map(p => ({ ...p, mesaId })))
    const anteriores = pedidosAnteriores.current
    const nuevos = todos.filter(p => !anteriores[p.id])
    if (nuevos.length > 0 && Object.keys(anteriores).length > 0) {
      sonidoNuevoPedido()
      nuevos.forEach(p => {
        notif(`🆕 Nuevo pedido — Mesa ${p.mesaId}`, 'gold', 4000)
        pedidosNuevos.current[p.id] = Date.now()
      })
    }
    const nuevo = {}
    todos.forEach(p => nuevo[p.id] = true)
    pedidosAnteriores.current = nuevo
  }, [pedidosPorMesa])

  // ── Cambiar estado ítem ──────────────────────────────────────────────────────
  const cambiarEstadoItem = async (mesaId, pedidoId, itemIdx, nuevoEstado) => {
    const pedidoRef = doc(db, 'mesas', `mesa_${mesaId}`, 'pedidos', pedidoId)
    const snap = await getDoc(pedidoRef)
    if (!snap.exists()) return
    const dataCompleta = snap.data()
    let cocinarIdx = -1, count = 0
    dataCompleta.items.forEach((item, i) => {
      if (item.destino === 'cocina') { if (count === itemIdx) cocinarIdx = i; count++ }
    })
    if (cocinarIdx === -1) return
    const itemsActualizados = dataCompleta.items.map((item, i) =>
      i === cocinarIdx ? { ...item, estado: nuevoEstado } : item
    )
    const todoListo = itemsActualizados.every(i => i.estado === 'listo' || i.estado === 'entregado')
    await updateDoc(pedidoRef, { items: itemsActualizados, estado: todoListo ? 'listo' : 'en_preparacion' })
  }

  const todosPedidos = Object.entries(pedidosPorMesa)
    .flatMap(([mesaId, pedidos]) => pedidos.map(p => ({ ...p, mesaId })))
    .filter(p => p.items.length > 0)

  const pendientes = todosPedidos.filter(p => p.estado === 'pendiente')
  const enPrep     = todosPedidos.filter(p => p.estado === 'en_preparacion')
  const listos     = todosPedidos.filter(p => p.estado === 'listo')

  // ── VISTA PRINCIPAL ───────────────────────────────────────────────────────────
  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <img src={getLogo()} alt="Logo" className={styles.headerLogo} onError={e => e.target.style.display='none'} />
          <h1 className={styles.title}>👨‍🍳 Cocina — {getNombreBar()}</h1>
        </div>
        <div className={styles.headerRight}>
          {pendientes.length > 0 && <span className={styles.countRed}>{pendientes.length} pendiente{pendientes.length>1?'s':''}</span>}
          {enPrep.length > 0    && <span className={styles.countYellow}>{enPrep.length} preparando</span>}
          {listos.length > 0    && <span className={styles.countGreen}>{listos.length} listo{listos.length>1?'s':''}</span>}
          <button
            className={`${styles.audioBtn} ${audioOn ? styles.audioBtnOn : ''}`}
            onClick={() => { activarAudio(); setAudioOn(true) }}
            title={audioOn ? 'Sonido activado' : 'Activar sonido'}
          >
            {audioOn ? '🔔' : '🔕'}
          </button>
          <button className={styles.salirBtn} onClick={() => cerrarSesion()}>Salir</button>
        </div>
      </header>

      {/* Tabs */}
      <nav className={styles.tabs}>
        <button className={`${styles.tab} ${tab==='activos'?styles.tabActivo:''}`} onClick={() => setTab('activos')}>
          🔥 Pedidos activos
        </button>
        <button className={`${styles.tab} ${tab==='historial'?styles.tabActivo:''}`} onClick={() => setTab('historial')}>
          📋 Historial del día
        </button>
      </nav>

      {/* ── TAB ACTIVOS ────────────────────────────────────────────────────── */}
      {tab === 'activos' && (
        <>
          <NotifBanner />
      {todosPedidos.length === 0 ? (
            <div className={styles.vacio}><span>🍽️</span><p>Sin pedidos por ahora</p></div>
          ) : (
            <div className={styles.columnas}>
              <div className={styles.columna}>
                <div className={`${styles.colHeader} ${styles.colRed}`}>⏳ Pendientes</div>
                {pendientes.length === 0
                  ? <p className={styles.colVacio}>Todo al día</p>
                  : pendientes.map(p => <PedidoCard key={p.id} pedido={p} onCambiar={cambiarEstadoItem} esNuevo={!!pedidosNuevos.current[p.id]} />)
                }
              </div>
              <div className={styles.columna}>
                <div className={`${styles.colHeader} ${styles.colYellow}`}>🔥 En preparación</div>
                {enPrep.length === 0
                  ? <p className={styles.colVacio}>Ninguno</p>
                  : enPrep.map(p => <PedidoCard key={p.id} pedido={p} onCambiar={cambiarEstadoItem} esNuevo={false} />)
                }
              </div>
              <div className={styles.columna}>
                <div className={`${styles.colHeader} ${styles.colGreen}`}>✅ Listos</div>
                {listos.length === 0
                  ? <p className={styles.colVacio}>Ninguno</p>
                  : listos.map(p => <PedidoCard key={p.id} pedido={p} onCambiar={cambiarEstadoItem} esNuevo={false} />)
                }
              </div>
            </div>
          )}
        </>
      )}

      {/* ── TAB HISTORIAL ──────────────────────────────────────────────────── */}
      {tab === 'historial' && (
        <div className={styles.historial}>
          <p className={styles.historialSub}>Todos los pedidos de cocina del día de hoy</p>
          {historialDia.length === 0
            ? <div className={styles.vacio}><span>📋</span><p>Sin registros hoy</p></div>
            : historialDia.map((p, i) => (
              <div key={p.id + i} className={styles.historialCard}>
                <div className={styles.historialHeader}>
                  <span className={styles.mesaTag}>Mesa {p.mesaId}</span>
                  <span className={`badge badge-${p.estado==='entregado'?'green':p.estado==='listo'?'yellow':'gold'}`}>
                    {p.estado==='entregado'?'✅ Entregado':p.estado==='listo'?'🟡 Listo':'🔥 En proceso'}
                  </span>
                  {p.hora && (
                    <span style={{color:'var(--text3)', fontSize:'0.75em'}}>
                      {p.hora?.toDate?.()?.toLocaleTimeString?.('es-AR', {hour:'2-digit',minute:'2-digit'})}
                    </span>
                  )}
                </div>
                {p.items.map((item, j) => (
                  <div key={j} className={styles.historialItem}>
                    <span>{item.cantidad}× {item.nombre}</span>
                    {item.nota && <span style={{color:'var(--yellow)', fontSize:'0.78em'}}>📝 {item.nota}</span>}
                  </div>
                ))}
              </div>
            ))
          }
        </div>
      )}

      <footer className={styles.footerApp}>{getCopyright()}</footer>
    </div>
  )
}

function PedidoCard({ pedido, onCambiar, esNuevo = false }) {
  return (
    <div className={`${styles.card} ${esNuevo ? 'cardNuevo' : 'fadeUp'}`}>
      <div className={styles.cardHeader}>
        <span className={styles.mesaTag}>Mesa {pedido.mesaId}</span>
        <span className={styles.hora}>
          {pedido.created_at?.toDate?.()?.toLocaleTimeString?.('es-AR', { hour:'2-digit', minute:'2-digit' }) || ''}
        </span>
      </div>
      {pedido.items.map((item, idx) => (
        <div key={idx} className={styles.itemRow}>
          <div className={styles.itemLeft}>
            <span className={styles.cantidad}>{item.cantidad}×</span>
            <div className={styles.itemInfo}>
              <span className={styles.itemNombre}>{item.nombre}</span>
              {item.nota && <span className={styles.itemNota}>📝 {item.nota}</span>}
            </div>
          </div>
          <div className={styles.itemBtns}>
            <button className={`${styles.btn} ${item.estado==='pendiente'?styles.btnRed:''}`}
              onClick={() => onCambiar(pedido.mesaId, pedido.id, idx, 'pendiente')}>⏳</button>
            <button className={`${styles.btn} ${item.estado==='en_preparacion'?styles.btnYellow:''}`}
              onClick={() => onCambiar(pedido.mesaId, pedido.id, idx, 'en_preparacion')}>🔥</button>
            <button className={`${styles.btn} ${item.estado==='listo'?styles.btnGreen:''}`}
              onClick={() => onCambiar(pedido.mesaId, pedido.id, idx, 'listo')}>✅</button>
          </div>
        </div>
      ))}
    </div>
  )
}
