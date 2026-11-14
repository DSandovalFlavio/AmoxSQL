/**
 * Las rutas de archivos del proyecto, por HTTP (6.0, M7).
 *
 *     node scripts/probarRutasDeArchivos.mjs
 *
 * Al partir `server/index.js` (M7) el recorrido del proyecto pasó a ser asíncrono
 * (una carpeta sincronizada lo hacía bloquear todo). Esta suite fija lo que esas rutas
 * hacen, con un servidor de verdad y un proyecto de usar y tirar:
 *   - el índice de archivos y el árbol de carpetas (sin carpetas ocultas en el índice);
 *   - guardar un .sql devolviendo la versión anterior, y negarse a pisar un cambio de fuera;
 *   - renombrar y mover un .sql, o su carpeta: sus gráficos lo siguen (`origen`);
 *   - qué gráficos usan una consulta.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'amox-rutas-archivos-'));
process.env.AMOXSQL_HOME = path.join(TMP, 'home');
process.env.AMOXSQL_LLAVERO_DE_PRUEBA = '1';
const P = path.join(TMP, 'proyecto');
const require = createRequire(import.meta.url);

let pasadas = 0, fallos = 0;
const comprobar = (titulo, ok, detalle = '') => {
    if (ok) { pasadas++; console.log(`  ok    ${titulo}`); }
    else { fallos++; console.log(`  FALLA ${titulo}${detalle ? ' — ' + String(detalle).slice(0, 400) : ''}`); }
};
const escribir = (rel, texto) => { const f = path.join(P, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, texto); };
const leer = (rel) => fs.readFileSync(path.join(P, rel), 'utf8');

try {
    const amoxvis = require(path.join(RAIZ, 'server/amoxvis.js'));
    escribir('consultas/ventas.sql', 'SELECT 1 AS uno;\n');
    escribir('consultas/otra.sql', 'SELECT 2 AS dos;\n');
    escribir('graficos/ventas.amoxvis', amoxvis.texto({ chartType: 'bar', query: 'SELECT 1 AS uno', source: 'consultas/ventas.sql' }));
    escribir('graficos/otra.amoxvis', amoxvis.texto({ chartType: 'bar', query: 'SELECT 2 AS dos', source: 'consultas/otra.sql' }));
    escribir('.oculta/nada.sql', 'SELECT 0;\n');
    const origenDe = (rel) => amoxvis.leer(leer(rel)).source;

    const { startServer } = require(path.join(RAIZ, 'server/index.js'));
    const { server, port } = await startServer(0);
    const pedir = async (metodo, url, cuerpo) => {
        const r = await fetch(`http://127.0.0.1:${port}${url}`, { method: metodo, headers: { 'Content-Type': 'application/json' }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
        return { estado: r.status, datos: await r.json().catch(() => null) };
    };
    await pedir('POST', '/api/project/open', { path: P });

    console.log('\nel índice y las carpetas');
    let r = await pedir('GET', '/api/files/index');
    const indice = (r.datos || []).map(f => f.path).sort();
    comprobar('el índice lista los archivos del proyecto', indice.includes('consultas/ventas.sql') && indice.includes('graficos/otra.amoxvis'), indice.join(', '));
    comprobar('  y no lo que vive en carpetas ocultas', !indice.some(p => p.startsWith('.oculta')), indice.join(', '));
    r = await pedir('GET', '/api/files/find-by-extension?ext=.amoxvis');
    comprobar('por extensión: los dos gráficos', (r.datos || []).map(f => f.path).sort().join() === 'graficos/otra.amoxvis,graficos/ventas.amoxvis', JSON.stringify(r.datos));
    r = await pedir('GET', '/api/folders');
    const carpetas = (r.datos || []).map(f => f.path);
    comprobar('el árbol de carpetas empieza por la raíz y tiene las dos', carpetas[0] === '' && carpetas.includes('consultas') && carpetas.includes('graficos'), carpetas.join(', '));

    console.log('\nguardar');
    r = await pedir('GET', '/api/file?path=consultas/ventas.sql');
    const firma = r.datos?.firma;
    r = await pedir('POST', '/api/file', { path: 'consultas/ventas.sql', content: 'SELECT 1 AS uno, 2 AS dos;\n', firmaEsperada: firma, devolverAnterior: true });
    comprobar('guardar devuelve lo que había antes', r.estado === 200 && r.datos?.anterior === 'SELECT 1 AS uno;\n', JSON.stringify(r.datos));
    comprobar('  y lo escribe', leer('consultas/ventas.sql') === 'SELECT 1 AS uno, 2 AS dos;\n');
    escribir('consultas/ventas.sql', 'SELECT 3 AS cambio_de_fuera;\n');
    r = await pedir('POST', '/api/file', { path: 'consultas/ventas.sql', content: 'pisaría', firmaEsperada: firma });
    comprobar('no pisa un cambio hecho por fuera (409)', r.estado === 409 && leer('consultas/ventas.sql').includes('cambio_de_fuera'), JSON.stringify(r));

    console.log('\nlos gráficos de una consulta');
    r = await pedir('GET', '/api/charts/using-source?path=consultas/ventas.sql');
    comprobar('ventas.sql: su gráfico', (r.datos || []).map(f => f.path).join() === 'graficos/ventas.amoxvis', JSON.stringify(r.datos));

    console.log('\nrenombrar y mover: el gráfico sigue a su consulta');
    r = await pedir('POST', '/api/file/rename', { oldPath: 'consultas/ventas.sql', newPath: 'consultas/ventas_mes.sql' });
    comprobar('renombrar', r.estado === 200, JSON.stringify(r));
    comprobar('  el gráfico apunta al nombre nuevo al responder', origenDe('graficos/ventas.amoxvis') === 'consultas/ventas_mes.sql', origenDe('graficos/ventas.amoxvis'));
    comprobar('  el otro gráfico no cambia', origenDe('graficos/otra.amoxvis') === 'consultas/otra.sql');
    r = await pedir('GET', '/api/charts/using-source?path=consultas/ventas_mes.sql');
    comprobar('  y se encuentra por el nombre nuevo', (r.datos || []).length === 1, JSON.stringify(r.datos));
    r = await pedir('POST', '/api/file/move', { sourcePath: 'consultas/ventas_mes.sql', destinationDir: 'informes' });
    comprobar('mover a otra carpeta', r.estado === 200 && r.datos?.newPath === 'informes/ventas_mes.sql', JSON.stringify(r));
    comprobar('  el gráfico lo sigue', origenDe('graficos/ventas.amoxvis') === 'informes/ventas_mes.sql', origenDe('graficos/ventas.amoxvis'));
    r = await pedir('POST', '/api/file/rename', { oldPath: 'consultas', newPath: 'sql' });
    comprobar('renombrar la carpeta: el gráfico de lo que tenía dentro la sigue', r.estado === 200 && origenDe('graficos/otra.amoxvis') === 'sql/otra.sql', origenDe('graficos/otra.amoxvis'));

    server.close();
} catch (e) {
    comprobar('la suite corre', false, e.stack || e.message);
}
console.log(`\n${pasadas} pasadas, ${fallos} fallos`);
process.exit(fallos ? 1 : 0);
