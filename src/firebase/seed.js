// Script para cargar la carta de ejemplo en Firestore
// Ejecutar UNA SOLA VEZ desde la consola del navegador o con un script de Node
// O cargarlo manualmente en Firebase Console

// Para usarlo: importalo en un componente temporal y llamá seedCarta()

import { db } from './config'
import { doc, setDoc } from 'firebase/firestore'

const cartaEjemplo = [
  // COMIDAS → van a Cocina
  { nombre: 'Tostado de jamón y queso', descripcion: 'Pan de miga, jamón cocido, queso tybo', precio: 1800, categoria: 'comida', destino: 'cocina', disponible: true, imagen_url: null },
  { nombre: 'Medialunas x3', descripcion: 'Medialunas de manteca, recién horneadas', precio: 1200, categoria: 'comida', destino: 'cocina', disponible: true, imagen_url: null },
  { nombre: 'Sandwich de milanesa', descripcion: 'Milanesa de ternera, lechuga, tomate, mayonesa', precio: 2800, categoria: 'comida', destino: 'cocina', disponible: true, imagen_url: null },
  { nombre: 'Croissant de jamón y queso', descripcion: 'Croissant artesanal, relleno caliente', precio: 2200, categoria: 'comida', destino: 'cocina', disponible: true, imagen_url: null },

  // BEBIDAS PREPARADAS → van al Encargado / Barista
  { nombre: 'Café espresso', descripcion: 'Doble shot, intenso y cremoso', precio: 900, categoria: 'bebida_preparada', destino: 'encargado', disponible: true, imagen_url: null },
  { nombre: 'Café con leche', descripcion: 'Espresso con leche vaporizada', precio: 1100, categoria: 'bebida_preparada', destino: 'encargado', disponible: true, imagen_url: null },
  { nombre: 'Cappuccino', descripcion: 'Espresso, leche y espuma', precio: 1300, categoria: 'bebida_preparada', destino: 'encargado', disponible: true, imagen_url: null },
  { nombre: 'Té con leche', descripcion: 'Té en hebras, leche fría aparte', precio: 1000, categoria: 'bebida_preparada', destino: 'encargado', disponible: true, imagen_url: null },
  { nombre: 'Submarino', descripcion: 'Leche caliente con chocolate', precio: 1400, categoria: 'bebida_preparada', destino: 'encargado', disponible: true, imagen_url: null },

  // BEBIDAS SIMPLES → van al Mozo
  { nombre: 'Agua mineral 500ml', descripcion: 'Con o sin gas', precio: 700, categoria: 'bebida_simple', destino: 'mozo', disponible: true, imagen_url: null },
  { nombre: 'Coca-Cola 500ml', descripcion: 'Fría, con hielo', precio: 1200, categoria: 'bebida_simple', destino: 'mozo', disponible: true, imagen_url: null },
  { nombre: 'Jugo de naranja natural', descripcion: 'Exprimido al momento', precio: 1600, categoria: 'bebida_simple', destino: 'mozo', disponible: true, imagen_url: null },

  // POSTRES
  { nombre: 'Cheesecake de frutos rojos', descripcion: 'Porción individual, salsa de frambuesa', precio: 2000, categoria: 'postre', destino: 'cocina', disponible: true, imagen_url: null },
  { nombre: 'Brownie con helado', descripcion: 'Brownie tibio, 1 bocha de vainilla', precio: 1800, categoria: 'postre', destino: 'cocina', disponible: true, imagen_url: null },
]

export const seedCarta = async () => {
  console.log('Cargando carta en Firestore...')
  for (const item of cartaEjemplo) {
    const id = item.nombre.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
    await setDoc(doc(db, 'carta', id), item)
    console.log(`✅ ${item.nombre}`)
  }
  console.log('¡Carta cargada!')
}
