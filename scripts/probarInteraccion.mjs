/**
 * La interacción entre pestañas, en la aplicación de verdad (plan 5.19, tanda 1).
 *
 *     node scripts/probarInteraccion.mjs           todo
 *     node scripts/probarInteraccion.mjs --puro    solo los módulos puros
 *     node scripts/probarInteraccion.mjs --solo fase2
 *
 * Lanza Electron con un AMOXSQL_HOME TEMPORAL y un proyecto de usar y tirar, y lo
 * maneja por el protocolo de depuración. No toca la base real ni el AmoxSQL
 * instalado. Necesita Vite en 5173: si no está, lo levanta.
 *
 * Límite: estas teclas no pasan por el teclado físico ni por la capa de ventanas.
 * Bloq Mayús real, las distribuciones y las regiones de arrastre se miran a mano.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const url = (p) => pathToFileURL(path.join(RAIZ, 'client', 'src', p)).href;
const args = process.argv.slice(2);
const SOLO = args.includes('--solo') ? args[args.indexOf('--solo') + 1] : null;

let ok = 0, mal = 0;
const bien = (nombre, cond, detalle = '') => {
    cond ? ok++ : mal++;
    console.log(`${cond ? '  ok ' : '  MAL'} ${nombre}${cond || detalle === '' ? '' : ` → ${typeof detalle === 'string' ? detalle : JSON.stringify(detalle)}`}`);
};
const dormir = (ms) => new Promise(r => setTimeout(r, ms));

// ── Módulos puros ───────────────────────────────────────────────────────────
console.log('— la cola de ejecución');
{
    const { crearCola, marcaAlTerminar } = await import(url('utils/colaDeEjecucion.js'));
    const estados = {}, cancelados = [];
    const cola = crearCola({
        alCambiar: (id, info) => { estados[id] = info; },
        nombreDe: (id) => `${id}.sql`,
        cancelarEnServidor: (q) => cancelados.push(q),
    });
    const abierto = () => { let fin; const p = new Promise(r => { fin = r; }); return { p, fin }; };
    const a = abierto(), b = abierto();
    const ra = cola.poner('A', ({ ponerQueryId }) => { ponerQueryId('qa'); return a.p; });
    await dormir(0);
    const rb = cola.poner('B', () => b.p);
    await dormir(0);
    bien('la primera corre', estados.A?.estado === 'corriendo');
    bien('la segunda espera y sabe a quién', estados.B?.estado === 'en_espera' && estados.B.tras === 'A.sql', estados.B);
    bien('otra de la misma pestaña no entra', (await cola.poner('A', () => 1)).yaEnMarcha === true);
    const rc = cola.poner('C', () => 'c');
    bien('cancelar la que espera no toca a la que corre', cola.cancelar('C') && (await rc).cancelled && estados.A?.estado === 'corriendo');
    bien('cancelar la que corre interrumpe SU consulta', cola.cancelar('A') && cancelados[0] === 'qa' && cancelados.length === 1);
    a.fin({ cancelled: true });
    await ra;
    await dormir(0);
    bien('al acabar, entra la siguiente', estados.A === null && estados.B?.estado === 'corriendo', estados);
    b.fin({ data: [] });
    bien('devuelve lo que devolvió el trabajo', Array.isArray((await rb).data));
    await dormir(0);
    bien('queda vacía', cola.pestanas().length === 0);
    const r = await cola.poner('D', () => { throw new Error('boom'); });
    const r2 = await cola.poner('E', () => 'sigue');
    bien('un trabajo que revienta no la para', r.error === 'boom' && r2 === 'sigue');
    bien('la marca al terminar', marcaAlTerminar({ data: [] }) === 'ok' && marcaAlTerminar({ error: 'x' }) === 'error'
        && marcaAlTerminar({ script: true, failCount: 1 }) === 'error' && marcaAlTerminar({ cancelled: true }) === null);
}

if (args.includes('--puro')) { console.log(`\n${ok} bien, ${mal} mal`); process.exit(mal ? 1 : 0); }

// ── Arrancar la aplicación ──────────────────────────────────────────────────
const CASA = fs.mkdtempSync(path.join(os.tmpdir(), 'amox-interaccion-'));
const PROYECTO = path.join(CASA, 'proyecto');
fs.mkdirSync(PROYECTO);
const LENTA = 'SELECT count(*) AS n FROM range(100000000000) a WHERE a.range % 7 = 0;\n';
fs.writeFileSync(path.join(PROYECTO, 'uno.sql'), 'SELECT i AS id, i * 2 AS doble FROM range(200) t(i);\n');
fs.writeFileSync(path.join(PROYECTO, 'dos.sql'), "SELECT 'x' AS letra, 1 AS valor;\n");
fs.writeFileSync(path.join(PROYECTO, 'tres.sql'), 'SELECT 3 AS tres;\n');

const hijos = [];
const conectado = async (u) => { try { await fetch(u, { signal: AbortSignal.timeout(1500) }); return true; } catch { return false; } };
const shell = process.platform === 'win32';
if (!await conectado('http://localhost:5173')) {
    hijos.push(spawn('pnpm', ['client:dev'], { cwd: RAIZ, shell, stdio: 'ignore' }));
    for (let i = 0; i < 60 && !await conectado('http://localhost:5173'); i++) await dormir(1000);
}
const PUERTO = 9345;
const electron = spawn(path.join(RAIZ, 'node_modules', '.bin', shell ? 'electron.cmd' : 'electron'), ['.', `--remote-debugging-port=${PUERTO}`], {
    cwd: RAIZ, shell, stdio: 'ignore',
    env: { ...process.env, AMOXSQL_HOME: path.join(CASA, 'home'), AMOXSQL_LLAVERO_DE_PRUEBA: '1' },
});
hijos.push(electron);

function acabar(codigo) {
    for (const h of hijos) {
        try {
            if (shell) spawn('taskkill', ['/pid', String(h.pid), '/T', '/F'], { stdio: 'ignore' });
            else h.kill();
        } catch { /* ya no está */ }
    }
    setTimeout(() => {
        try { fs.rmSync(CASA, { recursive: true, force: true }); } catch { /* lo retiene el sistema un rato */ }
        process.exit(codigo);
    }, 1500);
}

