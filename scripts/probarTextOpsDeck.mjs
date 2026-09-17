/**
 * Ejercita `deckTextOps.js` — las operaciones de texto de una región.
 *
 *     node scripts/probarTextOpsDeck.mjs
 *
 * Son funciones puras sobre una cadena y dos índices, y ahí está la gracia:
 * es la clase de código que se rompe en los bordes —selección vacía, marca ya
 * puesta, cursor justo en el límite, párrafo a medio convertir en lista— y
 * esos bordes se prueban en un segundo desde aquí y no se prueban nunca
 * pinchando en la aplicación.
 */
import {
    alternarMarca, alternarPrefijo, insertarEnlace,
    detectarDisparo, filtrarInsertables, filtrarParaLamina, aplanar,
    resolverParadas, aplicarInsercion,
} from '../client/src/components/deck/deckTextOps.js';

let ok = 0, mal = 0;
const eq = (nombre, a, b) => {
    const pasa = JSON.stringify(a) === JSON.stringify(b);
    if (pasa) { ok++; } else { mal++; console.log(`  FALLA  ${nombre}\n    esperado: ${JSON.stringify(b)}\n    obtenido: ${JSON.stringify(a)}`); }
};
/** Pinta el resultado como texto con la selección entre corchetes. */
const ver = (r) => `${r.texto.slice(0, r.selDesde)}[${r.texto.slice(r.selDesde, r.selHasta)}]${r.texto.slice(r.selHasta)}`;

// ── negrita y compañía ──────────────────────────────────────────────────────
eq('envuelve la selección', ver(alternarMarca('el coste sube', 3, 8, '**')), 'el **[coste]** sube');
eq('quita la marca desde dentro', ver(alternarMarca('el **coste** sube', 5, 10, '**')), 'el [coste] sube');
eq('quita la marca con ella seleccionada', ver(alternarMarca('el **coste** sube', 3, 12, '**')), 'el [coste] sube');
eq('selección vacía deja el cursor en medio', ver(alternarMarca('el  sube', 3, 3, '**')), 'el **[]** sube');
eq('cursiva usa una sola marca', ver(alternarMarca('muy caro', 0, 3, '*')), '*[muy]* caro');
eq('código en línea', ver(alternarMarca('usa SELECT ya', 4, 10, '`')), 'usa `[SELECT]` ya');
eq('poner y quitar deja el original',
    alternarMarca(alternarMarca('el coste', 3, 8, '**').texto, 5, 10, '**').texto, 'el coste');

// ── prefijos de línea ───────────────────────────────────────────────────────
const tres = 'uno\ndos\ntres';
eq('convierte tres líneas en lista', alternarPrefijo(tres, 0, tres.length, '- ').texto, '- uno\n- dos\n- tres');
eq('y las devuelve', alternarPrefijo('- uno\n- dos\n- tres', 0, 17, '- ').texto, 'uno\ndos\ntres');
eq('una sola línea, con el cursor dentro', alternarPrefijo(tres, 5, 5, '> ').texto, 'uno\n> dos\ntres');
eq('a medio convertir, las pone todas',
    alternarPrefijo('- uno\ndos', 0, 9, '- ').texto, '- - uno\n- dos');
eq('las líneas vacías se respetan',
    alternarPrefijo('uno\n\ndos', 0, 8, '- ').texto, '- uno\n\n- dos');

// ── enlace ──────────────────────────────────────────────────────────────────
eq('con texto seleccionado, el destino queda marcado',
    ver(insertarEnlace('ver el informe', 7, 14)), 'ver el [informe]([https://])');
eq('sin selección pone un texto de relleno', insertarEnlace('ver ', 4, 4).texto, 'ver [texto](https://)');

// ── el disparo del menú ─────────────────────────────────────────────────────
eq('barra a principio de línea dispara', detectarDisparo('/', 1), { desde: 0, consulta: '' });
eq('barra tras espacio dispara', detectarDisparo('hola /me', 8), { desde: 5, consulta: 'me' });
eq('barra a principio de línea nueva', detectarDisparo('uno\n/ta', 7), { desde: 4, consulta: 'ta' });
eq('una ruta NO dispara', detectarDisparo('docs/dev', 8), null);
eq('una fracción NO dispara', detectarDisparo('y/o', 3), null);
eq('con el cursor antes de la barra, nada', detectarDisparo('hola /me', 4), null);
eq('acentos en la consulta', detectarDisparo('/métr', 5), { desde: 0, consulta: 'métr' });

