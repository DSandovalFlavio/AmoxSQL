// @suite rapida
/**
 * Ningún texto de la interfaz por debajo de 11 px (6.0, M9 · D5).
 *
 * Había 281 tamaños de 8–10,5 px: cabeceras de sección, contadores, insignias,
 * atajos. Con el texto terciario encima, ilegibles en un portátil. El piso es
 * 11 px en todo el CSS del cliente y en los `fontSize` de los componentes; sólo
 * se libran las miniaturas que dibujan una ventana en pequeño (la vista previa
 * de un tema y la del reparto del editor en Settings), que no son texto para leer,
 * y la pantalla de bienvenida, que no se toca.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MIN = 11;
// La bienvenida (`.ws-*`) no se toca: es la única pantalla que el autor dejó
// fuera de toda revisión (salvo «Needs attention»).
const EXENTOS = [/^\.stg-theme-preview/, /^\.stg-layout-preview/, /^\.ws-/];

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(RAIZ, 'client', 'src');
const archivos = [];
(function rec(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) rec(p);
        else if (/\.(css|jsx)$/.test(e.name)) archivos.push(p);
    }
})(SRC);

const malos = [];
for (const f of archivos) {
    const rel = path.relative(SRC, f).replace(/\\/g, '/');
    const t = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '));
    const linea = (i) => t.slice(0, i).split('\n').length;
    if (f.endsWith('.css')) {
        // el selector de la regla: el texto antes de la última «{» abierta
        for (const m of t.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)) {
            if (+m[1] >= MIN) continue;
            const antes = t.slice(0, m.index);
            const abre = antes.lastIndexOf('{');
            const selector = antes.slice(Math.max(antes.lastIndexOf('}', abre), antes.lastIndexOf(';', abre)) + 1, abre).trim();
            if (selector.split(',').every(s => EXENTOS.some(re => re.test(s.trim())))) continue;
            malos.push(`${rel}:${linea(m.index)}  ${selector.replace(/\s+/g, ' ').slice(0, 60)} → ${m[1]}px`);
        }
    } else {
        for (const m of t.matchAll(/fontSize:\s*'?(\d+(?:\.\d+)?)(?:px)?'?(?=\s*[,}\s])/g)) {
            if (+m[1] < MIN) malos.push(`${rel}:${linea(m.index)}  fontSize ${m[1]}`);
        }
    }
}

console.log('— tamaño de letra');
if (malos.length) {
    console.log(`  MAL  ${malos.length} texto(s) por debajo de ${MIN} px:`);
    for (const m of malos.slice(0, 20)) console.log('       ' + m);
} else {
    console.log(`  ok   ningún texto por debajo de ${MIN} px (salvo las miniaturas de Settings)`);
}
console.log(`\n${malos.length ? 0 : 1} bien, ${malos.length ? 1 : 0} mal`);
process.exit(malos.length ? 1 : 0);
