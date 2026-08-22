// ============================================================
//  CONFIGURACIÓN MAESTRA — Solo el programador toca este archivo
//  Cambiando aquí se actualiza TODO en la app automáticamente
// ============================================================

export const APP_CONFIG = {

  // ── IDENTIDAD DEL BAR ──────────────────────────────────────
  bar: {
    nombre:       "Qallary Coffe",               // Nombre que aparece en todas las vistas
    slogan:       "Una experiencia única", // Subtítulo en la pantalla de bienvenida
    logo:         "/logo.png",            // Ruta al logo (poné el archivo en /public/logo.png)
    logoAlt:      "Logo del bar",
    copyright:    "Hexa Group S.a.s",    // Aparece en el footer de todas las vistas
    colorPrimario: "#c8a96e",            // Color dorado — cambiá esto y cambia todo
  },

  // ── MESAS ──────────────────────────────────────────────────
  mesas: {
    cantidad: 17,   // Cuántas mesas tiene el local
    // Los QR van a apuntar a /mesa/1, /mesa/2, ... /mesa/N
  },

  // ── CONTRASEÑAS ────────────────────────────────────────────
  accesos: {
    cocina:     "cocina123",    // Contraseña para entrar a la vista de cocina
    // Los mozos se logean con nombre desde su vista
  },

  // ── DATOS DE TRANSFERENCIA ─────────────────────────────────
  transferencia: {
    titular:  "Nombre del Titular",
    banco:    "Nombre del Banco",
    cbu:      "0000000000000000000000",
    alias:    "MI.ALIAS.BAR",
  },

  // ── MOZOS ──────────────────────────────────────────────────
  mozos: [
    { id: "mozo_1", nombre: "Mozo Marcos" },
    { id: "mozo_2", nombre: "Moza Eli" },
    { id: "mozo_3", nombre: "Moza Fer" },
  ],

  // ── TEXTOS DE LA APP (modificables sin tocar código) ───────
  textos: {
    bienvenida: {
      titulo:    "Bienvenido",
      subtitulo: "Escaneaste el código de tu mesa",
      descripcion: "Elegí lo que querés, seguí tu pedido en tiempo real y pedí la cuenta — todo desde acá. Tu tiempo es lo más valioso.",
      boton:     "Comenzar experiencia →",
    },
    nombre: {
      titulo:    "¿Cómo te llamás?",
      subtitulo: "Para identificarte en tu mesa",
      boton:     "Entrar a la mesa",
    },
    despedida: {
      titulo:    "¡Gracias por elegirnos!",
      mensaje:   "Fue un placer atenderte. Te esperamos pronto.",
      emoji:     "🙏",
    },
    cuenta_cobrada: {
      titulo:    "¡Cuenta cobrada!",
      mensaje:   "Gracias por tu visita. Que lo hayas disfrutado.",
    }
  },

  // ── PWA (nombre de la app instalada en el celular) ─────────
  pwa: {
    nombre:       "Mi Bar App",      // Nombre que aparece al instalar en el celular
    nombreCorto:  "Bar",             // Nombre corto del ícono
    descripcion:  "Pedidos desde tu mesa",
    colorTema:    "#0a0a0a",
    colorFondo:   "#0a0a0a",
  },

  // ── TEMA VISUAL ────────────────────────────────────────────
  tema: {
    // Modo automático: 'auto' usa el sistema del celular (oscuro de noche, claro de día)
    // Opciones: 'oscuro' | 'claro' | 'auto'
    modo: 'auto',
  }
}

// ── Helpers ───────────────────────────────────────────────────
export const getNombreBar   = () => APP_CONFIG.bar.nombre
export const getSloganBar   = () => APP_CONFIG.bar.slogan
export const getCopyright   = () => `© ${new Date().getFullYear()} ${APP_CONFIG.bar.copyright} — Todos los derechos reservados`
export const getMozos       = () => APP_CONFIG.mozos
export const getTransferencia = () => APP_CONFIG.transferencia
export const getCantidadMesas = () => APP_CONFIG.mesas.cantidad
export const getCocinaClave = () => APP_CONFIG.accesos.cocina
export const getTextos      = () => APP_CONFIG.textos
export const getLogo        = () => APP_CONFIG.bar.logo
