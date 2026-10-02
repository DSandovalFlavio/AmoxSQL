/**
 * Publicar un archivo (C6), fase 6 del plan de la 5.10.
 *
 *     node scripts/probarPublicar.mjs
 *
 *   - Un nodo Publish escribe el Parquet con su esquema y su fecha dentro, y lo
 *     registra como fuente del workspace: otro proyecto lo lee por su nombre.
 *   - Un lector con el archivo en uso mientras se publica nunca ve medio
 *     archivo (lecturas en bucle durante varias publicaciones).
 *   - Un esquema roto (columna que se va, tipo que cambia) no se publica: el
 *     archivo anterior queda intacto y la línea de comandos sale con 1. Añadir
 *     columnas se permite; «avisar» publica y lo dice.
 *   - Con el destino abierto por otro programa: reintenta, y si sigue, falla
 *     diciendo quién lo tiene (si Office lo dice) y sin dejar el temporal.
 *   - CSV se publica sin garantía de esquema.
 *   - La frescura: «avisar si tiene más de N días».
 *   - Los metadatos se leen del propio archivo, sin la base de quien publicó.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ESTE = fileURLToPath(import.meta.url);
const RAIZ = path.resolve(path.dirname(ESTE), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'amox-publicar-'));
const HOME = path.join(TMP, 'home');
fs.mkdirSync(HOME, { recursive: true });
process.env.AMOXSQL_HOME = HOME;
process.env.AMOXSQL_LLAVERO_DE_PRUEBA = '1';

const require = createRequire(import.meta.url);
const { DuckDBInstance } = require('@duckdb/node-api');
const { startServer, atenderOrden } = require(path.join(RAIZ, 'server/index.js'));
const baseCentral = require(path.join(RAIZ, 'server/central/BaseCentral.js'));
const { leerPublicacion } = require(path.join(RAIZ, 'server/publicar.js'));
// Los lectores de la prueba nacen como los de AmoxSQL (sin la caché de archivos del motor).
const { crearInstancia } = require(path.join(RAIZ, 'server/motor.js'));
const { port } = await startServer(0);
for (let i = 0; i < 100 && !baseCentral.estaAbierta(); i++) await new Promise(r => setTimeout(r, 100));
const u = (p) => `http://localhost:${port}${p}`;
const pedir = (m) => (p, b) => fetch(u(p), { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined })
    .then(async r => ({ status: r.status, ...(await r.json().catch(() => ({}))) }));
const get = pedir('GET'), post = pedir('POST'), put = pedir('PUT');
const consulta = async (sql) => {
    await get('/api/fuentes');
    const r = await post('/api/query', { query: sql });
    return r.data || { error: r.error };
};
const fwd = (p) => p.split(path.sep).join('/');

let pasadas = 0, fallos = 0;
const comprobar = (titulo, ok, detalle = '') => {
    if (ok) { pasadas++; console.log(`  ok    ${titulo}`); }
    else { fallos++; console.log(`  FALLA ${titulo}${detalle ? ' — ' + detalle : ''}`); }
};
const escribir = (ruta, texto) => { fs.mkdirSync(path.dirname(ruta), { recursive: true }); fs.writeFileSync(ruta, texto); };

const A = path.join(TMP, 'preparacion');
const B = path.join(TMP, 'tablero');
const COMPARTIDO = path.join(TMP, 'Compartido');
const PUBLICADO = path.join(COMPARTIDO, 'ventas-limpias.parquet');
escribir(path.join(A, 'datos', 'ventas.csv'), 'tienda,importe,unidades\nnorte,10,1\nsur,20,2\ncentro,30,3\n');
fs.mkdirSync(B, { recursive: true });

const cadena = (nodoPublicar, consultaSql = 'SELECT tienda, importe::DOUBLE AS importe, unidades FROM read_csv(\'datos/ventas.csv\')') => ({
    version: '1.0', name: 'limpiar', config: { base: 'memoria' },
    nodes: [
        { id: 'a', type: 'sql_inline', label: 'Limpiar', config: { query: consultaSql } },
        { id: 'b', type: 'publicar', label: 'Publicar', config: { fuente: 'ventas-limpias', carpeta: COMPARTIDO, formato: 'parquet', ...nodoPublicar } },
    ],
    edges: [{ id: 'e', source: 'a', target: 'b' }], variables: {},
});
const correr = (c) => post('/api/chains/run', { chainDefinition: c, chainFile: 'limpiar.sqlchain' });

try {
    const w = await post('/api/workspaces', { nombre: 'Tiendas del Norte' });
    for (const p of [B, A]) {
        await post('/api/project/open', { path: p });
        await put('/api/project/workspace', { workspaceId: w.id });
    }
    await post('/api/db/connect', { path: 'a.duckdb' });

    console.log('\npublicar');
    let r = await correr(cadena({}));
    comprobar('el proceso publica', r.status === 'completed', JSON.stringify(r).slice(0, 400));
    comprobar('el archivo está, y sin temporales al lado', fs.existsSync(PUBLICADO) && !fs.readdirSync(COMPARTIDO).some(n => n.endsWith('.amoxtmp')), fs.readdirSync(COMPARTIDO).join(', '));
    const inst = await crearInstancia(':memory:');
    const con = await inst.connect();
    const db = { query: async (sql) => (await con.runAndReadAll(sql)).getRowObjectsJson() };
    let meta = await leerPublicacion(db, PUBLICADO);
    comprobar('lleva dentro la fuente, el proceso, el workspace y las filas', meta?.fuente === 'ventas-limpias' && meta.proceso === 'limpiar.sqlchain' && meta.workspace === 'Tiendas del Norte' && meta.filas === 3, JSON.stringify(meta));
    comprobar('y su esquema y su fecha', Array.isArray(meta?.esquema) && meta.esquema.map(c => c.nombre).join() === 'tienda,importe,unidades' && !!meta.publicado, JSON.stringify(meta?.esquema));
    const defW = path.join(HOME, 'workspaces', w.id, 'fuentes', 'ventas-limpias.json');
    const def = fs.existsSync(defW) ? JSON.parse(fs.readFileSync(defW, 'utf8')) : null;
    comprobar('queda registrada como fuente del workspace, publicada por el proceso', def?.publicada?.proceso === 'limpiar.sqlchain' && def.publicada.proyecto === 'preparacion', JSON.stringify(def));

    console.log('\notro proyecto la lee por su nombre');
    await post('/api/project/open', { path: B });
    let filas = await consulta('SELECT sum(importe)::INTEGER AS t FROM fuentes."ventas-limpias"');
    comprobar('fuentes."ventas-limpias" desde el proyecto que la usa', filas?.[0]?.t === 60, JSON.stringify(filas));
    r = await get('/api/fuentes/ventas-limpias/publicacion');
    comprobar('y ve de cuándo es y quién la publicó (del propio archivo)', r.publicacion?.proceso === 'limpiar.sqlchain' && r.publicacion?.filas === 3, JSON.stringify(r));
    const lista = (await get('/api/fuentes')).fuentes.find(f => f.nombre === 'ventas-limpias');
    comprobar('la lista dice que es publicada', lista?.publicada?.proceso === 'limpiar.sqlchain', JSON.stringify(lista));
    await post('/api/project/open', { path: A });

    console.log('\nun lector con el archivo en uso nunca ve medio archivo');
    const ajuste = await consulta("SELECT current_setting('enable_external_file_cache') AS v");
    comprobar('la sesión de AmoxSQL no guarda trozos de archivos (no lee uno reemplazado a medias)', ajuste?.[0]?.v === false, JSON.stringify(ajuste));
    // Una sesión aparte lee en bucle mientras se publica tres veces más.
    let leyendo = true, lecturas = 0, malas = [];
    const bucle = (async () => {
        while (leyendo) {
            try {
                const [{ n, t }] = await db.query(`SELECT count(*)::INTEGER AS n, sum(importe)::INTEGER AS t FROM read_parquet('${fwd(PUBLICADO)}')`);
                lecturas++;
                if (!((n === 3 && t === 60) || (n === 4 && t === 100))) malas.push(`${n}/${t}`);
            } catch (e) { malas.push(String(e.message).split('\n')[0]); }
            await new Promise(r2 => setTimeout(r2, 5));
        }
    })();
    escribir(path.join(A, 'datos', 'ventas.csv'), 'tienda,importe,unidades\nnorte,10,1\nsur,20,2\ncentro,30,3\neste,40,4\n');
    const resultados = [];
    for (let i = 0; i < 3; i++) resultados.push(await correr(cadena({})));
    leyendo = false;
    await bucle;
    comprobar('las tres publicaciones terminan (reintentando si el lector tenía el archivo)', resultados.every(x => x.status === 'completed'), JSON.stringify(resultados.map(x => x.status || x.error)));
    comprobar(`ninguna de las ${lecturas} lecturas vio medio archivo`, lecturas > 5 && malas.length === 0, malas.slice(0, 3).join(' | '));

    console.log('\nun esquema roto no se publica');
    const antes = fs.readFileSync(PUBLICADO);
    r = await correr(cadena({}, `SELECT tienda, importe::DOUBLE AS importe FROM read_csv('datos/ventas.csv')`));
    comprobar('quitar una columna detiene la publicación', r.status === 'failed' && /breaks whoever reads it: unidades \(removed\)/.test(JSON.stringify(r)), JSON.stringify(r).slice(0, 400));
    comprobar('el archivo anterior queda intacto', Buffer.compare(antes, fs.readFileSync(PUBLICADO)) === 0);
    r = await correr(cadena({}, `SELECT tienda, importe::VARCHAR AS importe, unidades FROM read_csv('datos/ventas.csv')`));
    comprobar('cambiar el tipo de una columna, también', r.status === 'failed' && /importe \(type DOUBLE → VARCHAR\)/.test(JSON.stringify(r)), JSON.stringify(r).slice(0, 400));
    const proceso = path.join(A, 'roto.sqlchain');
    fs.writeFileSync(proceso, JSON.stringify(cadena({}, `SELECT tienda FROM read_csv('datos/ventas.csv')`)));
    const res = await atenderOrden({ id: 'publicar-roto', proceso, proyecto: A, parametros: {} });
    const registro = fs.existsSync(res.registro || '') ? fs.readFileSync(res.registro, 'utf8') : '';
    comprobar('por la línea de comandos sale con 1, y el registro dice por qué', res.codigo === 1 && /breaks whoever reads it/.test(registro), `${res.codigo} | ${registro.slice(-300)}`);
    r = await correr(cadena({}, `SELECT tienda, importe::DOUBLE AS importe, unidades, 'mx' AS pais FROM read_csv('datos/ventas.csv')`));
    meta = await leerPublicacion(db, PUBLICADO);
    comprobar('añadir una columna se publica', r.status === 'completed' && meta?.esquema?.some(c => c.nombre === 'pais'), JSON.stringify(r).slice(0, 200));
    r = await correr(cadena({ esquemaRoto: 'avisar' }, `SELECT tienda, importe::DOUBLE AS importe FROM read_csv('datos/ventas.csv')`));
    // El aviso queda en el resumen del nodo, en el historial de la ejecución.
    const detalle = r.runId ? await get(`/api/chains/run/${r.runId}/status`) : {};
    const resumen = JSON.stringify(detalle.nodeRuns || detalle);
    comprobar('con «avisar», publica y lo dice', r.status === 'completed' && /Schema changed: unidades \(removed\), pais \(removed\)/.test(resumen), resumen.slice(0, 400));

    console.log('\nel destino abierto por otro programa');
    // Office deja ~$<nombre> con el usuario que lo tiene abierto.
    fs.writeFileSync(path.join(COMPARTIDO, '~$ventas-limpias.parquet'), Buffer.concat([Buffer.from([8]), Buffer.from('Mariana ', 'latin1'), Buffer.alloc(40)]));
    const congelado = fs.readFileSync(PUBLICADO);      // antes del bloqueo: después ni se puede leer
    const bloqueo = spawn('powershell.exe', ['-NoProfile', '-Command',
        `$f = [System.IO.File]::Open('${PUBLICADO.replace(/'/g, "''")}', 'Open', 'Read', 'None'); Write-Output 'abierto'; Start-Sleep -Seconds 30; $f.Close()`],
        { stdio: ['ignore', 'pipe', 'pipe'] });
    await new Promise((ok, mal) => { bloqueo.stdout.on('data', d => { if (String(d).includes('abierto')) ok(); }); setTimeout(() => mal(new Error('sin bloqueo')), 15000); });
    const t0 = Date.now();
    r = await correr(cadena({ esquemaRoto: 'avisar' }));
    const ms = Date.now() - t0;
    bloqueo.kill();
    await new Promise(ok => bloqueo.on('exit', ok));
    comprobar('reintenta unos segundos y falla diciendo quién lo tiene', r.status === 'failed' && /Mariana has it open/.test(JSON.stringify(r)) && ms > 4000, `${ms} ms · ${JSON.stringify(r).slice(0, 300)}`);
    comprobar('sin dejar el temporal, y con el archivo como estaba', !fs.readdirSync(COMPARTIDO).some(n => n.endsWith('.amoxtmp')) && Buffer.compare(congelado, fs.readFileSync(PUBLICADO)) === 0);
    fs.rmSync(path.join(COMPARTIDO, '~$ventas-limpias.parquet'));

    console.log('\nCSV, sin garantía de esquema');
    r = await correr({ ...cadena({ fuente: 'ventas-csv', formato: 'csv' }), nodes: cadena({}).nodes.map(n => (n.type === 'publicar' ? { ...n, config: { fuente: 'ventas-csv', carpeta: COMPARTIDO, formato: 'csv' } } : n)) });
    filas = await consulta('SELECT count(*)::INTEGER AS n FROM fuentes."ventas-csv"');
    comprobar('se publica y se lee por nombre', r.status === 'completed' && filas?.[0]?.n === 4, JSON.stringify(filas));

    console.log('\nla frescura');
    const viejo = new Date(Date.now() - 3 * 86400000);
    fs.utimesSync(PUBLICADO, viejo, viejo);
    const conFrescura = { ...def, frescuraDias: 1 };
    fs.writeFileSync(defW, JSON.stringify(conFrescura));
    const f = (await get('/api/fuentes')).fuentes.find(x => x.nombre === 'ventas-limpias');
    comprobar('una fuente más vieja de lo esperado se marca, y se sigue leyendo', f?.vieja === true && f.edadDias >= 3 && f.estado === 'encontrada', JSON.stringify(f));

    console.log('\nlos metadatos viajan en el archivo');
    const copia = path.join(TMP, 'otra-maquina', 'ventas-limpias.parquet');
    fs.mkdirSync(path.dirname(copia), { recursive: true });
    fs.copyFileSync(PUBLICADO, copia);
    const otra = await crearInstancia(':memory:');
    const c2 = await otra.connect();
    meta = await leerPublicacion({ query: async (sql) => (await c2.runAndReadAll(sql)).getRowObjectsJson() }, copia);
    comprobar('una sesión que no sabe nada de quien publicó lee su fecha y su esquema', !!meta?.publicado && meta.esquema?.length >= 2 && meta.workspace === 'Tiendas del Norte', JSON.stringify(meta));
} catch (x) {
    fallos++;
    console.log('  FALLA inesperado:', x.stack || x.message);
} finally {
    try { await baseCentral.cerrar(); } catch { /* ya cerrada */ }
}

console.log(`\n${pasadas} pasadas, ${fallos} fallos`);
process.exit(fallos ? 1 : 0);
