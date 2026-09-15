/**
 * Ejercita `mermaidFlow.js` y `fencedBlocks.js` — el formato de AmoxDiagram.
 *
 *     node scripts/probarMermaidFlow.mjs
 *
 * El criterio central es el **ida y vuelta**: parsear un texto, serializarlo y
 * volver a parsearlo tiene que dar el mismo grafo. Un fallo aquí no se ve — el
 * diagrama sigue dibujándose, sólo que con una flecha menos o una caja que
 * cambió de forma, y eso se descubre proyectado delante del equipo.
 *
 * La otra mitad es lo que **no** se toca: un diagrama con `classDef` y `click`
 * tiene que salir por el otro lado con esas líneas intactas. Es la promesa que
 * hace posible abrir los diagramas que este público escribe de verdad.
 */
import {
    parsearFlujo, flujoAMermaid, cabosSueltos, idLibre, grupoDe, flujoVacio,
    FORMAS, ESTILOS_ARISTA, porQueNoSeAbre, MOTIVOS_FLUJO,
} from '../client/src/components/markdown/mermaidFlow.js';
import {
    bloquesCercados, cercadoEnCursor, reemplazarCercado,
} from '../client/src/components/markdown/fencedBlocks.js';
import { chainAMermaid } from '../client/src/components/markdown/diagramFromChain.js';
import { PLANTILLAS_DIAGRAMA } from '../client/src/components/markdown/markdownInsertables.js';

let ok = 0, mal = 0;
const eq = (nombre, a, b) => {
    const pasa = JSON.stringify(a) === JSON.stringify(b);
    if (pasa) { ok++; } else { mal++; console.log(`  FALLA  ${nombre}\n    esperado: ${JSON.stringify(b)}\n    obtenido: ${JSON.stringify(a)}`); }
};
const F = '```';

/** El ida y vuelta, que es la propiedad que de verdad importa. */
function ida(nombre, texto) {
    const g1 = parsearFlujo(texto);
    if (!g1) { mal++; console.log(`  FALLA  ${nombre}\n    no se pudo parsear`); return null; }
    const t2 = flujoAMermaid(g1);
    const g2 = parsearFlujo(t2);
    if (!g2) { mal++; console.log(`  FALLA  ${nombre}\n    el texto serializado no se vuelve a leer:\n${t2}`); return null; }
    eq(`ida y vuelta · ${nombre}`, g2, g1);
    // Y estable: serializar dos veces da exactamente lo mismo.
    eq(`  estable · ${nombre}`, flujoAMermaid(g2), t2);
    return g1;
}

// ── lo mínimo ───────────────────────────────────────────────────────────────
const simple = parsearFlujo('flowchart LR\n  A["origen"] --> B["destino"]');
eq('dirección', simple.direccion, 'LR');
eq('dos nodos', simple.nodos.map(n => n.id), ['A', 'B']);
eq('el texto sale de la etiqueta', simple.nodos[0].texto, 'origen');
eq('una arista', simple.aristas, [{ desde: 'A', hasta: 'B', etiqueta: '', estilo: 'lotes' }]);
eq('sin subgrafos', simple.subgrafos, []);
eq('sin conservado', simple.conservado, []);

eq('`graph` es el nombre viejo y vale', parsearFlujo('graph TB\n  A --> B')?.direccion, 'TB');
eq('sin dirección, TB', parsearFlujo('flowchart\n  A --> B')?.direccion, 'TB');
eq('TD se respeta, no se traduce', parsearFlujo('flowchart TD\n  A --> B')?.direccion, 'TD');
eq('una dirección inventada no se abre', parsearFlujo('flowchart XY\n  A --> B'), null);
eq('un nodo sin etiqueta se llama como su id', parsearFlujo('flowchart LR\n  A --> B').nodos[0].texto, 'A');
eq('un nodo suelto, sin aristas', parsearFlujo('flowchart LR\n  solo["Solo"]').nodos.length, 1);

