/**
 * `AMOXSQL_HOME` aparta todo lo que AmoxSQL guarda fuera de los proyectos.
 *
 *     node scripts/probarRutasHome.mjs
 *
 * La prueba importante no es que la variable se lea: es que, con ella puesta,
 * cargar los módulos NO toca la carpeta real del usuario. `AiManager` escribe su
 * configuración al cargarse (ensureConfig) y `seedGallery` siembra archivos, así
 * que se comprueba que `~/.amoxsql` no cambia ni un milisegundo de fecha.
 *
 * Cada caso corre en un proceso aparte para que la caché de módulos de uno no
 * contamine al siguiente. Ningún caso carga AiManager SIN la variable puesta.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pasadas = 0, fallos = 0;
const comprobar = (titulo, ok, detalle = '') => {
    if (ok) { pasadas++; console.log(`  ok    ${titulo}`); }
    else { fallos++; console.log(`  FALLA ${titulo}${detalle ? ' — ' + detalle : ''}`); }
};

/** Corre `codigo` en un node nuevo con el entorno dado y devuelve su JSON. */
function enProceso(codigo, env) {
    const limpio = { ...process.env };
    delete limpio.AMOXSQL_HOME;
    const r = spawnSync(process.execPath, ['-e', codigo], {
        cwd: RAIZ, env: { ...limpio, ...env }, encoding: 'utf8', timeout: 60000,
    });
    const linea = (r.stdout || '').trim().split('\n').filter(l => l.startsWith('{')).pop();
    if (!linea) throw new Error(`sin salida JSON:\n${r.stdout}\n${r.stderr}`);
    return JSON.parse(linea);
}

/** Huella de una carpeta: cada archivo con su tamaño y su fecha. */
function huella(dir) {
    if (!fs.existsSync(dir)) return 'no existe';
    const out = [];
    const recorrer = (d) => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            const p = path.join(d, e.name);
            if (e.isDirectory()) recorrer(p);
            else { const s = fs.statSync(p); out.push(`${path.relative(dir, p)}|${s.size}|${s.mtimeMs}`); }
        }
    };
    recorrer(dir);
    return out.sort().join('\n');
}

const REAL = path.join(os.homedir(), '.amoxsql');
const antes = huella(REAL);
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'amox-home-'));

console.log('\nla función, sola');
{
    const r = enProceso(`console.log(JSON.stringify({ h: require('./server/rutas').homeAmox() }))`, {});
    comprobar('sin variable, es ~/.amoxsql', r.h === REAL, r.h);
    const r2 = enProceso(`console.log(JSON.stringify({ h: require('./server/rutas').homeAmox() }))`, { AMOXSQL_HOME: TMP });
    comprobar('con variable, es la variable', r2.h === path.resolve(TMP), r2.h);
    const r3 = enProceso(`console.log(JSON.stringify({ h: require('./server/rutas').homeAmox() }))`, { AMOXSQL_HOME: '   ' });
    comprobar('sólo espacios cuenta como vacía', r3.h === REAL, r3.h);
    const r4 = enProceso(`console.log(JSON.stringify({ h: require('./server/rutas').homeAmox() }))`, { AMOXSQL_HOME: 'relativa/carpeta' });
    comprobar('una ruta relativa se vuelve absoluta', path.isAbsolute(r4.h) && r4.h === path.resolve(RAIZ, 'relativa/carpeta'), r4.h);
}

console.log('\nlos módulos, con la variable puesta');
{
    const r = enProceso(`
        const ai = require('./server/AiManager');
        const docs = require('./server/ai/duckdbDocs');
        const gal = require('./server/galleryManager');
        let sembrado = null;
        try { gal.seedGallery(); sembrado = true; } catch (e) { sembrado = e.message; }
        console.log(JSON.stringify({ config: ai.configPath, docs: docs.userDir(), sembrado }));
    `, { AMOXSQL_HOME: TMP });
    comprobar('la configuración va a la carpeta apartada', r.config === path.join(TMP, 'config.json'), r.config);
    comprobar('y se crea allí', fs.existsSync(path.join(TMP, 'config.json')));
    comprobar('la documentación descargada, también', r.docs === path.join(TMP, 'duckdb-docs'), r.docs);
    comprobar('la galería se siembra allí', r.sembrado === true && fs.existsSync(path.join(TMP, 'gallery')),
        String(r.sembrado));
}

console.log('\nla carpeta real no se toca');
comprobar('~/.amoxsql queda idéntica: mismos archivos, tamaños y fechas', huella(REAL) === antes);

fs.rmSync(TMP, { recursive: true, force: true });
console.log(`\n${pasadas} pasadas, ${fallos} fallos\n`);
process.exit(fallos ? 1 : 0);
