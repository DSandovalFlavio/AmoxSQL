// @suite rapida
/**
 * ¿Encuentra dbt el entorno elegido, y cuál? (6.0, M10 · T12)
 * server/dbt/correr.js → comprobarEntorno, con un dbt falso (Node) en vez del de
 * verdad: no se toca ningún entorno de Python del autor.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { comprobarEntorno } = require(path.join(RAIZ, 'server', 'dbt', 'correr.js'));

let ok = 0, mal = 0;
const bien = (n, c, x) => { if (c) { ok++; console.log('  ok ', n); } else { mal++; console.log('  MAL', n, x === undefined ? '' : JSON.stringify(x)); } };

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'amox-dbt-entorno-'));
const falso = (nombre, cuerpo) => { const f = path.join(dir, nombre); fs.writeFileSync(f, cuerpo); return { tipo: 'directo', exe: process.execPath, pre: [f] }; };

try {
    console.log('— lo encuentra');
    let r = await comprobarEntorno(falso('dbt1.cjs', "if (process.argv.includes('--version')) console.log('Core:\\n  - installed: 1.11.0\\n  - latest:    1.11.0 - Up to date!\\n\\nPlugins:\\n  - duckdb: 1.10.0');"));
    bien('dbt 1.x: «installed: 1.11.0»', r.encontrado && r.version === '1.11.0', r);
    r = await comprobarEntorno(falso('dbt2.cjs', "console.log('dbt version 2.0.11 (build 2026)');"));
    bien('dbt 2: «dbt version 2.0.11»', r.encontrado && r.version === '2.0.11', r);

    console.log('— no lo encuentra, y dice por qué');
    r = await comprobarEntorno({ tipo: 'directo', exe: path.join(dir, 'no-existe.exe'), pre: [] });
    bien('un ejecutable que no existe', !r.encontrado && /not found/.test(r.error), r);
    r = await comprobarEntorno(falso('roto.cjs', "console.error('Traceback...'); console.error('ModuleNotFoundError: No module named dbt'); process.exit(1);"));
    bien('un dbt que falla al arrancar: sus últimas líneas', !r.encontrado && /ModuleNotFoundError/.test(r.error), r);
    r = await comprobarEntorno({ tipo: 'python' });
    bien('un entorno sin carpeta: el error de siempre', !r.encontrado && /without a folder/.test(r.error), r);
    r = await comprobarEntorno(falso('lento.cjs', 'setTimeout(() => {}, 60000);'), { espera: 800 });
    bien('uno que no contesta: se corta', !r.encontrado && /in time/.test(r.error), r);
} finally {
    fs.rmSync(dir, { recursive: true, force: true });
}

console.log(`\n${ok} bien, ${mal} mal`);
process.exit(mal ? 1 : 0);