// ── filtrado ────────────────────────────────────────────────────────────────
const todo = filtrarInsertables('');
eq('sin consulta salen todos los grupos', todo.length >= 2, true);
eq('los grupos traen items', todo.every(g => g.items.length > 0), true);
const conTitulo = aplanar(filtrarInsertables('heading'));
eq('filtra por palabra clave', conTitulo.length > 0 && conTitulo.every(i => (i.label + i.keywords + i.id).toLowerCase().includes('heading')), true);
eq('una consulta imposible no devuelve grupos vacíos', filtrarInsertables('zzzzz'), []);

// ── paradas de tabulación ───────────────────────────────────────────────────
eq('la primera parada se selecciona',
    resolverParadas('## ${1:Título}'), { texto: '## Título', offset: 3, largo: 6 });
eq('las demás se quedan con su texto',
    resolverParadas('- ${1:uno}\n- ${2:dos}').texto, '- uno\n- dos');
eq('y la selección sigue en la primera',
    resolverParadas('- ${1:uno}\n- ${2:dos}'), { texto: '- uno\n- dos', offset: 2, largo: 3 });
eq('un snippet sin paradas deja el cursor al final',
    resolverParadas('---'), { texto: '---', offset: 3, largo: 0 });

// ── inserción completa ──────────────────────────────────────────────────────
const item = { id: 'x', label: 'X', snippet: '## ${1:Título}' };
const texto = 'Algo /ti';
const disparo = detectarDisparo(texto, texto.length);
eq('sustituye el disparo por el snippet',
    ver(aplicarInsercion(texto, disparo, texto.length, item)), 'Algo ## [Título]');
eq('y no se come lo que había detrás',
    aplicarInsercion('/ti y más', { desde: 0, consulta: 'ti' }, 3, item).texto, '## Título y más');

// ── el catálogo de la lámina, que no es el del documento ────────────────────
const enLamina = (q) => aplanar(filtrarParaLamina(q)).map(i => i.id);
eq('«metr» encuentra la tira de métricas', enLamina('metr').includes('kpis'), true);
eq('«anchor» encuentra la cifra ancla', enLamina('anchor').includes('metric'), true);
eq('«chart» encuentra la figura', enLamina('chart').includes('figura'), true);
eq('«table» encuentra la clasificada y la normal',
    ['rank', 'tabla'].every(id => enLamina('table').includes(id)), true);
eq('la cabecera del documento NO se ofrece en una lámina', enLamina('').includes('cabecera'), false);
eq('el índice tampoco', enLamina('').includes('indice'), false);
eq('las casillas de tarea tampoco', enLamina('').includes('tarea'), false);
eq('pero las alertas sí', enLamina('').includes('aviso'), true);
eq('el catálogo del documento sigue intacto',
    aplanar(filtrarInsertables('')).some(i => i.id === 'cabecera'), true);

// los snippets de los bloques de dato tienen que abrir y cerrar su cerca
for (const id of ['kpis', 'metric', 'rank', 'acciones', 'figura']) {
    const it = aplanar(filtrarParaLamina('')).find(x => x.id === id);
    eq(`el snippet de ${id} cierra su cerca`, (it.snippet.match(/```/g) || []).length, 2);
}

// El dinero sobrevive. La version que borraba la forma corta `$N` convertia
// «$1.24M» en «.24M» — visto al insertar la tira de metricas en la aplicacion.
eq('una cantidad en dolares no se toca',
    resolverParadas('value: $1.24M').texto, 'value: $1.24M');
const conDinero = '- label: ${1:Coste}\n  value: $1.24M';
eq('y con una parada delante, tampoco',
    resolverParadas(conDinero).texto, '- label: Coste\n  value: $1.24M');
eq('la parada sigue cayendo donde debe',
    resolverParadas(conDinero), { texto: '- label: Coste\n  value: $1.24M', offset: 9, largo: 5 });
eq('el snippet real de kpis conserva su cifra',
    aplanar(filtrarParaLamina('')).find(i => i.id === 'kpis').snippet.includes('$1.24M'), true);
eq('y resuelto, tambien',
    resolverParadas(aplanar(filtrarParaLamina('')).find(i => i.id === 'kpis').snippet).texto.includes('$1.24M'), true);

console.log(`\n${ok} pasan, ${mal} fallan`);
process.exit(mal ? 1 : 0);
