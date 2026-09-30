/**
 * La base de AmoxSQL (A5): lo que pertenece a la máquina y no a un proyecto.
 *
 * Workspaces, el índice de proyectos, las credenciales cifradas, las
 * ejecuciones y las preferencias. Vive en `<homeAmox>/amoxsql.duckdb`, fuera de
 * cualquier proyecto, y la abre SÓLO este proceso: la instancia única de
 * Electron garantiza que nunca corren dos AmoxSQL a la vez (Dec-1 del plan).
 *
 * Tres garantías:
 *
 * 1. Todo pasa por una cola. La conexión es una sola, y sin cola la consulta
 *    de una petición podría colarse dentro de la transacción de otra.
 * 2. Nada se interpola en el SQL. Los valores viajan como parámetros
 *    (`run(sql, valores)`): aquí se guardan nombres de credenciales y rutas.
 * 3. Una base de una versión posterior no se toca. Si el esquema es más nuevo
 *    que lo que este programa entiende —una beta que abre la base de otra más
 *    reciente—, se niega a abrirla y lo dice, en vez de estropearla.
 *
 * Si no se puede abrir, el servidor sigue arrancando: `estado()` explica por
 * qué, y lo que dependa de esta base lo comprueba antes de usarla.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { DuckDBInstance } = require('@duckdb/node-api');
const { homeAmox } = require('../rutas');
const { MIGRACIONES } = require('./migraciones');

const NOMBRE = 'amoxsql.duckdb';
const VERSION_MAXIMA = MIGRACIONES[MIGRACIONES.length - 1].version;

/** Una ruta tal como la compara Windows: absoluta y sin distinguir mayúsculas. */
const normalizarRuta = (r) => {
    const abs = path.resolve(String(r));
    return process.platform === 'win32' ? abs.toLowerCase() : abs;
};

/**
 * El error de DuckDB cuando otro proceso tiene el archivo, dicho para personas.
 *
 * No basta con buscar «lock»: en Windows el motor dice «being used by another
 * process … File is already open in <programa> (PID n)», sin esa palabra. Se
 * aprovecha que nombra al culpable: si es AmoxSQL.exe, el usuario sabe cuál
 * cerrar.
 */
function mensajeDeApertura(original, ruta) {
    if (!/lock|being used by another process|already open/i.test(original)) return original;
    const quien = original.match(/already open in\s+(.+?)\s*\(PID (\d+)\)/i);
    const detalle = quien ? ` (${path.basename(quien[1].trim())}, PID ${quien[2]})` : '';
    return `La base de AmoxSQL (${ruta}) la tiene abierta otro proceso${detalle}. ¿Hay otra AmoxSQL abierta?`;
}

/** Una fecha para una columna TIMESTAMP (sin zona): UTC, sin la «Z» del final. */
const marcaDeTiempo = (d) => d.toISOString().replace('T', ' ').replace('Z', '');

class BaseCentral {
    constructor() {
        this.instancia = null;
        this.conexion = null;
        this._abriendo = null;
        this._cola = Promise.resolve();
        this._estado = { ok: false, abierta: false, version: null, ruta: null, error: null };
    }

    ruta() { return path.join(homeAmox(), NOMBRE); }
    estado() { return { ...this._estado, versionMaxima: VERSION_MAXIMA }; }
    /** Abierta DEL TODO: con la conexión y ya migrada. */
    estaAbierta() { return !!this.conexion && !this._abriendo; }

    /**
     * Abre (una vez) y migra. Llamarla de nuevo con la base abierta no hace nada.
     *
     * OJO con el orden de las dos comprobaciones: `_abrir` asigna la conexión
     * ANTES de migrar, porque la migración la necesita. Si se mirara primero la
     * conexión, una petición que llegara a mitad de la apertura —la del servidor
     * arranca en segundo plano— creería la base lista y leería un estado vacío.
     */
    async abrir() {
        if (this._abriendo) return this._abriendo;
        if (this.conexion) return this;
        this._abriendo = this._abrir().finally(() => { this._abriendo = null; });
        return this._abriendo;
    }

