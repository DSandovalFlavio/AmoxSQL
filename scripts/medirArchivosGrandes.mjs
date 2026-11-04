/**
 * Qué le pasa a la aplicación con archivos grandes: cuánto tarda en detenerse una
 * consulta, cuánto se congelan el servidor y la ventana, y si la ventana sobrevive.
 *
 *     node scripts/medirArchivosGrandes.mjs [--filas 6000000] [--solo A,B] [--xlsx 200000]
 *
 * Genera los archivos en una carpeta temporal y maneja Electron real con un
 * AMOXSQL_HOME temporal, como `probarInteraccion.mjs`. Necesita Vite en 5173 (si no
 * está, lo levanta). No toca la base real ni el AmoxSQL instalado.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const FILAS = Number(arg('--filas', 6000000));
const FILAS_XLSX = Number(arg('--xlsx', 200000));
const SOLO = arg('--solo', null)?.split(',');
const dormir = (ms) => new Promise(r => setTimeout(r, ms));

const CASA = fs.mkdtempSync(path.join(os.tmpdir(), 'amox-grandes-'));
const PROYECTO = path.join(CASA, 'proyecto');
fs.mkdirSync(PROYECTO);
const barras = (p) => p.replace(/\\/g, '/');
const PARQUET = barras(path.join(PROYECTO, 'grande.parquet'));
const XLSX = barras(path.join(PROYECTO, 'grande.xlsx'));

// ── Los archivos ─────────────────────────────────────────────────────────────
console.log(`Generando ${FILAS.toLocaleString()} filas de parquet y ${FILAS_XLSX.toLocaleString()} de Excel…`);
{
    const { DuckDBInstance } = require(path.join(RAIZ, 'node_modules/@duckdb/node-api'));
    const inst = await DuckDBInstance.create(':memory:');
    const c = await inst.connect();
    const t0 = Date.now();
    await c.run(`COPY (SELECT i AS id, DATE '2020-01-01' + (i % 1500)::INT AS fecha, 'cat_' || (i % 40) AS categoria,
        md5(i::VARCHAR) AS texto, md5((i * 7)::VARCHAR) AS texto2, random() * 1000 AS valor, (i % 97)::INT AS unidades
        FROM range(${FILAS}) t(i)) TO '${PARQUET}' (FORMAT parquet)`);
    await c.run('INSTALL excel; LOAD excel;').catch(() => {});
    let hayXlsx = true;
    try {
        await c.run(`COPY (SELECT i AS id, 'cat_' || (i % 40) AS categoria, md5(i::VARCHAR) AS texto, random() * 1000 AS valor, (i % 97)::INT AS unidades
            FROM range(${FILAS_XLSX}) t(i)) TO '${XLSX}' (FORMAT xlsx, HEADER true)`);
    } catch (e) { hayXlsx = false; console.log('  sin Excel:', e.message.split('\n')[0]); }
    console.log(`  ${(Date.now() - t0) / 1000}s · parquet ${(fs.statSync(PARQUET).size / 1e6).toFixed(0)} MB` + (hayXlsx ? ` · xlsx ${(fs.statSync(XLSX).size / 1e6).toFixed(0)} MB` : ''));
    c.disconnectSync?.();
}

// ── Arrancar ─────────────────────────────────────────────────────────────────
const hijos = [];
const shell = process.platform === 'win32';
const conectado = async (u) => { try { await fetch(u, { signal: AbortSignal.timeout(1500) }); return true; } catch { return false; } };
if (!await conectado('http://localhost:5173')) {
    hijos.push(spawn('pnpm', ['client:dev'], { cwd: RAIZ, shell, stdio: 'ignore' }));
    for (let i = 0; i < 60 && !await conectado('http://localhost:5173'); i++) await dormir(1000);
}
const PUERTO = 9346;
hijos.push(spawn(path.join(RAIZ, 'node_modules', '.bin', shell ? 'electron.cmd' : 'electron'), ['.', `--remote-debugging-port=${PUERTO}`], {
    cwd: RAIZ, shell, stdio: 'ignore',
    env: { ...process.env, AMOXSQL_HOME: path.join(CASA, 'home'), AMOXSQL_LLAVERO_DE_PRUEBA: '1' },
}));
function acabar(codigo) {
    for (const h of hijos) { try { if (shell) spawn('taskkill', ['/pid', String(h.pid), '/T', '/F'], { stdio: 'ignore' }); else h.kill(); } catch { /* ya no */ } }
    setTimeout(() => { try { fs.rmSync(CASA, { recursive: true, force: true }); } catch { /* retenido */ } process.exit(codigo); }, 2000);
}
class Pagina {
    constructor(ws) { this.ws = ws; this.n = 0; this.esperan = new Map(); ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && this.esperan.has(d.id)) { this.esperan.get(d.id)(d); this.esperan.delete(d.id); } }; }
    cdp(method, params = {}, ms = 0) {
        return new Promise(r => {
            const i = ++this.n; this.esperan.set(i, r); this.ws.send(JSON.stringify({ id: i, method, params }));
            if (ms) setTimeout(() => { if (this.esperan.delete(i)) r({ agotado: true }); }, ms);
        });
    }
    async js(cuerpo, ms = 0) {
        const r = await this.cdp('Runtime.evaluate', { expression: `(async()=>{${cuerpo}})()`, awaitPromise: true, returnByValue: true }, ms);
        if (r.agotado) return { agotado: true };
        if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'error');
        return r.result?.result?.value;
    }
}
async function abrir() {
    for (let i = 0; i < 80; i++) {
        try {
            const p = (await (await fetch(`http://127.0.0.1:${PUERTO}/json`)).json()).find(x => x.type === 'page' && !x.url.includes('popout'));
            if (p) { const ws = new WebSocket(p.webSocketDebuggerUrl); await new Promise((r, x) => { ws.onopen = r; ws.onerror = x; }); return new Pagina(ws); }
        } catch { /* aún no */ }
        await dormir(500);
    }
    throw new Error('sin ventana');
}
const AYUDAS = `window.t = { dormir: (ms) => new Promise(r => setTimeout(r, ms)),
  boton: (x) => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === x),
  fila: (x) => [...document.querySelectorAll('li,[role="listitem"]')].find(e => e.textContent.trim().startsWith(x)),
  pulsar: (el) => { for (const k of ['pointerdown','mousedown','pointerup','mouseup','click']) el.dispatchEvent(new MouseEvent(k, { bubbles: true })); },
  ed: () => monaco.editor.getEditors()[0],
};`;