// ── las siete formas ────────────────────────────────────────────────────────
const formas = parsearFlujo([
    'flowchart LR',
    '  a["proceso"]',
    '  b("redondeado")',
    '  c[("almacen")]',
    '  d{"decision"}',
    '  e[/"entrada"/]',
    '  f[\\"salida"\\]',
    '  g(("hito"))',
].join('\n'));
eq('las siete formas se leen', formas.nodos.map(n => n.forma),
    ['proceso', 'redondeado', 'almacen', 'decision', 'entrada', 'salida', 'hito']);
eq('y su texto', formas.nodos.map(n => n.texto),
    ['proceso', 'redondeado', 'almacen', 'decision', 'entrada', 'salida', 'hito']);
eq('están las catorce declaradas', Object.keys(FORMAS).length, 14);
eq('y todas dicen qué significan', Object.values(FORMAS).every((f) => f.nombre && f.que), true);
ida('las siete primeras formas', flujoAMermaid(formas));

// Las siete que llegaron después.
const masFormas = parsearFlujo([
    'flowchart LR',
    '  h(["estadio"])',
    '  i[["subproceso"]]',
    '  j{{"preparacion"}}',
    '  k[/"manual"\\]',
    '  l[\\"manualEntrada"/]',
    '  m>"nota"]',
    '  n((("fin")))',
].join('\n'));
eq('las otras siete se leen', masFormas.nodos.map(n => n.forma),
    ['estadio', 'subproceso', 'preparacion', 'manual', 'manualEntrada', 'nota', 'fin']);
eq('y su texto', masFormas.nodos.map(n => n.texto),
    ['estadio', 'subproceso', 'preparacion', 'manual', 'manualEntrada', 'nota', 'fin']);
ida('las otras siete formas', flujoAMermaid(masFormas));

// **Lo que de verdad se vigila aquí.** `[/ … /]` y `[/ … \]` abren igual y
// cierran distinto: elegir por el cerco de apertura no basta, y equivocarse no
// da un error — da una caja con otra silueta.
eq('`[/ /]` es entrada', parsearFlujo('flowchart LR\n  a[/"x"/]').nodos[0].forma, 'entrada');
eq('`[/ \\]` es manual', parsearFlujo('flowchart LR\n  a[/"x"\\]').nodos[0].forma, 'manual');
eq('`[\\ \\]` es salida', parsearFlujo('flowchart LR\n  a[\\"x"\\]').nodos[0].forma, 'salida');
eq('`[\\ /]` es entrada manual', parsearFlujo('flowchart LR\n  a[\\"x"/]').nodos[0].forma, 'manualEntrada');
// Y sin comillas, donde el cierre se busca por posición.
eq('sin comillas, `[/ /]`', parsearFlujo('flowchart LR\n  a[/x/]').nodos[0].forma, 'entrada');
eq('sin comillas, `[/ \\]`', parsearFlujo('flowchart LR\n  a[/x\\]').nodos[0].forma, 'manual');
// Los cercos que se contienen: el más largo manda.
eq('`(((` no se lee como `((`', parsearFlujo('flowchart LR\n  a((("x")))').nodos[0].forma, 'fin');
eq('`((` no se lee como `(`', parsearFlujo('flowchart LR\n  a(("x"))').nodos[0].forma, 'hito');
eq('`([` no se lee como `(`', parsearFlujo('flowchart LR\n  a(["x"])').nodos[0].forma, 'estadio');
eq('`[[` no se lee como `[`', parsearFlujo('flowchart LR\n  a[["x"]]').nodos[0].forma, 'subproceso');
eq('`{{` no se lee como `{`', parsearFlujo('flowchart LR\n  a{{"x"}}').nodos[0].forma, 'preparacion');
eq('`[(` no se lee como `[`', parsearFlujo('flowchart LR\n  a[("x")]').nodos[0].forma, 'almacen');
// Y una cadena con formas ambiguas seguidas, que es donde un cierre mal elegido
// se comería la caja siguiente.
const cadenaAmbigua = parsearFlujo('flowchart LR\n  a[/"uno"/] --> b[/"dos"\\] --> c[\\"tres"/]');
eq('una cadena de formas ambiguas', cadenaAmbigua?.nodos.map(n => n.forma), ['entrada', 'manual', 'manualEntrada']);
eq('con sus dos flechas', cadenaAmbigua?.aristas.length, 2);

