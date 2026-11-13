/**
 * Qué es cada columna de un resultado (6.0, M2; auditoría R1, R2, R3).
 *
 * El gráfico por defecto tomaba la PRIMERA columna como X y la primera numérica como
 * Y: con `lugar, producto, categoria, unidades, venta` salía «unidades por lugar», el
 * número de ranking en el eje. Aquí se mira el resultado —tipos, nombres, valores— y
 * a cada columna se le da un papel:
 *
 *   fecha          una fecha (DATE, TIMESTAMP, un texto ISO)
 *   identificador  un id, una clave, un ranking (lugar, rank, #…): ni eje ni medida
 *   medida         un número que se suma o se compara (importe, unidades, total…)
 *   dimension      una categoría (región, categoría, un mes o un día de la semana)
 *   texto          un texto con muchos valores distintos (nombres largos, comentarios)
 *
 * Y de ahí, los ejes por defecto y el tipo de gráfico que mejor cuenta eso. Puro: lo
 * usan el visualizador y el perfil, y lo puede usar el Assistant.
 */

const ES_FECHA_TIPO = /^(DATE|TIMESTAMP|TIMESTAMP WITH TIME ZONE|TIMESTAMPTZ|TIMESTAMP_S|TIMESTAMP_MS|TIMESTAMP_NS)/i;
const ES_NUMERO_TIPO = /^(DECIMAL|NUMERIC|DOUBLE|FLOAT|REAL|TINYINT|SMALLINT|INTEGER|INT|BIGINT|HUGEINT|UTINYINT|USMALLINT|UINTEGER|UBIGINT|UHUGEINT)/i;
const ES_ENTERO_TIPO = /^(TINYINT|SMALLINT|INTEGER|INT|BIGINT|HUGEINT|UTINYINT|USMALLINT|UINTEGER|UBIGINT|UHUGEINT)$/i;
const TEXTO_FECHA = /^\d{4}-\d{2}(-\d{2})?([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}(:?\d{2})?)?)?$/;

