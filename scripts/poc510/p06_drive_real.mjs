/**
 * Recorrido real sobre una carpeta sincronizada (fase 7.2 del plan de la 5.10).
 *
 *     node scripts/poc510/p06_drive_real.mjs --carpeta "G:\My Drive"
 *
 * Con el servidor de AmoxSQL y un home TEMPORAL (no toca la base del autor):
 *   1. Un Excel «de cliente» llega a una carpeta sincronizada, escrito en varias
 *      pasadas; una fuente de tipo carpeta lo detecta (el vigilante, ¿funciona
 *      en la unidad virtual?) y lo lee con su rango.
 *   2. Un proceso de Data Flow lo limpia y lo PUBLICA en otra carpeta
 *      sincronizada, tres veces seguidas.
 *   3. Otro proyecto del mismo workspace lo lee por su nombre.
 *   4. Pasado un rato, ¿el sincronizador dejó copias de conflicto o temporales?
 * Crea `amox-prueba-<algo>` dentro de la carpeta dada y la borra al terminar.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ESTE = fileURLToPath(import.meta.url);
const RAIZ = path.resolve(path.dirname(ESTE), '..', '..');
const i = process.argv.indexOf('--carpeta');
if (i < 0) { console.error('Falta --carpeta <carpeta sincronizada>'); process.exit(2); }
const NUBE = fs.mkdtempSync(path.join(process.argv[i + 1], 'amox-prueba-'));
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'amox-drive-'));
process.env.AMOXSQL_HOME = path.join(TMP, 'home');
fs.mkdirSync(process.env.AMOXSQL_HOME, { recursive: true });
process.env.AMOXSQL_LLAVERO_DE_PRUEBA = '1';

const require = createRequire(import.meta.url);
const { startServer } = require(path.join(RAIZ, 'server/index.js'));
const baseCentral = require(path.join(RAIZ, 'server/central/BaseCentral.js'));
const { port } = await startServer(0);
for (let k = 0; k < 100 && !baseCentral.estaAbierta(); k++) await new Promise(r => setTimeout(r, 100));
const u = (p) => `http://localhost:${port}${p}`;
const pedir = (m) => (p, b) => fetch(u(p), { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined })
    .then(async r => ({ status: r.status, ...(await r.json().catch(() => ({}))) }));
const get = pedir('GET'), post = pedir('POST'), put = pedir('PUT');
const espera = (ms) => new Promise(r => setTimeout(r, ms));

let pasadas = 0, fallos = 0;
const anota = (t, ok, d = '') => { ok ? pasadas++ : fallos++; console.log(`${ok ? 'SI ' : 'NO '} ${t}${d ? `  — ${d}` : ''}`); };

// Los avisos de llegada, como los escucha la interfaz.
const avisos = [];
const ctl = new AbortController();
(async () => {
    try {
        const r = await fetch(u('/api/fuentes/llegadas'), { signal: ctl.signal });
        const lector = r.body.getReader(); const dec = new TextDecoder(); let buf = '';
        for (;;) {
            const { done, value } = await lector.read(); if (done) break;
            buf += dec.decode(value, { stream: true });
            const partes = buf.split('\n\n'); buf = partes.pop();
            for (const p of partes) if (p.startsWith('data: ')) avisos.push(JSON.parse(p.slice(6)));
        }
    } catch { /* fin */ }
})();

const ENTRADA = path.join(NUBE, 'entrada');
const PUBLICADO = path.join(NUBE, 'publicado');
fs.mkdirSync(ENTRADA, { recursive: true });
const A = path.join(TMP, 'preparacion'), B = path.join(TMP, 'tablero');
fs.mkdirSync(A, { recursive: true }); fs.mkdirSync(B, { recursive: true });

