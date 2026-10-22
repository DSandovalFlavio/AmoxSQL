/**
 * El contrato de una fuente (5.13, E2 + E3; Dec-37 a Dec-40).
 *
 * Lo que el archivo tiene que traer para que un proceso lo use: sus columnas, de
 * qué familia es cada una (texto, número, fecha, sí/no) y unas reglas (sin
 * vacíos, sin repetidos, un rango, unos valores, un mínimo de filas). Vive en la
 * definición de la fuente (`fuentes/<nombre>.json → contrato`) y viaja con ella.
 *
 * Probado en la fase 0.3 (`scripts/poc513/p01_contrato.mjs`): leído con tipos, un
 * Excel da falsos fallos (una celda vacía arriba vuelve texto la columna) y un
 * «N/A» en medio pasa el DESCRIBE como número y revienta la lectura en su celda.
 * Por eso, con contrato, un Excel o un CSV se LEE COMO TEXTO y cada columna se
 * convierte a su familia: lo que no convierte se cuenta y se nombra. Parquet, JSON
 * y los lagos traen tipos: sólo se comprueba su familia.
 *
 * Se comprueba al correr (Dec-38): antes del primer paso de un proceso que lee la
 * fuente, antes de dbt, y con el botón Check. Nunca en cada consulta.
 */

const FAMILIAS = ['texto', 'numero', 'fecha', 'logico'];
const REGLAS = ['no_nulos', 'unico', 'rango', 'valores', 'filas_minimas'];
const AL_FALLAR = ['parar', 'avisar'];

const ident = (s) => `"${String(s).replace(/"/g, '""')}"`;
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;
const texto = (v, max = 200) => (v === undefined || v === null ? '' : String(v).trim().slice(0, max));

class ErrorDeContrato extends Error {}

/** El contrato tal como se guarda, o null si no dice nada. Lanza si está mal. */
function normalizar(c) {
    if (!c || typeof c !== 'object') return null;
    const columnas = [];
    const vistas = new Set();
    for (const x of Array.isArray(c.columnas) ? c.columnas : []) {
        const nombre = texto(x?.nombre);
        if (!nombre) continue;
        if (vistas.has(nombre)) throw new ErrorDeContrato(`The column "${nombre}" is twice in the contract.`);
        vistas.add(nombre);
        const tipo = FAMILIAS.includes(x.tipo) ? x.tipo : 'texto';
        columnas.push({ nombre, tipo, ...(x.obligatoria === false ? { obligatoria: false } : {}) });
    }
    const reglas = [];
    for (const r of Array.isArray(c.reglas) ? c.reglas : []) {
        if (!REGLAS.includes(r?.tipo)) continue;
        if (r.tipo === 'filas_minimas') {
            const n = Math.max(0, Math.round(Number(r.filas) || 0));
            reglas.push({ tipo: 'filas_minimas', filas: n });
            continue;
        }
        const columna = texto(r.columna);
        if (!columna) throw new ErrorDeContrato(`The rule "${r.tipo}" needs a column.`);
        const regla = { tipo: r.tipo, columna };
        if (r.tipo === 'rango') {
            if (r.min !== undefined && r.min !== null && r.min !== '') regla.min = r.min;
            if (r.max !== undefined && r.max !== null && r.max !== '') regla.max = r.max;
            if (regla.min === undefined && regla.max === undefined) throw new ErrorDeContrato(`The range of "${columna}" needs a minimum or a maximum.`);
        }
        if (r.tipo === 'valores') {
            regla.valores = [...new Set((Array.isArray(r.valores) ? r.valores : String(r.valores || '').split(',')).map(v => texto(v, 300)).filter(Boolean))].slice(0, 500);
            if (!regla.valores.length) throw new ErrorDeContrato(`The allowed values of "${columna}" are empty.`);
        }
        reglas.push(regla);
    }
    if (!columnas.length && !reglas.length) return null;
    return {
        columnas,
        ...(c.estricto === true ? { estricto: true } : {}),
        reglas,
        alFallar: AL_FALLAR.includes(c.alFallar) ? c.alFallar : 'parar',
    };
}

/** La familia de un tipo del motor. */
function familiaDe(tipo) {
    const t = String(tipo || '').toUpperCase();
    if (/^(TINYINT|SMALLINT|INTEGER|BIGINT|HUGEINT|UTINYINT|USMALLINT|UINTEGER|UBIGINT|UHUGEINT|FLOAT|DOUBLE|REAL|DECIMAL|NUMERIC)/.test(t)) return 'numero';
    if (/^(DATE|TIMESTAMP|TIME)/.test(t)) return 'fecha';
    if (t === 'BOOLEAN') return 'logico';
    return 'texto';
}

