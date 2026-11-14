// @suite rapida
/**
 * Buscar y filtrar en todo el proyecto desde el explorador (6.0, M11):
 * client/src/utils/filtroDeArchivos.js.
 */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { pasaTipos, buscarEnProyecto, carpetasConCambios } = await import(pathToFileURL(path.join(RAIZ, 'client', 'src', 'utils', 'filtroDeArchivos.js')).href);

let ok = 0, mal = 0;
const bien = (n, c, x) => { if (c) { ok++; console.log('  ok ', n); } else { mal++; console.log('  MAL', n, x === undefined ? '' : JSON.stringify(x)); } };

const indice = [
    { name: 'ventas.sql', path: 'q/ventas.sql' },
    { name: 'cierre.sql', path: 'informes/2024/cierre.sql' },
    { name: 'cierre.sql', path: 'informes/2023/cierre.sql' },
    { name: 'recierre.md', path: 'notas/recierre.md' },
    { name: 'cierre.amoxvis', path: 'informes/cierre.amoxvis' },
    { name: 'clientes.CSV', path: 'datos/clientes.CSV' },
    { name: 'LEEME', path: 'LEEME' },
];
const rutas = (l) => l.map(f => f.path);

console.log('— tipos');
bien('sin tipos, pasa todo', pasaTipos('x.loquesea', new Set()) && pasaTipos('x', null));
bien('SQL deja pasar .sql y no .sqlnb', pasaTipos('a.sql', new Set(['sql'])) && !pasaTipos('a.sqlnb', new Set(['sql'])));
bien('los datos, sin mirar mayúsculas', pasaTipos('clientes.CSV', new Set(['datos'])));
bien('varios tipos a la vez', pasaTipos('a.md', new Set(['sql', 'texto'])) && !pasaTipos('a.amoxvis', new Set(['sql', 'texto'])));
bien('un archivo sin extensión no pasa ningún tipo', !pasaTipos('LEEME', new Set(['texto'])));

console.log('— buscar');
let r = buscarEnProyecto(indice, 'cierre', new Set());
bien('encuentra en cualquier carpeta; primero los que empiezan por el texto', rutas(r)[0].endsWith('cierre.amoxvis') && rutas(r).at(-1) === 'notas/recierre.md' && r.length === 4, rutas(r));
r = buscarEnProyecto(indice, 'cierre', new Set(['sql']));
bien('con tipo marcado, sólo ese tipo', JSON.stringify(rutas(r)) === JSON.stringify(['informes/2023/cierre.sql', 'informes/2024/cierre.sql']), rutas(r));
r = buscarEnProyecto(indice, '2024/cie', new Set());
bien('con una barra, se compara la ruta', JSON.stringify(rutas(r)) === JSON.stringify(['informes/2024/cierre.sql']), rutas(r));
r = buscarEnProyecto(indice, '', new Set(['datos']));
bien('sólo el tipo, sin texto: todos los de ese tipo', JSON.stringify(rutas(r)) === JSON.stringify(['datos/clientes.CSV']), rutas(r));
bien('el tope se respeta', buscarEnProyecto(indice, '', new Set(), 2).length === 2);
bien('sin índice, nada', buscarEnProyecto(null, 'x', new Set()).length === 0);

console.log('— git');
const c = carpetasConCambios(['informes/2024/cierre.sql', 'LEEME.md', 'q\\ventas.sql']);
bien('las carpetas de encima de cada cambio', c.has('informes') && c.has('informes/2024') && c.has('q') && c.size === 3, [...c]);

console.log(`\n${ok} bien, ${mal} mal`);
process.exit(mal ? 1 : 0);
