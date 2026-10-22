/**
 * Fase 0.6 de la 5.13 (Dec-43): qué dice el motor cuando la red falla, para
 * reintentar sólo lo pasajero.
 *
 *     node scripts/poc513/p03_red.mjs
 *
 * Un servidor local que responde 200, 503, 429, 404, 401, que tarda más que el
 * tiempo de espera, o que corta la conexión a medias; y un puerto cerrado. Para cada
 * uno: el mensaje del motor al leer un CSV por HTTP, si el propio motor ya reintenta
 * (y cuántas veces), y cuánto tarda en rendirse.
 */
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);
const { crearInstancia } = require(path.join(RAIZ, 'server/motor.js'));
const anota = (t, ok, d = '') => console.log(`${ok ? 'SI ' : 'NO '} ${t}${d ? `  — ${String(d).slice(0, 300)}` : ''}`);
const dato = (t, d) => console.log(`··  ${t}: ${d}`);

const CSV = 'id,tienda\n1,norte\n2,sur\n';
const visitas = {};
let falla503 = 0;
const servidor = http.createServer((req, res) => {
    const ruta = req.url.split('?')[0];
    visitas[ruta] = (visitas[ruta] || 0) + 1;
    const ok = () => { res.writeHead(200, { 'Content-Type': 'text/csv', 'Content-Length': Buffer.byteLength(CSV) }); res.end(req.method === 'HEAD' ? undefined : CSV); };
    switch (ruta) {
        case '/ok.csv': return ok();
        case '/503.csv': res.writeHead(503); return res.end('busy');
        case '/429.csv': res.writeHead(429, { 'Retry-After': '1' }); return res.end('slow down');
        case '/404.csv': res.writeHead(404); return res.end('no');
        case '/401.csv': res.writeHead(401); return res.end('who');
        case '/lento.csv': return; // nunca contesta
        case '/corta.csv': res.writeHead(200, { 'Content-Type': 'text/csv', 'Content-Length': 100000 }); res.write('id,tienda\n1,no'); return setTimeout(() => req.socket.destroy(), 50);
        case '/503-dos-veces.csv': if (++falla503 <= 2) { res.writeHead(503); return res.end('busy'); } return ok();
        default: res.writeHead(500); return res.end();
    }
});
await new Promise(r => servidor.listen(0, '127.0.0.1', r));
const puerto = servidor.address().port;
const cerrado = await new Promise(r => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });

const inst = await crearInstancia(':memory:');
const con = await inst.connect();
const q = async (sql) => (await con.runAndReadAll(sql)).getRowObjectsJson();
await q('INSTALL httpfs; LOAD httpfs');
const ajustes = await q(`SELECT name, value FROM duckdb_settings() WHERE name LIKE 'http%' ORDER BY name`);
dato('ajustes http del motor', ajustes.map(a => `${a.name}=${a.value}`).join(', '));
await q(`SET http_timeout = 3`);

const casos = [
    ['ok.csv', 'responde bien'],
    ['503.csv', '503 ocupado'],
    ['429.csv', '429 demasiadas peticiones'],
    ['404.csv', '404 no existe'],
    ['401.csv', '401 sin permiso'],
    ['lento.csv', 'no contesta (tiempo agotado)'],
    ['corta.csv', 'corta la conexión a medias'],
    ['503-dos-veces.csv', '503 dos veces y luego bien'],
];
const resultado = {};
for (const [archivo, titulo] of casos) {
    const t = performance.now();
    let error = null, filas = null;
    try { filas = (await q(`SELECT count(*) AS n FROM read_csv('http://127.0.0.1:${puerto}/${archivo}')`))[0].n; } catch (e) { error = e.message.split('\n')[0]; }
    const ms = Math.round(performance.now() - t);
    resultado[archivo] = { error, ms, visitas: visitas[`/${archivo}`] || 0 };
    dato(titulo, `${error ? `ERROR «${error}»` : `${filas} filas`} · ${ms} ms · ${visitas[`/${archivo}`] || 0} peticiones`);
}
{
    const t = performance.now();
    let error = null;
    try { await q(`SELECT count(*) FROM read_csv('http://127.0.0.1:${cerrado}/x.csv')`); } catch (e) { error = e.message.split('\n')[0]; }
    resultado.cerrado = { error, ms: Math.round(performance.now() - t) };
    dato('puerto cerrado (sin red / servidor caído)', `ERROR «${error}» · ${resultado.cerrado.ms} ms`);
}

console.log('\nlo que decide Dec-43');
anota('el motor ya reintenta por su cuenta un 503', resultado['503.csv'].visitas > 1, `${resultado['503.csv'].visitas} peticiones`);
anota('…y por eso «503 dos veces y luego bien» ya funciona sin AmoxSQL', !resultado['503-dos-veces.csv'].error, JSON.stringify(resultado['503-dos-veces.csv']));
anota('un 404 no se reintenta', resultado['404.csv'].visitas === 1 || resultado['404.csv'].visitas === 2, `${resultado['404.csv'].visitas} peticiones`);
// La clasificación que irá al código: pasajero (se reintenta) o definitivo.
const pasajero = (m) => /HTTP (429|5\d\d)\b|Timeout was reached|Could not connect|Server returned nothing|Connection reset|Failed to read connection/i.test(m || '');
const esperado = { '503.csv': true, '429.csv': true, '404.csv': false, '401.csv': false, 'lento.csv': true, 'corta.csv': true, cerrado: true };
const clasif = Object.entries(esperado).map(([k, v]) => [k, pasajero(resultado[k].error) === v]);
anota('pasajero (503, 429, sin respuesta, cortado, sin conexión) o definitivo (404, 401), por el mensaje', clasif.every(([, ok]) => ok), clasif.map(([k, ok]) => `${k}:${ok ? 'ok' : 'MAL'}`).join(' '));
dato('lo que ya cubre el motor', `${ajustes.find(a => a.name === 'http_retries')?.value} reintentos con espera ${ajustes.find(a => a.name === 'http_retry_wait_ms')?.value} ms × ${ajustes.find(a => a.name === 'http_retry_backoff')?.value}: unos 2 s. Una caída de minutos, no`);

servidor.close();
process.exit(0);
