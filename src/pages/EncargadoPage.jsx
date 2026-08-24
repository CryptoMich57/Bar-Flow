import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { suscribirPedidos, suscribirMensajes, enviarMensaje, liberarMesa } from '../firebase/mesa'
import {
  onSnapshot, updateDoc, query, orderBy,
  getDocs, writeBatch, serverTimestamp, addDoc,
  deleteDoc, getDoc
} from 'firebase/firestore'
import { db } from '../firebase/config'
import {
  refMesa, colPedidos, refPedido, colLlamadas, refLlamada,
  colCarta, refItemCarta, colHistorial, refHistorial,
} from '../firebase/rutas'
import { useLocal } from '../utils/LocalContext'
import EquipoDelLocal from '../components/EquipoDelLocal'
import { useAccesoActual } from '../utils/AccesoContext'
import { getCopyright, MESAS_POR_DEFECTO } from '../config'
import { suscribirConfiguracion, guardarConfiguracion, DEFAULTS_CONFIG } from '../firebase/configuracion'
import styles from './EncargadoPage.module.css'
import '../utils/animaciones.css'
import { useNotificaciones } from '../utils/useNotificaciones.jsx'
import { sonidoNuevoPedido, sonidoLlamadaMozo, sonidoCuenta, sonidoMensaje, activarAudio } from '../utils/sonidos'
import { cerrarSesion } from '../firebase/auth'

// NUMS_MESAS se genera dinámicamente desde configDB

const ESTADO_LABEL = {
  libre:                '⬜ Libre',
  ocupada:              '🟦 Ocupada',
  esperando_preparacion:'🟡 Pedido activo',
  esperando_cuenta:     '🔴 Pide cuenta',
  cuenta_cobrada:       '✅ Cobrada',
}

