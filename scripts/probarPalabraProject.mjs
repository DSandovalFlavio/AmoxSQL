/**
 * La palabra «Project» (B7), fase 5 del plan de la 5.9.
 *
 *     node scripts/probarPalabraProject.mjs
 *
 * Hasta la 5.8 la interfaz llamaba «workspace» a la carpeta de un proyecto.
 * Desde la 5.9 «workspace» es lo que agrupa proyectos (B1), así que una
 * carpeta se llama «project» en todo lo que se ve. Esta prueba falla si vuelve
 * a aparecer en la interfaz un texto con «workspace» que no esté en la lista de
 * usos permitidos.
 *
 * Lo que mira: los literales de texto y el texto de JSX de `client/src`. Lo que
 * no: comentarios, y los literales que son un identificador sin espacios
 * (eventos como `amox_open_workspace_wizard`, ids de menú como 'workspace',
 * rutas de la API como `/api/gallery/copy-to-workspace`). Los nombres internos
 * se quedan como están a propósito (Dec-6): renombrarlos no le da nada al
 * usuario y sí riesgo al código.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLIENTE = path.join(RAIZ, 'client', 'src');

// Usos permitidos: el concepto nuevo. Cada entrada, archivo y un texto que el
// literal tiene que contener. Se añaden aquí al construir B1/B8.
const PERMITIDOS = [
    // El aviso de la actualización (5.4): habla de la palabra vieja a propósito.
    ['components/workspaces/EleccionEtiqueta.jsx', 'Your workspaces are now called'],
];

function archivos(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) return archivos(p);
        return /\.(jsx?|tsx?)$/.test(e.name) ? [p] : [];
    });
}

/** Quita comentarios conservando las líneas, para que los números cuadren. */
function sinComentarios(texto) {
    return texto
        .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
        .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, m => m.replace(/[^\n]/g, ' '))
        .replace(/(^|[^:'"`\\])\/\/[^\n]*/g, (m, a) => a + ' '.repeat(m.length - a.length));
}

const hallazgos = [];
for (const archivo of archivos(CLIENTE)) {
    const rel = path.relative(CLIENTE, archivo).replace(/\\/g, '/');
    const texto = sinComentarios(fs.readFileSync(archivo, 'utf8'));
    const lineaDe = (i) => texto.slice(0, i).split('\n').length;
    const candidatos = [];
    // Literales: '…', "…", `…` en una línea.
    for (const m of texto.matchAll(/'([^'\n]*)'|"([^"\n]*)"|`([^`]*)`/g)) {
        // Lo interpolado (${…}) es código, no texto: fuera antes de mirar.
        candidatos.push({ valor: (m[1] ?? m[2] ?? m[3] ?? '').replace(/\$\{[^}]*\}/g, ''), i: m.index });
    }
    // Texto de JSX: lo que va entre > y <, sin llaves.
    for (const m of texto.matchAll(/>([^<>{}]+)</g)) candidatos.push({ valor: m[1], i: m.index });

    for (const { valor, i } of candidatos) {
        if (!/workspace/i.test(valor)) continue;
        if (/^[\w./:,-]*$/.test(valor.trim())) continue;              // un identificador, un evento, una ruta, extensiones
        if (/===|!==|\?\.|=>|\$\{/.test(valor)) continue;              // código, no texto (plantillas anidadas, JSX)
        if (PERMITIDOS.some(([a, t]) => a === rel && valor.includes(t))) continue;
        hallazgos.push(`${rel}:${lineaDe(i)}  «${valor.trim().slice(0, 90)}»`);
    }
}

console.log('\n«workspace» en lo que se ve de la interfaz');
if (hallazgos.length) {
    console.log(`  FALLA ${hallazgos.length} texto(s) siguen llamando «workspace» a un proyecto:`);
    for (const h of [...new Set(hallazgos)]) console.log(`        ${h}`);
} else {
    console.log('  ok    ninguno: una carpeta es un «project» en toda la interfaz');
}

// Y que la guarda de verdad guarda: un texto viejo, metido a mano, se detecta.
const prueba = sinComentarios(`const a = 'Close Workspace'; // Close Workspace\nconst b = 'amox_open_workspace_wizard';\n<span>Recent Workspaces</span>`);
const detecta = [...prueba.matchAll(/'([^'\n]*)'|>([^<>{}]+)</g)]
    .map(m => m[1] ?? m[2]).filter(v => /workspace/i.test(v) && !/^[\w./:-]*$/.test(v.trim()));
const ok2 = detecta.length === 2;
console.log(`  ${ok2 ? 'ok   ' : 'FALLA'} la guarda detecta un texto viejo y deja pasar un identificador`);

const fallos = (hallazgos.length ? 1 : 0) + (ok2 ? 0 : 1);
console.log(`\n${2 - fallos} pasadas, ${fallos} fallos\n`);
process.exit(fallos ? 1 : 0);
