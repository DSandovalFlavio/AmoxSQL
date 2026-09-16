/**
 * Ejercita `diagram/diagramFile.js` y `diagram/diagramGraph.js`.
 *
 *     node scripts/probarArchivoDiagrama.mjs
 *
 * Lo que se vigila aquí es **que guardar no toque lo que no se ha editado**. Es
 * la garantía de la que depende todo lo demás: si reescribir un diagrama
 * reescribe también su cabecera o el texto de alrededor, nadie va a querer abrir
 * con esto un documento que le importe.
 *
 * `diagramGraph` va aparte del componente justamente para poder probarlo desde
 * aquí: el orden de las capas del lienzo es la clase de cosa que si no se
 * comprueba se descubre mirando la pantalla y pensando que es un problema de
 * estilo.
 */
import {
    leerDiagrama, escribirDiagrama, archivoDesdeGrafo, partirCabecera, tituloDe,
    esDiagrama, DIAGRAMA_INICIAL, EXT_DIAGRAMA,
} from '../client/src/components/diagram/diagramFile.js';
import { nodosDeLienzo, aristasDeLienzo } from '../client/src/components/diagram/diagramGraph.js';
import { parsearFlujo, flujoVacio } from '../client/src/components/markdown/mermaidFlow.js';

let ok = 0, mal = 0;
const eq = (nombre, a, b) => {
    const pasa = JSON.stringify(a) === JSON.stringify(b);
    if (pasa) { ok++; } else { mal++; console.log(`  FALLA  ${nombre}\n    esperado: ${JSON.stringify(b)}\n    obtenido: ${JSON.stringify(a)}`); }
};
const F = '```';

// ── la cabecera ─────────────────────────────────────────────────────────────
eq('parte la cabecera', partirCabecera('---\ntitle: X\n---\n\ncuerpo').cabecera, '---\ntitle: X\n---\n\n');
eq('y deja el cuerpo', partirCabecera('---\ntitle: X\n---\n\ncuerpo').cuerpo, 'cuerpo');
eq('sin cabecera, todo es cuerpo', partirCabecera('cuerpo').cuerpo, 'cuerpo');
eq('sin cabecera, cabecera vacía', partirCabecera('cuerpo').cabecera, '');
eq('con CRLF también', partirCabecera('---\r\ntitle: X\r\n---\r\ncuerpo').cuerpo, 'cuerpo');
eq('el título', tituloDe('---\ntitle: Ingesta de ventas\n---\n'), 'Ingesta de ventas');
eq('entrecomillado', tituloDe('---\ntitle: "Ingesta: fase 1"\n---\n'), 'Ingesta: fase 1');
eq('sin título', tituloDe('---\nauthor: x\n---\n'), '');
eq('sin cabecera', tituloDe(''), '');

// ── leer un archivo ─────────────────────────────────────────────────────────
const doc = leerDiagrama(DIAGRAMA_INICIAL);
eq('la plantilla trae título', doc.titulo, 'Untitled diagram');
eq('y se parsea', doc.grafo !== null, true);
eq('con tres cajas', doc.grafo.nodos.length, 3);
eq('y dos flechas', doc.grafo.aristas.length, 2);
eq('sin bloques de más', doc.sobran, 0);
// La plantilla tiene que estar ya en forma canónica: si no, crear un diagrama y
// guardarlo sin tocar nada produciría un diff.
eq('la plantilla ya está en forma canónica', escribirDiagrama(DIAGRAMA_INICIAL, doc.grafo), DIAGRAMA_INICIAL);

eq('un archivo sin bloque no tiene grafo', leerDiagrama('---\ntitle: X\n---\n\nsólo texto').grafo, null);
eq('pero tampoco revienta', leerDiagrama('---\ntitle: X\n---\n\nsólo texto').mermaid, '');
eq('un diagrama de otro tipo tampoco se abre',
    leerDiagrama(`---\ntitle: X\n---\n\n${F}mermaid\nsequenceDiagram\n  A->>B: x\n${F}\n`).grafo, null);