// ── Protocolo de depuración ─────────────────────────────────────────────────
class Pagina {
    constructor(ws) { this.ws = ws; this.n = 0; this.esperan = new Map();
        ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && this.esperan.has(d.id)) { this.esperan.get(d.id)(d); this.esperan.delete(d.id); } }; }
    cdp(method, params = {}) { return new Promise(r => { const i = ++this.n; this.esperan.set(i, r); this.ws.send(JSON.stringify({ id: i, method, params })); }); }
    async js(cuerpo) {
        const r = await this.cdp('Runtime.evaluate', { expression: `(async()=>{${cuerpo}})()`, awaitPromise: true, returnByValue: true });
        if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'error en la página');
        return r.result?.result?.value;
    }
    async tecla(combo) {
        const partes = combo.toLowerCase().split('+'); const k = partes.pop();
        const modifiers = (partes.includes('alt') ? 1 : 0) | (partes.includes('ctrl') ? 2 : 0) | (partes.includes('shift') ? 8 : 0);
        const ESP = { enter: ['Enter', 'Enter', 13], escape: ['Escape', 'Escape', 27], tab: ['Tab', 'Tab', 9] };
        const [key, code, vk] = ESP[k] || [partes.includes('shift') ? k.toUpperCase() : k, `Key${k.toUpperCase()}`, k.toUpperCase().charCodeAt(0)];
        const base = { modifiers, key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk };
        await this.cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base });
        await this.cdp('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
    }
    escribir(text) { return this.cdp('Input.insertText', { text }); }
}
const paginas = async () => (await (await fetch(`http://127.0.0.1:${PUERTO}/json`)).json()).filter(p => p.type === 'page');
async function abrir(filtro) {
    for (let i = 0; i < 60; i++) {
        try {
            const p = (await paginas()).find(filtro);
            if (p) {
                const ws = new WebSocket(p.webSocketDebuggerUrl);
                await new Promise((r, x) => { ws.onopen = r; ws.onerror = x; });
                return new Pagina(ws);
            }
        } catch { /* todavía no */ }
        await dormir(500);
    }
    throw new Error('la ventana no apareció');
}
const AYUDAS = `window.t = {
  dormir: (ms) => new Promise(r => setTimeout(r, ms)),
  boton: (x) => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === x),
  item: (n) => [...document.querySelectorAll('.tab-item')].find(e => e.querySelector('.tab-label')?.textContent.trim() === n),
  pulsar: (el) => { for (const k of ['pointerdown','mousedown','pointerup','mouseup','click']) el.dispatchEvent(new MouseEvent(k, { bubbles: true })); },
  fila: (x) => [...document.querySelectorAll('li,[role="listitem"]')].find(e => e.textContent.trim().startsWith(x)),
  ir: async (n) => { t.pulsar(t.item(n)); await t.dormir(500); },
  ed: () => monaco.editor.getEditors()[0],
  alto: () => Math.round(document.querySelector('.ep-results')?.getBoundingClientRect().height || 0),
  redim: async (y) => { const r = document.querySelector('.ep-resizer'); const b = r.getBoundingClientRect(); r.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: b.x + 5, clientY: b.y + 2 })); window.dispatchEvent(new MouseEvent('mousemove', { clientX: b.x + 5, clientY: y })); window.dispatchEvent(new MouseEvent('mouseup', { clientX: b.x + 5, clientY: y })); await t.dormir(300); return t.alto(); },
  esperarRun: async () => { for (let i = 0; i < 60 && !t.boton('Run'); i++) await t.dormir(200); return !!t.boton('Run'); },
};`;

