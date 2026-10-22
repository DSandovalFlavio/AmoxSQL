/**
 * Fases 0.4 y 0.5 de la 5.13 (Dec-42): lo que corre de fondo no estorba.
 *
 *     node scripts/poc513/p02_fondo.mjs [--dbt <carpeta de un entorno con dbt>]
 *
 * 0.4 · Dos instancias del motor en el mismo proceso, como en AmoxSQL: «la interfaz»
 *       lanza una consulta pequeña cada 150 ms mientras «el fondo» hace un trabajo
 *       pesado, sin límites y con `threads` = la mitad de los núcleos y
 *       `memory_limit` = el 25 % de la memoria. ¿Cuánto tardan las consultas de la
 *       interfaz en cada caso, y cuánto el trabajo de fondo? Y con un límite de
 *       memoria pequeño: ¿falla, o va a disco con `temp_directory`?
 * 0.5 · `os.setPriority` en Windows: ¿lo heredan los procesos que lanza el proceso al
 *       que se le baja? (dbt.exe de un entorno lanza un python.exe).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);
const { crearInstancia } = require(path.join(RAIZ, 'server/motor.js'));
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'amox-poc513-fondo-'));
const anota = (t, ok, d = '') => console.log(`${ok ? 'SI ' : 'NO '} ${t}${d ? `  — ${String(d).slice(0, 300)}` : ''}`);
const dato = (t, d) => console.log(`··  ${t}: ${d}`);
const espera = (ms) => new Promise(r => setTimeout(r, ms));

const nucleos = os.cpus().length;
const memoria = os.totalmem();
const limites = { threads: Math.max(1, Math.floor(nucleos / 2)), memoria: `${Math.floor(memoria * 0.25 / 1048576)}MB` };
dato('esta máquina', `${nucleos} núcleos, ${(memoria / 1073741824).toFixed(1)} GB · límites: ${limites.threads} hilos, ${limites.memoria}`);

// ── 0.4 · La interfaz mientras el fondo trabaja ──────────────────────────────
const ui = await (await crearInstancia(':memory:')).connect();
const FILAS_UI = Number(process.env.FILAS_UI || 2000000);
dato('consulta de la interfaz', `agrupar ${FILAS_UI.toLocaleString('es')} filas`);
await ui.run(`CREATE TABLE t AS SELECT i, i % 100000 AS g FROM range(${FILAS_UI}) r(i)`);
const consultaUi = async () => { const t = performance.now(); await ui.run('SELECT g, sum(i), count(DISTINCT i % 7) FROM t GROUP BY g'); return performance.now() - t; };
const pct = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * p))] || 0; };

async function ronda(titulo, preparar) {
    const inst = await crearInstancia(':memory:');
    const fondo = await inst.connect();
    for (const s of preparar) await fondo.run(s);
    const tiempos = [];
    let sigue = true;
    const vigia = (async () => { while (sigue) { tiempos.push(await consultaUi()); await espera(150); } })();
    const t0 = performance.now();
    let error = null;
    try {
        await fondo.run(`SELECT h, count(*) AS n FROM (SELECT md5((i % 3000000)::VARCHAR) AS h, i FROM range(40000000) r(i)) GROUP BY h ORDER BY n DESC, h LIMIT 1`);
    } catch (e) { error = e.message.split('\n')[0]; }
    const duracion = performance.now() - t0;
    sigue = false; await vigia;
    fondo.closeSync(); inst.closeSync();
    const r = { titulo, fondoMs: Math.round(duracion), uiP50: Math.round(pct(tiempos, 0.5)), uiP95: Math.round(pct(tiempos, 0.95)), uiMax: Math.round(Math.max(...tiempos)), n: tiempos.length, error };
    dato(titulo, `fondo ${r.fondoMs} ms${error ? ` (ERROR ${error})` : ''} · interfaz p50 ${r.uiP50} ms, p95 ${r.uiP95} ms, máx ${r.uiMax} ms (${r.n} consultas)`);
    return r;
}

console.log('\n0.4 · la interfaz mientras el fondo trabaja');
const sola = []; for (let i = 0; i < 15; i++) sola.push(await consultaUi());
dato('interfaz sola', `p50 ${Math.round(pct(sola, 0.5))} ms, p95 ${Math.round(pct(sola, 0.95))} ms`);
const sin = await ronda('fondo SIN límites', []);
const con = await ronda('fondo CON límites', [`SET threads = ${limites.threads}`, `SET memory_limit = '${limites.memoria}'`, `SET temp_directory = '${path.join(T, 'tmp').replace(/\\/g, '/')}'`]);
anota('con límites, la interfaz responde mejor (p95)', con.uiP95 < sin.uiP95, `p95 ${sin.uiP95} → ${con.uiP95} ms; el fondo tarda ${sin.fondoMs} → ${con.fondoMs} ms`);

console.log('\n0.4 · un límite de memoria pequeño');
const chica = await ronda('256MB, sin temp_directory', [`SET memory_limit = '256MB'`, `SET temp_directory = ''`]);
const chicaDisco = await ronda('256MB, con temp_directory', [`SET memory_limit = '256MB'`, `SET temp_directory = '${path.join(T, 'tmp2').replace(/\\/g, '/')}'`]);
anota('sin temp_directory, quedarse sin memoria falla', !!chica.error, chica.error || 'no falló');
anota('con temp_directory, termina (va a disco)', !chicaDisco.error, chicaDisco.error || `${chicaDisco.fondoMs} ms`);

// ── 0.5 · La prioridad y los procesos que se lanzan después ──────────────────
console.log('\n0.5 · la prioridad, en Windows');
const prioridadDe = (pid) => { try { return os.getPriority(pid); } catch (e) { return `? ${e.code}`; } };
const hijosDe = (pid) => {
    const salida = execFileSync('powershell.exe', ['-NoProfile', '-Command', `Get-CimInstance Win32_Process -Filter "ParentProcessId=${pid}" | ForEach-Object { "$($_.ProcessId) $($_.Name)" }`], { encoding: 'utf8' });
    return salida.split(/\r?\n/).filter(Boolean).map(l => { const [p, ...n] = l.trim().split(' '); return { pid: Number(p), nombre: n.join(' ') }; });
};
// Un hijo que, un segundo después, lanza un nieto: como dbt.exe → python.exe.
const hijo = spawn(process.execPath, ['-e', "setTimeout(() => { require('child_process').spawn(process.execPath, ['-e', 'setTimeout(() => {}, 4000)'], { stdio: 'ignore' }); }, 1000); setTimeout(() => {}, 5000);"], { stdio: 'ignore' });
os.setPriority(hijo.pid, os.constants.priority.PRIORITY_BELOW_NORMAL);
await espera(2000);
const nietos = hijosDe(hijo.pid);
dato('hijo', `${hijo.pid}, prioridad ${prioridadDe(hijo.pid)} (por debajo de lo normal = ${os.constants.priority.PRIORITY_BELOW_NORMAL})`);
anota('el nieto que lanza DESPUÉS hereda la prioridad baja', nietos.length > 0 && nietos.every(n => prioridadDe(n.pid) === os.constants.priority.PRIORITY_BELOW_NORMAL), nietos.map(n => `${n.nombre} ${n.pid}: ${prioridadDe(n.pid)}`).join(', ') || 'sin nietos');
hijo.kill();

const i = process.argv.indexOf('--dbt');
if (i > 0) {
    const dbt = path.join(path.resolve(process.argv[i + 1]), 'Scripts', 'dbt.exe');
    const p = spawn(dbt, ['--version'], { stdio: 'ignore' });
    try { os.setPriority(p.pid, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch (e) { dato('setPriority sobre dbt.exe', e.code); }
    await espera(700);
    const hs = hijosDe(p.pid);
    anota('dbt.exe (lanzador) y su python.exe, por debajo de lo normal', hs.length > 0 && hs.every(n => prioridadDe(n.pid) === os.constants.priority.PRIORITY_BELOW_NORMAL), `dbt.exe ${prioridadDe(p.pid)} · ${hs.map(n => `${n.nombre}: ${prioridadDe(n.pid)}`).join(', ') || 'sin hijos (terminó antes)'}`);
    await new Promise(r => p.on('exit', r));
}

console.log(`\n${T}`);
process.exit(0);