// `[(` tiene que probarse antes que `[`, y `((` antes que `(`.
eq('almacén no se lee como proceso', parsearFlujo('flowchart LR\n  a[(x)]').nodos[0].forma, 'almacen');
eq('hito no se lee como redondeado', parsearFlujo('flowchart LR\n  a((x))').nodos[0].forma, 'hito');
eq('entrada no se lee como proceso', parsearFlujo('flowchart LR\n  a[/x/]').nodos[0].forma, 'entrada');

// ── etiquetas sin comillas, que es como la gente escribe ────────────────────
eq('sin comillas también', parsearFlujo('flowchart LR\n  A[origen] --> B[destino]').nodos[0].texto, 'origen');
eq('con espacios dentro', parsearFlujo('flowchart LR\n  A[zona de aterrizaje]').nodos[0].texto, 'zona de aterrizaje');
eq('al serializar siempre lleva comillas',
    flujoAMermaid(parsearFlujo('flowchart LR\n  A[origen]')), 'flowchart LR\n  A["origen"]');
eq('las comillas del autor pasan a simples',
    flujoAMermaid(parsearFlujo('flowchart LR\n  A["dice \'hola\'"]')).includes("'hola'"), true);
// Un guion dentro de la etiqueta no puede confundirse con una flecha: la
// etiqueta se consume entera antes de buscar conector.
eq('un guion en la etiqueta no rompe',
    parsearFlujo('flowchart LR\n  A["e-commerce"] --> B["pre-carga"]').aristas.length, 1);
eq('y los nodos salen bien',
    parsearFlujo('flowchart LR\n  A["e-commerce"] --> B["x"]').nodos[0].texto, 'e-commerce');

// ── los cuatro estilos de flecha ────────────────────────────────────────────
const flechas = parsearFlujo([
    'flowchart LR',
    '  a --> b',
    '  b -.-> c',
    '  c ==> d',
    '  d --- e',
].join('\n'));
eq('los cuatro estilos', flechas.aristas.map(a => a.estilo), ['lotes', 'continuo', 'principal', 'simple']);
eq('están los cuatro declarados', Object.keys(ESTILOS_ARISTA).length, 4);
ida('los cuatro estilos', flujoAMermaid(flechas));

// ── etiquetas de arista, en sus dos formas ──────────────────────────────────
eq('etiqueta entre barras', parsearFlujo('flowchart LR\n  a -->|pasa| b').aristas[0].etiqueta, 'pasa');
eq('etiqueta entre guiones', parsearFlujo('flowchart LR\n  a -- pasa --> b').aristas[0].etiqueta, 'pasa');
eq('la forma con guiones también es `lotes`', parsearFlujo('flowchart LR\n  a -- x --> b').aristas[0].estilo, 'lotes');
eq('con guiones y sin flecha es `simple`', parsearFlujo('flowchart LR\n  a -- x --- b').aristas[0].estilo, 'simple');
eq('etiqueta punteada', parsearFlujo('flowchart LR\n  a -.->|evento| b').aristas[0].etiqueta, 'evento');
// Las dos formas convergen en una sola al escribir: es lo que hace estable el
// serializador, y el precio es un diff la primera vez.
eq('las dos formas se escriben igual',
    flujoAMermaid(parsearFlujo('flowchart LR\n  a -- pasa --> b')),
    flujoAMermaid(parsearFlujo('flowchart LR\n  a -->|pasa| b')));

// ── cadenas ─────────────────────────────────────────────────────────────────
const cadena = parsearFlujo('flowchart LR\n  a --> b --> c');
eq('una cadena son dos aristas', cadena.aristas.map(x => [x.desde, x.hasta]), [['a', 'b'], ['b', 'c']]);
eq('y tres nodos', cadena.nodos.length, 3);
ida('cadena', 'flowchart LR\n  a["A"] --> b["B"] --> c["C"]');

