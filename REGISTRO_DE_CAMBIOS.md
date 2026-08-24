# Registro de cambios — BarFlow

Este archivo documenta los cambios realizados a partir de la auditoría compartida. No reemplaza el historial de Git: explica intención, alcance y validación.

## Instrucciones

Por cada intervención, Claude debe agregar una entrada con:

- Fecha y responsable.
- IDs de auditoría atendidos.
- Archivos modificados.
- Resumen de la solución.
- Pruebas ejecutadas y resultado.
- Riesgos, decisiones o trabajo pendiente.

No reescribir entradas anteriores. Agregar la más reciente arriba de las demás y enlazar el ID correspondiente de `AUDITORIA_CLAUDE_CODEX.md`.

## Cambios

### 2026-08-24 — Claude — Regresiones introducidas en la conversión multi-local

- **IDs:** `AUD-004` (Resuelto), `AUD-007` (Resuelto).
- **Archivos:** `firestore.rules`, `src/firebase/locales.js`, `src/pages/MesaPage.jsx`,
  `src/pages/MozoPage.jsx`, `src/pages/EncargadoPage.jsx`.
- **Cambio:** los dos hallazgos son regresiones propias del commit `ac8257a`, no problemas
  heredados. `AUD-004`: se quitó la lectura del índice global de invitaciones —que las reglas
  le niegan al encargado y hacía fallar todo el alta de personal— y la validación de
  duplicados se movió a la regla de escritura, que la resuelve sin conceder lectura.
  `AUD-007`: se agregó `localId` a las dependencias de los nueve efectos que leen Firestore y
  se pasó la sesión del comensal a una clave por local y mesa.
- **Validación:** `npm run build` correcto; reglas compiladas y desplegadas a
  `barflow-hexagroup`; recorrido E2E del comensal con sesión anónima nueva; navegación entre
  locales sin recargar; verificación de la clave `sesion_mesa:{localId}:{mesaId}`.
- **Pendiente / riesgos:** el alta real de un empleado no pudo probarse (requiere sesión de
  Google de encargado; queda para validación manual). Sin emulador no hay pruebas negativas
  automatizadas: depende de `AUD-010`. `AUD-001`, `AUD-002` y `AUD-005` quedan a la espera de
  Cloud Functions —el plan Blaze está siendo gestionado—. `AUD-003` y `AUD-006` son los
  siguientes en la fila y no dependen de Blaze.
- **Precisión sobre afirmaciones previas:** antes de esta auditoría se comunicó que el
  aislamiento entre negocios estaba verificado. Es cierto en la capa de reglas y las pruebas
  lo respaldan, pero no lo era en la interfaz por el problema de `AUD-007`. Las dos capas se
  presentaron como una sola y no debió ser así.

### 2026-08-24 — Codex — Inicio de auditoría

- IDs: documentación inicial de `AUD-001` a `AUD-013`.
- Archivos: `AUDITORIA_CLAUDE_CODEX.md`, `REGISTRO_DE_CAMBIOS.md`.
- Cambio: se crearon el protocolo compartido, el mapa de arquitectura, los hallazgos priorizados y el formato de trazabilidad para las futuras correcciones.
- Validación: revisión estática, prueba local de navegación, `npm run build`, `npm audit --omit=dev` y comprobaciones de solo lectura en Firebase Authentication/Hosting.
- Resultado: build correcto; 13 hallazgos pendientes. No se modificó código funcional ni se desplegó.

<!-- Claude: agregar aquí arriba cada nueva intervención. -->