    async _abrir() {
        const ruta = this.ruta();
        try {
            fs.mkdirSync(path.dirname(ruta), { recursive: true });
            this.instancia = await DuckDBInstance.create(ruta);
            this.conexion = await this.instancia.connect();
            // Migrar y reparar van por la cola: la conexión ya existe, y una
            // consulta que llegara ahora no puede colarse a mitad de migración.
            const { version, interrumpidas } = await this._enCola(async () => ({
                version: await this._migrar(),
                interrumpidas: await this._repararEjecuciones(),
            }));
            this._estado = { ok: true, abierta: true, version, ruta, error: null };
            console.log(`[Central] Abierta ${ruta} (esquema v${version}${interrumpidas ? `, ${interrumpidas} ejecución(es) marcadas como interrumpidas` : ''}).`);
            return this;
        } catch (e) {
            this._soltar();
            const mensaje = mensajeDeApertura(e?.message || String(e), ruta);
            this._estado = { ok: false, abierta: false, version: null, ruta, error: mensaje };
            console.error('[Central] No se pudo abrir:', mensaje);
            throw new Error(mensaje);
        }
    }

    /** Guarda lo pendiente y suelta el archivo. */
    async cerrar() {
        if (!this.conexion) return;
        try { await this._enCola(() => this._ejecutar('CHECKPOINT')); } catch { /* al cerrar, lo que no se pudo guardar ya no se guarda */ }
        this._soltar();
        this._estado = { ...this._estado, abierta: false };
    }

    _soltar() {
        try { this.conexion?.closeSync(); } catch { /* ya estaba cerrada */ }
        try { this.instancia?.closeSync(); } catch { /* ya estaba cerrada */ }
        this.conexion = null;
        this.instancia = null;
    }

    // ── Consultas ────────────────────────────────────────────────────────────

    /** Filas como objetos JSON-seguros. `params` va como parámetros, nunca pegado al SQL. */
    async query(sql, params) {
        return this._enCola(() => this._ejecutar(sql, params));
    }

    /** El mismo contrato que dbManager.systemQuery, para quien lo espere. */
    async systemQuery(sql, params) { return this.query(sql, params); }

    /**
     * Todo o nada. `fn` recibe su propia función de consulta, que va directa a
     * la conexión: si usara `query`, se pondría en la cola detrás de sí misma.
     */
    async transaccion(fn) {
        return this._enCola(async () => {
            await this._ejecutar('BEGIN TRANSACTION');
            try {
                const r = await fn((sql, params) => this._ejecutar(sql, params));
                await this._ejecutar('COMMIT');
                return r;
            } catch (e) {
                try { await this._ejecutar('ROLLBACK'); } catch { /* ya estaba deshecha */ }
                throw e;
            }
        });
    }

    async _ejecutar(sql, params) {
        if (!this.conexion) throw new Error('La base de AmoxSQL no está abierta.');
        const r = params === undefined ? await this.conexion.run(sql) : await this.conexion.run(sql, params);
        return r.getRowObjectsJson();
    }

    _enCola(fn) {
        const turno = this._cola.then(fn, fn);
        // La cola sigue aunque una operación falle; el fallo lo recibe quien la pidió.
        this._cola = turno.then(() => {}, () => {});
        return turno;
    }

    // ── Esquema ──────────────────────────────────────────────────────────────

    async _migrar() {
        await this._ejecutar(`CREATE TABLE IF NOT EXISTS meta (clave VARCHAR PRIMARY KEY, valor VARCHAR)`);
        const filas = await this._ejecutar(`SELECT valor FROM meta WHERE clave = 'version_esquema'`);
        let actual = filas.length ? Number(filas[0].valor) : 0;

        if (actual > VERSION_MAXIMA) {
            throw new Error(
                `La base de AmoxSQL tiene el esquema v${actual}, y esta versión de la aplicación sólo entiende hasta ` +
                `la v${VERSION_MAXIMA}. La creó una versión más nueva: ábrela con esa, o actualiza. No se ha tocado nada.`
            );
        }

        for (const m of MIGRACIONES) {
            if (m.version <= actual) continue;
            await this._ejecutar('BEGIN TRANSACTION');
            try {
                for (const sql of m.sql) await this._ejecutar(sql);
                await this._ejecutar(`INSERT OR REPLACE INTO meta VALUES ('version_esquema', $1)`, [String(m.version)]);
                if (actual === 0) {
                    await this._ejecutar(`INSERT OR REPLACE INTO meta VALUES ('creada', $1)`, [new Date().toISOString()]);
                }
                await this._ejecutar('COMMIT');
            } catch (e) {
                try { await this._ejecutar('ROLLBACK'); } catch { /* ya estaba deshecha */ }
                throw new Error(`Falló la migración ${m.version} (${m.nombre}): ${e?.message || e}`);
            }
            console.log(`[Central] Migración ${m.version} (${m.nombre}) aplicada.`);
            actual = m.version;
        }
        return actual;
    }

