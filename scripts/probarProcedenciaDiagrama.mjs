/**
 * Ejercita `diagram/diagramMerge.js` — devolver un diagrama a su documento.
 *
 *     node scripts/probarProcedenciaDiagrama.mjs
 *
 * Aquí se vigila lo único que este editor no puede permitirse: **escribir
 * encima del trabajo de otro sin avisar.** Todo lo demás se deshace; esto no.
 *
 * Los casos importantes no son los felices. Son: que muevan el bloque, que lo
 * editen a mano, que inserten otro antes, que haya dos idénticos, y que el
 * documento llegue con saltos de línea de Windows.
 */
import {
    localizarBloque, fusionar, procedenciaDe, envoltorio, indicePorLinea, MOTIVOS,
} from '../client/src/components/diagram/diagramMerge.js';
import { bloquesCercados } from '../client/src/components/markdown/fencedBlocks.js';

let ok = 0, mal = 0;
const eq = (nombre, a, b) => {
    const pasa = JSON.stringify(a) === JSON.stringify(b);
    if (pasa) { ok++; } else { mal++; console.log(`  FALLA  ${nombre}\n    esperado: ${JSON.stringify(b)}\n    obtenido: ${JSON.stringify(a)}`); }
};
const F = '```';

const A = 'flowchart LR\n  a["A"] --> b["B"]';
const B = 'flowchart TB\n  x["X"] --> y["Y"]';

const doc = [
    '# Arquitectura',
    '',
    'Las ventas llegan una vez al día.',
    '',
    `${F}mermaid`,
    A,
    F,
    '',
    '## Otra sección',
    '',
    `${F}sql`,
    'SELECT 1',
    F,
    '',
    `${F}mermaid`,
    B,
    F,
    '',
    'Texto del final.',
].join('\n');

const proc0 = procedenciaDe('arquitectura.md', 0, A);
const proc1 = procedenciaDe('arquitectura.md', 1, B);

// ── el caso normal ──────────────────────────────────────────────────────────
eq('encuentra el primero', localizarBloque(doc, proc0).bloque.cuerpo.trim(), A);
eq('y el segundo', localizarBloque(doc, proc1).bloque.cuerpo.trim(), B);
eq('sin moverse', localizarBloque(doc, proc0).movido, false);

const r = fusionar(doc, proc0, 'flowchart LR\n  a["A"] --> c["C"]');
eq('fusiona', r.ok, true);
eq('el bloque cambió', bloquesCercados(r.contenido, ['mermaid'])[0].cuerpo.trim(), 'flowchart LR\n  a["A"] --> c["C"]');
// **La garantía de la que depende todo.**
eq('el otro diagrama, intacto', bloquesCercados(r.contenido, ['mermaid'])[1].cuerpo, bloquesCercados(doc, ['mermaid'])[1].cuerpo);
eq('el bloque sql, intacto', bloquesCercados(r.contenido)[1].cuerpo, 'SELECT 1\n');
eq('la prosa de antes, intacta', r.contenido.startsWith('# Arquitectura\n\nLas ventas llegan una vez al día.'), true);
eq('la del final, intacta', r.contenido.endsWith('Texto del final.'), true);
eq('y el resto byte a byte', r.contenido.replace('c["C"]', 'b["B"]'), doc);

// ── lo movieron ─────────────────────────────────────────────────────────────
// Alguien insertó un diagrama nuevo ANTES: la posición ya no vale, pero el
// texto sí. Un bloque movido sigue siendo el mismo bloque.
const conUnoDelante = doc.replace('# Arquitectura', `# Arquitectura\n\n${F}mermaid\nflowchart LR\n  z["Z"]\n${F}`);
const movido = localizarBloque(conUnoDelante, proc0);
eq('lo reconoce aunque haya cambiado de sitio', movido.bloque?.cuerpo.trim(), A);
eq('y lo dice', movido.movido, true);
const rm = fusionar(conUnoDelante, proc0, 'flowchart LR\n  a["A"]');
eq('y escribe donde está ahora, no donde estaba', rm.ok, true);
eq('el intruso no se toca', bloquesCercados(rm.contenido, ['mermaid'])[0].cuerpo.trim(), 'flowchart LR\n  z["Z"]');
eq('y el nuestro sí', bloquesCercados(rm.contenido, ['mermaid'])[1].cuerpo.trim(), 'flowchart LR\n  a["A"]');