// ── subgrafos ───────────────────────────────────────────────────────────────
const conGrupo = parsearFlujo([
    'flowchart LR',
    '  subgraph G1["Origen"]',
    '    erp[("Ventas ERP")]',
    '    web[("Eventos web")]',
    '  end',
    '  erp --> land["Aterrizaje"]',
    '  web -.-> land',
].join('\n'));
eq('un subgrafo', conGrupo.subgrafos.length, 1);
eq('con su título', conGrupo.subgrafos[0].titulo, 'Origen');
eq('y sus dos nodos', conGrupo.subgrafos[0].nodos, ['erp', 'web']);
eq('el nodo de fuera no entra', conGrupo.subgrafos[0].nodos.includes('land'), false);
eq('grupoDe encuentra el grupo', grupoDe(conGrupo, 'erp')?.id, 'G1');
eq('y no inventa uno', grupoDe(conGrupo, 'land'), null);
ida('con subgrafo', flujoAMermaid(conGrupo));

eq('subgraph con nombre a secas', parsearFlujo('flowchart LR\n  subgraph Origen\n    a\n  end').subgrafos[0].titulo, 'Origen');
eq('y su id es el mismo', parsearFlujo('flowchart LR\n  subgraph Origen\n    a\n  end').subgrafos[0].id, 'Origen');
eq('subgraph con título de varias palabras',
    parsearFlujo('flowchart LR\n  subgraph Zona de aterrizaje\n    a\n  end').subgrafos[0].titulo, 'Zona de aterrizaje');
eq('al que se le inventa un id estable',
    parsearFlujo('flowchart LR\n  subgraph Zona de aterrizaje\n    a\n  end').subgrafos[0].id, 'sg1');
eq('un subgraph sin end no se abre', parsearFlujo('flowchart LR\n  subgraph G\n    a'), null);
eq('un end de más tampoco', parsearFlujo('flowchart LR\n  a\n  end'), null);
eq('anidar subgrafos no se abre',
    parsearFlujo('flowchart LR\n  subgraph A\n    subgraph B\n      x\n    end\n  end'), null);

// ── el nivel «conservo» ─────────────────────────────────────────────────────
const conEstilo = [
    'flowchart LR',
    '  %%{init: {"theme":"dark"}}%%',
    '  %% revisado con el equipo de plataforma',
    '  erp[("Ventas ERP")] --> land["Aterrizaje"]',
    '  classDef origen fill:#1b3a52,stroke:#4a9fd8',
    '  class erp origen',
    '  style land fill:#222',
    '  linkStyle 0 stroke:#888',
    '  click land "modelos/refinado.sql"',
].join('\n');
const g = parsearFlujo(conEstilo);
eq('un diagrama con classDef SE ABRE', g !== null, true);
// Seis, no siete: `class` dejó de ser opaca cuando la fase 4 necesitó poder
// asignar una capa desde la interfaz. Se entiende **qué caja lleva qué clase**;
// lo que no se toca es **qué aspecto tiene esa clase**, que sigue en el
// `classDef` del autor.
eq('y conserva las seis líneas', g.conservado.length, 6);
eq('en orden y verbatim', g.conservado[2], 'classDef origen fill:#1b3a52,stroke:#4a9fd8');
eq('la asignación de clase ya no se conserva: se entiende', g.nodos[0].clases, ['origen']);
eq('el comentario también', g.conservado[1], '%% revisado con el equipo de plataforma');
eq('la directiva init también', g.conservado[0], '%%{init: {"theme":"dark"}}%%');
eq('no se cuelan en los nodos', g.nodos.map(n => n.id), ['erp', 'land']);
const vuelta = flujoAMermaid(g);
for (const linea of g.conservado) {
    eq(`sobrevive · ${linea.slice(0, 22)}…`, vuelta.includes(linea), true);
}
ida('con classDef y click', conEstilo);