export default function EncargadoPage() {
  const { localId, local, nombre: nombreBar, logo } = useLocal()
  // soporte = Hexa Group mirando el local de un cliente. Ve todo, no opera.
  const { soporte } = useAccesoActual()
  const [mesas, setMesas]                   = useState({})
  const [mesaSeleccionada, setMesaSeleccionada] = useState(null)
  const [pedidos, setPedidos]               = useState([])
  const [mensajes, setMensajes]             = useState([])
  const [llamadas, setLlamadas]             = useState([])
  const [pedidosBarra, setPedidosBarra]     = useState({})
  const [carta, setCarta]                   = useState([])
  const [tab, setTab]                       = useState('mesas')
  const [textoMsg, setTextoMsg]             = useState('')
  const [historial, setHistorial]           = useState([])
  const [filtroDesde, setFiltroDesde]       = useState('')
  const [configDB, setConfigDB]             = useState(null)
  const [cantidadMesas, setCantidadMesas]   = useState(MESAS_POR_DEFECTO)
  const [configGuardando, setConfigGuardando] = useState(false)
  const [configGuardado, setConfigGuardado] = useState(false)
  const [filtroHasta, setFiltroHasta]       = useState('')
  const [estadisticas, setEstadisticas]     = useState(null)
  const [editandoItem, setEditandoItem]     = useState(null)
  const [nuevoItem, setNuevoItem]           = useState(null)
  const navigate = useNavigate()
  const [audioOn, setAudioOn] = useState(false)
  const { agregar: notif, NotifBanner } = useNotificaciones()
  const pedidosAnteriores = useRef({})
  const llamadasAvisadas = useRef({})
  const cuentasAnteriores = useRef({})
  const mensajesAnteriores = useRef({})

  // ── Cargar configuración desde Firestore ────────────────────────────────────
  useEffect(() => {
    const unsub = suscribirConfiguracion(localId, (cfg) => {
      if (cfg?.mesas?.cantidad) setCantidadMesas(cfg.mesas.cantidad)
      setConfigDB(cfg || DEFAULTS_CONFIG)
    })
    return unsub
  }, [localId])

  // ── Suscripciones ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (cantidadMesas === 0) return
    const numsMesas = Array.from({ length: cantidadMesas }, (_, i) => String(i + 1))
    const unsubs = numsMesas.map(num =>
      onSnapshot(refMesa(localId, num), snap => {
        if (snap.exists()) setMesas(prev => ({ ...prev, [num]: { id: snap.id, ...snap.data() } }))
        else {
          // Mesa no existe en Firestore aún — mostrar como libre
          setMesas(prev => ({ ...prev, [num]: { id: `mesa_${num}`, estado: 'libre', mesa_numero: num } }))
        }
      })
    )
    return () => unsubs.forEach(u => u())
  }, [localId, cantidadMesas])

  useEffect(() => {
    if (!mesaSeleccionada) return
    const u1 = suscribirPedidos(localId, mesaSeleccionada, (nuevos) => {
      setPedidos(nuevos)
    })
    const u2 = suscribirMensajes(localId, mesaSeleccionada, (nuevos) => {
      const nuevosMsg = nuevos.filter(m => !mensajesAnteriores.current[m.id])
      if (nuevosMsg.length > 0 && Object.keys(mensajesAnteriores.current).length > 0) {
        sonidoMensaje()
        notif(`💬 Mensaje — Mesa ${mesaSeleccionada}`, 'gold', 3000)
      }
      const map = {}; nuevos.forEach(m => map[m.id] = true)
      mensajesAnteriores.current = map
      setMensajes(nuevos)
    })
    const u3 = onSnapshot(
      query(colLlamadas(localId, mesaSeleccionada), orderBy('created_at', 'desc')),
      snap => setLlamadas(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    )
    return () => { u1(); u2(); u3() }
  }, [localId, mesaSeleccionada])

  useEffect(() => {
    const unsub = onSnapshot(colCarta(localId), snap => {
      setCarta(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })
    return unsub
  }, [localId])

  useEffect(() => {
    if (tab !== 'historial') return
    cargarHistorial()
  }, [localId, tab])

  useEffect(() => {
    if (tab !== 'estadisticas') return
    calcularEstadisticas()
  }, [localId, tab])

  // ── Suscripción global de pedidos para notificaciones ───────────────────────
  useEffect(() => {
    if (cantidadMesas === 0) return
    const numsMesas = Array.from({ length: cantidadMesas }, (_, i) => String(i + 1))
    const unsubs = numsMesas.map(num => {
      const q = query(
        colPedidos(localId, num),
        orderBy('created_at', 'asc')
      )
      return onSnapshot(q, snap => {
        snap.docs.forEach(d => {
          const pedidoId = d.id
          if (!pedidosAnteriores.current[pedidoId]) {
            if (Object.keys(pedidosAnteriores.current).length > 0) {
              sonidoNuevoPedido()
              notif(`🆕 Nuevo pedido — Mesa ${num}`, 'gold', 4000)
            }
            pedidosAnteriores.current[pedidoId] = true
          }
        })
        // Cola de barra: items que prepara el encargado (cafeteria, licuados)
        const barra = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(p => p.estado !== 'entregado')
          .map(p => ({ ...p, items: (p.items || []).filter(i => i.destino === 'encargado') }))
          .filter(p => p.items.length > 0)
        setPedidosBarra(prev => ({ ...prev, [num]: barra }))
      })
    })
    return () => unsubs.forEach(u => u())
  }, [localId, cantidadMesas])

  // ── Suscripcion global de llamadas al mozo ──────────────────────────────────
  // La otra suscripcion a llamadas solo mira la mesa seleccionada, asi que sin
  // esta el encargado se enteraba de una mano levantada unicamente si justo
  // estaba parado en esa mesa. Sonaba para pedidos, cuentas y mensajes; para
  // esto, no.
  useEffect(() => {
    if (cantidadMesas === 0) return
    const numsMesas = Array.from({ length: cantidadMesas }, (_, i) => String(i + 1))
    const unsubs = numsMesas.map(num =>
      onSnapshot(colLlamadas(localId, num), snap => {
        const pendientes = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(l => l.estado === 'pendiente')

        // El primer snapshot trae lo que ya estaba: se registra sin sonar,
        // para no disparar una salva de alertas al abrir la pantalla.
        const primeraVez = Object.keys(llamadasAvisadas.current).length === 0
        pendientes.forEach(l => {
          if (!llamadasAvisadas.current[l.id]) {
            if (!primeraVez) {
              sonidoLlamadaMozo()
              notif(`✋ Mesa ${num}: ${l.nota || 'te llama'}`, 'Yellow', 5000)
            }
            llamadasAvisadas.current[l.id] = true
          }
        })
      })
    )
    return () => unsubs.forEach(u => u())
  }, [localId, cantidadMesas])

  // ── Sonidos + notificaciones ──────────────────────────────────────────────────
  useEffect(() => {
    const cuentasActuales = {}
    Object.values(mesas).filter(m => m?.estado === 'esperando_cuenta')
      .forEach(m => { cuentasActuales[m.mesa_numero] = m })
    const nuevas = Object.values(cuentasActuales).filter(m => !cuentasAnteriores.current[m.mesa_numero])
    if (nuevas.length > 0 && Object.keys(cuentasAnteriores.current).length > 0) {
      sonidoCuenta()
      nuevas.forEach(m => notif(`💳 Mesa ${m.mesa_numero} pide la cuenta — ${m.metodo_pago === 'tarjeta' ? 'llevar posnet' : m.metodo_pago === 'transferencia' ? 'confirmar transferencia' : 'llevar ticket'}`, 'Red', 6000))
    }
    cuentasAnteriores.current = cuentasActuales
  }, [mesas])

  // ── Historial ───────────────────────────────────────────────────────────────
  const cargarHistorial = async (desde = null, hasta = null) => {
    let q = query(colHistorial(localId), orderBy('fecha_hora_cierre', 'desc'))
    const snap = await getDocs(q)
    let docs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    if (desde) docs = docs.filter(d => d.fecha_hora_cierre?.toDate?.() >= new Date(desde))
    if (hasta) {
      const hastaDate = new Date(hasta); hastaDate.setHours(23,59,59)
      docs = docs.filter(d => d.fecha_hora_cierre?.toDate?.() <= hastaDate)
    }
    setHistorial(docs)
  }

  const borrarHistorialFiltrado = async () => {
    if (!window.confirm('¿Borrar el historial filtrado?')) return
    const batch = writeBatch(db)
    historial.forEach(h => batch.delete(refHistorial(localId, h.id)))
    await batch.commit()
    setHistorial([])
  }

  // ── Estadísticas del día ─────────────────────────────────────────────────────
  const calcularEstadisticas = async () => {
    const hoy = new Date(); hoy.setHours(0,0,0,0)
    const snap = await getDocs(colHistorial(localId))
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .filter(d => d.fecha_hora_cierre?.toDate?.() >= hoy)

    const stats = {
      efectivo:      docs.filter(d => d.metodo_pago === 'efectivo').reduce((a, d) => a + (d.total_cobrado||0), 0),
      tarjeta:       docs.filter(d => d.metodo_pago === 'tarjeta').reduce((a, d) => a + (d.total_cobrado||0), 0),
      transferencia: docs.filter(d => d.metodo_pago === 'transferencia').reduce((a, d) => a + (d.total_cobrado||0), 0),
      propinas:      docs.reduce((a, d) => a + (d.propina||0), 0),
      mesas:         docs.length,
    }
    stats.total = stats.efectivo + stats.tarjeta + stats.transferencia
    setEstadisticas(stats)
  }

  // ── Pedidos ──────────────────────────────────────────────────────────────────
  const cambiarEstadoItem = async (mesaId, pedidoId, itemIdx, nuevoEstado) => {
    const pedidoRef = refPedido(localId, mesaId, pedidoId)
    const pedido = pedidos.find(p => p.id === pedidoId)
    if (!pedido) return
    const items = pedido.items.map((item, i) => i === itemIdx ? { ...item, estado: nuevoEstado } : item)
    const todoListo = items.every(i => i.estado === 'listo' || i.estado === 'entregado')
    await updateDoc(pedidoRef, { items, estado: todoListo ? 'listo' : 'en_preparacion' })
  }

  // Cambia el estado de un item de barra. El indice que llega es el de la lista
  // ya filtrada por destino, asi que hay que mapearlo al indice real del pedido.
  const cambiarEstadoItemBarra = async (mesaId, pedidoId, itemIdx, nuevoEstado) => {
    const pedidoRef = refPedido(localId, mesaId, pedidoId)
    const snap = await getDoc(pedidoRef)
    if (!snap.exists()) return
    const data = snap.data()
    let realIdx = -1, count = 0
    data.items.forEach((item, i) => {
      if (item.destino === 'encargado') { if (count === itemIdx) realIdx = i; count++ }
    })
    if (realIdx === -1) return
    const items = data.items.map((item, i) => i === realIdx ? { ...item, estado: nuevoEstado } : item)
    const todoListo = items.every(i => i.estado === 'listo' || i.estado === 'entregado')
    await updateDoc(pedidoRef, { items, estado: todoListo ? 'listo' : 'en_preparacion' })
  }

  const marcarPedidoEntregado = async (mesaId, pedidoId) => {
    await updateDoc(refPedido(localId, mesaId, pedidoId), { estado: 'entregado' })
  }

  const cancelarItem = async (mesaId, pedidoId, itemIdx) => {
    const pedidoRef = refPedido(localId, mesaId, pedidoId)
    const pedido = pedidos.find(p => p.id === pedidoId)
    if (!pedido) return
    const items = pedido.items.filter((_, i) => i !== itemIdx)
    const nuevoTotal = items.reduce((a, i) => a + i.precio * i.cantidad, 0)
    await updateDoc(pedidoRef, { items, total: nuevoTotal })
    const diff = pedido.items[itemIdx].precio * pedido.items[itemIdx].cantidad
    await updateDoc(refMesa(localId, mesaId), {
      total_acumulado: Math.max(0, (mesas[mesaId]?.total_acumulado || 0) - diff)
    })
  }

  // ── Confirmar pago y liberar mesa ────────────────────────────────────────────
  const confirmarPagoYLiberar = async (mesaId) => {
    const mesa = mesas[mesaId]
    if (!mesa) return
    if (!window.confirm(`¿Confirmar pago y liberar Mesa ${mesaId}?`)) return
    try {
      await addDoc(colHistorial(localId), {
        mesa_id: mesaId,
        fecha_hora_apertura: mesa.hora_apertura,
        fecha_hora_cierre: serverTimestamp(),
        clientes: mesa.clientes || [],
        personas: mesa.personas || 1,
        pedidos_resumen: pedidos.map(p => p.items).flat(),
        total_cobrado: mesa.total_acumulado || 0,
        propina: mesa.propina || 0,
        metodo_pago: mesa.metodo_pago || '',
        abona_con: mesa.abona_con || null,
      })
      await liberarMesa(localId, mesaId)
      setMesaSeleccionada(null); setPedidos([]); setMensajes([]); setLlamadas([])
    } catch (e) {
      alert('Error al liberar mesa: ' + e.message)
      console.error(e)
    }
  }

  // ── Resetear mesa sin registro (se fue sin pagar) ───────────────────────────
  const resetearMesaSinPago = async (mesaId) => {
    if (!window.confirm(`¿Resetear Mesa ${mesaId} sin registro? Se perderán todos los datos.`)) return
    try {
      await liberarMesa(localId, mesaId)
      setMesaSeleccionada(null); setPedidos([]); setMensajes([]); setLlamadas([])
    } catch (e) {
      alert('Error: ' + e.message)
    }
  }

  // ── Llamadas al mozo ─────────────────────────────────────────────────────────
  const resolverLlamada = async (mesaId, llamadaId) => {
    await updateDoc(refLlamada(localId, mesaId, llamadaId), { estado: 'resuelto' })
  }

  // ── Carta ────────────────────────────────────────────────────────────────────
  const toggleDisponible = async (itemId, actual) => {
    await updateDoc(refItemCarta(localId, itemId), { disponible: !actual })
  }

  const guardarEdicionItem = async () => {
    if (!editandoItem) return
    const { id, ...data } = editandoItem
    await updateDoc(refItemCarta(localId, id), data)
    setEditandoItem(null)
  }

  const guardarNuevoItem = async () => {
    if (!nuevoItem?.nombre || !nuevoItem?.precio) return
    await addDoc(colCarta(localId), { ...nuevoItem, disponible: true, imagen_url: '' })
    setNuevoItem(null)
  }

  const eliminarItem = async (itemId) => {
    if (!window.confirm('¿Eliminar este producto?')) return
    await deleteDoc(refItemCarta(localId, itemId))
  }

  // ── Chat ─────────────────────────────────────────────────────────────────────
  const handleEnviarMensaje = async () => {
    if (!textoMsg.trim() || !mesaSeleccionada) return
    await enviarMensaje(localId, mesaSeleccionada, textoMsg.trim(), 'Encargado')
    setTextoMsg('')
  }

  // ── Contadores ───────────────────────────────────────────────────────────────
  const mesasConAlerta = Object.values(mesas).filter(m =>
    m.estado === 'esperando_cuenta' || m.estado === 'esperando_preparacion'
  ).length

  const mesaData = mesaSeleccionada ? mesas[mesaSeleccionada] : null

  // Cola de barra aplanada: [{ ...pedido, mesaId }]
  const colaBarra = Object.entries(pedidosBarra)
    .flatMap(([mesaId, lista]) => lista.map(p => ({ ...p, mesaId })))
  const barraPendientes = colaBarra.filter(p => p.estado !== 'listo').length

  const TABS_SIDEBAR = [
    { key: 'mesas',        label: '🏠 Mesas' },
    { key: 'barra',        label: '☕ Barra' },
    { key: 'carta',        label: '📋 Carta' },
    { key: 'estadisticas', label: '📊 Estadísticas' },
    { key: 'historial',    label: '🕐 Historial' },
    { key: 'ajustes',      label: '⚙️ Ajustes' },
  ]

  const guardarAjustes = async () => {
    if (!configDB) return
    // Inicializar mesas nuevas si aumentó la cantidad
    const cantActual = cantidadMesas
    const cantNueva = configDB.mesas?.cantidad || 10
    if (cantNueva > cantActual) {
      const batch = writeBatch(db)
      for (let i = cantActual + 1; i <= cantNueva; i++) {
        const ref = refMesa(localId, i)
        const snap = await getDoc(ref)
        if (!snap.exists()) {
          batch.set(ref, {
            estado: 'libre', mesa_numero: String(i),
            clientes: [], dispositivos: [], carrito: [],
            carrito_bloqueado: false, total_acumulado: 0,
            propina: 0, metodo_pago: null, personas: 0,
          })
        }
      }
      await batch.commit()
    }
    setConfigGuardando(true)
    try {
      await guardarConfiguracion(localId, configDB)
      setConfigGuardado(true)
      setTimeout(() => setConfigGuardado(false), 2500)
    } catch (e) { alert('Error al guardar: ' + e.message) }
    setConfigGuardando(false)
  }

  const updateConfig = (path, value) => {
    setConfigDB(prev => {
      const parts = path.split('.')
      const next = { ...prev }
      let obj = next
      for (let i = 0; i < parts.length - 1; i++) {
        obj[parts[i]] = { ...obj[parts[i]] }
        obj = obj[parts[i]]
      }
      obj[parts[parts.length - 1]] = value
      return next
    })
  }

  return (
    <div className={styles.app}>

      {/* ── SIDEBAR ──────────────────────────────────────────────────────────── */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <img src={logo} alt="Logo" className={styles.sidebarLogo} onError={e => e.target.style.display='none'} />
          <div>
            <div className={styles.sidebarNombreBar}>{nombreBar}</div>
            <div className={styles.sidebarRol}>Encargado</div>
          </div>
          {mesasConAlerta > 0 && <span className={styles.alertBadge}>{mesasConAlerta}</span>}
        </div>

        <nav className={styles.sidebarNav}>
          {TABS_SIDEBAR.map(({ key, label }) => (
            <button key={key} className={`${styles.navBtn} ${tab === key ? styles.navActivo : ''}`}
              onClick={() => setTab(key)}>
              {label}
              {key === 'barra' && barraPendientes > 0 && (
                <span className={styles.alertBadge} style={{marginLeft:8}}>{barraPendientes}</span>
              )}
            </button>
          ))}
        </nav>

        <div className={styles.sidebarFooter}>
          <button
            className={`${styles.navBtn} ${audioOn ? styles.audioNavOn : ''}`}
            onClick={() => { activarAudio(); setAudioOn(true) }}
            title={audioOn ? 'Sonido activado' : 'Activar sonido'}
          >
            {audioOn ? '🔔 Sonido activado' : '🔕 Activar sonido'}
          </button>
          <button className={styles.navBtn} onClick={() => navigate(`/l/${localId}/cocina`)}>👨‍🍳 Cocina</button>
          <button className={styles.navBtn} onClick={() => navigate(`/l/${localId}/mozo`)}>🧍 Mozo</button>
          <button className={styles.navBtn} onClick={() => cerrarSesion()}>🚪 Cerrar sesion</button>
          <div className={styles.footerCopy}>{getCopyright()}</div>
        </div>
      </aside>

      {/* ── MAIN ─────────────────────────────────────────────────────────────── */}
      <main className={styles.main}>
        {soporte && (
          <div className="card" style={{
            margin:'0 0 16px', borderLeft:'3px solid var(--gold)',
            display:'flex', gap:10, alignItems:'center', flexWrap:'wrap',
          }}>
            <span style={{fontSize:'1.2em'}}>🛠️</span>
            <span style={{fontSize:'0.85em', color:'var(--text2)'}}>
              <strong style={{color:'var(--gold)'}}>Modo soporte.</strong>{' '}
              Estas viendo {nombreBar} como administrador de la plataforma. Podes
              consultar todo, pero las acciones que operan el local quedan del lado
              de su equipo.
            </span>
          </div>
        )}

        <NotifBanner />
      {/* ════════════════ TAB MESAS ════════════════ */}
        {tab === 'mesas' && (
          <div className={styles.mesasLayout}>

            {/* Grid */}
            <div className={styles.mesasGrid}>
              <h2 className={styles.sectionTitle}>Salón en tiempo real</h2>
              <div className={styles.grid}>
                {Array.from({ length: cantidadMesas }, (_, i) => String(i + 1)).map(num => {
                  const mesa = mesas[num]
                  const estado = mesa?.estado || 'libre'
                  const cls = estado.replace(/[^a-z]/g,'')
                  return (
                    <button key={num}
                      className={`${styles.mesaCard} ${styles['m_'+cls]} ${mesaSeleccionada===num?styles.mesaSeleccionada:''} ${estado==='esperando_cuenta'||estado==='cuenta_cobrada'?'cardUrgente':''}`}
                      onClick={() => { setMesaSeleccionada(num); setPedidos([]); setMensajes([]) }}>
                      <span className={styles.mesaNum}>Mesa {num}</span>
                      <span className={styles.mesaEstado}>{ESTADO_LABEL[estado]||estado}</span>
                      {mesa?.personas > 0 && <span className={styles.mesaPersonas}>👥 {mesa.personas} personas</span>}
                      {mesa?.clientes?.length > 0 && <span className={styles.mesaClientes}>{mesa.clientes.join(', ')}</span>}
                      {mesa?.total_acumulado > 0 && <span className={styles.mesaTotal}>${mesa.total_acumulado.toLocaleString()}</span>}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Detalle mesa */}
            {mesaSeleccionada && mesaData ? (
              <div className={styles.detalle}>
                <div className={styles.detalleHeader}>
                  <div>
                    <h2>Mesa {mesaSeleccionada}</h2>
                    <span style={{color:'var(--text2)',fontSize:'0.82em'}}>
                      {mesaData.clientes?.join(', ')} · {mesaData.personas} persona{mesaData.personas!==1?'s':''}
                    </span>
                  </div>
                  <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
                    {!soporte && (mesaData.estado === 'esperando_cuenta' || mesaData.estado === 'cuenta_cobrada') && (
                      <button className={styles.pagarBtn} onClick={() => confirmarPagoYLiberar(mesaSeleccionada)}>
                        ✅ Confirmar pago y liberar
                      </button>
                    )}
                    {!soporte && mesaData.estado !== 'libre' && (
                      <button className={styles.resetBtn} onClick={() => resetearMesaSinPago(mesaSeleccionada)}>
                        🚪 Cerrar mesa
                      </button>
                    )}
                  </div>
                </div>

                {/* Llamadas al mozo */}
                {llamadas.filter(l => l.estado === 'pendiente').length > 0 && (
                  <div className={styles.llamadasBox}>
                    <p className={styles.llamadasTitle}>✋ Llamadas pendientes</p>
                    {llamadas.filter(l => l.estado === 'pendiente').map(l => (
                      <div key={l.id} className={styles.llamadaRow}>
                        <span>{l.cliente}: <strong>{l.nota}</strong></span>
                        {!soporte && <button className={styles.resolverBtn} onClick={() => resolverLlamada(mesaSeleccionada, l.id)}>✓ Resolver</button>}
                      </div>
                    ))}
                  </div>
                )}

                {/* Pedidos */}
                <h3 className={styles.subTitle}>Pedidos</h3>
                {pedidos.length === 0
                  ? <p className={styles.empty}>Sin pedidos aún</p>
                  : pedidos.map((p, pi) => (
                    <div key={p.id} className={styles.pedidoCard}>
                      <div className={styles.pedidoHeader}>
                        <span>Pedido #{pi+1}</span>
                        <div style={{display:'flex',gap:8,alignItems:'center'}}>
                          <span className={`badge badge-${p.estado==='entregado'?'green':p.estado==='listo'?'yellow':'gold'}`}>
                            {p.estado==='pendiente'?'⏳ Pendiente':p.estado==='en_preparacion'?'👨‍🍳 Preparando':p.estado==='listo'?'✅ Listo':'🎉 Entregado'}
                          </span>
                          {!soporte && p.estado==='listo' && (
                            <button className={styles.actionBtn} onClick={() => marcarPedidoEntregado(mesaSeleccionada, p.id)}>Entregado</button>
                          )}
                        </div>
                      </div>
                      {p.items.map((item, ii) => (
                        <div key={ii} className={styles.itemRow}>
                          <div className={styles.itemInfo2}>
                            <span>{item.cantidad}× {item.nombre}</span>
                            {item.nota && <span style={{color:'var(--yellow)',fontSize:'0.75em'}}>📝 {item.nota}</span>}
                            <span style={{color:'var(--text3)',fontSize:'0.75em'}}>{item.destino}</span>
                          </div>
                          <div style={{display:'flex',gap:6,alignItems:'center'}}>
                            <span style={{color:'var(--gold)'}}>${(item.precio*item.cantidad).toLocaleString()}</span>
                            {soporte ? (
                              <span style={{color:'var(--text3)',fontSize:'0.75em'}}>{item.estado}</span>
                            ) : (
                              <div className={styles.itemEstados}>
                                {['pendiente','en_preparacion','listo'].map(e => (
                                  <button key={e} className={`${styles.estadoBtn} ${item.estado===e?styles.estadoBtnActivo:''}`}
                                    onClick={() => cambiarEstadoItem(mesaSeleccionada, p.id, ii, e)}>
                                    {e==='pendiente'?'⏳':e==='en_preparacion'?'🔥':'✅'}
                                  </button>
                                ))}
                                <button className={styles.cancelBtn} onClick={() => cancelarItem(mesaSeleccionada, p.id, ii)}>✕</button>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ))
                }

                {/* Cuenta */}
                {(mesaData.estado==='esperando_cuenta'||mesaData.estado==='cuenta_cobrada') && (
                  <div className={styles.cuentaBox}>
                    <h3 className={styles.subTitle}>💳 Cuenta</h3>
                    <div className={styles.cuentaRow}><span>Subtotal</span><span>${mesaData.total_acumulado?.toLocaleString()}</span></div>
                    {mesaData.propina>0 && <div className={styles.cuentaRow}><span>Propina</span><span style={{color:'var(--green)'}}>+${mesaData.propina?.toLocaleString()}</span></div>}
                    <div className={styles.cuentaTotal}><span>TOTAL</span><span>${((mesaData.total_acumulado||0)+(mesaData.propina||0)).toLocaleString()}</span></div>
                    <div className={styles.metodoPago}>
                      Método: <strong>{mesaData.metodo_pago==='tarjeta'?'💳 Tarjeta':mesaData.metodo_pago==='efectivo'?'💵 Efectivo':'📲 Transferencia'}</strong>
                    </div>
                    {mesaData.metodo_pago==='efectivo' && mesaData.abona_con && (
                      <div className={styles.metodoPago} style={{marginTop:4}}>
                        Abona con: <strong>${parseFloat(mesaData.abona_con).toLocaleString()}</strong>
                        &nbsp;·&nbsp; Vuelto: <strong style={{color:'var(--green)'}}>
                          ${(parseFloat(mesaData.abona_con) - (mesaData.total_acumulado||0) - (mesaData.propina||0)).toLocaleString()}
                        </strong>
                      </div>
                    )}
                  </div>
                )}

                {/* Chat */}
                <h3 className={styles.subTitle} style={{marginTop:16}}>💬 Chat</h3>
                <div className={styles.chatBox}>
                  {mensajes.map(m => (
                    <div key={m.id} className={`${styles.msg} ${m.autor==='Encargado'?styles.msgPropio:styles.msgOtro}`}>
                      <span className={styles.msgAutor}>{m.autor}</span>
                      <span className={styles.msgTexto}>{m.texto}</span>
                    </div>
                  ))}
                  {mensajes.length===0 && <p style={{color:'var(--text3)',fontSize:'0.8em',padding:8}}>Sin mensajes</p>}
                </div>
                {!soporte && (
                  <div className={styles.chatInput}>
                    <input className="input" style={{borderRadius:'10px 0 0 10px',borderRight:'none'}}
                      placeholder="Mensaje al cliente..." value={textoMsg}
                      onChange={e => setTextoMsg(e.target.value)} onKeyDown={e => e.key==='Enter'&&handleEnviarMensaje()} />
                    <button className={styles.sendBtn} onClick={handleEnviarMensaje}>→</button>
                  </div>
                )}
              </div>
            ) : (
              <div className={styles.detalleVacio}><p>Seleccioná una mesa para ver el detalle</p></div>
            )}
          </div>
        )}

        {/* ════════════════ TAB BARRA ════════════════ */}
        {tab === 'barra' && (
          <div className={styles.cartaContainer}>
            <h2 className={styles.sectionTitle}>☕ Barra — para preparar</h2>
            <p className={styles.ajustesDesc} style={{marginTop:-12, marginBottom:20}}>
              Cafetería, licuados y todo lo que prepara el encargado. Cuando marcás un ítem
              como listo, el mozo lo ve en sus alertas para llevarlo a la mesa.
            </p>
            {colaBarra.length === 0 ? (
              <p className={styles.empty}>No hay nada para preparar en la barra</p>
            ) : (
              colaBarra.map(p => (
                <div key={p.mesaId + p.id} className={styles.pedidoCard}>
                  <div className={styles.pedidoHeader}>
                    <span className={styles.barraMesaTag}>Mesa {p.mesaId}</span>
                    <span style={{color:'var(--text3)', fontSize:'0.78em'}}>
                      {p.created_at?.toDate?.()?.toLocaleTimeString?.('es-AR', {hour:'2-digit', minute:'2-digit'}) || ''}
                    </span>
                  </div>
                  {p.items.map((item, ii) => (
                    <div key={ii} className={styles.itemRow}>
                      <div className={styles.itemInfo2}>
                        <span>{item.cantidad}× {item.nombre}</span>
                        {item.nota && <span style={{color:'var(--yellow)', fontSize:'0.75em'}}>📝 {item.nota}</span>}
                      </div>
                      {soporte ? (
                        <span style={{color:'var(--text3)', fontSize:'0.75em'}}>{item.estado}</span>
                      ) : (
                        <div className={styles.itemEstados}>
                          {['pendiente','en_preparacion','listo'].map(e => (
                            <button key={e}
                              className={`${styles.estadoBtn} ${item.estado===e?styles.estadoBtnActivo:''}`}
                              onClick={() => cambiarEstadoItemBarra(p.mesaId, p.id, ii, e)}>
                              {e==='pendiente'?'⏳':e==='en_preparacion'?'🔥':'✅'}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        )}

        {/* ════════════════ TAB CARTA ════════════════ */}
        {tab === 'carta' && (
          <div className={styles.cartaContainer}>
            <div className={styles.cartaTopBar}>
              <h2 className={styles.sectionTitle} style={{marginBottom:0}}>Administrar carta</h2>
              {!soporte && (
                <button className={styles.agregarBtn} onClick={() => setNuevoItem({ nombre:'', descripcion:'', precio:0, categoria:'comida', destino:'cocina', disponible:true })}>
                  + Agregar producto
                </button>
              )}
            </div>

            {/* Formulario nuevo producto */}
            {nuevoItem && (
              <div className={styles.formCard}>
                <h3 className={styles.subTitle}>Nuevo producto</h3>
                <div className={styles.formGrid}>
                  <input className="input" placeholder="Nombre" value={nuevoItem.nombre} onChange={e => setNuevoItem(p=>({...p,nombre:e.target.value}))} />
                  <input className="input" placeholder="Descripción" value={nuevoItem.descripcion} onChange={e => setNuevoItem(p=>({...p,descripcion:e.target.value}))} />
                  <input className="input" placeholder="Precio" type="number" value={nuevoItem.precio} onChange={e => setNuevoItem(p=>({...p,precio:Number(e.target.value)}))} />
                  <select className="input" value={nuevoItem.categoria} onChange={e => {
                    const cat = e.target.value
                    const destino = cat==='comida'||cat==='postre'?'cocina':cat==='bebida_preparada'?'encargado':cat==='promocion'?'cocina':'mozo'
                    setNuevoItem(p=>({...p,categoria:cat,destino}))
                  }}>
                    <option value="promocion">🌟 Promoción del día</option>
                    <option value="comida">Comida</option>
                    <option value="bebida_preparada">Cafetería</option>
                    <option value="bebida_simple">Bebida simple</option>
                    <option value="postre">Postre</option>
                  </select>
                  {nuevoItem.categoria === 'promocion' && (
                    <div style={{gridColumn:'1/-1'}}>
                      <label style={{fontSize:'0.78em',color:'var(--text2)',display:'block',marginBottom:4}}>
                        ¿A dónde va este pedido?
                      </label>
                      <select className="input" value={nuevoItem.destino||'cocina'} onChange={e => setNuevoItem(p=>({...p,destino:e.target.value}))}>
                        <option value="cocina">👨‍🍳 Cocina — menú del día, combos con comida</option>
                        <option value="encargado">☕ Encargado/Barra — licuados, cafés especiales</option>
                        <option value="mozo">🥤 Mozo — bebidas simples, sin preparación</option>
                      </select>
                    </div>
                  )}
                </div>
                <div style={{display:'flex',gap:8,marginTop:12}}>
                  <button className="btn btn-ghost" style={{flex:1}} onClick={() => setNuevoItem(null)}>Cancelar</button>
                  <button className="btn btn-gold" style={{flex:2}} onClick={guardarNuevoItem}>Guardar</button>
                </div>
              </div>
            )}

            {['promocion','comida','bebida_preparada','bebida_simple','postre'].map(cat => {
              const items = carta.filter(i => i.categoria===cat)
              if (!items.length) return null
              return (
                <div key={cat}>
                  <h3 className={styles.catTitle}>
                    {cat==='promocion'?'🌟 Promociones del día':cat==='comida'?'🍽️ Comidas':cat==='bebida_preparada'?'☕ Cafetería':cat==='bebida_simple'?'🥤 Bebidas':'🍰 Postres'}
                  </h3>
                  {items.map(item => (
                    <div key={item.id}>
                      {editandoItem?.id === item.id ? (
                        <div className={styles.formCard}>
                          <div className={styles.formGrid}>
                            <input className="input" placeholder="Nombre" value={editandoItem.nombre} onChange={e => setEditandoItem(p=>({...p,nombre:e.target.value}))} />
                            <input className="input" placeholder="Descripción" value={editandoItem.descripcion} onChange={e => setEditandoItem(p=>({...p,descripcion:e.target.value}))} />
                            <input className="input" placeholder="Precio" type="number" value={editandoItem.precio} onChange={e => setEditandoItem(p=>({...p,precio:Number(e.target.value)}))} />
                            {editandoItem.categoria === 'promocion' && (
                              <div style={{gridColumn:'1/-1'}}>
                                <label style={{fontSize:'0.78em',color:'var(--text2)',display:'block',marginBottom:4}}>¿A dónde va este pedido?</label>
                                <select className="input" value={editandoItem.destino||'cocina'} onChange={e => setEditandoItem(p=>({...p,destino:e.target.value}))}>
                                  <option value="cocina">👨‍🍳 Cocina</option>
                                  <option value="encargado">☕ Encargado/Barra</option>
                                  <option value="mozo">🥤 Mozo</option>
                                </select>
                              </div>
                            )}
                          </div>
                          <div style={{display:'flex',gap:8,marginTop:12}}>
                            <button className="btn btn-ghost" style={{flex:1}} onClick={() => setEditandoItem(null)}>Cancelar</button>
                            <button className="btn btn-gold" style={{flex:2}} onClick={guardarEdicionItem}>Guardar</button>
                          </div>
                        </div>
                      ) : (
                        <div className={styles.cartaItem}>
                          <div className={styles.cartaInfo}>
                            <span className={styles.cartaNombre}>{item.nombre}</span>
                            <span className={styles.cartaDesc}>{item.descripcion}</span>
                            <span className={styles.cartaPrecio}>${item.precio.toLocaleString()}</span>
                          </div>
                          <div className={styles.cartaAcciones}>
                            {soporte ? (
                              <span style={{color:'var(--text3)', fontSize:'0.8em'}}>{item.disponible?'✅ disponible':'❌ sin stock'}</span>
                            ) : (
                              <>
                                <button className={`${styles.toggleBtn} ${item.disponible?styles.toggleOn:styles.toggleOff}`}
                                  onClick={() => toggleDisponible(item.id, item.disponible)}>
                                  {item.disponible?'✅':'❌'}
                                </button>
                                <button className={styles.editBtn} onClick={() => setEditandoItem({...item})}>✏️</button>
                                <button className={styles.deleteBtn} onClick={() => eliminarItem(item.id)}>🗑️</button>
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        )}

        {/* ════════════════ TAB ESTADÍSTICAS ════════════════ */}
        {tab === 'estadisticas' && (
          <div className={styles.statsContainer}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
              <h2 className={styles.sectionTitle} style={{marginBottom:0}}>Estadísticas del día</h2>
              <button className={styles.agregarBtn} onClick={calcularEstadisticas}>↻ Actualizar</button>
            </div>
            {estadisticas ? (
              <>
                <div className={styles.statsGrid}>
                  <div className={styles.statCard}>
                    <span className={styles.statIcon}>💵</span>
                    <span className={styles.statLabel}>Efectivo</span>
                    <span className={styles.statValor}>${estadisticas.efectivo.toLocaleString()}</span>
                  </div>
                  <div className={styles.statCard}>
                    <span className={styles.statIcon}>💳</span>
                    <span className={styles.statLabel}>Tarjeta</span>
                    <span className={styles.statValor}>${estadisticas.tarjeta.toLocaleString()}</span>
                  </div>
                  <div className={styles.statCard}>
                    <span className={styles.statIcon}>📲</span>
                    <span className={styles.statLabel}>Transferencia</span>
                    <span className={styles.statValor}>${estadisticas.transferencia.toLocaleString()}</span>
                  </div>
                  <div className={styles.statCard}>
                    <span className={styles.statIcon}>🙏</span>
                    <span className={styles.statLabel}>Propinas</span>
                    <span className={styles.statValor} style={{color:'var(--green)'}}>+${estadisticas.propinas.toLocaleString()}</span>
                  </div>
                </div>
                <div className={styles.statTotal}>
                  <span>TOTAL DEL DÍA</span>
                  <span>${estadisticas.total.toLocaleString()}</span>
                </div>
                <div className={styles.statMesas}>
                  {estadisticas.mesas} mesa{estadisticas.mesas!==1?'s':''} atendida{estadisticas.mesas!==1?'s':''}
                </div>
              </>
            ) : (
              <p className={styles.empty}>Cargando estadísticas...</p>
            )}
          </div>
        )}

        {/* ════════════════ TAB AJUSTES ════════════════ */}
        {tab === 'ajustes' && (
          <div className={styles.ajustesContainer}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24}}>
              <h2 className={styles.sectionTitle} style={{marginBottom:0}}>⚙️ Ajustes</h2>
              {!soporte && (
                <button
                  className={styles.guardarBtn}
                  onClick={guardarAjustes}
                  disabled={configGuardando}
                >
                  {configGuardado ? '✅ Guardado' : configGuardando ? 'Guardando...' : '💾 Guardar cambios'}
                </button>
              )}
            </div>

            {configDB ? (
              <>
                {/* ── TRANSFERENCIA ── */}
                <div className={styles.ajustesSeccion}>
                  <h3 className={styles.ajustesTitulo}>📲 Datos de transferencia</h3>
                  <p className={styles.ajustesDesc}>El cliente ve estos datos cuando elige pagar por transferencia.</p>
                  <div className={styles.ajustesGrid}>
                    <div className={styles.ajustesField}>
                      <label>Titular de la cuenta</label>
                      <input className="input" value={configDB.transferencia?.titular || ''}
                        onChange={e => updateConfig('transferencia.titular', e.target.value)}
                        placeholder="Nombre del titular" />
                    </div>
                    <div className={styles.ajustesField}>
                      <label>Banco</label>
                      <input className="input" value={configDB.transferencia?.banco || ''}
                        onChange={e => updateConfig('transferencia.banco', e.target.value)}
                        placeholder="Nombre del banco" />
                    </div>
                    <div className={styles.ajustesField}>
                      <label>CBU</label>
                      <input className="input" value={configDB.transferencia?.cbu || ''}
                        onChange={e => updateConfig('transferencia.cbu', e.target.value)}
                        placeholder="22 dígitos" />
                    </div>
                    <div className={styles.ajustesField}>
                      <label>Alias</label>
                      <input className="input" value={configDB.transferencia?.alias || ''}
                        onChange={e => updateConfig('transferencia.alias', e.target.value)}
                        placeholder="alias.de.pago" />
                    </div>
                  </div>
                </div>


                {/* ── MESAS ── */}
                <div className={styles.ajustesSeccion}>
                  <h3 className={styles.ajustesTitulo}>🏠 Cantidad de mesas</h3>
                  <p className={styles.ajustesDesc}>Cuántas mesas se muestran en el salón. Máximo 30.</p>
                  <div style={{maxWidth:200}}>
                    <input className="input" type="number" min="1" max="30"
                      value={configDB.mesas?.cantidad || 10}
                      onChange={e => updateConfig('mesas.cantidad', parseInt(e.target.value) || 10)} />
                  </div>
                  <p className={styles.ajustesAviso}>⚠️ Este cambio se aplica al recargar la página.</p>
                </div>

                {/* ── EQUIPO DEL LOCAL ── */}
                <div className={styles.ajustesSeccion}>
                  <h3 className={styles.ajustesTitulo}>👥 {soporte ? 'Equipo del local' : 'Tu equipo'}</h3>
                  {soporte ? (
                    <p className={styles.ajustesDesc}>
                      El equipo lo administra el encargado del local. Desde soporte no se
                      dan de alta ni de baja cuentas.
                    </p>
                  ) : (
                    <EquipoDelLocal localId={localId} cantidadMesas={cantidadMesas} />
                  )}
                </div>

                {/* ── INFO SOLO LECTURA ── */}
                <div className={styles.ajustesSeccion} style={{opacity:0.6}}>
                  <h3 className={styles.ajustesTitulo}>🔐 Tu cuenta</h3>
                  <p className={styles.ajustesDesc}>El plan y el estado los administra Hexa Group.</p>
                  <div className={styles.ajustesReadOnly}>
                    <span>Local: <strong>{nombreBar}</strong></span>
                    <span>Identificador: <strong>{localId}</strong></span>
                    <span>Estado: <strong>{local?.estado || '—'}</strong></span>
                    <span>Link de las mesas: <strong>/l/{localId}/mesa/1</strong></span>
                  </div>
                </div>
              </>
            ) : (
              <div style={{textAlign:'center', padding:'48px 24px', color:'var(--text3)'}}>
                <p style={{fontSize:'1.5em', marginBottom:8}}>⏳</p>
                <p>Cargando configuración...</p>
              </div>
            )}
          </div>
        )}

        {/* ════════════════ TAB HISTORIAL ════════════════ */}
        {tab === 'historial' && (
          <div className={styles.historialContainer}>
            <h2 className={styles.sectionTitle}>Historial</h2>

            {/* Filtros */}
            <div className={styles.filtros}>
              <div className={styles.filtroGrupo}>
                <label className={styles.filtroLabel}>Desde</label>
                <input className="input" type="date" value={filtroDesde} onChange={e => setFiltroDesde(e.target.value)} />
              </div>
              <div className={styles.filtroGrupo}>
                <label className={styles.filtroLabel}>Hasta</label>
                <input className="input" type="date" value={filtroHasta} onChange={e => setFiltroHasta(e.target.value)} />
              </div>
              <button className={styles.agregarBtn} onClick={() => cargarHistorial(filtroDesde||null, filtroHasta||null)}>
                Filtrar
              </button>
              {!soporte && historial.length > 0 && (
                <button className={styles.borrarBtn} onClick={borrarHistorialFiltrado}>🗑️ Borrar filtrado</button>
              )}
            </div>

            {historial.length === 0
              ? <p className={styles.empty}>No hay registros</p>
              : historial.map(h => (
                <div key={h.id} className={styles.historialCard}>
                  <div className={styles.historialHeader}>
                    <span>Mesa {h.mesa_id} — {h.clientes?.join(', ')} · {h.personas} persona{h.personas!==1?'s':''}</span>
                    <span style={{color:'var(--text2)',fontSize:'0.78em'}}>
                      {h.fecha_hora_cierre?.toDate?.()?.toLocaleString?.('es-AR')}
                    </span>
                  </div>
                  <div className={styles.historialRow}><span>Total cobrado</span><span style={{color:'var(--gold)'}}>${h.total_cobrado?.toLocaleString()}</span></div>
                  {h.propina>0 && <div className={styles.historialRow}><span>Propina</span><span style={{color:'var(--green)'}}>+${h.propina?.toLocaleString()}</span></div>}
                  <div className={styles.historialRow}><span>Método</span><span>{h.metodo_pago}</span></div>
                </div>
              ))
            }
          </div>
        )}

      </main>
    </div>
  )
}