let hubo = null;
try {
    const app = await abrir(p => !p.url.includes('popout=true'));
    for (let i = 0; i < 60; i++) { if (await app.js('return !!document.querySelector("input")').catch(() => false)) break; await dormir(500); }
    await app.js(AYUDAS);

    // ── El tour no deja escribir detrás ──────────────────────────────────────
    await app.js(`
      const i = document.querySelector('input[type=text], input:not([type])');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, ${JSON.stringify(PROYECTO.replace(/\\/g, '/'))});
      i.dispatchEvent(new Event('input', { bubbles: true }));
      await t.dormir(300); t.boton('Open Project')?.click(); await t.dormir(2500);
      const w = [...document.querySelectorAll('button')].find(b => b.textContent.startsWith('Workspaces'));
      if (w) { w.click(); await t.dormir(200); t.boton('Continue')?.click(); await t.dormir(800); }
      t.boton('Leave unlinked')?.click(); await t.dormir(800);
      t.boton('In-Memory')?.click(); await t.dormir(400);
      (t.boton('Start Session') || t.boton('Start') || [...document.querySelectorAll('button')].find(b => /^(Start|Open|Connect)/.test(b.textContent.trim())))?.click();
      await t.dormir(3000);`);
    for (let i = 0; i < 20 && !await app.js('return !!document.querySelector(".ob-overlay")'); i++) await dormir(300);
    console.log('— el tour');
    const tour = await app.js(`return { hay: !!document.querySelector('.ob-overlay'), dentro: !!document.activeElement?.closest?.('.ob-overlay') };`);
    if (tour.hay) bien('el foco está en el tour', tour.dentro, tour);
    await app.js(`
      for (let k = 0; k < 8; k++) { const b = t.boton('Skip') || t.boton('Continue'); if (!b) { await t.dormir(300); if (!(t.boton('Skip') || t.boton('Continue'))) break; continue; } b.click(); await t.dormir(400); }
      for (const f of ['uno', 'dos', 'tres']) { const e = t.fila(f); t.pulsar(e); e.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); await t.dormir(800); }
      for (let k = 0; k < 6; k++) { const b = t.boton('Skip'); if (!b) break; b.click(); await t.dormir(400); }`);
    bien('el proyecto se abre con sus pestañas', (await app.js(`return document.querySelectorAll('.tab-item').length`)) === 3);

    const fases = { fase1, fase2, fase3, fase4 };
    for (const [n, f] of Object.entries(fases)) { if (!SOLO || SOLO === n) await f(app); }
} catch (e) {
    hubo = e;
    console.log('  MAL la prueba se cayó →', e.message);
    mal++;
    try {
        const app = await abrir(p => !p.url.includes('popout=true'));
        console.log('  pantalla:', JSON.stringify(await app.js('return document.body.innerText.slice(0, 500)')));
    } catch { /* sin ventana */ }
}
console.log(`\n${ok} bien, ${mal} mal`);
acabar(mal ? 1 : 0);

