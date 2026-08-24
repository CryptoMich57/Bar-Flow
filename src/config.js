// ============================================================
//  CONFIGURACION DE LA PLATAFORMA
//
//  Ojo: aca NO va nada propio de un bar. El nombre, el logo, los
//  datos de transferencia, los mozos y la cantidad de mesas son de
//  cada negocio y viven en la base, bajo locales/{localId}. Este
//  archivo es solo lo que comparten todos los clientes del SaaS.
// ============================================================

export const APP_CONFIG = {

  // ── LA PLATAFORMA ──────────────────────────────────────────
  plataforma: {
    nombre:    "BarFlow",
    empresa:   "Hexa Group S.a.s",
    sitio:     "hexagroup.com.ar",
    version:   "2.0.0",
    logo:      "/logo.png",          // Logo por defecto si el local no cargo el suyo
  },

  // ── VALORES POR DEFECTO DE UN LOCAL NUEVO ──────────────────
  defaults: {
    mesas: 10,
    colorPrimario: "#c8a96e",
  },

  // ── TEXTOS DE LA APP (iguales para todos los locales) ──────
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

  // ── PWA ────────────────────────────────────────────────────
  pwa: {
    nombre:       "BarFlow",
    nombreCorto:  "BarFlow",
    descripcion:  "Pedidos desde tu mesa",
    colorTema:    "#0a0a0a",
    colorFondo:   "#0a0a0a",
  },

  // ── TEMA VISUAL ────────────────────────────────────────────
  tema: {
    // 'auto' usa el sistema del celular (oscuro de noche, claro de día)
    // Opciones: 'oscuro' | 'claro' | 'auto'
    modo: 'auto',
  }
}

// ── Helpers ───────────────────────────────────────────────────
export const getCopyright   = () => `© ${new Date().getFullYear()} ${APP_CONFIG.plataforma.empresa} — Todos los derechos reservados`
export const getTextos      = () => APP_CONFIG.textos
export const getLogoDefecto = () => APP_CONFIG.plataforma.logo
export const getNombrePlataforma = () => APP_CONFIG.plataforma.nombre
export const MESAS_POR_DEFECTO = APP_CONFIG.defaults.mesas
