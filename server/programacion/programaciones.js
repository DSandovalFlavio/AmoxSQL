/**
 * programaciones.js — lo programado y el `tick` (5.11, D1; Dec-15, 16 y 17).
 *
 * Una programación es de ESTA máquina (Dec-15): vive en la base de AmoxSQL, no
 * en el `.sqlchain`. Dice qué proceso, de qué proyecto, cuándo (una regla de
 * `reglas.js`), con qué parámetros, a quién avisar y si se pone al día.
 *
 * `tick(ahora)` es lo único que corre procesos programados. Lo llaman el reloj
 * de la aplicación abierta (cada minuto) y, si el usuario lo activó, la tarea
 * del sistema (`AmoxSQL.exe tick`). Para cada programación:
 *
 *   - mira las ocurrencias desde la última que atendió hasta ahora;
 *   - corre UNA: la más reciente (Dec-17). Si estuvo apagada tres días, «se
 *     perdieron 2, se corrió la última». Nunca una de hace más de 7 días; y si
 *     la programación no se pone al día, sólo la que tocaba hace menos de 15 min;
 *   - la clave (programación, hora prevista) en `ejecuciones` impide correr dos
 *     veces la misma ocurrencia, llegue el tick de donde llegue (Dec-16);
 *   - si la anterior sigue corriendo, ésta se salta y se dice.
 *
 * La pausa general («Pause everything until…», Dec-24) vive en preferencias:
 * mientras dura, el tick no corre nada y lo apunta.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const baseCentral = require('../central/BaseCentral');
const reglas = require('./reglas');
const calendario = require('./calendario');

const SIETE_DIAS = 7 * 24 * 3600 * 1000;
const TOLERANCIA = 15 * 60 * 1000;
const AVISAR = ['siempre', 'fallo', 'nunca'];

class ErrorDeProgramacion extends Error {}

const json = (t, porDefecto = null) => { try { return t ? JSON.parse(t) : porDefecto; } catch { return porDefecto; } };
const iso = (d) => (d ? new Date(d).toISOString() : null);
// Las horas se guardan en UTC (con iso()) en columnas TIMESTAMP, que vuelven sin
// zona: hay que leerlas como UTC, o se correrían tantas horas como el huso.
const deBase = (t) => (t ? new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(String(t)) ? String(t) : `${String(t).replace(' ', 'T')}Z`).toISOString() : null);

function workspaceDe(proyecto) {
    try {
        const pj = JSON.parse(fs.readFileSync(path.join(proyecto, '.amoxsql', 'project.json'), 'utf8'));
        return pj?.workspace?.id || null;
    } catch { return null; }
}

const calendarioDe = (prog) => calendario.leer(prog.workspace_id || workspaceDe(prog.proyecto));

function desdeFila(f) {
    const regla = json(f.regla, {});
    let descripcion = '';
    try { descripcion = reglas.describir(regla); } catch { descripcion = 'Invalid schedule'; }
    return {
        id: f.id, nombre: f.nombre, proceso: f.proceso, proyecto: f.proyecto, workspaceId: f.workspace_id,
        regla, descripcion, parametros: json(f.parametros, {}), avisar: f.avisar,
        ponerseAlDia: f.ponerse_al_dia === true || f.ponerse_al_dia === 'true',
        activa: f.activa === true || f.activa === 'true',
        pausadaHasta: deBase(f.pausada_hasta), creada: deBase(f.creada),
        ultimaPrevista: deBase(f.ultima_prevista), proxima: deBase(f.proxima),
    };
}

/** Comprueba lo que se va a guardar: el proceso existe y sus parámetros son de su tipo. */
function comprobar({ proceso, proyecto, regla, parametros }) {
    if (!proyecto || !fs.existsSync(proyecto)) throw new ErrorDeProgramacion(`The project folder does not exist: ${proyecto}`);
    const abs = path.isAbsolute(proceso) ? proceso : path.resolve(proyecto, proceso);
    if (!fs.existsSync(abs)) throw new ErrorDeProgramacion(`The process does not exist: ${abs}`);
    const r = reglas.normalizar(regla);
    let cadena;
    try { cadena = JSON.parse(fs.readFileSync(abs, 'utf8')); } catch (e) { throw new ErrorDeProgramacion(`The process could not be read: ${e.message}`); }
    const params = parametros && typeof parametros === 'object' ? parametros : {};
    // 'hoy' en una fecha vale: será la fecha de la ocurrencia.
    require('../parametros').resolver(cadena, Object.fromEntries(Object.entries(params).map(([k, v]) => [k, /^(hoy|today)$/i.test(String(v)) ? '2000-01-01' : v])));
    return { abs, r, params, nombre: cadena.name || path.basename(abs).replace(/\.sqlchain$/i, '') };
}

