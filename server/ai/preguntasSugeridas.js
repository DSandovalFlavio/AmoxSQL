/**
 * Preguntas para empezar un Deep Dive (plan UX, F5), sin modelo.
 *
 * El estado vacío ofrecía «Show all tables · Describe schema · Sample data»: acciones
 * de quien ya sabe SQL. Aquí salen preguntas de negocio a partir de lo que el
 * proyecto ya dice de sí mismo: sus métricas (`context/metrics.yml`), su glosario
 * y sus columnas (una fecha, un importe, una categoría). Cada una dice de dónde
 * sale, para que se vea que no es una plantilla genérica.
 *
 * Las preguntas van en el idioma del proyecto (el de sus métricas y su glosario):
 * son lo que el usuario le manda al analista, y el analista contesta en ese idioma.
 *
 * Puro: recibe { metricas, glosario, columnas: [{ tabla, columna, tipo }] }.
 */

// Lo que dice el nombre de una columna: la misma lista que usan el gráfico y el
// perfil del cliente (6.0, R3; `client/src/utils/columnas.js`).
const reglas = require('../compartido/papelesDeColumna.json');
const NO_DIMENSION = new RegExp(reglas.noDimension, 'i');
const IDENTIFICADOR = new RegExp(reglas.identificador, 'i');
const ES_FECHA = /^(DATE|TIMESTAMP|TIMESTAMP WITH TIME ZONE|TIMESTAMPTZ|TIMESTAMP_S|TIMESTAMP_MS|TIMESTAMP_NS)/i;
const ES_NUMERO = /^(DECIMAL|NUMERIC|DOUBLE|FLOAT|REAL|INTEGER|BIGINT|HUGEINT|SMALLINT|INT|UBIGINT|UINTEGER)/i;
const ES_TEXTO = /^(VARCHAR|TEXT|STRING|CHAR)/i;
const IMPORTE = new RegExp(reglas.importe, 'i');

/** ¿Español o inglés? Lo que más pesa en las descripciones y el glosario. */
function idiomaDe(texto) {
    const t = ` ${String(texto || '').toLowerCase()} `;
    const es = (t.match(/ (de|la|el|los|las|por|para|con|del|que|una?) |[áéíóúñ¿]/g) || []).length;
    const en = (t.match(/ (the|of|and|for|with|by|per|from|is|are) /g) || []).length;
    return es > en ? 'es' : 'en';
}

const humanoSolo = (nombre) => String(nombre || '').replace(/_/g, ' ').trim();
// Las métricas y columnas van entre comillas: sin saber su género, «la venta total»
// o «el venta total» sería adivinar; «venta total» entre comillas se lee bien.
const citarCon = { es: (x) => `«${x}»`, en: (x) => `"${x}"` };
// Mejor dimensión primero: una categoría o región dice más que un producto suelto.
const ORDEN_DIM = reglas.ordenDimensiones;
const rangoDim = (col) => { const c = col.toLowerCase(); const i = ORDEN_DIM.findIndex(p => c.startsWith(p) || c.includes(p)); return i < 0 ? 99 : i; };

const T = {
    es: {
        evolucion: (m) => `¿Cómo evoluciona ${m} mes a mes?`,
        porDimension: (m, d) => `¿Qué ${d} explica la mayor parte de ${m}?`,
        cayo: (m) => `¿En qué meses cayó ${m} y por qué?`,
        panorama: (t) => `Dame un panorama de ${t}: qué contiene y qué destaca`,
        calidad: (t) => `¿Hay problemas de calidad en los datos de ${t}?`,
        meta: (m) => `¿Cómo va ${m} contra la meta?`,
        deMetricas: (n) => `De metrics.yml: ${n}`,
        deColumnas: (cs) => `De ${cs}`,
        deGlosario: (g) => `Del glosario: ${g}`,
    },
    en: {
        evolucion: (m) => `How does ${m} change month by month?`,
        porDimension: (m, d) => `Which ${d} drives most of ${m}?`,
        cayo: (m) => `In which months did ${m} drop, and why?`,
        panorama: (t) => `Give me an overview of ${t}: what it holds and what stands out`,
        calidad: (t) => `Are there data quality issues in ${t}?`,
        meta: (m) => `How is ${m} doing against the target?`,
        deMetricas: (n) => `From metrics.yml: ${n}`,
        deColumnas: (cs) => `From ${cs}`,
        deGlosario: (g) => `From the glossary: ${g}`,
    },
};

