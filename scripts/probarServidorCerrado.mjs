/**
 * El servidor es de la ventana de AmoxSQL y de nadie más (6.0, M0; auditoría S1, S2).
 *
 *     node scripts/probarServidorCerrado.mjs
 *
 *   - Escucha sólo en 127.0.0.1: por la dirección de red de la máquina no conecta.
 *   - Una petición con el `Origin` de una página web: 403, y la consulta NO se ejecuta.
 *   - El `Host` de un dominio que se resuelve a 127.0.0.1 (DNS rebinding): 403.
 *   - La ventana (`amoxsql://app`), Vite en desarrollo y lo que no manda Origin
 *     (el proceso principal, la línea de órdenes, las pruebas): pasan.
 *   - CORS sólo devuelve cabeceras al origen de la app.
 *   - Un archivo o una carpeta con apóstrofo en el nombre se importa (S2).
 */
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'amox-puerta-'));
process.env.AMOXSQL_HOME = path.join(TMP, 'home');      // ANTES de cargar nada del servidor
process.env.AMOXSQL_LLAVERO_DE_PRUEBA = '1';
fs.mkdirSync(process.env.AMOXSQL_HOME, { recursive: true });
const P = path.join(TMP, "proyecto d'Ana");
fs.mkdirSync(path.join(P, "datos d'O"), { recursive: true });
fs.writeFileSync(path.join(P, "ventas d'enero.csv"), 'id,importe\n1,10\n2,20\n');
fs.writeFileSync(path.join(P, "datos d'O", 'a.csv'), 'id\n1\n');
fs.writeFileSync(path.join(P, "datos d'O", 'b.csv'), 'id\n2\n');

const require = createRequire(import.meta.url);
let pasadas = 0, fallos = 0;
const comprobar = (titulo, ok, detalle = '') => {
    if (ok) { pasadas++; console.log(`  ok    ${titulo}`); }
    else { fallos++; console.log(`  FALLA ${titulo}${detalle ? ' — ' + String(detalle).slice(0, 300) : ''}`); }
};

