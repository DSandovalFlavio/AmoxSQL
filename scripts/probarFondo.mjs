/**
 * Lo de fondo no estorba y reintenta (5.13, fase 3; H1 y J10, Dec-42 y Dec-43).
 *
 *     node scripts/probarFondo.mjs
 *
 * Con un home temporal:
 *   - qué es un error pasajero (se reintenta) y qué no; la regla de cada paso;
 *   - los límites: sólo sin nadie delante y con la aplicación abierta; los
 *     porcentajes que se eligen en Operations; un contexto aislado los lleva y una
 *     base de trabajo vuelve a lo de serie; la base del proyecto no se limita y se dice;
 *   - una ejecución programada con la aplicación abierta deja sus límites en la ficha;
 *   - un paso HTTP contra un servidor que da 503 varias veces termina tras reintentar,
 *     un 404 no se reintenta, y una URL con comilla ya no rompe el SQL;
 *   - dbt de fondo corre por debajo de lo normal.
 */
import fs from 'node:fs';
import os from 'node:os';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'amox-fondo-'));
process.env.AMOXSQL_HOME = path.join(TMP, 'home');
process.env.AMOXSQL_LLAVERO_DE_PRUEBA = '1';
fs.mkdirSync(process.env.AMOXSQL_HOME, { recursive: true });
const P = path.join(TMP, 'proyecto');
fs.mkdirSync(P, { recursive: true });

const require = createRequire(import.meta.url);
let pasadas = 0, fallos = 0;
const comprobar = (titulo, ok, detalle = '') => {
    if (ok) { pasadas++; console.log(`  ok    ${titulo}`); }
    else { fallos++; console.log(`  FALLA ${titulo}${detalle ? ' — ' + String(detalle).slice(0, 400) : ''}`); }
};