// Y el texto sigue ahí: el editor lo necesita para poder enseñarlo y explicar
// por qué no lo abre.
eq('y su texto sobrevive intacto',
    leerDiagrama(`---\ntitle: X\n---\n\n${F}mermaid\nsequenceDiagram\n  A->>B: x\n${F}\n`).mermaid,
    'sequenceDiagram\n  A->>B: x');
eq('un archivo vacío', leerDiagrama('').grafo, null);
eq('nulo', leerDiagrama(null).grafo, null);

// ── escribir sin tocar lo demás ─────────────────────────────────────────────
const conComentarios = [
    '---',
    '# esta cabecera la escribió alguien a mano',
    'title: Arquitectura',
    "author: 'Equipo de datos'   # con comentario al lado",
    'updated: 2026-09-15',
    '---',
    '',
    `${F}mermaid`,
    'flowchart LR',
    '  a["A"] --> b["B"]',
    F,
    '',
].join('\n');

const g2 = leerDiagrama(conComentarios).grafo;
g2.nodos.push({ id: 'c', texto: 'C', forma: 'almacen' });
g2.aristas.push({ desde: 'b', hasta: 'c', etiqueta: '', estilo: 'lotes' });
const escrito = escribirDiagrama(conComentarios, g2);

eq('la cabecera sobrevive byte a byte',
    partirCabecera(escrito).cabecera, partirCabecera(conComentarios).cabecera);
eq('el comentario de la cabecera también', escrito.includes('# esta cabecera la escribió alguien a mano'), true);
eq('y el comentario en línea', escrito.includes("author: 'Equipo de datos'   # con comentario al lado"), true);
eq('el diagrama sí cambió', leerDiagrama(escrito).grafo.nodos.length, 3);
eq('y se vuelve a leer', leerDiagrama(escrito).grafo.aristas.length, 2);
eq('escribir dos veces da lo mismo', escribirDiagrama(escrito, leerDiagrama(escrito).grafo), escrito);

// Un archivo a medio escribir a mano, sin bloque: se añade, no se reescribe.
const sinBloque = '---\ntitle: X\n---\n\nApuntes sueltos.\n';
const conBloque = escribirDiagrama(sinBloque, parsearFlujo('flowchart LR\n  a["A"]'));
eq('se añade el bloque', leerDiagrama(conBloque).grafo !== null, true);
eq('y los apuntes siguen ahí', conBloque.includes('Apuntes sueltos.'), true);
eq('la cabecera también', partirCabecera(conBloque).cabecera, partirCabecera(sinBloque).cabecera);

// ── archivo nuevo desde un grafo (el «Guardar como» de la fase 3) ───────────
const nuevo = archivoDesdeGrafo(parsearFlujo('flowchart TB\n  x["X"] --> y["Y"]'), 'Extraído');
eq('lleva título', leerDiagrama(nuevo).titulo, 'Extraído');
eq('y el diagrama', leerDiagrama(nuevo).grafo.aristas.length, 1);
eq('conserva la dirección', leerDiagrama(nuevo).grafo.direccion, 'TB');
eq('desde un grafo vacío también vale', leerDiagrama(archivoDesdeGrafo(null)).grafo?.nodos.length, 0);

// ── reconocer el tipo ───────────────────────────────────────────────────────
eq('por extensión', esDiagrama('ingesta.amoxdiagram'), true);
eq('en mayúsculas', esDiagrama('INGESTA.AMOXDIAGRAM'), true);
eq('por tipo de pestaña', esDiagrama('amoxdiagram'), true);
eq('un deck no', esDiagrama('informe.amoxdeck'), false);
eq('un markdown no', esDiagrama('notas.md'), false);
eq('nada no', esDiagrama(null), false);
eq('la extensión está declarada', EXT_DIAGRAMA, '.amoxdiagram');

// ── del grafo al lienzo ─────────────────────────────────────────────────────
const arq = parsearFlujo([
    'flowchart LR',
    '  subgraph G1["Origen"]',
    '    erp[("Ventas ERP")]',
    '    web[("Eventos web")]',
    '  end',
    '  erp --> land["Aterrizaje"]',
    '  web -.-> land',
    '  land ==> alm[("Almacén")]',
].join('\n'));

