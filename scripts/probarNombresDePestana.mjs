// @suite rapida
/**
 * Los nombres de las pestañas se distinguen (6.0, M11):
 * client/src/utils/nombresDePestana.js.
 */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { nombreNuevo, carpetasQueDistinguen, tieneNombreNumerado } = await import(pathToFileURL(path.join(RAIZ, 'client', 'src', 'utils', 'nombresDePestana.js')).href);

let ok = 0, mal = 0;
const bien = (n, c, x) => { if (c) { ok++; console.log('  ok ', n); } else { mal++; console.log('  MAL', n, x === undefined ? '' : JSON.stringify(x)); } };

console.log('— una pestaña nueva');
bien('la primera consulta es «Query 1.sql»', nombreNuevo('sql', []) === 'Query 1.sql');
bien('la siguiente, el número más bajo libre', nombreNuevo('sql', ['Query 1.sql', 'Query 3.sql']) === 'Query 2.sql');
bien('cada tipo con su nombre y su extensión', nombreNuevo('sqlnb', []) === 'Notebook 1.sqlnb' && nombreNuevo('amoxcanvas', ['Canvas 1.amoxcanvas']) === 'Canvas 2.amoxcanvas' && nombreNuevo('texto', []) === 'Text 1.txt');
bien('sin distinguir mayúsculas', nombreNuevo('sql', ['query 1.SQL']) === 'Query 2.sql');
bien('Deep Dive y el linaje no se numeran', !tieneNombreNumerado('datadiving') && !tieneNombreNumerado('dbt-lineage') && tieneNombreNumerado('sql'));

console.log('— dos con el mismo nombre');
const tabs = [
    { id: 'a', name: 'cierre.sql', path: 'C:\\p\\flujos\\cierre.sql' },
    { id: 'b', name: 'cierre.sql', path: 'C:\\p\\reportes\\cierre.sql' },
    { id: 'c', name: 'ventas.sql', path: 'C:\\p\\ventas.sql' },
];
let m = carpetasQueDistinguen(tabs);
bien('llevan su carpeta', m.get('a') === 'flujos' && m.get('b') === 'reportes', Object.fromEntries(m));
bien('la que no choca, nada', !m.has('c'));
m = carpetasQueDistinguen([
    { id: 'a', name: 'x.sql', path: '/p/2023/flujos/x.sql' },
    { id: 'b', name: 'x.sql', path: '/p/2024/flujos/x.sql' },
]);
bien('si la carpeta también coincide, dos niveles', m.get('a') === '2023/flujos' && m.get('b') === '2024/flujos', Object.fromEntries(m));

console.log(`\n${ok} bien, ${mal} mal`);
process.exit(mal ? 1 : 0);
