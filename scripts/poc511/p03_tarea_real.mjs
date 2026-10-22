/**
 * La tarea REAL del Programador de tareas de Windows (fase 8 del plan, con
 * permiso del autor, 2026-10-21).
 *
 *     node scripts/poc511/p03_tarea_real.mjs --exe "dist/win-unpacked/AmoxSQL.exe"
 *
 * Con un home TEMPORAL y una tarea con NOMBRE PROPIO (la del home de siempre
 * no se toca; se comprueba antes y después):
 *   1. Una programación para dentro de unos minutos, con «Run even when
 *      AmoxSQL is closed» encendido.
 *   2. Se abre la aplicación: escribe la tarea, a esa hora, con `tick --home`.
 *   3. Se cierra la aplicación. A su hora, Windows lanza `AmoxSQL.exe tick`:
 *      corre la programación, deja su Excel y reescribe la tarea para mañana.
 *   4. Se borra la tarea.
 * Tarda unos cinco minutos.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ESTE = fileURLToPath(import.meta.url);
const RAIZ = path.resolve(path.dirname(ESTE), '..', '..');
const i = process.argv.indexOf('--exe');
if (i < 0) { console.error('Falta --exe <AmoxSQL.exe>'); process.exit(2); }
const EXE = path.resolve(process.argv[i + 1]);
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'amox-tarea-'));
const HOME = path.resolve(path.join(TMP, 'home'));
const PR = path.join(TMP, 'proyecto');
fs.mkdirSync(HOME, { recursive: true });
fs.mkdirSync(PR, { recursive: true });
process.env.AMOXSQL_HOME = HOME;
process.env.AMOXSQL_LLAVERO_DE_PRUEBA = '1';

const require = createRequire(import.meta.url);
const baseCentral = require(path.join(RAIZ, 'server/central/BaseCentral.js'));
const programaciones = require(path.join(RAIZ, 'server/programacion/programaciones.js'));

const TAREA = `AmoxSQL - scheduled processes (${crypto.createHash('sha1').update(HOME.toLowerCase()).digest('hex').slice(0, 8)})`;
const TAREA_DEL_USUARIO = 'AmoxSQL - scheduled processes';

let pasadas = 0, fallos = 0;
const anota = (t, ok, d = '') => { ok ? pasadas++ : fallos++; console.log(`${ok ? 'SI ' : 'NO '} ${t}${d ? `  — ${d}` : ''}`); };
const espera = (ms) => new Promise(r => setTimeout(r, ms));
const dos = (n) => String(n).padStart(2, '0');
const hhmm = (d) => `${dos(d.getHours())}:${dos(d.getMinutes())}`;
const diaLocal = (d) => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
const t0 = Date.now();
const reloj = () => `${Math.round((Date.now() - t0) / 1000)} s`;

const ps = (cmd) => { try { return execFileSync('powershell.exe', ['-NoProfile', '-Command', cmd], { encoding: 'utf8', windowsHide: true }).trim(); } catch { return ''; } };
const xmlDe = (nombre) => { try { return execFileSync('schtasks.exe', ['/Query', '/TN', nombre, '/XML'], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return null; } };
const info = (nombre) => {
    const s = ps(`$i = Get-ScheduledTaskInfo -TaskName '${nombre.replace(/'/g, "''")}' -ErrorAction SilentlyContinue; if ($i) { '{0}|{1}' -f $i.LastRunTime.ToString('o'), $i.LastTaskResult }`);
    if (!s) return null;
    const [ultima, resultado] = s.split('|');
    return { ultima: new Date(ultima), resultado: Number(resultado) };
};
const deLaPrueba = () => ps(`(Get-Process AmoxSQL -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq '${EXE.replace(/'/g, "''")}' }).Id -join ','`);

const antesDelUsuario = xmlDe(TAREA_DEL_USUARIO);
let gui = null;
try {
    anota('ninguna AmoxSQL de prueba abierta antes de empezar', !deLaPrueba(), deLaPrueba());
    anota('la tarea de prueba no existe aún', xmlDe(TAREA) === null, TAREA);

    // ── 1. La programación, y la tarea del sistema encendida
    fs.writeFileSync(path.join(PR, 'cierre.sqlchain'), JSON.stringify({
        version: '1.0', name: 'Cierre con AmoxSQL cerrado', config: { base: 'memoria' },
        parametros: [{ nombre: 'dia', tipo: 'fecha' }], variables: { dia: '2026-01-01' },
        nodes: [
            { id: 'leer', type: 'sql_inline', label: 'Ventas', position: { x: 0, y: 0 },
                config: { query: `SELECT '\${dia}'::DATE AS dia, * FROM (VALUES ('norte', 120.5), ('sur', 80)) t(tienda, importe)` } },
            { id: 'libro', type: 'excel', label: 'Libro', position: { x: 300, y: 0 },
                config: { modo: 'libro', outputPath: 'salidas/cierre_{fecha}_{hora}.xlsx', hojas: [{ desde: 'leer', nombre: 'Resumen' }] } },
        ],
        edges: [{ id: 'e1', source: 'leer', target: 'libro' }],
    }, null, 2));
    const ahora = new Date();
    const hora = new Date(ahora.getTime() + (ahora.getSeconds() > 30 ? 4 : 3) * 60000);
    hora.setSeconds(0, 0);
    await baseCentral.abrir();
    const prog = await programaciones.crear({
        proceso: path.join(PR, 'cierre.sqlchain'), proyecto: PR, nombre: 'Cierre con AmoxSQL cerrado',
        regla: { tipo: 'diaria', hora: hhmm(hora) }, parametros: { dia: 'hoy' }, avisar: 'siempre',
    });
    await baseCentral.guardarPreferencia('programador_sistema', true);
    await baseCentral.cerrar();
    anota(`programada «cada día a las ${hhmm(hora)}», con «Run even when AmoxSQL is closed»`, !!prog?.id);

    // ── 2. Se abre la aplicación: escribe la tarea
    console.log(`\n2. abriendo la aplicación de prueba (${reloj()})`);
    const env = { ...process.env, AMOXSQL_HOME: HOME };
    delete env.AMOXSQL_LLAVERO_DE_PRUEBA;
    delete env.ELECTRON_RUN_AS_NODE;
    gui = spawn(EXE, [], { env, detached: true, stdio: 'ignore' });
    gui.unref();
    let xml = null;
    for (let k = 0; k < 90 && !xml; k++) { await espera(1000); xml = xmlDe(TAREA); }
    anota('la aplicación escribió SU tarea', !!xml, TAREA);
    if (xml) {
        anota('  a la hora de la programación', xml.includes(`<StartBoundary>${diaLocal(hora)}T${hhmm(hora)}:00</StartBoundary>`), (/<StartBoundary>([^<]+)/.exec(xml) || [])[1]);
        anota('  con `tick --home` de esta carpeta', xml.includes('tick --home') && xml.toLowerCase().includes(HOME.toLowerCase().replace(/&/g, '&amp;')), (/<Arguments>([^<]+)/.exec(xml) || [])[1]);
        // Windows no repite LeastPrivilege al consultarla (es lo de siempre): basta con que no diga HighestAvailable.
        anota('  sin contraseña ni privilegios', /InteractiveToken/.test(xml) && !/HighestAvailable/.test(xml));
    }
    anota('la tarea del usuario sigue como estaba', xmlDe(TAREA_DEL_USUARIO) === antesDelUsuario, antesDelUsuario ? 'existe, sin cambios' : 'no existe, y no se creó');

    // ── 3. Se cierra la aplicación; a su hora, Windows la despierta
    console.log(`\n3. cerrando la aplicación; Windows debería despertarla a las ${hhmm(hora)} (${reloj()})`);
    ps(`Get-Process AmoxSQL -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq '${EXE.replace(/'/g, "''")}' } | ForEach-Object { $_.CloseMainWindow() | Out-Null }`);
    for (let k = 0; k < 20 && deLaPrueba(); k++) await espera(1000);
    if (deLaPrueba()) ps(`Get-Process AmoxSQL -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq '${EXE.replace(/'/g, "''")}' } | Stop-Process -Force`);
    anota('la aplicación de prueba está cerrada antes de su hora', !deLaPrueba() && Date.now() < hora.getTime(), `${Math.round((hora.getTime() - Date.now()) / 1000)} s antes`);
    let corrio = null;
    for (let k = 0; k < 60 * 6 && !corrio; k++) {
        await espera(1000);
        const x = info(TAREA);
        if (x && x.ultima.getTime() >= hora.getTime() - 1000 && x.resultado !== 267009) corrio = x;   // 267009 = corriendo
    }
    anota('Windows lanzó la tarea a su hora', !!corrio && corrio.resultado === 0, corrio ? `${corrio.ultima.toLocaleTimeString()} · resultado ${corrio.resultado}` : 'no corrió');
    for (let k = 0; k < 60 && deLaPrueba(); k++) await espera(1000);
    anota('  y AmoxSQL terminó y salió solo', !deLaPrueba());

    await baseCentral.abrir();
    const ej = await baseCentral.query(`SELECT origen, estado, prevista, parametros FROM ejecuciones WHERE programacion_id = $1`, [prog.id]);
    anota('la programación corrió una vez, con su día', ej.length === 1 && ej[0].estado === 'ok' && JSON.parse(ej[0].parametros || '{}').dia === diaLocal(hora), JSON.stringify(ej));
    await baseCentral.cerrar();
    const libro = path.join(PR, 'salidas', `cierre_${diaLocal(hora)}_${dos(hora.getHours())}${dos(hora.getMinutes())}.xlsx`);
    anota('dejó su Excel', fs.existsSync(libro), libro);
    const manana = new Date(hora.getTime() + 86400000);
    xml = xmlDe(TAREA);
    anota('la tarea quedó reescrita para mañana', !!xml && xml.includes(`<StartBoundary>${diaLocal(manana)}T${hhmm(manana)}:00</StartBoundary>`), (/<StartBoundary>([^<]+)/.exec(xml || '') || [])[1]);
} catch (x) {
    fallos++;
    console.log('NO  inesperado:', x.stack || x.message);
} finally {
    await baseCentral.cerrar().catch(() => {});
    if (deLaPrueba()) ps(`Get-Process AmoxSQL -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq '${EXE.replace(/'/g, "''")}' } | Stop-Process -Force`);
    // ── 4. Se borra la tarea de prueba
    try { execFileSync('schtasks.exe', ['/Delete', '/TN', TAREA, '/F'], { windowsHide: true, stdio: 'ignore' }); } catch { /* ya no estaba */ }
    anota('la tarea de prueba se borró', xmlDe(TAREA) === null);
    anota('la del usuario, intacta al final', xmlDe(TAREA_DEL_USUARIO) === antesDelUsuario);
}

console.log(`\n${pasadas}/${pasadas + fallos} como se esperaba (${reloj()}) · home ${HOME}`);
process.exit(fallos ? 1 : 0);