async function crear(datos, { ahora = new Date() } = {}) {
    const { abs, r, params, nombre } = comprobar(datos);
    const id = crypto.randomUUID();
    const prog = { workspace_id: workspaceDe(datos.proyecto), proyecto: datos.proyecto };
    const proxima = reglas.siguiente(r, ahora, calendarioDe(prog));
    await baseCentral.query(
        `INSERT INTO programaciones (id, nombre, proceso, proyecto, workspace_id, regla, parametros, avisar, ponerse_al_dia, activa, ultima_prevista, proxima, creada)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, $10, $11, $10)`,
        [id, String(datos.nombre || nombre).slice(0, 200), abs, path.resolve(datos.proyecto), prog.workspace_id, JSON.stringify(r),
            JSON.stringify(params), AVISAR.includes(datos.avisar) ? datos.avisar : 'siempre', datos.ponerseAlDia !== false, iso(ahora), iso(proxima)]
    );
    return leer(id);
}

async function leer(id) {
    const [f] = await baseCentral.query(`SELECT * FROM programaciones WHERE id = $1`, [id]);
    return f ? desdeFila(f) : null;
}

async function actualizar(id, datos, { ahora = new Date() } = {}) {
    const actual = await leer(id);
    if (!actual) throw new ErrorDeProgramacion('That schedule does not exist.');
    const junto = { ...actual, ...datos, proceso: actual.proceso, proyecto: actual.proyecto };
    const { r, params } = comprobar(junto);
    const proxima = reglas.siguiente(r, ahora, calendarioDe({ workspace_id: actual.workspaceId, proyecto: actual.proyecto }));
    await baseCentral.query(
        `UPDATE programaciones SET nombre = $2, regla = $3, parametros = $4, avisar = $5, ponerse_al_dia = $6, proxima = $7 WHERE id = $1`,
        [id, String(junto.nombre).slice(0, 200), JSON.stringify(r), JSON.stringify(params),
            AVISAR.includes(junto.avisar) ? junto.avisar : 'siempre', junto.ponerseAlDia !== false, iso(proxima)]
    );
    return leer(id);
}

async function borrar(id) {
    await baseCentral.query(`DELETE FROM programaciones WHERE id = $1`, [id]);
}

/** Pausar una («hasta» una fecha, o sin fecha: hasta reanudarla) o reanudarla (null). */
async function pausar(id, { hasta = undefined, reanudar = false } = {}) {
    if (reanudar) await baseCentral.query(`UPDATE programaciones SET activa = true, pausada_hasta = NULL WHERE id = $1`, [id]);
    else if (hasta) await baseCentral.query(`UPDATE programaciones SET activa = true, pausada_hasta = $2 WHERE id = $1`, [id, iso(hasta)]);
    else await baseCentral.query(`UPDATE programaciones SET activa = false, pausada_hasta = NULL WHERE id = $1`, [id]);
    return leer(id);
}

/** La pausa general (Dec-24): una fecha, o null para quitarla. */
async function pausaGeneral(hasta) {
    if (hasta === undefined) {
        const v = await baseCentral.preferencia('pausa_programaciones');
        return v && new Date(v) > new Date() ? v : null;
    }
    await baseCentral.guardarPreferencia('pausa_programaciones', hasta ? iso(hasta) : null);
    return hasta ? iso(hasta) : null;
}

/** Todas, con su última ejecución. */
async function listar() {
    const filas = await baseCentral.query(`SELECT * FROM programaciones ORDER BY proxima NULLS LAST, nombre`);
    const ultimas = await baseCentral.query(
        `SELECT programacion_id, id, estado, inicio, fin, prevista, error, resumen FROM (
            SELECT *, row_number() OVER (PARTITION BY programacion_id ORDER BY inicio DESC) AS n
            FROM ejecuciones WHERE programacion_id IS NOT NULL) WHERE n = 1`
    );
    const porProg = new Map(ultimas.map(u => [u.programacion_id, u]));
    return filas.map(f => {
        const p = desdeFila(f);
        const u = porProg.get(p.id);
        return { ...p, ultima: u ? { id: u.id, estado: u.estado, inicio: u.inicio, fin: u.fin, prevista: deBase(u.prevista), error: u.error, resumen: json(u.resumen) } : null };
    });
}