const NOMBRE_DE_FAMILIA = { texto: 'text', numero: 'a number', fecha: 'a date', logico: 'yes/no' };

/**
 * ¿Se lee como texto y se convierte? Excel y CSV (también desde una carpeta).
 * `formato`: el de la definición o, si no lo dice, el de la extensión.
 */
function leeComoTexto(def, formato = def?.formato) {
    return !!def?.contrato && ['archivo', 'carpeta'].includes(def.tipo) && ['xlsx', 'csv'].includes(formato);
}

/**
 * La expresión que convierte una columna leída como texto a su familia, o null
 * si se queda como está. `serial`: en un Excel, una fecha de verdad llega como
 * su número de serie.
 */
function conversion(col, familia, { serial = false } = {}) {
    const c = ident(col);
    if (familia === 'numero') return `TRY_CAST(${c} AS DOUBLE)`;
    if (familia === 'fecha') {
        const partes = [`try_strptime(${c}, ['%Y-%m-%d', '%d/%m/%Y', '%Y-%m-%d %H:%M:%S', '%d/%m/%Y %H:%M'])::DATE`];
        if (serial) partes.push(`CASE WHEN regexp_full_match(${c}, '\\d+(\\.\\d+)?') THEN DATE '1899-12-30' + CAST(floor(TRY_CAST(${c} AS DOUBLE)) AS INTEGER) END`);
        return `coalesce(${partes.join(', ')})`;
    }
    if (familia === 'logico') {
        return `CASE WHEN lower(trim(${c})) IN ('true', '1', 'yes', 'y', 'si', 'sí', 's', 'x', 'verdadero') THEN true WHEN lower(trim(${c})) IN ('false', '0', 'no', 'n', 'falso') THEN false END`;
    }
    return null;
}

/** El SELECT de una fuente con contrato: la lectura como texto, convertida. */
function envolver(sqlTexto, contrato, { serial = false, columnasHoy = null } = {}) {
    const hoy = columnasHoy ? new Set(columnasHoy) : null;
    const reemplazos = (contrato?.columnas || [])
        .filter(c => !hoy || hoy.has(c.nombre))
        .map(c => [c.nombre, conversion(c.nombre, c.tipo, { serial })])
        .filter(([, e]) => e)
        .map(([n, e]) => `${e} AS ${ident(n)}`);
    if (!reemplazos.length) return sqlTexto;
    return `SELECT * REPLACE (${reemplazos.join(', ')}) FROM (${sqlTexto})`;
}

/** Hasta tres ejemplos, entre comillas latinas, para un mensaje. */
const ejemplos = (lista, n) => {
    const xs = (lista || []).filter(v => v !== null && v !== undefined).slice(0, 3).map(v => `«${String(v).slice(0, 40)}»`);
    return xs.length ? `: ${xs.join(', ')}${n > xs.length ? '…' : ''}` : '';
};
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

/**
 * Comprueba el contrato de una fuente. `db` es cualquier cosa con query o
 * systemQuery; `sqlCrudo`, la lectura sin convertir (como texto en un Excel o un
 * CSV con contrato, con tipos si no). Una consulta para las columnas (DESCRIBE)
 * y otra para todas las reglas y conversiones (Dec-38).
 *
 * @returns {{ ok, fallos: [{ tipo, columna?, texto }], filas, ms, alFallar }}
 */
