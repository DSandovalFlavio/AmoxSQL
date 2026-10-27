/**
 * El flujo entre un `.sql` y sus gráficos (Dec-79–81):
 *   - el gráfico de un `.sql` se recuerda con el archivo (`server/borradores.js`);
 *   - un `.amoxvis` vinculado sigue a SU consulta cuando se guarda el `.sql`
 *     (`client/src/utils/seguirConsulta.js`);
 *   - renombrar el `.sql` arrastra su borrador y el origen de sus gráficos;
 *   - abrir un gráfico no lo deja «con cambios» (`mismoGrafico`).
 *
 *     node scripts/probarFlujoGrafico.mjs
 *
 * No toca ninguna base ni el home: el proyecto es una carpeta temporal.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { register, createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLIENTE = path.join(RAIZ, 'client');
register('data:text/javascript,' + encodeURIComponent(`
    const CLIENTE = ${JSON.stringify(pathToFileURL(CLIENTE + '/package.json').href)};
    export async function resolve(esp, ctx, sig) {
        if (/^\\.\\.?\\//.test(esp) && !/\\.[cm]?jsx?$/.test(esp)) {
            try { return await sig(esp + '.js', ctx); } catch { /* sigue */ }
        }
        if (!/^(node:|data:|file:|\\.|\\/)/.test(esp)) {
            try { return await sig(esp, ctx); } catch { return sig(esp, { ...ctx, parentURL: CLIENTE }); }
        }
        return sig(esp, ctx);
    }
