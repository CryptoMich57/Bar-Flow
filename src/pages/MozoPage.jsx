import { useState, useEffect, useRef } from 'react'
import { onSnapshot, updateDoc, query, orderBy } from 'firebase/firestore'
import { llamarBackend } from '../firebase/funciones'
import { getCopyright, MESAS_POR_DEFECTO } from '../config'
import { suscribirConfiguracion } from '../firebase/configuracion'
import { suscribirCarta, agregarPedidoExtra, suscribirMesas, pedirCuenta } from '../firebase/mesa'
import { refMesa, colPedidos, colLlamadas, refLlamada } from '../firebase/rutas'
import { useLocal } from '../utils/LocalContext'
import { useAccesoActual } from '../utils/AccesoContext'
import { crearRegistroDeAvisos, novedades } from '../utils/avisos'
import { categoriasDeLaCarta, esDeCategoria, etiquetaDeCategoria } from '../utils/categorias'
import styles from './MozoPage.module.css'
import '../utils/animaciones.css'
import { useNotificaciones } from '../utils/useNotificaciones.jsx'
import { sonidoPedidoListo, sonidoLlamadaMozo, sonidoCuenta } from '../utils/sonidos'
import { useAudioListo } from '../utils/useAudio'
import { cerrarSesion } from '../firebase/auth'

// Los estados de la mesa, dichos como los diria un mozo.
const ESTADO_PARA_EL_MOZO = {
  ocupada:               '🟦 Sentados',
  esperando_preparacion: '🟡 Pedido en curso',
  esperando_cuenta:      '🔴 Pide la cuenta',
  cuenta_cobrada:        '✅ Cobrada',
}

const METODO_LABEL = {
  efectivo:      '💵 Efectivo',
  tarjeta:       '💳 Tarjeta',
  transferencia: '📲 Transferencia',
}