// ── lo que NO se abre ───────────────────────────────────────────────────────
eq('sequenceDiagram', parsearFlujo('sequenceDiagram\n  A->>B: hola'), null);
eq('stateDiagram', parsearFlujo('stateDiagram-v2\n  [*] --> A'), null);
eq('erDiagram', parsearFlujo('erDiagram\n  A ||--o{ B : x'), null);
eq('gantt', parsearFlujo('gantt\n  title X'), null);
eq('vacío', parsearFlujo(''), null);
eq('nulo', parsearFlujo(null), null);
eq('sólo espacios', parsearFlujo('   \n  \n'), null);
eq('`direction` dentro de un grupo', parsearFlujo('flowchart LR\n  subgraph G\n    direction TB\n    a\n  end'), null);
eq('nodos con `&`', parsearFlujo('flowchart LR\n  a --> b & c'), null);
eq('una flecha que no conocemos', parsearFlujo('flowchart LR\n  a ~~~ b'), null);
eq('basura al final de la línea', parsearFlujo('flowchart LR\n  a --> b ???'), null);
eq('un cerco sin cerrar', parsearFlujo('flowchart LR\n  a["sin cerrar'), null);
eq('una comilla sin cerrar', parsearFlujo('flowchart LR\n  a["sin cerrar]'), null);

// Las tres plantillas que no son de flujo NO se abren, y está bien: no son un
// fallo, son otro tipo de diagrama.
const cuerpoDe = (t) => bloquesCercados(t, ['mermaid'])[0].cuerpo.replace(/\n$/, '');
for (const p of PLANTILLAS_DIAGRAMA) {
    const cuerpo = cuerpoDe(p.texto);
    const esFlujo = /^\s*(flowchart|graph)\b/.test(cuerpo);
    eq(`plantilla «${p.label}» ${esFlujo ? 'se abre' : 'no se abre'}`, parsearFlujo(cuerpo) !== null, esFlujo);
    // **Toda plantilla de flujo tiene que estar ya en forma canónica**: si no,
    // insertarla y guardarla produciría un diff de reformateo sin que nadie
    // hubiera tocado nada.
    if (esFlujo) eq(`  y en forma canónica · ${p.id}`, flujoAMermaid(parsearFlujo(cuerpo)), cuerpo);
}
// Las de arquitectura llevan sus capas ya definidas, que es lo primero que hace
// este público. Se comprueba que la asignación sobrevive el ida y vuelta.
const capas = parsearFlujo(cuerpoDe(PLANTILLAS_DIAGRAMA.find(p => p.id === 'capas').texto));
eq('la plantilla por capas trae tres capas', capas.conservado.filter(l => l.startsWith('classDef')).length, 3);
eq('y las cajas asignadas', capas.nodos.filter(n => n.clases.length).length, 4);
eq('con sus tres zonas', capas.subgrafos.map(s => s.titulo), ['Aterrizaje', 'Refinado', 'Consumo']);

// ── forma canónica ──────────────────────────────────────────────────────────
eq('el nodo se declara donde aparece por primera vez',
    flujoAMermaid(parsearFlujo('flowchart LR\n  a["A"] --> b["B"]\n  a --> c["C"]')),
    'flowchart LR\n  a["A"] --> b["B"]\n  a ==> c["C"]'.replace('==>', '-->'));
eq('los del subgrafo se declaran dentro',
    flujoAMermaid(parsearFlujo('flowchart LR\n  subgraph G\n    a["A"]\n  end\n  a --> b["B"]')),
    'flowchart LR\n  subgraph G["G"]\n    a["A"]\n  end\n  a --> b["B"]');
// Al final, no al principio: añadir una caja que todavía no has conectado no
// debería desplazar todas las líneas del flujo en el control de versiones.
eq('un nodo suelto sin aristas se declara al final',
    flujoAMermaid(parsearFlujo('flowchart LR\n  a["A"] --> b["B"]\n  z["Suelto"]')),
    'flowchart LR\n  a["A"] --> b["B"]\n  z["Suelto"]');
eq('un grafo vacío sigue siendo un diagrama', flujoAMermaid(flujoVacio('TB')), 'flowchart TB');
eq('flujoVacio está vacío de verdad', flujoVacio().nodos.length + flujoVacio().aristas.length, 0);
eq('serializar nada', flujoAMermaid(null), '');