// Nombres (español e inglés), con los mismos criterios que las preguntas sugeridas de Deep Dive.
const IDENTIFICADOR = /^(id|uuid|guid|key|clave|codigo|código|code|sku|ean|folio|lugar|rank|ranking|puesto|posici[oó]n|position|pos|orden|order_?num|row_?number|rn|n|num|numero|número|#)$|(^id_|_id$|_key$|_uuid$|_code$|_codigo$)/i;
const IMPORTE = /(importe|monto|amount|revenue|venta|ventas|sales|total|precio|price|costo|cost|ingreso|income|valor|value|margen|margin|profit|ganancia|gasto|spend|presupuesto|budget|meta|target)/i;
const CANTIDAD = /(cantidad|unidades|units|qty|quantity|count|conteo|clientes|customers|pedidos|orders|visitas|visits|usuarios|users|clicks?|impresiones|impressions|lineas|líneas|casos|cases)/i;
// Un cociente no se suma: pesa menos como medida principal.
const COCIENTE = /(_por_|_per_|pct|porcentaje|percent|ratio|tasa|rate|promedio|avg|average|media|mean|ctr|share|participacion)/i;
// Un periodo con nombre (mes, día, año…) se lee en su orden, no ordenado por valor.
const PERIODO = /^(fecha|date|dia|día|day|dow|semana|week|mes|month|trimestre|quarter|año|anio|ano|year|periodo|period|hora|hour|ym|yyyymm)(_|$)|(_fecha|_date|_mes|_month|_year|_anio|_dia|_day|_week|_hora|_hour)$/i;
const NO_DIMENSION = /(direcci|address|archivo|file|email|correo|phone|tel[eé]fono|nombre_completo|full_name|descripci|comment|coment|url|hash|uuid|json|nota|note)/i;
const ORDEN_DIM = ['categor', 'category', 'segment', 'region', 'regi', 'familia', 'family', 'canal', 'channel', 'tipo', 'type', 'marca', 'brand', 'country', 'estado', 'state', 'ciudad', 'city', 'tienda', 'store', 'producto', 'product', 'campa', 'cliente', 'customer'];
const rangoDim = (col) => { const c = col.toLowerCase(); const i = ORDEN_DIM.findIndex(p => c.startsWith(p) || c.includes(p)); return i < 0 ? 99 : i; };

const esNumeroTexto = (v) => typeof v === 'string' && /^-?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(v.trim());
const comoNumero = (v) => (typeof v === 'number' ? v : esNumeroTexto(v) ? Number(v) : NaN);

/**
 * El perfil de cada columna: [{ nombre, papel, distintos, grano, ordinal, ... }].
 * @param {object[]} filas   el resultado (se miran hasta 2 000 filas)
 * @param {object} [tipos]   { columna: 'DECIMAL(12,2)' } si se conocen
 */
export function perfilarColumnas(filas, tipos = {}) {
    if (!Array.isArray(filas) || !filas.length) return [];
    const nombres = Object.keys(filas[0]);
    const muestra = filas.length > 2000 ? filas.slice(0, 2000) : filas;
    const n = muestra.length;
    return nombres.map((nombre, indice) => {
        const tipo = String(tipos?.[nombre] || '');
        const valores = muestra.map(f => f[nombre]).filter(v => v !== null && v !== undefined && v !== '');
        const distintos = new Set(valores.map(v => (typeof v === 'object' ? JSON.stringify(v) : String(v)))).size;
        const objeto = valores.some(v => v && typeof v === 'object');
        const numerica = !objeto && (ES_NUMERO_TIPO.test(tipo) || (valores.length > 0 && valores.every(v => !Number.isNaN(comoNumero(v)))));
        const entera = numerica && (ES_ENTERO_TIPO.test(tipo) || valores.every(v => Number.isInteger(comoNumero(v))));
        const fecha = !numerica && (ES_FECHA_TIPO.test(tipo) || (valores.length > 0 && valores.every(v => typeof v === 'string' && TEXTO_FECHA.test(v.trim()))));
        const periodo = PERIODO.test(nombre);
        const largo = valores.length ? valores.reduce((a, v) => a + String(v).length, 0) / valores.length : 0;

        // ¿Una secuencia 1..n sin repetir? (un ranking o un número de fila)
        let secuencia = false;
        if (entera && distintos === valores.length && valores.length >= 3) {
            const nums = valores.map(comoNumero).sort((a, b) => a - b);
            secuencia = nums.every((x, i) => i === 0 || x - nums[i - 1] === 1) && nums[0] <= 1;
        }

        let papel;
        if (objeto) papel = 'texto';
        else if (fecha) papel = 'fecha';
        else if (periodo && (!numerica || (entera && distintos <= 60))) papel = 'dimension';      // mes, día de la semana, año
        else if (IDENTIFICADOR.test(nombre) || secuencia) papel = 'identificador';
        else if (numerica) {
            // Un entero con muy pocos valores (un estado 0/1, un nivel) se lee mejor como categoría.
            papel = entera && distintos <= 6 && distintos < n * 0.5 && !IMPORTE.test(nombre) && !CANTIDAD.test(nombre) ? 'dimension' : 'medida';
        } else if (NO_DIMENSION.test(nombre) || largo > 60 || (distintos > 50 && distintos > n * 0.8)) papel = 'texto';
        else papel = 'dimension';

        // Cuánto parece la medida principal: el que más, va al eje Y.
        let pesoMedida = 0;
        if (papel === 'medida') {
            if (IMPORTE.test(nombre)) pesoMedida += 3;
            if (CANTIDAD.test(nombre)) pesoMedida += 2;
            if (!entera) pesoMedida += 1;
            if (COCIENTE.test(nombre)) pesoMedida -= 3;
        }
        return {
            nombre, indice, tipo, papel, distintos, numerica, entera,
            // La columna que no se repite en ninguna fila: es lo que agrupa el resultado.
            grano: (papel === 'dimension' || papel === 'texto') && distintos === valores.length && valores.length === n,
            ordinal: periodo,
            pesoMedida, rangoDim: rangoDim(nombre),
        };
    });
}

/**
 * Los ejes por defecto: { x, y: [..], partir }.
 * X: la fecha; si no, la dimensión que agrupa el resultado (no se repite), y si no, la
 * que mejor resume por nombre; nunca un identificador si hay otra cosa. Y: la medida
 * principal. Partir: con una fecha en X, una categoría de pocos valores que se repite.
 */
export function ejesPorDefecto(perfil, filas = []) {
    if (!perfil?.length) return { x: '', y: [], partir: '' };
    const por = (papel) => perfil.filter(c => c.papel === papel);
    const medidas = por('medida').sort((a, b) => b.pesoMedida - a.pesoMedida || a.indice - b.indice);
    const fechas = por('fecha');
    const dims = [...por('dimension'), ...por('texto')].filter(c => c.distintos > 1)
        .sort((a, b) => (b.grano - a.grano) || (a.papel === 'texto') - (b.papel === 'texto') || a.rangoDim - b.rangoDim || a.indice - b.indice);

    const x = fechas[0] || dims[0]
        || perfil.find(c => c.papel !== 'medida' && c.papel !== 'identificador')
        || perfil.find(c => c.papel === 'identificador')
        || perfil[0];
    let y = medidas.filter(c => c.nombre !== x.nombre).slice(0, 1);
    if (!y.length) {
        const otra = perfil.find(c => c.nombre !== x.nombre && c.numerica);
        y = otra ? [otra] : [];
    }
    let partir = '';
    if (x.papel === 'fecha' && filas.length) {
        const xs = new Set(filas.map(f => String(f[x.nombre]))).size;
        const p = por('dimension').filter(c => c.nombre !== x.nombre && c.distintos >= 2 && c.distintos <= 8 && !c.ordinal)
            .sort((a, b) => a.rangoDim - b.rangoDim || a.indice - b.indice)[0];
        if (p && filas.length > xs) partir = p.nombre;
    }
    return { x: x.nombre, y: y.map(c => c.nombre), partir };
}

/**
 * El tipo de gráfico que mejor cuenta el resultado con esos ejes, y por qué (una
 * línea para enseñar). null si lo de siempre (columnas) ya es lo mejor.
 */
export function tipoSugerido(perfil, ejes, filas = []) {
    if (!perfil?.length || !ejes?.x) return null;
    const x = perfil.find(c => c.nombre === ejes.x);
    if (!x) return null;
    if (filas.length === 1) return null;   // una cifra: columnas va bien, y el KPI es otra cosa
    if (x.papel === 'fecha') return { chartType: 'line', motivo: `${x.nombre} is a date` };
    if (x.papel === 'medida' && ejes.y?.[0]) return { chartType: 'scatter', motivo: `${x.nombre} and ${ejes.y[0]} are both numbers` };
    if ((x.papel === 'dimension' || x.papel === 'texto') && !x.ordinal && x.distintos > 8) {
        return { chartType: 'bar-horizontal', sortMode: 'y-desc', motivo: `${x.distintos} values of ${x.nombre}, largest first` };
    }
    return null;
}