// ── lo cambiaron debajo ─────────────────────────────────────────────────────
const tocado = doc.replace(A, 'flowchart LR\n  a["A"] --> b["B otro"]');
eq('detecta que no es el mismo', localizarBloque(tocado, proc0).motivo, 'cambiado');
eq('y devuelve lo que hay ahora', localizarBloque(tocado, proc0).actual.trim(), 'flowchart LR\n  a["A"] --> b["B otro"]');
const rc = fusionar(tocado, proc0, 'lo que sea');
eq('no fusiona', rc.ok, false);
eq('con motivo', rc.motivo, 'cambiado');
eq('y el motivo tiene texto para el usuario', typeof MOTIVOS[rc.motivo], 'string');
// **Y no escribe nada.** El documento no se toca hasta que alguien decide.
eq('el documento no se tocó', tocado.includes('B otro'), true);

// Forzando sí escribe, y en la posición guardada.
const rf = fusionar(tocado, proc0, 'flowchart LR\n  nuevo["Nuevo"]', { forzar: true });
eq('forzando escribe', rf.ok, true);
eq('en el sitio guardado', bloquesCercados(rf.contenido, ['mermaid'])[0].cuerpo.trim(), 'flowchart LR\n  nuevo["Nuevo"]');
eq('y el segundo sigue intacto', bloquesCercados(rf.contenido, ['mermaid'])[1].cuerpo.trim(), B);

// ── dos idénticos ───────────────────────────────────────────────────────────
// Con dos copias iguales no hay forma de saber cuál abrió el usuario, y elegir
// una al azar es justo lo que no se puede hacer aquí.
const dosIguales = [`${F}mermaid`, A, F, '', `${F}mermaid`, A, F].join('\n');
eq('con dos idénticos en su sitio, se reconoce el suyo', localizarBloque(dosIguales, proc0).movido, false);
eq('pero si el suyo ya no está, no se adivina',
    localizarBloque(dosIguales, procedenciaDe('x.md', 5, A)).motivo, 'ambiguo');

// ── el documento se quedó sin diagramas ─────────────────────────────────────
eq('sin bloques', localizarBloque('# Sólo texto', proc0).motivo, 'sin-bloques');
eq('fusionar tampoco', fusionar('# Sólo texto', proc0, 'x').motivo, 'sin-bloques');
eq('y forzando tampoco inventa uno', fusionar('# Sólo texto', proc0, 'x', { forzar: true }).ok, false);

// ── CRLF ────────────────────────────────────────────────────────────────────
// En Windows el archivo llega con retorno de carro, y eso NO es un cambio.
const conCrlf = doc.replace(/\n/g, '\r\n');
eq('los saltos de Windows no cuentan como cambio', localizarBloque(conCrlf, proc0).motivo, undefined);
eq('y se reconoce el bloque', localizarBloque(conCrlf, proc0).bloque !== undefined, true);
// Un espacio final tampoco: el editor recorta al escribir.
eq('un espacio al final tampoco', localizarBloque(doc, procedenciaDe('x.md', 0, `${A}\n  `)).motivo, undefined);

// ── el envoltorio de la pestaña ─────────────────────────────────────────────
eq('envuelve en un bloque', envoltorio(A), `${F}mermaid\n${A}\n${F}\n`);
eq('sin duplicar el salto final', envoltorio(`${A}\n`), `${F}mermaid\n${A}\n${F}\n`);
eq('y se vuelve a leer', bloquesCercados(envoltorio(A), ['mermaid'])[0].cuerpo.trim(), A);

// ── de la línea al índice ───────────────────────────────────────────────────
// La vista previa sabe de qué LÍNEA sale cada bloque; el editor necesita saber
// cuál de los diagramas es.
const lineaDe = (texto) => doc.slice(0, doc.indexOf(texto)).split('\n').length;
eq('la línea del primero da el índice 0', indicePorLinea(doc, lineaDe(A)), 0);
eq('la del segundo da el 1', indicePorLinea(doc, lineaDe(B)), 1);
eq('sin línea, el primero', indicePorLinea(doc, 0), 0);
eq('una línea absurda cae en el más cercano', indicePorLinea(doc, 9999), 1);
eq('sin bloques, cero', indicePorLinea('# nada', 3), 0);

console.log(`\n${ok} bien, ${mal} mal`);
process.exit(mal ? 1 : 0);
