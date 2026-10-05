/**
 * Las órdenes de la línea de comandos (A3): la parte que no corre nada.
 *
 * La comparten el proceso principal de Electron —que lee los argumentos, decide
 * a quién entregar la orden y espera el resultado— y el servidor, que la
 * atiende. Por eso no carga nada pesado: sólo fs, path y dónde está el home.
 *
 *     AmoxSQL.exe run <proceso.sqlchain> --project <ruta> [--param nombre=valor]… [--batch <lote.csv>]
 *
 * `--batch` (5.11, D4): una ejecución por fila de un CSV (o de una lista JSON);
 * la primera línea nombra los parámetros. Los `--param` valen para todas.
 *
 *     AmoxSQL.exe tick
 *
 * (5.11, D1) Corre las programaciones que tocan y se pone al día. La lanza la
 * tarea del sistema; con AmoxSQL abierto, se le entrega como cualquier orden.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { homeAmox } = require('../rutas');

const CODIGO = { ok: 0, fallo: 1, argumentos: 2, credencial: 3, sinRespuesta: 4, noExiste: 5 };

const USO = 'Usage: AmoxSQL run <process.sqlchain> --project <folder> [--param name=value]... [--batch <runs.csv>]';

const carpeta = (nombre) => {
    const c = path.join(homeAmox(), nombre);
    fs.mkdirSync(c, { recursive: true });
    return c;
};
const rutaDelResultado = (id) => path.join(carpeta('ejecuciones'), `${id}.json`);
const rutaDelRegistro = (id) => path.join(carpeta('registros'), `${id}.log`);

/**
 * Lee los argumentos. `desde` es dónde empiezan los del usuario: 1 en el
 * ejecutable instalado (`AmoxSQL.exe run …`), 2 en desarrollo (`electron . run …`).
 *
 * @returns null si no es una orden (un arranque normal), o
 *   { orden: 'run', proceso, proyecto, parametros, informe, error? }
 *   con las rutas ya absolutas respecto a `cwd`.
 */
function leerArgumentos(argv, { desde = 1, cwd = process.cwd() } = {}) {
    const a = (argv || []).slice(desde);
    // Chromium y Electron añaden interruptores propios (--allow-file-access-…);
    // la orden es la primera palabra que no es uno de ellos.
    const primera = a.findIndex(x => !String(x).startsWith('--'));
    if (primera < 0) return null;
    if (a[primera] === 'tick') {
        const r = { orden: 'tick', proceso: null, proyecto: null, parametros: {}, informe: null };
        const i = a.findIndex(x => x === '--informe' || String(x).startsWith('--informe='));
        if (i >= 0) {
            const v = a[i].includes('=') ? a[i].slice(a[i].indexOf('=') + 1) : a[i + 1];
            if (v) r.informe = path.resolve(cwd, v);
        }
        return r;
    }
    if (a[primera] !== 'run') return null;

    const r = { orden: 'run', proceso: null, proyecto: null, parametros: {}, informe: null, lote: null };
    const error = (texto) => ({ ...r, error: `${texto}\n${USO}` });
    const valorDe = (i, nombre) => {
        const x = a[i];
        const igual = x.indexOf('=');
        if (igual > 0) return { valor: x.slice(igual + 1), salto: 0 };
        if (i + 1 >= a.length || String(a[i + 1]).startsWith('--')) return { falta: nombre };
        return { valor: a[i + 1], salto: 1 };
    };

    for (let i = primera + 1; i < a.length; i++) {
        const x = String(a[i]);
        if (x === '--project' || x.startsWith('--project=')) {
            const v = valorDe(i, '--project');
            if (v.falta) return error('--project needs a folder.');
            r.proyecto = v.valor; i += v.salto;
        } else if (x === '--param' || x.startsWith('--param=')) {
            const v = valorDe(i, '--param');
            if (v.falta) return error('--param needs name=value.');
            const igual = v.valor.indexOf('=');
            if (igual < 1) return error(`--param "${v.valor}" is not name=value.`);
            r.parametros[v.valor.slice(0, igual).trim()] = v.valor.slice(igual + 1);
            i += v.salto;
        } else if (x === '--batch' || x.startsWith('--batch=')) {
            const v = valorDe(i, '--batch');
            if (v.falta) return error('--batch needs a .csv or .json file: one run per row.');
            r.lote = v.valor; i += v.salto;
        } else if (x === '--informe' || x.startsWith('--informe=')) {
            // Lo pasa amoxsql.cmd: un archivo donde dejar el texto para la consola.
            const v = valorDe(i, '--informe');
            if (!v.falta) { r.informe = path.resolve(cwd, v.valor); i += v.salto; }
        } else if (x.startsWith('--')) {
            continue;                                // de Chromium: no es nuestro
        } else if (!r.proceso) {
            r.proceso = x;
        } else {
            return error(`Unexpected argument "${x}".`);
        }
    }

    if (!r.proceso) return error('Which process? Give the path of a .sqlchain file.');
    if (!/\.sqlchain$/i.test(r.proceso)) return error(`"${r.proceso}" is not a .sqlchain file.`);
    if (!r.proyecto) return error('--project is required: the folder of the project the process belongs to.');

    // Rutas absolutas AQUÍ, con el cwd de quien lanzó la orden: si se entrega a
    // la aplicación abierta, ella está en otra carpeta.
    r.proyecto = path.resolve(cwd, r.proyecto);
    if (r.lote) r.lote = path.resolve(cwd, r.lote);
    if (path.isAbsolute(r.proceso)) {
        r.proceso = path.resolve(r.proceso);
    } else {
        const desdeAqui = path.resolve(cwd, r.proceso);
        r.proceso = fs.existsSync(desdeAqui) ? desdeAqui : path.resolve(r.proyecto, r.proceso);
    }
    return r;
}