    /**
     * Lo que se quedó «en curso» cuando la aplicación se cerró —o se cayó— no va
     * a terminar ya. Se dice que se interrumpió, en vez de dejarlo corriendo
     * para siempre en el historial.
     */
    async _repararEjecuciones() {
        const [{ n }] = await this._ejecutar(`SELECT count(*)::INTEGER AS n FROM ejecuciones WHERE estado = 'en_curso'`);
        if (n > 0) {
            await this._ejecutar(
                `UPDATE ejecuciones SET estado = 'interrumpida', fin = coalesce(fin, current_timestamp) WHERE estado = 'en_curso'`
            );
        }
        return n;
    }

    // ── Preferencias ─────────────────────────────────────────────────────────

    async preferencia(clave) {
        const filas = await this.query(`SELECT valor FROM preferencias WHERE clave = $1`, [clave]);
        if (!filas.length) return undefined;
        try { return JSON.parse(filas[0].valor); } catch { return filas[0].valor; }
    }

    async guardarPreferencia(clave, valor) {
        await this.query(`INSERT OR REPLACE INTO preferencias VALUES ($1, $2)`, [clave, JSON.stringify(valor)]);
    }

    // ── Proyectos ────────────────────────────────────────────────────────────

    /**
     * Los recientes de la 5.8 vivían en el localStorage del renderer
     * (`amoxsql-recent-projects`, rutas de la más reciente a la más vieja). Los
     * manda el cliente una vez y aquí se convierten en proyectos. Se anota en
     * preferencias para no repetirlo, y lo que ya estuviera no se duplica.
     *
     * El localStorage NO se vacía: la 5.8 lo sigue leyendo, y durante las
     * prereleases hay que poder volver a ella.
     */
    async importarRecientes(rutas) {
        if (await this.preferencia('recientes_importados')) return { importados: 0, yaImportados: true };
        const lista = (Array.isArray(rutas) ? rutas : []).filter(r => typeof r === 'string' && r.trim());
        let importados = 0;
        await this.transaccion(async (q) => {
            const existentes = new Set((await q(`SELECT ruta FROM proyectos`)).map(f => normalizarRuta(f.ruta)));
            // La lista va de más reciente a más vieja: se reparte el orden hacia
            // atrás en el tiempo para que «último abierto» lo conserve.
            const ahora = Date.now();
            for (let i = 0; i < lista.length; i++) {
                const ruta = path.resolve(lista[i]);
                const clave = normalizarRuta(ruta);
                if (existentes.has(clave)) continue;
                existentes.add(clave);
                await q(
                    `INSERT INTO proyectos (id, ruta, nombre, ultimo_abierto, origen) VALUES ($1, $2, $3, $4::TIMESTAMP, 'recientes-5.8')`,
                    [crypto.randomUUID(), ruta, path.basename(ruta), marcaDeTiempo(new Date(ahora - i * 1000))]
                );
                importados++;
            }
            await q(`INSERT OR REPLACE INTO preferencias VALUES ('recientes_importados', $1)`,
                [JSON.stringify({ en: new Date().toISOString(), importados })]);
        });
        return { importados, yaImportados: false };
    }
}

module.exports = new BaseCentral();
module.exports.BaseCentral = BaseCentral;
module.exports.normalizarRuta = normalizarRuta;
module.exports.marcaDeTiempo = marcaDeTiempo;