`));
const url = (p) => pathToFileURL(path.join(CLIENTE, 'src', p)).href;
const { consultaQueSigue, conConsulta } = await import(url('utils/seguirConsulta.js'));
const { textoAmoxvis, leerAmoxvis, mismoGrafico } = await import(url('components/DataVisualizer/vega/figura.js'));
const require = createRequire(import.meta.url);
const borradores = require(path.join(RAIZ, 'server/borradores.js'));
const amoxvisServidor = require(path.join(RAIZ, 'server/amoxvis.js'));

let ok = 0, mal = 0;
const bien = (nombre, cond, detalle = '') => {
    cond ? ok++ : mal++;
    console.log(`${cond ? '  ok ' : '  MAL'} ${nombre}${cond || !detalle ? '' : ` → ${detalle}`}`);
};

console.log('— seguir la consulta');
{
    const dos = 'SELECT 1 AS a;\nSELECT 2 AS b;';
    bien('sigue estando en el archivo → igual', consultaQueSigue('SELECT 1 AS a', dos, 'SELECT 1 AS a;\nSELECT 9 AS b;').estado === 'igual');
    bien('era el archivo entero → el archivo nuevo', consultaQueSigue(dos, dos, 'SELECT 7;').consulta === 'SELECT 7;');
    const p = consultaQueSigue('SELECT 2 AS b', dos, 'SELECT 1 AS a;\nSELECT 2 AS b, 3 AS c;');
    bien('la sentencia i con las mismas sentencias → la nueva i', p.estado === 'sigue' && /3 AS c/.test(p.consulta), JSON.stringify(p));
    bien('una sola sentencia ahora → esa', consultaQueSigue('SELECT x', null, 'SELECT y FROM t').consulta.trim() === 'SELECT y FROM t');
    bien('varias y no se sabe cuál → dudosa', consultaQueSigue('SELECT x', 'SELECT q;SELECT x;SELECT r', 'SELECT q;SELECT z').estado === 'dudosa');
    bien('el punto y coma final no cuenta', consultaQueSigue('SELECT 1;', null, 'SELECT 1').estado === 'igual');
    bien('sin consulta → igual', consultaQueSigue('', 'a', 'b').estado === 'igual');
}

console.log('— el archivo cambia solo en la consulta');
{
    const texto = textoAmoxvis({ chartType: 'bar', xAxisKey: 'x', yAxisKeys: ['y'], query: 'SELECT 1', source: 'q.sql' });
    const nuevo = conConsulta(texto, 'SELECT 2');
    const o = JSON.parse(nuevo), antes = JSON.parse(texto);
    bien('la consulta cambia', o.usermeta.amoxsql.consulta === 'SELECT 2');
    bien('el spec y la huella quedan', JSON.stringify(o.layer || o.mark) === JSON.stringify(antes.layer || antes.mark) && o.usermeta.amoxsql.huella === antes.usermeta.amoxsql.huella);
    bien('al leerlo sigue en modo interfaz (la huella vale)', leerAmoxvis(nuevo).modo === 'interfaz');
    const srv = amoxvisServidor.conCambios(texto, { origen: 'otra/q.sql' });
    bien('el servidor cambia el origen sin tocar el resto', leerAmoxvis(srv).source === 'otra/q.sql' && leerAmoxvis(srv).query === 'SELECT 1');
    bien('quitar el origen', !('source' in leerAmoxvis(amoxvisServidor.conCambios(texto, { origen: null }))));
}

console.log('— abrir no deja cambios');
{
    const plano = { chartType: 'line', xAxisKey: 'mes', yAxisKeys: ['venta'], chartTitle: 'Venta', query: 'SELECT 1' };
    const delServidor = amoxvisServidor.texto(plano);
    const deStoryFlow = textoAmoxvis({ ...leerAmoxvis(delServidor) });
    bien('un spec sencillo del servidor y el completo de Story Flow son el mismo gráfico', mismoGrafico(delServidor, deStoryFlow));
    bien('otro título ya es otro gráfico', !mismoGrafico(deStoryFlow, textoAmoxvis({ ...leerAmoxvis(deStoryFlow), chartTitle: 'Otro' })));
    bien('otra consulta ya es otro gráfico', !mismoGrafico(deStoryFlow, conConsulta(deStoryFlow, 'SELECT 2')));
}

console.log('— el borrador del gráfico de un .sql');
{
    const proyecto = fs.mkdtempSync(path.join(os.tmpdir(), 'amox-borradores-'));
    try {
        bien('sin borrador → null', borradores.leer(proyecto, 'q/ventas.sql') === null);
        borradores.poner(proyecto, 'q/ventas.sql', { grafico: { chartType: 'line' } });
        borradores.poner(proyecto, path.join(proyecto, 'q', 'ventas.sql'), { vista: 'chart' });
        const b = borradores.leer(proyecto, 'q/ventas.sql');
        bien('se juntan los cambios (ruta relativa o absoluta, la misma clave)', b && b.vista === 'chart' && b.grafico.chartType === 'line', JSON.stringify(b));
        bien('la carpeta se ignora sola', fs.readFileSync(path.join(proyecto, '.amoxsql', 'borradores', '.gitignore'), 'utf8').trim() === '*');
        borradores.mover(proyecto, path.join(proyecto, 'q'), path.join(proyecto, 'consultas'));
        bien('mover la carpeta lo lleva', !!borradores.leer(proyecto, 'consultas/ventas.sql') && !borradores.leer(proyecto, 'q/ventas.sql'));
        borradores.mover(proyecto, 'consultas/ventas.sql', 'consultas/venta.sql');
        bien('renombrar el archivo lo lleva', borradores.leer(proyecto, 'consultas/venta.sql')?.vista === 'chart');
        borradores.poner(proyecto, 'consultas/venta.sql', null);
        bien('null lo borra', borradores.leer(proyecto, 'consultas/venta.sql') === null);
        const fuera = path.join(os.tmpdir(), 'otro', 'x.sql');
        bien('un archivo fuera del proyecto tiene clave absoluta', path.isAbsolute(borradores.claveDe(proyecto, fuera)));
    } finally {
        fs.rmSync(proyecto, { recursive: true, force: true });
    }
}

console.log(`\n${ok} bien, ${mal} mal`);
process.exit(mal ? 1 : 0);
