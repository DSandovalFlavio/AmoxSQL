// @suite rapida
/**
 * Los estilos en línea no suben (6.0, M8 · D6).
 *
 * El cliente tenía 1 419 `style={{…}}`: tamaños, colores y huecos puestos a mano
 * en cada componente, y por eso dos paneles «iguales» no medían lo mismo. No se
 * persiguen todos de golpe; se quitan al tocar cada componente, y lo nuevo usa
 * las utilidades de `client/src/estilos/25-utilidades.css` (`fila`, `columna`,
 * `hueco-N`, `texto-secundario`, `texto-tenue`) o una clase en el archivo de su
 * tema. Esta suite es el trinquete: si el número sube, falla. Si bajó, dice el
 * número nuevo para que se baje TECHO.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TECHO = 1386;

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(RAIZ, 'client', 'src');
const archivos = [];
(function rec(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) rec(p);
        else if (/\.jsx?$/.test(e.name)) archivos.push(p);
    }
})(SRC);

const porArchivo = archivos.map(f => [path.relative(SRC, f).replace(/\\/g, '/'), (fs.readFileSync(f, 'utf8').match(/style=\{\{/g) || []).length]);
const total = porArchivo.reduce((s, [, n]) => s + n, 0);

let mal = 0;
console.log('— estilos en línea en client/src');
if (total > TECHO) {
    mal++;
    console.log(`  MAL  ${total} (el techo es ${TECHO}): usa una utilidad de estilos/25-utilidades.css o una clase.`);
    console.log('       Los que más tienen:', porArchivo.sort((a, b) => b[1] - a[1]).slice(0, 5).map(([f, n]) => `${f} ${n}`).join(' · '));
} else {
    console.log(`  ok   ${total} (techo ${TECHO})${total < TECHO ? ` — bajó: pon TECHO = ${total} en este archivo` : ''}`);
}

const css = fs.readFileSync(path.join(SRC, 'estilos', '25-utilidades.css'), 'utf8');
const faltan = ['fila', 'columna', 'hueco-2', 'texto-secundario', 'texto-tenue'].filter(c => !new RegExp(`\\.${c}\\s*\\{`).test(css));
if (faltan.length) { mal++; console.log('  MAL  faltan utilidades:', faltan.join(' ')); }
else console.log('  ok   las utilidades existen');
const indice = fs.readFileSync(path.join(SRC, 'index.css'), 'utf8');
const imports = [...indice.matchAll(/@import\s+'([^']+)'/g)].map(m => m[1]);
if (!imports.length || !imports[imports.length - 1].endsWith('25-utilidades.css')) { mal++; console.log('  MAL  25-utilidades.css tiene que ser el último @import de index.css'); }
else console.log('  ok   las utilidades van al final de la cascada');

console.log(`\n${3 - mal} bien, ${mal} mal`);
process.exit(mal ? 1 : 0);