async function comprobar(db, { nombre, contrato, sqlCrudo, comoTexto = false, serial = false }) {
    const t0 = Date.now();
    const q = (sql) => (db.systemQuery ? db.systemQuery(sql) : db.query(sql));
    const fallos = [];
    let hoy;
    try {
        hoy = (await q(`DESCRIBE SELECT * FROM (${sqlCrudo})`)).map(c => ({ nombre: c.column_name, tipo: c.column_type, familia: familiaDe(c.column_type) }));
    } catch (e) {
        return { ok: false, fallos: [{ tipo: 'lectura', texto: `cannot be read: ${String(e.message || e).split('\n')[0]}` }], filas: null, ms: Date.now() - t0, alFallar: contrato.alFallar };
    }
    const porNombre = new Map(hoy.map(c => [c.nombre, c]));

    // Las columnas: las que faltan (y si parece un cambio de nombre), las que
    // cambiaron de familia (sólo con tipos: leído como texto, todo es texto) y,
    // si es estricto, las que sobran.
    const enContrato = new Set(contrato.columnas.map(c => c.nombre));
    const nuevas = hoy.filter(c => !enContrato.has(c.nombre) && !String(c.nombre).startsWith('_'));
    const usadas = new Set();
    for (const c of contrato.columnas) {
        if (porNombre.has(c.nombre)) continue;
        if (c.obligatoria === false) continue;
        // Un cambio de nombre: una columna nueva en el mismo sitio, o la única nueva.
        const pos = contrato.columnas.indexOf(c);
        const candidata = nuevas.find(n => !usadas.has(n.nombre) && hoy.indexOf(n) === pos) || (nuevas.length === 1 && !usadas.has(nuevas[0].nombre) ? nuevas[0] : null);
        if (candidata) usadas.add(candidata.nombre);
        fallos.push({ tipo: 'falta', columna: c.nombre, texto: `the column "${c.nombre}" is missing${candidata ? ` — "${candidata.nombre}" is new: was it renamed?` : ''}` });
    }
    if (!comoTexto) {
        for (const c of contrato.columnas) {
            const h = porNombre.get(c.nombre);
            if (h && c.tipo !== 'texto' && h.familia !== c.tipo) {
                fallos.push({ tipo: 'familia', columna: c.nombre, texto: `"${c.nombre}" was ${NOMBRE_DE_FAMILIA[c.tipo]} and now is ${NOMBRE_DE_FAMILIA[h.familia]} (${h.tipo})` });
            }
        }
    }
    if (contrato.estricto) {
        for (const n of nuevas) if (!usadas.has(n.nombre)) fallos.push({ tipo: 'sobra', columna: n.nombre, texto: `unexpected column "${n.nombre}"` });
    }

    // Una sola consulta: conversiones que fallan y cada regla.
    // Una columna del contrato, convertida; una que no está en él pero tiene una
    // regla de rango numérico, como número (leída como texto, compararla con 0 falla).
    const expr = (col, regla = null) => {
        const c = contrato.columnas.find(x => x.nombre === col);
        if (comoTexto && c) return conversion(col, c.tipo, { serial }) || ident(col);
        if (comoTexto && regla?.tipo === 'rango' && [regla.min, regla.max].every(v => v === undefined || Number.isFinite(Number(v)))) return conversion(col, 'numero');
        return ident(col);
    };
    const partes = ['count(*) AS filas'];
    const lectores = [];
    if (comoTexto) {
        contrato.columnas.forEach((c, i) => {
            const e = conversion(c.nombre, c.tipo, { serial });
            if (!e || !porNombre.has(c.nombre)) return;
            const malo = `${ident(c.nombre)} IS NOT NULL AND trim(${ident(c.nombre)}) <> '' AND ${e} IS NULL`;
            partes.push(`count(*) FILTER (WHERE ${malo}) AS c${i}`, `list(DISTINCT ${ident(c.nombre)}) FILTER (WHERE ${malo})[1:3] AS e${i}`);
            lectores.push((f) => {
                const n = Number(f[`c${i}`] || 0);
                if (n) fallos.push({ tipo: 'conversion', columna: c.nombre, texto: `"${c.nombre}" has ${plural(n, `value that is not ${NOMBRE_DE_FAMILIA[c.tipo]}`, `values that are not ${NOMBRE_DE_FAMILIA[c.tipo]}`)}${ejemplos(f[`e${i}`], n)}` });
            });
        });
    }
    contrato.reglas.forEach((r, i) => {
        if (r.tipo === 'filas_minimas') {
            lectores.push((f) => { const n = Number(f.filas || 0); if (n < r.filas) fallos.push({ tipo: 'filas_minimas', texto: `it has ${plural(n, 'row', 'rows')} (at least ${r.filas} expected)` }); });
            return;
        }
        if (!porNombre.has(r.columna)) return;   // ya se dijo que falta
        const e = expr(r.columna, r);
        const vacio = comoTexto ? `(${e} IS NULL)` : `(${e} IS NULL)`;
        if (r.tipo === 'no_nulos') {
            partes.push(`count(*) FILTER (WHERE ${vacio}) AS r${i}`);
            lectores.push((f) => { const n = Number(f[`r${i}`] || 0); if (n) fallos.push({ tipo: 'no_nulos', columna: r.columna, texto: `"${r.columna}" has ${plural(n, 'empty value', 'empty values')}` }); });
        } else if (r.tipo === 'unico') {
            partes.push(`count(${e}) - count(DISTINCT ${e}) AS r${i}`, `list(${e}) FILTER (WHERE ${e} IN (SELECT ${e} FROM (${sqlCrudo}) GROUP BY ALL HAVING count(*) > 1))[1:3] AS x${i}`);
            lectores.push((f) => { const n = Number(f[`r${i}`] || 0); if (n) fallos.push({ tipo: 'unico', columna: r.columna, texto: `"${r.columna}" has ${plural(n, 'repeated value', 'repeated values')}${ejemplos([...new Set(f[`x${i}`] || [])], n)}` }); });
        } else if (r.tipo === 'rango') {
            const c = contrato.columnas.find(x => x.nombre === r.columna);
            const valor = (v) => (c?.tipo === 'fecha' ? `${lit(v)}::DATE` : Number.isFinite(Number(v)) ? String(Number(v)) : lit(v));
            const fuera = [r.min !== undefined ? `${e} < ${valor(r.min)}` : null, r.max !== undefined ? `${e} > ${valor(r.max)}` : null].filter(Boolean).join(' OR ');
            partes.push(`count(*) FILTER (WHERE ${fuera}) AS r${i}`, `list(DISTINCT ${e}) FILTER (WHERE ${fuera})[1:3] AS x${i}`);
            const limites = [r.min !== undefined ? `min ${r.min}` : null, r.max !== undefined ? `max ${r.max}` : null].filter(Boolean).join(', ');
            lectores.push((f) => { const n = Number(f[`r${i}`] || 0); if (n) fallos.push({ tipo: 'rango', columna: r.columna, texto: `"${r.columna}" has ${plural(n, 'value', 'values')} out of range (${limites})${ejemplos(f[`x${i}`], n)}` }); });
        } else if (r.tipo === 'valores') {
            const fuera = `${e} IS NOT NULL AND CAST(${e} AS VARCHAR) NOT IN (${r.valores.map(lit).join(', ')})`;
            partes.push(`count(*) FILTER (WHERE ${fuera}) AS r${i}`, `list(DISTINCT CAST(${e} AS VARCHAR)) FILTER (WHERE ${fuera})[1:3] AS x${i}`);
            lectores.push((f) => { const n = Number(f[`r${i}`] || 0); if (n) fallos.push({ tipo: 'valores', columna: r.columna, texto: `"${r.columna}" has ${plural(n, 'value', 'values')} that ${n === 1 ? 'is' : 'are'} not allowed${ejemplos(f[`x${i}`], n)}` }); });
        }
    });
    let filas = null;
    try {
        const [f] = await q(`SELECT ${partes.join(',\n       ')}\nFROM (${sqlCrudo})`);
        filas = Number(f?.filas ?? 0);
        for (const leer of lectores) leer(f || {});
    } catch (e) {
        fallos.push({ tipo: 'lectura', texto: `cannot be read: ${explicarLectura(e)}` });
    }
    return { ok: fallos.length === 0, fallos, filas, ms: Date.now() - t0, alFallar: contrato.alFallar };
}

