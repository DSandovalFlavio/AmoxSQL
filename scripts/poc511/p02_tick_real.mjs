/**
 * La aplicación instalada, sin ventana, se pone al día (fase 8 del plan).
 *
 *     node scripts/poc511/p02_tick_real.mjs --exe "dist/win-unpacked/AmoxSQL.exe"
 *
 * Con un home TEMPORAL (no toca la base del autor):
 *   1. Deja una programación «cada día» creada hace dos días, cuya hora de
 *      ayer y de hoy pasaron con AmoxSQL cerrado.
 *   2. Lanza `AmoxSQL.exe tick` (lo que llamaría la tarea de Windows): corre
 *      SÓLO la última ocurrencia, dice que se perdió una, enseña el aviso del
 *      sistema y sale con 0.
 *   3. Un segundo `tick` no corre nada (la misma ocurrencia nunca dos veces).
 * El aviso de Windows se mira a mano (o con una captura) mientras corre.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ESTE = fileURLToPath(import.meta.url);
const RAIZ = path.resolve(path.dirname(ESTE), '..', '..');
const i = process.argv.indexOf('--exe');
if (i < 0) { console.error('Falta --exe <AmoxSQL.exe>'); process.exit(2); }
const EXE = path.resolve(process.argv[i + 1]);
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'amox-tick-'));
const HOME = path.join(TMP, 'home');
const PR = path.join(TMP, 'proyecto');
fs.mkdirSync(HOME, { recursive: true });
fs.mkdirSync(PR, { recursive: true });
process.env.AMOXSQL_HOME = HOME;
process.env.AMOXSQL_LLAVERO_DE_PRUEBA = '1';

const require = createRequire(import.meta.url);
const baseCentral = require(path.join(RAIZ, 'server/central/BaseCentral.js'));
const programaciones = require(path.join(RAIZ, 'server/programacion/programaciones.js'));

let pasadas = 0, fallos = 0;
const anota = (t, ok, d = '') => { ok ? pasadas++ : fallos++; console.log(`${ok ? 'SI ' : 'NO '} ${t}${d ? `  — ${d}` : ''}`); };
const dos = (n) => String(n).padStart(2, '0');
const diaLocal = (d) => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;

const tick = () => {
    const env = { ...process.env, AMOXSQL_HOME: HOME };
    delete env.AMOXSQL_LLAVERO_DE_PRUEBA;          // la aplicación usa el llavero de verdad
    delete env.ELECTRON_RUN_AS_NODE;
    const t = Date.now();
    const r = spawnSync(EXE, ['tick'], { env, encoding: 'utf8', timeout: 180000 });
    return { codigo: r.status, salida: `${r.stdout || ''}${r.stderr || ''}`.trim(), s: Math.round((Date.now() - t) / 100) / 10 };
};

try {
    fs.writeFileSync(path.join(PR, 'cierre.sqlchain'), JSON.stringify({
        version: '1.0', name: 'Cierre diario', config: { base: 'memoria' },
        parametros: [{ nombre: 'dia', tipo: 'fecha' }], variables: { dia: '2026-01-01' },
        nodes: [
            { id: 'leer', type: 'sql_inline', label: 'Ventas', position: { x: 0, y: 0 },
                config: { query: `SELECT '\${dia}'::DATE AS dia, * FROM (VALUES ('norte', 120.5), ('sur', 80)) t(tienda, importe)` } },
            { id: 'libro', type: 'excel', label: 'Libro', position: { x: 300, y: 0 },
                config: { modo: 'libro', outputPath: 'salidas/cierre_{fecha}.xlsx', hojas: [{ desde: 'leer', nombre: 'Resumen' }] } },
        ],
        edges: [{ id: 'e1', source: 'leer', target: 'libro' }],
    }, null, 2));

    // 1. Creada hace dos días, a una hora que hoy ya pasó.
    const ahora = new Date();
    const hora = new Date(ahora.getTime() - 30 * 60000);
    await baseCentral.abrir();
    const prog = await programaciones.crear({
        proceso: path.join(PR, 'cierre.sqlchain'), proyecto: PR, nombre: 'Cierre diario',
        regla: { tipo: 'diaria', hora: `${dos(hora.getHours())}:${dos(hora.getMinutes())}` }, parametros: { dia: 'hoy' }, avisar: 'siempre',
    }, { ahora: new Date(ahora.getTime() - 2 * 86400000) });
    anota('programación creada hace dos días', !!prog?.id);
    await baseCentral.cerrar();

    // 2. AmoxSQL.exe tick, como lo llamaría la tarea de Windows.
    console.log(`\nAmoxSQL.exe tick (mira el aviso de Windows)…`);
    const t1 = tick();
    console.log(t1.salida.split('\n').map(l => `   | ${l}`).join('\n'));
    anota('sale con 0', t1.codigo === 0, `código ${t1.codigo}, ${t1.s} s`);
    await baseCentral.abrir();
    const ej = await baseCentral.query(`SELECT origen, estado, prevista, parametros FROM ejecuciones WHERE programacion_id = $1`, [prog.id]);
    anota('corrió una sola vez (la última ocurrencia, no las dos)', ej.length === 1 && ej[0].estado === 'ok', JSON.stringify(ej));
    anota('  con la fecha de hoy', JSON.parse(ej[0]?.parametros || '{}').dia === diaLocal(hora), ej[0]?.parametros);
    const libro = path.join(PR, 'salidas', `cierre_${diaLocal(hora)}.xlsx`);
    anota('dejó su Excel', fs.existsSync(libro), libro);
    await baseCentral.cerrar();

    // 3. Otra vez: nada.
    const t2 = tick();
    await baseCentral.abrir();
    const ej2 = await baseCentral.query(`SELECT count(*)::INTEGER AS n FROM ejecuciones WHERE programacion_id = $1`, [prog.id]);
    anota('un segundo tick no la repite', t2.codigo === 0 && ej2[0].n === 1, `código ${t2.codigo}, ${ej2[0].n} ejecuciones, ${t2.s} s`);
    await baseCentral.cerrar();
} catch (x) {
    fallos++;
    console.log('NO  inesperado:', x.stack || x.message);
}

console.log(`\n${pasadas}/${pasadas + fallos} como se esperaba · home ${HOME}`);
process.exit(fallos ? 1 : 0);
