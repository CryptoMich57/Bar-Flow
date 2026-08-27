// ============================================================
//  HISTORIAL DE CIERRES
//
//  Ver PestanaEstadisticas.jsx: son las pestañas que vivían dentro de
//  EncargadoPage.jsx (AUD-013).
//
//  El filtro por fecha lo resuelve la consulta, no esta vista: ver
//  src/firebase/historial.js.
// ============================================================
import styles from '../../pages/EncargadoPage.module.css'

export default function PestanaHistorial({
  historial, soporte,
  filtroDesde, setFiltroDesde,
  filtroHasta, setFiltroHasta,
  onFiltrar, onBorrarFiltrado,
}) {
  return (
    <div className={styles.historialContainer}>
      <h2 className={styles.sectionTitle}>Historial</h2>

      {/* Filtros */}
      <div className={styles.filtros}>
        <div className={styles.filtroGrupo}>
          <label className={styles.filtroLabel} htmlFor="enc-desde">Desde</label>
          <input id="enc-desde" className="input" type="date" value={filtroDesde}
            onChange={e => setFiltroDesde(e.target.value)} />
        </div>
        <div className={styles.filtroGrupo}>
          <label className={styles.filtroLabel} htmlFor="enc-hasta">Hasta</label>
          <input id="enc-hasta" className="input" type="date" value={filtroHasta}
            onChange={e => setFiltroHasta(e.target.value)} />
        </div>
        <button className={styles.agregarBtn} onClick={onFiltrar}>Filtrar</button>
        {!soporte && historial.length > 0 && (
          <button className={styles.borrarBtn} onClick={onBorrarFiltrado}>🗑️ Borrar filtrado</button>
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
            <div className={styles.historialRow}>
              <span>Total cobrado</span>
              <span style={{color:'var(--gold)'}}>${h.total_cobrado?.toLocaleString()}</span>
            </div>
            {h.propina > 0 && (
              <div className={styles.historialRow}>
                <span>Propina</span>
                <span style={{color:'var(--green)'}}>+${h.propina?.toLocaleString()}</span>
              </div>
            )}
            <div className={styles.historialRow}><span>Método</span><span>{h.metodo_pago}</span></div>
          </div>
        ))
      }
    </div>
  )
}