/** «Failed to parse cell 'C102': Could not convert string 'N/A' to DOUBLE» → algo legible. */
function explicarLectura(e) {
    const m = String(e?.message || e).split('\n')[0];
    const x = /cell '([A-Z]+\d+)': Could not convert string '(.*)' to (\w+)/.exec(m);
    if (x) return `cell ${x[1]} has «${x[2]}», which is not ${NOMBRE_DE_FAMILIA[familiaDe(x[3])]}`;
    return m.replace(/^[A-Za-z ]+ Error: /, '');
}

/** Una línea para un aviso o un paso: «ventas: the column "Importe" is missing …». */
function linea(nombre, r) {
    return `${nombre}: ${r.fallos.map(f => f.texto).join('; ')}`;
}

/**
 * «Take today's columns» (Dec-40): el contrato con las columnas de hoy, todas
 * obligatorias, sin reglas. Con tipos, la familia del motor; leído como texto, la
 * que admiten TODOS sus valores (número, luego fecha, luego sí/no), con la ayuda
 * del tipo que adivina el motor (una fecha de Excel llega como número de serie).
 */
async function deHoy(db, { sqlCrudo, sqlTipado = null, comoTexto = false, serial = false, familiaDeCelda = null }) {
    const q = (sql) => (db.systemQuery ? db.systemQuery(sql) : db.query(sql));
    const cols = (await q(`DESCRIBE SELECT * FROM (${sqlCrudo})`)).map(c => ({ nombre: c.column_name, tipo: c.column_type }));
    if (!comoTexto) return { columnas: cols.map(c => ({ nombre: c.nombre, tipo: familiaDe(c.tipo) })), reglas: [], alFallar: 'parar' };
    let pista = new Map();
    if (sqlTipado) {
        try { pista = new Map((await q(`DESCRIBE SELECT * FROM (${sqlTipado})`)).map(c => [c.column_name, familiaDe(c.column_type)])); } catch { /* sin pista */ }
    }
    const partes = ['count(*) AS filas'];
    cols.forEach((c, i) => {
        const lleno = `${ident(c.nombre)} IS NOT NULL AND trim(${ident(c.nombre)}) <> ''`;
        partes.push(
            `count(*) FILTER (WHERE ${lleno}) AS n${i}`,
            `min(__fila) FILTER (WHERE ${lleno}) AS p${i}`,
            `count(*) FILTER (WHERE ${lleno} AND ${conversion(c.nombre, 'numero')} IS NOT NULL) AS num${i}`,
            `count(*) FILTER (WHERE ${lleno} AND ${conversion(c.nombre, 'fecha')} IS NOT NULL) AS fec${i}`,
            `count(*) FILTER (WHERE ${lleno} AND ${conversion(c.nombre, 'logico')} IS NOT NULL) AS log${i}`,
        );
    });
    const [f] = await q(`SELECT ${partes.join(', ')} FROM (SELECT *, row_number() OVER () AS __fila FROM (${sqlCrudo}))`);
    const columnas = [];
    for (const [i, c] of cols.entries()) {
        const n = Number(f[`n${i}`] || 0);
        let tipo = 'texto';
        if (pista.get(c.nombre) === 'fecha' && serial) tipo = 'fecha';
        else if (n && Number(f[`fec${i}`]) === n) tipo = 'fecha';
        else if (n && Number(f[`num${i}`]) === n) {
            tipo = pista.get(c.nombre) === 'fecha' ? 'fecha' : 'numero';
            // En un Excel, una fecha es su número de serie. Si la primera fila de la
            // columna está vacía, el motor no lo ve: se mira la primera celda llena.
            if (tipo === 'numero' && serial && familiaDeCelda && pista.get(c.nombre) !== 'numero') {
                try { if ((await familiaDeCelda(i, Number(f[`p${i}`]))) === 'fecha') tipo = 'fecha'; } catch { /* número */ }
            }
        } else if (n && Number(f[`log${i}`]) === n && pista.get(c.nombre) === 'logico') tipo = 'logico';
        columnas.push({ nombre: c.nombre, tipo });
    }
    return { columnas, reglas: [], alFallar: 'parar' };
}

