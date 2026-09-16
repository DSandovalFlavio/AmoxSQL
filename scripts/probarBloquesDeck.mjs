/**
 * Ejercita `deckBlockModel.js` — los cinco bloques de dato de una lámina.
 *
 *     node scripts/probarBloquesDeck.mjs
 *
 * Lo que importa aquí es el **ida y vuelta**: leer un bloque a un modelo y
 * volver a escribirlo tiene que dar algo que el renderizador entienda igual. Un
 * fallo no se ve — el bloque sigue siendo YAML válido, sólo que con una clave
 * menos, y la métrica que desaparece de la lámina nadie la echa en falta hasta
 * que está proyectada.
 */
import {
    bloqueEnCursor, bloquesDe, leerBloque, escribirBloque, avisosDe, reemplazarBloque, BLOQUES,
} from '../client/src/components/deck/deckBlockModel.js';

let ok = 0, mal = 0;
const eq = (nombre, a, b) => {
    const pasa = JSON.stringify(a) === JSON.stringify(b);
    if (pasa) { ok++; } else { mal++; console.log(`  FALLA  ${nombre}\n    esperado: ${JSON.stringify(b)}\n    obtenido: ${JSON.stringify(a)}`); }
};

const F = '```';

// ── encontrar el bloque donde está el cursor ────────────────────────────────
const prosa = `## El total apenas se movió

${F}kpis
- label: Coste
  value: $521,982
${F}

Texto de después.`;

const dentro = prosa.indexOf('label: Coste');
eq('encuentra el bloque donde está el cursor', bloqueEnCursor(prosa, dentro)?.lang, 'kpis');
eq('fuera del bloque, nada', bloqueEnCursor(prosa, 5), null);
eq('en el texto de después, nada', bloqueEnCursor(prosa, prosa.length - 3), null);
eq('en la cerca de apertura, sí', bloqueEnCursor(prosa, prosa.indexOf(`${F}kpis`) + 2)?.lang, 'kpis');
eq('un lenguaje que no es de la lámina, no',
    bloqueEnCursor(`${F}sql\nSELECT 1\n${F}`, 8), null);

// Un bloque sin cerrar no puede tragarse el resto de la lámina: es justo el
// estado en el que está mientras alguien lo escribe.
const aMedias = `${F}kpis\n- label: Coste\n\nY esto ya no es del bloque.`;
eq('un bloque sin cerrar no se come lo de abajo', bloqueEnCursor(aMedias, aMedias.length - 3), null);

// ── kpis ────────────────────────────────────────────────────────────────────
const kpisYaml = `- label: Coste
  value: $521,982
  delta: -3.3%
  trend: good
  base: vs. semestre anterior
- label: Clics
  value: 13.76M
  highlight: true`;

const kpis = leerBloque('kpis', kpisYaml);
eq('lee las dos métricas', kpis.items.length, 2);
eq('con sus campos', kpis.items[0], { label: 'Coste', value: '$521,982', delta: '-3.3%', trend: 'good', base: 'vs. semestre anterior' });
eq('el destacado se conserva', kpis.items[1].highlight, true);
eq('el dinero sobrevive a la lectura', kpis.items[0].value, '$521,982');

const vuelta = leerBloque('kpis', escribirBloque('kpis', kpis));
eq('ida y vuelta: mismas métricas', vuelta.items, kpis.items);

eq('las claves vacías no se escriben',
    escribirBloque('kpis', { items: [{ label: 'X', value: '1', delta: '', base: null }] }).includes('delta'), false);
eq('y `highlight: false` tampoco',
    escribirBloque('kpis', { items: [{ label: 'X', highlight: false }] }).includes('highlight'), false);

// ── metric ──────────────────────────────────────────────────────────────────
const metric = leerBloque('metric', 'value: 90\nunit: "%"\nlabel: De dos campañas');
eq('la cifra ancla se lee', metric.campos, { value: 90, unit: '%', label: 'De dos campañas' });
eq('y vuelve entera', leerBloque('metric', escribirBloque('metric', metric)).campos, metric.campos);

// ── steps y actions ─────────────────────────────────────────────────────────
const steps = leerBloque('steps', '- title: Congelar pujas\n  when: SEMANA 1\n  state: active\n- title: Medir');
eq('los pasos se leen', steps.items.length, 2);
eq('el paso en curso se marca', steps.items[0].state, 'active');
eq('ida y vuelta de pasos', leerBloque('steps', escribirBloque('steps', steps)).items, steps.items);

const actions = leerBloque('actions', '- action: Poner tope\n  owner: Marketing\n  due: 21 ago\n- action: Sin dueño');
eq('las acciones se leen', actions.items.length, 2);
eq('ida y vuelta de acciones', leerBloque('actions', escribirBloque('actions', actions)).items, actions.items);

