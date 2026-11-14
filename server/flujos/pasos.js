/**
 * Los pasos de transformación de Data Flow, definidos UNA vez (6.0, M7; auditoría E2).
 *
 * Hasta la 5.19 cada uno estaba escrito dos veces en `ChainExecutor`: en `executeNode`
 * (lo que corre) y en `buildNodeSql` (el «SQL equivalente» que se exporta). Las dos
 * copias se habían separado: un operador desconocido del filtro era `=` al correr y el
 * operador tal cual al exportar, y el nombre de una ventana sin alias podía romper sólo
 * en uno de los caminos. Ahora los dos leen de aquí; donde diferían, manda lo que hacía
 * la ejecución, que es lo que el usuario recibía.
 *
 * Cada paso:
 *   - `select(config, desde, h)`: el SELECT del paso. `desde` es la entrada ya entre
 *     paréntesis (`(SELECT …)`); `h` es el ejecutor, por sus ayudantes de SQL
 *     (`filterValueLiteral`, `aggExpr`, `dateOpsSelect`, `flattenSelect`).
 *   - `falta(config)`: por qué no se puede construir (el texto del error al correr), o
 *     null. Al exportar, un paso al que le falta algo no da SQL (como antes).
 *   - `sinEntrada`: el error cuando no hay nada conectado.
 *   - `resumen(config)`: lo que el paso añade al resumen de su ejecución.
 *   - `despues(tabla, dbManager)`: lo que corre tras crear la tabla, si algo.
 *
 * Si se materializa como vista o como tabla lo decide `ChainExecutor.materializeTarget`
 * (VIEW_ELIGIBLE_NODE_TYPES); aquí sólo vive el SQL.
 *
 * Fuera de aquí, a propósito: `type_cast` y `clean` (al correr leen el esquema de la
 * entrada para conservar el orden de las columnas), `join_tables` y `merge_tables` (dos
 * o más entradas), y los pasos que no son SQL (importar, exportar, gráficos…).
 */