// ── Medir ────────────────────────────────────────────────────────────────────
const memoria = () => {
    try {
        const t = execSync('tasklist /fi "imagename eq electron.exe" /fo csv /nh', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
        return [...t.matchAll(/"([\d.,\s]+) K"/g)].map(m => Number(m[1].replace(/\D/g, '')) / 1024).sort((x, y) => y - x).slice(0, 2).map(Math.round);
    } catch { return []; }
};

async function medir(app, puertoApi, nombre, sql, { detenerA = null, maximo = 60000 } = {}) {
    const api = `http://localhost:${puertoApi}`;
    console.log(`\n${nombre}\n  ${sql.slice(0, 90)}`);
    await app.js(`const e = t.ed(); e.executeEdits('m', [{ range: e.getModel().getFullModelRange(), text: ${JSON.stringify(sql)} }]); await t.dormir(200); return 1;`);
    let vivo = true;
    let peorServidor = 0, peorVentana = 0, picoMem = 0;
    const servidor = (async () => { while (vivo) { const a = Date.now(); try { await fetch(`${api}/api/path`, { signal: AbortSignal.timeout(90000) }); } catch { /* */ } peorServidor = Math.max(peorServidor, Date.now() - a); await dormir(200); } })();
    const ventana = (async () => { while (vivo) { const a = Date.now(); await app.js('return 1', 90000).catch(() => {}); peorVentana = Math.max(peorVentana, Date.now() - a); await dormir(200); } })();
    const mem = (async () => { while (vivo) { const m = memoria(); if (m[0]) picoMem = Math.max(picoMem, m[0]); await dormir(1500); } })();

    const t0 = Date.now();
    await app.js(`t.boton('Run').click(); return 1;`);
    let tDetener = null, respuesta = null;
    while (Date.now() - t0 < maximo) {
        await dormir(150);
        if (detenerA && !tDetener && Date.now() - t0 >= detenerA) {
            tDetener = Date.now();
            await app.js(`t.boton('Stop')?.click(); return 1;`, 30000);
        }
        const hay = await app.js(`return { run: !!t.boton('Run'), res: document.querySelector('.ep-results')?.innerText?.slice(0, 80) || '' };`, 20000);
        if (hay?.agotado) continue;
        if (hay?.run && Date.now() - t0 > 400) { respuesta = hay; break; }
    }
    const tFin = Date.now();
    // ¿Cuándo vuelve a responder el motor?
    const a = Date.now();
    const libre = await fetch(`${api}/api/query`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: 'select 1 x' }), signal: AbortSignal.timeout(120000) }).then(() => true).catch(() => false);
    const tLibre = Date.now() - a;
    vivo = false;
    await Promise.race([Promise.all([servidor, ventana, mem]), dormir(3000)]);
    const pantalla = await app.js(`return { texto: document.body.innerText.length, raiz: document.getElementById('root')?.children.length, marca: !!window.t };`, 15000).catch(() => null);
    const r = {
        total: `${((tFin - t0) / 1000).toFixed(1)}s`,
        ...(tDetener ? { deStopAInterfaz: `${((tFin - tDetener) / 1000).toFixed(1)}s` } : {}),
        motorLibreTras: `${(tLibre / 1000).toFixed(1)}s${libre ? '' : ' (NO RESPONDE)'}`,
        peorCongelacionServidor: `${(peorServidor / 1000).toFixed(1)}s`,
        peorCongelacionVentana: `${(peorVentana / 1000).toFixed(1)}s`,
        picoMemoriaMB: picoMem,
        resultado: respuesta?.res?.split('\n').slice(0, 8).join(' ').slice(0, 70) || 'NO TERMINÓ',
        pantalla: pantalla?.agotado ? 'NO RESPONDE' : (pantalla?.texto > 50 ? 'ok' : `EN BLANCO ${JSON.stringify(pantalla)}`),
    };
    console.log(r);
    return r;
}