// ── identificadores ─────────────────────────────────────────────────────────
eq('un id legible', idLibre('Ventas ERP', []), 'ventas_erp');
eq('sin acentos', idLibre('Extracción diaria', []), 'extraccion_diaria');
eq('sin símbolos', idLibre('¿Calidad?', []), 'calidad');
eq('no empieza por número', idLibre('3 fuentes', []), 'n_3_fuentes');
eq('vacío tiene arreglo', idLibre('', []), 'n');
eq('si está tomado, numera', idLibre('Ventas', ['ventas']), 'ventas_2');
eq('y sigue numerando', idLibre('Ventas', ['ventas', 'ventas_2']), 'ventas_3');
eq('acepta un Set', idLibre('Ventas', new Set(['ventas'])), 'ventas_2');
// Dos etiquetas distintas no pueden colapsar en el mismo id: es lo que dejaría
// dos cajas del dibujo pegadas en una sola al guardar.
const usados = new Set();
const a1 = idLibre('Zona: aterrizaje', usados); usados.add(a1);
const a2 = idLibre('Zona aterrizaje', usados); usados.add(a2);
eq('dos etiquetas parecidas dan ids distintos', a1 !== a2, true);

// ── cabos sueltos ───────────────────────────────────────────────────────────
const conCabos = parsearFlujo([
    'flowchart LR',
    '  subgraph vacio["Consumo"]',
    '  end',
    '  a["Ingesta"] --> b["Refinado"]',
    '  z["Huérfana"]',
    '  y["Refinado"]',
].join('\n'));
const cabos = cabosSueltos(conCabos);
eq('encuentra la huérfana', cabos.some(c => c.tipo === 'suelto' && c.id === 'z'), true);
eq('el grupo vacío', cabos.some(c => c.tipo === 'grupo-vacio' && c.id === 'vacio'), true);
eq('la etiqueta repetida', cabos.some(c => c.tipo === 'repetida' && c.id === 'y'), true);
// `y` dispara DOS avisos: está suelta y además repite la etiqueta de `b`. Son
// dos cosas distintas que arreglar, así que se dicen las dos.
eq('la huérfana repetida cuenta por partida doble', cabos.filter(c => c.id === 'y').length, 2);
eq('y no se inventa nada más', cabos.length, 4);
eq('un diagrama sano no tiene cabos',
    cabosSueltos(parsearFlujo('flowchart LR\n  a["A"] --> b["B"]')), []);
eq('sin grafo, sin avisos', cabosSueltos(null), []);

// ── bloques cercados ────────────────────────────────────────────────────────
const doc = [
    '# Arquitectura',
    '',
    'Texto de antes.',
    '',
    `${F}mermaid`,
    'flowchart LR',
    '  a --> b',
    F,
    '',
    'Texto de en medio.',
    '',
    `${F}sql`,
    'SELECT 1',
    F,
    '',
    `${F}mermaid`,
    'flowchart TB',
    '  x --> y',
    F,
    '',
    'Texto de después.',
].join('\n');

eq('encuentra los dos mermaid', bloquesCercados(doc, ['mermaid']).length, 2);
eq('sin filtro, los tres', bloquesCercados(doc).length, 3);
eq('en orden', bloquesCercados(doc, ['mermaid']).map(b => b.cuerpo.trim().split('\n')[0]),
    ['flowchart LR', 'flowchart TB']);
eq('el del cursor', cercadoEnCursor(doc, doc.indexOf('a --> b'), ['mermaid'])?.cuerpo.includes('a --> b'), true);
eq('fuera de todo bloque, nada', cercadoEnCursor(doc, doc.indexOf('Texto de en medio'), ['mermaid']), null);
eq('en el bloque sql, con filtro mermaid, nada', cercadoEnCursor(doc, doc.indexOf('SELECT 1'), ['mermaid']), null);
eq('sin bloques, lista vacía', bloquesCercados('sólo texto'), []);
eq('un bloque sin cerrar no se come el resto',
    bloquesCercados(`${F}mermaid\nflowchart LR\n\nTexto suelto`, ['mermaid']), []);