try {
    const w = await post('/api/workspaces', { nombre: 'Prueba en la nube' });
    for (const p of [B, A]) { await post('/api/project/open', { path: p }); await put('/api/project/workspace', { workspaceId: w.id }); }
    await post('/api/db/connect', { path: 'a.duckdb' });
    await post('/api/fuentes', { workspaceId: w.id, definicion: { nombre: 'reporte-cliente', tipo: 'carpeta', patron: 'reporte*.xlsx', excel: { rango: 'A4:E', rellenar: ['Tienda'] } }, ubicacionAqui: ENTRADA });
    await get('/api/fuentes');

    console.log('\n1. el Excel llega a la carpeta sincronizada, en varias pasadas');
    const xl = fs.readFileSync(path.join(RAIZ, 'scripts', 'fixtures', 'excel', 'cliente.xlsx'));
    const destinoXl = path.join(ENTRADA, 'reporte semana 39.xlsx');
    const fd = fs.openSync(destinoXl, 'w');
    const tercio = Math.ceil(xl.length / 3);
    for (let k = 0; k < 3; k++) { fs.writeSync(fd, xl.subarray(k * tercio, (k + 1) * tercio)); await espera(800); }
    fs.closeSync(fd);
    let llego = false;
    for (let k = 0; k < 60 && !llego; k++) { await espera(250); llego = avisos.some(a => a.tipo === 'llegada' && /semana 39/.test(a.archivo)); }
    anota('el vigilante ve llegar el archivo en la unidad sincronizada (un aviso)', llego && avisos.filter(a => /semana 39/.test(a.archivo || '')).length === 1, JSON.stringify(avisos.filter(a => a.tipo !== 'hola')));
    let r = await post('/api/query', { query: 'SELECT count(*)::INTEGER AS n, count(Tienda)::INTEGER AS c FROM fuentes."reporte-cliente"' });
    anota('la fuente lo lee con su rango y su relleno', r.data?.[0]?.n === 6 && r.data[0].c === 6, JSON.stringify(r).slice(0, 200));

    console.log('\n2. publicar en la carpeta sincronizada, tres veces seguidas');
    const cadena = {
        version: '1.0', name: 'limpiar', config: { base: 'memoria' },
        nodes: [
            { id: 'a', type: 'fuente', label: 'Reporte', config: { fuente: 'reporte-cliente' } },
            { id: 'b', type: 'publicar', label: 'Publicar', config: { fuente: 'ventas-limpias', carpeta: PUBLICADO, formato: 'parquet' } },
        ],
        edges: [{ id: 'e', source: 'a', target: 'b' }], variables: {},
    };
    const tiempos = [];
    for (let k = 0; k < 3; k++) {
        const t0 = Date.now();
        r = await post('/api/chains/run', { chainDefinition: cadena, chainFile: 'limpiar.sqlchain' });
        tiempos.push(`${r.status} en ${Date.now() - t0} ms`);
    }
    anota('las tres publicaciones terminan', tiempos.every(t => t.startsWith('completed')), tiempos.join(' · '));

    console.log('\n3. otro proyecto lo lee por su nombre');
    await post('/api/project/open', { path: B });
    await get('/api/fuentes');
    r = await post('/api/query', { query: 'SELECT count(*)::INTEGER AS n FROM fuentes."ventas-limpias"' });
    anota('fuentes."ventas-limpias" desde el otro proyecto', r.data?.[0]?.n === 6, JSON.stringify(r).slice(0, 200));
    r = await get('/api/fuentes/ventas-limpias/publicacion');
    anota('con su fecha y su proceso, leídos del archivo', r.publicacion?.proceso === 'limpiar.sqlchain', JSON.stringify(r).slice(0, 200));

    console.log('\n4. ¿qué deja el sincronizador? (se espera 20 s a que suba)');
    await espera(20000);
    const quedan = fs.readdirSync(PUBLICADO);
    anota('ni temporales ni copias de conflicto', quedan.length === 1 && quedan[0] === 'ventas-limpias.parquet', quedan.join(', '));
    const enEntrada = fs.readdirSync(ENTRADA);
    anota('en la carpeta de entrada sólo el Excel', enEntrada.length === 1, enEntrada.join(', '));
} catch (x) {
    fallos++;
    console.log('NO  inesperado:', x.stack || x.message);
} finally {
    ctl.abort();
    try { await baseCentral.cerrar(); } catch { /* ya cerrada */ }
    // El sincronizador puede tener la carpeta abierta unos segundos tras subirla.
    for (let k = 0; k < 10 && fs.existsSync(NUBE); k++) {
        try { fs.rmSync(NUBE, { recursive: true, force: true }); } catch { await espera(1000); }
    }
    if (fs.existsSync(NUBE)) console.log(`(no se pudo borrar ${NUBE}: bórrala a mano)`);
}
console.log(`\n${pasadas}/${pasadas + fallos} como se esperaba`);
process.exit(fallos ? 1 : 0);