/** La próxima hora a la que toca algo, de todas (para la tarea del sistema). null si nada. */
async function proximaGlobal() {
    const pausa = await pausaGeneral();
    const filas = await baseCentral.query(`SELECT proxima, pausada_hasta FROM programaciones WHERE activa AND proxima IS NOT NULL`);
    let min = null;
    for (const f of filas) {
        let t = new Date(deBase(f.proxima));
        if (f.pausada_hasta && new Date(deBase(f.pausada_hasta)) > t) t = new Date(deBase(f.pausada_hasta));
        if (pausa && new Date(pausa) > t) t = new Date(pausa);
        if (!min || t < min) min = t;
    }
    return min;
}

let ocupado = false;

/**
 * Corre lo que toca. `correr(prog, prevista)` corre una ocurrencia y devuelve
 * { runId, estado, resumen }: lo da quien llama (el servidor), así esto se
 * prueba con un reloj y un ejecutor falsos.
 * @returns { pausado?, ocupado?, corridas: [...], saltadas: [...] }
 */
async function tick({ ahora = new Date(), correr }) {
    if (ocupado) return { ocupado: true, corridas: [], saltadas: [] };
    ocupado = true;
    try {
        const pausa = await pausaGeneral();
        if (pausa && new Date(pausa) > ahora) return { pausado: pausa, corridas: [], saltadas: [] };
        const corridas = [], saltadas = [];
        const filas = await baseCentral.query(`SELECT * FROM programaciones WHERE activa`);
        for (const f of filas) {
            const prog = desdeFila(f);
            if (prog.regla?.tipo === 'al_llegar') continue;
            const cal = calendarioDe(f);
            const proxima = () => reglas.siguiente(prog.regla, ahora, cal);
            if (prog.pausadaHasta && new Date(prog.pausadaHasta) > ahora) continue;
            let occ;
            try { occ = reglas.ocurrencias(prog.regla, prog.ultimaPrevista || prog.creada, ahora, cal, 2000); } catch { continue; }
            if (!occ.length) continue;
            const ultima = occ[occ.length - 1];
            let aCorrer = ultima;
            let motivo = null;
            if (ahora - ultima > SIETE_DIAS) { aCorrer = null; motivo = 'more than 7 days ago'; }
            else if (!prog.ponerseAlDia && ahora - ultima > TOLERANCIA) { aCorrer = null; motivo = 'missed, and this schedule does not catch up'; }
            const perdidas = occ.length - (aCorrer ? 1 : 0);
            // Se apunta antes de correr: un tick que llegue mientras tanto no la repite.
            await baseCentral.query(`UPDATE programaciones SET ultima_prevista = $2, proxima = $3 WHERE id = $1`, [prog.id, iso(ultima), iso(proxima())]);
            if (!aCorrer) { saltadas.push({ programacionId: prog.id, nombre: prog.nombre, perdidas, motivo }); continue; }
            const [ya] = await baseCentral.query(`SELECT count(*)::INTEGER AS n FROM ejecuciones WHERE programacion_id = $1 AND prevista = $2`, [prog.id, iso(aCorrer)]);
            if (ya.n) continue;
            const [enCurso] = await baseCentral.query(`SELECT count(*)::INTEGER AS n FROM ejecuciones WHERE programacion_id = $1 AND estado = 'en_curso'`, [prog.id]);
            if (enCurso.n) { saltadas.push({ programacionId: prog.id, nombre: prog.nombre, perdidas: perdidas + 1, motivo: 'the previous run is still going' }); continue; }
            let r;
            // `perdidas` ya no cuenta la que se corre.
            try { r = await correr(prog, aCorrer, { perdidas }); }
            catch (e) { r = { estado: 'fallo', error: e.message }; }
            corridas.push({ programacionId: prog.id, nombre: prog.nombre, prevista: iso(aCorrer), perdidas, ...r });
        }
        return { corridas, saltadas };
    } finally {
        ocupado = false;
    }
}

/**
 * Los parámetros de una ocurrencia: los de la programación, con «hoy» en una
 * fecha cambiado por el día que tocaba (el cierre de septiembre que corre el
 * 2 de octubre usa su fecha).
 */
function parametrosDeOcurrencia(prog, prevista) {
    const d = new Date(prevista);
    const dia = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return Object.fromEntries(Object.entries(prog.parametros || {}).map(([k, v]) => [k, /^(hoy|today)$/i.test(String(v)) ? dia : v]));
}

module.exports = {
    ErrorDeProgramacion, crear, leer, actualizar, borrar, pausar, pausaGeneral, listar, proximaGlobal,
    tick, parametrosDeOcurrencia, workspaceDe,
};