const conFichero = (n) => `C:/${n}`;
void conFichero;

let codigo = 0;
try {
    const app = await abrir();
    for (let i = 0; i < 80; i++) { if (await app.js('return !!document.querySelector("input")').catch(() => false)) break; await dormir(500); }
    await app.js(AYUDAS);
    await app.js(`
      const i = document.querySelector('input[type=text], input:not([type])');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, ${JSON.stringify(barras(PROYECTO))});
      i.dispatchEvent(new Event('input', { bubbles: true }));
      await t.dormir(300); t.boton('Open Project')?.click(); await t.dormir(2500);
      const w = [...document.querySelectorAll('button')].find(b => b.textContent.startsWith('Workspaces'));
      if (w) { w.click(); await t.dormir(200); t.boton('Continue')?.click(); await t.dormir(800); }
      t.boton('Leave unlinked')?.click(); await t.dormir(800);
      t.boton('In-Memory')?.click(); await t.dormir(400);
      (t.boton('Start Session') || [...document.querySelectorAll('button')].find(b => /^(Start|Open|Connect)/.test(b.textContent.trim())))?.click();
      await t.dormir(3000);
      for (let k = 0; k < 8; k++) { const b = t.boton('Skip') || t.boton('Continue'); if (!b) { await t.dormir(300); if (!(t.boton('Skip') || t.boton('Continue'))) break; continue; } b.click(); await t.dormir(400); }
      document.querySelector('.ww-close-btn')?.click(); await t.dormir(300);
      [...document.querySelectorAll('button')].find(b => /New SQL|SQL Query/.test(b.textContent))?.click(); await t.dormir(1000);
      for (let k = 0; k < 6; k++) { const b = t.boton('Skip'); if (!b) break; b.click(); await t.dormir(400); }
      return 1;`);
    const puertoApi = await app.js(`return window.__API_PORT__ || 3001;`);
    console.log('API en', puertoApi, '· pestaña', await app.js(`return { tabs: document.querySelectorAll('.tab-item').length, ed: !!window.monaco?.editor.getEditors().length };`));

    const P = `'${PARQUET}'`, X = `'${XLSX}'`;
    const ESC = {
        A: ['A. Parquet con límite', `SELECT * FROM ${P}`, {}],
        B: ['B. Parquet ordenado, Stop a los 2 s', `SELECT * FROM ${P} ORDER BY texto, texto2`, { detenerA: 2000 }],
        C: ['C. Excel con límite', `SELECT * FROM read_xlsx(${X})`, {}],
        D: ['D. Excel ordenado, Stop a los 1,5 s', `SELECT * FROM read_xlsx(${X}) ORDER BY texto`, { detenerA: 1500 }],
        E: ['E. FROM-primero SIN límite (500 mil filas)', `FROM ${P} LIMIT 500000`, {}],
        F: ['F. FROM-primero SIN límite (2 M filas), Stop a los 3 s', `FROM ${P} LIMIT 2000000`, { detenerA: 3000 }],
        G: ['G. Parquet lento (ventana + orden), Stop a 1,5 s', `SELECT *, row_number() OVER (ORDER BY texto2, texto) AS r, sum(valor) OVER (PARTITION BY categoria ORDER BY texto) AS s FROM ${P} ORDER BY r DESC`, { detenerA: 1500, maximo: 120000 }],
        H: ['H. Excel entero ordenado sin tope, Stop a 2 s', `SELECT categoria, texto, row_number() OVER (ORDER BY texto) r FROM read_xlsx(${X}) ORDER BY r DESC`, { detenerA: 2000, maximo: 120000 }],
        I: ['I. Resultado de 3 M de filas sin límite', `FROM ${P} LIMIT 3000000`, { maximo: 180000 }],
        J: ['J. Resultado de 5 M de filas sin límite', `FROM ${P}`, { maximo: 240000 }],
        K: ['K. 2 M de filas que SÍ llegan a la ventana', `FROM ${P} LIMIT 2000000`, { maximo: 240000 }],
        O: ['O. Excel 1 M: tabla y luego Gráfico', `SELECT * FROM read_xlsx(${X})`, { maximo: 180000 }],
        Q: ['Q. Excel 1 M: tabla y luego Perfil', `SELECT * FROM read_xlsx(${X})`, { maximo: 180000 }],
        L: ['L. Excel 1 M con tope', `SELECT * FROM read_xlsx(${X})`, { maximo: 180000 }],
        M: ['M. Excel 1 M ordenado, Stop a 2 s', `SELECT categoria, texto, row_number() OVER (ORDER BY texto) r FROM read_xlsx(${X}) ORDER BY r DESC`, { detenerA: 2000, maximo: 180000 }],
    };
    if (SOLO?.includes('Z')) {
        console.log('Z. El proceso de la ventana muere (lo que hace una falta de memoria)');
        app.cdp('Page.crash');
        await dormir(4000);
        const r = await app.js('return document.body.innerText.length', 6000).catch(e => ({ error: e.message }));
        const lista = await (await fetch(`http://127.0.0.1:${PUERTO}/json`)).json();
        console.log('  responde:', r, '· ventanas:', lista.filter(x => x.type === 'page').map(x => x.url));
        const srv = await conectado(`http://localhost:${puertoApi}/api/path`);
        console.log('  servidor vivo:', srv);
    }
    for (const [k, [n, sql, op]] of Object.entries(ESC)) {
        if (SOLO && !SOLO.includes(k)) continue;
        await medir(app, puertoApi, n, sql, op);
        if (k === 'O' || k === 'Q') {
            const vista = k === 'O' ? 'Chart view' : 'Profile view';
            await app.js(`[...document.querySelectorAll('.rt-view-btn')].find(x => x.getAttribute('aria-label') === '${vista}').click(); return 1;`);
            await dormir(1500);
            const a = Date.now();
            const libre = await fetch(`http://localhost:${puertoApi}/api/query`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: 'select 1 x' }), signal: AbortSignal.timeout(120000) }).then(() => true).catch(() => false);
            console.log(`  al abrir ${vista}: motor libre tras ${((Date.now() - a) / 1000).toFixed(1)}s`, libre ? '' : 'NO RESPONDE', '· pestaña con Stop:', await app.js(`return !!t.boton('Stop')`));
            await app.js(`[...document.querySelectorAll('.rt-view-btn')].find(x => x.getAttribute('aria-label') === 'Table view').click(); return 1;`);
            await dormir(500);
        }
        if (k === 'K') {
            for (const vista of ['Chart view', 'Profile view']) {
                const a = Date.now();
                const r = await app.js(`const b = [...document.querySelectorAll('.rt-view-btn')].find(x => x.getAttribute('aria-label') === '${vista}'); if (!b) return 'sin botón'; b.click(); await t.dormir(300); return 'ok';`, 120000);
                let vive = null;
                for (let i = 0; i < 60; i++) { vive = await app.js(`return document.body.innerText.length`, 5000); if (!vive?.agotado) break; }
                console.log(`  ${vista}: ${((Date.now() - a) / 1000).toFixed(1)}s`, r, 'texto en pantalla:', vive, 'memoria', memoria());
                await dormir(4000);
            }
            const a = Date.now();
            const v = await app.js(`const n = document.body.innerText.length; const r = document.getElementById('root')?.children.length; return { n, r, mem: Math.round(performance.memory?.usedJSHeapSize / 1e6), lim: Math.round(performance.memory?.jsHeapSizeLimit / 1e6) };`, 60000);
            console.log('  estado final', v, `${(Date.now() - a) / 1000}s`, 'memoria', memoria());
        }
    }
} catch (e) {
    console.log('SE CAYÓ:', e.message);
    codigo = 1;
}
acabar(codigo);