try {
    const { esPasajero, reglaDe, conReintentos } = require(path.join(RAIZ, 'server/ejecucion/reintentos.js'));
    console.log('\nqué se reintenta');
    comprobar('503, 429, tiempo agotado, conexión cortada o rechazada: pasajeros', [
        "HTTP Error: Request returned HTTP 503 for HTTP HEAD to 'x'", 'HTTP 429', 'IO Error: Timeout was reached', 'IO Error: Server returned nothing', 'IO Error: Could not connect to server',
    ].every(esPasajero));
    comprobar('404, 401 y un archivo que no está: no', !esPasajero('HTTP GET error on x (HTTP 404 Not Found)') && !esPasajero('(HTTP 401 Unauthorized)') && !esPasajero('No files found that match the pattern'));
    comprobar('la regla: en la interfaz nada; programado, 2 cada 30 s; el paso manda; un paso que no es de red, nunca',
        reglaDe({ type: 'http_fetch' }, 'interfaz') === null
        && JSON.stringify(reglaDe({ type: 'http_fetch' }, 'programada')) === '{"veces":2,"esperaSegundos":30}'
        && JSON.stringify(reglaDe({ type: 'bucket_read', config: { reintentos: { veces: 4, esperaSegundos: 5 } } }, 'interfaz')) === '{"veces":4,"esperaSegundos":5}'
        && reglaDe({ type: 'sql_inline' }, 'programada') === null);
    let n = 0;
    let r = await conReintentos(async () => { if (++n < 3) throw new Error('HTTP 503'); return 'ok'; }, { veces: 3, esperaSegundos: 0 });
    comprobar('dos fallos pasajeros y luego bien: termina, con 2 reintentos', r.resultado === 'ok' && r.reintentos === 2, JSON.stringify(r));
    n = 0;
    let error = null;
    try { await conReintentos(async () => { n++; throw new Error('HTTP 404 Not Found'); }, { veces: 3, esperaSegundos: 0 }); } catch (e) { error = e.message; }
    comprobar('un 404 falla a la primera', n === 1 && !/tried/.test(error), `${n} · ${error}`);
    n = 0;
    try { await conReintentos(async () => { n++; throw new Error('HTTP 503'); }, { veces: 2, esperaSegundos: 0 }); } catch (e) { error = e.message; }
    comprobar('si sigue fallando, el error dice cuántas veces se intentó', n === 3 && /tried 3 times, 0 s apart/.test(error), error);

    const limites = require(path.join(RAIZ, 'server/ejecucion/limites.js'));
    console.log('\nlos límites');
    comprobar('desde la interfaz, ninguno', (await limites.paraEjecucion({ origen: 'interfaz', abierta: true })) === null);
    comprobar('con la aplicación cerrada, ninguno', (await limites.paraEjecucion({ origen: 'programada', abierta: false })) === null);
    const l = await limites.paraEjecucion({ origen: 'programada', abierta: true });
    const nucleos = os.cpus().length;
    comprobar('programado con la aplicación abierta: la mitad de los núcleos y el 25 % de la memoria', l?.hilos === Math.max(1, Math.floor(nucleos / 2)) && Math.abs(l.memoriaMb - os.totalmem() * 0.25 / 1048576) < 2 && fs.existsSync(l.temporal), JSON.stringify(l));

    const { startServer, arrancarProgramador } = require(path.join(RAIZ, 'server/index.js'));
    const baseCentral = require(path.join(RAIZ, 'server/central/BaseCentral.js'));
    const dbManager = require(path.join(RAIZ, 'server/DatabaseManager.js'));
    const { abrirContexto } = require(path.join(RAIZ, 'server/ejecucion/ContextoDeEjecucion.js'));
    const { ejecutarProceso } = require(path.join(RAIZ, 'server/ejecucion/ejecutarProceso.js'));
    const { port } = await startServer(0);
    for (let k = 0; k < 100 && !baseCentral.estaAbierta(); k++) await new Promise(res => setTimeout(res, 100));
    const pedir = (m) => (q, b) => fetch(`http://localhost:${port}${q}`, { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }).then(async x => ({ status: x.status, ...(await x.json().catch(() => ({}))) }));
    const get = pedir('GET'), post = pedir('POST'), put = pedir('PUT');
    await post('/api/project/open', { path: P });
    await post('/api/db/connect', { path: ':memory:' });

    let h = await put('/api/preferencias/limites-fondo', { hilos: 25, memoria: 10 });
    const op = await get('/api/operacion?limite=1');
    comprobar('los porcentajes se eligen (Operations) y se recuerdan', h.hilos === 25 && h.memoria === 10 && op.limites?.hilos === 25 && op.limites?.memoria === 10, JSON.stringify(op.limites));
    const l2 = await limites.paraEjecucion({ origen: 'programada', abierta: true });
    comprobar('  y se usan', l2.hilos === Math.max(1, Math.floor(nucleos / 4)), JSON.stringify(l2));
    await put('/api/preferencias/limites-fondo', { hilos: 50, memoria: 25 });

    console.log('\nen el motor');
    const ajustes = async (ctx) => (await ctx.query(`SELECT current_setting('threads') AS t, current_setting('memory_limit') AS m, current_setting('temp_directory') AS d`))[0];
    let ctx = await abrirContexto('memoria', { dbManager, proyecto: P, chainFile: 'x.sqlchain', fuera: true, limites: l });
    let a = await ajustes(ctx);
    comprobar('un contexto aislado lleva los límites', Number(a.t) === l.hilos && /GiB|MiB|GB|MB/.test(String(a.m)) && String(a.d).replace(/\\/g, '/').toLowerCase().includes('temporal'), JSON.stringify(a));
    comprobar('  y lo sabe (para la ficha)', ctx.limites?.aplicados === true && /cores/.test(ctx.limites.texto), JSON.stringify(ctx.limites));
    await ctx.cerrar();
    ctx = await abrirContexto('trabajo', { dbManager, proyecto: P, chainFile: 'w.sqlchain', fuera: false, limites: l });
    a = await ajustes(ctx);
    await ctx.cerrar();
    ctx = await abrirContexto('trabajo', { dbManager, proyecto: P, chainFile: 'w.sqlchain', fuera: false, limites: null });
    const b = await ajustes(ctx);
    comprobar('una base de trabajo reutilizada vuelve a lo de serie sin límites', Number(a.t) === l.hilos && Number(b.t) === nucleos, `${a.t} → ${b.t}`);
    await ctx.cerrar();
    ctx = await abrirContexto('proyecto', { dbManager, proyecto: P, chainFile: 'p.sqlchain', fuera: false, limites: l });
    comprobar('la base del proyecto (la de la interfaz) no se limita, y se dice', ctx.limites?.aplicados === false && ctx.limites.motivo === 'proyecto', JSON.stringify(ctx.limites));

    console.log('\nuna ejecución programada, con la aplicación abierta');
    arrancarProgramador({ reloj: true, avisar: () => {}, cadaMs: 3600000 });
    const proceso = { name: 'Fondo', config: { base: 'memoria' }, edges: [], nodes: [{ id: 'q', type: 'sql_inline', label: 'Algo', config: { query: 'SELECT 1 AS x' } }] };
    r = await ejecutarProceso({ dbManager, chainDef: proceso, proyecto: P, chainFile: 'fondo.sqlchain', origen: 'programada' });
    const ficha = await get(`/api/ejecuciones/${r.runId}`);
    comprobar('la ficha dice con qué límites corrió', ficha.limites?.aplicados === true && ficha.limites.hilos === Math.max(1, Math.floor(nucleos / 2)), JSON.stringify(ficha.limites));
    r = await ejecutarProceso({ dbManager, chainDef: proceso, proyecto: P, chainFile: 'fondo.sqlchain', origen: 'interfaz' });
    comprobar('desde la interfaz, sin límites', !(await get(`/api/ejecuciones/${r.runId}`)).limites);

    console.log('\nun paso HTTP');
    const CSV = 'id,tienda\n1,norte\n2,sur\n';
    let peticiones = 0;
    const servidor = http.createServer((req, res) => {
        const ruta = decodeURIComponent(req.url.split('?')[0]);
        if (ruta === '/inestable.csv') {
            peticiones++;
            // El motor ya intenta 4 veces (1 + 3): las 6 primeras peticiones fallan,
            // así que el primer intento de AmoxSQL falla entero y el segundo sale bien.
            if (peticiones <= 6) { res.writeHead(503); return res.end('busy'); }
        } else if (ruta !== "/it's.csv") { res.writeHead(404); return res.end('no'); }
        res.writeHead(200, { 'Content-Type': 'text/csv', 'Content-Length': Buffer.byteLength(CSV) });
        res.end(req.method === 'HEAD' ? undefined : CSV);
    });
    await new Promise(res => servidor.listen(0, '127.0.0.1', res));
    const pu = servidor.address().port;
    const conHttp = (url, reintentos) => ({ name: 'Red', config: { base: 'memoria' }, edges: [], nodes: [{ id: 'h', type: 'http_fetch', label: 'Descarga', config: { url, tableName: 'd', format: 'csv', ...(reintentos ? { reintentos } : {}) } }] });
    r = await post('/api/chains/run', { chainFile: 'red.sqlchain', chainDefinition: conHttp(`http://127.0.0.1:${pu}/inestable.csv`, { veces: 3, esperaSegundos: 1 }) });
    let f = await get(`/api/ejecuciones/${r.runId}`);
    const paso = (f.pasos || []).find(p => p.tipo === 'http_fetch');
    comprobar('un servidor que da 503 varias veces: termina, y la ficha cuenta los reintentos', r.status === 'completed' && paso?.reintentos >= 1, `${r.status} · ${JSON.stringify(paso)} · ${peticiones} peticiones`);
    const t0 = Date.now();
    r = await post('/api/chains/run', { chainFile: 'red.sqlchain', chainDefinition: conHttp(`http://127.0.0.1:${pu}/no-existe.csv`, { veces: 3, esperaSegundos: 5 }) });
    comprobar('un 404 no se reintenta (falla enseguida)', r.status === 'failed' && Date.now() - t0 < 4000 && !/tried/.test(r.error || ''), `${Date.now() - t0} ms · ${r.error}`);
    r = await post('/api/chains/run', { chainFile: 'red.sqlchain', chainDefinition: conHttp(`http://127.0.0.1:${pu}/it's.csv`) });
    comprobar("una URL con comilla ya no rompe el SQL", r.status === 'completed', JSON.stringify(r).slice(0, 300));
    servidor.close();

    console.log('\ndbt de fondo');
    const { crearEntornoFalso } = require(path.join(RAIZ, 'scripts/ayudas/dbtFalso.cjs'));
    const { carpeta } = crearEntornoFalso(TMP, `setTimeout(() => { console.log('PRIORIDAD', require('os').getPriority()); }, 800);`);
    fs.writeFileSync(path.join(P, 'dbt_project.yml'), "name: x\nversion: '1.0'\nprofile: x\n");
    const { correr } = require(path.join(RAIZ, 'server/dbt/correr.js'));
    const prioridad = async (baja) => {
        const out = [];
        await correr({ raiz: P, args: ['debug'], entorno: { tipo: 'python', ruta: carpeta }, alLinea: (x) => out.push(x.texto), prioridadBaja: baja });
        return out.join('\n');
    };
    let o = await prioridad(true);
    comprobar('de fondo, por debajo de lo normal (y lo dice)', o.includes(`PRIORIDAD ${os.constants.priority.PRIORITY_BELOW_NORMAL}`) && /low priority/.test(o), o);
    o = await prioridad(false);
    comprobar('desde la interfaz, normal', o.includes(`PRIORIDAD ${os.constants.priority.PRIORITY_NORMAL}`), o);

    await baseCentral.cerrar();
} catch (x) {
    fallos++;
    console.log('  FALLA inesperado:', x.stack || x.message);
}

console.log(`\n${pasadas} pasadas, ${fallos} fallos`);
process.exit(fallos ? 1 : 0);
