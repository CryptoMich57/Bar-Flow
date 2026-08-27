// ============================================================
//  ESTADÍSTICAS DEL DÍA
//
//  Vivía dentro de EncargadoPage.jsx, que llegó a 1071 líneas con seis
//  pestañas adentro (AUD-013). Un archivo así no se lee: se busca. Cada
//  pestaña es autónoma —recibe lo que muestra y avisa lo que hay que
//  hacer— así que separarlas no cambia nada del comportamiento.
// ============================================================
import styles from '../../pages/EncargadoPage.module.css'

export default function PestanaEstadisticas({ estadisticas, onActualizar }) {
  return (
    <div className={styles.statsContainer}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
        <h2 className={styles.sectionTitle} style={{marginBottom:0}}>Estadísticas del día</h2>
        <button className={styles.agregarBtn} onClick={onActualizar}>↻ Actualizar</button>
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
  )
}
