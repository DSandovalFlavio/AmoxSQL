/**
 * El archivo que acaba de llegar (C3), fase 3 del plan de la 5.10.
 *
 *     node scripts/probarLlegadas.mjs
 *
 *   - Una fuente de tipo carpeta lee el más reciente que ya terminó de llegar.
 *   - Un archivo que se está escribiendo no cuenta todavía (Dec-14), ni los
 *     temporales de Office (`~$…`).
 *   - Con el vigilante: al llegar un archivo, la vista se rehace y sale UN
 *     aviso, aunque se escriba en varias pasadas.
 *   - «Todos»: unidos por nombre de columna con `_archivo`.
 *   - Excel en carpeta, con su rango.
 *   - Sin vigilante (la línea de comandos), el más reciente se elige al empezar.
 *   - Carpeta vacía, inexistente, relativa al proyecto.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ESTE = fileURLToPath(import.meta.url);
const RAIZ = path.resolve(path.dirname(ESTE), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'amox-llegadas-'));
const HOME = path.join(TMP, 'home');
fs.mkdirSync(HOME, { recursive: true });
process.env.AMOXSQL_HOME = HOME;
process.env.AMOXSQL_LLAVERO_DE_PRUEBA = '1';

const require = createRequire(import.meta.url);
const { startServer, atenderOrden } = require(path.join(RAIZ, 'server/index.js'));
const baseCentral = require(path.join(RAIZ, 'server/central/BaseCentral.js'));
const { port } = await startServer(0);
for (let i = 0; i < 100 && !baseCentral.estaAbierta(); i++) await new Promise(r => setTimeout(r, 100));
const u = (p) => `http://localhost:${port}${p}`;
const pedir = (m) => (p, b) => fetch(u(p), { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined })
    .then(async r => ({ status: r.status, ...(await r.json().catch(() => ({}))) }));
const get = pedir('GET'), post = pedir('POST');
const espera = (ms) => new Promise(r => setTimeout(r, ms));
const consulta = async (sql) => {
    await get('/api/fuentes');
    const r = await post('/api/query', { query: sql });
    return r.data || { error: r.error };
};

let pasadas = 0, fallos = 0;
const comprobar = (titulo, ok, detalle = '') => {
    if (ok) { pasadas++; console.log(`  ok    ${titulo}`); }
    else { fallos++; console.log(`  FALLA ${titulo}${detalle ? ' — ' + detalle : ''}`); }
};
/** Un archivo con su fecha puesta `haceSeg` segundos atrás: ya llegado. */
const llegado = (ruta, texto, haceSeg) => {
    fs.mkdirSync(path.dirname(ruta), { recursive: true });
    fs.writeFileSync(ruta, texto);
    const t = new Date(Date.now() - haceSeg * 1000);
    fs.utimesSync(ruta, t, t);
};

const P = path.join(TMP, 'proyecto');
const ENTRADA = path.join(TMP, 'Nube', 'Tiendas', 'entrada');
llegado(path.join(ENTRADA, 'ventas semana 38.csv'), 'tienda,importe\nnorte,38\n', 600);
llegado(path.join(ENTRADA, 'ventas semana 39.csv'), 'tienda,importe\nnorte,39\nsur,1\n', 300);
llegado(path.join(ENTRADA, 'otra cosa.csv'), 'x\n1\n', 10);                 // no casa con el patrón
fs.mkdirSync(P, { recursive: true });

// Los avisos de llegada, escuchados como lo hace la interfaz.
const avisos = [];
const ctl = new AbortController();
(async () => {
    try {
        const r = await fetch(u('/api/fuentes/llegadas'), { signal: ctl.signal });
        const lector = r.body.getReader();
        const dec = new TextDecoder();
        let buf = '';
        for (;;) {
            const { done, value } = await lector.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            const partes = buf.split('\n\n');
            buf = partes.pop();
            for (const p of partes) if (p.startsWith('data: ')) avisos.push(JSON.parse(p.slice(6)));
        }
    } catch { /* cerrado al terminar */ }
})();