/** Lo que se sabe sin arrancar nada: que existan la carpeta y el archivo. */
function comprobarQueExiste(r) {
    if (r.orden === 'tick') return null;
    if (!fs.existsSync(r.proyecto) || !fs.statSync(r.proyecto).isDirectory()) {
        return `The project folder does not exist: ${r.proyecto}`;
    }
    if (!fs.existsSync(r.proceso)) return `The process does not exist: ${r.proceso}`;
    if (r.lote && !fs.existsSync(r.lote)) return `The batch file does not exist: ${r.lote}`;
    return null;
}

const nuevoId = () => `${new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '')}-${crypto.randomBytes(4).toString('hex')}`;

/** Escribe un JSON de una vez (temporal + rename): quien lo espera nunca lee medio archivo. */
function escribirJson(destino, datos) {
    const temporal = `${destino}.${process.pid}.tmp`;
    fs.writeFileSync(temporal, JSON.stringify(datos, null, 2));
    fs.renameSync(temporal, destino);
}

function leerJson(ruta) {
    try { return JSON.parse(fs.readFileSync(ruta, 'utf8')); } catch { return null; }
}

/** Lo que se lee en la consola, a partir del resultado. */
function textoDelResultado(r) {
    if (r.orden === 'tick') {
        // Las horas, en la de esta máquina: es lo que se lee en la consola.
        const local = (iso) => {
            if (!iso) return '';
            const d = new Date(iso);
            const dos = (n) => String(n).padStart(2, '0');
            return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())} ${dos(d.getHours())}:${dos(d.getMinutes())}`;
        };
        const c = r.corridas || [];
        const l = [r.pausado ? `AmoxSQL: schedules are paused until ${local(r.pausado)}` : `AmoxSQL: ${c.length ? `${c.length} scheduled process${c.length === 1 ? '' : 'es'} ran` : 'nothing was due'}`];
        for (const x of c) l.push(`  ${x.estado === 'ok' ? 'ok  ' : 'FAIL'} ${x.nombre} (due ${local(x.prevista)})${x.perdidas ? `, ${x.perdidas} missed before it` : ''}${x.error ? ` — ${x.error}` : ''}`);
        for (const x of r.saltadas || []) l.push(`  skip ${x.nombre}: ${x.motivo}`);
        if (r.proxima) l.push(`  Next: ${local(r.proxima)}`);
        return l.join('\n') + '\n';
    }
    const nombre = path.basename(r.proceso || '') || 'process';
    const donde = r.entregada ? ' (run by the open AmoxSQL)' : '';
    const l = [r.codigo === 0 ? `AmoxSQL: ${nombre} finished${donde}` : `AmoxSQL: ${nombre} failed (exit code ${r.codigo})${donde}`];
    if (r.mensaje) l.push(`  ${r.mensaje}`);
    if (Array.isArray(r.lote)) {
        const bien = r.lote.filter(x => x.codigo === 0).length;
        l.push(`  ${bien} of ${r.lote.length} runs finished`);
        for (const x of r.lote) {
            const ps = Object.entries(x.parametros || {}).map(([k, v]) => `${k}=${v}`).join(', ');
            l.push(`  ${x.codigo === 0 ? 'ok  ' : 'FAIL'} ${ps}${x.mensaje ? ` — ${x.mensaje}` : ''}`);
        }
    }
    for (const p of r.pasos || []) {
        l.push(`  ${p.estado === 'ok' ? 'ok  ' : 'FAIL'} ${p.nodo}${p.filas != null ? ` (${p.filas} rows)` : ''}${p.error ? ` — ${p.error}` : ''}`);
    }
    if (r.duracionMs != null) l.push(`  ${(r.duracionMs / 1000).toFixed(1)} s`);
    if (r.registro) l.push(`  Log: ${r.registro}`);
    return l.join('\n') + '\n';
}

module.exports = {
    CODIGO, USO, leerArgumentos, comprobarQueExiste, nuevoId,
    rutaDelResultado, rutaDelRegistro, escribirJson, leerJson, textoDelResultado,
};