// **La garantía**: reescribir un bloque no toca ni un carácter de lo demás.
const bloque2 = bloquesCercados(doc, ['mermaid'])[1];
const docNuevo = reemplazarCercado(doc, bloque2, 'flowchart RL\n  x --> y');
eq('el bloque cambió', bloquesCercados(docNuevo, ['mermaid'])[1].cuerpo.trim(), 'flowchart RL\n  x --> y');
eq('el primer bloque no', bloquesCercados(docNuevo, ['mermaid'])[0].cuerpo, bloquesCercados(doc, ['mermaid'])[0].cuerpo);
eq('el bloque sql no', bloquesCercados(docNuevo)[1].cuerpo, 'SELECT 1\n');
eq('lo de antes del bloque, intacto', docNuevo.slice(0, bloque2.desde), doc.slice(0, bloque2.desde));
eq('lo de después, intacto', docNuevo.slice(docNuevo.indexOf('Texto de después')), 'Texto de después.');
eq('el resto del documento, byte a byte',
    docNuevo.replace(/flowchart RL\n {2}x --> y/, 'flowchart TB\n  x --> y'), doc);

// CRLF, que es como llegan los archivos en Windows.
const conCrlf = `${F}mermaid\r\nflowchart LR\r\n  a --> b\r\n${F}`;
eq('CRLF: se encuentra el bloque', bloquesCercados(conCrlf, ['mermaid']).length, 1);
eq('CRLF: y se parsea', parsearFlujo(bloquesCercados(conCrlf, ['mermaid'])[0].cuerpo)?.aristas.length, 1);

// ── el puente desde una chain ───────────────────────────────────────────────
const chain = {
    nodes: [
        { id: 'n-1', type: 'import_file', label: 'Ventas 2024.csv' },
        { id: 'n-2', type: 'sql_inline', label: 'Limpieza' },
        { id: 'n-3', type: 'assert', label: '¿Sin nulos?' },
        { id: 'n-4', type: 'export_file', label: 'salida.parquet', disabled: true },
        { id: 'n-5', type: 'checkpoint', label: 'Guardado' },
        { id: 'n-6', type: 'table_ref', label: 'Suelto' },
    ],
    edges: [
        { source: 'n-1', target: 'n-2' },
        { source: 'n-2', target: 'n-3' },
        { source: 'n-3', target: 'n-4', label: 'pasa' },
        { source: 'n-4', target: 'n-5' },
        { source: 'n-9', target: 'n-1' },
    ],
};
const bloqueChain = chainAMermaid(chain);
eq('la chain produce un bloque', bloqueChain.startsWith(`${F}mermaid\n`), true);
const cuerpoChain = bloquesCercados(bloqueChain, ['mermaid'])[0].cuerpo.replace(/\n$/, '');
const gChain = parsearFlujo(cuerpoChain);
eq('y el bloque se vuelve a leer', gChain !== null, true);
eq('con los seis nodos', gChain.nodos.length, 6);
eq('las formas por tipo', gChain.nodos.map(n => n.forma),
    ['almacen', 'proceso', 'decision', 'salida', 'hito', 'almacen']);
eq('cuatro aristas: la del nodo fantasma se descarta', gChain.aristas.length, 4);
eq('la etiqueta de la arista', gChain.aristas[2].etiqueta, 'pasa');
eq('el nodo apagado se marca', gChain.nodos[3].texto.endsWith(' ·off·'), true);
eq('el nodo suelto sigue estando', gChain.nodos.some(n => n.texto === 'Suelto'), true);
eq('los identificadores son legibles', gChain.nodos[0].id, 'n_1');
eq('una chain vacía no produce nada', chainAMermaid({ nodes: [] }), null);
eq('ni una chain sin nodos', chainAMermaid(null), null);
ida('desde una chain', cuerpoChain);

// Una etiqueta con paréntesis solía perderse: el saneador viejo los borraba.
// Ahora la etiqueta va entrecomillada y el paréntesis sobrevive.
const conParentesis = chainAMermaid({
    nodes: [{ id: 'a', type: 'sql_inline', label: 'Ventas (netas)' }], edges: [],
});
eq('los paréntesis de una etiqueta sobreviven',
    parsearFlujo(bloquesCercados(conParentesis, ['mermaid'])[0].cuerpo).nodos[0].texto, 'Ventas (netas)');

