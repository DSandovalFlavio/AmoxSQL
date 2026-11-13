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

console.log('— la tabla de atajos');
{
    const { ATAJOS, atajoDe, coincide, seccionesDeAtajos } = await import(url('utils/atajos.js'));
    const tecla = (key, m = {}) => ({ key, code: m.code, ctrlKey: !!m.ctrl, shiftKey: !!m.shift, altKey: !!m.alt, metaKey: !!m.meta });
    const id = (e, mac = false) => atajoDe(e, mac)?.id;
    bien('los ids no se repiten', new Set(ATAJOS.map(a => a.id)).size === ATAJOS.length);
    bien('las teclas no se repiten', new Set(ATAJOS.map(a => a.teclas)).size === ATAJOS.length);
    bien('Ctrl+S', id(tecla('s', { ctrl: true })) === 'guardar');
    bien('Ctrl+S con Bloq Mayús', id(tecla('S', { ctrl: true })) === 'guardar');
    bien('Ctrl+Shift+S no es Ctrl+S', id(tecla('S', { ctrl: true, shift: true })) === 'guardarComo');
    bien('Ctrl+Shift+S con Bloq Mayús', id(tecla('s', { ctrl: true, shift: true })) === 'guardarComo');
    bien('Ctrl+Shift+/ en teclado de EE. UU.', id(tecla('?', { ctrl: true, shift: true, code: 'Slash' })) === 'lista');
    bien('Ctrl+Shift+/ con Shift+7', id(tecla('/', { ctrl: true, shift: true, code: 'Digit7' })) === 'lista');
    bien('Ctrl+\\ por la tecla física', id(tecla('}', { ctrl: true, code: 'Backslash' })) === 'dividir');
    bien('Ctrl+Shift+\\', id(tecla('|', { ctrl: true, shift: true, code: 'Backslash' })) === 'duplicar');
    bien('AltGr (Ctrl+Alt) no dispara un atajo', id(tecla('k', { ctrl: true, alt: true })) === undefined);
    bien('Alt+Izquierda', id(tecla('ArrowLeft', { alt: true })) === 'atras');
    bien('F5', id(tecla('F5')) === 'ejecutar2');
    bien('⌘S en Mac', id(tecla('s', { meta: true }), true) === 'guardar');
    bien('la tecla de Windows no es Ctrl', id(tecla('s', { meta: true }), false) === undefined);
    bien('Ajustes los lista', seccionesDeAtajos().flatMap(s => s.items).length === ATAJOS.length);
    const paleta = fs.readFileSync(path.join(RAIZ, 'client/src/components/CommandPalette.jsx'), 'utf8');
    const anunciadas = [...paleta.matchAll(/shortcut: '([^']+)'/g)].map(m => m[1]);
    const desconocidas = anunciadas.filter(t => !ATAJOS.some(a => a.teclas === t));
    bien('la paleta anuncia solo teclas de la tabla', desconocidas.length === 0, desconocidas);
    for (const i of ['es', 'en']) {
        const doc = fs.readFileSync(path.join(RAIZ, 'docs', i, 'reference', 'keyboard-shortcuts.md'), 'utf8');
        const faltan = seccionesDeAtajos(i).flatMap(s => s.items).filter(x => !doc.includes(`| ${x.keys.replace('\\', '\\\\')} | ${x.description} |`));
        bien(`la documentación (${i}) coincide`, faltan.length === 0, faltan.map(f => f.keys));
    }
    void coincide;
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
  // 6.0 (M5): Pop out lives in the results' «Save / Share ▾» menu.
  emergente: async () => { [...document.querySelectorAll('.rt-action-btn')].find(b => b.textContent.includes('Save / Share')).click(); await t.dormir(200); [...document.querySelectorAll('.rt-menu-guardar .toolbar-dropdown-item')].find(e => e.textContent.trim() === 'Pop out').click(); },
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
      // 6.0 (M4): which tours open by themselves in a first session.
      window.__tours = new Set();
      new MutationObserver(() => { const o = document.querySelector('.ob-overlay'); if (o) window.__tours.add((o.querySelector('[class*=brand]')?.textContent || o.innerText).trim().slice(0, 40)); })
        .observe(document.body, { childList: true, subtree: true });
      (t.boton('Start Session') || t.boton('Start') || [...document.querySelectorAll('button')].find(b => /^(Start|Open|Connect)/.test(b.textContent.trim())))?.click();
      await t.dormir(3000);`);
    for (let i = 0; i < 20 && !await app.js('return !!document.querySelector(".ob-overlay")'); i++) await dormir(300);
    console.log('— el tour');
    const tour = await app.js(`return { hay: !!document.querySelector('.ob-overlay'), dentro: !!document.activeElement?.closest?.('.ob-overlay') };`);
    if (tour.hay) bien('el foco está en el tour', tour.dentro, tour);
    await app.js(`
      for (let k = 0; k < 8; k++) { const b = t.boton('Skip') || t.boton('Continue') || t.boton('Not now') || t.boton('Skip for now') || t.boton('Maybe later'); if (!b) { await t.dormir(300); if (!(t.boton('Skip') || t.boton('Continue'))) break; continue; } b.click(); await t.dormir(400); }
      document.querySelector('.ww-close-btn')?.click(); await t.dormir(400);
      for (const f of ['uno', 'dos', 'tres']) { const e = t.fila(f); t.pulsar(e); e.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); await t.dormir(800); }
      for (let k = 0; k < 6; k++) { const b = t.boton('Skip'); if (!b) break; b.click(); await t.dormir(400); }`);
    bien('el proyecto se abre con sus pestañas', (await app.js(`return document.querySelectorAll('.tab-item').length`)) === 3);
    const tours = await app.js(`return [...window.__tours]`);
    bien('una sesión nueva abre un solo recorrido, el de bienvenida (M4)', tours.length <= 1 && tours.every(x => /Welcome/.test(x)), tours);

    // La 5 va antes que la 4, que termina cerrando la ventana principal.
    let actual = app;
    const fases = { fase1, fase2, fase3, fase6, fase7, fase5, fase4 };
    for (const [n, f] of Object.entries(fases)) { if (!SOLO || SOLO === n) actual = (await f(actual)) || actual; }
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

// Con AMOX_CAPTURAS=<carpeta>, deja una imagen de los momentos clave.
async function foto(pg, nombre) {
    if (!process.env.AMOX_CAPTURAS) return;
    const r = await pg.cdp('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(process.env.AMOX_CAPTURAS, `${nombre}.png`), Buffer.from(r.result.data, 'base64'));
}

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

    // Vega se carga la primera vez que se dibuja (6.0, M8): que llegue y dibuje.
    console.log('— el gráfico');
    e = await app.js(`
      const boton = [...document.querySelectorAll('.rt-view-btn')].find(b => /chart/i.test((b.innerText || '') + ' ' + (b.title || '') + ' ' + (b.getAttribute('aria-label') || '')));
      if (!boton) return { boton: false };
      boton.click();
      let svg = null;
      for (let i = 0; i < 60 && !svg; i++) { await t.dormir(200); svg = document.querySelector('.figura-vega svg'); }
      const marcas = svg ? svg.querySelectorAll('path, rect, line').length : 0;
      const error = document.querySelector('.figura-vega-error')?.innerText || null;
      const tabla = [...document.querySelectorAll('.rt-view-btn')].find(b => /table/i.test((b.innerText || '') + ' ' + (b.title || '') + ' ' + (b.getAttribute('aria-label') || '')));
      tabla?.click(); await t.dormir(200);
      return { boton: true, svg: !!svg, marcas, error };`);
    bien('la vista de gráfico dibuja la figura', e.boton && e.svg && e.marcas > 0 && !e.error, e);

    // Cada sección de Settings vive en su archivo y se carga al abrirla (6.0, M8).
    console.log('— Settings, sección a sección');
    e = await app.js(`
      window.dispatchEvent(new CustomEvent('amox_abrir_ajustes', { detail: 'appearance' }));
      for (let i = 0; i < 40 && !document.querySelector('.stg-tab'); i++) await t.dormir(100);
      const nombres = [...document.querySelectorAll('.stg-tab')].map(x => x.innerText.trim());
      const vacias = [];
      const pintar = async () => { for (let i = 0; i < 40; i++) { const b = document.querySelector('.stg-content-body'); if (b && b.innerText.trim().length > 20) return true; await t.dormir(100); } return false; };
      for (const n of nombres) {
        [...document.querySelectorAll('.stg-tab')].find(x => x.innerText.trim() === n)?.click();
        if (!(await pintar())) vacias.push(n);
        if (n === 'AI') for (const sub of [...document.querySelectorAll('.stg-content-body button')].filter(b => /^(Modes|Models|Knowledge|Skills)$/.test(b.innerText.trim()))) { sub.click(); if (!(await pintar())) vacias.push('AI › ' + sub.innerText.trim()); }
      }
      const vivo = !!document.querySelector('.stg-modal');
      document.querySelector('.stg-close-btn')?.click(); await t.dormir(200);
      return { secciones: nombres.length, vacias, vivo };`);
    bien('cada sección se abre y pinta', e.secciones >= 9 && !e.vacias.length && e.vivo, e);

    // La apariencia vive en su proveedor (shell/Apariencia.jsx, 6.0 M8): elegir
    // un tema en Settings lo aplica al documento y lo guarda.
    e = await app.js(`
      window.dispatchEvent(new CustomEvent('amox_abrir_ajustes', { detail: 'appearance' }));
      let cartas = [];
      for (let i = 0; i < 40 && !cartas.length; i++) { await t.dormir(100); cartas = [...document.querySelectorAll('.stg-theme-card')]; }
      const antes = localStorage.getItem('amoxsql-theme');
      const carta = (txt) => cartas.find(c => c.innerText.includes(txt));
      carta('Amox Light')?.click(); await t.dormir(300);
      const claro = { modo: document.body.classList.contains('mode-light'), guardado: localStorage.getItem('amoxsql-theme'), activa: !!document.querySelector('.stg-theme-card--active')?.innerText.includes('Amox Light') };
      carta('Amox Dark')?.click(); await t.dormir(300);
      const oscuro = { modo: document.body.classList.contains('mode-dark'), guardado: localStorage.getItem('amoxsql-theme') };
      if (antes && antes !== oscuro.guardado) { carta(antes)?.click(); }
      document.querySelector('.stg-close-btn')?.click(); await t.dormir(200);
      return { cartas: cartas.length, claro, oscuro };`);
    bien('elegir un tema en Settings lo aplica y lo guarda', e.cartas >= 10 && e.claro.modo && e.claro.guardado === 'amoxlight' && e.claro.activa && e.oscuro.modo && e.oscuro.guardado === 'amoxdark', e);

    // Los acentos recorren el círculo cromático (6.0, M9): elegir uno lo aplica.
    e = await app.js(`
      window.dispatchEvent(new CustomEvent('amox_abrir_ajustes', { detail: 'appearance' }));
      let muestras = [];
      for (let i = 0; i < 40 && !muestras.length; i++) { await t.dormir(100); muestras = [...document.querySelectorAll('.stg-content-body [title]')].filter(b => /^(Cyan|Blue|Violet|Magenta|Red|Orange|Lime|Green)\\b/.test(b.title)); }
      const marca = document.querySelectorAll('.stg-theme-marca .stg-theme-card').length;
      const antes = getComputedStyle(document.body).getPropertyValue('--accent-primary').trim();
      muestras.find(b => b.title.startsWith('Violet'))?.click(); await t.dormir(300);
      const violeta = { clase: document.body.classList.contains('accent-violet'), guardado: localStorage.getItem('amoxsql-accent'), color: getComputedStyle(document.body).getPropertyValue('--accent-primary').trim() };
      return { muestras: muestras.map(b => b.title.split(' ')[0]), marca, antes, violeta };`);
    await foto(app, 'ajustes-acento-violeta');
    await app.js(`[...document.querySelectorAll('.stg-content-body [title]')].find(b => b.title.startsWith('Cyan'))?.click(); await t.dormir(300);`);
    await foto(app, 'ajustes-apariencia');
    await app.js(`document.querySelector('.stg-close-btn')?.click(); await t.dormir(200);`);
    bien('los ocho acentos, la pareja de la marca arriba, y elegir uno lo aplica', e.muestras.length === 8 && e.marca === 2 && e.violeta.clase && e.violeta.guardado === 'violet' && e.violeta.color !== e.antes, e);

    // Los atajos y las guías salieron de Settings a Help (6.0, M8).
    console.log('— Help');
    await app.js(`t.ed().focus();`);
    await app.tecla('ctrl+shift+/'); await dormir(300);
    e = await app.js(`
      for (let i = 0; i < 40 && !document.querySelector('[aria-label="Help"]'); i++) await t.dormir(100);
      const dialogo = document.querySelector('[aria-label="Help"]');
      if (!dialogo) return { abierto: false };
      const nombres = [...dialogo.querySelectorAll('.stg-tab')].map(x => x.innerText.trim());
      const vacias = [];
      for (const n of nombres) {
        [...dialogo.querySelectorAll('.stg-tab')].find(x => x.innerText.trim() === n)?.click();
        let ok = false;
        for (let i = 0; i < 40 && !ok; i++) { await t.dormir(100); ok = (dialogo.querySelector('.stg-content-body')?.innerText.trim().length || 0) > 20; }
        if (!ok) vacias.push(n);
      }
      return { abierto: true, nombres, vacias };`);
    bien('Ctrl+Shift+/ abre Help y cada sección pinta', e.abierto && e.nombres.length === 3 && !e.vacias.length, e);
    await app.tecla('escape'); await dormir(300);
    bien('Escape cierra Help', !(await app.js(`return !!document.querySelector('[aria-label="Help"]');`)));
}
// ── Fase 3: la ventana emergente ────────────────────────────────────────────
async function fase3(app) {
    const emergentes = async () => (await paginas()).filter(p => p.url.includes('popout=true')).length;
    const abrirEmergente = () => app.js(`await t.emergente(); await t.dormir(300);`);
    const ventana = async (n) => {
        for (let i = 0; i < 30; i++) {
            for (const p of (await paginas()).filter(x => x.url.includes('popout=true'))) {
                const ws = new WebSocket(p.webSocketDebuggerUrl);
                await new Promise((r) => { ws.onopen = r; });
                const pg = new Pagina(ws);
                const titulo = await pg.js(`return document.querySelector('.popout-title')?.innerText || ''`);
                if (titulo.includes(n)) return pg;
                ws.close();
            }
            await dormir(300);
        }
        return null;
    };
    const lee = (pg) => pg.js(`return { titulo: document.querySelector('.popout-title')?.innerText, filas: document.querySelector('.popout-badge')?.innerText }`);

    console.log('— anclada a su pestaña');
    await app.js(`await t.ir('uno.sql'); t.boton('Run').click(); await t.dormir(900);`);
    await abrirEmergente();
    const v1 = await ventana('uno.sql');
    bien('se abre con los resultados de su pestaña', !!v1 && /200 rows/.test((await lee(v1)).filas), v1 && await lee(v1));
    let e = await app.js(`return { franja: document.querySelector('.ep-emergente')?.innerText, recogido: !!document.querySelector('.ep-results--vacio'), alto: t.alto() };`);
    bien('el panel se recoge y deja el sitio al código', !!e.franja && e.recogido && e.alto < 120, e);
    await foto(app, 'franja');
    e = await app.js(`await t.ir('dos.sql'); t.boton('Run').click(); await t.dormir(900); return { franja: !!document.querySelector('.ep-emergente'), tabla: !!document.querySelector('.rt-view-btn') };`);
    bien('otra pestaña enseña sus resultados como siempre', !e.franja && e.tabla, e);
    const tras = await lee(v1);
    bien('ejecutar en otra pestaña no la toca', /uno\.sql/.test(tras.titulo) && /200 rows/.test(tras.filas), tras);

    console.log('— varias, y sigue a su pestaña');
    await abrirEmergente();
    const v2 = await ventana('dos.sql');
    bien('una ventana por pestaña', !!v2 && (await emergentes()) === 2, await emergentes());
    await app.js(`await t.ir('uno.sql'); t.ed().executeEdits('p', [{ range: t.ed().getModel().getFullModelRange(), text: 'SELECT i AS id FROM range(7) t(i);' }]); await t.dormir(200); t.boton('Run').click(); await t.dormir(900); await t.ir('tres.sql');`);
    await dormir(600);
    bien('una ejecución nueva de su pestaña la actualiza', /7 rows/.test((await lee(v1)).filas), await lee(v1));
    await v1.js(`[...document.querySelectorAll('.popout-accion')].find(b => b.textContent.includes('Pin')).click(); await new Promise(r => setTimeout(r, 200));`);
    await app.js(`await t.ir('uno.sql'); t.ed().executeEdits('p', [{ range: t.ed().getModel().getFullModelRange(), text: 'SELECT i AS id FROM range(3) t(i);' }]); await t.dormir(200); t.boton('Run').click(); await t.dormir(900);`);
    await dormir(600);
    e = await v1.js(`return { filas: document.querySelector('.popout-badge')?.innerText, hay: [...document.querySelectorAll('.popout-accion')].some(b => b.textContent.includes('Newer')) };`);
    bien('fijada conserva lo suyo y avisa de lo nuevo', /7 rows/.test(e.filas) && e.hay, e);

    console.log('— cierres');
    await app.js(`document.querySelectorAll('.ep-emergente button')[1].click(); await t.dormir(1200);`);
    bien('Bring back cierra la ventana', (await emergentes()) === 1, await emergentes());
    e = await app.js(`return { franja: !!document.querySelector('.ep-emergente'), tabla: !!document.querySelector('.rt-view-btn'), alto: t.alto() };`);
    bien('y la tabla vuelve con su altura', !e.franja && e.tabla && e.alto > 120, e);
    await v2.js(`document.querySelector('.control-btn.close').click(); return 1;`).catch(() => {});
    await dormir(1200);
    e = await app.js(`await t.ir('dos.sql'); return { franja: !!document.querySelector('.ep-emergente'), tabla: !!document.querySelector('.rt-view-btn') };`);
    bien('cerrar la ventana con su X devuelve la tabla', !e.franja && e.tabla && (await emergentes()) === 0, e);
    await abrirEmergente();
    await dormir(1200);
    await app.js(`t.item('dos.sql').querySelector('.tab-close').click(); await t.dormir(1200);`);
    bien('cerrar la pestaña se lleva su ventana', (await emergentes()) === 0, await emergentes());
    await app.js(`const e = t.fila('dos'); t.pulsar(e); e.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); await t.dormir(800);`);
}
// ── Fase 6: un tope que no se salta ─────────────────────────────────────────
async function fase6(app) {
    console.log('— el tope de filas');
    const q = (query, limit) => app.js(`const p = (await import('/src/api.js')).API_BASE; const r = await fetch(p + '/api/query', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(${JSON.stringify({ query, limit })}) }); const d = await r.json(); return { ok: r.ok, n: d.data?.length, truncated: d.truncated, rowLimit: d.rowLimit, error: d.error, primera: d.data?.[0], tipo: d.resultType, afectadas: d.rowsAffected };`);
    const V = "(SELECT i AS id, i * 2 AS doble FROM range(5000) t(i))";
    let e = await q(`SELECT * FROM ${V}`, 100);
    bien('SELECT lleva tope', e.n === 100 && e.truncated && e.rowLimit === 100, e);
    e = await q(`FROM ${V}`, 100);
    bien('FROM primero también', e.n === 100 && e.truncated, e);
    e = await q(`-- comentario\nFROM ${V}`, 100);
    bien('con un comentario delante', e.n === 100 && e.truncated, e);
    e = await q(`VALUES (1), (2), (3)`, 2);
    bien('VALUES', e.n === 2 && e.truncated, e);
    e = await q(`SELECT 1 AS a`, 100);
    bien('lo que cabe no se marca recortado', e.n === 1 && !e.truncated && e.primera?.a === 1, e);
    e = await q(`SELECT * FROM range(1200000)`, 0);
    bien('con el ajuste en 0 hay tope de seguridad', e.n === 1000000 && e.truncated, { n: e.n, t: e.truncated });
    e = await q(`SELECT 1 AS x, 2 AS x`, 10);
    bien('columnas repetidas no se pisan', e.ok && Object.keys(e.primera || {}).length === 2, e);
    e = await q(`SELECT 12345678901234567890::HUGEINT AS h, DATE '2024-01-31' AS d, NULL AS n, [1,2] AS l`, 10);
    bien('tipos como antes', e.ok && typeof e.primera?.h === 'string' && e.primera?.n === null && Array.isArray(e.primera?.l) && String(e.primera?.d).startsWith('2024-01-31'), e);
    e = await q(`CREATE OR REPLACE TABLE prueba_tope AS SELECT 1 AS a`, 10);
    bien('crear una tabla pasa', e.ok, e);
    e = await q(`INSERT INTO prueba_tope VALUES (2), (3)`, 10);
    bien('insertar dice cuántas', e.ok && e.afectadas === 2, e);
    e = await q(`DESCRIBE prueba_tope`, 10);
    bien('DESCRIBE pasa', e.ok && e.n === 1, e);
    e = await q(`DROP TABLE prueba_tope`, 10);
    bien('borrar pasa', e.ok, e);
    e = await q(`SELEC 1`, 10);
    bien('un error de sintaxis se dice', !e.ok && /syntax|Parser/i.test(e.error || ''), e);
    e = await q(`FROM no_existe_esta_tabla`, 10);
    bien('un error de verdad no se esconde', !e.ok && /no_existe/i.test(e.error || ''), e);

    console.log('— Stop mientras se convierte');
    e = await app.js(`
      const p = (await import('/src/api.js')).API_BASE; const c = new AbortController();
      const t0 = performance.now();
      const peticion = fetch(p + '/api/query', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: c.signal, body: JSON.stringify({ query: "SELECT i, md5(i::VARCHAR) a, md5((i+1)::VARCHAR) b FROM range(1000000) t(i)", limit: 0 }) }).catch(() => null);
      await t.dormir(1200);
      let peor = 0; const vivo = setInterval(() => {}, 1000); clearInterval(vivo);
      const a = performance.now(); await fetch(p + '/api/sesion'); peor = performance.now() - a;
      c.abort(); await peticion;
      const b = performance.now(); await fetch(p + '/api/query', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: 'select 1 x' }) });
      return { servidorDuranteMs: Math.round(peor), libreTrasStopMs: Math.round(performance.now() - b) };`);
    bien('el servidor atiende mientras tanto', e.servidorDuranteMs < 1000, e);
    bien('y al cancelar queda libre', e.libreTrasStopMs < 1000, e);
}

// ── Fase 7: lo de fondo, a la vista y cancelable ────────────────────────────
async function fase7(app) {
    const LENTA = "SELECT count(*) c FROM range(4000000000) t(i) WHERE md5(i::VARCHAR) = 'x'";
    const GRANDE = "SELECT i, md5(i::VARCHAR) m FROM range(30000000) t(i)";
    const AUX = `const p = (await import('/src/api.js')).API_BASE;
      const post = (ruta, cuerpo, signal) => fetch(p + ruta, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal, body: JSON.stringify(cuerpo) });
      const cronometro = async (fn) => { const a = performance.now(); const r = await fn(); return [Math.round(performance.now() - a), r]; };
      const uno = () => post('/api/query', { query: 'select 1 x' }).then(r => r.json());`;

    console.log('— tu consulta tiene prioridad');
    let e = await app.js(`${AUX}
      const fondo = post('/api/query', { query: ${JSON.stringify(LENTA)}, deFondo: true }).then(async r => ({ ok: r.ok, ...(await r.json()) }));
      await t.dormir(800);
      const [ms, r] = await cronometro(uno);
      const f = await fondo;
      return { ms, x: r.data?.[0]?.x, fondoOk: f.ok, error: f.error };`);
    bien('no espera detrás de lo de fondo', e.ms < 1500 && e.x === 1, e);
    bien('lo de fondo cedió', !e.fondoOk && /Interrupted/i.test(e.error || ''), e);

    e = await app.js(`${AUX}
      const perfil = post('/api/profile', { query: ${JSON.stringify(GRANDE)} }).then(r => r.json());
      await t.dormir(3000); console.log('dbg', JSON.stringify(Object.entries(localStorage).filter(([k]) => /sin-guardar|layout-v1/.test(k)).map(([k,v]) => [k.slice(0,40), v.slice(0,400)]))); window.__dbg = [...document.querySelectorAll('.tab-item')].map(x => x.className + ':' + x.textContent);
      const [ms, r] = await cronometro(uno);
      return { ms, x: r.data?.[0]?.x, perfil: await perfil };`);
    bien('el perfil cede ante tu consulta', e.ms < 1500 && e.x === 1 && e.perfil.cancelada === true, { ms: e.ms, p: e.perfil });

    e = await app.js(`${AUX}
      const c = new AbortController();
      const perfil = post('/api/profile', { query: ${JSON.stringify(GRANDE)} }, c.signal).catch(() => null);
      await t.dormir(3000); console.log('dbg', JSON.stringify(Object.entries(localStorage).filter(([k]) => /sin-guardar|layout-v1/.test(k)).map(([k,v]) => [k.slice(0,40), v.slice(0,400)]))); window.__dbg = [...document.querySelectorAll('.tab-item')].map(x => x.className + ':' + x.textContent);
      c.abort(); await perfil;
      const [ms] = await cronometro(() => post('/api/query', { query: 'select 1 x', deFondo: true }).then(r => r.json()));
      return { ms };`);
    bien('cerrar la petición del perfil libera el motor', e.ms < 1000, e);

    console.log('— cada consulta, su turno');
    e = await app.js(`${AUX}
      const correr = (id) => post('/api/query', { query: ${JSON.stringify(LENTA)}, queryId: id }).then(r => r.json());
      const a = correr('turno-a'); const b = correr('turno-b'); const c = correr('turno-c');
      await t.dormir(600);
      // La que espera se cancela sin tocar a la que corre.
      await post('/api/query/cancel/turno-b', {});
      await t.dormir(300);
      const ra = await Promise.race([a, t.dormir(50).then(() => 'sigue')]);
      // Stop llega a la que corre de verdad, y luego a la siguiente.
      const [msA] = await cronometro(async () => { await post('/api/query/cancel/turno-a', {}); return a; });
      const rb = await Promise.race([b, t.dormir(1000).then(() => 'sigue')]);
      const [msC] = await cronometro(async () => { await t.dormir(300); await post('/api/query/cancel/turno-c', {}); return c; });
      const [msLibre, r] = await cronometro(uno);
      return { b: rb?.error || rb, a: ra === 'sigue', msA, msC, msLibre, x: r.data?.[0]?.x };`);
    bien('la que espera se cancela sin empezar', /Interrupted/i.test(String(e.b)), e);
    bien('y la que corre sigue a lo suyo', e.a === true, e);
    bien('Stop llega a la que corre', e.msA < 1000, e);
    bien('y a la siguiente', e.msC < 1300, e);
    bien('el motor queda libre', e.msLibre < 1000 && e.x === 1, e);

    console.log('— el perfil, a la vista');
    await app.js(`
      await t.ir('uno.sql'); t.ed().setValue(${JSON.stringify(GRANDE)}); await t.dormir(200);
      t.boton('Run').click(); await t.dormir(1500);
      t.boton('Profile').click(); await t.dormir(700);`);
    e = await app.js(`return { texto: document.querySelector('.dp-espera')?.textContent || '', cancelar: !!t.boton('Cancel') };`);
    bien('dice que calcula y se puede cancelar', /Profiling/.test(e.texto) && e.cancelar, e);
    e = await app.js(`${AUX}
      t.boton('Cancel').click(); await t.dormir(300);
      const [ms] = await cronometro(() => post('/api/query', { query: 'select 1 x', deFondo: true }).then(r => r.json()));
      return { ms, texto: document.querySelector('.dp-espera')?.textContent || '', recalcular: !!t.boton('Recalculate') };`);
    bien('Cancel libera el motor', e.ms < 1000, e);
    bien('y deja volver a calcular', /stopped/.test(e.texto) && e.recalcular, e);
    e = await app.js(`
      t.boton('Table').click(); await t.dormir(200); t.boton('Profile').click(); await t.dormir(500);
      return { sigueDetenido: !!t.boton('Recalculate') };`);
    bien('volver a la vista no lo relanza solo', e.sigueDetenido, e);
    e = await app.js(`${AUX}
      t.boton('Recalculate').click(); await t.dormir(600);
      const calculando = !!t.boton('Cancel');
      t.boton('Table').click(); await t.dormir(300);
      const [ms] = await cronometro(() => post('/api/query', { query: 'select 1 x', deFondo: true }).then(r => r.json()));
      return { calculando, ms };`);
    bien('Recalculate calcula', e.calculando, e);
    bien('salir de la vista lo cancela', e.ms < 1000, e);
    e = await app.js(`
      t.ed().setValue('SELECT i AS id, i % 3 AS g FROM range(500) t(i)'); await t.dormir(200);
      t.boton('Run').click(); await t.dormir(900);
      t.boton('Profile').click();
      for (let i = 0; i < 30 && document.querySelector('.dp-espera'); i++) await t.dormir(200);
      const texto = document.querySelector('.ep-results')?.textContent || '';
      t.boton('Table').click();
      return { espera: !!document.querySelector('.dp-espera'), tieneColumnas: texto.includes('id') && texto.includes('BIGINT'), texto: texto.slice(0, 200) };`);
    bien('un perfil normal sale', !e.espera && e.tieneColumnas, e);
}

// ── Fase 5: nunca atrapado ──────────────────────────────────────────────────
async function fase5(app0) {
    let app = app0;
    const enIde = (pg) => pg.js(`return { tabs: document.querySelectorAll('.tab-item').length, editor: !!document.querySelector('.monaco-editor, .ep-action-bar'), bienvenida: document.body.innerText.includes('Open a project') };`);
    console.log('— un error al pintar');
    // Un fallo de verdad: el estado de las pestañas pasa a ser inválido y React revienta al pintar.
    await app.js(`
      window.t.romper = () => {
        const dom = document.querySelector('.ep-container');
        const fibra = dom[Object.keys(dom).find(k => k.startsWith('__reactFiber'))];
        for (let f = fibra; f; f = f.return) {
          for (let h = f.memoizedState; h && typeof h === 'object' && 'queue' in h; h = h.next) {
            if (Array.isArray(h.memoizedState) && h.memoizedState[0]?.content !== undefined && h.queue?.dispatch) { h.queue.dispatch(null); return true; }
          }
        }
        return false;
      };
      return t.romper();`);
    await dormir(800);
    let e = await app.js(`return { aviso: document.querySelector('.fallo-interfaz h1')?.innerText, boton: !!t.boton('Reload') };`);
    bien('la ventana enseña qué pasó y una salida, no se queda vacía', !!e.aviso && e.boton, e);
    await app.js(`t.boton('Reload').click(); return 1;`).catch(() => {});
    await dormir(6000);
    app = await abrir(p => !p.url.includes('popout=true'));
    await app.js(AYUDAS);
    e = await enIde(app);
    bien('Reload vuelve a las pestañas, no a la selección de proyectos', e.tabs >= 1 && !e.bienvenida, e);
    e = await app.js(`const p = (await import('/src/api.js')).API_BASE; return (await (await fetch(p + '/api/sesion')).json()).proyecto;`);
    bien('el proyecto sigue abierto', typeof e === 'string' && e.length > 0, e);

    console.log('— muere el proceso de la ventana');
    // Con una pestaña sin guardar delante, lo más fácil de perder.
    await app.tecla('ctrl+n'); await dormir(900);
    const antes = await app.js(`
      for (let i = 0; i < 20 && !window.monaco?.editor.getEditors().length; i++) await t.dormir(300);
      const ed = monaco.editor.getEditors().find(x => x.getDomNode()?.offsetParent); ed.focus(); ed.setValue('SELECT 42 AS sin_guardar'); await t.dormir(1500);
      return { tabs: [...document.querySelectorAll('.tab-label')].map(x => x.textContent.trim()), v: ed.getValue() };`);
    app.cdp('Page.crash');
    await dormir(7000);
    app = await abrir(p => !p.url.includes('popout=true'));
    let listo = null;
    for (let i = 0; i < 20; i++) { listo = await app.js('return 1').catch(() => null); if (listo === 1) break; await dormir(500); }
    await app.js(AYUDAS);
    await dormir(1500);
    e = await enIde(app);
    bien('se recupera sola con sus pestañas', e.tabs >= 1 && !e.bienvenida, e);
    e = await app.js(`
      for (let i = 0; i < 20 && !window.monaco?.editor.getEditors().length; i++) await t.dormir(300);
      await t.dormir(3000); console.log('dbg', JSON.stringify(Object.entries(localStorage).filter(([k]) => /sin-guardar|layout-v1/.test(k)).map(([k,v]) => [k.slice(0,40), v.slice(0,400)]))); window.__dbg = [...document.querySelectorAll('.tab-item')].map(x => x.className + ':' + x.textContent);
      return { tabs: [...document.querySelectorAll('.tab-label')].map(x => x.textContent.trim()), hayEditor: !!window.monaco?.editor.getEditors().length, valor: window.monaco?.editor.getEditors().find(x => x.getDomNode()?.offsetParent)?.getValue() };`);
    bien('hay un editor al volver', e.hayEditor, { antes, e });
    bien('la pestaña sin guardar sigue, con su texto', e.tabs.length === antes.tabs.length && e.valor === 'SELECT 42 AS sin_guardar', { antes, e });
    e = await app.js(`const p = (await import('/src/api.js')).API_BASE; const r = await fetch(p + '/api/query', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: 'select 1 x' }) }); return r.ok;`);
    bien('y puede consultar', e === true, e);
    return app;
}

// ── Fase 4: atajos, Escape, búsqueda ────────────────────────────────────────
async function fase4(app) {
    const cuenta = () => app.js(`return [...document.querySelectorAll('.modal-overlay')].length`);
    console.log('— atajos desde el editor');
    // After the recovery of fase5 the window may be behind another one, and on Windows a
    // covered window counts as hidden and gets no keys (CDP's bringToFront doesn't change
    // that): emulate focus and an active page.
    await app.cdp('Page.bringToFront').catch(() => {});
    await app.cdp('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
    await app.cdp('Page.setWebLifecycleState', { state: 'active' }).catch(() => {}); await dormir(300);
    await app.js(`await t.ir('tres.sql'); t.ed().focus();`);
    const ancho = () => app.js(`const p = document.querySelector('.ai-panel'); return p && getComputedStyle(p).pointerEvents !== 'none' && getComputedStyle(p.parentElement).opacity !== '0' ? 100 : 0`);
    const a0 = await ancho();
    await app.tecla('ctrl+l'); await dormir(700);
    const a1 = await ancho();
    bien('Ctrl+L abre Assist', a1 > a0 + 50, { a0, a1 });
    await app.js(`t.ed().focus();`);
    await app.tecla('ctrl+l'); await dormir(700);
    await app.js(`t.ed().focus();`);
    const v = await app.js(`return t.ed().getValue();`);
    await app.tecla('ctrl+shift+f'); await dormir(500);
    let e = await app.js(`return { activo: document.querySelector('[class*=activity] [class*=active],[class*=rail] [class*=active]')?.getAttribute('title') || '', igual: t.ed().getValue() === ${'${'}JSON.stringify(v)} };`.replace('${JSON.stringify(v)}', JSON.stringify(v)));
    bien('Ctrl+Shift+F busca en el proyecto', /Search/i.test(e.activo) && e.igual, e);
    await app.tecla('ctrl+shift+e'); await dormir(300);

    console.log('— Escape');
    await app.js(`t.boton('Run').click(); await t.dormir(800); t.ed().focus();`);
    await app.tecla('ctrl+shift+a'); await dormir(900);
    const m0 = await cuenta();
    await app.tecla('escape'); await dormir(400);
    bien('Escape cierra el plan de ejecución', m0 > 0 && (await cuenta()) === m0 - 1, { m0, m1: await cuenta() });

    console.log('— la búsqueda');
    await app.js(`t.ed().focus();`);
    await app.tecla('ctrl+f'); await dormir(500);
    e = await app.js(`
      const w = document.querySelector('.find-widget.visible');
      const barra = document.querySelector('.ep-action-bar').getBoundingClientRect().bottom;
      const botones = [...w.querySelectorAll('.button, .monaco-custom-toggle, textarea')].filter(b => b.getBoundingClientRect().width > 0);
      const tapados = botones.filter(b => { const q = b.getBoundingClientRect(); const x = document.elementFromPoint(q.x + q.width / 2, q.y + q.height / 2); return !(x === b || b.contains(x) || w.contains(x)); }).map(b => { const q = b.getBoundingClientRect(); const x = document.elementFromPoint(q.x + q.width / 2, q.y + q.height / 2); return b.getAttribute('aria-label') + ' @' + Math.round(q.x) + ',' + Math.round(q.y) + ' por ' + (x?.tagName + '.' + String(x?.className).slice(0, 50)); });
      return { hueco: Math.round(w.getBoundingClientRect().top - barra), tapados, n: botones.length };`);
    await foto(app, 'busqueda');
    bien('separada de la barra y sin nada encima', e.hueco >= 4 && e.tapados.length === 0 && e.n > 5, e);
    await app.tecla('escape'); await dormir(300);
    bien('Esc cierra la búsqueda', await app.js(`return !document.querySelector('.find-widget.visible');`));

    console.log('— cerrar la principal');
    await app.js(`await t.ir('uno.sql'); t.boton('Run').click(); await t.dormir(900); await t.emergente(); await t.dormir(1500);`);
    await app.js(`setTimeout(() => window.electronAPI.windowControl.close(), 100); return 1;`).catch(() => {});
    await dormir(3000);
    const vivas = await paginas().catch(() => []);
    bien('cerrar la principal cierra también sus ventanas', vivas.length === 0, vivas.map(p => p.url));
}