try {
    const { startServer } = require(path.join(RAIZ, 'server/index.js'));
    const baseCentral = require(path.join(RAIZ, 'server/central/BaseCentral.js'));
    const dbManager = require(path.join(RAIZ, 'server/DatabaseManager.js'));
    const { port } = await startServer(0);
    for (let k = 0; k < 100 && !baseCentral.estaAbierta(); k++) await new Promise(r => setTimeout(r, 100));
    const base = `http://127.0.0.1:${port}`;
    const pedir = (ruta, { metodo = 'POST', cuerpo, cabeceras = {}, url = base } = {}) => fetch(`${url}${ruta}`, {
        method: metodo, headers: { 'Content-Type': 'application/json', ...cabeceras }, body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    }).then(async r => ({ status: r.status, cors: r.headers.get('access-control-allow-origin'), ...(await r.json().catch(() => ({}))) }));

    await pedir('/api/project/open', { cuerpo: { path: P } });
    await pedir('/api/db/connect', { cuerpo: { path: 'puerta.duckdb' } });
    await pedir('/api/query', { cuerpo: { query: 'CREATE TABLE intacta AS SELECT 1 AS x' } });

    console.log('\nla red');
    const ips = Object.values(os.networkInterfaces()).flat().filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i.address);
    if (ips.length) {
        let error = null;
        try { await fetch(`http://${ips[0]}:${port}/api/variables`, { signal: AbortSignal.timeout(3000) }); } catch (e) { error = e.cause?.code || e.name; }
        comprobar('por la dirección de red de la máquina no conecta', !!error, error || 'respondió');
    } else console.log('        (esta máquina no tiene dirección de red: se salta)');
    let r = await pedir('/api/variables', { metodo: 'GET', url: `http://localhost:${port}` });
    comprobar('por localhost sí (127.0.0.1)', r.status === 200, JSON.stringify(r).slice(0, 120));

    console.log('\nuna página web');
    r = await pedir('/api/query', { cuerpo: { query: 'DROP TABLE intacta' }, cabeceras: { Origin: 'https://pagina-cualquiera.example' } });
    comprobar('con el Origin de otra página: 403', r.status === 403 && /origin not allowed/.test(r.error || ''), JSON.stringify(r));
    const sigue = await pedir('/api/query', { cuerpo: { query: 'SELECT count(*) AS n FROM intacta' } });
    comprobar('  y la consulta no se ejecutó', Number(sigue.data?.[0]?.n) === 1, JSON.stringify(sigue).slice(0, 200));
    r = await pedir('/api/variables', { metodo: 'GET', cabeceras: { Origin: 'http://localhost:8080' } });
    comprobar('otro puerto de localhost tampoco', r.status === 403, JSON.stringify(r));
    // fetch no deja cambiar el Host: con http.request, como lo mandaría el navegador.
    const conHost = (host) => new Promise((ok) => {
        const req = http.request({ host: '127.0.0.1', port, path: '/api/variables', headers: { Host: host } }, (res) => {
            let t = ''; res.on('data', (c) => { t += c; }); res.on('end', () => ok({ status: res.statusCode, cuerpo: t }));
        });
        req.on('error', (e) => ok({ status: 0, cuerpo: e.message }));
        req.end();
    });
    r = await conHost(`ataque.example:${port}`);
    comprobar('un Host de otro dominio (DNS rebinding): 403', r.status === 403 && /host not allowed/.test(r.cuerpo), JSON.stringify(r));
    r = await conHost(`localhost:${port}`);
    comprobar('  el Host localhost sí', r.status === 200, JSON.stringify(r).slice(0, 100));

    console.log('\nla ventana de AmoxSQL');
    r = await pedir('/api/variables', { metodo: 'GET', cabeceras: { Origin: 'amoxsql://app' } });
    comprobar('amoxsql://app pasa, y CORS le responde a ella', r.status === 200 && r.cors === 'amoxsql://app', `${r.status} · ${r.cors}`);
    r = await pedir('/api/variables', { metodo: 'GET', cabeceras: { Origin: 'http://localhost:5173' } });
    comprobar('Vite en desarrollo (5173) pasa', r.status === 200 && r.cors === 'http://localhost:5173', `${r.status} · ${r.cors}`);
    r = await pedir('/api/variables', { metodo: 'GET' });
    comprobar('sin Origin (proceso principal, órdenes, pruebas) pasa', r.status === 200);
    const pre = await fetch(`${base}/api/query`, { method: 'OPTIONS', headers: { Origin: 'amoxsql://app', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' } });
    comprobar('el preflight de la app se contesta', pre.status === 204 && pre.headers.get('access-control-allow-origin') === 'amoxsql://app', `${pre.status} ${pre.headers.get('access-control-allow-origin')}`);

    console.log('\nen producción');
    const antes = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const { origenPermitido } = require(path.join(RAIZ, 'server/puerta.js'));
    comprobar('Vite ya no pasa; la app sí', !origenPermitido('http://localhost:5173') && origenPermitido('amoxsql://app'));
    process.env.NODE_ENV = antes;

    console.log('\nrutas con apóstrofo (S2)');
    r = await pedir('/api/db/import', { cuerpo: { filePath: "ventas d'enero.csv", tableName: 'enero' } });
    let q = await pedir('/api/query', { cuerpo: { query: 'SELECT sum(importe) AS s FROM enero' } });
    comprobar('importar un archivo con apóstrofo', r.success && Number(q.data?.[0]?.s) === 30, JSON.stringify(r).slice(0, 200));
    const { ejecutarProceso } = require(path.join(RAIZ, 'server/ejecucion/ejecutarProceso.js'));
    const p = await ejecutarProceso({
        dbManager, proyecto: P, chainFile: 'apostrofo.sqlchain', origen: 'interfaz',
        chainDef: { config: { base: 'proyecto' }, nodes: [
            { id: 'f', type: 'import_file', config: { sourcePath: "ventas d'enero.csv", tableName: 'de_archivo' }, position: { x: 0, y: 0 } },
            { id: 'c', type: 'import_folder', config: { folderPath: "datos d'O", pattern: '*.csv', tableName: 'de_carpeta' }, position: { x: 0, y: 200 } },
            { id: 'x', type: 'export_file', config: { outputPath: "salida d'hoy.csv", format: 'csv', query: 'SELECT 1 AS uno' }, position: { x: 300, y: 0 } },
        ], edges: [] },
    });
    q = await pedir('/api/query', { cuerpo: { query: 'SELECT (SELECT count(*) FROM de_archivo) AS a, (SELECT count(*) FROM de_carpeta) AS c' } });
    comprobar("Data Flow: archivo, carpeta y salida con apóstrofo", p.status === 'completed' && Number(q.data?.[0]?.a) === 2 && Number(q.data[0].c) === 2 && fs.existsSync(path.join(P, "salida d'hoy.csv")), `${p.status} · ${p.error || ''} · ${JSON.stringify(q.data)}`);
} catch (e) {
    fallos++;
    console.log('  FALLA excepción:', e?.stack || e);
}
console.log(`\n${pasadas} pasadas, ${fallos} fallos`);
process.exit(fallos ? 1 : 0);
