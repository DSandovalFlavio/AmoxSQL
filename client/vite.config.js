import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync, existsSync, mkdirSync, cpSync, rmSync } from 'fs'
import { resolve } from 'path'

const pkg = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf8'))

/**
 * Trae el editor de código **dentro de la aplicación**.
 *
 * Venía de un CDN. `@monaco-editor/loader` apunta por omisión a
 * `cdn.jsdelivr.net`, nadie se lo cambiaba, y `monaco-editor` no era dependencia
 * nuestra: o sea que **el editor no viajaba en el instalable y se descargaba al
 * abrir por primera vez**.
 *
 * En una página web eso es lo razonable —no metes megas en un sitio si un CDN te
 * los sirve—, pero esto es una aplicación de escritorio para análisis **local**:
 * no hay ancho de banda que ahorrar, y a cambio se introducía una dependencia de
 * red justo donde la promesa del producto es la contraria. En un portátil con el
 * CDN bloqueado, en un avión o en una máquina aislada, la primera vez no había
 * editor — y sin editor no hay SQL, ni markdown, ni el crudo del deck.
 *
 * ## Lo que se copia, y lo que no
 *
 * De los 16 MB del paquete se dejan fuera unos 10 que esta aplicación **no usa
 * nunca**:
 *
 * - `ts.worker` (6,7 MB) es el servicio de lenguaje de TypeScript: autocompletado
 *   y comprobación de tipos. Aquí un `.ts` se abre para **leerlo**, y el coloreado
 *   no lo da el worker sino la definición del lenguaje, que sí se copia.
 * - Los workers de CSS y HTML, por lo mismo.
 * - Trece de las catorce traducciones de la interfaz del editor.
 *
 * El de JSON se queda: valida mientras escribes, y un `.json` de configuración
 * es justo lo que la gente abre aquí.
 *
 * **Si esta lista se queda corta, el síntoma es raro y conviene reconocerlo:** el
 * esquema `amoxsql://` devuelve `index.html` para lo que no encuentra, así que un
 * archivo que falte no da 404, da HTML donde se esperaba JavaScript.
 */
const SOBRAN = [
  /^assets[/\\]ts\.worker/,
  /^assets[/\\]css\.worker/,
  /^assets[/\\]html\.worker/,
  // nls.messages.js (sin idioma) es el inglés y se queda; el resto, fuera.
  /^nls\.messages\.[a-z-]+\.js\.js$/,
]

function editorEnCasa() {
  const origen = resolve(__dirname, 'node_modules/monaco-editor/min/vs')
  const destino = resolve(__dirname, 'public/vs')

  return {
    name: 'amox-editor-en-casa',
    buildStart() {
      if (!existsSync(origen)) {
        // Sin el paquete no se puede copiar. Se avisa fuerte en vez de dejar una
        // aplicación que compila y no tiene editor.
        this.warn('No encuentro monaco-editor en node_modules: el editor no se va a empaquetar.')
        return
      }
      rmSync(destino, { recursive: true, force: true })
      mkdirSync(destino, { recursive: true })
      cpSync(origen, destino, {
        recursive: true,
        filter: (src) => {
          const rel = src.slice(origen.length + 1)
          return !rel || !SOBRAN.some((re) => re.test(rel))
        },
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), editorEnCasa()],
  base: '/',
  server: {
    port: 5173,
    strictPort: true,
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    // El editor se sirve como archivos sueltos desde `public/vs`, no como un
    // módulo que Vite empaquete: si entra en el pre-empaquetado, acaba DOS veces
    // en la aplicación.
    exclude: ['web-tree-sitter', 'monaco-editor'],
  },
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 1000
  }
})