// ── Fase 1: que nada se pierda ni se bloquee ────────────────────────────────
async function fase1(app) {
    const textoDe = (t) => `t.ed().executeEdits('p', [{ range: t.ed().getModel().getFullModelRange(), text: ${JSON.stringify(t)} }])`.replace(/t\.ed\(\)/g, 't.ed()');
    console.log('— una consulta por pestaña');
    await app.js(`await t.ir('uno.sql'); ${textoDe(LENTA)}; await t.dormir(200); t.boton('Run').click(); await t.dormir(500);`);
    let e = await app.js(`return { stop: !!t.boton('Stop'), icono: !!t.item('uno.sql').querySelector('.tab-ejecucion') };`);
    bien('la pestaña que corre enseña Stop y su indicador', e.stop && e.icono, e);
    e = await app.js(`await t.ir('dos.sql'); return { stop: !!t.boton('Stop'), run: !!t.boton('Run') };`);
    bien('otra pestaña sigue teniendo Run', e.run && !e.stop, e);
    await app.js(`t.boton('Run').click(); await t.dormir(400);`);
    e = await app.js(`return { espera: document.querySelector('.ep-espera')?.innerText, icono: !!t.item('dos.sql').querySelector('.tab-ejecucion') };`);
    bien('la segunda espera y lo dice', /uno\.sql/.test(e.espera || '') && e.icono, e);
    await app.js(`document.querySelector('.ep-espera button').click(); await t.dormir(300);`);
    e = await app.js(`const a = !!document.querySelector('.ep-espera'); await t.ir('uno.sql'); return { espera: a, stop: !!t.boton('Stop') };`);
    bien('cancelar la que espera no toca a la que corre', !e.espera && e.stop, e);

    console.log('— Esc');
    await app.js(`t.ed().focus();`);
    await app.tecla('escape');
    e = await app.js(`return await t.esperarRun();`);
    bien('Esc cancela la consulta de la pestaña', e === true);
    e = await app.js(`const p = (await import('/src/api.js')).API_BASE; const r = await Promise.race([fetch(p + '/api/query', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: 'select 1 x' }) }).then(x => x.json()).then(() => 'ok'), t.dormir(4000).then(() => 'bloqueada')]); return r;`);
    bien('la conexión queda libre', e === 'ok', e);

    console.log('— la que espera entra sola y avisa');
    await app.js(`${textoDe(LENTA)}; await t.dormir(200); t.boton('Run').click(); await t.dormir(400); await t.ir('dos.sql'); t.boton('Run').click(); await t.dormir(400); await t.ir('uno.sql'); t.boton('Stop').click(); await t.ir('tres.sql');`);
    await dormir(1500);
    e = await app.js(`return { aviso: !!t.item('dos.sql').querySelector('.tab-aviso--ok'), corre: !!t.item('dos.sql').querySelector('.tab-ejecucion') };`);
    bien('terminó en segundo plano y la pestaña lo marca', e.aviso && !e.corre, e);
    e = await app.js(`await t.ir('dos.sql'); return { aviso: !!t.item('dos.sql').querySelector('.tab-aviso'), tabla: !!document.querySelector('.rt-view-btn') };`);
    bien('al volver, la marca se apaga y está el resultado', !e.aviso && e.tabla, e);

    console.log('— cerrar la pestaña');
    await app.js(`await t.ir('uno.sql'); t.boton('Run').click(); await t.dormir(400); t.item('uno.sql').querySelector('.tab-close').click(); await t.dormir(800);`);
    e = await app.js(`const p = (await import('/src/api.js')).API_BASE; return await Promise.race([fetch(p + '/api/query', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: 'select 1 x' }) }).then(() => 'ok'), t.dormir(4000).then(() => 'bloqueada')]);`);
    bien('se lleva su consulta', e === 'ok', e);
    // Reabre uno.sql con su texto de siempre para las fases siguientes.
    fs.writeFileSync(path.join(PROYECTO, 'uno.sql'), 'SELECT i AS id, i * 2 AS doble FROM range(200) t(i);\n');
    await app.js(`const e = t.fila('uno'); t.pulsar(e); e.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); await t.dormir(800);`);

    console.log('— atajos que no deben perderse');
    await app.js(`await t.ir('tres.sql'); t.ed().focus(); window.__marca = 1;`);
    const antes = await app.js(`return t.ed().getValue()`);
    await app.tecla('ctrl+k'); await dormir(400);
    e = await app.js(`return { paleta: !!document.querySelector('.command-palette'), igual: t.ed().getValue() === ${JSON.stringify(antes)} };`);
    bien('Ctrl+K en el editor abre la paleta y no reescribe el SQL', e.paleta && e.igual, e);
    await app.tecla('escape'); await dormir(300);
    await app.js(`t.ed().focus();`);
    await app.tecla('ctrl+r'); await dormir(1500);
    bien('Ctrl+R no recarga la aplicación', await app.js(`return !!window.__marca && !!window.t`).catch(() => false));
}

