// @suite rapida
/**
 * Un gráfico se anida bajo la consulta de la que sale (6.0, M11):
 * client/src/utils/anidarArchivos.js.
 */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { anidarRelacionados } = await import(pathToFileURL(path.join(RAIZ, 'client', 'src', 'utils', 'anidarArchivos.js')).href);

let ok = 0, mal = 0;
const bien = (n, c, x) => { if (c) { ok++; console.log('  ok ', n); } else { mal++; console.log('  MAL', n, x === undefined ? '' : JSON.stringify(x)); } };

const lista = [
    { name: 'graficos', path: 'q/graficos', isDirectory: true },
    { name: 'ventas.sql', path: 'q/ventas.sql' },
    { name: 'ventas.amoxvis', path: 'q/ventas.amoxvis', origen: 'q/ventas.sql' },
    { name: 'tendencia.amoxvis', path: 'q/tendencia.amoxvis', origen: 'q\\ventas.sql' },
    { name: 'propio.amoxvis', path: 'q/propio.amoxvis' },
    { name: 'lejos.amoxvis', path: 'q/lejos.amoxvis', origen: 'otra/costos.sql' },
    { name: 'costos.sql', path: 'q/costos.sql' },
];
const { sueltos, anidados } = anidarRelacionados(lista);
const nombres = (l) => l.map(f => f.name);

bien('los gráficos de ventas.sql van bajo ella, en orden', JSON.stringify(nombres(anidados.get('q/ventas.sql') || [])) === JSON.stringify(['ventas.amoxvis', 'tendencia.amoxvis']), Object.fromEntries([...anidados].map(([k, v]) => [k, nombres(v)])));
bien('un origen con barras invertidas también cuenta', (anidados.get('q/ventas.sql') || []).some(f => f.name === 'tendencia.amoxvis'));
bien('sin origen, se queda suelto', nombres(sueltos).includes('propio.amoxvis'));
bien('si su consulta está en otra carpeta, se queda suelto', nombres(sueltos).includes('lejos.amoxvis'));
bien('lo demás, en el mismo orden', JSON.stringify(nombres(sueltos)) === JSON.stringify(['graficos', 'ventas.sql', 'propio.amoxvis', 'lejos.amoxvis', 'costos.sql']), nombres(sueltos));
bien('una consulta sin gráficos no tiene entrada', !anidados.has('q/costos.sql'));
bien('una lista vacía', anidarRelacionados([]).sueltos.length === 0);

console.log(`\n${ok} bien, ${mal} mal`);
process.exit(mal ? 1 : 0);