function preguntasSugeridas({ metricas = [], glosario = '', columnas = [] } = {}, { maximo = 4 } = {}) {
    const idioma = idiomaDe([glosario, ...metricas.map(m => m.description || '')].join(' '));
    const t = T[idioma];
    const humano = (x) => citarCon[idioma](humanoSolo(x));
    const porTabla = new Map();
    for (const c of columnas) {
        if (!porTabla.has(c.tabla)) porTabla.set(c.tabla, []);
        porTabla.get(c.tabla).push(c);
    }
    const tablas = [...porTabla.keys()];

    // La tabla de hechos: la que tiene fecha e importe; si no, la de más columnas.
    const puntaje = (cols) => (cols.some(c => ES_FECHA.test(c.tipo)) ? 2 : 0)
        + (cols.some(c => ES_NUMERO.test(c.tipo) && IMPORTE.test(c.columna)) ? 2 : 0)
        + Math.min(cols.length, 12) / 12;
    const hechos = tablas.sort((a, b) => puntaje(porTabla.get(b)) - puntaje(porTabla.get(a)))[0] || null;
    const colsHechos = hechos ? porTabla.get(hechos) : [];
    const fecha = colsHechos.find(c => ES_FECHA.test(c.tipo));
    const importe = colsHechos.find(c => ES_NUMERO.test(c.tipo) && IMPORTE.test(c.columna));
    const dimensiones = colsHechos
        .filter(c => ES_TEXTO.test(c.tipo) && !NO_DIMENSION.test(c.columna) && !IDENTIFICADOR.test(c.columna))
        .sort((a, b) => rangoDim(a.columna) - rangoDim(b.columna));
    const dim = dimensiones[0];

    const salida = [];
    const poner = (texto, origen) => { if (texto && !salida.some(p => p.texto === texto)) salida.push({ texto, origen }); };

    // 1. Desde las métricas del proyecto: lo que el negocio ya decidió medir.
    const metrica = metricas.find(m => IMPORTE.test(m.name) || IMPORTE.test(m.sql || '')) || metricas[0];
    if (metrica) {
        const m = humano(metrica.name);
        if (fecha) poner(t.evolucion(m), t.deMetricas(metrica.name));
        if (dim) poner(t.porDimension(m, humano(dim.columna)), `${t.deMetricas(metrica.name)} · ${hechos}.${dim.columna}`);
    }
    // 2. Una meta en el glosario o en una tabla: comparar contra ella.
    const hayMeta = /\b(meta|target|goal|objetivo|presupuesto|budget)\b/i.test(glosario) || tablas.some(x => /(meta|target|goal|budget|presupuesto)/i.test(x));
    if (hayMeta && (metrica || importe)) {
        const m = humano(metrica?.name || importe.columna);
        const tablaMeta = tablas.find(x => /(meta|target|goal|budget|presupuesto)/i.test(x));
        poner(t.meta(m), tablaMeta ? t.deColumnas(tablaMeta) : t.deGlosario(idioma === 'es' ? 'meta' : 'target'));
    }
    // 3. Desde las columnas, si no hubo métricas.
    if (!metrica && importe) {
        const m = humano(importe.columna);
        if (fecha) poner(t.evolucion(m), t.deColumnas(`${hechos}.${fecha.columna}, ${hechos}.${importe.columna}`));
        if (dim) poner(t.porDimension(m, humano(dim.columna)), t.deColumnas(`${hechos}.${dim.columna}`));
    }
    if ((metrica || importe) && fecha && salida.length < maximo) {
        poner(t.cayo(humano(metrica?.name || importe.columna)), metrica ? t.deMetricas(metrica.name) : t.deColumnas(`${hechos}.${fecha.columna}`));
    }
    // 4. Siempre útiles: un panorama y la calidad de la tabla principal.
    if (hechos) {
        poner(t.panorama(hechos), t.deColumnas(`${hechos} (${colsHechos.length} ${idioma === 'es' ? 'columnas' : 'columns'})`));
        poner(t.calidad(hechos), t.deColumnas(hechos));
    }
    return { idioma, preguntas: salida.slice(0, maximo), tablas };
}

module.exports = { preguntasSugeridas, idiomaDe };