const comilla = (v) => String(v ?? '').replace(/'/g, "''");
const col = (c) => `"${c}"`;

const condicion = (c, h) => {
    const k = col(c.column);
    switch (c.operator) {
        case '=': return `${k} = '${comilla(c.value || '')}'`;
        case '!=': return `${k} != '${comilla(c.value || '')}'`;
        case '>': case '>=': case '<': case '<=': return `${k} ${c.operator} ${h.filterValueLiteral(c.value)}`;
        case 'LIKE': return `${k} LIKE '${comilla(c.value || '')}'`;
        case 'NOT LIKE': return `${k} NOT LIKE '${comilla(c.value || '')}'`;
        case 'IS NULL': return `${k} IS NULL`;
        case 'IS NOT NULL': return `${k} IS NOT NULL`;
        case 'IN': {
            const vals = (c.value || '').split(',').map(v => `'${comilla(v.trim())}'`).join(', ');
            return `${k} IN (${vals})`;
        }
        case 'BETWEEN': return `${k} BETWEEN ${h.filterValueLiteral(c.value)} AND ${h.filterValueLiteral(c.value2)}`;
        default: return `${k} = '${comilla(c.value || '')}'`;
    }
};

const ventana = (w) => {
    const partBy = w.partitionBy && w.partitionBy.length > 0 ? `PARTITION BY ${w.partitionBy.map(col).join(', ')}` : '';
    const orderBy = w.orderBy && w.orderBy.length > 0 ? `ORDER BY ${w.orderBy.map(col).join(', ')}` : '';
    const over = `OVER (${[partBy, orderBy].filter(Boolean).join(' ')})`;
    const c = w.column && w.column !== '*' ? col(w.column) : (w.column === '*' ? '*' : '');
    const func = ['ROW_NUMBER', 'RANK', 'DENSE_RANK', 'NTILE'].includes(w.func)
        ? `${w.func}()`
        : c ? `${w.func}(${c})` : `${w.func}()`;
    return `${func} ${over} AS "${w.alias || String(w.func || '').toLowerCase()}"`;
};

const PASOS = {
    filter: {
        sinEntrada: 'Filter node: no upstream data source connected and no source table specified',
        falta: (c) => ((c.conditions || []).length ? null : 'Filter node: at least one filter condition is required'),
        select: (c, desde, h) => `SELECT * FROM ${desde} AS _src WHERE ${(c.conditions || []).map(x => condicion(x, h)).join(` ${c.connector || 'AND'} `)}`,
        resumen: (c) => ({ conditionCount: (c.conditions || []).length }),
    },

    group_aggregate: {
        sinEntrada: 'Group/Aggregate node: no upstream data source connected',
        falta: (c) => ((c.aggregations || []).length ? null : 'Group/Aggregate node: at least one aggregation is required'),
        select: (c, desde, h) => {
            const grupos = c.groupColumns || [];
            const partes = [...grupos.map(col), ...(c.aggregations || []).map(a => h.aggExpr(a))];
            const gb = grupos.length ? ` GROUP BY ${grupos.map(col).join(', ')}` : '';
            const having = (c.having && c.having.trim()) ? ` HAVING ${c.having.trim()}` : '';
            return `SELECT ${partes.join(', ')} FROM ${desde} AS _src${gb}${having}`;
        },
    },

    select_columns: {
        sinEntrada: 'Select Columns node: no upstream data source connected',
        falta: (c) => ((c.columns || []).length ? null : 'Select Columns node: at least one column must be selected'),
        select: (c, desde) => `SELECT ${(c.columns || []).map(x => (x.alias && x.alias !== x.name) ? `"${x.name}" AS "${x.alias}"` : col(x.name)).join(', ')} FROM ${desde} AS _src`,
        resumen: (c) => ({ columnCount: (c.columns || []).length }),
    },

    deduplicate: {
        sinEntrada: 'Deduplicate node: no upstream data source connected',
        falta: () => null,
        select: (c, desde) => {
            const claves = c.keyColumns || [];
            if (!claves.length) return `SELECT DISTINCT * FROM ${desde} AS _src`;
            const orden = c.keep === 'last' ? 'DESC' : 'ASC';
            return `SELECT * EXCLUDE (_rn, _orden) FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY ${claves.map(col).join(', ')} ORDER BY _orden ${orden}) AS _rn FROM (SELECT *, row_number() OVER () AS _orden FROM ${desde} AS _src0) AS _src) WHERE _rn = 1`;
        },
        // Resto de una versión que dejaba `_rn`: no hace nada si no está.
        despues: async (tabla, dbManager) => { try { await dbManager.query(`ALTER TABLE "${tabla}" DROP COLUMN IF EXISTS _rn`); } catch { /* sin columna */ } },
    },

    add_column: {
        sinEntrada: 'Add Column node: no upstream data source connected',
        falta: (c) => ((c.newColumns || []).length ? null : 'Add Column node: at least one column definition is required'),
        select: (c, desde) => `SELECT *, ${(c.newColumns || []).map(x => `(${x.expression}) AS "${x.name}"`).join(', ')} FROM ${desde} AS _src`,
        resumen: (c) => ({ addedColumns: (c.newColumns || []).length }),
    },

    sort: {
        sinEntrada: 'Sort node: no upstream data source connected',
        falta: (c) => ((c.sortColumns || []).length ? null : 'Sort node: at least one sort column is required'),
        select: (c, desde) => `SELECT * FROM ${desde} AS _src ORDER BY ${(c.sortColumns || []).map(x => `"${x.column}" ${x.direction || 'ASC'}`).join(', ')}`,
    },

    sample: {
        sinEntrada: 'Sample node: no upstream data source connected',
        falta: () => null,
        select: (c, desde) => {
            const v = parseInt(c.sampleValue) || 100;
            const tipo = c.sampleType || 'rows';
            if (tipo === 'percent') return `SELECT * FROM ${desde} AS _src USING SAMPLE ${Math.min(v, 100)}%`;
            if (tipo === 'stratified' && c.strataColumn) return `SELECT * EXCLUDE (_rn, _azar) FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY "${c.strataColumn}" ORDER BY _azar) AS _rn FROM (SELECT *, random() AS _azar FROM ${desde} AS _src0) AS _src) WHERE _rn <= ${v}`;
            return `SELECT * FROM ${desde} AS _src LIMIT ${v}`;
        },
        resumen: (c) => ({ sampleType: c.sampleType || 'rows', sampleValue: parseInt(c.sampleValue) || 100 }),
    },

    pivot: {
        sinEntrada: 'Pivot node: no upstream data source connected',
        falta: (c) => ((c.groupColumn && c.pivotColumn && c.valueColumn) ? null : 'Pivot node: group column, pivot column, and value column are all required'),
        select: (c, desde) => `PIVOT ${desde} ON "${c.pivotColumn}" USING ${c.aggFunc || 'SUM'}("${c.valueColumn}") GROUP BY "${c.groupColumn}"`,
    },

    unpivot: {
        sinEntrada: 'Unpivot node: no upstream data source connected',
        falta: (c) => ((c.valueColumns || []).length ? null : 'Unpivot node: at least one value column is required'),
        select: (c, desde) => `UNPIVOT ${desde} ON ${(c.valueColumns || []).map(col).join(', ')} INTO NAME "${c.nameColumn || 'variable'}" VALUE "${c.valueColumn || 'value'}"`,
    },

    window_functions: {
        sinEntrada: 'Window Functions node: no upstream data source connected',
        falta: (c) => ((c.windows || []).length ? null : 'Window Functions node: at least one window function is required'),
        select: (c, desde) => `SELECT *, ${(c.windows || []).map(ventana).join(', ')} FROM ${desde} AS _src`,
    },

    date_ops: {
        sinEntrada: 'Date/Time node: no upstream data source connected',
        falta: (c) => ((c.operations || []).length ? null : 'Date/Time node: at least one operation is required'),
        select: (c, desde, h) => h.dateOpsSelect(c, desde),
        resumen: (c) => ({ opsApplied: (c.operations || []).length }),
    },

    flatten: {
        sinEntrada: 'Flatten node: no upstream data source connected',
        falta: (c) => (c.column ? null : 'Flatten node: a source column is required'),
        select: (c, desde, h) => h.flattenSelect(c, desde),
    },
};

module.exports = { PASOS };
