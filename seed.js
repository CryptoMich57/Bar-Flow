// Script para cargar la carta y las mesas de ejemplo en UN local.
//
// Ahora que BarFlow es multi-local, hay que decir en cual cargar:
//   node --env-file=.env seed.js mi-bar
//
// El local tiene que existir (se crea desde /registro) y la cuenta que
// corre el script tiene que ser encargado de ese local, porque las
// reglas de Firestore validan permisos por local.

import { initializeApp } from 'firebase/app'
import { getFirestore, doc, setDoc } from 'firebase/firestore'

// Los datos salen del .env, igual que la app, para no apuntar sin querer
// al proyecto equivocado. Ejecutar con: node --env-file=.env seed.js
const firebaseConfig = {
  apiKey:            process.env.VITE_FIREBASE_API_KEY,
  authDomain:        process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.VITE_FIREBASE_APP_ID,
}

if (!firebaseConfig.projectId) {
  console.error('Falta el .env. Ejecutar con: node --env-file=.env seed.js <localId>')
  process.exit(1)
}

const localId = process.argv[2]
if (!localId) {
  console.error('Falta el local. Ejecutar con: node --env-file=.env seed.js <localId>')
  console.error('Ejemplo: node --env-file=.env seed.js bar-la-esquina')
  process.exit(1)
}

console.log('Proyecto:', firebaseConfig.projectId)
console.log('Local:   ', localId)

const app = initializeApp(firebaseConfig)
const db = getFirestore(app)

// ── CARTA ─────────────────────────────────────────────────────────────────────
const carta = [
  { id: 'cafe_espresso',       nombre: 'Café espresso',            descripcion: 'Doble shot, intenso y cremoso',                  precio: 900,  categoria: 'bebida_preparada', destino: 'encargado', disponible: true },
  { id: 'cafe_con_leche',      nombre: 'Café con leche',           descripcion: 'Espresso con leche vaporizada',                  precio: 1100, categoria: 'bebida_preparada', destino: 'encargado', disponible: true },
  { id: 'cappuccino',          nombre: 'Cappuccino',               descripcion: 'Espresso, leche y espuma',                       precio: 1300, categoria: 'bebida_preparada', destino: 'encargado', disponible: true },
  { id: 'te_con_leche',        nombre: 'Té con leche',             descripcion: 'Té en hebras, leche fría aparte',                precio: 1000, categoria: 'bebida_preparada', destino: 'encargado', disponible: true },
  { id: 'submarino',           nombre: 'Submarino',                descripcion: 'Leche caliente con chocolate',                   precio: 1400, categoria: 'bebida_preparada', destino: 'encargado', disponible: true },
  { id: 'tostado_jamon_queso', nombre: 'Tostado de jamón y queso', descripcion: 'Pan de miga, jamón cocido, queso tybo',          precio: 1800, categoria: 'comida',          destino: 'cocina',    disponible: true },
  { id: 'medialunas',          nombre: 'Medialunas x3',            descripcion: 'Medialunas de manteca, recién horneadas',        precio: 1200, categoria: 'comida',          destino: 'cocina',    disponible: true },
  { id: 'sandwich_milanesa',   nombre: 'Sandwich de milanesa',     descripcion: 'Milanesa de ternera, lechuga, tomate, mayonesa', precio: 2800, categoria: 'comida',          destino: 'cocina',    disponible: true },
  { id: 'croissant',           nombre: 'Croissant jamón y queso',  descripcion: 'Croissant artesanal, relleno caliente',          precio: 2200, categoria: 'comida',          destino: 'cocina',    disponible: true },
  { id: 'agua_mineral',        nombre: 'Agua mineral 500ml',       descripcion: 'Con o sin gas',                                  precio: 700,  categoria: 'bebida_simple',   destino: 'mozo',     disponible: true },
  { id: 'coca_cola',           nombre: 'Coca-Cola 500ml',          descripcion: 'Fría, con hielo',                                precio: 1200, categoria: 'bebida_simple',   destino: 'mozo',     disponible: true },
  { id: 'jugo_naranja',        nombre: 'Jugo de naranja natural',  descripcion: 'Exprimido al momento',                          precio: 1600, categoria: 'bebida_simple',   destino: 'mozo',     disponible: true },
  { id: 'cheesecake',          nombre: 'Cheesecake frutos rojos',  descripcion: 'Porción individual, salsa de frambuesa',         precio: 2000, categoria: 'postre',          destino: 'cocina',    disponible: true },
  { id: 'brownie_helado',      nombre: 'Brownie con helado',       descripcion: 'Brownie tibio, 1 bocha de vainilla',             precio: 1800, categoria: 'postre',          destino: 'cocina',    disponible: true },
]

// ── MESAS ─────────────────────────────────────────────────────────────────────
const mesas = ['1','2','3','4','5','6','7','8','9','10']

// ── CARGAR ────────────────────────────────────────────────────────────────────
async function seed() {
  console.log('🔥 Cargando carta...')
  for (const item of carta) {
    const { id, ...data } = item
    await setDoc(doc(db, 'locales', localId, 'carta', id), data)
    console.log(`  ✅ ${item.nombre}`)
  }

  console.log('\n🔥 Cargando mesas...')
  for (const num of mesas) {
    await setDoc(doc(db, 'locales', localId, 'mesas', `mesa_${num}`), {
      estado: 'libre',
      mesa_numero: num,
      clientes: [],
      dispositivos: [],
      carrito: [],
      carrito_bloqueado: false,
      total_acumulado: 0,
      propina: 0,
      metodo_pago: null,
      hora_apertura: null,
    })
    console.log(`  ✅ Mesa ${num}`)
  }

  console.log('\n✨ ¡Todo cargado! Ya podés usar la app.')
  process.exit(0)
}

seed().catch(err => {
  console.error('❌ Error:', err)
  process.exit(1)
})