try {
    await post('/api/project/open', { path: P });
    await post('/api/db/connect', { path: 'p.duckdb' });

    console.log('\nel más reciente');
    let r = await post('/api/fuentes', {
        definicion: { nombre: 'ventas-semanales', tipo: 'carpeta', patron: 'ventas*.csv' },
        ubicacionAqui: ENTRADA,
    });
    comprobar('se define una fuente de tipo carpeta', r.status === 200 && r.fuente?.tipo === 'carpeta' && r.fuente.patron === 'ventas*.csv', JSON.stringify(r));
    let filas = await consulta('SELECT sum(importe)::INTEGER AS t FROM fuentes."ventas-semanales"');
    comprobar('lee el más reciente (semana 39)', filas?.[0]?.t === 40, JSON.stringify(filas));
    let lista = (await get('/api/fuentes')).fuentes.find(f => f.nombre === 'ventas-semanales');
    comprobar('la lista dice cuál lee y los anteriores', lista?.actual?.nombre === 'ventas semana 39.csv' && lista.anteriores?.[0]?.nombre === 'ventas semana 38.csv' && lista.archivos === 2, JSON.stringify(lista));
    r = await get(`/api/fuentes/carpeta?${new URLSearchParams({ dir: ENTRADA, patron: 'ventas*.csv' })}`);
    comprobar('el formulario ve lo que hay en la carpeta', r.total === 2 && r.archivos[0].nombre === 'ventas semana 39.csv' && r.archivos[0].quieto === true, JSON.stringify(r).slice(0, 200));

    console.log('\nlo que está llegando no cuenta');
    fs.writeFileSync(path.join(ENTRADA, '~$ventas semana 40.csv'), 'basura');
    llegado(path.join(ENTRADA, 'ventas semana 40.csv'), 'tienda,importe\nnorte,40\n', 0);   // recién escrito
    await post('/api/fuentes', { definicion: { nombre: 'ventas-semanales', tipo: 'carpeta', patron: 'ventas*.csv' }, ubicacionAqui: ENTRADA });
    filas = await consulta('SELECT sum(importe)::INTEGER AS t FROM fuentes."ventas-semanales"');
    comprobar('un archivo de hace un instante todavía no se lee (sigue la 39)', filas?.[0]?.t === 40, JSON.stringify(filas));
    lista = (await get('/api/fuentes')).fuentes.find(f => f.nombre === 'ventas-semanales');
    comprobar('el temporal de Office no se cuenta', lista?.archivos === 3, JSON.stringify(lista));

    console.log('\nel vigilante');
    // La 40 termina de llegar: el vigilante la ve quieta y rehace la vista.
    let llego = false;
    for (let i = 0; i < 40 && !llego; i++) {
        await espera(250);
        llego = avisos.some(a => a.tipo === 'llegada' && a.archivo === 'ventas semana 40.csv');
    }
    comprobar('avisa cuando el archivo lleva unos segundos quieto', llego, JSON.stringify(avisos));
    filas = await consulta('SELECT sum(importe)::INTEGER AS t FROM fuentes."ventas-semanales"');
    comprobar('y la vista ya lee la semana 40', filas?.[0]?.t === 40 && (await consulta('SELECT max(importe)::INTEGER AS m FROM fuentes."ventas-semanales"'))?.[0]?.m === 40, JSON.stringify(filas));

    // Uno escrito en tres pasadas, como una carpeta sincronizada: un solo aviso.
    const N41 = path.join(ENTRADA, 'ventas semana 41.csv');
    const antes = avisos.length;
    fs.writeFileSync(N41, 'tienda,importe\n');
    await espera(900); fs.appendFileSync(N41, 'norte,41\n');
    await espera(900); fs.appendFileSync(N41, 'sur,41\n');
    let deLa41 = [];
    for (let i = 0; i < 40; i++) {
        await espera(250);
        deLa41 = avisos.slice(antes).filter(a => a.archivo === 'ventas semana 41.csv');
        if (deLa41.length) { await espera(1500); deLa41 = avisos.slice(antes).filter(a => a.archivo === 'ventas semana 41.csv'); break; }
    }
    comprobar('un archivo escrito en varias pasadas produce UN aviso', deLa41.length === 1, JSON.stringify(avisos.slice(antes)));
    filas = await consulta('SELECT sum(importe)::INTEGER AS t FROM fuentes."ventas-semanales"');
    comprobar('...y se lee entero', filas?.[0]?.t === 82, JSON.stringify(filas));
    comprobar('el aviso dice de qué fuente es', deLa41[0]?.fuentes?.[0] === 'ventas-semanales');
    fs.writeFileSync(path.join(ENTRADA, '~$ventas semana 41.csv'), 'otra basura');
    await espera(4500);
    comprobar('un temporal de Office no avisa', !avisos.some(a => /~\$/.test(a.archivo || '')));

    console.log('\ntodos, unidos');
    await post('/api/fuentes', { definicion: { nombre: 'historico', tipo: 'carpeta', patron: 'ventas*.csv', criterio: 'todos' }, ubicacionAqui: ENTRADA });
    filas = await consulta('SELECT _archivo, sum(importe)::INTEGER AS t FROM fuentes."historico" GROUP BY _archivo ORDER BY _archivo');
    comprobar('cada fila sabe de qué archivo vino (_archivo)', Array.isArray(filas) && filas.length === 4 && filas[0]._archivo === 'ventas semana 38.csv', JSON.stringify(filas));

    console.log('\nExcel en carpeta');
    const XL = path.join(TMP, 'Nube', 'Cliente');
    llegado(path.join(XL, 'reporte 2026-09.xlsx'), fs.readFileSync(path.join(RAIZ, 'scripts', 'fixtures', 'excel', 'cliente.xlsx')), 120);
    llegado(path.join(XL, 'reporte 2026-08.xlsx'), fs.readFileSync(path.join(RAIZ, 'scripts', 'fixtures', 'excel', 'varias_hojas.xlsx')), 1200);
    await post('/api/fuentes', { definicion: { nombre: 'reporte-cliente', tipo: 'carpeta', patron: 'reporte*.xlsx', excel: { rango: 'A4:E', rellenar: ['Tienda'] } }, ubicacionAqui: XL });
    filas = await consulta('SELECT count(*)::INTEGER AS n, count(Tienda)::INTEGER AS c FROM fuentes."reporte-cliente"');
    comprobar('lee el Excel más reciente con su rango y su relleno', filas?.[0]?.n === 6 && filas[0].c === 6, JSON.stringify(filas));

    console.log('\nsin vigilante: la línea de comandos elige al empezar');
    // La 41 se escribió hace unos segundos: se la manda atrás para que la 42 sea la más reciente.
    const hace = (s) => new Date(Date.now() - s * 1000);
    fs.utimesSync(N41, hace(90), hace(90));
    llegado(path.join(ENTRADA, 'ventas semana 42.csv'), 'tienda,importe\nnorte,420\n', 5);   // quieto, y el más nuevo
    const proceso = path.join(P, 'semanal.sqlchain');
    fs.writeFileSync(proceso, JSON.stringify({
        version: '1.0', name: 'semanal', config: { base: 'memoria' },
        nodes: [
            { id: 'a', type: 'fuente', label: 'Ventas', config: { fuente: 'ventas-semanales' } },
            { id: 'b', type: 'export_file', label: 'Salida', config: { outputPath: 'salida/semana.csv', format: 'csv' } },
        ],
        edges: [{ id: 'e', source: 'a', target: 'b' }], variables: {},
    }));
    const res = await atenderOrden({ id: 'llegadas-cli', proceso, proyecto: P, parametros: {} });
    const salida = fs.existsSync(path.join(P, 'salida', 'semana.csv')) ? fs.readFileSync(path.join(P, 'salida', 'semana.csv'), 'utf8') : '';
    comprobar('el proceso lee la semana 42', res.codigo === 0 && /420/.test(salida), `${JSON.stringify(res).slice(0, 200)} | ${salida}`);

    console.log('\ncarpetas que no están o están vacías');
    fs.mkdirSync(path.join(TMP, 'vacia'), { recursive: true });
    await post('/api/fuentes', { definicion: { nombre: 'nada', tipo: 'carpeta', patron: '*.csv' }, ubicacionAqui: path.join(TMP, 'vacia') });
    lista = (await get('/api/fuentes')).fuentes.find(f => f.nombre === 'nada');
    comprobar('una carpeta vacía se marca', lista?.estado === 'vacia', JSON.stringify(lista));
    r = await post('/api/query', { query: 'SELECT * FROM fuentes."nada"' });
    comprobar('y consultarla dice que no hay archivo', /no file in .* matches \*\.csv/.test(r.error || ''), r.error);
    await post('/api/fuentes', { definicion: { nombre: 'nada', tipo: 'carpeta', patron: '*.csv' }, ubicacionAqui: path.join(TMP, 'no-existe') });
    lista = (await get('/api/fuentes')).fuentes.find(f => f.nombre === 'nada');
    comprobar('una que no existe, también', lista?.estado === 'no_encontrada', JSON.stringify(lista));
    llegado(path.join(P, 'entrada', 'metas 2026.csv'), 'tienda,meta\nnorte,1\n', 100);
    await post('/api/fuentes', { definicion: { nombre: 'metas', tipo: 'carpeta', patron: 'metas*.csv' }, ubicacionAqui: path.join(P, 'entrada') });
    const def = JSON.parse(fs.readFileSync(path.join(P, '.amoxsql', 'fuentes', 'metas.json'), 'utf8'));
    filas = await consulta('SELECT count(*)::INTEGER AS n FROM fuentes."metas"');
    comprobar('una carpeta dentro del proyecto va relativa y funciona', def.ubicacion === 'entrada' && filas?.[0]?.n === 1, JSON.stringify(def));
    r = await post('/api/fuentes', { definicion: { nombre: 'mal', tipo: 'carpeta', patron: 'sub/x*.csv' }, ubicacionAqui: ENTRADA });
    comprobar('un patrón con carpetas se rechaza', r.status === 400 && /without folders/.test(r.error || ''), JSON.stringify(r));
} catch (x) {
    fallos++;
    console.log('  FALLA inesperado:', x.stack || x.message);
} finally {
    ctl.abort();
    try { await baseCentral.cerrar(); } catch { /* ya cerrada */ }
}

console.log(`\n${pasadas} pasadas, ${fallos} fallos`);
process.exit(fallos ? 1 : 0);
