import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'node_modules']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      // 'recommended-latest' es la forma flat en eslint-plugin-react-hooks 5.x.
      // La config venia apuntando a configs.flat.recommended, que no existe en
      // esta version: por eso eslint reventaba al arrancar.
      reactHooks.configs['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
      // Un catch vacio es deliberado en varios lugares: si falla el sonido o
      // el parseo de una sesion vieja, no hay nada que hacer ni que avisar.
      'no-empty': ['error', { allowEmptyCatch: true }],
      // Usar una const antes de declararla revienta en runtime por la zona
      // muerta temporal, y ni el build ni los tests de reglas lo ven: el
      // archivo compila igual. Paso una vez con misMesas en el array de
      // dependencias de un useEffect y dejo la vista del mozo en blanco.
      'no-use-before-define': ['error', {
        functions: false,   // las funciones se izan; declararlas abajo es normal
        variables: true,
        classes: true,
      }],
    },
  },
  {
    // Las pruebas de reglas corren en Node, no en el navegador.
    files: ['tests/**/*.js', '*.config.js', 'seed.js'],
    languageOptions: { globals: globals.node },
  },
  {
    // Estos archivos exportan a proposito el provider y su hook juntos: son
    // dos mitades de la misma pieza y separarlos solo agregaria un archivo.
    // El costo es perder fast refresh en ellos, que es aceptable.
    files: ['src/utils/*Context.jsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
])
