// ============================================================
//  CONEXION A FIREBASE
//  Los datos del proyecto salen de variables de entorno (.env) para
//  poder cambiar de proyecto sin tocar el codigo. Copiar .env.example
//  a .env y completar con los datos de la consola de Firebase.
// ============================================================
import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getAuth } from 'firebase/auth'

const firebaseConfig = {
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
export default app