/**
 * Las fuentes que lee un proceso: los nodos de fuente y lo que el SQL de sus
 * pasos nombra como `fuentes."x"` o `fuentes.x`. `leerArchivo(ruta)` para los
 * pasos que leen un .sql.
 */
function fuentesQueLee(nodos, { leerArchivo = () => '' } = {}) {
    const nombres = new Set();
    const re = /\bfuentes\s*\.\s*(?:"((?:[^"]|"")+)"|([a-z0-9]+(?:-[a-z0-9]+)*))/gi;
    for (const n of nodos || []) {
        if (n.disabled) continue;
        const c = n.config || n.data?.config || {};
        if (n.type === 'fuente' && c.fuente) nombres.add(String(c.fuente).trim());
        let sql = '';
        if (n.type === 'sql_inline') sql = c.query || '';
        else if (n.type === 'sql_file' && c.filePath) { try { sql = leerArchivo(c.filePath) || ''; } catch { sql = ''; } }
        else if (typeof c.query === 'string') sql = c.query;
        let m;
        while ((m = re.exec(sql))) nombres.add((m[1] !== undefined ? m[1].replace(/""/g, '"') : m[2]).trim());
    }
    return [...nombres].filter(Boolean);
}

module.exports = {
    ErrorDeContrato, FAMILIAS, REGLAS,
    normalizar, familiaDe, leeComoTexto, conversion, envolver, comprobar, explicarLectura, linea, deHoy, fuentesQueLee,
};