// ── el diagrama del contrato visual, entero ─────────────────────────────────
ida('la arquitectura del mockup', [
    'flowchart LR',
    '  subgraph G1["Origen"]',
    '    erp[("Ventas ERP")]',
    '    web[("Eventos web")]',
    '  end',
    '  erp --> land["Aterrizaje"]',
    '  web -.-> land',
    '  land --> qa{"¿Calidad?"}',
    '  qa -->|pasa| ref["Refinado"]',
    '  qa -->|falla| cua[/"Cuarentena"/]',
    '  ref ==> alm[("Almacén")]',
    '  alm --> tab(("Tablero"))',
    '  classDef origen fill:#1b3a52,stroke:#4a9fd8',
    '  class erp,web origen',
    '  click ref "modelos/refinado.sql"',
    '  %% revisado con el equipo de plataforma',
].join('\n'));

// ── por qué no se abre ──────────────────────────────────────────────────────
// La diferencia que vigila este bloque: un `sequenceDiagram` **no es un fallo**
// —es otro tipo de diagrama, y ahí lo correcto es callarse— mientras que un
// flowchart con una línea rara sí es algo que el usuario esperaba poder abrir.
eq('un flujo bueno no tiene motivo', porQueNoSeAbre('flowchart LR\n  a --> b'), null);

const noAbre = (texto) => porQueNoSeAbre(texto);
eq('otro tipo de diagrama es esperado', noAbre('sequenceDiagram\n  A->>B: x').esperado, true);
eq('y un archivo vacío también', noAbre('').esperado, true);
// Los demás sí son avisos, y llevan la línea.
eq('grupos anidados: aviso', noAbre('flowchart LR\n  subgraph A\n    subgraph B\n      x\n    end\n  end').esperado, false);
eq('y señala la línea del anidamiento', noAbre('flowchart LR\n  subgraph A\n    subgraph B\n      x\n    end\n  end').linea, 3);
eq('una línea que no se entiende', noAbre('flowchart LR\n  a --> b\n  c ~~~ d').linea, 3);
eq('nodos con &', noAbre('flowchart LR\n  a --> b & c').motivo, 'ampersand');
eq('una dirección inventada', noAbre('flowchart XY\n  a --> b').motivo, 'direccion');
eq('un grupo sin cerrar', noAbre('flowchart LR\n  subgraph G\n    a').motivo, 'grupo-sin-cerrar');
eq('un end de más', noAbre('flowchart LR\n  a\n  end').motivo, 'end-de-mas');
eq('`direction` dentro de un grupo',
    noAbre('flowchart LR\n  subgraph G\n    direction TB\n    a\n  end').motivo, 'direccion_grupo');
// Todo motivo tiene texto para el usuario: si no, el aviso diría un nombre en
// clave y quien lo lea seguiría sin saber qué mirar.
for (const motivo of Object.keys(MOTIVOS_FLUJO)) {
    eq(`  con texto · ${motivo}`, typeof MOTIVOS_FLUJO[motivo] === 'string' && MOTIVOS_FLUJO[motivo].length > 8, true);
}
// Y el diagnóstico NO puede discrepar del parser: si dice que no se abre, no se
// abre; si calla, se abre. Son la misma pasada, y esto lo vigila.
for (const caso of [
    'flowchart LR\n  a --> b', 'sequenceDiagram\n  A->>B: x', '',
    'flowchart LR\n  a --> b & c', 'flowchart LR\n  subgraph G\n    a',
    'flowchart TB\n  a["A"]\n  classDef x fill:#111',
]) {
    eq(`el diagnóstico concuerda con el parser · ${caso.slice(0, 18)}…`,
        porQueNoSeAbre(caso) === null, parsearFlujo(caso) !== null);
}

console.log(`\n${ok} bien, ${mal} mal`);
process.exit(mal ? 1 : 0);