// Medidas de mentira: la geometría real necesita un navegador, pero la
// traducción a React Flow no, y es lo que se prueba aquí.
const medidas = {
    nodos: new Map(arq.nodos.map((n, i) => [n.id, { x: i * 140, y: 40, ancho: 110, alto: 36 }])),
    grupos: new Map([['G1', { x: 0, y: 10, ancho: 130, alto: 190 }]]),
};

const nodos = nodosDeLienzo(arq, medidas);
eq('salen las cuatro cajas y el grupo', nodos.length, 5);
// **El grupo va primero, y no es estético**: React Flow apila por orden de
// aparición, así que un recuadro declarado después taparía sus propias cajas y
// parecerían deshabilitadas.
eq('el grupo va el primero', nodos[0].type, 'grupo');
eq('con su identificador con prefijo', nodos[0].id, 'grupo:G1');
// Arrastrarlo no: la posición la calcula mermaid. Seleccionarlo SÍ, desde que
// hay que poder renombrarlo y deshacerlo — un recuadro que no responde al ratón
// parece decorado, y el inspector no tendría cómo hablar de él.
eq('no se arrastra', nodos[0].draggable, false);
eq('pero se selecciona', nodos[0].selectable !== false, true);
eq('y sabe si está seleccionado',
    nodosDeLienzo(arq, medidas, { tipo: 'grupo', id: 'G1' })[0].selected, true);
eq('el recuadro lleva alto explícito', nodos[0].style.height, 190);
// El tamaño va también en el NODO, no sólo en su estilo: React Flow dibuja en
// el minimapa únicamente los nodos que lo declaran, y sin él se veía un
// recuadro negro vacío en la esquina. De paso se ahorra tener que medirlos, que
// depende de que el navegador pinte.
eq('y el tamaño va en el nodo, para el minimapa', [nodos[0].width, nodos[0].height], [130, 190]);
eq('las cajas también', [nodos.find(n => n.id === 'erp').width, nodos.find(n => n.id === 'erp').height], [110, 36]);
eq('las cajas llevan su forma', nodos.find(n => n.id === 'erp').data.forma, 'almacen');
eq('y su posición medida', nodos.find(n => n.id === 'land').position.x, 280);
eq('la insignia cuenta las flechas que entran', nodos.find(n => n.id === 'land').data.entrantes, 2);
eq('y no la pone donde no toca', nodos.find(n => n.id === 'erp').data.entrantes, 0);
eq('sin medidas, ningún nodo', nodosDeLienzo(arq, null), []);
eq('sin grafo tampoco', nodosDeLienzo(null, medidas), []);
eq('un grupo sin medir no se dibuja',
    nodosDeLienzo(arq, { nodos: medidas.nodos, grupos: new Map() }).filter(n => n.type === 'grupo').length, 0);

const aristas = aristasDeLienzo(arq, '#888');
eq('tres flechas', aristas.length, 3);
eq('la punteada', aristas[1].style.strokeDasharray, '5 4');
eq('la gruesa', aristas[2].style.strokeWidth, 3.2);
eq('con etiqueta cuando la hay', aristasDeLienzo(parsearFlujo('flowchart LR\n  a -->|pasa| b'), '#888')[0].label, 'pasa');
eq('y sin ella cuando no', aristas[0].label, undefined);
// Dos cajas pueden estar unidas por DOS flechas —una de ida y otra de vuelta—:
// con la clave `origen-destino` React dibujaría sólo una, sin avisar.
const dobles = aristasDeLienzo(parsearFlujo('flowchart LR\n  a --> b\n  a -.-> b'), '#888');
eq('dos flechas entre las mismas cajas son dos', new Set(dobles.map(e => e.id)).size, 2);
eq('sin grafo, ninguna flecha', aristasDeLienzo(null, '#888'), []);
eq('un grafo vacío da lienzo vacío',
    nodosDeLienzo(flujoVacio(), { nodos: new Map(), grupos: new Map() }), []);

console.log(`\n${ok} bien, ${mal} mal`);
process.exit(mal ? 1 : 0);
