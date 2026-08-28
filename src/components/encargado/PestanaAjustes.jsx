// ============================================================
//  AJUSTES DEL LOCAL
//
//  Ver PestanaEstadisticas.jsx: son las pestañas que vivían dentro de
//  EncargadoPage.jsx (AUD-013).
//
//  `soporte` es la plataforma mirando el local de un cliente: ve todo,
//  no opera nada. Por eso los botones de guardar y el alta de equipo
//  desaparecen en vez de fallar al apretarlos.
// ============================================================
import EquipoDelLocal from '../EquipoDelLocal'
import styles from '../../pages/EncargadoPage.module.css'

export default function PestanaAjustes({
  configDB, soporte, localId, local, nombreBar, cantidadMesas,
  configGuardando, configGuardado,
  onGuardar, onCambiar,
}) {
  return (
      <div className={styles.ajustesContainer}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24}}>
          <h2 className={styles.sectionTitle} style={{marginBottom:0}}>⚙️ Ajustes</h2>
          {!soporte && (
            <button
              className={styles.guardarBtn}
              onClick={onGuardar}
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
                  <label htmlFor="enc-titular-de-la-cuenta">Titular de la cuenta</label>
                  <input id="enc-titular-de-la-cuenta" className="input" value={configDB.transferencia?.titular || ''}
                    onChange={e => onCambiar('transferencia.titular', e.target.value)}
                    placeholder="Nombre del titular" />
                </div>
                <div className={styles.ajustesField}>
                  <label htmlFor="enc-banco">Banco</label>
                  <input id="enc-banco" className="input" value={configDB.transferencia?.banco || ''}
                    onChange={e => onCambiar('transferencia.banco', e.target.value)}
                    placeholder="Nombre del banco" />
                </div>
                <div className={styles.ajustesField}>
                  <label htmlFor="enc-cbu">CBU</label>
                  <input id="enc-cbu" className="input" value={configDB.transferencia?.cbu || ''}
                    onChange={e => onCambiar('transferencia.cbu', e.target.value)}
                    placeholder="22 dígitos" />
                </div>
                <div className={styles.ajustesField}>
                  <label htmlFor="enc-alias">Alias</label>
                  <input id="enc-alias" className="input" value={configDB.transferencia?.alias || ''}
                    onChange={e => onCambiar('transferencia.alias', e.target.value)}
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
                  name="cantidad-mesas" aria-label="Cantidad de mesas del salón"
                  value={configDB.mesas?.cantidad || 10}
                  onChange={e => onCambiar('mesas.cantidad', parseInt(e.target.value) || 10)} />
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
  )
}