// ── Fase 2: la pestaña recuerda ─────────────────────────────────────────────
async function fase2(app) {
    console.log('— la altura es de la pestaña');
    await app.js(`await t.ir('uno.sql'); t.boton('Run').click(); await t.dormir(900); await t.ir('dos.sql'); t.boton('Run').click(); await t.dormir(900);`);
    let e = await app.js(`
      await t.ir('uno.sql'); const a = await t.redim(220);
      await t.ir('dos.sql'); const b = await t.redim(600);
      await t.ir('uno.sql'); const a2 = t.alto();
      await t.ir('dos.sql'); const b2 = t.alto();
      return { a, b, a2, b2 };`);
    bien('cada una conserva la suya', Math.abs(e.a - e.a2) <= 1 && Math.abs(e.b - e.b2) <= 1 && Math.abs(e.a - e.b) > 100, e);
    e = await app.js(`
      await t.ir('tres.sql'); t.boton('Run').click(); await t.dormir(900); const c = t.alto();
      await t.ir('uno.sql'); await t.redim(300);
      await t.ir('tres.sql'); return { c, c2: t.alto() };`);
    bien('una pestaña ya vista no se mueve al arrastrar en otra', Math.abs(e.c - e.c2) <= 1, e);

    console.log('— Ctrl+Z');
    await app.js(`await t.ir('tres.sql'); t.ed().focus(); t.ed().setPosition({ lineNumber: 1, column: 1 });`);
    const original = await app.js(`return t.ed().getValue();`);
    await app.escribir('-- nota\n');
    await dormir(300);
    e = await app.js(`const escrito = t.ed().getValue(); await t.ir('uno.sql'); const otra = t.ed().getValue(); await t.ir('tres.sql'); t.ed().focus(); return { escrito, otra, vuelto: t.ed().getValue() };`);
    bien('el texto de cada pestaña es el suyo', e.escrito.startsWith('-- nota') && !e.otra.includes('-- nota') && e.vuelto === e.escrito, e);
    for (let i = 0; i < 3 && (await app.js(`return t.ed().getValue();`)) !== original; i++) { await app.tecla('ctrl+z'); await dormir(250); }
    e = await app.js(`return { v: t.ed().getValue(), puede: t.ed().getModel().canUndo(), foco: t.ed().hasTextFocus(), activo: document.activeElement?.className };`);
    bien('Ctrl+Z deshace lo escrito antes de cambiar de pestaña', e.v === original, { ...e, original });
    bien('hay un modelo por pestaña', (await app.js(`return monaco.editor.getModels().filter(m => m.uri.path.includes('pestana')).length`)) >= 3);

    console.log('— la tabla');
    e = await app.js(`
      await t.ir('uno.sql');
      const fila = () => document.querySelector('.rt-content tbody tr td:nth-child(2)')?.innerText;
      const antes = fila();
      const ordenar = [...document.querySelectorAll('.rt-content th .rt-th-inner')].filter(x => x.innerText.startsWith('id'))[0];
      const pulsa = (el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      pulsa(ordenar); await t.dormir(200); pulsa(ordenar); await t.dormir(300);
      const ordenado = fila();
      const c = document.querySelector('.rt-content'); c.scrollTop = 150; await t.dormir(100); const s0 = c.scrollTop;
      await t.ir('dos.sql'); await t.ir('uno.sql'); await t.dormir(300);
      return { antes, ordenado, vuelta: fila(), s0, s1: document.querySelector('.rt-content').scrollTop };`);
    bien('el orden sobrevive', e.ordenado !== e.antes && e.vuelta === e.ordenado, e);
    bien('el scroll sobrevive', e.s0 > 0 && Math.abs(e.s0 - e.s1) <= 2, e);
    e = await app.js(`
      const fila = () => document.querySelector('.rt-content tbody tr td:nth-child(2)')?.innerText;
      const ordenado = fila(); t.boton('Run').click(); await t.dormir(1000);
      return { ordenado, tras: fila() };`);
    bien('ejecutar otra vez empieza de cero', e.tras !== e.ordenado, e);
}
async function fase3() {}
async function fase4() {}
