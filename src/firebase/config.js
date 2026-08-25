// ============================================================
//  CONEXION A FIREBASE
//  Los datos del proyecto salen de variables de entorno (.env) para
//  poder cambiar de proyecto sin tocar el codigo. Copiar .env.example
//  a .env y completar con los datos de la consola de Firebase.
// ============================================================
import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getAuth } from 'firebase/auth'

export const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
}

const faltantes = Object.entries(firebaseConfig)
  .filter(([, valor]) => !valor)
  .map(([clave]) => clave)

if (faltantes.length > 0) {
  throw new Error(
    'Falta configurar Firebase. Variables sin valor: ' + faltantes.join(', ') +
    '. Copia .env.example a .env y completa los datos del proyecto.'
  )
}

const app = initializeApp(firebaseConfig)

export const db = getFirestore(app)
export const auth = getAuth(app)

// ── Emuladores ────────────────────────────────────────────────
// Con VITE_USAR_EMULADORES=1 la app habla con los emuladores locales en
// vez del proyecto real. Sirve para probar el circuito completo —incluidas
// las Cloud Functions— sin desplegar nada y sin tocar datos de clientes.
//
// El guardia importa: si esto se colara en un build de produccion, la app
// publicada intentaria conectarse a localhost y no funcionaria para nadie.
// Por eso se exige ademas que sea un build de desarrollo.
if (import.meta.env.DEV && import.meta.env.VITE_USAR_EMULADORES === '1') {
  const { connectFirestoreEmulator } = await import('firebase/firestore')
  const { connectAuthEmulator } = await import('firebase/auth')
  const { getFunctions, connectFunctionsEmulator } = await import('firebase/functions')

  connectFirestoreEmulator(db, '127.0.0.1', 8080)
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectFunctionsEmulator(getFunctions(app, 'southamerica-east1'), '127.0.0.1', 5001)

  console.info('BarFlow: usando emuladores locales, no el proyecto real.')
}

export default app