// ── rank ────────────────────────────────────────────────────────────────────
const rankYaml = `columns: [Campaña, Coste, Peso, Estado]
bar: Peso
status: Estado
highlight: 2
rows:
  - [CodigoFacilito, "$59,998", 14362, bad]
  - [MasterEnPython, "$43,821", 4626, ok]`;

const rank = leerBloque('rank', rankYaml);
eq('las columnas se leen', rank.columns, ['Campaña', 'Coste', 'Peso', 'Estado']);
eq('las filas también', rank.rows.length, 2);
eq('la barra y el semáforo', [rank.bar, rank.status, rank.highlight], ['Peso', 'Estado', 2]);
const rankVuelta = leerBloque('rank', escribirBloque('rank', rank));
eq('ida y vuelta de la tabla', [rankVuelta.columns, rankVuelta.rows, rankVuelta.bar], [rank.columns, rank.rows, rank.bar]);
eq('las filas se escriben en línea, una por renglón',
    /rows:\n\s+- \[/.test(escribirBloque('rank', rank)), true);
eq('y el dinero de una celda sigue entero',
    escribirBloque('rank', rank).includes('$59,998'), true);

// ── los avisos del contrato visual ──────────────────────────────────────────
const nKpis = (n) => ({ items: Array.from({ length: n }, (_, i) => ({ label: `M${i}`, value: '1' })) });
eq('cinco métricas no avisan', avisosDe('kpis', nKpis(5)), []);
eq('seis sí', avisosDe('kpis', nKpis(6)).length, 1);
eq('una sola sugiere la cifra ancla', avisosDe('kpis', nKpis(1))[0].includes('anchor figure'), true);
eq('dos destacadas avisan',
    avisosDe('kpis', { items: [{ label: 'a', highlight: true }, { label: 'b', highlight: true }] }).some(t => t.includes('Highlighting')), true);
eq('una acción sin responsable avisa',
    avisosDe('actions', { items: [{ action: 'X' }] })[0].includes('wish'), true);
eq('con responsable, no',
    avisosDe('actions', { items: [{ action: 'X', owner: 'Yo' }] }), []);
eq('dos pasos en curso avisan',
    avisosDe('steps', { items: [{ state: 'active' }, { state: 'active' }] }).length, 1);
eq('una barra que no existe avisa',
    avisosDe('rank', { columns: ['A'], rows: [['1']], bar: 'Z' })[0].includes('bar column'), true);
eq('filas de distinto ancho avisan',
    avisosDe('rank', { columns: ['A', 'B'], rows: [['1', '2'], ['1']] }).some(t => t.includes('cells')), true);

// ── sustituir el bloque dentro de la prosa ──────────────────────────────────
const b = bloqueEnCursor(prosa, dentro);
const nueva = reemplazarBloque(prosa, b, '- label: Otro\n  value: 1');
eq('lo de antes del bloque no se toca', nueva.startsWith('## El total apenas se movió'), true);
eq('lo de después tampoco', nueva.endsWith('Texto de después.'), true);
eq('y el bloque nuevo se lee', bloqueEnCursor(nueva, nueva.indexOf('Otro'))?.cuerpo.trim(), '- label: Otro\n  value: 1');

// ── la tabla de campos, coherente ───────────────────────────────────────────
eq('los cinco bloques están', Object.keys(BLOQUES).sort(), ['actions', 'kpis', 'metric', 'rank', 'steps']);
eq('todo campo declara id y etiqueta',
    Object.values(BLOQUES).flatMap(b => b.campos || []).every(c => c.id && c.label), true);

// ── todos los bloques de un texto ───────────────────────────────────────────
const varios = `Intro

${F}kpis
- label: A
${F}

Medio

${F}steps
- title: B
${F}

Fin`;
eq('encuentra los dos', bloquesDe(varios).map(b => b.lang), ['kpis', 'steps']);
eq('en orden de aparicion', bloquesDe(varios)[0].desde < bloquesDe(varios)[1].desde, true);
eq('un bloque de codigo normal no cuenta',
    bloquesDe(`${F}sql
SELECT 1
${F}`).length, 0);
eq('sin bloques, lista vacia', bloquesDe('solo texto'), []);

// ── añadir un registro tiene que verse ──────────────────────────────────────
// La primera version descartaba los registros vacios al serializar, asi que el
// boton «Añadir metrica» no hacia nada: se creaba, se tiraba, y al releer
// volvian a ser los de antes.
const conNuevo = leerBloque('kpis', escribirBloque('kpis', { items: [{ label: 'A' }, {}] }));
eq('un registro recien añadido sobrevive al ida y vuelta', conNuevo.items.length, 2);
eq('y esta vacio, listo para escribir encima', conNuevo.items[1], {});
eq('pero una lista sin registros sigue dando cuerpo vacio',
    escribirBloque('kpis', { items: [] }), '');

console.log(`\n${ok} pasan, ${mal} fallan`);
process.exit(mal ? 1 : 0);