export default function MozoPage() {
  const { localId, nombre: nombreBar, logo } = useLocal()
  // soporte = plataforma mirando el local de un cliente. Ve, no opera.
  // ficha = quien es esta persona EN ESTE local. Antes la vista preguntaba
  // "¿quien sos?" y ofrecia elegir de una lista: cualquier mozo podia
  // operar y quedar registrado como otro, y tomarle las mesas. Ahora la
  // identidad es la cuenta con la que entro, y no se puede cambiar.
  const { soporte, ficha } = useAccesoActual()
  const [mesas, setMesas]                 = useState({})
  const [pedidosPorMesa, setPedidosPorMesa] = useState({})
  const [llamadasPorMesa, setLlamadasPorMesa] = useState({})
  const [carta, setCarta]                 = useState([])
  const [tab, setTab]                     = useState('alertas')
  const [mesaPedido, setMesaPedido]       = useState(null)
  // Mesa que se esta cobrando: el mozo elige el metodo de pago y la mesa
  // queda pidiendo la cuenta. Cerrar la caja sigue siendo del encargado.
  const [mesaACobrar, setMesaACobrar]     = useState(null)
  const [cobrando, setCobrando]           = useState(false)
  const [carritoMozo, setCarritoMozo]     = useState([])
  const [categoriaActiva, setCategoriaActiva] = useState(null)
  const [cargando, setCargando]           = useState(false)
  // El sonido se habilita con el primer toque, sin tener que buscar el boton:
  // un mozo que no lo apretaba se perdia los avisos sin saberlo.
  const audioOn                           = useAudioListo()
  const { agregar: notif, NotifBanner }   = useNotificaciones()

  const [cantMesas, setCantMesas] = useState(MESAS_POR_DEFECTO)

  useEffect(() => {
    return suscribirConfiguracion(
      localId,
      (cfg) => { if (cfg?.mesas?.cantidad) setCantMesas(cfg.mesas.cantidad) },
      (e) => notif(`No se pudo leer la configuracion: ${e.message}`, 'Red', 8000),
    )
  }, [localId, notif])
  // Ver src/utils/avisos.js: la linea de base se lleva por mesa, no por
  // "el registro esta vacio". Con lo anterior, una mesa que arrancaba sin
  // llamadas pendientes no avisaba nunca la primera.
  const avisosListos   = useRef(crearRegistroDeAvisos())
  const avisosLlamadas = useRef(crearRegistroDeAvisos())
  const avisosCuentas  = useRef(crearRegistroDeAvisos())

  // ── Suscripciones ────────────────────────────────────────────────────────────
  useEffect(() => {
    const NUMS_MESAS = Array.from({ length: cantMesas }, (_, i) => String(i + 1))
    // Las mesas van en un solo listener: todas viven en la misma coleccion.
    const uMesas = suscribirMesas(localId, setMesas, (e) =>
      notif(`No se pueden leer las mesas: ${e.message}`, 'Red', 8000))
    const unsubs = NUMS_MESAS.map(num => {
      const u2 = onSnapshot(
        query(colPedidos(localId, num), orderBy('created_at', 'asc')),
        snap => {
          const pedidos = snap.docs.map(d => ({ id: d.id, ...d.data() }))
          setPedidosPorMesa(prev => ({ ...prev, [num]: pedidos }))
        },
        (e) => notif(`No se ven los pedidos de la mesa ${num}: ${e.message}`, 'Red', 8000),
      )
      const u3 = onSnapshot(
        query(colLlamadas(localId, num), orderBy('created_at', 'desc')),
        snap => {
          const llamadas = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(l => l.estado === 'pendiente')
          setLlamadasPorMesa(prev => ({ ...prev, [num]: llamadas }))
        },
        // El mozo depende de esto para saber que lo estan llamando: que
        // falle sin avisar es peor que no tenerlo.
        (e) => notif(`No se ven las llamadas de la mesa ${num}: ${e.message}`, 'Red', 8000),
      )
      return () => { u2(); u3() }
    })
    return () => { uMesas(); unsubs.forEach(u => u()) }
  }, [localId, cantMesas, notif])

  useEffect(() => {
    const unsub = suscribirCarta(localId, setCarta)
    return unsub
  }, [localId])

  // Las mesas asignadas viven en la ficha y las administra el encargado.
  // Sin asignacion explicita, la persona ve todo el salon: es lo que
  // esperan los bares chicos, donde no hay sectores.
  //
  // Esto tiene que quedar ARRIBA del efecto de avisos. El array de
  // dependencias de un useEffect se evalua durante el render, en el punto
  // exacto donde esta escrito: si misMesas se declarara mas abajo, esa
  // evaluacion caeria en la zona muerta temporal y la vista reventaria
  // entera con "Cannot access 'misMesas' before initialization", sin
  // llegar a pintar nada.
  // La primera categoria disponible se elige sola cuando llega la carta:
  // fijarla en 'comida' dejaba la pantalla vacia en un bar que solo vende
  // bebidas.
  const categoriasVisibles = categoriasDeLaCarta(carta)
  useEffect(() => {
    if (!categoriaActiva && categoriasVisibles.length > 0) {
      setCategoriaActiva(categoriasVisibles[0])
    }
  }, [categoriaActiva, categoriasVisibles])

  const NUMS_MESAS_ACTUAL = Array.from({ length: cantMesas }, (_, i) => String(i + 1))
  const misMesas = ficha?.mesas_asignadas?.length > 0
    ? ficha.mesas_asignadas.map(String)
    : NUMS_MESAS_ACTUAL

  // ── Sonidos + notificaciones al detectar cambios ─────────────────────────────
  useEffect(() => {
    // Pedidos listos nuevos
    const listosActuales = {}
    misMesas.flatMap(n => (pedidosPorMesa[n]||[]).map(p => ({ ...p, mesaId: n })))
      .filter(p => p.estado === 'listo')
      .forEach(p => { listosActuales[p.id] = p })
    const listosNuevos = novedades(
      avisosListos.current,
      Object.values(listosActuales).map(p => ({ id: p.id, mesa: p.mesaId, ...p })),
      misMesas.filter(n => pedidosPorMesa[n] !== undefined),
    )
    if (listosNuevos.length > 0) {
      sonidoPedidoListo()
      listosNuevos.forEach(p => notif(`✅ Pedido listo — Mesa ${p.mesaId}`, 'Green', 4000))
    }

    // Llamadas nuevas
    const llamadasActuales = {}
    misMesas.flatMap(n => (llamadasPorMesa[n]||[]).map(l => ({ ...l, mesaId: n })))
      .forEach(l => { llamadasActuales[l.id] = l })
    const llamadasNuevas = novedades(
      avisosLlamadas.current,
      Object.values(llamadasActuales).map(l => ({ ...l, mesa: l.mesaId })),
      misMesas.filter(n => llamadasPorMesa[n] !== undefined),
    )
    if (llamadasNuevas.length > 0) {
      sonidoLlamadaMozo()
      llamadasNuevas.forEach(l => notif(`✋ Mesa ${l.mesaId}: ${l.nota || 'te llama'}`, 'Yellow', 5000))
    }

    // Cuentas nuevas
    const cuentasActuales = {}
    misMesas.map(n => mesas[n]).filter(m => m?.estado === 'esperando_cuenta')
      .forEach(m => { cuentasActuales[m.mesa_numero] = m })
    const cuentasNuevas = novedades(
      avisosCuentas.current,
      Object.values(cuentasActuales).map(m => ({ ...m, id: `cuenta_${m.mesa_numero}`, mesa: m.mesa_numero })),
      misMesas.filter(n => mesas[n] !== undefined),
    )
    if (cuentasNuevas.length > 0) {
      sonidoCuenta()
      cuentasNuevas.forEach(m => notif(`💳 Mesa ${m.mesa_numero} pide la cuenta`, 'Red', 6000))
    }

  }, [pedidosPorMesa, llamadasPorMesa, mesas, misMesas, notif])

  // Al cambiar de local se empieza de cero: lo del bar anterior no es
  // novedad acá, y sus ids no tienen por qué seguir ocupando memoria.
  useEffect(() => {
    avisosListos.current   = crearRegistroDeAvisos()
    avisosLlamadas.current = crearRegistroDeAvisos()
    avisosCuentas.current  = crearRegistroDeAvisos()
  }, [localId])

  // ── Mis mesas (las asignadas al mozo activo) ──────────────────────────────────
  // Cuanta gente hay sentada en una mesa. El mozo lo necesita para saber
  // cuantos vasos, cuantos cubiertos y cuantas cartas llevar: antes esto
  // solo lo veia el encargado.
  const personasDe = (num) => {
    const mesa = mesas[num]
    const n = mesa?.personas
    if (!n || mesa?.estado === 'libre') return null
    return <span className={styles.personasTag}>👥 {n}</span>
  }

  // ── Alertas del mozo ──────────────────────────────────────────────────────────
  const mesasCuenta = misMesas.map(n => mesas[n]).filter(m => m?.estado === 'esperando_cuenta')

  const pedidosListos = misMesas
    .flatMap(num => (pedidosPorMesa[num] || []).map(p => ({ ...p, mesaId: num })))
    .filter(p => p.estado === 'listo')

  const pedidosMozo = misMesas
    .flatMap(num => (pedidosPorMesa[num] || []).map(p => ({ ...p, mesaId: num })))
    .filter(p => p.estado !== 'listo' && p.estado !== 'entregado'
      && p.items?.some(i => i.destino === 'mozo'))

  const llamadasPendientes = misMesas
    .flatMap(num => (llamadasPorMesa[num] || []).map(l => ({ ...l, mesaId: num })))

  const totalAlertas = mesasCuenta.length + pedidosListos.length + pedidosMozo.length + llamadasPendientes.length

  // ── Acciones ──────────────────────────────────────────────────────────────────
  const marcarEntregado = async (mesaId, pedidoId) => {
    try {
      await llamarBackend('marcarPedidoEntregado', { localId, mesaId, pedidoId })
    } catch (e) {
      notif(`No se pudo marcar entregado: ${e.message}`, 'Red', 5000)
    }
  }

  // Igual que en cocina: lo resuelve el backend en transaccion para que
  // dos personas sobre la misma comanda no se pisen.
  const cambiarEstadoItem = async (mesaId, pedidoId, rid, nuevoEstado) => {
    try {
      await llamarBackend('cambiarEstadoItem', {
        localId, mesaId, pedidoId, rid, estado: nuevoEstado,
      })
    } catch (e) {
      notif(`No se pudo actualizar: ${e.message}`, 'Red', 5000)
    }
  }

  const resolverLlamada = async (mesaId, llamadaId) => {
    await updateDoc(refLlamada(localId, mesaId, llamadaId), { estado: 'resuelto' })
  }

  /**
   * El mozo marca COMO se paga; el encargado confirma y cierra la caja.
   *
   * Es la division que ya existia y que faltaba conectar: `pedirCuenta` deja
   * la mesa en "esperando_cuenta", que es exactamente el estado del que el
   * encargado sabe salir con "Confirmar pago y liberar".
   *
   * Antes esto solo podia hacerlo el comensal desde su telefono, asi que una
   * mesa cargada por el mozo no tenia forma de llegar al cobro: la unica
   * salida era "Cerrar mesa", que libera SIN registrar la venta. La plata
   * desaparecia de la caja sin que nadie lo notara.
   */
  const cobrarMesa = async (mesaId, metodoPago) => {
    setCobrando(true)
    try {
      await pedirCuenta(localId, mesaId, metodoPago, 0, null)
      setMesaACobrar(null)
      notif(`Mesa ${mesaId} lista para cobrar. El encargado la cierra.`, 'Green', 5000)
    } catch (e) {
      notif(`No se pudo pasar a cobro: ${e.message}`, 'Red', 6000)
    }
    setCobrando(false)
  }

  const marcarMesaCobrada = async (mesaId) => {
    await updateDoc(refMesa(localId, mesaId), { estado: 'cuenta_cobrada' })
  }

  // Escape cierra el cobro. Es el camino de teclado del modal: tocar el
  // fondo es una comodidad del mouse.
  useEffect(() => {
    if (!mesaACobrar) return
    const alTeclado = (e) => { if (e.key === 'Escape') setMesaACobrar(null) }
    window.addEventListener('keydown', alTeclado)
    return () => window.removeEventListener('keydown', alTeclado)
  }, [mesaACobrar])

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
      // Un solo camino: el backend arma el pedido con los precios de la
      // carta y ajusta el total de la mesa en la misma transaccion. Antes
      // eran dos escrituras sueltas y un corte en el medio dejaba el
      // pedido cargado sin sumar a la cuenta.
      await agregarPedidoExtra(localId, mesaPedido, carritoMozo)
      setCarritoMozo([])
      setMesaPedido(null)
      setTab('alertas')
    } catch (e) {
      notif(`No se pudo enviar el pedido: ${e.message}`, 'Red', 6000)
    }
    setCargando(false)
  }

  // ── VISTA PRINCIPAL MOZO ──────────────────────────────────────────────────────
  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <img src={logo} alt="Logo" className={styles.headerLogo} onError={e => e.target.style.display='none'} />
          <div>
            <span className={styles.headerNombre}>{ficha?.nombre || 'Mozo'}</span>
            <span className={styles.headerRol}>Mozo · {nombreBar}</span>
          </div>
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          {totalAlertas > 0 && <span className={styles.alertBadge}>{totalAlertas}</span>}
          <span
            className={`${styles.audioBtn} ${audioOn ? styles.audioBtnOn : ''}`}
            title={audioOn ? 'Los avisos suenan' : 'Tocá la pantalla para habilitar el sonido'}
          >
            {audioOn ? '🔔' : '🔕'}
          </span>
          <button className={styles.cambiarBtn} onClick={() => cerrarSesion()}>Salir</button>
        </div>
      </header>

      {/* Tabs */}
      <nav className={styles.tabs}>
        {[
          { key: 'alertas',  label: '🔔 Alertas',   badge: totalAlertas },
          { key: 'mesas',    label: '🏠 Mis mesas',  badge: 0 },
          ...(soporte ? [] : [{ key: 'pedido', label: '📋 Tomar pedido', badge: 0 }]),
        ].map(t => (
          <button key={t.key} className={`${styles.tab} ${tab===t.key?styles.tabActivo:''}`} onClick={() => setTab(t.key)}>
            {t.label}
            {t.badge > 0 && <span className={styles.tabBadge}>{t.badge}</span>}
          </button>
        ))}
      </nav>

      {soporte && (
        <div className="card" style={{
          margin:'12px 16px 0', borderLeft:'3px solid var(--gold)',
          display:'flex', gap:10, alignItems:'center', flexWrap:'wrap',
        }}>
          <span style={{fontSize:'1.2em'}}>🛠️</span>
          <span style={{fontSize:'0.85em', color:'var(--text2)'}}>
            <strong style={{color:'var(--gold)'}}>Modo soporte.</strong>{' '}
            Solo lectura: las reglas no dejan operar el local desde la plataforma.
          </span>
        </div>
      )}

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
                        {personasDe(l.mesaId)}
                        <span style={{fontSize:'0.82em', color:'var(--text2)'}}>{l.cliente}</span>
                      </div>
                      <p style={{fontSize:'0.9em', margin:'8px 0'}}>{l.nota}</p>
                      {!soporte && <button className={styles.resolverBtn} onClick={() => resolverLlamada(l.mesaId, l.id)}>✓ Resolver</button>}
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
                        {personasDe(p.mesaId)}
                        {!soporte && (
                          <button className={styles.entregarBtn} onClick={() => marcarEntregado(p.mesaId, p.id)}>
                            Marcar entregado ✓
                          </button>
                        )}
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
                        {personasDe(p.mesaId)}
                      </div>
                      {p.items
                        
                        .filter(i => i.destino==='mozo').map((item) => (
                        <div key={item.rid} className={styles.itemRow}>
                          <div className={styles.itemLeft}>
                            <span className={styles.cantidad}>{item.cantidad}×</span>
                            <span>{item.nombre}</span>
                          </div>
                          {soporte ? (
                            <span style={{color:'var(--text3)', fontSize:'0.75em'}}>{item.estado}</span>
                          ) : (
                            <div className={styles.itemBtns}>
                              <button className={`${styles.btn} ${item.estado==='en_preparacion'?styles.btnYellow:''}`}
                                onClick={() => cambiarEstadoItem(p.mesaId, p.id, item.rid, 'en_preparacion')}>🔥</button>
                              <button className={`${styles.btn} ${item.estado==='listo'?styles.btnGreen:''}`}
                                onClick={() => cambiarEstadoItem(p.mesaId, p.id, item.rid, 'listo')}>✅</button>
                            </div>
                          )}
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
                        {personasDe(mesa.mesa_numero)}
                        <span className={styles.metodoPago}>
                          {mesa.metodo_pago==='tarjeta'?'💳 Llevar posnet':mesa.metodo_pago==='efectivo'?'💵 Llevar ticket':'📲 Transferencia'}
                        </span>
                      </div>
                      <div className={styles.cuentaInfo}>
                        <span>Total: <strong>${((mesa.total_acumulado||0)+(mesa.propina||0)).toLocaleString()}</strong></span>
                        {mesa.propina>0 && <span style={{color:'var(--green)',fontSize:'0.82em'}}>Propina: ${mesa.propina.toLocaleString()}</span>}
                      </div>
                      {!soporte && (
                        <button className={styles.cobradoBtn} onClick={() => marcarMesaCobrada(mesa.mesa_numero)}>
                          ✅ Mesa cobrada — esperando confirmación
                        </button>
                      )}
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

          {misMesas.every(n => !mesas[n] || mesas[n].estado === 'libre') && (
            <p style={{color:'var(--text3)',fontSize:'0.85em',padding:'12px 0'}}>
              Ninguna de tus mesas esta ocupada. Cargá un pedido desde
              "Tomar pedido" y la mesa se abre sola.
            </p>
          )}

          {misMesas.map(num => {
            const mesa = mesas[num]
            const libre = !mesa || mesa.estado === 'libre'
            const pedidosMesa = pedidosPorMesa[num] || []
            const total = Number(mesa?.total_acumulado || 0)
            const pideCuenta = mesa?.estado === 'esperando_cuenta' || mesa?.estado === 'cuenta_cobrada'

            // Una mesa que abrio el mozo no tiene comensales cargados: sin
            // esto quedaba como "Ocupada" a secas y no se sabia de quien es.
            const quien = mesa?.clientes?.length > 0 ? mesa.clientes.join(', ') : null

            return (
              <div key={num} className={`${styles.mesaDetalle} ${libre ? styles.mesaLibre : ''}`}>
                <div className={styles.mesaDetalleHeader}>
                  <span className={styles.mesaTag}>Mesa {num}</span>
                  {personasDe(num)}
                  <span style={{fontSize:'0.82em',color:'var(--text2)'}}>
                    {libre ? '⬜ Libre' : (ESTADO_PARA_EL_MOZO[mesa.estado] || 'Ocupada')}
                  </span>
                </div>

                {!libre && (
                  <>
                    {quien && <p className={styles.mesaQuien}>{quien}</p>}
                    {!quien && mesa?.abierta_por?.nombre && (
                      <p className={styles.mesaAbiertaPor}>
                        🧍 Cargada por {mesa.abierta_por.uid === ficha?.uid ? 'vos' : mesa.abierta_por.nombre}
                      </p>
                    )}

                    {pedidosMesa.length > 0 ? pedidosMesa.map((p, pi) => (
                      <div key={p.id}
                        className={`${styles.pedidoResumen} ${p.estado === 'entregado' ? styles.itemEntregado : ''}`}>
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

                    <div className={styles.mesaPie}>
                      <span className={styles.mesaTotal}>${total.toLocaleString()}</span>
                      {pideCuenta ? (
                        <span className={styles.esperandoCuenta}>
                          💳 {METODO_LABEL[mesa.metodo_pago] || 'Pidió la cuenta'} · la cierra el encargado
                        </span>
                      ) : !soporte && total > 0 ? (
                        <button className={styles.cobrarBtn} onClick={() => setMesaACobrar(num)}>
                          💵 Cobrar
                        </button>
                      ) : null}
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Cobro: el mozo elige el metodo, el encargado cierra la caja. */}
      {mesaACobrar && (
        // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
        <div className={styles.modalFondo}
          onClick={e => { if (e.target === e.currentTarget) setMesaACobrar(null) }}>
          <div className={styles.modalCaja} role="dialog" aria-modal="true"
            aria-labelledby="mozo-titulo-cobro">
            <p className={styles.modalTitulo} id="mozo-titulo-cobro">
              💵 Cobrar Mesa {mesaACobrar}
            </p>
            <p className={styles.modalSub}>
              ${Number(mesas[mesaACobrar]?.total_acumulado || 0).toLocaleString()} · ¿Cómo paga?
            </p>
            <div className={styles.metodos}>
              {Object.entries(METODO_LABEL).map(([clave, label]) => (
                <button key={clave} className={styles.metodoBtn} disabled={cobrando}
                  onClick={() => cobrarMesa(mesaACobrar, clave)}>
                  {label}
                </button>
              ))}
            </div>
            <button className="btn btn-ghost" style={{width:'100%'}}
              onClick={() => setMesaACobrar(null)} disabled={cobrando}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* ── TAB TOMAR PEDIDO ───────────────────────────────────────────────── */}
      {tab === 'pedido' && (
        <div className={styles.content}>
          <h2 className={styles.seccion}>Tomar pedido</h2>

          {/* Seleccionar mesa */}
          <div className={styles.mesaSelector}>
            <span id="mozo-elegir-mesa" className={styles.inputLabel}
              style={{display:'block'}}>Mesa</span>
            <div className={styles.mesasBtns} role="group" aria-labelledby="mozo-elegir-mesa">
              {misMesas.map(num => (
                <button key={num} aria-label={`Mesa ${num}`} aria-pressed={mesaPedido===num}
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
                {categoriasVisibles.map(key => {
                  const val = etiquetaDeCategoria(key === 'otros' ? null : key)
                  return (
                    <button key={key}
                      className={`${styles.catBtn} ${categoriaActiva===key?styles.catActivo:''}`}
                      onClick={() => setCategoriaActiva(key)}>
                      {val.emoji} {val.label}
                    </button>
                  )
                })}
              </div>

              {/* Items */}
              <div className={styles.itemsCarta}>
                {carta.filter(i => esDeCategoria(i, categoriaActiva) && i.disponible).map(item => {
                  const cant = carritoMozo.find(i => i.id===item.id)?.cantidad || 0
                  return (
                    <div key={item.id} className={styles.itemCartaCard}>
                      <div className={styles.itemCartaInfo}>
                        <span className={styles.itemNombre}>{item.nombre}</span>
                        <span className={styles.itemPrecio}>${item.precio.toLocaleString()}</span>
                        {cant > 0 && (
                          <input className={styles.notaInput}
                            id={`nota-mozo-${item.id}`} name={`nota-mozo-${item.id}`}
                            aria-label={`Nota para ${item.nombre}`}
                            placeholder="Nota (ej: sin tomate)..."
                            value={carritoMozo.find(i=>i.id===item.id)?.nota||''}
                            onChange={e => actualizarNotaMozo(item.id, e.target.value)} />
                        )}
                      </div>
                      <div className={styles.itemControles}>
                        {cant > 0 ? (
                          <>
                            <button className={styles.contBtn} aria-label={`Quitar uno de ${item.nombre}`}
                              onClick={() => quitarDelCarritoMozo(item.id)}>−</button>
                            <span className={styles.contNum}>{cant}</span>
                            <button className={styles.contBtn} aria-label={`Agregar otro ${item.nombre}`}
                              onClick={() => agregarAlCarritoMozo(item)}>+</button>
                          </>
                        ) : (
                          <button className={styles.addBtn} aria-label={`Agregar ${item.nombre}`}
                            onClick={() => agregarAlCarritoMozo(item)}>+</button>
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
